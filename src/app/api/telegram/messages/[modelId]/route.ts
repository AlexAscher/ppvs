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
        const peer = buildPeer(peerId, accessHash);
        const raw = await tg.getMessages(peer, { limit: 50 });
        return raw
          .filter((m): m is Api.Message => m instanceof Api.Message)
          .map((m): MessageItem => ({
            id: m.id,
            text: m.message ?? "",
            date: m.date,
            isOutgoing: !!m.out,
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
      async (tg) => {
        const peer = buildPeer(peerId, accessHash ?? null);
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
      },
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
      async (tg) => {
        const peer = buildPeer(peerId, accessHash ?? null);
        const msg = await tg.editMessage(peer, {
          message: Number(messageId),
          text,
        });
        return msg;
      },
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
      async (tg) => {
        const peer = buildPeer(peerId, accessHash ?? null);
        await tg.deleteMessages(peer, ids, { revoke: doRevoke });
      },
    );

    return Response.json({ ok: true, deleted: ids, revoke: doRevoke });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages DELETE] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
