import { Fragment, type ReactNode, type SyntheticEvent } from "react";
import {
  EMOJI_BASE,
  EMOJI_REGEX,
  emojiFallbackFilename,
  emojiFilename,
} from "./emoji";

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
 * Algorithm + FE0F handling lives in `./emoji.ts` (shared with
 * `GlobalEmojiSwap`).
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
    const primary = emojiFilename(m[0]);
    const fallback = emojiFallbackFilename(m[0]);
    if (primary) {
      parts.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`e-${key ?? ""}-${imgIdx++}`}
          src={`${EMOJI_BASE}/${primary}.png`}
          data-emoji-fallback={fallback !== primary ? fallback : undefined}
          data-emoji-glyph={m[0]}
          alt={m[0]}
          draggable={false}
          style={{
            display: "inline-block",
            height: "1em",
            width: "1em",
            verticalAlign: "-0.15em",
            marginInline: "0.05em",
          }}
          onError={handleEmojiError}
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

function handleEmojiError(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const tried = img.dataset.emojiTried ?? "";
  const fallback = img.dataset.emojiFallback;
  const glyph = img.dataset.emojiGlyph ?? img.alt ?? "";
  if (!tried.includes("fb") && fallback) {
    img.dataset.emojiTried = `${tried}fb,`;
    img.src = `${EMOJI_BASE}/${fallback}.png`;
    return;
  }
  if (!tried.includes("txt")) {
    img.dataset.emojiTried = `${tried}txt,`;
    const span = document.createElement("span");
    span.textContent = glyph;
    span.style.display = "inline";
    img.replaceWith(span);
  }
}
