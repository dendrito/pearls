# Pearls: notes for Claude Code

Pearls is an English *Peninei Halakha* (Rabbi Eliezer Melamed, Yeshivat Har Bracha) reader and listener. One web app (`www/`)
ships three ways:

- an Android APK, built without the Android SDK;
- an iPad / iPhone / Mac app (`apple/`, WKWebView);
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
  - `python3 test_fonts.py`: the font hard rule (see Rules). It must end "fonts: all letters covered".
  - `python3 test_calendar.py`: calendar dates and postponements. It must end "calendar: 14/14".
  - `node test_cite_links.js`: citation links (the grammar plus Pearls' layer, offline). It must end "cite links: 13/13".
  - `python3 test_android_shell.py`: the https app address, the data handover and the bundled fonts. It must end
    "6/6 checks passed".

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
- The Apple app and the web version have no bridge. They read the bundled English offline, but don't download audio.

## Where things are

| Path | What |
|---|---|
| `www/app.js`, `app.css`, `skins.css`, `modes.css`, `data.js` | The app. 17 skins, each in light and dark (2.3): `skins.css` draws each skin in its own mode (`light` in SKINS), `modes.css` holds the counterpart palette under `body[data-alt]`; Settings → Appearance (`prefs.mode`: design, light, dark, auto) picks. Pearl Minimal's three entries became one skin (old prefs migrate). Check with `python3 tools_skinshots.py home|read|settings` (contact sheets in `build/skinshots/`). 3 Hebrew typefaces (Frank Ruhl Libre, Shofar, Keter YG v0.103). Read/listen language pickers. Audio control bar. Credits page (`#credits`). |
| `www/meldar-cite.js`, `www/pearls-cite-links.js`, `.css` | Citation links. Footnote and body citations (SA 345:2, MB, Shabbat 6a, Rambam, Tosafot, Tanakh, Arukh HaShulchan…) become links; a tap opens a sheet with the passage from Sefaria (Hebrew, English, each version's licence) and "Open on Sefaria / in Meldar". `meldar-cite.js` is Meldar's citation grammar, **shipped unmodified** like `meldar-record.js`: upgrade it by copying Meldar's file, never by editing it here. `linkCites()` in app.js runs before respelling and Hebrew tints (both rewrite text nodes); clicks are delegated (`citeClicks`) because chapter HTML is rebuilt as strings. A bare Shulchan Arukh siman takes its section from the chapter (`sefRef` → the grammar's section table) and the sheet says that part is our reading; with no chapter context it is not linked. Bare names ("Rashi") are not marked. "Peninei Halakha: Shabbat 21:8" opens that Pearls chapter. |
| `www/calendar.js` | The Jewish calendar and its readings: 22 festivals and fasts plus Rosh Ḥodesh, with postponements, study windows (30 days before a festival) and chapters. Drives Home's "On the calendar" shelf, `#calendar`, the `#pl-cal-<id>` playlists and the calendar boost in `recommend()`. Method: `docs/calendar-readings.md`. Test: `python3 test_calendar.py` (must end "calendar: 14/14"). |
| `www/fonts/` | Shofar and Keter YG (Culmus, GPL+FE). Every Hebrew font must have GPOS `mark` and `mkmk`. |
| `make_catalog.py`, `make_translit.py`, `make_he_books.py` | Build www data: the English catalogue, KTS transliteration, and the Hebrew-only books with AI translations. |
| `work/he`, `work/en`, `work/TRANSLATE.md`, `work/check.py` | Hebrew sources, AI translations, the translation brief (fidelity rules plus licence evidence), and the validator. |
| `src/` | Scraped source data: ph.yhb.org.il and Sefaria. |
| `android/` | Manifest, res, `java/` (MainActivity, AppServer, PearlsBridge, PlaybackService), `build_apk.py`, `build_aab.py`, `make_icons.py`. |
| Icon | "Glint A": a flat bone pearl with a quarter-arc glint on night (#EFE7D8 on #12110F). `python3 android/make_icons.py` redraws every size: Android PNGs, the adaptive and themed icons, the notification icon, the web icons, `store/play-icon-512.png` and the Apple set. The in-app header mark (`.brand .dot`) is the same shape in every skin: the pearl in `--logo` (default `--pearl`), the glint cut in `--ink`. |
| `apple/` | Xcode project. One multiplatform target. The `pearls://` scheme handler also proxies ph.yhb.org.il, which sends duplicate CORS headers. Run `apple/sync_www.sh` after changing www. |
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
