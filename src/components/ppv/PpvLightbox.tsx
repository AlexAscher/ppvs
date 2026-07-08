"use client";

import { useEffect, useMemo } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { PpvItem } from "./types";

type Props = {
  /** Ordered list the arrows navigate through (usually the current group's
   *  items or the standalone list). */
  items: PpvItem[];
  /** Index inside `items` currently displayed. */
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
};

/**
 * Full-screen viewer for a PPV. Serves the ORIGINAL via /api/ppv/file
 * (auth-gated, signed URL), with left/right arrows to page through the
 * surrounding list. Video renders in a native player with controls; audio
 * uses the browser audio widget; images fill the viewport preserving
 * aspect ratio. The media name is shown in a bar at the bottom.
 */
export function PpvLightbox({ items, index, onIndexChange, onClose }: Props) {
  const current = items[index];

  // Keyboard navigation: ← / → / Esc. Only bound while the lightbox is open;
  // teardown removes the listener so it doesn't leak into the parent page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && index < items.length - 1) {
        onIndexChange(index + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onIndexChange, onClose]);

  const kind = useMemo(() => {
    if (!current?.media_url) return "unknown" as const;
    if (/\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(current.media_url)) return "video" as const;
    if (/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|$)/i.test(current.media_url)) return "audio" as const;
    return "image" as const;
  }, [current?.media_url]);

  if (!current) return null;

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  // The endpoint gates access and mints a signed URL against the private
  // ppvs bucket — same route the agency lightbox already used for admin
  // moderation, so cache/CDN behaviour is consistent.
  const originalSrc = `/api/ppv/file/${current.id}?kind=original`;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Top bar — close button */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3">
        <div className="text-[12px] text-[#9ca3af] tabular-nums">
          {index + 1} / {items.length}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Media area */}
      <div
        className="flex-1 min-h-0 relative flex items-center justify-center px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={originalSrc}
            alt={current.name}
            className="max-w-full max-h-full object-contain rounded"
          />
        )}
        {kind === "video" && (
          <video
            key={current.id}
            src={originalSrc}
            controls
            autoPlay
            className="max-w-full max-h-full rounded"
          />
        )}
        {kind === "audio" && (
          <audio key={current.id} src={originalSrc} controls autoPlay className="w-[90%] max-w-[600px]" />
        )}

        {/* Prev / next arrows — only rendered when navigable, so the user
            has a clear signal they've reached the edge of the group. */}
        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom bar — media name */}
      <div className="shrink-0 px-4 py-3 text-center">
        <div className="text-[13px] text-white font-medium truncate">{current.name}</div>
        {current.description && (
          <div className="text-[11px] text-[#9ca3af] truncate mt-0.5">{current.description}</div>
        )}
      </div>
    </div>
  );
}
