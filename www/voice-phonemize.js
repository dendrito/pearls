/* Estantes · letters to sounds in many languages, for the voices made on this device.

   piper_phonemize is eSpeak NG compiled to WebAssembly with every language's data. The Piper voices are trained on
   exactly its output, and Kokoro's non-English voices on eSpeak too, so one phonemizer serves both. The English
   phonemizer Kokoro already uses (phonemizer@1.2.1) knows English and nothing else: measured, it refuses pt-br,
   es, fr, it, de, hi and he. eSpeak NG has no Hebrew in this build: it spells out the letter names.

   The three files come through get(url), which the worker answers from the device store (voice-store.js) and
   never from the network unless a download is running. The program is compiled once; each piece of text then
   gets a fresh instance, because the phonemizer is a command-line program that runs once per start. */
import { PHONEMIZER } from './voice-files.js';
const [CODE, WASM, DATA] = PHONEMIZER;

let ready = null;
export function init(get) {
  return ready ||= (async () => {
    const js = await (await get(CODE)).text();
    const { createPiperPhonemize } = await import(URL.createObjectURL(new Blob([js], { type: 'text/javascript' })));
    const mod = await WebAssembly.compile(await (await get(WASM)).arrayBuffer());
    const data = await (await get(DATA)).arrayBuffer();
    return { createPiperPhonemize, mod, data };
  })().catch(e => { ready = null; throw e; });
}

// → {phonemes: 'olˈa, kˌomʊ…', ids: [..]}  (ids follow Piper's own table; Kokoro uses the phonemes)
export async function phonemize(text, voice) {
  const { createPiperPhonemize, mod, data } = await ready;
  let out = null, err = '';
  const m = await createPiperPhonemize({
    print: d => { try { out = JSON.parse(d); } catch {} },
    printErr: e => { err += e + '\n'; },
    instantiateWasm: (imports, done) => { WebAssembly.instantiate(mod, imports).then(i => done(i)); return {}; },
    getPreloadedPackage: () => data.slice(0),
    locateFile: u => u,
  });
  m.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  if (!out) throw new Error('the phonemizer gave nothing back' + (err ? ': ' + err.trim().slice(0, 120) : ''));
  const ph = out.phonemes;
  return { phonemes: Array.isArray(ph) ? ph.join(' ') : String(ph || ''), ids: out.phoneme_ids || [] };
}
