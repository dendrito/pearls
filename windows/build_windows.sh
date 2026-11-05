#!/usr/bin/env bash
# Pearls for Windows: www/ in Electron, packaged as an installer (NSIS) and a portable zip, for x64 and ARM.
#   ./windows/build_windows.sh            -> dist/windows/Pearls-Setup-<ver>-x64.exe, -arm64.exe, Pearls-<ver>-<arch>.zip
#   ./windows/build_windows.sh --dir      -> unpacked app only (dist/windows/win-unpacked), quicker for a look
# Runs on Windows, macOS or Linux. Elsewhere than Windows, electron-builder needs Wine (Linux: apt install wine64) to
# stamp the icon and version into Pearls.exe and build the installer; PEARLS_NO_WINE=1 builds only what needs no Wine.
set -euo pipefail
cd "$(dirname "$0")"
VER=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' ../android/AndroidManifest.xml)
node -e 'const f="package.json",p=require("./"+f);p.version=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$VER"
rm -rf www && mkdir www
# the web app as the phones get it, minus the Android-only first-launch page
(cd ../www && tar cf - --exclude=migrate.html .) | (cd www && tar xf -)
[ -d node_modules/electron-builder ] || npm ci --no-audit --no-fund
ARGS=(--win)
[ "${PEARLS_NO_WINE:-}" = "1" ] && ARGS+=(-c.win.signAndEditExecutable=false)
rm -rf ../dist/windows
if [ "${1:-}" = "--dir" ]; then npx electron-builder "${ARGS[@]}" --dir --x64 --publish never; exit; fi
# one installer per architecture (a combined one would make everyone download both)
for A in x64 arm64; do npx electron-builder "${ARGS[@]}" --$A --publish never; done
rm -f ../dist/windows/*.blockmap ../dist/windows/builder-*.yml
ls -la ../dist/windows | grep -iE '\.exe|\.zip' 
