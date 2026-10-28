/* Pearls — an English home for Peninei Halakha with the original Hebrew audio.
   Plain JS, no build step. Works in the Android WebView shell and in any modern browser. */
(() => {
"use strict";

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("pearls:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("pearls:" + k, JSON.stringify(v)); } catch {} }
};
const state = {
  plays: store.get("plays", {}),          // id -> {sec, pos, done, n, last}
  likes: new Set(store.get("likes", [])),
  skips: store.get("skips", {}),          // id -> count
  mine: store.get("mine", []),            // [{id,name,tracks:[ids],created}]
  interests: store.get("interests", null),// array of tags, null = not onboarded
  measured: store.get("measured", {}),    // id -> seconds measured from audio
  speed: store.get("speed", 1),
  lastQueue: store.get("lastQueue", null),
  read: store.get("read", {}),            // chapter id -> ts marked done by reading
  days: store.get("days", {}),            // YYYY-MM-DD -> {min, ch:[ids]}
  saved: store.get("saved", []),          // [{ref, id, sec, title, note, at}]
  plan: store.get("plan", null),          // {book:"01"|"all", per:1, start:ts}
  prefs: Object.assign({ size: 1, hc: false, tint: false, read: "en", meldar: "https://meldar.pages.dev/?ref={ref}" }, store.get("prefs", {})),
  speedBy: store.get("speedBy", {})
};
const save = {
  plays: () => store.set("plays", Object.fromEntries(Object.entries(state.plays).map(([k, v]) => { const o = { ...v }; delete o._t; return [k, o]; }))), likes: () => store.set("likes", [...state.likes]),
  skips: () => store.set("skips", state.skips), mine: () => store.set("mine", state.mine),
  interests: () => store.set("interests", state.interests), measured: () => store.set("measured", state.measured),
  read: () => store.set("read", state.read), days: () => store.set("days", state.days), saved: () => store.set("saved", state.saved),
  plan: () => store.set("plan", state.plan), prefs: () => store.set("prefs", state.prefs)
};
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function logDay(minutes, chId) {
  const k = dayKey(), d = state.days[k] || (state.days[k] = { min: 0, ch: [] });
  if (minutes) d.min = Math.round((d.min + minutes) * 100) / 100;
  if (chId && !d.ch.includes(chId)) d.ch.push(chId);
  save.days(); markStudied();
}
const isDone = id => !!((state.plays[id] || {}).done || state.read[id]);
/* The study record is Meldar's own engine (meldar-record.js, decision D-013): opt-in, device-only,
   "days studied" as the headline, a run that Shabbat and Yom Tov pause, no loss language. */
const REC = window.MELDAR_RECORD;
const recView = () => REC && REC.view ? REC.view() : null;
function streak() { const v = recView(); return v ? v.run : 0; }
function markStudied() { const k = dayKey(), d = state.days[k]; if (REC && d && (d.min >= 5 || d.ch.length)) REC.mark("read"); }

/* ---------- catalog ---------- */
const CAT = window.PH_CATALOG || { volumes: [] };
const META = window.PH_META, DUR = window.PH_DUR;
const VOLS = CAT.volumes.filter(v => META[v.book]).map(v => ({ ...v, ...META[v.book], title: v.title }))
  .concat(((window.PH_CATALOG_HE || {}).volumes || []).filter(v => META[v.book]).map(v => ({ ...v, ...META[v.book], title: v.title, he: true })));
const TRACKS = [];          // every chapter = one audio track
const BYID = {};
const TOPIC_LABEL = { shabbat:"Shabbat", prayer:"Prayer", women:"Women", pesach:"Pesach", festival:"Festivals", calendar:"Calendar",
  sukkot:"Sukkot", home:"Home", marriage:"Marriage", "high-holidays":"High Holidays", teshuva:"Teshuva", candles:"Candles", kiddush:"Kiddush",
  havdala:"Havdala", food:"Food & eating", melakhot:"Melakhot", rain:"Rain", "torah-reading":"Torah reading", kohanim:"Birkat Kohanim",
  chametz:"Chametz", seder:"Seder", kashering:"Kashering", omer:"Omer", hanukkah:"Chanukah", purim:"Purim", fasts:"Fast days",
  "rosh-chodesh":"Rosh Chodesh", israel:"Israel", "yom-tov":"Yom Tov", sukkah:"Sukkah", "four-species":"Four species",
  "simchat-torah":"Simchat Torah", blessings:"Blessings", kashrut:"Kashrut", "family-purity":"Family purity", giyur:"Giyur", emuna:"Emuna", shemitah:"Shemitah", "sacred-objects":"Sacred objects", "rosh-hashana":"Rosh Hashana", "yom-kippur":"Yom Kippur", family:"Family", foundations:"Foundations", health:"Illness & medicine" };
for (const v of VOLS) {
  for (const c of v.chapters) {
    const id = `${v.book}-${String(c.n).padStart(2, "0")}`;
    const tags = new Set(v.tags), secs = c.sectionTitles || [];
    for (const [re, tag, books, titleOnly] of window.PH_TAGRULES)
      if ((!books || books.includes(v.book)) && (re.test(c.title || "") || (!titleOnly && secs.filter(s => re.test(s)).length >= 2))) tags.add(tag);
    const t = { id, vol: v, n: c.n, title: c.title || c.titleHe || `Chapter ${c.n}`, translated: c.translated !== false, titleHe: c.titleHe || null, sections: c.sections || 0, sectionTitles: c.sectionTitles || [],
      tags: [...tags] };
    TRACKS.push(t); BYID[id] = t;
  }
}
const dur = t => DUR[t.id] || state.measured[t.id] || null;
const fmt = s => { if (!s && s !== 0) return "–"; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const mins = s => s ? `${Math.max(1, Math.round(s / 60))} min` : "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);

/* ---------- spelling schemes ----------
   The English text is published in the translators' own romanization (and it varies: Ĥametz / Ḥametz,
   Minĥa / Minchah). A scheme re-spells the Hebrew terms it knows; everything else is left as published. */
const SCHEMES = {
  source: { name: "Ashkenazi", sub: "Peninei Halakha's own spelling, as published: Ḥametz, Kiddush, Shabbat" },
  house:  { name: "S&P house rules", sub: "London Spanish & Portuguese of de Sola and Gaster, with ḥ and ḳ: Ḥaméts, Ḳiddúsh, Shabbath" }
};
let scheme = store.get("scheme", "source"); if (!SCHEMES[scheme]) scheme = "source";
const LEX = window.PH_TRANSLIT || [];
const LEXMAP = new Map();
for (const e of LEX) for (const s of e.src) if (!LEXMAP.has(s.toLowerCase())) LEXMAP.set(s.toLowerCase(), e);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEXRE = LEX.length ? new RegExp(`(?<![\\p{L}\\p{M}’'])(?:${[...LEXMAP.keys()].sort((x, y) => y.length - x.length).map(escRe).join("|")})(?![\\p{L}\\p{M}])`, "giu") : null;
const caseLike = (src, out) => {
  const first = [...src].find(ch => /\p{L}/u.test(ch)) || "";
  return first && first === first.toLowerCase() && first !== first.toUpperCase() ? out.replace(/\p{L}/u, ch => ch.toLowerCase()) : out;
};
const WORKS = new RegExp(["Peninei Hala[kc]h(?:a|ah)", "Mishn(?:a|ah) Berur(?:a|ah)", "Shul[ĥḥ]an [’']?Arukh", "Shul[ĥḥ]an Aruch", "Shulchan Aruch",
  "Arukh Ha-?shul[ĥḥ]an", "Kitzur Shul[ĥḥ]an Arukh", "[ĤḤH]ayei Adam", "Kaf Ha-?[ĥḥ]ayim", "Beit Yosef", "Magen Avraham", "Yalkut Yosef",
  "Ye[ĥḥ]aveh Da[’']at", "Yabi[’']a Omer", "Igrot Moshe", "Sefer Ha-?[ĥḥ]inukh", "Seder Hayom", "Ben Ish [ĤḤ]ai", "Mishneh Torah", "Tur",
  "Hilkhot Shabbat", "Hilkhot [A-Z][\\p{L}’'-]+", "Masekhet [A-Z][\\p{L}’'-]+", "Tractate [A-Z][\\p{L}’'-]+"].join("|"), "gu");
const rcache = new Map();
function R(text) {
  if (!text || scheme === "source" || !LEXRE) return text;
  const k = scheme + "\u0001" + text; if (rcache.has(k)) return rcache.get(k);
  // House rule: names of works and citations keep their catalogue spelling, so they can be looked up.
  const str = String(text), keep = [];
  for (const m of str.matchAll(WORKS)) keep.push([m.index, m.index + m[0].length]);
  const inKept = i => keep.some(([s, e]) => i >= s && i < e);
  const out = str.replace(LEXRE, (m, off, whole) => {
    if (inKept(off)) return m;
    if (/^\s+\d+[ab]\b/.test(whole.slice(off + m.length, off + m.length + 8))) return m;   // tractate + folio: Berakhot 26b
    const e = LEXMAP.get(m.toLowerCase()); return e && e[scheme] ? caseLike(m, e[scheme]) : m;
  });
  rcache.set(k, out); return out;
}
function respellTree(root) {
  if (scheme === "source") return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) { const v = R(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
}
function setScheme(s) { scheme = s; store.set("scheme", s); rcache.clear(); for (const k in textCache) delete textCache[k]; }


/* ---------- Sefaria references (the key Meldar and Sefaria share) ---------- */
const SEF = window.PH_SEFARIA || {};
function sefRef(t, sec) {           // sec: 1-based section number or null
  const m = SEF[t.vol.book]; if (!m || t.n === 0) return null;
  const exact = !m.exact || m.exact.includes(t.n);
  return `Peninei Halakhah, ${m.t} ${t.n}${sec && exact ? ":" + sec : ""}`;
}
const sefUrl = ref => ref ? "https://www.sefaria.org/" + encodeURIComponent(ref.replace(/ (?=\d)/, ".").replace(/:/g, ".").replace(/ /g, "_")).replace(/%2C/g, ",") : null;
const meldarUrl = ref => ref && state.prefs.meldar ? state.prefs.meldar.replace("{ref}", encodeURIComponent(ref)).replace("{sefaria}", encodeURIComponent(ref.replace(/ /g, "_"))) : null;
function copyText(text) {
  const done = () => toast("Copied");
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done).catch(() => fallback());
  fallback();
  function fallback() { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch { toast("Couldn't copy on this device"); } ta.remove(); }
}
/* skins: Classic is app.css itself; the rest re-set its tokens in skins.css */
const SKINS = [
  { id: "classic", name: "Classic", bg: "#0b0f1a", acc: "#e2b65c" },
  { id: "pearl-auto", name: "Pearl Minimal", note: "light by day, dark at night (follows your phone)", bg: "linear-gradient(90deg,#f5f5f2 50%,#0b0b0c 50%)", acc: "#ff4f00" },
  { id: "pearl", name: "Pearl Minimal · light", bg: "#f5f5f2", acc: "#ff4f00", light: true },
  { id: "pearl-dark", name: "Pearl Minimal · dark", bg: "#0b0b0c", acc: "#ff4f00" },
  { id: "sand", name: "Sand", bg: "#efe9dd", acc: "#c2410c", light: true },
  { id: "ice", name: "Ice", bg: "#eef2f6", acc: "#2b59ff", light: true },
  { id: "night", name: "Night Gold", bg: "#0a0a0a", acc: "#e2b65c" },
  { id: "mint", name: "Terminal Mint", bg: "#0b1210", acc: "#3ddc97" },
  { id: "illuminated", name: "Illuminated", note: "vellum, lapis and vermilion, like a manuscript", bg: "#f3ead6", acc: "#1f3a93", light: true },
  { id: "tekhelet", name: "Tekhelet", note: "deep sea blue with threads of light", bg: "#04121f", acc: "#3fa9ff" },
  { id: "brutal", name: "Brutal", note: "paper, black ink, hard shadows, acid yellow", bg: "#f4f1ea", acc: "#e6ff00", light: true },
  { id: "parchment", name: "Parchment", note: "warm paper and a book typeface; reading first", bg: "#f6f0e4", acc: "#b0622a", light: true },
  { id: "studio", name: "Studio", note: "dark and audio-first, lime accent", bg: "#0e0e10", acc: "#c6f36b" },
  { id: "daf", name: "Daf", note: "a printed page: black ink, Garamond, Hebrew and English side by side", bg: "#fbfaf7", acc: "#1d1b18", light: true },
  { id: "clear", name: "Clear", note: "black and white, very large type and buttons", bg: "#ffffff", acc: "#ffd400", light: true }
];
const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function resolvedSkin() {
  const s = state.prefs.skin || "classic";
  return s === "pearl-auto" ? (darkMQ && darkMQ.matches ? "pearl-dark" : "pearl") : s;
}
function applySkin() {
  const id = state.prefs.hc ? "classic" : resolvedSkin(), sk = SKINS.find(x => x.id === id) || SKINS[0];
  if (id === "classic") delete document.body.dataset.skin; else document.body.dataset.skin = id;
  document.body.classList.toggle("light", !!sk.light);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(document.body).getPropertyValue("--ink").trim() || sk.bg;
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", () => { if (state.prefs.skin === "pearl-auto") applySkin(); });
const HEB_FONTS = [
  { id: "frank", name: "Frank Ruhl Libre", note: "the default; a classic Israeli book face", css: '"Frank Ruhl Libre","Noto Serif Hebrew","David",serif' },
  { id: "shofar", name: "Shofar", note: "in the style of Koren, as in the Koren siddur and Tanakh", css: '"Shofar","Frank Ruhl Libre",serif' },
  { id: "keter", name: "Keter YG", note: "after the Aleppo Codex, a manuscript feel", css: '"Keter YG","Frank Ruhl Libre",serif' }
];
function applyHebFont() {
  const f = HEB_FONTS.find(x => x.id === state.prefs.hefont) || HEB_FONTS[0];
  document.body.style.setProperty("--f-heb", f.css);
  document.body.dataset.hefont = f.id;
}
function applyPrefs() {
  applySkin(); applyHebFont();
  document.documentElement.style.setProperty("--read-scale", state.prefs.size);
  document.body.classList.toggle("hc", !!state.prefs.hc);
  document.body.classList.toggle("tint", !!state.prefs.tint);
}
/* the six letter pairs beginners confuse most; each member gets its own tint when the option is on */
const PAIRS = [["ב", "כ"], ["ד", "ר"], ["ה", "ח"], ["ו", "ז"], ["ג", "נ"], ["ס", "ם"]];
const TINT = {}; PAIRS.forEach(([x, y], i) => { TINT[x] = `t${i}a`; TINT[y] = `t${i}b`; });
function tintHebrew(root) {
  if (!state.prefs.tint) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = [];
  while (w.nextNode()) if (/[א-ת]/.test(w.currentNode.nodeValue)) nodes.push(w.currentNode);
  for (const n of nodes) {
    const span = document.createElement("span");
    span.innerHTML = esc(n.nodeValue).replace(/[בכדרהחוזגנסם]/g, ch => `<i class="${TINT[ch]}">${ch}</i>`);
    n.replaceWith(span);
  }
}

/* ---------- Hebrew calendar & seasons ---------- */
function hebToday(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).formatToParts(d);
    const g = k => (parts.find(p => p.type === k) || {}).value;
    return { day: +g("day"), month: g("month"), year: g("year") || g("relatedYear") };
  } catch { return null; }
}
const SEASONS = {
  Tishri:   d => d < 11 ? { label: "Days of Awe", tags: ["yom-kippur", "teshuva", "high-holidays"] } : { label: "Sukkot", tags: ["sukkah", "four-species", "simchat-torah", "sukkot"] },
  Heshvan:  () => ({ label: "Rainy season", tags: ["rain", "prayer"] }),
  Kislev:   d => d > 15 ? { label: "Chanukah is coming", tags: ["hanukkah"] } : { label: "Rainy season", tags: ["rain", "prayer"] },
  Tevet:    d => d < 3 ? { label: "Chanukah", tags: ["hanukkah"] } : { label: "Tenth of Tevet", tags: ["fasts"] },
  Shevat:   () => ({ label: "Toward Adar", tags: ["calendar", "shabbat"] }),
  Adar:     d => d < 15 ? { label: "Purim season", tags: ["purim"] } : { label: "Pesach prep begins", tags: ["chametz", "kashering", "pesach"] },
  "Adar I": () => ({ label: "Toward Purim", tags: ["purim"] }),
  "Adar II":d => d < 15 ? { label: "Purim season", tags: ["purim"] } : { label: "Pesach prep begins", tags: ["chametz", "kashering", "pesach"] },
  Nisan:    d => d < 22 ? { label: "Pesach", tags: ["seder", "chametz", "pesach", "yom-tov"] } : { label: "Counting the Omer", tags: ["omer"] },
  Iyar:     () => ({ label: "Counting the Omer", tags: ["omer", "israel"] }),
  Sivan:    () => ({ label: "Shavuot", tags: ["yom-tov", "festival"] }),
  Tamuz:    d => d > 16 ? { label: "The Three Weeks", tags: ["fasts"] } : { label: "Summer Shabbatot", tags: ["shabbat", "melakhot"] },
  Av:       d => d <= 9 ? { label: "The Nine Days", tags: ["fasts"] } : { label: "Comfort & marriage", tags: ["marriage", "home"] },
  Elul:     () => ({ label: "Elul", tags: ["teshuva", "rosh-hashana", "high-holidays"] })
};
const HEB = hebToday();
const SEASON = (HEB && SEASONS[HEB.month] ? SEASONS[HEB.month](HEB.day) : { label: "This week", tags: ["shabbat"] });

/* ---------- recommendation engine ----------
   score = taste similarity (tag profile, recency-decayed) + continuation + season + length fit + novelty
   Every score carries a human reason so the UI can say why. */
const DAY = 864e5;
function profile() {
  const w = {};
  const add = (t, x) => { for (const g of t.tags) w[g] = (w[g] || 0) + x / Math.sqrt(t.tags.length); };
  for (const g of state.interests || []) w[g] = (w[g] || 0) + 2.5;
  const now = Date.now();
  for (const [id, p] of Object.entries(state.plays)) {
    const t = BYID[id]; if (!t) continue;
    const decay = Math.pow(.5, (now - (p.last || now)) / (14 * DAY));
    add(t, decay * ((p.done ? 2 : 0) + Math.min(1.5, (p.sec || 0) / 300)));
  }
  for (const id of state.likes) if (BYID[id]) add(BYID[id], 3);
  for (const [id, n] of Object.entries(state.skips)) if (BYID[id]) add(BYID[id], -0.6 * n);
  return w;
}
function cosine(w, tags) {
  let dot = 0, nw = 0; for (const v of Object.values(w)) nw += v * v;
  if (!nw) return 0; for (const g of tags) dot += (w[g] || 0);
  return dot / (Math.sqrt(nw) * Math.sqrt(tags.length));
}
function typicalSession() {
  const s = Object.values(state.plays).map(p => p.sec || 0).filter(x => x > 120).sort((a, b) => a - b);
  return s.length >= 3 ? s[Math.floor(s.length / 2)] : null;
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function recommend(limit = 12, opts = {}) {
  const w = profile(), sess = typicalSession(), today = new Date().toDateString();
  // continuation: the chapter after the furthest finished one in each volume you've been listening to
  const nextUp = {};
  for (const [id, p] of Object.entries(state.plays)) {
    const t = BYID[id]; if (!t) continue;
    const nxt = BYID[`${t.vol.book}-${String(t.n + 1).padStart(2, "0")}`];
    if (nxt && (p.done || (p.sec || 0) > 240) && !(state.plays[nxt.id] || {}).done) {
      if (!nextUp[nxt.id] || nextUp[nxt.id].last < p.last) nextUp[nxt.id] = { from: t, last: p.last || 0 };
    }
  }
  const scored = TRACKS.filter(t => !opts.exclude || !opts.exclude.has(t.id)).map(t => {
    const p = state.plays[t.id] || {}; const reasons = [];
    let s = cosine(w, t.tags) * 1.4;
    if (s > .35) { const top = t.tags.filter(g => w[g] > 0).sort((a, b) => w[b] - w[a])[0]; if (top) reasons.push(["taste", `More ${TOPIC_LABEL[top] || top}`]); }
    if (nextUp[t.id]) { s += .9; reasons.unshift(["next", `Next after “${nextUp[t.id].from.title}”`]); }
    if (t.tags.some(g => SEASON.tags.includes(g))) { s += .55; reasons.push(["season", `In season · ${SEASON.label}`]); }
    const d = dur(t);
    if (sess && d) { const fit = Math.exp(-Math.pow(Math.log(d / sess), 2) / .5); s += .3 * fit; if (fit > .8) reasons.push(["fit", `Fits your ~${mins(sess)} sessions`]); }
    if (state.likes.has(t.id)) s -= .3;
    if (p.done) s -= .9; else if (p.part || p.pos > 30) { s += .35; reasons.unshift(["resume", `Resume at section ${(p.part || 0) + 1}`]); }
    if (!p.n) s += .12;
    if (t.n === 1 && !Object.keys(state.plays).some(id => id.startsWith(t.vol.book))) s += .08;
    s += hash(t.id + today) * .18;   // gentle daily rotation
    return { t, s, why: (reasons[0] || ["", ""])[1] };
  }).sort((a, b) => b.s - a.s);
  // diversity: at most 3 from the same volume in the top list
  const out = [], perVol = {};
  for (const r of scored) { const k = r.t.vol.book; if ((perVol[k] || 0) >= (opts.perVol || 3)) continue; perVol[k] = (perVol[k] || 0) + 1; out.push(r); if (out.length >= limit) break; }
  return out;
}
function similar(t, limit = 6) {
  return TRACKS.filter(x => x.id !== t.id).map(x => {
    let s = 0; const shared = x.tags.filter(g => t.tags.includes(g) && !x.vol.tags.includes(g));
    s += shared.length * .5 + (x.vol === t.vol ? .3 : 0) + (x.vol === t.vol && Math.abs(x.n - t.n) === 1 ? .6 : 0);
    if ((state.plays[x.id] || {}).done) s -= .4;
    return { t: x, s, why: shared[0] ? `Also about ${TOPIC_LABEL[shared[0]] || shared[0]}` : (x.vol === t.vol ? `Same book · ch. ${x.n}` : "") };
  }).sort((a, b) => b.s - a.s).slice(0, limit);
}

/* ---------- playlists ---------- */
function presetTracks(p) {
  const k = p.pick;
  let list = TRACKS;
  if (k.book) list = list.filter(t => t.vol.book === k.book);
  if (k.chapters) list = list.filter(t => k.chapters.includes(t.n));
  if (k.tag) list = list.filter(t => t.tags.includes(k.tag));
  if (k.maxSec) list = list.filter(t => dur(t) && dur(t) <= k.maxSec);
  return list.map(t => t.id);
}
const PRESETS = window.PH_PRESETS.map(p => ({ ...p, kind: "preset", tracks: presetTracks(p) })).filter(p => p.tracks.length);
function madeForYou() {
  const daily = recommend(8).map(r => r.t.id);
  const seasonIds = TRACKS.filter(t => t.tags.some(g => SEASON.tags.includes(g))).slice(0, 12).map(t => t.id);
  const sess = typicalSession() || 1200;
  const quick = recommend(40, { perVol: 4 }).filter(r => dur(r.t) && dur(r.t) <= Math.min(sess, 1200)).slice(0, 8).map(r => r.t.id);
  const out = [{ id: "daily-mix", kind: "auto", name: "Your Daily Mix", blurb: "Rebuilt every day from what you finish, like and skip.", tracks: daily }];
  if (seasonIds.length) out.push({ id: "season-mix", kind: "auto", name: SEASON.label, blurb: `What the calendar is pointing at${HEB ? ` · ${HEB.day} ${HEB.month}` : ""}.`, tracks: seasonIds });
  if (quick.length >= 3) out.push({ id: "quick-mix", kind: "auto", name: "Commute Length", blurb: "Recommended chapters that fit one sitting.", tracks: quick });
  const liked = [...state.likes].filter(id => BYID[id]);
  if (liked.length) out.push({ id: "liked", kind: "auto", name: "Liked Pearls", blurb: "Everything you've hearted.", tracks: liked });
  return out;
}
function rankedPresets() {
  const w = profile();
  return PRESETS.map(p => ({ p, s: p.tracks.reduce((a, id) => a + cosine(w, BYID[id].tags) + (BYID[id].tags.some(g => SEASON.tags.includes(g)) ? .4 : 0), 0) / p.tracks.length
    - p.tracks.filter(id => (state.plays[id] || {}).done).length / p.tracks.length * .6 }))
    .sort((a, b) => b.s - a.s).map(x => x.p);
}
function findPlaylist(id) { return state.mine.find(p => p.id === id) || PRESETS.find(p => p.id === id) || madeForYou().find(p => p.id === id); }
const plDur = ids => ids.reduce((a, id) => a + (dur(BYID[id]) || 0), 0);

/* ---------- audio engine ----------
   Har Bracha now publishes one recording per section (cdn1.yhb.org.il/mp3/BB-CC-SS.mp3, English readings at
   mp3/en/en-BB-CC-SS.mp3). A chapter is still one track in the app; it plays its sections in order. */
const AUDIO_BASE = "https://cdn1.yhb.org.il/mp3";
let audioLang = store.get("audioLang", "auto");   // "auto" = English reading where one exists, unless you read in Hebrew
const nSections = t => Math.max(1, t.sections || 1);
const partUrl = (t, i, lang) => {
  const ss = String(i + 1).padStart(2, "0");
  return lang === "en" ? `${AUDIO_BASE}/en/en-${t.id}-${ss}.mp3` : `${AUDIO_BASE}/${t.id}-${ss}.mp3`;
};
const AUD = window.PH_AUDIO || {};
const hasHe = t => !AUD[t.id] || !!AUD[t.id][0], hasEn = t => !!(AUD[t.id] && AUD[t.id][1]);
const wantsEnglish = t => hasEn(t) && (audioLang === "en" || !hasHe(t) || (audioLang === "auto" && (state.prefs.read || "en") !== "he"));
const audio = new Audio(); audio.preload = "metadata";
const P = { queue: [], idx: -1, ctx: null, sleepAt: null, sleepEnd: false, part: 0, lang: "he", fails: 0 };
const cur = () => BYID[P.queue[P.idx]];
function playQueue(ids, start = 0, ctx = null) {
  const first = ids[start]; ids = ids.filter(id => BYID[id] && (hasHe(BYID[id]) || hasEn(BYID[id])));
  if (!ids.length) { toast("No recording of this yet. The text is here to read."); return; }
  start = Math.max(0, ids.indexOf(first)); P.queue = ids; P.idx = Math.max(0, Math.min(start, P.queue.length - 1)); P.ctx = ctx;
  if (ctx && state.speedBy[ctx]) state.speed = state.speedBy[ctx];
  store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx }); load(true, true);
}
function load(autoplay, fresh) {
  const t = cur(); if (!t) return;
  const p = state.plays[t.id];
  if (fresh) { P.part = p && !p.done && p.part != null ? Math.min(p.part, nSections(t) - 1) : 0; P.fails = 0; }
  P.lang = wantsEnglish(t) ? "en" : "he";
  audio.src = partUrl(t, P.part, P.lang); audio.playbackRate = state.speed;
  const resumeAt = fresh && p && !p.done && p.part === P.part ? p.pos : 0;
  audio.addEventListener("loadedmetadata", function once() {
    audio.removeEventListener("loadedmetadata", once);
    if (resumeAt > 5 && resumeAt < audio.duration - 5) audio.currentTime = resumeAt;
    audio.playbackRate = state.speed;
  });
  if (autoplay) audio.play().catch(() => {});
  mediaSession(t); renderMini(); refreshPlaying(); syncNP();
}
function toggle() { if (!cur()) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
function nextTrack(skipped) {
  const t = cur(); if (t && skipped && audio.currentTime < 60 && P.part === 0) { state.skips[t.id] = (state.skips[t.id] || 0) + 1; save.skips(); }
  if (P.idx < P.queue.length - 1) { P.idx++; store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx: P.ctx }); load(true, true); }
  else { // queue ran out: keep going with a recommendation (like radio)
    const r = recommend(1, { exclude: new Set(P.queue) })[0];
    if (r) { P.queue.push(r.t.id); P.idx++; load(true, true); toast(`Up next: ${R(r.t.title)}`); } else audio.pause();
  }
}
function next(skipped) {           // next section, then next chapter
  const t = cur(); if (!t) return;
  if (P.part < nSections(t) - 1) { P.part++; P.fails = 0; load(true); } else nextTrack(skipped);
}
function prev() {
  if (audio.currentTime > 5) { audio.currentTime = 0; return; }
  if (P.part > 0) { P.part--; load(true); return; }
  if (P.idx > 0) { P.idx--; const t = cur(); P.part = nSections(t) - 1; load(true); } else audio.currentTime = 0;
}
let tick = 0;
audio.addEventListener("timeupdate", () => {
  const t = cur(); if (!t) return;
  const p = state.plays[t.id] || (state.plays[t.id] = { sec: 0, pos: 0, part: 0, done: false, n: 0, last: Date.now() });
  const now = Date.now();
  if (!audio.paused && p._t) { const dt = Math.min(2, (now - p._t) / 1000); p.sec += dt * state.speed; if (tick % 8 === 0) logDay(dt * 8 / 60); }
  p._t = now; p.pos = audio.currentTime; p.part = P.part; p.last = now;
  if (P.part === nSections(t) - 1 && audio.duration && audio.currentTime / audio.duration > .92 && !p.done) { p.done = true; p.n = (p.n || 0) + 1; logDay(0, t.id); }
  if (++tick % 8 === 0) save.plays();
  if (P.sleepAt && now >= P.sleepAt) { P.sleepAt = null; audio.pause(); toast("Sleep timer: paused"); }
  updateProgress();
});
audio.addEventListener("play", () => { if (cur()) { const p = state.plays[cur().id]; if (p) p._t = Date.now(); } renderMini(); refreshPlaying(); syncNP(); });
audio.addEventListener("pause", () => { renderMini(); refreshPlaying(); syncNP(); save.plays(); });
audio.addEventListener("ended", () => {
  const t = cur(); if (!t) return;
  if (P.sleepEnd && P.part >= nSections(t) - 1) { P.sleepEnd = false; toast("Sleep timer: stopped after the chapter"); return; }
  if (P.sleepSec) { P.sleepSec = false; if (P.part < nSections(t) - 1) { P.part++; load(false); } toast("Sleep timer: stopped after the section"); return; }
  next(false);
});
audio.addEventListener("error", () => {
  const t = cur(); if (!t) return;
  if (P.lang === "en") { P.lang = "he"; audio.src = partUrl(t, P.part, "he"); audio.play().catch(() => {}); toast("No English reading for this section — playing the Hebrew"); return; }
  P.fails++;
  if (P.fails <= 2 && P.part < nSections(t) - 1) { P.part++; load(true); return; }   // a missing section file: skip it
  toast(`Couldn't load the audio for “${R(t.title)}”. Check your connection.`);
});
function mediaSession(t) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: R(t.title), artist: `Peninei Halakha · ${t.vol.short}`, album: t.vol.title,
      artwork: [{ src: "icon-512.png", sizes: "512x512", type: "image/png" }] });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play()); ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("nexttrack", () => next(true)); ms.setActionHandler("previoustrack", prev);
    ms.setActionHandler("seekbackward", () => audio.currentTime -= 15); ms.setActionHandler("seekforward", () => audio.currentTime += 30);
  } catch {}
}

