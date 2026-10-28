import Foundation
import WebKit

/// Serves the bundled web app at pearls://app/… and proxies text requests to ph.yhb.org.il.
///
/// Why a custom scheme: the page then has a real origin, so localStorage persists and
/// the books load as scripts. Why a proxy: ph.yhb.org.il sends two Access-Control-Allow-Origin
/// headers, which browsers reject, so the page can't read the text directly.
final class PearlsScheme: NSObject, WKURLSchemeHandler {
    static let name = "pearls"
    private static let allowedHosts: Set<String> = ["ph.yhb.org.il"]

    private let root: URL = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task, URLError(.badURL)) }
        if url.path == "/proxy" { return proxy(task, url) }

        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: file) else {
            return respond(task, url: url, data: Data(), mime: "text/plain", status: 404)
        }
        respond(task, url: url, data: data, mime: Self.mime(file.pathExtension), status: 200)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        lock.lock(); stopped.insert(ObjectIdentifier(task)); lock.unlock()
    }

    // MARK: - proxy

    private func proxy(_ task: WKURLSchemeTask, _ url: URL) {
        guard let target = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "u" })?.value,
              let remote = URL(string: target),
              remote.scheme == "https",
              let host = remote.host, Self.allowedHosts.contains(host) else {
            return respond(task, url: url, data: Data(), mime: "text/plain", status: 403)
        }
        var request = URLRequest(url: remote, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 25)
        request.setValue("Pearls (Apple)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let error { return self.fail(task, error) }
                let http = response as? HTTPURLResponse
                self.respond(task, url: url, data: data ?? Data(),
                             mime: http?.mimeType ?? "application/json", status: http?.statusCode ?? 200)
            }
        }.resume()
    }

    // MARK: - helpers

    private func isStopped(_ task: WKURLSchemeTask) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return stopped.contains(ObjectIdentifier(task))
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, data: Data, mime: String, status: Int) {
        guard !isStopped(task) else { return }
        let textual = mime.hasPrefix("text/") || mime.contains("javascript") || mime.contains("json")
        let headers = [
            "Content-Type": textual ? "\(mime); charset=utf-8" : mime,
            "Content-Length": String(data.count),
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        ]
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func fail(_ task: WKURLSchemeTask, _ error: Error) {
        guard !isStopped(task) else { return }
        task.didFailWithError(error)
    }

    private static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "webmanifest": return "application/manifest+json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "mp3": return "audio/mpeg"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}
