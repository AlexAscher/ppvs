import { NextRequest } from "next/server";
import { Api } from "telegram";
import bigInt from "big-integer";
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

// Telegram media is immutable for a given (peerId, messageId) so we cache
// aggressively. The box has 10+ GB free RAM, so we budget by TOTAL BYTES
// rather than item count — one 80 MB video shouldn't evict 49 thumbnails.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const CACHE_BYTES_BUDGET = 1024 * 1024 * 1024; // 1 GB resident
// Don't cache a single item bigger than this — a huge file would just churn
// the budget. It still streams fine; it just won't be resident afterwards.
const CACHE_ITEM_MAX = 80 * 1024 * 1024; // 80 MB
// Stream (rather than buffer-then-send) documents at least this big so the
// browser starts playing before the whole file arrives from Telegram.
const STREAM_THRESHOLD = 3 * 1024 * 1024; // 3 MB
const STREAM_REQUEST_SIZE = 512 * 1024; // 512 KB chunks (multiple of 4 KB)

function cacheKey(
  modelId: string,
  peerId: string,
  messageId: number,
  quality: string,
): string {
  return `${modelId}:${peerId}:${messageId}:${quality}`;
}

function cacheBytes(): number {
  let n = 0;
  for (const v of cache.values()) n += v.data.length;
  return n;
}

/** Store an item, then evict oldest entries until under the byte budget. */
function cachePut(key: string, data: Buffer, mime: string) {
  if (data.length > CACHE_ITEM_MAX) return; // too big to keep resident
  cache.set(key, { data, mime, ts: Date.now() });
  if (cacheBytes() <= CACHE_BYTES_BUDGET) return;
  const sorted = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts);
  let total = cacheBytes();
  for (const [k, v] of sorted) {
    if (total <= CACHE_BYTES_BUDGET) break;
    cache.delete(k);
    total -= v.data.length;
  }
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
  cacheSeconds: number,
): Response {
  const total = data.length;
  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": `private, max-age=${cacheSeconds}, immutable`,
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

    // Telegram media is immutable per (peerId, messageId) — the same message
    // never changes bytes — so thumbs are safe to cache aggressively in the
    // browser (they're per-fan and per-message). Full-quality bytes cache
    // shorter because users occasionally re-view large videos and we want
    // any bucket policy tweaks to take effect on next open.
    const cacheSeconds = quality === "thumb" ? 30 * 24 * 60 * 60 : 300;

    const k = cacheKey(modelId, peerId, messageId, quality);
    const hit = cache.get(k);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return respondWithMaybeRange(hit.data, hit.mime, rangeHeader, cacheSeconds);
    }

    // Deferred Response: the streaming path resolves this as soon as the
    // headers are known, then keeps feeding bytes from a background reader.
    // The buffer paths resolve it with a finished Response. We bump the op
    // timeout to 300s because a slow full download can take a while.
    let resolveResp!: (r: Response) => void;
    const respPromise = new Promise<Response>((res) => {
      resolveResp = res;
    });
    let settled = false;
    const settle = (r: Response) => {
      if (!settled) {
        settled = true;
        resolveResp(r);
      }
    };

    const work = withTelegramClient(
      modelId,
      auth.model.session_string,
      auth.model.api_id,
      auth.model.api_hash,
      async (tg) => {
        const peer = buildPeer(peerId, accessHash);
        const fetched = await tg.getMessages(peer, { ids: [messageId] });
        const msg = fetched.find((m): m is Api.Message => m instanceof Api.Message);
        if (!msg || !msg.media) {
          settle(Response.json({ error: "Media not found" }, { status: 404 }));
          return;
        }

        // ── thumb: small (≤150 KB) → buffer + cache, unchanged behaviour ──
        if (quality === "thumb") {
          let buf: Buffer | string | undefined;
          if (
            msg.media instanceof Api.MessageMediaPhoto &&
            msg.media.photo instanceof Api.Photo
          ) {
            const target = pickPreviewPhotoSize(msg.media.photo.sizes);
            buf = target
              ? await tg.downloadMedia(msg, { thumb: target })
              : await tg.downloadMedia(msg);
          } else if (
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
          if (!buf || typeof buf === "string") {
            settle(Response.json({ error: "Media not found" }, { status: 404 }));
            return;
          }
          const mime = mimeFor(msg, true);
          cachePut(k, buf as Buffer, mime);
          settle(respondWithMaybeRange(buf as Buffer, mime, rangeHeader, cacheSeconds));
          return;
        }

        // ── full quality ──
        const doc =
          msg.media instanceof Api.MessageMediaDocument &&
          msg.media.document instanceof Api.Document
            ? msg.media.document
            : null;
        const total = doc ? Number(doc.size) : 0;
        // Only stream from byte 0 — Telegram requires 4 KB-aligned offsets, so
        // mid-file seeks (start>0) take the buffer path instead (which caches
        // the whole file, making the seek instant the second time).
        const fromStart = !rangeHeader || /^bytes=0-?$/.test(rangeHeader.trim());

        if (doc && total >= STREAM_THRESHOLD && fromStart) {
          const mime = mimeFor(msg, false);
          const loc = new Api.InputDocumentFileLocation({
            id: doc.id,
            accessHash: doc.accessHash,
            fileReference: doc.fileReference,
            thumbSize: "",
          });
          const collected: Buffer[] = [];
          let collectedBytes = 0;
          let aborted = false;
          const body = new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                for await (const chunk of tg.iterDownload({
                  file: loc,
                  offset: bigInt.zero,
                  limit: total,
                  requestSize: STREAM_REQUEST_SIZE,
                })) {
                  if (aborted) break;
                  const u = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
                  controller.enqueue(new Uint8Array(u));
                  if (collectedBytes + u.length <= CACHE_ITEM_MAX) {
                    collected.push(u);
                    collectedBytes += u.length;
                  }
                }
                if (!aborted) {
                  controller.close();
                  // Cache the assembled file so re-opens + seeks are instant.
                  if (collectedBytes === total && total > 0) {
                    cachePut(k, Buffer.concat(collected, total), mime);
                  }
                }
              } catch (e) {
                try {
                  controller.error(e);
                } catch {
                  /* already errored */
                }
              }
            },
            cancel() {
              // Browser closed the tab / aborted — stop pulling from Telegram.
              aborted = true;
            },
          });
          const headers: Record<string, string> = {
            "Content-Type": mime,
            "Accept-Ranges": "bytes",
            "Cache-Control": `private, max-age=${cacheSeconds}`,
            "Content-Length": String(total),
          };
          let status = 200;
          if (rangeHeader) {
            status = 206;
            headers["Content-Range"] = `bytes 0-${total - 1}/${total}`;
          }
          settle(new Response(body, { status, headers }));
          // Return immediately — the stream feeds in the background. Keeping
          // fn short avoids holding the pool's per-op timeout for the whole
          // download.
          return;
        }

        // ── full quality, buffer path (small files, or seeks at start>0) ──
        const buf = await tg.downloadMedia(msg);
        if (!buf || typeof buf === "string") {
          settle(Response.json({ error: "Media not found" }, { status: 404 }));
          return;
        }
        const mime = mimeFor(msg, false);
        cachePut(k, buf as Buffer, mime);
        settle(respondWithMaybeRange(buf as Buffer, mime, rangeHeader, cacheSeconds));
      },
      300_000,
    );
    work.catch((e) => {
      console.error(
        "[telegram/media GET] op error:",
        e instanceof Error ? e.message : e,
      );
      settle(Response.json({ error: "Media error" }, { status: 500 }));
    });

    return await respPromise;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[telegram/media GET] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
