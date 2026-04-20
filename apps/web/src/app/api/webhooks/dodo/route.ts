import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { createDodoClient } from "@dodorail/dodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EventSchema = z.object({
  type: z.string(),
  data: z.object({
    invoiceId: z.string().uuid(),
    rail: z
      .enum(["DODO_CARD", "DODO_UPI", "SOLANA_USDC", "IKA_BTC", "IKA_ETH", "X402_AGENT"])
      .optional()
      .default("DODO_CARD"),
    sourceAsset: z
      .enum(["USDC", "USDG", "BTC", "ETH", "INR_UPI", "USD_CARD"])
      .optional()
      .default("USD_CARD"),
    amountCents: z.number().int().positive().optional(),
    dodoPaymentId: z.string().optional(),
    mock: z.boolean().optional(),
  }),
});

/**
 * POST /api/webhooks/dodo
 *
 * Receives Dodo Payments webhooks (Standard-Webhooks spec). Day 2 uses
 * @dodorail/dodo's mock mode where any non-empty `webhook-signature` passes.
 * Day 4-5 flips to live signature verification with the real secret.
 *
 * Never skip signature verification, even in dev — the integration pattern
 * depends on it. File 23 §12 rule #22.
 */
export async function POST(req: Request) {
  const webhookSignature = req.headers.get("webhook-signature") ?? "";
  const webhookId = req.headers.get("webhook-id") ?? "";
  const webhookTimestamp = req.headers.get("webhook-timestamp") ?? "";
  const rawBody = await req.text();

  // 1. Verify signature (mock mode for Day 2).
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
  const parsed = EventSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { type, data } = parsed.data;

  // 3. Idempotency: if we've already processed this webhookId, 200 and exit.
  if (webhookId) {
    const dup = await prisma.payment.findFirst({
      where: { dodoWebhookId: webhookId },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ ok: true, duplicate: true, paymentId: dup.id });
    }
  }

  // 4. Find the invoice (and implicitly the merchant).
  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    select: { id: true, merchantId: true, amountUsdCents: true, status: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  }

  // 5. Process based on event type. Day 2 handles one happy path.
  switch (type) {
    case "payment.succeeded":
    case "checkout.session.completed": {
      const payment = await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          merchantId: invoice.merchantId,
          rail: data.rail,
          sourceAsset: data.sourceAsset,
          sourceAmount: String(data.amountCents ?? invoice.amountUsdCents),
          status: "CONFIRMED",
          processedAt: new Date(),
          confirmedAt: new Date(),
          dodoPaymentId: data.dodoPaymentId ?? null,
          dodoWebhookId: webhookId || null,
        },
      });
      if (invoice.status !== "PAID") {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: "PAID" },
        });
      }
      await prisma.event.create({
        data: {
          merchantId: invoice.merchantId,
          type: "PAYMENT_RECEIVED",
          payload: {
            invoiceId: invoice.id,
            paymentId: payment.id,
            rail: data.rail,
            amountCents: data.amountCents ?? invoice.amountUsdCents,
            mock: Boolean(data.mock),
          },
        },
      });
      return NextResponse.json({ ok: true, paymentId: payment.id });
    }
    case "payment.failed": {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          merchantId: invoice.merchantId,
          rail: data.rail,
          sourceAsset: data.sourceAsset,
          sourceAmount: String(data.amountCents ?? invoice.amountUsdCents),
          status: "FAILED",
          processedAt: new Date(),
          dodoPaymentId: data.dodoPaymentId ?? null,
          dodoWebhookId: webhookId || null,
        },
      });
      return NextResponse.json({ ok: true, noted: "failure" });
    }
    default:
      // Record but don't act — useful for forward-compat.
      await prisma.event.create({
        data: {
          merchantId: invoice.merchantId,
          type: "WEBHOOK_REJECTED",
          payload: { reason: "unhandled_type", type, webhookId },
        },
      });
      return NextResponse.json({ ok: true, ignored: true });
  }
}

/** GET for uptime checks. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "dodo-webhook" });
}
