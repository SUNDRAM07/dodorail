/**
 * Solana Pay helpers for DodoRail.
 *
 * The customer-facing flow:
 *   1. On invoice creation we generate a unique reference Keypair (public key
 *      only — we never need the private key) and persist the full Solana Pay
 *      URL on Invoice.solanaPayUrl.
 *   2. The /pay/[id] page renders a QR of that URL.
 *   3. Customer scans with Solflare/Phantom, approves a USDC SPL transfer,
 *      and the tx lands on-chain with the reference key as a read-only signer.
 *   4. Our client-side poll hits /api/invoices/[id]/status which scans for
 *      signatures at that reference. When it finds one, we verify the tx,
 *      upsert a Payment row (CONFIRMED), flip Invoice to PAID, and the UI
 *      flips on next poll tick.
 *
 * No Helius webhook needed for the polling path — public Solana RPC is free
 * and the reference-key pattern is the standard Solana Pay merchant flow.
 * When Helius lands on Day 4 we'll swap to push webhooks for sub-second UX.
 */

import { Connection, Keypair, PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import { encodeURL, findReference, validateTransfer } from "@solana/pay";
import BigNumber from "bignumber.js";
import { usdcMintForCluster } from "@dodorail/sdk";

export interface BuildSolanaPayUrlInput {
  merchantWalletAddress: string;
  amountUsdCents: number;
  invoiceId: string;
  merchantLabel: string;
  description?: string;
  cluster?: "mainnet-beta" | "devnet";
}

export interface BuildSolanaPayUrlResult {
  url: string;
  reference: string;
  recipient: string;
  splToken: string;
  amountUsdc: string;
}

/**
 * Build a Solana Pay URL + a reference Keypair. We ONLY keep the reference
 * pubkey in the URL — the Keypair is discarded because we never need to sign.
 */
export function buildSolanaPayUrl(input: BuildSolanaPayUrlInput): BuildSolanaPayUrlResult {
  const cluster = input.cluster ?? "devnet";
  const recipient = new PublicKey(input.merchantWalletAddress);
  const splToken = new PublicKey(usdcMintForCluster(cluster));
  // 1 USDC = $1. We model amounts in USD cents onchain for consistency.
  const amountUsdc = new BigNumber(input.amountUsdCents).dividedBy(100);
  const reference = Keypair.generate().publicKey;

  const url = encodeURL({
    recipient,
    amount: amountUsdc,
    splToken,
    reference,
    label: input.merchantLabel,
    message: input.description ?? `DodoRail invoice ${input.invoiceId.slice(0, 8)}`,
    memo: `dodorail:${input.invoiceId}`,
  });

  return {
    url: url.toString(),
    reference: reference.toBase58(),
    recipient: recipient.toBase58(),
    splToken: splToken.toBase58(),
    amountUsdc: amountUsdc.toString(),
  };
}

/** Pull the reference pubkey out of a Solana Pay URL we generated earlier. */
export function extractReference(solanaPayUrl: string): string | null {
  try {
    // solana: URLs use params after "?".
    const queryIdx = solanaPayUrl.indexOf("?");
    if (queryIdx < 0) return null;
    const params = new URLSearchParams(solanaPayUrl.slice(queryIdx + 1));
    return params.get("reference");
  } catch {
    return null;
  }
}

/**
 * Server-side: look for a signature that transfers USDC to the merchant with
 * the given reference pubkey as a read-only account. Returns the sig + tx
 * metadata on match, null otherwise.
 *
 * We use a modest search window (latest 100 sigs for the reference key) to
 * avoid blowing past RPC rate limits on every poll.
 */
export async function findMatchingPayment(params: {
  rpcUrl: string;
  reference: string;
  recipient: string;
  splToken: string;
  expectedUsdcAmount: string;
}): Promise<{ signature: string; confirmed: ConfirmedSignatureInfo } | null> {
  const connection = new Connection(params.rpcUrl, "confirmed");
  const referenceKey = new PublicKey(params.reference);
  try {
    const sig = await findReference(connection, referenceKey, { finality: "confirmed" });
    // Verify transfer details — rejects partial payments, wrong token, etc.
    await validateTransfer(
      connection,
      sig.signature,
      {
        recipient: new PublicKey(params.recipient),
        amount: new BigNumber(params.expectedUsdcAmount),
        splToken: new PublicKey(params.splToken),
        reference: referenceKey,
      },
      { commitment: "confirmed" },
    );
    return { signature: sig.signature, confirmed: sig };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // `findReference` throws when nothing's found yet — that's the expected
    // case on every poll before the customer pays.
    if (msg.includes("not found") || msg.includes("No signatures")) return null;
    // `validateTransfer` throws on amount/token mismatch — surface as null
    // so the UI doesn't flip to PAID on a wrong-amount tx.
    if (
      msg.includes("amount not transferred") ||
      msg.includes("token mismatch") ||
      msg.includes("recipient")
    ) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[solana-pay] validate failed:", msg);
      }
      return null;
    }
    throw err;
  }
}
