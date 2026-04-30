/**
 * @dodorail/lpagent — LP Agent (Nimbus Data Labs) API integration.
 *
 * LP Agent wraps Meteora DLMM behind an open data + transaction API. We use
 * it to deploy merchant idle USDC into curated Meteora pools, track positions,
 * and zap-out on demand when the merchant needs liquidity.
 *
 * Why LP Agent (vs rolling our own Meteora SDK):
 *   - Pool discovery + statistics + top-LPers in one API call set
 *   - Server-builds the zap-in / zap-out transactions — we don't have to
 *     learn DLMM bin math or rebalancing logic
 *   - Tutorial-quality docs at docs.lpagent.io with full OpenAPI spec
 *   - Tracks the autonomous-LP category that already has shipped winners
 *     (Cleopetra, Voltr, Meridian) — we get the same primitives without
 *     writing them
 *
 * What we expose (matching the integration-isolation contract — see
 * `packages/integrations/README.md`):
 *   - `discoverPools()`           → GET /pools
 *   - `getPoolStatistics(id)`     → GET /pools/:id/statistics
 *   - `getTopLpers(id)`           → GET /pools/:id/top-lpers (Copy-LP source)
 *   - `quoteZapIn()`              → builds the zap-in tx without submitting
 *   - `submitZapIn()`             → POST /zap-in/submit
 *   - `getOpenPositions(wallet)`  → GET /positions/open
 *   - `getPositionMetrics(wallet)`→ GET /positions/metrics
 *   - `getZapOutQuote()`          → GET /zap-out/quotes
 *   - `submitZapOut()`            → POST /zap-out/submit
 *
 * That's 9 endpoints — competitive-tier coverage per file 17 §10
 * "What 'API integrate' means here".
 *
 * Mock mode is fully self-contained — every endpoint returns deterministic
 * realistic data so the dashboard / cron / pay-page render end-to-end without
 * an API key. Live mode dynamically uses fetch against the LP Agent base URL
 * once `apiKey` + `mode: "live"` are passed in.
 *
 * Research doc: /FRONTIER/17_Frontier-LPAgent-API-Sidetrack_Master-Research.docx
 */

export type LpAgentMode = "live" | "mock";

export interface LpAgentClientOptions {
  /** API key from the LP Agent dashboard. Required for `mode: "live"`. */
  apiKey?: string;
  /** Defaults to `"mock"` if no apiKey is supplied. */
  mode?: LpAgentMode;
  enabled?: boolean;
  /** Override fetch impl for tests. */
  fetchImpl?: typeof fetch;
  /** Override the API base URL (rare — only for staging / proxy testing). */
  baseUrl?: string;
}

/** The three curated Meteora DLMM pools DodoRail offers merchants by default.
 * Picked for: high TVL (low slippage), stable-anchored (lower IL than volatile
 * pairs), liquid quote sides. Merchants can override per-merchant later — for
 * v1 these are the sane defaults. */
export const CURATED_POOLS: ReadonlyArray<{
  id: string;
  label: string;
  pair: string;
  quote: "USDC";
  rationale: string;
}> = [
  {
    id: "usdc-sol-meteora-dlmm",
    label: "USDC ↔ SOL",
    pair: "USDC-SOL",
    quote: "USDC",
    rationale: "Highest-liquidity USDC pair on Meteora — best fills, lowest IL on a recovering SOL.",
  },
  {
    id: "usdc-usdt-meteora-dlmm",
    label: "USDC ↔ USDT",
    pair: "USDC-USDT",
    quote: "USDC",
    rationale: "Stable-stable pair — minimal IL, fees-driven yield. Conservative default.",
  },
  {
    id: "usdc-bsol-meteora-dlmm",
    label: "USDC ↔ bSOL",
    pair: "USDC-bSOL",
    quote: "USDC",
    rationale: "Liquid-staked SOL — pairs USDC with bSOL's intrinsic LST yield on top of fee yield.",
  },
];

export interface LpAgentPool {
  id: string;
  pair: string;
  tvlUsd: number;
  apr24h: number;
  volume24hUsd: number;
}

export interface LpAgentPoolStatistics extends LpAgentPool {
  fees24hUsd: number;
  fees7dUsd: number;
  apr7d: number;
  binStep: number;
  baseFeeBps: number;
}

export interface LpAgentTopLper {
  wallet: string;
  positionValueUsd: number;
  pnl30dUsd: number;
  apr30d: number;
}

