import Foundation

/// MLB BDL team abbreviation -> name keywords, so insight_connections rows
/// (whose `game` is "DET @ TB") can be matched to slate matchups (full names).
let mlbTeamKeywords: [String: [String]] = [
    "ARI": ["diamondbacks", "arizona"], "ATL": ["braves", "atlanta"], "BAL": ["orioles", "baltimore"],
    "BOS": ["red sox", "boston"], "CHC": ["cubs"], "CWS": ["white sox"], "CHW": ["white sox"],
    "CIN": ["reds", "cincinnati"], "CLE": ["guardians", "cleveland"], "COL": ["rockies", "colorado"],
    "DET": ["tigers", "detroit"], "HOU": ["astros", "houston"], "KC": ["royals", "kansas"],
    "LAA": ["angels"], "LAD": ["dodgers"], "MIA": ["marlins", "miami"], "MIL": ["brewers", "milwaukee"],
    "MIN": ["twins", "minnesota"], "NYM": ["mets"], "NYY": ["yankees"], "ATH": ["athletics", "oakland"],
    // "citizens bank" (Jul 13 2026): the Derby page's home slot carries the
    // park name — resolves to PHI so the standard field lineup loads.
    "OAK": ["athletics", "oakland"], "PHI": ["phillies", "philadelphia", "citizens bank"], "PIT": ["pirates", "pittsburgh"],
    "SD": ["padres", "san diego"], "SF": ["giants", "san francisco"], "SEA": ["mariners", "seattle"],
    "STL": ["cardinals", "st. louis", "st louis"], "TB": ["rays", "tampa"], "TEX": ["rangers", "texas"],
    "TOR": ["blue jays", "toronto"], "WSH": ["nationals", "washington"],
]

/// NBA BDL team abbreviation -> name keywords (same role as mlbTeamKeywords).
let nbaTeamKeywords: [String: [String]] = [
    "ATL": ["hawks"], "BOS": ["celtics"], "BKN": ["nets", "brooklyn"], "CHA": ["hornets", "charlotte"],
    "CHI": ["bulls"], "CLE": ["cavaliers", "cavs"], "DAL": ["mavericks", "mavs"], "DEN": ["nuggets"],
    "DET": ["pistons"], "GSW": ["warriors", "golden state"], "HOU": ["rockets"], "IND": ["pacers", "indiana"],
    "LAC": ["clippers"], "LAL": ["lakers"], "MEM": ["grizzlies", "memphis"], "MIA": ["heat"],
    "MIL": ["bucks"], "MIN": ["timberwolves", "wolves"], "NOP": ["pelicans", "new orleans"], "NYK": ["knicks"],
    "OKC": ["thunder", "oklahoma"], "ORL": ["magic", "orlando"], "PHI": ["76ers", "sixers"], "PHX": ["suns", "phoenix"],
    "POR": ["trail blazers", "blazers", "portland"], "SAC": ["kings", "sacramento"], "SAS": ["spurs"],
    "TOR": ["raptors"], "UTA": ["jazz", "utah"], "WAS": ["wizards"],
]


/// NFL BDL team abbreviation -> stable city/mascot keywords. Football live
/// rows carry the provider game id, but these aliases keep legacy/id-less
/// results, Hub connections, share cards and score labels deterministic too.
let nflTeamKeywords: [String: [String]] = [
    "ARI": ["cardinals", "arizona"], "ATL": ["falcons", "atlanta"],
    "BAL": ["ravens", "baltimore"], "BUF": ["bills", "buffalo"],
    "CAR": ["panthers", "carolina"], "CHI": ["bears", "chicago"],
    "CIN": ["bengals", "cincinnati"], "CLE": ["browns", "cleveland"],
    "DAL": ["cowboys", "dallas"], "DEN": ["broncos", "denver"],
    "DET": ["lions", "detroit"], "GB": ["packers", "green bay"],
    "HOU": ["texans", "houston"], "IND": ["colts", "indianapolis"],
    "JAX": ["jaguars", "jacksonville"], "JAC": ["jaguars", "jacksonville"],
    "KC": ["chiefs", "kansas city"], "LV": ["raiders", "las vegas"],
    "LAC": ["chargers"], "LAR": ["rams"], "MIA": ["dolphins", "miami"],
    "MIN": ["vikings", "minnesota"], "NE": ["patriots", "new england"],
    "NO": ["saints", "new orleans"], "NYG": ["giants"], "NYJ": ["jets"],
    "PHI": ["eagles", "philadelphia"], "PIT": ["steelers", "pittsburgh"],
    "SEA": ["seahawks", "seattle"], "SF": ["49ers", "san francisco"],
    "TB": ["buccaneers", "bucs", "tampa bay"], "TEN": ["titans", "tennessee"],
    "WSH": ["commanders", "washington"], "WAS": ["commanders", "washington"],
]

