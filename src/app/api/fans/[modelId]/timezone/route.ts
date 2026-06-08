import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";

/**
 * GET /api/fans/[modelId]/timezone?peerId=<id>
 *
 * Returns the fan's most-active hour window (UTC) inferred from the
 * fan_activity_hours histogram, plus the total samples so the UI can hide
 * it until enough data accumulates.
 *
 * Response: { samples, peakHour, label }  (label e.g. "20:00–23:00 UTC")
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const peerId = new URL(req.url).searchParams.get("peerId");
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const admin = createAdminSupabaseClient();
    const { data } = await admin
      .from("fan_activity_hours")
      .select("hour, cnt")
      .eq("model_id", modelId)
      .eq("peer_id", peerId);

    const rows = (data ?? []) as { hour: number; cnt: number }[];
    const samples = rows.reduce((a, b) => a + b.cnt, 0);
    if (samples < 5) {
      return Response.json({ samples, peakHour: null, label: null });
    }

    // 24-bucket histogram; find the densest 3-hour window.
    const hist = new Array(24).fill(0);
    for (const r of rows) hist[r.hour] = r.cnt;
    let bestStart = 0;
    let bestSum = -1;
    for (let h = 0; h < 24; h++) {
      const sum = hist[h] + hist[(h + 1) % 24] + hist[(h + 2) % 24];
      if (sum > bestSum) {
        bestSum = sum;
        bestStart = h;
      }
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const label = `${pad(bestStart)}:00–${pad((bestStart + 3) % 24)}:00 UTC`;
    return Response.json({ samples, peakHour: bestStart, label });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
