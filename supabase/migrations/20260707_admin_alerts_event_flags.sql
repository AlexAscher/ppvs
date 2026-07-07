-- Batch 96: bring the /admin Sales Alerts section into parity with the
-- per-agency SalesAlertsSection — per-event toggles (PPV / Tips) so the
-- platform owner can dial down which sale types actually ping.
--
-- Existing rows default to both enabled — matches the current behaviour
-- (fan-out on every PPV + tip sale).

ALTER TABLE admin_sales_channels
  ADD COLUMN IF NOT EXISTS alerts_ppv BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alerts_tips BOOLEAN NOT NULL DEFAULT TRUE;
