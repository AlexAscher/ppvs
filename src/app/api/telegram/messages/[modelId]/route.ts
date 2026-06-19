import { NextRequest } from "next/server";
import { Api } from "telegram";
import { generateRandomLong } from "telegram/Helpers";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { buildPeer } from "@/lib/telegram-peer";
import { extractMessageMedia, type MessageMedia } from "@/lib/telegram-media";

export type MessageItem = {
  id: number;
  text: string;
  date: number;
  isOutgoing: boolean;
  media: MessageMedia | null;
  // Telegram groups album items by the same groupedId so the UI can
  // render them as one bubble.
  groupedId: string | null;
  // Reply / quote metadata — non-null when this message is a reply. The
  // UI uses `msgId` to look up the original text inside the loaded
  // message list and `quoteText` to render the highlighted snippet
  // (newer Telegram protocol).
  replyTo: { msgId: number; quoteText: string | null } | null;
};

const PEER_INVALID_RE =
  /PEER_ID_INVALID|CHAT_INVALID|CHANNEL_INVALID|USER_ID_INVALID|peer not found/i;

/**
 * Run a peer-scoped operation, re-resolving the peer once if Telegram rejects
 * the cheap buildPeer() with PEER_ID_INVALID / CHAT_INVALID / etc. That error
 * means the chatter-supplied access_hash is stale (or never matched THIS
 * session — common when the dialog list was bootstrapped against a different
 * account / model session). On that specific error we fall back to
 * `tg.getInputEntity(peerId)`, which forces gramJS to resolve the user via
 * getUsers / contacts.resolve (refreshing the session's entity cache), then
 * retries the same operation against the fresh peer.
 *
 * NOTE: earlier this validated the peer with a separate `getMessages(limit:0)`
 * touch BEFORE the real call. That extra round-trip is gone — we run the real
 * op and only re-resolve on failure. The double-fetch was both wasteful and a
 * plausible cause of getHistory returning messages with the `out` flag
 * stripped, which flipped the chatter's own sent messages to the "incoming"
 * side when a dialog was re-opened.
 */
async function withResolvedPeer<T>(
  tg: import("telegram").TelegramClient,
  peerId: string,
  accessHash: string | null,
  op: (peer: Api.TypeInputPeer) => Promise<T>,
): Promise<T> {
  const initial = buildPeer(peerId, accessHash);
  try {
    return await op(initial);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!PEER_INVALID_RE.test(msg)) throw e;
    let resolved: Api.TypeInputPeer;
    try {
      resolved = (await tg.getInputEntity(peerId)) as Api.TypeInputPeer;
    } catch {
      // Re-throw the original PEER_ID_INVALID so the caller surfaces it.
      throw e;
    }
    return await op(resolved);
  }
}

// ── message direction (self-id based) ──────────────────────────────────────
// getHistory's `out` flag has been observed to come back falsy for the
// account's OWN sent messages after a reconnect, which flipped sent bubbles to
// the "incoming" side when a dialog was re-opened. The authoritative signal is
// the sender: compare each message's fromId to the model's own user id (getMe,
// cached per model). We only fall back to `out` when Telegram omits fromId.
declare global {
  var __ppvs_self_id__: Map<string, string> | undefined;
  var __ppvs_self_id_miss__: Map<string, number> | undefined;
  var __ppvs_msg_log_ts__: Map<string, number> | undefined;
}
const selfIdCache: Map<string, string> =
  globalThis.__ppvs_self_id__ ?? new Map<string, string>();
globalThis.__ppvs_self_id__ = selfIdCache;
const selfIdMiss: Map<string, number> =
  globalThis.__ppvs_self_id_miss__ ?? new Map<string, number>();
globalThis.__ppvs_self_id_miss__ = selfIdMiss;
const msgLogTs: Map<string, number> =
  globalThis.__ppvs_msg_log_ts__ ?? new Map<string, number>();
globalThis.__ppvs_msg_log_ts__ = msgLogTs;

const SELF_ID_TIMEOUT_MS = 6_000;
const SELF_ID_RETRY_MS = 5 * 60_000;

/**
 * Resolve the model's own user id (for message direction), cached forever on
 * success. CRITICAL: getMe must NEVER block message loading — on a flaky
 * session it can hang, and since this runs inside the pool's 20s operation
 * budget a hang would make the whole getMessages fail and the chat render
 * empty. So we race it against a short timeout and, on miss, back off for a
 * few minutes (returning null → callers fall back to the `out` flag).
 */
