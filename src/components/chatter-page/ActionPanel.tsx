"use client";

import { Check, Folder, ChevronLeft } from "lucide-react";
import { useState } from "react";

export interface PpvTag {
  id: string;
  name: string;
  emoji?: string | null;
  color?: string | null;
  model_id: string;
}

export interface PpvItem {
  id: string;
  name: string;
  price: number | string;
  media_url?: string | null;
  group_id?: string | null;
  tags: PpvTag[];
}

export interface PpvGroup {
  id: string;
  name: string;
}

type Tab = "ppv" | "tips" | "notes" | "stats";

interface ActionPanelProps {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  ppvItems: PpvItem[];
  ppvTags: PpvTag[];
  ppvGroups: PpvGroup[];
  activeFilter: string;
  onFilterChange: (f: string) => void;
  selectedItems: string[];
  onToggleItem: (id: string) => void;
  caption: string;
  onCaptionChange: (v: string) => void;
  totalPrice: number;
  recipientLabel: string;
  sending: boolean;
  onSendPpv: () => void;
  tipAmount: string;
  onTipAmountChange: (v: string) => void;
  tipMessage: string;
  onTipMessageChange: (v: string) => void;
  onSendTip: () => void;
  notes: string;
  onNotesChange: (v: string) => void;
  hasRecipient: boolean;
}

