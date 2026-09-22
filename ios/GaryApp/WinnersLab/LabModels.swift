import Foundation

// THE WINNERS LAB — models and reads (spec: docs/superpowers/specs/2026-09-21-winners-lab-design.md).
// Everything here reads the server board and the play dossier. Admission and
// units are never decided on the device.

/// Ids arrive as numbers or strings depending on the writer.
struct LabText: Decodable, Equatable {
    let value: String?
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = nil }
        else if let s = try? c.decode(String.self) { value = s }
        else if let i = try? c.decode(Int.self) { value = String(i) }
        else if let d = try? c.decode(Double.self) { value = d == d.rounded() ? String(Int(d)) : String(d) }
        else { value = nil }
    }
}

/// jsonb numerics arrive as numbers or strings depending on the writer.
struct LabNumber: Decodable, Equatable {
    let value: Double?
    init(_ value: Double?) { self.value = value }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = nil }
        else if let d = try? c.decode(Double.self) { value = d }
        else if let i = try? c.decode(Int.self) { value = Double(i) }
        else if let s = try? c.decode(String.self) { value = Double(s.trimmingCharacters(in: .whitespaces)) }
        else { value = nil }
    }
}

/// One admitted ticket on the board, as the board RPC publishes it.
struct LabBoardTicket: Identifiable, Equatable {
    let candidateID: Int
    let kind: String            // game | prop
    let league: String
    let gameID: String?
    let gameDate: String
    let reason: String?
    let stakeUnits: Double?
    let admittedAt: String?
    let game: GaryPick?
    let prop: PropPick?
    var id: Int { candidateID }
    var isProp: Bool { kind == "prop" }
    var pickText: String {
        if let game { return game.pick ?? "" }
        if let prop { return LabFormat.propTicket(prop) }
        return ""
    }
    var price: Int? {
        if let game, let p = game.pick { return LabFormat.trailingPrice(p) }
        if let prop, let o = prop.odds { return Int(o.replacingOccurrences(of: "+", with: "")) }
        return nil
    }
    var commence: String? { game?.commence_time ?? prop?.commence_time }
    var matchup: String {
        if let game { return "\(game.awayTeam ?? "") @ \(game.homeTeam ?? "")" }
        return prop?.matchup ?? ""
    }
    var whyLine: String? { LabFormat.firstSentence(reason) }
    static func == (a: LabBoardTicket, b: LabBoardTicket) -> Bool { a.candidateID == b.candidateID }
}

struct LabBoard {
    var tickets: [LabBoardTicket] = []
    var boards: [SupabaseAPI.WinnersBoardSummary] = []
    var access: WinnersAccessSnapshot? = nil
    /// The day's streak pick: the one play everybody gets, member or not. The
    /// locked counts never include it, so nobody pays to unlock what is free.
    var freeCandidateID: Int? = nil
}

