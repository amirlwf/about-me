#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bake_seo.py — pull live admin-edited SEO values from Supabase and bake them
into the static HTML <title> + meta description + og/twitter tags, so Google
re-crawls the CRAWLED page and sees the new title (like other sites do).

Usage (local machine):
  python3 tools/bake_seo.py
Env (or .env in repo root): SUPABASE_URL + SUPABASE_ANON_KEY (read-only anon;
site_content is publicly readable via its anon SELECT policy).

Read-only on the DB (anon SELECT), rewrites only head SEO lines in the HTML
(exact old->new replacements; body content untouched). Run + commit + push
after changing SEO fields in the admin panel.
"""
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = {
    "en": "index.html",
    "fa": "fa/index.html",
    "fa_edit": "fa/services/edit.html",
    "fa_web": "fa/services/web.html",
    "fa_pc": "fa/services/pc.html",
}
FIELDS = ("seo_title", "seo_description")

# SEO fields are non-secret: only URL + anon key are read from .env, and
# the anon key also ships in supabase-config.js (public).
ALLOWED_ENV_KEYS = ("SUPABASE_URL", "SUPABASE_ANON_KEY")


def read_env():
    env = {k: v for k, v in os.environ.items() if k in ALLOWED_ENV_KEYS}
    envp = os.path.join(ROOT, ".env")
    if os.path.isfile(envp):
        for line in io.open(envp, encoding="utf-8", errors="replace"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip()
            if k in ALLOWED_ENV_KEYS and v:
                env[k] = v
    return env


def fetch_content(url, anon):
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/site_content?select=key,value&limit=50",
        headers={"apikey": anon},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        rows = json.load(r)
    return {row["key"]: row["value"] for row in rows}


def esc_attr(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def bake_head(html, title=None, desc=None):
    """Replace (or insert) <title>, meta description, og/twitter tags."""
    changed = False

    def sub(pattern, repl):
        nonlocal html, changed
        new, n = re.subn(pattern, repl, html, count=1)
        if n:
            html, changed = new, True
            return True
        return False

    if title:
        t = esc_attr(title)
        if not sub(r"<title>[^<]*</title>", "<title>" + t + "</title>"):
            html = html.replace("<head>", "<head>\n<title>" + t + "</title>", 1)
            changed = True
        for pat, rep in (
            (r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="' + t + '">'),
            (r'<meta name="twitter:title" content="[^"]*">', '<meta name="twitter:title" content="' + t + '">'),
        ):
            if not sub(pat, rep):
                # tag absent -> add after description meta if present
                if sub(r'(<meta name="description"[^>]*>)', r"\1\n" + rep):
                    pass
    if desc:
        d = esc_attr(desc)
        if not sub(r'<meta name="description" content="[^"]*">',
                   '<meta name="description" content="' + d + '">'):
            html = html.replace("<head>", '<head>\n<meta name="description" content="' + d + '">', 1)
            changed = True
        for pat, rep in (
            (r'<meta property="og:description" content="[^"]*">',
             '<meta property="og:description" content="' + d + '">'),
            (r'<meta name="twitter:description" content="[^"]*">',
             '<meta name="twitter:description" content="' + d + '">'),
        ):
            if not sub(pat, rep):
                pass
    return html, changed


def main():
    env = read_env()
    url, anon = env.get("SUPABASE_URL", ""), env.get("SUPABASE_ANON_KEY", "")
    if not url or not anon:
        print("SUPABASE_URL / SUPABASE_ANON_KEY missing (.env or env vars).")
        return 2

    rows = fetch_content(url, anon)

    pages = {pid: rows.get(pid) or {} for pid in PAGES}
    biz = rows.get("business") or {}
    legacy_title, legacy_desc = biz.get("seo_title"), biz.get("seo_description")

    dirty = []
    for pid, rel in PAGES.items():
        data = pages[pid] or {}
        title = data.get("seo_title")
        desc = data.get("seo_description")
        if pid == "fa":
            # fa seed keeps an og:title variant; description mirrors business fallback
            if not title and legacy_title:
                title = legacy_title
            if not desc and legacy_desc:
                desc = legacy_desc
        if not title and not desc:
            continue
        path = os.path.join(ROOT, rel)
        raw = io.open(path, "r", encoding="utf-8", newline="").read()
        crlf = "\r\n" in raw
        html = raw.replace("\r\n", "\n")
        html2, changed = bake_head(html, title=title, desc=desc)
        if changed and html2 != html:
            out = html2.replace("\n", "\r\n") if crlf else html2
            io.open(path, "w", encoding="utf-8", newline="").write(out)
            dirty.append(rel)

    if dirty:
        print("Baked SEO into %d page(s):" % len(dirty))
        for rel in dirty:
            print("  -", rel)
        print("Next: git add/commit/push — Google picks it up on next crawl.")
        return 0
    print("No SEO differences; pages already match the admin panel.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
