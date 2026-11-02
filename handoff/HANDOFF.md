# Handoff from the claude.ai chat (Oct 2026)

This repo was moved out of a long Claude chat that began in the "Meldar Chat" project. Since 31 Oct 2026 Pearls
has its own claude.ai project, "Pearls". Everything built there is here. The full chat
is in `chat-transcript.jsonl.gz`.

## Published artifacts (claude.ai, private to the user)

- **Pearls web app:** https://claude.ai/artifact/R8QbcuSd47gnQhqtFEaSJk (version 13). It is the same as `www/`. Republish
  from `www/index.html` to update it.
- **Pearls UI Directions** (design canvas): https://claude.ai/artifact/CCoSSJNBBZ5FRvDwNHbz6M. The sources are in
  `design/ui-directions/`.

## What was built and decided

- **Android APK** with no SDK: 1.8.1 (versionCode 15), 2.4 MB lite build.
  - Install trouble was truncated downloads. Check the file size, and turn off Samsung Auto Blocker.
- **Reading language** en / he / both, and **audio language** auto / en / he.
  - Auto follows the reading language. That fixed English chapters playing Hebrew audio.
  - Both pickers sit on the chapter page and in Now Playing.
- **Audio control bar:**
  - seek bar, speed, −15, previous, play, next and +30;
  - a language pill;
  - a close button, which clears the queue so it isn't restored on next launch.
- **Categories:**
  - the melakhot rule is limited to books 01 and 12, and a "health" tag was added;
  - the marriage, family, Israel and foundations rules match chapter titles only;
  - some over-broad volume tags were removed.
- **Skins (15):**
  - Classic;
  - Pearl Minimal (auto / light / dark) and its variations Sand, Ice, Night and Mint;
  - Illuminated, Tekhelet and Brutal;
  - Parchment, Studio, Daf (side-by-side Hebrew and English) and Clear.
- **Hebrew typefaces:** Frank Ruhl Libre (the default), Shofar ("inspired by Koren type", Culmus) and Keter YG.
  - Keter YG was upgraded to v0.103yg because v0.062 had no mark positioning, so its nikud was offset.
- **Credits:** a short card on Home plus a full `#credits` page covering the licence, the changes made and thanks.
- **Apple app:**
  - one Xcode target for iPadOS, iOS and native macOS;
  - background audio;
  - the `pearls://` scheme, plus a native proxy for ph.yhb.org.il text.
- **AI translations** of Hebrew-only books:
  - complete: Berakhot (10), Kashrut (17), Family Purity (18), Giyur (19);
  - Emuna (20) is at 29 of 30 chapters.
- **Meldar font fix:** done for Meldar (Keter YG v0.103, Frank Ruhl Libre‑Taamim repaired). It now lives with the
  Meldar project.

## Since the move (1.9.0)

- The Android app runs offline:
  - all English text is bundled;
  - Hebrew is kept on the phone once it has loaded;
  - audio can be downloaded per chapter, per book or per playlist.
- Smart downloads: download ahead, delete after listening, Wi‑Fi only and a storage limit.
- The status and navigation bars follow the skin.
- The native code is now Java, built with javac + D8. dexgen and the smali code are gone.

## 2.0.0: built for Google Play

- Targets Android 16. The build makes a signed .aab for Play upload.
- Background playback runs as a foreground service, with a media notification and lock-screen controls.
- The app is served from a private https address, with no file access; saved data moves across once.
- Edge to edge with inset padding, the newer back-gesture handling, and bundled fonts.
- Headphones: pause on disconnect (a setting) and earbud controls (1.9.1).

**Still needed for Play, on the user's side:**
- the developer account, and a closed test with 12 testers for 14 days;
- permission from Har Bracha;
- the privacy policy, store listing and Data safety form;
- the foreground-service declaration (a short video of background playback);
- choosing Play App Signing with the existing key.

## 2.0.0 to 2.4.0 (claude.ai session, 30–31 Oct 2026)

- **Store kit** (`store/`): privacy policy, Play listing and forms (`play-listing.md`), screenshots, feature graphic
  and the email to Har Bracha (`email-har-bracha.md`).
  - Har Bracha has its own iOS app, "Daily Pearl". The email acknowledges it and offers to cooperate or rename.
  - **Naming is still the user's decision.**
