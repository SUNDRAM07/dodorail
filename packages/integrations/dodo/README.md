# @dodorail/dodo

Dodo Payments integration package — the Merchant-of-Record rail for card + UPI.

**Status:** Day 1 scaffold shipped · Live mode Day 4-5.

## Why this is load-bearing

Indian founders selling globally need a card rail (Stripe equivalent) and a UPI rail (Razorpay equivalent), *and* they need the legal simplicity of a Merchant-of-Record handling global tax. Dodo Payments is the only provider covering all three.

DodoRail wraps Dodo with a thin client that slots into the shared integration shape (factory + `initialise()` + `healthcheck()` + `featureFlag` + mock mode). Everything else in the merchant dashboard stays decoupled from Dodo's specific API surface.

## Usage

```ts
import { createDodoClient } from "@dodorail/dodo";

const dodo = createDodoClient({
  apiKey: process.env.DODORAIL_DODO_KEY!,
  mode: "live", // or "mock" for local dev
});

await dodo.initialise();

const session = await dodo.createCheckoutSession({
  merchantId: "mer_xxx",
  amountCents: 4900,
  currency: "USD",
  customerEmail: "buyer@example.com",
});
// session.url is the Dodo-hosted checkout URL
```

## Mock mode

All operations work against hand-crafted JSON without network calls. Flip `mode: "mock"` (or set `DODORAIL_DODO_MODE=mock` env) and the integration stays fully functional for UI development.

## Never skip

Webhook signature verification is mandatory per Dodo's Standard-Webhooks spec compliance. `verifyWebhookSignature()` throws on failure. Do not catch-and-continue — reject the webhook with HTTP 401 and move on.

## Research

See `/mnt/FRONTIER/01_Frontier-Dodo-Payments-Track_Master-Research.docx` and `/mnt/FRONTIER/02_Dodo-Payments_Technical-Reference.docx` for API endpoints, SDK names, and webhook shapes.

## License

MIT — see `/LICENSE`.
