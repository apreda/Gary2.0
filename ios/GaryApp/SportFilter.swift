// SportFilter.swift — Sport enum + Sport Filter Bar.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Sport Filter

enum Sport: String, CaseIterable {
    // Order: ALL → NBA → NFL → NFL TDs → NHL → NCAAB → NCAAF → EPL → MLB → MLB HR → WNBA
    case all = "ALL"
    case nba = "NBA"
    case nfl = "NFL"
    case nflTDs = "NFL TDs"
    case nhl = "NHL"
    case ncaab = "NCAAB"
    case ncaaf = "NCAAF"
    case epl = "EPL"
    case mlb = "MLB"
    case mlbHR = "MLB HR"
    case wnba = "WNBA"
    case worldCup = "WC"

    var icon: String {
        switch self {
        case .all: return "star.fill"
        case .nba: return "basketball.fill"
        case .nfl: return "football.fill"
        case .nflTDs: return "football.fill"
        case .nhl: return "hockey.puck.fill"
        case .ncaab: return "basketball.fill"
        case .ncaaf: return "football.fill"
        case .epl: return "soccerball"
        case .mlb: return "baseball.fill"
        case .mlbHR: return "baseball.fill"
        case .wnba: return "basketball.fill"
        case .worldCup: return "trophy.fill"
        }
    }

    var accentColor: Color {
        switch self {
        case .all: return GaryColors.gold
        case .nba: return Color(hex: "#3B82F6")      // Blue
        case .nfl: return GaryColors.nflAccent        // NFL cobalt
        case .nflTDs: return GaryColors.nflAccent     // Same NFL identity
        case .nhl: return Color(hex: "#00A3E0")      // Ice Blue
        case .ncaab: return Color(hex: "#F97316")    // Orange
        case .ncaaf: return Color(hex: "#DC2626")    // Red
        case .epl: return Color(hex: "#8B5CF6")      // Purple
        case .mlb: return Color(hex: "#63D17E")      // Clean light green (the MLB label colour)
        case .mlbHR: return Color(hex: "#2D5A27")    // Outfield grass green (same as MLB)
        case .wnba: return Color(hex: "#F97316")     // Orange
        case .worldCup: return Color(hex: "#14B8A6") // World Cup teal — field green belongs to MLB
        }
    }
    
    /// Optional gradient for sport border (international/multi-color themes)
    var accentGradient: LinearGradient? {
        switch self {
        case .mlb, .mlbHR:
            // Baseball field colors: grass green, dirt brown, white
            return LinearGradient(
                colors: [
                    Color(hex: "#2D5A27"),  // Outfield grass green
                    Color(hex: "#8B6914"),  // Infield dirt brown
                    Color(hex: "#F5F5F5"),  // Base white
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .worldCup:
            // 2026 tri-host colors: Mexico green, white, host red, USA blue
            return LinearGradient(
                colors: [
                    Color(hex: "#1FA84F"),  // Mexico green
                    Color(hex: "#F5F5F5"),  // White
                    Color(hex: "#D7282F"),  // Canada/USA red
                    Color(hex: "#1D4ED8"),  // USA blue
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        default: return nil
        }
    }

    /// Whether this sport is in beta (limited data/analytics)
    var isBeta: Bool {
        switch self {
        case .epl, .worldCup: return true
        default: return false
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

// MARK: - Sport Filter Bar

struct SportFilterBar: View {
    @Binding var selected: Sport
    let availableSports: Set<String>
    var todaySports: Set<String> = []  // Sports with picks TODAY — sorted closest to "All"
    var showAll: Bool = true  // Whether to show the ALL option
    var showPropsOnly: Bool = false  // Whether to show props-only filters (like NFL TDs)

    // Sort: ALL → sports with today's picks → sports with yesterday data → unavailable (faded)
    private var sortedSports: [Sport] {
        Sport.allCases.sorted { a, b in
            if a == .all { return true }
            if b == .all { return false }

            let aToday = todaySports.contains(a.rawValue)
            let bToday = todaySports.contains(b.rawValue)
            if aToday && !bToday { return true }
            if !aToday && bToday { return false }

            let aAvailable = availableSports.contains(a.rawValue)
            let bAvailable = availableSports.contains(b.rawValue)
            if aAvailable && !bAvailable { return true }
            if !aAvailable && bAvailable { return false }

            return (Sport.allCases.firstIndex(of: a) ?? 0) < (Sport.allCases.firstIndex(of: b) ?? 0)
        }
    }
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(sortedSports, id: \.self) { sport in
                    // Skip ALL if showAll is false
                    // Skip props-only sports (like NFL TDs) unless showPropsOnly is true
                    let shouldShow = {
                        if sport == .all && !showAll { return false }
                        if sport.isPropsOnly && !showPropsOnly { return false }
                        return true
                    }()
                    
                    if shouldShow {
                        let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                        let isSelected = selected == sport
                        
                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                selected = sport
                            }
                        } label: {
                            VStack(spacing: 4) {
                                HStack(spacing: 4) {
                                    Image(systemName: sport.icon)
                                        .font(.system(size: 9, weight: .semibold))
                                    Text(sport.rawValue)
                                        .font(.system(size: 11.5, weight: isSelected ? .bold : .medium))
                                }
                                .foregroundStyle(
                                    isSelected ? .white :
                                    isAvailable ? .white.opacity(0.4) :
                                    .white.opacity(0.15)
                                )
                                .padding(.horizontal, 6)

                                RoundedRectangle(cornerRadius: 1)
                                    .fill(isSelected ? sport.accentColor : .clear)
                                    .frame(height: 1.75)
                            }
                        }
                        .disabled(!isAvailable)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        .frame(height: 36)
    }
}
