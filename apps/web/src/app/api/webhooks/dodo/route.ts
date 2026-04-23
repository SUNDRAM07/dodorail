import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { createDodoClient } from "@dodorail/dodo";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dodo's webhook payload follows the Standard-Webhooks envelope (they use
 * Svix under the hood). The top level is always `{ type, data, timestamp, id }`
 * where `data` is the resource (Payment, Refund, Dispute, etc.). For payment
 * events, `data` looks roughly like:
 *
 *   {
 *     object: "payment",
 *     id: "pmt_xxx",
 *     total_amount: 4900,          // cents
 *     currency: "USD",
 *     status: "succeeded" | "failed" | "processing" | "cancelled",
 *     payment_method: "card" | "upi" | "wallet" | ...,
 *     metadata: { invoiceId: "our-uuid" },   // set by us at checkout-create
 *     customer: { email, name, ... },
 *     created_at: ISO8601,
 *     ...
 *   }
 *
 * The handler is defensive about missing fields because (a) test-mode payloads
 * differ subtly from live, (b) our Day 2 mock POSTs a flat shape, and (c) we
 * don't want a single missing key to 400 a legit webhook.
 */

const BodySchema = z.object({
  type: z.string(),
  data: z
    .object({
      id: z.string().optional(),
      total_amount: z.number().optional(),
      amount: z.number().optional(),
      amountCents: z.number().optional(),
      currency: z.string().optional(),
      status: z.string().optional(),
      payment_method: z.string().optional(),
      rail: z.string().optional(), // our mock
      sourceAsset: z.string().optional(), // our mock
      invoiceId: z.string().optional(), // our mock
      metadata: z.record(z.string(), z.any()).optional(),
      mock: z.boolean().optional(),
    })
    .passthrough(),
});

type ParsedEvent = z.infer<typeof BodySchema>;

function railFromDodo(
  paymentMethod: string | undefined,
  mockRail: string | undefined,
): "DODO_CARD" | "DODO_UPI" | "SOLANA_USDC" | "IKA_BTC" | "IKA_ETH" | "X402_AGENT" {
  if (
    mockRail &&
    ["DODO_CARD", "DODO_UPI", "SOLANA_USDC", "IKA_BTC", "IKA_ETH", "X402_AGENT"].includes(mockRail)
  ) {
    return mockRail as ReturnType<typeof railFromDodo>;
  }
  const pm = (paymentMethod ?? "").toLowerCase();
  if (pm.includes("upi")) return "DODO_UPI";
  // Default: treat Dodo's card, wallet, netbanking, apple_pay, google_pay under DODO_CARD.
  return "DODO_CARD";
}

function sourceAssetFromRail(
  rail: ReturnType<typeof railFromDodo>,
  explicit: string | undefined,
): "USDC" | "USDG" | "BTC" | "ETH" | "INR_UPI" | "USD_CARD" {
  if (
    explicit &&
    ["USDC", "USDG", "BTC", "ETH", "INR_UPI", "USD_CARD"].includes(explicit.toUpperCase())
  ) {
    return explicit.toUpperCase() as ReturnType<typeof sourceAssetFromRail>;
  }
  if (rail === "DODO_UPI") return "INR_UPI";
  if (rail === "SOLANA_USDC") return "USDC";
  if (rail === "IKA_BTC") return "BTC";
  if (rail === "IKA_ETH") return "ETH";
  return "USD_CARD";
}

function extractInvoiceId(e: ParsedEvent): string | null {
  // Priority: metadata.invoiceId (live) > data.invoiceId (mock)
  const metaId = e.data.metadata?.invoiceId;
  if (typeof metaId === "string" && metaId.length > 0) return metaId;
  if (e.data.invoiceId) return e.data.invoiceId;
  return null;
}

function extractAmountCents(e: ParsedEvent): number | null {
  if (typeof e.data.total_amount === "number") return Math.round(e.data.total_amount);
  if (typeof e.data.amount === "number") return Math.round(e.data.amount);
  if (typeof e.data.amountCents === "number") return Math.round(e.data.amountCents);
  return null;
}