export interface ZapInQuote {
  poolId: string;
  amountUsdcCents: number;
  expectedLpTokens: string;
  estimatedSlippageBps: number;
  /** Base64-encoded VersionedTransaction the merchant signs. Empty in mock. */
  transactionB64: string;
  /** Diagnostic — mock vs live API. */
  source: "live-api" | "mock";
}

export interface ZapInResult {
  positionId: string;
  txSig: string;
  poolId: string;
  amountUsdcCents: number;
}

export interface LpPosition {
  id: string;
  poolId: string;
  pair: string;
  depositedUsdcCents: number;
  currentValueUsdcCents: number;
  feesEarnedUsdcCents: number;
  pnlCents: number;
  apr: number;
  openedAt: string; // ISO
  inRange: boolean;
}

export interface LpPositionMetrics {
  totalDepositedUsdcCents: number;
  totalCurrentValueUsdcCents: number;
  totalFeesEarnedUsdcCents: number;
  totalPnlCents: number;
  weightedApr: number;
  positionCount: number;
}

export interface ZapOutQuote {
  positionId: string;
  expectedUsdcCents: number;
  estimatedSlippageBps: number;
  transactionB64: string;
  source: "live-api" | "mock";
}

export interface ZapOutResult {
  positionId: string;
  txSig: string;
  receivedUsdcCents: number;
}

export interface LpAgentClient {
  readonly mode: LpAgentMode;
  readonly featureFlag: boolean;

  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;

  /** Read endpoints. */
  discoverPools(opts?: { quoteSymbol?: "USDC"; limit?: number }): Promise<LpAgentPool[]>;
  getPoolStatistics(poolId: string): Promise<LpAgentPoolStatistics>;
  getTopLpers(poolId: string, limit?: number): Promise<LpAgentTopLper[]>;
  getOpenPositions(wallet: string): Promise<LpPosition[]>;
  getPositionMetrics(wallet: string): Promise<LpPositionMetrics>;
  getZapOutQuote(input: { positionId: string; wallet: string }): Promise<ZapOutQuote>;

  /** Write endpoints (build + submit). */
  quoteZapIn(input: {
    poolId: string;
    amountUsdcCents: number;
    wallet: string;
  }): Promise<ZapInQuote>;
  submitZapIn(input: {
    poolId: string;
    amountUsdcCents: number;
    wallet: string;
    signedTransactionB64: string;
  }): Promise<ZapInResult>;
  submitZapOut(input: {
    positionId: string;
    wallet: string;
    signedTransactionB64: string;
  }): Promise<ZapOutResult>;
}

const LP_AGENT_BASE_URL = "https://api.lpagent.io/v1";

// --- Mock-mode helpers ---------------------------------------------------

function mockPool(id: string, pair: string, tvl: number, apr: number, vol: number): LpAgentPool {
  return { id, pair, tvlUsd: tvl, apr24h: apr, volume24hUsd: vol };
}

const MOCK_POOLS: LpAgentPool[] = [
  mockPool("usdc-sol-meteora-dlmm", "USDC-SOL", 14_200_000, 28.4, 6_800_000),
  mockPool("usdc-usdt-meteora-dlmm", "USDC-USDT", 8_400_000, 9.2, 2_100_000),
  mockPool("usdc-bsol-meteora-dlmm", "USDC-bSOL", 5_900_000, 18.1, 1_450_000),
];

function mockStats(p: LpAgentPool): LpAgentPoolStatistics {
  return {
    ...p,
    fees24hUsd: p.volume24hUsd * 0.0008,
    fees7dUsd: p.volume24hUsd * 0.0008 * 6.5,
    apr7d: p.apr24h * 0.92,
    binStep: 25,
    baseFeeBps: 8,
  };
}

function mockTopLpers(): LpAgentTopLper[] {
  return [
    {
      wallet: "TopLp1AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSs",
      positionValueUsd: 184_200,
      pnl30dUsd: 22_400,
      apr30d: 41.2,
    },
    {
      wallet: "TopLp2BbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTt",
      positionValueUsd: 96_500,
      pnl30dUsd: 9_800,
      apr30d: 33.7,
    },
    {
      wallet: "TopLp3CcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUu",
      positionValueUsd: 52_100,
      pnl30dUsd: 4_200,
      apr30d: 27.9,
    },
  ];
}

function mockZapInQuote(input: {
  poolId: string;
  amountUsdcCents: number;
}): ZapInQuote {
  return {
    poolId: input.poolId,
    amountUsdcCents: input.amountUsdcCents,
    // Roughly proportional to deposit; numerical specifics don't matter in mock
    // — UI just shows the number to confirm the wrapper round-trips.
    expectedLpTokens: String(BigInt(Math.round(input.amountUsdcCents * 9_500))),
    estimatedSlippageBps: 12,
    transactionB64: "",
    source: "mock",
  };
}

