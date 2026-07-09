import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Per-model chat archive. Archiving is scoped to the model, so every chatter
 * assigned to it shares the same archive (see 20260709_chat_archive.sql).
 *
 *   GET    /api/chat-archive/{modelId}          → { peerIds: string[] }
 *   POST   /api/chat-archive/{modelId} {peerId} → archive a chat
 *   DELETE /api/chat-archive/{modelId} {peerId} → un-archive (back to main)
 *
 * Auth: the agency owner of the model, or a chatter assigned to it
 * (authorizeModelAccess). Writes go through the service-role admin client.
 */

async function readPeerId(req: NextRequest): Promise<string | null> {
  const body = await req.json().catch(() => null);
  const peerId = body && typeof body.peerId === "string" ? body.peerId.trim() : "";
  // peerIds are Telegram numeric ids (positive user, or -/-100 prefixed).
  return /^-?\d+$/.test(peerId) ? peerId : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const { modelId } = await params;
  const auth = await authorizeModelAccess(modelId);
  if ("errorResponse" in auth) return auth.errorResponse;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("chat_archives")
    .select("peer_id")
    .eq("model_id", modelId);
  if (error) {
    // Table missing (migration not run) → behave as "nothing archived" so the
    // dialog list still renders instead of erroring the whole poll.
    console.warn("[chat-archive GET] select failed:", error.message);
    return Response.json({ peerIds: [] });
  }
  const peerIds = ((data ?? []) as { peer_id: string }[]).map((r) => r.peer_id);
  return Response.json({ peerIds });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const { modelId } = await params;
  const auth = await authorizeModelAccess(modelId);
  if ("errorResponse" in auth) return auth.errorResponse;

  const peerId = await readPeerId(req);
  if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("chat_archives")
    .upsert(
      { model_id: modelId, peer_id: peerId, archived_by: auth.userId, archived_at: new Date().toISOString() },
      { onConflict: "model_id,peer_id" },
    );
  if (error) {
    console.error("[chat-archive POST] upsert failed:", error.message);
    return Response.json({ error: "Failed to archive" }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const { modelId } = await params;
  const auth = await authorizeModelAccess(modelId);
  if ("errorResponse" in auth) return auth.errorResponse;

  const peerId = await readPeerId(req);
  if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("chat_archives")
    .delete()
    .eq("model_id", modelId)
    .eq("peer_id", peerId);
  if (error) {
    console.error("[chat-archive DELETE] delete failed:", error.message);
    return Response.json({ error: "Failed to un-archive" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
