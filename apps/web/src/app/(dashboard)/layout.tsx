import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, LayoutDashboard, FileText, ShieldCheck } from "lucide-react";

import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@dodorail/sdk";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { WalletPill } from "@/components/wallet-pill";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/sign-in");
  const { merchant } = s;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line/60 bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/dashboard" className="wordmark text-lg font-semibold sm:text-xl truncate">
              {BRAND.wordmark}
            </Link>
            <Badge variant="outline" className="hidden font-mono text-[10px] uppercase tracking-wider sm:inline-flex">
              merchant
            </Badge>
          </div>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
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
            <WalletPill address={merchant.solanaWalletAddress} />
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
