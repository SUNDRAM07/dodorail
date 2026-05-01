/**
 * Data adapter factory — pluggable Treasury Agent data source.
 *
 * Picks the active adapter from the `DODORAIL_AGENT_DATA_SOURCE` env var:
 *   - "zerion" (default) — Zerion v1 HTTP API or CLI, Solana-only
 *   - "goldrush"          — GoldRush BalanceService, multi-chain ready
 *
 * Both adapters return the same `WalletAnalysis` shape so the agent loop
 * + reasoner are agnostic to which is active. This is the layered design
 * pattern the Day 13 Zerion essay called out (wrapper at the edge,
 * decisions in the app) — and what file 17 §10 (LP Agent winning bar)
 * named "decision-making wrapper, not pass-through."
 */

import { createGoldRushAdapter } from "./goldrush.js";
import { createZerionAdapter, type ZerionAdapter } from "./zerion.js";

export type DataSource = "zerion" | "goldrush";

export function getActiveDataSource(): DataSource {
  const raw = process.env.DODORAIL_AGENT_DATA_SOURCE?.toLowerCase();
  if (raw === "goldrush") return "goldrush";
  return "zerion";
}

export function createDataAdapter(): ZerionAdapter {
  const source = getActiveDataSource();
  if (source === "goldrush") {
    return createGoldRushAdapter();
  }
  return createZerionAdapter();
}
