/**
 * GoldRush adapter — alternative data layer for the Treasury Agent.
 *
 * Why this exists alongside the Zerion adapter (Day 13):
 *   Per Prajin's Day 13 DM (saved at .auto-memory/project_goldrush_prajin_full_access.md),
 *   GoldRush's value proposition for a merchant treasury watcher is its
 *   normalised cross-chain account model. "Don't fight Solana/EVM account
 *   model differences, just abstract them — managing BTC, ETH, SOL, NEAR,
 *   and other chains from a single treasury without switching networks
 *   or juggling wallets."
 *
 *   The Zerion adapter built Day 13 only filters Solana-side data because
 *   that's where merchant USDC settlement lands. The GoldRush adapter is
 *   structured to read multiple chains at once for the SAME wallet
 *   address (which won't return matches for chains the address can't
 *   exist on, but Solana-mainnet always returns useful data) — and once
 *   the Merchant model gains an `evmWalletAddress` field (Day 16+), the
 *   same adapter trivially expands to query both addresses across both
 *   account models.
 *
 * What this adapter trades vs Zerion:
 *   + Multi-chain shape native (call with chain[] array, get aggregated)
 *   + Existing GoldRush package wrapper (no new HTTP code)
 *   + Free full-tier access during the hackathon (Prajin's offer)
 *   - No 24h PnL field (Zerion includes this; GoldRush doesn't surface
 *     it directly — we set pnl24hUsd to 0 and mark it as a known gap)
 *   - No per-tx counterparty extraction (GoldRush gives plaintext
 *     descriptions but not a structured "from" field per transfer)
 *
 * Selection: agent picks via DODORAIL_AGENT_DATA_SOURCE env var. Defaults
 * to "zerion" for backward-compat. Set to "goldrush" to use this adapter.
 *
 * Mock mode is fully self-contained so the agent runs without any keys —
 * same posture as the rest of DodoRail's integration packages.
 */

import { createGoldRushClient } from "@dodorail/goldrush";
import type { GoldRushChain } from "@dodorail/goldrush";

import type {
  WalletAnalysis,
  ZerionAdapter,
  ZerionMode,
  ZerionTokenPosition,
  ZerionRecentTransfer,
} from "./zerion.js";

export type GoldRushAdapterMode = "mock" | "live";

export interface GoldRushAdapterOptions {
  apiKey?: string;
  mode?: GoldRushAdapterMode;
  /** Chains to query in parallel. Defaults to Solana-mainnet only; once we
   * add an evmWalletAddress field on Merchant we'll extend this list. */
  chains?: GoldRushChain[];
  fetchImpl?: typeof fetch;
}

const DEFAULT_CHAINS: GoldRushChain[] = ["solana-mainnet"];
const USDC_CONTRACTS_BY_CHAIN: Record<string, string> = {
  "solana-mainnet": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "eth-mainnet": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "base-mainnet": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "matic-mainnet": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  "bsc-mainnet": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  "arbitrum-mainnet": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
};

/** Identify whether a balance row is "USDC equivalent" — by canonical
 * contract address per chain (preferred) OR symbol fallback. */
function isUsdcRow(
  contractAddress: string,
  symbol: string,
  chain: GoldRushChain,
): boolean {
  const expected = USDC_CONTRACTS_BY_CHAIN[chain];
  if (expected && contractAddress.toLowerCase() === expected.toLowerCase()) {
    return true;
  }
  // Fallback: chains we don't enumerate yet but USDC symbol matches.
  return symbol.trim().toUpperCase() === "USDC";
}

/** Mock fixture — multi-chain by design so the demo recording shows the
 * cross-chain story even without API keys. */
function deterministicMock(
  wallet: string,
  chains: GoldRushChain[],
): WalletAnalysis {
  let seed = 0;
  for (let i = 0; i < wallet.length; i++) {
    seed = (seed * 31 + wallet.charCodeAt(i)) | 0;
  }
  const a = Math.abs(seed);
  const positions: ZerionTokenPosition[] = [];

  // SOL position (always)
  positions.push({
    symbol: "SOL",
    chainId: "solana-mainnet",
    amountFloat: 5.2 + ((a % 100) / 100) * 3,
    valueUsd: 850 + (a % 200),
  });
  // USDC on Solana
  const solanaUsdc = 1_500 + (a % 4_000);
  positions.push({
    symbol: "USDC",
    chainId: "solana-mainnet",
    amountFloat: solanaUsdc,
    valueUsd: solanaUsdc,
  });
  // If we've been asked for EVM chains too, populate plausible
  // cross-chain positions so the agent's reasoning surface gets richer.
  if (chains.includes("eth-mainnet")) {
    const ethUsdc = 200 + (a % 800);
    positions.push({
      symbol: "USDC",
      chainId: "eth-mainnet",
      amountFloat: ethUsdc,
      valueUsd: ethUsdc,
    });
    positions.push({
      symbol: "ETH",
      chainId: "eth-mainnet",
      amountFloat: 0.05 + (a % 30) / 1000,
      valueUsd: 180 + (a % 60),
    });
  }
  if (chains.includes("base-mainnet")) {
    const baseUsdc = 100 + (a % 400);
    positions.push({
      symbol: "USDC",
      chainId: "base-mainnet",
      amountFloat: baseUsdc,
      valueUsd: baseUsdc,
    });
  }

  const totalValueUsd = positions.reduce((s, p) => s + p.valueUsd, 0);
  const idleUsdcCents = positions
    .filter((p) => isUsdcRow("", p.symbol, p.chainId))
    .reduce((s, p) => s + Math.round(p.amountFloat * 100), 0);

  const recentTransfers: ZerionRecentTransfer[] = [
    {
      signature: `mockGR_A${a.toString(36)}`,
      timestamp: Math.floor(Date.now() / 1000) - 600,
      direction: "in",
      symbol: "USDC",
      amountFloat: 47.5,
      valueUsd: 47.5,
      counterparty: "8Hd…xQ4",
    },
    {
      signature: `mockGR_B${a.toString(36)}`,
      timestamp: Math.floor(Date.now() / 1000) - 4200,
      direction: "in",
      symbol: "USDC",
      amountFloat: 199,
      valueUsd: 199,
      counterparty: "Bz9…WnK",
    },
  ];

  return {
    wallet,
    totalValueUsd,
    idleUsdcCents,
    pnl24hUsd: 0, // GoldRush doesn't surface 24h PnL; flag as known-gap
    recentTransfers,
    positions,
    source: "mock",
  };
}