/* ---------- icons ---------- */
const I = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 6.2v11.6a1 1 0 0 0 1.5.86L15 13.5V17a1 1 0 0 0 2 0V7a1 1 0 0 0-2 0v3.5L6.5 5.34A1 1 0 0 0 5 6.2Z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.2v11.6a1 1 0 0 1-1.5.86L9 13.5V17a1 1 0 0 1-2 0V7a1 1 0 0 1 2 0v3.5l8.5-5.16A1 1 0 0 1 19 6.2Z"/></svg>',
  back15: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">15</text></svg>',
  fwd30: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">30</text></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/></svg>',
  heartOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  backArrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M15 5l-7 7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M6 9l6 6 6-6"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/></svg>',
  books: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h4v15H4zM10 5h4v15h-4zM16 6l3.5-.8 2.6 14.6-3.5.8z"/></svg>',
  lists: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h11M4 12h11M4 17h7"/><circle cx="18" cy="16" r="2.5"/><path d="M20.5 16V6l-3 1"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" width="18" height="18"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/></svg>',
  queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 15l6-6 6 6"/></svg>',
  dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 5.5h6.5A2.5 2.5 0 0 1 12 8v12a2 2 0 0 0-2-2H3zM21 5.5h-6.5A2.5 2.5 0 0 0 12 8v12a2 2 0 0 1 2-2h7z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  bookOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  heb: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="15" fill="currentColor" font-family="serif">א</text></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.6M14.5 8.6C15.2 7.6 16 7 17 7h3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/></svg>'
};

