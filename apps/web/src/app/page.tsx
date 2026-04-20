import Link from "next/link";
import {
  ArrowRight,
  Github,
  Send,
  Twitter,
  Wallet,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Bot,
  Building2,
  Users,
  Globe2,
} from "lucide-react";
import { BRAND, RAILS, RAIL_STATUS, type RailId } from "@dodorail/sdk";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const DAY_OF = 1;
const TOTAL_DAYS = 22;

const VALUE_PROPS = [
  {
    icon: Building2,
    audience: "For founders",
    headline: "Stop duct-taping Stripe Atlas + Wise + a spreadsheet.",
    body: "Accept cards, UPI, and USDC in one dashboard. Keep your treasury in USD-denominated USDC onchain, not trapped in an INR settlement bank.",
  },
  {
    icon: Users,
    audience: "For customers",
    headline: "Pay how you want. Card, UPI, or stablecoin.",
    body: "Indian customers pay UPI. Global customers pay card or USDC on Solana. SNS-branded pay-to addresses (acme.dodorail.sol) make it feel less like crypto, more like a name.",
  },
  {
    icon: Bot,
    audience: "For agents",
    headline: "Agent-ready since day one, via x402 on Solana.",
    body: "Your customers' AI agents can pay merchant APIs autonomously. DodoRail speaks HTTP 402 and settles in USDC on Solana — the rail 77% of late-2025 x402 volume runs on.",
  },
] as const;

const MOAT_LAYERS = [
  {
    n: "01",
    title: "The bundle",
    body: "No competitor ships India-native + MoR + stablecoin rail + privacy + treasury yield + agent-payments + SNS as one product. Most ship one or two pieces. We ship seven.",
  },
  {
    n: "02",
    title: "India vertical depth",
    body: "GSTIN validation, GST invoices, TDS handling, Tally/Zoho (v2), Hindi-first onboarding (v3), UPI-first fallback. Razorpay has India; Stripe has global; DodoRail has India + global.",
  },
  {
    n: "03",
    title: "Stablecoin-native treasury",
    body: "Every other processor treats your balance as their float. DodoRail treats it as a yield-bearing asset. Merchants earn on idle USDC — custodial incumbents structurally can't match.",
  },
  {
    n: "04",
    title: "Privacy-compliance synthesis",
    body: "Umbra viewing keys for SDK-level privacy. MagicBlock TDX attestation for enterprise auditors. Private amounts without sacrificing the audit trail — the B2B merchant's contradiction, solved.",
  },
  {
    n: "05",
    title: "Agent-ready via x402",
    body: "A timing bet on the 2026-2027 agent economy. Merchants on DodoRail are already wired for autonomous buyers. Merchants on Stripe are not.",
  },
] as const;

const SPONSOR_STRIP = [
  { label: "Dodo Payments", note: "MoR · card + UPI" },
  { label: "Solana", note: "base chain" },
  { label: "Helius", note: "RPC" },
  { label: "Dune", note: "SQL + MCP analytics" },
  { label: "GoldRush", note: "live balances" },
  { label: "MagicBlock", note: "TDX privacy" },
  { label: "Umbra", note: "shielded transfers" },
  { label: "SNS", note: "merchant .sol" },
  { label: "Ika", note: "bridgeless BTC / ETH" },
  { label: "LP Agent", note: "treasury yield" },
  { label: "Zerion × x402", note: "agent rail" },
];

