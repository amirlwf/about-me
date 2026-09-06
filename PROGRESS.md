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
