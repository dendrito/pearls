import SwiftUI
import WebKit
#if os(iOS)
import UIKit
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
}

enum WebFactory {
    static func make(coordinator: WebCoordinator) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PearlsScheme(), forURLScheme: PearlsScheme.name)
        config.mediaTypesRequiringUserActionForPlayback = []
        #if os(iOS)
        config.allowsInlineMediaPlayback = true
        let shell = "ios"
        #else
        let shell = "mac"
        #endif
        let boot = WKUserScript(
            source: "window.PEARLS_PROXY = '\(PearlsScheme.name)://app/proxy?u='; window.PEARLS_SHELL = '\(shell)';",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(boot)

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = coordinator
        web.navigationDelegate = coordinator
        #if os(iOS)
        // Let the page's own safe-area padding (viewport-fit=cover) do the work.
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.043, green: 0.059, blue: 0.102, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        #else
        web.setValue(false, forKey: "drawsBackground")
        #endif
        if #available(iOS 16.4, macOS 13.3, *) { web.isInspectable = true }
        web.load(URLRequest(url: URL(string: "\(PearlsScheme.name)://app/index.html")!))
        return web
    }
}

#if os(iOS)
struct PearlsWebView: UIViewRepresentable {
    func makeCoordinator() -> WebCoordinator { WebCoordinator() }
    func makeUIView(context: Context) -> WKWebView { WebFactory.make(coordinator: context.coordinator) }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
#else
struct PearlsWebView: NSViewRepresentable {
    func makeCoordinator() -> WebCoordinator { WebCoordinator() }
    func makeNSView(context: Context) -> WKWebView { WebFactory.make(coordinator: context.coordinator) }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif
