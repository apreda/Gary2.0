import SwiftUI

// MARK: - Football game intelligence
//
// The pick and prop cards above this view remain the shared Gary cards. This
// file owns the football-only evidence below them. Every visible value is an
// exact stored market, an explicitly whitelisted stat, an injury record, or a
// live proof value. Missing evidence removes a module instead of inviting a
// proxy statistic or generated placeholder.

struct FootballGameIntelView: View {
    let league: String
    let matchup: String
    let picks: [GaryPick]
    let props: [PropPick]
    let row: TomorrowBoardRow?
    let edges: [Signal]
    /// Team news off the wire — the morning layer's NEWS card (founder,
    /// Aug 20: the football page must carry MLB-depth from the morning, not
    /// only after the pick lands at T-90).
    var wire: [SupabaseAPI.WireItem] = []

    private var normalizedLeague: String { league.uppercased() }
    private var isCollege: Bool { normalizedLeague == "NCAAF" }
    private var accent: Color {
        isCollege ? Sport.ncaaf.accentColor : Sport.nfl.accentColor
    }
    private var primaryPick: GaryPick? {
        picks.first(where: { !($0.statsData ?? []).isEmpty }) ?? picks.first
    }
    private var statData: [StatData] { primaryPick?.statsData ?? [] }

    private var sides: (away: String, home: String) {
        let split = matchup.components(separatedBy: " @ ")
        let away = primaryPick?.awayTeam ?? split.first ?? row?.away_team ?? "Away"
        let matchupHome: String? = split.count > 1 ? split[1] : nil
        let home = primaryPick?.homeTeam ?? matchupHome ?? row?.home_team ?? "Home"
        return (
            FootballEvidence.sideLabel(away, league: normalizedLeague),
            FootballEvidence.sideLabel(home, league: normalizedLeague)
        )
    }

    private var shapeRows: [FootballEvidence.ShapeRow] {
        FootballEvidence.shapeRows(
            league: normalizedLeague,
            stats: statData,
            awayLabel: sides.away,
            homeLabel: sides.home
        )
    }

    private var availability: [FootballEvidence.Availability] {
        FootballEvidence.availability(
            from: primaryPick,
            awayLabel: sides.away,
            homeLabel: sides.home
        )
    }

    /// GARY'S NUMBER — the receipt, gated by the proof contract (exact game
    /// id, structured provenance; never parsed from prose). It closes THE
    /// BIG NUMBERS rail as THE LINE row once Gary has a number.
    private var numberSignal: Signal? {
        guard let exactGameID else { return nil }
        return edges.first(where: {
            belongsToExactGame($0)
                && FootballProofContract.isRenderableAfterGary($0, exactGameID: exactGameID)
        })
    }

    private var exactGameID: String? {
        let ids = [primaryPick?.game_id.map(String.init), row?.bdl_game_id.map(String.init)]
            .compactMap { $0 }
        guard let first = ids.first, ids.allSatisfy({ $0 == first }) else { return nil }
        return first
    }

    private func belongsToExactGame(_ signal: Signal) -> Bool {
        guard let exactGameID else { return false }
        return signal.gameId == exactGameID
    }

    private var sweatSignals: [Signal] {
        let renderable = edges.filter {
            belongsToExactGame($0)
                && FootballProofContract.isRenderableSweat($0, includeWatch: true)
        }
        return Array(FootballProofContract.finalScopedSweat(renderable).prefix(4))
    }

    // ── Morning layer (Aug 20) ──────────────────────────────────────────────
    // The insight pipeline writes QB/injury/situational/box-metric rows from
    // 6 AM; before the pick exists none of the dossier-fed sections above can
    // render, which left the page one lonely hero card all day. These
    // sections read the connection rows + the wire directly, so the football
    // page carries a full morning the way the MLB scout does.

    /// Game scoping that works BEFORE the pick: the exact game id when either
    /// the pick or the board row carries one, else a team-text match (one
    /// game per matchup in football — no doubleheader ambiguity).
    private func matchesThisGame(_ s: Signal) -> Bool {
        if let exactGameID { return s.gameId == exactGameID }
        let g = s.game.lowercased()
        guard !g.isEmpty else { return false }
        return g.contains(sides.away.lowercased()) || g.contains(sides.home.lowercased())
    }

    private func morningRows(_ kinds: Set<SignalKind>, cap: Int = .max) -> [Signal] {
        Array(edges.filter { kinds.contains($0.kind) && matchesThisGame($0) }.prefix(cap))
    }

    /// Every passing-lane row for this game (the per-QB watch rows AND the
    /// team passing-metric rows). The take reads from any of them; the
    /// plates read only the rows that carry per-side numbers (Sep 1 review:
    /// a blind first-two cut usually picked the two per-QB rows, which have
    /// no sides, and the section vanished). Rows the plates do not show fall
    /// through to MORE INTEL — nothing Gary read is invisible on the page.
    private var qbRows: [Signal] { morningRows([.quarterback]) }
    private var qbMetricRows: [Signal] { qbRows.filter { $0.lane?.home?.value != nil || $0.lane?.away?.value != nil } }
    private var qbPlateRows: [Signal] { Array(qbMetricRows.prefix(3)) }
    private var injuryWireRows: [Signal] { morningRows([.injury]) }
    private var numberRailRows: [Signal] {
        morningRows([.paceScript, .turnoverEdge, .explosivePlay, .trenches], cap: 4)
    }

