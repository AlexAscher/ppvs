-- Batch 93c: auto-replies pull media from the Vault (multi-select) and
-- optionally price it in Telegram Stars — mirroring the chatter compose
-- flow. Legacy uploaded auto_reply_media_url / _type is cleared per the
-- product decision "старые конфиги обнулить" (see batch 93c planning).

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS auto_reply_stars INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_reply_ppv_ids UUID[] NOT NULL DEFAULT '{}';

UPDATE models
   SET auto_reply_media_url = NULL,
       auto_reply_media_type = NULL
 WHERE auto_reply_media_url IS NOT NULL;
