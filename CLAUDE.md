# Pearls: notes for Claude Code

Pearls is an English *Peninei Halakha* (Rabbi Eliezer Melamed, Yeshivat Har Bracha) reader and listener. One web app (`www/`)
ships four ways:

- an Android APK, built without the Android SDK;
- an iPad / iPhone / Mac app (`apple/`, WKWebView);
- a Windows app (`windows/`, Electron);
- a web artifact on claude.ai.

Pearls is its own project, with its own claude.ai project "Pearls". Meldar (meldar.pages.dev) is a separate product.
Pearls links to it in three places: the "Open in Meldar" button, the `pearls-study-log/1` export, and the shared S&P
(KTS) spelling rules. Meldar's own work, such as its font fix, lives with Meldar, not here.

Start with `handoff/HANDOFF.md`: it records what was decided in the original chat and what is still open. The full
original chat is in `handoff/chat-transcript.jsonl.gz` (`zcat … | jq` for detail).

## Build and test

    ./build.sh                       # books -> www -> dist/Pearls-<ver>.apk + dist/Pearls-Apple.zip  (~40 s)
    PEARLS_FULL=1 ./build.sh         # bundle the Hebrew too (offline, bigger)
    python3 test_app.py              # Playwright smoke test of www/ (offline); must end "errors: none"

- The APK must be signed with the existing `signer/key.pem` + `signer/cert.pem`. They are not in git; ask the user for them.
  Without the same key, Android refuses to install over the old app.
