-- ============================================================================
-- Migration state diagnostic (batch 99, P2-1)
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. Every row's `applied` column tells you
-- whether the matching migration file from `supabase/migrations/` has already
-- been executed against this database.
--
-- Use it before running the batch 99 migrations so you don't re-apply
-- anything, and to confirm the trio flagged as "pending" in PROJECT.md
-- (20260618_rls, 20260619_perf_rpc, 20260620_chatter_multi_model) is
-- actually pending or was already applied silently.
-- ============================================================================

WITH checks AS (
  SELECT '20260616_ppv_moderation.sql'                   AS migration,
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'ppvs' AND column_name = 'review_status'
         ) AS applied
  UNION ALL SELECT '20260617_chat_system_events.sql',
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_system_events')
  UNION ALL SELECT '20260618_rls.sql (RLS policies on core tables)',
         EXISTS (
           SELECT 1 FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename IN ('fans', 'ppvs', 'models', 'ppv_sends')
         )
  UNION ALL SELECT '20260619_perf_rpc.sql (fn_dashboard_core RPC)',
         EXISTS (
           SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'fn_dashboard_core'
         )
  UNION ALL SELECT '20260620_chatter_multi_model.sql (agency_chatters.model_id)',
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'agency_chatters' AND column_name = 'model_id'
         )
  UNION ALL SELECT '20260628_models_tg_user_id.sql',
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'models' AND column_name = 'tg_user_id'
         )
  UNION ALL SELECT '20260703_signup_requests.sql',
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signup_requests')
  UNION ALL SELECT '20260706_admin_sales_channels.sql',
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_sales_channels')
  UNION ALL SELECT '20260706_auto_reply_vault.sql (models.auto_reply_stars)',
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'models' AND column_name = 'auto_reply_stars'
         )
  UNION ALL SELECT '20260708_admin_alerts_multichannel.sql (id UUID PK)',
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'admin_sales_channels' AND column_name = 'id'
         )
  UNION ALL SELECT '20260709_ppv_thumb_url.sql (batch 99 — MUST run before deploy)',
         EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'ppvs' AND column_name = 'thumb_url'
         )
  UNION ALL SELECT '20260709_scale_indexes.sql (batch 99 P2 — hot-path indexes)',
         EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND indexname = 'idx_ppv_sends_model_status_paid_at'
         )
)
SELECT
  migration,
  CASE WHEN applied THEN '✅ applied' ELSE '⚠️  NOT applied' END AS status
FROM checks
ORDER BY migration;

-- ----------------------------------------------------------------------------
-- Reading the result
-- ----------------------------------------------------------------------------
-- ✅ applied      — the migration file is already on this DB. Do NOT re-run.
-- ⚠️  NOT applied — copy the .sql from supabase/migrations/<name> into a fresh
--                   SQL editor tab and run it.
--
-- If 20260618_rls (RLS policies) says NOT applied and you're on production,
-- run it — the API routes use the `service_role` client which bypasses RLS,
-- so nothing broke without it, but leaving RLS off leaves the anon key
-- exposed to whatever it CAN see per Supabase's row visibility defaults.
--
-- If 20260619_perf_rpc says NOT applied, the /api/dashboard/stats endpoint is
-- falling back to a slow multi-query path; run the file to activate the RPC.
