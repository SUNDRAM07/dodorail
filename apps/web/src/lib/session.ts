/**
 * DodoRail session primitive — stateless HMAC-signed cookies via Web Crypto.
 *
 * Uses the Web Crypto API (globalThis.crypto.subtle) so the same file works
 * in Edge Runtime (middleware), Node.js runtime (route handlers), and the
 * browser if ever needed.
 *
 * Day 3 plan: swap this file for Better-Auth's session primitives. Every
 * consumer calls `readSessionToken` / `buildSessionToken` / `buildChallenge`
 * / `readChallenge` from here, so the migration stays local.
 *
 * Cookie format (unchanged):
 *   <url-safe-base64-payload-json>.<url-safe-base64-hmac-sha256-signature>
 */

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

const SESSION_COOKIE = "dodorail_session";
const CHALLENGE_COOKIE = "dodorail_challenge";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const CHALLENGE_MAX_AGE_SECONDS = 60 * 5; // 5 minutes

export interface SessionPayload {
  merchantId: string;
  walletAddress: string;
  iat: number;
  exp: number;
}

export interface ChallengePayload {
  nonce: string;
  walletAddress: string;
  iat: number;
  exp: number;
}

function getSecretBytes(): Uint8Array {
  const secret = process.env.DODORAIL_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DODORAIL_SESSION_SECRET must be set (>=32 bytes) in production.");
    }
    return new TextEncoder().encode("dev-secret-do-not-use-in-prod-padding-padding-padding");
  }
  return new TextEncoder().encode(secret);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? 0 : 4 - (str.length % 4);
  const b64 = str.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Casts are narrow: TS 5.7+ distinguishes Uint8Array<ArrayBuffer> from
 *  Uint8Array<SharedArrayBuffer>, but Web Crypto only ever sees ArrayBuffer
 *  here (we never touch SharedArrayBuffer). Using `BufferSource` keeps the
 *  call sites honest. */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function importHmacKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    asBufferSource(getSecretBytes()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: Json): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey();
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    asBufferSource(new TextEncoder().encode(body)),
  );
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyPayload<T>(token: string): Promise<T | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await importHmacKey();
  const ok = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    asBufferSource(fromBase64Url(sig)),
    asBufferSource(new TextEncoder().encode(body)),
  );
  if (!ok) return null;
  try {
    const decoded = new TextDecoder().decode(fromBase64Url(body));
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------- */
/*                               Session helpers                              */
/* -------------------------------------------------------------------------- */

export async function buildSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp">,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  return signPayload(full as unknown as Json);
}

export async function readSessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const payload = await verifyPayload<SessionPayload>(token);
  if (!payload) return null;
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

/* -------------------------------------------------------------------------- */
/*                              Challenge helpers                             */
/* -------------------------------------------------------------------------- */

export async function buildChallenge(walletAddress: string): Promise<{
  token: string;
  nonce: string;
  message: string;
  expiresAt: string;
}> {
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomHex(16);
  const payload: ChallengePayload = {
    nonce,
    walletAddress,
    iat: now,
    exp: now + CHALLENGE_MAX_AGE_SECONDS,
  };
  const token = await signPayload(payload as unknown as Json);
  const expiresAt = new Date(payload.exp * 1000).toISOString();
  const message = [
    "Sign in to DodoRail",
    "",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
    "",
    "This signature proves you own this wallet. It is not a transaction and costs nothing.",
  ].join("\n");
  return { token, nonce, message, expiresAt };
}

export async function readChallenge(
  token: string | undefined,
): Promise<ChallengePayload | null> {
  if (!token) return null;
  const payload = await verifyPayload<ChallengePayload>(token);
  if (!payload) return null;
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

/* -------------------------------------------------------------------------- */
/*                              Cookie attributes                             */
/* -------------------------------------------------------------------------- */

export const COOKIE_NAMES = {
  session: SESSION_COOKIE,
  challenge: CHALLENGE_COOKIE,
} as const;

export const COOKIE_MAX_AGE = {
  session: SESSION_MAX_AGE_SECONDS,
  challenge: CHALLENGE_MAX_AGE_SECONDS,
} as const;

export const sharedCookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
});
