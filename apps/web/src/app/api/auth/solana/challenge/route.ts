import { NextResponse } from "next/server";
import { z } from "zod";

import { buildChallenge, COOKIE_MAX_AGE, COOKIE_NAMES, sharedCookieOpts } from "@/lib/session";

export const runtime = "nodejs"; // we use Node's crypto; avoid Edge

const BodySchema = z.object({
  walletAddress: z.string().min(32).max(48),
});

/**
 * POST /api/auth/solana/challenge
 *
 * Issues a nonce + message for the given wallet to sign. Sets an HMAC-signed
 * `dodorail_challenge` cookie so we can later verify the nonce was issued by
 * us. Stateless: no DB writes.
 *
 * Response:
 *   { message: string, expiresAt: ISO8601 }
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });
  }
  const { walletAddress } = parsed.data;

  const { token, message, expiresAt } = buildChallenge(walletAddress);

  const res = NextResponse.json({ message, expiresAt });
  res.cookies.set(COOKIE_NAMES.challenge, token, {
    ...sharedCookieOpts(),
    maxAge: COOKIE_MAX_AGE.challenge,
  });
  return res;
}
