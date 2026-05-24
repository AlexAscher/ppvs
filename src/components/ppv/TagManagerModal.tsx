"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { PpvTag, TAG_COLORS } from "./types";
import { EmojiPicker } from "./EmojiPicker";

type Props = {
  modelId: string;
  agencyUserId: string;
  tags: PpvTag[];
  onClose: () => void;
  onChange: (tags: PpvTag[]) => void;
};

export function TagManagerModal({ modelId, agencyUserId, tags, onClose, onChange }: Props) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: dbError } = await supabase
        .from("ppv_tags")
        .insert({ agency_user_id: agencyUserId, model_id: modelId, name: name.trim(), color, emoji })
        .select("id, model_id, name, color, emoji")
        .single();
      if (dbError) throw new Error(dbError.message);
      onChange([...tags, data as PpvTag]);
      setName("");
      setColor(TAG_COLORS[0]);
      setEmoji(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    setError("");
    try {
      const { error: dbError } = await supabase.from("ppv_tags").delete().eq("id", id);
      if (dbError) throw new Error(dbError.message);
      onChange(tags.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[480px] p-6">
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-white">Manage Tags</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-2 block">Existing tags</label>
            {tags.length === 0 ? (
              <p className="text-[13px] text-[#6b7280] italic">No tags yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium"
                    style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                  >
                    {tag.emoji && <span>{tag.emoji}</span>}
                    <span>{tag.name}</span>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      disabled={loading}
                      className="opacity-50 hover:opacity-100 transition-opacity ml-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#2a2d35] pt-5">
            <label className="text-[12px] text-[#9ca3af] font-medium mb-2 block">Create new tag</label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <EmojiPicker value={emoji} onChange={setEmoji} />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. hot, exclusive"
                  className="flex-1 px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#6366f1] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#6b7280] mb-1.5 block">Color</label>
                <div className="flex gap-2">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#161a22] scale-110" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-[12px] text-red-400">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#5558e3] hover:to-[#4338ca] transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {loading ? "Saving…" : "Add Tag"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
