import Foundation
import CoreFoundation

// MARK: - Daily Slate (every game + opening lines, from the 5am snapshot)
struct DailySlateRow: Codable {
    let league: String?
    let away_team: String?
    let home_team: String?
    let commence_time: String?
    /// NCAAF provider calendar date. When kickoff_status is `date_only`,
    /// commence_time is intentionally nil and the UI must render TIME TBD.
    var scheduled_date: String? = nil
    var kickoff_status: String? = nil  // confirmed | date_only (NCAAF); nil legacy/other sports
    /// Canonical provider game state. Optional keeps prior cached slate rows
    /// decodable while the status contract rolls forward.
    var game_status: String? = nil
    var status_detail: String? = nil
    /// BallDontLie game id — the game's identity (Jul 22 2026): lets readers
    /// tell doubleheader games apart and join edges/live scores per game.
    let bdl_game_id: Int?
    let venue: String?
    let spread: Double?
    let ml_home: Double?
    let ml_away: Double?
    let total: Double?
    /// NCAAF navigation chrome (Aug 25 2026): conference names + AP Top 25
    /// ranks per side, stamped by the slate writer for college rows only —
    /// the Picks page's ranked default and conference filter read these.
    /// Optional keeps every other league's rows and cached slates decodable.
    var home_conference: String? = nil
    var away_conference: String? = nil
    var home_ranking: Int? = nil
    var away_ranking: Int? = nil

    var isInterrupted: Bool {
        switch game_status?.lowercased() {
        case "delayed", "postponed", "suspended", "cancelled": true
        default: false
        }
    }

    var interruptionLabel: String? {
        guard isInterrupted else { return nil }
        if let provider = status_detail?.trimmingCharacters(in: .whitespacesAndNewlines),
           !provider.isEmpty { return provider.uppercased() }
        return game_status?.uppercased()
    }

    var kickoffTimeLabel: String? {
        kickoff_status == "date_only" ? "TIME TBD" : nil
    }

    /// Supabase decoding is intentionally tolerant at the field level for old
    /// rows, so validate the minimum schedule contract before treating a row as
    /// a successful slate payload. An all-optional `{}` must never become a
    /// blank game or poison the same-date last-good cache.
    var hasValidStoredPayload: Bool {
        func text(_ value: String?) -> String? {
            guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !value.isEmpty else { return nil }
            return value
        }
        func instant(_ value: String?) -> Date? {
            guard let value = text(value) else { return nil }
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let parsed = fractional.date(from: value) { return parsed }
            return ISO8601DateFormatter().date(from: value)
        }

        guard let league = text(league)?.uppercased(),
              text(away_team) != nil,
              text(home_team) != nil else { return false }

        if league == "NFL" || league == "NCAAF" {
            guard bdl_game_id != nil else { return false }
            switch text(kickoff_status)?.lowercased() {
            case "confirmed":
                return instant(commence_time) != nil
            case "date_only":
                guard commence_time == nil,
                      let day = text(scheduled_date) else { return false }
                return day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
            default:
                return false
            }
        }

        return instant(commence_time) != nil
    }
}


// MARK: - MLB doubleheaders

/// MLB DOUBLEHEADERS (founder, Sep 25 2026: two Orioles–Yankees rows at 4:05
/// and 4:10 read as one game listed twice). Two games between the same clubs
/// on one day are Game 1 and Game 2. In a traditional doubleheader MLB lists
/// Game 2 after Game 1, and the feeds carry a placeholder a few minutes past
/// Game 1's first pitch, so that time reads "After Gm 1" instead. A split
/// doubleheader (1:05 and 7:05) keeps both real times. Learned from every
/// daily-slate read; nothing here changes a game's identity.
enum MLBDoubleheader {
    struct Slot: Equatable {
        let number: Int
        let followsGame1: Bool
    }

    static let afterGame1 = "After Gm 1"
    /// A second game listed this soon after the first is MLB's placeholder.
    private static let placeholderGap: TimeInterval = 3 * 60 * 60
    private static let lock = NSLock()
    private static var slots: [Int: Slot] = [:]
    private static var placeholders: Set<TimeInterval> = []

    private struct Game {
        let key: String
        let id: Int
        let start: Date
    }

    static func learn(_ rows: [DailySlateRow]) {
        let et = TimeZone(identifier: "America/New_York") ?? .current
        var cal = Calendar(identifier: .gregorian); cal.timeZone = et
        let norm = { (s: String?) in (s ?? "").lowercased().trimmingCharacters(in: .whitespaces) }
        let games: [Game] = rows.compactMap { row in
            guard (row.league ?? "").uppercased() == "MLB", let id = row.bdl_game_id,
                  let start = row.commence_time.flatMap(parseISO8601) else { return nil }
            let day = cal.dateComponents([.year, .month, .day], from: start)
            return Game(key: "\(norm(row.away_team))|\(norm(row.home_team))|\(day.year ?? 0)-\(day.month ?? 0)-\(day.day ?? 0)",
                        id: id, start: start)
        }
        var found: [Int: Slot] = [:]
        var holders: Set<TimeInterval> = []
        for pair in Dictionary(grouping: games, by: { $0.key }).values where pair.count > 1 {
            let ordered = pair.sorted { $0.start < $1.start }
            for (i, g) in ordered.enumerated() {
                let follows = i > 0 && g.start.timeIntervalSince(ordered[i - 1].start) < placeholderGap
                found[g.id] = Slot(number: i + 1, followsGame1: follows)
                // Only a start no other game shares can stand for "after Game 1".
                if follows, games.filter({ $0.start == g.start }).count == 1 {
                    holders.insert(g.start.timeIntervalSince1970)
                }
            }
        }
        lock.lock(); defer { lock.unlock() }
        slots.merge(found) { $1 }
        placeholders.formUnion(holders)
    }

    static func slot(_ gameID: Int?) -> Slot? {
        guard let gameID else { return nil }
        lock.lock(); defer { lock.unlock() }
        return slots[gameID]
    }

    /// True when this start is a Game 2 placeholder, not a real first pitch.
    static func followsGame1(_ start: Date) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return placeholders.contains(start.timeIntervalSince1970)
    }
}
