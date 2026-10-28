"""Fetch the official English text of every chapter from ph.yhb.org.il/en (CC BY 4.0) into src/en/BB-CC.json,
so the app can bundle it and read offline. Re-run to refresh; existing files are skipped unless --force."""
import json, os, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "src", "en"); os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Pearls (Android build; offline text)"}
cat = json.load(open(os.path.join(HERE, "catalog_en.json")))
force = "--force" in sys.argv; n_ok = n_empty = 0
for v in cat["volumes"]:
    for ch in v["chapters"]:
        cid = f'{v["book"]}-{ch["n"]:02d}'; path = os.path.join(OUT, cid + ".json")
        if os.path.exists(path) and not force: n_ok += 1; continue
        n = max(ch.get("sections") or 0, 1)
        slugs = ",".join(f"{cid}-{i:02d}" for i in range(1, max(n + 2, 30) + 1))
        url = f"https://ph.yhb.org.il/en/wp-json/wp/v2/posts?per_page=50&_fields=slug,title,content,link&slug={slugs}"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: posts = json.load(r); break
            except Exception as e:
                print(cid, "retry", e); time.sleep(5 * (attempt + 1))
        else: sys.exit(f"failed {cid}")
        posts.sort(key=lambda p: p["slug"])
        json.dump(posts, open(path, "w"), ensure_ascii=False)
        n_ok += bool(posts); n_empty += not posts; time.sleep(0.6)
print("chapters", n_ok, "empty", n_empty)