- To release a new APK, bump `versionCode` and `versionName` in `android/AndroidManifest.xml`. Also bump
  `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `apple/Pearls.xcodeproj/project.pbxproj`.
- The APK pipeline runs: aapt2 (`tools/`), then javac against `tools/android.jar` and D8 (`tools/r8lib.jar`, R8 8.5.35 from
  Google's r8-releases bucket), then an aligned zip, then `signer/sign.mjs` (signature schemes v1, v2 and v3).
- Text: all official English is bundled (`www/en/`, from `fetch_en_text.py` -> `src/en/` -> `make_en_books.py`), and so are
  the AI translations. Hebrew is fetched from ph.yhb.org.il and then kept on the phone.
- `./build.sh` also makes `dist/Pearls-<ver>.aab`, the Play upload. `android/build_aab.py` assembles it from aapt2's
  protobuf output and signs it with jarsigner. `tools/bundletool-all-1.17.2.jar` only validates it; it came from the
  npm package `bundletoolheavy`, because Google's own hosts aren't reachable from the build machine.
- Tests:
  - `python3 test_offline.py`: downloads, offline mode and headphones, against a stand-in for the Android bridge.
    It must end "32/32 checks passed".
  - `python3 test_playmodes.py`: playback order, smart downloads that follow it, and the Review / Study later lists.
    It must end "17/17 checks passed".
  - `python3 test_spelling.py`: the spelling schemes (Original, Neo-Classic S&P), "Use English words where the book
    does", the Ashkenaz exception and the `#spelling` page. It must end "spelling: 11/11".
  - `python3 tts/test_speech.py`: Hebrew terms in any spelling reach the AI voice in a sayable form, English words
    untouched. It must end "speech: 6/6".
  - `python3 test_flat.py`: the flat rule (see Rules). It must end "flat: no soft gradients or blurs".
  - `python3 test_fonts.py`: the font hard rule (see Rules). It must end "fonts: all letters covered".
  - `python3 test_calendar.py`: calendar dates and postponements. It must end "calendar: 14/14".
  - `node test_cite_links.js`: citation links (the grammar plus Pearls' layer, offline). It must end "cite links: 13/13".
  - `python3 test_android_shell.py`: the https app address, the data handover and the bundled fonts. It must end
    "6/6 checks passed".
  - `WRANGLER=… node test_sync.mjs`: sync's merge rules and API (`wrangler pages dev`). It must end "sync: 30/30".
  - `WRANGLER=… node test_sync_app.mjs`: sync end to end, a signed-in browser plus a stand-in for the app. It must end
    "sync app: 15/15". Needs Playwright (`NODE_PATH=$(npm root -g)`).
  - `python3 test_apple_shell.py`: the Apple bridge (`native-shim.js` against a stand-in for the Swift side), the
    device word ("on this iPad") and the iPad side rail. It must end "apple shell: 16/16". The Swift itself only
    builds on a Mac: `apple/README.md` has the steps.
  - `NODE_PATH=$(npm root -g) xvfb-run -a node test_windows_shell.mjs` (after `cd windows && npm ci`): the real
    Windows shell, `windows/main.js`, launched with this www/. It must end "windows shell: 24/24".

## Windows app (2.6.2)

- `windows/main.js` serves www on `app://pearls/` and gives the page Android's `PearlsNative` bridge, answered
  synchronously over IPC (`windows/preload.js`): downloads into `%APPDATA%\Pearls\dl` (served at `/dl/` with byte
  ranges), kept Hebrew in `text/`, `/proxy?u=` for ph.yhb.org.il only. `PEARLS_SHELL = "windows"`, so the page says
  "this PC" (`SHELL_WORD`) and hides the Wi-Fi-only switches (`DESKTOP`).
- Voices, sync and the media keys need nothing from the shell: Kokoro/Piper run in Chromium as on the web, sync uses
  the app token flow, and `navigator.mediaSession` reaches Windows' media overlay. The shell adds taskbar
  prev/play/next, a sleep blocker while playing, and a headphones-gone check (an output device vanishes).
- Build: `./windows/build_windows.sh` (installer + zip, x64 and arm64, into `dist/windows/`). On Linux it needs Wine;
  the "Windows app" GitHub Action builds on Windows instead. The installer is not code-signed. `windows/README.md`.

## Android 2.0 shell (Google Play ready)

- Targets Android 16 (API 36). The code is compiled against `tools/android.jar` (API 33): Play checks only the
  target, and everything used exists in API 33.
- **App address:** the app is served from `https://appassets.androidplatform.net/www/` by `AppServer.java`, with file
  access switched off.
  - `/dl/NAME` serves downloads, with Range support for seeking.
  - `/proxy?u=` fetches ph.yhb.org.il natively; `index.html` sets `PEARLS_PROXY` on that host.
- **Moving saved data:** the first 2.0 launch opens `www/migrate.html` (file://), which passes the old localStorage
  to `saveMigration`. `index.html` takes it back with `takeMigration`.
- **Edge to edge:** the WebView sits in a FrameLayout padded by the system bar, cutout and keyboard insets.
  `setBars` colours that frame with the skin's colour and sets light or dark bar icons.
- **Background playback:** `PlaybackService` is a mediaPlayback foreground service with a MediaStyle notification
  (also shown on the lock screen), tied to the MediaSession, and holds a partial wake lock while playing.
- **Back:** handled through OnBackInvokedCallback. At the app's root, back sends the app to the background instead of
  closing it.
- **Fonts:** the Latin web fonts are bundled (`www/fonts/web/`, made by `fetch_webfonts.py` from Fontsource).

## What is translated

Every chapter is one of three kinds, from `kindOf(t)` in `www/app.js`: **Official English** (Har Bracha's translation,
the volumes in `catalog.js`), **AI translation** (a Hebrew-only volume whose chapter has a bundled translation) or
**Hebrew only** (not translated yet). Books (`#books`, `#books-official|ai|he`), a mixed book's page (`#vol-20-he`) and
Search filter by it, and track rows and book cards carry a flat tag (`.kindtag`). The Books and Search filters are
remembered in `prefs.booksKind` / `prefs.searchKind`.

## Offline and downloads (Android)

- `android/java/.../PearlsBridge.java` is `window.PearlsNative`:
  - DownloadManager downloads into `<external app files>/dl/NAME.part`, which is renamed to NAME when finished, plus
    `info`, `list` and `remove`;
  - Hebrew text files in `<app files>/text/`;
  - `setBars`, so the status and navigation bars follow the skin.
- In `www/app.js`, the "downloads" section covers download state per chapter, `smartRun()` (smart downloads) and the
  `#downloads` page. Audio plays from `file://` when a file is on the phone and streams otherwise.
- Smart downloads keep the current chapter plus N ahead in the queue, along with the 2 most recent unfinished chapters.
  - Smart downloads you've heard are deleted.
  - There's a storage cap: the oldest smart downloads make room, heard ones first, and nothing is deleted if the new
    chapter wouldn't fit anyway.
  - Chapters the user downloads are never deleted automatically.
- Headphones: MainActivity listens for Android's "audio becoming noisy" warning (Bluetooth earbuds disconnect, wired
  headphones unplugged). It also runs a MediaSession, so earbud buttons and in-ear detection reach the player. Both call
  `window.PEARLS_MEDIA(cmd)`, and the page reports playback back through `PearlsNative.mediaState`. Whether a disconnect
  pauses is the user's setting, `prefs.unplugPause` (on by default; Settings → Pause when headphones disconnect).
- **Playback order** (2.5; Now Playing → the order pill, `prefs.playMode`): In order, Continue the book, Shuffle,
  Repeat chapter, Repeat queue, Repeat section (chazara). `upcoming(n)` says what will play next in that mode.
  - Smart downloads fetch, in this order: the chapter playing, then `upcoming()` (heard chapters too, when a repeat
    mode will play them again), then chapters partway through, then up to two from Review (due within a day) and
    Study later.
  - Auto-delete spares anything in that list.
- **Lists** (2.5; `state.lists`, device-only), each a playlist in Library → Your lists:
  - **Review:** spaced. A chapter is due after 1, 3, 7, 14 and 30 days; finishing it when it's due moves it on, and
    after the fifth review it leaves the list.
  - **Study later:** remembers the section you were on.
  - **Favorites:** the liked chapters.
  - Now Playing and every chapter's ⋯ menu have Favorite, Playlist, Review and Study later. Finishing a chapter
    (`studied()`) advances its review and clears it from Study later.
- **Read along** (2.7): the text of what's playing is one tap from everywhere you listen. Now Playing has a
  full-width Read along button, the mini player a Read along button (its own row on phones, with Favorite, Add to
  playlist and More), and Home a "Listening now" card. All open the chapter at the section playing (`readAlong()` →
  `goSection()`). In the chapter view `paintNowSec()` marks that section and its TOC row, shows a "Playing now · Go
  there" bar, and follows the next section only if you were reading the one before (it never yanks you back).
- **Control bar and Books page** (2.7): the mini player also has Shuffle, Repeat (queue → chapter → section → off)
  and Continue the book toggles, which set `prefs.playMode` like the order pill. Continue the book now runs on into the
  next book (`nextInOrder()`, skipping chapters with no recording). Every book card has a play button that starts the
  book at its first unheard chapter.
- **One language, AI voice** (2.7): `prefs.read` (en, he, both) sets reading and listening together; `setLang()` is
  the one switch (Settings, the chapter page, Now Playing, the mini player's EN/עב pill), and changing it reloads the
  audio. `listenLang(t)` picks the audio: the English recording, else the **AI voice** (`tts`: the device's speech
  engine reading the bundled English, labelled as AI) for AI-translated chapters, else Hebrew. The `Speaker` engine
  mimics an `<audio>` element and the `audio` facade switches between it and the real one on `speech:<id>:<section>`
  srcs. The voice is `prefs.voice` (Settings → Voice, or "Change voice" by the player); the paragraph being read is
  highlighted in the reader and in Now Playing's text. A failed English recording falls back to the AI voice, then
  Hebrew; an engine with no voice is detected and treated as a failure. Play order defaults to Continue the book.
- **Natural voices** (2.7): Settings → Voice offers three engines for the AI voice: **Natural (Kokoro)**, about
  370 MB once, four voices (`prefs.kokoroVoice`), says the guttural ḥ; **Light (Piper)**, about 93 MB, keeps up on any
  phone; and the device's own voice. They are chosen with `prefs.voiceEngine`. Both run on the device (WebGPU or
  WebAssembly), download only when asked (Wi-Fi only by default) and can be removed.
  - The engine is Estante's (github.com/dendrito/estantes): `www/voice.js`, `voice-*.js`, `*-worker.js` and
    `www/voice/lexicon-*.tsv`, **shipped unmodified**. Upgrade it by copying Estante's files, never by editing them here.
  - In `app.js`, `NE` talks to Estante's workers directly and `Neural` mimics `<audio>` the way `Speaker` does; the
    `audio` facade picks it for `speech:` srcs when `neuralReady()`. Each piece is made in the worker and played as a
    WAV through its own `<audio>` element (`neuralEl`), not Web Audio, because an iPad left Web Audio silent.
  - Kokoro steps down when the full model doesn't fit (measured on an iPad: "[webgpu] RangeError: Out of memory"):
    fp32 on WebGPU, then fp16 on WebGPU (a second ~163 MB download), then fp32 on the processor. What worked is kept
    in `pearls.kokoroRun`; Settings says where it runs.
  - A natural voice that fails falls back to the device voice for the session (`neuralFailed`), and the toast says why.
  - **In the Apple app Kokoro runs natively** (`apple/Pearls/KokoroNative.swift`): ONNX Runtime (Swift package
    `onnxruntime-swift-package-manager`) runs the same fp32 model through Core ML where Core ML takes the graph, else on
    the processor, with no WebKit memory cap. The app downloads the model, the four voices, `tokenizer.json` and eSpeak
    (`phonemizer.js`) into Application Support/Pearls/kokoro/ and serves `pearls://app/native/kokoro/`
    (status · download · load · say · remove · phonemizer.js). The page still makes the phonemes (`www/pearls-phonemes.js`,
    Estante's `english()` plus Pearls' Hebrew rule, so the ḥ stays) and plays the WAV the app returns. `NK` in app.js is
    the client; the page uses it when `PearlsNative.info().kokoro` is true. Piper stays in the web worker.
  - Test: `python3 test_voice.py` (a stand-in for voice.js, since its models come from the network). It must end
    "voice: 29/29".
  - **The device's own voices in the Apple app** come from the app (`apple/Pearls/AppleVoice.swift`): WKWebView's
    speechSynthesis lists only compact voices, so the app lists the English ones (`AVSpeechSynthesisVoice`, Premium and
    Enhanced labelled, best and male first) and renders each piece to a WAV (`AVSpeechSynthesizer.write`) at
    `pearls://app/native/apple-voice/` (list · say). `AV` in app.js is the client (on when `PearlsNative.info().appleVoices`);
    reading goes through `Neural`'s two players like the natural voices. With no Premium or Enhanced English voice,
    Settings → Voice shows how to download one. The web and Android keep speechSynthesis (`Speaker`).
  - **Voices are downloads of their own:** each Piper voice (medium quality, which keeps up on an iPad; Ryan is the
    default) and each extra Kokoro speaker (about 0.5 MB; George is the default) downloads only when chosen, and every
    download has its own Remove (two taps). Default voices are male. Licences are on the Credits page.
- The Apple app (2.7) has the same bridge: `apple/Pearls/PearlsNative.swift` plus `native-shim.js`, which gives the page
  Android's synchronous interface on top of WKWebView's asynchronous messages (state pushed by the app, requests posted to
  it, `readText` a synchronous read from `pearls://app/native/text/`). The web version has no bridge: it reads the bundled
  English offline but doesn't download audio.

## Where things are

| Path | What |
|---|---|
| `www/app.js`, `app.css`, `skins.css`, `modes.css`, `data.js` | The app. 23 skins, each in light and dark (2.3; the six flat skins Azulejo, Cut Paper, Riso, Bone & Ink, Mizraḥ Arches and Thread came in 2.6, with their art in `www/art/<skin>-<light|dark>.svg`): `skins.css` draws each skin in its own mode (`light` in SKINS), `modes.css` holds the counterpart palette under `body[data-alt]`; Settings → Appearance (`prefs.mode`: design, light, dark, auto) picks. Pearl Minimal's three entries became one skin (old prefs migrate). Check with `python3 tools_skinshots.py home|read|settings` (contact sheets in `build/skinshots/`). 3 Hebrew typefaces (Frank Ruhl Libre, Shofar, Keter YG v0.103). Read/listen language pickers. Audio control bar. Credits page (`#credits`). |
| `www/meldar-cite.js`, `www/pearls-cite-links.js`, `.css` | Citation links. Footnote and body citations (SA 345:2, MB, Shabbat 6a, Rambam, Tosafot, Tanakh, Arukh HaShulchan…) become links; a tap opens a sheet with the passage from Sefaria (Hebrew, English, each version's licence) and "Open on Sefaria / in Meldar". `meldar-cite.js` is Meldar's citation grammar, **shipped unmodified** like `meldar-record.js`: upgrade it by copying Meldar's file, never by editing it here. `linkCites()` in app.js runs before respelling and Hebrew tints (both rewrite text nodes); clicks are delegated (`citeClicks`) because chapter HTML is rebuilt as strings. A bare Shulchan Arukh siman takes its section from the chapter (`sefRef` → the grammar's section table) and the sheet says that part is our reading; with no chapter context it is not linked. Bare names ("Rashi") are not marked. "Peninei Halakha: Shabbat 21:8" opens that Pearls chapter. |
| `functions/api/`, `webauth/sync.js`, `www/pearls-sync-merge.js` | Sync across devices: where you stopped reading (`state.where`, chapter + section) and listening, finished chapters, lists, playlists, saved passages and settings. Browsers on pearls.pages.dev use the sign-in pass; the apps link with a one-time code from a signed-in browser (Settings → Sync across devices) and keep a device token. Stored in KV (`SYNC`, else `INVITES`). The merge rules are one file shared by the app and the server; anything in `store.set` that is in `WHOLE` or a per-chapter map syncs automatically. Device-only: text size, downloads, the Meldar study record. Setup and limits: `docs/cloudflare-pages.md`. |
| `www/calendar.js` | The Jewish calendar and its readings: 22 festivals and fasts plus Rosh Ḥodesh, with postponements, study windows (30 days before a festival) and chapters. Drives Home's "On the calendar" shelf, `#calendar`, the `#pl-cal-<id>` playlists and the calendar boost in `recommend()`. Method: `docs/calendar-readings.md`. Test: `python3 test_calendar.py` (must end "calendar: 14/14"). |
| `www/fonts/` | Shofar and Keter YG (Culmus, GPL+FE). Every Hebrew font must have GPOS `mark` and `mkmk`. |
| `make_catalog.py`, `make_translit.py`, `make_he_books.py` | Build www data: the English catalogue, KTS transliteration, and the Hebrew-only books with AI translations. |
| `work/he`, `work/en`, `work/TRANSLATE.md`, `work/check.py` | Hebrew sources, AI translations, the translation brief (fidelity rules plus licence evidence), and the validator. |
| `src/` | Scraped source data: ph.yhb.org.il and Sefaria. |
| `android/` | Manifest, res, `java/` (MainActivity, AppServer, PearlsBridge, PlaybackService), `build_apk.py`, `build_aab.py`, `make_icons.py`. |
| Icon | "Glint A": a flat bone pearl with a quarter-arc glint on night (#EFE7D8 on #12110F). `python3 android/make_icons.py` redraws every size: Android PNGs, the adaptive and themed icons, the notification icon, the web icons, `store/play-icon-512.png` and the Apple set. The in-app header mark (`.brand .dot`) is the same shape in every skin: the pearl in `--logo` (default `--pearl`), the glint cut in `--ink`. |
| `functions/`, `webauth/`, `docs/cloudflare-pages.md` | The web edition on Cloudflare Pages (pearls.pages.dev): output dir `www`, no build. `proxy.js` fetches ph.yhb.org.il text (only that host). The site is private: `_middleware.js` requires a pass, which comes from Cloudflare Access (Google or an email code, on `/signin`) or from an invite link made on `/admin` (stored in KV, can be cancelled). It also adds noindex. Setup steps are in the doc. Test: `WRANGLER=… node test_webauth.mjs`, which must end "webauth: 23/23". |
| `windows/` | Electron shell for Windows: `main.js`, `preload.js`, `build_windows.sh`, `README.md`. Icons from `android/make_icons.py`. |
| `apple/` | Xcode project. One multiplatform target (iPhone, iPad, Mac). iOS starts from UIKit (status bar follows the skin, background downloads); the Mac from SwiftUI. The `pearls://` scheme handler serves www, proxies ph.yhb.org.il (duplicate CORS headers), serves downloads at `/dl/` with byte ranges and saved text at `/native/text/`. Run `apple/sync_www.sh` after changing www; `apple/build_ios.sh ipa` makes an App Store Connect build on a Mac. |
| `www/wide.css` | The wide layout (2.7), from 768px: side rail instead of the tab bar, a wider column, centred dialogs, Now Playing side by side in landscape. Layout only, so every skin works unchanged. |
| `design/ui-directions/` | Design canvas sources (Parchment, Studio, Daf, Clear, Pearl Minimal + Sand/Ice/Night/Mint). |
| `docs/` | S&P house rules (KTS), the calendar readings method, and the notes on how Pearls links to Meldar. |

## Rules

- **Licence:** PH text is CC BY 4.0 plus a non-resale clause (ph.yhb.org.il/terms §1.3, §2.1, §2.2, §3.1, §5.2).
  - Always credit Rabbi Melamed and Yeshivat Har Bracha.
  - Label AI translations as AI.
  - Never sell a complete copy.
- **Translation:** follow `work/TRANSLATE.md` exactly. Translate faithfully and completely, adding nothing. Validate with
  `python3 -I work/check.py BB-CC`.
- **Network:** ph.yhb.org.il returns 403 for the Python-urllib user agent. Use curl or set a User-Agent.
- **Claims:** don't state facts about the recordings or the author that aren't verified on PH's own pages.
- **Flat (hard rule, 2.6):** no skin fakes depth. No gradient that blends one colour into another, no blurred
  shadow, no blur filter. Hard-stop gradients (stripes, a split swatch, a progress track) and shadows with no blur
  (Brutal's offset, focus rings) stay, because they are still flat. `python3 test_flat.py` checks app.css, skins.css,
  modes.css, app.js, index.html and `www/art/*.svg`, and must end "flat: no soft gradients or blurs".
- **Fonts (hard rule):** every letter the app shows must be drawn by the typeface meant to show it, never borrowed from
  a fallback font (that's what made ḥ, ĥ and ḳ look "weird" in most skins). `python3 test_fonts.py` checks every
  bundled Latin face named in app.css, skins.css and modes.css against every letter and punctuation mark in the text,
  and fails the build (`./build.sh` runs it) if one is missing or a stack starts with an unbundled font.
  - Fix a gap with `python3 patch_webfonts.py`. It builds the missing letters (ḥ Ḥ ḳ Ḳ ĥ Ĥ ʿ ʾ ½ ¼ ¾) from the font's
    own h, k, period, circumflex and figures, with gvar/HVAR deltas for variable fonts and the slant for italics. If
    that can't, choose another typeface.
  - A new skin font goes in `fetch_webfonts.py`, then run `patch_webfonts.py` and `test_fonts.py`. Never add a
    `font-family` without bundling it.
  - Avoid characters fonts rarely have (e.g. U+2011 non-breaking hyphen); use the plain one.
