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
