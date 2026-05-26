import Foundation

// MARK: - App Secrets & Configuration

enum Secrets {
    /// Supabase project URL
    // swiftlint:disable:next force_unwrapping
    static let supabaseURL = URL(string: "https://xuttubsfgdcjfgmskcol.supabase.co")!

    /// Supabase anonymous key (public, safe for client — RLS enforced server-side)
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHR1YnNmZ2RjamZnbXNrY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4OTY4MDQsImV4cCI6MjA1OTQ3MjgwNH0.wppXQAUHQXoD0z5wbjy93_0KYMREPufl_BCtb4Ugd40"

    /// Website base URL
    // swiftlint:disable:next force_unwrapping
    static let siteBase = URL(string: "https://www.betwithgary.ai")!

    // MARK: - Talk to Gary (Voice / Chat)

    /// Supabase Edge Function endpoint for the "Talk to Gary" chat orchestrator.
    /// The function handles persona + tools + pick context server-side; iOS just
    /// posts user messages and receives Gary's text reply.
    // swiftlint:disable:next force_unwrapping
    static let garyChatEndpoint = URL(string: "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/gary-chat")!

    /// xAI Grok API key for TTS playback of Gary's voice.
    /// SECURITY NOTE: Embedding the key in the binary is acceptable for
    /// TestFlight testing but not for App Store production. For production,
    /// proxy TTS through the Supabase Edge Function so the key stays server-side.
    static let xaiAPIKey: String = "REDACTED_PRE_HISTORY_REWRITE"

    /// xAI TTS voice ID. Pick one from xAI's voice library:
    ///   - "leo" — authoritative, older energy (closest to Gary's bookie character — DEFAULT)
    ///   - "rex" — confident, clear (younger, business-y)
    ///   - "sal" — smooth, balanced (versatile)
    ///   - "ara" — warm, friendly (too soft for Gary)
    ///   - "eve" — energetic, upbeat (too perky for Gary)
    /// To clone a custom Gary voice later, POST a 60-second sample to
    /// https://api.x.ai/v1/custom-voices and use the returned voice_id.
    static let xaiVoiceID: String = "leo"
}
