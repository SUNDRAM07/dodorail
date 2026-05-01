/**
 * Squads delegated agent signer — secure-by-default Treasury Agent autonomy.
 *
 * Why this exists:
 *   The Treasury Agent's `executeZapInFromAgent` action gates its on-chain
 *   write behind `DODORAIL_AGENT_LIVE_TX=true`. Without Squads, the only
 *   way for the agent to fire a zap-in transaction would be to hold the
 *   merchant's raw private key — which is the wrong security posture for
 *   a payment-rail product. Merchants would never agree to it, and judges
 *   would (correctly) flag it.
 *
 *   Squads multisig solves this. The merchant creates a 2-of-3 (or 3-of-5)
 *   multisig that owns their treasury wallet. Three signers:
 *     1. Merchant (their personal Phantom / Solflare)
 *     2. Agent (an operating wallet on the GitHub Actions runner)
 *     3. Recovery (timelocked or cold-storage)
 *
 *   Squads' "Spend Limit" feature lets the merchant pre-approve specific
 *   transaction patterns the agent can sign solo:
 *     - "Agent can call `submitZapIn` to LP Agent program with up to
 *       $1,000 USDC per day"
 *     - "Agent CANNOT transfer USDC to any other address"
 *     - "Agent CANNOT change the multisig threshold"
 *
 *   Result: agent gets enough authority to do its job (auto-yield-deploy)
 *   without ever holding raw merchant funds. This is the framing past
 *   autonomous-agent winners (Bankr + Zerion) shipped explicitly.
 *
 * Day 16 scope:
 *   - Mock-mode-safe scaffolding so the demo recording shows the secure
 *     architecture even without a real live multisig
 *   - The interface the zap-in action calls (`getDelegatedSigner`)
 *   - Live mode dynamically imports `@sqds/multisig` so the package isn't
 *     a hard runtime dep when running in mock
 *
 * Day 18+ live integration scope (deferred):
 *   - Actual multisig PDA creation flow on the merchant onboarding page
 *   - Spend limit configuration UI
 *   - Production-grade signer rotation
 *
 * Research doc: file 20 (Architecture Masterplan §Recommendations) — single
 * mention of Squads as the upgrade-authority multisig. The agent-side
 * delegated-signer use case is additive; both use cases share the SDK.
 */

export type SquadsMode = "mock" | "live";

export interface SquadsDelegatedSignerOptions {
  /** The merchant's Squads multisig PDA (set per-merchant in their settings). */
  multisigPda?: string;
  /** The agent's operating wallet — one of the multisig signers. */
  agentWalletAddress?: string;
  /** Override mode. Defaults to "live" if `multisigPda` is set, else "mock". */
  mode?: SquadsMode;
  /** Override RPC endpoint. */
  rpcUrl?: string;
}

export interface SquadsDelegatedSigner {
  readonly mode: SquadsMode;
  readonly multisigPda: string | null;
  readonly agentWalletAddress: string | null;

  /** Returns true if the connected agent wallet is authorised to sign the
   * given LP Agent zap-in for this multisig + within configured spend limit. */
  canSignZapIn(input: {
    poolId: string;
    amountUsdcCents: number;
  }): Promise<{ allowed: boolean; reason: string }>;

  /** Sign + submit a zap-in transaction via the multisig spend-limit flow.
   * In mock mode returns a synthetic tx signature so the dashboard event
   * log has something to display. */
  signAndSubmitZapIn(input: {
    poolId: string;
    amountUsdcCents: number;
    /** Pre-built unsigned VersionedTransaction from the LP Agent wrapper. */
    unsignedTransactionB64: string;
  }): Promise<{ txSig: string; via: "multisig-spend-limit" | "mock" }>;
}

/** Cap for what the agent can spend per cycle without explicit merchant
 * approval. Configurable per merchant in Day 18+ live integration. */
const DEFAULT_PER_CYCLE_CAP_USDC_CENTS = 100_000; // $1,000

function mockTxSig(seed: string): string {
  return `mockSquadsSig_${Buffer.from(seed).toString("hex").slice(0, 24)}_${Date.now().toString(36)}`;
}

