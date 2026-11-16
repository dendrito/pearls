# Citation links: the Hebrew audit (16 Nov 2026)

`node tools/cite_audit.js` runs Pearls' citation links over every chapter we hold and counts what is linked,
what is marked but not linked, and what looks like a citation (a name followed by a location) that nothing
covers. This pass is about the Hebrew text of the 180 Hebrew-only chapters (`work/he`).

The Hebrew of the official-English volumes is not bundled (the app fetches it from ph.yhb.org.il), so it was
not scanned. Spanish, Portuguese, French and the English spellings come next, when asked.

## Before and after (Hebrew, 180 chapters)

|                         | before | after  |
|-------------------------|-------:|-------:|
| linked                  |  7,763 | 12,831 |
| marked, not linked      |  2,744 |  2,614 |
| name + location, missed | 16,824 | 12,789 |

"Missed" is a rough count: it also catches ordinary prose such as `בשנת תקל"ז` or `ה' אלוהינו`.

## What was added

Every reference shape below was fetched from Sefaria before it was written down.

- **Tanakh in Hebrew** (`שמות כ, ח`, `שמואל ב' ז, כג`), with chapter and verse checked against the book.
- **Tractates with a prefix or an abbreviation** (`בע"ז כ, א`, `ב"מ`, `ב"ב`, `ב"ק`, `מו"ק`, `ר"ה`).
- **The Rambam by book** in Hebrew, including the abbreviations (`איסו"ב`, `מאכ"א`, `הל' שבת`).
- **The Mishnah**, only where the text says `משנה` or `מתני'`.
- **Peninei Halakha pointing at itself**: `לעיל ג, ב`, `להלן`, `פנה"ל <volume>` open that Pearls chapter.
- **New works**: Shibbolei HaLeket, Terumat HaDeshen (both parts), Sefer HaChinukh, Minchat Chinukh, Kuzari,
  Guide for the Perplexed, Tashbetz I–III, Shmonah Kevatzim, Rivash, Keset HaSofer, Maharil, Maharshal,
  Maharsham I–III, Melamed Leho'il, Binyan Tziyon, Semak, Semag, Yereim, Or Zarua I–II, Kol Bo,
  Mesillat Yesharim, Sefer Chasidim, Avot DeRabbi Natan, Ketzot HaChoshen, Machatzit HaShekel, Mateh Efrayim,
  Ba'er Hetev, Pitchei Teshuva, Darkhei Moshe, Prisha, and the Peri Megadim (Eshel Avraham, Mishbezot Zahav,
  Siftei Da'at). A section comes from the citation, else from the chapter; when neither says, it is named,
  not guessed.
- **Beit Yosef by siman** (`ב"י יג`), taking the section named just before it, else the chapter's.
  Hagahot Beit Yosef is a different work and is not linked to it.
- **A bare number after the Mishnah Berurah, Taz, Magen Avraham, Shakh and similar** is a se'if katan on the
  siman just cited (`SA 135:1; MB 3` → MB 135:3). With no siman before it, it is marked, not linked. This
  fixes English too: before, `MB 3` linked to siman 3.

## Still not linked (Hebrew), by book

**Not on Sefaria** (marked and named): Igrot Moshe 219 · Yabia Omer 84 · Ma'amar Mordechai 60 ·
Sha'ar HaTziyun 54 · Taharat HaBayit 46 · Chazon Ish 40 · Rashba's responsa parts I–III 39 ·
Maharsham vol. IV and up 23. Also Peat HaShulchan, Chesed LaAlafim, Shulchan Gavoah, Darkhei Teshuva,
Chelkat Yaakov.

**On Sefaria, but the citation does not give enough to link it safely** (marked):
Zohar by volume and page 87 · Radbaz with no volume 74 · Tosafot with no tractate 68 · Rosh 66 ·
a bare se'if katan with no siman before it (MB 38, Taz 20, MA 20, Shakh 18) · Beit Yosef with no section 26 ·
Rema (shown at its siman in the Shulchan Arukh) 25 · Rav Pe'alim with no volume 23 · Mekhilta by parasha 23 ·
Pitchei Teshuva with no section 18 · Sifrei by verse 15 · Tashbetz part IV · Or Zarua III–IV.

**Works we do not read yet** (name + location, nothing marked):
Shevet HaLevi 46 · Birkei Yosef 35 · Minchat Shlomo 35 · Minchat Yitzchak 53 · Yaskil Avdi 32 ·
Eliya Rabba as `רא"ר` 31 · Pri Chadash 31 · Or LeTziyon 30 · Mishpetei Uziel 28 · Mishneh Halakhot 23 ·
Levush 23 · Darkhei Tahara 22. Several of these are not on Sefaria at all (Shevet HaLevi, Yaskil Avdi,
Or LeTziyon, Mishneh Halakhot, Darkhei Tahara); the rest are worth a check.

**Shapes we do not read yet**:
- A section abbreviation after the work's name, split by a bracket or a word (`שו"ע (יו"ד שעב, א`,
  `המהרי"ט (יו"ד כח`): about 700 `יו"ד` / `או"ח` / `אה"ע` / `חו"מ` hits.
- `שם` (ibid) after a work: 254. Each needs the work before it.
- A Rambam location with no book (`ורמב"ם ו, ו`): 177. Not linked, because the book would be a guess.

## How to run it

    node tools/cite_audit.js --json /tmp/audit.json --top 80
    node test_cite_links.js        # must end "cite links: 35/35"
