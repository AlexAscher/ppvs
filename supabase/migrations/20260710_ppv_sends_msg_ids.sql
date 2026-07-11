-- ════════════════════════════════════════════════════════════════════════
-- Persist Telegram message ids for each PPV send
-- Run in the Supabase SQL editor. Re-runnable.
--
-- Chatters need to delete/edit PPV bubbles the same way they delete/edit
-- normal text messages. To reach into Telegram we need the underlying
-- message ids of what we sent:
--   - Native paid media (via @ppvstarbot business connection): one message id.
--   - Free MTProto album (via the model account): 1..N message ids per chunk.
--
-- Also stash how the send happened so DELETE/PATCH know which API to hit:
--   'business' → bot API deleteMessage / editMessageCaption with
--                business_connection_id.
--   'mtproto'  → gramJS messages.deleteMessages / editMessage on the model
--                account's own outbox.
--
-- Nullable so pre-migration rows keep working (client hides "Edit" and does
-- best-effort DB-only delete for them).
-- ════════════════════════════════════════════════════════════════════════

alter table ppv_sends add column if not exists telegram_msg_ids int[];
alter table ppv_sends add column if not exists send_channel text
  check (send_channel in ('business', 'mtproto'));
