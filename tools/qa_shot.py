"""CDP screenshots (mobile 390 + desktop 1366) + JS console error sweep."""
import base64, json, time, urllib.request
from websocket import create_connection

PORT = 9333
BASE = "http://127.0.0.1:8471"
SHOTS = [("/", 390, 844, "shot-m-home.png"),
         ("/services/pc.html", 390, 844, "shot-m-pc.png"),
         ("/", 1366, 900, "shot-d-home.png")]

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
cdp("Page.addScriptToEvaluateOnNewDocument",
    {"source": "window.__errs=[];addEventListener('error',e=>window.__errs.push(String(e.message)));"})
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)))

for path, w, h, name in SHOTS:
    cdp("Emulation.setDeviceMetricsOverride",
        {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": w < 700})
    cdp("Page.navigate", {"url": BASE + path})
    time.sleep(3)
    cdp("Page.bringToFront")
    time.sleep(0.5)
    shot = cdp("Page.captureScreenshot", {"format": "png"})
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    errs = cdp("Runtime.evaluate",
               {"expression": "JSON.stringify(window.__errs)", "returnByValue": True})
    print(path, w, "errors:", errs["result"]["value"], "->", name)
    cdp("Emulation.clearDeviceMetricsOverride")
ws.close()
print("done")
