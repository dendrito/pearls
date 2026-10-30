"""Bundle the app's Latin web fonts (previously loaded from fonts.googleapis.com) so the app looks the same offline.
Takes the same Google Fonts files from Fontsource on npm, keeps the latin, latin-ext and hebrew subsets, and writes
www/fonts/web/*.woff2 + www/fonts/web/fonts.css with the family names app.css uses. Needs npm. Fonts: SIL OFL 1.1."""
import glob, os, re, shutil, subprocess, sys, tarfile, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "www", "fonts", "web")
FONTS = [  # (npm package, css files, family name used in app.css)
    ("@fontsource/instrument-serif", ["400.css", "400-italic.css"], "Instrument Serif"),
    ("@fontsource-variable/figtree", ["wght.css"], "Figtree"),
    ("@fontsource-variable/frank-ruhl-libre", ["wght.css"], "Frank Ruhl Libre"),
    ("@fontsource-variable/geist", ["wght.css"], "Geist"),
    ("@fontsource-variable/geist-mono", ["wght.css"], "Geist Mono"),
    ("@fontsource-variable/cormorant-garamond", ["wght.css", "wght-italic.css"], "Cormorant Garamond"),
    ("@fontsource-variable/eb-garamond", ["wght.css", "wght-italic.css"], "EB Garamond"),
    ("@fontsource-variable/syne", ["wght.css"], "Syne"),
    ("@fontsource-variable/space-grotesk", ["wght.css"], "Space Grotesk"),
    ("@fontsource-variable/jetbrains-mono", ["wght.css"], "JetBrains Mono"),
    ("@fontsource-variable/newsreader", ["standard.css", "standard-italic.css"], "Newsreader"),
    ("@fontsource-variable/ibm-plex-sans", ["wght.css"], "IBM Plex Sans"),
    ("@fontsource/atkinson-hyperlegible", ["400.css", "700.css", "400-italic.css"], "Atkinson Hyperlegible"),
    # skins added in 2.1: Nacre, Folio, Sunlit, Ner
    ("@fontsource/bellefair", ["400.css"], "Bellefair"),
    ("@fontsource-variable/instrument-sans", ["wght.css", "index.css"], "Instrument Sans"),
    ("@fontsource-variable/inter-tight", ["wght.css", "index.css"], "Inter Tight"),
    ("@fontsource-variable/rubik", ["wght.css", "index.css"], "Rubik"),
    ("@fontsource-variable/bricolage-grotesque", ["wght.css", "index.css"], "Bricolage Grotesque"),
    ("@fontsource/suez-one", ["400.css"], "Suez One"),
    ("@fontsource-variable/assistant", ["wght.css", "index.css"], "Assistant"),
]
KEEP = re.compile(r"-(latin|latin-ext|hebrew)-")
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
css_out, total = [], 0
with tempfile.TemporaryDirectory() as tmp:
    for pkg, files, family in FONTS:
        tgz = subprocess.run(["npm", "pack", pkg, "--silent"], cwd=tmp, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
        d = os.path.join(tmp, tgz[:-4]); tarfile.open(os.path.join(tmp, tgz)).extractall(d, filter="data")
        if "index.css" in files:                      # variable packages: use the first CSS that exists
            files = [next(f for f in files if os.path.exists(os.path.join(d, "package", f)))]
        for cf in files:
            css = open(os.path.join(d, "package", cf)).read()
            for block in re.findall(r"@font-face\s*\{[^}]*\}", css):
                m = re.search(r"url\(\./files/([^)]+\.woff2)\)", block)
                if not m or not KEEP.search(m.group(1)): continue
                shutil.copy(os.path.join(d, "package", "files", m.group(1)), OUT); total += os.path.getsize(os.path.join(OUT, m.group(1)))
                block = re.sub(r"font-family:\s*'[^']+'", f"font-family: '{family}'", block)
                block = re.sub(r"src:[^;]+;", f"src: url({m.group(1)}) format('woff2');", block)
                css_out.append(block)
open(os.path.join(OUT, "fonts.css"), "w").write("/* Bundled from Fontsource (Google Fonts, SIL OFL 1.1) by fetch_webfonts.py */\n" + "\n".join(css_out) + "\n")
print(f"{len(css_out)} faces, {len(glob.glob(os.path.join(OUT, '*.woff2')))} files, {total // 1024} KB")
