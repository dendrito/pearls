# Meldar font fix (2026-10-28)

## What was wrong

I audited all 7 fonts that meldar.pages.dev serves (meldar-proto serves identical files) for OpenType mark positioning: the
`mark`/`mkmk` tables that put vowels and te'amim on the right letter.

| File | Before | Problem | Fix |
|---|---|---|---|
| KeterYG-Medium.ttf | v0.062, `kern` only | Nikud, dagesh and te'amim drift left of their letters | Replaced with Keter YG **v0.103yg** (Culmus, GPL+FE): same design, adds `mark`/`mkmk` |
| FrankRuhlLibre-Taamim.ttf | v6.004, **no GDEF/GSUB/GPOS at all** | Browser guesses mark positions, so te'amim pile onto vowels and final-kaf ligatures are missing | **Repaired in place**, keeping the same outlines (see below) |
| DeSolaGasterModern-Pointed, Noto Serif/Sans/Rashi Hebrew, Shofar | `mark`/`mkmk` present | Fine | No change |

Frank Ruhl Libre is Meldar's default Hebrew face, so this fix shows on almost every page.

## How Frank Ruhl Libre‑Taamim was repaired

Meldar's file is upstream Frank Ruhl Libre v6.004 with 30 te'amim glyphs added; the layout tables were lost along the way.
Its Hebrew outlines and glyph names match upstream v6.004 exactly (53/53 identical), so `build/fix_frank.py`:

1. Restores upstream's anchors, kerning, ccmp ligatures and GDEF. Source: the v6.004 Hebrew subset from the
   `@fontsource/frank-ruhl-libre` npm package.
2. Adds anchors for all 30 te'amim, meteg, the upper dot and the lower dot, placed by their Unicode position:
   - above or below the letter, centred;
   - pashta, telisha qetana and zinor at the upper-left corner;
   - telisha gedola at the upper-right corner;
   - yetiv and dehi at the lower-right corner.
3. Places a below-te'am or meteg **beside** (to the left of) a below-vowel, as printed Tanakhs do, instead of on top of it.
4. Adds the two missing ligature glyphs, final kaf + sheva and final kaf + qamats.

The letters look the same as before; only the marks moved. `proof/` shows the before/after renders.

## Why there are new file names

Meldar sends fonts with `cache-control: public, max-age=31536000, immutable`. A browser that already has
`fonts/KeterYG-Medium.ttf` will **not** fetch it again for up to a year, even after you replace it. So the fix ships under
new names, which also makes them smaller (WOFF2):

- `fonts/KeterYG-Medium-v0103.woff2` (29 KB; was 43 KB TTF)
- `fonts/FrankRuhlLibre-Taamim-v2.woff2` (24 KB; was 54 KB TTF)

The two `@font-face` lines in `index.html` now point at the new names, falling back to the TTF. The fixed TTFs keep the old names
too, so a page still pointing at them also gets the fix (for anyone without the old file cached).

## Deploy

Copy into Meldar's source:

    fonts/KeterYG-Medium-v0103.woff2
    fonts/FrankRuhlLibre-Taamim-v2.woff2
    fonts/KeterYG-Medium.ttf            (overwrite)
    fonts/FrankRuhlLibre-Taamim.ttf     (overwrite)

Then make the two-line change in `index.html`. Either apply `index.html.patch` (made against the live page on 2026-10-28), or
use the patched `index.html` here if your source matches the live page.

Publish whichever way Meldar is set up:

- **Git-connected Pages project:** commit and push. Cloudflare rebuilds on its own.
- **Direct upload:** `npx wrangler pages deploy <site-folder> --project-name meldar` (and `meldar-proto`). Run it from the
  **full** site folder: a direct upload replaces the whole deployment.

Check it: open https://meldar.pages.dev, pick Keter YG and then Frank Ruhl Libre in the Hebrew font menu, and look at a pasuk
with te'amim. Dagesh should sit inside its letter, and munach or tipcha should sit beside the vowel.

## Licences

- Keter YG: © Yoram Gnat, Culmus project, GPL v2 with the font exception (web embedding is fine).
- Frank Ruhl Libre: © The Frank Ruhl Libre Project Authors, SIL OFL 1.1 (`fonts/OFL-FrankRuhlLibre.txt`). The OFL allows
  modified versions. The repaired file's version string says it was modified ("layout rebuilt for te'amim"), and it keeps
  the family name only as the CSS name Meldar already uses.

## Re-running

    python3 -I build/fix_frank.py <original FrankRuhlLibre-Taamim.ttf> <frank-ruhl-libre-hebrew-400-normal.woff2> out.ttf out.fea

`build/frank.fea` is the generated feature file, readable and editable by hand.
