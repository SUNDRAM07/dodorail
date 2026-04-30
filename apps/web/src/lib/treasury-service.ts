/**
 * Merchant treasury orchestration — the decision-making layer between the
 * dashboard / cron and the LP Agent wrapper.
 *
 * Responsibilities (per file 17 §12 "DodoRail fit — treasury yield extension"):
 *   1. Read merchant idle USDC balance + threshold + chosen pool
 *   2. Decide whether a zap-in is warranted (balance > threshold AND yield enabled)
 *   3. Build a zap-in plan against the LP Agent API (mock-mode safe)
 *   4. Record the resulting TreasuryPosition row + emit YIELD_ZAP_IN event
 *   5. Surface portfolio metrics for the dashboard (positions, APR, fees, PnL)
 *
 * Why this lives here (not in the wrapper):
 *   - The wrapper is integration-isolated — no Prisma, no business logic
 *   - This file stitches the wrapper to the merchant + Prisma + analytics
 *     layers. Moving it into the wrapper would break the isolation contract
 *     (see packages/integrations/README.md).
 *
 * Mock-mode behaviour:
 *   - `evaluateMerchantTreasury` returns a deterministic plan regardless of
 *     real on-chain balance (we don't have an indexer in the loop yet —
 *     Day 13's Treasury Agent wires Zerion / Sim API for the real thing).
 *   - `executeZapIn` writes a TreasuryPosition row with mock-mode flags so
 *     the dashboard yield card renders end-to-end for the demo.
 */

import { prisma } from "@dodorail/db";
import { createLpAgentClient, CURATED_POOLS } from "@dodorail/lpagent";
import type { LpAgentClient, LpPosition, LpPositionMetrics } from "@dodorail/lpagent";

import { track } from "@/lib/analytics";

export type TreasuryDecision =
  | {
      action: "deploy";
      poolId: string;
      poolLabel: string;
      amountUsdcCents: number;
      reason: string;
    }
  | {
      action: "skip";
      reason: string;
    };

export interface MerchantTreasuryView {
  yieldEnabled: boolean;
  thresholdCents: number;
  selectedPoolId: string;
  /** What the dashboard shows under "Treasury Vault" — null if no positions. */
  metrics: LpPositionMetrics | null;
  positions: LpPosition[];
  /** Surfaced for the UI to know if the merchant is allowed to zap-in
   * right now. Computed identically to the cron path. */
  decision: TreasuryDecision;
}

/** Read the env-keyed LP Agent client. Built per-call so the caller can
 * override (tests). Wraps `createLpAgentClient` to keep the env-read in one
 * place. */
export function getLpAgentClient(): LpAgentClient {
  const apiKey = process.env.DODORAIL_LPAGENT_KEY;
  return createLpAgentClient({
    apiKey,
    mode: apiKey ? "live" : "mock",
  });
}

/** Pure decision function — given a balance + threshold + enabled flag,
 * what should the cron / UI do? Tested without prisma/network. */
export function decideTreasuryAction(input: {
  yieldEnabled: boolean;
  idleBalanceUsdcCents: number;
  thresholdCents: number;
  selectedPoolId: string;
}): TreasuryDecision {
  if (!input.yieldEnabled) {
    return { action: "skip", reason: "yield disabled by merchant" };
  }
  if (input.idleBalanceUsdcCents <= input.thresholdCents) {
    return {
      action: "skip",
      reason: `idle balance $${(input.idleBalanceUsdcCents / 100).toFixed(2)} ≤ threshold $${(input.thresholdCents / 100).toFixed(2)}`,
    };
  }
  const excess = input.idleBalanceUsdcCents - input.thresholdCents;
  const pool = CURATED_POOLS.find((p) => p.id === input.selectedPoolId) ?? CURATED_POOLS[0]!;
  return {
    action: "deploy",
    poolId: pool.id,
    poolLabel: pool.label,
    amountUsdcCents: excess,
    reason: `deploy excess of $${(excess / 100).toFixed(2)} above $${(input.thresholdCents / 100).toFixed(2)} threshold into ${pool.label}`,
  };
}

