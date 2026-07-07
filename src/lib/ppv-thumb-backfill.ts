/**
 * Client-side lazy backfill for `ppvs.thumb_url` on rows that shipped
 * before batch 99 introduced the crisp Vault-grid thumbnail.
 *
 * When PpvCard renders a row without `thumb_url`, it enqueues the row
 * here. The queue downloads the row's ORIGINAL media once, canvas-resizes
 * it to a 400px JPEG in the browser, and POSTs the result to
 * `/api/ppv/thumb/upload`. From that point on, every viewer of that PPV
 * sees the crisp thumb served from the cheap public URL — with no more
 * egress of the multi-MB original per tile view.
 *
 * Design choices:
 * - Global concurrency cap so opening a 200-item Vault doesn't fire 200
 *   parallel canvas resizes.
 * - In-memory "already tried" set so React re-renders (or two cards for
 *   the same PPV in different components) don't re-queue.
 * - Best-effort: any failure just leaves the row's thumb_url null; the
 *   Vault tile keeps rendering via the /api/ppv/thumb fallback path
 *   (preview_url → 404 → placeholder).
 * - Images only. Videos would need to download the whole file to seek a
 *   frame in the browser — often 10-100 MB per item, defeating the point.
 *   Post-deploy uploads always come with a video thumb; older video rows
 *   keep the blurred preview_url as their grid tile until re-uploaded.
 */

const MAX_CONCURRENT = 3;
const THUMB_MAX_DIM = 400;
const THUMB_QUALITY = 0.7;

// Rows we've queued this session so we don't retry every render.
const queued = new Set<string>();
let active = 0;
const pending: Array<() => void> = [];

function runNext() {
  if (active >= MAX_CONCURRENT) return;
  const next = pending.shift();
  if (!next) return;
  active++;
  next();
}

function release() {
  active = Math.max(0, active - 1);
  runNext();
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.blob();
}

async function resizeToThumb(sourceBlob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const scale = Math.min(1, THUMB_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ("convertToBlob" in canvas) {
      return canvas.convertToBlob({ type: "image/jpeg", quality: THUMB_QUALITY });
    }
    return new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob null"))),
        "image/jpeg",
        THUMB_QUALITY,
      );
    });
  } finally {
    bitmap.close?.();
  }
}

async function uploadThumb(ppvId: string, blob: Blob): Promise<void> {
  const form = new FormData();
  form.append("ppvId", ppvId);
  form.append("thumb", new File([blob], "thumb.jpg", { type: "image/jpeg" }));
  const res = await fetch("/api/ppv/thumb/upload", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`upload → ${res.status}`);
}

/**
 * Queue a lazy backfill for the given PPV. `mediaUrl` should point at the
 * original (used as the source for the resize). Kind='image' only — video
 * rows are skipped (see file header). No-ops after the first call per PPV
 * in this session, whether the previous attempt succeeded or failed.
 *
 * `onDone` fires when the thumb has been uploaded successfully so the
 * caller can trigger a re-render (e.g. bump a state counter) that will
 * pick up the new /api/ppv/thumb response.
 */
export function queueThumbBackfill(
  ppvId: string,
  mediaUrl: string,
  kind: "image" | "video",
  onDone?: () => void,
): void {
  if (kind !== "image") return; // videos skipped, see header
  if (typeof window === "undefined") return; // SSR guard
  if (queued.has(ppvId)) return;
  queued.add(ppvId);

  pending.push(async () => {
    try {
      const source = await fetchAsBlob(mediaUrl);
      const thumb = await resizeToThumb(source);
      await uploadThumb(ppvId, thumb);
      onDone?.();
    } catch (e) {
      // Best-effort — leave the row without a thumb, the tile keeps
      // rendering via the /api/ppv/thumb fallback chain.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ppv-thumb-backfill] failed for", ppvId, e);
      }
    } finally {
      release();
    }
  });
  runNext();
}