/* ---------- small render helpers ---------- */
const coverStyle = v => `--c1:${v.c1};--c2:${v.c2};--c3:${v.c3}`;
const cover = (v, cls = "") => `<div class="cover ${cls}" style="${coverStyle(v)}"><div class="ring"></div><div class="glyph">${v.glyph}</div><div class="cap">${esc(R(v.short))}</div></div>`;
const art = t => `<div class="art" style="${coverStyle(t.vol)}"><span>${t.vol.glyph}</span></div>`;
function trackRow(t, o = {}) {
  const p = state.plays[t.id] || {}, d = dur(t), pct = !p.done && (p.part || p.pos > 30) ? Math.min(100, ((p.part || 0) + .5) / nSections(t) * 100) : 0;
  const playing = cur() && cur().id === t.id;
  return `<div class="trk ${playing ? "playing" : ""} ${playing && audio.paused ? "paused" : ""}" data-id="${t.id}">
    <button class="trk-play" data-act="play" data-id="${t.id}" aria-label="Play ${esc(R(t.title))}">${art(t)}</button>
    <button class="txt" data-act="${o.openChapter === false ? "play" : "chapter"}" data-id="${t.id}" style="text-align:left">
      <div class="t">${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : ""}${esc(R(t.title))}</div>
      <div class="m">${o.why ? `<span class="why">${esc(o.why)}</span> · ` : ""}${esc(R(t.vol.short))} · ch. ${t.n}${t.vol.he ? (t.translated ? " · AI translation" : " · Hebrew") : ""}${d ? ` · ${mins(d)}` : ""}${p.done ? " · ✓ heard" : ""}</div>
      ${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
    </button>
    <div class="end">${o.end || `<button class="iconbtn" style="background:none" data-act="trackmenu" data-id="${t.id}" aria-label="More options">${I.more}</button>`}</div>
  </div>`;
}
function plArt(pl) {
  const vols = [...new Set(pl.tracks.map(id => BYID[id] && BYID[id].vol).filter(Boolean))];
  const four = [0, 1, 2, 3].map(i => vols[i % Math.max(1, vols.length)] || VOLS[i]);
  return `<div class="plart">${four.map((v, i) => `<i style="--c1:${i % 2 ? v.c1 : `linear-gradient(135deg,${v.c1},${v.c2})`};background:${i % 3 ? v.c1 : `linear-gradient(135deg,${v.c1},${v.c2})`}" data-g="${v.glyph}"></i>`).join("")}<div class="shade"></div><div class="badge">${esc(pl.name)}</div></div>`;
}
const plCard = pl => `<button class="plcard" data-act="playlist" data-id="${pl.id}">${plArt(pl)}<span>${pl.tracks.length} chapters · ${mins(plDur(pl.tracks)) || "–"}</span></button>`;
const volCard = v => { const n = v.chapters.length, heard = TRACKS.filter(t => t.vol === v && (state.plays[t.id] || {}).done).length;
  return `<button class="volcard" data-act="vol" data-id="${v.book}">${cover(v)}<div><b style="font-weight:600;font-size:15px">${esc(R(v.title))}</b><div class="meta">${n} chapters${v.he ? (v.chapters.some(c => c.translated) ? " · AI translation" : " · Hebrew") : ""}${heard ? ` · ${heard} heard` : ""}</div></div></button>`; };

/* ---------- views ---------- */
const view = $("#view"), topTitle = $("#topTitle"), backBtn = $("#backBtn"), brand = $("#brand");
function setTop(title) {
  const isRoot = !title; brand.hidden = !isRoot; topTitle.hidden = isRoot; backBtn.hidden = isRoot; topTitle.textContent = title || "";
}
function setTab(name) { document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name)); }

