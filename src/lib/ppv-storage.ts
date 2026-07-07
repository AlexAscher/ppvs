import type { SupabaseClient } from "@supabase/supabase-js";

export type UploadResult = {
  /** Public URL of the (possibly resized) original media. */
  mediaUrl: string;
  /** Public URL of a pre-blurred preview JPEG (images only), or null for videos. */
  previewUrl: string | null;
  /** Small crisp (unblurred) 400px JPEG for Vault grid tiles. Null on
   *  older browsers that can't decode the source (rare) or when the file
   *  is a raw audio/gif that has no useful poster frame. */
  thumbUrl: string | null;
};

// ─── Allowed media types ──────────────────────────────────────────────────
// Telegram only renders a fixed set of formats inline. Anything else arrives
// as a "file" the fan must download, or doesn't preview at all (e.g. .jfif,
// .heic). We refuse those at upload time so the vault only ever holds content
// that delivers cleanly to a fan's chat.
export const PPV_IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"] as const;
export const PPV_VIDEO_EXT = ["mp4", "mov", "m4v", "webm"] as const;
export const PPV_AUDIO_EXT = ["mp3", "m4a", "aac", "ogg", "oga", "opus", "wav", "flac"] as const;

/** HEIC / HEIF — accepted by the vault, but the vault never STORES raw HEIC:
 *  Telegram doesn't render it inline, so we re-encode to JPEG at upload time.
 *  The re-encode uses createImageBitmap, which decodes HEIC natively on iOS
 *  Safari 17+ and modern iPad WebKit; on desktop Chrome/Firefox it fails and
 *  the upload is REJECTED with a clear "please convert to JPG" message so
 *  the fan never receives a broken .heic file. */
function isHeicExt(ext: string): boolean {
  return ext === "heic" || ext === "heif";
}

export type PpvMediaKind = "image" | "video" | "audio";

/** Accept attribute string for <input type="file"> — the allowlist above. */
export const PPV_ACCEPT = [
  ...PPV_IMAGE_EXT,
  ...PPV_VIDEO_EXT,
  ...PPV_AUDIO_EXT,
].map((e) => `.${e}`).join(",") + ",image/*,video/*,audio/*";

function extOf(srcOrFile: string | File): string {
  const name = typeof srcOrFile === "string" ? srcOrFile.split("?")[0] : srcOrFile.name;
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Map a recognized MIME subtype to our canonical extension (for files the OS
 *  handed us without a usable extension). */
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
  };
  return map[m] ?? "";
}

/** Classify a file/url as image | video | audio, or null if it's not a
 *  Telegram-displayable type. Extension-first (the .jfif trap has an
 *  image/jpeg MIME but won't preview), falling back to MIME when no extension
 *  is present. */
export function ppvMediaKind(srcOrFile: string | File): PpvMediaKind | null {
  let ext = extOf(srcOrFile);
  if (!ext && typeof srcOrFile !== "string" && srcOrFile.type) {
    ext = extFromMime(srcOrFile.type);
  }
  if ((PPV_IMAGE_EXT as readonly string[]).includes(ext)) return "image";
  if ((PPV_VIDEO_EXT as readonly string[]).includes(ext)) return "video";
  if ((PPV_AUDIO_EXT as readonly string[]).includes(ext)) return "audio";
  return null;
}

/** Validate a picked file before upload. Returns a friendly error naming the
 *  rejected extension so the agency understands why (e.g. .jfif). */
