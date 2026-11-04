/* Estantes · Hebrew letters to sounds, for the Hebrew voices made on this device (Piper Shaul, Kokoro Hebrew).

   Three steps, the order Phonikud's own pipeline uses:
   1. Vowels. Text that already carries niqqud (Tanakh, siddur, most online Jewish libraries) keeps its own; unpointed text gets
      them from Nakdimon (Gershuni & Pinter, MIT; nakdimon v0.2.1, Nakdimon.onnx, 21 MB), which guesses from context
      and is sometimes wrong, so a pointed edition always reads better.
   2. Stress. Where the text has te'amim, the accent sits on the stressed syllable, and that is used; otherwise
      Phonikud's default, the last syllable (milra), which is right for most words and wrong for the segolates.
   3. Sounds. Phonikud's rule-based phonemizer (Kolani, Melichov, Alper et al., github.com/thewh1teagle/phonikud,
      CC BY 4.0), ported line for line from phonikud/hebrew.py, utils.py, syllables.py and lexicon.py. Modern
      Israeli pronunciation (ʁ, χ), because that is what both voices were trained on.
   Not ported: Phonikud's number and date expander, so digits inside Hebrew text are not read. */

// ---------------------------------------------------------------- lexicon.py
const VOCAL_SHVA = 'ֽ', HATAMA = '֫', PREFIX = '|', HASER = '֯', STRESS = 'ˈ';
const NON_STANDARD = VOCAL_SHVA + HATAMA + PREFIX + HASER + "'";
const HE_WORD = new RegExp(`[\\u05b0-\\u05ea${NON_STANDARD.replace('|', '\\|')}"]+`, 'g');
const PUNCT = new Set(['.', ',', '!', '?', ' ']);
const MODERN = [[/x/g, 'χ'], [/r/g, 'ʁ'], [/g/g, 'ɡ']];
const GERESH = { 'ג': 'dʒ', 'ז': 'ʒ', 'ת': 'ta', 'צ': 'tʃ', 'ץ': 'tʃ' };
const LP = { 'א': 'ʔ', 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'x', 'ט': 't', 'י': 'j', 'ך': 'x', 'כ': 'x',
  'ל': 'l', 'ם': 'm', 'מ': 'm', 'ן': 'n', 'נ': 'n', 'ס': 's', 'ע': 'ʔ', 'פ': 'f', 'ף': 'f', 'ץ': 'ts', 'צ': 'ts', 'ק': 'k', 'ר': 'r',
  'ש': 'ʃ', 'ת': 't', 'בּ': 'b', 'כּ': 'k', 'פּ': 'p', 'שׁ': 'ʃ', 'שׂ': 's', "'": '' };
const NP = { 'ִ': 'i', 'ֱ': 'e', 'ֵ': 'e', 'ֶ': 'e', 'ֲ': 'a', 'ַ': 'a', 'ׇ': 'o', 'ֹ': 'o',
  'ֺ': 'o', 'ֻ': 'u', 'ֳ': 'o', 'ָ': 'a', [HATAMA]: STRESS, [VOCAL_SHVA]: 'e' };
const PHONEMES = new Set([...Object.values(NP), ...Object.values(LP), ...Object.values(GERESH), 'χ', 'ʁ', 'ɡ', 'w'].join(''));
const N = { DAGESH: 'ּ', SHVA: 'ְ', HOLAM: 'ֹ', HIRIK: 'ִ', KAMATZ: 'ָ', PATAH: 'ַ', TSERE: 'ֵ',
  SEGOL: 'ֶ', KUBUTS: 'ֻ', SIN: 'ׂ', HATAF_KAMATZ: 'ֳ' };
const PAT = /[ַ-ָ]/;

