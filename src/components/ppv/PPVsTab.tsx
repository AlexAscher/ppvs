"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, FolderPlus, Tag, ChevronDown, Pencil, Folder } from "lucide-react";
import { createClient } from "@/lib/supabase";
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
              <h3 className="text-[18px] font-semibold text-white mb-2">No models connected</h3>
              <p className="text-[14px] text-[#9ca3af]">Add a model in the Models tab before creating PPVs.</p>
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
                <span>{selectedModel?.name ?? "Select model"}</span>
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
                  />
                ))}
              </div>
            )}

            {filteredStandalone.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-[14px] font-semibold text-[#9ca3af] uppercase tracking-wider">Individual PPVs</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredStandalone.map((p) => (
                    <PpvCard key={p.id} ppv={p} onClick={() => setPpvForm({ kind: "edit", ppv: p })} />
                  ))}
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
  // Video originals can't be shown as <img>, so prefer the pre-captured
  // blurred poster frame (`preview_url`) for any media. For images both
  // URLs point at a JPEG of the same content, so it doesn't matter much.
  const isVideo = !!ppv.media_url && /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(ppv.media_url);
  const tileSrc = isVideo ? ppv.preview_url : (ppv.preview_url || ppv.media_url);
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[#161a22] border border-[#2a2d35] rounded-lg overflow-hidden hover:border-[#6366f1]/50 transition-all"
    >
      <div className="relative aspect-[4/3] bg-[#1f2937] flex items-center justify-center">
        <span className="text-[40px] select-none">🔒</span>
        {tileSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tileSrc}
            alt={ppv.name}
            className="absolute inset-0 w-full h-full object-cover"
            // Missing/deleted media → hide broken image, the 🔒 shows through.
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        {isVideo && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded-md text-[10px] font-semibold text-white flex items-center gap-1">
            <span className="text-[8px]">▶</span> Video
          </div>
        )}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-md text-[12px] font-bold text-white">
          ${ppv.price.toFixed(2)}
        </div>
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
}: {
  group: PpvGroup;
  onEdit: () => void;
  onAddItem: () => void;
  onItemClick: (item: PpvItem) => void;
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
          {group.items.map((it) => (
            <PpvCard key={it.id} ppv={it} onClick={() => onItemClick(it)} />
          ))}
        </div>
      )}
    </div>
  );
}
