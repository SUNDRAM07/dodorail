import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Github,
  Twitter,
  Wallet,
  Bot,
  Sparkles,
  ShieldCheck,
  Coins,
  Zap,
  FileCode2,
  Activity,
} from "lucide-react";

import { BRAND } from "@dodorail/sdk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * /judges — single-page aggregator for hackathon judges + investors.
 *
 * Designed for a 3-5 minute reviewer who's clicked the live-demo URL on a
 * Frontier submission and wants to verify EVERYTHING about DodoRail in one
 * scroll. Every claim has a click-through link.
 *
 * Doubles as the post-hackathon "demo URL for investors" page — same content,
 * just a relabel of the H1 if/when DodoRail moves from hackathon project to
 * funded company.
 */

export const metadata: Metadata = {
  title: "DodoRail · for hackathon judges + reviewers",
  description:
    "Every claim verifiable in 5 minutes. 13 submissions, 12 sponsor integrations, autonomous Treasury Agent live, Anchor program deployable to mainnet, MIT-licensed packages.",
};

export default function JudgesPage() {
  return (
    <div className="container max-w-6xl py-10 sm:py-16">
      {/* Header */}
      <div className="mb-10 sm:mb-14">
        <Badge variant="burnt" className="mb-3 font-mono text-[10px] uppercase tracking-widest">
          For hackathon judges + reviewers
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {BRAND.name} — every claim verifiable in 5 minutes.
        </h1>
        <p className="mt-4 max-w-3xl text-base text-muted-foreground sm:text-lg">
          DodoRail is the stablecoin payment rail for Indian SaaS founders selling globally. Built solo for the
          Solana Frontier Hackathon (Apr 6 – May 11, 2026). Submitted to <strong>13 sponsor tracks</strong>;
          ~$115k pool in scope; $0 spent before the last week.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This page is structured so a 3-5 minute reviewer can verify every concrete claim made in any submission essay
          via the click-through links below. Built by{" "}
          <a
            href="https://github.com/SUNDRAM07"
            target="_blank"
            rel="noreferrer"
            className="text-burnt underline-offset-2 hover:underline"
          >
            Sundaram Mahajan
          </a>{" "}
          ·{" "}
          <a
            href="https://x.com/dodorail"
            target="_blank"
            rel="noreferrer"
            className="text-burnt underline-offset-2 hover:underline"
          >
            @dodorail on X
          </a>
          .
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">
              <ArrowUpRight /> Open the live product
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a
              href="https://github.com/SUNDRAM07/dodorail"
              target="_blank"
              rel="noreferrer"
            >
              <Github /> Open the repo
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="https://x.com/dodorail" target="_blank" rel="noreferrer">
              <Twitter /> 22-day build thread
            </a>
          </Button>
        </div>
      </div>

      {/* Section 1 — Headline metrics */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="size-5 text-burnt" /> Headline metrics
          </CardTitle>
          <CardDescription>The five numbers that summarise the build state.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Tile label="Days shipped" value="18 / 22" />
            <Tile label="Sponsor integrations" value="12" />
            <Tile label="Submission tracks" value="13" />
            <Tile label="Lines of code" value="~14,000" />
            <Tile label="$ spent pre-last-week" value="$0" />
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Live evidence (the most important section) */}
      <h2 className="mt-12 text-2xl font-semibold tracking-tight sm:text-3xl">
        Live evidence — click any of these
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Every artefact below is a verifiable on-chain or live-deployed surface. No screenshots that could be
        photoshopped. No claims that aren't demonstrable.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <EvidenceCard
          icon={Wallet}
          title="Live merchant dashboard"
          href="https://dodorail.vercel.app/dashboard"
          description="Sign in with Phantom / Solflare. Create an invoice. Pay it via Dodo card or USDC on Solana. Watch the Treasury Vault auto-deploy logic."
        />
        <EvidenceCard
          icon={Bot}
          title="Treasury Agent — GitHub Actions cron"
          href="https://github.com/SUNDRAM07/dodorail/actions/workflows/agent-cron.yml"
          description="Every 5 min, real Node.js daemon reads merchant wallets, reasons via LLM, acts. ~18 successful runs since Day 13."
        />
        <EvidenceCard
          icon={ShieldCheck}
          title="Umbra integration verified live on devnet"
          href="https://solscan.io/tx/5Sci9MQErJHEuUmr1DJijv2JKWFYUFL1tPGkaTgpJcBUEAfYtLDH6kZ3LJkgAwhEsZrBQocynd9iUSHwbJAvEavm?cluster=devnet"
          description="Real depositPublicToEncrypted(1 USDC) round-trip. Finalised callback. Real tx signature on Solana devnet."
        />
        <EvidenceCard
          icon={Sparkles}
          title="Anchor program on Solana devnet"
          href="https://explorer.solana.com/address/5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt?cluster=devnet"
          description="2-instruction Anchor program live since Day 4. Mainnet deploy gated on the Day-18 Option-3 decision."
        />
        <EvidenceCard
          icon={Coins}
          title="LP Agent Treasury Vault — live in dashboard"
          href="https://dodorail.vercel.app/dashboard/settings#treasury"
          description="Configure threshold + pool, view live Meteora DLMM positions, deposit + withdraw flows. 9 LP Agent endpoints integrated."
        />
        <EvidenceCard
          icon={Zap}
          title="x402 agent-payment endpoint"
          href="https://dodorail.vercel.app/api/x402/demo-merchant?resource=status"
          description="An autonomous agent hits this URL → gets HTTP 402 → signs Solana USDC → retries with x-payment header → gets the resource. Real protocol, not a placeholder."
        />
        <EvidenceCard
          icon={ExternalLink}
          title="Eitherway companion landing"
          href="https://preview.eitherway.ai/dd256074-3b91-4bd8-8ae6-88150de0c5bc/"
          description="Built across 5 daily prompts on Eitherway's AI-prompt platform. Solflare wallet connect + real Kamino deposit module + India-vertical positioning."
        />
        <EvidenceCard
          icon={FileCode2}
          title="OpenGraph share card (live PNG)"
          href="https://dodorail.vercel.app/opengraph-image"
          description="Dynamic OG card auto-updates the DAY N OF 22 counter. Every link to dodorail.vercel.app shared on X / iMessage / Slack lights up with this card."
        />
      </div>

      {/* Section 3 — Submission tracks */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight sm:text-3xl">
        13 submission tracks
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        DodoRail (the monorepo) is submitted to 12 product tracks. Plus one content track (Jupiter). Each
        submission is a self-contained essay at <code className="text-burnt">/submissions/&lt;track&gt;.md</code>{" "}
        in the repo.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {SUBMISSIONS.map((s) => (
          <div
            key={s.track}
            className="flex items-start gap-3 rounded-md border border-line bg-background/40 p-4"
          >
            <Badge variant={s.status === "ready" ? "shipped" : "burnt"} className="font-mono text-[9px]">
              {s.status}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{s.track}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.pool} · {s.metric}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.angle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Section 4 — Sponsor integrations + what shipped per sponsor */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight sm:text-3xl">
        Sponsor integrations — what shipped per sponsor
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Every integration follows the same isolation pattern: factory function, mock + live modes, healthcheck,
        feature flag, no cross-package imports. MIT-licensed and forkable. Code paths cited so judges can verify.
      </p>

      <div className="mt-6 grid gap-3">
        {SPONSORS.map((s) => (
          <div key={s.name} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-background/40 p-4">
            <Badge variant={s.status === "shipped" ? "shipped" : s.status === "verified" ? "shipped" : "outline"} className="font-mono text-[9px]">
              {s.status}
            </Badge>
            <div className="flex-1 min-w-[280px]">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.what}</p>
            </div>
            <code className="font-mono text-[10px] text-muted-foreground">{s.path}</code>
          </div>
        ))}
      </div>

      {/* Section 5 — Build narrative */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight sm:text-3xl">
        22-day build narrative (in public)
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Built solo, in public, with a daily X thread on{" "}
        <a
          href="https://x.com/dodorail"
          target="_blank"
          rel="noreferrer"
          className="text-burnt underline-offset-2 hover:underline"
        >
          @dodorail
        </a>
        . Every commit on{" "}
        <a
          href="https://github.com/SUNDRAM07/dodorail/commits/main"
          target="_blank"
          rel="noreferrer"
          className="text-burnt underline-offset-2 hover:underline"
        >
          main
        </a>{" "}
        is timestamped. Every day has a receipt at <code className="text-burnt">/FRONTIER/DAY-N-RECEIPT.md</code>.
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {NARRATIVE.map((n) => (
          <div key={n.range} className="flex gap-3 rounded-md border border-line bg-background/40 p-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-burnt">{n.range}</span>
            <span className="flex-1 text-xs text-muted-foreground">{n.beat}</span>
          </div>
        ))}
      </div>

      <Separator className="my-12" />

      {/* Section 6 — How to verify any specific claim */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="size-5 text-burnt" /> How to verify a specific claim
          </CardTitle>
          <CardDescription>
            If an essay says &quot;X is shipped&quot; or &quot;Y was verified live&quot;, the verification path is one of:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Code path</strong> — every essay cites
            <code className="mx-1 text-burnt">apps/&lt;area&gt;/...</code> or
            <code className="mx-1 text-burnt">packages/integrations/&lt;sponsor&gt;/src/...</code>.
            Open the file on GitHub. Read the implementation.
          </p>
          <p>
            <strong className="text-foreground">On-chain tx</strong> — Solscan links on Solana mainnet or devnet.
            Click them. The tx signatures are real.
          </p>
          <p>
            <strong className="text-foreground">Live URL</strong> — the live demo runs at{" "}
            <a href="https://dodorail.vercel.app" className="text-burnt underline-offset-2 hover:underline">
              dodorail.vercel.app
            </a>
            . The Treasury Agent runs on{" "}
            <a
              href="https://github.com/SUNDRAM07/dodorail/actions/workflows/agent-cron.yml"
              target="_blank"
              rel="noreferrer"
              className="text-burnt underline-offset-2 hover:underline"
            >
              GitHub Actions
            </a>
            . The Eitherway companion is at{" "}
            <a
              href="https://preview.eitherway.ai/dd256074-3b91-4bd8-8ae6-88150de0c5bc/"
              target="_blank"
              rel="noreferrer"
              className="text-burnt underline-offset-2 hover:underline"
            >
              preview.eitherway.ai
            </a>
            .
          </p>
          <p>
            <strong className="text-foreground">Daily receipt</strong> — every day&apos;s shipped work is
            documented in{" "}
            <a
              href="https://github.com/SUNDRAM07/dodorail/tree/main/../FRONTIER"
              target="_blank"
              rel="noreferrer"
              className="text-burnt underline-offset-2 hover:underline"
            >
              /FRONTIER
            </a>
            . If a claim is missing a receipt, treat it as architectural-only.
          </p>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="mt-16 mb-10">
        <Separator className="mb-6" />
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>built by @SUNDRAM07 for the solana frontier hackathon · apr 6 → may 11 2026</span>
          <Link href="/" className="hover:text-burnt">
            ← back to landing
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-background/40 p-3">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EvidenceCard({
  icon: Icon,
  title,
  href,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-3 rounded-md border border-line bg-background/40 p-4 transition-colors hover:border-burnt/60 hover:bg-burnt/5"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon className="size-4 text-burnt" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium">
          {title} <ExternalLink className="size-3 text-muted-foreground transition-colors group-hover:text-burnt" />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </a>
  );
}

const SUBMISSIONS = [
  {
    track: "Dodo Payments Merchant Hackathon",
    pool: "$10k pool · 5/3/2",
    metric: "Real per-invoice Product + Checkout Session via REST API",
    angle: "Card + UPI MoR rail with USDC settlement on Solana. India-native. Webhook signature-verified.",
    status: "ready",
  },
  {
    track: "100xDevs",
    pool: "$10k · 10 places",
    metric: "Solo-built monorepo, 12 sponsor integrations, ~14k LOC",
    angle: "Indian student building for other Indian students who want to charge global customers in stablecoins.",
    status: "ready",
  },
  {
    track: "Dune Analytics",
    pool: "$6k pool",
    metric: "Same SQL powers private + public dashboards",
    angle: "Dual-purpose query: merchant analytics + ecosystem-level public dashboard for distribution.",
    status: "ready",
  },
  {
    track: "GoldRush / Covalent",
    pool: "$3k pool",
    metric: "Prajin's full 3-pattern set shipped",
    angle: "Multi-chain abstraction + behaviour deltas + inflow categoriser. Full API access via Prajin.",
    status: "ready",
  },
  {
    track: "Cloak Privacy",
    pool: "$5k pool",
    metric: "Browser-native Groth16 ZK · ~3s prove · sub-50ms verify",
    angle: "Mainnet-only ZK shielded pool with viewing-keys for compliance exports.",
    status: "ready",
  },
  {
    track: "Privacy × MagicBlock Synthesis",
    pool: "$5k pool",
    metric: "Three privacy providers in production",
    angle: "Cloak primary · Umbra secondary · MagicBlock institutional. Per-invoice override UI.",
    status: "ready",
  },
  {
    track: "Umbra Side Track",
    pool: "$5k pool",
    metric: "Verified live on devnet — real tx sigs",
    angle: "depositPublicToEncrypted finalized end-to-end. Cal shipped the dummy faucet, we wired against it.",
    status: "ready",
  },
  {
    track: "LP Agent API Side Track",
    pool: "$900 pool",
    metric: "9 LP Agent endpoints integrated end-to-end",
    angle: "Treasury Vault auto-deploys idle merchant USDC into Meteora DLMM. Withdraw any time.",
    status: "ready",
  },
  {
    track: "Encrypt × Ika",
    pool: "$15k pool",
    metric: "Zero bridges, zero wrapped, zero custodian",
    angle: "Native BTC/ETH paid → USDC on Solana via Ika 2PC-MPC dWallets. Architectural-only on pre-alpha (mock signer).",
    status: "ready",
  },
  {
    track: "Tether",
    pool: "$10k pool · 5/3/2",
    metric: "Full asset family — USDT + USDT0 + XAUT0",
    angle: "Native USDT + LayerZero OFT cross-chain + omnichain Tether Gold. Three rails, one dashboard.",
    status: "ready",
  },
  {
    track: "Zerion CLI Autonomous Agent",
    pool: "$5k pool · $2.5k/$1.5k/$1k",
    metric: "Every 5 min · 5 delta flags · Squads spend-limit",
    angle: "Autonomous Treasury Agent. Pluggable LLM. Zero raw private keys held.",
    status: "ready",
  },
  {
    track: "Eitherway Build a Live dApp",
    pool: "$20k pool · 5 places",
    metric: "5 daily Eitherway prompts · real Kamino deposit",
    angle: "Companion landing built on Eitherway's AI-prompt platform. India-vertical positioning + 5-point moat.",
    status: "ready",
  },
  {
    track: "Jupiter Not Your Regular Bounty",
    pool: "$3k pool · 6 winners",
    metric: "Format-novel 5-tweet thread on jupUSD",
    angle: "USDtb → BlackRock BUIDL → Indian SaaS founder settlement chain.",
    status: "ready",
  },
];

const SPONSORS = [
  { name: "Dodo Payments", what: "Card + UPI MoR rail · webhook signature-verified · per-invoice Product + Checkout Session", path: "packages/integrations/dodo/", status: "shipped" },
  { name: "Solana Pay / Helius", what: "Helius push webhook + polling fallback · sub-second confirm · multi-mint USDC support", path: "apps/web/src/app/api/webhooks/helius/", status: "shipped" },
  { name: "Dune Analytics", what: "Real Solana volume query + dashboard tile + public dashboard", path: "packages/integrations/dune/", status: "shipped" },
  { name: "GoldRush (Covalent)", what: "BalanceService + TransactionService · multi-chain adapter for the agent (Day 15)", path: "packages/integrations/goldrush/ + apps/agent/src/adapters/goldrush.ts", status: "shipped" },
  { name: "Umbra", what: "Privacy provider · verified live on devnet · ZK + MPC encrypted accounts + viewing keys", path: "packages/integrations/umbra/", status: "verified" },
  { name: "Cloak", what: "Mainnet-only ZK shielded pool · browser-native Groth16 prover · compliance CSV export", path: "packages/integrations/cloak/", status: "shipped" },
  { name: "Tether (USDT/USDT0/XAUT0)", what: "Three Tether assets as separate rails · LayerZero OFT cross-chain in mock mode", path: "packages/integrations/tether/", status: "shipped" },
  { name: "Ika dWallets", what: "Architectural-only on pre-alpha · mock signer · ready for Alpha 1", path: "packages/integrations/ika/", status: "architectural" },
  { name: "LP Agent (Nimbus)", what: "9 endpoints integrated · Treasury Vault dashboard surface · daily Vercel cron", path: "packages/integrations/lpagent/", status: "shipped" },
  { name: "Zerion (Treasury Agent)", what: "Wallet portfolio API · pluggable adapter · agent's primary data source", path: "apps/agent/src/adapters/zerion.ts", status: "shipped" },
  { name: "Squads multisig", what: "Delegated signer scaffold · $1k spend-limit policy · live-mode stub for Day 18+", path: "apps/agent/src/squads/delegated-signer.ts", status: "shipped" },
  { name: "x402-on-Solana", what: "Real HTTP 402 protocol implementation · server + client helpers · agent-payment route", path: "packages/integrations/x402/ + apps/web/src/app/api/x402/", status: "shipped" },
];

const NARRATIVE = [
  { range: "Days 1-3", beat: "Foundation: Turborepo, Next.js 15, Anchor program, Neon Postgres, custom HMAC sessions, Solana Pay QR working." },
  { range: "Days 4-5", beat: "Real Dodo Payments + Helius push webhook. Sub-second confirm path live." },
  { range: "Days 6-8", beat: "Dune + GoldRush + Cloak + Umbra integrations. Three privacy providers wired." },
  { range: "Days 9-10", beat: "Tether trio (USDT + USDT0 + XAUT0) + Ika bridgeless BTC/ETH. Per-invoice privacy override UI." },
  { range: "Days 11-12", beat: "Treasury Vault dashboard + daily Vercel cron sweep. LP Agent 9-endpoint integration." },
  { range: "Day 13", beat: "Treasury Agent goes autonomous. Separate apps/agent/ workspace. GitHub Actions cron every 5 min." },
  { range: "Days 14-15", beat: "Umbra verified live on devnet. GoldRush v2 multi-chain adapter + 5-flag behaviour deltas." },
  { range: "Days 16-17", beat: "Squads delegated signer + inflow classifier (Prajin's full pattern set). Live frontend caught up. Repo README rewritten." },
  { range: "Day 18", beat: "x402 wrapper goes from placeholder to real implementation. Dynamic OG cards + pinned X thread." },
  { range: "Days 19-21", beat: "Burn-day submissions. Mainnet smoke tests. Final polish. Submission deadline May 11." },
];