function deterministicPositionId(wallet: string, poolId: string): string {
  // Stable-by-input id so the dashboard renders the same mock position across
  // re-renders. Real LP Agent positions are uuids — `mock_` prefix flags it.
  const trimmed = wallet.slice(0, 6) + poolId.slice(0, 6);
  return `mock_pos_${trimmed.replace(/[^A-Za-z0-9]/g, "_")}`;
}

function mockOpenPositions(wallet: string): LpPosition[] {
  // Demo populates one open position so the dashboard yield card has
  // something to show. The numbers tell a coherent story: ~$2,500 deposited
  // a few days ago, ~3% paper PnL, ~24% APR on USDC-SOL.
  const openedDaysAgo = 4;
  const openedAt = new Date(Date.now() - openedDaysAgo * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: deterministicPositionId(wallet, "usdc-sol-meteora-dlmm"),
      poolId: "usdc-sol-meteora-dlmm",
      pair: "USDC-SOL",
      depositedUsdcCents: 250_000, // $2,500
      currentValueUsdcCents: 257_700, // $2,577
      feesEarnedUsdcCents: 7_700, // $77 of fees
      pnlCents: 7_700,
      apr: 24.6,
      openedAt,
      inRange: true,
    },
  ];
}

function mockPositionMetrics(wallet: string): LpPositionMetrics {
  const positions = mockOpenPositions(wallet);
  const totalDeposited = positions.reduce((s, p) => s + p.depositedUsdcCents, 0);
  const totalCurrent = positions.reduce((s, p) => s + p.currentValueUsdcCents, 0);
  const totalFees = positions.reduce((s, p) => s + p.feesEarnedUsdcCents, 0);
  const weighted = positions.length
    ? positions.reduce((s, p) => s + p.apr * p.depositedUsdcCents, 0) / Math.max(1, totalDeposited)
    : 0;
  return {
    totalDepositedUsdcCents: totalDeposited,
    totalCurrentValueUsdcCents: totalCurrent,
    totalFeesEarnedUsdcCents: totalFees,
    totalPnlCents: totalCurrent - totalDeposited,
    weightedApr: weighted,
    positionCount: positions.length,
  };
}

function mockZapOutQuote(input: { positionId: string }): ZapOutQuote {
  return {
    positionId: input.positionId,
    expectedUsdcCents: 257_700, // matches the mock position's current value
    estimatedSlippageBps: 8,
    transactionB64: "",
    source: "mock",
  };
}

