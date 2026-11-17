// node tools/cite_audit.js [--xl DIR] [--fr DIR] [--json OUT]
// Runs Pearls' citation links over every chapter in every language we hold, and reports:
//  - linked citations (count per work)
//  - marked but not linked (count per work + reason)
//  - "missed": a name followed by a location that no link covers, grouped by name
// Text sources: www/en (official English), www/books (AI English), work/he (Hebrew), and, when given,
// the Spanish/Portuguese/French translations (www/xl/es|pt, work/fr) from their branch.
'use strict';
const fs = require('fs'), path = require('path');
global.window = global;
global.localStorage = {getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0};
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'www/meldar-cite.js'));
require(path.join(ROOT, 'www/pearls-cite-links.js'));
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

function load(file) {   // window.PH_BOOK_LOAD(...) / PH_BOOK_LOAD(...)
  let got; const f = new Function('window', 'PH_BOOK_LOAD', fs.readFileSync(file, 'utf8'));
  const cb = x => { got = x; }; f({PH_BOOK_LOAD: cb}, cb); return got;
}
const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…'};
function runs(html) {   // the runs linkify would see: blocks and <sup> break, inline tags join
  return String(html || '')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|blockquote|h\d|br|tr|td|table|section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] != null ? ENT[n] : m)
    .split(/\n+/).map(s => s.trim()).filter(s => s.length > 2);
}
const SEF = (() => { const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'www/sefaria.js'), 'utf8'))(w); return w.PH_SEFARIA; })();
function pageRef(id) { const [b, n] = id.split('-'); const m = SEF[b]; return m && +n ? `Peninei Halakhah, ${m.t} ${+n}` : ''; }

const docs = [];   // {lang, id, texts:[...]}
function add(lang, id, htmls) { docs.push({lang, id, runs: htmls.flatMap(runs)}); }
for (const f of fs.readdirSync(path.join(ROOT, 'www/en')).sort()) {
  const d = load(path.join(ROOT, 'www/en', f)); add('en', f.slice(0, 5), (Array.isArray(d) ? d : d.sections || []).map(s => s.content ? s.content.rendered : ''));
}
for (const f of fs.readdirSync(path.join(ROOT, 'www/books')).sort()) {
  const d = load(path.join(ROOT, 'www/books', f));
  add('ai-en', d.id, d.sections.flatMap(s => [s.body_en].concat((s.notes_en || []).map(n => n.en))));
}
for (const f of fs.readdirSync(path.join(ROOT, 'work/he')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'work/he', f), 'utf8'));
  add('he', f.slice(0, 5), d.sections.flatMap(s => [s.body_he].concat((s.notes_he || s.notes || []).map(n => n.he || n.text || ''))));
}
const xl = opt('--xl');
if (xl) for (const lang of ['es', 'pt']) {
  const dir = path.join(xl, lang); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).sort()) {
    const d = load(path.join(dir, f)); add(lang, d.id, d.sections.flatMap(s => [s.body].concat((s.notes || []).map(n => n.t || n.text || ''))));
  }
}
const fr = opt('--fr');
if (fr) for (const f of fs.readdirSync(fr).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(fr, f), 'utf8'));
  add('fr', f.slice(0, 5), d.sections.flatMap(s => [s.body_fr].concat((s.notes_fr || []).map(n => n.fr || n.t || n.text || ''))));
}

