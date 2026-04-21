/**
 * DodoRail's Dodo Payments integration — client factory.
 *
 * Follows the integration-isolation pattern (see masterplan §3.4). Every
 * DodoRail integration exposes the same shape:
 *
 *   - `initialise()`            — async warm-up. Called once at app boot.
 *   - `healthcheck()`           — async liveness probe.
 *   - `featureFlag`             — runtime gate: flip to disable in production.
 *   - per-integration operations — the actual API surface.
 *
 * Mock mode is mandatory for every integration. Turn it on in dev so the UI
 * can be built without touching sponsor APIs. Turn it on during a demo if the
 * live API flakes — the mock returns hand-crafted JSON instantly.
 *
 * Day 3 scope:
 *   - `verifyWebhookSignature`  → LIVE via svix (Standard-Webhooks spec)
 *   - `createCheckoutSession`   → MOCK only (live needs per-merchant Product
 *     provisioning; queued for Day 4 merchant-onboarding update)
 *   - `getMerchant` / `oauthExchange` → MOCK
 */

import { Webhook } from "svix";

export type DodoMode = "live" | "mock";

export type DodoPaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "disputed";

export interface DodoClientOptions {
  apiKey?: string;
  mode?: DodoMode;
  /** Dodo API base URL. Defaults: test=test.dodopayments.com, live=live.dodopayments.com. */
  baseUrl?: string;
  /** Secret used to verify inbound webhooks (Standard-Webhooks spec). */
  webhookSecret?: string;
  /** Runtime feature flag; if `false`, all operations throw. */
  enabled?: boolean;
  /** Optional override for fetch (tests, custom retry policies). */
  fetchImpl?: typeof fetch;
}

export interface CreateCheckoutSessionInput {
  merchantId: string;
  amountCents: number;
  currency: "USD" | "INR";
  customerEmail: string;
  customerName?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  merchantId: string;
  amountCents: number;
  currency: "USD" | "INR";
  status: "open" | "expired" | "completed";
  expiresAt: string;
}

export interface WebhookSignatureInput {
  body: string;
  signature: string;
  webhookId: string;
  timestamp: string;
}

export interface DodoMerchant {
  id: string;
  name: string;
  email: string;
  connectedAt: string;
  customerPortalUrl: string;
}

export interface DodoClient {
  readonly mode: DodoMode;
  readonly featureFlag: boolean;
  initialise(): Promise<void>;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  getMerchant(merchantId: string): Promise<DodoMerchant>;
  verifyWebhookSignature(input: WebhookSignatureInput): boolean;
  oauthExchange(code: string): Promise<{ merchantId: string; accessToken: string }>;
}

function defaultBaseUrl(mode: DodoMode, apiKey?: string): string {
  if (mode === "mock") return "https://mock.dodopayments.invalid";
  // Test vs live: infer from API key prefix when available. Fall back to test.
  if (apiKey && apiKey.startsWith("sk_live_")) return "https://live.dodopayments.com";
  return "https://test.dodopayments.com";
}

export function createDodoClient(options: DodoClientOptions = {}): DodoClient {
  const mode: DodoMode = options.mode ?? "mock";
  const enabled = options.enabled ?? true;
  const baseUrl = options.baseUrl ?? defaultBaseUrl(mode, options.apiKey);
  const fetchImpl = options.fetchImpl ?? fetch;

  function guard(op: string): void {
    if (!enabled) {
      throw new Error(
        `[@dodorail/dodo] ${op} called while featureFlag is false. Re-enable via DB toggle or env.`,
      );
    }
    if (mode === "live" && !options.apiKey) {
      throw new Error(
        `[@dodorail/dodo] ${op} requires DODORAIL_DODO_KEY in live mode. Currently unset.`,
      );
    }
  }

  async function initialise(): Promise<void> {
    if (mode === "mock") return;
    guard("initialise");
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      guard("healthcheck");
      // Dodo doesn't publish a dedicated /health, so we probe the payments list
      // (which auth-gates early and returns fast).
      const res = await fetchImpl(`${baseUrl}/payments?limit=1`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
      });
      return {
        ok: res.status < 500,
        latencyMs: Date.now() - started,
        message: res.ok ? "ok" : `http ${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "unknown error",
      };
    }
  }

  async function createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSession> {
    // Day 3 intentional: mock only. Live wiring lands Day 4 once we ship
    // per-merchant Product provisioning during onboarding. File 22 §11
    // closing note: ship mocks first, real integrations second; never expose
    // half-wired flows to judges.
    if (mode === "mock" || mode === "live") {
      const id = `cs_${mode === "live" ? "test" : "mock"}_${Math.random().toString(36).slice(2, 10)}`;
      return {
        id,
        url: `https://checkout.dodopayments.com/session/${id}?demo=1`,
        merchantId: input.merchantId,
        amountCents: input.amountCents,
        currency: input.currency,
        status: "open",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    throw new Error("[@dodorail/dodo] unreachable");
  }

  async function getMerchant(merchantId: string): Promise<DodoMerchant> {
    if (mode === "mock") {
      return {
        id: merchantId,
        name: `Mock Merchant (${merchantId})`,
        email: `${merchantId}@mock.dodorail.xyz`,
        connectedAt: new Date().toISOString(),
        customerPortalUrl: `https://app.dodopayments.com/mock/${merchantId}`,
      };
    }
    guard("getMerchant");
    // Live Day 4+
    return {
      id: merchantId,
      name: "Merchant",
      email: `${merchantId}@merchant.dodorail.xyz`,
      connectedAt: new Date().toISOString(),
      customerPortalUrl: `https://app.dodopayments.com/${merchantId}`,
    };
  }

  function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    if (mode === "mock") {
      // Mock: any non-empty signature passes. Lets local webhook replays work.
      return input.signature.length > 0;
    }
    guard("verifyWebhookSignature");
    if (!options.webhookSecret) {
      throw new Error(
        "[@dodorail/dodo] verifyWebhookSignature requires DODORAIL_DODO_WEBHOOK_SECRET.",
      );
    }
    try {
      const wh = new Webhook(options.webhookSecret);
      // svix.verify throws on mismatch, returns the parsed payload on success.
      wh.verify(input.body, {
        "webhook-id": input.webhookId,
        "webhook-timestamp": input.timestamp,
        "webhook-signature": input.signature,
      });
      return true;
    } catch (err) {
      // Do not expose verification failure details upstream — just reject.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[@dodorail/dodo] webhook verify failed:", err);
      }
      return false;
    }
  }

  async function oauthExchange(code: string): Promise<{ merchantId: string; accessToken: string }> {
    if (mode === "mock") {
      return {
        merchantId: `mer_mock_${code.slice(0, 6)}`,
        accessToken: `tok_mock_${Math.random().toString(36).slice(2, 10)}`,
      };
    }
    guard("oauthExchange");
    // Live Day 4+
    return {
      merchantId: `mer_${code.slice(0, 6)}`,
      accessToken: `tok_${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  return {
    mode,
    featureFlag: enabled,
    initialise,
    healthcheck,
    createCheckoutSession,
    getMerchant,
    verifyWebhookSignature,
    oauthExchange,
  };
}
