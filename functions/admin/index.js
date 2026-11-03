// /admin: make and cancel invite links. Behind Cloudflare Access, and only for ADMIN_EMAILS.
import { accessEmail, isAdmin, sign, esc, page, passCookie } from "../../webauth/auth.js";

const nice = t => new Date(t).toISOString().slice(0, 10);

async function list(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.INVITES.list({ prefix: "inv:", cursor });
    for (const k of r.keys) { const v = await env.INVITES.get(k.name, { type: "json" }); if (v) out.push(v); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.made - a.made);
}

async function render(env, origin, email, made) {
  const rows = (await list(env)).map(v => `<tr><td><b>${esc(v.name)}</b><br>made ${nice(v.made)}, ends ${nice(v.exp)}<br>
opened ${v.used || 0}×${v.last ? ", last " + nice(v.last) : ""}</td>
<td><form method="post"><input type="hidden" name="cancel" value="${esc(v.id)}"><button class="ghost">Cancel</button></form></td></tr>`).join("");
  const fresh = made ? `<p>Link for <b>${esc(made.name)}</b>. Send it to them; it works until ${nice(made.exp)}.</p>
<p><code>${esc(origin + "/i/" + made.token)}</code></p>` : "";
  return page("Pearls · admin", `<h1><span class="dot"></span>Invite links</h1>
<p>Signed in as ${esc(email)}. People on the Cloudflare Access list sign in with Google or an email code; anyone else needs a link from here. Anyone holding a link gets in, so send it to one person.</p>
${fresh}
<form method="post"><p><input name="name" required maxlength="80" placeholder="Who is it for? (e.g. Daphna, Har Bracha)"></p>
<p><input name="days" type="number" min="1" max="365" value="30" style="width:7em"> days &nbsp;<button>Make a link</button></p></form>
<table>${rows || "<tr><td>No invite links yet.</td></tr>"}</table>
<p><a href="/">Back to Pearls</a> · <a href="/signout">Sign out</a></p>`);
}

async function gate(request, env) {
  const email = await accessEmail(request, env);
  if (!isAdmin(env, email)) return { deny: page("Pearls · admin", `<h1><span class="dot"></span>Pearls</h1><p>This page is for Pearls' admin only.</p>`, 403) };
  if (!env.INVITES) return { deny: page("Pearls · admin", `<h1>Invite links</h1><p>Add a KV namespace binding called INVITES to the Pages project first.</p>`, 503) };
  return { email };
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env); if (g.deny) return g.deny;
  const res = await render(env, new URL(request.url).origin, g.email);
  res.headers.append("Set-Cookie", await passCookie(env, { via: "access", who: g.email }));   // the admin can use the app too
  return res;
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env); if (g.deny) return g.deny;
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") && request.headers.get("Origin") !== origin) return new Response("Forbidden", { status: 403 });
  const f = await request.formData();
  if (f.get("cancel")) {
    await env.INVITES.delete("inv:" + String(f.get("cancel")));
    return render(env, origin, g.email);
  }
  const name = String(f.get("name") || "").trim().slice(0, 80);
  const days = Math.min(365, Math.max(1, parseInt(f.get("days"), 10) || 30));
  if (!name) return render(env, origin, g.email);
  const id = crypto.randomUUID();
  const exp = Date.now() + days * 864e5;
  const rec = { id, name, made: Date.now(), exp, by: g.email, used: 0 };
  await env.INVITES.put("inv:" + id, JSON.stringify(rec), { expiration: Math.floor(exp / 1000) });
  const token = await sign(env.SESSION_SECRET, { id, exp });
  return render(env, origin, g.email, { name, exp, token });
}
