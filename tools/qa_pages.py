"""qa_pages.py — one sweep over every page: horizontal overflow at 390px and
1366px, uncaught JS errors, failed subresources, plus per-page sanity flags
(single h1, JS-alive markers). Needs Chrome on :9333 and the site on :8471.

Usage:  python tools/qa_pages.py [path ...]
"""
import json
import sys
import time
import urllib.request
from websocket import create_connection

PORT = 9333
BASE = "http://127.0.0.1:8471"
PAGES = sys.argv[1:] or [
    "/", "/fa/", "/fa/services/edit.html", "/fa/services/web.html",
    "/fa/services/pc.html", "/en/services/edit.html", "/en/services/web.html",
    "/admin/", "/callme/", "/fa/callme/",
]

ver = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=10))
tab = [t for t in ver if t.get("type") == "page"][0]
ws = create_connection(tab["webSocketDebuggerUrl"], suppress_origin=True)
ID = [0]


def cdp(method, params=None):
    ID[0] += 1
    ws.send(json.dumps({"id": ID[0], "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == ID[0]:
            return msg.get("result", {})


cdp("Page.enable")
cdp("Runtime.enable")
cdp("Page.addScriptToEvaluateOnNewDocument", {
    "source": ("window.__errs=[];"
               "addEventListener('error',e=>window.__errs.push(String(e.message||e.error)));"
               "addEventListener('unhandledrejection',e=>window.__errs.push('rej:'+String(e.reason)));")
})

CHECK = """(() => {
  const r = {};
  r.overflow = document.documentElement.scrollWidth - window.innerWidth;
  r.h1 = document.querySelectorAll('h1').length;
  r.revealHidden = document.querySelectorAll('.reveal:not(.in)').length;
  r.chips = document.querySelectorAll('.channel-chip, .contact-btns a').length;
  r.captcha = (document.getElementById('captcha-q') || document.getElementById('e-captcha-q') || {}).textContent || null;
  r.content = !!window.SITE_CONTENT;
  r.dataPage = document.body.getAttribute('data-page') || '';
  r.dir = document.documentElement.dir;
  r.bad = performance.getEntriesByType('resource')
            .filter(x => x.responseStatus >= 400)
            .map(x => x.name.split('/').slice(-1)[0]);
  r.errs = (window.__errs || []).slice(0, 3);
  r.wide = [];
  document.querySelectorAll('*').forEach(el => {
    const b = el.getBoundingClientRect();
    if (b.width > window.innerWidth + 1 && b.width < 9000) {
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (typeof el.className === 'string' && el.className.trim())
        s += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      r.wide.push(s + ' w=' + Math.round(b.width));
    }
  });
  return r;
})()"""

fails = []
for w, h, label in ((390, 844, "mobile"), (1366, 900, "desktop")):
    for p in PAGES:
        cdp("Emulation.setDeviceMetricsOverride",
            {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": w < 700})
        cdp("Page.navigate", {"url": BASE + p})
        time.sleep(2.2)
        res = cdp("Runtime.evaluate", {"expression": CHECK, "returnByValue": True})
        v = res.get("result", {}).get("value") or {}
        # scroll through so IntersectionObserver reveals fire, then re-check
        cdp("Runtime.evaluate", {"expression": "window.scrollTo(0, document.body.scrollHeight)"})
        time.sleep(0.8)
        res2 = cdp("Runtime.evaluate", {"expression": CHECK, "returnByValue": True})
        v2 = res2.get("result", {}).get("value") or {}
        problems = []
        if v.get("overflow", 0) > 1:
            problems.append(f"overflow {v['overflow']}px {v.get('wide', [])[:4]}")
        if v.get("errs"):
            problems.append(f"js errors {v['errs']}")
        if v.get("bad"):
            problems.append(f"bad resources {v['bad']}")
        # public pages must have exactly one h1; the admin panel keeps one per tab
        expect_h1 = 1 if v.get("dataPage") else None
        if expect_h1 is not None and v.get("h1") != expect_h1:
            problems.append(f"h1={v.get('h1')}")
        if expect_h1 is None and not v.get("h1"):
            problems.append("h1 missing")
        if v2.get("revealHidden", 0) > 0:
            problems.append(f"reveal stuck x{v2['revealHidden']}")
        status = "OK  " if not problems else "FAIL"
        if problems:
            fails.append((label, p, problems))
        print(f"{status} [{label:7}] {p:30} chips={v.get('chips')} captcha={v.get('captcha')!r} "
              f"content={v.get('content')} page={v.get('dataPage')} dir={v.get('dir')}")
        for pr in problems:
            print("        -", pr)

cdp("Emulation.clearDeviceMetricsOverride", {})
ws.close()
print("\n%d problem pages" % len(fails))
sys.exit(1 if fails else 0)
