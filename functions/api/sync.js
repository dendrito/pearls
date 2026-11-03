// /api/sync: GET returns your saved progress; POST {doc} merges a device's progress in and returns the combined copy.
import { caller, kv, json, preflight, mergeIn } from "../../webauth/sync.js";

export const onRequestOptions = preflight;

async function run(request, env, incoming) {
  if (!kv(env)) return json({ error: "Sync isn't set up: add a KV binding called SYNC (or INVITES)." }, 503);
  const me = await caller(request, env);
  if (!me) return json({ error: "Not signed in." }, 401);
  let out;
  try { out = await mergeIn(env, me.uid, incoming); } catch (e) { return json({ error: "That's more than sync can hold." }, 413); }
  if (me.via === "device" && Date.now() - (me.rec.last || 0) > 864e5) {   // "last seen", at most once a day per device
    await kv(env).put(`dev:${me.uid}:${me.dev}`, JSON.stringify({ ...me.rec, last: Date.now() }));
  }
  return json({ who: me.who, via: me.via, doc: out.doc, changed: out.changed });
}

export const onRequestGet = ({ request, env }) => run(request, env, null);

export async function onRequestPost({ request, env }) {
  if ((request.headers.get("Content-Length") | 0) > 1000000) return json({ error: "That's more than sync can hold." }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Expected JSON." }, 400); }
  if (!body || typeof body.doc !== "object") return json({ error: "Expected {doc}." }, 400);
  return run(request, env, body.doc);
}
