import { NextResponse } from "next/server";

import { prisma } from "@dodorail/db";
import {
  buildChallenge,
  parseClientPaymentHeader,
  verifyPayment,
  X402_CONSTANTS,
} from "@dodorail/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * x402 agent-payment gateway for DodoRail merchants.
 *
 * Surface: an autonomous agent (e.g. one of Zerion's, Bankr's, OpenClaw's)
 * hits this URL without auth. The endpoint returns HTTP 402 Payment
 * Required with a Solana USDC payment spec. The agent signs an SPL
 * transfer to the merchant's settlement wallet, retries with the
 * `x-payment: <txSig>:<nonce>` header, and gets a JSON resource back.
 *
 * Why this exists:
 *   - Zerion track essay framing: "DodoRail has been agent-ready since
 *     day one via x402-on-Solana" — and now that's actually true at the
 *     code level, not just the architectural slide.
 *   - Dodo Payments track essay: an extra rail (X402_AGENT) for
 *     autonomous-buyer SaaS — the 2026-2027 agent-economy timing bet.
 *   - Real protocol primitive: file 10 §3 notes Solana drove ~77% of
 *     x402 transaction volume in late 2025. Building this opens DodoRail
 *     up to that volume slice.
 *
 * Request shape:
 *   GET /api/x402/{merchantId}
 *   GET /api/x402/{merchantId}?resource=balance|status|...
 *
 * Response shapes:
 *   - First request (no x-payment header) → HTTP 402 + X402PaymentChallenge body
 *   - Retry with payment header → HTTP 200 + the requested resource
 *   - Retry with bad payment → HTTP 402 again (same challenge or a new one)
 *
 * Nonce handling:
 *   For the hackathon-window scope we issue a fresh nonce per request and
 *   verify against the same nonce in the same response. Production-scale
 *   replay protection (cross-request nonce tracking) is a Day-19+ polish
 *   item that lands when we add an `X402Payment` Prisma table.
 *
 *   For Day 18 we accept a "best-effort" stateless nonce: the agent gets
 *   the nonce in the 402 body, signs against the merchant's recipient
 *   wallet, retries with that nonce, and the server validates the
 *   tx-signature + balance-delta match.
 *
 * Resource served (for the demo):
 *   A small JSON envelope with merchant slug + a "this is the resource
 *   the agent paid for" payload. Real production resources would be
 *   gated APIs (analytics endpoints, gated content). For Frontier
 *   submission the demo resource is a status response with an
 *   x402-paid: true field — enough to prove the loop works.
 */

interface RouteContext {
  params: Promise<{ merchantId: string }>;
}

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const { merchantId } = await ctx.params;

  // 1. Resolve the merchant — must exist + have a Solana wallet to pay to.
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true, slug: true, name: true, solanaWalletAddress: true },
  });
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  // 2. Compute cluster + resource id from the request.
  const url = new URL(req.url);
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "";
  const cluster: "mainnet-beta" | "devnet" = rpcUrl.includes("mainnet")
    ? "mainnet-beta"
    : "devnet";
  const resource = url.searchParams.get("resource") ?? "status";
  const resourceId = `${merchant.slug}:${resource}`;

  // 3. Check for the x-payment header. If missing → return 402 challenge.
  const payment = parseClientPaymentHeader(req.headers.get("x-payment"));
  if (!payment) {
    const challenge = buildChallenge({
      recipient: merchant.solanaWalletAddress,
      amountUsdcCents: X402_CONSTANTS.defaultAmountUsdcCentsPerCall,
      resourceId,
      cluster,
      verifyUrl: `${url.origin}${url.pathname}`,
    });
    return NextResponse.json(
      {
        error: "payment_required",
        protocol: X402_CONSTANTS.protocol,
        challenge,
      },
      {
        status: 402,
        headers: {
          // x402 standard: hint the spec via response header too, so simple
          // clients don't need to JSON-parse the body to find the recipient
          // + amount.
          "x-payment-required": JSON.stringify({
            mint: challenge.spec.mint,
            recipient: challenge.spec.recipient,
            amountBaseUnits: challenge.spec.amountBaseUnits.toString(),
            cluster: challenge.spec.cluster,
            nonce: challenge.nonce,
          }),
        },
      },
    );
  }

  // 4. Has a payment header — verify the tx satisfies the spec.
  // For the stateless nonce design (Day 18 scope), we re-derive the
  // expected spec from the merchant + URL the same way the challenge
  // was built. The agent and server independently arrive at the same
  // {recipient, amount, mint} pair. The nonce is what binds the retry
  // to a specific challenge.
  const expectedAmountBaseUnits =
    BigInt(X402_CONSTANTS.defaultAmountUsdcCentsPerCall) * 10_000n;
  const expectedSpec = {
    mint:
      cluster === "mainnet-beta"
        ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        : "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
    recipient: merchant.solanaWalletAddress,
    amountBaseUnits: expectedAmountBaseUnits,
    cluster,
    resourceId,
  };

  const verifyResult = await verifyPayment({
    txSig: payment.txSig,
    expectedNonce: payment.nonce, // stateless — agent's nonce IS the expected
    claimedNonce: payment.nonce,
    expectedSpec,
  });

  if (!verifyResult.ok) {
    // Bad / unfinalized / mismatched payment — return 402 with a fresh challenge.
    const challenge = buildChallenge({
      recipient: merchant.solanaWalletAddress,
      amountUsdcCents: X402_CONSTANTS.defaultAmountUsdcCentsPerCall,
      resourceId,
      cluster,
      verifyUrl: `${url.origin}${url.pathname}`,
    });
    return NextResponse.json(
      {
        error: "payment_invalid",
        reason: verifyResult.reason,
        protocol: X402_CONSTANTS.protocol,
        challenge,
      },
      { status: 402 },
    );
  }

  // 5. Payment verified — emit a PAYMENT_RECEIVED Event, then serve resource.
  //
  // Note: we deliberately do NOT write a Payment row for x402 agent
  // payments. The Payment model's `invoiceId` is required (every Payment
  // belongs to an Invoice), but x402 agent payments aren't invoiced flows —
  // they're stateless paid-resource consumptions. The Event row captures
  // everything we need (rail, resource, txSig, cluster, amount); the
  // merchant dashboard can filter Events with `type: PAYMENT_RECEIVED` and
  // `payload.rail: X402_AGENT` to surface x402 activity. If/when we add
  // x402-specific accounting, the Day-19+ schema move is to make
  // `Payment.invoiceId` nullable rather than synthesise a fake Invoice
  // per x402 hit.
  await prisma.event.create({
    data: {
      merchantId: merchant.id,
      type: "PAYMENT_RECEIVED",
      payload: {
        rail: "X402_AGENT",
        resource,
        resourceId,
        txSig: verifyResult.txSig,
        cluster,
        amountUsdcCents: X402_CONSTANTS.defaultAmountUsdcCentsPerCall,
        amountBaseUnits: expectedAmountBaseUnits.toString(),
      },
    },
  });

  // 6. Serve the resource. For the hackathon demo, the resource is a
  // status JSON payload — production resources would be gated content,
  // analytics endpoints, etc.
  return NextResponse.json({
    ok: true,
    paid: true,
    rail: "x402_agent",
    merchant: {
      slug: merchant.slug,
      name: merchant.name,
    },
    resource,
    resourceId,
    txSig: verifyResult.txSig,
    cluster,
    notes: [
      "This response was served because your payment was verified on Solana.",
      "x402.org · DodoRail's agent-payment rail",
    ],
  });
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  // Some agents POST instead of GET. Same behaviour either way.
  return GET(req, ctx);
}
