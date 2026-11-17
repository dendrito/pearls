"""Fetch Har Bracha's own Spanish and French translations (ph.yhb.org.il/es and /fr, CC BY 4.0) of the chapters
Pearls has only in Hebrew, into src/<lang>/BB-CC.json: {"chapter": the site's chapter title, "posts": [...]}.
A chapter the site doesn't have is written with no posts. make_xl_books.py ships a chapter as official only when
every section is there.

The cloud build machine can't reach ph.yhb.org.il, so run this where it can (a Mac):
    python3 fetch_xl_official.py            # es and fr; existing files are skipped
    python3 fetch_xl_official.py es --force
"""
import html, json, os, re, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (Pearls; offline text)"}   # the site refuses Python-urllib's own user agent

def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return json.load(r)
        except Exception as e:
            print("retry", url, e, flush=True); time.sleep(5 * (attempt + 1))
    sys.exit(f"failed {url}")

def main():
    force = "--force" in sys.argv
    langs = [a for a in sys.argv[1:] if not a.startswith("-")] or ["es", "fr"]
    ids = sorted(f[:-5] for f in os.listdir(os.path.join(HERE, "work", "he")) if f.endswith(".json"))
    for lang in langs:
        out = os.path.join(HERE, "src", lang); os.makedirs(out, exist_ok=True)
        api = f"https://ph.yhb.org.il/{lang}/wp-json/wp/v2"; whole = part = 0
        for cid in ids:
            path = os.path.join(out, cid + ".json")
            if os.path.exists(path) and not force: continue
            n = len(json.load(open(os.path.join(HERE, "work", "he", cid + ".json")))["sections"])
            slugs = ",".join(f"{cid}-{i:02d}" for i in range(1, max(n + 3, 30) + 1))
            posts = sorted(get(f"{api}/posts?per_page=50&_fields=slug,title,content,link,categories&slug={slugs}"), key=lambda p: p["slug"])
            chapter = ""
            if posts and posts[0].get("categories"):
                c = get(f"{api}/categories/{posts[0]['categories'][0]}?_fields=name")
                chapter = re.sub(r"^\s*(?:chapitre\s*)?\d{1,2}\s*[\.\)–—:-]\s*", "", html.unescape(c.get("name", "")), flags=re.I).strip()
            json.dump({"chapter": chapter, "posts": posts}, open(path, "w"), ensure_ascii=False)
            print(lang, cid, f"{len(posts)} of {n} sections", chapter, flush=True)
            time.sleep(0.6)
        for cid in ids:
            p = os.path.join(out, cid + ".json")
            k = len(json.load(open(p))["posts"]) if os.path.exists(p) else 0
            n = len(json.load(open(os.path.join(HERE, "work", "he", cid + ".json")))["sections"])
            whole += k >= n; part += 0 < k < n
        print(f"{lang}: {whole} chapters complete, {part} partial, of {len(ids)}")

if __name__ == "__main__":
    main()
