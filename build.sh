#!/bin/sh
# Build everything: books -> web app -> Android APK -> Apple project zip.
#   ./build.sh            lite APK (English bundled, Hebrew fetched live)
#   PEARLS_FULL=1 ./build.sh   bundle the Hebrew too (bigger, works offline)
# Needs: python3, node, a JDK (javac + java), zip. Signing keys in signer/key.pem + signer/cert.pem (not in git).
set -e
cd "$(dirname "$0")"
[ -d signer/node_modules ] || (cd signer && npm ci --silent)
if [ ! -f signer/key.pem ] || [ ! -f signer/cert.pem ]; then
  echo "Missing signer/key.pem or signer/cert.pem. Use the existing keys so the APK installs over the current one;"
  echo "only for a fresh install: openssl req -x509 -newkey rsa:2048 -nodes -keyout signer/key.pem -out signer/cert.pem -days 10000 -subj /CN=Pearls"
  exit 1
fi
python3 make_catalog.py
python3 make_translit.py
[ -f www/fonts/web/fonts.css ] || python3 fetch_webfonts.py
python3 patch_webfonts.py >/dev/null      # adds ḥ ĥ ḳ ʿ ½ … where a face lacks them
python3 test_fonts.py || exit 1          # hard rule: every letter in the app is drawn by its own typeface
python3 test_flat.py || exit 1           # hard rule: flat skins, no soft gradients or blurred shadows
python3 make_en_books.py
python3 make_he_books.py
python3 android/build_apk.py
VER=$(sed -n 's/.*versionName="\([^"]*\)".*/\1/p' android/AndroidManifest.xml)
python3 android/build_aab.py
mkdir -p dist && cp Pearls.apk "dist/Pearls-$VER.apk" && cp Pearls.aab "dist/Pearls-$VER.aab"
./apple/sync_www.sh
rm -f dist/Pearls-Apple.zip && zip -qr dist/Pearls-Apple.zip apple -x 'apple/build/*' '*/xcuserdata/*'
echo "Built dist/Pearls-$VER.apk, dist/Pearls-$VER.aab (Google Play) and dist/Pearls-Apple.zip"