/// The play dossier from `get_winners_play`.
struct WinnersPlay: Decodable {
    struct Candidate: Decodable {
        let id: Int
        let game_date: String
        let league: String
        let kind: String
        let game_id: String?
        let pick_text: String
        let odds: Int?
        let commence_time: String?
        let admitted_at: String?
        let reason: String?
        let stake_units: LabNumber?
    }
    struct Cases: Decodable {
        let home: String?
        let away: String?
        let pick_is_home: Bool?
        let home_team: String?
        let away_team: String?
    }
    struct DeskSection: Decodable, Identifiable {
        let index: Int
        let title: String
        let chars: Int?
        var id: Int { index }
    }
    struct Desk: Decodable {
        let chars: Int?
        let sections: [DeskSection]?
    }
    struct Companion: Decodable, Identifiable {
        let candidate_id: Int
        let kind: String
        let pick_text: String
        let odds: Int?
        let stake_units: LabNumber?
        let reason: String?
        /// Filled after decoding through the board's own stored-pick reader.
        var game: GaryPick? = nil
        var prop: PropPick? = nil
        var id: Int { candidate_id }
        private enum Keys: String, CodingKey { case candidate_id, kind, pick_text, odds, stake_units, reason }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            candidate_id = try c.decode(Int.self, forKey: .candidate_id)
            kind = (try? c.decode(String.self, forKey: .kind)) ?? "game"
            pick_text = (try? c.decode(String.self, forKey: .pick_text)) ?? ""
            odds = try? c.decode(Int.self, forKey: .odds)
            stake_units = try? c.decode(LabNumber.self, forKey: .stake_units)
            reason = try? c.decode(String.self, forKey: .reason)
        }
    }
    struct Outcome: Decodable {
        let result: String?
        let final_score: String?
        let home_score: Int?
        let away_score: Int?
        let actual_value: LabNumber?
    }
    struct TapeLine: Decodable {
        let won: Int?
        let lost: Int?
        let push: Int?
        let units: LabNumber?
        var line: String { "\(won ?? 0)-\(lost ?? 0)" + ((push ?? 0) > 0 ? "-\(push ?? 0)" : "") }
    }
    struct Tape: Decodable {
        let board_30d: [String: TapeLine]?
        let kind: TapeLine?
    }

    let candidate: Candidate
    /// The stored pick, decoded by the board's own reader after the envelope.
    var game: GaryPick? = nil
    var prop: PropPick? = nil
    let cases: Cases?
    let briefing: String?
    let desk: Desk?
    var with_it: [Companion]
    let ladder: LineLadder?
    let result: Outcome?
    let live: LiveScore?
    let tape: Tape?

    private enum Keys: String, CodingKey { case candidate, cases, briefing, desk, with_it, ladder, result, live, tape }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        candidate = try c.decode(Candidate.self, forKey: .candidate)
        cases = try? c.decode(Cases.self, forKey: .cases)
        briefing = try? c.decode(String.self, forKey: .briefing)
        desk = try? c.decode(Desk.self, forKey: .desk)
        with_it = (try? c.decode([Companion].self, forKey: .with_it)) ?? []
        ladder = try? c.decode(LineLadder.self, forKey: .ladder)
        result = try? c.decode(Outcome.self, forKey: .result)
        live = try? c.decode(LiveScore.self, forKey: .live)
        tape = try? c.decode(Tape.self, forKey: .tape)
    }

    var isProp: Bool { candidate.kind == "prop" }
    var pickedHome: Bool {
        if let flag = cases?.pick_is_home { return flag }
        guard let game, let home = game.homeTeam else { return false }
        return LabFormat.pickNames(game.pick ?? "", team: home)
    }
}

// MARK: - The books, now

/// One book's latest quote on the game (get_books_now).
struct BookNow: Decodable, Identifiable {
    let book: String?
    let seen_at: String?
    let spread_home: LabNumber?
    let spread_home_odds: Int?
    let spread_away: LabNumber?
    let spread_away_odds: Int?
    let ml_home: Int?
    let ml_away: Int?
    let total: LabNumber?
    let over: Int?
    let under: Int?
    var id: String { book ?? "" }
}

// MARK: - The streak pick

/// The day's streak pick: one Winners play that counts toward Gary's streak
/// and doubles as the free pick (get_streak).
struct StreakPick: Decodable {
    let game_date: String?
    let candidate_id: Int?
    let league: String?
    let kind: String?
    let pick_text: String?
    let odds: Int?
    let matchup: String?
    let game_id: LabText?
    let commence_time: String?
    let stake_units: LabNumber?
    let player: String?
    let prop: String?
    let bet: String?
    let result: String?
    var ticket: String {
        if kind == "prop", let player {
            let market = LabFormat.marketWords(prop)
            let line = LabFormat.trailingNumber(prop) ?? ""
            return "\(player) \((bet ?? "over").lowercased()) \(line) \(market)".replacingOccurrences(of: "  ", with: " ")
        }
        return LabFormat.ticketBody(pick_text ?? "")
    }
}
struct StreakState: Decodable {
    let current: Int?
    let best: Int?
    let today: StreakPick?
    let yesterday: StreakPick?
}

// MARK: - Talk to Gary

struct GaryTalkReply: Decodable {
    let ok: Bool?
    let text: String
    let reads: [String]?
    let used: Int?
    let limit: Int?
    let audio_url: String?
}

// MARK: - Systems (Beat Gary)

