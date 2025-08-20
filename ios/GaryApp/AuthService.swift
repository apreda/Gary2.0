import Foundation

struct SupabaseAuthSession: Codable {
    let access_token: String
    let token_type: String
    let expires_in: Int
    let refresh_token: String
}

enum SupabaseAuthError: Error, LocalizedError {
    case invalidCredentials
    case server(String)
    case unknown
    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Invalid email or password."
        case .server(let m): return m
        case .unknown: return "Something went wrong. Please try again."
        }
    }
}

enum SupabaseAuth {
    private static var baseAuthURL: URL { Secrets.supabaseURL.appendingPathComponent("/auth/v1") }
    private static var headers: [String: String] {
        [
            "apikey": Secrets.supabaseAnonKey,
            "Content-Type": "application/json"
        ]
    }

    private static let sessionKey = "supabase.session"

    static func currentSession() -> SupabaseAuthSession? {
        guard let data = UserDefaults.standard.data(forKey: sessionKey) else { return nil }
        return try? JSONDecoder().decode(SupabaseAuthSession.self, from: data)
    }

    static func save(session: SupabaseAuthSession, remember: Bool) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: sessionKey)
            if remember { UserDefaults.standard.synchronize() }
        }
    }

    static func clearSession() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }

    static func signIn(email: String, password: String) async throws -> SupabaseAuthSession {
        let url = baseAuthURL.appendingPathComponent("/token")
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [.init(name: "grant_type", value: "password")]
        var req = URLRequest(url: comps.url!)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let body: [String: String] = ["email": email, "password": password]
        req.httpMethod = "POST"
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw SupabaseAuthError.unknown }
        if http.statusCode == 200 { return try JSONDecoder().decode(SupabaseAuthSession.self, from: data) }
        if http.statusCode == 400 || http.statusCode == 401 { throw SupabaseAuthError.invalidCredentials }
        let msg = String(data: data, encoding: .utf8) ?? ""
        throw SupabaseAuthError.server(msg)
    }

    static func signUp(email: String, password: String) async throws {
        let url = baseAuthURL.appendingPathComponent("/signup")
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpMethod = "POST"
        let body: [String: String] = ["email": email, "password": password]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseAuthError.unknown
        }
    }

    static func requestPasswordReset(email: String) async throws {
        let url = baseAuthURL.appendingPathComponent("/recover")
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpMethod = "POST"
        let body: [String: String] = ["email": email]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseAuthError.unknown
        }
    }

    static func signOut() async {
        guard let s = currentSession() else { return }
        let url = baseAuthURL.appendingPathComponent("/logout")
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        req.httpMethod = "POST"
        _ = try? await URLSession.shared.data(for: req)
        clearSession()
    }
}

import Foundation

struct SupabaseAuthSession: Codable {
    let access_token: String
    let token_type: String
    let expires_in: Int
    let refresh_token: String
}

enum SupabaseAuthError: Error, LocalizedError {
    case invalidCredentials
    case server(String)
    case unknown
    var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Invalid email or password."
        case .server(let m): return m
        case .unknown: return "Something went wrong. Please try again."
        }
    }
}

enum SupabaseAuth {
    private static var baseAuthURL: URL { Secrets.supabaseURL.appendingPathComponent("/auth/v1") }
    private static var headers: [String: String] {
        [
            "apikey": Secrets.supabaseAnonKey,
            "Content-Type": "application/json"
        ]
    }

    private static let sessionKey = "supabase.session"

    static func currentSession() -> SupabaseAuthSession? {
        guard let data = UserDefaults.standard.data(forKey: sessionKey) else { return nil }
        return try? JSONDecoder().decode(SupabaseAuthSession.self, from: data)
    }

    static func save(session: SupabaseAuthSession, remember: Bool) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: sessionKey)
            if remember { UserDefaults.standard.synchronize() }
        }
    }

    static func clearSession() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }

    static func signIn(email: String, password: String) async throws -> SupabaseAuthSession {
        let url = baseAuthURL.appendingPathComponent("/token")
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [.init(name: "grant_type", value: "password")]
        var req = URLRequest(url: comps.url!)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let body: [String: String] = ["email": email, "password": password]
        req.httpMethod = "POST"
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw SupabaseAuthError.unknown }
        if http.statusCode == 200 { return try JSONDecoder().decode(SupabaseAuthSession.self, from: data) }
        if http.statusCode == 400 || http.statusCode == 401 { throw SupabaseAuthError.invalidCredentials }
        let msg = String(data: data, encoding: .utf8) ?? ""
        throw SupabaseAuthError.server(msg)
    }

    static func signUp(email: String, password: String) async throws {
        let url = baseAuthURL.appendingPathComponent("/signup")
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpMethod = "POST"
        let body: [String: String] = ["email": email, "password": password]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseAuthError.unknown
        }
    }

    static func requestPasswordReset(email: String) async throws {
        let url = baseAuthURL.appendingPathComponent("/recover")
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpMethod = "POST"
        let body: [String: String] = ["email": email]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseAuthError.unknown
        }
    }

    static func signOut() async {
        guard let s = currentSession() else { return }
        let url = baseAuthURL.appendingPathComponent("/logout")
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.setValue("Bearer \(s.access_token)", forHTTPHeaderField: "Authorization")
        req.httpMethod = "POST"
        _ = try? await URLSession.shared.data(for: req)
        clearSession()
    }
}


