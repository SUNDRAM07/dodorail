/**
 * Solana helpers used by the wallet sign-in flow.
 *
 * Isolation: the heavy @solana/web3.js import stays out of browser bundles —
 * this file is only imported by server routes. Client-side sign-in uses the
 * wallet adapter SDK directly.
 */

import bs58 from "bs58";
import nacl from "tweetnacl";

/** Verify that `signature` (base58) is a valid Ed25519 signature of `message` by `publicKey` (base58). */
export function verifySolanaSignature(
  message: string,
  signatureBase58: string,
  publicKeyBase58: string,
): boolean {
  try {
    const msgBytes = new TextEncoder().encode(message);
    const sig = bs58.decode(signatureBase58);
    const pub = bs58.decode(publicKeyBase58);
    return nacl.sign.detached.verify(msgBytes, sig, pub);
  } catch {
    return false;
  }
}

/** Stable deterministic merchant slug from a wallet pubkey — uses first 8 chars lowercased. */
export function slugFromWallet(walletAddress: string): string {
  return walletAddress.slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Make a referral code that's memorable-ish from a wallet pubkey. */
export function referralCodeFromWallet(walletAddress: string): string {
  return `dr-${walletAddress.slice(0, 6).toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
}
