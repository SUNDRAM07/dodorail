import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight liveness probe. Returns build metadata + per-integration
 * status stubs. Real integration healthchecks will fan out from here as
 * each package lands (Day 4+).
 *
 * Plan: status.dodorail.xyz aggregates these into a public uptime board.
 */
export async function GET() {
  const started = Date.now();

  const integrations = {
    dodo: { status: "mock", iteration: 1 },
    dune: { status: "placeholder", iteration: 0 },
    goldrush: { status: "placeholder", iteration: 0 },
    umbra: { status: "placeholder", iteration: 0 },
    magicblock: { status: "placeholder", iteration: 0 },
    sns: { status: "placeholder", iteration: 0 },
    ika: { status: "architectural", iteration: 0 },
    lpagent: { status: "placeholder", iteration: 0 },
    x402: { status: "placeholder", iteration: 0 },
  } as const;

  return NextResponse.json(
    {
      ok: true,
      service: "dodorail-web",
      version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? "0.1.0",
      gitSha: process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      integrations,
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
