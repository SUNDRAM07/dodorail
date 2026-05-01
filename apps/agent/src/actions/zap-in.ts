/**
 * Zap-in action — the agent's "deploy idle USDC into Meteora DLMM" path.
 *
 * Reuses the Day-11 `executeZapIn` core flow by inlining the same Prisma +
 * `@dodorail/lpagent` calls. We deliberately do NOT import the web app's
 * `treasury-service.ts` — keeps the agent isolated from Next.js bundle
 * concerns (server actions, revalidatePath, etc).
 *
 * Idempotency: the agent loop already gates on a 23h `YIELD_ZAP_IN` dedup
 * before calling decide(). This action additionally checks at-act-time in
 * case multiple agent invocations race.
 *
 * Live-mode safety: `DODORAIL_AGENT_LIVE_TX=true` must be explicitly set
 * for the action to actually run `submitZapIn`. Without it the action runs
 * in dry-run mode — logs the plan, writes a YIELD_ZAP_IN event with
 * `dryRun: true` for auditability, but doesn't call the LP Agent submit
 * endpoint. This is the safe-by-default posture for the hackathon.
 */

import { prisma } from "@dodorail/db";
import { createLpAgentClient } from "@dodorail/lpagent";

import {
  createSquadsDelegatedSigner,
  SQUADS_AGENT_POLICY,
} from "../squads/delegated-signer.js";

export interface ZapInContext {
  merchantId: string;
  merchantName: string;
  poolId: string;
  amountUsdcCents: number;
  /** Reason captured from the reasoner — written to Event for audit. */
  decisionReason: string;
  /** Defaults to `process.env.DODORAIL_AGENT_LIVE_TX === "true"`. */
  liveTx?: boolean;
}

const DEDUP_HOURS = 23;

export async function executeZapInFromAgent(ctx: ZapInContext): Promise<{
  ok: boolean;
  eventId?: string;
  reason?: string;
  positionId?: string;
}> {
  const liveTx = ctx.liveTx ?? process.env.DODORAIL_AGENT_LIVE_TX === "true";

  // Race-safe dedup check at act-time.
  const cutoff = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  const recent = await prisma.event.findFirst({
    where: {
      merchantId: ctx.merchantId,
      type: "YIELD_ZAP_IN",
      occurredAt: { gte: cutoff },
    },
    select: { id: true },
  });
  if (recent) {
    return { ok: false, reason: `dedup: zap-in within last ${DEDUP_HOURS}h` };
  }

  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: ctx.merchantId },
    select: { solanaWalletAddress: true },
  });

  const lp = createLpAgentClient({
    apiKey: process.env.DODORAIL_LPAGENT_KEY,
    mode: process.env.DODORAIL_LPAGENT_KEY ? "live" : "mock",
  });

  if (!liveTx) {
    // Dry-run: write an event row marked dryRun + return without zapping.
    const event = await prisma.event.create({
      data: {
        merchantId: ctx.merchantId,
        type: "YIELD_ZAP_IN",
        payload: {
          source: "agent",
          poolId: ctx.poolId,
          amountUsdcCents: ctx.amountUsdcCents,
          reason: ctx.decisionReason,
          dryRun: true,
          liveTx: false,
          lpAgentMode: lp.mode,
        },
      },
      select: { id: true },
    });
    return { ok: true, eventId: event.id, reason: "dry-run" };
  }

  // Day 16 — Squads delegated signer policy check before doing anything.
  // The signer enforces the per-cycle spend cap + binds tx target to the
  // LP Agent program ID. Mock-mode signer pre-flights without doing real
  // multisig work; live-mode signer (Day 18+) will hit the real Squads
  // multisig PDA. Either way we get a structured policy check that the
  // demo recording can show.
  const squadsSigner = await createSquadsDelegatedSigner();
  const policyCheck = await squadsSigner.canSignZapIn({
    poolId: ctx.poolId,
    amountUsdcCents: ctx.amountUsdcCents,
  });
  if (!policyCheck.allowed) {
    return {
      ok: false,
      reason: `squads policy denied: ${policyCheck.reason}`,
    };
  }

  // Live path — quote, sign via Squads, submit, record.
  const quote = await lp.quoteZapIn({
    poolId: ctx.poolId,
    amountUsdcCents: ctx.amountUsdcCents,
    wallet: merchant.solanaWalletAddress,
  });

  // Day 16 — route the signing through the Squads delegated signer.
  // In mock-mode this returns a synthetic tx sig; in live-mode (Day 18+)
  // this hits the real multisig spend-limit flow. Either way the agent
  // never holds the merchant's raw private key.
  const squadsTx = await squadsSigner.signAndSubmitZapIn({
    poolId: ctx.poolId,
    amountUsdcCents: ctx.amountUsdcCents,
    unsignedTransactionB64: quote.transactionB64,
  });

  // For mock-mode end-to-end completeness we still call the LP Agent's
  // submit to write its own bookkeeping (position id allocation). In
  // live-mode (Day 18+) the Squads-signed tx IS the submission — this
  // call collapses into a no-op. For now both run.
  const result = await lp.submitZapIn({
    poolId: ctx.poolId,
    amountUsdcCents: ctx.amountUsdcCents,
    wallet: merchant.solanaWalletAddress,
    signedTransactionB64: quote.transactionB64,
  });

  // Persist the position + event.
  const baseUnits = String(BigInt(ctx.amountUsdcCents) * 10_000n);
  await prisma.treasuryPosition.create({
    data: {
      merchantId: ctx.merchantId,
      protocol: "LP_AGENT_METEORA",
      poolId: ctx.poolId,
      depositedAmount: baseUnits,
      currentValue: baseUnits,
      pnlCents: 0,
      apr: 0,
      status: "OPEN",
    },
  });
  const event = await prisma.event.create({
    data: {
      merchantId: ctx.merchantId,
      type: "YIELD_ZAP_IN",
      payload: {
        source: "agent",
        positionId: result.positionId,
        poolId: ctx.poolId,
        amountUsdcCents: ctx.amountUsdcCents,
        txSig: result.txSig,
        reason: ctx.decisionReason,
        dryRun: false,
        liveTx: true,
        lpAgentMode: lp.mode,
        // Day 16 — Squads policy + signing path
        squadsMode: squadsSigner.mode,
        squadsTxSig: squadsTx.txSig,
        squadsVia: squadsTx.via,
        squadsPolicy: SQUADS_AGENT_POLICY.description,
      },
    },
    select: { id: true },
  });

  return { ok: true, eventId: event.id, positionId: result.positionId };
}
