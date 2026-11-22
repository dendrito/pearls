"""Other reading languages (www/xl, make_xl_books.py): choose Español (then Português), read a chapter that has a Spanish AI translation,
see the AI label and the credit, see Har Bracha's own Spanish labelled official where it exists, and get English with a note on a chapter that has none. Offline, like test_app.py.
Must end "other languages: N/N"."""
import json, os, shutil, subprocess, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
# Har Bracha's own Spanish (src/es, from fetch_xl_official.py) replaces the AI text for a chapter it covers: a stand-in
# for 18-01 is built for the test, and the real src/es/18-01.json (if any) is put back afterwards.
FIX = os.path.join(here, "src", "es", "18-01.json"); KEEP = FIX + ".keep"
if os.path.exists(FIX): shutil.move(FIX, KEEP)
os.makedirs(os.path.dirname(FIX), exist_ok=True)
he = json.load(open(os.path.join(here, "work", "he", "18-01.json")))
json.dump({"chapter": "La pureza familiar", "posts": [{"slug": x["slug"], "link": f"https://ph.yhb.org.il/es/{x['slug']}/",
    "title": {"rendered": f"{i + 1:02d} – Sección oficial {i + 1}"}, "content": {"rendered": f"<p>Texto oficial de Har Bracha, sección {i + 1}.</p><script>bad()</script>"}}
    for i, x in enumerate(he["sections"])]}, open(FIX, "w"), ensure_ascii=False)
def rebuild():
    subprocess.run([sys.executable, os.path.join(here, "make_xl_books.py")], check=True, capture_output=True)
rebuild()
url = "file://" + os.path.join(here, "www", "index.html")
ok, fails, errors, loaded = 0, [], [], []

