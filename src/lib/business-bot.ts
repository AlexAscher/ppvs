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
import { ppvMediaPathFromUrl } from "@/lib/ppv-storage";

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

function filenameFromUrl(url: string, fallbackExt: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() || `file.${fallbackExt}`;
    return base.includes(".") ? base : `${base}.${fallbackExt}`;
  } catch {
    return `file.${fallbackExt}`;
  }
}

/**
 * Download a media URL on the server and return its bytes + content-type.
 * We do this so Telegram never has to fetch the URL itself (private bucket /
 * geo / mime headaches surface as "failed to get HTTP URL content" or
 * "wrong type of the web page content").
 *
 * Supabase Storage URLs are extracted to their object path and downloaded via
 * the admin client (service_role) so private buckets work too; other URLs go
 * through plain fetch.
 */
async function fetchBytes(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const path = ppvMediaPathFromUrl(url);
  if (path) {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.storage.from("ppvs").download(path);
    if (error || !data) throw new Error(`storage download ${path}: ${error?.message ?? "no data"}`);
    const ab = await data.arrayBuffer();
    return { buffer: Buffer.from(ab), contentType: data.type || "application/octet-stream" };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch media ${url}: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get("content-type") || "application/octet-stream";
  return { buffer: Buffer.from(ab), contentType: ct };
}

/**
 * Call bot API sendPaidMedia using a business_connection_id so the message
 * appears in the recipient's chat as if sent by the connected user, with
 * Telegram's native paid-media blur + "Unlock for ⭐ N" overlay.
 *
 * `chatId` is the fan's Telegram numeric user id (same peer_id we already
 * store in ppv_sends).
 *
 * Media files are downloaded server-side and uploaded to Telegram as
 * multipart/form-data (attach:// references) — far more reliable than letting
 * Telegram fetch our Supabase URLs, which intermittently fails with
 * "failed to get HTTP URL content" / "wrong type of the web page content".
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

  // chat_id as integer when it fits a 53-bit safe int — string form has
  // surfaced PEER_ID_INVALID on some routes.
  const chatIdNum = Number(chatId);
  const chatIdField: number | string =
    Number.isFinite(chatIdNum) && Number.isInteger(chatIdNum) && Math.abs(chatIdNum) <= Number.MAX_SAFE_INTEGER
      ? chatIdNum
      : chatId;

  // Download each item server-side and attach as multipart so Telegram
  // doesn't have to fetch our URLs itself.
  const form = new FormData();
  form.set("business_connection_id", connectionId);
  form.set("chat_id", String(chatIdField));
  form.set("star_count", String(stars));
  form.set("payload", payload);
  if (caption && caption.trim()) form.set("caption", caption.trim().slice(0, 1024));

  type InputMedia = { type: "photo" | "video"; media: string };
  const inputMedia: InputMedia[] = [];

  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    const kind = item.kind;
    const { buffer, contentType } = await fetchBytes(item.url);
    const attachName = `media${i}`;
    const filename = filenameFromUrl(item.url, kind === "video" ? "mp4" : "jpg");
    form.set(
      attachName,
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      filename,
    );
    inputMedia.push({ type: kind, media: `attach://${attachName}` });
  }
  form.set("media", JSON.stringify(inputMedia));

  const res = await fetch(`${API}/bot${botToken()}/sendPaidMedia`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: { message_id: number }; description?: string }
    | null;
  if (!j?.ok || !j.result) {
    const desc = j?.description ?? `HTTP ${res.status}`;
    // Map Telegram's cryptic error strings to something the chatter can act on.
    // - EXTENDED_MEDIA_AMOUNT_INVALID: star_count outside 1..10 000 (hard cap).
    // - PEER_ID_INVALID: fan hasn't messaged the model since the bot connected.
    if (/EXTENDED_MEDIA_AMOUNT_INVALID/i.test(desc)) {
      throw new Error(
        "Max is 10 000⭐ per PPV (Telegram limit) — split into multiple PPVs to exceed.",
      );
    }
    const hint = /PEER_ID_INVALID/i.test(desc)
      ? " (the fan must send the model at least one message after the bot is connected — Telegram only lets the bot push into chats it has already received an update from)"
      : "";
    throw new Error(`sendPaidMedia: ${desc}${hint}`);
  }
  return { messageId: j.result.message_id };
}
