"use client";

import { useEffect, useState } from "react";
import { Plus, X, Folder } from "lucide-react";

/**
 * FanGroupsSection — inside FanProfileDrawer.
 *
 * Lists the groups this (model, peer) is a member of as chips. A "+"
 * button opens a small inline picker with the agency's library of
 * groups, with check icons for the ones already assigned. Click toggles
 * membership.
 *
 * Library lives at /api/groups. Membership at /api/groups/[id]/members.
 *
 * Inline-create: if the user types in a name that doesn't exist, the
 * picker offers "+ Create '<name>'" which POSTs /api/groups and assigns
 * in one click.
 */

type Group = {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
  memberCount?: number;
};

interface Props {
  modelId: string;
  peerId: string;
}

export function FanGroupsSection({ modelId, peerId }: Props) {
  const [library, setLibrary] = useState<Group[]>([]);
  const [memberOf, setMemberOf] = useState<Group[]>([]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, peerId]);

  async function reload() {
    const [libR, memR] = await Promise.all([
      fetch("/api/groups"),
      fetch(`/api/groups/for-fan?modelId=${modelId}&peerId=${peerId}`),
    ]);
    if (libR.ok) {
      const j = (await libR.json()) as { groups: Group[] };
      setLibrary(j.groups ?? []);
    }
    if (memR.ok) {
      const j = (await memR.json()) as { groups: Group[] };
      setMemberOf(j.groups ?? []);
    }
  }

  async function toggle(g: Group) {
    setWorking(g.id);
    try {
      const isMember = memberOf.some((m) => m.id === g.id);
      if (isMember) {
        await fetch(
          `/api/groups/${g.id}/members?modelId=${modelId}&peerId=${peerId}`,
          { method: "DELETE" },
        );
        setMemberOf((cur) => cur.filter((x) => x.id !== g.id));
      } else {
        await fetch(`/api/groups/${g.id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, peerId }),
        });
        setMemberOf((cur) => [...cur, g]);
      }
    } finally {
      setWorking(null);
    }
  }

  async function createAndAssign(name: string) {
    setWorking("__new__");
    try {
      const r = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { group: Group };
      setLibrary((cur) => [...cur, j.group]);
      // assign immediately
      await fetch(`/api/groups/${j.group.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, peerId }),
      });
      setMemberOf((cur) => [...cur, j.group]);
      setSearch("");
    } finally {
      setWorking(null);
    }
  }

  const filtered = library.filter((g) =>
    search ? g.name.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const exactMatch = library.some(
    (g) => g.name.toLowerCase() === search.trim().toLowerCase(),
  );

  return (
    <div>
      <div className="text-[10px] text-[#6b7280] uppercase tracking-wide mb-2 flex items-center gap-1">
        <Folder className="w-3 h-3" /> Groups
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {memberOf.map((g) => (
          <button
            key={g.id}
            onClick={() => toggle(g)}
            disabled={working === g.id}
            className="px-2 py-1 rounded-md flex items-center gap-1 text-[11px] font-medium border transition-all disabled:opacity-50"
            style={{
              background: `${g.color}20`,
              borderColor: `${g.color}66`,
              color: g.color,
            }}
            title="Click to remove"
          >
            {g.emoji && <span>{g.emoji}</span>}
            <span>{g.name}</span>
            <X className="w-3 h-3 opacity-60" />
          </button>
        ))}
        <button
          onClick={() => setAdding((v) => !v)}
          className="w-7 h-7 rounded-md bg-[#1f2937] border border-[#374151] flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-[#252b36]"
          aria-label="Add group"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {adding && (
        <div className="mt-2 bg-[#0f131a] border border-[#2a2d35] rounded-lg p-2">
          <input
            autoFocus
            className="w-full px-2 py-1.5 bg-[#1f2937] border border-[#374151] rounded text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1] mb-1.5"
            placeholder="Search or create…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-[180px] overflow-y-auto space-y-0.5">
            {filtered.map((g) => {
              const isMember = memberOf.some((m) => m.id === g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggle(g)}
                  disabled={working === g.id}
                  className="w-full px-2 py-1.5 rounded flex items-center justify-between text-[12px] text-white hover:bg-[#1f2937] disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: g.color }}
                    />
                    {g.emoji && <span>{g.emoji}</span>}
                    <span>{g.name}</span>
                  </span>
                  {isMember && <span className="text-emerald-400">✓</span>}
                </button>
              );
            })}
            {search.trim() && !exactMatch && (
              <button
                onClick={() => createAndAssign(search.trim())}
                disabled={working === "__new__"}
                className="w-full px-2 py-1.5 rounded flex items-center gap-1.5 text-[12px] text-[#6366f1] hover:bg-[#1f2937] disabled:opacity-50"
              >
                <Plus className="w-3 h-3" />
                Create &ldquo;{search.trim()}&rdquo;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
