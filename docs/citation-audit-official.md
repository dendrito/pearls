# Citation links in Har Bracha's own translations (22 Nov 2026)

Checked: the official English (153 chapters), Har Bracha's official Spanish (64 chapters) and the
official French Berakhot (src/fr). Counted with the same rules as `tools/cite_audit.js`.

| Official text | Linked before | Linked after | Name + place still unlinked |
|---|---:|---:|---:|
| English | 9,614 | 9,614 | 1,908 |
| Spanish | 341 | 2,112 | 2,330 → 491 |
| French  | 173 | 1,265 | 1,537 → 567 |

Why Spanish and French were mostly unlinked: Har Bracha writes its citations in its own spelling
("Talmud Babilonio Tratado de Berajot 35(A)", "Shulján Aruj Oraj Jaím 206:1", "Rambám Hiljot Shejitá 11:6",
"Choul‘han ‘Aroukh 206, 1", "‘Houlin 106a", "Dt 8, 10"). `pearls-cite-links.js` now reads those forms
(`XL_NORM`) and rewrites them to the English house forms before the grammar runs. `meldar-cite.js` is unchanged.

Side effects, all checked one by one: some links that were wrong became right. "Rambám Mikvaot 1:9" used to
open Mishnah Mikvaot and now opens the Rambam (Immersion Pools 1:9); "Talmud Jerosolimitano … Nedarim 9:4" used
to open the Mishnah and now opens the Yerushalmi; "Tosafot, Menajot 33b" used to build a ref Sefaria doesn't
know and now opens Tosafot on Menachot. The English, the Hebrew and the AI English give exactly the same links
as before. The AI Spanish (5,311 → 8,624 links), Portuguese (10,429 → 11,550) and French drafts
(5,302 → 5,366) also gain, because they quote the same forms.

What is still unlinked is mostly works Sefaria does not hold (Igrot Moshe, Shevet HaLevi, Yeḥaveh Da'at,
Piskei Teshuvot, Or LeTziyon…), which are named rather than linked.

Known and not fixed here: "Lechem Mishneh, Hilkhot Berakhot 4:6" is linked as Mishnah Berakhot 4:6.

Whether each linked ref opens on Sefaria is checked separately by fetching every ref
(`check_refs.mjs`, run on a machine that can reach sefaria.org, since the cloud build cannot).
