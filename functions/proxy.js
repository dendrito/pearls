// Cloudflare Pages Function: /proxy?u=<url>
// The web edition's twin of the Android app's AppServer.proxy() and the Apple app's pearls:// handler.
// ph.yhb.org.il sends malformed (duplicate) CORS headers, so a browser cannot read its Hebrew text directly.
// Only https://ph.yhb.org.il/ and Har Bracha's file host cdn1.yhb.org.il (where some study bookmarks live, see
// www/daily-pearl.js) are fetched; anything else is a 404, so this is never an open proxy.
const HOSTS = ["ph.yhb.org.il", "cdn1.yhb.org.il"];
const UA = "Pearls (web; https://pearls.pages.dev)";

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get("u");
  let t;
  try { t = new URL(target); } catch { return new Response("Not Found", { status: 404 }); }
  if (t.protocol !== "https:" || !HOSTS.includes(t.hostname)) return new Response("Not Found", { status: 404 });
  // Redirects are followed by hand, at most three, and only while they stay on the allowed hosts.
  let r;
  for (let hop = 0; ; hop++) {
    try {
      r = await fetch(t.toString(), {
        headers: { "User-Agent": UA, "Accept": "application/json" },
        cf: { cacheTtl: 86400, cacheEverything: true },   // the text changes rarely; spare their server
        redirect: "manual",
      });
    } catch { return new Response("Bad Gateway", { status: 502 }); }
    if (r.status < 300 || r.status >= 400) break;
    let next;
    try { next = new URL(r.headers.get("Location") || "", t); } catch { next = null; }
    if (hop >= 3 || !next || next.protocol !== "https:" || !HOSTS.includes(next.hostname))
      return new Response("Bad Gateway", { status: 502 });
    t = next;
  }
  let ct = (r.headers.get("Content-Type") || "application/json").split(";")[0].trim();
  // This answer is served from Pearls' own address, so a page from elsewhere must never run here as HTML.
  const headers = { "Content-Type": ct + "; charset=utf-8", "Cache-Control": "public, max-age=3600",
                    "X-Content-Type-Options": "nosniff" };
  if (ct === "text/html") headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
  return new Response(r.body, {
    status: r.status,
    headers,
  });
}
