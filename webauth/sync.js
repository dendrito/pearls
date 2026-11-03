// Sync for the web edition: one saved copy of each reader's progress, so any device can pick up where they stopped.
// Who you are comes from the sign-in you already have (webauth/auth.js):
//   - in a browser on pearls.pages.dev, the Pearls pass cookie (Google, an emailed code, or an invite link);
//   - in the Android and Apple apps, a device token, which a signed-in browser hands over with a one-time link code.
// Storage is KV: the SYNC binding if there is one (namespace "pearls-sync"), otherwise the INVITES namespace the
// sign-in already uses, under its own prefixes. Keys:
//   sync:<uid>            the sync document (see www/pearls-sync-merge.js)
//   code:<CODE>           a link code, 10 minutes, one use: {uid, who}
//   dev:<uid>:<id>        a linked device: {id, name, made, last}; deleting it signs that device out
// <uid> is "e:<email>" for Google / email-code sign-ins and "i:<invite id>" for invite links.
import { readPass, unsign, sign } from "./auth.js";
import "../www/pearls-sync-merge.js";

export const M = globalThis.PearlsSyncMerge;
export const kv = env => env.SYNC || env.INVITES || null;
export const CODE_MIN = 10;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I

export const CORS = {
  "Access-Control-Allow-Origin": "*",          // the apps call from appassets.androidplatform.net and pearls://; they send a token, never a cookie
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400"
};
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
export const preflight = () => new Response(null, { status: 204, headers: CORS });

const uidOfPass = p => p.via === "access" ? "e:" + String(p.who).toLowerCase() : p.via === "invite" ? "i:" + p.id : null;

// The caller: {uid, who, via: "pass"|"device", dev}. null if not signed in.
export async function caller(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const t = await unsign(env.SESSION_SECRET, auth.slice(7).trim());
    if (!t || t.t !== "dev" || !t.uid || !t.id || !kv(env)) return null;
    const rec = await kv(env).get(`dev:${t.uid}:${t.id}`, { type: "json", cacheTtl: 60 });
    if (!rec) return null;                                   // unlinked
    if (t.uid.startsWith("i:")) {                            // an invite that was cancelled closes its devices too
      if (!env.INVITES || !(await env.INVITES.get("inv:" + t.uid.slice(2), { cacheTtl: 60 }))) return null;
    }
    return { uid: t.uid, who: t.who || "", via: "device", dev: t.id, rec };
  }
  const p = await readPass(request, env);
  const uid = p && uidOfPass(p);
  return uid ? { uid, who: p.who || "", via: "pass" } : null;
}

export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = [...b].map(x => ALPHA[x % ALPHA.length]).join("");
  return s.slice(0, 4) + "-" + s.slice(4);
}
export const normCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const codeKey = s => { const c = normCode(s); return c.length === 8 ? "code:" + c.slice(0, 4) + "-" + c.slice(4) : null; };

export async function deviceToken(env, uid, who, id) {
  return sign(env.SESSION_SECRET, { t: "dev", uid, who, id });   // no expiry: it lasts until the device is unlinked
}

// Read, merge in, write back. Writes only when something changed (KV's free tier allows 1,000 writes a day).
export async function mergeIn(env, uid, incoming) {
  const key = "sync:" + uid;
  const stored = await kv(env).get(key, { type: "json" }) || M.empty();
  const merged = incoming ? M.clean(M.merge(stored, incoming)) : M.merge(stored, {});
  const changed = !M.same(merged, M.merge(stored, {}));
  if (changed) await kv(env).put(key, JSON.stringify(merged));
  return { doc: merged, changed };
}
