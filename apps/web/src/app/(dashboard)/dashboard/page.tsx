import Link from "next/link";
import { ArrowRight, Plus, TrendingUp, Receipt, Users } from "lucide-react";

import { prisma } from "@dodorail/db";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function DashboardHome() {
  const s = await getSession();
  if (!s) return null; // middleware redirects, but keep TS happy
  const { merchant } = s;

  // Day 3 TODO: add a Payment.amountUsdCents integer column for volume math.
  // sourceAmount is stringly-typed for multi-asset flexibility, so aggregate
  // sum is a Day 3 concern once we split settled-USD out into its own column.
  const [invoiceCount, paidInvoices] = await Promise.all([
    prisma.invoice.count({ where: { merchantId: merchant.id } }),
    prisma.invoice.count({ where: { merchantId: merchant.id, status: "PAID" } }),
  ]);
  const totalVolumeCents = 0;

  const recentInvoices = await prisma.invoice.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="container py-10">
      {/* Welcome */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge variant="burnt" className="mb-2 font-mono text-[10px] uppercase tracking-widest">
            Day 2 · merchant dashboard
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome, <span className="text-burnt">{merchant.name}</span>
          </h1>
          <p className="mt-1 text-muted-foreground">
            Slug <span className="wordmark">{merchant.slug}</span> · referral code{" "}
            <span className="font-mono text-foreground">{merchant.referralCode}</span>
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/dashboard/invoices/new">
            <Plus /> New invoice
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Invoices</CardTitle>
            <Receipt className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{invoiceCount}</div>
            <p className="text-xs text-muted-foreground">{paidInvoices} paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Volume (USDC)</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">${(totalVolumeCents / 100).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">lifetime confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Referrals</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">0</div>
            <p className="text-xs text-muted-foreground">
              share <span className="font-mono text-burnt">{merchant.referralCode}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-10" />

      {/* Recent invoices */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent invoices</h2>
        {recentInvoices.length > 0 && (
          <Link
            href="/dashboard/invoices/new"
            className="text-sm text-muted-foreground hover:text-burnt"
          >
            Create another →
          </Link>
        )}
      </div>

      {recentInvoices.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Receipt className="size-8 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">No invoices yet.</p>
              <p className="text-sm text-muted-foreground">
                Create your first invoice and copy the customer checkout link.
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/invoices/new">
                Create first invoice <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-4 grid gap-3">
          {recentInvoices.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-muted-foreground">
                    {inv.id.slice(0, 8)}
                  </span>
                  <span className="text-sm">{inv.description ?? "(no description)"}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.customerEmail} · {new Date(inv.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono font-semibold">
                    ${(inv.amountUsdCents / 100).toFixed(2)}
                  </span>
                  <Badge
                    variant={
                      inv.status === "PAID"
                        ? "shipped"
                        : inv.status === "OPEN"
                          ? "burnt"
                          : "outline"
                    }
                  >
                    {inv.status}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" asChild className="ml-4">
                  <Link href={`/dashboard/invoices/${inv.id}`}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
