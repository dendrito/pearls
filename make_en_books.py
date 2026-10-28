"""Bundle the official English text (src/en/BB-CC.json, from fetch_en_text.py; ph.yhb.org.il/en, CC BY 4.0)
into www/en/BB-CC.js so every English chapter reads offline. One file per chapter, loaded when it opens."""
import glob, json, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "www", "en")
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, "*.js")): os.remove(f)
n = size = 0
for src in sorted(glob.glob(os.path.join(HERE, "src", "en", "*.json"))):
    posts = [{"slug": p["slug"], "link": p["link"], "title": {"rendered": p["title"]["rendered"]}, "content": {"rendered": p["content"]["rendered"]}}
             for p in json.load(open(src)) if p.get("content", {}).get("rendered")]
    if not posts: continue
    js = "PH_BOOK_LOAD(" + json.dumps(posts, ensure_ascii=False, separators=(",", ":")) + ");\n"
    out = os.path.join(OUT, os.path.basename(src)[:-5] + ".js"); open(out, "w").write(js)
    n += 1; size += len(js.encode())
print(f"{n} English chapters bundled, {size // 1024} KB")
