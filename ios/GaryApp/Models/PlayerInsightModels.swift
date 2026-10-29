import Foundation
import CoreFoundation

// MARK: - Player Insight Pack (full breakdown behind a hub card)
// Decodes player_insight_cards.payload. Everything optional so a partial pack
// renders whatever sections it has.

struct PlayerInsightPack: Decodable {
    struct Opponent: Decodable { let name: String?; let hand: String? }
    struct LabeledStat: Decodable { let label: String?; let value: String?; let detail: String? }
    struct XStatRow: Decodable { let label: String?; let actual: String?; let expected: String?; let verdict: String? }
    struct PitchRow: Decodable {
        let pitch: String?
        let usagePct: Double?
        let ba: String?
        let slg: String?
        let whiffPct: Double?
        let grade: String?    // strong | weak | neutral | thin
    }
    struct SeasonLine: Decodable { let line1: String?; let line2: String? }
    struct PropLine: Decodable { let label: String?; let line: String?; let odds: String?; let rate: String? }

    let type: String?          // MLB: "hitter" | "pitcher"  ·  WC: "outfield" | "keeper"
    let name: String?
    let team: String?
    let position: String?
    let hand: String?
    let game: String?
    /// Provider-backed slate status, including off-slate player profiles.
    let context: String?
    let opponent: Opponent?
    let strengths: [String]?
    let weaknesses: [String]?
    let season: SeasonLine?
    let xstats: [XStatRow]?
    let splits: [LabeledStat]?
    let form: LabeledStat?
    /// Form ladder (LAST GAME / LAST 5 / LAST 10) — chrono game-log derived.
    let formRows: [LabeledStat]?
    let bvp: LabeledStat?
    let pitchMatchup: [PitchRow]?
    let venue: LabeledStat?
    let props: [PropLine]?
    /// The last 20 finals and the season's counts at every threshold, for the
    /// yardstick (MLB cards built from Sep 22 2026 on).
    let log: PlayerGameLog?
    /// WC: role-aware stats-section title ("FINISHING" / "ON THE BALL" / "AT THE BACK" / "IN GOAL").
    /// MLB cards omit this → stats section falls back to "SPLITS".
    let statsSectionTitle: String?
    /// NBA cards from Oct 28 2026: the numbers the card draws as tables.
    let box: Box?

    /// His averages over the window, home / road / last five, and the last five
    /// games' box lines, newest first (nbaPlayerInsightCards.js `box`).
    struct Box: Decodable {
        struct Line: Decodable {
            let label: String?
            let n: Int?
            let min: Double?, pts: Double?, reb: Double?, ast: Double?, fg3m: Double?
            let stl: Double?, blk: Double?
        }
        struct Game: Decodable {
            let d: String?
            let o: String?
            let home: Bool?
            let min: Double?, pts: Double?, reb: Double?, ast: Double?, fg3m: Double?
        }
        struct Status: Decodable { let status: String?; let detail: String? }
        /// "2026-27 season", or "2025-26 season, last season" before his third game.
        let window: String?
        let avg: Line?
        let splits: [Line]?
        let games: [Game]?
        let status: Status?
    }
}


/// A player's recent games, as the card stores them: `d` dates and `o`
/// opponents for the last 20 finals (oldest first), `s` one series per stat
/// for those games, `n` season games and `ge[stat][k - 1]` the season games
/// with at least k.
struct PlayerGameLog: Decodable, Equatable {
    let n: Int?
    let d: [String]?
    let o: [String]?
    let s: [String: [Double]]?
    let ge: [String: [Int]]?
}
