import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * Past PPV sends for a specific fan (model + peer). Used by the Fan
 * Profile Drawer to render purchase history. Joined with ppv_send_items →
 * ppvs to expose item count + names.
 */

type HistoryRowRaw = {
  id: string;
  code: string;
  total_price: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  delivered_at: string | null;
  ppv_send_items: { ppvs: { name: string } | null }[] | null;
};

export type HistoryRow = {
  id: string;
  code: string;
  totalPrice: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  itemNames: string[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const peerId = new URL(req.url).searchParams.get("peerId");
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("ppv_sends")
      .select(
        "id, code, total_price, status, created_at, paid_at, delivered_at, ppv_send_items(ppvs(name))",
      )
      .eq("model_id", modelId)
      .eq("peer_id", peerId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const history: HistoryRow[] = ((data ?? []) as unknown as HistoryRowRaw[]).map((r) => ({
      id: r.id,
      code: r.code,
      totalPrice: Number(r.total_price ?? 0),
      status: r.status,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      deliveredAt: r.delivered_at,
      itemNames: (r.ppv_send_items ?? [])
        .map((it) => it.ppvs?.name)
        .filter((s): s is string => !!s),
    }));

    return Response.json({ history });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
