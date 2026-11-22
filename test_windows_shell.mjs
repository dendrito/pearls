/* Pearls for Windows: the Electron shell (windows/main.js + preload.js) driven for real, on whatever OS runs the test.
 * It launches the same main.js the installer ships, with the www/ from this repo and a throwaway data folder, and
 * checks the Android-style bridge, downloads (with a local server standing in for the audio host), byte ranges,
 * the ph.yhb.org.il-only proxy, kept Hebrew text, and what the page says on a PC.
 *
 *   cd windows && npm ci && cd .. && NODE_PATH=$(npm root -g) xvfb-run -a node test_windows_shell.mjs
 * Must end "windows shell: N/N". */
import { createRequire } from "module";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
const require = createRequire(import.meta.url);
const { _electron } = require("playwright");
const ROOT = path.dirname(new URL(import.meta.url).pathname);

let pass = 0, total = 0;
const check = (name, ok, extra = "") => { total++; if (ok) pass++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); };

/* the audio host: /a.mp3 is 300 kB, /missing.mp3 is a 404 */
const BODY = Buffer.alloc(300 * 1024, 7);
const srv = http.createServer((req, res) => {
  if (req.url === "/a.mp3" || req.url === "/b.mp3") { res.writeHead(200, { "content-type": "audio/mpeg", "content-length": BODY.length }); res.end(BODY); }
  else { res.writeHead(404); res.end(); }
}).listen(0);
const port = srv.address().port, host = `http://127.0.0.1:${port}`;

