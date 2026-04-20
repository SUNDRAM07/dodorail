import { NextResponse } from "next/server";

import { COOKIE_NAMES, sharedCookieOpts } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAMES.session, "", { ...sharedCookieOpts(), maxAge: 0 });
  res.cookies.set(COOKIE_NAMES.challenge, "", { ...sharedCookieOpts(), maxAge: 0 });
  return res;
}
