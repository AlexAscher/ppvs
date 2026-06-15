"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type Results = {
  fans: { peerId: string; modelName: string; name: string; snippet: string }[];
  ppvs: { id: string; name: string; modelName: string }[];
  groups: { id: string; name: string; color: string }[];
  labels: { id: string; name: string; color: string }[];
};

const EMPTY: Results = { fans: [], ppvs: [], groups: [], labels: [] };

/**
 * Agency-wide search box. Debounced query to /api/search, results grouped
 * by category in a dropdown. Read-only — clicking a result is informational
 * for now (no deep-link routing yet).
 */
export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(EMPTY);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (r.ok) setRes((await r.json()) as Results);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const total =
    res.fans.length + res.ppvs.length + res.groups.length + res.labels.length;

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b7280]" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          className="w-full pl-8 pr-7 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
        />
        {q && (
          <button
            onClick={() => { setQ(""); setRes(EMPTY); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-1 bg-[#1f2937] border border-[#374151] rounded-lg shadow-2xl z-50 max-h-[60vh] overflow-y-auto">
          {loading && total === 0 && (
            <div className="px-3 py-3 text-[12px] text-[#6b7280]">Searching…</div>
          )}
          {!loading && total === 0 && (
            <div className="px-3 py-3 text-[12px] text-[#6b7280]">No matches.</div>
          )}

          <Section title="Fans (notes)" show={res.fans.length > 0}>
            {res.fans.map((f) => (
              <Row key={`f-${f.peerId}`} title={f.name} sub={`${f.modelName} · ${f.snippet}`} />
            ))}
          </Section>
          <Section title="PPV items" show={res.ppvs.length > 0}>
            {res.ppvs.map((p) => (
              <Row key={`p-${p.id}`} title={p.name} sub={p.modelName} />
            ))}
          </Section>
          <Section title="Groups" show={res.groups.length > 0}>
            {res.groups.map((g) => (
              <Row key={`g-${g.id}`} title={g.name} dot={g.color} />
            ))}
          </Section>
          <Section title="Labels" show={res.labels.length > 0}>
            {res.labels.map((l) => (
              <Row key={`l-${l.id}`} title={l.name} dot={l.color} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#6b7280]">{title}</div>
      {children}
    </div>
  );
}

function Row({ title, sub, dot }: { title: string; sub?: string; dot?: string }) {
  return (
    <div className="px-3 py-1.5 hover:bg-[#374151]/50 flex items-center gap-2">
      {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />}
      <div className="min-w-0">
        <div className="text-[12px] text-white truncate">{title}</div>
        {sub && <div className="text-[10px] text-[#6b7280] truncate">{sub}</div>}
      </div>
    </div>
  );
}
