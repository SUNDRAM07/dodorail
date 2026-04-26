/**
 * @dodorail/goldrush — GoldRush (Covalent) integration.
 *
 * Exposes a `createGoldRushClient()` factory conforming to the DodoRail
 * integration contract: mock + live modes, featureFlag, initialise +
 * healthcheck. See client.ts for the full surface.
 *
 * Used by:
 *   - Merchant dashboard live balance + activity tiles (Day 6+ wiring)
 *   - Public ecosystem page at /public/dashboard (Day 7+)
 *   - Treasury Agent (separate repo, Day 13)
 *
 * Constraint: GoldRush indexes Solana mainnet only. Devnet is unsupported.
 *
 * Research doc: /FRONTIER/08_Frontier-GoldRush-Covalent-Track_Master-Research.docx
 */
export { createGoldRushClient } from "./client";
export type {
  GoldRushClient,
  GoldRushClientOptions,
  GoldRushChain,
  GoldRushMode,
  GoldRushTokenBalance,
  GoldRushTransactionSummary,
} from "./client";
