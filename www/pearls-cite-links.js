/* pearls-cite-links.js: turns the citations in a Peninei Halakha page into links to the texts they cite.
 *
 * Pearls ships Meldar's citation grammar (meldar-cite.js) UNMODIFIED, the same way it ships
 * meldar-record.js, and this file is the thin layer that puts the grammar's answers on the page.
 * Nothing here parses a citation by itself except one thing the grammar does not do: English
 * Tanakh book names ("Exodus 20:8"). The grammar knows Bereshit/Shemot/... only.
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
    '1 Chronicles': 'I Chronicles', '2 Chronicles': 'II Chronicles'};
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
  var PH_SELF = /Peninei Halakha?h?[:,]?\s*([A-Z][A-Za-z’' ]{2,30}?)\s+(\d{1,2}):(\d{1,3})/g;

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

  // returns [{start, end, ...hit}] for the works above; the caller masks them before the grammar runs
  function midrash(text, he) {
    var out = [];
    (he ? HE_RULES : EN_RULES).forEach(function (rule) {
      var re = rule[0], m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        var s = m.index, e = m.index + m[0].length;
        if (he && m[0] && !/[א-ת]/.test(m[0].charAt(0))) s++;   // the boundary character the pattern consumed
        var raw = text.slice(s, e).replace(/[\s,(]+$/, '');
        e = s + raw.length;
        if (out.some(function (h) { return s < h.end && e > h.start; })) continue;
        var r = rule[1](m);
        if (!r) continue;
        r.start = s; r.end = e; r.text = raw; r.sec = ''; r.secBy = ''; r.ref = r.ref || '';
        out.push(r);
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    });
    return out;
  }

  function find(text, opts) {
    opts = opts || {};
    text = String(text || '');
    var cite = C(), out = [];
    var he = isHebrew(text);

    // Pearls' own chapters first, so the grammar never reads them as a tractate.
    var masked = text.replace(PH_SELF, function (m, vol, ch, se, at) {
      out.push({start: at, end: at + m.length, text: m, internal: true, resolved: true,
        ref: 'Peninei Halakhah, ' + vol.trim() + ' ' + ch + ':' + se, work: 'Peninei Halakha'});
      return new Array(m.length + 1).join('\u0000');
    });
    midrash(masked, he).forEach(function (h) {
      out.push(h);
      masked = masked.slice(0, h.start) + new Array(h.end - h.start + 1).join('\u0000') + masked.slice(h.end);
    });

    if (cite) {
      var r = {cites: []};
      try { r = (he ? cite.scanHe : cite.scan)(masked) || r; } catch (e) { r = {cites: []}; }
      var cites = (r.cites || []).slice().sort(function (a, b) { return a.at - b.at; });
      var ctx = ctxFor(opts), prev = null;
      cites.forEach(function (c, i) {
        var next = i + 1 < cites.length ? cites[i + 1].at : text.length;
        var res = {};
        if (c.id >= 0) { try { res = cite.resolve(c, ctx, prev) || {}; } catch (e) { res = {}; } }
        var w = c.id >= 0 ? cite.WORKS[c.id] : null;
        var sm = String(c.loc || '').match(/^(\d{1,4})(?::|$)/);
        if (sm && w && (w.loc === 'simanSeif' || w.loc === 'secNum'))
          prev = {siman: sm[1], sec: c.sec || w.sec || ctx.sec};
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
        a.setAttribute('title', h.resolved ? h.ref : h.why);
        if (h.secBy) a.setAttribute('data-secby', h.secBy);
        if (h.sec) a.setAttribute('data-sec', h.sec);
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
  function fetchSource(ref) {
    if (cache[ref]) return cache[ref];
    var base = 'https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(String(ref).replace(/\s+/g, '_'));
    var get = function (q) { return fetch(base + q).then(function (r) { return r.json(); }); };
    cache[ref] = get('?version=primary&version=translation&return_format=text_only').then(function (j) {
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
      delete cache[ref];
      return {ref: ref, url: sefariaUrl(ref), error: 'Could not reach Sefaria. The text needs a connection.'};
    });
    return cache[ref];
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
    card.appendChild(el(doc, 'div', 'pc-head', h.resolved ? h.ref : h.text));
    if (h.secBy === 'vol' || h.secBy === 'chapter')
      card.appendChild(el(doc, 'div', 'pc-note', 'The siman is the author’s. The section (' + h.sec + ') is our reading of this chapter, because the citation does not name one.'));
    if (!h.resolved) {
      card.appendChild(el(doc, 'p', 'pc-why', h.why));
    } else {
      var body = el(doc, 'div', 'pc-body', 'Loading from Sefaria…');
      card.appendChild(body);
      fetchSource(h.ref).then(function (s) {
        body.textContent = '';
        if (s.error) { body.appendChild(el(doc, 'p', 'pc-why', s.error)); }
        else {
          if (s.he) { var hp = el(doc, 'p', 'pc-he', s.he); hp.dir = 'rtl'; hp.lang = 'he'; body.appendChild(hp);
            body.appendChild(el(doc, 'div', 'pc-lic', licLine(s.heVersion, s.heLicence))); }
          if (s.en) { body.appendChild(el(doc, 'p', 'pc-en', s.en));
            body.appendChild(el(doc, 'div', 'pc-lic', licLine(s.enVersion, s.enLicence))); }
        }
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
      ['Rambam, Sabbath 14:1; Shabbat 6a', '', ['Mishneh Torah, Sabbath 14:1', 'Shabbat 6a']],
      ['Tosafot Beitza 22a', '', ['Tosafot on Beitzah 22a']],
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
      ['איכה רבה פתיחתא כד', '', []]                                                  // a petichta, not chapter 418
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
