import { NextRequest } from "next/server";
import { Api } from "telegram";
import { authorizeModelAccess } from "@/lib/telegram-authorize";
import { withTelegramClient } from "@/lib/telegram-pool";
import { buildPeer } from "@/lib/telegram-peer";

declare global {
  var __ppvs_media_cache__:
    | Map<string, { data: Buffer; mime: string; ts: number }>
    | undefined;
}

const cache: Map<string, { data: Buffer; mime: string; ts: number }> =
  globalThis.__ppvs_media_cache__ ?? new Map();
globalThis.__ppvs_media_cache__ = cache;

// Keep last 50 media items, evict oldest. Telegram media never changes
// for a given (peerId, messageId) so we can cache aggressively.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 50;

function cacheKey(modelId: string, peerId: string, messageId: number): string {
  return `${modelId}:${peerId}:${messageId}`;
}

function evictIfNeeded() {
  if (cache.size <= CACHE_MAX) return;
  // delete oldest first
  const sorted = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < sorted.length - CACHE_MAX; i++) cache.delete(sorted[i][0]);
}

function mimeFor(msg: Api.Message): string {
  const m = msg.media;
  if (m instanceof Api.MessageMediaPhoto) return "image/jpeg";
  if (m instanceof Api.MessageMediaDocument && m.document instanceof Api.Document) {
    return m.document.mimeType ?? "application/octet-stream";
  }
  return "application/octet-stream";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  try {
    const { modelId } = await params;
    const url = new URL(req.url);
    const peerId = url.searchParams.get("peerId");
    const accessHash = url.searchParams.get("accessHash");
    const messageIdStr = url.searchParams.get("messageId");
    if (!peerId || !messageIdStr) {
      return Response.json({ error: "peerId and messageId required" }, { status: 400 });
    }
    const messageId = Number(messageIdStr);
    if (!Number.isFinite(messageId)) {
      return Response.json({ error: "bad messageId" }, { status: 400 });
    }

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const k = cacheKey(modelId, peerId, messageId);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return new Response(new Uint8Array(hit.data), {
        headers: {
          "Content-Type": hit.mime,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    // 90s timeout — downloading a large media file from Telegram's CDN
    // through the model's client can take a while on slow networks.
    const result = await withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        const peer = buildPeer(peerId, accessHash);
        const fetched = await tg.getMessages(peer, { ids: [messageId] });
        const msg = fetched.find((m): m is Api.Message => m instanceof Api.Message);
        if (!msg || !msg.media) return null;
        const buf = await tg.downloadMedia(msg);
        if (!buf || typeof buf === "string") return null;
        return { buf: buf as Buffer, mime: mimeFor(msg) };
      },
      90_000,
    );

    if (!result) return Response.json({ error: "Media not found" }, { status: 404 });

    cache.set(k, { data: result.buf, mime: result.mime, ts: Date.now() });
    evictIfNeeded();

    return new Response(new Uint8Array(result.buf), {
      headers: {
        "Content-Type": result.mime,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/media GET] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
