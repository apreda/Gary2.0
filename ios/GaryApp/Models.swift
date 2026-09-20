import Foundation
import CoreFoundation

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
