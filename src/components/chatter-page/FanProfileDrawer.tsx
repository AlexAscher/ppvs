"use client";

import { useEffect, useRef, useState } from "react";
import { X, Calendar, User as UserIcon, Tag as TagIcon } from "lucide-react";
import type { FanRow } from "@/lib/fan-types";
import { FanGroupsSection } from "./FanGroupsSection";

/**
 * FanProfileDrawer — right-side slide-out panel summarising one fan.
 *
 * Inputs (everything the chatter UI already has in memory):
 *   - fan: snapshot from /api/fans (notes, tags, total_spent, last_seen_at)
 *   - displayName, username: from the open Dialog
 *
 * Fetches lazily on open:
 *   - GET /api/fans/[modelId]/history?peerId=…  → past sends
 *
 * Read-only — editing notes/tags happens via the right-side ActionPanel
 * and chat-header tag row. The drawer is the "at-a-glance" view.
 */

const FAN_TAGS = ["🔴", "💵", "💰", "⭐", "👑"] as const;

type HistoryRow = {
  id: string;
  code: string;
  totalPrice: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  itemNames: string[];
};

type FanNoteRow = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  modelId: string | null;
  peerId: string | null;
  fan: FanRow | null;
  displayName: string;
  username: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "delivered":
      return { label: "Delivered", cls: "bg-emerald-500/15 text-emerald-400" };
    case "paid":
      return { label: "Paid", cls: "bg-blue-500/15 text-blue-400" };
    case "sent":
      return { label: "Sent", cls: "bg-[#00AFF0]/15 text-[#5BC8F5]" };
    case "failed":
      return { label: "Failed", cls: "bg-red-500/15 text-red-400" };
    default:
      return { label: status, cls: "bg-[#374151] text-[#9ca3af]" };
  }
}

