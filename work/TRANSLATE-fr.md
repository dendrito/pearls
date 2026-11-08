# Translation brief: Peninei Halakha, Hebrew → French (AI translation for Pearls)

Everything in `work/TRANSLATE.md` applies (fidelity, completeness, licence, structure, citations, ambiguity marking with [?],
abbreviations), with the differences below. Translate **from the Hebrew** in `work/he/BB-CC.json`. The Spanish
(`work/es/BB-CC.json`) and Portuguese (`work/pt/BB-CC.json`) AI translations are helpers: use them to check your reading of
a hard sentence, an abbreviation or a reference, but the Hebrew is the source. Never translate a helper, and where a helper
and the Hebrew differ, follow the Hebrew. Do not copy a helper's [?] marks without checking the Hebrew yourself.

## Output
Write `work/fr/BB-CC.json`, same shape with French field names:
```json
{"book":"10","chapter":"04","chapter_fr":"Birkat Hamazon","sections":[
  {"slug":"10-04-01","title_fr":"La mitsva de Birkat Hamazon","body_fr":"<p>…</p>","notes_fr":[{"n":1,"fr":"…"}]}
]}
```
Done only when `python3 -I work/check.py --lang fr BB-CC` prints OK.

## Register
Clear, natural French of France, as written in French Jewish study books. Impersonal where the Hebrew is impersonal
("on doit", "il faut", "la personne"); "vous" only where the Hebrew addresses the reader directly. Quotations in « … »
with non-breaking spaces as French typography requires (a plain space is acceptable if it is consistent).

## Hebrew terms (the usage of French-speaking Jewish communities)
- ח → **'h** (Pessa'h, 'Hanouka, Choul'han Aroukh, 'Hazal), כ without dagesh → **kh** (berakha, halakha, Birkat).
- ש → ch (Chabbat, Kiddouch), the u sound → ou (Kiddouch, Souccot), צ → ts (mitsva, matsa), ק → k, final ה not written.
- Prefix ה written **Ha** joined, capitalised in names: Hamazon, Hamotsi, Haguefen.
- Established forms: Chabbat, Kiddouch, Havdala, Pessa'h, Souccot, Roch Hachana, Yom Kippour, 'Hanouka, Pourim, Torah,
  'Hazal, Guemara, Michna, Talmud, Choul'han Aroukh, Rambam, Rachi, téfillines, tsitsit, cacherout, cacher, mitsva/mitsvot,
  halakha/halakhot, berakha/berakhot, mélakha/mélakhot.
- Translate ordinary words (pain, vin, fruit, bénédiction when generic). Gloss a rare term once in parentheses.

## The Divine Name
- Hebrew prose ה' → **Hachem**; אלוקים → **Dieu**; הקב"ה → **le Saint, béni soit-Il**.
- In a verse (whole or partial) the Name → **l'Éternel**.
- A blessing formula: « Béni sois-Tu, Hachem, notre Dieu, Roi du monde … » when quoted in the study text.
- Where the Names themselves are the subject, write them as the English does (Y-H-V-H, Ado-nai …).

## Citations
Keep the English house forms of `TRANSLATE.md` (SA OḤ 163:2, MB, Rema, Berakhot 49a, Rambam, Hilkhot Berakhot 3:2,
Yabi'a Omer, Peninei Halakha 3:4). They are references, not prose, and the app links them; do not translate them.
The series name is always **Peninei Halakha**, in prose and in citations. A note reference reads "note 4".

## Numbers and measures
Arabic numerals; kezayit, révi'it, kebeitsa keep the Hebrew term, with the author's own conversions.
