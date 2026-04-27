/**
 * Quick introspection on @umbra-privacy/sdk@4.0.0 — runs locally, prints
 * what the SDK actually exports so we can adapt the wrapper.
 *
 * Usage:
 *   pnpm --filter @dodorail/umbra exec tsx src/discover.ts
 *
 * Output goes to stdout — paste it into chat so I can see the real API.
 */

async function main() {
  const sdk = await import("@umbra-privacy/sdk");
  const keys = Object.keys(sdk).sort();

  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("@umbra-privacy/sdk top-level exports:");
  console.log("════════════════════════════════════════════════════════════════════════");
  for (const k of keys) {
    const v = (sdk as Record<string, unknown>)[k];
    const t = typeof v;
    if (t === "function") {
      const arity = (v as { length?: number }).length ?? "?";
      console.log(`  fn  ${k.padEnd(60)} (arity ${arity})`);
    } else if (t === "object" && v !== null) {
      const subKeys = Object.keys(v as object);
      console.log(`  obj ${k.padEnd(60)} keys=${subKeys.length}: ${subKeys.slice(0, 6).join(", ")}${subKeys.length > 6 ? ", ..." : ""}`);
    } else {
      console.log(`  ${t.padEnd(4)}${k.padEnd(60)} = ${String(v).slice(0, 40)}`);
    }
  }
  console.log("");
  console.log("Total exports:", keys.length);

  // Look for anything that smells like a client constructor / register / deposit.
  const likelyClient = keys.filter((k) =>
    /Client|create|register|deposit|withdraw|transfer|umbra/i.test(k),
  );
  console.log("");
  console.log("Names that look like the client surface we care about:");
  for (const k of likelyClient) console.log(`  - ${k}`);
}

main().catch((e) => {
  console.error("[discover] failed:", e);
  process.exit(1);
});
