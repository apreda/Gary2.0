import Foundation

// MARK: - Auth Session Model

struct SupabaseAuthSession: Codable {
    let access_token: String
    let token_type: String
    let expires_in: Int
    let refresh_token: String
}

// MARK: - Auth Errors

enum SupabaseAuthError: Error, LocalizedError {
    case invalidCredentials
    case server(String)
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid email or password."
        case .server(let message):
            return message
        case .unknown:
            return "Something went wrong. Please try again."
        }
    }
}

// MARK: - Auth Service

enum SupabaseAuth {
    
    // MARK: - Configuration
    
    private static var baseAuthURL: URL {
        Secrets.supabaseURL.appendingPathComponent("/auth/v1")
    }
    
    private static var headers: [String: String] {
        [
            "apikey": Secrets.supabaseAnonKey,
            "Content-Type": "application/json"
        ]
    }
    
    private static let sessionKey = "supabase.session"
    
    // MARK: - Session Management
    
    /// Get current stored session
    static func currentSession() -> SupabaseAuthSession? {
        guard let data = UserDefaults.standard.data(forKey: sessionKey) else { return nil }
        return try? JSONDecoder().decode(SupabaseAuthSession.self, from: data)
    }
    
    /// Save session to UserDefaults
    static func save(session: SupabaseAuthSession, remember: Bool) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        UserDefaults.standard.set(data, forKey: sessionKey)
        if remember {
            UserDefaults.standard.synchronize()
        }
    }
    
    /// Clear stored session (logout locally)
    static func clearSession() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }
    
    /// Check if user is signed in
    static var isSignedIn: Bool {
        currentSession() != nil
    }
    
    // MARK: - Authentication
    
    /// Sign in with email and password
    static func signIn(email: String, password: String) async throws -> SupabaseAuthSession {
        let url = baseAuthURL.appendingPathComponent("/token")
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw SupabaseAuthError.unknown
        }
        components.queryItems = [URLQueryItem(name: "grant_type", value: "password")]
        
        guard let requestURL = components.url else {
            throw SupabaseAuthError.unknown
        }
        var request = URLRequest(url: requestURL)
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password
        ])
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseAuthError.unknown
        }
        
        switch http.statusCode {
        case 200:
            return try JSONDecoder().decode(SupabaseAuthSession.self, from: data)
        case 400, 401:
            throw SupabaseAuthError.invalidCredentials
        default:
            let message = String(data: data, encoding: .utf8) ?? ""
            throw SupabaseAuthError.server(message)
        }
    }
    
    /// Sign up with email and password
    static func signUp(email: String, password: String) async throws {
        let url = baseAuthURL.appendingPathComponent("/signup")
        
        var request = URLRequest(url: url)
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password
        ])
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseAuthError.unknown
        }
    }
    
    /// Request password reset email
    static func requestPasswordReset(email: String) async throws {
        let url = baseAuthURL.appendingPathComponent("/recover")
        
        var request = URLRequest(url: url)
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.httpMethod = "POST"
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email])
        
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseAuthError.unknown
        }
    }
    
    /// Sign out (clears local session and notifies server)
    static func signOut() async {
        guard let session = currentSession() else { return }
        
        let url = baseAuthURL.appendingPathComponent("/logout")
        var request = URLRequest(url: url)
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.setValue("Bearer \(session.access_token)", forHTTPHeaderField: "Authorization")
        request.httpMethod = "POST"
        
        _ = try? await URLSession.shared.data(for: request)
        clearSession()
    }
}
