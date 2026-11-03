// Every request to the web edition passes here.
// 1. noindex on everything, until Yeshivat Har Bracha agrees to a public Pearls (remove the header after that).
// 2. The site is private: without a valid pass (see webauth/auth.js) only the sign-in routes answer.
import { readPass, page } from "../webauth/auth.js";

const OPEN = [/^\/signin$/, /^\/signout$/, /^\/admin(\/|$)/, /^\/i\/[^/]+$/,
  /^\/api\/(sync|link|claim|devices)$/];   // the sync API checks the pass or a device token itself (webauth/sync.js)

export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  let res;
  if (!env.SESSION_SECRET) {
    res = page("Pearls", `<h1><span class="dot"></span>Pearls</h1><p>This site isn't set up yet: the SESSION_SECRET setting is missing.</p>`, 503);
  } else if (OPEN.some(r => r.test(path)) || await readPass(request, env)) {
    const r = await next();
    res = new Response(r.body, r);
  } else {
    res = page("Pearls · sign in", `<h1><span class="dot"></span>Pearls</h1>
<p>Pearls is private while we wait for permission from Yeshivat Har Bracha.</p>
<p><a class="btn" href="/signin">Sign in with Google or email</a></p>
<p>Were you sent an invite link? Open it and you're in.</p>`, 401);
  }
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
