import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const { email, modelId } = await request.json();
    if (!email || !modelId) {
      return Response.json({ error: "email and modelId are required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminSupabaseClient();

    // verify model belongs to this agency
    const { data: model, error: modelErr } = await admin
      .from("models")
      .select("id, name, agency_user_id")
      .eq("id", modelId)
      .single();
    if (modelErr || !model) return Response.json({ error: "Model not found" }, { status: 404 });
    if (model.agency_user_id !== user.id) {
      return Response.json({ error: "This model does not belong to you" }, { status: 403 });
    }

    // find target user by email
    const lower = String(email).trim().toLowerCase();
    if (lower === (user.email ?? "").toLowerCase()) {
      return Response.json({ error: "You can't invite yourself" }, { status: 400 });
    }
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) return Response.json({ error: listErr.message }, { status: 500 });
    const target = list.users.find((u) => (u.email ?? "").toLowerCase() === lower);
    if (!target) {
      return Response.json({ error: "No user with this email is registered on ppvs.io" }, { status: 404 });
    }

    // check if this chatter is already in an agency
    const { data: existingChatter } = await admin
      .from("agency_chatters")
      .select("id")
      .eq("chatter_id", target.id)
      .maybeSingle();
    if (existingChatter) {
      return Response.json({ error: "This user is already part of an agency" }, { status: 409 });
    }

    // check for existing pending invitation from same agency to same email
    const { data: existingInvite } = await admin
      .from("invitations")
      .select("id")
      .eq("agency_id", user.id)
      .eq("chatter_email", lower)
      .eq("status", "pending")
      .maybeSingle();
    if (existingInvite) {
      return Response.json({ error: "Pending invitation already exists for this email" }, { status: 409 });
    }

    const agencyName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.display_name as string | undefined) ||
      user.email ||
      "Agency";

    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .insert({
        agency_id: user.id,
        agency_name: agencyName,
        chatter_email: lower,
        chatter_id: target.id,
        model_id: modelId,
        status: "pending",
      })
      .select("id, agency_id, agency_name, chatter_email, chatter_id, model_id, status, created_at")
      .single();

    if (invErr) return Response.json({ error: invErr.message }, { status: 500 });

    return Response.json({ invitation: inv });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
