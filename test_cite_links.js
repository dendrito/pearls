// node test_cite_links.js  -> must end "cite links: 13/13"
global.window = global;
global.localStorage = {getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0};
require('./www/meldar-cite.js');
require('./www/pearls-cite-links.js');
const r = PEARLS_CITE.selftest();
// Hebrew footnote must use the Hebrew scanner even though it starts with a digit and Latin punctuation
const he = PEARLS_CITE.find('2. שו"ע או"ח שלא, טו', {}).map(h => h.ref);
const okHe = he.length === 1 && he[0] === 'Shulchan Arukh, Orach Chayim 331:15';
if (!okHe) r.failures.push({hebrew: he});
const pass = r.pass + (okHe ? 1 : 0), total = r.pass + r.fail + 1;
if (r.failures.length) console.log(JSON.stringify(r.failures, null, 1));
console.log('cite links: ' + pass + '/' + total);
process.exit(pass === total ? 0 : 1);
