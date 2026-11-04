import Foundation
import onnxruntime_objc

/// The natural voice (Kokoro 82M) run by the app itself, not by the web page.
///
/// Why: in WKWebView the page's graphics memory is capped, so on an iPad the full model ran out of memory on WebGPU
/// ("[webgpu] RangeError: Out of memory") and the processor fallback was slow. The app has no such cap. Here ONNX Runtime
/// runs the same model Estante's web worker runs (onnx-community/Kokoro-82M-v1.0-ONNX, full precision), through Core ML
/// where Core ML takes the graph (the Neural Engine and the graphics chip), and on the processor otherwise.
///
/// The page still makes the phonemes (eSpeak NG, plus Pearls' rules for Hebrew words), because that is where the
/// Hebrew ḥ is kept; the app turns phonemes into sound. Served by PearlsScheme at pearls://app/native/kokoro/…:
///   status            {downloaded, bytes, loading, loaded, how, progress:{loaded,total}, error}
///   download?wifi=1   start fetching the files (returns at once; status shows progress)
///   load              open the model (returns {how} when ready)
///   say?ph=&v=&s=     a WAV of the phonemes, header X-Gen-Seconds
///   remove            delete the files
///   phonemizer.js     eSpeak NG for the page (downloaded with the model, so phonemes work offline)
/// Nothing is sent anywhere: the files come from their own addresses once, and the voice runs on this device.
final class KokoroNative: NSObject, URLSessionDownloadDelegate {
    static let shared = KokoroNative()

    private static let repo = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/"
    static let voices = ["bf_emma", "bm_george", "am_michael", "af_heart"]
    /// local name -> address. Every address is the one Estante's worker already fetches.
    static let files: [(String, String)] = [
        ("model.onnx", repo + "onnx/model.onnx"),
        ("tokenizer.json", repo + "tokenizer.json"),
        ("phonemizer.js", "https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/dist/phonemizer.js"),
    ] + voices.map { ("\($0).bin", repo + "voices/\($0).bin") }
    static let rate = 24000
    private static let styleDim = 256

    static let dir: URL = {
        var url = PearlsNative.base.appendingPathComponent("kokoro", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var v = URLResourceValues(); v.isExcludedFromBackup = true
        try? url.setResourceValues(v)
        return url
    }()

    private let work = DispatchQueue(label: "app.pearls.kokoro", qos: .userInitiated)
    private let lock = NSLock()
    private var env: ORTEnv?
    private var session: ORTSession?
    private var vocab: [Unicode.Scalar: Int64] = [:]
    private var styles: [String: [Float]] = [:]
    private(set) var how = ""
    private var loading = false
    private var lastError = ""
    // downloads
    private var dlSession: URLSession?
    private var dlTasks: [String: URLSessionDownloadTask] = [:]
    private var dlDone: [String: Int64] = [:]
    private var dlTotal: [String: Int64] = [:]

    private func path(_ name: String) -> URL { Self.dir.appendingPathComponent(name) }
    var downloaded: Bool { Self.files.allSatisfy { FileManager.default.fileExists(atPath: path($0.0).path) } }

    private var bytes: Int64 {
        Self.files.reduce(0) { a, f in a + Int64((try? path(f.0).resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0) }
    }

    func status() -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        var s: [String: Any] = ["downloaded": downloaded, "bytes": bytes, "loading": loading, "loaded": session != nil,
                                "how": how, "error": lastError, "downloading": !dlTasks.isEmpty]
        if !dlTasks.isEmpty {
            s["progress"] = ["loaded": dlDone.values.reduce(0, +), "total": dlTotal.values.reduce(0, +)]
        }
        return s
    }

    // MARK: - download

    func download(wifiOnly: Bool) {
        lock.lock(); defer { lock.unlock() }
        guard dlTasks.isEmpty else { return }
        lastError = ""
        let config = URLSessionConfiguration.default
        config.allowsCellularAccess = !wifiOnly
        config.allowsExpensiveNetworkAccess = !wifiOnly
        config.allowsConstrainedNetworkAccess = !wifiOnly
        config.waitsForConnectivity = true
        config.httpAdditionalHeaders = ["User-Agent": "Pearls (Apple; natural voice)"]
        let s = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        dlSession = s
        dlDone = [:]; dlTotal = [:]
        for (name, address) in Self.files where !FileManager.default.fileExists(atPath: path(name).path) {
            guard let url = URL(string: address) else { continue }
            let t = s.downloadTask(with: url)
            t.taskDescription = name
            dlTasks[name] = t
            dlTotal[name] = name == "model.onnx" ? 325_532_387 : 0   // known before the server says, so the bar starts right
            t.resume()
        }
        if dlTasks.isEmpty { s.finishTasksAndInvalidate(); dlSession = nil }
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let name = downloadTask.taskDescription else { return }
        lock.lock()
        dlDone[name] = totalBytesWritten
        if totalBytesExpectedToWrite > 0 { dlTotal[name] = totalBytesExpectedToWrite }
        lock.unlock()
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let name = downloadTask.taskDescription else { return }
        let code = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
        lock.lock(); defer { lock.unlock() }
        guard (200..<300).contains(code) else { lastError = "could not download \(name) (\(code))"; return }
        let dest = path(name)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.moveItem(at: location, to: dest) }
        catch { lastError = "could not save \(name): \(error.localizedDescription)" }
    }

