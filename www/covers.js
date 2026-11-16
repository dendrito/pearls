/* Cover art for every volume: one flat scene from the book's subject, drawn on a 100x100 grid.
   Flat by rule (test_flat.py): solid shapes only, no gradient, blur or shadow.
   Colours come from the cover's own CSS variables (--c1 ground, --c2 motif, --c3 shade, --cv-ink cream,
   --cv-flame gold), so a skin that re-colours covers re-colours the art too. Keyed by data.js slug. */
(() => {
const k = (cls, s) => s.replace(/<(rect|circle|ellipse|path|polygon)\b/g, `<$1 class="${cls}"`);
const m2 = s => k("m2", s), m3 = s => k("m3", s), ink = s => k("mk", s), m1 = s => k("m1", s), fl = s => k("mf", s);
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");
const flame = (x, y) => `<path d="M${x} ${y}c6 6 6 12 0 14c-6-2-6-8 0-14z"/>`;
const M = {
  shabbat: () => m2('<circle cx="74" cy="24" r="13"/>') + m1('<circle cx="80" cy="20" r="11"/>') +
    ink('<rect x="26" y="44" width="10" height="44"/><rect x="48" y="44" width="10" height="44"/>') + fl(flame(31, 28) + flame(53, 28)) +
    m2('<rect x="18" y="86" width="48" height="5"/>'),
  prayer: () => ink('<rect x="0" y="30" width="100" height="40"/>') + m3('<rect x="0" y="38" width="100" height="5"/><rect x="0" y="47" width="100" height="3"/><rect x="0" y="57" width="100" height="5"/>') +
    ink(range(8, i => `<rect x="${8 + i * 12}" y="70" width="2" height="14"/>`)),
  "womens-prayer": () => m2('<path d="M30 92V48a20 20 0 0 1 40 0v44z"/>') + m1('<path d="M38 92V52a12 12 0 0 1 24 0v40z"/>') +
    ink('<circle cx="50" cy="30" r="4"/><rect x="22" y="90" width="56" height="5"/>'),
  pesach: () => m2('<rect x="18" y="30" width="64" height="58" rx="10"/>') + m1(range(20, i => `<circle cx="${28 + (i % 5) * 11}" cy="${41 + Math.floor(i / 5) * 12}" r="1.8"/>`) + '<rect x="18" y="52" width="64" height="2"/>'),
  zemanim: () => ink(range(5, i => `<circle cx="${14 + i * 18}" cy="62" r="7"/>`)) + m1('<circle cx="10" cy="62" r="7"/><circle cx="30" cy="62" r="6"/><circle cx="54" cy="62" r="3"/>') +
    m2('<rect x="6" y="80" width="88" height="3"/>'),
  festivals: () => m2('<path d="M50 14a36 36 0 1 1 0 72a36 36 0 1 1 0-72zm0 8a28 28 0 1 0 0 56a28 28 0 1 0 0-56z"/>') +
    ink('<circle cx="50" cy="18" r="7"/><circle cx="82" cy="50" r="7"/><circle cx="50" cy="82" r="7"/><circle cx="18" cy="50" r="7"/>'),
  sukkot: () => m2(range(7, i => `<rect x="${i * 15 - 4}" y="14" width="5" height="30" transform="rotate(25 ${i * 15} 30)"/>`)) +
    ink('<rect x="16" y="46" width="68" height="4"/><rect x="18" y="50" width="4" height="40"/><rect x="78" y="50" width="4" height="40"/><rect x="49" y="64" width="2" height="5"/>') +
    m2('<ellipse cx="50" cy="76" rx="11" ry="9"/>'),
  "simchat-habayit": () => ink('<path d="M20 52L50 26l30 26v38H20z"/>') + m2('<rect x="43" y="64" width="14" height="26"/>') +
    m1('<rect x="27" y="58" width="10" height="10"/><rect x="63" y="58" width="10" height="10"/>'),
  "yamim-noraim": () => m2('<path d="M16 76C30 74 56 60 70 34l10-12 6 4-6 14C72 66 46 86 18 88z"/>') + ink('<circle cx="80" cy="76" r="5"/><circle cx="70" cy="86" r="3"/>'),
  berakhot: () => m2('<path d="M30 28h40c0 24-8 34-20 34s-20-10-20-34z"/><rect x="47" y="60" width="6" height="20"/><rect x="34" y="80" width="32" height="6"/>') +
    ink('<rect x="30" y="28" width="40" height="5"/>'),
  kashrut: () => m2('<circle cx="50" cy="44" r="28"/>') + m3('<rect x="46" y="64" width="8" height="26"/>') +
    m1('<circle cx="38" cy="38" r="4"/><circle cx="60" cy="34" r="4"/><circle cx="54" cy="52" r="4"/>'),
  "family-purity": () => m2(range(3, i => `<path d="M0 ${44 + i * 16}q12.5-10 25 0t25 0t25 0t25 0v7q-12.5-10-25 0t-25 0t-25 0t-25 0z"/>`)) + ink('<circle cx="50" cy="24" r="6"/>'),
  family: () => m2('<path d="M38 26a24 24 0 1 1 0 48a24 24 0 1 1 0-48zm0 7a17 17 0 1 0 0 34a17 17 0 1 0 0-34z"/>') +
    ink('<path d="M62 26a24 24 0 1 1 0 48a24 24 0 1 1 0-48zm0 7a17 17 0 1 0 0 34a17 17 0 1 0 0-34z"/>'),
  giyur: () => ink('<path d="M26 90V40a24 24 0 0 1 48 0v50z"/>') + m1('<path d="M34 90V42a16 16 0 0 1 32 0v48z"/>') +
    m2('<polygon points="50,34 66,46 66,90 50,90"/>') + ink('<rect x="14" y="88" width="72" height="4"/>'),
  emuna: () => m2('<polygon points="12,88 12,74 30,74 30,60 48,60 48,46 66,46 66,32 84,32 84,88"/>') + ink('<circle cx="76" cy="16" r="5"/><circle cx="24" cy="26" r="2.5"/><circle cx="48" cy="18" r="2"/>'),
  "nation-and-land": () => m2('<circle cx="70" cy="30" r="12"/>') + m3('<path d="M0 74C20 54 38 54 56 70S84 60 100 52V100H0z"/>') + m2('<path d="M0 86C26 72 50 76 100 70V100H0z"/>'),
  sheviit: () => m2(range(5, i => `<rect x="${10 + i * 17}" y="40" width="10" height="50" rx="5"/>`)) + ink('<circle cx="50" cy="22" r="9"/>') + m3('<rect x="0" y="88" width="100" height="12"/>'),
  "hafetzei-kodesh": () => m2('<rect x="38" y="14" width="24" height="74" rx="4"/>') + m1('<rect x="44" y="22" width="12" height="24" rx="2"/>') +
    ink('<path d="M46 26h8v3h-3v12h-2V29h-3z"/><rect x="44" y="56" width="12" height="2"/><rect x="44" y="62" width="12" height="2"/><rect x="44" y="68" width="12" height="2"/>'),
  "likkutim-1": () => ink('<rect x="20" y="58" width="60" height="9"/><rect x="24" y="46" width="54" height="9"/><rect x="18" y="70" width="66" height="9"/>') + m2('<rect x="28" y="34" width="46" height="9"/><rect x="16" y="82" width="70" height="8"/>'),
  "likkutim-2": () => m2('<rect x="20" y="58" width="60" height="9"/><rect x="24" y="46" width="54" height="9"/><rect x="18" y="70" width="66" height="9"/>') + ink('<rect x="28" y="34" width="46" height="9"/><rect x="16" y="82" width="70" height="8"/>'),
};
/* the art for one volume, or "" for a slug with no drawing (the cover falls back to its old shapes) */
function svg(slug) {
  const f = M[slug]; if (!f) return "";
  return `<svg class="cv" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect class="m1" width="100" height="100"/>${f()}</svg>`;
}
window.PEARLS_COVERS = { svg, has: slug => !!M[slug], slugs: Object.keys(M) };
})();
