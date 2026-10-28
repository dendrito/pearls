"""Draws the Pearls launcher icon: a lit pearl on deep ink, with a thin gold ring."""
import math, os, sys
from PIL import Image, ImageDraw, ImageFilter

def pearl(size):
    S = size * 4  # supersample
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(S * 0.22)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=(11, 15, 26, 255))
    # soft indigo glow behind the pearl
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([S*0.16, S*0.16, S*0.84, S*0.84], fill=(98, 84, 214, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.09))
    img.alpha_composite(glow)
    # pearl body: radial shading ivory -> warm gold
    cx, cy, R = S * 0.5, S * 0.5, S * 0.27
    body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    px = body.load()
    lx, ly = cx - R * 0.38, cy - R * 0.42
    for y in range(int(cy - R) - 1, int(cy + R) + 2):
        for x in range(int(cx - R) - 1, int(cx + R) + 2):
            dist = math.hypot(x - cx, y - cy)
            if dist <= R:
                t = min(1.0, math.hypot(x - lx, y - ly) / (R * 1.55))
                c0, c1 = (255, 250, 238), (196, 146, 62)
                col = tuple(int(c0[i] + (c1[i] - c0[i]) * (t ** 1.25)) for i in range(3))
                edge = max(0.0, min(1.0, (R - dist) / 2.5))
                px[x, y] = col + (int(255 * edge),)
    img.alpha_composite(body)
    # specular highlight
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.ellipse([lx - R*0.22, ly - R*0.16, lx + R*0.22, ly + R*0.16], fill=(255, 255, 255, 210))
    hl = hl.filter(ImageFilter.GaussianBlur(S * 0.012))
    img.alpha_composite(hl)
    # thin gold orbit ring
    d2 = ImageDraw.Draw(img)
    w = max(2, int(S * 0.012))
    d2.ellipse([S*0.15, S*0.15, S*0.85, S*0.85], outline=(226, 182, 92, 200), width=w)
    return img.resize((size, size), Image.LANCZOS)

if __name__ == "__main__":
    res = sys.argv[1]; web = sys.argv[2]
    for name, px in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        p = os.path.join(res, f"mipmap-{name}"); os.makedirs(p, exist_ok=True)
        pearl(px).save(os.path.join(p, "ic_launcher.png"))
    os.makedirs(web, exist_ok=True)
    for px in (192, 512):
        pearl(px).save(os.path.join(web, f"icon-{px}.png"))
    print("icons ok")
