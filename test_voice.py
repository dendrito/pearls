"""The natural voices (Estante's Kokoro and Piper, voice.js): the player hands AI-voice sections to them once one is
downloaded, maps their pieces to paragraphs, runs on to the next section, falls back to the device voice when they
fail, and Settings → Voice offers download, remove and the Kokoro voices. voice.js itself needs its models from
the network, so the test swaps in a stand-in with the same interface. Must end "voice: N/N"."""
import os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); url = "file://" + os.path.join(here, "www", "index.html")
STUB = """(() => { window.__calls = []; window.__dl = new Set(window.__have || ['natural','piper']);
  window.Voice = Object.assign({}, window.Voice, {
    needsDownload: id => !window.__dl.has(id), wifiOnly: () => true, setWifiOnly() {}, status: async () => ({ bytes: 373e6 }),
    mayDownload: () => ({ ok: true }), sizeMb: () => 93, SIZE_MB: 370, remove: async id => { window.__dl.delete(id); } });
  const NE = PEARLS.NE;
  NE.load = async (k, o = {}) => { if (o.onBytes) o.onBytes({ url: 'x', loaded: 5e6 }); if (o.net) window.__dl.add(k); return {}; };
  NE.say = async (k, text, voice) => { window.__calls.push({ k, voice, text }); if (window.__fail) throw new Error('no model');
    await new Promise(r => setTimeout(r, 10)); const n = 2400 * (window.__len || 1), b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    return { blob: new Blob([b], { type: 'audio/wav' }), dur: n / 24000, genS: 0.01 }; }; })()"""
