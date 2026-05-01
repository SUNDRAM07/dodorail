/**
 * @dodorail/x402 — x402-on-Solana integration.
 *
 * What x402 is:
 *   x402 is a draft standard (x402.org) for HTTP 402 Payment Required.
 *   When a server returns 402, the response body describes acceptable
 *   payment methods. The client signs a payment, retries the request
 *   with the payment data in a header, and gets the resource.
 *
 *   The Solana x402 dialect: the server's 402 body specifies a USDC
 *   amount + recipient. The client signs a Solana SPL transfer for that
 *   amount, submits it to the network, and includes the tx signature
 *   in the retry's `x-payment` header. The server verifies the tx on
 *   chain, then serves the resource.
 *
 *   Solana drove ~77% of x402 transaction volume in late 2025 (per file
 *   10 §3 — Zerion research doc).
 *
 * Two surfaces this package serves:
 *
 *   1. INBOUND (server-side) — DodoRail merchant exposes an API endpoint
 *      that returns 402 if no payment header is present. An autonomous
 *      agent can pay for the resource directly without a user account
 *      or API key. Used by `apps/web/src/app/api/x402/[merchantId]/route.ts`.
 *
 *   2. OUTBOUND (client-side) — DodoRail's Treasury Agent pays Zerion's
 *      x402-on-Solana endpoints to fetch portfolio data without holding
 *      a Zerion API key. Helper builders here; actual signing happens in
 *      the agent's adapter using the agent wallet.
 *
 * For Day 18 we ship the verifier + the header-builder. The agent-wallet
 * signing flow lives in `apps/agent/` and is gated behind agent funding
 * (last-week per `CARRYOVER-MONEY-DECISIONS.md`).
 *
 * Reference:
 *   - x402.org standard
 *   - Zerion's x402 docs at developers.zerion.io/x402
 */

// ---------- INBOUND types (server-side) ----------------------------

export interface X402PaymentSpec {
  /** Solana SPL token mint the resource accepts. Defaults to USDC mainnet. */
  mint: string;
  /** Recipient wallet address. The merchant's settlement wallet. */
  recipient: string;
  /** Amount in smallest unit of the token. For USDC: cents × 10000 = base units (USDC has 6 decimals). */
  amountBaseUnits: bigint;
  /** Solana cluster the payment is expected on. */
  cluster: "mainnet-beta" | "devnet";
  /** Resource id — what the agent is paying for. Logged on settlement. */
  resourceId: string;
}

export interface X402PaymentChallenge {
  /** Spec sent in the 402 response body. */
  spec: X402PaymentSpec;
  /** Where the agent should POST the signed-tx-sig retry. Usually the same URL with `?x402=verify` appended. */
  verifyUrl: string;
  /** Server-side nonce so the agent can't replay an old payment. */
  nonce: string;
  /** Expiration timestamp (UNIX seconds). Agent must complete + retry within this window. */
  expiresAt: number;
}

export interface X402VerifyResult {
  ok: boolean;
  /** Solana tx signature the agent submitted. */
  txSig?: string;
  /** Reason on failure. */
  reason?: string;
  /** Once verified, the resource the merchant should serve. */
  resourceId?: string;
}

// ---------- OUTBOUND types (client-side / agent) ------------------

export interface X402ClientPayment {
  /** Spec the server returned. */
  spec: X402PaymentSpec;
  /** Tx signature the client built + signed. */
  txSig: string;
  /** Header value the client should send on the retry: `<txSig>:<nonce>`. */
  headerValue: string;
}

// ---------- INBOUND server helpers --------------------------------

/** USDC mint addresses by cluster — same constants as `@dodorail/sdk`. */
const USDC_MINTS = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr", // spl-token-faucet mint
} as const;

/** Build the 402 response body for an unauthenticated agent request.
 *
 * Server flow:
 *   1. Request arrives without `x-payment` header → call `buildChallenge`
 *      → respond 402 with this body
 *   2. Agent signs + submits tx → retries with `x-payment: <txSig>:<nonce>`
 *   3. Server calls `verifyPayment` → if OK, serves the resource
 */
export function buildChallenge(input: {
  recipient: string;
  amountUsdcCents: number;
  resourceId: string;
  cluster: "mainnet-beta" | "devnet";
  /** Verify URL the agent retries to. */
  verifyUrl: string;
  /** TTL for the challenge in seconds. Defaults to 300 (5 min). */
  ttlSeconds?: number;
}): X402PaymentChallenge {
  const ttl = input.ttlSeconds ?? 300;
  // Generate a 16-byte hex nonce so the agent can't replay an old payment.
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2).padEnd(32, "0").slice(0, 32);

  const amountBaseUnits = BigInt(input.amountUsdcCents) * 10_000n; // USDC = 6 decimals; cents × 10^4 = base units

  return {
    spec: {
      mint: USDC_MINTS[input.cluster],
      recipient: input.recipient,
      amountBaseUnits,
      cluster: input.cluster,
      resourceId: input.resourceId,
    },
    verifyUrl: input.verifyUrl,
    nonce,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
}

