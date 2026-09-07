"""E2E: admin login -> delete order #8 via UI button -> confirm row gone.
Reads creds from .env (never prints them). Handles the JS confirm dialog
via Page.handleJavaScriptDialog. Fails loudly on any step."""
import io
import json
import re
import time
import urllib.request
from websocket import create_connection

PORT = 9333
BASE = "http://127.0.0.1:8471"
TARGET_ID = "8"

env = {}
for line in io.open(".env", encoding="utf-8", errors="replace").read().splitlines():
    m = re.match(r"\s*([A-Za-z_][\w]*)\s*=\s*(.*)\s*$", line)
    if m:
        env[m.group(1)] = m.group(2).strip().strip("'\"")
EMAIL = env.get("ADMIN_EMAIL", "")
PASSWORD = env.get("ADMIN_PASSWORD", "")
assert EMAIL and PASSWORD, "ADMIN_EMAIL/PASSWORD missing in .env"

ver = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=10))
tab = [t for t in ver if t.get("type") == "page"][0]
ws = create_connection(tab["webSocketDebuggerUrl"], suppress_origin=True)
ws.settimeout(30)
ID = [0]


def cdp(method, params=None):
    """Send command; auto-accept any JS dialog while waiting for the reply."""
    ID[0] += 1
    my_id = ID[0]
    ws.send(json.dumps({"id": my_id, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("method") == "Page.javascriptDialogOpening":
            ws.send(json.dumps({"id": 90000 + my_id,
                                "method": "Page.handleJavaScriptDialog",
                                "params": {"accept": True}}))
            continue
        if msg.get("id") == my_id:
            return msg.get("result", {})


def js(expr):
    r = cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                 "awaitPromise": True})
    return (r.get("result") or {}).get("value")


cdp("Page.enable")
cdp("Runtime.enable")
cdp("Page.navigate", {"url": BASE + "/admin/"})
time.sleep(4)

js("(async () => { document.getElementById('l-email').value = %s; "
   "document.getElementById('l-pass').value = %s; "
   "document.getElementById('login-form').requestSubmit(); return 1; })()"
   % (json.dumps(EMAIL), json.dumps(PASSWORD)))
time.sleep(6)

panel = js("document.getElementById('panel-section').classList.contains('hidden') ? 'hidden' : 'visible'")
print("panel:", panel)
assert panel == "visible", "login failed — panel still hidden"

rows = js("document.getElementById('orders-body').innerText.slice(0,120)")
print("orders preview:", (rows or "")[:100])
assert TARGET_ID in (rows or ""), "order #8 not in list — cannot test delete"

clicked = js("(function(){ var tr=document.querySelector('tr[data-id=\"%s\"]'); "
             "if(!tr) return 'no-row'; var b=tr.querySelector('button[data-act=\"del\"]'); "
             "if(!b) return 'no-btn'; b.click(); return 'clicked'; })()" % TARGET_ID)
print("delete click:", clicked)
assert clicked == "clicked", "delete button missing for #8"

time.sleep(5)
gone_dom = js("!document.querySelector('tr[data-id=\"%s\"]')" % TARGET_ID)
toast = js("(document.getElementById('toast').textContent||'').slice(0,60)")
errs = js("JSON.stringify(window.__errs||[])")
print("row gone from DOM:", gone_dom)
print("toast:", toast)
print("page errors:", errs)
assert gone_dom is True, "row #8 still in DOM after delete"
ws.close()
print("E2E DELETE OK")
