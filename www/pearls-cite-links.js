/* pearls-cite-links.js: turns the citations in a Peninei Halakha page into links to the texts they cite.
 *
 * Pearls ships Meldar's citation grammar (meldar-cite.js) UNMODIFIED, the same way it ships
 * meldar-record.js, and this file is the thin layer that puts the grammar's answers on the page.
 * Nothing here parses a citation by itself except one thing the grammar does not do: English
 * Tanakh book names ("Exodus 20:8"), and the Spanish, Portuguese and French names the AI translations
 * use ("Éxodo 20:8", "Deuteronômio 6:5", "Psaumes 23:1"). The grammar knows Bereshit/Shemot/... only.
 *
 * Three rules carried over from Meldar, because each one cost Meldar a bug:
 *  1. The scanner is chosen from the TEXT, never from the caller's guess. Running the English
 *     scanner over Hebrew invents confident citations (Meldar F4.17).
 *  2. The section of the Shulchan Arukh comes from the chapter (secFor), and when it is our
 *     reading rather than the author's the popup says so (Meldar F4.2). A citation with no
 *     section and no chapter context is NOT linked to Orach Chayim by default.
 *  3. A citation that cannot be resolved is still marked (dotted underline) and its popup says
 *     why, rather than being silently dropped. A ref is not verified until it has been fetched,
 *     so the popup fetches before it shows text, and a failed fetch says so.
 *
 * API (window.PEARLS_CITE):
 *   find(text, opts)       -> [{start, end, text, ref, resolved, why, work, sec, secBy, internal}]
 *   linkify(root, opts)    -> number of citations marked inside a DOM element
 *   fetchSource(ref)       -> Promise<{ref, he, en, heVersion, enVersion, heLicence, enLicence, url, error}>
 *   sefariaUrl(ref), meldarUrl(ref)
 *   selftest()             -> {pass, fail, failures}
 *
 * opts: { ref: 'Peninei Halakhah, Shabbat 21:3'  (the page being read; sets the section context)
 *         onOpen(hit, event)   (Pearls' own sheet; default opens the built-in popup)
 *         onInternal(ref)      (a link to another Pearls chapter; default opens Sefaria) }
 */
