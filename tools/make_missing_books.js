// node tools/make_missing_books.js  -> www/cite-missing.js
// The books Peninei Halakha cites that Sefaria does not hold (so Pearls names them rather than linking them),
// with how often each is cited and in which chapters. Read by the #missing page.
// Re-run after changing pearls-cite-links.js or adding chapters.
'use strict';
const fs = require('fs'), path = require('path');
global.window = global;
global.localStorage = {getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0};
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'www/meldar-cite.js'));
require(path.join(ROOT, 'www/pearls-cite-links.js'));
function load(file) { let got; const cb = x => { got = x; }; new Function('window', 'PH_BOOK_LOAD', fs.readFileSync(file, 'utf8'))({PH_BOOK_LOAD: cb}, cb); return got; }
const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…'};
const runs = html => String(html || '').replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '\n')
  .replace(/<\/?(p|div|li|ul|ol|blockquote|h\d|br|tr|td|table|section)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] != null ? ENT[n] : m).split(/\n+/).map(s => s.trim()).filter(s => s.length > 2);
const SEF = (() => { const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'www/sefaria.js'), 'utf8'))(w); return w.PH_SEFARIA; })();
const pageRef = id => { const [b, n] = id.split('-'); const m = SEF[b]; return m && +n ? `Peninei Halakhah, ${m.t} ${+n}` : ''; };

const docs = [];
for (const f of fs.readdirSync(path.join(ROOT, 'www/en')).sort()) {
  const d = load(path.join(ROOT, 'www/en', f));
  docs.push({id: f.slice(0, 5), html: (Array.isArray(d) ? d : d.sections || []).map(s => s.content ? s.content.rendered : '')});
}
for (const f of fs.readdirSync(path.join(ROOT, 'www/books')).sort()) {
  const d = load(path.join(ROOT, 'www/books', f));
  docs.push({id: d.id, html: d.sections.flatMap(s => [s.body_en].concat((s.notes_en || []).map(n => n.en)))});
}
for (const f of fs.readdirSync(path.join(ROOT, 'work/he')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'work/he', f), 'utf8'));
  docs.push({id: f.slice(0, 5), he: true, html: d.sections.flatMap(s => [s.body_he].concat((s.notes_he || s.notes || []).map(n => n.he || n.text || '')))});
}

