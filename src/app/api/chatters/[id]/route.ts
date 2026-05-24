import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

// PATCH - agency reassigns the chatter to another model
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { modelId } = await request.json();

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminSupabaseClient();

    const { data: row, error: rErr } = await admin
      .from("agency_chatters")
      .select("id, agency_id")
      .eq("id", id)
      .single();
    if (rErr || !row) return Response.json({ error: "Not found" }, { status: 404 });
    if (row.agency_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

    if (modelId) {
      const { data: m } = await admin
        .from("models")
        .select("id, agency_user_id")
        .eq("id", modelId)
        .single();
      if (!m || m.agency_user_id !== user.id) {
        return Response.json({ error: "Model not in your agency" }, { status: 403 });
      }
    }

    const { error: updErr } = await admin
      .from("agency_chatters")
      .update({ model_id: modelId ?? null })
      .eq("id", id);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

// DELETE - remove a chatter from this agency
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminSupabaseClient();

    const { data: row, error: rErr } = await admin
      .from("agency_chatters")
      .select("id, agency_id")
      .eq("id", id)
      .single();
    if (rErr || !row) return Response.json({ error: "Not found" }, { status: 404 });
    if (row.agency_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { error: delErr } = await admin.from("agency_chatters").delete().eq("id", id);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
