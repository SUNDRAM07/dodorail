-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "settlement_currency" AS ENUM ('USDC_SOLANA', 'USDG_SOLANA');

-- CreateEnum
CREATE TYPE "private_provider" AS ENUM ('NONE', 'CLOAK', 'UMBRA', 'MAGICBLOCK');

-- CreateEnum
CREATE TYPE "yield_provider" AS ENUM ('NONE', 'LP_AGENT', 'KAMINO');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'EXPIRED', 'VOID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "rail" AS ENUM ('DODO_CARD', 'DODO_UPI', 'SOLANA_USDC', 'SOLANA_USDT', 'SOLANA_USDT0', 'SOLANA_XAUT0', 'IKA_BTC', 'IKA_ETH', 'X402_AGENT');

-- CreateEnum
CREATE TYPE "source_asset" AS ENUM ('USDC', 'USDG', 'USDT', 'USDT0', 'XAUT', 'XAUT0', 'BTC', 'ETH', 'INR_UPI', 'USD_CARD');

-- CreateEnum
CREATE TYPE "treasury_protocol" AS ENUM ('LP_AGENT_METEORA', 'KAMINO_LEND');

-- CreateEnum
CREATE TYPE "treasury_position_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('INVOICE_CREATED', 'PAYMENT_RECEIVED', 'SWEEP_TRIGGERED', 'AGENT_ALERT', 'MERCHANT_ONBOARDED', 'PRIVATE_TRANSFER_SETTLED', 'WEBHOOK_REJECTED', 'WEBHOOK_RECEIVED', 'YIELD_ZAP_IN', 'YIELD_ZAP_OUT', 'COMPLIANCE_EXPORT_GENERATED', 'CLOAK_VIEWING_KEY_REGISTERED');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "solana_wallet_address" TEXT NOT NULL,
    "sns_domain" TEXT,
    "dodo_merchant_id" TEXT,
    "dodo_customer_portal_url" TEXT,
    "settlement_currency" "settlement_currency" NOT NULL DEFAULT 'USDC_SOLANA',
    "private_mode_default" BOOLEAN NOT NULL DEFAULT false,
    "private_provider" "private_provider" NOT NULL DEFAULT 'NONE',
    "cloak_viewing_key" TEXT,
    "cloak_viewing_key_registered_at" TIMESTAMP(3),
    "yield_enabled" BOOLEAN NOT NULL DEFAULT false,
    "yield_threshold_cents" INTEGER NOT NULL DEFAULT 50000,
    "yield_provider" "yield_provider" NOT NULL DEFAULT 'NONE',
    "telegram_chat_id" TEXT,
    "referral_code" TEXT NOT NULL,
    "referred_by_id" TEXT,
    "public_profile_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "amount_usd_cents" INTEGER NOT NULL,
    "currency" "source_asset" NOT NULL DEFAULT 'USDC',
    "description" TEXT,
    "customer_email" TEXT NOT NULL,
    "customer_name" TEXT,
    "status" "invoice_status" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_rails" "rail"[] DEFAULT ARRAY[]::"rail"[],
    "private_mode" BOOLEAN NOT NULL DEFAULT false,
    "private_provider" "private_provider" NOT NULL DEFAULT 'NONE',
    "ika_dwallet_id" TEXT,
    "dodo_product_id" TEXT,
    "dodo_checkout_url" TEXT,
    "dodo_session_id" TEXT,
    "solana_pay_url" TEXT,
    "cloak_note_commitment" TEXT,
    "cloak_deposit_tx_sig" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "rail" "rail" NOT NULL,
    "source_asset" "source_asset" NOT NULL,
    "source_amount" TEXT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "settlement_tx_sig" TEXT,
    "private_tx_proof" TEXT,
    "dodo_payment_id" TEXT,
    "dodo_webhook_id" TEXT,
    "ika_approval_account" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_positions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "protocol" "treasury_protocol" NOT NULL,
    "pool_id" TEXT NOT NULL,
    "deposited_amount" TEXT NOT NULL,
    "current_value" TEXT NOT NULL,
    "pnl_cents" INTEGER NOT NULL DEFAULT 0,
    "apr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "treasury_position_status" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "treasury_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchant_id" TEXT NOT NULL,
    "type" "event_type" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_solana_wallet_address_key" ON "merchants"("solana_wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_dodo_merchant_id_key" ON "merchants"("dodo_merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_referral_code_key" ON "merchants"("referral_code");

-- CreateIndex
CREATE INDEX "merchants_referral_code_idx" ON "merchants"("referral_code");

-- CreateIndex
CREATE INDEX "merchants_sns_domain_idx" ON "merchants"("sns_domain");

-- CreateIndex
CREATE INDEX "invoices_merchant_id_idx" ON "invoices"("merchant_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_settlement_tx_sig_key" ON "payments"("settlement_tx_sig");

-- CreateIndex
CREATE UNIQUE INDEX "payments_dodo_payment_id_key" ON "payments"("dodo_payment_id");

-- CreateIndex
CREATE INDEX "payments_merchant_id_idx" ON "payments"("merchant_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "treasury_positions_merchant_id_idx" ON "treasury_positions"("merchant_id");

-- CreateIndex
CREATE INDEX "treasury_positions_status_idx" ON "treasury_positions"("status");

-- CreateIndex
CREATE INDEX "events_merchant_id_occurred_at_idx" ON "events"("merchant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "events_type_occurred_at_idx" ON "events"("type", "occurred_at");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_positions" ADD CONSTRAINT "treasury_positions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

