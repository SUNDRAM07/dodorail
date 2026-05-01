/**
 * Inflow categoriser — Prajin's pattern #3 from his Day 13 DM.
 *
 * Direct quote (saved at .auto-memory/project_goldrush_prajin_full_access.md):
 *   "Inflow categorization by type, rather than by chain. For a merchant
 *   wallet watcher, this matters a lot - a USDC payment on Solana and a
 *   USDC payment on Base are the same economic event. The agent should
 *   classify first, then surface chain context only when operationally
 *   relevant (e.g. for routing a withdrawal)."
 *
 * What this module does:
 *   For each recent INBOUND transfer in a WalletAnalysis, classify it
 *   into one of FIVE economic categories. The classification is then
 *   stored on the AGENT_ALERT / PAYMENT_RECEIVED Event payload so the
 *   merchant dashboard (and the public Dune dashboard) can filter +
 *   aggregate by *type*, not by chain.
 *
 * Why classify locally vs ask the LLM each tick:
 *   - LLM calls cost credits and add latency we don't need for what's
 *     mostly rule-based pattern recognition (small inbound USDC from a
 *     known invoice address = invoice payment; a transfer-back from the
 *     merchant's own LP position = treasury_topup)
 *   - The 5 categories collapse into clean if/else rules ~80% of the
 *     time; the LLM is a fallback only when none of the rules match
 *
 * The categories:
 *   - invoice_payment   inbound USDC matched to an OPEN/PAID Invoice
 *                       row by amount + recency. Most common case for
 *                       a SaaS payment rail.
 *   - refund            outbound from the merchant followed by a small
 *                       inbound from the same counterparty (a customer
 *                       sending a refund back). Rare but distinct.
 *   - treasury_topup    inbound from the merchant's OWN known
 *                       addresses (LP zap-out, self-transfer, agent
 *                       wallet). Should NOT alert.
 *   - liquidity_move    inbound matched to a known DEX router or
 *                       Jupiter program — the merchant moved liquidity
 *                       around their own treasury.
 *   - unknown           none of the above — the LLM gets a chance to
 *                       label, or it stays "unknown" and the merchant
 *                       confirms via the dashboard.
 *
 * This module is pure-function-callable from the agent loop AND from
 * the Helius webhook receiver — same logic, same categories, same
 * Event payload shape regardless of which path observes the inbound.
 */

import { prisma } from "@dodorail/db";

import type { ZerionRecentTransfer, WalletAnalysis } from "../adapters/zerion.js";

export type InflowCategory =
  | "invoice_payment"
  | "refund"
  | "treasury_topup"
  | "liquidity_move"
  | "unknown";

export interface ClassifiedInflow {
  signature: string;
  category: InflowCategory;
  /** Confidence in the rule-based classification: high / medium / low.
   * `low` means the rules were ambiguous and an LLM pass would help. */
  confidence: "high" | "medium" | "low";
  /** Optional matched-invoice id when category=invoice_payment. */
  invoiceId?: string;
  /** Optional reason string for the dashboard tooltip + Event payload. */
  reason: string;
}

/** Known DEX router / aggregator program IDs on Solana. Inbound from
 * these = liquidity_move. Extend as we observe more in production. */
const KNOWN_DEX_PROGRAMS = new Set<string>([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter v6
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB", // Jupiter v4
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", // Orca Whirlpool
  "RVKd61ztZW9GdKzn4n5J1UUxPcNoQKrJ9pcnoTBmUog", // Raydium AMM v3
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP", // Drift v2
]);

/** Wallets we know are *our own* — agent operating wallet, treasury
 * spinoff repo's signer, etc. Loaded lazily from the merchant's
 * configured set. For Day 16 we hardcode an empty set; Day 17 polish
 * adds a `Merchant.knownSelfWallets` JSON field. */
const KNOWN_SELF_WALLETS = new Set<string>([]);

/** Match an inbound USDC transfer to an OPEN or recently-PAID invoice
 * by exact amount + 24h recency window. Returns the matched invoice
 * id if exactly one matches; null if zero or many match. */
