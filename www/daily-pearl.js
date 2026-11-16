/* The Daily Pearl (הפנינה היומית): Peninei Halakha's own daily study, two halakhot a day, sent by
   Yeshivat Har Bracha on WhatsApp, email and Telegram (https://ph.yhb.org.il/pninayomit-en/).
   There is no feed for it. The schedule below is copied from Peninei Halakha's printed study bookmark
   for 5787 ("סימניית הלימוד – תשפ"ז", https://ph.yhb.org.il/wp-content/uploads/2026/07/סימנייה-–-תשפז.pdf),
   one token per civil day from 12 Sept 2026 (1 Tishrei) to 1 Oct 2027 (29 Elul), exactly as printed,
   including two slips in the bookmark: Kashrut 4:4-8 are skipped (29-30 Sept 2026) and Ḥafetzei Kodesh
   9:11 is printed twice (6-7 June 2027).
   Token: [book:]chapter.halakha[-[chapter.]halakha]; "+" joins two references on one day. A book
   prefix sets the book for that token and the ones after it. Books: 15 Days of Awe, 17 Kashrut,
   21 Ḥafetzei Kodesh, 11 Family. A new year is a new bookmark: add it to YEARS. Until someone does, the app finds and reads it by itself
   (update() below), and keeps it on the device. */
