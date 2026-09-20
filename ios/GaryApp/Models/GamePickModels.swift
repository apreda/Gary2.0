import Foundation
import CoreFoundation

// MARK: - Pick Models

/// Poll context from this game's dated payload. Display-only: ranks must never
/// become part of a team key, a quoted ticket, or a game lookup.
struct CollegeTeamRankings: Equatable {
    let away: Int?
    let home: Int?

    static let unranked = CollegeTeamRankings(league: nil, away: nil, home: nil)

    init(league: String?, away: Int?, home: Int?) {
        let college = ["NCAAF", "NCAAB"].contains((league ?? "").uppercased())
        self.away = college ? away.flatMap { (1...25).contains($0) ? $0 : nil } : nil
        self.home = college ? home.flatMap { (1...25).contains($0) ? $0 : nil } : nil
    }

    var hasRankings: Bool { away != nil || home != nil }
    func tag(homeSide: Bool) -> String? { (homeSide ? home : away).map { "#\($0)" } }

    func label(_ name: String, homeSide: Bool) -> String {
        guard !name.isEmpty, let tag = tag(homeSide: homeSide) else { return name }
        return "\(tag) \(name)"
    }

    func matchup(away: String, home: String) -> String {
        "\(label(away, homeSide: false)) @ \(label(home, homeSide: true))"
    }

    func score(away: String, home: String, awayScore: Int, homeScore: Int) -> String {
        "\(label(away, homeSide: false)) \(awayScore) · \(label(home, homeSide: true)) \(homeScore)"
    }

    /// Callers supply one date's picks/slate only. A published pick owns its
    /// snapshot, including nil (unranked); a later slate cannot replace it.
    /// Explicit conflicting provider IDs never fall back to team names.
    static func resolve(league: String?, gameID: Int?, away: String, home: String,
                        picks: [GaryPick], slate: [DailySlateRow]) -> CollegeTeamRankings {
        let league = (league ?? "").uppercased()
        guard ["NCAAF", "NCAAB"].contains(league) else { return .unranked }
        func matches(_ candidateLeague: String?, _ candidateID: Int?, _ candidateAway: String?, _ candidateHome: String?) -> Bool {
            guard (candidateLeague ?? "").uppercased() == league else { return false }
            if let gameID, let candidateID { return gameID == candidateID }
            // Legacy payloads need both full school names in the same order.
            func key(_ text: String?) -> String {
                (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            }
            return !key(away).isEmpty && !key(home).isEmpty
                && key(candidateAway) == key(away) && key(candidateHome) == key(home)
        }
        let matchingPicks = picks.filter { matches($0.league, $0.game_id, $0.awayTeam, $0.homeTeam) }
        if let pick = matchingPicks.first(where: { gameID != nil && $0.game_id == gameID }) ?? matchingPicks.first {
            return pick.collegeRankings
        }
        let matchingSlate = slate.filter { matches($0.league, $0.bdl_game_id, $0.away_team, $0.home_team) }
        if let row = matchingSlate.first(where: { gameID != nil && $0.bdl_game_id == gameID }) ?? matchingSlate.first {
            return row.collegeRankings
        }
        return .unranked
    }
}

extension DailySlateRow {
    var collegeRankings: CollegeTeamRankings {
        CollegeTeamRankings(league: league, away: away_ranking, home: home_ranking)
    }
}

extension GaryPick {
    var collegeRankings: CollegeTeamRankings {
        CollegeTeamRankings(league: league, away: awayRanking, home: homeRanking)
    }
}

struct GaryPick: Identifiable, Codable {
    let pick_id: String?
    var game_id: Int? = nil   // per-game id — disambiguates doubleheaders (same matchup, two games)
    // Preserve the canonical weekly NFL alias until the shared stored-pick parser runs.
    var bdl_game_id: StoredProviderGameID? = nil
    let pick: String?
    let rationale: String?
    // Fan re-register of the same audited rationale (stored since Jul 24 2026);
    // nil on older picks — the card back hides the register toggle when absent.
    var rationale_plain: String? = nil
    // Turn-1 blind decision record (stored since the Aug 5 blind split) —
    // written before Gary ever sees the lines, so it is priceless by
    // construction. The STORE-SAFE BRIDGE shows this as the reasoning text;
    // nil on pre-Aug-5 rows (display falls back to scrubbed rationale).
    var game_read: String? = nil
    let league: String?
    let confidence: Double?
    let time: String?
    let homeTeam: String?
    let awayTeam: String?
    var homeTeamAbbreviation: String? = nil
    var awayTeamAbbreviation: String? = nil
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
    // College AP Poll rankings at pick time (NCAAF and NCAAB).
    let homeRanking: Int?
    let awayRanking: Int?
    // Manual Top Pick override
    let is_top_pick: Bool?
    // Multi-sportsbook odds comparison (ML + Spread)
    let sportsbook_odds: [SportsbookOdds]?
    // Market lines captured at pick time (numbers in the pick JSON since the
    // pipeline's odds snapshot) — power the Home slate's SPREADS / HOME DOGS
    // tabs. Defaulted so older rows and preview constructors stay valid.
    var spread: Double? = nil
    var moneylineHome: Double? = nil
    var moneylineAway: Double? = nil
    // Soccer / World Cup context
    let soccerStage: String?
    let soccerGroup: String?
    let soccerRound: String?

