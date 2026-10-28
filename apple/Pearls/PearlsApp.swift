import SwiftUI
#if os(iOS)
import AVFoundation
#endif

/// Pearls for iPad, iPhone and Mac: the same web app as the Android build,
/// bundled in `www/` and shown in a WKWebView.
@main
struct PearlsApp: App {
    init() {
        #if os(iOS)
        // Keep audio playing with the screen locked or the app in the background
        // (needs UIBackgroundModes = audio, set in Info.plist).
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)
        #endif
    }

    var body: some Scene {
        #if os(macOS)
        WindowGroup {
            PearlsWebView()
                .ignoresSafeArea()
                .frame(minWidth: 420, minHeight: 620)
        }
        .defaultSize(width: 1100, height: 820)
        .commands { CommandGroup(replacing: .newItem) {} }
        #else
        WindowGroup {
            PearlsWebView()
                .ignoresSafeArea()
        }
        #endif
    }
}
