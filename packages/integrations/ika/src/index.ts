/**
 * @dodorail/ika — Ika dWallet integration (bridgeless BTC/ETH via 2PC-MPC).
 *
 * Architectural-only against Solana pre-alpha (mock signer). When Ika ships
 * Alpha 1 with real distributed signatures, the live mode here flips on
 * with no DodoRail-side code changes.
 *
 * Used by:
 *   - Customer pay page "Pay with BTC / ETH" cross-chain rails (Phase B)
 *   - Architectural showcase in the Encrypt × Ika submission essay
 *
 * Research doc: /FRONTIER/15_Frontier-Encrypt-Ika-Track_Master-Research.docx
 */
export { createIkaClient, IKA_CONSTANTS } from "./client";
export type {
  IkaClient,
  IkaClientOptions,
  IkaMode,
  IkaNetwork,
  IkaSupportedChain,
  IkaDWallet,
  IkaSignatureRequest,
  IkaSignatureResult,
} from "./client";
