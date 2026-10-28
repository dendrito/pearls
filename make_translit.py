"""Builds www/translit.js: the respelling lexicon for Pearls' spelling switch.

Each row: source spellings as the English Peninei Halakha prints them (variants expanded),
the House-rules form (London S&P of de Sola & Gaster, with ḥ and ḳ — the Keter Shem Tob house rules),
The Ashkenazi option is the published Peninei Halakha spelling itself, so it needs no column;
the last column below is unused and kept only as a reference.
'a' = attested in the KTS house-rules artifacts; 'd' = derived here by those rules (flagged in the app)."""
import itertools, json, os, re

H = ["Ĥ", "Ḥ", "Ch", "H"]          # how the translators write ḥet / khaf, initial
h = ["ĥ", "ḥ", "ch", "h", "kh"]    # medial
AP = ["’", "'", ""]                # ayin / alef apostrophes, or none

def expand(pat):
    """'{H}ametz' -> Ĥametz, Ḥametz, Chametz, Hametz ..."""
    slots = re.findall(r"\{(H|h|')\}", pat)
    opts = {"H": H, "h": h, "'": AP}
    out = set()
    for combo in itertools.product(*[opts[s] for s in slots]):
        s, it = pat, iter(combo)
        s = re.sub(r"\{(H|h|')\}", lambda m: next(it), s)
        out.add(s)
    return out

