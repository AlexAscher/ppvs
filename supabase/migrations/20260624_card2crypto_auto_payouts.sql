-- ════════════════════════════════════════════════════════════════════════
-- card2crypto auto-payouts ledger
--
-- When a card2crypto sale lands in the platform pool wallet, the server
-- auto-sends 90% to the agency's own wallet on Polygon. This table is BOTH:
--   • the idempotency guard  — UNIQUE(kind, code) means a duplicate/retried
--     callback can't double-send the 90% (insert-before-send; conflict = skip).
--   • the ledger             — what was paid to whom, the tx hash, and status.
--
-- status: 'pending' (row claimed, send in flight) | 'sent' (tx broadcast)
--         | 'manual' (couldn't auto-send, e.g. pool didn't receive USDC —
--           needs the operator to pay by hand) | 'failed'.
--
-- Re-runnable.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists agency_auto_payouts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('ppv', 'tip')),
  code          text not null,
  agency_id     uuid,
  model_id      uuid,
  to_address    text,
  amount_usdc   numeric not null default 0,
  tx_hash       text,
  status        text not null default 'pending',
  note          text,
  created_at    timestamptz not null default now(),
  unique (kind, code)
);

create index if not exists agency_auto_payouts_agency_idx
  on agency_auto_payouts (agency_id, created_at desc);

-- RLS: server (service_role) bypasses. Agencies may read their own rows so a
-- future dashboard view can show auto-payouts. No client writes.
alter table agency_auto_payouts enable row level security;
drop policy if exists agency_auto_payouts_select on agency_auto_payouts;
create policy agency_auto_payouts_select on agency_auto_payouts
  for select to authenticated
  using (agency_id = auth.uid());
