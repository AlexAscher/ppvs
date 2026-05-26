> Claude: read this file at the start of every session before making any changes. This saves tokens by avoiding a full project scan.

# Database — Supabase Tables

## SQL Setup

Run in Supabase SQL Editor before first use.

---

## Table: `users` (public profile — mirrors auth.users)

> Note: The Supabase Auth `user_metadata` already stores role/display_name/agency_name. This public table is optional but useful for joins. Currently the app primarily reads from auth metadata.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | References auth.users(id) |
| email | text | User email |
| display_name | text nullable | From metadata |
| role | text | "chatter" or "agency" |
| agency_name | text nullable | Agency name (agency role only) |
| created_at | timestamptz | Default now() |

**RLS:** Enabled. Users can read/update their own row.

---

## Table: `vault_items`

Stores metadata for uploaded content. Files live in Supabase Storage.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid | References auth.users(id) |
| title | text | Display name |
| file_path | text | Path in `content` bucket: `{user_id}/{uuid}.ext` |
| thumb_path | text | Path in `vault` bucket: `{user_id}/{uuid}_thumb.jpg` |
| file_type | text | "image" or "video" |
| default_price | numeric | Default PPV price in USD |
| created_at | timestamptz | Default now() |

**RLS:** Users can CRUD only their own rows.

```sql
CREATE TABLE vault_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_path text NOT NULL,
  thumb_path text NOT NULL,
  file_type text NOT NULL,
  default_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner CRUD" ON vault_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## Table: `ppv_links`

Each generated PPV link. The fan opens `/pay/{code}`.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid | Creator/agency who owns the link |
| vault_item_id | uuid | References vault_items(id) |
| code | text UNIQUE | 8-char random code |
| price | numeric | Price in USD |
| fan_telegram | text nullable | Fan's Telegram handle |
| is_paid | boolean | Default false |
| paid_at | timestamptz nullable | When payment confirmed |
| created_at | timestamptz | Default now() |

**RLS:** Owner can read all their links. Public can read by code (for /pay page). Admin client used for is_paid updates.

```sql
CREATE TABLE ppv_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_item_id uuid NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  price numeric NOT NULL,
  fan_telegram text,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ppv_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select" ON ppv_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner insert" ON ppv_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read by code" ON ppv_links FOR SELECT USING (true);
```

---

## Table: `invitations`

Agency invites chatter by email.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| agency_id | uuid | References auth.users(id) |
| agency_name | text | Denormalized for display |
| chatter_email | text | Invited chatter's email (lowercased) |
| chatter_id | uuid nullable | Set when chatter accepts |
| status | text | "pending" / "accepted" / "declined" |
| created_at | timestamptz | Default now() |

```sql
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_name text NOT NULL,
  chatter_email text NOT NULL,
  chatter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role bypass invitations" ON invitations USING (true) WITH CHECK (true);
```

---

## Table: `agency_chatters`

Many-to-many: which chatters belong to which agency.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| agency_id | uuid | References auth.users(id) |
| chatter_id | uuid | References auth.users(id) |
| joined_at | timestamptz | Default now() |

Unique constraint: (agency_id, chatter_id)

```sql
CREATE TABLE agency_chatters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chatter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id, chatter_id)
);
ALTER TABLE agency_chatters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role bypass agency_chatters" ON agency_chatters USING (true) WITH CHECK (true);
```

---

## ALTER: speed pack (preview_url + send error tracking)

Run these on top of the original schema to enable pre-blurred previews +
background PPV sends with surfaced errors:

```sql
ALTER TABLE ppvs ADD COLUMN IF NOT EXISTS preview_url text;
ALTER TABLE ppv_sends ADD COLUMN IF NOT EXISTS error text;
```

`ppvs.preview_url` is the public URL of a 720px Gaussian-blurred JPEG generated
client-side at vault upload time. When chatter clicks "Send PPV" we download
this (~30–80 KB) instead of the full original (often 2–8 MB), then forward it
to Telegram — cuts the round-trip from minutes to seconds.

`ppv_sends.error` captures the Telegram-side failure message when a background
delivery fails, so the chatter UI can show "Send failed: TIMEOUT" etc.

`ppv_sends.status` now uses these values (text column, no enum change needed):
| value | meaning |
|---|---|
| `pending` | Row inserted, background delivery not yet started (transient) |
| `sending` | Background task actively uploading to Telegram |
| `sent` | Preview + pay link delivered, waiting on fan to click Pay |
| `paid` | Fan clicked Pay |
| `delivered` | Originals successfully sent to fan |
| `failed` | Delivery failed — see `error` column |

## Table: `ppv_sends` (PPV-send transactions)

One row per "Send PPV" click from /chatter. Links N selected `ppvs` items to a
fan via the chatter's Telegram peer info, and tracks the pay/deliver lifecycle.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| code | text UNIQUE | 8-char random, used in /pay/{code} URL |
| model_id | uuid | References models(id) |
| chatter_id | uuid | References auth.users(id) — who clicked Send |
| peer_id | text | Telegram peer id (positive = user/bot, `-…` chat, `-100…` channel) |
| peer_access_hash | text nullable | gramJS accessHash, needed to address user/channel peers |
| peer_username | text nullable | Snapshot for display on /pay page |
| caption | text nullable | Chatter's optional caption |
| total_price | numeric | Snapshot sum at send time |
| status | text | `pending` → `sending` → `sent` → `paid` → `delivered` (or `failed`) |
| error | text nullable | Last Telegram-side error if `status='failed'` |
| created_at | timestamptz | Default now() |
| paid_at | timestamptz nullable | When Pay button clicked |
| delivered_at | timestamptz nullable | When originals sent back to fan |

```sql
CREATE TABLE ppv_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  chatter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  peer_id text NOT NULL,
  peer_access_hash text,
  peer_username text,
  caption text,
  total_price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  delivered_at timestamptz
);
ALTER TABLE ppv_sends ENABLE ROW LEVEL SECURITY;
-- Service role bypass (server-side admin client does all writes)
CREATE POLICY "Service role full access" ON ppv_sends USING (true) WITH CHECK (true);
```

## Table: `ppv_send_items` (M:N junction)

Which `ppvs` items belong to a given send.

```sql
CREATE TABLE ppv_send_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid NOT NULL REFERENCES ppv_sends(id) ON DELETE CASCADE,
  ppv_id uuid NOT NULL REFERENCES ppvs(id) ON DELETE CASCADE,
  ordinal int NOT NULL DEFAULT 0
);
ALTER TABLE ppv_send_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON ppv_send_items USING (true) WITH CHECK (true);
```

---

## Storage Buckets

| Bucket | Access | Contents |
|---|---|---|
| `vault` | **Public** | Blur thumbnails (JPEG). Path: `{user_id}/{uuid}_thumb.jpg` |
| `content` | **Private** | Full original files. Path: `{user_id}/{uuid}.ext`. Accessed via signed URLs (3600s expiry). |
| `ppvs` | **Public** | Original PPV media uploaded from /ppvs page. Blurred previews are generated on the fly with sharp; no separate blurred-copy stored. |
