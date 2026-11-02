"""Spelling schemes: the names, the "Use English words" setting, named exceptions and the #spelling page.
Must end "spelling: N/N"."""
import os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); url = "file://" + os.path.join(here, "www", "index.html")
ok = 0; n = 0
def check(name, cond, info=""):
    global ok, n; n += 1; ok += bool(cond); print(("PASS " if cond else "FAIL ") + name, "" if cond else info)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.route("https://**", lambda r: r.abort()); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(500)
    E = lambda js: pg.evaluate(js)
    text = "On Shabbat before Pesach and Sukkot, Ashkenazim say Kaddish; Ashkenaz customs differ."
    check("Original leaves the text as published", E(f"PEARLS.R({text!r})") == text)
    E("PEARLS.setScheme('house')")
    got = E(f"PEARLS.R({text!r})")
    check("Neo-Classic S&P re-spells", "Shabbath" in got and "Pesaḥ" in got and "Succóth" in got and "Ḳaddéesh" in got, got)
    check("Ashkenaz is a named exception", "Ashkenazim" in got and "Ashkenaz customs" in got, got)
    check("English words are off by default", E("localStorage.getItem('pearls:enWords')") in (None, "false") and "Sabbath" not in got)
    E("PEARLS.setEnWords(true)"); got = E(f"PEARLS.R({text!r})")
    check("English words: Sabbath, Passover, Tabernacles", "Sabbath" in got and "Passover" in got and "Tabernacles" in got and "Ḳaddéesh" in got, got)
    E("PEARLS.setScheme('source')")
    check("English words don't apply to Original", E(f"PEARLS.R({text!r})") == text)
    E("PEARLS.setEnWords(false)")
    pg.goto(url + "#spelling"); pg.wait_for_timeout(400)
    body = E("document.querySelector('.view').innerText")
    check("#spelling lists every scheme", all(s in body for s in ["Original", "Neo-Classic S&P", "de Sola–Gaster", "Modern London", "S&P London academic", "Modern Sephardi", "Amsterdam", "Dutch"]))
    check("#spelling explains Neo-Classic S&P is de Sola–Gaster based", "About Neo-Classic S&P" in body and "de Sola (1836)" in body)
    check("#spelling has the letter and word tables", E("document.querySelectorAll('.schemes-t').length") == 2 and "Ḳaddéesh" in body)
    check("#spelling doesn't scroll sideways at phone width", E("document.documentElement.scrollWidth") <= 390, E("document.documentElement.scrollWidth"))
    check("no page errors", not errs, errs)
    b.close()
print(f"spelling: {ok}/{n}")
raise SystemExit(ok != n)
