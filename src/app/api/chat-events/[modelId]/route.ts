import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/chat-events/{modelId}?peerId=...
 *
 * Returns chronological list of chatter-only system events for the given
 * (model, peer): tip/PPV purchases logged when a fan completes a payment.
 * The chatter UI merges them with the Telegram message list so the chatter
 * sees "Customer paid a tip of $X" inline with the conversation.
 *
 * Auth: same authorizeModelAccess gate as the regular messages route.
 */

export type ChatSystemEvent = {
  id: string;
  kind: "tip_paid" | "ppv_paid";
  amount: number | null;
  body: string;
  created_at: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const peerId = new URL(req.url).searchParams.get("peerId");
    if (!peerId) {
      return Response.json({ error: "peerId required" }, { status: 400 });
    }

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("chat_system_events")
      .select("id, kind, amount, body, created_at")
      .eq("model_id", modelId)
      .eq("peer_id", peerId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ events: (data ?? []) as ChatSystemEvent[] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[chat-events GET]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
