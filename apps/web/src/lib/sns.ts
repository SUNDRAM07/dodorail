/**
 * Solana Name Service (SNS) helpers.
 *
 * Two operations we use in DodoRail's merchant flow:
 *
 *   1. `reverseLookupSns(wallet)` — given a merchant's pubkey, check whether
 *      they own a .sol domain. If so, display it instead of the raw pubkey.
 *   2. `resolveSns(domain)` — given a .sol domain, return the owner's pubkey.
 *      Used when a customer is paying to `acme.dodorail.sol` — we resolve to
 *      the actual wallet + verify the Solana Pay URL is pointing at that key.
 *
 * The SNS SDK (`@bonfida/spl-name-service`) talks to mainnet-beta by default.
 * All operations are idempotent and cache-friendly; per brief §3.9, callers
 * should cache resolutions for up to 1 hour because domains can transfer.
 */

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { reverseLookup, resolve } from "@bonfida/spl-name-service";

function mainnetConnection(): Connection {
  // SNS is on mainnet-beta regardless of our app's cluster. The devnet SNS
  // shadow exists but has no real merchants to look up against.
  const url = process.env.SNS_MAINNET_RPC_URL ?? clusterApiUrl("mainnet-beta");
  return new Connection(url, "confirmed");
}

/**
 * Returns the merchant's .sol domain if one is owned by this wallet, else null.
 * Gracefully swallows errors — SNS resolution is a display nicety, not a
 * correctness requirement.
 */
export async function reverseLookupSns(walletAddress: string): Promise<string | null> {
  try {
    const conn = mainnetConnection();
    const pubkey = new PublicKey(walletAddress);
    const name = await reverseLookup(conn, pubkey);
    if (!name) return null;
    // Bonfida returns the leaf (e.g. "acme"). We render as `acme.sol`.
    return `${name}.sol`;
  } catch {
    return null;
  }
}

/**
 * Returns the owner pubkey for a given `.sol` domain, or null.
 * Accepts inputs with or without `.sol` suffix.
 */
export async function resolveSns(domain: string): Promise<string | null> {
  try {
    const normalised = domain.endsWith(".sol") ? domain.slice(0, -4) : domain;
    const conn = mainnetConnection();
    const ownerKey = await resolve(conn, normalised);
    return ownerKey.toBase58();
  } catch {
    return null;
  }
}
