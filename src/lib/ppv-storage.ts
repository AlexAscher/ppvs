import type { SupabaseClient } from "@supabase/supabase-js";

export type UploadResult = {
  /** Public URL of the (possibly resized) original media. */
  mediaUrl: string;
  /** Public URL of a pre-blurred preview JPEG (images only), or null for videos. */
  previewUrl: string | null;
};

/**
 * Tunables — picked to cut PPV-send time on slow / unstable home internet.
 *
 * The hottest path used to be:
 *   chatter clicks Send → server fetches 5 × 8 MB originals from Supabase →
 *   blurs each with sharp → uploads 5 × 0.4 MB blurred jpegs to Telegram MTProto.
 *
 * Now:
 *   - chatter uploads PPV → browser resizes original to 2400px @ q88 (~70 % smaller)
 *     and pre-generates a 720px blurred jpeg @ q60 (~30–80 KB).
 *   - server downloads the tiny pre-blurred JPEG instead of the multi-MB original.
 *   - sharp pipeline removed from the send path entirely.
 */
const ORIGINAL_MAX_DIM = 2400;
const ORIGINAL_QUALITY = 0.88;
const PREVIEW_MAX_DIM = 720;
const PREVIEW_BLUR_PX = 40;
const PREVIEW_BRIGHTNESS = 0.85;
const PREVIEW_QUALITY = 0.6;

/**
 * Browser-side canvas helper. Uses OffscreenCanvas when available for a
 * worker-friendly path; falls back to a detached HTMLCanvasElement.
 */
