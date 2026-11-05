/* Pearls for Windows: the web app (www/) in an Electron window, with the same window.PearlsNative bridge the Android
 * app has (android/java/.../PearlsBridge.java), so downloads, offline Hebrew, sync and the media keys work unchanged.
 *
 *   app://pearls/...              the web app, from www/ inside the package
 *   app://pearls/proxy?u=         text from ph.yhb.org.il, fetched here (the site sends no CORS headers); only that host
 *   app://pearls/dl/NAME          downloaded audio, with Range support so seeking works
 *
 * The page's own code decides everything else. Voices (Kokoro, Piper, the device's voices) run in the page exactly as
 * on the web: Chromium has WebGPU, WebAssembly and Windows' speech voices.
 *
 * PEARLS_WWW and PEARLS_DATA override where the web app and the saved files live (test_windows_shell.mjs uses them). */
"use strict";
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, powerSaveBlocker, nativeImage, session } = require("electron");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const SCHEME = "app", HOST = "pearls", ORIGIN = `${SCHEME}://${HOST}`;
const UA = "Pearls (Windows; offline downloads)";
const SAFE = /^[A-Za-z0-9._-]{1,80}$/;
const safe = n => typeof n === "string" && SAFE.test(n) && !n.includes("..");

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

if (!process.env.PEARLS_DATA && !app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId("app.pearls.halakha");   // the same id as the Android app: Windows groups the taskbar and media overlay by it
if (process.env.PEARLS_DATA) app.setPath("userData", path.resolve(process.env.PEARLS_DATA));

const WWW = path.resolve(process.env.PEARLS_WWW || path.join(__dirname, "www"));
let DATA, DL, TEXT;
function dirs() {
  DATA = app.getPath("userData");
  DL = path.join(DATA, "dl"); TEXT = path.join(DATA, "text");
  for (const d of [DL, TEXT]) fs.mkdirSync(d, { recursive: true });
}

/* ---------------- the app:// scheme ---------------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".wasm": "application/wasm", ".tsv": "text/tab-separated-values; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".data": "application/octet-stream", ".onnx": "application/octet-stream", ".bin": "application/octet-stream" };
const mime = p => MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
const notFound = () => new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });

/* a file, whole or the byte range asked for: <audio> seeks with Range, and Chromium will not seek without 206 */
function serveFile(file, req) {
  let st;
  try { st = fs.statSync(file); if (!st.isFile()) return notFound(); } catch { return notFound(); }
  const type = mime(file), size = st.size, range = req.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers: {
      "content-type": type, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes" } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: {
    "content-type": type, "content-length": String(size), "accept-ranges": "bytes" } });
}

async function proxy(target) {
  let t; try { t = new URL(target); } catch { return notFound(); }
  if (t.protocol !== "https:" || t.hostname !== "ph.yhb.org.il") return notFound();   // never an open proxy
  try {
    const r = await net.fetch(t.href, { headers: { "User-Agent": UA } });
    return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response(String(e && e.message || e), { status: 502, headers: { "content-type": "text/plain" } });
  }
}

function handle(req) {
  const u = new URL(req.url);
  if (u.host !== HOST) return notFound();
  let p = decodeURIComponent(u.pathname);
  if (p === "/proxy") return proxy(u.searchParams.get("u") || "");
  if (p.startsWith("/dl/")) { const n = p.slice(4); return safe(n) ? serveFile(path.join(DL, n), req) : notFound(); }
  if (p === "/" || p === "") p = "/index.html";
  const file = path.normalize(path.join(WWW, p));
  if (!file.startsWith(WWW + path.sep)) return notFound();
  return serveFile(file, req);
}

/* ---------------- downloads (Android's DownloadManager, in miniature) ----------------
   Jobs run two at a time into dl/NAME.part, renamed to NAME when whole. A lost connection waits and tries again, the
   way DownloadManager does; an HTTP error fails the file once and the page records it (missing on the server). */
