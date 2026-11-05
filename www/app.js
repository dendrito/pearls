/* Pearls — an English home for Peninei Halakha with the original Hebrew audio.
   Plain JS, no build step. Works in the Android WebView shell and in any modern browser. */
(() => {
"use strict";

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("pearls:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("pearls:" + k, JSON.stringify(v)); } catch {} syncTouched(k); }
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
  lists: Object.assign({ review: [], later: [] }, store.get("lists", {})),   // review: [{id, at, due, step}], later: [{id, part, pos, at}]
  prefs: Object.assign({ size: 1, hc: false, tint: false, read: "en", meldar: "https://meldar.pages.dev/?ref={ref}" }, store.get("prefs", {})),
  speedBy: store.get("speedBy", {}),
  where: store.get("where", null)         // {id, sec, at}: the section you were reading last
};
const save = {
  plays: () => store.set("plays", Object.fromEntries(Object.entries(state.plays).map(([k, v]) => { const o = { ...v }; delete o._t; return [k, o]; }))), likes: () => store.set("likes", [...state.likes]),
  skips: () => store.set("skips", state.skips), mine: () => store.set("mine", state.mine),
  interests: () => store.set("interests", state.interests), measured: () => store.set("measured", state.measured),
  read: () => store.set("read", state.read), days: () => store.set("days", state.days), saved: () => store.set("saved", state.saved),
  plan: () => store.set("plan", state.plan), prefs: () => store.set("prefs", state.prefs), lists: () => store.set("lists", state.lists)
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
  source: { name: "Original", sub: "Peninei Halakha's own spelling, as published: Ḥametz, Kiddush, Shabbat" },
  house:  { name: "Neo-Classic S&P", sub: "The London Spanish & Portuguese spelling of de Sola and Gaster, with ḥ and ḳ added: Ḥaméts, Ḳiddúsh, Shabbath" }
};
let scheme = store.get("scheme", "source"); if (!SCHEMES[scheme]) scheme = "source";
// "Use English words where the book does": Neo-Classic S&P only, off by default. Shabbath -> Sabbath, Pesaḥ -> Passover,
// Succóth -> Tabernacles, as the London S&P books print them (the `en` column of translit.js).
let enWords = store.get("enWords", false) === true;
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
  "Hilkhot Shabbat", "Hilkhot [A-Z][\\p{L}’'-]+", "Masekhet [A-Z][\\p{L}’'-]+", "Tractate [A-Z][\\p{L}’'-]+",
  "Ashkenaz(?:im|i)?"].join("|"), "gu");   // named exceptions keep their usual spelling: Ashkenaz, never "Ascenaz"
const rcache = new Map();
function R(text) {
  if (!text || scheme === "source" || !LEXRE) return text;
  const k = scheme + (enWords ? "+en" : "") + "\u0001" + text; if (rcache.has(k)) return rcache.get(k);
  // House rule: names of works and citations keep their catalogue spelling, so they can be looked up.
  const str = String(text), keep = [];
  for (const m of str.matchAll(WORKS)) keep.push([m.index, m.index + m[0].length]);
  const inKept = i => keep.some(([s, e]) => i >= s && i < e);
  const out = str.replace(LEXRE, (m, off, whole) => {
    if (inKept(off)) return m;
    if (/^\s+\d+[ab]\b/.test(whole.slice(off + m.length, off + m.length + 8))) return m;   // tractate + folio: Berakhot 26b
    const e = LEXMAP.get(m.toLowerCase()); if (!e || !e[scheme]) return m;
    return caseLike(m, scheme === "house" && enWords && e.en ? e.en : e[scheme]);
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
function setEnWords(on) { enWords = !!on; store.set("enWords", enWords); rcache.clear(); for (const k in textCache) delete textCache[k]; }
const enWordsOpt = () => `<button class="opt" data-enwords aria-pressed="${enWords}"><span class="radio ${enWords ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>Use English words where the book does</b><br><span class="note">With Neo-Classic S&amp;P: Sabbath, Passover and Tabernacles, as the London Spanish &amp; Portuguese prayer books print them, instead of Shabbath, Pesaḥ and Succóth.</span></span></button>`;


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
/* skins: Classic is app.css itself; the rest re-set its tokens in skins.css. `light` is the skin's own (designed) mode;
   modes.css holds each skin's counterpart palette, switched on by body[data-alt] when Appearance asks for the other mode. */
const SKINS = [
  { id: "classic", name: "Classic", bg: "#0b0f1a", acc: "#e2b65c", alt: "#f6f3ec" },
  { id: "pearl", name: "Pearl Minimal", bg: "#f5f5f2", acc: "#ff4f00", light: true, alt: "#0b0b0c" },
  { id: "sand", name: "Sand", bg: "#efe9dd", acc: "#c2410c", light: true, alt: "#15120e" },
  { id: "ice", name: "Ice", bg: "#eef2f6", acc: "#2b59ff", light: true, alt: "#0b1018" },
  { id: "night", name: "Night Gold", bg: "#0a0a0a", acc: "#e2b65c", alt: "#f7f5f0" },
  { id: "mint", name: "Terminal Mint", bg: "#0b1210", acc: "#3ddc97", alt: "#eef6f2" },
  { id: "illuminated", name: "Illuminated", note: "vellum, lapis and vermilion, like a manuscript", bg: "#f3ead6", acc: "#1f3a93", light: true, alt: "#1a140d" },
  { id: "tekhelet", name: "Tekhelet", note: "deep sea blue with threads of light", bg: "#04121f", acc: "#3fa9ff", alt: "#eef5fb" },
  { id: "brutal", name: "Brutal", note: "paper, black ink, hard shadows, acid yellow", bg: "#f4f1ea", acc: "#e6ff00", light: true, alt: "#111111" },
  { id: "parchment", name: "Parchment", note: "warm paper and a book typeface; reading first", bg: "#f6f0e4", acc: "#b0622a", light: true, alt: "#17130e" },
  { id: "studio", name: "Studio", note: "dark and audio-first, lime accent", bg: "#0e0e10", acc: "#c6f36b", alt: "#f4f4f2" },
  { id: "daf", name: "Daf", note: "a printed page: black ink, Garamond, Hebrew and English side by side", bg: "#fbfaf7", acc: "#1d1b18", light: true, alt: "#121110" },
  { id: "clear", name: "Clear", note: "black and white, very large type and buttons", bg: "#ffffff", acc: "#ffd400", light: true, alt: "#000000" },
  { id: "nacre", name: "Nacre", note: "warm ink and bone, a pearl's sheen on what's playing", bg: "#12110F", acc: "#E9E4EC", alt: "#F6F1E7" },
  { id: "folio", name: "Folio", note: "paper, black type and one vermilion; square and editorial", bg: "#F7F4EE", acc: "#C2311A", light: true, alt: "#111111" },
  { id: "sunlit", name: "Sunlit", note: "warm cream and terracotta, rounded and friendly", bg: "#FFF6E9", acc: "#C8461F", light: true, alt: "#1A1512" },
  { id: "ner", name: "Ner", note: "Jerusalem stone, olive and candle gold, with arches", bg: "#E8DDC8", acc: "#3D4A2C", light: true, alt: "#1C1A15" },
  { id: "azulejo", name: "Azulejo", note: "cobalt and ochre tiles on white, flat", bg: "#F7F5EF", acc: "#1F4FA0", light: true, alt: "#0E1A30" },
  { id: "cutpaper", name: "Cut Paper", note: "layered paper arches: sand, terracotta and slate", bg: "#EFE4CF", acc: "#A84A34", light: true, alt: "#1C1A17" },
  { id: "riso", name: "Riso", note: "two spot colours, pink and teal, printed flat", bg: "#F6F2EA", acc: "#D02F67", light: true, alt: "#141414" },
  { id: "boneink", name: "Bone & Ink", note: "the logo's two colours only, thin rules", bg: "#EFE7D8", acc: "#12110F", light: true, alt: "#12110F" },
  { id: "mizrah", name: "Mizraḥ Arches", note: "olive and saffron arch windows", bg: "#F4EEDC", acc: "#4F5B2E", light: true, alt: "#171A12" },
  { id: "thread", name: "Thread", note: "tzitzit strings and tallit stripes in blue", bg: "#F3F6F9", acc: "#2B5D8C", light: true, alt: "#0B1826" }
];
/* the word for the device the app runs on: the Apple and Windows apps say what they are (PEARLS_SHELL, set by apple/ and windows/) */
const SHELL_WORD = { ipad: "iPad", mac: "Mac", windows: "PC" }[window.PEARLS_SHELL] || "phone";
const MODES = [["design", "As designed"], ["light", "Light"], ["dark", "Dark"], ["auto", "Match " + SHELL_WORD]];
/* 2.3: the three Pearl Minimal entries became one skin with modes */
if (state.prefs.skin === "pearl-dark") { state.prefs.skin = "pearl"; state.prefs.mode = state.prefs.mode || "dark"; save.prefs(); }
if (state.prefs.skin === "pearl-auto") { state.prefs.skin = "pearl"; state.prefs.mode = state.prefs.mode || "auto"; save.prefs(); }
const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function wantLight(sk) {   // the effective mode: the skin's own unless Appearance says otherwise
  const m = state.prefs.mode || "design";
  if (m === "light") return true;
  if (m === "dark") return false;
  if (m === "auto") return !(darkMQ && darkMQ.matches);
  return !!sk.light;
}
function applySkin() {
  const id = state.prefs.hc ? "classic" : (state.prefs.skin || "classic"), sk = SKINS.find(x => x.id === id) || SKINS[0];
  const light = state.prefs.hc ? false : wantLight(sk), alt = light !== !!sk.light;
  if (sk.id === "classic") delete document.body.dataset.skin; else document.body.dataset.skin = sk.id;
  if (alt) document.body.dataset.alt = light ? "light" : "dark"; else delete document.body.dataset.alt;
  document.body.classList.toggle("light", light);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(document.body).getPropertyValue("--ink").trim() || (alt ? sk.alt : sk.bg);
  const bar = (m && /^#[0-9a-f]{6}$/i.test(m.content)) ? m.content : (alt ? sk.alt : sk.bg);   // Android: status and navigation bars follow the skin
  if (window.PearlsNative && window.PearlsNative.setBars) try { window.PearlsNative.setBars(bar, light); } catch {}
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", () => { if (state.prefs.mode === "auto") applySkin(); });
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
/* the calendar (calendar.js): festivals and fasts with their chapters; an event is "in its study window" from `lead`
   days before (30 for the festivals) until it ends. It drives the "On the calendar" shelf, #calendar and recommend(). */
const CAL = (window.PH_CAL ? (() => { try { return window.PH_CAL.upcoming(); } catch { return []; } })() : [])
  .map(o => ({ ...o, ids: [...new Set(o.ids)].filter(id => BYID[id]) })).filter(o => o.ids.length);
const CAL_NOW = CAL.filter(o => o.inWindow);
const calWhen = o => window.PH_CAL.when(o);
const CAL_TRACK = {};   // chapter id -> the soonest event in its study window that lists it
for (const o of CAL_NOW) for (const id of o.ids) if (!CAL_TRACK[id]) CAL_TRACK[id] = o;
const calPl = o => ({ id: "cal-" + o.id, kind: "auto", cal: o, name: o.name, tracks: o.ids,
  blurb: `${o.hd} ${o.hm} · ${o.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${calWhen(o)}.${o.note ? " " + o.note : ""}${o.extra.length ? " " + o.extra.join(". ") + "." : ""}` });

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
    const ce = CAL_TRACK[t.id];
    if (ce) { s += .75 + (ce.start <= 7 ? .25 : 0); reasons.unshift(["season", `${ce.name} ${calWhen(ce)}`]); }
    else if (!CAL_NOW.length && t.tags.some(g => SEASON.tags.includes(g))) { s += .55; reasons.push(["season", `In season · ${SEASON.label}`]); }
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
  if (CAL_NOW.length) out.push(calPl(CAL_NOW[0]));
  else if (seasonIds.length) out.push({ id: "season-mix", kind: "auto", name: SEASON.label, blurb: `What the calendar is pointing at${HEB ? ` · ${HEB.day} ${HEB.month}` : ""}.`, tracks: seasonIds });
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
function findPlaylist(id) { if (id === "review" || id === "later" || id === "liked") return listPl(id); return state.mine.find(p => p.id === id) || PRESETS.find(p => p.id === id) || (id.startsWith("cal-") && CAL.map(calPl).find(p => p.id === id)) || madeForYou().find(p => p.id === id); }
/* "On the calendar": what's in its study window, then what's next */
function calCard(o) {
  const done = o.ids.filter(isDone).length, now = o.inWindow;
  return `<button class="calcard ${now ? "now" : ""}" data-act="playlist" data-id="cal-${o.id}">
    <span class="cd"><b>${o.hd}</b><i>${esc(o.hm)}</i></span>
    <span class="ct"><em>${now && o.start > 0 ? "Study now · " : ""}${esc(calWhen(o))}</em><b>${esc(R(o.name))}</b>
      <span>${o.ids.length} chapter${o.ids.length > 1 ? "s" : ""}${mins(plDur(o.ids)) ? ` · ${mins(plDur(o.ids))}` : ""}${done ? ` · ${done} read` : ""}</span></span></button>`;
}
function calShelf() {
  if (!CAL.length) return "";
  const list = CAL_NOW.concat(CAL.filter(o => !o.inWindow).slice(0, Math.max(2, 5 - CAL_NOW.length)));
  return `<section><div class="sec-h"><h2>On the calendar</h2><button class="more" data-go="calendar">The year</button></div>
    <div class="shelf">${list.map(calCard).join("")}</div></section>`;
}
function vCalendar() {
  setTop("Calendar"); setTab("");
  const byMonth = [];
  for (const o of CAL) { const k = `${o.hm} ${o.hy}`; let g = byMonth.find(x => x.k === k); if (!g) byMonth.push(g = { k, list: [] }); g.list.push(o); }
  view.innerHTML = `<div class="view">
    <div><div class="eyebrow">${HEB ? `${HEB.day} ${esc(HEB.month)} ${esc(HEB.year)}` : "The calendar"}</div>
      <h1 class="hello">Learn the laws <em>before</em> the day.</h1>
      <p class="sub">"We ask and expound the laws of Pesach thirty days before Pesach" (Pesachim 6a; Shulchan Arukh, Orach Chayim 429:1). Pearls starts recommending each festival's chapters 30 days ahead, a week ahead for fast days, and a few days ahead for Rosh Ḥodesh and the smaller days. Dates follow the calendar in Israel; outside Israel, Pesaḥ, Shavu'ot and Sukkot have a second festival day (Laws of the Festivals, chapter 9). A Hebrew date begins at nightfall the evening before.</p></div>
    ${byMonth.map(g => `<section><div class="sec-h"><h2>${esc(g.k)}</h2></div><div class="list">${g.list.map(o => {
      const done = o.ids.filter(isDone).length;
      return `<button class="calrow ${o.inWindow ? "now" : ""}" data-act="playlist" data-id="cal-${o.id}">
        <span class="cd"><b>${o.hd}</b><i>${esc(o.hm)}</i></span>
        <span class="ct"><b>${esc(R(o.name))}</b><span lang="he" dir="rtl" class="hn">${esc(o.he)}</span>
          <span class="m">${esc(o.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }))} · ${esc(calWhen(o))}${o.inWindow && o.start > 0 ? " · study now" : ""}</span>
          <span class="m">${o.ids.length} chapter${o.ids.length > 1 ? "s" : ""}${done ? ` · ${done} read` : ""}${o.extra.length ? ` · ${esc(o.extra.join("; "))}` : ""}</span></span></button>`; }).join("")}</div></section>`).join("")}
  </div>`;
}
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
/* One language for reading and listening (state.prefs.read: en, he or both; "both" listens in English).
   English plays Har Bracha's English recording where there is one, and the AI voice where there isn't. */
const langPref = () => state.prefs.read || "en";
const wantsEnglish = t => hasEn(t) && (!hasHe(t) || langPref() !== "he");
const aiVoiceOn = () => state.prefs.aiVoice !== false && (canSpeak() || (typeof neuralReady === "function" && neuralReady()));
function listenLang(t) {
  const en = langPref() !== "he" || !hasHe(t);
  if (en && hasEn(t)) return "en";
  if (en && enText(t) && aiVoiceOn()) return "tts";
  return hasHe(t) ? "he" : hasEn(t) ? "en" : "tts";
}
const playable = t => !!t && (hasHe(t) || hasEn(t) || (enText(t) && aiVoiceOn()));
const LANG_NAME = { en: "English", he: "Hebrew", tts: "English · AI voice" };
/* ---------- AI voice: the device reads the English aloud ----------
   Har Bracha recorded English for some chapters only. Every other chapter with English text (the official
   translation or an AI translation) is read by the device's own speech engine (speechSynthesis), section by section,
   in the voice chosen in Settings → Voice. It plays through the same player as a recording: Speaker below has the
   parts of an <audio> element the player uses, and `audio` hands each call to whichever of the two is playing.
   Labelled "AI voice" everywhere, like the AI translations. Nothing leaves the device. */
const canSpeak = () => typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance === "function";
const enText = t => !!t && (!t.vol.he || !!t.translated);   // the chapter has English to read
function voices() { return canSpeak() ? speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang)) : []; }
/* the speech engines don't say which voices are male, so by name: Apple's, Microsoft's and Google's English male voices */
const MALE_VOICE = /\b(male|Daniel|Alex|Fred|Arthur|Aaron|Gordon|Oliver|Rishi|Tom|Evan|Nathan|Reed|Rocko|Eddy|Grandpa|Ralph|Albert|Junior|Jamie|Lee|Malcolm|David|Mark|George|Guy|Ryan|Christopher|Eric|Roger|Steffan|Brian|Andrew|William|Thomas|Liam|Connor|Mitchell|Prabhat|Ravi)\b/i;
function pickVoice() {
  const vs = voices(); if (!vs.length) return null;
  const want = state.prefs.voice;
  const en = v => /en-(US|GB)/i.test(v.lang), good = v => /premium|enhanced|siri/i.test(v.name), male = v => MALE_VOICE.test(v.name);
  /* nothing chosen: a male English voice if this device has one (Pearls' default voices are male), the best first */
  return vs.find(v => v.voiceURI === want) || vs.find(v => good(v) && en(v) && male(v)) || vs.find(v => v.localService && en(v) && male(v))
    || vs.find(v => en(v) && male(v)) || vs.find(v => good(v) && en(v))
    || vs.find(v => v.localService && en(v)) || vs.find(v => v.default) || vs[0];
}
function voiceLabel(v) { return v ? `${v.name.replace(/\s*\(.*\)$/, "")} · ${v.lang.replace("_", "-")}` : "Device voice"; }
if (canSpeak()) { try { speechSynthesis.getVoices(); speechSynthesis.addEventListener("voiceschanged", () => { if (typeof refreshVoiceUI === "function") refreshVoiceUI(); }); } catch {} }
/* the words to say for one section: title, then each paragraph; footnotes, citations in brackets and Hebrew script left out */
function speechParas(html, title) {
  const d = document.createElement("div"); d.innerHTML = html || "";
  const hr = d.querySelector("hr"); if (hr) { let n = hr; while (n) { const x = n.nextSibling; n.remove(); n = x; } }
  d.querySelectorAll("sup,script,style,.footnotes,.fn").forEach(e => e.remove());
  const say = s => (s || "").normalize("NFD").replace(/ḥ|ḥ/g, "kh").replace(/Ḥ|Ḥ/g, "Kh")
    .replace(/\([^()]*\d[^()]*\)/g, "").replace(/\[[^\]]*\]/g, "").replace(/[֐-׿]+/g, "")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  const out = [];
  if (title) out.push({ p: -1, s: say(String(title).replace(/^\d+\.\s*/, "")) });
  const blocks = d.querySelectorAll("p, li, h2, h3, h4");
  (blocks.length ? [...blocks] : [d]).forEach((b, i) => { const s = say(b.textContent); if (s) out.push({ p: i, s }); });
  return out.filter(x => x.s);
}
function speechChunks(paras) {   // short utterances: some engines stop a long one after ~15 seconds
  const out = [];
  for (const { p, s } of paras) {
    const parts = s.match(/[^.!?;:]+[.!?;:]*["”’)]*\s*/g) || [s];
    let buf = "";
    for (const x of parts) { if ((buf + x).length > 220 && buf) { out.push({ p, s: buf.trim() }); buf = ""; } buf += x; }
    if (buf.trim()) out.push({ p, s: buf.trim() });
  }
  return out;
}
const WPS = 2.6;   // words a second at 1×, to estimate a duration (speech engines report none)
const Speaker = (() => {
  const L = {}, emit = ty => (L[ty] || []).slice().forEach(f => { try { f({ type: ty }); } catch (e) { console.error(e); } });
  let fast = 0, src = "", chunks = [], secs = [], total = 0, i = 0, paused = true, rate = 1, ready = false, want = false, utt = null, began = 0, timer = null, job = 0;
  const startOf = k => secs.slice(0, k).reduce((a, b) => a + b, 0);
  function stopSpeech() { utt = null; try { speechSynthesis.cancel(); } catch {} }
  function speak() {
    stopSpeech();
    if (i >= chunks.length) { paused = true; clearInterval(timer); emit("ended"); return; }
    const u = new SpeechSynthesisUtterance(chunks[i].s), v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = Math.max(0.5, Math.min(2, rate));
    /* an engine with no voice "finishes" every sentence at once: two of those in a row is a failure, not speech */
    const done = () => { if (Date.now() - began < 150 && secs[i] > 1) { if (++fast >= 2) { paused = true; clearInterval(timer); stopSpeech(); emit("error"); return; } } else fast = 0; i++; speak(); };
    u.onend = () => { if (utt !== u || paused) return; done(); };
    u.onerror = e => { if (utt !== u || paused) return; if (e.error === "interrupted" || e.error === "canceled") return; done(); };
    utt = u; began = Date.now(); paintSpoken();
    speechSynthesis.speak(u);
  }
  function paintSpoken() { if (typeof paintSpokenPara === "function") paintSpokenPara(chunks[i] ? chunks[i].p : null); }
  async function load(v) {
    const my = ++job; src = v; ready = false; chunks = []; secs = []; total = 0; i = 0;
    const [, id, part] = v.split(":"), t = BYID[id];
    try {
      const d = await fetchSections(t), k = +part;
      const sec = Array.isArray(d) ? d[k] && { html: d[k].content.rendered, title: d[k].title.rendered } : d.sections[k] && { html: d.sections[k].body_en, title: d.sections[k].title_en };
      if (my !== job) return;
      if (!sec || !sec.html) throw new Error("no text");
      chunks = speechChunks(speechParas(sec.html, sec.title));
      if (!chunks.length) throw new Error("no text");
    } catch (e) { if (my === job) emit("error"); return; }
    secs = chunks.map(c => c.s.split(/\s+/).length / WPS); total = secs.reduce((a, b) => a + b, 0);
    ready = true; emit("loadedmetadata");
    if (want) { want = false; play(); }
  }
  function play() {
    if (!canSpeak()) return Promise.reject(new Error("no speech"));
    if (!ready) { want = true; return Promise.resolve(); }
    if (!paused) return Promise.resolve();
    paused = false; fast = 0; speak(); clearInterval(timer); timer = setInterval(() => emit("timeupdate"), 500); emit("play");
    return Promise.resolve();
  }
  function pause() { want = false; if (paused) return; paused = true; clearInterval(timer); stopSpeech(); emit("pause"); }
  return {
    addEventListener(ty, f) { (L[ty] || (L[ty] = [])).push(f); },
    removeEventListener(ty, f) { if (L[ty]) L[ty] = L[ty].filter(x => x !== f); },
    get src() { return src; }, set src(v) { pause(); load(String(v)); },
    get paused() { return paused; },
    get duration() { return ready ? total / rate : NaN; },
    get currentTime() { if (!ready) return 0; const into = paused || !utt ? 0 : Math.min(secs[i] || 0, (Date.now() - began) / 1000 * rate); return (startOf(i) + into) / rate; },
    set currentTime(s) { if (!ready) return; let x = Math.max(0, s * rate), k = 0; while (k < chunks.length - 1 && x >= secs[k]) { x -= secs[k]; k++; } i = k; if (!paused) speak(); else { paintSpoken(); emit("timeupdate"); } },
    get playbackRate() { return rate; }, set playbackRate(r) { if (r === rate) return; const at = this.currentTime; rate = r; if (!paused) { this.currentTime = at; } },
    play, pause,
    stop() { want = false; job++; const was = !paused; paused = true; clearInterval(timer); stopSpeech(); src = ""; ready = false; if (typeof paintSpokenPara === "function") paintSpokenPara(null); return was; },
  };
})();
/* ---------- the natural voices, made on this device (Estante's engine: its workers) ----------
   Kokoro ("Natural", ~370 MB once, the most natural, says the guttural ḥ) and Piper ("Light", ~93 MB, any device,
   more robotic). Both run here; nothing is sent anywhere. Downloaded only when you ask, on Wi-Fi unless you say
   otherwise, and removable. voice.js and the workers are Estante's files, shipped unmodified: upgrade them by copying
   Estante's, never by editing them here. Pearls talks to the workers itself (NE below), for two reasons found on an
   iPad: the full Kokoro model can run the iPad's WebGPU out of memory, so NE steps down (full model on the GPU → the
   half-precision model on the GPU → the full model on the processor) and remembers what worked; and each piece is
   played as a WAV through an <audio> element, like the recordings, rather than through Web Audio, which an iPad
   could leave silent. Neural has the parts of an <audio> element the player uses, like Speaker. */
const VX = () => window.Voice || null;
const vlog = (...a) => { if (window.PEARLS_LOG) try { window.PEARLS_LOG("voice:", ...a); } catch {} };   // Xcode's console in the Apple app
/* device | natural | piper. Nothing chosen: the natural voice once it is on the device (Curió: the iPad's Premium
   voices do not beat Kokoro), else the device's own voice */
const engineChoice = () => { if (state.prefs.voiceEngine) return state.prefs.voiceEngine; try { return naturalHas() ? "natural" : "device"; } catch { return "device"; } };
/* Kokoro's speakers, male first; George is the default (Curió: default voices are male). The first four of KOKORO_CORE
   come with the model; the others are a small file each (about 0.5 MB), downloaded only when the reader asks for one. */
const KOKORO_VOICES = { bm_george: "George · UK", bm_lewis: "Lewis · UK", am_michael: "Michael · US", am_fenrir: "Fenrir · US",
  bf_emma: "Emma · UK", af_heart: "Heart · US", af_bella: "Bella · US", af_nicole: "Nicole · US" };
const KOKORO_CORE = ["bm_george", "bf_emma", "am_michael", "af_heart"], KOKORO_DEFAULT = "bm_george";
/* taken off the list: Daniel (bm_daniel) and Adam (am_adam), which Curió found poor, and (Curió, 5 Nov: only the best voices)
   Fable, Puck, Isabella and Lily, the weakest by Kokoro's own grades. The app deletes their files itself. */
/* Piper's English voices (rhasspy/piper-voices), each its own download, nothing in bulk. Curió (5 Nov): only the best
   voices, and only those whose rights are clear, so the list is the four public-domain audiobook readers; Norman is the
   default (male). Ryan and Hi-Fi (non-commercial) and Northern English Male are off the list: a copy already downloaded
   stays listed, marked, until it is removed. Licences, from each MODEL_CARD:
   Ryan CC BY-NC-SA 4.0 (RyanSpeech), Northern English Male CC BY-SA 4.0 (OpenSLR 83), Hi-Fi Male and Female CC BY-NC-SA 4.0
   (NICT's Hi-Fi-CAPTAIN corpus), LJSpeech, Cori, Norman and John public domain (Norman and John: LibriVox audiobooks).
   Left out: Lessac (its recordings are licensed for research only) and Alan (all rights reserved). Male first; Ryan is the
   default. Medium quality: Piper runs here on one processor core (ONNX Runtime Web without threads), where an iPad made
   the "high" voices at 0.7× real time (Ryan high: 17.8 s of speech in 24.5 s), so reading stalled; the medium ones keep
   up about five times over. Voices already downloaded under an earlier list (Lessac medium, the high ones) stay listed,
   marked, and keep working until they are removed. */
const PIPER_VOICES = {
  "en_US-norman-medium": { name: "Norman", note: "US · an audiobook reader", mb: 63 },
  "en_US-john-medium": { name: "John", note: "US · an audiobook reader", mb: 63 },
  "en_US-ljspeech-medium": { name: "LJSpeech", note: "US · an audiobook reader", mb: 64 },
  "en_GB-cori-medium": { name: "Cori", note: "UK · an audiobook reader", mb: 64 },
};
const PIPER_OLD = "en_US-lessac-medium", PIPER_DEFAULT = "en_US-norman-medium";
for (const [v, n, note] of [["en_US-ryan-medium", "Ryan", "US"], ["en_US-hfc_male-medium", "Hi-Fi Male", "US"],
  ["en_US-hfc_female-medium", "Hi-Fi Female", "US"], ["en_GB-northern_english_male-medium", "Northern English Male", "UK"]])
  PIPER_VOICES[v] = { name: n, note: `${note} · no longer offered`, mb: 63, old: true };
PIPER_VOICES[PIPER_OLD] = { name: "Lessac", note: "US · the earlier default", mb: 63, old: true };
for (const [v, n] of [["en_US-ryan-high", "Ryan"], ["en_US-ljspeech-high", "LJSpeech"], ["en_GB-cori-high", "Cori"]])
  PIPER_VOICES[v] = { name: `${n}, high quality`, note: "too slow to keep up on most devices", mb: v.includes("ryan") ? 121 : 114, old: true };
/* which voices are on this device: kept between launches (so Read aloud knows before anything answers) and checked again
   against the device store (web) or the app (Apple app) */
const VHAVE = (() => {
  const K = "pearls.voicesHave";
  let have = (() => { try { return new Set(JSON.parse(localStorage.getItem(K)) || []); } catch { return new Set(); } })();
  const keep = () => { try { localStorage.setItem(K, JSON.stringify([...have])); } catch {} };
  const set = (id, on) => { if (on) have.add(id); else have.delete(id); keep(); };
  return { has: id => have.has(id), set };
})();
const kokoroHas = v => KOKORO_CORE.includes(v) || VHAVE.has("k:" + v);
const kokoroChoice = () => { const v = state.prefs.kokoroVoice; return KOKORO_VOICES[v] && kokoroHas(v) ? v : KOKORO_DEFAULT; };
const piperHas = v => v === PIPER_OLD ? VHAVE.has("p:" + v) || (!!VX() && !VX().needsDownload("piper", "eng")) : VHAVE.has("p:" + v);
const piperListed = () => Object.keys(PIPER_VOICES).filter(v => !PIPER_VOICES[v].old || piperHas(v));
const piperChoice = () => { const v = state.prefs.piperVoice; return PIPER_VOICES[v] && piperHas(v) ? v : piperListed().find(piperHas) || PIPER_DEFAULT; };
async function voiceFilesModule() { return [await import("./voice-store.js"), await import("./voice-files.js")]; }
async function checkVoices() {   // what is really on this device
  try {
    const [store, files] = await voiceFilesModule();
    for (const v of Object.keys(PIPER_VOICES)) { const f = files.piperVoice(v); VHAVE.set("p:" + v, (await store.has(f[0])) && (await store.has(f[1]))); }
    if (NK.on()) { const s = await NK.status(); for (const v of Object.keys(KOKORO_VOICES)) if (!KOKORO_CORE.includes(v)) VHAVE.set("k:" + v, (s.voices || []).includes(v)); }
    else for (const v of Object.keys(KOKORO_VOICES)) if (!KOKORO_CORE.includes(v)) VHAVE.set("k:" + v, await store.has(files.kokoroVoice(v)));
  } catch (e) { vlog("could not check the voices:", e.message); }
}
let neuralFailed = false;   // the natural voice would not start this session: the device voice reads instead
/* In the Apple app the app runs Kokoro itself (apple/Pearls/KokoroNative.swift): no WebKit graphics-memory cap, Core ML
   where it takes the graph. The page only makes the phonemes (pearls-phonemes.js) and plays the WAV the app returns. */
/* a query for the app's own pages: spaces as %20, never "+". URLSearchParams writes a space as "+", which Swift's
   URLComponents keeps as a literal plus: the iPad voices then said "plus" between words, and Kokoro's phonemes lost
   their word breaks (an unknown "+" is dropped), so its words ran together. */
const qs = o => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const NK = (() => {
  const base = "pearls://app/native/kokoro/";
  /* the last status the app gave, kept so the first Read aloud after a launch knows the voice is here
     before the app answers (without it the device voice started and Kokoro took over only later) */
  const KEEP = "pearls.kokoroHas";
  let st = (() => { try { return localStorage.getItem(KEEP) === "1" ? { downloaded: true } : null; } catch { return null; } })();
  let pw = null, seq = 0, on = null;
  const keep = x => { try { localStorage.setItem(KEEP, x && x.downloaded ? "1" : "0"); } catch {} return x; };
  const wait = new Map();
  const isOn = () => { if (on === null) { try { on = !!(window.PearlsNative && JSON.parse(PearlsNative.info()).kokoro); } catch { on = false; } } return on; };
  async function get(p) {
    const r = await fetch(base + p), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `the app answered ${r.status}`);
    return j;
  }
  async function status() { st = keep(await get("status")); return st; }
  function phon(text) {
    if (!pw) {
      pw = new Worker("pearls-phonemes.js", { type: "module" });
      pw.onmessage = ({ data: m }) => { const x = wait.get(m.id); if (!x) return; wait.delete(m.id); m.error ? x.rej(new Error(m.error)) : x.res(m.phonemes); };
      pw.onerror = e => { for (const x of wait.values()) x.rej(new Error(e.message || "the phonemes could not be made")); wait.clear(); pw = null; };
    }
    return new Promise((res, rej) => {
      const id = ++seq;
      const t = setTimeout(() => { if (wait.delete(id)) rej(new Error("eSpeak gave no phonemes in 30 s (pearls-phonemes.js)")); }, 30000);
      wait.set(id, { res: x => { clearTimeout(t); res(x); }, rej: e => { clearTimeout(t); rej(e); } });
      pw.postMessage({ id, text });
    });
  }
  async function download(wifiOnly, onBytes) {
    await get("download?wifi=" + (wifiOnly ? 1 : 0));
    for (;;) {
      await new Promise(r => setTimeout(r, 600));
      const s = await status();
      if (s.progress && onBytes) onBytes({ url: "kokoro", loaded: s.progress.loaded, total: s.progress.total });
      if (!s.downloading) { if (s.error) throw new Error(s.error); if (!s.downloaded) throw new Error("the download stopped"); return s; }
    }
  }
  async function say(phonemes, voice, speed) {
    vlog("phonemes for the app:", phonemes.slice(0, 120));
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 120000);
    let r;
    try { r = await fetch(base + "say?" + qs({ ph: phonemes, v: voice, s: String(speed || 1) }), { signal: ac.signal }); }
    catch (e) { throw new Error(ac.signal.aborted ? "the app made no sound in 2 minutes" : e.message); }
    finally { clearTimeout(t); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `the app answered ${r.status}`); }
    const blob = await r.blob();
    return { blob, dur: Math.max(0, blob.size - 44) / 2 / 24000, genS: +r.headers.get("X-Gen-Seconds") || 0.01 };
  }
  const SIZE_MB = 330;   // model 326 MB, four voices, eSpeak NG
  const voice = (v, wifiOnly) => get("voice?" + new URLSearchParams({ v, wifi: wifiOnly ? 1 : 0 })).then(x => (st = keep(x)));
  const voiceRemove = v => get("voice-remove?" + new URLSearchParams({ v })).then(x => (st = keep(x)));
  return { on: isOn, status, phon, download, say, voice, voiceRemove, SIZE_MB, load: () => get("load"), remove: () => get("remove").then(x => (st = keep(x))),
    get has() { return !!(st && st.downloaded); }, get bytes() { return st ? st.bytes : 0; } };
})();
vlog("app runs Kokoro:", NK.on());
if (NK.on()) NK.status().then(x => {
  vlog("app Kokoro status", x);
  if (typeof refreshEngines === "function") refreshEngines();
  /* if the device voice started reading before the app answered, hand over to the voice you chose */
  if (audio.speaking && !audio.neural && neuralReady()) { vlog("the natural voice is here: switching from the device voice"); reloadVoice(); }
}).catch(() => {});
/* In the Apple app the device's voices come from the app (apple/Pearls/AppleVoice.swift): there the page's own
   speechSynthesis lists only the compact voices, never the Premium and Enhanced ones the reader installed. Each piece
   comes back as a WAV and plays through Neural's two players, like the natural voices, so pause, the lock screen, the
   paragraph highlight and the reading speed work the same. The web and Android keep speechSynthesis (Speaker). */
const AV = (() => {
  const base = "pearls://app/native/apple-voice/", KEEP = "pearls.appleVoices";
  let on = null, list = (() => { try { return JSON.parse(localStorage.getItem(KEEP)) || []; } catch { return []; } })();
  const isOn = () => { if (on === null) { try { on = !!(window.PearlsNative && JSON.parse(PearlsNative.info()).appleVoices); } catch { on = false; } } return on; };
  async function refresh() {
    if (!isOn()) return [];
    try { list = await (await fetch(base + "list")).json(); localStorage.setItem(KEEP, JSON.stringify(list)); } catch {}
    return list;
  }
  async function say(text, id, speed) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 90000);
    let r;
    try { r = await fetch(base + "say?" + qs({ text, id, rate: String(speed || 1) }), { signal: ac.signal }); }
    catch (e) { throw new Error(ac.signal.aborted ? "the device voice made no sound" : e.message); }
    finally { clearTimeout(t); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `the app answered ${r.status}`); }
    const blob = await r.blob(), rate = new DataView(await blob.slice(0, 44).arrayBuffer()).getUint32(24, true) || 22050;
    return { blob, dur: Math.max(0, blob.size - 44) / 2 / rate, genS: +r.headers.get("X-Gen-Seconds") || 0.01 };
  }
  return { on: isOn, refresh, say, get list() { return list; } };
})();
const QUALITY = { premium: "Premium", enhanced: "Enhanced" };
const avName = v => v.name.replace(/\s*\((Premium|Enhanced)\)$/, "");   // the quality is shown apart
/* the voice chosen, else the best one: the app lists them best first and male first, so a Premium voice is picked by
   itself once it is installed, unless the reader chose another */
