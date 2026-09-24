import Foundation
import CoreFoundation

// MARK: - Billfold (Results) Models

struct GameResult: Decodable {
    let game_id: String?
    let game_date: String?
    let league: String?
    let matchup: String?
    let pick_text: String?
    let result: String?
    let odds: StringOrNumber?
    let final_score: String?
    /// Named score columns establish orientation. Bare text needs an explicit
    /// source contract; legacy nfl_results text has no consistent ordering.
    let away_score: Int?
    let home_score: Int?
    let away_team: String?
    let home_team: String?
    /// BDL numbering carried only by nfl_results rows (1 = preseason,
    /// 2 = regular, 3 = postseason); game_results rows decode nil.
    let season_type: Int?
    /// Stamped by the grader when this exact ticket was on the Winners board.
    let is_winners_pick: Bool?
    var isWinnersPick: Bool { is_winners_pick == true }
    enum ScoreSource { case unknown, gameResultsAwayHome }
    private(set) var scoreSource: ScoreSource = .unknown

    enum CodingKeys: String, CodingKey {
        case game_id, game_date, league, matchup, pick_text, result, odds, final_score, season_type
        case away_score, home_score, away_team, home_team, is_winners_pick
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            game_id: try container.decodeIfPresent(String.self, forKey: .game_id),
            game_date: try container.decodeIfPresent(String.self, forKey: .game_date),
            league: try container.decodeIfPresent(String.self, forKey: .league),
            matchup: try container.decodeIfPresent(String.self, forKey: .matchup),
            pick_text: try container.decodeIfPresent(String.self, forKey: .pick_text),
            result: try container.decodeIfPresent(String.self, forKey: .result),
            odds: try container.decodeIfPresent(StringOrNumber.self, forKey: .odds),
            final_score: try container.decodeIfPresent(String.self, forKey: .final_score),
            season_type: try container.decodeIfPresent(Int.self, forKey: .season_type),
            away_score: try container.decodeIfPresent(Int.self, forKey: .away_score),
            home_score: try container.decodeIfPresent(Int.self, forKey: .home_score),
            away_team: try container.decodeIfPresent(String.self, forKey: .away_team),
            home_team: try container.decodeIfPresent(String.self, forKey: .home_team),
            is_winners_pick: try container.decodeIfPresent(Bool.self, forKey: .is_winners_pick)
        )
    }

    /// Memberwise initializer for creating from NFLResult
    init(game_id: String? = nil, game_date: String?, league: String?, matchup: String?, pick_text: String?, result: String?, odds: StringOrNumber?, final_score: String?, season_type: Int? = nil, away_score: Int? = nil, home_score: Int? = nil, away_team: String? = nil, home_team: String? = nil, is_winners_pick: Bool? = nil) {
        self.is_winners_pick = is_winners_pick
        self.game_id = game_id
        self.game_date = game_date
        self.league = league
        self.matchup = matchup
        self.pick_text = pick_text
        // Historical graders have used both "Lost" and "lost". Every native
        // record, payout and streak consumer receives the same canonical case.
        self.result = result?.lowercased()
        self.odds = odds
        self.final_score = final_score
        self.season_type = season_type
        self.away_score = away_score
        self.home_score = home_score
        self.away_team = away_team
        self.home_team = home_team
    }

    /// Applied only by the game_results readers. Both canonical writers store
    /// away-home text aligned to the matchup; NFL history has a separate contract.
    /// This provenance is never decoded from an arbitrary result payload.
    func withGameResultsScoreOrder() -> GameResult {
        var row = self
        if effectiveLeague != "NFL" { row.scoreSource = .gameResultsAwayHome }
        return row
    }

    /// Named numeric columns take priority. Only the reviewed game_results
    /// writer contract may supply their absence; bare NFL/unknown text cannot.
    var teamScores: (away: String, home: String, a: Int, h: Int)? {
        let a: Int, h: Int
        if let away = away_score, let home = home_score {
            a = away; h = home
        } else if away_score == nil, home_score == nil, scoreSource == .gameResultsAwayHome {
            let parts = (final_score ?? "").components(separatedBy: CharacterSet(charactersIn: "-–"))
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            guard parts.count == 2, let away = Int(parts[0]), let home = Int(parts[1]) else { return nil }
            a = away; h = home
        } else { return nil }
        guard a >= 0, h >= 0 else { return nil }
        let teams = (matchup ?? "").components(separatedBy: " @ ")
        let away = away_team?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let home = home_team?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !away.isEmpty, !home.isEmpty { return (away, home, a, h) }
        guard teams.count == 2 else { return nil }
        let matchupAway = teams[0].trimmingCharacters(in: .whitespacesAndNewlines)
        let matchupHome = teams[1].trimmingCharacters(in: .whitespacesAndNewlines)
        guard !matchupAway.isEmpty, !matchupHome.isEmpty else { return nil }
        return (matchupAway, matchupHome, a, h)
    }

    /// Preseason football never counts in any Gary record (founder law,
    /// Aug 21 2026). The row itself stays graded and visible — only the
    /// record/net/streak math excludes it, via `[GameResult].countable`.
    var isPreseasonResult: Bool { season_type == 1 }
    
    /// Get the effective league (normalized to match Sport enum values)
    var effectiveLeague: String? {
        guard let raw = league, !raw.isEmpty else { return nil }
        let normalized = raw.lowercased()

        // Handle API sport keys like "basketball_nba" -> "NBA"
        if normalized.contains("nba") && !normalized.contains("wnba") { return "NBA" }
        if normalized.contains("nfl") { return "NFL" }
        if normalized.contains("ncaab") || normalized.contains("ncaam") { return "NCAAB" }
        if normalized.contains("ncaaf") { return "NCAAF" }
        if normalized.contains("world_cup") || normalized.contains("worldcup") || normalized == "wc" || normalized.contains("soccer_world_cup") { return "WC" }
        if normalized == "mlb hr" { return "MLB HR" }
        if normalized.contains("mlb") || normalized.contains("wbc") { return "MLB" }

        return raw.uppercased()
    }

    private static let oddsTailRegex = try? NSRegularExpression(pattern: "[+-]\\d{3,}\\s*$")

    /// The game_results table has no odds column — the line lives at the tail
    /// of pick_text ("Knicks ML +154"). Prefer the column if it ever appears,
    /// else extract from the pick text. Used for payout math AND display so
    /// both always agree.
    var effectiveOdds: String? {
        if let v = odds?.value, !v.trimmingCharacters(in: .whitespaces).isEmpty { return v }
        guard let text = pick_text,
              let regex = GameResult.oddsTailRegex,
              let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r = Range(m.range, in: text) else { return nil }
        return text[r].trimmingCharacters(in: .whitespaces)
    }
}

