import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * Internal agency feed — the agency owner posts announcements / scripts /
 * shout-outs; their chatters read it. Not a Telegram Stories integration:
 * messages stay inside the platform, zero account-flag risk.
 *
 *   GET   /api/feed                 → posts visible to the caller
 *   POST  /api/feed { body, image_url? } → agency-only; creates a post
 *   DELETE /api/feed?id=<uuid>      → agency-only; deletes own post
 */

export type FeedPost = {
  id: string;
  body: string;
  image_url: string | null;
  author_name: string | null;
  created_at: string;
  /** True iff the caller authored this post (agency owner only). */
  mine?: boolean;
};

/** Resolves which agency's feed the caller should see.
 *  - Agency owners see their own.
 *  - Chatters see the agency they're attached to (via agency_chatters). */
async function resolveAgencyId(userId: string, role: "agency" | "chatter"): Promise<string | null> {
  if (role === "agency") return userId;
  const admin = createAdminSupabaseClient();
  const { data } = await admin
    .from("agency_chatters")
    .select("agency_id")
    .eq("chatter_id", userId)
    .maybeSingle();
  return (data as { agency_id: string | null } | null)?.agency_id ?? null;
}

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const role = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
  const agencyId = await resolveAgencyId(user.id, role);
  if (!agencyId) return Response.json({ posts: [], canPost: false });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("agency_posts")
    .select("id, body, image_url, author_id, author_name, created_at")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  type Row = { id: string; body: string; image_url: string | null; author_id: string; author_name: string | null; created_at: string };
  const posts: FeedPost[] = ((data ?? []) as Row[]).map((p) => ({
    id: p.id,
    body: p.body,
    image_url: p.image_url,
    author_name: p.author_name,
    created_at: p.created_at,
    mine: p.author_id === user.id,
  }));

  return Response.json({ posts, canPost: role === "agency" });
}

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const role = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
  if (role !== "agency") {
    return Response.json({ error: "Only the agency can post to the feed" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { body?: string; image_url?: string | null } | null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 4000) {
    return Response.json({ error: "Post body must be 1–4000 chars" }, { status: 400 });
  }
  const imageUrl =
    typeof body?.image_url === "string" && body.image_url.startsWith("http")
      ? body.image_url.slice(0, 1024)
      : null;

  const authorName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.display_name as string) ||
    user.email?.split("@")[0] ||
    "Agency";

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("agency_posts")
    .insert({
      agency_id: user.id,
      author_id: user.id,
      author_name: authorName,
      body: text,
      image_url: imageUrl,
    })
    .select("id, body, image_url, author_name, created_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    post: {
      id: data.id,
      body: data.body,
      image_url: data.image_url,
      author_name: data.author_name,
      created_at: data.created_at,
      mine: true,
    } satisfies FeedPost,
  });
}

export async function DELETE(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const role = (user.user_metadata?.role as "agency" | "chatter") ?? "chatter";
  if (role !== "agency") {
    return Response.json({ error: "Only the agency can delete posts" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "id required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  // Scope by agency_id so an agency can't delete another agency's post even
  // if they guess the uuid.
  const { error } = await admin
    .from("agency_posts")
    .delete()
    .eq("id", id)
    .eq("agency_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
