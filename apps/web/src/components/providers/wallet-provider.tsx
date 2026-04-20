"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  SolflareWalletAdapter,
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * Wraps the app tree with Solana wallet context.
 *
 * Devnet default in dev, mainnet-beta in production. Judges click live demos
 * on mainnet (file 23 §12 rule #21).
 */
export function DodorailWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
      return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    }
    return process.env.NODE_ENV === "production"
      ? clusterApiUrl("mainnet-beta")
      : clusterApiUrl("devnet");
  }, []);

  // Backpack was dropped from @solana/wallet-adapter-wallets in 2025; users
  // with Backpack installed are auto-detected by the WalletModal via Wallet
  // Standard. Phantom + Solflare explicit covers our early merchant base.
  const wallets = useMemo(
    () => [new SolflareWalletAdapter(), new PhantomWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
