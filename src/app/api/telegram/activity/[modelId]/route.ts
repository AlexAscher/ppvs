import { NextRequest } from "next/server";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { readActivity } from "@/lib/telegram-activity";

/**
 * Returns the freshest activity state for a peer:
 *   - `typing` — a typing event from this peer landed in the last 6 seconds
 *   - `online` — any activity (typing, message) from this peer in the last 60 seconds
 *   - `lastActiveAgoSec` — seconds since the last observed activity, or null if none yet
 *
 * Data is sourced from the in-memory store populated by gramJS event
 * handlers wired in `lib/telegram-activity.ts`. The handlers attach
 * automatically the first time the per-model client is brought into the pool.
 *
 * This is best-effort: until the user produces *some* event after the
 * server boots, we have no data and return `online: false`. The chatter
 * UI falls back to the slower `dialogs` status in that case.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const url = new URL(req.url);
    const peerId = url.searchParams.get("peerId");
    if (!peerId) return Response.json({ error: "peerId required" }, { status: 400 });

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const state = readActivity(modelId, peerId);
    return Response.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/activity GET] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
