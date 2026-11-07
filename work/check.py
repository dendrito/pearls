#!/usr/bin/env python3
"""Validate a translated chapter against its Hebrew source.
Usage: check.py [--lang es|pt|fr] 10-04 [10-05 ...]  (or 'all'); default language en."""
import json, os, re, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
HEB = re.compile(r"[֐-׿]")
ALLOWED = {"p", "sup", "b", "i", "br", "blockquote"}

def words(h): return len(re.sub(r"<[^>]+>", " ", h or "").split())

# Translated words per Hebrew word: below lo looks like an omission, above hi like padding.
RATIO = {"en": (1.05, 2.6), "es": (1.15, 3.0), "pt": (1.1, 2.9), "fr": (1.2, 3.1)}
L = "en"

def check(cid):
    he = json.load(open(os.path.join(HERE, "he", f"{cid}.json")))
    p = os.path.join(HERE, L, f"{cid}.json")
    if not os.path.exists(p): return [f"{cid}: no {L} file"]
    try: en = json.load(open(p))
    except Exception as e: return [f"{cid}: {L} file is not valid JSON ({e})"]
    errs = []
    if not en.get(f"chapter_{L}"): errs.append(f"{cid}: missing chapter_{L}")
    es = {s.get("slug"): s for s in en.get("sections", [])}
    for s in he["sections"]:
        t = es.get(s["slug"])
        if not t: errs.append(f"{s['slug']}: section missing"); continue
        b = t.get(f"body_{L}", "")
        if not t.get(f"title_{L}"): errs.append(f"{s['slug']}: missing title_{L}")
        hp, ep = s["body_he"].count("<p"), b.count("<p")
        if abs(hp - ep) > max(1, hp // 10): errs.append(f"{s['slug']}: paragraphs {ep} vs Hebrew {hp}")
        hs = re.findall(r"<sup>(\d+)</sup>", s["body_he"]); es_ = re.findall(r"<sup>(\d+)</sup>", b)
        if hs != es_: errs.append(f"{s['slug']}: footnote markers {es_} vs Hebrew {hs}")
        hn, en_ = [n["n"] for n in s["notes_he"]], [n.get("n") for n in t.get(f"notes_{L}", [])]
        if hn != en_: errs.append(f"{s['slug']}: notes {en_} vs Hebrew {hn}")
        hw = words(s["body_he"]) + sum(words(n["he"]) for n in s["notes_he"])
        ew = words(b) + sum(words(n.get(L, "")) for n in t.get(f"notes_{L}", []))
        lo, hi = RATIO[L]
        if hw > 40 and not (lo <= ew / hw <= hi): errs.append(f"{s['slug']}: length ratio {ew / hw:.2f} ({L} {ew} / he {hw} words) — check for omissions or padding")
        for n in t.get(f"notes_{L}", []):
            hnote = next((x for x in s["notes_he"] if x["n"] == n.get("n")), None)
            if hnote and words(hnote["he"]) > 25 and words(n.get(L, "")) < 0.9 * words(hnote["he"]):
                errs.append(f"{s['slug']}: note {n.get('n')} looks shortened")
        txt = b + " ".join(n.get(L, "") for n in t.get(f"notes_{L}", []))
        heb = len(HEB.findall(txt))
        if heb > 40: errs.append(f"{s['slug']}: {heb} Hebrew letters left in the translation")
        tags = set(re.findall(r"<\s*([a-zA-Z0-9]+)", b)) - ALLOWED
        if tags: errs.append(f"{s['slug']}: disallowed tags {sorted(tags)}")
    extra = set(es) - {s["slug"] for s in he["sections"]}
    if extra: errs.append(f"{cid}: unexpected sections {sorted(extra)}")
    return errs

if __name__ == "__main__":
    ids = sys.argv[1:]
    if ids[:1] == ["--lang"]: L, ids = ids[1], ids[2:]
    if ids == ["all"]: ids = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(HERE, L, "*.json")))
    bad = 0
    for cid in ids:
        e = check(cid)
        print(f"{cid}: {'OK' if not e else str(len(e)) + ' problem(s)'}")
        for x in e: print("  -", x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
