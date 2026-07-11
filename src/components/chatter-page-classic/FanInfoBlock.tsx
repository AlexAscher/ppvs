"use client";

import { useEffect, useRef, useState } from "react";
import type { FanRow } from "@/lib/fan-types";

/**
 * FanInfoBlock — the fan profile / stats summary that used to live only in
 * the slide-out FanProfileDrawer, lifted into the chatter's "Fan Information"
 * tab (formerly "Notes"). Scope per the user's spec: Profile (bio / birthdate
 * / location, auto-saved), the Fan-since / Last-online / response / read
 * timeline, the Spent / Purchased / Avg PPV / Avg Tip stats, and the Buying
 * power dots. Everything below Buying power (tags, groups, notes log, purchase
 * history) stays in the drawer and is NOT duplicated here.
 *
 * Self-contained: holds its own basics state + debounced auto-save and fetches
 * the live sales stats, so the parent ActionPanel only has to pass the fan row
 * + ids it already has in memory.
 */

interface Props {
  modelId: string | null;
  peerId: string | null;
  fan: FanRow | null;
  /** Caller role. Chatters must NEVER see the fan's @handle — they only see
   *  the display name. The agency sees the real @handle when the fan has one.
   *  When omitted (legacy call sites), defaults to hiding the handle for
   *  safety. */
  role?: "agency" | "chatter" | null;
}

type SalesStats = {
  purchased: number;
  avgPpv: number;
};

export function FanInfoBlock({ modelId, peerId, fan, role = null }: Props) {
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null);
  const [bio, setBio] = useState(fan?.bio ?? "");
  const [birthdate, setBirthdate] = useState(fan?.birthdate ?? "");
  const [location, setLocation] = useState(fan?.location ?? "");
  const [basicsMsg, setBasicsMsg] = useState("");
  // Track which fan's basics we currently hold so a switch repopulates the
  // inputs from the new fan row instead of leaking the previous one's values.
  const lastFanRef = useRef<string | null>(null);

  // Live sales stats (Spent / Purchased / Avg PPV / Avg Tip).
  useEffect(() => {
    if (!modelId || !peerId) {
      setSalesStats(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = new URL(`/api/fans/${modelId}/stats`, window.location.origin);
        url.searchParams.set("peerId", peerId);
        const res = await fetch(url.toString());
        if (res.ok && !cancelled) setSalesStats((await res.json()) as SalesStats);
      } catch {
        // stats are a nicety — ignore failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId, peerId]);

  // Hydrate basics when the fan we're viewing changes (tracked by fan id so a
  // re-fetch of the same fan doesn't stomp the chatter's in-progress edits).
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

  // Debounced auto-save (500ms after the last edit). Best-effort — the UI
  // never blocks on the network.
  useEffect(() => {
    if (!modelId || !peerId || !fan) return;
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
  }, [bio, birthdate, location, fan, modelId, peerId]);

  if (!fan) {
    return (
      <div className="text-center py-6 text-[11px] text-[#6b7280]">
        Select a chat to see fan information.
      </div>
    );
  }

  const totalSpent = Number(fan.total_spent ?? 0);

  return (
    <div className="space-y-4">
      {/* Profile — bio / birthdate / location, auto-saved */}
      <div className="space-y-2">
        <div className="text-[10px] text-[#6b7280] uppercase tracking-wide flex items-center justify-between gap-2">
          <span className="flex items-baseline gap-2 min-w-0">
            <span>Profile</span>
            {/* Fan name next to the section header. Agency sees `@username`
                when the fan has one; chatters ALWAYS see the display name
                only (they must never see the fan's Telegram handle — same
                rule as the chat list / header hideUsername). */}
            {(() => {
              const showHandle =
                role === "agency" && !!fan.telegram_username;
              const label = showHandle
                ? `@${fan.telegram_username}`
                : fan.telegram_name || null;
              if (!label) return null;
              return (
                <span className="normal-case text-[12px] text-white font-medium tracking-normal truncate">
                  {label}
                </span>
              );
            })()}
          </span>
          {basicsMsg && (
            <span
              className={`normal-case text-[10px] shrink-0 ${
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
          {/* Birthdate: plain text so the placeholder isn't swapped to the OS
              locale's date format. Auto-inserts hyphens, clamps YYYY-MM-DD. */}
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

      {/* Timeline — Fan since / Last online / Last response / Last read */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Fan since", iso: fan.created_at ?? null },
          { label: "Last online", iso: fan.last_seen_at ?? null },
          { label: "Last response", iso: fan.last_response_at ?? null },
          { label: "Last read", iso: fan.last_read_at ?? null },
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

      {/* Stats — Spent / Purchased / Avg PPV / Avg Tip + buying power */}
      <div>
        <div className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-2">
          Stats
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: "Spent",
              value: `$${totalSpent.toFixed(totalSpent < 100 ? 2 : 0)}`,
              accent: true,
            },
            { label: "Purchased", value: String(salesStats?.purchased ?? 0) },
            { label: "Avg PPV", value: salesStats ? `$${salesStats.avgPpv.toFixed(2)}` : "—" },
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
      </div>
    </div>
  );
}