async function renderToBlob(
  source: ImageBitmap,
  width: number,
  height: number,
  options: { blurPx?: number; brightness?: number; quality: number },
): Promise<Blob> {
  const useOffscreen = typeof OffscreenCanvas !== "undefined";
  const canvas = useOffscreen
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("canvas 2d context unavailable");

  // CSS filter on canvas — supported in Chrome / Edge / Firefox; Safari got
  // it in 18. If the runtime ignores it, the preview just isn't blurred —
  // we still get a small jpeg, the server-side fallback will pick up.
  const filter = [
    options.blurPx ? `blur(${options.blurPx}px)` : null,
    options.brightness != null ? `brightness(${options.brightness})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (filter) (ctx as CanvasRenderingContext2D).filter = filter;

  ctx.drawImage(source, 0, 0, width, height);

  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: options.quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas toBlob returned null"))),
      "image/jpeg",
      options.quality,
    );
  });
}

function fittedSize(srcW: number, srcH: number, maxDim: number) {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  return { w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)) };
}

/**
 * Capture a single frame from a video and return a blurred JPEG preview.
 * Pure browser — loads the file into a <video>, seeks a little past the
 * start (first frames are often black), draws it to a canvas with a blur
 * filter, and exports a small JPEG. No FFmpeg / server transcode needed.
 * Returns null if the browser can't decode the video or capture a frame.
 */
async function processVideoPreview(file: File): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    let settled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    // Hard cap — some codecs never fire `seeked`; don't hang the upload.
    const timeout = setTimeout(() => finish(null), 12_000);

    video.addEventListener("loadeddata", () => {
      // Seek ~10 % in (capped at 1s) to skip black intro frames.
      const t = Math.min(1, (Number.isFinite(video.duration) ? video.duration : 2) * 0.1);
      try {
        video.currentTime = t;
      } catch {
        // some browsers need a tick
        setTimeout(() => {
          try {
            video.currentTime = t;
          } catch {
            finish(null);
          }
        }, 100);
      }
    });

    video.addEventListener("seeked", async () => {
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) {
          clearTimeout(timeout);
          finish(null);
          return;
        }
        const fit = fittedSize(vw, vh, PREVIEW_MAX_DIM);
        const canvas =
          typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(fit.w, fit.h)
            : Object.assign(document.createElement("canvas"), { width: fit.w, height: fit.h });
        const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
          | OffscreenCanvasRenderingContext2D
          | CanvasRenderingContext2D
          | null;
        if (!ctx) {
          clearTimeout(timeout);
          finish(null);
          return;
        }
        (ctx as CanvasRenderingContext2D).filter = `blur(${PREVIEW_BLUR_PX}px) brightness(${PREVIEW_BRIGHTNESS})`;
        ctx.drawImage(video, 0, 0, fit.w, fit.h);
        const blob =
          "convertToBlob" in canvas
            ? await canvas.convertToBlob({ type: "image/jpeg", quality: PREVIEW_QUALITY })
            : await new Promise<Blob | null>((res) =>
                (canvas as HTMLCanvasElement).toBlob(
                  (b) => res(b),
                  "image/jpeg",
                  PREVIEW_QUALITY,
                ),
              );
        clearTimeout(timeout);
        finish(blob);
      } catch {
        clearTimeout(timeout);
        finish(null);
      }
    });

    video.addEventListener("error", () => {
      clearTimeout(timeout);
      finish(null);
    });
  });
}

async function processImage(
  file: File,
): Promise<{ original: Blob; preview: Blob | null }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // createImageBitmap fails on HEIC / TIFF / corrupt files. Fall back to
    // shipping the original as-is and skipping the preview — the send path
    // will detect the missing preview_url and use the original (slow path).
    return { original: file, preview: null };
  }

  try {
    const fitted = fittedSize(bitmap.width, bitmap.height, ORIGINAL_MAX_DIM);
    const original =
      fitted.w === bitmap.width && fitted.h === bitmap.height
        ? // already within bounds — keep the original bytes verbatim
          file
        : await renderToBlob(bitmap, fitted.w, fitted.h, { quality: ORIGINAL_QUALITY });

    const previewFit = fittedSize(bitmap.width, bitmap.height, PREVIEW_MAX_DIM);
    const preview = await renderToBlob(bitmap, previewFit.w, previewFit.h, {
      blurPx: PREVIEW_BLUR_PX,
      brightness: PREVIEW_BRIGHTNESS,
      quality: PREVIEW_QUALITY,
    });

    return { original, preview };
  } finally {
    bitmap.close?.();
  }
}

export async function uploadPpvMedia(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<UploadResult> {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const id = crypto.randomUUID();

  let originalBlob: Blob = file;
  let previewBlob: Blob | null = null;
  let originalExt = file.name.split(".").pop()?.toLowerCase() || "bin";

  if (isImage) {
    try {
      const { original, preview } = await processImage(file);
      originalBlob = original;
      previewBlob = preview;
      // If we re-encoded as JPEG, lock the extension to .jpg so the
      // content-type matches what we upload.
      if (originalBlob !== file) originalExt = "jpg";
    } catch (e) {
      // Image processing failed entirely — fall through with the raw file.
      console.warn("[uploadPpvMedia] image processing failed, uploading original as-is:", e);
    }
  } else if (isVideo) {
    // Keep the original video verbatim, but capture a blurred poster frame
    // as the preview so the PPV teaser shows real (blurred) content instead
    // of a generic lock tile.
    try {
      previewBlob = await processVideoPreview(file);
    } catch (e) {
      console.warn("[uploadPpvMedia] video preview capture failed:", e);
    }
  }

  const originalPath = `${userId}/${id}.${originalExt}`;
  const originalContentType =
    originalBlob === file ? file.type : "image/jpeg";

  const { error: e1 } = await supabase.storage
    .from("ppvs")
    .upload(originalPath, originalBlob, {
      contentType: originalContentType,
      upsert: false,
    });
  if (e1) throw new Error(`Upload failed: ${e1.message}`);

  let previewUrl: string | null = null;
  if (previewBlob) {
    const previewPath = `${userId}/${id}_preview.jpg`;
    const { error: e2 } = await supabase.storage
      .from("ppvs")
      .upload(previewPath, previewBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (!e2) {
      previewUrl = supabase.storage.from("ppvs").getPublicUrl(previewPath).data.publicUrl;
    } else {
      console.warn("[uploadPpvMedia] preview upload failed, continuing without:", e2);
    }
  }

  const mediaUrl = supabase.storage.from("ppvs").getPublicUrl(originalPath).data.publicUrl;
  return { mediaUrl, previewUrl };
}

export function ppvMediaPathFromUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/public\/ppvs\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

export async function deletePpvMedia(
  supabase: SupabaseClient,
  mediaUrl: string,
  previewUrl?: string | null,
): Promise<void> {
  const paths: string[] = [];
  const main = ppvMediaPathFromUrl(mediaUrl);
  if (main) paths.push(main);
  if (previewUrl) {
    const pp = ppvMediaPathFromUrl(previewUrl);
    if (pp) paths.push(pp);
  }
  if (paths.length === 0) return;
  await supabase.storage.from("ppvs").remove(paths);
}
