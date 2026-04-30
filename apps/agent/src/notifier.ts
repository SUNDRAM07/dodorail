/**
 * Telegram notifier — minimal raw-fetch wrapper around Bot API.
 *
 * Why not the `node-telegram-bot-api` SDK: that package pulls in a polling
 * loop + http server we don't need. The agent only sends messages — it never
 * receives webhooks. Raw fetch keeps the dep tree small and works in any
 * Node 20+ runtime including the GitHub Actions runner.
 */

export interface TelegramNotifier {
  readonly enabled: boolean;
  /** Send a Markdown-formatted message to a chat. Returns true if delivered. */
  send(chatId: string, message: string): Promise<boolean>;
}

const TELEGRAM_BASE = "https://api.telegram.org";

export function createTelegramNotifier(opts?: {
  botToken?: string;
  fetchImpl?: typeof fetch;
}): TelegramNotifier {
  const token = opts?.botToken ?? process.env.DODORAIL_TELEGRAM_BOT_TOKEN;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const enabled = Boolean(token);

  async function send(chatId: string, message: string): Promise<boolean> {
    if (!enabled) {
      // Mock mode — log to stdout so the demo recording shows the message.
      console.log(`[telegram:mock] to ${chatId}:\n${message}\n`);
      return true;
    }
    const url = `${TELEGRAM_BASE}/bot${token}/sendMessage`;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(
          `[telegram] send failed for chat ${chatId}: HTTP ${res.status} ${text.slice(0, 200)}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.warn(`[telegram] send exception for chat ${chatId}:`, err);
      return false;
    }
  }

  return { enabled, send };
}
