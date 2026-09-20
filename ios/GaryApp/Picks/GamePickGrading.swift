import Foundation

/// Match an "AWY @ HOM" abbreviation label (a hub edge's `game`) against a
/// full-team-name matchup string. Both abbreviations must resolve (via the
/// MLB, NBA, or World Cup keyword maps) to a name present in the matchup —
/// collisions (MIN Twins vs MIN Timberwolves, COL Rockies vs COL Colombia)
/// sort themselves out because BOTH sides must match the same matchup.
func abbrGameMatches(_ abbrGame: String, matchup: String) -> Bool {
    let hay = matchup.lowercased()
    let abbrevs = abbrGame.uppercased()
        .components(separatedBy: CharacterSet(charactersIn: " @/"))
        .filter { $0.count >= 2 }
    guard abbrevs.count >= 2 else { return false }
    return abbrevs.allSatisfy { ab in
        let kws = (mlbTeamKeywords[ab] ?? []) + (nbaTeamKeywords[ab] ?? []) + (nhlTeamKeywords[ab] ?? []) + (nflTeamKeywords[ab] ?? []) + (wcTeamKeywords[ab] ?? [])
        return kws.contains { hay.contains($0) }
    }
}

/// Resolve a LiveScore's away/home runs into the orientation of a pick's
/// matchup. Defensive: live rows and picks come from the same slates so they
/// should already align, but a verdict grades against NAMES, never positions.
func orientedFinalScores(_ ls: LiveScore, awayTeam: String?, homeTeam: String?) -> (away: Int, home: Int)? {
    guard let a = ls.away_score, let h = ls.home_score else { return nil }
    func matches(_ abbr: String?, _ team: String?) -> Bool {
        guard let ab = abbr?.uppercased(), let hay = team?.lowercased(), !hay.isEmpty else { return false }
        let kws = (mlbTeamKeywords[ab] ?? []) + (nbaTeamKeywords[ab] ?? []) + (nhlTeamKeywords[ab] ?? []) + (nflTeamKeywords[ab] ?? []) + (wcTeamKeywords[ab] ?? [])
        return kws.contains { hay.contains($0) }
    }
    if matches(ls.away_abbr, awayTeam) || matches(ls.home_abbr, homeTeam) { return (a, h) }
    if matches(ls.away_abbr, homeTeam) || matches(ls.home_abbr, awayTeam) { return (h, a) }
    return (a, h)
}

/// Grade a game pick (spread / moneyline / total) against a FINAL score.
/// Returns "won" / "lost" / "push", or nil when the verdict can't be called
/// confidently (unparseable side, or a drawn moneyline — soccer three-ways
/// are the backend grader's call). pickText must already have odds stripped.
func liveGradeGamePick(pickText: String, betType: String = "", awayPicked: Bool, homePicked: Bool, away: Int, home: Int) -> String? {
    func firstDouble(_ pattern: String, in s: String) -> Double? {
        guard let rx = try? NSRegularExpression(pattern: pattern),
              let m = rx.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              let r = Range(m.range, in: s) else { return nil }
        return Double(s[r])
    }
    let lower = pickText.lowercased()
    // Totals — "OVER 8.5" / "UNDER 7".
    if lower.contains("over") || lower.contains("under") {
        guard let line = firstDouble(#"\d+(?:\.\d+)?"#, in: lower) else { return nil }
        let total = Double(away + home)
        if total == line { return "push" }
        return (total > line) == lower.contains("over") ? "won" : "lost"
    }
    // 3-way moneyline DRAW pick (soccer/WC: win · tie · lose) — Gary took the
    // tie, so it wins ONLY on a level result.
    if betType.lowercased() == "draw" || lower.contains("draw") {
        return away == home ? "won" : "lost"
    }
    // Side picks — need a side to grade.
    let picked: Int, other: Int
    if homePicked { picked = home; other = away }
    else if awayPicked { picked = away; other = home }
    else { return nil }
    let margin = Double(picked - other)
    // Spread — a signed line in the pick ("PHI -1.5", "Jazz +7").
    if let line = firstDouble(#"[-+]\d+(?:\.\d+)?"#, in: pickText) {
        let adjusted = margin + line
        if adjusted == 0 { return "push" }
        return adjusted > 0 ? "won" : "lost"
    }
    // Moneyline — a team-to-win pick LOSES on a draw (3-way market: win · tie ·
    // lose). Only soccer can finish level; 2-way sports never reach margin == 0
    // at FINAL, so this stays correct for MLB / NBA / NHL.
    return margin > 0 ? "won" : "lost"
}
