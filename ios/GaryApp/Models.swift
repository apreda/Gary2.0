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

// MARK: - Sportsbook Odds (multi-book comparison)
struct SportsbookOdds: Codable, Identifiable {
    let book: String?
    let spread: Double?
    let spread_odds: String?
    let ml: String?

    var id: String { book ?? UUID().uuidString }

    /// Parse from dictionary
    static func from(dict: [String: Any]) -> SportsbookOdds? {
        return SportsbookOdds(
            book: dict["book"] as? String,
            spread: (dict["spread"] as? NSNumber)?.doubleValue,
            spread_odds: dict["spread_odds"] as? String,
            ml: dict["ml"] as? String
        )
    }
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
    // Venue and tournament context (for NBA Cup, neutral site games, CFP games, etc.)
    let venue: String?
    let isNeutralSite: Bool?
    let tournamentContext: String?
    let gameSignificance: String?
    // CFP-specific fields for NCAAF
    let cfpRound: String?
    let homeSeed: Int?
    let awaySeed: Int?
    // NCAAB conference data for filtering
    let conference: String?  // Conference of the picked team (e.g., "Big Ten", "SEC")
    let homeConference: String?
    let awayConference: String?
    // Thesis-based classification (new filtering system)
    let thesis_type: String?  // "clear_read", "found_angle", "educated_lean", "coin_flip"
    let thesis_mechanism: String?  // One-sentence explanation of WHY this team wins
    let supporting_factors: [String]?
    let contradicting_factors: ContradictingFactors?
    // Manual Top Pick override
    let is_top_pick: Bool?
    // Multi-sportsbook odds comparison (ML + Spread)
    let sportsbook_odds: [SportsbookOdds]?

// MARK: - Contradicting Factors (major/minor categorization)
struct ContradictingFactors: Codable {
    let major: [String]?
    let minor: [String]?
    
    /// Total count of all contradictions
    var totalCount: Int {
        (major?.count ?? 0) + (minor?.count ?? 0)
    }
    
    /// Parse from dictionary (handles both old array format and new object format)
    static func from(value: Any?) -> ContradictingFactors? {
        guard let value = value else { return nil }
        
        // New format: { major: [...], minor: [...] }
        if let dict = value as? [String: Any] {
            return ContradictingFactors(
                major: dict["major"] as? [String],
                minor: dict["minor"] as? [String]
            )
        }
        
        // Legacy format: simple array - treat as minor
        if let array = value as? [String] {
            return ContradictingFactors(major: nil, minor: array)
        }
        
        return nil
    }
}
    
    var id: String { pick_id ?? UUID().uuidString }
    
    /// Check if this is an NBA Cup game
    var isNBACup: Bool {
        guard let ctx = tournamentContext?.lowercased() else { return false }
        return ctx.contains("nba cup") || ctx.contains("in-season tournament")
    }
    
    /// Check if this is a CFP (College Football Playoff) game
    var isCFP: Bool {
        guard let ctx = tournamentContext?.lowercased() else { return false }
        return ctx.contains("cfp") || ctx.contains("college football playoff") || cfpRound != nil
    }
    
    /// Get the seed for a team (by checking if it's home or away)
    func getSeed(forTeam team: String?) -> Int? {
        guard let team = team else { return nil }
        let teamLower = team.lowercased()
        if let home = homeTeam?.lowercased(), teamLower.contains(home) || home.contains(teamLower) {
            return homeSeed
        }
        if let away = awayTeam?.lowercased(), teamLower.contains(away) || away.contains(teamLower) {
            return awaySeed
        }
        return nil
    }
    
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

