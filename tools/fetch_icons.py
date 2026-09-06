"""Download brand icons locally (zero runtime third-party).
Saves: assets/img/telegram.svg, whatsapp.svg, rubika.svg, phone.svg
Run: python3 tools/fetch_icons.py (from site/ dir)
"""
import io
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
OUT = "assets/img"


def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def bake_fill(svg_bytes, fill):
    svg = svg_bytes.decode("utf-8", "replace")
    svg = svg.replace("<svg", "<svg fill='" + fill + "'", 1)
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    return svg.strip() + "\n"


SIMPLE = "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons"
jobs = [("telegram.svg", SIMPLE + "/telegram.svg", "#229ED9"),
        ("whatsapp.svg", SIMPLE + "/whatsapp.svg", "#25D366")]

for name, url, fill in jobs:
    try:
        raw = get(url)
        assert b"<svg" in raw and b"<path" in raw, "not an svg"
        io.open(OUT + "/" + name, "w", encoding="utf-8", newline="").write(bake_fill(raw, fill))
        print("OK %s (%d bytes)" % (name, len(raw)))
    except Exception as e:  # noqa: BLE001
        print("FAIL %s: %r" % (name, e))

# --- rubika: probe rubika.ir for a logo asset ---
try:
    html = get("https://rubika.ir/", timeout=25).decode("utf-8", "replace")
    cands = re.findall(r'(?:src|href)="([^"]*?(?:logo|brand)[^"]*\.(?:svg|png))"', html, re.I)
    print("rubika candidates:", cands[:8] or "none")
    saved = False
    for c in cands:
        if c.startswith("//"):
            c = "https:" + c
        elif c.startswith("/"):
            c = "https://rubika.ir" + c
        try:
            raw = get(c)
            if c.endswith(".svg") and b"<svg" in raw:
                io.open(OUT + "/rubika.svg", "w", encoding="utf-8", newline="").write(
                    raw.decode("utf-8", "replace"))
                print("OK rubika.svg from", c)
                saved = True
                break
            elif c.endswith(".png") and raw[:8] == b"\x89PNG\r\n\x1a\n":
                io.open(OUT + "/rubika.png", "wb").write(raw)
                print("OK rubika.png from", c, "(%d bytes)" % len(raw))
                saved = True
                break
        except Exception as e:  # noqa: BLE001
            print("  skip", c, repr(e)[:100])
    if not saved:
        print("RUBIKA_FALLBACK_NEEDED")
except Exception as e:  # noqa: BLE001
    print("rubika probe failed:", repr(e)[:150])
    print("RUBIKA_FALLBACK_NEEDED")

# --- phone handset (generic, drawn inline; Material 'call' glyph) ---
phone = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FFFFFF">'
    "<path d=\"M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 "
    "1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 "
    "0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 "
    "1.02l-2.2 2.2z\"/></svg>\n"
)
io.open(OUT + "/phone.svg", "w", encoding="utf-8", newline="").write(phone)
print("OK phone.svg (inline glyph)")
