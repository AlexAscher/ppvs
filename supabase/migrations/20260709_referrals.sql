-- ════════════════════════════════════════════════════════════════════════
-- Referral links (platform-admin only)
-- Run in the Supabase SQL editor. Re-runnable.
--
-- The platform admin creates named referral links with a revenue-share
-- percent. Agencies that sign up via /signup?ref=CODE are tagged with the
-- code; the admin Referrals tab shows, per link, how many agencies joined and
-- their combined gross revenue (× percent = what we'd owe the referrer).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists referral_links (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  percent     numeric(5,2) not null default 0,   -- 0–100
  created_at  timestamptz not null default now()
);

-- One row per agency that signed up under a code. agency_user_id is the auth
-- user id created on signup approval. Kept in its own table (not a column on
-- models/users) so the join for stats is trivial and a code can be reassigned
-- without touching auth.
create table if not exists referral_signups (
  referral_code  text not null,
  agency_user_id uuid not null,
  created_at     timestamptz not null default now(),
  primary key (referral_code, agency_user_id)
);

create index if not exists referral_signups_code_idx on referral_signups (referral_code);

-- Carry the code from the public signup form through review to approval.
alter table signup_requests add column if not exists referral_code text;

-- RLS: both tables are managed exclusively by the platform admin via
-- service-role API routes (which bypass RLS). Enable RLS with NO policy for
-- the browser role = full deny, so nothing leaks through the shipped anon key.
alter table referral_links enable row level security;
alter table referral_signups enable row level security;
