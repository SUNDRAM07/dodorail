/**
 * Server-side analytics helpers backed by posthog-node.
 *
 * Fire-and-forget event capture from route handlers and server actions. We
 * keep a module-level singleton client (created lazily) and intentionally do
 * NOT await `.shutdown()` — on Vercel serverless the function terminates
 * right after, so pending events get flushed at cold-start anyway.
 *
 * If no POSTHOG key is set (e.g. local dev without .env) all calls are
 * no-ops. Never throw from this module — analytics must never break auth or
 * checkout.
 */

import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (!key) {
    client = null;
    return null;
  }
  client = new PostHog(key, {
    host,
    // Flush immediately for serverless — we can't batch across invocations.
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export type AnalyticsEvent =
  | "sign_in_started"
  | "sign_in_completed"
  | "invoice_created"
  | "invoice_viewed"
  | "checkout_viewed"
  | "dodo_checkout_redirected"
  | "payment_confirmed"
  | "payment_failed"
  | "webhook_received"
  | "webhook_rejected"
  | "compliance_export_generated"
  | "cloak_viewing_key_registered"
  // Day 11 — Treasury Vault / LP Agent yield lifecycle.
  | "yield_zap_in"
  | "yield_zap_out";

export function track(
  event: AnalyticsEvent,
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.capture({
      event,
      distinctId,
      properties: {
        ...properties,
        service: "dodorail-web",
        build: process.env.NEXT_PUBLIC_BUILD_VERSION ?? "0.1.0",
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      },
    });
    // Fire-and-forget flush. Never await.
    void ph.flush().catch(() => void 0);
  } catch {
    // Analytics never throws upstream.
  }
}

/** Associate a server-generated distinctId with a merchant identity. */
export function identify(
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.identify({ distinctId, properties });
    void ph.flush().catch(() => void 0);
  } catch {
    // Silent
  }
}
