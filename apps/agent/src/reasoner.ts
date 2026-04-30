/**
 * Pluggable LLM reasoner — the brain of the Treasury Agent.
 *
 * Three backends, picked at construction time:
 *   - mock      — deterministic decision tree, no network calls. Default.
 *   - gemini    — Google AI Studio Gemini 2.5 Flash via REST. Free tier
 *                 (1,500 req/day). Uses dynamic import so the agent has no
 *                 hard runtime dep on Google SDKs in mock mode.
 *   - anthropic — Claude via REST. Premium tier — only flip on if you've
 *                 budgeted spend (Day 17 demo recording).
 *
 * Why pluggable: per the founder's call on Day 13, locking the agent to a
 * single LLM vendor early would be expensive. The judging criteria for the
 * Zerion track care that an LLM is in the loop and its reasoning is
 * inspectable — they don't care WHICH LLM. Keeping this abstract lets us
 * flip providers based on cost / latency / availability the day of the demo.
 *
 * Decision shape: the reasoner returns a typed Decision the rest of the
 * agent acts on. It deliberately does NOT return free-form text — the
 * actions layer can't usefully execute "consider rebalancing soon."
 */

import type { WalletAnalysis } from "./adapters/zerion";

export type ReasonerProvider = "mock" | "gemini" | "anthropic";

export type AgentAction = "alert" | "zap-in" | "wait";

export interface AgentDecision {
  action: AgentAction;
  /** Human-readable explanation. Logged to the Event table — auditors and
   * judges can read why the agent did what it did. */
  reason: string;
  /** Optional fields the actions layer reads when acting. */
  alertSeverity?: "info" | "warn";
  /** When zap-in: how much to deploy (cents). Capped at idle - threshold. */
  zapInAmountUsdcCents?: number;
}

export interface ReasonerInput {
  merchantId: string;
  merchantName: string;
  thresholdCents: number;
  selectedPoolLabel: string;
  walletAnalysis: WalletAnalysis;
  /** Whether the merchant has had a YIELD_ZAP_IN in the recent dedup window —
   * lets the LLM not suggest zap-in when one already happened. */
  recentZapAlready: boolean;
  /** Whether incoming USDC > $1000 in the last hour — the "alert this" trigger. */
  largeIncomingThisHour: boolean;
}

export interface Reasoner {
  readonly provider: ReasonerProvider;
  decide(input: ReasonerInput): Promise<AgentDecision>;
}

// --- Mock reasoner -------------------------------------------------------

/** Deterministic decision tree. The actual values mirror what a competent
 * LLM would conclude given the same input. Used as both the default mode
 * AND the prompt-engineering anchor for the live providers — the live
 * prompt asks them to reach the same conclusion shape. */
function mockDecide(input: ReasonerInput): AgentDecision {
  const { walletAnalysis, thresholdCents, selectedPoolLabel, recentZapAlready, largeIncomingThisHour } = input;

  if (largeIncomingThisHour) {
    return {
      action: "alert",
      alertSeverity: "info",
      reason: `Large incoming activity in the last hour — totalling > $1,000 — flagging for the merchant to acknowledge before the next sweep cycle.`,
    };
  }

  // Significant negative PnL → also alert
  if (walletAnalysis.pnl24hUsd < -50) {
    return {
      action: "alert",
      alertSeverity: "warn",
      reason: `24h PnL of $${walletAnalysis.pnl24hUsd.toFixed(2)} on the watched wallet — flagging for review.`,
    };
  }

  // Idle-treasury zap-in path
  if (
    !recentZapAlready &&
    walletAnalysis.idleUsdcCents > thresholdCents
  ) {
    const excess = walletAnalysis.idleUsdcCents - thresholdCents;
    return {
      action: "zap-in",
      reason: `Idle USDC of $${(walletAnalysis.idleUsdcCents / 100).toFixed(2)} exceeds threshold of $${(thresholdCents / 100).toFixed(2)} — deploying excess into ${selectedPoolLabel}.`,
      zapInAmountUsdcCents: excess,
    };
  }

  if (recentZapAlready) {
    return {
      action: "wait",
      reason: `Recent zap-in already covered today's deployment window — holding for next cycle.`,
    };
  }

  return {
    action: "wait",
    reason: `Idle USDC ($${(walletAnalysis.idleUsdcCents / 100).toFixed(2)}) below threshold ($${(thresholdCents / 100).toFixed(2)}) — no action needed.`,
  };
}

// --- Live providers (Gemini + Anthropic) shared prompt scaffold ----------

