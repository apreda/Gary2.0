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
}
