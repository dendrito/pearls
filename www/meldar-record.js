/* ============================================================================
   meldar-record.js — D-013 · THE OPT-IN STUDY RECORD            window.MELDAR_RECORD
   ----------------------------------------------------------------------------
   The owner's decision (DECISIONS.md D-013), built against the evidence in
   sources/nd-gamification.md. ONE engine, three callers: the platform (review,
   laps), the Academy (units) and the reader (two minutes with a passage open).

   ⚠️ OFF UNTIL THE LEARNER SAYS YES. `choice` is null (never asked), 'on' or 'off'.
   Nothing is recorded while it is not 'on', and view() returns null, so there is
   nothing for a surface to render. selftest() asserts this, and the Number Lint
   runs selftest() — a refusal needs a test, not a memo (N12).

   ⚠️ WHAT IT SHOWS, AND WHY IN THIS FORM
     · days studied — the headline. Cumulative, it never falls (Deci 1999: information,
       not reward; Silverman & Barasch: the cost of a streak falls on the break).
     · last studied — only on its own sub-switch, and written as a DATE first
       ("Last studied Tuesday · 5 days ago"), never as an absence tally.
     · days in a row — a RUN, not an all-or-nothing streak: Shabbat and Yom Tov pause it,
       two weekdays each week are held in reserve (Lally 2010 (a missed day cost 0.29 points on a 0–42 automaticity scale — re-cited 2026-09-23 from Sharif & Shu, which is a marketing-journal consumer study)), and it ends in
       silence. The longest run is kept, and it cannot fall.
     · four milestones, fixed, each carrying its own source — never escalating targets
       (goal attainment and hypomania: Johnson 2000; Alloy 2008), never locked slots
       (N6): a milestone not yet reached is simply not shown.
     · the chain — one link per day studied. A missed day draws NOTHING: no gap, no
       broken link, because only days studied are drawn.

   ⚠️ WHAT IT REFUSES, EVEN WHEN ON: points, XP, levels, leaderboards, comparison,
     surprise rewards, "don't lose your streak", notifications of any kind, and any
     announcement at night (22:00–05:00), when a milestone waits for the morning.

   ⚠️ DEVICE-ONLY. `meldar.record` never syncs (D-008) and never reaches a teacher,
     a programme, a beth din or a guardian. It is not read by any giyur surface.
   ============================================================================ */