// a location after a name: 44 · 13:3 · 6a · §290 · 345:2:1
const LOC_EN = '(?:§\\s*|siman\\s+|chap(?:ter|\\.)?\\s+|ch\\.\\s*|vol\\.\\s*\\d+[,\\s]+|part\\s+\\d+[,\\s]+)?\\d{1,4}(?:[ab]\\b|(?::\\d{1,3}){1,2})?(?![\\d:])';
const W = "[A-Z][A-Za-zÀ-ÿḥĥḤĤḳẓṣʿʾ’'\\-]*";
const JOIN = "(?:\\s+(?:[Hh]a-?|[Dd]e-?|[Ll]e-?|[Bb]e-?|[Ll]a|[Hh]a|of|on|al|el|in|the|ben|bar|d[’']|del|de|da|do|des|du)?\\s*)";
const CAND_EN = new RegExp('(' + W + '(?:' + JOIN + W + '){0,4})[,]?\\s+(' + LOC_EN + ')', 'g');
const HNUM = '[א-ת]{1,3}(?:["״][א-ת])?|[א-ת][׳\']';
const CAND_HE = new RegExp('((?:[ובלה]?[א-ת"״\'׳]{2,}\\s+){1,3}?)(?:(?:סי[\'׳]|סימן|סעיף|ס["״]ק|פרק|דף)\\s+)?(' + HNUM + ')(?:\\s*,\\s*(' + HNUM + '))?(?=[\\s.;:,)\\]]|$)', 'g');
const STOP_EN = new RegExp('^(?:See|And|The|In|On|For|As|Also|This|That|There|These|Thus|However|Above|Below|Section|Chapter|Chapters|Note|Notes|Footnote|Part|Vol|Volume|Day|Days|Year|Years|Page|Rule|Law|Laws|Halakha|Halakhah|Mishna|Mishnah|Ibid|Cf|Psalm|Rabbi|Rav|Rabbeinu|Ha|Nisan|Iyar|Sivan|Tammuz|Av|Elul|Tishrei|Ḥeshvan|Heshvan|Kislev|Tevet|Shevat|Adar|January|February|March|April|May|June|July|August|September|October|November|December|Según|Véase|Ver|Ver también|Voir|Cf|Capítulo|Chapitre|Sección|Seção|Nota)$');

const linked = {}, marked = {}, missed = {}, perLang = {};
const bump = (o, k, lang, ex) => { const r = o[k] || (o[k] = {n: 0, langs: {}, ex: []}); r.n++; r.langs[lang] = (r.langs[lang] || 0) + 1; if (r.ex.length < 4 && ex && !r.ex.includes(ex)) r.ex.push(ex); };
const HE = window.PEARLS_CITE.isHebrew;
for (const d of docs) {
  const ref = pageRef(d.id), L = perLang[d.lang] || (perLang[d.lang] = {chapters: 0, linked: 0, marked: 0, missed: 0});
  L.chapters++;
  for (const t of d.runs) {
    let hits = [];
    try { hits = window.PEARLS_CITE.find(t, {ref}); } catch (e) { console.error(d.id, e.message); }
    for (const h of hits) {
      const ex = `${d.id} ${h.text}`;
      if (h.resolved) { L.linked++; bump(linked, h.work || h.ref.replace(/\s[\d:ab-]+$/, ''), d.lang, ex + ' → ' + h.ref); }
      else { L.marked++; bump(marked, (h.work || '?') + ' — ' + (h.why || ''), d.lang, ex); }
    }
    const he = HE(t), re = he ? CAND_HE : CAND_EN; re.lastIndex = 0; let m;
    while ((m = re.exec(t))) {
      const s = m.index, e = s + m[0].length;
      if (hits.some(h => s < h.end && e > h.start)) continue;
      let name = m[1].trim();
      if (!he) {
        name = name.replace(/^(?:See|And|In|Also|Cf|As|Thus|However|Ver|Véase|Voir|Según|Selon|Segundo|cf)\s+/, '');
        if (STOP_EN.test(name) || name.length < 3) continue;
      } else {
        name = name.replace(/^[ובלה](?=[א-ת]{2})/, '');
        if (!/["״'׳]/.test(m[0]) && !/סי[\'׳]|סימן|סעיף|דף|פרק/.test(m[0]) && !m[3]) continue;   // a word + a word is prose
        if (window.MELDAR_CITE && window.MELDAR_CITE.gematria && !window.MELDAR_CITE.gematria(m[2].replace(/["״׳']/g, ''))) continue;
      }
      L.missed++; bump(missed, name, d.lang, `${d.id} ${m[0].trim()}`);
    }
  }
}
const top = (o, n) => Object.entries(o).sort((a, b) => b[1].n - a[1].n).slice(0, n);
const out = {perLang, linked: Object.fromEntries(top(linked, 400)), marked: Object.fromEntries(top(marked, 400)), missed: Object.fromEntries(top(missed, 2000))};
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(perLang));
const lim = +(opt('--top') || 40);
console.log('\n== missed (name + location, no link) =='); for (const [k, v] of top(missed, lim)) console.log(v.n, k, JSON.stringify(v.langs), '|', v.ex.slice(0, 2).join(' ‖ '));
console.log('\n== marked, not linked =='); for (const [k, v] of top(marked, lim)) console.log(v.n, k, JSON.stringify(v.langs), '|', v.ex[0]);
