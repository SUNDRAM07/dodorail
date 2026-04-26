/**
 * DodoRail's GoldRush (Covalent) integration — client factory.
 *
 * Follows the integration-isolation pattern (brief §3.4). Mirrors the shape
 * of @dodorail/dodo and @dodorail/dune:
 *   - `initialise()` · `healthcheck()` · `featureFlag`
 *   - Mock + live modes
 *   - Zero cross-package imports
 *
 * Day 6 scope:
 *   - `getTokenBalances(walletAddress)`  → REST BalanceService
 *   - `getRecentTransactions(...)`        → REST TransactionService
 *   - `healthcheck()`                     → probes a known Solana mainnet wallet
 *
 * Important constraint: GoldRush indexes Solana **mainnet only**. There is
 * no devnet endpoint. Until we deploy our Anchor program to mainnet (or
 * fund mainnet merchant wallets), live mode returns empty data for our
 * own merchants. We use this primarily for ECOSYSTEM dashboards (top
 * USDC merchants on Solana) rather than per-merchant data, until mainnet
 * deploy.
 *
 * Docs:
 *   https://goldrush.dev/docs/
 *   https://goldrush.dev/docs/api/
 *
 * Note: Covalent's API URL hostname is preserved under the GoldRush brand —
 * `api.covalenthq.com/v1` continues to be the canonical host.
 */

export type GoldRushMode = "live" | "mock";

export type GoldRushChain = "solana-mainnet" | string;

export interface GoldRushClientOptions {
  apiKey?: string;
  mode?: GoldRushMode;
  baseUrl?: string;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  /** Default chain — most calls in DodoRail target solana-mainnet. */
  defaultChain?: GoldRushChain;
}

export interface GoldRushTokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // string-encoded big int in base units
  balanceUi: number; // human-scale (balance / 10^decimals)
  /** USD value at the time the API call was made; null when GoldRush has no price. */
  quoteUsd: number | null;
  logoUrl: string | null;
}

export interface GoldRushTransactionSummary {
  signature: string;
  blockSignedAt: string; // ISO 8601
  successful: boolean;
  feeLamports: number | null;
  /** GoldRush's plaintext description. May be null on raw / unparsed txs. */
  description: string | null;
}

export interface GoldRushClient {
  readonly mode: GoldRushMode;
  readonly featureFlag: boolean;
  readonly defaultChain: GoldRushChain;
  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
  /** All token balances (SOL + every SPL) for a wallet on the chosen chain. */
  getTokenBalances(
    walletAddress: string,
    chain?: GoldRushChain,
  ): Promise<GoldRushTokenBalance[]>;
  /** Recent transactions in descending block-time order. Paginated by GoldRush. */
  getRecentTransactions(
    walletAddress: string,
    options?: { pageSize?: number; chain?: GoldRushChain },
  ): Promise<GoldRushTransactionSummary[]>;
}

const DEFAULT_BASE_URL = "https://api.covalenthq.com/v1";
const DEFAULT_CHAIN: GoldRushChain = "solana-mainnet";

function mockBalances(wallet: string): GoldRushTokenBalance[] {
  // Deterministic-but-varied seeded rows, so dashboard cards have life in dev.
  const seed = wallet.charCodeAt(0) + (wallet.charCodeAt(wallet.length - 1) || 0);
  return [
    {
      contractAddress: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      balance: String(BigInt(Math.round(2_000_000_000 + seed * 17_000))),
      balanceUi: 2 + (seed % 100) / 100,
      quoteUsd: 2 * 145 + ((seed % 100) / 100) * 145,
      logoUrl: null,
    },
    {
      contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      balance: String(BigInt(120_000_000 + seed * 23)),
      balanceUi: 120 + (seed % 50),
      quoteUsd: 120 + (seed % 50),
      logoUrl: null,
    },
  ];
}

function mockTransactions(wallet: string, n: number): GoldRushTransactionSummary[] {
  const seed = wallet.charCodeAt(0) || 1;
  return Array.from({ length: n }).map((_, i) => ({
    signature: `mock_${seed}_${i}_${Math.random().toString(36).slice(2, 10)}`,
    blockSignedAt: new Date(Date.now() - i * 1000 * 60 * 17).toISOString(),
    successful: i % 7 !== 6, // ~14% failure rate, looks real
    feeLamports: 5_000 + ((seed + i) * 31) % 25_000,
    description: i % 3 === 0 ? "Token transfer" : i % 3 === 1 ? "DEX swap" : "System program transfer",
  }));
}

