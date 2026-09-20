import Foundation

/// Durable grades follow the game's league/date/provider identity and original
/// ticket, including Thursday games displayed on the Sunday NFL board.
struct PicksSettledGames: Codable, Equatable {
    private var outcomes: [String: String] = [:]
    private var finals: [String: String] = [:]
    private var completed: [String: Bool] = [:]

    private static func gameKey(league: String?, date: String?, gameID: Int?) -> String? {
        guard let league = league?.uppercased(), !league.isEmpty,
              let identity = ExactGameIdentity(date: date, gameID: gameID) else { return nil }
        return "\(league)|\(identity.date)|\(identity.gameID)"
    }

    private static func ticket(_ text: String?) -> String? {
        guard let text else { return nil }
        let normalized = text.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return normalized.isEmpty ? nil : normalized
    }

    mutating func record(league: String?, date: String?, gameID: Int?, pick: String?,
                         outcome: String?, score: String?) {
        guard let key = Self.gameKey(league: league, date: date, gameID: gameID),
              let outcome = outcome?.lowercased(), ["won", "lost", "push"].contains(outcome) else { return }
        completed[key] = true
        if let pick = Self.ticket(pick) { outcomes[key + "|" + pick] = outcome }
        if let score, !score.isEmpty { finals[key] = score }
    }

    func result(league: String?, date: String?, gameID: Int?, pick: String?) -> String? {
        guard let key = Self.gameKey(league: league, date: date, gameID: gameID),
              let pick = Self.ticket(pick) else { return nil }
        return outcomes[key + "|" + pick]
    }

    func isFinal(league: String?, date: String?, gameID: Int?) -> Bool {
        guard let key = Self.gameKey(league: league, date: date, gameID: gameID) else { return false }
        return completed[key] == true
    }

    func score(league: String?, date: String?, gameID: Int?) -> String? {
        guard let key = Self.gameKey(league: league, date: date, gameID: gameID) else { return nil }
        return finals[key]
    }
}

/// Small status snapshots can reorder the strip without regrouping every pick
/// and prop on a live-score tick. Stable ties retain simultaneous kickoff order.
enum PicksGameOrder {
    struct Item: Equatable {
        let id: String
        let start: Date?
        let bucket: Int // live = 0, upcoming = 1, confirmed final = 2
    }

    struct Request: Equatable {
        let ids: [String]
        let interacting: Bool
    }

    static func indices(_ items: [Item], historical: Bool = false) -> [Int] {
        items.indices.sorted { lhs, rhs in
            let l = items[lhs], r = items[rhs]
            if !historical, l.bucket != r.bucket { return l.bucket < r.bucket }
            let lt = l.start ?? .distantFuture, rt = r.start ?? .distantFuture
            return lt == rt ? lhs < rhs : lt < rt
        }
    }

    /// Page zero is the overview. Keep the reader on their selected game when
    /// its strip position changes; a removed game safely returns to overview.
    static func selectedPage(_ page: Int, before: [String], after: [String]) -> Int {
        guard page > 0, before.indices.contains(page - 1),
              let index = after.firstIndex(of: before[page - 1]) else { return 0 }
        return index + 1
    }
}
