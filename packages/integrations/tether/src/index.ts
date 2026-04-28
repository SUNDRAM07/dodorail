/**
 * @dodorail/tether — Tether asset family on Solana.
 *
 * Three assets, one factory:
 *   - USDT (native SPL)
 *   - USDT0 (LayerZero OFT, omnichain — cross-chain from Ethereum / Tron /
 *     BNB / Polygon / Arbitrum / Base / Optimism / Avalanche)
 *   - XAUT0 (omnichain Tether Gold, 1 token = 1 troy oz LBMA-accredited gold)
 *
 * Mock + live modes. Live mode requires DODORAIL_LAYERZERO_KEY for USDT0
 * cross-chain quotes; native USDT and XAUT0 work without it (vanilla SPL).
 *
 * Research doc: /FRONTIER/22_Frontier-Tether-Track_Master-Research.docx
 */
export {
  createTetherClient,
  TETHER_MINTS,
  TETHER_DECIMALS,
  USDT0_SOURCE_CHAINS,
} from "./client";
export type {
  TetherClient,
  TetherClientOptions,
  TetherAsset,
  TetherMode,
  TetherNetwork,
  Usdt0SourceChain,
  Usdt0BridgeQuote,
} from "./client";
