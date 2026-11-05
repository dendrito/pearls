import Foundation
import WebKit

/// The native half of window.PearlsNative on iPhone, iPad and Mac (the page half is native-shim.js).
///
/// It does what android/java/.../PearlsBridge.java does on Android:
///  - audio downloads for offline listening, into Application Support/Pearls/dl/NAME, served to the page at
///    pearls://app/dl/NAME by PearlsScheme. On iPhone and iPad they use a background URLSession, so they carry on
///    with the app closed, and "Wi-Fi only" keeps them off mobile data and Low Data Mode;
///  - Hebrew chapter text kept for offline reading, in Application Support/Pearls/text/KEY;
///  - the skin's bar colour (setBars) handed to the iOS view controller.
/// Both folders are excluded from iCloud backup: everything in them can be downloaded again.
final class PearlsNative: NSObject, WKScriptMessageHandler, URLSessionDownloadDelegate {
    static let shared = PearlsNative()
    static let handlerName = "pearls"
    private static let userAgent = "Pearls (Apple; offline downloads)"
    private static let sessionID = "app.pearls.halakha.downloads"

    /// Set by the iOS view controller: "#RRGGBB" and whether the skin is light (dark status bar text).
    var onBars: ((String, Bool) -> Void)?
    /// Set by the app delegate when iOS wakes the app to finish background downloads.
    var backgroundCompletion: (() -> Void)?

    private let webViews = NSHashTable<WKWebView>.weakObjects()
    private var tasks: [String: URLSessionDownloadTask] = [:]   // name -> task still downloading
    private var started: [String: Date] = [:]                    // when each task was (re)started
    private var waiting = Set<String>()                          // told by URLSession it waits for a network
    private var failed: [[String: Any]] = []                     // reported to the page once
    private var ack = 0                                           // last message seq handled
    private var pushPending = false
    private lazy var session: URLSession = {
        #if os(iOS)
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionID)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        #else
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        #endif
        config.httpMaximumConnectionsPerHost = 3
        config.httpAdditionalHeaders = ["User-Agent": Self.userAgent]
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()

    // MARK: - folders

    static let base: URL = {
        let fm = FileManager.default
        let support = (try? fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? fm.temporaryDirectory
        return support.appendingPathComponent("Pearls", isDirectory: true)
    }()
    static let dlDir = folder("dl")
    static let textDir = folder("text")

    private static func folder(_ name: String) -> URL {
        var url = base.appendingPathComponent(name, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return url
    }

    static func safe(_ name: String) -> Bool {
        guard (1...80).contains(name.count), !name.contains("..") else { return false }
        return name.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) && $0.isASCII || "._-".unicodeScalars.contains($0) }
    }

    // MARK: - setup

    override init() {
        super.init()
        // Downloads started before the app was last closed are still in the background session.
        session.getAllTasks { [weak self] all in
            DispatchQueue.main.async {
                guard let self else { return }
                for case let t as URLSessionDownloadTask in all where t.state != .completed {
                    if let name = t.taskDescription, Self.safe(name) { self.tasks[name] = t; self.started[name] = Date() }
                }
                self.schedulePush()
            }
        }
    }

