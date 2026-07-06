import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Platform alert bot (Bot API, NOT a userbot).
 *
 * Two responsibilities:
 *   1. Receive `/start <code>` from agencies who clicked "Connect alerts"
 *      and bind their personal Telegram chat_id to the agency. We use
 *      long-poll getUpdates (no public webhook URL needed) running as a
 *      single background loop on the server.
 *   2. Send Sales Alerts via sendMessage to a bound chat_id (called from
 *      lib/sales-alerts).
 *
 * Zero ban risk: bots are first-class TG automation. The agency uses
 * their existing personal Telegram — no new account, no Web App.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${TOKEN}/${method}`;
}

let cachedUsername: string | null = null;

/** Bot username (no @) via getMe, cached. Null if unavailable. */
export async function getBotUsername(): Promise<string | null> {
  if (!TOKEN) return null;
  if (cachedUsername) return cachedUsername;
  try {
    const r = await fetch(apiUrl("getMe"));
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
    if (j.ok && j.result?.username) {
      cachedUsername = j.result.username;
      return cachedUsername;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Send a plain-text message via the Bot API. Returns true on success. */
export async function sendBotMessage(chatId: string, text: string): Promise<boolean> {
  if (!TOKEN) return false;
  try {
    const r = await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
    return !!j.ok;
  } catch (e) {
    console.error("[alert-bot] sendMessage failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

// ── Polling loop ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __ppvs_alert_bot_started__: boolean | undefined;
}

type TgUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { first_name?: string; username?: string };
  };
};

/**
 * Start the getUpdates poller. Idempotent — guarded by a global flag so
 * Next.js hot reloads / multiple imports don't spawn duplicate loops.
 * Safe to call from instrumentation.register() and from API routes.
 */
export function startAlertBotPolling(): void {
  if (!TOKEN) return;
  if (globalThis.__ppvs_alert_bot_started__) return;
  globalThis.__ppvs_alert_bot_started__ = true;
  void pollLoop();
}

async function pollLoop(): Promise<void> {
  // Drop any webhook so getUpdates is allowed (Mini App registration
  // doesn't set one, but be defensive).
  try {
    await fetch(apiUrl("deleteWebhook"), { method: "POST" });
  } catch {
    /* ignore */
  }

  let offset = 0;
  // Loop forever. Each getUpdates long-polls up to 50s.
  for (;;) {
    try {
      const r = await fetch(apiUrl("getUpdates") + `?timeout=50&offset=${offset}`, {
        // Node fetch needs a slightly longer timeout than the long-poll.
        signal: AbortSignal.timeout(60_000),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: TgUpdate[] };
      if (j.ok && j.result) {
        for (const u of j.result) {
          offset = Math.max(offset, u.update_id + 1);
          await handleUpdate(u);
        }
      }
    } catch {
      // Network blip / timeout — brief backoff, then retry.
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

async function handleUpdate(u: TgUpdate): Promise<void> {
  const text = u.message?.text ?? "";
  const chatId = u.message?.chat?.id;
  if (!chatId) return;

  // We only care about `/start <code>`.
  const m = text.match(/^\/start\s+([A-Za-z0-9_-]{6,64})$/);
  if (!m) {
    if (text.trim() === "/start") {
      await sendBotMessage(
        String(chatId),
        "👋 Open Sales Alerts in your dashboard and tap Connect to link this chat.",
      );
    }
    return;
  }
  const rawCode = m[1];

  const admin = createAdminSupabaseClient();

  // Platform-owner binding: codes prefixed with `admin_` bind to
  // admin_sales_channels (see /api/admin/global-alerts). Fan-out from
  // sales-alerts hits both admins and the sale's own agency independently.
  if (rawCode.startsWith("admin_")) {
    const code = rawCode.slice("admin_".length);
    const { data: adminRow } = await admin
      .from("admin_sales_channels")
      .select("admin_email")
      .eq("link_code", code)
      .maybeSingle();
    const adminEmail = (adminRow as { admin_email?: string } | null)?.admin_email;
    if (!adminEmail) {
      await sendBotMessage(String(chatId), "⚠️ This link expired. Generate a new one in Global Sales Alerts.");
      return;
    }
    await admin
      .from("admin_sales_channels")
      .update({
        bot_chat_id: String(chatId),
        link_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("admin_email", adminEmail);
    await sendBotMessage(
      String(chatId),
      "✅ Connected! You will receive a notification here for every sale of every agency on the platform 💰",
    );
    return;
  }

  // Per-agency binding (default).
  const { data: row } = await admin
    .from("agency_settings")
    .select("user_id")
    .eq("alerts_bot_link_code", rawCode)
    .maybeSingle();
  const userId = (row as { user_id?: string } | null)?.user_id;
  if (!userId) {
    await sendBotMessage(String(chatId), "⚠️ This link expired. Generate a new one in your dashboard.");
    return;
  }

  // Bind the chat and consume the one-time code.
  await admin
    .from("agency_settings")
    .update({
      alerts_bot_chat_id: String(chatId),
      alerts_bot_link_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  await sendBotMessage(
    String(chatId),
    "✅ Connected! You will receive a notification here for every sale of all of your creators 💰",
  );
}