// One key per book, whatever the spelling: Yeḥaveh Da’at = Yechaveh Daat, Shevet Ha-Levi = Shevet HaLevi.
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ch|kh/g, 'h').replace(/[^a-z]/g, '').replace(/([a-z])\1+/g, '$1').replace(/[aeiouy]+/g, 'a');
const ABSENT = /not on Sefaria|not in Sefaria|in Sefaria’s catalogue|without text/i;
const books = {};
for (const d of docs) {
  const ref = pageRef(d.id);
  for (const t of d.html.flatMap(runs)) {
    let hits = []; try { hits = window.PEARLS_CITE.find(t, {ref}); } catch (e) { continue; }
    for (const h of hits) {
      if (h.resolved || !h.work || h.work === '?' || !ABSENT.test(h.why || '')) continue;
      if (/^(?:Rosh|Rema|Mishneh Torah|Mishnah Berurah)$/.test(h.work)) continue;   // on Sefaria; this citation just lacks a detail
      const k = fold(h.work), b = books[k] || (books[k] = {key: k, names: {}, he: {}, n: 0, ch: new Set()});
      b.n++; b.ch.add(d.id);
      if (d.he) b.he[h.work] = 1;
      else b.names[h.work] = (b.names[h.work] || 0) + 1;
    }
  }
}
// the name shown, and the Hebrew name (written by hand; a book not here shows its commonest English spelling)
const SHOW = {};
[
  ['Igrot Moshe', 'אגרות משה'],
  ['Yabi’a Omer', 'יביע אומר'],
  ['Tzitz Eliezer', 'ציץ אליעזר'],
  ['Shemirat Shabbat Ke-Hilkhata', 'שמירת שבת כהלכתה'],
  ['Yeḥaveh Da’at', 'יחוה דעת'],
  ['Sha’ar Ha-tziyun', 'שער הציון'],
  ['Shevet Ha-Levi', 'שבט הלוי'],
  ['Minḥat Yitzḥak', 'מנחת יצחק'],
  ['Birkei Yosef', 'ברכי יוסף'],
  ['Minḥat Shlomo', 'מנחת שלמה'],
  ['Ma’amar Mordechai', 'מאמר מרדכי'],
  ['Ḥazon Ish', 'חזון איש'],
  ['Yalkut Yosef', 'ילקוט יוסף'],
  ['Or le-Tziyon', 'אור לציון'],
  ['Taharat Ha-bayit', 'טהרת הבית'],
  ['Levush', 'לבוש'],
  ['Halikhot Shlomo', 'הליכות שלמה'],
  ['Aseh Lekha Rav', 'עשה לך רב'],
  ['Menuḥat Ahava', 'מנוחת אהבה'],
  ['Teḥumin', 'תחומין'],
  ['Masoret Ha-giyur', 'מסורת הגיור'],
  ['Mishpat Kohen', 'משפט כהן'],
  ['Mishpetei Eretz', 'משפטי ארץ'],
  ["Da'at Kohen", 'דעת כהן'],
  ['Orḥot Shabbat', 'אורחות שבת'],
  ['Avnei Nezer', 'אבני נזר'],
  ['Darkhei Tahara', 'דרכי טהרה'],
  ['Yaskil Avdi', 'ישכיל עבדי'],
  ['Divrei Malkiel', 'דברי מלכיאל'],
  ['Mishneh Halakhot', 'משנה הלכות'],
  ['Darkhei Teshuva', 'דרכי תשובה'],
  ["Ketif Shevi'it", 'קטיף שביעית'],
  ['Badei Ha-shulḥan', 'בדי השלחן'],
  ['Seridei Esh', 'שרידי אש'],
  ['Shulḥan Gavoha', 'שלחן גבוה'],
  ['Birkat Hashem', 'ברכת ה׳'],
  ["Pe'at Ha-Shulḥan", 'פאת השלחן'],
  ['Sidrei Tahara', 'סדרי טהרה'],
  ["Igrot Ha-Re'aya", 'אגרות הראיה'],
  ['Oraḥ Mishpat', 'אורח משפט'],
  ['Sha’agat Aryeh', 'שאגת אריה'],
  ['Shiyurei Berakha', 'שיורי ברכה'],
  ['Shulḥan Shlomo', 'שלחן שלמה'],
  ['Erekh Ha-shulḥan', 'ערך השלחן'],
  ['Maḥazik Berakha', 'מחזיק ברכה'],
  ['Amud Ha-yemini', 'עמוד הימיני'],
  ['Zera Emet', 'זרע אמת'],
  ['Zivḥei Tzedek', 'זבחי צדק'],
  ['Mikra’ei Kodesh', 'מקראי קדש'],
  ['Bikurei Yaakov', 'בכורי יעקב'],
  ['Shevitat Ha-Sadeh', 'שביתת השדה'],
  ['Ketzot Ha-shulḥan', 'קצות השלחן'],
  ['Aḥiezer', 'אחיעזר']
].forEach(([n, h]) => { SHOW[fold(n)] = {n, h}; });
const pick = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(x => x[0]);
const list = Object.values(books).map(b => {
  const en = pick(b.names), sh = SHOW[b.key], name = sh ? sh.n : en.find(x => /[ḥḤ]/.test(x)) || en[0] || pick(b.he)[0], he = sh && sh.h;
  return Object.assign({name, also: en.filter(x => x !== name).slice(0, 3), n: b.n, ch: [...b.ch].sort()}, he ? {he} : {});
}).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
// the Hebrew volumes only say a name the English never uses: keep the English the dictionary gave it
const out = `// Made by tools/make_missing_books.js on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.
// Books cited in Peninei Halakha (official English, AI English and Hebrew) that Sefaria does not hold.
window.PEARLS_MISSING = ${JSON.stringify({made: new Date().toISOString().slice(0, 10), books: list})};
`;
fs.writeFileSync(path.join(ROOT, 'www/cite-missing.js'), out);
console.log('missing books: ' + list.length + ', citations: ' + list.reduce((a, b) => a + b.n, 0));
for (const b of list.slice(0, 80)) console.log(b.n, b.name, b.he || '', b.also.join(' / '), b.ch.length);