struct NFLResult: Decodable {
    let is_winners_pick: Bool?
    var isWinnersPick: Bool { is_winners_pick == true }
    let game_id: String?
    let game_date: String?
    let week_number: Int?
    let season: Int?
    let season_type: Int?
    let matchup: String?
    let pick_text: String?
    let result: String?
    let odds: StringOrNumber?
    let final_score: String?
    let home_score: Int?
    let away_score: Int?
    let home_team: String?
    let away_team: String?
    let pick_type: String?

    enum CodingKeys: String, CodingKey {
        case game_id, game_date, week_number, season, season_type, matchup, pick_text, result, odds, final_score
        case home_team, away_team, home_score, away_score, pick_type, is_winners_pick
    }

    /// Convert to GameResult for unified display
    func toGameResult() -> GameResult {
        GameResult(
            game_id: game_id,
            game_date: game_date,
            league: "NFL",
            matchup: matchup ?? "\(away_team ?? "") @ \(home_team ?? "")",
            pick_text: pick_text,
            result: result,
            odds: odds,
            final_score: final_score,
            season_type: season_type,
            away_score: away_score,
            home_score: home_score,
            away_team: away_team,
            home_team: home_team,
            is_winners_pick: is_winners_pick
        )
    }
}

extension Array where Element == GameResult {
    /// Rows that count toward Gary's records. Preseason football is graded
    /// and shown on its pick rows, but it never enters a record, net, form,
    /// or streak computation (founder law, Aug 21 2026).
    var countable: [GameResult] { filter { !$0.isPreseasonResult } }
}

struct PropResult: Decodable {
    var game_id: StringOrNumber? = nil
    let game_date: String?
    let matchup: String?
    let player_name: String?
    let pick_text: String?
    let prop_type: String?
    let bet: String?
    let line_value: StringOrNumber?
    let result: String?
    let odds: StringOrNumber?
    let actual_value: StringOrNumber?
    let confidence: Double?
    let league: String?
    let sport: String?
    /// Grader lane stamp ("HR" | "CORE") — newer rows only; isHRResult holds
    /// the fallback rule for the history that predates it.
    let lane: String?
    /// Stamped by the database when this exact prop ticket was on the Winners board.
    let is_winners_pick: Bool?
    var isWinnersPick: Bool { is_winners_pick == true }

    enum CodingKeys: String, CodingKey {
        case game_id, game_date, matchup, player_name, pick_text, prop_type, bet
        case line_value, result, odds, actual_value, confidence, league, sport, lane, is_winners_pick
    }
    
