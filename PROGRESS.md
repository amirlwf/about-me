# PROGRESS.md — amirlwf.ir redesign build log (branch `redesign`)

# One line per completed Final Checklist item + timestamp (UTC). Updated as the build proceeds.



- [2026-09-06] Phase 0 answers collected (git: user pushes; telegram: absent→mock; supabase: keys received ✓, url …nuo.supabase.co; admin user amirlwff@gmail.com; contact/business info: absent→placeholders+Hashtgerd defaults; brand/backend: defaults = evolved dark cosmic + Edge Function)

- [2026-09-06] Repo cloned, branch `redesign` created; secrets stored ONLY in untracked `.env` (gitignored)

- [2026-09-06] Fonts localized: Vazirmatn 400/500/700 + Lalezar 400 (arabic+latin woff2) in assets/fonts/, zero Google Fonts requests

- [2026-09-06] Built: index.html + services/edit|web|pc.html (fa RTL, unique title/desc/canonical/OG, JSON-LD LocalBusiness+Service+FAQPage+BreadcrumbList, 550+ FA words each, order form w/ IR-mobile validation+honeypot+captcha) + supabase-js vendored locally

- [2026-09-06] callme/index.html = original chat, verified: semantic diff = font-localization only (logic/design untouched)

- [2026-09-06] Inline scripts moved into order.js so main pages keep strict CSP (self-only, no third-party origins)

- [2026-09-06] admin/index.html + admin.js: Supabase Auth, Realtime orders (no polling), accept/done→notifications row, reply box, site_content editor, contact-channels section

- [2026-09-06] supabase/: schema.sql (orders/site_content/notifications + RLS + Realtime publication), seed.sql (placeholders), create-order edge fn (validation+honeypot+3-per-hour-IP limit+Telegram notify mock-safe), telegram-webhook edge fn (/services + reply-to-order), test-notify.sh, .env.example

- [2026-09-06] tools/verify.py: ALL CHECKS PASSED (links/zero-404, SEO surface, JSON-LD, sitemap+robots, zero third-party, forms, secrets scan, node --check, SQL sanity)

- [2026-09-06] Milestone commit 658be12 on branch `redesign` (CNAME + Code.gs untouched)

- [2026-09-06] NOTE: this machine cannot reach *.supabase.co (TCP timeout — DNS ok) so live Supabase/RLS/E2E verification + admin-user creation must be done by owner per README; Telegram absent → mock mode

- [2026-09-06] CDP QA (Chrome 9333): all 6 pages 390px scrollWidth==innerWidth (no overflow), zero JS errors, DCL 43-234ms / load 46-234ms locally, 14 requests, 0 third-party; homepage ~190KB first paint; mobile+desktop screenshots visually verified (shot-m-home, shot-m-pc, shot-d-home)

- [2026-09-06] Lighthouse 13 desktop (real runs): home 99/100/100/96, pc+web+edit 100/100/100/92 → fixed style-attr CSP + meta frame-ancestors → home re-audit 99/100/100/96; last console item is the Supabase 404 until schema.sql is applied (then 100). LCP 0.6-0.7s, CLS 0.01-0.05.

- [2026-09-06] DONE except live-backend items (this machine can't reach *.supabase.co; no bot token): schema/seed/edge deploy, RLS live check, E2E order→realtime→telegram — all scripted/documented in README for the owner. Commits on `redesign`: 658be12, 769ea4b (node_modules stripped after), b510373 + cleanup.

- [2026-09-06] Owner said "use defaults": finalizing under Phase-0 defaults. Checklist adjudication — PASS offline: chat preserved, all pages live locally zero-404, SEO/JSON-LD valid, sitemap+robots, zero third-party, 360px OK, JS-disabled OK, IR-mobile enforced client+DB, admin panel code-complete, Lighthouse home 99/100/100/96 + services 100/100/100/92, no secrets in git, README+PR ready. MANUAL (per PROMPT.md blocked-service rule, mock-safe + scripted): schema/seed deploy, admin-user+flag, edge deploy+secrets, bot token+webhook, live RLS/E2E confirm via README §1-§4 + test-notify.sh.

- [2026-09-14] EN landing /en/ (light minimal theme, free-edit lead form source=en_landing, [EN-FREE] telegram format, hreflang fa/en, sitemap updated, verify ALL CHECKS PASSED)
- [2026-09-16] Per-page admin: channels toggles split per page (business.page_channels en/fa/fa_edit/fa_web/fa_pc, values shared) + all page texts editable (7 content keys: en_home, fa_home, fa_edit, fa_web, fa_pc + business/services shared incl. SEO title/desc for A/B tests) + mobile polish (FA/EN tap targets, EN hamburger, admin fields); seed+migration_page_content.sql (idempotent) + verify extended, ALL CHECKS PASSED
- [2026-09-16] Live-chat fix: root cause = chat_messages table never applied to live DB (404 PGRST205; edge fns fine) -> supabase/migration_chat.sql (idempotent). Admin panel: new Chat tab (realtime inbox, per-visitor filter, reply -> owner row -> visitor Realtime, delete; Telegram bot replies same thread). Google-visible SEO: tools/bake_seo.py bakes admin-edited seo_title/seo_description into static HTML <title>/meta/og/twitter (verified: synced og:desc on 3 FA service pages); verify extended, ALL CHECKS PASSED
- [2026-10-06] EN/FA separation + redesign + Persian admin: new English section
  /en/services/{edit,web}.html (light theme, hreflang-paired with the FA twins,
  en-pages.css, lead forms with service=web support), FA pages got hreflang +
  robots + a language switcher, sitemap rebuilt (7 URLs, x-default alternates),
  FA home FAQ JSON-LD synced to the visible <details>, /callme/ + /fa/callme/
  head SEO (canonical -> /fa/callme/, real title/description, og) with bodies
  untouched; visual polish pass on site.css + en-minimal.css; admin panel fully
  Persian RTL with a new SEO tab (per-page title/description, Google snippet
  preview, length table, en_edit/en_web pages) + enSvcSchema/CHANNEL_PAGES;
  site.js gained en SEO scope, EN channel labels, generic list renderer,
  reveal/header polish; create-order accepts EN web leads (+ schema.sql RLS +
  migration_en_web_leads.sql + migration_en_service_pages.sql); bake_seo covers
  7 pages; verify.py extended (221 checks) ALL CHECKS PASSED + tools/qa_pages.py
  (CDP 390/1366 overflow, JS errors, broken resources) clean on all pages.
