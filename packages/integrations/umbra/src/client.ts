/**
 * DodoRail's Umbra Privacy integration — client factory.
 *
 * Umbra (umbraprivacy.com) is a privacy wallet on Solana powered by Arcium's
 * MPC + ZK encrypted-compute network. Where Cloak is mainnet-only with
 * browser-native Groth16 proofs, Umbra ships first-class devnet support
 * (Program ID `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`) which means
 * DodoRail can demo the entire private payment flow on devnet for $0 — no
 * real-money mainnet test required.
 *
 * Why Umbra alongside Cloak (interface-compatible sibling pattern):
 *   - Cloak's track title is DodoRail's pitch sentence verbatim — strongest
 *     narrative match
 *   - Umbra ships devnet + a smoother integration path — strongest demo
 *     match for our budget reality
 *   - SDK shapes overlap ~70% — the wrapper hides the function-factory
 *     pattern Umbra ships and exposes the same operations Cloak does
 *
 * Architecture constants (verified live from sdk.umbraprivacy.com on
 * 2026-04-28):
 *   - Mainnet program ID: UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh
 *   - Devnet program ID:  DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ
 *   - SDK package:        @umbra-privacy/sdk (function-factory pattern,
 *     not class-based — see loadSdk() comment for the bridge logic)
 *
 * Day 8 scope:
 *   - `registerUser()`           → first-time setup of an Umbra account
 *   - `depositPublicToEncrypted` → public SPL → encrypted balance
 *   - `withdrawEncryptedToPublic`→ encrypted balance → public address
 *   - `sendPrivately`            → private transfer to another wallet
 *   - `scanClaimableUtxos`       → look for incoming private transfers
 *   - `claimUtxo`                → accept a private transfer into balance
 *   - `exportComplianceCsv`      → auditor flow via viewing keys
 *
 * This wrapper is interface-compatible with @dodorail/cloak: both expose
 * `mode`, `network`, `featureFlag`, `initialise`, `healthcheck`, plus
 * provider-specific operations. The merchant settings page can flip between
 * the two with one Prisma update.
 */

import type { PublicKey } from "@solana/web3.js";

export type UmbraMode = "live" | "mock";
export type UmbraNetwork = "mainnet" | "devnet" | "localnet";

export interface UmbraClientOptions {
  /** Network — defaults to devnet (free testing path while we save the SOL). */
  network?: UmbraNetwork;
  /** Solana RPC URL — e.g. Helius devnet endpoint. */
  rpcUrl?: string;
  /** Optional override of the on-chain program ID. */
  programId?: PublicKey;
  enabled?: boolean;
  mode?: UmbraMode;
  debug?: boolean;
}

export interface UmbraEncryptedAccount {
  /** Wallet that owns this encrypted account. */
  ownerPubkey: string;
  /** Per-owner viewing key (32-byte nk, base64). Auditors get a derivative. */
  viewingKey: string;
  registeredAt: string;
}

export interface UmbraDepositResult {
  signature: string;
  amountUiAmount: number;
  mint: string;
  createdAt: string;
}

export interface UmbraWithdrawResult {
  signature: string;
  amountUiAmount: number;
  mint: string;
  recipient: string;
}

export interface UmbraPrivateTransferResult {
  /** Tx signature on the source side — chain only sees an unattributable
   *  Merkle update. */
  signature: string;
  /** Recipient wallet — encoded into a "claimable UTXO" they later scan + claim. */
  recipient: string;
  amountUiAmount: number;
  mint: string;
}

export interface UmbraClaimableUtxo {
  /** Opaque blob identifying this UTXO on-chain. */
  utxoId: string;
  amountUiAmount: number;
  mint: string;
  /** Wallet that originated the transfer (only visible if their viewing key
   *  is shared — the public chain doesn't expose it). */
  fromOwner?: string;
  blockTime: number;
}

export interface UmbraScanRow {
  signature: string;
  blockTime: number;
  /** "deposit" | "withdraw" | "private_send" | "private_receive" */
  type: string;
  amountUiAmount: number;
  mint: string;
  runningEncryptedBalance: number;
}

export interface UmbraClient {
  readonly mode: UmbraMode;
  readonly network: UmbraNetwork;
  readonly featureFlag: boolean;

  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;

