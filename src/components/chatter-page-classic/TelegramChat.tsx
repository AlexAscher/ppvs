"use client";

import { Send, Search, Smile, Play, FileText, X, Zap, Check, Reply, ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmojiPicker } from "../chatter-page/EmojiPicker";
import { MessageContextMenu } from "../chatter-page/MessageContextMenu";
import { twemoji } from "@/lib/twemoji";

/**
 * Classic TelegramChat — pixel match of Create_prompt_design/TelegramChat.tsx
 * (sidebar 280px, search rounded-lg p-3, chat items p-3, avatar w-11 h-11
 * text-[13px], header h-[56px], messages text-[13px], input h-[64px]).
 *
 * Real-data props + recent features carried over:
 *   - MediaBubble for photo/video/document messages
 *   - Lightbox modal on click
 *   - Emoji picker button next to Send
 *   - online/typing live status (green when active)
 *   - Twemoji rendering inside message bubbles and chat-list previews
 *
 * Sizes / layout stay byte-accurate to the design folder; only behavior
 * additions are layered in (mostly invisible until used).
 */

export type MessageMediaInfo =
  | {
      type: "photo";
      thumbDataUrl: string | null;
      fullUrl: string;
      width: number | null;
      height: number | null;
    }
  | {
      type: "video";
      thumbDataUrl: string | null;
      fullUrl: string;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    }
  | {
      type: "sticker";
      thumbDataUrl: string | null;
      fullUrl: string;
      width: number | null;
      height: number | null;
      mimeType: string | null;
      isAnimated: boolean;
    }
  | {
      type: "document";
      thumbDataUrl: string | null;
      fullUrl: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
    };

export interface Message {
  id: string;
  text: string;
  time: string;
  isChatter: boolean;
  media?: MessageMediaInfo | null;
  // Inline reply preview rendered above the message body. `targetText`
  // is the looked-up snippet of the original; `quoteText` is the
  // selected snippet (newer protocol). `isToChatter` flips the accent
  // colour so replies to your own messages look distinct from replies
  // to the fan.
  replyPreview?: {
    targetMsgId: number;
    targetText: string;
    quoteText: string | null;
    isToChatter: boolean;
  } | null;
  /** Telegram grouped_id — messages in the same album share one id. */
  groupedId?: string | null;
}

export interface ChatListItem {
  id: string;
  username: string;
  lastMessage: string;
  time: string;
  unread: number;
  avatar: string;
  status?: string | null;
  /** Fan emoji tags (🔴💵💰⭐👑) shown next to username in the list. */
  tags?: string[];
  /** Total spent by this fan ($). Renders as a little badge under the
   *  avatar in the dialog list (0 = no badge). */
  spent?: number;
}

interface TelegramChatProps {
  chatList: ChatListItem[];
  selectedChat: string;
  onSelectChat: (id: string) => void;
  selected: ChatListItem | null;
  /** Active model — used to build fan-avatar image URLs. */
  modelId?: string | null;
  /** Max id of our outgoing message the fan has read (✓✓ when msg.id ≤ this). */
  readOutboxMaxId?: number;
  /** Fan Group library + active dialog-list filter (null = All). */
  groups?: { id: string; name: string; color: string; emoji: string | null }[];
  activeGroupId?: string | null;
  onSelectGroup?: (id: string | null) => void;
  /** Create a new group (category) from the filter row. */
  onCreateGroup?: (name: string) => void | Promise<void>;
  /** Delete a group via right-click on its chip. */
  onDeleteGroup?: (id: string) => void | Promise<void>;
  messages: Message[];
  /** Fan's lifetime spend, pre-formatted ("$245"). Shown in the header. */
  totalSpent: string;
  inputText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  search: string;
  onSearch: (v: string) => void;
  sending: boolean;
  fanTags: string[];
  onToggleTag: (tag: string) => void;
  /** Group memberships of the *selected* fan (subset of `groups` ids).
   *  Drives the chip row at the right of the chat header — replaces the
   *  old emoji-tag row at user's request. */
  selectedFanGroupIds?: string[];
  /** Toggle the selected fan into / out of a group. Falls back to a no-op
   *  if the parent doesn't pass it (avoids forcing the prop on legacy
   *  call sites). */
  onToggleFanGroup?: (groupId: string) => void | Promise<void>;
  onOpenQuickReply: () => void;
  onOpenFanProfile: () => void;
  replyingTo: ReplyContext | null;
  editing: EditContext | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onReplyToMessage: (id: number, text: string, isChatter: boolean) => void;
  onReplyWithQuote: (
    id: number,
    text: string,
    isChatter: boolean,
    selection: string,
  ) => void;
  onStartEdit: (id: number, currentText: string) => void;
  onDeleteMessage: (id: number) => void;
  mobileView: "list" | "chat" | "actions";
  onMobileBack: () => void;
}

