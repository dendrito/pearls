# S&P house rules (Keter Shem Tob) — transliteration spec for Meldar

Status: settled September 2026 for the Keter Shem Tob translation; the rules for Pearls' "S&P house rules" option (27 October 2026), and the intended rules for Meldar's "S&P London — de Sola / Gaster" scheme (Meldar's code not yet checked against them).

Source of truth: the artifacts *How Hebrew Is Spelled Here*, *S&P Romanization Concordance* and *Open Questions in the Romanization* (5–8 Sept 2026). The full KTS glossary (`assets/glossary.json`, ~986 terms) lives in the KTS project folder and should replace the lexicon below when available.

## Basis
The London Spanish & Portuguese system of D. A. de Sola (1836) and Moses Gaster (1901), revised under Haham Solomon Gaon — the orthography Shem Tob Gaguine wrote in — plus two dotted letters so the Hebrew can be recovered from the English.

## Letters
| Hebrew | Rule | Examples |
|---|---|---|
| ב (vet) | b | Yom Tob, Lulab, Habdaláh |
| ח | ḥ (added to the London system) | Ḥódesh, Pesaḥ, Minḥáh |
| כ (khaf) | ch | Berachá, Hechál, Malchutó |
| כּ (hard kaf) | c before a/o/u, k before e/i | Cohen, Ḥanuccáh · Keter, Ketubah |
| ק | ḳ (U+1E33; borrowed from library catalogue romanization) | Ḳaddéesh, Ḳiddúsh, Ḳedusháh |
| ע | ng medially, ’ at the start of a word | Shemang, Hamonged · ’Ómer, ’Arbíth |
| פ (fe) | ph | Sepher, Tephilléen, Haphtarah |
| צ | ts | Erets, Tsitséet, Mitsvah |
| ת | th at the end of a word, t elsewhere | Shabbath, Abóth · Malchutó, Ketubah |
| ג before e/i | gu (keeps the g hard, as in Gaguine) | Meguilláh |

## Vowels and marks
- An acute accent marks the stressed syllable: Malchutó, Sépher, Minḥáh, Shaḥaríth. A stressed i is í.
- A doubled consonant marks a dagesh, and appears only where the Hebrew has one: Ḳiddúsh, Ḥanuccáh.

## Fixed exceptions
- Five words keep the older London spelling: Ḳaddéesh, Tsitséet, Tephilléen, Puréem, Talét.
- Ya'aḳób: medial ayin written ’ (decided exception).

## Two registers
Running prose follows these rules. Names of tractates, books and rabbis keep their ordinary scholarly/catalogue spelling (in italics in KTS) so references can be looked up: *Moed Katan*, *Shulchan Aruch*, *Peninei Halakha*. A tractate followed by a folio (Berakhot 26b, Shabbat 23b) is a citation and is not respelled. The spelling-mode switch and the citation-register switch stay independent.

## Decisions (8 Sept 2026)
1. Bet raphe vs bet with dagesh (145 terms): build a Hebrew-keyed lemma table.
2. Ḥabura mode: dotted throughout. Ask the user when unsure rather than deciding silently.
3. Modern London mode: use the English word where London translates (Sabbath, Passover); also propose candidate romanizations to the user so the answers train the rules.
4. Register vs mode: independent switches.

## Still open
- Moed Katan: Mongéd or Mo'éd.
- Whether Ashkenaz needs a named exception (the rule gives "Ascenaz").

## Lexicon in use (Pearls, 121 terms)
"attested" = spelled exactly as in the KTS house-rule artifacts; "derived" = produced from the rules above for Pearls and still to be checked against the full KTS glossary.

| House form | Status | Published (Ashkenazi) spellings it replaces, sample |
|---|---|---|
| Shabbath | attested | Shabbat |
| Shabbatóth | derived | Shabbatot |
| Yom Tob | attested | Yom Tov |
| Mitsvah | attested | Mitzva, Mitsva, Mitsvah |
| Mitsvóth | derived | Mitzvot, Mitsvot |
| Ḥaméts | derived | Ĥamets, Hametz, Ĥametz |
| Pesaḥ | attested | Pesah, Pesaḥ, Pesaĥ |
| Matsáh | derived | Matsa, Matza, Matzah |
| Matsóth | derived | Matsot, Matzot |
| Melacháh | derived | Melaha, Melaĥa, Melaḥa |
| Melachóth | derived | Melahot, Melaĥot, Melaḥot |
| Shemang | attested | Shma, Shema |
| Ḳeriath | attested | Kriat, Kri’at, Kri'at |
| ’Amidáh | derived | Amida, Amidah |
| Kippúr | derived | Kipur, Kippur |
| Succáh | attested | Succa, Sukka, Succah |
| Succóth | attested | Succot, Sukkot |
| Bircath | attested | Birkat |
| Birchóth | derived | Birkot, Birḥot, Birĥot |
| Berachóth | derived | Beraĥot, Beraḥot, Berahot |
| Berachá | attested | Beraĥa, Bracha, Beraḥa |
| Ḳiddúsh | attested | Kidush, Kiddush |
| Habdaláh | attested | Havdala, Havdalah |
| Kelím | derived | Kelim |
| Ḳaddéesh | attested | Kadish, Kaddish |
| Muḳtséh | derived | Muktze, Muktse, Muktzeh |
| ’Erub | derived | Eruv, Eiruv |
| ’Erubín | derived | Eruvin |
| Tabshilín | derived | Tavshilin |
| Cohaním | attested | Kohanim |
| Cohen | attested | Kohen |
| Hallél | derived | Hallel |
| Ḳorbanóth | derived | Korbanot |
| Pesuḳé | derived | Pesukei |
| de-Zimráh | derived | Dzimra, DeZimra, D’zimra |
| Puréem | attested | Purim |
| Séder | derived | Seder |
| Ḥanuccáh | attested | Hanuka, Ĥanuka, Ḥanuka |
| ’Ereb | derived | Erev |
| Ḥol | derived | Ĥol, Ḥol, Hol |
| ha-Mongéd | derived | Hamoed, HaMoed, Ha-moed |
| Zachór | attested | Zaḥor, Zahor, Zaĥor |
| Teḥúm | derived | Teḥum, Teĥum, Tehum |
| Núsaḥ | derived | Nusah, Nusaĥ, Nusaḥ |
| Cavanáh | derived | Kavana, Kavanah |
| Mangaríb | derived | Maariv, Ma’ariv, Ma'ariv |
| ’Arbíth | attested | Arvit |
| Musáph | attested | Musaf, Mussaf |
| Shophár | derived | Shofar |
| Meguilláh | derived | Megila, Megilla, Megillah |
| ’Ómer | attested | Omer |
| Erets | attested | Erets, Eretz |
| Yisraél | derived | Yisrael |
| Hagaláh | derived | Hagala, Hagalah, Hag'ala |
| Lulab | attested | Lulav |
| Seliḥóth | attested | Selihot, Seliĥot, Seliḥot |
| Minḥáh | attested | Minḥa, Minĥa, Minha |
| Netilath | derived | Netilat |
| Yadáyim | derived | Yadayim |
| ha-Shaḥar | derived | HaShaĥar, HaShahar, HaShaḥar |
| Shaḥaríth | attested | Shaharit, Shaĥarit, Shaḥarit |
| Tsitséet | attested | Tzitzit, Tsitsit |
| Nephilath | derived | Nefilat, Nefillat |
| Apáyim | derived | Apayim |
| Sechách | derived | Skhaĥ, Skhaḥ, Skhah |
| ’Onáh | derived | Ona, Onah |
| ha-Shanáh | derived | Hashana, HaShana, Ha-Shana |
| Bediḳath | derived | Bedikat |
| Haggadáh | derived | Hagada, Hagadah, Haggada |
| Ḥódesh | attested | Ĥodesh, Hodesh, Ḥodesh |
| Tishngáh | derived | Tisha, Tish'a, Tishah |
| be-Ab | derived | BAv, B’Av, B'Av |
| Mishlóaḥ | derived | Mishloaĥ, Mishloaḥ, Mishloah |
| Manóth | derived | Manot |
| ’Atséreth | derived | Atseret, Atzeret |
| Simḥath | derived | Simḥat, Simhat, Simĥat |
| Viddúy | derived | Viduy, Vidui |
| Tephiláh | attested | Tefila, Tefilah, Tefilla |
| Tephilléen | attested | Tefilin, Tefillin |
| Teshubáh | derived | Teshuva, Teshuvah |
| Ḳitniyóth | derived | Kitniyot |
| Taḥanún | derived | Tahanun, Taĥanun, Taḥanun |
| Ḳedusháh | attested | Kedusha, Kedushah |
| Ḥazzán | derived | Ḥazan, Ĥazan, Hazan |
| Talét | attested | Talit, Tallit |
| Cashrúth | derived | Kashrut |
| Shabungóth | derived | Shavuot, Shavu'ot, Shavu’ot |
| Etróg | derived | Etrog |
| Hoshangná | derived | Hoshana, Hosha’na, Hosha'na |
| Hoshangnóth | derived | Hoshanot, Hosha’not, Hosha'not |
| Haḳhél | derived | Hakhel, Hak’hel, Hak'hel |
| Melavvéh Malcáh | derived | Melave Malka, Melaveh Malka, Melaveh Malkah |
| Borér | derived | Borer |
| Bishúl | derived | Bishul |
| Shinúy | derived | Shinui |
| Miḳvéh | derived | Mikva, Mikveh, Mikvah |
| ha-Mazón | derived | HaMazon, Ha-Mazon, Ha-mazon |
| Halacháh | attested | Halaha, Halaḥa, Halaĥa |
| Halachóth | derived | Halaḥot, Halaĥot, Halahot |
| Noraím | derived | Noraim, Nora'im, Nora’im |
| Mishnáh | derived | Mishna, Mishnah |
| Guemará | derived | Gemara |
| Ḳabbalath | derived | Kabalat, Kabbalat |
| Shemonéh ’Esréh | derived | Shemone Esre, Shmoneh Esrei, Shemoneh Esrei |
| Mezuzáh | derived | Mezuza, Mezuzah |
| Tsedaḳáh | derived | Tzedaka, Tsedaka, Tsedakah |
| Mongadím | derived | Moadim, Mo'adim, Mo’adim |
| Zemaním | derived | Zemanim |
| Yamím | derived | Yamim |
| Shamór | derived | Shamor |
| Mechirath | derived | Meḥirat, Mehirat, Meĥirat |
| Bittúl | derived | Bitul, Bittul |
| Bingúr | derived | Biur, Bi'ur, Bi’ur |
| Cos | derived | Kos |
| Ammóth | derived | Amot |
| Hotsaáh | derived | Hotzaa, Hotzaah, Hotza’a |
| Mechabbéh | derived | Mehabeh, Meĥabeh, Meḥabeh |
| Mabngír | derived | Mavir, Mav’ir, Mav'ir |
| Sengudáh | derived | Seuda, Se'uda, Se’uda |
| Sengudóth | derived | Seudot, Se'udot, Se’udot |
| Simḥath Toráh | derived | Simhat Torah, Simĥat Torah, Simḥat Torah |
