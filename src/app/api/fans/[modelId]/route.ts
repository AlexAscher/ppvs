import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTimeout } from "@/lib/with-timeout";
import type { FanRow } from "@/lib/fan-types";

const FAN_QUERY_TIMEOUT_MS = 8_000;

/**
 * Per-model fan profile store. One row per (model_id, peer_id) — keeps
 * notes, emoji tags, total_spent, telegram username/display name and
 * last_seen_at. RLS is in place (agency CRUD own, chatter RW assigned),
 * but we use the admin client here since `authorizeModelAccess` already
 * gates by user → model linkage; this avoids one extra round-trip
 * through the SSR client per call.
 *
 * - GET  ?peerId=…  → row or null
 * - POST            → upsert (partial fields ok)
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
    // Timeout + one retry — the fan drawer polls this endpoint often, so a
    // single DB blip used to surface as a red 500 in the console. Retry
    // eats the transient; a hard failure still 503s so the client can
    // fall back gracefully.
    const runQuery = () =>
      withTimeout(
        Promise.resolve(
          admin
            .from("fans")
            .select("*")
            .eq("model_id", modelId)
            .eq("peer_id", peerId)
            .maybeSingle(),
        ),
        FAN_QUERY_TIMEOUT_MS,
        "fans: load",
      );
    let res: Awaited<ReturnType<typeof runQuery>>;
    try {
      res = await runQuery();
    } catch {
      try {
        res = await runQuery();
      } catch {
        return Response.json({ fan: null, partial: true }, { status: 200 });
      }
    }
    if (res.error) {
      console.warn("[fans/GET] db error:", res.error.message);
      return Response.json({ fan: null, partial: true }, { status: 200 });
    }
    return Response.json({ fan: (res.data as FanRow | null) ?? null });
  } catch (e: unknown) {
    // Any uncaught exception here would blank the drawer; return a safe
    // 200 with null so the client renders the empty-state instead.
    const message = e instanceof Error ? e.message : "Failed";
    console.error("[fans/GET] uncaught:", message);
    return Response.json({ fan: null, error: message }, { status: 200 });
  }
}

type UpsertBody = {
  peerId: string;
  telegramUsername?: string | null;
  telegramName?: string | null;
  notes?: string;
  tags?: string[];
  touchLastSeen?: boolean;
  /** Profile basics (added by 20260615). All three are optional and may
   *  be null to clear the stored value. */
  bio?: string | null;
  birthdate?: string | null;
  location?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const body = (await req.json().catch(() => null)) as UpsertBody | null;
    if (!body || !body.peerId) {
      return Response.json({ error: "peerId required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    // Build the patch carefully — undefined fields shouldn't overwrite
    // existing values, but null/empty-string DO (e.g. clearing notes).
    const patch: Record<string, unknown> = {
      model_id: modelId,
      peer_id: body.peerId,
    };
    if (body.telegramUsername !== undefined) patch.telegram_username = body.telegramUsername;
    if (body.telegramName !== undefined) patch.telegram_name = body.telegramName;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.touchLastSeen) patch.last_seen_at = new Date().toISOString();
    if (body.bio !== undefined) patch.bio = body.bio?.toString().slice(0, 2000) ?? null;
    if (body.birthdate !== undefined) {
      // Empty string from the date input → store NULL so "no date" stays
      // distinguishable from "12/30 1899" etc.
      const s = (body.birthdate ?? "").toString().trim();
      patch.birthdate = s.length > 0 ? s : null;
    }
    if (body.location !== undefined) {
      patch.location = body.location?.toString().slice(0, 200) ?? null;
    }

    const { data, error } = await admin
      .from("fans")
      .upsert(patch, { onConflict: "model_id,peer_id" })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ fan: data as FanRow });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
