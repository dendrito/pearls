/* Estantes · the natural Hebrew voice: Kokoro trained on Hebrew (thewh1teagle/kokoro-hebrew-nc, from the gated
   avris/kokoro-hebrew-saspeech; voice he_shaul). NON-COMMERCIAL: model and dataset terms. Modern Israeli speech.
   Not the kokoro-js packaging, so it runs here on ONNX Runtime Web directly: WebGPU where there is one, CPU otherwise.
   Sounds come from voice-hebrew.js (Phonikud's rules, Nakdimon for unpointed text), the same front end as Piper's.
   Every file comes from the device store; without net:true the worker refuses the network.

   in:  {type:'load', net}                    out: {type:'bytes', url, loaded, total} … {type:'ready', device, loadS}
   in:  {type:'say', id, text, rate}          out: {type:'audio', id, samples, rate, genS}  (samples transferred) */
import * as store from './voice-store.js';
import * as hebrew from './voice-hebrew.js';
import { ORT_HE as ORT, KOKORO_HE, KOKORO_HE_RUNTIME, NAKDIMON } from './voice-files.js';

let net = false, ort = null, session = null, nakdimon = null, vocab = null, style = null, device = 'wasm', modelBytes = null;
async function get(url) {
  const hit = await store.read(url).catch(() => null);
  if (hit) return hit;
  if (!net) throw new Error('the natural Hebrew voice is not downloaded on this device');
  await store.save(url, p => self.postMessage({ type: 'bytes', ...p }));
  return store.read(url);
}
const blobUrl = async (url, type) => URL.createObjectURL(new Blob([await (await get(url)).arrayBuffer()], { type }));

// voices-hebrew.bin is a numpy .npz: an uncompressed zip holding he_shaul.npy, float32 (510, 1, 256)
function readNpz(buf) {
  const v = new DataView(buf), out = {};
  for (let p = 0; p + 30 < buf.byteLength && v.getUint32(p, true) === 0x04034b50;) {
    const method = v.getUint16(p + 8, true), size = v.getUint32(p + 18, true), nlen = v.getUint16(p + 26, true), xlen = v.getUint16(p + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 30, nlen)), at = p + 30 + nlen + xlen;
    if (method !== 0) throw new Error('the voice file is compressed, which this reader does not expect');
    const hlen = v.getUint16(at + 8, true), header = new TextDecoder().decode(new Uint8Array(buf, at + 10, hlen));
    if (!header.includes("'<f4'")) throw new Error('the voice file is not float32');
    out[name.replace(/\.npy$/, '')] = new Float32Array(buf.slice(at + 10 + hlen, at + size));
    p = at + size;
  }
  return out;
}

async function load() {
  if (session) return;
  const [model, config, voices] = KOKORO_HE;
  const [rtCode, rtGlue, rtWasm] = KOKORO_HE_RUNTIME;
  ort = await import(await blobUrl(rtCode, 'text/javascript'));
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { mjs: await blobUrl(rtGlue, 'text/javascript'), wasm: await blobUrl(rtWasm, 'application/wasm') };
  vocab = (await (await get(config)).json()).vocab;
  style = Object.values(readNpz(await (await get(voices)).arrayBuffer()))[0];
  if (net) await get(NAKDIMON);   // downloaded now, loaded when an unpointed passage first needs it
  const bytes = modelBytes = await (await get(model)).arrayBuffer();
  // WebGPU first (Kokoro measured 2.4× real time that way on an M2); the CPU where there is none
  for (const ep of navigator.gpu ? ['webgpu', 'wasm'] : ['wasm']) {
    try { session = await ort.InferenceSession.create(bytes, { executionProviders: [ep] }); device = ep; break; } catch (e) { if (ep === 'wasm') throw e; }
  }
}

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') {
      const t0 = performance.now(); net = !!m.net;
      try { await load(); } finally { net = false; }
      self.postMessage({ type: 'ready', device, loadS: (performance.now() - t0) / 1000 });
    } else if (m.type === 'say') {
      const g0 = performance.now();
      const ipa = await hebrew.toPhonemes(m.text, async t => hebrew.addVowels(t, nakdimon ||= await ort.InferenceSession.create(await (await get(NAKDIMON)).arrayBuffer(), { executionProviders: ['wasm'] }), ort));
      const ids = [...ipa].map(c => vocab[c]).filter(n => n != null).slice(0, 510);
      // the style row is chosen by the number of sounds, as kokoro-onnx does; the ids are padded with 0 at both ends
      const s = style.subarray(ids.length * 256, ids.length * 256 + 256);
      const names = session.inputNames, feeds = {};
      feeds[names.includes('input_ids') ? 'input_ids' : 'tokens'] = new ort.Tensor('int64', BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]);
      feeds.style = new ort.Tensor('float32', Float32Array.from(s), [1, 256]);
      feeds.speed = new ort.Tensor('float32', Float32Array.from([m.rate || 1]), [1]);
      let out;
      try { out = await session.run(feeds); }
      catch (e) {
        // measured: this graph's /N.1/Add fails on WebGPU ("can't perform binary op"); the CPU runs it. Fall back once, and say so
        if (device !== 'webgpu') throw e;
        session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] }); device = 'wasm';
        self.postMessage({ type: 'device', device, why: String(e.message || e).slice(0, 160) });
        out = await session.run(feeds);
      }
      const samples = Float32Array.from(out[session.outputNames[0]].data);
      self.postMessage({ type: 'audio', id: m.id, samples, rate: 24000, genS: (performance.now() - g0) / 1000 }, [samples.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, message: String(e && e.message || e) });
  }
};
