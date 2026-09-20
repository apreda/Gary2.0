import Foundation
import CoreFoundation

// MARK: - Game Recap (the night's stories, betting perspective — game_recaps)
struct GameRecapRow: Decodable {
    let game_date: String?
    let league: String?
    let matchup: String?
    let pick_text: String?
    let result: String?
    let headline: String?
    let recap: String?
    /// 2-4 stat lines from the night, real prop prices attached when Gary
    /// had one graded ("Matt Olson 2 HR (+340 to homer)").
    let bullets: [String]?
    /// Runs + hits per side, written at recap time from the game's batting
    /// lines. Null on any row written before the box lane, or when the feed
    /// had no batting stats — the card falls back to runs only.
    let box: BoxLine?
}

/// The headline card's box: one side's runs and hits.
struct BoxLine: Decodable {
    struct Side: Decodable {
        let runs: Int?
        let hits: Int?
        /// Home runs. Null on rows written before HR joined the box.
        let hr: Int?
        /// Touchdowns — football's line, where baseball keeps home runs
        /// (founder, Sep 4 2026). Null on every baseball row.
        let td: Int?
    }
    let away: Side?
    let home: Side?

    /// Structured recap scores always follow the stored away/home sides.
    var finalScore: String? {
        guard let a = away?.runs, let h = home?.runs, a >= 0, h >= 0 else { return nil }
        return "\(a)-\(h)"
    }
}

/// The box renderer takes numeric away-home scores, never presentation text.
/// Date, league and original ticket keep repeated matchups apart. Conflicting
/// duplicate results are unavailable instead of choosing an arbitrary score.
enum HomeRecapScores {
    static func key(date: String?, league: String?, matchup: String?, pick: String?) -> String {
        [date, league, matchup, pick].map {
            ($0 ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }.joined(separator: "|")
    }

    static func index(_ results: [GameResult]) -> [String: String] {
        var scores: [String: String] = [:]
        var conflicts = Set<String>()
        for row in results {
            guard let score = row.teamScores else { continue }
            let k = key(date: row.game_date, league: row.effectiveLeague,
                        matchup: row.matchup, pick: row.pick_text)
            let value = "\(score.a)-\(score.h)"
            if let previous = scores[k], previous != value { conflicts.insert(k) }
            scores[k] = value
        }
        for key in conflicts { scores.removeValue(forKey: key) }
        return scores
    }
}

