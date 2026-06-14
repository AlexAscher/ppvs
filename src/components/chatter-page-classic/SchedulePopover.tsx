"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Schedule popover — preset timers + a custom datetime-local field.
 * Shared by the message composer (TelegramChat) and the PPV/Tip send
 * actions (ActionPanel). `onPick(ts)` returns a UNIX-seconds timestamp,
 * or null to clear a previously-set schedule.
 *
 * `align` flips the horizontal anchor: the composer opens it from a
 * bottom-right Clock button ("right"), while the ActionPanel send buttons
 * sit in a narrow column where a left anchor reads better.
 */
export function SchedulePopover({
  current,
  onPick,
  onClose,
  align = "right",
}: {
  current: number | null;
  onPick: (ts: number | null) => void;
  onClose: () => void;
  align?: "right" | "left";
}) {
  // Datetime-local needs YYYY-MM-DDTHH:mm in LOCAL time. Build from `current`
  // (if any) or from "now + 1h" so the field starts at a useful default.
  const initial = useMemo(() => {
    const d = current ? new Date(current * 1000) : new Date(Date.now() + 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [current]);
  const [custom, setCustom] = useState(initial);

  // Close when the user clicks anywhere outside.
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const presets: { label: string; sec: number }[] = [
    { label: "15 min", sec: 15 * 60 },
    { label: "1 hour", sec: 60 * 60 },
    { label: "4 hours", sec: 4 * 60 * 60 },
    { label: "24 hours", sec: 24 * 60 * 60 },
  ];

  return (
    <div
      ref={ref}
      className={`absolute bottom-full mb-2 bg-[#1f2937] border border-[#374151] rounded-xl shadow-2xl p-3 z-50 w-[260px] space-y-2 ${
        align === "left" ? "left-0" : "right-0"
      }`}
    >
      <div className="text-[11px] text-[#9ca3af] uppercase tracking-wider px-1">Schedule send</div>
      <div className="grid grid-cols-2 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(Math.floor(Date.now() / 1000) + p.sec)}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-[#0d1117] border border-[#374151] text-white hover:bg-[#374151] transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="border-t border-[#374151] pt-2">
        <label className="block text-[10px] text-[#9ca3af] uppercase tracking-wider mb-1">Custom</label>
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          min={(() => {
            const pad = (n: number) => String(n).padStart(2, "0");
            const d = new Date(Date.now() + 60_000); // at least 1 min from now
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          })()}
          className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#374151] rounded-md text-[12px] text-white"
        />
        <div className="flex gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => {
              const t = new Date(custom);
              if (Number.isNaN(t.getTime())) return;
              onPick(Math.floor(t.getTime() / 1000));
            }}
            className="flex-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#6366f1] text-white hover:bg-[#5558e3]"
          >
            Schedule
          </button>
          {current != null && (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-[#0d1117] border border-[#374151] text-white hover:bg-[#374151]"
            >
              Cancel schedule
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact "14:30" / "Jun 17 14:30" formatter for the schedule chip. */
export function formatScheduleShort(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return time;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${date} ${time}`;
}
