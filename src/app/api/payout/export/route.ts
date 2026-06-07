import { NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { buildPayoutReport, reportToCsv } from "@/lib/payout";

/**
 * GET /api/payout/export?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Streams a CSV download of the period's raw transactions for
 * payroll/bookkeeping. One row per sale, split columns included.
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const from = fromParam ? toIso(fromParam, false) : defaultFrom;
  const to = toParam ? toIso(toParam, true) : defaultTo;

  const admin = createAdminSupabaseClient();
  try {
    const report = await buildPayoutReport({
      admin,
      agencyUserId: user.id,
      from,
      to,
    });
    const csv = reportToCsv(report);

    // Filename: payout_2026-06-01_to_2026-06-30.csv
    const stamp = (iso: string) => iso.slice(0, 10);
    const filename = `payout_${stamp(from)}_to_${stamp(to)}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

function toIso(yyyyMmDd: string, exclusive: boolean): string {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(yyyyMmDd).toISOString();
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + (exclusive ? 1 : 0)));
  return d.toISOString();
}
