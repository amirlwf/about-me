"""CDP performance pass: bytes, requests, timing, third-party check per page."""
import json, time, urllib.request
from websocket import create_connection

PORT = 9333
BASE = "http://127.0.0.1:8471"
PAGES = ["/", "/services/pc.html", "/services/web.html",
         "/services/edit.html", "/callme/", "/admin/"]

ver = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=10))
# fresh tab so we never measure a stale document
req = urllib.request.Request(f"http://127.0.0.1:{PORT}/json/new?about:blank",
                             method="PUT")
fresh = json.load(urllib.request.urlopen(req, timeout=10))
ws = create_connection(fresh["webSocketDebuggerUrl"], suppress_origin=True)
ID = [0]

def cdp(method, params=None):
    ID[0] += 1
    ws.send(json.dumps({"id": ID[0], "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == ID[0]:
            return msg.get("result", {})

cdp("Page.enable")
cdp("Network.enable")

JS = """(() => {
  const t = performance.timing;
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource').map(r => ({
    u: r.name.split('/').pop().slice(0, 40), kb: Math.round(r.transferSize/102.4)/10 }));
  return { dcl: t.domContentLoadedEventEnd - t.navigationStart,
    load: t.loadEventEnd - t.navigationStart,
    dom: document.getElementsByTagName('*').length,
    res };
})()"""

for p in PAGES:
    cdp("Page.navigate", {"url": BASE + p})
    time.sleep(3.5)
    r = cdp("Runtime.evaluate", {"expression": JS, "returnByValue": True})
    v = r["result"]["value"]
    total = sum(x["kb"] for x in v["res"])
    third = [x["u"] for x in v["res"]
             if x["u"].startswith("http") and "127.0.0.1" not in x["u"]]
    print(f"{p} dcl={v['dcl']}ms load={v['load']}ms dom={v['dom']} "
          f"res={len(v['res'])} totalKB={round(total,1)} third={third}")
ws.close()
