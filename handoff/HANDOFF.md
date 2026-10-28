# Handoff from the claude.ai chat (Oct 2026)

This repo was moved out of a long Claude chat in the "Meldar Chat" project. Everything built there is here. The full chat
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
- **Meldar font fix** (`meldar-font-fix/`):
  - Keter YG is upgraded to v0.103;
  - Frank Ruhl Libre‑Taamim is repaired (its layout tables had been lost);
  - the fix ships under new filenames, because Meldar caches fonts as immutable for a year.
  - **Not deployed yet:** Meldar's source repo wasn't reachable from the chat.

## Open items, in order

1. **Translate Emuna 20-30.** Then run `./build.sh`, republish the web artifact and send the APK.
2. **Translate the remaining Hebrew-only books:**
   - 11 Family
   - 06 Nation & Land
   - 16 Shevi'it
   - 21 Ḥafetzei Kodesh
   - 07 Likkutim I
   - 08 Likkutim II
3. **Deploy the Meldar font fix** to meldar.pages.dev and meldar-proto.pages.dev. Steps are in `meldar-font-fix/README.md`.
4. **Android status-bar colour for light skins.** This needs native code in `android/smali`.
5. **Meldar importer** for the `pearls-study-log/1` export.
6. **Decide KTS vs Meldar's `sp` transliteration.** See `docs/`.
