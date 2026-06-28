/**
 * Telegram Business connection helpers — for sending native Paid Media on a
 * model's behalf via the bot's Chat Automation connection.
 *
 * Flow:
 *   1. Model connects @ppvstarbot via Settings → Chat Automation.
 *   2. Telegram pushes `business_connection` → /api/webhooks/telegram persists
 *      it in business_connections (tg_user_id, connection_id, can_reply, …).
 *   3. PPV send path resolves the model's Telegram user id (via gramJS getMe)
 *      → looks up the connection → calls bot's sendPaidMedia with
 *      business_connection_id. Telegram renders the native blur + "Unlock for
 *      ⭐ N" overlay; Stars credit our bot's balance.
 *   4. After unlock Telegram pushes `purchased_paid_media` to the bot →
 *      webhook fulfils + bumps balances.
 */

import { createAdminSupabaseClient } from "@/lib/supabase-server";

const API = "https://api.telegram.org";

function botToken(): string {
  const t = process.env.TELEGRAM_STARS_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_STARS_BOT_TOKEN not configured");
  return t;
}

type Admin = ReturnType<typeof createAdminSupabaseClient>;

export type ActiveBusinessConnection = {
  connectionId: string;
  tgUserId: string;
  canReply: boolean;
};

/** Return the enabled, reply-capable connection for the given TG user id, or null. */
export async function findActiveBusinessConnection(
  admin: Admin,
  tgUserId: string,
): Promise<ActiveBusinessConnection | null> {
  const { data } = await admin
    .from("business_connections")
    .select("connection_id, tg_user_id, can_reply, is_enabled")
    .eq("tg_user_id", tgUserId)
    .eq("is_enabled", true)
    .eq("can_reply", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    connectionId: data.connection_id as string,
    tgUserId: data.tg_user_id as string,
    canReply: !!data.can_reply,
  };
}

export type PaidMediaItem =
  | { kind: "photo"; url: string }
  | { kind: "video"; url: string };

/**
 * Call bot API sendPaidMedia using a business_connection_id so the message
 * appears in the recipient's chat as if sent by the connected user, with
 * Telegram's native paid-media blur + "Unlock for ⭐ N" overlay.
 *
 * `chatId` is the fan's Telegram numeric user id (same peer_id we already
 * store in ppv_sends).
 *
 * Returns the sent message's id on success, throws on failure.
 */
export async function sendPaidMediaAsBusiness(params: {
  connectionId: string;
  chatId: string;
  stars: number;
  payload: string;
  caption?: string;
  media: PaidMediaItem[];
}): Promise<{ messageId: number }> {
  const { connectionId, chatId, stars, payload, caption, media } = params;
  if (media.length === 0) throw new Error("sendPaidMedia: media[] required");
  if (media.length > 10) throw new Error("sendPaidMedia: max 10 items");

  const inputMedia = media.map((m) => ({ type: m.kind, media: m.url }));
  // Telegram Bot API accepts chat_id as either number or numeric string for
  // private chats, but a few client paths have been observed to reject the
  // string form with PEER_ID_INVALID. Send as number when it fits a 53-bit
  // int; otherwise fall back to the string (rare for fan ids).
  const chatIdNum = Number(chatId);
  const chatIdField: number | string =
    Number.isFinite(chatIdNum) && Number.isInteger(chatIdNum) && Math.abs(chatIdNum) <= Number.MAX_SAFE_INTEGER
      ? chatIdNum
      : chatId;

  const body: Record<string, unknown> = {
    business_connection_id: connectionId,
    chat_id: chatIdField,
    star_count: stars,
    media: inputMedia,
    payload,
  };
  if (caption && caption.trim()) body.caption = caption.trim().slice(0, 1024);

  const res = await fetch(`${API}/bot${botToken()}/sendPaidMedia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: { message_id: number }; description?: string }
    | null;
  if (!j?.ok || !j.result) {
    const desc = j?.description ?? `HTTP ${res.status}`;
    // PEER_ID_INVALID via business_connection_id almost always means the fan
    // hasn't messaged the model since the bot was connected — Telegram only
    // lets the bot push into chats it has already received an update from.
    const hint = /PEER_ID_INVALID/i.test(desc)
      ? " (the fan must send the model at least one message after the bot is connected — Telegram only lets the bot push into chats it has already received an update from)"
      : "";
    throw new Error(`sendPaidMedia: ${desc}${hint}`);
  }
  return { messageId: j.result.message_id };
}
