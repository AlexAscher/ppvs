"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadPpvMedia } from "@/lib/ppv-storage";
import { PpvGroup, PpvItem, PpvTag } from "./types";
import { PpvMediaInput } from "./PpvMediaInput";
import { TagSelector } from "./TagSelector";

type Props = {
  modelId: string;
  agencyUserId: string;
  allTags: PpvTag[];
  onClose: () => void;
  onSave: (group: PpvGroup) => void;
};

type DraftItem = {
  key: string;
  file: File | null;
  name: string;
  description: string;
  price: string;
};

function blankItem(): DraftItem {
  return { key: crypto.randomUUID(), file: null, name: "", description: "", price: "" };
}

export function CreateGroupModal({ modelId, agencyUserId, allTags, onClose, onSave }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [groupName, setGroupName] = useState("");
  const [groupTagIds, setGroupTagIds] = useState<string[]>([]);
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleGroupTag(id: string) {
    setGroupTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.key !== key)));
  }

  function continueToStep2() {
    if (!groupName.trim()) { setError("Group name is required"); return; }
    setError("");
    setStep(2);
  }

  async function handleSave() {
    const valid = items.every((it) => it.name.trim() && Number.isFinite(Number(it.price)) && Number(it.price) >= 0);
    if (!valid) { setError("Every media item needs a name and valid price"); return; }

    setSaving(true);
    setError("");
    try {
      const { data: group, error: groupErr } = await supabase
        .from("ppv_groups")
        .insert({ agency_user_id: agencyUserId, model_id: modelId, name: groupName.trim() })
        .select("id, model_id, name, created_at")
        .single();
      if (groupErr) throw new Error(groupErr.message);

      if (groupTagIds.length > 0) {
        const rows = groupTagIds.map((tag_id) => ({ group_id: group.id, tag_id }));
        const { error: gtErr } = await supabase.from("ppv_group_tags").insert(rows);
        if (gtErr) throw new Error(gtErr.message);
      }

      const savedItems: PpvItem[] = [];
      for (const it of items) {
        let mediaUrl: string | null = null;
        if (it.file) {
          mediaUrl = await uploadPpvMedia(supabase, agencyUserId, it.file);
        }
        const { data, error: itErr } = await supabase
          .from("ppvs")
          .insert({
            agency_user_id: agencyUserId,
            model_id: modelId,
            group_id: group.id,
            name: it.name.trim(),
            description: it.description.trim() || null,
            price: Number(it.price),
            media_url: mediaUrl,
          })
          .select("id, created_at")
          .single();
        if (itErr) throw new Error(itErr.message);
        savedItems.push({
          id: data.id,
          model_id: modelId,
          group_id: group.id,
          name: it.name.trim(),
          description: it.description.trim() || null,
          price: Number(it.price),
          media_url: mediaUrl,
          created_at: data.created_at,
          tags: [],
        });
      }

      onSave({
        id: group.id,
        model_id: modelId,
        name: group.name,
        created_at: group.created_at,
        tags: allTags.filter((t) => groupTagIds.includes(t.id)),
        items: savedItems,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[640px] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[18px] font-semibold text-white">Create Group</h2>
            <div className="flex items-center gap-1.5 mt-3">
              {([1, 2] as const).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${step === s ? "bg-[#6366f1] text-white" : step > s ? "bg-[#10b981] text-white" : "bg-[#2a2d35] text-[#6b7280]"}`}>
                    {s}
                  </div>
                  {s < 2 && <div className={`w-10 h-0.5 transition-colors ${step > s ? "bg-[#10b981]" : "bg-[#2a2d35]"}`} />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Group Name</label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Summer Collection"
                className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Tags (optional)</label>
              <TagSelector allTags={allTags} selectedIds={groupTagIds} onToggle={toggleGroupTag} />
            </div>
            {error && <p className="text-[12px] text-red-400">{error}</p>}
            <button
              onClick={continueToStep2}
              disabled={!groupName.trim()}
              className="w-full py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#5558e3] hover:to-[#4338ca] transition-all"
            >
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[13px] text-[#9ca3af]">
              Adding media to <span className="text-white font-medium">{groupName}</span>
            </p>

            {items.map((item, idx) => (
              <div key={item.key} className="bg-[#1f2937]/40 border border-[#2a2d35] rounded-lg p-4 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#9ca3af]">Media #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(item.key)}
                      className="text-[#6b7280] hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <PpvMediaInput onFileChange={(f) => updateItem(item.key, { file: f })} />

                <input
                  value={item.name}
                  onChange={(e) => updateItem(item.key, { name: e.target.value })}
                  placeholder="Name"
                  className="w-full px-4 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] focus:outline-none transition-colors"
                />

                <textarea
                  value={item.description}
                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-4 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] focus:outline-none transition-colors resize-none"
                />

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6b7280] text-[13px]">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={item.price}
                    onChange={(e) => updateItem(item.key, { price: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] focus:outline-none transition-colors"
                  />
                </div>
              </div>
            ))}

            <button
              onClick={() => setItems((p) => [...p, blankItem()])}
              className="w-full py-2.5 bg-[#1f2937] border border-dashed border-[#374151] rounded-lg text-[13px] font-medium text-[#9ca3af] hover:text-white hover:border-[#6366f1] transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add more media
            </button>

            {error && <p className="text-[12px] text-red-400">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(1)}
                disabled={saving}
                className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] text-[#9ca3af] rounded-lg font-medium text-[13px] hover:text-white transition-all disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#5558e3] hover:to-[#4338ca] transition-all"
              >
                {saving ? "Saving…" : "Save Group"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
