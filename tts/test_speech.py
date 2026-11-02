"""python3 tts/test_speech.py -> must end "speech: N/N". Hebrew terms in every spelling the app can show reach the
voice in a sayable form, and English words are left alone."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pearls_tts import speakable

CASES = [
    ("<p>On Shabbath we say Ḳaddéesh.</p>", "On Shabbat we say Kaddeesh."),           # Neo-Classic S&P
    ("<p>A Berachá before Pesaḥ.</p>", "A Berakha before Pesakh."),
    ("<p>Remove the Ĥamets.</p>", "Remove the Khamets."),                              # Original (Peninei Halakha)
    ("<p>Read the Meguilláh on Puréem.</p>", "Read the Megillah on Pureem."),
    ("<p>Rosh Hhódesh.</p>", "Rosh Khodesh."),                                          # de Sola–Gaster
    ("<p>The church bell rang with the cathedral’s chime; don’t worry.</p>",
     "The church bell rang with the cathedral’s chime; don’t worry."),                 # English untouched
]
ok = 0
for html, want in CASES:
    got = " ".join(speakable(html, []))
    if got == want: ok += 1
    else: print("FAIL", repr(html), "->", repr(got), "want", repr(want))
print(f"speech: {ok}/{len(CASES)}")
sys.exit(ok != len(CASES))
