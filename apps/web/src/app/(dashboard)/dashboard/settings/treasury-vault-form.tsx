"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Wallet, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { updateTreasuryConfigAction, triggerZapInAction } from "./actions";

type PoolId =
  | "usdc-sol-meteora-dlmm"
  | "usdc-usdt-meteora-dlmm"
  | "usdc-bsol-meteora-dlmm";

interface PoolOption {
  id: PoolId;
  label: string;
  pair: string;
  blurb: string;
  apr: number;
}

/** Mirror of `CURATED_POOLS` from `@dodorail/lpagent` — the form is a client
 * component so we inline the labels rather than importing the wrapper. The
 * id list is type-locked so any drift breaks at compile time. */
const POOLS: PoolOption[] = [
  {
    id: "usdc-sol-meteora-dlmm",
    label: "USDC ↔ SOL",
    pair: "USDC-SOL",
    blurb:
      "Highest-liquidity USDC pair on Meteora — best fills, most fees. Default pick.",
    apr: 28.4,
  },
  {
    id: "usdc-usdt-meteora-dlmm",
    label: "USDC ↔ USDT",
    pair: "USDC-USDT",
    blurb: "Stable-stable. Minimal IL, fees-driven. Conservative default.",
    apr: 9.2,
  },
  {
    id: "usdc-bsol-meteora-dlmm",
    label: "USDC ↔ bSOL",
    pair: "USDC-bSOL",
    blurb: "Liquid-staked SOL. Pairs USDC with bSOL's intrinsic staking yield.",
    apr: 18.1,
  },
];

interface Props {
  initialYieldEnabled: boolean;
  initialThresholdCents: number;
  initialSelectedPoolId: PoolId;
  /** What we'd deploy *right now* if the merchant clicked "Deploy now".
   * Comes from `getMerchantTreasuryView` upstream — represents idle balance
   * minus threshold (or 0 if disabled / under threshold). */
  deployableNowCents: number;
}

export function TreasuryVaultForm({
  initialYieldEnabled,
  initialThresholdCents,
  initialSelectedPoolId,
  deployableNowCents,
}: Props) {
  const router = useRouter();
  const [yieldEnabled, setYieldEnabled] = useState(initialYieldEnabled);
  const [thresholdUsd, setThresholdUsd] = useState(
    (initialThresholdCents / 100).toFixed(0),
  );
  const [selectedPoolId, setSelectedPoolId] = useState<PoolId>(initialSelectedPoolId);
  const [pending, startTransition] = useTransition();
  const [deployPending, startDeployTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [deployedPositionId, setDeployedPositionId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    yieldEnabled !== initialYieldEnabled ||
    selectedPoolId !== initialSelectedPoolId ||
    Math.round(parseFloat(thresholdUsd || "0") * 100) !== initialThresholdCents;

  function onSave() {
    setErr(null);
    startTransition(async () => {
      const formData = new FormData();
      if (yieldEnabled) formData.set("yieldEnabled", "on");
      formData.set("thresholdUsd", thresholdUsd);
      formData.set("selectedPoolId", selectedPoolId);
      const result = await updateTreasuryConfigAction(undefined, formData);
      if (result.ok) {
        setSavedAt(new Date());
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  function onDeployNow() {
    setErr(null);
    setDeployedPositionId(null);
    startDeployTransition(async () => {
      const result = await triggerZapInAction({
        poolId: selectedPoolId,
        amountUsdcCents: deployableNowCents,
      });
      if (result.ok) {
        setDeployedPositionId(result.positionId);
        router.refresh();
      } else {
        setErr(result.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Master toggle */}
      <label className="flex items-start gap-3 rounded-md border border-line p-3 cursor-pointer hover:border-burnt/60 has-[:checked]:border-burnt has-[:checked]:bg-burnt/5">
        <input
          type="checkbox"
          checked={yieldEnabled}
          onChange={(e) => setYieldEnabled(e.target.checked)}
          className="mt-1 accent-burnt"
        />
        <div className="flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-burnt" /> Auto-deploy idle USDC for yield
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            powered by LP Agent · Meteora DLMM · zap-in / zap-out via API
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every 15 min, we check your settlement wallet&apos;s idle USDC. Anything above
            your threshold gets deployed into your selected Meteora DLMM pool. Fees +
            position value live-update on the dashboard. One-click zap-out any time.
          </p>
        </div>
      </label>

      {/* Threshold */}
      <div className={yieldEnabled ? "" : "opacity-50 pointer-events-none"}>
        <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Idle balance threshold (USD)
        </label>
        <div className="relative max-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            min="100"
            step="50"
            value={thresholdUsd}
            onChange={(e) => setThresholdUsd(e.target.value)}
            disabled={!yieldEnabled}
            className="pl-7"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Yield only kicks in once idle USDC exceeds this. Default $500. Reserves below
          the threshold stay liquid for refunds + outbound spends.
        </p>
      </div>

      {/* Pool selection */}
      <div className={yieldEnabled ? "" : "opacity-50 pointer-events-none"}>
        <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Pool selection
        </label>
        <div className="space-y-2">
          {POOLS.map((p) => {
            const selected = selectedPoolId === p.id;
            return (
              <label
                key={p.id}
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  selected
                    ? "border-burnt bg-burnt/5"
                    : "border-line hover:border-burnt/60"
                }`}
              >
                <input
                  type="radio"
                  name="selectedPoolId"
                  value={p.id}
                  checked={selected}
                  onChange={() => setSelectedPoolId(p.id)}
                  disabled={!yieldEnabled}
                  className="mt-1 accent-burnt"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{p.label}</p>
                    <span className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px font-mono text-[10px] text-emerald-400">
                      ~{p.apr.toFixed(1)}% APR
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {p.pair} · meteora dlmm
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Save / status row */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs">
          {savedAt && !dirty && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <Check className="size-3" /> Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          {err && <span className="text-destructive">{err}</span>}
        </div>
        <Button onClick={onSave} disabled={!dirty || pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save Treasury config"
          )}
        </Button>
      </div>

      {/* Manual deploy-now */}
      {yieldEnabled && deployableNowCents > 0 && (
        <div className="rounded-md border border-line bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="size-4 text-burnt" /> Deploy now
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Skip the cron — deploy <strong>${(deployableNowCents / 100).toFixed(2)}</strong>{" "}
                of idle USDC into{" "}
                <span className="font-mono text-[11px]">{POOLS.find((p) => p.id === selectedPoolId)?.label}</span>{" "}
                immediately.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onDeployNow}
              disabled={deployPending || dirty}
            >
              {deployPending ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Zapping in…
                </>
              ) : (
                "Deploy"
              )}
            </Button>
          </div>
          {deployedPositionId && (
            <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <Check className="size-3" /> position {deployedPositionId.slice(0, 18)}… opened
            </p>
          )}
          {dirty && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Save your config changes first, then deploy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