export function validatePpvFile(file: File): { ok: true; kind: PpvMediaKind } | { ok: false; error: string } {
  const kind = ppvMediaKind(file);
  if (kind) return { ok: true, kind };
  const ext = extOf(file) || "unknown";
  return {
    ok: false,
    error:
      `".${ext}" files don't display in Telegram, so they can't be added to the vault. ` +
      `Use images (JPG, PNG, WebP, GIF), video (MP4, MOV, M4V, WebM) or audio (MP3, M4A, AAC, OGG, WAV).`,
  };
}

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
// Vault grid tile size — displayed at ~180–260 CSS px so 400px physical is
// crisp on Retina and still ≈15–30 KB @ q70. Explicitly UNBLURRED (agency
// view, not fan-facing) so images look sharp in the grid.
const THUMB_MAX_DIM = 400;
const THUMB_QUALITY = 0.7;

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
 * Capture a single frame from a video and return TWO JPEGs from it:
 *   • preview — blurred + slightly darkened, used on the fan-facing pay
 *     page (existing behaviour).
 *   • thumb   — crisp + unblurred + smaller, used in the agency Vault
 *     grid so tiles don't drag down the full-size video.
 *
 * Loading the file into a <video> is the expensive step; we do it once
 * and produce both artefacts from the same seeked frame.
 */
async function processVideoPreview(
  file: File,
): Promise<{ preview: Blob | null; thumb: Blob | null }> {
  return new Promise((resolve) => {
    let settled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const finish = (out: { preview: Blob | null; thumb: Blob | null }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(out);
    };

    // Hard cap — some codecs never fire `seeked`; don't hang the upload.
    const timeout = setTimeout(() => finish({ preview: null, thumb: null }), 12_000);

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
            finish({ preview: null, thumb: null });
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
          finish({ preview: null, thumb: null });
          return;
        }

        const draw = async (
          maxDim: number,
          options: { blurPx?: number; brightness?: number; quality: number },
        ): Promise<Blob | null> => {
          const fit = fittedSize(vw, vh, maxDim);
          const canvas =
            typeof OffscreenCanvas !== "undefined"
              ? new OffscreenCanvas(fit.w, fit.h)
              : Object.assign(document.createElement("canvas"), { width: fit.w, height: fit.h });
          const ctx = (canvas as OffscreenCanvas | HTMLCanvasElement).getContext("2d") as
            | OffscreenCanvasRenderingContext2D
            | CanvasRenderingContext2D
            | null;
          if (!ctx) return null;
          const filter = [
            options.blurPx ? `blur(${options.blurPx}px)` : null,
            options.brightness != null ? `brightness(${options.brightness})` : null,
          ]
            .filter(Boolean)
            .join(" ");
          if (filter) (ctx as CanvasRenderingContext2D).filter = filter;
          ctx.drawImage(video, 0, 0, fit.w, fit.h);
          if ("convertToBlob" in canvas) {
            return canvas.convertToBlob({ type: "image/jpeg", quality: options.quality });
          }
          return new Promise<Blob | null>((res) =>
            (canvas as HTMLCanvasElement).toBlob((b) => res(b), "image/jpeg", options.quality),
          );
        };

        const preview = await draw(PREVIEW_MAX_DIM, {
          blurPx: PREVIEW_BLUR_PX,
          brightness: PREVIEW_BRIGHTNESS,
          quality: PREVIEW_QUALITY,
        });
        const thumb = await draw(THUMB_MAX_DIM, { quality: THUMB_QUALITY });

        clearTimeout(timeout);
        finish({ preview, thumb });
      } catch {
        clearTimeout(timeout);
        finish({ preview: null, thumb: null });
      }
    });

    video.addEventListener("error", () => {
      clearTimeout(timeout);
      finish({ preview: null, thumb: null });
    });
  });
}

async function processImage(
  file: File,
): Promise<{ original: Blob; preview: Blob | null; thumb: Blob | null }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // createImageBitmap fails on HEIC (desktop browsers) and corrupt files.
    // HEIC is special: Telegram won't render raw .heic inline, so we can
    // NOT fall through to "ship original as-is". Reject loudly instead so
    // the model converts to JPG before uploading.
    const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
    if (isHeicExt(ext)) {
      throw new Error(
        "This browser can't decode HEIC — please convert the photo to JPG " +
          "before uploading (iPhone: Settings → Camera → Formats → Most Compatible).",
      );
    }
    // Non-HEIC fallback: ship the original as-is and skip the preview — the
    // send path will detect the missing preview_url and use the original.
    return { original: file, preview: null, thumb: null };
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

    // Thumb: same source bitmap, but small + crisp + unblurred so the Vault
    // grid can render sharp tiles at ~30 KB each instead of pulling the
    // multi-MB original for every card.
    const thumbFit = fittedSize(bitmap.width, bitmap.height, THUMB_MAX_DIM);
    const thumb = await renderToBlob(bitmap, thumbFit.w, thumbFit.h, {
      quality: THUMB_QUALITY,
    });

    return { original, preview, thumb };
  } finally {
    bitmap.close?.();
  }
}

