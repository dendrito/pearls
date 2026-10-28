"""Smoke test: drive the app in headless Chromium at phone size and screenshot key screens."""
import os, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
shots = os.path.join(here, "shots"); os.makedirs(shots, exist_ok=True)
url = "file://" + os.path.join(here, "www", "index.html")
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "net::" not in m.text and "Failed to load resource" not in m.text and errors.append(m.text))
    pg.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())  # offline: no external hosts here
    pg.goto(url); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{shots}/0-onboard.png")
    for tag in ["shabbat", "kiddush", "teshuva", "food"]:
        pg.click(f'#onbChips [data-tag="{tag}"]')
    pg.click("#onbGo"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{shots}/1-home.png", full_page=True)
    recs = pg.evaluate("PEARLS.recommend(6).map(r=>r.t.id+' | '+r.t.title+' | '+r.why)")
    print("recs:", *recs, sep="\n  ")
    # play from hero -> mini player shows
    if pg.query_selector('.hero [data-act="play"]'): pg.click('.hero [data-act="play"]')
    else: pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(400); pg.click('[data-act="playch"]')
    pg.wait_for_timeout(300)
    assert pg.is_visible("#mini"), "mini player hidden"
    pg.click('#mini [data-act="np"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{shots}/2-nowplaying.png")
    pg.click('.sheet [data-act="speed"]'); pg.click('[data-act="npclose"]'); pg.wait_for_timeout(300)
    # create playlist and add a chapter to it
    pg.click('.tabs [data-tab="library"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="newpl"]'); pg.fill("#plName", "Friday prep"); pg.click("[data-ok]"); pg.wait_for_timeout(200)
    pg.click('.tabs [data-tab="books"]'); pg.wait_for_timeout(200)
    pg.click('.volcard[data-id="01"]'); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{shots}/3-volume.png")
    first = pg.eval_on_selector('.trk[data-id]', "e=>e.dataset.id")
    pg.click(f'.trk[data-id="{first}"] [data-act="trackmenu"]'); pg.click('[data-a="add"]'); pg.click("[data-pl]"); pg.wait_for_timeout(200)
    mine = pg.evaluate("PEARLS.state.mine.map(p=>p.name+':'+p.tracks.join(','))"); print("mine:", mine)
    assert mine and first in mine[0], "add to playlist failed"
    pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{shots}/4-chapter.png")
    pg.goto(url + "#library"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{shots}/5-playlists.png", full_page=True)
    pg.goto(url + "#search"); pg.fill("#q", "candle"); pg.wait_for_timeout(200)
    print("search hits:", pg.eval_on_selector_all("#results .trk", "els=>els.length"))
    pg.screenshot(path=f"{shots}/6-search.png")
    w = pg.evaluate("document.documentElement.scrollWidth"); print("scrollWidth", w)
    b.close()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
