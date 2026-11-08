"""Other reading languages (www/xl, make_xl_books.py): choose Español, read a chapter that has a Spanish AI translation,
see the AI label and the credit, and get English with a note on a chapter that has none. Offline, like test_app.py.
Must end "other languages: N/N"."""
import os, sys
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__))
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
    check("index lists Spanish", "es" in langs and pg.evaluate("!!PH_XL.ch['10-01'] && !!PH_XL.ch['10-01'].es"))

    # a chapter with a Spanish translation, read in English first: nothing Spanish is loaded until it is chosen
    pg.goto(url + "#ch-10-01"); pg.wait_for_timeout(600)
    check("English by default, no Spanish loaded", not pg.query_selector('.ai-sec[lang="es"]') and not any(x.startswith("es/") for x in loaded))
    btn = pg.query_selector('.langbar [data-act="setread"][data-v="es"]')
    check("chapter page offers Español", bool(btn) and "Español" in btn.text_content())
    btn.click(); pg.wait_for_timeout(700)
    check("Spanish file loaded on demand", "es/10-01.js" in loaded)
    body = pg.eval_on_selector('.ai-sec[lang="es"]', "e => e.textContent") if pg.query_selector('.ai-sec[lang="es"]') else ""
    check("Spanish body shown with lang=es", "reconocimiento del bien" in body)
    check("Spanish section titles in the contents", "La mitzvá de agradecer" in pg.eval_on_selector(".toc", "e => e.textContent"))
    banner = pg.eval_on_selector("#reader .aibanner", "e => e.textContent")
    check("labelled as an AI translation by Claude from the Hebrew", "AI translation" in banner and "Spanish" in banner and "Claude" in banner and "Hebrew" in banner)
    foot = pg.eval_on_selector("#reader > p.foot", "e => e.textContent")
    check("credit to Rabbi Melamed and Har Bracha kept", "Rabbi Eliezer Melamed" in foot and "CC BY 4.0" in foot and "Spanish" in foot)
    check("every section marked AI", pg.evaluate("[...document.querySelectorAll('.ai-sec[lang=es] h3')].every(h => h.querySelector('.aitag'))"))
    check("citation links run on the Spanish", pg.evaluate("document.querySelectorAll('.ai-sec[lang=es] a.pc-cite').length") > 0)
    # respelling (Neo-Classic S&P) and Hebrew letter tints are for English and Hebrew: the Spanish shows as translated
    pg.evaluate("PEARLS.setScheme('house'); PEARLS.state.prefs.tint = true"); pg.goto(url + "#ch-10-02"); pg.wait_for_timeout(700)
    same = pg.evaluate("""async () => { const d = await PEARLS.loadBook('10-02', 'xl/es'), x = document.createElement('div');
      x.innerHTML = d.sections.map(s => s.body).join(''); const shown = [...document.querySelectorAll('.ai-sec[lang=es] > p')].map(p => p.textContent).join('|');
      return shown.length > 100 && shown === [...x.querySelectorAll(':scope > p')].map(p => p.textContent).join('|'); }""")
    check("no respelling or Hebrew tints on Spanish", same)
    pg.evaluate("PEARLS.setScheme('source'); PEARLS.state.prefs.tint = false")
    check("Español saved as the reading language", pg.evaluate("PEARLS.state.prefs.read") == "es")
    check("listening stays English", pg.evaluate("PEARLS.listenLang(PEARLS.BYID['10-01'])") in ("en", "tts", "he") and pg.evaluate("PEARLS.listenLang(PEARLS.BYID['01-06'])") == "en")

    # an official-English chapter: English, with a note that Spanish isn't there yet
    pg.goto(url + "#ch-01-06"); pg.wait_for_timeout(600)
    note = pg.query_selector("#reader .xlmissing")
    check("official chapter falls back to English with a note", bool(note) and "isn't available for this chapter yet" in note.text_content() and "English" in note.text_content())
    check("…and shows the English text", pg.evaluate("document.querySelectorAll('#reader .en-body').length") > 0 and not pg.query_selector('.ai-sec[lang="es"]'))

    # Settings carries the choice, and switching back to English redraws the chapter in English
    pg.evaluate("document.querySelector('[data-act=\"spelling\"]').click()"); pg.wait_for_timeout(300)
    chip = pg.query_selector('[data-read="es"]')
    check("Settings offers Español, selected", bool(chip) and "on" in (chip.get_attribute("class") or ""))
    pg.keyboard.press("Escape"); pg.goto(url + "#ch-10-01"); pg.wait_for_timeout(600)
    pg.evaluate("PEARLS.setLang('en')"); pg.wait_for_timeout(700)
    check("back to English redraws the chapter", not pg.query_selector('.ai-sec[lang="es"]') and pg.evaluate("document.querySelectorAll('#reader .ai-sec').length") > 0)
    b.close()

print("errors:", errors or "none")
total = ok + len(fails)
print(f"other languages: {ok}/{total}")
sys.exit(1 if fails or errors else 0)
