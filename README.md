<div align="center">

# DodoRail

### the stablecoin rail for Indian founders selling globally

Stripe + Wise for Indian SaaS, AI, and digital-product founders who sell globally — with a Solana rail ready for when your customers or their agents want it.

[![License: MIT](https://img.shields.io/badge/License-MIT-E97F3B.svg)](./LICENSE)
[![Built for Solana Frontier](https://img.shields.io/badge/Solana-Frontier%20Hackathon-1A1A1A.svg)](https://colosseum.com/frontier)
[![Status: Day 16 of 22](https://img.shields.io/badge/Day-16%20of%2022-E97F3B.svg)](#timeline)
[![Treasury Agent: live](https://img.shields.io/badge/Treasury_Agent-live_on_GitHub_Actions-22c55e.svg)](https://github.com/SUNDRAM07/dodorail/actions/workflows/agent-cron.yml)

**[Live app](https://dodorail.vercel.app) · [Treasury Agent](./apps/agent) · [X](https://x.com/dodorail) · [Telegram](https://t.me/dodorail_io)**

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

### Integration status (as of Day 16)

| Integration | Status | Notes |
|---|---|---|
| Dodo Payments | ✅ live | Real per-invoice Product + Checkout Session via Dodo REST API; webhook signature-verified |
| Solana Pay / USDC | ✅ live | `@solana/pay` URL builder, Helius webhook fast-confirm, polling fallback |
| Custom HMAC session cookies | ✅ live | Better-Auth deferred permanently — Web Crypto HMAC + wallet sign-in works cleaner |
| Dune Analytics | ✅ live | Real Solana volume query + dashboard tile + public dashboard |
| GoldRush (Covalent) | ✅ live | BalanceService + TransactionService, multi-chain ready |
| SNS | ✅ live | Async enrichment, per-merchant subdomain resolution |
| Umbra | ✅ verified live on devnet | `depositPublicToEncrypted` round-trip with finalized tx sig (Day 14, post-faucet) |
| Cloak | ✅ wired live, mainnet-only | Browser-native Groth16 proofs + viewing-keys + compliance CSV |
| MagicBlock Private Payments | 🟡 architectural-only | Conditional — flips if API key arrives. Privacy-track synthesis essay submitted. |
| LP Agent | ✅ live | 9 endpoints integrated, Treasury Vault dashboard surface, daily Vercel cron |
| Ika | 🟡 architectural-only | Pre-alpha SDK with mock signer per Ika docs; flips live on Alpha 1 |
| x402 (inbound + outbound) | 🟡 placeholder | Day 18+ polish — wrapper scaffold present, full HTTP 402 flow deferred |
| Tether (USDT / USDT0 / XAUT0) | ✅ wired | LayerZero Transfer API mock-mode, mainnet-active for native USDT |
| LayerZero | 🟡 mock-mode | OFT Transfer API key request submitted but no approval; USDT0 stays mock |
| Zerion (Treasury Agent) | ✅ live in agent | Real `wallet/portfolio` HTTP API path, key in Vercel env |
| Squads delegated signer | ✅ scaffold shipped | Mock-mode-safe; live multisig flow Day 18+ |
| Anchor program | ✅ Day 4 devnet live, mainnet TBD Day 18 | 2 instructions, devnet program ID below |

**Live devnet program:** [`5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt`](https://explorer.solana.com/address/5jqD3PHpmaR1cHhdz4WNNPbiPmHPjg8rokxcZGCPhwqt?cluster=devnet) · Finalized 2026-04-22.

**Treasury Agent live:** [GitHub Actions cron](https://github.com/SUNDRAM07/dodorail/actions/workflows/agent-cron.yml) running every 5 min since Day 13. ~16 successful runs as of Day 16.

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

## Submission tracks (13 side tracks targeted, ~$94k pool + $20k Eitherway upside)

DodoRail (this monorepo) is submitted to:

- **Dodo Payments Merchant Hackathon** ($10k pool · 5/3/2)
- **100xDevs** ($10k · 10 places)
- **Dune Analytics** ($6k)
- **GoldRush / Covalent** ($3k) — all 3 of Prajin's architectural patterns shipped
- **Cloak Privacy Track** ($5k pool, mainnet-only privacy provider)
- **Privacy × MagicBlock Track Synthesis** ($5k) — three-provider plurality narrative
- **Umbra Side Track** ($5k) — verified live on devnet with real tx sigs
- **LP Agent API Side Track** ($900) — 9 endpoints integrated end-to-end
- **Encrypt × Ika Side Track** ($15k pool) — architectural-only on pre-alpha
- **Tether Frontier Track** ($10k) — full asset family (USDT + USDT0 + XAUT0)
- **Zerion CLI Autonomous Agent Track** ($5k) — Treasury Agent at `apps/agent/`

Companion build (separate platform):

- **Eitherway Build a Live dApp Track** ($20k pool) — companion landing built on `eitherway.ai/chat` (live preview at `https://preview.eitherway.ai/dd256074-…/`, iterations #2-#5 across Days 15-18)

Content submission:

- **Jupiter Not Your Regular Bounty** ($3k pool) — jupUSD-themed 5-tweet thread, drafted Day 16

---

## Timeline

| Phase | Days | Status | Goal |
|---|---|---|---|
| Foundation | 1-6 | ✅ shipped | Scaffold, auth, Dodo checkout E2E, Anchor skeleton on devnet, first USDC checkout |
| Core integrations | 7-12 | ✅ shipped | GoldRush, Dune, SNS, Umbra, LP Agent, Tether, Ika. All critical-path checkpoints green. |
| Stretch + Agent + Portal | 13-18 | 🟡 in progress (Day 16) | Treasury Agent (Day 13) ✓ · GoldRush v2 multi-chain (Day 15) ✓ · Squads delegated signer (Day 16) ✓ · Eitherway iterations (Days 14-18) · Jupiter thread (Day 16) ✓ |
| Polish + Submit | 19-22 | upcoming | UI polish, demo video, mainnet smoke tests if funded, 13 submissions filed by Day 21. |

Critical path (all green since Day 10): Dodo E2E · Solana Pay E2E · Merchant dashboard with real Postgres data · SNS resolution at checkout · Live URL judges can click.

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
