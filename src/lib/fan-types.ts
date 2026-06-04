// Shared fan row type. Used by:
//   - /api/fans/[modelId]/route.ts        (server, source of truth)
//   - /app/chatter/page.tsx               (client, fan state)
//   - /components/.../FanProfileDrawer    (client, drawer)
//   - /api/ppv/deliver/route.ts           (server, total_spent update)
//
// Kept in a path-bracket-free module so client code can import without
// having to dodge Next.js dynamic-route segment characters.

export type FanRow = {
  id: string;
  model_id: string;
  peer_id: string;
  telegram_username: string | null;
  telegram_name: string | null;
  notes: string;
  total_spent: number;
  tags: string[];
  last_seen_at: string | null;
  created_at: string;
};

// One timestamped note in the running log for a fan (fan_notes table).
export type FanNote = {
  id: string;
  model_id: string;
  peer_id: string;
  body: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
};
