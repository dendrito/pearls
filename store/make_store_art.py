"""Makes the Google Play graphics from the real app: store/screenshots/*.png (1080x1920, captioned) and
store/feature-graphic.png (1024x500), and copies the 512px icon. Audio requests get a silent MP3, so the player
looks as it does on a phone. Run: python3 store/make_store_art.py"""
import json, os, shutil, subprocess
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); WWW = os.path.join(ROOT, "www")
RAW = os.path.join(ROOT, "build", "store-raw"); OUT = os.path.join(HERE, "screenshots")
for d in (RAW, OUT): shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
silent = os.path.join(RAW, "silent.mp3")
subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "600", "-b:a", "16k", silent], check=True)
MP3 = open(silent, "rb").read()
URL = "file://" + os.path.join(WWW, "index.html")

# a few chapters "downloaded" so the Downloads page has something to show
NATIVE = """(() => { const files = {}; ["01-03","01-04","05-02"].forEach(id => { for (let i = 1; i <= 16; i++) files[`${id}-${String(i).padStart(2,"0")}-en.mp3`] = 1.9e6; });
  window.PearlsNative = { info: () => JSON.stringify({ ok: true, dir: "file:///dl/", free: 21.4e9 }), status: () => '{"active":[],"finished":[],"failed":[]}',
    list: () => JSON.stringify(Object.entries(files).map(([n, s]) => ({ n, s }))), enqueue: () => 0, remove: () => 0, cancelAll() {},
    readText: () => null, writeText: () => true, textList: () => "[]", clearText: () => 0, setBars() {}, mediaState() {} }; })();"""
STATE = {
    "pearls:interests": ["shabbat", "kiddush", "prayer", "festivals"],
    "pearls:plays": {"01-02": {"sec": 900, "pos": 140, "part": 3, "done": False, "n": 0, "last": 1761800000000},
                     "02-04": {"sec": 400, "pos": 60, "part": 1, "done": False, "n": 0, "last": 1761700000000},
                     "01-01": {"sec": 2700, "pos": 0, "part": 15, "done": True, "n": 1, "last": 1761600000000}},
    "pearls:likes": ["01-03", "05-02"],
    "pearls:dlIdx": {"01-03": {"lang": "en", "auto": False, "at": 1}, "01-04": {"lang": "en", "auto": True, "at": 2}, "05-02": {"lang": "en", "auto": False, "at": 3}},
    "pearls:plan": {"book": "01", "pace": 1, "start": 1761300000000},
}

def page(b, skin="classic", read="en"):
    ctx = b.new_context(viewport={"width": 360, "height": 640}, device_scale_factor=3)
    ctx.add_init_script(NATIVE)
    st = dict(STATE); st["pearls:prefs"] = {"skin": skin, "read": read, "readSet": True}
    ctx.add_init_script("(() => { const s = %s; if (!localStorage.getItem('pearls:seeded')) { for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); localStorage.setItem('pearls:seeded','1'); } })();" % json.dumps(st))
    pg = ctx.new_page()
    pg.route("https://cdn1.yhb.org.il/**", lambda r: r.fulfill(status=200, body=MP3, content_type="audio/mpeg"))
    pg.route("https://ph.yhb.org.il/**", real_text)
    return ctx, pg

def real_text(route):   # the Hebrew from ph.yhb.org.il, fetched here (the browser has no proxy settings)
    import urllib.request
    try:
        with urllib.request.urlopen(urllib.request.Request(route.request.url, headers={"User-Agent": "Pearls (store screenshots)"}), timeout=40) as r:
            route.fulfill(status=200, body=r.read(), content_type="application/json", headers={"Access-Control-Allow-Origin": "*"})
    except Exception: route.abort()

