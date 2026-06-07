"use client";

import { useState } from "react";
import { useEcoMode, setEcoMode, ECO_INTERVAL_MULTIPLIER } from "@/lib/use-eco";

/**
 * Eco Mode — agency Settings section.
 *
 * Single toggle. When ON: chatter UI bumps polling intervals by 4×
 * (less load on the VPS and the Telegram MTProto link) at the cost of
 * a slower live-feel. Server-side event subscriptions are unaffected.
 */
export function EcoModeSection() {
  const enabled = useEcoMode();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await setEcoMode(!enabled);
    } finally {
      setSaving(false);
    }
  }

  const card = "bg-[#161a22] border border-[#2a2d35] rounded-xl p-5 md:p-6";
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-white">Eco Mode 🌱</h2>
          <p className="text-[12px] text-[#9ca3af] mt-0.5">
            Slows polling by {ECO_INTERVAL_MULTIPLIER}× to reduce VPS and Telegram
            link load. Use it during off-hours or for big agencies running many
            sessions.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={toggle}
          className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-[#10b981]" : "bg-[#374151]"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="bg-[#0f1f17] border border-[#1f3a2a] rounded-lg p-3 text-[12px] text-[#a7f3d0]">
          Eco Mode is ON. Dialogs refresh every {10 * ECO_INTERVAL_MULTIPLIER}s,
          messages every {5 * ECO_INTERVAL_MULTIPLIER}s, presence every{" "}
          {3 * ECO_INTERVAL_MULTIPLIER}s.
        </div>
      )}
    </div>
  );
}
