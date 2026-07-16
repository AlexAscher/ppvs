"use client";

import { useState } from "react";

/**
 * Fan avatar with graceful fallback. Tries the cached Telegram photo
 * (served via /api/telegram/fan-avatar, which caches to Storage); on any
 * error, when no model is known, or for group/channel peers (id starts with
 * "-"), falls back to a coloured initials chip. `loading="lazy"` so
 * off-screen dialogs don't all fetch at once.
 *
 * Extracted so the chat list, chat-header, and fan-profile drawer all render
 * the exact same avatar behaviour — previously the drawer used a static
 * initials-only chip and never showed the real photo.
 */
export function FanAvatar({
  modelId,
  peerId,
  initials,
  size = 44,
}: {
  modelId?: string | null;
  peerId: string;
  initials: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  const isGroup = peerId.startsWith("-");
  if (!modelId || failed || isGroup) {
    return (
      <div
        className="bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
        style={{ width: px, height: px, fontSize: size * 0.3 }}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/telegram/fan-avatar/${modelId}?peerId=${encodeURIComponent(peerId)}`}
      alt={initials}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="rounded-full object-cover flex-shrink-0 bg-[#1f2937]"
      style={{ width: px, height: px }}
    />
  );
}
