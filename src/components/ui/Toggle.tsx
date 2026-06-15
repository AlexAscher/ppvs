"use client";

/**
 * Clean iOS-style toggle. Geometry is flexbox-based (no absolute knob)
 * so it can't drift: track 44×24 with 2px padding → 40px inner travel,
 * 20px knob → exactly 20px slide. Vertically centred via items-center.
 *
 * Replaces the hand-rolled switches in Eco Mode / Sales Alerts that used
 * an absolutely-positioned knob and rendered slightly crooked.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  color = "#00AFF0",
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** On-state track color. Eco uses emerald, alerts use indigo. */
  color?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="shrink-0 w-11 h-6 rounded-full p-0.5 flex items-center transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      style={{ backgroundColor: checked ? color : "#374151" }}
    >
      <span
        className="block w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}
