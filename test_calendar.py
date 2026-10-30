"""The calendar (www/calendar.js) against known dates, postponements included. Must end "calendar: N/N"."""
import json, subprocess
JS = r"""
global.window = {}; require('./www/calendar.js');
const C = window.PH_CAL, out = {};
for (const y of [2025, 2026, 2027, 2028, 2029]) for (const o of C.upcoming(new Date(y, 0, 1))) {
  const d = o.date; out[`${o.id}@${o.hy}`] = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}|${o.extra.join(';')}`;
}
console.log(JSON.stringify(out));
"""
r = json.loads(subprocess.run(["node", "-e", JS], capture_output=True, text=True, check=True).stdout)
CASES = [  # (event@hebrew year, civil date, text that must be in the notes or "")
    ("taanit-esther@5785", "2025-03-13", ""), ("pesach@5785", "2025-04-13", "Erev Pesaḥ falls on Shabbat"),
    ("atzmaut@5785", "2025-05-01", ""),          # 5 Iyar on Shabbat -> Thursday
    ("tammuz@5785", "2025-07-13", ""),           # 17 Tammuz on Shabbat -> Sunday
    ("tisha-beav@5785", "2025-08-03", ""),       # 9 Av on Shabbat -> Sunday
    ("hanuka@5787", "2026-12-05", ""), ("purim@5787", "2027-03-23", ""), ("taanit-esther@5787", "2027-03-22", ""),
    ("pesach@5787", "2027-04-22", "Outside Israel"), ("shavuot@5787", "2027-06-11", "on a Friday"),
    ("rosh-hashana@5788", "2027-10-02", ""), ("yom-kippur@5788", "2027-10-11", ""), ("sukkot@5788", "2027-10-16", ""),
    ("sukkot@5790", "2029-09-24", "Hak'hel"),
]
ok = 0
for k, date, note in CASES:
    got = r.get(k, "|"); d, n = got.split("|", 1)
    if d == date and note in n: ok += 1
    else: print(f"FAIL {k}: expected {date} {note!r}, got {got!r}")
print(f"calendar: {ok}/{len(CASES)}")
