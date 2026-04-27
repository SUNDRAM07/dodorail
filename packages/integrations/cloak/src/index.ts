/**
 * @dodorail/cloak — Cloak privacy integration.
 *
 * Exposes a `createCloakClient()` factory conforming to the DodoRail
 * integration contract: mock + live modes, featureFlag, initialise +
 * healthcheck. See client.ts for the full surface.
 *
 * Used by:
 *   - Customer pay page "Pay privately via Cloak" path (Phase C, apps/web)
 *   - Merchant settings "Export audit CSV" button (Phase D)
 *   - Merchant balance + history reconstruction (Phase D)
 *
 * Constraint: live mode is mainnet-only as of 2026-04-26 (devnet types
 * exist in the SDK but no operational devnet relay/circuits yet).
 *
 * Research doc: /FRONTIER/20_Frontier-Cloak-Track_Master-Research.docx
 */
export { createCloakClient, CLOAK_CONSTANTS } from "./client";
export type {
  CloakClient,
  CloakClientOptions,
  CloakMode,
  CloakNetwork,
  CloakNote,
  CloakDepositResult,
  CloakWithdrawResult,
  CloakScanRow,
  WalletAdapterShape,
} from "./client";