/** Read merchant settings, current balance, current LP positions, and assemble
 * the dashboard's "Treasury Vault" view in a single round-trip helper. */
export async function getMerchantTreasuryView(input: {
  merchantId: string;
}): Promise<MerchantTreasuryView> {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: input.merchantId },
    select: {
      yieldEnabled: true,
      yieldThresholdCents: true,
      yieldProvider: true,
      solanaWalletAddress: true,
    },
  });

  const lp = getLpAgentClient();

  // Pool selection lives in metadata for now (avoids a schema migration on
  // Day 11). The merchant's "selected pool" is read from the env-shipped
  // default OR the most recent open TreasuryPosition row, whichever exists.
  // When the merchant explicitly picks a pool from the settings UI, we write
  // it as a no-op TreasuryPosition row so the lookup picks it up. Day 12 will
  // promote this to a proper Merchant.lpAgentSelectedPool column.
  const lastPosition = await prisma.treasuryPosition.findFirst({
    where: { merchantId: input.merchantId, protocol: "LP_AGENT_METEORA" },
    orderBy: { createdAt: "desc" },
    select: { poolId: true },
  });
  const selectedPoolId = lastPosition?.poolId ?? CURATED_POOLS[0]!.id;

  // Live position read against LP Agent — mock mode populates a single
  // demo position so the UI has something to render.
  const positions = await lp.getOpenPositions(merchant.solanaWalletAddress);
  const metrics = positions.length
    ? await lp.getPositionMetrics(merchant.solanaWalletAddress)
    : null;

  // For the "decide whether the merchant can zap-in right now" preview, we
  // need an idle-balance number. In mock mode that's a sensible synthesised
  // value (so the UI can show what would happen). In live mode this needs
  // the on-chain SPL balance — Day 13's Treasury Agent fills that in via
  // Zerion/Sim. For Day 11 we synthesise a plausible balance to drive the UI.
  const idleBalanceUsdcCents = mockIdleBalanceFor(input.merchantId);

  const decision = decideTreasuryAction({
    yieldEnabled: merchant.yieldEnabled,
    idleBalanceUsdcCents,
    thresholdCents: merchant.yieldThresholdCents,
    selectedPoolId,
  });

  return {
    yieldEnabled: merchant.yieldEnabled,
    thresholdCents: merchant.yieldThresholdCents,
    selectedPoolId,
    metrics,
    positions,
    decision,
  };
}

/** Deterministic-but-merchant-specific "idle balance" for the demo. Driven by
 * the merchant id hash so each merchant sees a stable number across loads.
 * Always above the default $500 threshold so the demo path shows the
 * "yield-eligible" state. */
function mockIdleBalanceFor(merchantId: string): number {
  let h = 0;
  for (let i = 0; i < merchantId.length; i++) {
    h = (h * 31 + merchantId.charCodeAt(i)) | 0;
  }
  // Range $750 - $4,250 in cents — deliberately above $500 default threshold.
  const cents = 75_000 + Math.abs(h % 350_000);
  return cents;
}

/** Execute a zap-in — called from the settings "Deploy now" button or the
 * Day 12 cron. Records a TreasuryPosition row, emits a YIELD_ZAP_IN event,
 * and returns the wrapper result. Mock mode is fully safe to run. */
