"use client";

import { useState } from "react";
import { twemoji } from "@/lib/twemoji";

// Curated list — covers the categories Telegram shows in its picker.
// Pure unicode so it works without web-fonts or extra assets.
const CATEGORIES: { key: string; label: string; emojis: string[] }[] = [
  {
    key: "smileys",
    label: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚",
      "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭",
      "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶",
      "🫥", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤",
      "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴",
      "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤",
      "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "🥹", "😦",
      "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞",
      "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿",
    ],
  },
  {
    key: "love",
    label: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💖",
      "💗", "💓", "💞", "💕", "💝", "💘", "💟", "❣️", "💔", "❤️‍🔥",
      "❤️‍🩹", "💋", "💌", "🌹", "🌷", "🌸", "💐", "💍", "💎", "👑",
    ],
  },
  {
    key: "gestures",
    label: "👍",
    emojis: [
      "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘",
      "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "🫵", "👋", "🤚",
      "🖐️", "✋", "🖖", "👏", "🙌", "🫶", "🤲", "🤝", "🙏", "💪",
      "🦾", "🦵", "🦿", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁",
      "🦷", "🦴", "👀", "👁️", "👅", "👄", "🫦", "💯", "💢", "💥",
      "💫", "💦", "💨", "🕳️", "💣", "💬", "🗯️", "💭", "💤",
    ],
  },
  {
    key: "people",
    label: "🧑",
    emojis: [
      "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩", "🧓",
      "👴", "👵", "🙇", "💁", "🙅", "🙆", "🙋", "🧏", "🤦", "🤷",
      "🙎", "🙍", "💇", "💆", "🧖", "💅", "🤳", "💃", "🕺", "👯",
      "🧘", "🛀", "🛌", "👫", "👭", "👬", "💑", "💏", "👪",
    ],
  },
  {
    key: "animals",
    label: "🐶",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨",
      "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊",
      "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉",
      "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌",
      "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🕸️", "🦂",
      "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀",
      "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆",
    ],
  },
  {
    key: "food",
    label: "🍔",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐",
      "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑",
      "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅",
      "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳",
      "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔",
      "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🥗", "🥘", "🫕",
      "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤",
      "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨",
      "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿",
      "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧉",
      "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤",
    ],
  },
  {
    key: "travel",
    label: "✈️",
    emojis: [
      "✈️", "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒",
      "🚐", "🛻", "🚚", "🚛", "🚜", "🛵", "🏍️", "🛺", "🚲", "🛴",
      "🛹", "🛼", "🚂", "🚆", "🚇", "🚊", "🚉", "🛩️", "🛫", "🛬",
      "🪂", "🚁", "🚀", "🛸", "⛵", "🚤", "🛥️", "🚢", "⚓", "🌋",
      "🏔️", "⛰️", "🗻", "🏕️", "🏖️", "🏜️", "🏝️", "🏞️", "🌅", "🌄",
      "🌠", "🎆", "🎇", "🌈", "🌤️", "⛅", "🌧️", "⛈️", "🌩️", "❄️",
    ],
  },
  {
    key: "objects",
    label: "💡",
    emojis: [
      "💡", "🔦", "🕯️", "💸", "💵", "💴", "💶", "💷", "🪙", "💰",
      "💳", "🧾", "📱", "💻", "⌨️", "🖥️", "🖱️", "🖨️", "📷", "📸",
      "📹", "🎥", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭", "⏱️", "⏰",
      "📡", "🔋", "🔌", "🔍", "🔎", "🛒", "🎁", "🎀", "🪅", "🎂",
      "🍾", "🥂", "🎊", "🎉", "🎈", "🪩", "✨", "⭐", "🌟", "💫",
      "⚡", "🔥", "💥", "💯", "🏆", "🥇", "🥈", "🥉", "🎯", "🎲",
    ],
  },
  {
    key: "symbols",
    label: "🔣",
    emojis: [
      "✅", "❌", "⭕", "🚫", "♻️", "✔️", "☑️", "❗", "❓", "❕",
      "❔", "‼️", "⁉️", "⚠️", "🆘", "🔞", "📛", "🚸", "🔆", "🔅",
      "🔱", "⚜️", "🔰", "♾️", "💲", "💱", "©️", "®️", "™️", "#️⃣",
      "🔢", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);
  const category = CATEGORIES.find((c) => c.key === activeCategory) ?? CATEGORIES[0];

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-[320px] bg-[#1f2937] border border-[#374151] rounded-lg shadow-2xl overflow-hidden z-50"
      // stopPropagation so a click inside doesn't close us via the outside-click handler.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Category tabs */}
      <div className="flex border-b border-[#374151] bg-[#161a22] px-1 overflow-x-auto">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActiveCategory(c.key)}
            className={`px-2 py-1.5 text-[18px] leading-none flex-shrink-0 border-b-2 transition-colors ${
              activeCategory === c.key
                ? "border-[#6366f1]"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {twemoji(c.label, `cat-${c.key}`)}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto px-2 py-1.5 text-[12px] text-[#9ca3af] hover:text-white"
          aria-label="Close emoji picker"
        >
          ✕
        </button>
      </div>

      {/* Emoji grid */}
      <div className="max-h-[240px] overflow-y-auto p-2 grid grid-cols-8 gap-0.5">
        {category.emojis.map((e, i) => (
          <button
            key={`${category.key}-${i}`}
            type="button"
            onClick={() => onSelect(e)}
            className="w-9 h-9 flex items-center justify-center text-[20px] rounded hover:bg-[#374151] transition-colors"
            // Make sure the inline-block <img> inside scales to the button's
            // text size (1em = 20px here) rather than the default 1.1em.
            style={{ lineHeight: 1 }}
          >
            {twemoji(e, `e-${category.key}-${i}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
