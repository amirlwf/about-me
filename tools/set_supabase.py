"""set_supabase.py — point the whole site at a NEW Supabase project.

Usage:
    python tools/set_supabase.py <project-ref> <anon-key>

Rewrites (idempotent, keeps everything else intact):
  * assets/js/supabase-config.js   -> SUPABASE_URL + SUPABASE_ANON_KEY
  * the CSP connect-src on every HTML page (http + wss hosts)

Run it, then `git add -A && git commit && git push` — GitHub Pages redeploy
is the rest of the rollout. Does NOT print or store the anon key anywhere
else; the anon key is public by design (it ships in the browser anyway).
"""
import io, os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD_REFS = (
    "ysjdodvtmihaxyioknuo",
)


def html_files():
    out = []
    for base, _dirs, files in os.walk(ROOT):
        if os.sep + ".git" in base:
            continue
        for f in files:
            if f.endswith(".html"):
                out.append(os.path.join(base, f))
    return out


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    ref, anon = sys.argv[1].strip(), sys.argv[2].strip()
    if "/" in ref or ":" in ref:
        print("first arg must be the project ref (e.g. abcdefghijklmnop), not a URL")
        return 2
    new_host = ref + ".supabase.co"
    touched = []

    cfg = os.path.join(ROOT, "assets", "js", "supabase-config.js")
    src = io.open(cfg, encoding="utf-8", newline="").read()
    crlf = "\r\n" in src
    t = src.replace("\r\n", "\n")
    import re
    t = re.sub(r'SUPABASE_URL:\s*"[^"]*"', 'SUPABASE_URL: "https://%s"' % new_host, t)
    t = re.sub(r'SUPABASE_ANON_KEY:\s*"[^"]*"', 'SUPABASE_ANON_KEY: "%s"' % anon, t)
    io.open(cfg, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n") if crlf else t)
    touched.append("assets/js/supabase-config.js")

    for path in html_files():
        raw = io.open(path, encoding="utf-8", newline="").read()
        crlf = "\r\n" in raw
        t = raw.replace("\r\n", "\n")
        orig = t
        for old in OLD_REFS:
            t = t.replace(old, ref)
        if t != orig:
            io.open(path, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n") if crlf else t)
            touched.append(os.path.relpath(path, ROOT))

    print("updated %d files -> %s" % (len(touched), new_host))
    for f in touched:
        print("  ", f)

    # Cache-bust: GitHub Pages serves assets with max-age=14400, so a browser
    # that already cached the previous project's config keeps calling the dead
    # project for 4 hours (forms/chat "randomly" failing after a migration).
    # Bump the query string so every page load re-fetches supabase-config.js.
    import glob as _glob
    import re as _re
    import time as _t

    ver = _t.strftime("%Y%m%d") + str(int(_t.time()) % 100)
    bumped = 0
    for path in _glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        if os.sep + ".git" in path:
            continue
        raw = io.open(path, encoding="utf-8", newline="").read()
        if "supabase-config.js" not in raw:
            continue
        crlf = "\r\n" in raw
        t = raw.replace("\r\n", "\n")
        new_t = _re.sub(r"supabase-config\.js(\?v=[0-9]+)?",
                        "supabase-config.js?v=" + ver, t)
        if new_t != t:
            io.open(path, "w", encoding="utf-8", newline="").write(
                new_t.replace("\n", "\r\n") if crlf else new_t)
            bumped += 1
    print("cache-bust supabase-config.js?v=%s on %d pages" % (ver, bumped))

    print("\nnext: git add -A && git commit && git push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
