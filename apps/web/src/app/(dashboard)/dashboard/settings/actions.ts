"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { CURATED_POOLS } from "@dodorail/lpagent";
import { requireSession } from "@/lib/auth";
import { executeZapIn } from "@/lib/treasury-service";

const ProviderSchema = z.enum(["NONE", "CLOAK", "UMBRA", "MAGICBLOCK"]);

const UpdatePrivacyProviderSchema = z.object({
  provider: ProviderSchema,
  privateModeDefault: z.boolean().optional(),
});

/**
 * Server action — update the merchant's preferred privacy provider.
 *
 * This drives:
 *   - Default `Invoice.privateProvider` for new invoices (read in
 *     `dashboard/invoices/actions.ts`)
 *   - The pay-panel's "Pay privately via X" branch on the customer side
 *   - The compliance export flow (each provider has its own SDK helper —
 *     /api/compliance/cloak vs /api/compliance/umbra, future-prep)
 *
 * Validation is permissive — we accept any of the four enum values, with
 * MAGICBLOCK being intentionally selectable even though we ship it as
 * architectural-only. Merchants who set MAGICBLOCK get a "pending — TDX
 * attested rollout" banner on the customer pay page, and their invoices
 * fall back to CLOAK at creation time. That's a Phase D follow-up; for
 * Day 8 we just store the preference.
 */
export async function updatePrivacyProviderAction(
  _: unknown,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession().catch(() => null);
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = UpdatePrivacyProviderSchema.safeParse({
    provider: String(formData.get("provider") ?? "NONE"),
    privateModeDefault: formData.get("privateModeDefault") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: "validation" };
  }

  await prisma.merchant.update({
    where: { id: session.merchant.id },
    data: {
      privateProvider: parsed.data.provider,
      privateModeDefault: parsed.data.privateModeDefault ?? false,
    },
  });

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Treasury Vault — LP Agent / Meteora DLMM yield                              */
/* -------------------------------------------------------------------------- */

const PoolIdSchema = z.enum([
  "usdc-sol-meteora-dlmm",
  "usdc-usdt-meteora-dlmm",
  "usdc-bsol-meteora-dlmm",
]);

const UpdateTreasurySchema = z.object({
  yieldEnabled: z.boolean(),
  thresholdUsd: z
    .string()
    .refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) >= 100, {
      message: "Threshold must be at least $100.",
    }),
  selectedPoolId: PoolIdSchema,
});

/**
 * Server action — update the merchant's Treasury Vault configuration:
 *   - whether yield is enabled at all
 *   - the idle-USDC threshold above which auto-deploy fires
 *   - the curated Meteora DLMM pool the cron should target
 *
 * Pool selection is persisted via a no-op TreasuryPosition row (status=CLOSED,
 * amounts=0) until Day 12 promotes this to a `Merchant.lpAgentSelectedPool`
 * column. This avoids a schema migration on Day 11 and keeps the lookup
 * consistent with `treasury-service.ts:getMerchantTreasuryView`.
 */
export async function updateTreasuryConfigAction(
  _: unknown,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }> {
  const session = await requireSession().catch(() => null);
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = UpdateTreasurySchema.safeParse({
    yieldEnabled: formData.get("yieldEnabled") === "on",
    thresholdUsd: String(formData.get("thresholdUsd") ?? "500"),
    selectedPoolId: String(formData.get("selectedPoolId") ?? CURATED_POOLS[0]!.id),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const thresholdCents = Math.round(parseFloat(parsed.data.thresholdUsd) * 100);

  await prisma.merchant.update({
    where: { id: session.merchant.id },
    data: {
      yieldEnabled: parsed.data.yieldEnabled,
      yieldThresholdCents: thresholdCents,
      yieldProvider: parsed.data.yieldEnabled ? "LP_AGENT" : "NONE",
    },
  });

  // Pin the pool selection — write a sentinel TreasuryPosition row (CLOSED,
  // zero-amount) so `getMerchantTreasuryView` picks up the most-recent poolId.
  // We only do this if the merchant changed the pool to avoid duplicate rows.
  const existingMostRecent = await prisma.treasuryPosition.findFirst({
    where: {
      merchantId: session.merchant.id,
      protocol: "LP_AGENT_METEORA",
    },
    orderBy: { createdAt: "desc" },
    select: { poolId: true },
  });
  if (existingMostRecent?.poolId !== parsed.data.selectedPoolId) {
    await prisma.treasuryPosition.create({
      data: {
        merchantId: session.merchant.id,
        protocol: "LP_AGENT_METEORA",
        poolId: parsed.data.selectedPoolId,
        depositedAmount: "0",
        currentValue: "0",
        pnlCents: 0,
        apr: 0,
        status: "CLOSED", // marker row, not a real position
      },
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

const TriggerZapInSchema = z.object({
  poolId: PoolIdSchema,
  amountUsdcCents: z.number().int().min(10_000), // min $100
});

/** Server action — kick off a one-shot zap-in from the dashboard's "Deploy
 * now" button. In live mode this needs a signed transaction round-trip; on
 * Day 11 mock mode we synthesise the position and emit the event so the UI
 * has something to render. Day 12's cron path uses the same
 * `executeZapIn` underneath. */
export async function triggerZapInAction(
  input: z.infer<typeof TriggerZapInSchema>,
): Promise<{ ok: true; positionId: string } | { ok: false; error: string }> {
  const session = await requireSession().catch(() => null);
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = TriggerZapInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };

  try {
    const result = await executeZapIn({
      merchantId: session.merchant.id,
      poolId: parsed.data.poolId,
      amountUsdcCents: parsed.data.amountUsdcCents,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, positionId: result.positionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
