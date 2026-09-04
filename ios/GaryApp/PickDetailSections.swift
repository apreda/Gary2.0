// PickDetailSections.swift — Result rows, sheets, Tale of the Tape, Gary's Take, analysis models, web container, shape helpers, formatters.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Result Rows




// MARK: - Sheets


// MARK: - Tale of the Tape Section
struct TaleOfTapeSection: View {
    let homeTeam: String
    let awayTeam: String
    let statsData: [StatData]
    let injuries: TeamInjuries?
    let garyPickedHome: Bool  // True if Gary picked the home team
    
    @State private var isExpanded: Bool = false
    private let maxCollapsedStats = 8  // Show only first 8 stats when collapsed
    
    private let greenAccent = Color(hex: "#4ade80")
    
    // MARK: - Injury Helper Functions (extracted to fix type-checking)
    
    /// Abbreviate injury status
    private func statusAbbrev(_ status: String?) -> String {
        guard let s = status?.lowercased() else { return "" }
        if s.contains("out") { return "OUT" }
        if s.contains("injured reserve") || s == "ir" || s.contains("ltir") { return "IR" }
        if s.contains("doubtful") { return "D" }
        if s.contains("questionable") { return "Q" }
        if s.contains("probable") { return "P" }
        if s.contains("day-to-day") || s.contains("dtd") { return "DTD" }
        return ""
    }
    
    /// Get status color (red for OUT/IR/D, orange for Q/DTD)
    private func statusColor(_ abbrev: String) -> Color {
        switch abbrev {
        case "OUT", "IR", "D": return .red.opacity(0.9)
        case "Q", "DTD", "P": return .orange.opacity(0.9)
        default: return .red.opacity(0.9)
        }
    }
    
    /// Validate injury name (filter out corrupt entries)
    private func isValidInjuryName(_ name: String?) -> Bool {
        guard let n = name, n.count >= 4 else { return false }
        let lower = n.lowercased()
        // Reject names that are clearly parsing errors
        if n.contains("\n") || n.contains("\r") { return false }
        if lower.hasPrefix("day") || lower.hasPrefix("out") || lower.hasPrefix("questionable") { return false }
        // Reject concatenated garbage (e.g., "Tari EasonFStatusOut Eason")
        if lower.contains("fstatus") || lower.contains("statusout") || lower.contains("status") { return false }
        // Reject names that are too long (likely concatenation errors)
        if n.count > 35 { return false }
        return true
    }
    
    /// Sort priority for injury status
    private func sortPriority(_ abbrev: String) -> Int {
        switch abbrev {
        case "OUT": return 0
        case "IR": return 1
        case "D": return 2
        case "Q": return 3
        case "DTD": return 4
        case "P": return 5
        default: return 6
        }
    }
    
    /// Left side is always Gary's pick
    private var leftTeam: String { garyPickedHome ? homeTeam : awayTeam }
    private var rightTeam: String { garyPickedHome ? awayTeam : homeTeam }
    
    /// Filter valid stats that can be displayed
    private var validStats: [(offset: Int, element: StatData)] {
        let skipTokens = ["TOP_PLAYERS", "REST_SITUATION", "FIELD_POSITION", "MOTIVATION_CONTEXT", "QB_NAME", "CAREER_RECORD", "ASSESSMENT", "CAREER_GAMES_IN_CONDITION", "TEMPERATURE", "FEELS_LIKE", "WIND_SPEED", "CONDITIONS", "IMPACT"]
        return statsData.enumerated().filter { (_, stat) in
            guard let token = stat.token,
                  let home = stat.home,
                  let away = stat.away else { return false }
            let homeVal = home.getValue(for: token)
            let awayVal = away.getValue(for: token)
            return !skipTokens.contains(token) && homeVal != "N/A" && awayVal != "N/A" && !homeVal.isEmpty && !awayVal.isEmpty
        }.map { ($0.offset, $0.element) }
    }
    
    private var displayedStats: [(offset: Int, element: StatData)] {
        isExpanded ? validStats : Array(validStats.prefix(maxCollapsedStats))
    }
    
    private var hasMoreStats: Bool {
        validStats.count > maxCollapsedStats
    }
    
