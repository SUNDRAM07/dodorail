import { NextResponse } from "next/server";

import { prisma } from "@dodorail/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // SNS RPC can be slow; give it time

/**
 * POST /api/enrich/sns/[merchantId]
 *
 * Called fire-and-forget from /api/auth/solana/verify after a successful
 * sign-in. Runs SNS reverse-lookup in its own serverless invocation so the
 * auth path never waits on @bonfida's cold-start.
 *
 * Auth: `x-dodorail-enrich-token` must match `DODORAIL_SESSION_SECRET`. This
 * prevents public callers from scanning arbitrary merchants.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ merchantId: string }> },
): Promise<NextResponse> {
  const token = req.headers.get("x-dodorail-enrich-token");
  if (!token || token !== process.env.DODORAIL_SESSION_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { merchantId } = await params;

  const merchant = await prisma.merchant
    .findUnique({ where: { id: merchantId }, select: { id: true, solanaWalletAddress: true, snsDomain: true } })
    .catch(() => null);
  if (!merchant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Already has an SNS domain — nothing to do.
  if (merchant.snsDomain) {
    return NextResponse.json({ ok: true, cached: true, snsDomain: merchant.snsDomain });
  }

  let snsDomain: string | null = null;
  try {
    // Dynamic import inside the handler so a failed module load doesn't crash
    // the whole function. Matches the defence-in-depth we applied on Day 3.
    const { reverseLookupSns } = await import("@/lib/sns");
    snsDomain = await Promise.race([
      reverseLookupSns(merchant.solanaWalletAddress),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
  } catch (err) {
    return NextResponse.json(
      {
        ok: true,
        snsDomain: null,
        error: "sns_lookup_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }, // soft-fail; auth already succeeded
    );
  }

  if (snsDomain) {
    await prisma.merchant
      .update({ where: { id: merchantId }, data: { snsDomain } })
      .catch(() => void 0);
  }

  return NextResponse.json({ ok: true, snsDomain });
}