    /// One line per team off the wire: today's injury first, else today's
    /// pace/line note — the same selection the MLB scout uses. Team keys are
    /// the nickname (last word of the full team name) because wire copy says
    /// "Raiders", never "LV".
    private var newsLines: [String] {
        let lg = normalizedLeague
        let today = SupabaseAPI.todayEST()
        func key(_ full: String?, side: String) -> String {
            let source = (full?.isEmpty == false ? full! : side)
            return source.components(separatedBy: " ").last ?? side
        }
        func line(_ k: String) -> String? {
            let lk = k.lowercased()
            guard !lk.isEmpty else { return nil }
            let mine = wire.filter { ($0.league ?? "").uppercased() == lg && ($0.headline ?? "").lowercased().contains(lk) }
            let injuries = mine.filter { $0.kind == "injury" }
            if let inj = injuries.first(where: { $0.date == today }) ?? injuries.first { return inj.headline }
            return mine.first(where: { ($0.kind == "pace" || ($0.kind == "line_move" && !AppFlags.storeSafe)) && $0.date == today })?.headline
        }
        let awayKey = key(primaryPick?.awayTeam ?? row?.away_team, side: sides.away)
        let homeKey = key(primaryPick?.homeTeam ?? row?.home_team, side: sides.home)
        var out: [String] = []
        for h in [line(awayKey), line(homeKey)].compactMap({ $0 }) where !out.contains(h) { out.append(h) }
        return out
    }

    // ── THE MLB PAGE, FOR FOOTBALL (founder, Sep 1 2026) ────────────────────
    // "I really shouldn't be able to see hardly any visible differences": the
    // football page mounts the SAME components the MLB page does, in the same
    // order — THE ARMS layout (the passing games), THE NEWS card, THE BIG
    // NUMBERS rail, THE HEAD-TO-HEAD, the player intel, the lineup-style
    // availability container, MORE INTEL. Only the words and numbers are
    // football's. Every module still hides itself when its evidence is
    // missing — an empty lane is an absent module, never a placeholder.

    /// THE QUARTERBACKS — MLB's ARMS layout: Gary's read on the passing games
    /// as the take, then a plate per side with the lane's exact per-side
    /// numbers (yards per attempt, passing yards per game …). Built from the
    /// quarterback lane's meta.away / meta.home, so nothing is inferred.
    private var quarterbackTakeRow: (row: Signal, take: String)? {
        for s in qbRows {
            if let r = s.lane?.read?.trimmingCharacters(in: .whitespacesAndNewlines), !r.isEmpty { return (s, r) }
            let d = s.detail.trimmingCharacters(in: .whitespacesAndNewlines)
            if !d.isEmpty { return (s, d) }
        }
        return nil
    }
    private var quarterbackTake: String? { quarterbackTakeRow?.take }
    private static let passingMetricLabels: [String: String] = [
        "yardsPerPass": "Yds / att",
        "passingYardsPerGame": "Pass yds / g",
        "passingTouchdownsPerGame": "Pass TD / g",
        "completionPct": "Comp %",
        "interceptionsPerGame": "INT / g",
        "sackRate": "Sack rate",
        "passerRating": "Rating",
    ]
    private func metricLabel(_ s: Signal) -> String {
        if let m = s.lane?.metric, let l = Self.passingMetricLabels[m] { return l }
        // The value string carries the unit ("2.65 Y/A") — keep the unit as the label.
        let parts = s.value.split(separator: " ")
        return parts.count > 1 ? String(parts.dropFirst().joined(separator: " ")) : "Passing"
    }
    private static func sideValue(_ t: TeamSheet?) -> String? {
        guard let v = t?.value else { return nil }
        let num = v == v.rounded() ? String(format: "%.0f", v) : (abs(v) >= 100 ? String(format: "%.1f", v) : String(format: "%.2f", v))
        if let g = t?.games, g > 0 { return "\(num) · \(g) G" }
        return num
    }
    private func quarterbackPlate(home: Bool) -> ScoutArmsPlate? {
        let stacks = qbPlateRows.compactMap { s -> ScoutArmsStack? in
            let side = home ? s.lane?.home : s.lane?.away
            guard let v = Self.sideValue(side) else { return nil }
            return ScoutArmsStack(label: metricLabel(s), value: v)
        }
        guard !stacks.isEmpty else { return nil }
        let abbr = laneAbbreviation(home: home) ?? (home ? sides.home : sides.away)
        return ScoutArmsPlate(name: abbr.uppercased(), stacks: Array(stacks))
    }

