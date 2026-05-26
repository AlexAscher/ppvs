import { NextRequest } from "next/server";
import { Api } from "telegram";
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
};

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
    const { peerId, accessHash, text } = await req.json();
    if (!peerId || !text) return Response.json({ error: "peerId and text required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const sent = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        const peer = buildPeer(peerId, accessHash ?? null);
        const msg = await tg.sendMessage(peer, { message: text });
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
    };
    return Response.json({ ok: true, message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
