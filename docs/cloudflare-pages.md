# Web edition on Cloudflare Pages (pearls.pages.dev)

The web app is `www/`, as committed: no build step is needed. `functions/` holds two Pages Functions:

- `functions/proxy.js`: `/proxy?u=` fetches `https://ph.yhb.org.il/...` only (anything else is a 404). It is the web
  twin of the Android `AppServer` proxy and the Apple `pearls://` handler, because ph.yhb.org.il's CORS headers are
  malformed and a browser cannot read the Hebrew text directly. `www/index.html` switches it on for `*.pearls.pages.dev`.
- `functions/_middleware.js`: requires a sign-in (see below), and sends `X-Robots-Tag: noindex, nofollow` on every
  response, until Yeshivat Har Bracha agrees to a public Pearls.

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

## Sign-in (the site is private)

Without a pass, every page (the app, its files and the proxy) shows a sign-in page. There are two ways in, and both
give the same pass: a signed, HttpOnly cookie that lasts 90 days. The code is in `webauth/auth.js` and
`functions/{_middleware,signin,signout}.js`, `functions/i/[token].js` and `functions/admin/index.js`. Run
`WRANGLER=<path to wrangler> node test_webauth.mjs`, which must end "webauth: 23/23".

1. **Google or an emailed code.** This is Cloudflare Access on `/signin` and `/admin` only. Access lets in the emails on
   its policy, and `/signin` checks Access's signed token again before it sets the pass.
2. **Invite links.** The admin makes one per person on `/admin` (name and number of days) and sends it. Opening it
   sets the pass. Each link is stored in the KV namespace and can be cancelled on `/admin`, which also signs that
   person out within about a minute. Anyone holding a link gets in, so send each one to one person only.

### One-time setup

1. **Zero Trust → Settings → Authentication → Login methods:** add **Google**. One-time PIN is there already.
2. **Zero Trust → Access → Applications → Add → Self-hosted**, named "Pearls sign-in".
   - Domains: `pearls.pages.dev` with path `signin`, plus a second entry, `pearls.pages.dev` with path `admin`.
   - Login methods: Google and One-time PIN.
   - Policy "Pearls readers", action Allow, Include → Emails: your address, plus anyone else who should sign in this way.
   - Once it is saved, copy the application's **Audience (AUD) tag** from its Overview.
3. **Workers & Pages → KV → Create**, a namespace named `pearls-invites`.
4. **Pages project → Settings**:
   - Bindings: add a KV namespace, variable name `INVITES`, pointing at `pearls-invites`.
   - Variables and secrets (Production):

     | Name | Value |
     |---|---|
     | `SESSION_SECRET` | a Secret: a long random string |
     | `ACCESS_TEAM` | your team name (the `xyz` in `xyz.cloudflareaccess.com`, shown under Zero Trust → Settings → Custom pages) |
     | `ACCESS_AUD` | the AUD tag from step 2 |
     | `ADMIN_EMAILS` | your email; separate several with commas |

   Then redeploy, which also makes the settings take effect.

**Adding people:** for Google or a code, add their email to the "Pearls readers" policy. For a link, use `/admin`.
**Signing everyone out:** change `SESSION_SECRET`. This also cancels every invite link.
Preview deployments have no `SESSION_SECRET` and answer "not set up", so they stay closed.


## Sync: pick up where you stopped on any device

Signing in is the sign-up: whoever can open pearls.pages.dev (Google, an email code or an invite link) has a sync
account, keyed by their email (or by the invite, for invite links). The code is `functions/api/*.js`,
`webauth/sync.js` and `www/pearls-sync-merge.js` (the merge rules, shared by the app and the server).

- **What syncs:** where you stopped reading (chapter and section) and listening (chapter, section, position, the
  queue), finished chapters, the study log, likes, Review / Study later lists, playlists, saved passages, the daily
  plan and settings. Text size, downloads and the Meldar study record stay on each device.
- **Browsers** on pearls.pages.dev sync on their own: the pass cookie says who you are.
- **The Android and Apple apps** link once: in a signed-in browser, Settings → Sync across devices → *Link the
  Android or Apple app* shows a code (10 minutes, one use); type it into the app's Settings. The app then holds its
  own device token. The browser's Settings lists linked apps and can unlink them; cancelling an invite link closes
  that person's apps too, and changing `SESSION_SECRET` closes every app.
- **Storage:** nothing new to set up. It uses the `INVITES` KV namespace that sign-in already has, under its own
  prefixes (`sync:`, `code:`, `dev:`). To keep it separate, create a KV namespace `pearls-sync` and bind it as `SYNC`;
  it is used instead when present (existing copies stay in `INVITES`, so bind it before people start syncing).
- **Limits:** KV's free plan allows 1,000 writes a day for the whole account. A device writes only when something
  changed: every few seconds after you stop, at most every 2 minutes while audio plays, and when the app goes to the
  background, so an hour of listening is about 30 writes. With more than a handful of daily readers, move to Workers
  Paid or to D1. KV copies can take up to a minute to reach other parts of the world, so a device on another continent
  may need a moment to see the latest place.
- **Tests:** `WRANGLER=… node test_sync.mjs` (merge rules plus the API; must end "sync: 30/30") and
  `WRANGLER=… node test_sync_app.mjs` (two browsers, one standing in for the app; must end "sync app: 15/15").

## When a merge to main doesn't deploy

The Deployments page should show a new row for each commit on main. If it keeps showing an old commit, Cloudflare has
lost access to the repository (the dashboard says "disconnected from Git account"). "Retry deployment" on an old row
only rebuilds that old commit, so it won't help. Instead, open github.com/settings/installations, click Configure next
to *Cloudflare Workers and Pages*, and make sure dendrito/pearls is in its repository list. Then push any commit to
main to start a build.
