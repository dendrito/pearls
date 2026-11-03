// /i/<token>: a personal invite link made on /admin. Valid while it is signed, unexpired and still in KV.
import { unsign, passCookie, page } from "../../webauth/auth.js";

export async function onRequestGet({ params, env }) {
  const inv = await unsign(env.SESSION_SECRET, params.token);
  const rec = inv && env.INVITES ? await env.INVITES.get("inv:" + inv.id, { type: "json" }) : null;
  if (!rec) return page("Pearls · invite", `<h1><span class="dot"></span>Pearls</h1>
<p>This invite link has expired or was cancelled. Ask whoever sent it for a new one.</p>`, 403);
  rec.used = (rec.used || 0) + 1; rec.last = Date.now();
  await env.INVITES.put("inv:" + inv.id, JSON.stringify(rec), { expiration: Math.floor(rec.exp / 1000) });
  return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": await passCookie(env, { via: "invite", id: inv.id, who: rec.name }) } });
}