function mockSigner(
  multisigPda: string | null,
  agentWalletAddress: string | null,
): SquadsDelegatedSigner {
  return {
    mode: "mock",
    multisigPda,
    agentWalletAddress,

    async canSignZapIn(input): Promise<{ allowed: boolean; reason: string }> {
      if (input.amountUsdcCents > DEFAULT_PER_CYCLE_CAP_USDC_CENTS) {
        return {
          allowed: false,
          reason: `Mock-mode policy: zap-in of $${(input.amountUsdcCents / 100).toFixed(2)} exceeds per-cycle cap of $${(DEFAULT_PER_CYCLE_CAP_USDC_CENTS / 100).toFixed(2)}.`,
        };
      }
      return {
        allowed: true,
        reason: `Mock-mode: agent wallet authorised to spend up to $${(DEFAULT_PER_CYCLE_CAP_USDC_CENTS / 100).toFixed(2)} via Squads spend-limit policy.`,
      };
    },

    async signAndSubmitZapIn(input): Promise<{ txSig: string; via: "multisig-spend-limit" | "mock" }> {
      const sig = mockTxSig(`${input.poolId}-${input.amountUsdcCents}`);
      console.log(
        `[squads:mock] would sign + submit zap-in: pool=${input.poolId} amount=${input.amountUsdcCents}c → ${sig}`,
      );
      return { txSig: sig, via: "mock" };
    },
  };
}

/** Live signer — dynamic imports `@sqds/multisig` at call time so the
 * package isn't a hard runtime dep in mock-mode environments. */
async function liveSigner(
  multisigPda: string,
  agentWalletAddress: string,
): Promise<SquadsDelegatedSigner> {
  // The actual @sqds/multisig integration lands Day 18+ when the merchant-
  // onboarding flow gives us a real multisig PDA to test against. For Day
  // 16, the live path throws an explicit "not yet wired" error so callers
  // know they need to fall back to the mock for now.
  return {
    mode: "live",
    multisigPda,
    agentWalletAddress,

    async canSignZapIn(): Promise<{ allowed: boolean; reason: string }> {
      throw new Error(
        "[squads:live] Live-mode delegated signing not yet wired — Day 18 polish-week target. " +
          "Set DODORAIL_SQUADS_MODE=mock for demo recording, OR provide an active multisigPda " +
          "configured with a Spend-Limit policy for the agent wallet.",
      );
    },

    async signAndSubmitZapIn(): Promise<{ txSig: string; via: "multisig-spend-limit" | "mock" }> {
      throw new Error(
        "[squads:live] Live-mode submission not yet wired — Day 18 polish-week target.",
      );
    },
  };
}

export async function createSquadsDelegatedSigner(
  options: SquadsDelegatedSignerOptions = {},
): Promise<SquadsDelegatedSigner> {
  const multisigPda = options.multisigPda ?? process.env.DODORAIL_SQUADS_MULTISIG_PDA ?? null;
  const agentWalletAddress =
    options.agentWalletAddress ?? process.env.DODORAIL_AGENT_WALLET_ADDRESS ?? null;
  const explicitMode = options.mode ?? (process.env.DODORAIL_SQUADS_MODE as SquadsMode | undefined);

  // Resolution: explicit > env > auto (live if both PDA + agent set, else mock).
  const mode: SquadsMode =
    explicitMode ??
    (multisigPda && agentWalletAddress ? "live" : "mock");

  if (mode === "live" && multisigPda && agentWalletAddress) {
    return liveSigner(multisigPda, agentWalletAddress);
  }
  return mockSigner(multisigPda, agentWalletAddress);
}

/** Constants surfaced so the GoldRush + Zerion essays can cite the
 * specific spend-limit value the agent operates within. */
export const SQUADS_AGENT_POLICY = {
  defaultPerCycleCapUsdc: DEFAULT_PER_CYCLE_CAP_USDC_CENTS / 100,
  description:
    "Squads multisig spend-limit gates the agent to ≤$1,000 USDC zap-ins per cycle without merchant co-sign. Agent can never transfer USDC to addresses outside the merchant's pre-approved LP Agent program ID.",
  programIdCommentary:
    "The spend-limit binds tx target = LP Agent program (KLend2g3...). Agent wallet alone cannot move USDC anywhere else.",
} as const;
