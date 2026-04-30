#!/usr/bin/env node
/**
 * DodoRail Treasury Agent — entrypoint.
 *
 * Two modes:
 *   --once    Run the agent loop a single time and exit. Used by GitHub
 *             Actions cron and by the demo recording.
 *   --daemon  Run the loop on a node-cron schedule (every 5 minutes by
 *             default; override with DODORAIL_AGENT_CRON). Used for the
 *             "always on" Fly.io / VM deployment in polish week.
 *
 * Default if neither flag is passed: --once.
 */

import { runAgentLoop } from "./agent-loop.js";

const argv = process.argv.slice(2);
const wantDaemon = argv.includes("--daemon");
const wantOnce = argv.includes("--once") || (!wantDaemon);

async function once(): Promise<number> {
  try {
    const result = await runAgentLoop();
    // GitHub Actions' log-grouping picks up the JSON line — useful for run
    // history reviews.
    console.log("[agent:summary]", JSON.stringify({
      startedAt: result.startedAt,
      durationMs: result.durationMs,
      merchantsConsidered: result.merchantsConsidered,
      acted: result.results.reduce<Record<string, number>>((acc, r) => {
        acc[r.acted] = (acc[r.acted] ?? 0) + 1;
        return acc;
      }, {}),
    }));
    return 0;
  } catch (err) {
    console.error("[agent] fatal:", err);
    return 1;
  }
}

async function daemon(): Promise<void> {
  // Dynamic import so node-cron isn't loaded for the --once / GitHub Actions
  // path (smaller startup cost, no Redis needed).
  const cron = await import("node-cron").then((m) => m.default ?? m);
  const schedule = process.env.DODORAIL_AGENT_CRON ?? "*/5 * * * *";
  console.log(`[agent] daemon mode — schedule: ${schedule}`);
  cron.schedule(schedule, () => {
    runAgentLoop().catch((err) => console.error("[agent] tick failed:", err));
  });
  // Run once immediately so we don't wait for the first cron tick.
  await runAgentLoop().catch((err) => console.error("[agent] initial tick failed:", err));
  // Keep the process alive — node-cron handles its own loop, we just need
  // to not exit.
  await new Promise(() => undefined);
}

if (wantDaemon) {
  daemon().catch((err) => {
    console.error("[agent] daemon fatal:", err);
    process.exit(1);
  });
} else if (wantOnce) {
  once().then((code) => process.exit(code));
}
