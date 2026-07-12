import { NextRequest, after } from "next/server";
import { Api } from "telegram";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { recordFanRead, recordIncomingMessageAt } from "@/lib/fan-activity";

// Throttle the background fan-capture: dialogs are polled every ~10s while a
// chatter is viewing, but we only need to persist usernames occasionally.
// One write-batch per model per minute keeps the DB quiet while still capturing
// everyone who messaged within a minute of appearing.
declare global {
  var __ppvs_fan_capture_ts__: Map<string, number> | undefined;
  /** Per-(model,peer) last-seen `readOutboxMaxId`. When the new value is
   *  higher than the cached one, the fan just read more of our outgoing
   *  messages → bump fans.last_read_at via recordFanRead(). */
  var __ppvs_last_outbox_max__: Map<string, number> | undefined;
  /** Per-(model,peer) last-seen INCOMING message timestamp (unix sec).
   *  When the dialog's most-recent message is from the fan and its date
   *  advances, we bump fans.last_response_at to it. */
  var __ppvs_last_incoming_date__: Map<string, number> | undefined;
}
const fanCaptureTs: Map<string, number> = globalThis.__ppvs_fan_capture_ts__ ?? new Map();
globalThis.__ppvs_fan_capture_ts__ = fanCaptureTs;
const lastOutboxMax: Map<string, number> =
  globalThis.__ppvs_last_outbox_max__ ?? new Map();
globalThis.__ppvs_last_outbox_max__ = lastOutboxMax;
const lastIncomingDate: Map<string, number> =
  globalThis.__ppvs_last_incoming_date__ ?? new Map();
globalThis.__ppvs_last_incoming_date__ = lastIncomingDate;
const FAN_CAPTURE_THROTTLE_MS = 60_000;

export type DialogItem = {
  id: string;             // peer id (positive for user/bot, "-..." for chat, "-100..." for channel)
  type: "user" | "chat" | "channel";
  title: string;
  username: string | null;
  lastMessage: string;
  lastMessageDate: number; // unix seconds
  /** Telegram message id of the last message in the dialog. Used together
   *  with readOutboxMaxId to render ✓ / ✓✓ next to the timestamp in the
   *  dialog list when the last message is ours. */
  lastMessageId: number;
  /** True if the last message is one WE sent (drives whether the dialog
   *  list shows a checkmark next to the time). */
  lastMessageOutgoing: boolean;
  unreadCount: number;
  accessHash: string | null;
  status: string | null;   // "online" | "last seen recently" | "last seen DD.MM HH:MM" | null
  /** Max id of OUR outgoing message the peer has read — drives ✓✓ ticks. */
  readOutboxMaxId: number;
};

