"use client";

import { useState, useRef, useEffect } from "react";
import { TAG_EMOJIS } from "./types";

type Props = {
  value: string | null;
  onChange: (emoji: string | null) => void;
};

export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function openNow() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  }

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  }

  return (
    <div ref={ref} className="relative inline-block" onMouseEnter={openNow} onMouseLeave={scheduleClose}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-lg bg-[#1f2937] border border-[#374151] hover:border-[#6366f1] transition-colors flex items-center justify-center text-[20px]"
      >
        {value ?? <span className="text-[#6b7280] text-[14px]">+</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-20 bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl p-2 grid grid-cols-5 gap-1 w-[220px]">
          {value && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="col-span-5 mb-1 py-1 text-[11px] text-[#9ca3af] hover:text-white transition-colors"
            >
              Clear emoji
            </button>
          )}
          {TAG_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onChange(e); setOpen(false); }}
              className={`w-9 h-9 rounded-md flex items-center justify-center text-[20px] transition-all ${
                value === e ? "bg-[#6366f1]/20 ring-1 ring-[#6366f1]" : "hover:bg-[#2a2d35]"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
