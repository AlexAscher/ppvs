"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { PpvItem } from "./types";

type Props = {
  /** Ordered list — kept in the API for now in case navigation is added
   *  back later, but only `items[index]` is shown. */
  items: PpvItem[];
  index: number;
  /** No-op today (arrow navigation was removed per user request), retained
   *  so callers don't need to change their state wiring. */
  onIndexChange?: (next: number) => void;
  onClose: () => void;
};

/**
 * Full-screen viewer for a single PPV. Serves the ORIGINAL via /api/ppv/file
 * (auth-gated, signed URL). Video renders in a native player with controls,
 * audio uses the browser widget, images fill the viewport preserving aspect
 * ratio. The media name is shown in a bar at the bottom. No prev/next
 * navigation — close and click another tile to see the next item.
 */
export function PpvLightbox({ items, index, onClose }: Props) {
  const current = items[index];

  // Esc to close. No arrow-key navigation — no arrows to move to.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = useMemo(() => {
    if (!current?.media_url) return "unknown" as const;
    if (/\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(current.media_url)) return "video" as const;
    if (/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|$)/i.test(current.media_url)) return "audio" as const;
    return "image" as const;
  }, [current?.media_url]);

  if (!current) return null;

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
      <div className="shrink-0 flex items-center justify-end px-4 py-3">
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
