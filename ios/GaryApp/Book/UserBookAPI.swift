import SwiftUI
import Charts
import PhotosUI

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

    @MainActor private static func run(_ req: URLRequest) async throws -> Data {
        let owner = AuthManager.shared.currentUser?.id
        guard owner != nil else { throw UserBookError.notSignedIn }
        try Task.checkCancellation()
        var (data, response) = try await URLSession.shared.data(for: req)
        var statusCode = (response as? HTTPURLResponse)?.statusCode
        guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }

        // 401 → RENEW ONCE, then retry (Aug 21 2026): a book view whose task
        // fires while the launch-time session refresh is still in flight sent
        // the stale token, took a 401, and the page rendered it as "no
        // entries" — telling the user their record had vanished. A refused
        // renewal signs them out honestly; a transient one falls through to
        // the throw below, which the callers now surface as unavailable.
        if statusCode == 401, let fresh = await AuthManager.shared.renewSessionIfPossible() {
            guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }
            var retry = req
            retry.setValue("Bearer \(fresh)", forHTTPHeaderField: "Authorization")
            (data, response) = try await URLSession.shared.data(for: retry)
            statusCode = (response as? HTTPURLResponse)?.statusCode
        }
        guard owner == AuthManager.shared.currentUser?.id else { throw CancellationError() }
        try Task.checkCancellation()

        guard let statusCode, (200...299).contains(statusCode) else {
            // Keep the diagnostic in developer logs, never in user-facing copy.
            // Gateways sometimes return raw JSON such as
            // {"detail":"Bad Request"}; that is not useful product language.
            let diagnostic = (try? JSONDecoder().decode(PostgrestError.self, from: data))?.message
                ?? String(data: data, encoding: .utf8)
                ?? "HTTP \(statusCode.map(String.init) ?? "unknown")"
            print("[YourBook] request failed: \(diagnostic)")
            throw UserBookError.server(friendlyMessage(for: diagnostic))
        }
        return data
    }

    private struct PostgrestError: Decodable {
        let message: String?
        let detail: String?
        let error_description: String?

        private enum CodingKeys: String, CodingKey { case message, detail, error_description }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            message = try c.decodeIfPresent(String.self, forKey: .message)
                ?? c.decodeIfPresent(String.self, forKey: .detail)
                ?? c.decodeIfPresent(String.self, forKey: .error_description)
            detail = try c.decodeIfPresent(String.self, forKey: .detail)
            error_description = try c.decodeIfPresent(String.self, forKey: .error_description)
        }
    }

    private static func friendlyMessage(for diagnostic: String) -> String {
        let lower = diagnostic.lowercased()
        if lower.contains("locked") || lower.contains("already started") {
            return "This game has already started, so that choice is locked."
        }
        if lower.contains("pick not found") || lower.contains("no rows") {
            return "That pick is no longer available. Refresh and try again."
        }
        if lower.contains("lock time") {
            return "This pick isn't open for tracking yet. Try again shortly."
        }
        if lower.contains("not signed in") || lower.contains("jwt") || lower.contains("unauthorized") {
            return "Sign in to save this to your book."
        }
        if lower.contains("handle") {
            if lower.contains("taken") { return "That handle is already taken." }
            if lower.contains("reserved") { return "That handle is reserved. Try another." }
            return "Use 3–18 letters, numbers, or underscores."
        }
        return "We couldn't save that right now. Please try again."
    }

    @MainActor static func placeBet(gameDate: String, pickId: String?, pickText: String, kind: String, stake: Double, streak: Bool = false) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_bet")
        var payload: [String: Any] = ["p_game_date": gameDate, "p_pick_text": pickText,
                                      "p_kind": kind, "p_stake": stake, "p_streak": streak]
        payload["p_pick_id"] = pickId ?? NSNull()
        let body = try JSONSerialization.data(withJSONObject: payload)
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        let saved = try JSONDecoder().decode(UserBet.self, from: data)
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return saved
    }

    @MainActor static func placePropBet(gameDate: String, player: String, propType: String, kind: String, stake: Double, streak: Bool = false, gameID: String? = nil, line: Double? = nil, side: String? = nil) async throws -> UserBet {
        guard let gameID, let line, let side, ["over", "under"].contains(side.lowercased()) else {
            throw UserBookError.server("This prop is missing its exact game or line. Refresh the board and try again.")
        }
        let url = rest.appendingPathComponent("rpc/place_user_prop_bet_v2")
        let body = try JSONSerialization.data(withJSONObject: [
            "p_game_date": gameDate, "p_player": player, "p_prop_type": propType,
            "p_kind": kind, "p_stake": stake, "p_streak": streak,
            "p_game_id": gameID, "p_line": line, "p_side": side.lowercased()] as [String: Any])
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        let saved = try JSONDecoder().decode(UserBet.self, from: data)
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return saved
    }

    /// The signed-in user's bets, or NIL when the book could not be read
    /// (Aug 21 2026). An unreadable book is never the same thing as an empty
    /// one: the old `[]`-on-any-error contract let an expired session render
    /// as "No entries yet" over a real record. Callers that only decorate
    /// (`?? []`) stay lenient; the pages that SHOW the record surface the
    /// honest unavailable state instead.
    @MainActor static func fetchMyBets() async -> [UserBet]? {
        let owner = AuthManager.shared.currentUser?.id
        guard owner != nil else { return nil }
        var rows: [UserBet] = []
        var offset = 0
        do {
            while true {
                try Task.checkCancellation()
                guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return nil }
                comps.queryItems = [URLQueryItem(name: "select", value: "*"),
                    URLQueryItem(name: "order", value: "placed_at.desc,id.desc"),
                    URLQueryItem(name: "limit", value: "500"),
                    URLQueryItem(name: "offset", value: String(offset))]
                guard let url = comps.url else { return nil }
                let data = try await run(try authedRequest(url))
                let page = try JSONDecoder().decode([UserBet].self, from: data)
                guard owner == AuthManager.shared.currentUser?.id else { return nil }
                rows.append(contentsOf: page)
                if page.count < 500 { break }
                offset += page.count
            }
            var seen = Set<String>()
            return rows.filter { seen.insert($0.id).inserted }
        } catch { return nil }
    }

    struct UserStreak: Codable {
        let current: Int
        let best: Int
        let last_counted_date: String?
        let last_result: String?
    }

    /// The signed-in user's streak row (owner-only RLS). Nil until the first
    /// streak play settles.
    @MainActor static func fetchMyStreak() async -> UserStreak? {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_streaks"), resolvingAgainstBaseURL: false) else { return nil }
        comps.queryItems = [URLQueryItem(name: "select", value: "current,best,last_counted_date,last_result")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return nil }
        guard let data = try? await run(req) else { return nil }
        return (try? JSONDecoder().decode([UserStreak].self, from: data))?.first
    }

    // (The v1 units leaderboard — BoardRow / fetchLeaderboard /
    // fetchGaryLeaderboardRow — came out Aug 20: ONE board now, the classic
    // streak-first ClassicLeaderboardView on the Billfold's BOARD scope.)

    /// The signed-in user's claimed handle, if any (owner-only select).
    @MainActor static func fetchMyHandle() async -> String? {
        guard var comps = URLComponents(url: rest.appendingPathComponent("public_profiles"), resolvingAgainstBaseURL: false) else { return nil }
        comps.queryItems = [URLQueryItem(name: "select", value: "display_name")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return nil }
        guard let data = try? await run(req) else { return nil }
        struct Row: Decodable { let display_name: String }
        return (try? JSONDecoder().decode([Row].self, from: data))?.first?.display_name
    }

    struct ManualBetDraft {
        var league: String = "MLB"
        var description: String = ""
        var odds: Int? = nil
        var stake: Double = 1.0
        /// The founder's "star the bet that counts" designation (Aug 20):
        /// marks this as the play of the day. Display-only on manual rows —
        /// the server-written streak still counts verified plays only.
        var streakPick: Bool = false
        var gameDate: String = SupabaseAPI.todayEST()
        var notes: String = ""
        var bookmaker: String = ""
        var favorite: Bool = false
        var market: String? = nil
        var tags: [String] = []
    }

    @MainActor static func logManual(_ draft: ManualBetDraft) async throws -> UserBet {
        guard let odds = draft.odds, (odds <= -100 && odds >= -100000) || (odds >= 100 && odds <= 100000) else {
            throw UserBookError.server("Enter American odds such as -110 or +150.")
        }
        guard draft.stake.isFinite, draft.stake >= 0.01, draft.stake <= 10 else {
            throw UserBookError.server("Enter a stake between \(BookMoney.stake(0.01)) and \(BookMoney.stake(10)).")
        }
        guard !draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              draft.description.count <= 300 else {
            throw UserBookError.server("Describe your bet in 1–300 characters.")
        }
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { throw UserBookError.server("We couldn't open the bet form. Please try again.") }
        comps.queryItems = [URLQueryItem(name: "select", value: "*")]
        guard let uid = AuthManager.shared.currentUser?.id
            ?? UserDefaults.standard.string(forKey: "gary_user_id"), !uid.isEmpty else {
            throw UserBookError.notSignedIn
        }
        var payload: [String: Any] = [
            "user_id": uid, "kind": "manual",
            "game_date": draft.gameDate,
            "league": draft.league,
            "pick_text": draft.description,
            "description": draft.description,
            "stake_units": draft.stake,
            "streak_pick": false, "is_favorite": draft.favorite,
            "notes": draft.notes, "bookmaker": draft.bookmaker,
            "tags": draft.tags,
        ]
        if let o = draft.odds { payload["odds_american"] = o }
        if let m = draft.market, !m.isEmpty { payload["market"] = m }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var req = try authedRequest(comps.url!, method: "POST", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        let rows = try JSONDecoder().decode([UserBet].self, from: data)
        guard let row = rows.first else { throw UserBookError.server("We couldn't save that bet. Please try again.") }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
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
              var req = try? authedRequest(url, method: "PATCH", body: body) else { return false }
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        guard let data = try? await run(req), let rows = try? JSONDecoder().decode([UserBet].self, from: data), !rows.isEmpty else { return false }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return true
    }

    @MainActor static func deleteBet(id: String) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        guard let url = comps.url, var req = try? authedRequest(url, method: "DELETE") else { return false }
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        guard let data = try? await run(req), let rows = try? JSONDecoder().decode([UserBet].self, from: data), !rows.isEmpty else { return false }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return true
    }

    /// The database switches the day's designation atomically, before lock.
    @MainActor static func setStreakPick(id: String, gameDate: String, star: Bool) async -> Bool {
        do {
            let body = try JSONSerialization.data(withJSONObject: ["p_bet_id": id, "p_star": star])
            _ = try await run(try authedRequest(rest.appendingPathComponent("rpc/set_streak_pick"), method: "POST", body: body))
            NotificationCenter.default.post(name: .userBookChanged, object: nil)
            return true
        } catch { return false }
    }

    @MainActor static func updateDetails(id: String, favorite: Bool, notes: String, bookmaker: String, tags: [String]) async throws -> UserBet {
        var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let body = try JSONSerialization.data(withJSONObject: ["is_favorite": favorite, "notes": notes, "bookmaker": bookmaker, "tags": tags] as [String: Any])
        var req = try authedRequest(comps.url!, method: "PATCH", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        guard let row = try JSONDecoder().decode([UserBet].self, from: data).first else {
            throw UserBookError.server("That bet couldn't be updated. Refresh your book and try again.")
        }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return row
    }

    @MainActor static func editManual(id: String, description: String, odds: Int, stake: Double, gameDate: String, market: String? = nil) async throws -> UserBet {
        guard odds <= -100 && odds >= -100000 || odds >= 100 && odds <= 100000,
              stake.isFinite, stake >= 0.01, stake <= 10,
              !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              description.count <= 300 else {
            throw UserBookError.server("Enter a bet description, American odds (for example -110), and a stake between \(BookMoney.stake(0.01)) and \(BookMoney.stake(10)).")
        }
        var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)"), URLQueryItem(name: "kind", value: "eq.manual")]
        var patch: [String: Any] = ["pick_text": description, "description": description, "odds_american": odds, "stake_units": stake, "game_date": gameDate]
        patch["market"] = (market?.isEmpty == false) ? market! : NSNull()
        let body = try JSONSerialization.data(withJSONObject: patch)
        var req = try authedRequest(comps.url!, method: "PATCH", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        guard let row = try JSONDecoder().decode([UserBet].self, from: data).first else {
            throw UserBookError.server("That bet couldn't be updated. Refresh and try again.")
        }
        NotificationCenter.default.post(name: .userBookChanged, object: nil)
        return row
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

func userBookInstant(_ value: String?) -> Date? {
    value.flatMap(parseISO8601)
}

