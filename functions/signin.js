// /signin sits behind Cloudflare Access (Google or an emailed code). Access only lets through emails on its policy;
// we check its signed token again and hand out the Pearls pass.
import { accessEmail, passCookie, page } from "../webauth/auth.js";

export async function onRequestGet({ request, env }) {
  const email = await accessEmail(request, env);
  if (!email) return page("Pearls · sign in", `<h1><span class="dot"></span>Pearls</h1>
<p>Sign-in didn't come through Cloudflare Access, or this email isn't on the list. Ask Pearls' admin to add you.</p>`, 403);
  return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": await passCookie(env, { via: "access", who: email }) } });
}
