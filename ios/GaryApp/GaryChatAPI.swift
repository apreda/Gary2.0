import Foundation

/// Thin client for the gary-chat Supabase Edge Function.
/// iOS posts { userMessage, history } and receives { reply }.
enum GaryChatAPI {

    struct Turn: Codable {
        let role: String   // "user" or "model"
        let text: String
    }

    struct Reply: Decodable {
        let reply: String
        let toolRoundTrips: Int?
        let error: String?
    }

    enum APIError: Error, LocalizedError {
        case badResponse(Int, String)
        case decodeFailed(String)
        case network(String)

        var errorDescription: String? {
            switch self {
            case .badResponse(let code, let body): return "HTTP \(code): \(body.prefix(160))"
            case .decodeFailed(let msg): return "Decode failed: \(msg)"
            case .network(let msg): return "Network: \(msg)"
            }
        }
    }

    /// Send a turn to Gary. The history list should contain prior user/model
    /// turns in order so Gary has session memory.
    static func send(message: String, history: [Turn]) async throws -> String {
        var req = URLRequest(url: Secrets.garyChatEndpoint)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Supabase Edge Functions accept the anon key as Authorization for unauthenticated functions.
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.timeoutInterval = 60

        let payload: [String: Any] = [
            "userMessage": message,
            "history": history.map { ["role": $0.role, "text": $0.text] },
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("not an HTTP response")
        }
        let bodyText = String(data: data, encoding: .utf8) ?? ""
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.badResponse(http.statusCode, bodyText)
        }
        do {
            let decoded = try JSONDecoder().decode(Reply.self, from: data)
            if let err = decoded.error, !err.isEmpty {
                throw APIError.badResponse(http.statusCode, err)
            }
            return decoded.reply
        } catch let apiErr as APIError {
            throw apiErr
        } catch {
            throw APIError.decodeFailed(error.localizedDescription)
        }
    }
}
