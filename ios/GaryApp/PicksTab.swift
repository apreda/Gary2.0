// PicksTab.swift — Picks Tab (per-game swipe carousel).
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Picks Tab (per-game swipe carousel: Today's Top + game-by-game)
//
// Built on the SAME daily_picks data the board uses (PropsSlateStore — the
// 90-min run is untouched). Page 0 = "Today's Top" (the day's 2 highest-confidence
// props + top game pick + ranked edges). Pages 1..N = one matchup each (its 2
// props + game pick + that game's edges). Matchup filter bar + sport selector on
// top. Edges come from the real insight_connections — NO mock fallback; honest
// empty / "90-min" states instead.

/// One chip label per (kind, league). MLB's names stay exactly as locked; the
/// two league-specific renames both existed as founder calls: WC venue intel
/// rides .ballpark, and football availability reports ride .injury, where
/// "REPLACEMENT" (MLB's who-fills-in lane) would misname a status report.
func signalChipLabel(kind: SignalKind, league: HubLeagueSel?) -> String {
    if kind == .ballpark && league == .wc { return "VENUE" }
    if kind == .injury && (league == .nfl || league == .ncaaf) { return "AVAILABILITY" }
    return kind.chip
}

/// A labeled list of edge cards (insight_connections), or a note when none exist yet.
struct EdgesSection: View {
    let title: String
    let edges: [Signal]
    var note: String = "More intel drops closer to game time."
    /// TODAY'S EDGES opts in: a category tab bar so the user can jump to a lane
    /// (Situational, Platoon Edge…) instead of scrolling the mixed feed. Off by
    /// default, so per-game GAME INTEL keeps its plain list.
    var tabbed: Bool = false
    @State private var selectedKind: SignalKind? = nil   // nil = the mixed feed (THE SHOW / ALL-22)

    /// Unique categories present, in first-appearance (feed) order.
    private var kinds: [SignalKind] {
        var seen = Set<SignalKind>(); var out: [SignalKind] = []
        for e in edges where !seen.contains(e.kind) { seen.insert(e.kind); out.append(e.kind) }
        return out
    }
    /// nil is THE SHOW: the full, mixed feed. A stale selection (for example
    /// after a sport switch removes that lane) also returns to THE SHOW instead
    /// of silently landing on whichever category happens to arrive first.
    private var activeKind: SignalKind? {
        if let k = selectedKind, kinds.contains(k) { return k }
        return nil
    }

    /// THE SHOW should feel like the whole slate, not one category followed by
    /// another category. Round-robin the live lanes while preserving the
    /// pipeline's ranking inside each lane.
    private var showMix: [Signal] {
        let buckets = kinds.map { kind in edges.filter { $0.kind == kind } }
        let longest = buckets.map(\.count).max() ?? 0
        return (0..<longest).flatMap { index in
            buckets.compactMap { index < $0.count ? $0[index] : nil }
        }
    }
    private var shown: [Signal] {
        guard let k = activeKind else { return showMix }
        return edges.filter { $0.kind == k }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Title hidden when the category tabs are shown — redundant (user call).
            if !tabbed {
                Text(title)
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.62))
                    .pageGutter().padding(.top, 4)
            }
            if edges.isEmpty {
                Text(note)
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.62))
                    .pageGutter().padding(.vertical, 8)
            } else {
                if tabbed && kinds.count > 1 { categoryTabBar }
                // (The ledger no longer renders from a list — it owns its own
                // section on the game page, GameH2HSection.)
                VStack(spacing: 0) { ForEach(shown) { SignalRow(s: $0) } }
                    .pageGutter()
            }
        }
    }

    /// Same mono font + icon + tint as the row category labels; gold underline
    /// marks the active filter (mirrors the matchup tab bar above the feed).
    private var categoryTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 22) {
                showTab
                ForEach(kinds, id: \.self) { categoryTab($0) }
                // Scroll affordance — there are more lanes off the right edge.
                if !kinds.isEmpty {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.25))
                        .padding(.bottom, 12)
                }
            }
            .pageGutter().padding(.top, 8).padding(.bottom, 2)
        }
    }

    /// Use league-specific wording only when the entire supplied feed belongs
    /// to that league; shared callers can also provide a mixed feed.
    private var uniformLeague: HubLeagueSel? {
        guard let first = edges.first?.league else { return nil }
        return edges.allSatisfy { $0.league == first } ? first : nil
    }

    /// The mixed-feed tab wears each sport's own slang for "the whole picture":
    /// baseball's THE SHOW, football's ALL-22 — the coaches' film angle that has
    /// every player on the field (founder, Aug 20: "not the show because that's
    /// baseball"). Same tab, same behavior; only the word changes.
    private var showTabTitle: String {
        (uniformLeague == .nfl || uniformLeague == .ncaaf) ? "ALL-22" : "THE SHOW"
    }

    private var showTab: some View {
        categoryTabLabel(icon: "sparkles", title: showTabTitle, active: activeKind == nil) {
            selectedKind = nil
        }
    }

    @ViewBuilder
    private func categoryTab(_ kind: SignalKind) -> some View {
        categoryTabLabel(
            icon: kind.icon,
            title: signalChipLabel(kind: kind, league: uniformLeague),
            active: activeKind == kind
        ) {
            selectedKind = kind
        }
    }

    private func categoryTabLabel(icon: String, title: String, active: Bool,
                                  action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.18)) { action() } } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 11, weight: .bold))
                Text(title).font(GaryFonts.mono(11.5, bold: true)).tracking(1.2)
            }
            .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.45))
            .padding(.bottom, 11)
            .overlay(alignment: .bottom) {
                ZStack(alignment: .trailing) {
                    Capsule()
                        .fill(Color.white.opacity(active ? 0.10 : 0.045))
                        .frame(height: 1)
                    if active {
                        Capsule()
                            .fill(LinearGradient(
                                colors: [GaryColors.gold.opacity(0.42), GaryColors.gold, Color.white.opacity(0.78)],
                                startPoint: .leading, endPoint: .trailing))
                            .frame(height: 2.5)
                            .shadow(color: GaryColors.gold.opacity(0.35), radius: 2, y: 1)
                        Circle()
                            .fill(Color.white.opacity(0.9))
                            .frame(width: 3.5, height: 3.5)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}

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

/// NHL team abbreviation -> name keywords (same role as mlbTeamKeywords).
let nhlTeamKeywords: [String: [String]] = [
    "ANA": ["ducks", "anaheim"], "BOS": ["bruins"], "BUF": ["sabres", "buffalo"],
    "CGY": ["flames", "calgary"], "CAR": ["hurricanes", "carolina"], "CHI": ["blackhawks"],
    "COL": ["avalanche"], "CBJ": ["blue jackets", "jackets", "columbus"], "DAL": ["stars"],
    "DET": ["red wings", "wings"], "EDM": ["oilers", "edmonton"], "FLA": ["panthers", "florida"],
    "LAK": ["kings", "los angeles"], "MIN": ["wild"], "MTL": ["canadiens", "montreal"],
    "NSH": ["predators", "nashville"], "NJD": ["devils", "new jersey"], "NYI": ["islanders"],
    "NYR": ["rangers"], "OTT": ["senators", "ottawa"], "PHI": ["flyers"],
    "PIT": ["penguins"], "SEA": ["kraken"], "SJS": ["sharks", "san jose"],
    "STL": ["blues"], "TBL": ["lightning", "tampa"], "TOR": ["maple leafs", "leafs"],
    "UTA": ["mammoth", "utah"], "VAN": ["canucks", "vancouver"], "VGK": ["golden knights", "knights", "vegas"],
    "WPG": ["jets", "winnipeg"], "WSH": ["capitals"],
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
    for map in [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords, wcTeamKeywords] {
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

/// Match an "AWY @ HOM" abbreviation label (a hub edge's `game`) against a
/// full-team-name matchup string. Both abbreviations must resolve (via the
/// MLB, NBA, or World Cup keyword maps) to a name present in the matchup —
/// collisions (MIN Twins vs MIN Timberwolves, COL Rockies vs COL Colombia)
/// sort themselves out because BOTH sides must match the same matchup.
/// Compact in-card status text: "LIVE 4–6 · INN 7" / "FINAL · 4–6" (away–home;
/// the card already names the teams, so no abbreviations).
func liveSlotText(_ ls: LiveScore, label: String) -> String {
    var bits: [String] = [label]
    if let a = ls.away_score, let h = ls.home_score { bits.append("\(a)–\(h)") }
    if label == "LIVE", let det = ls.detail, !det.isEmpty, det != "LIVE" { bits.append(det) }
    return bits.joined(separator: " · ")
}

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
    case "MLB": maps = [mlbTeamKeywords]
    case "NBA": maps = [nbaTeamKeywords]
    case "NHL": maps = [nhlTeamKeywords]
    case "NFL", "NFL TDS": maps = [nflTeamKeywords]
    // The provider's scoreboard code first (MASS, SJSU, M-OH) so a college box
    // row reads like MLB's and NFL's instead of running the school's full name
    // through a scale factor (founder, Sep 4 2026).
    case "NCAAF":
        if let abbr = NCAAFTeams.abbreviation(name) { return abbr }
        return Formatters.shortTeamName(name, league: league).uppercased()
    case "WC": maps = [wcTeamKeywords]
    default: maps = [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords, wcTeamKeywords]
    }
    for map in maps {
        for (ab, kws) in map where kws.contains(where: { lower.contains($0) }) { return ab }
    }
    let last = lower.split(separator: " ").last.map(String.init) ?? lower
    return String(last.prefix(3)).uppercased()
}

/// A settled score WITH team labels ("CHC 10 · NYM 3") from a matchup + a raw "10-3".
/// Falls back to the raw score if it can't parse. Global — shared by every card footer.

func finalScoreLine(matchup: String, raw: String, league: String? = nil) -> String {
    let parts = raw.components(separatedBy: CharacterSet(charactersIn: "-\u{2013}")).map { $0.trimmingCharacters(in: .whitespaces) }
    let teams = matchup.components(separatedBy: " @ ")
    guard parts.count == 2, teams.count == 2 else { return raw }
    return "\(teamAbbrevFromName(teams[0], league: league)) \(parts[0]) \u{00B7} \(teamAbbrevFromName(teams[1], league: league)) \(parts[1])"
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

/// Conviction tiers — Gary's vocabulary, not calculator language ("82%" is
/// fake precision and self-inflicted accountability). Bands set from the real
/// Apr–Jun 2026 confidence distribution so the tiers actually spread:
/// 27% SPRINKLE · 48% LEAN · 25% HAMMER.
func convictionTier(_ confidence: Double) -> String {
    confidence >= 0.80 ? "HAMMER" : confidence >= 0.70 ? "LEAN" : "SPRINKLE"
}

/// Splits a rationale into (take, rest): the opening 1–2 SENTENCES lead the
/// card back at quote weight and seed the front quote + share card. Sentence-
/// walked (not paragraph-split) because stored rationales open with a single
/// ~850-char paragraph; works for the current announcer voice and any future
/// shorter one. Strips the literal "Gary's Take" heading the JSON template
/// pastes in. Anything that doesn't split cleanly renders whole as `rest`.
func splitTake(_ rationale: String?) -> (take: String?, rest: String?) {
    guard var r = rationale?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty else {
        return (nil, "No rationale available.")
    }
    if r.lowercased().hasPrefix("gary's take") {
        r = String(r.dropFirst("gary's take".count)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Sentence boundaries: ./!/? followed by whitespace, where the word
    // before the period isn't an abbreviation ("St. Louis", "Jr.", "vs.").
    let abbreviations: Set<String> = ["st", "jr", "sr", "dr", "vs", "mr", "mrs", "no"]
    var boundaries: [String.Index] = []
    var i = r.startIndex
    while i < r.endIndex, boundaries.count < 3 {
        let ch = r[i]
        if ch == "." || ch == "!" || ch == "?" {
            let next = r.index(after: i)
            if next == r.endIndex || r[next] == " " || r[next] == "\n" {
                let wordStart = r[..<i].lastIndex(where: { $0 == " " || $0 == "\n" })
                    .map { r.index(after: $0) } ?? r.startIndex
                if !abbreviations.contains(r[wordStart..<i].lowercased()) {
                    boundaries.append(next)
                }
            }
        }
        i = r.index(after: i)
    }

    // The take = the longest 1–2 sentence opening that stays under ~300
    // chars — enough to be a real quote, short enough to BE a quote.
    var cut: String.Index? = nil
    for end in boundaries.prefix(2) {
        if r.distance(from: r.startIndex, to: end) <= 300 { cut = end } else { break }
    }
    guard let cutIdx = cut else { return (nil, r) }
    let take = String(r[..<cutIdx]).trimmingCharacters(in: .whitespacesAndNewlines)
    let rest = String(r[cutIdx...]).trimmingCharacters(in: .whitespacesAndNewlines)
    guard take.count >= 40, !rest.isEmpty else { return (nil, r) }
    return (take, rest)
}


/// League priority for defaults, headlines and Home board order. During the
/// football season, the NFL and NCAAF desks lead, followed by MLB; inactive
/// leagues naturally disappear because the callers only rank posted content.
enum LeaguePriority {
    static func rank(_ league: String?) -> Int {
        switch (league ?? "").uppercased() {
        case "NFL", "NFL TDS": return 0
        case "NCAAF": return 1
        case "MLB": return 2
        case "WC", "SOCCER_WORLD_CUP", "SOCCER": return 3
        case "NBA": return 4
        default: return 5
        }
    }
}

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

enum PicksDay { case today, yesterday }

/// The single showcase card at the top of the Picks landing page is a
/// published pick, not a live leaderboard. Once a current-day game or prop is
/// shown for a league, persist the full payload so later pick drops (or a
/// backend refresh with different ordering/confidence) cannot replace it.
/// The date is SupabaseAPI.todayEST(), so the lock naturally turns over with
/// the rest of the board at 6 a.m. ET.
struct PicksShowcaseLock: Codable {
    enum Kind: String, Codable { case game, prop }

    let slateDate: String
    let league: String
    let kind: Kind
    let gamePick: GaryPick?
    let propPick: PropPick?
}

struct PicksCarouselView: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @StateObject private var store = PropsSlateStore()
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// Newly published picks and durable grades should arrive without a pull or
    /// relaunch. Only the visible Picks tab runs this refresh; live scores retain
    /// their own faster shared cadence.
    private let rollingPicksRefreshTimer = Timer.publish(every: 90, on: .main, in: .common).autoconnect()
    @State private var rollingPicksRefreshInFlight = false
    /// Today vs Yesterday — the day dropdown (user call, Jun 17) replaces the old
    /// mixed matchup row + per-tab "YESTERDAY" tags. Today shows upcoming-first
    /// matchups; Yesterday shows that day's matchups + picks with CASHED/LOST tags.
    @State private var pickDay: PicksDay = .today
    @StateObject private var focusState = PicksFocusState.shared
    @State private var connections: [Signal] = []
    @State private var connLoaded = false
    @State private var connectionLoadInFlight = false
    @State private var connectionErrorLeagues: Set<HubLeagueSel> = []
    @State private var sport = "MLB"
    /// True while `sport` was set by the auto-snap rather than a user tap —
    /// the only state the snap is allowed to correct once real data lands.
    @State private var sportAutoSelected = true
    /// NCAAF CONFERENCE NAVIGATION (founder, Aug 25 2026): the college strip
    /// defaults to ranked matchups — backfilled with the biggest remaining
    /// games when the poll is thin — and filters by conference on demand. A
    /// cross-conference game belongs to BOTH conferences' filters; a game
    /// with two ranked teams shows under RANKED and both conferences.
    static let ncaafRankedFilter = "RANKED"
    @State private var ncaafConference: String = PicksCarouselView.ncaafRankedFilter
    @State private var page = 0
    @State private var selectedProp: PropPick?
    /// PERF#1(b/c): memoized UNSORTED game set + precomputed per-game edge index.
    /// Rebuilt by rebuildMemo() only when picks/props/slate/connections or the
    /// day/sport filter change — never on a live-score tick. Page order is frozen
    /// after it is published: changing the backing order during an interactive
    /// `TabView` swipe can strand UIKit halfway between two game controllers.
    @State private var gamesMemo: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
    @State private var edgeIndex: [String: [Signal]] = [:]
    /// Masthead + strip context (founder, Jul 22: the Hub's upper part —
    /// wordmark, LAST 7 DAYS line, double rule, slate strip — is the Picks
    /// page's top now): the rolling 7-day pick record, and the day board for
    /// each strip block's O/U.
    @State private var record7: (w: Int, l: Int)? = nil
    @State private var stripBoard: TomorrowBoard? = nil
    /// Day + league scoped snapshot of the ONE pick shown on the landing page.
    /// Keeping the payload (rather than only its id) also protects the published
    /// wording and number if the upstream row is later regenerated.
    @State private var showcaseLock: PicksShowcaseLock? = nil
    private static let showcaseLockPrefix = "gary.picks.showcase.v1."
    private static let showcaseDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Every league with content: today's props/picks plus the per-sport
    /// yesterday recaps (a sport with no picks today shows its results —
    /// the same rule the rest of the app follows).
    /// 2.16: Home-run bets live in The Hub's Home Run Threats lane now, so the
    /// Picks page no longer carries an MLB HR tab or any HR pick cards. The
    /// model's isHRLane is the ONE source of truth (backend lane stamp, prop-text
    /// fallback) — it catches genuine HR props that arrive tagged plain "MLB",
    /// while non-HR props mislabeled "MLB HR" upstream keep routing to MLB.
    private func isHomeRunProp(_ p: PropPick) -> Bool { p.isHRLane }
    private var sports: [String] {
        var s = Set(store.slateProps.filter { !isHomeRunProp($0) }.compactMap { ($0.effectiveLeague ?? "").uppercased() }.filter { !$0.isEmpty })
        s.formUnion(store.gamePicks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        s.formUnion(store.yesterdayGamePicks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        // Today's slate leagues too — so a sport with games tonight but no picks
        // yet still gets a filter chip (matches the look-ahead matchups below).
        s.formUnion(store.slate.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        // Keep the active season's desks reachable before their first pick.
        // MLB is also the initial desk while requests are loading or failing;
        // each empty state remains honest until the slate or card arrives.
        s.formUnion(["MLB", "NFL", "NCAAF"])
        s.remove("ALL")
        // The MLB HR lane is retired — guarantee no HR chip even if a non-HR prop
        // arrives mislabeled "MLB HR" (its card already routes to MLB via propSportKey).
        s.remove("MLB HR")
        // Where Gary's PICKS are leads (founder, Aug 18: preseason NFL — zero
        // picks — defaulting over a full MLB board is wrong): a league with
        // posted picks/props today outranks everything. Games on today's slate
        // rank next, so the pre-post morning board still lands on the active
        // sport. Canonical football-season priority (NFL, NCAAF, MLB) only
        // breaks ties inside each group (founder, Jul 12: WC before MLB on a
        // no-WC day made no sense).
        let pickLeagues = Set(store.gamePicks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
            .union(store.allProps.filter { !isHomeRunProp($0) }.map { propSportKey($0) }.filter { !$0.isEmpty })
        let todayLeagues = Set(store.slate.compactMap { ($0.league ?? "").uppercased() })
        // PRESEASON DEMOTION (founder, Aug 20: "default to the MLB tab until
        // we are out of NFL preseason") — football only outranks MLB once the
        // NFL regular season begins (kickoff Thu Sep 10 2026; Sep 9 = the
        // eve). Before then MLB leads every tie-break; the football chips
        // stay reachable, they just never win the default.
        let nflRegularSeason = SupabaseAPI.todayEST() >= "2026-09-09"
        let priority: [String: Int] = nflRegularSeason
            ? ["NFL": 0, "NCAAF": 1, "MLB": 2, "WC": 3]
            : ["MLB": 0, "NFL": 1, "NCAAF": 2, "WC": 3]
        // Picks always belongs to one sport, including during partial loads.
        return s.sorted { a, b in
            let pa = pickLeagues.contains(a), pb = pickLeagues.contains(b)
            if pa != pb { return pa }
            let ta = todayLeagues.contains(a), tb = todayLeagues.contains(b)
            if ta != tb { return ta }
            let ra = priority[a] ?? 50, rb = priority[b] ?? 50
            return ra == rb ? a < b : ra < rb
        }
    }

    /// Follow the first active sport until the user selects a league. Keep the
    /// initial MLB desk valid during loading/errors; never render a mixed desk.
    private func snapSportToAvailableLeague() {
        guard let first = sports.first else { return }
        // A refresh that FAILED is not evidence a league left the board —
        // while any source is failing (or still loading), the chip list is
        // not authoritative and the user's page does not move (Aug 26: a
        // failed pull-to-refresh wiped the list and snapped MLB → NFL).
        guard store.gamePickSourceFailures.isEmpty, !store.propPickSourceFailed,
              !store.slateSourceFailed, !store.loading else { return }
        if !sports.contains(sport) {
            sport = first
            sportAutoSelected = true
        } else if sportAutoSelected, sport != first {
            // `sports` already ranks posted picks/props above slate-only desks.
            // Do not let a slate row make an earlier automatic choice sticky
            // when a more authoritative picks desk arrives during refresh.
            sport = first
        }
    }
    /// A prop's tab key, with the MLB HR lane corrected to HOME-RUN props only.
    /// Non-HR props (total_bases, strikeouts) get mislabeled "MLB HR" upstream;
    /// route those to the regular MLB tab so the HR tab shows only HR bets
    /// (mirrors the storefront's propLeagueKey guard).
    /// A prop's tab key. Every "MLB HR" row — the genuine long shot and the
    /// odd non-HR prop mislabeled upstream — routes to the MLB chip: the home
    /// run belongs to its game's cards, and there is no separate HR tab.
    private func propSportKey(_ p: PropPick) -> String {
        let key = (p.effectiveLeague ?? "").uppercased()
        return key == "MLB HR" ? "MLB" : key
    }
    private var filteredProps: [PropPick] {
        let base = store.slateProps
        return base.filter { propSportKey($0) == sport }
    }
    /// TODAY's matchup rail uses today's FRESH props only. store.allProps is
    /// already freshness-filtered to games at/after the start of today (EST);
    /// slateProps additionally folds in yesterday's recap props for sports with
    /// nothing today — right for the results fallback, but it must NOT seed
    /// today's matchup tabs or yesterday's games leak into TODAY (the
    /// "Jays @ Sox · WEDNESDAY 6:45 PM" bug under a sport with no props yet).
    private var filteredTodayProps: [PropPick] {
        // 2.25 (founder, Sep 3 2026): the home run IS a pick card — four cards a
        // game, two props, the game pick and the long shot. It rides the game's
        // own carousel under the MLB chip (propSportKey), stays last in that
        // carousel, and still never touches a record or the free showcase.
        let today = store.allProps   // NFL TDs stay under NFL
        return today.filter { propSportKey($0) == sport }
    }
    /// Yesterday's own props (sport-scoped, no TD picks) — the source for the
    /// Yesterday matchup row so every settled game shows, not just slate leftovers.
    private var filteredYesterdayProps: [PropPick] {
        let yp = store.yesterdayPropsAll   // ungated: all of yesterday; HR + NFL TDs ride their game
        return yp.filter { propSportKey($0) == sport }
    }
    /// PERF#1(b): the heavy grouping/merge/look-ahead, memoized into `gamesMemo`
    /// and recomputed ONLY when picks/props/slate/day/sport change (see rebuildMemo)
    /// — never on a live-score tick. Returns the UNSORTED set; the cheap live-status
    /// sort lives in `games` so a 20-25s tick only re-orders, it never re-groups.
    private func computeGamesUnsorted() -> [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
        // The matchup row is day-scoped (the dropdown): Today groups today's slate
        // props; Yesterday groups yesterday's own props — sourcing the day directly
        // (not a fresh/stale filter on a shared list) is what makes EVERY yesterday
        // game show, not just the one that leaked into today's slate.
        let dayProps = pickDay == .today ? filteredTodayProps : filteredYesterdayProps
        // Props seed the set — every matchup group SPLITS by start-time bucket
        // so a doubleheader's two games never share a page (Jul 22 2026).
        var out: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        var providerIndex: [String: Int] = [:]
        var legacyIndex: [String: [Int]] = [:]
        var providerByIndex: [Int: String] = [:]

        func providerIdentity(league: String?, gameId: Int?) -> String? {
            let rawLeague = (league ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            // Home-run props belong to the same MLB game, not a second desk.
            // Using MLB HR here duplicated the game when the regular pick landed.
            let scopedLeague = rawLeague == "MLB HR" ? "MLB" : rawLeague
            guard !scopedLeague.isEmpty, let gameId else { return nil }
            return "\(scopedLeague)|\(gameId)"
        }

        func upsertGame(matchup: String, time: String, commence: Date?,
                        providerKey: String?, props: [PropPick]) {
            let fallbackKey = Self.gameIdentityKey(matchup, commence)
            let compatibleFallback = (legacyIndex[fallbackKey] ?? []).filter { index in
                providerKey == nil || providerByIndex[index] == nil || providerByIndex[index] == providerKey
            }
            // An id-less row can join one exact matchup/time, never guess
            // between two known provider games with the same fallback label.
            let existingIndex = providerKey.flatMap { providerIndex[$0] }
                ?? (compatibleFallback.count == 1 ? compatibleFallback.first : nil)
            if let index = existingIndex {
                let existing = out[index]
                let resolvedCommence = existing.commence ?? commence
                let resolvedTime = existing.commence == nil && commence != nil ? time : existing.time
                out[index] = (
                    matchup: existing.matchup,
                    time: resolvedTime,
                    commence: resolvedCommence,
                    dh: false,
                    props: existing.props + props
                )
                if let providerKey {
                    providerIndex[providerKey] = index
                    providerByIndex[index] = providerKey
                }
                let resolvedKey = Self.gameIdentityKey(existing.matchup, resolvedCommence)
                for key in Set([fallbackKey, resolvedKey]) where !(legacyIndex[key] ?? []).contains(index) {
                    legacyIndex[key, default: []].append(index)
                }
                return
            }

            out.append((matchup: matchup, time: time, commence: commence, dh: false, props: props))
            let index = out.count - 1
            if let providerKey {
                providerIndex[providerKey] = index
                providerByIndex[index] = providerKey
            }
            legacyIndex[fallbackKey, default: []].append(index)
        }

        for g in store.groupByMatchup(dayProps) {
            let buckets = Dictionary(grouping: g.props) { p in
                Self.timeBucket(parseISO8601(p.commence_time ?? "")) ?? -1
            }
            for (_, props) in buckets.sorted(by: { $0.key < $1.key }) {
                let commence = props.compactMap { parseISO8601($0.commence_time ?? "") }.min()
                let time = commence.map { Formatters.tabTimeFormatterEST.string(from: $0) + " ET" } ?? g.time
                let ids = Set(props.compactMap(\.game_id))
                let gameId = ids.count == 1 ? ids.first : nil
                let league = props.first?.effectiveLeague
                upsertGame(
                    matchup: g.matchup,
                    time: time,
                    commence: commence,
                    providerKey: providerIdentity(league: league, gameId: gameId),
                    props: props
                )
            }
        }
        func gameMatchup(_ p: GaryPick) -> String {
            let a = (p.awayTeam ?? "").trimmingCharacters(in: .whitespaces)
            let h = (p.homeTeam ?? "").trimmingCharacters(in: .whitespaces)
            return (a.isEmpty || h.isEmpty) ? "" : "\(a) @ \(h)"
        }
        // Merge in EVERY game pick for the day (all leagues), deduped against the
        // prop matchups by GAME identity (teams + start bucket) — so a game with
        // a pick but no prop still gets a tab, and a doubleheader gets two.
        func merge(_ picks: [GaryPick]) {
            for p in picks {
                let lg = (p.league ?? "").uppercased()
                guard !lg.isEmpty, lg == sport else { continue }
                let mu = gameMatchup(p)
                guard !mu.isEmpty else { continue }
                let commence = p.commence_time.flatMap(parseISO8601)
                let time = commence.map { Formatters.tabTimeFormatterEST.string(from: $0) + " ET" } ?? (p.time ?? "")
                upsertGame(
                    matchup: mu,
                    time: time,
                    commence: commence,
                    providerKey: providerIdentity(league: lg, gameId: p.game_id),
                    props: []
                )
            }
        }
        merge(pickDay == .today ? store.gamePicks : store.yesterdayGamePicksAll)

        // LOOK-AHEAD (today only): include every game on today's slate so the user
        // sees tonight's matchups with a placeholder + intel before picks post.
        if pickDay == .today {
            for s in store.slate {
                let lg = (s.league ?? "").uppercased()
                guard lg == sport else { continue }
                let a = (s.away_team ?? "").trimmingCharacters(in: .whitespaces)
                let h = (s.home_team ?? "").trimmingCharacters(in: .whitespaces)
                guard !a.isEmpty, !h.isEmpty else { continue }
                let mu = "\(a) @ \(h)"
                let commence = s.commence_time.flatMap(parseISO8601)
                let time = s.kickoffTimeLabel
                    ?? commence.map { Formatters.tabTimeFormatterEST.string(from: $0) + " ET" }
                    ?? ""
                upsertGame(
                    matchup: mu,
                    time: time,
                    commence: commence,
                    providerKey: providerIdentity(league: lg, gameId: s.bdl_game_id),
                    props: []
                )
            }
        }
        // NCAAF CONFERENCE NAVIGATION (founder, Aug 25 2026): scope the
        // college strip to the active view — RANKED (with big-game backfill)
        // or one conference. Today only; Yesterday keeps the full recap.
        if sport == "NCAAF", pickDay == .today {
            out = filterNcaafGames(out)
        }

        // Flag doubleheader siblings — pages use this to DEMAND game-scoped
        // data (an unstamped arm/pick/edge stays off rather than guessed).
        var perMatchup: [String: Int] = [:]
        for g in out { perMatchup[Self.matchupKey(g.matchup), default: 0] += 1 }
        return out.map { g in
            (matchup: g.matchup, time: g.time, commence: g.commence,
             dh: (perMatchup[Self.matchupKey(g.matchup)] ?? 1) > 1, props: g.props)
        }
    }

    private var games: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
        gamesMemo
    }

    // MARK: — NCAAF conference navigation (founder, Aug 25 2026)

    private struct NcaafGameMeta {
        var homeConference: String?
        var awayConference: String?
        var homeRanking: Int?
        var awayRanking: Int?
        var conferences: Set<String> { Set([homeConference, awayConference].compactMap { $0 }) }
        var isRanked: Bool { homeRanking != nil || awayRanking != nil }
    }

    /// The Power-4 set — RANKED's backfill prefers these matchups when the AP
    /// poll alone can't fill the strip (Week 0 had exactly one ranked game).
    private static let ncaafPowerConferences: Set<String> = ["SEC", "Big Ten", "Big 12", "ACC"]
    /// RANKED shows at least this many games when the day has them.
    private static let ncaafRankedFloor = 6
    /// Menu order for the day's conferences (only ones with games show).
    private static let ncaafConferenceOrder = [
        "SEC", "Big Ten", "Big 12", "ACC", "Pac-12", "American",
        "Mountain West", "Sun Belt", "MAC", "CUSA", "Independents",
    ]

    /// Conference/rank identity for the day's NCAAF games, keyed by provider
    /// game id with a matchup-key fallback. Sources: stored picks (post-pick)
    /// and the daily slate (pre-pick) — the first stamp for a key wins. An
    /// empty index means the stamps never arrived; filtering then stands down
    /// entirely rather than hiding games behind unknowable membership.
    private func ncaafMetaIndex() -> [String: NcaafGameMeta] {
        var index: [String: NcaafGameMeta] = [:]
        func put(_ key: String?, _ meta: NcaafGameMeta) {
            guard let key, !key.isEmpty, index[key] == nil,
                  !meta.conferences.isEmpty || meta.isRanked else { return }
            index[key] = meta
        }
        for p in store.gamePicks where (p.league ?? "").uppercased() == "NCAAF" {
            let meta = NcaafGameMeta(homeConference: p.homeConference, awayConference: p.awayConference,
                                     homeRanking: p.homeRanking, awayRanking: p.awayRanking)
            put(p.game_id.map { "id\($0)" }, meta)
            let a = (p.awayTeam ?? ""), h = (p.homeTeam ?? "")
            if !a.isEmpty, !h.isEmpty { put("mu" + Self.matchupKey("\(a) @ \(h)"), meta) }
        }
        for s in store.slate where (s.league ?? "").uppercased() == "NCAAF" {
            let meta = NcaafGameMeta(homeConference: s.home_conference, awayConference: s.away_conference,
                                     homeRanking: s.home_ranking, awayRanking: s.away_ranking)
            put(s.bdl_game_id.map { "id\($0)" }, meta)
            if let a = s.away_team, let h = s.home_team, !a.isEmpty, !h.isEmpty {
                put("mu" + Self.matchupKey("\(a) @ \(h)"), meta)
            }
        }
        return index
    }

    private func ncaafMeta(
        for game: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick]),
        index: [String: NcaafGameMeta]
    ) -> NcaafGameMeta? {
        let ids = Set(game.props.compactMap(\.game_id))
        if ids.count == 1, let id = ids.first, let meta = index["id\(id)"] { return meta }
        return index["mu" + Self.matchupKey(game.matchup)]
    }

    /// The day's conferences that actually have games — the menu never offers
    /// a filter that would render empty.
    private func ncaafConferenceOptions() -> [String] {
        let present = Set(ncaafMetaIndex().values.flatMap { $0.conferences })
        return Self.ncaafConferenceOrder.filter { present.contains($0) }
    }

    private func filterNcaafGames(
        _ games: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])]
    ) -> [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
        let index = ncaafMetaIndex()
        guard !index.isEmpty else { return games }

        if ncaafConference != Self.ncaafRankedFilter {
            let filtered = games.filter {
                ncaafMeta(for: $0, index: index)?.conferences.contains(ncaafConference) == true
            }
            if filtered.isEmpty {
                // The selected conference left the day's slate (refresh,
                // rollover) — snap home to RANKED, never an empty strip.
                ncaafConference = Self.ncaafRankedFilter
            } else {
                return filtered
            }
        }

        // RANKED: every matchup with an AP side leads; when the poll can't
        // fill the strip, backfill with the biggest remaining games — Power-4
        // matchups first, then the rest, each ordered by kickoff.
        var ranked: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        var power: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        var rest: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        for g in games {
            let meta = ncaafMeta(for: g, index: index)
            if meta?.isRanked == true { ranked.append(g) }
            else if meta?.conferences.contains(where: Self.ncaafPowerConferences.contains) == true { power.append(g) }
            else { rest.append(g) }
        }
        let byKickoff: ((matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick]),
                        (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Bool = {
            ($0.commence ?? .distantFuture) < ($1.commence ?? .distantFuture)
        }
        let backfillNeed = max(0, Self.ncaafRankedFloor - ranked.count)
        let backfill = Array((power.sorted(by: byKickoff) + rest.sorted(by: byKickoff)).prefix(backfillNeed))
        let visible = ranked.sorted(by: byKickoff) + backfill
        return visible.isEmpty ? games : visible
    }

    private func selectNcaafConference(_ value: String) {
        guard ncaafConference != value else { return }
        withAnimation(.easeInOut(duration: 0.25)) {
            ncaafConference = value
            page = 0
        }
        gamesMemo = []
        rebuildMemo()
    }

    /// The strip's conference selector — the day block's exact grammar
    /// (selection over kicker, gold chevron), NCAAF Today only.
    private var conferenceBlock: some View {
        Menu {
            Button("Ranked") { selectNcaafConference(Self.ncaafRankedFilter) }
            ForEach(ncaafConferenceOptions(), id: \.self) { conf in
                Button(conf) { selectNcaafConference(conf) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(ncaafConference == Self.ncaafRankedFilter ? "RANKED" : ncaafConference.uppercased())
                        .font(HubFont.data(11.5, .semibold))
                        .foregroundStyle(.white.opacity(0.95))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
                Text("CONFERENCE")
                    .font(HubFont.data(9.5, .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
    }

    /// Recompute the memoized game set + edge index. Called on first load and
    /// whenever the underlying picks/props/slate/connections or the day/sport
    /// filter change — NOT on live-score ticks. `nonEmptyKeysOf` guards the
    /// keep-last-good rule the store already follows (never blank a populated bar
    /// on a transient empty refresh).
    private func rebuildMemo() {
        let built = computeGamesUnsorted()
        // Initial publication: LIVE → upcoming → final, then first pitch.
        // Refreshes keep every existing identity at the same page index and append
        // genuinely new games. SwiftUI's page TabView is backed by
        // UIPageViewController; reordering its children while a finger is down is
        // what produced the two half-pages stuck together in the Aug 7 screenshot.
        // Feed identities are not guaranteed unique. A collision must never
        // trap the app; retain the earliest existing position deterministically.
        let oldOrder = Dictionary(gamesMemo.enumerated().map {
            (Self.gameIdentityKey($0.element.matchup, $0.element.commence), $0.offset)
        }, uniquingKeysWith: { first, _ in first })
        let ordered = built.sorted { lhs, rhs in
            let l = oldOrder[Self.gameIdentityKey(lhs.matchup, lhs.commence)]
            let r = oldOrder[Self.gameIdentityKey(rhs.matchup, rhs.commence)]
            switch (l, r) {
            case let (li?, ri?): return li < ri
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil):
                guard pickDay == .today else { return gameStart(lhs) < gameStart(rhs) }
                return (gameStatusBucket(lhs), gameStart(lhs)) < (gameStatusBucket(rhs), gameStart(rhs))
            }
        }
        gamesMemo = ordered
        if page > ordered.count { page = 0 }
        // PERF#1(c): precompute each game's edge list ONCE (the N×M games×connections
        // scan), keyed by the game's IDENTITY key, so edges(for:) is an O(1) dict
        // lookup at render time. String match (abbrGameMatches / matchup key) finds
        // the matchup; the BDL game id then scopes to the GAME — a doubleheader
        // page only wears edges whose game_id is its own (Jul 22 2026, Max Fried),
        // and an id-less edge stays off a doubleheader page rather than guessed.
        var idx: [String: [Signal]] = [:]
        for g in built {
            let hay = g.matchup + " " + g.props.compactMap { $0.team }.joined(separator: " ")
            let gKey = Self.matchupKey(g.matchup)
            let gid = bdlGameId(for: g)
            idx[Self.gameIdentityKey(g.matchup, g.commence)] = connections.filter { s in
                // Exact provider identity wins before any team-name parsing.
                // NCAAF insight rows intentionally use provider abbreviations,
                // while slate rows carry full school names; rejecting on the
                // fuzzy guard first made correctly keyed college intel vanish.
                if let gid, let sid = s.gameId.flatMap({ Int($0) }) { return sid == gid }
                guard abbrGameMatches(s.game, matchup: hay) || Self.matchupKey(s.game) == gKey else { return false }
                if g.dh, s.gameId != nil { return false }   // id present but unverifiable — keep it off
                return true
            }
        }
        edgeIndex = idx
    }

    /// Match key from team last-words ("San Diego Padres @ LA Dodgers" →
    /// "padres|dodgers") — dedups the slate's full names against the picks/props
    /// short matchup format.
    static func matchupKey(_ m: String) -> String {
        let sides = m.lowercased().components(separatedBy: " @ ")
        guard sides.count == 2 else { return m.lowercased() }
        let a = sides[0].components(separatedBy: " ").last ?? sides[0]
        let h = sides[1].components(separatedBy: " ").last ?? sides[1]
        return "\(a)|\(h)"
    }

    /// 30-minute identity bucket for a start time — the doubleheader-safe half
    /// of a game's key (Jul 22 2026, the Max Fried mixup). Sources (props,
    /// picks, slate, board, starters) agree on a game's first pitch to the
    /// minute, so flooring to :00/:30 joins them across feeds while cleanly
    /// separating a twin bill's games, which sit hours apart.
    static func timeBucket(_ d: Date?) -> Int? {
        d.map { Int($0.timeIntervalSince1970 / 1800.0) }
    }
    /// A GAME's key: matchup + start bucket. Two games of a doubleheader get
    /// two keys — two tabs, two pages, two sets of attached data.
    static func gameIdentityKey(_ matchup: String, _ commence: Date?) -> String {
        matchupKey(matchup) + "|" + (timeBucket(commence).map(String.init) ?? "")
    }

    /// The game's BDL id from its slate row (doubleheader-exact edge + live
    /// attachment). nil when the slate hasn't landed or the row predates ids.
    private func bdlGameId(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Int? {
        let propIds = Set(g.props.compactMap(\.game_id))
        if propIds.count == 1 { return propIds.first }

        let key = Self.gameIdentityKey(g.matchup, g.commence)
        let scopedLeague = g.props.first.map { propSportKey($0) }
            ?? sport.uppercased()
        let dayPicks = pickDay == .today ? store.gamePicks : store.yesterdayGamePicksAll
        if let id = dayPicks.first(where: {
            let rowLeague = ($0.league ?? "").uppercased()
            return rowLeague == scopedLeague
                && Self.gameIdentityKey("\($0.awayTeam ?? "") @ \($0.homeTeam ?? "")",
                                        $0.commence_time.flatMap(parseISO8601)) == key
        })?.game_id { return id }

        if let id = store.slate.first(where: {
            let rowLeague = ($0.league ?? "").uppercased()
            return rowLeague == scopedLeague
                && Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                        $0.commence_time.flatMap(parseISO8601)) == key
        })?.bdl_game_id { return id }

        // Exact-id sources can temporarily disagree on kickoff precision (a
        // confirmed pick beside a retained date-only slate row). A same-league,
        // single-provider-id matchup is still unambiguous; doubleheaders yield
        // multiple ids and deliberately fail closed here.
        let matchupKey = Self.matchupKey(g.matchup)
        let candidateIds = Set(
            dayPicks.compactMap { pick -> Int? in
                let rowLeague = (pick.league ?? "").uppercased()
                let matchup = "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")"
                guard rowLeague == scopedLeague,
                      Self.matchupKey(matchup) == matchupKey else { return nil }
                return pick.game_id
            }
            + store.slate.compactMap { row -> Int? in
                let rowLeague = (row.league ?? "").uppercased()
                let matchup = "\(row.away_team ?? "") @ \(row.home_team ?? "")"
                guard rowLeague == scopedLeague,
                      Self.matchupKey(matchup) == matchupKey else { return nil }
                return row.bdl_game_id
            }
        )
        return candidateIds.count == 1 ? candidateIds.first : nil
    }

    /// Carry league identity into a game page even when it is a slate-only
    /// morning placeholder with no pick, prop, edge, or scout row yet. Without
    /// this, football look-aheads briefly mounted the baseball sections and an
    /// untyped INCOMING card until a later payload happened to supply a league.
    private func league(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> String? {
        let activeLeague = sport.uppercased()
        if let league = g.props.first?.effectiveLeague, !league.isEmpty,
           league.uppercased() == activeLeague {
            return league.uppercased()
        }

        let key = Self.gameIdentityKey(g.matchup, g.commence)
        if let league = store.slate.first(where: {
            let rowLeague = ($0.league ?? "").uppercased()
            return rowLeague == activeLeague
                && Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                        $0.commence_time.flatMap(parseISO8601)) == key
        })?.league, !league.isEmpty {
            return league.uppercased()
        }

        let dayPicks = pickDay == .today ? store.gamePicks : store.yesterdayGamePicksAll
        if let league = dayPicks.first(where: {
            let matchup = "\($0.awayTeam ?? "") @ \($0.homeTeam ?? "")"
            let pickLeague = ($0.league ?? "").uppercased()
            return pickLeague == activeLeague
                && Self.gameIdentityKey(matchup, $0.commence_time.flatMap(parseISO8601)) == key
        })?.league, !league.isEmpty {
            return league.uppercased()
        }

        return activeLeague
    }

    /// Per-GAME live lookup: BDL id first (doubleheader-exact), matchup-string
    /// fallback only on single-game days — a doubleheader page never borrows
    /// its twin's scoreboard row.
    private func liveScore(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> LiveScore? {
        if let id = bdlGameId(for: g) {
            return liveCache.status(forGameId: id, league: gameLeague(g))
        }
        if g.dh { return nil }
        let legacy = liveCache.status(forMatchup: g.matchup)
        // Interruption is a game-identity claim and may never use the legacy
        // team-name join. Existing id-less live/final behavior remains intact.
        return legacy?.isInterrupted == true ? nil : legacy
    }

    /// Matchup-bar order: LIVE (0) → upcoming (1) → finished/graded (2). Reads the
    /// live-score cache per GAME, so a game sinks the moment it goes final and a
    /// doubleheader's nightcap never inherits the matinee's state.
    private func gameStatusBucket(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Int {
        if let ls = liveScore(for: g) {
            if ls.isFinal { return 2 }
            if ls.isLive { return 0 }
        }
        return 1
    }
    /// Kickoff/first-pitch, to order within a bucket — the game's own identity
    /// time (baked in at grouping) does the whole job now.
    private func gameStart(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Date {
        g.commence ?? .distantFuture
    }
    private var topProps: [PropPick] {
        // TODAY is strictly today's slate. Yesterday's settled cards live only
        // behind the explicit Yesterday selector; an empty morning board shows
        // PICKS INCOMING instead of relabeling an old result as today's pick.
        // The showcase is the PRODUCT: the long shot rides its game's carousel,
        // never the free page's headline card (founder, Jul 29 — HR is drama).
        let dayProps = (pickDay == .yesterday ? filteredYesterdayProps : filteredTodayProps)
            .filter { !isHomeRunProp($0) }
        return Array(dayProps.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.prefix(2))
    }
    /// The selected day's top game pick. The Today overview never borrows a
    /// prior-day pick; Yesterday uses its complete, explicitly selected board.
    private var topGamePick: (pick: GaryPick, isYesterday: Bool)? {
        let isYesterday = pickDay == .yesterday
        let rows = isYesterday ? store.yesterdayGamePicksAll : store.gamePicks
        let source = rows.filter { ($0.league ?? "").uppercased() == sport }
        guard let pick = source.sorted(by: { ($0.confidence ?? 0) > ($1.confidence ?? 0) }).first else { return nil }
        return (pick, isYesterday)
    }

    /// Current-day candidates used only when establishing the immutable landing
    /// card. Yesterday fallback cards are deliberately not locked: a real pick
    /// for the new board must still be able to replace that recap once it drops.
    private var freshShowcaseGame: GaryPick? {
        let rows = store.gamePicks.filter { ($0.league ?? "").uppercased() == sport }
        return rows.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
    }
    private var freshShowcaseProp: PropPick? {
        filteredTodayProps.filter { !isHomeRunProp($0) }
            .sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
    }

    /// Only a lock for the currently visible slate day + league may render.
    private var activeShowcaseLock: PicksShowcaseLock? {
        guard let lock = showcaseLock,
              lock.slateDate == SupabaseAPI.todayEST(),
              lock.league == sport,
              showcasePayloadBelongsToCurrentSlate(lock) else { return nil }
        return lock
    }

    /// A lock preserves a posted pick for its own board, but it must never carry
    /// a prior-day result into the next 6 a.m. slate. Prefer the payload's game
    /// time; older records without one must still exist in today's fresh feed.
    private func showcasePayloadBelongsToCurrentSlate(_ lock: PicksShowcaseLock) -> Bool {
        let today = SupabaseAPI.todayEST()
        switch lock.kind {
        case .game:
            guard let pick = lock.gamePick else { return false }
            if let iso = pick.commence_time, let date = parseISO8601(iso) {
                return Self.showcaseDayFormatter.string(from: date) == today
            }
            return store.gamePicks.contains { $0.id == pick.id }
        case .prop:
            guard let prop = lock.propPick else { return false }
            if let iso = prop.commence_time, let date = parseISO8601(iso) {
                return Self.showcaseDayFormatter.string(from: date) == today
            }
            return store.allProps.contains { $0.id == prop.id }
        }
    }

    /// Feed the landing page exactly one side of its game-vs-prop chooser once
    /// locked, making later arrivals unable to win a new confidence comparison.
    private var landingTopProps: [PropPick] {
        guard pickDay == .today, let lock = activeShowcaseLock else { return topProps }
        return lock.kind == .prop ? lock.propPick.map { [$0] } ?? [] : []
    }
    private var landingTopGamePick: (pick: GaryPick, isYesterday: Bool)? {
        guard pickDay == .today, let lock = activeShowcaseLock else { return topGamePick }
        guard lock.kind == .game, let pick = lock.gamePick else { return nil }
        return (pick, false)
    }

    private static func showcaseStorageKey(date: String, league: String) -> String {
        "\(showcaseLockPrefix)\(date).\(league.uppercased())"
    }

    /// Restore the league's published card, or freeze the best current-day
    /// candidate the first time one exists. New games/props can continue loading;
    /// they simply cannot displace the card users already saw.
    private func lockShowcaseIfNeeded() {
        guard pickDay == .today else { return }

        let date = SupabaseAPI.todayEST()
        if let lock = activeShowcaseLock,
           lock.slateDate == date,
           lock.league == sport { return }

        let defaults = UserDefaults.standard
        let key = Self.showcaseStorageKey(date: date, league: sport)
        if let data = defaults.data(forKey: key),
           let restored = try? JSONDecoder().decode(PicksShowcaseLock.self, from: data),
           restored.slateDate == date,
           restored.league == sport,
           showcasePayloadBelongsToCurrentSlate(restored) {
            showcaseLock = restored
            return
        }

        // Invalid current-date locks are legacy/stale payloads (for example a
        // prior-night prop first seen during a failed morning refresh). Remove
        // only this derived UI snapshot; the database pick/result is untouched.
        defaults.removeObject(forKey: key)

        showcaseLock = nil
        let game = freshShowcaseGame
        let prop = freshShowcaseProp
        let lock: PicksShowcaseLock?
        if let game, let prop {
            if (game.confidence ?? 0) >= (prop.confidence ?? 0) {
                lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .game,
                                         gamePick: game, propPick: nil)
            } else {
                lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .prop,
                                         gamePick: nil, propPick: prop)
            }
        } else if let game {
            lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .game,
                                     gamePick: game, propPick: nil)
        } else if let prop {
            lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .prop,
                                     gamePick: nil, propPick: prop)
        } else {
            lock = nil
        }

        guard let lock, let data = try? JSONEncoder().encode(lock) else { return }
        defaults.set(data, forKey: key)
        // One small snapshot per active league is enough. Remove prior board
        // dates so UserDefaults never grows with a season of full pick payloads.
        let keepPrefix = "\(Self.showcaseLockPrefix)\(date)."
        for oldKey in defaults.dictionaryRepresentation().keys
            where oldKey.hasPrefix(Self.showcaseLockPrefix) && !oldKey.hasPrefix(keepPrefix) {
            defaults.removeObject(forKey: oldKey)
        }
        showcaseLock = lock
    }
    private var hasContent: Bool { !topProps.isEmpty || topGamePick != nil || !games.isEmpty }

    var body: some View {
        ZStack {
            // College football reads on Home's floor (founder, Sep 4 2026);
            // every other league keeps the flat house ink.
            if sport == "NCAAF" {
                BorrowedHomeBackground()
            } else {
                LiquidGlassBackground(grainDensity: 0)
            }
            VStack(spacing: 0) {
                masthead
                slateStrip
                content
            }
        }

        .task {
            await store.loadIfNeeded()
            rebuildMemo()          // build the memo before consumeFocus reads `games`
            snapSportToAvailableLeague()
            lockShowcaseIfNeeded()
            consumeFocus()
            if !connLoaded { await loadConnections() }
            rebuildMemo()          // fold the just-loaded connections into the edge index
        }
        .task {
            // Strip context is cached and safe to miss; its O/U simply stays off.
            if stripBoard == nil { stripBoard = await TodayBoardCache.get() }
        }
        .task(id: sport) {
            // Each league owns its record. Clear the previous desk immediately so
            // NFL/NCAAF can never flash MLB's L7 while their scoped fetch resolves.
            record7 = nil
            let scopedLeague = sport
            record7 = await SupabaseAPI.fetchSevenDayPickRecord(league: scopedLeague)
        }
        .task {
            // Keep the SHARED live-score cache warm while this tab is on screen — the
            // matchup tabs and the cards both read LiveScoreCache.shared now (it owns
            // the dedup + its own adaptive refresh loop), so this page no longer keeps
            // its own snapshot that could disagree with the cards.
            liveCache.startIfNeeded()
        }
        .onChange(of: sport) { _ in
            page = 0
            // A fresh league entry always starts college at RANKED.
            ncaafConference = Self.ncaafRankedFilter
            gamesMemo = []
            rebuildMemo()
            lockShowcaseIfNeeded()
            consumeFocus()
        }
        .onChange(of: pickDay) { _ in
            page = 0
            gamesMemo = []
            rebuildMemo()
            lockShowcaseIfNeeded()
            consumeFocus()
        }
        .onChange(of: connLoaded) { _ in rebuildMemo() }
        // The store's picks/props/slate settle asynchronously after each load — a
        // count signature fires rebuildMemo() once they land (and after a refresh),
        // so the memo tracks the data without recomputing on every live-score tick.
        .onChange(of: dataSignature) { _ in
            rebuildMemo()
            snapSportToAvailableLeague()
            lockShowcaseIfNeeded()
            consumeFocus()
        }
        .onChange(of: focusState.focusGame) { _ in consumeFocus() }
        .onChange(of: store.loading) { loading in if !loading { snapSportToAvailableLeague(); consumeFocus() } }
        .onChange(of: scenePhase) { phase in
            // Foreground → silently re-pull picks/props (the spinner is gated by
            // !hasContent, so existing data stays put while fresh rows load underneath).
            if phase == .active { Task { await refreshRollingPicks() } }
        }
        .onChange(of: selectedTab) { tab in
            guard tab == 3, scenePhase == .active else { return }
            Task { await refreshRollingPicks() }
        }
        .onReceive(rollingPicksRefreshTimer) { _ in
            guard selectedTab == 3, scenePhase == .active else { return }
            Task { await refreshRollingPicks() }
        }
        .onGaryTour { verb, arg in
            switch verb {
            case "picks": if let idx = Int(arg) { withAnimation { page = idx } }
            case "picksday": withAnimation { pickDay = arg == "yesterday" ? .yesterday : .today }
            case "picksport":
                if sports.contains(arg.uppercased()) { sport = arg.uppercased(); sportAutoSelected = false }
            default: break
            }
        }
    }

    @MainActor
    private func refreshRollingPicks() async {
        guard !rollingPicksRefreshInFlight, !store.loading else { return }
        rollingPicksRefreshInFlight = true
        defer { rollingPicksRefreshInFlight = false }
        // The pull gesture's task is SwiftUI's to cancel — a mid-pull
        // re-render tears it down and every in-flight request died
        // "cancelled" (Aug 26 sim repro: the fresh Dbacks pick never landed
        // and the banner blamed the source). The actual work runs in an
        // UNSTRUCTURED task the gesture cannot kill; awaiting its value
        // keeps the spinner honest for the full duration.
        let work = Task {
            await store.refresh()
            await loadConnections()
        }
        await work.value
        rebuildMemo()
    }

    /// A cheap Equatable digest of every input the memoized game set + edge index
    /// depend on (counts + the refresh tick). Changes only when the underlying data
    /// actually changes — NOT on a live-score publish — so `.onChange` drives
    /// rebuildMemo() exactly when needed and never on a tick.
    private var dataSignature: String {
        "\(store.allProps.count)-\(store.yesterdayPropsAll.count)-\(store.gamePicks.count)-\(store.yesterdayGamePicksAll.count)-\(store.slate.count)-\(connections.count)-\(store.refreshTick)"
    }

    /// Land on the matchup the Hub deep-linked ("LAD @ ARI"). Leaves the
    /// request pending while the slate is still loading; clears it once a
    /// match attempt has been made.
    private func consumeFocus() {
        guard let focus = focusState.focusGame else { return }
        let focusLeague = focusState.focusLeague
        let focusGameID = focusState.focusGameID
        let exactSlate = focusGameID.flatMap { gameID in
            store.slate.first {
                $0.bdl_game_id == gameID
                    && (focusLeague == nil || ($0.league ?? "").uppercased() == focusLeague)
            }
        }
        let exactPick = focusGameID.flatMap { gameID in
            store.gamePicks.first {
                $0.game_id == gameID
                    && (focusLeague == nil || ($0.league ?? "").uppercased() == focusLeague)
            }
        }
        let targetLeague = focusLeague
            ?? exactSlate?.league?.uppercased()
            ?? exactPick?.league?.uppercased()
            ?? store.slate.first {
                abbrGameMatches(focus, matchup: "\($0.away_team ?? "") @ \($0.home_team ?? "")")
            }?.league?.uppercased()
            ?? store.gamePicks.first {
                abbrGameMatches(focus, matchup: "\($0.awayTeam ?? "") @ \($0.homeTeam ?? "")")
            }?.league?.uppercased()

        // Change the day and league before consulting the scoped `games` memo.
        // The request stays pending across either state transition; the next
        // runloop consumes it after onChange rebuilds the correct desk.
        if pickDay != .today {
            pickDay = .today
            return
        }
        if let targetLeague {
            // Do not consume a typed target against the wrong desk while its
            // league is still loading into the unscoped source set.
            guard sports.contains(targetLeague) else { return }
            if sport != targetLeague {
                sport = targetLeague
                sportAutoSelected = false
                return
            }
        }

        guard !games.isEmpty else { return }
        let exactKey = exactSlate.map {
            Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                 $0.commence_time.flatMap(parseISO8601))
        } ?? exactPick.map {
            Self.gameIdentityKey("\($0.awayTeam ?? "") @ \($0.homeTeam ?? "")",
                                 $0.commence_time.flatMap(parseISO8601))
        }
        let idx = focusGameID.flatMap { gameID in
            games.firstIndex { bdlGameId(for: $0) == gameID }
        } ?? exactKey.flatMap { target in
            games.firstIndex { Self.gameIdentityKey($0.matchup, $0.commence) == target }
        } ?? games.firstIndex(where: { abbrGameMatches(focus, matchup: $0.matchup) })

        // Data exists for the selected desk, so this is a completed match
        // attempt whether or not a legacy fuzzy target could be resolved.
        focusState.clearGameFocus()
        if let idx {
            withAnimation(.easeInOut(duration: 0.25)) { page = idx + 1 }
        }
    }

    @ViewBuilder private var content: some View {
        if store.loading && !hasContent && !store.slateUnavailable {
            Spacer(); ProgressView().tint(GaryColors.gold); Spacer()
        } else if !hasContent {
            emptyState
        } else {
            VStack(spacing: 0) {
                if pickDay == .today && scopedBoardSourceFailed {
                    sourceFailureBanner
                }
                pager
            }
        }
    }

    private var scopedBoardSourceFailed: Bool {
        if store.propPickSourceFailed || store.slateSourceFailed { return true }
        switch sport {
        case "NFL": return store.gamePickSourceFailures.contains("NFL")
        default: return store.gamePickSourceFailures.contains("DAILY")
        }
    }

    private var sourceFailureBanner: some View {
        HStack(spacing: 7) {
            BroadcastBar(height: 9)
            Text("BOARD DATA UNAVAILABLE · PULL TO RETRY")
                .font(GaryFonts.mono(9.5, bold: true)).tracking(0.7)
                .foregroundStyle(GaryColors.gold)
            Spacer(minLength: 0)
        }
        .pageGutter()
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.22))
    }

    private var pager: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                ScrollView(showsIndicators: false) {
                    PicksTodayPage(topProps: landingTopProps, topGamePick: landingTopGamePick,
                                   gamePickResult: { store.gamePickResult($0, forYesterday: pickDay == .yesterday) }, resultForProp: { store.resultForProp($0, forYesterday: pickDay == .yesterday) },
                                   edges: sportConnections, scopeLeague: effectiveScope, isToday: pickDay == .today, onTapProp: { selectedProp = $0 })
                        .padding(.bottom, 130)
                }
                .refreshable { await refreshRollingPicks() }
                .clipped()
                .tag(0)
                ForEach(Array(games.enumerated()), id: \.offset) { idx, g in
                    ScrollView(showsIndicators: false) {
                        PicksGamePage(group: g,
                                      // MLB HR is a HOME-RUN props lane — never show the game's
                                      // side/total pick there, only the HR bets. On Yesterday,
                                      // prefer yesterday's (graded) pick for a series matchup.
                                      // Doubleheaders: only picks stamped for THIS game's start
                                      // bucket ride this page — the twin keeps its own.
                                      entries: {
                                          guard sport != "MLB HR" else { return [] }
                                          let all = store.gamePicksForMatchup(
                                              g.matchup,
                                              league: league(for: g),
                                              preferYesterday: pickDay == .yesterday
                                          )
                                          guard g.dh else { return all }
                                          return all.filter {
                                              Self.timeBucket($0.pick.commence_time.flatMap(parseISO8601)) == Self.timeBucket(g.commence)
                                          }
                                      }(),
                                      gamePickResult: { store.gamePickResult($0, forYesterday: pickDay == .yesterday) }, resultForProp: { store.resultForProp($0, forYesterday: pickDay == .yesterday) },
                                      edges: edges(for: g), bdlGameId: bdlGameId(for: g),
                                      interruptionLabel: interruptionLabel(for: g),
                                      onTapProp: { selectedProp = $0 },
                                      onSeeYesterday: { withAnimation(.easeInOut(duration: 0.25)) { pickDay = .yesterday; page = 0 } },
                                      pageLeagueHint: league(for: g))
                            .padding(.bottom, 130)
                    }
                    .refreshable { await refreshRollingPicks() }
                    .clipped()
                    .id(Self.gameIdentityKey(g.matchup, g.commence))
                    .tag(idx + 1)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            // A league switch replaces the page controller immediately. Keeping
            // the old controller alive for an animated crossfade briefly painted
            // MLB cards underneath the NFL header even though the data was scoped.
            .id("\(sport)-\(pickDay == .today ? "today" : "yesterday")")
        }
    }

    /// The Hub masthead, worn by Picks (founder, Jul 22: "the nav bar at the
    /// top of The Hub and this entire upper part is what I want for the Picks
    /// page"): bear + THE PICKS wordmark, the rolling 7-day pick record, the
    /// double gold rule, then the league tabs in the Hub's underline idiom.
    /// Same ramp (HubFont), same geometry — only the record's source differs
    /// (real game picks, not insight lanes).
    // The ONE header (Aug 4) — logo/wordmark/rule now come from GaryPageHeader
    // (the record rides the trailing slot; the two-line record row and the
    // page's own double-rule seam retired with the five-masthead era). The
    // sport tab row is this page's control strip, stacked under the template.
    private var masthead: some View {
        VStack(alignment: .leading, spacing: 0) {
            // MLB PICKS as the switcher (founder, Aug 6): the league moved
            // into the wordmark — tap the title to change sport — and the
            // separate trigger row below retired, buying back its height.
            GaryPageHeader(title: sport.isEmpty ? "The" : sport,
                           goldPart: "Picks ▾",
                           titleAction: { if !sports.isEmpty { presentLeagueWords() } },
                           titleAccessibilityLabel: "Switch league, \(sport) selected",
                           trailing: {
                if let r = record7 {
                    let pct = Int((Double(r.w) / Double(max(r.w + r.l, 1)) * 100).rounded())
                    HStack(spacing: 5) {
                        Text("L7")
                            .font(GaryFonts.kicker(9.5)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.62))
                        Text("\(r.w)–\(r.l) · \(pct)%")
                            .font(GaryFonts.data(11, .bold))
                            .foregroundStyle(GaryColors.gold)
                    }
                }
            })

            // LEAGUE WORDS (founder pick, mock 64): the underline sport tabs
            // became a single trigger — tap the current league and the full-
            // screen typographic switcher takes the room. Unlike the old
            // underline tabs (which only existed to switch BETWEEN leagues,
            // so hid at count<=1), this trigger always shows whenever there's
            // a real league to label — it's the page's "you're looking at
            // MLB" readout as much as a switcher, and today it's the only way
            // to see the feature at all before football/basketball are live.
        }
    }

    /// Tonight's slate count for a sport tab — the overlay's superscript.
    /// Real info only: lanes without a slate row (MLB HR) show a bare word.
    private func slateGameCount(_ s: String) -> Int {
        store.slate.filter { ($0.league ?? "").uppercased() == s.uppercased() }.count
    }

    private func presentLeagueWords() {
        let opts = sports.map { s -> LeagueOverlayState.Option in
            let n = slateGameCount(s)
            let live = liveCache.scores.contains {
                $0.isLive && ($0.league ?? "").uppercased() == s.uppercased()
            }
            let liveCount = liveCache.scores.filter {
                $0.isLive && ($0.league ?? "").uppercased() == s.uppercased()
            }.count
            let sup: String? = n > 0
                ? (live ? "\(n) · \(liveCount) LIVE" : "\(n) GAME\(n == 1 ? "" : "S")")
                : nil
            return .init(code: s, sup: sup, live: live, selected: s == sport)
        }
        // The whole calendar, not just what's live (founder, Aug 4).
        let full = opts + LeagueOverlayState.offSeasonOptions(excluding: Set(sports))
        LeagueOverlayState.shared.present(full) { picked in
            sport = picked
            sportAutoSelected = false
        }
    }

    /// The day's slate as the game selector — the Hub strip's exact grammar
    /// (abbr matchup over time + O/U, hairline-separated blocks), with
    /// selection: tapping a block pages to that game. The first block is the
    /// Today/Yesterday day selector; live/final states take the second line.
    private var slateStrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    dayBlock
                    // NCAAF only: the conference selector rides the strip in
                    // the day block's grammar (founder, Aug 25 2026).
                    if sport == "NCAAF", pickDay == .today, !ncaafConferenceOptions().isEmpty {
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1, height: 26)
                        conferenceBlock
                    }
                    ForEach(Array(games.enumerated()), id: \.offset) { idx, g in
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1, height: 26)
                        stripBlock(idx + 1, g)
                    }
                }
                .padding(.horizontal, 18)
            }
            .onChange(of: page) { p in withAnimation { proxy.scrollTo(p, anchor: .center) } }
        }
        .padding(.top, 12)
        .padding(.bottom, 2)
    }

    /// The strip's first block: TODAY/YESTERDAY ▾ over the day's date. Tap =
    /// back to the day board (or flip the day when already there); long-press
    /// = the explicit menu — the old tab row's behavior in the strip's clothes.
    private var dayBlock: some View {
        let on = (page == 0)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? cal.timeZone
        let f = DateFormatter()
        f.timeZone = cal.timeZone
        f.dateFormat = "MMM d"
        let day = f.string(from: cal.date(byAdding: .day, value: pickDay == .today ? 0 : -1, to: Date()) ?? Date()).uppercased()
        return Menu {
            Button("Today")     { withAnimation(.easeInOut(duration: 0.25)) { pickDay = .today; page = 0 } }
            Button("Yesterday") { withAnimation(.easeInOut(duration: 0.25)) { pickDay = .yesterday; page = 0 } }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(pickDay == .today ? "TODAY" : "YESTERDAY")
                        .font(HubFont.data(11.5, .semibold))
                        .foregroundStyle(.white.opacity(on ? 0.95 : 0.62))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
                Text(day)
                    .font(HubFont.data(9.5, .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
            .padding(.trailing, 13)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        } primaryAction: {
            withAnimation(.easeInOut(duration: 0.25)) {
                if page != 0 {
                    // On a game page — tap the day block to return to THIS day's
                    // overview (page 0), keeping the day (Today stays Today).
                    page = 0
                } else {
                    // Already on the day board — flip Today <-> Yesterday.
                    pickDay = (pickDay == .today ? .yesterday : .today)
                }
            }
        }
        .id(0)
    }

    /// One game on the strip: "PIT @ NYY" over its status — pre-game the time
    /// (+ O/U when the board knows it), then ▶ LIVE · score, then FINAL · score.
    /// A doubleheader shows two blocks, told apart by their times.
    private func stripBlock(_ index: Int, _ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> some View {
        let on = (index == page)
        let lg = gameLeague(g)
        let parts = g.matchup.components(separatedBy: " @ ")
        let official = boardAbbreviations(for: g)
        // College names are the long ones — "SAN JOSÉ STATE SPARTANS @ EASTERN
        // MICHIGAN EAGLES" ran off the block (founder, Sep 4 2026). The
        // provider's own scoreboard code leads (SJSU @ EMU); a school it does
        // not carry falls back to its name without the mascot.
        let label = official.map { "\($0.away) @ \($0.home)" }
            ?? (parts.count == 2
                ? (lg == "NCAAF"
                    ? "\(Self.ncaafStripName(parts[0])) @ \(Self.ncaafStripName(parts[1]))"
                    : "\(teamAbbrev(parts[0], league: lg)) @ \(teamAbbrev(parts[1], league: lg))")
                : g.matchup.uppercased())
        let timeLabel = g.time.replacingOccurrences(of: " ET", with: "")
        let total = totalFor(g)
        return Button { withAnimation(.easeInOut(duration: 0.25)) { page = index } } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(HubFont.data(11.5, .semibold))
                    .foregroundStyle(.white.opacity(on ? 0.95 : 0.62))
                HStack(spacing: 6) {
                    if let lf = liveFinalLine(for: g) {
                        Text(lf.text)
                            .font(HubFont.data(9.5, .medium))
                            .foregroundStyle(lf.color)
                    } else {
                        if !timeLabel.isEmpty {
                            Text(timeLabel)
                                .font(HubFont.data(9.5, .medium))
                                .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.55))
                        }
                        if let total {
                            Text("O/U \(HubFmt.stat(total))")
                                .font(HubFont.data(9.5, .medium))
                                .foregroundStyle(.white.opacity(0.55))
                        }
                        if timeLabel.isEmpty && total == nil {
                            // Keep every block two lines tall so the strip never
                            // staggers when one game is missing its time.
                            Text(" ").font(HubFont.data(9.5, .medium))
                        }
                    }
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .id(index)
    }

    /// One college side on the strip: the provider's abbreviation, else the
    /// school without its mascot, else the raw name. Never the mascot.
    static func ncaafStripName(_ team: String) -> String {
        if let abbr = NCAAFTeams.abbreviation(team) { return abbr }
        return Formatters.shortTeamName(team, league: "NCAAF").uppercased()
    }

    /// Board O/U for a strip block (today only — yesterday's blocks carry FINALs).
    /// Matched by GAME identity, so a doubleheader's blocks wear their own totals.
    private func totalFor(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Double? {
        guard pickDay == .today, let rows = stripBoard?.board else { return nil }
        let key = Self.gameIdentityKey(g.matchup, g.commence)
        return rows.first {
            Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                 $0.commence_time.flatMap(parseISO8601)) == key
        }?.total
    }

    /// Official provider abbreviations, resolved by exact provider game id and
    /// league before any legacy name/time fallback. This is especially important
    /// for NCAAF, where a mascot-derived fallback can turn "Alabama Crimson Tide"
    /// into the incorrect "TID".
    private func boardAbbreviations(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> (away: String, home: String)? {
        guard pickDay == .today else { return nil }
        let league = gameLeague(g).uppercased()

        if let gameId = bdlGameId(for: g),
           let live = liveCache.status(forGameId: gameId, league: league),
           (live.league ?? "").uppercased() == league,
           let away = live.away_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
           let home = live.home_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
           !away.isEmpty, !home.isEmpty {
            return (away.uppercased(), home.uppercased())
        }

        guard let rows = stripBoard?.board else { return nil }
        let key = Self.gameIdentityKey(g.matchup, g.commence)
        let row: TomorrowBoardRow?
        if let gameId = bdlGameId(for: g) {
            row = rows.first {
                $0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league
            }
        } else {
            // Name/time matching exists only for legacy rows that carry no id.
            row = rows.first {
                $0.bdl_game_id == nil
                    && ($0.league ?? "").uppercased() == league
                    && Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                            $0.commence_time.flatMap(parseISO8601)) == key
            }
        }
        guard let row,
        let away = row.away_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
        let home = row.home_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
        !away.isEmpty, !home.isEmpty else { return nil }
        return (away.uppercased(), home.uppercased())
    }

    /// LIVE / FINAL second line for a strip block; nil pre-game (the block
    /// shows time + O/U instead). Yesterday's FINAL comes from the graded
    /// result, not the live-score cache (which only reliably has today's
    /// games) — except on doubleheader days, where a matchup-keyed final
    /// can't say WHICH game it belongs to and stays off (never the twin's).
    private func liveFinalLine(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> (text: String, color: Color)? {
        if pickDay == .yesterday, !g.dh, let raw = store.finalScore(forMatchup: g.matchup) {
            return ("FINAL · \(formatFinalScore(g.matchup, raw))", .white.opacity(0.45))
        }
        if let ls = liveScore(for: g) {
            if let interruption = ls.interruptionLabel {
                return (interruption, GaryColors.gold)
            }
            if ls.isLive {
                let score = ls.scoreLine.map { " · \($0)" } ?? ""
                let det = (ls.detail?.isEmpty == false) ? " · \(ls.detail!)" : ""
                return ("▶ LIVE\(score)\(det)", GaryColors.win)
            }
            if ls.isFinal, let score = ls.scoreLine {
                return ("FINAL · \(formatFinalScore(g.matchup, score))", .white.opacity(0.45))
            }
        }
        // The exact slate row closes the brief gap before live_scores picks up
        // an interruption. Provider id + league are mandatory; a matchup-only
        // row can never put one twin game's delay on the other.
        if let interruption = interruptionLabel(for: g) {
            return (interruption, GaryColors.gold)
        }
        return nil
    }

    /// Exact interruption state for one Picks-page game. A live/final snapshot
    /// outranks the daily-slate mirror; otherwise either exact source may carry
    /// the provider's label while the other refreshes.
    private func interruptionLabel(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> String? {
        if let live = liveScore(for: g) {
            if live.isLive || live.isFinal { return nil }
            if let label = live.interruptionLabel { return label }
        }
        guard pickDay == .today, let gameId = bdlGameId(for: g) else { return nil }
        let league = gameLeague(g).uppercased()
        return store.slate.first {
            $0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league
        }?.interruptionLabel
    }

    /// Three-letter team abbreviation from the league keyword maps (sibling of the
    /// Home view's teamAbbrev) — renders yesterday's final as "COL 6 · CHC 8",
    /// matching the live-score line format.
    private func teamAbbrev(_ name: String, league: String) -> String {
        let lower = name.lowercased()
        let maps: [[String: [String]]]
        switch league.uppercased() {
        case "MLB", "MLB HR": maps = [mlbTeamKeywords]
        case "NBA": maps = [nbaTeamKeywords]
        case "NHL": maps = [nhlTeamKeywords]
        case "NFL", "NFL TDS": maps = [nflTeamKeywords]
        case "WC": maps = [wcTeamKeywords]
        default: maps = [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords, wcTeamKeywords]
        }
        for map in maps {
            for (ab, kws) in map where kws.contains(where: { lower.contains($0) }) { return ab }
        }
        let last = lower.split(separator: " ").last.map(String.init) ?? lower
        return String(last.prefix(3)).uppercased()
    }

    /// "6-8" + "Rockies @ Cubs" -> "COL 6 · CHC 8". final_score is away-home,
    /// matching the matchup's "Away @ Home" order.
    private func formatFinalScore(_ matchup: String, _ raw: String) -> String {
        finalScoreLine(matchup: matchup, raw: raw,
                       league: gameLeague((matchup: matchup, time: "", commence: nil, dh: false, props: [])))
    }

    /// Pre-pick page with VALUE, not a shrug (founder, Jul 12: the dashed
    /// "check back later" card was "half assed"). Today: the sport's actual
    /// slate with each game's pick ETA. Dark day: the honest line. Yesterday
    /// mode keeps the plain empty note.
    private var emptyState: some View {
        let rows: [(matchup: String, eta: String?)] = store.slate
            .filter { r in
                let lg = (r.league ?? "").uppercased()
                return (lg == sport)
            }
            .sorted { ($0.commence_time ?? "") < ($1.commence_time ?? "") }
            .prefix(10)
            .map { r in
                let a = Formatters.shortTeamName(r.away_team, league: r.league)
                let h = Formatters.shortTeamName(r.home_team, league: r.league)
                var eta: String? = nil
                if let ct = r.commence_time, let d = parseISO8601(ct) {
                    eta = TomorrowView.etTime(ISO8601DateFormatter().string(from: d.addingTimeInterval(-5400)),
                                              withZone: false, meridiem: true).uppercased()
                }
                return ("\(a) @ \(h)", eta)
            }

        return VStack(alignment: .leading, spacing: 0) {
            if pickDay == .yesterday {
                Text("NO GRADED PICKS THIS DAY")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.7))
                    .pageGutter().padding(.top, 20)
            } else if scopedBoardSourceFailed {
                sourceFailureBanner
                    .padding(.top, 12)
            } else if store.slateUnavailable {
                HStack(spacing: 8) {
                    BroadcastBar(height: 11)
                    Text("BOARD TEMPORARILY UNAVAILABLE")
                        .font(GaryFonts.accent(13)).tracking(0.6)
                        .foregroundStyle(GaryColors.gold)
                }
                .pageGutter().padding(.top, 20)
                Text("Gary couldn't reach today's slate. Pull down to retry — this is a connection problem, not a dark day.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(GaryColors.sectionSub)
                    .pageGutter().padding(.top, 8)
            } else if rows.isEmpty {
                if scopedFootballConnectionFailed {
                    HStack(spacing: 8) {
                        BroadcastBar(height: 11)
                        Text("BOARD INTEL UNAVAILABLE · PULL TO RETRY")
                            .font(GaryFonts.accent(13)).tracking(0.6)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .pageGutter().padding(.top, 20)
                } else if let nextSlateSignal {
                    FootballNextSlatePreview(signal: nextSlateSignal, accent: Sport.ncaaf.accentColor)
                        .padding(.top, 20)
                } else {
                    // Honest fallback when the future provider window is also empty.
                    HStack(spacing: 8) {
                        BroadcastBar(height: 11)
                        Text("NO \(sport) TODAY")
                            .font(GaryFonts.accent(13)).tracking(0.6)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .pageGutter().padding(.top, 20)
                }
            } else {
                HStack(spacing: 8) {
                    BroadcastBar(height: 11)
                    Text("THE CARD IS COMING")
                        .font(GaryFonts.accent(13)).tracking(0.6)
                        .foregroundStyle(GaryColors.gold)
                }
                .pageGutter().padding(.top, 20)
                Text("Gary works game by game — every pick lands about 90 minutes before the start.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(GaryColors.sectionSub)
                    .pageGutter().padding(.top, 8)

                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(row.matchup)
                                .font(GaryFonts.display(19))
                                .foregroundStyle(GaryColors.warmWhite.opacity(0.94))
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Spacer(minLength: 8)
                            if let eta = row.eta {
                                Text("PICK ~\(eta)")
                                    .font(GaryFonts.mono(11.5, bold: true))
                                    .foregroundStyle(GaryColors.meta)
                            }
                        }
                        .padding(.vertical, 11)
                        if i < rows.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                        }
                    }
                }
                .pageGutter().padding(.top, 14)
            }
            Spacer(minLength: 0)
        }
    }

    /// Best-effort league for a strip block so teamAbbrev can pick the right
    /// abbreviation map. Reads the game's own props first, then the day's
    /// picks / slate, falling back to the active filter.
    private func gameLeague(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> String {
        league(for: g) ?? ""
    }

    /// Best-effort: surface edges whose "ABBR @ ABBR" shares a team token with
    /// this game's matchup or its prop teams. abbrGameMatches resolves both MLB
    /// and NBA abbreviations, so either league's edges attach to their game.
    /// PERF#1(c): now an O(1) read of the precomputed edgeIndex (built in
    /// rebuildMemo when connections/games change), not a per-render N×M scan.
    /// Falls back to the live scan for any game key not yet indexed (e.g. a
    /// deep-link race before the first rebuild) so reach is never lost — the
    /// fallback applies the same per-GAME id scoping as the index build.
    private func edges(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> [Signal] {
        if let hit = edgeIndex[Self.gameIdentityKey(g.matchup, g.commence)] { return hit }
        let hay = g.matchup + " " + g.props.compactMap { $0.team }.joined(separator: " ")
        let gKey = Self.matchupKey(g.matchup)
        let gid = bdlGameId(for: g)
        return connections.filter { s in
            if let gid, let sid = s.gameId.flatMap({ Int($0) }) { return sid == gid }
            guard abbrGameMatches(s.game, matchup: hay) || Self.matchupKey(s.game) == gKey else { return false }
            if g.dh, s.gameId != nil { return false }
            return true
        }
    }

    private var effectiveScope: String { sport }

    /// Edges always belong to the selected sport.
    private var sportConnections: [Signal] {
        guard let lg = HubLeagueSel.from(sport) else { return [] }
        return connections.filter { $0.league == lg }
    }

    private var nextSlateSignal: Signal? {
        guard sport == "NCAAF" else { return nil }
        return connections.first { $0.league == .ncaaf && $0.kind == .nextSlate }
    }

    private var scopedFootballConnectionFailed: Bool {
        guard sport == "NFL" || sport == "NCAAF",
              let league = HubLeagueSel.from(sport) else { return false }
        return connectionErrorLeagues.contains(league)
    }

    /// Fantasy-corner lanes never ride the Picks page (founder, Aug 6: "remove
    /// the Cut List from the Picks page just keep it in the fantasy part").
    /// These rows are roster advice, not a read on tonight's bet, and their
    /// cards carry a tier word + stat strip the edge rows can't render — a
    /// leaked one printed a wall of cut-or-keep prose under a game. Same set
    /// the Hub's front page excludes; Fantasy remains their one home.
    static let fantasyOnlyKinds: Set<SignalKind> = [
        .fantasyPickups, .twoStart, .closerWatch, .returnWatch, .cutList,
        .fantasyUsage, .fantasyRedZone, .fantasyMatchup, .fantasyTrend,
    ]

    @MainActor
    private func loadConnections() async {
        guard !connectionLoadInFlight else { return }
        connectionLoadInFlight = true
        defer { connectionLoadInFlight = false }
        let date = SupabaseAPI.todayEST()
        let fantasyKinds = Self.fantasyOnlyKinds
        var successful: [HubLeagueSel: [Signal]] = [:]
        var failures: Set<HubLeagueSel> = []
        await withTaskGroup(of: (league: HubLeagueSel?, signals: [Signal], failed: Bool).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    let league = HubLeagueSel.from(lg)
                    do {
                        let conns = try await SupabaseAPI.fetchInsightConnections(date: date, league: lg)
                        let signals = conns.compactMap { $0.toSignal() }
                            .filter { !fantasyKinds.contains($0.kind) }
                        return (league, signals, false)
                    } catch {
                        print("[Picks] fetchInsightConnections(\(lg)) error: \(error.localizedDescription)")
                        return (league, [], true)
                    }
                }
            }
            for await result in group {
                guard let league = result.league else { continue }
                if result.failed { failures.insert(league) }
                else { successful[league] = result.signals }
            }
        }

        // Successful zero-row responses clear that desk. A failed desk alone
        // keeps its last-good rows and is retried on foreground, pull, and the
        // same 90-second cadence as picks/props.
        let retained = connections.filter { failures.contains($0.league) }
        connections = retained + successful.values.flatMap { $0 }
        connectionErrorLeagues = failures
        // A fully-failed load (every league errored — e.g. the FIRST fetch
        // cancelled by a quick tab switch) must not latch `connLoaded`: with
        // nothing retained and nothing fetched, latching tells the .task
        // re-entry guard the board is loaded and parks an empty board on the
        // 90-second timer (the founder's Aug 20 blank slate-read). Any real
        // success — including a legitimately empty day — still latches.
        if !successful.isEmpty { connLoaded = true }
    }
}

struct PicksTodayPage: View {
    let topProps: [PropPick]
    let topGamePick: (pick: GaryPick, isYesterday: Bool)?
    let gamePickResult: (GaryPick) -> String?
    let resultForProp: (PropPick) -> String?
    let edges: [Signal]
    /// The Picks page's current individual sport scope ("MLB"/"NFL"/…) — the same
    /// scope that filters the edges. LEAGUE PULSE is league-wide, so it only
    /// lights up on an MLB or WC scope and collapses otherwise.
    let scopeLeague: String
    /// True on the TODAY board (not the Yesterday view). Drives the blurred
    /// "pick coming" teaser: TODAY with nothing posted for this sport yet shows the
    /// lock card, never an empty top — Yesterday with no result just shows nothing.
    let isToday: Bool
    let onTapProp: (PropPick) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            topSinglePick
            // LEAGUE PULSE moved to The Hub (founder, Jul 30) — the Picks page
            // stays picks + edges.
            // (The World Cup's bespoke section was deleted with the WC UI on
            // Aug 24 2026 — the 2026 tournament ended Jul 19, pipeline removed
            // Jul 21, and the founder's cleanup order finished the job. A 2030
            // revival is a rebuild, not a revert — see the Jul 21 removal.)
            if scopeLeague == "NFL" || scopeLeague == "NCAAF" {
                // Football runs the same section as MLB — same category tabs,
                // same feed — through a proof gate that keeps unverified
                // market/live rows off this surface (founder, Aug 20).
                EdgesSection(title: "TODAY'S EDGES",
                             edges: FootballTodayFeed.rows(edges), tabbed: true)
            } else {
                // The season series belongs to its GAME, not the day's list
                // (founder, Aug 6: "Head to Head should not be on the Today's
                // page ONLY under the the matchup/game of the two teams").
                // Keep structured football proof rows out of this prose feed.
                // The filter is a no-op for MLB kinds.
                EdgesSection(title: "TODAY'S EDGES",
                             edges: FootballTodayFeed.rows(edges.filter { $0.kind != .h2h }),
                             tabbed: true)
            }
        }
    }

    /// The Today page is the free showcase — exactly ONE pick (user call, Jun 16):
    /// the highest-confidence play for this sport scope, game or prop, with today's
    /// fresh pick preferred over yesterday's stamped result.
    @ViewBuilder private var topSinglePick: some View {
        let gp = topGamePick
        let prop = topProps.first
        let gameFresh = gp.map { !$0.isYesterday && gamePickResult($0.pick) == nil } ?? false
        let propFresh = prop.map { resultForProp($0) == nil } ?? false
        // Prefer a fresh pick over a stamped one; within the same tier, higher
        // confidence wins. A graded yesterday card shows only if nothing fresh exists.
        let showGame: Bool = {
            guard gp != nil else { return false }
            guard prop != nil else { return true }
            if gameFresh != propFresh { return gameFresh }
            return (gp?.pick.confidence ?? 0) >= (prop?.confidence ?? 0)
        }()

        if showGame, let gp {
            FlippablePickCard(pick: gp.pick,
                              gameResult: gamePickResult(gp.pick),
                              showSportBadge: true)
                .padding(.horizontal, 22)   // match the per-game cards (screen−44) so eyebrow + time line up across the Picks tab
                .padding(.top, 10)          // breathing room from the day/matchup tab row (was flush after the gold underline came off)
        } else if let only = prop {
            FlippablePropCard(prop: only, gameResult: resultForProp(only), showSportBadge: true)
                .padding(.horizontal, 22)   // same width as the per-game prop cards
                .padding(.top, 10)          // breathing room from the tab row (matches the game-card variant)
        } else if isToday {
            // Nothing posted for this sport yet — tease it with the blurred lock card
            // (never an empty top). A fresh pick replaces it the moment Gary posts.
            TeasedPickCard(league: scopeLeague)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
        }
    }

}

