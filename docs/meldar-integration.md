# Pearls ⇄ Meldar integration

Status, 27 October 2026. Pearls is the Peninei Halakha reader (Android APK + web). This note records what was read in Meldar's live code (meldar.pages.dev, meldar-proto.pages.dev) and how Pearls now connects to it.

## Shared key: Sefaria references
Pearls addresses every chapter and section by its Sefaria reference, e.g. `Peninei Halakhah, Berakhot 4:2`.
- Har Bracha's chapter/section numbering matches Sefaria exactly for Shabbat, Prayer, Women's Prayer, Pesach, Zemanim, Festivals, Sukkot, Days of Awe, Simchat Habayit, Berakhot, Family, Family Purity, Shemitah and Yovel, Emunah Umitzvoteha.
- It differs in places for Kashrut, Likkutim I and II, The Nation and the Land and Giyur; there Pearls links section-level only where the chapter's section count matches, otherwise chapter-level.
- Ḥafetzei Kodesh is not on Sefaria.

## What Pearls uses from Meldar
- **Deep links** (Meldar's own contract, in the boot code: `?view=<view>&ref=<sefaria ref>&post=<id>`, plus `?explain=<ref>&title=`):
  - Open in Meldar → `https://meldar.pages.dev/?ref=<ref>` (per chapter and per section; pattern editable in Pearls' settings)
  - Explain it back in Meldar → `https://meldar.pages.dev/?explain=<ref>&title=<chapter title>`
  - Giyur book → `https://meldar.pages.dev/?view=giyur`; Progress → `?view=myLearning`
- **The study record engine**: Pearls ships `meldar-record.js` unmodified (D-013): opt-in, device-only, "days studied" headline, a run that Shabbat and Yom Tov pause with two reserve weekdays, the four sourced milestones (40, 101, 248, 400), no loss language. Its selftest passes 14/14 inside Pearls. Pearls marks a day with `mark('read')` when the learner listens 5+ minutes or finishes a chapter.
- **Badge archetypes / ranks**: not used in Pearls (D-013 already covers what Pearls needs).

## What Pearls offers Meldar
- **Study log export** (`pearls-study-log/1`, copied as JSON from Pearls → Progress): chapters (Sefaria ref, heard/read, minutes, last date, `ai` flag for AI-translated books), days, saved passages with notes, playlists. Meldar has no importer for it yet.
- **AI translations of the 11 Hebrew-only books** (CC BY 4.0 source; labelled AI throughout) as per-chapter JSON with Hebrew, English, notes and source links (`work/en/*.json` in the Pearls project). Meldar's reader could show them for refs Sefaria has no English for, with the same AI label.
- **Per-section audio map**: Har Bracha now serves `https://cdn1.yhb.org.il/mp3/BB-CC-SS.mp3` (Hebrew) and `mp3/en/en-BB-CC-SS.mp3` (English readings, for Shabbat, Prayer, Zemanim, Festivals fully; Pesach, Sukkot, Days of Awe partly). The old `ph.yhb.org.il/mp3/BB-CC.mp3` files return 404.

## Romanization: Meldar's `sp` is not the KTS house rules
Meldar's engine (`meldar-interlinear.js`, `MELDAR_IL.romanize`) has five tables: `sp`, `ams`, `mod`, `perez`, `ash`; the Spanish and French options fall back to `sp`.

| | Meldar `sp` ("S&P London — de Sola / Gaster") | KTS house rules |
|---|---|---|
| ב | b | b |
| ח | h | ḥ |
| כ / כּ | kh (dagesh stripped) | ch / c before a,o,u, k before e,i |
| ק | k | ḳ |
| ע | silent | ng medially, ’ initially |
| פ without dagesh | f | ph |
| ת final | t | th |
| stress | none | acute accent |

Two of the house rules cannot be produced by Meldar's engine as designed: the c/k vs ch split and dagesh doubling need the dagesh, and Meldar's standing rule is that dagesh never changes the output. Acute stress needs stress data the engine doesn't have. Options: (a) add a separate `kts` table that keeps the dagesh, (b) use a lexicon (as Pearls does) for the house forms, or (c) keep `sp` and relabel it so it doesn't claim to be de Sola/Gaster. This is a decision for the owner.

## Open
- lomederia.org did not resolve from the build environment; the "Read in Lomederia" integration is untested.
- Meldar importer for `pearls-study-log/1` and AI-translation rows: to build on the Meldar side once its repo is available.