    /// Map tokens to display names
    private func displayName(for token: String) -> String {
        let map: [String: String] = [
            // NCAAB Barttorvik Tale of Tape
            "ADJOE": "AdjOE",
            "ADJDE": "AdjDE",
            "ADJEM": "AdjEM",
            "TEMPO": "Tempo",
            "T_RANK": "T-Rank",
            "BARTHAG": "Barthag",
            "WAB": "WAB",
            "L5_FORM": "L5 Form",
            "L10_FORM": "L10 Form",
            "RECORD": "Record",
            "CONF_RECORD": "Conf Record",
            // NBA verified Tale of Tape
            "OFF_RATING": "Off Rating",
            "DEF_RATING": "Def Rating",
            "TS_PCT": "TS%",
            "EFG_PCT": "eFG%",
            "RPG": "Reb/Game",
            "APG": "Ast/Game",
            "PPG": "Pts/Game",
            "3PT_PCT": "3PT%",
            "FG_PCT": "FG%",
            "FT_PCT": "FT%",
            "TOV_GM": "TOV/Game",
            "OREB_GM": "Off Reb/G",
            "DREB_GM": "Def Reb/G",
            // NBA/NCAAB stats (legacy toolCallHistory tokens)
            "OFFENSIVE_RATING": "Off Rating",
            "DEFENSIVE_RATING": "Def Rating",
            "NET_RATING": "Net Rating",
            "EFFICIENCY_LAST_10": "Net Rating",
            "ADJ_EFFICIENCY_MARGIN": "Net Rating",
            "SP_PLUS_RATINGS": "Net Rating",
            "PACE_HOME_AWAY": "Record",
            "HOME_AWAY_SPLITS": "Record",
            "OPP_EFG_PCT": "Opp eFG%",
            "THREE_PT_SHOOTING": "3PT%",
            "THREE_PCT": "3PT%",
            "THREE_MADE_PER_GAME": "3PM/G",
            "THREE_ATTEMPTED_PER_GAME": "3PA/G",
            "TURNOVER_RATE": "TOV/Game",
            "TOV_RATE": "TOV Rate",
            "TURNOVERS_PER_GAME": "TOV/Game",
            "OREB_RATE": "Off Reb/G",
            "OREB_PER_GAME": "Off Reb/G",
            "FT_RATE": "FT Rate",
            "FTA_PER_GAME": "FTA/Game",
            "CLUTCH_STATS": "Close Games",
            "CLOSE_RECORD": "Close Record",
            "CLOSE_WIN_PCT": "Close Win %",
            "CLOSE_GAMES": "Close Games",
            "TRUE_SHOOTING_PCT": "TS%",
            "OVERALL": "Record",
            "HOME_RECORD": "Home",
            "AWAY_RECORD": "Away",
            "GAMES_PLAYED": "Games",
            "PAINT_SCORING": "Paint Pts",
            "PAINT_DEFENSE": "Opp Paint Pts",
            "TRANSITION_DEFENSE": "Trans Def",
            "RECENT_FORM": "Last 5",
            "PERIMETER_DEFENSE": "3PT Def",
            // NFL/NCAAF stats
            "OFFENSIVE_EPA": "Total YPG",
            "DEFENSIVE_EPA": "Opp Yards",
            "SUCCESS_RATE_OFFENSE": "Yards/Game",
            "SUCCESS_RATE_DEFENSE": "Yards Allowed",
            "SUCCESS_RATE": "Total YPG",
            "EPA_LAST_5": "Recent PPG",
            "EARLY_DOWN_SUCCESS": "Scoring Eff",
            "QB_STATS": "QB Rating",
            "PRESSURE_RATE": "Comp %",
            "RED_ZONE_OFFENSE": "3rd Down %",
            "RED_ZONE_DEFENSE": "Opp 3rd Down %",
            "THIRD_DOWN": "3rd Down %",
            "FOURTH_DOWN": "4th Down %",
            "TURNOVER_MARGIN": "Turnover +/-",
            "OL_RANKINGS": "Rush YPG",
            "DL_RANKINGS": "Opp Rush",
            "RB_STATS": "Yards/Carry",
            "EXPLOSIVE_PLAYS": "Total Yards",
            "EXPLOSIVE_ALLOWED": "Yards Allowed",
            "WR_TE_STATS": "Pass Yards",
            "DEFENSIVE_PLAYMAKERS": "Pts Allowed",
            "SPECIAL_TEAMS": "Record",
            "EXPLOSIVENESS": "Yds/Play",
            "HAVOC_RATE": "Sacks",
            "HAVOC_ALLOWED": "Opp Havoc",
            "PASSING_TDS": "Pass TDs",
            "INTERCEPTIONS": "INTs",
            "RUSHING_TDS": "Rush TDs",
            "RED_ZONE": "3rd Down %",
            "WR_STATS": "Recv YPG",
            "DEFENSIVE_STARS": "Def PPG",
            "SPECIAL_TEAMS_RATING": "Record",
            "TALENT_COMPOSITE": "Talent",
            "FIELD_POSITION": "Yards/G",
            // NEW: Individual NFL stat tokens (flattened)
            "POINTS_PER_GAME": "Points/Game",
            "POINTS_GM": "Points/Game",
            "YARDS_PER_GAME": "Yards/Game",
            "YPG": "Yards/Game",
            "TOTAL_YARDS_PER_GAME": "Total YPG",
            "YARDS_PER_PLAY": "Yards/Play",
            "OPP_POINTS_PER_GAME": "Opp PPG",
            "OPP_PTS_GM": "Opp PPG",
            "OPP_PPG": "Opp PPG",
            "OPP_YARDS_PER_GAME": "Opp Yards",
            "OPP_YPG": "Opp Yards",
            "POINT_DIFF": "Point Diff",
            "THIRD_DOWN_PCT": "3rd Down %",
            "FOURTH_DOWN_PCT": "4th Down %",
            "TURNOVER_DIFF": "Turnover +/-",
            "TAKEAWAYS": "Takeaways",
            "GIVEAWAYS": "Giveaways",
            "SACKS": "Sacks",
            "QB_RATING": "QB Rating",
            "COMPLETION_PCT": "Comp %",
            "YARDS_PER_ATTEMPT": "Yds/Att",
            "PASS_TDS": "Pass TDs",
            "INTS": "INTs",
            "RUSH_TDS": "Rush TDs",
            "RUSHING_YARDS_PER_GAME": "Rush YPG",
            "RUSH_YDS_GM": "Rush YPG",
            "RUSH_YPG": "Rush YPG",
            "PASS_YDS_GM": "Pass YPG",
            "YARDS_PER_CARRY": "Yds/Carry",
            "RECEIVING_YARDS_PER_GAME": "Recv YPG",
            "RECV_YPG": "Recv YPG",
            "RECEIVING_TDS": "Recv TDs",
            "RECV_TDS": "Recv TDs",
            "YARDS_PER_CATCH": "Yds/Catch",
            "LONGEST_PASS": "Long Pass",
            "LONGEST_RUSH": "Long Rush",
            "TEMPERATURE": "Temp",
            "FEELS_LIKE": "Feels Like",
            "WIND_SPEED": "Wind",
            "CONDITIONS": "Weather",
            "IMPACT": "Weather Impact",
            // NCAAB/NCAAF specific
            "SCORING": "PPG",
            "ASSISTS": "Assists/G",
            "REBOUNDS": "Reb/G",
            "STEALS": "Steals/G",
            "BLOCKS": "Blocks/G",
            // NCAAF BDL stats
            "NCAAF_TOTAL_OFFENSE": "Total YPG",
            "NCAAF_PASSING_OFFENSE": "Pass YPG",
            "NCAAF_RUSHING_OFFENSE": "Rush YPG",
            "NCAAF_SCORING": "Total TDs",
            "NCAAF_DEFENSE": "Def Yds",
            "NCAAF_TURNOVER_MARGIN": "INTs",
            "NCAAF_RED_ZONE_OFFENSE": "Red Zone",
            // NCAAB enriched
            "NCAAB_EFG_PCT": "eFG%",
            "NCAAB_TEMPO": "Tempo",
            "NCAAB_OFFENSIVE_RATING": "Off Rating",
            "NCAAB_AP_RANKING": "AP Rank",
            "NCAAB_COACHES_RANKING": "Coaches Rank",
            "NCAAB_CONFERENCE_RECORD": "Conf Record",
            "NCAAB_NET_RANKING": "NET Rank",
            "NCAAB_STRENGTH_OF_SCHEDULE": "SOS",
            "NCAAB_KENPOM_RATINGS": "KenPom Rank",
            // NCAAB Barttorvik ranking tokens
            "ADJOE_RANK": "AdjOE Rank",
            "ADJDE_RANK": "AdjDE Rank",
            "PROJ_RECORD": "Proj Record",
            // MLB verified Tale of Tape tokens
            "L10": "Last 10",
            "HOME_AWAY": "Home/Away",
            "POOL_RECORD": "Pool Record",
            "SP_ERA": "SP ERA",
            "SP_WHIP": "SP WHIP",
            "SP_K9": "SP K/9",
            "SP_BB9": "SP BB/9",
            "SP_RECORD": "SP W-L",
            "SP_IP": "SP Innings",
            "SP_SO": "SP Strikeouts",
            "TEAM_AVG": "Team AVG",
            "TEAM_OBP": "Team OBP",
            "TEAM_SLG": "Team SLG",
            "TEAM_OPS": "Team OPS",
            "TEAM_HR": "Career HR",
            "GAME1_RESULT": "Game 1",
            "SP_NAME": "Starter",
            "ML_ODDS": "Moneyline",
            "RUN_LINE": "Run Line",
            "VENUE": "Venue",
            "LAST_PLAYED": "Game 1",
            // NHL verified Tale of Tape tokens
            "GOALS_FOR_GM": "Goals/G",
            "GOALS_AGST_GM": "GA/G",
            "SHOTS_FOR_GM": "Shots/G",
            "PP_PCT": "PP%",
            "PK_PCT": "PK%",
            "FO_PCT": "FO%",
            "POWER_PLAY__": "PP%",
            "PENALTY_KILL__": "PK%",
            "FACEOFF_WIN__": "FO%",
            "CORSI_PCT": "Corsi%",
            "XG_PCT": "xG%",
            "SH_PCT_5V5": "SH% 5v5",
            "SV_PCT_5V5": "SV% 5v5",
            // NHL specific (from toolCallHistory)
            "GOALS_FOR": "Goals/G",
            "GOALS_AGAINST": "GA/G",
            "GOAL_DIFFERENTIAL": "Goal Diff",
            "POWER_PLAY_PCT": "PP%",
            "PENALTY_KILL_PCT": "PK%",
            "SHOTS_FOR": "Shots/G",
            "SHOTS_AGAINST": "SA/G",
            "SHOT_DIFFERENTIAL": "Shot Diff",
            "SHOT_QUALITY": "Shot Quality",
            "EXPECTED_GOALS": "xGoals",
            "CORSI_FOR_PCT": "Corsi%",
            "PDO": "PDO",
            "SAVE_PCT": "Save%",
            "GOALIE_STATS": "Goalie",
            "GOALIE_MATCHUP": "Goalie",
            "GOALS_AGAINST_AVG": "GAA",
            "FACEOFF_PCT": "FO%",
            "POSSESSION_METRICS": "Poss%",
            "HOME_ICE": "Home Ice",
            "REST_SITUATION": "Rest",
            "BACK_TO_BACK": "B2B",
            "HIGH_DANGER_CHANCES": "HD Chances",
            "TOP_SCORERS": "Top Scorers",
            "LINE_COMBINATIONS": "Lines"
        ]
        return map[token] ?? token.replacingOccurrences(of: "_", with: " ").capitalized
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section Header
            Text("TALE OF THE TAPE")
                .font(.caption.bold())
                .foregroundStyle(greenAccent)
                .tracking(1)
                .opacity(0.8)
            
            VStack(spacing: 0) {
                // Team Header Row - Gary's pick on left (green), opponent on right
                HStack {
                    Text(leftTeam)
                        .font(.subheadline.bold())
                        .foregroundStyle(greenAccent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(width: 90, alignment: .leading)
                    
                    Spacer()
                    
                    Text(rightTeam)
                        .font(.subheadline.bold())
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(width: 110, alignment: .trailing)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(Color(hex: "#1B1815"))
                
                // Stats Rows - Show first 8 stats, with expand button for more
                ForEach(Array(displayedStats.enumerated()), id: \.offset) { displayIndex, statTuple in
                    let stat = statTuple.element
                    if let token = stat.token,
                       let home = stat.home,
                       let away = stat.away {
                        let homeVal = home.getValue(for: token)
                        let awayVal = away.getValue(for: token)
                        
                        // Get values for display (Gary's pick on left)
                        let leftVal = garyPickedHome ? homeVal : awayVal
                        let rightVal = garyPickedHome ? awayVal : homeVal
                        
                        // Determine if left side (Gary's pick) has advantage
                        let leftAdvantage = garyPickedHome ? 
                            compareValues(homeVal, awayVal, token: token) : 
                            !compareValues(homeVal, awayVal, token: token)
                        
                        HStack {
                            // Left value (Gary's pick)
                            Text(leftVal)
                                .font(.subheadline.bold())
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                                .foregroundStyle(leftAdvantage ? greenAccent : .white.opacity(0.6))
                                .frame(maxWidth: 100, alignment: .leading)

                            Spacer(minLength: 4)

                            // Stat name with arrow
                            HStack(spacing: 4) {
                                if leftAdvantage {
                                    Image(systemName: "arrow.left")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(greenAccent)
                                }
                                Text(stat.name ?? displayName(for: token))
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.62))
                                    .lineLimit(1)
                                if !leftAdvantage {
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(greenAccent)
                                }
                            }
                            .layoutPriority(1)

                            Spacer(minLength: 4)

                            // Right value (opponent)
                            Text(rightVal)
                                .font(.subheadline.bold())
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                                .foregroundStyle(!leftAdvantage ? greenAccent : .white.opacity(0.6))
                                .frame(maxWidth: 100, alignment: .trailing)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(displayIndex % 2 == 0 ? Color.clear : Color(hex: "#171411"))
                    }
                }
                
                // Show More / Show Less button
                if hasMoreStats {
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isExpanded.toggle()
                        }
                    }) {
                        HStack(spacing: 6) {
                            Text(isExpanded ? "Show Less" : "Show \(validStats.count - maxCollapsedStats) More")
                                .font(.caption.bold())
                                .foregroundStyle(greenAccent.opacity(0.8))
                            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(greenAccent.opacity(0.8))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color(hex: "#171411"))
                    }
                    .buttonStyle(.plain)
                }
                
