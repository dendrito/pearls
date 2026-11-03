// Sync end to end in two browsers: a signed-in browser on the web edition (served by `wrangler pages dev`) and a
// stand-in for the Android / Apple app (the same www/ served from another origin, linked with a code, using a token).
//   WRANGLER=/path/to/wrangler node test_sync_app.mjs     (must end "sync app: N/N")
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { webcrypto as C } from "node:crypto";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");   // the global install works too (NODE_PATH)

let pass = 0, n = 0;
const ok = (c, msg) => { n++; if (c) pass++; else console.log("FAIL", msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const W = process.env.WRANGLER || "npx wrangler";
const PORT = 8794, CERTS = 8793, APP = 8792, base = `http://localhost:${PORT}`, appBase = `http://127.0.0.1:${APP}`;
const b64u = b => Buffer.from(b).toString("base64url");
const kp = await C.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await C.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const certSrv = http.createServer((q, r) => { r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify({ keys: [jwk] })); }).listen(CERTS);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const appSrv = http.createServer((q, r) => {   // the "app": www/ on its own origin, no sign-in, like appassets.androidplatform.net
  let p = decodeURIComponent(new URL(q.url, appBase).pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join("www", path.normalize(p));
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader("Content-Type", types[path.extname(f)] || "application/octet-stream"); r.end(d); } });
}).listen(APP);
const vars = { SESSION_SECRET: "test-secret-0123456789", ACCESS_TEAM: "team", ACCESS_AUD: "AUD1", ADMIN_EMAILS: "admin@x.org", ACCESS_CERTS_URL: `http://localhost:${CERTS}/` };
fs.rmSync(".wrangler/state", { recursive: true, force: true });
const args = ["pages", "dev", "www", "--port", String(PORT), "--kv", "INVITES", ...Object.entries(vars).flatMap(([k, v]) => ["--binding", `${k}=${v}`])];
const [cmd, ...pre] = W.split(" ");
const dev = spawn(cmd, [...pre, ...args], { stdio: "ignore", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
for (let i = 0; i < 60; i++) { try { await fetch(base + "/signout"); break; } catch { await sleep(1000); } }

const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" })), c = b64u(JSON.stringify({ email: "reader@x.org", aud: ["AUD1"], iss: "https://team.cloudflareaccess.com", exp: Date.now() / 1000 + 600 }));
const jwt = h + "." + c + "." + b64u(await C.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, Buffer.from(h + "." + c)));
const passCookie = (await fetch(base + "/signin", { headers: { "Cf-Access-Jwt-Assertion": jwt }, redirect: "manual" })).headers.get("set-cookie").match(/pearls_pass=([^;]+)/)[1];

const browser = await chromium.launch();
const errors = [];
async function device(url, mode, cookie) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  if (cookie) await ctx.addCookies([{ name: "pearls_pass", value: cookie, url: base }]);
  await ctx.addInitScript(m => { window.PEARLS_SYNC_MODE = m; if (!localStorage.getItem("pearls:interests")) localStorage.setItem("pearls:interests", '["shabbat"]'); }, mode);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(url);
  return page;
}

// 1. The browser reads chapter 1 of Shabbat down to section 5 and likes it.
const web = await device(base + "/#ch-01-01", { base: "", token: false }, passCookie);
await web.waitForSelector("#sec-5", { timeout: 20000 });
await web.evaluate(() => document.getElementById("sec-5").scrollIntoView());
await sleep(1500);
ok(await web.evaluate(() => PEARLS.state.where && PEARLS.state.where.id === "01-01" && PEARLS.state.where.sec >= 5), "the reader's section is remembered");
await web.click('[data-act="like"][data-id="01-01"]');
ok(await web.evaluate(() => PEARLS.syncNow()), "the browser syncs");

