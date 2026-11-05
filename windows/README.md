# Pearls for Windows

The same web app as the phones (`www/`), in an Electron window. Windows 10 and 11, x64 and ARM.

## What it does

- **Reads offline.** All the English and the AI translations are inside the app. A chapter's Hebrew is kept once it
  has loaded (in `%APPDATA%\Pearls\text`), as on Android.
- **Downloads audio** per chapter, book or playlist, and smart downloads work the same way (download ahead, delete
  after listening, storage cap). Files go to `%APPDATA%\Pearls\dl`. There's no "Wi-Fi only" switch on a PC.
- **Sync across devices**, linked with a one-time code like the phone and iPad apps (Settings → Sync across devices).
- **Voices:** Natural (Kokoro), Light (Piper) and the PC's own voices (Settings → Time & language → Speech). Kokoro
  and Piper run in the window, as on the web; each is downloaded only when you ask for it.
- **Media keys and the Windows media overlay** show the chapter playing; the taskbar thumbnail has previous, play/pause
  and next. The PC doesn't go to sleep in the middle of a chapter.
- **Headphones:** when the default output disappears (earbuds disconnect), playback pauses if Settings → Pause when
  headphones disconnect is on.
- Links out (Sefaria, Meldar, credits) open in the browser. F11 full screen, Ctrl+R reload, F12 developer tools.

## How it's put together

| File | What |
|---|---|
| `main.js` | Serves `www/` on `app://pearls/`, plus `/proxy?u=` (ph.yhb.org.il only) and `/dl/NAME` (downloads, with byte ranges). Implements Android's `PearlsNative` bridge (downloads, kept text), the taskbar buttons and the window. |
| `preload.js` | Gives the page `window.PearlsNative`, `PEARLS_SHELL = "windows"` (the page then says "this PC") and `PEARLS_PROXY`; watches the audio outputs for the headphones rule. The page gets no Node. |
| `build/icon.ico`, `icons/` | Made by `python3 android/make_icons.py`. |
| `build_windows.sh` | Copies `www/` in, sets the version from `android/AndroidManifest.xml`, builds with electron-builder. |

## Build

    ./windows/build_windows.sh          # dist/windows/Pearls-Setup-<ver>-x64.exe and -arm64.exe, plus portable zips
    ./windows/build_windows.sh --dir    # just the unpacked app, x64

It needs Node 20+. On Windows, nothing else. On Linux or a Mac, electron-builder needs Wine to put the Pearls icon
into `Pearls.exe`; without Wine, `PEARLS_NO_WINE=1 ./windows/build_windows.sh` and the exe keeps Electron's icon
(the installer, Start menu and desktop shortcuts still show Pearls').

The GitHub Action **Windows app** (`.github/workflows/windows.yml`) builds everything on a Windows machine when run by
hand (Actions → Windows app → Run workflow) and attaches the files to the run.

## Test

    cd windows && npm ci && cd ..
    NODE_PATH=$(npm root -g) xvfb-run -a node test_windows_shell.mjs     # on Windows or a Mac, without xvfb-run

It runs the real `main.js` and must end "windows shell: 24/24".

## Not signed

The installer isn't code-signed, so the first time Windows SmartScreen says "Windows protected your PC". Choose
**More info → Run anyway**. Signing needs a code-signing certificate (or Microsoft Store distribution); when there is
one, electron-builder takes it through `CSC_LINK` / `CSC_KEY_PASSWORD`.

There's no automatic update yet: a new version is a new installer, which installs over the old one and keeps your
data.
