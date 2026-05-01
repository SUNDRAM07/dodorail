/**
 * Agent loop — Observe → Think → Act, once per cron tick.
 *
 * For every yield-enabled merchant with a non-null Solana wallet:
 *   1. Observe — Zerion adapter returns the wallet's portfolio + recent txs
 *   2. Think — pluggable LLM reasoner returns a typed Decision
 *   3. Act — execute exactly one of {alert, zap-in, wait}
 *
 * Idempotency lives at three layers:
 *   - The reasoner is told whether a recent zap-in already happened (it
 *     should choose `wait` instead of `zap-in` if so)
 *   - The alert action dedupes within a 60min window
 *   - The zap-in action dedupes within a 23h window
 *
 * Errors: every per-merchant block is wrapped in try/catch — one merchant's
 * Zerion blip should never take down the loop for the others.
 */

import { prisma } from "@dodorail/db";
import { CURATED_POOLS } from "@dodorail/lpagent";

import { createDataAdapter, getActiveDataSource } from "./adapters/index.js";
import type { WalletAnalysis } from "./adapters/zerion.js";
import { createReasoner, type AgentDecision } from "./reasoner.js";
import { createTelegramNotifier } from "./notifier.js";
import { executeAlert } from "./actions/alert.js";
import { executeZapInFromAgent } from "./actions/zap-in.js";
import { computeBehaviourDeltas } from "./heuristics/deltas.js";

export interface MerchantTickResult {
  merchantId: string;
  merchantName: string;
  decision: AgentDecision | null;
  /** The action we actually performed — may differ from decision if dedup
   * blocked it (then this is "blocked"). */
  acted: "alert" | "zap-in" | "wait" | "blocked" | "errored";
  reason: string;
  walletAnalysis?: WalletAnalysis;
}

export interface LoopRunResult {
  startedAt: string;
  durationMs: number;
  merchantsConsidered: number;
  results: MerchantTickResult[];
}

export async function runAgentLoop(): Promise<LoopRunResult> {
  const started = new Date();
  const dataAdapter = createDataAdapter();
  const dataSource = getActiveDataSource();
  const reasoner = createReasoner();
  const notifier = createTelegramNotifier();

  console.log(
    `[agent] tick start ${started.toISOString()} | dataSource=${dataSource} | dataAdapterMode=${dataAdapter.mode} | reasoner=${reasoner.provider} | telegram=${notifier.enabled ? "on" : "mock"}`,
  );

  const merchants = await prisma.merchant.findMany({
    where: {
      yieldEnabled: true,
    },
    select: {
      id: true,
      name: true,
      solanaWalletAddress: true,
      yieldThresholdCents: true,
      telegramChatId: true,
    },
  });

  const results: MerchantTickResult[] = [];

  for (const m of merchants) {
    try {
      // 1. Observe
      const analysis = await dataAdapter.getWalletAnalysis(m.solanaWalletAddress);

      // Dedup precheck for "recent zap-in already" so the LLM can be told.
      const recentZap = await prisma.event.findFirst({
        where: {
          merchantId: m.id,
          type: "YIELD_ZAP_IN",
          occurredAt: { gte: new Date(Date.now() - 23 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });

      // Day 15 — full behaviour-delta computation (Prajin's pattern #2).
      // Replaces the simple `largeIncomingThisHour` heuristic with five
      // flags, computed from the merchant's prior Event log + this tick's
      // recent transfers. Same merchantId-scoped queries keep the
      // computation idempotent + concurrent-safe.
      const deltas = await computeBehaviourDeltas({
        merchantId: m.id,
        walletAnalysis: analysis,
      });

      // Pool selection — same logic as the dashboard (most-recent
      // TreasuryPosition row, fallback first curated).
      const lastPosition = await prisma.treasuryPosition.findFirst({
        where: { merchantId: m.id, protocol: "LP_AGENT_METEORA" },
        orderBy: { createdAt: "desc" },
        select: { poolId: true },
      });
      const selectedPoolId = lastPosition?.poolId ?? CURATED_POOLS[0]!.id;
      const selectedPool =
        CURATED_POOLS.find((p) => p.id === selectedPoolId) ?? CURATED_POOLS[0]!;

      // 2. Think
      const decision = await reasoner.decide({
        merchantId: m.id,
        merchantName: m.name,
        thresholdCents: m.yieldThresholdCents,
        selectedPoolLabel: selectedPool.label,
        walletAnalysis: analysis,
        recentZapAlready: !!recentZap,
        largeIncomingThisHour: deltas.largeIncomingThisHour,
        largeVolumeLast24h: deltas.largeVolumeLast24h,
        dormancyReactivated: deltas.dormancyReactivated,
        novelCounterparty: deltas.novelCounterparty,
        withdrawalRateAnomaly: deltas.withdrawalRateAnomaly,
      });

      console.log(
        `[agent] ${m.name} (${m.id.slice(0, 8)}…) decision=${decision.action} reason="${decision.reason.slice(0, 80)}…"`,
      );

      // 3. Act
      if (decision.action === "alert") {
        const alertResult = await executeAlert({
          merchantId: m.id,
          merchantName: m.name,
          telegramChatId: m.telegramChatId,
          decision,
          walletAnalysis: analysis,
          notifier,
        });
        results.push({
          merchantId: m.id,
          merchantName: m.name,
          decision,
          walletAnalysis: analysis,
          acted: alertResult.delivered ? "alert" : "blocked",
          reason: alertResult.delivered
            ? "alert delivered"
            : alertResult.reason ?? "blocked",
        });
      } else if (decision.action === "zap-in") {
        const amount = decision.zapInAmountUsdcCents
          ?? Math.max(0, analysis.idleUsdcCents - m.yieldThresholdCents);
        if (amount <= 0) {
          results.push({
            merchantId: m.id,
            merchantName: m.name,
            decision,
            walletAnalysis: analysis,
            acted: "wait",
            reason: "zap-in amount resolved to 0 — no action",
          });
          continue;
        }
        const zapResult = await executeZapInFromAgent({
          merchantId: m.id,
          merchantName: m.name,
          poolId: selectedPool.id,
          amountUsdcCents: amount,
          decisionReason: decision.reason,
        });
        results.push({
          merchantId: m.id,
          merchantName: m.name,
          decision,
          walletAnalysis: analysis,
          acted: zapResult.ok ? "zap-in" : "blocked",
          reason: zapResult.ok
            ? `zap-in ok (event ${zapResult.eventId})`
            : zapResult.reason ?? "blocked",
        });
      } else {
        // wait
        results.push({
          merchantId: m.id,
          merchantName: m.name,
          decision,
          walletAnalysis: analysis,
          acted: "wait",
          reason: decision.reason,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[agent] ${m.id} errored: ${message}`);
      results.push({
        merchantId: m.id,
        merchantName: m.name,
        decision: null,
        acted: "errored",
        reason: message,
      });
    }
  }

  const durationMs = Date.now() - started.getTime();
  console.log(
    `[agent] tick done ${durationMs}ms | considered=${merchants.length} | results=${JSON.stringify(
      results.map((r) => ({ id: r.merchantId.slice(0, 8), acted: r.acted })),
    )}`,
  );
  return {
    startedAt: started.toISOString(),
    durationMs,
    merchantsConsidered: merchants.length,
    results,
  };
}