// --- Live-mode helpers ---------------------------------------------------

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function liveGet<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<T> {
  const res = await fetchImpl(`${baseUrl}${path}`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[@dodorail/lpagent] GET ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function livePost<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetchImpl(`${baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[@dodorail/lpagent] POST ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// --- Factory -------------------------------------------------------------

export function createLpAgentClient(options: LpAgentClientOptions = {}): LpAgentClient {
  const mode: LpAgentMode = options.mode ?? (options.apiKey ? "live" : "mock");
  const enabled = options.enabled ?? true;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? LP_AGENT_BASE_URL;

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(`[@dodorail/lpagent] ${op} called while featureFlag is false.`);
    }
    if (mode === "live" && !options.apiKey) {
      throw new Error(`[@dodorail/lpagent] ${op}: apiKey required in live mode.`);
    }
  }

  async function initialise(): Promise<void> {
    if (mode === "mock") return;
    // Pre-warm the pool list so the first dashboard render isn't a cold call.
    try {
      await discoverPools({ limit: 5 });
    } catch {
      /* non-fatal — first user-facing call retries */
    }
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      await liveGet(fetchImpl, baseUrl, options.apiKey ?? "", "/pools?limit=1");
      return { ok: true, latencyMs: Date.now() - started, message: "ok" };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  async function discoverPools(opts?: {
    quoteSymbol?: "USDC";
    limit?: number;
  }): Promise<LpAgentPool[]> {
    guard("discoverPools");
    if (mode === "mock") {
      return MOCK_POOLS.slice(0, opts?.limit ?? MOCK_POOLS.length);
    }
    const params = new URLSearchParams();
    if (opts?.quoteSymbol) params.set("quoteSymbol", opts.quoteSymbol);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const json = await liveGet<{ pools: LpAgentPool[] }>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/pools${params.toString() ? `?${params.toString()}` : ""}`,
    );
    return json.pools;
  }

  async function getPoolStatistics(poolId: string): Promise<LpAgentPoolStatistics> {
    guard("getPoolStatistics");
    if (mode === "mock") {
      const p = MOCK_POOLS.find((x) => x.id === poolId) ?? MOCK_POOLS[0]!;
      return mockStats(p);
    }
    return liveGet<LpAgentPoolStatistics>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/pools/${poolId}/statistics`,
    );
  }

  async function getTopLpers(poolId: string, limit = 5): Promise<LpAgentTopLper[]> {
    guard("getTopLpers");
    if (mode === "mock") {
      return mockTopLpers().slice(0, limit);
    }
    const json = await liveGet<{ topLpers: LpAgentTopLper[] }>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/pools/${poolId}/top-lpers?limit=${limit}`,
    );
    return json.topLpers;
  }

  async function getOpenPositions(wallet: string): Promise<LpPosition[]> {
    guard("getOpenPositions");
    if (mode === "mock") return mockOpenPositions(wallet);
    const json = await liveGet<{ positions: LpPosition[] }>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/positions/open?wallet=${encodeURIComponent(wallet)}`,
    );
    return json.positions;
  }

  async function getPositionMetrics(wallet: string): Promise<LpPositionMetrics> {
    guard("getPositionMetrics");
    if (mode === "mock") return mockPositionMetrics(wallet);
    return liveGet<LpPositionMetrics>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/positions/metrics?wallet=${encodeURIComponent(wallet)}`,
    );
  }

  async function getZapOutQuote(input: {
    positionId: string;
    wallet: string;
  }): Promise<ZapOutQuote> {
    guard("getZapOutQuote");
    if (mode === "mock") return mockZapOutQuote(input);
    const params = new URLSearchParams({
      positionId: input.positionId,
      wallet: input.wallet,
    });
    return liveGet<ZapOutQuote>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/zap-out/quotes?${params.toString()}`,
    );
  }

  async function quoteZapIn(input: {
    poolId: string;
    amountUsdcCents: number;
    wallet: string;
  }): Promise<ZapInQuote> {
    guard("quoteZapIn");
    if (mode === "mock") return mockZapInQuote(input);
    return livePost<ZapInQuote>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/zap-in`,
      {
        poolId: input.poolId,
        amount: input.amountUsdcCents, // smallest-unit cents — LP Agent expects integer base units
        wallet: input.wallet,
      },
    );
  }

  async function submitZapIn(input: {
    poolId: string;
    amountUsdcCents: number;
    wallet: string;
    signedTransactionB64: string;
  }): Promise<ZapInResult> {
    guard("submitZapIn");
    if (mode === "mock") {
      // In mock mode we synthesise a position id + signature so the cron's
      // record-keeping path still has something to write into Prisma.
      return {
        positionId: deterministicPositionId(input.wallet, input.poolId),
        txSig: `mockSig${Date.now().toString(36)}`,
        poolId: input.poolId,
        amountUsdcCents: input.amountUsdcCents,
      };
    }
    return livePost<ZapInResult>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/zap-in/submit`,
      {
        poolId: input.poolId,
        wallet: input.wallet,
        signedTransaction: input.signedTransactionB64,
      },
    );
  }

  async function submitZapOut(input: {
    positionId: string;
    wallet: string;
    signedTransactionB64: string;
  }): Promise<ZapOutResult> {
    guard("submitZapOut");
    if (mode === "mock") {
      return {
        positionId: input.positionId,
        txSig: `mockSig${Date.now().toString(36)}`,
        receivedUsdcCents: 257_700,
      };
    }
    return livePost<ZapOutResult>(
      fetchImpl,
      baseUrl,
      options.apiKey ?? "",
      `/zap-out/submit`,
      {
        positionId: input.positionId,
        wallet: input.wallet,
        signedTransaction: input.signedTransactionB64,
      },
    );
  }

  return {
    mode,
    featureFlag: enabled,
    initialise,
    healthcheck,
    discoverPools,
    getPoolStatistics,
    getTopLpers,
    getOpenPositions,
    getPositionMetrics,
    getZapOutQuote,
    quoteZapIn,
    submitZapIn,
    submitZapOut,
  };
}

export const LP_AGENT_CONSTANTS = {
  baseUrl: LP_AGENT_BASE_URL,
  curatedPools: CURATED_POOLS,
  contact: { telegram: "@thanhle27", sponsor: "Nimbus Data Labs" },
} as const;