export function ActionPanel({
  activeTab,
  onTabChange,
  ppvItems,
  ppvTags,
  ppvGroups,
  activeFilter,
  onFilterChange,
  selectedItems,
  onToggleItem,
  caption,
  onCaptionChange,
  totalPrice,
  recipientLabel,
  sending,
  onSendPpv,
  tipAmount,
  onTipAmountChange,
  tipMessage,
  onTipMessageChange,
  onSendTip,
  notes,
  onNotesChange,
  hasRecipient,
}: ActionPanelProps) {
  // Navigation: null = root (folders + orphan files), or a specific group id.
  // We only nav into one folder at a time — no nested folders in the schema.
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const currentFolder = currentFolderId
    ? ppvGroups.find((g) => g.id === currentFolderId) ?? null
    : null;

  // Scope items to the current view: at root → only orphans (group_id null);
  // inside a folder → only items belonging to that folder.
  const scopedItems = currentFolderId
    ? ppvItems.filter((i) => i.group_id === currentFolderId)
    : ppvItems.filter((i) => !i.group_id);

  // Apply tag filter on top of the scoped view.
  const filteredItems =
    activeFilter === "All"
      ? scopedItems
      : scopedItems.filter((i) => i.tags.some((t) => t.id === activeFilter));

  // Item counts per folder, used in the folder-tile badge at root.
  function itemCountInGroup(groupId: string): number {
    return ppvItems.filter((i) => i.group_id === groupId).length;
  }

  return (
    <div className="w-[30%] bg-[#161a22] flex flex-col">
      {/* Tabs — medium (pre-shrink) */}
      <div className="h-[34px] border-b border-[#2a2d35] flex">
        {(["ppv", "tips", "notes", "stats"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 text-[9px] font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === tab
                ? "text-[#6366f1] border-[#6366f1] bg-[#1a1d24]"
                : "text-[#6b7280] border-transparent hover:text-[#9ca3af] hover:bg-[#1a1d24]/50"
            }`}
          >
            {tab === "ppv" ? "Send PPV" : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "ppv" && (
          <div className="space-y-3">
            {/* Breadcrumb / back button — only inside a folder */}
            {currentFolder && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#9ca3af] hover:text-white hover:bg-[#1f2937] transition-colors"
                  aria-label="Back to root"
                >
                  <ChevronLeft className="w-3 h-3" />
                  Back
                </button>
                <div className="flex items-center gap-1 text-[10px] text-[#9ca3af] min-w-0">
                  <Folder className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate font-medium text-white">{currentFolder.name}</span>
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onFilterChange("All")}
                className={`px-2.5 py-1 rounded text-[9px] font-medium border transition-all ${
                  activeFilter === "All"
                    ? "bg-[#6366f1] text-white border-[#6366f1] shadow-sm"
                    : "bg-transparent text-[#9ca3af] border-[#374151] hover:border-[#4b5563] hover:text-[#d1d5db]"
                }`}
              >
                All
              </button>
              {ppvTags.map((tag) => {
                const isActive = activeFilter === tag.id;
                const label = tag.emoji ? `${tag.emoji} ${tag.name}` : tag.name;
                return (
                  <button
                    key={tag.id}
                    onClick={() => onFilterChange(isActive ? "All" : tag.id)}
                    className={`px-2.5 py-1 rounded text-[9px] font-medium border transition-all ${
                      isActive
                        ? "bg-[#6366f1] text-white border-[#6366f1] shadow-sm"
                        : "bg-transparent text-[#9ca3af] border-[#374151] hover:border-[#4b5563] hover:text-[#d1d5db]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Grid: folders first (only at root), then files */}
            <div className="grid grid-cols-3 gap-2">
              {/* Folder tiles — only when at root and there are groups */}
              {!currentFolderId &&
                ppvGroups.map((group) => {
                  const count = itemCountInGroup(group.id);
                  return (
                    <button
                      key={`folder-${group.id}`}
                      onClick={() => setCurrentFolderId(group.id)}
                      className="relative aspect-square rounded-md border-2 border-[#2a2d35] hover:border-[#6366f1]/50 transition-all overflow-hidden bg-gradient-to-br from-[#1f2937] to-[#111827] flex flex-col items-center justify-center group"
                    >
                      <Folder className="w-8 h-8 text-[#6366f1] group-hover:scale-110 transition-transform" />
                      <div className="text-[9px] text-white font-medium mt-2 truncate max-w-full px-2">
                        {group.name}
                      </div>
                      <div className="text-[8px] text-[#6b7280] mt-0.5">
                        {count} {count === 1 ? "item" : "items"}
                      </div>
                    </button>
                  );
                })}

              {/* PPV file tiles */}
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onToggleItem(item.id)}
                  className={`relative aspect-square rounded-md border-2 transition-all overflow-hidden group ${
                    selectedItems.includes(item.id)
                      ? "border-[#6366f1] ring-2 ring-[#6366f1]/20"
                      : "border-[#2a2d35] hover:border-[#374151]"
                  }`}
                >
                  {item.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.media_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-gradient-to-br from-[#1f2937] to-[#111827]"
                      style={{ filter: "blur(6px)" }}
                    />
                  )}
                  {selectedItems.includes(item.id) && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#6366f1] rounded-full flex items-center justify-center shadow-lg">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                    <div className="text-[8px] text-white truncate font-medium">
                      {item.name}
                    </div>
                    <div className="text-[9px] font-bold text-[#6366f1]">
                      ${item.price}
                    </div>
                  </div>
                </button>
              ))}

              {/* Empty state — folder is empty, or no orphan files at root */}
              {filteredItems.length === 0 &&
                (currentFolderId || ppvGroups.length === 0) && (
                  <div className="col-span-3 py-6 text-center text-[10px] text-[#6b7280]">
                    {currentFolderId
                      ? "This folder is empty"
                      : ppvItems.length === 0
                        ? "No PPV items yet"
                        : "No items matching this filter"}
                  </div>
                )}
            </div>

            {/* Send section */}
            {selectedItems.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-[#2a2d35]">
                <div>
                  <label className="text-[10px] text-[#9ca3af] font-medium mb-1.5 block">
                    Message Caption
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => onCaptionChange(e.target.value)}
                    placeholder="Add a message to send with the PPV..."
                    className="w-full px-2.5 py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#6366f1]"
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#9ca3af] font-medium">
                    Total Price
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={`$${totalPrice}`}
                      readOnly
                      className="w-16 px-2.5 py-1 bg-[#1f2937] border border-[#374151] rounded text-[11px] text-right text-white font-semibold focus:outline-none focus:border-[#6366f1]"
                    />
                    <span className="text-[9px] text-[#6b7280]">
                      {selectedItems.length} items
                    </span>
                  </div>
                </div>

                <button
                  onClick={onSendPpv}
                  disabled={!hasRecipient || sending}
                  className="w-full py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-md font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "Sending…" : `Send PPV to ${recipientLabel}`}
                </button>

                <div className="text-[9px] text-[#6b7280] text-center leading-relaxed">
                  Sends blurred preview + pay link directly into fan&apos;s
                  Telegram DM. Fan pays → content unlocks automatically.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tips" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {["$5", "$10", "$20"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => onTipAmountChange(amount.replace("$", ""))}
                  className="py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] font-semibold text-white hover:bg-[#374151] hover:border-[#4b5563] transition-all"
                >
                  {amount}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {["$50", "$100"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => onTipAmountChange(amount.replace("$", ""))}
                  className="py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] font-semibold text-white hover:bg-[#374151] hover:border-[#4b5563] transition-all"
                >
                  {amount}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={tipAmount}
              onChange={(e) =>
                onTipAmountChange(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder="Custom amount..."
              className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
            <textarea
              value={tipMessage}
              onChange={(e) => onTipMessageChange(e.target.value)}
              placeholder="Optional message..."
              className="w-full px-3 py-2 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#6366f1]"
              rows={2}
            />
            <button
              onClick={onSendTip}
              disabled={!hasRecipient || !tipAmount || sending}
              className="w-full py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-md font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : `Request tip from ${recipientLabel}`}
            </button>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-2.5">
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Notes about this fan..."
              className="w-full h-[180px] px-3 py-2.5 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#6366f1]"
            />
            <button className="px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-md font-semibold text-[11px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20">
              Save Notes
            </button>
          </div>
        )}

        {activeTab === "stats" && (
          <div className="space-y-1">
            {[
              { label: "Today net", value: "$0" },
              { label: "All time net", value: "$0" },
              { label: "Messages today", value: "0" },
              { label: "Messages all time", value: "0" },
              { label: "Total sales", value: "$0" },
              { label: "My sales this month", value: "$0" },
              { label: "Unlocks", value: "0" },
              { label: "Tips generated", value: "$0" },
            ].map((stat, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 px-2.5 bg-[#1f2937]/30 rounded-md border border-[#2a2d35] hover:bg-[#1f2937]/50 transition-colors"
              >
                <span className="text-[11px] text-[#9ca3af] font-medium">
                  {stat.label}
                </span>
                <span className="text-[12px] font-bold text-white">
                  {stat.value}
                </span>
              </div>
            ))}
            <div className="text-[9px] text-[#6b7280] pt-2 text-center">
              Commission set by your agency.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
