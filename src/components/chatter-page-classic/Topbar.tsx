"use client";

import { Send, Lock, RefreshCw, ArrowLeft } from "lucide-react";

interface TopbarProps {
  displayName: string;
  /** Legacy field — the "All Time Net Sales" plate is gone now (lives in
   *  the Stats tab + Dashboard). Kept on the type so call-sites compile
   *  unchanged. */
  sales?: string;
  onLogout: () => void;
  /** Optional reload — when present, renders a refresh icon button.
   *  Triggered by the chatter page to force-fetch dialogs + messages
   *  outside the polling interval (useful when Eco Mode dilutes it). */
  onReload?: () => void;
  reloading?: boolean;
  /** Optional back button (← to dashboard) shown at the far left. */
  onBack?: () => void;
}

/**
 * Classic Topbar — pixel match of Create_prompt_design/Topbar.tsx with
 * the "All Time Net Sales" plate stripped (lives in the Stats tab now).
 *
 * The reload button is rendered only when `onReload` is wired. The spin
 * animation comes from Tailwind's `animate-spin` on the icon while
 * `reloading` is true.
 */
export function Topbar({ displayName, onLogout, onReload, reloading, onBack }: TopbarProps) {
  return (
    <div className="h-[52px] bg-[#1a1d24] border-b border-[#2a2d35] flex items-center justify-between px-3 md:px-5">
      <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back to dashboard"
            title="Back to dashboard"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1f2937] text-[#9ca3af] hover:text-white transition-colors shrink-0 -ml-1"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="w-7 h-7 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-md flex items-center justify-center relative shadow-sm shrink-0">
          <Send className="w-3.5 h-3.5 text-white" />
          <Lock className="w-2 h-2 text-white absolute bottom-0.5 right-0.5" />
        </div>
        <div className="text-[13px] font-semibold truncate">
          chatter<span className="text-[#6366f1]">.ppvs.io</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {onReload && (
          <button
            onClick={onReload}
            disabled={reloading}
            title="Refresh dialogs & messages"
            aria-label="Reload"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1f2937]/40 border border-[#374151]/50 text-[#9ca3af] hover:text-white hover:bg-[#1f2937] transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} />
          </button>
        )}
        {/* Name plate is the first thing to drop on phones — context (which
            creator) is already shown by the model selector bar below. */}
        <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-[#1f2937]/40 border border-[#374151]/50 rounded-full max-w-[180px]">
          <span className="text-[12px] font-medium text-[#d1d5db] truncate">{displayName}</span>
          <span className="text-[14px]">✍️</span>
        </div>
        <button
          onClick={onLogout}
          className="text-[11px] text-[#6b7280] hover:text-[#9ca3af] transition-colors shrink-0"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
