/* Volume metadata layered on top of the extracted catalog (catalog.js -> window.PH_CATALOG).
   Audio: the Yeshivat Har Bracha recordings of the Hebrew books (read by Rav Yonadav Zer),
   one file per chapter at https://ph.yhb.org.il/mp3/BB-CC.mp3 — taken from their podcast feeds. */
window.PH_META = {
  "01": { slug: "shabbat",   short: "Shabbat",          heb: "שבת",            glyph: "ש", c1: "#2a2f7a", c2: "#7a6cf0", c3: "#1c6f8a", tags: ["shabbat"] },
  "02": { slug: "prayer",    short: "Prayer",           heb: "תפילה",          glyph: "ת", c1: "#173d5e", c2: "#3fa6c9", c3: "#1d2a52", tags: ["prayer"] },
  "03": { slug: "womens-prayer", short: "Women's Prayer", heb: "תפילת נשים",   glyph: "נ", c1: "#5a2350", c2: "#e07aa8", c3: "#2b1f55", tags: ["prayer", "women"] },
  "04": { slug: "pesach",    short: "Pesach",           heb: "פסח",            glyph: "פ", c1: "#6b2a1d", c2: "#f0a35a", c3: "#3b1c3a", tags: ["pesach", "festival"] },
  "05": { slug: "zemanim",   short: "Zemanim",          heb: "זמנים",          glyph: "ז", c1: "#2c4a2e", c2: "#9ccf6b", c3: "#1f3550", tags: ["calendar"] },
  "12": { slug: "festivals", short: "Festivals",        heb: "מועדים",         glyph: "מ", c1: "#5c3a12", c2: "#e2b65c", c3: "#2a2550", tags: ["festival"] },
  "13": { slug: "sukkot",    short: "Sukkot",           heb: "סוכות",          glyph: "ס", c1: "#1f4d3f", c2: "#d7c46a", c3: "#16304a", tags: ["sukkot", "festival"] },
  "14": { slug: "simchat-habayit", short: "Simchat Ha-bayit", heb: "שמחת הבית וברכתו", glyph: "ה", c1: "#5a1f2e", c2: "#f08a7a", c3: "#2d2150", tags: ["home", "marriage"] },
  "15": { slug: "yamim-noraim", short: "Days of Awe",   heb: "ימים נוראים",    glyph: "י", c1: "#20203f", c2: "#c9b8ff", c3: "#3e2a14", tags: ["high-holidays", "teshuva"] }
};


/* Hebrew-only books: no official English edition; English is an AI translation, labelled as such */
Object.assign(window.PH_META, {
  "10": { slug: "berakhot", short: "Berakhot", heb: "ברכות", glyph: "ב", c1: "#3d2a6b", c2: "#e2b65c", c3: "#1d3a52", tags: ["blessings"] },
  "17": { slug: "kashrut", short: "Kashrut", heb: "כשרות", glyph: "כ", c1: "#2e4a1f", c2: "#c7d36a", c3: "#4a2a1a", tags: ["kashrut"] },
  "18": { slug: "family-purity", short: "Family Purity", heb: "טהרת המשפחה", glyph: "ט", c1: "#1f3f5a", c2: "#8fd0e0", c3: "#3b2350", tags: ["marriage", "family-purity"] },
  "11": { slug: "family", short: "Family", heb: "משפחה", glyph: "מ", c1: "#5a2f1f", c2: "#f0b27a", c3: "#2a2550", tags: ["family", "home"] },
  "19": { slug: "giyur", short: "Giyur", heb: "גיור", glyph: "ג", c1: "#1f2f5a", c2: "#b9c4ff", c3: "#4a3a14", tags: ["giyur"] },
  "20": { slug: "emuna", short: "Emuna", heb: "אמונה ומצוותיה", glyph: "א", c1: "#3a1f4a", c2: "#d9a7ff", c3: "#1f3a3a", tags: ["emuna"] },
  "06": { slug: "nation-and-land", short: "Nation & Land", heb: "העם והארץ", glyph: "ע", c1: "#4a3a12", c2: "#e8c86a", c3: "#1f4a3a", tags: ["israel"] },
  "16": { slug: "sheviit", short: "Shevi'it", heb: "שביעית ויובל", glyph: "ו", c1: "#2f4a2a", c2: "#a8d98a", c3: "#4a3a1a", tags: ["israel", "shemitah"] },
  "21": { slug: "hafetzei-kodesh", short: "Ḥafetzei Kodesh", heb: "חפצי קודש", glyph: "ק", c1: "#4a1f2a", c2: "#e2a0b0", c3: "#1f2f4a", tags: ["sacred-objects"] },
  "07": { slug: "likkutim-1", short: "Likkutim I", heb: "ליקוטים א", glyph: "ל", c1: "#2a3a4a", c2: "#9fb8d0", c3: "#3a2a1a", tags: ["foundations"] },
  "08": { slug: "likkutim-2", short: "Likkutim II", heb: "ליקוטים ב", glyph: "ל", c1: "#3a2a4a", c2: "#c0a8e0", c3: "#1a3a2a", tags: ["foundations"] }
});

