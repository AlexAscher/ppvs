"use client";

import { Send, Search, Smile, Play, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmojiPicker } from "../chatter-page/EmojiPicker";
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
}

export interface ChatListItem {
  id: string;
  username: string;
  lastMessage: string;
  time: string;
  unread: number;
  avatar: string;
  status?: string | null;
}

interface TelegramChatProps {
  chatList: ChatListItem[];
  selectedChat: string;
  onSelectChat: (id: string) => void;
  selected: ChatListItem | null;
  messages: Message[];
  totalSpent: string;
  inputText: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  search: string;
  onSearch: (v: string) => void;
  sending: boolean;
}

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
  // Progressive loading: stripped thumb shows instantly, ~800px HQ preview
  // from /api/telegram/media?quality=thumb fades in over it. Lightbox keeps
  // the full original.
  const [hqLoaded, setHqLoaded] = useState(false);

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
            style={{
              filter: hqLoaded ? "none" : "blur(8px)",
              transition: "filter 0.3s",
            }}
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
        ) : media.type === "photo" ? (
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

export function TelegramChat({
  chatList,
  selectedChat,
  onSelectChat,
  selected,
  messages,
  totalSpent,
  inputText,
  onInputChange,
  onSend,
  search,
  onSearch,
  sending,
}: TelegramChatProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [openMedia, setOpenMedia] = useState<MessageMediaInfo | null>(null);

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
    <div className="flex-1 bg-[#0d1117] flex">
      {/* Chat List Sidebar — w-[280px] from design */}
      <div className="w-[280px] bg-[#161a22] border-r border-[#2a2d35] flex flex-col">
        <div className="p-3 border-b border-[#2a2d35]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-3 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-[12px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
          </div>
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
              <div className="w-11 h-11 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold text-[13px] flex-shrink-0">
                {chat.avatar}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-medium text-white truncate">@{chat.username}</span>
                  <span className="text-[10px] text-[#6b7280] ml-2">{chat.time}</span>
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header — h-[56px] from design */}
        <div className="h-[56px] bg-[#161a22] border-b border-[#2a2d35] px-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#6366f1] to-[#4f46e5] rounded-full flex items-center justify-center text-white font-semibold">
              {selected?.avatar ?? ""}
            </div>
            <div>
              <div className="text-[14px] font-semibold text-white">
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
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[11px] text-[#9ca3af]">
              Total spent: <span className="text-[#6366f1] font-bold">{totalSpent}</span>
            </div>
          </div>
        </div>

        {/* Messages Area — p-5 space-y-3 from design */}
        <div ref={messagesRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isChatter ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[65%] ${message.isChatter ? "items-end" : "items-start"} flex flex-col gap-1`}
              >
                {message.media ? (
                  <div
                    className={`p-1 rounded-2xl ${
                      message.isChatter
                        ? "bg-gradient-to-br from-[#6366f1] to-[#5558e3] rounded-br-sm"
                        : "bg-[#1f2937] rounded-bl-sm"
                    }`}
                  >
                    <MediaBubble
                      media={message.media}
                      isChatter={message.isChatter}
                      onOpen={() => setOpenMedia(message.media!)}
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
                ) : (
                  <div
                    className={`px-4 py-2.5 rounded-2xl ${
                      message.isChatter
                        ? "bg-gradient-to-br from-[#6366f1] to-[#5558e3] text-white rounded-br-sm"
                        : "bg-[#1f2937] text-[#e5e7eb] rounded-bl-sm"
                    }`}
                  >
                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {twemoji(message.text, `m-${message.id}`)}
                    </div>
                  </div>
                )}
                <div
                  className={`text-[10px] text-[#6b7280] px-1 ${message.isChatter ? "text-right" : "text-left"}`}
                >
                  {message.time}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area — h-[64px] from design */}
        <div className="h-[64px] bg-[#161a22] border-t border-[#2a2d35] px-5 flex items-center gap-3 relative">
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
            className="flex-1 px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[13px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
          />
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowEmoji((v) => !v);
              }}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
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
            className="px-5 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white rounded-lg font-semibold text-[13px] hover:from-[#5558e3] hover:to-[#4338ca] transition-all shadow-lg shadow-[#6366f1]/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </div>
      </div>

      {openMedia && <Lightbox media={openMedia} onClose={() => setOpenMedia(null)} />}
    </div>
  );
}