        // Parse sportsbook odds
        var sportsbookOddsArray: [SportsbookOdds]? = nil
        if let oddsRaw = dict["sportsbook_odds"] as? [[String: Any]] {
            sportsbookOddsArray = oddsRaw.compactMap { SportsbookOdds.from(dict: $0) }
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
            injuries: injuriesData,
            venue: dict["venue"] as? String,
            isNeutralSite: dict["isNeutralSite"] as? Bool,
            tournamentContext: dict["tournamentContext"] as? String,
            gameSignificance: dict["gameSignificance"] as? String,
            cfpRound: dict["cfpRound"] as? String,
            homeSeed: dict["homeSeed"] as? Int,
            awaySeed: dict["awaySeed"] as? Int,
            conference: dict["conference"] as? String,
            homeConference: dict["homeConference"] as? String,
            awayConference: dict["awayConference"] as? String,
            thesis_type: dict["thesis_type"] as? String,
            thesis_mechanism: dict["thesis_mechanism"] as? String,
            supporting_factors: dict["supporting_factors"] as? [String],
            contradicting_factors: ContradictingFactors.from(value: dict["contradicting_factors"]),
            is_top_pick: dict["is_top_pick"] as? Bool,
            sportsbook_odds: sportsbookOddsArray
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
            home: homeDict.flatMap { StatValues.from(dict: $0) },
            away: awayDict.flatMap { StatValues.from(dict: $0) }
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
    let threeAttemptedPerGame: String?
    let gamesPlayed: String?
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
    // NFL-specific stats
    let totalYardsPerGame: String?
    let oppTotalYards: String?
    let yardsPerGame: String?
    let oppYardsPerGame: String?
    let pointsPerGame: String?
    let oppPointsPerGame: String?
    let turnoverDiff: String?
    let qbRating: String?
    let completionPct: String?
    let thirdDownPct: String?
    let fourthDownPct: String?
    let rushingYardsPerGame: String?
    let oppRushingYards: String?
    let yardsPerCarry: String?
    let passingTds: String?
    let interceptions: String?
    let rushingTds: String?
    let last5: String?
    // Additional NFL flattened stats
    let takeaways: String?
    let giveaways: String?
    let sacks: String?
    let pointDiff: String?
    let yardsPerAttempt: String?
    let yardsPerPlay: String?
    let receivingYardsPerGame: String?
    let receivingTds: String?
    let yardsPerCatch: String?
    let longestPass: String?
    let longestRush: String?
    let temperature: String?
    let feelsLike: String?
    let windSpeed: String?
    let conditions: String?
    let impact: String?
    // NCAAB/NCAAF specific stats (pointsPerGame already defined above)
    let assistsPerGame: String?
    let reboundsPerGame: String?
    let stealsPerGame: String?
    let blocksPerGame: String?
    let fgPct: String?
    let fgmPerGame: String?
    let fgaPerGame: String?
    let drebPerGame: String?
    // NCAAB enriched stats
    let tempo: String?
    let apRank: String?
    let coachesRank: String?
    let conferenceRecord: String?
    let netRank: String?
    let sosRank: String?
    let kenpomRank: String?
    // NHL-specific stats
    let goalsForPerGame: String?
    let goalsAgainstPerGame: String?
    let powerPlayPct: String?
    let penaltyKillPct: String?
    let shotsFor: String?
    let shotsAgainst: String?
    let shotDifferential: String?
    let savePct: String?
    let goalsAgainstAvg: String?
    let faceoffPct: String?
    // NCAAF BDL-specific stats (new format from stat router)
    let totalYpg: String?
    let passingYpg: String?
    let rushingYpg: String?
    let totalTds: String?
    let interceptionsThrown: String?
    let oppPassingYards: String?
    let passingYards: String?
    let rushingYards: String?
    let totalYards: String?
    let passingInts: String?
    
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
            threeAttemptedPerGame: dict["three_attempted_per_game"] as? String,
            gamesPlayed: dict["games_played"] as? String,
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
            trueShootingPct: dict["true_shooting_pct"] as? String,
            // NFL-specific stats
            totalYardsPerGame: dict["total_yards_per_game"] as? String ?? (dict["total_yards_per_game"] as? NSNumber)?.stringValue,
            oppTotalYards: dict["opp_total_yards"] as? String ?? (dict["opp_total_yards"] as? NSNumber)?.stringValue,
            yardsPerGame: dict["yards_per_game"] as? String ?? (dict["yards_per_game"] as? NSNumber)?.stringValue,
            oppYardsPerGame: dict["opp_yards_per_game"] as? String ?? (dict["opp_yards_per_game"] as? NSNumber)?.stringValue,
            pointsPerGame: dict["points_per_game"] as? String ?? (dict["points_per_game"] as? NSNumber)?.stringValue,
            oppPointsPerGame: dict["opp_points_per_game"] as? String ?? (dict["opp_points_per_game"] as? NSNumber)?.stringValue,
            turnoverDiff: dict["turnover_diff"] as? String ?? (dict["turnover_diff"] as? NSNumber)?.stringValue,
            qbRating: dict["qb_rating"] as? String ?? (dict["qb_rating"] as? NSNumber)?.stringValue,
            completionPct: dict["completion_pct"] as? String ?? (dict["completion_pct"] as? NSNumber)?.stringValue,
            thirdDownPct: dict["third_down_pct"] as? String ?? (dict["third_down_pct"] as? NSNumber)?.stringValue,
            fourthDownPct: dict["fourth_down_pct"] as? String ?? (dict["fourth_down_pct"] as? NSNumber)?.stringValue,
            rushingYardsPerGame: dict["rushing_yards_per_game"] as? String ?? (dict["rushing_yards_per_game"] as? NSNumber)?.stringValue,
            oppRushingYards: dict["opp_rushing_yards"] as? String ?? (dict["opp_rushing_yards"] as? NSNumber)?.stringValue,
            yardsPerCarry: dict["yards_per_carry"] as? String ?? (dict["yards_per_carry"] as? NSNumber)?.stringValue,
            passingTds: dict["passing_tds"] as? String ?? (dict["passing_tds"] as? NSNumber)?.stringValue,
            interceptions: dict["interceptions"] as? String ?? (dict["interceptions"] as? NSNumber)?.stringValue,
            rushingTds: dict["rushing_tds"] as? String ?? (dict["rushing_tds"] as? NSNumber)?.stringValue,
            last5: dict["last_5"] as? String,
            // Additional NFL flattened stats
            takeaways: dict["takeaways"] as? String ?? (dict["takeaways"] as? NSNumber)?.stringValue,
            giveaways: dict["giveaways"] as? String ?? (dict["giveaways"] as? NSNumber)?.stringValue,
            sacks: dict["sacks"] as? String ?? (dict["sacks"] as? NSNumber)?.stringValue,
            pointDiff: dict["point_diff"] as? String ?? (dict["point_diff"] as? NSNumber)?.stringValue,
            yardsPerAttempt: dict["yards_per_attempt"] as? String ?? (dict["yards_per_attempt"] as? NSNumber)?.stringValue,
            yardsPerPlay: dict["yards_per_play"] as? String ?? (dict["yards_per_play"] as? NSNumber)?.stringValue,
            receivingYardsPerGame: dict["receiving_yards_per_game"] as? String ?? (dict["receiving_yards_per_game"] as? NSNumber)?.stringValue,
            receivingTds: dict["receiving_tds"] as? String ?? (dict["receiving_tds"] as? NSNumber)?.stringValue,
            yardsPerCatch: dict["yards_per_catch"] as? String ?? (dict["yards_per_catch"] as? NSNumber)?.stringValue,
            longestPass: dict["longest_pass"] as? String ?? (dict["longest_pass"] as? NSNumber)?.stringValue,
            longestRush: dict["longest_rush"] as? String ?? (dict["longest_rush"] as? NSNumber)?.stringValue,
            temperature: dict["temperature"] as? String,
            feelsLike: dict["feels_like"] as? String,
            windSpeed: dict["wind_speed"] as? String,
            conditions: dict["conditions"] as? String,
            impact: dict["impact"] as? String,
            // NCAAB/NCAAF specific stats (pointsPerGame already assigned above)
            assistsPerGame: dict["assists_per_game"] as? String ?? (dict["assists_per_game"] as? NSNumber)?.stringValue,
            reboundsPerGame: dict["rebounds_per_game"] as? String ?? (dict["rebounds_per_game"] as? NSNumber)?.stringValue,
            stealsPerGame: dict["steals_per_game"] as? String ?? (dict["steals_per_game"] as? NSNumber)?.stringValue,
            blocksPerGame: dict["blocks_per_game"] as? String ?? (dict["blocks_per_game"] as? NSNumber)?.stringValue,
            fgPct: dict["fg_pct"] as? String ?? (dict["fg_pct"] as? NSNumber)?.stringValue,
            fgmPerGame: dict["fgm_per_game"] as? String ?? (dict["fgm_per_game"] as? NSNumber)?.stringValue,
            fgaPerGame: dict["fga_per_game"] as? String ?? (dict["fga_per_game"] as? NSNumber)?.stringValue,
            drebPerGame: dict["dreb_per_game"] as? String ?? (dict["dreb_per_game"] as? NSNumber)?.stringValue,
            // NCAAB enriched stats
            tempo: dict["tempo"] as? String ?? (dict["tempo"] as? NSNumber)?.stringValue,
            apRank: dict["ap_rank"] as? String ?? (dict["ap_rank"] as? NSNumber)?.stringValue,
            coachesRank: dict["coaches_rank"] as? String ?? (dict["coaches_rank"] as? NSNumber)?.stringValue,
            conferenceRecord: dict["conference_record"] as? String,
            netRank: dict["net_rank"] as? String ?? (dict["net_rank"] as? NSNumber)?.stringValue,
            sosRank: dict["sos_rank"] as? String ?? (dict["sos_rank"] as? NSNumber)?.stringValue,
            kenpomRank: dict["kenpom_rank"] as? String ?? (dict["kenpom_rank"] as? NSNumber)?.stringValue,
            // NHL-specific stats
            goalsForPerGame: dict["goals_for_per_game"] as? String ?? (dict["goals_for_per_game"] as? NSNumber)?.stringValue,
            goalsAgainstPerGame: dict["goals_against_per_game"] as? String ?? (dict["goals_against_per_game"] as? NSNumber)?.stringValue,
            powerPlayPct: dict["power_play_pct"] as? String ?? (dict["power_play_pct"] as? NSNumber)?.stringValue,
            penaltyKillPct: dict["penalty_kill_pct"] as? String ?? (dict["penalty_kill_pct"] as? NSNumber)?.stringValue,
            shotsFor: dict["shots_for"] as? String ?? (dict["shots_for"] as? NSNumber)?.stringValue,
            shotsAgainst: dict["shots_against"] as? String ?? (dict["shots_against"] as? NSNumber)?.stringValue,
            shotDifferential: dict["differential"] as? String ?? (dict["differential"] as? NSNumber)?.stringValue,
            savePct: dict["save_pct"] as? String ?? (dict["save_pct"] as? NSNumber)?.stringValue,
            goalsAgainstAvg: dict["goals_against_avg"] as? String ?? (dict["goals_against_avg"] as? NSNumber)?.stringValue ?? (dict["gaa"] as? NSNumber)?.stringValue,
            faceoffPct: dict["faceoff_pct"] as? String ?? (dict["faceoff_pct"] as? NSNumber)?.stringValue,
            // NCAAF BDL-specific stats (from stat router)
            totalYpg: dict["total_ypg"] as? String ?? (dict["total_ypg"] as? NSNumber)?.stringValue,
            passingYpg: dict["passing_ypg"] as? String ?? (dict["passing_ypg"] as? NSNumber)?.stringValue,
            rushingYpg: dict["rushing_ypg"] as? String ?? (dict["rushing_ypg"] as? NSNumber)?.stringValue,
            totalTds: dict["total_tds"] as? String ?? (dict["total_tds"] as? NSNumber)?.stringValue,
            interceptionsThrown: dict["interceptions_thrown"] as? String ?? (dict["interceptions_thrown"] as? NSNumber)?.stringValue,
            oppPassingYards: dict["opp_passing_yards"] as? String ?? (dict["opp_passing_yards"] as? NSNumber)?.stringValue,
            passingYards: dict["passing_yards"] as? String ?? (dict["passing_yards"] as? NSNumber)?.stringValue,
            rushingYards: dict["rushing_yards"] as? String ?? (dict["rushing_yards"] as? NSNumber)?.stringValue,
            totalYards: dict["total_yards"] as? String ?? (dict["total_yards"] as? NSNumber)?.stringValue,
            passingInts: dict["passing_ints"] as? String ?? (dict["passing_ints"] as? NSNumber)?.stringValue
        )
    }
    
    /// Get the primary display value for this stat based on the token
    func getValue(for token: String) -> String {
        switch token {
        // NBA/NCAAB stats
        case "OFFENSIVE_RATING": return offensiveRating ?? "N/A"
        case "DEFENSIVE_RATING": return defensiveRating ?? "N/A"
        case "NET_RATING", "EFFICIENCY_LAST_10", "ADJ_EFFICIENCY_MARGIN", "SP_PLUS_RATINGS": return netRating ?? "N/A"
        case "PACE", "PACE_LAST_10": return pace ?? "N/A"
        case "PACE_HOME_AWAY", "HOME_AWAY_SPLITS", "SPECIAL_TEAMS": return overall ?? "N/A"
        case "EFG_PCT", "OPP_EFG_PCT", "PAINT_SCORING": return efgPct ?? "N/A"
        case "THREE_PT_SHOOTING", "PERIMETER_DEFENSE", "THREE_PCT": return threePct ?? "N/A"
        case "TURNOVER_RATE", "TOV_RATE": return turnoversPerGame ?? tovRate ?? "N/A"
        case "TURNOVERS_PER_GAME": return turnoversPerGame ?? "N/A"
        case "OREB_RATE": return orebPerGame ?? orebRate ?? "N/A"
        case "OREB_PER_GAME": return orebPerGame ?? "N/A"
        case "FT_RATE": return ftRate ?? "N/A"
        case "FT_PCT": return ftPct ?? "N/A"
        case "FTA_PER_GAME": return ftaPerGame ?? "N/A"
        case "CLUTCH_STATS", "CLOSE_RECORD": return closeRecord ?? "N/A"
        case "CLOSE_WIN_PCT": return closeWinPct ?? "N/A"
        case "CLOSE_GAMES": return closeGames != nil ? String(closeGames!) : "N/A"
        case "RECENT_FORM": return last5 ?? "N/A"
        // Additional NBA stats
        case "TRUE_SHOOTING_PCT": return trueShootingPct ?? "N/A"
        case "THREE_MADE_PER_GAME": return threeMadePerGame ?? "N/A"
        case "THREE_ATTEMPTED_PER_GAME": return threeAttemptedPerGame ?? threePct ?? "N/A"
        case "OVERALL": return overall ?? "N/A"
        case "HOME_RECORD": return homeRecord ?? "N/A"
        case "AWAY_RECORD": return awayRecord ?? "N/A"
        case "GAMES_PLAYED": return gamesPlayed ?? overall ?? "N/A"
        // NFL/NCAAF bundled stats (legacy)
        case "OFFENSIVE_EPA", "SUCCESS_RATE": return totalYardsPerGame ?? yardsPerGame ?? pointsPerGame ?? "N/A"
        case "DEFENSIVE_EPA": return oppTotalYards ?? oppYardsPerGame ?? "N/A"
        case "SUCCESS_RATE_OFFENSE", "EXPLOSIVE_PLAYS": return yardsPerGame ?? totalYardsPerGame ?? "N/A"
        case "SUCCESS_RATE_DEFENSE", "EXPLOSIVE_ALLOWED": return oppYardsPerGame ?? oppTotalYards ?? "N/A"
        case "EPA_LAST_5", "EARLY_DOWN_SUCCESS": return pointsPerGame ?? "N/A"
        case "TURNOVER_MARGIN": return turnoverDiff ?? "N/A"
        case "QB_STATS": return qbRating ?? "N/A"
        case "PRESSURE_RATE": return completionPct ?? "N/A"
        case "RED_ZONE_OFFENSE", "RED_ZONE", "THIRD_DOWN": return thirdDownPct ?? "N/A"
        case "RED_ZONE_DEFENSE": return thirdDownPct ?? "N/A"
        case "FOURTH_DOWN": return fourthDownPct ?? "N/A"
        case "OL_RANKINGS": return rushingYardsPerGame ?? "N/A"
        case "DL_RANKINGS": return oppRushingYards ?? "N/A"
        case "RB_STATS": return yardsPerCarry ?? rushingYardsPerGame ?? "N/A"
        case "WR_STATS", "WR_TE_STATS": return receivingYardsPerGame ?? yardsPerGame ?? "N/A"
        case "DEFENSIVE_PLAYMAKERS", "DEFENSIVE_STARS": return oppPointsPerGame ?? "N/A"
        // NCAAF-specific advanced stats
        case "EXPLOSIVENESS": return yardsPerPlay ?? totalYardsPerGame ?? "N/A"
        case "HAVOC_RATE": return sacks ?? "N/A"
        case "SPECIAL_TEAMS_RATING": return overall ?? "N/A"
        case "TALENT_COMPOSITE": return overall ?? "N/A"
        case "FIELD_POSITION": return yardsPerGame ?? "N/A"
        // NEW: Individual NFL/NCAAF stat tokens (flattened)
        case "POINTS_PER_GAME", "PPG": return pointsPerGame ?? "N/A"
        case "YARDS_PER_GAME", "YPG", "TOTAL_YARDS_PER_GAME", "TOTAL_YPG": return totalYpg ?? yardsPerGame ?? totalYardsPerGame ?? "N/A"
        case "YARDS_PER_PLAY": return yardsPerPlay ?? yardsPerGame ?? "N/A"
        case "OPP_POINTS_PER_GAME", "OPP_PPG": return oppPointsPerGame ?? "N/A"
        case "OPP_YARDS_PER_GAME", "OPP_YPG", "OPP_TOTAL_YARDS": return oppTotalYards ?? oppYardsPerGame ?? "N/A"
        case "POINT_DIFF": return pointDiff ?? "N/A"
        case "THIRD_DOWN_PCT": return thirdDownPct ?? "N/A"
        case "FOURTH_DOWN_PCT": return fourthDownPct ?? "N/A"
        case "TURNOVER_DIFF": return turnoverDiff ?? "N/A"
        case "TAKEAWAYS": return takeaways ?? "N/A"
        case "GIVEAWAYS": return giveaways ?? "N/A"
        case "SACKS": return sacks ?? "N/A"
        case "QB_RATING": return qbRating ?? "N/A"
        case "COMPLETION_PCT": return completionPct ?? "N/A"
        case "YARDS_PER_ATTEMPT": return yardsPerAttempt ?? yardsPerGame ?? "N/A"
        case "PASSING_TDS", "PASS_TDS": return passingTds ?? "N/A"
        case "INTERCEPTIONS", "INTS", "INTERCEPTIONS_THROWN": return interceptionsThrown ?? interceptions ?? "N/A"
        case "RUSHING_TDS", "RUSH_TDS": return rushingTds ?? "N/A"
        case "RUSHING_YARDS_PER_GAME", "RUSH_YPG", "RUSHING_YPG": return rushingYpg ?? rushingYardsPerGame ?? "N/A"
        case "PASSING_YPG": return passingYpg ?? "N/A"
        case "TOTAL_TDS": return totalTds ?? "N/A"
        case "OPP_PASSING_YARDS": return oppPassingYards ?? "N/A"
        case "OPP_RUSHING_YARDS": return oppRushingYards ?? "N/A"
        case "TOTAL_YARDS": return totalYards ?? "N/A"
        case "PASSING_YARDS": return passingYards ?? "N/A"
        case "RUSHING_YARDS": return rushingYards ?? "N/A"
        case "YARDS_PER_CARRY": return yardsPerCarry ?? "N/A"
        case "RECEIVING_YARDS_PER_GAME", "RECV_YPG": return receivingYardsPerGame ?? "N/A"
        case "RECEIVING_TDS", "RECV_TDS": return receivingTds ?? "N/A"
        case "YARDS_PER_CATCH": return yardsPerCatch ?? "N/A"
        case "LONGEST_PASS": return longestPass ?? "N/A"
        case "LAST_5": return last5 ?? "N/A"
        case "SUMMARY": return overall ?? "N/A"
        case "LONGEST_RUSH": return longestRush ?? "N/A"
        // Weather stats
        case "TEMPERATURE": return temperature ?? "N/A"
        case "FEELS_LIKE": return feelsLike ?? "N/A"
        case "WIND_SPEED": return windSpeed ?? "N/A"
        case "CONDITIONS": return conditions ?? "N/A"
        case "IMPACT": return impact ?? "N/A"
        // NCAAB/NCAAF specific stats
        case "SCORING": return pointsPerGame ?? "N/A"
        case "ASSISTS": return assistsPerGame ?? "N/A"
        case "REBOUNDS": return reboundsPerGame ?? "N/A"
        case "STEALS": return stealsPerGame ?? "N/A"
        case "BLOCKS": return blocksPerGame ?? "N/A"
        case "FG_PCT": return fgPct ?? efgPct ?? "N/A"
        // NCAAB Barttorvik Tale of Tape tokens
        case "ADJOE": return offensiveRating ?? "N/A"
        case "ADJDE": return defensiveRating ?? "N/A"
        case "ADJEM": return netRating ?? "N/A"
        case "TEMPO": return tempo ?? "N/A"
        case "T_RANK": return kenpomRank ?? "N/A"
        case "BARTHAG": return efgPct ?? "N/A"
        case "L5_FORM": return last5 ?? "N/A"
        case "RECORD": return overall ?? "N/A"
        case "CONF_RECORD": return conferenceRecord ?? "N/A"
        // NCAAB enriched tokens
        case "NCAAB_EFG_PCT": return efgPct ?? "N/A"
        case "NCAAB_TEMPO": return tempo ?? "N/A"
        case "NCAAB_OFFENSIVE_RATING": return offensiveRating ?? "N/A"
        case "NCAAB_AP_RANKING": return apRank ?? "N/A"
        case "NCAAB_COACHES_RANKING": return coachesRank ?? "N/A"
        case "NCAAB_CONFERENCE_RECORD": return conferenceRecord ?? "N/A"
        case "NCAAB_NET_RANKING": return netRank ?? "N/A"
        case "NCAAB_STRENGTH_OF_SCHEDULE": return sosRank ?? "N/A"
        case "NCAAB_KENPOM_RATINGS": return kenpomRank ?? "N/A"
        // NCAAF BDL stat tokens
        case "NCAAF_TOTAL_OFFENSE": return totalYpg ?? totalYardsPerGame ?? yardsPerGame ?? "N/A"
        case "NCAAF_PASSING_OFFENSE": return passingYpg ?? "N/A"
        case "NCAAF_RUSHING_OFFENSE": return rushingYpg ?? rushingYardsPerGame ?? "N/A"
        case "NCAAF_SCORING": return totalTds ?? "N/A"
        case "NCAAF_DEFENSE": return oppTotalYards ?? oppYardsPerGame ?? "N/A"
        case "NCAAF_TURNOVER_MARGIN": return interceptionsThrown ?? interceptions ?? turnoverDiff ?? "N/A"
        case "NCAAF_RED_ZONE_OFFENSE": return thirdDownPct ?? "N/A"
        // NHL verified Tale of Tape tokens (from label.toUpperCase)
        case "GOALS_FOR_GM": return goalsForPerGame ?? "N/A"
        case "GOALS_AGST_GM": return goalsAgainstPerGame ?? "N/A"
        case "SHOTS_FOR_GM": return shotsFor ?? "N/A"
        case "POWER_PLAY__": return powerPlayPct ?? "N/A"
        case "PENALTY_KILL__": return penaltyKillPct ?? "N/A"
        case "FACEOFF_WIN__": return faceoffPct ?? "N/A"
        case "SAVE__": return savePct ?? "N/A"
        // NHL-specific stats (from toolCallHistory)
        case "GOALS_FOR": return goalsForPerGame ?? "N/A"
        case "GOALS_AGAINST": return goalsAgainstPerGame ?? "N/A"
        case "GOAL_DIFFERENTIAL": return shotDifferential ?? "N/A"
        case "POWER_PLAY_PCT": return powerPlayPct ?? "N/A"
        case "PENALTY_KILL_PCT": return penaltyKillPct ?? "N/A"
        case "SHOTS_FOR": return shotsFor ?? "N/A"
        case "SHOTS_AGAINST": return shotsAgainst ?? "N/A"
        case "SHOT_DIFFERENTIAL", "SHOT_QUALITY": return shotDifferential ?? shotsFor ?? "N/A"
        case "EXPECTED_GOALS", "CORSI_FOR_PCT", "PDO": return shotsFor ?? shotDifferential ?? "N/A"
        case "SAVE_PCT", "GOALIE_STATS", "GOALIE_MATCHUP": return savePct ?? goalsAgainstAvg ?? "N/A"
        case "GOALS_AGAINST_AVG": return goalsAgainstAvg ?? "N/A"
        case "FACEOFF_PCT", "POSSESSION_METRICS": return faceoffPct ?? "N/A"
        case "HOME_ICE", "REST_SITUATION", "BACK_TO_BACK": return overall ?? "N/A"
        case "HIGH_DANGER_CHANCES": return shotsFor ?? "N/A"
        case "TOP_SCORERS", "LINE_COMBINATIONS": return overall ?? "N/A"
        default: return offensiveRating ?? defensiveRating ?? netRating ?? overall ?? totalYardsPerGame ?? pointsPerGame ?? goalsForPerGame ?? "N/A"
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
    let commence_time: String?  // ISO format for sorting/grouping by game time
    let tdCategory: String?  // "standard" or "underdog" for TD scorer picks
    let matchup: String?     // Game matchup for TD picks
    let key_stats: [String]?  // 3-4 bullet points with key stats supporting the pick
    
    // CodingKeys to map snake_case from JSON
    enum CodingKeys: String, CodingKey {
        case player, team, prop, bet, odds, confidence, analysis, league, sport, line, time, matchup, key_stats
        case commence_time = "commence_time"
        case tdCategory = "td_category"
    }
    
    var id: String {
        "\(team ?? player ?? "prop")-\(prop ?? "")-\(odds ?? "")-\(tdCategory ?? "")"
    }
    
    /// Whether this is a TD scorer pick
    var isTDPick: Bool {
        tdCategory != nil
    }
    
    /// Get the sport/league (checks both fields)
    /// Normalizes API format ("basketball_nba") to display format ("NBA")
    var effectiveLeague: String? {
        // Get the raw value from league or sport field
        let raw = (league?.isEmpty == false ? league : sport) ?? ""
        guard !raw.isEmpty else { return nil }
        
        let normalized = raw.lowercased()
        
        // Handle API sport keys like "basketball_nba" -> "NBA"
        if normalized.contains("nba") && !normalized.contains("wnba") { return "NBA" }
        if normalized.contains("nfl") { return "NFL" }
        if normalized.contains("nhl") { return "NHL" }
        if normalized.contains("ncaab") || normalized.contains("ncaam") { return "NCAAB" }
        if normalized.contains("ncaaf") { return "NCAAF" }
        if normalized.contains("epl") || normalized.contains("soccer_epl") || normalized.contains("premier") { return "EPL" }
        if normalized.contains("mlb") { return "MLB" }
        if normalized.contains("wnba") { return "WNBA" }
        
        return raw.uppercased()
    }
    
    /// Parse from dictionary (for manual JSON parsing)
    static func from(dict: [String: Any]) -> PropPick? {
        // Handle key_stats which may come as NSArray from JSON deserialization
        var keyStats: [String]? = nil
        if let statsArray = dict["key_stats"] as? [String] {
            keyStats = statsArray
        } else if let statsArray = dict["key_stats"] as? [Any] {
            // Convert NSArray elements to strings
            keyStats = statsArray.compactMap { $0 as? String }
        }
        
        return PropPick(
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
            time: dict["time"] as? String,
            commence_time: dict["commence_time"] as? String,
            tdCategory: dict["td_category"] as? String,
            matchup: dict["matchup"] as? String,
            key_stats: keyStats
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
    
    /// Get the effective league (normalized to match Sport enum values)
    var effectiveLeague: String? {
        guard let raw = league, !raw.isEmpty else { return nil }
        let normalized = raw.lowercased()
        
        // Handle API sport keys like "basketball_nba" -> "NBA"
        if normalized.contains("nba") && !normalized.contains("wnba") { return "NBA" }
        if normalized.contains("nfl") { return "NFL" }
        if normalized.contains("nhl") { return "NHL" }
        if normalized.contains("ncaab") || normalized.contains("ncaam") { return "NCAAB" }
        if normalized.contains("ncaaf") { return "NCAAF" }
        if normalized.contains("epl") || normalized.contains("soccer_epl") || normalized.contains("premier") { return "EPL" }
        if normalized.contains("mlb") { return "MLB" }
        if normalized.contains("wnba") { return "WNBA" }
        
        return raw.uppercased()
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
    
    /// Get the effective league (normalized to match Sport enum values)
    var effectiveLeague: String? {
        // First try to get from league or sport field
        let raw = (league?.isEmpty == false ? league : sport) ?? ""
        if !raw.isEmpty {
            let normalized = raw.lowercased()
            if normalized.contains("nba") && !normalized.contains("wnba") { return "NBA" }
            if normalized.contains("nfl") { return "NFL" }
            if normalized.contains("nhl") { return "NHL" }
            if normalized.contains("ncaab") || normalized.contains("ncaam") { return "NCAAB" }
            if normalized.contains("ncaaf") { return "NCAAF" }
            if normalized.contains("epl") || normalized.contains("soccer_epl") || normalized.contains("premier") { return "EPL" }
            if normalized.contains("mlb") { return "MLB" }
            if normalized.contains("wnba") { return "WNBA" }
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
        
        // NHL props
        if ["goals", "shots", "saves", "shots_on_goal", "points_nhl", "power_play"].contains(where: { propType.contains($0) }) {
            return "NHL"
        }
        
        // MLB props
        if ["hits", "total_bases", "home_runs", "rbis", "runs", "strikeouts", "walks",
            "stolen_bases", "pitching", "earned_runs", "innings"].contains(where: { propType.contains($0) }) {
            return "MLB"
        }
        
        // EPL/Soccer props
        if ["goal_scorer", "shots_target", "fouls", "cards", "corners", "offsides"].contains(where: { propType.contains($0) }) {
            return "EPL"
        }
        
        return nil
    }
    
    /// Whether this is a TD scorer result (NFL anytime TD picks)
    var isTDResult: Bool {
        let propLower = (prop_type ?? "").lowercased()
        let pickLower = (pick_text ?? "").lowercased()
        return propLower.contains("anytime") && propLower.contains("td") ||
               pickLower.contains("anytime") && pickLower.contains("td") ||
               propLower == "anytime_td" ||
               propLower == "td_scorer"
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

// MARK: - DFS (Gary's Fantasy) Models

/// Represents a complete DFS lineup for a platform/sport combination
struct DFSLineup: Identifiable, Decodable {
    let id: String?
    let date: String
    let platform: String  // "draftkings" or "fanduel"
    let sport: String     // "NBA" or "NFL"
    let slate_name: String?      // NEW: "Main", "Turbo", "Night"
    let slate_start_time: String? // NEW: "7:00 PM ET"
    let salary_cap: Int
    let total_salary: Int
    let projected_points: Double
    let lineup: [DFSPlayer]
    let gary_notes: String?
    let ceiling_projection: Double?
    let floor_projection: Double?
    let archetype: String?
    let build_thesis: String?
    let harmony_reasoning: String?
    let slate_game_count: Int?

    var displayId: String { id ?? "\(platform)-\(sport)-\(date)-\(slate_name ?? "Main")" }
    
    /// Formatted salary display (e.g., "$49,700 / $50,000")
    var salaryDisplay: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        let used = formatter.string(from: NSNumber(value: total_salary)) ?? "$\(total_salary)"
        let cap = formatter.string(from: NSNumber(value: salary_cap)) ?? "$\(salary_cap)"
        return "\(used) / \(cap)"
    }
    
    /// Salary remaining under cap
    var salaryRemaining: Int {
        salary_cap - total_salary
    }
    
    /// Platform display name
    var platformDisplayName: String {
        platform == "draftkings" ? "DraftKings" : "FanDuel"
    }
    
    /// Parse from dictionary
    static func from(dict: [String: Any]) -> DFSLineup? {
        guard let date = dict["date"] as? String,
              let platform = dict["platform"] as? String,
              let sport = dict["sport"] as? String,
              let salaryCap = dict["salary_cap"] as? Int,
              let totalSalary = dict["total_salary"] as? Int,
              let projectedPoints = dict["projected_points"] as? Double else {
            return nil
        }
        
        // Parse lineup array
        var players: [DFSPlayer] = []
        if let lineupArray = dict["lineup"] as? [[String: Any]] {
            players = lineupArray.compactMap { DFSPlayer.from(dict: $0) }
        }
        
        // Parse ceiling/floor — may be Int or Double from JSON
        let ceiling: Double? = (dict["ceiling_projection"] as? Double) ?? (dict["ceiling_projection"] as? Int).map(Double.init)
        let floor: Double? = (dict["floor_projection"] as? Double) ?? (dict["floor_projection"] as? Int).map(Double.init)

        return DFSLineup(
            id: dict["id"] as? String,
            date: date,
            platform: platform,
            sport: sport,
            slate_name: dict["slate_name"] as? String,
            slate_start_time: dict["slate_start_time"] as? String,
            salary_cap: salaryCap,
            total_salary: totalSalary,
            projected_points: projectedPoints,
            lineup: players,
            gary_notes: dict["gary_notes"] as? String,
            ceiling_projection: ceiling,
            floor_projection: floor,
            archetype: dict["archetype"] as? String,
            build_thesis: dict["build_thesis"] as? String,
            harmony_reasoning: dict["harmony_reasoning"] as? String,
            slate_game_count: dict["slate_game_count"] as? Int
        )
    }
}

/// Represents a single player slot in a DFS lineup
struct DFSPlayer: Identifiable, Decodable {
    let position: String          // "QB", "RB", "WR", etc.
    let player: String            // Player name
    let team: String              // Team abbreviation
    let salary: Int               // Salary in dollars
    let projected_pts: Double     // Projected fantasy points
    let rationale: String?        // Gary's reasoning for this pick
    let supportingStats: [DFSStat]? // 3-4 stats backing up the pick
    let pivots: [DFSPivot]        // Alternative player options
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NEW DFS METRICS - Enhanced data for smarter lineup decisions
    // ═══════════════════════════════════════════════════════════════════════════
    
    /// Projected ownership % (for contrarian plays)
    let ownership: Double?
    
    /// Value score (points per $1K salary) - 5x is baseline, 6x+ is elite
    let valueScore: Double?
    
    /// Recent form: "hot" (last 5 > season avg), "cold" (below), "neutral"
    let recentForm: String?
    
    /// Defense vs Position rank (1 = worst defense/easiest matchup, 30 = toughest)
    let dvpRank: Int?
    
    /// Is this a revenge game (vs former team)?
    let isRevenge: Bool?
    
    /// Is this a back-to-back game? (may rest/underperform)
    let isB2B: Bool?
    
    /// Usage boost when teammate is out
    let usageBoost: String?
    
    /// Blowout risk (starters may sit in 4th quarter)
    let blowoutRisk: Bool?
    
    // NFL-specific fields
    /// Snap count percentage (opportunity indicator)
    let snapPct: Int?
    
    /// Target share percentage (% of team's targets)
    let targetShare: Double?
    
    /// Red zone targets (TD upside indicator)
    let redZoneTargets: Int?
    
    /// Weather impact: "none", "positive", "negative"
    let weatherImpact: String?
    
    var id: String { "\(position)-\(player)-\(team)" }
    
    /// Formatted salary (e.g., "$7,800")
    var salaryFormatted: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: salary)) ?? "$\(salary)"
    }
    
    /// Has rationale to display
    var hasRationale: Bool {
        rationale != nil && !(rationale?.isEmpty ?? true)
    }
    
    /// Is this player a value play? (5x+ value score)
    var isValuePlay: Bool {
        (valueScore ?? 0) >= 5.0
    }
    
    /// Is this player elite value? (6x+ value score)
    var isEliteValue: Bool {
        (valueScore ?? 0) >= 6.0
    }
    
    /// Is this a low-owned contrarian play? (<8% ownership)
    var isContrarian: Bool {
        guard let own = ownership else { return false }
        return own < 8.0
    }
    
    /// Is this a chalk play? (>20% ownership)
    var isChalk: Bool {
        guard let own = ownership else { return false }
        return own >= 20.0
    }
    
    /// Is the player on a hot streak?
    var isHot: Bool {
        recentForm == "hot"
    }
    
    /// Is the player on a cold streak?
    var isCold: Bool {
        recentForm == "cold"
    }
    
    /// Has a favorable matchup? (DvP rank 1-10)
    var hasFavorableMatchup: Bool {
        guard let rank = dvpRank else { return false }
        return rank <= 10
    }
    
    /// Formatted ownership (e.g., "12.5%")
    var ownershipFormatted: String {
        guard let own = ownership else { return "" }
        return String(format: "%.1f%%", own)
    }
    
    /// Formatted value score (e.g., "5.2x")
    var valueScoreFormatted: String {
        guard let vs = valueScore else { return "" }
        return String(format: "%.1fx", vs)
    }
    
    /// Parse from dictionary
    static func from(dict: [String: Any]) -> DFSPlayer? {
        guard let position = dict["position"] as? String,
              let player = dict["player"] as? String,
              let team = dict["team"] as? String,
              let salary = dict["salary"] as? Int else {
            return nil
        }
        // Accept both "projected_pts" (iOS convention) and "projected_points" (backend convention)
        let projectedPts = (dict["projected_pts"] as? Double) ?? (dict["projected_points"] as? Double) ?? 0.0
        
        // Parse pivots array
        var pivots: [DFSPivot] = []
        if let pivotsArray = dict["pivots"] as? [[String: Any]] {
            pivots = pivotsArray.compactMap { DFSPivot.from(dict: $0) }
        }
        
        // Parse supporting stats array
        var supportingStats: [DFSStat] = []
        if let statsArray = dict["supportingStats"] as? [[String: Any]] {
            supportingStats = statsArray.compactMap { DFSStat.from(dict: $0) }
        }
        
        return DFSPlayer(
            position: position,
            player: player,
            team: team,
            salary: salary,
            projected_pts: projectedPts,
            rationale: (dict["rationale"] as? String) ?? (dict["reasoning"] as? String),
            supportingStats: supportingStats.isEmpty ? nil : supportingStats,
            pivots: pivots,
            // New DFS metrics
            ownership: dict["ownership"] as? Double,
            valueScore: dict["valueScore"] as? Double,
            recentForm: dict["recentForm"] as? String,
            dvpRank: dict["dvpRank"] as? Int,
            isRevenge: dict["isRevenge"] as? Bool,
            isB2B: dict["isB2B"] as? Bool,
            usageBoost: dict["usageBoost"] as? String,
            blowoutRisk: dict["blowoutRisk"] as? Bool,
            snapPct: dict["snapPct"] as? Int,
            targetShare: dict["targetShare"] as? Double,
            redZoneTargets: dict["redZoneTargets"] as? Int,
            weatherImpact: dict["weatherImpact"] as? String
        )
    }
}

/// Represents a supporting stat for player rationale
struct DFSStat: Identifiable, Decodable {
    let label: String   // "PPG", "RPG", "Value", etc.
    let value: String   // "25.3", "4.2x", etc.
    
    var id: String { "\(label)-\(value)" }
    
    /// Parse from dictionary
    static func from(dict: [String: Any]) -> DFSStat? {
        guard let label = dict["label"] as? String,
              let value = dict["value"] as? String else {
            return nil
        }
        return DFSStat(label: label, value: value)
    }
}

/// Represents a pivot (alternative) player option
struct DFSPivot: Identifiable, Decodable {
    let tier: String          // "direct", "mid", "budget"
    let tierLabel: String?    // "Direct Swap", "Mid Value", "Budget Play"
    let tierDescription: String? // "Similar ceiling", "Save ~$1K", "Punt spot"
    let player: String
    let team: String
    let salary: Int
    let projected_pts: Double
    let salaryDiff: Int?      // Difference from starter's salary
    let rationale: String?    // Why this is a good alternative
    
    var id: String { "\(tier)-\(player)-\(team)" }
    
    /// Is this swap saving money?
    var savesMoney: Bool {
        (salaryDiff ?? 0) < 0
    }
    
    /// Is this swap costing more?
    var costsMore: Bool {
        (salaryDiff ?? 0) > 0
    }
    
    /// Formatted salary (e.g., "$7,800")
    var salaryFormatted: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: salary)) ?? "$\(salary)"
    }
    
    /// Formatted salary difference (e.g., "$100" or "$1,200") - no sign, arrow shows direction
    var salaryDiffFormatted: String {
        guard let diff = salaryDiff else { return "" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: abs(diff))) ?? "$\(abs(diff))"
    }
    
    /// Display label for the tier
    var displayLabel: String {
        tierLabel ?? tier.capitalized
    }
    
    /// Color for tier badge
    var tierColor: String {
        switch tier {
        case "direct": return "#3B82F6" // Blue
        case "mid": return "#F59E0B"    // Amber
        case "budget": return "#10B981" // Green
        default: return "#6B7280"       // Gray
        }
    }
    
    /// Parse from dictionary
    static func from(dict: [String: Any]) -> DFSPivot? {
        guard let tier = dict["tier"] as? String,
              let player = dict["player"] as? String,
              let team = dict["team"] as? String,
              let salary = dict["salary"] as? Int,
              let projectedPts = dict["projected_pts"] as? Double else {
            return nil
        }
        
        return DFSPivot(
            tier: tier,
            tierLabel: dict["tierLabel"] as? String,
            tierDescription: dict["tierDescription"] as? String,
            player: player,
            team: team,
            salary: salary,
            projected_pts: projectedPts,
            salaryDiff: dict["salaryDiff"] as? Int,
            rationale: dict["rationale"] as? String
        )
    }
}

/// DFS Platform enum for toggle
enum DFSPlatform: String, CaseIterable {
    case draftkings = "draftkings"
    case fanduel = "fanduel"
    
    var displayName: String {
        switch self {
        case .draftkings: return "DraftKings"
        case .fanduel: return "FanDuel"
        }
    }
    
    var abbreviation: String {
        switch self {
        case .draftkings: return "DK"
        case .fanduel: return "FD"
        }
    }
}