- **Brand:** "Pearls, powered by Peninei Halakha" appears in the app header, the listing and the feature graphic.
- **2.1.0:** four skins from the design canvas: Nacre, Folio, Sunlit and Ner.
- **2.2.0:** the icon is **"Glint A"**, a flat bone pearl with a quarter-arc glint on night (#EFE7D8 on #12110F).
  `android/make_icons.py` makes every size.
- **2.3.0:** the glint logo appears in every skin, and every skin has a light and a dark version (`www/modes.css`).
  - Settings → Appearance offers As designed, Light, Dark and Match phone.
  - Pearl Minimal's three entries became one skin.
- **2.4.0:**
  - **Fonts are a hard rule.** `patch_webfonts.py` builds the missing ḥ ĥ ḳ ʿ ½ … letters from each font's own
    parts, and `test_fonts.py` fails the build on any gap. Parchment's Inter is now bundled.
  - **Calendar readings** (`www/calendar.js`): festivals, fasts and Rosh Ḥodesh, with the standard postponements and
    30-day study windows. They feed Home's "On the calendar" shelf, `#calendar`, the `#pl-cal-<id>` playlists and
    the recommendations. The method is in `docs/calendar-readings.md`.
- **2.5.0:**
  - **Playback order** on Now Playing: In order, Continue the book, Shuffle, Repeat chapter, Repeat queue and Repeat
    section. Smart downloads follow it.
  - **Lists:** Review (spaced: 1, 3, 7, 14, 30 days), Study later and Favorites, added from Now Playing or any ⋯ menu.
- **AI voice:** the user has Chatterbox running on Colab with `tts/Pearls_TTS.ipynb`.
- **Design canvas** "Pearls · Nacre" (directions, icon boards, glyph board):
  https://claude.ai/artifact/CaR1nBi7ibUmTGZNGSufz9
- **Tests:** all must pass before a release.
  - `test_app.py` must end "errors: none".
  - `test_offline.py` must end 32/32.
  - `test_android_shell.py` must end 6/6.
  - `test_fonts.py` must end "fonts: all letters covered".
  - `test_calendar.py` must end 14/14.
  - `test_playmodes.py` must end 17/17.

## Flat skins (branch `flat-skins`, 2 Nov 2026, not released)

- The user dislikes gradients that fake a 3D look, so every skin is now flat: no gradient that blends colours, no
  blurred shadow, no blur filter. Hard stops and no-blur shadows (Brutal's offset) stay. `test_flat.py` enforces it
  and `build.sh` runs it.
- The 17 existing skins kept their colours. Their gradients became solid fills, and the glows and soft shadows were
  removed. Cover art is now two flat circles instead of radial washes.
- Six new skins, each light and dark, with flat SVG art in `www/art/`: Azulejo, Cut Paper, Riso, Bone & Ink,
  Mizraḥ Arches and Thread. The mockups are at https://claude.ai/artifact/9ecHz7u4Zwsbz2eXQ37bdB.
- **Open:** the user may drop some of the six. Then bump the version and update the store art ("23 looks").

## Open items, in order

0. **Get the code onto GitHub.** The user creates `dendrito/pearls`, then the next session adds it with push access
   and runs `git push -u origin --all`. Until then, the repo travels as `pearls.bundle`.
1. **Translate Emuna 20-30.** Then run `./build.sh`, republish the web artifact and send the APK.
2. **Translate the remaining Hebrew-only books:**
   - 11 Family
   - 06 Nation & Land
   - 16 Shevi'it
   - 21 Ḥafetzei Kodesh
   - 07 Likkutim I
   - 08 Likkutim II
3. **Decide KTS vs Meldar's `sp` transliteration.** See `docs/`. This is shared with Meldar.
4. *(Moved to the Meldar project on 31 Oct 2026: deploying the Meldar font fix, and Meldar's importer for the
   `pearls-study-log/1` export. The font-fix kit is `meldar-font-fix.zip`; it's no longer in this repo.)*
5. *(not used)*
6. **Optional:**
   - an "outside Israel" calendar setting, listing second festival days as dates of their own;
   - a Tu Bi-Shvat reading list reviewed by the user;
   - regenerate the store screenshots, which still say "15 looks" (`store/make_store_art.py`; needs ph.yhb.org.il);
   - republish the Pearls web artifact from `www/` (it is at an older version).
7. **AI voice** (`tts/`; see `tts/README.md`): MP3s for the AI-translated sections, made with Kokoro or Chatterbox, on
   Colab or Kaggle (`tts/Pearls_TTS.ipynb`). Still to do:
   - the user picks a voice;
   - generate everything;
   - host the files;
   - add them to the app as an "AI voice" audio option, labelled like the AI translations.
   Kokoro reads ḥ as gibberish, so `lexicon.tsv` and the ḥ->kh rule are needed.
8. **Play release, the user's side:** the developer account, 12 testers for 14 days, Har Bracha's permission, a
   hosted privacy policy, the foreground-service video, and replacing `CONTACT_EMAIL`.
