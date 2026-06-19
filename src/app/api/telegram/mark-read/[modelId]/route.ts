import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { withResolvedPeer } from "@/lib/telegram-peer";

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
      async (tg) =>
        // The peerId comes from the chatter's stored dialog list; that
        // access_hash sometimes goes stale across reconnects. withResolvedPeer
        // re-resolves on PEER_ID_INVALID instead of just logging the error,
        // which was spamming logs every few seconds while the user was
        // viewing a dialog.
        withResolvedPeer(tg, peerId, accessHash ?? null, (peer) =>
          // No `message` argument → mark the whole history of this dialog read.
          tg.markAsRead(peer),
        ),
    );

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/mark-read POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
