"use client";

import { Suspense, type ReactNode } from "react";

import { DodorailWalletProvider } from "./wallet-provider";
import { PostHogProvider } from "./posthog-provider";

/**
 * Top-level client-side provider composition. Keeps RootLayout clean.
 *
 * Order matters:
 *   1. Posthog outermost — so we capture pageviews even if wallet adapter
 *      hydration is slow.
 *   2. Suspense — for the `usePathname` / `useSearchParams` reads inside
 *      PostHogProvider (Next 15 requires bailout for search params).
 *   3. Wallet provider inside — owns the Solana connection context.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PostHogProvider>
        <DodorailWalletProvider>{children}</DodorailWalletProvider>
      </PostHogProvider>
    </Suspense>
  );
}
