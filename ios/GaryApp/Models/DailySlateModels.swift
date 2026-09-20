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

    var hasConfirmedKickoff: Bool {
        kickoff_status != "date_only" && commence_time?.isEmpty == false
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

