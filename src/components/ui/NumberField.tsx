"use client";

import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Numeric input that behaves the way users expect:
 *   - You can backspace the field fully empty (no forced "0" that snaps
 *     back). Empty → onChange(undefined).
 *   - No ugly native browser spinners. We use type="text" +
 *     inputMode="numeric" and render our own site-styled chevrons.
 *
 * `value` is number | undefined. The component keeps a string mirror so
 * partial input ("", "-", "1.") is allowed while typing, committing a
 * parsed number (or undefined) to the parent.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  disabled = false,
  className = "",
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value === undefined || value === null ? "" : String(value));

  // Keep the string mirror in sync when the parent value changes
  // externally (e.g. a preset bumps the throttle).
  useEffect(() => {
    setText(value === undefined || value === null ? "" : String(value));
  }, [value]);

  function commit(str: string) {
    setText(str);
    if (str === "" || str === "-" || str === ".") {
      onChange(undefined);
      return;
    }
    const n = Number(str);
    if (Number.isNaN(n)) return;
    onChange(n);
  }

  function clamp(n: number): number {
    let r = n;
    if (min !== undefined) r = Math.max(min, r);
    if (max !== undefined) r = Math.min(max, r);
    return r;
  }

  function bump(delta: number) {
    const cur = text === "" ? 0 : Number(text);
    const base = Number.isNaN(cur) ? 0 : cur;
    commit(String(clamp(base + delta)));
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          // Allow empty, optional leading minus, digits, single dot.
          if (v === "" || /^-?\d*\.?\d*$/.test(v)) commit(v);
        }}
        className="w-full pl-3 pr-7 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0] disabled:opacity-50"
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => bump(step)}
          className="h-3.5 w-5 flex items-center justify-center text-[#9ca3af] hover:text-white rounded-t-sm hover:bg-[#374151] transition-colors disabled:opacity-50"
          aria-label="Increment"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => bump(-step)}
          className="h-3.5 w-5 flex items-center justify-center text-[#9ca3af] hover:text-white rounded-b-sm hover:bg-[#374151] transition-colors disabled:opacity-50"
          aria-label="Decrement"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
