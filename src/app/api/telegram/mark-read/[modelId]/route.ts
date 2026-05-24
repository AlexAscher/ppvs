import { NextRequest } from "next/server";
import { Api } from "telegram";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import bigInt from "big-integer";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const { peerId, accessHash } = await req.json();
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        const peer = buildPeer(peerId, accessHash ?? null);
        // No `message` argument → mark the whole history of this dialog read.
        await tg.markAsRead(peer);
      },
    );

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/mark-read POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
