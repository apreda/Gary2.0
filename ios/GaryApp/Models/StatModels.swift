import Foundation
import CoreFoundation

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
    let last10: String?
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
    // NCAAB Barttorvik
    let wab: String?
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
    // NHL advanced stats (MoneyPuck + NHL API)
    let corsiPct: String?
    let xgPct: String?
    let pdoStat: String?
    let shPct5v5: String?
    let svPct5v5: String?
    // Soccer / World Cup
    let groupPos: String?
    let points: String?
    let goalsFor: String?
    let goalsAgainst: String?
    let expectedGoals: String?
    let expectedGoalsAgainst: String?
    let possessionPct: String?
    let shots: String?
    let shotsOnTarget: String?
    let bigChances: String?
    let passAccuracy: String?
    let corners: String?
    // Futures-implied strength (always available pre-tournament)
    let advancePct: String?
    let titleOdds: String?
    // NCAAB Barttorvik rankings
    let adjoeRank: String?
    let adjdeRank: String?
    let projRecord: String?
    // MLB stats
    let l10: String?
    let homeAway: String?
    let spEra: String?
    let spWhip: String?
    let spK9: String?
    let spBb9: String?
    let spRecord: String?
    let spIp: String?
    let spSo: String?
    let teamAvg: String?
    let teamObp: String?
    let teamSlg: String?
    let teamOps: String?
    let teamHr: String?
    let teamEra: String?
    let runsPerGame: String?
    let spStarts: String?
    // MLB context stats
    let game1Result: String?
    let spName: String?
    let mlOdds: String?
    let runLine: String?
    let venueName: String?
    let lastPlayed: String?
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

    // CodingKeys to map snake_case JSON keys from backend
    enum CodingKeys: String, CodingKey {
        case team, overall, pace, tempo, wab, interceptions, sacks, giveaways, takeaways, conditions, impact, temperature
        case homeRecord = "home_record"
        case awayRecord = "away_record"
        case offensiveRating = "offensive_rating"
        case defensiveRating = "defensive_rating"
        case netRating = "net_rating"
        case efgPct = "efg_pct"
        case threePct = "three_pct"
        case threeMadePerGame = "three_made_per_game"
        case threeAttemptedPerGame = "three_attempted_per_game"
        case gamesPlayed = "games_played"
        // Soccer / World Cup
        case groupPos = "group_pos"
        case points
        case goalsFor = "goals_for"
        case goalsAgainst = "goals_against"
        case expectedGoals = "expected_goals"
        case expectedGoalsAgainst = "expected_goals_against"
        case possessionPct = "possession_pct"
        case shots
        case shotsOnTarget = "shots_on_target"
        case bigChances = "big_chances"
        case passAccuracy = "pass_accuracy"
        case corners
        case advancePct = "advance_pct"
        case titleOdds = "title_odds"
        case tovRate = "tov_rate"
        case turnoversPerGame = "turnovers_per_game"
        case orebRate = "oreb_rate"
        case orebPerGame = "oreb_per_game"
        case ftRate = "ft_rate"
        case ftPct = "ft_pct"
        case ftaPerGame = "fta_per_game"
        case closeGames = "close_games"
        case closeRecord = "close_record"
        case closeWinPct = "close_win_pct"
        case trueShootingPct = "true_shooting_pct"
        case totalYardsPerGame = "total_yards_per_game"
        case oppTotalYards = "opp_total_yards"
        case yardsPerGame = "yards_per_game"
        case oppYardsPerGame = "opp_yards_per_game"
        case pointsPerGame = "points_per_game"
        case oppPointsPerGame = "opp_points_per_game"
        case turnoverDiff = "turnover_diff"
        case qbRating = "qb_rating"
        case completionPct = "completion_pct"
        case thirdDownPct = "third_down_pct"
        case fourthDownPct = "fourth_down_pct"
        case rushingYardsPerGame = "rushing_yards_per_game"
        case oppRushingYards = "opp_rushing_yards"
        case yardsPerCarry = "yards_per_carry"
        case passingTds = "passing_tds"
        case rushingTds = "rushing_tds"
        case last5 = "last_5"
        case last10 = "last_10"
        case pointDiff = "point_diff"
        case yardsPerAttempt = "yards_per_attempt"
        case yardsPerPlay = "yards_per_play"
        case receivingYardsPerGame = "receiving_yards_per_game"
        case receivingTds = "receiving_tds"
        case yardsPerCatch = "yards_per_catch"
        case longestPass = "longest_pass"
        case longestRush = "longest_rush"
        case feelsLike = "feels_like"
        case windSpeed = "wind_speed"
        case assistsPerGame = "assists_per_game"
        case reboundsPerGame = "rebounds_per_game"
        case stealsPerGame = "steals_per_game"
        case blocksPerGame = "blocks_per_game"
        case fgPct = "fg_pct"
        case fgmPerGame = "fgm_per_game"
        case fgaPerGame = "fga_per_game"
        case drebPerGame = "dreb_per_game"
        case apRank = "ap_rank"
        case coachesRank = "coaches_rank"
        case conferenceRecord = "conference_record"
        case netRank = "net_rank"
        case sosRank = "sos_rank"
        case kenpomRank = "kenpom_rank"
        case goalsForPerGame = "goals_for_per_game"
        case goalsAgainstPerGame = "goals_against_per_game"
        case powerPlayPct = "power_play_pct"
        case penaltyKillPct = "penalty_kill_pct"
        case shotsFor = "shots_for"
        case shotsAgainst = "shots_against"
        case shotDifferential = "shot_differential"
        case savePct = "save_pct"
        case goalsAgainstAvg = "goals_against_avg"
        case faceoffPct = "faceoff_pct"
        case corsiPct = "corsi_pct"
        case xgPct = "xg_pct"
        case pdoStat = "pdo"
        case shPct5v5 = "sh_pct_5v5"
        case svPct5v5 = "sv_pct_5v5"
        case adjoeRank = "adjoe_rank"
        case adjdeRank = "adjde_rank"
        case projRecord = "proj_record"
        case l10 = "l10"
        case homeAway = "home_away"
        case spEra = "sp_era"
        case spWhip = "sp_whip"
        case spK9 = "sp_k9"
        case spBb9 = "sp_bb9"
        case spRecord = "sp_record"
        case spIp = "sp_ip"
        case spSo = "sp_so"
        case teamAvg = "team_avg"
        case teamObp = "team_obp"
        case teamSlg = "team_slg"
        case teamOps = "team_ops"
        case teamHr = "team_hr"
        case teamEra = "team_era"
        case runsPerGame = "runs_per_game"
        case spStarts = "sp_starts"
        case game1Result = "game1_result"
        case spName = "sp_name"
        case mlOdds = "ml_odds"
        case runLine = "run_line"
        case venueName = "venue_name"
        case lastPlayed = "last_played"
        case totalYpg = "total_ypg"
        case passingYpg = "passing_ypg"
        case rushingYpg = "rushing_ypg"
        case totalTds = "total_tds"
        case interceptionsThrown = "interceptions_thrown"
        case oppPassingYards = "opp_passing_yards"
        case passingYards = "passing_yards"
        case rushingYards = "rushing_yards"
        case totalYards = "total_yards"
        case passingInts = "passing_ints"
    }
    
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
            last10: dict["last_10"] as? String,
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
            // NCAAB Barttorvik
            wab: dict["wab"] as? String ?? (dict["wab"] as? NSNumber)?.stringValue,
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
            // NHL advanced stats (MoneyPuck + NHL API)
            corsiPct: dict["corsi_pct"] as? String ?? (dict["corsi_pct"] as? NSNumber)?.stringValue,
            xgPct: dict["xg_pct"] as? String ?? (dict["xg_pct"] as? NSNumber)?.stringValue,
            pdoStat: dict["pdo"] as? String ?? (dict["pdo"] as? NSNumber)?.stringValue,
            shPct5v5: dict["sh_pct_5v5"] as? String ?? (dict["sh_pct_5v5"] as? NSNumber)?.stringValue,
            svPct5v5: dict["sv_pct_5v5"] as? String ?? (dict["sv_pct_5v5"] as? NSNumber)?.stringValue,
            // Soccer / World Cup
            groupPos: dict["group_pos"] as? String ?? (dict["group_pos"] as? NSNumber)?.stringValue,
            points: dict["points"] as? String ?? (dict["points"] as? NSNumber)?.stringValue,
            goalsFor: dict["goals_for"] as? String ?? (dict["goals_for"] as? NSNumber)?.stringValue,
            goalsAgainst: dict["goals_against"] as? String ?? (dict["goals_against"] as? NSNumber)?.stringValue,
            expectedGoals: dict["expected_goals"] as? String ?? (dict["expected_goals"] as? NSNumber)?.stringValue,
            expectedGoalsAgainst: dict["expected_goals_against"] as? String ?? (dict["expected_goals_against"] as? NSNumber)?.stringValue,
            possessionPct: dict["possession_pct"] as? String ?? (dict["possession_pct"] as? NSNumber)?.stringValue,
            shots: dict["shots"] as? String ?? (dict["shots"] as? NSNumber)?.stringValue,
            shotsOnTarget: dict["shots_on_target"] as? String ?? (dict["shots_on_target"] as? NSNumber)?.stringValue,
            bigChances: dict["big_chances"] as? String ?? (dict["big_chances"] as? NSNumber)?.stringValue,
            passAccuracy: dict["pass_accuracy"] as? String ?? (dict["pass_accuracy"] as? NSNumber)?.stringValue,
            corners: dict["corners"] as? String ?? (dict["corners"] as? NSNumber)?.stringValue,
            advancePct: dict["advance_pct"] as? String ?? (dict["advance_pct"] as? NSNumber)?.stringValue,
            titleOdds: dict["title_odds"] as? String ?? (dict["title_odds"] as? NSNumber)?.stringValue,
            // NCAAB Barttorvik rankings
            adjoeRank: dict["adjoe_rank"] as? String,
            adjdeRank: dict["adjde_rank"] as? String,
            projRecord: dict["proj_record"] as? String,
            // MLB stats
            l10: dict["l10"] as? String,
            homeAway: dict["home_away"] as? String,
            spEra: dict["sp_era"] as? String,
            spWhip: dict["sp_whip"] as? String,
            spK9: dict["sp_k9"] as? String,
            spBb9: dict["sp_bb9"] as? String,
            spRecord: dict["sp_record"] as? String,
            spIp: dict["sp_ip"] as? String,
            spSo: dict["sp_so"] as? String,
            teamAvg: dict["team_avg"] as? String,
            teamObp: dict["team_obp"] as? String,
            teamSlg: dict["team_slg"] as? String,
            teamOps: dict["team_ops"] as? String,
            teamHr: dict["team_hr"] as? String,
            teamEra: dict["team_era"] as? String,
            runsPerGame: dict["runs_per_game"] as? String,
            spStarts: dict["sp_starts"] as? String,
            // MLB context stats
            game1Result: dict["game1_result"] as? String,
            spName: dict["sp_name"] as? String,
            mlOdds: dict["ml_odds"] as? String,
            runLine: dict["run_line"] as? String,
            venueName: dict["venue_name"] as? String,
            lastPlayed: dict["last_played"] as? String,
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
        case "CLOSE_GAMES": return closeGames.map(String.init) ?? "N/A"
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
        case "POINTS_PER_GAME", "POINTS_GM", "PPG": return pointsPerGame ?? "N/A"
        case "YARDS_PER_GAME", "YPG", "TOTAL_YARDS_PER_GAME", "TOTAL_YPG": return totalYpg ?? yardsPerGame ?? totalYardsPerGame ?? "N/A"
        case "YARDS_PER_PLAY": return yardsPerPlay ?? yardsPerGame ?? "N/A"
        case "OPP_POINTS_PER_GAME", "OPP_PTS_GM", "OPP_PPG": return oppPointsPerGame ?? "N/A"
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
        case "RUSHING_YARDS_PER_GAME", "RUSH_YDS_GM", "RUSH_YPG", "RUSHING_YPG": return rushingYpg ?? rushingYardsPerGame ?? "N/A"
        case "PASS_YDS_GM", "PASSING_YPG": return passingYpg ?? "N/A"
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
        // NBA verified Tale of Tape tokens
        case "OFF_RATING": return offensiveRating ?? "N/A"
        case "DEF_RATING": return defensiveRating ?? "N/A"
        case "L10_FORM": return last10 ?? "N/A"
        case "TS_PCT": return trueShootingPct ?? "N/A"
        case "RPG": return reboundsPerGame ?? "N/A"
        case "APG": return assistsPerGame ?? "N/A"
        case "3PT_PCT": return threePct ?? "N/A"
        case "TOV_GM": return turnoversPerGame ?? "N/A"
        case "OREB_GM": return orebPerGame ?? "N/A"
        case "DREB_GM": return drebPerGame ?? "N/A"
        // NCAAB Barttorvik Tale of Tape tokens
        case "ADJOE": return offensiveRating ?? "N/A"
        case "ADJDE": return defensiveRating ?? "N/A"
        case "ADJEM": return netRating ?? "N/A"
        case "TEMPO": return tempo ?? "N/A"
        case "T_RANK": return kenpomRank ?? "N/A"
        case "BARTHAG": return efgPct ?? "N/A"
        case "WAB": return wab ?? "N/A"
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
        // NCAAB Barttorvik ranking tokens
        case "ADJOE_RANK": return adjoeRank ?? "N/A"
        case "ADJDE_RANK": return adjdeRank ?? "N/A"
        case "PROJ_RECORD": return projRecord ?? "N/A"
        // NHL verified Tale of Tape tokens (from label.toUpperCase)
        case "GOALS_FOR_GM": return goalsForPerGame ?? "N/A"
        case "GOALS_AGST_GM": return goalsAgainstPerGame ?? "N/A"
        case "SHOTS_FOR_GM": return shotsFor ?? "N/A"
        case "PP_PCT", "POWER_PLAY__": return powerPlayPct ?? "N/A"
        case "PK_PCT", "PENALTY_KILL__": return penaltyKillPct ?? "N/A"
        case "FO_PCT", "FACEOFF_WIN__": return faceoffPct ?? "N/A"
        case "CORSI_PCT": return corsiPct ?? "N/A"
        case "XG_PCT": return xgPct ?? "N/A"
        case "SH_PCT_5V5": return shPct5v5 ?? "N/A"
        case "SV_PCT_5V5": return svPct5v5 ?? "N/A"
        // NHL-specific stats (from toolCallHistory)
        case "GOALS_FOR": return goalsForPerGame ?? "N/A"
        case "GOALS_AGAINST": return goalsAgainstPerGame ?? "N/A"
        case "GOAL_DIFFERENTIAL": return shotDifferential ?? "N/A"
        case "POWER_PLAY_PCT": return powerPlayPct ?? "N/A"
        case "PENALTY_KILL_PCT": return penaltyKillPct ?? "N/A"
        case "SHOTS_FOR": return shotsFor ?? "N/A"
        case "SHOTS_AGAINST": return shotsAgainst ?? "N/A"
        case "SHOT_DIFFERENTIAL", "SHOT_QUALITY": return shotDifferential ?? shotsFor ?? "N/A"
        case "PDO": return pdoStat ?? "N/A"
        // MLB stats
        case "L10", "L10_RECORD": return l10 ?? last10 ?? "N/A"
        case "HOME_AWAY", "HOME_AWAY_RECORD": return homeAway ?? "N/A"
        case "SP_ERA": return spEra ?? "N/A"
        case "SP_WHIP": return spWhip ?? "N/A"
        case "SP_K9": return spK9 ?? "N/A"
        case "SP_BB9": return spBb9 ?? "N/A"
        case "SP_RECORD": return spRecord ?? "N/A"
        case "SP_IP": return spIp ?? "N/A"
        case "SP_SO": return spSo ?? "N/A"
        case "POOL_RECORD": return overall ?? "N/A"
        case "TEAM_AVG": return teamAvg ?? "N/A"
        case "TEAM_OBP": return teamObp ?? "N/A"
        case "TEAM_SLG": return teamSlg ?? "N/A"
        case "TEAM_OPS": return teamOps ?? "N/A"
        case "TEAM_HR": return teamHr ?? "N/A"
        case "TEAM_ERA": return teamEra ?? "N/A"
        case "RUNS_PER_GAME": return runsPerGame ?? "N/A"
        case "SP_STARTS": return spStarts ?? "N/A"
        case "GAME1_RESULT": return game1Result ?? "N/A"
        case "SP_NAME": return spName ?? "N/A"
        case "ML_ODDS": return mlOdds ?? "N/A"
        case "RUN_LINE": return runLine ?? "N/A"
        case "VENUE": return venueName ?? "N/A"
        case "LAST_PLAYED": return lastPlayed ?? "N/A"
        case "EXPECTED_GOALS", "CORSI_FOR_PCT": return corsiPct ?? shotsFor ?? shotDifferential ?? "N/A"
        case "SAVE_PCT", "GOALIE_STATS", "GOALIE_MATCHUP": return savePct ?? goalsAgainstAvg ?? "N/A"
        case "GOALS_AGAINST_AVG": return goalsAgainstAvg ?? "N/A"
        case "FACEOFF_PCT", "POSSESSION_METRICS": return faceoffPct ?? "N/A"
        case "HOME_ICE", "REST_SITUATION", "BACK_TO_BACK": return overall ?? "N/A"
        case "HIGH_DANGER_CHANCES": return shotsFor ?? "N/A"
        case "TOP_SCORERS", "LINE_COMBINATIONS": return overall ?? "N/A"
        // Soccer / World Cup (tokens auto-derived from Tale-of-Tape row labels)
        case "GROUP_POS": return groupPos ?? "N/A"
        case "POINTS": return points ?? "N/A"
        case "GF_GM": return goalsFor ?? "N/A"
        case "GA_GM": return goalsAgainst ?? "N/A"
        case "XG": return expectedGoals ?? "N/A"
        case "XGA": return expectedGoalsAgainst ?? "N/A"
        case "POSSESSION": return possessionPct ?? "N/A"
        case "SHOTS_GM": return shots ?? "N/A"
        case "SOT_GM": return shotsOnTarget ?? "N/A"
        case "BIG_CHANCES": return bigChances ?? "N/A"
        case "PASS_ACC": return passAccuracy ?? "N/A"
        case "CORNERS_GM": return corners ?? "N/A"
        case "ADVANCE": return advancePct ?? "N/A"
        case "TITLE_ODDS": return titleOdds ?? "N/A"
        default: return offensiveRating ?? defensiveRating ?? netRating ?? overall ?? totalYardsPerGame ?? pointsPerGame ?? goalsForPerGame ?? "N/A"
        }
    }
}