function vHome() {
  setTop(null); setTab("home");
  if (!state.interests) return vOnboard();
  const recs = recommend(10), hero = recs[0];
  const lq = state.lastQueue && BYID[state.lastQueue.ids[state.lastQueue.idx]];
  const resumeList = Object.entries(state.plays).filter(([id, p]) => BYID[id] && !p.done && (p.part || p.pos > 30)).sort((a, b) => b[1].last - a[1].last).slice(0, 3).map(([id]) => BYID[id]);
  const hr = new Date().getHours(), greet = hr < 12 ? "Boker tov" : hr < 18 ? "Good afternoon" : "Erev tov";
  view.innerHTML = `
  <div class="view">
    <div><div class="eyebrow">${HEB ? `<span class="hebdate">${HEB.day} ${esc(HEB.month)} ${esc(HEB.year)}</span> · ` : ""}${esc(SEASON.label)}</div>
      <h1 class="hello">${greet}. <em>One pearl</em> at a time.</h1></div>
    ${todayCard()}
    ${hero ? `<section class="hero"><div class="orb"></div>
      <div class="eyebrow" style="position:relative;color:var(--gold-2)">Today's pearl</div>
      <h3>${esc(R(hero.t.title))}</h3>
      <div class="why">${esc(hero.why || `${R(hero.t.vol.title)} · chapter ${hero.t.n}`)} · ${esc(R(hero.t.vol.short))}${dur(hero.t) ? ` · ${mins(dur(hero.t))}` : ""}</div>
      <div class="row">${hasHe(hero.t) || hasEn(hero.t) ? `<button class="btn gold" data-act="play" data-id="${hero.t.id}">${I.play}Listen</button>` : ""}
        <button class="btn ghost" data-act="chapter" data-id="${hero.t.id}">${I.read}Read in English</button></div></section>` : ""}
    ${resumeList.length ? `<section><div class="sec-h"><h2>Pick up where you left off</h2></div><div class="list">${resumeList.map(t => trackRow(t)).join("")}</div></section>` : ""}
    <section><div class="sec-h"><h2>Made for you</h2><button class="more" data-go="library">All playlists</button></div>
      <div class="shelf">${madeForYou().map(plCard).join("")}</div></section>
    <section><div class="sec-h"><h2>Recommended chapters</h2><button class="more" data-act="playrecs">${"Play all"}</button></div>
      <div class="list">${recs.slice(1, 7).map(r => trackRow(r.t, { why: r.why })).join("")}</div></section>
    <section><div class="sec-h"><h2>Curated playlists</h2></div>
      <div class="shelf">${rankedPresets().map(plCard).join("")}</div></section>
    <section><div class="sec-h"><h2>The books</h2><button class="more" data-go="books">See all</button></div>
      <div class="shelf">${VOLS.map(volCard).join("")}</div></section>
    ${aboutFoot()}
  </div>`;
}
function aboutFoot() {   // the short credit on Home; the full acknowledgement is the Credits page (#credits)
  return `<a class="credit" href="#credits">
    <span class="credit-orb" aria-hidden="true"></span>
    <span><b><i>Peninei Halakha</i> by Rabbi Eliezer Melamed</b>
    <span lang="he">פניני הלכה · הרב אליעזר מלמד · מכון הר ברכה</span>
    Text and audio from Yeshivat Har Bracha, CC BY 4.0. Pearls is an independent, free reader. <u>Credits, licence and thanks</u></span></a>`;
}
function vCredits() {
  setTop("Credits"); setTab("");
  const ext = (href, label) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  view.innerHTML = `<div class="view credits">
    <div><div class="eyebrow">With thanks</div>
      <h1 class="hello">The pearls are <em>Rabbi Melamed's</em>.</h1>
      <p class="sub">Everything you read and hear in this app comes from <i>Peninei Halakha</i>, written by Rabbi Eliezer Melamed and published by the Har Bracha Institute. Pearls only arranges it for listening, reading and finding your way.</p></div>

    <section class="panel">
      <div class="ttl" lang="he" dir="rtl" style="font-family:var(--f-heb)">פניני הלכה, הרב אליעזר מלמד, מכון הר ברכה</div>
      <p class="note" style="margin-top:8px">The attribution the publisher asks for, in its own words.</p>
    </section>

    <section><div class="sec-h"><h2>The work</h2></div>
      <p class="reader-p"><i>Peninei Halakha</i> is a series of books on Jewish law, now more than twenty volumes. Each subject starts from the spiritual meaning of the mitzvot and runs to the practical law, from its Talmudic sources to questions of modern life, in clear language for beginners and scholars alike. It began as short daily halakha broadcasts on Arutz 7 radio. The series has been translated into English, French, Spanish and Russian, and over 1,200,000 volumes have been sold.</p>
      <p class="foot">Source: ${ext("https://ph.yhb.org.il/en/about-2/", "About the series")}, Peninei Halakha website.</p></section>

    <section><div class="sec-h"><h2>The author</h2></div>
      <p class="reader-p">Rabbi Eliezer Melamed is the Rabbi of the Har Bracha community and Rosh Yeshiva of Yeshivat Har Bracha. Born in 1961, he studied for five years under Rabbi Tzvi Yehuda HaKohen Kook, whom he considers his primary teacher, and also under Rabbi Avraham Shapira. He taught Talmud and emuna for twenty years at the Beit El Yeshiva.</p>
      <p class="foot">Source: ${ext("https://ph.yhb.org.il/en/about-the-author/", "About the Author")}, Peninei Halakha website.</p></section>

    <section><div class="sec-h"><h2>What Pearls uses</h2></div>
      <ul class="credlist">
        <li><b>English text</b>: the official English translation, published by Har Bracha and loaded from ${ext("https://ph.yhb.org.il/en/", "ph.yhb.org.il/en")}.</li>
        <li><b>Hebrew text</b>: the original, loaded from ${ext("https://ph.yhb.org.il/", "ph.yhb.org.il")}.</li>
        <li><b>Audio</b>: the Hebrew and English recordings Yeshivat Har Bracha publishes for each section.</li>
        <li><b>AI translations</b>: for volumes with no official English edition, Pearls includes its own English translation, made with AI (Claude, by Anthropic) from the Hebrew. These are not by Rabbi Melamed or Har Bracha, are not reviewed by them, and are labelled <span class="aitag sm">AI</span> wherever they appear.</li>
      </ul></section>

    <section><div class="sec-h"><h2>Licence</h2></div>
      <p class="reader-p">Har Bracha makes the content of the Peninei Halakha website available under the ${ext("https://creativecommons.org/licenses/by/4.0/", "Creative Commons Attribution 4.0 International licence (CC BY 4.0)")}, with one addition: complete or near-complete copies may not be sold without their written permission. Translation, summaries and other derived works are explicitly allowed, provided the source is credited, linked and any changes are stated. The full terms are on the ${ext("https://ph.yhb.org.il/terms/", "site's terms page")} (in Hebrew).</p>
      <div class="panel"><div class="eyebrow" style="margin-bottom:6px">Changes Pearls makes</div>
        <ul class="credlist">
          <li>Text is reformatted for phone reading, split by section, with links to Sefaria and Meldar.</li>
          <li>The optional "S&amp;P house rules" spelling changes how some Hebrew terms are transliterated; the default keeps the published spelling.</li>
          <li>Hebrew-only volumes are translated into English by AI, as above.</li>
          <li>Chapters are tagged by topic and grouped into playlists and recommendations.</li>
        </ul></div>
      <p class="note">Pearls is free and is not sold. It is an independent project, not affiliated with or endorsed by Yeshivat Har Bracha or Rabbi Melamed. For questions of practical halakha, rely on the books themselves and on your rabbi.</p></section>

    <section><div class="sec-h"><h2>Thank you</h2></div>
      <p class="reader-p">To Rabbi Eliezer Melamed, for a lifetime of teaching halakha with clarity, warmth and love of Torah; to Yeshivat Har Bracha and the Har Bracha Institute, for the translators, editors and readers who made the books and recordings, and for the generosity of sharing them openly so that anyone can learn. May the learning bring blessing to all who take part in it.</p>
      <div class="row" style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn gold" href="https://shop.yhb.org.il/product-category/translated/peninei-halakha-en/" target="_blank" rel="noopener">${I.book}Buy the books</a>
        <a class="btn line" href="https://ph.yhb.org.il/en/donations/" target="_blank" rel="noopener">Support Har Bracha</a>
        <a class="btn line" href="https://ph.yhb.org.il/en/" target="_blank" rel="noopener">${I.ext}Peninei Halakha online</a></div></section>

    <section><div class="sec-h"><h2>Also with thanks</h2></div>
      <ul class="credlist">
        <li>${ext("https://www.sefaria.org/", "Sefaria")}, for the chapter and section references Pearls links to.</li>
        <li>Meldar, for the study-record approach Pearls follows.</li>
        <li>The typefaces, from ${ext("https://fonts.google.com/", "Google Fonts")} under the SIL Open Font License, including Frank Ruhl Libre for the Hebrew.</li>
        <li>The Hebrew faces Shofar (in the style of Koren) and Keter YG, by Yoram Gnat of the ${ext("https://culmus.sourceforge.io/taamim/", "Culmus project")}, under the GNU GPL v2 with the font exception; included unmodified.</li>
      </ul></section>
  </div>`;
}
function vOnboard() {
  setTop(null); setTab("home");
  const picks = new Set();
  const opts = ["shabbat", "prayer", "food", "kiddush", "melakhot", "festival", "pesach", "seder", "sukkot", "high-holidays", "teshuva", "fasts", "hanukkah", "purim", "omer", "marriage", "family", "women", "foundations", "rain"];
  view.innerHTML = `<div class="view onb">
    <div class="eyebrow">Peninei Halakha · in English</div>
    <h1>What would you like to <em>learn</em>?</h1>
    <p class="sub">Pick a few. Every chapter has the English text and Rav Melamed's book read aloud in the original Hebrew. Your picks seed the recommendations; listening refines them.</p>
    <div class="chips" id="onbChips">${opts.map(o => `<button class="chip" data-tag="${o}">${esc(TOPIC_LABEL[o])}</button>`).join("")}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn gold" id="onbGo">Build my feed</button><button class="btn line" id="onbSkip">Skip for now</button></div>
    ${aboutFoot()}</div>`;
  $("#onbChips").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; b.classList.toggle("on"); b.classList.contains("on") ? picks.add(b.dataset.tag) : picks.delete(b.dataset.tag); };
  $("#onbGo").onclick = () => { state.interests = [...picks]; save.interests(); render(); };
  $("#onbSkip").onclick = () => { state.interests = []; save.interests(); render(); };
}
function vBooks() {
  setTop(null); setTab("books");
  const total = TRACKS.reduce((a, t) => a + (dur(t) || 0), 0);
  view.innerHTML = `<div class="view">
    <div><h1 class="hello">The books</h1><p class="sub">${VOLS.length} volumes in English · ${TRACKS.length} chapters · ${Math.round(total / 3600)}+ hours of original Hebrew audio</p></div>
    <div class="volgrid">${VOLS.map(volCard).join("")}</div>${aboutFoot()}</div>`;
}
function vVol(book) {
  const v = VOLS.find(x => x.book === book); if (!v) return vBooks();
  setTop(v.short); setTab("books");
  const ts = TRACKS.filter(t => t.vol === v), total = ts.reduce((a, t) => a + (dur(t) || 0), 0);
  const heard = ts.filter(t => (state.plays[t.id] || {}).done).length;
  const firstUnheard = ts.find(t => !(state.plays[t.id] || {}).done) || ts[0];
  view.innerHTML = `<div class="view">
    <div class="vhead">${cover(v)}<div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="heb" lang="he" dir="rtl">${esc(v.heb)}</div><h1>${esc(R(v.title))}</h1>
      <div class="stats"><span>${ts.length} chapters</span>${total ? `<span>${ts.every(dur) ? "" : "≈ "}${(total / 3600).toFixed(1)} h of audio${ts.every(dur) ? "" : "+"}</span>` : ""}${heard ? `<span>${heard}/${ts.length} heard</span>` : ""}</div></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn gold" data-act="playvol" data-id="${v.book}" data-start="${ts.indexOf(firstUnheard)}">${I.play}${heard ? "Continue" : "Play the book"}</button>
      <button class="btn ghost" data-act="savevol" data-id="${v.book}">${I.plus}Save as playlist</button></div>
    <div class="list">${ts.map(t => trackRow(t)).join("")}</div>
    ${v.book === "03" ? `<p class="note">Audio for this volume may not be available; the text is.</p>` : ""}
  </div>`;
}
/* In the Apple app the page runs from the pearls:// scheme; text requests go through its proxy (the site's CORS headers are malformed). */
const net = u => window.PEARLS_PROXY ? window.PEARLS_PROXY + encodeURIComponent(u) : u;
const textCache = {};
function loadBook(id) {
  return new Promise((ok, bad) => {
    window.PH_BOOK_LOAD = d => ok(d);
    const s = document.createElement("script"); s.src = `books/${id}.js`; s.onerror = () => bad(new Error("missing"));
    s.onload = () => s.remove(); document.head.appendChild(s);
  });
}
async function fetchSections(t) {
  if (textCache[t.id]) return textCache[t.id];
  if (t.vol.he && t.translated) { const d = await loadBook(t.id); textCache[t.id] = d; return d; }
  const n = Math.max(t.sections || 0, 1);
  const slugs = Array.from({ length: Math.max(n + 2, 30) }, (_, i) => `${t.id}-${String(i + 1).padStart(2, "0")}`);
  const site = t.vol.he ? "https://ph.yhb.org.il" : "https://ph.yhb.org.il/en";
  const url = `${site}/wp-json/wp/v2/posts?per_page=50&_fields=slug,title,content,link&slug=${slugs.join(",")}`;
  const res = await new Promise((ok, bad) => { const x = new XMLHttpRequest(); x.open("GET", net(url)); x.timeout = 20000;
    x.onload = () => x.status === 200 ? ok(x.responseText) : bad(new Error("HTTP " + x.status)); x.onerror = () => bad(new Error("network")); x.ontimeout = () => bad(new Error("timeout")); x.send(); });
  const posts = JSON.parse(res).sort((a, b) => a.slug.localeCompare(b.slug));
  if (t.vol.he) {   // Hebrew-only chapter not yet translated: read the Hebrew live from ph.yhb.org.il
    const d = { id: t.id, translated: false, sections: posts.map(p => ({ slug: p.slug, link: p.link, title_he: p.title.rendered, body_he: cleanHeb(p.content.rendered) })) };
    textCache[t.id] = d; return d;
  }
  textCache[t.id] = posts; return posts;
}
function cleanHeb(html) {
  const d = document.createElement("div"); d.innerHTML = html;
  d.querySelectorAll("script,style,iframe,form,svg,noscript").forEach(e => e.remove());
  d.querySelectorAll("a[href]").forEach(a => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); });
  d.querySelectorAll("[style]").forEach(e => e.removeAttribute("style"));
  return d.innerHTML;
}
function cleanHTML(html) {
  const d = document.createElement("div"); d.innerHTML = html;
  d.querySelectorAll("script,style,iframe,form,img[src^='http:']").forEach(e => e.remove());
  d.querySelectorAll("a[href]").forEach(a => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); });
  d.querySelectorAll("[style]").forEach(e => { if (!/padding-left/.test(e.getAttribute("style"))) e.removeAttribute("style"); });
  respellTree(d);
  return d.innerHTML;
}
function vChapter(id) {
  const t = BYID[id]; if (!t) return vBooks();
  setTop(`${t.vol.short} · ${t.n}`); setTab("books");
  const d = dur(t), liked = state.likes.has(t.id), sim = similar(t, 5);
  const prevT = BYID[`${t.vol.book}-${String(t.n - 1).padStart(2, "0")}`], nextT = BYID[`${t.vol.book}-${String(t.n + 1).padStart(2, "0")}`];
  view.innerHTML = `<div class="view">
    <div class="chhead" style="display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow">${esc(R(t.vol.title))} · Chapter ${t.n}</div><h1>${esc(R(t.title))}</h1>${t.titleHe ? `<div class="hebtitle" lang="he" dir="rtl">${esc(t.titleHe)}</div>` : ""}
      <div class="chips">${t.tags.filter(g => !t.vol.tags.includes(g)).slice(0, 4).map(g => `<span class="chip" style="height:30px;font-size:13px">${esc(TOPIC_LABEL[g] || g)}</span>`).join("")}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        ${hasHe(t) || hasEn(t) ? `<button class="btn gold" data-act="playch" data-id="${t.id}">${I.play}Listen${d ? ` · ${mins(d)}` : ""}<span class="plang"> · ${wantsEnglish(t) ? "English" : "Hebrew"}</span></button>` : `<span class="note">No recording of this chapter</span>`}
        <button class="iconbtn ${liked ? "on" : ""}" data-act="like" data-id="${t.id}" aria-label="Like">${liked ? I.heartOn : I.heart}</button>
        <button class="iconbtn" data-act="addto" data-id="${t.id}" aria-label="Add to playlist">${I.plus}</button>
        <button class="btn ${isDone(t.id) ? "ghost" : "line"}" data-act="markdone" data-id="${t.id}">${isDone(t.id) ? "✓ Done" : "Mark as done"}</button></div>
      ${sefRef(t, null) ? `<div class="meldarrow"><a class="tool" href="https://meldar.pages.dev/?ref=${encodeURIComponent(sefRef(t, null))}" target="_blank" rel="noopener">${I.ext}<span>Open in Meldar</span></a>
        <a class="tool" href="https://meldar.pages.dev/?explain=${encodeURIComponent(sefRef(t, null))}&title=${encodeURIComponent(t.title)}" target="_blank" rel="noopener">${I.ext}<span>Explain it back in Meldar</span></a>
        ${t.vol.book === "19" ? `<a class="tool" href="https://meldar.pages.dev/?view=giyur" target="_blank" rel="noopener">${I.ext}<span>Meldar Giyur track</span></a>` : ""}</div>` : ""}
      ${t.vol.he ? `<div class="aiflag"><b>AI translation</b> This book has no official English edition. ${t.translated ? "The English below is an AI translation of the Hebrew, marked AI throughout." : "This chapter is in Hebrew until its AI translation is added."} ${hasHe(t) ? "The audio is the Hebrew reading." : "There is no recording of this chapter."}</div>`
        : `<p class="note">${hasEn(t) ? "This chapter has an English reading and the Hebrew original. Pick the audio language below or in the player." : "The audio is Rav Melamed's book read in <b>Hebrew</b>; follow along in English below."}</p>`}
      ${langBar(t)}
      <div class="chips"><button class="chip" data-act="spelling" style="height:32px;font-size:13px">Spelling · ${esc(SCHEMES[scheme].name)}</button></div>
    </div>
    ${t.sectionTitles.length ? `<div class="panel"><div class="eyebrow" style="margin-bottom:6px">In this chapter</div><div class="toc">${t.sectionTitles.map((s, i) => `<button data-sec="${i + 1}"><span>${i + 1}</span><span>${esc(R(s))}</span></button>`).join("")}</div></div>` : ""}
    <article class="reader" id="reader"><div class="loading"><div class="spin"></div>Loading the English text…</div></article>
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      ${prevT ? `<button class="btn line" data-act="chapter" data-id="${prevT.id}">← Ch. ${prevT.n}</button>` : "<span></span>"}
      ${nextT ? `<button class="btn line" data-act="chapter" data-id="${nextT.id}">Ch. ${nextT.n} →</button>` : ""}</div>
    <section><div class="sec-h"><h2>Listen next</h2></div><div class="list">${sim.map(r => trackRow(r.t, { why: r.why })).join("")}</div></section>
  </div>`;
  view.querySelectorAll(".toc button").forEach(b => b.onclick = () => { const s = $(`#sec-${b.dataset.sec}`); if (s) s.scrollIntoView({ behavior: "smooth" }); });
  fetchSections(t).then(posts => {
    const r = $("#reader"); if (!r || !document.body.contains(r)) return;
    if (t.vol.he) return renderHebrewChapter(t, posts, r);
    if (!posts.length) { r.innerHTML = `<p class="note">The English text for this chapter isn't published online yet. <a href="https://ph.yhb.org.il/en/" target="_blank" rel="noopener">Open the site</a></p>`; return; }
    r.innerHTML = posts.map((p, i) => `<section id="sec-${i + 1}"><div class="en-body"><h3>${R(p.title.rendered)}</h3>${cleanHTML(p.content.rendered)}</div><div class="hebslot" lang="he" dir="rtl" data-sec="${i + 1}" hidden></div>${secTools(t, i, { hebrew: true })}</section>`).join("") +
      `<p class="foot">Source: <a href="${esc(posts[0].link)}" target="_blank" rel="noopener">${esc(posts[0].link)}</a></p>`;
    applyReadLang(t, r);
  }).catch(() => {
    const r = $("#reader"); if (r) r.innerHTML = `<div class="panel note">Couldn't load the text. You need a connection the first time a chapter opens. The audio may still play.
      <div style="margin-top:10px"><button class="btn ghost" data-act="chapter" data-id="${t.id}">Try again</button></div></div>`;
  });
}

