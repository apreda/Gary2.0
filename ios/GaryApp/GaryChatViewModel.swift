import Foundation
import SwiftUI

/// State and logic for the Talk to Gary feature.
/// Owns conversation history, drives orb state, talks to the Edge Function
/// and the voice service.
@MainActor
final class GaryChatViewModel: ObservableObject {

    struct ChatMessage: Identifiable, Equatable {
        let id = UUID()
        let isUser: Bool
        let text: String
    }

    // MARK: - Published state

    @Published var messages: [ChatMessage] = []
    @Published var isListening: Bool = false
    @Published var isWaitingForReply: Bool = false
    @Published var orbState: GaryOrbState = .idle
    @Published var amplitude: Double = 0
    @Published var showAlert: Bool = false
    @Published var alertMessage: String? = nil

    // MARK: - Internals

    private let voice = GaryVoiceService()
    private var amplitudeObserver: Task<Void, Never>? = nil
    private var listeningObserver: Task<Void, Never>? = nil
    private var speakingObserver: Task<Void, Never>? = nil

    init() {
        // Observe voice service state to mirror into our published values
        amplitudeObserver = Task { [weak self] in
            guard let self else { return }
            for await _ in NotificationCenter.default.notifications(named: .init("__never__")) { _ = self }
        }
        // Simple polling pattern instead of Combine to keep this file self-contained
        Task { @MainActor [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                self.amplitude = self.voice.amplitude
                self.isListening = self.voice.isListening
                // Update orb state from voice activity
                if self.voice.isListening {
                    self.orbState = .listening
                } else if self.voice.isSpeaking {
                    self.orbState = .speaking
                } else if self.isWaitingForReply {
                    self.orbState = .thinking
                } else {
                    self.orbState = .idle
                }
                try? await Task.sleep(nanoseconds: 60_000_000) // ~16fps polling
            }
        }
    }

    // MARK: - Permissions

    func requestPermissions() async {
        let ok = await voice.requestPermissions()
        if !ok {
            alertMessage = "Mic + Speech permissions are required to talk to Gary. You can still type."
            showAlert = true
        }
    }

    // MARK: - Mic control

    func toggleMic() {
        if voice.isListening {
            let finalText = voice.stopListening()
            let trimmed = finalText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                Task { await sendUserMessage(trimmed) }
            }
        } else {
            do {
                try voice.startListening()
            } catch {
                alertMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                showAlert = true
            }
        }
    }

    // MARK: - Send to backend

    func sendUserMessage(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Append user message
        messages.append(ChatMessage(isUser: true, text: trimmed))
        isWaitingForReply = true

        // Build history (excluding the message we just appended)
        let history = messages.dropLast().map {
            GaryChatAPI.Turn(role: $0.isUser ? "user" : "model", text: $0.text)
        }

        do {
            let reply = try await GaryChatAPI.send(message: trimmed, history: Array(history))
            messages.append(ChatMessage(isUser: false, text: reply))
            isWaitingForReply = false
            // Fire TTS in background — chat UI is already updated
            Task {
                do {
                    try await voice.speak(reply)
                } catch GaryVoiceService.VoiceError.ttsKeyMissing {
                    // silent — chat works text-only
                } catch {
                    // surface other TTS errors quietly
                    print("[GaryChat] TTS error: \(error.localizedDescription)")
                }
            }
        } catch {
            isWaitingForReply = false
            let msg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            messages.append(ChatMessage(isUser: false, text: "Eh, my line's down. (\(msg))"))
        }
    }

    func clear() {
        messages.removeAll()
        voice.stopSpeaking()
    }

    /// Stop Gary mid-speech (user tapped orb while Gary was talking).
    func interruptSpeaking() {
        voice.stopSpeaking()
    }
}