export async function executeZapIn(input: {
  merchantId: string;
  poolId: string;
  amountUsdcCents: number;
}): Promise<{
  positionId: string;
  txSig: string;
  poolId: string;
  amountUsdcCents: number;
}> {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: input.merchantId },
    select: { solanaWalletAddress: true },
  });

  const lp = getLpAgentClient();

  // 1. Quote (live mode hits the real /zap-in; mock returns a placeholder)
  const quote = await lp.quoteZapIn({
    poolId: input.poolId,
    amountUsdcCents: input.amountUsdcCents,
    wallet: merchant.solanaWalletAddress,
  });

  // 2. In live mode the merchant would sign `quote.transactionB64` here.
  // For mock mode the wrapper synthesises the result. Day 12's cron will
  // run the live path with a server-held signing key once we wire
  // delegated authority via Squads (Day 16).
  const result = await lp.submitZapIn({
    poolId: input.poolId,
    amountUsdcCents: input.amountUsdcCents,
    wallet: merchant.solanaWalletAddress,
    signedTransactionB64: quote.transactionB64,
  });

  // 3. Record the position in Prisma so the dashboard / metrics paths see it.
  // depositedAmount + currentValue stored as smallest-unit USDC strings (USDC
  // has 6 decimals — we store cents * 10_000 to match the base-unit shape
  // expected downstream).
  const baseUnits = String(BigInt(input.amountUsdcCents) * 10_000n);
  await prisma.treasuryPosition.create({
    data: {
      merchantId: input.merchantId,
      protocol: "LP_AGENT_METEORA",
      poolId: input.poolId,
      depositedAmount: baseUnits,
      currentValue: baseUnits,
      pnlCents: 0,
      apr: 0,
      status: "OPEN",
    },
  });

  // 4. Emit the lifecycle event — picked up by the Dune analytics surface.
  await prisma.event.create({
    data: {
      merchantId: input.merchantId,
      type: "YIELD_ZAP_IN",
      payload: {
        positionId: result.positionId,
        poolId: input.poolId,
        amountUsdcCents: input.amountUsdcCents,
        txSig: result.txSig,
        source: lp.mode,
      },
    },
  });

  track("yield_zap_in", input.merchantId, {
    poolId: input.poolId,
    amountUsdcCents: input.amountUsdcCents,
    source: lp.mode,
  });

  return result;
}

/** Execute a zap-out for a single position. Used by the dashboard's
 * "Withdraw" button. Mark the TreasuryPosition CLOSED + emit YIELD_ZAP_OUT. */
export async function executeZapOut(input: {
  merchantId: string;
  positionId: string;
}): Promise<{
  positionId: string;
  txSig: string;
  receivedUsdcCents: number;
}> {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: input.merchantId },
    select: { solanaWalletAddress: true },
  });

  const lp = getLpAgentClient();

  const quote = await lp.getZapOutQuote({
    positionId: input.positionId,
    wallet: merchant.solanaWalletAddress,
  });

  const result = await lp.submitZapOut({
    positionId: input.positionId,
    wallet: merchant.solanaWalletAddress,
    signedTransactionB64: quote.transactionB64,
  });

  // Look up the open Prisma row matching this position's pool, mark closed.
  // (We don't store the LP Agent position id directly — Day 12 will add a
  // `lpAgentPositionId` column. For now we close the most recent OPEN row.)
  const position = await prisma.treasuryPosition.findFirst({
    where: {
      merchantId: input.merchantId,
      protocol: "LP_AGENT_METEORA",
      status: "OPEN",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (position) {
    await prisma.treasuryPosition.update({
      where: { id: position.id },
      data: {
        status: "CLOSED",
        currentValue: String(BigInt(result.receivedUsdcCents) * 10_000n),
        pnlCents: result.receivedUsdcCents,
      },
    });
  }

  await prisma.event.create({
    data: {
      merchantId: input.merchantId,
      type: "YIELD_ZAP_OUT",
      payload: {
        positionId: result.positionId,
        receivedUsdcCents: result.receivedUsdcCents,
        txSig: result.txSig,
        source: lp.mode,
      },
    },
  });

  track("yield_zap_out", input.merchantId, {
    positionId: result.positionId,
    receivedUsdcCents: result.receivedUsdcCents,
    source: lp.mode,
  });

  return result;
}
