"""Exports the AI-translated sections from ../www/books/*.js to text/BB-CC.json for pearls_tts.py.
Run after new translations: python3 tts/export_texts.py"""
import glob, json, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "text")
os.makedirs(OUT, exist_ok=True); n = 0
for f in sorted(glob.glob(os.path.join(HERE, "..", "www", "books", "*.js"))):
    s = open(f, encoding="utf8").read()
    try: d = json.loads(s[s.index("(") + 1:s.rindex(")")])
    except ValueError: continue
    secs = [{"n": int(x["slug"].rsplit("-", 1)[1]) if x.get("slug") else i + 1, "title": x.get("title_en") or "", "html": x["body_en"]} for i, x in enumerate(d.get("sections", [])) if x.get("body_en")]
    if not secs: continue
    json.dump({"id": d["id"], "translator": d.get("translator", ""), "sections": secs}, open(os.path.join(OUT, d["id"] + ".json"), "w", encoding="utf8"), ensure_ascii=False)
    n += len(secs)
print(n, "sections in", OUT)
