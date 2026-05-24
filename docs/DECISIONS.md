> Claude: read this file at the start of every session before making any changes. This saves tokens by avoiding a full project scan.

# Product Decisions

Key decisions that affect architecture and implementation choices.

---

## Pricing Model
- **One plan only:** Free with a **10% commission** on all sales
- No monthly fee, no limits
- Agency keeps 87.5% net (after platform fee) — displayed as "Net" in dashboard
- Chatter sees only their own total sales; commission split between agency and chatter is private and handled externally

---

## AI Autopilot (Phase 2)
- **$149/month per model** with a 1-day free trial
- AI handles fan conversations automatically using creator persona
- Built on Claude API (Anthropic)
- Not in scope for Phase 1

---

## Telegram Integration
- Phase 1: MTProto API embedded inside chatter.ppvs.io
- Chatters work entirely inside ppvs.io — no need to open Telegram separately
- Each "model" maps to one Telegram account (not bot, real account via MTProto)
- The center column in `/chatter` is a real embedded Telegram DM window
- **Currently:** Static UI placeholder only

---

## Payments
- **Crypto:** NOWPayments — instant settlement, no holds
- **Cards:** CCBill — 30-day rolling hold on funds
- Both options shown to fan on `/pay/[code]`
- After payment confirmed: webhook marks `is_paid=true`, signed URL generated (24hr expiry), content auto-delivered to fan via Telegram DM

---

## Content Delivery
- Full files stored in private `content` Supabase Storage bucket
- After payment: `createSignedUrl(filePath, 3600)` — 1hr signed URL
- URL sent via Telegram DM automatically (Phase 2 — currently returned to fan on web page)
- Thumbnails stored in public `vault` bucket (CSS-blurred on fan page)

---

## Account Roles
- **Agency:** Creates and manages chatter accounts. Invites chatters by email from /team page. Sees all models and full analytics.
- **Chatter:** Receives invitation from agency. Accepts on /team page. Works under agency supervision. Only sees their own sales totals.
- Agency creates "model" entries (creator Telegram accounts) — chatters are assigned models to work

---

## Fan Emoji Auto-Tags
Auto-assigned based on spending behavior:

| Emoji | Trigger |
|---|---|
| 🔴 | No spend in last 3 days |
| 💵 | First purchase ever |
| 💰 | $25+ total spent |
| 💸 | $50+ total spent |
| ⭐ | $100+ total spent |
| 👑 | $500+ total spent |

---

## Vault & Content Tagging
- Each vault item has tags: Photos, Videos, Bundles, Beach, Premium (extensible)
- Chatters use filter pills in Send PPV tab to quickly find content
- Multi-select: pick multiple items, prices sum automatically

---

## PPV Sending Flow
1. Chatter selects vault items in right panel
2. Writes optional caption
3. Price auto-calculates (sum of selected items)
4. Clicks "Send PPV to @username"
5. System generates PPV link record in `ppv_links`
6. Sends blurred preview card + pay link to fan via Telegram DM (Phase 2)
7. Fan opens link, sees blurred thumbnails, pays
8. Content unlocks automatically

---

## chatter.ppvs.io Subdomain
- Separate simplified UI for chatters only
- Agency connects Telegram account once; chatters just log in and work
- No agency admin features — purely workspace
- **Status:** Planned, not built

---

## Dashboard Scope by Role
- **Agency:** Sees all models' stats, full team management, all PPV links
- **Chatter:** Sees only their own metrics (PPV sent, conversion rate) — not agency totals or commission details
- Same codebase, role-gated views
