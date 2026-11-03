// Sign-in for the web edition (pearls.pages.dev). Two ways in, one pass:
//   1. Cloudflare Access (Google or an emailed code) on /signin and /admin. We verify Access's JWT ourselves.
//   2. A personal invite link /i/<token>, made on /admin and stored in the INVITES KV namespace, so it can be revoked.
// Either one sets the same signed, HttpOnly cookie ("pearls_pass") for PASS_DAYS.
// Settings (Pages → Settings → Variables and secrets / Bindings):
//   SESSION_SECRET  secret, long random string (signs the pass and invite links; changing it signs everyone out)
//   ACCESS_TEAM     your Zero Trust team name (the "xyz" in xyz.cloudflareaccess.com)
//   ACCESS_AUD      the Access application's Audience (AUD) tag
//   ADMIN_EMAILS    comma-separated emails allowed on /admin
//   ACCESS_CERTS_URL  (tests only) where to fetch Access's signing keys
//   INVITES         KV namespace binding (invite links; without it /admin cannot make links)
export const PASS = "pearls_pass";
export const PASS_DAYS = 90;
const enc = new TextEncoder();

export const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function sign(secret, obj) {
  const body = b64u(enc.encode(JSON.stringify(obj)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return body + "." + b64u(mac);
}
export async function unsign(secret, tok) {
  if (!tok || typeof tok !== "string") return null;
  const [body, mac] = tok.split(".");
  if (!body || !mac) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64u(mac), enc.encode(body)); } catch { return null; }
  if (!ok) return null;
  try {
    const o = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (o.exp && Date.now() > o.exp) return null;
    return o;
  } catch { return null; }
}

export function cookie(req, name) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
export async function passCookie(env, who) {
  const exp = Date.now() + PASS_DAYS * 864e5;
  const tok = await sign(env.SESSION_SECRET, { ...who, exp });
  return `${PASS}=${tok}; Path=/; Max-Age=${PASS_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearPass = `${PASS}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

// The pass is valid if its signature holds and, for an invite, the invite is still in KV (revoking deletes it).
export async function readPass(req, env) {
  const p = await unsign(env.SESSION_SECRET, cookie(req, PASS));
  if (!p) return null;
  if (p.via === "invite") {
    if (!env.INVITES) return null;
    const rec = await env.INVITES.get("inv:" + p.id, { cacheTtl: 60 });
    if (!rec) return null;
  }
  return p;
}

// Cloudflare Access JWT (RS256), from the Cf-Access-Jwt-Assertion header. Checks signature, issuer, audience, expiry.
let certCache = { at: 0, keys: null };
export async function accessEmail(req, env, fetchCerts) {
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion") || cookie(req, "CF_Authorization");
  if (!jwt || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(unb64u(parts[0]))); claims = JSON.parse(new TextDecoder().decode(unb64u(parts[1]))); } catch { return null; }
  if (head.alg !== "RS256") return null;
  const iss = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  if (claims.iss !== iss) return null;
  const auds = String(env.ACCESS_AUD).split(",").map(s => s.trim());
  if (![].concat(claims.aud).some(a => auds.includes(a))) return null;
  if (!claims.exp || Date.now() / 1000 > claims.exp) return null;
  if (!certCache.keys || Date.now() - certCache.at > 3600e3) {
    const r = await (fetchCerts || fetch)(env.ACCESS_CERTS_URL || iss + "/cdn-cgi/access/certs");   // override: tests only
    if (!r.ok) return null;
    certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = certCache.keys.find(k => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  return ok && claims.email ? String(claims.email).toLowerCase() : null;
}
export const isAdmin = (env, email) => !!email && String(env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).includes(email);

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function page(title, body, status = 200, extra = {}) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>
:root{--bg:#12110F;--ink:#EFE7D8;--mute:#a79f90;--line:#3a362f;--acc:#EFE7D8}
@media (prefers-color-scheme:light){:root{--bg:#EFE7D8;--ink:#12110F;--mute:#5f584c;--line:#cfc5b2;--acc:#12110F}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:48px 16px}h1{font-size:26px;margin:0 0 8px}p{color:var(--mute)}
a.btn,button{display:inline-block;background:var(--acc);color:var(--bg);border:0;border-radius:8px;padding:10px 16px;font:inherit;text-decoration:none;cursor:pointer}
button.ghost{background:none;color:var(--ink);border:1px solid var(--line)}
input{font:inherit;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:none;color:var(--ink);width:100%;box-sizing:border-box}
table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 4px;border-top:1px solid var(--line);vertical-align:top;font-size:14px}
code{word-break:break-all;font-size:13px}.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--ink);vertical-align:-1px;margin-right:6px}
</style></head><body><main>${body}</main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra } });
}
