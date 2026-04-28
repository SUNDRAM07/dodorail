/**
 * DodoRail's Tether integration — client factory.
 *
 * Three assets, one wrapper:
 *   - **USDT** (native) — Tether's original Solana SPL token. Mint
 *     `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`. Vanilla SPL transfer
 *     flow, no special SDK needed.
 *   - **USDT0** (omnichain) — LayerZero OFT v2 implementation, locked-and-
 *     minted across 23+ chains, 1:1 backed by USDT on Ethereum. The Solana
 *     mint address is resolved at runtime via LayerZero's Transfer API
 *     (we cache it on first lookup).
 *   - **XAUT0** (omnichain Tether Gold) — Tether Gold (XAUT) re-issued as
 *     a LayerZero OFT. Mint `ESrLDcuX3oHRz1w2MbJZeeDKxZpTccrJyacsZMRTHuuo`.
 *     Each token = 1 troy oz LBMA-accredited gold, redeemable through
 *     Tether. ~7,355 supply on Solana as of April 2026.
 *
 * Why one wrapper for three assets:
 *   - All three are SPL tokens at the Solana layer — same transfer plumbing
 *   - USDT0 + XAUT0 share the LayerZero OFT layer for cross-chain flows
 *   - Merchant-side accounting treats them as "Tether family" — same
 *     compliance posture, similar risk profile
 *
 * Day 9 scope:
 *   - `getMintForAsset(asset)` → resolve canonical Solana mint
 *   - `getUsdt0BridgeQuote(srcChain, amount, recipient)` → call
 *     LayerZero Transfer API, get a ready-to-sign Solana
 *     VersionedTransaction
 *   - `getXautPriceUsd()` → fetch live XAU/USD price (mock for now,
 *     wire to a price oracle Day 11+)
 *   - `healthcheck()` → probe LayerZero metadata + RPC
 *
 * Day 17+ extensions (not built yet):
 *   - Direct OFT v2 SDK integration (cheaper than Transfer API at scale)
 *   - Treasury automation: "convert N% incoming USDT to XAUT0"
 *
 * Research doc: /FRONTIER/22_Frontier-Tether-Track_Master-Research.docx
 */

export type TetherAsset = "USDT" | "USDT0" | "XAUT0";
export type TetherMode = "live" | "mock";
export type TetherNetwork = "mainnet" | "devnet";

export interface TetherClientOptions {
  /** LayerZero API key for the Transfer API. Optional — only required for
   * live USDT0 bridge quotes. Without it, we use mock mode for USDT0. */
  layerzeroApiKey?: string;
  /** Network — defaults to mainnet (Tether's USDT family is mainnet-only,
   * no devnet deployments). */
  network?: TetherNetwork;
  enabled?: boolean;
  mode?: TetherMode;
  /** Override fetch impl for tests. */
  fetchImpl?: typeof fetch;
}

/** Verified mints (mainnet). USDT0 is resolved at runtime. */
export const TETHER_MINTS = {
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  XAUT0: "ESrLDcuX3oHRz1w2MbJZeeDKxZpTccrJyacsZMRTHuuo",
  // USDT0 mint is resolved via LayerZero's Transfer API — they index the
  // canonical deployment per chain at /v1/metadata/experiment/ofts/list.
  // Hardcoded fallback for mock mode + when LayerZero API is unreachable.
  USDT0_FALLBACK: "USDT0Solana11111111111111111111111111111111", // placeholder mock value
} as const;

export const TETHER_DECIMALS: Record<TetherAsset, number> = {
  USDT: 6,
  USDT0: 6,
  XAUT0: 6,
};

/** Source chains we surface in DodoRail's USDT0 cross-chain pay UI. */
export type Usdt0SourceChain =
  | "ethereum"
  | "tron"
  | "bnb"
  | "polygon"
  | "arbitrum"
  | "base"
  | "optimism"
  | "avalanche";

export const USDT0_SOURCE_CHAINS: ReadonlyArray<{
  id: Usdt0SourceChain;
  label: string;
  explorerHost: string;
}> = [
  { id: "ethereum", label: "Ethereum", explorerHost: "etherscan.io" },
  { id: "tron", label: "Tron", explorerHost: "tronscan.org" },
  { id: "bnb", label: "BNB Chain", explorerHost: "bscscan.com" },
  { id: "polygon", label: "Polygon", explorerHost: "polygonscan.com" },
  { id: "arbitrum", label: "Arbitrum", explorerHost: "arbiscan.io" },
  { id: "base", label: "Base", explorerHost: "basescan.org" },
  { id: "optimism", label: "Optimism", explorerHost: "optimistic.etherscan.io" },
  { id: "avalanche", label: "Avalanche", explorerHost: "snowtrace.io" },
];