/// The "pick coming" card for the free Picks page (Jul 3 2026 — no blur, per
/// founder: keep the standard card design, just say the pick isn't here YET).
/// It is a real pick card in every way — eyebrow, Skyscraper hero, meta,
/// footer — whose headline happens to be INCOMING.
struct TeasedPickCard: View {
    /// Sport label for the meta line, when the caller knows the league.
    var league: String? = nil
    /// Start time copy for the footer's left corner ("7:05 PM ET"), if known.
    var time: String? = nil
    /// Kickoff/first pitch — once it passes, "incoming" would be a lie (the
    /// window closed), so the card switches to the honest no-pick state.
    var commence: Date? = nil
    /// Exact provider interruption for this game. When present, the old start
    /// time cannot turn the placeholder into the false NO PICK state.
    var interruptionLabel: String? = nil
    /// Optional footer-right action (the game pages link back to yesterday).
    var onSeeYesterday: (() -> Void)? = nil

    private var providerStatus: String? {
        guard let value = interruptionLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value.uppercased()
    }
    private var gameStarted: Bool {
        guard providerStatus == nil else { return false }
        return commence.map { $0 <= Date() } ?? false
    }
    private var eventName: String {
        switch league?.uppercased() {
        case "NFL", "NCAAF": return "kickoff"
        case "NBA", "WC": return "tipoff"
        default: return "first pitch"
        }
    }

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 10) {
                    Text("GARY'S PICK")
                        .font(GaryFonts.accent(12.5)).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.top, 6)
                    Spacer()
                }
                .padding(.bottom, 6)

                VStack(alignment: .leading, spacing: -18) {
                    Text(providerStatus != nil ? "GAME" : (gameStarted ? "NO PICK" : "PICKS"))
                        .font(GaryFonts.display(58))
                        .foregroundStyle(.white)
                    Text(providerStatus ?? (gameStarted ? "THIS GAME" : "INCOMING"))
                        .font(GaryFonts.display(58))
                        .foregroundStyle(GaryColors.lightGold)
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
                .padding(.top, -1)
                .padding(.trailing, 52)

                Text(providerStatus != nil
                     ? "The provider lists this game as \(providerStatus!.lowercased()). Gary's call stays off the live board."
                     : gameStarted
                     ? "Gary's call didn't post for this one. The rest of the board is live."
                     : "Gary posts his call ~90 minutes before \(eventName)")
                    .font(GaryFonts.text(13.5, .medium))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .padding(.top, -3)

                Rectangle()
                    .fill(.white.opacity(0.12))
                    .frame(height: 1)
                    .padding(.vertical, 12)

                HStack(spacing: 10) {
                    Text([league?.uppercased(), providerStatus ?? time].compactMap { $0 }.joined(separator: " · ")
                         .isEmpty ? "TONIGHT" : [league?.uppercased(), providerStatus ?? time].compactMap { $0 }.joined(separator: " · "))
                        .font(GaryFonts.mono(11, bold: true)).tracking(0.5)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    if let onSeeYesterday {
                        Button(action: onSeeYesterday) {
                            Text("YESTERDAY'S RESULTS ›")
                                .font(GaryFonts.mono(10.5, bold: true)).tracking(0.8)
                                .foregroundStyle(GaryColors.gold)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(18)

            Image(GaryBrand.mark)
                .resizable().scaledToFit()
                .frame(width: 44, height: 44)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 14).padding(.trailing, 16)
                .allowsHitTesting(false)
        }
        .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12), height: CompactPickRow.uniformHeight)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "#121110"))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.10), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.5), radius: 18, y: 8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Day-keyed cache of the today board (today_board → tomorrow_board fallback,
/// written the evening before) — ONE fetch feeds every game page's scout.
@MainActor
enum TodayBoardCache {
    private static var stored: (day: String, board: TomorrowBoard, fetchedAt: Date)? = nil
    private static var inFlight: (day: String, task: Task<TomorrowBoard?, Never>)? = nil

    /// A board can improve after the first morning read (probables, lines and
    /// generated copy land in stages). The former day-long cache froze a 6 AM
    /// incomplete snapshot until the app process died, even after the server
    /// had repaired it. Complete boards refresh every five minutes; an MLB
    /// board missing Arms copy gets another chance after 30 seconds.
    private static func cacheLifetime(for board: TomorrowBoard) -> TimeInterval {
        let postedStarters = Set(board.starters.compactMap { starter -> String? in
            guard (starter.league ?? "").uppercased() == "MLB",
                  let game = starter.game,
                  let team = starter.abbr ?? starter.team else { return nil }
            return "\(game)|\(team.uppercased())"
        })
        let hasMissingMLBArms = board.board.contains {
            guard ($0.league ?? "").uppercased() == "MLB",
                  ($0.arms_take?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true),
                  let away = $0.away_abbr,
                  let home = $0.home_abbr else { return false }
            let game = "\(away) @ \(home)"
            // A take is required only after BOTH official probables exist.
            // One-posted/TBA games are legitimately incomplete and can wait
            // for the normal five-minute board refresh.
            return postedStarters.contains("\(game)|\(away)")
                && postedStarters.contains("\(game)|\(home)")
        }
        return hasMissingMLBArms ? 30 : 300
    }

    static func get() async -> TomorrowBoard? {
        let day = SupabaseAPI.todayEST()
        if let stored, stored.day == day,
           Date().timeIntervalSince(stored.fetchedAt) < cacheLifetime(for: stored.board) {
            return stored.board
        }
        if let inFlight, inFlight.day == day { return await inFlight.task.value }
        let task = Task { await SupabaseAPI.fetchTodayBoard(date: day) }
        inFlight = (day, task)
        let board = await task.value
        if inFlight?.day == day { inFlight = nil }
        guard let board else { return stored?.day == day ? stored?.board : nil }
        stored = (day, board, Date())
        return board
    }
}

/// Day-keyed cache of the wire (today + yesterday) — team news/injury lines
/// for the scout capsules. One fetch pair shared by every game page.
@MainActor
enum ScoutWireCache {
    private static var stored: (day: String, items: [SupabaseAPI.WireItem], fetchedAt: Date)? = nil
    /// The wire is written mid-morning (and again through the day) — an
    /// all-day cache kept serving yesterday's headlines to anyone who opened
    /// the app before the day's first write (founder screenshot, Aug 20:
    /// a stale IL line at 9:48 AM). Twenty minutes keeps the page current
    /// without hammering the table.
    private static let ttl: TimeInterval = 20 * 60
    static func get() async -> [SupabaseAPI.WireItem] {
        let day = SupabaseAPI.todayEST()
        if let stored, stored.day == day, !stored.items.isEmpty,
           Date().timeIntervalSince(stored.fetchedAt) < ttl { return stored.items }
        async let today = SupabaseAPI.fetchWireItems(date: day, limit: 24)
        async let prior = SupabaseAPI.fetchWireItems(date: shiftDay(day, -1), limit: 24)
        let items = await today + prior
        // NEVER cache an empty read — a page swipe cancels in-flight .tasks and
        // the cancelled fetch returns [], which would poison every later page.
        // On a failed refresh, the previous non-empty copy keeps serving.
        if !items.isEmpty { stored = (day, items, Date()) }
        return stored?.day == day ? (stored?.items ?? items) : items
    }
    private static func shiftDay(_ iso: String, _ delta: Int) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: iso),
              let shifted = Calendar.current.date(byAdding: .day, value: delta, to: d) else { return iso }
        return f.string(from: shifted)
    }
}

