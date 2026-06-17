-- Add currency + network columns to payouts so the new Wallet UI can
-- record which crypto the agency requested. Both nullable for backward
-- compatibility with the simple address-only payout requests.
alter table payouts add column if not exists currency text;
alter table payouts add column if not exists network text;
