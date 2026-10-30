"""Adds the transliteration letters the bundled Latin web fonts lack, so a word like "Ḥanukka" or "ĥametz" is drawn in
one typeface instead of borrowing ḥ from a fallback font (the "weird dotted letters").

For every Latin face in www/fonts/web/fonts.css it adds, when the face has neither the letter nor a latin-ext file with
it, a composite glyph built from the font's own parts:
  ḥ Ḥ ḳ Ḳ  = h H k K + the font's period, scaled, centred under the letter
  ĥ Ĥ      = h H + the font's circumflex, raised above the letter
  ʿ ʾ      = the font's ‘ ’ (same glyph, extra cmap entries)
  ½ ¼ ¾    = the font's figures, small, around its fraction slash
Variable fonts get matching gvar deltas (the dot follows the letter's width at every weight) and HVAR entries.
Then it widens the face's unicode-range in fonts.css. Idempotent; run after fetch_webfonts.py.
Check with: python3 test_fonts.py"""
import os, re
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.ttLib.tables.TupleVariation import TupleVariation

HERE = os.path.dirname(os.path.abspath(__file__)); WEB = os.path.join(HERE, "www", "fonts", "web")
BELOW = {0x1E25: 0x68, 0x1E24: 0x48, 0x1E33: 0x6B, 0x1E32: 0x4B}
ABOVE = {0x125: 0x68, 0x124: 0x48}
ALIAS = {0x2BF: 0x2018, 0x2BE: 0x2019}
FRAC = {0xBD: (0x31, 0x32), 0xBC: (0x31, 0x34), 0xBE: (0x33, 0x34)}   # ½ ¼ ¾ = small figures around a slash
ALL = sorted(set(BELOW) | set(ABOVE) | set(ALIAS) | set(FRAC))

def in_range(cp, rng):
    for part in rng.split(","):
        part = part.strip().replace("U+", "")
        a, _, b = part.partition("-")
        if int(a, 16) <= cp <= int(b or a, 16): return True
    return False

def bounds(font, name):
    g = font["glyf"][name]; g.recalcBounds(font["glyf"])
    return (g.xMin, g.yMin, g.xMax, g.yMax) if hasattr(g, "xMin") else (0, 0, 0, 0)

def adv_delta(tv):  # change of advance width in a gvar tuple (phantom point 2 minus phantom point 1)
    c = tv.coordinates
    p0, p1 = c[-4] or (0, 0), c[-3] or (0, 0)
    return p1[0] - p0[0]

