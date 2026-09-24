import SwiftUI

/// Converts settled receipts into Home presentation models.
enum HomePresentation {
    // MARK: - Front-page builders (template-only, no AI)

    static func shiftDate(_ s: String, by days: Int) -> String? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        // The day arithmetic must run in EST too — Calendar.current uses the DEVICE
        // tz, so off-EST (or on a DST boundary) it could shift to the wrong slate
        // date and the Tomorrow/Day-Ahead board would fetch an empty/next-day key.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        guard let d = f.date(from: s),
              let shifted = cal.date(byAdding: .day, value: days, to: d) else { return nil }
        return f.string(from: shifted)
    }

    /// Tomorrow's EST slate day (todayEST + 1) — the key the Tomorrow board is
    /// written under.
    static func tomorrowSlateDateEST() -> String {
        shiftDate(SupabaseAPI.todayEST(), by: 1) ?? SupabaseAPI.todayEST()
    }

    /// Use the shared league-aware formatter, including college school codes.
    static func teamAbbrev(_ name: String, league: String?) -> String {
        teamAbbrevFromName(name, league: league)
    }

    /// One pass over the latest settled night: the marquee story (biggest
    /// cash, or the owned miss), the Biggest Cashes rows, and net units.
    /// All template — honesty is the brand, so the net includes the losses.
    static func buildLastNight(games: [GameResult], props: [PropResult], includeToday: Bool = true)
        -> (story: HomeMarqueeHero.Story?, marqueeGame: GameResult?, cashes: [HomeCashesSection.Row], rollCashes: [HomeCashesSection.Row], beat: HomeCashesSection.Row?, net: Double, graded: Int, bestOdds: Double?, record: (w: Int, l: Int, p: Int)) {

        // Preseason football never enters the recap/record math — the rows
        // stay graded on their own pick surfaces (founder law, Aug 21 2026).
        let settledGames = games.countable.filter { $0.result == "won" || $0.result == "lost" || $0.result == "push" }
        let settledProps = props.filter { $0.result == "won" || $0.result == "lost" || $0.result == "push" }
        let days = settledGames.compactMap { $0.game_date } + settledProps.compactMap { $0.game_date }
        guard !days.isEmpty else { return (nil, nil, [], [], nil, 0, 0, nil, (0, 0, 0)) }
        // "Last night" = the most recent COMPLETED EST slate day. game_date already carries
        // the ET slate day a game STARTED on — a late west-coast game that finishes after
        // midnight UTC still keeps its ET day (verified Jun 18: Angels@Athletics graded
        // 10:34 UTC Jun 19, yet game_date = 2026-06-18). So we take exactly ONE day, no UTC-
        // rollover merge. Exclude TODAY so this morning's early games (a WC dawn kickoff)
        // never leak into yesterday's recap; an empty/off day falls back to the prior slate.
        let today = SupabaseAPI.todayEST()
        // includeToday=true: ROLLING recap — the scorecard/prop box build out of yesterday into
        // today as today's picks grade (label tracks the day). includeToday=false: yesterday-only,
        // for the once-a-day recap pop-up (never this morning's partial slate).
        let candidate = includeToday ? Set(days) : Set(days).filter { $0 < today }
        guard let anchor = candidate.max() else { return (nil, nil, [], [], nil, 0, 0, nil, (0, 0, 0)) }
        let nightSet: Set<String> = [anchor]
        let nightGames = settledGames.filter { nightSet.contains($0.game_date ?? "") }
        let nightProps = settledProps.filter { nightSet.contains($0.game_date ?? "") }

        // Net units + cash rows across games AND props.
        var net = 0.0
        var bestOdds: Double? = nil
        var cashes: [HomeCashesSection.Row] = []
        for g in nightGames {
            let o = HomeReceiptMath.resultOdds(g.odds, pickText: g.pick_text)
            net += HomeReceiptMath.unitsDelta(odds: o, result: g.result ?? "")
            if g.result == "won" {
                bestOdds = max(bestOdds ?? -Double.infinity, o)
                cashes.append(.init(id: "g-\(g.matchup ?? "")-\(g.pick_text ?? "")",
                                    title: Self.gameCashTitle(g),
                                    sub: Formatters.splitPickAndOdds(g.pick_text).0,
                                    units: HomeReceiptMath.unitsDelta(odds: o, result: "won"),
                                    odds: HomeReceiptMath.oddsLabel(o), league: g.league))
            }
        }
        for p in nightProps {
            let o = HomeReceiptMath.resultOdds(p.odds, pickText: p.pick_text)
            net += HomeReceiptMath.unitsDelta(odds: o, result: p.result ?? "")
            if p.result == "won" {
                bestOdds = max(bestOdds ?? -Double.infinity, o)
                // Sub = the NIGHT ("3 TB on the night"), never the player's
                // name again — the title already says who.
                let actual = Self.trimNum(p.actual_value?.value ?? "")
                let unit = Self.propUnit(p.prop_type)
                cashes.append(.init(id: "p-\(p.player_name ?? "")-\(p.pick_text ?? "")",
                                    title: Formatters.propResultTitle(p),
                                    sub: actual.isEmpty ? (p.matchup ?? "") : "\(actual) \(unit) on the night",
                                    units: HomeReceiptMath.unitsDelta(odds: o, result: "won"),
                                    odds: HomeReceiptMath.oddsLabel(o), league: p.league))
            }
        }
        cashes.sort { $0.units > $1.units }
        // The strip's roller wants EVERY big cash — captured before the rail's
        // per-league dedup below, which leaves exactly ONE item on a one-sport
        // night (an all-MLB slate) and froze the roll (founder, Jul 13).
        let rollCashes = Array(cashes.prefix(6))
        // Sport variety — keep the biggest cash PER league so one hot sport can't
        // sweep the whole Hits & heartbreakers rail (user ask).
        var seenLeagues = Set<String>()
        cashes = cashes.filter { seenLeagues.insert($0.league ?? "?").inserted }
        let graded = nightGames.count + nightProps.count
        // ONE ledger for the scorecard: record, net, and best cash all count
        // the same set (games + props) — three cells, one truth.
        var recW = 0, recL = 0, recP = 0
        for r in (nightGames.map { $0.result } + nightProps.map { $0.result }) {
            switch r { case "won": recW += 1; case "lost": recL += 1; case "push": recP += 1; default: break }
        }
        let record = (w: recW, l: recL, p: recP)

        // The worst beat — the loss that stung most: the biggest favorite that
        // didn't hold (most-negative odds among the night's graded game losses).
        let beat: HomeCashesSection.Row? = nightGames
            .filter { $0.result == "lost" }
            .min { HomeReceiptMath.resultOdds($0.odds, pickText: $0.pick_text) < HomeReceiptMath.resultOdds($1.odds, pickText: $1.pick_text) }
            .map { g in
                let o = HomeReceiptMath.resultOdds(g.odds, pickText: g.pick_text)
                return HomeCashesSection.Row(
                    id: "beat-\(g.matchup ?? "")-\(g.pick_text ?? "")",
                    title: Self.gameCashTitle(g),
                    sub: Formatters.splitPickAndOdds(g.pick_text).0,
                    units: HomeReceiptMath.unitsDelta(odds: o, result: "lost"),
                    odds: HomeReceiptMath.oddsLabel(o), league: g.league)
            }

        // The marquee — the priority league leads (a Finals game outranks
        // the MLB slate whatever the odds said), biggest odds break ties.
        func pri(_ r: GameResult) -> Int { LeaguePriority.rank(r.effectiveLeague) }
        let wins = nightGames.filter { $0.result == "won" }
        let star = wins.min { a, b in
            if pri(a) != pri(b) { return pri(a) < pri(b) }
            return HomeReceiptMath.resultOdds(a.odds, pickText: a.pick_text) > HomeReceiptMath.resultOdds(b.odds, pickText: b.pick_text)
        }
        let subject = star ?? nightGames.filter { $0.result == "lost" }
            .min { a, b in
                if pri(a) != pri(b) { return pri(a) < pri(b) }
                return abs(HomeReceiptMath.resultOdds(a.odds, pickText: a.pick_text)) > abs(HomeReceiptMath.resultOdds(b.odds, pickText: b.pick_text))
            }
        guard let r = subject else { return (nil, nil, Array(cashes.prefix(3)), rollCashes, beat, net, graded, bestOdds, record) }

        let cashed = r.result == "won"
        let o = HomeReceiptMath.resultOdds(r.odds, pickText: r.pick_text)
        let pickLine = Formatters.splitPickAndOdds(r.pick_text).0
        let story = HomeMarqueeHero.Story(
            league: r.effectiveLeague ?? "",
            headline: Self.gameHeadline(r, cashed: cashed),
            sub: Self.gameSubLine(r),
            receiptLead: cashed ? "Gary Cashed ·" : "Gary Had ·",
            receiptPick: Formatters.arrowizeOverUnder(pickLine).uppercased(),
            verdict: cashed ? (o > 0 ? "CASHED +\(Int(o))" : "CASHED") : "LOST",
            cashed: cashed)
        return (story, r, Array(cashes.prefix(3)), rollCashes, beat, net, graded, bestOdds, record)
    }

    /// "Knicks over the Spurs, 105–95" — a real game headline from facts.
    static func gameHeadline(_ r: GameResult, cashed: Bool) -> String {
        if let (away, home, a, h) = Self.scoreParts(r), a != h {
            let winner = a > h ? away : home
            let loser = a > h ? home : away
            // Clubs take "the" (Knicks over the Spurs); national teams don't (Switzerland over Canada).
            let article = (r.league ?? "").uppercased().contains("WC") ? "" : "the "
            return "\(winner) over \(article)\(loser), \(max(a, h))–\(min(a, h))"
        }
        let pick = Formatters.splitPickAndOdds(r.pick_text).0
        return cashed ? "\(pick) cashed" : "\(pick) didn't land"
    }

    /// "Knicks @ Spurs · Final 105–95"
    static func gameSubLine(_ r: GameResult) -> String {
        var bits: [String] = []
        if let (away, home, _, _) = Self.scoreParts(r) { bits.append("\(away) @ \(home)") }
        else if let m = r.matchup { bits.append(m) }
        if let fs = r.displayFinalScore, !fs.isEmpty { bits.append("Final \(fs)") }
        return bits.joined(separator: " · ")
    }

    /// "PHI 6 – 4 NYM · Final" cash-row title, falling back to short names.
    static func gameCashTitle(_ g: GameResult) -> String {
        if let (away, home, a, h) = Self.scoreParts(g) {
            let lg = g.effectiveLeague
            return "\(teamAbbrev(away, league: lg)) \(a) – \(h) \(teamAbbrev(home, league: lg))"
        }
        return g.matchup ?? "Graded win"
    }

    /// A headline needs numeric score fields or the game_results source contract.
    static func scoreParts(_ r: GameResult) -> (away: String, home: String, a: Int, h: Int)? {
        guard let score = r.teamScores else { return nil }
        let away = Formatters.shortTeamName(score.away, league: r.effectiveLeague)
        let home = Formatters.shortTeamName(score.home, league: r.effectiveLeague)
        return (away, home, score.a, score.h)
    }

   static func propUnit(_ type: String?) -> String {
        let t = (type ?? "").lowercased()
        if t.contains("total_bases") || t.contains("total bases") { return "TB" }
        if t.contains("strikeout") { return "K" }
        if t.contains("home_run") || t.contains("home run") { return "HR" }
        if t.contains("hits_runs_rbis") { return "H+R+RBI" }
        if t.contains("rbi") { return "RBI" }
        if t.contains("hit") { return "H" }
        if t.contains("run") { return "R" }
        if t.contains("point") { return "PTS" }
        if t.contains("rebound") { return "REB" }
        if t.contains("assist") { return "AST" }
        if t.contains("three") { return "3PT" }
        if t.contains("shots_on_goal") { return "SOG" }
        if t.contains("goal") { return "G" }
        if t.contains("save") { return "SV" }
        return String(t.prefix(3)).uppercased()
    }
    static func trimNum(_ s: String) -> String {
        s.hasSuffix(".0") ? String(s.dropLast(2)) : s
    }
}
