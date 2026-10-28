#!/usr/bin/env python3
"""Fetch the Peninei Halakha volumes that exist only in Hebrew, from the official WordPress API.

Licence: ph.yhb.org.il terms, section 2.1 — all content CC BY 4.0; 2.2 / 5.2 allow translation.
Attribution required: "פניני הלכה, הרב אליעזר מלמד, מכון הר ברכה", with a link to the source page.

Writes ph/he/<book>.json: {book, categories, posts:[{slug, title, content, link}]} for every book
that has no official English edition. Polite: one request at a time, a short pause between pages."""
import json, os, re, sys, time, urllib.request

SITE = "https://ph.yhb.org.il/wp-json/wp/v2"
ENGLISH = {"01", "02", "03", "04", "05", "12", "13", "14", "15"}   # have an official English edition
UA = {"User-Agent": "Pearls-reader/1.0 (personal study app; contact via github.com/dendrito)"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "yhb")

def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8")), dict(r.headers)
        except Exception as e:
            print("retry", attempt, url, e, file=sys.stderr); time.sleep(5 * (attempt + 1))
    raise SystemExit(f"failed: {url}")

def paged(endpoint, fields):
    page, out = 1, []
    while True:
        data, hdr = get(f"{SITE}/{endpoint}?per_page=100&page={page}&_fields={fields}")
        out += data
        total = int(hdr.get("X-WP-TotalPages") or hdr.get("x-wp-totalpages") or 1)
        print(endpoint, "page", page, "of", total, file=sys.stderr)
        if page >= total: return out
        page += 1; time.sleep(0.7)

def main():
    os.makedirs(OUT, exist_ok=True)
    cats = paged("categories", "id,name,slug,parent,count")
    posts = paged("posts", "slug,title,content,link,categories")
    books = {}
    for p in posts:
        m = re.match(r"^(\d\d)-(\d\d)-(\d\d)", p["slug"])
        if not m or m.group(1) in ENGLISH: continue
        books.setdefault(m.group(1), []).append({"slug": p["slug"], "title": p["title"]["rendered"],
            "content": p["content"]["rendered"], "link": p["link"], "categories": p.get("categories", [])})
    index = {}
    for b, ps in sorted(books.items()):
        ps.sort(key=lambda x: x["slug"])
        used = {c for p in ps for c in p["categories"]}
        bc = [c for c in cats if c["id"] in used]
        # include parents (the volume category) so chapter and volume names travel with the text
        ids = {c["id"] for c in bc}; parents = [c for c in cats if c["id"] in {x["parent"] for x in bc} and c["id"] not in ids]
        json.dump({"book": b, "categories": bc + parents, "posts": ps}, open(os.path.join(OUT, f"{b}.json"), "w"), ensure_ascii=False)
        index[b] = {"posts": len(ps), "chapters": len({p["slug"][3:5] for p in ps})}
    json.dump({"fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "books": index,
               "licence": "CC BY 4.0 per ph.yhb.org.il/terms; credit: פניני הלכה, הרב אליעזר מלמד, מכון הר ברכה"},
              open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(index, indent=1))

if __name__ == "__main__":
    main()
