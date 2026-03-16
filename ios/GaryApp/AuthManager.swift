import Foundation
import SwiftUI
import AuthenticationServices

// MARK: - Auth Manager

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    // MARK: - Published State

    @Published var isAuthenticated = false
    @Published var isLoading = true
    @Published var currentUser: GaryUser?
    @Published var errorMessage: String?

    // MARK: - Token Storage (Keychain-backed via UserDefaults for now)

    @AppStorage("gary_access_token") private var accessToken: String = ""
    @AppStorage("gary_refresh_token") private var refreshToken: String = ""
    @AppStorage("gary_user_id") private var userId: String = ""
    @AppStorage("gary_user_email") private var userEmail: String = ""

    private var baseURL: String { Secrets.supabaseURL.absoluteString }
    private var apiKey: String { Secrets.supabaseAnonKey }

    private func authURL(_ path: String) throws -> URL {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw URLError(.badURL)
        }
        return url
    }

    // MARK: - Init

    private init() {
        Task {
            await checkExistingSession()
        }
    }

    // MARK: - Session Check

    func checkExistingSession() async {
        guard !accessToken.isEmpty else {
            isLoading = false
            return
        }

        // Try to get current user with stored token
        do {
            let user = try await fetchCurrentUser()
            currentUser = user
            isAuthenticated = true
        } catch {
            // Token expired — try refresh
            if !refreshToken.isEmpty {
                do {
                    try await refreshSession()
                    let user = try await fetchCurrentUser()
                    currentUser = user
                    isAuthenticated = true
                } catch {
                    // Refresh failed — clear everything
                    clearSession()
                }
            } else {
                clearSession()
            }
        }

        isLoading = false
    }

    // MARK: - Email/Password Sign Up

    func signUp(email: String, password: String) async throws {
        errorMessage = nil

        let url = try authURL("/auth/v1/signup")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")

        let body: [String: Any] = [
            "email": email,
            "password": password
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw AuthError.networkError
        }

        if http.statusCode == 200 || http.statusCode == 201 {
            let session = try JSONDecoder().decode(AuthResponse.self, from: data)
            handleAuthResponse(session)
        } else {
            let errorBody = try? JSONDecoder().decode(AuthErrorResponse.self, from: data)
            let message = errorBody?.msg ?? errorBody?.error_description ?? "Sign up failed"
            errorMessage = message
            throw AuthError.serverError(message)
        }
    }

    // MARK: - Email/Password Sign In

    func signIn(email: String, password: String) async throws {
        errorMessage = nil

        let url = try authURL("/auth/v1/token?grant_type=password")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")

        let body: [String: Any] = [
            "email": email,
            "password": password
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw AuthError.networkError
        }

        if http.statusCode == 200 {
            let session = try JSONDecoder().decode(AuthResponse.self, from: data)
            handleAuthResponse(session)
        } else {
            let errorBody = try? JSONDecoder().decode(AuthErrorResponse.self, from: data)
            let message = errorBody?.error_description ?? "Invalid email or password"
            errorMessage = message
            throw AuthError.serverError(message)
        }
    }

    // MARK: - Sign In with Apple

    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
        errorMessage = nil

        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw AuthError.serverError("Missing Apple identity token")
        }

        let url = try authURL("/auth/v1/token?grant_type=id_token")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")

        var body: [String: Any] = [
            "provider": "apple",
            "id_token": tokenString
        ]

        // Include name if provided (first sign-in only)
        if let fullName = credential.fullName {
            let name = [fullName.givenName, fullName.familyName]
                .compactMap { $0 }
                .joined(separator: " ")
            if !name.isEmpty {
                body["options"] = ["data": ["full_name": name]]
            }
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw AuthError.networkError
        }

        if http.statusCode == 200 {
            let session = try JSONDecoder().decode(AuthResponse.self, from: data)
            handleAuthResponse(session)
        } else {
            let errorBody = try? JSONDecoder().decode(AuthErrorResponse.self, from: data)
            let message = errorBody?.error_description ?? "Apple sign-in failed"
            errorMessage = message
            throw AuthError.serverError(message)
        }
    }

    // MARK: - OAuth (Google, Facebook) — Opens web flow

    /// Returns the OAuth URL to open in a web view / ASWebAuthenticationSession
    func oauthURL(provider: OAuthProvider) -> URL? {
        let redirectScheme = "com.gary.app"
        let redirectURL = "\(redirectScheme)://auth-callback"
        guard var components = URLComponents(string: "\(baseURL)/auth/v1/authorize") else { return nil }
        components.queryItems = [
            URLQueryItem(name: "provider", value: provider.rawValue),
            URLQueryItem(name: "redirect_to", value: redirectURL)
        ]
        return components.url
    }

    /// Handle the OAuth callback URL containing tokens
    func handleOAuthCallback(url: URL) async throws {
        errorMessage = nil

        // Parse fragment (Supabase returns tokens in URL fragment)
        guard let fragment = url.fragment else {
            throw AuthError.serverError("No auth data in callback")
        }

        let params = fragment.components(separatedBy: "&").reduce(into: [String: String]()) { result, pair in
            let parts = pair.components(separatedBy: "=")
            if parts.count == 2 {
                result[parts[0]] = parts[1].removingPercentEncoding ?? parts[1]
            }
        }

        guard let token = params["access_token"],
              let refresh = params["refresh_token"] else {
            throw AuthError.serverError("Missing tokens in callback")
        }

        accessToken = token
        refreshToken = refresh

        let user = try await fetchCurrentUser()
        currentUser = user
        isAuthenticated = true
    }

    // MARK: - Password Reset

    func resetPassword(email: String) async throws {
        errorMessage = nil

        let url = try authURL("/auth/v1/recover")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")

        let body: [String: Any] = ["email": email]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw AuthError.serverError("Failed to send reset email")
        }
    }

    // MARK: - Sign Out

    func signOut() {
        // Fire-and-forget server logout
        Task {
            let url = try authURL("/auth/v1/logout")
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue(apiKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }

        clearSession()
    }

    // MARK: - Helpers

    /// Current access token for authenticated API requests
    var bearerToken: String? {
        accessToken.isEmpty ? nil : accessToken
    }

    private func fetchCurrentUser() async throws -> GaryUser {
        let url = try authURL("/auth/v1/user")
        var request = URLRequest(url: url)
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AuthError.unauthorized
        }

        return try JSONDecoder().decode(GaryUser.self, from: data)
    }

    private func refreshSession() async throws {
        let url = try authURL("/auth/v1/token?grant_type=refresh_token")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")

        let body: [String: Any] = ["refresh_token": refreshToken]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw AuthError.unauthorized
        }

        let session = try JSONDecoder().decode(AuthResponse.self, from: data)
        accessToken = session.access_token
        if let refresh = session.refresh_token {
            refreshToken = refresh
        }
    }

    private func handleAuthResponse(_ response: AuthResponse) {
        accessToken = response.access_token
        if let refresh = response.refresh_token {
            refreshToken = refresh
        }
        if let user = response.user {
            userId = user.id
            userEmail = user.email ?? ""
            currentUser = user
        }
        isAuthenticated = true
    }

    private func clearSession() {
        accessToken = ""
        refreshToken = ""
        userId = ""
        userEmail = ""
        currentUser = nil
        isAuthenticated = false
    }
}

