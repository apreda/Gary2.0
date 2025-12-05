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
    
    var id: String { pick_id ?? UUID().uuidString }
    
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
            trapAlert: dict["trapAlert"] as? Bool
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
    
    var id: String {
        "\(team ?? player ?? "prop")-\(prop ?? "")-\(odds ?? "")"
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
            league: dict["league"] as? String
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
    
    enum CodingKeys: String, CodingKey {
        case game_date, matchup, player_name, pick_text, prop_type, bet
        case line_value, result, odds, actual_value, confidence
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
