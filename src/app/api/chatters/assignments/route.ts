import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Manage a chatter's model assignments (multi-model support).
 *
 *   POST   { chatterId, modelId }  → assign the chatter to one more model
 *   DELETE { chatterId, modelId }  → unassign that model
 *
 * Both require the caller to be the agency that owns the model AND for the
 * chatter to already belong to this agency (you can't assign a model to a
 * stranger — invite them first). One agency_chatters row == one assignment.
 */

async function authAgency(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return { error: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  const body = (await req.json().catch(() => ({}))) as { chatterId?: string; modelId?: string };
  const chatterId = typeof body.chatterId === "string" ? body.chatterId : "";
  const modelId = typeof body.modelId === "string" ? body.modelId : "";
  if (!chatterId || !modelId) {
    return { error: Response.json({ error: "chatterId and modelId required" }, { status: 400 }) };
  }
  const admin = createAdminSupabaseClient();

  // The model must belong to the calling agency.
  const { data: model } = await admin
    .from("models")
    .select("id, agency_user_id")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || (model as { agency_user_id: string }).agency_user_id !== user.id) {
    return { error: Response.json({ error: "Model not in your agency" }, { status: 403 }) };
  }
  return { admin, agencyId: user.id, chatterId, modelId };
}

export async function POST(req: NextRequest) {
  const a = await authAgency(req);
  if ("error" in a) return a.error;
  const { admin, agencyId, chatterId, modelId } = a;

  // The chatter must already be on this agency's team (some other model row).
  const { data: existing } = await admin
    .from("agency_chatters")
    .select("id, model_id")
    .eq("agency_id", agencyId)
    .eq("chatter_id", chatterId);
  const rows = (existing ?? []) as { id: string; model_id: string | null }[];
  if (rows.length === 0) {
    return Response.json({ error: "Chatter is not on your team" }, { status: 403 });
  }
  // Already assigned to this model? No-op success.
  if (rows.some((r) => r.model_id === modelId)) {
    return Response.json({ ok: true, alreadyAssigned: true });
  }

  const { data: inserted, error } = await admin
    .from("agency_chatters")
    .insert({ agency_id: agencyId, chatter_id: chatterId, model_id: modelId })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id: (inserted as { id: string }).id });
}

export async function DELETE(req: NextRequest) {
  const a = await authAgency(req);
  if ("error" in a) return a.error;
  const { admin, agencyId, chatterId, modelId } = a;

  const { error } = await admin
    .from("agency_chatters")
    .delete()
    .eq("agency_id", agencyId)
    .eq("chatter_id", chatterId)
    .eq("model_id", modelId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
