import { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Find a user in `auth.users` by email, scanning all pages of listUsers.
 *
 * The naive single-page approach silently returned "not found" if the
 * project had more than 1000 users (Supabase's max page size) or if the
 * target happened to fall outside page 1. We loop until found or pages
 * are exhausted.
 */
async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const lower = email.toLowerCase().trim();
  const PER_PAGE = 1000;
  let totalScanned = 0;

  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
    totalScanned += data.users.length;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === lower);
    if (found) {
      console.log(`[invite] matched ${lower} (scanned ${totalScanned} users)`);
      return found;
    }
    // If we got fewer than a full page, that was the last page.
    if (data.users.length < PER_PAGE) break;
  }
  console.log(`[invite] no match for ${lower} (scanned ${totalScanned} users)`);
  return null;
}

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

    // find target user by email — paginated lookup
    const lower = String(email).trim().toLowerCase();
    if (lower === (user.email ?? "").toLowerCase()) {
      return Response.json({ error: "You can't invite yourself" }, { status: 400 });
    }
    const target = await findAuthUserByEmail(admin, lower);
    if (!target) {
      return Response.json(
        {
          error:
            `No user with email "${lower}" is registered on ppvs.io. ` +
            `Ask them to complete signup first.`,
        },
        { status: 404 },
      );
    }

    // Check if this chatter is already in an agency. A chatter may now have
    // several rows (multi-model), so fetch the list rather than .single().
    // If they're already on THIS agency, point the agency at the multi-model
    // selector instead of the invite flow.
    const { data: existingRows } = await admin
      .from("agency_chatters")
      .select("agency_id")
      .eq("chatter_id", target.id);
    const existing = (existingRows ?? []) as { agency_id: string }[];
    if (existing.some((r) => r.agency_id === user.id)) {
      return Response.json(
        { error: "This chatter is already on your team — assign extra models from the Creator column." },
        { status: 409 },
      );
    }
    if (existing.length > 0) {
      return Response.json({ error: "This user is already part of another agency" }, { status: 409 });
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

    // v3: since the target chatter is already registered (findAuthUserByEmail
    // matched), skip the pending-invitation step and link them straight into
    // the agency. Keep the invitations row for audit but with status='accepted'
    // + accepted_at set so the chatter's history is preserved. The old
    // pending-flow only kicks in when the email isn't a ppvs.io user yet,
    // which is caught above with a 404.
    const nowIso = new Date().toISOString();
    const { data: inv, error: invErr } = await admin
      .from("invitations")
      .insert({
        agency_id: user.id,
        agency_name: agencyName,
        chatter_email: lower,
        chatter_id: target.id,
        model_id: modelId,
        status: "accepted",
      })
      .select("id, agency_id, agency_name, chatter_email, chatter_id, model_id, status, created_at")
      .single();
    if (invErr) return Response.json({ error: invErr.message }, { status: 500 });
    // Bind chatter to model immediately.
    const { error: acErr } = await admin
      .from("agency_chatters")
      .insert({
        agency_id: user.id,
        chatter_id: target.id,
        model_id: modelId,
        invitation_id: (inv as { id: string }).id,
        joined_at: nowIso,
      });
    if (acErr) return Response.json({ error: acErr.message }, { status: 500 });

    return Response.json({ invitation: inv, linked: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[chatters/invite POST] error:", message);
    return Response.json({ error: message }, { status: 400 });
  }
}