const data = fs.mkdtempSync(path.join(os.tmpdir(), "pearls-win-"));
const app = await _electron.launch({
  executablePath: require(path.join(ROOT, "windows/node_modules/electron")),
  args: [path.join(ROOT, "windows/main.js"), "--no-sandbox"],
  env: Object.assign({}, process.env, { PEARLS_WWW: path.join(ROOT, "www"), PEARLS_DATA: data })
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
await page.waitForFunction(() => document.querySelector(".tabs") && document.querySelector("main") && document.querySelector("main").children.length > 0, null, { timeout: 30000 });

check("loads from app://pearls/", page.url() === "app://pearls/index.html" || page.url().startsWith("app://pearls/index.html"), page.url());
check("the page knows it is the Windows app", await page.evaluate(() => window.PEARLS_SHELL === "windows" && window.PEARLS_PROXY === "/proxy?u=" && typeof DEVICE === "undefined" ? true : window.PEARLS_SHELL === "windows"));
const info = await page.evaluate(() => JSON.parse(PearlsNative.info()));
check("info(): downloads served from app://pearls/dl/, free space known", info.ok && info.dir === "app://pearls/dl/" && info.free > 0, JSON.stringify(info));
check("no Node in the page", await page.evaluate(() => typeof require === "undefined" && typeof process === "undefined"));

/* kept Hebrew text */
const txt = await page.evaluate(() => {
  const w = PearlsNative.writeText("01-02.html", "<p>שבת שלום</p>"), r = PearlsNative.readText("01-02.html");
  const bad = PearlsNative.writeText("../evil", "x"), l = JSON.parse(PearlsNative.textList());
  return { w, r, bad, l };
});
check("writeText / readText round-trip, in UTF-8", txt.w === true && txt.r === "<p>שבת שלום</p>" && txt.l.length === 1 && txt.l[0].n === "01-02.html", JSON.stringify(txt));
check("a name with a path in it is refused", txt.bad === false && !fs.existsSync(path.join(data, "evil")));
check("clearText() empties the store", await page.evaluate(() => PearlsNative.clearText() === 1 && JSON.parse(PearlsNative.textList()).length === 0));

/* downloads */
const n = await page.evaluate(jobs => PearlsNative.enqueue(JSON.stringify(jobs), true),
  [{ url: host + "/a.mp3", name: "01-01-01-he.mp3", title: "a" }, { url: host + "/missing.mp3", name: "01-01-02-he.mp3", title: "b" },
   { url: "file:///etc/passwd", name: "x.mp3" }, { url: host + "/a.mp3", name: "../x.mp3" }]);
check("enqueue() takes the good jobs and refuses file:// and path names", n === 2, String(n));
let st = { failed: [] }, list = [], failedSeen = [];
for (let i = 0; i < 50; i++) {
  st = await page.evaluate(() => JSON.parse(PearlsNative.status()));
  failedSeen.push(...st.failed);
  list = await page.evaluate(() => JSON.parse(PearlsNative.list()));
  if (list.length && !st.active.length) break;
  await page.waitForTimeout(100);
}
check("a download lands as NAME, whole, with no .part left", list.length === 1 && list[0].n === "01-01-01-he.mp3" && list[0].s === BODY.length
  && !fs.readdirSync(path.join(data, "dl")).some(f => f.endsWith(".part")), JSON.stringify(list));
check("a missing file is reported failed, once", failedSeen.length === 1 && failedSeen[0].name === "01-01-02-he.mp3", JSON.stringify(failedSeen));
check("enqueue() skips a file already downloaded", await page.evaluate(h => PearlsNative.enqueue(JSON.stringify([{ url: h + "/a.mp3", name: "01-01-01-he.mp3" }]), false), host) === 0);

const rng = await page.evaluate(async () => {
  const r = await fetch("app://pearls/dl/01-01-01-he.mp3", { headers: { Range: "bytes=1000-1009" } }), b = await r.arrayBuffer();
  const w = await fetch("app://pearls/dl/01-01-01-he.mp3"), wb = await w.arrayBuffer();
  return { s: r.status, len: b.byteLength, cr: r.headers.get("content-range"), ws: w.status, wl: wb.byteLength, type: w.headers.get("content-type") };
});
check("/dl/ serves byte ranges (206) and the whole file", rng.s === 206 && rng.len === 10 && rng.cr === `bytes 1000-1009/${BODY.length}` && rng.ws === 200 && rng.wl === BODY.length && rng.type === "audio/mpeg", JSON.stringify(rng));
const audioOk = await page.evaluate(() => new Promise(res => { const a = new Audio("app://pearls/dl/01-01-01-he.mp3"); a.onerror = () => res("error " + (a.error && a.error.code)); a.onloadedmetadata = () => res("meta"); setTimeout(() => res("timeout"), 4000); }));
check("an <audio> element can open a downloaded file", audioOk === "meta" || audioOk === "error 4", audioOk);   // the test body is not real MP3: a decode error (4) still proves it was fetched

const traversal = await page.evaluate(async () => (await fetch("app://pearls/dl/..%2F..%2Fwindow.json")).status);
check("/dl/ cannot reach outside the downloads folder", traversal === 404, String(traversal));
const wwwTrav = await page.evaluate(async () => (await fetch("app://pearls/%2E%2E/%2E%2E/package.json")).status);
check("app:// cannot reach outside www/", wwwTrav === 404, String(wwwTrav));

/* removal and cancelling */
await page.evaluate(h => PearlsNative.enqueue(JSON.stringify([{ url: h + "/b.mp3", name: "01-01-03-he.mp3" }]), false), host);
const rm = await page.evaluate(() => PearlsNative.remove(JSON.stringify(["01-01-01-he.mp3", "01-01-03-he.mp3"])));
await page.waitForTimeout(300);
const after = await page.evaluate(() => JSON.parse(PearlsNative.list()));
check("remove() deletes downloads, finished or in progress", rm >= 1 && after.length === 0 && fs.readdirSync(path.join(data, "dl")).length === 0, `${rm} ${JSON.stringify(after)}`);

/* the proxy: ph.yhb.org.il only */
const px = await page.evaluate(async () => (await fetch("/proxy?u=" + encodeURIComponent("https://example.com/"))).status);
check("the proxy refuses any host but ph.yhb.org.il", px === 404, String(px));

/* media: the page reports playing, the shell keeps the machine awake; PEARLS_MEDIA is there for the taskbar buttons */
check("mediaState() and PEARLS_MEDIA work", await page.evaluate(() => { PearlsNative.mediaState(JSON.stringify({ playing: true, title: "x" })); PearlsNative.mediaState(JSON.stringify({ playing: false })); return typeof window.PEARLS_MEDIA === "function"; }));

/* what the page says on a PC */
await page.evaluate(() => { location.hash = "#downloads"; });
await page.waitForTimeout(600);
const dlPage = await page.evaluate(() => document.querySelector("main").innerText);
check("Downloads says \"this PC\" and has no Wi-Fi-only switch", /this PC/.test(dlPage) && !/Wi-Fi only/i.test(dlPage), dlPage.slice(0, 200).replace(/\n/g, " | "));
await page.click('header [data-act="spelling"], [aria-label="Reading settings"]');
await page.waitForTimeout(600);
const set = await page.evaluate(() => document.body.innerText);
check("Settings offers sync (the apps link with a code)", /Sync across devices/i.test(set) && /code/i.test(set), (set.match(/Sync across devices[^\n]*\n?[^\n]*/) || [""])[0].slice(0, 160));
check("Appearance offers \"Match PC\"", /Match PC/i.test(set));
const voice = set;
check("the voice picker offers Natural (Kokoro), Light (Piper) and this PC's voice", /Natural \(Kokoro\)/.test(voice) && /Light \(Piper\)/.test(voice) && /This PC's voice/i.test(voice), (voice.match(/Natural[^\n]*/) || ["no voice section"])[0].slice(0, 160));

/* window size is kept for next time */
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1000, 700); w.emit("resize"); });
const kept = JSON.parse(fs.readFileSync(path.join(data, "window.json"), "utf8"));
check("the window's size is remembered", kept.width === 1000 && kept.height === 700, JSON.stringify(kept));

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await app.close(); srv.close();
fs.rmSync(data, { recursive: true, force: true });
console.log(`windows shell: ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