export function FanProfileDrawer({
  open,
  onClose,
  modelId,
  peerId,
  fan,
  displayName,
  username,
}: Props) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [notes, setNotes] = useState<FanNoteRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeWindow, setActiveWindow] = useState<string | null>(null);
  // Aggregated sale stats from /api/fans/[modelId]/stats — populated lazily
  // when the drawer opens, alongside history.
  const [salesStats, setSalesStats] = useState<{
    ppvCount: number;
    tipCount: number;
    purchased: number;
    avgPpv: number;
    avgTip: number;
    rawSpent: number;
  } | null>(null);
  // Editable basics — start blank, hydrate when fan prop arrives. Debounced
  // save fires 500ms after the last edit so the chatter can type freely.
  const [bio, setBio] = useState(fan?.bio ?? "");
  const [birthdate, setBirthdate] = useState(fan?.birthdate ?? "");
  const [location, setLocation] = useState(fan?.location ?? "");
  const [basicsMsg, setBasicsMsg] = useState("");
  // Track which fan's basics we currently hold so a switch repopulates
  // the inputs from the new fan row instead of leaking previous values.
  const lastFanRef = useRef<string | null>(null);

  useEffect(() => {
    // React 19 strict effects: defer initial state resets to next tick so
    // we don't synchronously set state in the effect body.
    const resetTid = setTimeout(() => {
      if (!open || !modelId || !peerId) {
        setHistory(null);
        setNotes(null);
      }
    }, 0);
    if (!open || !modelId || !peerId) {
      return () => clearTimeout(resetTid);
    }
    let cancelled = false;
    const loadingTid = setTimeout(() => {
      setLoading(true);
      setError("");
    }, 0);
    (async () => {
      try {
        const histUrl = new URL(`/api/fans/${modelId}/history`, window.location.origin);
        histUrl.searchParams.set("peerId", peerId);
        const notesUrl = new URL(`/api/fans/${modelId}/notes`, window.location.origin);
        notesUrl.searchParams.set("peerId", peerId);
        const tzUrl = new URL(`/api/fans/${modelId}/timezone`, window.location.origin);
        tzUrl.searchParams.set("peerId", peerId);
        const statsUrl = new URL(`/api/fans/${modelId}/stats`, window.location.origin);
        statsUrl.searchParams.set("peerId", peerId);
        const [histRes, notesRes, tzRes, statsRes] = await Promise.all([
          fetch(histUrl.toString()),
          fetch(notesUrl.toString()),
          fetch(tzUrl.toString()),
          fetch(statsUrl.toString()),
        ]);
        if (statsRes.ok) {
          const sj = await statsRes.json();
          if (!cancelled) setSalesStats(sj);
        }
        if (tzRes.ok) {
          const tz = (await tzRes.json()) as { label?: string | null };
          if (!cancelled) setActiveWindow(tz.label ?? null);
        }
        if (cancelled) return;
        if (histRes.ok) {
          const data = await histRes.json();
          setHistory((data.history ?? []) as HistoryRow[]);
        } else {
          const data = await histRes.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${histRes.status}`);
        }
        if (notesRes.ok) {
          const nd = await notesRes.json();
          if (!cancelled) setNotes((nd.notes ?? []) as FanNoteRow[]);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(resetTid);
      clearTimeout(loadingTid);
    };
  }, [open, modelId, peerId]);

  // Hydrate basics when the fan row (or which fan we're viewing) changes.
  // We track by fan id so a re-fetch of the same fan doesn't stomp the
  // chatter's in-progress edits.
  useEffect(() => {
    const id = fan?.id ?? null;
    if (id !== lastFanRef.current) {
      lastFanRef.current = id;
      setBio(fan?.bio ?? "");
      setBirthdate(fan?.birthdate ?? "");
      setLocation(fan?.location ?? "");
      setBasicsMsg("");
    }
  }, [fan]);

  // Debounced auto-save for basics. Fires 500ms after the last edit and
  // only when the drawer + fan are present. Best-effort — UI never blocks
  // on the network.
  useEffect(() => {
    if (!open || !modelId || !peerId || !fan) return;
    // Don't fire on the initial hydration pass.
    if (
      bio === (fan.bio ?? "") &&
      birthdate === (fan.birthdate ?? "") &&
      location === (fan.location ?? "")
    ) {
      return;
    }
    const tid = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/fans/${modelId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              peerId,
              bio: bio.trim() || null,
              birthdate: birthdate || null,
              location: location.trim() || null,
            }),
          });
          if (res.ok) {
            setBasicsMsg("Saved ✓");
            setTimeout(() => setBasicsMsg(""), 1500);
          } else {
            const d = await res.json().catch(() => ({}));
            setBasicsMsg(`Error: ${d.error ?? `HTTP ${res.status}`}`);
          }
        } catch (e) {
          setBasicsMsg(e instanceof Error ? `Error: ${e.message}` : "Error");
        }
      })();
    }, 500);
    return () => clearTimeout(tid);
  }, [bio, birthdate, location, fan, modelId, peerId, open]);

  if (!open) return null;

  const totalSpent = Number(fan?.total_spent ?? 0);
  const tags = fan?.tags ?? [];
  // Buying-power dots — five buckets keyed off lifetime spend so the chatter
  // can eyeball the fan tier without doing math. Tweak the thresholds with
  // taste; everything past $500 fills all five.
  const buyingPowerDots = (() => {
    if (totalSpent >= 500) return 5;
    if (totalSpent >= 200) return 4;
    if (totalSpent >= 75) return 3;
    if (totalSpent >= 20) return 2;
    if (totalSpent > 0) return 1;
    return 0;
  })();

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="absolute top-0 right-0 h-full w-[380px] max-w-[90vw] bg-[#161a22] border-l border-[#2a2d35] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2d35] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-white">Fan profile</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#1f2937] text-[#9ca3af] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Identity block */}
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00AFF0] to-[#00AFF0] flex items-center justify-center text-white text-[18px] font-semibold flex-shrink-0">
              {displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-white truncate">
                {displayName || "User"}
              </div>
              {username && (
                <div className="text-[12px] text-[#9ca3af] truncate">@{username}</div>
              )}
              <div className="text-[10px] text-[#6b7280] mt-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Last seen {formatDate(fan?.last_seen_at ?? null)}
              </div>
              {activeWindow && (
                <div className="text-[10px] text-[#6b7280] mt-0.5 flex items-center gap-1">
                  🕒 Most active {activeWindow}
                </div>
              )}
            </div>
          </div>

          {/* Editable basics — bio, birthdate, location. Auto-save 500ms
              after the last edit. The "Saved ✓" / "Error" hint slides in
              briefly below the inputs. */}
          <div className="space-y-2">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-wide flex items-center justify-between">
              <span>Profile</span>
              {basicsMsg && (
                <span
                  className={`normal-case text-[10px] ${
                    basicsMsg.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {basicsMsg}
                </span>
              )}
            </div>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Bio / personality notes…"
              className="w-full px-3 py-2 bg-[#1f2937]/60 border border-[#374151] rounded-md text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
            />
            <div className="grid grid-cols-2 gap-2">
              {/* Birthdate: plain text input so the placeholder isn't
                  swapped to the OS locale's date format (e.g. "дд.мм.гггг"
                  on a Russian system). Auto-inserts hyphens as the chatter
                  types digits and clamps to YYYY-MM-DD. */}
              <input
                type="text"
                value={birthdate ?? ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                  let masked = digits;
                  if (digits.length > 4) masked = `${digits.slice(0, 4)}-${digits.slice(4)}`;
                  if (digits.length > 6)
                    masked = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
                  setBirthdate(masked);
                }}
                placeholder="YYYY-MM-DD"
                title="Birthdate (YYYY-MM-DD)"
                inputMode="numeric"
                maxLength={10}
                className="px-3 py-2 bg-[#1f2937]/60 border border-[#374151] rounded-md text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location"
                className="px-3 py-2 bg-[#1f2937]/60 border border-[#374151] rounded-md text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
              />
            </div>
          </div>

          {/* Timeline (Fan since / Last online / Last response / Last read) */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Fan since", iso: fan?.created_at ?? null },
              { label: "Last online", iso: fan?.last_seen_at ?? null },
              { label: "Last response", iso: fan?.last_response_at ?? null },
              { label: "Last read", iso: fan?.last_read_at ?? null },
            ].map((row) => (
              <div
                key={row.label}
                className="px-3 py-2 rounded-md bg-[#1f2937]/40 border border-[#2a2d35]"
              >
                <div className="text-[10px] text-[#6b7280] uppercase tracking-wide">
                  {row.label}
                </div>
                <div className="text-[12px] text-white truncate">
                  {row.iso ? new Date(row.iso).toLocaleDateString("en-US") : "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Sales stats grid — Spent / avg PPV / avg Tip / Purchased.
              Numbers come from /api/fans/[modelId]/stats (live, not cached
              on the fan row). */}
          <div>
            <div className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-2">
              Stats
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Spent", value: `$${totalSpent.toFixed(totalSpent < 100 ? 2 : 0)}`, accent: true },
                { label: "Purchased", value: String(salesStats?.purchased ?? 0) },
                { label: "Avg PPV", value: salesStats ? `$${salesStats.avgPpv.toFixed(2)}` : "—" },
                { label: "Avg Tip", value: salesStats ? `$${salesStats.avgTip.toFixed(2)}` : "—" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="px-3 py-2 rounded-md bg-[#1f2937]/40 border border-[#2a2d35]"
                >
                  <div className="text-[10px] text-[#6b7280] uppercase tracking-wide">
                    {c.label}
                  </div>
                  <div
                    className={`text-[15px] font-bold leading-tight ${
                      c.accent ? "text-[#00AFF0]" : "text-white"
                    }`}
                  >
                    {c.value}
                  </div>
                </div>
              ))}
            </div>
            {/* Buying-power indicator — five dots filled according to spend. */}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-[#6b7280]">
              <span className="uppercase tracking-wide">Buying power</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={`block w-2 h-2 rounded-full ${
                      i <= buyingPowerDots ? "bg-[#00AFF0]" : "bg-[#2a2d35]"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-2 flex items-center gap-1">
              <TagIcon className="w-3 h-3" /> Tags
            </div>
            {tags.length === 0 ? (
              <div className="text-[12px] text-[#6b7280]">No tags yet.</div>
            ) : (
              <div className="flex items-center gap-1.5">
                {FAN_TAGS.filter((t) => tags.includes(t)).map((t) => (
                  <span
                    key={t}
                    className="w-8 h-8 flex items-center justify-center rounded-md bg-[#00AFF0]/20 ring-1 ring-[#00AFF0] text-[16px] leading-none"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Groups */}
          {modelId && peerId && (
            <FanGroupsSection modelId={modelId} peerId={peerId} />
          )}

          {/* Notes log */}
          <div>
            <div className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-2 flex items-center gap-1">
              <UserIcon className="w-3 h-3" /> Notes{" "}
              {notes && notes.length > 0 ? `(${notes.length})` : ""}
            </div>
            {notes && notes.length > 0 ? (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="px-3 py-2 rounded-md bg-[#1f2937]/40 border border-[#2a2d35]"
                  >
                    <div className="text-[12px] text-[#e5e7eb] whitespace-pre-wrap break-words">
                      {n.body}
                    </div>
                    <div className="text-[9px] text-[#6b7280] mt-1">
                      {n.author_name ? `${n.author_name} · ` : ""}
                      {formatDate(n.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-[#6b7280]">
                No notes yet — add them from the Notes tab.
              </div>
            )}
          </div>

          {/* History */}
          <div>
            <div className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-2">
              Purchase history
            </div>
            {error && (
              <div className="px-3 py-2 mb-2 bg-red-500/10 border border-red-500/30 rounded-md text-[11px] text-red-400">
                {error}
              </div>
            )}
            {loading && (
              <div className="text-[12px] text-[#6b7280] py-2">Loading…</div>
            )}
            {!loading && history && history.length === 0 && (
              <div className="text-[12px] text-[#6b7280]">No PPVs sent yet.</div>
            )}
            <div className="space-y-2">
              {history?.map((h) => {
                const badge = statusBadge(h.status);
                return (
                  <div
                    key={h.id}
                    className="p-3 rounded-lg bg-[#1f2937]/40 border border-[#2a2d35]"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[12px] font-semibold text-white">
                        ${h.totalPrice.toFixed(h.totalPrice < 100 ? 2 : 0)}
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#6b7280] mb-1.5">
                      {formatDate(h.createdAt)}
                    </div>
                    {h.itemNames.length > 0 && (
                      <div className="text-[11px] text-[#9ca3af] truncate">
                        {h.itemNames.join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
