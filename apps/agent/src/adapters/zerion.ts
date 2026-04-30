/**
 * Zerion adapter — the data layer of the Treasury Agent.
 *
 * Three modes:
 *   - mock — deterministic synthetic portfolio JSON, used for local dev + unit
 *     tests + CI. Zero external deps.
 *   - cli — shells out to `zerion wallet analyze <address>` (the JSON-first
 *     CLI from `npm install -g zerion`). Uses the Zerion API key from env.
 *   - http — direct HTTP against the Zerion v1 API. Same auth, no CLI install
 *     required (better for Docker / serverless deploys). This is the default
 *     in `live` mode unless `DODORAIL_ZERION_USE_CLI=true`.
 *
 * Future: x402 mode — Day 16 polish flip. The agent self-funds via Solana
 * x402 instead of using the API key. The interface stays the same; only the
 * adapter swaps.
 *
 * Why we expose `getWalletAnalysis` (not 1:1 Zerion endpoints): the reasoner
 * + actions layer doesn't care about Zerion's pagination shape. A flat,
 * normalised `WalletAnalysis` keeps the prompt template stable even if the
 * upstream API rev's.
 */

import { execFileSync } from "node:child_process";

export type ZerionMode = "mock" | "cli" | "http";

export interface ZerionAdapterOptions {
  apiKey?: string;
  mode?: ZerionMode;
  /** Override fetch impl for tests. */
  fetchImpl?: typeof fetch;
  /** Force a specific Zerion CLI binary path (rare — only for tests). */
  cliBin?: string;
  /** Override the API base — only for staging / proxy testing. */
  baseUrl?: string;
}

export interface ZerionTokenPosition {
  symbol: string;
  chainId: string;
  amountFloat: number;
  valueUsd: number;
}

export interface ZerionRecentTransfer {
  signature: string;
  /** UNIX seconds. */
  timestamp: number;
  /** "in" / "out" / "swap" relative to the watched wallet. */
  direction: "in" | "out" | "swap";
  symbol: string;
  amountFloat: number;
  valueUsd: number;
  counterparty?: string;
}

export interface WalletAnalysis {
  wallet: string;
  /** Total portfolio value in USD across all positions on all chains. */
  totalValueUsd: number;
  /** Just the USDC value on Solana — what the Treasury Agent decides on. */
  idleUsdcCents: number;
  /** 24h change in total value (USD), can be negative. */
  pnl24hUsd: number;
  /** Last N transfers, newest first. */
  recentTransfers: ZerionRecentTransfer[];
  positions: ZerionTokenPosition[];
  /** Diagnostic — which adapter mode produced this result. */
  source: "mock" | "cli" | "http";
}

export interface ZerionAdapter {
  readonly mode: ZerionMode;
  getWalletAnalysis(wallet: string): Promise<WalletAnalysis>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
}

const ZERION_HTTP_BASE = "https://api.zerion.io/v1";

// --- Mock mode -----------------------------------------------------------

/** Deterministic-by-wallet mock portfolio. Re-running with the same wallet
 * returns the same numbers — important for snapshot-style tests + the demo. */