/// SCOUTING REPORT — final form (founder-picked, Jul 7 PM): S5 Bebas team+
/// price heads · S3 series tug + venue split + S9 last-three meetings · THE
/// ARMS as P34/P23 blocks (side-tinted Bebas plate + quality-start tag +
/// statement ladder: label zone | rule | values) · LAST 10 as an F1 kicker
/// row · hanging-indent WIRE · conditions footer. Flat on the page;
/// every fact server-grounded; every row omits itself when data is short.
struct GameScoutSection: View {
    let matchup: String
    var row: TomorrowBoardRow? = nil
    var board: TomorrowBoard? = nil
    var wire: [SupabaseAPI.WireItem] = []
    /// Odds captured at pick time (GaryPick.moneylineAway/Home). When present
    /// the header wears Gary's exact numbers — never a drifted board snapshot
    /// (founder, Jul 10: "MLB has to match").
    var pickMl: (away: Double?, home: Double?)? = nil

    private var sides: (away: String, home: String) {
        let p = matchup.components(separatedBy: " @ ")
        return (p.first ?? "", p.count > 1 ? p[1] : "")
    }
    private static func sideMatches(_ boardName: String?, _ side: String) -> Bool {
        guard let b = boardName?.lowercased(), !b.isEmpty else { return false }
        let s = side.lowercased()
        return s == b || s.hasSuffix(b) || b.hasSuffix(s)
    }
    private func abbr(_ side: String, fallback: String?) -> String {
        if let fallback, !fallback.isEmpty { return fallback }
        let a = teamAbbrevFromName(side, league: row?.league)
        return a.isEmpty ? side.uppercased() : a
    }
    private static func odds(_ v: Double?) -> String? {
        guard let v else { return nil }
        let i = Int(v)
        return i > 0 ? "+\(i)" : "\(i)"
    }
    private static func num(_ v: Double?) -> String? {
        guard let v else { return nil }
        return v == v.rounded() ? String(format: "%.0f", v) : String(format: "%.1f", v)
    }

