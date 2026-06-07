import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminSupabaseClient } from "@/lib/supabase-server";

/**
 * GET  /api/labels → the agency's conversation-status label library.
 *                    Seeds a preset set on first read.
 * POST /api/labels { name, color? } → create a custom label.
 */
const PRESETS = [
  { name: "Negotiating", color: "#f59e0b" },
  { name: "Hot lead", color: "#ef4444" },
  { name: "Follow-up", color: "#6366f1" },
  { name: "Cold", color: "#64748b" },
  { name: "Closed", color: "#10b981" },
];

export async function GET() {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminSupabaseClient();
  let { data } = await admin
    .from("conversation_labels")
    .select("id, name, color, position")
    .eq("agency_user_id", user.id)
    .order("position", { ascending: true });

  if (!data || data.length === 0) {
    await admin.from("conversation_labels").insert(
      PRESETS.map((p, i) => ({ agency_user_id: user.id, name: p.name, color: p.color, position: i })),
    );
    const re = await admin
      .from("conversation_labels")
      .select("id, name, color, position")
      .eq("agency_user_id", user.id)
      .order("position", { ascending: true });
    data = re.data;
  }
  return Response.json({ labels: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ssr = await createSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string; color?: string } | null;
  if (!body?.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("conversation_labels")
    .insert({
      agency_user_id: user.id,
      name: body.name.trim().slice(0, 40),
      color: body.color?.match(/^#[0-9a-f]{3,8}$/i) ? body.color : "#6366f1",
      position: 99,
    })
    .select("id, name, color, position")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ label: data });
}
