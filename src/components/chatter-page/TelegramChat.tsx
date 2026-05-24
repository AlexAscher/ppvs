"use client";

import { Send, Search } from "lucide-react";
import { useEffect, useRef } from "react";

export interface Message {
  id: string;
  text: string;
  time: string;
  isChatter: boolean;
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

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, selected?.id]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  return (
    <div className="flex-1 bg-[#0d1117] flex">
      {/* Chat List Sidebar */}
      <div className="w-[280px] bg-[#161a22] border-r border-[#2a2d35] flex flex-col">
        {/* Search — smaller */}
        <div className="p-2.5 border-b border-[#2a2d35]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-8 pr-2 py-1.5 bg-[#1f2937] border border-[#374151] rounded-md text-[11px] text-white placeholder:text-[#6b7280] focus:outline-none focus:border-[#6366f1]"
            />
          </div>
        </div>

        {/* Chat List */}
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
                  <span className="text-[13px] font-medium text-white truncate">
                    @{chat.username}
                  </span>
                  <span className="text-[10px] text-[#6b7280] ml-2">
                    {chat.time}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-[#9ca3af] truncate">
                    {chat.lastMessage}
                  </p>
                  {chat.unread > 0 && (
                    <div className="ml-2 min-w-[18px] h-[18px] bg-[#6366f1] rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">
                        {chat.unread}
                      </span>
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
        {/* Chat Header */}
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
                className={`text-[11px] ${selected?.status === "online" ? "text-[#10b981]" : "text-[#6b7280]"}`}
              >
                {selected?.status ?? ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-[#1f2937] border border-[#374151] rounded-lg text-[11px] text-[#9ca3af]">
              Total spent:{" "}
              <span className="text-[#6366f1] font-bold">{totalSpent}</span>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div
          ref={messagesRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-5 space-y-3"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.isChatter ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[65%] ${message.isChatter ? "items-end" : "items-start"} flex flex-col gap-1`}
              >
                <div
                  className={`px-4 py-2.5 rounded-2xl ${
                    message.isChatter
                      ? "bg-gradient-to-br from-[#6366f1] to-[#5558e3] text-white rounded-br-sm"
                      : "bg-[#1f2937] text-[#e5e7eb] rounded-bl-sm"
                  }`}
                >
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {message.text}
                  </div>
                </div>
                <div
                  className={`text-[10px] text-[#6b7280] px-1 ${message.isChatter ? "text-right" : "text-left"}`}
                >
                  {message.time}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="h-[64px] bg-[#161a22] border-t border-[#2a2d35] px-5 flex items-center gap-3">
          <input
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
    </div>
  );
}
