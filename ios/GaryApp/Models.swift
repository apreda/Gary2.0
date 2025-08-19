import Foundation

struct DailyPicksRow: Decodable {
    let date: String
    let picks: PicksValue?

    enum PicksValue: Decodable {
        case array([GaryPick])
        case string(String)
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let arr = try? c.decode([GaryPick].self) {
                self = .array(arr)
            } else if let str = try? c.decode(String.self) {
                self = .string(str)
            } else {
                self = .string("[]")
            }
        }
    }

    var picksArray: [GaryPick]? { if case let .array(a) = picks { a } else { nil } }
    var picksString: String? { if case let .string(s) = picks { s } else { nil } }
}

struct PropPicksRow: Decodable {
    let date: String
    let picks: PicksValue?

    enum PicksValue: Decodable {
        case array([PropPick])
        case string(String)
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let arr = try? c.decode([PropPick].self) {
                self = .array(arr)
            } else if let str = try? c.decode(String.self) {
                self = .string(str)
            } else {
                self = .string("[]")
            }
        }
    }

    var picksArray: [PropPick]? { if case let .array(a) = picks { a } else { nil } }
    var picksString: String? { if case let .string(s) = picks { s } else { nil } }
}

struct GaryPick: Identifiable, Codable {
    var id: String { pick_id ?? UUID().uuidString }
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
    var id: String { "\(team ?? player ?? "prop")-\(prop ?? "")-\(odds ?? "")" }
    let player: String?
    let team: String?
    let prop: String?
    let bet: String?
    let odds: String?
    let confidence: Double?
    let analysis: String?

    static func from(dict: [String: Any]) -> PropPick? {
        PropPick(
            player: dict["player"] as? String,
            team: dict["team"] as? String,
            prop: dict["prop"] as? String,
            bet: dict["bet"] as? String,
            odds: (dict["odds"] as? String) ?? (dict["odds"] as? NSNumber).map { $0.stringValue },
            confidence: (dict["confidence"] as? NSNumber)?.doubleValue,
            analysis: dict["analysis"] as? String
        )
    }
}


