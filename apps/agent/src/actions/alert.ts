/**
 * Alert action — sends a Telegram message and writes an AGENT_ALERT event.
 *
 * Idempotency: the agent loop already filtered for "no recent zap-in" before
 * calling decide(); for alerts we additionally dedupe within the dedup
 * window via the Event log so a single anomaly doesn't fire 12 alerts/hour.
 */

import { prisma } from "@dodorail/db";

import type { TelegramNotifier } from "../notifier.js";
import type { AgentDecision } from "../reasoner.js";
import type { WalletAnalysis } from "../adapters/zerion.js";
import type { ClassifiedInflow } from "../classifiers/inflow.js";

export interface AlertContext {
  merchantId: string;
  merchantName: string;
  telegramChatId: string | null;
  decision: AgentDecision;
  walletAnalysis: WalletAnalysis;
  notifier: TelegramNotifier;
  /** Day 16 — Prajin pattern #3. Classified categories per recent
   * inbound transfer. Stored on the Event payload so the dashboard
   * can filter by inflow type. */
  inflowClassifications?: ClassifiedInflow[];
  /** When `true`, only logs — does NOT send Telegram, does NOT write the
   * Event row. Useful for development. Defaults to false. */
  dryRun?: boolean;
}

const ALERT_DEDUP_MINUTES = 60;

export async function executeAlert(ctx: AlertContext): Promise<{
  delivered: boolean;
  eventId?: string;
  reason?: string;
}> {
  const cutoff = new Date(Date.now() - ALERT_DEDUP_MINUTES * 60 * 1000);
  const recent = await prisma.event.findFirst({
    where: {
      merchantId: ctx.merchantId,
      type: "AGENT_ALERT",
      occurredAt: { gte: cutoff },
    },
    select: { id: true },
  });
  if (recent) {
    return {
      delivered: false,
      reason: `dedup: alert sent within last ${ALERT_DEDUP_MINUTES}min`,
    };
  }

  const message = formatTelegramMessage(ctx);

  if (ctx.dryRun) {
    console.log(`[alert:dry-run] would send to ${ctx.telegramChatId ?? "(no chat)"}:`);
    console.log(message);
    return { delivered: false, reason: "dry-run" };
  }

  // Send Telegram if a chat id is wired. Otherwise this is alert-mode without
  // delivery — still write the event row so the dashboard surfaces it.
  let delivered = false;
  if (ctx.telegramChatId) {
    delivered = await ctx.notifier.send(ctx.telegramChatId, message);
  }

  const event = await prisma.event.create({
    data: {
      merchantId: ctx.merchantId,
      type: "AGENT_ALERT",
      payload: {
        action: ctx.decision.action,
        severity: ctx.decision.alertSeverity ?? "info",
        reason: ctx.decision.reason,
        idleUsdcCents: ctx.walletAnalysis.idleUsdcCents,
        pnl24hUsd: ctx.walletAnalysis.pnl24hUsd,
        recentTransferCount: ctx.walletAnalysis.recentTransfers.length,
        zerionSource: ctx.walletAnalysis.source,
        delivered,
        chatId: ctx.telegramChatId ?? null,
        // Day 16 — inflow categorisation per Prajin pattern #3
        inflowClassifications: ctx.inflowClassifications?.map((c) => ({
          signature: c.signature,
          category: c.category,
          confidence: c.confidence,
          invoiceId: c.invoiceId,
        })) ?? [],
      },
    },
    select: { id: true },
  });

  return { delivered, eventId: event.id };
}

function formatTelegramMessage(ctx: AlertContext): string {
  const sev = ctx.decision.alertSeverity ?? "info";
  const icon = sev === "warn" ? "⚠️" : "ℹ️";
  const w = ctx.walletAnalysis;
  return [
    `${icon} *DodoRail Treasury Agent — ${ctx.merchantName}*`,
    "",
    ctx.decision.reason,
    "",
    `*Idle USDC:* $${(w.idleUsdcCents / 100).toFixed(2)}`,
    `*24h PnL:* $${w.pnl24hUsd.toFixed(2)}`,
    `*Recent transfers:* ${w.recentTransfers.length}`,
    "",
    `_Source: Zerion (${w.source})._`,
  ].join("\n");
}
