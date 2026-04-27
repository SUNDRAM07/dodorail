/**
 * Umbra v4 SDK devnet smoke test — DodoRail Day 8.
 *
 * This calls the v4 SDK directly (not via @dodorail/umbra wrapper) because the
 * wrapper assumed an older API shape; reconciling the wrapper to v4 is Day 9
 * morning's first task. For now we just need real devnet tx signatures for the
 * Umbra essay's Live verification section.
 *
 * v4 calling convention (from `discover-v2.ts` introspection):
 *   - createSignerFromPrivateKeyBytes(<64-byte-keypair>) → IUmbraSigner
 *   - getUmbraClient({ signer, network, rpcUrl, rpcSubscriptionsUrl }, deps?) → Client
 *   - getXFunction({ client }, deps?) → operation
 *   - operation(<operation-specific args>)
 *
 * Usage:
 *   pnpm --filter @dodorail/umbra exec tsx src/smoke-test.ts
 *
 * Reads from `packages/integrations/umbra/.env`:
 *   DODORAIL_DEVNET_WALLET_SECRET   (base58 64-byte secret key from Phantom)
 *   DODORAIL_DEVNET_RPC_URL         (Helius devnet HTTP endpoint)
 */

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import * as umbra from "@umbra-privacy/sdk";

// Load .env from the package directory (Node 22+ built-in).
try {
  // @ts-expect-error — Node 22 built-in
  process.loadEnvFile?.();
} catch {
  /* fall through to env-var check below */
}

const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Convert wss:// → ws://, or build a default subscriptions URL from the http URL.
function deriveSubscriptionsUrl(rpcUrl: string): string {
  if (rpcUrl.startsWith("wss://") || rpcUrl.startsWith("ws://")) return rpcUrl;
  if (rpcUrl.startsWith("https://")) return rpcUrl.replace(/^https:/, "wss:");
  if (rpcUrl.startsWith("http://")) return rpcUrl.replace(/^http:/, "ws:");
  return rpcUrl;
}

