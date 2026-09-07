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
PAGES = ["/", "/services/edit.html", "/services/web.html", "/services/pc.html",
         "/callme/", "/admin/", "/sitemap.xml", "/robots.txt",
         "/data/site-content.json", "/assets/css/site.css",
         "/assets/js/site.js", "/assets/js/order.js", "/assets/js/admin.js",
         "/assets/js/supabase-config.js", "/assets/js/supabase.min.js",
         "/assets/fonts/fonts.css", "/assets/img/telegram.svg",
         "/assets/img/whatsapp.svg", "/assets/img/rubika.svg", "/assets/img/phone.svg",
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

        # ---- per-page SEO surface ----
        for p in ["/", "/services/edit.html", "/services/web.html", "/services/pc.html"]:
            html = fetched[p][1]
            t = re.search(r"<title>(.*?)</title>", html, re.S)
            d = re.search(r'<meta name="description" content="(.*?)"', html)
            c = re.search(r'<link rel="canonical" href="(.*?)"', html)
            check(p + " title<=60", bool(t) and len(t.group(1)) <= 60, t.group(1)[:70] if t else "missing")
            check(p + " desc<=155", bool(d) and len(d.group(1)) <= 155, (d.group(1)[:70] if d else "missing"))
            check(p + " canonical", bool(c) and c.group(1).startswith("https://amirlwf.ir/"))
            check(p + " og tags", all(k in html for k in ("og:title", "og:description", "og:url", "twitter:card")))
            check(p + " single h1", html.count("<h1") == 1, f"h1x{html.count('<h1')}")
            # JSON-LD valid
            blobs = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
            ok, types = True, []
            for b in blobs:
                try:
                    types.append(json.loads(b).get("@type"))
                except Exception:
                    ok = False
            check(p + " json-ld valid", ok and len(blobs) >= 3, str(types))
            check(p + " LocalBusiness", "ProfessionalService" in types)
            if p != "/":
                check(p + " Service+FAQ+Breadcrumb",
                      "Service" in types and "FAQPage" in types and "BreadcrumbList" in types, str(types))
            # CSP, no third-party
            check(p + " CSP meta", "Content-Security-Policy" in html)
            ext = [u for u in re.findall(r'''(?:href|src|url\()["']?(https?://[^"'\)]+)''', html)
                   if "amirlwf.ir" not in u and "supabase.co" not in u]
            check(p + " zero third-party", not ext, str(ext[:3]))
            # internal linking: other services + callme
            check(p + " internal links",
                  all(x in html for x in ("/services/", "/callme/")) or p == "/",
                  "missing service/callme links")

        # ---- content depth ----
        for p in ["/services/edit.html", "/services/web.html", "/services/pc.html"]:
            txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", fetched[p][1], flags=re.S)
            txt = re.sub(r"<[^>]+>", " ", txt)
            words = [w for w in re.split(r"\s+", txt) if re.search(r"[\u0600-\u06FF]", w)]
            check(p + f" 300+ FA words ({len(words)})", len(words) >= 300)

        # ---- order forms ----
        for p in ["/", "/services/edit.html", "/services/web.html", "/services/pc.html"]:
            html = fetched[p][1]
            check(p + " order form",
                  all(k in html for k in ('id="order-form"', 'id="f-phone"', 'required',
                                          'id="f-website"', 'id="captcha-q"', 'id="track-box"')))

        # ---- sitemap/robots ----
        sm = fetched["/sitemap.xml"][1]
        for u in ["https://amirlwf.ir/", "/services/pc.html", "/services/web.html",
                  "/services/edit.html", "/callme/"]:
            check("sitemap has " + u, u in sm)
        check("sitemap hreflang", 'hreflang="fa"' in sm)
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
        for f in ("assets/js/site.js", "assets/js/order.js", "assets/js/admin.js", "assets/js/supabase-config.js"):
            r = subprocess.run(["node", "--check", os.path.join(ROOT, f)], capture_output=True, text=True)
            check("node --check " + f, r.returncode == 0, r.stderr.strip()[:120])

        # ---- SQL sanity ----
        sch = open(os.path.join(ROOT, "supabase/schema.sql"), encoding="utf-8").read()
        check("sql tables", all(k in sch for k in ("create table", "orders", "site_content", "notifications")))
        check("sql rls", sch.count("create policy") >= 5 and "enable row level security" in sch)
        check("sql phone check", "09[0-9]{9}" in sch)
        check("sql realtime", "supabase_realtime" in sch)

        # ---- callme preserved ----
        check("callme chat logic",
              all(k in fetched["/callme/"][1] for k in ("SCRIPT_URL", "pollReplies", "cosmic_chat_visitor", "sendMessage")))
    finally:
        srv.shutdown()

    print(f"\n{len(FAILS)} failures" if FAILS else "\nALL CHECKS PASSED")
    return 1 if FAILS else 0

sys.exit(main())