    private var league: String { (row?.league ?? "").uppercased() }
    private var headerNames: (away: String, home: String) {
        (Formatters.shortTeamName(sides.away, league: league),
         Formatters.shortTeamName(sides.home, league: league))
    }
    /// Header prices: the odds CAPTURED AT PICK TIME when a pick exists, so the
    /// scout header always matches Gary's number; the day board only fills
    /// the pre-pick morning.
    private var headOdds: (a: String?, h: String?) {
        if let pickMl, pickMl.away != nil || pickMl.home != nil {
            return (Self.odds(pickMl.away), Self.odds(pickMl.home))
        }
        return (Self.odds(row?.ml_away), Self.odds(row?.ml_home))
    }
    private var teamAbbrs: (a: String, h: String) {
        (abbr(sides.away, fallback: row?.away_abbr), abbr(sides.home, fallback: row?.home_abbr))
    }

    // MARK: styled fragments

    private static func stat(_ s: String, _ c: Color = .white.opacity(0.9)) -> Text {
        Text(s).font(GaryFonts.mono(15, bold: true)).foregroundColor(c)
    }
    private static func kicker(_ s: String) -> some View {
        Text(s).font(GaryFonts.mono(12, bold: true)).tracking(1.4)
            .foregroundStyle(GaryColors.gold.opacity(0.8))
    }
    private static func formRun(_ run: String) -> Text {
        run.reduce(Text("")) { acc, ch in
            let c: Color = ch == "W" ? GaryColors.win
                         : ch == "L" ? GaryColors.loss : .white.opacity(0.55)
            return acc + Text(String(ch)).font(GaryFonts.mono(14, bold: true)).foregroundColor(c)
        }
    }
    private static func diffText(_ v: Double?) -> Text? {
        guard let v else { return nil }
        let str = (v > 0 ? "+" : "") + (Self.num(v) ?? "0")
        return stat(str, v > 0 ? GaryColors.win : v < 0 ? GaryColors.loss : .white)
    }
    private static func last10Text(_ f: TomorrowForm?) -> Text? {
        guard let f else { return nil }
        var parts: [Text] = []
        if let l10 = f.l10, !l10.isEmpty { parts.append(stat(l10)) }
        if let st = f.streak, !st.isEmpty {
            let c: Color = st.hasPrefix("W") ? GaryColors.win
                         : st.hasPrefix("L") ? GaryColors.loss : .white
            parts.append(stat(st, c))
        }
        guard !parts.isEmpty else { return nil }
        return parts.dropFirst().reduce(parts[0]) { $0 + stat(" · ", .white.opacity(0.35)) + $1 }
    }
    /// "16.2 IP · 5 ER · 21 K" — plain; the numbers speak for themselves.
    private static func ipLine(ip: String, er: Int, k: Int?) -> Text {
        let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
        var bits = "\(ipShow) IP · \(er) ER"
        if let k, k > 0 { bits += " · \(k) K" }
        return stat(bits)
    }
    /// "5 IP · 1 ER · 10 K vs CIN" — the opponent tag stays neutral.
    private static func outingText(_ o: TomorrowOuting?) -> Text? {
        guard let o, let ip = o.ip else { return nil }
        var t = ipLine(ip: ip, er: o.er ?? 0, k: o.k)
        if let opp = o.opp {
            t = t + Text(" \(o.at ?? "vs") \(opp)").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.62))
        }
        return t
    }
    private static func l3Text(_ l: TomorrowL3?) -> Text? {
        guard let l, let ip = l.ip, let er = l.er else { return nil }
        return ipLine(ip: ip, er: er, k: l.k)
    }
    /// "4 days" — the note ("short" / "layoff") carries the flag in words.
    private static func restText(_ r: TomorrowRest?) -> Text? {
        guard let d = r?.days else { return nil }
        var t = stat("\(d) day\(d == 1 ? "" : "s")")
        if d <= 3 {
            t = t + Text(" · short").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.62))
        } else if d >= 10 {
            t = t + Text(" · layoff").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.55))
        }
        return t
    }
    private func vsOppText(_ v: TomorrowVsOpp?) -> Text? {
        guard let v, let era = v.era, let gs = v.gs else { return nil }
        return Self.stat(String(format: "%.2f ERA", era))
            + Text(" · \(gs) start\(gs == 1 ? "" : "s") this season").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.62))
    }
    private func seasonText(_ st: TomorrowPerson) -> Text? {
        var bits: [Text] = []
        if let e = st.era { bits.append(Self.stat(String(format: "%.2f ERA", e))) }
        if let x = st.xera { bits.append(Self.stat(String(format: "%.2f xERA", x))) }
        guard !bits.isEmpty else { return nil }
        return bits.dropFirst().reduce(bits[0]) { $0 + Self.stat(" · ", .white.opacity(0.35)) + $1 }
    }
    /// The name-row tag: "3 STRAIGHT QS" / "1 QS IN LAST 4" — plain, no judgment color.
    private static func qsTag(_ st: TomorrowPerson?) -> Text? {
        guard let q = st?.qs_form, let w = q.window, w >= 2, let n = q.qs else { return nil }
        let font = GaryFonts.mono(12.5, bold: true)
        let c: Color = .white.opacity(0.72)
        if let s = q.streak, s >= 2 {
            return Text("\(s) STRAIGHT QS").font(font).foregroundColor(c)
        }
        return Text("\(n) QS IN LAST \(w)").font(font).foregroundColor(c)
    }

    private func news(_ teamKey: String) -> String? {
        let key = teamKey.lowercased()
        guard !key.isEmpty else { return nil }
        let today = SupabaseAPI.todayEST()
        let mine = wire.filter {
            ($0.league ?? "").uppercased() == league
                && ($0.headline ?? "").lowercased().contains(key)
        }
        if let inj = mine.first(where: { $0.kind == "injury" }) { return inj.headline }
        return mine.first(where: { (($0.kind == "line_move" && !AppFlags.storeSafe) || $0.kind == "pace") && $0.date == today })?.headline
    }

    private var footer: String? {
        var bits: [String] = []
        if let row {
            if let ou = Self.num(row.total) { bits.append("O/U \(ou)") }
            let ab = teamAbbrs
            if let w = board?.weather?.first(where: {
                ($0.away_abbr == ab.a && $0.home_abbr == ab.h) || Self.sideMatches($0.matchup, matchup)
            }) {
                if let v = w.venue { bits.append(v) }
                if let t = w.temp_f { bits.append("\(t)°") }
                if let wind = w.wind_mph { bits.append("Wind \(wind) mph") }
                if let pr = w.precip_pct { bits.append("Rain \(pr)%") }
                if let note = w.note { bits.append(note) }
            } else if let v = row.venue {
                bits.append(v)
            }
        }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    private var awayStarter: TomorrowPerson? { board?.starters.first { $0.abbr == teamAbbrs.a } }
    private var homeStarter: TomorrowPerson? { board?.starters.first { $0.abbr == teamAbbrs.h } }
    private var hasContent: Bool {
        return row?.series != nil || awayStarter != nil || homeStarter != nil
            || board?.form?.isEmpty == false
    }

    var body: some View {
        if row != nil, hasContent {
            VStack(alignment: .leading, spacing: 0) {
                // "SCOUTING REPORT" label removed (founder, Aug 4) — the card
                // opens straight with the matchup, then the arms.
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(headerNames.away + (headOdds.a.map { " \($0)" } ?? ""))
                        .font(GaryFonts.display(24))
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Spacer(minLength: 8)
                    Text(headerNames.home + (headOdds.h.map { " \($0)" } ?? ""))
                        .font(GaryFonts.display(24))
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
                .padding(.bottom, 10)
                if let series = row?.series { seriesBlock(series) }
                // Gary's two sentences on the game's two starters (founder,
                // Aug 4) — the take leads, the stat plates follow as data.
                if let take = row?.arms_take {
                    Text(take)
                        .font(GaryFonts.text(14, .medium))
                        .foregroundStyle(.white.opacity(0.88))
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 10)
                }
                mlbArms
                wireLines
                if let footer {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                    Text(footer)
                        .font(GaryFonts.text(14, .medium))
                        .foregroundStyle(.white.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            .pageGutter()
        }
    }

    // ── THE ARMS — Bebas plate + QS tag + statement ladder per pitcher ──

    private struct ArmRow: Identifiable {
        let id: Int
        let label: String
        let value: Text
    }
    private func armRows(_ st: TomorrowPerson, oppAbbr: String) -> [ArmRow] {
        var out: [ArmRow] = []
        if let t = Self.outingText(st.last_outing) { out.append(ArmRow(id: 0, label: "LAST OUTING", value: t)) }
        if let t = Self.l3Text(st.l3) { out.append(ArmRow(id: 1, label: "LAST \(st.l3?.gs ?? 3)", value: t)) }
        if let t = vsOppText(st.vs_opp) { out.append(ArmRow(id: 2, label: "VS \(oppAbbr)", value: t)) }
        if let t = Self.restText(st.rest) { out.append(ArmRow(id: 3, label: "REST", value: t)) }
        if let t = seasonText(st) { out.append(ArmRow(id: 4, label: "SEASON", value: t)) }
        // Debut arm (founder GO, Aug 17): zero MLB data reads as an honest
        // state + his labeled AAA/AA line — never an empty ladder, never a
        // fabricated MLB 0.00.
        if st.no_mlb_starts == true {
            out.append(ArmRow(id: 5, label: "SEASON", value: Text("No MLB starts")))
            if let m = st.milb, let era = m.era {
                var line = String(format: "%.2f ERA", era)
                if let ip = m.ip {
                    let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
                    line += " · \(ipShow) IP"
                }
                out.append(ArmRow(id: 6, label: m.level ?? "MILB", value: Text(line)))
            }
        }
        return out
    }

    @ViewBuilder private func armBlock(_ st: TomorrowPerson?, tint: Color, oppAbbr: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(st?.name ?? "TBA")
                    .font(GaryFonts.display(20))
                    .foregroundStyle(st == nil ? tint.opacity(0.45) : tint)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Spacer(minLength: 8)
                if let tag = Self.qsTag(st) { tag }
            }
            if let st {
                let rows = armRows(st, oppAbbr: oppAbbr)
                if !rows.isEmpty {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(rows) { r in
                                Text(r.label)
                                    .font(GaryFonts.mono(11.5, bold: true)).tracking(1)
                                    .foregroundStyle(.white.opacity(0.62))
                                    .frame(height: 30, alignment: .leading)
                            }
                        }
                        .frame(width: 116, alignment: .leading)
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(rows) { r in
                                r.value
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                    .frame(height: 30, alignment: .leading)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder private var mlbArms: some View {
        let ab = teamAbbrs
        if awayStarter != nil || homeStarter != nil {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            armBlock(awayStarter, tint: .white.opacity(0.92), oppAbbr: ab.h)
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            armBlock(homeStarter, tint: GaryColors.gold, oppAbbr: ab.a)
        }
        if let fa = board?.form?.first(where: { $0.abbr == ab.a || Self.sideMatches($0.team, sides.away) }),
           let fh = board?.form?.first(where: { $0.abbr == ab.h || Self.sideMatches($0.team, sides.home) }),
           let ta = Self.last10Text(fa), let th = Self.last10Text(fh) {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            VStack(alignment: .leading, spacing: 5) {
                Self.kicker("LAST 10")
                HStack {
                    ta
                    Spacer(minLength: 10)
                    th
                }
            }
            .padding(.vertical, 10)
        }
    }

    /// S3's tug + venue split + S9's meetings.
    @ViewBuilder private func seriesBlock(_ s: TomorrowSeries) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let split = s.split_line {
                Text("SERIES · \(split)")
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(.white.opacity(0.68))
            }
            if let meets = s.meetings, !meets.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(meets.enumerated()), id: \.offset) { _, m in
                        HStack(spacing: 8) {
                            Text(m.d ?? "")
                                .font(GaryFonts.mono(14.5, bold: true))
                                .foregroundStyle(.white.opacity(0.88))
                                .frame(width: 62, alignment: .leading)
                            Text(m.line ?? "")
                                .font(GaryFonts.mono(14.5, bold: true))
                                .foregroundStyle(.white.opacity(0.88))
                            Spacer(minLength: 8)
                            Text(m.venue ?? "")
                                .font(GaryFonts.mono(14.5))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(.bottom, 12)
    }

    /// Hanging-indent wire notes (injury first), de-duped across the sides.
    @ViewBuilder private var wireLines: some View {
        let aKey = Formatters.shortTeamName(sides.away, league: "MLB")
        let hKey = Formatters.shortTeamName(sides.home, league: "MLB")
        let items = [news(aKey), news(hKey)].compactMap { $0 }
        let uniq = items.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        if !uniq.isEmpty {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            HStack(alignment: .top, spacing: 10) {
                Text("WIRE")
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(uniq, id: \.self) { h in
                        Text(h)
                            .font(GaryFonts.text(14.5))
                            .foregroundStyle(.white.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.vertical, 10)
        }
    }
}
