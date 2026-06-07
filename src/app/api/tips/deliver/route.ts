import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { consume, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { sendSalesAlert } from "@/lib/sales-alerts";

type TipRow = {
  id: string;
  model_id: string;
  peer_id: string;
  peer_username: string | null;
  amount: number | string;
  message: string | null;
  status: string;
};

/**
 * POST /api/tips/deliver
 * Body: { code }
 *
 * Marks a pending tip as paid. Called by the fan-facing /tip/[code] page
 * when the fan clicks "Send Tip". Idempotent — returns ok even if the tip
 * was already paid (alreadyPaid: true).
 *
 * Balance impact: the amount is stored in tips.amount where status='paid'.
 * The dashboard stats route reads this table to compute tip revenue.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!consume(`tip-deliver|${ip}`, 20, 60_000)) return tooManyRequests(60);

    const body = (await req.json().catch(() => null)) as { code?: string } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code.length < 6 || code.length > 20 || !/^[a-z0-9]+$/.test(code)) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    const { data: tip, error } = await admin
      .from("tips")
      .select("id, model_id, peer_id, peer_username, amount, message, status")
      .eq("code", code)
      .maybeSingle();

    if (error) return Response.json({ error: `DB: ${error.message}` }, { status: 500 });
    if (!tip) return Response.json({ error: "Not found" }, { status: 404 });

    const tipRow = tip as TipRow;

    if (tipRow.status === "paid") {
      return Response.json({ ok: true, alreadyPaid: true });
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("tips")
      .update({ status: "paid", paid_at: now })
      .eq("id", tipRow.id);

    if (updateErr) {
      return Response.json({ error: `DB update: ${updateErr.message}` }, { status: 500 });
    }

    // Best-effort: update fans.total_spent so the fan drawer shows the total.
    // Not awaited on the critical path — fan sees the "Thank you" screen first.
    void (async () => {
      try {
        const { data: existing } = await admin
          .from("fans")
          .select("id, total_spent")
          .eq("model_id", tipRow.model_id)
          .eq("peer_id", tipRow.peer_id)
          .maybeSingle();
        const prev = Number((existing as { total_spent?: number } | null)?.total_spent ?? 0);
        const next = prev + Number(tipRow.amount ?? 0);
        await admin.from("fans").upsert(
          {
            model_id: tipRow.model_id,
            peer_id: tipRow.peer_id,
            telegram_username: tipRow.peer_username,
            total_spent: next,
            last_seen_at: now,
          },
          { onConflict: "model_id,peer_id" },
        );
      } catch (e: unknown) {
        console.error(
          "[tips/deliver] fans.total_spent update failed:",
          e instanceof Error ? e.message : e,
        );
      }
    })();

    // Sales Alert for tips (fire-and-forget).
    void (async () => {
      try {
        const { data: modelRow } = await admin
          .from("models")
          .select("name, agency_user_id")
          .eq("id", tipRow.model_id)
          .maybeSingle();
        const agencyUserId = (modelRow as { agency_user_id?: string } | null)?.agency_user_id;
        if (!agencyUserId) return;

        sendSalesAlert({
          type: "tip",
          agencyUserId,
          modelId: tipRow.model_id,
          modelName: (modelRow as { name?: string } | null)?.name ?? undefined,
          fanDisplay: tipRow.peer_username ? `@${tipRow.peer_username}` : "Fan",
          amount: Number(tipRow.amount ?? 0),
          message: tipRow.message,
        });
      } catch (e: unknown) {
        console.error(
          "[tips/deliver] sales-alert dispatch failed:",
          e instanceof Error ? e.message : e,
        );
      }
    })();

    return Response.json({ ok: true, alreadyPaid: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[tips/deliver POST] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
