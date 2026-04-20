"use client";

import type { ReactNode } from "react";

import { DodorailWalletProvider } from "./wallet-provider";

/**
 * Top-level client-side provider composition. Keeps RootLayout clean.
 * Add future providers (SessionProvider, Posthog, etc.) here.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <DodorailWalletProvider>{children}</DodorailWalletProvider>;
}