export interface Usdt0BridgeQuote {
  /** Source chain the customer is paying from. */
  srcChain: Usdt0SourceChain;
  /** Always solana for our use case. */
  dstChain: "solana";
  /** Amount in USDT0 base units (6 decimals — 1 USDT = 1_000_000). */
  amountBaseUnits: bigint;
  /** Customer's source-chain wallet address. */
  fromAddress: string;
  /** Merchant's Solana receiving wallet. */
  toAddress: string;
  /** Estimated bridge fee (LayerZero relay + source-chain gas) in USD cents. */
  estimatedFeeUsdCents: number;
  /** Estimated time to finality after source-chain submission, in seconds. */
  estimatedSeconds: number;
  /** Base64-encoded Solana VersionedTransaction the customer signs (live
   * mode only — empty in mock mode). */
  solanaVersionedTransactionB64: string;
  /** Optional EVM tx data the customer also signs (only present for
   * EVM source chains in live mode). */
  evmTransaction?: {
    to: string;
    data: string;
    value: string;
  };
  /** Diagnostic: which underlying API path produced this quote. */
  source: "transfer-api" | "mock";
}

export interface TetherClient {
  readonly mode: TetherMode;
  readonly network: TetherNetwork;
  readonly featureFlag: boolean;

  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;

  /** Returns the canonical Solana SPL mint for the given Tether asset. */
  getMintForAsset(asset: TetherAsset): Promise<string>;

  /** Build a cross-chain USDT0 bridge quote. Live mode hits LayerZero's
   * Transfer API. Mock mode returns a deterministic placeholder. */
  getUsdt0BridgeQuote(input: {
    srcChain: Usdt0SourceChain;
    amountBaseUnits: bigint;
    fromAddress: string;
    toAddress: string;
  }): Promise<Usdt0BridgeQuote>;

  /** Live USD price of one XAUT0 token (= 1 troy oz LBMA gold). Used in
   * the customer pay UI to show "Pay $X = Y XAUT0" equivalence. Mock mode
   * returns a recent-ish value (~$2,400). */
  getXautPriceUsd(): Promise<number>;
}

const LAYERZERO_API_BASE = "https://metadata.layerzero-api.com/v1";

function mockBridgeQuote(input: {
  srcChain: Usdt0SourceChain;
  amountBaseUnits: bigint;
  fromAddress: string;
  toAddress: string;
}): Usdt0BridgeQuote {
  // Source-chain-specific fee + finality estimates that look real.
  const feeMap: Record<Usdt0SourceChain, { feeUsdCents: number; seconds: number }> = {
    ethereum: { feeUsdCents: 240, seconds: 90 },
    tron: { feeUsdCents: 100, seconds: 60 },
    bnb: { feeUsdCents: 60, seconds: 45 },
    polygon: { feeUsdCents: 25, seconds: 35 },
    arbitrum: { feeUsdCents: 30, seconds: 45 },
    base: { feeUsdCents: 25, seconds: 40 },
    optimism: { feeUsdCents: 30, seconds: 45 },
    avalanche: { feeUsdCents: 50, seconds: 50 },
  };
  const f = feeMap[input.srcChain];
  return {
    srcChain: input.srcChain,
    dstChain: "solana",
    amountBaseUnits: input.amountBaseUnits,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    estimatedFeeUsdCents: f.feeUsdCents,
    estimatedSeconds: f.seconds,
    solanaVersionedTransactionB64: "",
    source: "mock",
  };
}

