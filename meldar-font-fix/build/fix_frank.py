"""Rebuild OpenType layout for Meldar's FrankRuhlLibre-Taamim.ttf.

Meldar's file = Frank Ruhl Libre v6.004 (identical Hebrew outlines) + 30 te'amim glyphs, but the
GDEF/GSUB/GPOS tables were lost when the te'amim were added, so browsers fall back to guessing
mark positions. This script:
  1. takes the upstream v6.004 anchors, kerning, ligatures and GDEF (dumped to .fea),
  2. adds anchors for the te'amim (+ meteg, upper/lower dot) by their Unicode position,
  3. places below-te'amim and meteg beside (left of) a below-vowel instead of on top of it,
  4. compiles it all into the same file name.
usage: python3 -I fix_frank.py meldar.ttf upstream-hebrew.woff2 out.ttf out.fea
"""
import sys, unicodedata
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.boundsPen import BoundsPen

src, up_path, out, fea_out = sys.argv[1:5]
m = TTFont(src); u = TTFont(up_path)
cm = m.getBestCmap(); gs = m.getGlyphSet()

# 1. copy the two ligature glyphs upstream's ccmp needs (final kaf + sheva / qamats)
for g in ("uniFB3A05B0", "uniFB3A05B8"):
    if g not in m.getGlyphOrder():
        ug = u['glyf'][g]
        if ug.isComposite():
            ug.expand(u['glyf'])
        m.setGlyphOrder(m.getGlyphOrder() + [g])
        m['glyf'].glyphs[g] = ug
        m['hmtx'].metrics[g] = u['hmtx'][g]
        m['glyf'].glyphOrder = m.getGlyphOrder()
m['maxp'].numGlyphs = len(m.getGlyphOrder())
if 'post' in m and m['post'].formatType == 2:
    m['post'].extraNames = []; m['post'].mapping = {}
gs = m.getGlyphSet()

def bb(g):
    p = BoundsPen(gs); gs[g].draw(p); return p.bounds or (0, 0, 0, 0)

A = lambda a: f"<anchor {int(round(a[0]))} {int(round(a[1]))}>" if a else "<anchor NULL>"
GPOS = u['GPOS'].table
fea = []

# ---- upstream mark-to-base (lookup 2) ----
mb = GPOS.LookupList.Lookup[2].SubTable[0]
up_marks = {g: (r.Class, (r.MarkAnchor.XCoordinate, r.MarkAnchor.YCoordinate))
            for g, r in zip(mb.MarkCoverage.glyphs, mb.MarkArray.MarkRecord)}
up_bases = {g: [(a.XCoordinate, a.YCoordinate) if a else None for a in r.BaseAnchor]
            for g, r in zip(mb.BaseCoverage.glyphs, mb.BaseArray.BaseRecord)}
NC = mb.ClassCount

# ---- te'amim and extra marks ----
TOPL_OVR = {0x0599, 0x05A9}     # pashta, telisha qetana: upper-left corner
TOPR_OVR = {0x05A0}             # telisha gedola: upper-right corner
groups = {"TC": [], "TL": [], "TR": [], "BC": [], "BR": []}
for c in list(range(0x0591, 0x05B0)) + [0x05BD, 0x05C4, 0x05C5]:
    g = cm.get(c)
    if not g: continue
    ccc = unicodedata.combining(chr(c))
    if c in TOPL_OVR or ccc == 228: k = "TL"
    elif c in TOPR_OVR or ccc == 232: k = "TR"
    elif ccc == 222: k = "BR"
    elif ccc in (220, 22): k = "BC"
    else: k = "TC"
    groups[k].append(g)
TOP_GAP, BOT_GAP = 143, 74          # upstream: holam anchor y=468, ink from 611; vowels' ink ends 74 below anchor
def mark_anchor(g, k):
    x0, y0, x1, y1 = bb(g); cx = (x0 + x1) / 2
    return (cx, y0 - TOP_GAP) if k[0] == "T" else (cx, y1 + BOT_GAP)

# ---- bases: every Hebrew letter and presentation form ----
def heb_base(c):
    return (0x05D0 <= c <= 0x05EA) or (0x05F0 <= c <= 0x05F2) or (0xFB1D <= c <= 0xFB4F and c not in (0xFB1E, 0xFB29))
