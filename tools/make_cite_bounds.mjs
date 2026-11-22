// node tools/make_cite_bounds.mjs — asks Sefaria where each Tanakh book, Mishnah tractate and Bavli tractate ends, and how many se'ifim each siman of the Shulchan Arukh and its main commentaries has on Sefaria,
// and writes the table between the CITE-BOUNDS markers in www/pearls-cite-links.js (used by inBounds()).
import fs from 'fs';
const F = new URL('../www/pearls-cite-links.js', import.meta.url);
let src = fs.readFileSync(F, 'utf8');
const tract = [...src.matchAll(/\['([A-Z][A-Za-z ]+)', '[^']+'(?:, '[^']+')?\]/g)].map(m => m[1]);
const TANAKH = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'I Samuel', 'II Samuel', 'I Kings', 'II Kings',
  'Isaiah', 'Jeremiah', 'Ezekiel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai',
  'Zechariah', 'Malachi', 'Psalms', 'Proverbs', 'Job', 'Song of Songs', 'Ruth', 'Lamentations', 'Ecclesiastes', 'Esther', 'Daniel',
  'Ezra', 'Nehemiah', 'I Chronicles', 'II Chronicles'];
async function shape(t) {
  await new Promise(s => setTimeout(s, 1500));   // gently: one request at a time
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch('https://www.sefaria.org/api/shape/' + encodeURIComponent(t.replace(/ /g, '_')), {headers: {'User-Agent': 'PearlsCiteBounds/1.0 (builds a table of book ends)'}});
      if (r.ok) { const j = await r.json(); const s = Array.isArray(j) ? j[0] : j; return s && !s.error ? s : null; } if (r.status === 404) return null; }
    catch (e) {}
    await new Promise(s => setTimeout(s, 5000 * (i + 1)));
  }
  throw new Error('no shape for ' + t);
}
const out = {v: {}, m: {}, d: {}, s: {}};
// works cited by siman and se'if, under the titles Pearls' refs use
const SIMAN = ['Shulchan Arukh, Orach Chayim', "Shulchan Arukh, Yoreh De'ah", 'Shulchan Arukh, Even HaEzer', 'Shulchan Arukh, Choshen Mishpat',
  'Mishnah Berurah', 'Arukh HaShulchan, Orach Chaim', "Arukh HaShulchan, Yoreh De'ah", 'Shulchan Arukh HaRav, Orach Chayim', 'Magen Avraham'];
for (const t of SIMAN) { const s = await shape(t); out.s[t] = s.chapters.join('.'); }
for (const t of TANAKH) { const s = await shape(t); out.v[t] = s.chapters.join('.'); }
for (const t of [...new Set(tract)]) {
  const m = await shape('Mishnah ' + t); if (m) out.m[t] = m.chapters.join('.');
  const b = await shape(t); if (b && b.title === t && /^Seder /.test(b.section || '')) {
    const n = b.length - 1; out.d[t] = Math.floor(n / 2) + 1 + (n % 2 ? 'b' : 'a');
  }
}
const block = '  // CITE-BOUNDS (made by tools/make_cite_bounds.mjs from Sefaria\'s /api/shape, ' + new Date().toISOString().slice(0, 10) + ')\n'
  + '  var BOUNDS = ' + JSON.stringify(out) + ';\n  // /CITE-BOUNDS\n';
if (!/\/\/ CITE-BOUNDS[\s\S]*?\/\/ \/CITE-BOUNDS\n/.test(src)) throw new Error('markers missing');
src = src.replace(/  \/\/ CITE-BOUNDS[\s\S]*?\/\/ \/CITE-BOUNDS\n/, block);
fs.writeFileSync(F, src);
console.log('siman works', Object.keys(out.s).length, 'tanakh', Object.keys(out.v).length, 'mishnah', Object.keys(out.m).length, 'bavli', Object.keys(out.d).length, JSON.stringify(out.d));
