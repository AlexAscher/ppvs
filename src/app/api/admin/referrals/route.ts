import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PAID, loadSends } from "@/lib/admin-data";

/**
 * Platform-admin referral links.
 *
 *   GET  /api/admin/referrals      → { links: [...with live stats] }
 *   POST /api/admin/referrals      { name, description, percent } → creates a link
 *   DELETE /api/admin/referrals?id=… → removes a link (signups stay tagged)
 *
 * Stats per link: how many agencies signed up under the code, their combined
 * gross (paid ppv_sends.total_price — same GMV definition the Agencies tab
 * uses), and gross × percent = what we'd owe the referrer.
 */

type LinkRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  percent: number;
  created_at: string;
};

function genCode(): string {
  // 8 chars, unambiguous alphabet (no 0/O/1/I/l).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const admin = createAdminSupabaseClient();

  const [linksRes, signupsRes, modelsRes, sendsLoad] = await Promise.all([
    admin.from("referral_links").select("*").order("created_at", { ascending: false }),
    admin.from("referral_signups").select("referral_code, agency_user_id"),
    admin.from("models").select("id, agency_user_id"),
    loadSends(admin),
  ]);

  const links = (linksRes.data ?? []) as LinkRow[];
  const signups = (signupsRes.data ?? []) as { referral_code: string; agency_user_id: string }[];
  const models = (modelsRes.data ?? []) as { id: string; agency_user_id: string }[];

  // model → agency, then paid GMV per agency.
  const agencyByModel = new Map<string, string>();
  for (const m of models) agencyByModel.set(m.id, m.agency_user_id);
  const gmvByAgency = new Map<string, number>();
  for (const s of sendsLoad.rows) {
    if (!PAID.has(s.status)) continue;
    const a = agencyByModel.get(s.model_id);
    if (!a) continue;
    gmvByAgency.set(a, (gmvByAgency.get(a) ?? 0) + Number(s.total_price ?? 0));
  }

  // Agencies per referral code.
  const agenciesByCode = new Map<string, string[]>();
  for (const su of signups) {
    const arr = agenciesByCode.get(su.referral_code) ?? [];
    arr.push(su.agency_user_id);
    agenciesByCode.set(su.referral_code, arr);
  }

  const out = links.map((l) => {
    const agencies = agenciesByCode.get(l.code) ?? [];
    const gross = agencies.reduce((sum, a) => sum + (gmvByAgency.get(a) ?? 0), 0);
    const owed = gross * (Number(l.percent) / 100);
    return {
      id: l.id,
      code: l.code,
      name: l.name,
      description: l.description,
      percent: Number(l.percent),
      createdAt: l.created_at,
      signups: agencies.length,
      gross,
      owed,
    };
  });

  return Response.json({ links: out });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    description?: string;
    percent?: number;
  } | null;
  const name = (body?.name ?? "").trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
  const percent = Number(body?.percent ?? 0);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return Response.json({ error: "Percent must be 0–100" }, { status: 400 });
  }
  const description = (body?.description ?? "").trim() || null;

  const admin = createAdminSupabaseClient();
  // Generate a unique code (retry on the rare collision).
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode();
    const { data, error } = await admin
      .from("referral_links")
      .insert({ code, name, description, percent })
      .select("id, code")
      .single();
    if (!error && data) {
      return Response.json({ ok: true, id: data.id, code: data.code });
    }
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[admin/referrals POST] insert failed:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }
  return Response.json({ error: "Could not allocate a code, try again" }, { status: 500 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("referral_links").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