struct SystemFilters: Codable, Equatable {
    var sports: [String]? = ["MLB", "NFL", "NCAAF"]
    var side: String? = "any_dog"
    var market: String? = "moneyline"
    var price_min: Int? = nil
    var price_max: Int? = nil
    var spread_max: Double? = nil
    var total_min: Double? = nil
    var total_max: Double? = nil
    var time: String? = "any"
    var gary: String? = "any"

    var asBody: [String: Any] {
        var d: [String: Any] = [:]
        d["sports"] = sports ?? ["MLB", "NFL", "NCAAF"]
        d["side"] = side ?? "any_dog"
        d["market"] = market ?? "moneyline"
        if let price_min { d["price_min"] = price_min }
        if let price_max { d["price_max"] = price_max }
        if let spread_max { d["spread_max"] = spread_max }
        if let total_min { d["total_min"] = total_min }
        if let total_max { d["total_max"] = total_max }
        d["time"] = time ?? "any"
        d["gary"] = gary ?? "any"
        return d
    }
}

struct SystemRecord: Decodable {
    let won: Int?
    let lost: Int?
    let push: Int?
    let pending: Int?
    let units: LabNumber?
    let streak: Int?
    var line: String { "\(won ?? 0)-\(lost ?? 0)" + ((push ?? 0) > 0 ? "-\(push ?? 0)" : "") }
}

struct UserSystem: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let filters: SystemFilters?
    let active: Bool?
    let record: SystemRecord?
    let last_entered: String?
    static func == (a: UserSystem, b: UserSystem) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct SystemMatch: Decodable, Identifiable {
    let league: String?
    let game_id: LabText?
    let matchup: String?
    let home_team: String?
    let away_team: String?
    let commence_time: String?
    let pick_text: String?
    let side: String?
    let market: String?
    let line: LabNumber?
    let odds: Int?
    let odds_estimated: Bool?
    let gary_pick: String?
    let gary_agrees: Bool?
    var id: String { "\(league ?? "")|\(game_id?.value ?? matchup ?? "")|\(market ?? "")" }
}

struct SystemBet: Decodable, Identifiable {
    struct GaryOnGame: Decodable {
        let pick_text: String?
        let reason: String?
        let candidate_id: Int?
    }
    let id: Int
    let game_date: String?
    let league: String?
    let game_id: LabText?
    let matchup: String?
    let pick_text: String?
    let side: String?
    let market: String?
    let line: LabNumber?
    let odds: Int?
    let odds_estimated: Bool?
    let stake_units: LabNumber?
    let commence_time: String?
    let status: String?
    let units_net: LabNumber?
    let gary: GaryOnGame?
}

extension LabFormat {
    /// A server error as the reader should see it: the message, never the enum.
    static func errorText(_ error: Error) -> String {
        if let e = error as? UserBookError { return e.errorDescription ?? "Something went wrong." }
        if error is CancellationError { return "" }
        return error.localizedDescription
    }
}

struct BeatGary: Decodable {
    struct Line: Decodable, Identifiable {
        let id: String?
        let name: String?
        let won: Int?
        let lost: Int?
        let push: Int?
        let units: LabNumber?
        var identity: String { id ?? name ?? UUID().uuidString }
    }
    let gary: SystemRecord?
    let systems: [Line]?
}

// MARK: - Reads

extension SupabaseAPI {
    private static func labDecoder() -> JSONDecoder { JSONDecoder() }

