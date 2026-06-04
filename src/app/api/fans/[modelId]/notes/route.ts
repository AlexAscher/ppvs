import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import type { FanNote } from "@/lib/fan-types";

/**
 * Timestamped notes for a fan — a running log the chatter / agency keeps
 * adding to (rather than one overwritten blob). One row per note in
 * `fan_notes`.
 *
 *   GET    ?peerId=…           → list newest-first
 *   POST   { peerId, body }    → append (author from session)
 *   DELETE ?id=…               → remove one
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const peerId = new URL(req.url).searchParams.get("peerId");
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("fan_notes")
      .select("*")
      .eq("model_id", modelId)
      .eq("peer_id", peerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ notes: (data ?? []) as FanNote[] });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

type CreateBody = { peerId: string; body: string; authorName?: string | null };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body || !body.peerId || !body.body?.trim()) {
      return Response.json({ error: "peerId and body required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("fan_notes")
      .insert({
        model_id: modelId,
        peer_id: body.peerId,
        body: body.body.trim(),
        author_id: auth.userId,
        author_name: body.authorName ?? null,
      })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ note: data as FanNote });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from("fan_notes")
      .delete()
      .eq("id", id)
      .eq("model_id", modelId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
