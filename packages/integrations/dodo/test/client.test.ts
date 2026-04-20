import { describe, it, expect } from "vitest";
import { createDodoClient } from "../src/index";

describe("@dodorail/dodo (mock mode)", () => {
  it("defaults to mock mode when no options passed", () => {
    const dodo = createDodoClient();
    expect(dodo.mode).toBe("mock");
    expect(dodo.featureFlag).toBe(true);
  });

  it("healthcheck returns ok in mock mode without network", async () => {
    const dodo = createDodoClient({ mode: "mock" });
    const result = await dodo.healthcheck();
    expect(result.ok).toBe(true);
    expect(result.message).toBe("mock mode");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("createCheckoutSession returns a plausible session shape", async () => {
    const dodo = createDodoClient({ mode: "mock" });
    const session = await dodo.createCheckoutSession({
      merchantId: "mer_abc",
      amountCents: 4900,
      currency: "USD",
      customerEmail: "buyer@example.com",
      description: "Acme Pro",
    });
    expect(session.id).toMatch(/^cs_mock_/);
    expect(session.url).toContain(session.id);
    expect(session.amountCents).toBe(4900);
    expect(session.currency).toBe("USD");
    expect(session.status).toBe("open");
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("getMerchant returns a deterministic mock shape", async () => {
    const dodo = createDodoClient({ mode: "mock" });
    const merchant = await dodo.getMerchant("mer_xyz");
    expect(merchant.id).toBe("mer_xyz");
    expect(merchant.email).toContain("mer_xyz");
  });

  it("verifyWebhookSignature accepts any non-empty signature in mock mode", () => {
    const dodo = createDodoClient({ mode: "mock" });
    expect(
      dodo.verifyWebhookSignature({
        body: `{"event":"payment.succeeded"}`,
        signature: "sig_mock_123",
        webhookId: "whk_mock_456",
        timestamp: String(Math.floor(Date.now() / 1000)),
      }),
    ).toBe(true);
    expect(
      dodo.verifyWebhookSignature({
        body: "{}",
        signature: "",
        webhookId: "whk_empty",
        timestamp: "0",
      }),
    ).toBe(false);
  });

  it("oauthExchange returns a merchant id derived from the code", async () => {
    const dodo = createDodoClient({ mode: "mock" });
    const result = await dodo.oauthExchange("auth_code_abc123");
    expect(result.merchantId).toContain("mer_mock_");
    expect(result.accessToken).toMatch(/^tok_mock_/);
  });

  it("throws in live mode without an API key", async () => {
    const dodo = createDodoClient({ mode: "live" });
    await expect(
      dodo.createCheckoutSession({
        merchantId: "mer_abc",
        amountCents: 100,
        currency: "USD",
        customerEmail: "x@x.com",
      }),
    ).rejects.toThrow(/DODORAIL_DODO_KEY/);
  });

  it("throws when featureFlag is disabled, even in mock mode with API key", async () => {
    const dodo = createDodoClient({ mode: "live", apiKey: "key_live_xxx", enabled: false });
    await expect(dodo.getMerchant("mer_abc")).rejects.toThrow(/featureFlag is false/);
  });
});
