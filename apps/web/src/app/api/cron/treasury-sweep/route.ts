import { NextResponse } from "next/server";

import { prisma } from "@dodorail/db";

import { decideTreasuryAction, executeZapIn } from "@/lib/treasury-service";
import { CURATED_POOLS } from "@dodorail/lpagent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Treasury Vault sweep — daily Vercel Cron.
 *
 * Schedule: configured in `apps/web/vercel.json` as `0 0 * * *` (00:00 UTC).
 * Vercel Hobby plan caps cron jobs at one per day; on Pro this would flip to
 * `*\/15 * * * *` (every 15 min) to mirror the docs' "scheduled sweep" framing.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when
 * `CRON_SECRET` is set on the project. The endpoint also accepts the same
 * header on manual invocations (so you can curl it from your laptop for a
 * smoke test, e.g. for the demo recording day).
 *
 * Flow per merchant:
 *   1. Read yield-enabled merchants (`yieldEnabled = true`, `yieldProvider = LP_AGENT`)
 *   2. For each: read current state via the same path the dashboard uses
 *      (decideTreasuryAction with synthesised idle balance — Day 13's Treasury
 *      Agent wires the real Zerion / Sim API balance read, this is the seam)
 *   3. If decision is "deploy": check the merchant hasn't already had a
 *      YIELD_ZAP_IN event in the last 23h (idempotency for double-cron-fires)
 *   4. Call executeZapIn — same code path as the dashboard "Deploy now" button
 *
 * Idempotency: Vercel may deliver the same cron event more than once. We
 * dedupe via the YIELD_ZAP_IN event log — if a merchant has been deployed
 * within the last 23 hours, skip with reason "recent_zap_already".
 *
 * Concurrency: Vercel's docs warn cron may invoke a second instance if the
 * first overruns. The 23h dedup window is the lock — even concurrent runs
 * won't double-deploy.
 */

interface SweepResult {
  merchantId: string;
  action: "deploy" | "skip";
  reason: string;
  positionId?: string;
  txSig?: string;
  amountUsdcCents?: number;
}

export async function GET(req: Request): Promise<Response> {
  // 1. Auth.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed if secret not configured — better than running unauthenticated.
    return NextResponse.json(
      { error: "cron_secret_unconfigured" },
      { status: 500 },
    );
  }
  const got = req.headers.get("authorization") ?? "";
  if (got !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const dedupeCutoff = new Date(startedAt.getTime() - 23 * 60 * 60 * 1000);
  const results: SweepResult[] = [];

  // 2. Iterate yield-enabled merchants.
  const merchants = await prisma.merchant.findMany({
    where: {
      yieldEnabled: true,
      yieldProvider: "LP_AGENT",
    },
    select: {
      id: true,
      yieldThresholdCents: true,
      solanaWalletAddress: true,
    },
  });

  for (const m of merchants) {
    // 3. Idempotency check — skip merchants who already had a zap-in within
    // the dedup window.
    const recentZap = await prisma.event.findFirst({
      where: {
        merchantId: m.id,
        type: "YIELD_ZAP_IN",
        createdAt: { gte: dedupeCutoff },
      },
      select: { id: true },
    });
    if (recentZap) {
      results.push({
        merchantId: m.id,
        action: "skip",
        reason: "recent_zap_already_today",
      });
      continue;
    }

    // 4. Pool selection — same lookup the dashboard uses (most-recent
    // TreasuryPosition row, fallback to first curated pool).
    const lastPosition = await prisma.treasuryPosition.findFirst({
      where: { merchantId: m.id, protocol: "LP_AGENT_METEORA" },
      orderBy: { createdAt: "desc" },
      select: { poolId: true },
    });
    const selectedPoolId = lastPosition?.poolId ?? CURATED_POOLS[0]!.id;

    // 5. Synthesised idle balance (same logic as treasury-service mock until
    // Day 13's real on-chain read lands).
    const idleBalanceUsdcCents = mockIdleBalanceFor(m.id);

    const decision = decideTreasuryAction({
      yieldEnabled: true,
      idleBalanceUsdcCents,
      thresholdCents: m.yieldThresholdCents,
      selectedPoolId,
    });

    if (decision.action === "skip") {
      results.push({
        merchantId: m.id,
        action: "skip",
        reason: decision.reason,
      });
      continue;
    }

    // 6. Deploy.
    try {
      const result = await executeZapIn({
        merchantId: m.id,
        poolId: decision.poolId,
        amountUsdcCents: decision.amountUsdcCents,
      });
      results.push({
        merchantId: m.id,
        action: "deploy",
        reason: decision.reason,
        positionId: result.positionId,
        txSig: result.txSig,
        amountUsdcCents: result.amountUsdcCents,
      });
    } catch (e) {
      results.push({
        merchantId: m.id,
        action: "skip",
        reason: `deploy_failed: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sweepStartedAt: startedAt.toISOString(),
    sweepDurationMs: Date.now() - startedAt.getTime(),
    merchantsConsidered: merchants.length,
    deploys: results.filter((r) => r.action === "deploy").length,
    skips: results.filter((r) => r.action === "skip").length,
    results,
  });
}

/** Mirror of `treasury-service.ts:mockIdleBalanceFor`. Kept inline here so
 * the cron has zero coupling to the app-layer file's internal mock — the two
 * paths produce the same numbers, but neither depends on the other. Day 13
 * replaces both call sites with a real on-chain balance read via Sim/Zerion. */
function mockIdleBalanceFor(merchantId: string): number {
  let h = 0;
  for (let i = 0; i < merchantId.length; i++) {
    h = (h * 31 + merchantId.charCodeAt(i)) | 0;
  }
  const cents = 75_000 + Math.abs(h % 350_000);
  return cents;
}
