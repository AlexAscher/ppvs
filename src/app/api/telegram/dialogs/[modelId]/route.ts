import { NextRequest, after } from "next/server";
import { Api } from "telegram";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

// Throttle the background fan-capture: dialogs are polled every ~10s while a
// chatter is viewing, but we only need to persist usernames occasionally.
// One write-batch per model per minute keeps the DB quiet while still capturing
// everyone who messaged within a minute of appearing.
declare global {
  var __ppvs_fan_capture_ts__: Map<string, number> | undefined;
}
const fanCaptureTs: Map<string, number> = globalThis.__ppvs_fan_capture_ts__ ?? new Map();
globalThis.__ppvs_fan_capture_ts__ = fanCaptureTs;
const FAN_CAPTURE_THROTTLE_MS = 60_000;

export type DialogItem = {
  id: string;             // peer id (positive for user/bot, "-..." for chat, "-100..." for channel)
  type: "user" | "chat" | "channel";
  title: string;
  username: string | null;
  lastMessage: string;
  lastMessageDate: number; // unix seconds
  unreadCount: number;
  accessHash: string | null;
  status: string | null;   // "online" | "last seen recently" | "last seen DD.MM HH:MM" | null
};

function formatLastSeen(unix: number): string {
  if (!unix) return "last seen long ago";
  const d = new Date(unix * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `last seen today at ${time}`;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return `last seen yesterday at ${time}`;
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString([], { weekday: "long" });
    return `last seen ${weekday} at ${time}`;
  }
  return `last seen ${d.toLocaleDateString()}`;
}

function getUserStatus(status: Api.TypeUserStatus | undefined): string | null {
  if (!status) return null;
  if (status instanceof Api.UserStatusOnline) return "online";
  if (status instanceof Api.UserStatusOffline) return formatLastSeen(status.wasOnline);
  if (status instanceof Api.UserStatusRecently) return "last seen recently";
  if (status instanceof Api.UserStatusLastWeek) return "last seen within a week";
  if (status instanceof Api.UserStatusLastMonth) return "last seen within a month";
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const result = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        const dialogs = await tg.getDialogs({ limit: 50 });
        const items: DialogItem[] = [];
        for (const d of dialogs) {
          const entity = d.entity;
          let type: DialogItem["type"];
          let title: string;
          let username: string | null = null;
          let id: string;
          let accessHash: string | null = null;
          let status: string | null = null;

          if (entity instanceof Api.User) {
            type = "user";
            title = [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.username || "User";
            username = entity.username ?? null;
            id = entity.id.toString();
            accessHash = entity.accessHash?.toString() ?? null;
            status = getUserStatus(entity.status);
          } else if (entity instanceof Api.Chat) {
            type = "chat";
            title = entity.title;
            id = `-${entity.id.toString()}`;
          } else if (entity instanceof Api.Channel) {
            type = "channel";
            title = entity.title;
            username = entity.username ?? null;
            id = `-100${entity.id.toString()}`;
            accessHash = entity.accessHash?.toString() ?? null;
          } else {
            // Skip dialogs with unknown / unresolved entity to avoid duplicate React keys.
            continue;
          }

          const msg = d.message;
          const lastMessage = (() => {
            if (!msg) return "";
            if ("message" in msg && typeof msg.message === "string" && msg.message.length > 0) return msg.message;
            if ("media" in msg && msg.media) return "📎 Media";
            return "";
          })();

          items.push({
            id,
            type,
            title,
            username,
            lastMessage,
            lastMessageDate: msg?.date ?? 0,
            unreadCount: d.unreadCount ?? 0,
            accessHash,
            status,
          });
        }
        return items;
      },
    );

    // Background: persist every fan (user dialog) so the admin panel has a
    // full record of who messaged each model — even fans nobody opened. Runs
    // after the response is sent; throttled per model; failures are swallowed.
    const last = fanCaptureTs.get(modelId) ?? 0;
    if (Date.now() - last >= FAN_CAPTURE_THROTTLE_MS) {
      fanCaptureTs.set(modelId, Date.now());
      after(async () => {
        try {
          const userRows = result
            .filter((d) => d.type === "user")
            .map((d) => ({
              model_id: modelId,
              peer_id: d.id,
              telegram_username: d.username,
              telegram_name: d.title,
            }));
          if (userRows.length === 0) return;
          const admin = createAdminSupabaseClient();
          // Partial upsert: only username/name are touched on conflict, leaving
          // notes / tags / total_spent / last_seen_at intact.
          await admin.from("fans").upsert(userRows, { onConflict: "model_id,peer_id" });
        } catch (e) {
          console.error(
            "[telegram/dialogs] fan capture failed:",
            e instanceof Error ? e.message : e,
          );
        }
      });
    }

    return Response.json({ dialogs: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/dialogs] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
