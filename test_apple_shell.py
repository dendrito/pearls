"""Apple app test (iPhone, iPad, Mac). Runs www/ with apple/Pearls/native-shim.js and a stand-in for the Swift side
(PearlsNative.swift): messages arrive through webkit.messageHandlers.pearls, state comes back through
PEARLS_NATIVE_PUSH with an ack, a little later, like evaluateJavaScript does. Checks that the page gets
window.PearlsNative with Android's interface, that downloads go out and come back, that a push which has not seen
the request yet does not wipe the page's own download, that setBars reaches the app, that the page says "iPad"
on an iPad, and that the wide layout turns the tab bar into a side rail on an iPad but not on a phone.
Must end "apple shell: N/N"."""
import json, os
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__))
url = "file://" + os.path.join(here, "www", "index.html")
shim = open(os.path.join(here, "apple", "Pearls", "native-shim.js"), encoding="utf-8").read()
boot = {"info": {"ok": True, "dir": "pearls://app/dl/", "free": 8e9, "online": True, "metered": False},
        "status": {"active": [], "failed": []}, "list": [{"n": "01-02-01-he.mp3", "s": 1500000}], "texts": []}

FAKE_APP = """(() => {
  const app = window.__app = { msgs: [], files: { "01-02-01-he.mp3": 1500000 }, active: {}, ack: 0, bars: null, hold: false };
  const push = () => window.PEARLS_NATIVE_PUSH && window.PEARLS_NATIVE_PUSH({
    list: Object.entries(app.files).map(([n, s]) => ({ n, s })),
    status: { active: Object.values(app.active), failed: [] }, ack: app.ack });
  app.push = push;
  app.finishAll = () => { for (const n in app.active) app.files[n] = 2000000; app.active = {}; push(); };
  window.webkit = { messageHandlers: { pearls: { postMessage(b) {
    app.msgs.push(b);
    if (app.hold) return;                                    // the app has not handled it yet
    setTimeout(() => {
      if (b.m === "enqueue") b.a.jobs.forEach(j => { app.active[j.name] = { name: j.name, status: "running", done: 1, total: 2 }; });
      if (b.m === "remove") b.a.names.forEach(n => { delete app.files[n]; delete app.active[n]; });
      if (b.m === "setBars") app.bars = b.a;
      app.ack = Math.max(app.ack, b.seq); push();
    }, 30);
  } } } };
})();"""


def run():
    ok, total = 0, 0
    def check(name, cond):
        nonlocal ok, total
        total += 1; ok += bool(cond)
        print(("  ok  " if cond else "  FAIL ") + name)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
        errors = []

        # iPad, landscape
        pg = b.new_page(viewport={"width": 1180, "height": 820})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.add_init_script("localStorage.setItem('pearls:interests', JSON.stringify(['Shabbat','Prayer']));")
        pg.add_init_script("window.PEARLS_SHELL = 'ipad';")
        pg.add_init_script(FAKE_APP)
        pg.add_init_script(shim.replace("__BOOT__", json.dumps(boot)))
        pg.goto(url); pg.wait_for_timeout(1200)

        check("window.PearlsNative is the Apple shim", pg.evaluate("typeof PearlsNative.enqueue === 'function' && JSON.parse(PearlsNative.info()).dir === 'pearls://app/dl/'"))
        check("setBars reaches the app with a colour", pg.evaluate("!!(__app.bars && /^#[0-9a-f]{6}$/i.test(__app.bars.hex))"))
        rail = pg.evaluate("(() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return [r.left, r.width, r.height]; })()")
        check("iPad: tabs are a side rail", rail[0] == 0 and rail[1] < 140 and rail[2] > 700)

        pg.goto(url + "#downloads"); pg.wait_for_timeout(800)
        txt = pg.inner_text("main")
        check("Downloads page works and says iPad", "On this iPad" in txt and "Android app" not in txt)

        pg.goto(url + "#ch-01-03"); pg.wait_for_timeout(1200)
        pg.evaluate("__app.hold = true")              # the app is slow: its next push has not seen the request
        pg.click("[data-act=dl][data-id='01-03']"); pg.wait_for_timeout(200)
        enq = pg.evaluate("__app.msgs.filter(m => m.m === 'enqueue')")
        check("enqueue goes to the app with https jobs", len(enq) == 1 and all(j["url"].startswith("http") for j in enq[0]["a"]["jobs"]))
        pg.evaluate("__app.push()")                   # stale push: ack is older than the request
        pg.wait_for_timeout(100)
        label = pg.inner_text("[data-dl='01-03']")
        check("a stale push keeps the page's own download", label.startswith("Downloading"))
        pg.evaluate("__app.hold = false; const m = __app.msgs.at(-1); m.a.jobs.forEach(j => __app.active[j.name] = {name: j.name, status: 'running', done: 1, total: 2}); __app.ack = m.seq; __app.push()")
        pg.wait_for_timeout(100)
        pg.evaluate("__app.finishAll()"); pg.wait_for_timeout(3000)
        check("finished files show as downloaded", "Downloaded" in pg.inner_text("[data-dl='01-03']"))
        pg.goto(url + "#downloads"); pg.wait_for_timeout(800)
        check("the Downloads page lists it on the iPad", pg.locator("main section:has(h2:has-text('On this iPad')) .trk").count() >= 1)
        pg.goto(url + "#ch-01-03"); pg.wait_for_timeout(1000)

        pg.click("[data-act=dl][data-id='01-03']"); pg.wait_for_timeout(400)   # opens the remove menu or removes
        sheet = pg.query_selector(".scrim button:has-text('Remove')") or pg.query_selector(".scrim button:has-text('Delete')")
        if sheet: sheet.click(); pg.wait_for_timeout(300)
        rem = pg.evaluate("__app.msgs.filter(m => m.m === 'remove').length")
        check("remove goes to the app", rem >= 1)

        check("readText fails soft without the scheme", pg.evaluate("PearlsNative.readText('he-01-01.json') === null"))
        pg.evaluate("PearlsNative.writeText('he-01-01.json', '[]')")
        check("writeText goes to the app", pg.evaluate("__app.msgs.some(m => m.m === 'writeText' && m.a.key === 'he-01-01.json')"))
        check("no page errors", not errors)
        if errors: print("   ", errors[:3])
        pg.close()

        # phone: bottom tab bar, device word "phone"
        pg = b.new_page(viewport={"width": 393, "height": 852})
        pg.add_init_script("localStorage.setItem('pearls:interests', JSON.stringify(['Shabbat']));")
        pg.add_init_script("window.PEARLS_SHELL = 'ios';")
        pg.add_init_script(FAKE_APP)
        pg.add_init_script(shim.replace("__BOOT__", json.dumps(boot)))
        pg.goto(url + "#downloads"); pg.wait_for_timeout(1000)
        r = pg.evaluate("(() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return [r.bottom, r.width]; })()")
        check("iPhone: tabs stay at the bottom", r[0] == 852 and r[1] == 393)
        check("iPhone: says phone", "On this phone" in pg.inner_text("main"))
        pg.close()
        b.close()
    print(f"apple shell: {ok}/{total}")
    return ok == total


if __name__ == "__main__":
    raise SystemExit(0 if run() else 1)
