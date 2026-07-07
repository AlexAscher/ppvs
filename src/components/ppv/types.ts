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
  /** Blurred JPEG poster captured at upload time. For video PPVs this is
   *  the only image asset we have, so vault/chatter tiles render it
   *  instead of trying to embed a `<video>` tag for every card. Optional
   *  so legacy callers that build a PpvItem locally don't have to fake
   *  the field. */
  preview_url?: string | null;
  /** Small crisp (unblurred) 400px JPEG used by Vault grid tiles instead
   *  of loading the full-res original. Optional so legacy callers that
   *  build a PpvItem locally don't have to fake it; the /api/ppv/thumb
   *  endpoint falls back to preview_url when null. */
  thumb_url?: string | null;
  /** Moderation state. Falls back to "approved" when the column is missing
   *  on older schemas (pre-20260616_ppv_moderation). New uploads default
   *  to "pending" — the platform admin flips it to "approved" before
   *  chatters can send. */
  review_status?: "pending" | "approved" | "rejected";
  review_notes?: string | null;
  created_at: string;
  tags: PpvTag[];
};

export type PpvGroup = {
  id: string;
  model_id: string;
  name: string;
  created_at: string;
  /** When set, the whole group can be sold as one unlock at this price
   *  ("bundle"). Null = no bundle offer (items sold individually). */
  bundle_price?: number | null;
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
  "#00AFF0",
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
