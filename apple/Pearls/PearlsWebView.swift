import SwiftUI
import WebKit
#if os(iOS)
import UIKit
import AVFoundation
#else
import AppKit
#endif

/// Opens links that leave the app (Sefaria, Meldar, the Hebrew source pages) in the browser.
private func openExternally(_ url: URL) {
    #if os(iOS)
    UIApplication.shared.open(url)
    #else
    NSWorkspace.shared.open(url)
    #endif
}

final class WebCoordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
    // target="_blank" links
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openExternally(url) }
        return nil
    }

    // Any top-level navigation away from the bundled app goes to the browser.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(),
           scheme != PearlsScheme.name,
           !["about", "blob", "data"].contains(scheme),
           navigationAction.targetFrame?.isMainFrame ?? true {
            openExternally(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // If the web content process is killed (memory pressure in the background), reload rather than show a blank page.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

enum WebFactory {
    static let night = (r: 0.043, g: 0.059, b: 0.102)   // #0B0F1A, the Classic skin, until the page says otherwise

    static func make(coordinator: WebCoordinator) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PearlsScheme(), forURLScheme: PearlsScheme.name)
        config.mediaTypesRequiringUserActionForPlayback = []
        #if os(iOS)
        config.allowsInlineMediaPlayback = true
        let shell = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "ios"
        #else
        let shell = "mac"
        #endif
        let boot = WKUserScript(
            source: "window.PEARLS_PROXY = '\(PearlsScheme.name)://app/proxy?u='; window.PEARLS_SHELL = '\(shell)'; window.PEARLS_SYNC_MODE = { base: '', token: true };",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(boot)
        PearlsNative.shared.install(in: config)   // window.PearlsNative: downloads, offline text, bar colour

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = coordinator
        web.navigationDelegate = coordinator
        PearlsNative.shared.attach(web)
        #if os(iOS)
        // Let the page's own safe-area padding (viewport-fit=cover) do the work.
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = UIColor(red: night.r, green: night.g, blue: night.b, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.allowsBackForwardNavigationGestures = false
        #else
        web.setValue(false, forKey: "drawsBackground")
        #endif
        if #available(iOS 16.4, macOS 13.3, *) { web.isInspectable = true }
        web.load(URLRequest(url: URL(string: "\(PearlsScheme.name)://app/index.html")!))
        return web
    }
}

#if os(iOS)

/// iPhone and iPad: the web view fills the window; the status bar and the colour behind it follow the skin.
final class PearlsViewController: UIViewController {
    private let coordinator = WebCoordinator()
    private var web: WKWebView!
    private var lightSkin = false

    override func loadView() {
        web = WebFactory.make(coordinator: coordinator)
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        PearlsNative.shared.onBars = { [weak self] hex, light in self?.setBars(hex, light: light) }
        // Headphones unplugged or earbuds disconnected: the page decides whether to pause (Settings).
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { lightSkin ? .darkContent : .lightContent }

    private func setBars(_ hex: String, light: Bool) {
        lightSkin = light
        if let c = Self.color(hex) {
            web.backgroundColor = c
            web.scrollView.backgroundColor = c
            web.underPageBackgroundColor = c
        }
        setNeedsStatusBarAppearanceUpdate()
    }

    @objc private func routeChanged(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        DispatchQueue.main.async { [weak self] in
            self?.web.evaluateJavaScript("window.PEARLS_MEDIA && window.PEARLS_MEDIA('noisy')", completionHandler: nil)
        }
    }

    private static func color(_ hex: String) -> UIColor? {
        let h = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                       blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}

#else

struct PearlsWebView: NSViewRepresentable {
    func makeCoordinator() -> WebCoordinator { WebCoordinator() }
    func makeNSView(context: Context) -> WKWebView { WebFactory.make(coordinator: context.coordinator) }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

#endif
