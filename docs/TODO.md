> Claude: read this file at the start of every session before making any changes. This saves tokens by avoiding a full project scan.

# TODO — Priority Order

Items are ordered by dependency and business impact. Complete top-to-bottom.

---

## ✅ Done

- [x] Supabase auth — login, signup (email/password, roles: chatter/agency)
- [x] Middleware route protection (/dashboard, /vault, /send, /team, /chatter)
- [x] AppLayout with role-based sidebar navigation
- [x] Vault upload — file upload to Supabase Storage + canvas blur thumbnail
- [x] PPV link generation — creates ppv_links record, returns /pay URL
- [x] Fan payment page /pay/[code] — blurred preview, Unlock button, signed URL delivery
- [x] Dashboard — real DB stats for agency, status view for chatter
- [x] Team management — agency invites chatters, chatter accepts/declines
- [x] Chatter workspace /chatter — full static UI (fan list, chat, action panel)
- [x] Docs folder created

---

## 🔴 High Priority

### 1. Payment Integration

- [ ] NOWPayments webhook endpoint (`/api/webhooks/nowpayments`)
- [ ] Mark `is_paid=true` when payment confirmed
- [ ] Generate signed URL and deliver via response or Telegram
- [ ] CCBill integration (cards, 30-day hold)
- [ ] Show both payment options on `/pay/[code]`

### 2. Model Management

- [ ] `/models` page or modal: add/edit/delete creator accounts
- [ ] `models` table in Supabase: id, owner_id, name, telegram_account, created_at
- [ ] Link vault_items and ppv_links to a model_id
- [ ] ModelSelector in /chatter pulls real models from DB

### 3. Real Fan Data

- [ ] `fans` table: id, model_id, telegram_username, tags, notes, total_spent, created_at
- [ ] Fan list in /chatter pulls from DB filtered by selected model
- [ ] Notes save to DB (currently local state only)
- [ ] Emoji tags auto-assign based on total_spent thresholds

---

## 🟡 Medium Priority

### 4. Telegram MTProto Integration

- [ ] MTProto session management (Telegram account login per model)
- [ ] Embed real Telegram DM view in center column of /chatter
- [ ] Send PPV card + pay link via Telegram DM automatically
- [ ] Receive incoming messages, show in real-time
- [ ] Map incoming fan Telegram IDs to `fans` table records

### 5. Real Chatter Stats

- [ ] `/chatter` Stats tab pulls from `ppv_links` where chatter_id = current user
- [ ] Track which chatter generated each PPV link
- [ ] Chatter leaderboard for agencies (internal)

### 6. Dashboard Model Filter

- [ ] Agency dashboard: filter all stats by selected model
- [ ] ModelSelectorBar in /dashboard (like in /chatter)

### 7. chatter.ppvs.io Subdomain

- [ ] Next.js middleware: detect subdomain, redirect to chatter login
- [ ] Simplified layout for chatter subdomain (no agency features)
- [ ] Vercel domain config

---

## 🟢 Lower Priority

### 8. Chatter Workspace Improvements

- [ ] Fan search with real DB query
- [ ] Fan profile drawer (slide-out panel with full history)
- [ ] Quick replies (saved message templates)
- [ ] Paid Buyers filter in fan list
- [ ] Fortune Wheel / Gambling PPV type (from Chatters Guide)

### 9. AI Autopilot (Phase 2)

- [ ] Claude API integration for automated responses
- [ ] Persona setup per model
- [ ] $149/month billing via Stripe
- [ ] 1-day free trial
- [ ] Toggle on/off per model

### 10. Analytics

- [ ] Conversion rate tracking (links sent vs paid)
- [ ] Revenue charts per model per time period
- [ ] Chatter performance comparison
- [ ] Export CSV

### 11. Settings Page

- [ ] `/settings` — profile edit, password change
- [ ] Agency: manage subscription, billing
- [ ] Notification preferences

### 12. Email / Notifications

- [ ] Custom SMTP via Resend or SendGrid (removes Supabase rate limit)
- [ ] Notification when a PPV is unlocked
- [ ] Daily earnings summary email

---

## Known Issues / Tech Debt

- `@next/font` deprecation warning — migrate to `next/font` (low priority, cosmetic)
- `scroll-behavior: smooth` on `<html>` — add `data-scroll-behavior="smooth"` attribute
- Supabase `createBrowserClient<Database>` generic doesn't propagate in `@supabase/ssr@0.10.3` — all DB queries use explicit `as { data: Type }` casts
- /chatter Telegram chat is static placeholder only (real MTProto integration is Phase 2)
- Chatter stats tab shows hardcoded values — needs real DB queries
