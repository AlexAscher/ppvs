import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";

/**
 * GET /api/notifications/pulse?since=<iso>
 *
 * Returns recently-paid TIPS and PPVs for the CURRENT user (chatter or
 * agency owner) since the supplied ISO timestamp. The frontend polls this
 * every few seconds and renders a top-right toast for each new event so
 * the chatter who *generated* the pay code knows the moment their fan
 * paid — without leaving whatever page they're on.
 *
 * Auth: the row's `chatter_id` (set when the chatter generated the link)
 * must equal auth.uid(). If chatter_id is null on legacy rows we fall back
 * to model.agency_user_id so the agency owner still sees their own
 * payments.
 */

export type NotificationEvent = {
  id: string;
  kind: "tip_paid" | "ppv_paid";
  amount: number;
  /** Telegram @username of the fan who paid, or null. */
  peerUsername: string | null;
  /** Model the payment landed on (for multi-creator agencies). */
  modelName: string | null;
  paidAt: string;
};

export async function GET(req: NextRequest) {
  const user = await getCachedAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam))
    ? new Date(sinceParam).toISOString()
    : new Date(Date.now() - 5 * 60_000).toISOString();

  const admin = createAdminSupabaseClient();

  // Pre-build model_id → name + agency_user_id map so we can attribute
  // events to a specific creator AND fall back to agency owner when
  // chatter_id wasn't set on the row.
  const { data: models } = await admin
    .from("models")
    .select("id, name, agency_user_id");
  type ModelLite = { id: string; name: string; agency_user_id: string };
  const modelById = new Map<string, ModelLite>(
    ((models ?? []) as ModelLite[]).map((m) => [m.id, m]),
  );

  // Tips + PPVs in parallel — same shape, different columns.
  const [tipsRes, ppvsRes] = await Promise.all([
    admin
      .from("tips")
      .select("id, model_id, chatter_id, amount, peer_username, paid_at")
      .eq("status", "paid")
      .gt("paid_at", since)
      .order("paid_at", { ascending: false })
      .limit(20),
    admin
      .from("ppv_sends")
      .select("id, model_id, chatter_id, total_price, peer_username, paid_at, status")
      .in("status", ["paid", "delivered"])
      .gt("paid_at", since)
      .order("paid_at", { ascending: false })
      .limit(20),
  ]);

  type TipRowDB = {
    id: string;
    model_id: string;
    chatter_id: string | null;
    amount: number | string;
    peer_username: string | null;
    paid_at: string;
  };
  type SendRowDB = {
    id: string;
    model_id: string;
    chatter_id: string | null;
    total_price: number | string;
    peer_username: string | null;
    paid_at: string;
  };

  const events: NotificationEvent[] = [];
  for (const t of (tipsRes.data ?? []) as TipRowDB[]) {
    const owner = t.chatter_id ?? modelById.get(t.model_id)?.agency_user_id;
    if (owner !== user.id) continue;
    events.push({
      id: `tip_${t.id}`,
      kind: "tip_paid",
      amount: Number(t.amount ?? 0),
      peerUsername: t.peer_username,
      modelName: modelById.get(t.model_id)?.name ?? null,
      paidAt: t.paid_at,
    });
  }
  for (const s of (ppvsRes.data ?? []) as SendRowDB[]) {
    const owner = s.chatter_id ?? modelById.get(s.model_id)?.agency_user_id;
    if (owner !== user.id) continue;
    events.push({
      id: `ppv_${s.id}`,
      kind: "ppv_paid",
      amount: Number(s.total_price ?? 0),
      peerUsername: s.peer_username,
      modelName: modelById.get(s.model_id)?.name ?? null,
      paidAt: s.paid_at,
    });
  }

  // Most-recent first so the UI can take a slice for showing.
  events.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  return Response.json({ events, now: new Date().toISOString() });
}