export async function uploadPpvMedia(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<UploadResult> {
  // Refuse anything Telegram can't render inline (.jfif, .heic, .tiff, …) so
  // the vault never holds content that arrives broken in a fan's chat.
  const valid = validatePpvFile(file);
  if (!valid.ok) throw new Error(valid.error);
  const kind = valid.kind;
  const isImage = kind === "image";
  const isVideo = kind === "video";
  const id = crypto.randomUUID();

  let originalBlob: Blob = file;
  let previewBlob: Blob | null = null;
  let thumbBlob: Blob | null = null;
  let originalExt = file.name.split(".").pop()?.toLowerCase() || "bin";

  const isGif = originalExt === "gif" || file.type === "image/gif";

  if (isImage && !isGif) {
    try {
      const { original, preview, thumb } = await processImage(file);
      originalBlob = original;
      previewBlob = preview;
      thumbBlob = thumb;
      // If we re-encoded as JPEG, lock the extension to .jpg so the
      // content-type matches what we upload.
      if (originalBlob !== file) originalExt = "jpg";
    } catch (e) {
      // Image processing failed entirely — fall through with the raw file.
      console.warn("[uploadPpvMedia] image processing failed, uploading original as-is:", e);
    }
  } else if (isGif) {
    // Keep the animated GIF verbatim (re-encoding to JPEG would freeze it to
    // one frame). Best-effort blurred poster + crisp thumb from the first
    // frame; if either fails the tile falls back to preview_url / lock.
    try {
      const { preview, thumb } = await processImage(file);
      previewBlob = preview;
      thumbBlob = thumb;
    } catch (e) {
      console.warn("[uploadPpvMedia] gif preview capture failed:", e);
    }
  } else if (isVideo) {
    // Keep the original video verbatim, but capture BOTH a blurred poster
    // (for fan-facing preview) and a crisp poster (for the agency Vault
    // grid tile) from the same seeked frame.
    try {
      const { preview, thumb } = await processVideoPreview(file);
      previewBlob = preview;
      thumbBlob = thumb;
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

  let thumbUrl: string | null = null;
  if (thumbBlob) {
    const thumbPath = `${userId}/${id}_thumb.jpg`;
    const { error: e3 } = await supabase.storage
      .from("ppvs")
      .upload(thumbPath, thumbBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (!e3) {
      thumbUrl = supabase.storage.from("ppvs").getPublicUrl(thumbPath).data.publicUrl;
    } else {
      console.warn("[uploadPpvMedia] thumb upload failed, continuing without:", e3);
    }
  }

  const mediaUrl = supabase.storage.from("ppvs").getPublicUrl(originalPath).data.publicUrl;
  return { mediaUrl, previewUrl, thumbUrl };
}

export function ppvMediaPathFromUrl(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/public\/ppvs\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

export async function deletePpvMedia(
  supabase: SupabaseClient,
  mediaUrl: string,
  previewUrl?: string | null,
  thumbUrl?: string | null,
): Promise<void> {
  const paths: string[] = [];
  const main = ppvMediaPathFromUrl(mediaUrl);
  if (main) paths.push(main);
  if (previewUrl) {
    const pp = ppvMediaPathFromUrl(previewUrl);
    if (pp) paths.push(pp);
  }
  if (thumbUrl) {
    const tp = ppvMediaPathFromUrl(thumbUrl);
    if (tp) paths.push(tp);
  }
  if (paths.length === 0) return;
  await supabase.storage.from("ppvs").remove(paths);
}
