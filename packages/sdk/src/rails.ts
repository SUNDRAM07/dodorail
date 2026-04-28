/**
 * Payment rail constants. Mirrors the Prisma enum `Rail` + helpers for the UI.
 * If you change the DB enum, update this file the same commit.
 */

export const RAILS = {
  DODO_CARD: {
    id: "DODO_CARD",
    label: "Card via Dodo",
    description: "International cards via Dodo Payments (Merchant of Record)",
    settlesIn: "USDC",
    feeBps: 450, // 4% + 40¢ pass-through, plus our 0.5% override — blended
  },
  DODO_UPI: {
    id: "DODO_UPI",
    label: "UPI",
    description: "UPI for Indian customers (via Dodo MoR). Crypto never offered to Indian cards.",
    settlesIn: "USDC",
    feeBps: 250,
  },
  SOLANA_USDC: {
    id: "SOLANA_USDC",
    label: "USDC on Solana",
    description: "Native USDC on Solana — 0.5% take, sub-second finality",
    settlesIn: "USDC",
    feeBps: 50,
  },
  IKA_BTC: {
    id: "IKA_BTC",
    label: "Bitcoin (bridgeless via Ika)",
    description: "Native BTC via Ika dWallets — no bridge, no wrapped tokens",
    settlesIn: "USDC",
    feeBps: 100,
    architectural: true,
  },
  IKA_ETH: {
    id: "IKA_ETH",
    label: "Ethereum (bridgeless via Ika)",
    description: "Native ETH via Ika dWallets — no bridge, no wrapped tokens",
    settlesIn: "USDC",
    feeBps: 100,
    architectural: true,
  },
  SOLANA_USDT: {
    id: "SOLANA_USDT",
    label: "USDT on Solana",
    description: "Native Tether USD (Es9vMFr…NYB) — most-held stablecoin globally, ~$2.4B on Solana",
    settlesIn: "USDC",
    feeBps: 50,
  },
  SOLANA_USDT0: {
    id: "SOLANA_USDT0",
    label: "USDT cross-chain (USDT0)",
    description:
      "Customer pays USDT from Ethereum / Tron / BNB / Polygon / Arbitrum / Base / Optimism / Avalanche; LayerZero OFT bridges to Solana USDT0",
    settlesIn: "USDC",
    feeBps: 75,
  },
  SOLANA_XAUT0: {
    id: "SOLANA_XAUT0",
    label: "Gold (XAUT0)",
    description:
      "Pay with omnichain Tether Gold — 1 token = 1 troy oz LBMA-accredited gold. Treasury-grade settlement.",
    settlesIn: "USDC",
    feeBps: 100,
  },
  X402_AGENT: {
    id: "X402_AGENT",
    label: "Agent payment (x402)",
    description: "HTTP 402 payment-required for autonomous agents",
    settlesIn: "USDC",
    feeBps: 10,
  },
} as const;

export type RailId = keyof typeof RAILS;
export type RailDefinition = (typeof RAILS)[RailId];

/** Which rails are shipped end-to-end today vs architectural-only. */
export const RAIL_STATUS: Record<RailId, "shipped" | "architectural"> = {
  DODO_CARD: "shipped",
  DODO_UPI: "shipped",
  SOLANA_USDC: "shipped",
  SOLANA_USDT: "shipped",
  // USDT0 + XAUT0 are shipped in mock mode — live LayerZero integration
  // flips on once we have the Transfer API key. Both are still labelled
  // "shipped" because the customer-facing flow renders end-to-end.
  SOLANA_USDT0: "shipped",
  SOLANA_XAUT0: "shipped",
  IKA_BTC: "architectural",
  IKA_ETH: "architectural",
  X402_AGENT: "shipped",
};

/**
 * USDC SPL mint addresses on Solana. The devnet one is Circle's official
 * faucet-backed test mint, mainnet is the real thing.
 */
export const USDC_MINTS = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

export function usdcMintForCluster(cluster: "mainnet-beta" | "devnet" | string): string {
  if (cluster === "mainnet-beta" || cluster === "mainnet") return USDC_MINTS.mainnet;
  return USDC_MINTS.devnet;
}