export async function POST(req: Request) {
  const webhookSignature = req.headers.get("webhook-signature") ?? "";
  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const rawBody = await req.text();

  // 1. Verify signature.
  const dodo = createDodoClient({
    mode: (process.env.DODORAIL_DODO_MODE ?? "mock") as "live" | "mock",
    apiKey: process.env.DODORAIL_DODO_KEY,
    webhookSecret: process.env.DODORAIL_DODO_WEBHOOK_SECRET,
  });

  let signatureOk: boolean;
  try {
    signatureOk = dodo.verifyWebhookSignature({
      body: rawBody,
      signature: webhookSignature,
      webhookId,
      timestamp: webhookTimestamp,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "signature_verifier_unavailable", detail: String(e) },
      { status: 500 },
    );
  }
  if (!signatureOk) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  // 2. Parse body.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_payload", issues: parsed.error.issues }, { status: 400 });
  }
  const event = parsed.data;

  // 3. Idempotency.
  if (webhookId) {
    const dup = await prisma.payment.findFirst({
      where: { dodoWebhookId: webhookId },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ ok: true, duplicate: true, paymentId: dup.id });
    }
  }

  // 4. Locate invoice.
  const invoiceId = extractInvoiceId(event);
  if (!invoiceId) {
    // Test-mode initial webhook can fire without our metadata (dashboard-triggered
    // test events). Acknowledge gracefully, log, move on.
    await prisma.event
      .create({
        data: {
          merchantId: (await prisma.merchant.findFirst({ select: { id: true } }))?.id ?? "unknown",
          type: "WEBHOOK_REJECTED",
          payload: { reason: "missing_invoice_id", type: event.type, webhookId },
        },
      })
      .catch(() => void 0);
    return NextResponse.json({ ok: true, noted: "no_invoice_metadata" });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, merchantId: true, amountUsdCents: true, status: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice_not_found", invoiceId }, { status: 404 });
  }

  // 5. Dispatch by event type.
  const rail = railFromDodo(event.data.payment_method, event.data.rail);
  const sourceAsset = sourceAssetFromRail(rail, event.data.sourceAsset);
  const amountCents = extractAmountCents(event) ?? invoice.amountUsdCents;

  const isSuccess =
    event.type === "payment.succeeded" || event.type === "checkout.session.completed";
  const isFailure = event.type === "payment.failed";
  const isCancelled = event.type === "payment.cancelled";
  const isProcessing = event.type === "payment.processing";
  const isRefundSucceeded = event.type === "refund.succeeded";

  if (isSuccess) {
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        merchantId: invoice.merchantId,
        rail,
        sourceAsset,
        sourceAmount: String(amountCents),
        status: "CONFIRMED",
        processedAt: new Date(),
        confirmedAt: new Date(),
        dodoPaymentId: event.data.id ?? null,
        dodoWebhookId: webhookId || null,
      },
    });
    if (invoice.status !== "PAID") {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    }
    await prisma.event.create({
      data: {
        merchantId: invoice.merchantId,
        type: "PAYMENT_RECEIVED",
        payload: {
          invoiceId: invoice.id,
          paymentId: payment.id,
          rail,
          amountCents,
          mock: Boolean(event.data.mock),
          eventType: event.type,
        },
      },
    });
    return NextResponse.json({ ok: true, paymentId: payment.id });
  }

  if (isFailure || isCancelled) {
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        merchantId: invoice.merchantId,
        rail,
        sourceAsset,
        sourceAmount: String(amountCents),
        status: isFailure ? "FAILED" : "PENDING",
        processedAt: new Date(),
        dodoPaymentId: event.data.id ?? null,
        dodoWebhookId: webhookId || null,
      },
    });
    return NextResponse.json({ ok: true, paymentId: payment.id, state: isFailure ? "failed" : "cancelled" });
  }

  if (isProcessing) {
    // Ack but don't write a Payment yet — we wait for success/failure.
    await prisma.event.create({
      data: {
        merchantId: invoice.merchantId,
        type: "PAYMENT_RECEIVED",
        payload: { invoiceId: invoice.id, phase: "processing", dodoPaymentId: event.data.id },
      },
    });
    return NextResponse.json({ ok: true, noted: "processing" });
  }

  if (isRefundSucceeded) {
    // Mark the Payment REFUNDED if we can find it by dodo_payment_id.
    if (event.data.id) {
      await prisma.payment
        .updateMany({
          where: { dodoPaymentId: event.data.id, merchantId: invoice.merchantId },
          data: { status: "REFUNDED" },
        })
        .catch(() => void 0);
    }
    return NextResponse.json({ ok: true, noted: "refund" });
  }

  // Forward-compat: unhandled types logged but 200'd.
  await prisma.event.create({
    data: {
      merchantId: invoice.merchantId,
      type: "WEBHOOK_REJECTED",
      payload: { reason: "unhandled_type", type: event.type, webhookId },
    },
  });
  return NextResponse.json({ ok: true, ignored: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "dodo-webhook", mode: process.env.DODORAIL_DODO_MODE ?? "mock" });
}
