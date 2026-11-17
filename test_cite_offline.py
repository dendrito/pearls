"""Citation texts kept on the device: opened once online, they open offline; never-opened ones say why."""
import os, json
from playwright.sync_api import sync_playwright
url = "file://" + os.path.join(os.path.dirname(os.path.abspath(__file__)), "www", "index.html")
calls = []
online = {"v": True}
def route(r):
    u = r.request.url
    if "sefaria.org/api/v3/texts" in u:
        calls.append(u)
        if not online["v"]: return r.abort()
        return r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
            body=json.dumps({"ref": "Exodus 20:8", "versions": [
                {"language": "he", "versionTitle": "T", "license": "PD", "text": "זכור את יום השבת"},
                {"language": "en", "versionTitle": "J", "license": "PD", "text": "Remember the sabbath day"}]}))
    return r.abort() if u.startswith("http") else r.continue_()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
    ctx = b.new_context(); pg = ctx.new_page(); pg.route("**/*", route)
    pg.goto(url); pg.wait_for_timeout(500)
    r1 = pg.evaluate("PEARLS_CITE.fetchSource('Exodus 20:8').then(x=>x.en||x.error)")
    pg.wait_for_timeout(300)
    online["v"] = False
    pg.reload(); pg.wait_for_timeout(500)
    r2 = pg.evaluate("PEARLS_CITE.fetchSource('Exodus 20:8').then(x=>x.en||x.error)")
    r3 = pg.evaluate("PEARLS_CITE.fetchSource('Exodus 20:9').then(x=>x.en||x.error)")
    ok = [r1 == "Remember the sabbath day", r2 == "Remember the sabbath day", "first time" in r3]
    print(f"cite offline: {sum(ok)}/3")
