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
import { identify, track } from "@/lib/analytics";

// SNS reverse-lookup was moved OUT of this path on Day 3 evening: the
// @bonfida/spl-name-service module has cold-start behaviour on Vercel
// serverless that was occasionally 500-ing the verify endpoint. We'll
// re-enable it as a deferred enrichment job on Day 4 (triggered out-of-band
// via Inngest or a fire-and-forget fetch). For now Merchant.snsDomain stays
// null on creation; the display falls back to the synthetic `{slug}.dodorail.sol`.

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
  try {
    return await handler(req);
  } catch (err) {
    // TEMP Day 3 debug: surface error detail to the client so we can diagnose
    // the 500 from Sundaram's browser. Remove once the root cause is pinned.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    // eslint-disable-next-line no-console
    console.error("[auth/verify] unhandled:", err);
    return NextResponse.json({ error: "server_error", detail }, { status: 500 });
  }
}

async function handler(req: Request): Promise<NextResponse> {
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
  const challenge = await readChallenge(cookieStore.get(COOKIE_NAMES.challenge)?.value);
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
  let merchant;
  try {
    merchant = await prisma.merchant.upsert({
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
  } catch (err) {
    // Slug / email uniqueness collision on a second wallet-derived slug.
    // Fall back to a longer slug suffix.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[auth/verify] merchant upsert first attempt failed:", err);
    }
    const uniqueSlug = `${slug}-${walletAddress.slice(-4).toLowerCase()}`;
    merchant = await prisma.merchant.upsert({
      where: { solanaWalletAddress: walletAddress },
      update: {},
      create: {
        solanaWalletAddress: walletAddress,
        email: `${uniqueSlug}@wallet.dodorail.xyz`,
        name: `Merchant ${uniqueSlug}`,
        slug: uniqueSlug,
        referralCode: referralCodeFromWallet(walletAddress),
      },
    });
  }

  // 5. Issue session cookie + clear the now-used challenge.
  const sessionToken = await buildSessionToken({
    merchantId: merchant.id,
    walletAddress,
  });

  // 6. Fire analytics: identify merchant + sign_in_completed.
  identify(merchant.id, {
    slug: merchant.slug,
    walletAddress,
    referralCode: merchant.referralCode,
    snsDomain: merchant.snsDomain,
  });
  track("sign_in_completed", merchant.id, {
    walletAddress,
    slug: merchant.slug,
    wasNewMerchant: merchant.createdAt.getTime() > Date.now() - 5000, // created in last 5s
  });
  // Kick off SNS enrichment in the background — Day 4 Phase 5.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dodorail.vercel.app";
  fetch(`${appUrl}/api/enrich/sns/${merchant.id}`, {
    method: "POST",
    headers: { "x-dodorail-enrich-token": process.env.DODORAIL_SESSION_SECRET ?? "" },
  }).catch(() => void 0); // fire-and-forget
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
