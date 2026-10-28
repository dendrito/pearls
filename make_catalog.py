"""catalog_en.json (extracted from ph.yhb.org.il/en) -> www/catalog.js"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open(os.path.join(here, "catalog_en.json")))
order = ["01", "02", "03", "04", "05", "12", "13", "14", "15"]
vols = sorted(cat["volumes"], key=lambda v: order.index(v["book"]) if v["book"] in order else 99)
for v in vols:
    v["title"] = v["title"].split("–")[-1].strip()
    v["title"] = {"Shabbat": "Laws of Shabbat", "Prayer": "Laws of Prayer", "Zemanim": "Zemanim", "Sukkot": "Laws of Sukkot"}.get(v["title"], v["title"])
    for c in v["chapters"]:
        c["title"] = (c.get("title") or "").strip() or None
        c["sectionTitles"] = [s.strip() for s in c.get("sectionTitles") or [] if s and s.strip()]
        c["sections"] = c.get("sections") or len(c["sectionTitles"])
out = "window.PH_CATALOG = " + json.dumps({"volumes": vols}, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(os.path.join(here, "www", "catalog.js"), "w").write(out)
print(len(vols), "volumes,", sum(len(v["chapters"]) for v in vols), "chapters,", len(out) // 1024, "KB")
