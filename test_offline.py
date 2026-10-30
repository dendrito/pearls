"""Offline + downloads test. Runs the app with a stand-in for the Android bridge (window.PearlsNative) that behaves
like PearlsBridge.java: enqueue -> active -> finished files served from a folder of silent MP3s. Checks downloads,
smart downloads, Wi-Fi-only waiting, offline playback from local files, offline reading, auto-delete and the Downloads page."""
import json, os, shutil, subprocess, sys
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__))
shots = os.path.join(here, "shots"); os.makedirs(shots, exist_ok=True)
mock = os.path.join(here, "build", "mockdl"); shutil.rmtree(mock, ignore_errors=True); os.makedirs(mock)
silence = os.path.join(mock, "_s.mp3")
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "4", "-b:a", "32k", silence], check=True)
cat = json.load(open(os.path.join(here, "catalog_en.json")))
avail = []
for ch in cat["volumes"][0]["chapters"][:8]:                       # Shabbat chapters 1-8 exist "on the server"
    for i in range(ch["sections"]):
        for lang in ("he", "en"):
            n = f"01-{ch['n']:02d}-{i + 1:02d}-{lang}.mp3"; shutil.copy(silence, os.path.join(mock, n)); avail.append(n)
url = "file://" + os.path.join(here, "www", "index.html")

MOCK = """(() => {
  const DIR = %s, AVAIL = new Set(%s);
  const S = JSON.parse(localStorage.getItem("mockNative") || '{"files":{},"active":{},"text":{}}');
  const save = () => localStorage.setItem("mockNative", JSON.stringify(S));
  window.__mock = S; window.__enq = [];
  window.PearlsNative = {
    info: () => JSON.stringify({ ok: true, dir: DIR, free: 5e9, online: navigator.onLine, metered: !!window.__metered }),
    enqueue(json, wifiOnly) { let n = 0; for (const j of JSON.parse(json)) { if (S.files[j.name] || S.active[j.name]) continue;
      S.active[j.name] = { name: j.name, status: "pending", done: 0, total: 2e6, polls: 0, wifiOnly }; window.__enq.push(j); n++; } save(); return n; },
    status() { const out = { active: [], finished: [], failed: [] };
      for (const [n, a] of Object.entries(S.active)) {
        const blocked = !navigator.onLine || (a.wifiOnly && window.__metered);
        a.status = blocked ? "paused" : "running";
        if (!blocked && ++a.polls >= 2) { delete S.active[n]; if (AVAIL.has(n)) { S.files[n] = 2e6; out.finished.push(n); } else out.failed.push({ name: n, reason: 404 }); }
        else { a.done = Math.min(a.total, a.polls * 1e6); out.active.push({ name: n, status: a.status, done: a.done, total: a.total }); }
      } save(); return JSON.stringify(out); },
    list: () => JSON.stringify(Object.entries(S.files).map(([n, s]) => ({ n, s }))),
    remove(json) { let k = 0; for (const n of JSON.parse(json)) { if (S.files[n]) { delete S.files[n]; k++; } delete S.active[n]; } save(); return k; },
    cancelAll() { S.active = {}; save(); },
    readText: k => S.text[k] || null, writeText(k, v) { S.text[k] = v; save(); return true; },
    textList: () => JSON.stringify(Object.entries(S.text).map(([n, s]) => ({ n, s: s.length }))), clearText() { const n = Object.keys(S.text).length; S.text = {}; save(); return n; },
    setBars(c, light) { window.__bars = [c, light]; },
    mediaState(j) { (window.__media = window.__media || []).push(JSON.parse(j)); }
  };
})();""" % (json.dumps("file://" + mock + "/"), json.dumps(avail))

def fake_api(route):
    u = route.request.url
    if "ph.yhb.org.il/wp-json" in u:          # Hebrew API: return one post per requested slug
        slugs = u.split("slug=")[1].split(",")[:6]
        body = [{"slug": s, "link": "https://ph.yhb.org.il/" + s, "title": {"rendered": "כותרת " + s}, "content": {"rendered": "<p>טקסט עברי לבדיקה " + s + "</p>"}} for s in slugs]
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))
    return route.abort()