def patch(path, want):
    f = TTFont(path); cm = f.getBestCmap(); upm = f["head"].unitsPerEm
    glyf, hmtx = f["glyf"], f["hmtx"]
    gvar = f["gvar"] if "gvar" in f else None
    hvar = f["HVAR"].table if "HVAR" in f else None
    order = list(f.getGlyphOrder()); added = []
    if hvar is not None and hvar.AdvWidthMap is None:   # implicit glyph-id mapping: make it explicit before adding glyphs
        from fontTools.ttLib.tables.otTables import VarIdxMap
        hvar.AdvWidthMap = VarIdxMap(); hvar.AdvWidthMap.mapping = {g: i for i, g in enumerate(order)}
    xh = getattr(f["OS/2"], "sxHeight", 0) or bounds(f, cm[0x78])[3]
    for cp in want:
        if cp in cm: continue
        if cp in ALIAS:
            if ALIAS[cp] in cm:
                for t in f["cmap"].tables:
                    if t.isUnicode(): t.cmap[cp] = cm[ALIAS[cp]]
                added.append(cp)
            continue
        if cp in FRAC:
            n, d = FRAC[cp]; sl = 0x2044 if 0x2044 in cm else 0x2F
            if n not in cm or d not in cm or sl not in cm: continue
            k = 0.55; wn, wd, ws = hmtx[cm[n]][0], hmtx[cm[d]][0], hmtx[cm[sl]][0]
            cap = getattr(f["OS/2"], "sCapHeight", 0) or bounds(f, cm[0x48])[3]
            adv = round(k * wn + 0.4 * ws + k * wd)
            parts = [(cm[n], 0, round(cap * 0.45), k), (cm[sl], round(k * wn - 0.3 * ws), 0, 1.0), (cm[d], adv - round(k * wd), 0, k)]
            name = f"uni{cp:04X}"; g = Glyph(); g.numberOfContours = -1; g.components = []
            for gn, x, y, sc in parts:
                c = GlyphComponent(); c.glyphName, c.x, c.y, c.flags = gn, x, y, 0x0004
                if sc != 1.0: c.transform = [[sc, 0], [0, sc]]
                g.components.append(c)
            glyf[name] = g; hmtx[name] = (adv, round(k * bounds(f, cm[n])[0])); order.append(name)
            if gvar is not None: gvar.variations[name] = []
            if hvar is not None:
                for m in ("AdvWidthMap", "LsbMap", "RsbMap"):
                    mp = getattr(hvar, m, None)
                    if mp is not None and cm[0x30] in mp.mapping: mp.mapping[name] = mp.mapping[cm[0x30]]
            for t in f["cmap"].tables:
                if t.isUnicode(): t.cmap[cp] = name
            added.append(cp); continue
        base_cp = BELOW.get(cp) or ABOVE.get(cp); mark_cp = 0x2E if cp in BELOW else 0x2C6
        if base_cp not in cm or mark_cp not in cm: continue
        base, mark = cm[base_cp], cm[mark_cp]
        bx0, by0, bx1, by1 = bounds(f, base); mx0, my0, mx1, my1 = bounds(f, mark)
        if cp in BELOW:
            s = 0.85
            dx = round((bx0 + bx1) / 2 - s * (mx0 + mx1) / 2)
            dy = round(-0.07 * upm - s * my1)
        else:
            s = 1.0
            dx = round((bx0 + bx1) / 2 - (mx0 + mx1) / 2)
            gap = max(my0 - xh, 0.04 * upm)          # the circumflex's own distance above the x-height
            dy = round(by1 + gap - my0)
        ang = getattr(f["post"], "italicAngle", 0) or 0   # italics: the letter's centre moves right as it rises
        if ang:
            import math
            t = math.tan(math.radians(-ang)); mid = (by0 + by1) / 2
            my = dy + s * (my0 + my1) / 2
            dx = round(dx + t * (my - mid))
        name = f"uni{cp:04X}"
        g = Glyph(); g.numberOfContours = -1; g.components = []
        c0 = GlyphComponent(); c0.glyphName, c0.x, c0.y, c0.flags = base, 0, 0, 0x0204   # USE_MY_METRICS | ROUND_XY_TO_GRID
        c1 = GlyphComponent(); c1.glyphName, c1.x, c1.y, c1.flags = mark, dx, dy, 0x0004
        if s != 1.0: c1.transform = [[s, 0], [0, s]]
        g.components = [c0, c1]
        glyf[name] = g; hmtx[name] = hmtx[base]; order.append(name)
        if gvar is not None:
            tvs = []
            for tv in gvar.variations.get(base, []):   # the letter widens: the composite's metrics follow, the dot re-centres
                da = adv_delta(tv); ph = list(tv.coordinates[-4:])
                tvs.append(TupleVariation(dict(tv.axes), [(0, 0), (round(da / 2), 0)] + [p or (0, 0) for p in ph]))
            for tv in gvar.variations.get(mark, []):   # the mark widens: shift back by half
                da = adv_delta(tv)
                if da: tvs.append(TupleVariation(dict(tv.axes), [(0, 0), (round(-s * da / 2), 0), (0, 0), (0, 0), (0, 0), (0, 0)]))
            gvar.variations[name] = tvs
        if hvar is not None:
            for m in ("AdvWidthMap", "LsbMap", "RsbMap"):
                mp = getattr(hvar, m, None)
                if mp is not None and base in mp.mapping: mp.mapping[name] = mp.mapping[base]
        for t in f["cmap"].tables:
            if t.isUnicode(): t.cmap[cp] = name
        added.append(cp)
    if added:
        f.setGlyphOrder(order)
        if "post" in f and f["post"].formatType == 2.0: f["post"].extraNames = []
        f.flavor = "woff2"; f.save(path)
    return added

def main():
    css_path = os.path.join(WEB, "fonts.css"); css = open(css_path).read()
    blocks = re.findall(r"@font-face\s*\{[^}]*\}", css)
    faces = {}
    for b in blocks:
        fam = re.search(r"font-family: '([^']+)'", b).group(1); st = re.search(r"font-style: (\w+)", b).group(1)
        fn = re.search(r"url\(([^)]+)\)", b).group(1); rng = re.search(r"unicode-range: ([^;]+);", b).group(1)
        faces.setdefault((fam, st), []).append((b, fn, rng))
    report = []
    for (fam, st), lst in sorted(faces.items()):
        latin = [x for x in lst if re.search(r"-latin-(?!ext)", x[1])]
        if not latin: continue
        b, fn, rng = latin[0]
        have = set()
        for _, ofn, orng in lst:
            if ofn == fn or "hebrew" in ofn: continue
            ocm = TTFont(os.path.join(WEB, ofn)).getBestCmap()
            have |= {cp for cp in ALL if cp in ocm and in_range(cp, orng)}
        want = [cp for cp in ALL if cp not in have]
        added = patch(os.path.join(WEB, fn), want)
        cm = TTFont(os.path.join(WEB, fn)).getBestCmap()
        extra = [cp for cp in want if cp in cm and not in_range(cp, rng)]
        if extra:
            nb = b.replace(rng, rng + "," + ",".join(f"U+{cp:04X}" for cp in extra)); css = css.replace(b, nb)
        if added: report.append(f"{fam} {st}: +{''.join(chr(c) for c in added)}")
    open(css_path, "w").write(css)
    print("\n".join(report) or "nothing to add")

if __name__ == "__main__":
    main()
