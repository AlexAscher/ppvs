import { NextRequest } from "next/server";
import bigInt from "big-integer";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { withTelegramClient } from "@/lib/telegram-pool";

// Negative cache: fans with NO Telegram avatar. Without it, every dialog-list
// render re-attempts an MTProto getInputEntity + downloadProfilePhoto for
// each avatar-less fan (the browser 404-caches per session, but a fresh
// session / another chatter re-hits). Remember "no photo" for a while so we
// answer 404 instantly and skip the MTProto round-trip. Keyed model:peer.
declare global {
  var __ppvs_fan_no_avatar__: Map<string, number> | undefined;
}
const noAvatar: Map<string, number> =
  globalThis.__ppvs_fan_no_avatar__ ?? new Map();
globalThis.__ppvs_fan_no_avatar__ = noAvatar;
const NO_AVATAR_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function noPhotoResponse(): Response {
  return new Response("No photo", {
    status: 404,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}

/**
 * GET /api/telegram/fan-avatar/[modelId]?peerId=<id>
 *
 * Returns the fan's Telegram profile photo. Cached in Supabase Storage
 * (avatars bucket, fans/<modelId>/<peerId>.jpg) so we download via
 * MTProto at most once per fan — subsequent loads 302 straight to the
 * CDN URL and the browser caches the image.
 *
 * 404 when the fan has no photo (or it can't be resolved) — the dialog
 * list falls back to coloured initials.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const peerId = new URL(req.url).searchParams.get("peerId");
    if (!peerId || !/^-?\d+$/.test(peerId)) {
      return new Response("bad peerId", { status: 400 });
    }
    // Groups / channels (negative peerId) have no fan avatar — never do the
    // MTProto dance for them.
    if (peerId.startsWith("-")) return noPhotoResponse();

    // Known avatar-less fan within the TTL → answer instantly, no MTProto.
    const noKey = `${modelId}:${peerId}`;
    const noHit = noAvatar.get(noKey);
    if (noHit && Date.now() - noHit < NO_AVATAR_TTL_MS) return noPhotoResponse();

    const ssr = await createSupabaseServerClient();
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const admin = createAdminSupabaseClient();
    const { data: model } = await admin
      .from("models")
      .select("id, agency_user_id, session_string, api_id, api_hash, session_status")
      .eq("id", modelId)
      .maybeSingle();
    type ModelRow = {
      agency_user_id: string;
      session_string: string | null;
      api_id: number | null;
      api_hash: string | null;
      session_status: string | null;
    };
    const m = model as ModelRow | null;
    if (!m) return new Response("Not found", { status: 404 });

    // Allow agency owner OR assigned chatter.
    if (m.agency_user_id !== user.id) {
      const { data: link } = await admin
        .from("agency_chatters")
        .select("id")
        .eq("model_id", modelId)
        .eq("chatter_id", user.id)
        .maybeSingle();
      if (!link) return new Response("Not found", { status: 404 });
    }

    const path = `fans/${modelId}/${peerId}.jpg`;
    const publicUrl = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;

    // Already cached? Cheap existence check via list+search.
    const { data: listed } = await admin.storage
      .from("avatars")
      .list(`fans/${modelId}`, { search: `${peerId}.jpg`, limit: 1 });
    if (listed && listed.some((f) => f.name === `${peerId}.jpg`)) {
      return redirectToAvatar(publicUrl);
    }

    if (!m.session_string || !m.api_id || !m.api_hash || m.session_status === "expired") {
      // Don't negative-cache a session problem — it's transient (reconnect
      // fixes it). Just answer 404 without the day-long browser cache so the
      // avatar reappears once the session is healthy again.
      return new Response("No session", { status: 404 });
    }

    // Download once via MTProto, then cache.
    let photo: Buffer | null = null;
    try {
      photo = await withTelegramClient(
        modelId,
        m.session_string,
        m.api_id,
        m.api_hash,
        async (client) => {
          const entity = await client.getInputEntity(bigInt(peerId));
          const dl = await client.downloadProfilePhoto(entity, { isBig: false });
          return dl instanceof Buffer ? dl : null;
        },
        15_000,
      );
    } catch {
      photo = null;
    }

    if (!photo || photo.length === 0) {
      // No avatar — remember it server-side (skip MTProto next time) and tell
      // the browser not to re-ask for a day.
      noAvatar.set(noKey, Date.now());
      return noPhotoResponse();
    }

    await admin.storage
      .from("avatars")
      .upload(path, new Uint8Array(photo), { contentType: "image/jpeg", upsert: true });

    return redirectToAvatar(publicUrl);
  } catch {
    return new Response("Error", { status: 500 });
  }
}

function redirectToAvatar(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // Browser remembers the redirect target so repeat views skip our
      // server. CDN serves the actual bytes.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
