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
      payment_id: z.string().optional(), // Dodo live payload uses this for pay_xxx
      total_amount: z.number().optional(),
      amount: z.number().optional(),
      amountCents: z.number().optional(),
      currency: z.string().optional(),
      status: z.string().optional(),
      payment_method: z.string().optional(),
      checkout_session_id: z.string().optional(), // Dodo live — the cks_xxx we stored at creation
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
  // Priority: metadata.invoiceId (live + mock when we set it) > data.invoiceId (pure mock)
  const metaId = e.data.metadata?.invoiceId;
  if (typeof metaId === "string" && metaId.length > 0) return metaId;
  if (e.data.invoiceId) return e.data.invoiceId;
  return null;
}

function extractCheckoutSessionId(e: ParsedEvent): string | null {
  // Dodo's payment.* webhook payload includes the originating checkout session id.
  // Metadata we passed to POST /checkouts does NOT propagate to the payment object,
  // so we match on checkout_session_id as the primary fallback.
  const v = e.data.checkout_session_id;
  return typeof v === "string" && v.length > 0 ? v : null;
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
  //
  // Two lookup paths:
  //   (a) metadata.invoiceId — works for our mock payloads and for checkout-level
  //       events (checkout.session.completed carries the metadata we set).
  //   (b) checkout_session_id — the live-mode payment.* events DROP checkout
  //       metadata, so we match on the cks_xxx we persisted at invoice creation
  //       (dodoSessionId column). This is the primary path for real Dodo
  //       payments, and has been the bug that kept invoices stuck OPEN after
  //       Day 4's live-mode flip.
  const invoiceIdFromMeta = extractInvoiceId(event);
  const checkoutSessionId = extractCheckoutSessionId(event);

  let invoice = invoiceIdFromMeta
    ? await prisma.invoice.findUnique({
        where: { id: invoiceIdFromMeta },
        select: { id: true, merchantId: true, amountUsdCents: true, status: true },
      })
    : null;

  if (!invoice && checkoutSessionId) {
    invoice = await prisma.invoice.findFirst({
      where: { dodoSessionId: checkoutSessionId },
      select: { id: true, merchantId: true, amountUsdCents: true, status: true },
    });
  }

  if (!invoice) {
    // No invoice match by either path — test-mode dashboard pings or stale
    // events. Log, ack, move on. Don't 4xx — Dodo would retry forever.
    await prisma.event
      .create({
        data: {
          merchantId: (await prisma.merchant.findFirst({ select: { id: true } }))?.id ?? "unknown",
          type: "WEBHOOK_REJECTED",
          payload: {
            reason: "invoice_not_found",
            type: event.type,
            webhookId,
            invoiceIdFromMeta,
            checkoutSessionId,
          },
        },
      })
      .catch(() => void 0);
    return NextResponse.json({
      ok: true,
      noted: "no_matching_invoice",
      invoiceIdFromMeta,
      checkoutSessionId,
    });
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
        dodoPaymentId: event.data.payment_id ?? event.data.id ?? null,
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
        dodoPaymentId: event.data.payment_id ?? event.data.id ?? null,
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
    const refundPaymentId = event.data.payment_id ?? event.data.id;
    if (refundPaymentId) {
      await prisma.payment
        .updateMany({
          where: { dodoPaymentId: refundPaymentId, merchantId: invoice.merchantId },
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