const jobs = new Map();          // name -> {url, name, title, status, done, total, ctl, tries}
let finished = [], failed = [];
const RUN = 2;
function pump() {
  let running = [...jobs.values()].filter(j => j.status === "running").length;
  for (const j of jobs.values()) {
    if (running >= RUN) break;
    if (j.status === "pending" && !(j.waitUntil > Date.now())) { start(j); running++; }
  }
}
async function start(j) {
  j.status = "running"; j.done = 0; j.total = 0; j.ctl = new AbortController();
  const part = path.join(DL, j.name + ".part");
  let out;
  try {
    const r = await net.fetch(j.url, { headers: { "User-Agent": UA }, signal: j.ctl.signal });
    if (!r.ok) { const e = new Error("http " + r.status); e.http = r.status; throw e; }
    j.total = +r.headers.get("content-length") || 0;
    out = fs.createWriteStream(part);
    for await (const chunk of Readable.fromWeb(r.body)) {
      if (!jobs.has(j.name)) throw new Error("removed");
      j.done += chunk.length;
      if (!out.write(chunk)) await new Promise(res => out.once("drain", res));
    }
    await new Promise((res, rej) => out.end(e => e ? rej(e) : res()));
    if (!jobs.has(j.name)) throw new Error("removed");
    const fin = path.join(DL, j.name);
    try { fs.rmSync(fin, { force: true }); } catch {}
    fs.renameSync(part, fin);
    jobs.delete(j.name); finished.push(j.name);
  } catch (e) {
    if (out) try { out.destroy(); } catch {}
    try { fs.rmSync(part, { force: true }); } catch {}
    if (!jobs.has(j.name)) { /* removed or cancelled */ }
    else if (e.http || ++j.tries > 20) { jobs.delete(j.name); failed.push({ name: j.name, reason: e.http || 1000 }); }
    else { j.status = "pending"; j.waitUntil = Date.now() + Math.min(60000, 2000 * j.tries); setTimeout(pump, Math.min(60000, 2000 * j.tries) + 50); }
  }
  pump();
}

function listDir(d, partOk) {
  try {
    return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isFile() && (partOk || !e.name.endsWith(".part")))
      .map(e => ({ n: e.name, s: fs.statSync(path.join(d, e.name)).size }));
  } catch { return []; }
}
function freeBytes(d) { try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch { return 0; } }