/// FIFA country codes -> nation names for the 48 qualified 2026 World Cup
/// teams (generated from the live FIFA teams endpoint — same source the pick
/// pipeline names matchups from).
let wcTeamKeywords: [String: [String]] = [
    "ALG": ["algeria"], "ARG": ["argentina"], "AUS": ["australia"],
    "AUT": ["austria"], "BEL": ["belgium"], "BIH": ["bosnia & herzegovina"],
    "BRA": ["brazil"], "CAN": ["canada"], "CIV": ["côte d'ivoire"],
    "COD": ["dr congo"], "COL": ["colombia"], "CPV": ["cabo verde"],
    "CRO": ["croatia"], "CUW": ["curaçao"], "CZE": ["czechia"],
    "ECU": ["ecuador"], "EGY": ["egypt"], "ENG": ["england"],
    "ESP": ["spain"], "FRA": ["france"], "GER": ["germany"],
    "GHA": ["ghana"], "HAI": ["haiti"], "IRN": ["iran"],
    "IRQ": ["iraq"], "JOR": ["jordan"], "JPN": ["japan"],
    "KOR": ["south korea"], "KSA": ["saudi arabia"], "MAR": ["morocco"],
    "MEX": ["mexico"], "NED": ["netherlands"], "NOR": ["norway"],
    "NZL": ["new zealand"], "PAN": ["panama"], "PAR": ["paraguay"],
    "POR": ["portugal"], "QAT": ["qatar"], "RSA": ["south africa"],
    "SCO": ["scotland"], "SEN": ["senegal"], "SUI": ["switzerland"],
    "SWE": ["sweden"], "TUN": ["tunisia"], "TUR": ["türkiye"],
    "URU": ["uruguay"], "USA": ["usa"], "UZB": ["uzbekistan"],
]

/// Reverse keyword index (lowercased name keyword → the abbreviations it maps to,
/// across all leagues), built once. Used to resolve a full-team-name matchup side
/// to its abbreviation(s) in ~O(1) — the inverse of the per-row keyword scan that
/// `abbrGameMatches` runs. Cross-league keyword collisions are preserved (a token
/// can yield several abbrs); the matchup-key builder intersects both sides so a
/// real game still lands on a single key.
let reverseTeamKeywordIndex: [String: Set<String>] = {
    var idx: [String: Set<String>] = [:]
    for map in [mlbTeamKeywords, nbaTeamKeywords, nflTeamKeywords, wcTeamKeywords] {
        for (abbr, kws) in map {
            for kw in kws { idx[kw, default: []].insert(abbr.uppercased()) }
        }
    }
    return idx
}()

/// Normalized matchup key for the LiveScoreCache index, built from a score row's
/// away/home ABBREVIATIONS ("SD","PHI" → "SD|PHI"). Lowercased+joined so the
/// query side (matchupAbbrKey) lands on the exact same string.
func liveScoreMatchupKey(awayAbbr: String?, homeAbbr: String?) -> String? {
    guard let a = awayAbbr?.uppercased(), let h = homeAbbr?.uppercased(),
          !a.isEmpty, !h.isEmpty else { return nil }
    return "\(a)|\(h)"
}

/// Resolve a full-team-name matchup ("San Diego Padres @ Philadelphia Phillies")
/// to the candidate "AWY|HOM" abbr keys the live-score index is built on. Returns
/// every combination because a side can carry abbr aliases (CWS/CHW, ATH/OAK) and
/// cross-league collisions — the score row stored ONE concrete abbr, so we probe
/// all candidates and the right one hits. Empty when neither side resolves (caller
/// falls back to the linear scan, so reach is never lost).
func matchupAbbrKeys(_ matchup: String) -> [String] {
    func abbrs(for side: String) -> [String] {
        let hay = side.lowercased()
        var hits: [String] = []
        var seen = Set<String>()
        // Longest keywords first so "white sox" wins over a bare token.
        for (kw, abset) in reverseTeamKeywordIndex.sorted(by: { $0.key.count > $1.key.count }) {
            guard hay.contains(kw) else { continue }
            for ab in abset where !seen.contains(ab) { seen.insert(ab); hits.append(ab) }
        }
        return hits
    }
    let sides = matchup.components(separatedBy: " @ ")
    guard sides.count == 2 else { return [] }
    let away = abbrs(for: sides[0]), home = abbrs(for: sides[1])
    guard !away.isEmpty, !home.isEmpty else { return [] }
    var keys: [String] = []
    for a in away { for h in home { keys.append("\(a)|\(h)") } }
    return keys
}
