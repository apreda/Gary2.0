import AVFoundation
import Speech
import SwiftUI

/// TALKING GARY (founder, Oct 30 2026: "give the Gary on the home page of the App a real voice people can ask
/// questions to ... he can literally answer any question someone has"). You ask out loud (the phone's own
/// speech recognizer, on the device when it can) or tap a question; the `gary-voice` function answers from
/// his picks, write-ups and results, and his voice streams back while the words light up as he says them.
@MainActor final class GaryTalk: ObservableObject {
    enum Phase: Equatable { case idle, listening, thinking, speaking }

    struct Turn: Identifiable, Equatable {
        enum Role: String { case user, assistant }
        let id = UUID()
        let role: Role
        var text: String
        /// Gary's words he has said so far (the rest wait, dimmed).
        var said = 0
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var turns: [Turn] = []
    /// Your words as you say them.
    @Published private(set) var heard = ""
    /// His voice while he talks, yours while he listens: 0...1.
    @Published private(set) var level: Float = 0
    @Published private(set) var suggestions: [String] = []
    /// Off for the night, or the mic or speech recognition refused.
    @Published private(set) var enabled = true
    @Published private(set) var micRefused = false

    private var names: [String] = []
    private let voice = GaryVoicePlayer()
    private var listener: GaryListener?
    private var asking: Task<Void, Never>?
    private var ticker: Timer?
    private var silence: Task<Void, Never>?
    private var wordStarts: [Double] = []
    private var streamEnded = false
    /// The last question was spoken: when he's done, he listens again.
    private var talking = false

    // MARK: - The room

    func open() {
        GaryAudio.activate()
        Task { await prime() }
    }

    func close() {
        asking?.cancel(); asking = nil
        stopListening(send: false)
        voice.stop()
        stopTicker()
        phase = .idle
        level = 0
        GaryAudio.deactivate()
    }

    private func prime() async {
        guard let data = try? await Self.post(["prime": true, "date": SupabaseAPI.todayEST()], timeout: 10),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        enabled = (o["enabled"] as? Bool) ?? true
        names = (o["names"] as? [String]) ?? []
        offer((o["questions"] as? [String]) ?? [])
    }

    private var first: String?

    /// The questions to offer before he's asked anything: Home's question first, then his slate's, then the
    /// night before.
    func seed(_ first: String?) {
        self.first = first
        offer([])
    }

    private func offer(_ fromSlate: [String]) {
        var list: [String] = []
        for q in [first].compactMap({ $0 }) + fromSlate + [Self.lastNight] where !list.contains(q) {
            // One "why" at a time: Home's own question already asks about a pick.
            if q.hasPrefix("Why the"), list.contains(where: { $0.hasPrefix("Why the") }) { continue }
            list.append(q)
        }
        suggestions = Array(list.prefix(3))
    }

    static let lastNight = "How'd last night go?"

    // MARK: - Asking

    func ask(_ question: String, spoken: Bool = false) {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        asking?.cancel()
        stopListening(send: false)
        voice.stop()
        talking = spoken
        let history = turns.filter { !$0.text.isEmpty }.suffix(8).map { ["role": $0.role.rawValue, "text": $0.text] }
        turns.append(Turn(role: .user, text: q))
        turns.append(Turn(role: .assistant, text: ""))
        heard = ""
        phase = .thinking
        wordStarts = []
        streamEnded = false
        let body: [String: Any] = ["question": q, "history": Array(history), "date": SupabaseAPI.todayEST(), "install": Self.install]
        asking = Task { [weak self] in await self?.stream(body) }
    }

    /// Stop him mid-answer.
    func interrupt() {
        asking?.cancel(); asking = nil
        voice.stop()
        stopTicker()
        talking = false
        level = 0
        if let i = turns.indices.last, turns[i].role == .assistant {
            if turns[i].text.isEmpty { turns.removeLast() } else { turns[i].said = Self.words(turns[i].text) }
        }
        phase = .idle
    }

    private func stream(_ body: [String: Any]) async {
        do {
            var request = try await Self.request(body, timeout: 60)
            request.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            if http.statusCode == 503 { enabled = false; throw URLError(.resourceUnavailable) }
            guard http.statusCode == 200 else { throw URLError(.badServerResponse) }
            for try await line in bytes.lines {
                try Task.checkCancellation()
                guard let data = line.data(using: .utf8),
                      let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let kind = event["t"] as? String else { continue }
                switch kind {
                case "text":
                    if let s = event["s"] as? String, let i = turns.indices.last { turns[i].text += s }
                case "audio":
                    if let b = event["b"] as? String, let pcm = Data(base64Encoded: b) {
                        if phase != .speaking { phase = .speaking; startTicker() }
                        voice.play(pcm16: pcm)
                    }
                case "words":
                    if let starts = event["s"] as? [Double] { wordStarts += starts }
                default: break
                }
            }
            streamEnded = true
            if !voice.hasAudio { finishAnswer() }
        } catch is CancellationError {
        } catch {
            guard !Task.isCancelled else { return }
            if let i = turns.indices.last, turns[i].role == .assistant, turns[i].text.isEmpty {
                turns[i].text = enabled ? "I lost you there. Ask me again." : "I'm off for the night."
            }
            streamEnded = true
            finishAnswer()
        }
    }

