import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK — Tail/Fade + personal ledger (Jul 26 2026).
//
// One system, three entry points: a TAIL, a FADE, and a manually logged
// outside bet are the same `user_bets` row with a different kind. Tail/fade
// go through server RPCs that resolve odds + lock time and refuse post-lock
// writes — the record is unfakeable, which is the whole point. Two ledgers,
// never mixed: WITH GARY (system-graded tails/fades — the flagship number)
// and YOUR PLAYS (self-logged, self-graded, labeled).
// ─────────────────────────────────────────────────────────────────────────────

extension AppFlags {
    /// Master switch for the whole Your Book surface (tail/fade row, Billfold
    /// section, quick-log). One-line kill, same pattern as the 2.19 flags.
    static let userBookEnabled = true
}

struct UserBet: Codable, Identifiable {
    let id: String
    let kind: String            // tail | fade | manual
    let pick_type: String?      // game | prop
    let game_date: String
    let league: String?
    let pick_text: String
    let matchup: String?
    let player_name: String?
    let prop_type: String?
    let description: String?
    let odds_american: Int?
    let odds_estimated: Bool?
    let stake_units: Double
    let status: String          // pending | won | lost | push | void
    let units_net: Double?
    let lock_at: String?
    let placed_at: String?
    let graded_by: String?

    var isVerified: Bool { kind == "tail" || kind == "fade" }
    var isPending: Bool { status == "pending" }
}

enum UserBookError: LocalizedError {
    case notSignedIn
    case server(String)
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Sign in to keep a book."
        case .server(let m): return m
        }
    }
}

enum UserBookAPI {
    private static var rest: URL { Secrets.supabaseURL.appendingPathComponent("/rest/v1") }

    @MainActor private static func authedRequest(_ url: URL, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard let token = AuthManager.shared.bearerToken else { throw UserBookError.notSignedIn }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        return req
    }

    private static func run(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            // PostgREST error bodies carry {"message": "..."} — surface the
            // real reason ("game is locked") instead of a generic failure.
            let msg = (try? JSONDecoder().decode(PostgrestError.self, from: data))?.message
                ?? String(data: data, encoding: .utf8) ?? "Request failed"
            throw UserBookError.server(msg)
        }
        return data
    }

    private struct PostgrestError: Decodable { let message: String? }

    @MainActor static func placeBet(gameDate: String, pickId: String?, pickText: String, kind: String, stake: Double) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_bet")
        var payload: [String: Any] = ["p_game_date": gameDate, "p_pick_text": pickText,
                                      "p_kind": kind, "p_stake": stake]
        payload["p_pick_id"] = pickId ?? NSNull()
        let body = try JSONSerialization.data(withJSONObject: payload)
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        return try JSONDecoder().decode(UserBet.self, from: data)
    }

    @MainActor static func placePropBet(gameDate: String, player: String, propType: String, kind: String, stake: Double) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_prop_bet")
        let body = try JSONSerialization.data(withJSONObject: [
            "p_game_date": gameDate, "p_player": player, "p_prop_type": propType,
            "p_kind": kind, "p_stake": stake] as [String: Any])
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        return try JSONDecoder().decode(UserBet.self, from: data)
    }

    @MainActor static func fetchMyBets() async -> [UserBet] {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return [] }
        comps.queryItems = [URLQueryItem(name: "select", value: "*"),
                            URLQueryItem(name: "order", value: "placed_at.desc"),
                            URLQueryItem(name: "limit", value: "400")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return [] }
        guard let data = try? await run(req) else { return [] }
        return (try? JSONDecoder().decode([UserBet].self, from: data)) ?? []
    }

    struct ManualBetDraft {
        var league: String = "MLB"
        var description: String = ""
        var odds: Int? = nil
        var stake: Double = 1.0
    }

    @MainActor static func logManual(_ draft: ManualBetDraft) async throws -> UserBet {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { throw UserBookError.server("bad url") }
        comps.queryItems = [URLQueryItem(name: "select", value: "*")]
        guard let uid = AuthManager.shared.currentUser?.id
            ?? UserDefaults.standard.string(forKey: "gary_user_id"), !uid.isEmpty else {
            throw UserBookError.notSignedIn
        }
        var payload: [String: Any] = [
            "user_id": uid, "kind": "manual",
            "game_date": SupabaseAPI.todayEST(),
            "league": draft.league,
            "pick_text": draft.description,
            "description": draft.description,
            "stake_units": draft.stake,
        ]
        if let o = draft.odds { payload["odds_american"] = o }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var req = try authedRequest(comps.url!, method: "POST", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        let rows = try JSONDecoder().decode([UserBet].self, from: data)
        guard let row = rows.first else { throw UserBookError.server("insert returned nothing") }
        return row
    }

    @MainActor static func gradeManual(id: String, status: String, unitsNet: Double) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let payload: [String: Any] = ["status": status, "units_net": unitsNet,
                                      "graded_at": ISO8601DateFormatter().string(from: Date()),
                                      "graded_by": "user"]
        guard let body = try? JSONSerialization.data(withJSONObject: payload),
              let url = comps.url,
              let req = try? authedRequest(url, method: "PATCH", body: body) else { return false }
        return (try? await run(req)) != nil
    }

    @MainActor static func deleteBet(id: String) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        guard let url = comps.url, let req = try? authedRequest(url, method: "DELETE") else { return false }
        return (try? await run(req)) != nil
    }

    /// Manual settle math mirrors the server's: win pays at the row's odds
    /// (assumed -110 when none was entered), loss is -stake, push is zero.
    static func manualUnits(status: String, stake: Double, odds: Int?) -> Double {
        let price = Double(odds ?? -110)
        switch status {
        case "won": return ((stake * (price > 0 ? price / 100 : 100 / abs(price))) * 100).rounded() / 100
        case "lost": return -stake
        default: return 0
        }
    }
}
