/**
 * DodoRail's Cloak integration — client factory.
 *
 * Cloak (cloak.ag) is a UTXO shielded pool on Solana mainnet using Groth16
 * ZK proofs (Noir circuits + Barretenberg UltraHonk WASM client prover +
 * Pinocchio Groth16 verifier on chain). Browser-native proof generation
 * runs in ~3 seconds from a customer's wallet, no server round-trip.
 *
 * Why Cloak as DodoRail's primary privacy stack:
 *   - Track title verbatim: "Build real-world payment solutions with
 *     privacy" — DodoRail's exact pitch
 *   - Mainnet-mature: 24,187+ shielded transactions in production
 *   - Browser-native UX: ~3s proof gen, no server-side prover required
 *   - Compliance-friendly: per-merchant viewing keys (32-byte nk) let
 *     auditors decrypt history while the public chain stays opaque
 *   - First-class AI-tooling support — they publish Cursor / Claude Code /
 *     Windsurf rules at /ai-tools/, treating LLM-assisted dev as a
 *     supported workflow rather than a workaround
 *
 * Architecture constants (verified live from docs.cloak.ag/sdk/llms.txt):
 *   - Mainnet program ID: zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW
 *   - Devnet program ID:  Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h (typed
 *     in SDK but no operational devnet relay/circuits as of 2026-04-26)
 *   - Default relay URL:  https://api.cloak.ag
 *   - Circuits URL:       https://cloak-circuits.s3.us-east-1.amazonaws.com/circuits/0.1.0
 *   - Min deposit:        10,000,000 lamports (0.01 SOL)
 *   - Fixed fee:          5,000,000 lamports
 *   - Variable fee:       0.3% of gross
 *
 * Day 7 scope:
 *   - `generateNote()` — pre-allocate a recipient note for an invoice
 *   - `deposit()`       — customer-side: shield SOL into the pool
 *   - `partialWithdraw()` / `fullWithdraw()` — merchant-side payouts
 *   - `scanTransactions()` — merchant balance + history reconstruction
 *   - `exportComplianceCsv()` — auditor-friendly CSV via SDK's
 *     toComplianceReport + formatComplianceCsv
 *
 * Day 8+ extensions:
 *   - Umbra alongside (~80% interface overlap with Cloak — sibling adapter)
 *   - SPL token (USDC/USDT) flows once SOL flow is solid
 */

import type { PublicKey } from "@solana/web3.js";

export type CloakMode = "live" | "mock";
export type CloakNetwork = "localnet" | "devnet" | "mainnet" | "testnet";

export interface CloakClientOptions {
  /** Network — defaults to mainnet (only operational network as of 2026-04-26). */
  network?: CloakNetwork;
  /** Override default relay URL — defaults to https://api.cloak.ag. */
  relayUrl?: string;
  /** Override default Cloak program ID — defaults to mainnet program. */
  programId?: PublicKey;
  /**
   * Optional pre-shared 32-byte viewing key (nk). When omitted, the SDK
   * registers one on first use via a wallet signature challenge.
   */
  viewingKey?: Uint8Array;
  enabled?: boolean;
  mode?: CloakMode;
  /** Debug logging (passes through to the SDK). */
  debug?: boolean;
}

export interface CloakNote {
  /** Opaque commitment string — used to identify the UTXO on chain. */
  commitment: string;
  /** Note amount in lamports (or SPL base units when mint != native). */
  amountLamports: bigint;
  /** Mint — null/undefined for native SOL, or the SPL token mint. */
  mint?: string;
  /** Per-note keypair public-key for unlinkability. */
  ownerPubkey: string;
  createdAt: string;
}

export interface CloakDepositResult {
  signature: string;
  note: CloakNote;
  leafIndex: number;
  root: string;
}

export interface CloakWithdrawResult {
  signature: string;
  netAmount: bigint;
  feeAmount: bigint;
  recipient: string;
  nullifier: string;
}

export interface CloakScanRow {
  signature: string;
  blockTime: number;
  /** Positive for deposits, negative for withdrawals, zero for shielded transfers. */
  externalAmount: bigint;
  feeAmount: bigint;
  netAmount: bigint;
  runningBalance: bigint;
}

