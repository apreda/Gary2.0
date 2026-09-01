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

    /// THE TRACK RECORD source — Gary's own graded history with these two
    /// franchises (founder, Aug 20: sections ESPN can't run; the receipts
    /// ARE the app). Football era only, so the window starts at camp.
    @State private var trackResults: [GameResult] = []

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

    private var saturdayRead: String? {
        FootballEvidence.saturdayRead(from: primaryPick)
    }

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

    private var marketRangeSignal: Signal? {
        return edges.first(where: {
            belongsToExactGame($0)
                && FootballProofContract.isRenderableMarketRange($0, slateRow: row)
        })
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

    private func morningRows(_ kinds: Set<SignalKind>, cap: Int) -> [Signal] {
        Array(edges.filter { kinds.contains($0.kind) && matchesThisGame($0) }.prefix(cap))
    }

    private var qbRows: [Signal] { morningRows([.quarterback], cap: 2) }
    private var injuryWireRows: [Signal] { morningRows([.injury], cap: 4) }
    private var numberRailRows: [Signal] {
        morningRows([.paceScript, .turnoverEdge, .explosivePlay, .trenches], cap: 5)
    }
    private var standingsRows: [Signal] { morningRows([.situational], cap: 2) }
    private var mismatchRow: Signal? { morningRows([.mismatch], cap: 1).first }
    /// THE SERIES (Aug 27 2026): the real prior meetings between the two
    /// franchises, from the head-to-head lane. One row per game by contract.
    private var seriesRow: Signal? { morningRows([.h2h], cap: 1).first }

    // THE TRACK RECORD: Gary's graded record on each franchise's games,
    // the run he's on with them, and his last call — from game_results,
    // the same public ledger every record on the site reads.
    struct TeamTrack {
        let label: String
        let wins: Int
        let losses: Int
        let pushes: Int
        let runLabel: String?
        let lastLine: String?
        var record: String { "\(wins)-\(losses)\(pushes > 0 ? "-\(pushes)" : "")" }
    }

    private func teamTrack(sideLabel: String, fullName: String?) -> TeamTrack? {
        let keys = [sideLabel, (fullName ?? "").components(separatedBy: " ").last ?? ""]
            .map { $0.lowercased() }.filter { !$0.isEmpty }
        let mine = trackResults.filter { r in
            guard (r.league ?? "").uppercased() == normalizedLeague,
                  let m = r.matchup?.lowercased() else { return false }
            return keys.contains(where: { m.contains($0) })
        }
        let decided = mine.filter { ["won", "lost", "push"].contains(($0.result ?? "").lowercased()) }
            .sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }
        guard !decided.isEmpty else { return nil }
        let wins = decided.filter { $0.result?.lowercased() == "won" }.count
        let losses = decided.filter { $0.result?.lowercased() == "lost" }.count
        let pushes = decided.filter { $0.result?.lowercased() == "push" }.count
        let winLoss = decided.filter { ["won", "lost"].contains(($0.result ?? "").lowercased()) }
        var runLabel: String? = nil
        if let first = winLoss.first {
            let kind = first.result?.lowercased() == "won" ? "W" : "L"
            let len = winLoss.prefix(while: { ($0.result ?? "").lowercased() == first.result?.lowercased() }).count
            runLabel = "\(kind)\(len)"
        }
        var lastLine: String? = nil
        if let last = decided.first, let pick = last.pick_text, !pick.isEmpty {
            let verdict = (last.result ?? "").uppercased()
            let day = (last.game_date ?? "").suffix(5).replacingOccurrences(of: "-", with: "/")
            lastLine = "LAST: \(verdict) \(day) — \(pick)"
        }
        return TeamTrack(label: sideLabel, wins: wins, losses: losses, pushes: pushes,
                         runLabel: runLabel, lastLine: lastLine)
    }

    private var trackRecords: [TeamTrack] {
        [teamTrack(sideLabel: sides.away, fullName: primaryPick?.awayTeam ?? row?.away_team),
         teamTrack(sideLabel: sides.home, fullName: primaryPick?.homeTeam ?? row?.home_team)]
            .compactMap { $0 }
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

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            if isCollege {
                if let saturdayRead {
                    FootballSaturdayReadSection(read: saturdayRead, accent: accent)
                }

                // Same morning layer as NFL — renders only when the pipeline
                // grows NCAAF computers, empty stays honestly empty.
                if !newsLines.isEmpty {
                    FootballNewsSection(lines: newsLines, accent: accent)
                }
                if !qbRows.isEmpty {
                    FootballQBSection(rows: qbRows, accent: accent)
                }
                if let mismatchRow {
                    FootballMismatchSection(signal: mismatchRow, accent: accent)
                }
                if availability.isEmpty, !injuryWireRows.isEmpty {
                    FootballInjuryWireSection(rows: injuryWireRows, accent: accent)
                }
                if !trackRecords.isEmpty {
                    FootballTrackRecordSection(tracks: trackRecords, accent: accent)
                }
                if !numberRailRows.isEmpty {
                    FootballNumbersSection(rows: numberRailRows, accent: accent)
                }
                if !standingsRows.isEmpty {
                    FootballStandingsSection(rows: standingsRows, accent: accent, title: "The Rankings")
                }
                if let seriesRow {
                    FootballStandingsSection(rows: [seriesRow], accent: accent, title: "The Series")
                }

                if !shapeRows.isEmpty {
                    FootballGameShapeSection(rows: shapeRows, accent: accent)
                }

                if !availability.isEmpty {
                    FootballAvailabilitySection(rows: availability, accent: accent)
                }

                if let numberSignal {
                    FootballMarketSection(title: "Gary's Number", signal: numberSignal, accent: accent)
                }

                if let marketRangeSignal {
                    FootballMarketRangeSection(signal: marketRangeSignal, accent: accent)
                }
            } else {
                // The morning layer leads: news, the QB duel, the injury
                // wire, the numbers rail, the standings — live from 6 AM.
                if !newsLines.isEmpty {
                    FootballNewsSection(lines: newsLines, accent: accent)
                }

                if !qbRows.isEmpty {
                    FootballQBSection(rows: qbRows, accent: accent)
                }

                if let mismatchRow {
                    FootballMismatchSection(signal: mismatchRow, accent: accent)
                }

                // The dossier's availability block (with the pick, below)
                // supersedes the raw wire once Gary has spoken — each fact
                // lives once on the page.
                if availability.isEmpty, !injuryWireRows.isEmpty {
                    FootballInjuryWireSection(rows: injuryWireRows, accent: accent)
                }

                if !trackRecords.isEmpty {
                    FootballTrackRecordSection(tracks: trackRecords, accent: accent)
                }

                if !numberRailRows.isEmpty {
                    FootballNumbersSection(rows: numberRailRows, accent: accent)
                }

                if !standingsRows.isEmpty {
                    FootballStandingsSection(rows: standingsRows, accent: accent)
                }
                if let seriesRow {
                    FootballStandingsSection(rows: [seriesRow], accent: accent, title: "The Series")
                }

                if let numberSignal {
                    FootballMarketSection(title: "Gary's Number", signal: numberSignal, accent: accent)
                }

                if !shapeRows.isEmpty {
                    FootballGameShapeSection(rows: shapeRows, accent: accent)
                }

                if !availability.isEmpty {
                    FootballAvailabilitySection(rows: availability, accent: accent)
                }
            }

            // PLAYER INTEL (Aug 27 2026): the football packs now build, and the
            // section is the SAME one MLB pages mount — scoped by exact game id
            // (college abbreviations have no matchup-keyword join). It hides
            // itself entirely on a day or game without packs.
            PlayerIntelSection(matchup: matchup, gameId: exactGameID)

            if !sweatSignals.isEmpty {
                FootballSweatSection(signals: sweatSignals, accent: accent)
            }
        }
        .task { await loadTrackRecord() }
    }

    /// One cached ledger read per page life — the same public game_results
    /// every record on the site derives from. Football-era window; an empty
    /// or failed read stores nothing (day-cache law). Preseason never counts
    /// toward Gary's record (founder law, Aug 21 2026), so this section stays
    /// dark until the first regular-season call grades.
    private func loadTrackRecord() async {
        guard trackResults.isEmpty else { return }
        guard let rows = try? await SupabaseAPI.fetchAllGameResults(since: "2026-08-01") else { return }
        let mine = rows.countable.filter { ($0.league ?? "").uppercased() == normalizedLeague }
        if !mine.isEmpty { trackResults = mine }
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

        let away = rows(injuries.away ?? [], team: awayLabel)
        let home = rows(injuries.home ?? [], team: homeLabel)
        var output: [Availability] = []
        var seen = Set<String>()
        var index = 0

        while output.count < 4 && (index < away.count || index < home.count) {
            for item in [index < away.count ? away[index] : nil,
                         index < home.count ? home[index] : nil].compactMap({ $0 }) {
                let key = item.name.lowercased()
                if seen.insert(key).inserted { output.append(item) }
                if output.count == 4 { break }
            }
            index += 1
        }
        return output
    }

    static func saturdayRead(from pick: GaryPick?) -> String? {
        guard var read = clean(pick?.game_read) else { return nil }
        for prefix in ["GARY'S TAKE:", "GARY’S TAKE:", "GARY'S TAKE", "GARY’S TAKE"] {
            if read.uppercased().hasPrefix(prefix) {
                read = String(read.dropFirst(prefix.count))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                break
            }
        }
        return clean(read)
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

private struct FootballMarketSection: View {
    let title: String
    let signal: Signal
    let accent: Color

    private var meta: SwapMeta? { signal.afterGary }

    private var selection: String {
        meta?.pick_label?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? "—"
    }

    private func number(_ value: Double) -> String {
        let body = value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        return value > 0 ? "+\(body)" : body
    }

    private func primary(_ snapshot: FootballMarketSnapshot?) -> String? {
        if let line = snapshot?.line { return number(line) }
        if let odds = snapshot?.odds { return number(odds) }
        return nil
    }

    private func price(_ snapshot: FootballMarketSnapshot?) -> String? {
        guard snapshot?.line != nil, let odds = snapshot?.odds else { return nil }
        return number(odds)
    }

    private var valueText: String? {
        guard let movement = meta?.movement else { return nil }
        let advantage = (movement.advantage ?? "same").lowercased()
        guard advantage != "same", let value = movement.primary_value, value > 0 else { return "NO MOVE" }
        let owner = advantage == "gary" ? "GARY" : "NOW"
        let unit = (movement.primary_unit ?? "").lowercased() == "probability_points" ? "PP" : "PTS"
        return "\(owner) +\(number(value).replacingOccurrences(of: "+", with: "")) \(unit)"
    }

    private var receiptLine: String? {
        var parts: [String] = []
        if let vendor = meta?.vendor?.trimmingCharacters(in: .whitespacesAndNewlines), !vendor.isEmpty {
            parts.append(vendor.uppercased())
        }
        if meta?.footballMarketIsClosed == true {
            parts.append("LAST PREGAME")
        } else if meta?.market_state?.lowercased() == "pregame" {
            parts.append("SAME BOOK")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: title, trailing: receiptLine)

            VStack(alignment: .leading, spacing: 13) {
                if !selection.isEmpty {
                    Text(selection)
                        .font(GaryFonts.display(24))
                        .foregroundStyle(GaryColors.warmWhite)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }

                if let published = primary(meta?.published),
                   let current = primary(meta?.current) {
                    HStack(alignment: .center, spacing: 12) {
                        MarketQuote(label: "PUBLISHED", number: published,
                                    price: price(meta?.published), trailing: false,
                                    color: GaryColors.warmWhite)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white.opacity(0.34))
                        MarketQuote(label: meta?.footballMarketIsClosed == true ? "LAST PREGAME" : "CURRENT", number: current,
                                    price: price(meta?.current), trailing: true,
                                    color: accent)
                    }
                }

                if let valueText {
                    Text(valueText)
                        .font(GaryFonts.mono(10, bold: true))
                        .tracking(0.7)
                        .foregroundStyle(accent)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(accent.opacity(0.12)))
                }
            }
            .padding(15)
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private struct MarketQuote: View {
    let label: String
    let number: String
    let price: String?
    let trailing: Bool
    let color: Color

    var body: some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 3) {
            Text(label)
                .font(GaryFonts.mono(8.5, bold: true))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.42))
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(number)
                    .font(GaryFonts.display(32))
                    .foregroundStyle(color)
                if let price {
                    Text(price)
                        .font(GaryFonts.data(10.5, .bold))
                        .foregroundStyle(.white.opacity(0.48))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: trailing ? .trailing : .leading)
    }
}