// 2. Settings → Sync shows the sign-in, and makes a code for the app.
await web.click('[data-act="spelling"]');
await web.waitForSelector("[data-sync]");
ok((await web.textContent("[data-sync]")).includes("reader@x.org"), "Settings says who is signed in");
await web.click("[data-synccode]");
await web.waitForSelector("text=Link the app >> xpath=..");
const shot = async (pg, name) => { if (!process.env.SHOTS) return; await sleep(800); await pg.evaluate(() => document.querySelectorAll(".toast").forEach(t => t.remove())); await pg.screenshot({ path: path.join(process.env.SHOTS, name) }); };   // SHOTS=dir saves screenshots
await shot(web, "web-link-code.png");
const code = (await web.textContent(".dialog >> nth=-1")).match(/[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
ok(!!code, "the browser shows a link code");

// 3. The "app" (another origin, no cookie) links with the code.
const app = await device(appBase + "/", { base, token: true });
await web.bringToFront();
await app.waitForSelector(".hello");
ok(!(await app.locator("text=Continue reading").count()), "before linking, the app knows nothing");
await app.click('[data-act="spelling"]');
await app.fill("#syncCode", code.toLowerCase());
await app.click("[data-synclink]");
await app.waitForSelector("[data-syncunlink]", { timeout: 10000 });
ok((await app.textContent("[data-sync]")).includes("reader@x.org"), "the app is linked to the reader");
await app.evaluate(() => document.querySelector("[data-sync]").scrollIntoView()); await shot(app, "app-linked.png");
await app.click(".dialog [data-ok]");
await app.waitForSelector("text=Continue reading", { timeout: 5000 }).catch(() => {});
ok(await app.locator("text=Continue reading").count() > 0, "the app's Home offers to continue reading");
await app.evaluate(() => document.querySelector('[data-act="resumeread"]').scrollIntoView({ block: "center" })); await shot(app, "app-continue-reading.png");
ok(await app.evaluate(() => PEARLS.state.likes.has("01-01")), "the like came across");

// 4. Continue reading opens the chapter at that section.
await app.click('[data-act="resumeread"]');
await app.waitForSelector("#sec-5", { timeout: 20000 });
await sleep(600);
const top = await app.evaluate(() => document.getElementById("sec-5").getBoundingClientRect().top);
ok(Math.abs(top) < 120, `the chapter opens at section 5 (top ${Math.round(top)})`);

// 5. The app moves on; the browser picks it up when it comes back to the tab.
await app.evaluate(() => { document.getElementById("sec-9").scrollIntoView(); window.dispatchEvent(new Event("scroll")); });
await sleep(1500);
await app.evaluate(() => {   // and listens to chapter 2 for a while (as the player would save it)
  const plays = JSON.parse(localStorage.getItem("pearls:plays") || "{}");
  plays["01-02"] = { sec: 140, pos: 75.5, part: 1, done: false, n: 0, last: Date.now() };
  localStorage.setItem("pearls:plays", JSON.stringify(plays));
});
await app.evaluate(() => { const lq = { ids: ["01-02", "01-03"], idx: 0, ctx: "test" }; localStorage.setItem("pearls:lastQueue", JSON.stringify(lq)); });
await app.evaluate(() => { const a = JSON.parse(localStorage.getItem("pearls:syncAt")); a.lastQueue = Date.now(); localStorage.setItem("pearls:syncAt", JSON.stringify(a)); });
await app.goto(appBase + "/"); await app.waitForSelector(".hello"); await sleep(1500);
await app.evaluate(() => PEARLS.syncNow());
await web.goto(base + "/"); await web.waitForSelector(".hello"); await sleep(2000);
ok(await web.evaluate(() => PEARLS.state.where.sec >= 9), "the browser sees where the app got to");
ok(await web.evaluate(() => (PEARLS.state.plays["01-02"] || {}).pos === 75.5), "and the listening position");
ok(await web.evaluate(() => PEARLS.P.queue[PEARLS.P.idx] === "01-02" && PEARLS.state.plays["01-02"].part === 1), "the player is ready at the app's chapter and section");

// 6. Unlinking in the app stops it syncing.
await app.click('[data-act="spelling"]');
await app.click("[data-syncunlink]");
await app.waitForSelector("#syncCode");
ok(!(await app.evaluate(() => localStorage.getItem("pearls:syncToken")).then(v => JSON.parse(v || '""'))), "unlinking forgets the token");
ok(await app.evaluate(() => PEARLS.state.where && PEARLS.state.where.sec >= 9), "and keeps the progress on the device");

ok(errors.length === 0, "no page errors: " + errors.join(" | "));
await browser.close(); dev.kill(); certSrv.close(); appSrv.close();
console.log(`sync app: ${pass}/${n}`);
process.exit(pass === n ? 0 : 1);
