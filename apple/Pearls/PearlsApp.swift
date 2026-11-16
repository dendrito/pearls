import SwiftUI
import WebKit
#if os(iOS)
import UIKit
import AVFoundation
#endif

/* Pearls for iPhone, iPad and Mac: the same web app as the Android build, bundled in `www/` and shown in a WKWebView.
   iPhone and iPad start from UIKit (AppDelegate + SceneDelegate + PearlsViewController) so the status bar can follow
   the skin and iOS can wake the app to finish background downloads. The Mac starts from SwiftUI. */

#if os(iOS)

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Keep audio playing with the screen locked or the app in the background
        // (needs UIBackgroundModes = audio, set in Info.plist).
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)
        _ = PearlsNative.shared   // picks up downloads that carried on while the app was closed
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    /// iOS finished (or gave up on) downloads while Pearls was not running and wants to tell it.
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        PearlsNative.shared.backgroundCompletion = completionHandler
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = PearlsViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

#else

@main
struct PearlsApp: App {
    var body: some Scene {
        WindowGroup {
            PearlsWebView()
                .ignoresSafeArea()
                .frame(minWidth: 420, minHeight: 620)
        }
        .defaultSize(width: 1100, height: 820)
        .commands { CommandGroup(replacing: .newItem) {} }
    }
}

#endif