private struct FootballMarketRangeSection: View {
    let signal: Signal
    let accent: Color

    private var meta: SwapMeta? { signal.marketRange }

    private func number(_ value: Double, signed: Bool) -> String {
        let body = value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        return signed && value > 0 ? "+\(body)" : body
    }

    private var isSpread: Bool { (meta?.market ?? "").lowercased() == "spread" }

    private var marketLabel: String {
        isSpread ? "HOME SPREAD" : "TOTAL"
    }

    private var bookLabel: String? {
        guard let count = meta?.book_count else { return nil }
        return "\(count) \(count == 1 ? "BOOK" : "BOOKS")"
    }

    private var rangeLabel: String? {
        guard let range = meta?.range else { return nil }
        return "\(number(range, signed: false)) PT RANGE"
    }

    var body: some View {
        if let low = meta?.low, let high = meta?.high {
            VStack(alignment: .leading, spacing: 10) {
                FootballSectionTitle(title: "Market Range", trailing: bookLabel)

                VStack(spacing: 12) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(marketLabel)
                            .font(GaryFonts.mono(9, bold: true))
                            .tracking(0.75)
                            .foregroundStyle(accent)
                        Spacer(minLength: 8)
                        if let rangeLabel {
                            Text(rangeLabel)
                                .font(GaryFonts.mono(8.5, bold: true))
                                .tracking(0.55)
                                .foregroundStyle(.white.opacity(0.45))
                        }
                    }

                    HStack(alignment: .center, spacing: 11) {
                        RangeQuote(label: "LOW", value: number(low, signed: isSpread),
                                   trailing: false)
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.16), accent.opacity(0.8)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: 72, height: 3)
                            .overlay {
                                HStack {
                                    Circle().fill(Color.white.opacity(0.65)).frame(width: 7, height: 7)
                                    Spacer()
                                    Circle().fill(accent).frame(width: 7, height: 7)
                                }
                            }
                        RangeQuote(label: "HIGH", value: number(high, signed: isSpread),
                                   trailing: true)
                    }

