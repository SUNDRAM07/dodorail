import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import {
  createTetherClient,
  USDT0_SOURCE_CHAINS,
  type Usdt0SourceChain,
} from "@dodorail/tether";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/usdt0/quote
 *
 * Build a cross-chain USDT0 bridge quote so a customer holding USDT on a
 * non-Solana chain (Ethereum / Tron / BNB / Polygon / Arbitrum / Base /
 * Optimism / Avalanche) can pay a DodoRail invoice and have funds settle
 * as native USDT0 on the merchant's Solana wallet.
 *
 * The customer hits this endpoint from the pay page when they:
 *   1. Select the USDT0 cross-chain rail
 *   2. Pick their source chain (which chain holds their USDT)
 *   3. Pass their source-chain wallet address
 *
 * Server response:
 *   - estimatedFeeUsdCents — bridge fee (LayerZero relay + source-chain gas)
 *   - estimatedSeconds     — typical time to finality on the destination
 *   - solanaVersionedTransactionB64 — base64 Solana tx the customer signs
 *     to claim the bridged USDT0 on Solana (live mode only)
 *   - evmTransaction       — EVM tx the customer signs on the source chain
 *     to start the bridge (only present for EVM source chains)
 *
 * Mock mode (when DODORAIL_LAYERZERO_KEY is unset) returns deterministic
 * placeholder data so the pay-page UI renders end-to-end without burning
 * LayerZero credits during dev.
 */

const SOURCE_CHAINS = USDT0_SOURCE_CHAINS.map((c) => c.id) as ReadonlyArray<Usdt0SourceChain>;

const BodySchema = z.object({
  invoiceId: z.string().uuid(),
  srcChain: z.enum(SOURCE_CHAINS as readonly [Usdt0SourceChain, ...Usdt0SourceChain[]]),
  fromAddress: z
    .string()
    .min(20, "fromAddress too short to be a real wallet")
    .max(80, "fromAddress too long"),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_payload", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const { invoiceId, srcChain, fromAddress } = parsed.data;

  // Look up the invoice + merchant wallet (the bridge destination).
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      merchantId: true,
      amountUsdCents: true,
      acceptedRails: true,
      status: true,
      merchant: { select: { solanaWalletAddress: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  }
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "invoice_already_paid" }, { status: 410 });
  }
  if (!invoice.acceptedRails.includes("SOLANA_USDT0")) {
    return NextResponse.json({ error: "rail_not_accepted_on_invoice" }, { status: 400 });
  }

  const tether = createTetherClient({
    layerzeroApiKey: process.env.DODORAIL_LAYERZERO_KEY,
    network: "mainnet",
  });
  await tether.initialise();

  // USDT0 has 6 decimals. Invoice amount is in USD cents (2 decimals); convert.
  // 1 USDT0 = 1_000_000 base units = 100 cents = $1.
  // amountUsdCents → base units = amountUsdCents * 10_000.
  const amountBaseUnits = BigInt(invoice.amountUsdCents) * 10_000n;

  let quote;
  try {
    quote = await tether.getUsdt0BridgeQuote({
      srcChain,
      amountBaseUnits,
      fromAddress,
      toAddress: invoice.merchant.solanaWalletAddress,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "quote_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 },
    );
  }

  // Telemetry — track quote requests so we can see customer interest in
  // each source chain. No PII on the source-chain wallet itself; just chain
  // + invoice mapping.
  track("checkout_viewed", invoice.merchantId, {
    rail: "SOLANA_USDT0",
    src_chain: srcChain,
    invoice_id: invoiceId,
    quote_source: quote.source,
  });

  return NextResponse.json({
    invoiceId: invoice.id,
    srcChain: quote.srcChain,
    dstChain: quote.dstChain,
    amountBaseUnits: quote.amountBaseUnits.toString(),
    estimatedFeeUsdCents: quote.estimatedFeeUsdCents,
    estimatedSeconds: quote.estimatedSeconds,
    solanaVersionedTransactionB64: quote.solanaVersionedTransactionB64,
    evmTransaction: quote.evmTransaction ?? null,
    source: quote.source,
    mode: tether.mode,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "usdt0-quote",
    sources: USDT0_SOURCE_CHAINS,
    mode: process.env.DODORAIL_LAYERZERO_KEY ? "live" : "mock",
  });
}