    var id: String {
        pick_id ?? [
            league ?? "?", game_id.map { String($0) } ?? "", commence_time ?? "",
            awayTeam ?? "?", homeTeam ?? "?", type ?? "?", pick ?? "?",
        ].joined(separator: "|")
    }

    /// A stored pick row is useful only when it can identify both the play and
    /// its game. This semantic gate complements Codable's type checking: every
    /// field is optional for historical compatibility, so `{}` otherwise
    /// decodes successfully and looks like an authoritative empty desk later.
    var hasValidStoredPayload: Bool {
        func hasText(_ value: String?) -> Bool {
            !(value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        }
        return hasText(pick)
            && hasText(league)
            && hasText(awayTeam)
            && hasText(homeTeam)
            && (hasText(pick_id) || game_id != nil)
    }

    /// Compact tournament context line for World Cup pick cards (e.g. "Group A · Group Stage", "Round of 16").
    var soccerContext: String? {
        let parts = [soccerGroup, soccerRound ?? soccerStage].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
    
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

    private func cleanedContextLabel(_ value: String?) -> String? {
        guard let value else { return nil }

        let cleaned = (value.components(separatedBy: "/").first ?? value)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }

        if (league ?? "").uppercased() == "NCAAB" {
            let prefixes = [
                "NCAA Tournament ",
                "NCAA Men's Basketball Tournament ",
                "NCAA Men’s Basketball Tournament "
            ]

            for prefix in prefixes where cleaned.lowercased().hasPrefix(prefix.lowercased()) {
                let shortened = String(cleaned.dropFirst(prefix.count))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                return shortened.isEmpty ? cleaned : shortened
            }
        }

        return cleaned
    }

    var shortGameSignificance: String? {
        cleanedContextLabel(gameSignificance)
    }

    var shortTournamentContext: String? {
        cleanedContextLabel(tournamentContext)
    }
    
    /// Parse from dictionary (for manual JSON parsing)
    static func from(dict: [String: Any]) -> GaryPick? {
        let gameID: Int?
        do { gameID = try ExactGameIdentity.canonicalProviderID(in: dict) }
        catch { return nil }
        func number(_ keys: String...) -> Double? {
            for key in keys {
                if let value = dict[key] as? NSNumber { return value.doubleValue }
                if let value = dict[key] as? String,
                   let parsed = Double(value.trimmingCharacters(in: .whitespacesAndNewlines)) {
                    return parsed
                }
            }
            return nil
        }

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
            game_id: gameID,
            pick: dict["pick"] as? String,
            rationale: dict["rationale"] as? String,
            rationale_plain: dict["rationale_plain"] as? String,
            game_read: dict["game_read"] as? String,
            league: dict["league"] as? String,
            confidence: (dict["confidence"] as? NSNumber)?.doubleValue,
            time: dict["time"] as? String,
            homeTeam: dict["homeTeam"] as? String,
            awayTeam: dict["awayTeam"] as? String,
            homeTeamAbbreviation: (dict["homeTeamAbbreviation"] ?? dict["home_team_abbreviation"]) as? String,
            awayTeamAbbreviation: (dict["awayTeamAbbreviation"] ?? dict["away_team_abbreviation"]) as? String,
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
            homeRanking: (dict["homeRanking"] as? NSNumber)?.intValue,
            awayRanking: (dict["awayRanking"] as? NSNumber)?.intValue,
            is_top_pick: dict["is_top_pick"] as? Bool,
            sportsbook_odds: sportsbookOddsArray,
            spread: number("spread"),
            moneylineHome: number("moneylineHome", "moneyline_home"),
            moneylineAway: number("moneylineAway", "moneyline_away"),
            soccerStage: dict["soccer_stage"] as? String,
            soccerGroup: dict["soccer_group"] as? String,
            soccerRound: dict["soccer_round"] as? String
        )
    }
}

