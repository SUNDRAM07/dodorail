/**
 * DodoRail's Dodo Payments integration — client factory.
 *
 * Follows the integration-isolation pattern (see masterplan §3.4). Every
 * DodoRail integration exposes the same shape:
 *
 *   - `initialise()`            — async warm-up. Called once at app boot.
 *   - `healthcheck()`           — async liveness probe (hit `/api/health`).
 *   - `featureFlag`             — runtime gate: flip to disable in production.
 *   - per-integration operations — the actual API surface.
 *
 * Mock mode is mandatory for every integration. Turn it on in dev so the UI
 * can be built without touching sponsor APIs. Turn it on during a demo if the
 * live API flakes — the mock returns hand-crafted JSON instantly.
 */

export type DodoMode = "live" | "mock";

export type DodoPaymentStatus = "pending" | "succeeded" | "failed" | "refunded" | "disputed";

export interface DodoClientOptions {
  /** Dodo API key. Required in live mode; ignored in mock mode. */
  apiKey?: string;
  /** Switch between live and mock. Defaults to mock. */
  mode?: DodoMode;
  /** Dodo base URL. Defaults to production; override for sandbox. */
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
  /** Optional redirect target after successful checkout. */
  successUrl?: string;
  /** Optional redirect target on cancel. */
  cancelUrl?: string;
  /** Opaque reference id we can reconcile in our Payment table. */
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
  /** The raw request body — do NOT parse before verifying. */
  body: string;
  /** Signature header value (`webhook-signature`). */
  signature: string;
  /** Delivery id header (`webhook-id`). */
  webhookId: string;
  /** Delivery timestamp header (`webhook-timestamp`, Unix seconds as string). */
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

const DEFAULT_BASE_URL = "https://api.dodopayments.com";

/**
 * Creates a Dodo client. Default mode is `mock` so consumers that forget to
 * pass an API key never silently hit production.
 */
export function createDodoClient(options: DodoClientOptions = {}): DodoClient {
  const mode: DodoMode = options.mode ?? "mock";
  const enabled = options.enabled ?? true;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
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
    // Placeholder for warm-up ping. Real impl lands Day 4.
  }

  async function healthcheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    const started = Date.now();
    if (mode === "mock") {
      return { ok: true, latencyMs: Date.now() - started, message: "mock mode" };
    }
    try {
      guard("healthcheck");
      const res = await fetchImpl(`${baseUrl}/v1/health`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      return { ok: res.ok, latencyMs: Date.now() - started };
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
    if (mode === "mock") {
      const id = `cs_mock_${Math.random().toString(36).slice(2, 10)}`;
      return {
        id,
        url: `https://checkout.dodopayments.com/mock/${id}`,
        merchantId: input.merchantId,
        amountCents: input.amountCents,
        currency: input.currency,
        status: "open",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    guard("createCheckoutSession");
    // Real implementation Day 4-5 once the API key is provisioned.
    throw new Error("[@dodorail/dodo] live createCheckoutSession — implement Day 4-5.");
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
    throw new Error("[@dodorail/dodo] live getMerchant — implement Day 4-5.");
  }

  function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
    if (mode === "mock") {
      // Mock always returns true IF the signature string is non-empty.
      // This lets local Dodo webhook replays work without a real secret.
      return input.signature.length > 0;
    }
    guard("verifyWebhookSignature");
    if (!options.webhookSecret) {
      throw new Error(
        "[@dodorail/dodo] verifyWebhookSignature requires DODORAIL_DODO_WEBHOOK_SECRET.",
      );
    }
    // Standard-Webhooks spec verification lands Day 4.
    throw new Error("[@dodorail/dodo] live verifyWebhookSignature — implement Day 4.");
  }

  async function oauthExchange(code: string): Promise<{ merchantId: string; accessToken: string }> {
    if (mode === "mock") {
      return {
        merchantId: `mer_mock_${code.slice(0, 6)}`,
        accessToken: `tok_mock_${Math.random().toString(36).slice(2, 10)}`,
      };
    }
    guard("oauthExchange");
    throw new Error("[@dodorail/dodo] live oauthExchange — implement Day 4-5.");
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
