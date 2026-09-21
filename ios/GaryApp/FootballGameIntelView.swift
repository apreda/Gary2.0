import SwiftUI

// MARK: - Football game intelligence
//
// The pick and prop cards above this view remain the shared Gary cards. This
// file owns the football-only evidence below them. Every visible value is an
// exact stored market, an explicitly whitelisted stat, an injury record, or a
// live proof value. Required college evidence failures remain visible.

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
    var gameDate: String? = nil
    var scheduledGameID: Int? = nil
    var scheduledKickoff: Date? = nil

    @State private var componentHealth: [SupabaseAPI.FootballComponentHealth] = []
    @State private var componentHealthError: String?
    private var componentHealthKey: String { "\(gameDate ?? "")|\(exactGameID ?? "")|\(normalizedLeague)" }
    private var availabilityVerified: Bool {
        Set(componentHealth.filter { $0.component == "availability" && $0.currentVerified }.map(\.team_id)).count == 2
    }
    private var availabilityFailure: String {
        componentHealthError ?? componentHealth.first(where: { $0.component == "availability" && !$0.currentVerified })?.reason
            ?? "Current availability could not be verified for both teams."
    }

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
        let ids = [scheduledGameID.map(String.init), primaryPick?.game_id.map(String.init), row?.bdl_game_id.map(String.init)]
            .compactMap { $0 }
        guard let first = ids.first, ids.allSatisfy({ $0 == first }) else { return nil }
        return first
    }

    private func belongsToExactGame(_ signal: Signal) -> Bool {
        guard let exactGameID else { return false }
        return signal.gameId == exactGameID
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

    /// Starting quarterback identity and each player's actual passing line.
    private var qbRows: [Signal] { morningRows([.quarterback]) }
    private var injuryWireRows: [Signal] { morningRows([.injury]) }
    /// The league's official report for this game (footballPracticeReport).
    private var practiceRows: [Signal] { morningRows([.practiceReport]) }
    /// The rail's lanes: pace, turnovers, explosives, the trenches, and since
    /// Sep 9 2026 the pass rush, the red zone and the coaching edges — on a
    /// Week 1 slate the first four alone left the rail one row deep.
    private var numberRailRows: [Signal] {
        morningRows([.paceScript, .turnoverEdge, .explosivePlay, .trenches, .passRush, .redZone, .coaching], cap: 4)
    }

    /// One line per team off the wire: today's injury first, else today's
    /// pace/line note — the same selection the MLB scout uses. Team keys are
    /// the nickname (last word of the full team name) because wire copy says
    /// "Raiders", never "LV".
    private var newsLines: [String] {
        let lg = normalizedLeague
        guard let today = gameDate else { return [] }
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

    /// NFL reads the board's Gary-voiced take exactly as MLB's Arms does
    /// (founder, Sep 21 2026: MLB is the reference implementation). Missing
    /// generated copy is not permission to resurrect the stat template; the
    /// section waits for the board refresh that carries the take.
    /// College keeps its reporting-backed starter reads.
    private var quarterbackTake: String? {
        if !isCollege {
            guard let take = row?.arms_take?.trimmingCharacters(in: .whitespacesAndNewlines), !take.isEmpty else { return nil }
            return take
        }
        var seen: Set<String> = []
        let reads = starterRows.compactMap { row -> String? in
            let take = (row.lane?.read?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? row.lane?.read : row.detail)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !take.isEmpty, seen.insert(take).inserted else { return nil }
            return take
        }
        guard !reads.isEmpty else {
            return isCollege ? "STARTING QB DATA FAILED — current starters could not be verified for both teams."
                : "Starting quarterback data is unavailable for this matchup."
        }
        return reads.joined(separator: "\n\n")
    }
    /// The named starters (footballQbWatch rows carry `meta.qb`, `meta.side`
    /// and the line as numbers since Sep 3 2026), away then home.
    private var starterRows: [Signal] {
        let named = qbRows.filter { $0.lane?.qb != nil && (!isCollege || ["confirmed", "projected"].contains($0.lane?.qb_status ?? "")) }
        return named.filter { $0.lane?.side == "away" } + named.filter { $0.lane?.side == "home" }
    }
    private func starterRow(home: Bool) -> Signal? {
        starterRows.first { $0.lane?.side == (home ? "home" : "away") }
    }

    private func quarterbackPlate(home: Bool) -> ScoutArmsPlate? {
        // MLB's ARMS shows the two STARTERS by name (founder, Sep 3 2026:
        // "normally this would be the QBs and not the teams"). The plate is
        // the quarterback and his line. College requires verified current identities.
        if let s = starterRow(home: home), let qb = s.lane?.qb {
            var stacks: [ScoutArmsStack] = []
            if let p = s.lane?.passing {
                let year = (p.prior == true && p.season != nil) ? " · \(p.season!)" : ""
                if let v = p.ypa { stacks.append(ScoutArmsStack(label: "Yds / att\(year)", value: String(format: "%.2f", v))) }
                if let v = p.pct { stacks.append(ScoutArmsStack(label: "Comp %", value: String(format: "%.1f", v))) }
                if let v = p.yards { stacks.append(ScoutArmsStack(label: "Pass yds", value: String(format: "%.0f", v))) }
                if let td = p.td, let ints = p.ints { stacks.append(ScoutArmsStack(label: "TD-INT", value: "\(td)-\(ints)")) }
                if let g = p.games { stacks.append(ScoutArmsStack(label: "Games", value: "\(g)")) }
            }
            if let status = s.lane?.injury_status, !status.isEmpty {
                stacks.append(ScoutArmsStack(label: "Status", value: status.uppercased()))
            }
            if isCollege {
                stacks.insert(ScoutArmsStack(label: home ? sides.home : sides.away,
                    value: s.lane?.qb_status == "confirmed" ? "Confirmed starter" : "Projected starter"), at: 0)
            }
            return ScoutArmsPlate(name: qb.uppercased(),
                                  stacks: stacks.isEmpty ? [ScoutArmsStack(label: "Starter", value: "QB1")] : stacks)
        }
        return ScoutArmsPlate(name: (home ? sides.home : sides.away).uppercased(),
                              stacks: [ScoutArmsStack(label: "Starting quarterback", value: "DATA FAILED · starter unverified")])
    }

    /// THE BIG NUMBERS — the same rail MLB uses. The lane rows lead (pace,
    /// turnovers, explosives, the trenches — the headline already carries the
    /// comparison), the game-shape pairs fill when the lanes are thin, and
    /// A verified, game-specific pregame receipt may close the rail. Raw board
    /// moneylines can contain in-game or stale prices and are not a receipt.
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
        // The book and market-state tags ("FANDUEL · SAME BOOK") were pipeline
        // internals, not reader copy (founder, Sep 21 2026) — the row is the
        // published number and where it stands now, nothing else.
        let bold = published != current
            ? "\(selection) published \(published) and is now \(current)"
            : "\(selection) published \(published) and holds"
        return ScoutBigNumberRow(id: "gary-number", numeral: current, bold: bold, rest: "")
    }

    /// MORE INTEL — every remaining read for this game, in the MLB list.
    /// Excluded by ROW: what a section above actually shows (the take and the
    /// plates, the rail rows). Excluded by KIND only where the section above
    /// shows every row of that kind (the series, the injury wire) or the row
    /// is its own card (the live proof, the receipt) or not this game's
    /// (next slate). A capped section's overflow lands here, never nowhere.
    private var moreIntel: [Signal] {
        let wholeKindShown: Set<SignalKind> = [.h2h, .injury, .theSweat, .nextSlate, .afterGary, .practiceReport]
        var shownIds = Set(railLaneRows.map(\.id))
        if quarterbackPlate(home: false) != nil || quarterbackPlate(home: true) != nil {
            shownIds.formUnion(starterRows.map(\.id))
        }
        var seenHeadlines: Set<String> = []
        return edges.filter { s in
            guard matchesThisGame(s), !wholeKindShown.contains(s.kind), !shownIds.contains(s.id) else { return false }
            if s.kind == .marketRange, !FootballProofContract.isRenderableMarketRange(s, slateRow: row) { return false }
            let headline = s.headline.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return seenHeadlines.insert("\(s.kind)|\(headline)").inserted
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

    // ── THE LINE (founder, Sep 9 2026) ───────────────────────────────────
    // Where this game's line opened and where it is now, one book, with
    // Gary's own number as a rung — the module under the pick card. Reads the
    // odds ledger by the exact provider game id; absent until it has rungs.
    private var lineKickoff: Date? {
        scheduledKickoff ?? [row?.commence_time, primaryPick?.commence_time].compactMap { $0 }.compactMap(LineClock.parse).first
    }
    private var lineGaryAnchor: LineGaryAnchor? {
        if let meta = numberSignal?.afterGary,
           let label = meta.pick_label?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty {
            var text = label.uppercased()
            if let line = meta.published?.line { text += " \(LineText.spread(line))" }
            if let odds = meta.published?.odds { text += " (\(LineText.american(Int(odds.rounded()))))" }
            return LineGaryAnchor(label: text, postedAt: LineClock.parse(meta.published_at))
        }
        if let text = primaryPick?.pick?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
            return LineGaryAnchor(label: text, postedAt: nil)
        }
        return nil
    }
    @ViewBuilder private var lineLadderModule: some View {
        if let sportKey = LineSport.key(forLeague: normalizedLeague),
           let gameID = exactGameID ?? row?.bdl_game_id.map(String.init),
           let date = ExactGameIdentity.easternDate(of: lineKickoff) ?? gameDate {
            LineLadderCard(sportKey: sportKey, gameDate: date, gameID: gameID, league: normalizedLeague,
                           awayAbbr: scoreboardTeamAbbreviation(sides.away, stored: laneAbbreviation(home: false), league: normalizedLeague),
                           homeAbbr: scoreboardTeamAbbreviation(sides.home, stored: laneAbbreviation(home: true), league: normalizedLeague),
                           kickoff: lineKickoff, gary: lineGaryAnchor)
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
            PlayerIntelSection(matchup: matchup, league: normalizedLeague, gameId: exactGameID, gameDate: gameDate)
            FootballAvailabilityCard(awayLabel: sides.away, homeLabel: sides.home,
                                     confirmed: availability,
                                     wireAway: wireRows(home: false), wireHome: wireRows(home: true),
                                     practice: practiceRows, requiresVerifiedCoverage: isCollege, coverageVerified: availabilityVerified, coverageFailure: availabilityFailure)
            if !moreIntel.isEmpty {
                // The Week 2 page's own row cards (founder, Sep 21 2026).
                EdgesSection(title: "MORE INTEL", edges: moreIntel, contained: true).padding(.top, 8)
            }
            // THE SWEAT left the football pages Sep 21 2026 (founder).
            lineLadderModule
        }
        .task(id: componentHealthKey) {
            componentHealth = []
            componentHealthError = nil
            guard isCollege, let date = gameDate, let gameID = exactGameID else { return }
            do {
                let health = try await SupabaseAPI.fetchFootballComponentHealth(date: date, gameID: gameID)
                if !Task.isCancelled { componentHealth = health }
            }
            catch { if !Task.isCancelled { componentHealthError = "The availability status could not be loaded. Please refresh." } }
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
        return short.isEmpty ? raw : short
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
    @Environment(\.solidPanels) private var solidPanels
    let awayLabel: String
    let homeLabel: String
    let confirmed: [FootballEvidence.Availability]
    let wireAway: [Signal]
    let wireHome: [Signal]
    /// BDL's dated practice report rows for this game (practice_report):
    /// this week's Wed/Thu/Fri participation and the game status, per side.
    var practice: [Signal] = []
    var requiresVerifiedCoverage = false
    var coverageVerified = false
    var coverageFailure = "Current availability could not be verified for both teams."

    @State private var homeUp = true
    @State private var open: Set<String> = []
    /// The top names show; the long tail (IR stashes, deep depth chart,
    /// season-enders) waits behind SEE ALL (founder, Sep 21 2026).
    @State private var showAll = false
    private static let shownLimit = 6

    /// One line of the report. Days are nil when the provider did not
    /// list participation that day; `official` marks a dated practice row.
    private struct Line: Identifiable {
        let id: String
        let name: String
        let position: String?
        let injury: String?
        let status: String?
        let note: String?
        let wed: String?, thu: String?, fri: String?
        let latest: String?
        let latestDay: String?
        let official: Bool
    }

    private static func statusColor(_ status: String?) -> Color {
        switch (status ?? "").uppercased() {
        case "OUT", "OUT FOR SEASON", "IR", "DOUBTFUL", "SUSPENDED", "DNP": return Color(hex: "#cf6b5b")
        case "QUESTIONABLE", "LIMITED", "LP": return GaryColors.gold
        default: return Color(hex: "#63D17E")
        }
    }
    private static func statusRank(_ status: String?, _ latest: String?) -> Int {
        switch (status ?? "").uppercased() {
        case "OUT", "OUT FOR SEASON", "IR", "SUSPENDED": return 0
        case "DOUBTFUL": return 1
        case "QUESTIONABLE": return 2
        default: break
        }
        switch (latest ?? "").uppercased() {
        case "DNP": return 3
        case "LP": return 4
        default: return 5
        }
    }

    /// "Cade Mays (C) is out for DET" → "Cade Mays (C)".
    private static func subject(of headline: String) -> String {
        if let r = headline.range(of: #"\s+(is|was|remains|has been)\s"#, options: .regularExpression) {
            return String(headline[..<r.lowerBound])
        }
        return headline
    }

    private static func playerKey(_ name: String) -> String {
        name.replacingOccurrences(of: #"\s*\([A-Za-z/]{1,5}\)\s*$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// The wire row's text: Gary's write-up (who the player is, the injury,
    /// when, what the status means) with the verbatim wire line and its date
    /// underneath when the two differ.
    private static func wireNote(_ w: Signal) -> String? {
        let d = w.detail.trimmingCharacters(in: .whitespacesAndNewlines)
        let computed = (w.lane?.computed_detail ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if d.isEmpty { return computed.isEmpty ? nil : computed }
        if computed.isEmpty || computed == d { return d }
        return d + "\n\n" + computed
    }

    /// The dossier's note or the wire's line for a name — the tap-to-open text.
    private func note(for name: String, home: Bool) -> String? {
        let key = name.lowercased()
        if let w = (home ? wireHome : wireAway).first(where: { Self.subject(of: $0.headline).lowercased().hasPrefix(key) }),
           let d = Self.wireNote(w) { return d }
        if let a = confirmed.first(where: { $0.team == (home ? homeLabel : awayLabel) && $0.name.lowercased() == key }),
           let d = a.detail, !d.isEmpty { return d }
        return nil
    }

    private func lines(home: Bool) -> [Line] {
        let side = home ? "home" : "away"
        let official = practice.filter { $0.lane?.side == side }
        if !official.isEmpty {
            return official.map { s in
                let m = s.lane
                return Line(id: s.id.uuidString, name: s.headline, position: m?.position, injury: m?.injury,
                            status: m?.game_status, note: note(for: s.headline, home: home),
                            wed: m?.practice?.wed, thu: m?.practice?.thu, fri: m?.practice?.fri,
                            latest: m?.latest, latestDay: m?.latest_day, official: true)
            }
            .sorted { Self.statusRank($0.status, $0.latest) < Self.statusRank($1.status, $1.latest) }
        }
        // Current reporting precedes the pick's saved pregame snapshot.
        // A position suffix is presentation, not a different player.
        // ORDER = importance (founder, Sep 21 2026: "the most important ones
        // at the top... no matter if it's questionable or IR or out"): the
        // wire's own ranking — status, position, recency, real reporting —
        // is the feed order (the board is read relevance-first); the frozen
        // snapshot follows in its stored order. Nothing re-sorts by the
        // status word.
        var out: [Line] = []
        var seen = Set<String>()
        for w in (home ? wireHome : wireAway) {
            let name = Self.subject(of: w.headline)
            guard seen.insert(Self.playerKey(name)).inserted else { continue }
            out.append(Line(id: w.id.uuidString, name: name, position: nil, injury: nil, status: w.value,
                            note: Self.wireNote(w), wed: nil, thu: nil, fri: nil, latest: nil, latestDay: nil, official: false))
        }
        for a in confirmed where a.team == (home ? homeLabel : awayLabel) {
            guard seen.insert(Self.playerKey(a.name)).inserted else { continue }
            out.append(Line(id: a.id, name: a.name, position: nil, injury: nil, status: a.status, note: a.detail,
                            wed: nil, thu: nil, fri: nil, latest: nil, latestDay: nil, official: false))
        }
        return out
    }

    private var shown: [Line] { lines(home: homeUp) }
    private var visible: [Line] { showAll ? shown : Array(shown.prefix(Self.shownLimit)) }
    private var hasPractice: Bool { shown.contains { $0.official } }
    private var hasDays: Bool { shown.contains { $0.wed != nil || $0.thu != nil || $0.fri != nil } }

    var body: some View {
        // Required college failures remain visible even when no names are listed.
        if requiresVerifiedCoverage || !lines(home: true).isEmpty || !lines(home: false).isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.horizontal, 18).padding(.bottom, 8)
                columns.padding(.horizontal, 18).padding(.bottom, 2)
                if requiresVerifiedCoverage && !coverageVerified {
                    pending(title: "AVAILABILITY DATA FAILED", sub: coverageFailure)
                }
                if shown.isEmpty {
                    if requiresVerifiedCoverage && coverageVerified {
                        pending(title: "NO ABSENCES REPORTED", sub: "The current sources list no absences for this team.")
                    }
                } else {
                    VStack(spacing: 0) {
                        ForEach(visible) { line in
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                            row(line)
                        }
                        if shown.count > Self.shownLimit {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                            Button {
                                withAnimation(.easeInOut(duration: 0.18)) { showAll.toggle() }
                            } label: {
                                HStack(spacing: 6) {
                                    Text(showAll ? "SHOW FEWER" : "SEE ALL \(shown.count)")
                                        .font(GaryFonts.data(10.5, .bold)).tracking(1.1)
                                    Image(systemName: "chevron.down")
                                        .font(.system(size: 8, weight: .bold))
                                        .rotationEffect(.degrees(showAll ? 180 : 0))
                                }
                                .foregroundStyle(GaryColors.gold)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(showAll ? "Show fewer players" : "See all \(shown.count) players")
                        }
                    }
                    .padding(.horizontal, 18)
                }
                if hasPractice { key.padding(.horizontal, 18).padding(.top, 10) }
                teamToggle.padding(.top, 12).padding(.bottom, 4).frame(maxWidth: .infinity)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(solidPanels ? GaryColors.panelFillOpaque : GaryColors.warmWhite.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(GaryColors.warmWhite.opacity(0.09), lineWidth: 1))
            )
            .padding(.horizontal, 16)
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(hasPractice ? "PRACTICE REPORT" : "THE INJURY REPORT")
                .font(GaryFonts.display(19)).tracking(1.2).foregroundStyle(GaryColors.gold)
            Spacer()
            Text("\(shown.count) LISTED")
                .font(GaryFonts.data(9.5, .semibold)).tracking(1.1).foregroundStyle(.white.opacity(0.42))
        }
    }

    private var columns: some View {
        HStack(spacing: 0) {
            Text("PLAYER").font(GaryFonts.data(9.5, .semibold)).tracking(1.1).foregroundStyle(.white.opacity(0.42))
            Spacer()
            if hasDays {
                ForEach(["WED", "THU", "FRI"], id: \.self) { d in
                    Text(d).font(GaryFonts.data(9.5, .semibold)).tracking(1.1).foregroundStyle(.white.opacity(0.42))
                        .frame(width: 30)
                }
            }
            // The status column sizes to its longest word; 108 is the floor.
            Text("STATUS").font(GaryFonts.data(9.5, .semibold)).tracking(1.1).foregroundStyle(.white.opacity(0.42))
                .frame(minWidth: 108, alignment: .trailing)
        }
    }

    @ViewBuilder private func dot(_ code: String?) -> some View {
        switch (code ?? "").uppercased() {
        case "FP":
            Circle().fill(Color(hex: "#63D17E")).frame(width: 10, height: 10)
        case "LP":
            ZStack {
                Circle().stroke(GaryColors.gold, lineWidth: 1.2)
                Circle().fill(GaryColors.gold).mask(alignment: .leading) { Rectangle().frame(width: 5) }
            }.frame(width: 10, height: 10)
        case "DNP":
            Circle().stroke(Color(hex: "#cf6b5b"), lineWidth: 1.2).frame(width: 10, height: 10)
        default:
            Text("–").font(GaryFonts.data(11)).foregroundStyle(.white.opacity(0.25))
        }
    }

    private func row(_ line: Line) -> some View {
        let isOpen = open.contains(line.id)
        return Button {
            guard line.note != nil else { return }
            withAnimation(.easeInOut(duration: 0.18)) {
                if isOpen { open.remove(line.id) } else { open.insert(line.id) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top, spacing: 0) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(line.name)
                                .font(GaryFonts.text(14.5, .semibold)).foregroundStyle(.white)
                                .fixedSize(horizontal: false, vertical: true)
                            if let pos = line.position, !pos.isEmpty {
                                Text(pos.uppercased())
                                    .font(GaryFonts.data(9.5, .bold)).foregroundStyle(.white.opacity(0.42))
                            }
                        }
                        if let injury = line.injury, !injury.isEmpty {
                            Text(injury).font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.55))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let latest = line.latest, let day = line.latestDay,
                           !["wed", "thu", "fri"].contains(day.lowercased()) {
                            Text("\(day.uppercased()) PRACTICE · \(latest.uppercased())")
                                .font(GaryFonts.data(10, .semibold))
                                .foregroundStyle(Self.statusColor(latest))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 6)
                    if hasDays {
                        ForEach(Array([line.wed, line.thu, line.fri].enumerated()), id: \.offset) { _, code in
                            dot(code).frame(width: 30)
                        }
                    }
                    HStack(spacing: 6) {
                        if let status = line.status, !status.isEmpty {
                            // One line, sized to the word: QUESTIONABLE never
                            // breaks into QUESTIONA / BLE (founder, Sep 21 2026).
                            Text(status.uppercased())
                                .font(GaryFonts.data(10.5, .bold)).tracking(1.1)
                                .foregroundStyle(Self.statusColor(status))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        } else {
                            Text("–").foregroundStyle(.white.opacity(0.25))
                                .accessibilityLabel("Game status not reported")
                        }
                        if line.note != nil {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.white.opacity(0.35))
                                .rotationEffect(.degrees(isOpen ? 180 : 0))
                        }
                    }
                    .frame(minWidth: 108, alignment: .trailing)
                }
                if isOpen, let note = line.note {
                    Text(note)
                        .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.62))
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var key: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 14) {
                HStack(spacing: 5) { dot("FP"); Text("FULL") }
                HStack(spacing: 5) { dot("LP"); Text("LIMITED") }
                HStack(spacing: 5) { dot("DNP"); Text("DID NOT PRACTICE") }
            }
            Text("PRACTICE AND GAME STATUS · BDL")
                .tracking(1.1)
        }
        .font(GaryFonts.data(9.5, .semibold)).foregroundStyle(.white.opacity(0.42))
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

    private func pending(title: String, sub: String) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(GaryFonts.mono(14, bold: true)).tracking(2.5).foregroundStyle(GaryColors.gold)
                .multilineTextAlignment(.center)
            Text(sub).font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.5))
        }
        .padding(.vertical, 22).padding(.horizontal, 26)
        .frame(maxWidth: .infinity)
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
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 16)
    }
}