async function getSelfId(
  tg: import("telegram").TelegramClient,
  modelId: string,
): Promise<string | null> {
  const cached = selfIdCache.get(modelId);
  if (cached) return cached;
  const lastMiss = selfIdMiss.get(modelId) ?? 0;
  if (Date.now() - lastMiss < SELF_ID_RETRY_MS) return null;
  try {
    const me = await Promise.race([
      tg.getMe(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SELF_ID_TIMEOUT_MS)),
    ]);
    const id =
      me && typeof me === "object" && "id" in me && me.id != null
        ? me.id.toString()
        : null;
    if (id) {
      selfIdCache.set(modelId, id);
      return id;
    }
    selfIdMiss.set(modelId, Date.now());
    return null;
  } catch {
    selfIdMiss.set(modelId, Date.now());
    return null;
  }
}

function peerUserId(p: Api.TypePeer | undefined): string | null {
  return p instanceof Api.PeerUser ? p.userId.toString() : null;
}

function isOutgoingMessage(m: Api.Message, selfId: string | null): boolean {
  if (selfId != null && m.fromId) {
    const fid = peerUserId(m.fromId);
    if (fid != null) return fid === selfId;
  }
  return !!m.out;
}

function extractReplyTo(msg: Api.Message): MessageItem["replyTo"] {
  const r = msg.replyTo;
  if (!r || !(r instanceof Api.MessageReplyHeader)) return null;
  if (typeof r.replyToMsgId !== "number" || r.replyToMsgId <= 0) return null;
  return {
    msgId: r.replyToMsgId,
    quoteText: typeof r.quoteText === "string" && r.quoteText.length > 0
      ? r.quoteText
      : null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const url = new URL(req.url);
    const peerId = url.searchParams.get("peerId");
    const accessHash = url.searchParams.get("accessHash");
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const messages = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        const selfId = await getSelfId(tg, modelId);
        const raw = await withResolvedPeer(tg, peerId, accessHash, (peer) =>
          tg.getMessages(peer, { limit: 50 }),
        );
        const msgs = raw.filter((m): m is Api.Message => m instanceof Api.Message);
        // Throttled diagnostic (≤1/model/30s). If direction is still wrong,
        // this shows whether getHistory carries fromId and how it lines up
        // with `out` + the model's self id.
        const now = Date.now();
        if (now - (msgLogTs.get(modelId) ?? 0) > 30_000) {
          msgLogTs.set(modelId, now);
          const sample = msgs.slice(0, 5).map((m) => ({
            id: m.id,
            out: m.out ?? null,
            from: peerUserId(m.fromId),
          }));
          console.log(
            `[telegram/messages] model=${modelId} self=${selfId} peer=${peerId} sample=${JSON.stringify(sample)}`,
          );
        }
        return msgs
          .map((m): MessageItem => ({
            id: m.id,
            text: m.message ?? "",
            date: m.date,
            isOutgoing: isOutgoingMessage(m, selfId),
            media: extractMessageMedia(m),
            groupedId: m.groupedId ? m.groupedId.toString() : null,
            replyTo: extractReplyTo(m),
          }))
          .reverse();
      },
    );

    return Response.json({ messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages GET] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    // `replyToMsgId` makes the message render as a reply. `quoteText` (newer
    // Telegram protocol) attaches a highlighted snippet from the original
    // message — shown inside the reply preview on client.
    const { peerId, accessHash, text, replyToMsgId, quoteText, scheduleAt } = await req.json();
    if (!peerId || !text) return Response.json({ error: "peerId and text required" }, { status: 400 });
    // scheduleAt is a UNIX timestamp in SECONDS. Telegram needs it ≥ now+1
    // and ≤ now + 1 year. Anything outside is treated as immediate.
    const NOW = Math.floor(Date.now() / 1000);
    const MAX_SCHEDULE_AHEAD = 365 * 24 * 3600;
    const scheduleSec =
      typeof scheduleAt === "number" &&
      Number.isFinite(scheduleAt) &&
      scheduleAt > NOW &&
      scheduleAt - NOW <= MAX_SCHEDULE_AHEAD
        ? Math.floor(scheduleAt)
        : null;

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const sent = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) =>
        withResolvedPeer(tg, peerId, accessHash ?? null, async (peer) => {
        const hasReply = typeof replyToMsgId === "number" && replyToMsgId > 0;
        const hasQuote =
          hasReply && typeof quoteText === "string" && quoteText.trim().length > 0;

        // High-level `sendMessage` doesn't expose `quoteText` (its types
        // only accept `number | Api.Message` for replyTo). For the quote
        // case we fall through to the raw RPC; for everything else the
        // wrapper is fine.
        if (hasQuote) {
          await tg.invoke(
            new Api.messages.SendMessage({
              peer,
              message: text,
              randomId: generateRandomLong(),
              replyTo: new Api.InputReplyToMessage({
                replyToMsgId,
                quoteText,
              }),
              scheduleDate: scheduleSec ?? undefined,
            }),
          );
          if (scheduleSec) {
            // Scheduled messages don't appear in the regular getMessages
            // until they fire — return a synthetic record so the optimistic
            // bubble can be cleaned up.
            return { id: 0, message: text, date: scheduleSec } as Api.Message;
          }
          // Fetch the latest outgoing message to mirror sendMessage's return
          // shape — gives the client a real id to replace its optimistic.
          const recent = await tg.getMessages(peer, { limit: 1 });
          const last = recent.find((m): m is Api.Message => m instanceof Api.Message);
          if (last) return last;
          // Synthesise a minimal record so the route can still return JSON.
          return { id: 0, message: text, date: Math.floor(Date.now() / 1000) } as Api.Message;
        }

        type SendArgs = { message: string; replyTo?: number; schedule?: number };
        const args: SendArgs = { message: text };
        if (hasReply) args.replyTo = replyToMsgId;
        if (scheduleSec) args.schedule = scheduleSec;
        const msg = await tg.sendMessage(peer, args);
        return msg;
        }),
    );

    // Return the real message metadata so the client can replace its
    // optimistic placeholder and the next poll de-dupes by id. A plain
    // text send has no media / groupedId.
    const message: MessageItem = {
      id: sent.id,
      text: sent.message ?? text,
      date: sent.date ?? Math.floor(Date.now() / 1000),
      isOutgoing: true,
      media: null,
      groupedId: null,
      replyTo:
        typeof replyToMsgId === "number" && replyToMsgId > 0
          ? {
              msgId: replyToMsgId,
              quoteText:
                typeof quoteText === "string" && quoteText.length > 0
                  ? quoteText
                  : null,
            }
          : null,
    };
    return Response.json({ ok: true, message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Edit an outgoing message — replaces the body in-place on Telegram. Only
 * works for messages the model account sent. Returns the new body so the
 * client can update its bubble without waiting on a poll.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const { peerId, accessHash, messageId, text } = await req.json();
    if (!peerId || !messageId || typeof text !== "string") {
      return Response.json(
        { error: "peerId, messageId, text required" },
        { status: 400 },
      );
    }

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const edited = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) =>
        withResolvedPeer(tg, peerId, accessHash ?? null, (peer) =>
          tg.editMessage(peer, {
            message: Number(messageId),
            text,
          }),
        ),
    );

    return Response.json({
      ok: true,
      message: {
        id: Number(messageId),
        text: edited?.message ?? text,
        date: edited?.editDate ?? Math.floor(Date.now() / 1000),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages PUT] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Delete one or more messages. `revoke=true` removes the copy on both
 * sides ("delete for everyone"); `revoke=false` only deletes locally for
 * the model account ("delete for me only"). Caller (client modal)
 * decides which.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const { peerId, accessHash, messageIds, revoke } = await req.json();
    if (!peerId || !Array.isArray(messageIds) || messageIds.length === 0) {
      return Response.json(
        { error: "peerId and messageIds[] required" },
        { status: 400 },
      );
    }
    const ids = messageIds
      .map((n: unknown) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) {
      return Response.json({ error: "no valid message ids" }, { status: 400 });
    }

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const doRevoke = revoke !== false; // default true (delete for everyone)

    await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) =>
        withResolvedPeer(tg, peerId, accessHash ?? null, (peer) =>
          tg.deleteMessages(peer, ids, { revoke: doRevoke }),
        ),
    );

    return Response.json({ ok: true, deleted: ids, revoke: doRevoke });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages DELETE] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
