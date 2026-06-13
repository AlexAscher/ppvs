import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { withTimeout } from "@/lib/with-timeout";
import { loadFans } from "@/lib/admin-data";

/**
 * GET /api/admin/agencies/{agencyId}/fans-export?type=all|paying|ranked
 *
 * Streams a plain-text (.txt) list of this agency's fan usernames for the
 * admin "download" buttons. Three flavours:
 *
 *   all     — every captured fan's @username, one per line (no spend)
 *   paying  — only fans with total_spent > 0, "@user — $X.XX"
 *   ranked  — all fans sorted by total_spent DESC, "@user — $X.XX"
 *
 * Admin-only (requireAdmin). Returns the full list (loadFans paginates
 * through everything, no 2000-row UI cap).
 */

const Q = 15_000;

type ModelRow = { id: string };

function usernameOf(u: string | null, name: string | null, peerId: string): string {
  if (u && u.trim()) return `@${u.trim().replace(/^@/, "")}`;
  if (name && name.trim()) return name.trim();
  return `id:${peerId}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agencyId: string }> },
) {
  const auth = await requireAdmin();
  if ("errorResponse" in auth) return auth.errorResponse;

  const { agencyId } = await params;
  const type = new URL(req.url).searchParams.get("type") ?? "all";
  if (!["all", "paying", "ranked"].includes(type)) {
    return Response.json({ error: "bad type" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Resolve this agency's models so loadFans only pulls their fans.
  const modelsRes = await withTimeout(
    Promise.resolve(admin.from("models").select("id").eq("agency_user_id", agencyId)),
    Q,
    "fans-export: models",
  ).catch(() => null);
  const modelIds = ((modelsRes?.data ?? []) as ModelRow[]).map((m) => m.id);

  if (modelIds.length === 0) {
    return new Response("", {
      headers: textHeaders(`fans-${type}-empty.txt`),
    });
  }

  const { rows } = await loadFans(admin, modelIds);

  // Dedup by (username || peerId): the same Telegram account can appear
  // under several models for one agency.
  const seen = new Set<string>();
  type Row = { label: string; spent: number };
  const list: Row[] = [];
  for (const f of rows) {
    const label = usernameOf(f.telegram_username, f.telegram_name, f.peer_id);
    const spent = Number(f.total_spent ?? 0);
    const key = label.toLowerCase();
    if (seen.has(key)) {
      // Merge spend across models for the same fan.
      const existing = list.find((l) => l.label.toLowerCase() === key);
      if (existing) existing.spent += spent;
      continue;
    }
    seen.add(key);
    list.push({ label, spent });
  }

  let body: string;
  let filename: string;
  if (type === "all") {
    body = list.map((l) => l.label).join("\n");
    filename = "fans-all-usernames.txt";
  } else if (type === "paying") {
    body = list
      .filter((l) => l.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map((l) => `${l.label} — $${l.spent.toFixed(2)}`)
      .join("\n");
    filename = "fans-paying.txt";
  } else {
    body = list
      .sort((a, b) => b.spent - a.spent)
      .map((l) => `${l.label} — $${l.spent.toFixed(2)}`)
      .join("\n");
    filename = "fans-ranked-by-spend.txt";
  }

  return new Response(body, { headers: textHeaders(filename) });
}

function textHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}
