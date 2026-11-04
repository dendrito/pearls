/* Pearls · English phonemes for the natural voice when the Apple app runs Kokoro itself (KokoroNative.swift).
   The app turns phonemes into sound; this worker makes them, with eSpeak NG (phonemizer 1.2.1, which the app
   downloads with the model and serves at pearls://app/native/kokoro/phonemizer.js, so it works offline).
   english() is Estante's voice-worker.js english(), unchanged, so both routes give Kokoro the same phonemes.
   in: {id, text}   out: {id, phonemes} or {id, error} */
let phonemize = null;
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
    if (!phonemize) ({ phonemize } = await import(m.lib || '/native/kokoro/phonemizer.js'));
    self.postMessage({ id: m.id, phonemes: await english(m.text) });
  } catch (e) { self.postMessage({ id: m.id, error: String(e && e.message || e) }); }
};