                    if let vendors = meta?.vendors, !vendors.isEmpty {
                        Text(vendors.prefix(4).map { $0.uppercased() }.joined(separator: " · "))
                            .font(GaryFonts.mono(7.5, bold: true))
                            .tracking(0.45)
                            .foregroundStyle(.white.opacity(0.34))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                    }
                }
                .padding(15)
                .footballPanel(accent: accent)
                .padding(.horizontal, 16)
            }
        }
    }
}

private struct RangeQuote: View {
    let label: String
    let value: String
    let trailing: Bool

    var body: some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
            Text(label)
                .font(GaryFonts.mono(8, bold: true))
                .tracking(0.7)
                .foregroundStyle(.white.opacity(0.4))
            Text(value)
                .font(GaryFonts.display(29))
                .foregroundStyle(GaryColors.warmWhite)
        }
        .frame(maxWidth: .infinity, alignment: trailing ? .trailing : .leading)
    }
}

private struct FootballGameShapeSection: View {
    let rows: [FootballEvidence.ShapeRow]
    let accent: Color

    private var scope: String? { FootballEvidence.commonScope(in: rows) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "Game Shape", trailing: scope)

            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 10) {
                    Text(rows[0].awayLabel)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "football.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(accent.opacity(0.72))
                    Text(rows[0].homeLabel)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .font(GaryFonts.mono(10, bold: true))
                .tracking(0.75)
                .foregroundStyle(.white.opacity(0.55))
                .padding(.horizontal, 14)
                .padding(.vertical, 11)

                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)

                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    VStack(spacing: 7) {
                        Text(row.label)
                            .font(GaryFonts.mono(8.5, bold: true))
                            .tracking(0.75)
                            .foregroundStyle(GaryColors.gold.opacity(0.8))
                        HStack(spacing: 10) {
                            Text(row.away)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            FootballFieldRule(accent: accent)
                                .frame(width: 86)
                            Text(row.home)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .font(GaryFonts.data(15, .bold))
                        .foregroundStyle(GaryColors.warmWhite)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private struct FootballFieldRule: View {
    let accent: Color

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<7, id: \.self) { index in
                Rectangle()
                    .fill(index == 3 ? accent.opacity(0.7) : Color.white.opacity(0.18))
                    .frame(width: index == 3 ? 2 : 1, height: index == 3 ? 9 : 5)
                if index < 6 {
                    Rectangle().fill(Color.white.opacity(0.13)).frame(height: 1)
                }
            }
        }
        .frame(height: 9)
    }
}