private extension View {
    /// The same container MLB's game page wears (founder, Sep 21 2026: "the
    /// player cards and team cards for the NFL should be the exact same
    /// background color and design as they are for MLB"). `accent` is kept
    /// for call-site compatibility; the panel no longer tints by sport.
    func footballPanel(accent: Color) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                    .fill(GaryColors.panelFillOpaque)
                    .overlay(
                        RoundedRectangle(cornerRadius: 17, style: .continuous)
                            .stroke(GaryColors.warmWhite.opacity(0.09), lineWidth: 1)
                    )
            )
    }
}

// MARK: - Grounded football next slate (NCAAF + NFL — one card, Aug 24 2026)

struct FootballNextSlatePreview: View {
    let signal: Signal
    let accent: Color
    @State private var showAllMatchups = false

    private var meta: SwapMeta? { signal.nextSlate }
    private var matchups: [FootballNextSlateGame] {
        let rows = (meta?.next_slate_games ?? []).filter {
            !$0.game_id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && $0.scheduled_date == meta?.scheduled_date
        }
        // Conflicting provider IDs are not two separate matchup rows.
        guard Set(rows.map(\.game_id)).count == rows.count else { return [] }
        return rows
    }
    private var visibleMatchups: [FootballNextSlateGame] {
        showAllMatchups ? matchups : Array(matchups.prefix(3))
    }
    private var checkedLabel: String? {
        guard let raw = meta?.next_slate_checked_at, let date = parseISO8601(raw) else { return nil }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        display.timeZone = TimeZone(identifier: "America/New_York")
        display.dateFormat = "MMM d, h:mm a"
        return "Schedule checked \(display.string(from: date)) ET"
    }

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
        guard let count = meta?.game_count, count > 0 else { return "DETAILS PENDING" }
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
                    .font(.caption.weight(.semibold))
                    .tracking(0.8)
                    .foregroundStyle(accent)
                Spacer(minLength: 8)
                Text(countLabel)
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.48))
            }
            Text(dateLabel)
                .font(matchups.isEmpty ? .title2.weight(.bold) : .subheadline.weight(.semibold))
                .foregroundStyle(GaryColors.warmWhite)
            if matchups.isEmpty {
                // Older published rows have counts/clocks only. Keep those
                // grounded labels until the next scheduled refresh adds teams.
                HStack(spacing: 8) {
                    Text(kickoffLabel)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.white.opacity(0.68))
                    if let precisionLabel {
                        Text("· \(precisionLabel)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(GaryColors.gold.opacity(0.8))
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(visibleMatchups) { game in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(game.matchupLabel)
                                .font(matchups.count == 1 ? .title2.weight(.bold) : .headline)
                                .foregroundStyle(GaryColors.warmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(game.kickoffLabel)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                    if matchups.count > 3 {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) { showAllMatchups.toggle() }
                        } label: {
                            Text(showAllMatchups ? "Show fewer matchups" : "Show \(matchups.count - 3) more matchups")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(accent)
                        }
                        .buttonStyle(.plain)
                    }
                    if let count = meta?.game_count, count > matchups.count {
                        Text("\(count - matchups.count) matchup details pending")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.55))
                    }
                }
            }
            if !signal.detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                DisclosureGroup("Schedule details") {
                    Text(signal.detail)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.55))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)
                }
                .font(.caption.weight(.medium))
                .tint(accent)
            }
            if let checkedLabel {
                Text(checkedLabel)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.42))
                    .fixedSize(horizontal: false, vertical: true)
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
            case .theSweat, .afterGary, .marketRange, .practiceReport: return false
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
