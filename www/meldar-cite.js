/* MELDAR — THE CITATION LAYER (F2.0)
 * ===========================================================================
 * `window.MELDAR_CITE` — turns a Peninei Halakha chapter into the classical
 * refs it actually cites, by reading the posek's OWN FOOTNOTES.
 *
 * WHY THIS REPLACES THE HAND-ENTERED ANCHOR BASE.
 * F1.8 kept anchors by hand: 135 refs over 66 of 294 chapters. So PH Festivals
 * ch. 5 — "Mav'ir, Mekhabeh, and Electricity" — reported NO CLASSICAL ANCHORS,
 * while its own footnote 1 reads (measured 2026-08-07):
 *
 *   "Beitza 33b explains that the prohibition of lighting a fire on Yom Tov is
 *    on account of Molid … Raavad and Sefer Ha-mikhtam maintain … while Rambam
 *    (4:1) maintains … Rashba agrees with Rambam … This is the approach of
 *    Taz 502:1 …"
 *
 * That chapter yields 62 citations on its own. The whole hand base averaged 2.
 * A base that says "nothing entered" over a page that cites Beitza, Rambam,
 * Rashba and the Taz is not partial — it is wrong about the literature.
 *
 * ⚠️ THERE IS NO LINK GRAPH TO HARVEST. Measured first: Sefaria marks up NO
 *    refs inside PH footnotes — `data-ref` count is ZERO on every chapter
 *    tested. `/api/links/` returns nothing for a PH chapter either. The
 *    citations exist ONLY as abbreviated English prose. So this is a citation
 *    GRAMMAR over a closed vocabulary, not a graph query. That is why the
 *    work dictionary below is the whole asset.
 *
 * ⚠️ THE CHAPTER NUMBER IS IN THE TITLE, NEVER THE ARRAY POSITION. The alt-
 *    structure nodes are titled "5  Mav'ir, Mekhabeh, and Electricity" (two
 *    spaces) and `wholeRef` is null for every numbered chapter; position 0 is
 *    an unnumbered "Introduction". Reading position as the chapter number is
 *    off by one, and it fails SILENTLY AND PLAUSIBLY — it served the footnotes
 *    of "Hotza'ah and Muktzeh" as the chapter on fire, and they read perfectly
 *    well. `chapterNum()` parses the leading integer. Nothing else may.
 *
 * ⚠️ WHAT IS EXTRACTED IS A CITATION, NEVER A RELATION. A footnote's cluster
 *    — "Rif, Rambam, Rosh, and SA 528:1" against "Rashba and Rema 518:1" — is
 *    a fact about one sentence. That PH is reporting a disagreement is visible
 *    in his prose, but reading relation out of prose is precisely the F1 error
 *    in a new costume. `cluster` records WHICH REFS WERE CITED TOGETHER, which
 *    is a fact — packed as the 8th field and readable through `forChapter()`,
 *    because a documented feature no consumer can reach is the `secs` gate all
 *    over again. Measured on Festivals 5 n.1 it separates "Beitza 33b + Rashi +
 *    Meiri" from "Raavad + Rambam 4:1" from "Rashba + Rambam", which is exactly
 *    how the footnote's prose runs. Order comes from `yr`. Relation comes from
 *    nobody yet.
 *
 * ⚠️ A REF IS NOT VERIFIED UNTIL IT HAS BEEN FETCHED. `on:'render'` below is a
 *    HINT for labelling, never a promise. The chain builder fetches every rung
 *    and a 404 demotes it to named-not-rendered. That rule predates this file
 *    and this file does not get to opt out of it.
 *
 * ⚠️ FOUR THINGS THE GRAMMAR REFUSES TO GUESS, each found by running it:
 *      1. `Rambam (4:1)` — a parenthesised location on a bare name. Mishneh
 *         Torah is divided by BOOK, and the footnote does not say which book.
 *         So this is `partial`: named with its location, never resolved into a
 *         confident ref. Guessing the book is how you print "Prayer and the
 *         Priestly Blessing 8:2" as the Rambam on carrying (the F1.8 sin).
 *      2. `Shabbat 3:7` vs `Shabbat 134b` — same tractate name, two works. A
 *         folio is `\d+[ab]`; `\d+:\d+` on a tractate is the MISHNAH. Reading
 *         both as Talmud invented 15 false folios in the first pass.
 *      3. `Peninei Halakha:Shabbat 21:8` (no space after the colon) is PH
 *         citing ITSELF. It is masked before anything else runs, or it becomes
 *         a phantom tractate-Shabbat ref. It is kept as an `internal` edge —
 *         useful as chapter→chapter, never as a classical anchor.
 *      4. Which SECTION of the Shulḥan Arukh a citation sits in. It comes from
 *         the citation if stated, else from the TOPIC, and only as a last resort
 *         from the work's own `sec`. Reversing those last two made `coversSec()`
 *         compare each work against itself, so the `secs` gate could NEVER FIRE
 *         — and the refs it passed FETCH CLEAN, so `verify()` could not catch
 *         them either: "Shakh 339:1" in a Shabbat chapter resolved to a real
 *         Yoreh De'ah passage about the deathbed, served as a Shabbat rung. A
 *         gate that cannot fire is worse than no gate, because three files said
 *         it fired.
 *
 * ── THE SHAPE, AND WHY IT IS THE CHEAP ONE ─────────────────────────────────
 * Three layers, interned and lazily parsed:
 *
 *   1. WORKS — the interned dictionary, committed once, immutable, APPEND ONLY.
 *      Every citation anywhere is a 1–2 byte id into this. This single table is
 *      what keeps everything downstream small.
 *      ⚠️ DO NOT QUOTE ITS SIZE FROM THIS COMMENT — call MELDAR_CITE.counts().
 *      Appending one row (Tosafot) made four documents wrong in the same round
 *      they had just been corrected, and the count sits beside "the array index
 *      IS the cached key" — the line an agent reads just before appending.
 *      Measured 53 rows · 82 abbreviation patterns · 140 scanner matchers (82 + 44 tractates + 14 Tanakh books), 2026-08-07. The three numbers are DIFFERENT and only the first
 *      is what a cached id indexes into.
 *   2. extract() — ONE POSITIONAL SCAN of a chapter's footnote prose. Document
 *      order is preserved, because that is the only thing that can resolve
 *      "ad loc." to its antecedent. (Per-work passes cannot: the first cut
 *      scanned work-by-work and every `ad loc.` was unresolvable.)
 *   3. PACK — one delimited STRING per chapter: `id·loc·fn` rows joined by "|".
 *      Never parsed until that chapter is opened.
 *
 * Cost, against the alternative of a committed 294-chapter ref table:
 *   · wire   — interning removes the repetition. Measured on Festivals 5:
 *              62 citations = 1,290 B packed against 6,189 B as JSON objects
 *              (4.8×, 20.8 B per citation).
 *   · load   — ZERO parse. 294 short strings stay strings; no object is
 *              allocated until something is opened.
 *   · query  — one hash lookup, one split of a ~340 B string.
 *   · api    — `GET /works` is immutable (ETag forever, one round trip ever);
 *              `GET /cites/:vol/:ch` is a few hundred bytes of static body,
 *              CDN-cacheable, no compute. The SAME extractor runs server-side
 *              and writes the SAME rows, so the client contract never changes.
 *   · growth — a new work is one dictionary row; a new chapter is one fetch.
 *              Nothing is hand-kept, so nothing drifts.
 *
 * The row stores the RAW location, not a resolved ref, on purpose: resolution
 * is cheap, and keeping it out of the cache means a fix to the resolver does
 * not invalidate a single cached chapter.
 *
 * CONTRACT — deliberately identical to E2 (meldar-ingest.js), which the app
 * already trusts: `forChapter()` is SYNCHRONOUS and reads the cache;
 * `hydrate()` fills it out of band. A miss says `read:false` and stops. It
 * never pretends.
 *
 * PROVENANCE — a new value, `ph-cite`: mechanically extracted from a posek's
 * own footnote. Stronger than `machine` (an unsigned guess at what a chapter is
 * about) and weaker than `ph-note` (a human read the footnote and signed it),
 * because the failure modes differ: a parser mis-resolves an abbreviation, a
 * reader mis-reads a sentence. Both belong on the page, under their own names.
 */