function buildPrompt(input: ReasonerInput): string {
  return [
    "You are the autonomous treasury operator for a SaaS payment-rail merchant on Solana. Your job is to look at the merchant's wallet portfolio JSON below, plus their treasury config, and decide one of THREE actions:",
    "",
    `  - "alert": notify the merchant on Telegram. Use this when something noteworthy happened — large incoming USDC, large PnL swing, suspicious counterparty pattern.`,
    `  - "zap-in": deploy excess idle USDC above threshold into the merchant's selected Meteora DLMM pool. Use this when idle USDC is comfortably above threshold AND no zap-in already happened in the last 23h.`,
    `  - "wait": do nothing this cycle. Use this when the wallet looks normal and there's nothing actionable.`,
    "",
    "OUTPUT: return STRICTLY a single JSON object on one line, with shape:",
    `  {"action":"alert"|"zap-in"|"wait", "reason":"...", "alertSeverity"?:"info"|"warn", "zapInAmountUsdcCents"?:number}`,
    "",
    "Do NOT include any text outside the JSON object. Do NOT wrap in markdown code fences.",
    "",
    `MERCHANT: ${input.merchantName} (id: ${input.merchantId})`,
    `THRESHOLD: $${(input.thresholdCents / 100).toFixed(2)} of USDC must remain liquid for refunds + spends.`,
    `SELECTED POOL: ${input.selectedPoolLabel}`,
    `RECENT ZAP-IN ALREADY (last 23h): ${input.recentZapAlready ? "yes" : "no"}`,
    `LARGE INCOMING THIS HOUR (>$1k): ${input.largeIncomingThisHour ? "yes" : "no"}`,
    "",
    "WALLET PORTFOLIO JSON:",
    JSON.stringify(input.walletAnalysis, null, 2),
  ].join("\n");
}

function parseDecisionJson(raw: string): AgentDecision {
  // Tolerate model output with surrounding whitespace or fence markers.
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Find the first JSON object even if there's prose before/after.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(jsonText) as AgentDecision;
  if (!["alert", "zap-in", "wait"].includes(parsed.action)) {
    throw new Error(`reasoner returned invalid action: ${parsed.action}`);
  }
  if (typeof parsed.reason !== "string" || !parsed.reason) {
    throw new Error("reasoner returned empty reason");
  }
  return parsed;
}

// --- Gemini provider -----------------------------------------------------

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";

async function geminiDecide(
  input: ReasonerInput,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<AgentDecision> {
  const prompt = buildPrompt(input);
  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2, // mostly deterministic, nudge for slight variance
        responseMimeType: "application/json",
        maxOutputTokens: 400,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[reasoner.gemini] HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("[reasoner.gemini] empty response");
  return parseDecisionJson(text);
}

// --- Anthropic provider --------------------------------------------------

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

async function anthropicDecide(
  input: ReasonerInput,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<AgentDecision> {
  const prompt = buildPrompt(input);
  const res = await fetchImpl(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[reasoner.anthropic] HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text) throw new Error("[reasoner.anthropic] empty response");
  return parseDecisionJson(text);
}

// --- Factory -------------------------------------------------------------

export function createReasoner(opts?: {
  provider?: ReasonerProvider;
  fetchImpl?: typeof fetch;
}): Reasoner {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const explicit = opts?.provider;
  const env = process.env.DODORAIL_AGENT_REASONER as ReasonerProvider | undefined;
  // Resolution: explicit override > env var > auto (gemini if key set,
  // anthropic if its key set, else mock).
  const provider: ReasonerProvider =
    explicit ??
    env ??
    (process.env.DODORAIL_GEMINI_KEY
      ? "gemini"
      : process.env.DODORAIL_ANTHROPIC_KEY
        ? "anthropic"
        : "mock");

  async function decide(input: ReasonerInput): Promise<AgentDecision> {
    if (provider === "mock") return mockDecide(input);
    if (provider === "gemini") {
      const key = process.env.DODORAIL_GEMINI_KEY;
      if (!key) throw new Error("[reasoner] gemini provider needs DODORAIL_GEMINI_KEY");
      try {
        return await geminiDecide(input, key, fetchImpl);
      } catch (err) {
        // Fall back to mock on transient LLM errors. Logging makes the
        // failure visible without taking the agent down — the loop continues.
        console.warn("[reasoner.gemini] failed; falling back to mock:", err);
        return mockDecide(input);
      }
    }
    // anthropic
    const key = process.env.DODORAIL_ANTHROPIC_KEY;
    if (!key) throw new Error("[reasoner] anthropic provider needs DODORAIL_ANTHROPIC_KEY");
    try {
      return await anthropicDecide(input, key, fetchImpl);
    } catch (err) {
      console.warn("[reasoner.anthropic] failed; falling back to mock:", err);
      return mockDecide(input);
    }
  }

  return { provider, decide };
}