// MARK: - Models

struct GaryUser: Codable, Identifiable {
    let id: String
    let email: String?
    let phone: String?
    let created_at: String?
    let user_metadata: [String: AnyCodable]?

    var displayName: String {
        if let meta = user_metadata,
           let name = meta["full_name"]?.value as? String, !name.isEmpty {
            return name
        }
        return email ?? "Gary User"
    }
}

/// Type-erased Codable wrapper for user_metadata
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) { value = str }
        else if let int = try? container.decode(Int.self) { value = int }
        else if let double = try? container.decode(Double.self) { value = double }
        else if let bool = try? container.decode(Bool.self) { value = bool }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let str = value as? String { try container.encode(str) }
        else if let int = value as? Int { try container.encode(int) }
        else if let double = value as? Double { try container.encode(double) }
        else if let bool = value as? Bool { try container.encode(bool) }
        else { try container.encode("") }
    }
}

struct AuthResponse: Codable {
    let access_token: String
    let refresh_token: String?
    let token_type: String?
    let expires_in: Int?
    let user: GaryUser?
}

struct AuthErrorResponse: Codable {
    let error: String?
    let error_description: String?
    let msg: String?
}

enum AuthError: LocalizedError {
    case networkError
    case unauthorized
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .networkError: return "Network error. Check your connection."
        case .unauthorized: return "Session expired. Please sign in again."
        case .serverError(let msg): return msg
        }
    }
}

enum OAuthProvider: String {
    case google
    case facebook
    case apple
}
