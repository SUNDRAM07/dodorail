"use client";

import { useState } from "react";
import { Wallet, Check, Copy } from "lucide-react";

/**
 * Click-to-copy wallet pill — replaces the static text-only pill that lived
 * in the dashboard top-bar through Day 9. Click copies the full Solana
 * address to clipboard + briefly flips the icon to a check. Solves the
 * Day 5/6 carryover ("merchant dropdown polish") with the smallest possible
 * UX gain — full DropdownMenu can land Day 16 polish week if we want.
 */
export function WalletPill({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore — user can just see the truncated address */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied!" : `Click to copy · ${address}`}
      className="ml-3 hidden sm:flex items-center gap-2 rounded-md border border-line px-2 py-1 font-mono text-xs hover:border-burnt/60 hover:bg-burnt/5 transition-colors"
    >
      <Wallet className="size-3 text-burnt" />
      <span className="text-muted-foreground truncate max-w-[12ch]">
        {address.slice(0, 4)}…{address.slice(-4)}
      </span>
      {copied ? (
        <Check className="size-3 text-emerald-400" />
      ) : (
        <Copy className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}
