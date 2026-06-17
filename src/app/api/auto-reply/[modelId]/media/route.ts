import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET /api/auto-reply/[modelId]/media
 *
 * Redirects to a fresh signed URL for the model's auto-reply attachment
 * stored in the `ppvs` Supabase Storage bucket. We use a signed URL (not
 * the public URL) so the preview keeps loading even after the bucket is
 * flipped to PRIVATE per the security rollout. The bucket path follows
 * the same scheme the AutoRepliesSection client uploads with:
 *   {agencyUserId}/auto_reply_{modelId}.<ext>
 *
 * We don't know the exact extension server-side (caller already stored
 * the URL in models.auto_reply_media_url), so we extract the path from
 * that stored URL and sign it directly.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("models")
      .select("auto_reply_media_url")
      .eq("id", modelId)
      .maybeSingle();
    if (error || !data) return new Response("Not found", { status: 404 });

    const url = (data as { auto_reply_media_url: string | null }).auto_reply_media_url;
    if (!url) return new Response("No attachment", { status: 404 });

    // Strip the cache-buster (?t=...) and extract the storage path.
    const clean = url.split("?")[0];
    const m = clean.match(/\/storage\/v1\/object\/public\/ppvs\/(.+)$/);
    if (!m) {
      // Already a non-Storage URL — just redirect through. Keeps legacy
      // values working.
      return Response.redirect(clean, 302);
    }
    const path = m[1];

    const signed = await admin.storage.from("ppvs").createSignedUrl(path, 300);
    if (signed.error || !signed.data?.signedUrl) {
      return new Response("Sign failed", { status: 500 });
    }
    return Response.redirect(signed.data.signedUrl, 302);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return new Response(msg, { status: 500 });
  }
}
