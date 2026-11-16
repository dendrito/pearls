"""Make a stand-in for Peninei Halakha's yearly study bookmark, for test_daily.py.

It is laid out like the real one ("סימניית הלימוד", two pages: a week per row, Sunday on the right, the civil date
in each cell with the day's reference under it, the book's name set vertically in the right margin) and stored like
it (Type0 Identity-H fonts with a ToUnicode map, Flate-compressed pages, Hebrew in drawing order), so pdf-text.js
and daily-pearl.js read it the way they read the real thing. The schedule is made up: two halakhot a day through
real chapters of Pearls' catalogue. The real bookmark isn't copied into the repository.

    python3 make_test_bookmark.py OUT.pdf START_ISO DAYS   -> prints the token string the app should derive
"""
import datetime, json, subprocess, sys, zlib

HEB = "אבגדהוזחטיכלמנסעפצקרשת"
VALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400]

def gem(n):   # 15 -> טו, 16 -> טז
    out = ""
    for v, c in sorted(zip(VALS, HEB), reverse=True):
        while n >= v:
            if n in (15, 16): return out + ("טו" if n == 15 else "טז")
            out += c; n -= v
    return out

def catalogue():
    js = 'global.window={};require("./www/catalog.js");require("./www/catalog_he.js");require("./www/data.js");' \
         'const o={};for(const c of [window.PH_CATALOG,window.PH_CATALOG_HE])for(const v of c.volumes)for(const ch of v.chapters)' \
         'if(ch.n>0)(o[v.book]=o[v.book]||{})[ch.n]=ch.sections;' \
         'const he={};for(const k in window.PH_META)he[k]=window.PH_META[k].heb;console.log(JSON.stringify({o,he}))'
    return json.loads(subprocess.check_output(["node", "-e", js]))

def schedule(days, books=("11", "01", "02", "04", "05")):
    """[(cell text in reading order, token)] two halakhot a day, the books one after another."""
    cat = catalogue(); secs, he = cat["o"], cat["he"]
    plan = []; bi = 0; book = books[0]; ch = 1; h = 1; first = True; label_at = [(0, he[book])]
    for d in range(days):
        n = secs[book][str(ch)]
        if h > n:   # the next chapter, or the next book
            ch += 1; h = 1
            if str(ch) not in secs[book]:
                bi += 1; book = books[bi]; ch = 1; first = True; label_at.append((d, he[book]))
            n = secs[book][str(ch)]
        pre = book + ":" if first else ""; first = False
        if h + 1 <= n:
            plan.append((f"{gem(ch)} | {gem(h)}-{gem(h + 1)}", f"{pre}{ch}.{h}-{h + 1}")); h += 2
        elif str(ch + 1) in secs[book]:
            plan.append((f"{gem(ch)} | {gem(h)} – {gem(ch + 1)} | א", f"{pre}{ch}.{h}-{ch + 1}.1")); ch += 1; h = 2
        else:
            plan.append((f"{gem(ch)} | {gem(h)}", f"{pre}{ch}.{h}")); h += 1
    return plan, label_at

class Font:
    def __init__(self): self.cids = {}
    def enc(self, s):
        out = b""
        for c in s:
            if c not in self.cids: self.cids[c] = len(self.cids) + 1
            out += self.cids[c].to_bytes(2, "big")
        return out
    def tounicode(self):
        lines = [f"<{cid:04X}> <{ord(c):04X}>" for c, cid in self.cids.items()]
        body = "\n".join(f"{len(lines[i:i + 100])} beginbfchar\n" + "\n".join(lines[i:i + 100]) + "\nendbfchar" for i in range(0, len(lines), 100))
        return ("/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Pearls def\n"
                "1 begincodespacerange <0000> <FFFF> endcodespacerange\n" + body + "\nendcmap end end").encode()

def visual(s):   # how a PDF stores Hebrew: in the order it's drawn, left to right
    return s[::-1] if any("א" <= c <= "ת" for c in s) else s

def make(path, start, days):
    plan, labels = schedule(days)
    f = Font(); W = 5.0   # every glyph 500/1000 em at size 10
    COLS = [215.5 - 29.25 * k for k in range(7)]   # cell centres, Sunday .. Shabbat
    d0 = datetime.date.fromisoformat(start)
    pages = [[]]; y = 60; day = 0
    names = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
    weekday = (d0.weekday() + 1) % 7   # 0 = Sunday
    label_days = dict(labels)
    while day < days:
        if y > 700: pages.append([]); y = 60
        ops = pages[-1]
        if y == 60:   # the day names over each page's grid
            for k, nm in enumerate(names):
                ops.append(f"BT /F1 6 Tf 1 0 0 1 {COLS[k] - len(nm) * 1.5:.2f} {792 - 45} Tm <{f.enc(visual(nm)).hex()}> Tj ET")
        for col in range(weekday, 7):
            if day >= days: break
            dt = d0 + datetime.timedelta(days=day)
            ops.append(f"BT /F1 6 Tf 1 0 0 1 {COLS[col] - 13:.2f} {792 - y} Tm <{f.enc(str(dt.day)).hex()}> Tj ET")
            text = visual(plan[day][0])
            w = len(text) * 0.5 * 6
            ops.append(f"BT /F1 6 Tf 1 0 0 1 {COLS[col] - w / 2:.2f} {792 - y - 8} Tm <{f.enc(text).hex()}> Tj ET")
            if day in label_days:
                ops.append(f"BT /F1 9 Tf 0 1 -1 0 240.4 {792 - y - 4} Tm <{f.enc(visual(label_days[day])).hex()}> Tj ET")
            day += 1
        weekday = 0; y += 21
    objs = []
    def add(b): objs.append(b); return len(objs)
    cmap = zlib.compress(f.tounicode())
    tu = add(b"<</Length %d/Filter/FlateDecode>>stream\n" % len(cmap) + cmap + b"\nendstream")
    cid = add(b"<</Type/Font/Subtype/CIDFontType2/BaseFont/PearlsTest/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/DW 500>>")
    font = add(b"<</Type/Font/Subtype/Type0/BaseFont/PearlsTest/Encoding/Identity-H/DescendantFonts[%d 0 R]/ToUnicode %d 0 R>>" % (cid, tu))
    pages_id = len(objs) + 1 + 2 * len(pages)
    kids = []
    for ops in pages:
        data = zlib.compress("\n".join(ops).encode())
        c = add(b"<</Length %d/Filter/FlateDecode>>stream\n" % len(data) + data + b"\nendstream")
        kids.append(add(b"<</Type/Page/Parent %d 0 R/MediaBox[0 0 252 792]/Resources<</Font<</F1 %d 0 R>>>>/Contents %d 0 R>>" % (pages_id, font, c)))
    assert add(b"<</Type/Pages/Kids[%s]/Count %d>>" % (b" ".join(b"%d 0 R" % k for k in kids), len(kids))) == pages_id
    root = add(b"<</Type/Catalog/Pages %d 0 R>>" % pages_id)
    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; offs = []
    for i, o in enumerate(objs, 1): offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<</Size %d/Root %d 0 R>>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, root, x)
    open(path, "wb").write(out)
    return " ".join(t for _, t in plan)

if __name__ == "__main__":
    print(make(sys.argv[1], sys.argv[2], int(sys.argv[3])))
