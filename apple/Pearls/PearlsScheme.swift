import Foundation
import WebKit

/// Serves the bundled web app at pearls://app/…, proxies text requests to ph.yhb.org.il, and serves what
/// PearlsNative keeps on the device: downloaded audio at /dl/NAME and saved chapter text at /native/text/KEY.
///
/// Why a custom scheme: the page then has a real origin, so localStorage persists and
/// the books load as scripts. Why a proxy: ph.yhb.org.il sends two Access-Control-Allow-Origin
/// headers, which browsers reject, so the page can't read the text directly.
final class PearlsScheme: NSObject, WKURLSchemeHandler {
    static let name = "pearls"
    private static let allowedHosts: Set<String> = ["ph.yhb.org.il"]
    /// Sync across devices (Settings → Sync): the page calls pearls://app/api/…, forwarded to pearls.pages.dev.
    /// The server sends no CORS headers, so the page can't call it from the pearls:// origin directly.
    static let syncPaths: Set<String> = ["/api/sync", "/api/claim", "/api/devices"]
    static let syncHost = "https://pearls.pages.dev"

    private let root: URL = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task, URLError(.badURL)) }
        if url.path == "/proxy" { return proxy(task, url) }
        if Self.syncPaths.contains(url.path) { return sync(task, url) }
        if url.path.hasPrefix("/dl/") { return download(task, url, name: String(url.path.dropFirst(4))) }
        if url.path.hasPrefix("/native/text/") {
            let key = String(url.path.dropFirst("/native/text/".count))
            guard let data = PearlsNative.readText(key) else {
                return respond(task, url: url, data: Data(), mime: "text/plain", status: 404)
            }
            return respond(task, url: url, data: data, mime: "application/json", status: 200)
        }

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

    // MARK: - downloaded audio

    /// pearls://app/dl/NAME: a file PearlsNative downloaded. The audio element asks for byte ranges (to seek, and
    /// because WebKit's media loader needs them), so Range is answered with 206 and only that part is read.
    private func download(_ task: WKURLSchemeTask, _ url: URL, name: String) {
        let file = PearlsNative.dlDir.appendingPathComponent(name)
        guard PearlsNative.safe(name), let handle = try? FileHandle(forReadingFrom: file) else {
            return respond(task, url: url, data: Data(), mime: "text/plain", status: 404)
        }
        defer { try? handle.close() }
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        let mime = Self.mime(file.pathExtension)
        guard let range = task.request.value(forHTTPHeaderField: "Range"), size > 0,
              let r = Self.byteRange(range, size: size) else {
            let data = handle.readDataToEndOfFile()
            return respond(task, url: url, data: data, mime: mime, status: 200, extra: ["Accept-Ranges": "bytes"])
        }
        let start = r.0, end = r.1
        try? handle.seek(toOffset: UInt64(start))
        let data = handle.readData(ofLength: end - start + 1)
        respond(task, url: url, data: data, mime: mime, status: 206,
                extra: ["Accept-Ranges": "bytes", "Content-Range": "bytes \(start)-\(start + data.count - 1)/\(size)"])
    }

    /// "bytes=START-END", "bytes=START-" or "bytes=-SUFFIX" -> inclusive offsets within the file.
    static func byteRange(_ header: String, size: Int) -> (Int, Int)? {
        guard header.hasPrefix("bytes=") else { return nil }
        let spec = header.dropFirst(6).split(separator: ",").first.map(String.init) ?? ""
        let parts = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 2 else { return nil }
        if parts[0].isEmpty {
            guard let n = Int(parts[1]), n > 0 else { return nil }
            return (max(0, size - n), size - 1)
        }
        guard let start = Int(parts[0]), start < size else { return nil }
        let end = Int(parts[1]).map { min($0, size - 1) } ?? size - 1
        return end >= start ? (start, end) : nil
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

    // MARK: - sync

    /// Forwards a sync request with its method, body and device token (Authorization). No cookies: the apps prove
    /// who they are with the token a signed-in browser handed over, never the browser's pass.
    private func sync(_ task: WKURLSchemeTask, _ url: URL) {
        var comps = URLComponents(string: Self.syncHost + url.path)!
        comps.query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.query
        guard let remote = comps.url else { return fail(task, URLError(.badURL)) }
        var request = URLRequest(url: remote, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25)
        request.httpMethod = task.request.httpMethod ?? "GET"
        request.httpBody = task.request.httpBody ?? Self.readStream(task.request.httpBodyStream)
        request.httpShouldHandleCookies = false
        for h in ["Content-Type", "Authorization"] {
            if let v = task.request.value(forHTTPHeaderField: h) { request.setValue(v, forHTTPHeaderField: h) }
        }
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

    private static func readStream(_ stream: InputStream?) -> Data? {
        guard let stream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data()
        var buf = [UInt8](repeating: 0, count: 16384)
        while stream.hasBytesAvailable {
            let n = stream.read(&buf, maxLength: buf.count)
            if n <= 0 { break }
            data.append(buf, count: n)
        }
        return data
    }

    // MARK: - helpers

    private func isStopped(_ task: WKURLSchemeTask) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return stopped.contains(ObjectIdentifier(task))
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, data: Data, mime: String, status: Int,
                         extra: [String: String] = [:]) {
        guard !isStopped(task) else { return }
        let textual = mime.hasPrefix("text/") || mime.contains("javascript") || mime.contains("json")
        var headers = [
            "Content-Type": textual ? "\(mime); charset=utf-8" : mime,
            "Content-Length": String(data.count),
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        ]
        headers.merge(extra) { _, new in new }
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