                // Injuries Row
                if let injuries = injuries {
                    // Get injuries with status (name, abbreviation)
                    let homeInjuriesList: [(name: String, status: String)] = (injuries.home ?? []).compactMap { injury in
                        guard isValidInjuryName(injury.name), let name = injury.name else { return nil }
                        let abbrev = statusAbbrev(injury.status)
                        guard !abbrev.isEmpty else { return nil }
                        return (name, abbrev)
                    }
                    let awayInjuriesList: [(name: String, status: String)] = (injuries.away ?? []).compactMap { injury in
                        guard isValidInjuryName(injury.name), let name = injury.name else { return nil }
                        let abbrev = statusAbbrev(injury.status)
                        guard !abbrev.isEmpty else { return nil }
                        return (name, abbrev)
                    }
                    
                    // Sort: OUT/IR/D first, then Q/DTD
                    let homeSorted = homeInjuriesList.sorted { sortPriority($0.status) < sortPriority($1.status) }
                    let awaySorted = awayInjuriesList.sorted { sortPriority($0.status) < sortPriority($1.status) }
                    
                    // Take top 5
                    let homeTop5 = Array(homeSorted.prefix(5))
                    let awayTop5 = Array(awaySorted.prefix(5))
                    
                    // Swap based on Gary's pick
                    let leftInjuries = garyPickedHome ? homeTop5 : awayTop5
                    let rightInjuries = garyPickedHome ? awayTop5 : homeTop5
                    
                    if !leftInjuries.isEmpty || !rightInjuries.isEmpty {
                        Divider().background(Color.white.opacity(0.1))
                        
                        VStack(alignment: .leading, spacing: 8) {
                            // Injuries header
                            Text("KEY INJURIES")
                                .font(.caption.bold())
                                .foregroundStyle(.red.opacity(0.8))
                                .tracking(0.5)
                            
                            HStack(alignment: .top, spacing: 16) {
                                // Left injuries (Gary's pick)
                                VStack(alignment: .leading, spacing: 4) {
                                    if leftInjuries.isEmpty {
                                        Text("✓ Healthy")
                                            .font(.caption)
                                            .foregroundStyle(.green.opacity(0.8))
                                    } else {
                                        ForEach(Array(leftInjuries.enumerated()), id: \.offset) { _, injury in
                                            HStack(spacing: 4) {
                                                Text(injury.status)
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .frame(width: 24, alignment: .leading)
                                                Text(injury.name)
                                                    .font(.caption)
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .lineLimit(1)
                                            }
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                
                                // Right injuries (opponent)
                                VStack(alignment: .trailing, spacing: 4) {
                                    if rightInjuries.isEmpty {
                                        Text("✓ Healthy")
                                            .font(.caption)
                                            .foregroundStyle(.green.opacity(0.8))
                                    } else {
                                        ForEach(Array(rightInjuries.enumerated()), id: \.offset) { _, injury in
                                            HStack(spacing: 4) {
                                                Text(injury.name)
                                                    .font(.caption)
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .lineLimit(1)
                                                Text(injury.status)
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .frame(width: 24, alignment: .trailing)
                                            }
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            }
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 12)
                        .background(Color(hex: "#1A1210"))
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: "#1C1A1A"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.12), lineWidth: 0.9)
            )
        }
    }
    
    /// Compare two stat values to determine if home is better
    private func compareValues(_ home: String, _ away: String, token: String) -> Bool {
        // For defensive stats, lower is better
        let lowerIsBetter = [
            "DEFENSIVE_RATING", "DEF_RATING", "ADJDE", "TURNOVER_RATE", "PAINT_DEFENSE",
            "DEFENSIVE_EPA", "SUCCESS_RATE_DEFENSE", "EXPLOSIVE_ALLOWED",
            "RED_ZONE_DEFENSE", "DL_RANKINGS", "DEFENSIVE_PLAYMAKERS",
            "OPP_EFG_PCT", "HAVOC_ALLOWED", "TOV_GM", "TURNOVERS_PER_GAME",
            // Defensive individual stats (lower is better)
            "OPP_POINTS_PER_GAME", "OPP_PPG", "OPP_YARDS_PER_GAME", "OPP_YPG",
            "GIVEAWAYS", "INTERCEPTIONS", "INTS",
            // NHL lower-is-better
            "GOALS_AGST_GM", "GOALS_AGAINST", "GOALS_AGAINST_AVG",
            // Rank tokens (lower rank = better)
            "ADJOE_RANK", "ADJDE_RANK", "T_RANK"
        ].contains(token)

        // For records like "5-18", "16-7", compare wins (first number)
        // Applies to RECORD, HOME, AWAY, HOME_AWAY_SPLITS, SPECIAL_TEAMS, etc.
        let recordTokens = ["RECORD", "CONF_RECORD", "L5_FORM", "L10_FORM", "PROJ_RECORD",
                           "HOME", "AWAY", "HOME_RECORD", "AWAY_RECORD",
                           "PACE_HOME_AWAY", "HOME_AWAY_SPLITS", "SPECIAL_TEAMS",
                           "SPECIAL_TEAMS_RATING", "ATS_RECORD", "OU_RECORD"]
        
        // Also detect record format automatically (X-Y where X and Y are numbers)
        let isRecordFormat: (String) -> Bool = { val in
            let parts = val.components(separatedBy: "-")
            return parts.count == 2 && Int(parts[0]) != nil && Int(parts[1]) != nil
        }
        
        if recordTokens.contains(token) || (isRecordFormat(home) && isRecordFormat(away)) {
            let homeWins = Int(home.components(separatedBy: "-").first ?? "0") ?? 0
            let awayWins = Int(away.components(separatedBy: "-").first ?? "0") ?? 0
            return homeWins > awayWins
        }

        // Game 1 Result — "W 3-0 vs Taipei" vs "L 4-11 vs Korea" — W beats L
        if token == "GAME1_RESULT" {
            let homeWin = home.hasPrefix("W")
            let awayWin = away.hasPrefix("W")
            return homeWin && !awayWin
        }

        // Text-only stats where comparison doesn't apply — always neutral (no arrow highlight)
        if token == "SP_NAME" || token == "VENUE" || token == "LAST_PLAYED" {
            return false
        }

        // RUN_LINE — more negative spread = bigger favorite = advantage
        if token == "RUN_LINE" {
            let homeSpread = Double(home.replacingOccurrences(of: "+", with: "")) ?? 0
            let awaySpread = Double(away.replacingOccurrences(of: "+", with: "")) ?? 0
            return homeSpread < awaySpread
        }

        // ML_ODDS — more negative = bigger favorite = advantage
        if token == "ML_ODDS" {
            let homeOdds = Double(home.replacingOccurrences(of: "+", with: "")) ?? 0
            let awayOdds = Double(away.replacingOccurrences(of: "+", with: "")) ?? 0
            // Lower (more negative) ML odds = bigger favorite = better
            return homeOdds < awayOdds
        }

        // For Last 5 / RECENT_FORM (e.g., "WWWWW" vs "LLWLL"), count wins
        if token == "RECENT_FORM" || token == "LAST_5" {
            let homeWins = home.uppercased().filter { $0 == "W" }.count
            let awayWins = away.uppercased().filter { $0 == "W" }.count
            return homeWins > awayWins
        }

        // For turnover margin and point diff, handle positive/negative
        if token == "TURNOVER_MARGIN" || token == "TURNOVER_DIFF" || token == "POINT_DIFF" || token == "NET_RATING" || token == "ADJEM" || token == "WAB" {
            let homeVal = Double(home) ?? 0
            let awayVal = Double(away) ?? 0
            return homeVal > awayVal
        }

        // Extract numeric values for standard comparisons
        // Remove % and handle negative numbers properly
        let cleanNum: (String) -> Double = { val in
            let cleaned = val.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: "#", with: "")
            return Double(cleaned) ?? 0
        }
        
        let homeNum = cleanNum(home)
        let awayNum = cleanNum(away)

        return lowerIsBetter ? homeNum < awayNum : homeNum > awayNum
    }
}

// MARK: - Gary's Take Section
struct GaryTakeSection: View {
    let narrative: String
    var accentColor: Color = Color(hex: "#4ade80")  // Default green, can be overridden

    private let greenAccent = Color(hex: "#4ade80")
    
    /// Remove common opening phrases from paragraphs
    private func cleanParagraph(_ text: String) -> String {
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Simple prefix strings to remove (case insensitive check)
        let prefixesToRemove = [
            "Here's how I see this playing out:",
            "Here's how I see it playing out:",
            "Here's the thing:",
            "Let me break this down:",
            "Here's my take:",
            "Bottom line:",
            "The bottom line:",
            "Here's the deal:"
        ]
        
        // Check and remove simple prefixes
        for prefix in prefixesToRemove {
            if cleaned.lowercased().hasPrefix(prefix.lowercased()) {
                cleaned = String(cleaned.dropFirst(prefix.count))
                break
            }
        }
        
        // Handle "I love this spot for [team]." or "I love this spot for [team]:" pattern
        if cleaned.lowercased().hasPrefix("i love this spot") {
            // Find the first period or colon after "I love this spot"
            if let periodIndex = cleaned.firstIndex(of: ".") {
                let afterPeriod = cleaned.index(after: periodIndex)
                if afterPeriod < cleaned.endIndex {
                    cleaned = String(cleaned[afterPeriod...])
                }
            } else if let colonIndex = cleaned.firstIndex(of: ":") {
                let afterColon = cleaned.index(after: colonIndex)
                if afterColon < cleaned.endIndex {
                    cleaned = String(cleaned[afterColon...])
                }
            }
        }
        
        // Handle "Here's the thing about this [matchup]:" pattern
        if cleaned.lowercased().hasPrefix("here's the thing about") {
            if let colonIndex = cleaned.firstIndex(of: ":") {
                let afterColon = cleaned.index(after: colonIndex)
                if afterColon < cleaned.endIndex {
                    cleaned = String(cleaned[afterColon...])
                }
            }
        }
        
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Capitalize first letter after cleaning
        if let first = cleaned.first, first.isLowercase {
            cleaned = cleaned.prefix(1).uppercased() + cleaned.dropFirst()
        }
        
        return cleaned
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section Header
            Text("GARY'S TAKE")
                .font(.caption.bold())
                .foregroundStyle(greenAccent)
                .tracking(1)
                .opacity(0.8)

            // Narrative text - split into paragraphs with dividers
            VStack(alignment: .leading, spacing: 0) {
                let paragraphs = narrative.components(separatedBy: "\n\n").filter { !$0.isEmpty }

                ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, para in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(cleanParagraph(para))
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.92))
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.vertical, 14)
                        
                        // Add divider between paragraphs (not after last one)
                        if index < paragraphs.count - 1 {
                            Rectangle()
                                .fill(accentColor.opacity(0.5))
                                .frame(height: 1)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: "#1C1A1A"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(accentColor.opacity(0.28), lineWidth: 0.9)
            )
        }
    }
}