// ---------------------------------------------------------------- utils.py
const sortChars = s => [...s].sort().join('');
function normalize(t) {
  return t.normalize('NFD').replace(/(\p{L})(\p{M}+)/gu, (_, l, m) => l + sortChars(m))
    .replace(/״/g, '"').replace(/׳/g, "'").replace(/־/g, '-');
}
class Letter {
  constructor(ch, diac) { this.char = ch; this.all = diac; }
  get diac() { return [...this.all].filter(c => c !== HATAMA && c !== PREFIX).join(''); }
  toString() { return this.char + this.all; }
}
const letters = w => [...w.matchAll(/(\p{L})([\p{M}'|]*)/gu)].map(m => new Letter(m[1], normalize(m[2])));
function sortStress(parts) {
  const text = parts.join('');
  if (!text.includes(STRESS) || !/[aeiou]/.test(text)) return parts;
  parts = parts.map(p => p.replaceAll(STRESS, ''));
  for (let i = 0; i < parts.length; i++) { const r = parts[i].replace(/([aeiou])/, STRESS + '$1'); if (r !== parts[i]) { parts[i] = r; break; } }
  return parts;
}
function sortHatama(ls) {
  for (let i = 0; i < ls.length - 1; i++) {
    if (ls[i].all.includes(HATAMA) && ls[i].all.includes(HASER)) { ls[i].all = ls[i].all.replace(HATAMA, ''); ls[i + 1].all += HATAMA; }
  }
  return ls;
}
function postNormalize(ph) {
  return ph.split(' ').map(w => w.replace(/ʔ$/, '').replace(/h$/, '').replace(/ˈh$/, '').replace(/ij$/, 'i')).join(' ');
}
const postClean = ph => [...ph].map(c => c === '-' ? ' ' : PHONEMES.has(c) || PUNCT.has(c) ? c : '').join('');

// ---------------------------------------------------------------- syllables.py
const VOWEL_DIACS = new Set([...Array.from({ length: 0x05bc - 0x05b1 }, (_, i) => String.fromCharCode(0x05b1 + i)), 'ׇ', 'ֽ']);
const hasVowelDiacs = s => s === 'וּ' || [...s].some(c => VOWEL_DIACS.has(c));
function syllables(word) {
  const ls = letters(word), out = []; let cur = '', vowel = false, i = 0;
  while (i < ls.length) {
    const l = ls[i], hv = hasVowelDiacs(String(l)) || (i === 0 && l.all.includes(N.SHVA));
    const vav1 = i + 2 < ls.length && ls[i + 2].char === 'ו', vav2 = i + 3 < ls.length && ls[i + 3].char === 'ו';
    if (hv) { if (vowel) { out.push(cur); cur = String(l); } else cur += l; vowel = true; } else cur += l;
    i++;
    if (vav1 && vav2) { if (cur) { out.push(cur + ls[i]); cur = ''; } cur = String(ls[i + 1]) + ls[i + 2]; i += 3; vowel = true; }
    else if (vav1 && ls[i + 1].diac) { if (cur) { out.push(cur); cur = ''; } vowel = false; }
  }
  if (cur) out.push(cur);
  return out;
}
function addMilra(word) {
  const sy = syllables(word);
  if (!sy.length) return word;
  const at = sy.length === 1 ? 0 : milel(word) ? sy.length - 2 : sy.length - 1, ls = letters(sy[at]);
  ls[0].all += HATAMA; sy[at] = ls.join('');
  return sy.join('');
}

// ---------------------------------------------------------------- ours, not Phonikud's: two rules its small path lacks
// Phonikud's own diacritizer marks stress and vocal sheva; Nakdimon (and a plain pointed text) does not, so without
// these, every segolate is stressed on the wrong syllable (sefˈeʁ for séfer) and every initial sheva is silent.
const FULL = /[ִ-ׇֻ]/;
// mil'el: the segolates (sefer, yeled, knesset, erets) and the dual (shamayim, yadayim): next to last syllable
function milel(word) {
  const ls = letters(word), v = ls.map((l, i) => [i, (l.diac.match(FULL) || [''])[0]]).filter(([, n]) => n);
  if (v.length < 2) return false;
  const [[, pv], [li, lv]] = v.slice(-2), end = ls.at(-1).char;
  if (lv === N.SEGOL && li < ls.length - 1 && end !== 'ה' && [N.SEGOL, N.TSERE, N.HOLAM, N.PATAH, N.KAMATZ].includes(pv)) return true;
  if (lv === N.HIRIK && ls[li].char === 'י' && pv === N.PATAH && 'םן'.includes(end)) return true;
  return false;
}
// a sheva on the first letter is vocal in a classical reading (Tanakh, siddur: bereshit, beveit); in modern speech
// only before lamed, mem, nun, resh, yod, a guttural, or the same letter (Phonikud's intended rule, which never ran)
function vocalShva(word, classical) {
  const ls = letters(word);
  if (ls.length < 2 || !ls[0].diac.includes(N.SHVA)) return word;
  if (classical || 'למנרי'.includes(ls[0].char) || 'אעה'.includes(ls[1].char) || ls[0].char === ls[1].char)
    ls[0].all = ls[0].all.replace(N.SHVA, VOCAL_SHVA);
  return ls.join('');
}

// ---------------------------------------------------------------- hebrew.py
const GNUVA = { 'ח': 'ax', 'ה': 'ah', 'ע': 'a' };
const clean = out => out.filter(p => p && [...p].every(c => PHONEMES.has(c)));
const vowels = cur => [...cur.all].map(n => NP[n] || '');
const stressOf = cur => cur.all.includes(HATAMA) ? [STRESS] : [];
const out = (cur, con, vow = null, skip = 0) => [clean(sortStress((con ? [con] : []).concat(vow ?? vowels(cur)))), skip];
function vavVowel(d) {
  if (PAT.test(d)) return 'va';
  if (d.includes(N.TSERE) || d.includes(N.SEGOL) || d.includes(VOCAL_SHVA)) return 've';
  if (d.includes(N.HOLAM)) return 'o';
  if (d.includes(N.KUBUTS) || d.includes(N.DAGESH)) return 'u';
  if (d.includes(N.HIRIK)) return 'vi';
  return null;
}
function phonemizeWord(ls) {
  const ph = []; let i = 0;
  while (i < ls.length) { const [p, skip] = letter(ls[i], ls[i - 1] || null, ls[i + 1] || null); ph.push(...p); i += skip + 1; }
  return ph;
}
function letter(cur, prev, nxt) {
  const d = cur.diac, ch = cur.char, s = stressOf(cur);
  if (cur.all.includes(HASER)) return [[], 0];
  if (d.includes("'") && ch in GERESH) return out(cur, GERESH[ch], ch === 'ת' ? [] : null);
  if (d.includes(N.DAGESH) && (ch + N.DAGESH) in LP) return out(cur, LP[ch + N.DAGESH]);
  if (ch === 'ו') return vav(cur, prev, nxt);
  if (ch === 'ש') return shin(cur, prev, nxt);
  if (!nxt && d.includes(N.PATAH) && ch in GNUVA) return out(cur, GNUVA[ch], s);
  if (d.includes(N.KAMATZ) && nxt && nxt.diac.includes(N.HATAF_KAMATZ)) return out(cur, LP[ch] || '', ['o', ...s]);
  if (ch === 'א' && !d && prev && nxt && nxt.char !== 'ו') return out(cur, '');
  if (ch === 'י' && !d && prev && nxt && prev.char + prev.diac !== 'אֵ' && !(nxt.char === 'ו' && nxt.diac && !nxt.diac.includes(N.SHVA))) return out(cur, '');
  return out(cur, LP[ch] || '');
}
function shin(cur, prev, nxt) {
  if (cur.diac.includes(N.SIN)) {
    if (nxt && nxt.char === 'ש' && !nxt.diac && PAT.test(cur.diac)) return out(cur, 'sa', stressOf(cur), 1);
    return out(cur, 's');
  }
  if (!cur.diac && prev && prev.diac.includes(N.SIN)) return out(cur, 's');
  return out(cur, LP['ש']);
}
function vav(cur, prev, nxt) {
  const d = cur.diac, s = stressOf(cur);
  if (prev && prev.diac.includes(N.SHVA) && d.includes(N.HOLAM)) return out(cur, 'vo', s);
  if (nxt && nxt.char === 'ו') {
    const dd = d + nxt.diac;
    if (dd.includes(N.HOLAM)) return out(cur, 'vo', s, 1);
    if (d === nxt.diac) return out(cur, 'vu', s, 1);
    const v = vavVowel(d); if (v) return out(cur, v, s);
    if (d.includes(N.SHVA) && !nxt.diac) return out(cur, 'v', s);
    return out(cur, '', s);
  }
  const v = vavVowel(d); if (v) return out(cur, v, s);
  if (d.includes(N.SHVA) && !prev) return out(cur, 've', s);
  if (nxt && !d) return out(cur, '', s);
  return out(cur, 'v', s);
}

// phonemize.py — pointed Hebrew to IPA (Phonikud's defaults: punctuation and stress kept, modern schema)
export function phonemize(text, { classical = false } = {}) {
  text = normalize(text).replace(HE_WORD, word => {
    word = vocalShva(word, classical);
    // Phonikud calls mark_vocal_shva(word) here and discards the result, so in the original it changes nothing;
    // applying it adds an 'e' to every first ל מ נ ר י (Moshe → "moeʃe"). Kept out to match what Phonikud does.
    if (!word.includes(HATAMA)) word = addMilra(word);
    let ph = phonemizeWord(sortHatama(letters(word))).join('');
    ph = postNormalize(ph);
    for (const [k, v] of MODERN) ph = ph.replace(k, v);
    return ph;
  });
  return postClean(text).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- te'amim: where the text marks stress, use it
// The accent sits on the stressed syllable, except the ones printed at the edge of the word instead: postpositive
// (segol, pashta, zarqa, telisha qetana) and prepositive (telisha gedola, yetiv). Those, and meteg, say nothing.
const EDGE = new Set(['֒', '֙', '֮', '֩', '֠', '֚']);
const TAAM = /[֑-֯]/;
export function stressFromTeamim(text) {
  return text.normalize('NFD').replace(/[א-ת֑-ׇ]+/g, word => {
    const chars = [...word];
    let letter = -1, stressed = -1, meteg = -1;
    for (const c of chars) {
      if (/[א-ת]/.test(c)) letter++;
      else if (stressed < 0 && TAAM.test(c) && !EDGE.has(c)) stressed = letter;
      else if (c === 'ֽ') meteg = letter;   // silluq, a verse's last accent, shares the meteg's code point
    }
    if (stressed < 0) stressed = meteg;
    let n = -1;
    return chars.filter(c => !TAAM.test(c)).map(c => {
      if (!/[א-ת]/.test(c)) return c;
      n++; return n === stressed ? c + HATAMA : c;
    }).join('');
  });
}

// ---------------------------------------------------------------- Nakdimon: vowels for unpointed text
const NK_LETTERS = ['', 'H', 'O', '5', ' ', '!', '"', "'", '(', ')', ',', '-', '.', ':', ';', '?', ...Array.from({ length: 0x05ea - 0x05d0 + 1 }, (_, i) => String.fromCharCode(0x05d0 + i))];
const RAFE = 'ֿ';
const NK_NIQQUD = ['', RAFE, ...Array.from({ length: 0x05bc - 0x05b0 + 1 }, (_, i) => String.fromCharCode(0x05b0 + i)), 'ַ'];
const NK_DAGESH = ['', RAFE, 'ּ'], NK_SIN = ['', RAFE, 'ׁ', 'ׂ'];
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function nkNormalize(c) {
  if (NK_LETTERS.includes(c) && c) return c;
  if (FINALS[c]) return FINALS[c];
  if (c === '\n' || c === '\t') return ' ';
  if ('־‒–—―−'.includes(c)) return '-';
  if (c === '[') return '('; if (c === ']') return ')';
  if ('´‘’'.includes(c)) return "'";
  if ('“”״'.includes(c)) return '"';
  if (/\d/.test(c)) return '5';
  if (c === '…') return ',';
  if ('ײװױ'.includes(c)) return 'H';
  return 'O';
}
const canDagesh = c => 'בגדהוזטיכלמנספצקשתךף'.includes(c), canSin = c => c === 'ש', canNiqqud = c => 'אבגדהוזחטיכלמנסעפצקרשתךן'.includes(c);
const pointed = t => { const l = (t.match(/[א-ת]/g) || []).length, n = (t.match(/[ְ-ׇּׁׂ]/g) || []).length; return l > 0 && n / l > 0.5; };
export const isPointed = pointed;
// session: an onnxruntime InferenceSession for Nakdimon.onnx; ort: the runtime module
export async function addVowels(text, session, ort, maxlen = 100) {
  const chars = [...text.replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ')];
  // split at spaces into lines shorter than maxlen, as hebrew.split_by_length does
  const lines = []; let cur = [], space = maxlen;
  for (const c of chars) { if (c === ' ') space = cur.length; cur.push(c); if (cur.length === maxlen - 1) { lines.push(cur.slice(0, space + 1)); cur = cur.slice(space + 1); } }
  if (cur.length) lines.push(cur);
  const ids = new Int32Array(lines.length * maxlen);
  lines.forEach((l, r) => l.forEach((c, k) => { ids[r * maxlen + k] = Math.max(0, NK_LETTERS.indexOf(nkNormalize(c))); }));
  const name = session.inputNames[0];
  const res = await session.run({ [name]: new ort.Tensor('int32', ids, [lines.length, maxlen]) });
  const [nOut, dOut, sOut] = session.outputNames.map(k => res[k]);
  const argmax = (t, row, k) => { const w = t.dims.at(-1), base = (row * maxlen + k) * w; let b = 0; for (let j = 1; j < w; j++) if (t.data[base + j] > t.data[base + b]) b = j; return b; };
  return lines.map((l, r) => l.map((c, k) => c
    + (canDagesh(c) ? NK_DAGESH[argmax(dOut, r, k)] : '')
    + (canSin(c) ? NK_SIN[argmax(sOut, r, k)] : '')
    + (canNiqqud(c) ? NK_NIQQUD[argmax(nOut, r, k)] : '')).join('')).join('').replaceAll(RAFE, '');
}

// the whole front end: any Hebrew text → IPA for the Hebrew voices
const M = '[\\u0591-\\u05c7]*';
const NAME = new RegExp(`י${M}ה${M}ו${M}ה${M}(?![א-ת])`, 'g');
export async function toPhonemes(text, nakdimon) {
  // sof pasuq ends a sentence, paseq is a pause
  let t = text.normalize('NFD').replace(/׃/g, '.').replace(/׀/g, ' ').replace(/[ׅׄ׆ֿ]/g, '');
  // the Name is read, not spelled: Adonai, or Elohim where it is pointed that way (after Adonai, as in Adonai Elohim)
  t = t.replace(NAME, m => /[ֱִ]/.test(m) ? 'אֱלֹהִים' : 'אֲדֹנָי');
  const classical = pointed(t);   // a text that came pointed is liturgy or Tanakh, read classically
  if (TAAM.test(t)) t = stressFromTeamim(t);
  t = t.replace(/ֽ/g, '');    // a meteg left over must go: Phonikud reads it as a vocal sheva
  if (!pointed(t) && nakdimon) t = await nakdimon(t);
  return phonemize(t, { classical });
}
