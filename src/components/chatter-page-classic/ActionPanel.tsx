"use client";

import { Check, Folder, ChevronLeft } from "lucide-react";
import { useState } from "react";

/**
 * Classic ActionPanel — pixel match of Create_prompt_design/ActionPanel.tsx
 * (tabs h-[44px] text-[10px], filters px-3 py-1.5 text-[10px] rounded-md,
 * grid gap-2.5 rounded-lg, item title text-[9px] price text-[10px], check
 * w-6 h-6, send section py-3 text-[13px], notes h-[200px]).
 *
 * Behaviour additions on top of the design:
 *   - Real PPV data (filter chips from `ppv_tags`, item grid from `ppvs`).
 *   - Folder navigation: groups render as folder tiles at root + back btn.
 *   - All other tabs (Tips, Notes, Stats) wired to live state.
 */

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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const currentFolder = currentFolderId
    ? ppvGroups.find((g) => g.id === currentFolderId) ?? null
    : null;

  const scopedItems = currentFolderId
    ? ppvItems.filter((i) => i.group_id === currentFolderId)
    : ppvItems.filter((i) => !i.group_id);

  const filteredItems =
    activeFilter === "All"
      ? scopedItems
      : scopedItems.filter((i) => i.tags.some((t) => t.id === activeFilter));

  function itemCountInGroup(groupId: string): number {
    return ppvItems.filter((i) => i.group_id === groupId).length;
  }

  return (
    <div className="w-[30%] bg-[#161a22] flex flex-col">
      {/* Tabs — h-[44px] text-[10px] from design */}
      <div className="h-[44px] border-b border-[#2a2d35] flex">
        {(["ppv", "tips", "notes", "stats"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === tab
                ? "text-[#6366f1] border-[#6366f1] bg-[#1a1d24]"
                : "text-[#6b7280] border-transparent hover:text-[#9ca3af] hover:bg-[#1a1d24]/50"
            }`}
          >
            {tab === "ppv" ? "Send PPV" : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "ppv" && (
          <div className="space-y-4">
            {/* Folder breadcrumb (only inside a folder) */}
            {currentFolder && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#9ca3af] hover:text-white hover:bg-[#1f2937] transition-colors"
                  aria-label="Back to root"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <div className="flex items-center gap-1.5 text-[11px] text-[#9ca3af] min-w-0">
                  <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate font-medium text-white">{currentFolder.name}</span>
                </div>
              </div>
            )}

            {/* Filter chips — px-3 py-1.5 text-[10px] rounded-md from design */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onFilterChange("All")}
                className={`px-3 py-1.5 rounded-md text-[10px] font-medium border transition-all ${
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
                    className={`px-3 py-1.5 rounded-md text-[10px] font-medium border transition-all ${
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

            {/* Grid — gap-2.5 rounded-lg from design, folders first at root */}
            <div className="grid grid-cols-3 gap-2.5">
              {!currentFolderId &&
                ppvGroups.map((group) => {
                  const count = itemCountInGroup(group.id);
                  return (
                    <button
                      key={`folder-${group.id}`}
                      onClick={() => setCurrentFolderId(group.id)}
                      className="relative aspect-square rounded-lg border-2 border-[#2a2d35] hover:border-[#6366f1]/50 transition-all overflow-hidden bg-gradient-to-br from-[#1f2937] to-[#111827] flex flex-col items-center justify-center group"
                    >
                      <Folder className="w-10 h-10 text-[#6366f1] group-hover:scale-110 transition-transform" />
                      <div className="text-[10px] text-white font-medium mt-2 truncate max-w-full px-2">
                        {group.name}
                      </div>
                      <div className="text-[9px] text-[#6b7280] mt-0.5">
                        {count} {count === 1 ? "item" : "items"}
                      </div>
                    </button>
                  );
                })}

              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onToggleItem(item.id)}
                  className={`relative aspect-square rounded-lg border-2 transition-all overflow-hidden group ${
                    selectedItems.includes(item.id)
                      ? "border-[#6366f1] ring-2 ring-[#6366f1]/20"
                      : "border-[#2a2d35] hover:border-[#374151]"
                  }`}
                >
                  {item.media_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.media_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full bg-gradient-to-br from-[#1f2937] to-[#111827]"
                      style={{ filter: "blur(6px)" }}
                    />
                  )}
                  {selectedItems.includes(item.id) && (
                    <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-[#6366f1] rounded-full flex items-center justify-center shadow-lg">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="text-[9px] text-white truncate font-medium">{item.name}</div>
                    <div className="text-[10px] font-bold text-[#6366f1]">${item.price}</div>
                  </div>
                </button>
              ))}

              {filteredItems.length === 0 && (currentFolderId || ppvGroups.length === 0) && (
                <div className="col-span-3 py-8 text-center text-[11px] text-[#6b7280]">
                  {currentFolderId
                    ? "This folder is empty"
                    : ppvItems.length === 0
                      ? "No PPV items yet"
                      : "No items matching this filter"}
                </div>
              )}
            </div>

            {/* Send section — py-3 text-[13px] from design */}
            {selectedItems.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-[#2a2d35]">
                <div>
                  <label className="text-[11px] text-[#9ca3af] font-medium mb-2 block">
                    Message Caption
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => onCaptionChange(e.target.value)}
                    placeholder="Add a message to send with the PPV..."
                    className="w-full px-3 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#6366f1]"
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#9ca3af] font-medium">Total Price</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={`$${totalPrice}`}
                      readOnly
                      className="w-20 px-3 py-1.5 bg-[#1f2937] border border-[#374151] rounded-md text-[12px] text-right text-white font-semibold focus:outline-none focus:border-[#6366f1]"
                    />
                    <span className="text-[10px] text-[#6b7280]">{selectedItems.length} items</span>
                  </div>
                </div>

                <button
                  onClick={onSendPpv}
                  disabled={!hasRecipient || sending}
                  className="w-full py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[13px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "Sending…" : `Send PPV to ${recipientLabel}`}
                </button>

                <div className="text-[10px] text-[#6b7280] text-center leading-relaxed">
                  Sends blurred preview + pay link directly into fan&apos;s Telegram DM.
                  Fan pays → content unlocks automatically.
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tips" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {["$5", "$10", "$20"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => onTipAmountChange(amount.replace("$", ""))}
                  className="py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] font-semibold text-white hover:bg-[#374151] hover:border-[#4b5563] transition-all"
                >
                  {amount}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {["$50", "$100"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => onTipAmountChange(amount.replace("$", ""))}
                  className="py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] font-semibold text-white hover:bg-[#374151] hover:border-[#4b5563] transition-all"
                >
                  {amount}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={tipAmount}
              onChange={(e) => onTipAmountChange(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="Custom amount..."
              className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
            <textarea
              value={tipMessage}
              onChange={(e) => onTipMessageChange(e.target.value)}
              placeholder="Optional message..."
              className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#6366f1]"
              rows={2}
            />
            <button
              onClick={onSendTip}
              disabled={!hasRecipient || !tipAmount || sending}
              className="w-full py-3 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[13px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : `Request tip from ${recipientLabel}`}
            </button>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Notes about this fan..."
              className="w-full h-[200px] px-4 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#6366f1]"
            />
            <button className="px-5 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[12px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20">
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
                className="flex items-center justify-between py-3 px-3 bg-[#1f2937]/30 rounded-lg border border-[#2a2d35] hover:bg-[#1f2937]/50 transition-colors"
              >
                <span className="text-[12px] text-[#9ca3af] font-medium">{stat.label}</span>
                <span className="text-[13px] font-bold text-white">{stat.value}</span>
              </div>
            ))}
            <div className="text-[10px] text-[#6b7280] pt-3 text-center">
              Commission set by your agency.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