    // MARK: - While he talks

    private func startTicker() {
        stopTicker()
        let t = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        ticker = t
    }

    private func stopTicker() { ticker?.invalidate(); ticker = nil }

    private func tick() {
        let at = voice.playedSeconds
        level = level * 0.6 + voice.level(at: at) * 0.4
        if let i = turns.indices.last, turns[i].role == .assistant {
            let said = wordStarts.isEmpty ? Self.words(turns[i].text) : wordStarts.filter { $0 <= at + 0.05 }.count
            if said != turns[i].said { turns[i].said = said }
        }
        if streamEnded && voice.finished { finishAnswer() }
    }

    private func finishAnswer() {
        stopTicker()
        level = 0
        if let i = turns.indices.last, turns[i].role == .assistant { turns[i].said = Self.words(turns[i].text) }
        phase = .idle
        // A spoken conversation keeps going: he listens for the next thing you say.
        if talking && enabled { startListening() }
    }

    // MARK: - Listening

    func micTapped() {
        switch phase {
        case .listening: stopListening(send: true)
        case .speaking, .thinking: interrupt()
        case .idle: startListening()
        }
    }

    func startListening() {
        Task {
            guard await GaryListener.authorize() else { micRefused = true; talking = false; return }
            micRefused = false
            voice.stop()
            let l = GaryListener()
            l.onText = { [weak self] text in self?.heardChanged(text) }
            l.onLevel = { [weak self] v in
                guard let self, self.phase == .listening else { return }
                self.level = self.level * 0.5 + v * 0.5
            }
            do {
                try l.start(context: names + ["Gary", "parlay", "darts", "Winners", "spread", "over", "under"])
                listener = l
                heard = ""
                phase = .listening
                waitForSpeech(first: true)
            } catch {
                talking = false
                phase = .idle
            }
        }
    }

    private func heardChanged(_ text: String) {
        guard phase == .listening else { return }
        heard = text
        waitForSpeech(first: false)
    }

    /// He answers once you stop talking; nothing said for a while and he stops listening.
    private func waitForSpeech(first: Bool) {
        silence?.cancel()
        let wait: Double = first ? 7 : 1.3
        silence = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.stopListening(send: true)
        }
    }

    func stopListening(send: Bool) {
        silence?.cancel(); silence = nil
        guard let l = listener else { return }
        listener = nil
        l.stop()
        level = 0
        let said = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        if phase == .listening { phase = .idle }
        if send, !said.isEmpty { ask(said, spoken: true) } else { talking = false; heard = "" }
    }

    // MARK: - Network

    private static var endpoint: URL {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "garyVoiceURL"), let u = URL(string: s) { return u }
        #endif
        return Secrets.supabaseURL.appendingPathComponent("functions/v1/gary-voice")
    }

    /// Signed out, Gary knows you by this install.
    static var install: String {
        let key = "garyVoiceInstall"
        if let s = UserDefaults.standard.string(forKey: key) { return s }
        let s = UUID().uuidString.lowercased()
        UserDefaults.standard.set(s, forKey: key)
        return s
    }

    private static func request(_ body: [String: Any], timeout: TimeInterval) async throws -> URLRequest {
        await AuthManager.shared.renewIfExpiring()
        var r = URLRequest(url: endpoint)
        r.httpMethod = "POST"
        r.timeoutInterval = timeout
        r.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        r.setValue("Bearer \(AuthManager.shared.bearerToken ?? Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: body)
        return r
    }

    private static func post(_ body: [String: Any], timeout: TimeInterval) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request(body, timeout: timeout))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return data
    }

    static func words(_ s: String) -> Int { s.split(whereSeparator: { $0.isWhitespace }).count }

    /// "Charlotte Hornets +1.5 -120" → "Hornets"; "UCF Knights ML +110" → "Knights"; a total → nil.
    static func teamWord(_ pick: String?) -> String? {
        guard let pick, let cut = pick.range(of: #"\s([+-]\d|ML\b|PK\b)"#, options: .regularExpression) else { return nil }
        let name = pick[..<cut.lowerBound]
        let last = name.split(separator: " ").last.map(String.init)
        guard let last, last.count > 1, !["over", "under"].contains(last.lowercased()), !name.contains("/") else { return nil }
        return last
    }

    /// Home shows ASK GARY only while his voice is on (the function's switch, and its keys in place). The sim
    /// always shows it.
    static func available() async -> Bool {
        #if DEBUG
        return true
        #else
        if let at = availableAt, Date().timeIntervalSince(at) < 600 { return availableCache }
        guard let data = try? await post(["prime": true, "date": SupabaseAPI.todayEST()], timeout: 8),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        availableCache = (o["enabled"] as? Bool) ?? false
        availableAt = Date()
        return availableCache
        #endif
    }
    static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }

    /// "How'd tonight go?" in the evening and overnight, "How'd today go?" after a day slate.
    static func howDidItGo(_ now: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let h = cal.component(.hour, from: now)
        return h >= 17 || h < 5 ? "How'd tonight go?" : "How'd today go?"
    }

    private static var availableCache = false
    private static var availableAt: Date?
}

