"""The natural voices (Estante's Kokoro and Piper, voice.js): the player hands AI-voice sections to them once one is
downloaded, maps their pieces to paragraphs, runs on to the next section, falls back to the device voice when they
fail, and Settings → Voice offers download, remove and the Kokoro voices. voice.js itself needs its models from
the network, so the test swaps in a stand-in with the same interface. Must end "voice: N/N"."""
import os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); url = "file://" + os.path.join(here, "www", "index.html")
STUB = """(() => { const real = window.Voice; window.__calls = []; window.__dl = new Set(window.__have || ['natural','piper']);
  window.Voice = Object.assign({}, real, {
    needsDownload: id => !window.__dl.has(id), wifiOnly: () => true, setWifiOnly() {}, status: async () => ({ bytes: 373e6 }),
    mayDownload: () => ({ ok: true }), sizeMb: () => 93, SIZE_MB: 370,
    download: async (id, onB) => { onB({ loaded: 5e6, total: 9e7 }); window.__dl.add(id); },
    remove: async id => { window.__dl.delete(id); },
    player(id, text, o) { const parts = real.pieces(real.prepare(text, 'eng', null)); const c = { id, voice: o.voice, start: o.start || 0, n: parts.length, text }; window.__calls.push(c);
      let i = c.start, dead = false;
      const step = () => { if (dead) return; if (window.__fail) { o.onState('error', { message: 'no model' }); return; }
        if (i >= parts.length) { o.onState('done'); return; } o.onState('piece', { index: i, count: parts.length, text: parts[i] }); i++; setTimeout(step, window.__gap || 40); };
      setTimeout(() => { o.onState('speaking', {}); step(); }, 10);
      return { state: 'speaking', pause() { dead = true; this.state = 'paused'; }, resume() { dead = false; this.state = 'speaking'; step(); }, setRate() {}, stop() { dead = true; } }; } }); })()"""
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
    check("the natural voice reads the section", calls and calls[0]["id"] == "natural" and E("PEARLS.audio.neural"), calls[:1])
    check("with the Kokoro voice chosen", calls and calls[0]["voice"] == "bm_george", calls[:1])
    check("the paragraph being read is marked", E("!!document.querySelector('.reader .spoken')") or E("PEARLS.P.part") > 0)
    pg.wait_for_timeout(4000)
    check("it runs on to the next section by itself", E("PEARLS.P.part") >= 1 and len(E("__calls")) >= 2, (E("PEARLS.P.part"), len(E("__calls"))))
    check("time moves while it reads", E("PEARLS.audio.duration") > 0)
    E("PEARLS.audio.pause()"); E("window.__gap = 400")
    E("PEARLS.audio.currentTime = PEARLS.audio.duration * 0.6"); E("PEARLS.audio.play()"); pg.wait_for_timeout(300)
    last = E("__calls[__calls.length-1]")
    check("seeking starts at a later piece", last["start"] > 0, last)
    E("window.__fail = true; PEARLS.audio.currentTime = 0"); pg.wait_for_timeout(600)
    check("a voice that fails hands over to the device voice", E("PEARLS.audio.speaking && !PEARLS.audio.neural"), (E("PEARLS.audio.speaking"), E("PEARLS.audio.neural")))
    E("PEARLS.audio.pause(); window.__fail = false")
    # Settings → Voice
    E("window.__have = ['piper']"); E(STUB); E("PEARLS.state.prefs.voiceEngine = 'natural'")
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
    check("no page errors", not errs, errs[:3])
    b.close()
print(f"voice: {ok}/{n}")
