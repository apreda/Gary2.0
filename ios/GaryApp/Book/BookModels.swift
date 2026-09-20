import SwiftUI
import Charts
import PhotosUI

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
    /// STORE-SAFE BRIDGE: wager tracking is betting content — the entire
    /// surface rides the bridge and returns automatically when `storeSafe`
    /// flips off (the pre-bridge value was a plain `true`).
    static var userBookEnabled: Bool { !storeSafe }

    /// Public standings contain only actual, verified player records.
    static let bookPreviewCast = false
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
    let gary_confidence: Double?
    let streak_pick: Bool?
    let status: String          // pending | won | lost | push | void
    let units_net: Double?
    let lock_at: String?
    let placed_at: String?
    let graded_by: String?
    var is_favorite: Bool? = nil
    var notes: String? = nil
    var bookmaker: String? = nil
    var source_game_id: String? = nil
    var source_pick_id: String? = nil
    var source_line: Double? = nil
    var source_side: String? = nil
    /// moneyline | spread | total | prop | parlay | other — server-derived on
    /// verified tickets, chosen by the user on outside bets (Sep 9 2026).
    var market: String? = nil
    var tags: [String]? = nil

    var isVerified: Bool { kind == "tail" || kind == "fade" }
    var isPending: Bool { status == "pending" }
    var canChangeStreak: Bool {
        guard isVerified, isPending, let lock_at else { return false }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let precise = f.date(from: lock_at)
        f.formatOptions = [.withInternetDateTime]
        return (precise ?? f.date(from: lock_at)).map { $0 > Date() } ?? false
    }
}

extension Notification.Name {
    static let userBookChanged = Notification.Name("UserBookChanged")
}

// MARK: - Personal book history windows
enum BookTimeframe {
    struct Window {
        let start: String
        let end: String
        func contains(_ date: String) -> Bool { date >= start && date <= end }
    }

    /// History windows include today's Eastern date. The separate open-slips
    /// section and All time remain unbounded so future pending bets stay visible.
    static func window(_ timeframe: String, now: Date = Date()) -> Window? {
        guard ["7d", "30d", "season"].contains(timeframe) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: now)
        let floor: String
        if timeframe == "season" {
            floor = max("2026-03-01", "\(today.prefix(4))-01-01")
        } else {
            let days = timeframe == "7d" ? 6 : 29
            floor = formatter.string(from: calendar.date(byAdding: .day, value: -days, to: now)!)
        }
        return Window(start: floor, end: today)
    }
}

// Stakes and results are stored as units. Dollar displays use the account's
// saved unit size, or the labeled hypothetical $100 convention until it is set.
enum BookMoney {
    /// The house display convention while no personal unit size is set.
    static let defaultUnitDollars: Double = 100

    static var unitDollars: Double {
        let v = UserDefaults.standard.double(forKey: "userUnitDollars")
        return v > 0 ? v : defaultUnitDollars
    }
    /// Whether the user has told us their own unit size (drives the one-time
    /// inline ask — display no longer depends on it).
    static var isSet: Bool { UserDefaults.standard.double(forKey: "userUnitDollars") > 0 }

    private static func dollars(_ value: Double) -> String {
        let v = (value * 100).rounded() / 100
        return v == v.rounded() ? String(format: "$%.0f", v) : String(format: "$%.2f", v)
    }

    /// A stake: "$100".
    static func stake(_ units: Double) -> String {
        dollars(units * unitDollars)
    }

    /// A net result: "+$63" / "-$25".
    static func net(_ units: Double) -> String {
        let d = units * unitDollars
        return (d >= 0 ? "+" : "-") + dollars(abs(d))
    }

    /// Ledger totals: "+$140".
    static func netTotal(_ units: Double) -> String {
        let d = units * unitDollars
        return (d >= 0 ? "+" : "-") + dollars(abs(d))
    }
}

