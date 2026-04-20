/**
 * DodoRail session primitive — stateless HMAC-signed cookies.
 *
 * Day 2 interim: we run our own minimal session layer so we can ship the
 * wallet-auth flow end-to-end today without the Better-Auth integration risk
 * (API surface re-learn inside a 22-day sprint).
 *
 * Day 3 plan: swap this file out for Better-Auth's session primitives. Every
 * consumer (middleware, server actions, route handlers) imports `getSession`
 * / `setSession` / `clearSession` from here, so the migration is one file.
 *
 * The cookie format is intentionally boring:
 *
 *   <url-safe-base64-payload-json>.<url-safe-base64-hmac-sha256-signature>
 *
 * HMAC key rotation: change `DODORAIL_SESSION_SECRET`, redeploy. Everyone
 * signs out. The secret should be >= 32 bytes of random.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

const SESSION_COOKIE = "dodorail_session";
const CHALLENGE_COOKIE = "dodorail_challenge";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const CHALLENGE_MAX_AGE_SECONDS = 60 * 5; // 5 minutes

export interface SessionPayload {
  /** Merchant.id */
  merchantId: string;
  /** Solana wallet address that signed in — for display, not auth. */
  walletAddress: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expires-at, seconds since epoch. */
  exp: number;
}

export interface ChallengePayload {
  nonce: string;
  walletAddress: string;
  iat: number;
  exp: number;
}

function getSecret(): Buffer {
  const secret = process.env.DODORAIL_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Dev fallback — deterministic so local dev persists sessions across hot-reload.
    // NEVER lands in production because we set the env in Vercel.
    if (process.env.NODE_ENV === "production") {
      throw new Error("DODORAIL_SESSION_SECRET must be set (>=32 bytes) in production.");
    }
    return Buffer.from("dev-secret-do-not-use-in-prod-padding-padding-padding", "utf8");
  }
  return Buffer.from(secret, "utf8");
}

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(str: string): Buffer {
  const pad = str.length % 4 === 0 ? 0 : 4 - (str.length % 4);
  const b64 = str.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(pad);
  return Buffer.from(b64, "base64");
}

function signPayload(payload: Json): string {
  const body = toBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = toBase64Url(createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

function verifyPayload<T extends Json>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getSecret()).update(body).digest();
  const provided = fromBase64Url(sig);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  try {
    return JSON.parse(fromBase64Url(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                               Session helpers                              */
/* -------------------------------------------------------------------------- */

export function buildSessionToken(payload: Omit<SessionPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
  return signPayload(full as unknown as Json);
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const payload = verifyPayload<SessionPayload>(token);
  if (!payload) return null;
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

/* -------------------------------------------------------------------------- */
/*                              Challenge helpers                             */
/* -------------------------------------------------------------------------- */

export function buildChallenge(walletAddress: string): {
  token: string;
  nonce: string;
  message: string;
  expiresAt: string;
} {
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const payload: ChallengePayload = {
    nonce,
    walletAddress,
    iat: now,
    exp: now + CHALLENGE_MAX_AGE_SECONDS,
  };
  const token = signPayload(payload as unknown as Json);
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

export function readChallenge(token: string | undefined): ChallengePayload | null {
  if (!token) return null;
  const payload = verifyPayload<ChallengePayload>(token);
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
