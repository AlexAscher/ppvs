"use client";

import { Check, Folder, ChevronLeft, Trash2, Plus, Music, Clock, Smile, Maximize2 } from "lucide-react";
import { useRef, useState } from "react";
import type { FanNote, FanRow } from "@/lib/fan-types";
import { SchedulePopover, formatScheduleShort } from "./SchedulePopover";
import { EmojiPicker } from "../chatter-page/EmojiPicker";
import { FanInfoBlock } from "./FanInfoBlock";
import { PpvLightbox } from "../ppv/PpvLightbox";
import type { PpvItem as VaultPpvItem } from "../ppv/types";
import { useCursorInsert } from "@/lib/insert-at-cursor";

/**
 * Adapt the chatter-page's local PpvItem shape (a subset — no description,
 * created_at, model_id, etc.) to the VaultPpvItem the lightbox expects.
 * The lightbox only reads id / name / media_url; everything else is either
 * derived from media_url or optional.
 */
function toVaultItem(it: PpvItem): VaultPpvItem {
  return {
    id: it.id,
    name: it.name,
    media_url: it.media_url ?? null,
    preview_url: it.preview_url ?? null,
    description: null,
    price: typeof it.price === "number" ? it.price : Number(it.price) || 0,
    model_id: "",
    group_id: it.group_id ?? null,
    created_at: "",
    tags: [],
  };
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  /** Pre-blurred JPEG poster — see chatter-page/ActionPanel for rationale. */
  preview_url?: string | null;
  /** Crisp cached poster (immutable). Present on new uploads; when set, video
   *  tiles render it as a static <img> instead of a live <video>. */
  thumb_url?: string | null;
  group_id?: string | null;
  tags: PpvTag[];
}

export interface PpvGroup {
  id: string;
  name: string;
  /** When set, the whole group can be sold as one unlock at this price. */
  bundle_price?: number | null;
}

type Tab = "ppv" | "tips" | "notes" | "stats";

// Tab labels mirror the main-site feature names. The keys keep their original
// meaning (ppv = send PPVs, tips = request tips, notes = fan info, stats =
// dashboard) so all the wiring below is untouched — only the displayed label
// changes.
const TAB_LABELS: Record<Tab, string> = {
  ppv: "Sales Workspace",
  tips: "Request Tips",
  notes: "Fan Information",
  stats: "Dashboard",
};

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
  /** Raw user input, kept as a string so $X.XX cents work. Empty == 0 (free). */
  priceInput: string;
  onPriceInputChange: (v: string) => void;
  /** Smart-pricing hint string (avg / common range / top sale). */
  pricingHint?: string;
  /** Urgency timer (hours until the pay link dies). 0 = no expiry. */
  expiresInHours: number;
  onExpiresInHoursChange: (n: number) => void;
  /** Select every item in a group + set the bundle price, in one click. */
  onSelectBundle?: (itemIds: string[], price: number) => void;
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
  onAddNote: () => void;
  notesSaving: boolean;
  notesList: FanNote[];
  onDeleteNote: (id: string) => void;
  stats: StatsView | null;
  /** Schedule send (UNIX seconds). Shared by PPV + Tip actions. */
  scheduleAt?: number | null;
  onChangeScheduleAt?: (ts: number | null) => void;
  /** Quick-emoji shortcuts (same list the main composer uses) — rendered as a
   *  one-tap insert strip above the PPV caption + Tip message fields. */
  quickEmojis?: string[];
  /** Context for the "Fan Information" tab profile/stats block. */
  fanInfoModelId?: string | null;
  fanInfoPeerId?: string | null;
  fan?: FanRow | null;
}

export type StatsView = {
  todayNet: number;
  allTimeNet: number;
  todayNetAfterCut: number;
  allTimeNetAfterCut: number;
  todaySales: number;
  allTimeSales: number;
  unlocks: number;
  todayMessages: number;
  allTimeMessages: number;
};

