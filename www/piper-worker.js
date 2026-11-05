/* Estantes · the fast voice (Piper) made on this device, in any browser: Mac, Windows, iPhone, Android.
   Same files as the Piper app (rhasspy/piper-voices, MIT), run with ONNX Runtime Web on the CPU, one thread.
   Every file comes from the device store (voice-store.js); without net:true the worker refuses the network,
   so a language that is not downloaded says so instead of fetching 75 MB behind the reader's back.

   in:  {type:'load', voice, net}           out: {type:'bytes', url, loaded, total} … {type:'ready', voice, loadS}
   in:  {type:'say', id, text, espeak, rate}   out: {type:'audio', id, samples, rate, genS}  (samples transferred)
   in:  {type:'inspect', id, text}          out: {type:'inspected', id, pointed, ipa}   (Hebrew voices: what would be said)
   any failure:                             out: {type:'error', id?, message} */
import * as store from './voice-store.js';
import * as phon from './voice-phonemize.js';
import { ORT, piperVoice, NAKDIMON } from './voice-files.js';
import * as hebrew from './voice-hebrew.js';

let net = false, ort = null, session = null, config = null, current = '', nakdimon = null, vowelsUrl = null;
async function get(url) {
  const hit = await store.read(url).catch(() => null);
  if (hit) return hit;
  if (!net) throw new Error('this voice is not downloaded on this device');
  await store.save(url, p => self.postMessage({ type: 'bytes', ...p }));
  return store.read(url);
}
const blobUrl = async (url, type) => URL.createObjectURL(new Blob([await (await get(url)).arrayBuffer()], { type }));

async function load(voice) {
  if (!ort) {
    ort = await import(await blobUrl(`${ORT}ort.wasm.min.mjs`, 'text/javascript'));
    ort.env.wasm.numThreads = 1;   // the app has no cross-origin isolation, so no threads
    // loaded from a blob, the runtime cannot work out where its own files are, so it is told each one
    ort.env.wasm.wasmPaths = { mjs: await blobUrl(`${ORT}ort-wasm-simd-threaded.mjs`, 'text/javascript'), wasm: await blobUrl(`${ORT}ort-wasm-simd-threaded.wasm`, 'application/wasm') };
  }
  if (current !== voice) {
    const [model, json, vowels] = piperVoice(voice);
    config = await (await get(json)).json();
    session = await ort.InferenceSession.create(await (await get(model)).arrayBuffer(), { executionProviders: ['wasm'] });
    // a voice trained on raw IPA (Phonikud's Hebrew) gets its sounds from voice-hebrew.js, not from eSpeak
    if (config.phoneme_type === 'raw') {
      // Nakdimon is loaded the first time an unpointed passage needs it, not here: pointed text never does, and on a
      // phone 21 MB more at start-up is time the reader waits for nothing. While downloading, it is fetched now.
      vowelsUrl = vowels; nakdimon = null;
      if (net && vowels) await get(vowels);
    } else await phon.init(get);
    current = voice;
  }
}

// Piper's own order: start, then each sound followed by the pad, then end
// one run at a time: a background warm-up must never collide with the sentence the reader is waiting for
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn, fn));
const vowelModel = async () => nakdimon ||= await ort.InferenceSession.create(await (await get(vowelsUrl)).arrayBuffer(), { executionProviders: ['wasm'] });
async function hebrewIds(text) {
  const ipa = await hebrew.toPhonemes(text, async t => hebrew.addVowels(t, await vowelModel(), ort));
  const map = config.phoneme_id_map, ids = [...map['^']];
  for (const c of ipa) if (map[c]) ids.push(...map[c], ...map['_']);
  ids.push(...map['$']);
  return ids;
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') {
      const t0 = performance.now(); net = !!m.net;
      try { await load(m.voice); } finally { net = false; }
      self.postMessage({ type: 'ready', voice: m.voice, loadS: (performance.now() - t0) / 1000 });
      // then, out of the way: the first run of a fresh model is the slow one, so spend it on a word nobody hears, and
      // for Hebrew get Nakdimon ready too (measured on a Galaxy A07: 2.4 s ready + 2.6 s for the first sentence)
      if (m.warm) serial(async () => {
        if (config.phoneme_type === 'raw') { if (vowelsUrl && await store.has(vowelsUrl)) await vowelModel(); await say('שלום'); }
        else await say('Hello.');
      }).catch(() => {});
    } else if (m.type === 'inspect') {   // what the Hebrew front end made of a text: for checking, never spoken
      const pointedText = hebrew.isPointed(m.text) ? m.text : await hebrew.addVowels(m.text, await vowelModel(), ort);
      self.postMessage({ type: 'inspected', id: m.id, pointed: pointedText, ipa: await hebrew.toPhonemes(m.text, async t => hebrew.addVowels(t, await vowelModel(), ort)) });
    } else if (m.type === 'say') {
      const g0 = performance.now();
      const samples = await serial(() => say(m.text, m.rate));
      self.postMessage({ type: 'audio', id: m.id, samples, rate: config.audio.sample_rate, genS: (performance.now() - g0) / 1000 }, [samples.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e && e.message || e) });
  }
};

async function say(text, rate = 1) {
  const ids = config.phoneme_type === 'raw' ? await hebrewIds(text) : (await phon.phonemize(text, config.espeak.voice)).ids;
  const inf = config.inference || {};
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / (rate || 1), inf.noise_w ?? 0.8]), [3]),
  };
  if (config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  const out = await session.run(feeds);
  return Float32Array.from(out.output.data);
}
