import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * POST /api/admin/ppvs/[id]  { status: 'approved'|'rejected'|'pending', notes? }
 *
 * Admin-only. Flips the review_status of a single PPV row and records
 * who/when did it. Used by the Vault section inside the agency drill-down
 * and the global review queue.
 *
 * No body validation beyond enum-checking — the entity ids come straight
 * from the admin's own UI, which only ever sees rows it was already shown.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Bad id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    notes?: string | null;
  } | null;
  if (!body?.status || !["pending", "approved", "rejected"].includes(body.status)) {
    return Response.json({ error: "status must be pending|approved|rejected" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const patch: Record<string, unknown> = {
    review_status: body.status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user.id,
  };
  if (typeof body.notes === "string") {
    patch.review_notes = body.notes.slice(0, 2000) || null;
  } else if (body.notes === null) {
    patch.review_notes = null;
  }

  const { error, data } = await admin
    .from("ppvs")
    .update(patch)
    .eq("id", id)
    .select("id, review_status")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, ppv: data });
}
