#!/bin/sh
# Pearls for iPhone and iPad, on a Mac with Xcode 15 or later.
#
#   ./build_ios.sh                       copy the web app into the project and open it in Xcode
#   TEAM=ABCDE12345 ./build_ios.sh ipa   build an .ipa for App Store Connect (TestFlight, then the App Store)
#
# TEAM is your Apple Developer Team ID (developer.apple.com → Account → Membership details). The ipa step needs the
# paid Apple Developer Program; running on your own iPad from Xcode works with a free Apple ID.
# Output: build/Pearls.xcarchive and build/ipa/Pearls.ipa. Upload the ipa with Xcode's Organizer or the Transporter app.
set -e
cd "$(dirname "$0")"
command -v xcodebuild >/dev/null || { echo "Needs Xcode (App Store), then: sudo xcode-select -s /Applications/Xcode.app"; exit 1; }
./sync_www.sh

case "${1:-open}" in
  open)
    open Pearls.xcodeproj
    ;;
  ipa)
    [ -n "$TEAM" ] || { echo "Set TEAM to your Apple Developer Team ID, e.g. TEAM=ABCDE12345 ./build_ios.sh ipa"; exit 1; }
    rm -rf build/Pearls.xcarchive build/ipa
    xcodebuild -project Pearls.xcodeproj -scheme Pearls -configuration Release \
      -destination 'generic/platform=iOS' -archivePath build/Pearls.xcarchive \
      DEVELOPMENT_TEAM="$TEAM" -allowProvisioningUpdates archive
    sed "s/TEAM_ID/$TEAM/" ExportOptions.plist > build/ExportOptions.plist
    xcodebuild -exportArchive -archivePath build/Pearls.xcarchive -exportPath build/ipa \
      -exportOptionsPlist build/ExportOptions.plist -allowProvisioningUpdates
    echo "Built build/ipa/Pearls.ipa. Upload it with Transporter, or Xcode → Window → Organizer → Distribute App."
    ;;
  *) echo "usage: ./build_ios.sh [open|ipa]"; exit 1 ;;
esac