const appleChoice = () => { const L = AV.list, want = state.prefs.voice; return (L.find(v => v.id === want) || L[0] || {}).id || ""; };
if (AV.on()) {
  const fresh = () => AV.refresh().then(L => {
    vlog("device voices:", L.map(v => `${v.name} (${v.quality}${v.gender ? ", " + v.gender : ""})`).join(", "));
    if (typeof refreshEngines === "function") refreshEngines();
    if (audio.speaking && !audio.neural && neuralReady()) { vlog("the device voices are listed: switching to them"); reloadVoice(); }
  });
  fresh(); document.addEventListener("visibilitychange", () => { if (!document.hidden) fresh(); });   // a voice installed meanwhile
}
const naturalHas = () => NK.on() ? NK.has : !!VX() && !VX().needsDownload("natural", "eng");
const engineHas = id => id === "natural" ? naturalHas() : id === "piper" ? !!VX() && piperHas(piperChoice()) : !!VX() && !VX().needsDownload(id, "eng");
const neuralReady = () => { const V = VX(), e = engineChoice(); if (neuralFailed || !V) return false; return e === "device" ? AV.on() && AV.list.length > 0 : engineHas(e); };
const ENGINE_NAME = { natural: "Natural (Kokoro)", piper: "Light (Piper)" };
function currentVoiceLabel() {
  if (neuralReady() && engineChoice() === "device") { const v = AV.list.find(x => x.id === appleChoice()); return v ? `${avName(v)}${QUALITY[v.quality] ? ` (${QUALITY[v.quality]})` : ""} · ${v.lang}` : "Device voice"; }
  if (neuralReady()) return engineChoice() === "natural" ? `${ENGINE_NAME.natural}, ${KOKORO_VOICES[kokoroChoice()]}` : `${ENGINE_NAME.piper}, ${PIPER_VOICES[piperChoice()].name}`;
  return voiceLabel(pickVoice());
}
function wav(samples, rate) {   // 16-bit mono WAV
  const n = samples.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([b], { type: "audio/wav" });
}
const SILENT = URL.createObjectURL(wav(new Float32Array(2400), 24000));
const RTF_KEY = "pearls.voiceRtf", KDEV_KEY = "pearls.kokoroRun";   // measured speed; how Kokoro last ran here
const rtfs = () => { try { return JSON.parse(localStorage.getItem(RTF_KEY)) || {}; } catch { return {}; } };
const NE = (() => {
  let w = null, kind = "", ready = null, pending = null, seq = 0, cb = null, q = Promise.resolve(), how = "", pvoice = "";
  const wait = new Map();
  function stop() { if (w) w.terminate(); w = null; kind = ""; ready = null; how = ""; for (const x of wait.values()) x.rej(new Error("stopped")); wait.clear(); }
  function boot(k, msg) {
    stop(); kind = k;
    w = new Worker(k === "natural" ? "voice-worker.js" : "piper-worker.js", { type: "module" });
    w.onmessage = ({ data: m }) => {
      if (m.type === "bytes") { if (cb) cb(m); }
      else if (m.type === "ready") { const p = pending; pending = null; if (p) p.res(m); }
      else if (m.id && wait.has(m.id)) { const x = wait.get(m.id); wait.delete(m.id); m.type === "error" ? x.rej(new Error(m.message)) : x.res(m); }
      else if (m.type === "error") { const p = pending; pending = null; if (p) p.rej(new Error(m.message)); }
    };
    w.onerror = e => { const p = pending; pending = null; if (p) p.rej(new Error(e.message || "the voice could not start")); };
    return new Promise((res, rej) => { pending = { res, rej }; w.postMessage(msg); });
  }
  const ask = msg => new Promise((res, rej) => { const id = ++seq; wait.set(id, { res, rej }); w.postMessage({ ...msg, id }); });
  const FP16_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_fp16.onnx";
  const hasFile = async u => { try { return await (await import("./voice-store.js")).has(u); } catch { return false; } };
  const RUNS = [["webgpu", "fp32"], ["webgpu", "fp16"], ["wasm", "fp32"]];
  async function bootKokoro(net) {
    const voices = Object.keys(KOKORO_VOICES).filter(kokoroHas);   // asking for one not on the device would fail the load
    let runs = RUNS.filter(([d]) => d !== "webgpu" || navigator.gpu);
    const saved = localStorage.getItem(KDEV_KEY); if (saved) runs = runs.filter(r => r.join(":") === saved).concat(runs.filter(r => r.join(":") !== saved));
    let last = null;
    for (const [device, dtype] of runs) {
      /* the half-precision model is a second download (~163 MB): only when downloading is allowed now */
      const extra = dtype === "fp16" && !(await hasFile(FP16_URL));
      if (extra) { const ok = VX().mayDownload(163); if (!ok.ok) continue; toast("The full model doesn't fit this graphics chip: fetching the half-size one (about 163 MB, once)…"); }
      try {
        const r = await boot("natural", { type: "load", device, dtype, net: net || extra || device === "wasm" && navigator.onLine, voices });
        how = `${device === "webgpu" ? "graphics chip" : "processor"}${dtype === "fp16" ? ", half precision" : ""}`;
        try { localStorage.setItem(KDEV_KEY, device + ":" + dtype); } catch {}
        return r;
      } catch (e) { last = e; if (/not downloaded/.test(e.message)) throw e; }
    }
    throw last || new Error("no way to run the natural voice here");
  }
  async function bootNative(net, onBytes) {
    if (net) await NK.download(VX() ? VX().wifiOnly() : true, onBytes);
    else if (!(await NK.status()).downloaded) throw new Error("the natural voice is not downloaded on this device");
    const r = await NK.load(); how = r.how || "app"; vlog("app Kokoro loaded:", how); return r;
  }
  const native = k => k === "natural" && NK.on();
  function load(k, { net = false, onBytes, voice } = {}) {
    const pv = k === "piper" ? voice || piperChoice() : "";
    if (ready && kind === k && !net && pv === pvoice) return ready;
    pvoice = pv;
    cb = onBytes || null;
    if (native(k)) { if (w) stop(); kind = k; ready = bootNative(net, onBytes); const mine = ready; ready.catch(() => { if (ready === mine) { ready = null; kind = ""; } }); return ready; }
    ready = k === "piper" ? boot("piper", { type: "load", voice: pv, net }).then(r => { how = "processor"; return r; }) : bootKokoro(net);
    const mine = ready; ready.then(() => vlog(k, "loaded on the", how), e => { vlog(k, "did not load:", e.message); if (ready === mine) { ready = null; kind = ""; } });
    return ready;
  }
  const HEB_WORD = /[A-Za-zḤḥĥĤ'’]*(?:[ḥĥḤĤ]|[Kk]h)[A-Za-zḤḥĥĤ'’]*(?:-[A-Za-zḤḥĥĤ'’]+)*|[A-Za-z]+-[A-Za-zḤḥĥĤ'’]*(?:[ḥĥḤĤ]|kh)[A-Za-zḤḥĥĤ'’]*/g;
  async function phonemes(text, nat) {   // English through eSpeak, Hebrew words sound by sound (as voice.js does)
    const eng = async t => nat ? NK.phon(t) : (await ask({ type: "english", text: t })).phonemes;
    const out = []; let pos = 0;
    for (const m of text.matchAll(HEB_WORD)) {
      if (m.index > pos) out.push(await eng(text.slice(pos, m.index)));
      out.push(VX().hebIpa(m[0])); pos = m.index + m[0].length;
    }
    if (pos < text.length) out.push(await eng(text.slice(pos)));
    return out.map(x => x.trim()).filter(Boolean).join(" ").replace(/\s+([;:,.!?])/g, "$1");
  }
  /* one piece at a time: the worker runs one model */
  function say(k, text, voice, speed) {
    const sp = Math.min(2, Math.max(0.5, +speed || 1));   // made at this speed: stretching a made piece afterwards sounds robotic
    const run = async () => {
      if (k === "device") {
        const a = await AV.say(text, voice || appleChoice(), sp);
        vlog("device voice made", a.dur.toFixed(1) + "s in", a.genS.toFixed(2) + "s,", a.blob.size, "bytes");
        a.speed = sp; return a;
      }
      await load(k, { voice: k === "piper" && PIPER_VOICES[voice] && piperHas(voice) ? voice : undefined });
      const v = KOKORO_VOICES[voice] && kokoroHas(voice) ? voice : kokoroChoice();
      let a;
      if (native(k)) a = await NK.say(await phonemes(text, true), v, sp);
      else {
        a = k === "piper" ? await ask({ type: "say", text, rate: sp }) : await ask({ type: "say", phonemes: await phonemes(text), voice: v, speed: sp });
        a = { blob: wav(a.samples, a.rate), dur: a.samples.length / a.rate, genS: a.genS };
      }
      const r = rtfs(); r[k] = a.dur / Math.max(0.01, a.genS); try { localStorage.setItem(RTF_KEY, JSON.stringify(r)); } catch {}
      vlog(k, "made", a.dur.toFixed(1) + "s in", a.genS.toFixed(2) + "s,", a.blob.size, "bytes");
      a.speed = sp; return a;   // {blob: a WAV, dur: seconds, genS, speed}
    };
    const p = q.then(run, run); q = p.catch(e => vlog(k, "could not say it:", e.message)); return p;
  }
  return { load, say, stop, get kind() { return kind; }, get how() { return how; }, get loaded() { return !!ready; }, get voice() { return pvoice; } };
})();
const lexCache = {};
async function voiceLex(name) {   // the same lexicon voice.js uses, so its pieces read the same
  if (lexCache[name]) return lexCache[name];
  let rows = [];
  try { rows = (await (await fetch(`voice/lexicon-${name}.tsv`)).text()).split("\n").filter(l => l.trim() && !l.startsWith("#") && l.includes("\t")).map(l => l.split("\t").map(x => x.trim())); } catch {}
  const qq = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (lexCache[name] = rows.flatMap(([a, b]) => [[a, b], [a[0].toUpperCase() + a.slice(1), b[0].toUpperCase() + b.slice(1)]])
    .map(([a, b]) => [new RegExp(`(?<![\\w-])${qq(a)}(?![\\w-])`, "g"), b]).sort((x, y) => y[0].source.length - x[0].source.length));
}
/* a paragraph in pieces for the natural voices. voice.js's pieces() starts every text with a 40-letter phrase so the
   first sound comes quickly; called per paragraph, that cut the opening sentence of EVERY paragraph mid-phrase, and
   each cut is a new piece: a pause, and the voice starting its intonation over. Here only the first piece of a
   section is short, every later piece is whole sentences, and a sentence is broken (at a comma) only past 400 letters. */
function speechPieces(text, first) {
  const out = []; let cur = "";
  const lim = () => first && !out.length ? 120 : 400;
  for (let s of text.split(/(?<=[.!?…;:])\s+(?=["“‘'A-Z0-9(])/)) {
    if (cur && cur.length + s.length + 1 > lim()) { out.push(cur); cur = ""; }
    while (s.length > lim()) {
      const L = lim(), c = s.lastIndexOf(", ", L), sp = s.lastIndexOf(" ", L), at = c > L / 3 ? c + 1 : sp > L / 3 ? sp : L;
      if (cur) { out.push(cur); cur = ""; }
      out.push(s.slice(0, at).trim()); s = s.slice(at).trim();
    }
    cur = (cur + " " + s).trim();
  }
  if (cur) out.push(cur);
  return out.filter(p => /[\p{L}\p{N}]/u.test(p));
}
/* two players taking turns: while one speaks a piece, the other already holds the next, so it starts the moment the
   first ends (one player loading each piece after "ended" left a small silence at every join) */
const neuralEls = [new Audio(), new Audio()]; neuralEls.forEach(e => { e.preload = "auto"; });
const PARA_GAP = 0.3;   // seconds of quiet after a paragraph, like a reader taking a breath; none inside one
async function padWav(blob, secs) {   // the canonical 44-byte-header WAVs that wav() and the app make, with quiet added at the end
  const b = await blob.arrayBuffer(), v = new DataView(b);
  const add = Math.round(secs * v.getUint32(24, true)) * v.getUint16(22, true) * (v.getUint16(34, true) / 8);
  const out = new Uint8Array(b.byteLength + add); out.set(new Uint8Array(b)); const w = new DataView(out.buffer);
  w.setUint32(4, out.byteLength - 8, true); w.setUint32(40, out.byteLength - 44, true);
  return new Blob([out], { type: "audio/wav" });
}
const Neural = (() => {
  const L = {}, emit = ty => (L[ty] || []).slice().forEach(f => { try { f({ type: ty }); } catch (e) { console.error(e); } });
  let src = "", parts = [], paraOf = [], secs = [], total = 0, idx = 0, paused = true, ready = false, want = false,
    rate = 1, made = 1, job = 0, turn = 0, live = false, timer = null, cache = new Map(), cur = 0, next = null;   // next: {i, r} loaded in the other player
  const el = () => neuralEls[cur], other = () => neuralEls[1 - cur];
  const startOf = k => secs.slice(0, k).reduce((a, b) => a + b, 0);
  const paint = () => { if (typeof paintSpokenPara === "function") paintSpokenPara(paraOf[idx] ?? null); };
  function clear() { for (const p of cache.values()) p.then(r => URL.revokeObjectURL(r.url), () => {}); cache = new Map(); next = null; }
  function gen(i) {
    if (!cache.has(i)) {
      const endsPara = i + 1 < parts.length && paraOf[i + 1] !== paraOf[i];
      const p = NE.say(engineChoice(), parts[i], engineChoice() === "piper" ? piperChoice() : engineChoice() === "device" ? appleChoice() : kokoroChoice(), rate).then(async a => {
        const blob = endsPara ? await padWav(a.blob, PARA_GAP) : a.blob, sp = a.speed || 1;
        return { url: URL.createObjectURL(blob), dur: a.dur + (endsPara ? PARA_GAP : 0), speed: sp };
      });
      p.catch(() => {}); cache.set(i, p);
    }
    return cache.get(i);
  }
  function unlock() { if (!live) for (const e of neuralEls) { e.src = SILENT; e.play().catch(() => {}); } }   // inside the tap, so later pieces may play, from either player
  function ahead(i) {   // make the next two pieces, and load the very next one into the other player
    for (let k = 1; k <= 2 && i + k < parts.length; k++) gen(i + k);
    if (i + 1 >= parts.length) return;
    const my = turn;
    gen(i + 1).then(r => {
      if (my !== turn || idx !== i || paused) return;
      const o = other(); o.pause(); o.src = r.url; o.load(); next = { i: i + 1, r };
    }, () => {});
  }
  function begin(r, my) {   // the current player has piece idx: play it
    secs[idx] = r.dur * r.speed; total = secs.reduce((a, b) => a + b, 0); made = r.speed;
    live = true; el().playbackRate = rate / made;
    const fail = e => { vlog("play() refused:", e.name, e.message); if (my === turn) { Neural.lastError = e.message; paused = true; emit("error"); } };
    /* an interrupted play() (AbortError: the audio session was taken a moment, or the element was reset) is tried once
       more before the voice is given up for the session */
    el().play().catch(e => { if (e.name !== "AbortError" || my !== turn) return fail(e); vlog("play() interrupted: trying again"); setTimeout(() => { if (my === turn && !paused) el().play().catch(fail); }, 250); });
    ahead(idx);
  }
  async function playAt(i) {
    const my = ++turn; idx = i; live = false; next = null; other().pause(); paint(); emit("timeupdate");
    let r; try { r = await gen(i); } catch (e) { if (my === turn) { Neural.lastError = e.message; paused = true; clearInterval(timer); emit("error"); } return; }
    if (my !== turn || paused) return;
    el().src = r.url; begin(r, my);
  }
  function ended(e) {
    if (e.target !== el() || !live || paused) return;
    if (idx + 1 >= parts.length) { live = false; paused = true; clearInterval(timer); emit("ended"); return; }
    if (next && next.i === idx + 1) {   // already loaded in the other player: start it now, no gap
      const r = next.r, my = ++turn; next = null; cur = 1 - cur; idx++; paint(); emit("timeupdate"); begin(r, my);
    } else playAt(idx + 1);
  }
  for (const e of neuralEls) {
    e.addEventListener("ended", ended);
    e.addEventListener("error", () => { if (e === el() && live) vlog("the player refused a piece:", e.error && e.error.code, e.error && e.error.message); });
  }
  async function load(v) {
    const my = ++job; turn++; clear(); src = v; ready = false; live = false; parts = []; secs = []; total = 0; idx = 0;
    const [, id, part] = v.split(":"), t = BYID[id], V = VX();
    try {
      if (!V) throw new Error("no engine");
      const d = await fetchSections(t), k = +part;
      const sec = Array.isArray(d) ? d[k] && { html: d[k].content.rendered, title: d[k].title.rendered } : d.sections[k] && { html: d.sections[k].body_en, title: d.sections[k].title_en };
      if (!sec || !sec.html) throw new Error("no text");
      const paras = speechParas(sec.html, sec.title);
      const lex = await voiceLex(engineChoice() === "natural" ? "kokoro" : "piper");   // plain English respellings for Piper and the device voices
      if (my !== job) return;
      /* pieces as voice.js makes them (a sentence or two, short at first so the first is ready quickly), each mapped to its paragraph */
      parts = []; paraOf = [];
      for (const x of paras) for (const pc of speechPieces(V.prepare(/[.!?…:;]["”’)]*$/.test(x.s) ? x.s : x.s + ".", "eng", lex), !parts.length)) { parts.push(pc); paraOf.push(x.p); }
      if (!parts.length) throw new Error("no text");
    } catch (e) { if (my === job) { Neural.lastError = e.message; emit("error"); } return; }
    secs = parts.map(pc => pc.split(/\s+/).length / WPS); total = secs.reduce((a, b) => a + b, 0);
    ready = true; emit("loadedmetadata");
    gen(0);
    if (want) { want = false; play(); }
  }
  function play() {
    if (!VX()) return Promise.reject(new Error("no engine"));
    if (!ready) { want = true; unlock(); return Promise.resolve(); }
    if (!paused) return Promise.resolve();
    paused = false;
    if (live && el().src && !el().ended) el().play().catch(() => {}); else { unlock(); playAt(idx); }
    clearInterval(timer); timer = setInterval(() => emit("timeupdate"), 500); emit("play");
    return Promise.resolve();
  }
  function pause() { want = false; if (paused) return; paused = true; clearInterval(timer); el().pause(); emit("pause"); }
  return {
    lastError: "",
    addEventListener(ty, f) { (L[ty] || (L[ty] = [])).push(f); },
    removeEventListener(ty, f) { if (L[ty]) L[ty] = L[ty].filter(x => x !== f); },
    get src() { return src; }, set src(v) { pause(); load(String(v)); },
    get paused() { return paused; },
    get duration() { return ready ? total / rate : NaN; },
    get currentTime() { if (!ready) return 0; return (startOf(idx) + (live ? Math.min(secs[idx] || 0, (el().currentTime || 0) * made) : 0)) / rate; },
    set currentTime(s) { if (!ready) return; let x = Math.max(0, s * rate), k = 0; while (k < parts.length - 1 && x >= secs[k]) { x -= secs[k]; k++; } if (!paused) playAt(k); else { turn++; idx = k; live = false; next = null; for (const e of neuralEls) e.pause(); paint(); emit("timeupdate"); } },
    get playbackRate() { return rate; }, set playbackRate(r) {
      if (r === rate) return; rate = r; el().playbackRate = r / made; next = null;   // only until the next piece, which is made at the new speed
      for (const [k, p] of cache) if (k > idx) { p.then(x => URL.revokeObjectURL(x.url), () => {}); cache.delete(k); }
      if (ready && !paused && live) ahead(idx);
    },
    play, pause,
    stop() { want = false; job++; turn++; const was = !paused; paused = true; clearInterval(timer); for (const e of neuralEls) { e.pause(); e.removeAttribute("src"); } live = false; clear(); src = ""; ready = false; if (typeof paintSpokenPara === "function") paintSpokenPara(null); return was; },
  };
})();
const audioEl = new Audio(); audioEl.preload = "metadata";
/* the player's audio: a recording through audioEl, or the AI voice through Speaker (src "speech:<id>:<section>") */
const audio = (() => {
  const L = {}; let on = audioEl;
  ["timeupdate", "play", "pause", "ended", "error", "loadedmetadata"].forEach(ty => [audioEl, Speaker, Neural].forEach(b => b.addEventListener(ty, e => {
    if (b === on) (L[ty] || []).slice().forEach(f => f.call(a, e)); })));
  const a = {
    addEventListener(ty, f) { (L[ty] || (L[ty] = [])).push(f); },
    removeEventListener(ty, f) { if (L[ty]) L[ty] = L[ty].filter(x => x !== f); },
    get src() { return on.src; },
    set src(v) {
      if (String(v).startsWith("speech:")) {
        const nx = neuralReady() ? Neural : Speaker;
        vlog("reading", v, "with", nx === Neural ? engineChoice() : "the device voice", "(engine", engineChoice() + ", ready", neuralReady() + ", failed", neuralFailed + ")");
        if (on === audioEl) { audioEl.pause(); audioEl.removeAttribute("src"); } else if (on !== nx) on.stop();
        on = nx; nx.src = v;
      }
      else { if (on !== audioEl) on.stop(); on = audioEl; audioEl.src = v; }
    },
    get speaking() { return on !== audioEl; },
    get neural() { return on === Neural; },
    get paused() { return on.paused; },
    get duration() { return on.duration; },
    get currentTime() { return on.currentTime; }, set currentTime(s) { on.currentTime = s; },
    get playbackRate() { return on.playbackRate; }, set playbackRate(r) { audioEl.playbackRate = r; Speaker.playbackRate = r; Neural.playbackRate = r; },
    get preload() { return audioEl.preload; }, set preload(v) { audioEl.preload = v; },
    play() { return on.play(); }, pause() { on.pause(); },
    load() { if (on === audioEl) audioEl.load(); },
    getAttribute(n) { return on === audioEl ? audioEl.getAttribute(n) : (n === "src" ? on.src || null : null); },
    removeAttribute(n) { if (on !== audioEl) on.stop(); audioEl.removeAttribute(n); on = audioEl; },
  };
  return a;
})();
const P = { queue: [], idx: -1, ctx: null, sleepAt: null, sleepEnd: false, part: 0, lang: "he", fails: 0 };
const cur = () => BYID[P.queue[P.idx]];
/* Playback order (Now Playing → the order pill). Smart downloads follow it: they fetch what will actually play next. */
const PLAY_MODES = [
  ["next", "In order", "The queue in order; when it ends, a recommendation", "order"],
  ["book", "Continue the book", "After each chapter, the next one in the book; at the end of a book, the next book", "book"],
  ["shuffle", "Shuffle", "The rest of the queue in random order", "shuffle"],
  ["repeat1", "Repeat chapter", "Hear this chapter again and again", "repeat1"],
  ["repeatAll", "Repeat queue", "Back to the first chapter when the queue ends", "repeat"],
  ["repeatSec", "Repeat section", "Loop the current section, to learn it by heart (chazara)", "repeat1"]
];
const playMode = () => state.prefs.playMode || "book";   // default: through the book, then the next book
function nextInOrder(t) {   // the next chapter with a recording, in book order; after a book's last chapter, the next book
  const ts = TRACKS.filter(x => x.vol === t.vol).sort((a, b) => a.n - b.n);
  for (const x of ts) if (x.n > t.n && playable(x)) return x;
  for (let i = VOLS.indexOf(t.vol) + 1; i < VOLS.length; i++) { const f = TRACKS.filter(x => x.vol === VOLS[i]).sort((a, b) => a.n - b.n).find(playable); if (f) return f; }
  return null;
}
function shuffleRest() {   // keep what's playing; shuffle what comes after it, remembering the order to go back to
  if (P.idx < 0) return; P.unshuffled = P.queue.slice();
  const rest = P.queue.slice(P.idx + 1);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  P.queue = P.queue.slice(0, P.idx + 1).concat(rest);
}
function setPlayMode(m) {
  const was = playMode(); state.prefs.playMode = m; save.prefs();
  if (m === "shuffle" && was !== "shuffle") shuffleRest();
  if (was === "shuffle" && m !== "shuffle" && P.unshuffled) { const id = P.queue[P.idx]; P.queue = P.unshuffled; P.idx = Math.max(0, P.queue.indexOf(id)); P.unshuffled = null; }
  store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx: P.ctx }); syncNP(true); smartSoon(500);
}
/* what plays after the current chapter, in this mode (for smart downloads and "Up next") */
function upcoming(n) {
  const t = cur(); if (!t) return [];
  const m = playMode(), out = [];
  if (m === "repeat1" || m === "repeatSec") return [t.id];
  if (m === "book") { let x = t; while (out.length < n && (x = nextInOrder(x))) out.push(x.id); return out; }
  for (let k = P.idx + 1; out.length < n && k < P.queue.length; k++) out.push(P.queue[k]);
  if (m === "repeatAll") for (let k = 0; out.length < n && k < P.idx; k++) out.push(P.queue[k]);
  return out;
}
function playQueue(ids, start = 0, ctx = null, part = null) {
  const first = ids[start]; ids = ids.filter(id => playable(BYID[id]));
  if (!ids.length) { toast("No recording of this yet. The text is here to read."); return; }
  if (NATIVE && !online()) {                 // offline: only what's on the phone can play
    const have = ids.filter(id => dlState(BYID[id]).s === "done" || (dlState(BYID[id]).s === "loading" && localSrc(BYID[id], 0, DL.idx[id].lang)));
    if (!have.length) { toast("You're offline and these chapters aren't downloaded."); return; }
    if (BYID[first] && !have.includes(first)) { toast(`You're offline and “${R(BYID[first].title)}” isn't downloaded.`); return; }
    if (have.length < ids.length) toast(`Offline: playing the ${have.length} downloaded chapter${have.length > 1 ? "s" : ""}`);
    ids = have;
  }
  start = Math.max(0, ids.indexOf(first)); P.queue = ids; P.idx = Math.max(0, Math.min(start, P.queue.length - 1)); P.ctx = ctx; P.unshuffled = null;
  if (playMode() === "shuffle") shuffleRest();
  if (ctx && state.speedBy[ctx]) state.speed = state.speedBy[ctx];
  store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx }); load(true, true);
  if (part != null && cur() && cur().id === first && part !== P.part) { P.part = Math.max(0, Math.min(part, nSections(cur()) - 1)); load(true); }
}
function load(autoplay, fresh) {
  const t = cur(); if (!t) return;
  const p = state.plays[t.id];
  if (fresh) { P.part = p && !p.done && p.part != null ? Math.min(p.part, nSections(t) - 1) : 0; P.fails = 0; P.fin = null; }
  if (fresh) { const L = state.lists.later.find(x => x.id === t.id); if (L && L.part && (!p || p.done || (p.part || 0) < L.part)) P.part = Math.min(L.part, nSections(t) - 1); }
  P.lang = playLang(t);
  audio.src = srcFor(t, P.part, P.lang); audio.playbackRate = state.speed;
  if (fresh) smartSoon(2500);
  const resumeAt = fresh && p && !p.done && p.part === P.part ? p.pos : 0;
  audio.addEventListener("loadedmetadata", function once() {
    audio.removeEventListener("loadedmetadata", once);
    if (resumeAt > 5 && resumeAt < audio.duration - 5) audio.currentTime = resumeAt;
    audio.playbackRate = state.speed;
  });
  if (autoplay) audio.play().catch(() => {});
  mediaSession(t); renderMini(); refreshPlaying(); syncNP(); pushMedia();
}
function playLang(t) {                        // the language a chapter plays in; offline, whatever was downloaded
  const want = listenLang(t), e = DL.idx[t.id];
  return e && e.lang !== want && !online() && localSrc(t, 0, e.lang) ? e.lang : want;
}
function toggle() { if (!cur()) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
function nextTrack(skipped) {
  const t = cur(); if (t && skipped && audio.currentTime < 60 && P.part === 0) { state.skips[t.id] = (state.skips[t.id] || 0) + 1; save.skips(); }
  const m = playMode();
  if (m === "book" && t) {   // the next chapter of this book comes next, whatever the queue holds
    const nx = nextInOrder(t);
    if (nx) { if (nx.vol !== t.vol) toast(`Next book: ${R(nx.vol.title)}`); if (P.queue[P.idx + 1] !== nx.id) P.queue.splice(P.idx + 1, 0, nx.id); P.idx++; store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx: P.ctx }); load(true, true); return; }
  }
  if (m === "repeatAll" && P.idx >= P.queue.length - 1 && P.queue.length) { P.idx = 0; store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx: P.ctx }); load(true, true); toast("From the top"); return; }
  if (P.idx < P.queue.length - 1) { P.idx++; store.set("lastQueue", { ids: P.queue, idx: P.idx, ctx: P.ctx }); load(true, true); }
  else { // queue ran out: keep going with a recommendation (like radio)
    const r = recommend(1, { exclude: new Set(P.queue) })[0];
    if (r) { P.queue.push(r.t.id); P.idx++; load(true, true); toast(`Up next: ${R(r.t.title)}`); } else audio.pause();
  }
}
function next(skipped) {           // next section, then next chapter
  const t = cur(); if (!t) return;
  if (P.part < nSections(t) - 1) { P.part++; P.fails = 0; load(true); }
  else if (playMode() === "repeat1" && !skipped) { P.part = 0; P.fails = 0; P.fin = null; load(true); }
  else nextTrack(skipped);
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
  if (P.part === nSections(t) - 1 && audio.duration && audio.currentTime / audio.duration > .92 && P.fin !== t.id) {
    P.fin = t.id; if (!p.done) { p.done = true; p.n = (p.n || 0) + 1; } else p.n = (p.n || 0) + 1;
    logDay(0, t.id); studied(t.id); smartSoon(5000); }
  if (++tick % 8 === 0) save.plays();
  if (P.sleepAt && now >= P.sleepAt) { P.sleepAt = null; audio.pause(); toast("Sleep timer: paused"); }
  updateProgress();
});
audio.addEventListener("play", () => { if (cur()) { const p = state.plays[cur().id]; if (p) p._t = Date.now(); } renderMini(); refreshPlaying(); syncNP(); pushMedia(); });
audio.addEventListener("pause", () => { renderMini(); refreshPlaying(); syncNP(); save.plays(); pushMedia(); });
/* Headphones (Android app). The shell calls PEARLS_MEDIA("noisy") when the audio output is about to switch to the
   phone's speaker (Bluetooth earbuds disconnected, wired headphones unplugged), and "play"/"pause"/"next"/"prev" for
   earbud buttons and in-ear detection. Pausing on disconnect is a setting (Settings → Pause when headphones disconnect). */
window.PEARLS_MEDIA = cmd => {
  if (cmd === "noisy") {
    if (state.prefs.unplugPause !== false && !audio.paused) { audio.pause(); toast("Paused: headphones disconnected"); }
  } else if (cmd === "pause") audio.pause();
  else if (cmd === "play") { if (cur()) audio.play().catch(() => {}); }
  else if (cmd === "next") { if (cur()) next(true); }
  else if (cmd === "prev") { if (cur()) prev(); }
};
function pushMedia() {                         // tell Android what's playing, so earbud buttons come to Pearls
  const N = window.PearlsNative; if (!N || typeof N.mediaState !== "function") return;
  const t = cur();
  try { N.mediaState(JSON.stringify(t ? { playing: !audio.paused, title: R(t.title), artist: `Peninei Halakha · ${t.vol.short}`,
    pos: Math.round((audio.currentTime || 0) * 1000), speed: state.speed || 1 } : { playing: false })); } catch {}
}
audio.addEventListener("ended", () => {
  const t = cur(); if (!t) return;
  if (P.sleepEnd && P.part >= nSections(t) - 1) { P.sleepEnd = false; toast("Sleep timer: stopped after the chapter"); return; }
  if (P.sleepSec) { P.sleepSec = false; if (P.part < nSections(t) - 1) { P.part++; load(false); } toast("Sleep timer: stopped after the section"); return; }
  if (playMode() === "repeatSec") { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  next(false);
});
audio.addEventListener("error", () => {
  const t = cur(); if (!t || !audio.getAttribute("src")) return;
  if (DL.dir && audio.src.startsWith(DL.dir)) {   // a downloaded file that won't play: stream it instead
    const n = dlName(t, P.part, P.lang); DL.files.delete(n);
    if (online()) { audio.src = partUrl(t, P.part, P.lang); audio.play().catch(() => {}); return; }
  }
  if (P.lang !== "tts" && !online() && !localSrc(t, P.part, P.lang)) {
    const nx = P.queue.slice(P.idx + 1).findIndex(id => isDownloaded(BYID[id]));
    if (nx >= 0) { P.idx += nx + 1; load(true, true); toast("Offline: skipped to the next downloaded chapter"); }
    else { audio.pause(); toast("You're offline and this chapter isn't downloaded."); }
    return;
  }
  if (P.lang === "en" && enText(t) && aiVoiceOn()) { P.lang = "tts"; audio.src = srcFor(t, P.part, "tts"); audio.play().catch(() => {}); renderMini(); toast("The English recording didn't load: the AI voice is reading this section"); return; }
  if (P.lang === "en") { P.lang = "he"; audio.src = partUrl(t, P.part, "he"); audio.play().catch(() => {}); renderMini(); toast("No English reading for this section — playing the Hebrew"); return; }
  if (P.lang === "tts" && audio.neural && canSpeak()) { neuralFailed = true; const why = Neural.lastError ? ` (${Neural.lastError.slice(0, 120)})` : ""; audio.src = srcFor(t, P.part, "tts"); audio.play().catch(() => {}); renderMini(); toast(`The ${engineChoice() === "natural" ? "natural voice" : engineChoice() === "piper" ? "light voice" : "voice you chose"} couldn't start${why}, so your ${DEVICE}'s basic voice is reading. Settings → Voice to try again.`); return; }
  if (P.lang === "tts") { if (hasHe(t)) { P.lang = "he"; audio.src = srcFor(t, P.part, "he"); audio.play().catch(() => {}); renderMini(); toast("The AI voice couldn't read this section — playing the Hebrew"); return; }
    toast("The AI voice couldn't read this section."); P.fails++; if (P.fails <= 2 && P.part < nSections(t) - 1) { P.part++; load(true); } return; }
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

/* ---------- downloads (Android app): audio for offline listening, smart downloads ----------
   Files are fetched by Android's DownloadManager (PearlsNative, see android/java) into the app's files folder as
   BB-CC-SS-he.mp3 / -en.mp3 and played from there. dl.idx remembers which chapters were downloaded, in which
   language, and whether smart downloads fetched them (those may be deleted automatically; yours never are). */
/* The word for the device in "saved on this phone" (SHELL_WORD, above). */
const DEVICE = SHELL_WORD;
const DESKTOP = window.PEARLS_SHELL === "windows";   // a computer: no mobile data, so no "Wi-Fi only"
const NATIVE = window.PearlsNative || null;   // the Android app's bridge (android/java/.../PearlsBridge.java)
const DL = {
  ok: false, dir: "", free: 0, files: new Map(), active: new Map(), timer: null,
  idx: store.get("dlIdx", {}),                 // chapter id -> { lang, auto, at }
  failed: store.get("dlFailed", {}),           // file name -> time it failed (missing on the server)
  prefs: Object.assign({ wifiOnly: true, smart: true, ahead: 3, autoDelete: true, limitMB: 2048 }, store.get("dlPrefs", {}))
};
const saveDl = () => { store.set("dlIdx", DL.idx); store.set("dlFailed", DL.failed); store.set("dlPrefs", DL.prefs); };
const dlName = (t, i, lang) => `${t.id}-${String(i + 1).padStart(2, "0")}-${lang}.mp3`;
const dlNames = (t, lang) => Array.from({ length: nSections(t) }, (_, i) => dlName(t, i, lang));
const online = () => navigator.onLine !== false;
function dlRefresh() {
  if (!NATIVE) return;
  try {
    const i = JSON.parse(NATIVE.info()); DL.ok = !!i.ok; DL.dir = i.dir || ""; DL.free = i.free || 0;
    const st = JSON.parse(NATIVE.status());
    DL.active = new Map((st.active || []).map(a => [a.name, a]));
    (st.failed || []).forEach(f => { DL.failed[f.name] = Date.now(); });
    if ((st.failed || []).length) saveDl();
    DL.files = new Map(JSON.parse(NATIVE.list()).map(f => [f.n, f.s]));
  } catch {}
}
/* "none" | "loading" | "waiting" (queued for Wi-Fi or a connection) | "done" */
function dlState(t) {
  const e = DL.idx[t.id]; if (!e) return { s: "none" };
  const names = dlNames(t, e.lang); let have = 0, gone = 0, done = 0, total = 0, act = 0, waiting = 0;
  for (const n of names) {
    if (DL.files.has(n)) { have++; continue; }
    const a = DL.active.get(n);
    if (a) { act++; done += a.done || 0; total += a.total > 0 ? a.total : 0; if (a.status !== "running") waiting++; continue; }
    if (DL.failed[n]) gone++;
  }
  if (have && have + gone >= names.length) return { s: "done", lang: e.lang };
  if (act) return { s: waiting === act ? "waiting" : "loading", lang: e.lang, pct: Math.round(100 * (have + (total ? act * done / total : 0)) / names.length) };
  if (have) return { s: "loading", lang: e.lang, pct: Math.round(100 * have / names.length), stalled: true };
  return { s: "none" };
}
const isDownloaded = t => dlState(t).s === "done";
const localSrc = (t, i, lang) => { const n = dlName(t, i, lang); return DL.files.has(n) && DL.dir ? DL.dir + n : null; };
const srcFor = (t, i, lang) => lang === "tts" ? `speech:${t.id}:${i}` : localSrc(t, i, lang) || partUrl(t, i, lang);
function dlBytes(t, lang) {                    // what a chapter will take: Hebrew 64 kbit/s, English ~107 kbit/s
  const e = DL.idx[t.id]; if (e && e.lang === lang) { const s = dlNames(t, lang).reduce((a, n) => a + (DL.files.get(n) || 0), 0); if (s) return s; }
  const d = dur(t); return d ? d * (lang === "en" ? 16000 : 8000) : nSections(t) * 2e6;
}
const dlUsed = () => [...DL.files.values()].reduce((a, b) => a + b, 0);
const fmtMB = b => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;
function dlLang(t) { return wantsEnglish(t) ? "en" : "he"; }
function downloadTrack(t, opts = {}) {
  if (!NATIVE || !DL.ok || !t || !(hasHe(t) || hasEn(t))) return false;
  const lang = opts.lang || dlLang(t), prev = DL.idx[t.id];
  if (prev && prev.lang !== lang) { try { NATIVE.remove(JSON.stringify(dlNames(t, prev.lang))); } catch {} }
  const jobs = dlNames(t, lang).map((name, i) => ({ url: partUrl(t, i, lang), name, title: `${R(t.title)} (${i + 1}/${nSections(t)})` }))
    .filter(j => !DL.files.has(j.name));
  jobs.forEach(j => delete DL.failed[j.name]);
  DL.idx[t.id] = { lang, auto: !!opts.auto && (!prev || prev.auto), at: Date.now() };
  saveDl();
  if (jobs.length) { try { NATIVE.enqueue(JSON.stringify(jobs), !DESKTOP && !!DL.prefs.wifiOnly); } catch {} }
  hebrewPosts(t).catch(() => {});             // keep the Hebrew text too, for reading offline
  dlPoll(); return true;
}
function removeDownload(t) {
  const e = DL.idx[t.id]; if (!e || !NATIVE) return;
  try { NATIVE.remove(JSON.stringify(dlNames(t, e.lang))); } catch {}
  delete DL.idx[t.id]; saveDl(); dlRefresh(); dlPaint();
}
function dlPoll() {                            // while anything is downloading, refresh every 2.5 s
  if (!NATIVE) return;
  clearTimeout(DL.timer);
  dlRefresh(); dlPaint();
  if (DL.active.size) DL.timer = setTimeout(dlPoll, 2500);
}
/* Smart downloads: keep the chapter you're on and the next few in your queue (or the ones you're partway through)
   on the phone, delete what smart downloads fetched once you've heard it, and stay under the storage limit. */
function smartRun() {
  if (!NATIVE || !DL.ok) return;
  dlRefresh();
  const p = DL.prefs, now = cur();
  /* what to keep, most important first:
     1. the chapter playing and what the playback order will play next (repeat keeps this one; shuffle and
        "continue the book" look at their own next chapters; heard chapters count when they'll play again);
     2. chapters you're partway through;
     3. Review chapters due within a day and the top of Study later (two at most). */
  const want = [];
  const take = (t, again) => { if (t && !want.includes(t) && (hasHe(t) || hasEn(t)) && (again || !isDone(t.id))) want.push(t); };
  if (now) take(now, true);
  const again = playMode() === "repeatAll" || playMode() === "repeat1" || playMode() === "repeatSec";
  for (const id of upcoming(p.ahead)) { if (want.length >= p.ahead + 1) break; take(BYID[id], again); }
  Object.entries(state.plays).filter(([id, x]) => BYID[id] && !x.done && (x.part || x.pos > 30)).sort((a, b) => b[1].last - a[1].last)
    .slice(0, 2).forEach(([id]) => { if (want.length < p.ahead + 1) take(BYID[id]); });
  const extra = state.lists.review.filter(r => r.due <= Date.now() + DAY).sort((a, b) => a.due - b.due).map(r => r.id)
    .concat(state.lists.later.map(x => x.id)).map(id => BYID[id]).filter(Boolean).slice(0, 2);
  for (const t of extra) take(t, true);
  if (p.autoDelete) for (const id in DL.idx) {   // smart downloads you've heard go, unless they're about to play again
    const e = DL.idx[id], t = BYID[id];
    if (t && e.auto && isDone(id) && !want.includes(t)) { try { NATIVE.remove(JSON.stringify(dlNames(t, e.lang))); } catch {} delete DL.idx[id]; }
  }
  if (!p.smart || !online()) { saveDl(); dlPaint(); return; }
  const limit = p.limitMB ? p.limitMB * 1e6 : Infinity;
  let used = dlUsed() + [...DL.active.values()].reduce((a, x) => a + Math.max(0, (x.total || 0) - (x.done || 0)), 0);
  for (const t of want) {
    if (DL.idx[t.id]) continue;
    const need = dlBytes(t, dlLang(t));
    if (used + need > limit) {                 // make room: smart downloads you've heard, then the oldest ones not wanted now
      const victims = Object.entries(DL.idx).filter(([id, e]) => e.auto && BYID[id] && !want.includes(BYID[id]))
        .sort((a, b) => (isDone(b[0]) - isDone(a[0])) || (a[1].at - b[1].at));
      const freeable = victims.reduce((a, [id, e]) => a + dlBytes(BYID[id], e.lang), 0);
      if (used - freeable + need > limit) break;   // wouldn't fit even then: delete nothing
      for (const [id, e] of victims) { if (used + need <= limit) break; used -= dlBytes(BYID[id], e.lang);
        try { NATIVE.remove(JSON.stringify(dlNames(BYID[id], e.lang))); } catch {} delete DL.idx[id]; }
      if (used + need > limit) break;
    }
    downloadTrack(t, { auto: true }); used += need;
  }
  saveDl(); dlPaint();
}
let smartT = null;
const smartSoon = (ms = 1500) => { if (!NATIVE) return; clearTimeout(smartT); smartT = setTimeout(smartRun, ms); };
/* buttons and badges that show a chapter's download state; dlPaint() updates them in place */
const DLI = {
  get: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.5 2.5 5-5.2"/></svg>',
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3.5 9a12.5 12.5 0 0 1 17 0M6.5 12.3a8 8 0 0 1 11 0M9.5 15.5a3.6 3.6 0 0 1 5 0"/><circle cx="12" cy="18.6" r="1" fill="currentColor"/></svg>'
};
function dlLabel(t) {
  const st = dlState(t), L = st.lang === "en" ? "English" : "Hebrew";
  if (st.s === "done") return { cls: "on", icon: DLI.done, text: `Downloaded · ${L}` };
  if (st.s === "waiting") return { cls: "wait", icon: DLI.wifi, text: !online() ? "Waiting for a connection" : DL.prefs.wifiOnly && !DESKTOP ? "Waiting for Wi-Fi" : "Queued" };
  if (st.s === "loading") return { cls: "busy", icon: DLI.wait, text: `Downloading ${st.pct || 0}%` };
  return { cls: "", icon: DLI.get, text: "Download" };
}
function dlButton(t) {
  if (!NATIVE || !(hasHe(t) || hasEn(t))) return "";
  const l = dlLabel(t);
  return `<button class="btn line dlbtn ${l.cls}" data-act="dl" data-id="${t.id}" data-dl="${t.id}">${l.icon}<span>${l.text}</span></button>`;
}
function dlBadge(t) {
  if (!NATIVE) return "";
  const st = dlState(t);
  return `<span class="dlb ${st.s}" data-dlb="${t.id}">${st.s === "done" ? DLI.done : st.s === "none" ? "" : DLI.wait}</span>`;
}
function dlPaint() {
  document.querySelectorAll("[data-dl]").forEach(b => { const t = BYID[b.dataset.dl]; if (!t) return; const l = dlLabel(t);
    b.className = `btn line dlbtn ${l.cls}`; b.innerHTML = `${l.icon}<span>${l.text}</span>`; });
  document.querySelectorAll("[data-dlb]").forEach(b => { const t = BYID[b.dataset.dlb]; if (!t) return; const st = dlState(t);
    b.className = `dlb ${st.s}`; b.innerHTML = st.s === "done" ? DLI.done : st.s === "none" ? "" : DLI.wait; });
  const many = document.querySelectorAll("[data-dlmany]"); many.forEach(b => { b.innerHTML = dlManyLabel(b.dataset.ids.split(",")); });
  if (location.hash === "#downloads" && !document.querySelector(".scrim")) { const y = window.scrollY; vDownloads(); window.scrollTo(0, y); }
}
function dlManyLabel(ids) {
  const ts = ids.map(id => BYID[id]).filter(t => t && (hasHe(t) || hasEn(t)));
  const done = ts.filter(isDownloaded).length, busy = ts.filter(t => ["loading", "waiting"].includes(dlState(t).s)).length;
  if (ts.length && done === ts.length) return `${DLI.done}<span>All downloaded</span>`;
  if (busy) return `${DLI.wait}<span>Downloading ${done}/${ts.length}</span>`;
  return `${DLI.get}<span>Download${done ? ` the rest (${ts.length - done})` : " all"}</span>`;
}
function dlManyButton(ids) {
  if (!NATIVE) return "";
  const ok = ids.filter(id => BYID[id] && (hasHe(BYID[id]) || hasEn(BYID[id]))); if (!ok.length) return "";
  return `<button class="btn line dlbtn" data-act="dlmany" data-ids="${ok.join(",")}" data-dlmany>${dlManyLabel(ok)}</button>`;
}
function dlMany(ids) {
  const ts = ids.map(id => BYID[id]).filter(t => t && (hasHe(t) || hasEn(t)) && !isDownloaded(t) && dlState(t).s === "none");
  if (!ts.length) { toast("Already downloaded"); return; }
  const bytes = ts.reduce((a, t) => a + dlBytes(t, dlLang(t)), 0);
  dialog(`<h3>Download ${ts.length} chapter${ts.length > 1 ? "s" : ""}?</h3>
    <p class="note" style="margin:0">About ${fmtMB(bytes)}${DL.free ? `; ${fmtMB(DL.free)} free on this ${DEVICE}` : ""}. Each chapter downloads in the language it plays in (${langPref() === "he" ? "Hebrew" : "English where recorded, otherwise Hebrew"}).
    ${DESKTOP ? "" : DL.prefs.wifiOnly ? "Downloads wait for Wi-Fi; you can change that in Downloads." : "Downloads use mobile data too."}</p>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn line" data-x>Cancel</button><button class="btn gold" data-ok>Download</button></div>`, (s, close) => {
    $("[data-x]", s).onclick = close;
    $("[data-ok]", s).onclick = () => { close(); ts.forEach(t => downloadTrack(t)); toast(`Downloading ${ts.length} chapter${ts.length > 1 ? "s" : ""}`); };
  });
}

/* ---------- icons ---------- */
const I = {
  order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>',
  repeat1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5V10a4 4 0 0 1 4-4h11M16 3l3 3-3 3M20 12.5V14a4 4 0 0 1-4 4H5M8 21l-3-3 3-3"/><path d="M11.2 10.4 12.5 9.6v5" stroke-width="1.6"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5V10a4 4 0 0 1 4-4h11M16 3l3 3-3 3M20 12.5V14a4 4 0 0 1-4 4H5M8 21l-3-3 3-3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12M6 20.5h12M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5"/></svg>',
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
/* ---------- what is translated: official English · AI translation · Hebrew only ---------- */
const KINDS = [
  { id: "official", label: "Official English", tag: "Official", h: "Official English translation",
    desc: "Translated by Yeshivat Har Bracha and published by them." },
  { id: "ai", label: "AI translation", tag: "AI", h: "AI translation",
    desc: "No official English edition yet. Translated from Rabbi Melamed's Hebrew by Claude (Anthropic); not reviewed by Har Bracha or a rabbi." },
  { id: "he", label: "Hebrew only", tag: "Hebrew", h: "Hebrew only",
    desc: "Not translated yet. The text is Rabbi Melamed's Hebrew." } ];
const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));
const kindOf = t => !t.vol.he ? "official" : t.translated ? "ai" : "he";
const volTracks = (v, k) => TRACKS.filter(x => x.vol === v && (!k || kindOf(x) === k));
const volKinds = v => KINDS.map(k => k.id).filter(k => volTracks(v, k).length);
const kindTag = k => `<span class="kindtag k-${k}">${KIND[k].tag}</span>`;
const kindCounts = ts => { const c = { all: ts.length }; for (const t of ts) c[kindOf(t)] = (c[kindOf(t)] || 0) + 1; return c; };
const kindChips = (on, counts, attr = "kind") => `<div class="chips kindchips" role="group" aria-label="Translation">${[["all", "All"]].concat(KINDS.map(k => [k.id, k.label]))
  .filter(([id]) => id === "all" || counts[id]).map(([id, l]) => `<button class="chip ${on === id ? "on" : ""}" data-${attr}="${id}" aria-pressed="${on === id}">${l} <small>${counts[id]}</small></button>`).join("")}</div>`;
function trackRow(t, o = {}) {
  const p = state.plays[t.id] || {}, d = dur(t), pct = !p.done && (p.part || p.pos > 30) ? Math.min(100, ((p.part || 0) + .5) / nSections(t) * 100) : 0;
  const playing = cur() && cur().id === t.id;
  return `<div class="trk ${playing ? "playing" : ""} ${playing && audio.paused ? "paused" : ""}" data-id="${t.id}">
    <button class="trk-play" data-act="play" data-id="${t.id}" aria-label="Play ${esc(R(t.title))}">${art(t)}</button>
    <button class="txt" data-act="${o.openChapter === false ? "play" : "chapter"}" data-id="${t.id}" style="text-align:left">
      <div class="t">${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : ""}${esc(R(t.title))}${dlBadge(t)}</div>
      <div class="m">${o.why ? `<span class="why">${esc(o.why)}</span> · ` : ""}${kindTag(kindOf(t))} ${esc(R(t.vol.short))} · ch. ${t.n}${d ? ` · ${mins(d)}` : ""}${p.done ? " · ✓ heard" : ""}</div>
      ${pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
    </button>
    <div class="end">${o.end || `<button class="iconbtn" style="background:none" data-act="trackmenu" data-id="${t.id}" aria-label="More options">${I.more}</button>`}</div>
  </div>`;
}
function plArt(pl) {
  const vols = [...new Set(pl.tracks.map(id => BYID[id] && BYID[id].vol).filter(Boolean))];
  const four = [0, 1, 2, 3].map(i => vols[i % Math.max(1, vols.length)] || VOLS[i]);
  return `<div class="plart">${four.map((v, i) => `<i style="--c1:${v.c1};background:${i % 3 ? v.c1 : v.c2}" data-g="${v.glyph}"></i>`).join("")}<div class="shade"></div><div class="badge">${esc(pl.name)}</div></div>`;
}
const plCard = pl => `<button class="plcard" data-act="playlist" data-id="${pl.id}">${plArt(pl)}<span>${pl.tracks.length} chapters · ${mins(plDur(pl.tracks)) || "–"}</span></button>`;
const volCard = (v, k) => { if (!KIND[k]) k = null;   // also called as .map(volCard), so k may be an index
  const all = volTracks(v), ts = k ? volTracks(v, k) : all, ks = volKinds(v), heard = ts.filter(t => (state.plays[t.id] || {}).done).length;
  const n = ts.length < all.length ? `${ts.length} of ${all.length} chapters` : `${all.length} chapters`;
  const audible = all.filter(playable), next = audible.find(t => !(state.plays[t.id] || {}).done) || audible[0];
  return `<div class="volwrap"><button class="volcard" data-act="vol" data-id="${v.book}${k && ks.length > 1 ? `-${k}` : ""}">${cover(v)}<div><b style="font-weight:600;font-size:15px">${esc(R(v.title))}</b><div class="meta"><span class="kinds">${(k ? [k] : ks).map(kindTag).join("")}</span>${n}${heard ? ` · ${heard} heard` : ""}</div></div></button>${next ? `<button class="volplay" data-act="playvol" data-id="${v.book}" data-start="${all.indexOf(next)}" aria-label="${heard ? "Continue" : "Play"} ${esc(R(v.title))}">${I.play}</button>` : ""}</div>`; };

/* ---------- views ---------- */
const view = $("#view"), topTitle = $("#topTitle"), backBtn = $("#backBtn"), brand = $("#brand");
function setTop(title) {
  const isRoot = !title; brand.hidden = !isRoot; topTitle.hidden = isRoot; backBtn.hidden = isRoot; topTitle.textContent = title || "";
}
function setTab(name) { document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name)); }

function vHome() {
  setTop(null); setTab("home");
  if (!state.interests) return vOnboard();
  const along = alongCard();
  const recs = recommend(10), hero = recs[0];
  const lq = state.lastQueue && BYID[state.lastQueue.ids[state.lastQueue.idx]];
  const resumeList = Object.entries(state.plays).filter(([id, p]) => BYID[id] && !p.done && (p.part || p.pos > 30)).sort((a, b) => b[1].last - a[1].last).slice(0, 3).map(([id]) => BYID[id]);
  const readHere = state.where && BYID[state.where.id] && !state.read[state.where.id] && state.where.sec > 1 ? BYID[state.where.id] : null;
  const hr = new Date().getHours(), greet = hr < 12 ? "Boker tov" : hr < 18 ? "Good afternoon" : "Erev tov";
  view.innerHTML = `
  <div class="view">
    <div><div class="eyebrow">${HEB ? `<span class="hebdate">${HEB.day} ${esc(HEB.month)} ${esc(HEB.year)}</span> · ` : ""}${esc(CAL_NOW.length ? `${R(CAL_NOW[0].name)} ${calWhen(CAL_NOW[0])}` : SEASON.label)}</div>
      <h1 class="hello">${greet}. <em>One pearl</em> at a time.</h1></div>
    ${offlineCard()}
    ${along}
    ${todayCard()}
    ${hero ? `<section class="hero"><div class="orb"></div>
      <div class="eyebrow" style="position:relative;color:var(--gold-2)">Today's pearl</div>
      <h3>${esc(R(hero.t.title))}</h3>
      <div class="why">${esc(hero.why || `${R(hero.t.vol.title)} · chapter ${hero.t.n}`)} · ${esc(R(hero.t.vol.short))}${dur(hero.t) ? ` · ${mins(dur(hero.t))}` : ""}</div>
      <div class="row">${hasHe(hero.t) || hasEn(hero.t) ? `<button class="btn gold" data-act="play" data-id="${hero.t.id}">${I.play}Listen</button>` : ""}
        <button class="btn ghost" data-act="chapter" data-id="${hero.t.id}">${I.read}${hero.t.vol.he && !hero.t.translated ? "Read the Hebrew" : "Read in English"}</button></div>
      <p class="note herohint">Every recording is a chapter you can read. Tap its name anywhere in Pearls, or <b>Read along</b> in the player to open the section you're hearing.</p></section>` : ""}
    ${calShelf()}
    ${resumeList.length || readHere ? `<section><div class="sec-h"><h2>Pick up where you left off</h2></div>${readHere ? `<button class="panel progresslink" data-act="resumeread" data-id="${readHere.id}" data-sec="${state.where.sec}"><span><span class="eyebrow">Continue reading</span><br><b>${esc(R(readHere.title))}</b><br><span class="note">${esc(R(readHere.vol.short))} ${readHere.n} · section ${state.where.sec}${readHere.sectionTitles[state.where.sec - 1] ? `: ${esc(R(readHere.sectionTitles[state.where.sec - 1]))}` : ""}</span></span><span class="dur">›</span></button>` : ""}<div class="list">${resumeList.map(t => trackRow(t)).join("")}</div></section>` : ""}
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
/* ---------- read along: the text of what's playing is one tap away ---------- */
function alongCard() {
  const t = cur(); if (!t) return "";
  const n = nSections(t), st = t.sectionTitles[P.part];
  return `<section class="panel along"><div class="along-txt"><div class="eyebrow">${audio.paused ? "In the player" : "Listening now"}</div>
      <b>${esc(R(t.title))}</b><span class="note">${esc(R(t.vol.short))} · ch. ${t.n} · section ${P.part + 1} of ${n}${st ? `: ${esc(R(st))}` : ""}</span></div>
    <button class="btn line" data-act="readalong" data-id="${t.id}">${I.read}Read along</button></section>`;
}
function goSection(id, sec) {   // open a chapter and bring section `sec` (1-based) into view once its text has loaded
  const t = BYID[id]; if (!t) return;
  go(`ch-${id}`);
  let n = 0; const seek = () => { const s = $(`#sec-${sec}`); if (s) { s.scrollIntoView({ behavior: "smooth", block: "start" }); s.classList.add("flash"); setTimeout(() => s.classList.remove("flash"), 1600); } else if (n++ < 60) setTimeout(seek, 100); };
  setTimeout(seek, 50);
}
function readAlong() {   // from the player: the chapter playing, at the section playing
  const t = cur(); if (!t) return;
  closeNP(); if (history.state && history.state.np) history.replaceState(null, "", location.href);
  goSection(t.id, P.part + 1);
}
/* in the chapter view, mark the section the player is on; if you were reading the one before, follow it */
let nowSecShown = null;
function paintNowSec() {
  const r = $("#reader"), t = cur();
  const on = r && t && location.hash === `#ch-${t.id}` ? P.part + 1 : null;
  const was = nowSecShown; nowSecShown = on ? `${t.id}:${on}` : null;
  document.querySelectorAll(".reader section.nowsec").forEach(s => { if (!on || s.id !== `sec-${on}`) s.classList.remove("nowsec"); });
  document.querySelectorAll(".toc button.nowsec").forEach(b => { if (!on || b.dataset.sec !== String(on)) b.classList.remove("nowsec"); });
  const bar = $("#nowbar"); if (bar) bar.hidden = !on;
  if (!on) return;
  const s = $(`#sec-${on}`), b = $(`.toc button[data-sec="${on}"]`);
  if (b) b.classList.add("nowsec");
  if (bar) bar.querySelector("[data-n]").textContent = `section ${on}${t.sectionTitles[on - 1] ? `: ${R(t.sectionTitles[on - 1])}` : ""}`;
  if (!s) return;
  if (!s.classList.contains("nowsec")) {
    s.classList.add("nowsec");
    const prev = was && was.startsWith(t.id + ":") ? $(`#sec-${was.split(":")[1]}`) : null;
    if (prev && prev !== s) { const rc = prev.getBoundingClientRect(); if (rc.bottom > 0 && rc.top < innerHeight) s.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }
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
        <li><b>AI voice</b>: where there is no English recording, an AI voice reads the English, labelled "AI voice". It is your ${DEVICE}'s own speech engine, or one of two voices made on your ${DEVICE} that you can download: ${ext("https://huggingface.co/hexgrad/Kokoro-82M", "Kokoro-82M")} (Apache 2.0) through ${ext("https://github.com/hexgrad/kokoro", "kokoro-js")}, and ${ext("https://github.com/rhasspy/piper", "Piper")} (MIT), run with ONNX Runtime Web and eSpeak NG. Each Piper voice carries the licence of the recordings it was trained on (from its ${ext("https://huggingface.co/rhasspy/piper-voices", "model card")}): Norman, John, LJSpeech and Cori, all public domain (LibriVox and LJ Speech recordings). Voices offered before and still on a device keep their own licences: Ryan, CC BY-NC-SA 4.0 (RyanSpeech); Hi-Fi Male and Hi-Fi Female, CC BY-NC-SA 4.0 (Hi-Fi-CAPTAIN, NICT); Northern English Male, CC BY-SA 4.0 (OpenSLR 83). Kokoro's voices are Apache 2.0, like its model. Pearls is free and non-commercial. The engine comes from Estantes, a sister project. No voice is a recording of a Har Bracha reader, and no reader's voice is copied.</li>
      </ul></section>

    <section><div class="sec-h"><h2>Licence</h2></div>
      <p class="reader-p">Har Bracha makes the content of the Peninei Halakha website available under the ${ext("https://creativecommons.org/licenses/by/4.0/", "Creative Commons Attribution 4.0 International licence (CC BY 4.0)")}, with one addition: complete or near-complete copies may not be sold without their written permission. Translation, summaries and other derived works are explicitly allowed, provided the source is credited, linked and any changes are stated. The full terms are on the ${ext("https://ph.yhb.org.il/terms/", "site's terms page")} (in Hebrew).</p>
      <div class="panel"><div class="eyebrow" style="margin-bottom:6px">Changes Pearls makes</div>
        <ul class="credlist">
          <li>Text is reformatted for phone reading, split by section, with links to Sefaria and Meldar.</li>
          <li>The optional "Neo-Classic S&amp;P" spelling changes how some Hebrew terms are transliterated; the default, "Original", keeps the published spelling. <a href="#spelling">All spelling schemes</a>.</li>
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
/* All spelling schemes, compared (#spelling). The same table Meldar shows; source: spelling/spelling-schemes.md in the
   Pearls project. Cells marked * are worked out from that scheme's rules, not seen printed. */
const SCHEME_LIST = [
  ["Original", "In Pearls", "Peninei Halakha's own English edition", "The spelling the book's translators used, mostly Ashkenazi and Israeli. It isn't rule-based and varies from book to book (Chodesh, Ĥodesh and Ḥodesh all appear)."],
  ["Neo-Classic S&P", "In Pearls", "de Sola and Gaster's London Spanish & Portuguese spelling, as Shem Tob Gaguine wrote it", "The traditional S&P spelling, with ḥ, ḳ and ch added so the Hebrew letter behind the English can be read back."],
  ["de Sola–Gaster", "In Meldar", "Book of Prayer of the Spanish & Portuguese Jews' Congregation, London (de Sola 1836, rev. Gaster 1901)", "As printed: h for both ḥet and khaf, k for qof, ng for ayin, ph, th, and stress accents."],
  ["Modern London", "For reference", "The Heshaim siddur, 2011 and 2020", "The modern S&P siddur. It uses English for some words (Sabbath, Passover)."],
  ["S&P London academic", "In Keter Shem Tob", "Scholarly romanization", "ḥ, q, ʿ, kh, and v for vet."],
  ["Modern Sephardi", "In Keter Shem Tob", "The Israeli and Sephardi everyday standard", "ch for ḥet and khaf, k, silent ayin: Chodesh, Kiddush, Shema."],
  ["Amsterdam", "For reference", "Esnoga English", "ch for ḥet and khaf, tz for tsadi, ng for ayin."],
  ["Dutch", "For reference", "Esnoga Dutch (Pereira)", "sj, j, w and oe, as in Dutch."],
];
const LETTER_COLS = ["S&P academic", "Modern London", "Neo-Classic S&P", "de Sola–Gaster"];
const LETTER_ROWS = [
  ["ח", "ḥ", "h", "ḥ", "h (sometimes hh: Rosh Hhódesh)"],
  ["ק", "q", "k", "ḳ", "k"],
  ["כ", "kh", "kh", "ch", "h (Hahám)"],
  ["כּ", "k", "k", "c / k", "c / k"],
  ["פ", "f", "f", "ph", "ph"],
  ["final ת", "t", "t", "th", "th"],
  ["ע", "ʿ", "silent", "ng, ’ at the start", "ng"],
  ["ב (vet)", "v", "v", "b", "b"],
  ["Doubled letters", "yes", "some", "yes", "yes"],
  ["Stress accent", "no", "no", "yes", "yes"],
];
const WORD_COLS = ["Original", "Neo-Classic S&P", "de Sola–Gaster", "Modern London", "S&P academic", "Amsterdam", "Dutch"];
const WORD_ROWS = [
  ["קַדִּישׁ", "Kaddish", "Ḳaddéesh", "Kaddéesh", "Kaddish", "Qaddish", "Kaddish", "Kaddisj"],
  ["חֹדֶשׁ", "Chodesh", "Ḥódesh", "Hhódesh", "Hodesh", "Ḥodesh", "Chodesh", "Chodesj"],
  ["תְּפִלִּין", "tefillin", "Tephilléen", "Tephilléen", "Tefilin", "Tefillin", "Tefillin", "Tefillin"],
  ["שְׁמַע", "Shema", "Shemang", "Shemang", "Shema", "Shemaʿ", "Shemang", "Sjemang"],
  ["בְּרָכָה", "berakha", "Berachá", "Beraháh*", "Berakha", "Berakhah", "Beracha", "Beracha"],
  ["כֹּהֵן", "Kohen", "Cohen", "Cohen", "Cohen", "Kohen", "Cohen", "Cohen"],
];
function vSpelling() {
  setTop("Spelling"); setTab("");
  const table = (cols, rows, first) => `<div class="schemes-scroll"><table class="schemes-t"><thead><tr><th>${first}</th>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(([h, ...r]) => `<tr><th${/[֐-׿]/.test(h) ? ` lang="he" dir="rtl" class="he"` : ""}>${esc(h)}</th>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  view.innerHTML = `<div class="view credits schemes">
    <div><div class="eyebrow">Spelling of Hebrew words</div>
      <h1 class="hello">One word, <em>many spellings</em>.</h1>
      <p class="sub">English books write Hebrew in different ways. Pearls offers two: <b>Original</b>, the spelling Peninei Halakha's translators used, and <b>Neo-Classic S&amp;P</b>. You're reading in <b>${esc(SCHEMES[scheme].name)}</b>. Change it in Settings.</p></div>

    <section><div class="sec-h"><h2>The schemes</h2></div>
      <div class="list">${SCHEME_LIST.map(([n, where, base, line]) => `<div class="panel scheme${SCHEMES[scheme].name === n ? " on" : ""}"><div class="eyebrow">${esc(where)}</div><b>${esc(n)}</b>
        <p class="note" style="margin:4px 0 0">${esc(line)}</p><p class="foot" style="margin:4px 0 0">Based on: ${esc(base)}</p></div>`).join("")}</div></section>

    <section><div class="sec-h"><h2>About Neo-Classic S&amp;P</h2></div>
      <p class="reader-p">Neo-Classic S&amp;P is based on the London Spanish &amp; Portuguese spelling of D. A. de Sola (1836), revised by Moses Gaster (1901) and reissued under Haham Solomon Gaon, as printed in the <i>Book of Prayer of the Spanish &amp; Portuguese Jews' Congregation, London</i>. Shem Tob Gaguine wrote in this spelling himself, and so did the prayer books of his congregation.</p>
      <p class="reader-p">It keeps the book's letters: b for vet (Yom Tob), c before a, o and u and k before e and i (Cohen, Keter), ph (Sepher), ts (Erets), th at the end of a word (Shabbath), ng for ayin (Shemang), acute accents for stress, and doubled letters for dagesh. It also keeps five familiar words exactly as the book prints them: Ḳaddéesh, Tsitséet, Tephilléen, Puréem and Talét.</p>
      <p class="reader-p">It makes three changes, so you can tell which Hebrew letter stands behind the English. The book writes both ḥet and khaf as h, and both qof and hard kaf as k.</p>
      <ul class="credlist">
        <li><b>ch</b> for khaf (Berachá), where the book has h (Hahám).</li>
        <li><b>ḥ</b> for ḥet. The book writes ḥet as h, or sometimes hh (Rosh Hhódesh), so the tradition already felt the need to mark it.</li>
        <li><b>ḳ</b> for qof, borrowed from library catalogue romanization, so that Ḳidush (ק) and Kipur (כּ) no longer start with the same letter.</li>
      </ul>
      <p class="reader-p" style="margin-top:10px">Names of tractates, books and rabbis keep their usual catalogue spelling (<i>Moed Katan</i>, <i>Shulchan Aruch</i>), so a reference can be looked up. A few names are fixed exceptions: Ashkenaz stays Ashkenaz.</p></section>

    <section><div class="sec-h"><h2>Letter by letter</h2></div>
      ${table(LETTER_COLS, LETTER_ROWS, "")}
      <p class="foot">Original has no row here: Peninei Halakha's own spelling isn't rule-based.</p></section>

    <section><div class="sec-h"><h2>The same words, every scheme</h2></div>
      ${table(WORD_COLS, WORD_ROWS, "")}
      <p class="foot">* Worked out from the scheme's rules, not seen printed. Original shows the spelling Peninei Halakha uses most often.</p></section>

    <section><div class="sec-h"><h2>English words</h2></div>
      <p class="reader-p">The London books translate some words instead of spelling them in Hebrew: Sabbath, Passover, Tabernacles. Turn on <b>Use English words where the book does</b> in Settings to read them that way with Neo-Classic S&amp;P. It's off unless you choose it.</p></section>
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
function vBooks(kind) {
  setTop(null); setTab("books");
  if (kind) { state.prefs.booksKind = kind; save.prefs(); }
  const on = KIND[state.prefs.booksKind] ? state.prefs.booksKind : "all";
  const total = TRACKS.reduce((a, t) => a + (dur(t) || 0), 0), counts = kindCounts(TRACKS);
  const shelf = k => { const vs = VOLS.filter(v => volTracks(v, k).length); return `<section class="kindsec" id="books-${k}">
      <div class="sec-h"><h2>${KIND[k].h}</h2><span class="more">${vs.length} book${vs.length > 1 ? "s" : ""} · ${counts[k]} chapters</span></div>
      <p class="note kinddesc">${kindTag(k)} ${KIND[k].desc}</p>
      <div class="volgrid">${vs.map(v => volCard(v, k)).join("")}</div></section>`; };
  view.innerHTML = `<div class="view">
    <div><h1 class="hello">The books</h1><p class="sub">${VOLS.length} volumes · ${TRACKS.length} chapters · ${Math.round(total / 3600)}+ hours of original Hebrew audio</p></div>
    ${kindChips(on, counts)}
    ${(on === "all" ? KINDS.map(k => k.id) : [on]).filter(k => counts[k]).map(shelf).join("")}${aboutFoot()}</div>`;
  view.querySelector(".kindchips").onclick = e => { const b = e.target.closest("[data-kind]"); if (!b) return;
    const k = b.dataset.kind; history.replaceState(null, "", k === "all" ? "#books" : `#books-${k}`); vBooks(k); };
}
function vVol(book, kind) {
  if (!kind && /-/.test(book)) [book, kind] = book.split("-");
  const v = VOLS.find(x => x.book === book); if (!v) return vBooks();
  const ks = volKinds(v), only = ks.length > 1 && KIND[kind] ? kind : "all";
  setTop(v.short); setTab("books");
  const ts = TRACKS.filter(t => t.vol === v), total = ts.reduce((a, t) => a + (dur(t) || 0), 0);
  const heard = ts.filter(t => (state.plays[t.id] || {}).done).length;
  const firstUnheard = ts.find(t => !(state.plays[t.id] || {}).done) || ts[0];
  view.innerHTML = `<div class="view">
    <div class="vhead">${cover(v)}<div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="heb" lang="he" dir="rtl">${esc(v.heb)}</div><h1>${esc(R(v.title))}</h1>
      <div class="stats"><span class="kinds">${ks.map(kindTag).join("")}</span><span>${ts.length} chapters</span>${total ? `<span>${ts.every(dur) ? "" : "≈ "}${(total / 3600).toFixed(1)} h of audio${ts.every(dur) ? "" : "+"}</span>` : ""}${heard ? `<span>${heard}/${ts.length} heard</span>` : ""}</div></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn gold" data-act="playvol" data-id="${v.book}" data-start="${ts.indexOf(firstUnheard)}">${I.play}${heard ? "Continue" : "Play the book"}</button>
      <button class="btn ghost" data-act="savevol" data-id="${v.book}">${I.plus}Save as playlist</button>${dlManyButton(ts.map(t => t.id))}</div>
    ${ks.length > 1 ? kindChips(only, kindCounts(ts), "vkind") : `<p class="note kinddesc" style="margin:0">${kindTag(ks[0])} ${KIND[ks[0]].desc}</p>`}
    <div class="list">${ts.filter(t => only === "all" || kindOf(t) === only).map(t => trackRow(t)).join("")}</div>
    ${v.book === "03" ? `<p class="note">Audio for this volume may not be available; the text is.</p>` : ""}
  </div>`;
  const kc = view.querySelector(".kindchips"); if (kc) kc.onclick = e => { const b = e.target.closest("[data-vkind]"); if (!b) return;
    history.replaceState(null, "", `#vol-${book}${b.dataset.vkind === "all" ? "" : "-" + b.dataset.vkind}`); vVol(book, b.dataset.vkind); };
}
/* In the Apple app the page runs from the pearls:// scheme; text requests go through its proxy (the site's CORS headers are malformed). */
const net = u => window.PEARLS_PROXY ? window.PEARLS_PROXY + encodeURIComponent(u) : u;
const textCache = {};
let bookQueue = Promise.resolve();
function loadBook(id, dir = "books") {   // one <script> at a time: each file calls PH_BOOK_LOAD(data)
  const job = bookQueue.then(() => new Promise((ok, bad) => {
    window.PH_BOOK_LOAD = d => ok(d);
    const s = document.createElement("script"); s.src = `${dir}/${id}.js`; s.onerror = () => { s.remove(); bad(new Error("missing")); };
    s.onload = () => s.remove(); document.head.appendChild(s);
  }));
  bookQueue = job.catch(() => {}); return job;
}
/* Offline text. English: bundled in en/ (official translation, fetched by fetch_en_text.py). Hebrew: fetched once from
   ph.yhb.org.il and kept on the phone by the Android app (PearlsNative), so a chapter read once reads offline. */
function textGet(key) { if (!NATIVE) return null; try { const s = NATIVE.readText(key); return s ? JSON.parse(s) : null; } catch { return null; } }
function textPut(key, v) { if (NATIVE) try { NATIVE.writeText(key, JSON.stringify(v)); } catch {} }
const getJSON = (url, timeout = 25000) => new Promise((ok, bad) => { const x = new XMLHttpRequest(); x.open("GET", net(url)); x.timeout = timeout;
  x.onload = () => { if (x.status !== 200) return bad(new Error("HTTP " + x.status)); try { ok(JSON.parse(x.responseText)); } catch (e) { bad(e); } };
  x.onerror = () => bad(new Error("network")); x.ontimeout = () => bad(new Error("timeout")); x.send(); });
const slugList = t => { const n = Math.max(t.sections || 0, 1); return Array.from({ length: Math.max(n + 2, 30) }, (_, i) => `${t.id}-${String(i + 1).padStart(2, "0")}`); };
const hebPosts = {};
async function hebrewPosts(t, opts = {}) {   // every Hebrew section of a chapter, one request, kept for offline
  if (hebPosts[t.id]) return hebPosts[t.id];
  let posts = textGet(`he-${t.id}.json`);
  if (!posts) {
    if (opts.cachedOnly) return null;
    posts = (await getJSON(`https://ph.yhb.org.il/wp-json/wp/v2/posts?per_page=50&_fields=slug,title,content,link&slug=${slugList(t).join(",")}`))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    if (posts.length) textPut(`he-${t.id}.json`, posts);
  }
  posts.forEach(p => { hebCache[p.slug] = p; });
  return (hebPosts[t.id] = posts);
}
async function fetchSections(t) {
  if (textCache[t.id]) return textCache[t.id];
  if (t.vol.he && t.translated) { const d = await loadBook(t.id); textCache[t.id] = d; return d; }
  if (t.vol.he) {   // Hebrew-only chapter not yet translated: the Hebrew from ph.yhb.org.il
    const posts = await hebrewPosts(t);
    const d = { id: t.id, translated: false, sections: posts.map(p => ({ slug: p.slug, link: p.link, title_he: p.title.rendered, body_he: cleanHeb(p.content.rendered) })) };
    textCache[t.id] = d; return d;
  }
  let posts = null;
  try { posts = await loadBook(t.id, "en"); } catch {}           // bundled with the app
  if (!posts) posts = textGet(`en-${t.id}.json`);                 // fetched earlier
  if (!posts) {
    posts = (await getJSON(`https://ph.yhb.org.il/en/wp-json/wp/v2/posts?per_page=50&_fields=slug,title,content,link&slug=${slugList(t).join(",")}`))
      .sort((a, b) => a.slug.localeCompare(b.slug));
    if (posts.length) textPut(`en-${t.id}.json`, posts);
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
function cleanHTML(html, t) {
  const d = document.createElement("div"); d.innerHTML = html;
  d.querySelectorAll("script,style,iframe,form,img[src^='http:']").forEach(e => e.remove());
  d.querySelectorAll("a[href]").forEach(a => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); });
  d.querySelectorAll("[style]").forEach(e => { if (!/padding-left/.test(e.getAttribute("style"))) e.removeAttribute("style"); });
  if (t) linkCites(d, t);
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
        ${playable(t) ? `<button class="btn gold" data-act="playch" data-id="${t.id}">${I.play}Listen${d ? ` · ${mins(d)}` : ""}<span class="plang"> · ${LANG_NAME[listenLang(t)]}</span></button>` : `<span class="note">No recording of this chapter</span>`}
        <button class="iconbtn ${liked ? "on" : ""}" data-act="like" data-id="${t.id}" aria-label="Like">${liked ? I.heartOn : I.heart}</button>
        <button class="iconbtn" data-act="addto" data-id="${t.id}" aria-label="Add to playlist">${I.plus}</button>
        <button class="btn ${isDone(t.id) ? "ghost" : "line"}" data-act="markdone" data-id="${t.id}">${isDone(t.id) ? "✓ Done" : "Mark as done"}</button>
        ${dlButton(t)}</div>
      ${sefRef(t, null) ? `<div class="meldarrow"><a class="tool" href="https://meldar.pages.dev/?ref=${encodeURIComponent(sefRef(t, null))}" target="_blank" rel="noopener">${I.ext}<span>Open in Meldar</span></a>
        <a class="tool" href="https://meldar.pages.dev/?explain=${encodeURIComponent(sefRef(t, null))}&title=${encodeURIComponent(t.title)}" target="_blank" rel="noopener">${I.ext}<span>Explain it back in Meldar</span></a>
        ${t.vol.book === "19" ? `<a class="tool" href="https://meldar.pages.dev/?view=giyur" target="_blank" rel="noopener">${I.ext}<span>Meldar Giyur track</span></a>` : ""}</div>` : ""}
      ${t.vol.he ? `<div class="aiflag"><b>AI translation</b> This book has no official English edition. ${t.translated ? "The English below is an AI translation of the Hebrew, marked AI throughout." : "This chapter is in Hebrew until its AI translation is added."}</div>` : ""}
      ${langBar(t)}
      <div class="chips"><button class="chip" data-act="spelling" style="height:32px;font-size:13px">Spelling · ${esc(SCHEMES[scheme].name)}</button>${state.where && state.where.id === t.id && state.where.sec > 1 ? `<button class="chip" data-act="jumpsec" data-sec="${state.where.sec}" style="height:32px;font-size:13px">Continue at section ${state.where.sec}</button>` : ""}</div>
    </div>
    <button class="nowbar" id="nowbar" data-act="tonowsec" hidden>${I.play}<span>Playing now · <span data-n></span></span><span class="go">Go there</span></button>
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
    r.innerHTML = posts.map((p, i) => `<section id="sec-${i + 1}"><div class="en-body"><h3>${R(p.title.rendered)}</h3>${cleanHTML(p.content.rendered, t)}</div><div class="hebslot" lang="he" dir="rtl" data-sec="${i + 1}" hidden></div>${secTools(t, i, { hebrew: true })}</section>`).join("") +
      `<p class="foot">Source: <a href="${esc(posts[0].link)}" target="_blank" rel="noopener">${esc(posts[0].link)}</a></p>`;
    citeClicks(r); jumpPending(t);
    applyReadLang(t, r);
    nowSecShown = null; paintNowSec();
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
      const box = document.createElement("div"); box.innerHTML = s.body_en + notesHTML(s.notes_en); linkCites(box, t); respellTree(box);
      return `<section id="sec-${i + 1}"><div class="ai-sec"><h3>${esc(R(s.title_en || ""))} <span class="aitag sm">AI</span></h3>${box.innerHTML}
        <div class="secfoot"><button class="linkbtn" data-heb>Show Hebrew</button><a class="linkbtn" href="${esc(s.link)}" target="_blank" rel="noopener">Hebrew source ↗</a></div></div>${heb}${secTools(t, i)}</section>`;
    }).join("") +
    `<p class="foot">From <i>Peninei Halakha</i> by Rabbi Eliezer Melamed — פניני הלכה, הרב אליעזר מלמד, מכון הר ברכה — licensed CC BY 4.0. ${d.translated ? "Translated into English by AI (changes: translation; footnote markers kept)." : ""}</p>`;
  r.querySelectorAll('.heb-orig').forEach(h => hebDone(h, t));
  citeClicks(r); jumpPending(t);
  if (d.translated) applyReadLang(t, r);
  nowSecShown = null; paintNowSec();
  r.onclick = e => { const b = e.target.closest("[data-heb]"); if (!b) return;
    const he = b.closest("section").querySelector(".heb-orig"); he.dataset.user = 1; he.hidden = !he.hidden; b.textContent = he.hidden ? "Show Hebrew" : "Hide Hebrew";
    if (!he.hidden && !he.innerHTML.trim()) {   // lite build: the Hebrew is fetched on demand
      he.innerHTML = `<p class="note">Loading the Hebrew…</p>`;
      hebrewFor(t, +he.dataset.sec).then(h => { he.innerHTML = `<h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}`; hebDone(he, t); })
        .catch(() => { he.innerHTML = `<p class="note">Couldn't load the Hebrew. It needs a connection.</p>`; });
    } };
}

/* ---------- citation links: SA 345:2, Shabbat 6a, Rambam, Tanakh… open the cited text ----------
   The grammar is Meldar's meldar-cite.js, shipped unmodified (like meldar-record.js); pearls-cite-links.js puts it
   on the page. Links are made before respelling and before Hebrew letter tints, which both rewrite text nodes.
   Chapter HTML is rebuilt as strings, so clicks are handled by delegation (citeClicks), not by per-link listeners. */
const SEF_BOOK = {}; for (const b in SEF) SEF_BOOK[SEF[b].t] = b;
function linkCites(root, t) {
  if (!window.PEARLS_CITE || !root || !t) return;
  try { PEARLS_CITE.linkify(root, { ref: sefRef(t, null) || "" }); } catch (e) { /* a page without links beats no page */ }
}
function hebDone(el, t) { linkCites(el, t); tintHebrew(el); citeClicks(el); }
function citeClicks(root) {
  if (!root || root.dataset.cites) return; root.dataset.cites = 1;
  root.addEventListener("click", e => {
    const a = e.target.closest("a.pc-cite"); if (!a || !root.contains(a)) return;
    e.preventDefault(); e.stopPropagation();
    const ref = a.dataset.ref || "";
    if (a.classList.contains("pc-cite-internal")) return openPHRef(ref);
    citeSheet({ ref, text: a.textContent, resolved: !!ref, why: ref ? "" : a.title, secBy: a.dataset.secby || "", sec: a.dataset.sec || "" });
  });
}
function openPHRef(ref) {   // "Peninei Halakhah, Shabbat 21:8" -> that chapter in Pearls, scrolled to the section
  const m = /^Peninei Halakhah, (.+?) (\d+):(\d+)$/.exec(ref), b = m && SEF_BOOK[m[1]];
  const t = b && BYID[`${b}-${String(+m[2]).padStart(2, "0")}`];
  if (!t) { window.open(sefUrl(ref), "_blank", "noopener"); return; }
  go(`ch-${t.id}`);
  let n = 0; const seek = () => { const s = $(`#sec-${+m[3]}`); if (s) s.scrollIntoView({ behavior: "smooth" }); else if (n++ < 40) setTimeout(seek, 100); };
  setTimeout(seek, 50);
}
function citeSheet(h) {
  const lic = (v, l) => v ? `<div class="pc-lic">${esc(v)} · ${esc(l || "licence not stated by the source")}</div>` : "";
  const sec = h.secBy === "vol" || h.secBy === "chapter"
    ? `<p class="pc-note">The siman is the author's. The section (${esc(h.sec)}) is our reading of this chapter, because the citation doesn't name one.</p>` : "";
  dialog(`<div class="pc-sheet"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <h3>${esc(h.resolved ? h.ref : h.text)}</h3><button class="iconbtn" data-x aria-label="Close">${I.x}</button></div>
    ${h.resolved ? `${sec}<div class="pc-body"><div class="loading"><div class="spin"></div>Loading from Sefaria…</div></div>
      <div class="meldarrow"><a class="tool" href="${PEARLS_CITE.sefariaUrl(h.ref)}" target="_blank" rel="noopener">${I.ext}<span>Open on Sefaria</span></a>
      <a class="tool" href="${PEARLS_CITE.meldarUrl(h.ref)}" target="_blank" rel="noopener">${I.ext}<span>Open in Meldar</span></a></div>`
      : `<p class="note">${esc(h.why || "This reference couldn't be turned into a text address.")}</p>`}</div>`, (s, close) => {
    $("[data-x]", s).onclick = close;
    if (!h.resolved) return;
    PEARLS_CITE.fetchSource(h.ref).then(x => {
      const body = $(".pc-body", s); if (!body) return;
      body.innerHTML = x.error ? `<p class="note">${esc(x.error)}</p>`
        : (x.he ? `<p class="pc-he" lang="he" dir="rtl">${esc(x.he)}</p>${lic(x.heVersion, x.heLicence)}` : "")
        + (x.en ? `<p class="pc-en">${esc(x.en)}</p>${lic(x.enVersion, x.enLicence)}` : "");
      const he = $(".pc-he", body); if (he) tintHebrew(he);
    });
  });
}

/* ---------- per-section tools: save, share, Sefaria/Meldar, Hebrew side by side ---------- */
function secTools(t, i, opts = {}) {
  const ref = sefRef(t, i + 1), slug = `${t.id}-${String(i + 1).padStart(2, "0")}`, saved = state.saved.some(s => s.id === slug);
  return `<div class="sectools" data-slug="${slug}" data-sec="${i + 1}">
    ${playable(t) ? `<button class="tool" data-act="playsec" data-id="${t.id}" data-sec="${i + 1}" aria-label="Listen from this section">${I.play}<span>Listen from here</span></button>` : ""}
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
  await hebrewPosts(t);                       // the whole chapter in one request, kept for offline
  if (!hebCache[slug]) throw new Error("not found");
  return hebCache[slug];
}
async function hebrewChapter(t) { await hebrewPosts(t); }   // all sections of a chapter in one request
/* Now Playing shows the text of the section playing, in the reading language: listening and reading on one screen */
async function fillNPText(t, part) {
  const box = $("#npText"); if (!box) return;
  const key = `${t.id}:${part}:${langPref()}`; box.dataset.k = key;
  const put = html => { if (box.dataset.k === key) { box.innerHTML = html; paintSpokenPara(audio.speaking ? box.dataset.p : null); } };
  try {
    if (langPref() === "he" || kindOf(t) === "he") {
      const h = await hebrewFor(t, part + 1).catch(() => null);
      if (h) return put(`<div class="heb" lang="he" dir="rtl"><h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}</div>`);
      if (kindOf(t) === "he") return put(`<p class="note">The Hebrew text needs a connection the first time. <button class="linkbtn" data-act="readalong">Open the chapter</button></p>`);
    }
    const d = await fetchSections(t);
    const sec = Array.isArray(d) ? d[part] && { html: d[part].content.rendered, title: R(d[part].title.rendered) } : d.sections[part] && { html: d.sections[part].body_en, title: esc(R(d.sections[part].title_en || "")) };
    if (!sec || !sec.html) return put(`<p class="note">No text for this section.</p>`);
    put(`<div class="en-body"><h3>${sec.title}</h3>${cleanHTML(sec.html, t)}</div>`);
  } catch { put(`<p class="note">Couldn't load the text. <button class="linkbtn" data-act="readalong">Open the chapter</button></p>`); }
}
/* One language for reading and listening, set from the chapter, the player or Settings */
function setLang(v) {
  state.prefs.read = v; state.prefs.readSet = true; save.prefs();
  document.querySelectorAll('[data-act="setread"]').forEach(x => { const on = x.dataset.v === v; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
  const m = location.hash.match(/^#ch-(\d\d-\d\d)/), rt = m && BYID[m[1]], r = $("#reader");
  if (r && rt) applyReadLang(rt, r);
  document.querySelectorAll("[data-langnote]").forEach(n => { const x = BYID[n.dataset.langnote]; if (x) n.innerHTML = audioNote(x); });
  document.querySelectorAll('[data-act="playch"] .plang').forEach(pl => { const x = BYID[pl.parentNode.dataset.id]; if (x) pl.textContent = ` · ${LANG_NAME[listenLang(x)]}`; });
  const t = cur();
  if (t && listenLang(t) !== P.lang && (online() || listenLang(t) === "tts")) load(!audio.paused);
  renderMini(); syncNP(true);
}
function audioNote(t) {   // under the language control: what you'll hear
  if (!playable(t)) return "No recording of this chapter yet.";
  const l = listenLang(t), en = langPref() !== "he";
  if (l === "en") return `You'll hear Har Bracha's English recording.`;
  if (l === "tts") return `There's no English recording of this chapter, so the <b>AI voice</b> on your ${DEVICE} reads the English (voice: ${esc(currentVoiceLabel())}). <button class="linkbtn" data-act="voice">Change voice</button>`;
  return en ? `You'll hear the Hebrew recording; this chapter has no English to read aloud.` : `You'll hear the Hebrew recording.`;
}
function voiceField() {
  if (!canSpeak() && !VX()) return `<div class="field"><label>AI voice</label><span class="note">This ${DEVICE} has no speech engine, so chapters without an English recording play in Hebrew.</span></div>`;
  const on = state.prefs.aiVoice !== false;
  return `<div data-voicefield><div class="field"><label>AI voice</label>
    <button class="opt" data-aivoice aria-pressed="${on}"><span style="flex:1"><b>Read the English aloud where there's no recording</b><br><span class="note">An AI voice reads the translation, section by section. Labelled "AI voice".</span></span><span class="switch ${on ? "on" : ""}" aria-hidden="true"></span></button></div>
    <div class="field" data-enginefield ${on ? "" : "hidden"}><label>Which voice</label><div data-engines>${engineList()}</div></div></div>`;
}
function mb(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : Math.round(n / 1e6) + " MB"; }
let VSTAT = null;
const DLP = {};   // "natural", "p:<piper voice>" or "k:<kokoro voice>" -> {loaded, total} while downloading
let RMASK = "";   // the item whose Remove was tapped once: its row asks to confirm (no browser dialog)
/* Remove in two taps: "Remove" then "Confirm · frees N MB" (or Cancel) */
const rmCtl = (id, attr, value, frees, label) => RMASK === id
  ? `<span class="rmask"><button class="btn line" ${attr}="${value}" aria-label="Confirm removing ${esc(label)}">Confirm · frees ${frees}</button> <button class="linkbtn" data-rmcancel>Cancel</button></span>`
  : `<button class="linkbtn" data-rmask="${id}" aria-label="Remove ${esc(label)}">Remove</button>`;
const triBtn = (k, label) => `<button class="iconbtn" data-ktry="${k}" aria-label="Hear ${esc(label)}">${I.play}</button>`;
const dlNote = id => DLP[id] ? `<span class="note">Downloading… ${mb(DLP[id].loaded)}${DLP[id].total ? ` of ${mb(DLP[id].total)}` : ""}</span>` : "";
/* a speaker or voice row: chosen with a tick when it is on this device, otherwise its size and a Download button */
function voiceRow({ id, attr, name, note, on, have, size, extraRemove, tryKey }) {   // size: what it takes, and frees when removed
  if (!have) return `<div class="voicerow"><span class="opt pick" style="cursor:default"><span style="flex:1"><b>${esc(name)}</b> <span class="note">${esc(note)}</span></span></span>${
    DLP[id] ? dlNote(id) : `<button class="btn line" ${attr}dl="${id.slice(2)}">Download · ${size}</button>`}</div>`;
  return `<div class="voicerow"><button class="opt pick ${on ? "on" : ""}" ${attr}="${id.slice(2)}"><span style="flex:1"><b>${esc(name)}</b> <span class="note">${esc(note)}</span></span>${on ? `<span class="tick" aria-label="chosen">✓</span>` : ""}</button>${triBtn(tryKey, name)}${
    extraRemove ? rmCtl(id, attr + "rm", id.slice(2), size, name) : ""}</div>`;
}
function kokoroRow(k, n) {
  const [name, note] = n.split(" · "), extra = !KOKORO_CORE.includes(k);
  return voiceRow({ id: "k:" + k, attr: "data-kvoice", name, note, on: kokoroChoice() === k, have: kokoroHas(k), size: "0.5 MB", extraRemove: extra, tryKey: k });
}
function piperRow(v) {
  const x = PIPER_VOICES[v];
  return voiceRow({ id: "p:" + v, attr: "data-pvoice", name: x.name, note: x.note, on: piperHas(v) && piperChoice() === v, have: piperHas(v), size: `${x.mb} MB`, extraRemove: true, tryKey: "piper:" + v });
}
function engineList() {
  const V = VX(), e = engineChoice(), st = VSTAT || {};
  const has = engineHas;
  /* an engine's voices show when it is chosen, and also whenever something of it is on this device, so a voice can
     always be removed (or chosen) without first switching engines */
  const row = (id, title, text, extra, shown) => `<div class="voicerow"><button class="opt ${e === id ? "on" : ""}" data-engine="${id}"><span class="radio ${e === id ? "on" : ""}"></span><span style="flex:1"><b>${title}</b><br><span class="note">${text}</span></span></button></div>${(e === id || shown) && extra ? `<div class="enginesub">${extra}</div>` : ""}`;
  const dl = (id, size) => {
    if (DLP[id]) return `<div class="note dlvoice">Downloading… ${mb(DLP[id].loaded)}${DLP[id].total ? ` of ${mb(DLP[id].total)}` : ""}</div>`;
    if (!has(id)) return `<div class="dlvoice"><button class="btn gold" data-vdl="${id}">Download (${size})</button> <span class="note">Until it's downloaded, your ${DEVICE}'s voice reads.</span></div>`;
    const how = NE.kind === id && NE.how ? ` · runs on the ${NE.how}` : "";
    const bytes = id === "natural" ? (NK.on() ? NK.bytes : st.bytes) : 0;
    return `<div class="dlvoice"><span class="note">On this ${DEVICE}${bytes ? ` · ${mb(bytes)}` : ""}${how}.</span> ${rmCtl(id, "data-vrm", id, bytes ? mb(bytes) : `about ${NK.on() ? NK.SIZE_MB : VX().SIZE_MB} MB`, ENGINE_NAME[id] || id)}</div>`;
  };
  const tri = (k, label) => `<button class="iconbtn" data-ktry="${k}" aria-label="Hear ${esc(label)}">${I.play}</button>`;
  let out = "";
  if (V) {
    const rtf = rtfs();
    const sp = id => rtf[id] ? ` Measured here: ${rtf[id].toFixed(1)}× real time${rtf[id] < 1 ? ", too slow to read without pauses" : ""}.` : "";
    out += row("natural", "Natural (Kokoro)", `The most natural voice, and it says the Hebrew guttural ḥ. Made on this ${DEVICE}, nothing is sent anywhere. Fast on a Mac or a recent iPad; on most phones expect pauses. One model holds all its voices, so after the model each voice is a small download (about 0.5 MB).${sp("natural")}`,
      dl("natural", `about ${NK.on() ? NK.SIZE_MB : V.SIZE_MB} MB`) + (has("natural") ? `<div class="note sublabel">Speaker</div>${Object.entries(KOKORO_VOICES).map(([k, n]) => kokoroRow(k, n)).join("")}` : ""), has("natural"));
    out += row("piper", "Light (Piper)", `Made on this ${DEVICE} too, and much lighter: keeps up on any phone. More robotic, no guttural ḥ. Each voice is a whole model of its own (about 63 MB). Only voices whose recordings are public domain.${sp("piper")}`,
      `<div class="note sublabel">Voice</div>${piperListed().map(piperRow).join("")}${piperListed().some(piperHas) ? "" : `<span class="note">Until a voice is downloaded, your ${DEVICE}'s voice reads.</span>`}`, piperListed().some(piperHas));
  }
  if (canSpeak()) out += row("device", `This ${DEVICE}'s voice`, "Always there, nothing to download. How it sounds depends on the voices installed.",
    `<div class="voicelist" data-voices>${voiceList()}</div>${AV.on() ? "" : `<span class="note">More voices: on iPhone and iPad, Settings → Accessibility → Spoken Content → Voices → English (the "Enhanced" and "Premium" ones sound best). On a Mac, System Settings → Accessibility → Spoken Content. On Android, the Text-to-speech settings. On Windows, Settings → Time &amp; language → Speech → Manage voices.</span>`}`);
  if (V && !DESKTOP) { const wo = V.wifiOnly(); out += `<button class="opt" data-vwifi aria-pressed="${wo}"><span style="flex:1"><b>Download voices on Wi-Fi only</b></span><span class="switch ${wo ? "on" : ""}" aria-hidden="true"></span></button>`; }
  return out;
}
function refreshEngines() { document.querySelectorAll("[data-engines]").forEach(n => { n.innerHTML = engineList(); }); document.querySelectorAll("[data-langnote]").forEach(n => { const x = BYID[n.dataset.langnote]; if (x) n.innerHTML = audioNote(x); }); }
function voiceStatus() { const V = VX(); if (V) V.status().then(x => { VSTAT = x; refreshEngines(); }).catch(() => {}); checkVoices().then(refreshEngines); }
function reloadVoice() { if (audio.speaking && cur()) load(!audio.paused); }
function setEngine(id) { state.prefs.voiceEngine = id; neuralFailed = false; save.prefs(); refreshEngines(); setLang(langPref()); reloadVoice(); }
async function downloadVoice(id) {
  const V = VX(); if (!V || DLP[id]) return;
  const size = id === "natural" && NK.on() ? NK.SIZE_MB : V.sizeMb(id, "eng"), ok = V.mayDownload(size);
  if (!ok.ok) { toast(ok.why.replace(/ in Aa → Voice downloads/, " below")); return; }
  if (ok.ask && !confirm(`${ok.why} Download it now?`)) return;
  const files = new Map(); DLP[id] = { loaded: 0, total: size * 1e6 }; refreshEngines();
  try {
    await NE.load(id, { net: true, onBytes: m => { files.set(m.url, m.loaded); let n = 0; for (const x of files.values()) n += x; DLP[id] = { loaded: n, total: size * 1e6 }; refreshEngines(); } });
    VSTAT = await V.status().catch(() => VSTAT);
    if (NK.on()) await NK.status().catch(() => {});
    delete DLP[id]; toast(`${ENGINE_NAME[id]} is on this ${DEVICE}`);
    if (engineChoice() === id) { neuralFailed = false; setLang(langPref()); reloadVoice(); }
  } catch (err) { delete DLP[id]; VSTAT = await V.status().catch(() => VSTAT); toast(`The ${ENGINE_NAME[id]} voice didn't start: ${err.message}`); }
  refreshEngines();
}
/* one Piper voice, or one more Kokoro speaker: downloaded only when asked for, then chosen */
async function downloadOne(kind, v) {
  const V = VX(), id = kind + ":" + v; if (!V || DLP[id]) return;
  const size = kind === "p" ? PIPER_VOICES[v].mb : 0.5, ok = V.mayDownload(size);
  if (!ok.ok) { toast(ok.why.replace(/ in Aa → Voice downloads/, " below")); return; }
  if (ok.ask && !confirm(`${ok.why} Download it now?`)) return;
  const files = new Map(); DLP[id] = { loaded: 0, total: size * 1e6 }; refreshEngines();
  const name = kind === "p" ? PIPER_VOICES[v].name : KOKORO_VOICES[v].split(" · ")[0];
  try {
    if (kind === "p") await NE.load("piper", { net: true, voice: v, onBytes: m => { files.set(m.url, m.loaded); let n = 0; for (const x of files.values()) n += x; DLP[id] = { loaded: n, total: size * 1e6 }; refreshEngines(); } });
    else if (NK.on()) await NK.voice(v, V.wifiOnly());
    else { const [store, f] = await voiceFilesModule(); await store.save(f.kokoroVoice(v), m => { DLP[id] = { loaded: m.loaded, total: m.total || size * 1e6 }; refreshEngines(); }); }
    VHAVE.set(id, true); delete DLP[id];
    if (kind === "p") { state.prefs.piperVoice = v; if (engineChoice() !== "piper") state.prefs.voiceEngine = "piper"; } else state.prefs.kokoroVoice = v;
    save.prefs(); neuralFailed = false; toast(`${name} is on this ${DEVICE}`); setLang(langPref()); reloadVoice();
  } catch (err) { delete DLP[id]; toast(`${name} didn't download: ${err.message}`); }
  refreshEngines();
}
async function removeOne(kind, v) {
  const id = kind + ":" + v, name = kind === "p" ? PIPER_VOICES[v].name : KOKORO_VOICES[v].split(" · ")[0];
  try {
    if (kind === "p") { if (NE.kind === "piper" && NE.voice === v) NE.stop(); const [store, f] = await voiceFilesModule(); for (const u of f.piperVoice(v).slice(0, 2)) await store.remove(u); VSTAT = await VX().status().catch(() => VSTAT); }
    else if (NK.on()) await NK.voiceRemove(v);
    else { const [store, f] = await voiceFilesModule(); await store.remove(f.kokoroVoice(v)); }
  } catch (e) { toast(`Couldn't remove ${name}: ${e.message}`); return; }
  VHAVE.set(id, false); toast(`${name} removed from this ${DEVICE}`); setLang(langPref()); reloadVoice(); refreshEngines();
}
const trialEl = new Audio(); let trialTurn = 0;
function tryNeural(k) {
  const id = String(k).startsWith("piper") ? "piper" : "natural", my = ++trialTurn, voice = id === "piper" ? String(k).split(":")[1] || piperChoice() : k;
  if (audio.speaking && !audio.paused) audio.pause();
  trialEl.src = SILENT; trialEl.play().catch(() => {});   // inside the tap, so the sample may play when it's ready
  if (!(NE.loaded && NE.kind === id)) toast(`Loading the ${id === "natural" ? "natural" : "light"} voice…`);
  NE.say(id, "Shabbat is a day of rest, blessing and holiness. Ḥanukka and Pesaḥ come in their seasons.", voice, state.speed || 1).then(a => {
    if (my !== trialTurn) return;
    trialEl.src = URL.createObjectURL(a.blob); trialEl.playbackRate = 1;
    trialEl.play().then(() => vlog("sample playing"), e => toast(`Couldn't play the sample: ${e.message}`)); refreshEngines();
  }).catch(e => { if (my === trialTurn) toast(`Couldn't make the sample: ${e.message}`); refreshEngines(); });
}
function appleVoiceList() {
  const L = AV.list, on = appleChoice();
  if (!L.length) return `<span class="note">Loading the voices on this ${DEVICE}…</span>`;
  const good = L.some(v => QUALITY[v.quality]);
  const card = good ? "" : `<div class="note voicecard"><b>Better voices, free and offline.</b> On this ${DEVICE}: Settings → Accessibility → Read &amp; Speak → Voices → English (on earlier versions, Spoken Content → Voices, or Live Speech → Voices), and download a <b>Premium</b> voice (or Enhanced). Pearls picks the best one by itself once it is there, unless you have chosen another.</div>`;
  return card + L.map(v => `<div class="voicerow"><button class="opt ${v.id === on ? "on" : ""}" data-voice="${esc(v.id)}"><span class="radio ${v.id === on ? "on" : ""}"></span><span style="flex:1"><b>${esc(avName(v))}</b> <span class="note">${esc(v.lang)}${QUALITY[v.quality] ? ` · ${QUALITY[v.quality]}` : ""}${v.gender ? ` · ${v.gender}` : ""}</span></span></button><button class="iconbtn" data-try="${esc(v.id)}" aria-label="Hear ${esc(avName(v))}">${I.play}</button></div>`).join("");
}
function voiceList() {
  if (AV.on()) return appleVoiceList();
  const vs = voices(), on = pickVoice();
  if (!vs.length) return `<span class="note">Loading the voices on this ${DEVICE}…</span>`;
  const rank = v => (/premium/i.test(v.name) ? 0 : /enhanced|siri/i.test(v.name) ? 1 : 2) * 10 + (/en-(US|GB)/i.test(v.lang) ? 0 : 1);
  return vs.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map(v => `<div class="voicerow"><button class="opt ${on && v.voiceURI === on.voiceURI ? "on" : ""}" data-voice="${esc(v.voiceURI)}"><span class="radio ${on && v.voiceURI === on.voiceURI ? "on" : ""}"></span><span style="flex:1"><b>${esc(v.name.replace(/\s*\(.*\)$/, ""))}</b> <span class="note">${esc(v.lang.replace("_", "-"))}${v.localService ? "" : " · online"}</span></span></button><button class="iconbtn" data-try="${esc(v.voiceURI)}" aria-label="Hear ${esc(v.name)}">${I.play}</button></div>`).join("");
}
function tryVoice(uri) {
  if (AV.on()) {   // the app renders the sample, so Premium and Enhanced voices can be heard too
    const my = ++trialTurn; if (audio.speaking && !audio.paused) audio.pause();
    trialEl.src = SILENT; trialEl.play().catch(() => {});
    AV.say("Shabbat is a day of rest, blessing and holiness.", uri, state.speed || 1).then(a => { if (my !== trialTurn) return; trialEl.src = URL.createObjectURL(a.blob); trialEl.playbackRate = 1; trialEl.play().catch(e => toast(`Couldn't play the sample: ${e.message}`)); })
      .catch(e => { if (my === trialTurn) toast(`Couldn't make the sample: ${e.message}`); });
    return;
  }
  const v = voices().find(x => x.voiceURI === uri); if (!v) return;
  const wasPlaying = audio.speaking && !audio.paused; if (wasPlaying) audio.pause();
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance("Shabbat is a day of rest, blessing and holiness."); u.voice = v; u.lang = v.lang; u.rate = state.speed || 1; speechSynthesis.speak(u); } catch {}
}
function wireVoiceField(s) {
  const f = $("[data-voicefield]", s); if (!f) return;
  voiceStatus();
  $("[data-aivoice]", f).onclick = () => { state.prefs.aiVoice = state.prefs.aiVoice === false; save.prefs(); const on = state.prefs.aiVoice !== false;
    $("[data-aivoice] .switch", f).classList.toggle("on", on); $("[data-aivoice]", f).setAttribute("aria-pressed", on); $("[data-enginefield]", f).hidden = !on; setLang(langPref()); };
  f.onclick = e => {
    const g = x => e.target.closest(x);
    let b;
    if ((b = g("[data-ktry]"))) { tryNeural(b.dataset.ktry); return; }
    if ((b = g("[data-try]"))) { tryVoice(b.dataset.try); return; }
    if ((b = g("[data-vdl]"))) { downloadVoice(b.dataset.vdl); return; }
    if ((b = g("[data-rmask]"))) { RMASK = b.dataset.rmask; refreshEngines(); return; }
    if ((b = g("[data-rmcancel]"))) { RMASK = ""; refreshEngines(); return; }
    if ((b = g("[data-vrm]"))) { RMASK = ""; const id = b.dataset.vrm; if (NE.kind === id) NE.stop(); (id === "natural" && NK.on() ? NK.remove() : VX().remove(id, "eng")).then(() => { toast(`${ENGINE_NAME[id]} removed from this ${DEVICE}`); voiceStatus(); setLang(langPref()); reloadVoice(); }); return; }
    if ((b = g("[data-vwifi]"))) { VX().setWifiOnly(!VX().wifiOnly()); refreshEngines(); return; }
    if ((b = g("[data-engine]"))) { if (b.dataset.engine !== engineChoice()) setEngine(b.dataset.engine); return; }
    if ((b = g("[data-kvoice]"))) { state.prefs.kokoroVoice = b.dataset.kvoice; state.prefs.voiceEngine = "natural"; neuralFailed = false; save.prefs(); refreshEngines(); tryNeural(b.dataset.kvoice); setLang(langPref()); reloadVoice(); return; }
    if ((b = g("[data-pvoice]"))) { state.prefs.piperVoice = b.dataset.pvoice; state.prefs.voiceEngine = "piper"; neuralFailed = false; save.prefs(); refreshEngines(); tryNeural("piper:" + b.dataset.pvoice); setLang(langPref()); reloadVoice(); return; }
    if ((b = g("[data-kvoicedl]"))) { downloadOne("k", b.dataset.kvoicedl); return; }
    if ((b = g("[data-pvoicedl]"))) { downloadOne("p", b.dataset.pvoicedl); return; }
    if ((b = g("[data-kvoicerm]"))) { RMASK = ""; removeOne("k", b.dataset.kvoicerm); return; }
    if ((b = g("[data-pvoicerm]"))) { RMASK = ""; removeOne("p", b.dataset.pvoicerm); return; }
    if (!(b = g("[data-voice]"))) return;
    state.prefs.voice = b.dataset.voice; save.prefs(); tryVoice(b.dataset.voice);
    refreshEngines(); setLang(langPref()); reloadVoice();
  };
}
function refreshVoiceUI() { document.querySelectorAll("[data-voices]").forEach(n => { n.innerHTML = voiceList(); }); document.querySelectorAll("[data-langnote]").forEach(n => { const x = BYID[n.dataset.langnote]; if (x) n.innerHTML = audioNote(x); }); }
function voiceDialog() {
  dialog(`<h3>AI voice</h3><p class="note">Chapters with no English recording are read aloud by an AI voice. Pick one; ▶ plays a sample.</p>${voiceField()}
    <div style="display:flex;justify-content:flex-end"><button class="btn gold" data-x>Done</button></div>`, (s, close) => { wireVoiceField(s); $("[data-x]", s).onclick = close; });
}
/* while the AI voice reads, mark the paragraph it is on (chapter view of the chapter playing) */
function paintSpokenPara(p) {
  document.querySelectorAll(".reader .spoken, .nptext .spoken").forEach(e => e.classList.remove("spoken"));
  const npb = $("#npText"); if (npb) npb.dataset.p = p == null ? "" : p;
  const t = cur(); if (p == null || p === "" || +p < 0 || !t) return; p = +p;
  const nb = npb && npb.querySelector(".en-body");
  if (nb) { const ttl = nb.querySelector(":scope > h3"), ls = [...nb.querySelectorAll("p, li, h2, h3, h4")].filter(b => b !== ttl), e = ls[p]; if (e) { e.classList.add("spoken"); const br = npb.getBoundingClientRect(), er = e.getBoundingClientRect(); if (er.top < br.top || er.bottom > br.bottom) npb.scrollTop += er.top - br.top - 40; } }
  if (location.hash !== `#ch-${t.id}`) return;
  const sec = $(`#sec-${P.part + 1}`); if (!sec) return;
  const body = sec.querySelector(".en-body, .ai-sec"); if (!body) return;
  const blocks = body.querySelectorAll("p, li, h2, h3, h4"), title = body.querySelector(":scope > h3"), list = [...blocks].filter(b => b !== title && !b.closest(".sectools"));
  const el = list[p]; if (!el) return;
  el.classList.add("spoken");
  const rc = el.getBoundingClientRect(); if (rc.top > innerHeight * .8 || rc.bottom < 80) { const prev = list[p - 1]; const pr = prev && prev.getBoundingClientRect(); if (!prev || (pr.bottom > 0 && pr.top < innerHeight)) el.scrollIntoView({ behavior: "smooth", block: "center" }); }
}
/* language picker: one segmented control on the chapter page and in the player */
function langBar(t) {
  const r = state.prefs.read || "en";
  const opts = (t.vol.he && !t.translated) ? [["he", "עברית"]] : [["en", t.vol.he ? "English (AI)" : "English"], ["he", "עברית"], ["both", "Both"]];
  return `<div class="langbar"><div class="segrow"><span class="seglabel">Language</span><div class="seg" role="radiogroup" aria-label="Reading language">
    ${opts.map(([v, l]) => `<button role="radio" aria-checked="${r === v}" class="${r === v || opts.length === 1 ? "on" : ""}" data-act="setread" data-v="${v}" data-id="${t.id}" ${v === "he" ? 'lang="he"' : ""}>${l}</button>`).join("")}</div></div>
    <p class="note langnote" data-langnote="${t.id}">${audioNote(t)}</p></div>`;
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
    s.innerHTML = h ? `<h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}` : `<p class="note" dir="ltr">No Hebrew found for this section.</p>`; hebDone(s, t);
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

/* ---------- Downloads & offline (Android app) ---------- */
function dlSummary() {
  dlRefresh();
  const n = TRACKS.filter(isDownloaded).length, busy = TRACKS.filter(t => ["loading", "waiting"].includes(dlState(t).s)).length;
  return `${n} chapter${n === 1 ? "" : "s"} on this ${DEVICE}${n ? ` · ${fmtMB(dlUsed())}` : ""}${busy ? ` · ${busy} downloading` : ""} · smart downloads ${DL.prefs.smart ? "on" : "off"}`;
}
function hebSaved() { if (!NATIVE) return []; try { return JSON.parse(NATIVE.textList()).filter(f => /^he-\d\d-\d\d\.json$/.test(f.n)); } catch { return []; } }
const HEALL = { run: false, done: 0, total: 0, failed: 0 };
async function downloadAllHebrew() {
  if (HEALL.run) return;
  const have = new Set(hebSaved().map(f => f.n.slice(3, 8))), todo = TRACKS.filter(t => !have.has(t.id));
  Object.assign(HEALL, { run: true, done: 0, total: todo.length, failed: 0 }); dlPaint();
  const worker = async () => { while (todo.length && HEALL.run) {
    const t = todo.shift();
    try { await hebrewPosts(t); } catch { HEALL.failed++; if (!online()) { HEALL.run = false; break; } }
    HEALL.done++; if (HEALL.done % 5 === 0) dlPaint();
  } };
  await Promise.all([worker(), worker()]);
  const stopped = !online(); HEALL.run = false; dlPaint();
  toast(stopped ? "Stopped: you went offline. Tap again to carry on." : `Hebrew text saved${HEALL.failed ? ` (${HEALL.failed} chapters couldn't load)` : ""}`);
}
function offlineCard() {
  if (online()) return "";
  const n = NATIVE ? TRACKS.filter(isDownloaded).length : 0;
  return `<button class="panel offline" data-go="${NATIVE ? "downloads" : "books"}"><span class="offdot"></span><span><b>You're offline</b><br><span class="note">
    ${NATIVE ? `All English text reads offline${n ? `, and ${n} downloaded chapter${n > 1 ? "s" : ""} can play` : ". Download chapters to listen without a connection"}.` : "Chapters you've opened before may still read."}</span></span><span class="dur">›</span></button>`;
}
function vDownloads() {
  setTop("Downloads"); setTab("library");
  if (!NATIVE) { view.innerHTML = `<div class="view"><h1 class="hello">Downloads</h1><p class="note">Downloading audio for offline listening works in the Pearls app for Android, iPhone and iPad.</p></div>`; return; }
  dlRefresh();
  const p = DL.prefs, have = TRACKS.filter(isDownloaded), busy = TRACKS.filter(t => ["loading", "waiting"].includes(dlState(t).s));
  const heb = hebSaved(), hebMB = heb.reduce((a, f) => a + f.s, 0), enN = TRACKS.filter(t => !t.vol.he).length, aiN = TRACKS.filter(t => t.vol.he && t.translated).length;
  const sizeOf = t => { const e = DL.idx[t.id]; return e ? dlNames(t, e.lang).reduce((a, n) => a + (DL.files.get(n) || 0), 0) : 0; };
  const tog = (k, title, note) => `<button class="opt" data-dlpref="${k}"><span class="radio ${p[k] ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>${title}</b><br><span class="note">${note}</span></span></button>`;
  view.innerHTML = `<div class="view">
    <div><h1 class="hello">Downloads</h1>
      <p class="sub">${have.length} chapter${have.length === 1 ? "" : "s"} · ${fmtMB(dlUsed())} of audio${DL.free ? ` · ${fmtMB(DL.free)} free` : ""} · ${online() ? "online" : "<b>offline</b>"}</p></div>
    ${!DL.ok ? `<div class="panel note">This ${DEVICE}'s storage isn't available right now, so audio can't be downloaded.</div>` : ""}
    ${busy.length ? `<section><div class="sec-h"><h2>Downloading</h2><button class="more" data-act="dlcancel">Cancel all</button></div>
      <div class="list">${busy.map(t => trackRow(t, { why: dlLabel(t).text, end: `<button class="iconbtn" style="background:none" data-act="dlrm" data-id="${t.id}" aria-label="Cancel">${I.x}</button>` })).join("")}</div>
      ${p.wifiOnly && !DESKTOP && busy.some(t => dlState(t).s === "waiting") ? `<p class="note">Waiting downloads start on Wi-Fi. Turn off “Wi-Fi only” below to use mobile data.</p>` : ""}</section>` : ""}
    <section class="panel dlset"><div class="eyebrow">Smart downloads</div>
      ${tog("smart", "Download ahead", `Keeps the chapter you're on and the next ones in your queue on the ${DEVICE}, plus chapters you're partway through, so they play without a connection.`)}
      <div class="field"><label>Chapters ahead</label><div class="chips">${[1, 3, 5, 10].map(n => `<button class="chip ${p.ahead === n ? "on" : ""}" data-ahead="${n}">${n}</button>`).join("")}</div></div>
      ${tog("autoDelete", "Delete after listening", "Removes chapters that smart downloads fetched once you've heard them. Chapters you download yourself stay until you remove them.")}
      ${DESKTOP ? "" : tog("wifiOnly", "Wi-Fi only", "Downloads wait for Wi-Fi instead of using mobile data.")}
      <div class="field"><label>Storage limit for smart downloads</label><div class="chips">${[[500, "500 MB"], [1024, "1 GB"], [2048, "2 GB"], [5120, "5 GB"], [0, "No limit"]].map(([v, l]) => `<button class="chip ${p.limitMB === v ? "on" : ""}" data-limit="${v}">${l}</button>`).join("")}</div>
        <span class="note">When it's full, the oldest smart downloads make room, heard ones first. About ${fmtMB(8000 * 3600)} per hour of Hebrew audio, ${fmtMB(16000 * 3600)} of English.</span></div>
    </section>
    <section class="panel dlset"><div class="eyebrow">Reading offline</div>
      <p class="note" style="margin:0"><b>English:</b> all ${enN} chapters of the official translation and the ${aiN} AI-translated chapters are inside the app, so they read without a connection.</p>
      <p class="note" style="margin:0"><b>Hebrew:</b> ${heb.length} of ${TRACKS.length} chapters saved on this ${DEVICE}${heb.length ? ` (${fmtMB(hebMB)})` : ""}. A chapter's Hebrew is saved the first time it loads, and when you download its audio.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${HEALL.run ? `<button class="btn line" data-act="dlhebstop">${DLI.wait}<span>Saving Hebrew ${HEALL.done}/${HEALL.total} · stop</span></button>`
          : heb.length < TRACKS.length ? `<button class="btn line" data-act="dlheb" ${online() ? "" : "disabled"}>${DLI.get}<span>Save all the Hebrew (~${fmtMB(Math.max(0, TRACKS.length - heb.length) * 60e3)})</span></button>` : `<span class="note">${DLI.done} All the Hebrew is saved.</span>`}
        ${heb.length ? `<button class="btn line" data-act="dlhebclear">Delete saved Hebrew</button>` : ""}</div>
    </section>
    <section><div class="sec-h"><h2>On this ${DEVICE}</h2>${have.length ? `<button class="more" data-act="playdl">Play all</button>` : ""}</div>
      ${have.length ? `<div class="list">${have.map(t => trackRow(t, { why: `${fmtMB(sizeOf(t))}${DL.idx[t.id].auto ? " · smart" : ""}`, end: `<button class="iconbtn" style="background:none" data-act="dlrm" data-id="${t.id}" aria-label="Remove download">${I.x}</button>` })).join("")}</div>
        <div style="display:flex;justify-content:flex-end"><button class="btn line" data-act="dlrmall">Delete all downloads</button></div>`
        : `<div class="panel empty"><div class="em-orb"></div><span>Nothing downloaded yet. Tap <b>Download</b> on a chapter, or <b>Download all</b> on a book or playlist. With smart downloads on, what you're listening to downloads by itself.</span><button class="btn ghost" data-go="books">Browse the books</button></div>`}</section>
  </div>`;
  view.querySelectorAll("[data-dlpref]").forEach(b => b.onclick = () => { const k = b.dataset.dlpref; p[k] = !p[k]; saveDl(); b.querySelector(".radio").classList.toggle("on", p[k]);
    if (k === "wifiOnly") toast(p[k] ? "New downloads wait for Wi-Fi" : "Downloads may use mobile data"); smartSoon(300); });
  view.querySelectorAll("[data-ahead]").forEach(b => b.onclick = () => { p.ahead = +b.dataset.ahead; saveDl(); view.querySelectorAll("[data-ahead]").forEach(x => x.classList.toggle("on", x === b)); smartSoon(300); });
  view.querySelectorAll("[data-limit]").forEach(b => b.onclick = () => { p.limitMB = +b.dataset.limit; saveDl(); view.querySelectorAll("[data-limit]").forEach(x => x.classList.toggle("on", x === b)); smartSoon(300); });
}

/* ---------- sync: pick up where you stopped on any device ----------
   One saved copy per reader on pearls.pages.dev (functions/api/sync.js, KV). Who you are is the sign-in you already
   have: in a browser on pearls.pages.dev the Pearls pass cookie; in the Android and Apple apps a device token, which
   a signed-in browser hands over with a one-time code (Settings → Sync). The merge rules are pearls-sync-merge.js,
   shared with the server. Device-only things stay on the device: downloads, text size and the Meldar study record.
   `var`, not `let`: store.set() calls syncTouched() and may do so before this block has run. */
var SM = window.PearlsSyncMerge || null;
var SYNC_MAPS = ["plays", "read", "days", "measured"];
var syncAt = store.get("syncAt", {}), syncGone = store.get("syncGone", { read: {} });
var syncApplying = false, syncT = null, syncDue = 0, syncBusy = null, syncLastSent = "", syncPulledAt = 0;
var SYNC = (() => {
  if (!SM || typeof fetch !== "function") return null;
  if (window.PEARLS_SYNC_MODE) return window.PEARLS_SYNC_MODE;                                                       // tests: {base, token}
  if (/(^|\.)pearls\.pages\.dev$/.test(location.hostname)) return { base: "", token: false };                         // the web edition: the pass cookie
  if (window.PearlsNative || location.protocol === "pearls:" || location.host === "appassets.androidplatform.net")
    return { base: store.get("syncBase", "https://pearls.pages.dev"), token: true };                                // the apps: a device token
  return null;                                                                                                       // elsewhere (the claude.ai artifact): no sync
})();
var syncInfo = store.get("syncInfo", { who: "", last: 0, err: "" });
function syncTouched(k) {
  if (syncApplying || !SM) return;
  if (SM.WHOLE.includes(k)) { syncAt[k] = Date.now(); try { localStorage.setItem("pearls:syncAt", JSON.stringify(syncAt)); } catch {} }
  if (SM.WHOLE.includes(k) || SYNC_MAPS.includes(k)) syncSoon();
}
function syncGoneRead(id) { syncGone.read[id] = Date.now(); store.set("syncGone", syncGone); }
const syncOn = () => !!(SYNC && (!SYNC.token || store.get("syncToken", "")));
function localDoc() {
  const whole = {};
  for (const k of SM.WHOLE) { const v = store.get(k, undefined); if (v !== undefined) whole[k] = { at: syncAt[k] || 0, val: k === "prefs" ? { ...v, size: undefined } : v }; }
  return SM.merge({ plays: store.get("plays", {}), read: store.get("read", {}), days: store.get("days", {}), measured: store.get("measured", {}), gone: syncGone, whole }, {});
}
// Fold another copy into this device. Returns true if anything here changed.
function applyDoc(remote) {
  const mine = localDoc(), m = SM.merge(mine, remote);
  if (SM.same(m, mine)) return false;
  syncApplying = true;
  try {
    const t = cur(), playing = t && !audio.paused;
    const plays = m.plays; if (playing && state.plays[t.id]) plays[t.id] = state.plays[t.id];   // the chapter playing here is ahead by definition
    state.plays = plays; save.plays();
    state.read = m.read; save.read(); state.days = m.days; save.days(); state.measured = m.measured; save.measured();
    syncGone = m.gone; store.set("syncGone", syncGone);
    let qChanged = false, look = false;
    for (const k in m.whole) {
      const w = m.whole[k]; if (SM.same(mine.whole[k], w)) continue;
      let v = w.val; syncAt[k] = w.at;
      if (k === "prefs") { v = { ...state.prefs, ...v, size: state.prefs.size }; state.prefs = v; look = true; }
      else if (k === "likes") state.likes = new Set(v || []);
      else if (k === "lists") state.lists = Object.assign({ review: [], later: [] }, v);
      else if (k === "scheme") { if (SCHEMES[v]) setScheme(v); continue; }
      else if (k === "enWords") { setEnWords(v === true); continue; }
      else if (k === "audioLang") audioLang = v;
      else if (k === "speed") { state.speed = v; audio.playbackRate = v; }
      else if (k === "lastQueue") { state.lastQueue = v; qChanged = true; }
      else state[k] = v;
      store.set(k, v);
    }
    store.set("syncAt", syncAt);
    if (look) applyPrefs();
    // nothing has played on this device since it opened: get the player ready where the other device stopped
    if (qChanged && !playing && !(P.started)) { restoreQueue(); renderMini(); }
  } finally { syncApplying = false; }
  const h = location.hash.slice(1);
  if (!document.querySelector(".scrim") && !npEl && (!h || h === "library" || h === "progress")) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  return true;
}
function syncHeaders() {
  const h = { "Content-Type": "application/json" };
  if (SYNC && SYNC.token) h.Authorization = "Bearer " + store.get("syncToken", "");
  return h;
}
function syncNote(r) { syncInfo = { ...syncInfo, ...r }; store.set("syncInfo", syncInfo); const n = document.querySelector("[data-syncnote]"); if (n) n.textContent = syncStatus(); }
async function syncCall(method, doc, keepalive) {
  const r = await fetch(SYNC.base + "/api/sync", { method, headers: syncHeaders(), credentials: SYNC.token ? "omit" : "same-origin",
    body: doc ? JSON.stringify({ doc }) : undefined, keepalive: !!keepalive, cache: "no-store" });
  if (r.status === 401) {
    if (SYNC.token) { store.set("syncToken", ""); toast("This device was unlinked from sync"); }
    syncNote({ err: "Not signed in" }); return null;
  }
  if (!r.ok) { syncNote({ err: `Sync failed (${r.status})` }); return null; }
  const j = await r.json(); syncNote({ who: j.who || syncInfo.who, last: Date.now(), err: "" }); return j;
}
function syncSoon(ms) {
  if (!syncOn() || syncApplying) return;
  if (ms == null) ms = audio && !audio.paused ? 120000 : 5000;   // while listening the position changes every second; send it every 2 minutes
  const due = Date.now() + ms;
  if (syncT && syncDue <= due) return;
  clearTimeout(syncT); syncDue = due; syncT = setTimeout(() => { syncT = null; syncNow(); }, ms);
}
async function syncNow(keepalive) {
  if (!syncOn()) return false;
  if (syncBusy) return syncBusy;
  clearTimeout(syncT); syncT = null;
  syncBusy = (async () => {
    try {
      const doc = localDoc(), body = JSON.stringify(doc);
      if (body === syncLastSent && Date.now() - syncPulledAt < 60000) return true;
      if (keepalive && body.length > 60000) keepalive = false;   // the browser won't keep a bigger request alive
      const j = await syncCall("POST", doc, keepalive);
      if (!j) return false;
      applyDoc(j.doc); syncLastSent = JSON.stringify(localDoc()); syncPulledAt = Date.now();
      return true;
    } catch { syncNote({ err: "Offline: will sync later" }); return false; }
    finally { syncBusy = null; }
  })();
  return syncBusy;
}
async function syncPull() {
  if (!syncOn()) return false;
  try { const j = await syncCall("GET"); if (!j) return false; syncPulledAt = Date.now(); const ch = applyDoc(j.doc); syncSoon(1500); return ch; }
  catch { syncNote({ err: "Offline: will sync later" }); return false; }
}
function syncStart() {
  if (!SYNC) return;
  audio.addEventListener("play", () => { P.started = true; });
  audio.addEventListener("pause", () => syncSoon(3000));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) syncNow(true); else if (Date.now() - syncPulledAt > 30000) syncPull();
  });
  window.addEventListener("pagehide", () => syncNow(true));
  window.addEventListener("online", () => syncPull());
  setTimeout(syncPull, 800);
}
function syncStatus() {
  if (!syncOn()) return "";
  if (syncInfo.err) return syncInfo.err;
  if (!syncInfo.last) return "Not synced yet";
  const m = Math.round((Date.now() - syncInfo.last) / 60000);
  return m < 1 ? "Synced just now" : m < 60 ? `Synced ${m} min ago` : `Synced ${new Date(syncInfo.last).toLocaleString()}`;
}
/* The section you're reading is the one whose heading has passed the top third of the screen. */
var readTimer = null;
window.addEventListener("scroll", () => {
  if (!location.hash.startsWith("#ch-")) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    const id = location.hash.slice(4), r = $("#reader"); if (!BYID[id] || !r) return;
    let sec = 0; for (const s of r.querySelectorAll("section[id^='sec-']")) if (s.getBoundingClientRect().top < innerHeight / 3) sec = +s.id.slice(4);
    if (!sec || (state.where && state.where.id === id && state.where.sec === sec)) return;
    state.where = { id, sec, at: Date.now() }; store.set("where", state.where);
  }, 700);
}, { passive: true });
var pendingSec = null;
function jumpPending(t) {
  if (!pendingSec || pendingSec.id !== t.id) return;
  const el = document.getElementById(`sec-${pendingSec.sec}`); pendingSec = null;
  if (el) setTimeout(() => el.scrollIntoView(), 50);
}
/* Settings → Sync */
function syncField() {
  if (!SYNC) return "";
  const linked = syncOn();
  return `<div class="field" data-sync><label>Sync across devices</label>${SYNC.token ? (linked
    ? `<span class="note">This device keeps its place in sync with ${syncInfo.who ? `<b>${esc(syncInfo.who)}</b>'s` : "your"} Pearls on every other device: where you stopped reading and listening, finished chapters, lists, playlists, saved passages and settings. <span data-syncnote>${esc(syncStatus())}</span></span>
       <div class="chips"><button class="chip" data-syncnow>Sync now</button><button class="chip" data-syncunlink>Unlink this device</button></div>`
    : `<span class="note">Pick up where you stopped on any device. On a computer or phone browser, sign in at <b>pearls.pages.dev</b>, open Settings → Sync and tap <b>Link the app</b>. Type the code it shows here.</span>
       <div style="display:flex;gap:8px"><input id="syncCode" maxlength="9" autocapitalize="characters" autocomplete="off" placeholder="ABCD-EFGH" style="flex:1"><button class="btn gold" data-synclink>Link</button></div>`)
    : `<span class="note">You're signed in${syncInfo.who ? ` as <b>${esc(syncInfo.who)}</b>` : ""}, so Pearls keeps your place on every browser you sign in on: where you stopped reading and listening, finished chapters, lists, playlists, saved passages and settings. <span data-syncnote>${esc(syncStatus())}</span></span>
       <div class="chips"><button class="chip" data-syncnow>Sync now</button><button class="chip" data-synccode>Link the Android or Apple app</button></div>
       <div data-syncdevs></div>`}</div>`;
}
function syncWire(s) {
  const q = sel => s.querySelector(sel);
  if (q("[data-syncnow]")) q("[data-syncnow]").onclick = async () => { toast("Syncing…"); toast(await syncNow() ? "Synced" : syncInfo.err || "Couldn't sync"); };
  if (q("[data-synclink]")) q("[data-synclink]").onclick = async () => {
    const code = q("#syncCode").value.trim(); if (!code) return;
    try {
      const r = await fetch(SYNC.base + "/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
        body: JSON.stringify({ code, device: location.protocol === "pearls:" ? (window.PEARLS_SHELL === "ipad" ? "iPad app" : window.PEARLS_SHELL === "mac" ? "Mac app" : "iPhone app") : window.PEARLS_SHELL === "windows" ? "Windows app" : window.PearlsNative ? "Android app" : "Pearls app" }) });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "That code didn't work"); return; }
      store.set("syncToken", j.token); syncNote({ who: j.who || "", err: "" });
      await syncPull(); await syncNow();
      toast("Linked: this device now syncs"); s.remove(); settingsDialog();
    } catch { toast("Couldn't reach pearls.pages.dev. Check the connection."); }
  };
  if (q("[data-syncunlink]")) q("[data-syncunlink]").onclick = async () => {
    try { await fetch(SYNC.base + "/api/devices", { method: "POST", headers: syncHeaders(), credentials: "omit", body: JSON.stringify({ remove: "self" }) }); } catch {}
    store.set("syncToken", ""); syncNote({ who: "", last: 0, err: "" }); toast("Unlinked. Your progress stays on this device."); s.remove(); settingsDialog();
  };
  if (q("[data-synccode]")) q("[data-synccode]").onclick = async () => {
    try {
      const r = await fetch("/api/link", { method: "POST", headers: { "Content-Type": "application/json" } }), j = await r.json();
      if (!r.ok) { toast(j.error || "Couldn't make a code"); return; }
      dialog(`<h3>Link the app</h3><p class="note">In the Pearls app on your phone, iPad or PC, open Settings → Sync across devices and type this code. It works once, for ${j.minutes} minutes.</p>
        <p style="font:600 30px/1.2 ui-monospace,monospace;letter-spacing:.08em;text-align:center;margin:8px 0">${esc(j.code)}</p>
        <div style="display:flex;justify-content:flex-end"><button class="btn gold" data-ok>Done</button></div>`, (d, close) => { d.querySelector("[data-ok]").onclick = () => { close(); syncDevices(s); }; });
    } catch { toast("Couldn't reach the server"); }
  };
  if (q("[data-syncdevs]")) syncDevices(s);
}
async function syncDevices(s) {
  const box = s.querySelector("[data-syncdevs]"); if (!box) return;
  try {
    const r = await fetch("/api/devices"), j = await r.json(); if (!r.ok) return;
    box.innerHTML = j.devices.length ? `<span class="note">Linked apps:</span>${j.devices.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0">
      <span class="note"><b>${esc(d.name)}</b> · linked ${new Date(d.made).toLocaleDateString()}${d.last ? `, last synced ${new Date(d.last).toLocaleDateString()}` : ""}</span>
      <button class="chip" data-unlinkdev="${esc(d.id)}">Unlink</button></div>`).join("")}` : "";
    box.querySelectorAll("[data-unlinkdev]").forEach(b => b.onclick = async () => {
      await fetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remove: b.dataset.unlinkdev }) });
      syncDevices(s);
    });
  } catch {}
}

/* ---------- Settings ---------- */
function settingsDialog() {
  dialog(`<h3>Settings</h3>
    <div class="field"><label>Skin</label><div class="skins">${SKINS.map(k => `<button class="skinbtn ${(state.prefs.skin || "classic") === k.id ? "on" : ""}" data-skin="${k.id}" aria-pressed="${(state.prefs.skin || "classic") === k.id}"><i style="background:linear-gradient(135deg,${k.bg} 50%,${k.alt} 50%)"><b style="background:${k.acc}"></b></i><span>${k.name}${k.note ? `<small>${k.note}</small>` : ""}</span></button>`).join("")}</div></div>
    <div class="field"><label>Appearance</label><div class="chips">${MODES.map(([v, l]) => `<button class="chip ${(state.prefs.mode || "design") === v ? "on" : ""}" data-mode="${v}">${l}</button>`).join("")}</div>
      <span class="note">Every skin has a light and a dark version. "As designed" uses the one it was drawn in.</span></div>
    <div class="field"><label>Spelling of Hebrew words</label>
      ${Object.entries(SCHEMES).map(([k, s]) => `<button class="opt" data-s="${k}"><span class="radio ${k === scheme ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>${esc(s.name)}</b><br><span class="note">${esc(s.sub)}</span></span></button>`).join("")}
      ${enWordsOpt()}
      <a class="note" href="#spelling" data-credits style="color:var(--gold-2)">All spelling schemes, compared</a></div>
    <div class="field"><label>Text size</label><div class="chips">${[[0.9, "Small"], [1, "Normal"], [1.15, "Large"], [1.3, "Larger"]].map(([v, l]) => `<button class="chip ${state.prefs.size === v ? "on" : ""}" data-size="${v}">${l}</button>`).join("")}</div></div>
    <div class="field"><label>Hebrew typeface</label><div class="hefonts">${HEB_FONTS.map(f => `<button class="hefont ${(state.prefs.hefont || "frank") === f.id ? "on" : ""}" data-hefont="${f.id}" aria-pressed="${(state.prefs.hefont || "frank") === f.id}"><span class="hs" lang="he" dir="rtl" style="font-family:${f.css.replace(/"/g, "&quot;")}">שְׁמַ֖ע יִשְׂרָאֵ֑ל</span><span><b>${f.name}</b><small>${f.note}</small></span></button>`).join("")}</div></div>
    <div class="field"><label>Language: reading and listening</label><div class="chips">${[["en", "English"], ["he", "Hebrew"], ["both", "Both"]].map(([v, l]) => `<button class="chip ${langPref() === v ? "on" : ""}" data-read="${v}">${l}</button>`).join("")}</div>
      <span class="note">One choice for both: English reads the translation and plays Har Bracha's English recording where there is one, and the AI voice everywhere else. Hebrew reads Rav Melamed's original and plays the Hebrew recording. Both shows the Hebrew under each English section and listens in English. ${NATIVE ? `A chapter's Hebrew text stays on the ${DEVICE} once it has loaded.` : ""}</span></div>
    ${voiceField()}
    <button class="opt" data-unplug><span class="radio ${state.prefs.unplugPause !== false ? "on" : ""}"></span><span style="flex:1"><b>Pause when headphones disconnect</b><br><span class="note">When your earbuds disconnect or you unplug headphones, playback pauses instead of carrying on through the speaker.${window.PearlsNative ? "" : " Works in the Pearls app."}</span></span></button>
    <button class="opt" data-pref="hc"><span class="radio ${state.prefs.hc ? "on" : ""}"></span><span style="flex:1"><b>High contrast</b><br><span class="note">Pure black and white, no glows</span></span></button>
    <button class="opt" data-pref="tint"><span class="radio ${state.prefs.tint ? "on" : ""}"></span><span style="flex:1"><b>Tint look-alike Hebrew letters</b><br><span class="note" lang="he">ב/כ · ד/ר · ה/ח · ו/ז · ג/נ · ס/ם</span></span></button>
    ${syncField()}
    <div class="field"><label for="meldarTpl">Open in Meldar: link pattern</label><input id="meldarTpl" placeholder="https://meldar.pages.dev/?ref={ref}" value="${esc(state.prefs.meldar)}">
      <span class="note">Use {ref} for the Sefaria reference, e.g. “Peninei Halakhah, Berakhot 4:2”. Leave empty to hide the Meldar button.</span></div>
    <p class="foot" style="margin:0">Neo-Classic S&amp;P re-spells ${LEX.length} recurring terms (${LEX.filter(e => e.st === "a").length} as Keter Shem Tob spells them, the rest derived by the same rules). Book and rabbi names keep their published spelling.</p>
    ${NATIVE ? `<a class="btn line" href="#downloads" data-credits>${DLI.get}Downloads &amp; offline</a>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><a class="btn line" href="#credits" data-credits>Credits &amp; licence</a><button class="btn gold" data-ok>Done</button></div>`, (s, close) => {
    s.querySelectorAll("[data-credits]").forEach(a => a.onclick = () => close());
    syncWire(s);
    s.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { setScheme(b.dataset.s); s.querySelectorAll("[data-s] .radio").forEach(r => r.classList.toggle("on", r.parentNode.dataset.s === scheme)); });
    $("[data-enwords]", s).onclick = () => { setEnWords(!enWords); $("[data-enwords] .radio", s).classList.toggle("on", enWords); $("[data-enwords]", s).setAttribute("aria-pressed", enWords); };
    s.querySelectorAll("[data-skin]").forEach(b => b.onclick = () => { state.prefs.skin = b.dataset.skin; if (b.dataset.skin === "daf" && !state.prefs.readSet) state.prefs.read = "both"; save.prefs(); applyPrefs(); s.querySelectorAll("[data-skin]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); }); });
    s.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { state.prefs.mode = b.dataset.mode; save.prefs(); applyPrefs(); s.querySelectorAll("[data-mode]").forEach(x => x.classList.toggle("on", x === b)); });
    s.querySelectorAll("[data-hefont]").forEach(b => b.onclick = () => { state.prefs.hefont = b.dataset.hefont; save.prefs(); applyHebFont(); s.querySelectorAll("[data-hefont]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); }); });
    s.querySelectorAll("[data-read]").forEach(b => b.onclick = () => { setLang(b.dataset.read); s.querySelectorAll("[data-read]").forEach(x => x.classList.toggle("on", x === b)); });
    wireVoiceField(s);
    s.querySelectorAll("[data-size]").forEach(b => b.onclick = () => { state.prefs.size = +b.dataset.size; save.prefs(); applyPrefs(); s.querySelectorAll("[data-size]").forEach(x => x.classList.toggle("on", x === b)); });
    $("[data-unplug]", s).onclick = () => { state.prefs.unplugPause = state.prefs.unplugPause === false; save.prefs();
      $("[data-unplug] .radio", s).classList.toggle("on", state.prefs.unplugPause); toast(state.prefs.unplugPause ? "Pauses when headphones disconnect" : "Keeps playing when headphones disconnect"); };
    s.querySelectorAll("[data-pref]").forEach(b => b.onclick = () => { const k = b.dataset.pref; state.prefs[k] = !state.prefs[k]; save.prefs(); applyPrefs(); b.querySelector(".radio").classList.toggle("on", state.prefs[k]); });
    $("[data-ok]", s).onclick = () => { state.prefs.meldar = $("#meldarTpl", s).value.trim(); save.prefs(); close(); renderMini(); render(); };
  });
}
function vLibrary() {
  setTop(null); setTab("library");
  view.innerHTML = `<div class="view">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px"><h1 class="hello">Playlists</h1>
      <button class="btn gold" data-act="newpl">${I.plus}New</button></div>
    ${NATIVE ? `<button class="panel progresslink" data-go="downloads"><span><b>Downloads</b><br><span class="note">${dlSummary()}</span></span><span class="dur">›</span></button>` : ""}
    <button class="panel progresslink" data-go="progress"><span><b>Progress</b><br><span class="note">${streak()}-day streak · ${TRACKS.filter(t => isDone(t.id)).length} chapters done · badges</span></span><span class="dur">›</span></button>
    <section><div class="sec-h"><h2>Your lists</h2></div><div class="list">${["review", "later", "liked"].map(k => { const pl = listPl(k), due = k === "review" ? state.lists.review.filter(r => r.due <= Date.now()).length : 0;
      return `<button class="trk" data-act="playlist" data-id="${k}" style="grid-template-columns:44px 1fr auto"><span class="listic ${k}">${k === "review" ? I.repeat : k === "later" ? I.clock : I.heartOn}</span>
        <div class="txt"><div class="t">${pl.name}</div><div class="m">${pl.tracks.length ? `${pl.tracks.length} chapter${pl.tracks.length > 1 ? "s" : ""}${due ? ` · ${due} due today` : ""}` : k === "review" ? "Tap Review while listening" : k === "later" ? "Tap Study later while listening" : "Tap ♥ on any chapter"}</div></div><span class="dur">›</span></button>`; }).join("")}</div></section>
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
  const own = pl.kind !== "preset" && pl.kind !== "auto" && pl.kind !== "list";
  setTop(pl.name); setTab("library");
  const ts = pl.tracks.map(i => BYID[i]).filter(Boolean);
  view.innerHTML = `<div class="view">
    <div class="vhead">${plArt(pl)}<div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <div class="eyebrow">${own ? "Your playlist" : pl.kind === "list" ? "Your list" : pl.cal ? "On the calendar" : pl.kind === "auto" ? "Made for you" : "Curated"}</div><h1>${esc(R(pl.name))}</h1>
      <div class="stats"><span>${ts.length} chapters</span><span>${mins(plDur(pl.tracks)) || "–"}</span></div></div></div>
    ${pl.blurb ? `<p class="sub" style="margin:0">${esc(pl.blurb)}</p>` : ""}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn gold" data-act="playpl" data-id="${pl.id}" ${ts.length ? "" : "disabled"}>${I.play}Play</button>
      <button class="btn ghost" data-act="shufflepl" data-id="${pl.id}" ${ts.length ? "" : "disabled"}>${I.shuffle}Shuffle</button>${dlManyButton(ts.map(t => t.id))}
      ${own ? `<button class="btn line" data-act="renamepl" data-id="${pl.id}">Rename</button><button class="btn line" data-act="delpl" data-id="${pl.id}">Delete</button>`
            : `<button class="btn line" data-act="copypl" data-id="${pl.id}">${I.plus}Save a copy</button>`}</div>
    ${ts.length ? `<div class="list">${ts.map((t, i) => trackRow(t, pl.kind === "list" ? { why: (pl.why || {})[t.id], end: `<button class="iconbtn" style="background:none;width:34px" data-act="${pl.list === "liked" ? "like" : "unlist"}" data-list="${pl.list}" data-id="${t.id}" aria-label="Remove">${I.x}</button>` } : { end: own ? `
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
    ${kindChips(KIND[state.prefs.searchKind] ? state.prefs.searchKind : "all", kindCounts(TRACKS), "skind")}
    <div class="chips" id="topics">${Object.keys(TOPIC_LABEL).filter(g => TRACKS.some(t => t.tags.includes(g))).slice(0, 24).map(g => `<button class="chip" data-tag="${g}">${esc(TOPIC_LABEL[g])}</button>`).join("")}</div>
    <div class="list" id="results"></div></div>`;
  const run = () => {
    const s = $("#q").value.trim().toLowerCase(), act = view.querySelector("#topics .chip.on");
    const k = KIND[state.prefs.searchKind] ? state.prefs.searchKind : null, okKind = t => !k || kindOf(t) === k;
    let res = [];
    if (s.length > 1) res = TRACKS.map(t => { const hay = `${t.title} ${R(t.title)} ${t.sectionTitles.join(" ")} ${t.sectionTitles.map(R).join(" ")} ${t.vol.title} ${t.tags.map(g => TOPIC_LABEL[g]).join(" ")}`.toLowerCase();
        const sc = ((t.title + " " + R(t.title)).toLowerCase().includes(s) ? 3 : 0) + (hay.includes(s) ? 1 : 0) + s.split(/\s+/).filter(w => hay.includes(w)).length * .5; return { t, sc }; })
      .filter(r => r.sc > .4).sort((a, b) => b.sc - a.sc).map(r => r.t);
    else if (act) res = TRACKS.filter(t => t.tags.includes(act.dataset.tag));
    else if (k) res = TRACKS.slice();
    res = res.filter(okKind);
    const sec = s.length > 1 ? TRACKS.flatMap(t => t.sectionTitles.map((x, i) => ({ t, x: R(x), i, raw: x })).filter(o => (o.x + ' ' + o.raw).toLowerCase().includes(s))).slice(0, 6) : [];
    $("#results").innerHTML = res.length ? res.slice(0, s.length > 1 || act ? 40 : 400).map(t => trackRow(t, { why: sec.find(o => o.t === t) ? `§${sec.find(o => o.t === t).i + 1} ${sec.find(o => o.t === t).x}` : "" })).join("")
      : (s || act ? `<div class="empty">Nothing matches “${esc(s)}”${k ? ` in ${KIND[k].label}` : ""}. Try a broader word${k ? " or All" : ""}.</div>` : `<div class="empty"><div class="em-orb"></div>Search ${TRACKS.length} chapters by title, section or topic.</div>`);
  };
  $("#q").oninput = run;
  view.querySelector(".kindchips").onclick = e => { const b = e.target.closest("[data-skind]"); if (!b) return;
    state.prefs.searchKind = b.dataset.skind; save.prefs();
    view.querySelectorAll(".kindchips .chip").forEach(c => { c.classList.toggle("on", c === b); c.setAttribute("aria-pressed", c === b); }); run(); };
  $("#topics").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; const on = b.classList.contains("on"); view.querySelectorAll("#topics .chip").forEach(c => c.classList.remove("on")); if (!on) b.classList.add("on"); $("#q").value = ""; run(); };
  run();
}

/* ---------- mini player & now playing ---------- */
const mini = $("#mini");
const PLAY_ICON_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>';
function modeToggle(m) { setPlayMode(m); renderMini(); toast(PLAY_MODES.find(x => x[0] === m)[1]); }
function mTools(t, labelled) {   // the mini player's Read along / Favorite / Playlist / More; on phones a row of its own, on wider screens beside the title
  const on = state.likes.has(t.id);
  const m = playMode(), rep = { repeatAll: ["repeat", "Repeat: the queue"], repeat1: ["repeat1", "Repeat: this chapter"], repeatSec: ["repeat1", "Repeat: this section"] }[m];
  return `<button class="${labelled ? "mreadl" : "iconbtn mread"}" data-act="readalong" data-id="${t.id}" aria-label="Read along: the text of section ${P.part + 1}" title="Read along: the text of section ${P.part + 1}">${I.read}${labelled ? "<span>Read along</span>" : ""}</button>
      <button class="iconbtn mact ${m === "shuffle" ? "on" : ""}" data-act="mshuffle" aria-pressed="${m === "shuffle"}" aria-label="Shuffle" title="Shuffle">${I.shuffle}</button>
      <button class="iconbtn mact ${rep ? "on" : ""} ${m === "repeatSec" ? "sec" : ""}" data-act="mrepeat" aria-pressed="${!!rep}" aria-label="${rep ? rep[1] : "Repeat: off"}" title="${rep ? rep[1] : "Repeat: off"}">${I[rep ? rep[0] : "repeat"]}</button>
      <button class="iconbtn mact ${m === "book" ? "on" : ""}" data-act="mbook" aria-pressed="${m === "book"}" aria-label="Continue the book, then the next book" title="Continue the book, then the next book">${PLAY_ICON_BOOK}</button>
      <button class="iconbtn mact ${on ? "on" : ""}" data-act="like" data-id="${t.id}" aria-label="Favorite" title="Favorite">${on ? I.heartOn : I.heart}</button>
      <button class="iconbtn mact" data-act="addto" data-id="${t.id}" aria-label="Add to playlist" title="Add to playlist">${I.plus}</button>
      <button class="iconbtn mact" data-act="trackmenu" data-id="${t.id}" aria-label="More: Review, Study later, Play next" title="More: Review, Study later, Play next">${I.more}</button>`;
}
function renderMini() {
  const t = cur(); mini.hidden = !t; if (!t) { document.body.classList.remove("has-mini"); return; }
  document.body.classList.add("has-mini");
  const both = hasHe(t) && (hasEn(t) || (enText(t) && aiVoiceOn()));
  mini.innerHTML = `<div class="mrow">${art(t)}<button class="txtbtn" data-act="np" aria-label="Open player"><div class="t">${esc(R(t.title))}</div><div class="m">${esc(R(t.vol.short))} · ch. ${t.n} · section ${P.part + 1} of ${nSections(t)}</div></button>
      <span class="mwide">${mTools(t)}</span>
      <button class="langpill ${both ? "" : "fixed"}" ${both ? 'data-act="audiolang"' : "disabled"} aria-label="Language: reading and listening">${P.lang === "he" ? "עב" : "EN"}</button>${P.lang === "tts" ? `<button class="aipill" data-act="voice" title="AI voice: ${esc(voiceLabel(pickVoice()))}. Tap to change">AI voice</button>` : ""}
      <button class="iconbtn mclose" data-act="closeplayer" aria-label="Close player">${I.x}</button></div>
    <div class="mtools">${mTools(t, true)}</div>
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
  paintNowSec();
  const al = $(".along"); if (al && location.hash.length < 2) al.outerHTML = alongCard() || "<span></span>";
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
    setTimeout(() => fillNPText(t, P.part), 0);
    const upnext = upcoming(3).filter(i => i !== t.id).map(i => BYID[i]).filter(Boolean), pm = PLAY_MODES.find(x => x[0] === playMode());
    npEl.innerHTML = `<div class="sheet-h"><button class="iconbtn" data-act="npclose" aria-label="Close">${I.down}</button>
        <div class="eyebrow">${P.ctx ? esc(P.ctx) : "Now playing"}</div><button class="iconbtn" data-act="trackmenu" data-id="${t.id}" aria-label="More">${I.more}</button></div>
      <div class="np">${cover(t.vol, "bigart")}
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="min-width:0"><div class="tt">${esc(R(t.title))}</div>
          <div class="vv">${esc(R(t.vol.title))} · chapter ${t.n} · <span lang="he" dir="rtl">${esc(t.vol.heb)}</span></div>
          <div class="vv" style="color:var(--gold-2)">Section ${P.part + 1} of ${nSections(t)}${t.sectionTitles[P.part] ? ` · ${esc(R(t.sectionTitles[P.part]))}` : ""}</div></div>
          <button class="iconbtn ${liked ? "on" : ""}" id="npLike" data-act="like" data-id="${t.id}" aria-label="Like">${liked ? I.heartOn : I.heart}</button></div>
        <button class="btn line readalong" data-act="readalong" data-id="${t.id}">${I.read}<span>Read along<small>${t.vol.he && !t.translated ? "The Hebrew text" : "The text"} of section ${P.part + 1}, where you are</small></span></button>
        <div><input type="range" class="seek" id="seek" min="0" step="1" aria-label="Seek"><div class="times"><span id="tCur">0:00</span><span id="tLeft">–</span></div></div>
        <div class="ctrls"><button class="sm" data-act="prev" aria-label="Previous">${I.prev}</button>
          <button class="skip" data-act="b15" aria-label="Back 15 seconds">${I.back15}</button>
          <button class="play" data-act="toggle" id="npPlay" aria-label="Play or pause">${audio.paused ? I.play : I.pause}</button>
          <button class="skip" data-act="f30" aria-label="Forward 30 seconds">${I.fwd30}</button>
          <button class="sm" data-act="next" aria-label="Next">${I.next}</button></div>
        ${langBar(t)}
        <div class="nptext" id="npText" aria-label="The text of this section"><div class="loading"><div class="spin"></div></div></div>
        <div class="np-tools"><button class="pill ${pm[0] !== "next" ? "on" : ""}" data-act="playmode">${I[pm[3]] || I.order}${pm[1]}</button>
          <button class="pill" data-act="speed" id="speedPill">${state.speed}×</button>
          <button class="pill ${P.sleepAt || P.sleepEnd ? "on" : ""}" data-act="sleep" id="sleepPill">${I.moon}${P.sleepEnd ? "End of chapter" : P.sleepAt ? "Sleep" : "Sleep timer"}</button>
          <button class="pill" data-act="addto" data-id="${t.id}">${I.plus}Playlist</button>
          <button class="pill ${liked ? "on" : ""}" data-act="like" data-id="${t.id}">${liked ? I.heartOn : I.heart}Favorite</button>
          <button class="pill ${onList("review", t.id) ? "on" : ""}" data-act="togglelist" data-list="review" data-id="${t.id}" aria-pressed="${onList("review", t.id)}">${I.repeat}Review</button>
          <button class="pill ${onList("later", t.id) ? "on" : ""}" data-act="togglelist" data-list="later" data-id="${t.id}" aria-pressed="${onList("later", t.id)}">${I.clock}Study later</button></div>
        ${upnext.length ? `<div><div class="eyebrow" style="margin-bottom:4px">Up next</div><div class="list">${upnext.map(u => trackRow(u, { openChapter: false })).join("")}</div></div>`
          : `<p class="note">${pm[0] === "repeat1" ? "This chapter will play again." : pm[0] === "repeatSec" ? "This section will play again." : "When this ends, Pearls keeps going with a recommendation."}</p>`}
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
    <button class="opt" data-a="review">${I.repeat}<b>${onList("review", id) ? "Remove from Review" : "Add to Review"}</b></button>
    <button class="opt" data-a="later">${I.clock}<b>${onList("later", id) ? "Remove from Study later" : "Study later"}</b></button>
    <button class="opt" data-a="read">${I.read}<b>${cur() && cur().id === id ? `Read along · section ${P.part + 1}` : "Read the text"}</b></button>
    <button class="opt" data-a="radio">${I.shuffle}<b>Start a mix from this chapter</b></button>
    ${NATIVE && (hasHe(t) || hasEn(t)) ? (dlState(t).s === "none" ? `<button class="opt" data-a="dl">${DLI.get}<b>Download</b></button>` : `<button class="opt" data-a="undl">${I.x}<b>Remove download</b></button>`) : ""}
    ${(state.plays[id] || {}).done ? `<button class="opt" data-a="unheard">${I.x}<b>Mark as not heard</b></button>` : ""}`, (s, close) => {
    s.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
      close(); const a = b.dataset.a;
      if (a === "playnext") { if (!cur()) playQueue([id], 0); else { P.queue.splice(P.idx + 1, 0, id); toast("Plays next"); syncNP(true); } }
      if (a === "add") addTo(id);
      if (a === "like") like(id);
      if (a === "review") toggleList("review", id);
      if (a === "later") toggleList("later", id);
      if (a === "read") { if (cur() && cur().id === id) readAlong(); else { closeNP(); go(`ch-${id}`); } }
      if (a === "radio") { playQueue([id, ...similar(t, 9).map(r => r.t.id)], 0, `Mix from ${t.title}`); toast("Mix started"); }
      if (a === "dl") { downloadTrack(t); toast(DL.prefs.wifiOnly && !online() ? "Will download when you're online" : "Downloading"); }
      if (a === "undl") { removeDownload(t); toast("Download removed"); }
      if (a === "unheard") { state.plays[id].done = false; state.plays[id].pos = 0; state.plays[id].last = Date.now(); save.plays(); render(); }
    });
  });
}
function spellingDialog() {
  const att = LEX.filter(e => e.st === "a").length, der = LEX.length - att;
  dialog(`<h3>Spelling of Hebrew words</h3>
    <p class="note" style="margin:0">Changes how Hebrew terms are spelled in titles and in the English text. The audio is unaffected.</p>
    ${Object.entries(SCHEMES).map(([k, s]) => `<button class="opt" data-s="${k}" aria-pressed="${k === scheme}">
      <span class="radio ${k === scheme ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>${esc(s.name)}</b><br><span class="note">${esc(s.sub)}</span></span></button>`).join("")}
    ${enWordsOpt()}
    <a class="btn line" href="#spelling" data-schemes>All spelling schemes, compared</a>
    <p class="foot" style="margin:0">Neo-Classic S&amp;P re-spells ${LEX.length} recurring terms: ${att} exactly as Keter Shem Tob spells them, ${der} derived by the same rules. Words outside the list keep the published spelling. Names of books and rabbis are left alone, as in the house rules.</p>`, (s, close) => {
    s.querySelectorAll("[data-s]").forEach(b => b.onclick = () => {
      setScheme(b.dataset.s); close(); renderMini(); render();
      toast(`Spelling: ${SCHEMES[scheme].name}`);
    });
    $("[data-enwords]", s).onclick = () => { setEnWords(!enWords); close(); renderMini(); render();
      toast(enWords ? "English words where the book uses them" : "Hebrew words throughout"); };
    $("[data-schemes]", s).onclick = () => close();
  });
}
/* Review (spaced: due again after 1, 3, 7, 14 and 30 days, then it leaves the list) and Study later (a reading
   list that remembers where you were). Both are device-only, like everything else. */
const REVIEW_STEPS = [1, 3, 7, 14, 30];
const onList = (k, id) => state.lists[k].some(x => x.id === id);
function toggleList(k, id) {
  const L = state.lists[k];
  if (onList(k, id)) { state.lists[k] = L.filter(x => x.id !== id); toast(k === "review" ? "Removed from Review" : "Removed from Study later"); }
  else if (k === "review") { L.push({ id, at: Date.now(), due: Date.now() + REVIEW_STEPS[0] * DAY, step: 0 }); toast("Added to Review · back tomorrow, then after 3, 7, 14 and 30 days"); }
  else { const c = cur(), here = c && c.id === id; L.push({ id, at: Date.now(), part: here ? P.part : 0, pos: here ? Math.floor(audio.currentTime) : 0 });
    toast(here ? `Study later · saved at section ${P.part + 1}` : "Added to Study later"); }
  save.lists(); paintLists(id); smartSoon();
}
function studied(id) {   // a chapter was finished (heard to the end, or ticked): advance its review, clear it from Study later
  const r = state.lists.review.find(x => x.id === id);
  if (r && r.due <= Date.now() + DAY / 2) { r.step++; if (r.step >= REVIEW_STEPS.length) state.lists.review = state.lists.review.filter(x => x !== r); else r.due = Date.now() + REVIEW_STEPS[r.step] * DAY; }
  state.lists.later = state.lists.later.filter(x => x.id !== id);
  save.lists();
}
function paintLists(id) {
  document.querySelectorAll(`[data-act="togglelist"][data-id="${id}"]`).forEach(b => { const on = onList(b.dataset.list, id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}
function listPl(k) {
  if (k === "liked") return { id: "liked", kind: "list", list: "liked", name: "Favorites", blurb: "Everything you've hearted. Your recommendations lean this way.", tracks: [...state.likes].filter(id => BYID[id]) };
  if (k === "review") {
    const L = state.lists.review.filter(r => BYID[r.id]).sort((a, b) => a.due - b.due);
    return { id: "review", kind: "list", list: "review", name: "Review", blurb: "Chapters to go over again. Each comes back after 1, 3, 7, 14 and 30 days; finish it when it's due and it moves on.", tracks: L.map(r => r.id),
      why: Object.fromEntries(L.map(r => { const d = Math.round((r.due - Date.now()) / DAY); return [r.id, `${d <= 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`} · review ${r.step + 1} of ${REVIEW_STEPS.length}`]; })) };
  }
  const L = state.lists.later.filter(x => BYID[x.id]);
  return { id: "later", kind: "list", list: "later", name: "Study later", blurb: "Saved for when you have time. Playing one starts at the section you were on; finishing it takes it off the list.", tracks: L.map(x => x.id),
    why: Object.fromEntries(L.map(x => [x.id, `Saved ${new Date(x.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${x.part ? ` · from section ${x.part + 1}` : ""}`])) };
}
function like(id) {
  state.likes.has(id) ? state.likes.delete(id) : state.likes.add(id); save.likes();
  toast(state.likes.has(id) ? "Liked · your recommendations will lean this way" : "Removed from liked");
  document.querySelectorAll(`[data-act="like"][data-id="${id}"]`).forEach(b => { const on = state.likes.has(id); b.classList.toggle("on", on); b.innerHTML = b.classList.contains("pill") ? `${on ? I.heartOn : I.heart}Favorite` : on ? I.heartOn : I.heart; });
  smartSoon();
}
let toastT;
function toast(msg) { if (window.PEARLS_LOG) window.PEARLS_LOG("toast: " + msg); document.querySelectorAll(".toast").forEach(t => t.remove()); const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }

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
    case "setread": setLang(b.dataset.v); break;
    case "voice": voiceDialog(); break;
    case "playsec": { const t = BYID[id]; const ids = TRACKS.filter(x => x.vol === t.vol).map(x => x.id); playQueue(ids, ids.indexOf(id), t.vol.title, +b.dataset.sec - 1); break; }
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
    case "resumeread": pendingSec = { id, sec: +b.dataset.sec }; go(`ch-${id}`); break;
    case "jumpsec": { const el = document.getElementById(`sec-${b.dataset.sec}`); if (el) el.scrollIntoView({ behavior: "smooth" }); break; }
    case "opensaved": { const s = state.saved[+b.dataset.i]; go(`ch-${s.ch}`); setTimeout(() => { const el = document.getElementById(`sec-${s.sec}`); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 700); break; }
    case "notesaved": { const s = state.saved[+b.dataset.i];
      dialog(`<h3>Note</h3><p class="note" style="margin:0">${esc(R(s.title))}</p><div class="field"><label for="noteTxt">Your note</label><textarea id="noteTxt" class="ta" rows="4">${esc(s.note)}</textarea></div>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn line" data-del>Remove</button><button class="btn gold" data-ok>Save</button></div>`, (d, close) => {
        $("[data-ok]", d).onclick = () => { s.note = $("#noteTxt", d).value.trim(); save.saved(); close(); render(); };
        $("[data-del]", d).onclick = () => { state.saved.splice(+b.dataset.i, 1); save.saved(); close(); render(); }; }); break; }
    case "hebsec": { const sec = b.closest("section"), slot = sec.querySelector(".hebslot");
      slot.dataset.user = 1; if (!slot.hidden) { slot.hidden = true; break; }
      slot.hidden = false; slot.innerHTML = `<div class="loading"><div class="spin"></div>טוען…</div>`;
      hebrewFor(BYID[id], +b.dataset.sec).then(h => { slot.innerHTML = `<h3>${h.title.rendered}</h3>${cleanHeb(h.content.rendered)}<p class="foot"><a href="${esc(h.link)}" target="_blank" rel="noopener">ph.yhb.org.il ↗</a></p>`; hebDone(slot, BYID[id]); })
        .catch(() => { slot.innerHTML = `<p class="note" dir="ltr">Couldn't load the Hebrew for this section. You need a connection.</p>`; }); break; }
    case "markdone": { if (state.read[id]) { delete state.read[id]; syncGoneRead(id); } else { state.read[id] = Date.now(); logDay(0, id); studied(id); } save.read(); render(); toast(state.read[id] ? "Marked as done" : "Unmarked"); break; }
    case "togglelist": toggleList(b.dataset.list, id); break;
    case "playmode": dialog(`<h3>Playback order</h3>${PLAY_MODES.map(([k, n, d, ic]) => `<button class="opt" data-m="${k}"><span class="radio ${playMode() === k ? "on" : ""}"></span><span style="flex:1;min-width:0"><b>${n}</b><br><span class="note">${d}</span></span></button>`).join("")}
      <p class="foot" style="margin:0">${NATIVE ? `Smart downloads follow this order, so what plays next is already on the ${DEVICE}.` : ""}</p>`, (s2, close) => {
        s2.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { setPlayMode(b.dataset.m); renderMini(); close(); toast(PLAY_MODES.find(x => x[0] === b.dataset.m)[1]); }); }); break;
    case "unlist": if (b.dataset.list === "liked") like(id); else { state.lists[b.dataset.list] = state.lists[b.dataset.list].filter(x => x.id !== id); save.lists(); } render(); break;
    case "audiolang": { const t = cur() || BYID[id]; setLang(t && listenLang(t) === "he" ? "en" : "he"); toast(langPref() === "he" ? "Hebrew: reading and listening" : t && listenLang(t) === "tts" ? "English: the AI voice reads it" : "English: reading and listening"); break; }
    case "dl": { const t = BYID[id], st = dlState(t);
      if (st.s === "none") { if (!DL.ok) { toast("Storage isn't available for downloads"); break; }
        downloadTrack(t); toast(DL.prefs.wifiOnly && !online() ? "Will download when you're back online" : `Downloading in ${dlLang(t) === "en" ? "English" : "Hebrew"} · about ${fmtMB(dlBytes(t, dlLang(t)))}`); }
      else dialog(`<h3>${esc(R(t.title))}</h3><p class="note" style="margin:0">${esc(dlLabel(t).text)}</p>
        <button class="opt" data-a="rm">${I.x}<b>${st.s === "done" ? "Remove download" : "Cancel download"}</b></button>
        ${st.s === "done" && hasHe(t) && hasEn(t) ? `<button class="opt" data-a="swap">${DLI.get}<b>Download the ${st.lang === "en" ? "Hebrew" : "English"} instead</b></button>` : ""}`, (s, close) => {
        s.querySelectorAll("[data-a]").forEach(o => o.onclick = () => { close();
          if (o.dataset.a === "rm") { removeDownload(t); toast("Download removed"); }
          else { downloadTrack(t, { lang: st.lang === "en" ? "he" : "en" }); toast("Downloading the other language"); } }); });
      break; }
    case "dlmany": dlMany(b.dataset.ids.split(",")); break;
    case "dlrm": removeDownload(BYID[id]); toast("Removed"); break;
    case "dlrmall": dialog(`<h3>Delete all downloads?</h3><p class="note" style="margin:0">${fmtMB(dlUsed())} of audio. The text stays.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn line" data-x>Keep them</button><button class="btn gold" data-ok>Delete</button></div>`, (s, close) => {
        $("[data-x]", s).onclick = close;
        $("[data-ok]", s).onclick = () => { close(); try { NATIVE.cancelAll(); NATIVE.remove(JSON.stringify([...DL.files.keys()])); } catch {} DL.idx = {}; saveDl(); dlRefresh(); vDownloads(); toast("Downloads deleted"); }; }); break;
    case "dlcancel": { try { NATIVE.cancelAll(); } catch {} for (const k in DL.idx) if (!isDownloaded(BYID[k] || {})) delete DL.idx[k]; saveDl(); dlRefresh(); vDownloads(); toast("Downloads cancelled"); break; }
    case "dlheb": downloadAllHebrew(); break;
    case "dlhebstop": HEALL.run = false; dlPaint(); break;
    case "dlhebclear": { try { NATIVE.clearText(); } catch {} for (const k in hebPosts) delete hebPosts[k]; vDownloads(); toast("Saved Hebrew deleted"); break; }
    case "playdl": { const ids = TRACKS.filter(isDownloaded).map(t => t.id); playQueue(ids, 0, "Downloads"); break; }
    case "like": like(id); break;
    case "toggle": toggle(); break;
    case "closeplayer": {   // stop, hide the bar; "Continue listening" on Home still remembers where you were
      audio.pause();
      const lq = store.get("lastQueue", null); if (lq) { lq.closed = true; store.set("lastQueue", lq); state.lastQueue = lq; }
      P.queue = []; P.idx = -1; P.sleepAt = null; P.sleepEnd = false;
      if ("mediaSession" in navigator) { try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; } catch {} }
      audio.removeAttribute("src"); audio.load();
      closeNP(); renderMini(); refreshPlaying(); pushMedia(); break; }
    case "next": next(true); break;
    case "prev": prev(); break;
    case "b15": audio.currentTime = Math.max(0, audio.currentTime - 15); break;
    case "f30": audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + 30); break;
    case "np": openNP(); break;
    case "npclose": history.back(); break;
    case "readalong": readAlong(); break;
    case "mshuffle": modeToggle(playMode() === "shuffle" ? "next" : "shuffle"); break;
    case "mrepeat": { const order = ["repeatAll", "repeat1", "repeatSec"], i = order.indexOf(playMode()); modeToggle(i === order.length - 1 ? "next" : order[i + 1]); break; }
    case "mbook": modeToggle(playMode() === "book" ? "next" : "book"); break;
    case "tonowsec": { const s = cur() && $(`#sec-${P.part + 1}`); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); break; }
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
  else if (h.startsWith("books-")) vBooks(h.slice(6));
  else if (h === "library") vLibrary();
  else if (h === "progress") vProgress();
  else if (h === "search") vSearch();
  else if (h === "credits") vCredits();
  else if (h === "spelling") vSpelling();
  else if (h === "calendar") vCalendar();
  else if (h === "downloads") vDownloads();
  else vHome();
  window.scrollTo(0, 0); refreshPlaying();
}
window.addEventListener("hashchange", render);
window.addEventListener("popstate", () => { if (npEl && !(history.state && history.state.np)) closeNP(); });
setInterval(() => { if (P.sleepAt) updateProgress(); }, 1000);