/* ---------- Hebrew-only chapters: Hebrew original + bundled AI translation ---------- */
function aiBanner() {
  return `<div class="aibanner" role="note"><span class="aitag">AI translation</span>
    <span>Machine-translated from Rabbi Melamed's Hebrew by Claude (Anthropic). Not an official translation and not reviewed by Yeshivat Har Bracha or a rabbi. It can be wrong: check the Hebrew before relying on it in practice. Each section links to its Hebrew source.</span></div>`;
}
const notesHTML = (notes, cls) => notes && notes.length ? `<ol class="fn ${cls || ""}">${notes.map(n => `<li value="${n.n}">${n.en ?? n.he}</li>`).join("")}</ol>` : "";
function renderHebrewChapter(t, d, r) {
  const secs = d.sections || [];
  if (!secs.length) { r.innerHTML = `<p class="note">This chapter has no text.</p>`; return; }
  r.innerHTML = (d.translated ? aiBanner() : `<div class="aiflag"><b>Hebrew for now</b> The AI translation of this chapter isn't in this version of the app yet.</div>`) +
    secs.map((s, i) => {
      const heb = `<div class="heb-orig" lang="he" dir="rtl" data-sec="${i + 1}" ${d.translated ? "hidden" : ""}>${s.body_he != null ? `<h3>${s.title_he}</h3>${s.body_he}${notesHTML((s.notes_he || []).map(n => ({ n: n.n, he: n.he })), "he")}` : ""}</div>`;
      if (!d.translated || !s.body_en) return `<section id="sec-${i + 1}">${heb}<p class="foot"><a href="${esc(s.link)}" target="_blank" rel="noopener">Source: ph.yhb.org.il</a></p></section>`;
      const box = document.createElement("div"); box.innerHTML = s.body_en + notesHTML(s.notes_en); respellTree(box);
      return `<section id="sec-${i + 1}"><div class="ai-sec"><h3>${esc(R(s.title_en || ""))} <span class="aitag sm">AI</span></h3>${box.innerHTML}
        <div class="secfoot"><button class="linkbtn" data-heb>Show Hebrew</button><a class="linkbtn" href="${esc(s.link)}" target="_blank" rel="noopener">Hebrew source ↗</a></div></div>${heb}${secTools(t, i)}</section>`;
    }).join("") +
    `<p class="foot">From <i>Peninei Halakha</i> by Rabbi Eliezer Melamed — פניני הלכה, הרב אליעזר מלמד, מכון הר ברכה — licensed CC BY 4.0. ${d.translated ? "Translated into English by AI (changes: translation; footnote markers kept)." : ""}</p>`;
  r.querySelectorAll('.heb-orig').forEach(tintHebrew);
  if (d.translated) applyReadLang(t, r);
  r.onclick = e => { const b = e.target.closest("[data-heb]"); if (!b) return;
    const he = b.closest("section").querySelector(".heb-orig"); he.dataset.user = 1; he.hidden = !he.hidden; b.textContent = he.hidden ? "Show Hebrew" : "Hide Hebrew";
    if (!he.hidden && !he.innerHTML.trim()) {   // lite build: the Hebrew is fetched on demand
      he.innerHTML = `<p class="note">Loading the Hebrew…</p>`;
      hebrewFor(t, +he.dataset.sec).then(h => { he.innerHTML = `<h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}`; tintHebrew(he); })
        .catch(() => { he.innerHTML = `<p class="note">Couldn't load the Hebrew. It needs a connection.</p>`; });
    } };
}

/* ---------- per-section tools: save, share, Sefaria/Meldar, Hebrew side by side ---------- */
function secTools(t, i, opts = {}) {
  const ref = sefRef(t, i + 1), slug = `${t.id}-${String(i + 1).padStart(2, "0")}`, saved = state.saved.some(s => s.id === slug);
  return `<div class="sectools" data-slug="${slug}" data-sec="${i + 1}">
    <button class="tool ${saved ? "on" : ""}" data-act="savesec" data-id="${t.id}" data-sec="${i + 1}" aria-label="Save this section">${saved ? I.bookOn : I.book}<span>${saved ? "Saved" : "Save"}</span></button>
    <button class="tool" data-act="sharesec" data-id="${t.id}" data-sec="${i + 1}" aria-label="Share this section">${I.share}<span>Share</span></button>
    ${opts.hebrew ? `<button class="tool" data-act="hebsec" data-id="${t.id}" data-sec="${i + 1}">${I.heb}<span>Hebrew</span></button>` : ""}
    ${ref ? `<a class="tool" href="${sefUrl(ref)}" target="_blank" rel="noopener">${I.ext}<span>Sefaria</span></a>` : ""}
    ${meldarUrl(ref) ? `<a class="tool" href="${meldarUrl(ref)}" target="_blank" rel="noopener">${I.ext}<span>Meldar</span></a>` : ""}
  </div>`;
}
const hebCache = {};
async function hebrewFor(t, sec) {           // official English books: the Hebrew original from ph.yhb.org.il (CC BY 4.0)
  const slug = `${t.id}-${String(sec).padStart(2, "0")}`;
  if (hebCache[slug]) return hebCache[slug];
  const res = await new Promise((ok, bad) => { const x = new XMLHttpRequest();
    x.open("GET", net(`https://ph.yhb.org.il/wp-json/wp/v2/posts?slug=${slug}&_fields=slug,title,content,link`)); x.timeout = 20000;
    x.onload = () => x.status === 200 ? ok(JSON.parse(x.responseText)) : bad(new Error("HTTP " + x.status)); x.onerror = () => bad(new Error("network")); x.ontimeout = () => bad(new Error("timeout")); x.send(); });
  if (!res.length) throw new Error("not found");
  return (hebCache[slug] = res[0]);
}
async function hebrewChapter(t) {             // all sections of a chapter in one request
  const n = Math.max(t.sections || 0, 1), slugs = Array.from({ length: n }, (_, i) => `${t.id}-${String(i + 1).padStart(2, "0")}`);
  if (slugs.every(s => hebCache[s])) return;
  const res = await new Promise((ok, bad) => { const x = new XMLHttpRequest();
    x.open("GET", net(`https://ph.yhb.org.il/wp-json/wp/v2/posts?per_page=50&_fields=slug,title,content,link&slug=${slugs.join(",")}`)); x.timeout = 25000;
    x.onload = () => x.status === 200 ? ok(JSON.parse(x.responseText)) : bad(new Error("HTTP " + x.status)); x.onerror = () => bad(new Error("network")); x.ontimeout = () => bad(new Error("timeout")); x.send(); });
  res.forEach(p => { hebCache[p.slug] = p; });
}
/* language pickers: segmented controls on the chapter page and in the player */
function listenSeg(t, current) {
  const he = hasHe(t), en = hasEn(t); if (!he && !en) return "";
  const cur = current || (wantsEnglish(t) ? "en" : "he");
  return `<div class="segrow"><span class="seglabel">Audio</span><div class="seg" role="radiogroup" aria-label="Audio language">
    <button role="radio" aria-checked="${cur === "en"}" class="${cur === "en" ? "on" : ""}" data-act="setlisten" data-v="en" data-id="${t.id}" ${en ? "" : "disabled"}>English${en ? "" : "<small>no recording</small>"}</button>
    <button role="radio" aria-checked="${cur === "he"}" class="${cur === "he" ? "on" : ""}" data-act="setlisten" data-v="he" data-id="${t.id}" ${he ? "" : "disabled"} lang="he">עברית${he ? "" : "<small>no recording</small>"}</button></div></div>`;
}
function langBar(t) {
  const r = state.prefs.read || "en";
  const opts = (t.vol.he && !t.translated) ? [["he", "עברית"]] : [["en", t.vol.he ? "English (AI)" : "English"], ["he", "עברית"], ["both", "Both"]];
  return `<div class="langbar"><div class="segrow"><span class="seglabel">Read</span><div class="seg" role="radiogroup" aria-label="Reading language">
    ${opts.map(([v, l]) => `<button role="radio" aria-checked="${r === v}" class="${r === v || opts.length === 1 ? "on" : ""}" data-act="setread" data-v="${v}" data-id="${t.id}" ${v === "he" ? 'lang="he"' : ""}>${l}</button>`).join("")}</div></div>
    ${listenSeg(t)}</div>`;
}
const READ_LABEL = { en: "English", he: "Hebrew", both: "English + Hebrew" };
/* Show the chapter in the reader's language: English, Hebrew, or both (Hebrew under each English section). */
function applyReadLang(t, r) {
  const mode = state.prefs.read || "en";
  r.classList.toggle("read-he", mode === "he"); r.classList.toggle("read-both", mode === "both");
  if (mode === "en") { r.querySelectorAll(".hebslot").forEach(s => { if (!s.dataset.user) s.hidden = true; }); r.querySelectorAll(".heb-orig").forEach(h => { if (!h.dataset.user) h.hidden = true; }); return; }
  const slots = [...r.querySelectorAll(".hebslot, .heb-orig")];
  slots.forEach(s => { s.hidden = false; });
  const empty = slots.filter(s => !s.innerHTML.trim());
  if (!empty.length) return;
  empty.forEach(s => { s.innerHTML = `<div class="loading"><div class="spin"></div>טוען…</div>`; });
  hebrewChapter(t).then(() => empty.forEach(s => {
    const h = hebCache[`${t.id}-${String(s.dataset.sec).padStart(2, "0")}`];
    s.innerHTML = h ? `<h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}` : `<p class="note" dir="ltr">No Hebrew found for this section.</p>`; tintHebrew(s);
  })).catch(() => empty.forEach(s => { s.innerHTML = `<p class="note" dir="ltr">Couldn't load the Hebrew. It needs a connection.</p>`; }));
}
function toggleSave(t, sec) {
  const slug = `${t.id}-${String(sec).padStart(2, "0")}`, k = state.saved.findIndex(s => s.id === slug);
  if (k >= 0) { state.saved.splice(k, 1); save.saved(); toast("Removed from Saved"); return false; }
  state.saved.unshift({ id: slug, ch: t.id, sec, ref: sefRef(t, sec), title: t.sectionTitles[sec - 1] || `${t.title} §${sec}`, note: "", at: Date.now() });
  save.saved(); toast("Saved · add a note from Playlists → Saved"); return true;
}
function shareSection(t, sec) {
  const el = document.getElementById(`sec-${sec}`);
  const body = el ? (el.querySelector(".ai-sec") || el).innerText.replace(/\b(Save|Saved|Share|Hebrew|Sefaria|Meldar|Show Hebrew|Hide Hebrew|Hebrew source ↗)\b/g, "").trim() : "";
  const ref = sefRef(t, sec), excerpt = body.length > 700 ? body.slice(0, 700).replace(/\s+\S*$/, "") + "…" : body;
  const label = t.vol.he ? "AI translation of Peninei Halakha" : "Peninei Halakha";
  copyText(`${excerpt}\n\n— ${label}, ${R(t.vol.title)} ${t.n}:${sec}${ref ? `\n${sefUrl(ref)}` : ""}`);
}

/* ---------- Today (daily plan) ---------- */
function planTrack() {
  const pl = state.plan; if (!pl) return [];
  return TRACKS.filter(t => (pl.book === "all" ? !t.vol.he || t.translated : t.vol.book === pl.book) && t.n !== 0).map(t => t.id);
}
function todayItems() {
  const pl = state.plan; if (!pl) return [];
  const k = dayKey(), doneToday = (state.days[k] || {}).ch || [];
  const left = planTrack().filter(id => !isDone(id) || doneToday.includes(id));
  return left.slice(0, pl.per);
}
function todayCard() {
  const pl = state.plan;
  if (!pl) return `<section class="today panel"><div class="eyebrow">Today</div><h3 class="ttl">Learn a little every day</h3>
    <p class="note" style="margin:0">Pick a book and a pace; Pearls hands you the next chapter each day and keeps your streak.</p>
    <div><button class="btn gold" data-act="plan">Set a daily plan</button></div></section>`;
  const items = todayItems().map(id => BYID[id]).filter(Boolean), s = streak();
  const all = planTrack(), done = all.filter(isDone).length;
  return `<section class="today panel"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
      <div class="eyebrow">Today · ${pl.book === "all" ? "All books" : esc(R(VOLS.find(v => v.book === pl.book).title))}</div>
      <button class="more" data-go="progress">${recView() ? esc(recView().head) : "Progress"}</button></div>
    ${items.length ? items.map(t => `<div class="todayrow ${isDone(t.id) ? "done" : ""}">
        <button class="check" data-act="markdone" data-id="${t.id}" aria-label="Mark done">${isDone(t.id) ? "✓" : ""}</button>
        <button class="txt" data-act="chapter" data-id="${t.id}" style="text-align:left;flex:1;min-width:0"><b>${esc(R(t.title))}</b><span class="m">${esc(R(t.vol.short))} · ch. ${t.n}${dur(t) ? ` · ${mins(dur(t))}` : ""}</span></button>
        <button class="iconbtn" data-act="play" data-id="${t.id}" aria-label="Listen">${I.play}</button></div>`).join("")
      : `<p class="note" style="margin:0">You've finished this plan. Choose another book.</p>`}
    <div class="planbar"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div>
    <div class="note" style="display:flex;justify-content:space-between"><span>${done} of ${all.length} chapters</span><button class="linkbtn" data-act="plan">Change plan</button></div></section>`;
}
function planDialog() {
  const vols = VOLS.filter(v => !v.he || v.chapters.some(c => c.translated));
  dialog(`<h3>Daily plan</h3>
    <div class="field"><label for="planBook">Book</label><select id="planBook" class="sel"><option value="all">All books, in order</option>
      ${vols.map(v => `<option value="${v.book}" ${state.plan && state.plan.book === v.book ? "selected" : ""}>${esc(R(v.title))}${v.he ? " (AI translation)" : ""}</option>`).join("")}</select></div>
    <div class="field"><label>Pace</label><div class="chips">${[1, 2, 3].map(n => `<button class="chip ${(state.plan ? state.plan.per : 1) === n ? "on" : ""}" data-per="${n}">${n} chapter${n > 1 ? "s" : ""} a day</button>`).join("")}</div></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">${state.plan ? `<button class="btn line" data-off>Stop plan</button>` : ""}<button class="btn gold" data-ok>Save</button></div>`, (s, close) => {
    let per = state.plan ? state.plan.per : 1;
    s.querySelectorAll("[data-per]").forEach(c => c.onclick = () => { per = +c.dataset.per; s.querySelectorAll("[data-per]").forEach(x => x.classList.toggle("on", x === c)); });
    const off = $("[data-off]", s); if (off) off.onclick = () => { state.plan = null; save.plan(); close(); render(); };
    $("[data-ok]", s).onclick = () => { state.plan = { book: $("#planBook", s).value, per, start: Date.now() }; save.plan(); close(); render(); toast("Daily plan set"); };
  });
}

