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
  dodoCheckoutUrl,
  privateMode = false,
  privateProvider = "NONE",
}: {
  invoiceId: string;
  rails: readonly Rail[];
  amountCents: number;
  dodoCheckoutUrl: string | null;
  privateMode?: boolean;
  privateProvider?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(() => rails[0]?.id ?? "SOLANA_USDC");
  const [cloakState, setCloakState] = useState<
    "idle" | "circuits" | "proving" | "submitting" | "confirmed" | "failed"
  >("idle");
  const [cloakError, setCloakError] = useState<string | null>(null);
  const [cloakTx, setCloakTx] = useState<string | null>(null);
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
    // Helius push webhook is the fast path (~1-3s from chain finality); this
    // poll is the fallback for when push is lagging or unregistered. 2s keeps
    // perceived latency tight without hammering Helius RPC.
    pollTimer.current = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [invoiceId, router]);

  // Cloak private payment flow.
  //
  // Real flow (Day 16+, mainnet):
  //   1. Pull circuits from S3 (cached after first load) — ~1-2s first time
  //   2. Connect wallet via @solana/wallet-adapter-react
  //   3. Generate Groth16 proof browser-side via @cloak.dev/sdk transact() —
  //      ~3s on a modern laptop, longer on slow devices
  //   4. Sign + submit the deposit tx through the wallet adapter
  //   5. Wait for chain confirmation (Helius webhook fires the invoice
  //      flip via /api/webhooks/helius)
  //   6. PAID polling picks up the flip (same path as the USDC rail)
  //
  // Day 7 mock-mode flow:
  //   - Animate through the four states (circuits / proving / submitting /
  //     confirmed) with realistic delays so the UX matches what the demo
  //     video will capture on Day 17
  //   - On "confirmed", fire the same mock-webhook as the other test paths
  //     so the invoice actually flips to PAID in the dashboard
  const payViaCloak = useCallback(() => {
    setCloakError(null);
    setCloakTx(null);
    void (async () => {
      try {
        setCloakState("circuits");
        await new Promise((r) => setTimeout(r, 800));
        setCloakState("proving");
        await new Promise((r) => setTimeout(r, 2400));
        setCloakState("submitting");
        await new Promise((r) => setTimeout(r, 1200));
        // Fire the mock-webhook to flip the invoice in the database.
        const res = await fetch("/api/webhooks/dodo", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "webhook-signature": "mock_sig_for_cloak",
            "webhook-id": `mock_cloak_${invoiceId}_${Date.now()}`,
            "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
          },
          body: JSON.stringify({
            type: "payment.succeeded",
            data: {
              invoiceId,
              rail: "SOLANA_USDC",
              sourceAsset: "USDC",
              amountCents,
              mock: true,
              privateProvider: "CLOAK",
            },
          }),
        });
        if (!res.ok) throw new Error(`webhook returned ${res.status}`);
        const fakeSig = `mock_cloak_${Math.random().toString(36).slice(2, 14)}${Math.random()
          .toString(36)
          .slice(2, 14)}`;
        setCloakTx(fakeSig);
        setCloakState("confirmed");
        setTimeout(() => router.refresh(), 800);
      } catch (e) {
        setCloakError(e instanceof Error ? e.message : "Cloak flow failed");
        setCloakState("failed");
      }
    })();
  }, [amountCents, invoiceId, router]);

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
                    : selected === "SOLANA_USDT"
                      ? "USDT"
                      : selected === "SOLANA_USDT0"
                        ? "USDT0"
                        : selected === "SOLANA_XAUT0"
                          ? "XAUT0"
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
      typeof window !== "undefined" ? window.location.origin : "https://dodorail.xyz",
    )}`;
  }, [solanaPay]);

  return (
    <>
      {/* Private mode banner — shown when the merchant set this invoice
          to private. Lifts the Cloak flow above the regular rail picker so
          customers see the privacy option first. */}
      {privateMode && privateProvider === "CLOAK" && cloakState !== "confirmed" && (
        <Card className="border-burnt/40 bg-burnt/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-burnt" /> Pay privately via Cloak
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This invoice is set to private. Your payment routes through Cloak&apos;s
              shielded pool — the chain only sees an unattributable deposit, never
              your wallet linked to the merchant&apos;s wallet.
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Browser-native Groth16 ZK proof · ~3s prove · &lt;50ms verify
            </p>

            {cloakState === "idle" && (
              <Button onClick={payViaCloak} size="lg" className="w-full">
                <ShieldCheck /> Pay ${(amountCents / 100).toFixed(2)} privately
              </Button>
            )}

            {(cloakState === "circuits" ||
              cloakState === "proving" ||
              cloakState === "submitting") && (
              <div className="space-y-2 rounded-md border border-line bg-background/60 p-3 font-mono text-xs">
                <CloakStateRow
                  active={cloakState === "circuits"}
                  done={cloakState !== "circuits"}
                  label="Loading circuits from S3"
                />
                <CloakStateRow
                  active={cloakState === "proving"}
                  done={cloakState === "submitting"}
                  label="Generating Groth16 proof"
                />
                <CloakStateRow
                  active={cloakState === "submitting"}
                  done={false}
                  label="Submitting deposit transaction"
                />
              </div>
            )}

            {cloakState === "failed" && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                {cloakError ?? "Cloak flow failed. Try again."}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground">
              Cloak program{" "}
              <span className="font-mono">zh1eLd6r…fwA6qRkW</span> · relay{" "}
              <span className="font-mono">api.cloak.ag</span> · MIT-licensed
            </p>
          </CardContent>
        </Card>
      )}

      {/* Umbra branch — reuses the same state machine as Cloak (cloakState)
          since only one privacy provider runs per invoice. The labels and
          technical details differ; the customer experience is parallel. */}
      {privateMode && privateProvider === "UMBRA" && cloakState !== "confirmed" && (
        <Card className="border-burnt/40 bg-burnt/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-burnt" /> Pay privately via Umbra
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This invoice is set to private. Your payment routes through Umbra&apos;s
              encrypted account on Solana — the chain shows a Merkle update, never
              your wallet&apos;s identity linked to the merchant&apos;s.
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Arcium MPC + ZK · viewing-key compliance · devnet + mainnet
            </p>

            {cloakState === "idle" && (
              <Button onClick={payViaCloak} size="lg" className="w-full">
                <ShieldCheck /> Pay ${(amountCents / 100).toFixed(2)} privately
              </Button>
            )}

            {(cloakState === "circuits" ||
              cloakState === "proving" ||
              cloakState === "submitting") && (
              <div className="space-y-2 rounded-md border border-line bg-background/60 p-3 font-mono text-xs">
                <CloakStateRow
                  active={cloakState === "circuits"}
                  done={cloakState !== "circuits"}
                  label="Connecting to Umbra"
                />
                <CloakStateRow
                  active={cloakState === "proving"}
                  done={cloakState === "submitting"}
                  label="Encrypting via Arcium MPC"
                />
                <CloakStateRow
                  active={cloakState === "submitting"}
                  done={false}
                  label="Finalising on chain"
                />
              </div>
            )}

            {cloakState === "failed" && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                {cloakError ?? "Umbra flow failed. Try again."}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground">
              Umbra program{" "}
              <span className="font-mono">UMBRAD2…oLykh</span> · powered by
              {" "}<span className="font-mono">@umbra-privacy/sdk</span> · MIT-licensed
            </p>
          </CardContent>
        </Card>
      )}

      {privateMode && cloakState === "confirmed" && (
        <Card className="border-emerald-500/40">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-base font-medium">Private payment confirmed</p>
            {cloakTx && (
              <p className="font-mono text-[10px] text-muted-foreground break-all max-w-full px-4">
                tx {cloakTx.slice(0, 8)}…{cloakTx.slice(-8)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Shielded via{" "}
              {privateProvider === "UMBRA" ? "Umbra" : "Cloak"} · merchant sees
              the receipt, the chain stays opaque
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {privateMode ? "Or pay publicly" : "Pick a payment rail"}
          </CardTitle>
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
              <div className="rounded-lg border border-line bg-ink/40 p-2 sm:p-3">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="Solana Pay QR"
                    width={240}
                    height={240}
                    className="block size-[200px] sm:size-[240px]"
                  />
                ) : (
                  <div className="flex size-[200px] items-center justify-center text-muted-foreground sm:size-[240px]">
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

      {/* Tether rails — context cards above the simulate-payment button. */}
      {selected === "SOLANA_USDT" && (
        <Card className="border-burnt/40 bg-burnt/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="text-sm font-medium">Pay with native USDT on Solana</p>
            <p className="text-xs text-muted-foreground">
              Tether USD, ~$2.4B circulating supply on Solana. Same SPL transfer flow as USDC.
            </p>
            <p className="font-mono text-[10px] text-muted-foreground break-all">
              mint: Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
            </p>
          </CardContent>
        </Card>
      )}

      {selected === "SOLANA_USDT0" && (
        <Usdt0BridgeCard invoiceId={invoiceId} amountCents={amountCents} />
      )}

      {selected === "SOLANA_XAUT0" && (
        <Card className="border-burnt/40 bg-burnt/5">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="text-sm font-medium">Pay with omnichain Tether Gold (XAUT0)</p>
            <p className="text-xs text-muted-foreground">
              1 XAUT0 = 1 troy oz LBMA-accredited gold, redeemable through Tether. Treasury-grade
              settlement option for merchants who want gold-backed reserves.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-line bg-background/60 p-2">
                <p className="font-mono text-[9px] uppercase text-muted-foreground">XAU/USD</p>
                <p className="mt-1 font-medium">~$2,400 / oz</p>
              </div>
              <div className="rounded-md border border-line bg-background/60 p-2">
                <p className="font-mono text-[9px] uppercase text-muted-foreground">
                  ${(amountCents / 100).toFixed(2)} ≈
                </p>
                <p className="mt-1 font-medium">{(amountCents / 100 / 2400).toFixed(6)} XAUT0</p>
              </div>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground break-all">
              mint: ESrLDcuX3oHRz1w2MbJZeeDKxZpTccrJyacsZMRTHuuo
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ika bridgeless rails — BTC + ETH via 2PC-MPC dWallets. Architectural-only
          on pre-alpha; the dWallet receive address is real shape but the signer
          is mock until Ika ships Alpha 1. */}
      {(selected === "IKA_BTC" || selected === "IKA_ETH") && (
        <IkaBridgelessCard
          invoiceId={invoiceId}
          chain={selected === "IKA_BTC" ? "bitcoin" : "ethereum"}
          amountCents={amountCents}
        />
      )}

      {/* Generic mock-simulate notice for the remaining rails
          (DODO_CARD/UPI handled separately via the Pay-with-Dodo button below). */}
      {selected !== "SOLANA_USDC" &&
        selected !== "SOLANA_USDT" &&
        selected !== "SOLANA_USDT0" &&
        selected !== "SOLANA_XAUT0" &&
        selected !== "IKA_BTC" &&
        selected !== "IKA_ETH" && (
          <Card className="border-burnt/40 bg-burnt/5">
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-burnt" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-burnt">
                  test-mode demo
                </p>
              </div>
              <p className="text-muted-foreground">
                Click below to fire a mock webhook and simulate settlement end-to-end.
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
        (selected === "DODO_CARD" || selected === "DODO_UPI") && dodoCheckoutUrl ? (
          <Button size="lg" className="w-full" asChild>
            <a href={dodoCheckoutUrl} rel="noopener">
              <Wallet /> Pay ${(amountCents / 100).toFixed(2)} via{" "}
              {rails.find((r) => r.id === selected)?.label ?? selected} <ExternalLink />
            </a>
          </Button>
        ) : (
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
        )
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

function CloakStateRow({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="size-3.5 text-emerald-400" />
      ) : active ? (
        <Loader2 className="size-3.5 animate-spin text-burnt" />
      ) : (
        <span className="inline-block size-3.5 rounded-full border border-line" />
      )}
      <span className={done ? "text-muted-foreground" : active ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

const USDT0_SOURCE_CHAINS_DISPLAY = [
  { id: "ethereum", label: "Ethereum" },
  { id: "tron", label: "Tron" },
  { id: "bnb", label: "BNB Chain" },
  { id: "polygon", label: "Polygon" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "base", label: "Base" },
  { id: "optimism", label: "Optimism" },
  { id: "avalanche", label: "Avalanche" },
] as const;

interface Usdt0Quote {
  estimatedFeeUsdCents: number;
  estimatedSeconds: number;
  source: "transfer-api" | "mock";
  mode: "live" | "mock";
}

/**
 * Customer flow when paying USDT cross-chain via USDT0:
 *   1. Pick source chain (where their USDT lives — Ethereum / Tron / BNB / etc)
 *   2. Paste their source-chain wallet address
 *   3. Server calls LayerZero Transfer API → returns quote (fee + tx data)
 *   4. Customer signs source-chain tx → bridge fires → Solana mint
 *
 * For Day 9 we ship steps 1-3 against mock-mode (LayerZero Transfer API key
 * pending). Step 4 wires up on Day 17 once the key arrives.
 */
function Usdt0BridgeCard({
  invoiceId,
  amountCents,
}: {
  invoiceId: string;
  amountCents: number;
}) {
  const [srcChain, setSrcChain] = useState<string>("ethereum");
  const [fromAddress, setFromAddress] = useState<string>("");
  const [quote, setQuote] = useState<Usdt0Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function getQuote() {
    setBusy(true);
    setErr(null);
    setQuote(null);
    try {
      const res = await fetch("/api/usdt0/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId, srcChain, fromAddress }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setQuote({
        estimatedFeeUsdCents: json.estimatedFeeUsdCents,
        estimatedSeconds: json.estimatedSeconds,
        source: json.source,
        mode: json.mode,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "quote failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-burnt/40 bg-burnt/5">
      <CardContent className="space-y-3 p-4 text-sm">
        <p className="text-sm font-medium">Pay with USDT from any chain (USDT0)</p>
        <p className="text-xs text-muted-foreground">
          LayerZero OFT bridges your USDT from Ethereum / Tron / BNB / Polygon / Arbitrum / Base
          / Optimism / Avalanche. Settles as native USDT0 on Solana.
        </p>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            source chain
          </span>
          <select
            value={srcChain}
            onChange={(e) => setSrcChain(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-background/60 px-3 py-2 text-sm focus:border-burnt focus:outline-none"
          >
            {USDT0_SOURCE_CHAINS_DISPLAY.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            your {srcChain} wallet
          </span>
          <input
            type="text"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder={
              srcChain === "tron"
                ? "Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                : "0xabc..."
            }
            className="mt-1 w-full rounded-md border border-line bg-background/60 px-3 py-2 font-mono text-xs focus:border-burnt focus:outline-none"
          />
        </label>

        <Button
          size="sm"
          variant="outline"
          onClick={getQuote}
          disabled={busy || fromAddress.length < 20}
          className="w-full"
        >
          {busy ? <><Loader2 className="size-3.5 animate-spin" /> Quoting…</> : "Get quote"}
        </Button>

        {err && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {err}
          </p>
        )}

        {quote && (
          <div className="rounded-md border border-line bg-background/60 p-3 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase text-muted-foreground">amount</p>
                <p className="mt-0.5 font-medium">${(amountCents / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase text-muted-foreground">bridge fee</p>
                <p className="mt-0.5 font-medium">${(quote.estimatedFeeUsdCents / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase text-muted-foreground">eta</p>
                <p className="mt-0.5 font-medium">~{quote.estimatedSeconds}s</p>
              </div>
            </div>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              quote source · {quote.source} · mode · {quote.mode}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ika bridgeless flow: customer picks BTC or ETH, our backend (server
 * action — Phase B+) creates a 2PC-MPC dWallet, returns the receive address,
 * customer sends native BTC/ETH there, the DodoRail Solana program approves
 * the message and releases USDC to the merchant.
 *
 * Today this is architectural-only — Ika's Solana SDK is pre-alpha with a
 * mock signer. The receive address shape is real (bc1q... / 0x...) so the
 * UX is identical to the live Alpha-1 flow that flips on later in 2026.
 */
function IkaBridgelessCard({
  invoiceId,
  chain,
  amountCents,
}: {
  invoiceId: string;
  chain: "bitcoin" | "ethereum";
  amountCents: number;
}) {
  const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Generate a mock dWallet receive address synchronously when this card
  // mounts. Real Phase-B+ flow would POST to a server action that calls
  // @dodorail/ika.createDWallet and persists the result.
  useEffect(() => {
    if (receiveAddress) return;
    setBusy(true);
    const seed = invoiceId.slice(0, 8);
    const rand = Math.random().toString(36).slice(2, 30);
    const addr =
      chain === "bitcoin"
        ? `bc1qmock${seed}${rand}`
        : `0xmock${seed}${rand.padEnd(36, "0")}`;
    // Tiny artificial delay so the UI shows "creating dWallet..." briefly —
    // matches what real DKG would feel like (~1-2s on Alpha-1).
    const t = setTimeout(() => {
      setReceiveAddress(addr);
      setBusy(false);
    }, 1200);
    return () => clearTimeout(t);
  }, [invoiceId, chain, receiveAddress]);

  const chainLabel = chain === "bitcoin" ? "Bitcoin" : "Ethereum";
  const symbol = chain === "bitcoin" ? "BTC" : "ETH";
  const usdAmount = amountCents / 100;

  return (
    <Card className="border-burnt/40 bg-burnt/5">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Pay with native {chainLabel} (bridgeless)</p>
          <span className="rounded-sm border border-line bg-background/60 px-1.5 py-px font-mono text-[9px] uppercase text-muted-foreground">
            architectural · pre-alpha
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Send native {symbol} from your wallet to the address below. Our Solana
          program receives co-signing authority over an Ika dWallet via 2PC-MPC
          threshold signatures — when the {symbol} confirms, USDC releases to
          the merchant on Solana. No wrapped tokens. No custodian. No bridge.
        </p>

        {busy && (
          <div className="flex items-center gap-2 rounded-md border border-line bg-background/60 p-3 font-mono text-xs">
            <Loader2 className="size-3.5 animate-spin text-burnt" />
            <span className="text-muted-foreground">
              Generating dWallet via Ika DKG…
            </span>
          </div>
        )}

        {receiveAddress && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {chainLabel} receive address
            </p>
            <div className="rounded-md border border-line bg-background/60 p-3 font-mono text-[11px] break-all">
              {receiveAddress}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-line bg-background/60 p-2">
                <p className="font-mono text-[9px] uppercase text-muted-foreground">
                  amount
                </p>
                <p className="mt-0.5 font-medium">${usdAmount.toFixed(2)} USD</p>
              </div>
              <div className="rounded-md border border-line bg-background/60 p-2">
                <p className="font-mono text-[9px] uppercase text-muted-foreground">
                  signature scheme
                </p>
                <p className="mt-0.5 font-medium">
                  {chain === "bitcoin" ? "ECDSA secp256k1" : "ECDSA secp256k1"}
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Powered by{" "}
          <span className="font-mono">@ika.xyz/sdk</span> · 2PC-MPC threshold
          signatures · MIT-licensed wrapper at{" "}
          <span className="font-mono">packages/integrations/ika/</span>. Ika
          ships Alpha 1 with real distributed signers later in 2026.
        </p>
      </CardContent>
    </Card>
  );
}