    /// THE BIG NUMBERS — the same rail MLB uses. The lane rows lead (pace,
    /// turnovers, explosives, the trenches — the headline already carries the
    /// comparison), the game-shape pairs fill when the lanes are thin, and
    /// THE LINE closes the rail whenever prices are posted (founder, Aug 14:
    /// the market row is the fifth one).
    /// The lane rows that actually make the rail: a row with no leading
    /// numeral is skipped here and shows in MORE INTEL instead.
    private var railLaneRows: [Signal] {
        numberRailRows.filter { !($0.value.split(separator: " ").first.map(String.init) ?? $0.value).isEmpty }
    }
    private var bigNumberRows: [ScoutBigNumberRow] {
        var out: [ScoutBigNumberRow] = []
        for s in railLaneRows {
            let numeral = s.value.split(separator: " ").first.map(String.init) ?? s.value
            out.append(ScoutBigNumberRow(id: "lane-\(s.id)", numeral: numeral, bold: s.headline, rest: ""))
        }
        for r in shapeRows where out.count < 4 {
            let awayVal = Double(r.away.replacingOccurrences(of: ",", with: "")) ?? 0
            let homeVal = Double(r.home.replacingOccurrences(of: ",", with: "")) ?? 0
            let awayLeads = awayVal >= homeVal
            let lead = awayLeads ? (r.awayLabel, r.away) : (r.homeLabel, r.home)
            let trail = awayLeads ? (r.homeLabel, r.home) : (r.awayLabel, r.away)
            out.append(ScoutBigNumberRow(id: "shape-\(r.id)", numeral: lead.1,
                                         bold: "\(lead.0) \(r.label.lowercased()) \(lead.1)\(r.scope.map { " (\($0))" } ?? "")",
                                         rest: " · \(trail.0) \(trail.1)"))
        }
        var rows = Array(out.prefix(4))
        if let receipt = receiptRow {
            rows.append(receipt)
        } else if let line = ScoutBigNumberRow.lineMove(awayName: sides.away, homeName: sides.home,
                                                        openAway: row?.ml_open_away, curAway: row?.ml_away,
                                                        openHome: row?.ml_open_home, curHome: row?.ml_home) {
            rows.append(line)
        }
        return rows
    }

    // ── Gary's Number as THE LINE row ───────────────────────────────────────
    // The selected side stays visible (the pick label leads the sentence),
    // only pre-kick market phases are labeled ("last pregame" once the
    // market closes, "same book" while it is open), and every number is the
    // structured published/current snapshot — receipt prose is never parsed.
    private static func receiptNumber(_ value: Double) -> String {
        let body = value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        return value > 0 ? "+\(body)" : body
    }
    private static func receiptPrimary(_ snapshot: FootballMarketSnapshot?) -> String? {
        if let line = snapshot?.line { return receiptNumber(line) }
        if let odds = snapshot?.odds { return receiptNumber(odds) }
        return nil
    }
    private var receiptRow: ScoutBigNumberRow? {
        guard let signal = numberSignal else { return nil }
        let meta: SwapMeta? = signal.afterGary
        let selection = meta?.pick_label?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
        guard !selection.isEmpty,
              let published = Self.receiptPrimary(meta?.published),
              let current = Self.receiptPrimary(meta?.current) else { return nil }
        var tags: [String] = []
        if let vendor = meta?.vendor?.trimmingCharacters(in: .whitespacesAndNewlines), !vendor.isEmpty {
            tags.append(vendor.uppercased())
        }
        if meta?.footballMarketIsClosed == true {
            tags.append("LAST PREGAME")
        } else if meta?.market_state?.lowercased() == "pregame" {
            tags.append("SAME BOOK")
        }
        let bold = published != current
            ? "\(selection) published \(published) and is now \(current)"
            : "\(selection) published \(published) and holds"
        let rest = tags.isEmpty ? "" : " · \(tags.joined(separator: " · "))"
        return ScoutBigNumberRow(id: "gary-number", numeral: current, bold: bold, rest: rest)
    }

    /// MORE INTEL — every remaining read for this game, in the MLB list.
    /// Excluded by ROW: what a section above actually shows (the take and the
    /// plates, the rail rows). Excluded by KIND only where the section above
    /// shows every row of that kind (the series, the injury wire) or the row
    /// is its own card (the live proof, the receipt) or not this game's
    /// (next slate). A capped section's overflow lands here, never nowhere.
    private var moreIntel: [Signal] {
        let wholeKindShown: Set<SignalKind> = [.h2h, .injury, .theSweat, .nextSlate, .afterGary]
        var shownIds = Set(railLaneRows.map(\.id))
        if quarterbackPlate(home: false) != nil || quarterbackPlate(home: true) != nil {
            shownIds.formUnion(qbPlateRows.map(\.id))
            if let take = quarterbackTakeRow { shownIds.insert(take.row.id) }
        }
        return edges.filter { s in
            guard matchesThisGame(s), !wholeKindShown.contains(s.kind), !shownIds.contains(s.id) else { return false }
            // The proof contract still gates the market range (exact game,
            // live board) — the list never shows a range the contract rejects.
            if s.kind == .marketRange { return FootballProofContract.isRenderableMarketRange(s, slateRow: row) }
            return true
        }
    }

    /// A side's BDL abbreviation from the lanes' own team sheets — present
    /// from the first morning insights pass, long before the board row or
    /// the pick carries one (football board rows never do).
    private func laneAbbreviation(home: Bool) -> String? {
        for s in edges where matchesThisGame(s) {
            if let a = (home ? s.lane?.home : s.lane?.away)?.abbreviation?.trimmingCharacters(in: .whitespaces), !a.isEmpty { return a }
        }
        return nil
    }