/* ---------- Progress ---------- */
function vProgress() {
  setTop("Progress"); setTab("library");
  const doneN = TRACKS.filter(t => isDone(t.id)).length, totalMin = Object.values(state.days).reduce((x, d) => x + d.min, 0);
  const v = recView(), choice = REC ? REC.choice() : "off";
  const recordHTML = !REC ? "" : choice !== "on" ? `<section class="panel"><div class="eyebrow">${esc(REC.ASK.kicker)}</div><h3 class="ttl">${esc(REC.ASK.title)}</h3>
      <p class="note">${esc(REC.ASK.intro)}</p><ul class="risks">${REC.ASK.risks.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn gold" data-act="recyes">${esc(REC.ASK.yes)}</button>${choice === null ? `<button class="btn line" data-act="recno">${esc(REC.ASK.no)}</button>` : ""}</div>
      <p class="foot">${esc(REC.ASK.note)} The same record Meldar keeps, kept separately on this device.</p></section>`
    : `<section class="panel record"><h3 class="ttl">${esc(v.head)}</h3>${v.today ? `<p class="note">${esc(v.today)}</p>` : ""}${v.since ? `<p class="note">${esc(v.since)}</p>` : ""}
      <p class="note">${esc(v.runLine)}${v.longestLine ? ` · ${esc(v.longestLine)}` : ""}</p><p class="foot">${esc(v.runNote)}</p>
      <div class="chain">${v.chain.map(l => `<i class="${l.today ? "today" : ""}" title="${l.iso}"></i>`).join("")}</div>${v.chainMore ? `<p class="foot">${esc(v.chainMore)}</p>` : ""}
      ${v.fresh ? `<p class="note">${esc(v.fresh)}</p>` : ""}
      ${v.milestones.map(m => `<div class="milestone"><b>${esc(m.title)}</b><span>${esc(m.say)}</span><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.ref)} ↗</a></div>`).join("")}
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px"><button class="linkbtn" data-act="recsince">${REC.state().showSince ? "Hide" : "Show"} “last studied”</button><button class="linkbtn" data-act="recoff">Turn the record off</button></div></section>`;
  view.innerHTML = `<div class="view">
    ${recordHTML}
    <div class="stats3"><div><b>${doneN}</b><span>chapters done</span></div><div><b>${Math.round(totalMin / 60 * 10) / 10}</b><span>hours listened</span></div><div><b>${state.saved.length}</b><span>passages saved</span></div></div>
    <section><div class="sec-h"><h2>Books</h2></div><div class="list">${VOLS.map(v => { const ts = TRACKS.filter(t => t.vol === v), n = ts.filter(t => isDone(t.id)).length;
      return `<button class="trk" data-act="vol" data-id="${v.book}" style="grid-template-columns:48px 1fr auto"><div class="art" style="${coverStyle(v)}"><span>${v.glyph}</span></div>
        <div class="txt"><div class="t">${esc(R(v.title))}${v.he && v.chapters.some(c => c.translated) ? ' <span class="aitag sm">AI</span>' : ""}</div><div class="bar"><i style="width:${ts.length ? n / ts.length * 100 : 0}%"></i></div></div><span class="dur">${n}/${ts.length}</span></button>`; }).join("")}</div></section>
    <section class="panel"><div class="eyebrow">Meldar</div><h3 class="ttl">Take your learning with you</h3>
      <p class="note">Every section has an <b>Open in Meldar</b> button that opens the same text in Meldar's reader. Your study log (chapters, minutes, saved passages, Sefaria references) can be copied as open data for Meldar to import.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn gold" data-act="exportlog">Copy study log</button><a class="btn line" href="https://meldar.pages.dev/?view=myLearning" target="_blank" rel="noopener">My Learning in Meldar ↗</a></div></section>
  </div>`;
}
function studyLog() {
  const chapters = TRACKS.filter(t => isDone(t.id) || (state.plays[t.id] || {}).sec > 60).map(t => {
    const p = state.plays[t.id] || {};
    return { id: t.id, ref: sefRef(t, null), book: t.vol.title, title: t.title, ai: !!t.vol.he, heard: !!p.done, read: !!state.read[t.id],
      minutes: Math.round((p.sec || 0) / 6) / 10, last: p.last ? new Date(p.last).toISOString() : null };
  });
  return { schema: "pearls-study-log/1", source: "Pearls — Peninei Halakha reader", generated: new Date().toISOString(),
    streak: streak(), days: state.days, chapters,
    saved: state.saved.map(s => ({ ref: s.ref, id: s.id, title: s.title, note: s.note, at: new Date(s.at).toISOString() })),
    playlists: state.mine.map(p => ({ name: p.name, items: p.tracks.map(id => ({ id, ref: BYID[id] ? sefRef(BYID[id], null) : null })) })) };
}