# the Apple app runs Kokoro itself (KokoroNative.swift): a stand-in for its pearls://app/native/kokoro/ answers
NATIVE = """(() => { window.__nk = { calls: [], have: false, polls: 0 };
  const info = { ok: true, kokoro: true };
  window.PearlsNative = { info: () => JSON.stringify(info), status: () => '{"active":[],"failed":[]}', list: () => '[]', textList: () => '[]',
    readText: () => null, writeText: () => true, enqueue: () => 0, remove: () => 0, cancelAll() {}, clearText: () => 0, mediaState() {}, setBars() {} };
  const realFetch = window.fetch.bind(window), J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  window.fetch = async (u, o) => {
    const s = String(u); if (!s.startsWith('pearls://app/native/kokoro/')) return realFetch(u, o);
    const q = new URL(s.replace('pearls://app', 'http://x')); const what = q.pathname.split('/').pop(); __nk.calls.push(what);
    if (what === 'status') { if (__nk.dl && ++__nk.polls > 2) { __nk.dl = false; __nk.have = true; }
      return J({ downloaded: __nk.have, downloading: !!__nk.dl, bytes: __nk.have ? 330e6 : 0, progress: __nk.dl ? { loaded: 1e8, total: 33e7 } : undefined }); }
    if (what === 'download') { __nk.dl = true; __nk.wifi = q.searchParams.get('wifi'); return J({}); }
    if (what === 'remove') { __nk.have = false; return J({ downloaded: false }); }
    if (what === 'load') return __nk.have ? J({ how: 'Neural Engine and graphics chip (Core ML)' }) : J({ error: 'not downloaded' }, 500);
    if (what === 'say') { __nk.ph = q.searchParams.get('ph'); __nk.v = q.searchParams.get('v');
      return new Response(new Uint8Array(44 + 48000), { headers: { 'content-type': 'audio/wav', 'X-Gen-Seconds': '0.2' } }); }
    return J({}, 404); };
  const RW = window.Worker;
  window.Worker = function (u, o) { if (!String(u).includes('pearls-phonemes')) return new RW(u, o);
    const w = { postMessage: m => setTimeout(() => w.onmessage && w.onmessage({ data: { id: m.id, phonemes: '<' + m.text.trim() + '>' } }), 5), terminate() {} }; return w; };
})()"""
ok = 0; n = 0
def check(name, cond, info=""):
    global ok, n; n += 1; ok += bool(cond); print(("PASS " if cond else "FAIL ") + name, "" if cond else info)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    c = b.new_context(); pg = c.new_page(); pg.route("https://**", lambda r: r.abort()); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(600)
    E = lambda js: pg.evaluate(js)
    check("voice.js loads (Voice.player, pieces, prepare)", E("!!(window.Voice && Voice.player && Voice.pieces && Voice.prepare)"))
    tid = E("PEARLS.TRACKS.find(t => PEARLS.listenLang(t) === 'tts' && (t.sections || 1) > 1).id")
    check("a chapter read by the AI voice exists", bool(tid), tid)
    E(STUB); E("PEARLS.state.prefs.voiceEngine = 'natural'; PEARLS.state.prefs.kokoroVoice = 'bm_george'")
    pg.goto(url + "#ch-" + tid); pg.wait_for_timeout(500); E(STUB)
    pg.click('[data-act="playch"]'); pg.wait_for_timeout(1200)
    calls = E("__calls")
    check("the natural voice reads the section", calls and calls[0]["k"] == "natural" and E("PEARLS.audio.neural"), calls[:1])
    check("with the Kokoro voice chosen", calls and calls[0]["voice"] == "bm_george", calls[:1])
    # polled: with no gap between pieces the stand-in pieces (0.1 s) run fast, and a single look can fall between two sections
    marked = False
    for _ in range(20):
        if E("!!document.querySelector('.reader .spoken')"): marked = True; break
        pg.wait_for_timeout(50)
    check("the paragraph being read is marked", marked or E("PEARLS.P.part") > 0)
    pg.wait_for_timeout(4000)
    check("it runs on to the next section by itself", E("PEARLS.P.part") >= 1, (E("PEARLS.P.part"), len(E("__calls"))))
    check("time moves while it reads", E("PEARLS.audio.duration") > 0)
    E("PEARLS.audio.pause(); window.__len = 40; window.__calls = []")
    E("PEARLS.audio.currentTime = PEARLS.audio.duration * 0.6"); E("PEARLS.audio.play()"); pg.wait_for_timeout(300)
    first = E("__calls[0] && __calls[0].text"); 
    # a later piece: asked for now, or (already made while the section played) started at the place sought
    ct, dur = E("PEARLS.audio.currentTime"), E("PEARLS.audio.duration")
    check("seeking starts at a later piece", (first and ct > 0) or ct >= dur * 0.5, (first, ct, dur))
    E("window.__fail = true; PEARLS.audio.pause(); PEARLS.audio.src = PEARLS.audio.src; PEARLS.audio.play()"); pg.wait_for_timeout(800)
    check("a voice that fails hands over to the device voice", E("PEARLS.audio.speaking && !PEARLS.audio.neural"), (E("PEARLS.audio.speaking"), E("PEARLS.audio.neural")))
    E("PEARLS.audio.pause(); window.__fail = false")
    # Settings → Voice
    E("window.__have = ['piper']; window.__len = 1"); E(STUB); E("PEARLS.state.prefs.voiceEngine = 'natural'")
    pg.goto(url + "#ch-" + tid); pg.wait_for_timeout(500); E("window.__have = ['piper']"); E(STUB)
    E("(() => { const b = document.createElement('button'); b.dataset.act = 'voice'; document.querySelector('.view').appendChild(b); b.click(); })()"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('[data-engine=piper]').click()"); pg.evaluate("document.querySelector('[data-engine=natural]').click()"); pg.wait_for_timeout(200)
    check("Settings: three engines, Natural not downloaded offers Download", E("document.querySelectorAll('[data-engine]').length") == 3 and E("!!document.querySelector('[data-vdl=natural]')"))
    pg.evaluate("document.querySelector('[data-vdl=natural]').click()"); pg.wait_for_timeout(400)
    check("after download: Remove and the four Kokoro voices", E("!!document.querySelector('[data-vrm=natural]')") and E("document.querySelectorAll('[data-kvoice]').length") == 4)
    pg.evaluate("document.querySelector('[data-kvoice=af_heart]').click()"); pg.wait_for_timeout(200)
    check("choosing a Kokoro voice is saved", E("PEARLS.state.prefs.kokoroVoice") == "af_heart")
    pg.evaluate("document.querySelector('[data-vrm=natural]').click()"); pg.wait_for_timeout(400)
    check("Remove takes it off and the device voice reads meanwhile", E("!!document.querySelector('[data-vdl=natural]')") and E("PEARLS.listenLang(PEARLS.BYID['%s'])" % tid) == "tts")
    check("Read aloud is a switch, apart from the voice choices", E("!!document.querySelector('[data-aivoice] .switch') && !document.querySelector('[data-aivoice] .radio')"))
    pg.evaluate("document.querySelector('[data-aivoice]').click()"); pg.wait_for_timeout(100)
    check("switching it off hides the voice choices", E("document.querySelector('[data-enginefield]').hidden && PEARLS.state.prefs.aiVoice === false"))
    pg.evaluate("document.querySelector('[data-aivoice]').click()")
    check("no page errors", not errs, errs[:3])
    # the Apple app's own Kokoro
    c2 = b.new_context(); c2.add_init_script(NATIVE); pg = c2.new_page(); pg.route("https://**", lambda r: r.abort()); errs2 = []; pg.on("pageerror", lambda e: errs2.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(600); E = lambda js: pg.evaluate(js)
    check("app: the page sees the app's own Kokoro", E("PEARLS.NK.on()"))
    E("PEARLS.state.prefs.voiceEngine = 'natural'")
    E("(() => { const b = document.createElement('button'); b.dataset.act = 'voice'; document.querySelector('.view').appendChild(b); b.click(); })()"); pg.wait_for_timeout(300)
    check("app: not downloaded offers about 330 MB", "330 MB" in E("document.querySelector('[data-vdl=natural]') ? document.querySelector('[data-vdl=natural]').textContent : ''"))
    pg.evaluate("document.querySelector('[data-vdl=natural]').click()"); pg.wait_for_timeout(2600)
    check("app: the app downloads it (Wi-Fi only) and opens it", E("__nk.calls.includes('download') && __nk.calls.includes('load') && __nk.wifi === '1' && PEARLS.NK.has"), E("__nk.calls"))
    check("app: Settings says where it runs", "Core ML" in E("document.querySelector('[data-engines]').textContent"))
    r = E("PEARLS.NE.say('natural', 'Shabbat and Ḥanukka.', 'af_heart').then(a => ({ dur: a.dur, size: a.blob.size, ph: __nk.ph, v: __nk.v }))")
    check("app: the page sends phonemes, the app sends back a WAV", r["v"] == "af_heart" and r["ph"].startswith("<Shabbat and") and abs(r["dur"] - 1) < 0.01, r)
    check("app: the Hebrew word keeps its ḥ (Pearls' own rule, not eSpeak)", "x" in r["ph"].split("<Shabbat and>")[-1].split("<")[0], r["ph"])
    check("app: the browser's model is never touched", not E("PEARLS.NE.kind !== 'natural'") and E("!document.querySelector('script[src*=kokoro]')"))
    pg.evaluate("document.querySelector('[data-vrm=natural]').click()"); pg.wait_for_timeout(400)
    check("app: Remove asks the app", E("__nk.calls.includes('remove') && !PEARLS.NK.has && !!document.querySelector('[data-vdl=natural]')"))
    check("app: no page errors", not errs2, errs2[:3])
    b.close()
print(f"voice: {ok}/{n}")
