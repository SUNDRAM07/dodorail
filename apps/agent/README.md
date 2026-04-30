# DodoRail Treasury Agent

> An autonomous Node.js agent that watches DodoRail merchant wallets via the Zerion CLI, reasons over portfolio state with an LLM, and takes onchain action — Telegram alerts and LP Agent zap-ins.
>
> Submitted to the Solana Frontier Hackathon **Zerion CLI Autonomous Agent** side-track.

## What it is

For every merchant on DodoRail with `yieldEnabled = true` and a non-null `telegramChatId`, the agent runs an **Observe → Think → Act** loop on a 5-minute schedule:

1. **Observe** — `getWalletAnalysis(merchant.solanaWalletAddress)` calls Zerion's portfolio data layer (CLI subprocess in the dev path; HTTP API direct in production; will switch to x402-on-Solana for keyless self-funded calls in a follow-up). Returns balance, recent transfers, and PnL.
2. **Think** — `reasoner.complete(prompt)` runs the JSON through a pluggable LLM backend (`mock` for local dev, `gemini` for free-tier production, `anthropic` for premium). Returns a typed decision: `{action: "alert" | "zap-in" | "wait", reason: string}`.
3. **Act** — If `alert`: pings the merchant's Telegram. If `zap-in`: calls `executeZapIn` (same Day-11 path the dashboard "Deploy now" button uses). If `wait`: writes nothing.

Every action is gated by an idempotency check against the shared `Event` table — no double sweeps, no duplicate alerts.

## Why a separate workspace?

The Zerion track explicitly asks for an **autonomous agent**, not a product feature. Per file 20 (Architecture Masterplan) §4: "ships as a separate codebase with its own deployment." We chose to keep it inside the monorepo as `apps/agent/` to share `@dodorail/db` + `@dodorail/sdk` + `@dodorail/lpagent` via workspace deps rather than git deps — same isolation contract, lower friction. Polish-week extract to a standalone GitHub repo is a 30-minute job if we want it.

## How to run

### Local (mock mode — no API keys needed)

```bash
cd apps/agent
pnpm tsx src/index.ts --once
```

Mock mode populates a synthetic merchant + portfolio so you can see the loop fire without setting up Zerion / Gemini / Telegram.

### Local (live mode)

```bash
export DODORAIL_ZERION_KEY="zk_dev_xxx"           # from developers.zerion.io
export DODORAIL_GEMINI_KEY="..."                  # from aistudio.google.com (free)
export DODORAIL_TELEGRAM_BOT_TOKEN="..."          # from @BotFather
export DATABASE_URL="postgres://..."              # same Neon URL the web app uses
pnpm tsx src/index.ts --once
```

### Production (GitHub Actions cron)

`.github/workflows/agent-cron.yml` runs `pnpm --filter @dodorail/agent run once` every 5 minutes. Free on public repos, ~1,440 min/month on private (well under the 2,000 min Hobby cap).

## Layout

```
apps/agent/
├── src/
│   ├── index.ts             # Entrypoint — --once vs --daemon
│   ├── agent-loop.ts        # Observe → Think → Act
│   ├── adapters/
│   │   ├── zerion.ts        # Zerion CLI / HTTP wrapper
│   │   └── (zerion-x402.ts  # Day 16 polish — x402-on-Solana flip)
│   ├── reasoner.ts          # Pluggable LLM (mock / gemini / anthropic)
│   ├── notifier.ts          # Telegram via raw fetch
│   └── actions/
│       ├── alert.ts         # Telegram alert action
│       └── zap-in.ts        # LP Agent zap-in action (reuses Day-11 executeZapIn)
├── package.json
├── tsconfig.json
└── README.md
```

## Env vars

| Var | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes (live) | Neon Postgres URL — read-mostly |
| `DODORAIL_ZERION_KEY` | mock OK without | Zerion API key from developers.zerion.io |
| `DODORAIL_GEMINI_KEY` | mock OK without | Google AI Studio key — Gemini 2.5 Flash, free tier 1,500 req/day |
| `DODORAIL_ANTHROPIC_KEY` | mock OK without | Anthropic key — premium reasoning, optional |
| `DODORAIL_TELEGRAM_BOT_TOKEN` | mock OK without | Telegram bot from @BotFather |
| `DODORAIL_AGENT_REASONER` | optional | `mock` (default) \| `gemini` \| `anthropic` |
| `DODORAIL_AGENT_LIVE_TX` | optional | `true` to actually call `executeZapIn` against the DB; defaults to `false` (dry-run) |

Mock mode is fully self-contained. The agent runs end-to-end with zero env vars set — useful for the demo recording.

## License

MIT, same as the rest of DodoRail.
