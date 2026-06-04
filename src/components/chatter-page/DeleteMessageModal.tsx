"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";

/**
 * Confirmation modal for message deletion. Two radio options:
 *
 *   ( ) Delete for me only — revoke=false in gramJS
 *   ( ) Delete for everyone — revoke=true (only available on
 *                              outgoing messages where Telegram permits)
 *
 * When `canRevoke=false` (incoming message we can't unsend for the fan)
 * the second option is hidden and the first is auto-selected.
 *
 * The actual API call happens in the parent's `onConfirm(revoke)`. We
 * just collect the choice and close.
 */

interface Props {
  open: boolean;
  canRevoke: boolean;
  preview: string;
  onConfirm: (revoke: boolean) => void;
  onClose: () => void;
}

export function DeleteMessageModal({
  open,
  canRevoke,
  preview,
  onConfirm,
  onClose,
}: Props) {
  // Default: "for everyone" when available (it's what the chatter
  // almost always wants — incoming/outgoing both treat their own
  // outgoing as throwaway). When not available, force "for me".
  const [revoke, setRevoke] = useState<boolean>(canRevoke);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // React 19 strict effects ban synchronous setState; defer to next tick.
    if (!open) return;
    const tid = setTimeout(() => {
      setRevoke(canRevoke);
      setSubmitting(false);
    }, 0);
    return () => clearTimeout(tid);
  }, [open, canRevoke]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, revoke, canRevoke]);

  if (!open) return null;

  function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    onConfirm(canRevoke ? revoke : false);
  }

  const truncated =
    preview.length > 160 ? `${preview.slice(0, 160).trim()}…` : preview;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[380px] bg-[#161a22] border border-[#2a2d35] rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2d35] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-red-500/15 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-[13px] font-semibold text-white">
              Delete message?
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#1f2937] text-[#9ca3af] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {truncated && (
            <div className="px-3 py-2 bg-[#1f2937]/60 border border-[#2a2d35] rounded-md text-[11px] text-[#9ca3af] line-clamp-3 whitespace-pre-wrap break-words">
              {truncated}
            </div>
          )}

          <div className="space-y-1.5">
            <RadioRow
              checked={!revoke}
              onChange={() => setRevoke(false)}
              label="Delete for me only"
              hint="Removes from your account. The fan keeps their copy."
            />
            {canRevoke && (
              <RadioRow
                checked={revoke}
                onChange={() => setRevoke(true)}
                label="Delete for everyone"
                hint="Removes for you and the fan."
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2a2d35] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-1.5 text-[12px] text-[#9ca3af] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md text-[12px] font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${
        checked
          ? "bg-[#6366f1]/15 ring-1 ring-[#6366f1]"
          : "bg-[#1f2937]/40 hover:bg-[#1f2937] ring-1 ring-[#2a2d35]"
      }`}
    >
      <div
        className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
          checked ? "border-[2px] border-[#6366f1]" : "border-[2px] border-[#4b5563]"
        }`}
      >
        {checked && <div className="w-2 h-2 rounded-full bg-[#6366f1]" />}
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-white">{label}</div>
        <div className="text-[10px] text-[#9ca3af] mt-0.5">{hint}</div>
      </div>
    </button>
  );
}
