import { NextResponse } from "next/server";
import { clusterApiUrl } from "@solana/web3.js";
import BigNumber from "bignumber.js";

import { prisma } from "@dodorail/db";
import { extractReference, findMatchingPayment } from "@/lib/solana-pay";
import { usdcMintForCluster } from "@dodorail/sdk";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/[id]/status
 *
 * Public endpoint (no auth — customer needs to check their own payment status
 * without signing in). Two behaviours, in priority order:
 *
 *   1. Invoice already PAID → return PAID immediately (idempotent)
 *   2. Invoice OPEN with a solanaPayUrl set → scan the chain for a USDC
 *      transfer referencing the stored reference key. On hit: upsert a
 *      Payment + mark Invoice PAID + return PAID.
 *   3. No Solana Pay URL → return the current status, that's it.
 *
 * This is the polling endpoint the /pay/[id] page hits every ~4 seconds.
 * When Helius webhooks land on Day 4, we'll demote this to a fallback.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      merchantId: true,
      status: true,
      amountUsdCents: true,
      solanaPayUrl: true,
      merchant: { select: { solanaWalletAddress: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, rail: true, status: true, settlementTxSig: true },
      },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (invoice.status === "PAID") {
    const payment = invoice.payments[0];
    return NextResponse.json({
      invoiceId: invoice.id,
      status: "PAID",
      rail: payment?.rail ?? null,
      txSig: payment?.settlementTxSig ?? null,
    });
  }

  if (!invoice.solanaPayUrl) {
    return NextResponse.json({ invoiceId: invoice.id, status: invoice.status });
  }

  const reference = extractReference(invoice.solanaPayUrl);
  if (!reference) {
    return NextResponse.json({ invoiceId: invoice.id, status: invoice.status });
  }

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");
  const cluster = rpcUrl.includes("mainnet") ? "mainnet-beta" : "devnet";
  const splToken = usdcMintForCluster(cluster);
  const expectedUsdcAmount = new BigNumber(invoice.amountUsdCents).dividedBy(100).toString();

  try {
    const match = await findMatchingPayment({
      rpcUrl,
      reference,
      recipient: invoice.merchant.solanaWalletAddress,
      splToken,
      expectedUsdcAmount,
    });
    if (!match) {
      return NextResponse.json({
        invoiceId: invoice.id,
        status: invoice.status,
        polledAt: new Date().toISOString(),
      });
    }

    // Dedup: if some other path already wrote a Payment for this sig, skip.
    const existing = await prisma.payment.findUnique({
      where: { settlementTxSig: match.signature },
      select: { id: true },
    });
    if (!existing) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          merchantId: invoice.merchantId,
          rail: "SOLANA_USDC",
          sourceAsset: "USDC",
          sourceAmount: String(invoice.amountUsdCents),
          status: "CONFIRMED",
          processedAt: new Date(),
          confirmedAt: new Date(),
          settlementTxSig: match.signature,
        },
      });
    }
    // Reaching this branch means the earlier early-return didn't fire, so
    // Invoice.status wasn't PAID when we fetched. Flip + emit the event.
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    await prisma.event.create({
      data: {
        merchantId: invoice.merchantId,
        type: "PAYMENT_RECEIVED",
        payload: {
          invoiceId: invoice.id,
          rail: "SOLANA_USDC",
          settlementTxSig: match.signature,
          source: "solana-pay-poll",
        },
      },
    });
    track("payment_confirmed", invoice.merchantId, {
      invoiceId: invoice.id,
      rail: "SOLANA_USDC",
      amountCents: invoice.amountUsdCents,
      settlementTxSig: match.signature,
      source: "solana-pay-poll",
    });

    return NextResponse.json({
      invoiceId: invoice.id,
      status: "PAID",
      rail: "SOLANA_USDC",
      txSig: match.signature,
    });
  } catch (err) {
    return NextResponse.json(
      {
        invoiceId: invoice.id,
        status: invoice.status,
        polledAt: new Date().toISOString(),
        error: "poll_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }, // non-blocking — keep polling
    );
  }
}
