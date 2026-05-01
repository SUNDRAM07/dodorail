/**
 * Data adapter factory — pluggable Treasury Agent data source.
 *
 * Picks the active adapter from the `DODORAIL_AGENT_DATA_SOURCE` env var:
 *   - "zerion" (default) — Zerion v1 HTTP API or CLI, Solana-only, API-key auth
 *   - "goldrush"          — GoldRush BalanceService, multi-chain ready
 *   - "zerion-x402"       — Zerion via x402-on-Solana, keyless self-funded
 *
 * All three adapters return the same `WalletAnalysis` shape so the agent
 * loop + reasoner are agnostic to which is active. This is the layered
 * design pattern the Day 13 Zerion essay called out (wrapper at the edge,
 * decisions in the app) — and what file 17 §10 (LP Agent winning bar)
 * named "decision-making wrapper, not pass-through."
 *
 * Adapter selection guidance (per docs):
 *   - Default to "zerion" (API key, simplest)
 *   - Switch to "goldrush" for cross-chain reads (BTC/ETH/SOL/etc in one call)
 *   - Switch to "zerion-x402" for the keyless self-funded narrative — the
 *     Zerion track essay's strongest claim. Requires DODORAIL_X402_AGENT_PRIVKEY
 *     pointing at a USDC-funded Solana wallet (Day 20+ post-funding).
 */

import { createGoldRushAdapter } from "./goldrush.js";
import { createZerionAdapter, type ZerionAdapter } from "./zerion.js";
import { createZerionX402Adapter } from "./zerion-x402.js";

export type DataSource = "zerion" | "goldrush" | "zerion-x402";

export function getActiveDataSource(): DataSource {
  const raw = process.env.DODORAIL_AGENT_DATA_SOURCE?.toLowerCase();
  if (raw === "goldrush") return "goldrush";
  if (raw === "zerion-x402") return "zerion-x402";
  return "zerion";
}

export function createDataAdapter(): ZerionAdapter {
  const source = getActiveDataSource();
  if (source === "goldrush") {
    return createGoldRushAdapter();
  }
  if (source === "zerion-x402") {
    return createZerionX402Adapter();
  }
  return createZerionAdapter();
}
