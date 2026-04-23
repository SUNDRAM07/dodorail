/**
 * Next 15 auto-loads this file on the client. All Sentry browser init lives
 * here. Client-side Posthog is loaded via a separate React provider since it
 * needs to react to the router.
 */

import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_GIT_SHA || process.env.NEXT_PUBLIC_BUILD_VERSION,
    tracesSampleRate: 0.1,
    // Replay kept OFF on the client — Posthog session replay covers this use
    // case and ships with our Posthog quota, avoiding double recording.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// `captureRouterTransitionStart` lives in @sentry/nextjs v9+; our v8.x pin
// doesn't ship it. Pageview tracking comes from Posthog anyway.