errors, checks = [], []
def check(name, ok, info=""):
    checks.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info else ""))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
                          args=["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    ctx.add_init_script(MOCK)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "net::" not in m.text and "Failed to load resource" not in m.text and errors.append(m.text))
    pg.route("http*://**/*", fake_api)
    pg.goto(url); pg.wait_for_timeout(400)
    for tag in ["shabbat", "kiddush"]: pg.click(f'#onbChips [data-tag="{tag}"]')
    pg.click("#onbGo"); pg.wait_for_timeout(300)
    pg.evaluate("PEARLS.DL.prefs.smart = false")                  # manual downloads first

    # 1. manual download of a chapter (English reading exists for Shabbat -> downloads English)
    pg.goto(url + "#ch-01-01"); pg.wait_for_timeout(600)
    check("download button on chapter page", pg.is_visible('[data-act="dl"][data-id="01-01"]'))
    pg.click('[data-act="dl"][data-id="01-01"]'); pg.wait_for_timeout(300)
    check("download queued all 16 sections", len(pg.evaluate("__enq")) == 16, pg.evaluate("__enq.length"))
    pg.wait_for_timeout(6500)
    st = pg.evaluate("PEARLS.dlState(PEARLS.TRACKS.find(t=>t.id==='01-01'))")
    check("chapter downloaded", st["s"] == "done", st)
    check("button says Downloaded", "Downloaded" in pg.inner_text('[data-act="dl"][data-id="01-01"]'), pg.inner_text('[data-act="dl"][data-id="01-01"]'))
    check("Hebrew text saved with the download", "he-01-01.json" in pg.evaluate("Object.keys(__mock.text)"))
    pg.screenshot(path=f"{shots}/off-1-chapter-downloaded.png")

    # 2. Wi-Fi only: on mobile data the download waits
    pg.evaluate("window.__metered = true")
    pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(500)
    pg.click('[data-act="dl"][data-id="01-06"]'); pg.wait_for_timeout(3000)
    check("waits for Wi-Fi on mobile data", "Wi" in pg.inner_text('[data-act="dl"][data-id="01-06"]'), pg.inner_text('[data-act="dl"][data-id="01-06"]'))
    pg.evaluate("window.__metered = false"); pg.wait_for_timeout(6000)
    check("starts once on Wi-Fi", pg.evaluate("PEARLS.dlState(PEARLS.TRACKS.find(t=>t.id==='01-06')).s") == "done")

    # 3. smart downloads: play the book from chapter 2 -> current + 3 ahead download by themselves
    pg.evaluate("PEARLS.DL.prefs.smart = true; PEARLS.DL.prefs.ahead = 3")
    pg.goto(url + "#vol-01"); pg.wait_for_timeout(400)
    check("Download all on the book page", pg.is_visible('[data-act="dlmany"]'), pg.inner_text('[data-act="dlmany"]'))
    pg.evaluate("(()=>{const ids=PEARLS.TRACKS.filter(t=>t.vol.book==='01').map(t=>t.id); document.querySelector('[data-act=\"playvol\"]').dataset.start=1; })()")
    pg.click('[data-act="playvol"]'); pg.wait_for_timeout(4000)
    auto = pg.evaluate("Object.entries(PEARLS.DL.idx).filter(([k,v])=>v.auto).map(([k])=>k).sort()")
    check("smart downloads fetched the queue ahead", auto == ["01-02", "01-03", "01-04", "01-05"], auto)
    pg.wait_for_timeout(6000)
    check("smart downloads finished", all(pg.evaluate(f"PEARLS.dlState(PEARLS.TRACKS.find(t=>t.id==='{i}')).s") == "done" for i in auto))
    pg.goto(url + "#vol-01"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{shots}/off-2-volume.png")

    # 4. offline: home card, play a downloaded chapter from the phone, refuse one that isn't downloaded
    pg.evaluate("PEARLS.audio.pause()")
    ctx.set_offline(True); pg.wait_for_timeout(300)
    pg.goto(url); pg.wait_for_timeout(500)
    check("offline card on Home", pg.is_visible(".panel.offline"))
    pg.screenshot(path=f"{shots}/off-3-home-offline.png")
    pg.goto(url + "#ch-01-03"); pg.wait_for_timeout(500)
    pg.click('[data-act="playch"]'); pg.wait_for_timeout(1500)
    src = pg.evaluate("PEARLS.audio.src"); t0 = pg.evaluate("PEARLS.audio.currentTime")
    check("plays from the downloaded file", src.startswith("file://") and "01-03-01-en.mp3" in src, src[-40:])
    check("offline queue keeps downloaded chapters only", pg.evaluate("PEARLS.P.queue.every(id=>PEARLS.dlState(PEARLS.TRACKS.find(t=>t.id===id)).s==='done')"), pg.evaluate("PEARLS.P.queue.length"))
    check("audio is actually playing", pg.evaluate("!PEARLS.audio.paused") and t0 > 0.2, t0)
    pg.evaluate("PEARLS.audio.pause()")
    pg.goto(url + "#ch-01-20"); pg.wait_for_timeout(500)
    pg.click('[data-act="playch"]'); pg.wait_for_timeout(500)
    check("tapping a chapter that isn't downloaded doesn't start another", pg.evaluate("PEARLS.audio.paused"))
    check("non-downloaded chapter explains it's offline", "offline" in (pg.inner_text(".toast") if pg.query_selector(".toast") else "").lower(),
          pg.inner_text(".toast") if pg.query_selector(".toast") else "")
    # offline reading: bundled English, saved Hebrew
    check("English text reads offline", pg.wait_for_selector("#reader section", timeout=3000) is not None)
    pg.evaluate("PEARLS.state.prefs.read='he'"); pg.goto(url + "#ch-01-01"); pg.wait_for_timeout(1200)
    heb = pg.inner_text("#reader")
    check("saved Hebrew reads offline", "טקסט עברי" in heb, heb[:60])
    pg.evaluate("PEARLS.state.prefs.read='en'")
    ctx.set_offline(False); pg.wait_for_timeout(300)

    # 5. delete after listening: a heard smart download goes, your own download stays
    pg.evaluate("PEARLS.state.plays['01-02']={done:true,pos:0,part:0,sec:1,n:1,last:Date.now()}; PEARLS.state.plays['01-01']={done:true,pos:0,part:0,sec:1,n:1,last:Date.now()}; PEARLS.smartRun()")
    pg.wait_for_timeout(300)
    check("heard smart download deleted", "01-02" not in pg.evaluate("Object.keys(PEARLS.DL.idx)"))
    check("your own download kept after hearing it", pg.evaluate("PEARLS.dlState(PEARLS.TRACKS.find(t=>t.id==='01-01')).s") == "done")

    # 6. storage limit: smart downloads stop at the cap
    pg.evaluate("PEARLS.DL.prefs.limitMB = 1; PEARLS.P.queue=['01-07','01-08']; PEARLS.P.idx=0; PEARLS.smartRun()")
    check("storage limit respected", "01-07" not in pg.evaluate("Object.keys(PEARLS.DL.idx)"))
    check("nothing deleted when the new chapter wouldn't fit anyway", all(i in pg.evaluate("Object.keys(PEARLS.DL.idx)") for i in ["01-03", "01-04", "01-05"]))
    pg.evaluate("PEARLS.DL.prefs.limitMB = 2048")

    # 7. headphones: a disconnect pauses (setting on by default); with it off, playback carries on; earbud commands work
    pg.goto(url + "#ch-01-03"); pg.wait_for_timeout(500)
    pg.click('[data-act="playch"]'); pg.wait_for_timeout(1200)
    check("Android told it's playing", (pg.evaluate("(window.__media||[]).slice(-1)[0]") or {}).get("playing") is True, pg.evaluate("(window.__media||[]).slice(-1)[0]"))
    pg.evaluate("PEARLS_MEDIA('noisy')"); pg.wait_for_timeout(300)
    check("headphones disconnect -> paused", pg.evaluate("PEARLS.audio.paused"))
    check("says why it paused", "headphones" in pg.inner_text(".toast").lower(), pg.inner_text(".toast"))
    check("Android told it's paused", pg.evaluate("(window.__media||[]).slice(-1)[0].playing") is False)
    pg.evaluate("PEARLS_MEDIA('play')"); pg.wait_for_timeout(500)
    check("earbud play resumes", not pg.evaluate("PEARLS.audio.paused"))
    pg.click('header [data-act="spelling"], [aria-label="Reading settings"]'); pg.wait_for_timeout(300)
    pg.click("[data-unplug]"); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{shots}/off-5-settings-headphones.png")
    pg.click("[data-ok]"); pg.wait_for_timeout(300)
    check("toggle saved off", pg.evaluate("PEARLS.state.prefs.unplugPause") is False)
    if pg.evaluate("PEARLS.audio.paused"): pg.evaluate("PEARLS.audio.play()"); pg.wait_for_timeout(300)
    pg.evaluate("PEARLS_MEDIA('noisy')"); pg.wait_for_timeout(300)
    check("toggle off -> keeps playing", not pg.evaluate("PEARLS.audio.paused"))
    pg.evaluate("PEARLS_MEDIA('pause')"); pg.wait_for_timeout(300)
    check("earbud pause (in-ear detection) pauses", pg.evaluate("PEARLS.audio.paused"))
    pg.evaluate("PEARLS.state.prefs.unplugPause = true")

    # 8. Downloads page and the skin -> status bar bridge
    pg.goto(url + "#downloads"); pg.wait_for_timeout(500)
    check("Downloads page lists chapters", pg.query_selector_all(".view .list .trk").__len__() >= 4, len(pg.query_selector_all(".view .list .trk")))
    pg.screenshot(path=f"{shots}/off-4-downloads.png", full_page=True)
    check("status bar colour sent to Android", pg.evaluate("window.__bars") is not None, pg.evaluate("window.__bars"))
    b.close()

print("errors:", errors or "none")
bad = [n for n, ok in checks if not ok]
print(f"{len(checks) - len(bad)}/{len(checks)} checks passed")
sys.exit(1 if bad or errors else 0)
