/**
 * @dodorail/dune — Dune Analytics integration.
 *
 * Exposes a factory `createDuneClient()` conforming to the DodoRail integration
 * contract: mock + live modes, featureFlag, initialise + healthcheck. See
 * client.ts for the full surface.
 *
 * Used by:
 *   - Public ecosystem dashboard at /public/dune (Day 7+)
 *   - Merchant dashboard historical volume card (Day 6-7)
 *   - Posthog-mirrored aggregate metrics (Day 8)
 *
 * Research doc: /FRONTIER/06_Frontier-Dune-Analytics-Track_Master-Research.docx
 * Code addendum: /FRONTIER/12_Frontier-Dune-Track_Code-Addendum.docx
 */
export { createDuneClient } from "./client";
export type {
  DuneClient,
  DuneClientOptions,
  DuneExecutionResult,
  DuneExecutionRow,
  DuneMode,
} from "./client";
