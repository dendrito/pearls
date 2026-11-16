# Pearls for iPhone, iPad and Mac

One Xcode project, one target, three platforms: iOS, iPadOS and native macOS (not Catalyst). It wraps the same web
app as the Android build (`www/`) in a WKWebView, and since 2.7 it has the same native features as Android: audio
downloads for offline listening, smart downloads, Hebrew kept for offline reading, and the status bar following the
skin. On iPad (and in a wide Mac window) the tabs become a side rail and Now Playing goes side by side in landscape.

Nothing here has been compiled yet: Apple's tools only run on a Mac. The web side is tested on Linux
(`python3 test_apple_shell.py`); the Swift side gets its first build on your Mac.

## What you need

- A Mac with **Xcode 15 or later** (free, from the App Store). Open it once and let it install its components.
- An **Apple ID**. A free one is enough to run Pearls on your own iPhone or iPad (it must be renewed every 7 days).
- For TestFlight or the App Store: the **Apple Developer Program**, $99 a year, at developer.apple.com/programs.

## 1. Run it on your iPad or iPhone (free Apple ID)

1. Get the project onto the Mac: unzip `Pearls-Apple.zip`, or clone the repo and run `apple/sync_www.sh` once.
2. Double-click **`Pearls.xcodeproj`** (or run `./build_ios.sh` in this folder, which syncs `www/` and opens it).
3. In Xcode click the **Pearls** project → target **Pearls** → **Signing & Capabilities** → **Team**: choose your Apple
   ID (Xcode → Settings → Accounts → + if it isn't listed).
   If Xcode says the bundle identifier is taken, change `app.pearls.halakha` to your own, such as `com.yourname.pearls`.
4. Plug in the iPad or iPhone with a cable, unlock it, tap **Trust**. Pick it in the device menu at the top of Xcode.
5. Press **▶**. The first time:
   - on the device turn on Settings → Privacy & Security → **Developer Mode** (it restarts);
   - then Settings → General → VPN & Device Management → your Apple ID → **Trust**;
   - press ▶ again.

To try it without a device, pick an **iPad** or **iPhone simulator** in the device menu and press ▶.
To run it on the Mac itself, pick **My Mac**.

## 2. TestFlight and the App Store (paid account)

1. In App Store Connect (appstoreconnect.apple.com) → Apps → **+** → New App: platform iOS, the bundle ID from step 3,
   name, primary language English, SKU anything (e.g. `pearls`).
2. In Terminal, in this folder:

       TEAM=ABCDE12345 ./build_ios.sh ipa

   where `ABCDE12345` is your Team ID (developer.apple.com → Account → Membership details).
   Or in Xcode: device menu → **Any iOS Device**, then Product → **Archive** → Distribute App → App Store Connect.
3. Upload `build/ipa/Pearls.ipa` with the free **Transporter** app (or from Xcode's Organizer).
4. In App Store Connect → TestFlight, add yourself as a tester; the build arrives in the TestFlight app in about 15 minutes.

**Don't submit for App Store review yet.** Public release waits for Yeshivat Har Bracha's permission (and the name:
Har Bracha has its own iOS app, "Daily Pearl"). TestFlight with your own testers is fine meanwhile.

For the listing you'll need screenshots from a 6.9" iPhone and a 13" iPad (the simulators: iPhone 16 Pro Max and
iPad Pro 13-inch, then File → Save Screen), a privacy policy URL, and the privacy answers: Pearls collects no data.
`Pearls/PrivacyInfo.xcprivacy` already declares that.

## What the native shell does

| | |
|---|---|
| `PearlsApp.swift` | Starts the app. iPhone/iPad: UIKit (AppDelegate, SceneDelegate, so iOS can wake Pearls to finish downloads). Mac: SwiftUI. |
| `PearlsWebView.swift` | The web view. On iPhone/iPad `PearlsViewController` colours the status bar and the area behind it with the skin, and passes "headphones disconnected" to the page, which pauses if Settings says so. |
| `PearlsScheme.swift` | Serves the app at `pearls://app/…` (so settings and progress persist), proxies ph.yhb.org.il (its CORS headers are malformed), serves downloaded audio at `/dl/NAME` with byte ranges and saved text at `/native/text/KEY`. |
| `PearlsNative.swift` + `native-shim.js` | `window.PearlsNative`, the same interface as Android's `PearlsBridge.java`. Downloads use a background URLSession, so they continue with the app closed; "Wi-Fi only" keeps them off mobile data and Low Data Mode. Files live in Application Support/Pearls (`dl/`, `text/`), excluded from iCloud backup. |
| `KokoroNative.swift` | The natural voice run by the app: ONNX Runtime (Swift package, fetched by Xcode on the first build) runs Kokoro through Core ML where it can, else on the processor. Downloads its files into Application Support/Pearls/kokoro/ and answers the page at `pearls://app/native/kokoro/`. The page makes the phonemes; the app makes the sound. |
| `Info.plist` | Background audio, the scene setup, status bar per view controller. |
| `PrivacyInfo.xcprivacy` | No tracking, no data collected; free disk space is read only to show it on the Downloads page. |
| `build_ios.sh`, `ExportOptions.plist` | Sync and open; or archive and export an .ipa for App Store Connect. |

Background audio keeps playing with the screen locked, and the lock screen and Control Centre controls come from the
page's Media Session, which WebKit handles itself.

## Updating the content

The app's pages live in `www/`, copied from the main project. After changing the web app run `./sync_www.sh` (or
`./build_ios.sh`), then rebuild in Xcode. For a new TestFlight build, raise **Build** (`CURRENT_PROJECT_VERSION`) in the
target's General tab; App Store Connect refuses a build number it has seen.

## Things to check on the first real build

These can't be tested without a Mac and a device:

- downloaded audio plays (it is served through the `pearls://` scheme with byte ranges, the way Capacitor apps do it;
  if a file won't play, the page already falls back to streaming it);
- a download started with the app open finishes after you leave the app;
- reading a chapter's Hebrew offline after it has loaded once (if WebKit refuses the synchronous read from the
  `pearls://` scheme, the page simply fetches it again online);
- the status bar text is dark on light skins and light on dark ones;
- Settings → Voice → Natural (Kokoro): Download, then ▶ on a voice. Settings says where it runs ("Neural Engine and
  graphics chip (Core ML)" or "processor") and, after a sample, how fast.
