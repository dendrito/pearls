"""Tests the page side of the Android 2.0 shell, with Chromium standing in for the WebView:
- the app served from https://appassets.androidplatform.net (as AppServer does), text from ph.yhb.org.il through /proxy;
- the one-time carry-over of saved data from file:// (migrate.html -> saveMigration -> takeMigration);
- bundled fonts: nothing requested from Google Fonts, and the faces actually load;
- the phone's own voices, listed and rendered by the app at /native/device-voice/ (DeviceVoice.java)."""
import json, mimetypes, os, sys
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); www = os.path.join(here, "www")
HOST = "https://appassets.androidplatform.net"
checks, errors, external = [], [], []
def check(n, ok, info=""): checks.append(ok); print(("PASS " if ok else "FAIL ") + n + (f"  [{info}]" if info else ""))

def server(route):                       # what AppServer.java does
    u = urlparse(route.request.url)
    if u.path.startswith("/www/"):
        f = os.path.join(www, u.path[5:])
        if not os.path.isfile(f): return route.fulfill(status=404, body="")
        return route.fulfill(status=200, body=open(f, "rb").read(), content_type=mimetypes.guess_type(f)[0] or "application/octet-stream")
    if u.path == "/proxy":
        t = parse_qs(u.query)["u"][0]; proxied.append(t)
        slugs = t.split("slug=")[1].split(",")[:4]
        body = [{"slug": s, "link": "https://ph.yhb.org.il/" + s, "title": {"rendered": "כותרת " + s}, "content": {"rendered": "<p>מן השרת " + s + "</p>"}} for s in slugs]
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))
    if u.path == "/native/device-voice/list":
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(VOICES))
    if u.path == "/native/device-voice/say":
        q = parse_qs(u.query); said.append({"id": q.get("id", [""])[0], "text": q.get("text", [""])[0]})
        n = 24000; import struct
        wav = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 24000, 48000, 2, 16) + b"data" + struct.pack("<I", n * 2) + bytes(n * 2)
        return route.fulfill(status=200, body=wav, headers={"content-type": "audio/wav", "X-Gen-Seconds": "0.1"})
    route.fulfill(status=404, body="")
proxied = []; said = []
VOICES = [{"id": "en-gb-x-rjs-local", "name": "UK English RJS", "lang": "en-GB", "quality": "high", "gender": "male"},
          {"id": "en-us-x-tpf-local", "name": "US English TPF", "lang": "en-US", "quality": "high", "gender": "female"}]
BRIDGE = """window.PearlsNative = { saveMigration(j) { console.log("MIG:" + j); }, info: () => JSON.stringify({ ok: true, dir: "%s/dl/", free: 1e9, deviceVoices: true }),
  status: () => '{"active":[],"finished":[],"failed":[]}', list: () => "[]", readText: () => null, writeText: () => true, textList: () => "[]",
  setBars() {}, mediaState() {} };""" % HOST

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.add_init_script(BRIDGE)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    mig = []
    pg.on("console", lambda m: m.text.startswith("MIG:") and mig.append(m.text[4:]))
    # 1. an "old" install: data saved under file://
    pg.route("https://appassets.androidplatform.net/**", lambda r: r.abort())
    pg.goto("file://" + os.path.join(www, "index.html")); pg.wait_for_timeout(300)
    pg.evaluate("""localStorage.setItem('pearls:mine', JSON.stringify([{id:'u1',name:'Shabbat prep',tracks:['01-01','01-02'],created:1}]));
                   localStorage.setItem('pearls:interests', JSON.stringify(['shabbat']));""")
    pg.goto("file://" + os.path.join(www, "migrate.html")); pg.wait_for_timeout(500)
    check("migrate.html hands over the saved data", mig and "Shabbat prep" in mig[0], (mig[0][:60] if mig else ""))
    # 2. the new app at its https address picks it up
    pg.unroute("https://appassets.androidplatform.net/**")
    ctx.route("https://appassets.androidplatform.net/**", server)
    ctx.route("https://fonts.googleapis.com/**", lambda r: (external.append(r.request.url), r.abort()))
    ctx.route("https://fonts.gstatic.com/**", lambda r: (external.append(r.request.url), r.abort()))
    ctx.add_init_script("window.PearlsNative.takeMigration = (() => { let m = %s; return () => { const r = m; m = null; return r; }; })();" % json.dumps(mig[0] if mig else "{}"))
    pg2 = ctx.new_page(); pg2.on("pageerror", lambda e: errors.append(str(e)))
    pg2.goto(HOST + "/www/index.html"); pg2.wait_for_timeout(800)
    check("playlists carried over to the new address", "Shabbat prep" in json.dumps(pg2.evaluate("PEARLS.state.mine")))
    check("onboarding not shown again", not pg2.query_selector("#onbGo"))
    # 3. Hebrew text through the app's own fetcher
    pg2.evaluate("PEARLS.state.prefs.read='he'"); pg2.goto(HOST + "/www/index.html#ch-01-02"); pg2.wait_for_timeout(1500)
    check("Hebrew text comes through /proxy", proxied and "ph.yhb.org.il/wp-json" in proxied[0] and "מן השרת" in pg2.inner_text("#reader"), proxied[:1])
    # 4. fonts are local
    loaded = pg2.evaluate("""(async () => { await document.fonts.ready; const fams = ['Geist','Instrument Serif','Figtree','Frank Ruhl Libre'];
      const r = {}; for (const f of fams) r[f] = (await document.fonts.load(`16px "${f}"`, f === 'Frank Ruhl Libre' ? 'שלום' : 'Ab')).length > 0; return r; })()""")
    check("bundled fonts load", all(loaded.values()), loaded)
    check("nothing requested from Google Fonts", not external, external[:2])
    pg2.screenshot(path=os.path.join(here, "shots", "shell-https.png"))
    # 5. the phone's own voices come from the app (the WebView's speechSynthesis says nothing)
    pg2.evaluate("PEARLS.state.prefs.read='en'; PEARLS.state.prefs.voiceEngine='device'; delete PEARLS.state.prefs.voice")
    tid = pg2.evaluate("PEARLS.TRACKS.find(t => PEARLS.listenLang(t) === 'tts').id")
    pg2.goto(HOST + "/www/index.html#ch-" + tid); pg2.wait_for_timeout(800)
    pg2.evaluate("(() => { const b = document.createElement('button'); b.dataset.act = 'voice'; document.querySelector('.view').appendChild(b); b.click(); })()"); pg2.wait_for_timeout(500)
    vt = pg2.evaluate("(document.querySelector('[data-voices]') || {}).textContent || ''")
    check("Settings lists the phone's voices from the app, the male one chosen", "RJS" in vt and "High quality" in vt and pg2.evaluate("!!document.querySelector('[data-voice=\"en-gb-x-rjs-local\"].on')"), vt[:120])
    pg2.evaluate("PEARLS.audio.src = 'speech:%s:0'; PEARLS.audio.play()" % tid); pg2.wait_for_timeout(1500)
    check("reading goes through the app's voice", said and said[0]["id"] == "en-gb-x-rjs-local" and pg2.evaluate("PEARLS.audio.neural"), said[:1])
    pg2.evaluate("PEARLS.audio.pause()")
    b.close()
print("errors:", errors or "none"); print(f"{sum(checks)}/{len(checks)} checks passed")
sys.exit(0 if all(checks) and not errors else 1)
