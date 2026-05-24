> Claude: read this file at the start of every session before making any changes. This saves tokens by avoiding a full project scan.

# ppvs.io — Project Overview

## What is ppvs.io

ppvs.io is a PPV (Pay-Per-View) content platform built for Telegram-based creators and agencies. It enables content creators and their chatters to sell exclusive content directly to fans via Telegram DMs. The fan receives a blurred preview with a payment link; after paying, the content unlocks automatically via signed URL.

Two account types:
- **Agency** — manages multiple creators (models), invites and supervises chatters, views all sales analytics
- **Chatter** — logs in and works the fan conversations for assigned models, sends PPV links and tip requests

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Backend / DB | Supabase (Postgres + Auth + Storage) |
| Auth | Supabase Auth (email/password) |
| File Storage | Supabase Storage (vault + content buckets) |
| Payments (planned) | NOWPayments (crypto), CCBill (cards) |
| Telegram (planned) | MTProto API |

## Environment Variables

Create `.env.local` in project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Set up .env.local with your Supabase credentials (see above)

# 3. Run the SQL schema in Supabase SQL Editor (see docs/DATABASE.md)

# 4. Create storage buckets in Supabase:
#    - vault (public) — thumbnails
#    - content (private) — full files

# 5. Start dev server
npm run dev
# → http://localhost:3000
```

## Multi-user Local Testing

Supabase auth cookies are domain-scoped. On localhost all browser tabs share cookies, so only one user can be "logged in" at a time. To test agency + chatter simultaneously use **different browsers** (Chrome for agency, Firefox/Edge/Incognito for chatter).
