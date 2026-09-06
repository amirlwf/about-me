"""Download Vazirmatn (400/500/700) + Lalezar (400) woff2 subsets (arabic+latin)
from Google Fonts and rewrite as local assets/fonts/fonts.css."""
import re, urllib.request, os

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS_URL = "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&family=Lalezar&display=swap"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "fonts")

req = urllib.request.Request(CSS_URL, headers={"User-Agent": UA})
css = urllib.request.urlopen(req, timeout=30).read().decode()

# Split into @font-face blocks, keep arabic + latin subsets only
blocks = re.findall(r"/\* (\w[\w-]*) \*/\s*@font-face \{(.*?)\}", css, re.S)
wanted_subsets = {"arabic", "latin"}
out_css = []
n = 0
for subset, body in blocks:
    if subset not in wanted_subsets:
        continue
    fam = re.search(r"font-family: '([^']+)'", body).group(1)
    weight = re.search(r"font-weight: (\d+)", body).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
    fname = f"{fam.lower()}-{weight}-{subset}.woff2"
    dest = os.path.join(OUT, fname)
    if not os.path.exists(dest):
        r = urllib.request.Request(url, headers={"User-Agent": UA})
        data = urllib.request.urlopen(r, timeout=30).read()
        with open(dest, "wb") as f:
            f.write(data)
        print("downloaded", fname, len(data), "bytes")
    else:
        print("cached", fname)
    ur = re.search(r"unicode-range: ([^;]+);", body).group(1)
    out_css.append(
        f"/* {fam} {weight} {subset} — local */\n@font-face {{\n"
        f"  font-family: '{fam}';\n  font-style: normal;\n  font-weight: {weight};\n"
        f"  font-display: swap;\n  src: url('{fname}') format('woff2');\n"
        f"  unicode-range: {ur};\n}}"
    )
    n += 1

with open(os.path.join(OUT, "fonts.css"), "w", encoding="utf-8") as f:
    f.write("\n".join(out_css) + "\n")
print("wrote fonts.css with", n, "faces")
