// Sync: the merge rules, then the API under `wrangler pages dev` (a browser pass, a linked app, unlinking, revoking).
//   WRANGLER=/path/to/wrangler node test_sync.mjs     (must end "sync: N/N")
import { spawn } from "node:child_process";
import http from "node:http";
import { webcrypto as C } from "node:crypto";
import { createRequire } from "node:module";
const M = createRequire(import.meta.url)("./www/pearls-sync-merge.js");

let pass = 0, n = 0;
const ok = (c, msg) => { n++; if (c) pass++; else console.log("FAIL", msg); };

/* ---- merge rules (no server) ---- */
const A = { plays: { "01-01": { sec: 300, pos: 40, part: 2, done: false, n: 0, last: 100 } }, read: { "01-02": 50 }, days: { "2026-11-01": { min: 5, ch: ["01-01"] } },
  whole: { likes: { at: 10, val: ["01-01"] }, where: { at: 30, val: { id: "01-01", sec: 3, at: 30 } } } };
const B = { plays: { "01-01": { sec: 200, pos: 90, part: 4, done: false, n: 1, last: 200 }, "02-03": { sec: 10, pos: 10, part: 0, last: 5 } },
  read: { "01-03": 60 }, gone: { read: { "01-02": 70 } }, days: { "2026-11-01": { min: 9, ch: ["02-03"] } },
  whole: { likes: { at: 20, val: [] }, prefs: { at: 5, val: { skin: "riso" } }, bogus: { at: 99, val: 1 } } };
const ab = M.merge(A, B), ba = M.merge(B, A);
ok(M.same(ab, ba), "merge is commutative");
ok(M.same(M.merge(ab, ab), ab) && M.same(M.merge(ab, A), ab), "merge is idempotent");
ok(ab.plays["01-01"].part === 4 && ab.plays["01-01"].pos === 90, "the newer listening position wins");
ok(ab.plays["01-01"].sec === 300 && ab.plays["01-01"].n === 1, "time listened and plays never go down");
ok(!ab.read["01-02"] && ab.read["01-03"], "an unmark after the mark removes it; other marks stay");
ok(M.same(M.merge(ab, { read: { "01-02": 80 } }).read["01-02"], 80), "marking again after the unmark brings it back");
ok(ab.days["2026-11-01"].min === 9 && ab.days["2026-11-01"].ch.length === 2, "study log: larger minutes, union of chapters");
ok(M.same(ab.whole.likes.val, []) && ab.whole.where.val.sec === 3 && ab.whole.prefs.val.skin === "riso", "whole keys: the copy changed last wins");
ok(!ab.whole.bogus, "unknown keys are dropped");
let big = false; try { M.clean({ measured: Object.fromEntries(Array.from({ length: 60000 }, (_, i) => ["x" + i, 123456])) }); } catch { big = true; }
ok(big, "oversize documents are refused");

