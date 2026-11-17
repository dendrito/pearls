# Citation links: the English audit (16 Nov 2026)

The same pass as `docs/citation-audit-hebrew.md`, run over the English text: the 153 chapters of Har Bracha's
official translation (`en`) and the 180 AI-translated chapters (`ai-en`). `node tools/cite_audit.js` counts
what is linked, what is marked but not linked, and what looks like a citation (a name followed by a location)
that nothing covers.

## Before and after

|                         | official before | official after | AI before | AI after |
|-------------------------|----------------:|---------------:|----------:|---------:|
| linked                  |           8,822 |          9,594 |    10,290 |   13,079 |
| marked, not linked      |           2,002 |          2,776 |     3,007 |    4,026 |
| name + location, missed |           3,256 |          1,908 |     8,565 |    5,077 |

"Marked" went up on purpose: a citation of a book Sefaria does not hold is now named in the sheet, with the
reason, instead of being left as plain text. "Missed" is rough, as in the Hebrew audit.

## What was added

Every reference shape was fetched from Sefaria before it was written down, and a sample of 331 links from the
new rules was fetched again afterwards.

- **The Rambam by book name**: `Hilkhot Shabbat 5:3`, `Laws of Kings 10:9`, `Rambam (Tzitzit 3:11)`, in the
  transliterations and English names both translations use. A "Hilkhot X" right after another author
  (`Or Zarua (Hilkhot Keri'at Shema 1:15)`) is that author's, so it is not linked to the Rambam.
- **Tanakh in transliteration**: `Yehoshua 1:8`, `II Shmuel 7:12`, `Divrei Ha-yamim`, chapter checked against
  the book; not after words like `Beit`, `Ḥazon` or `Hilkhot`, where the name is part of another title.
- **Tractates spelled another way**: `Berachot`, `Ta’anit`, `Nidda`, `Avoda Zara`, `Shevi'it` and the rest
  are rewritten to Sefaria's spelling before the grammar reads them. Also `Arukh Ha-shulḥan`, `Biur Halakha`,
  `Shabbat Ha-Aretz`, and `ĥ` (the official translation's letter for ḥ).
- **Chayei Adam**: Sefaria has two works, the daily laws (69 klalim) and Shabbat and Festivals (155). A
  citation that says Shabbat, or a klal above 69, links the second; in the Shabbat and festival volumes a bare
  klal is named rather than guessed; elsewhere it links the first.
- **Sha'arei Teshuva** is three books. Rabbeinu Yona's links when the text names him or says "gate", or the
  section is past 60; the Ge'onim's responsa link when the text says Ge'onim; the Shulḥan Arukh commentary is
  named (Sefaria's copy has text for few se'ifim).
- **New works**: Terumat HaDeshen, Sefer HaChinukh, Minchat Chinukh, Kuzari, Guide for the Perplexed,
  Tashbetz I–III, Maharsham, Melamed Leho'il, Binyan Tziyon, Semak, Semag, Yere'im, Or Zarua, Kol Bo,
  Mesillat Yesharim, Shibbolei HaLeket, Rivash, Avot DeRabbi Natan, Shmonah Kevatzim, Keset HaSofer,
  Gevurot Hashem, Ḥavot Yair, She'ilat Ya'avetz, Meshiv Davar (volumes I–II; III–IV have no text on Sefaria),
  Mateh Efrayim, Derekh Hashem (by part and chapter name), Darkhei Moshe, Prisha, Peri Megadim, and the
  Jerusalem Talmud as `y. Shabbat 1:3`.
- **Peninei Halakha pointing at itself**: `Peninei Halakha: Shabbat ch. 21` opens that Pearls chapter.
- **A guard**: a "Mishnah" with a chapter above 30 or a mishnah above 40 is another work's numbering
  (`Yam Shel Shlomo Ḥullin 8:106`), so it is named, not linked.

## Named, not linked (not on Sefaria)

Igrot Moshe, Sha'ar Ha-tziyun, Ḥazon Ish, Yabi'a Omer, Yeḥaveh Da'at, Minḥat Yitzḥak, Minḥat Shlomo,
Shevet Ha-Levi, Birkei Yosef, Levush, Menuḥat Ahava, Aseh Lekha Rav, Mishpat Kohen, Teḥumin, Darkhei Tahara,
Taharat Ha-bayit, Mishneh Halakhot, Ketzot Ha-shulḥan, Nishmat Avraham, Ma'amar Mordechai. Each was checked
against Sefaria's full title list.

## Links that may show "no text"

Some numbers are right in the book and outside Sefaria's numbering (e.g. `Rambam, Kings 7:16` where Sefaria's
chapter has 15 halakhot, `Prisha OḤ 179:14`, a few Peri Megadim se'ifim). The sheet says so in words rather
than showing another passage. Nothing in the sample fetched a different passage than the one cited.

## Still missed

- Sections of other works: `Neḥpa Ba-Kesef, Yoreh De'ah 5`, `Igrot Moshe` parts written out in words.
- SSK by chapter (`SSK ch. 42`), Nishmat Adam, Kuntres Aḥaron, and `se'if katan` written out.
- A Rambam location with no book (`MT 30:15`) stays named.
