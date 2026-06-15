"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { deletePpvMedia } from "@/lib/ppv-storage";
import { PpvGroup, PpvTag } from "./types";
import { TagSelector } from "./TagSelector";

type Props = {
  group: PpvGroup;
  allTags: PpvTag[];
  onClose: () => void;
  onSave: (group: PpvGroup) => void;
  onDelete: (id: string) => void;
};

export function EditGroupModal({ group, allTags, onClose, onSave, onDelete }: Props) {
  const supabase = createClient();
  const [name, setName] = useState(group.name);
  const [bundlePrice, setBundlePrice] = useState(
    group.bundle_price != null && group.bundle_price > 0 ? String(group.bundle_price) : "",
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(group.tags.map((t) => t.id));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function toggleTag(id: string) {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Group name is required"); return; }
    const bundlePriceNum =
      bundlePrice.trim() && Number.isFinite(Number(bundlePrice)) && Number(bundlePrice) > 0
        ? Math.round(Number(bundlePrice) * 100) / 100
        : null;
    setSaving(true);
    setError("");
    try {
      const { error: dbError } = await supabase
        .from("ppv_groups")
        .update({ name: name.trim(), bundle_price: bundlePriceNum })
        .eq("id", group.id);
      if (dbError) throw new Error(dbError.message);

      await supabase.from("ppv_group_tags").delete().eq("group_id", group.id);
      if (selectedTags.length > 0) {
        const rows = selectedTags.map((tag_id) => ({ group_id: group.id, tag_id }));
        const { error: tagsErr } = await supabase.from("ppv_group_tags").insert(rows);
        if (tagsErr) throw new Error(tagsErr.message);
      }

      onSave({
        ...group,
        name: name.trim(),
        bundle_price: bundlePriceNum,
        tags: allTags.filter((t) => selectedTags.includes(t.id)),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete group "${group.name}" and all ${group.items.length} item(s) inside?`)) return;
    setDeleting(true);
    setError("");
    try {
      for (const it of group.items) {
        if (it.media_url) await deletePpvMedia(supabase, it.media_url).catch(() => {});
      }
      const { error: dbError } = await supabase.from("ppv_groups").delete().eq("id", group.id);
      if (dbError) throw new Error(dbError.message);
      onDelete(group.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[480px] p-6">
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-white">Edit Group</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Group Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white focus:border-[#00AFF0] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Tags</label>
            <TagSelector allTags={allTags} selectedIds={selectedTags} onToggle={toggleTag} />
          </div>

          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Bundle price (optional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b7280] text-[13px]">$</span>
              <input
                type="number" step="0.01" min="0"
                value={bundlePrice}
                onChange={(e) => setBundlePrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] focus:outline-none transition-colors"
              />
            </div>
            <p className="text-[11px] text-[#6b7280] mt-1.5">Sell the whole group as one unlock at this price. Empty = items sold individually.</p>
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDelete}
              disabled={saving || deleting}
              className="px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg font-medium text-[13px] hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting…" : "Delete Group"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex-1 py-2.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#0098D4] hover:to-[#0098D4] transition-all"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
