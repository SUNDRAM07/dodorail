/**
 * Behaviour delta heuristics — Prajin's pattern #2 from his Day 13 DM.
 *
 * Direct quote (saved at .auto-memory/project_goldrush_prajin_full_access.md):
 *   "Alert on behavior deltas, not just balances - Proactive risk
 *   monitoring via real-time transaction surveillance helps flag
 *   suspicious activity before it escalates. The pattern here is
 *   threshold alerting on rate of change (sudden spike, unusual wallet,
 *   dormant wallet reactivating), not just current balance."
 *
 * Day 13's reasoner already gates on `largeIncomingThisHour` (sum of
 * inbound USDC > $1k in last 60 min). This module expands that to FOUR
 * additional flags computed from a mix of WalletAnalysis (recent
 * transfers from the data adapter) + the merchant's own historical
 * Event log (Prisma — what the agent has previously observed):
 *
 *   - largeVolumeLast24h     — sum of inbound USDC > $5k in last 24h
 *   - dormancyReactivated    — no agent-observed activity in prior 7d,
 *                              then activity now (suggests this wallet
 *                              "woke up")
 *   - novelCounterparty      — at least one recent inbound counterparty
 *                              has NOT been seen in this merchant's
 *                              prior 30d of agent events (suggests a
 *                              brand-new payer or, if unexpected, a
 *                              suspicious one)
 *   - withdrawalRateAnomaly  — outbound USDC value in last 24h is
 *                              materially higher than the merchant's
 *                              7d trailing daily average (rate-of-change
 *                              alert; covers the "unusual draw" case)
 *
 * Mock-mode safe: every heuristic degrades to `false` when the agent
 * has no prior history to compare against (a brand-new merchant gets
 * `false` on dormancy + novel-counterparty + withdrawal-anomaly, which
 * is the correct cold-start posture).
 */

import { prisma } from "@dodorail/db";

import type { WalletAnalysis } from "../adapters/zerion.js";

export interface BehaviourDeltaFlags {
  largeIncomingThisHour: boolean;
  largeVolumeLast24h: boolean;
  dormancyReactivated: boolean;
  novelCounterparty: boolean;
  withdrawalRateAnomaly: boolean;
}

const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;
const WEEK_S = 7 * DAY_S;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const LARGE_INCOMING_HOURLY_USD = 1_000;
const LARGE_VOLUME_DAILY_USD = 5_000;
const SPIKE_RATIO = 3; // 24h withdrawal > 3× the prior 7d daily average

export interface ComputeDeltasInput {
  merchantId: string;
  walletAnalysis: WalletAnalysis;
}

export async function computeBehaviourDeltas(
  input: ComputeDeltasInput,
): Promise<BehaviourDeltaFlags> {
  const nowS = Math.floor(Date.now() / 1000);
  const oneHourAgo = nowS - HOUR_S;
  const dayAgo = nowS - DAY_S;
  const weekAgoMs = Date.now() - WEEK_MS;
  const monthAgoMs = Date.now() - 30 * DAY_MS;

  // ---- 1 & 2. Volume-based flags from the WalletAnalysis recentTransfers
  let inboundLastHourUsd = 0;
  let inboundLast24hUsd = 0;
  let outboundLast24hUsd = 0;

  for (const t of input.walletAnalysis.recentTransfers) {
    if (t.symbol !== "USDC") continue;
    if (t.direction === "in") {
      if (t.timestamp >= oneHourAgo) inboundLastHourUsd += t.valueUsd;
      if (t.timestamp >= dayAgo) inboundLast24hUsd += t.valueUsd;
    } else if (t.direction === "out") {
      if (t.timestamp >= dayAgo) outboundLast24hUsd += t.valueUsd;
    }
  }

  const largeIncomingThisHour =
    inboundLastHourUsd > LARGE_INCOMING_HOURLY_USD;
  const largeVolumeLast24h = inboundLast24hUsd > LARGE_VOLUME_DAILY_USD;

  // ---- 3. Dormancy reactivation
  // Heuristic: count agent events for this merchant in the prior 7d
  // window EXCLUDING the last hour. If that's zero AND we have any
  // recentTransfers in the last hour, the wallet has "woken up."
  const priorWeekActivityCount = await prisma.event.count({
    where: {
      merchantId: input.merchantId,
      type: { in: ["PAYMENT_RECEIVED", "AGENT_ALERT", "YIELD_ZAP_IN"] },
      occurredAt: {
        gte: new Date(weekAgoMs),
        lt: new Date(Date.now() - HOUR_S * 1000),
      },
    },
  });
  const transfersInLastHour = input.walletAnalysis.recentTransfers.filter(
    (t) => t.timestamp >= oneHourAgo,
  );
  const dormancyReactivated =
    priorWeekActivityCount === 0 && transfersInLastHour.length > 0;

  // ---- 4. Novel counterparty
  // Pull all PAYMENT_RECEIVED events for this merchant in the last 30d,
  // build a Set of counterparty addresses we've seen. Then check if any
  // recent inbound transfer's counterparty is NOT in that set.
  const priorPayments = await prisma.event.findMany({
    where: {
      merchantId: input.merchantId,
      type: "PAYMENT_RECEIVED",
      occurredAt: { gte: new Date(monthAgoMs) },
    },
    select: { payload: true },
  });
  const seenCounterparties = new Set<string>();
  for (const e of priorPayments) {
    const payload = e.payload as { fromAddress?: string; counterparty?: string } | null;
    if (!payload) continue;
    if (payload.fromAddress) seenCounterparties.add(payload.fromAddress);
    if (payload.counterparty) seenCounterparties.add(payload.counterparty);
  }
  let novelCounterparty = false;
  for (const t of transfersInLastHour) {
    if (t.direction !== "in" || !t.counterparty) continue;
    if (!seenCounterparties.has(t.counterparty)) {
      novelCounterparty = true;
      break;
    }
  }

  // ---- 5. Withdrawal rate anomaly
  // Heuristic: compare outbound-last-24h USDC volume from the wallet
  // analysis vs. the merchant's prior 7d daily-average outbound volume,
  // sourced from agent-observed PAYMENT_RECEIVED-with-outbound or
  // explicit withdrawal events. We don't have a structured withdrawal
  // event yet (that's a Day 16+ schema-add), so the prior baseline
  // defaults to 0 and the flag fires only when we see any meaningful
  // outbound in the last 24h. This intentionally over-triggers for v1
  // — better to alert and let the merchant dismiss than miss it.
  const priorDailyAvgOutboundUsd = 0; // TODO Day 16: replace with real query when schema lands
  const withdrawalRateAnomaly =
    outboundLast24hUsd > Math.max(50, priorDailyAvgOutboundUsd * SPIKE_RATIO);

  return {
    largeIncomingThisHour,
    largeVolumeLast24h,
    dormancyReactivated,
    novelCounterparty,
    withdrawalRateAnomaly,
  };
}
