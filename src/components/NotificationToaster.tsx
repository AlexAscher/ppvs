"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";

/**
 * Top-right payment toaster. Polls /api/notifications/pulse and pops a
 * 5-second toast whenever a tip or PPV the CURRENT user generated gets
 * paid. Each toast auto-dismisses after 5s; a × button dismisses early.
 *
 * Scoping: the API already filters to the logged-in user (chatter who
 * created the link, or the agency owner on legacy links), so the toast
 * only appears for the person who actually sent that pay link.
 *
 * Self-contained — drop it once near the chatter app shell. We seed the
 * `since` cursor to mount time so historical payments don't all fire on
 * first load.
 */

type PulseEvent = {
  id: string;
  kind: "tip_paid" | "ppv_paid";
  amount: number;
  peerUsername: string | null;
  modelName: string | null;
  paidAt: string;
};

const POLL_MS = 8_000;
const TOAST_TTL_MS = 5_000;

export function NotificationToaster() {
  const [toasts, setToasts] = useState<PulseEvent[]>([]);
  // Cursor: only events strictly after this instant become toasts. Seeded
  // to mount so we never replay history on load.
  const sinceRef = useRef<string>(new Date().toISOString());
  // Ids we've already shown — guards against the same row toasting twice
  // across overlapping polls before the cursor advances.
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timersRef.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const url = new URL("/api/notifications/pulse", window.location.origin);
        url.searchParams.set("since", sinceRef.current);
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = (await res.json()) as { events?: PulseEvent[]; now?: string };
        if (cancelled) return;
        const fresh = (data.events ?? []).filter((e) => !seenRef.current.has(e.id));
        if (fresh.length > 0) {
          for (const e of fresh) seenRef.current.add(e.id);
          // Advance cursor to the newest paidAt we saw so the next poll
          // doesn't re-fetch them.
          const newest = fresh.reduce(
            (acc, e) => (e.paidAt > acc ? e.paidAt : acc),
            sinceRef.current,
          );
          sinceRef.current = newest;
          // Show newest first, cap the stack at 4 visible.
          setToasts((prev) => [...fresh.reverse(), ...prev].slice(0, 4));
          for (const e of fresh) {
            const tm = setTimeout(() => dismiss(e.id), TOAST_TTL_MS);
            timersRef.current.set(e.id, tm);
          }
        } else if (data.now) {
          // Keep the cursor moving forward even on quiet polls so the
          // window doesn't grow unbounded.
          sinceRef.current = data.now;
        }
      } catch {
        /* network blip — try again next tick */
      }
    }

    // Small initial delay so we don't race the page's own auth bootstrap.
    const startTid = setTimeout(() => {
      void poll();
      iv = setInterval(() => void poll(), POLL_MS);
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(startTid);
      if (iv) clearInterval(iv);
      for (const tm of timersRef.current.values()) clearTimeout(tm);
      timersRef.current.clear();
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[92vw] w-[340px] pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} event={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ event, onClose }: { event: PulseEvent; onClose: () => void }) {
  const isTip = event.kind === "tip_paid";
  const who = event.peerUsername ? `@${event.peerUsername}` : "A customer";
  const amount = `$${event.amount.toFixed(2)}`;
  const title = isTip ? "💸 Tip received!" : "🔓 PPV unlocked!";
  const line = isTip
    ? `${who} sent a tip of ${amount}`
    : `${who} paid ${amount}`;

  return (
    <div className="pointer-events-auto animate-[toastIn_0.25s_ease-out] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden">
      <style>{`
        @keyframes toastIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
      <div className="flex items-start gap-3 p-3.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[18px] shrink-0"
          style={{
            background: isTip
              ? "linear-gradient(135deg,#10b981,#059669)"
              : "linear-gradient(135deg,#6366f1,#4f46e5)",
          }}
        >
          {isTip ? "💸" : "🔓"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white">{title}</div>
          <div className="text-[12px] text-[#9ca3af] truncate">{line}</div>
          {event.modelName && (
            <div className="text-[10px] text-[#6b7280] mt-0.5 truncate">
              {event.modelName}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="text-[#6b7280] hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        className="h-0.5"
        style={{
          background: isTip ? "#10b981" : "#6366f1",
          animation: `shrink ${TOAST_TTL_MS}ms linear forwards`,
        }}
      />
      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
}
