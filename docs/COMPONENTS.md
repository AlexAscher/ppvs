> Claude: read this file at the start of every session before making any changes. This saves tokens by avoiding a full project scan.

# Components

## Existing Components

---

### Logo / LogoWord
- **File:** `src/app/logo.tsx`
- **Purpose:** Brand logo icon and wordmark
- **Props:** `size?: number`
- **Used in:** Landing page, login, signup, confirm, AppLayout

---

### AppLayout
- **File:** `src/components/AppLayout.tsx`
- **Purpose:** Shared authenticated layout with sidebar + topbar for all dashboard pages
- **Props:** `children: React.ReactNode`
- **Features:**
  - Role-aware nav: Agency sees (Dashboard, Send PPV, Vault, Chatting, Team, Payouts); Chatter sees (Dashboard, Chatting, Team, Vault, Send PPV)
  - Active route highlighting via `usePathname()`
  - Real sign-out via `supabase.auth.signOut()`
  - User display name + initials from `user.user_metadata.display_name`
  - Role label in sidebar footer
- **Used in:** /dashboard, /vault, /send, /team

---

### KpiCard
- **File:** `src/app/dashboard/page.tsx` (inline)
- **Purpose:** Stat card with label, value, and sub-label
- **Props:** `label, value, sub, highlight?`
- **Used in:** Agency dashboard view

---

### ActivityTable
- **File:** `src/app/dashboard/page.tsx` (inline)
- **Purpose:** Table of recent PPV sales with fan, amount, type badge
- **Props:** `rows: ActivityItem[]`
- **Used in:** Agency dashboard view

---

### VaultGrid + VaultItem
- **File:** `src/app/vault/page.tsx` (inline)
- **Purpose:** Grid of uploaded vault items with blur thumbnails, hover-to-delete
- **Props:** `items, onDelete, thumbUrls`
- **Used in:** /vault

---

### UploadModal
- **File:** `src/app/vault/page.tsx` (inline)
- **Purpose:** Drag-drop upload modal with progress bar and canvas blur thumbnail generation
- **Key function:** `generateBlurThumb(file)` — canvas blur + dark overlay → JPEG blob
- **Used in:** /vault

---

### PPVCard (fan-facing)
- **File:** `src/app/pay/[code]/PayClient.tsx`
- **Purpose:** Blurred preview card shown to fans. "Locked" state with blur, "Unlocked" shows real content.
- **Props:** `code, title, price, thumbUrl, fileType`
- **States:** locked → loading → unlocked / error
- **Used in:** /pay/[code]

---

### ModelSelectorBar
- **File:** `src/app/chatter/page.tsx` (inline)
- **Purpose:** Horizontal pill buttons for switching between creator models
- **Features:** Unread dot (single unread), count badge (multiple unreads), animate-pulse on dot
- **Used in:** /chatter

---

### FanList
- **File:** `src/app/chatter/page.tsx` (inline)
- **Purpose:** Left column fan list with avatar, emoji tag, username, spent amount
- **Features:** Search filter, model tag when "All models" selected, active fan highlight
- **Used in:** /chatter

---

### ChatWindow
- **File:** `src/app/chatter/page.tsx` (inline)
- **Purpose:** Telegram-style chat with messages, PPV cards, payment confirmations, input bar
- **Status:** Static placeholder — real Telegram integration via MTProto API is Phase 2
- **Message types:** incoming, outgoing, ppv (blurred grid card), payment (success pill)
- **Used in:** /chatter

---

### SendPPVPanel (ActionPanel)
- **File:** `src/app/chatter/page.tsx` (inline)
- **Purpose:** Right-column tabbed panel: Send PPV / Tips / Notes / Stats
- **Send PPV tab:** Filter tags → vault grid (multi-select) → caption textarea → price auto-sum → Send button
- **Tips tab:** Preset amounts ($5/$10/$20/$50/$100) + custom input + message + Request button
- **Notes tab:** Fan notes textarea + save + Emoji tag legend
- **Stats tab:** Stat rows (total, monthly, today, unlocks, tips)
- **Used in:** /chatter

---

### EmojiTagSystem
- **File:** `src/app/chatter/page.tsx` (inline in Notes tab)
- **Purpose:** Display legend of fan emoji tags with meaning
- **Tags:** 🔴 no spend 3d · 💵 first purchase · 💰 $25+ · 💸 $50+ · ⭐ $100+ · 👑 $500+
- **Used in:** /chatter Notes tab

---

## Components To Create (Future)

| Component | Purpose | Priority |
|---|---|---|
| ModelManager | Add/edit/delete models (creator accounts) | High |
| ChatterInviteFlow | Full invitation email flow | Medium |
| FanProfileDrawer | Slide-out fan detail panel | Medium |
| AIAutopilotPanel | AI chatting assistant UI | Low (Phase 2) |
| PaymentMethodSelector | Crypto / card payment choice | High |
| DashboardModelFilter | Filter stats by model | Medium |