/* chapter durations (seconds) read from the feeds; anything missing is measured on first play */
window.PH_DUR = {
"01-01":2695,"01-02":1822,"01-03":613,"01-04":1124,"01-05":2107,"01-06":1409,"01-07":1170,"01-08":1054,"01-09":1711,"01-10":3296,"01-11":2026,"01-12":1508,
"02-01":1495,"02-02":941,"02-03":1259,"02-04":833,"02-05":1293,"02-06":1167,"02-07":355,"02-08":940,"02-09":626,"02-10":627,"02-11":1091,"02-12":828,"02-13":835,"02-14":700,"02-15":1264,
"04-01":1309,"04-02":834,"04-03":725,"04-04":1583,"04-05":690,"04-06":926,"04-07":695,"04-08":1197,"04-09":747,"04-10":1331,"04-11":897,"04-12":832,"04-13":976,"04-14":196,"04-15":1148,
"05-01":2044,"05-02":1145,"05-03":1182,"05-04":2051,"05-05":1140,"05-06":791,"05-07":1164,"05-08":2280,"05-09":674,"05-10":2138,"05-11":1427,"05-12":1544,"05-13":1405,
"12-01":2606,"12-02":1670,"12-03":1249,"12-04":1093,"12-05":1266,"12-06":790,"12-07":642,"12-08":636,"12-09":1123,"12-10":1175,"12-11":2193,"12-12":1756,"12-13":2181,
"13-01":2886,"13-02":2172,"13-03":1977,"13-04":2123,"13-05":1474,"13-06":718,"13-07":997,"13-08":741,
"14-01":1609,"14-02":3318,"14-03":2903,"14-04":1513,"14-05":3731,"14-06":969,"14-07":1031,"14-08":1313,"14-09":1684,"14-10":2018,
"15-01":1573,"15-02":1812,"15-03":2563,"15-04":2251,"15-05":1935,"15-06":2086,"15-07":2982,"15-08":1197,"15-09":838,"15-10":3472
};

