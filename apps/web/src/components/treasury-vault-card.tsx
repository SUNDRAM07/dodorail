import Link from "next/link";
import { Sparkles, ArrowDownToLine, TrendingUp } from "lucide-react";

import { CURATED_POOLS } from "@dodorail/lpagent";
import type { LpPosition, LpPositionMetrics } from "@dodorail/lpagent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { ZapOutButton } from "./zap-out-button";

interface Props {
  yieldEnabled: boolean;
  selectedPoolId: string;
  metrics: LpPositionMetrics | null;
  positions: LpPosition[];
  /** Wrapper mode — `mock` decorates the card with a "demo data" label so
   * judges can tell at a glance the position numbers aren't from a real on-
   * chain LP yet. Day 12 cron + sponsor-supplied API key flips this to
   * `live` and the badge disappears. */
  wrapperMode: "live" | "mock";
}

export function TreasuryVaultCard({
  yieldEnabled,
  selectedPoolId,
  metrics,
  positions,
  wrapperMode,
}: Props) {
  const pool =
    CURATED_POOLS.find((p) => p.id === selectedPoolId) ?? CURATED_POOLS[0]!;

  // ---- Variant 1: yield disabled — render an upsell card ------------------
  if (!yieldEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-burnt" /> Treasury Vault
            <Badge variant="outline" className="ml-1 font-mono text-[10px] uppercase tracking-widest">
              off
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your idle USDC is sitting still. Turn on Treasury Vault to auto-deploy
            anything above your threshold into a curated Meteora DLMM pool — fees
            accrue, you withdraw any time.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            zero-config · pick a pool · cron handles the rest
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings#treasury">
              <Sparkles /> Enable Treasury Vault
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---- Variant 2: enabled, no positions yet — render eligibility ----------
  if (!metrics || positions.length === 0) {
    return (
      <Card className="border-burnt/40 bg-burnt/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-burnt" /> Treasury Vault
            <Badge variant="shipped" className="ml-1 font-mono text-[10px] uppercase tracking-widest">
              ready
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Treasury Vault is on. Selected pool:{" "}
            <span className="font-medium text-foreground">{pool.label}</span>. The next
            cron sweep will deploy your idle balance above threshold.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            no open position yet · cron runs every ~15 min
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings#treasury">
              <ArrowDownToLine /> Deploy now from settings
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---- Variant 3: enabled with at least one open position -----------------
  const deposited = metrics.totalDepositedUsdcCents;
  const current = metrics.totalCurrentValueUsdcCents;
  const fees = metrics.totalFeesEarnedUsdcCents;
  const pnl = metrics.totalPnlCents;
  const pnlPositive = pnl >= 0;

  return (
    <Card className="border-emerald-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-burnt" /> Treasury Vault
          <Badge variant="shipped" className="ml-1 font-mono text-[10px] uppercase tracking-widest">
            earning
          </Badge>
          {wrapperMode === "mock" && (
            <Badge variant="outline" className="ml-1 font-mono text-[9px] uppercase tracking-widest">
              demo data
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Deposited" value={`$${(deposited / 100).toFixed(2)}`} />
          <Tile label="Current value" value={`$${(current / 100).toFixed(2)}`} />
          <Tile
            label="Fees earned"
            value={`$${(fees / 100).toFixed(2)}`}
            tone="emerald"
          />
          <Tile
            label="Weighted APR"
            value={`${metrics.weightedApr.toFixed(1)}%`}
            tone="emerald"
          />
        </div>

        <div className="rounded-md border border-line bg-background/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Net P/L since deploy</p>
              <p
                className={`mt-0.5 inline-flex items-center gap-1 font-mono text-base font-semibold ${
                  pnlPositive ? "text-emerald-400" : "text-destructive"
                }`}
              >
                <TrendingUp className="size-4" />
                {pnlPositive ? "+" : ""}${(pnl / 100).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Position count</p>
              <p className="mt-0.5 font-mono text-base font-semibold">
                {metrics.positionCount}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {positions.map((pos) => {
            const posPool =
              CURATED_POOLS.find((p) => p.id === pos.poolId) ??
              ({ label: pos.pair, pair: pos.pair } as { label: string; pair: string });
            return (
              <div
                key={pos.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-background/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{posPool.label}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    opened {new Date(pos.openedAt).toLocaleDateString()} ·{" "}
                    {pos.inRange ? (
                      <span className="text-emerald-400">in range</span>
                    ) : (
                      <span className="text-destructive">out of range</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold">
                    ${(pos.currentValueUsdcCents / 100).toFixed(2)}
                  </p>
                  <p className="font-mono text-[10px] text-emerald-400">
                    +${(pos.feesEarnedUsdcCents / 100).toFixed(2)} fees
                  </p>
                </div>
                <ZapOutButton positionId={pos.id} />
              </div>
            );
          })}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          powered by LP Agent (Nimbus Data Labs) · meteora dlmm zap-in / zap-out
        </p>
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald";
}) {
  return (
    <div className="rounded-md border border-line bg-background/60 p-3">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-base font-semibold ${
          tone === "emerald" ? "text-emerald-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
