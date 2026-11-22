"""Print for Shabbat (www/print.js + the Print sheet in app.js), offline in headless Chromium.

Checks that every layout lays out without clipping a line, that a booklet comes out in folding order, that AI
translations stay marked AI on paper, that printouts carry no links and end with the credit and the Torah note,
and that Print hands a page-sized job to the printer. Screenshots go to shots/print-*.png.
Must end "print: N/N"."""
import os, sys, json
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
shots = os.path.join(here, "shots"); os.makedirs(shots, exist_ok=True)
url = "file://" + os.path.join(here, "www", "index.html")
errors, ok, total = [], 0, 0
def check(cond, what):
    global ok, total
    total += 1
    if cond: ok += 1
    print(("  ok  " if cond else "  FAIL ") + what)

BUILD = """async ([ids, secs, o]) => {
  const doc = await PEARLS.printGather({ ids, secs, title: 'Test' }, o);
  const r = await PEARLS_PRINT.build(doc, o);
  document.body.appendChild(r.root);
  const over = [...r.root.querySelectorAll('.pp-box')].filter(b => b.scrollHeight > b.clientHeight + 1).length
    + [...r.root.querySelectorAll('.pp-page')].filter(p => p.scrollHeight > p.clientHeight + 1).length;
  const out = { pages: r.pages, sheets: r.sheets.length, parts: r.parts, over, links: r.root.querySelectorAll('a,button').length,
    ai: r.root.querySelectorAll('.pp-ai').length, text: r.root.innerText.slice(-1200), he: r.root.querySelectorAll('[dir=rtl]').length,
    nums: r.sheets.slice(0, 2).map(s => [...s.querySelectorAll(':scope>.pp-page')].map(p => p.classList.contains('pp-cover') ? 'C' : p.classList.contains('pp-back') ? 'B' : p.classList.contains('pp-blank') ? '-' : (p.querySelector('.pp-n') || {}).textContent || '?')),
    raw: /&lt;\/?(em|i|b|strong)&gt;/.test(r.root.innerHTML), w: r.sheetW, h: r.sheetH, chapters: doc.chapters.length, notes: doc.chapters.map(c => c.note).join(' | ') };
  r.root.remove(); return out; }"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "net::" not in m.text and "Failed to load resource" not in m.text and errors.append(m.text))
    pg.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())  # offline
    pg.goto(url); pg.wait_for_timeout(400)
    for tag in ["shabbat", "kiddush"]: pg.click(f'#onbChips [data-tag="{tag}"]')
    pg.click("#onbGo"); pg.wait_for_timeout(300)
    build = lambda ids, o, secs=None: pg.evaluate(BUILD, [ids, secs, o])
    base = {"cover": "none", "lang": "en", "paper": "a4", "ink": "colour"}

    # 1. the Print sheet from a chapter page, then the preview
    pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(500)
    pg.click('.chacts [data-act="print"]'); pg.wait_for_timeout(200)
    check(pg.is_visible(".pp-dialog") and pg.locator(".pp-style").count() == 11, "Print sheet opens with 11 layouts")
    pg.screenshot(path=f"{shots}/print-1-sheet.png")
    pg.click('.pp-style[data-style="heritage"]'); pg.click('.pp-chips[data-k="format"] [data-v="booklet"]'); pg.click('.pp-chips[data-k="cover"] [data-v="illus"]'); pg.click('.pp-chips[data-k="paper"] [data-v="a4"]')
    pg.click("[data-go-print]")
    pg.wait_for_selector(".pp-overlay .pp-sheet", timeout=60000); pg.wait_for_timeout(300)
    summary = pg.inner_text(".pp-sum"); print("   ", summary)
    check("Heritage" in summary and "pages" in summary, "preview says what it laid out")
    check("short edge" in pg.inner_text(".pp-help"), "booklet preview says how to print and fold")
    pg.screenshot(path=f"{shots}/print-2-preview.png")
    pg.evaluate("window.__printed = 0; window.print = () => { window.__printed++; }; 0")
    pg.click(".pp-go"); pg.wait_for_timeout(200)
    pj = pg.evaluate("""({ n: window.__printed, sheets: document.querySelectorAll('#pp-print > .pp-sheet').length,
      page: (document.getElementById('pp-page-style') || {}).textContent || '' })""")
    print("   ", pj); check(pj["n"] == 1 and pj["sheets"] > 0 and "297mm 210mm" in pj["page"], f"Print hands landscape A4 sheets to the printer ({pj['sheets']} sides)")
    pg.click(".pp-back"); pg.wait_for_timeout(200)
    check(pg.locator(".pp-overlay").count() == 0 and pg.is_visible(".pp-dialog") and not pg.query_selector("#pp-print"), "Back returns to the Print sheet and clears the print job")
    pg.click(".pp-dialog [data-x]")
    check(pg.evaluate("PEARLS.state.prefs.print.style") == "heritage", "the chosen layout is remembered")

    # 2. every layout, no line clipped, no links, credit and Torah note at the end
    for st, fm in [("classic", "pages"), ("twocol", "pages"), ("sbs", "pages"), ("large", "booklet"), ("heritage", "booklet"), ("azulejo", "pages"),
                   ("arch", "pages"), ("riso", "pages"), ("table", "pages"), ("cards", "cards"), ("trifold", "trifold")]:
        r = build(["01-06"], {**base, "style": st, "format": fm, "cover": "simple"})
        check(r["over"] == 0 and r["links"] == 0 and r["pages"] > 0 and not r["raw"], f"{st}: {r['pages']} pages, nothing clipped, no links, no tags printed as text")
    r = build(["01-06"], {**base, "style": "classic", "format": "pages"})
    check("Rabbi Eliezer Melamed" in r["text"] and "CC BY 4.0" in r["text"] and "words of Torah" in r["text"], "ends with the credit, the licence and the Torah note")
    check("Halacha " not in r["text"] and "Halachah" not in r["text"], "spelled Peninei Halakha")

    # 3. booklet: pages padded to fours, in folding order, cover on the outside
    r = build(["01-06"], {**base, "style": "classic", "format": "booklet", "cover": "simple"})
    n = r["sheets"] * 2
    check(r["sheets"] % 2 == 0 and r["w"] == 297 and r["h"] == 210, f"booklet: {r['sheets']} sides of landscape A4 for {r['pages']} pages")
    check(r["nums"][0] == ["B", "C"] and r["nums"][1][0] == "1", f"booklet order: outside sheet is back|cover, then page 1 ({r['nums']})")
    r = build(["01-06"], {**base, "style": "classic", "format": "booklet"})
    check(r["nums"][0][1] == "1" and r["nums"][1][0] == "2", f"booklet without a cover starts on page 1 ({r['nums']})")
    r = build(["01-06"], {**base, "style": "cards", "format": "cards", "paper": "letter"})
    check(abs(r["w"] - 215.9) < .1 and r["over"] == 0, "cards on Letter paper")

    # 4. AI translations stay marked AI; Hebrew, both and side by side
    ai = pg.evaluate("PEARLS.TRACKS.find(t => t.vol.he && t.translated).id")
    r = build([ai], {**base, "style": "classic", "format": "pages"})
    check(r["ai"] > 0 and "AI translation" in r["notes"] and "AI" in r["text"], f"AI chapter {ai}: every section marked AI, credited to Claude")
    r = build([ai], {**base, "style": "sbs", "format": "pages"})
    check(r["over"] == 0, f"side by side on {ai}: {r['he']} Hebrew blocks ({'Hebrew bundled' if r['he'] else 'Hebrew needs a connection: noted'})")
    r = build(["01-06"], {**base, "style": "classic", "format": "pages", "lang": "both"})
    check(r["over"] == 0 and ("connection" in r["notes"] or r["he"] > 0), "Both: Hebrew under each section, or a note when it can't be had offline")

    # 5. other reading languages
    xl = pg.evaluate("Object.keys(PH_XL.ch).find(id => PH_XL.ch[id].es && !PH_XL.ch[id].es.o)")
    if xl:
        r = build([xl], {**base, "style": "classic", "format": "pages", "lang": "es"})
        check(r["ai"] > 0 and "Spanish" in r["text"], f"Español: {xl} prints in Spanish, marked AI")
    r = build(["01-06"], {**base, "style": "classic", "format": "pages", "lang": "es"})
    check("available for this chapter yet" in r["notes"], "a chapter without Spanish says so and prints in English")

    # 6. a section, a whole book in booklets, the Shabbat bundle
    r = build(["01-06"], {**base, "style": "classic", "format": "pages"}, {"01-06": [2]})
    check(r["pages"] <= 2 and r["chapters"] == 1, f"one section prints on its own ({r['pages']} page)")
    ids = pg.evaluate("PEARLS.TRACKS.filter(t => t.vol.book === '01').map(t => t.id)")
    r = build(ids, {**base, "style": "classic", "format": "booklet", "cover": "simple"})
    check(r["over"] == 0 and (r["parts"] > 1 or r["pages"] <= 48), f"whole book: {r['pages']} pages in {r['parts']} booklets")
    sp = pg.evaluate("PEARLS.shabbatSpec()")
    check(isinstance(sp["ids"], list), f"Shabbat bundle: {len(sp['ids'])} chapters")
    pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(400)
    for ink in ["light", "black"]:
        pg.evaluate("""async (ink) => { const doc = await PEARLS.printGather({ ids: ['01-06'], title: 'Ink' }, { style: 'table', lang: 'en' });
          PEARLS_PRINT.open(doc, { style: 'table', format: 'pages', cover: 'none', lang: 'en', paper: 'a4', ink }); }""", ink)
        pg.wait_for_selector(".pp-overlay .pp-sheet", timeout=30000); pg.wait_for_timeout(200)
        pg.screenshot(path=f"{shots}/print-3-{ink}.png")
        pg.evaluate("PEARLS_PRINT.close()")
    b.close()
print("errors:", errors or "none")
print(f"print: {ok}/{total}")
sys.exit(1 if errors or ok != total else 0)