function statusVariant(status: (typeof RAIL_STATUS)[RailId]): "shipped" | "architectural" {
  return status === "shipped" ? "shipped" : "architectural";
}

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Subtle burnt-orange radial gradient in the background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_hsl(22_78%_57%_/_0.08),_transparent_50%)]"
      />

      {/* --- Top bar --- */}
      <header className="border-b border-line/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="wordmark text-xl font-semibold text-foreground">
              {BRAND.wordmark}
            </span>
            <Badge variant="burnt" className="font-mono text-[10px] uppercase tracking-wider">
              Day {DAY_OF} of {TOTAL_DAYS}
            </Badge>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Button variant="ghost" size="sm" asChild>
              <a href={BRAND.social.github} target="_blank" rel="noreferrer">
                <Github className="mr-1.5" /> GitHub
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <a href={BRAND.social.xUrl} target="_blank" rel="noreferrer">
                <Twitter className="mr-1.5" /> {BRAND.social.x}
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <a href={BRAND.social.telegramUrl} target="_blank" rel="noreferrer">
                <Send className="mr-1.5" /> Telegram
              </a>
            </Button>
            <Button size="sm" asChild>
              <a href="#rails">
                Explore rails <ArrowRight />
              </a>
            </Button>
          </nav>
        </div>
      </header>

      {/* --- Hero --- */}
      <section className="border-b border-line/60">
        <div className="container grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-20">
          <div className="animate-fade-in">
            <Badge variant="outline" className="mb-6 font-mono text-[11px] uppercase tracking-widest">
              Solana Frontier · April – May 2026
            </Badge>
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              the stablecoin rail <br className="hidden sm:inline" />
              for <span className="text-burnt">Indian founders</span> <br className="hidden sm:inline" />
              selling globally.
            </h1>
            <p className="mt-8 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground">
              Cards + UPI via Dodo Payments. Native USDC on Solana. Bridgeless BTC and ETH via Ika.
              Autonomous-agent payments via x402. One merchant dashboard, one settlement currency,
              one rail. Optional privacy. Optional treasury yield. No lock-in.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button size="lg" asChild>
                <a href="#rails">
                  See the seven rails <ArrowRight />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href={BRAND.social.github} target="_blank" rel="noreferrer">
                  <Github /> Read the code
                </a>
              </Button>
            </div>
            <p className="mt-8 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Stripe + Wise for Indian founders — with a Solana rail ready for when you need it.
            </p>
          </div>

          <div className="relative">
            <Card className="bg-card/70 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-sm">
                    invoice · acme.dodorail.sol
                  </CardTitle>
                  <Badge variant="shipped">PAID</Badge>
                </div>
                <CardDescription>Acme Pro — monthly subscription</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-lg text-foreground">$49.00 USDC</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rail</span>
                  <span>USDC · Solana</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Private mode</span>
                  <span className="text-burnt">Umbra</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Settled in</span>
                  <span>1.2s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span>0.5%</span>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Tx</span>
                  <span className="truncate text-xs text-muted-foreground/80">
                    5J4…pZq (preview)
                  </span>
                </div>
              </CardContent>
            </Card>
            <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              mock receipt · live demo Day 10
            </p>
          </div>
        </div>
      </section>

      {/* --- Seven rails --- */}
      <section id="rails" className="border-b border-line/60">
        <div className="container py-16">
          <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge variant="outline" className="mb-4 font-mono text-[10px] uppercase tracking-widest">
                01 · The bundle
              </Badge>
              <h2 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                One product. Seven rails.
              </h2>
            </div>
            <p className="max-w-md text-muted-foreground">
              Every rail settles in USDC on Solana. Every rail is behind a feature flag. Every rail
              can be toggled per merchant, per invoice. Pick one. Pick all seven.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(RAILS) as RailId[]).map((key) => {
              const rail = RAILS[key];
              const status = RAIL_STATUS[key];
              return (
                <Card key={key} className="bg-card/50">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg">{rail.label}</CardTitle>
                      <Badge variant={statusVariant(status)} className="uppercase">
                        {status}
                      </Badge>
                    </div>
                    <CardDescription>{rail.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    <span>Settles in {rail.settlesIn}</span>
                    <span>Take {(rail.feeBps / 100).toFixed(2)}%</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* --- Value props --- */}
      <section className="border-b border-line/60">
        <div className="container py-14">
          <div className="grid gap-10 md:grid-cols-3">
            {VALUE_PROPS.map(({ icon: Icon, audience, headline, body }) => (
              <div key={audience} className="space-y-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-burnt/15 text-burnt">
                  <Icon className="size-5" />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {audience}
                </p>
                <h3 className="text-balance text-xl font-semibold leading-snug">{headline}</h3>
                <p className="text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Moat --- */}
      <section className="border-b border-line/60 bg-ink/40">
        <div className="container py-16">
          <div className="mb-14 max-w-2xl">
            <Badge variant="outline" className="mb-4 font-mono text-[10px] uppercase tracking-widest">
              02 · The moat
            </Badge>
            <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Why no one else ships this.
            </h2>
            <p className="mt-5 text-muted-foreground">
              Any single layer here could be copied in 3–6 months. Neutralising all five takes
              12–24 months — which is our window to ship 500 merchants and compound community,
              brand, and relationships faster than incumbents can pattern-match.
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {MOAT_LAYERS.map((layer) => (
              <div key={layer.n} className="group relative">
                <span className="wordmark text-5xl text-burnt/30 transition-colors group-hover:text-burnt/60">
                  {layer.n}
                </span>
                <h3 className="mt-2 text-xl font-semibold">{layer.title}</h3>
                <p className="mt-3 text-muted-foreground">{layer.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Integrations strip --- */}
      <section className="border-b border-line/60">
        <div className="container py-14">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-4 font-mono text-[10px] uppercase tracking-widest">
              03 · Built on the best of Solana
            </Badge>
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Eleven sponsors, one codebase.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Every integration ships as its own MIT-licensed package. Import whichever you need.
              Ignore the rest. No framework lock-in.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {SPONSOR_STRIP.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-start rounded-md border border-line/70 bg-card/40 px-4 py-3 transition-colors hover:border-burnt/60"
              >
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.note}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Status / build-in-public --- */}
      <section className="border-b border-line/60">
        <div className="container py-14">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <Badge variant="burnt" className="mb-4 font-mono text-[10px] uppercase tracking-widest">
                Building in public
              </Badge>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Day {DAY_OF} of {TOTAL_DAYS}.<br />Shipping every day until May 11.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Submitting to 11 side tracks of the Solana Frontier Hackathon. Every commit is
                public. Every integration is MIT-licensed. Follow along — or fork the code.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <a href={BRAND.social.xUrl} target="_blank" rel="noreferrer">
                    <Twitter /> Follow {BRAND.social.x}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={BRAND.social.github} target="_blank" rel="noreferrer">
                    <Github /> Star on GitHub
                  </a>
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-sm">Day-by-day status</CardTitle>
                <CardDescription>
                  Critical path (all green by Day 10) + stretch goals Day 11-22.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { t: "Foundation", d: "Days 1–6", icon: Wallet, status: "in progress" },
                  { t: "Core integrations", d: "Days 7–12", icon: Globe2, status: "upcoming" },
                  { t: "Stretch + Agent + Portal", d: "Days 13–18", icon: Bot, status: "upcoming" },
                  { t: "Polish + Submit", d: "Days 19–22", icon: Sparkles, status: "upcoming" },
                ].map(({ t, d, icon: Icon, status }) => (
                  <div key={t} className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t}</p>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {d}
                      </p>
                    </div>
                    <Badge
                      variant={status === "in progress" ? "burnt" : "outline"}
                      className="font-mono text-[10px] uppercase"
                    >
                      {status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* --- Compliance note --- */}
      <section className="border-b border-line/60">
        <div className="container py-10">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="size-6 text-burnt" />
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Compliance note
            </p>
            <p className="text-balance text-muted-foreground">
              Indian customers pay via card or UPI only. Crypto rails are never offered to
              India-issued cards. DodoRail mirrors Dodo Payments&apos; regional restrictions
              strictly — because winning the Indian founder&apos;s trust matters more than a
              rounding error in volume.
            </p>
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">
              <TrendingUp className="mr-1.5" /> RBI-aligned by design
            </Badge>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer>
        <div className="container py-12">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <span className="wordmark text-xl font-semibold">{BRAND.wordmark}</span>
              <p className="mt-3 text-sm text-muted-foreground">{BRAND.tagline}</p>
              <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Built by{" "}
                <a href={BRAND.social.github} className="underline hover:text-burnt">
                  @SUNDRAM07
                </a>{" "}
                for the Solana Frontier Hackathon · Colosseum 2026
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Product
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><a href="#rails" className="hover:text-burnt">Rails</a></li>
                  <li><Link href="/api/health" className="hover:text-burnt">Status</Link></li>
                  <li><span className="text-muted-foreground/60">Docs · coming Day 14</span></li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Channels
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><a href={BRAND.social.xUrl} className="hover:text-burnt">X · {BRAND.social.x}</a></li>
                  <li><a href={BRAND.social.telegramUrl} className="hover:text-burnt">Telegram · {BRAND.social.telegram}</a></li>
                  <li><a href={BRAND.social.github} className="hover:text-burnt">GitHub · open-source</a></li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Addresses
                </p>
                <ul className="mt-3 space-y-2 font-mono text-xs text-muted-foreground">
                  <li>{BRAND.sns.root}</li>
                  <li>{BRAND.sns.demoMerchant}</li>
                  <li>{BRAND.sns.treasury}</li>
                </ul>
              </div>
            </div>
          </div>

          <Separator className="my-10" />
          <div className="flex flex-col items-start justify-between gap-4 text-xs text-muted-foreground md:flex-row md:items-center">
            <p>© {new Date().getFullYear()} DodoRail · MIT-licensed integration packages, SDK, and Anchor program.</p>
            <p className="font-mono">
              build {process.env.NEXT_PUBLIC_BUILD_VERSION ?? "0.1.0"} ·{" "}
              {process.env.NEXT_PUBLIC_GIT_SHA?.slice(0, 7) ?? "dev"}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
