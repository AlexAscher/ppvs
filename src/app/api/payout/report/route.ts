import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { buildPayoutReport } from "@/lib/payout";

/**
 * GET /api/payout/report?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the aggregated payout breakdown for the period: totals,
 * per-(model,chatter) summary, and the raw row list (also fed by the
 * CSV exporter).
 *
 * Defaults: this calendar month if no params.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const { from, to } = resolveRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  const admin = createAdminSupabaseClient();
  try {
    const report = await buildPayoutReport({
      admin,
      agencyUserId: user.id,
      from,
      to,
    });
    return Response.json({ from, to, ...report });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

function resolveRange(fromParam: string | null, toParam: string | null) {
  if (fromParam && toParam) {
    return { from: toIso(fromParam, false), to: toIso(toParam, true) };
  }
  // Default: this calendar month.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { from, to };
}

function toIso(yyyyMmDd: string, exclusive: boolean): string {
  // Treat the param as a UTC date; `exclusive=true` shifts +1 day so
  // an end-of-period parameter includes that whole day.
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(yyyyMmDd).toISOString();
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + (exclusive ? 1 : 0)));
  return d.toISOString();
}