bases = sorted({cm[c] for c in cm if heb_base(c)} | {"uniFB3A05B0", "uniFB3A05B8"} | set(g for g in up_bases if g in gs))
def letter_of(g):
    """plain letter glyph behind a presentation form, so dots/dagesh don't skew the bbox"""
    if g.startswith("uniFB3A05"): return cm[0x05DA]
    try: c = int(g[3:7], 16)
    except ValueError: return g
    while True:
        d = [x for x in unicodedata.decomposition(chr(c)).split() if not x.startswith("<")]
        if not d: break
        c = int(d[0], 16)
    return cm.get(c, g)
DESC = {cm[c] for c in (0x05DA, 0x05DF, 0x05E3, 0x05E5)}   # final letters with descenders
LAMED = cm[0x05DC]
def base_anchor(g, k):
    L = letter_of(g); x0, y0, x1, y1 = bb(L); cx = (x0 + x1) / 2
    if L == LAMED and k[0] == "T":            # keep marks clear of the ascender
        cx = x0 + (x1 - x0) * 0.35
    if k == "TC": return (cx, 468)
    if k == "TL": return (x0 + 15, 468)
    if k == "TR": return (x1 - 15, 468)
    if k == "BR": return (x1 - 25, min(0, y0) if L in DESC else 0)
    if k == "BC":
        if L in DESC: return (cx, y0)
        a = up_bases.get(g, [None] * NC)[1] or up_bases.get(L, [None] * NC)[1]
        return a or (cx, 0)

for k, gl in groups.items():
    for g in gl:
        fea.append(f"markClass {g} {A(mark_anchor(g, k))} @T_{k};")
for g, (cls, a) in up_marks.items():
    if g in gs: fea.append(f"markClass {g} {A(a)} @U{cls};")

lines = []
for g in bases:
    parts = []
    ua = up_bases.get(g) or up_bases.get(letter_of(g))
    for cls in range(NC):
        a = ua[cls] if ua else None
        if cls == 1 and a is None:     # vowels under letters upstream forgot (ן ץ ...)
            L = letter_of(g); x0, y0, x1, y1 = bb(L); a = ((x0 + x1) / 2, 0)
        if a: parts.append(f"{A(a)} mark @U{cls}")
    for k, gl in groups.items():
        if gl: parts.append(f"{A(base_anchor(g, k))} mark @T_{k}")
    lines.append(f"  pos base {g} " + " ".join(parts) + ";")
fea.append("lookup MARK_BASE {\n" + "\n".join(lines) + "\n} MARK_BASE;")

# ---- upstream mark-to-mark (lookup 3), with its filtering set ----
GDEF = u['GDEF'].table
sets = [c.glyphs for c in GDEF.MarkGlyphSetsDef.Coverage]
mm = GPOS.LookupList.Lookup[3].SubTable[0]
fea.append("lookup MKMK_UP {\n  lookupflag UseMarkFilteringSet [" + " ".join(sets[GPOS.LookupList.Lookup[3].MarkFilteringSet]) + "];")
for g, r in zip(mm.Mark1Coverage.glyphs, mm.Mark1Array.MarkRecord):
    fea.insert(0, f"markClass {g} {A((r.MarkAnchor.XCoordinate, r.MarkAnchor.YCoordinate))} @M{r.Class};")
for g, r in zip(mm.Mark2Coverage.glyphs, mm.Mark2Array.Mark2Record):
    fea.append(f"  pos mark {g} " + " ".join(f"{A((a.XCoordinate, a.YCoordinate))} mark @M{i}" for i, a in enumerate(r.Mark2Anchor) if a) + ";")
fea.append("} MKMK_UP;")

# ---- new: below te'amim / meteg sit LEFT of a below vowel (or of a previous below te'am) ----
BV = [g for g in (cm.get(c) for c in list(range(0x05B0, 0x05B9)) + [0x05BB, 0x05C7]) if g]
BT = groups["BC"]
SIDE = 40
for g in BT:
    x0, y0, x1, y1 = bb(g)
    fea.append(f"markClass {g} {A((x1, y1 + BOT_GAP))} @SIDE;")
fea.append("lookup MKMK_SIDE {\n  lookupflag UseMarkFilteringSet [" + " ".join(BV + BT) + "];")
for g in BV + BT:
    x0, y0, x1, y1 = bb(g)
    y = 0 if g in BV else y1 + BOT_GAP
    fea.append(f"  pos mark {g} {A((x0 - SIDE, y))} mark @SIDE;")
