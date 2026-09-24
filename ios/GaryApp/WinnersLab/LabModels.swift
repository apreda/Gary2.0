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
    /// The three or four reasons written for the unveil board, when the
    /// server has produced them; nil falls back to slicing the take.
    var reasons: [LabFormat.Reason]? = nil
    /// Gary's own brief of the pick (Sep 23 2026): three short reasons and a
    /// summary he wrote right after the full case. Leads the unveil when present.
    var brief: LabFormat.Brief? = nil
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

    let candidate: Candidate
    /// The stored pick, decoded by the board's own reader after the envelope.
    var game: GaryPick? = nil
    var prop: PropPick? = nil
    let cases: Cases?
    let reasons: [LabFormat.Reason]?
    let desk: Desk?
    var with_it: [Companion]
    let ladder: LineLadder?
    let result: Outcome?
    let live: LiveScore?

    private enum Keys: String, CodingKey { case candidate, cases, reasons, desk, with_it, ladder, result, live }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        candidate = try c.decode(Candidate.self, forKey: .candidate)
        cases = try? c.decode(Cases.self, forKey: .cases)
        reasons = (try? c.decode([LabFormat.Reason].self, forKey: .reasons)).flatMap { $0.isEmpty ? nil : $0 }
        desk = try? c.decode(Desk.self, forKey: .desk)
        with_it = (try? c.decode([Companion].self, forKey: .with_it)) ?? []
        ladder = try? c.decode(LineLadder.self, forKey: .ladder)
        result = try? c.decode(Outcome.self, forKey: .result)
        live = try? c.decode(LiveScore.self, forKey: .live)
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
    /// The last five decided streak picks, oldest first: "W" / "L".
    let recent: [String]?
    let today: StreakPick?
    let yesterday: StreakPick?
}

// MARK: - Systems (Beat Gary)

extension LabFormat {
    /// A server error as the reader should see it: the message, never the enum.
    /// The task was cancelled (the view left, or the identity changed twice
    /// mid-read): nothing to report, and nothing to show as a failure.
    static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let e = error as? URLError, e.code == .cancelled { return true }
        return false
    }
    static func errorText(_ error: Error) -> String {
        if let e = error as? UserBookError { return e.errorDescription ?? "Something went wrong." }
        if error is CancellationError { return "" }
        return error.localizedDescription
    }
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
                game: game, prop: prop,
                reasons: LabFormat.storedReasons(row["reasons"]),
                brief: LabFormat.storedBrief((row["pick_snapshot"] as? [String: Any])?["brief"]))
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

    static func fetchBooksNow(league: String, date: String, gameID: String) async throws -> [BookNow] {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_books_now", body: ["p_league": league, "p_date": date, "p_game_id": gameID])
        return try labDecoder().decode([BookNow].self, from: data)
    }

    static func fetchStreak(date: String) async throws -> StreakState {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_streak", body: ["p_date": date])
        return try labDecoder().decode(StreakState.self, from: data)
    }

    /// The lab's own authenticated POST with a long deadline (the shared
    /// session's default would cut a slow Gary reply off at a minute).
    private static let labSession: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 200
        c.timeoutIntervalForResource = 240
        return URLSession(configuration: c)
    }()

}
