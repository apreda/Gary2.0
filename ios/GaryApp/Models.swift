import Foundation

// MARK: - Generic Picks Value Decoder
// Handles both JSON array and stringified JSON from Supabase

enum PicksValue<T: Decodable>: Decodable {
    case array([T])
    case string(String)
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let arr = try? container.decode([T].self) {
            self = .array(arr)
        } else if let str = try? container.decode(String.self) {
            self = .string(str)
        } else {
            self = .string("[]")
        }
    }
    
    var asArray: [T]? {
        if case let .array(arr) = self { return arr }
        return nil
    }
    
    var asString: String? {
        if case let .string(str) = self { return str }
        return nil
    }
}

// MARK: - Database Row Models

struct DailyPicksRow: Decodable {
    let date: String
    let picks: PicksValue<GaryPick>?
}

struct PropPicksRow: Decodable {
    let date: String
    let picks: PicksValue<PropPick>?
}

struct WeeklyNFLPicksRow: Decodable {
    let week_start: String
    let week_number: Int?
    let season: Int?
    let picks: PicksValue<GaryPick>?
}

// MARK: - Pick Models

struct GaryPick: Identifiable, Codable {
    let pick_id: String?
    let pick: String?
    let rationale: String?
    let league: String?
    let confidence: Double?
    let time: String?
    let homeTeam: String?
    let awayTeam: String?
    let type: String?
    let trapAlert: Bool?
    let commence_time: String?  // ISO format: "2025-12-07T18:00:00Z"
    let statsData: [StatData]?
    let statsUsed: [String]?
    let injuries: TeamInjuries?
    
    var id: String { pick_id ?? UUID().uuidString }
    
    /// Get display time - prefer commence_time, fallback to time
    var displayTime: String? {
        if let ct = commence_time, !ct.isEmpty {
            return ct
        }
        return time
    }
    
    /// Parse from dictionary (for manual JSON parsing)
    static func from(dict: [String: Any]) -> GaryPick? {
        // Parse statsData
        var statsDataArray: [StatData]? = nil
        if let statsDataRaw = dict["statsData"] as? [[String: Any]] {
            statsDataArray = statsDataRaw.compactMap { StatData.from(dict: $0) }
        }
        
        // Parse injuries
        var injuriesData: TeamInjuries? = nil
        if let injuriesRaw = dict["injuries"] as? [String: Any] {
            injuriesData = TeamInjuries.from(dict: injuriesRaw)
        }
        
        return GaryPick(
            pick_id: dict["pick_id"] as? String,
            pick: dict["pick"] as? String,
            rationale: dict["rationale"] as? String,
            league: dict["league"] as? String,
            confidence: (dict["confidence"] as? NSNumber)?.doubleValue,
            time: dict["time"] as? String,
            homeTeam: dict["homeTeam"] as? String,
            awayTeam: dict["awayTeam"] as? String,
            type: dict["type"] as? String,
            trapAlert: dict["trapAlert"] as? Bool,
            commence_time: dict["commence_time"] as? String,
            statsData: statsDataArray,
            statsUsed: dict["statsUsed"] as? [String],
            injuries: injuriesData
        )
    }
}

// MARK: - Stats Data Models

struct StatData: Codable {
    let name: String?
    let token: String?
    let home: StatValues?
    let away: StatValues?
    
    static func from(dict: [String: Any]) -> StatData? {
        let homeDict = dict["home"] as? [String: Any]
        let awayDict = dict["away"] as? [String: Any]
        
        return StatData(
            name: dict["name"] as? String,
            token: dict["token"] as? String,
            home: homeDict != nil ? StatValues.from(dict: homeDict!) : nil,
            away: awayDict != nil ? StatValues.from(dict: awayDict!) : nil
        )
    }
}

struct StatValues: Codable {
    let team: String?
    let overall: String?
    let homeRecord: String?
    let awayRecord: String?
    let offensiveRating: String?
    let defensiveRating: String?
    let netRating: String?
    let pace: String?
    let efgPct: String?
    let threePct: String?
    let threeMadePerGame: String?
    let tovRate: String?
    let turnoversPerGame: String?
    let orebRate: String?
    let orebPerGame: String?
    let ftRate: String?
    let ftPct: String?
    let ftaPerGame: String?
    let closeGames: Int?
    let closeRecord: String?
    let closeWinPct: String?
    let trueShootingPct: String?
    
    static func from(dict: [String: Any]) -> StatValues {
        StatValues(
            team: dict["team"] as? String,
            overall: dict["overall"] as? String,
            homeRecord: dict["home_record"] as? String,
            awayRecord: dict["away_record"] as? String,
            offensiveRating: dict["offensive_rating"] as? String,
            defensiveRating: dict["defensive_rating"] as? String,
            netRating: dict["net_rating"] as? String,
            pace: dict["pace"] as? String,
            efgPct: dict["efg_pct"] as? String,
            threePct: dict["three_pct"] as? String,
            threeMadePerGame: dict["three_made_per_game"] as? String,
            tovRate: dict["tov_rate"] as? String,
            turnoversPerGame: dict["turnovers_per_game"] as? String,
            orebRate: dict["oreb_rate"] as? String,
            orebPerGame: dict["oreb_per_game"] as? String,
            ftRate: dict["ft_rate"] as? String,
            ftPct: dict["ft_pct"] as? String,
            ftaPerGame: dict["fta_per_game"] as? String,
            closeGames: dict["close_games"] as? Int,
            closeRecord: dict["close_record"] as? String,
            closeWinPct: dict["close_win_pct"] as? String,
            trueShootingPct: dict["true_shooting_pct"] as? String
        )
    }
    
