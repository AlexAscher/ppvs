export type PpvTag = {
  id: string;
  model_id: string;
  name: string;
  color: string;
  emoji: string | null;
};

export type PpvItem = {
  id: string;
  model_id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  price: number;
  media_url: string | null;
  created_at: string;
  tags: PpvTag[];
};

export type PpvGroup = {
  id: string;
  model_id: string;
  name: string;
  created_at: string;
  tags: PpvTag[];
  items: PpvItem[];
};

export type PpvModel = {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
};

export const TAG_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

export const TAG_EMOJIS = [
  "🔥", "⭐", "💎", "✨", "👑",
  "🎁", "💋", "🌹", "💝", "🎬",
  "📸", "🚀", "💯", "🏆", "❤️",
];