/// Renders a stat row with values and arrow
struct StatRowView: View {
    let line: String
    let accentColor: Color
    
    // Desktop-matching colors
    private let greenAccent = Color(hex: "#4ade80")
    
    // Parse the stat line into components
    private var parsedStat: (statName: String, leftVal: String, rightVal: String, isRightAdvantage: Bool)? {
        let isRightAdvantage = line.contains("→")
        let parts = line
            .replacingOccurrences(of: "→", with: "|")
            .replacingOccurrences(of: "←", with: "|")
            .components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        
        guard parts.count >= 2 else { return nil }
        
        let leftPart = parts[0]
        let rightPart = parts[parts.count - 1]
        
        // Extract stat name and left value - expanded list matching desktop
        let statLabels = ["Record", "Off Rating", "Def Rating", "Net Rating", "Pace", "eFG%", 
                         "TOV%", "ORB%", "FT Rate", "Key Injuries", "Injuries", "Last 5",
                         "3PT%", "Paint Scoring", "Paint Defense", "Close Games",
                         "Total YPG", "Opp Yards", "Yards/Game", "Yards Allowed",
                         "Recent PPG", "Scoring Efficiency", "QB Rating", "Completion %",
                         "3rd Down %", "Opp 3rd Down %", "Turnover +/-", "Rush YPG",
                         "Opp Rush", "Rush Yards/Carry", "Total Yards", "Pass Yards",
                         "Def Points Allowed", "Big Plays", "Havoc Rate", "Opp Havoc"]
        
        var statName = ""
        var leftVal = leftPart
        
        for label in statLabels {
            if leftPart.contains(label) {
                statName = label
                leftVal = leftPart.replacingOccurrences(of: label, with: "").trimmingCharacters(in: .whitespaces)
                break
            }
        }
        
        return (statName, leftVal, rightPart, isRightAdvantage)
    }
    