export function createGoldRushClient(options: GoldRushClientOptions = {}): GoldRushClient {
  const mode: GoldRushMode = options.mode ?? "mock";
  const enabled = options.enabled ?? true;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultChain = options.defaultChain ?? DEFAULT_CHAIN;

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(`[@dodorail/goldrush] ${op} called while featureFlag is false.`);
    }
    if (mode === "live" && !options.apiKey) {
      throw new Error(
        `[@dodorail/goldrush] ${op} requires DODORAIL_GOLDRUSH_KEY in live mode. Currently unset.`,
      );
    }
  }

  async function liveFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey ?? ""}`,
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
      // Probe with a known active mainnet wallet (Jupiter's program account)
      // to verify auth + base URL. We expect 200 with at least the SOL row.
      const probeWallet = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
      const res = await liveFetch(
        `/${defaultChain}/address/${probeWallet}/balances_v2/?nft=false&no-spam=true&page-size=1`,
      );
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

  async function getTokenBalances(
    walletAddress: string,
    chain: GoldRushChain = defaultChain,
  ): Promise<GoldRushTokenBalance[]> {
    if (mode === "mock") return mockBalances(walletAddress);
    guard("getTokenBalances");
    const res = await liveFetch(
      `/${chain}/address/${walletAddress}/balances_v2/?nft=false&no-spam=true`,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `[@dodorail/goldrush] getTokenBalances(${walletAddress}) HTTP ${res.status} ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      data?: {
        items?: Array<{
          contract_address: string;
          contract_ticker_symbol: string | null;
          contract_name: string | null;
          contract_decimals: number;
          balance: string;
          quote: number | null;
          logo_url: string | null;
        }>;
      };
    };
    const items = json.data?.items ?? [];
    return items.map((it) => {
      const decimals = it.contract_decimals ?? 0;
      const balanceUi =
        decimals > 0
          ? Number(BigInt(it.balance ?? "0")) / Math.pow(10, decimals)
          : Number(it.balance ?? "0");
      return {
        contractAddress: it.contract_address,
        symbol: it.contract_ticker_symbol ?? "?",
        name: it.contract_name ?? "Unknown",
        decimals,
        balance: it.balance ?? "0",
        balanceUi,
        quoteUsd: typeof it.quote === "number" ? it.quote : null,
        logoUrl: it.logo_url ?? null,
      };
    });
  }

  async function getRecentTransactions(
    walletAddress: string,
    opts: { pageSize?: number; chain?: GoldRushChain } = {},
  ): Promise<GoldRushTransactionSummary[]> {
    const chain = opts.chain ?? defaultChain;
    const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 100));
    if (mode === "mock") return mockTransactions(walletAddress, pageSize);
    guard("getRecentTransactions");
    // Endpoint: /{chain}/address/{address}/transactions_v3/page/0/ — fastest
    // Solana endpoint that returns parsed enrichments. Page 0 is newest.
    const res = await liveFetch(
      `/${chain}/address/${walletAddress}/transactions_v3/page/0/?page-size=${pageSize}`,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `[@dodorail/goldrush] getRecentTransactions(${walletAddress}) HTTP ${res.status} ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as {
      data?: {
        items?: Array<{
          tx_hash?: string;
          signature?: string;
          block_signed_at: string;
          successful: boolean;
          fees_paid?: string | null;
          tx_summary?: { description?: string } | null;
          // Solana endpoints sometimes use `pretty_value_quote` etc.
        }>;
      };
    };
    const items = json.data?.items ?? [];
    return items.map((it) => ({
      signature: it.signature ?? it.tx_hash ?? "",
      blockSignedAt: it.block_signed_at,
      successful: !!it.successful,
      feeLamports: it.fees_paid ? Number(it.fees_paid) : null,
      description: it.tx_summary?.description ?? null,
    }));
  }

  return {
    mode,
    featureFlag: enabled,
    defaultChain,
    initialise,
    healthcheck,
    getTokenBalances,
    getRecentTransactions,
  };
}
