/**
 * @dodorail/umbra — Umbra Privacy SDK integration.
 *
 * Exposes a `createUmbraClient()` factory conforming to the DodoRail
 * integration contract: mock + live modes, featureFlag, initialise +
 * healthcheck. Interface-compatible sibling to @dodorail/cloak — both can
 * back the merchant's "Pay privately" flow with a single Prisma update
 * (Merchant.privateProvider).
 *
 * Used by:
 *   - Customer pay page "Pay privately via Umbra" path (Phase C, apps/web)
 *   - Merchant settings provider switcher (Phase C)
 *   - Merchant compliance + history reconstruction
 *
 * Constraint: live mode supports mainnet AND devnet — this is the cheaper
 * privacy demo path until we fund mainnet wallets.
 *
 * Research doc: /FRONTIER/16_Frontier-Umbra-Side-Track_Master-Research.docx
 */
export { createUmbraClient, UMBRA_CONSTANTS } from "./client";
export type {
  UmbraClient,
  UmbraClientOptions,
  UmbraMode,
  UmbraNetwork,
  UmbraEncryptedAccount,
  UmbraDepositResult,
  UmbraWithdrawResult,
  UmbraPrivateTransferResult,
  UmbraClaimableUtxo,
  UmbraScanRow,
  WalletAdapterShape,
} from "./client";
