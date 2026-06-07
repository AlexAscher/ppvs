/**
 * Shared utilities for swapping unicode emoji → iamcal Apple PNGs.
 * Used by both `twemoji()` (per-call JSX wrapper) and `GlobalEmojiSwap`
 * (mount-time DOM walker for static text).
 *
 * See ./twemoji.tsx header for the FE0F rule rationale.
 */

export const EMOJI_VERSION = "v15.1.2";
export const EMOJI_BASE = `https://cdn.jsdelivr.net/gh/iamcal/emoji-data@${EMOJI_VERSION}/img-apple-64`;

// Match keycap, flag, or any standard emoji sequence with optional
// FE0F/FE0E/skin-tone/ZWJ tail.
export const EMOJI_REGEX_SOURCE =
  "[*#0-9]\\u{FE0F}?\\u{20E3}" +
  "|" +
  "[\\u{1F1E6}-\\u{1F1FF}][\\u{1F1E6}-\\u{1F1FF}]" +
  "|" +
  "\\p{Extended_Pictographic}(?:\\u{FE0E}|\\u{FE0F}|\\u{200D}\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}]|\\u{20E3})*";

export const EMOJI_REGEX = new RegExp(EMOJI_REGEX_SOURCE, "gu");

const TEXT_DEFAULT_NEEDS_FE0F = /\p{Extended_Pictographic}/u;
const EMOJI_DEFAULT = /\p{Emoji_Presentation}/u;

/** Build the canonical iamcal filename for an emoji sequence. */
export function emojiFilename(text: string): string {
  const codepoints: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0xfe0f || cp === 0xfe0e) continue;
    codepoints.push(cp.toString(16).padStart(4, "0"));
    if (
      TEXT_DEFAULT_NEEDS_FE0F.test(ch) &&
      !EMOJI_DEFAULT.test(ch) &&
      !(cp >= 0x1f3fb && cp <= 0x1f3ff)
    ) {
      codepoints.push("fe0f");
    }
  }
  if (
    codepoints.length >= 2 &&
    codepoints[codepoints.length - 1] === "20e3" &&
    codepoints[codepoints.length - 2] !== "fe0f"
  ) {
    codepoints.splice(codepoints.length - 1, 0, "fe0f");
  }
  return codepoints.join("-");
}

/** Fallback filename (strip every FE0F) — try on primary 404. */
export function emojiFallbackFilename(text: string): string {
  const codepoints: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0xfe0f || cp === 0xfe0e) continue;
    codepoints.push(cp.toString(16).padStart(4, "0"));
  }
  return codepoints.join("-");
}

/** Image URL for an emoji sequence. */
export function emojiUrl(text: string): string {
  return `${EMOJI_BASE}/${emojiFilename(text)}.png`;
}