#   source patterns (| separated)              house form        status  ashkenazi
ROWS = [
  ("Shabbat",                                   "Shabbath",       "a", "Shabbos"),
  ("Shabbatot",                                 "Shabbatóth",     "d", "Shabbosos"),
  ("Yom Tov",                                   "Yom Tob",        "a", "Yom Tov"),
  ("Mitzva|Mitzvah|Mitsva|Mitsvah",             "Mitsvah",        "a", "Mitzvah"),
  ("Mitzvot|Mitsvot",                           "Mitsvóth",       "d", "Mitzvos"),
  ("{H}amet[z]|{H}amets",                       "Ḥaméts",         "d", "Chometz"),
  ("Pesa{h}",                                   "Pesaḥ",          "a", "Pesach"),
  ("Matza|Matzah|Matsa",                        "Matsáh",         "d", "Matzah"),
  ("Matzot|Matsot",                             "Matsóth",        "d", "Matzos"),
  ("Mela{h}a|Mela{h}ah",                        "Melacháh",       "d", "Melachah"),
  ("Mela{h}ot",                                 "Melachóth",      "d", "Melachos"),
  ("Shema|Shma",                                "Shemang",        "a", "Shema"),
  ("Keri{'}at|Kriat|Kri{'}at",                  "Ḳeriath",        "a", "Krias"),
  ("Amidah|Amida",                              "’Amidáh",        "d", "Amidah"),
  ("Kippur|Kipur",                              "Kippúr",         "d", "Kippur"),
  ("Sukka|Sukkah|Succa|Succah",                 "Succáh",         "a", "Sukkah"),
  ("Sukkot|Succot",                             "Succóth",        "a", "Sukkos"),
  ("Birkat",                                    "Bircath",        "a", "Birkas"),
  ("Birkot|Bir{h}ot",                           "Birchóth",       "d", "Birchos"),
  ("Bera{h}ot",                                 "Berachóth",      "d", "Brachos"),
  ("Bera{h}a|Bera{h}ah|Bracha|Brachah",         "Berachá",        "a", "Brachah"),
  ("Kiddush|Kidush",                            "Ḳiddúsh",        "a", "Kiddush"),
  ("Havdala|Havdalah",                          "Habdaláh",       "a", "Havdalah"),
  ("Kelim",                                     "Kelím",          "d", "Keilim"),
  ("Kaddish|Kadish",                            "Ḳaddéesh",       "a", "Kaddish"),
  ("Muktzeh|Muktze|Muktse|Muktseh",             "Muḳtséh",        "d", "Muktzeh"),
  ("Eruv|Eiruv",                                "’Erub",          "d", "Eruv"),
  ("Eruvin",                                    "’Erubín",        "d", "Eruvin"),
  ("Tavshilin",                                 "Tabshilín",      "d", "Tavshilin"),
  ("Kohanim",                                   "Cohaním",        "a", "Kohanim"),
  ("Kohen",                                     "Cohen",          "a", "Kohen"),
  ("Hallel",                                    "Hallél",         "d", "Hallel"),
  ("Korbanot",                                  "Ḳorbanóth",      "d", "Korbanos"),
  ("Pesukei",                                   "Pesuḳé",         "d", "Pesukei"),
  ("De-zimra|De-Zimra|D{'}zimra|DeZimra|De-zimrah", "de-Zimráh",  "d", "D'Zimrah"),
  ("Purim",                                     "Puréem",         "a", "Purim"),
  ("Seder",                                     "Séder",          "d", "Seder"),
  ("{H}anuka|{H}anukah|{H}anukka|{H}anukkah",   "Ḥanuccáh",       "a", "Chanukah"),
  ("Erev",                                      "’Ereb",          "d", "Erev"),
  ("{H}ol",                                     "Ḥol",            "d", "Chol"),
  ("Ha-mo{'}ed|HaMo{'}ed|Ha-Mo{'}ed|Hamoed",    "ha-Mongéd",      "d", "Hamoed"),
  ("Za{h}or",                                   "Zachór",         "a", "Zachor"),
  ("Te{h}um",                                   "Teḥúm",          "d", "Techum"),
  ("Nusa{h}",                                   "Núsaḥ",          "d", "Nusach"),
  ("Kavanah|Kavana",                            "Cavanáh",        "d", "Kavanah"),
  ("Ma{'}ariv",                                 "Mangaríb",       "d", "Maariv"),
  ("Arvit",                                     "’Arbíth",        "a", "Maariv"),
  ("Musaf|Mussaf",                              "Musáph",         "a", "Mussaf"),
  ("Shofar",                                    "Shophár",        "d", "Shofar"),
  ("Megilla|Megillah|Megila",                   "Meguilláh",      "d", "Megillah"),
  ("Omer",                                      "’Ómer",          "a", "Omer"),
  ("Eretz|Erets",                               "Erets",          "a", "Eretz"),
  ("Yisrael",                                   "Yisraél",        "d", "Yisroel"),
  ("Hagala|Hagalah|Hag{'}ala",                  "Hagaláh",        "d", "Hagalah"),
  ("Lulav",                                     "Lulab",          "a", "Lulav"),
  ("Seli{h}ot",                                 "Seliḥóth",       "a", "Selichos"),
  ("Min{h}a|Min{h}ah",                          "Minḥáh",         "a", "Minchah"),
  ("Netilat",                                   "Netilath",       "d", "Netilas"),
  ("Yadayim",                                   "Yadáyim",        "d", "Yadayim"),
  ("Ha-sha{h}ar|HaSha{h}ar|Ha-Sha{h}ar",        "ha-Shaḥar",      "d", "HaShachar"),
  ("Sha{h}arit",                                "Shaḥaríth",      "a", "Shacharis"),
  ("Tzitzit|Tsitsit",                           "Tsitséet",       "a", "Tzitzis"),
  ("Nefillat|Nefilat",                          "Nephilath",      "d", "Nefilas"),
  ("Apayim",                                    "Apáyim",         "d", "Apayim"),
  ("Sekha{h}|Secha{h}|Skha{h}",                 "Sechách",        "d", "Schach"),
  ("Ona|Onah",                                  "’Onáh",          "d", "Onah"),
  ("Ha-shana|HaShana|Ha-Shana|Ha-shanah|Hashana", "ha-Shanáh",    "d", "Hashanah"),
  ("Bedikat",                                   "Bediḳath",       "d", "Bedikas"),
  ("Hagada|Haggada|Haggadah|Hagadah",           "Haggadáh",       "d", "Haggadah"),
  ("{H}odesh",                                  "Ḥódesh",         "a", "Chodesh"),
  ("Tish{'}a|Tishah",                           "Tishngáh",       "d", "Tishah"),
  ("B{'}Av|be-Av",                              "be-Ab",          "d", "B'Av"),
  ("Mishlo{'}a{h}|Mishloa{h}",                  "Mishlóaḥ",       "d", "Mishloach"),
  ("Manot",                                     "Manóth",         "d", "Manos"),
  ("Atzeret|Atseret",                           "’Atséreth",      "d", "Atzeres"),
  ("Sim{h}at",                                  "Simḥath",        "d", "Simchas"),
  ("Vidui|Viduy",                               "Viddúy",         "d", "Viduy"),
  ("Tefila|Tefillah|Tefilla|Tefilah",           "Tephiláh",       "a", "Tefillah"),
  ("Tefillin|Tefilin",                          "Tephilléen",     "a", "Tefillin"),
  ("Teshuva|Teshuvah",                          "Teshubáh",       "d", "Teshuvah"),
  ("Kitniyot",                                  "Ḳitniyóth",      "d", "Kitniyos"),
  ("Ta{h}anun",                                 "Taḥanún",        "d", "Tachanun"),
  ("Kedusha|Kedushah",                          "Ḳedusháh",       "a", "Kedushah"),
  ("{H}azan|{H}azzan",                          "Ḥazzán",         "d", "Chazzan"),
  ("Tallit|Talit",                              "Talét",          "a", "Tallis"),
  ("Kashrut",                                   "Cashrúth",       "d", "Kashrus"),
  ("Shavuot|Shavu{'}ot",                        "Shabungóth",     "d", "Shavuos"),
  ("Etrog",                                     "Etróg",          "d", "Esrog"),
  ("Hoshana|Hosha{'}na",                        "Hoshangná",      "d", "Hoshana"),
  ("Hoshanot|Hosha{'}not",                      "Hoshangnóth",    "d", "Hoshanos"),
  ("Hak{'}hel|Hakhel",                          "Haḳhél",         "d", "Hakhel"),
  ("Melaveh Malka|Melave Malka|Melaveh Malkah", "Melavvéh Malcáh", "d", "Melaveh Malkah"),
  ("Borer",                                     "Borér",          "d", "Borer"),
  ("Bishul",                                    "Bishúl",         "d", "Bishul"),
  ("Shinui",                                    "Shinúy",         "d", "Shinui"),
  ("Mikveh|Mikva|Mikvah",                       "Miḳvéh",         "d", "Mikvah"),
  ("Ha-mazon|HaMazon|Ha-Mazon",                 "ha-Mazón",       "d", "Hamazon"),
  ("Hala{h}a|Hala{h}ah",                        "Halacháh",       "a", "Halachah"),
  ("Hala{h}ot",                                 "Halachóth",      "d", "Halachos"),
  ("Nora{'}im",                                 "Noraím",         "d", "Noraim"),
  ("Mishna|Mishnah",                            "Mishnáh",        "d", "Mishnah"),
  ("Gemara",                                    "Guemará",        "d", "Gemara"),
  ("Kabbalat|Kabalat",                          "Ḳabbalath",      "d", "Kabbalas"),
  ("Shemoneh Esrei|Shemone Esre|Shmoneh Esrei", "Shemonéh ’Esréh", "d", "Shemoneh Esrei"),
  ("Mezuza|Mezuzah",                            "Mezuzáh",        "d", "Mezuzah"),
  ("Tzedaka|Tzedakah|Tsedaka|Tsedakah",         "Tsedaḳáh",       "d", "Tzedakah"),
  ("Mo{'}adim",                                 "Mongadím",       "d", "Moadim"),
  ("Zemanim",                                   "Zemaním",        "d", "Zmanim"),
  ("Yamim",                                     "Yamím",          "d", "Yamim"),
  ("Shamor",                                    "Shamór",         "d", ""),
  ("Me{h}irat",                                 "Mechirath",      "d", ""),
  ("Bitul|Bittul",                              "Bittúl",         "d", ""),
  ("Bi{'}ur",                                   "Bingúr",         "d", ""),
  ("Kos",                                       "Cos",            "d", ""),
  ("Amot",                                      "Ammóth",         "d", ""),
  ("Hotza{'}ah|Hotza{'}a|Hotsa{'}ah",           "Hotsaáh",        "d", ""),
  ("Me{h}abeh",                                 "Mechabbéh",      "d", ""),
  ("Mav{'}ir",                                  "Mabngír",        "d", ""),
  ("Se{'}uda|Se{'}udah",                        "Sengudáh",       "d", ""),
  ("Se{'}udot",                                 "Sengudóth",      "d", ""),
  ("Simhat Torah|Sim{h}at Torah",               "Simḥath Toráh",  "d", "Simchas Torah"),
]

def main():
    out = []
    for pats, house, st, ash in ROWS:
        src = set()
        for p in pats.split("|"):
            p = p.replace("[z]", "z")
            src |= expand(p)
        out.append({"src": sorted(src, key=lambda s: (-len(s), s)), "house": house, "st": st})
    here = os.path.dirname(os.path.abspath(__file__))
    js = "/* generated by make_translit.py — edit there */\nwindow.PH_TRANSLIT = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(here, "www", "translit.js"), "w").write(js)
    print(len(out), "terms;", sum(r["st"] == "a" for r in out), "attested,", sum(r["st"] == "d" for r in out), "derived")

if __name__ == "__main__":
    main()
