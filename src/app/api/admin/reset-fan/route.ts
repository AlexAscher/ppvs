import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/reset-fan { modelId, peerId }
 *
 * Wipes all DB state for a (model, fan) pair so the same Telegram account can
 * be reused as a fresh test fan without having to recreate the Telegram
 * account: deletes ppv_send_items, ppv_sends, tips, fans, chat_system_events
 * scoped to this peer.
 *
 * Does NOT touch Telegram itself (the bot's business connection, the model's
 * gramJS session, the fan's chat history). The chat in Telegram stays — only
 * our DB is cleared.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => null)) as { modelId?: string; peerId?: string } | null;
  const modelId = (body?.modelId ?? "").trim();
  const peerId = (body?.peerId ?? "").trim();
  if (!modelId || !peerId) {
    return Response.json({ error: "modelId and peerId required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const counts: Record<string, number> = {};

  // ppv_send_items hangs off ppv_sends — get the send ids first so we can
  // cascade-delete junction rows before the parents.
  const { data: sends } = await admin
    .from("ppv_sends").select("id").eq("model_id", modelId).eq("peer_id", peerId);
  const sendIds = (sends ?? []).map((s: { id: string }) => s.id);
  if (sendIds.length > 0) {
    const itemsRes = await admin.from("ppv_send_items").delete({ count: "exact" }).in("send_id", sendIds);
    counts.ppv_send_items = itemsRes.count ?? 0;
    const sendsRes = await admin.from("ppv_sends").delete({ count: "exact" }).in("id", sendIds);
    counts.ppv_sends = sendsRes.count ?? 0;
  } else {
    counts.ppv_send_items = 0; counts.ppv_sends = 0;
  }
  const tipsRes = await admin.from("tips").delete({ count: "exact" }).eq("model_id", modelId).eq("peer_id", peerId);
  counts.tips = tipsRes.count ?? 0;
  const fansRes = await admin.from("fans").delete({ count: "exact" }).eq("model_id", modelId).eq("peer_id", peerId);
  counts.fans = fansRes.count ?? 0;
  const evRes = await admin.from("chat_system_events").delete({ count: "exact" }).eq("model_id", modelId).eq("peer_id", peerId)
    .then((r) => r, () => ({ count: 0 }));
  counts.chat_system_events = (evRes as { count?: number }).count ?? 0;

  return Response.json({ ok: true, counts });
}
