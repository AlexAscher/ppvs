import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { materializeRecipients, type Filters } from "@/lib/mass-dm";

/**
 * POST /api/mass-dm/create { modelId, message, filters, jitterMinMs?, jitterMaxMs? }
 *
 * Validates ownership, materializes the recipient snapshot, inserts a
 * mass_dm_campaigns row + N mass_dm_recipients rows in one shot. Returns
 * { campaignId, total } so the UI can show "247 ready" and then call
 * /start.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    modelId?: string;
    message?: string;
    filters?: Filters;
    jitterMinMs?: number;
    jitterMaxMs?: number;
    dailyLimit?: number;
    excludePeerIds?: string[];
  } | null;
  if (!body?.modelId) return Response.json({ error: "modelId required" }, { status: 400 });
  if (!body.message?.trim()) return Response.json({ error: "message required" }, { status: 400 });
  if (body.message.length > 4096) {
    return Response.json({ error: "message too long" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: m } = await admin
    .from("models")
    .select("id, agency_user_id")
    .eq("id", body.modelId)
    .maybeSingle();
  if (!m) return Response.json({ error: "Model not found" }, { status: 404 });
  const agencyUserId = (m as { agency_user_id: string }).agency_user_id;
  if (agencyUserId !== user.id) {
    // TODO: allow chatter linked to this model via agency_chatters too.
    return Response.json({ error: "Model not yours" }, { status: 403 });
  }

  let fans = await materializeRecipients(admin, body.modelId, body.filters ?? {});
  // Drop any fans the user explicitly excluded in the preview list.
  if (body.excludePeerIds && body.excludePeerIds.length > 0) {
    const ex = new Set(body.excludePeerIds);
    fans = fans.filter((f) => !ex.has(f.peer_id));
  }
  if (fans.length === 0) {
    return Response.json({ error: "No recipients match these filters" }, { status: 400 });
  }

  const jitterMin = Math.max(500, body.jitterMinMs ?? 20_000);
  const jitterMax = Math.max(jitterMin + 100, body.jitterMaxMs ?? 40_000);
  // Daily cap — defaults to 200/day. 0 or negative means "no cap".
  const dailyLimit =
    body.dailyLimit && body.dailyLimit > 0 ? Math.floor(body.dailyLimit) : null;

  // Insert campaign first so we have the FK target. daily_limit is in a
  // separate column added by 20260610_mass_dm_daily_limit.sql; if the
  // migration hasn't run yet, retry the insert without it.
  const baseRow = {
    agency_user_id: agencyUserId,
    model_id: body.modelId,
    started_by: user.id,
    message: body.message,
    filters: body.filters ?? {},
    jitter_min_ms: jitterMin,
    jitter_max_ms: jitterMax,
    total_recipients: fans.length,
    status: "pending",
  };
  let campaignRes = await admin
    .from("mass_dm_campaigns")
    .insert({ ...baseRow, daily_limit: dailyLimit })
    .select("id")
    .single();
  if (campaignRes.error && /daily_limit/.test(campaignRes.error.message)) {
    // Column not present yet — fall back so the feature still works.
    campaignRes = await admin
      .from("mass_dm_campaigns")
      .insert(baseRow)
      .select("id")
      .single();
  }
  if (campaignRes.error || !campaignRes.data) {
    return Response.json({ error: campaignRes.error?.message ?? "Insert failed" }, { status: 500 });
  }
  const campaignId = (campaignRes.data as { id: string }).id;

  // Insert recipients in chunks (Supabase default insert payload limit).
  const CHUNK = 500;
  for (let i = 0; i < fans.length; i += CHUNK) {
    const chunk = fans.slice(i, i + CHUNK).map((f, idx) => ({
      campaign_id: campaignId,
      peer_id: f.peer_id,
      peer_username: f.telegram_username,
      first_name: (f.telegram_name ?? "").split(" ")[0] || null,
      ordinal: i + idx,
    }));
    const { error: rErr } = await admin.from("mass_dm_recipients").insert(chunk);
    if (rErr) {
      // Best-effort cleanup so we don't leave half-created campaigns.
      await admin.from("mass_dm_campaigns").delete().eq("id", campaignId);
      return Response.json({ error: rErr.message }, { status: 500 });
    }
  }

  return Response.json({ campaignId, total: fans.length });
}
