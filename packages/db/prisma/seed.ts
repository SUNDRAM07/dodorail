/**
 * DodoRail — DB seed script.
 *
 * Creates one demo merchant (acme.dodorail.sol) so the merchant dashboard
 * has something to render in Phase 6-7 verification and all throughout
 * local dev. Runs idempotently via upsert on slug.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const referralCode = `acme-${randomUUID().slice(0, 8)}`;

  const merchant = await prisma.merchant.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      email: "founder@acme.example",
      name: "Acme",
      slug: "acme",
      solanaWalletAddress: "AcmeWa11etMockAddressForDemoOn1y000000000000",
      snsDomain: "acme.dodorail.sol",
      referralCode,
      publicProfileEnabled: true,
      settlementCurrency: "USDC_SOLANA",
      privateProvider: "NONE",
      yieldProvider: "NONE",
    },
  });

  console.log("✓ Seeded merchant:", { id: merchant.id, slug: merchant.slug });

  // Seed an OPEN invoice to demo the dashboard empty-state-is-not-actually-empty.
  const existing = await prisma.invoice.findFirst({
    where: { merchantId: merchant.id, amountUsdCents: 4900 },
  });

  if (!existing) {
    const invoice = await prisma.invoice.create({
      data: {
        merchantId: merchant.id,
        amountUsdCents: 4900,
        customerEmail: "demo-buyer@example.com",
        customerName: "Demo Buyer",
        description: "Acme Pro — monthly subscription",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        acceptedRails: ["DODO_CARD", "DODO_UPI", "SOLANA_USDC", "X402_AGENT"],
      },
    });
    console.log("✓ Seeded invoice:", { id: invoice.id, amount: invoice.amountUsdCents });

    await prisma.event.create({
      data: {
        merchantId: merchant.id,
        type: "MERCHANT_ONBOARDED",
        payload: { source: "seed", day: 1 },
      },
    });
    console.log("✓ Seeded event: MERCHANT_ONBOARDED");
  } else {
    console.log("• Invoice already exists, skipping");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
