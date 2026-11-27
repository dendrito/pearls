"""Package the AI translations into other languages (Spanish now; Portuguese, French later) for Pearls.

work/he/BB-CC.json (Hebrew from ph.yhb.org.il, CC BY 4.0) + work/<lang>/BB-CC.json (AI translation by Claude,
shape {book, chapter, chapter_<lang>, sections:[{slug, title_<lang>, body_<lang>, notes_<lang>:[{n, <lang>}]}]})
  -> www/xl/<lang>/BB-CC.js  (one file per chapter, loaded when the chapter is opened in that language)
  -> www/xl/index.js         (which chapters have which languages, with their translated chapter and section titles)

Where Har Bracha publishes its own translation of a chapter (src/<lang>/BB-CC.json, fetched by fetch_xl_official.py
from ph.yhb.org.il/<lang>, CC BY 4.0), that official text ships instead of the AI one and is labelled official; a
chapter ships official only if every section of the Hebrew has its official counterpart.
Only AI chapters that pass `work/check.py --lang <lang>` ship, as make_he_books.py does for English.
To add a language: translate into work/<lang>/, add it to LANGS below, and run this script (build.sh does)."""
import glob, html, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work"); OUT = os.path.join(HERE, "www", "xl")

# code -> name shown in the language pickers (in the language itself) and the note for a missing chapter
LANGS = {
    "es": {"name": "Español", "short": "ES", "english": "Spanish",
           "video": "[Vídeo en la página original en hebreo]"},
    "pt": {"name": "Português", "short": "PT", "english": "Portuguese",
           "video": "[Vídeo na página original em hebraico]"},
    "fr": {"name": "Français", "short": "FR", "english": "French", "video": "[Vidéo sur la page originale en hébreu]"},
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

def official(lang, cid, he):
    """The official translation of a chapter, section by section, or None if the site lacks any section of it."""
    p = os.path.join(HERE, "src", lang, f"{cid}.json")
    if not os.path.exists(p): return None
    raw = json.load(open(p)); raw = raw.get("posts", []) if isinstance(raw, dict) else raw
    posts = {q["slug"]: q for q in raw if (q.get("content") or {}).get("rendered", "").strip()}
    if not posts: return None
    secs = []
    for s in he["sections"]:
        q = posts.get(s["slug"])
        if not q: return False   # partial: the AI chapter stays
        body = re.sub(r"(?is)<(script|style|iframe|form)\b.*?</\1>", "", q["content"]["rendered"])
        title = html.unescape(re.sub(r"<[^>]+>", "", q["title"]["rendered"])).strip()
        title = re.sub(r"^\d{1,2}\s*[\.\)–—-]\s*", "", title)   # the site numbers its section titles; the app numbers them itself
        secs.append({"slug": s["slug"], "link": s["link"], "src": q.get("link") or "", "title": title, "body": body.strip(), "notes": []})
    return secs

def main():
    os.makedirs(OUT, exist_ok=True)
    index = {"langs": {k: {"name": v["name"], "short": v["short"], "english": v["english"]} for k, v in LANGS.items()}, "ch": {}}
    for lang in LANGS:
        d = os.path.join(OUT, lang); os.makedirs(d, exist_ok=True)
        for f in glob.glob(os.path.join(d, "*.js")): os.remove(f)
        shipped, n_off, report = 0, 0, []
        ids = sorted({os.path.basename(f)[:-5] for f in glob.glob(os.path.join(WORK, lang, "*.json"))}
                     | {os.path.basename(f)[:-5] for f in glob.glob(os.path.join(HERE, "src", lang, "*.json"))})
        for cid in ids:
            f = os.path.join(WORK, lang, f"{cid}.json")
            hp = os.path.join(WORK, "he", f"{cid}.json")
            if not os.path.exists(hp): report.append(f"{cid}: no Hebrew source"); continue
            he = json.load(open(hp)); off = official(lang, cid, he)
            if off is False: report.append(f"{cid}: official translation lacks a section, AI kept")
            if off:
                src = json.load(open(os.path.join(HERE, "src", lang, f"{cid}.json")))
                data = {"id": cid, "lang": lang, "translator": "official", "sections": off,
                        "title": (src.get("chapter") if isinstance(src, dict) else "") or ""}
                open(os.path.join(d, f"{cid}.js"), "w").write("window.PH_BOOK_LOAD(" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ");\n")
                index["ch"].setdefault(cid, {})[lang] = {"t": data["title"], "s": [s["title"] for s in off], "o": 1}
                shipped += 1; n_off += 1; continue
            if not os.path.exists(f): continue
            ok, msg = valid(lang, cid)
            if not ok: report.append(f"{cid}: failing checks, not shipped\n{msg}"); continue
            xl = json.load(open(f))
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
        print(f"{lang}: {shipped} chapters shipped, {n_off} of them Har Bracha's official translation")
        for r in report: print(r)
    open(os.path.join(OUT, "index.js"), "w").write(
        "window.PH_XL = " + json.dumps(index, ensure_ascii=False, separators=(",", ":")) + ";\n")

if __name__ == "__main__":
    main()
