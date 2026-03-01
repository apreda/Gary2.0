import Foundation

// MARK: - App Secrets & Configuration

enum Secrets {
    /// Supabase project URL
    static let supabaseURL: URL = {
        guard let url = URL(string: "https://***REMOVED***.supabase.co") else {
            fatalError("Invalid Supabase URL")
        }
        return url
    }()

    /// Supabase anonymous key (public, safe for client)
    static let supabaseAnonKey = "***REMOVED***"

    /// Website base URL for web endpoints
    static let siteBase: URL = {
        guard let url = URL(string: "https://www.betwithgary.ai") else {
            fatalError("Invalid site base URL")
        }
        return url
    }()
}
