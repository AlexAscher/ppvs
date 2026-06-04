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

function cacheKey(
  modelId: string,
  peerId: string,
  messageId: number,
  quality: string,
): string {
  return `${modelId}:${peerId}:${messageId}:${quality}`;
}

function evictIfNeeded() {
  if (cache.size <= CACHE_MAX) return;
  const sorted = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < sorted.length - CACHE_MAX; i++) cache.delete(sorted[i][0]);
}

/**
 * Build a Response for media bytes, honouring an HTTP Range request when
 * present. Browsers send `Range: bytes=…` for `<video>`/`<audio>` so they
 * can stream + seek; without a 206 reply many browsers refuse to scrub or
 * re-download the whole file. We serve slices from the already-downloaded
 * buffer (cached), so seeking is instant after the first load.
 */
function respondWithMaybeRange(
  data: Buffer,
  mime: string,
  rangeHeader: string | null,
): Response {
  const total = data.length;
  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
  };

  if (rangeHeader) {
    // Format: "bytes=start-end" (end optional). We support a single range.
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        // Unsatisfiable — tell the client the real size.
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, "Content-Range": `bytes */${total}` },
        });
      }
      const slice = data.subarray(start, end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(slice.length),
        },
      });
    }
  }

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}

function mimeFor(msg: Api.Message, isThumb: boolean): string {
  const m = msg.media;
  if (m instanceof Api.MessageMediaPhoto) return "image/jpeg";
  if (m instanceof Api.MessageMediaDocument && m.document instanceof Api.Document) {
    // For video documents in thumb mode we returned a JPEG from doc.thumbs.
    if (isThumb && (m.document.mimeType ?? "").startsWith("video/")) return "image/jpeg";
    return m.document.mimeType ?? "application/octet-stream";
  }
  return "application/octet-stream";
}

/**
 * Pick the PhotoSize closest to ~800–1280px for inline chat previews.
 * Telegram sizes are tagged with letters: 's' (~100px), 'm' (~320px),
 * 'x' (~800px), 'y' (~1280px), 'w' (~2560px). We prefer 'x' then 'y',
 * falling back to anything that's a real PhotoSize.
 */
function pickPreviewPhotoSize(
  sizes: readonly Api.TypePhotoSize[] | undefined,
): Api.PhotoSize | Api.PhotoSizeProgressive | null {
  if (!sizes || sizes.length === 0) return null;
  const photoSizes = sizes.filter(
    (s): s is Api.PhotoSize | Api.PhotoSizeProgressive =>
      s instanceof Api.PhotoSize || s instanceof Api.PhotoSizeProgressive,
  );
  if (photoSizes.length === 0) return null;
  const byType = (t: string) => photoSizes.find((s) => s.type === t);
  return (
    byType("x") ??
    byType("y") ??
    byType("m") ??
    byType("w") ??
    photoSizes[Math.floor(photoSizes.length / 2)]
  );
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
    // `quality=thumb` → ~800px preview (50–150 KB, fast). Anything else
    // returns the full original — used by the lightbox.
    const quality = url.searchParams.get("quality") === "thumb" ? "thumb" : "full";
    if (!peerId || !messageIdStr) {
      return Response.json({ error: "peerId and messageId required" }, { status: 400 });
    }
    const messageId = Number(messageIdStr);
    if (!Number.isFinite(messageId)) {
      return Response.json({ error: "bad messageId" }, { status: 400 });
    }

    const auth = await authorizeModelAccess(modelId);
    if ("errorResponse" in auth) return auth.errorResponse;

    const rangeHeader = req.headers.get("range");

    const k = cacheKey(modelId, peerId, messageId, quality);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return respondWithMaybeRange(hit.data, hit.mime, rangeHeader);
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

        let buf: Buffer | string | undefined;
        if (quality === "thumb") {
          // Photo: download a mid-size PhotoSize ('x'/'y') instead of the
          // full original — ~100 KB instead of multi-MB.
          if (
            msg.media instanceof Api.MessageMediaPhoto &&
            msg.media.photo instanceof Api.Photo
          ) {
            const target = pickPreviewPhotoSize(msg.media.photo.sizes);
            buf = target
              ? await tg.downloadMedia(msg, { thumb: target })
              : await tg.downloadMedia(msg);
          }
          // Video / document: download the cover thumb (PhotoSize on
          // doc.thumbs) instead of the multi-MB video file.
          else if (
            msg.media instanceof Api.MessageMediaDocument &&
            msg.media.document instanceof Api.Document
          ) {
            const target = pickPreviewPhotoSize(msg.media.document.thumbs);
            buf = target
              ? await tg.downloadMedia(msg, { thumb: target })
              : await tg.downloadMedia(msg);
          } else {
            buf = await tg.downloadMedia(msg);
          }
        } else {
          buf = await tg.downloadMedia(msg);
        }

        if (!buf || typeof buf === "string") return null;
        return { buf: buf as Buffer, mime: mimeFor(msg, quality === "thumb") };
      },
      90_000,
    );

    if (!result) return Response.json({ error: "Media not found" }, { status: 404 });

    cache.set(k, { data: result.buf, mime: result.mime, ts: Date.now() });
    evictIfNeeded();

    return respondWithMaybeRange(result.buf, result.mime, rangeHeader);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/media GET] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
