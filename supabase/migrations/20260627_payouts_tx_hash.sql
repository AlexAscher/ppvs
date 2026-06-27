-- Record the on-chain TON tx hash (and an optional admin note) when the
-- operator marks a payout request as paid. By-request payouts: the admin
-- reviews, withdraws Stars→TON on Fragment, sends USDT-TON, then pastes the
-- tx hash here.
alter table payouts add column if not exists tx_hash text;
alter table payouts add column if not exists note text;
