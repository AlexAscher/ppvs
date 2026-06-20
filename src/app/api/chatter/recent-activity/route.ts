import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { agencyNet } from "@/lib/platform";

/**
 * GET /api/chatter/recent-activity
 *
 * Last 10 paid PPV sends + tips owned by the currently-authenticated chatter,
 * merged by paid_at descending. Drives the "Recent Activities" card on the
 * chatter's dashboard — the agency dashboard has its own live feed, this is
 * the chatter's equivalent.
 */

export type ChatterActivityItem = {
  id: string;
  kind: "ppv" | "tip";
  amount: number; // gross
  net: number; // after platform fee
  peerId: string;
  modelId: string;
  fanName: string | null;
  paidAt: string;
};

const LIMIT = 10;

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();

  // Pull a generous window of recent paid rows, sorted by paid_at on the
  // server so we don't have to materialise the whole history client-side.
  // `or` filters with two date columns aren't possible in the JS query builder
  // here, so we just take a slice and re-sort/trim after merging.
  const [sendsRes, tipsRes] = await Promise.all([
    admin
      .from("ppv_sends")
      .select("id, total_price, status, paid_at, peer_id, model_id")
      .eq("chatter_id", user.id)
      .in("status", ["paid", "delivered"])
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(LIMIT),
    admin
      .from("tips")
      .select("id, amount, status, paid_at, peer_id, model_id")
      .eq("chatter_id", user.id)
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(LIMIT),
  ]);

  type PSend = {
    id: string;
    total_price: number | string;
    paid_at: string;
    peer_id: string;
    model_id: string;
  };
  type Tip = {
    id: string;
    amount: number | string;
    paid_at: string;
    peer_id: string;
    model_id: string;
  };
  const sends = (sendsRes.data ?? []) as PSend[];
  const tips = (tipsRes.data ?? []) as Tip[];

  // Resolve display names from the fans table in one round-trip.
  const peerKeys = Array.from(
    new Set(
      [
        ...sends.map((s) => `${s.model_id}:${s.peer_id}`),
        ...tips.map((t) => `${t.model_id}:${t.peer_id}`),
      ],
    ),
  );
  const fanNameByKey = new Map<string, string | null>();
  if (peerKeys.length > 0) {
    // Build OR filter — there's no native composite key lookup in PostgREST.
    // Pull all fans whose peer_id appears anywhere in our slice and bucket by
    // the composite key client-side.
    const peerIds = Array.from(new Set([...sends.map((s) => s.peer_id), ...tips.map((t) => t.peer_id)]));
    const { data: fans } = await admin
      .from("fans")
      .select("model_id, peer_id, telegram_name, telegram_username")
      .in("peer_id", peerIds);
    for (const f of (fans ?? []) as {
      model_id: string;
      peer_id: string;
      telegram_name: string | null;
      telegram_username: string | null;
    }[]) {
      const name = f.telegram_name?.trim() || (f.telegram_username ? `@${f.telegram_username}` : null);
      fanNameByKey.set(`${f.model_id}:${f.peer_id}`, name);
    }
  }

  const merged: ChatterActivityItem[] = [];
  for (const s of sends) {
    const gross = Number(s.total_price ?? 0);
    merged.push({
      id: `ppv:${s.id}`,
      kind: "ppv",
      amount: gross,
      net: Math.round(agencyNet(gross) * 100) / 100,
      peerId: s.peer_id,
      modelId: s.model_id,
      fanName: fanNameByKey.get(`${s.model_id}:${s.peer_id}`) ?? null,
      paidAt: s.paid_at,
    });
  }
  for (const t of tips) {
    const gross = Number(t.amount ?? 0);
    merged.push({
      id: `tip:${t.id}`,
      kind: "tip",
      amount: gross,
      net: Math.round(agencyNet(gross) * 100) / 100,
      peerId: t.peer_id,
      modelId: t.model_id,
      fanName: fanNameByKey.get(`${t.model_id}:${t.peer_id}`) ?? null,
      paidAt: t.paid_at,
    });
  }

  merged.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  return Response.json({ activity: merged.slice(0, LIMIT) });
}