def check(name, cond):
    global ok
    if cond: ok += 1
    else: fails.append(name)
    print(("  ok   " if cond else "  FAIL ") + name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "net::" not in m.text and "Failed to load resource" not in m.text and errors.append(m.text))
    pg.on("request", lambda r: "/xl/" in r.url and loaded.append(r.url.split("/xl/")[1]))
    pg.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())
    pg.goto(url); pg.wait_for_timeout(400)
    pg.click('#onbChips [data-tag="shabbat"]'); pg.click("#onbGo"); pg.wait_for_timeout(300)
    langs = pg.evaluate("Object.keys((window.PH_XL||{}).langs||{})")
    check("index lists Spanish", "es" in langs and pg.evaluate("!!PH_XL.ch['21-01'] && !!PH_XL.ch['21-01'].es"))

    # a chapter with a Spanish translation, read in English first: nothing Spanish is loaded until it is chosen
    pg.goto(url + "#ch-21-01"); pg.wait_for_timeout(600)
    check("English by default, no Spanish loaded", not pg.query_selector('.ai-sec[lang="es"]') and not any(x.startswith("es/") for x in loaded))
    pg.evaluate("document.querySelector('details.chmore').open = true"); pg.wait_for_timeout(200)   # the Language bar sits in the More fold (2.8)
    btn = pg.query_selector('.langbar [data-act="setread"][data-v="es"]')
    check("chapter page offers Español", bool(btn) and "Español" in btn.text_content())
    btn.click(); pg.wait_for_timeout(700)
    check("Spanish file loaded on demand", "es/21-01.js" in loaded)
    body = pg.eval_on_selector('.ai-sec[lang="es"]', "e => e.textContent") if pg.query_selector('.ai-sec[lang="es"]') else ""
    check("Spanish body shown with lang=es", "cordones de tzitzit" in body)
    check("Spanish section titles in the contents", "El precepto de tzitzit" in pg.eval_on_selector(".toc", "e => e.textContent"))
    banner = pg.eval_on_selector("#reader .aibanner", "e => e.textContent")
    check("labelled as an AI translation by Claude from the Hebrew", "AI translation" in banner and "Spanish" in banner and "Claude" in banner and "Hebrew" in banner)
    foot = pg.eval_on_selector("#reader > p.foot", "e => e.textContent")
    check("credit to Rabbi Melamed and Har Bracha kept", "Rabbi Eliezer Melamed" in foot and "CC BY 4.0" in foot and "Spanish" in foot)
    check("every section marked AI", pg.evaluate("[...document.querySelectorAll('.ai-sec[lang=es] h3')].every(h => h.querySelector('.aitag'))"))
    check("citation links run on the Spanish", pg.evaluate("document.querySelectorAll('.ai-sec[lang=es] a.pc-cite').length") > 0)
    # respelling (Neo-Classic S&P) and Hebrew letter tints are for English and Hebrew: the Spanish shows as translated
    pg.evaluate("PEARLS.setScheme('house'); PEARLS.state.prefs.tint = true"); pg.goto(url + "#ch-21-02"); pg.wait_for_timeout(700)
    same = pg.evaluate("""async () => { const d = await PEARLS.loadBook('21-02', 'xl/es'), x = document.createElement('div');
      x.innerHTML = d.sections.map(s => s.body).join(''); const shown = [...document.querySelectorAll('.ai-sec[lang=es] > p')].map(p => p.textContent).join('|');
      return shown.length > 100 && shown === [...x.querySelectorAll(':scope > p')].map(p => p.textContent).join('|'); }""")
    check("no respelling or Hebrew tints on Spanish", same)
    pg.evaluate("PEARLS.setScheme('source'); PEARLS.state.prefs.tint = false")
    check("Español saved as the reading language", pg.evaluate("PEARLS.state.prefs.read") == "es")
    check("listening stays English", pg.evaluate("PEARLS.listenLang(PEARLS.BYID['21-01'])") in ("en", "tts", "he") and pg.evaluate("PEARLS.listenLang(PEARLS.BYID['01-06'])") == "en")

    # an official-English chapter: English, with a note that Spanish isn't there yet
    pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(600)
    note = pg.query_selector("#reader .xlmissing")
    check("official chapter falls back to English with a note", bool(note) and "isn't available for this chapter yet" in note.text_content() and "English" in note.text_content())
    check("…and shows the English text", pg.evaluate("document.querySelectorAll('#reader .en-body').length") > 0 and not pg.query_selector('.ai-sec[lang="es"]'))

    # Settings carries the choice, and switching back to English redraws the chapter in English
    pg.evaluate("document.querySelector('[data-act=\"spelling\"]').click()"); pg.wait_for_timeout(300)
    chip = pg.query_selector('[data-read="es"]')
    check("Settings offers Español, selected", bool(chip) and "on" in (chip.get_attribute("class") or ""))
    pg.keyboard.press("Escape"); pg.goto(url + "#ch-21-01"); pg.wait_for_timeout(600)
    # Português works the same way
    btn = pg.query_selector('.langbar [data-act="setread"][data-v="pt"]')
    check("chapter page offers Português", bool(btn) and "Português" in btn.text_content())
    btn.click(); pg.wait_for_timeout(700)
    body = pg.eval_on_selector('.ai-sec[lang="pt"]', "e => e.textContent") if pg.query_selector('.ai-sec[lang="pt"]') else ""
    check("Portuguese body shown with lang=pt", "fios de tsitsit" in body and "pt/21-01.js" in loaded)
    banner = pg.eval_on_selector("#reader .aibanner", "e => e.textContent")
    check("Portuguese labelled as an AI translation", "AI translation" in banner and "Portuguese" in banner and "Claude" in banner)
    # a chapter Har Bracha translated into Spanish itself: its text, labelled official, no AI marks
    pg.evaluate("PEARLS.setLang('es')"); pg.goto(url + "#ch-18-01"); pg.wait_for_timeout(700)
    body = pg.eval_on_selector('.ai-sec[lang="es"]', "e => e.textContent") if pg.query_selector('.ai-sec[lang="es"]') else ""
    check("official Spanish shown in place of the AI one", "Texto oficial de Har Bracha, sección 1." in body and not pg.query_selector("#reader script"))
    banner = pg.eval_on_selector("#reader .aibanner", "e => e.textContent")
    check("labelled official, not AI", "Official translation" in banner and "Har Bracha" in banner and "AI" not in banner and "Claude" not in banner)
    check("no section marked AI, site numbers dropped", pg.evaluate("[...document.querySelectorAll('.ai-sec[lang=es] h3')].every(h => !h.querySelector('.aitag'))")
          and pg.eval_on_selector('.ai-sec[lang="es"] h3', "e => e.textContent").strip() == "Sección oficial 1")
    head = pg.eval_on_selector(".chhead .aiflag", "e => e.textContent")
    foot = pg.eval_on_selector("#reader > p.foot", "e => e.textContent")
    check("chapter header and credit say Har Bracha's translation", "Official translation" in head and "Yeshivat Har Bracha" in foot and "CC BY 4.0" in foot and "AI" not in foot)
    check("links to the Spanish page and the Hebrew", pg.evaluate("[...document.querySelectorAll('#sec-1 .secfoot a')].map(a => a.textContent).join('|')") == "Spanish source ↗|Hebrew source ↗")
    pg.evaluate("PEARLS.setLang('en')"); pg.wait_for_timeout(700)
    check("back to English redraws the chapter", not pg.query_selector('.ai-sec[lang="es"]') and pg.evaluate("document.querySelectorAll('#reader .ai-sec').length") > 0)
    b.close()

os.remove(FIX)
if os.path.exists(KEEP): shutil.move(KEEP, FIX)
elif not os.listdir(os.path.dirname(FIX)): os.rmdir(os.path.dirname(FIX))
rebuild()

print("errors:", errors or "none")
total = ok + len(fails)
print(f"other languages: {ok}/{total}")
sys.exit(1 if fails or errors else 0)
