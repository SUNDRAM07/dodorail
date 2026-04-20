"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Wallet, ShieldCheck } from "lucide-react";

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

  const simulate = () => {
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
              sourceAsset: selected === "DODO_UPI" ? "INR_UPI" : selected === "DODO_CARD" ? "USD_CARD" : "USDC",
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
  };

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

      <Card className="border-burnt/40 bg-burnt/5">
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-burnt" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-burnt">
              Day 2 · mock checkout
            </p>
          </div>
          <p className="text-muted-foreground">
            Live Solana Pay QR + Dodo checkout redirect land Day 4-5. Click below to fire a mock
            webhook and simulate a successful payment, so you can preview the full lifecycle.
          </p>
        </CardContent>
      </Card>

      {state === "done" ? (
        <Card className="border-emerald-500/40">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-base font-medium">Payment confirmed (mock)</p>
            <p className="text-xs text-muted-foreground">Refreshing…</p>
          </CardContent>
        </Card>
      ) : (
        <Button size="lg" className="w-full" onClick={simulate} disabled={pending}>
          {state === "processing" ? (
            <>
              <Loader2 className="animate-spin" /> Settling on Solana…
            </>
          ) : (
            <>
              <Wallet /> Pay ${(amountCents / 100).toFixed(2)} via{" "}
              {rails.find((r) => r.id === selected)?.label ?? selected}
            </>
          )}
        </Button>
      )}
      {state === "error" && (
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
