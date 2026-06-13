"use client";

import { Send, Lock, RefreshCw, ArrowLeft } from "lucide-react";

interface ModelChip {
  id: string;
  name: string;
  unread: number;
}

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
  /** Inline model picker — replaces the separate ModelSelectorBar strip
   *  underneath. Each model becomes a chip immediately after the logo,
   *  with a red unread dot if applicable. Wraps onto a second row when
   *  there are too many to fit on one line. */
  models?: ModelChip[];
  selectedModelId?: string;
  onSelectModel?: (id: string) => void;
}

/**
 * Topbar with inline model chips — the old separate ModelSelectorBar
 * (a full 42px row under the topbar) has been folded into here per the
 * user's "models right of the logo, no scroll" spec.
 *
 * Layout (left-to-right):
 *   [back] [logo] [chatter.ppvs.io] [Model A] [Model B] …  [reload] [name] [Logout]
 *
 * Chips wrap onto a second row if there isn't enough horizontal space —
 * the bar grows vertically rather than overflowing or scrolling.
 */
export function Topbar({
  displayName,
  onLogout,
  onReload,
  reloading,
  onBack,
  models,
  selectedModelId,
  onSelectModel,
}: TopbarProps) {
  const hasModels = !!models && models.length > 0;
  return (
    <div className="min-h-[52px] bg-[#1a1d24] border-b border-[#2a2d35] flex items-center justify-between gap-3 px-3 md:px-5 py-1.5">
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 flex-wrap">
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
        <div className="text-[13px] font-semibold truncate shrink-0">
          chatter<span className="text-[#6366f1]">.ppvs.io</span>
        </div>
        {hasModels && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {models!.map((m) => {
              const active = selectedModelId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectModel?.(m.id)}
                  className={`relative px-3 py-1 rounded-lg text-[11px] font-medium border whitespace-nowrap transition-all ${
                    active
                      ? "bg-[#6366f1] border-[#6366f1] text-white shadow-sm"
                      : "bg-transparent border-[#374151] text-[#9ca3af] hover:border-[#4b5563] hover:text-[#d1d5db]"
                  }`}
                >
                  {m.name}
                  {m.unread > 0 && (
                    <span className="absolute -top-1 -right-1">
                      {m.unread === 1 ? (
                        <span className="block w-[7px] h-[7px] bg-[#ef4444] rounded-full animate-pulse shadow-sm" />
                      ) : (
                        <span className="block px-1.5 py-0.5 bg-[#ef4444] text-white text-[9px] font-bold rounded-full shadow-sm">
                          {m.unread}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
