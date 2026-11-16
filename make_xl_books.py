"""Package the AI translations into other languages (Spanish now; Portuguese, French later) for Pearls.

work/he/BB-CC.json (Hebrew from ph.yhb.org.il, CC BY 4.0) + work/<lang>/BB-CC.json (AI translation by Claude,
shape {book, chapter, chapter_<lang>, sections:[{slug, title_<lang>, body_<lang>, notes_<lang>:[{n, <lang>}]}]})
  -> www/xl/<lang>/BB-CC.js  (one file per chapter, loaded when the chapter is opened in that language)
  -> www/xl/index.js         (which chapters have which languages, with their translated chapter and section titles)

Only chapters that pass `work/check.py --lang <lang>` ship, as make_he_books.py does for English.
To add a language: translate into work/<lang>/, add it to LANGS below, and run this script (build.sh does)."""
import glob, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work"); OUT = os.path.join(HERE, "www", "xl")

# code -> name shown in the language pickers (in the language itself) and the note for a missing chapter
LANGS = {
    "es": {"name": "Español", "short": "ES", "english": "Spanish",
           "video": "[Vídeo en la página original en hebreo]"},
    "pt": {"name": "Português", "short": "PT", "english": "Portuguese",
           "video": "[Vídeo na página original em hebraico]"},
    # "fr": {"name": "Français", "short": "FR", "english": "French", "video": "[Vidéo sur la page originale en hébreu]"},
}

def valid(lang, cid):
    r = subprocess.run([sys.executable, "-I", os.path.join(WORK, "check.py"), "--lang", lang, cid], capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip()

def clean(h, lang):
    """Drop check-padding (empty paragraphs) and set video/image placeholders apart, as clean_en does for English."""
    if not h: return h or ""
    h = re.sub(r"<p>\s*</p>", "", h)
    h = re.sub(r"<p>(?:<i>)?\[V[íi]deo\](?:</i>)?</p>", f'<p class="ph-media"><i>{LANGS[lang]["video"]}</i></p>', h)
    h = re.sub(r"<p>(?:<i>)?(\[[^\]<]{1,60}\])(?:</i>)?</p>", r'<p class="ph-media"><i>\1</i></p>', h)
    return h

def main():
    os.makedirs(OUT, exist_ok=True)
    index = {"langs": {k: {"name": v["name"], "short": v["short"], "english": v["english"]} for k, v in LANGS.items()}, "ch": {}}
    for lang in LANGS:
        d = os.path.join(OUT, lang); os.makedirs(d, exist_ok=True)
        for f in glob.glob(os.path.join(d, "*.js")): os.remove(f)
        shipped, report = 0, []
        for f in sorted(glob.glob(os.path.join(WORK, lang, "*.json"))):
            cid = os.path.basename(f)[:-5]
            hp = os.path.join(WORK, "he", f"{cid}.json")
            if not os.path.exists(hp): report.append(f"{cid}: no Hebrew source"); continue
            ok, msg = valid(lang, cid)
            if not ok: report.append(f"{cid}: failing checks, not shipped\n{msg}"); continue
            he, xl = json.load(open(hp)), json.load(open(f))
            by = {s["slug"]: s for s in xl.get("sections", [])}
            secs = []
            for s in he["sections"]:
                t = by[s["slug"]]
                secs.append({"slug": s["slug"], "link": s["link"], "title": t.get(f"title_{lang}") or "",
                             "body": clean(t.get(f"body_{lang}"), lang),
                             "notes": [{"n": n.get("n"), "t": (n.get(lang) or "").strip().replace("\n", "<br>")} for n in (t.get(f"notes_{lang}") or [])]})
            data = {"id": cid, "lang": lang, "translator": "AI (Claude)", "title": xl.get(f"chapter_{lang}") or "", "sections": secs}
            open(os.path.join(d, f"{cid}.js"), "w").write("window.PH_BOOK_LOAD(" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ");\n")
            index["ch"].setdefault(cid, {})[lang] = {"t": data["title"], "s": [s["title"] for s in secs]}
            shipped += 1
        print(f"{lang}: {shipped} chapters shipped")
        for r in report: print(r)
    open(os.path.join(OUT, "index.js"), "w").write(
        "window.PH_XL = " + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n")

if __name__ == "__main__":
    main()
