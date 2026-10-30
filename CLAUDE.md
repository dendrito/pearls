# Pearls: notes for Claude Code

Pearls is an English *Peninei Halakha* (Rabbi Eliezer Melamed, Yeshivat Har Bracha) reader and listener. One web app (`www/`)
ships three ways:

- an Android APK, built without the Android SDK;
- an iPad / iPhone / Mac app (`apple/`, WKWebView);
- a web artifact on claude.ai.

The repo also holds the Meldar font fix (`meldar-font-fix/`).

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
- `python3 test_offline.py` tests downloads and offline mode against a stand-in for the Android bridge. It must end
  "32/32 checks passed".

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
- The Apple app and the web version have no bridge. They read the bundled English offline, but don't download audio.

## Where things are

| Path | What |
|---|---|
| `www/app.js`, `app.css`, `skins.css`, `data.js` | The app. 15 skins. 3 Hebrew typefaces (Frank Ruhl Libre, Shofar, Keter YG v0.103). Read/listen language pickers. Audio control bar. Credits page (`#credits`). |
| `www/fonts/` | Shofar and Keter YG (Culmus, GPL+FE). Every Hebrew font must have GPOS `mark` and `mkmk`. |
| `make_catalog.py`, `make_translit.py`, `make_he_books.py` | Build www data: the English catalogue, KTS transliteration, and the Hebrew-only books with AI translations. |
| `work/he`, `work/en`, `work/TRANSLATE.md`, `work/check.py` | Hebrew sources, AI translations, the translation brief (fidelity rules plus licence evidence), and the validator. |
| `src/` | Scraped source data: ph.yhb.org.il and Sefaria. |
| `android/` | Manifest, res, `java/` (activity and offline bridge), `build_apk.py`, `make_icons.py`. |
| `apple/` | Xcode project. One multiplatform target. The `pearls://` scheme handler also proxies ph.yhb.org.il, which sends duplicate CORS headers. Run `apple/sync_www.sh` after changing www. |
| `design/ui-directions/` | Design canvas sources (Parchment, Studio, Daf, Clear, Pearl Minimal + Sand/Ice/Night/Mint). |
| `docs/` | S&P house rules (KTS) and the Pearls ⇄ Meldar integration notes. |
| `meldar-font-fix/` | Fixed Keter YG and the repaired Frank Ruhl Libre‑Taamim for meldar.pages.dev, with a README and deploy steps. |

## Rules

- **Licence:** PH text is CC BY 4.0 plus a non-resale clause (ph.yhb.org.il/terms §1.3, §2.1, §2.2, §3.1, §5.2).
  - Always credit Rabbi Melamed and Yeshivat Har Bracha.
  - Label AI translations as AI.
  - Never sell a complete copy.
- **Translation:** follow `work/TRANSLATE.md` exactly. Translate faithfully and completely, adding nothing. Validate with
  `python3 -I work/check.py BB-CC`.
- **Network:** ph.yhb.org.il returns 403 for the Python-urllib user agent. Use curl or set a User-Agent.
- **Claims:** don't state facts about the recordings or the author that aren't verified on PH's own pages.
