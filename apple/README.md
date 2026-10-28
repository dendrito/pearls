# Pearls for iPad, iPhone and Mac

One Xcode project, one target, three platforms: iPadOS, iOS and native macOS (not Catalyst).
It wraps the same web app as the Android build (`www/`) in a WKWebView.

## Build and run (about 5 minutes)

1. On a Mac, install **Xcode 15 or later** from the App Store.
2. Unzip this folder and double-click **`Pearls.xcodeproj`**.
3. Click the **Pearls** project → target **Pearls** → **Signing & Capabilities** → **Team**: choose your Apple ID
   (Xcode → Settings → Accounts → + if it isn't there yet). A free Apple ID works.
   If Xcode says the bundle identifier is taken, change `app.pearls.halakha` to something of your own, e.g. `com.yourname.pearls`.
4. In the toolbar's device menu pick where to run:
   - **My Mac** → press ▶. The app opens in a window; it is also in your build folder (Product → Show Build Folder) to drag into Applications.
   - **Your iPad** (connected by cable, or on the same Wi‑Fi after the first cable pairing) → press ▶.
     The first time, on the iPad open Settings → General → VPN & Device Management → trust your developer profile.
     On iPadOS 16+ also turn on Settings → Privacy & Security → **Developer Mode** (the iPad restarts).

With a free Apple ID the iPad copy stops opening after 7 days; press ▶ again to renew it.
A paid Apple Developer account ($99/yr) removes that limit and allows TestFlight or the App Store.

## What the native shell adds

- **Background audio** on iPad/iPhone: playback continues with the screen locked (UIBackgroundModes = audio).
- **pearls:// scheme**: the app is served from `pearls://app/…`, so settings, progress and playlists persist.
- **Text proxy**: ph.yhb.org.il sends two `Access-Control-Allow-Origin` headers, which WebKit rejects;
  the app fetches text from that host natively (`PearlsScheme.swift`, host allow-list: ph.yhb.org.il only).
- Links to Sefaria, Meldar and the Hebrew source open in Safari / your default browser.
- macOS: sandboxed, network-client entitlement only; window opens at 1100×820 and resizes freely.

## Updating the content

The app's pages live in `www/`, copied from the main project. After changing the web app run:

    ./sync_www.sh

then rebuild in Xcode.
