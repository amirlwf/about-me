"""Find horizontal-overflow offenders on amirlwf.ir pages at 390px."""
import json, sys, time, urllib.request
from websocket import create_connection

PORT = 9333
BASE = "http://127.0.0.1:8471"
PAGES = sys.argv[1:] or ["/", "/services/pc.html", "/callme/", "/admin/"]

def cdp(method, params=None, ws=None):
    ws.send(json.dumps({"id": 1, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == 1:
            return msg.get("result", {})

ver = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=10))
tab = [t for t in ver if t.get("type") == "page"][0]
ws = create_connection(tab["webSocketDebuggerUrl"], suppress_origin=True)
cdp("Page.enable", ws=ws)
cdp("Runtime.enable", ws=ws)

JS = """(() => {
  const out = { inner: window.innerWidth,
    docSW: document.scrollingElement.scrollWidth, bad: [] };
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > window.innerWidth + 1 && r.width < 9000) {
      let sel = el.tagName.toLowerCase();
      if (el.id) sel += '#' + el.id;
      else if (el.className && typeof el.className === 'string')
        sel += '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.');
      out.bad.push(sel + ' w=' + Math.round(r.width));
    }
  });
  return out;
})()"""

for p in PAGES:
    cdp("Emulation.setDeviceMetricsOverride",
        {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True}, ws=ws)
    cdp("Page.navigate", {"url": BASE + p}, ws=ws)
    time.sleep(2.5)
    cdp("Page.bringToFront", ws=ws)
    time.sleep(0.5)
    res = cdp("Runtime.evaluate", {"expression": JS, "returnByValue": True}, ws=ws)
    print(p, "=>", json.dumps(res["result"]["value"], ensure_ascii=False))
    errs = cdp("Runtime.evaluate", {
        "expression": "window.__err || 'n/a'", "returnByValue": True}, ws=ws)
    cdp("Emulation.clearDeviceMetricsOverride", ws=ws)

ws.close()