function formatLastSeen(unix: number): string {
  if (!unix) return "last seen long ago";
  const d = new Date(unix * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `last seen today at ${time}`;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return `last seen yesterday at ${time}`;
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    return `last seen ${weekday} at ${time}`;
  }
  return `last seen ${d.toLocaleDateString("en-US")}`;
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

/** Per-dialog side info we collect inside the gramJS callback and act on
 *  after mapping — separated so the DB-bump logic doesn't touch wire-format
 *  details (Api.User, msg.out, etc.). */
type BumpInfo = {
  peerId: string;
  /** Date (unix sec) of the most-recent message in the dialog, or 0. */
  msgDate: number;
  /** Whether the most-recent message is OUR outgoing one. */
  msgOutgoing: boolean;
  readOutboxMaxId: number;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const { result, bumpInfos } = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        // Fetch BOTH folders (main + Telegram archive). We used to skip
        // folderId === 1 (archived) on the theory that "the model hid it" —
        // but Telegram auto-archives chats from non-contacts by default, so
        // brand-new fans land in Archive and vanished from the chatter inbox
        // (only 22 of N conversations showed, missing real chats). Archiving
        // in OUR app is handled separately (chat_archives, client-side), so we
        // no longer hide Telegram-archived conversations here. Limit raised to
        // 200 so accounts with many chats aren't truncated at 50.
        const dialogs = await tg.getDialogs({ limit: 200 });
        const items: DialogItem[] = [];
        const bumps: BumpInfo[] = [];
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
            // gramJS occasionally leaves d.entity undefined when the
            // users/chats arrays in the getDialogs response don't cover a
            // peer. Previously we DROPPED these dialogs — which made a whole
            // account (e.g. Comfygod) render an EMPTY list when none of its
            // entities resolved. Instead, build a minimal item from the
            // dialog-level fields. accessHash is unknown here; the messages
            // route re-resolves it via getInputEntity on PEER_ID_INVALID.
            // d.id is already the marked id (positive user / -chat / -100
            // channel), matching our peerId convention.
            const dd = d as unknown as {
              id?: { toString(): string } | null;
              name?: string | null;
              isChannel?: boolean;
              isGroup?: boolean;
            };
            const did = dd.id ? dd.id.toString() : null;
            if (!did) continue;
            type = dd.isChannel ? "channel" : dd.isGroup ? "chat" : "user";
            id = did;
            title = dd.name || "Chat";
          }

          const msg = d.message;
          const lastMessage = (() => {
            if (!msg) return "";
            if ("message" in msg && typeof msg.message === "string" && msg.message.length > 0) return msg.message;
            if ("media" in msg && msg.media) return "📎 Media";
            return "";
          })();

          const readOutboxMaxId = Number(
            (d as { dialog?: { readOutboxMaxId?: number } }).dialog?.readOutboxMaxId ?? 0,
          );

          // Direction of the last message in the dialog. gramJS surfaces `out`
          // on the raw message object, but for a stripped Api.MessageService
          // it may be undefined; treat undefined as inbound (safer default —
          // means "no ✓ next to the time", never a false-positive tick).
          const lastMessageOutgoing =
            !!msg && typeof (msg as { out?: boolean }).out === "boolean"
              ? !!(msg as { out?: boolean }).out
              : false;
          const lastMessageId = Number(msg?.id ?? 0);

          items.push({
            id,
            type,
            title,
            username,
            lastMessage,
            lastMessageDate: msg?.date ?? 0,
            lastMessageId,
            lastMessageOutgoing,
            unreadCount: d.unreadCount ?? 0,
            accessHash,
            status,
            readOutboxMaxId,
          });

          // Collect bump info for user dialogs only — fan activity columns
          // are per-fan, not per-group/channel.
          if (type === "user") {
            const msgOutgoing =
              !!msg && typeof (msg as { out?: boolean }).out === "boolean"
                ? !!(msg as { out?: boolean }).out
                : false;
            bumps.push({
              peerId: id,
              msgDate: msg?.date ?? 0,
              msgOutgoing,
              readOutboxMaxId,
            });
          }
        }
        // Diagnostic: an empty list with raw>0 means a mapping gap; raw==0
        // means Telegram returned no dialogs for this session (account truly
        // empty, or the session needs re-auth). Logged so we can tell which.
        if (items.length === 0) {
          console.warn(
            `[telegram/dialogs] model ${modelId}: getDialogs returned ${dialogs.length} raw dialog(s), 0 mapped`,
          );
        }
        return { result: items, bumpInfos: bumps };
      },
      // Read-only op — transparently reconnect+retry once on a dead pooled
      // socket so the dialog list doesn't blank out on a transient 500.
      20_000,
      true,
    );

    // Walk the per-dialog bump info and update fans.last_response_at /
    // fans.last_read_at when something advances. This is the source of
    // truth for both columns — the gramJS NewMessage handler can miss
    // events when the client wasn't yet connected, but the dialog list
    // always reflects Telegram's current state. So even legacy fans get
    // a value the first time the chatter opens the inbox after deploy.
    for (const b of bumpInfos) {
      // last_response_at — most-recent message is from the fan and newer
      // than what we last persisted for this (model,peer).
      if (!b.msgOutgoing && b.msgDate > 0) {
        const key = `${modelId}:${b.peerId}`;
        const prev = lastIncomingDate.get(key);
        if (prev === undefined || b.msgDate > prev) {
          recordIncomingMessageAt(
            modelId,
            b.peerId,
            new Date(b.msgDate * 1000).toISOString(),
          );
          lastIncomingDate.set(key, b.msgDate);
        }
      }
      // last_read_at — fan read more of our outgoing messages. We also
      // seed on first sight (prev === undefined) when readOutboxMaxId > 0
      // so currently-active fans don't show "—" forever just because our
      // in-memory cache was empty at deploy time. Subsequent polls only
      // fire on advance.
      if (b.readOutboxMaxId > 0) {
        const key = `${modelId}:${b.peerId}`;
        const prev = lastOutboxMax.get(key);
        if (prev === undefined || b.readOutboxMaxId > prev) {
          recordFanRead(modelId, b.peerId);
        }
        lastOutboxMax.set(key, b.readOutboxMaxId);
      }
    }

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
