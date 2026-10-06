# amirlwf.ir — Amir Reza Lotfi, short-form video editor (GitHub Pages + Supabase + Telegram)

Two fully separated language sections: English at `/` + `/en/services/*`,
Persian under `/fa/`. Every paired page cross-links with `hreflang`
(`en` / `fa` / `x-default`) and the sitemap carries the same alternates.
Static pages on GitHub Pages, dynamic layer on Supabase, Telegram bot via
Edge Functions. Admin panel UI is Persian (RTL) with a dedicated SEO tab.
The original live-chat page is preserved at `/callme/` (and `/fa/callme/`) — now also mirrored in the admin panel's **Chat** tab (reply + realtime; Telegram bot replies land in the same thread).

## Site map

| Path | Page |
|---|---|
| `/` | EN home: hero, portfolio, free-edit offer, services, steps, FAQ, lead form |
| `/en/services/edit.html` | EN: video editing service (paired with `/fa/services/edit.html`) |
| `/en/services/web.html` | EN: web design service (paired with `/fa/services/web.html`) |
| `/fa/` | Persian home: intro, 3 service cards, CTA, FAQ, order form |
| `/fa/services/edit.html` | Video editing (+5 sub-service anchors, order form) |
| `/fa/services/web.html` | Web design (+5 sub-service anchors, order form) |
| `/fa/services/pc.html` | Computer services (+5 sub-service anchors, order form) |
| `/callme/`, `/fa/callme/` | **Preserved original chat** (fonts localized only) |
| `/admin/` | Persian admin panel (orders, live chat, page content, **SEO tab with Google preview**, channels, portfolio; `noindex`) |
| `/data/site-content.json` | Static content defaults (SEO-safe; Supabase overrides at runtime) |
| `/sitemap.xml`, `/robots.txt` | SEO plumbing |

All assets are local (`assets/fonts|css|js|img`). Zero third-party requests
except the site's own Supabase project (wired in `assets/js/supabase-config.js`
— anon key only) plus portfolio images served from the site's own Supabase
Storage bucket.

## Setup (5 minutes, all manual — do this after cloning)

### 1. Supabase project
1. Create a project at https://supabase.com (free tier).
2. Dashboard → SQL Editor → run `supabase/schema.sql`, then `supabase/seed.sql`,
   then (if upgrading an existing DB) `supabase/migration_en_leads.sql`,
   `supabase/migration_portfolio.sql`, `supabase/migration_page_content.sql`,
   `supabase/migration_chat.sql`, `supabase/migration_en_service_pages.sql`
   and `supabase/migration_en_web_leads.sql` (all idempotent-safe; never
   overwrites admin edits).
   The last two are required for the English section: they seed the
   `en_edit` / `en_web` content keys and let EN leads carry `service='web'`
   (the `create-order` function must be redeployed after them).
3. Dashboard → Authentication → Users → add your admin user (email + password).
4. Give it the admin flag (SQL Editor):
   ```sql
   update auth.users
   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'YOUR_ADMIN_EMAIL';
   ```
5. Dashboard → Authentication → enable Realtime for `orders` (if not already).
6. Copy Project URL + `anon` key into `assets/js/supabase-config.js`.

### 2. Edge Functions (bot backend — Supabase Edge Function, chosen over Apps Script so secrets live with the DB)
```bash
supabase functions deploy create-order --no-verify-jwt
supabase functions deploy telegram-webhook --no-verify-jwt
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  TELEGRAM_BOT_TOKEN=... ADMIN_CHAT_ID=...
```
`create-order` validates the Iranian mobile server-side, enforces the
honeypot + ≤3 orders/hour/IP rate limit, inserts the order, and notifies
Telegram (skipped cleanly when the bot isn't configured yet).
`telegram-webhook` answers `/services` from the live catalog and stores admin
replies (reply to an `#order-<id>` message) back onto the order row.

### 3. Telegram bot (optional until you have a token)
1. Talk to `@BotFather` → `/newbot` → copy the token.
2. Message your bot once, then get your chat id via
   `https://api.telegram.org/bot<TOKEN>/getUpdates`.
3. `supabase secrets set TELEGRAM_BOT_TOKEN=... ADMIN_CHAT_ID=...`
4. Point Telegram at the webhook:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<PROJECT>/functions/v1/telegram-webhook`

### 4. Test the pipeline (one command)
```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... bash supabase/test-notify.sh edge
```
Expected: `{"id":N,...}` + a Telegram message `🧾 سفارش جدید #order-N …`.
RLS spot-checks (run in SQL Editor):
```sql
-- anon must NOT read orders without a token:
set role anon; select count(*) from public.orders;  -- must ERROR
-- anon must NOT write site_content:
set role anon; update public.site_content set value='{}' where key='business';  -- must ERROR
reset role;
```

### 5. Deploy
Push branch `redesign`, merge to `master` via PR. GitHub Pages serves the
domain (`CNAME` already points `amirlwf.ir` — never delete it). No build step.

## How it works

- **Order form** (every content page): service → sub-service cascade, Iranian
  mobile validation (`09xxxxxxxxx`, client + DB CHECK), honeypot + math captcha,
  POST to `create-order` with direct-PostgREST fallback. Returns `{id,
  track_token}`; the token is stored in `localStorage`.
- **Live customer tracking**: the tracking widget reads its own order via the
  `x-track-token` header (RLS-scoped to that token) and subscribes over
  Supabase Realtime — toast + status badge update with no refresh (15 s safety
  re-fetch backs it up while the order is open).
- **Admin panel** (`/admin/`): email+password login, orders table fed by
  Realtime (no polling), accept/done buttons write a `notifications` row (which
  is what the customer + bot see), reply box stored as `admin_reply`,
  `site_content` editor (per-page: EN home, FA home, 3 FA service pages, shared
  business+services; incl. SEO title/description for A/B tests) + a dedicated
  **contact-channels section with per-page toggles** (phone / Telegram /
  WhatsApp / Rubika + email/YouTube/LinkedIn; values shared, on/off per page).
  live site within seconds; static defaults keep SEO intact if Supabase is down.
- **Content model**: `data/site-content.json` = static defaults baked into the
  HTML at author time (crawlable); `site_content` rows override them at runtime.
   For Google specifically: after editing SEO title/description in the admin
   panel run `python3 tools/bake_seo.py` (local, uses .env) and commit+push —
   it bakes the new title/description into the static HTML that Google crawls
   (all 7 pages: `/`, `/en/services/*`, `/fa/`, `/fa/services/*`).
   The admin's **SEO tab** shows a Google-style snippet preview plus a
   title/description length status table for every page.
  via `data-sc` attributes and the `[data-channels]` container.

## Security notes

- `service_role` key lives ONLY in Edge Function secrets. Never in the repo
  (CI-check: `tools/verify.py` greps tracked files).
- RLS: anon can INSERT orders (validated), SELECT only its own order via token,
  SELECT `site_content`; everything else is admin-only.
- CSP meta on every page (self-only origins); all user input escaped on render.

## Local self-test

```bash
python3 tools/verify.py   # links, SEO surface, JSON-LD, zero-404, secrets scan, SQL sanity
python3 tools/qa_pages.py # CDP: 390px+1366px overflow, JS errors, broken resources (Chrome :9333)
```

## Manual steps remaining (for the site owner)

1. Run `schema.sql` + `seed.sql`, create admin user, set the admin flag (§1).
2. Deploy the two Edge Functions + secrets (§2).
3. Create the Telegram bot + webhook (§3) — currently mocked behind placeholders.
4. Run `test-notify.sh`, then merge the PR.
