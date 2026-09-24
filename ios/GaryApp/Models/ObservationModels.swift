import Foundation
import CoreFoundation

// MARK: - Streaks (live runs around the league — teams + bats, $0 pipeline)
struct StreakRow: Decodable {
    let game_date: String?
    let league: String?
    let subject_type: String?  // team | player
    let subject: String?       // "Chicago Cubs" / "Aaron Judge"
    let team: String?          // player's team (teams: same as subject)
    let kind: String?          // win | loss | hit | hitless | hr | over | under
    let length: Int?           // games (hitless: at-bats)
    let detail: String?        // "16 games — 24-for-61 (.393)"
    let next_game: String?     // Stored next-game label, e.g. "vs Brewers · 7:10 PM ET"; no date/game identity.
}

// MARK: - Pick Fact Check (claims from the rationale, graded vs reality)
struct FactClaim: Codable {
    let claim: String?
    let verdict: String?   // "right" | "wrong" | "unclear"
    let note: String?
}
struct FactCheckRow: Decodable {
    let claims: [FactClaim]?
    let right_count: Int?
    let wrong_count: Int?
}

struct PlayerInsightCardRow: Decodable, Identifiable {
    let league: String?
    let player_id: String?
    let player_name: String?
    let team_abbr: String?
    let game_id: String?
    let payload: PlayerInsightPack?

    var id: String { [league ?? "", game_id ?? "", player_id ?? player_name ?? ""].joined(separator: "|") }
}

