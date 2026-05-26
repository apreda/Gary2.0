import Foundation
import AVFoundation
import Speech

/// Bridges Apple Speech (STT) + ElevenLabs (TTS) for the Talk to Gary feature.
/// - STT runs on-device (free, fast, no network).
/// - TTS calls ElevenLabs streaming endpoint and plays returned MP3 audio.
@MainActor
final class GaryVoiceService: NSObject, ObservableObject {

    enum VoiceError: Error, LocalizedError {
        case micPermissionDenied
        case speechPermissionDenied
        case recognizerUnavailable
        case ttsKeyMissing
        case ttsFailed(String)
        case audioSession(String)

        var errorDescription: String? {
            switch self {
            case .micPermissionDenied: return "Microphone access is required to talk to Gary."
            case .speechPermissionDenied: return "Speech recognition permission is required."
            case .recognizerUnavailable: return "Speech recognition isn't available right now."
            case .ttsKeyMissing: return "ElevenLabs key not configured — Gary will reply in text only."
            case .ttsFailed(let msg): return "Voice playback failed: \(msg)"
            case .audioSession(let msg): return "Audio session error: \(msg)"
            }
        }
    }

    // MARK: - Published state

    @Published var isListening: Bool = false
    @Published var isSpeaking: Bool = false
    @Published var transcribedText: String = ""
    @Published var amplitude: Double = 0  // 0...1 for orb reactivity

    // MARK: - STT (Apple Speech)

    private let speechRecognizer: SFSpeechRecognizer? = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    // MARK: - TTS playback

    private var player: AVAudioPlayer?

    // MARK: - Lifecycle

    override init() {
        super.init()
    }

    // MARK: - Permissions

    func requestPermissions() async -> Bool {
        let speechStatus = await withCheckedContinuation { (cont: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { status in
                cont.resume(returning: status)
            }
        }
        guard speechStatus == .authorized else { return false }
        let micGranted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { granted in
                    cont.resume(returning: granted)
                }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    cont.resume(returning: granted)
                }
            }
        }
        return micGranted
    }

    // MARK: - STT

    /// Start streaming microphone audio to Apple's speech recognizer.
    /// Final transcribed text is delivered via `transcribedText`.
    func startListening() throws {
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            throw VoiceError.recognizerUnavailable
        }
        // Stop any prior session
        stopListening()

        let session = AVAudioSession.sharedInstance()
        do {
            // allowBluetoothHFP is iOS 18+ (renamed from .allowBluetooth which is deprecated).
            // On iOS 16/17, .voiceChat mode already enables Bluetooth HFP by default,
            // so we just leave the option off there.
            if #available(iOS 18.0, *) {
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP])
            } else {
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.duckOthers, .defaultToSpeaker])
            }
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            throw VoiceError.audioSession(error.localizedDescription)
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        recognitionRequest?.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)

        recognitionTask = recognizer.recognitionTask(with: recognitionRequest!) { [weak self] result, error in
            guard let self else { return }
            if let result = result {
                Task { @MainActor in
                    self.transcribedText = result.bestTranscription.formattedString
                }
            }
            if error != nil {
                Task { @MainActor in
                    self.stopListening()
                }
            }
        }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
            // Quick RMS amplitude calculation for orb reactivity
            if let channel = buffer.floatChannelData?.pointee {
                let frames = Int(buffer.frameLength)
                var sum: Float = 0
                for i in 0..<frames {
                    let v = channel[i]
                    sum += v * v
                }
                let rms = sqrtf(sum / Float(frames))
                let scaled = min(1.0, Double(rms) * 6.0)
                Task { @MainActor in
                    self?.amplitude = scaled
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
        isListening = true
        transcribedText = ""
    }

    /// Stop the mic and finalize the recognition session. Returns the
    /// final transcribed text.
    @discardableResult
    func stopListening() -> String {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionTask?.finish()
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false
        amplitude = 0
        return transcribedText
    }

    // MARK: - TTS (xAI Grok)

    /// Synthesize and play Gary's reply text via xAI's TTS API. If the key is
    /// missing, this throws ttsKeyMissing (chat UI still shows text — voice goes silent).
    func speak(_ text: String) async throws {
        guard !text.isEmpty else { return }
        let key = Secrets.xaiAPIKey
        guard !key.isEmpty, !key.contains("KEY_HERE") else {
            throw VoiceError.ttsKeyMissing
        }
        let voiceID = Secrets.xaiVoiceID

        // xAI TTS API — batch (single-shot) POST. Returns raw MP3 bytes.
        // https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
        guard let url = URL(string: "https://api.x.ai/v1/tts") else {
            throw VoiceError.ttsFailed("bad URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        // xAI caps a single TTS request at 15K chars — Gary's chat replies are
        // way shorter than that, but defensive trim just in case.
        let safeText = text.count > 14_500 ? String(text.prefix(14_500)) : text
        let payload: [String: Any] = [
            "text": safeText,
            "voice_id": voiceID,
            "language": "en",
            "output_format": [
                "codec": "mp3",
                "sample_rate": 24000,
                "bit_rate": 128000,
            ],
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        req.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let bodyText = String(data: data, encoding: .utf8) ?? "(no body)"
            throw VoiceError.ttsFailed("HTTP \(http.statusCode): \(bodyText.prefix(200))")
        }

        // Configure session for playback
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true)

        let player = try AVAudioPlayer(data: data)
        player.delegate = self
        self.player = player
        isSpeaking = true
        player.play()

        // Drive amplitude from average power for orb reactivity
        startSpeakingAmplitudePolling()
    }

    func stopSpeaking() {
        player?.stop()
        player = nil
        isSpeaking = false
        amplitude = 0
    }

    private var amplitudeTimer: Timer?
    private func startSpeakingAmplitudePolling() {
        amplitudeTimer?.invalidate()
        amplitudeTimer = Timer.scheduledTimer(withTimeInterval: 0.06, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.player, player.isPlaying else {
                    self?.amplitude = 0
                    self?.amplitudeTimer?.invalidate()
                    return
                }
                player.updateMeters()
                let pwr = player.averagePower(forChannel: 0)
                // Normalize -60..0 dB to 0..1
                let norm = max(0, min(1, (Double(pwr) + 60) / 60))
                self.amplitude = norm
            }
        }
    }
}

extension GaryVoiceService: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isSpeaking = false
            self.amplitude = 0
            self.amplitudeTimer?.invalidate()
        }
    }
}
