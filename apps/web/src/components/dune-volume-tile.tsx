import { TrendingUp } from "lucide-react";

import { createDuneClient } from "@dodorail/dune";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * DuneVolumeTile — public ecosystem tile showing daily USDC volume on Solana.
 *
 * Powered by a saved Dune query. The query ID is read from
 * DODORAIL_DUNE_QUERY_ID_USDC_VOLUME_7D — when that env is unset (e.g. local
 * dev or missing config), we fall back to mock data so the dashboard never
 * renders an empty tile.
 *
 * Lives on the merchant dashboard alongside the merchant-specific tiles. The
 * narrative: "your settlement currency is the most-active stablecoin on the
 * fastest-finality chain, and we measure it for you."
 *
 * Caching: this is a Server Component. Next.js's per-route caching plus
 * Dune's getLatestResult (which is Dune's cache-friendly path) means we hit
 * Dune at most once per ~5 minutes per merchant cold-start.
 *
 * Day 7+ extension: add a tiny SVG sparkline using the daily rows.
 */

export const revalidate = 300; // 5 minutes — keep Dune credit usage low

interface UsdcVolumeRow {
  day: string;
  volume_usd: number;
  transfers: number;
  unique_recipients: number;
}

function parseRows(rows: unknown[]): UsdcVolumeRow[] {
  return rows
    .map((r) => {
      if (typeof r !== "object" || r === null) return null;
      const o = r as Record<string, unknown>;
      const day = typeof o.day === "string" ? o.day : null;
      const volume = typeof o.volume_usd === "number" ? o.volume_usd : Number(o.volume_usd);
      const transfers = typeof o.transfers === "number" ? o.transfers : Number(o.transfers);
      const uniq = typeof o.unique_recipients === "number"
        ? o.unique_recipients
        : Number(o.unique_recipients);
      if (!day || Number.isNaN(volume)) return null;
      return {
        day,
        volume_usd: volume,
        transfers: Number.isNaN(transfers) ? 0 : transfers,
        unique_recipients: Number.isNaN(uniq) ? 0 : uniq,
      };
    })
    .filter((r): r is UsdcVolumeRow => r !== null);
}

function formatBigUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

export async function DuneVolumeTile() {
  const queryIdRaw = process.env.DODORAIL_DUNE_QUERY_ID_USDC_VOLUME_7D;
  const queryId = queryIdRaw ? Number(queryIdRaw) : NaN;
  const dune = createDuneClient({
    apiKey: process.env.DODORAIL_DUNE_KEY,
    // We allow live mode any time both env vars are present. If either is
    // missing, mock mode keeps the tile visible without burning credits or
    // showing an error to the user.
    mode: process.env.DODORAIL_DUNE_KEY && Number.isFinite(queryId) ? "live" : "mock",
  });

  // In mock mode the queryId is irrelevant — the client returns deterministic
  // rows. In live mode we use the saved query ID and Dune's cached result.
  const effectiveQueryId = Number.isFinite(queryId) ? queryId : 1;

  let rows: UsdcVolumeRow[] = [];
  let dataSource: "live" | "mock" | "error" = dune.mode;
  try {
    const result = await dune.getLatestResult(effectiveQueryId);
    rows = parseRows(result.rows);
  } catch {
    dataSource = "error";
  }

  // In mock mode the rows we get from getLatestResult use a different shape
  // (day / usdc_volume_usd / tx_count). Fall back to showing those.
  if (rows.length === 0 && dataSource === "mock") {
    rows = (
      [
        { day: new Date().toISOString().slice(0, 10), volume_usd: 1_847_221_310, transfers: 1_492_887, unique_recipients: 87_341 },
        { day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10), volume_usd: 1_932_884_104, transfers: 1_581_109, unique_recipients: 92_118 },
      ] satisfies UsdcVolumeRow[]
    );
  }

  const today = rows[0];
  const yesterday = rows[1];
  const deltaPct = today && yesterday && yesterday.volume_usd > 0
    ? ((today.volume_usd - yesterday.volume_usd) / yesterday.volume_usd) * 100
    : 0;
  const deltaSign = deltaPct >= 0 ? "+" : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground">USDC volume · Solana (24h)</CardTitle>
        <TrendingUp className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">
          {today ? formatBigUsd(today.volume_usd) : "—"}
        </div>
        <p className="text-xs text-muted-foreground">
          {today
            ? `${deltaSign}${deltaPct.toFixed(1)}% vs yesterday · powered by Dune`
            : "loading… · powered by Dune"}
          {dataSource !== "live" && (
            <span className="ml-2 inline-block rounded-sm border border-line bg-background/60 px-1.5 py-px font-mono text-[9px] uppercase text-muted-foreground">
              {dataSource}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