/* ---------- Settings ---------- */
function settingsDialog() {
  dialog(`<h3>Settings</h3>
    <div class="field"><label>Skin</label><div class="skins">${SKINS.map(k => `<button class="skinbtn ${(state.prefs.skin || "classic") === k.id ? "on" : ""}" data-skin="${k.id}" aria-pressed="${(state.prefs.skin || "classic") === k.id}"><i style="background:${k.bg}"><b style="background:${k.acc}"></b></i><span>${k.name}${k.note ? `<small>${k.note}</small>` : ""}</span></button>`).join("")}</div></div>
    <div class="field"><label>Spelling of Hebrew words</label>
      ${Object.entries(SCHEMES).map(([k, s]) => `<button class="opt" data-s="${k}"><span class="radio ${k === scheme ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>${s.name}</b><br><span class="note">${esc(s.sub)}</span></span></button>`).join("")}</div>
    <div class="field"><label>Text size</label><div class="chips">${[[0.9, "Small"], [1, "Normal"], [1.15, "Large"], [1.3, "Larger"]].map(([v, l]) => `<button class="chip ${state.prefs.size === v ? "on" : ""}" data-size="${v}">${l}</button>`).join("")}</div></div>
    <div class="field"><label>Hebrew typeface</label><div class="hefonts">${HEB_FONTS.map(f => `<button class="hefont ${(state.prefs.hefont || "frank") === f.id ? "on" : ""}" data-hefont="${f.id}" aria-pressed="${(state.prefs.hefont || "frank") === f.id}"><span class="hs" lang="he" dir="rtl" style="font-family:${f.css.replace(/"/g, "&quot;")}">שְׁמַ֖ע יִשְׂרָאֵ֑ל</span><span><b>${f.name}</b><small>${f.note}</small></span></button>`).join("")}</div></div>
    <div class="field"><label>Read in</label><div class="chips">${[["en", "English"], ["he", "Hebrew"], ["both", "Both"]].map(([v, l]) => `<button class="chip ${(state.prefs.read || "en") === v ? "on" : ""}" data-read="${v}">${l}</button>`).join("")}</div>
      <span class="note">Hebrew is Rav Melamed's original from ph.yhb.org.il; it needs a connection.</span></div>
    <div class="field"><label>Listen in</label><div class="chips">${[["auto", "Match my reading"], ["he", "Hebrew"], ["en", "English"]].map(([v, l]) => `<button class="chip ${audioLang === v ? "on" : ""}" data-alang="${v}">${l}</button>`).join("")}</div>
      <span class="note">"Match my reading" plays the English reading when you read in English and one exists, and the Hebrew otherwise. English readings exist for Shabbat, Prayer, Zemanim and Festivals, and parts of Pesach, Sukkot and Days of Awe; elsewhere the Hebrew plays.</span></div>
    <button class="opt" data-pref="hc"><span class="radio ${state.prefs.hc ? "on" : ""}"></span><span style="flex:1"><b>High contrast</b><br><span class="note">Pure black and white, no glows</span></span></button>
    <button class="opt" data-pref="tint"><span class="radio ${state.prefs.tint ? "on" : ""}"></span><span style="flex:1"><b>Tint look-alike Hebrew letters</b><br><span class="note" lang="he">ב/כ · ד/ר · ה/ח · ו/ז · ג/נ · ס/ם</span></span></button>
    <div class="field"><label for="meldarTpl">Open in Meldar: link pattern</label><input id="meldarTpl" placeholder="https://meldar.pages.dev/?ref={ref}" value="${esc(state.prefs.meldar)}">
      <span class="note">Use {ref} for the Sefaria reference, e.g. “Peninei Halakhah, Berakhot 4:2”. Leave empty to hide the Meldar button.</span></div>
    <p class="foot" style="margin:0">S&amp;P house rules re-spell ${LEX.length} recurring terms (${LEX.filter(e => e.st === "a").length} as the Keter Shem Tob house rules spell them, the rest derived by the same rules). Book and rabbi names keep their published spelling.</p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><a class="btn line" href="#credits" data-credits>Credits &amp; licence</a><button class="btn gold" data-ok>Done</button></div>`, (s, close) => {
    $("[data-credits]", s).onclick = () => close();
    s.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { setScheme(b.dataset.s); s.querySelectorAll("[data-s] .radio").forEach(r => r.classList.toggle("on", r.parentNode.dataset.s === scheme)); });
    s.querySelectorAll("[data-skin]").forEach(b => b.onclick = () => { state.prefs.skin = b.dataset.skin; if (b.dataset.skin === "daf" && !state.prefs.readSet) state.prefs.read = "both"; save.prefs(); applyPrefs(); s.querySelectorAll("[data-skin]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); }); });
    s.querySelectorAll("[data-hefont]").forEach(b => b.onclick = () => { state.prefs.hefont = b.dataset.hefont; save.prefs(); applyHebFont(); s.querySelectorAll("[data-hefont]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); }); });
    s.querySelectorAll("[data-read]").forEach(b => b.onclick = () => { state.prefs.read = b.dataset.read; save.prefs(); s.querySelectorAll("[data-read]").forEach(x => x.classList.toggle("on", x === b)); });
    s.querySelectorAll("[data-alang]").forEach(b => b.onclick = () => { audioLang = b.dataset.alang; store.set("audioLang", audioLang); s.querySelectorAll("[data-alang]").forEach(x => x.classList.toggle("on", x === b)); if (P.queue && P.queue.length) load(!audio.paused); });
    s.querySelectorAll("[data-size]").forEach(b => b.onclick = () => { state.prefs.size = +b.dataset.size; save.prefs(); applyPrefs(); s.querySelectorAll("[data-size]").forEach(x => x.classList.toggle("on", x === b)); });
    s.querySelectorAll("[data-pref]").forEach(b => b.onclick = () => { const k = b.dataset.pref; state.prefs[k] = !state.prefs[k]; save.prefs(); applyPrefs(); b.querySelector(".radio").classList.toggle("on", state.prefs[k]); });
    $("[data-ok]", s).onclick = () => { state.prefs.meldar = $("#meldarTpl", s).value.trim(); save.prefs(); close(); renderMini(); render(); };
  });
}
function vLibrary() {
  setTop(null); setTab("library");
  view.innerHTML = `<div class="view">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px"><h1 class="hello">Playlists</h1>
      <button class="btn gold" data-act="newpl">${I.plus}New</button></div>
    <button class="panel progresslink" data-go="progress"><span><b>Progress</b><br><span class="note">${streak()}-day streak · ${TRACKS.filter(t => isDone(t.id)).length} chapters done · badges</span></span><span class="dur">›</span></button>
    <section><div class="sec-h"><h2>Saved passages</h2></div>
      ${state.saved.length ? `<div class="list">${state.saved.map((s, i) => { const t = BYID[s.ch]; return t ? `<div class="savedrow">
        <button class="txt" data-act="opensaved" data-i="${i}" style="text-align:left"><b>${esc(R(s.title))}</b><span class="m">${esc(R(t.vol.short))} ${t.n}:${s.sec}${t.vol.he ? " · AI translation" : ""}</span>
        ${s.note ? `<span class="savednote">${esc(s.note)}</span>` : ""}</button>
        <button class="iconbtn" style="background:none" data-act="notesaved" data-i="${i}" aria-label="Edit note">✎</button></div>` : ""; }).join("")}</div>`
        : `<p class="note">Tap Save under any section to keep it here, with your own note.</p>`}</section>
    <section><div class="sec-h"><h2>Yours</h2></div>
      ${state.mine.length ? `<div class="list">${state.mine.map(pl => `<button class="trk" data-act="playlist" data-id="${pl.id}" style="grid-template-columns:56px 1fr auto">
        <div style="width:56px">${plArt(pl).replace('class="plart"', 'class="plart" style="border-radius:12px"').replace(/<div class="badge">.*?<\/div>/, "")}</div>
        <div class="txt"><div class="t">${esc(pl.name)}</div><div class="m">${pl.tracks.length} chapters · ${mins(plDur(pl.tracks)) || "empty"}</div></div><span class="dur">›</span></button>`).join("")}</div>`
      : `<div class="panel empty"><div class="em-orb"></div><b style="color:var(--pearl)">No playlists yet</b><span>Make one, then add chapters from any book with the + button.</span>
          <button class="btn gold" data-act="newpl">${I.plus}Create a playlist</button></div>`}</section>
    <section><div class="sec-h"><h2>Made for you</h2></div><div class="shelf">${madeForYou().map(plCard).join("")}</div></section>
    <section><div class="sec-h"><h2>Curated</h2></div><div class="volgrid">${rankedPresets().map(p => plCard(p).replace('class="plcard"', 'class="plcard" style="width:auto"')).join("")}</div></section>
  </div>`;
}
function vPlaylist(id) {
  const pl = findPlaylist(id); if (!pl) return vLibrary();
  const own = pl.kind !== "preset" && pl.kind !== "auto";
  setTop(pl.name); setTab("library");
  const ts = pl.tracks.map(i => BYID[i]).filter(Boolean);
  view.innerHTML = `<div class="view">
    <div class="vhead">${plArt(pl)}<div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="eyebrow">${own ? "Your playlist" : pl.kind === "auto" ? "Made for you" : "Curated"}</div><h1>${esc(pl.name)}</h1>
      <div class="stats"><span>${ts.length} chapters</span><span>${mins(plDur(pl.tracks)) || "–"}</span></div></div></div>
    ${pl.blurb ? `<p class="sub" style="margin:0">${esc(pl.blurb)}</p>` : ""}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn gold" data-act="playpl" data-id="${pl.id}" ${ts.length ? "" : "disabled"}>${I.play}Play</button>
      <button class="btn ghost" data-act="shufflepl" data-id="${pl.id}" ${ts.length ? "" : "disabled"}>${I.shuffle}Shuffle</button>
      ${own ? `<button class="btn line" data-act="renamepl" data-id="${pl.id}">Rename</button><button class="btn line" data-act="delpl" data-id="${pl.id}">Delete</button>`
            : `<button class="btn line" data-act="copypl" data-id="${pl.id}">${I.plus}Save a copy</button>`}</div>
    ${ts.length ? `<div class="list">${ts.map((t, i) => trackRow(t, { end: own ? `
        <button class="iconbtn" style="background:none;width:34px" data-act="mv" data-id="${pl.id}" data-i="${i}" data-d="-1" aria-label="Move up" ${i ? "" : "disabled"}>${I.up}</button>
        <button class="iconbtn" style="background:none;width:34px" data-act="mv" data-id="${pl.id}" data-i="${i}" data-d="1" aria-label="Move down" ${i < ts.length - 1 ? "" : "disabled"}>${I.dn}</button>
        <button class="iconbtn" style="background:none;width:34px" data-act="rm" data-id="${pl.id}" data-i="${i}" aria-label="Remove">${I.x}</button>` : undefined })).join("")}</div>`
      : `<div class="panel empty"><div class="em-orb"></div><span>This playlist is empty. Browse a book and tap + on any chapter.</span><button class="btn ghost" data-go="books">Browse the books</button></div>`}
    ${own && ts.length ? `<section><div class="sec-h"><h2>Suggested for this playlist</h2></div><div class="list">${suggestFor(pl).map(r => trackRow(r.t, { why: r.why, end: `<button class="iconbtn" data-act="addhere" data-pl="${pl.id}" data-id="${r.t.id}" aria-label="Add">${I.plus}</button>` })).join("")}</div></section>` : ""}
  </div>`;
}
function suggestFor(pl) {
  const have = new Set(pl.tracks), w = {};
  for (const id of pl.tracks) for (const g of BYID[id].tags) w[g] = (w[g] || 0) + 1;
  return TRACKS.filter(t => !have.has(t.id)).map(t => ({ t, s: cosine(w, t.tags) + (pl.tracks.some(id => BYID[id].vol === t.vol && Math.abs(BYID[id].n - t.n) === 1) ? .4 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, 5).map(r => ({ ...r, why: `Matches “${pl.name}”` }));
}
function vSearch(q = "") {
  setTop(null); setTab("search");
  view.innerHTML = `<div class="view">
    <h1 class="hello">Search</h1>
    <label class="search">${I.search}<input id="q" type="search" placeholder="Kiddush, shofar, rain, muktze…" value="${esc(q)}" autocomplete="off"><span class="sr">Search chapters</span></label>
    <div class="chips" id="topics">${Object.keys(TOPIC_LABEL).filter(g => TRACKS.some(t => t.tags.includes(g))).slice(0, 24).map(g => `<button class="chip" data-tag="${g}">${esc(TOPIC_LABEL[g])}</button>`).join("")}</div>
    <div class="list" id="results"></div></div>`;
  const run = () => {
    const s = $("#q").value.trim().toLowerCase(), act = view.querySelector(".chip.on");
    let res = [];
    if (s.length > 1) res = TRACKS.map(t => { const hay = `${t.title} ${R(t.title)} ${t.sectionTitles.join(" ")} ${t.sectionTitles.map(R).join(" ")} ${t.vol.title} ${t.tags.map(g => TOPIC_LABEL[g]).join(" ")}`.toLowerCase();
        const sc = ((t.title + " " + R(t.title)).toLowerCase().includes(s) ? 3 : 0) + (hay.includes(s) ? 1 : 0) + s.split(/\s+/).filter(w => hay.includes(w)).length * .5; return { t, sc }; })
      .filter(r => r.sc > .4).sort((a, b) => b.sc - a.sc).map(r => r.t);
    else if (act) res = TRACKS.filter(t => t.tags.includes(act.dataset.tag));
    const sec = s.length > 1 ? TRACKS.flatMap(t => t.sectionTitles.map((x, i) => ({ t, x: R(x), i, raw: x })).filter(o => (o.x + ' ' + o.raw).toLowerCase().includes(s))).slice(0, 6) : [];
    $("#results").innerHTML = res.length ? res.slice(0, 40).map(t => trackRow(t, { why: sec.find(o => o.t === t) ? `§${sec.find(o => o.t === t).i + 1} ${sec.find(o => o.t === t).x}` : "" })).join("")
      : (s || act ? `<div class="empty">Nothing matches “${esc(s)}”. Try a broader word.</div>` : `<div class="empty"><div class="em-orb"></div>Search ${TRACKS.length} chapters by title, section or topic.</div>`);
  };
  $("#q").oninput = run;
  $("#topics").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; const on = b.classList.contains("on"); view.querySelectorAll("#topics .chip").forEach(c => c.classList.remove("on")); if (!on) b.classList.add("on"); $("#q").value = ""; run(); };
  run();
}

/* ---------- mini player & now playing ---------- */
const mini = $("#mini");
function renderMini() {
  const t = cur(); mini.hidden = !t; if (!t) { document.body.classList.remove("has-mini"); return; }
  document.body.classList.add("has-mini");
  const both = hasEn(t) && hasHe(t);
  mini.innerHTML = `<div class="mrow">${art(t)}<button class="txtbtn" data-act="np" aria-label="Open player"><div class="t">${esc(R(t.title))}</div><div class="m">${esc(R(t.vol.short))} · ch. ${t.n} · section ${P.part + 1} of ${nSections(t)}</div></button>
      <button class="langpill ${both ? "" : "fixed"}" ${both ? 'data-act="audiolang"' : "disabled"} aria-label="Audio language">${P.lang === "en" ? "EN" : "עב"}</button>
      <button class="iconbtn mclose" data-act="closeplayer" aria-label="Close player">${I.x}</button></div>
    <div class="mseek"><span id="mCur">0:00</span><input type="range" id="miniSeek" min="0" step="1" value="0" aria-label="Seek"><span id="mLeft">–</span></div>
    <div class="mctl">
      <button class="speedbtn" data-act="speed" aria-label="Speed">${state.speed}×</button>
      <button class="iconbtn" data-act="b15" aria-label="Back 15 seconds">${I.back15}</button>
      <button class="iconbtn" data-act="prev" aria-label="Previous section">${I.prev}</button>
      <button class="iconbtn big" data-act="toggle" aria-label="${audio.paused ? "Play" : "Pause"}">${audio.paused ? I.play : I.pause}</button>
      <button class="iconbtn" data-act="next" aria-label="Next section">${I.next}</button>
      <button class="iconbtn" data-act="f30" aria-label="Forward 30 seconds">${I.fwd30}</button>
    </div>`;
  const ms = $("#miniSeek", mini);
  ms.oninput = () => { ms._drag = true; $("#mCur").textContent = fmt(+ms.value); };
  ms.onchange = () => { audio.currentTime = +ms.value; ms._drag = false; };
  updateProgress();
}
function updateProgress() {
  const pct = audio.duration ? audio.currentTime / audio.duration * 100 : 0;
  const ms = $("#miniSeek"); if (ms && !ms._drag) { ms.max = audio.duration || 0; ms.value = audio.currentTime; ms.style.setProperty("--p", pct + "%"); }
  const mc = $("#mCur"), ml = $("#mLeft"); if (mc && !(ms && ms._drag)) mc.textContent = fmt(audio.currentTime); if (ml) ml.textContent = audio.duration ? "-" + fmt(Math.max(0, audio.duration - audio.currentTime)) : "–";
  const sk = $("#seek"); if (sk && !sk._drag) { sk.max = audio.duration || dur(cur() || {}) || 0; sk.value = audio.currentTime; }
  const a = $("#tCur"), b = $("#tLeft"); if (a) a.textContent = fmt(audio.currentTime); if (b) b.textContent = "-" + fmt(Math.max(0, (audio.duration || 0) - audio.currentTime));
  const sl = $("#sleepPill"); if (sl && P.sleepAt) sl.textContent = `Sleep ${fmt((P.sleepAt - Date.now()) / 1000)}`;
}
function refreshPlaying() {
  document.querySelectorAll(".trk[data-id]").forEach(el => {
    const on = cur() && el.dataset.id === cur().id; el.classList.toggle("playing", !!on); el.classList.toggle("paused", !!on && audio.paused);
    const t = el.querySelector(".t"); if (!t) return; const eq = t.querySelector(".eq");
    if (on && !eq) t.insertAdjacentHTML("afterbegin", '<span class="eq"><i></i><i></i><i></i></span>'); if (!on && eq) eq.remove();
  });
}
let npEl = null;
function openNP() {
  const t = cur(); if (!t) return; closeNP();
  npEl = document.createElement("div"); npEl.className = "sheet"; npEl.setAttribute("role", "dialog"); npEl.setAttribute("aria-label", "Now playing");
  document.body.appendChild(npEl); syncNP(true);
  history.pushState({ np: 1 }, "");
}
function closeNP() { if (npEl) { npEl.remove(); npEl = null; } }
function syncNP(full) {
  if (!npEl) return; const t = cur(); if (!t) return closeNP();
  const liked = state.likes.has(t.id);
  if (full || npEl.dataset.id !== t.id + ':' + P.part + ':' + P.lang) {
    npEl.dataset.id = t.id + ':' + P.part + ':' + P.lang;
    const upnext = P.queue.slice(P.idx + 1, P.idx + 4).map(i => BYID[i]).filter(Boolean);
    npEl.innerHTML = `<div class="sheet-h"><button class="iconbtn" data-act="npclose" aria-label="Close">${I.down}</button>
        <div class="eyebrow">${P.ctx ? esc(P.ctx) : "Now playing"}</div><button class="iconbtn" data-act="trackmenu" data-id="${t.id}" aria-label="More">${I.more}</button></div>
      <div class="np">${cover(t.vol, "bigart")}
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="min-width:0"><div class="tt">${esc(R(t.title))}</div>
          <div class="vv">${esc(R(t.vol.title))} · chapter ${t.n} · <span lang="he" dir="rtl">${esc(t.vol.heb)}</span></div>
          <div class="vv" style="color:var(--gold-2)">Section ${P.part + 1} of ${nSections(t)}${t.sectionTitles[P.part] ? ` · ${esc(R(t.sectionTitles[P.part]))}` : ""}</div></div>
          <button class="iconbtn ${liked ? "on" : ""}" id="npLike" data-act="like" data-id="${t.id}" aria-label="Like">${liked ? I.heartOn : I.heart}</button></div>
        <div><input type="range" class="seek" id="seek" min="0" step="1" aria-label="Seek"><div class="times"><span id="tCur">0:00</span><span id="tLeft">–</span></div></div>
        <div class="ctrls"><button class="sm" data-act="prev" aria-label="Previous">${I.prev}</button>
          <button class="skip" data-act="b15" aria-label="Back 15 seconds">${I.back15}</button>
          <button class="play" data-act="toggle" id="npPlay" aria-label="Play or pause">${audio.paused ? I.play : I.pause}</button>
          <button class="skip" data-act="f30" aria-label="Forward 30 seconds">${I.fwd30}</button>
          <button class="sm" data-act="next" aria-label="Next">${I.next}</button></div>
        ${listenSeg(t, P.lang)}
        <div class="np-tools"><button class="pill" data-act="speed" id="speedPill">${state.speed}×</button>
          <button class="pill ${P.sleepAt || P.sleepEnd ? "on" : ""}" data-act="sleep" id="sleepPill">${I.moon}${P.sleepEnd ? "End of chapter" : P.sleepAt ? "Sleep" : "Sleep timer"}</button>
          <button class="pill" data-act="addto" data-id="${t.id}">${I.plus}Playlist</button>
          <button class="pill" data-act="readnp" data-id="${t.id}">${I.read}Read</button></div>
        ${upnext.length ? `<div><div class="eyebrow" style="margin-bottom:4px">Up next</div><div class="list">${upnext.map(u => trackRow(u, { openChapter: false })).join("")}</div></div>`
          : `<p class="note">When this ends, Pearls keeps going with a recommendation.</p>`}
      </div>`;
    const sk = $("#seek", npEl);
    sk.oninput = () => { sk._drag = true; $("#tCur").textContent = fmt(+sk.value); };
    sk.onchange = () => { audio.currentTime = +sk.value; sk._drag = false; };
  } else {
    const pb = $("#npPlay", npEl); if (pb) pb.innerHTML = audio.paused ? I.play : I.pause;
  }
  updateProgress();
}

/* ---------- dialogs ---------- */
function dialog(html, onMount) {
  const s = document.createElement("div"); s.className = "scrim"; s.innerHTML = `<div class="dialog" role="dialog">${html}</div>`;
  s.onclick = e => { if (e.target === s) s.remove(); };
  document.body.appendChild(s); onMount && onMount(s, () => s.remove()); return s;
}
function askName(title, initial, cb) {
  dialog(`<h3>${esc(title)}</h3><div class="field"><label for="plName">Name</label><input id="plName" maxlength="60" value="${esc(initial || "")}" placeholder="Friday commute"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn line" data-x>Cancel</button><button class="btn gold" data-ok>Save</button></div>`, (s, close) => {
    const i = $("#plName", s); setTimeout(() => i.focus(), 50);
    const ok = () => { const v = i.value.trim(); if (!v) { i.focus(); return; } close(); cb(v); };
    $("[data-ok]", s).onclick = ok; $("[data-x]", s).onclick = close; i.onkeydown = e => { if (e.key === "Enter") ok(); };
  });
}
function newPlaylist(withTrack) {
  askName("New playlist", "", name => {
    const pl = { id: "u" + Date.now().toString(36), name, tracks: withTrack ? [withTrack] : [], created: Date.now() };
    state.mine.unshift(pl); save.mine(); toast(withTrack ? `Added to “${name}”` : `Created “${name}”`); render();
  });
}
function addTo(id) {
  const t = BYID[id];
  dialog(`<h3>Add to playlist</h3><p class="note" style="margin:0">${esc(R(t.title))}</p>
    <button class="opt" data-new>${'<span class="iconbtn">' + I.plus + "</span>"}<b>New playlist</b></button>
    ${state.mine.map(pl => `<button class="opt" data-pl="${pl.id}"><span style="width:44px">${plArt(pl).replace(/<div class="badge">.*?<\/div>/, "")}</span>
      <span style="flex:1;min-width:0"><b>${esc(pl.name)}</b><br><span class="dur">${pl.tracks.length} chapters${pl.tracks.includes(id) ? " · already added" : ""}</span></span></button>`).join("")}`, (s, close) => {
    $("[data-new]", s).onclick = () => { close(); newPlaylist(id); };
    s.querySelectorAll("[data-pl]").forEach(b => b.onclick = () => {
      const pl = state.mine.find(p => p.id === b.dataset.pl); if (!pl.tracks.includes(id)) pl.tracks.push(id); save.mine(); close(); toast(`Added to “${pl.name}”`);
    });
  });
}
function trackMenu(id) {
  const t = BYID[id], liked = state.likes.has(id);
  dialog(`<h3>${esc(R(t.title))}</h3><p class="note" style="margin:0">${esc(R(t.vol.title))} · chapter ${t.n}</p>
    <button class="opt" data-a="playnext">${I.queue}<b>Play next</b></button>
    <button class="opt" data-a="add">${I.plus}<b>Add to playlist</b></button>
    <button class="opt" data-a="like">${liked ? I.heartOn : I.heart}<b>${liked ? "Remove from liked" : "Like"}</b></button>
    <button class="opt" data-a="read">${I.read}<b>Read in English</b></button>
    <button class="opt" data-a="radio">${I.shuffle}<b>Start a mix from this chapter</b></button>
    ${(state.plays[id] || {}).done ? `<button class="opt" data-a="unheard">${I.x}<b>Mark as not heard</b></button>` : ""}`, (s, close) => {
    s.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      close(); const a = b.dataset.a;
      if (a === "playnext") { if (!cur()) playQueue([id], 0); else { P.queue.splice(P.idx + 1, 0, id); toast("Plays next"); syncNP(true); } }
      if (a === "add") addTo(id);
      if (a === "like") like(id);
      if (a === "read") { closeNP(); go(`ch-${id}`); }
      if (a === "radio") { playQueue([id, ...similar(t, 9).map(r => r.t.id)], 0, `Mix from ${t.title}`); toast("Mix started"); }
      if (a === "unheard") { state.plays[id].done = false; state.plays[id].pos = 0; save.plays(); render(); }
    });
  });
}
function spellingDialog() {
  const att = LEX.filter(e => e.st === "a").length, der = LEX.length - att;
  dialog(`<h3>Spelling of Hebrew words</h3>
    <p class="note" style="margin:0">Changes how Hebrew terms are spelled in titles and in the English text. The audio is unaffected.</p>
    ${Object.entries(SCHEMES).map(([k, s]) => `<button class="opt" data-s="${k}" aria-pressed="${k === scheme}">
      <span class="radio ${k === scheme ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>${s.name}</b><br><span class="note">${esc(s.sub)}</span></span></button>`).join("")}
    <p class="foot" style="margin:0">S&amp;P house rules re-spell ${LEX.length} recurring terms: ${att} exactly as the Keter Shem Tob house rules spell them, ${der} derived by the same rules. Words outside the list keep the published spelling. Names of books and rabbis are left alone, as in the house rules.</p>`, (s, close) => {
    s.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
      setScheme(b.dataset.s); close(); renderMini(); render();
      toast(`Spelling: ${SCHEMES[scheme].name}`);
    });
  });
}
function like(id) {
  state.likes.has(id) ? state.likes.delete(id) : state.likes.add(id); save.likes();
  toast(state.likes.has(id) ? "Liked · your recommendations will lean this way" : "Removed from liked");
  document.querySelectorAll(`[data-act="like"][data-id="${id}"]`).forEach(b => { const on = state.likes.has(id); b.classList.toggle("on", on); b.innerHTML = on ? I.heartOn : I.heart; });
}
let toastT;
function toast(msg) { document.querySelectorAll(".toast").forEach(t => t.remove()); const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }

/* ---------- actions ---------- */
const IN_APP = /; wv\)/.test(navigator.userAgent);   // Android WebView shell
document.addEventListener("click", e => {
  const ext = e.target.closest('a[href^="http"]');
  if (ext && IN_APP) { e.preventDefault(); location.href = ext.href; return; }   // the shell hands this to the browser
  const g = e.target.closest("[data-go]"); if (g) { go(g.dataset.go); return; }
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act, id = b.dataset.id;
  switch (a) {
    case "play": {
      if (cur() && cur().id === id) { toggle(); break; }
      const row = b.closest(".list"); const ids = row ? [...row.querySelectorAll(".trk[data-id]")].map(el => el.dataset.id) : [id];
      playQueue(ids, Math.max(0, ids.indexOf(id))); break; }
    case "playch": { const t = BYID[id]; const ids = TRACKS.filter(x => x.vol === t.vol).map(x => x.id); playQueue(ids, ids.indexOf(id), t.vol.title); break; }
    case "chapter": go(`ch-${id}`); break;
    case "vol": go(`vol-${id}`); break;
    case "playlist": go(`pl-${id}`); break;
    case "playvol": { const ids = TRACKS.filter(t => t.vol.book === id).map(t => t.id); playQueue(ids, +b.dataset.start || 0, VOLS.find(v => v.book === id).title); break; }
    case "savevol": { const v = VOLS.find(x => x.book === id); state.mine.unshift({ id: "u" + Date.now().toString(36), name: v.title, tracks: TRACKS.filter(t => t.vol === v).map(t => t.id), created: Date.now() }); save.mine(); toast(`Saved “${v.title}” to your playlists`); break; }
    case "playrecs": playQueue(recommend(10).map(r => r.t.id), 0, "Recommended for you"); break;
    case "playpl": { const pl = findPlaylist(id); playQueue(pl.tracks, 0, pl.name); break; }
    case "shufflepl": { const pl = findPlaylist(id); const ids = [...pl.tracks]; for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } playQueue(ids, 0, pl.name); break; }
    case "copypl": { const pl = findPlaylist(id); state.mine.unshift({ id: "u" + Date.now().toString(36), name: pl.name, tracks: [...pl.tracks], created: Date.now() }); save.mine(); toast(`Saved a copy of “${pl.name}”`); break; }
    case "newpl": newPlaylist(); break;
    case "renamepl": { const pl = findPlaylist(id); askName("Rename playlist", pl.name, n => { pl.name = n; save.mine(); render(); }); break; }
    case "delpl": { const pl = findPlaylist(id);
      dialog(`<h3>Delete “${esc(pl.name)}”?</h3><p class="note" style="margin:0">The chapters stay in the library; only this list goes.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn line" data-x>Keep it</button><button class="btn gold" data-ok>Delete</button></div>`, (s, close) => {
        $("[data-x]", s).onclick = close; $("[data-ok]", s).onclick = () => { state.mine = state.mine.filter(p => p.id !== id); save.mine(); close(); toast("Playlist deleted"); go("library"); }; }); break; }
    case "mv": { const pl = findPlaylist(id), i = +b.dataset.i, j = i + +b.dataset.d; [pl.tracks[i], pl.tracks[j]] = [pl.tracks[j], pl.tracks[i]]; save.mine(); render(); break; }
    case "rm": { const pl = findPlaylist(id); const [gone] = pl.tracks.splice(+b.dataset.i, 1); save.mine(); render(); toast(`Removed “${BYID[gone].title}”`); break; }
    case "addhere": { const pl = findPlaylist(b.dataset.pl); pl.tracks.push(id); save.mine(); render(); toast("Added"); break; }
    case "addto": addTo(id); break;
    case "trackmenu": trackMenu(id); break;
    case "spelling": settingsDialog(); break;
    case "setread": { state.prefs.read = b.dataset.v; state.prefs.readSet = true; save.prefs();
      document.querySelectorAll('[data-act="setread"]').forEach(x => { const on = x.dataset.v === state.prefs.read; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
      const r = $("#reader"); if (r && BYID[id]) applyReadLang(BYID[id], r); break; }
    case "setlisten": { audioLang = b.dataset.v; store.set("audioLang", audioLang);
      document.querySelectorAll('[data-act="setlisten"]').forEach(x => { const on = x.dataset.v === audioLang; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
      const pl = document.querySelector('[data-act="playch"] .plang'); if (pl && BYID[id]) pl.textContent = ` · ${wantsEnglish(BYID[id]) ? "English" : "Hebrew"}`;
      if (cur() && cur().id === id) { load(!audio.paused); renderMini(); }
      toast(audioLang === "en" ? "English audio" : "Hebrew audio"); break; }
    case "readlang": { const order = ["en", "he", "both"]; state.prefs.read = order[(order.indexOf(state.prefs.read || "en") + 1) % 3]; save.prefs();
      b.textContent = "Read · " + READ_LABEL[state.prefs.read]; const r = $("#reader"); if (r && BYID[id || (location.hash.match(/ch-(\d\d-\d\d)/) || [])[1]]) applyReadLang(BYID[id || location.hash.match(/ch-(\d\d-\d\d)/)[1]], r);
      toast(state.prefs.read === "he" ? "Reading in Hebrew" : state.prefs.read === "both" ? "English with the Hebrew under each section" : "Reading in English"); break; }
    case "savesec": { const on = toggleSave(BYID[id], +b.dataset.sec); b.classList.toggle("on", on); b.innerHTML = `${on ? I.bookOn : I.book}<span>${on ? "Saved" : "Save"}</span>`; break; }
    case "sharesec": shareSection(BYID[id], +b.dataset.sec); break;
    case "plan": planDialog(); break;
    case "recyes": REC.setChoice("on"); REC.backfill(Object.entries(state.days).filter(([k, d]) => d.min >= 5 || d.ch.length).map(([k]) => new Date(k + "T12:00:00").getTime())); render(); break;
    case "recno": case "recoff": REC.setChoice("off"); render(); break;
    case "recsince": REC.setShowSince(!REC.state().showSince); render(); break;
    case "exportlog": copyText(JSON.stringify(studyLog(), null, 1)); break;
    case "opensaved": { const s = state.saved[+b.dataset.i]; go(`ch-${s.ch}`); setTimeout(() => { const el = document.getElementById(`sec-${s.sec}`); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 700); break; }
    case "notesaved": { const s = state.saved[+b.dataset.i];
      dialog(`<h3>Note</h3><p class="note" style="margin:0">${esc(R(s.title))}</p><div class="field"><label for="noteTxt">Your note</label><textarea id="noteTxt" class="ta" rows="4">${esc(s.note)}</textarea></div>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn line" data-del>Remove</button><button class="btn gold" data-ok>Save</button></div>`, (d, close) => {
        $("[data-ok]", d).onclick = () => { s.note = $("#noteTxt", d).value.trim(); save.saved(); close(); render(); };
        $("[data-del]", d).onclick = () => { state.saved.splice(+b.dataset.i, 1); save.saved(); close(); render(); }; }); break; }
    case "hebsec": { const sec = b.closest("section"), slot = sec.querySelector(".hebslot");
      slot.dataset.user = 1; if (!slot.hidden) { slot.hidden = true; break; }
      slot.hidden = false; slot.innerHTML = `<div class="loading"><div class="spin"></div>טוען…</div>`;
      hebrewFor(BYID[id], +b.dataset.sec).then(h => { slot.innerHTML = `<h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}<p class="foot"><a href="${esc(h.link)}" target="_blank" rel="noopener">ph.yhb.org.il ↗</a></p>`; tintHebrew(slot); })
        .catch(() => { slot.innerHTML = `<p class="note" dir="ltr">Couldn't load the Hebrew for this section. You need a connection.</p>`; }); break; }
    case "markdone": { if (state.read[id]) { delete state.read[id]; } else { state.read[id] = Date.now(); logDay(0, id); } save.read(); render(); toast(state.read[id] ? "Marked as done" : "Unmarked"); break; }
    case "audiolang": { audioLang = (cur() ? P.lang : (audioLang === "auto" ? (wantsEnglish(BYID[id] || {}) ? "en" : "he") : audioLang)) === "en" ? "he" : "en"; store.set("audioLang", audioLang); const pos = audio.currentTime; load(!audio.paused);
      document.querySelectorAll('.chhead [data-act="audiolang"]').forEach(c => { if (BYID[c.dataset.id]) c.textContent = "Listen · " + (wantsEnglish(BYID[c.dataset.id]) ? "English" : "Hebrew"); });
      const pb = document.querySelector('[data-act="playch"] .plang'), pid = pb && pb.parentNode.dataset.id; if (pb && BYID[pid]) pb.textContent = ` · ${wantsEnglish(BYID[pid]) ? "English" : "Hebrew"}`;
      toast(audioLang === "en" ? "English reading where available; Hebrew otherwise" : "Hebrew reading"); break; }
    case "like": like(id); break;
    case "toggle": toggle(); break;
    case "closeplayer": {   // stop, hide the bar; "Continue listening" on Home still remembers where you were
      audio.pause();
      const lq = store.get("lastQueue", null); if (lq) { lq.closed = true; store.set("lastQueue", lq); state.lastQueue = lq; }
      P.queue = []; P.idx = -1; P.sleepAt = null; P.sleepEnd = false;
      if ("mediaSession" in navigator) { try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; } catch {} }
      audio.removeAttribute("src"); audio.load();
      closeNP(); renderMini(); refreshPlaying(); break; }
    case "next": next(true); break;
    case "prev": prev(); break;
    case "b15": audio.currentTime = Math.max(0, audio.currentTime - 15); break;
    case "f30": audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + 30); break;
    case "np": openNP(); break;
    case "npclose": history.back(); break;
    case "readnp": closeNP(); history.replaceState(null, "", location.href); go(`ch-${id}`); break;
    case "speed": { const S = [.75, 1, 1.25, 1.5, 1.75, 2]; state.speed = S[(S.indexOf(state.speed) + 1) % S.length]; audio.playbackRate = state.speed; store.set("speed", state.speed); if (P.ctx) { state.speedBy[P.ctx] = state.speed; store.set("speedBy", state.speedBy); } b.textContent = state.speed + "×"; break; }
    case "sleep": {
      dialog(`<h3>Sleep timer</h3>${[10, 20, 30, 45, 60].map(m => `<button class="opt" data-m="${m}">${I.moon}<b>${m} minutes</b></button>`).join("")}
        <button class="opt" data-m="sec">${I.moon}<b>End of this section</b></button><button class="opt" data-m="end">${I.moon}<b>End of this chapter</b></button>${P.sleepAt || P.sleepEnd ? `<button class="opt" data-m="off">${I.x}<b>Turn off</b></button>` : ""}`, (s, close) => {
        s.querySelectorAll("[data-m]").forEach(o => o.onclick = () => { const m = o.dataset.m; P.sleepAt = null; P.sleepEnd = false;
          if (m === "end") P.sleepEnd = true; else if (m === "sec") P.sleepSec = true; else if (m !== "off") P.sleepAt = Date.now() + m * 60000; if (m === "off") P.sleepSec = false;
          close(); toast(m === "off" ? "Sleep timer off" : m === "end" ? "Stops after this chapter" : m === "sec" ? "Stops after this section" : `Pauses in ${m} minutes`); syncNP(true); });
      }); break; }
  }
});
document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) go(b.dataset.tab === "home" ? "" : b.dataset.tab); });
backBtn.onclick = () => history.length > 1 ? history.back() : go("");

