import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import {
  buildSessionToken,
  COOKIE_MAX_AGE,
  COOKIE_NAMES,
  readChallenge,
  sharedCookieOpts,
} from "@/lib/session";
import { referralCodeFromWallet, slugFromWallet, verifySolanaSignature } from "@/lib/solana";

export const runtime = "nodejs";

const BodySchema = z.object({
  message: z.string().min(20),
  signature: z.string().min(64), // base58-encoded 64-byte sig
  walletAddress: z.string().min(32).max(48),
});

/**
 * POST /api/auth/solana/verify
 *
 * Receives the signed message, verifies it against the challenge cookie and
 * Ed25519 signature, then upserts a Merchant row and issues a session cookie.
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
  const { message, signature, walletAddress } = parsed.data;

  // 1. Retrieve the challenge cookie we issued earlier.
  const cookieStore = await cookies();
  const challenge = readChallenge(cookieStore.get(COOKIE_NAMES.challenge)?.value);
  if (!challenge) {
    return NextResponse.json(
      { error: "challenge_missing_or_expired" },
      { status: 401 },
    );
  }

  // 2. The message the client signed must match what we issued.
  //    Check the wallet pubkey embedded in the message and the nonce.
  if (challenge.walletAddress !== walletAddress) {
    return NextResponse.json({ error: "wallet_mismatch" }, { status: 401 });
  }
  if (!message.includes(`Wallet: ${walletAddress}`) || !message.includes(`Nonce: ${challenge.nonce}`)) {
    return NextResponse.json({ error: "message_tampered" }, { status: 401 });
  }

  // 3. Cryptographic verification.
  if (!verifySolanaSignature(message, signature, walletAddress)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  // 4. Upsert Merchant. On first sign-in we seed sensible defaults; on return
  //    sign-in we keep whatever they've configured.
  const slug = slugFromWallet(walletAddress);
  const merchant = await prisma.merchant.upsert({
    where: { solanaWalletAddress: walletAddress },
    update: {},
    create: {
      solanaWalletAddress: walletAddress,
      email: `${slug}@wallet.dodorail.xyz`,
      name: `Merchant ${slug}`,
      slug,
      referralCode: referralCodeFromWallet(walletAddress),
    },
  });

  // 5. Issue session cookie + clear the now-used challenge.
  const sessionToken = buildSessionToken({
    merchantId: merchant.id,
    walletAddress,
  });
  const res = NextResponse.json({
    merchant: {
      id: merchant.id,
      slug: merchant.slug,
      email: merchant.email,
      name: merchant.name,
      snsDomain: merchant.snsDomain,
      solanaWalletAddress: merchant.solanaWalletAddress,
    },
  });
  res.cookies.set(COOKIE_NAMES.session, sessionToken, {
    ...sharedCookieOpts(),
    maxAge: COOKIE_MAX_AGE.session,
  });
  res.cookies.set(COOKIE_NAMES.challenge, "", {
    ...sharedCookieOpts(),
    maxAge: 0,
  });
  return res;
}
