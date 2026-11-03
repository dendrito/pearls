// /api/devices: GET lists the apps linked to your sign-in; POST {remove: id} unlinks one ("self" = the caller).
import { caller, kv, json, preflight } from "../../webauth/sync.js";

export const onRequestOptions = preflight;

async function list(env, uid) {
  const out = [];
  let cursor;
  do {
    const r = await kv(env).list({ prefix: `dev:${uid}:`, cursor });
    for (const k of r.keys) { const v = await kv(env).get(k.name, { type: "json" }); if (v) out.push(v); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.made - a.made);
}

export async function onRequestGet({ request, env }) {
  if (!kv(env)) return json({ error: "Sync isn't set up." }, 503);
  const me = await caller(request, env);
  if (!me) return json({ error: "Not signed in." }, 401);
  return json({ who: me.who, devices: await list(env, me.uid), self: me.dev || null });
}

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  const me = kv(env) && await caller(request, env);
  if (!me) return json({ error: "Not signed in." }, 401);
  if (me.via === "pass" && request.headers.get("Origin") && request.headers.get("Origin") !== origin) return json({ error: "Forbidden" }, 403);
  let body = {};
  try { body = await request.json(); } catch {}
  const id = body.remove === "self" ? me.dev : String(body.remove || "");
  if (!id) return json({ error: "Nothing to unlink." }, 400);
  await kv(env).delete(`dev:${me.uid}:${id}`);
  return json({ ok: true, devices: await list(env, me.uid) });
}