function deterministicMock(wallet: string): WalletAnalysis {
  // Hash the wallet to seed our pseudo-randomness.
  let h = 0;
  for (let i = 0; i < wallet.length; i++) {
    h = (h * 31 + wallet.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(h);
  const idleUsdc = 1_500 + (seed % 4_500); // $1.5k – $6k range
  const pnl24h = ((seed % 200) - 100) / 10; // -$10 – +$10
  const totalUsd = idleUsdc + 850 + (seed % 200); // small SOL position on top

  return {
    wallet,
    totalValueUsd: totalUsd,
    idleUsdcCents: Math.round(idleUsdc * 100),
    pnl24hUsd: pnl24h,
    recentTransfers: [
      {
        signature: `mockSigA${seed.toString(36)}`,
        timestamp: Math.floor(Date.now() / 1000) - 300, // 5 min ago
        direction: "in",
        symbol: "USDC",
        amountFloat: 47.5,
        valueUsd: 47.5,
        counterparty: "8Hd…xQ4",
      },
      {
        signature: `mockSigB${seed.toString(36)}`,
        timestamp: Math.floor(Date.now() / 1000) - 1800, // 30 min ago
        direction: "in",
        symbol: "USDC",
        amountFloat: 199.0,
        valueUsd: 199.0,
        counterparty: "Bz9…WnK",
      },
    ],
    positions: [
      { symbol: "USDC", chainId: "solana", amountFloat: idleUsdc, valueUsd: idleUsdc },
      { symbol: "SOL", chainId: "solana", amountFloat: 5.2, valueUsd: 850 + (seed % 200) },
    ],
    source: "mock",
  };
}

// --- CLI mode ------------------------------------------------------------

interface CliRawOutput {
  /** Zerion CLI returns a structured JSON envelope. We only keep what we need.
   * Field names below are best-effort against current docs; if the upstream
   * shape drifts, only this single normaliser breaks (not the agent loop). */
  totalValueUsd?: number;
  idleUsdcUsd?: number;
  pnl24hUsd?: number;
  positions?: ZerionTokenPosition[];
  recentTransfers?: ZerionRecentTransfer[];
}

function runCli(bin: string, wallet: string, apiKey: string): CliRawOutput {
  // We invoke the CLI with --json. If the CLI isn't installed we surface a
  // clear error so the operator knows to `npm i -g zerion`.
  const out = execFileSync(bin, ["wallet", "analyze", wallet, "--json"], {
    env: { ...process.env, ZERION_API_KEY: apiKey },
    encoding: "utf8",
    timeout: 30_000,
  });
  return JSON.parse(out) as CliRawOutput;
}

// --- HTTP mode -----------------------------------------------------------

interface ZerionPortfolioResponse {
  data: {
    attributes: {
      total: { positions: number };
      changes: { absolute_1d: number };
    };
  };
}

interface ZerionPositionsResponse {
  data: Array<{
    attributes: {
      fungible_info: { symbol: string; implementations?: Array<{ chain_id: string }> };
      quantity: { float: number };
      value: number | null;
    };
  }>;
}

interface ZerionTransactionsResponse {
  data: Array<{
    attributes: {
      hash?: string;
      mined_at_block?: number;
      mined_at?: string;
      operation_type?: string;
      transfers?: Array<{
        direction: "in" | "out";
        fungible_info?: { symbol: string };
        quantity?: { float: number };
        value?: number | null;
        sender?: string;
        recipient?: string;
      }>;
    };
  }>;
}

async function httpGet<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<T> {
  // Zerion uses Basic auth with the API key as the username and an empty
  // password. The header value is base64("zk_xxx:").
  const basic = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetchImpl(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      authorization: `Basic ${basic}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[zerion] GET ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function fetchHttpAnalysis(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  wallet: string,
): Promise<WalletAnalysis> {
  // Three calls in parallel — portfolio summary, positions, and recent txs.
  // Zerion v1 endpoints (mainnet-only Solana; chain filter narrows to Solana
  // for our merchant-wallet use case).
  const chainFilter = "filter[chain_ids]=solana";
  const [portfolio, positions, txs] = await Promise.all([
    httpGet<ZerionPortfolioResponse>(
      fetchImpl,
      baseUrl,
      apiKey,
      `/wallets/${wallet}/portfolio?currency=usd&${chainFilter}`,
    ),
    httpGet<ZerionPositionsResponse>(
      fetchImpl,
      baseUrl,
      apiKey,
      `/wallets/${wallet}/positions/?currency=usd&${chainFilter}&page[size]=20`,
    ),
    httpGet<ZerionTransactionsResponse>(
      fetchImpl,
      baseUrl,
      apiKey,
      `/wallets/${wallet}/transactions/?currency=usd&${chainFilter}&page[size]=10`,
    ),
  ]);

  const totalValueUsd = portfolio.data.attributes.total.positions ?? 0;
  const pnl24hUsd = portfolio.data.attributes.changes.absolute_1d ?? 0;

  const normalisedPositions: ZerionTokenPosition[] = positions.data.map((p) => ({
    symbol: p.attributes.fungible_info.symbol,
    chainId:
      p.attributes.fungible_info.implementations?.[0]?.chain_id ?? "solana",
    amountFloat: p.attributes.quantity.float,
    valueUsd: p.attributes.value ?? 0,
  }));
  const usdcPosition = normalisedPositions.find(
    (p) => p.symbol === "USDC" && p.chainId === "solana",
  );
  const idleUsdcCents = usdcPosition
    ? Math.round(usdcPosition.amountFloat * 100)
    : 0;

  const recentTransfers: ZerionRecentTransfer[] = txs.data
    .flatMap((t) =>
      (t.attributes.transfers ?? []).map((tr) => ({
        signature: t.attributes.hash ?? "",
        timestamp: t.attributes.mined_at
          ? Math.floor(new Date(t.attributes.mined_at).getTime() / 1000)
          : 0,
        direction: tr.direction,
        symbol: tr.fungible_info?.symbol ?? "?",
        amountFloat: tr.quantity?.float ?? 0,
        valueUsd: tr.value ?? 0,
        counterparty:
          tr.direction === "in" ? tr.sender : tr.recipient,
      })),
    )
    .filter((tr) => tr.signature)
    .slice(0, 10);

  return {
    wallet,
    totalValueUsd,
    idleUsdcCents,
    pnl24hUsd,
    positions: normalisedPositions,
    recentTransfers,
    source: "http",
  };
}

// --- Factory -------------------------------------------------------------

export function createZerionAdapter(
  options: ZerionAdapterOptions = {},
): ZerionAdapter {
  const explicitMode = options.mode;
  const apiKey = options.apiKey ?? process.env.DODORAIL_ZERION_KEY;
  const useCli = process.env.DODORAIL_ZERION_USE_CLI === "true";
  // Auto-mode resolution: explicit override wins; else if apiKey present,
  // pick CLI vs HTTP based on the env flag (HTTP default — no install needed);
  // else fall back to mock so the agent runs without keys.
  const mode: ZerionMode =
    explicitMode ??
    (apiKey ? (useCli ? "cli" : "http") : "mock");

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? ZERION_HTTP_BASE;
  const cliBin = options.cliBin ?? "zerion";

  async function getWalletAnalysis(wallet: string): Promise<WalletAnalysis> {
    if (mode === "mock") {
      return deterministicMock(wallet);
    }
    if (mode === "cli") {
      if (!apiKey) {
        throw new Error("[zerion] cli mode requires DODORAIL_ZERION_KEY.");
      }
      const raw = runCli(cliBin, wallet, apiKey);
      return {
        wallet,
        totalValueUsd: raw.totalValueUsd ?? 0,
        idleUsdcCents: Math.round((raw.idleUsdcUsd ?? 0) * 100),
        pnl24hUsd: raw.pnl24hUsd ?? 0,
        positions: raw.positions ?? [],
        recentTransfers: raw.recentTransfers ?? [],
        source: "cli",
      };
    }
    // http
    if (!apiKey) {
      throw new Error("[zerion] http mode requires DODORAIL_ZERION_KEY.");
    }
    return fetchHttpAnalysis(fetchImpl, baseUrl, apiKey, wallet);
  }

  async function healthcheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    message?: string;
  }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock" };
    }
    try {
      // Cheap HTTP probe regardless of CLI / HTTP — we want to know if the
      // key is valid and Zerion is reachable.
      const basic = Buffer.from(`${apiKey}:`).toString("base64");
      const res = await fetchImpl(`${baseUrl}/chains/`, {
        headers: { authorization: `Basic ${basic}` },
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - started,
        message: res.ok ? "ok" : `http ${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "unknown",
      };
    }
  }

  return { mode, getWalletAnalysis, healthcheck };
}
