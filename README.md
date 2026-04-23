<div align="center">

# DodoRail

### the stablecoin rail for Indian founders selling globally

Stripe + Wise for Indian SaaS, AI, and digital-product founders who sell globally — with a Solana rail ready for when your customers or their agents want it.

[![License: MIT](https://img.shields.io/badge/License-MIT-E97F3B.svg)](./LICENSE)
[![Built for Solana Frontier](https://img.shields.io/badge/Solana-Frontier%20Hackathon-1A1A1A.svg)](https://arena.colosseum.org/)
[![Status: Day 1 of 22](https://img.shields.io/badge/Day-1%20of%2022-E97F3B.svg)](#timeline)

**[Live app](#) · [Docs](#) · [X](https://x.com/dodorail) · [Telegram](https://t.me/dodorail_io)**

</div>

---

## The pitch in one sentence

DodoRail is a stablecoin-native payments rail for Indian founders selling globally. It accepts cards + UPI (via Dodo Payments as Merchant-of-Record), native USDC on Solana, native BTC/ETH via Ika dWallets (bridgeless), and autonomous-agent payments via x402 — settling in USDC on Solana with optional privacy via Umbra or MagicBlock, a Dune + GoldRush analytics layer, and idle-treasury yield via LP Agent.

## The wedge

No competitor ships the bundle we ship. Stripe needs Atlas. Razorpay doesn't do USDC. Paddle isn't Indian. Helio is crypto-only. DodoRail is the first product to combine **India-native setup + MoR + native stablecoin rail + privacy + treasury yield + agent-payments + SNS branding** as one experience.

## The five-layer moat

1. **The bundle itself** — seven capabilities no single competitor has
2. **India vertical depth** — GSTIN, GST invoices, TDS, UPI-first, Hindi-first (v2-v3)
3. **Stablecoin-native treasury** — merchants earn yield on their float; custodial incumbents structurally can't match
4. **Privacy-compliance synthesis** — Umbra viewing keys + MagicBlock TDX attestation for B2B enterprise merchants
5. **Agent-ready via x402** — timing bet on the 2026-2027 agent-economy acceleration

---

## Architecture at a glance

```
dodorail/                            (this repo — Turborepo monorepo)
├── apps/
│   ├── web/                         Next.js 15 — merchant dashboard + customer checkout
│   └── docs/                        Mintlify docs at docs.dodorail.xyz
├── programs/
│   └── dodorail/                    Anchor program (2 instructions: create_invoice + settle_invoice)
├── packages/
│   ├── db/                          Prisma schema + client (Postgres on Neon)
│   ├── sdk/                         Shared TS types + Solana helpers + brand tokens
│   ├── ui/                          Shared shadcn components + brand theme
│   └── integrations/
│       ├── dodo/                    Dodo Payments (card + UPI via MoR)
│       ├── dune/                    Dune SQL + Sim API + MCP
│       ├── goldrush/                GoldRush REST + Streaming (Covalent)
│       ├── umbra/                   Umbra SDK (primary private-mode)
│       ├── magicblock/              MagicBlock Private Payments API (TDX attestation)
│       ├── sns/                     Solana Name Service
│       ├── ika/                     Ika dWallets (architectural — mock signer)
│       ├── lpagent/                 LP Agent (idle-treasury yield via Meteora)
│       └── x402/                    x402-on-Solana (inbound + outbound)

dodorail-agent/                      (separate repo — Day 13-14)
                                     Keyless, self-funded treasury agent for every merchant
```

### Integration status

| Integration | Status | Notes |
|---|---|---|
| Dodo Payments | Placeholder — Day 1 scaffold | Factory + mock mode shipped. Live mode Day 4-5. |
| Solana Pay / USDC | Day 4-5 | `@solana/pay` + Wallet Adapter |
| Better-Auth + Solana wallet | Day 4 | Dodo's Better-Auth adapter |
| Dune | Day 7-10 | Historical charts + public dashboard |
| GoldRush (Covalent) | Day 7-10 | Live balance tiles + activity feed |
| SNS | Day 7-8 | Per-merchant subdomains |
| Umbra | Day 11-12 | Primary private-mode provider |
| MagicBlock Private Payments | Day 10 conditional | Ship if API key approved by Day 10 |
| LP Agent | Day 11-12 | Powers idle-treasury yield |
| Ika | Architectural only | Pre-alpha — mock signer, UI + essay |
| x402 (inbound + outbound) | Day 13-14 | Merchant API returns 402; agent pays Zerion via x402 |
| Anchor program | ✅ Day 4 devnet live, Day 10 mainnet | 2 instructions, Squads multisig upgrade authority |

**Live devnet program:** [`5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt`](https://explorer.solana.com/address/5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt?cluster=devnet) · Finalized 2026-04-22.

### Integration isolation rule

Every integration lives in its own package. Each exports a factory returning a client with a standard shape: `initialise()`, operations, `healthcheck()`, `featureFlag` property, and a mock mode toggled by env var. Integrations **do not import each other**. Feature flags in the DB let us kill any integration at runtime without a deploy. This is the single most important architectural decision in the repo.

---

## Tech stack (locked)

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Frontend | Next.js 15 App Router |
| UI | Tailwind + shadcn/ui + Dodo Billing SDK |
| Auth | Better-Auth with Dodo adapter |
| Database | Postgres on Neon |
| ORM | Prisma |
| Solana RPC | Helius primary, QuickNode fallback |
| Program | Anchor 0.32 + Rust 1.85 |
| Wallets | Solana Wallet Adapter |
| Payment URL | `@solana/pay` |
| Monorepo | Turborepo + pnpm workspaces |
| Jobs / cron | Inngest |
| Hosting — web | Vercel |
| Hosting — agent | Fly.io |
| Hosting — program | Solana mainnet-beta from Day 5 |
| Observability | Sentry + Posthog + Axiom |
| LLM | Anthropic Claude |
| Email | Resend |
| Multisig | Squads Protocol |

---

## Quickstart (local dev)

Requires Node 22+, pnpm 10+, and a Neon `DATABASE_URL`.

```bash
git clone https://github.com/SUNDRAM07/dodorail.git
cd dodorail
pnpm install
cp .env.example .env        # fill in DATABASE_URL and any integration keys
pnpm db:generate            # generate Prisma client
pnpm db:migrate             # apply schema to Neon
pnpm db:seed                # insert demo merchant (acme.dodorail.sol)
pnpm dev                    # start Next.js at localhost:3000
```

All integration packages default to **mock mode** — you can build against them without any sponsor API keys.

---

## Submission tracks (11 side tracks)

DodoRail (this monorepo) is submitted to:

- **Dodo Payments Merchant Hackathon** ($10k)
- **100xDevs** ($10k)
- **Dune Analytics** ($6k)
- **GoldRush / Covalent** ($3k)
- **Privacy × MagicBlock** ($5k)
- **Umbra Side Track** ($10k)
- **LP Agent API Side Track** ($900)
- **Encrypt × Ika** ($15k) — architectural submission

Separate repos submitted to:

- **Zerion CLI Agent Track** — [`dodorail-agent`](https://github.com/SUNDRAM07/dodorail-agent) (Day 13-14)
- **Eitherway Multi-Sponsor** ($20k) — portal built on Eitherway's platform (Day 15)

Content submission:

- **Jupiter Not Your Regular Bounty** — jupUSD-themed X thread in Week 3

---

## Timeline

| Phase | Days | Goal |
|---|---|---|
| Foundation | 1-6 (Apr 20 – 25) | Scaffold, auth, Dodo checkout E2E, Anchor skeleton on devnet, first USDC checkout |
| Core integrations | 7-12 (Apr 26 – May 1) | GoldRush, Dune, SNS, Umbra, LP Agent. Program on mainnet. All 5 critical-path checkpoints green. |
| Stretch + Agent + Portal | 13-18 (May 2 – 7) | Ika mock-signer demo, MagicBlock conditional, x402, Treasury Agent, Eitherway portal, Jupiter thread. **No new integrations after Day 18.** |
| Polish + Submit | 19-22 (May 8 – 11) | UI polish, demo video Day 20, all 11 submissions filed by Day 21. |

Critical path (must all be green by Day 10): Dodo E2E · Solana Pay E2E · Merchant dashboard with real Postgres data · SNS resolution at checkout · Live URL judges can click.

---

## Open-source commitment

Every integration package, the SDK, and the Anchor program are **MIT-licensed**. The merchant dashboard product and brand stay proprietary. This is Anthropic's model: open protocol, proprietary product. It qualifies DodoRail for the Colosseum Public Goods Award and gives the Solana ecosystem a reason to amplify us.

---

## Acknowledgements

Built for the **Solana Frontier Hackathon** (Colosseum, April 6 – May 11, 2026) by **[Sundaram Mahajan](https://github.com/SUNDRAM07)**.

Sponsors studied and tagged at: @dodopayments, @SuperteamIN, @kirat_tw, @magicblock, @Dune, @covalent_hq, @zerion, @JupiterExchange, @eitherwayai, @UmbraPrivacy, LP Agent.

---

## License

[MIT](./LICENSE). The integration packages, SDK, and Anchor program are covered by this license. The merchant-dashboard product (`apps/web`) and brand assets are **not licensed for commercial redistribution** — see individual package licenses where they diverge.