(function () {
  'use strict';

  /* ── 0 · TEXT ───────────────────────────────────────────────────────────
   * Entities survive tag-stripping, which is how "em&gt;Beitza 33b" reached
   * the scanner and cost the first citation of the chapter. Decode, then strip. */
  var ENT = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
             '&nbsp;': ' ', '&rsquo;': '\u2019', '&lsquo;': '\u2018',
             '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&ndash;': '\u2013',
             '&mdash;': '\u2014', '&hellip;': '\u2026'};
  function decode (s) {
    return String(s == null ? '' : s).replace(
      /&(?:amp|lt|gt|quot|#39|nbsp|rsquo|lsquo|ldquo|rdquo|ndash|mdash|hellip);/g,
      function (m) { return ENT[m] || m; });
  }
  /* ⚠️ DECODE FIRST, THEN STRIP, THEN STRIP AGAIN. The old order stripped tags
   * and then decoded, so a source containing "&lt;em&gt;" turned into a live
   * "<em>" AFTER the strip had already run — which is how the literal "em>"
   * reached the page as the opening words of a halakhic claim. */
  function prose (html) {
    var s = decode(String(html == null ? '' : html));
    s = s.replace(/<[^>]+>/g, ' ');
    s = decode(s).replace(/<[^>]+>/g, ' ');
    /* ⚠️ AND SOME OF THE MARKUP ARRIVES ALREADY BROKEN. Festivals 5's first
     * footnote begins "em&gt;Beitza 33b" — the opening "<" is simply gone in
     * Sefaria's own text, so there is no tag to strip and decoding leaves the
     * orphan "em>" as the first word of the chapter's headline claim. Repair is
     * bounded to a known set of inline tag names; a general `\w+>` rule would
     * eat real prose ("… 33b> " never occurs, but "p>" as a word does not need
     * inventing either). */
    s = s.replace(/(^|[\s(\u201c])(?:em|i|b|u|strong|span|sup|sub|p|br)>/g, '$1');
    return s.replace(/\s+/g, ' ').trim();
  }

  /* Sentence spans. ⚠️ A naive /[.!?]\s+/ splits on this corpus's abbreviations —
   * "n. 2", "p. 41", "s.v.", "ch. 3" — and every such split cuts a claim in half.
   * ⚠️⚠️ AND THE LOOKAHEAD REQUIRED A CAPITAL LETTER, WHICH HEBREW DOES NOT HAVE
   * (found 2026-08-08 by looking at the rendered page, not the data). Hebrew has
   * no case, so `[A-Z]` matched nothing, no boundary was ever found, and every
   * footnote came back as ONE span — which meant every claim in a Hebrew chapter
   * rendered the entire footnote, and two different claims displayed identical
   * text. The extractor was right and the reader was unusable: the unit is the
   * sentence, and there was only ever one of them. */
  var ABBR = /\b(?:n|nn|p|pp|ch|vol|no|cf|ff|sec|s\.v|e\.g|i\.e|R|Rav|Rabbi|St|vs)\.$/;
  function sentences (t) {
    var out = [], last = 0, re = /([.!?])(["'\u2019\u201d)\]]*)\s+(?=[A-Z\u05d0-\u05ea\u201c(\u2018])/g, m;
    while ((m = re.exec(t))) {
      if (ABBR.test(t.slice(Math.max(0, m.index - 7), m.index + 1))) continue;
      out.push([last, m.index + 1 + m[2].length]);
      last = re.lastIndex;
    }
    if (last < t.length) out.push([last, t.length]);
    return out;
  }
  /* Sefaria wraps PH footnotes in <i class="footnote">. Anything else on the
   * page is body text, which cites far less and far more loosely. */
  /* ⚠️⚠️ THE FOOTNOTE IS NESTED, AND A NON-GREEDY MATCH ENDED IT AT THE FIRST
   * INNER TAG. The first cut was `<i class="footnote">[\s\S]*?<\/i>`, which stops
   * at the FIRST `</i>` — but PH italicises tractate names INSIDE its footnotes,
   * so `<i class="footnote">This is the reason offered by Rambam. Rashi
   * (<i>Sukka</i> 2a)…</i>` was truncated to "…Rashi ( Sukka" and the rest of
   * the note — every citation after the first italic — was silently discarded.
   * Not refused, not named: invisible, which is the failure mode this module
   * exists to prevent.
   *
   * ⚠️ AND IT LOOKED LIKE A FACT ABOUT THE LITERATURE. Measured before the fix,
   *    citations per footnote ran 4.73 for Festivals and 0.29 for Sukkot IN THE
   *    SAME GRAMMAR — the volumes that cite tractates by italicised name lost
   *    almost everything, the volumes that cite by abbreviation ("SA 528:1")
   *    lost almost nothing. A per-chapter count cannot see this; citations per
   *    FOOTNOTE can, because it holds the denominator fixed.
   *
   * The tags must therefore be BALANCED, not matched lazily. */
  function footnotesOf (segs) {
    var all = (Array.isArray(segs) ? segs : [segs]).join(' ');
    var out = [], open = /<i[^>]*class="footnote"[^>]*>/g, m;
    while ((m = open.exec(all))) {
      var from = open.lastIndex, depth = 1, tag = /<\/?i\b[^>]*>/g, t, end = -1;
      tag.lastIndex = from;
      while ((t = tag.exec(all))) {
        if (t[0].charAt(1) === '/') { depth--; if (!depth) { end = t.index; break; } }
        else depth++;
      }
      if (end < 0) end = all.length;   /* unclosed: take the tail rather than drop it */
      out.push(prose(all.slice(from, end)));
      open.lastIndex = end;
    }
    return out.filter(function (t) { return t.length > 12; });
  }

  /* ── 1 · THE WORK DICTIONARY ────────────────────────────────────────────
   * id is the ARRAY INDEX and is the interned key. Never reorder this array;
   * append only. A cached row is a list of these integers.
   *
   *   pats  — abbreviations as they appear in PH's English footnotes, measured
   *           over 8 chapters / 62 footnotes / 60k chars. Longest wins.
   *   kind  — talmud · mishnah · code · comm · responsa · tanakh · internal
   *   yr    — year of composition. THE ONLY AUTOMATIC ORDERING WE HAVE, and it
   *           orders; it does not relate.
   *   sec   — the Shulḥan Arukh section a work covers, where it covers one.
   *           An OC-only commentary cannot be a rung on a YD topic (F1.8).
   *   loc   — how to read its location: folio · simanSeif · chapHal · sec+num
   *   on    — 'render' if Sefaria carries it, 'name' if it must be named and
   *           linked out. A HINT. The fetch is the authority.
   *   ref   — Sefaria's canonical title, for building the ref.             */
  var WORKS = [
    /*  0 */ {k: 'tanakh',  t: 'Tanakh',                 pats: [], kind: 'tanakh', yr: -1000, on: 'render', loc: 'chapVerse'},
    /*  1 */ {k: 'mishnah', t: 'Mishnah',                pats: [], kind: 'mishnah', yr: 200, on: 'render', loc: 'chapMishnah', ref: 'Mishnah'},
    /*  2 */ {k: 'bavli',   t: 'Babylonian Talmud',      pats: [], kind: 'talmud', yr: 500, on: 'render', loc: 'folio'},
    /*  3 */ {k: 'yeru',    t: 'Jerusalem Talmud',       pats: ['JT', 'Yerushalmi'], kind: 'talmud', yr: 400, on: 'render', loc: 'folio', ref: 'Jerusalem Talmud'},
    /*  4 ⚠️ THE RIF IS ON SEFARIA — PER TRACTATE (`Rif Shabbat 1a` fetched ✓).
     *    But a footnote that says only "Rif" gives no tractate, and picking one
     *    from the cluster would be OUR inference, not his citation — the F1.8
     *    Rambam error in a new costume. Named, with the reason stated. */
    /*  4 */ {k: 'rif',     t: 'Rif',                    pats: ['Rif'], kind: 'code', yr: 1080, on: 'name', avail: 'needsLoc', perTractate: true,
              note: 'Sefaria carries the Rif per tractate (Rif Shabbat, Rif Beitzah, Rif Eruvin…). This footnote names him with no tractate, and choosing one would be our guess rather than his citation.'},
    /*  5 */ {k: 'rashi',   t: 'Rashi',                  pats: ['Rashi'], kind: 'comm', yr: 1090, on: 'render'},
    /*  6 */ {k: 'mt',      t: 'Mishneh Torah',          pats: ['MT', 'Mishneh Torah', 'Rambam'], kind: 'code', yr: 1180, on: 'render', loc: 'bookChapHal', ref: 'Mishneh Torah'},
    /*  7 */ {k: 'raavad',  t: 'Raavad',                 pats: ['Raavad', "Ra'avad"], kind: 'comm', yr: 1190, on: 'name'},
    /*  8 */ {k: 'ramban',  t: 'Ramban',                 pats: ['Ramban'], kind: 'comm', yr: 1250, on: 'render'},
    /*  9 ✅ HIS RESPONSA ARE ON SEFARIA — PARTS IV–VII, AND NOT I–III (measured
     *    2026-08-08 against the full 66,625-title catalogue, then fetched).
     *    The old row said “not in Sefaria's catalogue”, read off /api/name/Rashba
     *    returning Rashbam — an autocomplete's negative, which F2.0 already
     *    recorded as worthless. `Teshuvot haRashba part IV 1` ✓ 1,270 ch ·
     *    `part V 1` ✓ · `part VI 1` ✓ · `part VII 1` ✓; parts I–III 404 under
     *    every form tried. So volumes 4–7 render and 1–3 are NAMED WITH THE
     *    REASON: partial coverage stated, never a blanket absence.
     *    ⚠️ These are his RESPONSA. His ḥiddushim are a different work and reach
     *    the page through meldar-locate (`Rashba on Shabbat 5a`). */
    /*  9 */ {k: 'rashba',  t: 'Rashba',                 pats: ['Rashba'], kind: 'responsa', yr: 1280, on: 'render', loc: 'volNum',
              volRef: 'Teshuvot haRashba part {v}', volHave: [4, 5, 6, 7],
              note: 'Sefaria carries parts IV–VII of his responsa and not I–III — checked against the full title list and fetched, 2026-08-08.'},
    /* 10 */ {k: 'meiri',   t: 'Meiri',                  pats: ['Meiri', "Me'iri", 'Me\u2019iri'], kind: 'comm', yr: 1290, on: 'name'},
    /* 11 */ {k: 'ritva',   t: 'Ritva',                  pats: ['Ritva'], kind: 'comm', yr: 1300, on: 'name'},
    /* 12 */ {k: 'rosh',    t: 'Rosh',                   pats: ['Rosh'], kind: 'code', yr: 1310, on: 'name', avail: 'absent',
              note: 'Sefaria has “Rosh on Torah” — his Torah commentary, not the halakhic Rosh a footnote on practical law is citing.'},
    /* 13 */ {k: 'ran',     t: 'Ran',                    pats: ['Ran'], kind: 'comm', yr: 1360, on: 'name'},
    /* 14 ⚠️ THE TUR IS DIVIDED BY SIMAN AND NOTHING ELSE. Measured: `Tur, Orach
     *    Chayim 208` ✓ 8,946 chars, `Tur, Orach Chayim 208:10` 404s. He shares
     *    `secNum` with the Arukh HaShulchan, which DOES take siman:se'if
     *    (`Orach Chaim 345:26` ✓) — so this cannot be a property of the form,
     *    only of the work. A se'if read from the footnote is dropped and said. */
    /* 14 */ {k: 'tur',     t: 'Tur',                    pats: ['Tur'], kind: 'code', yr: 1340, on: 'render', loc: 'secNum', fmt: 'sec', simanOnly: true, ref: 'Tur'},
    /* 15 */ {k: 'by',      t: 'Beit Yosef',             pats: ['Beit Yosef', 'BY'], kind: 'comm', yr: 1555, on: 'name', loc: 'secNum'},
    /* 16 */ {k: 'sa',      t: 'Shulchan Arukh',         pats: ['SA', 'Shulḥan Arukh', 'Shulchan Arukh', 'Shulchan Aruch', 'Shulhan Aruch'], kind: 'code', yr: 1565, on: 'render', loc: 'simanSeif', fmt: 'sec', ref: 'Shulchan Arukh'},
    /* 17 ⚠️ THE MAPAH IS NOT A STANDALONE TEXT. Measured: "Rema, Orach Chayim
     *    514:3" 404s and /api/name/Rema returns is_book false — Sefaria carries
     *    it INSIDE the Shulḥan Arukh marked הגה. The F1 chain already knew this
     *    (CLAUDE.md); the citation layer does not get to rediscover it as a
     *    broken rung. Named at its siman, with the reason on the page. */
    /* 17 */ {k: 'rema',    t: 'Rema',                   pats: ['Rema', 'Rama'], kind: 'code', yr: 1570, on: 'name', loc: 'simanSeif',
              note: 'Sefaria carries the Mapah inside the Shulḥan Arukh itself, marked הגה, so it is named at its siman rather than fetched as its own text.'},
    /* 18 */ {k: 'smag',    t: 'Semag',                  pats: ['Smag', 'Semag'], kind: 'code', yr: 1250, on: 'name'},
    /* 19 */ {k: 'taz',     t: 'Turei Zahav',            pats: ['Taz'], kind: 'comm', yr: 1646, on: 'render', loc: 'simanSeif', fmt: 'onSA', ref: 'Turei Zahav'},
    /* 20 ✓ `Siftei Kohen on Shulchan Arukh, Yoreh De'ah 87:1` fetched. ⚠️ YD and
     *    HM ONLY — there is no Shakh on Oraḥ Ḥayim, so `secs` gates it rather
     *    than letting an OC topic build a ref that 404s. */
    /* 20 */ {k: 'shakh',   t: 'Siftei Kohen',           pats: ['Shakh', "Sha'kh"], kind: 'comm', yr: 1646, sec: 'YD', secs: ['YD', 'HM'], on: 'render', loc: 'simanSeif', fmt: 'onSA', ref: 'Siftei Kohen'},
    /* 21 */ {k: 'bah',     t: 'Bach',                   pats: ['Baḥ', 'Bach'], kind: 'comm', yr: 1640, on: 'render', loc: 'simanSeif', fmt: 'sec', ref: 'Bach'},
    /* 22 */ {k: 'ma',      t: 'Magen Avraham',          pats: ['MA', 'Magen Avraham'], kind: 'comm', yr: 1692, sec: 'OC', on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Magen Avraham'},
    /* 23 ✓ `Eliyah Rabbah on Shulchan Arukh, Orach Chayim 339:1` fetched. Note the
     *    catalogue spelling — "Eliyah Rabbah", where PH writes "Eliya Rabba". */
    /* 23 */ {k: 'er',      t: 'Eliya Rabba',            pats: ['Eliya Rabba'], kind: 'comm', yr: 1712, sec: 'OC', secs: ['OC'], on: 'render', loc: 'simanSeif', fmt: 'onSA', ref: 'Eliyah Rabbah'},
    /* 24 ⚠️ ORAḤ ḤAYIM ONLY on Sefaria — measured, `Shulchan Arukh HaRav,
     *    Yoreh De'ah 184:3` 404s while the same siman in OC fetches 4,463 chars.
     *    Without `secs` a YD topic built a ref to nothing, which reads as our
     *    failure rather than as a gap in the library. */
    /* 24 */ {k: 'sah',     t: 'Shulchan Arukh HaRav',   pats: ['SAH', 'Shulḥan Arukh Ha-rav'], kind: 'code', yr: 1814, sec: 'OC', secs: ['OC'], on: 'render', loc: 'simanSeif', fmt: 'sec', ref: 'Shulchan Arukh HaRav'},
    /* 25 */ {k: 'ha',      t: 'Chayei Adam',            pats: ['Ḥayei Adam', 'Chayei Adam'], kind: 'code', yr: 1810, sec: 'OC', on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Chayei Adam'},
    /* 26 ⚠️ secSp:'noy' — MEASURED: `Arukh HaShulchan, Orach Chaim 345:26`
     *    resolves; the same ref spelled "Chayim" 404s. The Taz and the Baḥ want
     *    the y. THE SECTION SPELLING IS PER WORK, and a global one fails
     *    silently — as a missing rung, never as an error. */
    /* 26 */ {k: 'ahs',     t: 'Arukh HaShulchan',       pats: ['AHS', 'Arukh HaShulḥan', 'Aruch HaShulchan', 'Aruch Hashulchan'], kind: 'code', yr: 1893, on: 'render', loc: 'secNum', fmt: 'sec', secSp: 'noy', ref: 'Arukh HaShulchan'},
    /* 27 ⚠️ IN THE CATALOGUE (`Ben Ish Hai`) but its schema gave no readable
     *    section shape, so no ref form is verified yet. `shapeUnknown`, NOT
     *    absent — the difference matters: this one is worth an hour's work,
     *    where Yalkut Yosef is worth a letter to a rights holder. */
    /* 27 ✅ RENDERS as of 2026-08-07 — the "worth an hour, not a letter" case,
     *    done. Runs by parasha within two yearly cycles, and THE YEAR IS
     *    REQUIRED: most parashiyot carry halakhot in both, so picking one would
     *    be our guess rather than the footnote's citation. Year absent →
     *    partial, named with the parasha it gave. */
    /* 27 */ {k: 'bih',     t: 'Ben Ish Ḥai',            pats: ['Ben Ish Ḥai', 'Ben Ish Hai', 'Ben Ish Chai', 'BIH'], kind: 'code', yr: 1898, on: 'render', loc: 'parashaNum', ref: 'Ben Ish Hai'},
    /* 28 ⚠️ PH HYPHENATES HIM AND THE DICTIONARY DID NOT. Measured on the full
     *    corpus 2026-08-08: "Kaf Ha-ḥayim" was the single most-cited work the
     *    scanner could not read — 131 citations with a location, all invisible —
     *    while `Kaf HaChaim`/`Kaf HaḤayim` (no hyphen) were in `pats`. He is a
     *    principal Sephardi posek; losing him is not a rounding error. */
    /* 28 */ {k: 'kaf',     t: 'Kaf HaChaim',            pats: ['Kaf HaChaim', 'Kaf HaḤayim', 'Kaf Ha-ḥayim', 'Kaf Ha-Ḥayim', 'Kaf Ha-chayim', 'Kaf Ha-Chayim', 'Kaf HaChayim', 'KHC'], kind: 'comm', yr: 1905, on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Kaf HaChaim'},
    /* 29 */ {k: 'mb',      t: 'Mishnah Berurah',        pats: ['MB', 'Mishnah Berurah', 'Mishna Berura', 'Mishna Brurah', 'Mishna Berurah'], kind: 'comm', yr: 1907, sec: 'OC', on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Mishnah Berurah'},
    /* 30 */ {k: 'bhl',     t: 'Beur Halakha',           pats: ['BHL', 'Bei\u2019ur Halakha', 'Beur Halakha', 'Bei\u2019ur Halachah', 'Beur Halachah', 'Biur Halacha'], kind: 'comm', yr: 1907, sec: 'OC', on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Beur Halakha'},
    /* 31 ⚠️ Sha'ar HaTziyun is on Sefaria under no title we could find —
     *    /api/name/ returns Shaarei Teshuvah, Shaarei Kedusha, all unrelated.
     *    Named at its siman. It is cited 4× across two chapters, so dropping it
     *    silently would make the Mishnah Berurah look unaccompanied. */
    /* 31 */ {k: 'sht',     t: 'Shaar HaTziyun',         pats: ['SHT', 'Sha\u2019ar HaTziyun'], kind: 'comm', yr: 1907, sec: 'OC', on: 'name', loc: 'simanSeif', avail: 'absent',
              note: 'Not in Sefaria’s catalogue under any title — checked against the full title list, 2026-08-08.'},
    /* 32 */ {k: 'gra',     t: 'Biur HaGra',             pats: ['Gra', 'Bi\u2019ur HaGra'], kind: 'comm', yr: 1790, on: 'name', loc: 'simanSeif'},
    /* 33 */ {k: 'mm',      t: 'Maggid Mishneh',         pats: ['Maggid Mishneh'], kind: 'comm', yr: 1350, on: 'render'},
    /* 34 */ {k: 'km',      t: 'Kesef Mishneh',          pats: ['Kesef Mishneh'], kind: 'comm', yr: 1570, on: 'name'},
    /* ── modern responsa. Almost none are on a source we may use, which is
     *    exactly why they are NAMED and linked, never rendered (F1.8). ── */
    /* 35 ⚠️ `Igrot Moshe OḤ` WAS A PATTERN HERE AND IT BLOCKED ITS OWN SECTION.
     *    The matcher swallowed the marker into the name, so the section reader
     *    (which looks at the tail AFTER the work) never saw it — measured, every
     *    `Igrot Moshe OḤ 1:152` in the corpus resolved with no section at all
     *    while carrying one in plain sight. The name is the name; the section is
     *    read by SECRE like everybody else's. */
    /* 35 ⚠⚠ AND HE IS NOT IN SEFARIA'S CATALOGUE AT ALL. This row said
     *    `on:'render'` — measured 2026-08-08 against the full 66,625-title list,
     *    the only Igrot there are Iggerot HaRambam and Iggerot Tzfon. So 187
     *    partial and 116 bare citations carried a row claiming we could show
     *    him, and `unavailWhy` printed “we have not checked whether Sefaria holds
     *    Igrot Moshe” over the most-cited modern responsum in the corpus.
     *    Named, with the true reason. */
    /* 35 */ {k: 'igm',     t: 'Igrot Moshe',            pats: ['Igrot Moshe', 'IM'], kind: 'responsa', yr: 1960, on: 'name', loc: 'volNum', avail: 'absent',
              note: 'Not in Sefaria’s catalogue under any title — checked against the full 66,625-title list, 2026-08-08. Named at its volume and siman, and linked out rather than shown.'},
    /* 36 */ {k: 'ssk',     t: 'Shemirat Shabbat Ke-Hilkhata', pats: ['SSK'], kind: 'responsa', yr: 1965, on: 'name', loc: 'chapSeif'},
    /* 37 */ {k: 'yo',      t: 'Yabia Omer',             pats: ['Yabi\u2019a Omer', "Yabi'a Omer"], kind: 'responsa', yr: 1970, on: 'name', loc: 'volNum'},
    /* 38 */ {k: 'yd',      t: 'Yechaveh Daat',          pats: ['Yeḥaveh Da\u2019at', 'Yechaveh Da\u2019at', "Yechaveh Da'at"], kind: 'responsa', yr: 1977, on: 'name', loc: 'volNum'},
    /* 39 */ {k: 'olt',     t: 'Or le-Tziyon',           pats: ['Or le-Tziyon', 'Or Le-Tziyon'], kind: 'responsa', yr: 1985, on: 'name', loc: 'volNum'},
    /* 40 */ {k: 'tze',     t: 'Tzitz Eliezer',          pats: ['Tzitz Eliezer'], kind: 'responsa', yr: 1970, on: 'name', loc: 'volNum'},
    /* 41 ⚠️ PH SPELLS HIM WITH A K. The gap scan found "Halikhot Shlomo" cited 26
     *    times with a location and matching nothing, while `pats` held only the
     *    `ch` spelling — the same class of miss as Kaf Ha-ḥayim, found the same way. */
    /* 41 */ {k: 'hs',      t: 'Halichot Shlomo',        pats: ['Halichot Shlomo', 'Halikhot Shlomo'], kind: 'responsa', yr: 1990, on: 'name', loc: 'chapSeif'},
    /* 42 */ {k: 'os',      t: 'Orchot Shabbat',         pats: ['Orḥot Shabbat'], kind: 'responsa', yr: 2000, sec: 'OC', on: 'name', loc: 'chapSeif'},
    /* 43 */ {k: 'iy',      t: 'Ishei Yisrael',          pats: ['Ishei Yisrael'], kind: 'responsa', yr: 1998, sec: 'OC', on: 'name', loc: 'chapSeif'},
    /* 44 */ {k: 'yy',      t: 'Yalkut Yosef',           pats: ['Yalkut Yosef'], kind: 'responsa', yr: 1985, on: 'name', loc: 'simanSeif'},
    /* 45 */ {k: 'ma_ah',   t: 'Menuchat Ahava',         pats: ['Menuḥat Ahava'], kind: 'responsa', yr: 2000, on: 'name', loc: 'chapSeif'},
    /* 46 */ {k: 'dy',      t: 'Devar Yehoshua',         pats: ['Devar Yehoshua'], kind: 'responsa', yr: 1970, on: 'name', loc: 'volNum'},
    /* 47 */ {k: 'ya',      t: 'Yaskil Avdi',            pats: ['Yaskil Avdi'], kind: 'responsa', yr: 1950, on: 'name', loc: 'volNum'},
    /* 48 ✅ RENDERS 2026-08-07. Measured: `Responsa Rav Pealim, Volume I, Yoreh
     *    Deah 1` ✓ · `Volume I, Orach Chayim 25` ✓ · `Volume I, Even HaEzer 1` ✓.
     *    Four volumes (I–IV), each with OḤ · YD · EH; III–IV add Sod Yesharim,
     *    IV adds ḤM. A bare "1:25" is volume 1 siman 25, and the SECTION comes
     *    from the topic — exactly as it does for the Shulḥan Arukh. */
    /* 48 */ {k: 'rp',      t: 'Rav Peʿalim',            pats: ['Rav Pe\u2019alim', "Rav Pe'alim", 'Responsa Rav Pe\u2019alim', 'Rav Pealim'], kind: 'responsa', yr: 1900, on: 'render', loc: 'volSiman', secSp: 'rp', ref: 'Responsa Rav Pealim'},
    /* 49 */ {k: 'sy',      t: 'Sheelat Yaavetz',        pats: ['She\u2019elat Ya\u2019avetz'], kind: 'responsa', yr: 1750, on: 'name', loc: 'volNum'},
    /* 50 */ {k: 'shvy',    t: 'Shvut Yaakov',           pats: ['Shvut Yaakov'], kind: 'responsa', yr: 1710, on: 'name', loc: 'volNum'},
    /* 51 */ {k: 'ph',      t: 'Peninei Halakha',        pats: [], kind: 'internal', yr: 2000, on: 'render'},
    /* 52 ⚠️ APPEND ONLY BELOW — the array index is the interned cache key.
     *    Tosafot was missing because the English text glues it to what follows
     *    ("TosafotBeitza 21b"), so the word-boundary matcher never fired. */
    /* 52 */ {k: 'tos',     t: 'Tosafot',                pats: ['Tosafot', 'Tosfot', 'Tosafos'], kind: 'comm', yr: 1250, on: 'render', loc: 'folioOn', fmt: 'onTractate', ref: 'Tosafot'},
    /* 53 ⚠️ THE KITZUR IS NOT THE SHULḤAN ARUKH. Found by reading Halachipedia's
     *    footnotes: "Kitzur Shulchan Aruch 85:8 agrees" was being matched on its
     *    trailing words and filed as Shulchan Arukh 85:8 — a real, fetchable ref
     *    to a DIFFERENT work by a different author three centuries later. The
     *    matchers sort longest-first, so naming it here is the whole fix. */
    /* 53 */ {k: 'ksa',     t: 'Kitzur Shulchan Aruch',  pats: ['Kitzur Shulchan Aruch', 'Kitzur Shulchan Arukh', 'Kitzur SA'], kind: 'code', yr: 1864, on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Kitzur Shulchan Arukh'},
    /* 54–57 ⚠️ CHOSEN BY THE CORPUS, NOT FROM MEMORY. The full-corpus gap scan
     *    (2026-08-08) ranked every name cited WITH a location that produced no
     *    row; these four were the contemporary responsa above the noise floor.
     *    All are `on:'name'` — named at their location and linked out, never
     *    rendered — because none has been fetched from Sefaria, and a ref that
     *    has not been fetched is not a ref this project prints. Adding them as
     *    names costs nothing and stops a posek's own citation being invisible;
     *    promoting any to 'render' requires the fetch first. */
    /* 54 */ {k: 'myi',     t: 'Minḥat Yitzḥak',          pats: ['Minḥat Yitzḥak', 'Minchat Yitzchak', 'Minḥat Yitzchak'], kind: 'responsa', yr: 1955, on: 'name', loc: 'volNum'},
    /* 55 */ {k: 'pt',      t: 'Piskei Teshuvot',        pats: ['Piskei Teshuvot'], kind: 'responsa', yr: 2000, sec: 'OC', on: 'name', loc: 'simanSeif'},
    /* 56 */ {k: 'shl',     t: 'Shevet HaLevi',          pats: ['Shevet Ha-Levi', 'Shevet HaLevi'], kind: 'responsa', yr: 1970, on: 'name', loc: 'volNum'},
    /* 57 */ {k: 'azn',     t: 'Az Nidberu',             pats: ['Az Nidberu'], kind: 'responsa', yr: 1975, on: 'name', loc: 'volNum'},
    /* 58–60 — the second round of the same scan, after the first four cleared. */
    /* 58 */ {k: 'msh',     t: 'Minḥat Shlomo',           pats: ['Minḥat Shlomo', 'Minchat Shlomo'], kind: 'responsa', yr: 1980, on: 'name', loc: 'volNum'},
    /* 59 */ {k: 'tham',    t: 'Torat Ha-mo’adim',        pats: ['Torat Ha-mo’adim', "Torat Ha-mo'adim", 'Torat HaMoadim'], kind: 'responsa', yr: 1995, on: 'name', loc: 'chapSeif'},
    /* 60 */ {k: 'spk',     t: 'Sidur Pesaḥ Ke-hilkhato', pats: ['Sidur Pesaḥ Ke-hilkhato', 'Siddur Pesach Kehilchato'], kind: 'responsa', yr: 1985, sec: 'OC', on: 'name', loc: 'chapSeif'},
    /* 61–64 — third round of the same scan. ⚠️ BIRKEI YOSEF IS NOT A MINOR
     *    ADDITION: the Ḥida is a principal Sephardi authority, cited 12 times
     *    with a location and read by nothing. He is `on:'name'` like the rest
     *    until his ref shape has been FETCHED — the Ben Ish Ḥai case is the
     *    standing warning that a guessed form 404s, and the Shakh case that a
     *    guessed section resolves to a real passage about the wrong law. */
    /* 61 */ {k: 'biy',     t: 'Birkei Yosef',           pats: ['Birkei Yosef', 'Birkey Yosef'], kind: 'comm', yr: 1774, on: 'name', loc: 'simanSeif'},
    /* 62 */ {k: 'nav',     t: 'Nishmat Avraham',        pats: ['Nishmat Avraham'], kind: 'responsa', yr: 1980, on: 'name', loc: 'simanSeif'},
    /* 63 */ {k: 'ay',      t: 'Avnei Yashfeh',          pats: ['Avnei Yashfeh'], kind: 'responsa', yr: 1990, on: 'name', loc: 'volNum'},
    /* 64 */ {k: 'shum',    t: 'Shemesh U-magen',        pats: ['Shemesh U-magen', 'Shemesh Umagen'], kind: 'responsa', yr: 1990, on: 'name', loc: 'volNum'},
    /* ── 65+ · WORKS THE HEBREW HALF OF THE CORPUS CITES ────────────────────
     * Added 2026-08-08 with the Hebrew grammar below. Every one was found by
     * COUNTING it in the Hebrew footnotes first (they are cited 18–36 times
     * each across six volumes), then checked against Sefaria's catalogue, then
     * — where it renders — fetched. APPEND ONLY: the index is the cached key.
     * ⚠️ THESE COMMENT NUMBERS WERE WRONG UNTIL 2026-08-08 — they read 54–61, a
     * second time, while the real indices are 65–72, because the block was
     * appended after rows 54–64 without renumbering. The array index IS the
     * interned cache key, so a comment that misnames it is a trap: reading
     * `/* 56 *\/ radbaz` and using id 56 would have fetched Shevet HaLevi. */
    /* 65 */ {k: 'chazon',  t: 'Chazon Ish',             pats: ['Chazon Ish', 'Ḥazon Ish', 'Hazon Ish'], kind: 'responsa', yr: 1953, on: 'name', loc: 'simanSeif', avail: 'absent',
              note: 'Not in Sefaria’s catalogue — checked against the full title list (66,625 entries), 2026-08-08. Cited 36× in the Hebrew volumes, so naming him beats a chain that quietly stops earlier.'},
    /* 66 ✓ `Responsa Chatam Sofer, Orach Chayim 1` fetched (3,357 ch), echo ✓. */
    /* 66 */ {k: 'cs',      t: 'Chatam Sofer',           pats: ['Chatam Sofer', 'Ḥatam Sofer', 'Chasam Sofer', 'Hatam Sofer'], kind: 'responsa', yr: 1839, on: 'render', loc: 'secNum', fmt: 'sec', simanOnly: true, ref: 'Responsa Chatam Sofer', secs: ['OC', 'YD', 'HM'],
              note: 'Sefaria carries his responsa on Oraḥ Ḥayim, Yoreh De’ah and Ḥoshen Mishpat at siman level. ⚠️ EVEN HA-EZER IS GATED OUT and it is the most instructive row in the dictionary: `Responsa Chatam Sofer, Even HaEzer 1` returns 1,544,393 characters AND echoes back exactly the ref asked for, so the echo test passes and only the length backstop catches it — the first measured case where those two disagree, and why both exist.'},
    /* 67 ⚠️ THE RADBAZ IS ON SEFARIA BUT NOT AT THE SHAPE HE IS CITED IN.
     *    `Teshuvot HaRadbaz Volume 1 1` fetches (1,761 ch) — the volume is part
     *    of the TITLE, not a numeric section. A footnote saying only “רדב”ז”
     *    gives no volume, and picking one would be our inference. */
    /* 67 */ {k: 'radbaz',  t: 'Radbaz',                 pats: ['Radbaz'], kind: 'responsa', yr: 1573, on: 'name', avail: 'needsLoc',
              note: 'Sefaria carries his responsa as five separate volumes (Teshuvot HaRadbaz Volume 1–5). This citation does not say which, and choosing one would be our guess rather than his reference.'},
    /* 68 */ {k: 'thb',     t: 'Taharat HaBayit',        pats: ['Taharat HaBayit'], kind: 'responsa', yr: 1988, on: 'name', avail: 'absent',
              note: 'Rav Ovadia Yosef’s work is not in Sefaria’s catalogue — the same absence as the rest of that corpus, and worth the same letter. Cited 39× in the Hebrew volumes.'},
    /* 69 ✓ `Chokhmat Adam 68:1` fetched (1,171 ch), echo ✓. */
    /* 69 */ {k: 'ca',      t: 'Chokhmat Adam',          pats: ['Chokhmat Adam', 'Chochmat Adam'], kind: 'code', yr: 1814, sec: 'YD', on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Chokhmat Adam'},
    /* 70 ✓ `Shabbat HaAretz, Laws of Shemitah 1:1` fetched (1,494 ch), echo ✓. */
    /* 70 */ {k: 'sha',     t: 'Shabbat HaAretz',        pats: ['Shabbat HaAretz'], kind: 'code', yr: 1910, on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Shabbat HaAretz, Laws of Shemitah'},
    /* 71 ⚠️ A MISHNAH COMMENTATOR IS NOT A TALMUD COMMENTATOR — the F2.4
     *    finding. Sefaria has him per MISHNAH tractate (`Bartenura on Mishnah
     *    Berakhot 1:1` ✓, note the echoed title drops “Ovadia of”), so a bare
     *    “רע”ב” with no mishnah cannot be resolved. */
    /* 71 */ {k: 'rav',     t: 'Bartenura',              pats: ['Bartenura'], kind: 'comm', yr: 1500, on: 'name', avail: 'needsLoc',
              note: 'Sefaria carries him per Mishnah tractate. This citation names him without one, and a Mishnah commentator sent to a folio would be reported absent.'},
    /* 72 */ {k: 'mamar',   t: 'Ma’amar Mordechai',      pats: ['Ma’amar Mordechai', "Ma'amar Mordechai"], kind: 'comm', yr: 1790, on: 'name', avail: 'absent',
              note: 'Not in Sefaria’s catalogue — checked against the full title list, 2026-08-08.'},
    /* ── 73+ · F4.4 · NAMES THE CORPUS CITES WITH A LOCATION AND THE DICTIONARY
     * COULD NOT READ. Measured 2026-08-08 with the only honest oracle — does
     * `scan()` emit a citation for the exact string the footnote wrote. These
     * were named as the open item at the end of the previous session and no row
     * was added, which is why they are here now.
     * ⚠️ EVERY ONE IS `on:'name'` AND `avail` FALLS THROUGH TO `unchecked`. None
     * has been fetched from Sefaria, and this project does not print a ref it
     * has not fetched; `unchecked` says we have not looked, which is not the
     * same as absent (meldar-sources' three states). Naming them costs nothing
     * and stops a posek's own citation being invisible. Promoting any of them
     * to `render` requires the fetch first. */
    /* 73 */ {k: 'ea',      t: 'Eshel Avraham',          pats: ['Eshel Avraham'], kind: 'comm', yr: 1790, sec: 'OC', on: 'name', loc: 'simanSeif'},
    /* 74 ⚠️ NOT RABBEINU YONAH. Sefaria's "Shaarei Teshuvah" is his ethical
     *    work; this is R. Ḥayim Mordechai Margaliot's commentary on the Shulḥan
     *    Arukh — a different book by a different author five centuries later.
     *    The Kitzur trap (row 53) in a new costume, and the reason this needs
     *    its own row rather than a pattern hung on something that resolves. */
    /* 74 */ {k: 'shte',    t: 'Sha’arei Teshuva',       pats: ['Sha’arei Teshuva', "Sha'arei Teshuva", 'Shaarei Teshuva'], kind: 'comm', yr: 1820, sec: 'OC', on: 'name', loc: 'simanSeif',
              note: 'The commentary on the Shulḥan Arukh by R. Ḥayim Mordechai Margaliot. ⚠️ Sefaria’s “Shaarei Teshuvah” is Rabbeinu Yonah’s ethical work — a different book by a different author — so this is named rather than resolved to it.'},
    /* 75 */ {k: 'shsh',    t: 'Shulḥan Shlomo',         pats: ['Shulḥan Shlomo', 'Shulchan Shlomo'], kind: 'responsa', yr: 1990, on: 'name', loc: 'simanSeif'},
    /* 76 */ {k: 'bsh',     t: 'Beit Shmuel',            pats: ['Beit Shmuel'], kind: 'comm', yr: 1689, sec: 'EH', secs: ['EH'], on: 'name', loc: 'simanSeif'},
    /* 77 */ {k: 'dt',      t: 'Da’at Torah',            pats: ['Da’at Torah', "Da'at Torah"], kind: 'comm', yr: 1910, sec: 'OC', on: 'name', loc: 'simanSeif'},
    /* 78 */ {k: 'hb',      t: 'Halikhot Beitah',        pats: ['Halikhot Beitah', 'Halichot Beitah'], kind: 'responsa', yr: 1985, on: 'name', loc: 'chapSeif'},
    /* 79–80 — not on the earlier list. Both surfaced in this pass carrying an
     *    explicit `YD` section, which is exactly what F4.1 now reads. */
    /* 79 */ {k: 'byi',     t: 'Beit Yitzḥak',           pats: ['Beit Yitzḥak', 'Beit Yitzchak'], kind: 'responsa', yr: 1890, on: 'name', loc: 'volNum'},
    /* 80 */ {k: 'ht',      t: 'Har Tzvi',               pats: ['Har Tzvi'], kind: 'responsa', yr: 1950, on: 'name', loc: 'volNum'},

    /* ── 81–87 · F4.14: THE WORKS THAT WERE BLOCKING A SECTION MARKER ────────
     * The corpus writes 474 explicit section markers; the grammar reads them,
     * and 135 were still unread because the AUTHORITY in front of the marker had
     * no row. Every form below was fetched before it was written down, and
     * ⚠️ THEY DO NOT ALL HAVE THE SAME ANSWER — which is the whole reason for
     * checking each one rather than adding seven rows in the same shape. */

    /* ⚠⚠ ḤATAM SOFER AND ḤAZON ISH ARE NOT HERE, AND THAT IS THE FINDING.
     * Both were added as rows 81–82 in this pass, on the strength of a gap scan
     * that reported them missing — and both had had rows since an earlier wave
     * (65 · 66). The scan asked with the Ḥ spelling, whose matcher could never
     * fire, so it was measuring the dead boundary rather than the dictionary.
     * The duplicates are removed and what was FETCHED for them is merged into
     * the rows that already existed; only the works genuinely new stay below. */
    /* 88 ✅ SURFACED BY THE CROSS-CHECK, NOT BY READING (2026-08-08). Comparing
     *    our extraction against Sefaria's own links for six PH chapters put
     *    `Teshuvot HaRivash` on the list of works THEY cite and we could not
     *    read. Fetched before it was written down: `Teshuvot HaRivash 1` ✓
     *    2,667 ch · `100` ✓ 5,522 ch. Numbered by siman, no section.
     *    ⚠️ NOT `Tzavaat HaRivash`, which is in the same catalogue and is a
     *    Hasidic ethical will by a different author four centuries later — the
     *    Kitzur trap and the Sha'arei Teshuva trap in a third costume. */
    {k: 'rivash',  t: 'Rivash',            pats: ['Rivash', 'Teshuvot HaRivash', 'Ribash'], kind: 'responsa', yr: 1400, on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Teshuvot HaRivash'},

    /* ⚠️ ABSENT, AND CHECKED PROPERLY: against the full 66,625-title catalogue
     * "Avnei" returns nothing at all. 12 citations — named at its location and
     * linked out, never rendered. (This row was deleted by accident when the
     * two duplicates above were removed: the block delete ran from one comment
     * to the next and took the row between them. Restored, and the count is
     * read from counts() rather than assumed — 88 − 2 should have been 86 and
     * was 85, which is the only reason it was noticed.) */
    {k: 'an',    t: 'Avnei Nezer',       pats: ['Avnei Nezer', 'Avnei Neizer'], kind: 'responsa', yr: 1900, on: 'name', loc: 'secNum', avail: 'absent',
              note: 'Not in Sefaria’s catalogue under any title — checked against the full title list, 2026-08-08.'},

    /* 84 ⚠⚠ HIS VOLUMES DO NOT ALL CARRY THE SAME SECTIONS, and this is the row
     *    that would have produced confident 404s. Measured: Volume I has OḤ and
     *    YD · Volume II has YD only (`Volume II, Orach Chayim 1` → 400) · Volume
     *    III has OḤ · Volume IV has ḤM. `volSec` holds only pairs that fetched.
     *    ⚠️ PH also writes him with THREE numbers ("OḤ 2:36:2"), which does not
     *    map onto volume:siman without a guess — so it is named, not resolved. */
    /* 84 */ {k: 'mu',    t: 'Mishpetei Uziel',   pats: ['Mishpetei Uziel', 'Mishpetei ‘Uziel'], kind: 'responsa', yr: 1940, on: 'render', loc: 'volSiman',
              volTpl: 'Mishpetei Uziel, Volume {v}, {sec} {n}', volHave: [1, 2, 3, 4],
              volSec: {'1': ['OC', 'YD'], '2': ['YD'], '3': ['OC'], '4': ['HM']}},

    /* 85 ✅ RENDERS. `Pitchei Teshuva on Shulchan Arukh, Yoreh De'ah 89:1` ✓ 206 ch
     *    · `Even HaEzer 1:1` ✓ 523 · `Choshen Mishpat 1:1` ✓ 538.
     *    ⚠️ THERE IS NO PITḤEI TESHUVA ON ORAḤ ḤAYIM — measured, that ref 404s —
     *    so `secs` gates it exactly as it does the Shakh, rather than letting an
     *    OḤ topic build a reference to nothing and call it our failure. */
    /* 85 */ {k: 'ptsh',  t: 'Pitḥei Teshuva',   pats: ['Pitḥei Teshuva', 'Pitchei Teshuva', 'Pitḥei Teshuvah', 'Pitchei Teshuvah'], kind: 'comm', yr: 1860, sec: 'YD', secs: ['YD', 'EH', 'HM'], on: 'render', loc: 'simanSeif', fmt: 'onSA', ref: 'Pitchei Teshuva'},

    /* 86 ✅ RENDERS, IN TWO MAHADUROT. `Noda BiYehudah I, Orach Chaim 1` ✓ ·
     *    `II, Yoreh Deah 1` ✓ 1,588 · `II, Even HaEzer 1` ✓ 6,091.
     *    ⚠️ AND HE IS THE THIRD SECTION SPELLING (secSp 'nb'): he wants "Orach
     *    Chaim" without the y AND "Yoreh Deah" without the apostrophe — the
     *    apostrophe form 400s. No other work in the dictionary does both. */
    /* 86 */ {k: 'nby',   t: 'Noda Bi-Yehuda',    pats: ['Noda Bi-Yehuda', 'Noda BiYehuda', 'Noda B’Yehuda', 'Noda BiYehudah', 'Nodah Bi-Yehuda'], kind: 'responsa', yr: 1780, on: 'render', loc: 'volSiman', secSp: 'nb',
              volTpl: 'Noda BiYehudah {v}, {sec} {n}', volHave: [1, 2]},

    /* 87 ⚠️ AND THE FIRST FORM TRIED FOR HIM WAS THE WHOLE-WORK FAILURE:
     *    `Chelkat Mechokek on Shulchan Arukh, Even HaEzer 1:1` echoed back a
     *    DIFFERENT ref carrying 778,770 characters. He is addressed directly —
     *    `Chelkat Mechokek 26:1` ✓ 537 ch — and he is an Even Ha-Ezer commentary,
     *    so `secs` keeps him off the other three. */
    /* 87 */ {k: 'chm',   t: 'Ḥelkat Meḥokek',  pats: ['Ḥelkat Meḥokek', 'Chelkat Mechokek', 'Helkat Mehokek'], kind: 'comm', yr: 1660, sec: 'EH', secs: ['EH'], on: 'render', loc: 'simanSeif', fmt: 'plain', ref: 'Chelkat Mechokek'},
  ];

  /* Talmud tractates PH cites, with their Mishnah counterpart. One list serves
   * both works: the LOCATION FORM decides which, per trap #2. */
  var TRACTATES = ['Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Pesaḥim', 'Yoma', 'Sukkah', 'Sukka',
    'Beitzah', 'Beitza', 'Rosh Hashanah', 'Taanit', 'Megillah', 'Megilla', 'Moed Katan', 'Chagigah',
    'Yevamot', 'Ketubot', 'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma',
    'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot', 'Shevuot', 'Avodah Zarah', 'Horayot',
    'Zevachim', 'Menachot', 'Chullin', 'Ḥullin', 'Bekhorot', 'Arakhin', 'Temurah', 'Keritot',
    'Meilah', 'Niddah', 'Mikvaot', 'Tamid', 'Middot',
    /* ⚠️⚠️ F4.3 — SPELLING VARIANTS, AND A TRACTATE SPELLED THE OTHER WAY DOES
     * NOT DEGRADE, IT VANISHES. No work matches, so nothing is emitted: not a
     * refusal, not a partial row, nothing on the page and nothing in any count.
     * Measured over the whole corpus by asking `scan()` for the exact string the
     * footnote wrote: Berachot 28 · Ta’anit 19 (curly apostrophe — `Taanit` was
     * in this list, `Ta'anit` was not, and the two differ by one invisible
     * character) · Nidda 19 · Sota 13 · RH 13 · MK 11. ⚠️ The two-letter
     * abbreviations are safe only because a bare tractate with no location is
     * DROPPED (see resolve) and a folio is required — they can add a citation,
     * never a bare name. */
    'Berachot', 'Berachos', "Ta'anit", 'Nidda', 'Sota', 'Rosh Hashana', 'RH', 'MK',
    'Chulin', 'Bava Kama', 'Avodah Zara', 'Chagiga'];
  /* Sefaria's spelling, where PH's differs. */
  /* Tractates with no Babylonian Talmud — a folio on one of these is always a
   * misread number, never a citation. (Tamid DOES have Gemara and is not here.) */
  var MISHNAH_ONLY = {Mikvaot: 1, Middot: 1};
  var TRACT_CANON = {'Pesaḥim': 'Pesachim', 'Beitza': 'Beitzah', 'Sukka': 'Sukkah',
    'Megilla': 'Megillah', 'Ḥullin': 'Chullin', 'Moed Katan': 'Moed Katan',
    'Berachot': 'Berakhot', 'Berachos': 'Berakhot', "Ta'anit": 'Taanit', 'Nidda': 'Niddah',
    'Sota': 'Sotah', 'Rosh Hashana': 'Rosh Hashanah', 'RH': 'Rosh Hashanah',
    'MK': 'Moed Katan', 'Chulin': 'Chullin', 'Bava Kama': 'Bava Kamma',
    'Avodah Zara': 'Avodah Zarah', 'Chagiga': 'Chagigah', 'Yerushalmi Shabbat': 'Shabbat'};
  /* ⚠️ MISHNEH TORAH BOOK NAMES. PH cites "MT, Laws of Yom Tov 4:1"; Sefaria
   * calls that book "Rest on a Festival". Emitting PH's name verbatim produces
   * a 404 that reads like OUR failure instead of a naming mismatch — and this
   * is the exact neighbourhood of the F1.8 cardinal sin, where an unchecked MT
   * rung rendered "Prayer and the Priestly Blessing 8:2" as the Rambam on
   * carrying. So: mapped → canonical ref; UNMAPPED → partial, naming the book
   * PH gave. Never a constructed guess. */
  /* ⚠️⚠️ EVERY VALUE HERE WAS FETCHED, 2026-08-08, AND THREE WERE WRONG — one of
   * them the most-cited book in the corpus. Sefaria calls Hilkhot Shabbat
   * **"Sabbath"**, so `Mishneh Torah, Shabbat 30:9` 404s while `Sabbath 30:9`
   * returns 477 characters; the map had 'Shabbat' → 'Shabbat' by assuming the
   * name passed through. Niddah is filed under **"Forbidden Intercourse"**, and
   * the tefillin book drops the word "Phylacteries" entirely. `meldar-anchors`
   * had "Mishneh Torah, Sabbath 24" written correctly all along — the right
   * name existed in this project and this table never asked it. */
  var MT_CANON = {
    'Shabbat': 'Sabbath', 'Sabbath': 'Sabbath', 'Shabbos': 'Sabbath',
    'Eruvin': 'Eruvin', 'Yom Tov': 'Rest on a Holiday',
    'Rest on a Holiday': 'Rest on a Holiday', 'Shevitat Yom Tov': 'Rest on a Holiday',
    'Chametz and Matzah': 'Leavened and Unleavened Bread',
    'Leavened and Unleavened Bread': 'Leavened and Unleavened Bread',
    'Berakhot': 'Blessings', 'Berachot': 'Blessings', 'Blessings': 'Blessings',
    'Tefilla': 'Prayer and the Priestly Blessing', 'Tefillah': 'Prayer and the Priestly Blessing',
    'Prayer': 'Prayer and the Priestly Blessing',
    'Forbidden Foods': 'Forbidden Foods', 'Maakhalot Assurot': 'Forbidden Foods',
    'Shechita': 'Ritual Slaughter', 'Ritual Slaughter': 'Ritual Slaughter',
    'Niddah': 'Forbidden Intercourse', 'Issurei Biah': 'Forbidden Intercourse',
    'Forbidden Intercourse': 'Forbidden Intercourse',
    'Mikvaot': 'Immersion Pools', 'Immersion Pools': 'Immersion Pools',
    'Shofar': 'Shofar, Sukkah and Lulav', 'Sukkah': 'Shofar, Sukkah and Lulav',
    'Lulav': 'Shofar, Sukkah and Lulav', 'Shofar, Sukkah and Lulav': 'Shofar, Sukkah and Lulav',
    'Teshuva': 'Repentance', 'Repentance': 'Repentance',
    'Megillah': 'Scroll of Esther and Hanukkah', 'Chanukah': 'Scroll of Esther and Hanukkah',
    'Taaniyot': 'Fasts', 'Fasts': 'Fasts', 'Avel': 'Mourning', 'Mourning': 'Mourning',
    'Ishut': 'Marriage', 'Marriage': 'Marriage', 'Talmud Torah': 'Torah Study',
    'Torah Study': 'Torah Study', 'Tzitzit': 'Fringes', 'Fringes': 'Fringes',
    'Tefillin': 'Tefillin, Mezuzah and the Torah Scroll',
    'Tefillin, Mezuzah and the Torah Scroll': 'Tefillin, Mezuzah and the Torah Scroll',
    'Shemitah': 'Sabbatical Year and the Jubilee',
    'Kilayim': 'Diverse Species', 'Terumot': 'Heave Offerings',
    /* ⚠️⚠️ TITHES ARE NOT HEAVE OFFERINGS. `HE_MT_BOOK` mapped מעשר → 'Terumot',
     * so every Hebrew citation of Hilkhot Ma'aser resolved to `Mishneh Torah,
     * Heave Offerings` — a real book, a clean fetch, an exact echo, and the
     * WRONG ONE. Two adjacent books of Sefer Zera'im, and nothing downstream
     * could tell: the verifier tests that a ref exists and that Sefaria echoes
     * back what we asked, and both passed. Measured 2026-08-09, they are
     * different texts at the same address — Tithes 1:4 is 342 characters,
     * Heave Offerings 1:4 is 258. Fetched before written down. */
    'Tithes': 'Tithes', 'Maaser': 'Tithes',
    "Second Tithes and Fourth Year's Fruit": "Second Tithes and Fourth Year's Fruit",
    'Deot': 'Human Dispositions', 'Human Dispositions': 'Human Dispositions',
    /* F4.13 · fetched 2026-08-08. Three more of Sefaria's names are not the
     * transliteration anybody would reach for: Shegagot is **Offerings for
     * Unintentional Transgressions**, Nezirut is **Nazariteship**, and Bekhorot
     * is **Firstlings** (“Firstborn” 404s). */
    'Sin and Guilt Offerings': 'Offerings for Unintentional Transgressions',
    'Shegagot': 'Offerings for Unintentional Transgressions',
    'Offerings for Unintentional Transgressions': 'Offerings for Unintentional Transgressions',
    'Nazirism': 'Nazariteship', 'Nezirut': 'Nazariteship', 'Nazariteship': 'Nazariteship',
    'Bechorot': 'Firstlings', 'Bekhorot': 'Firstlings', 'Firstlings': 'Firstlings',
    /* ── F4.5, EVERY VALUE FETCHED 2026-08-08 ─────────────────────────────
     * The names PH writes, measured off the corpus as unmapped and then probed
     * against Sefaria one by one. Three are not the transliteration anybody
     * would guess: Issurei Bi'ah is **Forbidden Intercourse**, Hilkhot Melakhim
     * is **Kings and Wars** (`Kings` alone 404s), and Shevitat Asor is **Rest on
     * the Tenth of Tishrei** (`Resting on the Tenth` 404s). */
    'Sexual Prohibitions': 'Forbidden Intercourse',
    'Kings': 'Kings and Wars', 'Melakhim': 'Kings and Wars', 'Kings and Wars': 'Kings and Wars',
    'Dispositions': 'Human Dispositions',
    'Torah Principles': 'Foundations of the Torah', 'Yesodei HaTorah': 'Foundations of the Torah',
    'Foundations of the Torah': 'Foundations of the Torah',
    'Resting on the Tenth': 'Rest on the Tenth of Tishrei',
    'Shevitat Asor': 'Rest on the Tenth of Tishrei',
    'Rest on the Tenth of Tishrei': 'Rest on the Tenth of Tishrei',
    'Sanctifying the Month': 'Sanctification of the New Month',
    'Kiddush HaChodesh': 'Sanctification of the New Month',
    'Sanctification of the New Month': 'Sanctification of the New Month',
    'Megilla': 'Scroll of Esther and Hanukkah',
    'Scroll of Esther and Hanukkah': 'Scroll of Esther and Hanukkah',
    'Tumat Met': 'Defilement by a Corpse', 'Defilement by a Corpse': 'Defilement by a Corpse',
    'Kelim': 'Vessels', 'Vessels': 'Vessels'
    /* ⚠️ מעשר שני IS DELIBERATELY ABSENT. `Second Tithe`, `Second Tithes` and
     * `Second Tithe and Fourth Year's Produce` all 404; `Tithes` resolves but is
     * מעשרות, a DIFFERENT book. Mapping it there would put a real, verifying
     * passage under the wrong name — the one failure this table exists to
     * refuse. It stays partial, named with the book PH gave. */
  };
  /* ⚠️ BEN ISH ḤAI IS ON SEFARIA, AND THE SHAPE IS NOT GUESSABLE (measured
   * 2026-08-07). Its four sections are titled Introduction · Drashot · Halachot
   * 1st Year · Halachot 2nd Year — Sefaria renders *Shanah Rishonah/Sheniyah* as
   * ENGLISH ORDINALS, so every form we first tried (Shanah Rishonah, Bereshit 1)
   * returned 400. Verified segments: `Ben Ish Hai, Halachot 1st Year, Bereshit 1`
   * (he+en) · `Halachot 2nd Year, Bo 1` (he) · `Halachot 1st Year, Vayakhel 1`.
   * ⚠️ AND THE DRASHOT ARE NOT THE HALACHOT. A chain wants the halakhic year
   * sections; serving a derasha as a halakhic rung would be a category error
   * that reads perfectly well, which is the dangerous kind. */
  var BIH_YEAR = {
    'shanah rishonah': '1st', 'shana rishona': '1st', '1st year': '1st', 'year 1': '1st',
    'first year': '1st', 'sh"a': '1st', 'rishonah': '1st',
    'shanah sheniyah': '2nd', 'shana shniya': '2nd', '2nd year': '2nd', 'year 2': '2nd',
    'second year': '2nd', 'sh"b': '2nd', 'sheniyah': '2nd'
  };
  /* Sefaria's parasha spellings. An unlisted one stays PARTIAL rather than being
   * constructed — the MT_CANON rule. A listed one that is nonetheless wrong is
   * caught by verify(), which fetches before anything renders. */
  var BIH_PARASHA = {};
  ['Bereshit','Noach','Lech Lecha','Chayei Sara','Toldot','Vayetzei','Vayishlach','Vayeshev',
   'Miketz','Vayigash','Vayechi','Shemot','Vaera','Bo','Beshalach','Yitro','Mishpatim',
   'Terumah','Tetzaveh','Ki Tisa','Vayakhel','Pekudei','Vayikra','Tzav','Shmini','Tazria',
   'Metzora','Achrei Mot','Kedoshim','Emor','Behar','Bechukotai','Bamidbar','Nasso',
   "Beha'alotcha",'Shelach','Korach','Chukat','Balak','Pinchas','Matot','Masei','Devarim',
   'Eikev',"Re'eh",'Shoftim','Ki Teitzei','Ki Tavo','Nitzavim','Vayeilech','Haazinu'
  ].forEach(function (x) { BIH_PARASHA[x.toLowerCase().replace(/[’']/g, "'")] = x; });
  /* how PH and others spell them differently */
  [['vayeira','Vayera'],['vaeira','Vaera'],['shelah','Shelach'],['shlach','Shelach'],
   ['behaalotcha','Beha\'alotcha'],['acharei mot','Achrei Mot'],['ree','Re\'eh'],
   ['ki teitze','Ki Teitzei'],['ki tetze','Ki Teitzei'],['nitzavim','Nitzavim'],
   ['vayelech','Vayeilech'],['ha\'azinu','Haazinu'],['chayei sarah','Chayei Sara'],
   ['vayeshev','Vayeshev'],['vayishlach','Vayishlach'],['bechukotai','Bechukotai']
  ].forEach(function (a) { BIH_PARASHA[a[0]] = a[1]; });

  var TANAKH = ['Bereshit', 'Shemot', 'Vayikra', 'Bamidbar', 'Devarim', 'Yeshayahu', 'Yirmiyahu',
    'Yechezkel', 'Tehillim', 'Tehilim', 'Mishlei', 'Iyov', 'Kohelet', 'Nechemiah', 'Divrei HaYamim'];
  var TANAKH_CANON = {'Bereshit': 'Genesis', 'Shemot': 'Exodus', 'Vayikra': 'Leviticus',
    'Bamidbar': 'Numbers', 'Devarim': 'Deuteronomy', 'Yeshayahu': 'Isaiah', 'Yirmiyahu': 'Jeremiah',
    'Yechezkel': 'Ezekiel', 'Tehillim': 'Psalms', 'Tehilim': 'Psalms', 'Mishlei': 'Proverbs', 'Iyov': 'Job',
    'Kohelet': 'Ecclesiastes'};

  /* The SA section each PH volume works in. `SA 502:1` in a Festivals footnote
   * is Oraḥ Ḥayim and nothing else; the footnote never says so because the
   * volume already did. An explicit `SA YD 120:16` overrides. */
  /* ⚠️ F4.9 · THE THREE VOLUMES THAT HAD NO DEFAULT, DECIDED BY SEGMENTATION
   * RATHER THAN BY MY READING (2026-08-08). Their cited siman:se'if pairs were
   * fetched under all four sections and the survivors counted — Sefaria's own
   * segmentation deciding, not us:
   *   Likkutim II  → ḤM, and it is decisive: 272:11, 427:7 and 427:8 exist in
   *                  ḤM and nowhere else. It agrees with the contents, since
   *                  427 is maakeh — the guardrail and danger siman — and the
   *                  volume's chapters are theft, tzedaka and careful driving.
   *   Likkutim I   → OC on 47:14, unique, and the contents agree (Torah study,
   *                  tzitzit, tefillin, mezuzah, the synagogue).
   *   The Nation and the Land → YD on 286:22, unique.
   * ⚠️⚠️ BUT A COLLECTION MAY LEGITIMATELY SPAN SECTIONS, and two of these are
   * literally miscellanies. One default is therefore a compromise rather than
   * a fact, and it is weaker evidence than the same field carries elsewhere —
   * which is exactly why secBy already labels an inherited section as ours. */
  var VOL_SEC = {
    'Likkutim I': 'OC', 'Likkutim II': 'HM', 'The Nation and the Land': 'YD',
    'Shabbat': 'OC', 'Prayer': 'OC', 'Festivals': 'OC', 'Pesach': 'OC', 'Sukkot': 'OC',
    'Days of Awe': 'OC', 'Berakhot': 'OC', 'Zemanim': 'OC', 'Tzitzit': 'OC',
    'Kashrut': 'YD', 'Mourning': 'YD', 'Shemitah': 'YD', 'Family Purity': 'YD',
    /* ⚠️ 'Family' IS YOREH DE'AH, NOT EVEN HA-EZER (measured 2026-08-08). It was
     * EH on the reasonable guess that a volume about family life follows the SA's
     * marriage section — but PH Family opens on honouring parents, which is
     * YD 240–241. Even HaEzer HAS ONLY 178 SIMANIM, so the chapter's citations
     * built `Shulchan Arukh, Even HaEzer 240:19` and `340` — refs to nothing.
     * The same refs in YD fetch clean (240:19 ✓ 349 chars, AHS YD 240:22 ✓). */
    'Family': 'YD', 'Women': 'EH', 'Business Ethics': 'HM', 'Medical Ethics': 'YD',
    'Conversion': 'YD', 'Land of Israel': 'YD',
    /* ⚠️ ADDED 2026-08-08 — THESE ARE SEFARIA'S ACTUAL VOLUME NAMES, and the
     * table was keyed on names nobody uses. "Shemitah" is really "Shemitah and
     * Yovel" and "Women" is "Women's Prayer", so both fell through to the OC
     * default — silently, which is how a Shemitah siman would have been built
     * in the wrong section. Confirmed by measurement: a Shemitah footnote's
     * `שו"ע שלא, טו` resolves to Yoreh De'ah 331:15 (fetched ✓), not OC.
     * Volumes still absent here (Likkutim I/II, The Nation and the Land) are
     * deliberately left to the default rather than guessed at. */
    'Shemitah and Yovel': 'YD', "Women's Prayer": 'OC', "Simchat Habayit U'Virkhato": 'EH'
  };
  /* ── F4.9 · THE THREE UNMAPPED VOLUMES, DECIDED BY READING THEIR CHAPTER
   * LISTS (fetched 2026-08-08) — AND THE READING SAYS A VOLUME-LEVEL ANSWER
   * WOULD BE WRONG FOR ALL THREE.
   *   Likkutim I is Torah study, Torah scrolls and mezuza (Yoreh De'ah) beside
   *   Torah reading, the synagogue, tzitzit and tefilin (Oraḥ Ḥayim).
   *   Likkutim II is theft, deceit and loans (Ḥoshen Mishpat) beside tzedaka
   *   and the whole medical-ethical half (Yoreh De'ah).
   *   The Nation and the Land is conversion (YD), the military and the state
   *   (ḤM), and several chapters on subjects the Shulḥan Arukh does not carry
   *   at all.
   * So the section is set PER CHAPTER, and a chapter with no entry gets none —
   * `resolve()` then refuses a section-bearing work rather than pointing it at
   * Oraḥ Ḥayim by a fallback nobody chose. A gap is a field, not a silence. */
  var CH_SEC = {
    'Likkutim I:1': 'YD', 'Likkutim I:2': 'YD', 'Likkutim I:3': 'YD', 'Likkutim I:4': 'OC',
    'Likkutim I:5': 'YD', 'Likkutim I:6': 'OC', 'Likkutim I:7': 'OC', 'Likkutim I:8': 'OC',
    'Likkutim I:9': 'OC', 'Likkutim I:10': 'YD', 'Likkutim I:11': 'YD',
    'Likkutim II:1': 'YD', 'Likkutim II:2': 'HM', 'Likkutim II:3': 'HM', 'Likkutim II:4': 'HM',
    'Likkutim II:5': 'HM', 'Likkutim II:6': 'YD', 'Likkutim II:7': 'YD', 'Likkutim II:8': 'YD',
    'Likkutim II:9': 'HM', 'Likkutim II:10': 'HM', 'Likkutim II:11': 'YD', 'Likkutim II:12': 'YD',
    'Likkutim II:13': 'YD', 'Likkutim II:14': 'YD', 'Likkutim II:15': 'YD',
    'The Nation and the Land:4': 'HM', 'The Nation and the Land:5': 'HM',
    'The Nation and the Land:6': 'HM', 'The Nation and the Land:8': 'HM',
    'The Nation and the Land:10': 'YD'
  };
  /* The one place that answers “which section is this chapter in, and who says
   * so”. `by` travels with the answer all the way to the page (F4.2). */
  function secFor (vol, n) {
    var k = vol + ':' + n;
    if (CH_SEC[k]) return {sec: CH_SEC[k], by: 'chapter'};
    if (VOL_SEC[vol]) return {sec: VOL_SEC[vol], by: 'vol'};
    return {sec: 'OC', by: ''};
  }
  var SEC_NAME = {OC: 'Orach Chayim', YD: "Yoreh De'ah", EH: 'Even HaEzer', HM: 'Choshen Mishpat'};
  /* ⚠️ AND THE SPELLING IS PER WORK — see the AHS row above.
   * ⚠️⚠️ PER WORK **AND PER SECTION** (corrected 2026-08-08). This table read
   * `Yoreh Deah` for the Arukh HaShulchan on the strength of its Oraḥ Ḥayim,
   * and measured that is wrong in both directions: `Arukh HaShulchan, Orach
   * Chaim 345:26` ✓ resolves while `Orach Chayim` 404s, but `Yoreh Deah 89:11`
   * 404s while `Yoreh De'ah 89:11` ✓ resolves. One work, two conventions —
   * the *y* goes and the apostrophe stays. Found by a Hebrew Kashrut footnote
   * (`ערוה"ש פט, יא`) failing to verify; on an OC topic it could never have
   * shown up, because the wrong half of the table was never reached. */
  var SEC_NOY  = {OC: 'Orach Chaim', YD: "Yoreh De'ah", EH: 'Even HaEzer', HM: 'Choshen Mishpat'};
  /* ⚠️ A THIRD SPELLING, because Rav Peʿalim mixes the two: measured, its
   * sections are "Orach Chayim" (with the y) and "Yoreh Deah" (no apostrophe). */
  var SEC_RP   = {OC: 'Orach Chayim', YD: 'Yoreh Deah', EH: 'Even HaEzer', HM: 'Choshen Mishpat'};
  var ROMAN = {1: 'I', 2: 'II', 3: 'III', 4: 'IV'};
  /* responsa run past four volumes — the Rashba's are numbered to VII on Sefaria */
  var ROMAN7 = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII'};

  /* ══ 1b · THE HEBREW CITATION GRAMMAR ═══════════════════════════════════
   * Added 2026-08-08. MEASURED FIRST: of Peninei Halakha's 17 volumes, EIGHT
   * have no English on Sefaria at all — Berakhot, Kashrut, Family, Family
   * Purity, Shemitah and Yovel, Likkutim I, Likkutim II, The Nation and the
   * Land. That is 106 of 276 chapters, 36% of the corpus, and the English
   * footnote path yields exactly nothing for them. Their HEBREW editions carry
   * the same footnotes (measured chapter by chapter: 6/6, 10/10, 5/5, 9/9,
   * 17/17), so the citations are all there — in a different language.
   *
   * ⚠️ THIS IS A FRONT END, NOT A SECOND PIPELINE. `scanHe()` normalises into
   *    exactly the location vocabulary `scan()` already emits — `331:15`,
   *    `84a`, `Forbidden Foods 10:22` — so resolve(), verify(), the packer, the
   *    cache and the UI are untouched. One grammar per language; one everything
   *    else. A Hebrew citation of the Shulḥan Arukh interns to THE SAME work id
   *    as an English one, because it is the same work.
   *
   * ⚠️⚠️ A GERSHAYIM IS NOT A CITATION MARKER. The single most frequent
   *    gershayim token in 481 Hebrew footnotes is וכ"כ ×332 — "and so wrote",
   *    a conjunction. So are אח"כ, ע"כ, ואע"פ, וי"א, כ"כ and רוה"פ ("most of
   *    the deciders"). Harvesting every abbreviation would have filled the
   *    chain with conjunctions wearing the costume of works. Only the
   *    dictionary matches, and HE_STOP refuses the known impostors outright.
   *
   * ⚠️ HEBREW GLUES ITS PREFIXES ON. בשו"ע · ושו"ע · השו"ע · שו"ע are one work;
   *    הרמב"ם · לרמב"ם · רמב"ם are one author. Measured, prefixed forms are
   *    ~45% of all occurrences of the Shulḥan Arukh — an exact-match dictionary
   *    would miss most citations in the corpus. The whole token is tried FIRST
   *    and only then the stripped stem, or בא"ח (Ben Ish Ḥai) would be read as
   *    a prefixed א"ח.
   *
   * ⚠️ THE LOCATION IS BARE NUMERALS SEPARATED BY A COMMA. `סי'` appears 12
   *    times in 399,130 characters; the ordinary form is `שו"ע שלא, טו` —
   *    Shulḥan Arukh 331:15. English has a colon and Arabic digits; Hebrew has
   *    a comma and gematria, and nothing else marks where a location begins.  */

  /* Hebrew patterns, keyed by the work's stable `k` — NOT by array index, so
   * this table can be read and corrected without touching the interned ids. */
  var HE_PATS = {
    sa: ['שו"ע', 'שולחן ערוך', 'שלחן ערוך'], mt: ['רמב"ם'],
    ahs: ['ערוה"ש', 'ערוך השולחן'], rashba: ['רשב"א'], rosh: ['רא"ש'], ramban: ['רמב"ן'],
    rashi: ['רש"י'], raavad: ['ראב"ד'], rema: ['רמ"א'], ritva: ['ריטב"א'], ran: ['ר"ן'],
    smag: ['סמ"ג'], taz: ['ט"ז'], kaf: ['כה"ח', 'כף החיים'], shakh: ['ש"ך'],
    mb: ['מ"ב', 'משנה ברורה'], ma: ['מ"א', 'מגן אברהם'], sah: ['שועה"ר', 'שו"ע הרב'],
    tur: ['טור'], by: ['ב"י', 'בית יוסף'], bah: ['ב"ח'], bhl: ['בה"ל', 'ביאור הלכה'],
    sht: ['שעה"צ'], gra: ['גר"א', 'ביאור הגר"א'], km: ['כס"מ'], bih: ['בא"ח', 'בן איש חי'],
    igm: ['אג"מ', 'אגרות משה'], yo: ['יבי"א', 'יביע אומר'], yd: ['יחו"ד', 'יחוה דעת'],
    yy: ['ילקו"י', 'ילקוט יוסף'], olt: ['אור לציון'], ssk: ['שש"כ'], tze: ['צי"א', 'ציץ אליעזר'],
    rif: ['רי"ף'], tos: ['תוס\'', 'תוספות'], meiri: ['מאירי'], ksa: ['קיצור שו"ע'],
    rp: ['רב פעלים'], ha: ['חיי אדם'], er: ['אליה רבה'], mm: ['מגיד משנה'],
    chazon: ['חזו"א'], cs: ['חת"ס'], radbaz: ['רדב"ז'], thb: ['טה"ב'],
    ca: ['חכמ"א', 'חכמת אדם'], sha: ['שבה"א'], rav: ['רע"ב'], mamar: ['מאמ"ר']
  };

  /* ⚠️ REFUSED BY NAME, NOT SILENTLY DROPPED. Measured impostors (conjunctions
   * and stock phrases that look exactly like work abbreviations), plus tokens
   * that are genuinely two works. A citation layer's job is to say what it
   * cannot tell, not to pick. */
  var HE_STOP = {
    'וכ"כ': 1, 'כ"כ': 1, 'אח"כ': 1, 'ואח"כ': 1, 'ע"כ': 1, 'ואע"פ': 1, 'אע"פ': 1,
    'וי"א': 1, 'י"א': 1, 'רוה"פ': 1, 'עפ"י': 1, 'עי\'': 1, 'ר"ל': 1, 'כנ"ל': 1,
    'עי"ש': 1, 'ע"ש': 1, 'וכו\'': 1, 'ד"ה': 1, 'ז"ל': 1, 'שליט"א': 1, 'זצ"ל': 1,
    'ס"ק': 1, 'סי\'': 1, 'סעי\'': 1, 'שו"ת': 1, 'הל\'': 1, 'ח"א': 1, 'ח"ב': 1,
    'ח"ג': 1, 'ח"ד': 1, 'מ"מ': 1, 'ר"ח': 1, 'ר"ש': 1, 'מהר"ם': 1
  };
  /* The four in HE_STOP that are ambiguous rather than noise get said out loud
   * where a reader can see it — a work we decline to guess at is a finding. */
  var HE_AMBIG = {
    'מ"מ': 'Maggid Mishneh, or “מכל מקום” (in any case) — the same two letters.',
    'ר"ח': 'Rabbeinu Ḥananel, or Rosh Ḥodesh.',
    'ר"ש': 'Rabbeinu Shimshon of Sens, or R. Shimon.',
    'מהר"ם': 'Maharam of Rothenburg, Lublin, Padua and others — the acronym alone does not say which.'
  };
  var HE_SEC = {'יו"ד': 'YD', 'או"ח': 'OC', 'אה"ע': 'EH', 'חו"מ': 'HM', 'אעה"ז': 'EH'};
  /* Prefix letters Hebrew glues onto a name. Tried only after the whole token. */
  var HE_PREFIX = 'ובהלמכש';

  var HE_TRACT = {'ברכות': 'Berakhot', 'שבת': 'Shabbat', 'עירובין': 'Eruvin', 'פסחים': 'Pesachim',
    'יומא': 'Yoma', 'סוכה': 'Sukkah', 'ביצה': 'Beitzah', 'תענית': 'Taanit', 'מגילה': 'Megillah',
    'חגיגה': 'Chagigah', 'יבמות': 'Yevamot', 'כתובות': 'Ketubot', 'נדרים': 'Nedarim',
    'נזיר': 'Nazir', 'סוטה': 'Sotah', 'גיטין': 'Gittin', 'קידושין': 'Kiddushin',
    'סנהדרין': 'Sanhedrin', 'מכות': 'Makkot', 'שבועות': 'Shevuot', 'חולין': 'Chullin',
    'מנחות': 'Menachot', 'זבחים': 'Zevachim', 'בכורות': 'Bekhorot', 'נדה': 'Niddah',
    'מקוואות': 'Mikvaot', 'מועד קטן': 'Moed Katan', 'ראש השנה': 'Rosh Hashanah',
    'עבודה זרה': 'Avodah Zarah', 'בבא קמא': 'Bava Kamma', 'בבא מציעא': 'Bava Metzia',
    'בבא בתרא': 'Bava Batra', 'ערכין': 'Arakhin', 'כריתות': 'Keritot', 'תמורה': 'Temurah'};
  /* Rambam books as the Hebrew footnotes name them → MT_CANON's English key.
   * An unmapped book stays PARTIAL — the MT_CANON rule, in the other language. */
  var HE_MT_BOOK = {
    /* F4.13 \u00b7 the Hebrew books the corpus cites whose head the prefix peel ate
     * (\u05d4\u05dc\u05db\u05d5\u05ea \u2192 \u05db\u05d5\u05ea) and which resolve() now strips before looking up. */
    '\u05de\u05e7\u05d5\u05d5\u05d0\u05d5\u05ea': 'Mikvaot', '\u05de\u05e7\u05d5\u05d0\u05d5\u05ea': 'Mikvaot', '\u05d0\u05d1\u05dc': 'Avel',
    /* F4.5 · the Hebrew half, same measurement, same rule: these map onto
     * MT_CANON's KEY (not onto Sefaria's title), so the English table stays the
     * single place a Rambam book name is resolved. מעשר שני is absent here for
     * the same reason it is absent there. */
    'מלכים': 'Kings and Wars', 'יסודי התורה': 'Foundations of the Torah',
    'טומאת מת': 'Defilement by a Corpse', 'כלים': 'Vessels',
    'איסורי ביאה': 'Forbidden Intercourse', 'קידוש החודש': 'Sanctification of the New Month',
    'שביתת עשור': 'Rest on the Tenth of Tishrei', 'מגילה וחנוכה': 'Scroll of Esther and Hanukkah',
    'שבת': 'Sabbath', 'עירובין': 'Eruvin', 'יום טוב': 'Yom Tov',
    'שביתת יום טוב': 'Yom Tov', 'חמץ ומצה': 'Chametz and Matzah', 'ברכות': 'Berakhot',
    'תפילה': 'Tefilla', 'מאכלות אסורות': 'Forbidden Foods', 'שחיטה': 'Shechita',
    'נדה': 'Forbidden Intercourse', 'שופר': 'Shofar', 'סוכה': 'Sukkah',
    'לולב': 'Lulav', 'תשובה': 'Teshuva', 'מגילה': 'Megillah', 'חנוכה': 'Chanukah',
    'תעניות': 'Taaniyot', 'אישות': 'Ishut', 'תלמוד תורה': 'Talmud Torah',
    'ציצית': 'Tzitzit', 'תפילין': 'Tefillin', 'שמיטה ויובל': 'Shemitah', 'כלאים': 'Kilayim',
    /* ⚠️ FIVE KEYS WERE WRITTEN TWICE IN THIS TABLE, AND A DUPLICATE IS DECIDED
     * BY SOURCE ORDER RATHER THAN BY ANYBODY'S JUDGEMENT — the last one silently
     * wins. כלים carried 'Kelim' and 'Vessels'; דעות carried 'Human Dispositions'
     * and 'Deot'. Both happened to land on a value MT_CANON knows, so nothing
     * broke — but the hazard is that the CORRECT entry is the one that loses,
     * invisibly, on the next edit. One key, one place. */
    'תרומות': 'Terumot', 'מעשר': 'Tithes', 'מעשר שני': "Second Tithes and Fourth Year's Fruit",
    'דעות': 'Deot'};

  /* ⚠️ GEMATRIA IS THE SAME SHAPE AS AN ABBREVIATION — ט"ו is fifteen and ס"ק
   * is "se'if katan". So this runs ONLY where a location is expected (directly
   * after a matched work), and the dictionary and stoplist are consulted first.
   * Fifteen and sixteen are טו/טז, never יה/יו — that is a rule about the Name,
   * not a numbering quirk, and it is why a plain sum is safe here. */
  /* F4.10 · THE BEN ISH ḤAI IN HEBREW. Written down as known-open since F2.5:
   * measured, 67 of his citations arrive as `בא"ח ש"ש שלח ח` — correctly named,
   * never resolved, because nothing mapped the Hebrew parasha or the Hebrew
   * year marker. Both map onto the ENGLISH tables (`BIH_YEAR`, `BIH_PARASHA`)
   * rather than duplicating them, so there is still one Ben Ish Ḥai ref builder.
   * ⚠️ An unlisted parasha stays PARTIAL — the MT_CANON rule — and the year is
   * still required, because he wrote on most parashiyot in both cycles. */
  var HE_BIH_YEAR = {'ש"ר': '1st year', 'ש"א': '1st year', 'שנה ראשונה': '1st year',
    'ש"ש': '2nd year', 'ש"ב': '2nd year', 'שנה שניה': '2nd year', 'שנה שנייה': '2nd year'};
  var HE_PARASHA = {};
  [['בראשית','Bereshit'],['נח','Noach'],['לך לך','Lech Lecha'],['וירא','Vayera'],
   ['חיי שרה','Chayei Sara'],['תולדות','Toldot'],['ויצא','Vayetzei'],['וישלח','Vayishlach'],
   ['וישב','Vayeshev'],['מקץ','Miketz'],['ויגש','Vayigash'],['ויחי','Vayechi'],
   ['שמות','Shemot'],['וארא','Vaera'],['בא','Bo'],['בשלח','Beshalach'],['יתרו','Yitro'],
   ['משפטים','Mishpatim'],['תרומה','Terumah'],['תצוה','Tetzaveh'],['כי תשא','Ki Tisa'],
   ['ויקהל','Vayakhel'],['פקודי','Pekudei'],['ויקרא','Vayikra'],['צו','Tzav'],
   ['שמיני','Shmini'],['תזריע','Tazria'],['מצרע','Metzora'],['אחרי מות','Achrei Mot'],
   ['קדושים','Kedoshim'],['אמור','Emor'],['בהר','Behar'],['בחקתי','Bechukotai'],
   ['במדבר','Bamidbar'],['נשא','Nasso'],['בהעלותך',"Beha'alotcha"],['שלח','Shelach'],
   ['קרח','Korach'],['חוקת','Chukat'],['בלק','Balak'],['פינחס','Pinchas'],['מטות','Matot'],
   ['מסעי','Masei'],['דברים','Devarim'],['ואתחנן','Vaetchanan'],['עקב','Eikev'],
   ['ראה',"Re'eh"],['שופטים','Shoftim'],['כי תצא','Ki Teitzei'],['כי תבוא','Ki Tavo'],
   ['נצבים','Nitzavim'],['וילך','Vayeilech'],['האזינו','Haazinu'],['וזאת הברכה','Vezot Haberakhah']
  ].forEach(function (a) { HE_PARASHA[a[0]] = a[1]; });

  var GEM = {'א':1,'ב':2,'ג':3,'ד':4,'ה':5,'ו':6,'ז':7,'ח':8,'ט':9,'י':10,'כ':20,'ך':20,
    'ל':30,'מ':40,'ם':40,'נ':50,'ן':50,'ס':60,'ע':70,'פ':80,'ף':80,'צ':90,'ץ':90,
    'ק':100,'ר':200,'ש':300,'ת':400};
  function gematria (s) {
    s = String(s || '').replace(/["'\u05f3\u05f4]/g, '');
    if (!s || !/^[\u05d0-\u05ea]+$/.test(s)) return 0;
    /* ⚠⚠ THE ORDER TEST IS WHAT STOPS A WORD BEING READ AS A NUMBER, and it
     * was found by running the scanner: in `טור ושו"ע יו"ד רצג, ב` the Tur's
     * location was read off the NEXT WORK'S NAME — ושו summed to 312, giving
     * `Tur, Yoreh De'ah 312`: a real, fetchable, completely wrong passage. Every
     * Hebrew word is a number if you let it be one.
     * A Hebrew numeral is always written hundreds → tens → units, so its letter
     * values never increase (שלא = 300,30,1 ✓ · רצג = 200,90,3 ✓ · טו = 9,6 ✓),
     * while ושו = 6,300,6 and ברכות = 2,200,20,6,400 both climb. That single
     * property separates numerals from vocabulary without a word list. */
    var n = 0, prev = Infinity;
    for (var i = 0; i < s.length; i++) {
      var v = GEM[s.charAt(i)];
      if (!v || v > prev) return 0;
      prev = v; n += v;
    }
    return n;
  }
  /* Months, so a date is never read as a work. ט"ז בשבט is the sixteenth of
   * Shevat; ט"ז alone is the Turei Zahav. Measured in this corpus. */
  var HE_MONTH = /^\s*ב?(?:ניסן|אייר|סיון|סיוון|תמוז|אב|אלול|תשרי|חשון|חשוון|כסלו|טבת|שבט|אדר)/;

  /* ── 2 · MATCHERS ───────────────────────────────────────────────────────
   * Built once. Every entry knows its work id and how long its literal is, so
   * overlapping matches resolve longest-first ("SAH" beats "SA", "Mishnah
   * Berurah" beats "MB"). */
  function esc (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* ⚠️ ONE APOSTROPHE, BOTH SIDES. `Ta’anit` and `Ta'anit` differ by one
   * invisible character (U+2019 vs U+0027) and only one of them was in the
   * tractate list — 19 citations lost to it. Normalising the TEXT alone would
   * have broken every pattern written with a curly quote (Bei’ur Halakha,
   * Yabi’a Omer, Ma’amar Mordechai), so both are normalised. The substitution is
   * one character for one character, so every `at` offset — and therefore every
   * claim span into the same string — is unchanged. */
  function norm (s) { return String(s).replace(/[\u2019\u02bc\u05f3]/g, "'"); }
  var MATCHERS = [];
  /* \u26a0\u26a0 `\\b` CANNOT OPEN A PATTERN THAT BEGINS WITH \u1e24, AND THE FAILURE IS
   * TOTAL AND SILENT. JS's \\b is defined on [A-Za-z0-9_]: before " \u1e24atam Sofer"
   * the previous character is a space and the next is \u1e24 \u2014 neither is a word
   * character, so there is no boundary and the matcher never fires once.
   * MEASURED across the whole dictionary 2026-08-08: **168 patterns beginning
   * with an ASCII letter, ZERO unread; 7 beginning with a non-ASCII letter, ALL
   * SEVEN unread.** Among them `\u1e24ayei Adam`, in the dictionary since it was
   * written and never once able to match.
   * \u26a0\u26a0 AND THIS IS WHY THE CORPUS GAP SCAN CALLED \u1e24ATAM SOFER AND \u1e24AZON ISH
   * WORKS WE LACKED WHEN BOTH ALREADY HAD ROWS \u2014 from outside, a dead pattern
   * and an absent work look exactly alike. A gap list is only ever as good as
   * the matcher it was measured with. */
  var LEAD = (function () {
    try { new RegExp('(?<![A-Za-z])x'); return '(?<![A-Za-z0-9_\\u00C0-\\u024F\\u1E00-\\u1EFF])'; }
    catch (e) { return ''; }   /* no lookbehind here: match unbounded rather than never */
  })();
  var TAIL = '(?![A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF])';
  function lead (p) { return /^[A-Za-z0-9]/.test(p) ? '\\b' : LEAD; }
  WORKS.forEach(function (w, id) {
    (w.pats || []).forEach(function (p) {
      var np = norm(p);
      MATCHERS.push({id: id, lit: p, re: new RegExp(lead(np) + esc(np) + TAIL, 'g'), len: p.length});
    });
  });
  TRACTATES.forEach(function (t) {
    MATCHERS.push({id: 2, lit: t, tract: t, re: new RegExp(lead(t) + esc(t) + TAIL, 'g'), len: t.length});
  });
  TANAKH.forEach(function (b) {
    MATCHERS.push({id: 0, lit: b, book: b, re: new RegExp(lead(b) + esc(b) + TAIL, 'g'), len: b.length});
  });
  MATCHERS.sort(function (a, b) { return b.len - a.len; });

  /* ⚠️ THE TEXT HAS WORDS GLUED TOGETHER where markup was stripped upstream —
   * "TosafotBeitza 21b", "Smagteḥum". A blanket camelCase split would corrupt
   * legitimate names (Arukh HaShulchan → "Arukh Ha Shulchan"), so the repair is
   * bounded to the tractate names we know: a lowercase letter immediately
   * followed by a tractate gets one space. Nothing else is touched. */
  var GLUE = new RegExp('([a-z])(' + TRACTATES.map(esc).join('|') + ')\\b', 'g');

  /* ── 2b · THE HEBREW MATCHER TABLE ──────────────────────────────────────
   * Hebrew letters are not `\w`, so `\b` is useless here and a regex-per-work
   * scan would match inside words. Instead the text is TOKENISED once and the
   * dictionary is looked up per token — which also makes prefix-stripping and
   * the stoplist exact rather than approximate. Longest phrase wins, so
   * "משנה ברורה" beats "משנה" and "בן איש חי" beats "חי". */
  var HE_DICT = {}, HE_MAXW = 1;
  function heAdd (key, val) {
    var k = String(key).replace(/\u05f4/g, '"').replace(/\u05f3/g, "'");
    if (!HE_DICT[k]) HE_DICT[k] = val;
    HE_MAXW = Math.max(HE_MAXW, k.split(/\s+/).length);
  }
  WORKS.forEach(function (w, id) {
    (HE_PATS[w.k] || []).forEach(function (p) { heAdd(p, {id: id}); });
  });
  Object.keys(HE_TRACT).forEach(function (h) { heAdd(h, {id: 2, tract: HE_TRACT[h]}); });
  heAdd('פנה"ל', {internal: true}); heAdd('פניני הלכה', {internal: true});
  heAdd('משנה', {id: 1, mishnahMark: true}); heAdd('ירושלמי', {id: 3});

  var HE_TOKRE = /[\u05d0-\u05ea]+(?:["'\u05f3\u05f4][\u05d0-\u05ea]*)*/g;

  /* ⚠️⚠️ THE ORDER TEST DOES NOT SEPARATE NUMERALS FROM VOCABULARY, AND THIS FILE
   * SAID IT DID (measured 2026-08-09). `gematria()` refuses a sequence whose
   * letter values INCREASE — which correctly kills או (1,6) and כל (20,30), the
   * case it was written for — but ordinary Hebrew words are very often
   * non-increasing, and they were being read as simanim. Measured by calling
   * `scanHe` on the plain forms this corpus writes constantly:
   *     שו"ע שם        → Shulchan Arukh 340    (שם is *ibid*)
   *     שו"ע לא כתב כן → Shulchan Arukh 31     (לא is *did not*)
   *     שו"ע לו        → Shulchan Arukh 36     (לו is *to him*)
   * ⚠️⚠️ AND EVERY ONE OF THOSE SIMANIM EXISTS — so `verify()` fetches them clean
   * and the page shows a real passage about the wrong law under the right
   * author's name. That is the cardinal failure this layer exists to refuse,
   * arriving through the NUMBER instead of through the work, and no fetch can
   * ever catch it. `שם` alone stands at the head of 79 locations in the corpus.
   *
   * ⚠️ AND THE COMMONEST CASE IS NOT A WORD AT ALL, IT IS THE NEXT WORK'S NAME.
   * The numeral pattern stops at the gershayim, so the HEAD of an acronym reads
   * as a number: רמב"ם → רמב → 242 · רא"ש → רא → 201 · ריטב"א → ריטב → 221 ·
   * רי"ף → רי → 210 · סמ"ג → סמ → 100. Measured: `שו"ע ורמב"ם` — two works in
   * one breath, the ordinary shape of a Hebrew citation cluster — put siman 242
   * on the Shulḥan Arukh and then correctly emitted the Rambam beside it.
   *
   * TWO TESTS, AND THE FIRST IS STRUCTURAL RATHER THAN LEXICAL. Read the WHOLE
   * token — gershayim and all — and ask the dictionary: a token it knows as a
   * work, a stopword or an ambiguous acronym is a NAME, and a name is never a
   * location. Same oracle `heIsWork` already uses; no list, no judgement.
   * ⚠️ The second test IS a hand-kept list and this file does not get to pretend
   * otherwise — the F2.7 lesson, where denying a map existed hid the gap in it.
   * ⚠️⚠️ AND EVERY WORD ON IT IS ALSO A REAL SIMAN NUMBER, so a blanket refusal
   * would lose legitimate citations. The escape is the marker the author wrote:
   * where the footnote says `סי'` or `סעיף` outright, the number is trusted even
   * if its letters spell a word — `שו"ע סי' לא` is siman 31 and `שו"ע לא כתב` is
   * not. A name is refused either way, because no marker makes רמב"ם a number.
   * ⚠️ KNOWN RESIDUAL, RECORDED RATHER THAN PAPERED OVER: `שלא` is BOTH siman 331
   * and the word "that not", and it is the flagship good case (`שו"ע או"ח שלא,
   * טו`), so it is deliberately NOT on the list — `שו"ע שלא כתב כן` still
   * misreads. Separating those two needs the sentence, not the token.
   * ⚠️ `שם` is *ibid* — a real citation form, not noise. Dropping it to "named
   * without a location" is honest but lossy: its antecedent is sitting in the
   * same positional scan, and the English side already resolves `ad loc.` that
   * way. Resolving it is open work, named here rather than quietly declined. */
  var HE_LOCSTOP = {};
  ('שם לא לו על מי מה פי רב שלו עליו').split(/\s+/)
    .forEach(function (w) { HE_LOCSTOP[w] = 1; });
  var HE_TOKHEAD = /^[\s,;:.\u2013-]*([\u05d0-\u05ea]+(?:["'\u05f3\u05f4][\u05d0-\u05ea]*)*)/;
  /* '' · 'name' (structural, always refused) · 'word' (listed, refused unless the
   * footnote wrote an explicit siman/se'if marker in front of it).
   * ⚠️⚠️ THE PREFIX PEEL APPLIES TO NAMES ONLY, AND THE FIRST CUT OF THIS FUNCTION
   * PEELED THE WORD LIST TOO — which broke the flagship case in the header two
   * lines above. `שלא` IS siman 331, and ש is a Hebrew prefix letter, so peeling
   * it left `לא` and the stoplist refused the most-cited siman form in the
   * corpus. A prefixed WORK NAME (`ורמב"ם`) is still that work; a numeral that
   * happens to start with a prefix letter is still a numeral. */
  function heNotNumeral (tok) {
    var k = String(tok || '').replace(/\u05f4/g, '"').replace(/\u05f3/g, "'");
    if (!k) return '';
    if (HE_DICT[k] || HE_STOP[k] || HE_AMBIG[k]) return 'name';
    if (HE_LOCSTOP[k]) return 'word';
    var stem = k;
    for (var p = 0; p < 2 && stem.length > 2 && HE_PREFIX.indexOf(stem.charAt(0)) >= 0; p++) {
      stem = stem.slice(1);
      if (HE_DICT[stem] || HE_AMBIG[stem]) return 'name';
    }
    return '';
  }

  /* Read a location off the text following a matched work. Returns the SAME
   * shapes `scan()` emits, so everything downstream is language-blind. */
  function heLoc (tail, w, hit) {
    var t = tail, sec = null, m, cut = 0;
    m = t.match(/^[\s,;:.\u2013-]*([\u05d0-\u05ea]{2,4}["'\u05f3\u05f4][\u05d0-\u05ea]{1,2})/);
    if (m && HE_SEC[m[1].replace(/\u05f4/g, '"')]) { sec = HE_SEC[m[1].replace(/\u05f4/g, '"')]; t = t.slice(m[0].length); cut += m[0].length; }
    /* a volume marker, for responsa: ח"א / ח"ב */
    var vol = 0;
    m = t.match(/^[\s,;:.]*ח["'\u05f3\u05f4]([\u05d0-\u05d3])/);
    if (m) { vol = gematria(m[1]); t = t.slice(m[0].length); cut += m[0].length; }
    /* the Rambam names his book in words, optionally after הל' */
    if (w && w.k === 'mt') {
      m = t.match(/^[\s,;:.]*(?:הל["'\u05f3\u05f4]?\s*|הלכות\s+)?([\u05d0-\u05ea]{2,}(?:\s+[\u05d0-\u05ea]{2,}){0,2})\s*[,\s]\s*([\u05d0-\u05ea]{1,4})\s*,\s*([\u05d0-\u05ea]{1,4})/);
      if (m) {
        var bk = m[1].trim(), ch = gematria(m[2]), hl = gematria(m[3]);
        if (ch && hl) return {loc: (HE_MT_BOOK[bk] || bk) + ' ' + ch + ':' + hl, form: 'bookChapHal', sec: sec, used: cut + m[0].length};
      }
      return {loc: '', form: 'bare', sec: sec};
    }
    /* strip the markers that only announce a location. ⚠️ `סע'` was missing — the
     * pattern required `סעי`, so the commonest short spelling was never read. */
    var marked = false;
    t = t.replace(/^[\s,;:.]*(?:סי["'\u05f3\u05f4]?\s*|סימן\s+|סעי?["'\u05f3\u05f4]?\s*|סעיף\s+)/,
      function (mm) { marked = true; cut += mm.length; return ''; });
    var none = {loc: vol ? String(vol) : '', form: vol ? 'num1' : 'bare', sec: sec};
    /* ⚠️ THE WHOLE TOKEN DECIDES, NOT THE LETTERS THE NUMERAL PATTERN WOULD TAKE. */
    var head = t.match(HE_TOKHEAD);
    var headTok = head ? head[1] : '';
    /* ⚠️ שם IS *IBID*, AND IT IS A CITATION FORM RATHER THAN NOISE — the open item
     * this file named when the stoplist went in. It is emitted in exactly the
     * shape the English scanner already produces for "ad loc." (form `adloc`, no
     * number), so `resolve()`'s existing antecedent branch inherits the siman
     * and not one line of new resolution logic is needed. Without an antecedent
     * it refuses and says so, which is what it already does in English.
     * ⚠️ An explicit marker in front of it means a real number: `סי' שם` is not
     * anaphora, so this fires only where the stoplist would have refused. */
    if (!marked && /^\u05d5?\u05e9\u05dd$/.test(headTok)) {
      return {loc: '', form: 'adloc', sec: sec, used: cut + head[0].length};
    }
    var badHead = headTok ? heNotNumeral(headTok) : '';
    /* a NAME is refused outright and no context rescues it — no marker and no
     * following number makes רמב"ם a siman. */
    if (badHead === 'name') return none;
    /* ⚠️ THE SE'IF IS NOT ALWAYS BEHIND A COMMA. `שו"ע סי' שלא סע' טו` is siman 331
     * se'if 15, and this read only the siman — silently degrading a precise
     * citation to a whole-siman one — because the second number had to be behind
     * a comma. The author's own marker is a separator too. */
    m = t.match(/^[\s,;:.]*([\u05d0-\u05ea]{1,5})(?:(?:\s*,\s*|\s*(?:סעיף|סעי?["'\u05f3\u05f4]|ס["'\u05f3\u05f4]?ק)\s*)([\u05d0-\u05ea]{1,4}))?/);
    if (!m) return none;
    var a = gematria(m[1]), b = 0;
    if (!a) return none;
    /* ⚠️⚠️ THE TWO-PART FORM IS ITS OWN EVIDENCE, and without this the stoplist
     * costs real citations. Measured: `שו"ע לא, ב` is siman 31 se'if 2 — an
     * ordinary, unambiguous reference — and the word test threw the whole
     * location away because לא is also *did not*. But לא as a word is never
     * followed by a comma and a lone gematria letter; that shape only occurs in
     * a citation. So a listed word standing ALONE is still refused (`שו"ע לא
     * כתב כן`), and the same word carrying a second number is read. Three ways
     * in, then: the author's own marker, a second number, or not being a word.
     * A NAME is refused by all three, above, because it is structural. */
    var twoPart = !!(m[2] && heNotNumeral(m[2]) !== 'name' && gematria(m[2]));
    if (badHead === 'word' && !marked && !twoPart) return none;
    if (m[2] && heNotNumeral(m[2]) !== 'name') b = gematria(m[2]);
    /* ⚠️⚠️ `X, Y` IS THREE DIFFERENT THINGS AND ONLY THE WORK SAYS WHICH.
     * For the SA and its commentaries it is siman, se'if. For a TRACTATE it is
     * daf, amud — measured, `, א`/`, ב` after a tractate name occurs 275 times
     * in these footnotes while an explicit ע"א/ע"ב occurs ZERO times, so the
     * bare letter IS the amud. The English grammar could tell Mishnah from
     * Talmud by form (`3:7` vs `134b`); in Hebrew both are `ג, ז` and `פד, א`,
     * so form cannot decide and the work must.
     * ⚠️ RESIDUAL, AND SAID OUT LOUD RATHER THAN HIDDEN: `שבת ג, א` is
     * genuinely ambiguous — Shabbat 3a, or Mishnah Shabbat 3:1. It is read as
     * the folio because that is what this corpus overwhelmingly means, EXCEPT
     * where the citation is introduced by משנה, which settles it. */
    if (hit && hit.tract) {
      if (!hit.mishnah && m[2] && (m[2] === 'א' || m[2] === 'ב')) {
        return {loc: a + (m[2] === 'א' ? 'a' : 'b'), form: 'folio', sec: sec, used: cut + m[0].length};
      }
      if (b) return {loc: a + ':' + b, form: 'num2', sec: sec, used: cut + m[0].length};
      return {loc: String(a), form: 'num1', sec: sec, used: cut + m[0].length};
    }
    if (b) return {loc: a + ':' + b, form: 'num2', sec: sec, used: cut + m[0].length};
    return {loc: String(a), form: 'num1', sec: sec, used: cut + m[0].length};
  }

  /* ── 3b · THE HEBREW SCAN ───────────────────────────────────────────────
   * One positional pass, exactly like `scan()` — document order is still the
   * only thing that can attach a location to the work before it. */
  /* ⚠️⚠️ SOME TEXTS WRITE AN ABBREVIATION WITH TWO ASCII APOSTROPHES, NOT A
   * GERSHAYIM, AND THE SCANNER SAW NOTHING AT ALL. Measured on Kesef Mishneh,
   * MT Sabbath 14: 3,282 characters of dense citation — כתב הרב המגיד מ''ש
   * רבינו, כתב ה''ר אברהם בנו של רבינו — yielding ZERO citations, beside
   * Be'ur HaGra's 51 and the Beit Yosef's 42 on comparable text. The cause is
   * one character: מ''ש against מ״ש. Not a grammar gap, not a citation culture,
   * an ENCODING VARIANT — and it presented as the work being unreadable.
   * ⚠️ Normalised before matching and never in what is displayed: the doubled
   * apostrophe is how that edition prints, and rewriting the text we show
   * would be correcting a source to suit our parser. */
  function heNormQuotes (t) {
    return String(t).replace(/''/g, '\u05f4').replace(/``/g, '\u05f4')
      .replace(/(?<=[\u05d0-\u05ea])'(?=[\u05d0-\u05ea])/g, '\u05f4');
  }
  function scanHe (text, ctx) {
    text = heNormQuotes(text);
    var src = String(text).replace(/\u05f4/g, '"').replace(/\u05f3/g, "'");
    var internal = [], out = [], toks = [], m;

    /* ⚠️ להלן / לעיל ARE PENINEI HALAKHA POINTING AT ITSELF, and masking
     * them is not tidiness — it is the Hebrew form of the `Peninei Halakha:`
     * trap the English scanner already masks. Measured: “כמבואר בברכות מא,
     * ב, ולהלן ז, ג” is Berakhot 41b followed by *his own* 7:3 — unmasked, the
     * second pair was read as a further citation and produced Mishnah Berakhot
     * 12:11, a tractate that has nine chapters. Blanked to spaces, never cut,
     * so every later offset still indexes the same character. */
    src = src.replace(/(?:\u05dc\u05d4\u05dc\u05df|\u05dc\u05e2\u05d9\u05dc)\s+([\u05d0-\u05ea]{1,4})\s*,\s*([\u05d0-\u05ea]{1,4})/g,
      function (mm, a, b) {
        var ch = gematria(a), se = gematria(b);
        if (ch && se) internal.push({vol: '', ch: ch, se: se});
        return new Array(mm.length + 1).join(' ');
      });

    /* ⚠⚠ AND THE SAME FOR פנה"ל — PENINEI HALAKHA CITING ITSELF BY VOLUME.
     * The English scanner masks `Peninei Halakha:` for exactly this reason and
     * the Hebrew form went unmasked, which is how `פנה"ל ברכות יב, יא` — his
     * own Berakhot 12:11 — came out as MISHNAH Berakhot 12:11, a tractate with
     * nine chapters. Recording the edge is not enough: the span has to be
     * blanked, or the volume name is left standing for the tractate matcher to
     * find with the self-reference's numbers still attached to it. */
    src = src.replace(/[\u05d5\u05d1\u05dc\u05d4]?(?:\u05e4\u05e0\u05d4"\u05dc|\u05e4\u05e0\u05d9\u05e0\u05d9 \u05d4\u05dc\u05db\u05d4)\s+([\u05d0-\u05ea]{2,}(?:\s+[\u05d0-\u05ea]{2,}){0,2}?)\s+([\u05d0-\u05ea]{1,4})\s*,\s*([\u05d0-\u05ea]{1,4})/g,
      function (mm, vol, a, b) {
        var ch = gematria(a), se = gematria(b);
        if (!ch || !se) return mm;
        internal.push({vol: vol.trim(), ch: ch, se: se});
        return new Array(mm.length + 1).join(' ');
      });

    HE_TOKRE.lastIndex = 0;
    while ((m = HE_TOKRE.exec(src))) toks.push({t: m[0], at: m.index, end: m.index + m[0].length});

    var i = 0, prevMishnah = false;
    while (i < toks.length) {
      var hit = null, span = 0;
      for (var n = Math.min(HE_MAXW, toks.length - i); n >= 1 && !hit; n--) {
        var phrase = toks.slice(i, i + n).map(function (x) { return x.t; }).join(' ');
        /* ⚠️ THE WHOLE TOKEN FIRST, THE STRIPPED STEM ONLY AFTER — or בא"ח
         * (Ben Ish Ḥai) is read as a ב-prefixed א"ח that means nothing. */
        if (HE_STOP[phrase]) { break; }
        if (HE_DICT[phrase]) { hit = HE_DICT[phrase]; span = n; break; }
        /* Hebrew stacks its prefixes — ובמשנה is ו+ב+משנה — so up to two are
         * peeled. The dictionary is the gate, so a peel that lands on nothing
         * simply fails; it can never invent a work. */
        if (n === 1 && phrase.length > 2) {
          var stem = phrase;
          for (var p = 0; p < 2 && stem.length > 2 && HE_PREFIX.indexOf(stem.charAt(0)) >= 0; p++) {
            stem = stem.slice(1);
            if (!HE_STOP[stem] && HE_DICT[stem]) { hit = HE_DICT[stem]; span = 1; break; }
          }
          if (hit) break;
        }
      }
      if (!hit) {
        var bare = toks[i].t, stripped = (bare.length > 2 && HE_PREFIX.indexOf(bare.charAt(0)) >= 0) ? bare.slice(1) : bare;
        var amb = HE_AMBIG[bare] ? bare : (HE_AMBIG[stripped] ? stripped : '');
        if (amb) {
          out.push({id: -1, at: toks[i].at, lit: amb, tract: amb, book: '', loc: '',
            form: 'ambiguous', sec: null, attrib: 0, why: HE_AMBIG[amb]});
        }
        prevMishnah = (bare === 'משנה' || bare === 'מש\'');
        i++; continue;
      }
      var endAt = toks[i + span - 1].end;
      if (hit.mishnahMark) { prevMishnah = true; i += span; continue; }
      if (hit.internal) {
        var im = src.slice(endAt, endAt + 60).match(/^\s*([\u05d0-\u05ea]{2,}(?:\s+[\u05d0-\u05ea]{2,}){0,2})\s+([\u05d0-\u05ea]{1,4})\s*,\s*(\d{1,3}|[\u05d0-\u05ea]{1,4})/);
        if (im) internal.push({vol: im[1].trim(), ch: gematria(im[2]), se: /^\d+$/.test(im[3]) ? +im[3] : gematria(im[3])});
        i += span; continue;
      }
      var tailStart = endAt;
      /* ⚠️ A DATE IS NOT A WORK. ט"ז before a month name is the sixteenth. */
      if (HE_MONTH.test(src.slice(tailStart, tailStart + 12)) && /^[\u05d0-\u05ea]{1,3}["'][\u05d0-\u05ea]$/.test(toks[i].t)) { i += span; continue; }
      var w = WORKS[hit.id];
      /* F4.10 · בא"ח ש"ש שלח ח — an optional year marker, an optional פרשת, the
       * parasha, the paragraph in gematria. Emitted in the SAME shape the
       * English scanner produces (`year~parasha~num`, form `parashaNum`), so
       * resolve, verify, pack and the UI are untouched. ⚠️ A parasha name is an
       * ordinary Hebrew word — שלח is "send", בא is "come" — which is safe only
       * because this branch fires nowhere except immediately after his name. */
      if (hit.id === 27) {
        var bhTail = src.slice(tailStart, tailStart + 60);
        var bh = bhTail.match(/^[\s,;:.()]*(?:(\u05e9["'][\u05e8\u05d0\u05e9\u05d1]|\u05e9\u05e0\u05d4 \u05e8\u05d0\u05e9\u05d5\u05e0\u05d4|\u05e9\u05e0\u05d4 \u05e9\u05e0\u05d9\u05d9?\u05d4)\s*[,;:]?\s*)?(?:\u05e4\u05e8\u05e9\u05ea\s+)?([\u05d0-\u05ea]{2,8}(?:\s+[\u05d0-\u05ea]{2,8})?)\s*[,;:]?\s*([\u05d0-\u05ea]{1,4})(?![\u05d0-\u05ea])/);
        var bhPar = bh && HE_PARASHA[bh[2].trim()];
        /* a two-word parasha may have swallowed the paragraph letter; retry short */
        if (bh && !bhPar && /\s/.test(bh[2])) {
          var one = bh[2].split(/\s+/)[0];
          if (HE_PARASHA[one]) { bhPar = HE_PARASHA[one]; bh[3] = bh[2].split(/\s+/)[1] || bh[3]; }
        }
        if (bhPar && gematria(bh[3])) {
          out.push({id: 27, at: toks[i].at, lit: toks.slice(i, i + span).map(function (x) { return x.t; }).join(' '),
            tract: '', book: '', form: 'parashaNum', sec: null, attrib: 0,
            loc: (bh[1] ? (HE_BIH_YEAR[bh[1].replace(/\u05f4/g, '"').replace(/\u05f3/g, "'")] || '') : '') + FSEP + bhPar + FSEP + gematria(bh[3])});
          prevMishnah = false; i += span; continue;
        }
      }
      var L = heLoc(src.slice(tailStart, tailStart + 70), w, {tract: hit.tract, mishnah: prevMishnah});
      /* ⚠️⚠️ AND THE LOCATION'S OWN WORDS MUST NOT BE SCANNED AGAIN. `רמב"ם הל'
       * שבת ה, ג` is the Rambam on Hilkhot Shabbat 5:3 — and שבת is ALSO a
       * tractate in the dictionary, so the scan walked straight back over the
       * location it had just consumed and emitted a SECOND row for `שבת ה, ג`,
       * filed as an unattributable tractate division. The right attribution and
       * a spurious "we cannot tell whose division this is" for the same five
       * characters. It fires on every Rambam citation whose book shares a name
       * with a tractate — Shabbat, Berakhot, Eruvin, Beitzah, Pesaḥim — which in
       * this corpus is most of them. A positional scan is only positional if a
       * match CONSUMES what it read, so heLoc reports how far it got. */
      var eat = function (n) {
        i += n;
        var end = tailStart + (L.used || 0);
        while (i < toks.length && toks[i].end <= end) i++;
      };
      /* ⚠⚠ A BARE TRACTATE NAME IS NOT A CITATION, IT IS A WORD — the English
       * rule, and in Hebrew it is the difference between working and not.
       * ביצה is an EGG (“חצי ביצה”, half an egg), שבת is the Sabbath,
       * ברכות is blessings, נדה and סוכה and פסחים are all ordinary nouns on
       * every page of the volumes named after them. Measured in PH Berakhot 3:
       * every genuine talmudic citation carried a folio (ברכות מא, ב) and every
       * false positive had none. A named AUTHORITY is the opposite — saying
       * “רשב"א” IS the citation — so this drop applies to tractates alone. */
      if (hit.tract && !L.loc) { i += span; prevMishnah = false; continue; }
      /* ⚠⚠ A TRACTATE WITH A `n, n` IS ALMOST NEVER THE MISHNAH HERE — IT IS
       * SOMEONE ELSE'S DIVISION OF THAT TRACTATE, and this is the Hebrew face
       * of the Rosh-as-Mishnah error the English grammar already carries a rule
       * for. Measured in Kashrut 26: `יש"ש חולין ח, ט` is the Yam Shel
       * Shlomo's own chapter 8 siman 9 on Ḥullin, and `הגהות מיימוניות
       * (שבת כט, מ)` is his gloss on Rambam, Hilkhot Shabbat 29:40. Read as
       * mishnayot they gave Ḥullin 8:9 and Shabbat 29:40 — out of range, so the
       * fetch caught them. ⚠️ BUT `יש"ש חולין ח, ו` VERIFIED CLEAN as Mishnah
       * Ḥullin 8:6 — a real passage, the wrong work, on the page under the
       * wrong name. That is the failure this project exists to refuse, and no
       * fetch can catch it. So: the Mishnah is read ONLY where משנה says so;
       * otherwise the division belongs to a work the footnote named in a form
       * we cannot resolve, and it is NAMED rather than guessed at. */
      if (hit.tract && L.form === 'num2' && !prevMishnah) {
        out.push({id: -2, at: toks[i].at, lit: hit.tract + ' ' + L.loc, tract: hit.tract + ' ' + L.loc,
          book: '', loc: '', form: 'tractDivision', sec: null, attrib: 0});
        prevMishnah = false; eat(span); continue;
      }
      var id = hit.id;
      /* a tractate introduced by משנה is the Mishnah, and calling it Talmud
       * would be a false attribution on the page — the workName() rule. */
      if (hit.tract && prevMishnah) id = 1;
      out.push({id: id, at: toks[i].at, lit: toks.slice(i, i + span).map(function (x) { return x.t; }).join(' '),
        tract: hit.tract || '', book: '', loc: L.loc, form: L.form,
        sec: L.sec || null, attrib: 0});
      prevMishnah = false;
      eat(span);
    }
    return {cites: out, internal: internal};
  }

  /* Rishonim whose own halakhic works are divided by TRACTATE chapter:siman. A
   * `n:n` after one of their names is HIS division, never the Mishnah. */
  var RISHON_TRACT = {4: 1, 12: 1, 13: 1};   /* Rif · Rosh · Ran */

  /* Location forms, tried in this order. A folio must beat a bare number, and
   * `\d+:\d+` must beat `\d+`, or every siman:se'if truncates to its siman. */
  var LOCRE = [
    {f: 'adloc', re: /^[,;:]?\s*(?:ad loc\.?|ibid\.?)\s*(\d+(?::\d+)?)?/},
    {f: 'paren', re: /^\s*\((\d+:\d+(?::\d+)?)\)/},
    {f: 'folio', re: /^[,;:]?\s*(\d{1,3}[ab](?:[-\u2013](?:\d{1,3})?[ab]?)?)(?![:\d])/},
    {f: 'num3',  re: /^[,;:]?\s*(\d{1,3}:\d{1,3}:\d{1,3})/},
    {f: 'num2',  re: /^[,;:]?\s*(\d{1,4}:\d{1,3}(?:[-\u2013]\d{1,3})?)/},
    {f: 'num1',  re: /^[,;:]?\s*(\d{1,4})(?![:\d])/}
  ];
  /* An explicit section between work and location: `SA YD 120:16`.
   *
   * ⚠️⚠️ F4.1, MEASURED 2026-08-08. Across 13,764 cached citations only **641**
   * carried their own section, and 553 of those came from the HEBREW grammar
   * (`HE_SEC`). The English side read **88 of the 474 explicit section markers
   * sitting in its own footnote prose** — 19%. The grammar was not absent; it
   * read one form and the corpus writes five. Three faults, each enough alone:
   *
   *   · `\b` IS ASCII. After `OḤ` (U+1E24) a word boundary can never fire —
   *     neither Ḥ nor the following space is an ASCII word character — so the
   *     single commonest marker in the corpus (121 occurrences) was structurally
   *     unreadable. `Y.D.` failed the same way: a full stop then a space.
   *   · `OC` and `Orach Chayim` (with the y) were not in the list at all, while
   *     `Orach Chaim` was. PH writes both.
   *   · `^\s*` refused a leading comma, so `SA, Orach Chaim 345:2` matched no
   *     section — and THEN no location either, because the location matcher hit
   *     words where it wanted digits. The most precise thing a footnote can do,
   *     naming its section, left the citation LESS resolvable than saying
   *     nothing at all.
   *     nothing at all. ⚠️ And the first fix for this was still too narrow: it
   *     allowed punctuation THEN space, while the corpus writes `Har Tzvi (OḤ
   *     1:152)` — space then bracket, which left the section unread AND the
   *     location with it. `[\s,;(]*` takes them in any order and any number.
   *
   * The lookahead replaces `\b` and is Unicode-safe: a section ends where a
   * space, punctuation or a digit begins. */
  /* ⚠️⚠️ `Orach Cha[iy]im` MATCHED THE SPELLING THIS CORPUS NEVER USES AND MISSED
   * THE ONE IT ALWAYS USES. `[iy]` is a single character, so the alternative reads
   * "Chayim" or "Chaiim" — never "Chaim". Measured over the 275 cached chapters
   * (3.37 M characters of footnote prose), 2026-08-09: **"Orach Chaim" 60 ·
   * "Orach Chayim" 0**. Sixty explicit section markers were unread by the one
   * pattern whose job is reading them, and F4.14 filed that gap against missing
   * AUTHORITY rows — the count was right and the cause was wrong.
   * ⚠️ SECKEY was never affected (it tests `^(?:OḤ|OH|OC|Ora)`), which is exactly
   * why this survived: the section CODE was correct wherever the section was
   * recognised at all, so nothing downstream ever looked wrong — it simply was
   * not there. `y?` rather than `[iy]`; the abbreviations are untouched. */
  var SECRE = /^[\s,;(]*(?:O["\u201d]?\u1e24|O\.\u1e24\.?|OH|O\.H\.?|OC|Ora\u1e25 \u1e24ayim|Orach Chay?im|Y["\u201d]D|Y\.D\.?|YD|Yoreh De[\u2019']?ah|E["\u201d]?H|E\.H\.?|Even Ha-?[\u2019']?Ezer|\u1e24["\u201d]?M|\u1e24\.M\.?|H\.M\.?|HM|Choshen Mishpat)(?=[\s,;:.\d]|$)/;
  var SECKEY = function (s) {
    var t = String(s).replace(/^[\s,;(]+/, '').replace(/["\u201d.]/g, '').trim();
    if (/^(?:O\u1e24|OH|OC|Ora)/.test(t)) return 'OC';
    if (/^(?:YD|Yoreh)/.test(t)) return 'YD';
    if (/^(?:EH|Even)/.test(t)) return 'EH';
    return 'HM';
  };
  /* Mishneh Torah names its book in words: `MT, Laws of Yom Tov 4:1`. */
  var MT_BOOK = /^[,]?\s*(?:Laws of\s+|Hilkhot\s+)?([A-Z][A-Za-z\u2019' ]{2,34}?)\s+(\d{1,2}:\d{1,3})/;

  /* ── 3 · THE SCAN ───────────────────────────────────────────────────────
   * ONE pass, document order preserved. That order is not a nicety: it is the
   * only thing that can resolve "ad loc." to the ref before it. */
  function scan (text, ctx) {
    var masked = norm(text).replace(GLUE, '$1 $2'), internal = [];
    /* trap #3 — PH citing itself, masked before anything else can see it */
    masked = masked.replace(/Peninei Halakha:?\s*([A-Za-z\u2019' ]{3,24}?)\s+(\d{1,2}):(\d{1,3})/g,
      function (m, vol, ch, se) {
        internal.push({vol: vol.trim(), ch: +ch, se: +se});
        return new Array(m.length + 1).join('\u0000');
      });

    var hits = [];
    MATCHERS.forEach(function (M) {
      M.re.lastIndex = 0;
      var m;
      while ((m = M.re.exec(masked))) hits.push({at: m.index, end: m.index + m[0].length, M: M});
    });
    hits.sort(function (a, b) { return a.at - b.at || (b.end - b.at) - (a.end - a.at); });

    /* keep longest at each position, drop anything overlapping a kept hit */
    var kept = [], lastEnd = -1;
    hits.forEach(function (h) { if (h.at >= lastEnd) { kept.push(h); lastEnd = h.end; } });

    /* ⚠️⚠️ A WORK THAT SWALLOWS A TRACTATE NAME MUST SWALLOW ITS HIT TOO.
     * "Mishneh Torah, Shabbat 30:9" consumes "Shabbat 30:9" into the Rambam's
     * book-and-chapter — but "Shabbat" ALSO matched the tractate matcher at a
     * later, non-overlapping position, so the same words were emitted a second
     * time as MISHNAH Shabbat 30:9. Measured across the corpus: three phantom
     * mishnayot (Shabbat 30:9, 23:15, 27:2), each a false attribution of the
     * Rambam's words to a tractate that has 24 chapters. Tosafot and the Ben
     * Ish Ḥai consume names the same way, so all three record how far they ate
     * and any hit inside that span is dropped. */
    var out = [], eaten = -1;
    kept.forEach(function (h, ki) {
      if (h.at < eaten) return;
      var w = WORKS[h.M.id], tail = masked.slice(h.end, h.end + 48), sec = null;
      var sm = tail.match(SECRE);
      if (sm) { sec = SECKEY(sm[0].trim()); tail = tail.slice(sm[0].length); }

      var loc = null, form = null;
      /* Ben Ish Ḥai: an optional YEAR, an optional "Parashat", the parasha, the
       * paragraph. The year is what makes the ref resolvable at all. */
      if (h.M.id === 27) {
        var by = tail.match(/^[,;:\s]*\(?\s*(?:(Shanah Rishonah|Shana Rishona|Shanah Sheniyah|Shana Shniya|1st Year|2nd Year|first year|second year|year [12]|rishonah|sheniyah)\s*[,;:]?\s*)?(?:Parashat\s+|Parshat\s+)?([A-Z][A-Za-z'\u2019]{1,12}(?:\s+[A-Z][A-Za-z'\u2019]{1,12})?)\s+(\d{1,3})/);
        /* ⚠️⚠️ THE SEPARATOR HERE MUST NOT BE THE PACK'S ROW SEPARATOR. This
         * used '|' — which is RS — so every Ben Ish Ḥai citation SPLIT ITS OWN
         * CACHED ROW into fragments: measured on Festivals 13, the packed row
         * "27·1st Year|Bereshit|1·…" unpacked as three rows, one of them the
         * literal id "Year", and `WORKS[NaN]` then threw and took the whole
         * chapter down. Silent corruption that only surfaced as a crash because
         * a fragment happened to parse as a work id. */
        if (by) { loc = (by[1] ? by[1] + FSEP : FSEP) + by[2].trim() + FSEP + by[3]; form = 'parashaNum'; eaten = h.end + by[0].length; }
      }
      /* Tosafot names its tractate then the folio: "Tosafot Beitza 21b" */
      if (h.M.id === 52) {
        var tm = tail.match(/^[,]?\s*([A-Z][A-Za-z\u1e24\u1e25' ]{2,18}?)\s+(\d{1,3}[ab])/);
        if (tm) { loc = tm[1].trim() + ' ' + tm[2]; form = 'folioOn'; eaten = h.end + tm[0].length; }
      }
      /* Mishneh Torah takes a book name before its numbers */
      if (h.M.id === 6) {
        var mb2 = tail.match(MT_BOOK);
        /* \u26a0\u26a0 A MISHNEH TORAH BOOK NAME MUST NOT SWALLOW ANOTHER WORK'S.
         * Measured on PH Prayer 10: a footnote naming the Rambam and then the
         * Mishnah Berurah gave book \u201cMishnah Berurah\u201d 47:19, reported as a book
         * name we cannot map \u2014 which reads as a gap in MT_CANON rather than as
         * one work eating another. Same class as the F2.8 phantom mishnayot.
         * The test is whether a NAMED work matched inside the captured span; a
         * tractate matching there is not evidence, because the Rambam's books
         * genuinely share their names (Shabbat, Eruvin, Berakhot). */
        if (mb2) {
          var bSt = h.end, bEn = h.end + mb2[0].length, stolen = false;
          for (var bj = ki + 1; bj < kept.length; bj++) {
            var kk = kept[bj];
            if (kk.at >= bEn) break;
            if (kk.at >= bSt && kk.M.id !== 2 && kk.M.id !== 0 && kk.M.id !== 1) { stolen = true; break; }
          }
          if (!stolen) { loc = mb2[1].trim() + ' ' + mb2[2]; form = 'bookChapHal'; eaten = bEn; }
        }
      }
      if (!loc) {
        for (var i = 0; i < LOCRE.length; i++) {
          var lm = tail.match(LOCRE[i].re);
          if (lm) { loc = lm[1] || ''; form = LOCRE[i].f; break; }
        }
      }
      /* ⚠️ "Rosh (Shabbat 3:7)" is the ROSH's chapter 3 siman 7 on tractate
       * Shabbat — not Mishnah Shabbat 3:7. Read as a Mishnah it produced a ref
       * that happened to be out of range and so got caught by the fetch; in
       * range it would have VERIFIED CLEAN and shown the wrong work entirely.
       * A tractate carrying a chapter:siman immediately after a Rishon whose
       * work is divided that way belongs to him. */
      var attrib = 0;
      if (h.M.id === 2 && (form === 'num2' || form === 'num3')) {
        var pr = kept[ki - 1];
        if (pr && RISHON_TRACT[pr.M.id] && (h.at - pr.end) <= 3) {
          attrib = pr.M.id; form = 'rishonTract';
        } else {
          /* ⚠️⚠️ AND THE SAME IS TRUE OF A WORK WE HAVE NEVER HEARD OF. Measured:
           * "Mirkevet Ha-Mishneh, Shabbat 27:2" is that commentary's own division
           * of the Rambam's Hilkhot Shabbat, and with no dictionary entry for it
           * the tractate matcher read 27:2 as MISHNAH Shabbat 27:2 — a tractate
           * with 24 chapters. Out of range it was caught by the fetch; in range
           * it would have verified clean under the wrong name, which is the
           * failure this layer exists to refuse. The Hebrew scanner already
           * declines these (reserved id -2); English now declines them too.
           * The test is a capitalised name immediately before the tractate that
           * is NOT itself a matched work — i.e. somebody we cannot name. */
          var lead = masked.slice(Math.max(0, h.at - 40), h.at);
          var owner = lead.match(/([A-Z][A-Za-z\u2019'.\- ]{2,30}?)\s*,\s*$/);
          var prEnd = pr ? pr.end : -1;
          if (owner && prEnd < h.at - owner[0].length) {
            form = 'foreignDivision';
          }
        }
      }
      /* The Mishnah is divided chapter:mishnah — two levels, never three. A
       * `a:b:c` on a tractate is some other work's numbering. */
      if (h.M.id === 2 && form === 'num3') form = 'foreignDivision';
      out.push({
        id: h.M.id, at: h.at, lit: h.M.lit, tract: h.M.tract || '', book: h.M.book || '',
        loc: loc || '', form: form || 'bare', sec: sec || null, attrib: attrib
      });
    });
    return {cites: out, internal: internal};
  }

  /* ── 4 · RESOLUTION ─────────────────────────────────────────────────────
   * Raw location → a Sefaria ref, or an honest refusal. Kept OUT of the cache
   * so that fixing a rule here never invalidates a stored chapter. */
  /* One place that decides how a work's ref begins, so a work cannot come out
   * sectioned on one path and bare on another. EVERY SHAPE HERE WAS FETCHED
   * BEFORE IT WAS WRITTEN DOWN (2026-08-07):
   *   plain  Magen Avraham 514:10 · Mishnah Berurah 502:4 · Beur Halakha 352:2
   *          · Kaf HaChaim 90:63 · Chayei Adam 5:1
   *   sec    Shulchan Arukh, Orach Chayim 509:2 · Tur, Orach Chayim 345
   *          · Bach, Orach Chayim 307:5 · Arukh HaShulchan, Orach Chaim 345:26
   *   onSA   Turei Zahav on Shulchan Arukh, Orach Chayim 502:1
   * ⚠️ A REF THAT RETURNS THE WHOLE WORK IS A FAILURE DRESSED AS A SUCCESS:
   *   `Magen Avraham, Orach Chayim 514:10` returned 1.6 MB and `Beur Halakha,
   *   Orach Chayim 352:2` returned 2.1 MB — both non-empty "text", neither a
   *   se'if. A verifier here must BOUND THE LENGTH, not test for non-empty. */
  /* ⚠️ WHY A WORK IS NOT RENDERED — FOUR ANSWERS, NOT ONE, AND THE DIFFERENCE IS
   * THE WHOLE POINT. The first cut printed "on no source we may use" over works
   * Sefaria HAS, which is a false statement about the library, and it hid four
   * renderable rungs — two of them Sephardi authorities, in a panel whose reason
   * for existing is that tradition.
   *
   *   absent        — checked against Sefaria's FULL title list (66,625 entries,
   *                   measured 2026-08-08) and not there. The honest route is a letter to
   *                   a rights holder, not a workaround.
   *   shapeUnknown  — in the catalogue, but no reference form we tried resolves
   *                   yet. Worth an hour's work, not a letter.
   *   needsLoc      — on Sefaria, but this footnote does not give what a ref
   *                   needs (the Rif per tractate; the Rambam per book).
   *   unchecked     — we have not looked. Says so, rather than implying absence.
   */
  var ABSENT = {yy: 1, yo: 1, yd: 1, olt: 1, ma_ah: 1, ssk: 1, tze: 1, hs: 1,
                ya: 1, sht: 1, rashba: 1, rosh: 1};
  /* bih left this set on 2026-08-07 — measured and rendering. rp remains: it is
   * catalogued as "Responsa Rav Pealim" but no ref form resolves yet. */
  var SHAPE_UNKNOWN = {};
  function avail (w) {
    if (w.on === 'render') return 'render';
    if (w.avail) return w.avail;
    if (ABSENT[w.k]) return 'absent';
    if (SHAPE_UNKNOWN[w.k]) return 'shapeUnknown';
    return 'unchecked';
  }
  function unavailWhy (w, loc) {
    if (w.note) return w.note;
    var at = loc ? ' at ' + loc : '';
    switch (avail(w)) {
      /* ⚠️ A WORK MARKED `on:'render'` THAT REACHES HERE HAS NO RESOLVER BRANCH,
       * and the default sentence said "we have not checked whether Sefaria holds
       * it" — false, and printed over 261 Igrot Moshe citations whose own row
       * says render. `volNum` and `chapSeif` have no ref builder; the honest
       * sentence names that as OUR gap rather than implying one in the library. */
      case 'render': return 'Named' + at + '. ' + w.t + ' is on Sefaria, but this project has no reference builder for its ' +
        (w.loc === 'volNum' ? 'volume-and-siman' : w.loc === 'chapSeif' ? 'chapter-and-se\u2018if' : String(w.loc || 'own')) +
        ' form yet, so it is named rather than shown. That is our gap, not the library\u2019s.';
      case 'absent': return 'Named' + at + '. ' + w.t + ' is not in Sefaria\u2019s catalogue \u2014 checked against Sefaria’s full title list \u2014 so there is no text of it we may show.';
      case 'shapeUnknown': return 'Named' + at + '. Sefaria has ' + w.t + ', but no reference form we have tried resolves to a passage yet, so naming it beats showing the wrong one.';
      case 'needsLoc': return 'Named' + at + '. ' + w.t + ' is on Sefaria, but this footnote does not give the division a reference needs.';
      default: return 'Named' + at + '. We have not checked whether Sefaria holds ' + w.t + ', and saying so beats implying it does not.';
    }
  }
  /* A work that covers only some sections of the Shulḥan Arukh cannot be shown at
   * a siman in another — there is no Shakh on Oraḥ Ḥayim, and building the ref
   * anyway produces a 404 that reads as our failure. */
  function coversSec (w, sec) { return !w.secs || w.secs.indexOf(sec) >= 0; }

  /* ⚠️ A THIRD SECTION SPELLING, MEASURED 2026-08-08. The Noda Bi-Yehuda wants
   * the y dropped AND the apostrophe dropped: `Noda BiYehudah I, Orach Chaim 1`
   * ✓ and `Noda BiYehudah I, Yoreh De'ah 1` 400s while `Yoreh Deah` fetches.
   * No other work in the dictionary does both, which is why this cannot be a
   * global normalisation — the same trap the AHS row already records. */
  var SEC_NB = {OC: 'Orach Chaim', YD: 'Yoreh Deah', EH: 'Even HaEzer', HM: 'Choshen Mishpat'};
  function secName (w, sec) {
    return (w.secSp === 'noy' ? SEC_NOY : (w.secSp === 'rp' ? SEC_RP :
      (w.secSp === 'nb' ? SEC_NB : SEC_NAME)))[sec] || SEC_NAME.OC;
  }
  function refBase (w, sec) {
    var stem = w.ref || w.t;
    var name = secName(w, sec);
    if (w.fmt === 'plain') return stem;
    if (w.fmt === 'onSA') return stem + ' on Shulchan Arukh, ' + name;
    if (w.fmt === 'sec') return stem + ', ' + name;
    return stem;
  }
  /* The work as it should be NAMED — a tractate cited as `3:7` is the Mishnah,
   * and labelling it "Babylonian Talmud" is a false attribution on the page. */
  function workName (c) {
    var w = WORKS[c.id];
    if (c.id === 2 && (c.form === 'num2' || c.form === 'num3')) return 'Mishnah';
    return w.t;
  }

  function resolve (c, ctx, prev) {
    /* ⚠️ PRECEDENCE, AND IT IS LOAD-BEARING. The citation's own explicit section
     * wins (`SA YD 120:16`), then THE TOPIC'S, and a work's own `sec` is only a
     * last resort. The first cut read `c.sec || w.sec || ctx.sec`, which put the
     * work ahead of the topic — so `coversSec()` compared every work against its
     * OWN section and could never fail. That made the `secs` gate unreachable
     * code while three files said it fired, and the refs it let through were
     * FETCHABLE: a Shabbat chapter citing "Shakh 339:1" resolved to Siftei Kohen
     * on YD 339:1 — a real, verifying passage about the deathbed — served as a
     * rung on a Shabbat question. `verify()` cannot catch that, because the ref
     * is valid; only the section test can, which is why it must be reachable. */
    var w = WORKS[c.id], sec = c.sec || ctx.sec || w.sec || 'OC';
    /* ⚠️⚠️ F4.2 · WHERE THE SECTION CAME FROM TRAVELS WITH THE REF. Measured:
     * 1,626 of the 1,787 refs that name a section of the Shulḥan Arukh take it
     * from `VOL_SEC` — a table of OUR editorial readings — and every one of them
     * was stamped `by:'ph-cite'`, the posek's own citation, when half the ref is
     * ours. The inference is right almost everywhere and that is not the point:
     * meldar-locate already separates `inferred` from `ph-cite` on exactly this
     * ground. Only refs whose SHAPE contains a section are labelled — a Mishnah
     * Berurah ref carries none, so calling it inherited would be noise. */
    var usesSec = (w.fmt === 'sec' || w.fmt === 'onSA' || w.loc === 'volSiman');
    var secBy = !usesSec ? '' : (c.sec ? 'cite' : (ctx.secBy || (w.sec ? 'work' : 'fallback')));
    var R = function (ref, conf) { return {ref: ref, resolved: true, conf: conf || 'plain',
      sec: usesSec ? sec : '', secBy: secBy}; };
    var NO = function (why) { return {ref: '', resolved: false, why: why}; };

    /* "ad loc." / "ibid." — inherit the antecedent's siman, and the number
     * given is the se'if katan. Without an antecedent it is unresolvable, and
     * saying so beats inventing one. */
    if (c.form === 'adloc') {
      if (!prev || !prev.siman) return NO('“ad loc.” with nothing before it to attach to');
      var sk = c.loc ? (':' + c.loc) : '';
      if (w.on !== 'render') return {ref: '', resolved: false, partial: prev.siman + sk, conf: avail(w),
        why: unavailWhy(w, prev.siman + sk)};
      /* the same ref shape as a normal citation, section included. The first cut
       * omitted the section here only, so "SAH ad loc. 9" became "Shulchan Arukh
       * HaRav 514:9" while a plain "SAH 347:9" three chapters away came out
       * fully sectioned — one work, two ref shapes, from one missing branch. */
      if (w.loc === 'simanSeif' || w.loc === 'secNum')
        return R(refBase(w, prev.sec || sec) + ' ' + prev.siman + sk, 'adloc');
      return NO('“ad loc.” on a work whose divisions we cannot follow');
    }
    if (c.form === 'bare') {
      /* ⚠️ A BARE TRACTATE NAME IS NOT A CITATION — IT IS A WORD. "Shabbat",
       * "Berakhot" and "Pesachim" are ordinary nouns in this corpus, so a
       * tractate with no folio is the sentence talking, not the posek citing;
       * it produced 14 meaningless "named" rows on two chapters. A bare
       * AUTHORITY (Rashba, Rif) is the opposite — naming him IS the citation.
       * So one drops and the other is kept, and the difference is which of the
       * two a name without a number can honestly be. */
      if (w.kind === 'talmud' || w.kind === 'tanakh' || w.kind === 'mishnah')
        return {ref: '', resolved: false, drop: true, why: 'a work named with no location — the sentence, not a citation'};
      if (w.kind === 'internal') return NO('a Peninei Halakha self-reference');
      /* A bare authority IS the citation, so say BOTH things: that the footnote
       * gave no location, and whether we could show him if it had. "Named
       * without a location" alone was uninformative in the commonest case in the
       * corpus — Rif, Rashba, Rosh, Ramban, Ran are cited by name far more often
       * than by reference. */
      return {ref: '', resolved: false, conf: avail(w),
        why: 'Cited by name with no location. ' + (w.note ||
          (avail(w) === 'absent'
            ? w.t + ' is not in Sefaria\u2019s catalogue in any case \u2014 checked against Sefaria’s full title list.'
            : avail(w) === 'render'
              ? 'We could show a passage of ' + w.t + ' had the footnote given one.'
              : 'We have not established a reference form for ' + w.t + ' either.'))};
    }
    /* trap #1 — a parenthesised location on a bare name. For Rambam the BOOK
     * is missing and Mishneh Torah is divided by book, so this is partial by
     * construction. Never guess the book. */
    if (c.form === 'paren' && c.id === 6) {
      return {ref: '', resolved: false, partial: c.loc,
        why: 'Rambam with a chapter but no book named — the Mishneh Torah is divided by book, and guessing it is how a chain lands on the wrong laws'};
    }
    if (c.id === 0) { /* Tanakh — a proof-text, not an anchor */
      var bk = TANAKH_CANON[c.book] || c.book;
      return R(bk + ' ' + c.loc, 'prooftext');
    }
    /* the Rosh/Rif/Ran on a tractate, in his own chapter:siman. Named, because
     * none of their halakhic works is on Sefaria — but named as HIS, at his own
     * place, which is what the footnote actually said. */
    if (c.form === 'rishonTract') {
      var rw = WORKS[c.attrib] || w, rt = TRACT_CANON[c.tract] || c.tract;
      return {ref: '', resolved: false, partial: rt + ' ' + c.loc, conf: avail(rw),
        why: 'This is the ' + rw.t + ' on ' + rt + ', at his own chapter ' + c.loc +
             ' \u2014 not a Mishnah reference. ' + unavailWhy(rw, rt + ' ' + c.loc)};
    }
    if (c.id === 52) { /* Tosafot — printed on the folio of its tractate */
      var tt = String(c.loc || '').match(/^([A-Za-z\u1e24\u1e25' ]+?)\s*(\d{1,3}[ab])$/);
      if (tt) return R('Tosafot on ' + (TRACT_CANON[tt[1].trim()] || tt[1].trim()) + ' ' + tt[2]);
      return {ref: '', resolved: false, partial: c.loc,
        why: 'Tosafot named without a tractate and folio, which is what its reference needs.'};
    }
    if (c.id === 2) { /* trap #2 — the form decides Talmud vs Mishnah */
      var tr = TRACT_CANON[c.tract] || c.tract;
      /* ⚠️ A FOLIO HAS BOUNDS, AND THEY ARE THE SAME FOR EVERY TRACTATE. The
       * Bavli begins at 2a — there is no 1a or 1b anywhere — and the longest
       * tractate, Bava Batra, ends at 176. Measured, the corpus produced
       * `Berakhot 1b` and `Niddah 183a`: both fetched as failures, but a
       * number that CANNOT be a folio should never become a ref at all, and
       * saying which bound it broke is more use than a 404. */
      if (c.form === 'folio') {
        var fn2 = +String(c.loc).match(/^(\d+)/)[1];
        if (fn2 < 2 || fn2 > 176) return {ref: '', resolved: false, partial: tr + ' ' + c.loc,
          why: 'Read as ' + tr + ' ' + c.loc + ', but the Talmud has no folio ' + fn2 +
            ' \u2014 it begins at 2a and no tractate passes 176. So the number belongs to something else in the sentence, and this is named rather than shown.'};
        /* Mishnah-only tractates have no Gemara, so a folio is always a misread */
        if (MISHNAH_ONLY[tr]) return {ref: '', resolved: false, partial: tr + ' ' + c.loc,
          why: tr + ' has no Babylonian Talmud, so a folio cannot be right here. Named rather than shown.'};
        return R(tr + ' ' + c.loc);
      }
      if (c.form === 'num2' || c.form === 'num3') return R('Mishnah ' + tr + ' ' + c.loc, 'mishnah');
      if (c.form === 'foreignDivision') return {ref: '', resolved: false, partial: tr + ' ' + c.loc,
        why: 'A chapter-and-paragraph division of ' + tr + ', but not the Mishnah\u2019s \u2014 the name immediately before it is a work we do not hold, and this is its own numbering. Named rather than shown as a Mishnah it is not.'};
      return {ref: '', resolved: false, drop: true, why: 'a tractate named with no folio'};
    }
    /* ⚠️ Ben Ish Ḥai. Three ways to fail, and each says which: no year (both
     * cycles are live, so choosing is our guess), a parasha we cannot map onto
     * Sefaria's spelling (the MT_CANON rule), or no paragraph. */
    /* Rav Peʿalim: volume : siman, section from the topic. ⚠️ A volume outside
     * I–IV cannot be built, and saying so beats emitting a ref to nothing. */
    if (w.loc === 'volSiman') {
      var vm = String(c.loc).match(/^(\d{1,2}):(\d{1,3})/);
      var vtpl = w.volTpl || 'Responsa Rav Pealim, Volume {v}, {sec} {n}';
      var vhave = w.volHave || [1, 2, 3, 4];
      if (!vm) return {ref: '', resolved: false, partial: c.loc,
        why: w.t + ' is divided by volume and siman, and this citation gives no volume.'};
      var rom = ROMAN7[+vm[1]];
      if (!rom || vhave.indexOf(+vm[1]) < 0) return {ref: '', resolved: false, partial: c.loc, conf: 'partialWork',
        why: 'Named at volume ' + vm[1] + ' siman ' + vm[2] + '. Sefaria carries ' + w.t + ' in volumes ' +
          vhave.join(', ') + ' \u2014 fetched, not assumed \u2014 so this volume is named rather than shown.'};
      /* \u26a0\u26a0 A VOLUME AND A SECTION ARE NOT INDEPENDENT, and assuming they were
       * would build a confident 404. Measured: Mishpetei Uziel volume II carries
       * Yoreh De'ah and NOT Ora\u1e25 \u1e24ayim (400), volume III the reverse, volume IV
       * only \u1e24oshen Mishpat. `volSec` lists the pairs that were actually fetched;
       * a pair not in it is named with the reason rather than constructed. */
      if (w.volSec && (w.volSec[vm[1]] || []).indexOf(sec) < 0)
        return {ref: '', resolved: false, partial: c.loc, conf: 'partialWork',
          why: 'Named at volume ' + vm[1] + ' siman ' + vm[2] + '. Sefaria\u2019s ' + w.t + ' volume ' + vm[1] +
            ' does not carry ' + (SEC_NAME[sec] || sec) + ' \u2014 checked against the catalogue \u2014 so a reference there would point at nothing.'};
      return R(vtpl.replace('{v}', rom).replace('{sec}', secName(w, sec)).replace('{n}', vm[2]), 'volsiman');
    }
    if (w.loc === 'parashaNum') {
      if (c.form !== 'parashaNum') return {ref: '', resolved: false, partial: c.loc,
        why: 'Ben Ish \u1e24ai runs by parasha within two yearly cycles, and this footnote gives no parasha and paragraph.'};
      var bp = String(c.loc).split(FSEP);
      /* ⚠️ THE DRASHOT ARE NOT THE HALACHOT, and this guard exists because the
       * failure reads perfectly well. Sefaria's Ben Ish Ḥai has four sections —
       * Introduction · Drashot · Halachot 1st Year · Halachot 2nd Year — and a
       * derasha served as a halakhic rung is fluent, plausible and a category
       * error. Every ref this branch builds goes into a Halachot year (below),
       * so the only way a derasha could arrive is by being NAMED as one; when
       * it is, say so and stop rather than silently filing it as halakha. */
      if (/dersh|drash|derash|\u05d3\u05e8\u05e9/i.test(String(bp[0]) + ' ' + String(bp[1]))) {
        return {ref: '', resolved: false, partial: (bp[1] || '') + ' ' + (bp[2] || ''),
          why: 'This names the Ben Ish \u1e24ai\u2019s DRASHOT, which are sermons, not the Halachot. Serving a derasha as a halakhic rung reads perfectly well and would be a category error, so it is named rather than shown.'};
      }
      var yr = BIH_YEAR[String(bp[0] || '').toLowerCase().trim()] || '';
      var par = BIH_PARASHA[String(bp[1] || '').toLowerCase().replace(/[\u2019']/g, "'").trim()];
      if (!par) return {ref: '', resolved: false, partial: (bp[1] || '') + ' ' + (bp[2] || ''),
        why: 'Ben Ish \u1e24ai at \u201c' + (bp[1] || '') + ' ' + (bp[2] || '') + '\u201d \u2014 we cannot map that parasha name onto Sefaria\u2019s spelling, and constructing one produces a reference to nothing.'};
      if (!yr) return {ref: '', resolved: false, partial: par + ' ' + bp[2],
        why: 'Ben Ish \u1e24ai, ' + par + ' ' + bp[2] + ' \u2014 but he wrote halakhot on most parashiyot in BOTH yearly cycles and this footnote does not say which, so naming it beats showing the wrong year.'};
      return R('Ben Ish Hai, Halachot ' + yr + ' Year, ' + par + ' ' + bp[2], 'bih');
    }
    if (w.loc === 'bookChapHal') {
      if (c.form === 'bookChapHal') {
        var sp = String(c.loc).match(/^(.+?)\s+(\d{1,2}:\d{1,3})$/);
        if (!sp) return {ref: '', resolved: false, partial: c.loc, why: 'an unreadable Mishneh Torah location'};
        /* ⚠️ שם IS “IBID”, NOT A BOOK. It arrived as a Mishneh Torah book name and
         * was reported as one we cannot map — which reads as a gap in the table
         * rather than as the anaphora it is. Named, with what it means.
         * ⚠️ AND “כות מקוואות” IS הלכות WITH ITS HEAD EATEN by the Hebrew
         * prefix peel. Strip any leading remnant of הלכות before the lookup;
         * both bugs were invisible because they surfaced as “unmapped book”. */
        var bname = String(sp[1]).replace(/^(?:\u05d4?\u05dc?\u05db\u05d5\u05ea|Hilkhot|Laws of)\s+/, '').trim();
        if (/^(\u05e9\u05dd|ibid\.?)$/i.test(bname)) return {ref: '', resolved: false, partial: c.loc,
          why: 'The Mishneh Torah at ' + sp[2] + ', where the footnote writes \u05e9\u05dd \u2014 “there”, meaning the book named just before it. That antecedent is not recoverable from this citation alone, so it is named rather than guessed at.'};
        var canon = MT_CANON[bname] || MT_CANON[HE_MT_BOOK[bname]] || MT_CANON[sp[1]];
        if (!canon) return {ref: '', resolved: false, partial: c.loc,
          why: 'Mishneh Torah, “' + sp[1] + '” ' + sp[2] + ' — we cannot map that book name onto Sefaria’s, and constructing one is how a chain lands on the wrong laws'};
        return R('Mishneh Torah, ' + canon + ' ' + sp[2]);
      }
      return {ref: '', resolved: false, partial: c.loc,
        why: 'a Mishneh Torah location with no book named'};
    }
    if (w.loc === 'simanSeif' || w.loc === 'secNum') {
      if (!/^\d/.test(c.loc)) return NO('no siman');
      /* ⚠️ F4.6 · THE REMA IS PRINTED INSIDE THE SE'IF, SO SHOW THE SE'IF.
       * Re-probed 2026-08-08: `Rema on Shulchan Arukh, Orach Chayim 345:1` and
       * the Yoreh De'ah form both 404, and `Rema, Orach Chayim 514:3` 404s as
       * F2.0 recorded. Sefaria carries the Mapah INSIDE the Shulḥan Arukh,
       * marked הגה — so 291 citations carrying a full siman and se'if were dead
       * ends pointing at a real passage nobody could open. His numbering IS the
       * SA's, because he glosses that siman.
       * ⚠️⚠️ WHAT IS RENDERED IS THE SHULḤAN ARUKH, NOT THE REMA, and the row
       * says so in words. The citation fact is untouched — `loc` is still his
       * — and only the display resolution is the SA's. A se'if that turns out
       * to carry no הגה is a finding for the reader, not a reason to hide it.
       * ⚠️ Only a siman:se'if qualifies. A bare siman would resolve to the whole
       * siman, which is not the passage he glossed, and this is a feature whose
       * whole value is precision. */
      if (c.id === 17 && c.form === 'num2') {
        var remaBy = c.sec ? 'cite' : (ctx.secBy || 'fallback');
        if (remaBy === 'fallback') return {ref: '', resolved: false, partial: c.loc, conf: 'noSection',
          why: 'The Rema at ' + c.loc + '. The Mapah is printed inside the Shul\u1e25an Arukh rather than published separately, so showing it means building a Shul\u1e25an Arukh reference \u2014 and neither this citation, this chapter nor its volume says which section, so that reference would be pointing at Ora\u1e25 \u1e24ayim because it is the fallback.'};
        return {ref: refBase(WORKS[16], sec) + ' ' + c.loc, resolved: true, conf: 'remaInSA',
          sec: sec, secBy: remaBy,
          why: 'The Rema at ' + c.loc + '. Sefaria has no standalone text of the Mapah \u2014 it is printed INSIDE this se\u2018if of the Shul\u1e25an Arukh, marked \u05d4\u05d2\u05d4 \u2014 so what is shown is the Shul\u1e25an Arukh\u2019s own passage with his gloss inside it, at his numbering. The citation is his; the passage is the Shul\u1e25an Arukh\u2019s.' +
            (remaBy === 'vol' ? ' And the section is our reading of the volume, not his citation.'
             : remaBy === 'chapter' ? ' And the section is our reading of this chapter, not his citation.' : '')};
      }
      if (w.on !== 'render') return {ref: '', resolved: false, partial: c.loc, conf: avail(w),
        why: unavailWhy(w, c.loc)};
      /* ⚠️ F4.9 · A FALLBACK IS NOT A JUDGEMENT. Where neither the citation, nor
       * this chapter, nor the volume says which section, Oraḥ Ḥayim is only the
       * last line of a `||` chain — nobody chose it. Building the ref anyway
       * produces a real, verifying passage about a different law, which is the
       * one failure the section gate exists to refuse (the Shakh-on-YD-339 case).
       * Measured, this fires on the chapters of The Nation and the Land and
       * Likkutim II whose subject the Shulḥan Arukh does not carry. */
      if (usesSec && secBy === 'fallback') return {ref: '', resolved: false, partial: c.loc, conf: 'noSection',
        why: 'Named at ' + c.loc + '. ' + w.t + ' is divided by section of the Shul\u1e25an Arukh; this citation names none, and neither this chapter nor its volume has one set \u2014 so a reference built here would be pointing at Ora\u1e25 \u1e24ayim because that is the fallback, not because anybody read it that way.'};
      if (!coversSec(w, sec)) return {ref: '', resolved: false, partial: c.loc, conf: 'wrongSection',
        why: 'Named at ' + c.loc + '. ' + w.t + ' covers only ' + w.secs.join(' and ') + ', and this topic sits in ' + sec + ' \u2014 so a reference built here would point at nothing.'};
      /* ⚠️ THE TUR IS DIVIDED BY SIMAN ALONE, and he shares this branch with the
       * Arukh HaShulchan, which takes siman:se'if. Measured: `Tur, Orach Chayim
       * 208` ✓ and `208:10` 404s. So the se'if is dropped for him and the row
       * says where it went, rather than building a ref to nothing. */
      if (w.simanOnly) {
        var so = String(c.loc).split(':');
        return R(refBase(w, sec) + ' ' + so[0], so[1] ? 'simanOnly' : 'plain');
      }
      return R(refBase(w, sec) + ' ' + c.loc);
    }
    /* ── F4.13 · VOLUME AND SIMAN, WHICH HAD NO BRANCH AT ALL ──────────────
     * `loc:'volNum'` fell straight through to the generic refusal below, so a
     * work marked `on:'render'` with that shape could never resolve and got the
     * default sentence — “we have not checked whether Sefaria holds it” — which
     * was false about the row's own claim. Measured, that was 187 Igrot Moshe
     * partials and 108 of the Rashba's.
     * ⚠️ PARTIAL COVERAGE IS STATED, NOT ROUNDED EITHER WAY: Sefaria has the
     * Rashba's responsa in parts IV–VII and not I–III, so a citation to volume 2
     * is named WITH that reason rather than either 404ing or being called
     * absent. `volHave` is the list that was fetched. */
    if (w.loc === 'volNum') {
      var vn = String(c.loc).match(/^(\d{1,2}):(\d{1,4})/);
      if (!vn || !w.volRef) return {ref: '', resolved: false, partial: c.loc, conf: avail(w),
        why: unavailWhy(w, c.loc)};
      var vnum = +vn[1], vrom = ROMAN7[vnum];
      if (!vrom) return {ref: '', resolved: false, partial: c.loc, conf: 'partialWork',
        why: 'Named at volume ' + vnum + ' siman ' + vn[2] + '. ' + w.t + ' has no volume ' + vnum + ' we can build a reference to.'};
      if (w.volHave && w.volHave.indexOf(vnum) < 0) return {ref: '', resolved: false, partial: c.loc, conf: 'partialWork',
        why: 'Named at volume ' + vnum + ' siman ' + vn[2] + '. Sefaria carries ' + w.t + ' in volumes ' +
          w.volHave.join(', ') + ' only — fetched, not assumed — so this volume is named rather than shown.'};
      return R(w.volRef.replace('{v}', vrom) + ' ' + vn[2], 'responsa');
    }
    /* everything else — located, in a work we cannot render. The reason is
     * specific per work: see unavailWhy. */
    return {ref: '', resolved: false, partial: c.loc, conf: avail(w),
      why: unavailWhy(w, c.loc)};
  }

  /* ── 5 · PACK ───────────────────────────────────────────────────────────
   * `id·loc·form·fn·sec` × N joined by "|". One string per chapter, split only
   * when that chapter is opened. RAW location only — see the header. */
  var FS = '\u00b7', RS = '|';
  /* an internal separator for compound locations — must be neither FS nor RS */
  var FSEP = '~';
  function pack (cites) {
    return cites.map(function (c) {
      return [c.id, c.loc, c.form, c.fn, c.sec || '', (c.id < 0 ? c.lit : (c.tract || c.book || '')), c.attrib || '', c.cluster || 0].join(FS);
    }).join(RS);
  }
  function unpack (s) {
    if (!s) return [];
    return String(s).split(RS).filter(Boolean).map(function (row) {
      var p = row.split(FS);
      var id = +p[0], w = WORKS[id] || WORKS[0];
      /* ⚠️ A NEGATIVE ID HAS NO WORKS ROW BY DESIGN (-1 an ambiguous acronym,
       * -2 a tractate division belonging to an unnamed work). `WORKS[id] ||
       * WORKS[0]` fell through to Tanakh, so slot 5 unpacked as `book` and the
       * refusal rendered as "?" with nothing to say — a refusal that cannot
       * name itself is no better than a silent drop. */
      if (id < 0) {
        return {id: id, loc: '', form: p[2] || 'ambiguous', fn: +p[3] || 0,
                sec: null, attrib: 0, cluster: +p[7] || 0, tract: p[5] || '', book: ''};
      }
      return {id: id, loc: p[1] || '', form: p[2] || 'bare', fn: +p[3] || 0,
              sec: p[4] || null, attrib: +p[6] || 0, cluster: +p[7] || 0,
              tract: (w.kind === 'talmud' || id === 52) ? (p[5] || '') : '',
              book: w.kind === 'tanakh' ? (p[5] || '') : ''};
    });
  }

  /* ── 6 · EXTRACT ────────────────────────────────────────────────────────
   * Footnote prose → packed row + the honest tallies. A CLUSTER is the group of
   * refs cited inside one parenthesis or semicolon run: a fact about the
   * sentence, and NOT a relation (see the header). */
  /* \u26a0\u26a0 THE ANACHRONISM GATE \u2014 A WORK CANNOT CITE ONE WRITTEN AFTER IT.
   * Found by verifying a claim rather than trusting it: `extract()` emitted 30
   * citations on Shul\u1e25an Arukh O\u1e24 345 \u2014 **Mishnah Berurah \u00d719 and Magen Avraham
   * \u00d711**, every one bare. Karo died in 1575; the Magen Avraham is 1692 and the
   * Mishnah Berurah 1907, so all 30 are impossible on their face. Searching the
   * extracted prose for \u05de\u05f4\u05d1 / \u05de\u05d2\u05f4\u05d0 / the full Hebrew names returns ZERO: the
   * scanner was reading Sefaria's inline commentator anchors for the printed
   * apparatus, surviving the tag strip as prose. Same family as the F2.0 entity
   * bug ("em>Beitza 33b" reaching the scanner).
   * \u26a0\u26a0 AND AN EXACT TEST WOULD BE WRONG. `yr` is ONE number for a work composed
   * over decades, so a strict comparison produces FALSE REFUSALS between
   * contemporaries \u2014 the Kaf Ha-\u1e25ayim (yr 1905) genuinely cites the Mishnah
   * Berurah (yr 1907), and a strict gate would refuse it. The margin is not
   * sloppiness; it is the correct reading of what the field means. 50 years
   * still catches Karo\u2192MA by 127 and Karo\u2192MB by 342.
   * \u26a0\ufe0f A refusal is RECORDED, never silently dropped, so the count is auditable. */
  /* commentators whose own citations point at a Talmud folio, not a siman */
  var TALMUD_COMM = {Rashi: 1, Tosafot: 1, Rashba: 1, Rosh: 1, Ran: 1, Ritva: 1,
    Meiri: 1, Raavad: 1, Ramban: 1, Rif: 1, "Ra'ah": 1};
  var ANACH_MARGIN = 50;
  /* the year of the work whose footnotes are being read \u2014 by source id */
  var SRC_YR = {ph: 2000, hp: 2010, halachipedia: 2010};

  function extract (footnotes, vol, he, citingYr) {
    /* \u26a0\u26a0 THE SCANNER IS CHOSEN FROM THE TEXT, NEVER FROM THE CALLER.
     * Found the expensive way: a probe called `extract(flat, {vol:'Shabbat'})`
     * \u2014 an object where a string belongs, and no language flag \u2014 so the ENGLISH
     * scanner ran over HEBREW text and returned **30 citations that do not
     * exist**, Mishnah Berurah \u00d719 and Magen Avraham \u00d711, read out of Sefaria's
     * inline English commentator anchors surviving the tag strip. It did not
     * error and it did not come back empty: it came back confident, plausible
     * and wholly invented, which is the worst of the three outcomes.
     * \u26a0\ufe0f At corpus scale the language varies per work, so a caller's guess is
     * exactly the wrong authority. Hebrew has its own block; count it and
     * decide from the evidence. A correction is RECORDED, not silent \u2014 if the
     * caller and the text disagree, the caller has a bug worth seeing. */
    var heCh = 0, allCh = 0;
    (footnotes || []).forEach(function (f) {
      var t = String(f); allCh += t.length;
      heCh += (t.match(/[\u0590-\u05FF]/g) || []).length;
    });
    var looksHe = allCh > 0 && (heCh / allCh) > 0.2;
    var langFixed = allCh > 0 && (!!he !== looksHe);
    he = looksHe;
    var vs = secFor(vol, 0);
    var ctx = {sec: vs.sec, secBy: vs.by}, cites = [], internal = [], seen = {};
    var asserts = {}, anach = [];
    /* the chapter's tractates, counted once — the fallback above fires only
     * when there is exactly one and therefore nothing to choose between */
    var _ts = {};
    (footnotes || []).forEach(function (ff) {
      var pp = String(ff);
      for (var hk in HE_TRACT) { if (pp.indexOf(hk) >= 0) _ts[HE_TRACT[hk]] = 1; }
    });
    var _tk = Object.keys(_ts), chapTract = _tk.length === 1 ? _tk[0] : '';
    footnotes.forEach(function (f, fi) {
      var r = (he ? scanHe : scan)(f, ctx), prev = null, cluster = 0, lastAt = -99;
      var sents = sentences(f);
      var sentAt = function (i) {
        for (var k = 0; k < sents.length; k++) if (i >= sents[k][0] && i < sents[k][1]) return sents[k];
        return [0, f.length];
      };
      r.internal.forEach(function (x) { internal.push(x); });
      r.cites.forEach(function (c) {
        if (citingYr) {
          var cw = WORKS[c.id];
          if (cw && cw.yr && cw.yr > citingYr + ANACH_MARGIN) {
            anach.push({work: cw.t, yr: cw.yr, fn: fi + 1, citingYr: citingYr});
            return;
          }
        }
        c.fn = fi + 1;
        /* a new cluster whenever the gap since the last citation contains a
         * sentence end — inside one parenthesis or one "X; Y" run it does not */
        if (c.at - lastAt > 3) {
          var between = f.slice(lastAt, c.at);
          if (/[.!?]\s|\)\s/.test(between)) cluster++;
        }
        lastAt = c.at;
        c.cluster = cluster;
        /* ⚠️ THE ASSERTION IS THE SENTENCE, NOT THE WORDS BEFORE THE REFERENCE.
         * Measured: the text immediately preceding a citation is empty about a
         * third of the time, because the authority is usually the sentence's
         * SUBJECT ("Rashba agrees with Rambam"), not a trailing parenthesis.
         * The containing sentence is what carries the claim the refs support.
         * ⚠️ AND WE STORE THE SPAN, NEVER THE TEXT — offsets into prose(footnote).
         * A span is not a copy, which is what makes the same code path lawful
         * for a source we may quote and one we may not. */
        var ak = (fi + 1) + ':' + cluster;
        if (!asserts[ak]) {
          var sp = sentAt(c.at);
          asserts[ak] = {fn: fi + 1, cluster: cluster, off: sp[0], len: sp[1] - sp[0], n: 0};
        }
        asserts[ak].n++;
        /* ⚠️ AN AMBIGUOUS ACRONYM IS CARRIED, NOT DROPPED. scanHe emits id -1
         * for מ"מ · ר"ח · ר"ש · מהר"ם — tokens that are genuinely two works.
         * It has no WORKS row by design, so it must never reach resolve(). */
        if (c.id < 0) {
          c.ref = ''; c.resolved = false; c.conf = 'ambiguous';
          c.partial = c.lit; c.times = 1;
          var ak2 = fi + '/amb/' + c.id + '/' + c.lit;
          if (seen[ak2]) { seen[ak2].times++; return; }
          seen[ak2] = c; cites.push(c);
          return;
        }
        /* ⚠️⚠️ A COMMENTATOR PLUS A NUMBER IS A FOLIO, NOT A SIMAN — AND READING
         * IT AS A SIMAN IS A WRONG ANSWER WEARING A RIGHT ONE'S CLOTHES.
         * Measured on Be'ur HaGra, SA OḤ 345: he writes כמ"ש תוס' ז' ב' ד"ה
         * והלכה — "as Tosafot wrote, 7b" — and the scanner returned
         * `Tosafot · 7`, silently dropping the amud and presenting a daf as a
         * siman. Likewise ק"א א' (101a), נ"ט ב' (59b), צ"ח ב' (98b).
         * ⚠️ THE AMUD IS THE TELL: א׳ or ב׳ immediately after the number, which
         * a siman never carries. Where it is present this is a folio, and the
         * row says so instead of naming a siman that does not exist.
         * ⚠️⚠️ THE TRACTATE IS THE ANAPHORA, AND IT IS OFTEN ABSENT — he writes
         * עתוס' דשבת ו' ב' when he names it and שם נ"ט ב' when he does not,
         * because the reader has the sugya open. Without a tractate no ref can
         * be built, so it is NAMED with what we do know. Guessing the tractate
         * from the host siman would be exactly the F1.8 error that printed
         * "Prayer and the Priestly Blessing 8:2" as the Rambam on carrying. */
        if (TALMUD_COMM[(WORKS[c.id] || {}).t] && /^\d{1,3}$/.test(String(c.loc || ''))) {
          var tail = String(f).slice(c.at, c.at + 46);
          var am = tail.match(/[\u05d0-\u05ea]["\u05f4\u2019']?[\u05d0-\u05ea]*['\u05f3\u2019]?\s*([\u05d0\u05d1])['\u05f3\u2019]/);
          /* ⚠️⚠️ AND A DAF HAS AN UPPER BOUND, WHICH CAUGHT THIS FIX'S OWN FIRST
           * ERROR. The recogniser above turned ש"מ (340) into "Tosafot 340a" —
           * and no tractate has 340 folios; Bava Batra is the longest at 176.
           * So 340 is a siman the amud test matched by accident. The bound is
           * free, it is a fact about the literature rather than a heuristic,
           * and it is the same shape as the anachronism gate: a cheap
           * impossibility test that no amount of parser cleverness replaces. */
          if (am && +c.loc >= 2 && +c.loc <= 176) {
            c.folio = String(c.loc) + (am[1] === '\u05d0' ? 'a' : 'b');
            c.form = 'folioHe';
            c.loc = c.folio;
            /* ⚠⚠ THE TRACTATE IS THE ANAPHORA, AND IT IS RECOVERED FROM THE
             * COMMENT, NEVER FROM THE HOST. He writes עתוס' דשבת ו' ב' when he
             * names it and שם נ"ט ב' when he does not, because his reader has
             * the sugya open. The antecedent is therefore the nearest tractate
             * named EARLIER IN THE SAME COMMENT — the same idea as prev, one
             * level up — and it is read off HE_TRACT rather than a hand list,
             * which is the rule relearned when a typed volume list indexed 175
             * chapters and reported it as the whole of Peninei Halakha.
             * ⚠️ TAKING IT FROM THE HOST SIMAN WOULD BE THE F1.8 ERROR: SA OḤ
             * 345 names no tractate, and inventing one is how a chain once
             * printed 'Prayer and the Priestly Blessing 8:2' as the Rambam on
             * carrying. Where none has been named the row stays named, saying
             * the folio is his and the tractate is not recoverable. */
            var before = String(f).slice(0, c.at), tname = '', tat = -1;
            for (var ht in HE_TRACT) {
              var hp = before.lastIndexOf(ht);
              if (hp > tat) { tat = hp; tname = HE_TRACT[ht]; }
            }
            /* ⚠⚠ CARRYING THE TRACTATE ACROSS COMMENTS IS REFUSED IN GENERAL AND
             * ALLOWED IN ONE MEASURED CASE. F4.22 found the antecedent is often
             * not in the same comment, and the obvious widening — take the last
             * tractate named anywhere earlier — was tested before it was built.
             * Measured across six chapters of Be'ur HaGra: siman 308 names FIVE
             * distinct tractates over 96 segments, 345 names three (Eruvin ×11,
             * Shabbat ×4, Sukkah ×1), and 82 of 96 segments name NONE. So the
             * nearest earlier tractate is a choice among several, and choosing
             * wrong yields a real, fetchable, VERIFYING passage under the wrong
             * name — the F2.4 failure that no existence test can catch.
             * ✅ THE SAFE CASE IS A CHAPTER THAT NAMES EXACTLY ONE. Then there is
             * nothing to choose between: siman 340 names only Eruvin. The fall-
             * back fires only there, and the row records that the tractate came
             * from the chapter rather than from the citation. */
            if (!tname && chapTract) { tname = chapTract; }
            if (tname) {
              c.tract = tname;
              /* ⚠️ ONLY WHERE THE REF SHAPE WAS ALREADY FETCHED. F2.7 and F2.8
               * verified 'Rashi on Beitzah 33a' and 'Tosafot on Beitzah 22a';
               * the Rif and the Rosh divide differently and are NOT built here
               * on the strength of a pattern that merely looks similar. */
              var ct = (WORKS[c.id] || {}).t;
              if (ct === 'Rashi' || ct === 'Tosafot') {
                c.commRef = ct + ' on ' + tname + ' ' + c.folio;
                c.form = 'folioComm';
              }
            }
          }
        }
        var res = resolve(c, ctx, prev);
        c.ref = res.ref; c.resolved = res.resolved; c.why = res.why || '';
        c.partial = res.partial || ''; c.conf = res.conf || '';
        /* remember a resolved siman so the next "ad loc." can attach */
        var sm = String(c.loc).match(/^(\d{1,4})(?::|$)/);
        if (sm && (WORKS[c.id].loc === 'simanSeif' || WORKS[c.id].loc === 'secNum')) {
          prev = {siman: sm[1], sec: c.sec || WORKS[c.id].sec || ctx.sec};
        }
        if (res.drop) return;      /* never stored, so it never costs a row */
        /* ⚠️⚠️ THE DEDUPE KEY MUST BE SCOPED TO THE FOOTNOTE, AND WAS NOT.
         * `seen` is declared once per chapter and the key was `id/loc`, so a
         * source cited in notes 2, 7 and 14 produced ONE row — filed against
         * note 2 — and notes 7 and 14 got nothing. On a page whose whole premise
         * is that THE CLAIM IS THE UNIT, that renders a posek's sentence with no
         * sources attached and no indication any were dropped. Measured on the
         * full corpus: the gap scan's top "missing" works were SSK (145), Kaf
         * Ha-ḥayim (144), Rema (122) and the Mishnah Berurah (113) — which are
         * not missing from the dictionary at all; they are simply the works
         * cited most often, and therefore the ones most likely to recur in a
         * later footnote and be swallowed. A dedupe that hides its commonest
         * inputs looks exactly like a dictionary gap.
         *
         * Within ONE footnote the collapse is still right — that is what `times`
         * counts — because a note citing SA 629:6 twice makes one reference. */
        var key = fi + '/' + c.id + '/' + c.loc;
        if (seen[key]) { seen[key].times++; return; }   /* dedupe, keep a count */
        c.times = 1; seen[key] = c; cites.push(c);
      });
    });
    return {cites: cites, internal: internal, anach: anach, he: he, langFixed: langFixed, sec: ctx.sec,
            asserts: Object.keys(asserts).map(function (k) { return asserts[k]; })};
  }

  /* Assertions pack as their own string: fn·cluster·off·len·refCount */
  function packA (as) {
    return as.map(function (a) { return [a.fn, a.cluster, a.off, a.len, a.n].join(FS); }).join(RS);
  }
  function unpackA (s) {
    if (!s) return [];
    return String(s).split(RS).filter(Boolean).map(function (row) {
      var q = row.split(FS);
      return {fn: +q[0], cluster: +q[1], off: +q[2], len: +q[3], n: +q[4] || 0};
    });
  }

  /* ── 6b · A VERSION HAS ITS OWN LICENCE, AND WE HAD BEEN IGNORING IT ──────
   * Every rung so far took `versions[0]` — whatever Sefaria served — and printed
   * it. But a single ref carries many versions with very different terms.
   * Measured on tractate Shabbat, 2026-08-07:
   *
   *   William Davidson Edition (Aramaic + English)  CC-BY-NC   ← Sefaria's default
   *   Wikisource Talmud Bavli (Hebrew)              CC-BY-SA
   *   Sefaria Community Translation (English)       CC0
   *   Rodkinson Talmud (English)                    Public Domain
   *   seven further versions                        "unknown"
   *
   * ⚠️ THE DEFAULT TALMUD TEXT IS STEINSALTZ, AND IT IS NON-COMMERCIAL. The
   *    William Davidson Edition IS Rav Adin Steinsaltz's translation, given by
   *    the Steinsaltz Center and Koren under CC-BY-NC. So we already have it and
   *    always did — but NC binds. If this platform ever charges, that text may
   *    not travel with it, and the fallbacks above are the licence-clean route
   *    (CC0 / Public Domain for English, CC-BY-SA for Hebrew).
   * ⚠️ AND "unknown" IS NOT "FREE". Seven of thirteen versions state no licence.
   *    Printing one because it happened to be first is the same error as reading
   *    a work's own section instead of the topic's: silent, and plausible. */
  var LIC_RANK = {'cc0': 1, 'public domain': 2, 'cc-by': 3, 'cc-by-sa': 4, 'cc-by-nc': 5,
                  'cc-by-nc-sa': 6, 'unknown': 9, '': 9};
  function licRank (l) { return LIC_RANK[String(l || '').toLowerCase().trim()] || 8; }
  /* ⚠️⚠️ RANKING BY LICENCE ALONE IS THE WRONG TRADE, and the first cut made it.
   * Sorting tractate Shabbat's English versions by licence put the CC0 "Sefaria
   * Community Translation" ahead of the "William Davidson Edition" — that is,
   * ahead of STEINSALTZ. Licence-optimal and much the worse text, on a platform
   * whose purpose is learning, and nobody asked for that downgrade.
   *
   * So licence is a CONSTRAINT, not a preference:
   *   mode 'study'      (default) — keep Sefaria's own order, which puts its
   *                     best edition first, and REPORT the licence honestly.
   *   mode 'commercial' — now licence decides, and NC or unstated is REFUSED
   *                     rather than shown, because that is what NC means.
   * The alternative is always named, so the choice is visible either way. */
  function pickVersion (versions, lang, mode) {
    var cands = (versions || []).filter(function (v) {
      return String(v.language || '') === lang;
    });
    if (!cands.length) return null;
    var byLic = cands.slice().sort(function (x, y) { return licRank(x.license) - licRank(y.license); });
    var best = (mode === 'commercial') ? byLic[0] : cands[0];
    var clean = byLic[0];
    if (mode === 'commercial' && licRank(best.license) >= 5) {
      return {none: true, why: 'Every version of this passage in ' + lang +
        ' is non-commercial or states no licence, so for commercial use it is named rather than shown.'};
    }
    var nc = /nc/i.test(String(best.license || ''));
    var unstated = !best.license || /unknown/i.test(String(best.license));
    return {v: best, licence: best.license || 'unknown', title: best.versionTitle || '',
            nc: nc, unstated: unstated, alternatives: cands.length - 1,
            /* what a commercial build would have to fall back to */
            cleanest: (nc || unstated) && clean !== best
              ? {title: clean.versionTitle || '', licence: clean.license || 'unknown'} : null};
  }

  /* ⚠️ `cleanest` CANNOT BE COMPUTED FROM A SEGMENT FETCH, and that made the
   * feature unreachable in the first cut. `?version=primary&version=translation`
   * returns ONE version per language — on Shabbat 2a both are the William
   * Davidson Edition — so `alternatives` is 0 and no fallback can be found,
   * while the rung correctly reports NC. The alternatives live in the BOOK's
   * version list, which is a different call. Third time this session that a
   * documented feature could not fire (after the `secs` gate and `cluster`);
   * the rule is the same — if a doc claims it, a caller must be able to reach it. */
  function cleanestOf (versions, lang, shownLicence) {
    var cands = (versions || []).filter(function (v) { return String(v.language || '') === lang; });
    if (!cands.length) return null;
    var best = cands.slice().sort(function (x, y) { return licRank(x.license) - licRank(y.license); })[0];
    if (licRank(best.license) >= licRank(shownLicence)) return null;
    return {title: best.versionTitle || '', licence: best.license || 'unknown'};
  }

  /* ── 7 · CACHE + THE E2 CONTRACT ────────────────────────────────────────
   * `forChapter` is SYNCHRONOUS and reads the cache. `hydrate` fills it. A miss
   * says read:false. It does not guess and it does not block. */
  /* ⚠️ BUMP ON EVERY ROW-SHAPE CHANGE, and the reason is not tidiness: a stale
   * row unpacks WITHOUT the new field and is silently wrong rather than absent.
   *   v2 — gained `attrib` (v1 rows kept the Rosh-as-Mishnah misreading)
   *   v3 — gained `cluster` (v2 rows would report every ref as cluster 0, i.e.
   *        as though the whole chapter were cited in one breath)
   *   v4 — gained `a`, the assertion spans. A v3 chapter reads as having no
   *        assertions, which is indistinguishable from a chapter that makes
   *        none — absent and silently wrong look identical to a caller. */
  /* v8: footnotesOf no longer truncates at the first nested <i>, so a footnote's
   * TEXT — and therefore every claim span's offset into it — means something
   * different from v7. A stale row would unpack without complaint and point its
   * spans at the wrong words, which is the silent-wrongness this key exists to
   * prevent. Same rule as v6, when the sentence splitter changed. */
  /* v9: the dedupe key is scoped to the footnote, so a chapter now yields a row
   * for every footnote that cites a source instead of only the first. Row COUNT
   * and row→footnote mapping both change; a v8 row would under-report and look
   * complete. */
  /* v10: the work dictionary gained the hyphenated Kaf Ha-ḥayim spelling and
   * four contemporary responsa, so a chapter cached at v9 is missing citations
   * it would now yield — under-complete, not wrong, which is the harder kind to
   * notice. */
  /* ⚠️⚠️ v15 (2026-08-09) — THE HEBREW LOCATION READER CHANGED WHAT A ROW MEANS,
   * SO THE ROWS MUST GO. v14 rows were extracted while `heLoc` read a following
   * word or acronym head as a numeral: `שו"ע שם` cached as Shulchan Arukh **340**,
   * `שו"ע לא` as **31**, `שו"ע ורמב"ם` as **242**. Those are not missing fields
   * that a stale row simply lacks — they are WRONG LOCATIONS on real works, and
   * every one of them fetches clean, so nothing downstream can detect them. This
   * is the case the bump rule exists for, and it is the opposite of the
   * `Orach Chaim` fix earlier the same day, where the cached rows were measured
   * to be short of a marker and not wrong about one, and the key correctly stood.
   * ⚠️ 121 Hebrew chapters re-hydrate on next open; the English half is unchanged
   * but shares the key, so it re-hydrates too. That cost is the point of paying
   * it once rather than carrying a plausible wrong siman indefinitely. */
  /* ⚠️ v16 (2026-08-09, same session) — TWO MORE EXTRACT-TIME CHANGES, AND THE
   * BUMP IS ALMOST FREE BECAUSE v15 HELD ONLY 2 CHAPTERS WHEN IT WAS MEASURED.
   * The row stores a RAW location rather than a resolved ref, which is what
   * makes a `resolve()` fix cost nothing — but both of these land EARLIER than
   * that: `HE_MT_BOOK` is consulted in `heLoc`, so a Hilkhot Ma'aser citation
   * was packed as the string "Terumot 1:4", and `שם` was packed as the number
   * it was misread into. Baked into the row, not derived from it. Bump.
   * ⚠️ THE LESSON IS THE BOUNDARY, NOT THE VERSION: ask whether the change is
   * before or after the pack, not whether it "feels big". */
  var CK = 'meldar.cite.v16', mem = null;

  /* ── THE TEXT STORE IS A SEPARATE KEY, AND THAT IS THE WHOLE POINT ────────
   * `meldar.cite.v4` holds POINTERS — facts about who cited what, ours to keep
   * for ever. `meldar.src.text` holds a source's actual PROSE, and only for a
   * source whose licence permits a copy. Two stores because they have two
   * different rights positions; one store would have forced the stricter rule
   * on both, or — far worse — the looser one on both. */
  var TK = 'meldar.src.text';
  function mayCache (srcId) {
    var S = window.MELDAR_SOURCES;
    if (!S) return {ok: srcId === 'ph', code: 'no-registry'};   /* registry absent: only our known-open source */
    var r = S.may(srcId, 'cache');
    return {ok: !!r.ok, code: r.code || '', why: r.why || ''};
  }
  function texts () {
    try { return JSON.parse(localStorage.getItem(TK) || '{}') || {}; } catch (e) { return {}; }
  }
  /* ⚠️⚠️ A REFUSAL AND A MISSING ROW ARE NOT THE SAME REFUSAL, AND THIS SAID THEY
   * WERE. Measured 2026-08-09: `putText('hy', …)` and `putText('nope', …)`
   * returned the IDENTICAL sentence — “their text is never stored” — though the
   * first is Halacha Yomit's actual licence position and the second means we
   * have no rights row at all. That sentence is a claim about somebody's terms,
   * and printing it over a source we have simply not catalogued is a false
   * statement about their licence. It has happened once already, to
   * Halachipedia, whose CC-BY-SA expressly permits the copy the page said was
   * forbidden. The registry now returns `no-such-source`; this reports it AS a
   * gap of ours — the three-state rule, at the boundary where it was lost. */
  function putText (srcId, key, arr) {
    var m = mayCache(srcId);
    if (!m.ok) return {stored: false, code: m.code,
      why: m.code === 'no-such-source'
        ? 'We have no rights row for \u201c' + srcId + '\u201d, so its text is not stored. ⚠️ That is OUR gap, not a statement about their licence \u2014 unknown is not refusal.'
        : m.code === 'no-registry'
          ? 'The rights registry is not loaded, so nothing but our known-open source may be stored.'
          : 'This source\u2019s text is never stored \u2014 only fetched and shown.'};
    var all = texts(); all[srcId + '|' + key] = arr;
    /* ⚠️⚠️ NO BUDGET, AND AN EMPTY CATCH — SO THE STORE WOULD SILENTLY STOP PERSISTING. Measured
       file-wide: localStorage is 7,596,488 chars, of which THIS key holds 3,469,599. Chromium's ~123 GB
       quota hides it; Safari and Firefox cap at 5–10 MB, where setItem throws QuotaExceededError — and
       `catch (e) {}` meant the app would keep appearing to cache while writing nothing, for ever, with
       no signal. A silent write failure is the worst kind of failure in a store whose whole job is to
       remember.
       ⚠️ AND THIS IS THE LICENCE-SENSITIVE STORE, so it is the right one to bound: it holds a source's
       PROSE, kept only where a licence permits a copy. Unbounded growth of copied text is a rights
       exposure as well as a storage one. 2 MB budget, oldest keys evicted first, and a real report on
       failure so a caller can tell "stored" from "we tried". */
    var BUDGET = 2 * 1024 * 1024;
    var body = JSON.stringify(all);
    if (body.length > BUDGET) {
      var ks = Object.keys(all);
      /* Oldest-first: insertion order is the only age signal here, and it is the honest one. */
      while (ks.length > 1 && body.length > BUDGET) {
        var drop = ks.shift();
        if (drop === srcId + '|' + key) continue;
        delete all[drop];
        body = JSON.stringify(all);
      }
    }
    try { localStorage.setItem(TK, body); }
    catch (e) {
      var why = (e && (e.name || e.message)) || 'unknown';
      try { console.warn('[meldar] source-text store refused a write (' + why + ') — evicting and retrying'); } catch (e2) {}
      /* One retry with only this entry: better to keep the passage in hand than to lose the write. */
      var only = {}; only[srcId + '|' + key] = arr;
      try { localStorage.setItem(TK, JSON.stringify(only)); }
      catch (e3) { return {stored: false, code: 'quota', why: 'This device refused the write (' + why + '), so the text was fetched and shown but not kept.'}; }
    }
    return {stored: true};
  }
  function getText (srcId, key) { return texts()[srcId + '|' + key] || null; }
  /* ⚠️⚠️ BUMPING WITHOUT EVICTING IS HALF A DISCIPLINE, AND THE MISSING HALF
   * FILLS THE QUOTA. Measured 2026-08-08 after four bumps in one session:
   * `meldar.cite.*` held 2.24 MB across TWELVE keys, of which 1.73 MB was
   * abandoned versions (v8–v11, ~450 KB each) that nothing would ever read
   * again. A superseded key is not a fallback — it is deliberately unreadable,
   * which is the whole point of the bump — so it is pure dead weight.
   *
   * ⚠️⚠️ AND `persist()` SWALLOWED THE QUOTA ERROR, which turns a full cache
   *    into the exact failure just fixed in `hydrate`: setItem throws, the
   *    catch discards it, `mem` keeps the SESSION looking correct, and after a
   *    reload every chapter reports unparsed. The Chain page would silently
   *    re-fetch the corpus every session and the audit's "parsed on this
   *    device" would quietly regress — a swallowed error degrading into
   *    measuring nothing. It is now recorded and readable, so a caller can say
   *    on the page that results are not being saved. */
  function evictOldVersions () {
    var cur = 0, m = /^meldar\.cite\.v(\d+)$/.exec(CK);
    if (m) cur = +m[1];
    if (!cur) return 0;
    var kill = [], i, k, mm;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        mm = k && /^meldar\.cite\.v(\d+)$/.exec(k);
        if (mm && +mm[1] < cur) kill.push(k);
      }
      kill.forEach(function (x) { localStorage.removeItem(x); });
    } catch (e) {}
    return kill.length;
  }

  var cacheFull = false;
  function store () {
    if (mem) return mem;
    evictOldVersions();
    try {
      var j = JSON.parse(localStorage.getItem(CK) || 'null');
      mem = (j && j.v === 12 && j.ch) ? j : {v: 12, ts: Date.now(), ch: {}};
    } catch (e) { mem = {v: 12, ts: Date.now(), ch: {}}; }
    return mem;
  }
  function persist () {
    try { localStorage.setItem(CK, JSON.stringify(store())); cacheFull = false; }
    catch (e) {
      /* one retry after evicting, in case an older version was written since */
      if (evictOldVersions()) {
        try { localStorage.setItem(CK, JSON.stringify(store())); cacheFull = false; return; }
        catch (e2) {}
      }
      cacheFull = true;
    }
  }
  function chapterKey (vol, n) { return vol + ':' + n; }

  /* THE off-by-one guard. The number is in the title; position 0 is an
   * unnumbered Introduction. Nothing may read position as the number.
   * ⚠️⚠️ AND THERE ARE TWO TITLE SHAPES, WHICH COST 18 CHAPTERS (found
   * 2026-08-08). Sefaria's PH nodes are mostly `"5  Mav'ir, Mekhabeh, and
   * Electricity"` — leading integer, two spaces — but Kashrut switches at
   * chapter 20 to `"Chapter 20 : Terefot"`. A parser that knew only the first
   * shape dropped every one of them SILENTLY: the whole back half of kashrut
   * (milk and meat, terefot, immersion of vessels, kashering, wine and bread
   * of gentiles) was absent from the index, so "waiting between milk and meat"
   * could only ever return "Eating Meat". Measured: 258 chapters → 276.
   * The fix went half way once already — it stopped reading array position and
   * learned one shape. Learn the shapes from the data, not from one volume. */
  function chapterNum (title) {
    var s = String(title || '');
    var m = s.match(/^\s*(\d{1,3})\s\s*/);
    if (m) return +m[1];
    m = s.match(/^\s*Chapter\s+(\d{1,3})\s*[:.]/i);
    return m ? +m[1] : 0;
  }
  function chapterLabel (title) {
    return String(title || '')
      .replace(/^\s*\d{1,3}\s\s*/, '')
      .replace(/^\s*Chapter\s+\d{1,3}\s*[:.]\s*/i, '')
      .trim();
  }
  function chapterRef (vol, n) { return 'Peninei Halakhah, ' + vol + ' ' + n; }

  function forChapter (vol, n) {
    var key = chapterKey(vol, n), row = store().ch[key];
    if (!row) return {read: false, key: key, cites: [], note: 'This chapter has not been read yet.'};
    var raw = unpack(row.p), vs = secFor(vol, n), ctx = {sec: vs.sec, secBy: vs.by}, prev = null;
    var cites = raw.map(function (c) {
      /* ⚠️ AN AMBIGUOUS ACRONYM HAS NO WORKS ROW ON PURPOSE — it is two works,
       * and inventing an id for it would be exactly the guess this refuses. */
      if (c.id < 0) {
        var ambWhy = c.id === -2
          ? 'A chapter-and-paragraph division of tractate ' + (c.tract || '').replace(/\s+\d.*$/, '') +
            ', but not the Mishnah’s — in this corpus that form belongs to a Rishon’s own work on the tractate (the Rosh, the Rif, the Yam Shel Shlomo, Hagahot Maimoniyot). The footnote does not name him in a form we can resolve, so it is named rather than shown as a Mishnah it is not.'
          : (HE_AMBIG[c.tract] || 'This acronym names more than one work.');
        return {id: c.id, work: c.tract || '?', kind: 'ambiguous', yr: 9999, on: 'name',
                fn: c.fn, cluster: c.cluster, loc: '', form: c.form || 'ambiguous', ref: '',
                resolved: false, partial: c.tract || '', conf: 'ambiguous',
                why: ambWhy, by: 'ph-cite'};
      }
      var res = resolve(c, ctx, prev);
      var sm = String(c.loc).match(/^(\d{1,4})(?::|$)/);
      if (sm && (WORKS[c.id].loc === 'simanSeif' || WORKS[c.id].loc === 'secNum')) {
        prev = {siman: sm[1], sec: c.sec || WORKS[c.id].sec || ctx.sec};
      }
      var w = WORKS[c.id];
      /* F4.2 · the section, and who supplied it, on every row that has one. */
      var secWhy = '';
      if (res.secBy === 'vol') secWhy = 'The siman is his; the section is our reading of the volume \u2014 Peninei Halakha ' + vol + ' is treated as ' + (SEC_NAME[res.sec] || res.sec) + '.';
      else if (res.secBy === 'chapter') secWhy = 'The siman is his; the section is our reading of this chapter \u2014 read as ' + (SEC_NAME[res.sec] || res.sec) + '.';
      else if (res.secBy === 'work') secWhy = 'The section comes from the work itself, not from the footnote \u2014 ' + w.t + ' is only printed on ' + (SEC_NAME[res.sec] || res.sec) + '.';
      /* \u26a0\ufe0f\u26a0\ufe0f AU4 \u00b7 AND THE ONE CASE THAT IS *HIS* HAD NOTHING TO SAY, WHICH MADE IT THE ONLY
       * PROVENANCE A READER COULD NOT SEE (2026-08-20). `cite` was left silent on the argument
       * that a section the footnote states needs no note \u2014 true when it AGREES with the volume
       * default, and wrong in the case that matters: measured across six chapters, all 4 `cite`
       * rows carry a section that DIFFERS from their volume's, e.g. PH Shabbat 22 citing
       * `Shulchan Arukh, Yoreh De\u2019ah 120:16` inside an Ora\u1e25 \u1e24ayim volume. That is the strongest
       * row on the page \u2014 his own cross-section reference, overriding our default \u2014 and it read
       * exactly like a row we had inferred.
       * \u26a0\ufe0f Only where it DIFFERS. Restating the volume's own section on every agreeing row would
       * bury the rows that really are ours, which is what the silence was protecting against. */
      else if (res.secBy === 'cite' && res.sec) {
        var vsec = (secFor(vol, n) || {}).sec;
        if (vsec && vsec !== res.sec) secWhy = 'The section is HIS reference, not our inference \u2014 the footnote names ' + (SEC_NAME[res.sec] || res.sec) + ' itself, where this volume otherwise reads as ' + (SEC_NAME[vsec] || vsec) + '.';
      }
      return {id: c.id, work: workName(c), kind: w.kind, yr: w.yr, on: w.on, fn: c.fn, cluster: c.cluster,
              loc: c.loc, form: c.form, ref: res.ref, resolved: res.resolved,
              partial: res.partial || '', why: res.why || '', conf: res.conf || '',
              sec: res.sec || c.sec || '', secBy: res.secBy || (c.sec ? 'cite' : ''), secWhy: secWhy,
              by: 'ph-cite'};
    });
    return {read: true, key: key, ts: row.ts, footnotes: row.f || 0, lang: row.l || 'en',
            cites: cites, internal: row.i || [], sec: ctx.sec, secBy: ctx.secBy};
  }

  /* Ordered rungs for the chain: resolvable, classical, chronological.
   * Proof-texts and PH self-references are NOT anchors and are excluded here;
   * name-only works are returned separately so they can be NAMED, not dropped. */
  /* ── VERIFICATION ───────────────────────────────────────────────────────
   * A ref is not verified until it has been fetched. This fetches every rung
   * once, caches the verdict beside the chapter, and lets `anchors()` demote a
   * ref that does not resolve to NAMED instead of rendering it.
   *
   * ⚠️ THE TEST BOUNDS THE LENGTH. `Magen Avraham, Orach Chayim 514:10` came
   *    back with 1.6 MB of text — the whole work, because the section made the
   *    ref name the book. Non-empty would have passed it.
   * ⚠️ A FAILURE HERE INDICTS THE READING, NOT SEFARIA. `Mishnah Shabbat 3:7`
   *    failed because that chapter has six mishnayot. Read properly, the
   *    footnote says "Rosh (Shabbat 3:7)" — the ROSH's own chapter 3 siman 7 on
   *    tractate Shabbat, not a Mishnah at all. It was caught only because the
   *    numbers happened to be out of range; in range it would have VERIFIED
   *    CLEAN while naming the wrong work. That is the single most useful thing
   *    this pass does, and also its limit: the fetch tests that a ref exists,
   *    never that it is the ref the footnote meant. */
  async function verify (vol, n, fetchJson) {
    fetchJson = fetchJson || defaultFetch;
    var key = chapterKey(vol, n), row = store().ch[key];
    if (!row) return {read: false, note: 'This chapter has not been read yet.'};
    var r = forChapter(vol, n), v = row.v || {};
    var todo = [];
    r.cites.forEach(function (c) {
      if (c.resolved && c.ref && !(c.ref in v) && todo.indexOf(c.ref) < 0) todo.push(c.ref);
    });
    for (var i = 0; i < todo.length; i += 6) {
      var batch = todo.slice(i, i + 6);
      /* eslint-disable no-await-in-loop */
      var got = await Promise.all(batch.map(async function (ref) {
        var j = await fetchJson('https://www.sefaria.org/api/v3/texts/' +
          encodeURIComponent(ref.replace(/\s+/g, '_')) + '?version=primary&return_format=text_only');
        var ver = j && (j.versions || [])[0];
        var t = ver ? (Array.isArray(ver.text) ? ver.text.flat(Infinity).join(' ') : String(ver.text || '')) : '';
        var len = t.trim().length;
        /* ⚠️ THE ECHOED REF IS THE REAL TEST; length is only a backstop. Measured:
         * `Responsa Rav Pealim, Volume II, Orach Chayim 1` returns 21,937 chars
         * and is a single legitimate teshuva — a 20k cap called it a whole-work
         * failure. Meanwhile the Magen Avraham whole-work case echoed a DIFFERENT
         * ref from the one asked for, which is what actually distinguishes them.
         * ⚠️⚠️ BUT COMPARE THE LOCATION, NOT THE WHOLE STRING (fixed 2026-08-08).
         * Sefaria canonicalises titles on the way back: `Kaf HaChaim 178:14`
         * echoes as `Kaf HaChayim on Shulchan Arukh, Orach Chayim 178:14`,
         * `Beur Halakha 40` as `Biur Halacha 40`, `Ovadia of Bartenura on …` as
         * `Bartenura on …`. All three are CORRECT refs that fetch real passages,
         * and a whole-string comparison demoted every one of them to "named" —
         * a silent false negative wherever a work has an alias. What actually
         * separates the whole-work failure is that its echo has NO LOCATION at
         * all (`Magen Avraham`, `Biur Halacha`), so that is what is tested. */
        var echo = String((j && j.ref) || '').replace(/\s+/g, ' ').trim();
        var want = ref.replace(/\s+/g, ' ').trim();
        var tailOf = function (x) { var mm = x.match(/(\d+[ab]?(?::\d+)*)\s*$/); return mm ? mm[1] : ''; };
        var wl = tailOf(want), el = tailOf(echo);
        var sameRef = !echo || echo === want || (wl && wl === el);
        return {ref: ref, ok: len > 0 && len < 200000 && sameRef};
      }));
      got.forEach(function (g) { v[g.ref] = g.ok ? 1 : 0; });
    }
    row.v = v; persist();
    var ok = 0, bad = 0;
    Object.keys(v).forEach(function (k) { if (v[k]) ok++; else bad++; });
    return {read: true, verified: ok, failed: bad,
            failing: Object.keys(v).filter(function (k) { return !v[k]; })};
  }

  function anchors (vol, n) {
    var r = forChapter(vol, n);
    if (!r.read) return {read: false, rungs: [], named: [], note: r.note};
    var verdicts = (store().ch[chapterKey(vol, n)] || {}).v || null;
    var rungs = [], named = [];
    r.cites.forEach(function (c) {
      if (c.kind === 'internal' || c.kind === 'tanakh') return;
      /* a fetched-and-failed ref is DEMOTED, never rendered and never dropped */
      if (verdicts && c.ref && verdicts[c.ref] === 0) {
        named.push(Object.assign({}, c, {resolved: false, verified: false,
          why: 'we built this reference from the footnote and Sefaria does not hold it — so the reading is wrong somewhere, and it is named rather than shown'}));
        return;
      }
      if (c.resolved && c.ref) {
        rungs.push(Object.assign({}, c, {
          verified: verdicts ? verdicts[c.ref] === 1 : null
        }));
      } else named.push(c);
    });
    rungs.sort(function (a, b) { return a.yr - b.yr || a.fn - b.fn; });
    named.sort(function (a, b) { return a.yr - b.yr; });
    return {read: true, rungs: rungs, named: named,
            prooftexts: r.cites.filter(function (c) { return c.kind === 'tanakh'; }),
            internal: r.internal, footnotes: r.footnotes};
  }

  function put (vol, n, footnotes, srcId, he) {
    var ex = extract(footnotes, vol, he, SRC_YR[srcId] || 0), key = chapterKey(vol, n);
    store().ch[key] = {
      p: pack(ex.cites), a: packA(ex.asserts), f: footnotes.length,
      i: ex.internal, l: he ? 'he' : 'en', ts: Date.now()
    };
    persist();
    putText(srcId || 'ph', key, footnotes);
    return forChapter(vol, n);
  }

  /* The assertions for a chapter, each with the refs that support it. `text` is
   * filled ONLY where the source's prose may be held; otherwise it is null and
   * `needsFetch` says so, rather than a blank pretending to be an empty claim. */
  function assertions (vol, n, srcId) {
    var key = chapterKey(vol, n), row = store().ch[key];
    if (!row) return {read: false, rows: [], note: 'This chapter has not been read yet.'};
    var src = srcId || 'ph';
    var body = getText(src, key);
    var cites = forChapter(vol, n).cites;
    var rows = unpackA(row.a).map(function (a) {
      var f = body && body[a.fn - 1] ? prose(body[a.fn - 1]) : null;
      return {
        fn: a.fn, cluster: a.cluster, off: a.off, len: a.len, refCount: a.n,
        text: f ? f.slice(a.off, a.off + a.len).trim() : null,
        needsFetch: !f,
        refs: cites.filter(function (c) { return c.fn === a.fn && c.cluster === a.cluster; })
      };
    }).filter(function (r) { return r.refs.length; });
    rows.sort(function (x, y) { return x.fn - y.fn || x.cluster - y.cluster; });
    return {read: true, rows: rows, source: src, footnotes: row.f || 0,
            held: !!body,
            note: body ? '' : 'The claims are stored as spans, not text \u2014 fetch the chapter to read them.'};
  }

  /* ⚠️ HALF THE CORPUS IS HEBREW-ONLY, AND THE FIRST CUT STOPPED THERE.
   * Measured 2026-08-08 across all 17 volumes: EIGHT have no English version on
   * Sefaria (Berakhot, Kashrut, Family, Family Purity, Shemitah and Yovel,
   * Likkutim I, Likkutim II, The Nation and the Land) — 106 of 276 chapters.
   * Their Hebrew editions carry the same footnotes, so "no English" was never a
   * statement about the literature, only about our grammar. English is still
   * preferred where it exists: it is the better-tested path and it renders for
   * a reader without Hebrew. Hebrew is the fallback, and the row records which
   * language it was read in so a caller never has to guess. */
  /* ⚠️ A REQUIRED ARGUMENT THAT CAN BE OMITTED SILENTLY IS A TRAP, and this one
   * caught its own audit page: `hydrate(vol, n)` with no fetcher threw inside
   * the promise, the caller's .catch() swallowed it, and the run reported the
   * chapter as simply unparsed — so the numbers came from whatever another page
   * had already cached, which is a measurement of browsing history. The default
   * makes the two-argument call mean what it looks like it means. */
  function defaultFetch (u) {
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  async function hydrate (vol, n, fetchJson) {
    fetchJson = fetchJson || defaultFetch;
    var key = chapterKey(vol, n);
    if (store().ch[key]) return forChapter(vol, n);
    var ref = chapterRef(vol, n);
    var flat = function (a) {
      return Array.isArray(a) ? a.flat(Infinity).filter(function (x) { return typeof x === 'string'; })
        : (typeof a === 'string' ? [a] : []);
    };
    /* ⚠️ NO return_format=text_only — it strips the footnotes, which are the
     * entire point. That flag is why the citations were invisible until now. */
    var j = await fetchJson('https://www.sefaria.org/api/v3/texts/' +
      encodeURIComponent(ref.replace(/\s+/g, '_')) + '?version=translation&version=primary');
    var vs = (j && j.versions) || [];
    var en = vs.filter(function (v) { return String(v.language || '') === 'en'; })[0];
    var he = vs.filter(function (v) { return String(v.language || '') === 'he'; })[0];

    var fs = en ? footnotesOf(flat(en.text)) : [];
    if (fs.length) return put(vol, n, fs, 'ph', false);

    var hfs = he ? footnotesOf(flat(he.text)) : [];
    if (hfs.length) return put(vol, n, hfs, 'ph', true);

    if (!en && !he) return {read: false, key: key, cites: [], note: 'Sefaria has no text for ' + ref + '.'};
    /* ⚠⚠ A CHAPTER WITH NO FOOTNOTES IS READ, NOT UNREAD — AND IT USED TO BE
     * RECORDED AS NEITHER. This returned `read:false` and wrote nothing, so the
     * chapter was re-fetched on every pass and, in every count anywhere, looked
     * exactly like one that had FAILED to read. Measured 2026-08-08: five of
     * Peninei Halakha's 275 chapters are like this — Sukkot 1, Women's Prayer 16,
     * Likkutim II 4 · 6 · 10 — and they are not defective. Fetched, they are
     * 22–38k characters of Hebrew carrying `<strong>` and NOTHING else: no
     * `<i>`, no `<sup>`, no footnote class. Rav Melamed wrote them without
     * notes, which is a fact about the literature and belongs in the corpus.
     * The row is written with zero footnotes so that "we read it and there is
     * nothing to cite" can be told apart from "we never got there" — the same
     * distinction this project insists on everywhere else. */
    return put(vol, n, [], 'ph', !en && !!he);
  }

  /* ⚠️ NEVER QUOTE A DICTIONARY SIZE FROM MEMORY OR FROM A DOC. Appending one
   * row (Tosafot) made four files wrong in the same round they had just been
   * corrected, and the count sits beside "the array index IS the cached key" —
   * the line an agent reads immediately before appending. Measure it. */
  function counts () {
    var pats = 0, hePats = 0;
    WORKS.forEach(function (w) { pats += (w.pats || []).length; });
    Object.keys(HE_PATS).forEach(function (k) { hePats += HE_PATS[k].length; });
    return {works: WORKS.length, patterns: pats, tractates: TRACTATES.length,
            tanakh: TANAKH.length, matchers: MATCHERS.length, cache: CK,
            hePatterns: hePats, heDict: Object.keys(HE_DICT).length,
            heStop: Object.keys(HE_STOP).length, heTractates: Object.keys(HE_TRACT).length};
  }

  /* ── 8 · AUDIT ──────────────────────────────────────────────────────────
   * What the extractor could NOT do, printed rather than hidden. */
  function audit () {
    var s = store().ch, out = {chapters: 0, cites: 0, resolved: 0, named: 0,
      partial: 0, adlocOrphan: 0, byWork: {}, unresolved: []};
    Object.keys(s).forEach(function (k) {
      out.chapters++;
      var p = k.split(':'), r = forChapter(p[0], +p[1]);
      r.cites.forEach(function (c) {
        out.cites++;
        if (c.resolved) out.resolved++; else out.named++;
        if (c.partial) out.partial++;
        if (c.form === 'adloc' && !c.resolved) out.adlocOrphan++;
        out.byWork[c.work] = (out.byWork[c.work] || 0) + 1;
        if (!c.resolved && out.unresolved.length < 40)
          out.unresolved.push(k + ' n.' + c.fn + ' — ' + c.work + (c.loc ? ' ' + c.loc : '') + ' — ' + c.why);
      });
    });
    return out;
  }

  window.MELDAR_CITE = {
    WORKS: WORKS, VOL_SEC: VOL_SEC, SEC_NAME: SEC_NAME, CH_SEC: CH_SEC, secFor: secFor,
    prose: prose, footnotesOf: footnotesOf, decode: decode,
    chapterNum: chapterNum, chapterLabel: chapterLabel, chapterRef: chapterRef,
    extract: extract, scan: scan, scanHe: scanHe, gematria: gematria,
    resolve: resolve, pack: pack, unpack: unpack,
    forChapter: forChapter, anchors: anchors, hydrate: hydrate, put: put,
    assertions: assertions, sentences: sentences, packA: packA, unpackA: unpackA,
    getText: getText, putText: putText,
    verify: verify, audit: audit, counts: counts,
    /* the cache's own health, so a caller can SAY it rather than degrade into
     * measuring nothing: `full` means the last write was refused by the quota,
     * so this session looks correct and a reload will lose it. */
    cacheState: function () {
      var bytes = 0;
      try {
        var raw = localStorage.getItem(CK);
        bytes = raw ? raw.length : 0;
      } catch (e) {}
      return {key: CK, full: cacheFull, bytes: bytes,
              chapters: Object.keys(store().ch).length};
    },
    evictOldVersions: evictOldVersions,
    pickVersion: pickVersion, cleanestOf: cleanestOf, licRank: licRank, LIC_RANK: LIC_RANK,
    clear: function () { mem = {v: 12, ts: Date.now(), ch: {}}; persist(); },
    /* the future API, stated so the client contract cannot drift from it:
     *   GET /works            → WORKS            (immutable, ETag forever)
     *   GET /cites/:vol/:ch   → {p, f, i, ts}    (a few hundred bytes, static)
     * the server runs `extract` and writes `pack`; the client reads the same
     * row through `forChapter`. Resolution stays client-side, so a fix to
     * `resolve` ships without touching a single cached or served row. */
    API: {works: '/works', chapter: '/cites/:vol/:ch', version: 1}
  };
})();
