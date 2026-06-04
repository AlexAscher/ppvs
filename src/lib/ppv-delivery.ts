import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { Api, TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { generateRandomLong } from "telegram/Helpers";
import { buildPeer } from "@/lib/telegram-peer";
import {
  type CachedFile,
  deserializeCachedFile,
  extractCachedFile,
  isFileReferenceError,
  serializeCachedFile,
  toInputMedia,
} from "@/lib/ppv-file-cache";

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

// Pre-blurred previews are tiny (30–80 KB) → short timeout is fine.
const PREVIEW_FETCH_TIMEOUT_MS = 20_000;

// Slow-path blur downloads the FULL original (multi-MB) to blur it server
// side — only for legacy items missing `preview_url`. We give it a real
// budget so it usually succeeds (chatter wants the actual media blurred,
// not a lock placeholder), and we backfill `preview_url` afterwards so
// this cost is paid once per item. Placeholder stays the last resort.
const SLOW_BLUR_TIMEOUT_MS = 45_000;
const SLOW_BLUR_ATTEMPTS = 2;

/**
 * Crypto-strong URL-safe code for /pay/{code}. 12 chars from a 33-char
 * alphabet → 33^12 ≈ 1.6e18 — not enumerable. Rejection sampling avoids
 * modulo bias (33 ≠ a power of 2).
 */
export function generatePpvCode(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const TARGET = 12;
  const out: string[] = [];
  while (out.length < TARGET) {
    const buf = randomBytes(32);
    for (let i = 0; i < buf.length && out.length < TARGET; i++) {
      const v = buf[i] & 0x3f; // 0..63 — 33 fits in 6 bits
      if (v < alphabet.length) out.push(alphabet[v]);
    }
  }
  return out.join("");
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

// Telegram errors that won't improve by retrying — they're account
// reputation / permission / spam flags, not transient network drops.
// Retrying these just makes the spam flag WORSE (more identical sends in
// a short window), so we fail fast.
const NON_RETRYABLE_RE =
  /PEER_FLOOD|FLOOD_WAIT|USER_IS_BLOCKED|YOU_BLOCKED_USER|USER_IS_BOT|PEER_ID_INVALID|CHAT_WRITE_FORBIDDEN|USER_DEACTIVATED|INPUT_USER_DEACTIVATED|MEDIA_INVALID|AUTH_KEY_UNREGISTERED/i;

/**
 * Turn a raw Telegram/MTProto error into a short, actionable message for
 * the chatter. Falls back to the raw text for unknown errors.
 */
export function humanizeSendError(raw: string): string {
  if (/PEER_FLOOD/i.test(raw)) {
    return "Telegram limited this account for spam (PEER_FLOOD). New accounts get flagged when sending links/albums to people who haven't messaged first. Warm the account up (reply to a few real chats), wait a few hours, or use an older account.";
  }
  const fw = raw.match(/FLOOD_WAIT_(\d+)/i);
  if (fw) {
    const secs = Number(fw[1]);
    const human = secs >= 3600 ? `${Math.ceil(secs / 3600)}h` : secs >= 60 ? `${Math.ceil(secs / 60)}min` : `${secs}s`;
    return `Telegram rate-limited this account. Wait ~${human} before sending again.`;
  }
  if (/USER_IS_BLOCKED|YOU_BLOCKED_USER/i.test(raw)) return "This fan has blocked the model's account.";
  if (/CHAT_WRITE_FORBIDDEN/i.test(raw)) return "The model account isn't allowed to message this chat.";
  if (/AUTH_KEY_UNREGISTERED/i.test(raw)) return "The model's Telegram session expired — reconnect it in Dashboard → Models.";
  return raw;
}

/**
 * Retry an async operation up to RETRY_ATTEMPTS times with exponential
 * backoff. Survives transient network drops (the "terminated" errors that
 * killed deliveries on flaky home internet). Fatal/spam errors fail fast.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Don't retry non-recoverable errors — retrying PEER_FLOOD/FLOOD_WAIT
      // escalates the flag.
      if (NON_RETRYABLE_RE.test(msg)) {
        console.error(`[ppv-delivery] ${label} failed (non-retryable): ${msg}`);
        throw e instanceof Error ? e : new Error(msg);
      }
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

async function fetchBuffer(
  url: string,
  label: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Buffer> {
  const controller = new AbortController();
  let aborted = false;
  const t = setTimeout(() => {
    aborted = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} for ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e: unknown) {
    if (aborted) {
      throw new Error(
        `${label} timed out after ${timeoutMs / 1000}s downloading ${url}`,
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
 *
 * SOFT: returns null instead of throwing when the download times out, so
 * a single un-pullable original can't sink the whole "Send PPV". Uses a
 * short timeout + single attempt — this is only a teaser thumbnail.
 */
async function blurredCustomFileFromUrlSoft(
  url: string,
  idx: number,
): Promise<{ file: CustomFile; jpeg: Buffer } | null> {
  // Try a couple of times — the original is big and the link is flaky, but
  // the chatter really wants the real media blurred. Bounded so a dead
  // link still falls back to the placeholder within ~90s worst case.
  let buf: Buffer | null = null;
  for (let attempt = 1; attempt <= SLOW_BLUR_ATTEMPTS; attempt++) {
    try {
      buf = await fetchBuffer(
        url,
        "download original for slow-path blur",
        SLOW_BLUR_TIMEOUT_MS,
      );
      break;
    } catch (e) {
      console.warn(
        `[ppv-delivery] slow-path blur download attempt ${attempt}/${SLOW_BLUR_ATTEMPTS} failed for ${url}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }
  if (!buf) return null;
  try {
    let pipeline = sharp(buf, { failOn: "none" })
      .resize(720, 720, { fit: "inside", withoutEnlargement: true })
      .modulate({ brightness: 0.85 });
    try {
      pipeline = pipeline.blur(40);
    } catch {
      // sharp.blur throws on some weird inputs; fall through without blur.
    }
    const out = await pipeline.jpeg({ quality: 60 }).toBuffer();
    return {
      file: new CustomFile(`preview_${idx + 1}.jpg`, out.length, "", out),
      jpeg: out,
    };
  } catch (e) {
    console.warn(
      `[ppv-delivery] sharp blur failed for ${url}: ${
        e instanceof Error ? e.message : e
      }`,
    );
    return null;
  }
}

/**
 * SOFT pre-blurred download: returns null on failure rather than throwing.
 * Pre-blurred previews are tiny (30–80 KB) so they almost always succeed,
 * but we still don't want a transient drop to abort the send.
 */
async function customFileFromUrlSoft(
  url: string,
  namePrefix: string,
  label = "download preview",
): Promise<CustomFile | null> {
  try {
    const buf = await fetchBuffer(url, label, PREVIEW_FETCH_TIMEOUT_MS);
    const name = basenameFromUrl(url, `${namePrefix}.bin`);
    return new CustomFile(name, buf.length, "", buf);
  } catch (e) {
    console.warn(
      `[ppv-delivery] preview download skipped for ${url}: ${
        e instanceof Error ? e.message : e
      }`,
    );
    return null;
  }
}

/**
 * Generate a "locked content" placeholder tile entirely in-process (sharp,
 * no network). Used when a real preview can't be pulled — guarantees the
 * teaser album always has one tile per item, so the visible file count
 * matches the "N items" caption even on a flaky uplink. `isVideo` swaps
 * the lock glyph for a play triangle.
 */
async function buildLockedPlaceholder(idx: number, isVideo: boolean): Promise<CustomFile> {
  const glyph = isVideo
    ? // play triangle
      `<path d="M300 300 L300 420 L410 360 Z" fill="#ffffff" fill-opacity="0.9"/>`
    : // padlock: body + shackle
      `<g>
         <rect x="300" y="350" width="120" height="95" rx="16" fill="#ffffff" fill-opacity="0.9"/>
         <path d="M322 350 V322 a38 38 0 0 1 76 0 V350" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="16"/>
       </g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#0d1117" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="720" height="720" fill="#1f2937"/>
    <rect width="720" height="720" fill="url(#g)"/>
    ${glyph}
  </svg>`;
  const out = await sharp(Buffer.from(svg))
    .blur(6)
    .jpeg({ quality: 60 })
    .toBuffer();
  return new CustomFile(`locked_${idx + 1}.jpg`, out.length, "", out);
}

export type PpvPreviewItem = {
  /** ppvs.id — lets the caller backfill preview_url after a slow-path blur. */
  ppvId: string;
  /** Public URL of the original (slow-path fallback if previewUrl missing). */
  mediaUrl: string;
  /** Public URL of the pre-blurred 720px jpeg. Null for videos / legacy rows. */
  previewUrl: string | null;
};

/**
 * Send the blurred preview album + pay-link caption to the fan in one
 * Telegram message group. The caption is attached to the first album chunk
 * so Telegram displays it inline with the album.
 *
 * `onBackfillPreview` is invoked whenever we had to generate a blur the
 * slow way (download original + sharp) — the caller can persist the tiny
 * jpeg as the item's preview_url so subsequent sends skip the heavy
 * download entirely.
 */
export async function sendBlurredPreviewWithLink(
  tg: TelegramClient,
  peerId: string,
  accessHash: string | null,
  items: PpvPreviewItem[],
  caption: string,
  payUrl: string,
  totalPrice: number,
  onBackfillPreview?: (ppvId: string, jpeg: Buffer) => Promise<void>,
): Promise<void> {
  const peer = buildPeer(peerId, accessHash);

  // One tile per item so the visible count matches the caption. For each:
  //   - image with preview_url → download the tiny pre-blurred jpeg (fast)
  //   - image without preview_url → slow-path blur of the original
  //   - video → locked placeholder (we never send the real video as teaser)
  //   - any of the above that fails to download → locked placeholder
  // The placeholder is generated locally (sharp, no network) so it can
  // never fail — guaranteeing N tiles for N items even on a dead uplink.
  const files = await mapWithConcurrency(items, DOWNLOAD_CONCURRENCY, async (it, i) => {
    const isVideo = !it.mediaUrl || isLikelyVideoUrl(it.mediaUrl);
    // Pre-blurred preview (tiny jpeg) — exists for images AND, now, videos
    // (a blurred poster frame captured client-side at upload). Use it for
    // either type.
    if (it.previewUrl) {
      const f = await customFileFromUrlSoft(it.previewUrl, `preview_${i + 1}.jpg`);
      if (f) return f;
    }
    // Slow-path sharp blur only works for images (a still). Videos without a
    // preview can't be blurred server-side without FFmpeg → placeholder.
    if (!isVideo && it.mediaUrl) {
      const blurred = await blurredCustomFileFromUrlSoft(it.mediaUrl, i);
      if (blurred) {
        // Persist this blur as the item's preview_url so we never pay the
        // heavy download again. Best-effort, fire-and-forget.
        if (onBackfillPreview) {
          void onBackfillPreview(it.ppvId, blurred.jpeg).catch(() => {});
        }
        return blurred.file;
      }
    }
    // Fallback (video without preview, or download failed): locked tile.
    return buildLockedPlaceholder(i, isVideo);
  });

  const lines = [
    caption.trim(),
    `🔒 Locked content — ${items.length} item${items.length === 1 ? "" : "s"}`,
    `💰 $${totalPrice}`,
    `Tap to unlock: ${payUrl}`,
  ].filter(Boolean);
  const messageCaption = lines.join("\n");

  // Placeholder generation never fails, so files is non-empty whenever
  // items is. Guard anyway.
  if (files.length === 0) {
    await withRetry("send text-only pay link", async () => {
      await tg.sendMessage(peer, { message: messageCaption });
    });
    return;
  }

  let captionDelivered = false; // caption (pay link) actually reached the fan
  let anyDelivered = false; // at least one chunk got through
  let lastError: unknown = null;

  for (let i = 0; i < files.length; i += TG_ALBUM_LIMIT) {
    const chunk = files.slice(i, i + TG_ALBUM_LIMIT);
    if (chunk.length === 0) continue;

    // Attach the caption to the first chunk we *attempt*; only mark it
    // delivered after the send actually succeeds.
    const includeCaption = !captionDelivered;
    const chunkCaption = includeCaption ? messageCaption : "";

    try {
      await withRetry(`upload preview chunk ${Math.floor(i / TG_ALBUM_LIMIT) + 1}`, async () => {
        if (chunk.length === 1) {
          await tg.sendFile(peer, { file: chunk[0], caption: chunkCaption });
        } else {
          await tg.sendFile(peer, { file: chunk, caption: chunkCaption });
        }
      });
      anyDelivered = true;
      if (includeCaption) captionDelivered = true;
    } catch (e) {
      lastError = e;
      console.error(
        `[ppv-delivery] preview chunk upload failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // If the album couldn't carry the caption (pay link), try a plain text
  // message so the fan can still pay.
  if (!captionDelivered) {
    try {
      await withRetry("send text-only pay link", async () => {
        await tg.sendMessage(peer, { message: messageCaption });
      });
      captionDelivered = true;
      anyDelivered = true;
    } catch (e) {
      lastError = e;
    }
  }

  // Nothing reached the fan — surface a clear, actionable error so the
  // chatter UI shows *why* (most often PEER_FLOOD on a fresh account).
  if (!anyDelivered) {
    const raw = lastError instanceof Error ? lastError.message : String(lastError ?? "send failed");
    throw new Error(humanizeSendError(raw));
  }
}

/**
 * Per-item delivery descriptor. `cachedFileId` is the JSON string stored
 * in ppvs.tg_file_id from a prior successful delivery — null on the
 * first send.
 */
export type OriginalItem = {
  ppvId: string;
  mediaUrl: string;
  cachedFileId: string | null;
};

/**
 * Deliver originals to the fan after they click Pay. Tries the lazy
 * file_id cache first: each item with a previously-stored Photo/Document
 * descriptor goes out as a single MTProto SendMedia call (no download,
 * no upload). Items without a cache — and items whose cache rotted —
 * fall through to the slow buffer-upload path used before, and the
 * fresh descriptor is reported back via `onCache` so the next delivery
 * is instant.
 *
 * Trade-off: cached items go out as individual messages rather than an
 * album. For a typical 1–2 item PPV this is fine; for 5+ item albums the
 * fan sees them as a stream of separate messages. Sending as one album
 * mixed with upload+cached requires `messages.SendMultiMedia` with
 * pre-uploaded media which we'd need to upload separately anyway, so the
 * savings are marginal.
 */
export type DeliveryResult = {
  total: number;
  delivered: number;
  failed: number;
};

export async function sendOriginalsAlbum(
  tg: TelegramClient,
  peerId: string,
  accessHash: string | null,
  items: OriginalItem[],
  caption: string,
  onCache?: (ppvId: string, serialized: string) => Promise<void>,
): Promise<DeliveryResult> {
  const peer = buildPeer(peerId, accessHash);
  const filtered = items.filter((it) => !!it.mediaUrl);
  const result: DeliveryResult = { total: filtered.length, delivered: 0, failed: 0 };
  if (filtered.length === 0) return result;

  const trimmed = caption.trim();
  let captionPlaced = false;

  // Pass 1: send cached items individually using stored file references.
  // Anything that fails the FILE_REFERENCE check rotates to the upload
  // path below. `pendingUpload` collects everything that still needs the
  // bytes path.
  const pendingUpload: OriginalItem[] = [];
  for (const it of filtered) {
    const cached = deserializeCachedFile(it.cachedFileId);
    if (!cached) {
      pendingUpload.push(it);
      continue;
    }
    try {
      const captionForThis = !captionPlaced && trimmed ? trimmed : "";
      await withRetry(`cached-send ${it.ppvId}`, async () => {
        await tg.invoke(
          new Api.messages.SendMedia({
            peer,
            media: toInputMedia(cached),
            message: captionForThis,
            randomId: generateRandomLong(),
          }),
        );
      });
      if (captionForThis) captionPlaced = true;
      result.delivered += 1;
    } catch (e) {
      if (isFileReferenceError(e)) {
        // file_reference rotated — fall through to upload + refresh.
        console.warn(
          `[ppv-delivery] cached file_id for ppv=${it.ppvId} expired, re-uploading`,
        );
        pendingUpload.push(it);
      } else {
        // Some other send error — count as failed but DON'T abort the rest.
        console.error(
          `[ppv-delivery] cached-send failed for ppv=${it.ppvId}: ${
            e instanceof Error ? e.message : e
          }`,
        );
        result.failed += 1;
      }
    }
  }

  if (pendingUpload.length === 0) return result;

  // Pass 2: download items that had no cache (or whose cache expired).
  // SOFT — a download that fails after retries is skipped (counted as
  // failed) rather than aborting the whole delivery. The fan still has
  // the web copy on /pay, and any items that DID download still go out.
  const downloaded = await mapWithConcurrency(
    pendingUpload,
    DOWNLOAD_CONCURRENCY,
    async (it, i): Promise<{ ppvId: string; file: CustomFile } | null> => {
      try {
        const file = await customFileFromUrl(
          it.mediaUrl,
          `original_${i + 1}`,
          "download original",
        );
        return { ppvId: it.ppvId, file };
      } catch (e) {
        console.error(
          `[ppv-delivery] original download failed for ppv=${it.ppvId}: ${
            e instanceof Error ? e.message : e
          }`,
        );
        result.failed += 1;
        return null;
      }
    },
  );
  const filePairs = downloaded.filter(
    (p): p is { ppvId: string; file: CustomFile } => p !== null,
  );

  for (let i = 0; i < filePairs.length; i += TG_ALBUM_LIMIT) {
    const chunk = filePairs.slice(i, i + TG_ALBUM_LIMIT);
    if (chunk.length === 0) continue;

    const chunkCaption = !captionPlaced && trimmed ? trimmed : "";

    try {
      await withRetry(`upload original chunk ${Math.floor(i / TG_ALBUM_LIMIT) + 1}`, async () => {
        // Single-file sends always return one Message; album sends return
        // a sequence. We want to attach a CachedFile to the *originating*
        // ppvId, so we use sendFile in single-file mode when possible and
        // album mode only for multi-item batches; for album batches we
        // still attempt to pair up Photos/Documents with the ppvIds in
        // order (Telegram preserves album order).
        if (chunk.length === 1) {
          const sent = await tg.sendFile(peer, {
            file: chunk[0].file,
            caption: chunkCaption,
          });
          const cf = extractCachedFile(sent as Api.Message);
          if (cf && onCache) {
            await onCache(chunk[0].ppvId, serializeCachedFile(cf));
          }
        } else {
          const sent = (await tg.sendFile(peer, {
            file: chunk.map((c) => c.file),
            caption: chunkCaption,
          })) as unknown as Api.Message | Api.Message[];
          const arr = Array.isArray(sent) ? sent : [sent];
          if (arr.length === chunk.length && onCache) {
            for (let j = 0; j < chunk.length; j++) {
              const cf = extractCachedFile(arr[j]);
              if (cf) await onCache(chunk[j].ppvId, serializeCachedFile(cf));
            }
          }
        }
      });
      if (chunkCaption) captionPlaced = true;
      result.delivered += chunk.length;
    } catch (e) {
      // Whole chunk upload failed after retries — count the chunk as
      // failed but keep going with the next chunk.
      console.error(
        `[ppv-delivery] original chunk upload failed: ${
          e instanceof Error ? e.message : e
        }`,
      );
      result.failed += chunk.length;
    }
  }

  return result;
}

export type { CachedFile };
