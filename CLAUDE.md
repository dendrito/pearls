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
- The APK pipeline runs: aapt2 (`tools/`), then `dexgen` (Rust, smali to dex, stamped to version 035), then an aligned zip,
  then `signer/sign.mjs` (signature schemes v1, v2 and v3).
- Lite build (default): only translated chapters are bundled. Hebrew is fetched live from ph.yhb.org.il.

## Where things are

| Path | What |
|---|---|
| `www/app.js`, `app.css`, `skins.css`, `data.js` | The app. 15 skins. 3 Hebrew typefaces (Frank Ruhl Libre, Shofar, Keter YG v0.103). Read/listen language pickers. Audio control bar. Credits page (`#credits`). |
| `www/fonts/` | Shofar and Keter YG (Culmus, GPL+FE). Every Hebrew font must have GPOS `mark` and `mkmk`. |
| `make_catalog.py`, `make_translit.py`, `make_he_books.py` | Build www data: the English catalogue, KTS transliteration, and the Hebrew-only books with AI translations. |
| `work/he`, `work/en`, `work/TRANSLATE.md`, `work/check.py` | Hebrew sources, AI translations, the translation brief (fidelity rules plus licence evidence), and the validator. |
| `src/` | Scraped source data: ph.yhb.org.il and Sefaria. |
| `android/` | Manifest, res, smali, `build_apk.py`, `make_icons.py`. |
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