  registerUser(input: {
    ownerPubkey: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraEncryptedAccount>;

  depositPublicToEncrypted(input: {
    ownerPubkey: string;
    mint: string;
    amountUiAmount: number;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraDepositResult>;

  withdrawEncryptedToPublic(input: {
    ownerPubkey: string;
    mint: string;
    amountUiAmount: number;
    recipient: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraWithdrawResult>;

  sendPrivately(input: {
    ownerPubkey: string;
    mint: string;
    amountUiAmount: number;
    recipientPubkey: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraPrivateTransferResult>;

  scanClaimableUtxos(input: { ownerPubkey: string }): Promise<UmbraClaimableUtxo[]>;

  claimUtxo(input: {
    ownerPubkey: string;
    utxoId: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<{ signature: string; amountUiAmount: number; mint: string }>;

  /**
   * Auditor-friendly CSV using the merchant's viewing key. Mirrors the
   * @dodorail/cloak shape so the merchant settings export button stays
   * provider-agnostic.
   */
  exportComplianceCsv(input: {
    ownerPubkey: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
  }): Promise<string>;

  /** Returns the active program ID for the configured network. */
  getProgramId(): string;
}

export interface WalletAdapterShape {
  publicKey: PublicKey;
  signTransaction: <T>(tx: T) => Promise<T>;
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
}

const MAINNET_PROGRAM_ID = "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh";
const DEVNET_PROGRAM_ID = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";

const KNOWN_MINTS: Record<string, string> = {
  USDC_MAINNET: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDC_DEVNET: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  PRVT: "PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta",
};

function programIdForNetwork(network: UmbraNetwork): string {
  if (network === "mainnet") return MAINNET_PROGRAM_ID;
  return DEVNET_PROGRAM_ID;
}

function mockAccount(ownerPubkey: string): UmbraEncryptedAccount {
  return {
    ownerPubkey,
    viewingKey: `mock_vk_${ownerPubkey.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`,
    registeredAt: new Date().toISOString(),
  };
}

function mockSig(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
}

function mockScan(ownerPubkey: string, n = 6): UmbraScanRow[] {
  let running = 0;
  return Array.from({ length: n }).map((_, i) => {
    const types = ["deposit", "private_send", "private_receive", "deposit", "private_receive", "withdraw"];
    const type = types[i % types.length] ?? "deposit";
    const amount = type === "deposit" ? 50 + i * 7 : type.startsWith("private") ? 12 + i * 3 : 25 + i * 5;
    const sign = type === "deposit" || type === "private_receive" ? 1 : -1;
    running += sign * amount;
    return {
      signature: mockSig(`umbra_${ownerPubkey.slice(0, 4)}`),
      blockTime: Math.floor(Date.now() / 1000) - i * 1800,
      type,
      amountUiAmount: amount,
      mint: KNOWN_MINTS.USDC_DEVNET ?? "MOCK_MINT",
      runningEncryptedBalance: running,
    };
  });
}

export function createUmbraClient(options: UmbraClientOptions = {}): UmbraClient {
  const mode: UmbraMode = options.mode ?? "mock";
  const network: UmbraNetwork = options.network ?? "devnet";
  const enabled = options.enabled ?? true;
  const programId = options.programId?.toString() ?? programIdForNetwork(network);

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(`[@dodorail/umbra] ${op} called while featureFlag is false.`);
    }
    if (mode === "live" && !options.rpcUrl) {
      throw new Error(`[@dodorail/umbra] ${op} requires rpcUrl in live mode.`);
    }
  }

  async function initialise(): Promise<void> {
    if (mode === "mock") return;
    guard("initialise");
    // SDK warms up lazily on first operation. Nothing required here.
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      guard("healthcheck");
      // Probe the configured RPC with a getHealth call. Umbra's relay isn't
      // separately documented, so RPC reachability is our liveness signal.
      if (!options.rpcUrl) throw new Error("rpcUrl unset");
      const res = await fetch(options.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
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

  // Mock-mode short-circuits — the rest of the wrapper trusts that the live
  // SDK matches the function-factory pattern from sdk.umbraprivacy.com.
  if (mode === "mock") {
    return {
      mode,
      network,
      featureFlag: enabled,
      initialise,
      healthcheck,
      getProgramId: () => programId,
      registerUser: async ({ ownerPubkey }) => mockAccount(ownerPubkey),
      depositPublicToEncrypted: async ({ amountUiAmount, mint }) => ({
        signature: mockSig("umbra_dep"),
        amountUiAmount,
        mint,
        createdAt: new Date().toISOString(),
      }),
      withdrawEncryptedToPublic: async ({ amountUiAmount, mint, recipient }) => ({
        signature: mockSig("umbra_wd"),
        amountUiAmount,
        mint,
        recipient,
      }),
      sendPrivately: async ({ amountUiAmount, mint, recipientPubkey }) => ({
        signature: mockSig("umbra_pt"),
        recipient: recipientPubkey,
        amountUiAmount,
        mint,
      }),
      scanClaimableUtxos: async () => [
        {
          utxoId: `mock_utxo_${Math.random().toString(36).slice(2, 12)}`,
          amountUiAmount: 50,
          mint: KNOWN_MINTS.USDC_DEVNET ?? "MOCK_MINT",
          blockTime: Math.floor(Date.now() / 1000) - 600,
        },
      ],
      claimUtxo: async ({ utxoId }) => ({
        signature: mockSig("umbra_claim"),
        amountUiAmount: 50,
        mint: KNOWN_MINTS.USDC_DEVNET ?? "MOCK_MINT",
      }),
      exportComplianceCsv: async ({ ownerPubkey }) => {
        const rows = mockScan(ownerPubkey, 8);
        const header = "signature,block_time,type,amount,mint,running_encrypted_balance";
        const body = rows
          .map(
            (r) =>
              `${r.signature},${r.blockTime},${r.type},${r.amountUiAmount},${r.mint},${r.runningEncryptedBalance}`,
          )
          .join("\n");
        return `${header}\n${body}\n`;
      },
    };
  }

  // ─── Live mode ───
  //
  // The Umbra SDK exposes a function-factory pattern rather than a single
  // client class. Our wrapper hides this behind a clean operation API.
  // Pattern:
  //
  //   const sdk = await import("@umbra-privacy/sdk");
  //   const client = sdk.getUmbraClient({ signer, network, rpcUrl });
  //   const deposit = sdk.getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
  //   await deposit({ amount, mint });
  //
  // Each operation lazily resolves its function via the SDK, then calls it
  // with the typed input. Lazy resolution matters for browser bundle size —
  // we don't pull every operation's dependencies if the merchant only ever
  // does a deposit + withdraw flow.

  async function loadSdk() {
    return await import("@umbra-privacy/sdk");
  }

  async function getBaseClient(adapter: WalletAdapterShape) {
    const sdk = await loadSdk();
    // The exact getUmbraClient signature is documented at
    // sdk.umbraprivacy.com/llms.txt as taking { signer, network, rpcUrl }.
    // We pass the wallet adapter as the signer; the SDK pulls publicKey +
    // signTransaction off it directly.
    type GetClientFn = (config: {
      signer: WalletAdapterShape;
      network: UmbraNetwork;
      rpcUrl: string;
    }) => unknown;
    const getUmbraClient = (sdk as unknown as { getUmbraClient: GetClientFn })
      .getUmbraClient;
    return getUmbraClient({
      signer: adapter,
      network,
      rpcUrl: options.rpcUrl ?? "",
    });
  }

  async function registerUser(input: {
    ownerPubkey: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraEncryptedAccount> {
    guard("registerUser");
    const sdk = await loadSdk();
    const client = await getBaseClient(input.walletAdapter);
    type RegFn = (cfg: { client: unknown }) => (...args: unknown[]) => Promise<{ viewingKey?: string }>;
    const get = (sdk as unknown as { getUserRegistrationFunction: RegFn })
      .getUserRegistrationFunction;
    const register = get({ client });
    const result = await register();
    return {
      ownerPubkey: input.ownerPubkey,
      viewingKey: result.viewingKey ?? "",
      registeredAt: new Date().toISOString(),
    };
  }

  async function depositPublicToEncrypted(input: {
    ownerPubkey: string;
    mint: string;
    amountUiAmount: number;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraDepositResult> {
    guard("depositPublicToEncrypted");
    const sdk = await loadSdk();
    const client = await getBaseClient(input.walletAdapter);
    type DepFn = (cfg: {
      client: unknown;
    }) => (args: { amount: number; mint: string }) => Promise<{ signature: string }>;
    const get = (
      sdk as unknown as {
        getPublicBalanceToEncryptedBalanceDirectDepositorFunction: DepFn;
      }
    ).getPublicBalanceToEncryptedBalanceDirectDepositorFunction;
    const deposit = get({ client });
    const result = await deposit({ amount: input.amountUiAmount, mint: input.mint });
    return {
      signature: result.signature,
      amountUiAmount: input.amountUiAmount,
      mint: input.mint,
      createdAt: new Date().toISOString(),
    };
  }

  async function withdrawEncryptedToPublic(input: {
    ownerPubkey: string;
    mint: string;
    amountUiAmount: number;
    recipient: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraWithdrawResult> {
    guard("withdrawEncryptedToPublic");
    const sdk = await loadSdk();
    const client = await getBaseClient(input.walletAdapter);
    type WdFn = (cfg: {
      client: unknown;
    }) => (args: { amount: number; mint: string; recipient: string }) => Promise<{ signature: string }>;
    const get = (
      sdk as unknown as {
        getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction: WdFn;
      }
    ).getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction;
    const withdraw = get({ client });
    const result = await withdraw({
      amount: input.amountUiAmount,
      mint: input.mint,
      recipient: input.recipient,
    });
    return {
      signature: result.signature,
      amountUiAmount: input.amountUiAmount,
      mint: input.mint,
      recipient: input.recipient,
    };
  }

  async function sendPrivately(input: {
    ownerPubkey: string;
    mint: string;
    amountUiAmount: number;
    recipientPubkey: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<UmbraPrivateTransferResult> {
    guard("sendPrivately");
    const sdk = await loadSdk();
    const client = await getBaseClient(input.walletAdapter);
    // Private transfer is two-step in Umbra's model: sender CREATES a
    // claimable UTXO, recipient SCANS + CLAIMS later. This wrapper hides
    // the second half (recipient does it via scanClaimableUtxos + claimUtxo).
    type CreateFn = (
      cfg: { client: unknown },
      proverCfg: { zkProver: unknown },
    ) => (args: { amount: number; mint: string; recipient: string }) => Promise<{ signature: string }>;
    const get = (
      sdk as unknown as {
        getPublicBalanceToReceiverClaimableUtxoCreatorFunction: CreateFn;
      }
    ).getPublicBalanceToReceiverClaimableUtxoCreatorFunction;
    // The zkProver is not optional in the SDK contract; we pass the SDK's
    // default browser-WASM prover. Backend deploys would substitute a
    // different prover.
    const browserProver = (sdk as unknown as { defaultBrowserProver?: unknown }).defaultBrowserProver;
    const create = get({ client }, { zkProver: browserProver });
    const result = await create({
      amount: input.amountUiAmount,
      mint: input.mint,
      recipient: input.recipientPubkey,
    });
    return {
      signature: result.signature,
      recipient: input.recipientPubkey,
      amountUiAmount: input.amountUiAmount,
      mint: input.mint,
    };
  }

  async function scanClaimableUtxos(input: {
    ownerPubkey: string;
  }): Promise<UmbraClaimableUtxo[]> {
    guard("scanClaimableUtxos");
    const sdk = await loadSdk();
    const dummyAdapter: WalletAdapterShape = {
      publicKey: { toString: () => input.ownerPubkey } as PublicKey,
      signTransaction: async (t) => t,
    };
    const client = await getBaseClient(dummyAdapter);
    type ScanFn = (cfg: { client: unknown }) => () => Promise<unknown[]>;
    const get = (sdk as unknown as { getClaimableUtxoScannerFunction: ScanFn })
      .getClaimableUtxoScannerFunction;
    const scan = get({ client });
    const utxos = (await scan()) as Array<{
      id?: string;
      utxoId?: string;
      amount?: number;
      uiAmount?: number;
      mint?: string;
      blockTime?: number;
      from?: string;
    }>;
    return utxos.map((u) => ({
      utxoId: u.utxoId ?? u.id ?? "",
      amountUiAmount: u.uiAmount ?? u.amount ?? 0,
      mint: u.mint ?? "",
      fromOwner: u.from,
      blockTime: u.blockTime ?? 0,
    }));
  }

  async function claimUtxo(input: {
    ownerPubkey: string;
    utxoId: string;
    walletAdapter: WalletAdapterShape;
  }): Promise<{ signature: string; amountUiAmount: number; mint: string }> {
    guard("claimUtxo");
    const sdk = await loadSdk();
    const client = await getBaseClient(input.walletAdapter);
    type ClaimFn = (
      cfg: { client: unknown },
      depCfg: { zkProver: unknown; relayer: unknown },
    ) => (args: { utxoId: string }) => Promise<{ signature: string; amount: number; mint: string }>;
    const get = (
      sdk as unknown as {
        getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction: ClaimFn;
      }
    ).getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction;
    const browserProver = (sdk as unknown as { defaultBrowserProver?: unknown }).defaultBrowserProver;
    const defaultRelayer = (sdk as unknown as { defaultRelayer?: unknown }).defaultRelayer;
    const claim = get({ client }, { zkProver: browserProver, relayer: defaultRelayer });
    const result = await claim({ utxoId: input.utxoId });
    return {
      signature: result.signature,
      amountUiAmount: result.amount ?? 0,
      mint: result.mint ?? "",
    };
  }

  async function exportComplianceCsv(input: {
    ownerPubkey: string;
    afterTimestamp?: number;
    beforeTimestamp?: number;
  }): Promise<string> {
    guard("exportComplianceCsv");
    // TODO Phase D: wire to the SDK's view-key + history-replay path. For
    // Day 8 we return the empty-CSV header so the merchant settings page
    // renders without crashing in live-but-unwired mode.
    void input;
    return "signature,block_time,type,amount,mint,running_encrypted_balance\n";
  }

  return {
    mode,
    network,
    featureFlag: enabled,
    initialise,
    healthcheck,
    getProgramId: () => programId,
    registerUser,
    depositPublicToEncrypted,
    withdrawEncryptedToPublic,
    sendPrivately,
    scanClaimableUtxos,
    claimUtxo,
    exportComplianceCsv,
  };
}

export const UMBRA_CONSTANTS = {
  MAINNET_PROGRAM_ID,
  DEVNET_PROGRAM_ID,
  KNOWN_MINTS,
} as const;