private struct FootballAvailabilitySection: View {
    let rows: [FootballEvidence.Availability]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "Availability")

            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, player in
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline, spacing: 7) {
                                Text(player.name.uppercased())
                                    .font(GaryFonts.mono(11, bold: true))
                                    .tracking(0.45)
                                    .foregroundStyle(GaryColors.warmWhite)
                                if let status = player.status {
                                    Text(status)
                                        .font(GaryFonts.mono(8, bold: true))
                                        .tracking(0.55)
                                        .foregroundStyle(statusColor(status))
                                }
                            }
                            Text(player.team)
                                .font(GaryFonts.mono(8.5, bold: true))
                                .tracking(0.65)
                                .foregroundStyle(accent.opacity(0.82))
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }

    private func statusColor(_ status: String) -> Color {
        let value = status.lowercased()
        if value.contains("out") || value == "ir" || value.contains("doubt") {
            return HubPalette.red
        }
        if value.contains("question") || value.contains("day") {
            return GaryColors.gold
        }
        return .white.opacity(0.58)
    }
}

private struct FootballSaturdayReadSection: View {
    let read: String
    let accent: Color
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "Saturday Read")
            VStack(alignment: .leading, spacing: 10) {
                Text(read)
                    .font(GaryFonts.text(13.5, .medium))
                    .foregroundStyle(.white.opacity(0.86))
                    .lineSpacing(3)
                    .lineLimit(expanded ? nil : 5)
                    .fixedSize(horizontal: false, vertical: true)

                if read.count > 240 {
                    Button { withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() } } label: {
                        Text(expanded ? "CLOSE" : "FULL READ")
                            .font(GaryFonts.mono(8.5, bold: true))
                            .tracking(0.8)
                            .foregroundStyle(accent)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(15)
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Unit-safe live proof

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
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The Sweat", trailing: summary)
            VStack(spacing: 0) {
                ForEach(Array(signals.enumerated()), id: \.element.id) { index, signal in
                    FootballSweatRow(signal: signal, accent: accent)
                    if index < signals.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
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

private struct FootballQuietState: View {
    let text: String

    var body: some View {
        Text(text)
            .font(GaryFonts.text(12.5))
            .foregroundStyle(.white.opacity(0.55))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
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

// MARK: - Football fantasy desks

struct FootballFantasyPage: View {
    let league: HubLeagueSel
    let signals: [Signal]
    let loaded: Bool
    let onTap: (Signal) -> Void

    private var accent: Color {
        league == .ncaaf ? Sport.ncaaf.accentColor : Sport.nfl.accentColor
    }
    private var isNFL: Bool { league == .nfl }

    private struct Lane: Identifiable {
        let id: String
        let title: String
        let kinds: Set<SignalKind>
    }

    fileprivate struct PositionCount: Identifiable {
        let position: String
        let count: Int
        var id: String { position }
    }

    private var lanes: [Lane] {
        if isNFL {
            return [
                Lane(id: "role", title: "Role Watch", kinds: [.fantasyUsage]),
                Lane(id: "scoring", title: "Scoring Spots", kinds: [.fantasyRedZone, .fantasyMatchup]),
                Lane(id: "momentum", title: "Momentum", kinds: [.fantasyTrend]),
            ]
        }
        return [
            Lane(id: "volume", title: "Volume Leaders", kinds: [.fantasyUsage]),
            Lane(id: "scoring", title: "Scoring Spots", kinds: [.fantasyRedZone, .fantasyMatchup]),
        ]
    }

    private var visibleKinds: Set<SignalKind> {
        lanes.reduce(into: Set<SignalKind>()) { $0.formUnion($1.kinds) }
    }

    private var visibleSignals: [Signal] {
        signals.filter { visibleKinds.contains($0.kind) }
    }

    private var nextSlate: Signal? {
        isNFL ? nil : signals.first { $0.kind == .nextSlate }
    }

    private var positionCounts: [PositionCount] {
        var players: [String: Set<String>] = [:]
        for signal in visibleSignals {
            guard let raw = signal.position?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { continue }
            let position = raw.uppercased()
            players[position, default: []].insert(FootballFantasyEvidence.playerTitle(for: signal).lowercased())
        }
        let order = ["QB", "RB", "WR", "TE", "K"]
        return players.map { PositionCount(position: $0.key, count: $0.value.count) }
            .sorted {
                let left = order.firstIndex(of: $0.position) ?? Int.max
                let right = order.firstIndex(of: $1.position) ?? Int.max
                return left == right ? $0.position < $1.position : left < right
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            if !loaded {
                HStack { Spacer(); ProgressView().tint(accent); Spacer() }
                    .padding(.vertical, 36)
            } else if visibleSignals.isEmpty, let nextSlate {
                FootballNextSlatePreview(signal: nextSlate, accent: accent)
            } else if visibleSignals.isEmpty {
                FootballQuietState(text: isNFL ? "No NFL fantasy reads yet." : "No college player reads yet.")
            } else {
                if !isNFL, !positionCounts.isEmpty {
                    FootballPositionSummary(counts: positionCounts, accent: accent)
                }

                ForEach(lanes) { lane in
                    let rows = visibleSignals.filter { lane.kinds.contains($0.kind) }
                    if !rows.isEmpty {
                        FootballFantasyLane(title: lane.title, rows: rows,
                                            accent: accent, onTap: onTap)
                    }
                }
            }
        }
    }
}

private struct FootballPositionSummary: View {
    let counts: [FootballFantasyPage.PositionCount]
    let accent: Color

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
            ForEach(counts) { item in
                HStack(spacing: 7) {
                    Text(item.position)
                        .font(GaryFonts.mono(9, bold: true))
                        .tracking(0.6)
                        .foregroundStyle(accent)
                    Spacer(minLength: 0)
                    Text(String(item.count))
                        .font(GaryFonts.data(12, .bold))
                        .foregroundStyle(GaryColors.warmWhite)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 9)
                .background(Capsule().fill(Color.white.opacity(0.045)))
            }
        }
        .padding(.horizontal, 18)
    }
}

private struct FootballFantasyLane: View {
    let title: String
    let rows: [Signal]
    let accent: Color
    let onTap: (Signal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: title)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, signal in
                    Button { onTap(signal) } label: {
                        FootballFantasyRow(signal: signal, accent: accent)
                    }
                    .buttonStyle(.plain)
                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private enum FootballFantasyEvidence {
    static func playerTitle(for signal: Signal) -> String {
        let headline = signal.headline.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !headline.isEmpty else { return "PLAYER" }

        if let colon = headline.firstIndex(of: ":") {
            let before = String(headline[..<colon]).trimmingCharacters(in: .whitespacesAndNewlines)
            let after = String(headline[headline.index(after: colon)...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if before.lowercased().hasSuffix("baseline"),
               let logged = after.range(of: " logged ", options: [.caseInsensitive]) {
                return String(after[..<logged.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if !before.isEmpty { return before }
        }

        for marker in ["'s ", " is at ", " has ", " logged "] {
            if let range = headline.range(of: marker, options: [.caseInsensitive]) {
                let name = String(headline[..<range.lowerBound])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty { return name }
            }
        }
        return headline
    }

    static func baselineLabel(for signal: Signal) -> String? {
        let headline = signal.headline.trimmingCharacters(in: .whitespacesAndNewlines)
        guard headline.range(of: "baseline", options: [.caseInsensitive]) != nil else { return nil }
        if let year = headline.range(of: #"\b(?:19|20)\d{2}\b"#, options: [.regularExpression]) {
            return "\(headline[year]) BASELINE"
        }
        return "PRIOR BASELINE"
    }
}

private struct FootballFantasyRow: View {
    let signal: Signal
    let accent: Color

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(FootballFantasyEvidence.playerTitle(for: signal))
                .font(GaryFonts.text(14.5, .semibold))
                .foregroundStyle(GaryColors.warmWhite)
                .lineLimit(1)
            if let position = signal.position, !position.isEmpty {
                Text(position.uppercased())
                    .font(GaryFonts.data(9.5, .bold))
                    .foregroundStyle(accent.opacity(0.8))
            }
            Spacer(minLength: 8)
            if !signal.value.isEmpty {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(signal.value)
                        .font(GaryFonts.data(15, .bold))
                        .foregroundStyle(accent)
                        .lineLimit(1)
                    if let baseline = FootballFantasyEvidence.baselineLabel(for: signal) {
                        Text(baseline)
                            .font(GaryFonts.data(8.5, .bold))
                            .tracking(0.55)
                            .foregroundStyle(.white.opacity(0.44))
                            .lineLimit(1)
                    }
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.28))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

// MARK: - Morning layer sections (Aug 20)
// The football page's from-6AM content: THE NEWS off the wire, THE
// QUARTERBACKS duel, THE INJURY WIRE, THE NUMBERS rail, THE STANDINGS —
// each reads the day's insight_connections rows (Gary's read rides in
// signal.detail) and renders in the established football grammar:
// FootballSectionTitle + footballPanel + hairline rows.

private struct FootballNewsSection: View {
    let lines: [String]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The News")
            Text(lines.joined(separator: " · "))
                .font(GaryFonts.text(13.5))
                .foregroundStyle(.white.opacity(0.88))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .footballPanel(accent: accent)
                .padding(.horizontal, 16)
        }
    }
}

private struct FootballQBSection: View {
    let rows: [Signal]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The Quarterbacks")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, s in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(s.headline)
                                .font(GaryFonts.mono(12, bold: true))
                                .tracking(0.4)
                                .foregroundStyle(GaryColors.warmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            if !s.value.isEmpty {
                                Text(s.value)
                                    .font(GaryFonts.mono(12, bold: true))
                                    .foregroundStyle(accent.opacity(0.9))
                                    .lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }
                        if !s.detail.isEmpty {
                            Text(s.detail)
                                .font(GaryFonts.text(13))
                                .foregroundStyle(.white.opacity(0.62))
                                .lineSpacing(3.5)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)

                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private struct FootballInjuryWireSection: View {
    let rows: [Signal]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The Injury Wire")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, s in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(s.headline)
                                .font(GaryFonts.mono(11, bold: true))
                                .tracking(0.4)
                                .foregroundStyle(GaryColors.warmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            if !s.value.isEmpty {
                                Text(s.value.uppercased())
                                    .font(GaryFonts.mono(8.5, bold: true))
                                    .tracking(0.6)
                                    .foregroundStyle(s.tone == .bad ? HubPalette.red : GaryColors.gold)
                                    .lineLimit(1)
                            }
                        }
                        if !s.detail.isEmpty {
                            Text(s.detail)
                                .font(GaryFonts.text(12.5))
                                .foregroundStyle(.white.opacity(0.58))
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private struct FootballNumbersSection: View {
    let rows: [Signal]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The Numbers")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, s in
                    HStack(alignment: .center, spacing: 14) {
                        Text(s.value.isEmpty ? "—" : s.value)
                            .font(GaryFonts.display(22))
                            .foregroundStyle(s.tone == .bad ? HubPalette.red : GaryColors.gold)
                            .lineLimit(1).minimumScaleFactor(0.6)
                            .frame(width: 74, alignment: .leading)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(s.headline)
                                .font(GaryFonts.text(13, .semibold))
                                .foregroundStyle(.white.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                            if !s.detail.isEmpty {
                                Text(s.detail)
                                    .font(GaryFonts.text(12))
                                    .foregroundStyle(.white.opacity(0.5))
                                    .lineSpacing(2.5)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private struct FootballStandingsSection: View {
    let rows: [Signal]
    let accent: Color
    /// College's situational truth is the AP poll, not a standings table —
    /// the section wears the honest name per league.
    var title: String = "The Standings"

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: title)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, s in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(s.headline)
                                .font(GaryFonts.text(13, .semibold))
                                .foregroundStyle(.white.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            if !s.value.isEmpty {
                                Text(s.value)
                                    .font(GaryFonts.mono(12, bold: true))
                                    .foregroundStyle(GaryColors.gold)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }
                        if !s.detail.isEmpty {
                            Text(s.detail)
                                .font(GaryFonts.text(12.5))
                                .foregroundStyle(.white.opacity(0.58))
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)

                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - THE MISMATCH + THE TRACK RECORD (Aug 20, founder's two-new-sections order)

// THE MISMATCH — the game's single widest unit gap, named as a collision.
// One computed row per game (footballMismatch.js, same verified team boxes
// as the numbers rail); Gary's read rides in signal.detail.
private struct FootballMismatchSection: View {
    let signal: Signal
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The Mismatch")
            VStack(alignment: .leading, spacing: 8) {
                Text(signal.headline)
                    .font(GaryFonts.text(15, .semibold))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                if !signal.value.isEmpty {
                    Text(signal.value)
                        .font(GaryFonts.display(24)).tracking(0.5)
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
                if !signal.detail.isEmpty {
                    Text(signal.detail)
                        .font(GaryFonts.text(13))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineSpacing(3.5)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

// THE TRACK RECORD — Gary's own graded history with each franchise: his
// record on their games, the run he's riding with them, and his last call
// with its verdict. The one section no other outlet can print.
private struct FootballTrackRecordSection: View {
    let tracks: [FootballGameIntelView.TeamTrack]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionTitle(title: "The Track Record", trailing: "GARY ON THESE TEAMS")
            HStack(spacing: 8) {
                ForEach(Array(tracks.enumerated()), id: \.offset) { _, track in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(track.label.uppercased())
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.5))
                        HStack(alignment: .firstTextBaseline, spacing: 7) {
                            Text(track.record)
                                .font(GaryFonts.text(22, .heavy))
                                .foregroundStyle(GaryColors.warmWhite)
                            if let run = track.runLabel {
                                Text(run)
                                    .font(GaryFonts.mono(11, bold: true))
                                    .foregroundStyle(run.hasPrefix("W") ? GaryColors.gold : HubPalette.red)
                            }
                        }
                        if let last = track.lastLine {
                            Text(last)
                                .font(GaryFonts.mono(8.5)).tracking(0.3)
                                .foregroundStyle(.white.opacity(0.45))
                                .lineLimit(2).minimumScaleFactor(0.8)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .footballPanel(accent: accent)
                }
            }
            .padding(.horizontal, 16)
        }
    }
}
