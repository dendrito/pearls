// Sign-in for the web edition: runs functions/ under `wrangler pages dev` with a fake Access key server.
//   WRANGLER=/path/to/wrangler node test_webauth.mjs     (must end "webauth: N/N")
import { spawn } from "node:child_process";
import http from "node:http";
import { webcrypto as C } from "node:crypto";

const W = process.env.WRANGLER || "npx wrangler";
const PORT = 8798, CERTS = 8797, base = `http://localhost:${PORT}`;
const b64u = b => Buffer.from(b).toString("base64url");
const kp = await C.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await C.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const certSrv = http.createServer((q, r) => { r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify({ keys: [jwk] })); }).listen(CERTS);
async function jwt(email, { aud = "AUD1", iss = "https://team.cloudflareaccess.com", exp = Date.now() / 1000 + 600, key = kp.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" })), c = b64u(JSON.stringify({ email, aud: [aud], iss, exp }));
  return h + "." + c + "." + b64u(await C.subtle.sign("RSASSA-PKCS1-v1_5", key, Buffer.from(h + "." + c)));
}
const vars = { SESSION_SECRET: "test-secret-0123456789", ACCESS_TEAM: "team", ACCESS_AUD: "AUD1", ADMIN_EMAILS: "admin@x.org", ACCESS_CERTS_URL: `http://localhost:${CERTS}/` };
const args = ["pages", "dev", "www", "--port", String(PORT), "--kv", "INVITES", ...Object.entries(vars).flatMap(([k, v]) => ["--binding", `${k}=${v}`])];
const [cmd, ...pre] = W.split(" ");
const dev = spawn(cmd, [...pre, ...args], { stdio: "ignore", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
for (let i = 0; i < 60; i++) { try { await fetch(base + "/signout"); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }

let pass = 0, n = 0;
const ok = (c, msg) => { n++; if (c) pass++; else console.log("FAIL", msg); };
const get = (p, h = {}) => fetch(base + p, { headers: h, redirect: "manual" });
const passOf = r => (r.headers.get("set-cookie") || "").match(/pearls_pass=[^;]+/)?.[0];

let r = await get("/");
ok(r.status === 401 && (await r.text()).includes("Sign in with Google"), "no pass: sign-in page");
ok(r.headers.get("x-robots-tag")?.includes("noindex"), "noindex header");
ok((await get("/app.js")).status === 401, "static files are gated too");
ok((await get("/proxy?u=https%3A%2F%2Fph.yhb.org.il%2F")).status === 401, "proxy is gated");

ok((await get("/signin")).status === 403, "signin without Access token refused");
ok((await get("/signin", { "Cf-Access-Jwt-Assertion": await jwt("a@x.org", { aud: "OTHER" }) })).status === 403, "wrong audience refused");
ok((await get("/signin", { "Cf-Access-Jwt-Assertion": await jwt("a@x.org", { iss: "https://evil.cloudflareaccess.com" }) })).status === 403, "wrong issuer refused");
ok((await get("/signin", { "Cf-Access-Jwt-Assertion": await jwt("a@x.org", { exp: 1 }) })).status === 403, "expired token refused");
const other = await C.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
ok((await get("/signin", { "Cf-Access-Jwt-Assertion": await jwt("a@x.org", { key: other.privateKey }) })).status === 403, "forged signature refused");
r = await get("/signin", { "Cf-Access-Jwt-Assertion": await jwt("reader@x.org") });
const readerPass = passOf(r);
ok(r.status === 302 && readerPass, "Access sign-in sets a pass");
ok((await get("/", { Cookie: readerPass })).status === 200, "pass opens the app");
ok((await get("/", { Cookie: readerPass.replace(/.$/, c => c === "A" ? "B" : "A") })).status === 401, "tampered pass refused");

ok((await get("/admin", { "Cf-Access-Jwt-Assertion": await jwt("reader@x.org") })).status === 403, "non-admin kept off /admin");
const adm = { "Cf-Access-Jwt-Assertion": await jwt("admin@x.org"), Origin: base };
r = await get("/admin", adm);
ok(r.status === 200 && (await r.text()).includes("Make a link"), "admin page opens");
r = await fetch(base + "/admin", { method: "POST", headers: adm, body: new URLSearchParams({ name: "Daphna <test>", days: "30" }) });
let html = await r.text();
const link = html.match(/\/i\/([A-Za-z0-9_.-]+)/)?.[0];
ok(link && html.includes("Daphna &lt;test&gt;"), "admin makes an invite link (name escaped)");
r = await fetch(base + "/admin", { method: "POST", headers: { ...adm, Origin: "https://evil.example" }, body: new URLSearchParams({ name: "x" }) });
ok(r.status === 403, "cross-site admin post refused");

r = await get(link);
const invPass = passOf(r);
ok(r.status === 302 && invPass, "invite link sets a pass");
ok((await get("/", { Cookie: invPass })).status === 200, "invite pass opens the app");
ok((await get("/i/" + link.slice(3, -2) + "xx")).status === 403, "altered invite refused");

html = await (await get("/admin", adm)).text();
ok(/opened 1×/.test(html), "admin sees the link was opened");
const id = html.match(/name="cancel" value="([^"]+)"/)?.[1];
await fetch(base + "/admin", { method: "POST", headers: adm, body: new URLSearchParams({ cancel: id }) });
ok((await get(link)).status === 403, "cancelled link refused");
ok((await get("/", { Cookie: invPass })).status === 401, "cancelling also signs that person out");
ok((await get("/", { Cookie: readerPass })).status === 200, "Access pass unaffected");

dev.kill(); certSrv.close();
console.log(`webauth: ${pass}/${n}`);
process.exit(pass === n ? 0 : 1);