    /// The board, straight from `get_winners_board`, with the fields the lab
    /// needs (candidate id, reason, units) that the shelf reader drops.
    static func fetchLabBoard(date: String) async throws -> LabBoard {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_winners_board", body: ["p_date": date])
        guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.cannotParseResponse) }
        var board = LabBoard()
        if let boards = envelope["boards"] {
            board.boards = (try? JSONDecoder().decode([WinnersBoardSummary].self, from: JSONSerialization.data(withJSONObject: boards))) ?? []
        }
        if let access = envelope["access"] {
            board.access = try? JSONDecoder().decode(WinnersAccessSnapshot.self, from: JSONSerialization.data(withJSONObject: access))
        }
        board.freeCandidateID = (envelope["free_candidate_id"] as? NSNumber)?.intValue
        let rows = envelope["tickets"] as? [[String: Any]] ?? []
        // The board's own reader normalizes and validates every stored pick;
        // the lab only adds the fields the shelf reader drops.
        let decoded = try decodeWinnersBoard(JSONSerialization.data(withJSONObject: rows), date: date)
        var byCandidate: [Int: [String: Any]] = [:]
        for row in rows { if let id = LabFormat.intValue(row["candidate_id"]) { byCandidate[id] = row } }
        func ticket(_ id: String, game: GaryPick?, prop: PropPick?) -> LabBoardTicket? {
            guard let candidate = Int(id), let row = byCandidate[candidate] else { return nil }
            return LabBoardTicket(
                candidateID: candidate, kind: (row["kind"] as? String) ?? (prop != nil ? "prop" : "game"),
                league: ((row["league"] as? String) ?? game?.league ?? prop?.effectiveLeague ?? "").uppercased(),
                gameID: LabFormat.stringValue(row["game_id"]),
                gameDate: (row["game_date"] as? String) ?? date,
                reason: row["reason"] as? String,
                stakeUnits: LabFormat.doubleValue(row["stake_units"]),
                admittedAt: row["admitted_at"] as? String,
                game: game, prop: prop)
        }
        for (i, game) in decoded.games.enumerated() where i < decoded.gamePublicationIDs.count {
            if let t = ticket(decoded.gamePublicationIDs[i], game: game, prop: nil) { board.tickets.append(t) }
        }
        for (i, prop) in decoded.props.enumerated() where i < decoded.propPublicationIDs.count {
            if let t = ticket(decoded.propPublicationIDs[i], game: nil, prop: prop) { board.tickets.append(t) }
        }
        return board
    }

    /// One stored pick through the board reader (the same normalizer the shelf uses).
    private static func decodeStoredPick(snapshot: [String: Any], candidateID: Int, kind: String, league: String, date: String, stake: Double?) -> (game: GaryPick?, prop: PropPick?) {
        var row: [String: Any] = ["candidate_id": candidateID, "game_date": date, "league": league, "kind": kind, "pick_snapshot": snapshot]
        if let stake { row["stake_units"] = stake }
        guard let data = try? JSONSerialization.data(withJSONObject: [row]),
              let decoded = try? decodeWinnersBoard(data, date: date) else { return (nil, nil) }
        return (decoded.games.first, decoded.props.first)
    }

    static func fetchWinnersPlay(candidateID: Int) async throws -> WinnersPlay {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_winners_play", body: ["p_candidate_id": candidateID])
        var play = try labDecoder().decode(WinnersPlay.self, from: data)
        guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return play }
        let c = play.candidate
        if let snapshot = dict["snapshot"] as? [String: Any] {
            let pick = decodeStoredPick(snapshot: snapshot, candidateID: c.id, kind: c.kind, league: c.league, date: c.game_date, stake: c.stake_units?.value)
            play.game = pick.game; play.prop = pick.prop
        }
        if let rows = dict["with_it"] as? [[String: Any]] {
            for row in rows {
                guard let id = LabFormat.intValue(row["candidate_id"]), let snapshot = row["pick_snapshot"] as? [String: Any],
                      let index = play.with_it.firstIndex(where: { $0.candidate_id == id }) else { continue }
                let pick = decodeStoredPick(snapshot: snapshot, candidateID: id, kind: play.with_it[index].kind, league: c.league, date: c.game_date, stake: play.with_it[index].stake_units?.value)
                play.with_it[index].game = pick.game; play.with_it[index].prop = pick.prop
            }
        }
        return play
    }

    static func fetchDeskSection(candidateID: Int, index: Int) async throws -> String {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_winners_desk_section", body: ["p_candidate_id": candidateID, "p_index": index])
        if let text = try? JSONDecoder().decode(String.self, from: data) { return text }
        return String(decoding: data, as: UTF8.self)
    }

    static func fetchBooksNow(league: String, date: String, gameID: String) async throws -> [BookNow] {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_books_now", body: ["p_league": league, "p_date": date, "p_game_id": gameID])
        return try labDecoder().decode([BookNow].self, from: data)
    }

    static func fetchStreak(date: String) async throws -> StreakState {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_streak", body: ["p_date": date])
        return try labDecoder().decode(StreakState.self, from: data)
    }

    static func garyTalk(message: String, date: String, candidateID: Int?, history: [[String: String]], voice: Bool, context: String?) async throws -> GaryTalkReply {
        var body: [String: Any] = ["message": message, "date": date, "history": history, "voice": voice]
        if let candidateID { body["candidate_id"] = candidateID }
        if let context, !context.isEmpty { body["context"] = context }
        let data = try await labPost("functions/v1/gary-talk", body: body, timeout: 200)
        return try labDecoder().decode(GaryTalkReply.self, from: data)
    }

    /// Gary's rendered voice for a reply he already gave. Slow (the Mac renders
    /// it); the text is on screen long before this returns.
    static func garyVoice(text: String) async throws -> String? {
        let data = try await labPost("functions/v1/gary-talk", body: ["voice_text": text], timeout: 200)
        struct Spoken: Decodable { let audio_url: String? }
        return (try? labDecoder().decode(Spoken.self, from: data))?.audio_url
    }

    /// The lab's own authenticated POST with a long deadline (the shared
    /// session's default would cut a slow Gary reply off at a minute).
    private static let labSession: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 200
        c.timeoutIntervalForResource = 240
        return URLSession(configuration: c)
    }()
    private static func labPost(_ path: String, body: [String: Any], timeout: TimeInterval) async throws -> Data {
        var req = URLRequest(url: Secrets.supabaseRESTOriginURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.timeoutInterval = timeout
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        let bearer = await MainActor.run { AuthManager.shared.bearerToken }
        req.setValue("Bearer \(bearer ?? Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        var (data, response) = try await labSession.data(for: req)
        if (response as? HTTPURLResponse)?.statusCode == 401, let token = await AuthManager.shared.renewSessionIfPossible() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            (data, response) = try await labSession.data(for: req)
        }
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            struct Failure: Decodable { let error: String? }
            let error = (try? JSONDecoder().decode(Failure.self, from: data))?.error
            throw UserBookError.server(error ?? "Gary's line is busy. Try again in a moment.")
        }
        return data
    }

    static func mySystems() async throws -> [UserSystem] {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/my_systems", body: [:])
        return (try? labDecoder().decode([UserSystem].self, from: data)) ?? []
    }

    static func upsertSystem(id: String?, name: String, filters: SystemFilters, active: Bool) async throws -> String {
        var body: [String: Any] = ["p_name": name, "p_filters": filters.asBody, "p_active": active]
        body["p_id"] = id ?? NSNull()
        let data = try await WinnersAccessStore.request("rest/v1/rpc/upsert_system", body: body)
        if let s = try? JSONDecoder().decode(String.self, from: data) { return s }
        return String(decoding: data, as: UTF8.self).trimmingCharacters(in: CharacterSet(charactersIn: "\" \n"))
    }

    static func deleteSystem(id: String) async throws {
        _ = try await WinnersAccessStore.request("rest/v1/rpc/delete_system", body: ["p_id": id])
    }

    static func systemMatches(filters: SystemFilters, date: String) async throws -> [SystemMatch] {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/system_matches", body: ["p_filters": filters.asBody, "p_date": date])
        return (try? labDecoder().decode([SystemMatch].self, from: data)) ?? []
    }

    static func enterSystemBets(systemID: String, date: String) async throws -> Int {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/enter_system_bets", body: ["p_system_id": systemID, "p_date": date])
        return (try? JSONDecoder().decode(Int.self, from: data)) ?? 0
    }

    static func systemBets(systemID: String, date: String) async throws -> [SystemBet] {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/system_bets_for", body: ["p_system_id": systemID, "p_date": date])
        return (try? labDecoder().decode([SystemBet].self, from: data)) ?? []
    }

    static func beatGary(days: Int = 30) async throws -> BeatGary {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/beat_gary", body: ["p_days": days])
        return try labDecoder().decode(BeatGary.self, from: data)
    }
}
