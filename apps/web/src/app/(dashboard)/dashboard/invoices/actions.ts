"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { createDodoClient } from "@dodorail/dodo";
import { requireSession } from "@/lib/auth";

const CreateSchema = z.object({
  amountUsd: z.string().refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0, {
    message: "Amount must be a positive number.",
  }),
  description: z.string().max(280).optional(),
  customerEmail: z.string().email(),
  customerName: z.string().max(120).optional(),
  acceptedRails: z
    .array(z.enum(["DODO_CARD", "DODO_UPI", "SOLANA_USDC", "X402_AGENT"]))
    .min(1, "Pick at least one rail."),
  privateMode: z.boolean().optional().default(false),
});

export type CreateInvoiceInput = z.infer<typeof CreateSchema>;

export type CreateInvoiceResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function normalise(raw: FormData): unknown {
  const rails = raw.getAll("acceptedRails").map(String);
  return {
    amountUsd: String(raw.get("amountUsd") ?? ""),
    description: (raw.get("description") ?? "").toString() || undefined,
    customerEmail: String(raw.get("customerEmail") ?? ""),
    customerName: (raw.get("customerName") ?? "").toString() || undefined,
    acceptedRails: rails,
    privateMode: raw.get("privateMode") === "on",
  };
}

export async function createInvoiceAction(_: unknown, formData: FormData): Promise<CreateInvoiceResult> {
  const session = await requireSession().catch(() => null);
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = CreateSchema.safeParse(normalise(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const amountCents = Math.round(parseFloat(input.amountUsd) * 100);

  // Call Dodo — mock mode on Day 2. Returns a deterministic-looking checkout URL.
  const dodo = createDodoClient({
    mode: (process.env.DODORAIL_DODO_MODE ?? "mock") as "live" | "mock",
    apiKey: process.env.DODORAIL_DODO_KEY,
  });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const invoice = await prisma.invoice.create({
    data: {
      merchantId: session.merchant.id,
      amountUsdCents: amountCents,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      description: input.description,
      expiresAt,
      acceptedRails: input.acceptedRails,
      privateMode: input.privateMode ?? false,
      privateProvider: input.privateMode ? "UMBRA" : "NONE",
    },
  });

  try {
    const session_ = await dodo.createCheckoutSession({
      merchantId: session.merchant.dodoMerchantId ?? session.merchant.id,
      amountCents,
      currency: "USD",
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      description: input.description,
      metadata: { invoiceId: invoice.id },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { dodoCheckoutUrl: session_.url },
    });
  } catch (e) {
    console.warn("[createInvoiceAction] dodo mock session failed:", e);
  }

  await prisma.event.create({
    data: {
      merchantId: session.merchant.id,
      type: "INVOICE_CREATED",
      payload: { invoiceId: invoice.id, amountCents, rails: input.acceptedRails },
    },
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/invoices/${invoice.id}`);
}