async function main() {
  const secret = process.env.DODORAIL_DEVNET_WALLET_SECRET;
  if (!secret) {
    console.error("[umbra-smoke] DODORAIL_DEVNET_WALLET_SECRET unset.");
    process.exit(1);
  }
  const rpcUrl = process.env.DODORAIL_DEVNET_RPC_URL ?? clusterApiUrl("devnet");
  const rpcSubscriptionsUrl = deriveSubscriptionsUrl(rpcUrl);

  // Decode the 64-byte secret key. Sanity-check length.
  const secretBytes = bs58.decode(secret);
  if (secretBytes.length !== 64) {
    console.error(
      `[umbra-smoke] secret key must be 64 bytes (full keypair), got ${secretBytes.length}.`,
    );
    console.error(
      "  In Phantom: Settings → Manage Accounts → Show Private Key → copy the full base58 string.",
    );
    process.exit(1);
  }

  // Compute pubkey via @solana/web3.js for logging + RPC pre-checks.
  const senderKeypair = Keypair.fromSecretKey(secretBytes);
  const senderPubkey = senderKeypair.publicKey.toBase58();
  console.log(`[umbra-smoke] sender pubkey:        ${senderPubkey}`);
  console.log(`[umbra-smoke] rpc:                  ${rpcUrl}`);
  console.log(`[umbra-smoke] rpcSubscriptionsUrl:  ${rpcSubscriptionsUrl}`);

  // RPC sanity-check on @solana/web3.js side.
  const conn = new Connection(rpcUrl, "confirmed");
  const lamports = await conn.getBalance(senderKeypair.publicKey).catch(() => 0);
  if (lamports < 50_000_000) {
    console.error(
      `[umbra-smoke] wallet has ${lamports / 1e9} SOL — need ≥ 0.05 SOL on devnet.`,
    );
    process.exit(1);
  }
  console.log(`[umbra-smoke] wallet has ${(lamports / 1e9).toFixed(4)} SOL on devnet ✓`);

  // ──────────────────── v4 SDK init ────────────────────
  console.log("[umbra-smoke] creating Umbra signer + client (v4 SDK)…");
  const signer = await umbra.createSignerFromPrivateKeyBytes(secretBytes);
  const client = await umbra.getUmbraClient(
    {
      signer,
      network: "devnet",
      rpcUrl,
      rpcSubscriptionsUrl,
    },
    undefined, // deps — SDK uses defaults
  );
  console.log("  ✓ client created");
  console.log(`    client keys: ${Object.keys(client as object).slice(0, 12).join(", ")}…`);

  const captured: Record<string, string> = {
    network: "devnet",
    sender: senderPubkey,
  };

  // ──────────────────── Stage 1 — register user (non-anonymous to skip ZK prover) ────────────────────
  try {
    console.log("[umbra-smoke] stage 1: registerUser (anonymous=false)…");
    const registerFn = umbra.getUserRegistrationFunction({ client }, undefined);
    // We pass anonymous=false so the SDK doesn't require a ZK prover. For
    // production, real anonymity uses anonymous=true + a real prover wired
    // via deps.zkProver — that's a Day 9+ refactor.
    const result = await (registerFn as (opts?: unknown) => Promise<unknown>)({
      anonymous: false,
      confidential: true,
    });
    captured.registered = "ok";
    // Result shape from earlier run: object with keys "0,1" → array-indexed.
    // Could be [txSig1, txSig2] (two-tx registration flow) OR [resultObj, resultObj].
    if (Array.isArray(result)) {
      console.log(`  ✓ registered. ${result.length} entries returned`);
      result.forEach((entry, i) => {
        const summary =
          typeof entry === "string"
            ? entry
            : typeof entry === "object" && entry !== null
              ? JSON.stringify(entry, (_, v) => (typeof v === "bigint" ? `${v}n` : v)).slice(0, 200)
              : String(entry);
        console.log(`    [${i}] ${summary}`);
        if (typeof entry === "string" && entry.length >= 64) {
          captured[`registerTx_${i}`] = entry;
        } else if (typeof entry === "object" && entry !== null) {
          const e = entry as Record<string, unknown>;
          const sig = (e.signature ?? e.txSignature ?? e.transactionSignature) as
            | string
            | undefined;
          if (sig) captured[`registerTx_${i}`] = sig;
        }
      });
    } else if (typeof result === "object" && result !== null) {
      const r = result as Record<string, unknown>;
      const keys = Object.keys(r);
      console.log(`  ✓ registered. result keys: ${keys.slice(0, 10).join(",")}`);
      // Walk values for anything that looks like a signature.
      keys.forEach((k) => {
        const v = r[k];
        if (typeof v === "string" && v.length >= 64) {
          captured[`registerTx_${k}`] = v;
          console.log(`    ${k}: ${v}`);
        } else if (typeof v === "object" && v !== null) {
          const sub = v as Record<string, unknown>;
          const sig = (sub.signature ?? sub.txSignature) as string | undefined;
          if (sig) {
            captured[`registerTx_${k}`] = sig;
            console.log(`    ${k}.signature: ${sig}`);
          }
        }
      });
    } else {
      console.log(`  ✓ registered. result: ${String(result).slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already.*regist/i.test(msg)) {
      captured.registered = "already_registered";
      console.log(`  ⓘ already registered (continuing): ${msg.slice(0, 120)}`);
    } else {
      console.warn(`  ⚠ registerUser: ${msg.slice(0, 200)}`);
      captured.registerError = msg.slice(0, 80);
    }
  }

  // ──────────────────── Stage 2 — query balance (read-only, takes mints[]) ────────────────────
  try {
    console.log("[umbra-smoke] stage 2: queryEncryptedBalance (read-only)…");
    const queryFn = umbra.getEncryptedBalanceQuerierFunction({ client }, undefined);
    // Signature: queryFn(mints: string[], options?)
    const balance = await (queryFn as (mints: string[], opts?: unknown) => Promise<unknown>)(
      [DEVNET_USDC],
      undefined,
    );
    captured.balanceQuery = "ok";
    // Result is a Map; serialize what we can.
    let balanceStr: string;
    try {
      balanceStr =
        balance instanceof Map
          ? JSON.stringify(Array.from(balance.entries()), (_, v) =>
              typeof v === "bigint" ? `${v}n` : v,
            )
          : JSON.stringify(balance, (_, v) => (typeof v === "bigint" ? `${v}n` : v));
    } catch {
      balanceStr = String(balance);
    }
    console.log(`  ✓ balance: ${balanceStr.slice(0, 250)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ queryBalance: ${msg.slice(0, 200)}`);
  }

  // ──────────────────── Stage 3 — deposit (4 positional args, not options object) ────────────────────
  try {
    console.log("[umbra-smoke] stage 3: depositPublicToEncrypted (1 USDC devnet)…");
    const depositFn = umbra.getPublicBalanceToEncryptedBalanceDirectDepositorFunction(
      { client },
      undefined,
    );
    // Print the FULL source (more chars) so we can see what the function does.
    const fullSrc = (depositFn as { toString: () => string }).toString().replace(/\s+/g, " ");
    console.log(`    depositFn full source (1500c): ${fullSrc.slice(0, 1500)}`);
    // Signature: depositFn(destinationAddress, mint, transferAmount, options)
    //   - destinationAddress = wallet that will OWN the encrypted balance
    //     (we self-deposit so it's our own address)
    //   - mint = SPL mint
    //   - transferAmount = bigint base units (1 USDC = 10^6)
    //   - options = optional commitment / fee config
    const result = await (
      depositFn as (
        destinationAddress: string,
        mint: string,
        transferAmount: bigint,
        options?: unknown,
      ) => Promise<unknown>
    )(senderPubkey, DEVNET_USDC, 1_000_000n, undefined);
    const sig = (result as { signature?: string; txSignature?: string })?.signature ??
      (result as { txSignature?: string })?.txSignature;
    if (sig) {
      captured.depositTx = sig;
      console.log(`  ✓ tx: ${sig}`);
    } else {
      const summary = JSON.stringify(result, (_, v) =>
        typeof v === "bigint" ? `${v}n` : v,
      ).slice(0, 200);
      console.log(`  ✓ result: ${summary}`);
      captured.depositResult = summary.slice(0, 80);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ deposit: ${msg.slice(0, 250)}`);
    captured.depositError = msg.slice(0, 100);

    // Dump the FULL error structure — every property, every nested cause —
    // since the generic "simulation failed" message hides the real cause
    // somewhere in the error object. Walking up to 3 levels deep.
    console.error("    full error inspection:");
    function dumpErr(e: unknown, label: string, depth: number): void {
      if (depth > 3) return;
      if (e === null || e === undefined) return;
      if (typeof e === "string" || typeof e === "number" || typeof e === "boolean") {
        console.error(`      ${label} = ${e}`);
        return;
      }
      if (e instanceof Error) {
        console.error(`      ${label}.name = ${e.name}`);
        console.error(`      ${label}.message = ${e.message?.slice(0, 300)}`);
        if ((e as { code?: unknown }).code !== undefined) {
          console.error(`      ${label}.code = ${(e as { code?: unknown }).code}`);
        }
        const cause = (e as { cause?: unknown }).cause;
        if (cause) dumpErr(cause, `${label}.cause`, depth + 1);
        const own = Object.keys(e).filter((k) => k !== "stack");
        for (const k of own) {
          dumpErr((e as Record<string, unknown>)[k], `${label}.${k}`, depth + 1);
        }
        return;
      }
      if (Array.isArray(e)) {
        console.error(`      ${label} = array(${e.length})`);
        e.slice(0, 8).forEach((v, i) => dumpErr(v, `${label}[${i}]`, depth + 1));
        return;
      }
      if (typeof e === "object") {
        const keys = Object.keys(e as object);
        console.error(`      ${label}.keys = ${keys.slice(0, 12).join(", ")}`);
        for (const k of keys.slice(0, 12)) {
          dumpErr((e as Record<string, unknown>)[k], `${label}.${k}`, depth + 1);
        }
      }
    }
    dumpErr(err, "err", 0);

    // Specifically extract simulation logs — they live at err.cause.context.logs
    // which our generic dump found but didn't expand individual lines.
    function findLogs(e: unknown, depth = 0): unknown[] | null {
      if (depth > 5 || e === null || e === undefined) return null;
      if (typeof e !== "object") return null;
      const obj = e as Record<string, unknown>;
      if (Array.isArray(obj.logs)) return obj.logs;
      if (obj.context && typeof obj.context === "object") {
        const ctxLogs = (obj.context as Record<string, unknown>).logs;
        if (Array.isArray(ctxLogs)) return ctxLogs;
      }
      if (obj.cause) return findLogs(obj.cause, depth + 1);
      return null;
    }
    const logs = findLogs(err);
    if (logs) {
      console.error("");
      console.error("    🪵 Solana program logs (the actual cause):");
      logs.forEach((l, i) => console.error(`      [${i}] ${String(l)}`));
    }
    // Hint for known program error codes
    if (/3012/.test(msg) || (logs && logs.some((l) => String(l).includes("3012")))) {
      console.error("");
      console.error("    🔎 Anchor error code 3012 = ConstraintTokenMint");
      console.error("    The Umbra program rejected this mint. Likely causes:");
      console.error("    1. Mint isn't whitelisted on Umbra devnet (only specific test mints work)");
      console.error("    2. Wallet's encrypted account isn't initialised for THIS mint yet");
      console.error("    3. Mint program mismatch (Token vs Token-2022)");
    }
  }

  // ──────────────────── Final capture block ────────────────────
  console.log("");
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("Umbra v4 devnet smoke test — capture this block:");
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log(`network            : devnet`);
  console.log(`sender             : ${senderPubkey}`);
  console.log(`rpc                : ${rpcUrl}`);
  for (const [k, v] of Object.entries(captured)) {
    if (k === "network" || k === "sender") continue;
    console.log(`${k.padEnd(19)}: ${v}`);
  }
  console.log("════════════════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[umbra-smoke] unhandled error:", err);
  process.exit(1);
});
