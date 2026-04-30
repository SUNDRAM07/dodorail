/**
 * @dodorail/lpagent — LP Agent API integration (idle-treasury yield via Meteora DLMM).
 * Research doc: /mnt/FRONTIER/17_Frontier-LPAgent-API-Sidetrack_Master-Research.docx
 */

export { createLpAgentClient, CURATED_POOLS, LP_AGENT_CONSTANTS } from "./client";
export type {
  LpAgentClient,
  LpAgentClientOptions,
  LpAgentMode,
  LpAgentPool,
  LpAgentPoolStatistics,
  LpAgentTopLper,
  LpPosition,
  LpPositionMetrics,
  ZapInQuote,
  ZapInResult,
  ZapOutQuote,
  ZapOutResult,
} from "./client";