dlRefresh();
if (NATIVE) {   // finish downloads that completed while the app was closed; react to the connection coming and going
  window.addEventListener("online", () => { toast("Back online"); dlPoll(); smartSoon(); if (!location.hash || location.hash === "#") render(); });
  window.addEventListener("offline", () => { toast("Offline: downloaded chapters still play"); dlPaint(); if (!location.hash || location.hash === "#") render(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { dlPoll(); smartSoon(); } });
  setTimeout(() => { dlPoll(); smartSoon(0); }, 3000);
}
/* restore the last queue (paused) so the mini player is ready; sync calls it again when another device was further on */
function restoreQueue() {
  if (!(state.lastQueue && state.lastQueue.ids && state.lastQueue.ids.length && !state.lastQueue.closed)) return;
  P.queue = state.lastQueue.ids.filter(id => BYID[id]); P.idx = Math.min(state.lastQueue.idx || 0, P.queue.length - 1); P.ctx = state.lastQueue.ctx;
  if (cur()) { const p = state.plays[cur().id] || {}; P.part = !p.done && p.part != null ? Math.min(p.part, nSections(cur()) - 1) : 0;
    P.lang = playLang(cur()); audio.src = srcFor(cur(), P.part, P.lang);
    if (p.pos && !p.done) audio.addEventListener("loadedmetadata", () => { audio.currentTime = p.pos; }, { once: true }); mediaSession(cur()); }
}
restoreQueue();
applyPrefs();
renderMini();
render();
syncStart();
window.PEARLS = { SYNC, syncNow, syncPull, localDoc, applyDoc, playMode, setPlayMode, upcoming, toggleList, studied, onList, listPl, recommend, similar, TRACKS, VOLS, PRESETS, state, R, cleanHTML, setScheme, setEnWords, renderHebrewChapter, loadBook, DL, dlState, smartRun, downloadTrack, P, audio, listenLang, BYID, setLang, NE, NK, Neural };   // handy for debugging
})();
