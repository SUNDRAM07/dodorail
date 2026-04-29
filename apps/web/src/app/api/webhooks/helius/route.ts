import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { usdcMintsForCluster } from "@dodorail/sdk";
import { extractReference } from "@/lib/solana-pay";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Helius Enhanced Transactions webhook.
 *
 * Flow:
 *   Helius watches a list of merchant wallet addresses (registered via the
 *   Helius dashboard — see DEVOPS.md for the exact steps). Every time a
 *   Solana tx lands involving a watched address, Helius POSTs the parsed
 *   transaction(s) to this endpoint within ~1-3 seconds of finalisation.
 *
 *   We iterate the payload's tokenTransfers, find ones that moved USDC to
 *   one of our merchant wallets, and cross-reference open invoices for
 *   amount + recipient. On match we write a Payment row, flip the Invoice
 *   to PAID, emit a PAYMENT_RECEIVED event, and Posthog-track it.
 *
 * This runs alongside the existing poll-based confirmation at
 * /api/invoices/[id]/status — push is the fast path, poll is the fallback.
 * Idempotency via settlementTxSig uniqueness means duplicate delivery is
 * harmless.
 *
 * Auth: Helius sets an Authorization header on every outbound webhook. We
 * match it against DODORAIL_HELIUS_WEBHOOK_SECRET. No HMAC signature — Helius
 * uses shared-secret auth (documented at
 * https://docs.helius.dev/webhooks-and-websockets/webhooks/webhook-faq).
 */

// Helius Enhanced Transactions webhook shape. We don't need every field —
// just enough to match an inbound USDC transfer to an open invoice.
const TokenTransferSchema = z.object({
  fromTokenAccount: z.string().optional(),
  toTokenAccount: z.string().optional(),
  fromUserAccount: z.string().optional(),
  toUserAccount: z.string().optional(),
  tokenAmount: z.number(),
  mint: z.string(),
  tokenStandard: z.string().optional(),
});

const EnhancedTxSchema = z
  .object({
    signature: z.string(),
    slot: z.number().optional(),
    timestamp: z.number().optional(),
    type: z.string().optional(),
    source: z.string().optional(),
    transactionError: z.unknown().optional().nullable(),
    tokenTransfers: z.array(TokenTransferSchema).optional().default([]),
  })
  .passthrough();

const PayloadSchema = z.array(EnhancedTxSchema);

function normaliseUsdcAmount(tokenAmount: number): number {
  // Helius `tokenAmount` is in UI-scale (e.g. 0.5 for 50 cents). We compare
  // against invoice amountUsdCents (integer cents). Round to avoid FP drift.
  return Math.round(tokenAmount * 100);
}

export async function POST(req: Request) {
  // 1. Auth.
  const expected = process.env.DODORAIL_HELIUS_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "webhook_secret_unconfigured" },
      { status: 500 },
    );
  }
  const got =
    req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    req.headers.get("x-helius-auth") ??
    "";
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_payload", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const txs = parsed.data;

  // 3. Figure out which USDC mint(s) to accept. Devnet has TWO USDC mints
  // in active use — Circle's official one and the spl-token-faucet.com
  // one — so we accept both on devnet. Mainnet only ever has Circle's mint.
  // We never accept mainnet USDC on a devnet deploy.
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "";
  const cluster = rpcUrl.includes("mainnet") ? "mainnet-beta" : "devnet";
  const acceptedMints = new Set(usdcMintsForCluster(cluster));

  const results: Array<{
    signature: string;
    invoiceId?: string;
    paymentId?: string;
    status: "matched" | "amount_mismatch" | "no_merchant" | "no_invoice" | "duplicate" | "not_usdc";
  }> = [];

  for (const tx of txs) {
    // Skip failed txs — Helius still delivers them but we shouldn't settle.
    if (tx.transactionError) continue;

    const usdcTransfers = tx.tokenTransfers.filter((t) => acceptedMints.has(t.mint));
    if (usdcTransfers.length === 0) {
      results.push({ signature: tx.signature, status: "not_usdc" });
      continue;
    }

    for (const transfer of usdcTransfers) {
      if (!transfer.toUserAccount) continue;

      // 4. Dedup on signature — if poll-path already wrote this, skip silently.
      const existing = await prisma.payment.findUnique({
        where: { settlementTxSig: tx.signature },
        select: { id: true, invoiceId: true },
      });
      if (existing) {
        results.push({
          signature: tx.signature,
          invoiceId: existing.invoiceId,
          paymentId: existing.id,
          status: "duplicate",
        });
        continue;
      }

      // 5. Find the merchant whose wallet received this transfer.
      const merchant = await prisma.merchant.findFirst({
        where: { solanaWalletAddress: transfer.toUserAccount },
        select: { id: true },
      });
      if (!merchant) {
        results.push({ signature: tx.signature, status: "no_merchant" });
        continue;
      }

      // 6. Find an OPEN invoice on that merchant whose amount matches. We
      // match by exact cents + USDC rail. If multiple invoices have the
      // same amount (rare), we'd need to disambiguate by reference; for
      // now, pick the oldest OPEN one and let the poll path deduplicate.
      const receivedCents = normaliseUsdcAmount(transfer.tokenAmount);
      const candidateInvoices = await prisma.invoice.findMany({
        where: {
          merchantId: merchant.id,
          status: "OPEN",
          solanaPayUrl: { not: null },
          amountUsdCents: receivedCents,
        },
        select: { id: true, merchantId: true, amountUsdCents: true, solanaPayUrl: true },
        orderBy: { createdAt: "asc" },
        take: 5,
      });
      if (candidateInvoices.length === 0) {
        results.push({ signature: tx.signature, status: "no_invoice" });
        continue;
      }

      // 7. Pick the first candidate with a parseable reference. (In the
      // common single-invoice case this is just a cross-check that the
      // Solana Pay URL is well-formed.)
      const matched =
        candidateInvoices.find((inv) => extractReference(inv.solanaPayUrl ?? "")) ??
        candidateInvoices[0];
      if (!matched) {
        results.push({ signature: tx.signature, status: "no_invoice" });
        continue;
      }

      // 8. Settle.
      const payment = await prisma.payment.create({
        data: {
          invoiceId: matched.id,
          merchantId: matched.merchantId,
          rail: "SOLANA_USDC",
          sourceAsset: "USDC",
          sourceAmount: String(matched.amountUsdCents),
          status: "CONFIRMED",
          processedAt: new Date(),
          confirmedAt: new Date(),
          settlementTxSig: tx.signature,
        },
      });
      await prisma.invoice.update({
        where: { id: matched.id },
        data: { status: "PAID" },
      });
      await prisma.event.create({
        data: {
          merchantId: matched.merchantId,
          type: "PAYMENT_RECEIVED",
          payload: {
            invoiceId: matched.id,
            rail: "SOLANA_USDC",
            settlementTxSig: tx.signature,
            source: "helius-webhook",
            amountCents: matched.amountUsdCents,
          },
        },
      });
      track("payment_confirmed", matched.merchantId, {
        invoiceId: matched.id,
        rail: "SOLANA_USDC",
        amountCents: matched.amountUsdCents,
        settlementTxSig: tx.signature,
        source: "helius-webhook",
      });
      results.push({
        signature: tx.signature,
        invoiceId: matched.id,
        paymentId: payment.id,
        status: "matched",
      });
    }
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "helius-webhook",
    cluster: (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").includes("mainnet")
      ? "mainnet-beta"
      : "devnet",
    configured: Boolean(process.env.DODORAIL_HELIUS_WEBHOOK_SECRET),
  });
}
