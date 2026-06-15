"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { ChatterModel } from "./types";

/**
 * Multi-model assignment control for a single chatter.
 *
 * Shows the assigned creators as avatar chips; the trigger opens a checklist
 * of every agency model where each can be toggled on/off. Each toggle is an
 * immediate add/remove (no Save button) wired through `onToggle`.
 *
 * The dropdown is rendered with `position: fixed`, anchored to the trigger's
 * bounding rect, so it escapes the `overflow-x-auto` clipping of the table
 * wrapper (the old absolute dropdown disappeared "behind the textures").
 */
export function ChatterModelMultiSelect({
  models,
  assignedIds,
  onToggle,
  busy = false,
}: {
  models: ChatterModel[];
  assignedIds: string[];
  /** Called with (modelId, nextAssigned). Should persist + update state. */
  onToggle: (modelId: string, assign: boolean) => void | Promise<void>;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const assigned = new Set(assignedIds);
  const assignedModels = models.filter((m) => assigned.has(m.id));

  // Position the fixed panel right under the trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open]);

  // Close on outside-click, scroll, resize, Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    assignedModels.length === 0
      ? "No creator"
      : assignedModels.length === 1
        ? assignedModels[0].name
        : `${assignedModels.length} creators`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white hover:border-[#4b5563] transition-colors flex items-center justify-between gap-2 disabled:opacity-60"
      >
        <div className="flex items-center gap-2 min-w-0">
          {assignedModels.length > 0 ? (
            <div className="flex -space-x-1.5 shrink-0">
              {assignedModels.slice(0, 3).map((m) =>
                m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.id}
                    src={m.avatar_url}
                    alt={m.name}
                    className="w-5 h-5 rounded-full object-cover ring-2 ring-[#1f2937]"
                  />
                ) : (
                  <div
                    key={m.id}
                    className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] ring-2 ring-[#1f2937]"
                  />
                ),
              )}
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-[#374151] shrink-0" />
          )}
          <span className="truncate">{label}</span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: Math.max(pos.width, 200) }}
          className="bg-[#1f2937] border border-[#374151] rounded-lg shadow-2xl overflow-hidden z-[200] max-h-[260px] overflow-y-auto"
        >
          <div className="px-3 py-2 text-[10px] text-[#6b7280] uppercase tracking-wider border-b border-[#374151]">
            Assign creators
          </div>
          {models.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-[#6b7280]">No creators yet.</div>
          ) : (
            models.map((m) => {
              const on = assigned.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggle(m.id, !on)}
                  className={`w-full px-3 py-2 text-left text-[12px] hover:bg-[#374151] transition-colors flex items-center gap-2 ${
                    on ? "text-white" : "text-[#9ca3af]"
                  }`}
                >
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatar_url} alt={m.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] shrink-0" />
                  )}
                  <span className="truncate flex-1">{m.name}</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                      on ? "bg-[#00AFF0]" : "border border-[#4b5563]"
                    }`}
                  >
                    {on && <Check className="w-3 h-3 text-white" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </>
  );
}