// MARK: - The audio session

enum GaryAudio {
    static func activate() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP, .duckOthers])
        try? s.setActive(true)
    }

    static func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - His voice

/// Plays the 16-bit, 24 kHz mono PCM the function streams, as it arrives.
final class GaryVoicePlayer {
    private let engine = AVAudioEngine()
    private let node = AVAudioPlayerNode()
    private let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24_000, channels: 1, interleaved: false)!
    private let lock = NSLock()
    private var pending = 0
    private var scheduled = 0.0
    private var levels: [(start: Double, rms: Float)] = []
    private var playing = false

    init() {
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
    }

    var hasAudio: Bool { scheduled > 0 }
    var finished: Bool { lock.lock(); defer { lock.unlock() }; return playing && pending == 0 }

    /// Seconds of his voice played so far.
    var playedSeconds: Double {
        guard playing, let now = node.lastRenderTime, now.isSampleTimeValid,
              let t = node.playerTime(forNodeTime: now) else { return 0 }
        return min(Double(t.sampleTime) / t.sampleRate, scheduled)
    }

    func play(pcm16 data: Data) {
        let frames = data.count / 2
        guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let out = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(frames)
        var sum: Float = 0
        data.withUnsafeBytes { raw in
            let src = raw.bindMemory(to: Int16.self)
            for i in 0..<frames {
                let v = Float(Int16(littleEndian: src[i])) / 32768
                out[i] = v
                sum += v * v
            }
        }
        levels.append((scheduled, min(1, sqrt(sum / Float(frames)) * 5)))
        scheduled += Double(frames) / 24_000
        if !engine.isRunning { try? engine.start() }
        lock.lock(); pending += 1; lock.unlock()
        node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self else { return }
            self.lock.lock(); self.pending -= 1; self.lock.unlock()
        }
        if !playing { node.play(); playing = true }
    }

    func level(at t: Double) -> Float {
        guard playing else { return 0 }
        var lo = 0, hi = levels.count - 1, hit: Float = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if levels[mid].start <= t { hit = levels[mid].rms; lo = mid + 1 } else { hi = mid - 1 }
        }
        return t >= scheduled ? 0 : hit
    }

    func stop() {
        node.stop()
        lock.lock(); pending = 0; lock.unlock()
        scheduled = 0
        levels = []
        playing = false
    }
}

// MARK: - Your voice

/// The phone's speech recognizer on the mic, on the device when it can be.
final class GaryListener {
    var onText: (String) -> Void = { _ in }
    var onLevel: (Float) -> Void = { _ in }
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    static func authorize() async -> Bool {
        let speech: Bool = await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await withCheckedContinuation { c in
            AVAudioSession.sharedInstance().requestRecordPermission { c.resume(returning: $0) }
        }
    }

    func start(context: [String]) throws {
        guard let recognizer, recognizer.isAvailable else { throw URLError(.cannotConnectToHost) }
        GaryAudio.activate()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else { throw URLError(.resourceUnavailable) }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.contextualStrings = Array(context.prefix(100))
        request.taskHint = .search
        if #available(iOS 16, *) { request.addsPunctuation = true }
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        self.request = request
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            request.append(buffer)
            guard let data = buffer.floatChannelData?[0] else { return }
            let n = Int(buffer.frameLength)
            var sum: Float = 0
            for i in 0..<n { sum += data[i] * data[i] }
            let level = min(1, sqrt(sum / Float(max(n, 1))) * 8)
            DispatchQueue.main.async { self?.onLevel(level) }
        }
        engine.prepare()
        try engine.start()
        task = recognizer.recognitionTask(with: request) { [weak self] result, _ in
            guard let text = result?.bestTranscription.formattedString else { return }
            DispatchQueue.main.async { self?.onText(text) }
        }
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }
}