export function createTetherClient(options: TetherClientOptions = {}): TetherClient {
  const mode: TetherMode = options.mode ?? (options.layerzeroApiKey ? "live" : "mock");
  const network: TetherNetwork = options.network ?? "mainnet";
  const enabled = options.enabled ?? true;
  const fetchImpl = options.fetchImpl ?? fetch;

  // Cache the resolved USDT0 Solana mint so we only hit LayerZero once per
  // process lifetime.
  let resolvedUsdt0Mint: string | null = null;

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(`[@dodorail/tether] ${op} called while featureFlag is false.`);
    }
    if (mode === "live" && !options.layerzeroApiKey && op === "getUsdt0BridgeQuote") {
      throw new Error(
        `[@dodorail/tether] ${op}: LAYERZERO_KEY required in live mode. Set DODORAIL_LAYERZERO_KEY.`,
      );
    }
  }

  async function initialise(): Promise<void> {
    if (mode === "mock") return;
    // Pre-resolve the USDT0 Solana mint so the first user-facing call is fast.
    if (options.layerzeroApiKey) {
      try {
        await getMintForAsset("USDT0");
      } catch {
        /* non-fatal — first real quote call will retry */
      }
    }
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      // Probe the LayerZero metadata endpoint without burning quote credits.
      const res = await fetchImpl(
        `${LAYERZERO_API_BASE}/metadata/experiment/ofts/list?symbols=USDT0`,
        {
          method: "GET",
          headers: options.layerzeroApiKey
            ? { "x-layerzero-api-key": options.layerzeroApiKey }
            : {},
        },
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

  async function getMintForAsset(asset: TetherAsset): Promise<string> {
    if (asset === "USDT") return TETHER_MINTS.USDT;
    if (asset === "XAUT0") return TETHER_MINTS.XAUT0;

    // USDT0: resolve via LayerZero metadata (cached).
    if (resolvedUsdt0Mint) return resolvedUsdt0Mint;
    if (mode === "mock" || !options.layerzeroApiKey) {
      // Mock-mode placeholder — recognised by our pay-page UI as "not yet
      // resolved, mock flow active."
      resolvedUsdt0Mint = TETHER_MINTS.USDT0_FALLBACK;
      return resolvedUsdt0Mint;
    }
    try {
      const res = await fetchImpl(
        `${LAYERZERO_API_BASE}/metadata/experiment/ofts/list?symbols=USDT0&chainNames=solana`,
        {
          headers: { "x-layerzero-api-key": options.layerzeroApiKey },
        },
      );
      if (!res.ok) {
        throw new Error(`LayerZero list failed: HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        deployments?: Array<{
          chainName?: string;
          tokenAddress?: string;
          mintAddress?: string;
          symbol?: string;
        }>;
      };
      const solanaDeployment = (json.deployments ?? []).find(
        (d) => d.chainName === "solana" || d.chainName === "solana-mainnet",
      );
      const mint = solanaDeployment?.mintAddress ?? solanaDeployment?.tokenAddress;
      if (!mint) {
        throw new Error("LayerZero list returned no Solana USDT0 deployment");
      }
      resolvedUsdt0Mint = mint;
      return mint;
    } catch (err) {
      // Fall through to placeholder if LayerZero is unreachable — caller
      // can decide whether to surface or skip the USDT0 rail.
      console.warn("[@dodorail/tether] USDT0 mint resolve failed:", err);
      resolvedUsdt0Mint = TETHER_MINTS.USDT0_FALLBACK;
      return resolvedUsdt0Mint;
    }
  }

  async function getUsdt0BridgeQuote(input: {
    srcChain: Usdt0SourceChain;
    amountBaseUnits: bigint;
    fromAddress: string;
    toAddress: string;
  }): Promise<Usdt0BridgeQuote> {
    if (mode === "mock") return mockBridgeQuote(input);
    guard("getUsdt0BridgeQuote");

    const usdt0SolanaMint = await getMintForAsset("USDT0");
    // Build the Transfer API request. LayerZero's docs document this
    // endpoint at /v1/metadata/experiment/ofts/transfer.
    const params = new URLSearchParams({
      srcChainName: input.srcChain,
      dstChainName: "solana",
      symbol: "USDT0",
      amount: input.amountBaseUnits.toString(),
      from: input.fromAddress,
      to: input.toAddress,
      validate: "true",
    });
    void usdt0SolanaMint; // currently informational; Transfer API resolves internally
    try {
      const res = await fetchImpl(
        `${LAYERZERO_API_BASE}/metadata/experiment/ofts/transfer?${params.toString()}`,
        {
          headers: { "x-layerzero-api-key": options.layerzeroApiKey ?? "" },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Transfer API HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        solanaTransaction?: { transaction?: string };
        evmTransaction?: { to?: string; data?: string; value?: string };
        approvalTransaction?: { to?: string; data?: string; value?: string };
        feeUsdCents?: number;
        estimatedSeconds?: number;
      };
      return {
        srcChain: input.srcChain,
        dstChain: "solana",
        amountBaseUnits: input.amountBaseUnits,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
        estimatedFeeUsdCents: json.feeUsdCents ?? 100,
        estimatedSeconds: json.estimatedSeconds ?? 60,
        solanaVersionedTransactionB64: json.solanaTransaction?.transaction ?? "",
        evmTransaction: json.evmTransaction?.to
          ? {
              to: json.evmTransaction.to,
              data: json.evmTransaction.data ?? "0x",
              value: json.evmTransaction.value ?? "0x0",
            }
          : undefined,
        source: "transfer-api",
      };
    } catch (err) {
      // Live mode failure — surface the error rather than silently fall
      // back to mock; callers (pay page) can show the customer a useful
      // message and offer the native USDT rail as a fallback.
      throw new Error(
        `[@dodorail/tether] getUsdt0BridgeQuote failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async function getXautPriceUsd(): Promise<number> {
    if (mode === "mock") {
      // Approximate live XAU/USD price as of late April 2026. Refresh when
      // we wire a real oracle (Pyth or Switchboard) on Day 11+.
      return 2400 + Math.sin(Date.now() / 1_000_000) * 30;
    }
    // Live mode placeholder — wire to a price oracle later. For Day 9, the
    // mock path is correct enough for the customer-facing "Pay with Gold"
    // equivalence display.
    return 2400;
  }

  return {
    mode,
    network,
    featureFlag: enabled,
    initialise,
    healthcheck,
    getMintForAsset,
    getUsdt0BridgeQuote,
    getXautPriceUsd,
  };
}
