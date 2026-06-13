-- chat_system_events: per-fan system notes that ONLY chatters see inside
-- their chat view. We log them when the customer completes a tip or PPV
-- payment so the chatter immediately notices the sale without leaving the
-- conversation. Fans never see these — they live entirely in our DB and
-- are merged into the chatter UI client-side.

create table if not exists chat_system_events (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  peer_id text not null,
  kind text not null check (kind in ('tip_paid', 'ppv_paid')),
  amount numeric(10, 2),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_system_events_lookup_idx
  on chat_system_events(model_id, peer_id, created_at desc);
