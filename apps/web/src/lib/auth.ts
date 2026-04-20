/**
 * Server-side auth helpers that consume the session cookie.
 *
 * Import `getSession()` from server components, route handlers, and server
 * actions to read the authenticated merchant. Returns null if unauthenticated.
 */

import { cookies } from "next/headers";
import { prisma, type Merchant } from "@dodorail/db";

import { COOKIE_NAMES, readSessionToken, type SessionPayload } from "./session";

export type AuthSession = {
  session: SessionPayload;
  merchant: Merchant;
};

/**
 * Read the current session from the request cookies.
 * Returns null if no session, invalid session, or merchant not found.
 */
export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAMES.session)?.value;
  const session = readSessionToken(token);
  if (!session) return null;

  const merchant = await prisma.merchant.findUnique({
    where: { id: session.merchantId },
  });
  if (!merchant) return null;

  return { session, merchant };
}

/** Require a session — redirect on server side if absent. Use in route handlers / server actions. */
export async function requireSession(): Promise<AuthSession> {
  const s = await getSession();
  if (!s) {
    throw new Error("UNAUTHENTICATED");
  }
  return s;
}
