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
        GaryPick(
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
            commence_time: dict["commence_time"] as? String
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
