import Foundation

/// The rich live line shared by game + prop cards so they read identically:
/// team abbrs + score + the live situation. WC/NBA/NHL carry the poller's
/// `detail` (match minute "67'" / "Q3 4:12" / period); MLB adds outs + base
/// runners. e.g. "LIVE · URU 0 · KSA 1 · 67'" or
/// "LIVE · SD 4 · PHI 6 · BOT 7 · 2 OUT · 1B·3B".
/// Standard team abbreviation from a name via the league keyword maps. Global so any card
/// footer can label a settled score ("CHC 10 · NYM 3", not a bare "10-3" that hides who won).
func teamAbbrevFromName(_ name: String, league: String? = nil) -> String {
    let lower = name.lowercased()
    let maps: [[String: [String]]]
    switch (league ?? "").uppercased() {
    case "MLB", "MLB HR": maps = [mlbTeamKeywords]
    case "NBA": maps = [nbaTeamKeywords]
    case "NFL", "NFL TDS": maps = [nflTeamKeywords]
    // ESPN scoreboard codes; unknown schools keep their name. Never search
    // professional mascots for a college (Florida State once became NHL FLA).
    case "NCAAF":
        if let abbr = NCAAFTeams.abbreviation(name) { return abbr }
        return (NCAAFTeams.school(name) ?? name).uppercased()
    case "WC": maps = [wcTeamKeywords]
    default: maps = [mlbTeamKeywords, nbaTeamKeywords, nflTeamKeywords, wcTeamKeywords]
    }
    for map in maps {
        for (ab, kws) in map where kws.contains(where: { lower.contains($0) }) { return ab }
    }
    let last = lower.split(separator: " ").last.map(String.init) ?? lower
    return String(last.prefix(3)).uppercased()
}

/// Display labels are separate from provider identity and stored pick snapshots.
/// College names resolve through ESPN even when an older row has a stale code.
func scoreboardTeamAbbreviation(_ name: String?, stored: String? = nil, league: String?) -> String {
    let team = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let supplied = stored?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if league?.uppercased() == "NCAAF", !team.isEmpty {
        return teamAbbrevFromName(team, league: league)
    }
    if !supplied.isEmpty { return supplied.uppercased() }
    return team.isEmpty ? "—" : teamAbbrevFromName(team, league: league)
}

/// Team labels require explicit away/home scores. Never infer the orientation
/// of an archived final_score string, which may instead be winner-first.
func finalScoreLine(matchup: String, awayScore: Int, homeScore: Int, league: String? = nil) -> String {
    let teams = matchup.components(separatedBy: " @ ")
    guard teams.count == 2,
          teams.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
        return "\(awayScore)–\(homeScore)"
    }
    return "\(teamAbbrevFromName(teams[0], league: league)) \(awayScore) \u{00B7} \(teamAbbrevFromName(teams[1], league: league)) \(homeScore)"
}

extension GameResult {
    /// Store this presentation string in card caches unchanged. Unknown legacy
    /// text stays unlabeled; numeric/table-proven scores keep team identities.
    var displayFinalScore: String? {
        if let score = teamScores {
            return finalScoreLine(matchup: "\(score.away) @ \(score.home)",
                                  awayScore: score.a, homeScore: score.h, league: effectiveLeague)
        }
        return final_score
    }
}

func liveLineRich(_ ls: LiveScore, label: String) -> String {
    var bits: [String] = [label]
    // FINAL gets team labels so a settled score says who scored what.
    if label == "FINAL", let a = ls.away_score, let h = ls.home_score, let aw = ls.away_abbr, let hm = ls.home_abbr {
        bits.append("\(aw) \(a) \u{00B7} \(hm) \(h)")
    } else if let sl = ls.scoreLine { bits.append(sl) }
    else if let a = ls.away_score, let h = ls.home_score { bits.append("\(a)–\(h)") }
    guard label == "LIVE" else { return bits.joined(separator: " · ") }
    if let det = ls.detail, !det.isEmpty, det != "LIVE", det != "FINAL" { bits.append(det) }
    if (ls.league ?? "").uppercased() == "MLB" {
        if let o = ls.outs { bits.append("\(o) OUT") }
        let runners = [ls.onFirst ? "1B" : nil, ls.onSecond ? "2B" : nil, ls.onThird ? "3B" : nil].compactMap { $0 }
        if !runners.isEmpty { bits.append(runners.joined(separator: "·")) }
    }
    return bits.joined(separator: " · ")
}
