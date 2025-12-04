import Foundation

// MARK: - App Secrets & Configuration

enum Secrets {
    /// Supabase project URL
    static let supabaseURL = URL(string: "https://***REMOVED***.supabase.co")!
    
    /// Supabase anonymous key (public, safe for client)
    static let supabaseAnonKey = "***REMOVED***"
    
    /// Website base URL for web endpoints
    static let siteBase = URL(string: "https://www.betwithgary.ai")!
}