    /// Injury-wire rows attributed to a side by the lane's own suffix ("… is
    /// out for DET" — the BDL abbreviation). Each side is known by every
    /// abbreviation on file (the lanes', the board row's, the pick's) AND its
    /// mascot label, so either spelling attributes. A row neither side
    /// recognizes is never hidden: it shows under both.
    private func sideKeys(home: Bool) -> [String] {
        let raw: [String?] = [
            laneAbbreviation(home: home),
            home ? row?.home_abbr : row?.away_abbr,
            home ? primaryPick?.homeTeamAbbreviation : primaryPick?.awayTeamAbbreviation,
            home ? sides.home : sides.away,
        ]
        return raw.compactMap { $0?.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
    }
    private static func wireTeam(_ s: Signal) -> String? {
        guard let range = s.headline.range(of: #"\bfor ([A-Z][A-Za-z&' .-]{1,30})$"#, options: .regularExpression) else { return nil }
        return String(s.headline[range]).dropFirst(4).trimmingCharacters(in: .whitespaces).lowercased()
    }
    private func wireRows(home: Bool) -> [Signal] {
        let mine = sideKeys(home: home)
        let theirs = sideKeys(home: !home)
        func names(_ keys: [String], _ team: String) -> Bool {
            keys.contains { $0 == team || $0.hasSuffix(team) || team.hasSuffix($0) }
        }
        return injuryWireRows.filter { s in
            guard let team = Self.wireTeam(s) else { return true }
            return names(mine, team) || !names(theirs, team)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let take = quarterbackTake, quarterbackPlate(home: false) != nil || quarterbackPlate(home: true) != nil {
                ScoutArmsLayout(title: "THE QUARTERBACKS", take: take,
                                left: quarterbackPlate(home: false), right: quarterbackPlate(home: true))
            }
            if !newsLines.isEmpty {
                ScoutNewsCard(text: newsLines.joined(separator: " "))
            }
            ScoutBigNumbersRail(rows: bigNumberRows)
            // The series lives HERE and only here — the same section as MLB.
            GameH2HSection(edges: edges.filter { matchesThisGame($0) })
            PlayerIntelSection(matchup: matchup, gameId: exactGameID)
            FootballAvailabilityCard(awayLabel: sides.away, homeLabel: sides.home,
                                     confirmed: availability,
                                     wireAway: wireRows(home: false), wireHome: wireRows(home: true))
            if !moreIntel.isEmpty {
                EdgesSection(title: "MORE INTEL", edges: moreIntel).padding(.top, 8)
            }
            if !sweatSignals.isEmpty {
                FootballSweatSection(signals: sweatSignals, accent: accent)
            }
        }
    }
}

// MARK: - Exact evidence extraction

private enum FootballEvidence {
    struct ShapeRow: Identifiable {
        let id: String
        let label: String
        let away: String
        let home: String
        let awayLabel: String
        let homeLabel: String
        let scope: String?
    }

    struct Availability: Identifiable {
        let id: String
        let name: String
        let team: String
        let status: String?
        let detail: String?
    }

    private struct ShapeMetric {
        let id: String
        let label: String
        let tokens: Set<String>
    }

    // These are literal field contracts, not semantic aliases. For example,
    // RUSH_YDS_GM may render as rush yards/game; OL_RANKINGS may not.
    private static let nflShapeMetrics: [ShapeMetric] = [
        ShapeMetric(id: "rush", label: "RUSH YARDS / GAME",
                    tokens: ["RUSH_YDS_GM", "RUSHING_YARDS_PER_GAME", "RUSH_YPG", "RUSHING_YPG"]),
        ShapeMetric(id: "pass", label: "PASS YARDS / GAME",
                    tokens: ["PASS_YDS_GM", "PASSING_YPG"]),
        ShapeMetric(id: "scoring", label: "POINTS / GAME",
                    tokens: ["POINTS_GM", "POINTS_PER_GAME", "PPG"]),
        ShapeMetric(id: "scoring-defense", label: "POINTS ALLOWED / GAME",
                    tokens: ["OPP_PTS_GM", "OPP_POINTS_PER_GAME", "OPP_PPG"]),
        ShapeMetric(id: "yards-play", label: "YARDS / PLAY",
                    tokens: ["YARDS_PER_PLAY"]),
        ShapeMetric(id: "third-down", label: "THIRD DOWN",
                    tokens: ["THIRD_DOWN_PCT"]),
    ]

    private static let ncaafShapeMetrics: [ShapeMetric] = [
        ShapeMetric(id: "record", label: "RECORD", tokens: ["RECORD"]),
        ShapeMetric(id: "form", label: "LAST 5", tokens: ["L5_FORM"]),
        ShapeMetric(id: "total", label: "TOTAL YARDS / GAME", tokens: ["TOTAL_YPG"]),
        ShapeMetric(id: "rush", label: "RUSH YARDS / GAME",
                    tokens: ["RUSH_YDS_GM", "RUSHING_YARDS_PER_GAME", "RUSH_YPG", "RUSHING_YPG"]),
        ShapeMetric(id: "pass", label: "PASS YARDS / GAME",
                    tokens: ["PASS_YDS_GM", "PASSING_YPG"]),
    ]

    static func clean(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.uppercased() != "N/A", value != "—" else { return nil }
        return value
    }

    static func sideLabel(_ raw: String, league: String) -> String {
        let short = Formatters.shortTeamName(raw, league: league)
        return short.isEmpty ? raw.uppercased() : short.uppercased()
    }

    /// Read only the property named by the exact token. This deliberately does
    /// not call StatValues.getValue(for:), whose legacy cross-sport aliases are
    /// broader than this football product is allowed to be.
    private static func exactValue(_ values: StatValues?, token: String) -> String? {
        guard let values else { return nil }
        let raw: String?
        switch token {
        case "RECORD":
            raw = values.overall
        case "L5_FORM":
            raw = values.last5
        case "POINTS_GM", "POINTS_PER_GAME", "PPG":
            raw = values.pointsPerGame
        case "OPP_PTS_GM", "OPP_POINTS_PER_GAME", "OPP_PPG":
            raw = values.oppPointsPerGame
        case "RUSH_YDS_GM", "RUSHING_YARDS_PER_GAME", "RUSH_YPG", "RUSHING_YPG":
            raw = values.rushingYpg ?? values.rushingYardsPerGame
        case "PASS_YDS_GM", "PASSING_YPG":
            raw = values.passingYpg
        case "TOTAL_YPG":
            raw = values.totalYpg
        case "YARDS_PER_PLAY":
            raw = values.yardsPerPlay
        case "THIRD_DOWN_PCT":
            raw = values.thirdDownPct
        default:
            raw = nil
        }
        return clean(raw)
    }

    private static func scopeLabel(from name: String?) -> String? {
        guard let name, name.range(of: "baseline", options: [.caseInsensitive]) != nil else { return nil }
        if let year = name.range(of: #"\b(?:19|20)\d{2}\b"#, options: [.regularExpression]) {
            return "\(name[year]) BASELINE"
        }
        return "PRIOR BASELINE"
    }

    static func shapeRows(league: String, stats: [StatData],
                          awayLabel: String, homeLabel: String) -> [ShapeRow] {
        let metrics = league == "NCAAF" ? ncaafShapeMetrics : nflShapeMetrics
        let limit = league == "NCAAF" ? 5 : 4
        var rows: [ShapeRow] = []

        for metric in metrics {
            guard let stat = stats.first(where: {
                metric.tokens.contains(($0.token ?? "").uppercased())
            }) else { continue }
            let token = (stat.token ?? "").uppercased()
            guard let away = exactValue(stat.away, token: token),
                  let home = exactValue(stat.home, token: token) else { continue }
            rows.append(ShapeRow(
                id: metric.id,
                label: metric.label,
                away: away,
                home: home,
                awayLabel: awayLabel,
                homeLabel: homeLabel,
                scope: scopeLabel(from: stat.name)
            ))
            if rows.count == limit { break }
        }
        return rows
    }

    static func commonScope(in rows: [ShapeRow]) -> String? {
        let scopes = rows.compactMap(\.scope)
        guard scopes.count == rows.count, let first = scopes.first,
              scopes.allSatisfy({ $0 == first }) else { return nil }
        return first
    }

    private static func injuryPriority(_ status: String?) -> Int {
        let value = (status ?? "").lowercased()
        if value.contains("out") || value == "ir" { return 0 }
        if value.contains("doubt") { return 1 }
        if value.contains("question") || value.contains("day-to-day") { return 2 }
        return 3
    }

    private static func compactDetail(_ raw: String?) -> String? {
        guard let value = clean(raw) else { return nil }
        let first = value.components(separatedBy: CharacterSet(charactersIn: ".\n")).first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? value
        guard !first.isEmpty else { return nil }
        // NO ELLIPSIS EVER (founder hard law): the first sentence prints whole.
        // The old 96-char cap chopped it to 93 chars + "…" — truncation is
        // never acceptable; the row wraps instead (found in the Sep 1 audit).
        return first
    }

    /// The whole report, every listed player on both sides — the card shows
    /// one side at a time and never trims (founder hard law: shown content
    /// is complete). Ordered worst status first within each side.
    static func availability(from pick: GaryPick?, awayLabel: String,
                             homeLabel: String) -> [Availability] {
        guard let injuries = pick?.injuries else { return [] }

        func rows(_ source: [PlayerInjury], team: String) -> [Availability] {
            source.sorted { injuryPriority($0.status) < injuryPriority($1.status) }
                .compactMap { injury in
                    guard let name = clean(injury.name) else { return nil }
                    return Availability(
                        id: "\(team)-\(name.lowercased())",
                        name: name,
                        team: team,
                        status: clean(injury.status)?.uppercased(),
                        detail: compactDetail(injury.description)
                    )
                }
        }

        var seen = Set<String>()
        return (rows(injuries.away ?? [], team: awayLabel) + rows(injuries.home ?? [], team: homeLabel))
            .filter { seen.insert($0.name.lowercased()).inserted }
    }
}


// MARK: - The availability container (MLB's lineup card, for football)

/// THE AVAILABILITY — the same container MLB's lineup wears (founder, Aug 6:
/// "the Lineup needs a container"; Sep 1: the football page must look like
/// MLB's): the two-state tabs, the gold/dim team switch, then the rows.
/// "Injury wire" is the morning layer (the insight rows, from 6 AM);
/// "Confirmed" is the dossier's own report once Gary has spoken. An empty
/// state stays honest, in MLB's own words.
private struct FootballAvailabilityCard: View {
    let awayLabel: String
    let homeLabel: String
    let confirmed: [FootballEvidence.Availability]
    let wireAway: [Signal]
    let wireHome: [Signal]

    private enum Layer: String, CaseIterable { case wire = "Injury wire", confirmed = "Confirmed" }
    @State private var state: Layer = .wire
    @State private var homeUp = true

    private var confirmedAvailable: Bool { !confirmed.isEmpty }
    private var shownConfirmed: [FootballEvidence.Availability] {
        confirmed.filter { $0.team == (homeUp ? homeLabel : awayLabel) }
    }
    private var shownWire: [Signal] { homeUp ? wireHome : wireAway }

    private static func statusColor(_ status: String?) -> Color {
        switch (status ?? "").uppercased() {
        case "OUT", "IR", "DOUBTFUL", "SUSPENDED": return Color(hex: "#cf6b5b")
        case "QUESTIONABLE", "LIMITED", "DNP": return GaryColors.gold
        default: return Color(hex: "#63D17E")
        }
    }

    var body: some View {
        // Hidden entirely when neither layer has a row — an absent module,
        // never an empty box.
        if confirmedAvailable || !wireAway.isEmpty || !wireHome.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                tabs
                content.padding(.horizontal, 14).padding(.top, 12)
                teamToggle.padding(.top, 14).padding(.bottom, 4).frame(maxWidth: .infinity)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(GaryColors.warmWhite.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(GaryColors.warmWhite.opacity(0.09), lineWidth: 1))
            )
            .padding(.horizontal, 16)
            .onAppear { if confirmedAvailable { state = .confirmed } }
        }
    }