def shot(pg, name):
    pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
    pg.screenshot(path=os.path.join(RAW, name + ".png"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
                          args=["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"])
    # 1 Home, playing
    ctx, pg = page(b); pg.goto(URL); pg.wait_for_timeout(700)
    pg.evaluate("PEARLS.P.queue.length || 0"); pg.goto(URL + "#ch-01-02"); pg.wait_for_timeout(500); pg.click('[data-act="playch"]'); pg.wait_for_timeout(1500)
    pg.goto(URL); pg.wait_for_timeout(900); shot(pg, "home")
    # 2 Now playing
    pg.click('#mini [data-act="np"]'); pg.wait_for_timeout(700); shot(pg, "player")
    pg.click('[data-act="npclose"]'); pg.wait_for_timeout(300)
    # 3 Reading
    pg.goto(URL + "#ch-01-03"); pg.wait_for_timeout(900); pg.evaluate("window.scrollTo(0, document.querySelector('#reader').offsetTop - 70)"); pg.wait_for_timeout(300); shot(pg, "read")
    # 5 Downloads
    pg.goto(URL + "#downloads"); pg.wait_for_timeout(800); shot(pg, "downloads")
    # 6 Books
    pg.goto(URL + "#vol-01"); pg.wait_for_timeout(800); shot(pg, "book")
    # skins picker
    pg.goto(URL); pg.wait_for_timeout(500); pg.click('header [data-act="spelling"]'); pg.wait_for_timeout(500); shot(pg, "skins")
    ctx.close()
    # 4 Daf: English and Hebrew side by side (the Hebrew comes from a saved copy here)
    ctx, pg = page(b, skin="daf", read="both")
    pg.goto(URL + "#ch-17-03"); pg.wait_for_timeout(1500); pg.evaluate("window.scrollTo(0, document.querySelector('#reader').offsetTop - 60)"); pg.wait_for_timeout(300); shot(pg, "daf")
    ctx.close()

    CAPS = [("01-home", "home", "One pearl", "at a time", "Today's chapter, picked for the season and for you"),
            ("02-listen", "player", "Listen to", "the original", "Rav Melamed's books read aloud, in Hebrew and English"),
            ("03-read", "read", "Read it", "in English", "Every volume of the official translation"),
            ("04-daf", "daf", "Side by side", "with the Hebrew", "Or AI translations of the volumes with no English yet"),
            ("05-offline", "downloads", "Works", "offline", "Download chapters; smart downloads keep the next ones ready"),
            ("06-yours", "skins", "Make it", "yours", "15 looks and three Hebrew typefaces")]
    frame = b.new_page(viewport={"width": 1080, "height": 1920})
    for out, raw, a, em, sub in CAPS:
        img = "file://" + os.path.join(RAW, raw + ".png")
        html = f"""<html><head><link rel="stylesheet" href="file://{WWW}/fonts/web/fonts.css"></head><body style="margin:0;width:1080px;height:1920px;overflow:hidden;
          background:radial-gradient(900px 700px at 85% 8%,#2a2148 0%,transparent 60%),radial-gradient(800px 600px at 0% 100%,#3a2a10 0%,transparent 60%),#0b0f1a;
          font-family:'Instrument Serif',serif;color:#f4ecdc;position:relative">
          <div style="position:absolute;left:96px;right:96px;top:112px">
            <div style="font-size:104px;line-height:1.02;letter-spacing:-1px">{a} <i style="color:#e2b65c">{em}</i></div>
            <div style="font-family:'Figtree',sans-serif;font-size:38px;line-height:1.35;color:#c9bfae;margin-top:26px">{sub}</div></div>
          <div style="position:absolute;left:150px;top:520px;width:780px;height:1387px;border-radius:64px;overflow:hidden;
            box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 2px rgba(226,182,92,.35)"><img src="{img}" style="width:100%;display:block"></div>
          </body></html>"""
        p_ = os.path.join(RAW, out + ".html"); open(p_, "w").write(html)
        frame.goto("file://" + p_); frame.wait_for_timeout(500)
        frame.evaluate("document.fonts.ready"); frame.screenshot(path=os.path.join(OUT, out + ".png"))
    # feature graphic 1024x500
    fg = b.new_page(viewport={"width": 1024, "height": 500})
    html = f"""<html><head><link rel="stylesheet" href="file://{WWW}/fonts/web/fonts.css"></head><body style="margin:0;width:1024px;height:500px;overflow:hidden;position:relative;
      background:radial-gradient(520px 420px at 78% 30%,#2a2148 0%,transparent 70%),radial-gradient(500px 380px at 0% 110%,#3a2a10 0%,transparent 65%),#0b0f1a;color:#f4ecdc;font-family:'Instrument Serif',serif">
      <div style="position:absolute;left:70px;top:118px;width:520px">
        <div style="display:flex;align-items:center;gap:22px"><div style="width:74px;height:74px;border-radius:50%;
          background:radial-gradient(circle at 35% 30%,#fff 0%,#f3e7cf 25%,#c9a96a 60%,#6b5326 100%);box-shadow:0 0 50px rgba(226,182,92,.45)"></div>
          <div style="font-size:96px;line-height:1">Pearls</div></div>
        <div style="font-size:46px;line-height:1.15;margin-top:26px">Peninei Halakha <i style="color:#e2b65c">in English</i></div>
        <div style="font-family:'Figtree',sans-serif;font-size:23px;color:#c9bfae;margin-top:16px">Read and listen, one pearl at a time.<br>Works offline.</div></div>
      <div style="position:absolute;right:70px;top:46px;width:236px;height:420px;border-radius:30px;overflow:hidden;transform:rotate(4deg);
        box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 2px rgba(226,182,92,.35)"><img src="file://{RAW}/player.png" style="width:100%"></div>
      <div style="position:absolute;right:250px;top:96px;width:200px;height:356px;border-radius:26px;overflow:hidden;transform:rotate(-5deg);
        box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 2px rgba(226,182,92,.25)"><img src="file://{RAW}/home.png" style="width:100%"></div>
      </body></html>"""
    open(os.path.join(RAW, "fg.html"), "w").write(html)
    fg.goto("file://" + os.path.join(RAW, "fg.html")); fg.wait_for_timeout(500); fg.screenshot(path=os.path.join(HERE, "feature-graphic.png"))
    b.close()
shutil.copy(os.path.join(WWW, "icon-512.png"), os.path.join(HERE, "icon-512.png"))
print("done:", sorted(os.listdir(OUT)))
