# Translation brief: Peninei Halakha, Hebrew → Portuguese (AI translation for Pearls)

Everything in `work/TRANSLATE.md` applies (fidelity, completeness, licence, structure, citations, ambiguity marking with [?],
abbreviations), with the differences below. Translate **from the Hebrew** in `work/he/BB-CC.json`. The Spanish AI
translation in `work/es/BB-CC.json` is a helper: use it to check your reading of a hard sentence, an abbreviation or a
reference, but the Hebrew is the source. Never translate the Spanish, and where the Spanish and the Hebrew differ, follow
the Hebrew. Do not copy the Spanish's [?] marks without checking the Hebrew yourself.

## Output
Write `work/pt/BB-CC.json`, same shape with Portuguese field names:
```json
{"book":"10","chapter":"04","chapter_pt":"Bircat HaMazon","sections":[
  {"slug":"10-04-01","title_pt":"A mitsvá de Bircat HaMazon","body_pt":"<p>…</p>","notes_pt":[{"n":1,"pt":"…"}]}
]}
```
Done only when `python3 -I work/check.py --lang pt BB-CC` prints OK.

## Register
Clear, natural Brazilian Portuguese, understood in Portugal too. Impersonal where the Hebrew is impersonal ("deve-se",
"é preciso", "a pessoa"); "você" only where the Hebrew addresses the reader directly. Quotations in "…".

## Hebrew terms (the usage of Brazilian Jewish communities)
- ח and כ without dagesh → **ch** (berachá, halachá, Bircat HaMazon, chamets, Shulchan Aruch, pikúach néfesh, melachá/melachot).
- צ → ts (mitsvá, matsá), ק → k (kidush, kashrut), ש → sh (Shabat), final ה not written.
- Accents by Portuguese rules for the Hebrew stress: Torá, Tefilá, berachá, halachá, mitsvá, Havdalá, Sucá, Pêssach.
- Prefix ה written **Ha** joined, capitalised in names: HaMazon, HaMotsí, HaGafen.
- Established forms: Shabat, Kidush, Havdalá, Pêssach, Sucot, Rosh Hashaná, Yom Kipur, Chanucá, Purim, Chazal, Guemará,
  Mishná, Talmud, Shulchan Aruch, Rambam, Rashi, tefilin, tsitsit, kashrut, casher.
- Translate ordinary words (pão, vinho, fruta, bênção when generic). Gloss a rare term once in parentheses.

## The Divine Name
- Hebrew prose ה' → **HaShem**; אלוקים → **Deus**; הקב"ה → **o Santo, Bendito Seja**.
- In a verse (whole or partial) the Name → **o Eterno**.
- A blessing formula: "Bendito és Tu, HaShem, nosso Deus, Rei do universo …" when quoted in the study text.
- Where the Names themselves are the subject, write them as the English does (Y-H-V-H, Ado-nai …).

## Citations
Keep the English house forms of `TRANSLATE.md` (SA OḤ 163:2, MB, Rema, Berakhot 49a, Rambam, Hilkhot Berakhot 3:2,
Yabi'a Omer, Peninei Halakha 3:4). They are references, not prose, and the app links them; do not translate them.
The series name is always **Peninei Halakha**, in prose and in citations.

## Numbers and measures
Arabic numerals; kezait, reviit, kebeitsá keep the Hebrew term, with the author's own conversions.
