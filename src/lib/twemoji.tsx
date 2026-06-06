import type { ReactNode } from "react";

/**
 * No-op emoji renderer.
 *
 * Previously this swapped unicode emoji for Twitter's Twemoji SVG `<img>`s
 * via jsDelivr so they'd render in a Telegram-like style on Windows. We
 * now opt into the system's Apple Color Emoji font (configured in
 * `globals.css`) instead — much faster (no CDN), matches iOS/Telegram
 * exactly on iOS/macOS, and falls back to Segoe UI Emoji / Noto Color
 * Emoji elsewhere.
 *
 * The function is kept (and still exported) so call-sites compile
 * unchanged. They render the raw text and the browser picks the font.
 */
// Second arg is kept for call-site compatibility but is intentionally unread.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function twemoji(text: string, key?: string | number): ReactNode {
  return text;
}
