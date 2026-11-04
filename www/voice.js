/* Estantes · read-aloud voices. Four choices, each said plainly in the Appearance sheet:

   natural  Kokoro, made on this device (voice-worker.js). The most natural; in English it says the Hebrew
            guttural ḥ, because Hebrew words go in sound by sound (the Pearls heb_ipa rules). English, Spanish,
            French, Italian, Brazilian Portuguese and Hindi from one download (about 370 MB).
            Fast on a computer (measured 1.7–2.4× real time on an M2); on a budget phone it cannot keep up
            (0.4× on a Galaxy A07), and the reader says so with the speed it measured, never silently.
   piper    Piper, made on this device in any browser (piper-worker.js): one voice file per language (about 63 MB),
            much lighter, more robotic, no guttural ḥ; English Hebrew names respelled from voice/lexicon-piper.tsv.
   fast     Android only: whatever engine the phone is set to (the Piper app, Google's), through the app's plugin.
   device   whatever voice the browser or system offers. Always there, quality and languages vary.

   Nothing is downloaded until the reader asks, and on Wi-Fi only unless they say otherwise; every download can be
   removed. Hebrew books read with the device's voice: no Hebrew voice here runs in a browser.

   Every voice reads the same prepared text: bracketed source citations (SA OḤ 167:1) are left out because they
   are for the eye, and Hebrew script inside another language is skipped. */
