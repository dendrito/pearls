"""Playback order, smart downloads that follow it, and the Review / Study later lists.
Runs the app with a minimal stand-in for the Android bridge. Must end "N/N checks passed"."""
import json, os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); url = "file://" + os.path.join(here, "www", "index.html")
NATIVE = """(() => { const files = {}; window.__enq = [];
  window.PearlsNative = { info: () => JSON.stringify({ ok: true, dir: "file:///dl/", free: 9e9, online: true }), status: () => '{"active":[],"finished":[],"failed":[]}',
    list: () => JSON.stringify(Object.entries(files).map(([n, s]) => ({ n, s }))), enqueue(j) { for (const x of JSON.parse(j)) window.__enq.push(x.name); return 1; },
    remove: () => 0, cancelAll() {}, readText: () => null, writeText: () => true, textList: () => "[]", clearText: () => 0, setBars() {}, mediaState() {} }; })();"""
ok = 0; checks = []
def check(name, cond, info=""):
    global ok; checks.append(name); ok += bool(cond); print(("PASS " if cond else "FAIL ") + name, "" if cond else info)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(); c.add_init_script(NATIVE)
    c.add_init_script("localStorage.setItem('pearls:interests','[\"shabbat\"]'); localStorage.setItem('pearls:dlPrefs', JSON.stringify({wifiOnly:false,smart:true,ahead:2,autoDelete:true,limitMB:0}))")
    pg = c.new_page(); pg.route("https://**", lambda r: r.abort()); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(600)
    E = lambda js: pg.evaluate(js)
    E("PEARLS.state.plays['01-03'] = {done:true, sec:900, pos:0, part:0, last:1}")
    E("(() => { const P = PEARLS.P; P.queue = ['01-02','01-03','01-04','01-05','01-06']; P.idx = 0; })()")
    check("in order: next two in the queue", E("PEARLS.upcoming(2)") == ["01-03", "01-04"], E("PEARLS.upcoming(2)"))
    E("PEARLS.setPlayMode('repeat1')")
    check("repeat chapter: only this chapter comes next", E("PEARLS.upcoming(3)") == ["01-02"])
    E("PEARLS.setPlayMode('book'); PEARLS.P.queue = ['01-02','12-01']; PEARLS.P.idx = 0")
    check("continue the book: the book's next chapters", E("PEARLS.upcoming(2)") == ["01-03", "01-04"], E("PEARLS.upcoming(2)"))
    E("PEARLS.setPlayMode('next'); PEARLS.P.queue = ['01-02','01-03','01-04','01-05','01-06','01-07','01-08','01-09']; PEARLS.P.idx = 0; PEARLS.setPlayMode('shuffle')")
    q = E("PEARLS.P.queue")
    check("shuffle keeps the playing chapter and the same set", q[0] == "01-02" and sorted(q) == sorted(['01-02','01-03','01-04','01-05','01-06','01-07','01-08','01-09']))
    E("PEARLS.P.idx = 3; window.__playing = PEARLS.P.queue[3]; PEARLS.setPlayMode('next')")
    check("shuffle off restores the order and stays on the same chapter", E("PEARLS.P.queue.join()") == "01-02,01-03,01-04,01-05,01-06,01-07,01-08,01-09" and E("PEARLS.P.queue[PEARLS.P.idx] === window.__playing"))
    E("PEARLS.setPlayMode('repeatAll'); PEARLS.P.queue = ['01-02','01-03','01-04']; PEARLS.P.idx = 2")
    check("repeat queue wraps to the start", E("PEARLS.upcoming(2)") == ["01-02", "01-03"])
    # smart downloads follow the order; a heard chapter is fetched when it will play again
    E("window.__enq = []; PEARLS.DL.idx = {}; PEARLS.setPlayMode('repeatAll'); PEARLS.P.queue = ['01-04','01-03']; PEARLS.P.idx = 0; PEARLS.smartRun()")
    enq = E("window.__enq")
    check("smart downloads: what plays next, even if heard (repeat)", any(n.startswith("01-03-") for n in enq) and any(n.startswith("01-04-") for n in enq), enq[:6])
    E("window.__enq = []; PEARLS.DL.idx = {}; PEARLS.setPlayMode('next'); PEARLS.P.queue = ['01-04','01-03','01-05']; PEARLS.P.idx = 0; PEARLS.smartRun()")
    enq = E("window.__enq")
    check("smart downloads in order: a heard chapter isn't fetched", not any(n.startswith("01-03-") for n in enq) and any(n.startswith("01-05-") for n in enq), enq[:6])
    E("window.__enq = []; PEARLS.DL.idx = {}; PEARLS.setPlayMode('book'); PEARLS.P.queue = ['01-05']; PEARLS.P.idx = 0; PEARLS.smartRun()")
    enq = E("window.__enq")
    check("smart downloads, continue the book: the next chapters", any(n.startswith("01-06-") for n in enq), enq[:6])
    # lists
    E("PEARLS.setPlayMode('next'); PEARLS.toggleList('review','01-07'); PEARLS.toggleList('later','01-08')")
    check("added to Review and Study later", E("PEARLS.onList('review','01-07') && PEARLS.onList('later','01-08')"))
    E("const r = PEARLS.state.lists.review[0]; r.due = Date.now() - 1; PEARLS.studied('01-07')")
    r = E("PEARLS.state.lists.review[0]")
    check("finishing a due review moves it on (next in 3 days)", r["step"] == 1 and 2.9 < (r["due"] - E("Date.now()")) / 864e5 < 3.1, r)
    E("PEARLS.studied('01-08')")
    check("finishing a Study later chapter takes it off the list", not E("PEARLS.onList('later','01-08')"))
    E("PEARLS.toggleList('later','01-09')"); pg.goto(url + "#library"); pg.wait_for_timeout(500)
    check("Library shows Review, Study later and Favorites", E("[...document.querySelectorAll('[data-id=review],[data-id=later],[data-id=liked]')].length") >= 3)
    pg.goto(url + "#pl-later"); pg.wait_for_timeout(400)
    check("Study later opens as a playlist with a remove button", E("!!document.querySelector('[data-act=unlist][data-list=later]')"))
    # Now Playing has the order pill and the list buttons
    pg.goto(url + "#ch-01-02"); pg.wait_for_timeout(400); pg.click('[data-act="playch"]'); pg.wait_for_timeout(700)
    E("PEARLS.audio.pause()"); pg.click('#mini [data-act="np"]'); pg.wait_for_timeout(400)
    check("Now Playing: order, Favorite, Review and Study later", all(E(f"!!document.querySelector('.sheet {q}')") for q in ['[data-act=playmode]', '.pill[data-act=like]', '[data-list=review]', '[data-list=later]']))
    pg.click('.sheet [data-list="later"]'); pg.wait_for_timeout(200)
    check("Study later from Now Playing remembers the section", E("PEARLS.state.lists.later.some(x => x.id === '01-02' && 'part' in x)"))
    pg.screenshot(path=os.path.join(here, "build", "np-lists.png"))
    check("no page errors", not errs, errs)
    b.close()
print(f"{ok}/{len(checks)} checks passed")
