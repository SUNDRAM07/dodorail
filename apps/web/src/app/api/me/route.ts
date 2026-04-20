import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    merchant: {
      id: s.merchant.id,
      slug: s.merchant.slug,
      name: s.merchant.name,
      email: s.merchant.email,
      snsDomain: s.merchant.snsDomain,
      solanaWalletAddress: s.merchant.solanaWalletAddress,
      referralCode: s.merchant.referralCode,
    },
  });
}
