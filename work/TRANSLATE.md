# Translation brief: Peninei Halakha, Hebrew → English (AI translation for Pearls)

You are translating chapters of *Peninei Halakha* by Rabbi Eliezer Melamed (Yeshivat Har Bracha) from Hebrew into English.
The text is licensed CC BY 4.0 by Har Bracha; the translation will be shown to readers clearly labelled "AI translation".
Readers will use it to learn halakha, so fidelity is the overriding requirement.

Licence evidence (checked 2026-10-27): https://ph.yhb.org.il/terms/ §2.1 "כל התוכן באתר ניתן ברישיון CC BY 4.0"; §2.2 permits
translating, summarising, derivative works and AI training, even commercially, except "direct marketing" (selling a complete
copy, §1.4/§5). §5.2 lists translation as a permitted derivative. The site-footer "All rights reserved" is generic; the terms page governs.

## Input
`work/he/BB-CC.json` (BB = book, CC = chapter). Fields: `chapter_he` (chapter title), `sections[]` with
`slug`, `title_he`, `body_he` (HTML: `<p>`, `<strong>`, `<br>`, footnote markers as `<sup>n</sup>`), `notes_he[]` (`{n, he}`).

## Output
Write `work/en/BB-CC.json` (UTF-8, valid JSON) — exactly this shape:
```json
{"book":"10","chapter":"04","chapter_en":"Birkat Ha-mazon","sections":[
  {"slug":"10-04-01","title_en":"The Mitzva of Birkat Ha-mazon","body_en":"<p>…</p>","notes_en":[{"n":1,"en":"…"}]}
]}
```
- One entry per input section, same order, same `slug`. Never skip a section, a paragraph, a sentence or a note.
- `body_en`: one `<p>` per Hebrew `<p>`; keep every `<sup>n</sup>` at the corresponding place; `<strong>` → `<b>`. Allowed tags only: p, sup, b, i, br, blockquote.
- `notes_en`: one item per Hebrew note, same `n`, translated in full (notes are often long — translate all of them).
- Chapter title: Hebrew titles look like "ד - ברכת המזון"; drop the Hebrew numeral, translate the rest. Section titles look like "ב – הטעם הרוחני למצווה": same.
- Write the JSON with a script (python json.dump, ensure_ascii=False) or the Write tool; validate it parses.

## How to translate
- **Faithful and complete.** Translate every sentence. Do not summarise, merge, soften, modernise or add content. Do not add rulings, opinions, caveats or explanations of your own. If a sentence is long, keep it one sentence or split minimally.
- **Register:** clear, natural English prose, as the official Har Bracha English translations read. Second person and "one" as the Hebrew uses them.
- **Hebrew terms** — keep in transliteration where the official English Peninei Halakha does, following its conventions:
  ḥ for ח (Ḥazal, ḥametz, Shulḥan Arukh), kh for כ without dagesh (berakha, melakha, Birkat Ha-mazon), k for ק, v for ב without dagesh, tz for צ, no final -h on feminine -a (berakha, mitzva, Mishna, halakha, se'uda), Ha- prefix with hyphen (Birkat Ha-mazon, Ha-motzi). Capitalise names of blessings and prayers (Ha-motzi, Ha-gafen, Birkat Ha-mazon, Al Ha-miḥya, Borei Nefashot, Shehakol, Ha-tov Ve-hametiv, Ha-gomel, Shemoneh Esrei).
  Translate ordinary words (bread, wine, fruit, blessing when generic). Gloss a rare term once in parentheses at first use in the chapter.
- **Sources and citations** in parentheses: keep every one, expanded to standard English forms:
  שו"ע או"ח קסג, ב → (SA OḤ 163:2); מ"ב → MB; רמ"א → Rema; ברכות מט, א → (Berakhot 49a); רמב"ם ברכות ג, ב → (Rambam, Hilkhot Berakhot 3:2); בה"ל → BHL; שו"ת → Responsa; כה"ח → Kaf Ha-ḥayim; פנה"ל → Peninei Halakha; ירושלמי → Yerushalmi. Hebrew numerals → Arabic. Keep the author's cross-references ("as explained above, 3:4") as references.
- **Quotations** of Bible, Talmud or liturgy: translate them; put the quoted words in double quotes; keep the source in parentheses. For blessing formulas, give the familiar English sense (e.g. "Blessed are You, Lord our God, King of the universe …").
- **Ambiguity:** translate the most likely reading and add [?] directly after the uncertain words. Never guess silently.
- Numbers, measures (kezayit, revi'it, kebeitza) — keep the Hebrew term, with the author's own conversions as given.
- Do not reproduce Hebrew script in the English except where the author is discussing the Hebrew wording itself (then give the Hebrew word, then its transliteration and meaning).

## Before you finish each chapter
Run `python3 -I work/check.py BB-CC` and fix anything it reports (missing sections, missing notes, missing footnote markers, Hebrew left in the English, length outliers). A chapter is done only when it passes.

## Common abbreviations (resolve these; don't mark them [?])
ריש"א = Rav Yosef Shalom Elyashiv · רשז"א / הגרשז"א = Rav Shlomo Zalman Auerbach · הגר"א = the Vilna Gaon (Gra) · אג"מ = Igrot Moshe ·
יבי"א / יביע אומר = Yabi'a Omer · יחו"ד = Yeḥaveh Da'at · שו"ע הרב = Shulḥan Arukh Ha-Rav · ט"ז = Taz · ש"ך = Shakh · מג"א = Magen Avraham ·
פמ"ג = Pri Megadim · א"ר = Eliyahu Rabba · ב"ח = Baḥ · ב"י = Beit Yosef · חזו"א = Ḥazon Ish · כה"ח = Kaf Ha-ḥayim · בא"ח = Ben Ish Ḥai ·
ערוה"ש = Arukh Ha-shulḥan · שעה"צ = Sha'ar Ha-tziyun · רמב"ן = Ramban · רשב"א = Rashba · ריטב"א = Ritva · רא"ש = Rosh · תוס' = Tosafot ·
רי"ף = Rif · מהר"ל = Maharal · ראי"ה / הרב קוק = Rav Kook · הרצי"ה = Rav Tzvi Yehuda Kook · פנה"ל = Peninei Halakha (give volume and chapter:section).
ברכ"ה = Birkat Hashem (Rav Moshe Halevi, on the laws of blessings) — not Peninei Halakha Harḥavot.
