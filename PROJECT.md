# PROJECT.md — ppvs.io reference map

Single source of truth for what exists in this codebase. Keep it updated when features land so sessions don't re-explore from scratch.

> Last synced: batch 18 (2026-06). When you add/remove a feature, update the relevant section here in the same commit.

---

## 1. What the product is

**ppvs.io** — an all-in-one management platform for OFM (OnlyFans-management) agencies that sell **PPV content and tips inside Telegram**. An agency connects its creators' real Telegram accounts; chatters work the DMs from inside ppvs.io; fans pay by card/crypto via a hosted checkout and content auto-unlocks. Platform takes a **10% fee**; payouts are crypto, no KYC.

Three actor roles:
- **Agency owner** (`role: "agency"`) — owns creators, manages chatters, sees all revenue, withdraws funds.
- **Chatter** (`role: "chatter"`) — works assigned creators' DMs, sends PPVs/tips, sees only own sales.
- **Platform admin** — you (the operator). Separate `/admin` panel over all agencies. Gated by `lib/admin-auth.ts`.

---

## 2. Stack & infra

- **Next.js 16.2.6** App Router + **Turbopack**, **React 19**, TypeScript strict.
- **Supabase**: Postgres + Auth + Storage. `service_role` key bypasses RLS (all API routes use it via `createAdminSupabaseClient`); browser uses `anon`/`authenticated` (subject to RLS).
- **Telegram**: gramJS MTProto (`telegram` npm package). Real user sessions, not bots (except Sales Alerts which use a bot).
- **Payments**: **Malum** hosted checkout + webhook (`malum.co`).
- **Hosting**: a VPS running the Next.js server (pm2). Media/MTProto need a stable link.
- Path alias `@/` → `src/`.

