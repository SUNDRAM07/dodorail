"use client";

import { useState } from "react";
import { Loader2, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  merchantId: string;
  disabled?: boolean;
}

/**
 * Cloak compliance CSV export — client component.
 *
 * Hits POST /api/compliance/cloak which uses the @dodorail/cloak wrapper's
 * exportComplianceCsv() (which in turn uses the SDK's toComplianceReport +
 * formatComplianceCsv helpers). Streams the CSV back as a Blob and triggers
 * a browser download.
 *
 * Mock-mode behaviour: returns a small fixture CSV with 5-8 deterministic
 * rows so merchant settings looks alive even before any real shielded
 * transactions exist.
 */
export function CloakComplianceExportButton({ merchantId, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/compliance/cloak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchantId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dodorail-cloak-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={onClick} disabled={disabled || busy}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Exporting…
          </>
        ) : (
          <>
            <Download className="size-4" /> Export audit CSV
          </>
        )}
      </Button>
      {err && (
        <p className="text-xs text-destructive">{err}</p>
      )}
    </div>
  );
}
