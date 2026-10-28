"""Package the Hebrew-only Peninei Halakha books for Pearls.

work/he/BB-CC.json (Hebrew from ph.yhb.org.il, CC BY 4.0) + work/en/BB-CC.json (AI translation, if done and valid)
  -> www/books/BB-CC.js   (one file per chapter, loaded when the chapter is opened)
  -> www/catalog_he.js    (volumes and chapters for the library)"""
import glob, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work"); OUT = os.path.join(HERE, "www", "books")

VOLUMES = {  # English names used in the app
    "06": "The Nation and the Land", "07": "Likkutim I", "08": "Likkutim II", "10": "Berakhot",
    "11": "Family", "16": "Shevi'it and Yovel", "17": "Kashrut", "18": "Family Purity",
    "19": "Giyur", "20": "Emuna and Its Mitzvot", "21": "Ḥafetzei Kodesh",
}
LITE = os.environ.get("PEARLS_FULL") != "1"   # set PEARLS_FULL=1 to bundle the Hebrew too (bigger, works offline)
ORDER = ["10", "17", "18", "11", "19", "20", "06", "16", "21", "07", "08"]

def valid(cid):
    r = subprocess.run([sys.executable, "-I", os.path.join(WORK, "check.py"), cid], capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip()

def clean_en(h):
    """Drop check-padding (empty paragraphs) and unify video/diagram placeholders."""
    import re
    if not h: return h
    h = re.sub(r"<p>\s*</p>", "", h)
    h = re.sub(r"<p>(?:<i>)?\[Video\](?:</i>)?</p>", '<p class="ph-media"><i>[Video in the original Hebrew page]</i></p>', h)
    return h

def strip_num(t):  # "ד - ברכת המזון" -> "ברכת המזון"
    return re.sub(r"^\s*[א-ת\"׳״']{1,4}\s*[-–]\s*", "", t or "").strip()

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*.js")): os.remove(f)
    vols, report = {}, []
    for f in sorted(glob.glob(os.path.join(WORK, "he", "*.json"))):
        he = json.load(open(f)); b, cc = he["book"], he["chapter"]; cid = f"{b}-{cc}"
        enp = os.path.join(WORK, "en", f"{cid}.json")
        en, ok = None, False
        if os.path.exists(enp):
            ok, msg = valid(cid)
            if ok: en = json.load(open(enp))
            else: report.append(f"{cid}: translation present but failing checks — shipped as Hebrew only\n{msg}")
        es = {s["slug"]: s for s in (en or {}).get("sections", [])}
        secs = []
        for s in he["sections"]:
            t = es.get(s["slug"], {})
            secs.append({"slug": s["slug"], "link": s["link"], "title_he": s["title_he"], "body_he": s["body_he"],
                         "notes_he": s["notes_he"], "title_en": t.get("title_en"), "body_en": clean_en(t.get("body_en")),
                         "notes_en": [dict(n, en=(n.get("en") or "").strip().replace("\n", "<br>")) for n in (t.get("notes_en") or [])]})
        if LITE:   # app-size build: only translated chapters are bundled, English only; the Hebrew is read live
            for s in secs: s.pop("body_he"); s.pop("notes_he")
        data = {"id": cid, "translated": bool(en), "translator": "AI (Claude)" if en else None, "sections": secs}
        if en or not LITE: open(os.path.join(OUT, f"{cid}.js"), "w").write("window.PH_BOOK_LOAD(" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ");\n")
        n = int(cc)
        ch = {"n": n, "titleHe": strip_num(he.get("chapter_he")) or None, "title": (en or {}).get("chapter_en"),
              "sections": len(secs), "sectionTitles": [s.get("title_en") or strip_num(s["title_he"]) for s in secs],
              "translated": bool(en)}
        if n == 0: ch["title"] = ch["title"] or "Preface"
        vols.setdefault(b, {"book": b, "title": VOLUMES.get(b, b), "titleHe": (he.get("volume_he") or [None])[0], "chapters": []})["chapters"].append(ch)
    out = [vols[b] for b in ORDER if b in vols]
    for v in out: v["chapters"].sort(key=lambda c: c["n"])
    open(os.path.join(HERE, "www", "catalog_he.js"), "w").write(
        "window.PH_CATALOG_HE = " + json.dumps({"volumes": out}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    done = sum(c["translated"] for v in out for c in v["chapters"]); tot = sum(len(v["chapters"]) for v in out)
    print(f"{len(out)} volumes, {tot} chapters, {done} translated")
    for r in report: print(r)

if __name__ == "__main__":
    main()
