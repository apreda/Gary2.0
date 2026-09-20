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
    /// WC: role-aware stats-section title ("FINISHING" / "ON THE BALL" / "AT THE BACK" / "IN GOAL").
    /// MLB cards omit this → stats section falls back to "SPLITS".
    let statsSectionTitle: String?
}