    private var tabs: some View {
        HStack {
            ForEach(Layer.allCases, id: \.self) { s in
                Button { withAnimation(.easeInOut(duration: 0.2)) { state = s } } label: {
                    Text(s.rawValue).font(GaryFonts.text(16, state == s ? .bold : .medium))
                        .foregroundStyle(state == s ? Color.white : Color.white.opacity(0.38))
                }.buttonStyle(.plain)
                if s != Layer.allCases.last { Spacer() }
            }
            Spacer()
        }
        .padding(.horizontal, 22).padding(.top, 2)
    }

    private var teamToggle: some View {
        // No bubble — the gold/dim font color alone marks the selected side.
        HStack(spacing: 16) {
            ForEach([false, true], id: \.self) { isHome in
                Button { withAnimation(.easeInOut(duration: 0.18)) { homeUp = isHome } } label: {
                    Text((isHome ? homeLabel : awayLabel).uppercased())
                        .font(GaryFonts.mono(12, bold: true)).tracking(1.6)
                        .foregroundStyle(homeUp == isHome ? GaryColors.gold : Color.white.opacity(0.38))
                }.buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private var content: some View {
        if state == .confirmed && !confirmedAvailable {
            pending(title: "REPORT NOT CONFIRMED YET", sub: "Posts with Gary's pick", hint: "Tap Injury wire for the morning report")
        } else if state == .confirmed {
            if shownConfirmed.isEmpty {
                pending(title: "NO LISTED ABSENCES", sub: "Everyone on the report is available", hint: nil)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(shownConfirmed.enumerated()), id: \.element.id) { i, a in
                        if i > 0 { Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1) }
                        row(name: a.name, status: a.status, detail: a.detail)
                    }
                }
            }
        } else if shownWire.isEmpty {
            pending(title: "NO INJURY NEWS YET", sub: "The wire fills from 6 AM ET", hint: nil)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(shownWire.enumerated()), id: \.element.id) { i, sg in
                    if i > 0 { Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1) }
                    row(name: Self.subject(of: sg.headline), status: sg.value, detail: sg.detail)
                }
            }
        }
    }

    /// "Cade Mays (C) is out for DET" → "Cade Mays (C)".
    private static func subject(of headline: String) -> String {
        if let r = headline.range(of: #"\s+(is|was|remains|has been)\s"#, options: .regularExpression) {
            return String(headline[..<r.lowerBound])
        }
        return headline
    }

    private func row(name: String, status: String?, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(name)
                    .font(GaryFonts.text(15, .semibold)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if let status, !status.isEmpty {
                    Text(status.uppercased())
                        .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                        .foregroundStyle(Self.statusColor(status))
                        .lineLimit(1)
                }
            }
            if let detail, !detail.isEmpty {
                Text(detail)
                    .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.62))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 8)
    }

    private func pending(title: String, sub: String, hint: String?) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(GaryFonts.mono(14, bold: true)).tracking(2.5).foregroundStyle(GaryColors.gold)
                .multilineTextAlignment(.center)
            Text(sub).font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.5))
            if let hint { Text(hint).font(GaryFonts.mono(9.5)).foregroundStyle(.white.opacity(0.38)) }
        }
        .padding(.vertical, 22).padding(.horizontal, 26)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(GaryColors.cardBg.opacity(0.5)))
    }
}

