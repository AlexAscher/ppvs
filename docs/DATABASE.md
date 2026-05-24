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

## Storage Buckets

| Bucket | Access | Contents |
|---|---|---|
| `vault` | **Public** | Blur thumbnails (JPEG). Path: `{user_id}/{uuid}_thumb.jpg` |
| `content` | **Private** | Full original files. Path: `{user_id}/{uuid}.ext`. Accessed via signed URLs (3600s expiry). |
