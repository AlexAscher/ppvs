# Cloudflare setup for ppvs.io

**Why:** the domain currently resolves straight to your Hetzner box (13.140.133.122). Every image, thumbnail, avatar and Telegram-media proxy call goes through your server and (for `/api/ppv/thumb`) further out to Supabase. Cloudflare's free tier turns this into: browser → CF edge cache → your origin only on the first miss. Concretely:

- `/api/ppv/thumb/{id}` — after batch 99, tiles serve ~20 KB thumbs. Cached at CF, subsequent views = 0 Supabase egress, 0 origin bandwidth.
- `/api/telegram/media/{modelId}` — already has `Cache-Control: max-age=…, immutable` on thumbs. CF will honour it.
- `/api/telegram/fan-avatar/{modelId}` — 302s to `avatars` bucket. CF caches the 302 target.
- Static Next.js chunks (`_next/static/*`) — automatic edge cache.

Steps below take ~15 minutes plus a DNS propagation wait (~1–4 h, up to 24 h worst case).

---

## Prereqs

- Access to your Dynadot account (that's where ppvs.io was bought).
- Access to your Hetzner server (only for the "verify" step at the end).
- A working Cloudflare account (free plan is fine — no card required).

## 1. Add the site to Cloudflare

1. Go to https://dash.cloudflare.com/sign-up (or log in).
2. **Add a Site** → enter `ppvs.io` → **Continue**.
3. Pick the **Free** plan → **Continue**.
4. Cloudflare shows a summary of DNS records it detected by scanning current DNS.

## 2. Verify the DNS records CF imported

CF should show at least:

- `A` — `ppvs.io` → `13.140.133.122` — Proxy status: **Proxied** (orange cloud) — leave it orange.
- `A` or `CNAME` — `chatter` → same target — **Proxied**.
- `A` or `CNAME` — `mini` → same target — **Proxied**.

If any of these are missing, add them manually via **Add record**. The orange-cloud (**Proxied**) toggle is what makes CF sit in front of your server; grey cloud = DNS-only, no caching. **Keep all three orange.**

MX / TXT / SPF records for email (if any) should stay grey-cloud.

**Do NOT** proxy the record that points at `payformedia1bot` or Telegram — leave those DNS-only or unchanged; Cloudflare in front of Telegram's Bot API is not needed.

## 3. Copy the Cloudflare nameservers

Cloudflare gives you two nameservers, looks like:

```
alice.ns.cloudflare.com
bob.ns.cloudflare.com
```

(the names differ per account — use whatever Cloudflare shows you).

Keep this tab open.

## 4. Switch nameservers on Dynadot

1. Log into Dynadot → **My Domains** → click `ppvs.io`.
2. Go to the **Name Servers** section.
3. Change from Dynadot's default to **Custom**.
4. Paste the two Cloudflare nameservers from step 3.
5. **Save**.

Dynadot will confirm; some registrars nag about a 24 h propagation — accept it.

## 5. Wait for CF to detect the change

Back in Cloudflare, click **Done, check nameservers**. CF will poll every few minutes. When it detects the swap it turns the site status from **Pending Nameserver Update** to **Active** and sends an email.

Realistically this is 15 min – 4 h; occasionally slower. Continue below once **Active** — until then the proxy is not live.

## 6. Turn on the safe defaults

Once the site is Active, open the Cloudflare dashboard for `ppvs.io`:

### SSL/TLS
- **SSL/TLS → Overview** → set encryption mode to **Full**. (Do NOT use "Flexible" — it would decrypt then send plaintext HTTP to your origin. Do NOT use "Full (strict)" until your origin has a public certificate CF recognises.)
- **SSL/TLS → Edge Certificates** → enable **Always Use HTTPS**.
- **SSL/TLS → Edge Certificates** → enable **Automatic HTTPS Rewrites**.

### Speed
- **Speed → Optimization** → enable **Brotli**.
- **Speed → Optimization** → **Early Hints** — leave off for now (Next.js App Router doesn't emit them yet).

### Caching
- **Caching → Configuration** → **Browser Cache TTL** → **Respect Existing Headers** (we already set them in `next.config.ts` + per-route).
- **Caching → Configuration** → **Crawler Hints** → on.

### Network
- **Network** → enable **HTTP/3 (with QUIC)**, **0-RTT**, **WebSockets**.
- **Network** → enable **gRPC** if it's an option (harmless, useful later).

## 7. Cache rules — THIS is where the egress win comes from

Cloudflare Free includes 3 free "Cache Rules". Add these under **Caching → Cache Rules → Create rule**.

### Rule 1 — cache PPV thumbs long

- **Rule name:** `Cache PPV thumbs`
- **When incoming requests match:**
  - Field: `URI Path` — Operator: `starts with` — Value: `/api/ppv/thumb/`
- **Then:**
  - **Cache eligibility:** Eligible for cache
  - **Edge TTL:** Override origin, use **1 week**.
  - **Browser TTL:** Respect origin headers.
  - **Cache key:** Default (URL). Ignore query strings **except** `v` (the cache-buster PpvCard bumps after backfill).
    - Under **Cache Key → Query String** → **Include** → add `v`.

Effect: after the first hit per PPV, CF serves the 302 (and the target Storage bytes) directly from the edge for a week. Backfills flip the `?v=…` query so the CDN misses once, then re-caches with the crisp target.

### Rule 2 — cache Telegram media thumbs

- **Rule name:** `Cache Telegram thumbs`
- **When incoming requests match:**
  - Custom filter expression:
    `(starts_with(http.request.uri.path, "/api/telegram/media/") and http.request.uri.query contains "quality=thumb")`
- **Then:**
  - Cache eligibility: Eligible.
  - Edge TTL: Respect origin headers (already 30 days from the route).
  - Cache key: include the full query string (peer/message id matter).

Effect: chat message thumbnails (avatars in bubbles, PPV bubble thumbs) served straight off the edge.

### Rule 3 — cache fan avatars

- **Rule name:** `Cache fan avatars`
- **When incoming requests match:**
  - URI Path — starts with — `/api/telegram/fan-avatar/`
- **Then:**
  - Cache eligibility: Eligible.
  - Edge TTL: Override, **1 day**.
  - Cache key: include `peerId` query param.

## 8. Bypass rules — DO NOT cache these

Under **Caching → Cache Rules → Create rule** add ONE more if you have a free slot (or replace the least useful one from step 7):

- **Rule name:** `Bypass API + SSE`
- **When incoming requests match:**
  - Custom expression:
    `(starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/api/ppv/thumb/") and not starts_with(http.request.uri.path, "/api/telegram/media/") and not starts_with(http.request.uri.path, "/api/telegram/fan-avatar/"))`
- **Then:**
  - Cache eligibility: **Bypass cache**.

Without this rule Cloudflare's default logic could try to cache `/api/telegram/stream/*` (SSE) or auth-carrying endpoints, both of which would break the app.

If you're out of free rules, the Free tier's default (bypass HTML + POST + `Cache-Control: no-store`) covers most of it — most of our API routes already send `no-cache` — but explicitly bypassing removes the ambiguity.

## 9. Firewall / bot rules (optional but recommended)

- **Security → WAF → Managed Rules** → enable the free **Cloudflare Managed Ruleset** (default: on).
- **Security → Bots** → **Bot Fight Mode** — leave OFF for now. It occasionally challenges legitimate Telegram Mini App traffic; revisit once you see real bot traffic in logs.

## 10. Verify

From your machine (Windows PowerShell — `Invoke-WebRequest`):

```powershell
(Invoke-WebRequest -Uri https://ppvs.io -Method Head).Headers | Format-List
```

Look for:

- `Server: cloudflare`
- `CF-RAY: …`
- On repeat requests to a thumb URL: `CF-Cache-Status: HIT`

Or from Git Bash:

```bash
curl -sI https://ppvs.io | grep -iE 'server|cf-ray|cf-cache'
curl -sI https://ppvs.io/api/ppv/thumb/<any-real-ppv-id> | grep -iE 'cache|cf-'
# Run again — second call should say CF-Cache-Status: HIT
```

## 11. Known gotchas

- **Session cookies** — Next.js `sb-*` auth cookies must not be cached. Rule 8 handles this; do not add a broad "cache everything" rule.
- **`_next/data/*` JSON payloads for SSR pages** — these MUST NOT be cached across users. Free tier's default logic (respects `Cache-Control: private`) already skips them; do not force-cache.
- **Malum / Telegram webhooks** — inbound POSTs from `malum.co` / `api.telegram.org` are already bypassed by rule 8. Nothing else to do.
- **nginx on origin** — make sure `proxy_set_header Host $host` is set so the subdomain rewrite in `middleware.ts` still recognises `chatter.ppvs.io` / `mini.ppvs.io`. This was already required, unchanged by CF.
- **SSE (chat stream)** — `/api/telegram/stream/{modelId}` uses `text/event-stream` + `Connection: keep-alive`. CF Free supports SSE through the proxy; the existing headers (`X-Accel-Buffering: no`) already tell CF not to buffer.
- **Deploy webhook / push-hook** — if any external service pings a URL on your box directly, that URL now hits CF first. If it's over HTTP or expects a specific IP, either whitelist it in **Rules → Page Rules → Bypass Cache** or use a subdomain that stays grey-cloud.

## 12. Rollback (if anything breaks)

- Fastest — set the DNS record for `ppvs.io` back to **grey cloud** (DNS only). Traffic goes straight to origin again within a minute; you keep CF as an easy on-switch.
- Full rollback — revert Dynadot nameservers to Dynadot's defaults. ~1–4 h propagation back.

---

## What you should see after Cloudflare + P0 thumbnails

- **Supabase egress** back under the Free tier ceiling — expected drop from ~5 GB/mo per active agency to ~200 MB/mo.
- **Vault open time** — 5–10× faster (bytes served from CF edge in your region).
- **Cost** — $0. All of the above is on the CF Free plan.

Revisit if you ever pass ~10 GB/day of edge traffic — that's when CF suggests Pro ($20/mo) for extra rules and stats, not because you're hitting a hard limit.
