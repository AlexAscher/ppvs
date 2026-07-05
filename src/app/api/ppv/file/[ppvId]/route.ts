import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { requireAdmin } from "@/lib/admin-auth";
import { ppvMediaPathFromUrl } from "@/lib/ppv-storage";

/**
 * GET /api/ppv/file/{ppvId}?kind=original|preview
 *
 * 302-redirects to a short-lived SIGNED Storage url. This is what lets the
 * `ppvs` bucket be flipped to PRIVATE without breaking anything — bytes never
 * have a stable public url, only a 5-minute signed one minted per request.
 * A signed url is valid whether the bucket is public or private, so deploying
 * this ahead of the flip is safe.
 *
 * Authorization:
 *   • kind=preview  → PUBLIC. Previews are pre-blurred and meant to be shown
 *     on the fan-facing /pay + Mini App pages (anonymous viewers), so they
 *     don't require a session.
 *   • kind=original → the agency owner of the PPV's model, a chatter assigned
 *     to it, or the platform admin. This is the un-paywalled file.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ppvId: string }> },
) {
  const { ppvId } = await params;
  const kind = new URL(req.url).searchParams.get("kind") === "preview" ? "preview" : "original";

  const admin = createAdminSupabaseClient();
  const { data: ppv } = await admin
    .from("ppvs")
    .select("id, model_id, media_url, preview_url")
    .eq("id", ppvId)
    .maybeSingle();
  if (!ppv) return Response.json({ error: "Not found" }, { status: 404 });
  const row = ppv as {
    model_id: string;
    media_url: string | null;
    preview_url: string | null;
  };

  // Originals require authorization; previews are public (blurred).
  if (kind === "original") {
    const user = await getCachedAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let allowed = false;
    // Platform admin sees everything (moderation queue / lightbox).
    const adminCheck = await requireAdmin();
    if (!("errorResponse" in adminCheck)) {
      allowed = true;
    }
    if (!allowed) {
      const { data: model } = await admin
        .from("models")
        .select("agency_user_id")
        .eq("id", row.model_id)
        .maybeSingle();
      const agencyUserId = (model as { agency_user_id?: string } | null)?.agency_user_id;
      allowed = agencyUserId === user.id;
      if (!allowed) {
        const { data: link } = await admin
          .from("agency_chatters")
          .select("chatter_id")
          .eq("chatter_id", user.id)
          .eq("model_id", row.model_id)
          .maybeSingle();
        allowed = !!link;
      }
    }
    if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sourceUrl = kind === "preview" ? row.preview_url : row.media_url;
  if (!sourceUrl) return Response.json({ error: "No media" }, { status: 404 });
  const path = ppvMediaPathFromUrl(sourceUrl);
  if (!path) {
    // Not a Storage url we recognise. Do NOT redirect — media_url is written
    // by an anon-key client, so a hostile agency could otherwise turn this
    // endpoint into a public open-redirect (kind=preview is unauthenticated).
    return Response.json({ error: "No media" }, { status: 404 });
  }

  const { data: signed, error } = await admin.storage
    .from("ppvs")
    .createSignedUrl(path, 300);
  if (error || !signed?.signedUrl) {
    return Response.json({ error: "Sign failed" }, { status: 500 });
  }
  return Response.redirect(signed.signedUrl, 302);
}
