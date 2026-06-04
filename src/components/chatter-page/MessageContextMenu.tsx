"use client";

import { useEffect, useRef } from "react";
import { Reply, Pencil, Trash2, Quote } from "lucide-react";

/**
 * Right-click context menu over a chat bubble.
 *
 *   - Reply           : always
 *   - Reply with quote: only if `selection` is non-empty (the user
 *                       highlighted a snippet inside the bubble before
 *                       right-clicking — passed in by the parent)
 *   - Edit            : outgoing messages only
 *   - Delete          : outgoing messages only (deleteMessages with revoke)
 *
 * Positioning: parent passes the raw `clientX/clientY` from the
 * contextmenu event. We clamp to viewport so the menu never spills off
 * the edge.
 *
 * Closes on outside click, Escape, or scroll.
 */

interface Props {
  open: boolean;
  x: number;
  y: number;
  canEdit: boolean;
  canDelete: boolean;
  selection: string;
  onReply: () => void;
  onReplyWithQuote: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const MENU_W = 200;
const MENU_H_EST = 200;

export function MessageContextMenu({
  open,
  x,
  y,
  canEdit,
  canDelete,
  selection,
  onReply,
  onReplyWithQuote,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Clamp to viewport — keep at least 8px margin on each side.
  const winW = typeof window !== "undefined" ? window.innerWidth : 1024;
  const winH = typeof window !== "undefined" ? window.innerHeight : 768;
  const left = Math.max(8, Math.min(x, winW - MENU_W - 8));
  const top = Math.max(8, Math.min(y, winH - MENU_H_EST - 8));

  const hasSelection = selection.trim().length > 0;

  return (
    <div
      ref={ref}
      className="fixed z-[110] bg-[#161a22] border border-[#374151] rounded-lg shadow-2xl py-1.5 text-[12px]"
      style={{ left, top, width: MENU_W }}
    >
      <MenuItem icon={<Reply className="w-3.5 h-3.5" />} onClick={onReply}>
        Reply
      </MenuItem>
      {hasSelection && (
        <MenuItem icon={<Quote className="w-3.5 h-3.5" />} onClick={onReplyWithQuote}>
          Reply with Quote
        </MenuItem>
      )}
      {canEdit && (
        <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} onClick={onEdit}>
          Edit
        </MenuItem>
      )}
      {canDelete && (
        <>
          <div className="h-px bg-[#2a2d35] my-1" />
          <MenuItem
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={onDelete}
            danger
          >
            Delete
          </MenuItem>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
  danger,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#1f2937] transition-colors text-left ${
        danger ? "text-red-400 hover:text-red-300" : "text-[#e5e7eb]"
      }`}
    >
      <span className={danger ? "text-red-400" : "text-[#9ca3af]"}>{icon}</span>
      <span>{children}</span>
    </button>
  );
}