export interface VerifyPaymentInput {
  /** The tx signature the agent submitted. Read from `x-payment` header. */
  txSig: string;
  /** The nonce the server issued. Read from challenge state. */
  expectedNonce: string;
  /** Nonce the agent claimed it was paying against. From the `x-payment` header. */
  claimedNonce: string;
  /** Spec the server expects to be paid against. */
  expectedSpec: X402PaymentSpec;
  /** Optional: a fetch-impl to lookup the tx on chain. Mock-friendly. */
  fetchImpl?: typeof fetch;
  /** Optional: RPC URL override. Defaults to a public Solana RPC. */
  rpcUrl?: string;
}

interface ParsedTx {
  meta?: {
    err?: unknown;
    postTokenBalances?: Array<{
      mint: string;
      owner?: string;
      uiTokenAmount?: { amount: string; decimals: number };
    }>;
    preTokenBalances?: Array<{
      mint: string;
      owner?: string;
      uiTokenAmount?: { amount: string; decimals: number };
    }>;
  };
}

/** Walk the postTokenBalances vs preTokenBalances diff for the recipient
 * + mint pair. The recipient's balance must have INCREASED by at least
 * the spec's expected amount. */
function matchesExpectedTransfer(tx: ParsedTx, spec: X402PaymentSpec): boolean {
  const post = tx.meta?.postTokenBalances ?? [];
  const pre = tx.meta?.preTokenBalances ?? [];

  const recipientPost = post.find(
    (b) => b.owner === spec.recipient && b.mint === spec.mint,
  );
  if (!recipientPost?.uiTokenAmount) return false;

  const recipientPre = pre.find(
    (b) => b.owner === spec.recipient && b.mint === spec.mint,
  );
  // Pre-balance can be missing (account didn't exist before tx). Treat as 0.
  const postAmt = BigInt(recipientPost.uiTokenAmount.amount);
  const preAmt = BigInt(recipientPre?.uiTokenAmount?.amount ?? "0");
  const delta = postAmt - preAmt;
  return delta >= spec.amountBaseUnits;
}

/** Verify a Solana tx satisfies the payment spec.
 *
 * For Day 18 we ship a minimal verifier that:
 *   - Confirms nonce matches
 *   - Pings Solana RPC's `getTransaction` to confirm the tx is finalized
 *   - Confirms the tx contains an SPL transfer to the recipient with at
 *     least the expected amount (via postTokenBalances / preTokenBalances diff)
 *
 * Day 19+ polish (post-hackathon) will add:
 *   - Helius webhook listener for fast-confirm push
 *   - Settlement record write to a dedicated `X402Payment` Prisma table
 *   - Replay-detection across nonces
 */
export async function verifyPayment(
  input: VerifyPaymentInput,
): Promise<X402VerifyResult> {
  // 1. Nonce check first — cheap fail.
  if (input.claimedNonce !== input.expectedNonce) {
    return { ok: false, reason: "nonce_mismatch" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const rpcUrl =
    input.rpcUrl ??
    (input.expectedSpec.cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  // 2. Tx existence + finalization via Solana RPC.
  try {
    const res = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          input.txSig,
          { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `rpc_http_${res.status}` };
    }
    const json = (await res.json()) as { result?: ParsedTx | null; error?: { message: string } };
    if (json.error) {
      return { ok: false, reason: `rpc_error: ${json.error.message}` };
    }
    if (!json.result) {
      return { ok: false, reason: "tx_not_found" };
    }
    if (json.result.meta?.err) {
      return { ok: false, reason: "tx_failed_on_chain" };
    }

    // 3. Look for an SPL transfer matching the expected recipient + amount.
    const transferOk = matchesExpectedTransfer(json.result, input.expectedSpec);
    if (!transferOk) {
      return { ok: false, reason: "transfer_does_not_match_spec" };
    }

    return {
      ok: true,
      txSig: input.txSig,
      resourceId: input.expectedSpec.resourceId,
    };
  } catch (err) {
    return {
      ok: false,
      reason: `verify_exception: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

// ---------- OUTBOUND client helpers --------------------------------

/** Build the `x-payment` header value the agent sends on retry.
 *
 * Format: `<txSig>:<nonce>`
 *
 * The agent flow:
 *   1. Hits the resource URL, gets 402 with X402PaymentChallenge body
 *   2. Builds a SPL transfer matching `spec.recipient` + `spec.amountBaseUnits`
 *      using the agent's Solana wallet
 *   3. Submits the tx, gets a signature
 *   4. Calls this helper to format the retry header
 *   5. Retries the original URL with `x-payment: <header>`
 *   6. Server returns the resource
 */
export function buildClientPaymentHeader(input: {
  txSig: string;
  nonce: string;
}): string {
  return `${input.txSig}:${input.nonce}`;
}

/** Parse the `x-payment` header on the server side. Returns null if malformed. */
export function parseClientPaymentHeader(
  raw: string | null | undefined,
): { txSig: string; nonce: string } | null {
  if (!raw) return null;
  const parts = raw.trim().split(":");
  if (parts.length !== 2) return null;
  const [txSig, nonce] = parts;
  if (!txSig || !nonce) return null;
  return { txSig, nonce };
}

// ---------- Constants for the merchant + agent essays --------------

export const X402_CONSTANTS = {
  defaultTtlSeconds: 300,
  defaultAmountUsdcCentsPerCall: 1, // $0.01 — Zerion's published per-call x402 price
  protocol: "x402.org",
  solanaShareOfX402Volume: "~77% (late 2025)",
} as const;
