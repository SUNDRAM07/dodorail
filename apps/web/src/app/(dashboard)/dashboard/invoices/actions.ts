"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { createDodoClient } from "@dodorail/dodo";
import { requireSession } from "@/lib/auth";
import { buildSolanaPayUrl } from "@/lib/solana-pay";

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

  // Read the merchant's preferred privacy provider (settable from
  // /dashboard/settings). When the merchant hasn't picked, default to CLOAK
  // since that's the track-narrative match. NONE is reserved for
  // privateMode === false invoices.
  const merchantRow = await prisma.merchant.findUnique({
    where: { id: session.merchant.id },
    select: { privateProvider: true },
  });
  const merchantProvider = merchantRow?.privateProvider ?? "NONE";
  const resolvedProvider = input.privateMode
    ? merchantProvider !== "NONE"
      ? merchantProvider
      : "CLOAK"
    : "NONE";

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
      privateProvider: resolvedProvider,
    },
  });

  // Dodo flow (for DODO_CARD / DODO_UPI rails):
  //   1. Create an ad-hoc Product with the exact invoice amount.
  //   2. Create a Checkout Session referencing that Product, with the invoice
  //      id in metadata so webhooks can round-trip.
  //   3. Store both on the Invoice row. If any call fails, we still have a
  //      working invoice (Solana Pay path is independent).
  if (
    input.acceptedRails.some((r) => r === "DODO_CARD" || r === "DODO_UPI") &&
    dodo.mode === "live"
  ) {
    try {
      const product = await dodo.createProduct({
        name: `DodoRail invoice ${invoice.id.slice(0, 8)}`,
        description: input.description ?? `Invoice from ${session.merchant.name}`,
        amountCents,
        currency: "USD",
        taxCategory: "saas",
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { dodoProductId: product.id },
      });
      const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://dodorail.vercel.app"}/pay/${invoice.id}?dodo=complete`;
      const checkout = await dodo.createCheckoutSession({
        merchantId: session.merchant.dodoMerchantId ?? session.merchant.id,
        productId: product.id,
        amountCents,
        currency: "USD",
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        description: input.description,
        returnUrl,
        metadata: { invoiceId: invoice.id, merchantSlug: session.merchant.slug },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { dodoCheckoutUrl: checkout.url, dodoSessionId: checkout.id },
      });
    } catch (e) {
      console.warn("[createInvoiceAction] dodo live session failed:", e);
    }
  } else {
    // Mock fallback — useful in dev or when Dodo rails aren't accepted.
    try {
      const checkout = await dodo.createCheckoutSession({
        merchantId: session.merchant.dodoMerchantId ?? session.merchant.id,
        productId: undefined,
        amountCents,
        currency: "USD",
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        description: input.description,
        metadata: { invoiceId: invoice.id },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { dodoCheckoutUrl: checkout.url, dodoSessionId: checkout.id },
      });
    } catch (e) {
      console.warn("[createInvoiceAction] dodo mock session failed:", e);
    }
  }

  // Generate a Solana Pay URL if the USDC-on-Solana rail is accepted. Store
  // the full solana: URL on the Invoice — the QR renderer + polling endpoint
  // both read from it.
  if (input.acceptedRails.includes("SOLANA_USDC")) {
    try {
      const rpcCluster: "mainnet-beta" | "devnet" =
        (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "").includes("mainnet")
          ? "mainnet-beta"
          : "devnet";
      const sp = buildSolanaPayUrl({
        merchantWalletAddress: session.merchant.solanaWalletAddress,
        amountUsdCents: amountCents,
        invoiceId: invoice.id,
        merchantLabel: session.merchant.name,
        description: input.description,
        cluster: rpcCluster,
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { solanaPayUrl: sp.url },
      });
    } catch (e) {
      console.warn("[createInvoiceAction] solana pay url generation failed:", e);
    }
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
