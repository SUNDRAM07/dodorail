import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { prisma } from "@dodorail/db";
import { getSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "./copy-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const s = await getSession();
  if (!s) redirect("/sign-in");

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!invoice || invoice.merchantId !== s.merchant.id) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const payUrl = `${appUrl || ""}/pay/${invoice.id}`;

  return (
    <div className="container max-w-3xl py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-burnt mb-6"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-xs text-muted-foreground">invoice · {invoice.id.slice(0, 8)}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            ${(invoice.amountUsdCents / 100).toFixed(2)} USDC
          </h1>
          <p className="text-muted-foreground">
            {invoice.description ?? "(no description)"} · for{" "}
            <span className="text-foreground">{invoice.customerEmail}</span>
          </p>
        </div>
        <Badge
          variant={
            invoice.status === "PAID" ? "shipped" : invoice.status === "OPEN" ? "burnt" : "outline"
          }
          className="uppercase"
        >
          {invoice.status}
        </Badge>
      </div>

      <Separator className="my-8" />

      <Card>
        <CardHeader>
          <CardTitle>Customer payment link</CardTitle>
          <CardDescription>
            Share this URL with your customer. It shows a rail picker and the Solana Pay QR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-line bg-background/60 px-3 py-2 font-mono text-xs">
            <span className="truncate flex-1">{payUrl || "(set NEXT_PUBLIC_APP_URL)"}</span>
            <CopyButton value={payUrl} />
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/pay/${invoice.id}`} target="_blank">
              <ExternalLink className="size-3.5" /> Open customer view
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 font-mono text-sm">
          <Row label="Rails" value={invoice.acceptedRails.join(", ") || "—"} />
          <Row label="Private mode" value={invoice.privateMode ? invoice.privateProvider : "off"} />
          <Row
            label="Expires"
            value={new Date(invoice.expiresAt).toLocaleString()}
          />
          <Row label="Created" value={new Date(invoice.createdAt).toLocaleString()} />
          {invoice.dodoCheckoutUrl && (
            <Row label="Dodo checkout" value={invoice.dodoCheckoutUrl.slice(0, 48) + "…"} />
          )}
          <Row label="Payments" value={`${invoice.payments.length}`} />
        </CardContent>
      </Card>

      {invoice.payments.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-line">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3">
                <div className="font-mono text-xs">
                  <p>{p.id.slice(0, 8)}</p>
                  <p className="text-muted-foreground">
                    {p.rail} · {p.sourceAsset}
                  </p>
                </div>
                <Badge
                  variant={
                    p.status === "CONFIRMED" ? "shipped" : p.status === "PENDING" ? "burnt" : "outline"
                  }
                >
                  {p.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
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