(function () {
  'use strict';

  var KEY = 'meldar.record';
  var V = 1;
  var RESERVE = 2;                 // weekdays per week the run may skip and survive
  var CHAIN_MAX = 120;             // links drawn; the rest are counted in words
  var QUIET_FROM = 22, QUIET_TO = 5;

  /* The four milestones. Every source was fetched from Sefaria on 2026-09-22.
     `say` is OUR paraphrase — the William Davidson English is CC-BY-NC, so the
     words on screen are ours and the link opens the source itself. */
  var MILESTONES = [
    { n: 40,  ref: 'Shemot Rabbah 41:6', url: 'https://www.sefaria.org/Shemot_Rabbah.41.6',
      say: 'All forty days Moshe was on high he studied Torah and forgot it, until it was given to him as a gift.' },
    { n: 101, ref: 'Chagigah 9b', url: 'https://www.sefaria.org/Chagigah.9b.10',
      say: 'Reviewing a hundred and one times is not the same as reviewing a hundred.' },
    { n: 248, ref: 'Eruvin 54a', url: 'https://www.sefaria.org/Eruvin.54a.1',
      say: 'Torah set in order in all 248 limbs is secure: learning with the whole body, aloud.' },
    { n: 400, ref: 'Eruvin 54b', url: 'https://www.sefaria.org/Eruvin.54b.20',
      say: 'Rabbi Perida taught one student four hundred times, and did not leave until he had it.' }
  ];

  /* What the learner is told before choosing. One source for every surface that asks,
     so the risks cannot drift between the platform and the Academy. Declarative (N5). */
  var ASK = {
    kicker: 'A study record',
    title: 'Keep a record of the days you study?',
    intro: 'Meldar can keep a private record of the days you study: how many in all, how many in a row, and when you last studied, with a few milestones taken from the sources. For some people this helps them come back. For others it turns into pressure. Before you choose:',
    risks: [
      'A run of days in a row helps while it lasts. When one ends, many people find it harder to come back, especially if they blame themselves. Here a run pauses on Shabbat and Yom Tov, keeps two weekdays in reserve each week, and ends without any message.',
      'Counting and rewards can pull some people into using an app for the number rather than the learning. This is more common for people who find it hard to stop once absorbed. If you notice it, turn the record off. Nothing is lost.',
      'Reaching goals can lift mood strongly for some people, particularly anyone who has had periods of unusually high mood, and late-night use can cost sleep. The record never prompts you, stays quiet at night, and its milestones are fixed. They never grow.',
      '“Last studied” is shown only if you switch it on separately.',
      'The record stays on this device. No teacher, programme, beth din or study partner sees it, and it appears nowhere near conversion.',
      'It does not improve memory or attention by itself. Reviewing does. The record only shows you what you did.'
    ],
    yes: 'Keep a record',
    no: 'No record',
    note: 'You can change this at any time, and turning it off keeps nothing on screen.'
  };

  var SOURCE_WORD = { review: 'a review', lap: 'a lap', unit: 'a unit', check: 'a checkpoint', read: 'a reading' };

  /* ------------------------------------------------------------------ dates */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function noon(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0); }
  function fromIso(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return noon(x); }
  function dayDiff(a, b) { return Math.round((noon(a).getTime() - noon(b).getTime()) / 864e5); }
  function weekKey(d) { return isoOf(addDays(d, -d.getDay())); }   // the Sunday that opens the week

  /* The Hebrew date, offline, from the browser's own calendar. If a browser cannot give it,
     Shabbat (Saturday) still pauses the run and Yom Tov simply does not — never a guess. */
  var HEB = null;
  try { HEB = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long' }); } catch (e) { HEB = null; }
  function hebDate(d) {
    if (!HEB) return null;
    try {
      var parts = HEB.formatToParts(d), day = 0, month = '';
      parts.forEach(function (p) { if (p.type === 'day') day = +p.value; if (p.type === 'month') month = p.value; });
      return day ? { day: day, month: month } : null;
    } catch (e) { return null; }
  }
  /* Yom Tov days, diaspora second days INCLUDED: pausing a run one day more than needed costs
     nothing, while breaking it on a second day of chag would be the platform's own error. */
  var YOMTOV = { Tishri: [1, 2, 10, 15, 16, 22, 23], Nisan: [15, 16, 21, 22], Sivan: [6, 7] };
  function isYomTov(d) {
    var h = hebDate(d); if (!h) return false;
    var list = YOMTOV[h.month]; return !!(list && list.indexOf(h.day) >= 0);
  }
  function isRest(d) { return d.getDay() === 6 || isYomTov(d); }
  function restName(d) { return d.getDay() === 6 ? 'Shabbat' : (isYomTov(d) ? 'Yom Tov' : ''); }

  /* --------------------------------------------------------------- storage */
  function blank() { return { v: V, choice: null, showSince: false, days: {}, src: {}, reachedOn: {} }; }
  function load() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j && j.v === V && typeof j.days === 'object') return Object.assign(blank(), j);
    } catch (e) {}
    return blank();
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }

  /* ------------------------------------------------------------- the core
     Pure over a state object, so selftest() can run it on fixtures without touching storage. */
  function compute(s, now) {
    now = noon(now || new Date());
    var todayIso = isoOf(now);
    var keys = Object.keys(s.days || {}).filter(function (k) { return s.days[k] && k <= todayIso; }).sort();
    var total = keys.length;
    var out = { total: total, run: 0, longest: 0, last: keys.length ? keys[keys.length - 1] : '', today: !!(s.days || {})[todayIso] };
    if (!total) return out;

    // One forward pass: a run survives rest days and up to RESERVE missed weekdays in any one week.
    var d = fromIso(keys[0]), cur = 0, best = 0, inRun = false, used = {}, guard = 0;
    while (dayDiff(now, d) >= 0 && guard++ < 40000) {
      var iso = isoOf(d);
      if (s.days[iso]) { inRun = true; cur++; }
      else if (isRest(d)) { /* pause: neither counts nor breaks */ }
      else if (iso === todayIso) { /* today is not over: neutral */ }
      else if (inRun) {
        var wk = weekKey(d);
        if ((used[wk] || 0) < RESERVE) used[wk] = (used[wk] || 0) + 1;
        else { if (cur > best) best = cur; cur = 0; inRun = false; used = {}; }   // ends in silence
      }
      d = addDays(d, 1);
    }
    if (cur > best) best = cur;
    out.run = inRun ? cur : 0;
    out.longest = best;
    return out;
  }

  function sinceWords(lastIso, now) {
    if (!lastIso) return '';
    var n = dayDiff(now, fromIso(lastIso));
    if (n <= 0) return 'Studied today';
    var day = fromIso(lastIso).toLocaleDateString(undefined, { weekday: 'long' });
    if (n === 1) return 'Last studied yesterday';
    if (n < 7) return 'Last studied ' + day + ' · ' + n + ' days ago';
    return 'Last studied ' + fromIso(lastIso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + ' · ' + n + ' days ago';
  }

  /* A fresh start (Dai, Milkman & Riis 2014) named from the calendar — shown only on a return,
     and only when today IS such a landmark. It never asks anyone to wait for one. */
  function freshStart(now, daysSince) {
    if (daysSince < 2) return '';
    var h = hebDate(now);
    if (h && h.day === 1) return 'Today is Rosh Ḥodesh ' + h.month + ', the start of a month.';
    if (now.getDay() === 0) return 'Today opens a new week.';
    return 'Whenever you come back, the chain picks up from there.';
  }

  function quietNow(t) { var h = (t || new Date()).getHours(); return h >= QUIET_FROM || h < QUIET_TO; }

  function viewOf(s, nowIn) {
    if (!s || s.choice !== 'on') return null;
    var now = nowIn || new Date(), c = compute(s, now);
    var todayIso = isoOf(noon(now));
    var daysSince = c.last ? dayDiff(noon(now), fromIso(c.last)) : 0;
    var srcToday = ((s.src || {})[todayIso] || []).map(function (k) { return SOURCE_WORD[k] || ''; }).filter(Boolean);
    var quiet = quietNow(now);
    var reached = MILESTONES.filter(function (m) { return c.total >= m.n; }).map(function (m) {
      var on = (s.reachedOn || {})[m.n] || '';
      return { n: m.n, title: m.n + ' days studied', ref: m.ref, url: m.url, say: m.say,
               isNew: !quiet && on === todayIso };
    });
    var keys = Object.keys(s.days || {}).filter(function (k) { return s.days[k] && k <= todayIso; }).sort();
    var links = keys.slice(-CHAIN_MAX).map(function (k) { return { iso: k, today: k === todayIso }; });
    var rest = restName(noon(now));
    return {
      on: true,
      total: c.total,
      head: c.total === 1 ? '1 day studied' : c.total + ' days studied',
      today: c.today ? ('Today · ' + (srcToday.length ? srcToday.join(', ') : 'studied')) : '',
      showSince: !!s.showSince,
      /* ⚠️ Not both. When today is already a study day the "Today ·" line says so, and a second
         line reading "Studied today" is the same fact twice. The since line is for absence. */
      since: (s.showSince && c.last && !c.today) ? sinceWords(c.last, noon(now)) : '',
      run: c.run,
      runLine: c.run > 0 ? ('Days in a row · ' + c.run) : (c.total > 0 ? 'A new run begins with your next study day.' : ''),
      runNote: 'Shabbat and Yom Tov pause the run, and two weekdays each week are held in reserve.' + (rest ? ' Today is ' + rest + ', so it is paused.' : ''),
      longest: c.longest,
      longestLine: c.longest > 1 ? ('Longest run · ' + c.longest) : '',
      chain: links,
      chainMore: keys.length > CHAIN_MAX ? ('and ' + (keys.length - CHAIN_MAX) + ' earlier links') : '',
      milestones: reached,
      fresh: freshStart(noon(now), daysSince),
      quiet: quiet
    };
  }

  /* ------------------------------------------------------------ the API */
  var listeners = [];
  function emit() { listeners.slice().forEach(function (f) { try { f(); } catch (e) {} }); }

  function mark(source, when) {
    var s = load();
    if (s.choice !== 'on') return { recorded: false };
    var t = when ? new Date(when) : new Date(), iso = isoOf(noon(t));
    if (iso > isoOf(noon(new Date()))) return { recorded: false };
    var fresh = !s.days[iso];
    s.days[iso] = 1;
    s.src = s.src || {};
    var list = s.src[iso] || [];
    if (source && list.indexOf(source) < 0) list.push(source);
    s.src[iso] = list;
    // Keep source words for recent days only: a list per day is enough to say "today · a review".
    Object.keys(s.src).forEach(function (k) { if (dayDiff(new Date(), fromIso(k)) > 7) delete s.src[k]; });
    // A milestone is dated the day it is reached, so it is announced once, in daylight.
    var total = Object.keys(s.days).length;
    s.reachedOn = s.reachedOn || {};
    MILESTONES.forEach(function (m) { if (total >= m.n && !s.reachedOn[m.n]) s.reachedOn[m.n] = iso; });
    save(s); emit();
    return { recorded: true, newDay: fresh };
  }

  /* Seed from what this device already holds — review timestamps the platform passes in.
     Never from mere page opens: a day counts when something was studied. */
  function backfill(timestamps) {
    var s = load(); if (s.choice !== 'on') return 0;
    var today = isoOf(noon(new Date())), n = 0;
    (timestamps || []).forEach(function (t) {
      if (!t) return; var iso = isoOf(noon(new Date(t)));
      if (iso <= today && !s.days[iso]) { s.days[iso] = 1; n++; }
    });
    var total = Object.keys(s.days).length;
    s.reachedOn = s.reachedOn || {};
    // Milestones passed during a backfill are dated to the backfill's earliest day, so none
    // of them is announced as new today: nothing was reached today.
    MILESTONES.forEach(function (m) { if (total >= m.n && !s.reachedOn[m.n]) s.reachedOn[m.n] = 'backfill'; });
    if (n) { save(s); emit(); }
    return n;
  }

  function setChoice(v) { var s = load(); s.choice = (v === 'on') ? 'on' : 'off'; save(s); emit(); return s.choice; }
  function setShowSince(b) { var s = load(); s.showSince = !!b; save(s); emit(); return s.showSince; }
  function erase() { var s = blank(); s.choice = 'off'; save(s); emit(); }

  /* ---------------------------------------------------------- the test */
  var FORBIDDEN = /\b(streak|lost|lose|broke|broken|missed|fail(ed|ure)?|behind|overdue|great job|well done|keep it up|don't|do not miss)\b/i;
  function selftest() {
    var fails = [], total = 0;
    function t(name, ok) { total++; if (!ok) fails.push(name); }
    var sun = new Date(2026, 8, 20, 12);   // Sunday 20 September 2026
    function st(isos, choice) { var s = blank(); s.choice = (choice === undefined) ? 'on' : choice; isos.forEach(function (k) { s.days[k] = 1; }); return s; }

    t('off renders nothing', viewOf(st(['2026-09-20'], 'off'), sun) === null);
    t('never-asked renders nothing', viewOf(st(['2026-09-20'], null), sun) === null);
    // Thu 17 and Sun 20 studied; Fri 18 missed (reserve), Sat 19 is Shabbat (pause) → run 2
    t('Shabbat pauses, reserve covers a weekday', compute(st(['2026-09-17', '2026-09-20']), sun).run === 2);
    // Mon 14 studied, Tue–Thu 15–17 missed (3 > reserve 2), Fri 18 missed → run ended; Sun 20 studied → run 1
    var r = compute(st(['2026-09-14', '2026-09-20']), sun);
    t('beyond the reserve the run ends', r.run === 1 && r.longest === 1);
    t('longest run is kept', compute(st(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-20']), sun).longest === 3);
    t('today unfinished does not end a run', compute(st(['2026-09-17']), sun).run === 1);
    t('a milestone not reached is not shown', viewOf(st(['2026-09-20']), sun).milestones.length === 0);
    var forty = []; for (var i = 0; i < 40; i++) forty.push(isoOf(addDays(fromIso('2026-08-01'), i)));
    t('a milestone reached is shown', viewOf(st(forty), sun).milestones.length === 1);
    t('last studied hidden unless switched on', viewOf(st(['2026-09-14']), sun).since === '');
    var withSince = st(['2026-09-14']); withSince.showSince = true;
    t('last studied reads as a date', /^Last studied /.test(viewOf(withSince, sun).since));
    var ended = viewOf(st(['2026-09-01']), sun);
    t('a run ends in silence', ended.run === 0 && ended.runLine === 'A new run begins with your next study day.');
    /* THE RECORD'S OWN STRINGS carry no loss and no praise (N5): what it renders day to day
       must never tell anyone they broke something or did well. ⚠️ The ASK is held to a
       different rule ON PURPOSE — its whole job is to describe what a run costs when it
       ends, so it is tested for praise and exclamation only. Holding both to one list is how
       an honest warning gets deleted for using the word it needs. */
    var shown = [];
    [ended, viewOf(withSince, sun), viewOf(st(forty), sun)].forEach(function (v) {
      shown.push(v.head, v.today, v.since, v.runLine, v.runNote, v.longestLine, v.fresh, v.chainMore);
      v.milestones.forEach(function (m) { shown.push(m.title, m.say); });
    });
    var asked = [ASK.kicker, ASK.title, ASK.intro, ASK.yes, ASK.no, ASK.note].concat(ASK.risks);
    t('no exclamation marks anywhere', (shown.join(' ') + ' ' + asked.join(' ')).indexOf('!') < 0);
    t('the record never says loss or praise', !FORBIDDEN.test(shown.join(' ')));
    t('the ask never praises', !/\b(great job|well done|keep it up|amazing|congratulations)\b/i.test(asked.join(' ')));
    return { pass: total - fails.length, total: total, fails: fails };
  }

  window.MELDAR_RECORD = {
    KEY: KEY, ASK: ASK, MILESTONES: MILESTONES, RESERVE: RESERVE,
    state: load,
    choice: function () { return load().choice; },
    isOn: function () { return load().choice === 'on'; },
    view: function (now) { return viewOf(load(), now); },
    mark: mark, backfill: backfill,
    setChoice: setChoice, setShowSince: setShowSince, erase: erase,
    isRest: isRest, restName: restName,
    onChange: function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (g) { return g !== f; }); }; },
    selftest: selftest
  };
  // Another tab (the Academy, the reader) wrote the record: tell this page's listeners.
  try { window.addEventListener('storage', function (e) { if (e && e.key === KEY) emit(); }); } catch (e) {}
})();