(function () {
  'use strict';
  var C = function () { return window.MELDAR_CITE; };

  var TANAKH_EN = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges',
    'I Samuel', 'II Samuel', 'I Kings', 'II Kings', 'Isaiah', 'Jeremiah', 'Ezekiel', 'Hosea', 'Joel',
    'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
    'Malachi', 'Psalms', 'Proverbs', 'Job', 'Song of Songs', 'Ruth', 'Lamentations', 'Ecclesiastes',
    'Esther', 'Daniel', 'Ezra', 'Nehemiah', 'I Chronicles', 'II Chronicles'];
  var TANAKH_ALIAS = {'Deut': 'Deuteronomy', 'Deut.': 'Deuteronomy', 'Gen.': 'Genesis', 'Ex.': 'Exodus',
    'Exod.': 'Exodus', 'Lev.': 'Leviticus', 'Num.': 'Numbers', 'Ps.': 'Psalms', 'Psalm': 'Psalms',
    'Prov.': 'Proverbs', 'Isa.': 'Isaiah', 'Jer.': 'Jeremiah', 'Ezek.': 'Ezekiel', 'Eccl.': 'Ecclesiastes',
    '1 Samuel': 'I Samuel', '2 Samuel': 'II Samuel', '1 Kings': 'I Kings', '2 Kings': 'II Kings',
    '1 Chronicles': 'I Chronicles', '2 Chronicles': 'II Chronicles',
    // the AI translations (www/xl) cite Tanakh books by their Spanish, Portuguese and French names
    'Génesis': 'Genesis', 'Éxodo': 'Exodus', 'Levítico': 'Leviticus', 'Números': 'Numbers', 'Deuteronomio': 'Deuteronomy',
    'Josué': 'Joshua', 'Jueces': 'Judges', 'I Reyes': 'I Kings', 'II Reyes': 'II Kings', '1 Reyes': 'I Kings',
    '2 Reyes': 'II Kings', 'Isaías': 'Isaiah', 'Jeremías': 'Jeremiah', 'Ezequiel': 'Ezekiel', 'Oseas': 'Hosea',
    'Amós': 'Amos', 'Abdías': 'Obadiah', 'Jonás': 'Jonah', 'Miqueas': 'Micah', 'Nahúm': 'Nahum',
    'Habacuc': 'Habakkuk', 'Sofonías': 'Zephaniah', 'Hageo': 'Haggai', 'Zacarías': 'Zechariah', 'Malaquías': 'Malachi',
    'Salmos': 'Psalms', 'Salmo': 'Psalms', 'Proverbios': 'Proverbs', 'Cantar de los Cantares': 'Song of Songs', 'Rut': 'Ruth',
    'Lamentaciones': 'Lamentations', 'Eclesiastés': 'Ecclesiastes', 'Ester': 'Esther', 'Esdras': 'Ezra', 'Nehemías': 'Nehemiah',
    'I Crónicas': 'I Chronicles', 'II Crónicas': 'II Chronicles', 'Gênesis': 'Genesis', 'Êxodo': 'Exodus', 'Deuteronômio': 'Deuteronomy',
    'Juízes': 'Judges', 'I Reis': 'I Kings', 'II Reis': 'II Kings', '1 Reis': 'I Kings', '2 Reis': 'II Kings',
    'Jeremias': 'Jeremiah', 'Oseias': 'Hosea', 'Obadias': 'Obadiah', 'Jonas': 'Jonah', 'Miqueias': 'Micah',
    'Naum': 'Nahum', 'Sofonias': 'Zephaniah', 'Ageu': 'Haggai', 'Zacarias': 'Zechariah', 'Malaquias': 'Malachi',
    'Provérbios': 'Proverbs', 'Jó': 'Job', 'Cântico dos Cânticos': 'Song of Songs', 'Cânticos': 'Song of Songs', 'Rute': 'Ruth',
    'Lamentações': 'Lamentations', 'Eclesiastes': 'Ecclesiastes', 'Neemias': 'Nehemiah', 'I Crônicas': 'I Chronicles', 'II Crônicas': 'II Chronicles',
    'Genèse': 'Genesis', 'Exode': 'Exodus', 'Lévitique': 'Leviticus', 'Nombres': 'Numbers', 'Deutéronome': 'Deuteronomy',
    'Juges': 'Judges', 'I Rois': 'I Kings', 'II Rois': 'II Kings', 'Isaïe': 'Isaiah', 'Jérémie': 'Jeremiah',
    'Ézéchiel': 'Ezekiel', 'Osée': 'Hosea', 'Michée': 'Micah', 'Sophonie': 'Zephaniah', 'Aggée': 'Haggai',
    'Zacharie': 'Zechariah', 'Malachie': 'Malachi', 'Psaumes': 'Psalms', 'Proverbes': 'Proverbs', 'Cantique des Cantiques': 'Song of Songs',
    'Ecclésiaste': 'Ecclesiastes', 'Néhémie': 'Nehemiah', 'I Chroniques': 'I Chronicles', 'II Chroniques': 'II Chronicles'};
  var TANAKH_RE = (function () {
    var names = TANAKH_EN.concat(Object.keys(TANAKH_ALIAS))
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    return new RegExp('(?:^|[^A-Za-z])(' + names.join('|') + ')\\s+(\\d{1,3}):(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?', 'g');
  })();

  // Shulchan Arukh HaRav written out in full, in any of the book's spellings ("Shulḥan Arukh Ha-Rav 187:1-3").
  // The grammar reads only its abbreviation SAH and would take the full name as a bare Shulchan Arukh.
  // Sefaria holds it for Orach Chayim only (Meldar F2.8), so it is linked only when the chapter's section is OC.
  var SAH_RE = /Shul(?:ch|ḥ|h)an [ʿ’']?Ar[uo](?:kh|ch|ḥ) Ha-?Rav\s+(\d{1,3}):(\d{1,3})(?:\s*[-\u2013]\s*(\d{1,3}))?/g;

  // PH citing itself: "Peninei Halakha: Shabbat 21:8" / "Peninei Halakhah, Shabbat 21:8"
  var PH_SELF = /Peninei Hala(?:kh|ch)a?h?(?:\s*[:,]|\s+on)?\s*([A-Z][A-Za-z’' ]{2,30}?),?\s+(\d{1,2}):(\d{1,3})/g;

  // What the reader sees says "Peninei Halakha"; the ref itself keeps Sefaria's "Peninei Halakhah" for lookups.
  function shown(s) { return String(s || '').replace(/\bPeninei\s+Hala(?:kh|ch|k)(?:a|ah)\b/gi, 'Peninei Halakha'); }

  var HEB = /[֐-׿]/g;
  function isHebrew(t) {
    var m = String(t).match(HEB), letters = String(t).replace(/[\s\d\W_]/g, '').length || 1;
    return !!m && m.length / letters > 0.2;
  }

  // Pearls' book titles that Meldar's section table keys under another name
  var VOL_ALIAS = {'Giyur': 'Conversion'};

  // "Peninei Halakhah, Shabbat 21:3" -> {vol:'Shabbat', n:21}
  function pageOf(ref) {
    var m = /Peninei Halakhah?,\s*(.+?)\s+(\d{1,2})(?::\d+)?\s*$/.exec(ref || '');
    return m ? {vol: m[1], n: +m[2]} : null;
  }

  function ctxFor(opts) {
    var p = pageOf(opts && opts.ref), cite = C();
    if (!p || !cite || !cite.secFor) return {sec: null, secBy: ''};
    var s = cite.secFor(VOL_ALIAS[p.vol] || p.vol, p.n);
    return {sec: s.sec, secBy: s.by || ''};   // by '' = fallback: resolve() refuses to guess OC
  }

  // The grammar gives each citation's start and literal but not its end. The end is where the
  // location stops: for English, the last digit/amud of the location; for Hebrew, the next
  // clause break. Bounded by the next citation so two links never overlap.
  function endOf(text, c, limit, he) {
    var from = c.at + String(c.lit || '').length;
    var seg = text.slice(from, limit);
    if (!c.loc && c.form !== 'adloc') return from;
    if (!he && c.loc) {
      var nums = String(c.loc).match(/\d+[ab]?/g) || [];
      var last = nums[nums.length - 1], pos = 0, idx = -1;
      // walk the location's numbers in order so "345:5" does not stop at an earlier "5"
      for (var i = 0; i < nums.length; i++) {
        var re = new RegExp('(^|[^0-9])' + nums[i] + '(?![0-9])');
        var m = re.exec(seg.slice(pos));
        if (!m) { idx = -1; break; }
        idx = pos + m.index + m[1].length; pos = idx + nums[i].length;
      }
      if (idx >= 0 && last) return from + pos;
      return from;
    }
    var stop = seg.search(/[.;:)(\]\n]|\s[-–]\s/);
    var cut = stop < 0 ? seg : seg.slice(0, stop);
    if (cut.length > 24) cut = cut.slice(0, 24).replace(/\s+\S*$/, '');
    return from + cut.replace(/[\s,]+$/, '').length;
  }


  /* ── works the grammar does not hold: Midrash, Yerushalmi, Tosefta, Avot, Yalkut, Zohar ─────────────
   * Read BEFORE the grammar and masked, because the grammar reads their tails as something else, and
   * each misreading fetches clean: "Yerushalmi Pesachim 10:3" became Mishnah Pesachim 10:3,
   * "Zohar Bamidbar 120:2" became Numbers 120:2, "Yalkut Shimoni, Tehilim 795" became Psalms 795,
   * "Tosefta Yoma 4:1" (Hebrew) became Yoma 4a. A real passage under the wrong name is the one failure
   * these links must not have, so a work we cannot address (the Zohar by volume and page, the Mekhilta
   * by parasha) is MARKED and NAMED, never sent to the nearest thing that resolves.
   * Every ref shape below was fetched from Sefaria before it was written down (5 Nov 2026):
   * Devarim Rabbah 8:1 · Eikhah Rabbah 1:1 · Ruth Rabbah 6:4 · Shir HaShirim Rabbah 1:1 ·
   * Jerusalem Talmud Pesachim 10:3 · Tosefta Yoma 4:1 · Pirkei DeRabbi Eliezer 45 · Pesikta Rabbati 25 ·
   * Midrash Tehillim 81 · Tanna DeBei Eliyahu Rabbah 1 · Sifrei Devarim 53 · Sifrei Bamidbar 92 ·
   * Midrash Tanchuma, Kedoshim 1 (its sections are the parasha names below) · Yalkut Shimoni on Nach 795. */
  var TRACTATES = [ // [Sefaria name, Hebrew, other English spellings]
    ['Berakhot', 'ברכות'], ['Peah', 'פאה'], ['Demai', 'דמאי'], ['Kilayim', 'כלאים', 'Kilaim'],
    ['Sheviit', 'שביעית', 'Shviit'], ['Terumot', 'תרומות'], ['Maasrot', 'מעשרות', 'Maaserot'],
    ['Maaser Sheni', 'מעשר שני'], ['Challah', 'חלה'], ['Orlah', 'ערלה'], ['Bikkurim', 'ביכורים'],
    ['Shabbat', 'שבת'], ['Eruvin', 'עירובין', 'Eiruvin'], ['Pesachim', 'פסחים'], ['Shekalim', 'שקלים'],
    ['Yoma', 'יומא'], ['Sukkah', 'סוכה'], ['Beitzah', 'ביצה', 'Betzah'], ['Rosh Hashanah', 'ראש השנה'],
    ['Taanit', 'תענית'], ['Megillah', 'מגילה'], ['Moed Katan', 'מועד קטן'], ['Chagigah', 'חגיגה'],
    ['Yevamot', 'יבמות', 'Yebamot'], ['Ketubot', 'כתובות', 'Ketuvot'], ['Nedarim', 'נדרים'], ['Nazir', 'נזיר'],
    ['Sotah', 'סוטה'], ['Gittin', 'גיטין'], ['Kiddushin', 'קידושין'], ['Bava Kamma', 'בבא קמא', 'Baba Kamma'],
    ['Bava Metzia', 'בבא מציעא', 'Baba Metzia'], ['Bava Batra', 'בבא בתרא', 'Baba Batra'],
    ['Sanhedrin', 'סנהדרין'], ['Makkot', 'מכות'], ['Shevuot', 'שבועות'], ['Eduyot', 'עדיות'],
    ['Avodah Zarah', 'עבודה זרה'], ['Horayot', 'הוריות'], ['Zevachim', 'זבחים'], ['Menachot', 'מנחות'],
    ['Chullin', 'חולין'], ['Bekhorot', 'בכורות'], ['Arakhin', 'ערכין'], ['Temurah', 'תמורה'],
    ['Keritot', 'כריתות'], ['Meilah', 'מעילה'], ['Tamid', 'תמיד'], ['Middot', 'מידות'], ['Kinnim', 'קינים'],
    ['Kelim', 'כלים'], ['Oholot', 'אהלות'], ['Negaim', 'נגעים'], ['Parah', 'פרה'], ['Tahorot', 'טהרות'],
    ['Mikvaot', 'מקואות'], ['Niddah', 'נידה'], ['Makhshirin', 'מכשירין'], ['Zavim', 'זבים'],
    ['Tevul Yom', 'טבול יום'], ['Yadayim', 'ידים'], ['Oktzin', 'עוקצין']];
  var TRACT_HE_ABBR = {'בק': 'Bava Kamma', 'במ': 'Bava Metzia', 'בב': 'Bava Batra', 'עז': 'Avodah Zarah',
    'רה': 'Rosh Hashanah', 'מק': 'Moed Katan', 'מוק': 'Moed Katan', 'מעש': 'Maaser Sheni'};

  // the parashot as Sefaria names them (Midrash Tanchuma's sections), with their book of the Torah
  var PARASHOT = [
    ['Bereshit', 'בראשית', 1], ['Noach', 'נח', 1], ['Lech Lecha', 'לך לך', 1], ['Vayera', 'וירא', 1],
    ['Chayei Sara', 'חיי שרה', 1], ['Toldot', 'תולדות', 1], ['Vayetzei', 'ויצא', 1], ['Vayishlach', 'וישלח', 1],
    ['Vayeshev', 'וישב', 1], ['Miketz', 'מקץ', 1], ['Vayigash', 'ויגש', 1], ['Vayechi', 'ויחי', 1],
    ['Shemot', 'שמות', 2], ['Vaera', 'וארא', 2], ['Bo', 'בא', 2], ['Beshalach', 'בשלח', 2], ['Yitro', 'יתרו', 2],
    ['Mishpatim', 'משפטים', 2], ['Terumah', 'תרומה', 2], ['Tetzaveh', 'תצוה', 2], ['Ki Tisa', 'כי תשא', 2],
    ['Vayakhel', 'ויקהל', 2], ['Pekudei', 'פקודי', 2], ['Vayikra', 'ויקרא', 3], ['Tzav', 'צו', 3],
    ['Shmini', 'שמיני', 3], ['Tazria', 'תזריע', 3], ['Metzora', 'מצורע', 3], ['Achrei Mot', 'אחרי מות', 3],
    ['Kedoshim', 'קדושים', 3], ['Emor', 'אמור', 3], ['Behar', 'בהר', 3], ['Bechukotai', 'בחוקותי', 3],
    ['Bamidbar', 'במדבר', 4], ['Nasso', 'נשא', 4], ["Beha'alotcha", 'בהעלותך', 4], ["Sh'lach", 'שלח', 4],
    ['Korach', 'קרח', 4], ['Chukat', 'חוקת', 4], ['Balak', 'בלק', 4], ['Pinchas', 'פינחס', 4], ['Matot', 'מטות', 4],
    ['Masei', 'מסעי', 4], ['Devarim', 'דברים', 5], ['Vaetchanan', 'ואתחנן', 5], ['Eikev', 'עקב', 5],
    ["Re'eh", 'ראה', 5], ['Shoftim', 'שופטים', 5], ['Ki Teitzei', 'כי תצא', 5], ['Ki Tavo', 'כי תבוא', 5],
    ['Nitzavim', 'נצבים', 5], ['Vayeilech', 'וילך', 5], ["Ha'Azinu", 'האזינו', 5], ["V'Zot HaBerachah", 'וזאת הברכה', 5]];
  var EN_ALIAS = {'Bereishit': 'Bereshit', 'Bereishis': 'Bereshit', 'Genesis': 'Bereshit', 'Exodus': 'Shemot',
    'Leviticus': 'Vayikra', 'Numbers': 'Bamidbar', 'Deuteronomy': 'Devarim', 'Acharei Mot': 'Achrei Mot',
    'Shelach': "Sh'lach", 'Shlach': "Sh'lach", 'Shemini': 'Shmini', 'Ekev': 'Eikev', 'Naso': 'Nasso',
    'Behaalotekha': "Beha'alotcha", 'Behaalotecha': "Beha'alotcha", 'Ki Tetze': 'Ki Teitzei', 'Ki Tetzei': 'Ki Teitzei',
    'Ki Tissa': 'Ki Tisa', 'Bechukosai': 'Bechukotai', 'Toledot': 'Toldot', 'Vayeitzei': 'Vayetzei'};
  var TORAH_BOOK = ['Bereshit', 'Shemot', 'Vayikra', 'Bamidbar', 'Devarim'];
  // Nach books, for Yalkut Shimoni. "Shoftim" is ALSO a parasha, so it is ambiguous and is not linked.
  var NACH = ['Yehoshua', 'Joshua', 'Shmuel', 'Shemuel', 'Samuel', 'Melakhim', 'Melachim', 'Kings', 'Yeshayahu',
    'Isaiah', 'Yirmiyahu', 'Jeremiah', 'Yechezkel', 'Ezekiel', 'Hoshea', 'Hosea', 'Yoel', 'Joel', 'Amos', 'Ovadia',
    'Obadiah', 'Yonah', 'Jonah', 'Micha', 'Micah', 'Nachum', 'Nahum', 'Chavakuk', 'Habakkuk', 'Tzefaniah', 'Zephaniah',
    'Chaggai', 'Haggai', 'Zechariah', 'Malachi', 'Tehillim', 'Psalms', 'Mishlei', 'Proverbs', 'Iyov', 'Job',
    'Shir HaShirim', 'Song of Songs', 'Rut', 'Ruth', 'Eikhah', 'Lamentations', 'Kohelet', 'Ecclesiastes', 'Esther',
    'Daniel', 'Ezra', 'Nechemiah', 'Nehemiah', 'Divrei HaYamim', 'Chronicles'];
  var NACH_HE = ['יהושע', 'שמואל', 'מלכים', 'ישעיה', 'ירמיה', 'יחזקאל', 'הושע', 'יואל', 'עמוס', 'עובדיה', 'יונה',
    'מיכה', 'נחום', 'חבקוק', 'צפניה', 'חגי', 'זכריה', 'מלאכי', 'תהלים', 'משלי', 'איוב', 'שיר השירים', 'רות',
    'איכה', 'קהלת', 'אסתר', 'דניאל', 'עזרא', 'נחמיה', 'דברי הימים'];

  // Spelling-insensitive keys. English: ḥ is ch, kh is ch, doubled letters are one, a final h goes, and
  // vowels go after the first letter (y stays: Vaera and Vayera are two parashot). Hebrew: matres lectionis
  // (ו, י) and quote marks go, so חוקת/חקת and ביכורים/בכורים meet.
  function foldEn(s) {
    s = String(s).replace(/[ḥĥḤĤ]/g, 'ch').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/h\b/g, '').replace(/[^a-z]/g, '').replace(/kh/g, 'ch').replace(/(.)\1+/g, '$1');
    return s.charAt(0) + s.slice(1).replace(/[aeiou]/g, '');
  }
  function foldHe(s) { return String(s).replace(/[^א-ת]/g, '').replace(/^ו(?=.)/, '').replace(/(?!^)[וי]/g, ''); }
  function index(rows, keyFn) { var m = {}; rows.forEach(function (r) { m[keyFn(r)] = r; }); return m; }
  var TR_EN = {}, TR_HE = {}, PAR_EN = {}, PAR_HE = {};
  // tractates keep their vowels: without them Sheviit and Shevuot are one key
  function foldTr(s) { return String(s).replace(/[ḥĥḤĤ]/g, 'ch').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/h\b/g, '').replace(/[^a-z]/g, '').replace(/kh/g, 'ch').replace(/(.)\1+/g, '$1'); }
  TRACTATES.forEach(function (r) { TR_EN[foldTr(r[0])] = r[0]; if (r[2]) TR_EN[foldTr(r[2])] = r[0]; TR_HE[foldHe(r[1])] = r[0]; });
  Object.keys(TRACT_HE_ABBR).forEach(function (k) { TR_HE[k] = TRACT_HE_ABBR[k]; });
  PARASHOT.forEach(function (r) { PAR_EN[foldEn(r[0])] = r; PAR_HE[foldHe(r[1])] = r; });
  Object.keys(EN_ALIAS).forEach(function (k) { PAR_EN[foldEn(k)] = PAR_EN[foldEn(EN_ALIAS[k])]; });
  var NACH_KEYS = index(NACH, foldEn), NACH_HE_KEYS = index(NACH_HE, foldHe);
  function tractEn(s) { return TR_EN[foldTr(s)] || ''; }
  var TR_HE_EXACT = {}; TRACTATES.forEach(function (r) { TR_HE_EXACT[r[1].replace(/\s+/g, '')] = r[0]; });
  // exact spelling first: folding matres makes שביעית and שבועות one key, and they are two tractates
  function tractHe(s) { var k = String(s).replace(/[\s"״]/g, ''); return TR_HE_EXACT[k] || TRACT_HE_ABBR[k] || TR_HE[foldHe(s)] || ''; }
  function parEn(s) { return PAR_EN[foldEn(s)] || null; }
  function parHe(s) { return PAR_HE[foldHe(s)] || null; }
  function num(s) { var c = C(); var n = c && c.gematria ? c.gematria(String(s).replace(/["״׳']/g, '')) : 0; return n > 0 ? n : 0; }

  var RABBAH = {'bereshit': 'Bereshit', 'bereishit': 'Bereshit', 'bereishis': 'Bereshit', 'reishit': 'Bereshit',
    'genesis': 'Bereshit', 'shemot': 'Shemot', 'exodus': 'Shemot', 'vayikra': 'Vayikra', 'leviticus': 'Vayikra',
    'bamidbar': 'Bamidbar', 'numbers': 'Bamidbar', 'devarim': 'Devarim', 'deuteronomy': 'Devarim',
    'kohelet': 'Kohelet', 'koheles': 'Kohelet', 'ecclesiastes': 'Kohelet', 'rut': 'Ruth', 'ruth': 'Ruth',
    'eicha': 'Eikhah', 'eichah': 'Eikhah', 'eikha': 'Eikhah', 'eikhah': 'Eikhah', 'lamentations': 'Eikhah',
    'esther': 'Esther', 'shirhashirim': 'Shir HaShirim', 'hashirim': 'Shir HaShirim', 'songofsongs': 'Shir HaShirim'};
  var RABBAH_HE = {'בראשית': 'Bereshit', 'בר': 'Bereshit', 'שמות': 'Shemot', 'שמור': 'Shemot', 'ויקרא': 'Vayikra',
    'ויקר': 'Vayikra', 'במדבר': 'Bamidbar', 'במר': 'Bamidbar', 'דברים': 'Devarim', 'דבר': 'Devarim',
    'קהלת': 'Kohelet', 'קהר': 'Kohelet', 'רות': 'Ruth', 'רור': 'Ruth', 'איכה': 'Eikhah', 'איכר': 'Eikhah',
    'אסתר': 'Esther', 'אסתר2': 'Esther', 'שיר השירים': 'Shir HaShirim', 'שהשר': 'Shir HaShirim'};

  var CAP = "[A-Z][A-Za-zḥĥḤĤ’'\\-]+", NAME1 = '(' + CAP + '(?:\\s+' + CAP + ')?)';
  var SEC = '(?:§\\s*|chapter\\s+|piska\\s+|siman\\s+)?';
  var HN = '([א-ת]{1,3}(?:["״][א-ת])?|[א-ת][׳\'])(?![א-ת])';   // a Hebrew numeral, checked by gematria()
  function named(why) { return {resolved: false, why: why}; }
  function linked(ref, work) { return {resolved: true, ref: ref, work: work}; }
  var ZOHAR_WHY = 'Sefaria numbers the Zohar by parasha, not by volume and page, so this reference is not linked.';

  var EN_RULES = [
    [/\b(Bereishit|Bereshit|Bereishis|Reishit|Genesis|Shemot|Exodus|Vayikra|Leviticus|Bamidbar|Numbers|Devarim|Deuteronomy|Kohelet|Koheles|Ecclesiastes|Ruth|Rut|Eichah?|Eikhah?|Lamentations|Esther|Shir Ha-?[Ss]hirim|Ha-?[Ss]hirim|Song of Songs) Rabb(?:a|ah)\b(?:[,\s]*\(?\s*(?:parashah?\s+|chapter\s+|§\s*)?(\d{1,3})(?:\s*:\s*(\d{1,3}))?)?/g,
      function (m) {
        var b = RABBAH[m[1].toLowerCase().replace(/[^a-z]/g, '')];
        if (!b || !m[2]) return null;
        return linked(b + ' Rabbah ' + m[2] + (m[3] ? ':' + m[3] : ''), b + ' Rabbah');
      }],
    [new RegExp('\\b(?:Talmud\\s+)?(?:Yerushalmi|Jerusalem Talmud)\\b[,\\s]*\\(?\\s*(?:Tractate\\s+)?' + NAME1 +
      '[,\\s]+(?:(\\d{1,2})\\s*:\\s*(\\d{1,2})|chapter\\s+(\\d{1,2}),?\\s*halac?k?hah?\\s+(\\d{1,2}))', 'g'),
      function (m) {
        var t = tractEn(m[1]), c = m[2] || m[4], h = m[3] || m[5];
        if (!t) return named('This is the Jerusalem Talmud, and we could not read the name of the tractate.');
        return linked('Jerusalem Talmud ' + t + ' ' + c + ':' + h, 'Jerusalem Talmud');
      }],
    [/\b(?:Pirkei\s+|Pirkey\s+)?Avot\b[,\s]*\(?\s*(\d{1,2})\s*:\s*(\d{1,2})/g,
      function (m) { return +m[1] <= 6 ? linked('Pirkei Avot ' + m[1] + ':' + m[2], 'Pirkei Avot') : null; }],
    [/\bPirkei\s+(?:De-?\s*|D[’'])(?:Rabbi|Rebbe|R\.)\s*Eliezer\b[,\s]*\(?\s*(?:§\s*|chapter\s+)?(\d{1,2})/g,
      function (m) { return linked('Pirkei DeRabbi Eliezer ' + m[1], 'Pirkei DeRabbi Eliezer'); }],
    [/\bPesikta\s+Rabbati\b[,\s]*\(?\s*(?:§\s*|chapter\s+|piska\s+)?(\d{1,3})/g,
      function (m) { return linked('Pesikta Rabbati ' + m[1], 'Pesikta Rabbati'); }],
    [/\bMidrash\s+Tehil+im\b[,\s]*\(?\s*(?:§\s*|chapter\s+|Psalm\s+)?(\d{1,3})/g,
      function (m) { return linked('Midrash Tehillim ' + m[1], 'Midrash Tehillim'); }],
    [/\bTanna\s+De-?\s*[vVbB]ei\s+Eliyahu(?:\s+(Rabb(?:a|ah)|Zuta))?\b[,\s]*\(?\s*(?:§\s*|chapter\s+)?(\d{1,2})/g,
      function (m) {
        if (m[1] && /^Rabb/.test(m[1])) return linked('Tanna DeBei Eliyahu Rabbah ' + m[2], 'Tanna DeBei Eliyahu');
        return named('Tanna De-vei Eliyahu has two parts (Rabbah and Zuta), and this reference does not say which.');
      }],
    [new RegExp('\\bTosefta\\b[,\\s]*\\(?\\s*' + NAME1 + '[,\\s]+(?:(\\d{1,2})\\s*:\\s*(\\d{1,2})|chapter\\s+(\\d{1,2}),?\\s*halac?k?hah?\\s+(\\d{1,2}))', 'g'),
      function (m) {
        var t = tractEn(m[1]);
        return t ? linked('Tosefta ' + t + ' ' + (m[2] || m[4]) + ':' + (m[3] || m[5]), 'Tosefta')
          : named('This is the Tosefta, and we could not read the name of the tractate.');
      }],
    [new RegExp('\\bSifr(?:ei|e|i)\\b[,\\s]*\\(?\\s*' + NAME1 + '[,\\s]+' + SEC + '(\\d{1,3})', 'g'),
      function (m) {
        var p = parEn(m[1]), bk = p ? p[2] : 0;
        if (bk === 4) return linked('Sifrei Bamidbar ' + m[2], 'Sifrei');
        if (bk === 5) return linked('Sifrei Devarim ' + m[2], 'Sifrei');
        return named('Sifrei covers Bamidbar and Devarim, and we could not tell which part this is.');
      }],
    [new RegExp('\\b(?:Midrash\\s+)?Tanc?huma\\b[,\\s]*\\(?\\s*(Buber[,\\s]+)?' + NAME1 + '[,\\s]+' + SEC + '(\\d{1,2})', 'g'),
      function (m) {
        var p = parEn(m[2]);
        if (m[1]) return named('This is the Buber edition of Tanchuma, which numbers its sections differently.');
        return p ? linked('Midrash Tanchuma, ' + p[0] + ' ' + m[3], 'Midrash Tanchuma')
          : named('We could not read the parasha in this Tanchuma reference.');
      }],
    [new RegExp('\\bYalkut\\s+Shimoni\\b[,\\s]*\\(?\\s*(?:on\\s+)?' + NAME1 + '[,\\s]+' + SEC + '(\\d{1,4})', 'g'),
      function (m) {
        var k = foldEn(m[1]);
        if (k === foldEn('Shoftim')) return named('Shoftim is both a parasha and a book of Nach, so we cannot tell which part of the Yalkut this is.');
        if (NACH_KEYS[k] || k === foldEn('Nach')) return linked('Yalkut Shimoni on Nach ' + m[2], 'Yalkut Shimoni');
        if (parEn(m[1]) || k === foldEn('Torah')) return linked('Yalkut Shimoni on Torah ' + m[2], 'Yalkut Shimoni');
        return named('We could not tell whether this is the Yalkut on the Torah or on Nach.');
      }],
    [/\b(?:Tikkunei\s+)?Zohar\b(?:\s+(?:Chadash|Ĥadash|Ḥadash|HaKadosh))?[,\s(]*(?:part\s+\d|[IV]{1,3}\b|[123]\b)?[,\s]*(?:[A-Z][A-Za-z’'\-]+\s+)?\d{1,3}(?:[:.]\d{1,3})?[ab]?(?:[:.]\d{1,3})?/g,
      function () { return named(ZOHAR_WHY); }],
    [/\b(?:Mekh?c?h?ilta)\b(?:\s+(?:[Dd]e-?\s*Rabbi\s+\w+|[Dd]e-?Rashbi))?[,\s(]*(?:[A-Z][A-Za-z’'\-]+\s+)?\d{1,3}(?::\d{1,3})?/g,
      function () { return named('The Mekhilta is cited here by parasha, which Sefaria does not number this way, so it is not linked.'); }],
    [/\bMidrash\s+Zuta\b[,\s(]*[A-Z][A-Za-z’'\-]+\s+\d{1,3}(?::\d{1,3})?/g,
      function () { return named('Sefaria does not hold Midrash Zuta in a form this reference can address.'); }]
  ];

  var TRACT_ALT = TRACTATES.map(function (r) { return r[1]; }).sort(function (a, b) { return b.length - a.length; }).join('|');
  var HE_LOC = '(?:' + HN + '\\s*,\\s*' + HN + '|פ["״]?([א-ת]{1,2})\\s+ה["״]?([א-ת]{1,2})|פרק\\s+' + HN + '\\s+הלכה\\s+' + HN + ')';
  function heLoc(m, i) {   // m[i..i+5] are the three alternatives' pairs
    for (var k = i; k < i + 6; k += 2) if (m[k]) { var a = num(m[k]), b = num(m[k + 1]); return a && b ? a + ':' + b : ''; }
    return '';
  }
  var HE_TRACT = '(' + TRACT_ALT + '|ב["״]ק|ב["״]מ|ב["״]ב|ע["״]ז|ר["״]ה|מו["״]ק|מ["״]ק)';
  var HE_RULES = [
    [new RegExp('(?:^|[^א-ת])[ובלה]?(?:תלמוד\\s+)?(?:ירושלמי|ירוש[\'׳])\\s*\\(?\\s*(?:מסכת\\s+)?' + HE_TRACT + '\\s*' + HE_LOC, 'g'),
      function (m) {
        var t = tractHe(m[1]), l = heLoc(m, 2);
        if (!l) return null;
        return t ? linked('Jerusalem Talmud ' + t + ' ' + l, 'Jerusalem Talmud') : named('This is the Jerusalem Talmud, and we could not read the name of the tractate.');
      }],
    [new RegExp('(?:^|[^א-ת])[ובלה]?(?:תוספתא|תוספ[\'׳])\\s*\\(?\\s*(?:מסכת\\s+)?' + HE_TRACT + '\\s*' + HE_LOC, 'g'),
      function (m) {
        var t = tractHe(m[1]), l = heLoc(m, 2);
        if (!l) return null;
        return t ? linked('Tosefta ' + t + ' ' + l, 'Tosefta') : named('This is the Tosefta, and we could not read the name of the tractate.');
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:(בראשית|שמות|ויקרא|במדבר|דברים|קהלת|רות|איכה|אסתר|שיר השירים)\\s+רבה|(ב["״]ר|שמו["״]ר|ויק["״]ר|במ["״]ר|דב["״]ר|קה["״]ר|רו["״]ר|איכ["״]ר|שהש["״]ר))\\s*\\(?\\s*(?:פרשה\\s+|פ["״]\\s*)?' + HN + '(?:\\s*,\\s*' + HN + ')?', 'g'),
      function (m) {
        var b = RABBAH_HE[m[1] || String(m[2]).replace(/["״]/g, '')], a = num(m[3]), c = m[4] ? num(m[4]) : 0;
        if (!b || !a || (m[4] && !c)) return null;
        return linked(b + ' Rabbah ' + a + (c ? ':' + c : ''), b + ' Rabbah');
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:פרקי\\s+)?אבות\\s*\\(?\\s*(?:' + HN + '\\s*,\\s*' + HN + '|פ["״]?([א-ת])\\s+מ["״]?([א-ת]{1,2}))', 'g'),
      function (m) {
        var a = num(m[1] || m[3]), b = num(m[2] || m[4]);
        return a && b && a <= 6 ? linked('Pirkei Avot ' + a + ':' + b, 'Pirkei Avot') : null;
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:פרקי\\s+ד(?:רבי|ר[\'׳])\\s+אליעזר|פרקי\\s+דר["״]א|פדר["״]א)\\s*\\(?\\s*(?:פרק\\s+|פ["״]?)?' + HN, 'g'),
      function (m) { var a = num(m[1]); return a ? linked('Pirkei DeRabbi Eliezer ' + a, 'Pirkei DeRabbi Eliezer') : null; }],
    [new RegExp('(?:^|[^א-ת])[ובל]?פסיקתא\\s+רבתי\\s*\\(?\\s*(?:פיסקא\\s+|פסקא\\s+|פרשה\\s+)?' + HN, 'g'),
      function (m) { var a = num(m[1]); return a ? linked('Pesikta Rabbati ' + a, 'Pesikta Rabbati') : null; }],
    [new RegExp('(?:^|[^א-ת])[ובל]?מדרש\\s+תהלים\\s*\\(?\\s*(?:מזמור\\s+)?' + HN, 'g'),
      function (m) { var a = num(m[1]); return a ? linked('Midrash Tehillim ' + a, 'Midrash Tehillim') : null; }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:תנא\\s+דבי\\s+אליהו|תדב["״]א)(?:\\s+(רבה|זוטא))?\\s*\\(?\\s*(?:פרק\\s+|פ["״]?)?' + HN, 'g'),
      function (m) {
        var a = num(m[2]); if (!a) return null;
        return m[1] === 'רבה' ? linked('Tanna DeBei Eliyahu Rabbah ' + a, 'Tanna DeBei Eliyahu')
          : named('Tanna De-vei Eliyahu has two parts (Rabbah and Zuta), and this reference does not say which.');
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?ספרי\\s+([א-ת]+(?:\\s+[א-ת]+)?)\\s+(?:פיסקא\\s+|פסקא\\s+|פ["״])?' + HN + '(\\s*,\\s*[א-ת]{1,3}["״]?[א-ת]?)?', 'g'),
      function (m) {
        var a = num(m[2]); if (!a) return null;
        if (m[3]) return named('This cites the Sifrei by the verse it comments on, not by its piska, so it is not linked.');
        var p = parHe(m[1]) || parHe(m[1].split(/\s+/)[0]), bk = p ? p[2] : 0;
        if (bk === 4) return linked('Sifrei Bamidbar ' + a, 'Sifrei');
        if (bk === 5) return linked('Sifrei Devarim ' + a, 'Sifrei');
        return null;
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:מדרש\\s+)?תנחומא\\s*(\\(?בובר\\)?\\s*)?([א-ת]+(?:\\s+[א-ת]+)?)\\s+(?:סימן\\s+|ס["״]?)?' + HN, 'g'),
      function (m) {
        var a = num(m[3]); if (!a) return null;
        var p = parHe(m[2]) || parHe(m[2].split(/\s+/)[0]);
        if (!p) return null;
        if (m[1]) return named('This is the Buber edition of Tanchuma, which numbers its sections differently.');
        return linked('Midrash Tanchuma, ' + p[0] + ' ' + a, 'Midrash Tanchuma');
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:ילקוט\\s+שמעוני|ילקו["״]ש|ילק["״]ש|יל["״]ש)\\s*\\(?\\s*([א-ת]+(?:\\s+[א-ת]+)?)?\\s*,?\\s*(?:רמז\\s+)?' + HN, 'g'),
      function (m) {
        var a = num(m[2]); if (!a) return null;
        var w = m[1] || '', first = w.split(/\s+/)[0];
        if (!w) return named('We could not tell whether this is the Yalkut on the Torah or on Nach.');
        if (foldHe(first) === foldHe('שופטים')) return named('Shoftim is both a parasha and a book of Nach, so we cannot tell which part of the Yalkut this is.');
        if (NACH_HE_KEYS[foldHe(w)] || NACH_HE_KEYS[foldHe(first)]) return linked('Yalkut Shimoni on Nach ' + a, 'Yalkut Shimoni');
        if (parHe(w) || parHe(first)) return linked('Yalkut Shimoni on Torah ' + a, 'Yalkut Shimoni');
        return null;
      }],
    [new RegExp('(?:^|[^א-ת])[ובל]?(?:(?:תיקוני\\s+)?(?:זוהר|זהר)(?:\\s+חדש)?\\s*\\(?\\s*(?:ח["״]([אבג])|חלק\\s+[אבג][\'׳]?)\\s*,?\\s*(?:[א-ת]+\\s+)?' + HN + '(?:\\s*,\\s*' + HN + ')?|(?:תיקוני\\s+)?זוהר(?:\\s+חדש)?\\s*\\(?\\s*(?:[א-ת]+\\s+)?' + HN + '\\s*,\\s*' + HN + ')', 'g'),
      function (m) { var a = num(m[2] || m[4]); return a ? named(ZOHAR_WHY) : null; }],
    [new RegExp('(?:^|[^א-ת])[ובל]?מכילתא(?:\\s+דרשב["״]י|\\s+דר["״]י|\\s+דרבי\\s+[א-ת]+)?\\s*\\(?\\s*(?:[א-ת]+\\s+)?' + HN + '(?:\\s*,\\s*' + HN + ')?', 'g'),
      function (m) {
        var a = num(m[1]);
        return a ? named('The Mekhilta is cited here by parasha, which Sefaria does not number this way, so it is not linked.') : null;
      }]
  ];


  /* ── Hebrew forms the grammar does not read (2026-11-16) ─────────────────────────────────────────────
   * Found by running every chapter of the Hebrew text through find() and listing what was left over
   * (tools/cite_audit.js). Every ref shape below was fetched from Sefaria before it was written down
   * (16 Nov 2026). Three kinds of fix:
   *  1. heNormalize(): rewrites a form into one the grammar already reads, keeping a map back to the
   *     original text so the link still covers what the reader sees. ע"ז יג, א -> עבודה זרה יג, א;
   *     בעבודה זרה -> ב עבודה זרה (the grammar does not peel a prefix off a tractate); א"ר -> אליה רבה.
   *  2. HE_WORKS: rules for works the grammar does not hold, read before it and masked, like the
   *     midrash rules above. A work Sefaria divides in a way the citation does not say (the Or Zarua's
   *     volume, the Tashbetz's part) is not guessed.
   *  3. Pearls' own chapters: "לעיל ג, ד" / "להלן ג, ד" is this volume, chapter 3 section 4, and
   *     "פנה"ל כשרות יב, א" is another volume of Peninei Halakha. Both open that chapter in Pearls.
   * Not done, on purpose: a bare section in brackets "(יו"ד יז)" is NOT read as the Shulchan Arukh. In
   * the footnotes it is just as often the section of the work named before the bracket ("משכנות יעקב
   * (יו"ד יז)"), so reading it as the Shulchan Arukh would send a real passage under the wrong name. */
  var HE_TR_ABBR = {'ע"ז': 'עבודה זרה', 'ב"מ': 'בבא מציעא', 'ב"ב': 'בבא בתרא', 'ב"ק': 'בבא קמא',
    'מו"ק': 'מועד קטן', 'ר"ה': 'ראש השנה'};
  var HE_WORK_ABBR = {'א"ר': 'אליה רבה', 'חכ"א': 'חכמת אדם', 'מג"א': 'מגן אברהם'};
  var HN_SRC = '[א-ת]{1,3}(?:["״][א-ת])?|[א-ת][׳\']';
  var HE_NORM = (function () {
    var tr = TRACTATES.map(function (r) { return r[1]; }).sort(function (a, b) { return b.length - a.length; }).join('|');
    var ab = Object.keys(HE_TR_ABBR).map(function (k) { return k.replace('"', '["״]'); }).join('|');
    var wk = Object.keys(HE_WORK_ABBR).map(function (k) { return k.replace('"', '["״]'); }).join('|');
    return [
      // a tractate (or its abbreviation) with a prefix, or an abbreviation alone, before a folio "יג, א"
      [new RegExp('(^|[^א-ת"״\'׳])([ובלה]{0,2})(' + tr + '|' + ab + ')(?=\\s+(?:' + HN_SRC + ')\\s*,\\s*[אב](?![א-ת]))', 'g'),
        function (m) {
          var name = m[3].replace('״', '"'), full = HE_TR_ABBR[name] || m[3];
          if (!m[2] && full === m[3]) return null;
          return m[1] + (m[2] ? m[2] + ' ' : '') + full;
        }],
      // a work's abbreviation the grammar does not hold, before a siman and se'if
      [new RegExp('(^|[^א-ת"״\'׳])([ובלה]?)(' + wk + ')(?=\\s+(?:' + HN_SRC + ')(?:\\s*,\\s*(?:' + HN_SRC + '))?(?![א-ת]))', 'g'),
        function (m) { return m[1] + (m[2] ? m[2] + ' ' : '') + HE_WORK_ABBR[m[3].replace('״', '"')]; }]
    ];
  })();
  // returns {t, at(i)}: the rewritten text and a function from a position in it to one in the original
  function heNormalize(text) { return normalize(text, HE_NORM); }
  function normalize(text, rules) {
    var edits = [];
    rules.forEach(function (rule) {
      var re = rule[0], m; re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var s = m.index, e = s + m[0].length, rep = rule[1](m), src = m[0];
        if (rep != null) {   // only the part that changes is an edit, so the boundary and prefix map one to one
          var k = 0; while (k < src.length && k < rep.length && src.charAt(k) === rep.charAt(k)) k++;
          s += k; src = src.slice(k); rep = rep.slice(k);
          var j = 0; while (j < src.length && j < rep.length && src.charAt(src.length - 1 - j) === rep.charAt(rep.length - 1 - j)) j++;
          e -= j; rep = rep.slice(0, rep.length - j);
        }
        if (rep != null && s < e && rep !== m[0] && !edits.some(function (x) { return s < x.e && e > x.s; })) edits.push({s: s, e: e, rep: rep});
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });
    if (!edits.length) return {t: text, at: function (i) { return i; }};
    edits.sort(function (a, b) { return a.s - b.s; });
    var out = '', map = [], pos = 0;
    edits.forEach(function (x) {
      for (; pos < x.s; pos++) { map.push(pos); out += text.charAt(pos); }
      for (var k = 0; k < x.rep.length; k++) map.push(x.s + Math.min(x.e - x.s - 1, Math.floor(k * (x.e - x.s) / x.rep.length)));
      out += x.rep; pos = x.e;
    });
    for (; pos < text.length; pos++) { map.push(pos); out += text.charAt(pos); }
    map.push(text.length);
    // a position that is the END of a rewritten span maps to the end of the original span
    var ends = {}; edits.forEach(function (x) { ends[x.s] = x; });
    return {t: out, at: function (i, isEnd) {
      if (i <= 0) return 0;
      if (i >= map.length) return text.length;
      if (isEnd) { var p = map[i - 1]; var ed = edits.filter(function (x) { return p >= x.s && p < x.e; })[0]; return ed ? ed.e : p + 1; }
      return map[i];
    }};
  }

  // Tanakh in Hebrew: "דברים יא, יב". Books that need a part (שמואל, מלכים, דברי הימים) are linked only
  // with it; the chapter must exist in that book.
  var TANAKH_HE = [['בראשית', 'Genesis', 50], ['שמות', 'Exodus', 40], ['ויקרא', 'Leviticus', 27], ['במדבר', 'Numbers', 36],
    ['דברים', 'Deuteronomy', 34], ['יהושע', 'Joshua', 24], ['שופטים', 'Judges', 21], ['ישעיהו', 'Isaiah', 66], ['ישעיה', 'Isaiah', 66],
    ['ירמיהו', 'Jeremiah', 52], ['ירמיה', 'Jeremiah', 52], ['יחזקאל', 'Ezekiel', 48], ['הושע', 'Hosea', 14], ['יואל', 'Joel', 4],
    ['עמוס', 'Amos', 9], ['עובדיה', 'Obadiah', 1], ['יונה', 'Jonah', 4], ['מיכה', 'Micah', 7], ['נחום', 'Nahum', 3],
    ['חבקוק', 'Habakkuk', 3], ['צפניה', 'Zephaniah', 3], ['חגי', 'Haggai', 2], ['זכריה', 'Zechariah', 14], ['מלאכי', 'Malachi', 3],
    ['תהלים', 'Psalms', 150], ['תהילים', 'Psalms', 150], ['משלי', 'Proverbs', 31], ['איוב', 'Job', 42], ['שיר השירים', 'Song of Songs', 8],
    ['רות', 'Ruth', 4], ['איכה', 'Lamentations', 5], ['קהלת', 'Ecclesiastes', 12], ['אסתר', 'Esther', 10], ['דניאל', 'Daniel', 12],
    ['עזרא', 'Ezra', 10], ['נחמיה', 'Nehemiah', 13]];
  var TANAKH_HE_PART = [['שמואל', 'Samuel', [31, 24]], ['מלכים', 'Kings', [22, 25]], ['דברי הימים', 'Chronicles', [29, 36]]];
  var TNK_HE = {}; TANAKH_HE.forEach(function (r) { TNK_HE[r[0]] = r; });
  var TNK_HE_P = {}; TANAKH_HE_PART.forEach(function (r) { TNK_HE_P[r[0]] = r; });

  // Mishneh Torah books by their Hebrew names and the footnotes' abbreviations
  var MT_HE = {'יסודי התורה': 'Foundations of the Torah', 'יסוה"ת': 'Foundations of the Torah', 'יסה"ת': 'Foundations of the Torah',
    'דעות': 'Human Dispositions', 'דיעות': 'Human Dispositions', 'תלמוד תורה': 'Torah Study', 'ת"ת': 'Torah Study',
    'עבודה זרה': 'Foreign Worship and Customs of the Nations', 'ע"ז': 'Foreign Worship and Customs of the Nations',
    'עבודת כוכבים': 'Foreign Worship and Customs of the Nations', 'עכו"ם': 'Foreign Worship and Customs of the Nations',
    'תשובה': 'Repentance', 'קריאת שמע': 'Reading the Shema', 'ק"ש': 'Reading the Shema',
    'תפילה': 'Prayer and the Priestly Blessing', 'תפלה': 'Prayer and the Priestly Blessing',
    'תפילין': 'Tefillin, Mezuzah and the Torah Scroll', 'תפילין ומזוזה וספר תורה': 'Tefillin, Mezuzah and the Torah Scroll',
    'מזוזה': 'Tefillin, Mezuzah and the Torah Scroll', 'ספר תורה': 'Tefillin, Mezuzah and the Torah Scroll',
    'ציצית': 'Fringes', 'ברכות': 'Blessings', 'מילה': 'Circumcision', 'שבת': 'Sabbath', 'עירובין': 'Eruvin',
    'שביתת עשור': 'Rest on the Tenth of Tishrei', 'שביתת יום טוב': 'Rest on a Holiday', 'יום טוב': 'Rest on a Holiday', 'יו"ט': 'Rest on a Holiday',
    'חמץ ומצה': 'Leavened and Unleavened Bread', 'שופר וסוכה ולולב': 'Shofar, Sukkah and Lulav', 'שופר': 'Shofar, Sukkah and Lulav',
    'סוכה': 'Shofar, Sukkah and Lulav', 'לולב': 'Shofar, Sukkah and Lulav', 'שקלים': 'Sheqel Dues',
    'קידוש החודש': 'Sanctification of the New Month', 'תעניות': 'Fasts', 'מגילה וחנוכה': 'Scroll of Esther and Hanukkah',
    'חנוכה': 'Scroll of Esther and Hanukkah', 'מגילה': 'Scroll of Esther and Hanukkah', 'אישות': 'Marriage', 'גירושין': 'Divorce',
    'יבום וחליצה': 'Levirate Marriage and Release', 'נערה בתולה': 'Virgin Maiden', 'סוטה': 'Woman Suspected of Infidelity',
    'איסורי ביאה': 'Forbidden Intercourse', 'איסו"ב': 'Forbidden Intercourse', 'א"ב': 'Forbidden Intercourse',
    'מאכלות אסורות': 'Forbidden Foods', 'מאכלות אסורים': 'Forbidden Foods', 'מאכ"א': 'Forbidden Foods', 'מ"א': 'Forbidden Foods',
    'שחיטה': 'Ritual Slaughter', 'שבועות': 'Oaths', 'נדרים': 'Vows', 'נזירות': 'Nazariteship', 'ערכין וחרמין': 'Appraisals and Devoted Property',
    'כלאים': 'Diverse Species', 'מתנות עניים': 'Gifts to the Poor', 'מ"ע': 'Gifts to the Poor', 'תרומות': 'Heave Offerings', 'מעשר': 'Tithes', 'מעשרות': 'Tithes',
    'מעשר שני ונטע רבעי': "Second Tithes and Fourth Year's Fruit", 'מעשר שני': "Second Tithes and Fourth Year's Fruit",
    'ביכורים': 'First Fruits and other Gifts to Priests Outside the Sanctuary', 'בכורים': 'First Fruits and other Gifts to Priests Outside the Sanctuary',
    'שמיטה ויובל': 'Sabbatical Year and the Jubilee', 'שמיטה': 'Sabbatical Year and the Jubilee', 'שמו"י': 'Sabbatical Year and the Jubilee',
    'בית הבחירה': 'The Chosen Temple', 'כלי המקדש': 'Vessels of the Sanctuary and Those Who Serve Therein',
    'ביאת המקדש': 'Admission into the Sanctuary', 'איסורי מזבח': 'Things Forbidden on the Altar', 'מעשה הקרבנות': 'Sacrificial Procedure',
    'תמידין ומוספין': 'Daily Offerings and Additional Offerings', 'פסולי המוקדשין': 'Sacrifices Rendered Unfit',
    'עבודת יום הכיפורים': 'Service on the Day of Atonement', 'מעילה': 'Trespass', 'קרבן פסח': 'Paschal Offering', 'חגיגה': 'Festival Offering',
    'בכורות': 'Firstlings', 'שגגות': 'Offerings for Unintentional Transgressions', 'תמורה': 'Substitution', 'טומאת מת': 'Defilement by a Corpse',
    'פרה אדומה': 'Red Heifer', 'מקואות': 'Immersion Pools', 'מקוואות': 'Immersion Pools', 'כלים': 'Vessels',
    'נזקי ממון': 'Damages to Property', 'גניבה': 'Theft', 'גזילה ואבידה': 'Robbery and Lost Property', 'גזלה ואבדה': 'Robbery and Lost Property',
    'חובל ומזיק': 'One Who Injures a Person or Property', 'רוצח ושמירת הנפש': 'Murderer and the Preservation of Life', 'רוצח': 'Murderer and the Preservation of Life',
    'רוצח וש"נ': 'Murderer and the Preservation of Life', 'מכירה': 'Sales', 'זכייה ומתנה': 'Ownerless Property and Gifts', 'שכנים': 'Neighbors',
    'שלוחין ושותפין': 'Agents and Partners', 'עבדים': 'Slaves', 'שכירות': 'Hiring', 'שאלה ופיקדון': 'Borrowing and Deposit',
    'מלוה ולוה': 'Creditor and Debtor', 'מלווה ולווה': 'Creditor and Debtor', 'טוען ונטען': 'Plaintiff and Defendant', 'נחלות': 'Inheritances',
    'סנהדרין': 'The Sanhedrin and the Penalties within Their Jurisdiction', 'עדות': 'Testimony', 'ממרים': 'Rebels', 'אבל': 'Mourning', 'אבלות': 'Mourning',
    'מלכים': 'Kings and Wars', 'מלכים ומלחמות': 'Kings and Wars', 'מלכים ומלחמותיהם': 'Kings and Wars'};
  var MT_HE_ALT = Object.keys(MT_HE).sort(function (a, b) { return b.length - a.length; })
    .map(function (k) { return k.replace(/"/g, '["״]'); }).join('|');
  function mtHe(s) { return MT_HE[String(s).replace(/״/g, '"')] || ''; }

  // Peninei Halakha's own volumes in Hebrew -> the names Pearls uses for them (www/sefaria.js)
  var PH_VOL_HE = {'שבת': 'Shabbat', 'תפילה': 'Prayer', 'תפילת נשים': "Women's Prayer", 'פסח': 'Pesach', 'זמנים': 'Zemanim',
    'מועדים': 'Festivals', 'סוכות': 'Sukkot', 'שמחת הבית וברכתו': "Simchat Habayit U'Virkhato", 'ימים נוראים': 'Days of Awe',
    'ברכות': 'Berakhot', 'משפחה': 'Family', 'טהרת המשפחה': 'Family Purity', 'כשרות': 'Kashrut', 'ליקוטים א': 'Likkutim I',
    'ליקוטים ב': 'Likkutim II', 'שביעית ויובל': 'Shemitah and Yovel', 'העם והארץ': 'The Nation and the Land',
    'אמונה ומצוותיה': 'Emunah Umitzvoteha', 'אמונה ומצוותיהָ': 'Emunah Umitzvoteha', 'גיור': 'Giyur'};
  var PH_VOL_HE_ALT = Object.keys(PH_VOL_HE).sort(function (a, b) { return b.length - a.length; }).join('|');
  // these titles are Peninei Halakha's alone, so they are read even without פנה"ל in front
  var PH_VOL_HE_OWN = 'שמחת הבית וברכתו|שביעית ויובל|אמונה ומצוותיה|טהרת המשפחה';

  var SECN = {'או"ח': 'OC', 'יו"ד': 'YD', 'אה"ע': 'EH', 'חו"מ': 'HM'};
  var SEC_EN = {OC: 'Orach Chayim', YD: "Yoreh De'ah", EH: 'Even HaEzer', HM: 'Choshen Mishpat'};
  var HSEC = '(?:(או["״]ח|יו["״]ד|אה["״]ע|חו["״]מ)\\s+)?';
  function secOf(s) { return s ? SECN[String(s).replace('״', '"')] : ''; }
  // the section: the citation's own, else the chapter's (and the popup says that part is our reading)
  function heSec(mark, ctx, allowed) {
    var s = secOf(mark), by = 'cite';
    if (!s && ctx && ctx.secBy) { s = ctx.sec; by = ctx.secBy; }
    if (!s || (allowed && allowed.indexOf(s) < 0)) return null;
    return {sec: s, by: by};
  }
  function onSec(base, w, sp, ctx, allowed, pair) {
    var s = heSec(sp, ctx, allowed);
    if (!s) return named(w + ' is divided by section of the Shulchan Arukh, and neither this citation nor this chapter says which.');
    var r = linked(base.replace('{sec}', SEC_EN[s.sec]) + ' ' + pair, w); r.sec = s.sec; r.secBy = s.by; return r;
  }
  function pair(a, b) { var x = num(a), y = b ? num(b) : 0; return x && (!b || y) ? x + (y ? ':' + y : '') : ''; }

  var P = '(?:^|[^א-ת"״\'׳])[ובלה]?';
  var HP = '(' + HN_SRC + ')(?![א-ת])';                         // one Hebrew numeral
  var HPAIR = HP + '\\s*,\\s*' + HP;
  var SIM = '(?:סי(?:מן|[\'׳])\\s*|ס["״]\\s*)?';
  var HE_WORKS = [
    // Tanakh: "דברים יא, יב", "שמואל א ב, ג"
    [new RegExp('(?:^|[^א-ת"״\'׳])[ובל]{0,2}(' + TANAKH_HE.map(function (r) { return r[0]; }).sort(function (a, b) { return b.length - a.length; }).join('|') + ')\\s+' + HPAIR, 'g'),
      function (m) {
        var b = TNK_HE[m[1]], c = num(m[2]), v = num(m[3]);
        if (!b || !c || !v || c > b[2] || v > 176) return null;
        return linked(b[1] + ' ' + c + ':' + v, b[1]);
      }],
    [new RegExp('(?:^|[^א-ת"״\'׳])[ובל]{0,2}(שמואל|מלכים|דברי הימים)\\s+([אב])[\'׳]?\\s+' + HPAIR, 'g'),
      function (m) {
        var b = TNK_HE_P[m[1]], part = m[2] === 'א' ? 0 : 1, c = num(m[3]), v = num(m[4]);
        if (!b || !c || !v || c > b[2][part] || v > 176) return null;
        return linked((part ? 'II ' : 'I ') + b[1] + ' ' + c + ':' + v, b[1]);
      }],
    // Mishnah when the footnote says so: "משנה שביעית ב, י"
    [new RegExp(P + '(?:ב?משנה|מתני[\'׳])\\s+(?:מסכת\\s+)?(' + TRACT_ALT + ')\\s+' + HPAIR, 'g'),
      function (m) { var t = tractHe(m[1]), c = num(m[2]), h = num(m[3]); return t && c && h && c <= 30 ? linked('Mishnah ' + t + ' ' + c + ':' + h, 'Mishnah') : null; }],
    // Rambam by book: "רמב"ם הל' איסורי ביאה ה, ג", "רמב"ם איסו"ב ה, ג"
    [new RegExp(P + '(?:ה?רמב["״]ם|משנה תורה)\\s*,?\\s*(?:(?:הל[\'׳]|הלכות)\\s+)?(' + MT_HE_ALT + ')\\s+' + HPAIR, 'g'),
      function (m) { var b = mtHe(m[1]), c = num(m[2]), h = num(m[3]); return b && c && h ? linked('Mishneh Torah, ' + b + ' ' + c + ':' + h, 'Mishneh Torah') : null; }],
    // Shibbolei HaLeket
    [new RegExp(P + '(?:שבולי|שבלי)\\s+הלקט\\s*,?\\s*' + SIM + HP, 'g'),
      function (m) { var n = num(m[1]); return n ? linked('Shibbolei HaLeket ' + n, 'Shibbolei HaLeket') : null; }],
    // Terumat HaDeshen: the responsa (Part I) unless the footnote says פסקים
    [new RegExp(P + '(?:תרומת\\s+הדשן|תרוה["״]ד)\\s*,?\\s*(פסקים\\s*,?\\s*|ח["״]ב\\s*,?\\s*)?' + SIM + HP, 'g'),
      function (m) { var n = num(m[2]); return n ? linked('Terumat HaDeshen, Part ' + (m[1] ? 'II ' : 'I ') + n, 'Terumat HaDeshen') : null; }],
    // Minchat Chinukh by mitzvah (before Sefer HaChinukh)
    [new RegExp(P + 'מנחת\\s+חינוך\\s+(?:מצו?וה\\s+)?' + HP, 'g'),
      function (m) { var n = num(m[1]); return n && n <= 613 ? linked('Minchat Chinukh ' + n, 'Minchat Chinukh') : null; }],
    [new RegExp(P + '(?:ספר\\s+)?החינוך\\s+(?:מצו?וה\\s+)?' + HP, 'g'),
      function (m) { var n = num(m[1]); return n && n <= 613 && /["״]|מצו|ספר/.test(m[0]) ? linked('Sefer HaChinukh ' + n, 'Sefer HaChinukh') : null; }],
    // Kuzari
    [new RegExp(P + 'ה?כוזרי\\s+(?:מאמר\\s+)?' + HPAIR, 'g'),
      function (m) { var a = num(m[1]), b = num(m[2]); return a && b && a <= 5 ? linked('Kuzari ' + a + ':' + b, 'Kuzari') : null; }],
    // Guide for the Perplexed: "מו"נ ג, מא", "מורה נבוכים ח"ג פרק מא"
    [new RegExp(P + '(?:מו["״]נ|מורה\\s+(?:ה)?נבוכים)\\s+(?:' + HPAIR + '|ח["״]([אבג])\\s*(?:,\\s*)?(?:פרק\\s+|פ["״]?)?' + HP + ')', 'g'),
      function (m) { var a = num(m[1] || m[3]), b = num(m[2] || m[4]); return a && b && a <= 3 ? linked('Guide for the Perplexed, Part ' + a + ' ' + b, 'Guide for the Perplexed') : null; }],
    // Tashbetz (four parts; Sefaria's fourth part is one block, so only I-III)
    [new RegExp(P + 'תשב["״]ץ\\s+(?:' + HPAIR + '|ח["״]([אבגד])\\s*,?\\s*' + SIM + HP + ')', 'g'),
      function (m) {
        var a = num(m[1] || m[3]), b = num(m[2] || m[4]);
        if (!a || !b) return null;
        return a <= 3 ? linked('Sefer HaTashbetz, Part ' + ['I', 'II', 'III'][a - 1] + ' ' + b, 'Tashbetz')
          : named('Sefaria holds the fourth part of the Tashbetz as one block, without its simanim, so this is not linked.');
      }],
    [new RegExp(P + 'תשב["״]ץ\\s+' + SIM + HP, 'g'),
      function (m) { return num(m[1]) ? named('The Tashbetz has four parts, and this citation does not say which.') : null; }],
    // Pri Chadash: Sefaria has only his notes on the Rambam's Sefer HaMadda (four books), not his work on the
    // Shulchan Arukh, which is what most citations mean
    [new RegExp(P + '(?:פר["״]ח|פרי\\s+חדש)\\s+(?:(?:הל[\'׳]|הלכות)\\s+)?(יסודי התורה|יסוה["״]ת|יסה["״]ת|דעות|תלמוד תורה|ת["״]ת|עבודה זרה|ע["״]ז)\\s+' + HPAIR, 'g'),
      function (m) {
        var b = {'יסודי התורה': 'Foundations of the Torah', 'דעות': 'Human Dispositions', 'תלמוד תורה': 'Torah Study',
          'עבודה זרה': 'Foreign Worship and Customs of the Nations'}[m[1]] ||
          ({'יסוה"ת': 'Foundations of the Torah', 'יסה"ת': 'Foundations of the Torah', 'ת"ת': 'Torah Study',
            'ע"ז': 'Foreign Worship and Customs of the Nations'})[m[1].replace(/״/g, '"')];
        var c = num(m[2]), h = num(m[3]);
        return b && c && h ? linked('Peri Chadash on Mishneh Torah, ' + b + ' ' + c + ':' + h, 'Peri Chadash') : null;
      }],
    [new RegExp(P + '(?:פר["״]ח|פרי\\s+חדש)\\s+(?:(?:או["״]ח|יו["״]ד|אה["״]ע|חו["״]מ)\\s+)?' + SIM + HP + '(?:\\s*,\\s*' + HP + ')?', 'g'),
      function (m) { return num(m[1]) ? Object.assign(named('Sefaria has the Pri Chadash only on the Rambam’s Sefer HaMadda, not on the Shulchan Arukh, which is what this cites.'), {work: 'Pri Chadash'}) : null; }],
    // works Sefaria does not have (checked against its full title list, 16 Nov 2026): marked, not missed
    [new RegExp(P + '(שבט\\s+הלוי|ברכ["״]י|ברכי\\s+יוסף|מנחת\\s+שלמה|מנח["״]י|מנחת\\s+יצחק)\\s+(?:ח["״][א-ת]\\s*,?\\s*|(?:או["״]ח|יו["״]ד|אה["״]ע|חו["״]מ)\\s+)?' + SIM + HP + '(?:\\s*,\\s*' + HP + ')?', 'g'),
      function (m) {
        var w = /^שבט/.test(m[1]) ? 'Shevet HaLevi' : /^ברכ/.test(m[1]) ? 'Birkei Yosef' : /שלמה/.test(m[1]) ? 'Minchat Shlomo' : 'Minchat Yitzchak';
        return num(m[2]) ? Object.assign(named(w + ' is not on Sefaria (checked against its full title list, 16 Nov 2026), so this is named rather than linked.'), {work: w}) : null;
      }],
    // Shmonah Kevatzim
    [new RegExp(P + 'שמונה\\s+קבצים\\s+' + HPAIR, 'g'),
      function (m) { var a = num(m[1]), b = num(m[2]); return a && b && a <= 8 ? linked('Shmonah Kevatzim ' + a + ':' + b, 'Shmonah Kevatzim') : null; }],
    // Rivash
    [new RegExp(P + '(?:שו["״]ת\\s+)?ריב["״]ש\\s*,?\\s*' + SIM + HP, 'g'),
      function (m) { var n = num(m[1]); return n ? linked('Teshuvot HaRivash ' + n, 'Rivash') : null; }],
    // Keset HaSofer
    [new RegExp(P + 'קסת\\s+הסופר\\s+' + HPAIR, 'g'),
      function (m) { var a = num(m[1]), b = num(m[2]); return a && b ? linked('Keset HaSofer ' + a + ':' + b, 'Keset HaSofer') : null; }],
    // responsa cited by siman
    [new RegExp(P + 'שו["״]ת\\s+(מהרי["״]ל|מהרש["״]ל)\\s*,?\\s*' + SIM + HP, 'g'),
      function (m) { var n = num(m[2]), w = /רי/.test(m[1]) ? 'Teshuvot Maharil' : 'Teshuvot Maharshal'; return n ? linked(w + ' ' + n, w) : null; }],
    [new RegExp(P + '(?:שו["״]ת\\s+)?מהרש["״]ם\\s+(?:' + HPAIR + '|ח["״]([א-ט])\\s*,?\\s*' + SIM + HP + ')', 'g'),
      function (m) {
        var a = num(m[1] || m[3]), b = num(m[2] || m[4]); if (!a || !b) return null;
        return a <= 3 ? linked('Teshuvot Maharsham Volume ' + ['I', 'II', 'III'][a - 1] + ' ' + b, 'Maharsham')
          : named('Sefaria holds the first three volumes of the Maharsham’s responsa, not this one.');
      }],
    [new RegExp(P + '(?:שו["״]ת\\s+)?מלמד\\s+להועיל\\s+(?:' + HPAIR + '|ח["״]([אבג])\\s*,?\\s*' + SIM + HP + ')', 'g'),
      function (m) {
        var a = num(m[1] || m[3]), b = num(m[2] || m[4]);
        return a && b && a <= 3 ? linked("Melamed Leho'il Part " + ['I', 'II', 'III'][a - 1] + ' ' + b, "Melamed Leho'il") : null;
      }],
    [new RegExp(P + '(?:שו["״]ת\\s+)?בנין\\s+ציון\\s+(?:ח["״]א\\s*,?\\s*)?' + SIM + HP + '(?!\\s*,\\s*' + HN_SRC + ')', 'g'),
      function (m) { var n = num(m[1]); return n && !/ח["״]ב/.test(m[0]) ? linked('Binyan Tziyon ' + n, 'Binyan Tziyon') : null; }],
    // codes and commentaries cited by siman (and section)
    [new RegExp(P + '(?:ספר\\s+)?סמ["״]ק\\s*,?\\s*(?:מצו?וה\\s+)?' + SIM + HP, 'g'),
      function (m) { var n = num(m[1]); return n ? linked('Sefer Mitzvot Katan ' + n, 'Semak') : null; }],
    [new RegExp(P + '(?:ספר\\s+)?סמ["״]ג\\s*,?\\s*(עשין|עשה|לאוין|ל["״]ת|לא\\s+תעשה)\\s+' + HP, 'g'),
      function (m) { var n = num(m[2]), pos = /עש/.test(m[1]); return n ? linked('Sefer Mitzvot Gadol, ' + (pos ? 'Positive' : 'Negative') + ' Commandments ' + n, 'Semag') : null; }],
    [new RegExp(P + '(?:ספר\\s+)?יראים\\s*,?\\s*' + SIM + HP, 'g'),
      function (m) { var n = num(m[1]); return n && /ספר|סי|["״]/.test(m[0]) ? linked('Sefer Yereim ' + n, 'Yereim') : null; }],
    [new RegExp(P + 'אור\\s+זרוע\\s+(?:' + HPAIR + '|ח["״]([א-ד])\\s*,?\\s*(?:הל[\'׳]\\s+[א-ת]+\\s+)?' + SIM + HP + ')', 'g'),
      function (m) {
        var a = num(m[1] || m[3]), b = num(m[2] || m[4]); if (!a || !b) return null;
        return a <= 2 ? linked('Or Zarua, Volume ' + (a === 1 ? 'I' : 'II') + ' ' + b, 'Or Zarua')
          : named('Sefaria holds the first two volumes of the Or Zarua, not this one.');
      }],
    [new RegExp(P + 'כל\\s?בו\\s*,?\\s*' + SIM + HP, 'g'),
      function (m) { var n = num(m[1]); return n && /כלבו|סי|["״]/.test(m[0]) ? linked('Kol Bo ' + n, 'Kol Bo') : null; }],
    [new RegExp(P + 'מסילת\\s+ישרים\\s*,?\\s*(?:פרק\\s+|פ["״])?' + HP, 'g'),
      function (m) { var n = num(m[1]); return n && n <= 26 ? linked('Mesillat Yesharim ' + n, 'Mesillat Yesharim') : null; }],
    [new RegExp(P + 'ספר\\s+חסידים\\s*,?\\s*' + SIM + HP, 'g'),
      function (m) { var n = num(m[1]); return n ? linked('Sefer Chasidim ' + n, 'Sefer Chasidim') : null; }],
    [new RegExp(P + '(?:אבות\\s+ד(?:רבי|ר[\'׳])\\s+נתן|אדר["״]נ)\\s+' + HPAIR, 'g'),
      function (m) { var a = num(m[1]), b = num(m[2]); return a && b ? linked('Avot DeRabbi Natan ' + a + ':' + b, 'Avot DeRabbi Natan') : null; }],
    [new RegExp(P + '(?:קצות\\s+החושן|קצוה["״]ח|קצות)\\s+(?:חו["״]מ\\s+)?' + HPAIR, 'g'),
      function (m) { var p = pair(m[1], m[2]); return p ? linked('Ketzot HaChoshen on Shulchan Arukh, Choshen Mishpat ' + p, 'Ketzot HaChoshen') : null; }],
    [new RegExp(P + 'מחצית\\s+השקל\\s+(?:או["״]ח\\s+)?' + HPAIR, 'g'),
      function (m) { var p = pair(m[1], m[2]); return p ? linked('Machatzit HaShekel on Orach Chayim ' + p, 'Machatzit HaShekel') : null; }],
    [new RegExp(P + 'מטה\\s+אפרים\\s+' + HPAIR, 'g'),
      function (m) { var p = pair(m[1], m[2]); return p ? linked('Mateh Efrayim ' + p, 'Mateh Efrayim') : null; }],
    // ...and those divided by section, which takes the citation's own section or else the chapter's
    [new RegExp(P + '(?:באר\\s+היטב|באה["״]ט)\\s+' + HSEC + HPAIR, 'g'),
      function (m, ctx) { var p = pair(m[2], m[3]); return p ? onSec("Ba'er Hetev on Shulchan Arukh, {sec}", "Ba'er Hetev", m[1], ctx, null, p) : null; }],
    [new RegExp(P + '(?:פתחי\\s+תשובה|פת["״]ש)\\s+' + HSEC + HPAIR, 'g'),
      function (m, ctx) { var p = pair(m[2], m[3]); return p ? onSec('Pitchei Teshuva on Shulchan Arukh, {sec}', 'Pitchei Teshuva', m[1], ctx, ['YD', 'EH', 'HM'], p) : null; }],
    [new RegExp(P + 'דרכי\\s+משה\\s+' + HSEC + HP + '(?:\\s*,\\s*' + HP + ')?', 'g'),
      function (m, ctx) { var p = pair(m[2], m[3]); return p ? onSec('Darkhei Moshe, {sec}', 'Darkhei Moshe', m[1], ctx, null, p) : null; }],
    [new RegExp(P + 'פרישה\\s+' + HSEC + HPAIR, 'g'),
      function (m, ctx) { var p = pair(m[2], m[3]); return p ? onSec('Prisha, {sec}', 'Prisha', m[1], ctx, null, p) : null; }],
    // Peri Megadim: Eshel Avraham is on Orach Chayim only; Mishbetzot Zahav on OC and YD; Siftei Da'at on YD
    [new RegExp(P + '(?:פמ["״]ג|פרי\\s+מגדים)\\s*,?\\s*' + HSEC + '(א["״]א|אשל\\s+אברהם|מ["״]ז|משבצות\\s+זהב|ש["״]ד|שפתי\\s+דעת)\\s+' + HSEC + HPAIR, 'g'),
      function (m, ctx) {
        var p = pair(m[4], m[5]); if (!p) return null;
        var part = /^א|^אשל/.test(m[2]) ? 'Eshel Avraham' : /^ש/.test(m[2]) ? "Siftei Da'at" : 'Mishbezot Zahav';
        var allowed = part === 'Eshel Avraham' ? ['OC'] : part === "Siftei Da'at" ? ['YD'] : ['OC', 'YD'];
        var s = heSec(m[1] || m[3], ctx, allowed);
        if (!s && allowed.length === 1) s = {sec: allowed[0], by: 'work'};
        if (!s) return named('The Peri Megadim’s Mishbetzot Zahav is on Orach Chayim and Yoreh De’ah, and neither this citation nor this chapter says which.');
        var r = linked('Peri Megadim on ' + SEC_EN[s.sec] + ', ' + part + ' ' + p, 'Peri Megadim'); r.sec = s.sec; r.secBy = s.by; return r;
      }]
  ];

  // Pearls' own chapters in Hebrew: "לעיל ג, ד" (this volume) and "פנה"ל כשרות יב, א" (another one)
  var PH_HE_RULES = [
    [new RegExp('(?:^|[^א-ת"״\'׳])[ו]?(?:כמבואר\\s+|ראו\\s+|ועי[\'׳]\\s+|עי[\'׳]\\s+)?(?:ל?עיל|ל?הלן)\\s+(?:פרק\\s+)?' + HPAIR, 'g'),
      function (m, ctx, page) {
        var c = num(m[1]), s = num(m[2]);
        if (!page || !c || !s || c > 40) return null;
        return {resolved: true, internal: true, ref: 'Peninei Halakhah, ' + page.vol + ' ' + c + ':' + s, work: 'Peninei Halakha'};
      }],
    [new RegExp('(?:^|[^א-ת"״\'׳])[ובל]?(?:(?:פנה["״]ל|פניני\\s+הלכה)\\s*,?\\s*(' + PH_VOL_HE_ALT + ')|(' + PH_VOL_HE_OWN + '))\\s+' + HP + '(?:\\s*,\\s*' + HP + ')?', 'g'),
      function (m) {
        var v = PH_VOL_HE[m[1] || m[2]], c = num(m[3]), s = m[4] ? num(m[4]) : 1;
        if (!v || !c || !s || c > 40) return null;
        return {resolved: true, internal: true, ref: 'Peninei Halakhah, ' + v + ' ' + c + ':' + s, work: 'Peninei Halakha'};
      }]
  ];


  /* ── English forms the grammar does not read (2026-11-16) ────────────────────────────────────────────
   * Found the same way as the Hebrew ones: every chapter of the official English and of the AI
   * translations run through find(), and the leftovers listed (tools/cite_audit.js). Every ref shape
   * below was fetched from Sefaria before it was written down (16 Nov 2026).
   *  1. EN_NORM (through normalize(), like heNormalize): Ĥ/ĥ become Ḥ/ḥ (the official English uses both);
   *     a tractate spelled another way before a folio becomes Sefaria's spelling ("Avoda Zara 5b",
   *     "Menaḥot 65b", "Rosh Ha-shana 16b"); "Arukh Ha-shulḥan", "Biur Halakha".
   *  2. EN_WORKS: the Rambam by "Hilkhot X" / "Laws of X" (with or without "Rambam"/"MT"), Tanakh in
   *     transliteration, a Mishnah, and works the grammar does not hold. A "Laws of X" after ANOTHER
   *     author ("Agur, Laws of Tzitzit 27") is not the Rambam and is left alone.
   *  3. Works Sefaria does not have are MARKED and NAMED when they carry a location. */
  function foldMT(s) {
    return String(s).replace(/[ḥĥ]/g, 'ch').replace(/[ḤĤ]/g, 'Ch').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\bthe\b|\band\b|\bof\b/g, ' ').replace(/h\b/g, '').replace(/[^a-z]/g, '')
      .replace(/kh/g, 'ch').replace(/(.)\1+/g, '$1');
  }
  var FT = 'Foundations of the Torah', HD = 'Human Dispositions', FW = 'Foreign Worship and Customs of the Nations',
    PR = 'Prayer and the Priestly Blessing', TM = 'Tefillin, Mezuzah and the Torah Scroll', SH = 'Shofar, Sukkah and Lulav',
    ME = 'Scroll of Esther and Hanukkah', FI = 'Forbidden Intercourse', FF = 'Forbidden Foods', ST = "Second Tithes and Fourth Year's Fruit",
    BK = 'First Fruits and other Gifts to Priests Outside the Sanctuary', SY = 'Sabbatical Year and the Jubilee',
    MU = 'Murderer and the Preservation of Life', KW = 'Kings and Wars', RH = 'Rest on a Holiday';
  var MT_EN = {};
  [[FT, 'Yesodei Ha-Torah', 'Yesodei HaTorah', 'Foundations of the Torah', 'the Foundations of the Torah'],
    [HD, "De'ot", 'Deot', 'Dei\'ot', 'Character Traits', 'Dispositions', 'Human Dispositions', 'Ethics'],
    ['Torah Study', 'Talmud Torah', 'Torah Study'],
    [FW, 'Avoda Zara', 'Avodah Zarah', 'Avodat Kokhavim', 'Avodat Kochavim', 'Idolatry', 'Idol Worship', 'Foreign Worship'],
    ['Repentance', 'Teshuva', 'Repentance'], ['Reading the Shema', "Keri'at Shema", 'Kriat Shema', 'Keriat Shema', 'Keri’at Shema', 'Reading the Shema'],
    [PR, 'Tefilla', 'Tefila', 'Tefillah', 'Tefilla U-Nesi\'at Kapayim', 'Prayer'],
    [TM, 'Tefillin', 'Mezuza', 'Mezuzah', 'Sefer Torah', 'Tefillin U-Mezuza Ve-Sefer Torah', 'Torah Scroll', 'Mezuzah and Torah Scroll'],
    ['Fringes', 'Tzitzit', 'Fringes'], ['Blessings', 'Berakhot', 'Brakhot', 'Blessings'], ['Circumcision', 'Mila', 'Milah', 'Circumcision'],
    ['Sabbath', 'Shabbat', 'Sabbath'], ['Eruvin', 'Eruvin', 'Eiruvin'], ['Rest on the Tenth of Tishrei', "Shevitat Asor", 'Shvitat Asor'],
    [RH, 'Yom Tov', 'Shevitat Yom Tov', 'Rest on a Holiday', 'Festivals'],
    ['Leavened and Unleavened Bread', 'Ḥametz U-Matza', 'Chametz U-Matzah', 'Ḥametz', 'Chametz and Matzah', 'Leavened and Unleavened Bread'],
    [SH, 'Shofar', 'Sukka', 'Sukkah', 'Lulav', 'Shofar Ve-Sukka Ve-Lulav', 'Shofar, Sukkah and Lulav'],
    ['Sheqel Dues', 'Shekalim'], ['Sanctification of the New Month', 'Kiddush Ha-ḥodesh', 'Kiddush HaChodesh', 'Sanctification of the Month', 'Sanctification of the New Month'],
    ['Fasts', "Ta'aniyot", 'Taaniyot', 'Fasts', 'Fast Days'], [ME, 'Megilla', 'Megillah', 'Ḥanuka', 'Chanukah', 'Megilla Ve-Ḥanuka', 'Megillah and Chanukah'],
    ['Marriage', 'Ishut', 'Marriage'], ['Divorce', 'Gerushin', 'Divorce'], ['Levirate Marriage and Release', 'Yibum Ve-Ḥalitza', 'Yibbum'],
    ['Virgin Maiden', "Na'ara Betula"], ['Woman Suspected of Infidelity', 'Sota', 'Sotah'],
    [FI, "Issurei Bi'ah", "Issurei Bi'a", 'Isurei Biah', 'Forbidden Relations', 'Forbidden Sexual Relations', 'Sexual Prohibitions', 'Forbidden Intercourse', 'Prohibited Relations'],
    [FF, "Ma'akhalot Asurot", "Ma'akhalot Assurot", 'Maachalot Asurot', 'Forbidden Foods', 'Forbidden Food'],
    ['Ritual Slaughter', 'Sheḥita', 'Shechita', 'Ritual Slaughter', 'Slaughter'], ['Oaths', "Shevu'ot", 'Oaths'], ['Vows', 'Nedarim', 'Vows'],
    ['Nazariteship', 'Nezirut'], ['Appraisals and Devoted Property', 'Arakhin Va-Ḥaramin'],
    ['Diverse Species', "Kil'ayim", 'Kilayim', 'Diverse Species', 'Mixed Species'], ['Gifts to the Poor', 'Matanot Aniyim', 'Matnot Aniyim', 'Gifts to the Poor', 'Gifts to the Needy'],
    ['Heave Offerings', 'Terumot', 'Heave Offerings'], ['Tithes', "Ma'aser", "Ma'asrot", 'Maaser', 'Tithes'],
    [ST, "Ma'aser Sheni", 'Maaser Sheni', "Ma'aser Sheni Ve-Neta Revai", 'Neta Revai', 'Second Tithe', 'Second Tithes'],
    [BK, 'Bikkurim', 'Bikurim', 'First Fruits'], [SY, 'Shemita Ve-Yovel', 'Shemitta Ve-Yovel', 'Shmita Ve-Yovel', 'Shemita', 'Shemitah', 'Sabbatical Year', 'Sabbatical Year and the Jubilee'],
    ['The Chosen Temple', 'Beit Ha-beḥira', 'Beit HaBechirah', 'The Chosen Temple', 'Chosen Temple'],
    ['Vessels of the Sanctuary and Those Who Serve Therein', 'Klei Ha-Mikdash'], ['Admission into the Sanctuary', "Bi'at Ha-Mikdash"],
    ['Things Forbidden on the Altar', "Issurei Mizbe'aḥ", 'Issurei Mizbeach'], ['Sacrificial Procedure', "Ma'aseh Ha-Korbanot"],
    ['Daily Offerings and Additional Offerings', 'Temidin U-Musafin'], ['Sacrifices Rendered Unfit', 'Pesulei Ha-Mukdashin'],
    ['Service on the Day of Atonement', 'Avodat Yom Ha-Kippurim'], ['Trespass', "Me'ila"], ['Paschal Offering', 'Korban Pesaḥ'],
    ['Festival Offering', 'Ḥagiga'], ['Firstlings', 'Bekhorot'], ['Offerings for Unintentional Transgressions', 'Shegagot'],
    ['Substitution', 'Temura'], ['Defilement by a Corpse', "Tum'at Met"], ['Red Heifer', 'Para Aduma'], ['Immersion Pools', "Mikva'ot", 'Mikvaot', 'Immersion Pools'],
    ['Vessels', 'Kelim'], ['Damages to Property', 'Nizkei Mamon'], ['Theft', 'Geneiva', 'Theft'], ['Robbery and Lost Property', "Gezeila Va-Aveida", 'Gzeila Va-Aveida'],
    ['One Who Injures a Person or Property', 'Ḥovel U-Mazik'], [MU, "Rotze'aḥ U-Shemirat Ha-Nefesh", "Rotze'aḥ", 'Rotzeach', 'Murderer'],
    ['Sales', 'Mekhira'], ['Ownerless Property and Gifts', 'Zekhiya U-Matana'], ['Neighbors', 'Shekhenim'], ['Agents and Partners', 'Sheluḥin Ve-Shutafin', 'Sheluḥin'],
    ['Slaves', 'Avadim', 'Slaves'], ['Hiring', 'Sekhirut'], ['Borrowing and Deposit', "She'ela U-Fikadon"], ['Creditor and Debtor', 'Malveh Ve-Loveh', 'Malve Ve-Love'],
    ['Plaintiff and Defendant', "To'en Ve-Nit'an"], ['Inheritances', 'Naḥalot'], ['The Sanhedrin and the Penalties within Their Jurisdiction', 'Sanhedrin'],
    ['Testimony', 'Edut', 'Testimony'], ['Rebels', 'Mamrim', 'Rebels'], ['Mourning', 'Evel', 'Avel', 'Mourning'],
    [KW, 'Melakhim', 'Melachim', 'Melakhim U-Milḥamot', 'Melakhim U-Milḥemoteihem', 'Kings', 'Kings and Wars', 'Kings and Their Wars']
  ].forEach(function (r) { r.slice(1).forEach(function (k) { MT_EN[foldMT(k)] = r[0]; }); });

  // Tanakh in transliteration; the chapter must exist. Books in two parts need the part.
  var TNK_EN = {}, TNK_EN_P = {};
  [['Bereishit', 'Genesis'], ['Bereshit', 'Genesis'], ['Yehoshua', 'Joshua'], ['Shoftim', 'Judges'], ['Yirmiyahu', 'Jeremiah'],
    ['Yirmeyahu', 'Jeremiah'], ['Yirmiya', 'Jeremiah'], ['Yeḥezkel', 'Ezekiel'], ['Yechezkel', 'Ezekiel'], ['Hoshea', 'Hosea'],
    ['Yoel', 'Joel'], ['Ovadya', 'Obadiah'], ['Ovadia', 'Obadiah'], ['Ovadyah', 'Obadiah'], ['Yona', 'Jonah'], ['Mikha', 'Micah'],
    ['Micha', 'Micah'], ['Naḥum', 'Nahum'], ['Ḥavakuk', 'Habakkuk'], ['Chavakuk', 'Habakkuk'], ['Tzefanya', 'Zephaniah'],
    ['Ḥaggai', 'Haggai'], ['Ḥagai', 'Haggai'], ['Chaggai', 'Haggai'], ['Zekharya', 'Zechariah'], ['Zecharya', 'Zechariah'],
    ['Malakhi', 'Malachi'], ['Malachi', 'Malachi'], ['Tehilim', 'Psalms'], ['Iyov', 'Job'], ['Shir Ha-shirim', 'Song of Songs'],
    ['Shir HaShirim', 'Song of Songs'], ['Eikha', 'Lamentations'], ['Eicha', 'Lamentations'], ['Eikhah', 'Lamentations'],
    ['Ester', 'Esther'], ['Rut', 'Ruth'], ['Neḥemya', 'Nehemiah'], ['Nechemya', 'Nehemiah'], ['Neḥemia', 'Nehemiah'], ['Yeshaya', 'Isaiah']
  ].forEach(function (r) { var row = TANAKH_HE.filter(function (x) { return x[1] === r[1]; })[0]; TNK_EN[foldTr(r[0])] = [r[1], row[2]]; });
  [['Shmuel', 'Samuel'], ['Shemuel', 'Samuel'], ['Melakhim', 'Kings'], ['Melachim', 'Kings'], ['Divrei Ha-yamim', 'Chronicles'],
    ['Divrei HaYamim', 'Chronicles']].forEach(function (r) {
    var row = TANAKH_HE_PART.filter(function (x) { return x[1] === r[1]; })[0]; TNK_EN_P[foldTr(r[0])] = [r[1], row[2]];
  });
  var TNK_EN_ALT = Object.keys(TNK_EN).concat(Object.keys(TNK_EN_P)).length && [
    'Bere(?:i)?shit', 'Yehoshua', 'Shoftim', 'Yirm(?:i|e)yahu', 'Yirmiya', 'Ye(?:ḥ|ch)ezkel', 'Hoshea', 'Yoel', 'Ovad(?:y|i)ah?', 'Yona',
    'Mi(?:kh|ch)a', 'Naḥum', '(?:Ḥ|Ch)avakuk', 'Tzefanya', '(?:Ḥ|Ch)agg?ai', 'Ze(?:kh|ch)arya', 'Mala(?:kh|ch)i', 'Tehilim', 'Iyov',
    'Shir Ha-?[Ss]hirim', 'Ei(?:kh|ch)ah?', 'Ester', 'Rut', 'Ne(?:ḥ|ch)emi?ya', 'Yeshaya'].join('|');
  var TNK_EN_P_ALT = 'Shm?e?uel|Mela(?:kh|ch)im|Divrei Ha-?[Yy]amim';
  var NOT_TNK_BEFORE = /(?:Beit|Bet|Devar|Benei|Bnei|Ḥazon|Hazon|Chazon|Hilkhot|Hilchot|Laws of|Rabbi|Rav|R\.|Rabbeinu|Midrash|Yalkut|Sifrei|Rabba[h]?)\s*$/;

  // the Shulchan Arukh section a citation names in English: "OḤ", "Y.D.", "Yoreh De’ah", "ḤM"...
  var EN_SECRE = '(?:(O[ḤḥHC]|O\\.[CḤ]\\.|Ora[ḥc]h? [ḤḥC]h?ay?y?im|YD|Y\\.D\\.|Yoreh De[\'’]?ah|EH|E\\.H\\.|Even Ha-?[Ee]zer|[ḤH]M|Ḥ\\.M\\.|Choshen Mishpat|Ḥoshen Mishpat)[,\\s]+)?';
  function secEn(s) {
    if (!s) return '';
    var k = s.replace(/[.\s’']/g, '').toUpperCase();
    if (/^O/.test(k)) return 'OC'; if (/^Y/.test(k)) return 'YD'; if (/^E/.test(k)) return 'EH';
    if (/^[ḤHC]/i.test(k)) return 'HM'; return '';
  }
  function enSec(mark, ctx, allowed, w) {
    var s = secEn(mark), by = 'cite';
    if (!s && ctx && ctx.secBy) { s = ctx.sec; by = ctx.secBy; }
    if (!s || (allowed && allowed.indexOf(s) < 0)) return null;
    return {sec: s, by: by};
  }
  function onSecEn(base, w, mark, ctx, allowed, loc) {
    var s = enSec(mark, ctx, allowed);
    if (!s) return named(w + ' is divided by section of the Shulchan Arukh, and neither this citation nor this chapter says which.');
    var r = linked(base.replace('{sec}', SEC_EN[s.sec]) + ' ' + loc, w); r.sec = s.sec; r.secBy = s.by; return r;
  }
  var ROMAN = ['I', 'II', 'III', 'IV'];
  var DH_PARTS = [['Part One', ['On the Creator', 'On the Purpose of Creation', 'On Mankind', 'On Human Responsibility', 'On the Spiritual Realm']],
    ['Part Two', ['On Divine Providence in General', 'On Mankind in This World', 'On Personal Providence', 'On Israel and the Nations',
      'On How Providence Works', 'On the System of Providence', 'On the Influence of the Stars', 'On Specific Modes of Providence']],
    ['Part Three', ['On the Soul and Its Activities', 'On Divine Names and Witchcraft', 'On Divine Inspiration and Prophecy',
      'On the Prophetic Experience', "On Moshe's Unique Status"]],
    ['Part Four', ['On Divine Service', 'On Torah Study', 'On Love and Fear of God', "On the Sh'ma and Its Blessings", 'On Prayer',
      'On the Daily Order of Prayer', 'On Divine Service and the Calendar', 'On Seasonal Commandments', 'On Blessings']]];
  var ENS = '[,\\s]*\\(?\\s*';                 // what may sit between a work and its location
  var NO_SEF = 'is not on Sefaria, so this is not linked.';
  var NOT_ON_SEFARIA = [
    'Levush', 'Menu[ḥh]at Ahava', "Ye[ḥh]aveh Da['’]?at", 'Yabi[\'’]?a Omer', 'Masoret Ha-?[Gg]iyur', 'Ketzot Ha-?[Ss]hul[ḥc]h?an',
    'Mishpat Kohen', "Da['’]?at Kohen", 'Ora[ḥc]h? Mishpat', "Igrot Ha-?[Rr]e['’]?a?ya", 'Seridei Esh', 'A[ḥc]hiezer',
    "Sha['’]?agat Aryeh", 'Shiyurei Berakha', 'Divrei Malkiel', 'Zera Emet', 'Amud Ha-?[Yy]emini', 'Or[ḥc]h?ot Shabbat',
    'Shul[ḥc]h?an Gavoha', "Pe['’]?at Ha-?[Ss]hul[ḥc]h?an", "Mikra['’]?ei Kodesh", 'Badei Ha-?[Ss]hul[ḥc]h?an', 'Darkhei Teshuva',
    'Bikurei Ya[\'’]?akov', 'Ziv[ḥc]h?ei Tzedek', 'Ma[ḥc]h?azik Berakha', 'Birkat Hashem', 'Sidrei Tahara', "Ketif Shevi['’]?it",
    'Aseh Lekha Rav', 'Mishpetei Eretz', 'Shevitat Ha-?[Ss]adeh', 'Erekh Ha-?[Ss]hul[ḥc]h?an', "Ma['’]?amar Mordekhai",
    'Tzava Ka-?[Hh]alakha', 'Sia[ḥc]h? Na[ḥc]h?um', 'Shul[ḥc]h?an Shlomo', 'Shevet Ha-?[Ll]evi', 'Birkei Yosef',
    'Min[ḥc]h?at Shlomo', 'Min[ḥc]h?at Yit[zs]?[ḥc]h?ak', "Sha['’]?ar Ha-?[Tt]z?iyun", 'Darkhei Tahara', 'Taharat Ha-?[Bb]ayit',
    'Mishneh Halakhot', 'Te[ḥc]h?umin'];

  var PH_VOL_EN = {};
  Object.keys(PH_VOL_HE).forEach(function (k) { PH_VOL_EN[foldMT(PH_VOL_HE[k])] = PH_VOL_HE[k]; });
  [['Simḥat Ha-Bayit U-Virkhato', "Simchat Habayit U'Virkhato"], ['Simchat HaBayit UVirchato', "Simchat Habayit U'Virkhato"],
    ['Emuna U-Mitzvoteha', 'Emunah Umitzvoteha'], ['Laws of Festivals', 'Festivals'], ['Mo’adim', 'Festivals'], ["Mo'adim", 'Festivals'],
    ['Women’s Prayer', "Women's Prayer"], ['Family Purity', 'Family Purity'], ['Taharat Ha-Mishpaḥa', 'Family Purity'],
    ['Shevi’it and Yovel', 'Shemitah and Yovel'], ["Shevi'it Ve-Yovel", 'Shemitah and Yovel'], ['Likutim I', 'Likkutim I'],
    ['Likutim II', 'Likkutim II'], ['Conversion', 'Giyur']].forEach(function (r) { PH_VOL_EN[foldMT(r[0])] = r[1]; });

  var EN_WORKS = [
    // the Rambam: "Rambam, Hilkhot Shabbat 5:3", "MT, Laws of Kings 10:9", "Hilkhot Melakhim 5:1"
    [/(?:\b(?:Rambam|MT|mt|Mishneh Torah|Maimonides)(?:['’]s)?[,\s]*\(?\s*(?:on\s+)?)?\b(?:Hilkhot|Hilchot|Hil\.|Laws of(?: the)?)\s+([A-Z][A-Za-zḥĥḤĤ'’ ,\-]{1,60}?)[,\s]*(?:ch(?:apter|\.)\s*)?(\d{1,2}):(\d{1,3})/g,
      function (m) {
        var before = m.input.slice(Math.max(0, m.index - 30), m.index);
        var aw = /([A-Z][\wḥĥḤĤ'’\-]*)\s*[,(]\s*$/.exec(before);
        if (!/^(?:Rambam|MT|mt|Mishneh|Maimonides)/.test(m[0]) && aw && !/^(?:See|Also|Cf|And|Rambam|MT|Torah|Maimonides)$/.test(aw[1])) return null;
        var b = MT_EN[foldMT(m[1].replace(/,.*$/, ''))] || MT_EN[foldMT(m[1])];
        var c = +m[2], h = +m[3];
        if (!b || !c || !h || c > 30) return null;
        return linked('Mishneh Torah, ' + b + ' ' + c + ':' + h, 'Mishneh Torah');
      }],
    // "Rambam (Tzitzit 3:11)": a book name straight after the Rambam. A name that is also a tractate
    // ("Rambam, Berakhot 1:1") may be his commentary on the Mishnah, so it is left to the grammar.
    [/\b(?:Rambam|MT)(?:['’]s)?(?:\s*,\s*|\s*\(\s*)([A-Z][A-Za-zḥĥḤĤ'’\- ]{2,40}?)\s*,?\s*(\d{1,2}):(\d{1,3})/g,
      function (m) {
        if (/^(?:Hilkhot|Hilchot|Hil\.|Laws)\b/.test(m[1]) || tractEn(m[1])) return null;
        var b = MT_EN[foldMT(m[1])], c = +m[2], h = +m[3];
        return b && c && h && c <= 30 ? linked('Mishneh Torah, ' + b + ' ' + c + ':' + h, 'Mishneh Torah') : null;
      }],
    // Tanakh in transliteration: "Yehoshua 1:8", "II Shmuel 7:12", "Divrei Ha-yamim I 29:11"
    [new RegExp('\\b(?:(I{1,2}|[12])\\s+)?(' + TNK_EN_ALT + '|' + TNK_EN_P_ALT + ')(?:\\s+(I{1,2}|[12]|Alef|Bet))?\\s+(\\d{1,3}):(\\d{1,3})', 'g'),
      function (m) {
        if (NOT_TNK_BEFORE.test(m.input.slice(Math.max(0, m.index - 12), m.index))) return null;
        var k = foldTr(m[2]), c = +m[4], v = +m[5], one = TNK_EN[k], two = TNK_EN_P[k];
        if (one) return !m[1] && !m[3] && c >= 1 && c <= one[1] && v ? linked(one[0] + ' ' + c + ':' + v, one[0]) : null;
        if (!two) return null;
        var p = m[1] || m[3]; if (!p) return null;
        var i = /^(?:I|1|Alef)$/.test(p) ? 0 : 1;
        return c >= 1 && c <= two[1][i] && v ? linked(['I ', 'II '][i] + two[0] + ' ' + c + ':' + v, two[0]) : null;
      }],
    // a Mishnah: "Mishna Shevi'it 9:2", "Mishnah Berakhot 1:1"
    [/\bMishnah?\s+([A-Z][A-Za-zḥĥḤĤ'’\-]+(?:\s+[A-Z][A-Za-zḥĥḤĤ'’\-]+)?)\s+(\d{1,2}):(\d{1,2})\b/g,
      function (m) { var t = tractEn(m[1]), c = +m[2], h = +m[3]; return t && c && h && c <= 30 ? linked('Mishnah ' + t + ' ' + c + ':' + h, 'Mishnah') : null; }],
    [/\bTerumat Ha-?[Dd]eshen\b[,\s]*\(?\s*(Pesakim[^\d]{0,20})?§?\s*(\d{1,3})\b(?!:)/g,
      function (m) { var n = +m[2]; return n && n <= 354 ? linked('Terumat HaDeshen, Part ' + (m[1] ? 'II ' : 'I ') + n, 'Terumat HaDeshen') : null; }],
    [/\b(?:Sefer\s+)?Ha-?[ḥĥ]inukh\b[,\s]*\(?\s*(?:§\s*|mitzva[h]?\s+)?(\d{1,3})\b(?!:)/gi,
      function (m) { var n = +m[1]; return n && n <= 613 ? linked('Sefer HaChinukh ' + n, 'Sefer HaChinukh') : null; }],
    [/\bMin[ḥĥc]h?at [ḤĤC]h?inukh\b[,\s]*\(?\s*(?:§\s*|mitzva[h]?\s+)?(\d{1,3})\b(?!:)/g,
      function (m) { var n = +m[1]; return n && n <= 613 ? linked('Minchat Chinukh ' + n, 'Minchat Chinukh') : null; }],
    [/\bKuzari\b[,\s]*\(?\s*([1-5]):(\d{1,3})/g, function (m) { return linked('Kuzari ' + m[1] + ':' + m[2], 'Kuzari'); }],
    [/\b(?:Moreh Nevu(?:kh|ch)im|Guide (?:for|of|to) the Perplexed)\b[,\s]*\(?\s*(?:part\s+)?(I{1,3}|[123])[:,]\s*(?:chapter\s+)?(\d{1,3})/g,
      function (m) { var a = {I: 1, II: 2, III: 3}[m[1]] || +m[1]; return linked('Guide for the Perplexed, Part ' + a + ' ' + m[2], 'Guide for the Perplexed'); }],
    [/\bTashbetz\b(?!\s+Katan)[,\s]*\(?\s*(?:part\s+)?([123])[:,]\s*(\d{1,3})/g,
      function (m) { return linked('Sefer HaTashbetz, Part ' + ROMAN[m[1] - 1] + ' ' + m[2], 'Tashbetz'); }],
    [/\bMaharsham\b(?![,\s]*(?:in\s+)?Da['’]at Torah)[,\s]*\(?\s*(?:part\s+)?([123])[:,]\s*(\d{1,3})/g,
      function (m) { return linked('Teshuvot Maharsham Volume ' + ROMAN[m[1] - 1] + ' ' + m[2], 'Maharsham'); }],
    [/\bMelamed Le-?[Hh]o['’]il\b[,\s]*\(?\s*([123]):(\d{1,3})/g,
      function (m) { return linked("Melamed Leho'il Part " + ROMAN[m[1] - 1] + ' ' + m[2], "Melamed Leho'il"); }],
    [/\bBinyan Tziyon\b(?!\s+(?:Ḥ|Ch)adashot)[,\s]*\(?\s*(?:part\s+1,\s*)?§?\s*(\d{1,3})\b(?!:)/g,
      function (m) { return linked('Binyan Tziyon ' + m[1], 'Binyan Tziyon'); }],
    [/\bSemak\b[,\s]*\(?\s*§?\s*(\d{1,3})\b(?!:)/g, function (m) { return linked('Sefer Mitzvot Katan ' + m[1], 'Semak'); }],
    [/\bSemag\b[,\s]*\(?\s*(positive|negative)\s+(?:commandments?|mitzv(?:a|ot))\s*§?\s*(\d{1,3})/gi,
      function (m) { return linked('Sefer Mitzvot Gadol, ' + (/^p/i.test(m[1]) ? 'Positive' : 'Negative') + ' Commandments ' + m[2], 'Semag'); }],
    [/\b(?:Sefer\s+)?Yere['’]?im\b[,\s]*\(?\s*§?\s*(\d{1,3})\b(?!:)/g, function (m) { return linked('Sefer Yereim ' + m[1], 'Yereim'); }],
    [/\bOr Zaru['’]?a\b[,\s]*\(?\s*([12]):(\d{1,3})/g,
      function (m) { return linked('Or Zarua, Volume ' + (m[1] === '1' ? 'I' : 'II') + ' ' + m[2], 'Or Zarua'); }],
    // "Sha'arei Teshuva" is three works. Rabbeinu Yona's (gate:section) is linked when the text says it is his, or
    // when the section is past 60 (no siman 1-4 of the Shulḥan Arukh commentary reaches that); the Geonim's responsa
    // when the text says Ge'onim. The Shulḥan Arukh commentary is named: Sefaria's copy is sparsely segmented.
    [/\bSha['’]?arei Teshuva[h]?\b(\s+of Rabbeinu Yona)?[,\s]*\(?\s*(?:(?:gate|Gate)\s*([1-4])[,\s]+(\d{1,3})|([1-4]):(\d{1,3})|(?:siman\s+)?(\d{1,3}))\b(?![:\d])/g,
      function (m) {
        var before = m.input.slice(Math.max(0, m.index - 60), m.index);
        var gate = m[2] || m[4], sec = m[3] || m[5];
        if (gate) {
          var yona = m[1] || m[2] || /Yona/.test(before) || +sec > 60;
          return yona ? linked('Sha\'arei Teshuvah ' + gate + ':' + sec, 'Sha\'arei Teshuvah') : null;
        }
        if (/Ge['’]?onim|Gaon\b/.test(before)) return linked('Teshuvot HaGeonim (Shaarei Teshuva) ' + m[6], 'Teshuvot HaGeonim');
        return null;
      }],
    [/\bKol Bo\b[,\s]*\(?\s*§?\s*(\d{1,3})\b(?!:)/g, function (m) { return linked('Kol Bo ' + m[1], 'Kol Bo'); }],
    [/\bMesil+at Yesharim\b[,\s]*\(?\s*(?:ch(?:apter|\.)\s*)?(\d{1,2})\b/g, function (m) { return +m[1] <= 26 ? linked('Mesillat Yesharim ' + m[1], 'Mesillat Yesharim') : null; }],
    [/\bShib+olei Ha-?[Ll]eket\b[,\s]*\(?\s*§?\s*(\d{1,3})\b(?!:)/g, function (m) { return linked('Shibbolei HaLeket ' + m[1], 'Shibbolei HaLeket'); }],
    [/\bRivash\b[,\s]*\(?\s*§\s*(\d{1,3})\b/g, function (m) { return linked('Teshuvot HaRivash ' + m[1], 'Rivash'); }],
    [/\bAvot De-?(?:Rabbi|Rebbe) Natan\b[,\s]*\(?\s*(?:chap(?:ter|\.)?\s*)?(\d{1,2})(?::(\d{1,2}))?/g,
      function (m) { return +m[1] <= 41 ? linked('Avot DeRabbi Natan ' + m[1] + (m[2] ? ':' + m[2] : ''), 'Avot DeRabbi Natan') : null; }],
    [/\b(?:Shemon[ae]h?|Shmonah) Kevatzim\b[,\s]*\(?\s*([1-8]):(\d{1,4})/g, function (m) { return linked('Shmonah Kevatzim ' + m[1] + ':' + m[2], 'Shmonah Kevatzim'); }],
    [/\bKeset Ha-?[Ss]ofer\b[,\s]*\(?\s*(\d{1,2}):(\d{1,2})/g, function (m) { return linked('Keset HaSofer ' + m[1] + ':' + m[2], 'Keset HaSofer'); }],
    [/\bGevurot Hashem\b[,\s]*\(?\s*(?:ch(?:apter|s?\.)\s*)?(\d{1,2})\b/g, function (m) { return linked('Gevurot Hashem ' + m[1], 'Gevurot Hashem'); }],
    [/(?:^|(?<![A-Za-zḥḤ]))(?:[ḤĤH]|Ch)avv?ot Ya['’]?ir\b[,\s]*\(?\s*(?:responsa\s+)?§?\s*(\d{1,3})\b/g, function (m) { return linked('Havot Yair ' + m[1], 'Havot Yair'); }],
    [/\bShe['’]?ilat Ya['’]?avetz\b[,\s]*\(?\s*([12]):(\d{1,3})/g,
      function (m) { return linked('Sheilat Yaavetz, Volume ' + ROMAN[m[1] - 1] + ' ' + m[2], 'Sheilat Yaavetz'); }],
    [/\bMeshiv Davar\b[,\s]*\(?\s*([1-5]):(\d{1,3})/g,
      // Sefaria holds text for volumes I and II only (III and IV are in its index with no text, checked 16 Nov 2026).
      function (m) { return +m[1] <= 2 ? linked('Teshuvot Meshiv Davar, Volume ' + ROMAN[m[1] - 1] + ' ' + m[2], 'Meshiv Davar') : named('Sefaria has volumes I and II of the Meshiv Davar; volumes III and IV are listed there without text.'); }],
    [/\bMateh Efrayim\b[,\s]*\(?\s*(?:O[ḤḥC]\s+)?(\d{3}):(\d{1,3})/g, function (m) { return linked('Mateh Efrayim ' + m[1] + ':' + m[2], 'Mateh Efrayim'); }],
    [/\bDerekh Hashem\b[,\s]*\(?\s*(?:part\s+([1-4]),?\s*(?:chapter\s+)?(\d{1,2})(?::(\d{1,2}))?|([1-4]):(\d{1,2})(?::(\d{1,2}))?)/g,
      function (m) {
        var p = +(m[1] || m[4]), c = +(m[2] || m[5]), s = m[3] || m[6], part = DH_PARTS[p - 1], ch = part && part[1][c - 1];
        if (!ch) return named('We could not find this chapter of Derekh Hashem.');
        return linked('Derekh Hashem, ' + part[0] + ', ' + ch + (s ? ' ' + s : ''), 'Derekh Hashem');
      }],
    // Chayei Adam has two parts with their own numbering: the daily laws, and Shabbat and Festivals.
    // A bare "Ḥayei Adam 30:2" in a volume on Shabbat or the festivals could be either, so it is named.
    [/(?:^|(?<![A-Za-zḥḤ]))(?:Ḥ|Ch)ayy?ei Adam\b[,\s]*\(?\s*(?:(Hilkhot Shabbat|Shabbat and Festivals|Hilkhot Shabbat U-Mo['’]adim|part (?:2|II))[,\s]*)?(?:klal\s+)?(\d{1,3}):(\d{1,3})/g,
      function (m, ctx, page) {
        if (m[1]) return linked('Chayei Adam, Shabbat and Festivals ' + m[2] + ':' + m[3], 'Chayei Adam');
        if (page && /^(?:Shabbat|Festivals|Pesach|Sukkot|Zemanim|Days of Awe|Women's Prayer)$/.test(page.vol))
          return Object.assign(named('Chayei Adam has two parts, the daily laws and Shabbat and Festivals, each numbered from 1, and this citation does not say which.'), {work: 'Chayei Adam'});
        // the daily laws have 69 klalim, so a higher klal can only be Shabbat and Festivals
        if (+m[2] > 69) return +m[2] <= 155 ? linked('Chayei Adam, Shabbat and Festivals ' + m[2] + ':' + m[3], 'Chayei Adam') : null;
        return linked('Chayei Adam ' + m[2] + ':' + m[3], 'Chayei Adam');
      }],
    // "y. Avoda Zara 5:15": the Jerusalem Talmud
    [/\by\s*\.\s+([A-Z][A-Za-zḥḤ'’\-]+(?:\s+[A-Z][A-Za-zḥḤ'’\-]+)?)\s+(\d{1,2}):(\d{1,2})/g,
      function (m) { var t = tractEn(m[1]); return t ? linked('Jerusalem Talmud ' + t + ' ' + m[2] + ':' + m[3], 'Jerusalem Talmud') : null; }],
    // Igrot Moshe by section, part and siman: not on Sefaria
    [/\bIgrot Moshe\b[,\s]*(?:Ora[ḥc]h? [ḤC]h?ay?y?im|Yoreh De['’]?ah|Even Ha-?[Ee]zer|[ḤC]h?oshen Mishpat)[,\s]+part\s+\d,\s*\d{1,3}/g,
      function () { return Object.assign(named('Igrot Moshe ' + NO_SEF), {work: 'Igrot Moshe'}); }],
    // another volume of Peninei Halakha by chapter: "Peninei Halakha: Prayer ch. 11"
    [/\bPeninei Hala(?:kh|ch)ah?(?:[:,]|\s+on)?\s*([A-Z][A-Za-zḥḤ’'\- ]{2,40}?),?\s+(?:ch(?:apter|\.)\s*)?(\d{1,2})\b(?![:\d])/g,
      function (m) {
        var v = PH_VOL_EN[foldMT(m[1])], c = +m[2];
        if (!v || !c || c > 40) return null;
        return {resolved: true, internal: true, ref: 'Peninei Halakhah, ' + v + ' ' + c + ':1', work: 'Peninei Halakha'};
      }],
    // divided by section of the Shulchan Arukh: the citation's own section, else the chapter's
    [new RegExp('\\bDarkhei Moshe\\b' + ENS + EN_SECRE + '(\\d{1,3})(?::(\\d{1,2}))?\\b', 'g'),
      function (m, ctx) { return onSecEn('Darkhei Moshe, {sec}', 'Darkhei Moshe', m[1], ctx, null, m[2] + (m[3] ? ':' + m[3] : '')); }],
    [new RegExp('\\bP(?:e)?risha\\b' + ENS + EN_SECRE + '(\\d{1,3}):(\\d{1,2})', 'g'),
      function (m, ctx) { return onSecEn('Prisha, {sec}', 'Prisha', m[1], ctx, null, m[2] + ':' + m[3]); }],
    [new RegExp('\\b(?:(?:Pri|Peri) Megadim|PM)\\b[,\\s]*' + EN_SECRE + '(Eshel Avraham|Mishb[ae]tz?ot Zahav|Siftei Da[\'’]?at)' + ENS + EN_SECRE + '(\\d{1,3}):(\\d{1,3})', 'g'),
      function (m, ctx) { return pmd(m[2], m[1] || m[3], ctx, m[4] + ':' + m[5]); }],
    [new RegExp('\\b(Mishb[ae]tz?ot Zahav)' + ENS + EN_SECRE + '(\\d{1,3}):(\\d{1,3})', 'g'),
      function (m, ctx) { return pmd(m[1], m[2], ctx, m[3] + ':' + m[4]); }],
    // works Sefaria does not have, cited with a location: marked and named
    [new RegExp('\\b(' + NOT_ON_SEFARIA.join('|') + ')\\b' + ENS + '(?:(?:vol(?:ume)?\\.?|part)\\s*[IV\\d]+,?\\s*|[A-Z][A-Za-zḤḥ.]{0,6}\\s+|§\\s*)?\\d{1,4}(?:[:.]\\d{1,4})*', 'g'),
      function (m) { return Object.assign(named(m[1] + ' ' + NO_SEF), {work: m[1]}); }]
  ];
  function pmd(partName, mark, ctx, loc) {
    var part = /^E/.test(partName) ? 'Eshel Avraham' : /^S/.test(partName) ? "Siftei Da'at" : 'Mishbezot Zahav';
    var allowed = part === 'Eshel Avraham' ? ['OC'] : part === "Siftei Da'at" ? ['YD'] : ['OC', 'YD'];
    var s = enSec(mark, ctx, allowed);
    if (!s && allowed.length === 1) s = {sec: allowed[0], by: 'work'};
    if (!s) return named('The Peri Megadim’s Mishbetzot Zahav is on Orach Chayim and Yoreh De’ah, and neither this citation nor this chapter says which.');
    var r = linked('Peri Megadim on ' + SEC_EN[s.sec] + ', ' + part + ' ' + loc, 'Peri Megadim'); r.sec = s.sec; r.secBy = s.by; return r;
  }

  // English spellings rewritten into ones the grammar reads (positions map back, as for Hebrew)
  var EN_NORM = [
    [/(^|[^A-Za-zḥḤ'’])((?:[A-Z][A-Za-zḥḤ'’]*)(?:[\s\-]+[A-Za-zḥḤ'’]+){0,2})(?=\s+\d{1,3}[ab]\b)/g,
      function (m) {
        var toks = m[2].split(/([\s\-]+)/);   // words and their separators
        for (var i = 0; i < toks.length; i += 2) {
          var name = toks.slice(i).join(''), t = tractEn(name);
          if (t) return t === name ? null : m[1] + toks.slice(0, i).join('') + t;
        }
        return null;
      }],
    [/\bArukh Ha-?[Ss]hul(?:ch|ḥ)an\b/g, function () { return 'Aruch HaShulchan'; }],
    [/\bShabbat Ha-Aretz\b/g, function () { return 'Shabbat HaAretz'; }],
    [/\bBiur Hala(?:kh|ch)a\b/g, function () { return 'Beur Halakha'; }]
  ];

  // returns [{start, end, ...hit}] for the works above; the caller masks them before the grammar runs
  function midrash(text, he, opts) {
    var ctx = ctxFor(opts), page = pageOf(opts && opts.ref);
    var out = [];
    (he ? HE_RULES.concat(PH_HE_RULES, HE_WORKS) : EN_RULES.concat(EN_WORKS)).forEach(function (rule) {
      var re = rule[0], m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var s = m.index, e = m.index + m[0].length;
        if (he && m[0] && !/[א-ת]/.test(m[0].charAt(0))) s++;   // the boundary character the pattern consumed
        var raw = text.slice(s, e).replace(/[\s,(]+$/, '');
        e = s + raw.length;
        if (out.some(function (h) { return s < h.end && e > h.start; })) continue;
        var r = rule[1](m, ctx, page);
        if (!r) continue;
        r.start = s; r.end = e; r.text = raw; r.sec = r.sec || ''; r.secBy = r.secBy || ''; r.ref = r.ref || '';
        out.push(r);
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });
    return out;
  }

  // No tractate of the Mishnah has more than 30 chapters or a chapter of more than 40 mishnayot, so a
  // tractate followed by bigger numbers ("Yam Shel Shlomo, Ḥullin 8:106") is another work's division.
  function mishnahBound(h) {
    var m = h && h.resolved && /^Mishnah (?!Berurah)[A-Z][A-Za-z ]+ (\d+):(\d+)/.exec(h.ref || '');
    if (m && (+m[1] > 30 || +m[2] > 40)) {
      h.resolved = false; h.ref = '';
      h.why = 'These numbers are too large for a chapter of the Mishnah, so this is probably the division of another work and is not linked.';
    }
    return h;
  }
  /* ── a commentator in front of a verse, and "Rashi ad loc." ────────────────────────────────────────
   * "Ramban, Shemot 20:8" is the Ramban's comment on the verse, not the verse: the link goes to the
   * commentary and keeps the verse as `base`, so the sheet shows the verse first and the comment under it.
   * "Rashi ad loc." / רש"י שם is linked only where "there" is unambiguous: the citation just before it
   * in the same parenthesis, or else the one Talmud folio named earlier in the paragraph. A paragraph
   * citing two folios, or none, leaves it as plain text. Every title was fetched from Sefaria (17 Nov 2026):
   * Ramban/Sforno/Or HaChaim on Exodus 20:8, Metzudat David on Psalms 68:20, Rashi on Beitzah 16a. */
  var TORAH = {Genesis: 1, Exodus: 1, Leviticus: 1, Numbers: 1, Deuteronomy: 1};
  var NACH = 'Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles';
  var VERSE = new RegExp('^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|' + NACH + ') \\d+:\\d+(?:-\\d+)?$');
  var FOLIO = /^(?!Mishnah |Jerusalem )(?![A-Za-z ]+ on )[A-Z][A-Za-z ]+ \d+[ab]$/;
  // the passage a citation is about: its base, or the folio under "Tosafot on Ketubot 11a"
  function baseOf(h) { var r = h.base || h.ref || ''; var m = /^[A-Z][A-Za-z ]+? on ([A-Z][A-Za-z ]+ \d+[ab])$/.exec(r); return m ? m[1] : r; }
  // [Sefaria title, English pattern, Hebrew pattern, what it comments on: 'all' | 'torah' | 'nach' | 'tal']
  var COMMS = [
    ['Rashi', 'Rashi', 'רש[״"]י', 'all'],
    ['Ramban', 'Ramban|Nachmanides', 'רמב[״"]ן', 'torah'],
    ['Ibn Ezra', 'Ibn Ezra', 'אבן עזרא|ראב[״"]ע', 'torah'],
    ['Sforno', 'S(?:e)?forno', 'ספורנו', 'torah'],
    ['Or HaChaim', 'O(?:h)?r Ha-?(?:[Cc]h|ḥ|Ḥ)ay?(?:y)?im', 'אור החיים', 'torah'],
    ['Rashbam', 'Rashbam', 'רשב[״"]ם', 'torah'],
    ['Kli Yakar', 'K(?:e)?li Yakar', 'כלי יקר', 'torah'],
    ['Baal HaTurim', 'Ba[\'’]?al Ha-?[Tt]urim', 'בעל הטורים', 'torah'],
    ['Radak', 'Radak', 'רד[״"]ק', 'nach'],
    ['Metzudat David', 'Metzudat David', 'מצודת דוד', 'nach'],
    ['Malbim', 'Malbim', 'מלבי[״"]ם', 'all'],
    ['Tosafot', 'Tosafot|Tosafos|Tos\\.', 'תוס(?:פות|\'|׳)', 'tal']
  ];
  function fits(kind, ref) {
    if (FOLIO.test(ref) && !VERSE.test(ref)) return kind === 'tal' || kind === 'all';
    if (!VERSE.test(ref)) return false;
    var book = ref.replace(/ \d.*$/, '');
    return kind === 'all' || (kind === 'torah' ? !!TORAH[book] : kind === 'nach' ? !TORAH[book] : false);
  }
  function commentOn(name, ref, base) {   // "Rashi on Beitzah 16a" (a folio needs no verse range)
    return {resolved: true, ref: name + ' on ' + ref.replace(/-\d+$/, ''), work: name, base: base, why: '', sec: '', secBy: ''};
  }
  function commentaries(hits, text, he) {
    hits.sort(function (a, b) { return a.start - b.start; });
    var out = [], i;
    // 1 · a commentator just before a verse
    hits.forEach(function (h) {
      if (h.resolved && !h.internal && VERSE.test(h.ref || '')) {
        var before = text.slice(Math.max(0, h.start - 40), h.start);
        for (i = 0; i < COMMS.length; i++) {
          var c = COMMS[i];
          var re = he ? new RegExp('(?:^|[\\s(;,])ו?(' + c[2] + ')[\\s,:]*(?:על\\s+)?$') : new RegExp('\\b(' + c[1] + ')(?:\\s*(?:,|on|to|\\()\\s*|\\s+)$');
          var m = re.exec(before);
          if (m && c[3] !== 'tal' && fits(c[3], h.ref)) {
            var s = h.start - before.length + m.index + m[0].indexOf(m[1]);
            var r = commentOn(c[0], h.ref, h.ref); r.start = s; r.end = h.end; r.text = text.slice(s, h.end);
            h = r; break;
          }
        }
      }
      out.push(h);
    });
    // 2 · "Rashi ad loc." / "Tosafot ibid." / רש"י שם
    COMMS.forEach(function (c) {
      var re = he ? new RegExp('(?:^|[\\s(;,])ו?(' + c[2] + ')\\s+שם(?![א-ת])', 'g')
                  : new RegExp('\\b(' + c[1] + ')(?:,?\\s+(?:ad loc\\.?|ibid\\.?|there\\b))', 'g'), m;
      while ((m = re.exec(text))) {
        var s = m.index + m[0].indexOf(m[1]), e = m.index + m[0].length;
        if (out.some(function (h) { return s < h.end && e > h.start; })) continue;
        var prev = out.filter(function (h) { return h.end <= s; }).sort(function (a, b) { return a.end - b.end; }), ante = null;
        var last = prev[prev.length - 1];
        // the citation just before it, in the same parenthesis ("Shabbat 6a; Rashi ad loc.")
        if (last && last.resolved && /^[\s;,]*(?:and\s+|ו)?$/.test(text.slice(last.end, s)) && fits(c[3], baseOf(last))) ante = baseOf(last);
        // else the one Talmud folio earlier in the paragraph
        if (!ante && (c[3] === 'tal' || c[3] === 'all')) {
          var f = {};
          prev.forEach(function (h) { var r = baseOf(h); if (h.resolved && FOLIO.test(r) && !VERSE.test(r)) f[r] = 1; });
          var ks = Object.keys(f); if (ks.length === 1) ante = ks[0];
        }
        if (!ante) continue;
        var r = commentOn(c[0], ante, ante); r.start = s; r.end = e; r.text = text.slice(s, e);
        out.push(r);
      }
    });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  function find(text, opts) { return commentaries(findNorm(text, opts).map(mishnahBound), String(text || ''), isHebrew(text)); }
  function findNorm(text, opts) {
    opts = opts || {};
    var orig = String(text || ''), he = isHebrew(orig);
    // read a rewritten copy (HE_NORM / EN_NORM) and map every link back onto the original text.
    // English: Ĥ/ĥ become Ḥ/ḥ first; one letter for one, so positions do not move.
    var src = he ? orig : orig.replace(/ĥ/g, 'ḥ').replace(/Ĥ/g, 'Ḥ');
    var n = normalize(src, he ? HE_NORM : EN_NORM);
    if (n.t === orig) return findIn(orig, opts, he);
    return findIn(n.t, opts, he).map(function (h) {
      h.start = n.at(h.start); h.end = n.at(h.end, true); h.text = orig.slice(h.start, h.end); return h;
    }).filter(function (h) { return h.end > h.start; });
  }

  // Works whose bare number after a siman is a se'if katan of THAT siman: "SA 135:1; MA 2; Taz 2; MB 3".
  var SK_WORKS = {'Mishnah Berurah': 1, 'Turei Zahav': 1, 'Siftei Kohen': 1, 'Magen Avraham': 1, 'Kaf HaChaim': 1,
    'Eliya Rabba': 1, 'Pitḥei Teshuva': 1, 'Ḥelkat Meḥokek': 1, 'Beit Shmuel': 1, 'Shaar HaTziyun': 1};

  function findIn(text, opts, he) {
    var cite = C(), out = [];

    // Pearls' own chapters first, so the grammar never reads them as a tractate.
    var masked = text.replace(PH_SELF, function (m, vol, ch, se, at) {
      out.push({start: at, end: at + m.length, text: m, internal: true, resolved: true,
        ref: 'Peninei Halakhah, ' + vol.trim().replace(/’/g, "'") + ' ' + ch + ':' + se, work: 'Peninei Halakha'});
      return new Array(m.length + 1).join('\u0000');
    });
    midrash(masked, he, opts).forEach(function (h) {
      out.push(h);
      masked = masked.slice(0, h.start) + new Array(h.end - h.start + 1).join('\u0000') + masked.slice(h.end);
    });

    if (cite) {
      var r = {cites: []};
      try { r = (he ? cite.scanHe : cite.scan)(masked) || r; } catch (e) { r = {cites: []}; }
      var cites = (r.cites || []).slice().sort(function (a, b) { return a.at - b.at; });
      var ctx = ctxFor(opts), prev = null, lastSim = null;
      cites.forEach(function (c, i) {
        var next = i + 1 < cites.length ? cites[i + 1].at : text.length;
        var res = {};
        var w = c.id >= 0 ? cite.WORKS[c.id] : null;
        var bareSK = !!(w && SK_WORKS[w.t] && /^\d{1,3}$/.test(String(c.loc || '')));
        if (bareSK) {
          // a bare number after one of these works is a se'if katan, never a siman
          if (lastSim) {
            var c2 = Object.assign({}, c, {loc: lastSim.siman + ':' + c.loc, form: 'num2', sec: c.sec || lastSim.sec || null});
            try { res = cite.resolve(c2, ctx, prev) || {}; } catch (e) { res = {}; }
          } else res = {resolved: false, why: 'After the ' + w.t + ' a bare number is a se’if katan, and this citation does not say which siman it belongs to, so it is not linked.'};
        } else if (c.id >= 0) { try { res = cite.resolve(c, ctx, prev) || {}; } catch (e) { res = {}; } }
        var sm = String(c.loc || '').match(/^(\d{1,4})(?::|$)/);
        if (sm && w && !bareSK && (w.loc === 'simanSeif' || w.loc === 'secNum')) {
          prev = {siman: sm[1], sec: c.sec || w.sec || ctx.sec};
        }
        // Beit Yosef is on Sefaria by section and siman. Its section is the citation's own, else the one the
        // previous citation named, else the chapter's. "Hagahot Beit Yosef" is another work (Knesset HaGedola).
        var hagahot = /(?:Hagahot|הגהות)\s*$/.test(text.slice(Math.max(0, c.at - 12), c.at));
        if (w && w.t === 'Beit Yosef' && hagahot)
          res = {resolved: false, why: 'Hagahot Beit Yosef is a different work from the Beit Yosef, so this is not linked to it.'};
        else if (w && w.t === 'Beit Yosef' && !res.resolved && sm) {
          var bsec = c.sec || (lastSim && lastSim.sec) || (ctx.secBy ? ctx.sec : null);
          var bby = c.sec ? 'cite' : (lastSim && lastSim.sec) ? 'cite' : ctx.secBy;
          if (bsec && SEC_EN[bsec]) res = {resolved: true, ref: 'Beit Yosef, ' + SEC_EN[bsec] + ' ' + sm[1], sec: bsec, secBy: bby};
          else res = {resolved: false, why: 'Beit Yosef is divided by section of the Tur, and neither this citation nor this chapter says which.'};
        }
        // the section a run of citations has named so far carries to the next one that names none
        if (sm && w && !bareSK && (w.loc === 'simanSeif' || w.loc === 'secNum'))
          lastSim = {siman: sm[1], sec: c.sec || (lastSim && lastSim.sec) || null};
        var end = endOf(text, c, next, he);
        if (res.drop) return;
        // A bare name ("Rashi", "the Ran") is how the footnotes credit an opinion, not a reference to a place;
        // marking every one would bury the real links. A located reference that cannot be resolved IS marked.
        if (!res.resolved && !c.loc) return;
        // "the Yerushalmi indicates (Ta'anit 1:4)": a tractate's chapter:halakha read as the Mishnah because
        // the word Yerushalmi stands a few words back. Within one clause, it is the Jerusalem Talmud.
        if (res.resolved && /^Mishnah /.test(res.ref) && !/Mishna/i.test(String(c.lit)) &&
            /(?:Yerushalmi|Jerusalem Talmud)\b[^.;:)]{0,30}$/.test(text.slice(Math.max(0, c.at - 40), c.at)))
          res = {resolved: true, ref: res.ref.replace(/^Mishnah /, 'Jerusalem Talmud ')};
        out.push({start: c.at, end: end, text: text.slice(c.at, end),
          ref: res.resolved ? res.ref : '', resolved: !!res.resolved,
          why: res.resolved ? '' : (res.why || (c.id < 0 ? 'This abbreviation names more than one work, so it is not linked.' : 'This reference could not be turned into a text address.')),
          work: w ? w.t : (c.tract || c.lit), sec: res.sec || '', secBy: res.secBy || '',
          loc: c.loc || ''});
      });
    }

    if (!he) {
      var sctx = ctxFor(opts);
      SAH_RE.lastIndex = 0;
      var q;
      while ((q = SAH_RE.exec(masked))) {
        var qs = q.index, qe = q.index + q[0].length;
        out = out.filter(function (h) { return !(h.start >= qs && h.end <= qe); });   // drop the grammar's partial read
        if (out.some(function (h) { return qs < h.end && qe > h.start; })) continue;
        var ok = sctx.sec === 'OC' && sctx.secBy;
        out.push({start: qs, end: qe, text: text.slice(qs, qe), resolved: !!ok, work: 'Shulchan Arukh HaRav',
          ref: ok ? 'Shulchan Arukh HaRav, Orach Chayim ' + q[1] + ':' + q[2] + (q[3] ? '-' + q[3] : '') : '',
          why: ok ? '' : 'Shulchan Arukh HaRav is on Sefaria for Orach Chayim only, and this chapter is not set to Orach Chayim.',
          sec: ok ? 'OC' : '', secBy: ok ? sctx.secBy : ''});
      }
    }

    // English Tanakh names, only where the grammar found nothing at that place.
    if (!he) {
      TANAKH_RE.lastIndex = 0;
      var m;
      while ((m = TANAKH_RE.exec(masked))) {
        var name = m[1], start = m.index + m[0].indexOf(name), end = m.index + m[0].length;
        var book = TANAKH_ALIAS[name] || name;
        if (out.some(function (h) { return start < h.end && end > h.start; })) continue;
        out.push({start: start, end: end, text: text.slice(start, end), resolved: true, work: book,
          ref: book + ' ' + m[2] + ':' + m[3] + (m[4] ? '-' + m[4] : ''), sec: '', secBy: ''});
      }
    }

    out.sort(function (a, b) { return a.start - b.start; });
    // a citation whose literal we could not place (end <= start) is dropped from the page only
    return out.filter(function (h, i) {
      return h.end > h.start && !(i && h.start < out[i - 1].end);
    });
  }

  function sefariaUrl(ref) { return 'https://www.sefaria.org/' + encodeURIComponent(String(ref).replace(/\s+/g, '_')); }
  function meldarUrl(ref) { return 'https://meldar.pages.dev/?ref=' + encodeURIComponent(ref); }

  var SKIP = {A: 1, SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, BUTTON: 1, CODE: 1};
  // Inline elements a citation may run across: Peninei Halakha italicises the work and not the place,
  // "(<i>Berakhot</i> 32b)", so reading one text node at a time saw "Berakhot" and "32b" apart and linked
  // neither. Anything else (a block, a footnote number in <sup>, a <br>) ends the run, so "32b<sup>3</sup>"
  // never reads as "32b3".
  var INLINE = {I: 1, EM: 1, B: 1, STRONG: 1, U: 1, SPAN: 1, SMALL: 1, FONT: 1, MARK: 1, CITE: 1, Q: 1, ABBR: 1, BDI: 1, BDO: 1};
  function runsOf(root) {
    var runs = [], cur = null;
    function brk() { cur = null; }
    function walk(node) {
      for (var ch = node.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === 3) {
          if (!cur) { cur = {text: '', parts: []}; runs.push(cur); }
          cur.parts.push({node: ch, at: cur.text.length}); cur.text += ch.nodeValue;
        } else if (ch.nodeType === 1) {
          if (SKIP[ch.nodeName] || (ch.classList && ch.classList.contains('pc-cite'))) { brk(); continue; }
          var inl = INLINE[ch.nodeName];
          if (!inl) brk();
          walk(ch);
          if (!inl) brk();
        }
      }
    }
    walk(root);
    return runs.filter(function (r) { return r.text.length > 2; });
  }
  function pointAt(run, pos, isEnd) {   // a (text node, offset) for a position in the run's joined text
    var parts = run.parts;
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (pos > p.at || (pos === p.at && !isEnd) || (pos === p.at && i === 0)) return {node: p.node, off: pos - p.at};
    }
    return {node: parts[0].node, off: 0};
  }
  function linkify(root, opts) {
    opts = opts || {};
    if (!root || !root.ownerDocument && root.nodeType !== 9) return 0;
    var doc = root.ownerDocument || root, n = 0;
    runsOf(root).forEach(function (run) {
      var hits = find(run.text, opts);
      // last first, so splitting a text node never moves the place of a link before it
      for (var k = hits.length - 1; k >= 0; k--) {
        var h = hits[k], a0 = pointAt(run, h.start, false), b0 = pointAt(run, h.end, true);
        var r = doc.createRange();
        r.setStart(a0.node, a0.off); r.setEnd(b0.node, b0.off);
        // a link that covers a whole <i> takes the <i> inside it rather than splitting it
        while (r.startOffset === 0 && r.startContainer !== root && r.startContainer.parentNode !== root &&
               INLINE[r.startContainer.parentNode.nodeName] && r.startContainer.parentNode.firstChild === r.startContainer &&
               r.startContainer.parentNode.contains(r.endContainer) === false) r.setStartBefore(r.startContainer.parentNode);
        while (r.endContainer.nodeType === 3 && r.endOffset === r.endContainer.nodeValue.length && r.endContainer.parentNode !== root &&
               INLINE[r.endContainer.parentNode.nodeName] && r.endContainer.parentNode.lastChild === r.endContainer &&
               !r.endContainer.parentNode.contains(r.startContainer)) r.setEndAfter(r.endContainer.parentNode);
        var a = doc.createElement('a');
        a.className = 'pc-cite' + (h.resolved ? '' : ' pc-cite-named') + (h.internal ? ' pc-cite-internal' : '');
        if (h.resolved) { a.href = h.internal && opts.onInternal ? '#' : sefariaUrl(h.ref); a.setAttribute('data-ref', h.ref); }
        else { a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0'); }
        a.setAttribute('title', shown(h.resolved ? h.ref : h.why));
        if (h.secBy) a.setAttribute('data-secby', h.secBy);
        if (h.sec) a.setAttribute('data-sec', h.sec);
        if (h.base) a.setAttribute('data-base', h.base);
        (function (h) {
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (h.internal && opts.onInternal) return opts.onInternal(h.ref, h);
            (opts.onOpen || openPopup)(h, ev);
          });
        })(h);
        a.appendChild(r.extractContents());
        r.insertNode(a);
        n++;
      }
    });
    return n;
  }

  /* ── fetching the cited text ──────────────────────────────────────────────── */
  var cache = {};
  function flat(t) { return Array.isArray(t) ? t.flat(Infinity).filter(function (x) { return typeof x === 'string'; }).join(' ') : String(t || ''); }
  function strip(s) { return String(s).replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<i class="footnote">[\s\S]*?<\/i>/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
  function pick(vs, lang) {
    var cite = C();
    if (cite && cite.pickVersion) { var p = cite.pickVersion(vs, lang); return p && p.v ? p : null; }
    var v = vs.filter(function (x) { return x.language === lang; })[0];
    return v ? {v: v, title: v.versionTitle, licence: v.license} : null;
  }
  /* Every passage opened from a citation is kept on this device (IndexedDB "pearls-cite", one record per ref),
   * so it opens offline next time. A kept copy is shown at once and refreshed quietly when online; a failed
   * fetch never replaces it, and only a real passage is kept (never "could not reach" or "no text"). */
  var idb = null;
  function store() {
    if (idb) return idb;
    idb = new Promise(function (ok) {
      try {
        var rq = indexedDB.open('pearls-cite', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('texts'); };
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = rq.onblocked = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return idb;
  }
  function kept(ref) {
    return store().then(function (db) {
      if (!db) return null;
      return new Promise(function (ok) {
        try { var rq = db.transaction('texts').objectStore('texts').get(ref); rq.onsuccess = function () { ok(rq.result || null); }; rq.onerror = function () { ok(null); }; }
        catch (e) { ok(null); }
      });
    });
  }
  function keep(ref, out) {
    if (!out || out.error) return;
    store().then(function (db) { try { if (db) db.transaction('texts', 'readwrite').objectStore('texts').put(Object.assign({kept: Date.now()}, out), ref); } catch (e) {} });
  }
  function fetchSource(ref) {
    if (cache[ref]) return cache[ref];
    cache[ref] = kept(ref).then(function (old) {
      if (!old) return fromSefaria(ref).then(function (out) { keep(ref, out); if (out.error) delete cache[ref]; return out; });
      if (typeof navigator === 'undefined' || navigator.onLine !== false)   // refresh quietly; the next opening shows it
        fromSefaria(ref).then(function (out) { if (!out.error) { keep(ref, out); cache[ref] = Promise.resolve(out); } });
      return old;
    });
    return cache[ref];
  }
  function fromSefaria(ref) {
    var base = 'https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(String(ref).replace(/\s+/g, '_'));
    var get = function (q) { return fetch(base + q).then(function (r) { return r.json(); }); };
    return get('?version=primary&version=translation&return_format=text_only').then(function (j) {
      var vs = (j && j.versions) || [];
      // an empty answer is not an absent text: ask once more without the version labels (Meldar B1)
      if (!vs.some(function (v) { return v.text && flat(v.text); }))
        return get('?return_format=text_only').then(function (j2) { return [j2, (j2 && j2.versions) || []]; });
      return [j, vs];
    }).then(function (pair) {
      var j = pair[0], vs = pair[1], he = pick(vs, 'he'), en = pick(vs, 'en');
      var out = {ref: (j && j.ref) || ref, url: sefariaUrl(ref),
        he: he ? strip(flat(he.v.text)) : '', en: en ? strip(flat(en.v.text)) : '',
        heVersion: he ? he.title : '', enVersion: en ? en.title : '',
        heLicence: he ? (he.licence || '') : '', enLicence: en ? (en.licence || '') : ''};
      // a ref that comes back as a whole work is a failure dressed as a success (Meldar F2.0)
      if (out.he.length + out.en.length > 200000) out.error = 'Sefaria answered with far more than one passage, so this reference is not shown.';
      else if (!out.he && !out.en) out.error = 'Sefaria has no text at this reference. The number may be outside its numbering.';
      return out;
    }).catch(function () {
      return {ref: ref, url: sefariaUrl(ref), error: 'Could not reach Sefaria. This text has not been opened on this device before, so it needs a connection the first time.'};
    });
  }

  /* ── the default popup (Pearls can pass its own sheet as opts.onOpen) ────── */
  function el(doc, tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function licLine(v, l) { return v ? v + ' · ' + (l || 'licence not stated by the source') : ''; }
  function openPopup(h) {
    var doc = document, old = doc.getElementById('pc-pop');
    if (old) old.remove();
    var wrap = el(doc, 'div'); wrap.id = 'pc-pop'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    var card = el(doc, 'div', 'pc-card');
    var close = el(doc, 'button', 'pc-x', 'Close'); close.setAttribute('aria-label', 'Close');
    close.onclick = function () { wrap.remove(); };
    wrap.onclick = function (e) { if (e.target === wrap) wrap.remove(); };
    card.appendChild(close);
    card.appendChild(el(doc, 'div', 'pc-head', shown(h.resolved ? h.ref : h.text)));
    if (h.secBy === 'vol' || h.secBy === 'chapter')
      card.appendChild(el(doc, 'div', 'pc-note', 'The siman is the author’s. The section (' + h.sec + ') is our reading of this chapter, because the citation does not name one.'));
    if (!h.resolved) {
      card.appendChild(el(doc, 'p', 'pc-why', h.why));
      if (/not on Sefaria|not in Sefaria|in Sefaria’s catalogue|without text/i.test(h.why || '')) {
        var all = el(doc, 'div', 'pc-links'), a0 = el(doc, 'a', '', 'Books not on Sefaria');
        a0.href = '#missing'; a0.onclick = function () { wrap.remove(); };
        all.appendChild(a0); card.appendChild(all);
      }
    } else {
      var body = el(doc, 'div', 'pc-body', 'Loading from Sefaria…');
      card.appendChild(body);
      body.textContent = '';
      // a comment on a verse or a folio: the passage it comments on first, then the comment
      (h.base ? [h.base, h.ref] : [h.ref]).forEach(function (ref, i, all) {
        var part = el(doc, 'div', 'pc-part', 'Loading from Sefaria…');
        if (all.length > 1) body.appendChild(el(doc, 'div', 'pc-sub', ref));
        body.appendChild(part);
        fetchSource(ref).then(function (s) {
          part.textContent = '';
          if (s.error) { part.appendChild(el(doc, 'p', 'pc-why', s.error)); return; }
          if (s.he) { var hp = el(doc, 'p', 'pc-he', s.he); hp.dir = 'rtl'; hp.lang = 'he'; part.appendChild(hp);
            part.appendChild(el(doc, 'div', 'pc-lic', licLine(s.heVersion, s.heLicence)));
            if (!s.en) part.appendChild(el(doc, 'p', 'pc-note', 'Hebrew only on Sefaria: it has no English translation of this text.')); }
          if (s.en) { part.appendChild(el(doc, 'p', 'pc-en', s.en));
            part.appendChild(el(doc, 'div', 'pc-lic', licLine(s.enVersion, s.enLicence))); }
        });
      });
      var links = el(doc, 'div', 'pc-links');
      var a1 = el(doc, 'a', '', 'Open on Sefaria'); a1.href = sefariaUrl(h.ref); a1.target = '_blank'; a1.rel = 'noopener';
      var a2 = el(doc, 'a', '', 'Open in Meldar'); a2.href = meldarUrl(h.ref); a2.target = '_blank'; a2.rel = 'noopener';
      links.appendChild(a1); links.appendChild(a2); card.appendChild(links);
    }
    wrap.appendChild(card); doc.body.appendChild(wrap);
    close.focus();
  }

  /* ── selftest: offline, on forms taken from Peninei Halakha's footnotes ───── */
  function selftest() {
    var cases = [
      // [text, page ref, expected refs in order ('' = marked but not linked)]
      ['SA 345:2 and MB 345:5', 'Peninei Halakhah, Shabbat 21', ['Shulchan Arukh, Orach Chayim 345:2', 'Mishnah Berurah 345:5']],
      ['SA 345:2', '', ['']],                                                  // no chapter, no section: not guessed
      // a commentator before a verse links the commentary; "ad loc." takes the one folio, or the citation just before it
      ['saving the best for Shabbat (Beitza 16a). Bless God every day (Tehilim 68:20). Thus Hillel (Rashi ad loc.; Ramban, Shemot 20:8)', '', ['Beitzah 16a', 'Psalms 68:20', 'Rashi on Beitzah 16a', 'Ramban on Exodus 20:8']],
      ['(Shemot 20:8; Rashi ad loc.) and (Shabbat 6a; Tosafot ad loc.)', '', ['Exodus 20:8', 'Rashi on Exodus 20:8', 'Shabbat 6a', 'Tosafot on Shabbat 6a']],
      ['(Beitza 16a) and (Shabbat 6a), and later (Rashi ad loc.)', '', ['Beitzah 16a', 'Shabbat 6a']],    // two folios: "there" is ambiguous
      ['(Tosafot Ketubot 11a; Rashi ad loc.)', '', ['Tosafot on Ketubot 11a', 'Rashi on Ketubot 11a']],   // "there" is the folio, not Tosafot
      ['Ramban, Yehoshua 1:8', '', ['Joshua 1:8']],                           // the Ramban has no commentary on Joshua
      ['(ביצה טז, א). וכתב (רש"י שם; רמב"ן שמות כ, ח)', '', ['Beitzah 16a', 'Rashi on Beitzah 16a', 'Ramban on Exodus 20:8']],
      ['Rambam, Sabbath 14:1; Shabbat 6a', '', ['Mishneh Torah, Sabbath 14:1', 'Shabbat 6a']],
      ['Tosafot Beitza 22a', '', ['Tosafot on Beitzah 22a']],
      ['(Éxodo 20:8; Deuteronômio 6:5; Psaumes 23:1)', '', ['Exodus 20:8', 'Deuteronomy 6:5', 'Psalms 23:1']],  // the AI translations' book names
      ['as it says in Exodus 20:8-11', '', ['Exodus 20:8-11']],
      ['Devarim 6:7', '', ['Deuteronomy 6:7']],
      ['see Peninei Halakha: Shabbat 21:8 below', '', ['Peninei Halakhah, Shabbat 21:8']],
      ['SA 268:1', 'Peninei Halakhah, Giyur 3', ["Shulchan Arukh, Yoreh De'ah 268:1"]],
      ['Shulḥan Arukh Ha-Rav 187:1-3', 'Peninei Halakhah, Berakhot 4', ['Shulchan Arukh HaRav, Orach Chayim 187:1-3']],
      ['SA YD 89:1', 'Peninei Halakhah, Shabbat 21', ["Shulchan Arukh, Yoreh De'ah 89:1"]],   // the citation's own section wins
      ['שו"ע או"ח שלא, טו. רמב"ם הל׳ שבת ה, ג', '',
        ['Shulchan Arukh, Orach Chayim 331:15', 'Mishneh Torah, Sabbath 5:3']],
      // works the grammar does not hold, each of which it used to misread as something that fetches clean
      ['As the Sages say (Devarim Rabba 8:1)', '', ['Devarim Rabbah 8:1']],
      ['Yerushalmi Pesachim 10:3', '', ['Jerusalem Talmud Pesachim 10:3']],            // not Mishnah Pesachim
      ['the Yerushalmi indicates (Ta’anit 1:4)', '', ['Jerusalem Talmud Taanit 1:4']],
      ['Yerushalmi, Pe’ah, chapter 2, halachah 4', '', ['Jerusalem Talmud Peah 2:4']],
      ['Zohar Bamidbar 120:2', '', ['']],                                             // not Numbers 120:2
      ['Yalkut Shimoni, Tehilim 795', '', ['Yalkut Shimoni on Nach 795']],             // not Psalms 795
      ['Sifrei, Re’eh §53; Avot 1:12', '', ['Sifrei Devarim 53', 'Pirkei Avot 1:12']],
      ['תוספתא יומא ד, א', '', ['Tosefta Yoma 4:1']],                                 // not Yoma 4a
      ['ירושלמי שביעית ו, א; ב"ר טז, ד', '', ['Jerusalem Talmud Sheviit 6:1', 'Bereshit Rabbah 16:4']],
      ['תנחומא כי תצא ג', '', ['Midrash Tanchuma, Ki Teitzei 3']],
      ['איכה רבה פתיחתא כד', '', []],                                                 // a petichta, not chapter 418
      // the Hebrew volumes: forms the grammar did not read, or read as something else
      ['כמו שנאמר (שמות כ, ח)', '', ['Exodus 20:8']],
      ['בע"ז כ, א', '', ['Avodah Zarah 20a']],                                         // a prefixed abbreviated tractate
      ['רמב"ם איסו"ב יא, ה', '', ['Mishneh Torah, Forbidden Intercourse 11:5']],
      ['שבלי הלקט מד', '', ['Shibbolei HaLeket 44']],
      ['תרומת הדשן פסקים קכ', '', ['Terumat HaDeshen, Part II 120']],
      ['תשב"ץ ח"ד א', '', ['']],                                                       // part IV: Sefaria has no siman form
      ['שו"ע או"ח קלה, א; ב"י יג', 'Peninei Halakhah, Kashrut 3',
        ['Shulchan Arukh, Orach Chayim 135:1', 'Beit Yosef, Orach Chayim 13']],         // the section named just before wins
      ['כמבואר לעיל ג, ב', 'Peninei Halakhah, Kashrut 3', ['Peninei Halakhah, Kashrut 3:2']],
      // a bare number after the MB, Taz or MA is a se'if katan on the siman just cited, never a siman of its own
      ['SA 135:1; Magen Avraham 2; Taz 2; MB 3', 'Peninei Halakhah, Shabbat 21',
        ['Shulchan Arukh, Orach Chayim 135:1', 'Magen Avraham 135:2', 'Turei Zahav on Shulchan Arukh, Orach Chayim 135:2', 'Mishnah Berurah 135:3']],
      ['MB 9', '', ['']],
      ['Hagahot Beit Yosef 135:1', '', ['']],                                           // a different work
      ['(פר"ח יסה"ת ט, ג)', '', ['Peri Chadash on Mishneh Torah, Foundations of the Torah 9:3']],
      ['(פר"ח קטו, ו)', '', ['']],                                                     // on the SA: not on Sefaria
      ['שבט הלוי ד, רכה; ברכ"י רמב, כא; מנח"י א, ס', '', ['', '', '']],                 // not on Sefaria: named
      // the English and AI-translated volumes
      ['Rambam, Hilkhot Shabbat 5:3', '', ['Mishneh Torah, Sabbath 5:3']],
      ["And so wrote the Or Zarua (Hilkhot Keri'at Shema 1:15)", '', []],            // another author's Hilkhot, not the Rambam's
      ['as it says (Yehoshua 1:8); II Shmuel 7:12', '', ['Joshua 1:8', 'II Samuel 7:12']],
      ['Berachot 6a', '', ['Berakhot 6a']],                                           // a tractate spelled another way
      ['Arukh Ha-shulḥan 345:2', 'Peninei Halakhah, Shabbat 21', ['Arukh HaShulchan, Orach Chaim 345:2']],
      ['Ḥayei Adam 5:1', 'Peninei Halakhah, Kashrut 3', ['Chayei Adam 5:1']],
      ['Ḥayei Adam 5:1', 'Peninei Halakhah, Shabbat 21', ['']],                       // which of its two parts: not guessed
      ['Ḥavot Yair 184; Meshiv Davar 3:14', '', ['Havot Yair 184', '']],             // volume III has no text on Sefaria
      ["Sha'ar Ha-tziyun 3; Igrot Moshe OḤ 4:74", '', ['', '']],                     // not on Sefaria: named
      ['Peninei Halakha: Shabbat ch. 21', '', ['Peninei Halakhah, Shabbat 21:1']],
      ["Rabbeinu Yona (Sha'arei Teshuva 3:31); Rav Hai Gaon, Sha'arei Teshuva 14; Sha'arei Teshuva 63:4", '',
        ["Sha'arei Teshuvah 3:31", 'Teshuvot HaGeonim (Shaarei Teshuva) 14', '']]      // three works of one name
    ];
    var pass = 0, fail = 0, failures = [];
    cases.forEach(function (k) {
      var hits = find(k[0], {ref: k[1]}), got = hits.map(function (h) { return h.ref; });
      var ok = got.length === k[2].length && got.every(function (g, i) { return g === k[2][i]; })
        && hits.every(function (h) { return k[0].slice(h.start, h.end) === h.text && h.text.length > 0; });
      if (ok) pass++; else { fail++; failures.push({text: k[0], want: k[2], got: got, spans: hits.map(function (h) { return h.text; })}); }
    });
    // the link must cover the location, not just the work's name
    var span = find('SA 345:2 and MB 345:5', {ref: 'Peninei Halakhah, Shabbat 21'}).map(function (h) { return h.text; }).join('|');
    if (span === 'SA 345:2|MB 345:5') pass++; else { fail++; failures.push({spans: span, want: 'SA 345:2|MB 345:5'}); }
    return {pass: pass, fail: fail, failures: failures};
  }

  window.PEARLS_CITE = {find: find, linkify: linkify, fetchSource: fetchSource,
    sefariaUrl: sefariaUrl, meldarUrl: meldarUrl, openPopup: openPopup, isHebrew: isHebrew, selftest: selftest};
})();
