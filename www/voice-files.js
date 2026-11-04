/* Estantes · which files make up each downloadable voice. One list, read by the page (sizes, download,
   remove) and by the workers (what to load). Every address was fetched before it was written down. */
export const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const PP = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
// eSpeak NG for every language, shared by Kokoro (non-English) and Piper
export const PHONEMIZER = ['https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js', `${PP}.wasm`, `${PP}.data`];
export const PIPER_RUNTIME = [`${ORT}ort.wasm.min.mjs`, `${ORT}ort-wasm-simd-threaded.mjs`, `${ORT}ort-wasm-simd-threaded.wasm`, ...PHONEMIZER];
// Hebrew: Phonikud's Piper voice (non-commercial), its shared config, and Nakdimon for unpointed text (MIT)
const PK = 'https://huggingface.co/Phonikud/phonikud-tts-checkpoints/resolve/main/';
export const NAKDIMON = 'https://raw.githubusercontent.com/elazarg/nakdimon/v0.2.1/nakdimon/data/Nakdimon.onnx';
// Kokoro trained on Hebrew (non-commercial): model, vocabulary, voice; then its WebGPU runtime
const KH = 'https://huggingface.co/thewh1teagle/kokoro-hebrew-nc/resolve/main/';
export const KOKORO_HE = [`${KH}kokoro.onnx`, `${KH}config.json`, `${KH}voices-hebrew.bin`];
// ONNX Runtime 1.23's native WebGPU engine (the asyncify build): measured, 1.20.1's older JSEP WebGPU path cannot run
// this graph ("[Add] /N.1/Add … can't perform binary op") and the CPU alone gave 0.53× real time on an M2
export const ORT_HE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/';
export const KOKORO_HE_RUNTIME = [`${ORT_HE}ort.webgpu.min.mjs`, `${ORT_HE}ort-wasm-simd-threaded.asyncify.mjs`, `${ORT_HE}ort-wasm-simd-threaded.asyncify.wasm`];
export const HEBREW_PIPER = { 'he_IL-shaul-phonikud': [`${PK}shaul.onnx`, `${PK}model.config.json`, NAKDIMON] };
export function piperVoice(v) {   // en_US-lessac-medium → .../en/en_US/lessac/medium/en_US-lessac-medium.onnx (+ .json)
  if (HEBREW_PIPER[v]) return HEBREW_PIPER[v];
  const [loc, name, ...q] = v.split('-');
  const p = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${loc.split('_')[0]}/${loc}/${name}/${q.join('-')}/${v}.onnx`;
  return [p, p + '.json'];
}
// the model, its voices, its own runtime (kokoro-js brings its own ONNX Runtime; 1.20.1's jsep is Kokoro Hebrew's, not this)
export const KOKORO = /onnx-community\/Kokoro|(?<!onnxruntime-web@1\.2[03]\.[01]\/dist\/)ort-wasm-simd-threaded\.jsep\.wasm/;
export const kokoroVoice = v => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${v}.bin`;
