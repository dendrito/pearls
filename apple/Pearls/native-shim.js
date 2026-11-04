/* window.PearlsNative for the Apple app (iPhone, iPad, Mac).
 *
 * The web app was written against Android's bridge (android/java/.../PearlsBridge.java), whose methods are
 * synchronous. WKWebView's are not, so this shim keeps the same interface with a different mechanism:
 *  - info(), status(), list(), textList() return the last state the app pushed (PEARLS_NATIVE_PUSH), starting from
 *    the state baked into this script when the page loaded, so the first render already knows what is downloaded;
 *  - enqueue(), remove(), cancelAll(), writeText(), clearText(), mediaState(), setBars() are posted to the app
 *    (webkit.messageHandlers.pearls) and answered with the result Android would give, applied to the local copy at
 *    once so the page sees its own change before the app's next push;
 *  - readText() is a synchronous request to pearls://app/native/text/<key>, served by PearlsScheme from the app's
 *    files. If that ever fails it returns null, which the page already treats as "not kept yet, fetch it".
 * The app injects this file at document start with __BOOT__ replaced (see PearlsWebView.swift). */
(function () {
  var H = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pearls;
  if (!H || window.PearlsNative) return;
  var S = __BOOT__;                      // {info:{}, status:{active,failed}, list:[{n,s}], texts:[{n,s}]}
  S.status = S.status || { active: [], failed: [] };
  var seq = 0, mine = {};                // optimistic entries not yet confirmed by a push: name -> seq
  var safe = function (n) { return typeof n === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(n) && n.indexOf("..") < 0; };
  var post = function (m, a) { seq++; try { H.postMessage({ m: m, a: a || {}, seq: seq }); } catch (e) {} return seq; };
  var listHas = function (n) { for (var i = 0; i < S.list.length; i++) if (S.list[i].n === n) return true; return false; };
  var activeHas = function (n) { for (var i = 0; i < S.status.active.length; i++) if (S.status.active[i].name === n) return true; return false; };

  /* the page's errors, warnings and toasts, printed in Xcode's console as "[page] …" (Safari's Web Inspector shows the rest) */
  var say = function (kind, args) {
    try { H.postMessage({ m: "log", a: { kind: kind, text: Array.prototype.map.call(args, function (x) { return x && x.stack ? x.stack : typeof x === "object" ? JSON.stringify(x) : String(x); }).join(" ").slice(0, 2000) } }); } catch (e) {}
  };
  ["error", "warn", "info"].forEach(function (k) { var f = console[k]; console[k] = function () { say(k, arguments); return f.apply(console, arguments); }; });
  window.addEventListener("error", function (e) { say("error", [e.message + " at " + (e.filename || "") + ":" + (e.lineno || "")]); });
  window.addEventListener("unhandledrejection", function (e) { say("error", ["unhandled: ", e.reason]); });
  window.PEARLS_LOG = function () { say("info", arguments); };

  window.PEARLS_NATIVE_PUSH = function (p) {      // called by the app with whatever changed
    if (!p) return;
    if (p.info) S.info = p.info;
    if (p.list) S.list = p.list;
    if (p.texts) S.texts = p.texts;
    if (p.status) {
      var ack = p.ack || 0, act = p.status.active || [];
      for (var n in mine) {                        // keep our own entries until the app has seen the request
        if (mine[n] > ack && !act.some(function (a) { return a.name === n; }) && !listHas(n)) act.push({ name: n, status: "running", done: 0, total: 0 });
        else delete mine[n];
      }
      S.status = { active: act, failed: (S.status.failed || []).concat(p.status.failed || []) };
    }
  };

  window.PearlsNative = {
    info: function () { return JSON.stringify(S.info || { ok: false }); },
    status: function () {                          // failed entries are reported once, like Android's
      var out = JSON.stringify({ active: S.status.active, finished: [], failed: S.status.failed || [] });
      S.status.failed = []; return out;
    },
    list: function () { return JSON.stringify(S.list || []); },
    enqueue: function (jobsJson, wifiOnly) {
      var jobs; try { jobs = JSON.parse(jobsJson); } catch (e) { return -2; }
      var ok = jobs.filter(function (j) { return j && safe(j.name) && /^https?:\/\//.test(j.url || "") && !listHas(j.name) && !activeHas(j.name); });
      if (!ok.length) return 0;
      var s = post("enqueue", { jobs: ok, wifiOnly: !!wifiOnly });
      ok.forEach(function (j) { mine[j.name] = s; S.status.active.push({ name: j.name, status: "running", done: 0, total: 0 }); });
      return ok.length;
    },
    remove: function (namesJson) {
      var names; try { names = JSON.parse(namesJson).filter(safe); } catch (e) { return 0; }
      var gone = 0;
      S.list = S.list.filter(function (f) { if (names.indexOf(f.n) >= 0) { gone++; return false; } return true; });
      S.status.active = S.status.active.filter(function (a) { return names.indexOf(a.name) < 0; });
      names.forEach(function (n) { delete mine[n]; });
      post("remove", { names: names });
      return gone;
    },
    cancelAll: function () { S.status.active = []; mine = {}; post("cancelAll"); },
    readText: function (key) {
      if (!safe(key)) return null;
      try {
        var x = new XMLHttpRequest();
        x.open("GET", "pearls://app/native/text/" + encodeURIComponent(key), false);
        x.send();
        return x.status === 200 && x.responseText ? x.responseText : null;
      } catch (e) { return null; }
    },
    writeText: function (key, content) {
      if (!safe(key) || content == null) return false;
      post("writeText", { key: key, content: String(content) });
      S.texts = (S.texts || []).filter(function (t) { return t.n !== key; }).concat([{ n: key, s: String(content).length }]);
      return true;
    },
    textList: function () { return JSON.stringify(S.texts || []); },
    clearText: function () { var n = (S.texts || []).length; S.texts = []; post("clearText"); return n; },
    mediaState: function (json) { post("mediaState", { json: String(json || "") }); },
    setBars: function (hex, light) { post("setBars", { hex: String(hex || ""), light: !!light }); },
    saveMigration: function () {},
    takeMigration: function () { return null; }
  };
})();
