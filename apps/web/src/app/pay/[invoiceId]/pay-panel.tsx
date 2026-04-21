"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { CheckCircle2, Copy, ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Rail = {
  id: string;
  label: string;
  description: string;
  feeBps: number;
};

interface SolanaPayInfo {
  url: string;
  reference: string | null;
  recipient: string;
}

interface StatusResponse {
  status: "DRAFT" | "OPEN" | "PAID" | "EXPIRED" | "VOID" | "DISPUTED";
  rail?: string | null;
  txSig?: string | null;
}

export function PayPanel({
  invoiceId,
  rails,
  amountCents,
}: {
  invoiceId: string;
  rails: readonly Rail[];
  amountCents: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(() => rails[0]?.id ?? "SOLANA_USDC");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [solanaPay, setSolanaPay] = useState<SolanaPayInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [latestStatus, setLatestStatus] = useState<StatusResponse | null>(null);

  // Fetch the Solana Pay URL once when the SOLANA_USDC rail is selected.
  useEffect(() => {
    if (selected !== "SOLANA_USDC") {
      setQrDataUrl(null);
      return;
    }
    if (solanaPay) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/solana-pay`);
        if (!res.ok) throw new Error(`solana-pay fetch failed: ${res.status}`);
        const json = (await res.json()) as SolanaPayInfo;
        if (!cancelled) setSolanaPay(json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load Solana Pay details.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, selected, solanaPay]);

  // Render the QR code as a data URL once we have the URL.
  useEffect(() => {
    if (!solanaPay?.url) return;
    let cancelled = false;
    QRCode.toDataURL(solanaPay.url, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
      color: { dark: "#FAFAFA", light: "#1A1A1A" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "QR render failed");
      });
    return () => {
      cancelled = true;
    };
  }, [solanaPay]);

  // Poll for status while the user is on this page and not yet paid.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setLatestStatus(json);
        if (json.status === "PAID") {
          if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
          setState("done");
          setTimeout(() => router.refresh(), 900);
        }
      } catch {
        // swallow — keep polling
      }
    };
    void poll(); // immediate first hit
    pollTimer.current = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [invoiceId, router]);

  // Fallback "simulate via mock webhook" for rails other than SOLANA_USDC.
  const simulateMock = useCallback(() => {
    startTransition(async () => {
      setState("processing");
      setError(null);
      try {
        const res = await fetch("/api/webhooks/dodo", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "webhook-signature": "mock_sig_for_day2",
            "webhook-id": `mock_${invoiceId}_${Date.now()}`,
            "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
          },
          body: JSON.stringify({
            type: "payment.succeeded",
            data: {
              invoiceId,
              rail: selected,
              sourceAsset:
                selected === "DODO_UPI"
                  ? "INR_UPI"
                  : selected === "DODO_CARD"
                    ? "USD_CARD"
                    : "USDC",
              amountCents,
              mock: true,
            },
          }),
        });
        if (!res.ok) throw new Error(`webhook returned ${res.status}`);
        setState("done");
        setTimeout(() => router.refresh(), 900);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        setState("error");
      }
    });
  }, [amountCents, invoiceId, router, selected]);

  const copyUrl = useCallback(async () => {
    if (!solanaPay?.url) return;
    await navigator.clipboard.writeText(solanaPay.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  }, [solanaPay]);

  const solflareDeepLink = useMemo(() => {
    if (!solanaPay?.url) return null;
    return `https://solflare.com/ul/v1/browse/${encodeURIComponent(solanaPay.url)}?ref=${encodeURIComponent(
      typeof window !== "undefined" ? window.location.origin : "https://dodorail.vercel.app",
    )}`;
  }, [solanaPay]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick a payment rail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rails.map((r) => (
            <label
              key={r.id}
              className="flex items-start gap-3 rounded-md border border-line p-3 cursor-pointer hover:border-burnt/60 has-[:checked]:border-burnt has-[:checked]:bg-burnt/5"
            >
              <input
                type="radio"
                name="rail"
                value={r.id}
                checked={selected === r.id}
                onChange={() => setSelected(r.id)}
                className="mt-1 accent-burnt"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {(r.feeBps / 100).toFixed(2)}%
              </Badge>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* SOLANA_USDC — real QR + polling. No mocks. */}
      {selected === "SOLANA_USDC" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="size-4 text-burnt" /> Scan or tap to pay
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border border-line bg-ink/40 p-3">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="Solana Pay QR"
                    width={240}
                    height={240}
                    className="block"
                  />
                ) : (
                  <div className="flex size-[240px] items-center justify-center text-muted-foreground">
                    <Loader2 className="animate-spin" />
                  </div>
                )}
              </div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Solana Pay · USDC SPL · scan with Solflare / Phantom
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-line bg-background/60 px-3 py-2 font-mono text-[10px] text-muted-foreground">
                <span className="flex-1 truncate">{solanaPay?.url ?? "loading…"}</span>
                <button
                  type="button"
                  onClick={copyUrl}
                  disabled={!solanaPay?.url}
                  className="text-muted-foreground hover:text-burnt"
                  aria-label="Copy Solana Pay URL"
                >
                  {copiedUrl ? (
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>
              {solflareDeepLink && (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href={solflareDeepLink} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" /> Open in Solflare
                  </a>
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-line bg-background/60 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                status
              </span>
              <span className="font-mono text-xs">
                {latestStatus?.status === "PAID" ? (
                  <span className="text-emerald-400">PAID</span>
                ) : (
                  <span className="text-burnt">waiting for payment…</span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-Solana rails stay on the Day 2 mock simulate pattern. */}
      {selected !== "SOLANA_USDC" && (
        <Card className="border-burnt/40 bg-burnt/5">
          <CardContent className="space-y-3 p-4 text-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-burnt" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-burnt">
                Day 3 · test-mode demo
              </p>
            </div>
            <p className="text-muted-foreground">
              Real Dodo-hosted checkout lands Day 4 once per-merchant Product provisioning is
              live. Click below to fire a mock webhook and simulate settlement end-to-end.
            </p>
          </CardContent>
        </Card>
      )}

      {state === "done" || latestStatus?.status === "PAID" ? (
        <Card className="border-emerald-500/40">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-base font-medium">Payment confirmed</p>
            {latestStatus?.txSig && (
              <p className="font-mono text-[10px] text-muted-foreground break-all max-w-full px-4">
                tx {latestStatus.txSig.slice(0, 8)}…{latestStatus.txSig.slice(-8)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Refreshing…</p>
          </CardContent>
        </Card>
      ) : selected !== "SOLANA_USDC" ? (
        <Button size="lg" className="w-full" onClick={simulateMock} disabled={pending}>
          {state === "processing" ? (
            <>
              <Loader2 className="animate-spin" /> Settling…
            </>
          ) : (
            <>
              <Wallet /> Pay ${(amountCents / 100).toFixed(2)} via{" "}
              {rails.find((r) => r.id === selected)?.label ?? selected}
            </>
          )}
        </Button>
      ) : null}

      {state === "error" && error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      )}
      <Separator />
      <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        settlement currency: USDC on Solana
      </p>
    </>
  );
}