(function () {
  const YEARS = [{
    year: "5787", start: "2026-09-12",
    source: "https://ph.yhb.org.il/wp-content/uploads/2026/07/%D7%A1%D7%99%D7%9E%D7%A0%D7%99%D7%99%D7%94-%E2%80%93-%D7%AA%D7%A9%D7%A4%D7%96.pdf",
    days: "15:10.10-11 10.12-13 10.14-15 10.16-17 10.18+17:1.1 1.2-3 1.4-5 1.6-2.1 2.2-3 2.4-5 2.6-7 2.8-9 2.10-11 3.1-2 3.3-4 3.5-6 3.7-4.1 4.2-3 5.1-2 5.3-4 5.5-6.1 6.2-3 6.4-5 6.6-7 6.8-9 7.1-2 7.3-4 7.5-6 7.7-8 7.9-10 7.11-12 7.13-14 7.15-8.1 8.2-3 8.4-5 8.6-7 8.8-9 8.10-11 8.12-13 9.1-2 9.3-4 9.5-6 9.7-8 9.9-10 9.11-12 9.13-14 10.1-2 10.3-4 10.5-11.1 11.2-3 11.4-5 11.6-7 11.8-9 11.10-11 11.12-13 12.1-2 12.3-4 12.5-6 12.7-8 12.9-10 12.11-12 12.13-14 12.15-16 12.17-13.1 13.2-3 13.4-5 13.6-7 13.8-9 13.10-11 13.12-13 13.14-15 14.1-2 14.3-4 14.5-6 15.1-2 15.3-4 15.5-6 15.7-8 15.9-10 15.11-12 15.13-14 15.15-16.1 16.2-3 16.4-17.1 17.2-3 17.4-5 17.6-7 17.8-18.1 18.2-3 18.4-5 18.6-7 18.8-9 18.10-11 19.1-2 19.3-4 19.5-6 19.7-8 19.9-10 19.11-20.1 20.2-3 20.4-5 20.6-7 20.8-9 20.10-11 20.12-13 20.14-15 20.16-21.1 21.2-3 21.4-5 21.6-7 21.8-9 22.1-2 22.3-4 22.5-6 22.7-8 22.9-10 22.11-12 22.13-14 23.1-2 23.3-4 23.5-6 23.7-8 23.9-10 23.11-12 23.13-14 23.15-16 23.17-18 24.1-2 24.3-4 24.5-25.1 25.2-3 25.4-5 25.6-7 25.8-9 25.10-11 25.12-13 25.14-15 26.1-2 26.3-4 26.5-6 26.7-8 26.9-27.1 27.2-3 27.4-5 27.6-7 28.1-2 28.3-4 28.5-6 28.7-8 28.9-10 28.11-29.1 29.2-3 29.4-5 29.6-7 29.8-9 29.10-11 29.12-13 29.14-30.1 30.2-3 30.4-5 30.6-7 30.8-9 30.10-11 30.12-31.1 31.2-3 31.4-5 31.6-7 31.8-9 31.10-32.1 32.2-3 32.4-5 32.6-7 32.8-9 32.10-11 32.12-13 32.14-33.1 33.2-3 33.4-5 33.6-7 33.8-9 33.10-11 34.1-2 34.3-4 34.5-6 34.7-8 34.9-10 34.11-12 34.13-14 34.15-16 34.17-18 35.1-2 35.3-4 35.5-6 35.7-8 35.9-10 36.1-2 36.3-4 36.5-6 36.7-8 37.1-2 37.3-4 37.5-6 37.7-8 37.9-10 37.11-38.1 38.2-3 38.4-5 38.6-7 38.8-9 38.10-11 21:1.1-2 1.3-4 1.5-6 1.7-8 1.9-10 1.11-12 1.13-2.1 2.2-3 2.4-5 2.6-7 2.8-9 2.10-11 2.12-13 2.14-15 2.16-17 3.1-2 3.3-4 3.5-6 3.7-8 3.9-10 3.11-12 3.13-14 3.15-16 3.17-18 3.19-20 4.1-2 4.3-4 4.5-6 4.7-8 4.9-10 4.11-12 4.13-14 4.15-5.1 5.2-3 5.4-6.1 6.2-3 6.4-5 6.6-7 6.8-9 6.10-11 7.1-2 7.3-4 7.5-6 7.7-8 7.9-10 7.11-12 7.13-14 8.1-2 8.3-4 8.5-6 8.7-8 8.9-10 8.11-9.1 9.2-3 9.4-5 9.6-7 9.8-9 9.10-11 9.11-12 9.13-14 10.1-2 10.3-4 10.5-6 10.7-8 10.9-10 10.11-12 10.13-14 10.15-16 10.17-18 10.19-20 10.21-11.1 11.2-3 11.4-5 11.6-7 11.8-9 11.10-11 11.12-13 11.14-15 11.16-17 11.18-19 12.1-2 12.3-4 12.5-6 12.7-8 12.9-10 12.11-12 12.13-13.1 13.2-3 13.4-5 13.6-7 13.8-9 13.10-11 14.1-2 14.3-4 14.5-6 14.7-8 14.9-10 15.1-2 15.3-4 15.5-6 15.7-8 15.9-10 15.11-12 15.13-14 15.15-16 15.17-18 15.19-20 11:1.1-2 1.3-4 1.5-6 1.7-8 1.9-10 1.11-12 1.13-14 1.15-16 1.17-18 1.19-20 1.21-22 1.23-24 1.25-26 1.27-28 1.29-30 2.1-2 2.3-4 2.5-6 2.7-8 2.9-10 2.11-12 2.13-14 2.15-16 2.17-18 3.1-2 3.3-4 3.5-6 3.7-8 3.9-10 3.11-12 4.1-2 4.3-4 4.5-6 4.7-8 4.9-10 4.11-12 4.13-14 4.15-16 4.17-18 4.19-20 5.1-2 5.3-4 5.5-6 5.7-8 5.9-10 5.11-12 5.13-14 5.15-16 5.17-18 5.19-20 5.21-22 5.23-24 5.25-6.1 6.2-3 6.4-5 6.6-7 6.8-9 6.10-11 6.12-7.1 7.2-3 7.4-5 7.6-7 7.8-9 7.10-11 7.12-13 7.14-15 7.16-17 7.18-19"
  }];
  const DAY = 864e5;
  const isoUTC = d => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const KEY = "pearls.dailyYears", CHECKED = "pearls.dailyCheck";
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
  // Years Pearls found by itself (see update() below), kept on the device. A bundled year always wins.
  function stored() {
    try { return (JSON.parse(localStorage.getItem(KEY) || "[]") || []).filter(y => y && y.year && y.start && y.days); } catch (e) { return []; }
  }
  function all() {
    const have = new Set(YEARS.map(y => y.year));
    return YEARS.concat(stored().filter(y => !have.has(y.year))).sort((a, b) => a.start < b.start ? -1 : 1);
  }
  /* forDate(date) -> { year, iso, parts: [{book, ch, from, to}] } or null outside the schedule.
     to === null means "to the end of the chapter". The date is the local civil date: the messages go out in the morning. */
  function forDate(date) {
    const day = isoUTC(date || new Date());
    for (const y of all()) {
      let list; try { list = decode(y); } catch (e) { continue; }
      const i = Math.round((day - new Date(y.start + "T00:00:00Z")) / DAY);
      if (i >= 0 && i < list.length) return { year: y.year, source: y.source, found: y.found || null, iso: day.toISOString().slice(0, 10), parts: list[i] };
    }
    return null;
  }
  const endOf = y => new Date(Date.parse(y.start + "T00:00:00Z") + (decode(y).length - 1) * DAY).toISOString().slice(0, 10);
  const last = () => { const ys = all(); return endOf(ys[ys.length - 1]); };

  /* ---- Finding next year's schedule by itself ----
     Peninei Halakha links each year's bookmark from its Daily Pearl page ("להורדת סימניית הלימוד - תשפ"ח").
     From two months before the schedule runs out, once a day at most, Pearls reads that page, and if it links a
     bookmark for a year it doesn't have, reads the PDF (pdf-text.js), turns its weekly grid into a schedule the
     same way the bundled one was made, checks every day against the Hebrew calendar and every reference against
     the catalogue, and keeps it only if all of that holds. Nothing is guessed: a bookmark it can't read is left
     alone, and Home keeps linking to Peninei Halakha. */
  const G = { "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40,
    "נ": 50, "ן": 50, "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400 };
  const num = s => [...String(s)].reduce((a, c) => a + (G[c] || 0), 0);
  const hebYear = s => 5000 + num(String(s).replace(/^ה['׳]?/, ""));   // תשפ"ח -> 5788 (a leading ה' is the thousands)
  // PDFs keep Hebrew in the order it's drawn, left to right; read it back right to left
  const rtl = s => /[א-ת]/.test(s) ? [...s].reverse().join("") : s;

  /* pages: PDF_TEXT.items() output. books: [{id, he}]. Returns { days, issues }: days is the token string, or null. */
  function parseBookmark(pages, start, books) {
    const issues = [], weeks = [], labels = [];
    // the columns: from the centres of the day names over the grid ("ראשון" on the right … "שבת" on the left)
    let sun = 215, sat = 39.5;
    for (const items of pages) for (const i of items) {
      const t = rtl(i.s).trim();
      if (t === "ראשון") sun = i.x + i.w / 2; else if (t === "שבת" && i.x < 120) sat = i.x + i.w / 2;
    }
    const step = (sun - sat) / 6;
    const colOf = i => Math.max(0, Math.min(6, Math.round((sun - (i.x + i.w / 2)) / step)));   // 0 = Sunday
    const isEnt = s => /^[א-ת]{1,3}\|[א-ת]{1,3}(-[א-ת]{1,3}(\|[א-ת]{1,3})?)?$/.test(s);
    pages.forEach((items, pi) => {
      // the book names, printed down the right-hand margin
      const side = items.filter(i => i.x > 228 && i.s.trim()).sort((a, b) => a.y - b.y);
      for (const i of side) {   // a name set vertically can come in pieces ("כשרות", "א")
        const prev = labels[labels.length - 1];
        if (prev && prev.pi === pi && i.y - prev.y < 14) { prev.s += " " + rtl(i.s); prev.y = i.y; } else labels.push({ pi, y: i.y, s: rtl(i.s) });
      }
      const rows = {};
      for (const i of items) { const k = Math.round(i.y / 3) * 3; (rows[k] = rows[k] || []).push(i); }
      let cur = null;
      for (const k of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
        const r = rows[k];
        const nums = r.filter(i => /^\d{1,2}$/.test(i.s.trim()) && i.x < 215 && i.x >= 25);
        const ents = r.map(i => ({ x: i.x, w: i.w, s: rtl(i.s).replace(/[\s"״'׳]+/g, "").replace(/[–—־]/g, "-") })).filter(i => i.s.includes("|"));
        const good = ents.filter(i => isEnt(i.s));
        // a parasha or festival name ("וישב|חנוכה") is a label, not a reference; anything else unread is a problem
        ents.filter(i => !isEnt(i.s) && !/[א-ת]{4}/.test(i.s)).forEach(i => issues.push("unread entry " + i.s));
        if (nums.length && !ents.length) {
          if (!(cur && k - cur.k <= 6 && !Object.keys(cur.ent).length)) { cur = { k, days: {}, ent: {} }; weeks.push(cur); } else cur.k = k;
          nums.forEach(i => (cur.days[colOf(i)] = +i.s.trim()));
        } else if (cur && good.length) good.forEach(i => { const c = colOf(i); (cur.ent[c] = cur.ent[c] || []).push(i.s); });
      }
    });
    // the days in order, each checked against the calendar
    const days = []; let d = new Date(start + "T00:00:00Z");
    for (const w of weeks) for (let c = 0; c < 7; c++) {
      if (w.days[c] === undefined) continue;
      if (d.getUTCDate() !== w.days[c] || d.getUTCDay() !== c) issues.push("date " + d.toISOString().slice(0, 10) + " printed as " + w.days[c]);
      days.push(w.ent[c] || null); d = new Date(d.getTime() + DAY);
    }
    // the books: margin labels in order, a volume letter dropped ("כשרות ב" is still Kashrut)
    const names = [];
    for (const l of labels) {
      const t = l.s.replace(/\s+/g, " ").trim(), base = t.replace(/ [אב]$/, "");
      const b = books.find(x => x.he === t) || books.find(x => x.he === base);
      if (!b) { issues.push("unknown book " + t); continue; }
      if (names[names.length - 1] !== b.id) names.push(b.id);
    }
    const toks = []; let seg = -1, last = null;
    for (const e of days) {
      if (!e) { issues.push("a day with nothing printed"); toks.push(""); continue; }
      const out = [];
      const refs = [];
      for (const s of e) {
        const p = s.split("|"), r = p[1].split("-");
        const from = { c: num(p[0]), h: num(r[0]) }, to = p.length === 3 ? { c: num(r[1]), h: num(p[2]) } : { c: from.c, h: num(r[1] || r[0]) };
        // "end of one book – start of the next" in one cell reads like a range that runs backwards: it's two references
        if (to.c < from.c) refs.push([from, from], [to, to]); else refs.push([from, to]);
      }
      for (const [from, to] of refs) {
        // a new book starts where the chapters go back (a halakha printed twice is a slip, not a new book)
        const fresh = !last || from.c < last.c || (from.c === last.c && from.h === 1 && last.h > 2);
        if (fresh) seg++;
        const body = to.c === from.c ? from.c + "." + from.h + (to.h !== from.h ? "-" + to.h : "") : from.c + "." + from.h + "-" + to.c + "." + to.h;
        out.push((fresh ? (names[seg] || "??") + ":" : "") + body);
        last = to;
      }
      toks.push(out.join("+"));
    }
    if (seg + 1 !== names.length) issues.push("books printed " + names.length + ", book changes found " + (seg + 1));
    return { days: issues.length ? null : toks.join(" "), count: days.length, issues };
  }

  /* Every reference has to be a chapter and halakha Pearls knows. */
  function verify(y) {
    const secs = {}, cats = [window.PH_CATALOG, window.PH_CATALOG_HE].filter(Boolean);
    for (const c of cats) for (const v of c.volumes) for (const ch of v.chapters) secs[v.book + "-" + ch.n] = ch.sections;
    const bad = [];
    decode(y).forEach((parts, i) => { for (const p of parts) { const n = secs[p.book + "-" + p.ch]; if (!n || p.from > n || (p.to != null && p.to > n)) bad.push(i); } });
    return bad;
  }

  /* The first day of Hebrew year hy (1 Tishrei), as an ISO date. */
  function roshHashana(hy) {
    const cal = window.PH_CAL; if (!cal || !cal.heb) return null;
    for (let i = 0; i < 45; i++) {
      const d = new Date(hy - 3761, 7, 25 + i), h = cal.heb(d);
      if (h.y === hy && h.d === 1 && h.m === "Tishri") return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    }
    return null;
  }

  /* The bookmark links on the Daily Pearl page: [{year, url}] */
  function links(html, base) {
    const out = [], seen = new Set(), re = /<a\b[^>]*href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(html))) {
      let href = m[1].replace(/&amp;/g, "&"), file = href;
      try { file = decodeURIComponent(href); } catch (e) { /* keep it */ }
      // the year is in the link text ("להורדת סימניית הלימוד - תשפ"ז") or, failing that, the file name (סימנייה-–-תשפז.pdf)
      const text = m[2].replace(/<[^>]+>/g, " ").replace(/&quot;|&#8221;|&#8243;|&#034;/g, "\"") + " " + file.split("/").pop();
      if (!/סימני/.test(text)) continue;
      const ym = /(?:^|[^א-ת])(ת[א-ת]{0,2}["״]?[א-ת])(?![א-ת])/.exec(text.replace(/סימני[א-ת]*/g, " "));
      if (!ym) continue;
      let url; try { url = new URL(href, base).href; } catch (e) { continue; }
      if (seen.has(url)) continue; seen.add(url);
      out.push({ year: String(hebYear(ym[1].replace(/["״]/g, ""))), url });
    }
    return out;
  }

  /* Is it time to look? Two months before the schedule ends, and not more than once a day. */
  function due(now) {
    now = now || new Date();
    const end = Date.parse(last() + "T00:00:00Z");
    if (now.getTime() < end - 60 * DAY) return false;
    try { if (now.getTime() - (+localStorage.getItem(CHECKED) || 0) < DAY) return false; } catch (e) { /* no storage: look anyway */ }
    return true;
  }

  /* update(get): get(url, "text"|"bytes") -> Promise. Resolves to the year it added, or null; never throws. */
  async function update(get, opts) {
    opts = opts || {};
    if (!opts.force && !due(opts.now)) return null;
    try { localStorage.setItem(CHECKED, String((opts.now || new Date()).getTime())); } catch (e) { /* fine */ }
    try {
      const newest = Math.max(...all().map(y => +y.year));
      const html = await get(PAGE_HE, "text");
      const fresh = links(html, PAGE_HE).filter(l => +l.year > newest).sort((a, b) => +a.year - +b.year);
      for (const l of fresh) {
        const y = await read(get, l);
        if (y) return y;
      }
    } catch (e) { report("Daily Pearl: couldn't look for a new schedule (" + (e && e.message || e) + ")"); }
    return null;
  }
  async function read(get, l) {
    const start = roshHashana(+l.year), next = roshHashana(+l.year + 1);
    if (!start || !next || !window.PDF_TEXT) return null;
    const pages = await window.PDF_TEXT.items(await get(l.url, "bytes"));
    const books = Object.keys(window.PH_META || {}).map(id => ({ id, he: window.PH_META[id].heb }));
    const r = parseBookmark(pages, start, books);
    const length = Math.round((Date.parse(next) - Date.parse(start)) / DAY);
    if (r.days && r.count !== length) r.issues.push("the year has " + length + " days, the bookmark " + r.count);
    if (!r.days || r.issues.length) { report("Daily Pearl " + l.year + ": not used (" + r.issues.slice(0, 3).join("; ") + ")"); return null; }
    const y = { year: l.year, start, source: l.url, days: r.days, found: new Date().toISOString().slice(0, 10) };
    const bad = verify(y);
    if (bad.length) { report("Daily Pearl " + l.year + ": " + bad.length + " references Pearls doesn't have; not used"); return null; }
    delete y.list;
    try { localStorage.setItem(KEY, JSON.stringify(stored().filter(s => s.year !== y.year).concat([y]))); } catch (e) { return null; }
    return y;
  }
  const report = m => { try { console.warn(m); } catch (e) { /* fine */ } };
  const PAGE_HE = "https://ph.yhb.org.il/pninayomit/";

  window.PH_DAILY = { YEARS, years: all, forDate, last, update, due, stored, parseBookmark, links, verify, roshHashana,
    page: "https://ph.yhb.org.il/pninayomit-en/", pageHe: PAGE_HE };
})();
