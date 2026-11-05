/* Estantes · the natural voice (Kokoro, kokoro-js) in a worker, so the reader never freezes while it speaks.
   Downloaded only when the reader says so, and kept in voice-store.js (IndexedDB), because the browser's own
   cache refuses the 326 MB model. Without net:true the worker never touches the network for the voice's files:
   a voice that is not downloaded says so instead of fetching 350 MB behind the reader's back.
   Nothing is sent anywhere: the voice runs on this device.

   in:  {type:'load', device:'webgpu'|'wasm', dtype, net, voices}  out: {type:'bytes', url, loaded, total} … {type:'progress', file, pct} … {type:'ready', device, dtype, loadS}
   in:  {type:'say', id, phonemes, voice, speed}                out: {type:'audio', id, samples, rate, genS}  (samples transferred)
   in:  {type:'english', id, text}                              out: {type:'phonemes', id, phonemes}
   in:  {type:'phonemize', id, text, espeak}                    out: {type:'phonemes', id, phonemes}   (other languages)
   any failure:                                                 out: {type:'error', id?, message}

   The reader sends phonemes, not text: kokoro-js's own text step ends by turning every guttural "x" into "k",
   so the only way to keep a Hebrew ḥ is to make the phonemes ourselves (voice.js) and pass them through. */
const KOKORO = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const PHONEMIZER = 'https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/+esm';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null, phonemize = null, net = false;
import * as store from './voice-store.js';
import * as phon from './voice-phonemize.js';

// the voice's files (model, settings, voices, the WebAssembly runtime) come from the store, or are saved there
const realFetch = self.fetch.bind(self);
const KEEP = u => /^https:\/\/huggingface\.co\/|\.wasm(\?|$)/.test(u);
const VOICE_URL = v => `https://huggingface.co/${MODEL}/resolve/main/voices/${v}.bin`;
async function keep(url) {
  const hit = await store.read(url).catch(() => null);
  if (hit) return hit;
  if (!net) throw new Error('the natural voice is not downloaded on this device');
  await store.save(url, p => self.postMessage({ type: 'bytes', ...p }), realFetch);
  return store.read(url);
}
self.fetch = (input, init) => { const url = typeof input === 'string' ? input : input.url; return KEEP(url) ? keep(url) : realFetch(input, init); };

// English phonemes made the way kokoro-js makes them (its function is not exported):
// punctuation is kept as it is, everything between goes through eSpeak NG.
const PUNCT = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;
async function english(text) {
  const parts = []; let pos = 0;
  for (const m of text.matchAll(PUNCT)) { if (m.index > pos) parts.push([false, text.slice(pos, m.index)]); parts.push([true, m[0]]); pos = m.index + m[0].length; }
  if (pos < text.length) parts.push([false, text.slice(pos)]);
  const out = (await Promise.all(parts.map(async ([p, t]) => p ? t : (await phonemize(t, 'en-us')).join(' ')))).join('');
  return out.replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l').replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') {
      const t0 = performance.now(); net = !!m.net;
      const { KokoroTTS } = await import(KOKORO);
      ({ phonemize } = await import(PHONEMIZER));
      let last = 0;
      tts = await KokoroTTS.from_pretrained(MODEL, { dtype: m.dtype, device: m.device, progress_callback: p => {
        if (p.status === 'progress' && performance.now() - last > 250) { last = performance.now(); self.postMessage({ type: 'progress', file: p.file, pct: Math.round(p.progress) }); }
      } });
      for (const v of m.voices || []) await keep(VOICE_URL(v));   // every voice offered, so switching works offline
      await phon.init(keep);                                      // eSpeak NG for the languages other than English
      net = false;
      self.postMessage({ type: 'ready', device: m.device, dtype: m.dtype, loadS: (performance.now() - t0) / 1000 });
    } else if (m.type === 'phonemize') {   // any language but English: eSpeak NG (voice-phonemize.js)
      await phon.init(keep);
      self.postMessage({ type: 'phonemes', id: m.id, phonemes: (await phon.phonemize(m.text, m.espeak)).phonemes });
    } else if (m.type === 'english') {
      self.postMessage({ type: 'phonemes', id: m.id, phonemes: await english(m.text) });
    } else if (m.type === 'say') {
      if (!tts) throw new Error('the natural voice is not loaded');
      const g0 = performance.now();
      const { input_ids } = tts.tokenizer(m.phonemes, { truncation: true });
      const a = await tts.generate_from_ids(input_ids, { voice: m.voice, speed: m.speed || 1 });
      const samples = a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio);
      self.postMessage({ type: 'audio', id: m.id, samples, rate: a.sampling_rate, genS: (performance.now() - g0) / 1000 }, [samples.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e && e.message || e) });
  }
};
