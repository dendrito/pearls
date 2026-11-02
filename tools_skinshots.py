"""Screenshots of every skin in both modes -> build/skinshots/*.png and a contact sheet (sheet-<page>.png).
Run: python3 tools_skinshots.py [home|read|settings]"""
import json, os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.abspath(__file__)); WWW = os.path.join(ROOT, "www"); OUT = os.path.join(ROOT, "build", "skinshots")
os.makedirs(OUT, exist_ok=True)
PAGE = sys.argv[1] if len(sys.argv) > 1 else "home"
URL = "file://" + os.path.join(WWW, "index.html")
SK = ["classic","pearl","sand","ice","night","mint","illuminated","tekhelet","brutal","parchment","studio","daf","clear","nacre","folio","sunlit","ner","azulejo","cutpaper","riso","boneink","mizrah","thread"]
LIGHT = {"pearl","sand","ice","illuminated","brutal","parchment","daf","clear","folio","sunlit","ner","azulejo","cutpaper","riso","boneink","mizrah","thread"}
STATE = {"pearls:interests": ["shabbat","prayer"], "pearls:plays": {"01-02": {"sec": 900, "pos": 140, "part": 3, "done": False, "n": 0, "last": 1761800000000}},
         "pearls:likes": ["01-03"], "pearls:onb": True}
names = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--allow-file-access-from-files"])
    for s in SK:
        for alt in (False, True):
            mode = ("dark" if s in LIGHT else "light") if alt else "design"
            ctx = b.new_context(viewport={"width": 360, "height": 640}, device_scale_factor=1)
            st = dict(STATE); st["pearls:prefs"] = {"skin": s, "mode": mode, "read": "en", "readSet": True}
            ctx.add_init_script("(() => { const s = %s; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); })();" % json.dumps(st))
            pg = ctx.new_page(); pg.route("https://**", lambda r: r.abort())
            pg.goto(URL + ("#ch-01-03" if PAGE == "read" else "")); pg.wait_for_timeout(700)
            if PAGE == "read": pg.evaluate("window.scrollTo(0, document.querySelector('#reader') ? document.querySelector('#reader').offsetTop - 70 : 0)"); pg.wait_for_timeout(200)
            if PAGE == "settings": pg.click('header [data-act="spelling"]'); pg.wait_for_timeout(400)
            pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
            n = f"{PAGE}-{s}-{'alt' if alt else 'own'}.png"; pg.screenshot(path=os.path.join(OUT, n)); names.append((s, mode, n))
            ctx.close()
    cells = "".join(f'<figure><img src="{n}"><figcaption>{s} · {m}</figcaption></figure>' for s, m, n in names)
    html = f"<html><body style='margin:0;background:#777;font:13px sans-serif;display:grid;grid-template-columns:repeat(6,240px);gap:8px;padding:8px'>{cells}<style>figure{{margin:0}}img{{width:240px;display:block}}figcaption{{color:#fff;padding:2px}}</style></body></html>"
    open(os.path.join(OUT, f"sheet-{PAGE}.html"), "w").write(html)
    pg = b.new_page(viewport={"width": 6*248+8, "height": 400}); pg.goto("file://" + os.path.join(OUT, f"sheet-{PAGE}.html")); pg.wait_for_timeout(500)
    pg.screenshot(path=os.path.join(OUT, f"sheet-{PAGE}.png"), full_page=True)
    b.close()
print("ok", len(names))
