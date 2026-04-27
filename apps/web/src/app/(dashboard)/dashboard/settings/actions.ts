"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { requireSession } from "@/lib/auth";

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
