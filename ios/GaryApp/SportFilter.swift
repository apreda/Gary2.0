// Sport identities, including historical result decoding.

import SwiftUI

// MARK: - Sport Filter

enum Sport: String, CaseIterable {
    // Order: ALL → NBA → NFL → NFL TDs → NHL → NCAAB → NCAAF → EPL → MLB → MLB HR → WNBA
    case all = "ALL"
    case nba = "NBA"
    case nfl = "NFL"
    case nflTDs = "NFL TDs"
    case ncaab = "NCAAB"
    case ncaaf = "NCAAF"
    case mlb = "MLB"
    case mlbHR = "MLB HR"
    case worldCup = "WC"

    var icon: String {
        switch self {
        case .all: return "star.fill"
        case .nba: return "basketball.fill"
        case .nfl: return "football.fill"
        case .nflTDs: return "football.fill"
        case .ncaab: return "basketball.fill"
        case .ncaaf: return "football.fill"
        case .mlb: return "baseball.fill"
        case .mlbHR: return "baseball.fill"
        case .worldCup: return "trophy.fill"
        }
    }

    var accentColor: Color {
        switch self {
        case .all: return GaryColors.gold
        case .nba: return Color(hex: "#3B82F6")      // Blue
        case .nfl: return GaryColors.nflAccent        // NFL cobalt
        case .nflTDs: return GaryColors.nflAccent     // Same NFL identity
        case .ncaab: return Color(hex: "#F97316")    // Orange
        case .ncaaf: return Color(hex: "#DC2626")    // Red
        case .mlb: return Color(hex: "#63D17E")      // Clean light green (the MLB label colour)
        case .mlbHR: return Color(hex: "#2D5A27")    // Outfield grass green (same as MLB)
        case .worldCup: return Color(hex: "#14B8A6") // World Cup teal — field green belongs to MLB
        }
    }
    

    
    /// Whether this is a props-only filter (not for regular picks)
    var isPropsOnly: Bool {
        switch self {
        case .nflTDs, .mlbHR: return true
        default: return false
        }
    }
    
    static func from(league: String?) -> Sport {
        guard let league = league?.uppercased() else { return .all }
        return Sport(rawValue: league) ?? .all
    }
}