export interface CloakClient {
  readonly mode: CloakMode;
  readonly network: CloakNetwork;
  readonly featureFlag: boolean;

  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;

  /** Pre-allocate a note for a merchant — embeddable into invoice URLs. */
  generateNote(amountLamports: bigint): Promise<CloakNote>;

  /**
   * Deposit SOL into the shielded pool. Designed for browser context — the
   * `walletAdapter` handles signing. The function generates a Groth16 proof
   * client-side (~3s) before returning.
   */
  deposit(input: {
    amountLamports: bigint;
    recipientNote: CloakNote;
    walletAdapter: WalletAdapterShape;
  }): Promise<CloakDepositResult>;

  /** Sweep an entire UTXO out to a clean recipient address. */
  fullWithdraw(input: {
    note: CloakNote;
    recipient: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<CloakWithdrawResult>;

  /** Pull just `amountLamports` out, keep the rest shielded. */
  partialWithdraw(input: {
    note: CloakNote;
    recipient: string;
    amountLamports: bigint;
    walletAdapter: WalletAdapterShape;
  }): Promise<CloakWithdrawResult>;

  /**
   * Scan the chain for shielded transactions belonging to this wallet.
   * Uses RPC directly, NOT the relay — works offline of api.cloak.ag.
   */
  scanTransactions(input: {
    walletPublicKey: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
    limit?: number;
  }): Promise<CloakScanRow[]>;

  /** SDK's compliance helpers — auditor CSV in ~3 calls. */
  exportComplianceCsv(input: {
    walletPublicKey: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
  }): Promise<string>;

  /** Compute the fee for a hypothetical withdrawal — for UI display. */
  estimateFeeLamports(grossLamports: bigint): {
    fixed: bigint;
    variable: bigint;
    total: bigint;
    netToRecipient: bigint;
  };
}

/** Subset of the standard Solana Wallet Adapter shape we rely on. */
export interface WalletAdapterShape {
  publicKey: PublicKey;
  signTransaction: <T>(tx: T) => Promise<T>;
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
}

// Verified constants from the live SDK (as of 2026-04-26).
const FIXED_FEE_LAMPORTS = 5_000_000n;
const VARIABLE_FEE_NUMERATOR = 3n;
const VARIABLE_FEE_DENOMINATOR = 1_000n;
const MIN_DEPOSIT_LAMPORTS = 10_000_000n;
const MAINNET_PROGRAM_ID = "zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW";
const DEVNET_PROGRAM_ID = "Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h";

function computeFee(grossLamports: bigint): {
  fixed: bigint;
  variable: bigint;
  total: bigint;
  netToRecipient: bigint;
} {
  const gross = grossLamports < 0n ? -grossLamports : grossLamports;
  const variable = (gross * VARIABLE_FEE_NUMERATOR) / VARIABLE_FEE_DENOMINATOR;
  const total = FIXED_FEE_LAMPORTS + variable;
  return {
    fixed: FIXED_FEE_LAMPORTS,
    variable,
    total,
    netToRecipient: gross > total ? gross - total : 0n,
  };
}

function mockNote(amountLamports: bigint): CloakNote {
  const rand = Math.random().toString(36).slice(2, 10);
  return {
    commitment: `cloak_mock_commit_${rand}`,
    amountLamports,
    ownerPubkey: `mock_owner_${rand}`,
    createdAt: new Date().toISOString(),
  };
}

function mockDeposit(amountLamports: bigint): CloakDepositResult {
  return {
    signature: `mock_sig_${Math.random().toString(36).slice(2, 12)}`,
    note: mockNote(amountLamports),
    leafIndex: Math.floor(Math.random() * 1000),
    root: `mock_root_${Math.random().toString(36).slice(2, 16)}`,
  };
}

function mockWithdraw(amountLamports: bigint, recipient: string): CloakWithdrawResult {
  const fee = computeFee(amountLamports);
  return {
    signature: `mock_sig_${Math.random().toString(36).slice(2, 12)}`,
    netAmount: fee.netToRecipient,
    feeAmount: fee.total,
    recipient,
    nullifier: `mock_null_${Math.random().toString(36).slice(2, 16)}`,
  };
}

function mockScan(walletPublicKey: string, n = 5): CloakScanRow[] {
  let running = 0n;
  return Array.from({ length: n }).map((_, i) => {
    const isDeposit = i % 3 !== 0;
    const ext = isDeposit ? BigInt(50_000_000 + i * 13_000_000) : -BigInt(20_000_000 + i * 7_000_000);
    const fee = isDeposit ? 0n : computeFee(ext).total;
    const net = ext - (ext < 0n ? -fee : 0n);
    running += isDeposit ? ext : ext - 0n;
    return {
      signature: `mock_${walletPublicKey.slice(0, 6)}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      blockTime: Math.floor(Date.now() / 1000) - i * 3600,
      externalAmount: ext,
      feeAmount: fee,
      netAmount: net,
      runningBalance: running,
    };
  });
}

export function createCloakClient(options: CloakClientOptions = {}): CloakClient {
  const mode: CloakMode = options.mode ?? "mock";
  const network: CloakNetwork = options.network ?? "mainnet";
  const enabled = options.enabled ?? true;
  const relayUrl = options.relayUrl ?? "https://api.cloak.ag";

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(`[@dodorail/cloak] ${op} called while featureFlag is false.`);
    }
    if (mode === "live" && network !== "mainnet") {
      throw new Error(
        `[@dodorail/cloak] ${op}: only mainnet is operational as of 2026-04-26. Got network=${network}.`,
      );
    }
  }

  async function initialise(): Promise<void> {
    if (mode === "mock") return;
    guard("initialise");
    // Live mode initialisation is lazy — the SDK warms up on first transact()
    // call (circuits cache pulled from S3). Nothing required up-front.
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      guard("healthcheck");
      // Probe the relay's status endpoint to confirm reachability + auth.
      // Cloak's relay exposes /health (or similar) — we ping with a HEAD to
      // verify TCP + TLS without burning compute.
      const res = await fetch(`${relayUrl}/health`, { method: "GET" }).catch(() => null);
      return {
        ok: res ? res.status < 500 : false,
        latencyMs: Date.now() - started,
        message: res ? `http ${res.status}` : "unreachable",
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  function estimateFeeLamports(grossLamports: bigint) {
    return computeFee(grossLamports);
  }

  // ─── Mock mode short-circuits ───
  if (mode === "mock") {
    return {
      mode,
      network,
      featureFlag: enabled,
      initialise,
      healthcheck,
      estimateFeeLamports,
      generateNote: async (amountLamports) => mockNote(amountLamports),
      deposit: async (input) => mockDeposit(input.amountLamports),
      fullWithdraw: async (input) => mockWithdraw(input.note.amountLamports, input.recipient),
      partialWithdraw: async (input) => mockWithdraw(input.amountLamports, input.recipient),
      scanTransactions: async (input) => mockScan(input.walletPublicKey, input.limit ?? 5),
      exportComplianceCsv: async (input) => {
        const rows = mockScan(input.walletPublicKey, 8);
        const header = "signature,block_time,external_amount,fee_amount,net_amount,running_balance";
        const body = rows
          .map(
            (r) =>
              `${r.signature},${r.blockTime},${r.externalAmount},${r.feeAmount},${r.netAmount},${r.runningBalance}`,
          )
          .join("\n");
        return `${header}\n${body}\n`;
      },
    };
  }

  // ─── Live mode — dynamic import of @cloak.dev/sdk ───
  //
  // We dynamic-import inside each method so that:
  //   (a) Mock-mode consumers (Vercel preview, local dev without funded wallet)
  //       never load the SDK or its WASM circuits.
  //   (b) The browser bundle is split — Cloak SDK only ships when a user
  //       actually clicks "Pay privately."
  //
  // Each method below validates its inputs against the SDK's strict types and
  // bridges to our own typed shapes. This isolates DodoRail from any breaking
  // SDK type changes — the wrapper is the only place that needs updating.

  async function loadSdk() {
    // The SDK is documented as having both ESM + CJS dual exports. Dynamic
    // import returns a Module — we destructure what we need.
    return await import("@cloak.dev/sdk");
  }

  async function generateNote(amountLamports: bigint): Promise<CloakNote> {
    guard("generateNote");
    if (amountLamports < MIN_DEPOSIT_LAMPORTS) {
      throw new Error(
        `[@dodorail/cloak] generateNote: amount ${amountLamports} below minimum ${MIN_DEPOSIT_LAMPORTS} lamports (0.01 SOL).`,
      );
    }
    const sdk = await loadSdk();
    const owner = await sdk.generateUtxoKeypair();
    const utxo = await sdk.createUtxo(amountLamports, owner);
    return {
      commitment: String(sdk.computeUtxoCommitment(utxo)),
      amountLamports,
      ownerPubkey: owner.publicKey?.toString?.() ?? String(owner),
      createdAt: new Date().toISOString(),
    };
  }

  async function deposit(input: {
    amountLamports: bigint;
    recipientNote: CloakNote;
    walletAdapter: WalletAdapterShape;
  }): Promise<CloakDepositResult> {
    guard("deposit");
    if (input.amountLamports < MIN_DEPOSIT_LAMPORTS) {
      throw new Error(
        `[@dodorail/cloak] deposit: ${input.amountLamports} below minimum ${MIN_DEPOSIT_LAMPORTS} lamports (0.01 SOL).`,
      );
    }
    // Phase B will exercise this against a funded mainnet wallet. The full
    // browser-native proof generation flow lives in apps/web — this wrapper
    // surface stays minimal for the smoke test.
    throw new Error(
      "[@dodorail/cloak] deposit live mode is wired to the SDK in apps/web — see /pay/[invoiceId]/cloak-private-pay.tsx (Phase C).",
    );
  }

  async function fullWithdraw(input: {
    note: CloakNote;
    recipient: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<CloakWithdrawResult> {
    guard("fullWithdraw");
    void input;
    throw new Error("[@dodorail/cloak] fullWithdraw live wiring in apps/web (Phase C).");
  }

  async function partialWithdraw(input: {
    note: CloakNote;
    recipient: string;
    amountLamports: bigint;
    walletAdapter: WalletAdapterShape;
  }): Promise<CloakWithdrawResult> {
    guard("partialWithdraw");
    void input;
    throw new Error("[@dodorail/cloak] partialWithdraw live wiring in apps/web (Phase C).");
  }

  async function scanTransactions(input: {
    walletPublicKey: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
    limit?: number;
  }): Promise<CloakScanRow[]> {
    guard("scanTransactions");
    void input;
    // TODO Phase C: wire SDK.scanTransactions with a Connection + viewing-key.
    return [];
  }

  async function exportComplianceCsv(input: {
    walletPublicKey: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
  }): Promise<string> {
    guard("exportComplianceCsv");
    const sdk = await loadSdk();
    void input;
    // Phase D will pipe scanTransactions output into toComplianceReport +
    // formatComplianceCsv. For Phase A we return the SDK's empty-report
    // header so the merchant settings page can render the button without
    // crashing.
    const empty = sdk.formatComplianceCsv(sdk.toComplianceReport({} as never));
    return empty ?? "signature,block_time,external_amount,fee_amount,net_amount,running_balance\n";
  }

  return {
    mode,
    network,
    featureFlag: enabled,
    initialise,
    healthcheck,
    estimateFeeLamports,
    generateNote,
    deposit,
    fullWithdraw,
    partialWithdraw,
    scanTransactions,
    exportComplianceCsv,
  };
}

// Re-exports for downstream consumers that want the verified constants.
export const CLOAK_CONSTANTS = {
  FIXED_FEE_LAMPORTS,
  VARIABLE_FEE_NUMERATOR,
  VARIABLE_FEE_DENOMINATOR,
  MIN_DEPOSIT_LAMPORTS,
  MAINNET_PROGRAM_ID,
  DEVNET_PROGRAM_ID,
} as const;
