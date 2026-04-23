/**
 * Next.js instrumentation — runs once per runtime (Node.js serverless, Edge).
 * This is where Sentry gets initialised on the server side. Client-side init
 * lives in `instrumentation-client.ts` (auto-loaded by Next 15).
 *
 * We only initialise Sentry if a DSN is present; missing DSN means "silent
 * no-op" which is exactly what we want in local dev without SENTRY_DSN set.
 */

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.NEXT_PUBLIC_GIT_SHA || process.env.NEXT_PUBLIC_BUILD_VERSION,
      tracesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === "production",
      // Noisy prisma errors are surfaced with our own wrappers; let Sentry see
      // them but keep logs readable.
      beforeSend(event) {
        if (event.message?.includes("PrismaClientInitializationError")) {
          event.fingerprint = ["prisma-init"];
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.05,
      enabled: process.env.NODE_ENV === "production",
    });
  }
}

/** Capture and surface request-level errors from route handlers. */
export const onRequestError = async (
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
) => {
  if (!process.env.SENTRY_DSN || process.env.NODE_ENV !== "production") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request as never, {
    routerKind: "App Router",
    routePath: request.path,
    routeType: "route",
  } as never);
};
