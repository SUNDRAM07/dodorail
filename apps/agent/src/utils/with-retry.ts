/**
 * Transient-retry wrapper for Prisma calls that hit Neon's pooled compute.
 *
 * Why this exists:
 *   Neon's free-tier compute auto-suspends after ~5 min of inactivity. When a
 *   query arrives at a suspended compute the *first* socket connection
 *   sometimes fails during the wake-up window even though subsequent attempts
 *   succeed. This was observed in Treasury Agent run #29 (2026-05-01 04:59 UTC):
 *   a single transient `Can't reach database server at ...neon.tech:5432`
 *   between two successful runs (#28 and #30).
 *
 *   The cost wasn't the missed cycle — the next cron run recovered. The cost
 *   was a permanent red X in our public GitHub Actions history that judges
 *   can click into. This helper makes that class of failure invisible.
 *
 * What it catches:
 *   PrismaClientInitializationError + Prisma error code P1001 (database server
 *   unreachable) + ETIMEDOUT / ECONNRESET / ENOTFOUND / EAI_AGAIN raw errors.
 *
 * What it does NOT catch:
 *   Constraint violations, schema errors, query syntax errors, anything else
 *   that's a real bug. Those throw on the first attempt.
 *
 * Cadence: 3 attempts, exponential backoff 1s → 2s → 4s. Total worst-case
 * delay ~7s before the call surfaces a real failure.
 */

const TRANSIENT_ERROR_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timeout
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

const TRANSIENT_ERROR_MESSAGES = [
  "can't reach database server",
  "connection terminated",
  "connection refused",
  "socket hang up",
  "client has encountered a connection error",
];

function isTransientError(err: unknown): boolean {
  if (!err) return false;

  // Prisma's PrismaClientInitializationError is the exact class we hit.
  // We match by name rather than instanceof to avoid importing the runtime
  // class (which would couple this helper to Prisma's internal layout).
  const errorName =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (errorName === "PrismaClientInitializationError") return true;
  if (errorName === "PrismaClientRustPanicError") return true;

  const errorCode =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (TRANSIENT_ERROR_CODES.has(errorCode)) return true;

  const message =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === "string"
        ? err.toLowerCase()
        : "";
  return TRANSIENT_ERROR_MESSAGES.some((needle) => message.includes(needle));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WithRetryOptions {
  /** Max number of attempts (including the first). Default 3. */
  attempts?: number;
  /** Base backoff in ms; doubled each attempt. Default 1000. */
  baseDelayMs?: number;
  /** Optional label for log lines. Default "db-call". */
  label?: string;
}

/**
 * Wrap an async callable in transient-retry. Non-transient errors throw on
 * the first attempt; transient errors retry with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const label = options.label ?? "db-call";

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err)) {
        // Real bug — surface immediately.
        throw err;
      }
      if (attempt === attempts) {
        // Out of retries; surface the transient with context.
        console.warn(
          `[with-retry] ${label} exhausted ${attempts} attempts on transient error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw err;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[with-retry] ${label} attempt ${attempt}/${attempts} hit transient error; retrying in ${backoff}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await sleep(backoff);
    }
  }
  // Unreachable, but TS wants it.
  throw lastErr;
}
