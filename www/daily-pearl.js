/* The Daily Pearl (הפנינה היומית): Peninei Halakha's own daily study, two halakhot a day, sent by
   Yeshivat Har Bracha on WhatsApp, email and Telegram (https://ph.yhb.org.il/pninayomit-en/).
   There is no feed for it. The schedule below is copied from Peninei Halakha's printed study bookmark
   for 5787 ("סימניית הלימוד – תשפ"ז", https://ph.yhb.org.il/wp-content/uploads/2026/07/סימנייה-–-תשפז.pdf),
   one token per civil day from 12 Sept 2026 (1 Tishrei) to 1 Oct 2027 (29 Elul), exactly as printed,
   including two slips in the bookmark: Kashrut 4:4-8 are skipped (29-30 Sept 2026) and Ḥafetzei Kodesh
   9:11 is printed twice (6-7 June 2027).
   Token: [book:]chapter.halakha[-[chapter.]halakha]; "+" joins two references on one day. A book
   prefix sets the book for that token and the ones after it. Books: 15 Days of Awe, 17 Kashrut,
   21 Ḥafetzei Kodesh, 11 Family. A new year is a new bookmark: add it to YEARS. */
(function () {
  const YEARS = [{
    year: "5787", start: "2026-09-12",
    source: "https://ph.yhb.org.il/wp-content/uploads/2026/07/%D7%A1%D7%99%D7%9E%D7%A0%D7%99%D7%99%D7%94-%E2%80%93-%D7%AA%D7%A9%D7%A4%D7%96.pdf",
    days: "15:10.10-11 10.12-13 10.14-15 10.16-17 10.18+17:1.1 1.2-3 1.4-5 1.6-2.1 2.2-3 2.4-5 2.6-7 2.8-9 2.10-11 3.1-2 3.3-4 3.5-6 3.7-4.1 4.2-3 5.1-2 5.3-4 5.5-6.1 6.2-3 6.4-5 6.6-7 6.8-9 7.1-2 7.3-4 7.5-6 7.7-8 7.9-10 7.11-12 7.13-14 7.15-8.1 8.2-3 8.4-5 8.6-7 8.8-9 8.10-11 8.12-13 9.1-2 9.3-4 9.5-6 9.7-8 9.9-10 9.11-12 9.13-14 10.1-2 10.3-4 10.5-11.1 11.2-3 11.4-5 11.6-7 11.8-9 11.10-11 11.12-13 12.1-2 12.3-4 12.5-6 12.7-8 12.9-10 12.11-12 12.13-14 12.15-16 12.17-13.1 13.2-3 13.4-5 13.6-7 13.8-9 13.10-11 13.12-13 13.14-15 14.1-2 14.3-4 14.5-6 15.1-2 15.3-4 15.5-6 15.7-8 15.9-10 15.11-12 15.13-14 15.15-16.1 16.2-3 16.4-17.1 17.2-3 17.4-5 17.6-7 17.8-18.1 18.2-3 18.4-5 18.6-7 18.8-9 18.10-11 19.1-2 19.3-4 19.5-6 19.7-8 19.9-10 19.11-20.1 20.2-3 20.4-5 20.6-7 20.8-9 20.10-11 20.12-13 20.14-15 20.16-21.1 21.2-3 21.4-5 21.6-7 21.8-9 22.1-2 22.3-4 22.5-6 22.7-8 22.9-10 22.11-12 22.13-14 23.1-2 23.3-4 23.5-6 23.7-8 23.9-10 23.11-12 23.13-14 23.15-16 23.17-18 24.1-2 24.3-4 24.5-25.1 25.2-3 25.4-5 25.6-7 25.8-9 25.10-11 25.12-13 25.14-15 26.1-2 26.3-4 26.5-6 26.7-8 26.9-27.1 27.2-3 27.4-5 27.6-7 28.1-2 28.3-4 28.5-6 28.7-8 28.9-10 28.11-29.1 29.2-3 29.4-5 29.6-7 29.8-9 29.10-11 29.12-13 29.14-30.1 30.2-3 30.4-5 30.6-7 30.8-9 30.10-11 30.12-31.1 31.2-3 31.4-5 31.6-7 31.8-9 31.10-32.1 32.2-3 32.4-5 32.6-7 32.8-9 32.10-11 32.12-13 32.14-33.1 33.2-3 33.4-5 33.6-7 33.8-9 33.10-11 34.1-2 34.3-4 34.5-6 34.7-8 34.9-10 34.11-12 34.13-14 34.15-16 34.17-18 35.1-2 35.3-4 35.5-6 35.7-8 35.9-10 36.1-2 36.3-4 36.5-6 36.7-8 37.1-2 37.3-4 37.5-6 37.7-8 37.9-10 37.11-38.1 38.2-3 38.4-5 38.6-7 38.8-9 38.10-11 21:1.1-2 1.3-4 1.5-6 1.7-8 1.9-10 1.11-12 1.13-2.1 2.2-3 2.4-5 2.6-7 2.8-9 2.10-11 2.12-13 2.14-15 2.16-17 3.1-2 3.3-4 3.5-6 3.7-8 3.9-10 3.11-12 3.13-14 3.15-16 3.17-18 3.19-20 4.1-2 4.3-4 4.5-6 4.7-8 4.9-10 4.11-12 4.13-14 4.15-5.1 5.2-3 5.4-6.1 6.2-3 6.4-5 6.6-7 6.8-9 6.10-11 7.1-2 7.3-4 7.5-6 7.7-8 7.9-10 7.11-12 7.13-14 8.1-2 8.3-4 8.5-6 8.7-8 8.9-10 8.11-9.1 9.2-3 9.4-5 9.6-7 9.8-9 9.10-11 9.11-12 9.13-14 10.1-2 10.3-4 10.5-6 10.7-8 10.9-10 10.11-12 10.13-14 10.15-16 10.17-18 10.19-20 10.21-11.1 11.2-3 11.4-5 11.6-7 11.8-9 11.10-11 11.12-13 11.14-15 11.16-17 11.18-19 12.1-2 12.3-4 12.5-6 12.7-8 12.9-10 12.11-12 12.13-13.1 13.2-3 13.4-5 13.6-7 13.8-9 13.10-11 14.1-2 14.3-4 14.5-6 14.7-8 14.9-10 15.1-2 15.3-4 15.5-6 15.7-8 15.9-10 15.11-12 15.13-14 15.15-16 15.17-18 15.19-20 11:1.1-2 1.3-4 1.5-6 1.7-8 1.9-10 1.11-12 1.13-14 1.15-16 1.17-18 1.19-20 1.21-22 1.23-24 1.25-26 1.27-28 1.29-30 2.1-2 2.3-4 2.5-6 2.7-8 2.9-10 2.11-12 2.13-14 2.15-16 2.17-18 3.1-2 3.3-4 3.5-6 3.7-8 3.9-10 3.11-12 4.1-2 4.3-4 4.5-6 4.7-8 4.9-10 4.11-12 4.13-14 4.15-16 4.17-18 4.19-20 5.1-2 5.3-4 5.5-6 5.7-8 5.9-10 5.11-12 5.13-14 5.15-16 5.17-18 5.19-20 5.21-22 5.23-24 5.25-6.1 6.2-3 6.4-5 6.6-7 6.8-9 6.10-11 6.12-7.1 7.2-3 7.4-5 7.6-7 7.8-9 7.10-11 7.12-13 7.14-15 7.16-17 7.18-19"
  }];
  const DAY = 864e5;
  const isoUTC = d => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  function decode(y) {
    if (y.list) return y.list;
    let book = null; y.list = [];
    for (const tok of y.days.split(" ")) {
      const parts = [];
      for (let p of tok.split("+")) {
        const m = p.match(/^(?:(\d{2}):)?(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?$/);
        if (!m) throw new Error("daily-pearl: bad token " + p);
        if (m[1]) book = m[1];
        const c1 = +m[2], h1 = +m[3], c2 = m[4] ? +m[4] : c1, h2 = m[5] ? +m[5] : h1;
        if (c2 === c1) parts.push({ book, ch: c1, from: h1, to: h2 });
        else { parts.push({ book, ch: c1, from: h1, to: null }); parts.push({ book, ch: c2, from: 1, to: h2 }); }
      }
      y.list.push(parts);
    }
    return y.list;
  }
  /* forDate(date) -> { year, iso, parts: [{book, ch, from, to}] } or null outside the schedule.
     to === null means "to the end of the chapter". The date is the local civil date: the messages go out in the morning. */
  function forDate(date) {
    const day = isoUTC(date || new Date());
    for (const y of YEARS) {
      const i = Math.round((day - new Date(y.start + "T00:00:00Z")) / DAY), list = decode(y);
      if (i >= 0 && i < list.length) return { year: y.year, source: y.source, iso: day.toISOString().slice(0, 10), parts: list[i] };
    }
    return null;
  }
  const last = () => { const y = YEARS[YEARS.length - 1]; return new Date(Date.parse(y.start + "T00:00:00Z") + (decode(y).length - 1) * DAY).toISOString().slice(0, 10); };
  window.PH_DAILY = { YEARS, forDate, last, page: "https://ph.yhb.org.il/pninayomit-en/", pageHe: "https://ph.yhb.org.il/pninayomit/" };
})();
