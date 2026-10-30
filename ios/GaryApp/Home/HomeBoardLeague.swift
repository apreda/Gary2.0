import Foundation

enum HomeBoardLeague: String, CaseIterable, Hashable {
    /// Every league on one board (founder, Sep 24 2026: "let's just have a
    /// board that's all, except not NCAA football because that would be too
    /// many"): the default tab, college trimmed to its best games.
    case all = "ALL"
    case mlb = "MLB"
    case nfl = "NFL"
    /// College football is a first-class board tab (founder, Aug 26:
    /// "we need an NCAAF tab") — same board, same empty-state honesty.
    case ncaaf = "NCAAF"
    /// The NBA from its Oct 20 2026 opener: an NBA-only night had an empty
    /// Home board, since a league without a tab never reaches the board.
    case nba = "NBA"
    /// The user's own slate (founder, Aug 20: "a You tab next to NFL") —
    /// same board, same rows, THEIR side's standing in the verdict slot.
    case you = "YOU"

    var sport: Sport {
        switch self {
        case .mlb: return .mlb
        case .ncaaf: return .ncaaf
        case .nba: return .nba
        default: return .nfl
        }
    }

    /// ALL leads whenever the day has games; then sports with games on this slate, football, then basketball,
    /// then baseball; YOU stays last. A sport out of season has no tab (founder, Oct 29 2026: "we can drop MLB
    /// til next season only sports in season need to have it"): a sport is in season with games today or on the
    /// next slate, and football also through the days between its games.
    static func ordered(available: Set<HomeBoardLeague>, upcoming: Set<HomeBoardLeague> = []) -> [HomeBoardLeague] {
        let sports: [HomeBoardLeague] = [.nfl, .ncaaf, .nba, .mlb]
        let inSeason = sports.filter { available.contains($0) || upcoming.contains($0) || footballWeeks($0) }
        return (available.contains(.all) ? [.all] : [])
            + inSeason.filter { available.contains($0) }
            + inSeason.filter { !available.contains($0) }
            + (available.contains(.you) ? [.you] : [])
    }

    /// The leagues on the next slate's board.
    static func upcoming(_ board: TomorrowBoard?) -> Set<HomeBoardLeague> {
        Set((board?.board ?? []).compactMap { HomeBoardLeague(rawValue: ($0.league ?? "").uppercased()) })
    }

    /// Football plays once a week, so its tab stays up between game days through the season: the NFL from
    /// September through the Super Bowl, college from late August through its title game.
    private static func footballWeeks(_ league: HomeBoardLeague, now: Date = Date()) -> Bool {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let c = cal.dateComponents([.month, .day], from: now)
        let md = (c.month ?? 1) * 100 + (c.day ?? 1)
        switch league {
        case .nfl: return md >= 901 || md <= 215
        case .ncaaf: return md >= 820 || md <= 120
        default: return false
        }
    }
}
