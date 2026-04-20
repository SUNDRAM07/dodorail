import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAMES, readSessionToken } from "@/lib/session";

const PROTECTED_PATHS = ["/dashboard"];
const AUTH_PATHS = ["/sign-in"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAMES.session)?.value;
  const session = await readSessionToken(token);

  // Gate /dashboard/* behind sign-in.
  if (PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!session) {
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("next", pathname);
      return NextResponse.redirect(signIn);
    }
  }

  // If already signed in, bounce away from /sign-in.
  if (AUTH_PATHS.includes(pathname) && session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/sign-in"],
};