/* ---------- routing (hash) ---------- */
function go(h) { if (("#" + h) === location.hash || (!h && !location.hash)) render(); else location.hash = h; }
function render() {
  closeNP(); document.querySelectorAll(".scrim").forEach(s => s.remove());
  const h = location.hash.slice(1);
  if (h.startsWith("vol-")) vVol(h.slice(4));
  else if (h.startsWith("ch-")) vChapter(h.slice(3));
  else if (h.startsWith("pl-")) vPlaylist(h.slice(3));
  else if (h === "books") vBooks();
  else if (h === "library") vLibrary();
  else if (h === "progress") vProgress();
  else if (h === "search") vSearch();
  else if (h === "credits") vCredits();
  else vHome();
  window.scrollTo(0, 0); refreshPlaying();
}
window.addEventListener("hashchange", render);
window.addEventListener("popstate", () => { if (npEl && !(history.state && history.state.np)) closeNP(); });
setInterval(() => { if (P.sleepAt) updateProgress(); }, 1000);

/* restore the last queue (paused) so the mini player is ready */
if (state.lastQueue && state.lastQueue.ids && state.lastQueue.ids.length && !state.lastQueue.closed) {
  P.queue = state.lastQueue.ids.filter(id => BYID[id]); P.idx = Math.min(state.lastQueue.idx || 0, P.queue.length - 1); P.ctx = state.lastQueue.ctx;
  if (cur()) { const p = state.plays[cur().id] || {}; P.part = !p.done && p.part != null ? Math.min(p.part, nSections(cur()) - 1) : 0;
    P.lang = wantsEnglish(cur()) ? "en" : "he"; audio.src = partUrl(cur(), P.part, P.lang);
    if (p.pos && !p.done) audio.addEventListener("loadedmetadata", () => { audio.currentTime = p.pos; }, { once: true }); mediaSession(cur()); }
}
applyPrefs();
renderMini();
render();
window.PEARLS = { recommend, similar, TRACKS, VOLS, PRESETS, state, R, cleanHTML, setScheme, renderHebrewChapter, loadBook };   // handy for debugging
})();
