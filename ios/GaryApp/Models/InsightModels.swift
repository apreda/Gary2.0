import Foundation
import CoreFoundation

// MARK: - Insight Connections ("Today's Edges" hub)
// The iOS app reads the FLAT `insight_connections` table directly — one row per
// hub card. Property names match the SQL columns (snake_case) so no custom
// CodingKeys are needed. Everything optional so a partial row never aborts the
// whole decode.

struct Connection: Codable {
    let date: String?
    let league: String?          // "MLB" / "NBA" / "WC"
    let category: String?        // snake_case lane: heat_check, platoon_edge, ballpark_shift, regression_watch, …
    let headline: String?
    let detail: String?
    let game: String?            // "AWAY @ HOME"
    let value: String?           // compact right-side token (number → big, else capsule)
    let tone: String?            // "good" / "bad" / "neutral"
    let spark: [Double]?         // optional MiniBarChart series
    let line_val: Double?        // optional reference line for the bars
    let relevance_score: Double? // 0–100 ranking score
    let player_id: String?
    let team_id: String?
    let game_id: String?
    let meta: SwapMeta?          // structured lane payload (beneficiary swap rows)
    let result: String?          // "hit" / "miss" / "push" / nil — graded the next morning
    let result_note: String?     // grader's one-liner ("2-for-4, double") — receipts subline

    /// Older collected cards can outlive the retired metric. Keep valid source
    /// observations even when an inactive meta.judgment contains old analysis.
    var permitsCurrentMetricPolicy: Bool {
        guard meta?.kind != "regression_pitcher" else { return false }
        return [headline, detail, value, meta?.evidence, meta?.read, meta?.verdict,
                meta?.computed_detail, meta?.reason, meta?.drop_note]
            .compactMap { $0 }.allSatisfy { !GaryMlbMetricPolicy.containsExcludedAnalysis($0) }
    }

}

/// A compact value in an insight row's `meta` payload. Football's live state
/// lanes may publish a number (pressure rate, line, share) or an already-
/// formatted string ("42%", "7-3"). Decoding both prevents one new factor from
/// invalidating the entire `insight_connections` response.
enum InsightMetaValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let string = try? value.decode(String.self) {
            self = .string(string)
        } else if let number = try? value.decode(Double.self) {
            self = .number(number)
        } else if let bool = try? value.decode(Bool.self) {
            self = .bool(bool)
        } else {
            throw DecodingError.typeMismatch(
                InsightMetaValue.self,
                .init(codingPath: decoder.codingPath,
                      debugDescription: "Expected a string, number, or boolean insight value")
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .string(let item): try value.encode(item)
        case .number(let item): try value.encode(item)
        case .bool(let item): try value.encode(item)
        }
    }

    var display: String {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            if value.rounded() == value { return String(Int(value)) }
            return String(format: "%.2f", value)
                .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        case .bool(let value):
            return value ? "YES" : "NO"
        }
    }
}

/// One provider-identified game on a verified next football slate. Calendar
/// dates and exact kickoffs stay separate so a date-only fixture never gains
/// a fabricated clock, including college games after midnight Eastern.
struct FootballNextSlateGame: Codable, Identifiable {
    let game_id: String
    let away_team_id: String?
    let home_team_id: String?
    let away_team: String?
    let home_team: String?
    let away_abbr: String?
    let home_abbr: String?
    let scheduled_date: String
    let kickoff_status: String?
    let commence_time: String?
    let game_status: String?

