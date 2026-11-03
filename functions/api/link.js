// /api/link: a signed-in browser asks for a one-time code to link the Android or Apple app (10 minutes, one use).
import { caller, kv, json, newCode, CODE_MIN } from "../../webauth/sync.js";

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") && request.headers.get("Origin") !== origin) return json({ error: "Forbidden" }, 403);
  if (!kv(env)) return json({ error: "Sync isn't set up." }, 503);
  const me = await caller(request, env);
  if (!me || me.via !== "pass") return json({ error: "Sign in on pearls.pages.dev first." }, 401);
  const code = newCode();
  await kv(env).put("code:" + code, JSON.stringify({ uid: me.uid, who: me.who }), { expirationTtl: CODE_MIN * 60 });
  return json({ code, minutes: CODE_MIN });
}
