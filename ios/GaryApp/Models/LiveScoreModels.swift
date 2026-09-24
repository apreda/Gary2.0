import Foundation
import CoreFoundation

// MARK: - Live Scores (2-minute poller snapshots)

/// A prop-market event that already CASHED in a live game — WC goals (anytime
/// scorer) / assists / cards; MLB homers / steals / multi-hit days / K days.
/// Written by the live poller's events pass.
struct LiveEvent: Codable, Equatable {
    let k: String?         // goal | assist | card | hr | sb | hits | ks
    let p: String?         // player (LAST NAME, uppercased server-side)
    let d: String?         // detail — "38'" / "x2" / "3 HITS" / "8 KS"
}

struct LiveScore: Codable, Equatable {
    let league: String?
    let game_id: String?
    let away_abbr: String?
    let home_abbr: String?
    let away_score: Int?
    let home_score: Int?
    let status: String?    // scheduled | live | final | delayed | postponed | suspended | cancelled
    let detail: String?    // "INN 7" / "Q3 4:12" / provider interruption text / "FINAL"
    let outs: Int?         // MLB live: 0-2 during play; nil otherwise
    let bases: String?     // MLB live: 3-char [first,second,third] occupancy, e.g. "101"
    let events: [LiveEvent]?   // cashed-prop events (nil until the events pass runs)

    var isLive: Bool { status == "live" }
    var isFinal: Bool { status == "final" }
    var isInterrupted: Bool {
        switch status?.lowercased() {
        case "delayed", "postponed", "suspended", "cancelled": true
        default: false
        }
    }
    /// Provider-authored status text, with a canonical fallback for rows whose
    /// detail is temporarily absent. Interrupted games are neither live nor final.
    var interruptionLabel: String? {
        guard isInterrupted else { return nil }
        if let provider = detail?.trimmingCharacters(in: .whitespacesAndNewlines),
           !provider.isEmpty { return provider.uppercased() }
        return status?.uppercased()
    }
    /// "SD @ PHI" — matches the hub/deep-link abbreviation format.
    var abbrGame: String { "\(away_abbr ?? "") @ \(home_abbr ?? "")" }
    /// "SD 4 · PHI 6" — only for a game that has actually started (live/final).
    /// A SCHEDULED live_scores row carries 0/0, not nil, so without this gate the
    /// board renders a fake "SEN 0 · BEL 0" score for un-started games.
    var scoreLine: String? {
        guard isLive || isFinal, let a = away_score, let h = home_score else { return nil }
        return "\(away_abbr ?? "AWY") \(a) · \(home_abbr ?? "HOM") \(h)"
    }

    // Live MLB game state — drives the on-card base diamond + outs dots.
    private var baseFlags: [Bool] {
        let c = Array(bases ?? "")
        guard c.count == 3 else { return [false, false, false] }
        return c.map { $0 == "1" }
    }
    var onFirst: Bool { baseFlags[0] }
    var onSecond: Bool { baseFlags[1] }
    var onThird: Bool { baseFlags[2] }
}