    func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let name = task.taskDescription else { return }
        lock.lock(); defer { lock.unlock() }
        dlTasks.removeValue(forKey: name)
        if let error, (error as? URLError)?.code != .cancelled { lastError = "could not download \(name): \(error.localizedDescription)" }
        if dlTasks.isEmpty {
            if !lastError.isEmpty { for t in dlTasks.values { t.cancel() } }
            dlSession?.finishTasksAndInvalidate(); dlSession = nil
        }
    }

    func remove() {
        lock.lock()
        dlTasks.values.forEach { $0.cancel() }; dlTasks = [:]
        session = nil; styles = [:]; vocab = [:]; how = ""
        lock.unlock()
        for (name, _) in Self.files { try? FileManager.default.removeItem(at: path(name)) }
    }

    static func phonemizer() -> Data? { try? Data(contentsOf: dir.appendingPathComponent("phonemizer.js")) }

    // MARK: - model

    /// Opens the model once, Core ML first. Calls back on an arbitrary queue.
    func load(_ done: @escaping (Result<String, Error>) -> Void) {
        work.async {
            do { try self.loadNow(); done(.success(self.how)) }
            catch { self.lock.lock(); self.lastError = error.localizedDescription; self.lock.unlock(); done(.failure(error)) }
        }
    }

    private func loadNow() throws {
        if session != nil { return }
        guard downloaded else { throw Self.err("the natural voice is not downloaded on this device") }
        lock.lock(); loading = true; lock.unlock()
        defer { lock.lock(); loading = false; lock.unlock() }
        let env = try self.env ?? ORTEnv(loggingLevel: .warning)
        self.env = env
        // the vocabulary: tokenizer.json's model.vocab, one symbol per id
        let tok = try JSONSerialization.jsonObject(with: Data(contentsOf: path("tokenizer.json"))) as? [String: Any]
        let v = (tok?["model"] as? [String: Any])?["vocab"] as? [String: Any] ?? [:]
        var map: [Unicode.Scalar: Int64] = [:]
        for (k, id) in v { if k.unicodeScalars.count == 1, let s = k.unicodeScalars.first, let n = (id as? NSNumber)?.int64Value { map[s] = n } }
        guard !map.isEmpty else { throw Self.err("the voice's vocabulary did not load") }
        vocab = map
        let model = path("model.onnx").path
        let threads = Int32(max(2, min(6, ProcessInfo.processInfo.activeProcessorCount - 1)))
        // Core ML (Neural Engine and graphics chip) where it takes the graph; the processor for the rest
        do {
            let o = try ORTSessionOptions()
            try o.setIntraOpNumThreads(threads)
            try o.setGraphOptimizationLevel(.all)
            let c = ORTCoreMLExecutionProviderOptions()
            c.enableOnSubgraphs = true
            c.createMLProgram = true
            try o.appendCoreMLExecutionProvider(with: c)
            let s = try ORTSession(env: env, modelPath: model, sessionOptions: o)
            session = s; how = "Neural Engine and graphics chip (Core ML)"
            _ = try synth(Array(repeating: map.values.first ?? 1, count: 4), voice: Self.voices[0], speed: 1)   // proves it runs
        } catch {
            session = nil
            let o = try ORTSessionOptions()
            try o.setIntraOpNumThreads(threads)
            try o.setGraphOptimizationLevel(.all)
            session = try ORTSession(env: env, modelPath: model, sessionOptions: o)
            how = "processor"
        }
    }

    private func style(_ voice: String, tokens: Int) throws -> [Float] {
        let name = Self.voices.contains(voice) ? voice : Self.voices[0]
        if styles[name] == nil {
            let d = try Data(contentsOf: path("\(name).bin"))
            styles[name] = d.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
        }
        let all = styles[name]!
        let rows = all.count / Self.styleDim
        let row = min(max(tokens, 0), rows - 1)   // Kokoro picks the style by the phoneme count
        return Array(all[row * Self.styleDim ..< (row + 1) * Self.styleDim])
    }

    /// phonemes -> 24 kHz samples
    func say(phonemes: String, voice: String, speed: Float, _ done: @escaping (Result<(Data, Double), Error>) -> Void) {
        work.async {
            do {
                try self.loadNow()
                let ids = phonemes.unicodeScalars.compactMap { self.vocab[$0] }.prefix(510)
                guard !ids.isEmpty else { throw Self.err("nothing to say") }
                let t0 = Date()
                let samples = try self.synth(Array(ids), voice: voice, speed: speed)
                done(.success((Self.wav(samples), Date().timeIntervalSince(t0))))
            } catch { done(.failure(error)) }
        }
    }

    private func synth(_ ids: [Int64], voice: String, speed: Float) throws -> [Float] {
        guard let session else { throw Self.err("the natural voice is not loaded") }
        let tokens = [0] + ids + [0]   // id 0 is the pad Kokoro expects at both ends
        let st = try style(voice, tokens: ids.count)
        let idData = NSMutableData(bytes: tokens, length: tokens.count * MemoryLayout<Int64>.size)
        let stData = NSMutableData(bytes: st, length: st.count * MemoryLayout<Float>.size)
        var sp = speed
        let spData = NSMutableData(bytes: &sp, length: MemoryLayout<Float>.size)
        let inputs: [String: ORTValue] = [
            "input_ids": try ORTValue(tensorData: idData, elementType: .int64, shape: [1, NSNumber(value: tokens.count)]),
            "style": try ORTValue(tensorData: stData, elementType: .float, shape: [1, NSNumber(value: Self.styleDim)]),
            "speed": try ORTValue(tensorData: spData, elementType: .float, shape: [1]),
        ]
        let out = try session.run(withInputs: inputs, outputNames: ["waveform"], runOptions: nil)
        guard let w = out["waveform"] else { throw Self.err("the voice made no sound") }
        let d = try w.tensorData() as Data
        return d.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    }

    static func wav(_ s: [Float]) -> Data {
        var d = Data(capacity: 44 + s.count * 2)
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + s.count * 2)); d.append(contentsOf: Array("WAVEfmt ".utf8))
        u32(16); u16(1); u16(1); u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(UInt32(s.count * 2))
        var pcm = [Int16](repeating: 0, count: s.count)
        for i in 0..<s.count { let x = max(-1, min(1, s[i])); pcm[i] = Int16(x < 0 ? x * 32768 : x * 32767) }
        pcm.withUnsafeBytes { d.append(contentsOf: $0) }
        return d
    }

    private static func err(_ s: String) -> NSError { NSError(domain: "Pearls.Kokoro", code: 1, userInfo: [NSLocalizedDescriptionKey: s]) }
}
