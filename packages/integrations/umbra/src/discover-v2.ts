/**
 * Probe the v4 SDK's calling convention. We try invoking the key entry
 * points in different shapes and capture the error messages, since errors
 * are the cheapest path to "what does this function actually want."
 */

async function tryCall(
  label: string,
  fn: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    const result = await fn();
    if (result === undefined) {
      console.log(`  ${label}: returned undefined`);
    } else {
      const summary =
        typeof result === "object" && result !== null
          ? `keys=${Object.keys(result as object).slice(0, 8).join(",")}`
          : typeof result;
      console.log(`  ${label}: OK (${summary})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${label}: ERR ${msg.slice(0, 200)}`);
  }
}

async function main() {
  const sdk = await import("@umbra-privacy/sdk");

  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("Probing v4 SDK calling conventions");
  console.log("════════════════════════════════════════════════════════════════════════");

  const fakeKey = new Uint8Array(32).fill(7);
  const longKey = new Uint8Array(64).fill(7);

  console.log("\n[A] createSignerFromPrivateKeyBytes:");
  await tryCall("(no args)", () => (sdk as { createSignerFromPrivateKeyBytes: (...a: unknown[]) => unknown }).createSignerFromPrivateKeyBytes());
  await tryCall("(32-byte zeros)", () => (sdk as { createSignerFromPrivateKeyBytes: (a: Uint8Array) => unknown }).createSignerFromPrivateKeyBytes(fakeKey));
  await tryCall("(64-byte zeros)", () => (sdk as { createSignerFromPrivateKeyBytes: (a: Uint8Array) => unknown }).createSignerFromPrivateKeyBytes(longKey));

  console.log("\n[B] createInMemorySigner:");
  await tryCall("()", () => (sdk as { createInMemorySigner: (...a: unknown[]) => unknown }).createInMemorySigner());

  console.log("\n[C] getUmbraClient (arity 2):");
  await tryCall("()", () => (sdk as { getUmbraClient: (...a: unknown[]) => unknown }).getUmbraClient());
  await tryCall("({})", () => (sdk as { getUmbraClient: (...a: unknown[]) => unknown }).getUmbraClient({}));
  await tryCall("({}, {})", () => (sdk as { getUmbraClient: (...a: unknown[]) => unknown }).getUmbraClient({}, {}));
  await tryCall("(rpcStr, signer)", () =>
    (sdk as { getUmbraClient: (...a: unknown[]) => unknown }).getUmbraClient(
      "https://api.devnet.solana.com",
      { dummy: 1 },
    ),
  );

  console.log("\n[D] getUmbraRelayer (arity 2):");
  await tryCall("()", () => (sdk as { getUmbraRelayer: (...a: unknown[]) => unknown }).getUmbraRelayer());

  // Trying to print the function source — Node sometimes preserves the param names
  console.log("\n[E] Function .toString() source (first 300 chars):");
  const inspectFns = ["getUmbraClient", "getUmbraRelayer", "createSignerFromPrivateKeyBytes", "getUserRegistrationFunction"];
  for (const name of inspectFns) {
    const fn = (sdk as Record<string, unknown>)[name];
    if (typeof fn === "function") {
      const src = (fn as { toString: () => string }).toString().replace(/\s+/g, " ");
      console.log(`  ${name}:\n    ${src.slice(0, 300)}`);
    }
  }
}

main().catch((e) => {
  console.error("[discover-v2] failed:", e);
  process.exit(1);
});