    /// Wires a web view to the bridge: the message handler plus the page half, with today's state baked in.
    func install(in config: WKWebViewConfiguration) {
        config.userContentController.add(WeakHandler(self), name: Self.handlerName)
        guard let shimURL = Bundle.main.url(forResource: "native-shim", withExtension: "js"),
              let shim = try? String(contentsOf: shimURL, encoding: .utf8) else { return }
        let status: [String: Any] = ["active": active(), "failed": [[String: Any]]()]
        let state: [String: Any] = ["info": info(), "status": status, "list": list(Self.dlDir), "texts": list(Self.textDir)]
        let boot = json(state)
        let script = WKUserScript(source: shim.replacingOccurrences(of: "__BOOT__", with: boot),
                                  injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(script)
    }

    func attach(_ web: WKWebView) { webViews.add(web) }

    // MARK: - state

    private func info() -> [String: Any] {
        var free: Int64 = 0
        let keys: Set<URLResourceKey> = [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey]
        if let v = try? Self.dlDir.resourceValues(forKeys: keys) {
            free = v.volumeAvailableCapacityForImportantUsage ?? Int64(v.volumeAvailableCapacity ?? 0)
        }
        return ["ok": true, "dir": "\(PearlsScheme.name)://app/dl/", "free": free, "online": true, "metered": false,
                "kokoro": true,        // the app runs the natural voice itself (KokoroNative)
                "appleVoices": true]   // and lists and renders the device's own voices, Premium and Enhanced too (AppleVoice)
    }

    private func list(_ dir: URL) -> [[String: Any]] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])) ?? []
        return files.compactMap { f -> [String: Any]? in
            let name = f.lastPathComponent
            guard !name.hasSuffix(".part"), !name.hasSuffix(".tmp"), !name.hasPrefix("."),
                  let v = try? f.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]), v.isRegularFile == true else { return nil }
            return ["n": name, "s": v.fileSize ?? 0]
        }
    }

    private func active() -> [[String: Any]] {
        tasks.map { entry -> [String: Any] in
            let name = entry.key, t = entry.value
            let done = t.countOfBytesReceived, total = max(t.countOfBytesExpectedToReceive, 0)
            // "pending" makes the page say "Waiting for Wi-Fi" (or for a connection). A task that has just started
            // has no bytes yet either, so it counts as running for its first few seconds.
            let fresh = Date().timeIntervalSince(started[name] ?? .distantPast) < 6
            let running = t.state == .running && !waiting.contains(name) && (done > 0 || fresh)
            return ["name": name, "status": running ? "running" : "pending", "done": done, "total": total]
        }
    }

    private func json(_ o: Any) -> String {
        guard let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) else { return "{}" }
        return s
    }

    /// Sends the current state to every page, at most every 0.8 s.
    private func schedulePush() {
        guard !pushPending else { return }
        pushPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in self?.push() }
    }

    private func push() {
        pushPending = false
        let status: [String: Any] = ["active": active(), "failed": failed]
        let state: [String: Any] = ["info": info(), "list": list(Self.dlDir), "texts": list(Self.textDir), "status": status, "ack": ack]
        let payload = json(state)
        failed = []
        for web in webViews.allObjects {
            web.evaluateJavaScript("window.PEARLS_NATIVE_PUSH && window.PEARLS_NATIVE_PUSH(\(payload))", completionHandler: nil)
        }
        if !tasks.isEmpty { schedulePush() }   // keep progress moving while anything downloads
    }

    // MARK: - messages from the page

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let m = body["m"] as? String else { return }
        let a = body["a"] as? [String: Any] ?? [:]
        switch m {
        case "enqueue": enqueue(a["jobs"] as? [[String: Any]] ?? [], wifiOnly: a["wifiOnly"] as? Bool ?? true)
        case "remove": remove(a["names"] as? [String] ?? [])
        case "cancelAll": cancelAll()
        case "writeText": writeText(a["key"] as? String ?? "", a["content"] as? String ?? "")
        case "clearText": clearText()
        case "setBars": onBars?(a["hex"] as? String ?? "", a["light"] as? Bool ?? false)
        case "log": NSLog("[page %@] %@", a["kind"] as? String ?? "log", a["text"] as? String ?? "")
        case "mediaState": break   // WebKit already drives the lock screen and Control Centre from the page's Media Session
        default: break
        }
        if let s = body["seq"] as? Int { ack = max(ack, s) }
        schedulePush()
    }

    private func enqueue(_ jobs: [[String: Any]], wifiOnly: Bool) {
        let fm = FileManager.default
        for j in jobs {
            guard let name = j["name"] as? String, Self.safe(name),
                  let s = j["url"] as? String, let url = URL(string: s), ["https", "http"].contains(url.scheme ?? ""),
                  tasks[name] == nil, !fm.fileExists(atPath: Self.dlDir.appendingPathComponent(name).path) else { continue }
            var req = URLRequest(url: url)
            req.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
            req.allowsCellularAccess = !wifiOnly
            req.allowsExpensiveNetworkAccess = !wifiOnly
            req.allowsConstrainedNetworkAccess = !wifiOnly
            let t = session.downloadTask(with: req)
            t.taskDescription = name
            tasks[name] = t
            started[name] = Date()
            t.resume()
        }
    }

    private func remove(_ names: [String]) {
        for name in names where Self.safe(name) {
            tasks.removeValue(forKey: name)?.cancel()
            started.removeValue(forKey: name)
            try? FileManager.default.removeItem(at: Self.dlDir.appendingPathComponent(name))
        }
    }

    private func cancelAll() {
        tasks.values.forEach { $0.cancel() }
        tasks.removeAll()
        started.removeAll()
    }

    private func writeText(_ key: String, _ content: String) {
        guard Self.safe(key) else { return }
        try? Data(content.utf8).write(to: Self.textDir.appendingPathComponent(key), options: .atomic)
    }

    private func clearText() {
        for f in (try? FileManager.default.contentsOfDirectory(at: Self.textDir, includingPropertiesForKeys: nil)) ?? [] {
            try? FileManager.default.removeItem(at: f)
        }
    }

    /// For PearlsScheme: pearls://app/native/text/KEY
    static func readText(_ key: String) -> Data? {
        guard safe(key) else { return nil }
        return try? Data(contentsOf: textDir.appendingPathComponent(key))
    }

    // MARK: - URLSession

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let name = downloadTask.taskDescription, Self.safe(name) else { return }
        let code = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
        guard (200..<300).contains(code) else {
            failed.append(["name": name, "reason": code])
            return
        }
        // The temporary file is deleted when this returns, so move it now.
        let dest = Self.dlDir.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.moveItem(at: location, to: dest) }
        catch { failed.append(["name": name, "reason": 1001]) }
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if let name = downloadTask.taskDescription { waiting.remove(name) }
        schedulePush()
    }

    func urlSession(_ s: URLSession, taskIsWaitingForConnectivity task: URLSessionTask) {
        if let name = task.taskDescription { waiting.insert(name) }
        schedulePush()
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let name = task.taskDescription else { return }
        if tasks[name] === task { tasks.removeValue(forKey: name); started.removeValue(forKey: name) }
        waiting.remove(name)
        if let error = error as? URLError, error.code != .cancelled {
            failed.append(["name": name, "reason": error.code.rawValue])
        }
        schedulePush()
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async { [weak self] in
            self?.backgroundCompletion?()
            self?.backgroundCompletion = nil
        }
    }
}

/// WKUserContentController keeps its handlers strongly; this stops it keeping the bridge alive in a cycle.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
