import { ShieldCheck, FileDown, Eye } from "lucide-react";
import Link from "next/link";

import { prisma } from "@dodorail/db";
import { getSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { CloakComplianceExportButton } from "./cloak-export-button";

export default async function SettingsPage() {
  const s = await getSession();
  if (!s) return null;

  // Pull merchant freshly to read viewing-key state — session payload may be
  // cached from sign-in and miss the post-registration value.
  const merchant = await prisma.merchant.findUnique({
    where: { id: s.merchant.id },
    select: {
      id: true,
      slug: true,
      privateProvider: true,
      privateModeDefault: true,
      cloakViewingKey: true,
      cloakViewingKeyRegisteredAt: true,
    },
  });
  if (!merchant) return null;

  const cloakRegistered = !!merchant.cloakViewingKey;
  const provider = merchant.privateProvider;

  return (
    <div className="container py-10">
      <div className="mb-8">
        <Badge variant="burnt" className="mb-2 font-mono text-[10px] uppercase tracking-widest">
          merchant settings
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy &amp; Compliance</h1>
        <p className="mt-1 text-muted-foreground">
          Configure your privacy stack and export auditor-friendly transaction reports.
        </p>
      </div>

      {/* Privacy stack status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-burnt" /> Privacy stack
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-line bg-background/60 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                provider
              </p>
              <p className="mt-1 text-sm">
                {provider === "NONE" ? (
                  <span className="text-muted-foreground">Not configured</span>
                ) : (
                  <span className="font-medium">{provider}</span>
                )}
              </p>
            </div>
            <div className="rounded-md border border-line bg-background/60 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                private mode default
              </p>
              <p className="mt-1 text-sm">
                {merchant.privateModeDefault ? (
                  <span className="text-emerald-400">On — every new invoice is private</span>
                ) : (
                  <span className="text-muted-foreground">Off — opt-in per invoice</span>
                )}
              </p>
            </div>
          </div>

          <Separator />

          <div className="rounded-md border border-line bg-background/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="size-4 text-burnt" /> Cloak viewing key
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {cloakRegistered ? (
                    <>
                      Registered{" "}
                      {merchant.cloakViewingKeyRegisteredAt
                        ? new Date(merchant.cloakViewingKeyRegisteredAt).toLocaleString()
                        : "(timestamp missing)"}
                      . Used to decrypt your shielded payment history for audits.
                    </>
                  ) : (
                    <>
                      Not registered yet. The Cloak SDK will prompt a wallet signature
                      when you toggle Private Mode on your first invoice.
                    </>
                  )}
                </p>
              </div>
              <Badge variant={cloakRegistered ? "shipped" : "outline"}>
                {cloakRegistered ? "REGISTERED" : "PENDING"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance export */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="size-4 text-burnt" /> Compliance export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generate an auditor-friendly CSV of all your Cloak shielded payments. The chain
            stays opaque to the public; this CSV is the read-only window for your accountant
            or auditor.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            powered by Cloak SDK · toComplianceReport + formatComplianceCsv
          </p>

          <CloakComplianceExportButton
            merchantId={merchant.id}
            disabled={!cloakRegistered}
          />

          {!cloakRegistered && (
            <p className="text-xs text-muted-foreground">
              You'll be able to export once your viewing key is registered (happens
              automatically on your first private invoice).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Footer link back */}
      <div className="mt-10">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-burnt"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