/* every method returns what the Android bridge returns, as the same JSON */
const bridge = {
  info: () => JSON.stringify({ ok: true, dir: `${ORIGIN}/dl/`, free: freeBytes(DL), online: net.isOnline(), metered: false, desktop: true }),
  enqueue(jobsJson) {
    let list; try { list = JSON.parse(jobsJson); } catch { return -2; }
    let n = 0;
    for (const j of Array.isArray(list) ? list : []) {
      if (!j || !safe(j.name) || !/^https?:\/\//.test(j.url || "")) continue;
      if (fs.existsSync(path.join(DL, j.name)) || jobs.has(j.name)) continue;
      jobs.set(j.name, { url: j.url, name: j.name, title: j.title || j.name, status: "pending", done: 0, total: 0, tries: 0 }); n++;
    }
    pump();
    return n;
  },
  status() {
    const out = { active: [...jobs.values()].map(j => ({ name: j.name, status: j.status, done: j.done, total: j.total, reason: 0 })), finished, failed };
    finished = []; failed = [];
    return JSON.stringify(out);
  },
  list: () => JSON.stringify(listDir(DL, false)),
  remove(namesJson) {
    let names; try { names = JSON.parse(namesJson).filter(safe); } catch { return 0; }
    let n = 0;
    for (const name of names) {
      const j = jobs.get(name); if (j) { jobs.delete(name); try { j.ctl && j.ctl.abort(); } catch {} }
      try { if (fs.existsSync(path.join(DL, name))) { fs.rmSync(path.join(DL, name)); n++; } } catch {}
      try { fs.rmSync(path.join(DL, name + ".part"), { force: true }); } catch {}
    }
    return n;
  },
  cancelAll() {
    for (const j of jobs.values()) try { j.ctl && j.ctl.abort(); } catch {}
    jobs.clear();
    for (const f of listDir(DL, true)) if (f.n.endsWith(".part")) try { fs.rmSync(path.join(DL, f.n)); } catch {}
  },
  readText(key) { if (!safe(key)) return null; try { return fs.readFileSync(path.join(TEXT, key), "utf8"); } catch { return null; } },
  writeText(key, content) {
    if (!safe(key) || content == null) return false;
    try { fs.writeFileSync(path.join(TEXT, key + ".tmp"), String(content), "utf8"); fs.renameSync(path.join(TEXT, key + ".tmp"), path.join(TEXT, key)); return true; } catch { return false; }
  },
  textList: () => JSON.stringify(listDir(TEXT, false).filter(f => !f.n.endsWith(".tmp"))),
  clearText() { const L = listDir(TEXT, true); for (const f of L) try { fs.rmSync(path.join(TEXT, f.n)); } catch {} return L.filter(f => !f.n.endsWith(".tmp")).length; },
  mediaState(json) { let s; try { s = JSON.parse(json); } catch { return; } media(s); },
  setBars(hex) { if (win && /^#[0-9a-f]{6}$/i.test(hex || "")) win.setBackgroundColor(hex); },
  saveMigration() {}, takeMigration: () => null
};
ipcMain.on("pearls", (e, m, args) => {
  const f = bridge[m];
  try { e.returnValue = f ? f(...(args || [])) : null; } catch { e.returnValue = null; }
  if (e.returnValue === undefined) e.returnValue = null;
});

ipcMain.on("pearls-noisy", () => send("noisy"));

/* ---------------- what is playing: taskbar buttons and staying awake ----------------
   The media keys and Windows' media overlay come from the page's navigator.mediaSession (Chromium wires it to Windows).
   Here: previous / play-pause / next under the taskbar thumbnail, and no system sleep in the middle of a chapter. */
let win = null, playing = null, awake = null;
const icons = {};
const icon = n => icons[n] || (icons[n] = nativeImage.createFromPath(path.join(__dirname, "icons", n + ".png")));
const send = cmd => { if (win) win.webContents.executeJavaScript(`window.PEARLS_MEDIA && window.PEARLS_MEDIA(${JSON.stringify(cmd)})`).catch(() => {}); };
function media(s) {
  const now = s && s.title ? !!s.playing : null;
  if (now === playing) return;
  playing = now;
  if (now && awake === null) awake = powerSaveBlocker.start("prevent-app-suspension");
  if (!now && awake !== null) { powerSaveBlocker.stop(awake); awake = null; }
  if (!win || process.platform !== "win32") return;
  win.setThumbarButtons(now === null ? [] : [
    { tooltip: "Previous", icon: icon("prev"), click: () => send("prev") },
    now ? { tooltip: "Pause", icon: icon("pause"), click: () => send("pause") } : { tooltip: "Play", icon: icon("play"), click: () => send("play") },
    { tooltip: "Next", icon: icon("next"), click: () => send("next") }]);
}

/* ---------------- the window ---------------- */
const STATE = () => path.join(DATA, "window.json");
function bounds() { try { return JSON.parse(fs.readFileSync(STATE(), "utf8")); } catch { return { width: 1180, height: 820 }; } }
function keepBounds() {
  if (!win || win.isMinimized()) return;
  try { fs.writeFileSync(STATE(), JSON.stringify(Object.assign(win.getNormalBounds(), { max: win.isMaximized() }))); } catch {}
}

function open() {
  const b = bounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width || 1180, height: b.height || 820, minWidth: 360, minHeight: 520,
    title: "Pearls", backgroundColor: "#12110F", show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,   // the voice reads section after section on timers; a minimized window must keep going
      spellcheck: false
    }
  });
  if (b.max) win.maximize();
  win.once("ready-to-show", () => win.show());
  for (const ev of ["resize", "move", "close"]) win.on(ev, keepBounds);
  win.on("closed", () => { win = null; });

  /* links out of the app (Sefaria, Meldar, credits, the voice model cards) open in the browser */
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGIN + "/")) { e.preventDefault(); if (/^(https?|mailto):/.test(url)) shell.openExternal(url); } });
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (i.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === "F12" || (i.control && i.shift && i.key.toUpperCase() === "I")) { win.webContents.toggleDevTools(); e.preventDefault(); }
    else if (i.key === "F5" || (i.control && i.key.toLowerCase() === "r")) { win.webContents.reload(); e.preventDefault(); }
    else if (i.alt && i.key === "ArrowLeft" && win.webContents.navigationHistory.canGoBack()) { win.webContents.navigationHistory.goBack(); e.preventDefault(); }
  });
  win.loadURL(`${ORIGIN}/index.html`);
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
app.whenReady().then(() => {
  dirs();
  Menu.setApplicationMenu(null);
  protocol.handle(SCHEME, handle);
  /* the page may ask for nothing it doesn't need: no camera, no location; the microphone stays off too */
  /* "media" here lets the page see which audio outputs exist (for the headphones check in preload.js); it opens no microphone */
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ["media", "speaker-selection", "clipboard-sanitized-write"].includes(perm));
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(["clipboard-sanitized-write", "fullscreen"].includes(perm)));
  open();
});
module.exports = { bridge, handle };
