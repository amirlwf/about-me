#!/usr/bin/env python3
"""Self-test for amirlwf.ir redesign. Serves the site locally, crawls every
page, and checks the Final Checklist items that are verifiable offline.
Exit 0 = all pass."""
import json, re, subprocess, threading, time, sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen
from urllib.parse import urljoin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "http://127.0.0.1:8471"
PAGES = ["/", "/fa/", "/fa/services/edit.html", "/fa/services/web.html", "/fa/services/pc.html",
         "/en/services/edit.html", "/en/services/web.html",
         "/callme/", "/fa/callme/", "/admin/", "/sitemap.xml", "/robots.txt",
         "/data/site-content.json", "/assets/css/site.css", "/assets/css/en-minimal.css",
         "/assets/css/en-pages.css", "/assets/css/admin.css",
         "/assets/js/site.js", "/assets/js/order.js", "/assets/js/en-lead.js", "/assets/js/en-home.js",
         "/assets/js/admin.js",
         "/assets/js/supabase-config.js", "/assets/js/supabase.min.js",
         "/assets/fonts/fonts.css", "/assets/img/telegram.svg",
         "/assets/img/whatsapp.svg", "/assets/img/rubika.svg", "/assets/img/phone.svg",
         "/assets/img/mail.svg", "/assets/img/linkedin.svg", "/assets/img/youtube.svg",
         "/assets/img/logo.svg", "/assets/img/logo-h80.png",
         "/assets/img/icon-32.png", "/assets/img/favicon-16.png",
         "/assets/img/icon-180.png", "/assets/img/og-cover.jpg"]
FAILS = []

