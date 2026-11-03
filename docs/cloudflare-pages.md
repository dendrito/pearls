# Web edition on Cloudflare Pages (pearls.pages.dev)

The web app is `www/`, as committed: no build step is needed. `functions/` holds two Pages Functions:

- `functions/proxy.js`: `/proxy?u=` fetches `https://ph.yhb.org.il/...` only (anything else is a 404). It is the web
  twin of the Android `AppServer` proxy and the Apple `pearls://` handler, because ph.yhb.org.il's CORS headers are
  malformed and a browser cannot read the Hebrew text directly. `www/index.html` switches it on for `*.pearls.pages.dev`.
- `functions/_middleware.js`: sends `X-Robots-Tag: noindex, nofollow` on every response, so search engines stay away
  until Yeshivat Har Bracha agrees to a public Pearls. Delete it after that.

## Cloudflare settings (Workers & Pages → Create → Pages → Connect to Git)

| Setting | Value |
|---|---|
| Repository | `dendrito/pearls` |
| Project name | `pearls` (gives `pearls.pages.dev`) |
| Production branch | `main` |
| Framework preset | None |
| Build command | *(empty)* |
| Build output directory | `www` |
| Root directory | *(empty, the repo root, so `functions/` is found)* |

Every push to `main` redeploys; other branches get preview URLs (`<branch>.pearls.pages.dev`).

## Keeping it private

A pages.dev site is public by default. To lock it to named people: Zero Trust → Access → Applications → Add →
Self-hosted, domain `pearls.pages.dev` (add a second one for `*.pearls.pages.dev` to cover previews), policy
"Allow" with the email addresses that may open it (one-time PIN login). Free for up to 50 users.
The Pages project's Settings → General → "Enable access policy" covers preview deployments only.