/* topic tags inferred from chapter titles — drives recommendations and search */
window.PH_TAGRULES = [
  [/candle|lighting/i, "candles"], [/kiddush|wine/i, "kiddush"], [/havdala|motza/i, "havdala"],
  [/meal|seuda|se’uda|food|cook|bishul|baking|kneading|eating/i, "food"], [/\bborer\b|\bselecting\b/i, "melakhot", ["01", "12"]],
  /* melakhot = the labours forbidden on Shabbat and Yom Tov: only the Shabbat (01) and Festivals (12) volumes */
  [/\bmelakh|muktze|muktse|hotza['’]?a|carrying|\beruv|domain|electricity|\bbishul\b|kotev|mav['’]?ir|mekhabeh|tzove|ĥoresh|zore['’]?a|kotzer/i, "melakhot", ["01", "12"]],
  [/\bsick\b|\billness|\bill\b|medical|infertil|childbirth|saving lives/i, "health"],
  [/prayer|amida|shema|shemoneh|tefil|minyan|ĥazan|hazan|cantor|kaddish|kedusha|tahanun|taĥanun|blessings of|pesukei|barkhu|minĥa|minha|ma[’']?ariv|arvit|sha[ĥh]arit|musaf/i, "prayer"],
  [/rain|dew/i, "rain"], [/torah reading|reading of the torah|keri[’']?at ha-torah/i, "torah-reading"],
  [/kohen|kohanim|priestly|birkat kohanim/i, "kohanim"], [/women/i, "women"],
  [/ĥamets|hamets|chametz|hametz|leaven|kitniyot|search|bitul|selling/i, "chametz"],
  [/seder|matsa|matza|maror|haggada|four cups|afikoman/i, "seder"], [/kasher|kashering|utensil/i, "kashering"],
  [/omer/i, "omer"], [/hanuka|ĥanuka|chanuka/i, "hanukkah"], [/purim|megilla/i, "purim"],
  [/fast|tisha|three weeks|nine days|av\b|tammuz|tevet|destruction|mourning|aveilut|eikha/i, "fasts"],
  [/rosh ĥodesh|rosh hodesh|new moon|month|kiddush levana/i, "rosh-chodesh"], [/israel|independence|yom ha-?atzmaut|yom yerushalayim|yom ha-?zikaron|jerusalem/i, "israel", null, true],
  [/lag ba/i, "omer"], [/tu bi|fifteenth/i, "calendar"],
  [/yom tov|festival|ĥol ha|hol ha|intermediate/i, "yom-tov"],
  [/sukka|sukkah/i, "sukkah"], [/lulav|four species|etrog|hadas|arava|hoshana/i, "four-species"], [/simĥat torah|simhat torah|shemini/i, "simchat-torah"],
  [/shofar|rosh ha-?shana/i, "rosh-hashana"], [/yom kippur|kippur|atonement|kaparot|vidui|confession/i, "yom-kippur"],
  [/teshuva|repentance|seli[ĥh]ot|judg|ten days|elul|forgiv/i, "teshuva"],
  [/marri|wedding|husband|wife|couple|spouse|intima|onah|ona\b/i, "marriage", null, true], [/child|fertil|pregnan|birth|contracept|pru u-?rvu|be fruitful/i, "family", null, true],
  /* foundations: chapter titles only (section titles say "the reason for…" everywhere) */
  [/introduc|foundation|meaning|significan|essence|values|faith|emuna|soul|torah study|talmud torah/i, "foundations", null, true]
];

/* hand-curated preset playlists — built from title/tag rules so they stay valid against the catalog */
window.PH_PRESETS = [
  { id: "shabbat-essentials", name: "Shabbat Essentials", blurb: "Preparation, candles, kiddush, the meals and havdala: the Friday-night-to-Saturday-night arc.",
    pick: { book: "01", chapters: [1, 2, 3, 4, 6, 7, 8] } },
  { id: "elul-to-yom-kippur", name: "Elul to Yom Kippur", blurb: "Judgment, teshuva, shofar and the fast — the whole Days of Awe volume in order.",
    pick: { book: "15", all: true } },
  { id: "sukkah-season", name: "Into the Sukkah", blurb: "Meaning of the festival, building the sukka, the four species and the joy of the water-drawing.",
    pick: { book: "13", all: true } },
  { id: "pesach-countdown", name: "Pesach Countdown", blurb: "Chametz, kashering, the search and the seder, in the order you need them.",
    pick: { book: "04", all: true } },
  { id: "prayer-foundations", name: "Prayer, From the Ground Up", blurb: "What prayer is, minyan, place, preparation and kavana before the details of each service.",
    pick: { book: "02", chapters: [1, 2, 3, 4, 5, 6] } },
  { id: "the-calendar-year", name: "The Jewish Year", blurb: "Rosh Chodesh, the Omer, fast days, Chanukah and Purim — the rhythm between the big festivals.",
    pick: { book: "05", all: true } },
  { id: "home-and-love", name: "The Joyful Home", blurb: "Rav Melamed's volume on marriage, intimacy and family life.",
    pick: { book: "14", all: true } },
  { id: "short-pearls", name: "Short Pearls", blurb: "Every chapter under 15 minutes. One commute, one chapter.",
    pick: { maxSec: 900 } },
  { id: "melakhot-deep-dive", name: "The 39 Melakhot", blurb: "The working principles of Shabbat labor: cooking, sorting, preparing food and more.",
    pick: { book: "01", tag: "melakhot" } }
];
