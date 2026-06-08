"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";

type FeedPost = {
  id: string;
  body: string;
  image_url: string | null;
  author_name: string | null;
  created_at: string;
  mine?: boolean;
};

function formatPostDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return "just now";
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Renders the agency's internal feed. Agency owners get a composer at the
 * top; chatters see read-only. Used by:
 *   - Agency dashboard → Feed tab
 *   - Chatter dashboard → Feed tab
 *   - Chatter page → Feed modal (popped from the Topbar)
 */
export function FeedPanel({ compact = false }: { compact?: boolean }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/feed");
      const data = (await res.json()) as { posts?: FeedPost[]; canPost?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPosts(data.posts ?? []);
      setCanPost(!!data.canPost);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load feed");
      setPosts([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handlePost() {
    if (!draft.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft, image_url: imageUrl || undefined }),
      });
      const data = (await res.json()) as { post?: FeedPost; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.post) setPosts((cur) => [data.post!, ...(cur ?? [])]);
      setDraft("");
      setImageUrl("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Post failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const before = posts ?? [];
    setPosts((cur) => (cur ?? []).filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/feed?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || `HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setPosts(before); // rollback
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {canPost && (
        <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-4 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share an update with your chatters — scripts, daily targets, a heads-up about a creator…"
            rows={3}
            className="w-full px-3 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1] resize-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Optional image URL"
              className="flex-1 min-w-[180px] px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
            <button
              onClick={handlePost}
              disabled={saving || !draft.trim()}
              className="px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Posting…" : "Post to feed"}
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-[12px] text-red-400">
          {err}
        </div>
      )}

      {posts === null ? (
        <div className="text-center py-10 text-[13px] text-[#6b7280]">Loading feed…</div>
      ) : posts.length === 0 ? (
        <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-8 text-center text-[13px] text-[#6b7280]">
          {canPost
            ? "Nothing posted yet. Drop the first update for your chatters above."
            : "Your agency hasn't posted anything yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} className="group bg-[#161a22] border border-[#2a2d35] rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                    {(p.author_name ?? "A").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-white truncate">{p.author_name ?? "Agency"}</div>
                    <div className="text-[11px] text-[#6b7280]">{formatPostDate(p.created_at)}</div>
                  </div>
                </div>
                {p.mine && (
                  <button
                    onClick={() => void handleDelete(p.id)}
                    title="Delete post"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#6b7280] hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-[13px] text-[#e5e7eb] whitespace-pre-wrap mt-3 leading-relaxed">{p.body}</div>
              {p.image_url && (
                <div className="mt-3 rounded-lg overflow-hidden border border-[#2a2d35]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt=""
                    className="w-full max-h-[420px] object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
