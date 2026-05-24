> Claude: read this file at the start of every session before making any changes. This saves tokens by avoiding a full project scan.

# Pages

## / — Landing Page

- **File:** `src/app/page.tsx`
- **Purpose:** Marketing landing page explaining ppvs.io
- **Status:** ✅ Created
- **Key components:** LogoWord, hero section, feature highlights, CTA buttons

## /login — Login

- **File:** `src/app/login/page.tsx`
- **Purpose:** Email + password sign-in. Reads `?next=` param and redirects after login.
- **Status:** ✅ Created
- **Key components:** LoginForm (wrapped in Suspense for useSearchParams), createClient()

## /signup — Registration

- **File:** `src/app/signup/page.tsx`
- **Purpose:** New account creation. Role selector: Chatter or Agency.
- **Status:** ✅ Created
- **Key components:** RoleCard, supabase.auth.signUp with user_metadata (role, display_name, agency_name)

## /dashboard — Main Dashboard

- **File:** `src/app/dashboard/page.tsx`
- **Purpose:** Role-aware home screen. Agency sees KPI cards + activity. Chatter sees agency connection status.
- **Status:** ✅ Created
- **Key components:** AppLayout, KpiCard, ActivityTable, ChatterDashboard

## /vault — Content Vault

- **File:** `src/app/vault/page.tsx`
- **Purpose:** Upload photos/videos. Canvas-based blur thumbnail generation. Grid of uploaded items.
- **Status:** ✅ Created
- **Key components:** AppLayout, UploadModal, VaultGrid, generateBlurThumb()

## /send — Send PPV

- **File:** `src/app/send/page.tsx`
- **Purpose:** Pick vault items, set price, enter fan Telegram, generate PPV link.
- **Status:** ✅ Created
- **Key components:** AppLayout, vault picker grid, ppv_links insert, copy-to-clipboard

## /chatter — Chatter Workspace

- **File:** `src/app/chatter/page.tsx`
- **Purpose:** Full-screen chatter workspace. Chat list sidebar, Telegram-style chat area, action panel (Send PPV / Tips / Notes / Stats).
- **Status:** ✅ Created (pixel-perfect translation of Create_prompt_design_1 — Telegram integration pending)
- **Key components:** ModelSelectorBar, TelegramChat (sidebar + chat area), ActionPanel
- **Colors:** `#0d1117` bg · `#161a22` panels · `#6366f1` accent · `#2a2d35` borders
- **Layout:** Topbar (52px) + ModelBar (42px) + [ChatList 280px + Chat flex-1] + ActionPanel 30%

## /team — Team Management

- **File:** `src/app/team/page.tsx`
- **Purpose:** Agency invites chatters by email. Chatter accepts/declines invitations.
- **Status:** ✅ Created
- **Key components:** AgencyTeamView, ChatterTeamView, server actions (inviteChatter, acceptInvitation, declineInvitation)

## /pay/[code] — Fan Payment Page

- **File:** `src/app/pay/[code]/page.tsx` + `PayClient.tsx` + `actions.ts`
- **Purpose:** Public page (no auth). Shows blurred preview, price, Unlock button. After unlock delivers signed URL.
- **Status:** ✅ Created
- **Key components:** PayClient, unlockPpv server action, admin Supabase client

## /signup/confirm — Email Confirmation

- **File:** `src/app/signup/confirm/page.tsx`
- **Purpose:** "Check your email" page shown after registration (when email confirmation enabled).
- **Status:** ✅ Created

## chatter.ppvs.io — Chatter Subdomain

- **File:** Not created
- **Purpose:** Separate subdomain with simplified login → /chatter workspace for chatters
- **Status:** ❌ Not built — planned for phase 2
