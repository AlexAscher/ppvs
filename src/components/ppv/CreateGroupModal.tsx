"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { PpvGroup, PpvTag } from "./types";

type Props = {
  modelId: string;
  agencyUserId: string;
  /** Tag list is unused now that group creation only asks for a name — kept
   *  on the prop boundary so existing call-sites compile unchanged. */
  allTags?: PpvTag[];
  onClose: () => void;
  onSave: (group: PpvGroup) => void;
};

/**
 * Create Group — minimal single-step form. Only the group's display name is
 * captured here (empty allowed, defaults to "Untitled"); media is added
 * later via the group card's "+ Add media" / Bulk upload buttons. Bundle
 * pricing was retired in batch 96 (chatters set price per-send instead).
 */
export function CreateGroupModal({ modelId, agencyUserId, onClose, onSave }: Props) {
  const supabase = createClient();
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const finalName = groupName.trim() || "Untitled";
      const { data, error: groupErr } = await supabase
        .from("ppv_groups")
        .insert({
          agency_user_id: agencyUserId,
          model_id: modelId,
          name: finalName,
          bundle_price: null,
        })
        .select("id, model_id, name, bundle_price, created_at")
        .single();
      if (groupErr) throw new Error(groupErr.message);
      onSave({
        id: data.id,
        model_id: modelId,
        name: data.name,
        bundle_price: null,
        created_at: data.created_at,
        tags: [],
        items: [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[420px] p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-[18px] font-semibold text-white">Create Group</h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">
              Group Name <span className="text-[#6b7280] font-normal">(optional)</span>
            </label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Summer Collection"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) {
                  void handleSave();
                }
              }}
              className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-[#6b7280] mt-1.5">
              Media is added later from the group card. Chatters set the price
              per send — no bundle pricing at group creation.
            </p>
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[14px] disabled:opacity-50 hover:from-[#0098D4] hover:to-[#0098D4] transition-all"
          >
            {saving ? "Creating…" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