/* ---- the API ---- */
const W = process.env.WRANGLER || "npx wrangler";
const PORT = 8796, CERTS = 8795, base = `http://localhost:${PORT}`;
const b64u = b => Buffer.from(b).toString("base64url");
const kp = await C.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await C.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const certSrv = http.createServer((q, r) => { r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify({ keys: [jwk] })); }).listen(CERTS);
async function jwt(email) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" })), c = b64u(JSON.stringify({ email, aud: ["AUD1"], iss: "https://team.cloudflareaccess.com", exp: Date.now() / 1000 + 600 }));
  return h + "." + c + "." + b64u(await C.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, Buffer.from(h + "." + c)));
}
const vars = { SESSION_SECRET: "test-secret-0123456789", ACCESS_TEAM: "team", ACCESS_AUD: "AUD1", ADMIN_EMAILS: "admin@x.org", ACCESS_CERTS_URL: `http://localhost:${CERTS}/` };
const args = ["pages", "dev", "www", "--port", String(PORT), "--kv", "INVITES", ...Object.entries(vars).flatMap(([k, v]) => ["--binding", `${k}=${v}`])];
const [cmd, ...pre] = W.split(" ");
const dev = spawn(cmd, [...pre, ...args], { stdio: "ignore", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
for (let i = 0; i < 60; i++) { try { await fetch(base + "/signout"); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }

const passOf = r => (r.headers.get("set-cookie") || "").match(/pearls_pass=[^;]+/)?.[0];
const call = (p, { method = "GET", cookie, token, body, origin } = {}) => fetch(base + p, { method, redirect: "manual",
  headers: { ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: "Bearer " + token } : {}), ...(origin ? { Origin: origin } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

ok((await call("/api/sync")).status === 401, "no pass: sync refused");
ok((await call("/api/sync", { token: "junk.junk" })).status === 401, "bad token refused");
const cookie = passOf(await fetch(base + "/signin", { headers: { "Cf-Access-Jwt-Assertion": await jwt("Reader@x.org") }, redirect: "manual" }));
let r = await call("/api/sync", { method: "POST", cookie, body: { doc: A } }), j = await r.json();
ok(r.status === 200 && j.who === "reader@x.org" && j.doc.plays["01-01"].pos === 40 && j.changed, "browser pushes its progress");
j = await (await call("/api/sync", { method: "POST", cookie, body: { doc: A } })).json();
ok(j.changed === false, "an unchanged push writes nothing");

ok((await call("/api/link", { method: "POST" })).status === 401, "link code needs a sign-in");
ok((await call("/api/link", { method: "POST", cookie, origin: "https://evil.example" })).status === 403, "cross-site link request refused");
const code = (await (await call("/api/link", { method: "POST", cookie, origin: base })).json()).code;
ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), "browser gets a link code");
ok((await call("/api/claim", { method: "POST", body: { code: "AAAA-AAAA" } })).status === 404, "wrong code refused");
r = await call("/api/claim", { method: "POST", body: { code: code.toLowerCase().replace("-", " "), device: "Android app" } }); j = await r.json();
const token = j.token;
ok(r.status === 200 && token && j.who === "reader@x.org", "app trades the code for a device token (typed loosely)");
ok((await call("/api/claim", { method: "POST", body: { code } })).status === 404, "a code works once");
const pf = await fetch(base + "/api/sync", { method: "OPTIONS", headers: { Origin: "https://appassets.androidplatform.net", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
ok(pf.status === 204 && pf.headers.get("access-control-allow-headers")?.includes("Authorization"), "CORS preflight for the apps");

r = await call("/api/sync", { token }); j = await r.json();
ok(r.status === 200 && j.doc.plays["01-01"].pos === 40 && r.headers.get("access-control-allow-origin") === "*", "the app sees the browser's place");
j = await (await call("/api/sync", { method: "POST", token, body: { doc: B } })).json();
ok(j.doc.plays["01-01"].part === 4 && !j.doc.read["01-02"], "the app's newer place is merged in");
j = await (await call("/api/sync", { cookie })).json();
ok(j.doc.plays["01-01"].part === 4 && j.doc.whole.prefs.val.skin === "riso", "and the browser sees it");

j = await (await call("/api/devices", { cookie })).json();
ok(j.devices.length === 1 && j.devices[0].name === "Android app", "browser lists linked apps");
const other = passOf(await fetch(base + "/signin", { headers: { "Cf-Access-Jwt-Assertion": await jwt("someone@x.org") }, redirect: "manual" }));
j = await (await call("/api/sync", { cookie: other })).json();
ok(!j.doc.plays["01-01"], "another reader has their own copy");
await call("/api/devices", { method: "POST", cookie: other, origin: base, body: { remove: (await (await call("/api/devices", { cookie })).json()).devices[0].id } });
ok((await call("/api/sync", { token })).status === 200, "nobody else can unlink your device");
await call("/api/devices", { method: "POST", token, body: { remove: "self" } });
ok((await call("/api/sync", { token })).status === 401, "unlinking signs the app out");

// an invite link's devices close when the invite is cancelled
const adm = { "Cf-Access-Jwt-Assertion": await jwt("admin@x.org"), Origin: base };
const html = await (await fetch(base + "/admin", { method: "POST", headers: adm, body: new URLSearchParams({ name: "Guest", days: "5" }) })).text();
const invPass = passOf(await fetch(base + html.match(/\/i\/[A-Za-z0-9_.-]+/)[0], { redirect: "manual" }));
const icode = (await (await call("/api/link", { method: "POST", cookie: invPass, origin: base })).json()).code;
const itok = (await (await call("/api/claim", { method: "POST", body: { code: icode } })).json()).token;
ok((await call("/api/sync", { token: itok })).status === 200, "an invited reader can link an app");
const ahtml = await (await fetch(base + "/admin", { headers: adm })).text();
await fetch(base + "/admin", { method: "POST", headers: adm, body: new URLSearchParams({ cancel: ahtml.match(/name="cancel" value="([^"]+)"/)[1] }) });
await new Promise(r => setTimeout(r, 300));
ok((await call("/api/sync", { token: itok })).status === 401, "cancelling the invite closes that reader's apps too");

dev.kill(); certSrv.close();
console.log(`sync: ${pass}/${n}`);
process.exit(pass === n ? 0 : 1);
