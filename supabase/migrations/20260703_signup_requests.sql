-- v3 (temporary): all new signups land in signup_requests instead of
-- auth.users. An admin reviews the list from the admin panel and can
-- approve or reject each row. Once we reintroduce the email OTP flow this
-- table stays as an audit log.
create table if not exists signup_requests (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  display_name  text,
  role          text not null default 'agency',
  agency_name   text,
  status        text not null default 'pending', -- pending | approved | rejected
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  note          text
);
create index if not exists signup_requests_status_idx on signup_requests(status, created_at desc);
create unique index if not exists signup_requests_pending_email_idx
  on signup_requests(lower(email)) where status = 'pending';
