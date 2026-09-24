import SwiftUI

// MARK: - Tonight's slate strip

/// Exact IDs are authoritative. A legacy name join is allowed only when a
/// single score in the same league owns it, never between doubleheader games.
@MainActor func hubLiveScore(for row: TomorrowBoardRow, cache: LiveScoreCache) -> LiveScore? {
    if let id = row.bdl_game_id { return cache.status(forGameId: id, league: row.league) }
    let matchup = "\(row.away_team ?? "") @ \(row.home_team ?? "")"
    let matches = cache.scores.filter {
        HubCardIdentity.sameLeague($0.league, row.league ?? "") && abbrGameMatches($0.abbrGame, matchup: matchup)
    }
    return matches.count == 1 ? matches[0] : nil
}

/// WC board rows carry no abbreviations — fall back to the first three
/// letters of the team name ("France" → FRA) so labels never read "—".
/// Shared display formatting keeps ESPN college codes consistent across Hub rows.
func hubSideLabel(_ abbr: String?, _ team: String?, league: String? = nil) -> String {
    scoreboardTeamAbbreviation(team, stored: abbr, league: league)
}