    /// Get the effective league (normalized to match Sport enum values)
    var effectiveLeague: String? {
        // First try to get from league or sport field
        let raw = (league?.isEmpty == false ? league : sport) ?? ""
        if !raw.isEmpty {
            let normalized = raw.lowercased()
            if normalized.contains("nba") && !normalized.contains("wnba") { return "NBA" }
            if normalized.contains("nfl") { return "NFL" }
            if normalized.contains("ncaab") || normalized.contains("ncaam") { return "NCAAB" }
            if normalized.contains("ncaaf") { return "NCAAF" }
            if normalized.contains("world_cup") || normalized.contains("worldcup") || normalized == "wc" || normalized.contains("soccer_world_cup") { return "WC" }
            if normalized == "mlb hr" { return "MLB HR" }
            if normalized.contains("mlb") || normalized.contains("wbc") { return "MLB" }
            return raw.uppercased()
        }
        
        // Infer sport from prop_type if no explicit sport/league field
        guard let propType = prop_type?.lowercased() else { return nil }
        
        // NBA props
        if ["points", "rebounds", "assists", "steals", "blocks", "threes", "three_pointers", 
            "pts", "reb", "ast", "stl", "blk", "pts_rebs_asts", "fantasy_score"].contains(where: { propType.contains($0) }) {
            return "NBA"
        }
        
        // NFL props
        if ["pass_yds", "rush_yds", "rec_yds", "pass_tds", "rush_tds", "rec_tds", "receptions",
            "passing", "rushing", "receiving", "completions", "interceptions", "tackles", "sacks"].contains(where: { propType.contains($0) }) {
            return "NFL"
        }
        
        
        // MLB props
        if ["hits", "total_bases", "home_runs", "rbis", "runs", "strikeouts", "walks",
            "stolen_bases", "pitching", "earned_runs", "innings"].contains(where: { propType.contains($0) }) {
            return "MLB"
        }
        
        
        return nil
    }
    
    /// Whether this is a touchdown-scorer result from the TD lane. The grader's
    /// lane stamp decides (Sep 24 2026): "TD" is the retired pick-two-touchdowns
    /// lane and last season's scorer cards; "CORE" is a touchdown Gary picked as
    /// a prop, which counts like any other prop. Unstamped rows read the market.
    var isTDResult: Bool {
        if let lane, !lane.isEmpty { return lane.uppercased() == "TD" }
        let propLower = (prop_type ?? "").lowercased()
        let pickLower = (pick_text ?? "").lowercased()
        let propAnytimeTD = propLower.contains("anytime")
            && (propLower.contains("td") || propLower.contains("touchdown"))
        let pickAnytimeTD = pickLower.contains("anytime")
            && (pickLower.contains("td") || pickLower.contains("touchdown"))
        return propAnytimeTD ||
               pickAnytimeTD ||
               propLower == "anytime_td" ||
               propLower == "td_scorer" ||
               propLower == "touchdown_scorer"
    }

    /// The dedicated Billfold `NFL TDs` chip is NFL-only.
    var isNFLTDResult: Bool {
        effectiveLeague == "NFL" && isTDResult
    }

    /// Outside every props record and every league list (founder, Sep 24 2026:
    /// only a touchdown Gary picks as a prop on the Picks page counts — never
    /// the touchdown lane, college included). NFL lane rows still show under
    /// the NFL TDs chip.
    var isTDLaneResult: Bool {
        isNFLTDResult || (lane?.uppercased() == "TD")
    }

    /// Whether this is a home-run bet (the fun lane — founder, Jul 29: tracked
    /// on its own Billfold chip + longshot tracker, never part of the official
    /// props record). The grader's lane stamp wins; prop_type is the fallback
    /// because older rows lack the stamp (and grader rows can lack a sport column).
    /// The fun lane. The fallback reads the BATTER'S market: a pitcher's
    /// "pitcher_home_runs" is home runs ALLOWED — an ordinary core prop — and
    /// a substring match would quietly drop it from the record it belongs in.
    var isHRResult: Bool {
        if let lane, !lane.isEmpty { return lane.uppercased() == "HR" }
        let type = (prop_type ?? "").lowercased().trimmingCharacters(in: .whitespaces)
        if type.hasPrefix("pitcher") { return false }
        return type == "home_runs" || type == "home_run" || type == "home runs"
    }
}

/// Helper to decode values that could be String or Number in JSON
struct StringOrNumber: Decodable {
    let value: String
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let int = try? container.decode(Int.self) {
            value = String(int)
        } else if let double = try? container.decode(Double.self) {
            value = String(double)
        } else {
            value = ""
        }
    }
}

