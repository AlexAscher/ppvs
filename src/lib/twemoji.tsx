import { Fragment, type ReactNode } from "react";

/**
 * Render text with unicode emoji swapped for Apple Color Emoji PNGs.
 *
 * Why images, not the system font: on Windows / Linux the system emoji
 * set (Segoe UI Emoji / Noto Color Emoji) looks nothing like the iOS
 * style users see in Telegram. The `Apple Color Emoji` font isn't
 * shipped outside macOS/iOS so a font fallback alone doesn't help.
 *
 * Set source: github.com/iamcal/emoji-data — the canonical Apple emoji
 * PNG dump used by Slack, Mattermost, etc. Served via jsDelivr.
 *
 *   https://cdn.jsdelivr.net/gh/iamcal/emoji-data@v15.1.2/img-apple-64/{codepoint}.png
 *
 * Filename convention (matches iamcal/emoji-data):
 *   - Lowercase hex codepoints joined by "-".
 *   - Variation Selector 16 (FE0F) is STRIPPED (always).
 *   - Skin-tone / ZWJ continuations are KEPT.
 */

const EMOJI_VERSION = "v15.1.2";
const EMOJI_BASE = `https://cdn.jsdelivr.net/gh/iamcal/emoji-data@${EMOJI_VERSION}/img-apple-64`;

// Extended_Pictographic + optional ZWJ/skin-tone/variation-selector tail.
const EMOJI_REGEX =
  /\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\p{Extended_Pictographic}|\u{20E3})*/gu;

function toFilename(text: string): string {
  // iamcal's filenames omit U+FE0F (variation selector for emoji
  // presentation) entirely — strip it before serializing.
  const cps: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0xfe0f) continue;
    cps.push(cp.toString(16));
  }
  return cps.join("-");
}

/**
 * Walk a string, replacing every emoji sequence with an `<img>` to the
 * iamcal Apple PNG set. The image is aligned to the surrounding text
 * baseline and sized 1em so it inherits the parent font-size naturally.
 */
export function twemoji(text: string, key?: string | number): ReactNode {
  if (!text) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  let imgIdx = 0;
  EMOJI_REGEX.lastIndex = 0;
  for (let m = EMOJI_REGEX.exec(text); m !== null; m = EMOJI_REGEX.exec(text)) {
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));
    const file = toFilename(m[0]);
    if (file) {
      parts.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`e-${key ?? ""}-${imgIdx++}`}
          src={`${EMOJI_BASE}/${file}.png`}
          alt={m[0]}
          draggable={false}
          style={{
            display: "inline-block",
            height: "1em",
            width: "1em",
            verticalAlign: "-0.15em",
            marginInline: "0.05em",
          }}
        />,
      );
    } else {
      parts.push(m[0]);
    }
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment key={key !== undefined ? String(key) : undefined}>{parts}</Fragment>;
}
