import { Api } from "telegram";

/**
 * Telegram-side cache of uploaded PPV media. On the first delivery we
 * upload the bytes; on subsequent deliveries we re-send by reference
 * using the saved Photo / Document descriptor — no download from
 * Supabase, no upload to Telegram, just a single MTProto SendMedia call.
 *
 * Storage shape on disk (ppvs.tg_file_id): JSON string with this layout:
 *   { kind: 'photo' | 'document', id, accessHash, fileReference, dcId? }
 *
 * `id` and `accessHash` are bigints — stringified to survive JSON. The
 * `fileReference` is base64 since it's a Buffer.
 *
 * Telegram occasionally rotates `fileReference`. When that happens the
 * server returns FILE_REFERENCE_EXPIRED / FILE_REFERENCE_INVALID and we
 * fall back to a fresh upload (then store the new descriptor).
 */

import bigInt from "big-integer";

export type CachedFile =
  | {
      kind: "photo";
      id: string;
      accessHash: string;
      fileReference: string; // base64
    }
  | {
      kind: "document";
      id: string;
      accessHash: string;
      fileReference: string; // base64
    };

export function isFileReferenceError(e: unknown): boolean {
  if (!e) return false;
  const msg = e instanceof Error ? e.message : String(e);
  return /FILE_REFERENCE/i.test(msg);
}

/**
 * Extract a cacheable descriptor from a freshly-sent Telegram message.
 * Returns null if the message has no photo / document (e.g. text-only).
 */
export function extractCachedFile(msg: Api.Message): CachedFile | null {
  const media = msg.media;
  if (!media) return null;
  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    const p = media.photo;
    return {
      kind: "photo",
      id: p.id.toString(),
      accessHash: p.accessHash.toString(),
      fileReference: Buffer.from(p.fileReference).toString("base64"),
    };
  }
  if (
    media instanceof Api.MessageMediaDocument &&
    media.document instanceof Api.Document
  ) {
    const d = media.document;
    return {
      kind: "document",
      id: d.id.toString(),
      accessHash: d.accessHash.toString(),
      fileReference: Buffer.from(d.fileReference).toString("base64"),
    };
  }
  return null;
}

export function serializeCachedFile(c: CachedFile): string {
  return JSON.stringify(c);
}

export function deserializeCachedFile(s: string | null | undefined): CachedFile | null {
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (!obj || typeof obj !== "object") return null;
    if (obj.kind !== "photo" && obj.kind !== "document") return null;
    if (typeof obj.id !== "string" || typeof obj.accessHash !== "string") return null;
    if (typeof obj.fileReference !== "string") return null;
    return obj as CachedFile;
  } catch {
    return null;
  }
}

/**
 * Build the `InputMedia` variant gramJS expects when sending by reference.
 * Use the result with `tg.invoke(new Api.messages.SendMedia({…, media}))`.
 */
export function toInputMedia(
  c: CachedFile,
): Api.InputMediaPhoto | Api.InputMediaDocument {
  const id = bigInt(c.id);
  const accessHash = bigInt(c.accessHash);
  const fileReference = Buffer.from(c.fileReference, "base64");
  if (c.kind === "photo") {
    return new Api.InputMediaPhoto({
      id: new Api.InputPhoto({ id, accessHash, fileReference }),
    });
  }
  return new Api.InputMediaDocument({
    id: new Api.InputDocument({ id, accessHash, fileReference }),
  });
}
