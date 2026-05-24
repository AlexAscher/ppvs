import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

// PATCH - accept or decline an invitation (chatter side)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await request.json(); // "accept" | "decline"
    if (action !== "accept" && action !== "decline") {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const admin = createAdminSupabaseClient();

    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .select("id, agency_id, agency_name, chatter_email, chatter_id, model_id, status")
      .eq("id", id)
      .single();
    if (invErr || !inv) return Response.json({ error: "Invitation not found" }, { status: 404 });

    if ((inv.chatter_email ?? "").toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (inv.status !== "pending") {
      return Response.json({ error: "Invitation already processed" }, { status: 409 });
    }

    if (action === "decline") {
      const { error: updErr } = await admin
        .from("invitations")
        .update({ status: "declined" })
        .eq("id", id);
      if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // accept
    const { data: existing } = await admin
      .from("agency_chatters")
      .select("id")
      .eq("chatter_id", user.id)
      .maybeSingle();
    if (existing) {
      return Response.json({ error: "You are already part of an agency" }, { status: 409 });
    }

    const { error: insErr } = await admin.from("agency_chatters").insert({
      agency_id: inv.agency_id,
      chatter_id: user.id,
      invitation_id: inv.id,
      model_id: inv.model_id,
    });
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

    await admin.from("invitations").update({ status: "accepted" }).eq("id", id);

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

// DELETE - agency removes a chatter from team (uses invitation id is allowed too,
// but we'll handle remove via /api/chatters/[id] - see other route).
