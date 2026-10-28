#!/usr/bin/env python3
"""Validate an English chapter against its Hebrew source.  Usage: check.py 10-04 [10-05 ...]  (or 'all')"""
import json, os, re, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
HEB = re.compile(r"[֐-׿]")
ALLOWED = {"p", "sup", "b", "i", "br", "blockquote"}

def words(h): return len(re.sub(r"<[^>]+>", " ", h or "").split())

def check(cid):
    he = json.load(open(os.path.join(HERE, "he", f"{cid}.json")))
    p = os.path.join(HERE, "en", f"{cid}.json")
    if not os.path.exists(p): return [f"{cid}: no English file"]
    try: en = json.load(open(p))
    except Exception as e: return [f"{cid}: English file is not valid JSON ({e})"]
    errs = []
    if not en.get("chapter_en"): errs.append(f"{cid}: missing chapter_en")
    es = {s.get("slug"): s for s in en.get("sections", [])}
    for s in he["sections"]:
        t = es.get(s["slug"])
        if not t: errs.append(f"{s['slug']}: section missing"); continue
        b = t.get("body_en", "")
        if not t.get("title_en"): errs.append(f"{s['slug']}: missing title_en")
        hp, ep = s["body_he"].count("<p"), b.count("<p")
        if abs(hp - ep) > max(1, hp // 10): errs.append(f"{s['slug']}: paragraphs {ep} vs Hebrew {hp}")
        hs = re.findall(r"<sup>(\d+)</sup>", s["body_he"]); es_ = re.findall(r"<sup>(\d+)</sup>", b)
        if hs != es_: errs.append(f"{s['slug']}: footnote markers {es_} vs Hebrew {hs}")
        hn, en_ = [n["n"] for n in s["notes_he"]], [n.get("n") for n in t.get("notes_en", [])]
        if hn != en_: errs.append(f"{s['slug']}: notes {en_} vs Hebrew {hn}")
        hw = words(s["body_he"]) + sum(words(n["he"]) for n in s["notes_he"])
        ew = words(b) + sum(words(n.get("en", "")) for n in t.get("notes_en", []))
        if hw > 40 and not (1.05 <= ew / hw <= 2.6): errs.append(f"{s['slug']}: length ratio {ew / hw:.2f} (en {ew} / he {hw} words) — check for omissions or padding")
        for n in t.get("notes_en", []):
            hnote = next((x for x in s["notes_he"] if x["n"] == n.get("n")), None)
            if hnote and words(hnote["he"]) > 25 and words(n.get("en", "")) < 0.9 * words(hnote["he"]):
                errs.append(f"{s['slug']}: note {n.get('n')} looks shortened")
        txt = b + " ".join(n.get("en", "") for n in t.get("notes_en", []))
        heb = len(HEB.findall(txt))
        if heb > 40: errs.append(f"{s['slug']}: {heb} Hebrew letters left in the English")
        tags = set(re.findall(r"<\s*([a-zA-Z0-9]+)", b)) - ALLOWED
        if tags: errs.append(f"{s['slug']}: disallowed tags {sorted(tags)}")
    extra = set(es) - {s["slug"] for s in he["sections"]}
    if extra: errs.append(f"{cid}: unexpected sections {sorted(extra)}")
    return errs

if __name__ == "__main__":
    ids = sys.argv[1:]
    if ids == ["all"]: ids = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(HERE, "en", "*.json")))
    bad = 0
    for cid in ids:
        e = check(cid)
        print(f"{cid}: {'OK' if not e else str(len(e)) + ' problem(s)'}")
        for x in e: print("  -", x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