    var id: String { game_id }
    var matchupLabel: String {
        let away = Self.label(away_team) ?? Self.label(away_abbr) ?? "Away team unavailable"
        let home = Self.label(home_team) ?? Self.label(home_abbr) ?? "Home team unavailable"
        return "\(away) at \(home)"
    }
    var kickoffLabel: String {
        let status = (game_status ?? "").lowercased().replacingOccurrences(of: "status_", with: "")
        if status.contains("postponed") { return "POSTPONED" }
        if status.contains("cancel") { return "CANCELLED" }
        if status.contains("suspended") { return "SUSPENDED" }
        if status.contains("delayed") { return "DELAYED" }
        if status.contains("final") || ["post", "complete", "completed"].contains(status) { return "FINAL" }
        if ["live", "in progress", "in_progress", "halftime"].contains(status) { return "LIVE" }
        guard kickoff_status == "confirmed", let raw = commence_time,
              raw.contains("T"),
              let date = Self.fractionalISO.date(from: raw) ?? Self.plainISO.date(from: raw) else {
            return "TIME TBD"
        }
        let formatter = Self.calendarDate.string(from: date) == scheduled_date ? Self.time : Self.dayTime
        return "\(formatter.string(from: date).uppercased()) ET"
    }

    private static func label(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
    private static let plainISO = ISO8601DateFormatter()
    private static let fractionalISO: ISO8601DateFormatter = {
        let value = ISO8601DateFormatter()
        value.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return value
    }()
    private static func formatter(_ format: String) -> DateFormatter {
        let value = DateFormatter()
        value.locale = Locale(identifier: "en_US_POSIX")
        value.timeZone = TimeZone(identifier: "America/New_York")
        value.dateFormat = format
        return value
    }
    private static let calendarDate = formatter("yyyy-MM-dd")
    private static let time = formatter("h:mm a")
    private static let dayTime = formatter("EEE h:mm a")
}

/// Structured player-swap payload on beneficiary rows (kind == "swap"):
/// the OUT player, why, and tonight's replacement with his slot + line.
/// Immutable, reference-backed because a `Signal` exposes this same payload
/// through several lane-specific accessors (`reg`, `h2h`, `weather`, etc.).
/// Keeping this as a value type made every optional reserve the full payload
/// inline, inflating each Signal by several KB and overflowing the iPhone's
/// main-thread stack while SwiftUI assembled the Hub. Reference semantics are
/// safe here: every field is `let` and decoded once.
final class SwapMeta: Codable {
    /// Optional connected interpretation; original research remains intact.
    let judgment: HubJudgment?
    /// Original collector observation clocks; database insertion is not research time.
    let computed_as_of: String?
    let source_collected_at: String?
    /// Dated measured bullpen research. Older prose-only rows omit these.
    let research_version: OptionalResearchField<String>?
    let arms: OptionalResearchField<[BullpenResearchArm]>?
    let window_dates: OptionalResearchField<[String]>?
    let no_game_dates: OptionalResearchField<[String]>?
    let source_as_of: OptionalResearchField<String>?
    let team_identity: OptionalResearchField<BullpenResearchTeam>?
    /// The computed facts behind Gary's read (Jul 27 voice pass moved the
    /// template sentence here) — the expanded card's "numbers behind it" line.
    let evidence: String?
    let kind: String?
    let version: Int?
    /// Structured proof rows repeat the provider game id inside `meta`. The
    /// outer connection id and this sealed payload id must agree before any
    /// market receipt is allowed to render.
    let game_id: String?
    // Football state modules. `baseline` / `live_value` deliberately accept
    // either numeric or formatted scalar values; every other field is stable.
    let pick_id: String?
    // Providers/storage have emitted both `1` and `"1"`. Keep this flexible so
    // one provenance scalar cannot make an otherwise valid proof row vanish.
    let season_type: InsightMetaValue?
    let factor_code: String?
    let baseline: InsightMetaValue?
    let live_value: InsightMetaValue?
    let baseline_selected: InsightMetaValue?
    let baseline_opponent: InsightMetaValue?
    let live_selected: InsightMetaValue?
    let live_opponent: InsightMetaValue?
    let baseline_unit: String?
    let live_unit: String?
    let cover_margin: Double?
    let selected_score: Double?
    let opponent_score: Double?
    let market_type: String?
    let state: String?
    let as_of: String?
    // Football market receipt (`after_gary`). The backend compares Gary's
    // immutable publish snapshot with the latest verified pre-kick quote from
    // the same book. Keep the selection/snapshots structured so the UI never
    // has to reverse-parse a headline or call a live line a closing line.
    let vendor: String?
    let pick_side: String?
    let pick_team: String?
    let pick_label: String?
    let published_at: String?
    let published_at_source: String?
    let kickoff: String?
    let market_state: String?
    let published: FootballMarketSnapshot?
    let current: FootballMarketSnapshot?
    let movement: FootballMarketMovement?
    let as_of_source: String?
    // Exact multi-book football market range (`market_range`). This is a
    // sportsbook disagreement receipt, never a proxy for public or sharp bets.
    let source: String?
    let metric: String?
    let market: String?
    let low: Double?
    let high: Double?
    let range: Double?
    let book_count: Int?
    let vendors: [String]?
    // Grounded NCAAF dark-day preview (`next_slate`). Kickoff is optional by
    // contract: a provider date without a time must remain TIME TBD.
    let date: String?
    let scheduled_date: String?
    let game_count: Int?
    let confirmed_count: Int?
    let time_tbd_count: Int?
    let first_confirmed_kickoff: String?
    let next_slate_games: [FootballNextSlateGame]?
    let next_slate_checked_at: String?
    let discovery_window_days: Int?
    let team_policy: String?
    let team: String?
    let position: String?
    let out_name: String?
    let out_note: String?    // "Oblique · On the injury report for 4 days"
    let in_name: String?
    let in_note: String?     // "BATS 1ST · .794 OPS · .284 AVG"
    // Confirmed-XI payload (kind == "confirmedXI"): both teams' team sheets.
    let home: TeamSheet?
    let away: TeamSheet?
    let status: String?      // "projected" | "contested" (GTD doubt) | "confirmed"
    let doubts: [String]?    // projected starters with an active injury doubt (Contested)
    // Regression payload (kind == "regression_pitcher"): the enriched pitcher
    // read that powers the Regression Board's rich row + expanded detail.
    let day: String?         // "tonight" | "tomorrow" (tomorrow = projected starter look-ahead)
    let direction: String?   // "overperforming" (due to regress) | "underperforming" (due to bounce back)
    let era: Double?
    let gap: Double?
    let whip: Double?
    let k9: Double?
    let opp_ba: String?      // opponent batting avg ".261"
    let opp_xba: String?     // opponent expected BA ".269"
    let hard_hit: Double?    // hard-hit% allowed
    let barrel: Double?      // barrel% allowed
    let opp: String?         // opponent abbreviation faced
    let verdict: String?     // one-line conviction read (Hub voice)
    // Park-weather payload (kind == "park_weather"): live first-pitch conditions.
    let temp_f: Int?         // °F
    let wind_mph: Int?       // mph
    let wind_dir: String?    // "out" | "in" | "cross" (lean axis, not field bearing)
    let lean: String?        // "over" (hitter) | "under" (pitcher)
    let venue: String?
    let condition: String?   // "Partly Cloudy" etc.
    // Fantasy-pickup payload (kind == "fantasy_pickup"): the Hub's two-column board.
    let role: String?        // "SP" | "HITTER"
    let tier: String?        // "MUST_ADD" | "STREAM" | "DEEP"
    let reason: String?      // one-line matchup reason
    let ops: Double?         // hitter season OPS
    let avg: Double?         // hitter season AVG
    let batting_order: Int?  // lineup spot
    let opp_sp: String?      // opposing starter (hitter pickups)
    let opp_sp_era: Double?  // opposing starter ERA
    // Fantasy Corner lane payloads (two_start / closer_watch / return_watch /
    // cut_list): the full Gary read + the numbers the card's stat strip shows.
    let read: String?              // full analyst read (verdict rides `verdict`)
    let computed_detail: String?   // football lanes: the exact computed sentence behind the read
    let week: String?              // two-start: "Mon 7/27 - Sun 8/2"
    let starts: InsightStarts?     // two-start schedule or starter-team-record count
    let committee: Bool?           // closer watch: shared ninth
    let leader: FantasyArm?        // closer watch: save leader
    let runner: FantasyArm?        // closer watch: next in line
    let injury: String?            // return watch: "oblique strain"
    let return_date: String?       // return watch: YYYY-MM-DD
    let days_out: Int?
    let season_line: String?       // return watch: ".839 OPS" / "3.10 ERA"
    let drop_note: String?         // cut list: the number that says cut
    // Football Fantasy Corner payloads (fantasy_usage / fantasy_matchup /
    // fantasy_trend — founder, Sep 3 2026: MLB is the template): tier, read
    // and verdict ride the shared fields above; these are the stat-strip
    // numbers the football writers store.
    let unit: String?               // "OPP/G" | "TGT/G" | college volume token
    let per_game: Double?
    let games_played: Int?
    let evidence_scope: String?     // "current_season" | "prior_season_baseline"
    let season: InsightMetaValue?   // a number in football metas; text-safe elsewhere
    let total: Double?              // fantasy_matchup: the game total
    let implied_team_total: Double?
    let latest_two: Double?         // fantasy_trend: latest two games
    let prior_sample: Double?       // fantasy_trend: the preceding sample
    let percent_change: Double?
    // THE QUARTERBACKS plates (quarterback rows from footballQbWatch, Sep 3
    // 2026): the named starter, his side, and his passing line as numbers.
    let qb: String?
    let qb_status: String?
    let abbr: String?
    let injury_status: String?
    let passing: PassingLine?
    // THE PRACTICE REPORT (practice_report rows, Sep 3 2026): the league's
    // official ledger — this week's participation by day and the game status.
    let practice: PracticeDays?
    let latest: String?             // today's code: FP · LP · DNP
    let game_status: String?
    let latest_day: String?
    let practice_text: String?
    // Head-to-head payload (kind == "h2h"): season series dominance + last meeting.
    let dominant: String?
    let opponent: String?
    let dominant_name: String?
    let opponent_name: String?
    let wins: Int?
    let losses: Int?
    let games: Int?
    let last_meeting: H2HLast?
    /// Every meeting this season, oldest → newest — the H2 ledger's rows.
    let meetings: [H2HMeeting]?
    // NRFI/YRFI payload (kind == "nrfi"): each side's recent 1st-inning sequence.
    let side: String?         // "NRFI" | "YRFI"
    let home_abbr: String?
    let away_abbr: String?
    let home_seq: [Int]?      // per game: 1 = run in the 1st, 0 = scoreless
    let away_seq: [Int]?
    let home_any: Int?
    let home_n: Int?
    let away_any: Int?
    let away_n: Int?
    // Single-team variant of the nrfi row (TEAM_HOT/TEAM_QUIET): one side's seq.
    let team_abbr: String?
    let team_seq: [Int]?
    let team_scored: Int?
    let team_n: Int?
    /// Tonight's 1st-inning O/U 0.5 price, snapshotted at write time — the
    /// NRFI Watch card's money line (N10, founder pick Aug 6).
    let price: NrfiPrice?

}

/// A new research field cannot invalidate an otherwise readable Connection.
/// This also tolerates unrelated legacy lanes that used the same JSON key.
struct OptionalResearchField<Value: Codable>: Codable {
    let value: Value?
    init(from decoder: Decoder) throws {
        value = try? decoder.singleValueContainer().decode(Value.self)
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

struct BullpenResearchTeam: Codable {
    let id: Int?
    let name: String?
    let abbreviation: String?
}

/// Outs use baseball notation; no decimal-innings arithmetic is used here.
struct BullpenResearchArm: Codable {
    let id: Int?
    let name: String?
    let ip: String?
    let g: Int?
    let pitches: Int?
    let er: Int?
    let k: Int?
    let bb: Int?
    let last_used: String?
    let season_era: Double?
    let season_ip: String?
    let season_as_of: String?

    enum CodingKeys: String, CodingKey {
        case id, name, ip, g, pitches, er, k, bb, last_used, season_era, season_ip, season_as_of
    }
    init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        func read<T: Decodable>(_ key: CodingKeys, as type: T.Type = T.self) -> T? {
            try? fields.decodeIfPresent(type, forKey: key)
        }
        func innings(_ key: CodingKeys) -> String? {
            if let text: String = read(key) { return Self.validIP(text) ? text : nil }
            guard let number: Double = read(key), number.isFinite, number >= 0 else { return nil }
            let text = String(number)
            return Self.validIP(text) ? text : nil
        }
        id = read(.id); name = read(.name); ip = innings(.ip); g = read(.g)
        pitches = read(.pitches); er = read(.er); k = read(.k); bb = read(.bb)
        last_used = read(.last_used); season_era = read(.season_era)
        season_ip = innings(.season_ip); season_as_of = read(.season_as_of)
    }

    var inningsLabel: String { Self.validIP(ip) ? ip! : "—" }
    var pitchesLabel: String { pitches.flatMap { $0 >= 0 ? String($0) : nil } ?? "—" }

    var hasSeasonLine: Bool {
        guard let season_era, season_era.isFinite, season_era >= 0,
              Self.validIP(season_ip), let season_ip,
              season_ip != "0" && season_ip != "0.0",
              ExactGameIdentity(date: season_as_of, gameID: 1) != nil else { return false }
        return true
    }
    var seasonERALabel: String { hasSeasonLine ? String(format: "%.2f", season_era!) : "—" }
    var seasonIPLabel: String { hasSeasonLine ? season_ip! : "—" }

    static func validIP(_ value: String?) -> Bool {
        value?.range(of: #"^(?:0|[1-9]\d*)(?:\.[012])?$"#, options: .regularExpression) != nil
    }
}

/// Only a current schema with an exact team and coherent observed dates earns
/// a table. The ledger makes no assertion about tonight's availability.
struct BullpenResearchLedger {
    /// Final-boxscore sources the ledger accepts, exactly as the writer labels them.
    static let sources: Set<String> = ["MLB StatsAPI final boxscores", "BallDontLie final box scores"]
    let arms: [BullpenResearchArm]
    let dates: [String]
    let asOf: String
    let source: String

    init?(meta: SwapMeta?, league: String, slateDate: String?, teamID: String?) {
        guard league == "MLB", let meta,
              meta.kind == "bullpen_fatigue", meta.research_version?.value == "bullpen-facts-v1",
              let source = meta.source, Self.sources.contains(source), meta.games == 3,
              let id = meta.team_identity?.value?.id, id > 0, teamID == String(id),
              let slateDate, ExactGameIdentity(date: slateDate, gameID: 1) != nil,
              let asOf = meta.source_as_of?.value, let dates = meta.window_dates?.value,
              !dates.isEmpty, dates.count <= 3, dates == Array(Set(dates)).sorted(),
              dates.allSatisfy({ ExactGameIdentity(date: $0, gameID: 1) != nil && $0 < slateDate }),
              dates.last == asOf,
              let arms = meta.arms?.value, !arms.isEmpty,
              Set(arms.compactMap(\.id)).count == arms.count,
              arms.allSatisfy({ arm in
                  guard let id = arm.id, id > 0,
                        let name = arm.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                        let last = arm.last_used, dates.contains(last),
                        let appearances = arm.g, (1...3).contains(appearances) else { return false }
                  if arm.hasSeasonLine, let date = arm.season_as_of {
                      return date <= asOf && date.prefix(4) == slateDate.prefix(4)
                  }
                  return true
              }) else { return nil }
        self.arms = arms; self.dates = dates; self.asOf = asOf; self.source = source
    }
}

/// One exact sportsbook quote inside an AFTER GARY receipt.
/// A quarterback's season passing line (BDL season_stats), stored by the
/// writer alongside its prose form; `prior` = last season's line while the
/// current one has no sample.
struct PassingLine: Codable {
    let yards: Double?
    let pct: Double?
    let ypa: Double?
    let td: Int?
    let ints: Int?
    let games: Int?
    let season: Int?
    let prior: Bool?
}

/// One player's practice participation this week, as the league printed it:
/// "FP" full · "LP" limited · "DNP" did not participate · nil = not listed that day.
struct PracticeDays: Codable {
    let wed: String?
    let thu: String?
    let fri: String?
}

struct FootballMarketSnapshot: Codable {
    let line: Double?
    let odds: Double?
    let implied_probability: Double?
}

/// Directional value of Gary's locked number from the picked side's point of
/// view. `primary_value` is points for spreads/totals and percentage points
/// for price-only movement; the backend supplies `primary_unit` explicitly.
struct FootballMarketMovement: Codable {
    let advantage: String?
    let primary_unit: String?
    let primary_value: Double?
    let line_delta_for_pick: Double?
    let price_delta_pp_for_pick: Double?
}

/// The 1st-inning market snapshot on an nrfi row.
struct NrfiPrice: Codable {
    let over: Int?
    let under: Int?
}

/// The backend uses `starts` for either a posted two-start schedule or the
/// sample size behind a starter's team record. Preserve both JSON shapes so
/// a valid record card is not discarded and cached content round-trips.
enum InsightStarts: Codable {
    case count(Int)
    case schedule([FantasyStart])

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let count = try? value.decode(Int.self), count >= 0 {
            self = .count(count)
        } else if let turns = try? value.decode([FantasyStart].self) {
            self = .schedule(turns)
        } else {
            throw DecodingError.typeMismatch(
                InsightStarts.self,
                .init(codingPath: decoder.codingPath,
                      debugDescription: "Expected a nonnegative start count or a two-start schedule")
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .count(let count): try value.encode(count)
        case .schedule(let turns): try value.encode(turns)
        }
    }

    var schedule: [FantasyStart]? {
        guard case .schedule(let turns) = self else { return nil }
        return turns
    }
}

/// One posted start on a two-start card ("Tue 7/29 at Guardians").
struct FantasyStart: Codable {
    let date: String?
    let opp: String?
    let home: Bool?
}

/// One arm on the closer-watch ladder (saves + holds).
struct FantasyArm: Codable {
    let name: String?
    let sv: Int?
    let hld: Int?
}

struct H2HLast: Codable {
    let score: String?
    let winner: String?
    let revenge: Bool?
}

/// One past meeting on the head-to-head ledger. `away`/`home` are the abbrs of
/// the clubs as they lined up THAT night, so the card can print the real venue
/// ("MIA @ ATL") instead of repeating tonight's matchup (founder, Aug 6).
struct H2HMeeting: Codable {
    let date: String?
    let away: String?
    let home: String?
    let away_runs: Int?
    let home_runs: Int?
    /// Did the series' dominant side win this one — the W/L tick.
    let dom_won: Bool?
}

/// One team's confirmed starting XI (WC Confirmed XI lane).
struct TeamSheet: Codable {
    let team: String?
    let formation: String?   // "4-2-3-1"
    let xi: [XIMan]?
    // Football team-metric lanes (quarterback / pace / trenches …) write
    // meta.away / meta.home as { value, games, abbreviation } — one side's
    // number and its sample. Optional so every older row still decodes.
    let value: Double?
    let games: Int?
    let abbreviation: String?
}

struct XIMan: Codable {
    let n: String?           // player name
    let p: String?           // position: G / D / M / F
    let num: Int?            // shirt number
    let id: Int?             // BDL player id — drives the tapped jersey → PlayerCardV4 fetch (Optional: old rows decode without it)
}

enum GaryMlbMetricPolicy {
    static func containsExcludedAnalysis(_ text: String) -> Bool {
        text.range(of: #"\bx[\s_-]*era\b|\bexpected[\s-]+(?:era|earned[\s-]+run[\s-]+average)\b"#,
                   options: [.regularExpression, .caseInsensitive]) != nil
    }
}
