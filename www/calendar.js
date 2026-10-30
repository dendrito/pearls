/* Pearls · the Jewish calendar and what to read for it.
   Each event: when it falls (Hebrew month + day, with the standard postponements), how many days of study lead up to
   it ("lead"; 30 for the festivals, after "we ask and expound the laws of Pesach thirty days before Pesach",
   Pesachim 6a, Shulchan Arukh OC 429:1), how long it lasts ("len"), and the Peninei Halakha chapters for it, in
   reading order. Dates follow the calendar in Israel, as Peninei Halakha does. Method: docs/calendar-readings.md.
   Untranslated chapters are skipped at runtime. */
(function () {
  const FEST_YT = ["12-02", "12-03", "12-04", "12-07"];          // Yom Tov laws that apply to every festival
  const EVENTS = [
    { id: "elul", name: "Elul and Seliḥot", he: "אלול", m: ["Elul"], d: 1, len: 29, lead: 7, ids: ["15-01", "15-02"],
      note: "The month of preparation before Rosh Ha-shana." },
    { id: "rosh-hashana", name: "Rosh Ha-shana", he: "ראש השנה", m: ["Tishri"], d: 1, len: 2, lead: 30, yt: [1, 2],
      ids: ["15-03", "15-04", ...FEST_YT] },
    { id: "ten-days", name: "The Ten Days of Repentance", he: "עשרת ימי תשובה", m: ["Tishri"], d: 3, len: 7, lead: 2, fast: true,
      ids: ["15-05", "05-07"], note: "Begins with the Fast of Gedalya." },
    { id: "yom-kippur", name: "Yom Kippur", he: "יום כיפור", m: ["Tishri"], d: 10, len: 1, lead: 10,
      ids: ["15-06", "15-07", "15-08", "15-09", "15-10"] },
    { id: "sukkot", name: "Sukkot", he: "סוכות", m: ["Tishri"], d: 15, len: 7, lead: 30, yt: [15],
      ids: ["13-01", "13-02", "13-03", "13-04", "13-05", "12-10", "12-11", "12-12", ...FEST_YT, "12-09"], hakhel: "13-08" },
    { id: "hoshana-rabba", name: "Hoshana Rabba", he: "הושענא רבה", m: ["Tishri"], d: 21, len: 1, lead: 3, ids: ["13-06"] },
    { id: "shemini-atzeret", name: "Shemini Atzeret and Simḥat Torah", he: "שמיני עצרת", m: ["Tishri"], d: 22, len: 1, lead: 3, yt: [22], ids: ["13-07"] },
    { id: "hanuka", name: "Ḥanuka", he: "חנוכה", m: ["Kislev"], d: 25, len: 8, lead: 30, ids: ["05-11", "05-12", "05-13"] },
    { id: "asara-be-tevet", name: "The Tenth of Tevet", he: "עשרה בטבת", m: ["Tevet"], d: 10, len: 1, lead: 7, fast: true, ids: ["05-06", "05-07"] },
    { id: "tu-bishvat", name: "Tu Bi-Shvat", he: "ט״ו בשבט", m: ["Shevat"], d: 15, len: 1, lead: 7, ids: ["10-08", "17-13", "17-02"],
      note: "Related reading: the blessings over fruit, and the laws of fruit trees." },
    { id: "adar", name: "The month of Adar", he: "אדר", m: ["Adar", "Adar II"], d: 1, len: 13, lead: 0, ids: ["05-14"] },
    { id: "taanit-esther", name: "The Fast of Esther", he: "תענית אסתר", m: ["Adar", "Adar II"], d: 13, len: 1, lead: 7, fast: true, early: true, ids: ["05-07"] },
    { id: "purim", name: "Purim", he: "פורים", m: ["Adar", "Adar II"], d: 14, len: 2, lead: 30, ids: ["05-15", "05-16", "05-17"] },
    { id: "ilanot", name: "Birkat Ha-ilanot", he: "ברכת האילנות", m: ["Nisan"], d: 1, len: 29, lead: 0, ids: ["03-23"],
      note: "The blessing on trees in bloom, said once in Nisan (section 11 of this chapter)." },
    { id: "pesach", name: "Pesaḥ", he: "פסח", m: ["Nisan"], d: 15, len: 7, lead: 30, yt: [15, 21],
      ids: ["04-01", "04-02", "04-03", "04-04", "04-05", "04-06", "04-07", "04-08", "04-09", "04-10", "04-11", "04-12", "04-13", "04-15", "04-16", "12-10", "12-11", "12-12", ...FEST_YT, "12-09"] },
    { id: "omer", name: "Counting the Omer", he: "ספירת העומר", m: ["Nisan"], d: 16, len: 49, lead: 3, ids: ["05-02", "05-03"] },
    { id: "atzmaut", name: "Yom Ha-zikaron and Yom Ha-atzmaut", he: "יום העצמאות", m: ["Iyar"], d: 5, len: 1, lead: 7, atzmaut: true, ids: ["05-04"] },
    { id: "lag-baomer", name: "Lag Ba-omer", he: "ל״ג בעומר", m: ["Iyar"], d: 18, len: 1, lead: 5, ids: ["05-05"] },
    { id: "yerushalayim", name: "Yom Yerushalayim", he: "יום ירושלים", m: ["Iyar"], d: 28, len: 1, lead: 5, ids: ["05-04"] },
    { id: "shavuot", name: "Shavu'ot", he: "שבועות", m: ["Sivan"], d: 6, len: 1, lead: 30, yt: [6], ids: ["12-13", "12-01", ...FEST_YT, "12-09"] },
    { id: "tammuz", name: "The Seventeenth of Tammuz", he: "י״ז בתמוז", m: ["Tamuz"], d: 17, len: 1, lead: 7, fast: true, ids: ["05-06", "05-07", "05-08"] },
    { id: "tisha-beav", name: "Tish'a Be-Av", he: "תשעה באב", m: ["Av"], d: 9, len: 1, lead: 21, fast: true, ids: ["05-08", "05-09", "05-10"],
      note: "The Three Weeks lead up to it from the Seventeenth of Tammuz." },
  ];
  const DAY = 864e5;
  const fmt = (() => { try { return new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }); } catch { return null; } })();
  function heb(d) {
    const p = fmt.formatToParts(d), g = k => (p.find(x => x.type === k) || {}).value;
    return { d: +g("day"), m: g("month"), y: +(g("year") || g("relatedYear")) };
  }
  const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /* the days from `from` for `n` days, with their Hebrew dates */
  function days(from, n) { const out = [], s = midnight(from); for (let i = 0; i < n; i++) { const dt = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i); out.push({ dt, i, dow: dt.getDay(), ...heb(dt) }); } return out; }
  /* postponements: fasts don't fall on Shabbat (Esther's goes back to Thursday, the others forward to Sunday);
     Yom Ha-atzmaut moves off Friday/Shabbat to Thursday and off Monday to Tuesday */
  function shift(ev, day) {
    if (ev.fast && day.dow === 6) return ev.early ? -2 : 1;
    if (ev.atzmaut) { if (day.dow === 5) return -1; if (day.dow === 6) return -2; if (day.dow === 1) return 1; }
    return 0;
  }
  /* every occurrence of every event that hasn't ended, in the next `horizon` days (Rosh Hodesh: the next one only) */
  function upcoming(now = new Date(), horizon = 400) {
    if (!fmt) return [];
    const back = 60, all = days(new Date(now.getTime() - back * DAY), horizon + back), today = back, out = [];
    const at = (i) => all[i];
    for (const ev of EVENTS) {
      for (let i = 0; i < all.length; i++) {
        const x = all[i];
        if (x.d !== ev.d || !ev.m.includes(x.m)) continue;
        const s = i + shift(ev, x); if (!at(s)) continue;
        const end = s + ev.len - 1; if (end < today) continue;
        out.push(occurrence(ev, all, s, today));
        break;
      }
    }
    // the next Rosh Hodesh (not Tishri, which is Rosh Ha-shana); a 30-day month gives two days
    for (let i = today - 1; i < all.length; i++) {
      const x = all[i]; if (!x || x.d !== 1 || x.m === "Tishri") continue;
      const two = all[i - 1] && all[i - 1].d === 30, s = two ? i - 1 : i;
      if (i < today) continue;
      out.push(occurrence({ id: "rosh-hodesh", name: `Rosh Ḥodesh ${x.m}`, he: "ראש חודש", len: two ? 2 : 1, lead: 3, ids: ["05-01"] }, all, s, today));
      break;
    }
    return out.sort((a, b) => a.start - b.start);
  }
  function occurrence(ev, all, s, today) {
    const x = all[s], ids = ev.ids.slice(), extra = [];
    if (ev.id === "pesach") {   // Erev Pesah on Shabbat has its own chapter
      const erev = all[s - 1]; if (erev && erev.dow === 6) { ids.splice(ids.indexOf("04-13") + 1, 0, "04-14"); extra.push("Erev Pesaḥ falls on Shabbat this year"); }
    }
    if (ev.hakhel && x.y % 7 === 1) { ids.push(ev.hakhel); extra.push("A Hak'hel year: the Sukkot after the Shemita year"); }
    if (ev.yt) {                 // a Yom Tov on Friday needs an eruv tavshilin; on Thursday, only where a second day follows
      const dows = ev.yt.map(d => { const k = all.findIndex((y, j) => j >= s - 1 && y.m === x.m && y.d === d); return k >= 0 ? all[k].dow : -1; });
      if (dows.includes(5)) { ids.push("12-08"); extra.push("Yom Tov falls on a Friday this year: eruv tavshilin"); }
      else if (dows.includes(4)) { ids.push("12-08"); extra.push("Outside Israel, Yom Tov runs into Friday this year: eruv tavshilin"); }
    }
    return { ev, id: ev.id, name: ev.name, he: ev.he, start: s - today, end: s - today + ev.len - 1, date: x.dt, hd: x.d, hm: x.m, hy: x.y,
             inWindow: s - today - ev.lead <= 0, ids, note: ev.note || "", extra };
  }
  function when(o) {
    if (o.start > 1) return `in ${o.start} days`;
    if (o.start === 1) return "tomorrow";
    if (o.start === 0) return "today";
    if (o.end >= 0) return `day ${1 - o.start} of ${o.end - o.start + 1}`;
    return "";
  }
  window.PH_CAL = { EVENTS, upcoming, when, heb };
})();