### Deploy model (CRITICAL)
Production serves **`origin/main`**. All work happens on branch `claude/romantic-banach-ef0018`. **Pushing the branch does NOT deploy** — you must fast-forward main: `git push origin claude/romantic-banach-ef0018:main`. Then the server pulls main + rebuilds. Symptom of forgetting: "I don't see changes" → check `git log origin/main..HEAD`.
Worktree builds have no `.env` — copy `../../../.env.local` to build locally, then delete it (it's gitignored). Full build gate: `npx next build` with env present.

### Standing constraints
- **No `Co-Authored-By: Claude` trailer** in commits (user instruction).
- `Create_prompt_design/` and `Create_start_design/` must stay gitignored (design refs, never pushed).

---

## 3. Routes (pages)

| Route | Purpose |
|---|---|
| `/` | Marketing landing (dark theme, inline styles). Auth-aware CTAs. Payment-method marquee w/ inline SVG logos (`PayIcon`). No auto-redirect. |
| `/login`, `/signup`, `/signup/confirm` | Auth (Supabase). |
| `/dashboard` | Agency dashboard: revenue stats, per-model/chatter breakdown, **Wallet** (balance + withdrawals + crypto address), Settings (payout splits, sales alerts, eco, auto-replies). Tabs incl. PPVs/Vault, Creators, Chatters. |
| `/chatter` | The chatting workspace (used by BOTH agency & chatter roles). 3-pane: dialog list / TelegramChat / ActionPanel. Model selector bar. **Uses `chatter-page-classic/*` components.** |
| `/admin` | Platform-admin panel over all agencies (`AdminClient`). Overview, agencies drill-down, global PPV review **Vault** (w/ per-creator model filter), fan exports. |
| `/mini` | Telegram Mini App checkout (PPV/tip pay screen). Brand-neutral. Verifies `initData` server-side. |
| `/pay/[code]`, `/pay/[code]/success` | Web pay flow (fallback to mini app): enter email → Malum checkout → success reveals originals. |
| `/tip/[code]` | Web tip pay flow. |
| `/send`, `/team`, `/vault` | Secondary/legacy entry points. |
| `/terms`, `/privacy`, `/dmca` | Legal stub pages (placeholder templates via `legal/LegalShell`). |

---

## 4. API endpoints (`src/app/api`)

All server routes use the admin (service_role) client; auth is enforced per-route via `getCachedAuthUser()` / `authorizeModelAccess()` / `requireAdmin()`.

**Telegram (MTProto):** `telegram/send-code`, `telegram/verify-code`, `telegram/check-password` (2FA), `telegram/dialogs/[modelId]` (dialog list + source-of-truth activity bumps), `telegram/messages/[modelId]` (history + send, supports `scheduleDate`), `telegram/media/[modelId]` (media proxy: 1GB LRU cache + true video streaming), `telegram/avatar/[modelId]` (creator avatar), `telegram/fan-avatar/[modelId]` (fan avatar, Storage-cached; agency OR assigned chatter), `telegram/mark-read/[modelId]`, `telegram/activity/[modelId]` (presence/typing), `telegram/refresh/[modelId]`, `telegram/stream/[modelId]` (SSE).

**PPV:** `ppv/send` (create send + bg Telegram delivery, `scheduleDate`), `ppv/send/status`, `ppv/deliver` (web/mini unlock), `ppv/file/[ppvId]` (signed Storage URL: preview public, original auth-gated), `ppv/pricing-stats`.

**Tips:** `tips/send` (creates tip + TG link, `scheduleDate`), `tips/deliver` (mark paid — currently NO real Malum charge).

**Payments/payouts:** `payments/malum/create` (open Malum checkout), `webhooks/malum` (COMPLETED → mark paid + deliver), `payouts` (GET balance/list, POST request withdrawal — manual), `payout/report` (live — feeds the dashboard read-only "Agency split" card). (`payout/splits` + `payout/export` were deleted with the Settings split-config UI.)

**Fans:** `fans/[modelId]` (profile CRUD), `.../notes`, `.../stats`, `.../history`, `.../engagement`, `.../timezone`, `fans/[modelId]/batch` (tags + spent for many peers; spent is per-chatter for chatters, total for agency).

**Chatters/team:** `chatters/invite`, `chatters/[id]` (PATCH reassign / DELETE — legacy single-row), `chatters/assignments` (POST/DELETE add/remove a model — multi-model), `chatters/remove` (delete chatter entirely), `chatters/stats`, `chatters/invitations/[id]`, `chatter/stats`, `chatter/agency`.

**Groups (fan categories):** `groups`, `groups/[id]`, `groups/[id]/members`, `groups/for-fan`.

**Admin:** `admin/whoami`, `admin/overview`, `admin/agencies`, `admin/agencies/[agencyId]`, `admin/agencies/[agencyId]/fans-export`, `admin/ppvs`, `admin/ppvs/[id]` (approve/reject moderation).

**Misc:** `dashboard/stats` (RPC fast-path `fn_dashboard_core` + fallback), `stats/[modelId]`, `alerts/*` (sales-alert bot connect/channels/settings/test), `eco` (eco mode), `auto-reply/[modelId]`, `templates/[modelId]` (quick replies), `labels` + `labels/status` (dialog categories), `inbox`, `search`, `presence`, `chat-events/[modelId]` (chatter-only system events), `notifications/pulse` (payment toasts), `settings/agency-name`, `mini/init`.

---

## 5. Key libraries (`src/lib`)

- `supabase.ts` / `supabase-server.ts` — browser & server (`createAdminSupabaseClient` = service_role; `createSupabaseServerClient` = SSR session) clients.
- `telegram-authorize.ts` — `authorizeModelAccess(modelId)`: agency owner OR assigned chatter (scoped by `model_id` — multi-model safe). Cached.
- `telegram-pool.ts` — `withTelegramClient(...)`: pooled MTProto client per model.
- `telegram-client.ts`, `telegram-media.ts`, `telegram-avatar.ts`, `telegram-peer.ts` (`buildPeer`), `telegram-activity.ts`, `telegram-webapp.ts` (`buildMiniAppLink`), `fan-activity.ts` (source-of-truth `last_response_at`/`last_read_at`).
- `crypto.ts` — `decryptIfNeeded` (session/api_hash; "v1:" prefix = encrypted).
- `ppv-delivery.ts` — `sendBlurredPreviewWithLink`, `sendOriginalsAlbum`, `generatePpvCode`; all accept `scheduleDate`. Handles album/single, file_id cache, blur.
- `ppv-storage.ts` (`uploadPpvMedia`, `ppvMediaPathFromUrl`, `validatePpvFile`), `ppv-file-cache.ts` (Telegram file_id reuse).
- `malum.ts` — `createMalumPayment` (POST /api/v2/payment/create), `verifyMalumWebhookSignature` (MD5 txn|timestamp|webhook_key).
- `platform.ts` — `PLATFORM_FEE_PCT` (env, default 0.10), `agencyNet`, `platformFee`.
- `payout.ts` — split resolution (chatter > model > agency-default > 50/20/30) + period report + CSV.
- `sales-alerts.ts` / `alert-bot.ts` — bot-based sale notifications to a TG channel.
- `auto-reply.ts`, `use-eco.ts`, `rate-limit.ts` (in-memory `globalThis.__ppvs_rate_buckets__`), `admin-auth.ts`, `auth-cache.ts`, `emoji.ts`, `twemoji` (emoji → image rendering).

---

## 6. Components (`src/components`)

- **`chatter-page-classic/`** — ACTIVE chatting UI (1:1 of Create_prompt_design): `TelegramChat` (3-pane chat), `ActionPanel` (Send PPV / Tips / Notes / Stats tabs), `SchedulePopover` (shared, `align` prop), `Topbar`, `ModelSelectorBar`.
- **`chatter-page/`** — shared/legacy pieces: `EmojiPicker` (9-category full picker, `anchored` prop for fixed positioning), `QuickReplyModal` (templates, `canManage`), `FanProfileDrawer`, `MessageContextMenu`, `FanGroupsSection`, etc. (Note: `chatter-page/TelegramChat` + `ActionPanel` are the older variant.)
- **`ppv/`** — `PPVsTab` (vault: groups, tags, bulk ops, moderation badges), `PpvFormModal`, `CreateGroupModal`, `EditGroupModal`, `TagManagerModal`, `PpvMediaInput`, `EmojiPicker` (ppv's own small one).
- **`chatters/`** — `ChattersTab` (one row per chatter, multi-model select), `ChatterModelMultiSelect` (fixed-position checklist), `ChatterStatsModal`, `InviteChatterModal`, `ChatterDashboardLayout`.
- **`settings/`** — `SettingsTab`, `SalesAlertsSection`, `EcoModeSection`, `AutoRepliesSection`. (No payout/split section — removed.)
- **`admin/AdminClient.tsx`** — whole admin panel (overview, agencies, Vault w/ model filter).
- **`inbox/InboxTab`**, **`legal/LegalShell`**, **`NotificationToaster`** (payment toasts via `ppvs:payment` CustomEvent), `AppLayout`, `GlobalSearch`, `GlobalEmojiSwap`, `ui/Toggle`, `ui/NumberField`.

---

## 7. Database (Supabase Postgres)

Exact schema lives in `supabase/migrations/*.sql`. Core tables:

- `models` — creator accounts (name, username, avatar_url, `agency_user_id`, encrypted `session_string`/`api_id`/`api_hash`, `session_status`).
- `agency_chatters` — chatter↔model assignments. `(agency_id, chatter_id, model_id, joined_at, invitation_id)`. **One row per (chatter, model)** since multi-model (migration `20260620`); unique `(agency_id, chatter_id, model_id)`.
- `invitations` — chatter invites.
- `fans` — per (model_id, peer_id): `total_spent`, `tags`, `telegram_username/name`, bio/birthdate/location, `last_seen_at`/`last_response_at`/`last_read_at`.
- `fan_notes`.
- `ppvs` — vault items (`agency_user_id`, `model_id`, `group_id`, name, price, `media_url`, `preview_url`, `tg_file_id`, `review_status` pending/approved/rejected, `review_notes`).
- `ppv_groups` (`bundle_price`), `ppv_tags`, `ppv_item_tags`, `ppv_group_tags`.
- `ppv_sends` — a send (`code`, `model_id`, `chatter_id`, peer, `caption`, `status` sending/sent/paid/delivered/failed, `total_price`, `expires_at`, `malum_txn`, `customer_email`, paid/delivered timestamps).
- `ppv_send_items` — `(send_id, ordinal, ppv_id)`.
- `tips` — (`code`, `model_id`, `chatter_id`, peer, `amount`, `message`, `status`).
- `payouts` — withdrawal requests (`agency_user_id`, `amount`, `address`, `status` pending/paid/rejected).
- `payout_splits`, `agency_settings` (default split, eco, etc.).
- `fan_groups` (+ memberships) — fan categories (color/emoji) for the dialog filter.
- `chat_system_events` — chatter-only in-chat banners on tip/PPV paid.
- alerts (channels/settings), `labels` (+ status), auto-reply, presence tables.
- `mass_dm_*` — **REMOVED feature** (tables may linger; UI gone since batch 8).

**Migrations still pending in prod (run in Supabase SQL editor):** `20260618_rls.sql`, `20260619_perf_rpc.sql`, `20260620_chatter_multi_model.sql`. Optionally flip the `ppvs` Storage bucket to Private (code already signs URLs for both modes).

---

## 8. Feature areas (detail)

- **Auth & roles** — Supabase email auth. Role in `user_metadata.role`. `/chatter` serves both; agency sees all its models, chatter sees assigned ones.
- **Telegram connect** — `/dashboard` Creators: enter phone → `send-code` → `verify-code` (+ 2FA `check-password`). Session encrypted at rest.
- **Chatting workspace** (`/chatter`) — live dialog list (poll + SSE hybrid), read receipts (✓/✓✓), typing/online, quick-reply templates, quick-emoji bar, scheduled messages, fan profile drawer, fan group filter.
- **PPV / Vault** — agency uploads media → tagged, grouped, bundle pricing. **Moderation:** new uploads `pending` → admin approves before chatters can send. Chatter picks items (or bundle), sets price (or free), optional caption (+ emoji picker), urgency expiry, **schedule**. Blurred preview + pay link to fan; auto-unlock on payment.
- **Tips** — chatter requests a tip (amount + optional message w/ emoji + schedule). Link to fan. NOTE: payment not wired through Malum yet.
- **Fans** — profile (bio/birthday/location/timezone), notes, emoji tags, spend history, engagement, buying-power. "Spent" badge per-chatter for chatters / total for agency.
- **Chatters/team** — invite by email; assign to **multiple** creators (multi-select); per-chatter earnings; presence (online/last-active); private stats.
- **Payments (Malum)** — see §9.
- **Payouts** — agency Wallet balance = Σ `agencyNet(paid sales)` − non-rejected payouts; request withdrawal (manual today). Dashboard shows a **read-only "Agency split" card** (gross / fee / agency cut / owed to creators / owed to chatters + per-pair table) via `/api/payout/report`. The split **config UI was removed** (Settings → Payout & Split section deleted, batch 20) — so splits are NOT configurable from the UI and use defaults (`agency_settings` default or hardcoded 50/20/30); the read-only card just visualizes them. `/api/payout/splits` + `/api/payout/export` (CSV) + `PayoutSection.tsx` + `reportToCsv` are gone.
- **Sales Alerts** — connect a TG bot + channel; fires on each paid PPV/tip.
- **Eco mode** — reduces polling cadence; messages stay instant.
- **Auto-reply** — per-model delayed auto-replies.
- **Mini App** — Telegram-native checkout; `mini/init` verifies initData (HMAC).
- **Admin** — cross-agency overview, agency drill-down (new-tab deep links `?agency=`), global PPV review Vault (per-creator filter), fan TXT exports (all/paying/ranked).
- **Landing/legal** — `/` marketing + `/terms`,`/privacy`,`/dmca`.

---

## 9. Payments & economics (Malum)

- **In:** `/api/payments/malum/create` → Malum hosted checkout (`POST malum.co/api/v2/payment/create`, header `MALUM: {MID}:{SECRET}`). Webhook `/api/webhooks/malum` acts on `COMPLETED` (sig = MD5 `txn|timestamp|webhook_key`); idempotent; marks paid + delivers Telegram album + sales alert + bumps `total_spent`.
- **Single pooled merchant account** (the owner's). Per-agency attribution is the DB ledger, not Malum.
- **Fee model (intentional):** buyer charged `base × 1.10` (`merchant_pays_gw_fees: true`) — the +10% surcharge covers Malum's gateway cut. Agency balance credited `agencyNet = base × 0.90` — the platform's real 10% margin. Net platform take ≈ 10%. (Both the surcharge and the deduct are deliberate — do NOT "fix" to one.)
- **Out (payouts) — NOT yet implemented automatically.** Plan: `POST malum.co/api/v3/account/payout` `{ amount(USD, min 1.01), currency, network, address }`, header `MALUM: {MID}:{SECRET}`, **live keys only** (no sandbox). Malum payout fee 1% + network + account instant-fee. Available currencies via `GET /api/v3/account/currencies`. Landing advertises BTC/ETH/LTC/XMR/USDT/USDC.
- **Tips through Malum** — not wired (tips/deliver marks paid w/o charge). TODO if real tip revenue is needed.

---

## 10. Conventions

- Money rounded to cents; agency takes rounding remainder so splits sum exactly.
- Pay codes: 12-char from `generatePpvCode()`, non-enumerable.
- Process-global Maps for cross-request state: rate-limit buckets, auth caches, fan-activity (`__ppvs_last_incoming_date__`, `__ppvs_last_outbox_max__`). Single-process only.
- `scheduleDate`: high-level `tg.sendMessage` uses `schedule`; raw `Api.messages.*` constructors + `sendFile` use `scheduleDate`.
- English-only user-facing copy. Twemoji for emoji rendering.
- Verify changes with `npx tsc --noEmit` + `npx eslint <files>`; full gate `npx next build` (needs env copied in).

---

## 11. Known issues / TODO

- Run the 3 pending migrations (§7) in Supabase prod.
- Malum **payout API** automation (§9) — currently manual withdrawals.
- **Tips** don't collect real money (no Malum charge).
- Pre-existing lint warnings (e.g. `pricingHint` unused in classic ActionPanel) — not regressions.
- Legal pages are placeholder templates — replace with reviewed copy; DMCA agent details are a placeholder.
- Landing feature-preview panels + "How it works" images are grey placeholders awaiting real screenshots.
