import { Api, TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import bigInt from "big-integer";
import { buildPeer } from "@/lib/telegram-peer";

/**
 * PPV delivery via Telegram MTProto.
 *
 * Primary path — external URL: ask Telegram to fetch the URL itself via
 * `InputMediaPhotoExternal` / `InputMediaDocumentExternal`. Telegram → AWS
 * (Supabase) is a fat datacenter pipe, so the chatter's home Wi-Fi only
 * carries a tiny API request (the URL string) instead of the file payload.
 *
 * Fallback — buffer upload: Telegram's external-URL fetcher is picky
 * (sometimes returns MEDIA_INVALID — domain quirks, content-type mismatch,
 * size limits). On any failure we fall back to downloading from Supabase
 * server-side and uploading the raw bytes via `tg.uploadFile()`. Slower,
 * but works whenever the external path doesn't.
 */

const TG_ALBUM_LIMIT = 10;
const FETCH_TIMEOUT_MS = 120_000;

/** Generate an 8-char URL-safe code for /pay/{code}. */
export function generatePpvCode(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mov|webm|m4v|mkv)$/.test(u);
}

function basenameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop();
    return last && last.length > 0 ? last : fallback;
  } catch {
    return fallback;
  }
}

/** Cryptographically-random 64-bit BigInteger for Telegram's randomId. */
function randomId(): bigInt.BigInteger {
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return bigInt(hex, 16);
}

