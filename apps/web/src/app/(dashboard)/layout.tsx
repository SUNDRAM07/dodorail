import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet, LogOut, Plus, LayoutDashboard, FileText, ShieldCheck } from "lucide-react";

import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@dodorail/sdk";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/sign-in");
  const { merchant } = s;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="wordmark text-xl font-semibold">
              {BRAND.wordmark}
            </Link>
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              merchant
            </Badge>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
            >
              <LayoutDashboard className="size-4" /> Dashboard
            </Link>
            <Link
              href="/dashboard/invoices/new"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
            >
              <FileText className="size-4" /> Invoices
            </Link>
            <Link
              href="/dashboard/settings"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground"
            >
              <ShieldCheck className="size-4" /> Privacy
            </Link>
            <Button size="sm" asChild>
              <Link href="/dashboard/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
            <div className="ml-3 hidden sm:flex items-center gap-2 rounded-md border border-line px-2 py-1 font-mono text-xs">
              <Wallet className="size-3 text-burnt" />
              <span className="text-muted-foreground truncate max-w-[12ch]">
                {merchant.solanaWalletAddress.slice(0, 4)}…{merchant.solanaWalletAddress.slice(-4)}
              </span>
            </div>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