    var body: some View {
        if let stat = parsedStat {
            HStack {
                // Left value - green if advantage, white if not
                Text(stat.leftVal)
                    .font(.subheadline.bold())
                    .foregroundStyle(stat.isRightAdvantage ? .white.opacity(0.7) : greenAccent)
                    .frame(width: 65, alignment: .leading)
                
                Spacer()
                
                // Stat name with arrow indicator
                HStack(spacing: 4) {
                    if !stat.isRightAdvantage {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(greenAccent)
                    }
                    Text(stat.statName)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.62))
                    if stat.isRightAdvantage {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(greenAccent)
                    }
                }
                
                Spacer()
                
                // Right value - green if advantage, white if not
                Text(stat.rightVal)
                    .font(.subheadline.bold())
                    .foregroundStyle(stat.isRightAdvantage ? greenAccent : .white.opacity(0.7))
                    .frame(width: 65, alignment: .trailing)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.white.opacity(0.05))
            )
        } else {
            Text(line)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))
        }
    }
}

// MARK: - Analysis Section Models









// MARK: - Web Container


// MARK: - Shape Helpers


// MARK: - Formatters

enum Formatters {
    // Cached DateFormatters (expensive to create — reuse across calls)
    private static let timeFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    static let dayTimeFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    // Time-only (no weekday) for the Picks-page matchup tabs — reads "6:40 PM ET"
    // (founder call Jun 26: drop the leading weekday from the tab sub-line).
    static let tabTimeFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    private static let dateOnlyFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    static func labelEST(_ time: String?) -> String {
        guard let time = time, !time.isEmpty else { return "" }
        return time.uppercased().contains("EST") ? time : "\(time) EST"
    }
    