/** Live adapter — fans out to GoldRush per chain, aggregates results. */
async function fetchLiveAnalysis(
  wallet: string,
  chains: GoldRushChain[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<WalletAnalysis> {
  const client = createGoldRushClient({
    apiKey,
    mode: "live",
    fetchImpl,
  });

  // Per-chain balance + tx fetches in parallel. If one chain fails, we
  // log + continue — partial data is better than no data for the agent.
  const perChain = await Promise.allSettled(
    chains.map(async (chain) => {
      const [balances, txs] = await Promise.all([
        client.getTokenBalances(wallet, chain),
        client.getRecentTransactions(wallet, { pageSize: 10, chain }),
      ]);
      return { chain, balances, txs };
    }),
  );

  const positions: ZerionTokenPosition[] = [];
  const recentTransfers: ZerionRecentTransfer[] = [];
  let idleUsdcCents = 0;
  let totalValueUsd = 0;

  for (const r of perChain) {
    if (r.status !== "fulfilled") {
      console.warn("[goldrush-adapter] chain fetch failed:", r.reason);
      continue;
    }
    const { chain, balances, txs } = r.value;

    for (const b of balances) {
      const valueUsd = b.quoteUsd ?? 0;
      positions.push({
        symbol: b.symbol,
        chainId: chain,
        amountFloat: b.balanceUi,
        valueUsd,
      });
      totalValueUsd += valueUsd;
      if (isUsdcRow(b.contractAddress, b.symbol, chain)) {
        idleUsdcCents += Math.round(b.balanceUi * 100);
      }
    }

    for (const t of txs) {
      recentTransfers.push({
        signature: t.signature,
        timestamp: Math.floor(new Date(t.blockSignedAt).getTime() / 1000),
        // GoldRush plaintext description doesn't reliably encode direction
        // — we infer from the description string and fall back to "in".
        direction: t.description?.toLowerCase().includes("send") ? "out" : "in",
        symbol: "?", // GoldRush doesn't break out per-transfer symbol cleanly
        amountFloat: 0,
        valueUsd: 0,
      });
    }
  }

  return {
    wallet,
    totalValueUsd,
    idleUsdcCents,
    pnl24hUsd: 0, // not surfaced by GoldRush
    recentTransfers: recentTransfers
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10),
    positions,
    source: "http",
  };
}

export function createGoldRushAdapter(
  options: GoldRushAdapterOptions = {},
): ZerionAdapter {
  const apiKey = options.apiKey ?? process.env.DODORAIL_GOLDRUSH_KEY;
  const mode: GoldRushAdapterMode = options.mode ?? (apiKey ? "live" : "mock");
  const fetchImpl = options.fetchImpl ?? fetch;
  const chains = options.chains ?? DEFAULT_CHAINS;

  // Cast `mode` to ZerionMode shape so this adapter is interchangeable
  // with the Zerion one downstream (the agent loop only reads `mode` for
  // logging — both "mock" and "http" are valid values from its POV).
  const exposedMode: ZerionMode = mode === "live" ? "http" : "mock";

  async function getWalletAnalysis(wallet: string): Promise<WalletAnalysis> {
    if (mode === "mock" || !apiKey) {
      return deterministicMock(wallet, chains);
    }
    return fetchLiveAnalysis(wallet, chains, apiKey, fetchImpl);
  }

  async function healthcheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    message?: string;
  }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock" };
    }
    try {
      const client = createGoldRushClient({
        apiKey,
        mode: "live",
        fetchImpl,
      });
      const result = await client.healthcheck();
      return {
        ok: result.ok,
        latencyMs: Date.now() - started,
        message: result.message ?? "ok",
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "unknown",
      };
    }
  }

  return { mode: exposedMode, getWalletAnalysis, healthcheck };
}

/** Surface for the receipt + GoldRush essay update. Lists which chains
 * the adapter is currently configured for. */
export function getConfiguredChains(): GoldRushChain[] {
  return DEFAULT_CHAINS;
}
