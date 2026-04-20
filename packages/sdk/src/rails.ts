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
  IKA_BTC: "architectural",
  IKA_ETH: "architectural",
  X402_AGENT: "shipped",
};
