import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";
import { decryptIfNeeded } from "@/lib/crypto";

/**
 * Auto-reply keep-alive.
 *
 * Auto-replies only fire while the model's MTProto client is connected (the
 * NewMessage handler is attached in telegram-pool on connect). With no chatter
 * active, the pool evicts idle clients after 10 min — so a fan's first message
 * sits unanswered until something reconnects the client (hence the multi-minute
 * lag the agency saw).
 *
 * This worker keeps every model that has auto_reply_enabled warm: once a minute
 * it touches each such model via the pool (a cheap getMe ping). That:
 *   - reconnects + re-subscribes the auto-reply handler if the client dropped,
 *   - refreshes lastUsedAt so the idle-cleanup never evicts it,
 *   - heals a silently-dead socket (getMe throws → pool evicts → next tick
 *     reconnects fresh).
 *
 * Cost is tiny: one getMe per enabled model per minute over an already-open
 * socket. Models WITHOUT auto-reply are never touched.
 */

declare global {
  var __ppvs_autoreply_keepalive__: ReturnType<typeof setInterval> | undefined;
}

const TICK_MS = 60_000;
let running = false;

type ModelRow = {
  id: string;
  session_string: string | null;
  api_id: number | null;
  api_hash: string | null;
  session_status: string | null;
};

async function tick() {
  if (running) return; // never overlap ticks
  running = true;
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("models")
      .select("id, session_string, api_id, api_hash, session_status")
      .eq("auto_reply_enabled", true);
    if (error) return;
    const models = (data ?? []) as ModelRow[];
    for (const m of models) {
      // NOTE: we intentionally do NOT skip session_status === "expired" here.
      // The pool now auto-heals a flagged session after a 10-min back-off
      // (see telegram-pool EXPIRED_RETRY_MS): a transient AUTH_KEY_DUPLICATED
      // clears itself on the next successful probe. Skipping expired models
      // would leave a false-positive expiry stuck forever with no chatter to
      // trigger a reconnect. The pool bounds how often it actually retries,
      // so this stays cheap.
      if (!m.session_string || !m.api_id || !m.api_hash) continue;
      const sess = decryptIfNeeded(m.session_string);
      const hash = decryptIfNeeded(m.api_hash);
      if (!sess || !hash) continue;
      try {
        // Connects + subscribes the auto-reply handler if needed; the getMe
        // round-trip verifies the socket is live (dead → pool evicts → next
        // tick reconnects). Keep the timeout short so one stuck model doesn't
        // stall the loop.
        await withTelegramClient(m.id, sess, m.api_id, hash, async (tg) => {
          await tg.getMe();
        }, 15_000);
      } catch {
        /* logged by the pool; skip and try again next tick */
      }
    }
  } catch (e) {
    console.error("[autoreply-keepalive] tick failed:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Start the keep-alive loop once per process. Safe to call repeatedly. */
export function startAutoReplyKeepAlive() {
  if (globalThis.__ppvs_autoreply_keepalive__) return;
  // Only run in production. If a local `next dev` instance also warmed every
  // model, it would connect the SAME Telegram sessions as the live server and
  // Telegram would kill the key with AUTH_KEY_DUPLICATED — the exact session
  // war that used to brick creators. Local dev still connects on demand when a
  // chat is opened; it just doesn't proactively warm all models.
  if (process.env.NODE_ENV !== "production" && !process.env.FORCE_TG_KEEPALIVE) {
    console.log("[autoreply-keepalive] disabled outside production");
    return;
  }
  const timer = setInterval(() => void tick(), TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  globalThis.__ppvs_autoreply_keepalive__ = timer;
  // First pass a few seconds after boot so the server finishes starting.
  setTimeout(() => void tick(), 5_000);
}
