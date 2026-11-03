// /api/claim: the app trades a link code for its own device token. Open (the code is the proof), one use.
import { kv, json, preflight, codeKey, deviceToken } from "../../webauth/sync.js";

export const onRequestOptions = preflight;

export async function onRequestPost({ request, env }) {
  if (!kv(env)) return json({ error: "Sync isn't set up." }, 503);
  let body = {};
  try { body = await request.json(); } catch {}
  const key = codeKey(body.code);
  const rec = key && await kv(env).get(key, { type: "json" });
  if (!rec) return json({ error: "That code didn't work. Codes last 10 minutes and work once: make a new one." }, 404);
  await kv(env).delete(key);
  const id = crypto.randomUUID();
  const name = String(body.device || "A device").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) || "A device";
  await kv(env).put(`dev:${rec.uid}:${id}`, JSON.stringify({ id, name, made: Date.now(), last: Date.now() }));
  return json({ token: await deviceToken(env, rec.uid, rec.who, id), who: rec.who });
}
