import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getCachedAuthUser } from "@/lib/auth-cache";
import { requireAdmin } from "@/lib/admin-auth";
import { ppvMediaPathFromUrl, ppvMediaKind } from "@/lib/ppv-storage";

/**
 * GET /api/ppv/thumb/{ppvId}
 *
 * Small Vault-grid / picker tile. The `ppvs` bucket is PRIVATE, so the stored
 * `getPublicUrl` strings (thumb_url / preview_url / media_url) all 403 when
 * fetched directly — that's why the earlier version rendered black tiles
 * everywhere. Like /api/ppv/file, we resolve the storage PATH and mint a
 * short-lived SIGNED url, then proxy the bytes so the browser can cache the
 * tile under the stable /api/ppv/thumb/{id} url (private cache — this is
 * authenticated agency content, never a shared CDN).
 *
 * Source selection (all agency/admin-facing — see Auth):
 *   1. thumb_url   — crisp 400px JPEG from batch 99 uploads (~20 KB).
 *   2. media_url   — for IMAGE rows without a thumb (pre-batch-99): the
 *      original is a valid crisp <img> source. Small vaults, browser-cached.
 *   3. preview_url — video poster, or blurred fallback for old images with
 *      no usable original. Never point an <img> at a video's media_url.
 *
 * Auth: agency owner of the PPV's model, a chatter assigned to it, or the
 * platform admin. This endpoint is used ONLY in agency/admin surfaces (Vault,
 * chatter workspace, admin moderation, auto-reply settings) — never on a
 * fan-facing page — so gating it here prevents an unblurred thumbnail from
 * leaking the paywalled content to anonymous visitors.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ppvId: string }> },
) {
  const { ppvId } = await params;
  if (!ppvId) return Response.json({ error: "ppvId required" }, { status: 400 });

  const user = await getCachedAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: ppv } = await admin
    .from("ppvs")
    .select("model_id, thumb_url, preview_url, media_url")
    .eq("id", ppvId)
    .maybeSingle();
  if (!ppv) return Response.json({ error: "Not found" }, { status: 404 });
  const row = ppv as {
    model_id: string;
    thumb_url: string | null;
    preview_url: string | null;
    media_url: string | null;
  };

  // Authorize: admin, or the owning agency, or a chatter assigned to the model.
  let allowed = false;
  const adminCheck = await requireAdmin();
  if (!("errorResponse" in adminCheck)) allowed = true;
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

  // Ordered candidates, best first. thumb_url is the crisp 400px tile; for
  // IMAGE rows the original is a valid crisp <img> source (a video's media_url
  // is an .mp4 an <img> can't render, so it's excluded); preview_url is the
  // video poster / blurred fallback. We try each in turn and serve the first
  // that signs + fetches, so an old row with a missing thumb or a
  // moved/deleted original still renders via the next candidate instead of
  // dead-ending on a black tile.
  const isImageMedia = !!row.media_url && ppvMediaKind(row.media_url) === "image";
  const candidates = [
    row.thumb_url,
    isImageMedia ? row.media_url : null,
    row.preview_url,
  ].filter((u): u is string => !!u);

  for (const candidate of candidates) {
    // Only proxy ppvs-bucket urls we recognise — never an arbitrary url
    // (media_url is written by an anon-key client).
    const path = ppvMediaPathFromUrl(candidate);
    if (!path) continue;

    const { data: signed, error } = await admin.storage
      .from("ppvs")
      .createSignedUrl(path, 300);
    if (error || !signed?.signedUrl) continue;

    try {
      const upstream = await fetch(signed.signedUrl);
      if (!upstream.ok) continue;
      const buf = new Uint8Array(await upstream.arrayBuffer());
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
          "Content-Length": String(buf.byteLength),
          // Private = only browser may cache (never CDN — this endpoint is
          // auth-gated). `immutable` is the critical bit: without it Chrome
          // treats a regular F5 as a hint to revalidate and refetches every
          // tile from us; with `immutable` it uses the cache and doesn't
          // hit the network until max-age expires. 7 days for thumbs — the
          // /api/ppv/thumb/{id} url is stable per PPV, so a longer TTL
          // just means one less refetch per week.
          "Cache-Control": "private, max-age=604800, immutable",
        },
      });
    } catch (e) {
      console.error("[ppv/thumb] proxy error:", e instanceof Error ? e.message : e);
      continue;
    }
  }

  return new Response("No thumb", { status: 404 });
}