    /// Clean game time display - just the time, no emojis
    static func formatGameTime(_ time: String?) -> String {
        guard let time = time, !time.isEmpty else { return "" }
        // Remove any emoji characters and clean up
        let clean = time
            .replacingOccurrences(of: "🏈", with: "")
            .replacingOccurrences(of: "🏀", with: "")
            .replacingOccurrences(of: "⚾", with: "")
            .replacingOccurrences(of: "🏒", with: "")
            .replacingOccurrences(of: "⏰", with: "")
            .replacingOccurrences(of: "🕐", with: "")
            .trimmingCharacters(in: .whitespaces)
        // If it already has AM/PM or EST, return as is
        let upper = clean.uppercased()
        if upper.contains("AM") || upper.contains("PM") || upper.contains("EST") || upper.contains("ET") {
            return clean
        }
        return clean
    }
    
    /// Format ISO commence_time to readable time (e.g., "1:00 PM ET")
    static func formatCommenceTime(_ isoTime: String?) -> String {
        guard let isoTime = isoTime, !isoTime.isEmpty else { return "" }
        
        // Try to parse ISO format: "2025-12-07T18:00:00Z"
        let date = parseISO8601(isoTime)
        
        guard let gameDate = date else {
            // Fallback: return cleaned version
            return formatGameTime(isoTime)
        }
        
        return timeFormatterEST.string(from: gameDate) + " ET"
    }
    
    static func confidencePercent(_ confidence: Double?) -> Int {
        guard let c = confidence else { return 0 }
        return Int(round(c * 100))
    }
    
    static func americanOdds(_ odds: String?) -> String {
        // STORE-SAFE BRIDGE: no prices anywhere — every prop/odds text render
        // uses this formatter, so emptying it here blanks them all.
        if AppFlags.storeSafe { return "" }
        guard let s = odds, !s.isEmpty else { return "" }
        if s.hasPrefix("+") || s.hasPrefix("-") { return s }
        if let n = Int(s) { return n > 0 ? "+\(n)" : "\(n)" }
        return s
    }

    /// Net P/L as actual DOLLARS at a flat $100 stake per pick — "if Gary had
    /// $100 on each pick, how much did he win or lose." `units` is the flat-1u
    /// net (1u risked = $100), so dollars = units × 100. e.g. +$120 / -$95.
    static func flatStakeDollars(_ units: Double) -> String {
        let dollars = (units * 100).rounded()
        let amount = Int(abs(dollars))
        return dollars < 0 ? "-$\(amount)" : "+$\(amount)"
    }

    static func propDisplay(_ raw: String?, league: String? = nil) -> String {
        guard var s = raw, !s.isEmpty else { return "" }
        s = s.replacingOccurrences(of: "_", with: " ")
        let parts = s.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        if parts.isEmpty { return s.capitalized }
        
        var typeWords = parts
        var linePart: String? = nil
        if let last = parts.last, Double(last) != nil {
            linePart = last
            typeWords = Array(parts.dropLast())
        }
        
        // Handle combined props like "goals assists" -> "Goals + Assists"
        var typeTitle = typeWords.joined(separator: " ").capitalized
        
        // Special case: combined stat props with "+" separator
        let combinedProps = ["Goals Assists", "Rebounds Assists", "Points Rebounds", "Points Assists", "Points Rebounds Assists"]
        for combo in combinedProps {
            if typeTitle.lowercased() == combo.lowercased() {
                typeTitle = combo.split(separator: " ").map(String.init).joined(separator: " + ")
                break
            }
        }
        
        // Fix "Td" -> "TD" (capitalized lowercases the D)
        typeTitle = typeTitle.replacingOccurrences(of: " Td", with: " TD")
        typeTitle = typeTitle.replacingOccurrences(of: "Td ", with: "TD ")
        if typeTitle == "Td" { typeTitle = "TD" }
        if typeTitle.hasSuffix(" Td") { typeTitle = String(typeTitle.dropLast(2)) + "TD" }
        
        // Return formatted prop with line number (no + suffix).
        // Anytime markets at line 1 read as just "Anytime Goal"/"Anytime TD" —
        // sportsbook convention; the 1 is implied and reads like a typo.
        if typeTitle.lowercased().contains("anytime"), linePart == "1" { return typeTitle }
        return linePart.map { "\(typeTitle) \($0)" } ?? typeTitle
    }
    
    static func computeEV(confidence: Double?, american: String?) -> Double? {
        guard let p = confidence,
              let aStr = american,
              let am = Int(aStr.replacingOccurrences(of: "+", with: "")) else { return nil }
        
        let b: Double = am > 0 ? Double(am) / 100.0 : 100.0 / Double(abs(am))
        let prob = p > 1.0 ? (p / 100.0) : p
        let ev = prob * b - (1 - prob)
        return (ev * 100) / 10.0
    }
    