// MARK: - Shared football presentation

// No accent tick before the title (founder, Aug 20: the little coloured bar
// comes off every NFL/NCAAF header) — the gold word carries the section on its
// own, the same way MLB's headers do.
private struct FootballSectionTitle: View {
    let title: String
    var trailing: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 9) {
            Text(title.uppercased())
                .font(GaryFonts.mono(13, bold: true))
                .tracking(1.35)
                .foregroundStyle(GaryColors.gold)
            Spacer(minLength: 8)
            if let trailing, !trailing.isEmpty {
                Text(trailing.uppercased())
                    .font(GaryFonts.mono(8.5, bold: true))
                    .tracking(0.7)
                    .foregroundStyle(.white.opacity(0.46))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
    }
}

private struct FootballSweatSection: View {
    let signals: [Signal]
    let accent: Color

    private var normalizedStates: [String] {
        signals.compactMap { FootballProofContract.sweatState($0)?.rawValue.lowercased() }
    }

    private var terminal: Bool {
        let finalStates: Set<String> = ["held", "missed", "push"]
        return !normalizedStates.isEmpty && normalizedStates.allSatisfy(finalStates.contains)
    }

    private var summary: String {
        if terminal {
            let held = normalizedStates.filter { $0 == "held" }.count
            let missed = normalizedStates.filter { $0 == "missed" }.count
            let pushes = normalizedStates.filter { $0 == "push" }.count
            var parts: [String] = []
            if held > 0 { parts.append("\(held) HELD") }
            if missed > 0 { parts.append("\(missed) MISSED") }
            if pushes > 0 { parts.append("\(pushes) PUSH") }
            return parts.isEmpty ? "FINAL" : parts.joined(separator: " · ")
        }
        if normalizedStates.contains("flipped") { return "FLIPPED" }
        if normalizedStates.contains("holding") { return "HOLDING" }
        return "WATCH"
    }

