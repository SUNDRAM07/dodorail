/**
 * DodoRail's Dune Analytics integration — client factory.
 *
 * Follows the integration-isolation pattern (brief §3.4). Mirrors the shape of
 * every other @dodorail/integrations/* package:
 *   - `initialise()` · `healthcheck()` · `featureFlag`
 *   - Mandatory mock mode for dev + offline demos
 *   - Zero cross-package imports
 *
 * Day 5 scope:
 *   - `executeQuery(queryId)` — run or fetch cached result via Dune's REST API
 *   - `getLatestResult(queryId)` — cheap cached read, used for dashboard cards
 *   - `ping()` / `healthcheck()` — hit /api/v1/execution and validate 200
 *
 * We deliberately avoid the @duneanalytics/client-sdk in the first cut — using
 * plain fetch against the documented REST endpoints means we don't add a
 * transitive dep tree to Vercel's cold-start budget. We can swap to the SDK
 * later if its retry + polling ergonomics become worth it.
 *
 * Docs: https://docs.dune.com/api-reference/overview/introduction
 */

export type DuneMode = "live" | "mock";

export interface DuneClientOptions {
  apiKey?: string;
  mode?: DuneMode;
  /** Override for tests or alternate hosts. */
  baseUrl?: string;
  enabled?: boolean;
  /** Optional fetch override (tests, custom retries). */
  fetchImpl?: typeof fetch;
}

export interface DuneExecutionRow {
  // Dune rows are dynamic. Callers know their column shape and cast at use-site.
  [column: string]: unknown;
}

export interface DuneExecutionResult {
  queryId: number;
  executionId: string;
  state: "QUERY_STATE_PENDING" | "QUERY_STATE_EXECUTING" | "QUERY_STATE_COMPLETED" | "QUERY_STATE_FAILED" | string;
  rows: DuneExecutionRow[];
  executedAt: string | null;
  /** Milliseconds spent by Dune executing the query. */
  runtimeMs?: number;
}

export interface DuneClient {
  readonly mode: DuneMode;
  readonly featureFlag: boolean;
  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
  /** Returns the latest cached result for a saved query — cheap, no credits burned. */
  getLatestResult(queryId: number): Promise<DuneExecutionResult>;
  /** Kicks a fresh execution and polls until the result is ready. Burns credits. */
  executeQuery(queryId: number, pollMs?: number): Promise<DuneExecutionResult>;
}

const DEFAULT_BASE_URL = "https://api.dune.com/api/v1";

function mockRows(queryId: number): DuneExecutionRow[] {
  // Deterministic-but-varied mock rows so the dashboard looks alive in dev.
  const n = (queryId % 7) + 3;
  return Array.from({ length: n }).map((_, i) => ({
    day: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10),
    usdc_volume_usd: Math.round(1_000_000 * Math.sin((i + queryId) / 3) + 3_000_000),
    tx_count: 20_000 + ((queryId * 17 + i * 13) % 8_000),
  }));
}

export function createDuneClient(options: DuneClientOptions = {}): DuneClient {
  const mode: DuneMode = options.mode ?? "mock";
  const enabled = options.enabled ?? true;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(`[@dodorail/dune] ${op} called while featureFlag is false.`);
    }
    if (mode === "live" && !options.apiKey) {
      throw new Error(
        `[@dodorail/dune] ${op} requires DODORAIL_DUNE_KEY in live mode. Currently unset.`,
      );
    }
  }

  async function liveFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "x-dune-api-key": options.apiKey ?? "",
        ...(init?.headers ?? {}),
      },
    });
  }

  async function initialise(): Promise<void> {
    if (mode === "mock") return;
    guard("initialise");
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      guard("healthcheck");
      // There is no dedicated /health on Dune. We probe the metrics endpoint
      // which auth-gates early and returns fast.
      const res = await liveFetch("/metrics");
      return {
        ok: res.status < 500,
        latencyMs: Date.now() - started,
        message: res.ok ? "ok" : `http ${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  async function getLatestResult(queryId: number): Promise<DuneExecutionResult> {
    if (mode === "mock") {
      return {
        queryId,
        executionId: `mock_exec_${queryId}`,
        state: "QUERY_STATE_COMPLETED",
        rows: mockRows(queryId),
        executedAt: new Date().toISOString(),
        runtimeMs: 42,
      };
    }
    guard("getLatestResult");
    const res = await liveFetch(`/query/${queryId}/results`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `[@dodorail/dune] getLatestResult(${queryId}) failed: HTTP ${res.status} ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      execution_id: string;
      state: string;
      result?: { rows?: DuneExecutionRow[]; metadata?: { row_count?: number } };
      execution_ended_at?: string | null;
      // runtime_seconds is the normal Dune response field.
      execution_time_millis?: number;
    };
    return {
      queryId,
      executionId: json.execution_id,
      state: json.state,
      rows: json.result?.rows ?? [],
      executedAt: json.execution_ended_at ?? null,
      runtimeMs: json.execution_time_millis,
    };
  }

  async function executeQuery(queryId: number, pollMs = 1_500): Promise<DuneExecutionResult> {
    if (mode === "mock") return getLatestResult(queryId);
    guard("executeQuery");

    // 1. POST to kick the execution.
    const kick = await liveFetch(`/query/${queryId}/execute`, { method: "POST" });
    if (!kick.ok) {
      const text = await kick.text().catch(() => "");
      throw new Error(
        `[@dodorail/dune] executeQuery(${queryId}) kick failed: HTTP ${kick.status} ${text.slice(0, 300)}`,
      );
    }
    const { execution_id } = (await kick.json()) as { execution_id: string };

    // 2. Poll /status until completed / failed. Hard timeout at ~45s — matches
    // Vercel serverless max. Most Dune queries complete in <10s.
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const statusRes = await liveFetch(`/execution/${execution_id}/status`);
      if (!statusRes.ok) {
        const text = await statusRes.text().catch(() => "");
        throw new Error(
          `[@dodorail/dune] executeQuery status failed: HTTP ${statusRes.status} ${text.slice(0, 300)}`,
        );
      }
      const s = (await statusRes.json()) as { state: string };
      if (s.state === "QUERY_STATE_COMPLETED") break;
      if (s.state === "QUERY_STATE_FAILED" || s.state === "QUERY_STATE_CANCELLED") {
        throw new Error(`[@dodorail/dune] execution ${execution_id} ended in ${s.state}`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }

    // 3. Pull results.
    const resultsRes = await liveFetch(`/execution/${execution_id}/results`);
    if (!resultsRes.ok) {
      const text = await resultsRes.text().catch(() => "");
      throw new Error(
        `[@dodorail/dune] results fetch failed: HTTP ${resultsRes.status} ${text.slice(0, 300)}`,
      );
    }
    const json = (await resultsRes.json()) as {
      execution_id: string;
      state: string;
      result?: { rows?: DuneExecutionRow[] };
      execution_ended_at?: string | null;
      execution_time_millis?: number;
    };
    return {
      queryId,
      executionId: json.execution_id,
      state: json.state,
      rows: json.result?.rows ?? [],
      executedAt: json.execution_ended_at ?? null,
      runtimeMs: json.execution_time_millis,
    };
  }

  return {
    mode,
    featureFlag: enabled,
    initialise,
    healthcheck,
    getLatestResult,
    executeQuery,
  };
}
