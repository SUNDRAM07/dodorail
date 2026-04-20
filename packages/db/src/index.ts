/**
 * @dodorail/db — Prisma client + re-exported types for the DodoRail data layer.
 *
 * This package owns the schema. Other packages import the Prisma client and
 * types from here. Do not import @prisma/client directly anywhere else in the
 * monorepo — always go through this package so we have a single swap-point if
 * we ever migrate ORMs.
 */

export * from "./client";
export type {
  Merchant,
  Invoice,
  Payment,
  TreasuryPosition,
  Event,
  Prisma,
  InvoiceStatus,
  PaymentStatus,
  Rail,
  SourceAsset,
  PrivateProvider,
  YieldProvider,
  EventType,
  SettlementCurrency,
} from "@prisma/client";
