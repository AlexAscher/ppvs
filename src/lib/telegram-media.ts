import { Api } from "telegram";
import { strippedPhotoToJpg } from "telegram/Utils";

export type MessageMedia =
  | {
      type: "photo";
      thumbDataUrl: string | null;
      width: number | null;
      height: number | null;
    }
  | {
      type: "video";
      thumbDataUrl: string | null;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    }
  | {
      type: "document";
      thumbDataUrl: string | null;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
    };

/**
 * Extract a tiny in-band JPEG preview from Telegram's "stripped" thumbnail
 * format. Returns null when no stripped thumb is present (e.g. for many
 * documents and some videos).
 */
function dataUrlFromStripped(sizes: (Api.TypePhotoSize | Api.TypeVideoSize)[] | undefined): string | null {
  if (!sizes) return null;
  for (const s of sizes) {
    if (s instanceof Api.PhotoStrippedSize) {
      try {
        const jpg = strippedPhotoToJpg(s.bytes);
        return `data:image/jpeg;base64,${jpg.toString("base64")}`;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function bestPhotoSize(sizes: Api.TypePhotoSize[] | undefined): { w: number | null; h: number | null } {
  if (!sizes) return { w: null, h: null };
  let best: { w: number; h: number } | null = null;
  for (const s of sizes) {
    if (s instanceof Api.PhotoSize || s instanceof Api.PhotoSizeProgressive) {
      const w = s.w ?? 0;
      const h = s.h ?? 0;
      if (!best || w * h > best.w * best.h) best = { w, h };
    }
  }
  return best ?? { w: null, h: null };
}

function videoAttrs(
  attributes: Api.TypeDocumentAttribute[] | undefined,
): { width: number | null; height: number | null; durationSec: number | null; fileName: string | null } {
  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = null;
  let fileName: string | null = null;
  for (const a of attributes ?? []) {
    if (a instanceof Api.DocumentAttributeVideo) {
      width = a.w ?? null;
      height = a.h ?? null;
      durationSec = a.duration != null ? Math.round(Number(a.duration)) : null;
    } else if (a instanceof Api.DocumentAttributeFilename) {
      fileName = a.fileName ?? null;
    }
  }
  return { width, height, durationSec, fileName };
}

export function extractMessageMedia(msg: Api.Message): MessageMedia | null {
  const media = msg.media;
  if (!media) return null;

  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    const sizes = media.photo.sizes ?? [];
    const { w, h } = bestPhotoSize(sizes);
    return {
      type: "photo",
      thumbDataUrl: dataUrlFromStripped(sizes),
      width: w,
      height: h,
    };
  }

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    const mime = doc.mimeType ?? "";
    const thumbDataUrl = dataUrlFromStripped(doc.thumbs ?? undefined);
    const attrs = videoAttrs(doc.attributes);

    if (mime.startsWith("video/")) {
      return {
        type: "video",
        thumbDataUrl,
        width: attrs.width,
        height: attrs.height,
        durationSec: attrs.durationSec,
      };
    }

    // Animated stickers, gifs, audio etc. — treat as generic document.
    return {
      type: "document",
      thumbDataUrl,
      fileName: attrs.fileName,
      mimeType: mime || null,
      sizeBytes: doc.size != null ? Number(doc.size) : null,
    };
  }

  return null;
}
