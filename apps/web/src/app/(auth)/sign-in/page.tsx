import Link from "next/link";
import { BRAND } from "@dodorail/sdk";

import { SignInCard } from "@/components/auth/sign-in-card";

export const metadata = {
  title: "Sign in",
  description: `Sign in to ${BRAND.name} with your Solana wallet.`,
};

interface SignInPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/dashboard";
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_hsl(22_78%_57%_/_0.1),_transparent_55%)]"
      />
      <header className="border-b border-line/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="wordmark text-xl font-semibold text-foreground">
              {BRAND.wordmark}
            </span>
          </Link>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-burnt"
          >
            ← Back to home
          </Link>
        </div>
      </header>
      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <SignInCard next={next} />
      </section>
    </main>
  );
}