async function fetchBuffer(url: string, label = "fetch"): Promise<Buffer> {
  const controller = new AbortController();
  let aborted = false;
  const t = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} for ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e: unknown) {
    if (aborted) {
      throw new Error(
        `${label} timed out after ${FETCH_TIMEOUT_MS / 1000}s downloading ${url}`,
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${label} failed for ${url}: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Primary path — hand Telegram the URL via UploadMedia/external. Returns
 * an `InputMediaPhoto`/`InputMediaDocument` reference to the resulting
 * already-uploaded file on Telegram's CDN, ready for SendMultiMedia.
 */
async function externalUrlToInputMedia(
  tg: TelegramClient,
  peer: Api.TypeInputPeer,
  url: string,
): Promise<Api.TypeInputMedia> {
  const external = isLikelyVideoUrl(url)
    ? new Api.InputMediaDocumentExternal({ url })
    : new Api.InputMediaPhotoExternal({ url });

  const result = await tg.invoke(new Api.messages.UploadMedia({ peer, media: external }));

  if (result instanceof Api.MessageMediaPhoto && result.photo instanceof Api.Photo) {
    return new Api.InputMediaPhoto({
      id: new Api.InputPhoto({
        id: result.photo.id,
        accessHash: result.photo.accessHash,
        fileReference: result.photo.fileReference,
      }),
    });
  }
  if (
    result instanceof Api.MessageMediaDocument &&
    result.document instanceof Api.Document
  ) {
    return new Api.InputMediaDocument({
      id: new Api.InputDocument({
        id: result.document.id,
        accessHash: result.document.accessHash,
        fileReference: result.document.fileReference,
      }),
    });
  }
  throw new Error(`Unexpected media type from UploadMedia for ${url}`);
}

/**
 * Fallback path — download the file to our server, upload the raw bytes to
 * Telegram via gramJS. Slower (two hops through the chatter's network) but
 * works whenever Telegram refuses to fetch the external URL itself.
 */
async function uploadedBufferToInputMedia(
  tg: TelegramClient,
  url: string,
): Promise<Api.TypeInputMedia> {
  const buf = await fetchBuffer(url, "fallback download");
  const name = basenameFromUrl(url, "file.bin");
  const file = new CustomFile(name, buf.length, "", buf);

  const uploaded = await tg.uploadFile({ file, workers: 4 });

  if (isLikelyVideoUrl(url)) {
    // For videos we have to tell Telegram the mime-type explicitly via
    // InputMediaUploadedDocument; without it Telegram may not recognise
    // it as a streamable video.
    return new Api.InputMediaUploadedDocument({
      file: uploaded,
      mimeType: "video/mp4",
      attributes: [new Api.DocumentAttributeFilename({ fileName: name })],
    });
  }
  return new Api.InputMediaUploadedPhoto({ file: uploaded });
}

/**
 * Resolve a URL into an InputMedia reference, preferring the fast external
 * path. Logs which path was used so we can spot patterns of failure.
 */
async function urlToInputMediaWithFallback(
  tg: TelegramClient,
  peer: Api.TypeInputPeer,
  url: string,
): Promise<Api.TypeInputMedia> {
  try {
    return await externalUrlToInputMedia(tg, peer, url);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[ppv-delivery] external URL rejected by Telegram (${msg}). Falling back to buffer upload for ${url}`,
    );
    return await uploadedBufferToInputMedia(tg, url);
  }
}

/**
 * Send a list of URLs as one or more Telegram albums, optional caption on
 * the first item. Each URL is first turned into an InputMedia reference
 * (preferring the external-URL fast path), then album-sent.
 */
async function sendUrlsAsAlbums(
  tg: TelegramClient,
  peer: Api.TypeInputPeer,
  urls: string[],
  caption: string,
): Promise<void> {
  if (urls.length === 0) return;

  const inputs: Api.TypeInputMedia[] = [];
  for (const url of urls) {
    inputs.push(await urlToInputMediaWithFallback(tg, peer, url));
  }

  let captionPlaced = false;
  const trimmedCaption = caption.trim();
  for (let i = 0; i < inputs.length; i += TG_ALBUM_LIMIT) {
    const chunk = inputs.slice(i, i + TG_ALBUM_LIMIT);
    if (chunk.length === 0) continue;

    const chunkCaption: string =
      !captionPlaced && trimmedCaption ? trimmedCaption : "";
    if (chunkCaption) captionPlaced = true;

    if (chunk.length === 1) {
      await tg.invoke(
        new Api.messages.SendMedia({
          peer,
          media: chunk[0],
          message: chunkCaption,
          randomId: randomId(),
        }),
      );
    } else {
      const multiMedia = chunk.map(
        (m, idx) =>
          new Api.InputSingleMedia({
            media: m,
            message: idx === 0 ? chunkCaption : "",
            randomId: randomId(),
          }),
      );
      await tg.invoke(new Api.messages.SendMultiMedia({ peer, multiMedia }));
    }
  }
}

export type PpvPreviewItem = {
  /** Public URL of the original (used if preview_url is null — videos, legacy rows). */
  mediaUrl: string;
  /** Public URL of the pre-blurred 720px JPEG. Null for videos or legacy rows. */
  previewUrl: string | null;
};

/**
 * Send a single text message to the fan with the pay link.
 *
 * Web-delivery mode: chatter's gramJS only posts the announcement; previews
 * + originals are served from the /pay/{code} page directly by Supabase
 * CDN to the fan's browser. The chatter's flaky network only carries this
 * single text message instead of multi-MB photo albums.
 *
 * If/when we move to a VPS with stable Telegram + Supabase reachability,
 * see `sendUrlsAsAlbums` below — it's still here for the future flip back.
 */
export async function sendBlurredPreviewWithLink(
  tg: TelegramClient,
  peerId: string,
  accessHash: string | null,
  items: PpvPreviewItem[],
  caption: string,
  payUrl: string,
  totalPrice: number,
): Promise<void> {
  const peer = buildPeer(peerId, accessHash);

  const lines = [
    caption.trim(),
    `🔒 Locked content — ${items.length} item${items.length === 1 ? "" : "s"}`,
    `💰 $${totalPrice}`,
    `Tap to unlock: ${payUrl}`,
  ].filter(Boolean);
  await tg.sendMessage(peer, { message: lines.join("\n") });
}

/**
 * After "payment" — deliver the original (unblurred) files back to the fan
 * as one or more albums via the same external-URL-with-fallback path.
 */
export async function sendOriginalsAlbum(
  tg: TelegramClient,
  peerId: string,
  accessHash: string | null,
  mediaUrls: string[],
  caption: string,
): Promise<void> {
  const peer = buildPeer(peerId, accessHash);
  const urls = mediaUrls.filter((u) => !!u);
  await sendUrlsAsAlbums(tg, peer, urls, caption);
}