    /// Get the primary display value for this stat based on the token
    func getValue(for token: String) -> String {
        switch token {
        case "OFFENSIVE_RATING": return offensiveRating ?? "N/A"
        case "DEFENSIVE_RATING": return defensiveRating ?? "N/A"
        case "NET_RATING", "EFFICIENCY_LAST_10": return netRating ?? "N/A"
        case "PACE": return pace ?? "N/A"
        case "PACE_HOME_AWAY", "HOME_AWAY_SPLITS": return overall ?? "N/A"
        case "EFG_PCT": return efgPct ?? "N/A"
        case "THREE_PT_SHOOTING": return threePct ?? "N/A"
        case "TURNOVER_RATE": return tovRate ?? turnoversPerGame ?? "N/A"
        case "OREB_RATE": return orebRate ?? orebPerGame ?? "N/A"
        case "FT_RATE": return ftRate ?? "N/A"
        case "CLUTCH_STATS": return closeRecord ?? "N/A"
        default: return offensiveRating ?? defensiveRating ?? netRating ?? overall ?? "N/A"
        }
    }
}

// MARK: - Injuries Models

struct TeamInjuries: Codable {
    let home: [PlayerInjury]?
    let away: [PlayerInjury]?
    
    static func from(dict: [String: Any]) -> TeamInjuries {
        let homeRaw = dict["home"] as? [[String: Any]] ?? []
        let awayRaw = dict["away"] as? [[String: Any]] ?? []
        
        return TeamInjuries(
            home: homeRaw.compactMap { PlayerInjury.from(dict: $0) },
            away: awayRaw.compactMap { PlayerInjury.from(dict: $0) }
        )
    }
}

struct PlayerInjury: Codable {
    let name: String?
    let status: String?
    let description: String?
    
    static func from(dict: [String: Any]) -> PlayerInjury {
        PlayerInjury(
            name: dict["name"] as? String,
            status: dict["status"] as? String,
            description: dict["description"] as? String
        )
    }
}

struct PropPick: Identifiable, Codable {
    let player: String?
    let team: String?
    let prop: String?
    let bet: String?
    let odds: String?
    let confidence: Double?
    let analysis: String?
    let league: String?
    let sport: String?  // Web app uses "sport" field
    let line: String?
    let time: String?
    
    var id: String {
        "\(team ?? player ?? "prop")-\(prop ?? "")-\(odds ?? "")"
    }
    
    /// Get the sport/league (checks both fields)
    var effectiveLeague: String? {
        league ?? sport
    }
    
    /// Parse from dictionary (for manual JSON parsing)
    static func from(dict: [String: Any]) -> PropPick? {
        PropPick(
            player: dict["player"] as? String,
            team: dict["team"] as? String,
            prop: dict["prop"] as? String,
            bet: dict["bet"] as? String,
            odds: (dict["odds"] as? String) ?? (dict["odds"] as? NSNumber)?.stringValue,
            confidence: (dict["confidence"] as? NSNumber)?.doubleValue,
            analysis: (dict["analysis"] as? String) ?? (dict["rationale"] as? String),
            league: dict["league"] as? String,
            sport: dict["sport"] as? String,
            line: dict["line"] as? String,
            time: dict["time"] as? String
        )
    }
}

// MARK: - Billfold (Results) Models

struct GameResult: Decodable {
    let game_date: String?
    let league: String?
    let matchup: String?
    let pick_text: String?
    let result: String?
    let odds: StringOrNumber?
    let final_score: String?
    
    enum CodingKeys: String, CodingKey {
        case game_date, league, matchup, pick_text, result, odds, final_score
    }
    
    /// Memberwise initializer for creating from NFLResult
    init(game_date: String?, league: String?, matchup: String?, pick_text: String?, result: String?, odds: StringOrNumber?, final_score: String?) {
        self.game_date = game_date
        self.league = league
        self.matchup = matchup
        self.pick_text = pick_text
        self.result = result
        self.odds = odds
        self.final_score = final_score
    }
}

struct NFLResult: Decodable {
    let game_date: String?
    let week_number: Int?
    let season: Int?
    let matchup: String?
    let pick_text: String?
    let result: String?
    let odds: StringOrNumber?
    let final_score: String?
    let home_team: String?
    let away_team: String?
    let pick_type: String?
    
    enum CodingKeys: String, CodingKey {
        case game_date, week_number, season, matchup, pick_text, result, odds, final_score
        case home_team, away_team, pick_type
    }
    
    /// Convert to GameResult for unified display
    func toGameResult() -> GameResult {
        GameResult(
            game_date: game_date,
            league: "NFL",
            matchup: matchup ?? "\(away_team ?? "") @ \(home_team ?? "")",
            pick_text: pick_text,
            result: result,
            odds: odds,
            final_score: final_score
        )
    }
}

struct PropResult: Decodable {
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
    
    enum CodingKeys: String, CodingKey {
        case game_date, matchup, player_name, pick_text, prop_type, bet
        case line_value, result, odds, actual_value, confidence, league, sport
    }
    
    /// Get the effective league (checks both league and sport fields)
    var effectiveLeague: String? {
        league ?? sport
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
