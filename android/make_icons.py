"""Draws the Pearls icon, "glint A": a flat bone pearl with one quarter-arc glint, on night.

Geometry, in a 100-unit square around the pearl: the disc has radius 50; the glint is a ring segment
(outer radius 36, inner 26) from 9 o'clock to 12 o'clock, cut out of the disc. The same shape is used for
the Android adaptive and themed icons (res/drawable/ic_launcher_fg.xml) and the notification icon (ic_stat.xml).

usage: python3 android/make_icons.py            (writes every target below)
"""
import json, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
NIGHT = (18, 17, 15, 255)      # #12110F
BONE = (239, 231, 216, 255)    # #EFE7D8
SS = 4                         # supersampling

def glyph(d, cx, cy, size, fg, bg):
    """pearl of diameter `size` centred at (cx, cy) on ImageDraw d; the glint is painted in bg"""
    k = size / 100.0
    x0, y0 = cx - 50 * k, cy - 50 * k
    d.ellipse([x0, y0, x0 + 100 * k, y0 + 100 * k], fill=fg)
    o, i = 36 * k, 26 * k
    d.pieslice([cx - o, cy - o, cx + o, cy + o], 180, 270, fill=bg)
    d.pieslice([cx - i, cy - i, cx + i, cy + i], 180, 270, fill=fg)

def icon(px, shape="rounded", scale=0.5, fg=BONE, bg=NIGHT, inset=0.0, radius=0.22):
    """shape: "rounded" (launcher, web), "square" (Play Store, iOS: the store/OS applies its own mask),
    "mac" (macOS: rounded body inset on a transparent canvas)"""
    S = px * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    a, b = S * inset, S * (1 - inset)
    if shape == "square": d.rectangle([0, 0, S, S], fill=bg)
    else: d.rounded_rectangle([a, a, b, b], radius=(b - a) * radius, fill=bg)
    glyph(d, S / 2, S / 2, (b - a) * scale, fg, bg)
    return img.resize((px, px), Image.LANCZOS)

PATH = ("M0,50 A50,50 0 1,1 100,50 A50,50 0 1,1 0,50 Z "
        "M14,50 A36,36 0 0,1 50,14 L50,24 A26,26 0 0,0 24,50 Z")

def vector(viewport, translate, scale, color, comment):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!-- {comment} (made by android/make_icons.py) -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="{viewport}dp" android:height="{viewport}dp" android:viewportWidth="{viewport}" android:viewportHeight="{viewport}">
    <group android:translateX="{translate}" android:translateY="{translate}" android:scaleX="{scale}" android:scaleY="{scale}">
        <path android:fillColor="{color}" android:fillType="evenOdd" android:pathData="{PATH}" />
    </group>
</vector>
"""

def main():
    res = os.path.join(HERE, "res")
    for name, px in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        p = os.path.join(res, f"mipmap-{name}"); os.makedirs(p, exist_ok=True)
        icon(px).save(os.path.join(p, "ic_launcher.png"))
    # adaptive icon (Android 8+): night background, pearl foreground; the same shape as the themed (monochrome) layer
    os.makedirs(os.path.join(res, "drawable"), exist_ok=True)
    os.makedirs(os.path.join(res, "mipmap-anydpi-v26"), exist_ok=True)
    # 108dp canvas, about 72dp visible after masking: a 36dp pearl, like the 50% pearl in the PNGs
    open(os.path.join(res, "drawable", "ic_launcher_fg.xml"), "w").write(
        vector(108, 36, 0.36, "#FFEFE7D8", "Launcher foreground and themed-icon layer: the pearl, glint A"))
    open(os.path.join(res, "drawable", "ic_stat.xml"), "w").write(
        vector(24, 2, 0.20, "#FFFFFFFF", "Notification icon: the pearl, glint A, white on transparent"))
    open(os.path.join(res, "mipmap-anydpi-v26", "ic_launcher.xml"), "w").write("""<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/icon_bg" />
    <foreground android:drawable="@drawable/ic_launcher_fg" />
    <monochrome android:drawable="@drawable/ic_launcher_fg" />
</adaptive-icon>
""")
    # web app (favicon, manifest, lock-screen artwork)
    www = os.path.join(ROOT, "www")
    for px in (192, 512): icon(px).save(os.path.join(www, f"icon-{px}.png"))
    # Google Play: 512x512, full-bleed square (Play rounds the corners itself)
    icon(512, "square").save(os.path.join(ROOT, "store", "play-icon-512.png"))
    # Apple: iOS 1024 full square; macOS sizes as a rounded body on transparent (Apple's 824/1024 grid)
    apple = os.path.join(ROOT, "apple", "Pearls", "Assets.xcassets", "AppIcon.appiconset")
    for im in json.load(open(os.path.join(apple, "Contents.json")))["images"]:
        fn = im.get("filename")
        if not fn: continue
        pts = int(im["size"].split("x")[0]); px = pts * int(im.get("scale", "1x")[0])
        out = icon(px, "square") if im.get("platform") == "ios" else icon(px, "mac", inset=100 / 1024, radius=0.225)
        out.save(os.path.join(apple, fn))
    print("icons ok")

if __name__ == "__main__":
    main()
