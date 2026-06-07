import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
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
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    modelId?: string;
    message?: string;
    filters?: Filters;
    jitterMinMs?: number;
    jitterMaxMs?: number;
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

  const fans = await materializeRecipients(admin, body.modelId, body.filters ?? {});
  if (fans.length === 0) {
    return Response.json({ error: "No recipients match these filters" }, { status: 400 });
  }

  const jitterMin = Math.max(500, body.jitterMinMs ?? 2000);
  const jitterMax = Math.max(jitterMin + 100, body.jitterMaxMs ?? 4000);

  // Insert campaign first so we have the FK target.
  const { data: campaign, error: cErr } = await admin
    .from("mass_dm_campaigns")
    .insert({
      agency_user_id: agencyUserId,
      model_id: body.modelId,
      started_by: user.id,
      message: body.message,
      filters: body.filters ?? {},
      jitter_min_ms: jitterMin,
      jitter_max_ms: jitterMax,
      total_recipients: fans.length,
      status: "pending",
    })
    .select("id")
    .single();
  if (cErr || !campaign) {
    return Response.json({ error: cErr?.message ?? "Insert failed" }, { status: 500 });
  }
  const campaignId = (campaign as { id: string }).id;

  // Insert recipients in chunks (Supabase default insert payload limit).
  const CHUNK = 500;
  for (let i = 0; i < fans.length; i += CHUNK) {
    const chunk = fans.slice(i, i + CHUNK).map((f, idx) => ({
      campaign_id: campaignId,
      peer_id: f.peer_id,
      peer_access_hash: f.peer_access_hash,
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
