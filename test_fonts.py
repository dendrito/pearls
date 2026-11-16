"""Hard rule: every letter the app can show is drawn by the typeface that's meant to show it.

A face that lacks a letter makes the phone borrow it from another font, so words like "Ḥanukka" come out with one odd
letter (the "weird dotted letters"). This test fails if:
  1. a font family named first in any font stack in app.css / skins.css / modes.css isn't bundled in www/fonts/web/
     (system fonts excepted below), or
  2. a bundled Latin family/style doesn't cover, inside its unicode-range, every letter and every punctuation mark that
     occurs in the app's text (www/*.js, www/en, www/books) or that a spelling scheme can produce, or
  3. a word in another script (Cyrillic, Arabic) isn't marked <span lang="…"> with a :lang() rule in app.css, or the
     faces meant for that script (--f-cyr / --f-ar) don't cover it. Those words never fall to a Latin face.
Fix a failure with `python3 patch_webfonts.py` (adds composite letters built from the font's own parts) or by choosing
another typeface. Must end "fonts: all letters covered"."""
import glob, os, re, sys, unicodedata
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__)); WWW = os.path.join(HERE, "www"); WEB = os.path.join(WWW, "fonts", "web")
SYSTEM = {"system-ui", "sans-serif", "serif", "monospace", "ui-monospace", "Georgia", "Segoe UI", "Roboto",
          "Iowan Old Style", "Palatino Linotype", "Noto Serif Hebrew", "David", "inherit"}
HEBREW_ONLY = {"Shofar", "Keter YG"}   # bundled in www/fonts/, Hebrew block only; Latin falls through to the next font
# other scripts quoted inside the English: (code point ranges, the lang codes that mark them, the bundled faces that draw them)
SCRIPTS = {"Cyrillic": ([(0x0400, 0x052F)], ("ru", "uk", "bg"), ("Noto Sans", "Noto Serif")),
           "Arabic": ([(0x0600, 0x06FF), (0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)], ("ar", "fa"), ("Noto Sans Arabic", "Noto Naskh Arabic"))}
SCRIPT_ONLY = {f for _, _, fams in SCRIPTS.values() for f in fams}
def script_of(ch): return next((n for n, (rs, _, _) in SCRIPTS.items() if any(a <= ord(ch) <= b for a, b in rs)), None)
PUNCT_OK = set("’‘“”–—…§·×°½¾º‑")   # punctuation in running text that must match the face too

def ranges(rng):
    out = []
    for part in rng.split(","):
        a, _, b = part.strip().replace("U+", "").partition("-"); out.append((int(a, 16), int(b or a, 16)))
    return out

def needed(problems=None):
    chars, foreign = set(), {n: set() for n in SCRIPTS}
    span = re.compile(r'<span lang=\\?"([a-z]{2,3})\\?"[^>]*>(.*?)</span>')
    # Estante's voice engine (voice*.js, *-worker.js) and pearls-phonemes.js hold sound tables that are never shown
    files = [f for f in glob.glob(os.path.join(WWW, "*.js")) if not re.match(r"(voice.*|.*-worker|pearls-phonemes)\.js$", os.path.basename(f))] + glob.glob(os.path.join(WWW, "en", "**", "*"), recursive=True) \
        + glob.glob(os.path.join(WWW, "books", "**", "*"), recursive=True)
    for f in files:
        if not os.path.isfile(f) or not f.endswith((".js", ".json", ".html", ".txt")): continue
        text = open(f, encoding="utf8").read()
        for m in span.finditer(text):      # a marked word: its letters go to that script's faces
            for ch in m.group(2):
                n = script_of(ch)
                if n and m.group(1) in SCRIPTS[n][1]: foreign[n].add(ch)
        bare = span.sub(lambda m: "".join(c for c in m.group(0) if not (script_of(c) and m.group(1) in SCRIPTS[script_of(c)][1])), text)
        for ch in bare:
            o = ord(ch)
            n = script_of(ch)
            if n:
                if problems is not None: problems.add(f"{os.path.relpath(f, HERE)}: {n} '{ch}' isn't inside <span lang=\"{SCRIPTS[n][1][0]}\">")
                continue
            if o < 128 or 0x0590 <= o <= 0x05FF or 0xFB1D <= o <= 0xFB4F: continue
            cat = unicodedata.category(ch)
            if cat.startswith("L") or cat == "Lm" or ch in PUNCT_OK: chars.add(ch)
    return chars, foreign

def main():
    errors = []
    css = open(os.path.join(WEB, "fonts.css")).read()
    faces = {}
    for b in re.findall(r"@font-face\s*\{[^}]*\}", css):
        fam = re.search(r"font-family: '([^']+)'", b).group(1); st = re.search(r"font-style: (\w+)", b).group(1)
        fn = re.search(r"url\(([^)]+)\)", b).group(1); rng = ranges(re.search(r"unicode-range: ([^;]+);", b).group(1))
        faces.setdefault((fam, st), []).append((set(TTFont(os.path.join(WEB, fn)).getBestCmap()), rng))
    bundled = {f for f, _ in faces}
    # 1. every font stack starts with a bundled face
    used = set()
    for name in ("app.css", "skins.css", "modes.css"):
        src = open(os.path.join(WWW, name)).read()
        for stack in re.findall(r"(?:--f-[a-z]+|font-family)\s*:\s*([^;}]+)", src):
            first = stack.split(",")[0].strip().strip("\"'")
            if first.startswith("var(") or first in SYSTEM or first in HEBREW_ONLY: continue
            if first in SCRIPT_ONLY:
                if first not in bundled: errors.append(f"{name}: font stack starts with '{first}', which isn't bundled")
                continue
            used.add(first)
            if first not in bundled: errors.append(f"{name}: font stack starts with '{first}', which isn't bundled")
    # 2. coverage
    problems = set()
    need, foreign = needed(problems)
    errors += sorted(problems)
    appcss = open(os.path.join(WWW, "app.css")).read()
    for n, (rs, langs, fams) in SCRIPTS.items():
        if not foreign[n]: continue
        for lg in langs:
            if f":lang({lg})" not in appcss: errors.append(f"app.css: no :lang({lg}) rule for {n} words")
        for fam in fams:
            lst = faces.get((fam, "normal"))
            if not lst: errors.append(f"{n}: face '{fam}' isn't bundled"); continue
            missing = [ch for ch in sorted(foreign[n]) if not any(ord(ch) in cm and any(a <= ord(ch) <= b for a, b in rng) for cm, rng in lst)]
            if missing: errors.append(f"{fam} ({n}): missing {' '.join(missing)}")
    for (fam, st), lst in sorted(faces.items()):
        if fam not in used: continue
        missing = [ch for ch in sorted(need) if not any(ord(ch) in cm and any(a <= ord(ch) <= b for a, b in rng) for cm, rng in lst)]
        if missing: errors.append(f"{fam} {st}: missing {' '.join(missing)}")
    print(f"{len(need)} letters and marks checked in {len(used)} families", "+ " + ", ".join(f"{len(v)} {n}" for n, v in foreign.items() if v) if any(foreign.values()) else "")
    if errors:
        print("\n".join(errors)); print("fonts: FAILED"); sys.exit(1)
    print("fonts: all letters covered")

if __name__ == "__main__":
    main()