export type ReplyContext = {
  id: number;
  text: string;
  isChatter: boolean;
  quote: string | null;
};
export type EditContext = { id: number; originalText: string };

// Fixed emoji set for per-fan classification. Order is intentional —
// chatters use these as quick visual flags (red = unresponsive, dollar
// signs = paying tier, crown = VIP). Adding new tags here requires no
// schema change since fans.tags is text[].
const FAN_TAGS = ["🔴", "💵", "💰", "⭐", "👑"] as const;

function formatDuration(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function MediaBubble({
  media,
  onOpen,
  isChatter,
}: {
  media: MessageMediaInfo;
  onOpen: () => void;
  isChatter: boolean;
}) {
  // Progressive loading: stripped thumb shows instantly, HQ preview from
  // /api/telegram/media?quality=thumb fades in over it (lightbox keeps
  // the full original on tap). User wants the real thumbnail rendered
  // because the locked-preview path uploads small pre-blurred JPEGs to TG
  // already — the inline preview is cheap *and* shows what was actually
  // sent.
  const [hqLoaded, setHqLoaded] = useState(false);

  if (media.type === "sticker") {
    const size = 128;
    const isVideoSticker =
      media.isAnimated && (media.mimeType ?? "").startsWith("video/");
    // WebM video stickers: autoplay/loop/muted so they animate inline.
    if (isVideoSticker) {
      return (
        <video
          src={media.fullUrl}
          autoPlay
          loop
          muted
          playsInline
          className="object-contain"
          style={{ width: size, height: size }}
          poster={media.thumbDataUrl ?? undefined}
        />
      );
    }
    // TGS (Lottie) animated stickers: no browser-native renderer, show the
    // static stripped thumb. Static WebP stickers: show the full image.
    if (media.isAnimated) {
      return (
        <div className="relative" style={{ width: size, height: size }}>
          {media.thumbDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.thumbDataUrl}
              alt=""
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-[#1f2937] rounded-lg flex items-center justify-center text-[10px] text-[#6b7280]">
              sticker
            </div>
          )}
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.fullUrl}
        alt=""
        className="object-contain"
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
  if (media.type === "photo" || media.type === "video") {
    const aspect = media.width && media.height ? media.width / media.height : 1;
    const w = 240;
    const h = Math.round(w / Math.max(0.6, Math.min(1.8, aspect)));
    const hqUrl = `${media.fullUrl}&quality=thumb`;
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block relative rounded-lg overflow-hidden border border-[#2a2d35] hover:opacity-90 transition-opacity"
        style={{ width: w, height: h }}
      >
        {media.thumbDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.thumbDataUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#1f2937] to-[#111827]" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hqUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: hqLoaded ? 1 : 0 }}
          onLoad={() => setHqLoaded(true)}
          onError={() => { /* keep stripped thumb if HQ fails */ }}
          draggable={false}
        />
        {media.type === "video" && (
          <>
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="w-12 h-12 rounded-full bg-black/55 border border-white/15 flex items-center justify-center">
                <Play className="w-5 h-5 text-white" fill="white" />
              </div>
            </div>
            {media.durationSec ? (
              <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-medium z-10">
                {formatDuration(media.durationSec)}
              </div>
            ) : null}
          </>
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
        isChatter ? "bg-white/15" : "bg-[#374151]"
      } hover:opacity-90 transition-opacity max-w-[260px]`}
    >
      <div className="w-9 h-9 rounded-full bg-black/30 flex items-center justify-center flex-shrink-0">
        <FileText className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0 text-left">
        <div className="text-[12px] text-white truncate">{media.fileName ?? "Document"}</div>
        {media.sizeBytes ? (
          <div className="text-[10px] text-white/70">
            {(media.sizeBytes / 1024 / 1024).toFixed(2)} MB
          </div>
        ) : null}
      </div>
    </button>
  );
}

/**
 * Reply / quote card rendered above a message body. Shows a coloured
 * left bar (accent depends on who the reply targets), a small label
 * with sender, and the snippet. If `quoteText` is present (newer
 * Telegram protocol) we surface it instead of the full original.
 */
function ReplyPreviewCard({
  preview,
  isChatter,
}: {
  preview: NonNullable<Message["replyPreview"]>;
  isChatter: boolean;
}) {
  const senderLabel = preview.isToChatter ? "You" : "Fan";
  const accent = isChatter
    ? "bg-white/80" // inside the gradient bubble — light bar on indigo
    : "bg-[#6366f1]";
  const labelColor = isChatter ? "text-white" : "text-[#a5a8ff]";
  const bg = isChatter ? "bg-black/15" : "bg-[#111827]/60";
  const body = preview.quoteText ?? preview.targetText;
  const truncated =
    body && body.length > 120 ? `${body.slice(0, 120).trim()}…` : body || "Message";
  return (
    <div
      className={`flex items-stretch gap-2 mb-1.5 px-2.5 py-1.5 rounded-md ${bg}`}
    >
      <div className={`w-[3px] rounded ${accent}`} />
      <div className="min-w-0 flex-1">
        <div
          className={`text-[10px] font-semibold uppercase tracking-wide ${labelColor} flex items-center gap-1`}
        >
          {preview.quoteText ? "Quoted from " : "Replying to "}
          {senderLabel}
        </div>
        <div
          className={`text-[11px] truncate ${
            isChatter ? "text-white/90" : "text-[#d1d5db]"
          }`}
        >
          {truncated}
        </div>
      </div>
    </div>
  );
}

function Lightbox({ media, onClose }: { media: MessageMediaInfo; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="max-w-[92vw] max-h-[92vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {media.type === "video" ? (
          <video src={media.fullUrl} controls autoPlay className="max-w-[92vw] max-h-[92vh] rounded-md" />
        ) : media.type === "photo" || media.type === "sticker" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.fullUrl} alt="" className="max-w-[92vw] max-h-[92vh] object-contain rounded-md" />
        ) : (
          <a
            href={media.fullUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="px-5 py-3 bg-[#6366f1] text-white rounded-lg font-semibold"
          >
            Download {media.fileName ?? "file"}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Fan avatar with graceful fallback. Tries the cached Telegram photo
 * (served via /api/telegram/fan-avatar, which caches to Storage); on any
 * error or when no model is known, falls back to coloured initials.
 * `loading="lazy"` so off-screen dialogs don't all fetch at once.
 */
function FanAvatar({
  modelId,
  peerId,
  initials,
  size = 44,
}: {
  modelId?: string | null;
  peerId: string;
  initials: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const px = `${size}px`;
  if (!modelId || failed) {
    return (
      <div
        className="bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
        style={{ width: px, height: px, fontSize: size * 0.3 }}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/telegram/fan-avatar/${modelId}?peerId=${encodeURIComponent(peerId)}`}
      alt={initials}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="rounded-full object-cover flex-shrink-0 bg-[#1f2937]"
      style={{ width: px, height: px }}
    />
  );
}

/** Telegram-style delivery ticks for our outgoing messages: a single
 *  grey check = sent, a double blue check = read by the fan (derived from
 *  the dialog's read_outbox_max_id). */
function ReadTicks({ read }: { read: boolean }) {
  return (
    <span
      className="inline-flex shrink-0"
      title={read ? "Read" : "Sent"}
      style={{ color: read ? "#34a3f5" : "#9ca3af" }}
    >
      <svg width="15" height="10" viewBox="0 0 15 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 5.2 L3.9 8.1 L9.3 1.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        {read && (
          <path d="M5.4 8.1 L10.8 1.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  );
}

export function TelegramChat({
  chatList,
  selectedChat,
  onSelectChat,
  selected,
  modelId,
  readOutboxMaxId,
  groups,
  activeGroupId,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
  messages,
  totalSpent,
  inputText,
  onInputChange,
  onSend,
  search,
  onSearch,
  sending,
  fanTags,
  onToggleTag,
  selectedFanGroupIds,
  onToggleFanGroup,
  onOpenQuickReply,
  onOpenFanProfile,
  replyingTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onReplyToMessage,
  onReplyWithQuote,
  onStartEdit,
  onDeleteMessage,
  mobileView,
  onMobileBack,
}: TelegramChatProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [openMedia, setOpenMedia] = useState<MessageMediaInfo | null>(null);

  // Group-filter management: inline "add category" input + right-click
  // delete context menu (anchored to the chip).
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [groupMenu, setGroupMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!groupMenu) return;
    const close = () => setGroupMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [groupMenu]);

  // Album grouping: consecutive messages with the same groupedId render as
  // a thumbnail grid instead of stacked individual bubbles.
  type SingleChunk = { kind: "single"; msg: Message };
  type AlbumChunk = { kind: "album"; msgs: Message[]; groupedId: string };
  type RenderChunk = SingleChunk | AlbumChunk;

  const chunks = useMemo((): RenderChunk[] => {
    const result: RenderChunk[] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      const gid = m.groupedId ?? null;
      if (gid) {
        const group: Message[] = [m];
        let j = i + 1;
        while (j < messages.length && messages[j].groupedId === gid) {
          group.push(messages[j]);
          j++;
        }
        if (group.length > 1) {
          result.push({ kind: "album", msgs: group, groupedId: gid });
          i = j;
          continue;
        }
      }
      result.push({ kind: "single", msg: m });
      i++;
    }
    return result;
  }, [messages]);

  // Right-click context menu local state. `selection` is captured at the
  // moment of right-click via window.getSelection() so the menu can
  // conditionally show "Reply with Quote".
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    msg: Message;
    selection: string;
  } | null>(null);

  function handleMessageContextMenu(e: React.MouseEvent, msg: Message) {
    e.preventDefault();
    const sel = window.getSelection()?.toString() ?? "";
    setMenu({ x: e.clientX, y: e.clientY, msg, selection: sel });
  }

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, selected?.id]);

  useEffect(() => {
    if (!showEmoji) return;
    function onDown() {
      setShowEmoji(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showEmoji]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      onInputChange(inputText + emoji);
      return;
    }
    const start = el.selectionStart ?? inputText.length;
    const end = el.selectionEnd ?? inputText.length;
    const next = inputText.slice(0, start) + emoji + inputText.slice(end);
    onInputChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div
      className={`flex-1 min-w-0 bg-[#0d1117] ${
        mobileView === "actions" ? "hidden xl:flex" : "flex"
      }`}
    >
      {/* Chat List Sidebar — w-[280px] from design. Full-width on mobile/tablet
          (single-panel + bottom nav), fixed 280px only on desktop (>=xl). */}
      <div
        className={`${
          mobileView === "list" ? "flex" : "hidden"
        } xl:flex w-full xl:w-[280px] min-w-0 bg-[#161a22] border-r border-[#2a2d35] flex-col`}
      >
        <div className="p-3 border-b border-[#2a2d35]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[10px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
          </div>

          {/* Group filter chips: All + categories + Add. Right-click a
              category to delete it (All is permanent). */}
          {(onSelectGroup || (groups && groups.length > 0)) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => onSelectGroup?.(null)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-all ${
                  !activeGroupId
                    ? "bg-[#6366f1] border-[#6366f1] text-white"
                    : "bg-[#1f2937] border-[#374151] text-[#9ca3af] hover:text-white"
                }`}
              >
                All
              </button>
              {(groups ?? []).map((g) => {
                const on = activeGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGroup?.(on ? null : g.id)}
                    onContextMenu={(e) => {
                      if (!onDeleteGroup) return;
                      e.preventDefault();
                      setGroupMenu({ id: g.id, name: g.name, x: e.clientX, y: e.clientY });
                    }}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border transition-all"
                    style={{
                      background: on ? `${g.color}30` : "#1f2937",
                      borderColor: on ? g.color : "#374151",
                      color: on ? g.color : "#9ca3af",
                    }}
                  >
                    {g.emoji ? `${g.emoji} ` : ""}{g.name}
                  </button>
                );
              })}

              {/* Add category */}
              {onCreateGroup && !addingCategory && (
                <button
                  type="button"
                  onClick={() => { setAddingCategory(true); setNewCategory(""); }}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap border border-dashed border-[#374151] text-[#9ca3af] hover:text-white hover:border-[#6366f1] transition-all"
                >
                  + Add
                </button>
              )}
              {onCreateGroup && addingCategory && (
                <input
                  autoFocus
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newCategory.trim()) {
                      await onCreateGroup(newCategory.trim());
                      setNewCategory("");
                      setAddingCategory(false);
                    } else if (e.key === "Escape") {
                      setAddingCategory(false);
                    }
                  }}
                  onBlur={() => setAddingCategory(false)}
                  placeholder="name…"
                  className="px-2.5 py-1 w-24 rounded-full text-[10px] bg-[#1f2937] border border-[#6366f1] text-white placeholder:text-[#6b7280] focus:outline-none"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {chatList.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`w-full p-3 flex items-center gap-3 border-b border-[#2a2d35]/50 hover:bg-[#1f2937]/50 transition-colors ${
                selectedChat === chat.id ? "bg-[#1f2937]" : ""
              }`}
            >
              <div className="relative shrink-0">
                <FanAvatar modelId={modelId} peerId={chat.id} initials={chat.avatar} size={44} />
                {/* Spent badge — overlays the bottom of the avatar (PayAndView
                    style). Only shown when the fan has actually paid something. */}
                {!!chat.spent && chat.spent > 0 && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full bg-[#6366f1] text-white text-[9px] font-bold leading-tight whitespace-nowrap shadow-md border border-[#0d1117]"
                    title={`Total spent: $${chat.spent.toFixed(2)}`}
                  >
                    ${chat.spent >= 1000 ? `${(chat.spent / 1000).toFixed(1)}k` : Math.round(chat.spent)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-medium text-white truncate">@{chat.username}</span>
                  <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                    {(chat.tags ?? []).map((t, i) => (
                      <span key={i} className="text-[11px] leading-none">{t}</span>
                    ))}
                    <span className="text-[10px] text-[#6b7280] ml-1">{chat.time}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-[#9ca3af] truncate">
                    {twemoji(chat.lastMessage, `cl-${chat.id}`)}
                  </p>
                  {chat.unread > 0 && (
                    <div className="ml-2 min-w-[18px] h-[18px] bg-[#6366f1] rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">{chat.unread}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area — full-width on mobile/tablet, shown only in chat view */}
      <div
        className={`${
          mobileView === "chat" ? "flex" : "hidden"
        } xl:flex flex-1 min-w-0 flex-col`}
      >
        {/* Chat Header — h-[56px] from design */}
        <div className="h-[56px] bg-[#161a22] border-b border-[#2a2d35] px-3 md:px-5 flex items-center justify-between">
          {/* Mobile back-to-list button */}
          <button
            type="button"
            onClick={onMobileBack}
            aria-label="Back to chats"
            className="xl:hidden w-9 h-9 mr-1 flex items-center justify-center rounded-lg hover:bg-[#1f2937] text-white flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => selected && onOpenFanProfile()}
            disabled={!selected}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity disabled:cursor-not-allowed min-w-0 flex-1"
            title={selected ? "Open fan profile" : ""}
          >
            {selected ? (
              <FanAvatar modelId={modelId} peerId={selected.id} initials={selected.avatar} size={40} />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex-shrink-0" />
            )}
            <div className="text-left min-w-0">
              <div className="text-[14px] font-semibold text-white truncate">
                {selected ? `@${selected.username}` : ""}
              </div>
              <div
                className={`text-[11px] ${
                  selected?.status === "online" || selected?.status === "typing…"
                    ? "text-[#10b981]"
                    : "text-[#6b7280]"
                }`}
              >
                {selected?.status ?? ""}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {/* Per-fan group memberships — show ONLY chips for groups this
                fan actually belongs to (per user spec: "if not in any
                groups, nothing should be there"). Clicking a chip removes
                the fan from that group. Adding lives elsewhere (dialog-list
                filter chips have +Add; fan profile drawer too). */}
            {(() => {
              const memberChips = (groups ?? []).filter((g) =>
                (selectedFanGroupIds ?? []).includes(g.id),
              );
              if (memberChips.length === 0) return null;
              return (
                <div className="hidden md:flex items-center gap-1.5 max-w-[420px] overflow-x-auto">
                  {memberChips.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => selected && onToggleFanGroup?.(g.id)}
                      disabled={!selected || !onToggleFanGroup}
                      title={`Remove from ${g.name}`}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        background: `${g.color}30`,
                        borderColor: g.color,
                        color: g.color,
                      }}
                    >
                      {g.emoji ? `${g.emoji} ` : ""}{g.name}
                    </button>
                  ))}
                </div>
              );
            })()}
            <div className="px-2.5 md:px-3 py-1.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[11px] text-[#9ca3af] whitespace-nowrap">
              <span className="hidden sm:inline">Total spent: </span>
              <span className="text-[#6366f1] font-bold">{totalSpent}</span>
            </div>

          </div>
        </div>

        {/* Messages Area — p-5 space-y-3 from design */}
        <div ref={messagesRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 md:p-5 space-y-3">
          {chunks.map((chunk) => {
            if (chunk.kind === "album") {
              const first = chunk.msgs[0];
              const caption = chunk.msgs.find((m) => m.text && m.text !== "—");
              const cols = chunk.msgs.length === 1 ? 1 : 2;
              // "Delivered PPV original" heuristic — outgoing album with NO
              // caption text in any chunk. Previews always carry a caption
              // ("Unlock for $X ↗"); regular chatter sends usually do too.
              // A captionless outgoing album is almost always the post-pay
              // delivery (or a free send). Per user spec, those render as
              // a clean "Tap to open" placeholder instead of the actual
              // thumb — the agency doesn't want unblurred original previews
              // visible in the chat interface.
              const isDeliveredOriginals = first.isChatter && !caption;
              return (
                <div
                  key={chunk.groupedId}
                  className={`flex ${first.isChatter ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex flex-col gap-1 ${first.isChatter ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`p-1 rounded-2xl inline-block ${
                        first.isChatter
                          ? "bg-gradient-to-br from-[#6366f1] to-[#5558e3] rounded-br-sm"
                          : "bg-[#1f2937] rounded-bl-sm"
                      }`}
                      // Fix "giant right margin" bug: with a fixed 100px/col
                      // grid the bubble wrapper grew to fit the longest
                      // caption line (e.g. an unlock URL) and left a wide
                      // empty strip to the right of the tiles. Constrain the
                      // bubble's width to the grid width (cols × 100 + gap)
                      // so caption text wraps within the album footprint
                      // instead of pushing the bubble wider.
                      style={{ maxWidth: cols * 100 + (cols - 1) * 2 + 8 }}
                    >
                      <div
                        className="grid gap-0.5 overflow-hidden rounded-xl"
                        style={{ gridTemplateColumns: `repeat(${cols}, 100px)` }}
                      >
                        {chunk.msgs.slice(0, 4).map((m, idx) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => m.media && setOpenMedia(m.media)}
                            className="relative overflow-hidden bg-[#374151]"
                            style={{ width: 100, height: 100 }}
                          >
                            {m.media &&
                            (m.media.type === "photo" || m.media.type === "video") ? (
                              isDeliveredOriginals ? (
                                // Delivered originals → clean placeholder
                                // (per user: don't show unblurred thumbs in
                                // the chat UI). Tap on the wrapping button
                                // opens the original in the lightbox.
                                <div className={`w-full h-full flex flex-col items-center justify-center gap-0.5 ${
                                  first.isChatter
                                    ? "bg-gradient-to-br from-[#5558e3]/35 to-[#4338ca]/20"
                                    : "bg-gradient-to-br from-[#1f2937] to-[#0d1117]"
                                }`}>
                                  <div className="text-[26px] leading-none">
                                    {m.media.type === "video" ? "🎬" : "🖼️"}
                                  </div>
                                  <div className="text-[9px] font-semibold text-white/85 uppercase tracking-wider">
                                    {m.media.type === "video" ? "Video" : "Photo"}
                                  </div>
                                  <div className="text-[8px] text-white/55 mt-0.5">Tap to open</div>
                                </div>
                              ) : (
                                // Pre-blurred preview / fan's incoming media
                                // → show the actual thumb (it's already
                                // safe-to-display bytes for previews, and
                                // gives the chatter useful context for
                                // incoming).
                                <>
                                  {m.media.thumbDataUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={m.media.thumbDataUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      draggable={false}
                                    />
                                  ) : (
                                    <div className={`w-full h-full ${
                                      first.isChatter
                                        ? "bg-gradient-to-br from-[#5558e3]/35 to-[#4338ca]/20"
                                        : "bg-gradient-to-br from-[#1f2937] to-[#0d1117]"
                                    }`} />
                                  )}
                                  {m.media.type === "video" && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center">
                                        <Play className="w-4 h-4 text-white" fill="white" />
                                      </div>
                                    </div>
                                  )}
                                </>
                              )
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[22px]">🔒</div>
                            )}
                            {idx === 3 && chunk.msgs.length > 4 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-[16px]">
                                +{chunk.msgs.length - 4}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      {caption && (
                        <div
                          className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words px-3 pt-2 pb-1 ${
                            first.isChatter ? "text-white" : "text-[#e5e7eb]"
                          }`}
                        >
                          {twemoji(caption.text, `album-${chunk.groupedId}`)}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-[10px] text-[#6b7280] px-1 flex items-center gap-1 ${first.isChatter ? "justify-end" : "justify-start"}`}
                    >
                      {chunk.msgs[chunk.msgs.length - 1].time}
                      {first.isChatter && (
                        <ReadTicks
                          read={
                            readOutboxMaxId !== undefined &&
                            Number(chunk.msgs[chunk.msgs.length - 1].id) <= readOutboxMaxId
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            const message = chunk.msg;
            return (
            <div
              key={message.id}
              className={`flex ${message.isChatter ? "justify-end" : "justify-start"}`}
              onContextMenu={(e) => handleMessageContextMenu(e, message)}
            >
              <div
                className={`max-w-[65%] ${message.isChatter ? "items-end" : "items-start"} flex flex-col gap-1`}
              >
                {message.media ? (
                  message.media.type === "sticker" ? (
                    // Stickers: render bare, no chat-bubble background, no
                    // text below — Telegram convention.
                    <MediaBubble
                      media={message.media}
                      isChatter={message.isChatter}
                      onOpen={() => message.media && setOpenMedia(message.media)}
                    />
                  ) : (
                    <div
                      className={`p-1 rounded-2xl ${
                        message.isChatter
                          ? "bg-gradient-to-br from-[#6366f1] to-[#5558e3] rounded-br-sm"
                          : "bg-[#1f2937] rounded-bl-sm"
                      }`}
                    >
                      {message.replyPreview && (
                        <div className="px-1 pt-1">
                          <ReplyPreviewCard
                            preview={message.replyPreview}
                            isChatter={message.isChatter}
                          />
                        </div>
                      )}
                      <MediaBubble
                        media={message.media}
                        isChatter={message.isChatter}
                        onOpen={() => message.media && setOpenMedia(message.media)}
                      />
                      {message.text && message.text !== "—" ? (
                        <div
                          className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words px-3 pt-2 pb-1 ${
                            message.isChatter ? "text-white" : "text-[#e5e7eb]"
                          }`}
                        >
                          {twemoji(message.text, `m-${message.id}`)}
                        </div>
                      ) : null}
                    </div>
                  )
                ) : (
                  <div
                    className={`px-4 py-2.5 rounded-2xl ${
                      message.isChatter
                        ? "bg-gradient-to-br from-[#6366f1] to-[#5558e3] text-white rounded-br-sm"
                        : "bg-[#1f2937] text-[#e5e7eb] rounded-bl-sm"
                    }`}
                  >
                    {message.replyPreview && (
                      <ReplyPreviewCard
                        preview={message.replyPreview}
                        isChatter={message.isChatter}
                      />
                    )}
                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {twemoji(message.text, `m-${message.id}`)}
                    </div>
                  </div>
                )}
                <div
                  className={`text-[10px] text-[#6b7280] px-1 flex items-center gap-1 ${message.isChatter ? "justify-end" : "justify-start"}`}
                >
                  {message.time}
                  {message.isChatter && (
                    <ReadTicks
                      read={readOutboxMaxId !== undefined && Number(message.id) <= readOutboxMaxId}
                    />
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Reply / Edit indicator bar — sits directly above the input. */}
        {(replyingTo || editing) && (
          <div className="px-5 py-2 bg-[#1f2937]/60 border-t border-[#2a2d35] flex items-start gap-2">
            <div
              className={`w-1 self-stretch rounded ${
                editing ? "bg-amber-400" : "bg-[#6366f1]"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5 flex items-center gap-1">
                {editing ? (
                  <>
                    <Check className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-400">Editing message</span>
                  </>
                ) : (
                  <>
                    <Reply className="w-3 h-3 text-[#6366f1]" />
                    <span className="text-[#6366f1]">
                      {replyingTo!.quote ? "Replying with quote" : "Replying"} to{" "}
                      {replyingTo!.isChatter ? "yourself" : "fan"}
                    </span>
                  </>
                )}
              </div>
              <div className="text-[11px] text-[#9ca3af] truncate">
                {editing
                  ? editing.originalText
                  : replyingTo!.quote
                    ? `«${replyingTo!.quote}»`
                    : replyingTo!.text || "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => (editing ? onCancelEdit() : onCancelReply())}
              aria-label="Cancel"
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#374151] text-[#9ca3af] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Area — h-[64px] from design */}
        <div className="h-[64px] bg-[#161a22] border-t border-[#2a2d35] px-3 md:px-5 flex items-center gap-2 md:gap-3 relative">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 min-w-0 px-3 md:px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
          />
          <button
            type="button"
            onClick={onOpenQuickReply}
            className="w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-lg bg-[#1f2937] text-[#9ca3af] hover:text-white hover:bg-[#374151] transition-colors"
            aria-label="Quick replies"
            title="Quick replies"
          >
            <Zap className="w-5 h-5" />
          </button>
          <div className="relative shrink-0">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowEmoji((v) => !v);
              }}
              className={`w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                showEmoji
                  ? "bg-[#374151] text-[#6366f1]"
                  : "bg-[#1f2937] text-[#9ca3af] hover:text-white hover:bg-[#374151]"
              }`}
              aria-label="Emoji picker"
            >
              <Smile className="w-5 h-5" />
            </button>
            {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
          </div>
          <button
            onClick={onSend}
            disabled={sending || !inputText.trim() || !selected}
            className={`px-3.5 md:px-5 py-2.5 text-white rounded-lg font-semibold text-[13px] transition-all shadow-lg flex items-center gap-1.5 md:gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
              editing
                ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-500/20"
                : "bg-gradient-to-r from-[#6366f1] to-[#4f46e5] hover:from-[#5558e3] hover:to-[#4338ca] shadow-[#6366f1]/20"
            }`}
          >
            {editing ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Save</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </div>
      </div>

      {openMedia && <Lightbox media={openMedia} onClose={() => setOpenMedia(null)} />}

      {menu && selected && (
        <MessageContextMenu
          open
          x={menu.x}
          y={menu.y}
          canEdit={menu.msg.isChatter && !menu.msg.media && !!menu.msg.text && menu.msg.text !== "—"}
          canDelete={true}
          selection={menu.selection}
          onClose={() => setMenu(null)}
          onReply={() => {
            onReplyToMessage(Number(menu.msg.id), menu.msg.text, menu.msg.isChatter);
            setMenu(null);
          }}
          onReplyWithQuote={() => {
            onReplyWithQuote(
              Number(menu.msg.id),
              menu.msg.text,
              menu.msg.isChatter,
              menu.selection,
            );
            setMenu(null);
          }}
          onEdit={() => {
            onStartEdit(Number(menu.msg.id), menu.msg.text);
            setMenu(null);
          }}
          onDelete={() => {
            onDeleteMessage(Number(menu.msg.id));
            setMenu(null);
          }}
        />
      )}

      {/* Group chip right-click → delete category */}
      {groupMenu && onDeleteGroup && (
        <div
          className="fixed z-[100] bg-[#1f2937] border border-[#374151] rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: groupMenu.x, top: groupMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={async () => {
              const id = groupMenu.id;
              setGroupMenu(null);
              if (activeGroupId === id) onSelectGroup?.(null);
              await onDeleteGroup(id);
            }}
            className="w-full px-3 py-2 text-left text-[12px] text-red-400 hover:bg-[#374151] transition-colors"
          >
            Delete “{groupMenu.name}”
          </button>
        </div>
      )}
    </div>
  );
}