    static func formatDate(_ iso: String?) -> String {
        guard let iso = iso, let day = iso.split(separator: "T").first else { return "" }
        let parts = day.split(separator: "-")
        if parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]) {
            let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            return "\(months[max(1, min(12, m)) - 1]) \(d)"
        }
        return String(day)
    }
    
    static func propResultTitle(_ p: PropResult) -> String {
        if let txt = p.pick_text, !txt.isEmpty { return propDisplay(txt, league: p.effectiveLeague) }
        return [
            p.player_name,
            p.prop_type?.replacingOccurrences(of: "_", with: " ").capitalized,
            p.bet?.uppercased(),
            p.line_value?.value
        ].compactMap { $0 }.joined(separator: " ")
    }
    
    /// Get short team name for display
    /// - For NCAAB/NCAAF: Returns school name (e.g., "Nebraska" from "Nebraska Cornhuskers")
    /// - For pro sports: Returns mascot (e.g., "Thunder" from "Oklahoma City Thunder")
    // Multi-word mascots that must stay together when shortening team names —
    // THE canonical list (founder, Jul 12: Red Sox / White Sox / Blue Jays must
    // hold app-wide, never "Sox"/"Jays"). Every display-name shortener routes
    // here; never grow a local copy.
    static let twoWordMascots = [
        // MLB
        "Red Sox", "White Sox", "Blue Jays",
        // NHL (proMascot's hockey-card collapse filters these at its call sites)
        "Maple Leafs", "Red Wings", "Blue Jackets", "Golden Knights",
        // NBA
        "Trail Blazers",
        // NCAA (most college names are handled by collegeSchoolName; these
        // cover pick-text and card paths that bypass it)
        "Tar Heels", "Blue Devils", "Yellow Jackets", "Red Raiders",
        "Horned Frogs", "Sun Devils", "Golden Bears", "Nittany Lions",
        "Crimson Tide", "Fighting Irish", "Scarlet Knights", "Mean Green",
        "Golden Gophers", "Demon Deacons", "Black Bears", "Golden Eagles"
    ]

    /// A college pick with its school replaced by the scoreboard code:
    /// "Massachusetts Minutemen +28.5" → "MASS +28.5" (founder, Sep 4 2026 —
    /// the card's bottom line was truncating to "MASSACHUSETTS +2…", and an
    /// ellipsis is never acceptable). Longest school match wins, so "Miami
    /// (OH)" never resolves as "Miami". Unknown schools are left alone.
    static func shortenCollegePick(_ pick: String) -> String {
        let words = pick.split(separator: " ").map(String.init)
        guard words.count > 1 else { return pick }
        for take in stride(from: min(5, words.count - 1), through: 1, by: -1) {
            let candidate = words.prefix(take).joined(separator: " ")
            if let abbr = NCAAFTeams.abbreviation(candidate) {
                return ([abbr] + words.dropFirst(take)).joined(separator: " ")
            }
        }
        return pick
    }

    /// Card-display transform (founder, Jul 12): the words OVER/UNDER become
    /// simple arrows on pick displays — "H+R+RBI ▲ 1.5". Word-boundary safe
    /// (never touches names like "Overton"); logic paths keep the words.
    static func arrowizeOverUnder(_ text: String) -> String {
        var t = text
        // Thin arrows (founder, Jul 12): solid triangles read aggressive and
        // clunky at hero sizes — sleek single-stroke glyphs instead.
        for (word, arrow) in [("OVER", "↑"), ("Over", "↑"), ("UNDER", "↓"), ("Under", "↓")] {
            t = t.replacingOccurrences(of: "(^|\\s)\(word)(\\s|$)",
                                       with: "$1\(arrow)$2",
                                       options: .regularExpression)
        }
        return t
    }

    /// Last word of a pro team name, but keep two-word mascots whole
    /// ("Toronto Blue Jays" → "Blue Jays", "Chicago White Sox" → "White Sox").
    /// Pro-only: no World Cup nation / college handling, so callers that can
    /// see those must guard first (shortTeamName does; shortenMatchup only ever
    /// receives pro matchups since World Cup has no props/grouped sections).
    static func proMascot(_ name: String) -> String {
        let lower = name.lowercased()
        for mascot in twoWordMascots where lower.hasSuffix(mascot.lowercased()) {
            return mascot
        }
        return name.components(separatedBy: " ").last ?? name
    }

    static func shortTeamName(_ team: String?, league: String? = nil) -> String {
        guard let team = team, !team.isEmpty else { return "" }
        // All-Star specials ride the team slots with event/venue strings —
        // the last-word mascot cut would yield "Derby @ Park" (Jul 13 2026).
        if team == "Home Run Derby" { return "HR Derby" }
        if team == "Citizens Bank Park" { return "Philly" }
        let words = team.split(separator: " ").map(String.init)

        guard words.count > 1 else { return team }

        // Check if this is a college sport
        let leagueUpper = (league ?? "").uppercased()
        let isCollege = leagueUpper == "NCAAB" || leagueUpper == "NCAAF"

        if isCollege {
            // The provider's own school name wins — the word-stripping below is
            // a heuristic and gets "Louisiana Ragin' Cajuns" wrong (founder,
            // Sep 4 2026: school name, no mascot).
            if let school = NCAAFTeams.school(team) { return school }
            // For college: return school name (remove mascot from end)
            return collegeSchoolName(words)
        } else if leagueUpper == "WC" {
            // World Cup "teams" are nations — the whole name IS the team, so
            // never strip a trailing word as a mascot ("South Korea" must not
            // become "Korea", "Saudi Arabia" not "Arabia"). The 3-letter FIFA
            // code is the abbreviation's job (teamAbbrev → wcTeamKeywords).
            return team
        } else {
            // For pro sports: return mascot. Check for two-word mascots first.
            let teamLower = team.lowercased()
            for mascot in twoWordMascots {
                if teamLower.hasSuffix(mascot.lowercased()) {
                    return mascot
                }
            }
            return words.last ?? team
        }
    }
    
    /// Extract college school name from full team name
    /// Removes mascot(s) from the end, keeping school/location
    /// e.g., "Nebraska Cornhuskers" → "Nebraska"
    /// e.g., "North Carolina Tar Heels" → "North Carolina"
    /// e.g., "San Diego State Aztecs" → "San Diego State"
    private static func collegeSchoolName(_ words: [String]) -> String {
        guard words.count >= 2 else { return words.joined(separator: " ") }
        
        // For 2-word names, first word is school
        if words.count == 2 {
            return words[0]
        }
        
        // Common mascot prefix words that indicate a 2-word mascot
        // e.g., "Fighting Illini", "Blue Devils", "Red Raiders", "Tar Heels"
        let mascotPrefixes: Set<String> = [
            "Fighting", "Golden", "Blue", "Red", "Crimson", "Scarlet", "Mean",
            "Runnin", "Running", "Flying", "Ragin", "Sun", "War", "Nittany",
            "Horned", "Yellow", "Demon", "Green", "Purple", "Orange", "Tar", "Great"
        ]
        
        // Check if second-to-last word is a mascot prefix (indicates 2-word mascot)
        let secondToLast = words[words.count - 2]
        if mascotPrefixes.contains(secondToLast) {
            // Two-word mascot, remove last 2 words
            return words.dropLast(2).joined(separator: " ")
        }
        
        // Single-word mascot, remove last word only
        return words.dropLast(1).joined(separator: " ")
    }
    
    static func splitPickAndOdds(_ pick: String?) -> (String, String) {
        guard let pick = pick, !pick.isEmpty else { return ("", "") }
        
        // Pattern to match American odds at the end (typically -110, +150, -105, etc.)
        // American odds are usually 3+ digits (100 or greater absolute value)
        // Spread/line values are smaller (like -7.5, +3, -14.5)
        let pattern = #"(.+?)\s+([-+]\d{3,}\.?\d*)$"#
        var pickPart = pick
        var oddsPart = ""
        
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: pick, range: NSRange(pick.startIndex..., in: pick)) {
            if let pickRange = Range(match.range(at: 1), in: pick),
               let oddsRange = Range(match.range(at: 2), in: pick) {
                let potentialOdds = String(pick[oddsRange])
                // Only treat as odds if absolute value >= 100 (American odds format)
                if let oddsValue = Double(potentialOdds.replacingOccurrences(of: "+", with: "")),
                   abs(oddsValue) >= 100 {
                    pickPart = String(pick[pickRange]).trimmingCharacters(in: .whitespaces)
                    oddsPart = potentialOdds
                }
            }
        }
        
        // STORE-SAFE BRIDGE: translate market notation to plain English and
        // drop the odds entirely — every game-pick display site flows through
        // here, so this one hook covers them all (see AppFlags.storeSafe).
        if AppFlags.storeSafe {
            pickPart = AppFlags.bridgePickText(pickPart)
            oddsPart = ""
        }

        // First shorten city names, then truncate if still too long
        let shortenedPick = shortenTeamNamesInPick(pickPart)
        let truncatedPick = truncatePickText(shortenedPick)
        return (truncatedPick, oddsPart)
    }
    
    private static func shortenTeamNamesInPick(_ pick: String) -> String {
        // Pro sports cities to shorten (NOT college - college teams use city/school as part of name)
        let cities = ["Dallas", "Detroit", "Los Angeles", "LA", "New York", "NY", "Boston", "Washington",
                      "Golden State", "San Francisco", "San Antonio", "New Orleans", "Oklahoma City", "OKC",
                      "Minnesota", "Milwaukee", "Miami", "Memphis", "Indiana", "Houston", "Denver",
                      "Cleveland", "Chicago", "Charlotte", "Brooklyn", "Atlanta", "Phoenix", "Portland",
                      "Sacramento", "Toronto", "Utah", "Orlando", "Philadelphia", "Cincinnati", "Baltimore",
                      "Pittsburgh", "Kansas City", "Las Vegas", "Seattle", "Tampa Bay", "Green Bay",
                      "New England", "Tennessee", "Arizona", "Carolina", "Buffalo"]
        // Note: Removed "Jacksonville" - it's also a college team name (Jacksonville State)
        
        // College indicators - don't strip city if followed by these words
        let collegeIndicators = ["State", "Tech", "A&M", "University", "College", "Southern", "Northern", "Eastern", "Western", "Central"]
        
        var result = pick
        for city in cities {
            // Check if this city is followed by a college indicator - if so, skip it
            let cityPattern = "\\b\(city)\\s+(\\w+)"
            if let regex = try? NSRegularExpression(pattern: cityPattern, options: .caseInsensitive),
               let match = regex.firstMatch(in: result, range: NSRange(result.startIndex..., in: result)),
               let nextWordRange = Range(match.range(at: 1), in: result) {
                let nextWord = String(result[nextWordRange])
                if collegeIndicators.contains(where: { nextWord.caseInsensitiveCompare($0) == .orderedSame }) {
                    continue // Skip - this is a college team name
                }
            }
            
            // Safe to remove pro city name
            let pattern = "\\b\(city)\\s+"
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "")
            }
        }
        return result.trimmingCharacters(in: .whitespaces)
    }
    
    /// Formats pick text with clean team names and preserved bet info
    /// e.g., "Kennesaw State Owls spread -7.5" -> "Kennesaw -7.5"
    /// e.g., "Incarnate Word Cardinals ML" -> "Incarnate Word ML"
    /// e.g., "Pennsylvania Quakers -3.5" -> "Pennsylvania -3.5"
    static func truncatePickText(_ pick: String, maxLength: Int = 20) -> String {
        var cleanPick = pick
        
        // Remove the word "spread" (we show the number, that's enough)
        cleanPick = cleanPick.replacingOccurrences(of: " spread ", with: " ", options: .caseInsensitive)
        cleanPick = cleanPick.replacingOccurrences(of: " spread", with: "", options: .caseInsensitive)
        
        // Extract bet type and value at the end (ML, -7.5, +3, over 145.5, under 200, etc.)
        let betPattern = #"^(.+?)\s+(ML|moneyline|over\s+[\d.]+|under\s+[\d.]+|[-+][\d.]+)$"#
        
        if let regex = try? NSRegularExpression(pattern: betPattern, options: .caseInsensitive),
           let match = regex.firstMatch(in: cleanPick, range: NSRange(cleanPick.startIndex..., in: cleanPick)) {
            if let teamRange = Range(match.range(at: 1), in: cleanPick),
               let betRange = Range(match.range(at: 2), in: cleanPick) {
                var teamPart = String(cleanPick[teamRange]).trimmingCharacters(in: .whitespaces)
                let betPart = String(cleanPick[betRange]).trimmingCharacters(in: .whitespaces)
                
                // Shorten team name if needed - use first 1-2 words
                teamPart = shortenTeamForDisplay(teamPart, maxLength: 14)
                
                return "\(teamPart) \(betPart)"
            }
        }
        
        // No bet type found - just shorten the whole thing
        if cleanPick.count > maxLength {
            return shortenTeamForDisplay(cleanPick, maxLength: maxLength)
        }
        return cleanPick
    }
    
    /// Shortens a team name to fit display
    /// e.g., "Kennesaw State Owls" -> "Kennesaw"
    /// e.g., "Incarnate Word Cardinals" -> "Incarnate Word"
    private static func shortenTeamForDisplay(_ team: String, maxLength: Int) -> String {
        if team.count <= maxLength { return team }
        
        let words = team.split(separator: " ").map(String.init)
        
        // Try first word
        if let first = words.first, first.count <= maxLength {
            // If first word is very short, try adding second word
            if first.count < 8 && words.count > 1 {
                let twoWords = "\(first) \(words[1])"
                if twoWords.count <= maxLength {
                    return twoWords
                }
            }
            return first
        }
        
        // Fallback: truncate to max length
        return String(team.prefix(maxLength))
    }
}