'use strict';
window.Voice = (() => {
  const UA = navigator.userAgent;
  const ANDROID = /Android/.test(UA);
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const TTS = NATIVE ? (window.Capacitor.Plugins || {}).TextToSpeech : null;
  const SPEECH = 'speechSynthesis' in window;
  const BCP = { eng: 'en-US', por: 'pt-BR', spa: 'es-ES', fra: 'fr-FR', heb: 'he-IL', jpn: 'ja-JP', deu: 'de-DE', ita: 'it-IT',
    hin: 'hi-IN', nld: 'nl-NL', rus: 'ru-RU', cat: 'ca-ES', pol: 'pl-PL', ell: 'el-GR', tur: 'tr-TR' };
  const KEY = 'estante.voice';   // {rtf:{natural, piper}, downloaded:bool, piper:{lang:true}, wifiOnly:bool}
  const SIZE_MB = 370;            // the natural voice on disk, measured: 373 MB (model 326, runtime 22, voices, phonemizer 19)
  const mem = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const remember = f => { const m = mem(); f(m); try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

  // ------------------------------------------------------------ the languages each voice can read
  // Kokoro: one model for all its languages, a small voice file each (English with the Hebrew-ḥ path; the others
  // through eSpeak NG). Piper: one voice file per language (sizes from rhasspy/piper-voices). Neither has a Hebrew
  // or Japanese voice that runs here: Piper's need Phonikud and OpenJTalk, which have no browser build, and eSpeak's
  // eSpeak has no Hebrew, so Hebrew has its own front end (voice-hebrew.js).
  const LANGS = {
    eng: { name: 'English', espeak: 'en-us', piper: 'en_US-lessac-medium', mb: 63,
      kokoro: { am_michael: 'Michael (US)', bf_emma: 'Emma (UK)', af_heart: 'Heart (US)', bm_george: 'George (UK)' } },
    por: { name: 'Portuguese (Brazil)', espeak: 'pt-br', piper: 'pt_BR-faber-medium', mb: 63, kokoro: { pf_dora: 'Dora', pm_alex: 'Alex' } },
    spa: { name: 'Spanish', espeak: 'es', piper: 'es_ES-davefx-medium', mb: 63, kokoro: { ef_dora: 'Dora', em_alex: 'Alex' } },
    fra: { name: 'French', espeak: 'fr-fr', piper: 'fr_FR-siwis-medium', mb: 63, kokoro: { ff_siwis: 'Siwis' } },
    ita: { name: 'Italian', espeak: 'it', piper: 'it_IT-paola-medium', mb: 64, kokoro: { if_sara: 'Sara', im_nicola: 'Nicola' } },
    hin: { name: 'Hindi', espeak: 'hi', piper: 'hi_IN-priyamvada-medium', mb: 64, kokoro: { hf_alpha: 'Alpha', hm_omega: 'Omega' } },
    deu: { name: 'German', piper: 'de_DE-thorsten-medium', mb: 63 },
    nld: { name: 'Dutch', piper: 'nl_NL-alex-medium', mb: 64 },
    rus: { name: 'Russian', piper: 'ru_RU-irina-medium', mb: 63 },
    cat: { name: 'Catalan', piper: 'ca_ES-upc_ona-medium', mb: 63 },
    pol: { name: 'Polish', piper: 'pl_PL-gosia-medium', mb: 63 },
    ell: { name: 'Greek', piper: 'el_GR-rapunzelina-medium', mb: 63 },
    tur: { name: 'Turkish', piper: 'tr_TR-dfki-medium', mb: 63 },
    // every other language Piper has a voice for whose sounds come from eSpeak (checked 2026-11-01 against each voice's
    // config and the bundled eSpeak data). Japanese, Lithuanian and Thai voices need their own phonemizers, so they are not here.
    ara: { name: 'Arabic', piper: 'ar_JO-kareem-medium', mb: 63 },
    bul: { name: 'Bulgarian', piper: 'bg_BG-dimitar-medium', mb: 63 },
    ben: { name: 'Bengali', piper: 'bn_BD-google-medium', mb: 77 },
    ces: { name: 'Czech', piper: 'cs_CZ-jirka-medium', mb: 63 },
    cym: { name: 'Welsh', piper: 'cy_GB-gwryw_gogleddol-medium', mb: 64 },
    dan: { name: 'Danish', piper: 'da_DK-talesyntese-medium', mb: 63 },
    est: { name: 'Estonian', piper: 'et_EE-news-medium', mb: 77 },
    eus: { name: 'Basque', piper: 'eu_ES-maider-medium', mb: 64 },
    fas: { name: 'Persian', piper: 'fa_IR-gyro-medium', mb: 63 },
    fin: { name: 'Finnish', piper: 'fi_FI-harri-medium', mb: 63 },
    hun: { name: 'Hungarian', piper: 'hu_HU-anna-medium', mb: 63 },
    hye: { name: 'Armenian', piper: 'hy_AM-gor-medium', mb: 64 },
    ind: { name: 'Indonesian', piper: 'id_ID-news_tts-medium', mb: 63 },
    isl: { name: 'Icelandic', piper: 'is_IS-salka-medium', mb: 76 },
    kat: { name: 'Georgian', piper: 'ka_GE-natia-medium', mb: 63 },
    kaz: { name: 'Kazakh', piper: 'kk_KZ-issai-high', mb: 128 },
    kor: { name: 'Korean', piper: 'ko_KR-kss-medium', mb: 63 },
    kmr: { name: 'Kurdish (Kurmanji)', piper: 'ku_TR-berfin_renas-medium', mb: 77 },
    ltz: { name: 'Luxembourgish', piper: 'lb_LU-marylux-medium', mb: 63 },
    lav: { name: 'Latvian', piper: 'lv_LV-aivars-medium', mb: 64 },
    mal: { name: 'Malayalam', piper: 'ml_IN-meera-medium', mb: 63 },
    mar: { name: 'Marathi', piper: 'mr_IN-google-medium', mb: 77 },
    nep: { name: 'Nepali', piper: 'ne_NP-chitwan-medium', mb: 63 },
    nor: { name: 'Norwegian', piper: 'no_NO-talesyntese-medium', mb: 63 },
    ron: { name: 'Romanian', piper: 'ro_RO-mihai-medium', mb: 63 },
    slk: { name: 'Slovak', piper: 'sk_SK-lili-medium', mb: 63 },
    slv: { name: 'Slovenian', piper: 'sl_SI-artur-medium', mb: 63 },
    sqi: { name: 'Albanian', piper: 'sq_AL-edon-medium', mb: 64 },
    srp: { name: 'Serbian', piper: 'sr_RS-serbski_institut-medium', mb: 77 },
    swe: { name: 'Swedish', piper: 'sv_SE-lisa-medium', mb: 64 },
    swa: { name: 'Swahili', piper: 'sw_CD-lanfrica-medium', mb: 63 },
    tel: { name: 'Telugu', piper: 'te_IN-padmavathi-medium', mb: 64 },
    ukr: { name: 'Ukrainian', piper: 'uk_UA-tetiana-high', mb: 114 },
    urd: { name: 'Urdu', piper: 'ur_PK-aegis_female-medium', mb: 64 },
    vie: { name: 'Vietnamese', piper: 'vi_VN-vais1000-medium', mb: 63 },
    zho: { name: 'Chinese (Mandarin)', piper: 'zh_CN-huayan-medium', mb: 63 },
    // Hebrew through Phonikud (voice-hebrew.js): Shaul, trained on SASpeech, licensed for NON-COMMERCIAL use only;
    // Modern Israeli pronunciation; Nakdimon adds vowels to unpointed text. 63.5 MB voice + 21 MB Nakdimon.
    heb: { name: 'Hebrew', piper: 'he_IL-shaul-phonikud', mb: 85, nc: true, kokoroHe: { he_shaul: 'Shaul' } },
  };
  const RUNTIME_MB = 30;   // Piper's runtime and the phonemizer, shared by every Piper language
  const KOKORO_ALL = Object.values(LANGS).flatMap(l => Object.keys(l.kokoro || {}));
  const kokoroIn = lang => Object.entries(LANGS).filter(([, l]) => l.kokoro).map(([, l]) => l.name);
  const piperHas = lang => !!mem().piper?.[lang];
  const KOKORO_HE_MB = 370;   // Kokoro Hebrew: model 326 MB, its WebGPU runtime 22 MB, Nakdimon 21 MB
  const naturalHas = lang => lang === 'heb' ? !!mem().kokoroHe : !!mem().downloaded;
  const VOICES = LANGS.eng.kokoro;   // kept for callers that list the English voices
  const voicesFor = lang => LANGS[lang]?.kokoro || LANGS[lang]?.kokoroHe || {};

  // ------------------------------------------------------------ the choices, and what to say about each
  function choices(lang) {
    const L = LANGS[lang], rtf = mem().rtf || {};
    const out = [{
      id: 'natural', label: 'Natural voice', engine: 'Kokoro',
      ok: !!(L?.kokoro || L?.kokoroHe), why: L?.kokoro || L?.kokoroHe ? '' : `Kokoro reads ${kokoroIn().join(', ')} and Hebrew; not ${L?.name || 'this language'}.`,
      text: lang === 'heb'
        ? 'Kokoro trained on Hebrew (Shaul), the most natural Hebrew voice here. Modern Israeli pronunciation. Made on this device; '
          + 'fast on a computer, too slow for a phone. Pointed text reads best. Licensed for non-commercial use only. '
          + 'Hebrew sounds by Phonikud (CC BY 4.0), vowels by Nakdimon (MIT). '
          + (mem().kokoroHe ? '' : `A separate download of about ${KOKORO_HE_MB} MB.`)
        : 'The most natural voice' + (lang === 'eng' ? ', and it says the Hebrew guttural ḥ' : '') + '. Made on this device, nothing is sent anywhere. '
        + (rtf.natural ? `Measured here: ${rtf.natural.toFixed(1)}× real time${rtf.natural < 1 ? ', too slow to read without pauses on this device' : ''}. ` : '')
        + (ANDROID || /iPhone|iPad/.test(UA) ? 'On most phones it is slower than speech, so expect pauses between sentences. ' : 'Fast on a computer. ')
        + (mem().downloaded ? '' : `Not on this device yet: one download of about ${SIZE_MB} MB covers all its languages.`),
    }, {
      id: 'piper', label: 'Fast voice', engine: 'Piper',
      ok: !!L?.piper, why: L?.piper ? '' : `Piper has no voice here for ${L?.name || 'this language'}.`,
      text: (lang === 'heb'
          ? 'A Hebrew voice (Shaul, from the Phonikud project), made on this device. Modern Israeli pronunciation. Pointed text reads best; '
            + 'unpointed text gets its vowels from Nakdimon, which sometimes guesses wrong. Licensed for non-commercial use only. '
            + 'Hebrew sounds by Phonikud (CC BY 4.0), vowels by Nakdimon (MIT). '
          : 'Made on this device too, on any computer or phone, and much lighter than the natural voice. More robotic, no guttural ḥ'
            + (lang === 'eng' ? ' (Hebrew names are respelled so it says them right)' : '') + '. ')
        + (rtf.piper ? `Measured here: ${rtf.piper.toFixed(1)}× real time. ` : '')
        + (piperHas(lang) ? '' : `${L?.name || 'This language'} is a separate download: about ${(L?.mb || 63) + (Object.keys(mem().piper || {}).length ? 0 : RUNTIME_MB)} MB.`),
    }];
    if (ANDROID) out.push({
      id: 'fast', label: 'Phone’s speech engine', engine: '',
      ok: NATIVE ? !!TTS : SPEECH, why: NATIVE && !TTS ? 'This version of the app has no speech plugin.' : '',
      text: 'Whatever text-to-speech engine Android is set to, for example the Piper app (sherpa-onnx) or Google’s. '
        + 'Set it under Settings → General management → Text-to-speech → Preferred engine. It reads Hebrew if that engine does.',
    });
    if (!NATIVE || !ANDROID) out.push({
      id: 'device', label: 'This device’s voice', engine: '',
      ok: SPEECH, why: SPEECH ? '' : 'This browser has no voice.',
      text: 'Always available. How it sounds, and which languages it reads, depends on the device.',
    });
    return out;
  }
  // the best that works here, when the reader's saved choice does not. A downloaded voice first; nothing that needs a download
  function fallback(lang, want) {
    const cs = choices(lang).filter(c => c.ok), has = id => id === 'natural' ? naturalHas(lang) : id === 'piper' ? piperHas(lang) : true;
    const phone = ANDROID || /iPhone|iPad/.test(UA);
    return cs.find(c => c.id === want)
      || (phone ? ['piper', 'natural', 'fast', 'device'] : ['natural', 'piper', 'device']).map(id => cs.find(c => c.id === id && has(id))).find(Boolean)
      || cs.at(-1) || null;
  }

  // ------------------------------------------------------------ text for the ear
  const lexicons = {};
  async function lexicon(name) {
    if (lexicons[name]) return lexicons[name];
    let rows = [];
    try {
      const t = await (await fetch(`voice/lexicon-${name}.tsv`)).text();
      rows = t.split('\n').filter(l => l.trim() && !l.startsWith('#') && l.includes('\t')).map(l => l.split('\t').map(s => s.trim()));
    } catch {}
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (lexicons[name] = rows.flatMap(([a, b]) => [[a, b], [a[0].toUpperCase() + a.slice(1), b[0].toUpperCase() + b.slice(1)]])
      .map(([a, b]) => [new RegExp(`(?<![\\w-])${esc(a)}(?![\\w-])`, 'g'), b])
      .sort((x, y) => y[0].source.length - x[0].source.length));   // longest first: "Birkat Ha-mazon" before "Birkat"
  }
  function prepare(text, lang, lex) {
    let t = text.replace(/\s*\((?=[^()]*\d+:\d+)[^()]*\)/g, '').replace(/\s*\[(?=[^\[\]]*\d+:\d+)[^\[\]]*\]/g, '');   // (SA OḤ 167:1)
    if (lang !== 'heb') t = t.replace(/[֐-׿יִ-ﭏ][֐-׿יִ-ﭏ\s'"׳״־-]*/g, ' ');
    for (const [rx, b] of lex || []) t = t.replace(rx, b);
    t = t.replace(/[ḳḲ]/g, 'k').replace(/[ʿʾ­]/g, '');
    if (lang === 'eng') t = t.replace(/(?<=[A-Za-z])['’](?!(?:ll|re|ve|s|t|d|m)\b)(?=[a-z]{2,})/g, '-');   // Sha'arei -> Sha-arei
    // a line that ends without a stop (a heading) gets one, so the voice pauses instead of running on
    return t.replace(/([^.!?…:;\u05c3\s])[ \t]*\n\s*/g, '$1. ').replace(/\s+/g, ' ').trim();
  }
  // pieces start short and grow: a piece plays only once it is fully made, so the next one must be ready before the
  // current one ends. Measured on a Galaxy A07: after a one-second title, a 280-character paragraph left a long
  // silence while it was made. Short at first, the later pieces are made while the early ones are heard.
  const RAMP = [40, 60, 90, 140, 200];   // the first piece is a phrase: at 1.4× real time (Galaxy A07, Piper Hebrew) 90 characters took 3.4 s to make
  function pieces(text, limit = 280) {
    const out = []; let cur = '';
    // limits are in letters: niqqud and te'amim are characters too, and would halve a pointed piece
  const k = text.length / Math.max(1, text.replace(/\p{M}/gu, '').length);
  const lim = () => Math.round(k * Math.min(limit, RAMP[out.length] ?? limit));
    // Hebrew has no capitals, so a Hebrew letter after the stop also starts a sentence; sof pasuq ends one too
    for (let s of text.split(/(?<=[.!?…;:׃])\s+(?=["“‘'A-Z0-9(א-ת])/)) {
      if (cur && cur.length + s.length + 1 > lim()) { out.push(cur); cur = ''; }
      while (s.length > lim()) {   // a sentence too long for this piece: break it at a comma, or a space
        const L = lim(), c = s.lastIndexOf(', ', L), sp = s.lastIndexOf(' ', L);
        const at = c > L / 3 ? c + 1 : sp > L / 3 ? sp : L;
        if (cur) { out.push(cur); cur = ''; }
        out.push(s.slice(0, at).trim()); s = s.slice(at).trim();
      }
      cur = (cur + ' ' + s).trim();
    }
    if (cur) out.push(cur);
    return out.filter(p => /[\p{L}\p{N}]/u.test(p));   // \w is ASCII: it threw away every Hebrew piece
  }

  // ------------------------------------------------------------ Hebrew sound by sound (Pearls heb_ipa, ported unchanged)
  const HEB_WORD = /[A-Za-zḤḥĥĤ'’]*(?:[ḥĥḤĤ]|[Kk]h)[A-Za-zḤḥĥĤ'’]*(?:-[A-Za-zḤḥĥĤ'’]+)*|[A-Za-z]+-[A-Za-zḤḥĥĤ'’]*(?:[ḥĥḤĤ]|kh)[A-Za-zḤḥĥĤ'’]*/g;
  const G2P = [['Y', 'j'], ['tch', 'tʃ'], ['kh', 'x'], ['ch', 'x'], ['ḥ', 'x'], ['ĥ', 'x'], ['tz', 'ts'], ['ts', 'ts'], ['sh', 'ʃ'], ['zh', 'ʒ'],
    ['ei', 'eɪ'], ['ay', 'aɪ'], ['ai', 'aɪ'], ['oi', 'ɔɪ'], ['ee', 'iː'], ['oo', 'uː'],
    ['a', 'ɑː'], ['e', 'ɛ'], ['i', 'iː'], ['o', 'oʊ'], ['u', 'uː'],
    ['b', 'b'], ['d', 'd'], ['f', 'f'], ['g', 'ɡ'], ['h', 'h'], ['j', 'dʒ'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'],
    ['p', 'p'], ['q', 'k'], ['r', 'ɹ'], ['s', 's'], ['t', 't'], ['v', 'v'], ['w', 'v'], ['x', 'ks'], ['y', 'j'], ['z', 'z'], ["'", ''], ['’', '']];
  const VOW = new Set(['ɑː', 'ɛ', 'iː', 'oʊ', 'uː', 'eɪ', 'aɪ', 'ɔɪ']);
  function hebIpa(word) {
    return word.toLowerCase().split('-').map(part => {
      const w = part.replace(/([bdfgklmnprstvz])\1/g, '$1').replace(/(?<=[ae])y(?=[aeiou])/g, 'Y'); const toks = []; let i = 0;
      while (i < w.length) { const hit = G2P.find(([a]) => w.startsWith(a, i)); if (hit) { toks.push(hit[1]); i += hit[0].length; } else i++; }
      if (toks.length > 1 && toks.at(-1) === 'h' && VOW.has(toks.at(-2))) toks.pop();                // final -ah: silent h
      const vs = toks.map((t, k) => VOW.has(t) ? k : -1).filter(k => k >= 0);
      if (vs.length && (vs.length > 1 || part.length > 2)) { let k = vs.at(-1); if (k > 0 && !VOW.has(toks[k - 1])) k--; toks.splice(k, 0, 'ˈ'); }  // stress the last syllable
      return toks.join('');
    }).join(' ');
  }

  // ------------------------------------------------------------ the voices made on this device
  // one small wrapper per worker: Kokoro (voice-worker.js) and Piper (piper-worker.js)
  function engine(file) {
    const e = { worker: null, ready: null, key: '', seq: 0, waiting: new Map(), cb: {} };
    e.ask = (msg, transfer) => { const id = ++e.seq; return new Promise((res, rej) => { e.waiting.set(id, { res, rej }); e.worker.postMessage({ ...msg, id }, transfer || []); }); };
    e.stop = () => { e.worker?.terminate(); e.worker = null; e.ready = null; e.key = ''; for (const w of e.waiting.values()) w.rej(new Error('stopped')); e.waiting.clear(); };
    e.load = (msg, key, cb = {}) => {
      if (e.ready && e.key === key) return e.ready;
      if (!e.worker) {
        e.worker = new Worker(file, { type: 'module' });
        e.worker.onmessage = ({ data: m }) => {
          if (m.type === 'progress') e.cb.onProgress?.(m);
          else if (m.type === 'bytes') e.cb.onBytes?.(m);
          else if (m.type === 'ready') e.pending?.res(m);
          else if (m.id && e.waiting.has(m.id)) { const w = e.waiting.get(m.id); e.waiting.delete(m.id); m.type === 'error' ? w.rej(new Error(m.message)) : w.res(m); }
          else if (m.type === 'error') { const p = e.pending; e.stop(); p?.rej(new Error(m.message)); }
        };
      }
      e.key = key; e.cb = cb;
      e.ready = new Promise((res, rej) => { e.pending = { res, rej }; e.worker.postMessage(msg); });
      e.ready.catch(() => {});
      return e.ready;
    };
    return e;
  }
  const KK = engine('voice-worker.js'), PP = engine('piper-worker.js'), KH = engine('kokoro-he-worker.js');
  const loadKokoroHe = ({ net = false, onBytes } = {}) => KH.load({ type: 'load', net }, 'he', { onBytes });
  // WebGPU where there is one (2.4× on an M2); otherwise CPU at full precision, which measured faster than q8
  const loadNatural = (onProgress, { net = false, onBytes } = {}) =>
    KK.load({ type: 'load', device: navigator.gpu ? 'webgpu' : 'wasm', dtype: 'fp32', net, voices: KOKORO_ALL }, 'kokoro', { onProgress, onBytes });
  const loadPiper = (lang, { net = false, onBytes, warm = false } = {}) => PP.load({ type: 'load', voice: LANGS[lang].piper, net, warm }, LANGS[lang].piper, { onBytes });
  async function naturalPhonemes(text, lang) {
    if (lang !== 'eng') return (await KK.ask({ type: 'phonemize', text, espeak: LANGS[lang].espeak })).phonemes;
    const out = []; let pos = 0;
    for (const m of text.matchAll(HEB_WORD)) {
      if (m.index > pos) out.push((await KK.ask({ type: 'english', text: text.slice(pos, m.index) })).phonemes);
      out.push(hebIpa(m[0])); pos = m.index + m[0].length;
    }
    if (pos < text.length) out.push((await KK.ask({ type: 'english', text: text.slice(pos) })).phonemes);
    return out.map(s => s.trim()).filter(Boolean).join(' ').replace(/\s+([;:,.!?])/g, '$1');
  }

  // ------------------------------------------------------------ downloads: only when asked
  // The reader's own choice, and Wi-Fi only unless they say otherwise. Phones say what network they are on
  // (navigator.connection.type); computers and iPhones do not, and then the reader is asked rather than guessed for.
  function network() {
    const c = navigator.connection;
    if (!navigator.onLine) return 'none';
    if (!c || !c.type || c.type === 'unknown') return ANDROID || /iPhone|iPad/.test(UA) ? 'unknown' : 'computer';
    return ['wifi', 'ethernet'].includes(c.type) ? 'wifi' : c.type === 'none' ? 'none' : 'cellular';
  }
  const wifiOnly = () => mem().wifiOnly !== false;
  // {ok, ask?, why}: ok to start; ask = start only after the reader confirms; why = said either way
  function mayDownload(mb = SIZE_MB) {
    const n = network();
    if (n === 'none') return { ok: false, why: 'This device is offline.' };
    if (!wifiOnly() || n === 'wifi' || n === 'computer') return { ok: true, why: '' };
    if (n === 'cellular') return { ok: false, why: `You are on mobile data, and voices download on Wi-Fi only. Connect to Wi-Fi, or turn off “Download voices on Wi-Fi only” in Aa → Voice downloads.` };
    return { ok: true, ask: true, why: `This device does not say whether it is on Wi-Fi. This download is about ${mb} MB.` };
  }
  const downloading = {};   // 'natural' | 'piper:<lang>' → promise
  const total = m => { let n = 0; for (const f of m.values()) n += f.loaded; return n; };
  // what = 'natural' or 'piper'; lang for piper
  function download(what, onBytes, lang) {
    if (typeof what === 'function') { onBytes = what; what = 'natural'; }   // the older call: download(onBytes)
    const key = what === 'piper' ? 'piper:' + lang : lang === 'heb' ? 'natural:heb' : 'natural';
    if (downloading[key]) return downloading[key];
    navigator.storage?.persist?.().catch(() => {});   // so the browser does not clear it when space runs low
    const files = new Map(), size = sizeMb(what, lang);
    const onB = m => { files.set(m.url, m); onBytes?.({ loaded: total(files), total: size * 1e6 }); };
    let job;
    if (what === 'piper') {
      PP.stop();
      job = loadPiper(lang, { net: true, onBytes: onB }).then(() => remember(s => { (s.piper ||= {})[lang] = true; }));
    } else if (lang === 'heb') {
      KH.stop();
      job = loadKokoroHe({ net: true, onBytes: onB }).then(() => remember(s => { s.kokoroHe = true; }));
    } else {
      if (!mem().downloaded) KK.stop();
      job = loadNatural(null, { net: true, onBytes: onB }).then(() => remember(s => { s.downloaded = true; }));
    }
    return (downloading[key] = job.finally(() => { delete downloading[key]; }));
  }
  const sizeMb = (what, lang) => what === 'piper' ? (LANGS[lang]?.mb || 63) + (Object.keys(mem().piper || {}).some(l => l !== lang) ? 0 : lang === 'heb' ? 11 : RUNTIME_MB)
    : lang === 'heb' ? KOKORO_HE_MB : SIZE_MB;
  const files = () => import('./voice-files.js');
  const storeMod = () => import('./voice-store.js');
  // is it really there? the flags can outlive the files (the browser may clear storage)
  async function status() {
    let all = [], F = null;
    try { [all, F] = [await (await storeMod()).files(), await files()]; } catch {}
    const have = new Map(all.filter(f => f.done).map(f => [f.url, f.size]));
    const sum = urls => urls.reduce((a, u) => a + (have.get(u) || 0), 0);
    const kBytes = all.filter(f => f.done && F?.KOKORO.test(f.url)).reduce((a, f) => a + f.size, 0);
    const natural = kBytes > 300e6 && !!F && F.PHONEMIZER.every(u => have.has(u));   // a Kokoro from before the other languages still needs the phonemizer
    const piper = {};
    for (const [code, L] of Object.entries(LANGS)) if (L.piper && F) {
      const v = F.piperVoice(L.piper);
      // Hebrew makes its sounds with voice-hebrew.js, so it needs the runtime but not the eSpeak phonemizer
      const runtime = F.PIPER_RUNTIME.filter(u => code !== 'heb' || !F.PHONEMIZER.includes(u)).every(u => have.has(u));
      piper[code] = { name: L.name, mb: L.mb, downloaded: runtime && v.every(u => have.has(u)), bytes: sum(v), downloading: !!downloading['piper:' + code] };
    }
    const heFiles = F ? [...F.KOKORO_HE, ...F.KOKORO_HE_RUNTIME, F.NAKDIMON] : [];
    const kokoroHe = heFiles.length > 0 && heFiles.every(u => have.has(u));
    remember(s => { s.downloaded = natural; s.kokoroHe = kokoroHe; s.piper = Object.fromEntries(Object.entries(piper).filter(([, p]) => p.downloaded).map(([c]) => [c, true])); });
    return { downloaded: natural, bytes: kBytes + (natural ? sum(F?.PHONEMIZER || []) : 0), downloading: !!downloading.natural, piper,
      kokoroHe: { downloaded: kokoroHe, bytes: sum(heFiles), downloading: !!downloading['natural:heb'] },
      runtimeBytes: F ? sum(F.PIPER_RUNTIME) : 0, wifiOnly: wifiOnly(), network: network() };
  }
  async function remove(what = 'natural', lang) {
    const S = await storeMod(), F = await files(), all = (await S.files()).map(f => f.url);
    const others = Object.keys(mem().piper || {}).filter(l => !(what === 'piper' && l === lang));
    const keepPhon = what === 'piper' ? !!mem().downloaded || others.length > 0 : others.length > 0;
    let drop;
    if (what === 'natural' && lang === 'heb') {
      KH.stop();
      drop = [...F.KOKORO_HE, ...F.KOKORO_HE_RUNTIME].concat(mem().piper?.heb ? [] : [F.NAKDIMON]);   // Nakdimon stays while Hebrew Piper needs it
      remember(s => { s.kokoroHe = false; });
    } else if (what === 'piper') {
      PP.stop();
      drop = F.piperVoice(LANGS[lang].piper);
      if (lang === 'heb' && mem().kokoroHe) drop = drop.filter(u => u !== F.NAKDIMON);   // Nakdimon stays while Kokoro Hebrew needs it
      if (!others.length) drop = drop.concat(F.PIPER_RUNTIME.filter(u => !(keepPhon && F.PHONEMIZER.includes(u))));   // the phonemizer stays while Kokoro needs it
      remember(s => { if (s.piper) delete s.piper[lang]; });
    } else {
      KK.stop();
      drop = all.filter(u => F.KOKORO.test(u)).concat(keepPhon ? [] : F.PHONEMIZER);
      for (const k of ['transformers-cache', 'kokoro-voices']) await caches?.delete(k).catch(() => {});
      remember(s => { s.downloaded = false; });
    }
    for (const u of drop) if (all.includes(u)) await S.remove(u);
  }

  // ------------------------------------------------------------ the player: one object, whichever voice
  // opts: {lang, rate, volume, voice (Kokoro voice name), start (piece to begin at), onState(state, info)}
  // states: loading · speaking · paused · slow · piece {index, count, text} · done · stopped · error
  // A piece is a sentence or two. Back and forward move by piece. A new speed or a skip restarts the current
  // piece, because neither engine can change speed half way through a sentence it has already made.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function player(id, text, opts = {}) {
    const lang = opts.lang || 'eng', emit = (s, i) => opts.onState?.(s, i);
    let parts = [], next = 0, gen = 0, state = 'loading', rate = opts.rate || 1, volume = opts.volume ?? 1, stale = false, shown = -1, warned = false;
    let sched = [];   // natural: what is already queued to play, [{i, at, end, src}]
    // made now, inside the tap, or the browser may keep it muted until another tap
    const neural = id === 'natural' || id === 'piper';
    const ctx = neural ? new AudioContext() : null;
    const gain = ctx?.createGain();
    if (ctx) { gain.gain.value = volume; gain.connect(ctx.destination); ctx.resume().catch(() => {}); }
    const set = (s, i) => { state = s; emit(s, i); };
    const now = () => {
      if (!ctx) return Math.min(next, parts.length - 1);
      const t = ctx.currentTime, s = sched.find(x => t >= x.at && t < x.end) || sched.find(x => t < x.at);
      return s ? s.i : Math.min(next, parts.length - 1);
    };
    const tell = () => { const i = now(); if (i !== shown && i >= 0 && parts[i]) { shown = i; emit('piece', { index: i, count: parts.length, text: parts[i] }); } };
    const ticker = ctx ? setInterval(tell, 250) : 0;

    function cancel() {
      gen++;
      if (ctx) { for (const x of sched) { try { x.src.stop(); } catch {} } sched = []; }
      else if (TTS) TTS.stop().catch(() => {});
      else if (SPEECH) speechSynthesis.cancel();
    }
    async function run(from) {
      cancel(); const g = gen; next = Math.max(0, Math.min(from, parts.length - 1)); shown = -1; stale = false;
      try {
        if (ctx) await made(g); else await system(g);
        if (g === gen) { set('done'); }
      } catch (e) { if (g === gen) set('error', { message: e.message }); }
    }

    // the voices made on this device: each piece is made, then queued to play, staying under a minute ahead
    async function made(g) {
      const isP = id === 'piper', isH = id === 'natural' && lang === 'heb', has = isP ? piperHas(lang) : naturalHas(lang);
      if (!has) throw new Error(isP ? `the fast voice for ${LANGS[lang]?.name || 'this language'} is not downloaded on this device` : 'the natural voice is not downloaded on this device');
      if (state === 'loading') { set('loading'); }
      const t0 = performance.now();
      if (isP) await loadPiper(lang); else if (isH) await loadKokoroHe(); else await loadNatural(p => g === gen && emit('loading', p));
      if (g !== gen) return;
      const readyS = (performance.now() - t0) / 1000;   // 0 when it was already warm
      let playAt = 0, audioS = 0, genS = 0, first = true, count = 0;
      const kvoice = opts.voice && voicesFor(lang)[opts.voice] ? opts.voice : Object.keys(voicesFor(lang))[0];
      for (; next < parts.length; next++) {
        while (g === gen && playAt - ctx.currentTime > 45) await sleep(400);
        if (g !== gen) return;
        const i = next;
        const a = isP ? await PP.ask({ type: 'say', text: parts[i], rate }) : isH ? await KH.ask({ type: 'say', text: parts[i], rate })
          : await KK.ask({ type: 'say', phonemes: await naturalPhonemes(parts[i], lang), voice: kvoice, speed: rate });
        if (g !== gen) return;
        const buf = ctx.createBuffer(1, a.samples.length, a.rate); buf.copyToChannel(a.samples, 0);
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(gain);
        const at = Math.max(ctx.currentTime + 0.05, playAt); src.start(at); playAt = at + buf.duration;
        sched = sched.filter(x => x.end > ctx.currentTime - 1).concat({ i, at, end: playAt, src });
        // how long the reader waited, and on what: said when it is long enough to notice
        if (first) { first = false; if (state !== 'paused') set('speaking', { readyS, firstS: (performance.now() - t0) / 1000 - readyS }); tell(); }
        audioS += buf.duration; genS += a.genS;
        // measured, then said: after two pieces the speed is known, and slower than speech means pauses
        if (++count === 2) {
          const rtf = audioS / genS; remember(s => { (s.rtf ||= {})[id] = rtf; });
          if (rtf < 1 && !warned) { warned = true; emit('slow', { rtf }); }
        }
      }
      while (g === gen && ctx.currentTime < playAt) await sleep(250);
    }

    async function system(g) {
      const bcp = BCP[lang] || 'en-US';
      if (!TTS && !SPEECH) throw new Error('this browser has no voice');
      set('speaking');
      for (; next < parts.length; next++) {
        if (g !== gen) return;
        tell();
        const p = parts[next];
        if (TTS) await TTS.speak({ text: p, lang: bcp, rate, pitch: 1, volume, category: 'playback' }).catch(() => {});
        // one utterance per piece: some browsers stop a long utterance after about fifteen seconds
        else await new Promise(res => { const u = new SpeechSynthesisUtterance(p); u.lang = bcp; u.rate = rate; u.volume = volume; u.onend = u.onerror = res; speechSynthesis.speak(u); });
        if (g !== gen) return;
      }
    }

    const api = {
      get state() { return state; }, get count() { return parts.length; }, get index() { return now(); },
      get rate() { return rate; }, get volume() { return volume; }, engine: id,
      pause() {
        if (!['speaking', 'loading'].includes(state)) return;
        if (ctx) ctx.suspend().catch(() => {}); else { const i = now(); cancel(); next = i; }
        set('paused');
      },
      resume() {
        if (state === 'done') return void run(0);
        if (state !== 'paused') return;
        if (ctx && !stale) { ctx.resume().catch(() => {}); set(sched.length ? 'speaking' : 'loading'); }
        else { ctx?.resume().catch(() => {}); run(now()); }
      },
      toggle() { state === 'paused' || state === 'done' ? api.resume() : api.pause(); },
      seek(i) {
        if (!parts.length) return;
        const paused = state === 'paused';
        if (ctx && paused) ctx.resume().catch(() => {});
        run(i);
      },
      skip(d) { api.seek(now() + d); },
      setRate(r) {
        rate = Math.max(0.5, Math.min(2.5, Math.round(r * 100) / 100));
        if (state === 'paused') stale = true; else if (state === 'speaking') run(now());
        return rate;
      },
      setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (gain) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);   // the natural voice changes at once
        return volume;                                                       // the others from the next piece
      },
      stop() { cancel(); clearInterval(ticker); ctx?.close().catch(() => {}); set('stopped'); },
    };
    (async () => {
      try {
        const lex = lang !== 'eng' ? null : id === 'fast' || id === 'piper' ? await lexicon('piper') : id === 'natural' ? await lexicon('kokoro') : null;
        parts = pieces(prepare(text, lang, lex));
        if (!parts.length) return set('done');
        run(opts.start || 0);
      } catch (e) { set('error', { message: e.message }); }
    })();
    return api;
  }
  const speak = player;

  status().catch(() => {});   // a flag from an older version can say downloaded when the files are not here

  // ------------------------------------------------------------ what language is this text in?
  // The book's tag is often missing or wrong (Calibre defaults to the library's language), so read-aloud looks at the
  // page itself. A script that belongs to one language decides it; Latin text is scored on its commonest words.
  // Returns a code in LANGS, or '' when it cannot tell — never a guess dressed as an answer.
  const STOP = {
    eng: 'the and of to is that it was for with as his on be at by this had not are but from have',
    por: 'que não uma com para os as do da dos das em por mais como foi ele ela seu sua isso',
    spa: 'que el los las una con para por del se como pero más fue ella sus este esta muy también',
    fra: 'le les des une est dans que pour pas qui sur avec il elle sont mais du au cette nous vous',
    ita: 'il che di della non una per con sono gli alla del anche come questo nel più era',
    deu: 'der die und das ist nicht ein eine mit sich auf den dem des zu für von auch wie wir',
    nld: 'de het een van en niet dat zijn met voor op ook maar als wordt aan bij zij er',
    cat: 'que els les una amb per del dels però com és més aquest seva són també',
    pol: 'nie się jest że na do to jak ale za po od czy tak już jego jej przez',
    tur: 've bir bu da de için ile ne çok daha gibi olan ama değil o ben sen',
    ces: 'je se na že to jako ale jsou pro byl jeho jsem také podle když',
    slk: 'je sa na že to ako ale sú pre bol jeho som tiež alebo keď',
    ron: 'și este că de la cu nu pe un o să din mai care sunt fost',
    hun: 'és a az hogy nem egy is van meg csak de ez azt már mint',
    swe: 'och att det som en är på för med inte av till har jag var hon han sig',
    dan: 'og at det som en er på for med ikke af til har jeg var havde noget meget mig efter',
    nor: 'og at det som en er på for med ikke av til har jeg var hadde noe veldig meg etter',
    fin: 'ja on ei se että oli hän mutta kun tai niin myös ovat',
    ind: 'yang dan di dengan untuk ini itu dari tidak akan pada juga',
    lav: 'un ir ka no ar par uz bet kas tas viņš',
    est: 'ja on ei et see oli kui aga ka mis',
    eus: 'eta da ez du bat ere baina zen dira',
    cym: 'a y yn ac i o ar yr mae ei roedd',
    isl: 'og að er það ekki á í var sem við',
    swa: 'na ya wa kwa ni katika la za hii',
    vie: 'và của là có không những một các được người',
    sqi: 'dhe të në një që është për me nga',
    slv: 'in je da se na ki za v so ne',
    ltz: 'an de déi den ass net mat vun',
  };
  const STOPSETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));
  const OWN = new Map(); for (const [k, set] of Object.entries(STOPSETS)) for (const w of set) OWN.set(w, OWN.has(w) ? '' : k);
  function detect(text) {
    const t = String(text || '').slice(0, 4000), n = re => (t.match(re) || []).length;
    const letters = n(/\p{L}/gu); if (letters < 20) return '';
    const share = re => n(re) / letters;
    if (share(/[א-ת]/g) > .3) return 'heb';
    if (share(/[؀-ۿ]/g) > .3) return n(/[ٹڈڑےں]/g) > 2 ? 'urd' : n(/[پچژگک]/g) > 2 ? 'fas' : 'ara';
    if (share(/[Ѐ-ӿ]/g) > .3) return n(/[іїєґ]/gi) > 2 ? 'ukr' : n(/[ђћџљњ]/gi) > 0 ? 'srp' : n(/ы/gi) === 0 && n(/ъ/gi) > 2 ? 'bul' : n(/[қңғүұһө]/gi) > 2 ? 'kaz' : 'rus';
    if (share(/[Ͱ-Ͽἀ-῿]/g) > .3) return 'ell';
    if (share(/[԰-֏]/g) > .3) return 'hye';
    if (share(/[Ⴀ-ჿ]/g) > .3) return 'kat';
    if (share(/[ঀ-৿]/g) > .3) return 'ben';
    if (share(/[ఀ-౿]/g) > .3) return 'tel';
    if (share(/[ഀ-ൿ]/g) > .3) return 'mal';
    if (share(/[가-힯]/g) > .3) return 'kor';
    if (share(/[一-鿿]/g) > .3) return 'zho';
    if (share(/[ऀ-ॿ]/g) > .3) return 'hin';   // Marathi and Nepali share the script; the book's tag settles those
    if (share(/[a-zà-ÿāăąćčďēęěğīıłńňőœřśşšťūůűźżžơưạ-ỹ]/giu) < .6) return '';
    const words = t.toLowerCase().match(/\p{L}+/gu) || [];
    let best = '', top = 0, second = 0;
    for (const [k, set] of Object.entries(STOPSETS)) {
      let c = 0; for (const w of words) if (set.has(w)) c += OWN.get(w) === k ? 2 : 1;   // a word only one language uses counts double
      if (c > top) { second = top; top = c; best = k; } else if (c > second) second = c;
    }
    // a clear winner only: enough hits, and well ahead of the runner-up (Danish and Norwegian share most of these)
    return top >= 5 && top >= second * 1.4 ? best : '';
  }

  return { detect, choices, fallback, speak, player, download, remove, status, mayDownload, network, SIZE_MB, LANGS, voicesFor, sizeMb,
    piperDownloaded: piperHas, naturalDownloaded: naturalHas,
    // one piece of text made into audio without playing it: for listening tests and comparisons
    sample: async (id, lang, text) => {
      if (id === 'piper') { await loadPiper(lang); return PP.ask({ type: 'say', text, rate: 1 }); }
      if (lang === 'heb') { await loadKokoroHe(); return KH.ask({ type: 'say', text, rate: 1 }); }
      await loadNatural(); return KK.ask({ type: 'say', phonemes: await naturalPhonemes(text, lang), voice: Object.keys(voicesFor(lang))[0], speed: 1 });
    },
    // load a downloaded voice in the background, so the tap on the speaker only has to speak
    warm: (id, lang) => {
      if (id === 'piper' && piperHas(lang)) return loadPiper(lang, { warm: true }).catch(() => {});
      if (id === 'natural' && naturalHas(lang)) return (lang === 'heb' ? loadKokoroHe() : loadNatural()).catch(() => {});
    },
    needsDownload: (id, lang) => id === 'natural' ? !naturalHas(lang) : id === 'piper' ? !piperHas(lang) : false,
    inspectHebrew: async text => { await loadPiper('heb'); return PP.ask({ type: 'inspect', text }); },
    setWifiOnly: on => remember(s => { s.wifiOnly = !!on; }), wifiOnly, VOICES, prepare, pieces, hebIpa, downloaded: () => !!mem().downloaded };
})();
