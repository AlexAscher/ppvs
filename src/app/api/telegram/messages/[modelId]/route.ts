import { NextRequest } from "next/server";
import { Api } from "telegram";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import bigInt from "big-integer";

export type MessageItem = {
  id: number;
  text: string;
  date: number;
  isOutgoing: boolean;
};

function buildPeer(peerId: string, accessHash: string | null): Api.TypeInputPeer {
  if (peerId.startsWith("-100")) {
    return new Api.InputPeerChannel({
      channelId: bigInt(peerId.slice(4)),
      accessHash: bigInt(accessHash ?? "0"),
    });
  }
  if (peerId.startsWith("-")) {
    return new Api.InputPeerChat({ chatId: bigInt(peerId.slice(1)) });
  }
  return new Api.InputPeerUser({
    userId: bigInt(peerId),
    accessHash: bigInt(accessHash ?? "0"),
  });
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
    // optimistic placeholder and the next poll de-dupes by id.
    const message: MessageItem = {
      id: sent.id,
      text: sent.message ?? text,
      date: sent.date ?? Math.floor(Date.now() / 1000),
      isOutgoing: true,
    };
    return Response.json({ ok: true, message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/messages POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
