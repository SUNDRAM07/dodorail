import { NextResponse } from "next/server";

import { prisma } from "@dodorail/db";
import { extractReference } from "@/lib/solana-pay";

export const runtime = "nodejs";

/**
 * GET /api/invoices/[id]/solana-pay
 *
 * Returns the Solana Pay URL + its extracted pieces so the customer page
 * can render a QR without re-deriving the URL client-side. Public endpoint.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      solanaPayUrl: true,
      amountUsdCents: true,
      status: true,
      merchant: { select: { solanaWalletAddress: true, name: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!invoice.solanaPayUrl) {
    return NextResponse.json({ error: "solana_pay_not_enabled" }, { status: 404 });
  }
  return NextResponse.json({
    invoiceId: invoice.id,
    url: invoice.solanaPayUrl,
    reference: extractReference(invoice.solanaPayUrl),
    recipient: invoice.merchant.solanaWalletAddress,
    amountUsdCents: invoice.amountUsdCents,
    merchantName: invoice.merchant.name,
    status: invoice.status,
  });
}