    var body: some View {
        // MLB's section dress (Sep 1 2026): the gold display title on the
        // page card — the live proof reads like every other module.
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text("THE SWEAT")
                    .font(GaryFonts.display(13)).tracking(0.8)
                    .foregroundStyle(GaryColors.gold)
                Spacer(minLength: 8)
                Text(summary)
                    .font(GaryFonts.mono(10, bold: true)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(.horizontal, 14).padding(.top, 12)
            VStack(spacing: 0) {
                ForEach(Array(signals.enumerated()), id: \.element.id) { index, signal in
                    FootballSweatRow(signal: signal, accent: accent)
                    if index < signals.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ScoutMock.cardShape)
        .padding(.horizontal, 16)
    }
}

private struct FootballSweatRow: View {
    let signal: Signal
    let accent: Color

    private var meta: SwapMeta? { signal.sweat }

    private var isTicket: Bool {
        (meta?.factor_code ?? "").uppercased() == "THE_NUMBER"
    }

    private var factor: String {
        if let raw = signal.sweat?.factor_code?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            switch raw.uppercased() {
            case "THE_NUMBER": return "THE NUMBER"
            case "RUSH_EDGE": return "GROUND"
            case "AIR_EDGE": return "AIR"
            case "BALL_SECURITY": return "BALL SECURITY"
                default: return raw.replacingOccurrences(of: "_", with: " ").uppercased()
            }
        }
        return "FACTOR"
    }

    private func scalar(_ value: InsightMetaValue?) -> String? {
        guard let value else { return nil }
        let text = value.display.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    private func scalar(_ value: Double?) -> String? {
        guard let value else { return nil }
        if value.rounded() == value { return String(Int(value)) }
        return String(format: "%.2f", value)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    }

    private func signedScalar(_ value: InsightMetaValue?) -> String? {
        guard let text = scalar(value) else { return nil }
        if text.hasPrefix("+") || text.hasPrefix("-") { return text }
        if let number = Double(text), number > 0 { return "+\(text)" }
        return text
    }

    private func unit(_ raw: String?) -> String? {
        let text = raw?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return text?.isEmpty == false ? text : nil
    }

    private func pair(selected: InsightMetaValue?, opponent: InsightMetaValue?, unit rawUnit: String?) -> String? {
        guard let selected = scalar(selected) else { return nil }
        var value = "\((meta?.team ?? "PICK").uppercased()) \(selected)"
        if let opponent = scalar(opponent) { value += " · OPP \(opponent)" }
        if let unit = unit(rawUnit) { value += " \(unit)" }
        return value
    }

    private var baseline: String? {
        if isTicket {
            switch (meta?.market_type ?? "").lowercased() {
            case "spread":
                if let line = signedScalar(meta?.baseline_selected) {
                    return "\((meta?.team ?? "PICK").uppercased()) \(line)"
                }
            case "total", "moneyline":
                // Total direction and ML identity are preserved in the exact
                // stored baseline; neither is derivable from a numeric line.
                if let value = scalar(meta?.baseline) { return value }
            default:
                break
            }
        } else if let value = pair(selected: meta?.baseline_selected,
                                   opponent: meta?.baseline_opponent,
                                   unit: meta?.baseline_unit) {
            return value
        }
        return scalar(meta?.baseline)
    }

    private var live: String? {
        if isTicket {
            if (meta?.market_type ?? "").lowercased() == "total",
               let total = scalar(meta?.live_selected),
               let line = scalar(meta?.live_opponent) {
                return "TOTAL \(total) · LINE \(line)"
            }
            if let selected = scalar(meta?.selected_score) ?? scalar(meta?.live_selected),
               let opponent = scalar(meta?.opponent_score) ?? scalar(meta?.live_opponent) {
                return "\((meta?.team ?? "PICK").uppercased()) \(selected) · OPP \(opponent)"
            }
        } else if let value = pair(selected: meta?.live_selected,
                                   opponent: meta?.live_opponent,
                                   unit: meta?.live_unit) {
            return value
        }
        return scalar(meta?.live_value)
    }

    private var ticketMargin: String? {
        guard isTicket, let margin = meta?.cover_margin else { return nil }
        let body = margin.rounded() == margin ? String(Int(margin)) : String(format: "%.2f", margin)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        return "\(margin > 0 ? "+" : "")\(body) PTS"
    }

    private var state: String {
        FootballProofContract.sweatState(signal)?.rawValue ?? "—"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(factor)
                    .font(GaryFonts.mono(10, bold: true))
                    .tracking(0.55)
                    .foregroundStyle(GaryColors.warmWhite)
                Spacer(minLength: 8)
                Text(state)
                    .font(GaryFonts.mono(8, bold: true))
                    .tracking(0.65)
                    .foregroundStyle(stateColor)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(stateColor.opacity(0.12)))
            }

            // Baseline and live are separate labeled registers. A spread such
            // as BAL +4 is never drawn as if it transformed into a 0-0 score,
            // and a per-game baseline is never arrowed into an in-game total.
            if baseline != nil || live != nil {
                HStack(alignment: .top, spacing: 12) {
                    if let baseline {
                        SweatValue(label: "PREGAME", value: baseline)
                    }
                    if let live {
                        SweatValue(label: "LIVE", value: live)
                    }
                }
            }

            if let ticketMargin {
                HStack(spacing: 8) {
                    Text("TICKET MARGIN")
                        .font(GaryFonts.mono(7.5, bold: true))
                        .tracking(0.7)
                        .foregroundStyle(.white.opacity(0.38))
                    Spacer(minLength: 8)
                    Text(ticketMargin)
                        .font(GaryFonts.data(11.5, .bold))
                        .foregroundStyle(stateColor)
                }
                .padding(.top, 1)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    private var stateColor: Color {
        switch state {
        case "FLIPPED", "MISSED": return HubPalette.red
        case "WATCH", "PUSH": return GaryColors.gold
        default: return accent
        }
    }
}

private struct SweatValue: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(GaryFonts.mono(7.5, bold: true))
                .tracking(0.7)
                .foregroundStyle(.white.opacity(0.38))
            Text(value)
                .font(GaryFonts.data(12.5, .bold))
                .foregroundStyle(.white.opacity(0.78))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension View {
    func footballPanel(accent: Color) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                    .fill(Color(hex: "#14120F"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 17, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [accent.opacity(0.28), Color.white.opacity(0.07)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
    }
}

// MARK: - Grounded football next slate (NCAAF + NFL — one card, Aug 24 2026)

struct FootballNextSlatePreview: View {
    let signal: Signal
    let accent: Color

    private var meta: SwapMeta? { signal.nextSlate }

    /// "NEXT NFL SLATE" / "NEXT NCAAF SLATE" — the card follows its signal's
    /// league (founder parity order, Aug 24: both football pages share one
    /// dark-day format).
    private var titleLabel: String {
        "NEXT \(signal.league.label) SLATE"
    }

    private var dateLabel: String {
        guard let raw = meta?.scheduled_date else { return "DATE PENDING" }
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(secondsFromGMT: 0)
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: raw) else { return raw.uppercased() }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        // scheduled_date is a calendar date, not an instant. Keep UTC for both
        // parse/display so midnight cannot shift to the previous ET day.
        display.timeZone = TimeZone(secondsFromGMT: 0)
        display.dateFormat = "EEE · MMM d"
        return display.string(from: date).uppercased()
    }

    private var kickoffLabel: String {
        if let raw = meta?.first_confirmed_kickoff,
           let date = parseISO8601(raw) {
            let display = DateFormatter()
            display.locale = Locale(identifier: "en_US_POSIX")
            display.timeZone = TimeZone(identifier: "America/New_York")
            display.dateFormat = "h:mm a"
            return "FIRST KICK \(display.string(from: date).uppercased()) ET"
        }
        return "KICKOFF TIMES TBD"
    }

    private var countLabel: String {
        let count = meta?.game_count ?? 0
        return "\(count) \(count == 1 ? "GAME" : "GAMES")"
    }

    private var precisionLabel: String? {
        guard let total = meta?.game_count,
              let tbd = meta?.time_tbd_count,
              tbd > 0, tbd < total else { return nil }
        return "\(tbd) TIME TBD"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(titleLabel)
                    .font(GaryFonts.mono(9, bold: true))
                    .tracking(1)
                    .foregroundStyle(accent)
                Spacer(minLength: 8)
                Text(countLabel)
                    .font(GaryFonts.data(10.5, .bold))
                    .foregroundStyle(.white.opacity(0.48))
            }
            Text(dateLabel)
                .font(GaryFonts.display(29))
                .foregroundStyle(GaryColors.warmWhite)
            HStack(spacing: 8) {
                Text(kickoffLabel)
                    .font(GaryFonts.mono(9, bold: true))
                    .tracking(0.6)
                    .foregroundStyle(.white.opacity(0.68))
                if let precisionLabel {
                    Text("· \(precisionLabel)")
                        .font(GaryFonts.mono(8.5, bold: true))
                        .foregroundStyle(GaryColors.gold.opacity(0.8))
                }
            }
        }
        .padding(15)
        .footballPanel(accent: accent)
        .padding(.horizontal, 16)
    }
}

// MARK: - Football Today feed

/// The football Picks page runs MLB's exact mechanism (founder, Aug 20: the NFL
/// Today page is "the same as MLB literally — the categories and then how it
/// works", only the lanes differ). So there is no bespoke football board any
/// more: the slate's signals go straight into `EdgesSection(tabbed:)`, which
/// draws THE SHOW plus one tab per live lane and the same row feed underneath.
///
/// What stays football-specific is the exclusion list. THE SWEAT and AFTER
/// GARY are structured proof surfaces ("GROUND | 121.6 · 106.9", a receipt's
/// line move) — they render through their own Hub and game-page components and
/// read as gibberish through a prose row, so they never enter this feed.
/// MARKET RANGE stays off for its own reason: this summary carries no
/// authoritative slate row to prove an exact confirmed kickoff against, which
/// the Hub and the game page do.
enum FootballTodayFeed {
    static func rows(_ signals: [Signal]) -> [Signal] {
        signals.filter { signal in
            switch signal.kind {
            case .theSweat, .afterGary, .marketRange: return false
            // The season series belongs to its game page, not the day's list
            // (the same rule MLB's Today feed follows).
            case .h2h: return false
            default: return true
            }
        }
    }
}

// MARK: - Morning layer sections (Aug 20)
// The football page's from-6AM content: THE NEWS off the wire, THE
// QUARTERBACKS duel, THE INJURY WIRE, THE NUMBERS rail, THE STANDINGS —
// each reads the day's insight_connections rows (Gary's read rides in
// signal.detail) and renders in the established football grammar:
// FootballSectionTitle + footballPanel + hairline rows.