async function tryMatchInvoice(
  merchantId: string,
  amountUsdcCents: number,
): Promise<string | null> {
  if (amountUsdcCents <= 0) return null;
  const candidates = await prisma.invoice.findMany({
    where: {
      merchantId,
      amountUsdCents: amountUsdcCents,
      status: { in: ["OPEN", "PAID"] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  if (candidates.length === 1) return candidates[0]!.id;
  return null;
}

export interface ClassifyInput {
  merchantId: string;
  walletAnalysis: WalletAnalysis;
}

export async function classifyInflows(
  input: ClassifyInput,
): Promise<ClassifiedInflow[]> {
  const { merchantId, walletAnalysis } = input;
  const inbounds = walletAnalysis.recentTransfers.filter(
    (t) => t.direction === "in",
  );
  const results: ClassifiedInflow[] = [];

  for (const t of inbounds) {
    const result = await classifySingleInflow(merchantId, t);
    results.push(result);
  }

  return results;
}

async function classifySingleInflow(
  merchantId: string,
  t: ZerionRecentTransfer,
): Promise<ClassifiedInflow> {
  // Rule 1: counterparty is a known DEX → liquidity_move.
  if (t.counterparty && KNOWN_DEX_PROGRAMS.has(t.counterparty)) {
    return {
      signature: t.signature,
      category: "liquidity_move",
      confidence: "high",
      reason: `Inbound from known DEX program ${t.counterparty.slice(0, 8)}…`,
    };
  }

  // Rule 2: counterparty is one of our own known wallets → treasury_topup.
  if (t.counterparty && KNOWN_SELF_WALLETS.has(t.counterparty)) {
    return {
      signature: t.signature,
      category: "treasury_topup",
      confidence: "high",
      reason: `Inbound from merchant's own known wallet — treasury rebalance, not customer payment`,
    };
  }

  // Rule 3: USDC + amount matches an open invoice exactly → invoice_payment.
  if (t.symbol === "USDC") {
    const amountCents = Math.round(t.amountFloat * 100);
    const matchedInvoiceId = await tryMatchInvoice(merchantId, amountCents);
    if (matchedInvoiceId) {
      return {
        signature: t.signature,
        category: "invoice_payment",
        confidence: "high",
        invoiceId: matchedInvoiceId,
        reason: `Amount ${t.amountFloat.toFixed(2)} USDC matches OPEN invoice ${matchedInvoiceId.slice(0, 8)}…`,
      };
    }
  }

  // Rule 4: refund detection — look for a recent OUTBOUND from the same
  // counterparty in the prior 7d Event log. If one exists and the
  // current inbound is roughly the same amount (±5%), classify as refund.
  if (t.counterparty && t.symbol === "USDC") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const priorOutboundEvents = await prisma.event.findMany({
      where: {
        merchantId,
        type: { in: ["PAYMENT_RECEIVED", "AGENT_ALERT"] },
        occurredAt: { gte: sevenDaysAgo },
      },
      select: { payload: true },
      take: 50,
    });
    const matchAmount = t.amountFloat;
    const refundMatch = priorOutboundEvents.find((e) => {
      const p = e.payload as
        | {
            counterparty?: string;
            direction?: string;
            amountUsdc?: number;
          }
        | null;
      if (!p) return false;
      if (p.counterparty !== t.counterparty) return false;
      if (p.direction !== "out") return false;
      if (typeof p.amountUsdc !== "number") return false;
      return Math.abs(p.amountUsdc - matchAmount) / Math.max(matchAmount, 1) < 0.05;
    });
    if (refundMatch) {
      return {
        signature: t.signature,
        category: "refund",
        confidence: "medium",
        reason: `Inbound from ${t.counterparty.slice(0, 8)}… roughly matches a recent outbound — likely a refund`,
      };
    }
  }

  // Rule 5: small inbound USDC from a counterparty we've never seen
  // and no invoice match — likely a new customer paying outside the
  // canonical flow OR a treasury_topup from a wallet we haven't
  // registered. Mark unknown so the merchant confirms.
  return {
    signature: t.signature,
    category: "unknown",
    confidence: "low",
    reason: `No rule matched — neither known DEX, known self-wallet, invoice amount, nor refund pattern. Flag for merchant confirmation in dashboard.`,
  };
}

/** Helper for the agent loop / webhook to record the classification
 * onto an Event payload. The agent's existing Event-write path can
 * call this and merge the result into the payload before the create. */
export function summariseClassifications(
  classifications: ClassifiedInflow[],
): {
  invoicePaymentCount: number;
  refundCount: number;
  treasuryTopupCount: number;
  liquidityMoveCount: number;
  unknownCount: number;
  highConfidenceCount: number;
} {
  return {
    invoicePaymentCount: classifications.filter((c) => c.category === "invoice_payment").length,
    refundCount: classifications.filter((c) => c.category === "refund").length,
    treasuryTopupCount: classifications.filter((c) => c.category === "treasury_topup").length,
    liquidityMoveCount: classifications.filter((c) => c.category === "liquidity_move").length,
    unknownCount: classifications.filter((c) => c.category === "unknown").length,
    highConfidenceCount: classifications.filter((c) => c.confidence === "high").length,
  };
}
