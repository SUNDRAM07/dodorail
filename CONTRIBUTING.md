# Contributing to DodoRail

Thanks for looking. DodoRail was built during the Solana Frontier Hackathon (April–May 2026). The integration packages, the `@dodorail/sdk`, and the Anchor program are MIT-licensed — fork, modify, and build on them freely. The merchant dashboard product (`apps/web`) and brand assets are not licensed for commercial redistribution.

## Quickstart

Requires Node 22+, pnpm 10+, a Neon Postgres `DATABASE_URL`, and (for Anchor work) Rust 1.85 + Solana CLI 3.x + Anchor 0.32.

```bash
git clone https://github.com/SUNDRAM07/dodorail.git
cd dodorail
cp .env.example .env       # fill in DATABASE_URL + DODORAIL_SESSION_SECRET
pnpm install
pnpm db:generate
pnpm db:push               # apply schema to your Neon
pnpm db:seed               # insert demo merchant
pnpm dev                   # http://localhost:3000
```

## Where things live

```
apps/web                   Next.js 15 — merchant dashboard + /pay/[invoiceId]
programs/dodorail          Anchor 0.32 program (2 instructions)
packages/db                Prisma schema + generated client
packages/sdk               Brand tokens + rail definitions (shared with agent)
packages/ui                Shared UI primitives (minimal today)
packages/integrations/*    One package per sponsor SDK
tests                      Anchor program tests
```

## The integration isolation rule

This is the single most important rule in the repo. Every sponsor SDK (Dodo, Dune, GoldRush, Umbra, MagicBlock, SNS, Ika, LP Agent, x402) lives in its own package under `packages/integrations/`. Each one exports a factory returning a client with the same shape:

- `initialise()` — async warm-up
- per-integration operations
- `healthcheck()` — async liveness probe
- `featureFlag` — readonly runtime flag
- a **mock mode** toggled via env var — mandatory for every integration

**Integrations must not import each other.** If you need to compose two (e.g. SNS + MagicBlock), do it in `apps/web`, not inside an integration package. This lets us kill any integration at runtime by flipping a DB flag, without a deploy.

## How to add or evolve an integration

1. If you are adding a new one: create `packages/integrations/<name>/` following the shape of `packages/integrations/dodo/`.
2. Wire the factory through `apps/web` only where it's used — never in shared code.
3. Add vitest unit tests against mock mode at minimum. Real-API tests live behind an env flag.
4. Update `/api/health` to surface the integration's status.
5. MIT-license the package (`LICENSE` file in the package root).

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(web): add invoice list pagination`
- `fix(dodo): verify webhook signature before JSON parse`
- `chore(deps): bump next to 15.2`
- `docs(readme): add Singapore Neon setup note`

## Bug reports

Open a GitHub issue with:
1. Steps to reproduce
2. Expected vs actual behaviour
3. Environment (Node version, pnpm version, browser, Solana cluster)
4. Relevant logs from `/api/health` + Sentry (Day 3+)

## Security

If you find a security issue that might affect merchant funds or customer data, do not open a public issue. Email **hi@dodorail.xyz** directly (once the domain is live) or DM **@dodorail** on X with the subject "SECURITY".

## Code of conduct

Be kind. See `CODE_OF_CONDUCT.md`.
