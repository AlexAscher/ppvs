"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, FolderPlus, Tag, ChevronDown, Pencil, Folder, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadPpvMedia } from "@/lib/ppv-storage";
import { PpvGroup, PpvItem, PpvModel, PpvTag } from "./types";
import { TagManagerModal } from "./TagManagerModal";
import { PpvFormModal } from "./PpvFormModal";
import { CreateGroupModal } from "./CreateGroupModal";
import { EditGroupModal } from "./EditGroupModal";

type PpvFormState =
  | { kind: "add"; groupId: string | null }
  | { kind: "edit"; ppv: PpvItem };

export function PPVsTab() {
  const supabase = createClient();
  const [agencyUserId, setAgencyUserId] = useState<string | null>(null);
  const [models, setModels] = useState<PpvModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const [tags, setTags] = useState<PpvTag[]>([]);
  const [groups, setGroups] = useState<PpvGroup[]>([]);
  const [standalonePpvs, setStandalonePpvs] = useState<PpvItem[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [showTagManager, setShowTagManager] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PpvGroup | null>(null);
  const [ppvForm, setPpvForm] = useState<PpvFormState | null>(null);

  const [loading, setLoading] = useState(false);

  // Bulk operations on standalone PPVs.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"delete" | "caption" | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");

  // Bulk upload: pick many files → each becomes a PPV named after the file.
  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkUpload, setBulkUpload] = useState<{ done: number; total: number } | null>(null);

  async function handleBulkFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same files
    if (!files.length || !agencyUserId || !selectedModelId) return;
    setBulkUpload({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const uploaded = await uploadPpvMedia(supabase, agencyUserId, f);
        const baseName = f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Untitled";
        const { data } = await supabase
          .from("ppvs")
          .insert({
            agency_user_id: agencyUserId,
            model_id: selectedModelId,
            group_id: null,
            name: baseName,
            description: null,
            price: 0,
            media_url: uploaded.mediaUrl,
            preview_url: uploaded.previewUrl,
          })
          .select("id, model_id, group_id, name, description, price, media_url, preview_url, created_at")
          .single();
        if (data) {
          setStandalonePpvs((prev) => [{ ...(data as PpvItem), tags: [] }, ...prev]);
        }
      } catch {
        /* skip this file, keep going */
      }
      setBulkUpload({ done: i + 1, total: files.length });
    }
    setBulkUpload(null);
  }
  const toggleSel = useCallback((id: string) => {
    setSelectedIds((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAgencyUserId(user.id);
    });
    supabase
      .from("models")
      .select("id, name, username, avatar_url")
      .then(({ data }) => {
        if (data) {
          setModels(data as PpvModel[]);
          if (data.length > 0) setSelectedModelId((data[0] as PpvModel).id);
        }
      });
  }, [supabase]);

  const loadModelData = useCallback(async (modelId: string) => {
    setLoading(true);
    try {
      const [tagsRes, groupsRes, ppvsRes, itemTagsRes, groupTagsRes] = await Promise.all([
        supabase.from("ppv_tags").select("id, model_id, name, color, emoji").eq("model_id", modelId).order("created_at"),
        supabase.from("ppv_groups").select("id, model_id, name, created_at").eq("model_id", modelId).order("created_at", { ascending: false }),
        supabase.from("ppvs").select("id, model_id, group_id, name, description, price, media_url, preview_url, created_at").eq("model_id", modelId).order("created_at", { ascending: false }),
        supabase.from("ppv_item_tags").select("ppv_id, tag_id"),
        supabase.from("ppv_group_tags").select("group_id, tag_id"),
      ]);

      const tagList = (tagsRes.data ?? []) as PpvTag[];
      const tagById = new Map(tagList.map((t) => [t.id, t]));

      const itemTagMap = new Map<string, PpvTag[]>();
      for (const row of itemTagsRes.data ?? []) {
        const tag = tagById.get((row as { tag_id: string }).tag_id);
        if (!tag) continue;
        const arr = itemTagMap.get((row as { ppv_id: string }).ppv_id) ?? [];
        arr.push(tag);
        itemTagMap.set((row as { ppv_id: string }).ppv_id, arr);
      }

      const groupTagMap = new Map<string, PpvTag[]>();
      for (const row of groupTagsRes.data ?? []) {
        const tag = tagById.get((row as { tag_id: string }).tag_id);
        if (!tag) continue;
        const arr = groupTagMap.get((row as { group_id: string }).group_id) ?? [];
        arr.push(tag);
        groupTagMap.set((row as { group_id: string }).group_id, arr);
      }

      const allPpvs: PpvItem[] = ((ppvsRes.data ?? []) as Omit<PpvItem, "tags">[]).map((row) => ({
        ...row,
        price: Number(row.price),
        tags: itemTagMap.get(row.id) ?? [],
      }));

      const groupList: PpvGroup[] = ((groupsRes.data ?? []) as Omit<PpvGroup, "tags" | "items">[]).map((g) => ({
        ...g,
        tags: groupTagMap.get(g.id) ?? [],
        items: allPpvs.filter((p) => p.group_id === g.id),
      }));

      setTags(tagList);
      setGroups(groupList);
      setStandalonePpvs(allPpvs.filter((p) => p.group_id === null));
      setActiveTagFilter(null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (selectedModelId) loadModelData(selectedModelId);
  }, [selectedModelId, loadModelData]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  function matchesFilter(itemTags: PpvTag[]) {
    if (!activeTagFilter) return true;
    return itemTags.some((t) => t.id === activeTagFilter);
  }

  const filteredStandalone = standalonePpvs.filter((p) => matchesFilter(p.tags));
  const filteredGroups = groups.filter((g) => matchesFilter(g.tags) || g.items.some((it) => matchesFilter(it.tags)));

  function handlePpvSaved(saved: PpvItem) {
    if (saved.group_id) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== saved.group_id ? g : {
            ...g,
            items: g.items.some((it) => it.id === saved.id)
              ? g.items.map((it) => (it.id === saved.id ? saved : it))
              : [saved, ...g.items],
          },
        ),
      );
    } else {
      setStandalonePpvs((prev) =>
        prev.some((it) => it.id === saved.id) ? prev.map((it) => (it.id === saved.id ? saved : it)) : [saved, ...prev],
      );
    }
    setPpvForm(null);
  }

  function handlePpvDeleted(id: string) {
    setStandalonePpvs((prev) => prev.filter((p) => p.id !== id));
    setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.filter((it) => it.id !== id) })));
    setPpvForm(null);
  }

  async function doBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await supabase.from("ppvs").delete().in("id", ids);
    setStandalonePpvs((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setGroups((prev) =>
      prev.map((g) => ({ ...g, items: g.items.filter((it) => !selectedIds.has(it.id)) })),
    );
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkModal(null);
  }

  async function doBulkSetCaption(caption: string) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await supabase.from("ppvs").update({ description: caption }).in("id", ids);
    const patch = (p: PpvItem) => (selectedIds.has(p.id) ? { ...p, description: caption } : p);
    setStandalonePpvs((prev) => prev.map(patch));
    setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.map(patch) })));
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkModal(null);
  }

  function handleGroupSaved(saved: PpvGroup) {
    setGroups((prev) =>
      prev.some((g) => g.id === saved.id) ? prev.map((g) => (g.id === saved.id ? saved : g)) : [saved, ...prev],
    );
    setShowCreateGroup(false);
    setEditingGroup(null);
  }

  function handleGroupDeleted(id: string) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setEditingGroup(null);
  }

  if (!selectedModelId && models.length === 0) {
    return (
      <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">PPVs 🔒</h1>
            <p className="text-[14px] text-[#9ca3af]">Manage your pay-per-view content</p>
          </div>
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-8">
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#1f2937] rounded-full flex items-center justify-center text-[32px]">👤</div>
              <h3 className="text-[18px] font-semibold text-white mb-2">No creators connected</h3>
              <p className="text-[14px] text-[#9ca3af]">Add a creator in the Creators tab before creating PPVs.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#0d1117] overflow-y-auto p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold text-white mb-1">PPVs 🔒</h1>
            <p className="text-[14px] text-[#9ca3af]">Manage your pay-per-view content</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 min-w-[180px] justify-between"
              >
                <span>{selectedModel?.name ?? "Select creator"}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showModelDropdown && (
                <div className="absolute top-full right-0 mt-2 w-full bg-[#1f2937] border border-[#374151] rounded-lg shadow-xl overflow-hidden z-10">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModelId(m.id); setShowModelDropdown(false); }}
                      className={`w-full px-4 py-2.5 text-[13px] text-left hover:bg-[#374151] transition-colors ${selectedModelId === m.id ? "bg-[#374151] text-[#6366f1]" : "text-white"}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowTagManager(true)}
              disabled={!selectedModelId}
              className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Tag className="w-4 h-4" />Add Tags
            </button>
            <button
              onClick={() => setShowCreateGroup(true)}
              disabled={!selectedModelId}
              className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <FolderPlus className="w-4 h-4" />Create Group
            </button>
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
              disabled={!selectedModelId}
              className={`px-4 py-2.5 rounded-lg text-[13px] font-medium transition-all flex items-center gap-2 disabled:opacity-50 border ${
                selectMode
                  ? "bg-[#6366f1] border-[#6366f1] text-white"
                  : "bg-[#1f2937] border-[#374151] text-white hover:bg-[#374151]"
              }`}
            >
              {selectMode ? "Done" : "Select"}
            </button>
            <button
              onClick={() => bulkInputRef.current?.click()}
              disabled={!selectedModelId || !!bulkUpload}
              className="px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />Bulk upload
            </button>
            <input
              ref={bulkInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleBulkFiles}
            />
            {bulkUpload && (
              <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#1f2937] border border-[#374151] rounded-xl px-4 py-2.5 text-[12px] text-white shadow-2xl flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-[#374151] border-t-[#6366f1] rounded-full animate-spin" />
                Uploading {bulkUpload.done}/{bulkUpload.total}…
              </div>
            )}
            <button
              onClick={() => setPpvForm({ kind: "add", groupId: null })}
              disabled={!selectedModelId}
              className="px-4 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[13px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />Add PPV
            </button>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-[#6b7280] uppercase tracking-wider">Filter:</span>
            <button
              onClick={() => setActiveTagFilter(null)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all ${
                activeTagFilter === null
                  ? "bg-[#6366f1] text-white"
                  : "bg-[#1f2937] text-[#9ca3af] hover:text-white"
              }`}
            >
              All
            </button>
            {tags.map((t) => {
              const active = activeTagFilter === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTagFilter(active ? null : t.id)}
                  className="px-3 py-1 rounded-full text-[12px] font-medium transition-all inline-flex items-center gap-1"
                  style={{
                    backgroundColor: active ? t.color : `${t.color}20`,
                    color: active ? "#fff" : t.color,
                  }}
                >
                  {t.emoji && <span>{t.emoji}</span>}
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-[#6b7280]">Loading…</div>
        ) : standalonePpvs.length === 0 && groups.length === 0 ? (
          <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg p-8">
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#1f2937] rounded-full flex items-center justify-center text-[32px]">🔒</div>
              <h3 className="text-[18px] font-semibold text-white mb-2">No PPVs yet</h3>
              <p className="text-[14px] text-[#9ca3af] mb-6">Start adding your pay-per-view content to share with your fans</p>
              <button
                onClick={() => setPpvForm({ kind: "add", groupId: null })}
                className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] rounded-lg text-[14px] font-semibold text-white hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />Create your first PPV
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredGroups.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-[14px] font-semibold text-[#9ca3af] uppercase tracking-wider">Groups</h2>
                {filteredGroups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    onEdit={() => setEditingGroup(g)}
                    onAddItem={() => setPpvForm({ kind: "add", groupId: g.id })}
                    onItemClick={(item) => setPpvForm({ kind: "edit", ppv: item })}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                    onToggleSel={toggleSel}
                  />
                ))}
              </div>
            )}

            {filteredStandalone.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-[14px] font-semibold text-[#9ca3af] uppercase tracking-wider">Individual PPVs</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredStandalone.map((p) => (
                    <div
                      key={p.id}
                      className={`relative h-full rounded-lg ${
                        selectMode && selectedIds.has(p.id) ? "ring-2 ring-[#6366f1]" : ""
                      }`}
                    >
                      {selectMode && (
                        <button
                          onClick={() => toggleSel(p.id)}
                          className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                            selectedIds.has(p.id)
                              ? "bg-[#6366f1] border-[#6366f1] text-white"
                              : "bg-black/50 border-white/70"
                          }`}
                        >
                          {selectedIds.has(p.id) && "✓"}
                        </button>
                      )}
                      <PpvCard
                        ppv={p}
                        onClick={() =>
                          selectMode ? toggleSel(p.id) : setPpvForm({ kind: "edit", ppv: p })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk action bar */}
            {selectMode && selectedIds.size > 0 && (
              <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[#1f2937] border border-[#374151] rounded-xl shadow-2xl px-4 py-2.5">
                <span className="text-[12px] text-white font-medium">{selectedIds.size} selected</span>
                <button onClick={() => { setCaptionDraft(""); setBulkModal("caption"); }} className="text-[12px] px-3 py-1.5 rounded-lg bg-[#374151] text-white hover:bg-[#454c5a]">
                  Set caption
                </button>
                <button onClick={() => setBulkModal("delete")} className="text-[12px] px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
                  Delete
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="text-[12px] text-[#9ca3af] hover:text-white">
                  Clear
                </button>
              </div>
            )}

            {/* Bulk action modal (styled, replaces native confirm/prompt) */}
            {bulkModal && (
              <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={() => setBulkModal(null)}>
                <div className="bg-[#161a22] border border-[#2a2d35] rounded-xl shadow-2xl w-full max-w-[420px] p-5" onClick={(e) => e.stopPropagation()}>
                  {bulkModal === "delete" ? (
                    <>
                      <h3 className="text-[16px] font-semibold text-white mb-2">Delete {selectedIds.size} PPV{selectedIds.size > 1 ? "s" : ""}?</h3>
                      <p className="text-[13px] text-[#9ca3af] mb-5">This permanently removes them from the vault. This can&apos;t be undone.</p>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setBulkModal(null)} className="px-4 py-2 rounded-lg text-[12px] bg-[#1f2937] border border-[#374151] text-white hover:bg-[#252b36]">Cancel</button>
                        <button onClick={doBulkDelete} className="px-4 py-2 rounded-lg text-[12px] bg-red-600 text-white hover:bg-red-700 font-semibold">Delete</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-[16px] font-semibold text-white mb-2">Set caption for {selectedIds.size} PPV{selectedIds.size > 1 ? "s" : ""}</h3>
                      <textarea
                        autoFocus
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        placeholder="Caption / description…"
                        rows={3}
                        className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1] resize-none mb-4"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setBulkModal(null)} className="px-4 py-2 rounded-lg text-[12px] bg-[#1f2937] border border-[#374151] text-white hover:bg-[#252b36]">Cancel</button>
                        <button onClick={() => doBulkSetCaption(captionDraft)} className="px-4 py-2 rounded-lg text-[12px] bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white hover:from-[#5558e3] hover:to-[#4338ca] font-semibold">Apply</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {filteredGroups.length === 0 && filteredStandalone.length === 0 && (
              <div className="text-center py-16 text-[#6b7280]">No matches for the selected filter.</div>
            )}
          </div>
        )}
      </div>

      {showTagManager && agencyUserId && selectedModelId && (
        <TagManagerModal
          modelId={selectedModelId}
          agencyUserId={agencyUserId}
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onChange={setTags}
        />
      )}

      {showCreateGroup && agencyUserId && selectedModelId && (
        <CreateGroupModal
          modelId={selectedModelId}
          agencyUserId={agencyUserId}
          allTags={tags}
          onClose={() => setShowCreateGroup(false)}
          onSave={handleGroupSaved}
        />
      )}

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          allTags={tags}
          onClose={() => setEditingGroup(null)}
          onSave={handleGroupSaved}
          onDelete={handleGroupDeleted}
        />
      )}

      {ppvForm && agencyUserId && selectedModelId && (
        <PpvFormModal
          mode={ppvForm.kind}
          modelId={selectedModelId}
          agencyUserId={agencyUserId}
          groupId={ppvForm.kind === "add" ? ppvForm.groupId : ppvForm.ppv.group_id}
          existing={ppvForm.kind === "edit" ? ppvForm.ppv : null}
          allTags={tags}
          onClose={() => setPpvForm(null)}
          onSave={handlePpvSaved}
          onDelete={ppvForm.kind === "edit" ? handlePpvDeleted : undefined}
        />
      )}
    </div>
  );
}

function PpvCard({ ppv, onClick }: { ppv: PpvItem; onClick: () => void }) {
  // Vault shows the real unblurred content — this is the agency's own view,
  // not the fan-facing pay page. For images: original media_url. For videos:
  // render an actual <video> element (autoplay/muted for thumbnail feel).
  const isVideo = !!ppv.media_url && /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(ppv.media_url);
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-hidden hover:border-[#6366f1]/50 transition-all w-full h-full flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-[#1f2937] flex items-center justify-center overflow-hidden">
        {ppv.media_url && (
          isVideo ? (
            <video
              src={ppv.media_url}
              muted
              loop
              playsInline
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ppv.media_url}
              alt={ppv.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )
        )}
        {isVideo && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded-md text-[10px] font-semibold text-white flex items-center gap-1">
            <span className="text-[8px]">▶</span> Video
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-[13px] font-semibold text-white truncate">{ppv.name}</div>
        {ppv.description && (
          <div className="text-[11px] text-[#9ca3af] line-clamp-2 mt-0.5">{ppv.description}</div>
        )}
        {ppv.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {ppv.tags.map((t) => (
              <span
                key={t.id}
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-0.5"
                style={{ backgroundColor: `${t.color}20`, color: t.color }}
              >
                {t.emoji && <span>{t.emoji}</span>}
                <span>{t.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function GroupCard({
  group,
  onEdit,
  onAddItem,
  onItemClick,
  selectMode = false,
  selectedIds,
  onToggleSel,
}: {
  group: PpvGroup;
  onEdit: () => void;
  onAddItem: () => void;
  onItemClick: (item: PpvItem) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSel?: (id: string) => void;
}) {
  return (
    <div className="bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[#2a2d35] bg-[#1f2937]/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#6366f1]/20 flex items-center justify-center">
            <Folder className="w-5 h-5 text-[#6366f1]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white">{group.name}</span>
              <span className="text-[11px] text-[#6b7280]">· {group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
            </div>
            {group.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {group.tags.map((t) => (
                  <span
                    key={t.id}
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ backgroundColor: `${t.color}20`, color: t.color }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddItem}
            className="px-3 py-1.5 bg-[#1f2937] border border-[#374151] rounded-md text-[12px] font-medium text-white hover:bg-[#374151] transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />Add media
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-[#6b7280] hover:text-white hover:bg-[#2a2d35] rounded-md transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>
      {group.items.length === 0 ? (
        <div className="text-center py-8 text-[#6b7280] text-[13px]">
          Empty group. Click &quot;Add media&quot; to start.
        </div>
      ) : (
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {group.items.map((it) => {
            const sel = !!selectedIds?.has(it.id);
            return (
              <div key={it.id} className={`relative h-full rounded-lg ${selectMode && sel ? "ring-2 ring-[#6366f1]" : ""}`}>
                {selectMode && (
                  <button
                    onClick={() => onToggleSel?.(it.id)}
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                      sel ? "bg-[#6366f1] border-[#6366f1] text-white" : "bg-black/50 border-white/70"
                    }`}
                  >
                    {sel && "✓"}
                  </button>
                )}
                <PpvCard ppv={it} onClick={() => (selectMode ? onToggleSel?.(it.id) : onItemClick(it))} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
