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
  var PH_SELF = /Peninei Hala(?:kh|ch)a?h?(?:\s*[:,]|\s+on)?\s*([A-Z][A-Za-z’'\- ]{2,30}?),?\s+(\d{1,2}):(\d{1,3})/g;

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

  // the volume a self-citation names -> Pearls' name for it ("Mo’adim" -> Festivals, "Tefillah" -> Prayer), or '' if Pearls lacks it
  [['Tefillah', 'Prayer'], ['Tefila', 'Prayer'], ['Tefillat Nashim', "Women's Prayer"], ["Laws of Women's Prayer", "Women's Prayer"],
    ['Moadim', 'Festivals'], ["Yamim Nora'im", 'Days of Awe'], ['Yamim Noraim', 'Days of Awe'], ["Shevi'it", 'Shemitah and Yovel'],
    ['Kashrut', 'Kashrut'], ['Laws of Kashrut', 'Kashrut'], ['Zmanim', 'Zemanim'], ['Laws of Prayer', 'Prayer'],
    ["Pessa'h", 'Pesach'], ['Pessah', 'Pesach'], ['Souccot', 'Sukkot'], ['Soukkot', 'Sukkot'],
    ['Simchat Habayit', "Simchat Habayit U'Virkhato"], ['Simḥat Ha-bayit', "Simchat Habayit U'Virkhato"],
    // Hebrew names as the English and French text spell them: "Ha-am Ve-ha'aretz", "Shevi'it Ve-yovel", "Chabbat"
    ["Ha-am Ve-ha'aretz", 'The Nation and the Land'], ["Ha'am Veha'aretz", 'The Nation and the Land'], ['HaAm VeHaAretz', 'The Nation and the Land'],
    ["Shevi'it Ve-yovel", 'Shemitah and Yovel'], ["Chevi'it veYovel", 'Shemitah and Yovel'], ['Sheviit veYovel', 'Shemitah and Yovel'],
    ['Chabbat', 'Shabbat']].forEach(function (r) { PH_VOL_EN[foldMT(r[0])] = r[1]; });
  var PH_TITLES = {}; Object.keys(PH_VOL_HE).forEach(function (k) { PH_TITLES[PH_VOL_HE[k]] = 1; });
  // the numbered collections, matched apart because folding would make "I" and "II" one word
  var PH_PARTS = {'likutim': ['Likkutim I', 'Likkutim II'], 'likkutim': ['Likkutim I', 'Likkutim II'], 'likoutim': ['Likkutim I', 'Likkutim II'],
    'collected essays': ['Likkutim I', 'Likkutim II']};
  function phVol(vol) {
    var v = String(vol).trim().replace(/’/g, "'").replace(/,$/, '');
    if (PH_TITLES[v]) return v;
    var p = /^(.*?)\s+(I{1,3})$/.exec(v);
    if (p) { var set = PH_PARTS[p[1].toLowerCase()]; return set ? set[p[2].length - 1] || '' : ''; }
    return PH_VOL_EN[foldMT(v)] || '';
  }

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

  /* ── Har Bracha's own Spanish and French citation forms (2026-11-22) ─────────────────────────────────
   * The official es/fr chapters cite in their own spelling, which the grammar does not read: measured,
   * 0.16 links per 1,000 characters against 1.49 in the official English (tools/cite_audit.js).
   * "Talmud Babilonio Tratado de Berajot 35(A)", "Shulján Aruj Oraj Jaím 65:1", "Mishná Berurá 185:1",
   * "Rambám Hiljot Terumot 3:23"; "Choul‘han ‘Aroukh 204, 1", "Michna Beroura 200, 9", "‘Houlin 106a", "Dt 8, 10".
   * Each is rewritten to the English house form before the grammar reads it, like EN_NORM; the forms are
   * distinct enough that none occurs in English text. A tractate is accepted only when its folded name
   * is one of the 63 (a word that only looks like one stays text). */
  function foldXl(s, fr) {
    s = String(s).replace(/[‘’ʿʾ`]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (fr) s = s.replace(/'h/g, 'X').replace(/ch/g, 'sh').replace(/X/g, 'ch').replace(/ou/g, 'u').replace(/q/g, 'k');
    else s = s.replace(/j/g, 'ch');
    return s.replace(/kh/g, 'ch').replace(/gu(?=[ei])/g, 'g').replace(/y/g, 'i').replace(/t[sz]/g, 'z').replace(/c(?!h)/g, 'k')
      .replace(/b/g, 'v').replace(/([^cs])h/g, '$1').replace(/^h/, '').replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1').replace(/h$/, '');
  }
  var TR_XL = {};
  TRACTATES.forEach(function (r) { [r[0]].concat(r.slice(2)).forEach(function (n) { TR_XL[foldXl(n)] = r[0]; }); });
  ['Beitsa', 'Betsa', 'Bétsa'].forEach(function (n) { TR_XL[foldXl(n, true)] = 'Beitzah'; });
  function tractXl(s, fr) { return TR_XL[foldXl(s, fr)] || ''; }
  var SEC_XL = function (s) {   // a section named in Spanish or French
    var f = foldXl(s || '', /['‘’]h|ou/i.test(s || ''));
    if (/^ora/.test(f)) return ', Orach Chayim';
    if (/^io/.test(f)) return ", Yoreh De'ah";
    if (/^even/.test(f)) return ', Even HaEzer';
    if (/^(?:ch|sh)o/.test(f)) return ', Choshen Mishpat';
    return '';
  };
  var TNK_FR = {'Gn': 'Genesis', 'Ex': 'Exodus', 'Lv': 'Leviticus', 'Nb': 'Numbers', 'Dt': 'Deuteronomy', 'Jos': 'Joshua',
    'Jg': 'Judges', '1 S': 'I Samuel', '2 S': 'II Samuel', '1 R': 'I Kings', '2 R': 'II Kings', 'Is': 'Isaiah', 'Jr': 'Jeremiah',
    'Ez': 'Ezekiel', 'Os': 'Hosea', 'Jl': 'Joel', 'Am': 'Amos', 'Ab': 'Obadiah', 'Jon': 'Jonah', 'Mi': 'Micah', 'Na': 'Nahum',
    'Ha': 'Habakkuk', 'So': 'Zephaniah', 'Ag': 'Haggai', 'Za': 'Zechariah', 'Ml': 'Malachi', 'Ps': 'Psalms', 'Pr': 'Proverbs',
    'Jb': 'Job', 'Ct': 'Song of Songs', 'Rt': 'Ruth', 'Lm': 'Lamentations', 'Qo': 'Ecclesiastes', 'Est': 'Esther', 'Dn': 'Daniel',
    'Esd': 'Ezra', 'Ne': 'Nehemiah', '1 Ch': 'I Chronicles', '2 Ch': 'II Chronicles'};
  Object.keys(TANAKH_ALIAS).forEach(function (k) { if (/[èéïÉ]|Nombres|Exode|Juges|Rois|Psaumes|Proverbes/.test(k)) TNK_FR[k] = TANAKH_ALIAS[k]; });
  var A = "[‘’'ʿ]";   // the French texts write ‘ before a ḥ or an ayin
  var LOCC = '(\\d{1,3})(?:\\s*,\\s*(\\d{1,3})(?![\\d,]*\\s*km))?';   // "204, 1" = 204:1
  var loc2 = function (a, b) { return a + (b ? ':' + b : ''); };
  // French works by their French names → the house form; the location "n, n" becomes "n:n"
  var FR_WORKS = [
    [A + '?Choul' + A + '?han ' + A + '?Aroukh(?:,?\\s+(Ora' + A + '?h ' + A + '?Ha[iï]m|Yor[eé] D[eé]' + A + '?a|Even Ha' + A + '?[eé]zer|' + A + '?Hochen Mich?pat))?', function (m) { return 'Shulchan Arukh' + SEC_XL(m[1]); }],
    ['Michna Beroura', function () { return 'Mishnah Berurah'; }],
    ['B[eé]our Halakha', function () { return 'Beur Halakha'; }],
    ['Maguen Avraham', function () { return 'Magen Avraham'; }],
    ['Tour[eé] Zahav', function () { return 'Taz'; }],
    ['Beit Yossef', function () { return 'Beit Yosef'; }],
    ['Birk[eé] Yossef', function () { return 'Birkei Yosef'; }],
    [A + '?Hay[eé] Adam', function () { return 'Chayei Adam'; }],
    ['Kaf Ha' + A + '?ha[iï]m', function () { return 'Kaf HaChaim'; }],
    [A + '?Aroukh Hachoul' + A + '?han', function () { return 'Aruch HaShulchan'; }],
    ['Elya Rabba', function () { return 'Eliya Rabba'; }],
    ['Cha' + A + '?ar Hatsioun', function () { return 'Shaar HaTziyun'; }]
  ];
  var SEC_ES = '(?:,?\\s+(Oraj Ja[ií]m|Yor[eé] De' + A + '?[aá]|Even HaEzer|J[oó]shen U?[Mm]ishpat))?';
  var PH_ES = {};
  [['Shabat', 'Shabbat'], ['Pesaj', 'Pesach'], ['Tefilá', 'Prayer'], ['Mo’adim', 'Festivals'], ['Moadim', 'Festivals'],
    ['Berajot', 'Berakhot'], ['Kashrut', 'Kashrut'], ['Zmanim', 'Zemanim'], ['Zemanim', 'Zemanim'], ['Sucot', 'Sukkot'],
    ['Iamim Noraim', 'Days of Awe'], ['Tefilat Nashim', "Women's Prayer"], ['Taharat HaMishpajá', 'Family Purity'],
    ['Mishpajá', 'Family'], ['Likutim', 'Likkutim I']].forEach(function (r) { PH_ES[foldXl(r[0])] = r[1]; });
  var ES_WORKS = [
    ['Shulj[aá]n Aruj' + SEC_ES + '(?! HaRav)', function (m) { return 'Shulchan Arukh' + SEC_XL(m[1]); }],
    ['Ram[aá]' + SEC_ES, function (m) { return 'Rema' + SEC_XL(m[1]); }],
    ['Jatam Sofer' + SEC_ES, function (m) { return 'Chatam Sofer' + SEC_XL(m[1]); }],
    ['Pitjei Teshuv[aá]', function () { return 'Pitchei Teshuva'; }],
    ['Jojmat Adam', function () { return 'Chokhmat Adam'; }],
    ['(Bereshit|Shemot|Vaikr[aá]|Bamidbar|Devarim) Rab[aá]', function (m) { return {v: 'Vayikra'}[m[1].charAt(0).toLowerCase()] ? 'Vayikra Rabbah' : m[1].replace(/á/, 'a') + ' Rabbah'; }],
    ['Vaikr[aá]', function () { return 'Vayikra'; }],
    ['Shulj[aá]n Aruj HaRav', function () { return 'Shulchan Arukh HaRav'; }],
    ['Mishn[aá] Berur[aá]', function () { return 'Mishnah Berurah'; }],
    ['Turei Zahav', function () { return 'Taz'; }],
    ['Siftei Coh?en', function () { return 'Shakh'; }],
    ['Aruj HaShulj[aá]n', function () { return 'Aruch HaShulchan'; }],
    ['Kaf HaJa[ií]m', function () { return 'Kaf HaChaim'; }],
    ['Beur Halaj[aá]', function () { return 'Beur Halakha'; }],
    ['Magu[eé]n Abraham', function () { return 'Magen Avraham'; }],
    ['Shaar Hatzi[uú]n', function () { return 'Shaar HaTziyun'; }],
    ['Sefer Hajinuj', function () { return 'Sefer Ha-ḥinukh'; }],
    ['Jay[ei]i? Adam|Jaié Adam', function () { return 'Chayei Adam'; }]
  ];
  var XL_NORM = [
    // a tractate with a folio: "(Talmud Babilonio) Tratado de Berajot 35(A)" · "‘Houlin 106a"
    [/(?:Talmud Babilonio,?\s+)?(?:Tratado de\s+)?((?:[‘'’]?[A-ZÁÉÍÓÚ][A-Za-zÀ-ÿ'’‘]*)(?:\s+[A-ZÁÉÍÓÚa-z][A-Za-zÀ-ÿ'’‘]*){0,2}?)\s+(\d{1,3})\s*(?:\(([AaBb])\)|([ab])\b)/g,
      function (m) {
        var fr = /[‘’']h|ou|ch/i.test(m[1]) && !/j/.test(m[1]), t = tractXl(m[1], fr) || tractXl(m[1], !fr);
        if (!t || +m[2] < 2 || +m[2] > 176) return null;
        return t + ' ' + m[2] + (m[3] || m[4]).toLowerCase();
      }],
    // "Talmud de Jérusalem, Qidouchin 4, 12" · "Talmud Jerosolimitano Tratado de Berajot 4:1"
    [/Talmud (?:de J[ée]rusalem|Jerosolimitano),?\s+(?:Tratado de\s+)?([‘'’]?[A-Z][A-Za-zÀ-ÿ'’‘]*(?:\s+[A-Z][A-Za-zÀ-ÿ'’‘]*)?)\s+(\d{1,2})\s*[,:]\s*(\d{1,2})\b/g,
      function (m) { var t = tractXl(m[1], true) || tractXl(m[1]); return t ? 'Yerushalmi ' + t + ' ' + m[2] + ':' + m[3] : null; }],
    // "Mishná Tratado de Terumot 1:5" · "Pninei Halajá Pesaj 2:3"
    [/Mishn[aá],?\s+Tratado de\s+([A-ZÁÉÍÓÚ][A-Za-zÀ-ÿ'’]*(?:\s+[A-ZÁÉÍÓÚ][A-Za-zÀ-ÿ'’]*)?)\s+(\d{1,2}):(\d{1,2})\b/g,
      function (m) { var t = tractXl(m[1]); return t ? 'Mishnah ' + t + ' ' + m[2] + ':' + m[3] : null; }],
    [/Pninei Halaj[aá],?\s+((?:[A-Z][A-Za-zÀ-ÿ'’]*)(?:\s+[A-Za-zÀ-ÿ'’]+){0,2}?)\s+(\d{1,2})(?=[:\s,;)])/g,
      function (m) { var v = PH_ES[foldXl(m[1])]; return v ? 'Peninei Halakha: ' + v + ' ' + m[2] : null; }],
    // Maïmonide: "Maïmonide, Hilkhot Berakhot 1, 15" · "Maïmonide (Berakhot 6, 2)"; "sur …" is his Mishnah commentary
    [/Ma[iï]monide((?:,\s*|\s*\(\s*|\s+)(?:Hilkhot\s+)?[A-Z][^\d,;()]{1,40}?\s+)(\d{1,2}),\s*(\d{1,3})\b/g,
      function (m) { return /^\W*sur\b/.test(m[1]) ? null : 'Rambam' + m[1] + m[2] + ':' + m[3]; }],
    // "Rambám Hiljot Shejitá 11:6" → "Rambam Hilkhot Shechita 11:6"
    [/\bRamb[aá]m\b/g, function () { return 'Rambam'; }],
    [/\bHi(?:lj|jl)ot\s+([A-ZÁÉÍÓÚ][^\d,;()]{1,40}?)(?=\s*,?\s*\d{1,2}:\d)/g,
      function (m) { return 'Hilkhot ' + m[1].replace(/j/g, 'ch').replace(/J/g, 'Ch').normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC'); }],
    // French Tanakh: "Dt 8, 10" · "Deutéronome 8, 10"
    [new RegExp('(^|[\\s(;])(' + Object.keys(TNK_FR).sort(function (a, b) { return b.length - a.length; }).join('|') + ')\\.?\\s+(\\d{1,3}),\\s*(\\d{1,3})\\b', 'g'),
      function (m) { return m[1] + TNK_FR[m[2]] + ' ' + m[3] + ':' + m[4]; }]
  ].concat(FR_WORKS.map(function (w) {
    return [new RegExp('(^|[^A-Za-zÀ-ÿ])(' + w[0] + ')\\s+' + LOCC, 'g'),
      function (m) { return m[1] + w[1](m.slice(2)) + ' ' + loc2(m[m.length - 2], m[m.length - 1]); }];
  }), ES_WORKS.map(function (w) {
    return [new RegExp('(^|[^A-Za-zÀ-ÿ])(' + w[0] + ')(?=,?\\s+\\d)', 'g'),
      function (m) { return m[1] + w[1](m.slice(2)); }];
  }));
  EN_NORM = EN_NORM.concat(XL_NORM);

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
  // CITE-BOUNDS (made by tools/make_cite_bounds.mjs from Sefaria's /api/shape, 2026-11-22)
  var BOUNDS = {"v":{"Genesis":"31.25.24.26.32.22.24.22.29.32.32.20.18.24.21.16.27.33.38.18.34.24.20.67.34.35.46.22.35.43.54.33.20.31.29.43.36.30.23.23.57.38.34.34.28.34.31.22.33.26","Exodus":"22.25.22.31.23.30.29.28.35.29.10.51.22.31.27.36.16.27.25.23.37.30.33.18.40.37.21.43.46.38.18.35.23.35.35.38.29.31.43.38","Leviticus":"17.16.17.35.26.23.38.36.24.20.47.8.59.57.33.34.16.30.37.27.24.33.44.23.55.46.34","Numbers":"54.34.51.49.31.27.89.26.23.36.35.16.33.45.41.35.28.32.22.29.35.41.30.25.18.65.23.31.39.17.54.42.56.29.34.13","Deuteronomy":"46.37.29.49.30.25.26.20.29.22.32.31.19.29.23.22.20.22.21.20.23.29.26.22.19.19.26.69.28.20.30.52.29.12","Joshua":"18.24.17.24.15.27.26.35.27.43.23.24.33.15.63.10.18.28.51.9.45.34.16.33","Judges":"36.23.31.24.31.40.25.35.57.18.40.15.25.20.20.31.13.31.30.48.25","I Samuel":"28.36.21.22.12.21.17.22.27.27.15.25.23.52.35.23.58.30.24.42.16.23.28.23.44.25.12.25.11.31.13","II Samuel":"27.32.39.12.25.23.29.18.13.19.27.31.39.33.37.23.29.32.44.26.22.51.39.25","I Kings":"53.46.28.20.32.38.51.66.28.29.43.33.34.31.34.34.24.46.21.43.29.54","II Kings":"18.25.27.44.27.33.20.29.37.36.20.22.25.29.38.20.41.37.37.21.26.20.37.20.30","Isaiah":"31.22.26.6.30.13.25.23.20.34.16.6.22.32.9.14.14.7.25.6.17.25.18.23.12.21.13.29.24.33.9.20.24.17.10.22.38.22.8.31.29.25.28.28.25.13.15.22.26.11.23.15.12.17.13.12.21.14.21.22.11.12.19.11.25.24","Jeremiah":"19.37.25.31.31.30.34.23.25.25.23.17.27.22.21.21.27.23.15.18.14.30.40.10.38.24.22.17.32.24.40.44.26.22.19.32.21.28.18.16.18.22.13.30.5.28.7.47.39.46.64.34","Ezekiel":"28.10.27.17.17.14.27.18.11.22.25.28.23.23.8.63.24.32.14.44.37.31.49.27.17.21.36.26.21.26.18.32.33.31.15.38.28.23.29.49.26.20.27.31.25.24.23.35","Hosea":"9.25.5.19.15.11.16.14.17.15.11.15.15.10","Joel":"20.27.5.21","Amos":"15.16.15.13.27.14.17.14.15","Obadiah":"21","Jonah":"16.11.10.11","Micah":"16.13.12.14.14.16.20","Nahum":"14.14.19","Habakkuk":"17.20.19","Zephaniah":"18.15.20","Haggai":"15.23","Zechariah":"17.17.10.14.11.15.14.23.17.12.17.14.9.21","Malachi":"14.17.24","Psalms":"6.12.9.9.13.11.18.10.21.18.7.9.6.7.5.11.15.51.15.10.14.32.6.10.22.12.14.9.11.13.25.11.22.23.28.13.40.23.14.18.14.12.5.27.18.12.10.15.21.23.21.11.7.9.24.14.12.12.18.14.9.13.12.11.14.20.8.36.37.6.24.20.28.23.11.13.21.72.13.20.17.8.19.13.14.17.7.19.53.17.16.16.5.23.11.13.12.9.9.5.8.29.22.35.45.48.43.14.31.7.10.10.9.8.18.19.2.29.176.7.8.9.4.8.5.6.5.6.8.8.3.18.3.3.21.26.9.8.24.14.10.8.12.15.21.10.20.14.9.6","Proverbs":"33.22.35.27.23.35.27.36.18.32.31.28.25.35.33.33.28.24.29.30.31.29.35.34.28.28.27.28.27.33.31","Job":"22.13.26.21.27.30.21.22.35.22.20.25.28.22.35.22.16.21.29.29.34.30.17.25.6.14.23.28.25.31.40.22.33.37.16.33.24.41.30.32.26.17","Song of Songs":"17.17.11.16.16.12.14.14","Ruth":"22.23.18.22","Lamentations":"22.22.66.22.22","Ecclesiastes":"18.26.22.17.19.12.29.17.18.20.10.14","Esther":"22.23.15.17.14.14.10.17.32.3","Daniel":"21.49.33.34.30.29.28.27.27.21.45.13","Ezra":"11.70.13.24.17.22.28.36.15.44","Nehemiah":"11.20.38.17.19.19.72.18.37.40.36.47.31","I Chronicles":"54.55.24.43.41.66.40.40.44.14.47.41.14.17.29.43.27.17.19.8.30.19.32.31.31.32.34.21.30","II Chronicles":"18.17.17.22.14.42.22.18.31.19.23.16.23.14.19.14.19.34.11.37.20.12.21.27.28.23.9.27.36.27.21.33.25.33.27.23"},"m":{"Berakhot":"5.8.6.7.5.8.5.8.5","Peah":"6.8.8.11.8.11.8.9","Demai":"4.5.6.7.11.12.8","Kilayim":"9.11.7.9.8.9.8.6.10","Sheviit":"8.10.10.10.9.6.7.11.9.9","Terumot":"10.6.9.13.9.6.7.12.7.12.10","Maasrot":"8.8.10.6.8","Maaser Sheni":"7.10.13.12.15","Challah":"9.8.10.11","Orlah":"9.17.9","Bikkurim":"11.11.12.5","Shabbat":"11.7.6.2.4.10.4.7.7.6.6.6.7.4.3.8.8.3.6.5.3.6.5.5","Eruvin":"10.6.9.11.9.10.11.11.4.15","Pesachim":"7.8.8.9.10.6.13.8.11.9","Shekalim":"7.5.4.9.6.6.7.8","Yoma":"8.7.11.6.7.8.5.9","Sukkah":"11.9.15.10.8","Beitzah":"10.10.8.7.7","Rosh Hashanah":"9.9.8.9","Taanit":"7.10.9.8","Megillah":"11.6.6.10","Moed Katan":"10.5.9","Chagigah":"8.7.8","Yevamot":"4.10.10.13.6.6.6.6.6.9.7.6.13.9.10.7","Ketubot":"10.10.9.12.9.7.10.8.9.6.6.4.11","Nedarim":"4.5.11.8.6.10.9.7.10.8.12","Nazir":"7.10.7.7.7.11.4.2.5","Sotah":"9.6.8.5.5.4.8.7.15","Gittin":"6.7.8.9.9.7.9.10.10","Kiddushin":"10.10.13.14","Bava Kamma":"4.6.11.9.7.6.7.7.12.10","Bava Metzia":"8.11.12.12.11.8.11.9.13.6","Bava Batra":"6.14.8.9.11.8.4.8.10.8","Sanhedrin":"6.5.8.5.5.6.11.7.6.6.6","Makkot":"10.8.16","Shevuot":"7.5.11.13.5.7.8.6","Eduyot":"14.10.12.12.7.3.9.7","Avodah Zarah":"9.7.10.12.12","Horayot":"5.7.8","Zevachim":"4.5.6.6.8.7.6.12.7.8.8.6.8.10","Menachot":"4.5.7.5.9.7.6.7.9.9.9.5.11","Chullin":"7.10.7.7.5.7.6.6.8.4.2.5","Bekhorot":"7.9.4.10.6.12.7.10.8","Arakhin":"4.6.5.4.6.5.5.7.8","Temurah":"6.3.5.4.6.5.6","Keritot":"7.6.10.3.8.9","Meilah":"4.9.8.6.5.6","Tamid":"4.5.9.3.6.3.4","Middot":"9.6.8.7.4","Kinnim":"4.5.6","Kelim":"9.8.8.4.11.4.6.11.8.8.9.8.8.8.6.8.17.9.10.7.3.10.5.17.9.9.12.10.8.4","Oholot":"8.7.7.3.7.7.6.6.16.7.9.8.6.7.10.5.5.10","Negaim":"6.5.8.11.5.8.5.10.3.10.12.7.12.13","Parah":"4.5.11.4.9.5.12.11.9.6.9.11","Tahorot":"9.8.8.13.9.10.9.9.9.8","Mikvaot":"8.10.4.5.6.11.7.5.7.8","Niddah":"7.7.7.7.9.14.5.4.11.8","Makhshirin":"6.11.8.10.11.8","Zavim":"6.4.3.7.12","Tevul Yom":"5.8.6.7","Yadayim":"5.4.5.8","Oktzin":"6.10.12","Sabbath":"11.7.6.2.4.10.4.7.7.6.6.6.7.4.3.8.8.3.6.5.3.6.5.5"},"d":{"Berakhot":"64a","Shabbat":"157b","Eruvin":"105a","Pesachim":"121b","Yoma":"88a","Sukkah":"56b","Beitzah":"40b","Rosh Hashanah":"35a","Taanit":"31a","Megillah":"32a","Moed Katan":"29a","Chagigah":"27a","Yevamot":"122b","Ketubot":"112b","Nedarim":"91b","Nazir":"66b","Sotah":"49b","Gittin":"90b","Kiddushin":"82b","Bava Kamma":"119b","Bava Metzia":"119a","Bava Batra":"176b","Sanhedrin":"113b","Makkot":"24b","Shevuot":"49b","Avodah Zarah":"76b","Horayot":"14a","Zevachim":"120b","Menachot":"110a","Chullin":"142a","Bekhorot":"61a","Arakhin":"34a","Temurah":"34a","Keritot":"28b","Meilah":"22a","Tamid":"33b","Niddah":"73a"},"s":{"Shulchan Arukh, Orach Chayim":"9.6.17.23.1.4.4.17.6.12.15.3.3.5.6.1.3.3.2.2.4.1.4.6.13.2.11.3.1.5.2.52.5.4.1.3.3.13.10.8.1.3.9.1.2.9.14.1.1.1.9.1.26.3.22.5.2.7.5.5.26.5.9.4.3.10.1.1.2.5.7.5.4.6.6.8.2.1.9.1.2.2.5.1.2.1.3.1.8.27.6.10.4.9.4.2.5.5.3.1.4.5.3.8.1.3.4.12.3.8.3.2.9.9.1.1.5.1.4.1.3.3.6.12.2.4.2.45.2.1.8.2.1.2.14.1.6.1.11.3.8.2.5.4.3.4.8.1.1.5.12.1.22.15.2.1.1.13.20.15.4.10.2.2.2.1.20.17.3.22.5.2.3.8.6.1.5.7.6.5.10.7.12.6.5.2.4.10.2.5.3.2.6.3.3.4.4.1.11.2.4.18.8.13.5.6.1.18.3.2.6.2.3.1.4.14.8.9.10.2.2.4.6.13.10.1.3.3.2.5.1.3.2.2.4.4.1.2.2.17.1.1.2.6.6.5.6.4.4.2.2.7.5.9.3.1.8.1.7.2.4.3.17.10.4.13.3.13.1.2.17.10.7.4.12.5.5.1.7.2.1.7.1.7.7.5.1.10.2.2.6.2.3.5.1.8.5.15.10.1.51.13.27.3.23.14.22.52.5.9.9.10.10.12.13.12.7.19.17.20.19.6.10.15.16.13.4.49.9.11.10.4.3.27.5.13.4.8.7.14.3.1.1.2.19.3.1.1.5.3.1.2.3.2.5.2.3.14.1.3.2.12.36.5.8.15.1.5.1.8.6.19.1.4.4.4.1.5.2.4.7.20.1.2.4.9.1.1.1.2.2.8.3.3.1.2.18.11.11.1.1.1.1.1.9.1.3.4.13.3.1.1.1.2.4.5.1.5.1.2.1.7.4.1.3.4.1.8.2.1.2.2.11.4.1.3.4.2.4.4.2.11.3.8.3.4.12.7.2.7.27.7.9.4.6.3.2.1.6.7.5.7.3.1.3.6.16.10.1.3.3.16.7.1.7.2.2.2.1.1.2.1.1.1.1.1.4.3.10.9.2.1.4.3.4.3.17.20.5.6.7.4.2.4.1.9.7.2.7.11.4.3.8.11.9.3.4.9.5.1.3.4.4.2.2.12.24.2.4.1.8.2.5.3.3.4.16.6.14.8.5.2.3.2.11.5.12.20.2.4.18.12.2.25.2.1.1.1.10.5.5.13.1.1.6.8.3.12.2.3.3.3.1.5.13.16.1.1.3.3.4.9.2.4.5.23.3.5.9.9.8.4.2.1.1.1.3.1.1.3.2.1.1.2.1.4.6.4.1.4.2.10.12.4.2.2.4.10.6.1.6.4.6.5.1.3.4.3.19.13.10.4.10.4.1.2.3.2.8.10.1.1.3.2.9.11.2.22.6.2.15.2.2.1.1.1.1.9.1.3.1.3.3.11.2.1.1.2.1.3.8.2.4.2.3.5.4.1.1.2.2.3.1.3.7.3.2.8.6.18.11.4.4.4.4.8.1","Shulchan Arukh, Yoreh De'ah":"14.11.1.7.3.4.1.1.1.3.4.2.6.6.3.12.3.20.8.4.5.2.6.20.3.2.1.24.1.2.4.8.11.10.10.17.7.5.25.6.10.9.6.10.2.6.5.12.5.3.4.7.5.5.13.10.21.12.2.3.33.4.2.21.14.10.6.15.21.6.3.4.6.1.3.6.1.1.3.6.9.5.10.17.3.10.11.2.4.4.8.9.1.9.7.5.3.9.7.4.9.4.7.3.14.2.2.7.2.10.7.16.16.12.3.7.1.13.20.16.7.12.26.27.11.7.4.5.20.10.2.7.7.13.16.1.6.11.15.1.8.15.6.2.9.15.5.12.5.3.14.2.4.2.3.3.3.2.3.23.11.5.3.4.1.3.1.27.0.2.1.6.19.8.8.8.40.3.19.12.12.6.1.12.4.5.14.6.34.54.1.5.1.14.17.13.5.48.13.1.75.9.7.4.2.5.1.5.1.3.4.1.3.2.6.12.48.6.3.23.14.1.4.1.1.3.3.51.9.1.1.20.1.74.6.6.12.23.17.25.9.36.9.18.22.26.4.8.16.5.14.12.12.2.2.6.11.13.6.1.1.7.5.6.13.14.85.12.11.2.7.4.6.7.6.13.1.4.5.2.5.19.5.2.2.23.2.15.6.1.3.13.5.29.7.69.56.2.2.7.15.2.2.1.31.12.3.5.2.3.1.3.7.11.7.6.3.6.4.7.23.5.1.14.2.5.5.3.10.9.146.1.14.48.10.3.1.2.5.39.6.1.2.20.8.1.3.3.4.1.2.4.7.1.1.1.2.3.2.1.5.6.7.7.2.4.6.3.1.1.6.2.9.11.11.4.3.13.5.25.6.5.2.5.3.1.2.2.8.7.3.3.4.6.3.3.2.1.14.2.7.12.10","Shulchan Arukh, Even HaEzer":"14.11.9.37.14.18.23.5.2.7.8.4.14.1.31.6.58.1.2.2.7.20.7.1.10.4.10.23.10.11.9.4.2.4.15.12.27.39.7.8.4.5.2.12.3.8.4.7.3.7.1.1.3.1.7.4.1.2.4.1.2.13.2.6.4.13.11.10.7.12.4.1.9.12.5.13.5.8.3.18.2.8.2.1.19.2.2.12.4.20.5.8.32.7.7.21.2.7.2.16.4.9.8.6.7.2.10.3.4.2.17.18.10.12.10.6.11.19.11.11.8.2.5.9.23.50.13.7.34.22.9.4.3.10.5.7.5.4.18.11.69.19.23.7.10.5.3.2.7.4.1.12.1.24.22.13.10.6.7.8.9.5.8.8.5.9.6.9.56.20.10.16.17.7.14.8.5.22","Shulchan Arukh, Choshen Mishpat":"6.1.4.1.5.1.12.5.8.4.6.20.7.8.5.5.12.6.3.1.1.3.1.1.5.4.2.26.3.14.4.2.18.35.14.2.22.1.17.2.5.15.29.11.23.38.2.1.10.1.7.2.1.5.2.7.2.5.1.12.16.1.2.1.24.42.38.2.6.6.23.45.20.7.25.3.11.8.14.2.32.13.4.5.7.9.39.33.6.16.9.14.18.9.6.6.30.11.8.3.11.5.11.16.6.3.12.21.6.11.24.5.3.7.6.2.7.4.6.2.12.9.15.1.10.23.2.2.22.7.14.6.7.6.2.2.3.8.4.15.20.3.4.4.7.25.5.2.31.7.3.1.20.32.44.7.13.9.4.3.6.7.6.8.1.1.2.2.2.2.17.9.4.5.63.51.5.3.1.1.3.12.9.2.10.2.4.6.1.18.4.16.1.3.11.5.7.15.4.12.2.15.10.11.12.4.21.1.10.3.7.9.2.13.8.14.7.25.6.18.1.4.5.2.6.6.39.20.2.10.28.23.1.4.28.9.2.3.2.4.12.10.25.1.11.17.5.13.5.26.2.2.33.1.9.4.7.2.9.11.4.21.3.8.1.5.27.5.6.3.5.18.18.1.31.6.15.10.6.12.10.1.3.4.10.5.3.2.5.28.28.22.4.6.3.8.1.2.1.4.10.2.15.6.7.8.7.7.5.3.6.20.4.2.4.3.4.1.1.5.2.2.1.1.1.1.2.2.1.5.3.6.8.4.3.4.20.9.11.8.8.1.2.4.2.19.1.8.5.1.1.1.4.6.3.10.3.12.12.10.8.13.11.9.2.4.6.1.11.7.4.3.3.6.9.1.1.9.4.4.1.1.5.4.2.4.1.16.20.12.12.1.4.6.1.10.2.5.5.4.2.1.3.2.3.5.4.2.4.38.7.5.3.2.3.1.7.18.3.44.14.2.4.11.5.1.10","Mishnah Berurah":"20.14.31.61.3.14.6.44.19.37.75.13.16.18.26.4.10.11.5.8.18.3.8.9.62.3.48.9.2.17.8.235.29.20.3.82.12.38.28.20.6.26.27.8.6.33.34.6.7.2.22.10.87.14.73.15.6.29.29.12.40.9.20.11.11.54.5.6.20.26.17.13.11.24.30.33.8.7.32.4.13.4.14.7.16.3.10.8.42.86.13.36.8.30.8.9.17.10.17.3.19.21.10.30.4.10.10.38.17.37.11.4.15.44.1.4.19.3.19.1.6.8.21.47.9.17.13.175.10.10.44.18.2.15.51.5.25.6.36.9.27.8.33.20.4.20.29.2.8.14.42.12.115.59.11.4.5.46.97.85.22.72.12.13.7.6.97.95.14.45.24.8.9.47.16.3.21.50.18.12.24.32.37.22.8.7.10.34.7.19.6.11.36.13.12.9.28.7.30.9.15.86.14.60.18.26.5.82.11.19.36.13.19.6.21.56.25.32.32.7.7.6.25.17.34.5.12.6.10.7.8.35.20.9.34.16.2.5.9.55.8.7.17.37.24.34.20.37.23.6.9.56.106.51.11.2.49.2.26.14.31.12.67.29.18.38.9.28.6.5.83.38.32.9.27.45.24.3.23.4.5.36.1.18.20.15.3.28.10.8.26.9.10.9.7.36.13.39.40.3.182.64.88.26.80.58.80.171.29.37.38.26.56.53.49.61.35.118.69.59.84.25.41.41.81.40.16.152.21.36.39.9.11.85.18.63.21.33.37.45.8.7.9.11.87.31.9.10.19.14.10.16.16.15.49.16.29.101.5.29.18.67.157.19.40.84.20.22.8.61.34.142.11.29.15.24.10.20.4.24.28.77.8.9.11.59.12.4.6.10.24.34.16.11.5.17.44.55.44.6.10.7.9.17.52.9.10.31.74.9.4.3.10.8.17.31.4.14.2.5.1.28.10.2.15.21.3.26.14.2.12.13.48.19.5.32.19.16.18.20.11.52.17.37.18.13.108.33.5.28.163.34.43.18.50.10.23.6.45.20.38.25.9.6.12.33.88.38.6.11.22.50.78.5.49.14.17.11.13.11.4.9.11.11.3.3.16.13.49.19.4.6.19.17.23.13.52.106.21.29.34.26.16.22.12.42.43.6.31.37.28.22.37.48.72.15.12.46.13.1.9.9.9.4.5.52.79.6.22.2.22.5.24.18.7.12.56.21.47.28.16.8.11.17.51.17.26.53.4.12.103.30.10.51.8.5.5.5.42.20.17.57.3.6.14.23.13.50.9.14.5.6.9.13.32.37.6.3.14.16.27.25.9.12.19.90.16.15.19.36.15.17.5.2.3.6.13.1.2.7.3.11.4.5.9.27.21.18.2.18.12.32.31.15.4.14.14.29.16.2.19.15.13.19.3.21.15.21.59.59.34.20.30.8.11.10.19.26.48.47.6.2.9.9.43.36.12.68.59.8.60.9.5.5.3.10.4.42.5.10.2.4.10.34.7.12.6.16.17.12.54.12.31.9.14.11.20.8.2.5.3.8.1.18.18.10.12.23.19.66.30.16.12.13.27.32.5","Arukh HaShulchan, Orach Chaim":"29.11.13.21.4.13.5.23.28.22.26.12.7.14.16.5.5.9.3.4.7.3.4.4.29.5.22.8.3.8.4.91.8.9.3.26.4.16.6.5.4.13.14.3.2.16.25.3.3.4.9.8.32.4.26.9.2.21.15.9.14.8.9.5.7.18.7.4.15.8.4.4.5.16.11.21.4.5.18.4.7.3.11.3.2.3.7.4.32.31.7.13.8.23.5.2.7.7.9.3.9.13.4.14.3.12.13.21.13.16.4.5.9.14.4.2.9.6.6.2.3.8.8.17.4.7.4.72.3.3.18.8.5.4.32.3.9.4.17.9.12.5.8.7.2.8.17.1.3.9.17.5.47.18.2.17.2.18.39.24.8.29.3.5.4.2.32.51.4.19.5.2.3.16.11.8.12.16.9.5.9.9.8.9.14.4.9.23.7.7.5.7.19.4.5.9.9.2.4.6.4.45.8.28.7.16.4.29.12.7.17.8.7.4.5.14.7.12.13.8.5.4.9.8.14.2.3.4.4.5.7.21.15.7.19.14.3.3.7.18.3.45.17.24.18.24.14.15.14.4.4.18.39.21.4.3.22.4.15.7.17.5.28.13.13.28.8.18.5.3.42.17.10.7.17.18.12.2.14.3.8.18.3.15.13.17.3.17.5.3.12.7.3.12.4.18.7.18.24.4.123.24.32.7.22.25.33.75.15.16.22.11.33.26.18.38.29.58.42.36.45.8.12.13.32.13.4.58.12.15.12.4.7.45.9.38.8.15.22.35.4.4.8.2.46.12.19.6.7.7.5.3.6.4.21.7.8.25.2.13.5.37.63.9.24.25.9.7.3.21.7.32.4.7.8.8.7.7.5.9.11.29.2.3.2.15.7.4.4.3.5.15.5.4.2.3.17.22.16.4.3.3.4.8.14.2.3.7.17.5.2.2.3.3.4.9.11.3.2.2.1.13.5.3.5.14.2.7.8.5.31.5.14.12.3.15.7.9.12.20.11.33.8.17.11.12.45.28.4.15.52.20.29.13.13.5.14.4.16.8.13.15.4.3.5.18.49.11.5.5.5.15.26.3.18.4.8.3.3.3.4.3.3.4.2.2.7.3.16.5.2.2.9.7.39.5.25.38.9.13.16.18.7.7.7.9.17.2.17.14.12.11.12.19.17.5.5.18.7.1.2.2.3.4.3.21.39.2.7.4.8.2.7.9.5.2.13.7.19.7.4.2.3.7.21.7.8.12.5.4.39.14.4.22.3.2.3.2.9.8.2.33.2.2.7.12.4.17.4.5.3.5.2.4.15.22.2.2.12.4.13.14.4.4.8.37.9.10.14.22.13.8.3.2.2.2.6.2.2.4.1.18.3.12.5.7.9.9.2.7.8.11.15.7.2.7.5.17.9.2.5.3.8.8.5.26.7.5.35.36.17.13.12.5.5.3.5.12.28.21.4.2.3.4.21.14.8.45.25.3.29.5.4.2.3.5.3.21.2.4.2.2.4.13.3.5.2.7.3.9.28.9.17.3.5.14.8.3.4.2.2.3.2.5.9.7.9.18.7.25.14.8.5.8.18.12.2","Arukh HaShulchan, Yoreh De'ah":"68.21.7.15.9.11.3.4.6.16.15.5.23.22.17.28.12.49.17.14.11.10.22.49.11.6.7.46.28.18.21.21.41.18.68.85.58.26.116.22.39.29.18.25.8.25.15.72.9.26.18.18.18.18.53.25.79.35.8.7.53.23.17.57.59.36.21.35.118.49.14.18.28.4.18.25.17.4.18.13.34.36.53.95.48.32.43.11.17.19.37.56.18.35.26.21.13.84.49.18.27.28.27.16.72.15.15.25.28.136.25.31.53.28.28.25.29.40.55.61.32.22.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.68.52.33.21.93.78.85.141.38.18.11.58.28.42.17.91.26.4.218.13.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.45.11.68.9.18.29.45.7.15.21.12.21.14.21.4.2.18.17.39.18.4.6.18.18.26.38.25.177.16.8.17.39.12.28.16.25.38.3.12.16.15.15.23.14.8.5.49.11.12.19.5.4.21.28.45.18.89.83.6.9.26.28.12.2.5.72.24.4.10.18.4.2.9.18.11.13.17.4.3.4.22.25.21.17.42.9.16.5.7.18.13.1.0.15.42.12.4.3.4.9.38.28.9.4.14.8.1.5.3.8.1.3.4.4.2.1.1.3.5.1.4.4.8.8.13.3.3.5.7.13.2.28.5.12.19.19.17.2.13.4.33.9.2.3.9.4.1.3.2.11.6.14.12.13.4.5.5.3.2.22.11.6.17.8","Shulchan Arukh HaRav, Orach Chayim":"19.10.25.21.3.9.7.30.9.23.35.7.9.15.16.2.4.8.3.6.5.1.5.8.42.5.24.10.1.5.2.80.6.9.2.6.3.11.11.11.1.6.9.2.3.11.10.3.1.3.13.2.36.4.26.8.5.11.6.5.25.3.10.4.3.13.2.2.9.5.6.5.3.7.10.11.2.4.11.3.3.2.5.1.4.1.4.2.9.25.6.10.4.10.4.3.5.5.4.1.5.5.3.7.1.4.5.18.5.10.4.1.9.11.1.1.5.2.6.2.3.3.8.14.4.4.3.60.2.2.6.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.2.21.0.19.25.19.8.16.2.2.3.1.23.23.0.0.0.0.0.11.0.0.7.9.8.6.9.6.15.3.5.4.9.17.8.8.1.7.2.3.4.7.9.2.11.3.5.24.7.18.6.15.2.0.0.0.0.11.7.2.5.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.13.16.22.19.19.12.14.13.8.5.20.29.15.4.1.13.1.8.5.7.5.25.16.9.27.6.18.4.2.30.14.12.8.13.17.8.4.9.3.5.20.1.14.10.5.3.14.3.6.8.7.4.7.5.19.9.21.21.4.63.25.24.0.38.29.38.89.11.20.15.15.25.21.20.25.11.31.29.28.16.0.12.12.22.13.5.55.10.11.14.3.6.29.5.22.5.9.11.18.4.1.11.2.27.13.10.3.6.4.2.4.5.3.17.4.8.22.2.8.6.22.44.9.10.18.1.4.1.10.6.22.1.4.5.4.1.5.2.7.7.23.3.1.4.9.2.1.1.2.3.9.3.3.1.4.20.14.15.1.2.2.1.4.9.3.3.1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.19.3.11.12.43.16.4.23.7.12.9.17.16.34.13.20.12.8.63.31.3.27.78.30.33.15.34.9.21.17.32.12.29.22.5.2.6.16.65.23.5.9.14.31.53.3.33.7.11.6.9.5.2.7.6.6.3.2.8.8.30.18.4.5.9.20.15.11.32.38.13.22.18.9.13.9.8.15.21.3.16.21.7.7.19.25.24.6.9.22.9.1.4.4.4.1.2.22.30.4.13.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.17.8.9.11.27.5.9.9.21.15.11.4.1.2.2.9.1.1.7.2.5.1.7.6.14.16.10.1.10.10.16.21.11.2.11.5.18.18.2.17.6.12.15.1.21.7.9.33.0.12.0.0.0.0.3.12.21.26.22.2.2.5.1.21.14.6.31.24.2.17","Magen Avraham":"12.8.15.28.2.10.1.21.8.13.26.7.8.10.14.2.3.4.2.3.3.1.2.3.32.1.21.4.1.7.4.69.8.6.1.3.4.15.15.5.1.7.15.5.2.16.14.4.1.2.11.1.33.4.17.9.3.8.7.4.16.3.10.3.4.15.1.1.9.6.5.4.3.9.9.13.1.2.15.0.4.3.5.2.5.0.4.3.17.40.5.7.5.14.2.3.8.4.6.0.7.7.6.8.2.6.5.16.10.16.4.0.7.14.0.0.7.1.7.0.3.2.14.18.3.5.5.75.2.4.22.6.0.6.23.1.13.4.14.4.9.1.9.9.2.7.12.1.3.6.18.6.49.23.3.2.3.18.31.22.13.18.2.8.4.3.42.44.7.23.4.4.4.17.5.1.10.13.8.4.10.12.13.11.3.3.3.18.2.7.2.7.13.3.5.2.12.1.8.5.6.36.5.26.9.8.1.26.5.10.13.6.7.0.6.22.7.12.10.4.2.1.11.10.20.0.2.4.6.6.2.17.8.2.10.4.1.1.7.29.4.4.5.20.8.16.9.20.8.2.6.26.43.26.3.1.20.1.12.3.13.3.33.16.10.21.3.15.3.1.32.9.15.2.11.15.9.1.14.1.5.18.0.8.12.3.0.14.4.1.11.5.5.4.1.11.5.20.17.1.62.27.23.12.18.29.33.79.9.11.25.10.17.16.21.26.20.45.19.25.30.9.16.9.35.13.2.55.5.19.10.3.7.35.4.15.7.13.14.18.1.1.4.3.16.4.5.5.6.4.5.5.7.5.19.6.13.16.1.7.5.21.40.4.15.21.5.3.3.12.8.31.5.5.1.9.2.0.2.9.9.17.2.2.3.15.2.1.1.1.2.11.1.2.2.1.15.16.8.2.1.1.3.5.16.3.0.4.21.0.1.0.2.3.5.3.3.2.1.1.1.11.6.1.6.14.1.10.8.1.8.6.22.10.2.17.8.4.8.7.6.19.6.14.7.6.46.10.2.12.53.13.15.5.19.6.9.1.16.5.14.7.5.1.5.10.37.15.2.3.8.17.30.1.18.4.7.5.2.2.2.2.3.5.2.1.5.4.17.9.1.4.6.9.11.7.19.39.12.13.16.15.5.10.3.17.16.3.15.17.11.6.15.20.27.6.5.14.6.0.4.2.3.0.2.21.28.2.8.1.12.2.10.7.2.3.17.2.17.10.9.1.6.5.26.9.8.15.2.6.45.17.7.28.1.2.1.3.15.12.6.17.1.3.7.11.8.22.2.9.3.5.2.6.14.12.4.0.11.9.17.8.6.7.12.25.5.5.5.12.9.7.4.1.2.3.8.0.0.3.1.1.1.2.6.10.12.7.1.5.3.6.13.7.3.3.3.11.11.0.6.2.4.7.1.9.4.6.25.20.10.5.9.2.4.3.7.10.17.18.2.1.2.0.8.9.3.24.28.0.28.4.1.2.0.8.1.12.0.3.0.1.2.11.3.3.3.4.1.4.14.6.12.1.4.5.12.3.2.1.1.2.0.5.1.5.6.12.11.25.11.7.3.6.15.18.2"}};
  // /CITE-BOUNDS
  function mishnahBound(h) {
    var m = h && h.resolved && /^Mishnah (?!Berurah)[A-Z][A-Za-z ]+ (\d+):(\d+)/.exec(h.ref || '');
    if (m && (+m[1] > 30 || +m[2] > 40)) {
      h.resolved = false; h.ref = '';
      h.why = 'These numbers are too large for a chapter of the Mishnah, so this is probably the division of another work and is not linked.';
    }
    return h;
  }
  /* ── checks after the grammar (Nov 2026, from a Sefaria check of all 6,506 linked refs) ──────────
   * Each rule below answers a failure that fetching every ref from Sefaria turned up:
   *  1. a range written short: "Psalms 78:36-7" is 36–37; "Devarim 11:32-12:1" crosses a chapter.
   *  2. "Kitzur Shulḥan Arukh 129:20" is the Kitzur, not the Shulchan Arukh.
   *  3. Even HaEzer has 178 simanim and Yoreh De'ah 403: an inherited section with a larger siman is Oraḥ Ḥayim (240, 451…).
   *  4. "MB ad loc. 33" after "MA 306:15; Birkei Yosef ad loc. 7" is 306:33, not 7:33.
   *  5. a bare commentary number with no siman before it ("MA 604") is the siman, not 604:604.
   *  6. numbers past the end of a book, or a se'if a siman does not have on Sefaria (BOUNDS, Sefaria's own shapes), are a typo or another work's
   *     division ("Megilat Ta'anit 9:2", "Hilkhot Eruvin 4:12" of another author): not linked. */
  var TNK = 'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles';
  var BOUND_V = new RegExp('^(' + TNK + ') (\\d+)(?::(\\d+))?(?:-(\\d+)(?::(\\d+))?)?$');
  var BOUND_M = /^Mishnah (?!Berurah)([A-Z][A-Za-z ]+?) (\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/;
  var BOUND_D = /^([A-Z][A-Za-z ]+?) (\d+)([ab])(?:-(\d+)([ab])?)?$/;
  var SA_END = {'Orach Chayim': 697, 'Orach Chaim': 697, "Yoreh De'ah": 403, 'Even HaEzer': 178, 'Choshen Mishpat': 427};
  function counts(s) { return s ? s.split('.').map(Number) : null; }
  // false when the ref names a chapter, verse, mishna or folio the work does not have
  function inBounds(ref) {
    var m, c;
    if ((m = BOUND_V.exec(ref)) && (c = counts(BOUNDS.v[m[1]]))) return chapOk(c, m);
    if ((m = BOUND_M.exec(ref)) && (c = counts(BOUNDS.m[m[1]]))) return chapOk(c, m);
    if ((m = BOUND_D.exec(ref)) && BOUNDS.d[m[1]]) {
      var end = /^(\d+)([ab])$/.exec(BOUNDS.d[m[1]]), last = 2 * +end[1] + (end[2] === 'b' ? 1 : 0);
      return 2 * +m[2] + (m[3] === 'b' ? 1 : 0) <= last && (!m[4] || 2 * +m[4] + (m[5] === 'b' ? 1 : 0) <= last);
    }
    if ((m = /^(.+) (\d+):(\d+)(?:-(\d+))?$/.exec(ref)) && (c = counts(BOUNDS.s[m[1]]))) {
      var n = c[+m[2] - 1];   // se'ifim of that siman on Sefaria (0: Sefaria has none)
      return +m[2] >= 1 && +m[2] <= c.length && +m[3] <= n && (!m[4] || +m[4] <= n);
    }
    if ((m = /, (Orach Chayim|Orach Chaim|Yoreh De'ah|Even HaEzer|Choshen Mishpat) (\d+)/.exec(ref))) return +m[2] <= SA_END[m[1]];
    if ((m = /^Mishnah Berurah (\d+)/.exec(ref))) return +m[1] <= 697;
    return true;
  }
  function chapOk(c, m) {
    var ch = +m[2], v = m[3] ? +m[3] : 0;
    if (ch < 1 || ch > c.length || v > c[ch - 1]) return false;
    if (m[4]) {   // range end: "-7" (a verse) or "-12:1" (chapter:verse)
      if (m[5] != null) { var ch2 = +m[4]; if (ch2 > c.length || +m[5] > c[ch2 - 1]) return false; }
      else if (v && +m[4] > c[ch - 1]) return false;
    }
    return true;
  }
  var OUT_WHY = 'Sefaria has no text at this number. It may be a misprint, or the numbering of another work, so it is not linked.';
  var SK_REF = /^(Mishnah Berurah|Beur Halakha|Magen Avraham|Kaf HaChaim|Turei Zahav on Shulchan Arukh, [A-Za-z' ]+|Siftei Kohen on Shulchan Arukh, [A-Za-z' ]+|Arukh HaShulchan, [A-Za-z' ]+|Shulchan Arukh HaRav, [A-Za-z' ]+|Shulchan Arukh, [A-Za-z' ]+) (\d+):(\d+)$/;
  // a citation by siman and se'if (not a verse, a mishna or a folio): its siman is m[1]
  var SIMAN_REF = new RegExp('^(?!Mishnah (?!Berurah))(?!(?:' + TNK + ') )(?!Peninei)[^\\d]+? (\\d+):\\d+');
  function fixHits(hits, text) {
    var prev = null, last = null;
    hits.forEach(function (h) {
      var before1 = last; last = h;
      if (!h.resolved || h.internal || !h.ref) return;
      var after = text.slice(h.end), before = text.slice(0, h.start), m;
      // 1 · short and cross-chapter ranges
      if ((m = /^(.*? )(\d+):(\d+)-(\d+)$/.exec(h.ref))) {
        var x = /^\s*:\s*(\d+)/.exec(after), from = m[3], to = m[4];
        if (x && +to > +m[2]) { h.ref = m[1] + m[2] + ':' + from + '-' + to + ':' + x[1]; h.end += x[0].length; h.text = text.slice(h.start, h.end); }
        else if (+to <= +from && to.length < from.length) h.ref = m[1] + m[2] + ':' + from + '-' + from.slice(0, from.length - to.length) + to;
        if (/-(\d+)$/.test(h.ref) && +/-(\d+)$/.exec(h.ref)[1] <= +from && !/-\d+:\d+$/.test(h.ref)) h.ref = m[1] + m[2] + ':' + from;
      }
      // 2 · the Kitzur
      if ((m = /^Shulchan Arukh, Orach Chayim (\d+:\d+(?:-\d+)?)$/.exec(h.ref)) && /\bKit[sz]ur\s+$/.test(before)) {
        var k = /\bKit[sz]ur\s+$/.exec(before);
        h.start -= k[0].length; h.text = text.slice(h.start, h.end);
        h.ref = 'Kitzur Shulchan Arukh ' + m[1]; h.work = 'Kitzur Shulchan Arukh'; delete h.sec; delete h.secBy;
      }
      // 3 · an inherited Even HaEzer or Yoreh De'ah past its last siman is Oraḥ Ḥayim (Kashrut's "SA 451:6" is Pesaḥ)
      if ((m = /, (Even HaEzer|Yoreh De'ah) (\d+)/.exec(h.ref)) && +m[2] > SA_END[m[1]] && h.secBy) {
        // commentaries Sefaria holds only outside Oraḥ Ḥayim: no Oraḥ Ḥayim ref to move to
        if (/^(?:Pitchei Teshuva|Siftei Kohen|Beit Shmuel|Chelkat Mechokek)\b/.test(h.ref)) { h.resolved = false; h.why = OUT_WHY; h.ref = ''; return; }
        h.ref = h.ref.replace(', ' + m[1] + ' ', /^Arukh HaShulchan/.test(h.ref) ? ', Orach Chaim ' : ', Orach Chayim '); h.sec = 'OC';
      }
      var sk = SK_REF.exec(h.ref), pk = prev && SIMAN_REF.exec(prev.ref);
      if (sk && !/:/.test(h.text)) {
        // 4 · "X ad loc. 7; MB ad loc. 33": the grammar took X's 7 for the siman; it is the last linked siman's
        var lastN = before1 && /(?:ad loc\.?|ibid\.?)\s*(\d+)\D*$/i.exec(before1.text);
        if (/ad loc|ibid/i.test(h.text) && lastN && lastN[1] === sk[2] && pk && pk[1] !== sk[2]) h.ref = sk[1] + ' ' + pk[1] + ':' + sk[3];
        // 5 · a bare number read as both siman and se'if
        else if (sk[2] === sk[3] && !/ad loc|ibid/i.test(h.text) && !(pk && pk[1] === sk[2])) h.ref = sk[1] + ' ' + sk[2];
      }
      // 6 · past the end of the work (a range that runs past it keeps its first number)
      if (!inBounds(h.ref)) {
        var one = h.ref.replace(/-[\d:]+$/, '');
        if (one !== h.ref && inBounds(one)) h.ref = one;
        else { h.resolved = false; h.why = OUT_WHY; h.ref = ''; return; }
      }
      prev = h;
    });
    return hits;
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

  function find(text, opts) { return commentaries(fixHits(findNorm(text, opts).map(mishnahBound), String(text || '')), String(text || ''), isHebrew(text)); }
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
      var v = phVol(vol);
      out.push(v ? {start: at, end: at + m.length, text: m, internal: true, resolved: true,
        ref: 'Peninei Halakhah, ' + v + ' ' + ch + ':' + se, work: 'Peninei Halakha'}
        : {start: at, end: at + m.length, text: m, resolved: false, ref: '', work: 'Peninei Halakha',
          why: 'This volume of Peninei Halakha is not in Pearls, and Sefaria does not carry it, so it is not linked.'});
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
      // (OC 331 has ten se'ifim on Sefaria, so these read ט; טו is past the end and is no longer linked)
      ['שו"ע או"ח שלא, ט. רמב"ם הל׳ שבת ה, ג', '',
        ['Shulchan Arukh, Orach Chayim 331:9', 'Mishneh Torah, Sabbath 5:3']],
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
        ["Sha'arei Teshuvah 3:31", 'Teshuvot HaGeonim (Shaarei Teshuva) 14', '']],     // three works of one name
      // Har Bracha's own Spanish and French citation forms
      ['Talmud Babilonio Tratado de Berajot 35(A)', '', ['Berakhot 35a']],
      ['Talmud Jerosolimitano Tratado de Nedarim 9:4', '', ['Jerusalem Talmud Nedarim 9:4']],
      ['Rambám Hiljot Shejitá 11:6; Rambám Mikvaot 1:9', '', ['Mishneh Torah, Ritual Slaughter 11:6', 'Mishneh Torah, Immersion Pools 1:9']],
      ['Shulján Aruj Oraj Jaím 206:1', '', ['Shulchan Arukh, Orach Chayim 206:1']],
      ['Pninei Halajá Shabat 21:8', '', ['Peninei Halakhah, Shabbat 21:8']],
      ['Choul\u2018han \u2018Aroukh 206, 1, Michna Beroura 3', 'Peninei Halakhah, Berakhot 6',
        ['Shulchan Arukh, Orach Chayim 206:1', 'Mishnah Berurah 206:3']],
      ['\u2018Houlin 106a; Dt 8, 10', '', ['Chullin 106a', 'Deuteronomy 8:10']],
      ['Ma\u00efmonide (sur Berakhot 6, 3)', '', []],                               // his Mishnah commentary: not guessed
      ['3,648 km', '', []],                                                        // a number, not a citation
      // the checks after the grammar (fixHits), each from a ref Sefaria refused
      ['(Psalms 78:36-7)', '', ['Psalms 78:36-37']],                               // a range written short
      ['(Devarim 11:32-12:1)', '', ['Deuteronomy 11:32-12:1']],                    // a range across chapters
      ['(Kitzur Shulḥan Arukh 129:20)', 'Peninei Halakhah, Days of Awe 3', ['Kitzur Shulchan Arukh 129:20']],
      ['(SA 240:11)', "Peninei Halakhah, Simchat Habayit U'Virkhato 2", ['Shulchan Arukh, Orach Chayim 240:11']],   // EH ends at 178
      ['(SA 451:6; Taz 451:8)', 'Peninei Halakhah, Kashrut 33', ['Shulchan Arukh, Orach Chayim 451:6', 'Turei Zahav on Shulchan Arukh, Orach Chayim 451:8']],   // YD ends at 403
      ["(Peninei Halakha, Pessa'h 10:5; Souccot 4:2)", '', ['Peninei Halakhah, Pesach 10:5']],
      ["(Peninei Halakha, Ha-am Ve-ha'aretz 6:12; Shevi'it Ve-yovel 10:11)", '', ['Peninei Halakhah, The Nation and the Land 6:12']],   // a hyphen in the volume's name
      ['(Peninei Halakha, Chabbat 5:4; Peninei Halakha, Likoutim II 8:6)', '', ['Peninei Halakhah, Shabbat 5:4', 'Peninei Halakhah, Likkutim II 8:6']],
      ['(MA 306:15; Birkei Yosef ad loc. 7; MB ad loc. 33)', 'Peninei Halakhah, Shabbat 22',
        ['Magen Avraham 306:15', '', 'Mishnah Berurah 306:33']],                   // "ad loc." is the siman, not the 7
      ['(Peninei Halakha: Mo’adim 10:3; Peninei Halachah Likutim I, 4:6)', '',
        ['Peninei Halakhah, Festivals 10:3', 'Peninei Halakhah, Likkutim I 4:6']],
      ['(Peninei Halakha: Collected Essays III 6:16)', '', ['']],                  // not in Pearls, not on Sefaria
      ['(Avoda Zara 86a; Megilat Ta’anit 9:2; Yehoshua 2:44)', '', ['', '', '']]   // past the end of the work
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
