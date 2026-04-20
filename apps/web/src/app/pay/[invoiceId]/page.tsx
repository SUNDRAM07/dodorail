import { notFound } from "next/navigation";
import { BRAND, RAILS, type RailId } from "@dodorail/sdk";

import { prisma } from "@dodorail/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PayPanel } from "./pay-panel";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export const metadata = {
  title: "Pay invoice",
  robots: { index: false, follow: false },
};

export default async function PayPage({ params }: PageProps) {
  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { merchant: true },
  });
  if (!invoice) notFound();

  const railDefs = invoice.acceptedRails
    .map((id) => RAILS[id as RailId])
    .filter((r): r is (typeof RAILS)[RailId] => Boolean(r));

  const expired = new Date(invoice.expiresAt).getTime() < Date.now();
  const paid = invoice.status === "PAID";

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_hsl(22_78%_57%_/_0.08),_transparent_50%)]"
      />
      <header className="border-b border-line/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="wordmark text-xl font-semibold">{BRAND.wordmark}</span>
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              checkout
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            secured by {BRAND.name} · MIT-licensed
          </p>
        </div>
      </header>

      <section className="flex flex-1 items-start justify-center px-6 py-12">
        <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_1.2fr]">
          {/* Left: invoice summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pay {invoice.merchant.name}</CardTitle>
              <CardDescription>
                Invoice from{" "}
                <span className="font-mono text-foreground">
                  {invoice.merchant.snsDomain ?? invoice.merchant.slug + ".dodorail.sol"}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Amount
                </p>
                <p className="text-3xl font-semibold">
                  ${(invoice.amountUsdCents / 100).toFixed(2)}{" "}
                  <span className="text-sm text-muted-foreground">USD</span>
                </p>
              </div>
              {invoice.description && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    For
                  </p>
                  <p className="text-sm">{invoice.description}</p>
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <Row label="Invoice" value={invoice.id.slice(0, 8)} />
                <Row label="Status" value={invoice.status} />
                <Row label="Expires" value={new Date(invoice.expiresAt).toLocaleString()} />
                <Row label="Private" value={invoice.privateMode ? invoice.privateProvider : "off"} />
              </div>
            </CardContent>
          </Card>

          {/* Right: rail picker */}
          <div className="space-y-3">
            {paid ? (
              <Card className="border-emerald-500/40">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Badge variant="shipped" className="uppercase">
                    Paid
                  </Badge>
                  <p className="text-lg font-medium">This invoice is settled.</p>
                  <p className="text-sm text-muted-foreground">
                    Thank you. A receipt has been emailed to {invoice.customerEmail}.
                  </p>
                </CardContent>
              </Card>
            ) : expired ? (
              <Card className="border-destructive/40">
                <CardContent className="py-12 text-center">
                  <Badge variant="outline" className="uppercase">
                    Expired
                  </Badge>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Ask {invoice.merchant.name} to send a fresh link.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <PayPanel invoiceId={invoice.id} rails={railDefs} amountCents={invoice.amountUsdCents} />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-foreground">{value}</p>
    </div>
  );
}
