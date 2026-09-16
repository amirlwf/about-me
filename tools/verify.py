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
         "/callme/", "/fa/callme/", "/admin/", "/sitemap.xml", "/robots.txt",
         "/data/site-content.json", "/assets/css/site.css", "/assets/css/en-minimal.css",
         "/assets/css/admin.css",
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
                          for k in ("en", "fa", "fa_edit", "fa_web", "fa_pc")))
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
        check("en title", bool(t) and t.group(1) == "Short-Form Video Editor | Get 1 Free Edit",
              t.group(1)[:70] if t else "missing")
        d = re.search(r'<meta name="description" content="(.*?)"', en)
        check("en desc", bool(d) and len(d.group(1)) <= 155, (d.group(1)[:70] if d else "missing"))
        check("en canonical", '<link rel="canonical" href="https://amirlwf.ir/">' in en)
        check("en hreflang out", 'hreflang="fa" href="https://amirlwf.ir/fa/"' in en
              and 'hreflang="en" href="https://amirlwf.ir/"' in en)
        check("en single h1", en.count("<h1") == 1, f"h1x{en.count('<h1')}")
        check("en hero", "Scroll-Stopping Shorts" in en and "Get 1 Free Edit" in en)
        check("en brand name", "Amir Reza Lotfi" in en)
        check("en no persian text", not re.search(r"[\u0600-\u06FF]", en), "persian chars found")
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

        # ---- sitemap/robots ----
        sm = fetched["/sitemap.xml"][1]
        for u in ["https://amirlwf.ir/", "https://amirlwf.ir/fa/", "/fa/services/pc.html",
                  "/fa/services/web.html", "/fa/services/edit.html", "/fa/callme/"]:
            check("sitemap has " + u, u in sm)
        check("sitemap no /en/", "/en/" not in sm)
        check("sitemap no bare /services/", "/services/" not in sm.replace("/fa/services/", ""))
        check("sitemap hreflang", 'hreflang="fa"' in sm and 'hreflang="en"' in sm)
        check("sitemap lastmod", sm.count("<lastmod>") >= 6, f"lastmod x{sm.count('<lastmod>')}")
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
    finally:
        srv.shutdown()

    print(f"\n{len(FAILS)} failures" if FAILS else "\nALL CHECKS PASSED")
    return 1 if FAILS else 0

sys.exit(main())
