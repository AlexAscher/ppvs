import sharp from "sharp";
import { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { buildPeer } from "@/lib/telegram-peer";

/**
 * PPV delivery via Telegram MTProto — buffer-upload path.
 *
 * Trade-offs we made and undid:
 *   - `InputMediaPhotoExternal` (Telegram fetches the URL itself) failed
 *     with `400: MEDIA_INVALID` for Supabase storage URLs. Removed.
 *   - Web-only delivery (no Telegram album) worked but loses the "fan gets
 *     content in Telegram DM" UX the chatter expects. Restored.
 *
 * Current path: download from Supabase → upload via `tg.sendFile()` as
 * `CustomFile` buffers, with **retry on failure** (3 attempts, exponential
 * backoff). This is the same approach that produced the working screenshot
 * the user shared — sharp-blur fallback for legacy items without
 * `preview_url`, pre-blurred preview for new items.
 *
 * For files >5 MB on flaky networks the upload may still time out — the
 * retry helps for transient drops, but the only architectural cure is a
 * VPS with a stable link to both Supabase and Telegram DC.
 */

const TG_ALBUM_LIMIT = 10;
const FETCH_TIMEOUT_MS = 60_000;
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 2_000;
// Concurrency cap on parallel downloads — Supabase storage on flaky home
// internet hates 10+ parallel fetches from the same client.
const DOWNLOAD_CONCURRENCY = 2;

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

/**
 * Retry an async operation up to RETRY_ATTEMPTS times with exponential
 * backoff. Survives transient network drops (the "terminated" errors that
 * killed deliveries on flaky home internet).
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < RETRY_ATTEMPTS) {
        const wait = RETRY_BACKOFF_BASE_MS * attempt;
        console.warn(
          `[ppv-delivery] ${label} attempt ${attempt}/${RETRY_ATTEMPTS} failed (${msg}). Retrying in ${wait}ms…`,
        );
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.error(`[ppv-delivery] ${label} all ${RETRY_ATTEMPTS} attempts failed: ${msg}`);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchBuffer(url: string, label: string): Promise<Buffer> {
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
 * Run an array of async tasks with a small concurrency cap. Preserves
 * ordering — returns an array `T[]` aligned with the input task array.
 */
async function mapWithConcurrency<I, O>(
  items: I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Build a CustomFile from a remote URL — downloads bytes with retry and
 * wraps them so gramJS can upload via tg.sendFile.
 */
async function customFileFromUrl(
  url: string,
  namePrefix: string,
  label = "download",
): Promise<CustomFile> {
  const buf = await withRetry(`${label} ${url}`, () => fetchBuffer(url, label));
  const name = basenameFromUrl(url, `${namePrefix}.bin`);
  return new CustomFile(name, buf.length, "", buf);
}

/**
 * Slow-path blur: download original, blur with sharp, return CustomFile.
 * Used when a PPV row has no `preview_url` (legacy item uploaded before
 * client-side blurring landed). Newer uploads already have a 30–80 KB
 * pre-blurred jpeg in storage and skip sharp entirely.
 */
async function blurredCustomFileFromUrl(url: string, idx: number): Promise<CustomFile> {
  const buf = await withRetry(`blur-source ${url}`, () =>
    fetchBuffer(url, "download original for slow-path blur"),
  );
  let pipeline = sharp(buf, { failOn: "none" })
    .resize(720, 720, { fit: "inside", withoutEnlargement: true })
    .modulate({ brightness: 0.85 });
  try {
    pipeline = pipeline.blur(40);
  } catch {
    // sharp.blur throws on some weird inputs; fall through without blur.
  }
  const out = await pipeline.jpeg({ quality: 60 }).toBuffer();
  return new CustomFile(`preview_${idx + 1}.jpg`, out.length, "", out);
}

export type PpvPreviewItem = {
  /** Public URL of the original (slow-path fallback if previewUrl missing). */
  mediaUrl: string;
  /** Public URL of the pre-blurred 720px jpeg. Null for videos / legacy rows. */
  previewUrl: string | null;
};

/**
 * Send the blurred preview album + pay-link caption to the fan in one
 * Telegram message group. The caption is attached to the first album chunk
 * so Telegram displays it inline with the album.
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

  // Skip video items from the preview album — sending unblurred would
  // defeat the locked-preview UX. Describe video PPVs in the caption.
  type Src = { url: string; preBlurred: boolean };
  const sources: Src[] = items
    .filter((it) => it.mediaUrl && !isLikelyVideoUrl(it.mediaUrl))
    .map((it) =>
      it.previewUrl
        ? { url: it.previewUrl, preBlurred: true }
        : { url: it.mediaUrl, preBlurred: false },
    );

  const files = await mapWithConcurrency(sources, DOWNLOAD_CONCURRENCY, async (s, i) =>
    s.preBlurred
      ? customFileFromUrl(s.url, `preview_${i + 1}.jpg`, "download preview")
      : blurredCustomFileFromUrl(s.url, i),
  );

  const lines = [
    caption.trim(),
    `🔒 Locked content — ${items.length} item${items.length === 1 ? "" : "s"}`,
    `💰 $${totalPrice}`,
    `Tap to unlock: ${payUrl}`,
  ].filter(Boolean);
  const messageCaption = lines.join("\n");

  // Fallback: if no preview files (e.g. all videos), just send the text.
  if (files.length === 0) {
    await tg.sendMessage(peer, { message: messageCaption });
    return;
  }

  let captionPlaced = false;
  for (let i = 0; i < files.length; i += TG_ALBUM_LIMIT) {
    const chunk = files.slice(i, i + TG_ALBUM_LIMIT);
    if (chunk.length === 0) continue;

    const chunkCaption = !captionPlaced ? messageCaption : "";
    if (chunkCaption) captionPlaced = true;

    await withRetry(`upload preview chunk ${Math.floor(i / TG_ALBUM_LIMIT) + 1}`, async () => {
      if (chunk.length === 1) {
        await tg.sendFile(peer, { file: chunk[0], caption: chunkCaption });
      } else {
        await tg.sendFile(peer, { file: chunk, caption: chunkCaption });
      }
    });
  }
}

/**
 * Deliver originals to the fan as one or more Telegram albums after they
 * click Pay. The web-side reveal already happened immediately on the
 * /pay page; this is the second copy via Telegram DM.
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

  const files = await mapWithConcurrency(urls, DOWNLOAD_CONCURRENCY, (u, i) =>
    customFileFromUrl(u, `original_${i + 1}`, "download original"),
  );

  let captionPlaced = false;
  const trimmed = caption.trim();
  for (let i = 0; i < files.length; i += TG_ALBUM_LIMIT) {
    const chunk = files.slice(i, i + TG_ALBUM_LIMIT);
    if (chunk.length === 0) continue;

    const chunkCaption = !captionPlaced && trimmed ? trimmed : "";
    if (chunkCaption) captionPlaced = true;

    await withRetry(`upload original chunk ${Math.floor(i / TG_ALBUM_LIMIT) + 1}`, async () => {
      if (chunk.length === 1) {
        await tg.sendFile(peer, { file: chunk[0], caption: chunkCaption });
      } else {
        await tg.sendFile(peer, { file: chunk, caption: chunkCaption });
      }
    });
  }
}
