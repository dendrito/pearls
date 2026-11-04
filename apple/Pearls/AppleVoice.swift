import Foundation
import AVFoundation

/// The device's own voices, as the app sees them. In WKWebView the page's speechSynthesis lists only the compact voices,
/// so the Premium and Enhanced English voices the reader installed (Settings → Accessibility → Read & Speak, or Live
/// Speech → Voices) never showed up in Pearls. Here AVSpeechSynthesizer renders a piece to a WAV, which the page plays
/// through the same two players as the natural voices: pause, the lock screen, the paragraph highlight and the reading
/// speed all work as they do there. Served by PearlsScheme at pearls://app/native/apple-voice/…:
///   list                 [{id, name, lang, quality: premium|enhanced|default, gender: male|female|}] English only,
///                        best first, male before female within a quality
///   say?text=&id=&rate=  a WAV (16-bit mono), header X-Gen-Seconds
final class AppleVoice {
    static let shared = AppleVoice()
    private var busy: [ObjectIdentifier: AVSpeechSynthesizer] = [:]   // kept alive until their piece is written
    private let lock = NSLock()

    static func quality(_ v: AVSpeechSynthesisVoice) -> String {
        if #available(iOS 16.0, macOS 13.0, *), v.quality == .premium { return "premium" }
        return v.quality == .enhanced ? "enhanced" : "default"
    }
    static func gender(_ v: AVSpeechSynthesisVoice) -> String {
        switch v.gender { case .male: return "male"; case .female: return "female"; default: return "" }
    }

    func list() -> [[String: Any]] {
        let rank = ["premium": 0, "enhanced": 1, "default": 2]
        let vs = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        // novelty voices (Bells, Bubbles, Zarvox…) are in the list too; they have no quality above default and an
        // identifier under "speech.synthesis"
        let real = vs.filter { !$0.identifier.contains("speech.synthesis") }
        return real.map { v -> [String: Any] in
            ["id": v.identifier, "name": v.name, "lang": v.language, "quality": Self.quality(v), "gender": Self.gender(v)]
        }.sorted { a, b in
            let qa = rank[a["quality"] as! String] ?? 3, qb = rank[b["quality"] as! String] ?? 3
            if qa != qb { return qa < qb }
            let ma = (a["gender"] as! String) == "male" ? 0 : 1, mb = (b["gender"] as! String) == "male" ? 0 : 1
            if ma != mb { return ma < mb }
            return (a["name"] as! String) < (b["name"] as! String)
        }
    }

    /// One piece of text -> a WAV. `rate` is the reading speed (1 = normal). Calls back on an arbitrary queue.
    func say(_ text: String, id: String, rate: Float, _ done: @escaping (Result<(Data, Double), Error>) -> Void) {
        DispatchQueue.main.async {
            guard let voice = AVSpeechSynthesisVoice(identifier: id) ?? AVSpeechSynthesisVoice(language: "en-GB") else {
                return done(.failure(Self.err("no English voice on this device")))
            }
            let u = AVSpeechUtterance(string: text)
            u.voice = voice
            let r = AVSpeechUtteranceDefaultSpeechRate * max(0.5, min(2, rate))
            u.rate = max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, r))
            let synth = AVSpeechSynthesizer(), key = ObjectIdentifier(synth)
            #if os(iOS)
            // writing to buffers needs no audio session; with the app's own, rendering the next piece interrupted the one
            // playing (on an iPad: "play() refused: AbortError" mid-section, and the page fell back to the basic voice)
            synth.usesApplicationAudioSession = false
            #endif
            self.lock.lock(); self.busy[key] = synth; self.lock.unlock()
            var samples: [Int16] = [], sampleRate = 22050.0, finished = false
            let t0 = Date()
            let finish: (Result<(Data, Double), Error>) -> Void = { r in
                guard !finished else { return }
                finished = true
                self.lock.lock(); self.busy[key] = nil; self.lock.unlock()
                done(r)
            }
            // a voice that writes nothing would leave the page waiting: give up after a minute
            DispatchQueue.main.asyncAfter(deadline: .now() + 60) { finish(.failure(Self.err("the device voice made no sound in a minute"))) }
            synth.write(u) { buffer in
                guard let pcm = buffer as? AVAudioPCMBuffer else { return }
                if pcm.frameLength == 0 {   // the end
                    DispatchQueue.main.async { finish(.success((Self.wav(samples, rate: Int(sampleRate)), Date().timeIntervalSince(t0)))) }
                    return
                }
                sampleRate = pcm.format.sampleRate
                let n = Int(pcm.frameLength)
                if let f = pcm.floatChannelData?[0] {
                    for i in 0..<n { let x = max(-1, min(1, f[i])); samples.append(Int16(x < 0 ? x * 32768 : x * 32767)) }
                } else if let s = pcm.int16ChannelData?[0] {
                    samples.append(contentsOf: UnsafeBufferPointer(start: s, count: n))
                } else if let s = pcm.int32ChannelData?[0] {
                    for i in 0..<n { samples.append(Int16(truncatingIfNeeded: s[i] >> 16)) }
                }
            }
        }
    }

    static func wav(_ s: [Int16], rate: Int) -> Data {
        var d = Data(capacity: 44 + s.count * 2)
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + s.count * 2)); d.append(contentsOf: Array("WAVEfmt ".utf8))
        u32(16); u16(1); u16(1); u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(UInt32(s.count * 2))
        s.withUnsafeBytes { d.append(contentsOf: $0) }
        return d
    }

    private static func err(_ s: String) -> NSError { NSError(domain: "Pearls.AppleVoice", code: 1, userInfo: [NSLocalizedDescriptionKey: s]) }
}