fea.append("} MKMK_SIDE;")

# ---- kerning (upstream lookups 0,1; IgnoreMarks) ----
for li in (0, 1):
    L = GPOS.LookupList.Lookup[li]
    fea.append(f"lookup KERN{li} {{\n  lookupflag IgnoreMarks;")
    for st in L.SubTable:
        if st.Format == 1:
            for g1, ps in zip(st.Coverage.glyphs, st.PairSet):
                for pr in ps.PairValueRecord:
                    v = getattr(pr.Value1, "XAdvance", 0) or 0
                    if v and g1 in gs and pr.SecondGlyph in gs: fea.append(f"  pos {g1} {pr.SecondGlyph} {v};")
        else:
            c1 = {}; c2 = {}
            for g in st.Coverage.glyphs: c1.setdefault(st.ClassDef1.classDefs.get(g, 0), []).append(g)
            for g, k in st.ClassDef2.classDefs.items(): c2.setdefault(k, []).append(g)
            for i, rec in enumerate(st.Class1Record):
                for j, r2 in enumerate(rec.Class2Record):
                    v = getattr(r2.Value1, "XAdvance", 0) or 0
                    a = [g for g in c1.get(i, []) if g in gs]; b = [g for g in c2.get(j, []) if g in gs]
                    if v and a and b and j != 0: fea.append(f"  pos [{' '.join(a)}] [{' '.join(b)}] {v};")
    fea.append(f"}} KERN{li};")

# ---- ligatures (upstream ccmp) ----
GSUB = u['GSUB'].table; mac = GDEF.MarkAttachClassDef.classDefs if GDEF.MarkAttachClassDef else {}
for i, L in enumerate(GSUB.LookupList.Lookup):
    flags = []
    if L.LookupFlag & 0x10: flags.append("UseMarkFilteringSet [" + " ".join(sets[L.MarkFilteringSet]) + "]")
    if L.LookupFlag & 0xFF00:
        cls = L.LookupFlag >> 8
        flags.append("MarkAttachmentType [" + " ".join(g for g, k in mac.items() if k == cls) + "]")
    fea.append(f"lookup LIGA{i} {{" + (f"\n  lookupflag {' '.join(flags)};" if flags else ""))
    for st in L.SubTable:
        for first, ligs in st.ligatures.items():
            for lg in ligs:
                fea.append(f"  sub {first} {' '.join(lg.Component)} by {lg.LigGlyph};")
    fea.append(f"}} LIGA{i};")

# ---- GDEF ----
gcd = GDEF.GlyphClassDef.classDefs
newmarks = [g for gl in groups.values() for g in gl]
cls = {1: set(bases), 2: set(), 3: set(newmarks)}
for g, k in gcd.items():
    if g in gs and k in (1, 2, 3): cls[k].add(g)
cls[1] -= cls[3] | cls[2]
fea.append("table GDEF {\n  GlyphClassDef [" + " ".join(sorted(cls[1])) + "], [" + " ".join(sorted(cls[2])) + "], ["
           + " ".join(sorted(cls[3])) + "], ;\n} GDEF;")

feat = ["languagesystem DFLT dflt;", "languagesystem hebr dflt;", "languagesystem latn dflt;"]
feat += [l for l in fea]
feat.append("feature ccmp {\n" + "\n".join(f"  lookup LIGA{i};" for i in range(len(GSUB.LookupList.Lookup))) + "\n} ccmp;")
feat.append("feature kern {\n  lookup KERN0;\n  lookup KERN1;\n} kern;")
feat.append("feature mark {\n  lookup MARK_BASE;\n} mark;")
feat.append("feature mkmk {\n  lookup MKMK_UP;\n  lookup MKMK_SIDE;\n} mkmk;")
text = "\n".join(feat) + "\n"
open(fea_out, "w").write(text)
addOpenTypeFeaturesFromString(m, text)
n = m['name']
n.setName(n.getDebugName(5) + "; layout rebuilt for te'amim (Meldar, 2026-10)", 5, 3, 1, 0x409)
m.save(out)
print("ok", out, {k: len(v) for k, v in groups.items()}, "bases", len(bases))
