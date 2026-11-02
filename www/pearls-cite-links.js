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
  function linkify(root, opts) {
    opts = opts || {};
    if (!root || !root.ownerDocument && root.nodeType !== 9) return 0;
    var doc = root.ownerDocument || root, n = 0, nodes = [];
    var walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, null);
    var t;
    while ((t = walker.nextNode())) {
      var p = t.parentNode, skip = false;
      for (var q = p; q && q !== root.parentNode; q = q.parentNode) {
        if (SKIP[q.nodeName] || (q.classList && q.classList.contains('pc-cite'))) { skip = true; break; }
      }
      if (!skip && t.nodeValue && t.nodeValue.length > 2) nodes.push(t);
    }
    nodes.forEach(function (node) {
      var text = node.nodeValue, hits = find(text, opts);
      if (!hits.length) return;
      var frag = doc.createDocumentFragment(), pos = 0;
      hits.forEach(function (h) {
        if (h.start > pos) frag.appendChild(doc.createTextNode(text.slice(pos, h.start)));
        var a = doc.createElement('a');
        a.className = 'pc-cite' + (h.resolved ? '' : ' pc-cite-named') + (h.internal ? ' pc-cite-internal' : '');
        a.textContent = text.slice(h.start, h.end);
        if (h.resolved) { a.href = h.internal && opts.onInternal ? '#' : sefariaUrl(h.ref); a.setAttribute('data-ref', h.ref); }
        else { a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0'); }
        a.setAttribute('title', h.resolved ? h.ref : h.why);
        if (h.secBy) a.setAttribute('data-secby', h.secBy);
        if (h.sec) a.setAttribute('data-sec', h.sec);
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (h.internal && opts.onInternal) return opts.onInternal(h.ref, h);
          (opts.onOpen || openPopup)(h, ev);
        });
        frag.appendChild(a); n++;
        pos = h.end;
      });
      if (pos < text.length) frag.appendChild(doc.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
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
        ['Shulchan Arukh, Orach Chayim 331:15', 'Mishneh Torah, Sabbath 5:3']]
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
