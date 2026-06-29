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

export type PpvSendItem = {
  id: string;
  code: string;
  created_at: string;
  caption: string | null;
  total_price: number;
  status: string;
  paid_at: string | null;
  previewUrls: string[];
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
    const [eventsRes, sendsRes] = await Promise.all([
      admin
        .from("chat_system_events")
        .select("id, kind, amount, body, created_at")
        .eq("model_id", modelId)
        .eq("peer_id", peerId)
        .order("created_at", { ascending: true })
        .limit(100),
      // PPV sends targeting this (model, peer). We surface them so the chatter
      // view can render its own permanently-blurred placeholder for each one —
      // chatters never see the unblurred originals in the conversation
      // history, mirroring what the fan would see before unlocking.
      admin
        .from("ppv_sends")
        .select("id, code, created_at, caption, total_price, status, paid_at, ppv_send_items(ordinal, ppvs(preview_url, media_url))")
        .eq("model_id", modelId)
        .eq("peer_id", peerId)
        .in("status", ["sending", "sent", "delivered", "paid"])
        .order("created_at", { ascending: true })
        .limit(100),
    ]);
    if (eventsRes.error) return Response.json({ error: eventsRes.error.message }, { status: 500 });

    type ItemJoin = { ordinal: number; ppvs: { preview_url: string | null; media_url: string | null } | { preview_url: string | null; media_url: string | null }[] | null };
    type SendRow = {
      id: string; code: string; created_at: string; caption: string | null;
      total_price: number | string; status: string; paid_at: string | null;
      ppv_send_items: ItemJoin[] | null;
    };
    const sends: PpvSendItem[] = ((sendsRes.data ?? []) as SendRow[]).map((s) => {
      const items = (s.ppv_send_items ?? [])
        .slice()
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map((it) => {
          const ppv = Array.isArray(it.ppvs) ? it.ppvs[0] ?? null : it.ppvs;
          return ppv?.preview_url || ppv?.media_url || null;
        })
        .filter((u): u is string => !!u);
      return {
        id: s.id,
        code: s.code,
        created_at: s.created_at,
        caption: s.caption,
        total_price: Number(s.total_price ?? 0),
        status: s.status,
        paid_at: s.paid_at,
        previewUrls: items,
      };
    });

    return Response.json({
      events: (eventsRes.data ?? []) as ChatSystemEvent[],
      sends,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[chat-events GET]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
