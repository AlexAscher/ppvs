-- Store the password chosen at signup so the admin can materialise the
-- account on approval without a separate reset flow. Temporary manual-review
-- approach — the column is dropped once we move back to self-serve signup.
alter table signup_requests add column if not exists password text;