function fmtDollars(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
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
  priceInput,
  onPriceInputChange,
  pricingHint,
  expiresInHours,
  onExpiresInHoursChange,
  onSelectBundle,
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
  onAddNote,
  notesSaving,
  notesList,
  onDeleteNote,
  stats,
  scheduleAt = null,
  onChangeScheduleAt,
  quickEmojis,
  fanInfoModelId = null,
  fanInfoPeerId = null,
  fan = null,
}: ActionPanelProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [ppvScheduleOpen, setPpvScheduleOpen] = useState(false);
  const [tipScheduleOpen, setTipScheduleOpen] = useState(false);
  const [tipEmojiOpen, setTipEmojiOpen] = useState(false);
  const [captionEmojiOpen, setCaptionEmojiOpen] = useState(false);
  // Full-screen viewer for the PPV picker — chatter clicks the small
  // maximize badge to preview the original before sending. Arrows page
  // through the currently-scoped list (same items the grid shows).
  const [lightbox, setLightbox] = useState<{ items: VaultPpvItem[]; index: number } | null>(null);
  // Caret-tracking refs so emojis inserted from either the quick strip or
  // the picker land at the cursor position instead of always at the end.
  // Separate refs per field — caption and tip message have their own
  // textareas and users may have distinct caret positions in each.
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const tipMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const captionInsert = useCursorInsert(captionRef);
  const tipInsert = useCursorInsert(tipMessageRef);
  const currentFolder = currentFolderId
    ? ppvGroups.find((g) => g.id === currentFolderId) ?? null
    : null;

  // Free send when input is empty or parses to 0 — backend sends originals
  // straight to TG without a pay link.
  const parsedPrice = Number(priceInput);
  const isFree = !priceInput.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0;
  // Telegram's sendPaidMedia hard-limits star_count to 10 000 — anything above
  // returns EXTENDED_MEDIA_AMOUNT_INVALID. Gate the Send button so the chatter
  // can't even attempt it.
  const MAX_STARS_PER_SEND = 10_000;
  const overStarCap =
    Number.isFinite(parsedPrice) && parsedPrice > MAX_STARS_PER_SEND;

  // Root view = standalone items PLUS any "orphaned" item whose group_id no
  // longer matches a loaded group (group deleted but item kept the id, or the
  // groups list is a subset). Without this an approved PPV with a dangling
  // group_id renders NOWHERE — not under a folder (none matches) and not at
  // root — which is exactly how a model's items could show in the Vault but
  // vanish from the send picker.
  const knownGroupIds = new Set(ppvGroups.map((g) => g.id));
  const scopedItems = currentFolderId
    ? ppvItems.filter((i) => i.group_id === currentFolderId)
    : ppvItems.filter((i) => !i.group_id || !knownGroupIds.has(i.group_id));

  const filteredItems =
    activeFilter === "All"
      ? scopedItems
      : scopedItems.filter((i) => i.tags.some((t) => t.id === activeFilter));

  // One-tap quick-emoji strip — same shortcut list the main message composer
  // shows, surfaced on the PPV caption + Tip message fields so the chatter
  // gets the same fast emoji access everywhere they type.
  const quickEmojiRow = (onInsert: (em: string) => void) => {
    if (!Array.isArray(quickEmojis) || quickEmojis.length === 0) return null;
    return (
      <div className="flex items-center gap-1 flex-wrap mt-2">
        {quickEmojis.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => onInsert(em)}
            title="Insert emoji"
            className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-[16px] leading-none hover:bg-[#1f2937] transition-colors"
          >
            {em}
          </button>
        ))}
      </div>
    );
  };

  function itemCountInGroup(groupId: string): number {
    return ppvItems.filter((i) => i.group_id === groupId).length;
  }

  return (
    <div className="w-full xl:w-[30%] xl:shrink-0 bg-[#161a22] border-l border-[#2a2d35] flex flex-col">
      {/* Tabs — h-[44px] text-[10px] exactly per Create_prompt_design.
          Labels match the main-site feature names (no emoji in the chatter
          per the user's spec): Sales Workspace / Request Tips / Fan
          Information / Dashboard. */}
      <div className="h-[44px] border-b border-[#2a2d35] flex">
        {/* "tips" tab hidden — Tips functionality is temporarily disabled
            platform-wide. Backend left intact so it can be re-enabled later
            by re-adding the tab id here. */}
        {(["ppv", "notes", "stats"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === tab
                ? "text-[#00AFF0] border-[#00AFF0] bg-[#1a1d24]"
                : "text-[#6b7280] border-transparent hover:text-[#9ca3af] hover:bg-[#1a1d24]/50"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className={`flex-1 ${activeTab === "ppv" ? "flex flex-col min-h-0" : "overflow-y-auto"} p-4`}>
        {activeTab === "ppv" && (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
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

            {/* Bundle offer — one click selects every item in the group and
                sets the agency's bundle price, ready to send as one unlock. */}
            {currentFolder && !!currentFolder.bundle_price && currentFolder.bundle_price > 0 && onSelectBundle && (
              <button
                onClick={() => {
                  const ids = ppvItems.filter((i) => i.group_id === currentFolder.id).map((i) => i.id);
                  if (ids.length) onSelectBundle(ids, currentFolder.bundle_price!);
                }}
                className="w-full py-2.5 rounded-lg text-[12px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                🎁 Sell bundle · ${Number(currentFolder.bundle_price).toFixed(2)}
                <span className="opacity-80">· {itemCountInGroup(currentFolder.id)} items</span>
              </button>
            )}

            {/* Filter chips — px-3 py-1.5 text-[10px] rounded-md from design */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onFilterChange("All")}
                className={`px-3 py-1.5 rounded-md text-[10px] font-medium border transition-all ${
                  activeFilter === "All"
                    ? "bg-[#00AFF0] text-white border-[#00AFF0] shadow-sm"
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
                        ? "bg-[#00AFF0] text-white border-[#00AFF0] shadow-sm"
                        : "bg-transparent text-[#9ca3af] border-[#374151] hover:border-[#4b5563] hover:text-[#d1d5db]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Grid — gap-2.5 rounded-lg from design, folders first at root.
                Scrolls independently so the Send section stays pinned. */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
            <div className="grid grid-cols-3 gap-2.5">
              {!currentFolderId &&
                ppvGroups.map((group) => {
                  const count = itemCountInGroup(group.id);
                  return (
                    <button
                      key={`folder-${group.id}`}
                      onClick={() => setCurrentFolderId(group.id)}
                      className="relative aspect-square rounded-lg border-2 border-[#2a2d35] hover:border-[#00AFF0]/50 transition-all overflow-hidden bg-gradient-to-br from-[#1f2937] to-[#111827] flex flex-col items-center justify-center group"
                    >
                      <Folder className="w-10 h-10 text-[#00AFF0] group-hover:scale-110 transition-transform" />
                      <div className="text-[12px] text-white font-medium mt-2 truncate max-w-full px-2">
                        {group.name}
                      </div>
                      <div className="text-[11px] text-[#6b7280] mt-0.5">
                        {count} {count === 1 ? "item" : "items"}
                      </div>
                    </button>
                  );
                })}

              {filteredItems.map((item) => {
                const isVid = !!item.media_url && /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(item.media_url);
                const isAud = !!item.media_url && /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|$)/i.test(item.media_url);
                const isSel = selectedItems.includes(item.id);
                return (
                <div
                  key={item.id}
                  onClick={() => onToggleItem(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleItem(item.id);
                    }
                  }}
                  className={`relative aspect-square rounded-lg border-2 transition-all overflow-hidden group bg-gradient-to-br from-[#1f2937] to-[#111827] cursor-pointer ${
                    isSel
                      ? "border-[#00AFF0] ring-2 ring-[#00AFF0]/20"
                      : "border-[#2a2d35] hover:border-[#374151]"
                  }`}
                >
                  {item.media_url && (
                    isAud ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-8 h-8 text-[#00AFF0]" />
                      </div>
                    ) : isVid ? (
                      item.thumb_url ? (
                        // New uploads ship a crisp poster (thumb_url): serve it
                        // via the immutable-cached thumb endpoint — instant on
                        // re-open, zero repeat egress, same as a photo tile.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/ppv/thumb/${item.id}`}
                          alt={item.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        // Legacy video with no poster — render the first frame
                        // live (moov atom + first frames only). Crisp, but
                        // re-fetched each mount since browsers don't cache
                        // partial video ranges. Heals on re-upload.
                        <video
                          src={`/api/ppv/file/${item.id}?kind=original`}
                          preload="metadata"
                          muted
                          playsInline
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      )
                    ) : (
                      // Static image tile — thumb endpoint returns a crisp
                      // 400px JPEG (batch 99+) or falls through to the
                      // original for older image rows.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/ppv/thumb/${item.id}`}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )
                  )}
                  {isVid && (
                    <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/70 rounded text-[8px] font-semibold text-white">
                      ▶
                    </div>
                  )}
                  {isAud && (
                    <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/70 rounded text-[8px] font-semibold text-white">
                      ♪
                    </div>
                  )}
                  {/* Persistent select-circle: always visible so the chatter
                      can see at a glance what's selectable. Click on the
                      circle OR anywhere else on the tile toggles selection. */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleItem(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        onToggleItem(item.id);
                      }
                    }}
                    aria-label={isSel ? "Deselect" : "Select"}
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition-all shadow ${
                      isSel
                        ? "bg-[#00AFF0] border-[#00AFF0]"
                        : "bg-black/45 border-white/70 hover:bg-black/70"
                    }`}
                  >
                    {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pr-9 pointer-events-none">
                    <div className="text-[11px] text-white truncate font-medium">{item.name}</div>
                  </div>
                  {/* Open-full-size: shows the original in a lightbox WITHOUT
                      selecting the item, so a chatter can preview before
                      committing to send. Rendered AFTER the name-gradient
                      overlay so it stacks on top and pointer-events land
                      here instead of the label div. */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      const idx = filteredItems.findIndex((it) => it.id === item.id);
                      setLightbox({ items: filteredItems.map(toVaultItem), index: Math.max(0, idx) });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        const idx = filteredItems.findIndex((it) => it.id === item.id);
                        setLightbox({ items: filteredItems.map(toVaultItem), index: Math.max(0, idx) });
                      }
                    }}
                    aria-label="Open full-size"
                    title="Open full-size"
                    className="absolute bottom-1.5 right-1.5 z-10 w-6 h-6 flex items-center justify-center rounded-md bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white transition-colors cursor-pointer"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </span>
                </div>
                );
              })}

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
            </div>

            {/* Send section — sticky at bottom: caption / price / send
                stay visible no matter how far the chatter scrolls. */}
            {selectedItems.length > 0 && (
              <div className="shrink-0 space-y-3 pt-4 border-t border-[#2a2d35] bg-[#161a22]">
                <div>
                  <label className="text-[11px] text-[#9ca3af] font-medium mb-2 block">
                    Message Caption
                  </label>
                  <div className="relative">
                    <textarea
                      ref={captionRef}
                      value={caption}
                      onChange={(e) => onCaptionChange(e.target.value)}
                      {...captionInsert.bind}
                      placeholder="Add a message to send with the PPV..."
                      className="w-full px-3 py-2.5 pr-10 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#00AFF0]"
                      rows={2}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCaptionEmojiOpen((v) => !v);
                      }}
                      title="Add emoji"
                      aria-label="Add emoji"
                      className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                        captionEmojiOpen ? "text-[#00AFF0]" : "text-[#9ca3af] hover:text-white"
                      }`}
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    {captionEmojiOpen && (
                      <EmojiPicker
                        anchored
                        onSelect={(em) => captionInsert.insert(caption, onCaptionChange, em)}
                        onClose={() => setCaptionEmojiOpen(false)}
                      />
                    )}
                  </div>
                  {quickEmojiRow((em) => captionInsert.insert(caption, onCaptionChange, em))}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#9ca3af] font-medium">Price</span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#6b7280] pointer-events-none">⭐</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={priceInput}
                        onChange={(e) => {
                          // Stars are integer.
                          const clean = e.target.value.replace(/[^0-9]/g, "");
                          onPriceInputChange(clean);
                        }}
                        placeholder="0"
                        className="w-28 pl-3 pr-7 py-1.5 bg-[#1f2937] border border-[#374151] rounded-md text-[12px] text-right text-white font-semibold focus:outline-none focus:border-[#00AFF0]"
                      />
                    </div>
                    <span className="text-[11px] text-[#6b7280] tabular-nums">
                      {parsedPrice > 0 ? `(≈ $${(parsedPrice * 0.01105).toFixed(2)})` : `${selectedItems.length} items`}
                    </span>
                  </div>
                </div>


                {/* Pricing hint (avg / most common / top) removed per user
                    request — was visually noisy and the chatter rarely
                    referenced it. The data still lives in /api/ppv/pricing-stats
                    so we can resurrect it later if needed. */}

                <div className="flex gap-2">
                  <button
                    onClick={onSendPpv}
                    disabled={!hasRecipient || sending || overStarCap}
                    className={`flex-1 py-3 text-white rounded-lg font-semibold text-[13px] transition-all shadow-lg disabled:cursor-not-allowed ${
                      overStarCap
                        ? "bg-[#374151] text-[#9ca3af] shadow-none"
                        : "disabled:opacity-50 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] hover:from-[#0098D4] hover:to-[#0098D4] shadow-[#00AFF0]/20"
                    }`}
                  >
                    {sending
                      ? "Sending…"
                      : scheduleAt
                        ? `Schedule · ${formatScheduleShort(scheduleAt)}`
                        : `Send to ${recipientLabel}`}
                  </button>
                  {onChangeScheduleAt && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setPpvScheduleOpen((v) => !v)}
                        disabled={!hasRecipient || sending}
                        title={scheduleAt ? "Edit schedule" : "Schedule send"}
                        className={`w-11 h-full flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          scheduleAt
                            ? "bg-[#00AFF0]/20 text-[#00AFF0] ring-1 ring-[#00AFF0]"
                            : "bg-[#1f2937] text-[#9ca3af] hover:text-white hover:bg-[#374151]"
                        }`}
                        aria-label="Schedule send"
                      >
                        <Clock className="w-5 h-5" />
                      </button>
                      {ppvScheduleOpen && (
                        <SchedulePopover
                          current={scheduleAt}
                          align="right"
                          onPick={(ts) => {
                            onChangeScheduleAt(ts);
                            setPpvScheduleOpen(false);
                          }}
                          onClose={() => setPpvScheduleOpen(false)}
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-[#6b7280] text-center leading-relaxed">
                  {overStarCap
                    ? "Maximum total star price set by Telegram is 10000 stars."
                    : scheduleAt
                      ? `Will be delivered at ${formatScheduleShort(scheduleAt)}.`
                      : isFree
                        ? "Free send: originals go straight to fan's Telegram, no pay link."
                        : "Sends blurred preview to the fan. Unlocks on payment."}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tips" && (
          <div className="space-y-4">
            {/* Receipt preview — the agency sees the running tip total as
                the chatter taps presets / types a custom amount. */}
            <div className="rounded-xl border border-[#2a2d35] bg-gradient-to-br from-[#0d1117] to-[#161a22] px-4 py-3.5">
              <div className="text-[10px] uppercase tracking-wider text-[#9ca3af]">You&apos;ll request</div>
              <div className="text-[28px] font-bold text-white leading-none mt-1">
                {tipAmount && Number(tipAmount) > 0 ? Number(tipAmount) : 0} ⭐
              </div>
              <div className="text-[10px] text-[#6b7280] mt-1">
                {tipAmount && Number(tipAmount) > 0
                  ? `≈ $${(Number(tipAmount) * 0.01105).toFixed(2)} · from ${recipientLabel}`
                  : `from ${recipientLabel}`}
              </div>
            </div>

            {/* Preset amounts (in Stars) */}
            <div>
              <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider mb-2">Quick amounts</div>
              <div className="grid grid-cols-4 gap-2">
                {["100", "500", "1000", "2500"].map((amount) => {
                  const active = tipAmount === amount;
                  return (
                    <button
                      key={amount}
                      onClick={() => onTipAmountChange(amount)}
                      className={`py-2.5 rounded-lg text-[12px] font-semibold transition-all ${
                        active
                          ? "bg-[#00AFF0] text-white border border-[#00AFF0]"
                          : "bg-[#1f2937] border border-[#374151] text-white hover:bg-[#252b36] hover:border-[#4b5563]"
                      }`}
                    >
                      {amount} ⭐
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom amount — Stars */}
            <div>
              <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider mb-1.5">Custom amount</div>
              <div className="relative">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280] pointer-events-none">⭐</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tipAmount}
                  onChange={(e) => onTipAmountChange(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="w-full pl-4 pr-9 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#00AFF0]"
                />
              </div>
            </div>
            <div className="relative">
              <textarea
                ref={tipMessageRef}
                value={tipMessage}
                onChange={(e) => onTipMessageChange(e.target.value)}
                {...tipInsert.bind}
                placeholder="Optional message..."
                className="w-full px-4 py-2.5 pr-10 bg-[#1f2937] border border-[#374151] rounded-lg text-[10px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#00AFF0]"
                rows={2}
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setTipEmojiOpen((v) => !v);
                }}
                title="Add emoji"
                aria-label="Add emoji"
                className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                  tipEmojiOpen ? "text-[#00AFF0]" : "text-[#9ca3af] hover:text-white"
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>
              {tipEmojiOpen && (
                <EmojiPicker
                  anchored
                  onSelect={(em) => tipInsert.insert(tipMessage, onTipMessageChange, em)}
                  onClose={() => setTipEmojiOpen(false)}
                />
              )}
              {quickEmojiRow((em) => tipInsert.insert(tipMessage, onTipMessageChange, em))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onSendTip}
                disabled={!hasRecipient || !tipAmount || sending}
                className="flex-1 py-3 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[11px] hover:from-[#0098D4] hover:to-[#0098D4] transition-all shadow-lg shadow-[#00AFF0]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending
                  ? "Sending…"
                  : scheduleAt
                    ? `Schedule · ${formatScheduleShort(scheduleAt)}`
                    : `Request tip from ${recipientLabel}`}
              </button>
              {onChangeScheduleAt && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setTipScheduleOpen((v) => !v)}
                    disabled={!hasRecipient || sending}
                    title={scheduleAt ? "Edit schedule" : "Schedule send"}
                    className={`w-11 h-full flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      scheduleAt
                        ? "bg-[#00AFF0]/20 text-[#00AFF0] ring-1 ring-[#00AFF0]"
                        : "bg-[#1f2937] text-[#9ca3af] hover:text-white hover:bg-[#374151]"
                    }`}
                    aria-label="Schedule tip"
                  >
                    <Clock className="w-5 h-5" />
                  </button>
                  {tipScheduleOpen && (
                    <SchedulePopover
                      current={scheduleAt}
                      align="left"
                      onPick={(ts) => {
                        onChangeScheduleAt(ts);
                        setTipScheduleOpen(false);
                      }}
                      onClose={() => setTipScheduleOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-3">
            {/* Fan profile + stats block (moved out of the slide-out drawer
                per the user's spec). Notes add/list stays below it. */}
            <FanInfoBlock
              modelId={fanInfoModelId}
              peerId={fanInfoPeerId}
              fan={fan}
            />
            <div className="border-t border-[#2a2d35] pt-3 text-[10px] text-[#6b7280] uppercase tracking-wide">
              Notes
            </div>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onAddNote();
                }
              }}
              placeholder={hasRecipient ? "Add a note about this fan…" : "Select a chat first"}
              disabled={!hasRecipient}
              className="w-full h-[90px] px-4 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] resize-none focus:outline-none focus:border-[#00AFF0] disabled:opacity-50"
            />
            <button
              onClick={onAddNote}
              disabled={!hasRecipient || notesSaving || !notes.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-[#00AFF0] to-[#00AFF0] text-white rounded-lg font-semibold text-[12px] hover:from-[#0098D4] hover:to-[#0098D4] transition-all shadow-lg shadow-[#00AFF0]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {notesSaving ? "Adding…" : "Add note"}
            </button>

            {/* Running log — newest first */}
            <div className="space-y-2 pt-1">
              {notesList.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-[#6b7280]">
                  {hasRecipient ? "No notes yet." : "Select a chat to see notes."}
                </div>
              ) : (
                notesList.map((n) => (
                  <div
                    key={n.id}
                    className="group p-3 bg-[#1f2937]/40 border border-[#2a2d35] rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12px] text-[#e5e7eb] whitespace-pre-wrap break-words min-w-0">
                        {n.body}
                      </div>
                      <button
                        onClick={() => onDeleteNote(n.id)}
                        aria-label="Delete note"
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[9px] text-[#6b7280] mt-1.5">
                      {n.author_name ? `${n.author_name} · ` : ""}
                      {formatNoteDate(n.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "stats" && (
          <div className="space-y-1">
            {(stats
              ? [
                  // "Net" = after platform cut (matches agency dashboard).
                  { label: "Today net", value: fmtDollars(stats.todayNetAfterCut) },
                  { label: "All time net", value: fmtDollars(stats.allTimeNetAfterCut) },
                  // "Sales" = dollar amount of unlocked PPVs (pre-cut gross).
                  { label: "Sales today", value: fmtDollars(stats.todayNet) },
                  { label: "Sales all time", value: fmtDollars(stats.allTimeNet) },
                  // "Sends" = count of PPVs sent out (any status).
                  { label: "Sends today", value: String(stats.todayMessages) },
                  { label: "Sends all time", value: String(stats.allTimeMessages) },
                ]
              : [
                  { label: "Today net", value: "…" },
                  { label: "All time net", value: "…" },
                  { label: "Sales today", value: "…" },
                  { label: "Sales all time", value: "…" },
                  { label: "Sends today", value: "…" },
                  { label: "Sends all time", value: "…" },
                ]
            ).map((stat, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-3 px-3 bg-[#1f2937]/30 rounded-lg border border-[#2a2d35] hover:bg-[#1f2937]/50 transition-colors"
              >
                <span className="text-[14px] text-[#9ca3af] font-medium">{stat.label}</span>
                <span className="text-[15px] font-bold text-white">{stat.value}</span>
              </div>
            ))}
            <div className="text-[12px] text-[#6b7280] pt-3 text-center">
              Commission set by your agency.
            </div>
          </div>
        )}
      </div>
      {lightbox && (
        <PpvLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
