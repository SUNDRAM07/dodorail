"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "@/lib/auth";
import { executeZapOut } from "@/lib/treasury-service";

const TriggerZapOutSchema = z.object({
  positionId: z.string().min(1),
});

/** Server action — close an open LP Agent position from the dashboard
 * Treasury Vault card. Mock mode is end-to-end safe; live mode submits
 * the LP Agent server-built zap-out transaction. */
export async function triggerZapOutAction(
  input: z.infer<typeof TriggerZapOutSchema>,
): Promise<{ ok: true; receivedUsdcCents: number } | { ok: false; error: string }> {
  const session = await requireSession().catch(() => null);
  if (!session) return { ok: false, error: "unauthenticated" };

  const parsed = TriggerZapOutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation" };

  try {
    const result = await executeZapOut({
      merchantId: session.merchant.id,
      positionId: parsed.data.positionId,
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, receivedUsdcCents: result.receivedUsdcCents };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
