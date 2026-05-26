import { Fragment, type ReactNode } from "react";

/**
 * Parse a text string and replace unicode emoji with <img> tags pointing
 * to Twitter's Twemoji SVG set on jsDelivr.
 *
 * Why: Telegram Web renders emojis in an Apple-derived style; on Windows
 * the native font (Segoe Fluent Emoji) looks completely different from
 * what users see in Telegram. Twemoji is the closest free, cross-platform
 * match — it's the same set Telegram falls back to on platforms without
 * Apple Color Emoji.
 *
 * URL pattern:
 *   https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/{codepoint}.svg
 *
 * Codepoint convention: lowercase hex of each codepoint, joined by "-".
 * Variation Selector 16 (FE0F) is stripped UNLESS the sequence contains
 * a Zero-Width Joiner (U+200D) — matches Twemoji's own naming rules.
 */

const TWEMOJI_VERSION = "14.0.2";
const TWEMOJI_BASE = `https://cdn.jsdelivr.net/gh/twitter/twemoji@${TWEMOJI_VERSION}/assets/svg`;

// Matches an Extended_Pictographic codepoint optionally followed by
// variation selectors, ZWJ-joined continuations, skin-tone modifiers and
// further pictographic codepoints. Covers single emoji, flag pairs
// (regional indicators), and ZWJ family sequences like 👨‍👩‍👧.
const EMOJI_REGEX =
  /\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\p{Extended_Pictographic}|\u{20E3})*/gu;

function toCodePoints(text: string): string {
  // Build the Twemoji filename for this emoji sequence.
  const hasZwj = text.includes("‍");
  const cps: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // Drop variation selector unless we're in a ZWJ sequence — Twemoji's
    // file naming for ZWJ sequences keeps FE0F, but for bare emoji it doesn't.
    if (cp === 0xfe0f && !hasZwj) continue;
    cps.push(cp.toString(16));
  }
  return cps.join("-");
}

/**
 * Convert a string into a React-renderable fragment with Twemoji <img>
 * tags substituted in place of every unicode emoji sequence.
 *
 * Pass `key` if you're rendering multiple parsed fragments in a list and
 * need stable keys for outer wrappers.
 */
export function twemoji(text: string, key?: string | number): ReactNode {
  if (!text) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  EMOJI_REGEX.lastIndex = 0;
  for (let m = EMOJI_REGEX.exec(text); m !== null; m = EMOJI_REGEX.exec(text)) {
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));
    const cp = toCodePoints(m[0]);
    if (cp) {
      parts.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`tw-${key ?? ""}-${i}`}
          src={`${TWEMOJI_BASE}/${cp}.svg`}
          alt={m[0]}
          // Inline-block, 1.1em tall so it sits at the visual line height
          // of surrounding text without disrupting wrapping.
          className="inline-block align-text-bottom"
          style={{ width: "1.1em", height: "1.1em", verticalAlign: "-0.15em" }}
          draggable={false}
        />,
      );
    } else {
      parts.push(m[0]);
    }
    last = start + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return text;
  return <Fragment>{parts}</Fragment>;
}