def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ((" — " + detail) if detail and not cond else ""))
    if not cond:
        FAILS.append(name + (" — " + detail if detail else ""))

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    os.chdir(ROOT)
    srv = ThreadingHTTPServer(("127.0.0.1", 8471), Quiet)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.5)
    try:
        fetched = {}
        for p in PAGES:
            try:
                with urlopen(BASE + p, timeout=10) as r:
                    fetched[p] = (r.status, r.read().decode("utf-8", "replace"))
                check("200 " + p, fetched[p][0] == 200)
            except Exception as e:
                check("200 " + p, False, str(e)[:100])
                fetched[p] = (0, "")

        # ---- crawl internal links: zero 404s ----
        seen, wanted = set(), set(PAGES)
        for p, (st, html) in fetched.items():
            if p.endswith((".css", ".js", ".json", ".xml", ".txt")):
                continue
            for m in re.findall(r'''(?:href|src)="([^"#]+?)"''', html):
                if m.startswith(("data:", "mailto:", "tel:", "javascript:")) or "://" in m:
                    continue
                if m.startswith("/"):
                    wanted.add(m)
        for p in sorted(wanted):
            if p in fetched:
                continue
            try:
                with urlopen(urljoin(BASE, p), timeout=10) as r:
                    check("link " + p, r.status == 200)
            except Exception as e:
                check("link " + p, False, str(e)[:100])

        # ---- FA pages: SEO surface, order forms, /fa/ links ----
        for p in ["/fa/", "/fa/services/edit.html", "/fa/services/web.html", "/fa/services/pc.html"]:
            html = fetched[p][1]
            t = re.search(r"<title>(.*?)</title>", html, re.S)
            d = re.search(r'<meta name="description" content="(.*?)"', html)
            c = re.search(r'<link rel="canonical" href="(.*?)"', html)
            check(p + " title<=60", bool(t) and len(t.group(1)) <= 60, t.group(1)[:70] if t else "missing")
            check(p + " desc<=155", bool(d) and len(d.group(1)) <= 155, (d.group(1)[:70] if d else "missing"))
            check(p + " canonical /fa/", bool(c) and "/fa/" in c.group(1), c.group(1)[:80] if c else "missing")
            if p == "/fa/":
                check(p + " og tags", all(k in html for k in ("og:title", "og:description", "og:url", "twitter:card")))
                check(p + " single h1", html.count("<h1") == 1, f"h1x{html.count('<h1')}")
                check(p + " hreflang", 'hreflang="fa" href="https://amirlwf.ir/fa/"' in html
                      and 'hreflang="en" href="https://amirlwf.ir/"' in html)
                check(p + " CSP meta", "Content-Security-Policy" in html)
                check(p + " font preload",
                      'rel="preload" href="/assets/fonts/lalezar-400-arabic.woff2"' in html,
                      "missing LCP font preload")
            # FA pages link within /fa/ (no bare root service links)
            check(p + " /fa/ links", "/fa/services/" in html or p == "/fa/",
                  "missing /fa/services links")
            check(p + " no bare root links", 'href="/services/' not in html)
            check(p + " hreflang", 'hreflang="fa"' in html and "x-default" in html)
            check(p + " robots meta", 'name="robots" content="index,follow' in html)
            check(p + " lang switcher", 'class="lang-switch"' in html)

        # ---- content depth (FA services) ----
        for p in ["/fa/services/edit.html", "/fa/services/web.html", "/fa/services/pc.html"]:
            txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", fetched[p][1], flags=re.S)
            txt = re.sub(r"<[^>]+>", " ", txt)
            words = [w for w in re.split(r"\s+", txt) if re.search(r"[\u0600-\u06FF]", w)]
            check(p + f" 300+ FA words ({len(words)})", len(words) >= 300)

        # ---- per-page content hooks (each page editable separately in admin) ----
        for p, scope in [("/fa/", "fa"), ("/fa/services/edit.html", "fa_edit"),
                         ("/fa/services/web.html", "fa_web"),
                         ("/fa/services/pc.html", "fa_pc")]:
            html = fetched[p][1]
            check(p + " data-page=" + scope, 'data-page="%s"' % scope in html)
            check(p + " page-channels", 'data-page-channels="%s"' % scope in html)
            check(p + " seo editable", "seo_title" in open(
                  os.path.join(ROOT, "assets/js/admin.js"), encoding="utf-8").read()
                  and "seo_description" in open(
                  os.path.join(ROOT, "supabase/seed.sql"), encoding="utf-8").read()
                  and "applySeo" in open(
                  os.path.join(ROOT, "assets/js/site.js"), encoding="utf-8").read())
        eff = fetched["/fa/services/edit.html"][1]
        check("fa_edit subsvc list hook", 'data-sc-list="fa_edit.subservices"' in eff)
        check("fa_edit faq list hook", 'data-sc-list="fa_edit.faq"' in eff)
        check("fa hero hooks", 'data-sc="fa_home.hero_title"' in fetched["/fa/"][1]
              and 'data-sc-list="fa_home.faq"' in fetched["/fa/"][1])
        check("en page scope", 'data-page="en"' in fetched["/"][1]
              and 'data-page-channels="en"' in fetched["/"][1]
              and 'data-en="footer_tagline"' in fetched["/"][1])
        check("en hamburger", 'id="en-menu-toggle"' in fetched["/"][1]
              and ".en-menu-btn" in open(os.path.join(ROOT, "assets/css/en-minimal.css"),
                                        encoding="utf-8").read())
        check("site.js per-page logic",
              all(k in open(os.path.join(ROOT, "assets/js/site.js"), encoding="utf-8").read()
                  for k in ("page_channels", "data-sc-list", "applySeo", "setMeta")))
        check("en-home per-page logic",
              all(k in open(os.path.join(ROOT, "assets/js/en-home.js"), encoding="utf-8").read()
                  for k in ("page_channels", "seo_title", "setEnMeta")))
        check("seed page keys",
              all(k in open(os.path.join(ROOT, "supabase/seed.sql"), encoding="utf-8").read()
                  for k in ("'fa_edit'", "'fa_web'", "'fa_pc'", "page_channels")))
        check("migration page content",
              os.path.isfile(os.path.join(ROOT, "supabase", "migration_page_content.sql")))
        check("migration chat",
              os.path.isfile(os.path.join(ROOT, "supabase", "migration_chat.sql")))
        check("migration en service pages",
              os.path.isfile(os.path.join(ROOT, "supabase", "migration_en_service_pages.sql")))
        check("migration en web leads",
              os.path.isfile(os.path.join(ROOT, "supabase", "migration_en_web_leads.sql")))
        check("bake_seo tool", os.path.isfile(os.path.join(ROOT, "tools", "bake_seo.py")))
        check("admin chat tab",
              'data-tab="chat"' in open(os.path.join(ROOT, "admin/index.html"), encoding="utf-8").read()
              and all(k in open(os.path.join(ROOT, "assets/js/admin.js"), encoding="utf-8").read()
                      for k in ("loadChat", "subscribeChat", "chat_messages")))
        try:
            sc = json.loads(fetched["/data/site-content.json"][1])
            check("content json page_channels",
                  "page_channels" in sc.get("business", {})
                  and all(k in sc["business"]["page_channels"]
                          for k in ("en", "en_edit", "en_web", "fa",
                                    "fa_edit", "fa_web", "fa_pc")))
        except Exception as e:
            check("content json page_channels", False, str(e)[:80])

        # ---- FA order forms ----
        for p in ["/fa/", "/fa/services/edit.html", "/fa/services/web.html", "/fa/services/pc.html"]:
            html = fetched[p][1]
            check(p + " order form",
                  all(k in html for k in ('id="order-form"', 'id="f-phone"', 'required',
                                          'id="f-website"', 'id="captcha-q"', 'id="track-box"')))

        # ---- EN root (/): dynamic EN landing ----
        en = fetched["/"][1]
        check("en lang", '<html lang="en"' in en)
        t = re.search(r"<title>(.*?)</title>", en, re.S)
        check("en title", bool(t) and t.group(1) == "Amir Reza Lotfi | Short-Form Video Editor \u2014 Get 1 Free Edit",
              t.group(1)[:70] if t else "missing")
        d = re.search(r'<meta name="description" content="(.*?)"', en)
        check("en desc", bool(d) and len(d.group(1)) <= 155, (d.group(1)[:70] if d else "missing"))
        check("en canonical", '<link rel="canonical" href="https://amirlwf.ir/">' in en)
        check("en hreflang out", 'hreflang="fa" href="https://amirlwf.ir/fa/"' in en
              and 'hreflang="en" href="https://amirlwf.ir/"' in en)
        check("en single h1", en.count("<h1") == 1, f"h1x{en.count('<h1')}")
        check("en hero", "Scroll-Stopping Shorts" in en and "Get 1 Free Edit" in en)
        check("en brand name", "Amir Reza Lotfi" in en)
        en_no_switch = re.sub(r'<a class="lang-switch".*?</a>', " ", en, flags=re.S)
        en_no_switch = re.sub(r"<script.*?</script>|<style.*?</style>", " ", en_no_switch, flags=re.S)
        check("en no persian text", not re.search(r"[\u0600-\u06FF]", en_no_switch), "persian chars found")
        check("en lang switcher", 'href="/fa/" hreflang="fa"' in en)
        check("en theme separate", "en-minimal.css" in en and "site.css" not in en)
        check("en dyn hooks", all(k in en for k in ('data-en="hero_title"', 'data-channels-en',
              'id="portfolio-grid"', 'en-home.js')))
        check("en splash hooks", all(k in en for k in ('en-home.js',))
              and all(k in open(os.path.join(ROOT, "assets/js/en-home.js"), encoding="utf-8").read()
                      for k in ("en-splash", "buildSplash", "enSplashSeen", "prefers-reduced-motion")))
        check("en splash style", all(k in open(os.path.join(ROOT, "assets/css/en-minimal.css"), encoding="utf-8").read()
              for k in (".en-splash", "splashRise", "splash-skip")))
        check("en form", all(k in en for k in ('id="en-lead-form"', 'id="e-name"', 'id="e-email"',
              'id="e-link"', 'id="e-notes"', 'value="free_edit"', 'id="e-website"',
              'id="e-captcha-q"', 'id="en-success"', 'id="en-track-code"')))
        check("en no phone field", 'id="f-phone"' not in en)
        check("en CSP meta", "Content-Security-Policy" in en)
        ext = [u for u in re.findall(r'''(?:href|src|url\()[\"']?(https?://[^\"'\)]+)''', en)
               if "amirlwf.ir" not in u and "supabase.co" not in u]
        check("en zero third-party", not ext, str(ext[:3]))
        blobs = re.findall(r'<script type="application/ld\+json">(.*?)</script>', en, re.S)
        ok, types = True, []
        for b in blobs:
            try:
                types.append(json.loads(b).get("@type"))
            except Exception:
                ok = False
        check("en json-ld valid", ok and "ProfessionalService" in types
              and "FAQPage" in types and "BreadcrumbList" in types, str(types))
        check("en json-ld name", "Amir Reza Lotfi" in en)

        # ---- EN service pages (/en/services/*): second language section ----
        for p in ["/en/services/edit.html", "/en/services/web.html"]:
            html = fetched[p][1]
            t_ = re.search(r"<title>(.*?)</title>", html, re.S)
            d_ = re.search(r'<meta name="description" content="(.*?)"', html)
            c_ = re.search(r'<link rel="canonical" href="(.*?)"', html)
            check(p + " lang en", '<html lang="en" dir="ltr">' in html)
            check(p + " title<=60", bool(t_) and len(t_.group(1)) <= 60, t_.group(1)[:70] if t_ else "missing")
            check(p + " desc<=155", bool(d_) and len(d_.group(1)) <= 155, d_.group(1)[:70] if d_ else "missing")
            check(p + " canonical", bool(c_) and c_.group(1) == "https://amirlwf.ir" + p,
                  c_.group(1) if c_ else "missing")
            check(p + " hreflang pair", 'hreflang="en"' in html and 'hreflang="fa"' in html
                  and "x-default" in html)
            check(p + " robots meta", 'name="robots" content="index,follow' in html)
            check(p + " single h1", html.count("<h1") == 1, f"h1x{html.count('<h1')}")
            check(p + " og tags", all(k in html for k in ("og:title", "og:description", "og:url", "twitter:card")))
            check(p + " csp", "Content-Security-Policy" in html)
            check(p + " theme", "en-minimal.css" in html and "en-pages.css" in html and "site.css" not in html)
            check(p + " content hooks", 'data-sc="' in html and 'data-page-channels' in html
                  and 'data-sc-list' in html)
            check(p + " lead form", 'id="en-lead-form"' in html and 'id="e-email"' in html
                  and 'id="f-phone"' not in html)
            check(p + " lang switcher", 'class="lang-switch"' in html and 'hreflang="fa"' in html)
            check(p + " site.js", "site.js" in html and "en-lead.js" in html)
            check(p + " no bare root service links", 'href="/services/' not in html)
            txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
            txt = re.sub(r"<[^>]+>", " ", txt)
            words = [w for w in re.split(r"\s+", txt) if re.search(r"[A-Za-z]{3,}", w)]
            check(p + f" 300+ EN words ({len(words)})", len(words) >= 300)
            persian = re.sub(r'<a class="lang-switch".*?</a>', " ", html, flags=re.S)
            check(p + " no persian text", not re.search(r"[\u0600-\u06FF]", persian))
            blobs = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
            types, ok = [], True
            for b in blobs:
                try: types.append(json.loads(b).get("@type"))
                except Exception: ok = False
            check(p + " json-ld", ok and "Service" in types and "FAQPage" in types
                  and "BreadcrumbList" in types, str(types))
        check("en section pairing",
              'hreflang="en" href="https://amirlwf.ir/en/services/edit.html"' in fetched["/fa/services/edit.html"][1]
              and 'hreflang="fa" href="https://amirlwf.ir/fa/services/edit.html"' in fetched["/en/services/edit.html"][1]
              and 'hreflang="en" href="https://amirlwf.ir/en/services/web.html"' in fetched["/fa/services/web.html"][1])

        # ---- admin: unified panel ----
        adm = fetched["/admin/"][1]
        check("admin tabs", all(k in adm for k in ('data-tab="orders"', 'data-tab="content"',
              'data-tab="channels"', 'data-tab="portfolio"', 'id="page-select"',
              'id="channels-page-select"', 'value="fa_edit"', 'value="fa_web"',
              'value="fa_pc"', 'value="shared"')))
        check("admin channels fields", all(k in adm for k in ('id="channels-fields"', 'save-channels-btn'))
              and all(k in open(os.path.join(ROOT, "assets/js/admin.js"), encoding="utf-8").read()
                      for k in ("'linkedin'", "'youtube'", "'email'", "'splash_title'",
                                "page_channels", "channels-page-select", "faSvcSchema",
                                "PAGE_DEFS", "SHARED_SCHEMA")))
        check("admin portfolio ui", all(k in adm for k in ('p-thumb', 'p-add-btn', 'portfolio-body')))
        check("admin source filter", 'id="source-filter"' in adm)
        check("admin light theme", "admin.css" in adm)
        check("admin noindex", "noindex" in adm)
        admin_js = open(os.path.join(ROOT, "assets/js/admin.js"), encoding="utf-8").read()
        check("admin persian rtl", '<html lang="fa" dir="rtl">' in adm
              and "<title>پنل مدیریت" in adm
              and "ورود ادمین" in adm and "سفارش‌ها" in adm)
        check("admin seo tab", all(k in adm for k in ('data-tab="seo"', 'id="seo-page-select"',
              'id="seo-title"', 'id="seo-desc"', 'id="serp"', 'id="seo-save-btn"', 'seo-body')))
        check("admin seo logic", all(k in admin_js for k in ("SEO_PAGES", "renderSeo",
              "renderSeoTable", "seoPreview", "serp-title", "faNum")))
        check("admin covers en service pages", all(k in adm for k in ('value="en_edit"', 'value="en_web"'))
              and all(k in admin_js for k in ("enSvcSchema", "PAGE_DEFS.en_edit", "PAGE_DEFS.en_web",
                      "'en_edit: 'صفحه انگلیسی: ادیت ویدیو'".replace("'", '"') if False else "en_edit: 'صفحه انگلیسی")))
        check("admin no english leftovers", not re.search(
            r">(Orders|Chat|Page content|Channels|Portfolio|Login|Logout|Refresh|Delete|Reply)<", adm),
            "english tab labels remain")

        # ---- sitemap/robots ----
        sm = fetched["/sitemap.xml"][1]
        for u in ["https://amirlwf.ir/", "https://amirlwf.ir/fa/", "/fa/services/pc.html",
                  "/fa/services/web.html", "/fa/services/edit.html", "/fa/callme/",
                  "https://amirlwf.ir/en/services/edit.html",
                  "https://amirlwf.ir/en/services/web.html"]:
            check("sitemap has " + u, u in sm)
        check("sitemap no bare /en/ redirect", "<loc>https://amirlwf.ir/en/</loc>" not in sm)
        stripped = sm.replace("/fa/services/", "").replace("/en/services/", "")
        check("sitemap no bare /services/", "/services/" not in stripped)
        check("sitemap hreflang", 'hreflang="fa"' in sm and 'hreflang="en"' in sm
              and 'hreflang="x-default"' in sm)
        check("sitemap pairs", sm.count('hreflang="en"') == 6 and sm.count('hreflang="fa"') == 8,
              f"en x{sm.count(chr(34) + 'en' + chr(34))} fa x{sm.count(chr(34) + 'fa' + chr(34))}")
        check("sitemap lastmod", sm.count("<lastmod>") >= 7, f"lastmod x{sm.count('<lastmod>')}")
        check("robots sitemap", "sitemap.xml" in fetched["/robots.txt"][1].lower())

        # ---- site-content.json ----
        try:
            sc = json.loads(fetched["/data/site-content.json"][1])
            check("content json keys", all(k in sc for k in ("business", "services")))
            check("content subservices",
                  all(len(sc["services"][s]["subservices"]) >= 4 for s in ("edit", "web", "pc")))
        except Exception as e:
            check("content json valid", False, str(e)[:80])

        # ---- no secrets in tracked files ----
        out = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, cwd=ROOT).stdout
        check(".env untracked", ".env" not in out.replace(".env.example", ""), out.strip()[:120])
        grep = subprocess.run(["git", "grep", "-l", "-e", "service_role",
                               "--", ".", ":(exclude)*.md", ":(exclude)*.sql", ":(exclude)*.ts",
                               ":(exclude)tools/verify.py", ":(exclude).env"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
        check("no secrets tracked", grep == "", grep[:200])
        # JWT-shaped scan: the anon key may appear ONLY in supabase-config.js
        # (public by design); any other JWT (e.g. a service_role key) fails.
        import base64
        jwt_re = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
        ls = subprocess.run(["git", "ls-files"], capture_output=True, text=True, cwd=ROOT).stdout.split()
        bad = []
        for f in ls:
            try:
                src = open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read()
            except Exception:
                continue
            for m in jwt_re.findall(src):
                if os.path.basename(f) == "supabase-config.js":
                    continue
                bad.append(f + ":" + m[:20] + "…")
        check("no leaked JWTs", not bad, str(bad[:3]))
        # anon key in client config is by design (public); service_role must never appear client-side
        for f in ("assets/js/supabase-config.js", "assets/js/site.js", "assets/js/order.js", "assets/js/admin.js"):
            src = open(os.path.join(ROOT, f), encoding="utf-8").read()
            check(f + " no service_role", "service_role" not in src.lower() or "NEVER" in src)

        # ---- JS syntax ----
        for f in ("assets/js/site.js", "assets/js/order.js", "assets/js/en-lead.js", "assets/js/en-home.js", "assets/js/admin.js", "assets/js/supabase-config.js"):
            r = subprocess.run(["node", "--check", os.path.join(ROOT, f)], capture_output=True, text=True)
            check("node --check " + f, r.returncode == 0, r.stderr.strip()[:120])

        # ---- SQL sanity ----
        sch = open(os.path.join(ROOT, "supabase/schema.sql"), encoding="utf-8").read()
        check("sql tables", all(k in sch for k in ("create table", "orders", "site_content", "notifications",
                                                        "chat_messages", "portfolio_items")))
        check("sql portfolio rls", all(k in sch for k in ("portfolio_public_read", "portfolio_admin_all")))
        check("sql chat rls", all(k in sch for k in ("chat_anon_insert", "chat_track_own", "chat_admin_all",
                                                     "x-visitor-id")))
        fn_dir = os.path.join(ROOT, "supabase", "functions")
        check("fn chat-send", os.path.isfile(os.path.join(fn_dir, "chat-send", "index.ts")))
        check("fn chat-webhook", os.path.isfile(os.path.join(fn_dir, "chat-webhook", "index.ts")))
        check("fn chat-send uses CHAT_BOT_TOKEN",
              "CHAT_BOT_TOKEN" in open(os.path.join(fn_dir, "chat-send", "index.ts"),
                                       encoding="utf-8").read())
        check("sql rls", sch.count("create policy") >= 5 and "enable row level security" in sch)
        check("sql phone check", "09[0-9]{9}" in sch)
        check("sql realtime", "supabase_realtime" in sch)

        # ---- callme: live chat on Supabase Realtime (no Apps Script) ----
        check("callme no apps-script", "script.google.com" not in fetched["/callme/"][1])
        check("callme realtime logic",
              all(k in fetched["/callme/"][1] for k in ("chat-send", "syncMissed", "subscribeChat",
                                                        "cosmic_chat_visitor", "cosmic_chat_history")))
        cm = fetched["/callme/"][1]
        check("callme head seo", '<meta name="description"' in cm
              and '<link rel="canonical" href="https://amirlwf.ir/fa/callme/">' in cm
              and "About Me" not in cm)
        check("fa callme head seo", '<link rel="canonical" href="https://amirlwf.ir/fa/callme/">'
              in fetched["/fa/callme/"][1])

        # ================= PERSONAL BRAND (name search) =================
        G = lambda path: fetched.get(path, (0, ""))[1]
        FA_NAME, EN_NAME = "امیررضا لطفی", "Amir Reza Lotfi"

        def title_of(path):
            m = re.search(r"<title>(.*?)</title>", G(path), re.S)
            return m.group(1) if m else ""

        for p in ["/fa/", "/fa/services/edit.html", "/fa/services/web.html", "/fa/services/pc.html", "/fa/callme/"]:
            check(p + " fa name in <title>", FA_NAME in title_of(p))
            check(p + " fa name in page", FA_NAME in G(p))
        for p in ["/", "/en/services/edit.html", "/en/services/web.html"]:
            check(p + " en name in <title>", EN_NAME in title_of(p))
        check("en home Person JSON-LD", '"@type":"Person"' in G("/") and EN_NAME in G("/"))
        check("fa home Person JSON-LD", '"@type":"Person"' in G("/fa/") and FA_NAME in G("/fa/"))
        check("Person sameAs", "github.com/amirlwf" in G("/") and "github.com/amirlwf" in G("/fa/"))
        html_files_root = []
        for _b, _d, _f in os.walk(ROOT):
            if os.sep + ".git" in _b:
                continue
            html_files_root += [os.path.join(_b, x) for x in _f if x.endswith(".html")]

        # ================= SETUP / PROJECT REPOINT =================
        import importlib.util as _ilu
        _bs_path = os.path.join(ROOT, "tools", "build_setup_all.py")
        check("build_setup_all tool exists", os.path.isfile(_bs_path))
        if os.path.isfile(_bs_path):
            _spec = _ilu.spec_from_file_location("build_setup_all", _bs_path)
            _mod = _ilu.module_from_spec(_spec)
            _spec.loader.exec_module(_mod)
            _fresh = os.path.join(ROOT, "supabase", "setup_all.sql")
            check("setup_all.sql exists", os.path.isfile(_fresh))
            if os.path.isfile(_fresh):
                check("setup_all.sql in sync with sources",
                      _mod.render() == open(_fresh, encoding="utf-8", newline="").read().replace("\r\n", "\n"))
        sch_src = open(os.path.join(ROOT, "supabase", "schema.sql"), encoding="utf-8").read()
        check("schema guards portfolio publication",
              "to_regclass('public.portfolio_items')" in sch_src
              and sch_src.count("alter publication supabase_realtime add table public.portfolio_items") == 2)
        cfg_src = open(os.path.join(ROOT, "assets", "js", "supabase-config.js"), encoding="utf-8").read()
        m_cfg = re.search(r"SUPABASE_URL:\s*\"https://([a-z0-9]+)\.supabase\.co\"", cfg_src)
        ref = m_cfg.group(1) if m_cfg else ""
        check("supabase-config has project ref", bool(ref), cfg_src[:80])
        m_key = re.search(r"SUPABASE_ANON_KEY:\s*\"([^\"]+)\"", cfg_src)
        key_ref = ""
        if m_key:
            try:
                _body = m_key.group(1).split(".")[1]
                _body += "=" * (-len(_body) % 4)
                key_ref = json.loads(base64.urlsafe_b64decode(_body)).get("ref", "")
            except Exception:
                key_ref = ""
        check("anon key JWT belongs to that project", bool(ref) and key_ref == ref, f"host={ref} key={key_ref}")
        for path in html_files_root:
            src = open(path, encoding="utf-8").read()
            rel = os.path.relpath(path, ROOT)
            if "connect-src" in src:
                check(rel + " csp host matches config", ref in src or not ref)
            check(rel + " no stale project ref", "ysjdodvtmihaxyioknuo" not in src)

        HTML_PAGES = ["/", "/fa/", "/fa/services/edit.html", "/fa/services/web.html", "/fa/services/pc.html",
                      "/en/services/edit.html", "/en/services/web.html", "/callme/", "/fa/callme/", "/admin/"]
        for p in HTML_PAGES:
            check(p + " author meta", re.search(r'<meta name="author" content="[^"]+"', G(p)) is not None)
        check("fa home FAQ identity item", (FA_NAME + " کیست؟") in G("/fa/") and G("/fa/").count(FA_NAME + " کیست؟") >= 2)
        check("en hero names person", "Amir Reza Lotfi" in G("/"))

        # ================= BOTS (admin-managed Telegram credentials) =================
        mb_path = os.path.join(ROOT, "supabase", "migration_bots.sql")
        check("migration bots sql exists", os.path.exists(mb_path))
        if os.path.exists(mb_path):
            mb = open(mb_path, encoding="utf-8").read()
            for token in ["create table if not exists public.bot_config",
                          "revoke all on public.bot_config from anon",
                          "bot_config_admin_all", "'chat'", "'orders_fa'", "'orders_en'"]:
                check("bots sql " + token[:32], token in mb)
        fn_dir = os.path.join(ROOT, "supabase", "functions")
        check("bot-test function exists", os.path.isfile(os.path.join(fn_dir, "bot-test", "index.ts")))
        for fn in ["create-order", "chat-send", "chat-webhook"]:
            src = open(os.path.join(fn_dir, fn, "index.ts"), encoding="utf-8").read()
            check(fn + " reads bot_config", 'from("bot_config")' in src)
        adm_h = open(os.path.join(ROOT, "admin", "index.html"), encoding="utf-8").read()
        check("admin bots tab", 'data-tab="bots"' in adm_h and 'id="tab-bots"' in adm_h)
        check("admin bots fields", adm_h.count("data-bot-token=") == 3 and adm_h.count("data-bot-chatid=") == 3)
        adm_j = open(os.path.join(ROOT, "assets", "js", "admin.js"), encoding="utf-8").read()
        for token in ["function loadBots", "function saveBot", "function testBot",
                      "bot_config", "functions.invoke('bot-test'"]:
            check("admin.js " + token, token in adm_j)

        # ================= LIVE CHAT: instant owner reply =================
        for f in ["callme/index.html", "fa/callme/index.html"]:
            html = open(os.path.join(ROOT, *f.split("/")), encoding="utf-8").read()
            check(f + " broadcast owner_reply", "owner_reply" in html)
            check(f + " chat-send wired", "functions/v1/chat-send" in html and "x-visitor-id" in html)
        check("admin broadcasts owner reply", "owner_reply" in adm_j and ".select('id')" in adm_j)

    finally:
        srv.shutdown()

    print(f"\n{len(FAILS)} failures" if FAILS else "\nALL CHECKS PASSED")
    return 1 if FAILS else 0

sys.exit(main())
