"""The flat rule: no skin may fake depth.

Every skin is drawn with flat colour. A gradient that blends one colour into another, or a shadow or filter with a
blur, makes a surface look lit or raised, and that "fake 3D" look is what the flat skins replaced.

Allowed, because they stay flat:
  - a gradient whose colours meet at hard stops (stripes, a split swatch, a progress track);
  - a shadow with no blur (Brutal's hard offset, a focus ring drawn with spread).

Run: python3 test_flat.py   (must end "flat: no soft gradients or blurs")
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
ART = os.path.join(WWW, "art")
FILES = ["app.css", "skins.css", "modes.css", "app.js", "index.html"] + \
        (["art/" + f for f in sorted(os.listdir(ART)) if f.endswith(".svg")] if os.path.isdir(ART) else [])


def split_top(s, sep=","):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
    out.append(cur)
    return [x.strip() for x in out]


def tokens(stop):
    return split_top(stop.strip(), " ")


def args_of(src, start):
    """src[start] is '(' ; return the text inside the matching parens."""
    depth = 0
    for i in range(start, len(src)):
        if src[i] == "(":
            depth += 1
        elif src[i] == ")":
            depth -= 1
            if depth == 0:
                return src[start + 1:i]
    return src[start + 1:]


DIRECTION = re.compile(r"^(to |from |at |circle|ellipse|closest|farthest|-?[\d.]+(deg|turn|rad|grad)\b|[\d.]+%)")


def hard_stops(inner):
    parts = split_top(inner)
    if parts and DIRECTION.match(parts[0]):
        parts = parts[1:]
    seq = []
    for p in parts:
        t = [x for x in tokens(p) if x]
        if not t:
            continue
        color, pos = t[0], t[1:]
        if not pos:
            return False          # a stop with no position blends into its neighbour
        for q in pos:
            seq.append((color, q))
    for (c1, p1), (c2, p2) in zip(seq, seq[1:]):
        if c1 != c2 and p1 != p2:
            return False
    return True


LENGTH = re.compile(r"^-?[\d.]+(px|em|rem|%)?$")


def soft_shadow(value):
    v = value.strip().rstrip(";").replace("!important", "").strip()
    if v in ("none", "", "inherit", "initial", "unset") or v.startswith("var("):
        return False
    for sh in split_top(v):
        nums = [x for x in tokens(sh) if LENGTH.match(x)]
        if len(nums) >= 3 and float(re.match(r"-?[\d.]+", nums[2]).group()) > 0:
            return True
    return False


SHADOW_DECL = re.compile(r"(box-shadow|text-shadow|--[\w-]*shadow|--glow)\s*:\s*([^;}\"]+)")
BLUR = re.compile(r"\b(blur|drop-shadow)\(")


def main():
    bad = []
    for name in FILES:
        path = os.path.join(WWW, name)
        if not os.path.exists(path):
            continue
        src = open(path, encoding="utf-8").read()
        for m in re.finditer(r"(repeating-)?(linear|radial|conic)-gradient\(", src):
            inner = args_of(src, m.end() - 1)
            if "${" in inner:          # built in app.js from data; checked by its shape below
                inner = re.sub(r"\$\{[^}]*\}", "c", inner)
            if m.group(2) == "conic" or not hard_stops(inner):
                line = src.count("\n", 0, m.start()) + 1
                bad.append(f"{name}:{line}: soft gradient: {m.group(0)}{inner[:60]}…)")
        for m in SHADOW_DECL.finditer(src):
            if soft_shadow(m.group(2)):
                line = src.count("\n", 0, m.start()) + 1
                bad.append(f"{name}:{line}: blurred shadow: {m.group(0)[:80]}")
        for m in BLUR.finditer(src):
            line = src.count("\n", 0, m.start()) + 1
            bad.append(f"{name}:{line}: blur filter: {src[m.start():m.start()+40]}")
    for b in bad:
        print(b)
    if bad:
        print(f"flat: {len(bad)} problems")
        sys.exit(1)
    print("flat: no soft gradients or blurs")


if __name__ == "__main__":
    main()
