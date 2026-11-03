/* Pearls sync: how two copies of a reader's progress are combined. Pure functions, no I/O.
   The same file runs in the app (window.PearlsSyncMerge) and on the server (functions/api/sync.js imports it),
   so a phone, a browser and the server always agree on the result.

   A sync document is
     { v: 1,
       plays:    { chapterId: {sec, pos, part, done, n, last} },   // listening; the entry with the newer `last` wins, sec/n never go down
       read:     { chapterId: ts },                                // marked done by reading
       days:     { "YYYY-MM-DD": {min, ch:[ids]} },                // study log; minutes take the larger, chapters are a union
       measured: { chapterId: seconds },                           // audio lengths, any copy will do
       gone:     { read: { chapterId: ts } },                      // "unmarked" tombstones, so a removal syncs too
       whole:    { key: {at, val} } }                              // everything else: the copy changed last wins
   Merging is commutative and idempotent: merge(a, b) equals merge(b, a), and merging twice changes nothing. */
(function (root) {
  "use strict";
  const WHOLE = ["likes", "skips", "mine", "interests", "saved", "plan", "lists", "prefs", "speed", "speedBy",
    "lastQueue", "where", "scheme", "enWords", "audioLang"];
  const obj = x => (x && typeof x === "object" && !Array.isArray(x)) ? x : {};
  const num = x => (typeof x === "number" && isFinite(x)) ? x : 0;
  // JSON with sorted keys, so two equal documents always compare equal whatever order their keys arrived in
  const stable = x => x && typeof x === "object" ? (Array.isArray(x) ? "[" + x.map(stable).join(",") + "]"
    : "{" + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + stable(x[k])).join(",") + "}") : JSON.stringify(x === undefined ? null : x);
  const same = (a, b) => stable(a) === stable(b);

  function play(a, b) {
    if (!a || !b) { a = a || b; b = a; }   // one-sided entries are normalised too, so merging again changes nothing
    a = obj(a); b = obj(b);
    const la = num(a.last), lb = num(b.last);
    // a tie is broken on content, so the order of the arguments never matters
    const win = la > lb ? a : lb > la ? b : (stable(a) >= stable(b) ? a : b);
    return { ...win, sec: Math.max(num(a.sec), num(b.sec)), n: Math.max(num(a.n), num(b.n)) };
  }
  function day(a, b) {
    if (!a || !b) { a = a || b; b = a; }
    a = obj(a); b = obj(b);
    const ch = [...new Set([...(a.ch || []), ...(b.ch || [])])].sort();
    return { min: Math.max(num(a.min), num(b.min)), ch };
  }
  function mapMerge(a, b, f) {
    const out = {}, A = obj(a), B = obj(b);
    for (const k of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) out[k] = f(A[k], B[k]);   // sorted, so equal documents serialise equally
    return out;
  }
  const maxTs = (a, b) => Math.max(num(a), num(b));

  function merge(a, b) {
    a = obj(a); b = obj(b);
    const gone = { read: mapMerge(obj(a.gone).read, obj(b.gone).read, maxTs) };
    const read = mapMerge(a.read, b.read, maxTs);
    for (const id in gone.read) {
      if (read[id] && read[id] > gone.read[id]) delete gone.read[id];   // marked again after it was unmarked
      else delete read[id];
    }
    const whole = mapMerge(a.whole, b.whole, (x, y) => {
      if (!x) return y; if (!y) return x;
      const ax = num(x.at), ay = num(y.at);
      return ax > ay ? x : ay > ax ? y : (stable(x) >= stable(y) ? x : y);
    });
    for (const k in whole) if (!WHOLE.includes(k)) delete whole[k];
    return {
      v: 1,
      plays: mapMerge(a.plays, b.plays, play),
      read, gone,
      days: mapMerge(a.days, b.days, day),
      measured: mapMerge(a.measured, b.measured, (x, y) => x || y),
      whole
    };
  }
  const empty = () => merge({}, {});
  // Reject anything that isn't a sync document of a sane size before it is stored.
  function clean(doc, maxBytes = 900000) {
    const d = merge(doc, {});
    const s = JSON.stringify(d);
    if (s.length > maxBytes) throw new Error("too big");
    return d;
  }
  const api = { merge, empty, clean, same, WHOLE };
  root.PearlsSyncMerge = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
