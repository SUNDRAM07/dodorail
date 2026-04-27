import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@dodorail/db";
import { createCloakClient } from "@dodorail/cloak";
import { requireSession } from "@/lib/auth";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/compliance/cloak
 *
 * Generates an auditor-friendly CSV of the merchant's shielded Cloak
 * transactions. Hot path:
 *
 *   1. Authenticate the caller (must be the merchant whose data is
 *      requested — cross-merchant access would be a privacy hole).
 *   2. Build a Cloak client; mock mode if no real test wallet has been
 *      funded yet, live mode once it has.
 *   3. Call client.exportComplianceCsv() — which inside uses the SDK's
 *      toComplianceReport + formatComplianceCsv helpers. We don't roll our
 *      own CSV generation: the SDK's compliance shape is what auditors
 *      using other Cloak-integrated products will recognise.
 *   4. Stream the CSV back with a sensible filename.
 *
 * Why this matters in the submission essay: most privacy-on-Solana products
 * ship the privacy half but not the audit half. DodoRail ships both because
 * Indian SaaS founders selling globally need GST + tax filings, and an
 * "infinite-privacy, no-audit" stack is unusable in that context.
 */

const BodySchema = z.object({
  merchantId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  // 1. Auth.
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 2. Parse body — `merchantId` is optional; if present, must match session.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }
  const requestedMerchantId = parsed.data.merchantId;
  if (requestedMerchantId && requestedMerchantId !== session.merchant.id) {
    // Hard refusal — never let a session export another merchant's CSV.
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 3. Look up the merchant for wallet + viewing-key state.
  const merchant = await prisma.merchant.findUnique({
    where: { id: session.merchant.id },
    select: {
      id: true,
      slug: true,
      solanaWalletAddress: true,
      cloakViewingKey: true,
      cloakViewingKeyRegisteredAt: true,
    },
  });
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  // 4. Build the client.
  //
  // Live mode requires (a) a Cloak-supported network in env (currently
  // mainnet only) AND (b) the merchant has registered a viewing key.
  // Otherwise we fall back to mock mode — the merchant still gets a
  // realistic-looking CSV download for previewing the auditor flow.
  const network = (process.env.DODORAIL_CLOAK_NETWORK ?? "mainnet") as
    | "mainnet"
    | "devnet"
    | "localnet"
    | "testnet";
  const liveModeReady = !!merchant.cloakViewingKey && network === "mainnet";

  const cloak = createCloakClient({
    mode: liveModeReady ? "live" : "mock",
    network,
    relayUrl: process.env.DODORAIL_CLOAK_RELAY_URL,
  });

  // 5. Generate.
  let csv: string;
  try {
    csv = await cloak.exportComplianceCsv({
      walletPublicKey: merchant.solanaWalletAddress,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "export_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  // 6. Audit the export — append-only Event log, plus Posthog. We do NOT
  // log the CSV contents — only that an export happened.
  await prisma.event
    .create({
      data: {
        merchantId: merchant.id,
        type: "COMPLIANCE_EXPORT_GENERATED",
        payload: {
          mode: cloak.mode,
          network: cloak.network,
          rowCount: csv.split("\n").filter(Boolean).length - 1, // minus header
          ts: new Date().toISOString(),
        },
      },
    })
    .catch(() => void 0);
  track("compliance_export_generated", merchant.id, {
    mode: cloak.mode,
    network: cloak.network,
  });

  // 7. Stream back.
  const filename = `dodorail-cloak-compliance-${merchant.slug}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-cloak-export-mode": cloak.mode,
    },
  });
}
