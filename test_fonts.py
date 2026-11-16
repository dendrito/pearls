"""Hard rule: every letter the app can show is drawn by the typeface that's meant to show it.

A face that lacks a letter makes the phone borrow it from another font, so words like "Ḥanukka" come out with one odd
letter (the "weird dotted letters"). This test fails if:
  1. a font family named first in any font stack in app.css / skins.css / modes.css isn't bundled in www/fonts/web/
     (system fonts excepted below), or
  2. a bundled Latin family/style doesn't cover, inside its unicode-range, every letter and every punctuation mark that
     occurs in the app's text (www/*.js, www/en, www/books, www/xl) or that a spelling scheme can produce.
Fix a failure with `python3 patch_webfonts.py` (adds composite letters built from the font's own parts) or by choosing
another typeface. Must end "fonts: all letters covered"."""
import glob, os, re, sys, unicodedata
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__)); WWW = os.path.join(HERE, "www"); WEB = os.path.join(WWW, "fonts", "web")
SYSTEM = {"system-ui", "sans-serif", "serif", "monospace", "ui-monospace", "Georgia", "Segoe UI", "Roboto",
          "Iowan Old Style", "Palatino Linotype", "Noto Serif Hebrew", "David", "inherit"}
HEBREW_ONLY = {"Shofar", "Keter YG"}   # bundled in www/fonts/, Hebrew block only; Latin falls through to the next font
PUNCT_OK = set("’‘“”–—…§·×°½¾º‑¿¡«»")   # punctuation in running text that must match the face too (¿ ¡ « »: Spanish)

def ranges(rng):
    out = []
    for part in rng.split(","):
        a, _, b = part.strip().replace("U+", "").partition("-"); out.append((int(a, 16), int(b or a, 16)))
    return out

def needed():
    chars = set()
    # Estante's voice engine (voice*.js, *-worker.js) and pearls-phonemes.js hold sound tables that are never shown
    files = [f for f in glob.glob(os.path.join(WWW, "*.js")) if not re.match(r"(voice.*|.*-worker|pearls-phonemes)\.js$", os.path.basename(f))] + glob.glob(os.path.join(WWW, "en", "**", "*"), recursive=True) \
        + glob.glob(os.path.join(WWW, "books", "**", "*"), recursive=True) + glob.glob(os.path.join(WWW, "xl", "**", "*"), recursive=True)
    for f in files:
        if not os.path.isfile(f) or not f.endswith((".js", ".json", ".html", ".txt")): continue
        for ch in open(f, encoding="utf8").read():
            o = ord(ch)
            if o < 128 or 0x0590 <= o <= 0x05FF or 0xFB1D <= o <= 0xFB4F: continue
            # a word quoted in another script (21-11 names God in Arabic and Russian) is drawn by the system's font for
            # that script, as Hebrew is by the Hebrew faces; no Latin face is meant to show it
            if 0x0400 <= o <= 0x052F or 0x0600 <= o <= 0x06FF: continue
            cat = unicodedata.category(ch)
            if cat.startswith("L") or cat == "Lm" or ch in PUNCT_OK: chars.add(ch)
    return chars

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
            used.add(first)
            if first not in bundled: errors.append(f"{name}: font stack starts with '{first}', which isn't bundled")
    # 2. coverage
    need = needed()
    for (fam, st), lst in sorted(faces.items()):
        if fam not in used: continue
        missing = [ch for ch in sorted(need) if not any(ord(ch) in cm and any(a <= ord(ch) <= b for a, b in rng) for cm, rng in lst)]
        if missing: errors.append(f"{fam} {st}: missing {' '.join(missing)}")
    print(f"{len(need)} letters and marks checked in {len(used)} families")
    if errors:
        print("\n".join(errors)); print("fonts: FAILED"); sys.exit(1)
    print("fonts: all letters covered")

if __name__ == "__main__":
    main()
