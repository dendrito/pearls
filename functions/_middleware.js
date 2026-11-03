// Keep the web edition out of search engines until Yeshivat Har Bracha has agreed to a public Pearls.
// Remove this file (or the header) once permission is given.
export async function onRequest({ next }) {
  const r = await next();
  const res = new Response(r.body, r);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
