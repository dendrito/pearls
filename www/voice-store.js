/* Estantes · the natural voice's files, kept on this device only when the reader asks for them.

   Why not the browser's cache: kokoro-js puts the model in Cache Storage, and Chrome refuses the 326 MB
   model file ("Failed to execute 'put' on 'Cache': Unexpected internal error"), quietly. So the voice was
   fetched again every session while the reader said it was downloaded. Here every file is written to
   IndexedDB in 8 MB pieces as it arrives, so neither the phone's memory nor a single storage entry has to
   hold the whole model, and the worker reads from here instead of the network.

   Used by voice-worker.js (serve and fill) and voice.js (size, remove). Nothing here talks to a server
   except the file's own address, and only when the reader has said downloading is all right. */
const DB = 'estante-voices', PIECE = 8 * 1024 * 1024;
let dbp = null;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('files', { keyPath: 'url' }); r.result.createObjectStore('pieces'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = async (stores, mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(stores, mode); let out; Promise.resolve(fn(t)).then(v => { out = v; }); t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error); });
};
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function files() { return tx(['files'], 'readonly', t => req(t.objectStore('files').getAll())); }
export async function has(url) { const f = await tx(['files'], 'readonly', t => req(t.objectStore('files').get(url))); return !!(f && f.done); }
export async function size() { return (await files()).filter(f => f.done).reduce((a, f) => a + f.size, 0); }

// the stored file as a Response; its pieces stay on disk until read
export async function read(url) {
  const f = await tx(['files'], 'readonly', t => req(t.objectStore('files').get(url)));
  if (!f || !f.done) return null;
  const parts = await tx(['pieces'], 'readonly', t => Promise.all(Array.from({ length: f.n }, (_, i) => req(t.objectStore('pieces').get(`${url}#${i}`)))));
  if (parts.some(p => !p)) return null;
  return new Response(new Blob(parts, { type: f.type }), { headers: { 'content-type': f.type, 'content-length': String(f.size) } });
}

// fetch once, write piece by piece; onProgress({url, loaded, total})
export async function save(url, onProgress, realFetch = fetch) {
  const r = await realFetch(url);
  if (!r.ok) throw new Error(`could not download ${url.split('/').pop()} (${r.status})`);
  const total = +r.headers.get('content-length') || 0, type = r.headers.get('content-type') || 'application/octet-stream';
  const reader = r.body.getReader();
  let buf = [], bufLen = 0, n = 0, loaded = 0;
  const flush = async () => {
    if (!bufLen) return;
    const blob = new Blob(buf); buf = []; bufLen = 0;
    const key = `${url}#${n++}`;
    await tx(['pieces'], 'readwrite', t => { t.objectStore('pieces').put(blob, key); });
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf.push(value); bufLen += value.length; loaded += value.length;
    onProgress?.({ url, loaded, total });
    if (bufLen >= PIECE) await flush();
  }
  await flush();
  await tx(['files'], 'readwrite', t => { t.objectStore('files').put({ url, type, size: loaded, n, done: true, at: Date.now() }); });
  return loaded;
}

export async function remove(url) {
  const f = await tx(['files'], 'readonly', t => req(t.objectStore('files').get(url)));
  await tx(['files', 'pieces'], 'readwrite', t => {
    t.objectStore('files').delete(url);
    for (let i = 0; i < (f?.n || 0); i++) t.objectStore('pieces').delete(`${url}#${i}`);
  });
}

export async function removeAll() {
  dbp && (await dbp).close(); dbp = null;
  await new Promise(res => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}
