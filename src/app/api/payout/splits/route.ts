import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET    /api/payout/splits     → list all splits + agency default
 * POST   /api/payout/splits     → upsert one split (scope/model/chatter)
 * DELETE /api/payout/splits     → delete by id
 *
 * Default split (global per-agency) lives on agency_settings —
 * GET returns it inline as `default`, POST body can include
 * `default: {model_pct, chatter_pct, agency_pct}` to update it.
 */

type SplitPayload = {
  scope: "model" | "chatter";
  model_id: string;
  chatter_user_id?: string | null;
  model_pct: number;
  chatter_pct: number;
  agency_pct: number;
};

export async function GET() {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const [splitsRes, settingsRes] = await Promise.all([
    admin
      .from("payout_splits")
      .select(
        "id, scope, model_id, chatter_user_id, model_pct, chatter_pct, agency_pct, updated_at",
      )
      .eq("agency_user_id", user.id)
      .order("scope", { ascending: true }),
    admin
      .from("agency_settings")
      .select(
        "default_split_model_pct, default_split_chatter_pct, default_split_agency_pct",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return Response.json({
    splits: splitsRes.data ?? [],
    default: settingsRes.data ?? {
      default_split_model_pct: 50,
      default_split_chatter_pct: 20,
      default_split_agency_pct: 30,
    },
  });
}

export async function POST(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | (SplitPayload & { default?: { model_pct: number; chatter_pct: number; agency_pct: number } })
    | null;
  if (!body) return Response.json({ error: "Bad JSON" }, { status: 400 });

  const admin = createAdminSupabaseClient();

  // 1) Updating the global default split.
  if (body.default) {
    const d = body.default;
    if (!validSplit(d)) return Response.json({ error: "Split must sum to 100" }, { status: 400 });
    const { error } = await admin
      .from("agency_settings")
      .upsert(
        {
          user_id: user.id,
          default_split_model_pct: d.model_pct,
          default_split_chatter_pct: d.chatter_pct,
          default_split_agency_pct: d.agency_pct,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // 2) Per-model / per-(model,chatter) override.
  if (!body.scope || !body.model_id) {
    return Response.json({ error: "scope + model_id required" }, { status: 400 });
  }
  if (body.scope === "chatter" && !body.chatter_user_id) {
    return Response.json({ error: "chatter_user_id required for chatter scope" }, { status: 400 });
  }
  if (!validSplit(body)) return Response.json({ error: "Split must sum to 100" }, { status: 400 });

  // Authorize: agency must own the model.
  const { data: m } = await admin
    .from("models")
    .select("agency_user_id")
    .eq("id", body.model_id)
    .maybeSingle();
  if (!m || (m as { agency_user_id: string }).agency_user_id !== user.id) {
    return Response.json({ error: "Model not yours" }, { status: 403 });
  }

  // Partial unique indexes (one per scope) make upsert with onConflict
  // awkward — easier to delete the matching row in this scope, then
  // insert fresh.
  const delQuery = admin
    .from("payout_splits")
    .delete()
    .eq("agency_user_id", user.id)
    .eq("model_id", body.model_id)
    .eq("scope", body.scope);
  if (body.scope === "chatter") {
    await delQuery.eq("chatter_user_id", body.chatter_user_id as string);
  } else {
    await delQuery.is("chatter_user_id", null);
  }

  const payload = {
    agency_user_id: user.id,
    scope: body.scope,
    model_id: body.model_id,
    chatter_user_id: body.scope === "chatter" ? body.chatter_user_id ?? null : null,
    model_pct: body.model_pct,
    chatter_pct: body.chatter_pct,
    agency_pct: body.agency_pct,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("payout_splits").insert(payload);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

function validSplit(p: { model_pct: number; chatter_pct: number; agency_pct: number }) {
  const sum = Number(p.model_pct) + Number(p.chatter_pct) + Number(p.agency_pct);
  return Math.abs(sum - 100) < 0.01;
}

export async function DELETE(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("payout_splits")
    .delete()
    .eq("id", id)
    .eq("agency_user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
