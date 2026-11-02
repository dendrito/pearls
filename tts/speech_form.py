"""Turn a romanized Hebrew term into a form an English TTS voice (Kokoro) can say.

Use it on Hebrew terms only, never on plain English words ("with", "church").
`is_hebrew_term` decides: a word with ḥ ḳ ĥ ’ or an acute accent, or one listed in a
lexicon (Pearls' house lexicon, lemmas.json). Works for every spelling the text may
show: Neo-Classic S&P, de Sola–Gaster, Original (Peninei Halakha), academic, London.
Run pearls' own lexicon.tsv respellings first; this is the fallback for everything else.
"""
import re, unicodedata

_ACUTE = str.maketrans("áéíóúÁÉÍÓÚ", "aeiouAEIOU")
_MARKED = re.compile(r"[ḥḤḳḲĥĤʿ’áéíóúÁÉÍÓÚ]")


def is_hebrew_term(word, lexicon=()):
    return bool(_MARKED.search(word)) or word in lexicon


def speech_form(word):
    w = unicodedata.normalize("NFC", word)
    w = w.replace("ée", "ee")                      # Ḳaddéesh -> Kaddeesh (before accents go)
    w = w.translate(_ACUTE)                        # stress marks: the voice can't use them
    w = w.replace("Ḥ", "Kh").replace("ḥ", "kh")    # ḥet  (Neo-Classic, academic, Original's ḥ)
    w = w.replace("Ĥ", "Kh").replace("ĥ", "kh")    # ḥet as Peninei Halakha prints it
    w = re.sub(r"\bHh", "Kh", w)                   # de Sola–Gaster's Rosh Hhódesh
    w = w.replace("Ḳ", "K").replace("ḳ", "k")      # qof
    w = re.sub(r"ch(?!h)", "kh", w)                # khaf: English reads ch as in "church"
    w = re.sub(r"Ch(?!h)", "Kh", w)
    w = re.sub(r"gu(?=[eiéí])", "g", w)            # Meguilláh: gu only keeps the g hard
    w = re.sub(r"th\b", "t", w)                    # final tav: S&P says t (Shabbath)
    w = w.replace("ʿ", "").replace("’", "").replace("'", "")
    return w


if __name__ == "__main__":
    tests = {
        "Shabbath": "Shabbat", "Ḳaddéesh": "Kaddeesh", "Ḥanuccáh": "Khanuccah",
        "Berachá": "Berakha", "Pesaḥ": "Pesakh", "Ĥamets": "Khamets", "Meguilláh": "Megillah",
        "Rosh Hhódesh": "Rosh Khodesh", "’Arbíth": "Arbit", "Shemaʿ": "Shema",
        "Tephilléen": "Tephilleen", "Shaḥaríth": "Shakharit", "Halacháh": "Halakhah",
    }
    bad = {w: (speech_form(w), want) for w, want in tests.items() if speech_form(w) != want}
    print("ok" if not bad else bad)
    assert not is_hebrew_term("with") and is_hebrew_term("Pesaḥ")
