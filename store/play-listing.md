# Pearls on Google Play: listing and forms

Everything below is what Play Console asks for, in the order it asks. Replace `CONTACT_EMAIL` (here and in
`privacy.html`) with the address you want public: Play shows the developer email on the listing.

## Main store listing

**App name** (30 characters max). Use the first if Har Bracha agrees; the second until then.
- `Pearls: Peninei Halakha` (23)
- `Pearls: Halakha in English` (26)

**Short description** (80 max)
> Powered by Peninei Halakha: read and listen to Rabbi Melamed's halakha, offline. (80)

**Full description** (4,000 max)

> Pearls, powered by Peninei Halakha, brings Rabbi Eliezer Melamed's halakha series to your phone: clear, practical Jewish law, chapter by
> chapter, to read and to listen to.
>
> LISTEN
> • The original recordings, in Hebrew, and English readings where they exist
> • Playlists, a queue, a sleep timer, 0.75× to 2× speed and a "pick up where you left off" shelf
> • Plays with the screen off, with controls on the lock screen and your earbuds
> • Pauses by itself when your headphones disconnect (you can turn this off)
>
> READ
> • Every volume of the official English translation
> • The Hebrew original beside it, or on its own
> • Volumes with no English edition yet (Berakhot, Kashrut, Family Purity, Giyur, Emuna) in an AI translation,
>   clearly labelled, with the Hebrew one tap away
> • Choose how Hebrew words are spelled, including Spanish & Portuguese (S&P) house rules
>
> WORKS OFFLINE
> • All the English text is inside the app
> • Download chapters, books or playlists to listen without a connection
> • Smart downloads keep the next chapters ready and tidy up the ones you've heard, within a storage limit you set
>
> STUDY EVERY DAY
> • Today's pearl, recommendations by topic and season, and a daily plan with a streak
> • Save passages with your own notes
> • Open any section in Sefaria
>
> MAKE IT YOURS
> • 17 looks, each in light and dark, from a printed-page "Daf" to large-type "Clear", and three Hebrew typefaces
>
> PRIVATE BY DESIGN
> No account, no ads, no tracking. Your progress stays on your phone.
>
> Peninei Halakha by Rabbi Eliezer Melamed © Yeshivat Har Bracha, CC BY 4.0. Pearls is an independent study app
> and isn't published by Yeshivat Har Bracha. The AI translations aren't official and haven't been reviewed by a
> rabbi; check the Hebrew before relying on them in practice.

(If Har Bracha agrees, change the second-to-last sentence to say so, e.g. "with the kind permission of Yeshivat Har
Bracha".)

**Graphics** (in `store/`)
| Asset | File | Play's rule |
|---|---|---|
| App icon | `play-icon-512.png` | 512×512 PNG, full square (Play rounds it) |
| Feature graphic | `feature-graphic.png` | 1024×500 PNG/JPG |
| Phone screenshots | `screenshots/01…06-*.png` | 2–8, 9:16, 1080×1920 |

**Category:** Books & Reference. **Tags:** Religion, Education, Books, Audiobooks.
**Contact details:** email `CONTACT_EMAIL` (required); website optional. **Privacy policy:** the URL where you host
`privacy.html`.

## App content (Policy → App content)

**Privacy policy:** the hosted `privacy.html` URL. Quickest: Cloudflare Pages → Create → Upload assets → drop the
`store/` folder → e.g. `https://pearls-app.pages.dev/privacy.html`.

**Ads:** No, the app doesn't contain ads.

**App access:** All functionality is available without special access (no login).

**Content rating** (IARC questionnaire): category *Reference, News, or Educational*. Answer **No** to violence, sexual
content, profanity, controlled substances, gambling and user-generated content. Answer **No** to "users can interact or
exchange content" and **No** to sharing location. Expected result: Everyone / PEGI 3.

**Target audience and content:** 13–15, 16–17 and 18+. Leaving out under-13s keeps Pearls out of the Families
programme rules; nothing in the app is aimed at children.

**News app:** No. **Government app:** No. **Financial features:** none. **Health:** none.

**Data safety**
- Does your app collect or share any of the required user data types? **No.** Play then skips the detailed questions.
  If it asks anything else, the true answers are: all connections are HTTPS, and nothing is stored off the device,
  so there's nothing to request deletion of.

Why "No" is right: progress, playlists, notes and downloads are stored only on the device. The app sends nothing to
the developer. Requests to ph.yhb.org.il and cdn1.yhb.org.il only fetch public text and audio. Google's guidance says
on-device processing and data that never leaves the device isn't "collected".

**Foreground service declaration** (needed for `FOREGROUND_SERVICE_MEDIA_PLAYBACK`)
- Type: **Media playback**.
- Description: "Pearls plays recordings of Peninei Halakha chapters. The media playback service keeps audio playing
  when the user leaves the app or turns the screen off, and shows a media notification with play/pause, previous and
  next. It starts only when the user starts playback and stops when they pause or close the player."
- Video: a 20–30 second screen recording on your phone. Play a chapter, press Home, turn the screen off and on,
  show the lock-screen controls, then pause from the notification. Upload it unlisted to YouTube and paste the link.

**AI-generated content:** Pearls doesn't generate content in the app. The AI translations are fixed texts written
before release and labelled in the app. No declaration is needed, but the full description says it plainly.

## Release setup

1. **App signing:** choose "Use your own key" and export it with Google's PEPK tool from `pearls-signing-keys.zip`
   (key.pem/cert.pem). Phones that installed the APK directly can then update from Play. If you'd rather let Google
   create the key, those phones must uninstall and reinstall once.
2. **Closed testing** → create a track → upload `dist/Pearls-<ver>.aab` → add at least 12 testers by email (a Google
   Group is easiest) → share the opt-in link. Keep all 12 enrolled for 14 days in a row.
3. **Apply for production** (Dashboard). The form asks how you recruited testers, what feedback you got and what you
   changed, so keep notes during the test.
4. Each new upload needs a higher `versionCode` (`android/AndroidManifest.xml`).
