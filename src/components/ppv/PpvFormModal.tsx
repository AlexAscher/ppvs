"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadPpvMedia, deletePpvMedia } from "@/lib/ppv-storage";
import { PpvGroup, PpvItem, PpvTag } from "./types";
import { PpvMediaInput } from "./PpvMediaInput";
import { TagSelector } from "./TagSelector";

type Props = {
  mode: "add" | "edit";
  modelId: string;
  agencyUserId: string;
  groupId: string | null;
  existing: PpvItem | null;
  allTags: PpvTag[];
  /** All groups belonging to the current creator. Drives the
   *  "Move to group / + Add to group" picker in edit mode. */
  allGroups?: PpvGroup[];
  onClose: () => void;
  onSave: (ppv: PpvItem) => void;
  onDelete?: (id: string) => void;
};

export function PpvFormModal({
  mode,
  modelId,
  agencyUserId,
  groupId,
  existing,
  allTags,
  allGroups,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  // Group assignment — editable. On add: defaults to whatever the caller
  // passed (could be null, or a specific group). On edit: defaults to the
  // PPV's current group_id.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    existing?.group_id ?? groupId ?? null,
  );
  // Price is no longer set by the agency — chatters pick a price (or 0 for
  // free) when sending. We default to 0 in the DB so legacy code that still
  // reads ppvs.price gets a deterministic value. Existing rows keep their old
  // values until re-edited.
  const [selectedTags, setSelectedTags] = useState<string[]>(existing?.tags.map((t) => t.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  // Delete confirmation shows as a centered Yes/No modal instead of the
  // native window.confirm() dialog, which the design mocks call out
  // specifically as ugly on desktop Chrome.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function toggleTag(tagId: string) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    // Price is set by the chatter at send-time, not at vault-create time.
    // DB column stays NOT NULL on most setups, so default to 0.
    const priceNum = 0;

    setSaving(true);
    setError("");
    try {
      let mediaUrl = existing?.media_url ?? null;
      let previewUrl: string | null = null;
      if (file) {
        if (existing?.media_url) {
          // Delete both the old original and any stale preview alongside it.
          await deletePpvMedia(
            supabase,
            existing.media_url,
            (existing as { preview_url?: string | null }).preview_url ?? null,
          ).catch(() => {});
        }
        const uploaded = await uploadPpvMedia(supabase, agencyUserId, file);
        mediaUrl = uploaded.mediaUrl;
        previewUrl = uploaded.previewUrl;
      }

      let savedId: string;
      let createdAt: string;

      if (mode === "add") {
        const { data, error: dbError } = await supabase
          .from("ppvs")
          .insert({
            agency_user_id: agencyUserId,
            model_id: modelId,
            group_id: selectedGroupId,
            name: name.trim(),
            description: description.trim() || null,
            price: priceNum,
            media_url: mediaUrl,
            preview_url: previewUrl,
          })
          .select("id, created_at")
          .single();
        if (dbError) throw new Error(dbError.message);
        savedId = data.id;
        createdAt = data.created_at;
      } else {
        if (!existing) throw new Error("No existing PPV");
        const updatePayload: Record<string, unknown> = {
          name: name.trim(),
          description: description.trim() || null,
          price: priceNum,
          // Move-to-group: persist the picker's value so editing can drop
          // the PPV out of its current folder or into another one.
          group_id: selectedGroupId,
        };
        // Only overwrite media columns when a new file was uploaded —
        // editing name/price without changing the file shouldn't wipe them.
        if (file) {
          updatePayload.media_url = mediaUrl;
          updatePayload.preview_url = previewUrl;
        }
        const { error: dbError } = await supabase
          .from("ppvs")
          .update(updatePayload)
          .eq("id", existing.id);
        if (dbError) throw new Error(dbError.message);
        savedId = existing.id;
        createdAt = existing.created_at;

        await supabase.from("ppv_item_tags").delete().eq("ppv_id", savedId);
      }

      if (selectedTags.length > 0) {
        const rows = selectedTags.map((tag_id) => ({ ppv_id: savedId, tag_id }));
        const { error: tagsError } = await supabase.from("ppv_item_tags").insert(rows);
        if (tagsError) throw new Error(tagsError.message);
      }

      const tagsForResult = allTags.filter((t) => selectedTags.includes(t.id));
      onSave({
        id: savedId,
        model_id: modelId,
        group_id: selectedGroupId,
        name: name.trim(),
        description: description.trim() || null,
        price: priceNum,
        media_url: mediaUrl,
        created_at: createdAt,
        tags: tagsForResult,
        review_status: mode === "add" ? "pending" : (existing?.review_status ?? "pending"),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing || !onDelete) return;
    setShowDeleteConfirm(false);
    setDeleting(true);
    setError("");
    try {
      // Delete the ROW first and confirm it actually happened (.select()
      // returns the deleted rows). If RLS silently blocks the delete it
      // returns 0 rows — previously we'd still delete the storage file,
      // leaving an orphan row with a broken-image icon. Now we surface it.
      const { data: deleted, error: dbError } = await supabase
        .from("ppvs")
        .delete()
        .eq("id", existing.id)
        .select("id");
      if (dbError) throw new Error(dbError.message);
      if (!deleted || deleted.length === 0) {
        throw new Error(
          "Couldn't delete (permission denied). Add a DELETE policy on the ppvs table.",
        );
      }
      // Row gone — now best-effort remove the storage files.
      if (existing.media_url) {
        await deletePpvMedia(supabase, existing.media_url).catch(() => {});
      }
      onDelete(existing.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[520px] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-white">
            {mode === "add" ? "Add PPV" : "Edit PPV"}
          </h2>
          <button onClick={onClose} className="text-[#6b7280] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <PpvMediaInput
            initialUrl={existing ? `/api/ppv/file/${existing.id}` : null}
            onFileChange={setFile}
          />

          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Beach Photoset"
              className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
              className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white placeholder:text-[#4b5563] focus:border-[#00AFF0] focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* Group picker — drives both "+ Add to group" (when currently
              standalone) and "Move to group" (when already in one). The
              `<select>` plus the explicit "Standalone" option covers both
              flows in one control. Hidden if the creator has no groups
              yet (nothing to pick from). */}
          {!!allGroups && allGroups.length > 0 && (
            <div>
              <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">
                {selectedGroupId ? "Group" : "+ Add to group"}
              </label>
              <select
                value={selectedGroupId ?? ""}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
                className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[14px] text-white focus:border-[#00AFF0] focus:outline-none transition-colors"
              >
                <option value="">— Standalone (no group) —</option>
                {allGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {existing && existing.group_id !== selectedGroupId && (
                <p className="text-[11px] text-[#00AFF0] mt-1.5">
                  Will be moved on save.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-[12px] text-[#9ca3af] font-medium mb-1.5 block">Tags</label>
            <TagSelector allTags={allTags} selectedIds={selectedTags} onToggle={toggleTag} />
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            {mode === "edit" && onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving || deleting}
                className="px-4 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg font-medium text-[13px] hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
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

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[360px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-white text-center mb-2">
              Are you sure?
            </h3>
            <p className="text-[12px] text-[#9ca3af] text-center mb-5">
              This PPV will be permanently deleted from your vault.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-[#1f2937] border border-[#374151] text-white rounded-lg font-medium text-[13px] hover:bg-[#252b36] transition-all"
              >
                No
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg font-medium text-[13px] hover:bg-red-500/30 transition-all"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
