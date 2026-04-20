/**
 * @dodorail/dodo — public surface.
 *
 * Exports the factory, the client type, and helper types. Nothing else leaks.
 */

export { createDodoClient } from "./client";
export type {
  DodoClient,
  DodoClientOptions,
  DodoMode,
  CreateCheckoutSessionInput,
  CheckoutSession,
  WebhookSignatureInput,
  DodoMerchant,
  DodoPaymentStatus,
} from "./client";
