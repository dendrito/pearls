# Calendar readings: method

## Why

People learn the laws of a festival when they need them, and the tradition is to begin before the day: "we ask and
expound the laws of Pesach thirty days before Pesach" (Pesachim 6a; Shulchan Arukh, Orach Chayim 429:1). Pearls used
to have only a rough "season" (by Hebrew month and topic tags). It now knows the actual calendar and recommends each
festival's chapters while there is time to learn them.

## How it works

- `www/calendar.js` (`window.PH_CAL`) lists 22 events plus the next Rosh Ḥodesh. Each event has:
  - the Hebrew date (`m` month names as `Intl` gives them, `d` day);
  - `len`, the days it lasts;
  - `lead`, how many days before it its study window opens;
  - `ids`, its chapters in reading order.
- Hebrew dates come from the browser's own Hebrew calendar (`Intl.DateTimeFormat("en-u-ca-hebrew")`). Pearls scans
  400 days ahead and finds the next occurrence of each event that hasn't ended.
- **Postponements:**
  - A fast that falls on Shabbat moves to Sunday. The Fast of Esther moves back to Thursday instead.
  - Yom Ha-atzmaut moves from Friday or Shabbat back to Thursday, and from Monday to Tuesday. Yom Ha-zikaron is the
    day before; both are in one entry.
- **Chapters added only in some years:**
  - 04-14, when Erev Pesaḥ is on Shabbat.
  - 13-08 (Hak'hel), in the year after a Shemita year (Hebrew year % 7 == 1).
  - 12-08 (Eruv Tavshilin), when a Yom Tov day falls on a Friday. If it falls on a Thursday, the chapter is added
    with a note that the eruv is needed outside Israel.
- **Study windows (`lead`):**

  | Kind of day | Window |
  |---|---|
  | Major festivals (Rosh Ha-shana, Sukkot, Ḥanuka, Purim, Pesaḥ, Shavu'ot) | 30 days |
  | Yom Kippur | 10 days, from Rosh Ha-shana |
  | Tish'a Be-Av | 21 days, from 17 Tammuz |
  | Other fasts | 7 days |
  | Smaller days | 3–7 days |

  Elul, Adar and Birkat Ha-ilanot have no window before them. They are recommended for their whole duration (Elul,
  Nisan, and Adar until Purim).
- **In the app (`www/app.js`):**
  - `CAL` holds the occurrences; `CAL_NOW` holds those whose study window is open.
  - Home shows an "On the calendar" shelf: what's in its window first, then what's next. The eyebrow names the
    nearest event ("Ḥanuka in 15 days").
  - `#calendar` lists the year by Hebrew month.
  - Each event opens as a playlist, `#pl-cal-<id>`, with Play, Shuffle, Download and Save a copy.
- **Ranking:**
  - In `recommend()`, a chapter of an event whose window is open gets +0.75, plus 0.25 more in the last week, and the
    reason "Ḥanuka in 15 days".
  - The old tag-based season boost (+0.55) applies only when no event's window is open.
  - "Made for you" shows the nearest event's playlist in place of the old season mix.

## Sources and curatorship

- **Chapters:** every chapter was chosen by its title and section titles in the catalogue (`www/catalog.js`,
  `www/catalog_he.js`), checked 30 October 2026.
  - Each festival gets its own chapters, plus the general Yom Tov chapters (Laws of the Festivals 2, 3, 4, 7) and,
    for Pesaḥ, Sukkot and Shavu'ot, Yom Tov Sheni (12-09).
  - Pesaḥ and Sukkot also get Ḥol Ha-mo'ed (12-10 to 12-12).
- **Related reading, not the day's own laws:**
  - Tu Bi-Shvat: Berakhot 8 and Kashrut 13 and 2 (AI translations). Peninei Halakha has no Tu Bi-Shvat chapter.
  - Birkat Ha-ilanot: Women's Prayer 23, section 11.
- **Excluded:**
  - Weekly Shabbat, which has its own place in the app.
  - The minor customs without a chapter of their own (Shabbat Zakhor, Kiddush Levana).
  - The untranslated Hebrew-only chapters (06, 11, 16, which have no English titles yet).
- **Dates:** checked against known dates by `test_calendar.py`: the 2025 postponements, 5787 and 5788, and Hak'hel
  5790.
- **Biases:**
  - Dates follow Israel, as Peninei Halakha does.
  - The festival lists lean on the English volumes, so volumes still in translation are under-represented.

## Limits

- The Hebrew date turns at nightfall. The app uses the civil day, so on the evening before a festival it still says
  "tomorrow".
- Outside Israel the second festival days aren't listed as dates of their own; the text says so on the calendar page.
- A WebView without the Hebrew calendar in `Intl` shows no calendar features. All supported Android and Apple
  versions have it.
- You can tell when the calendar is wrong: every event shows its Hebrew and civil date, so a mismatch is visible on
  `#calendar`.

## How to update it

- Edit the `EVENTS` list in `www/calendar.js`: chapter ids, `lead`, `len`, `note`. The app drops chapters that
  aren't in the catalogue.
- Add a known date to `CASES` in `test_calendar.py` for any new rule, then run `python3 test_calendar.py`, which must
  end "calendar: N/N".
- Then run `./build.sh` and `python3 test_app.py`.
