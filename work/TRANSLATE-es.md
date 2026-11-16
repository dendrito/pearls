# Translation brief: Peninei Halakha, Hebrew → Spanish (AI translation for Pearls)

Everything in `work/TRANSLATE.md` applies (fidelity, completeness, licence, structure, citations, ambiguity marking with [?],
abbreviations), with the differences below. Translate **from the Hebrew** in `work/he/BB-CC.json`. If an English
translation exists in `work/en/BB-CC.json` you may consult it to check your reading of a hard sentence, but the Hebrew is the
source: never translate the English.

## Output
Write `work/es/BB-CC.json`, same shape as the English with Spanish field names:
```json
{"book":"10","chapter":"04","chapter_es":"Birkat HaMazón","sections":[
  {"slug":"10-04-01","title_es":"La mitzvá de Birkat HaMazón","body_es":"<p>…</p>","notes_es":[{"n":1,"es":"…"}]}
]}
```
Done only when `python3 -I work/check.py --lang es BB-CC` prints OK.

## Register
Clear, natural, neutral Spanish (understood in Latin America and Spain), as Har Bracha's own Spanish edition (*Pninei
Halajá*) reads. Use "usted"-free impersonal constructions where the Hebrew is impersonal ("uno", "se debe", "hay que");
"tú" only where the Hebrew addresses the reader directly. Spanish punctuation (¿…? ¡…!), « » not required: use "…" for quotations.

## Hebrew terms (follow Har Bracha's Spanish house style)
- ח and כ without dagesh → **j** (berajá, halajá, Birkat HaMazón, jametz, Shulján Aruj, pikúaj néfesh, melajá/melajot).
- צ → tz (mitzvá, Matzá), ק → k (kidush, kashrut), ש → sh (Shabat), final ה not written (berajá, mitzvá, Mishná).
- Accent marks by Spanish rules for the Hebrew stress: Torá, Tefilá, berajá, halajá, mitzvá, Havdalá, Sucá, Melavé Malká,
  Muktzé, Eruvín, Shavuot, Pésaj.
- Prefix ה written **Ha** joined, capitalised in names: HaMazón, HaMotzí, HaGafen, Taharat HaMishpajá.
- Established forms: Shabat, Kidush, Havdalá, Pésaj, Sucot, Rosh HaShaná, Iom Kipur, Janucá, Purim, Jazal, Guemará,
  Mishná, Talmud, Shulján Aruj, Rambam, Rashí, tefilín, tzitzit, kashrut, kasher.
- Translate ordinary words (pan, vino, fruta, bendición when generic). Gloss a rare term once in parentheses.

## The Divine Name
- Hebrew prose ה' → **HaShem**; אלוקים / הקב"ה → **Dios** / **el Santo, Bendito Sea**.
- In a verse (whole or partial) the Name → **el Eterno**.
- A blessing formula: "Bendito eres Tú, HaShem, nuestro Dios, Rey del universo …" when quoted in the study text.
- Where the Names themselves are the subject, write them as the English does (Y-H-V-H, Ado-nai …).

## Citations
Keep the English house forms of `TRANSLATE.md` (SA OḤ 163:2, MB, Rema, Berakhot 49a, Rambam, Hilkhot Berakhot 3:2,
Yabi'a Omer, Peninei Halakha 3:4). They are references, not prose, and the app links them; do not hispanise them.
The series name is always **Peninei Halakha**, in prose and in citations, never "Peninei Halajá" or "Pninei Halajá".

## Numbers and measures
Arabic numerals; kezait, reviit, kebeitzá keep the Hebrew term, with the author's own conversions.
