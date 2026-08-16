import SwiftUI

// MARK: - Football game intelligence
//
// NFL and NCAAF game pages use the same pick cards as every other sport. This
// file owns only the evidence that follows those cards. Every row below comes
// from the pick payload, today's slate row, or insight_connections. A missing
// fact stays missing; the UI never manufactures a league average or depth-chart
// claim to fill a panel.

struct FootballGameIntelView: View {
    let league: String
    let matchup: String
    let picks: [GaryPick]
    let props: [PropPick]
    let row: TomorrowBoardRow?
    let edges: [Signal]

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
        return (FootballEvidence.sideLabel(away, league: normalizedLeague),
                FootballEvidence.sideLabel(home, league: normalizedLeague))
    }

    private var trenchStats: [FootballEvidence.Pair] {
        FootballEvidence.pairs(
            from: statData,
            matching: FootballEvidence.trenchTokens,
            awayLabel: sides.away,
            homeLabel: sides.home,
            limit: 5
        )
    }

    private var trenchEdges: [Signal] {
        edges.filter { [.trenches, .passRush].contains($0.kind) }
    }

    private var bigNumbers: [FootballEvidence.BigNumber] {
        FootballEvidence.bigNumbers(
            league: normalizedLeague,
            row: row,
            stats: statData,
            awayLabel: sides.away,
            homeLabel: sides.home
        )
    }

    private var fieldSignals: [Signal] {
        edges.filter { [.quarterback, .injury].contains($0.kind) }
    }

    private var edgeSignals: [Signal] {
        let reserved: Set<SignalKind> = [
            .h2h, .trenches, .passRush, .quarterback, .injury,
            .theSweat, .afterGary,
            .fantasyPickups, .twoStart, .closerWatch, .returnWatch, .cutList,
            .fantasyUsage, .fantasyRedZone, .fantasyMatchup, .fantasyTrend,
        ]
        return edges.filter { !reserved.contains($0.kind) }
    }

    private var sweatSignals: [Signal] {
        Array(edges.filter { $0.kind == .theSweat }.prefix(4))
    }

    private var personnel: [FootballEvidence.Personnel] {
        FootballEvidence.personnel(from: primaryPick, props: props,
                                   awayLabel: sides.away, homeLabel: sides.home)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !trenchStats.isEmpty || !trenchEdges.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    if !trenchStats.isEmpty {
                        FootballComparisonSection(
                            title: "The Trenches",
                            rows: trenchStats,
                            accent: accent
                        )
                    } else {
                        FootballSectionHeading(title: "The Trenches", accent: accent)
                    }

                    if !trenchEdges.isEmpty {
                        FootballSignalSection(signals: trenchEdges, accent: accent)
                    }
                }
            }

            if !bigNumbers.isEmpty {
                FootballBigNumbersSection(rows: bigNumbers, accent: accent)
            }

            // The existing season-series ledger remains the one shared H2H
            // component. Football merely places it in its correct page order.
            GameH2HSection(edges: edges)

            if !personnel.isEmpty || !fieldSignals.isEmpty {
                FootballFieldSection(
                    personnel: personnel,
                    signals: fieldSignals,
                    accent: accent
                )
            }

            if !edgeSignals.isEmpty {
                EdgesSection(title: "THE EDGES", edges: edgeSignals)
            }

            if !sweatSignals.isEmpty {
                FootballSweatSection(signals: sweatSignals, accent: accent)
            }
        }
    }
}

// MARK: - Evidence extraction

private enum FootballEvidence {
    struct Pair: Identifiable {
        let id: String
        let label: String
        let away: String
        let home: String
        let awayLabel: String
        let homeLabel: String
    }

    struct BigNumber: Identifiable {
        let id: String
        let numeral: String
        let label: String
        let detail: String
    }

    struct Personnel: Identifiable {
        let id: String
        let name: String
        let team: String
        let role: String
        let status: String?
        let detail: String?
    }

    static let trenchTokens: Set<String> = [
        "OL_RANKINGS", "DL_RANKINGS", "PRESSURE_RATE", "SACKS",
        "HAVOC_RATE", "HAVOC_ALLOWED", "RUSHING_YARDS_PER_GAME",
        "RUSH_YDS_GM", "RUSH_YPG", "RUSHING_YPG", "OPP_RUSHING_YARDS",
        "YARDS_PER_CARRY", "RB_STATS", "NCAAF_RUSHING_OFFENSE",
    ]

    private static func clean(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.uppercased() != "N/A", value != "—" else { return nil }
        return value
    }

    static func sideLabel(_ raw: String, league: String) -> String {
        let short = Formatters.shortTeamName(raw, league: league)
        return short.isEmpty ? raw.uppercased() : short.uppercased()
    }

    static func label(for stat: StatData) -> String {
        if let name = clean(stat.name) { return name.uppercased() }
        return (stat.token ?? "MATCHUP")
            .replacingOccurrences(of: "_", with: " ")
            .uppercased()
    }

    static func pairs(from stats: [StatData], matching tokens: Set<String>,
                      awayLabel: String, homeLabel: String, limit: Int) -> [Pair] {
        var seen = Set<String>()
        var output: [Pair] = []
        for (index, stat) in stats.enumerated() {
            let token = (stat.token ?? "").uppercased()
            let searchable = "\(token) \((stat.name ?? "").uppercased())"
            guard tokens.contains(token) || tokens.contains(where: { searchable.contains($0) }) else { continue }
            guard let away = clean(stat.away?.getValue(for: token)),
                  let home = clean(stat.home?.getValue(for: token)) else { continue }
            let key = token.isEmpty ? searchable : token
            guard seen.insert(key).inserted else { continue }
            output.append(Pair(id: "\(key)-\(index)", label: label(for: stat),
                               away: away, home: home,
                               awayLabel: awayLabel, homeLabel: homeLabel))
            if output.count == limit { break }
        }
        return output
    }

    static func bigNumbers(league: String, row: TomorrowBoardRow?, stats: [StatData],
                           awayLabel: String, homeLabel: String) -> [BigNumber] {
        var output: [BigNumber] = []
        var consumed = Set<String>()

        if let line = lineMovement(row: row, homeLabel: homeLabel) {
            output.append(line)
        }

        let categories: [(id: String, label: String, tokens: [String])] = {
            var list: [(String, String, [String])] = []
            if league == "NCAAF" {
                // These rows render only when the payload contains the named
                // rating. There is no substitute or inferred power number.
                list.append(("power", "POWER RATING", ["SP_PLUS_RATINGS", "SP_PLUS", "FPI", "FPI_RATING"]))
            }
            list.append(contentsOf: [
                ("efficiency", "EPA / SUCCESS", ["OFFENSIVE_EPA", "DEFENSIVE_EPA", "SUCCESS_RATE", "SUCCESS_RATE_OFFENSE", "SUCCESS_RATE_DEFENSE", "EARLY_DOWN_SUCCESS"]),
                ("explosive", "EXPLOSIVE RATE", ["EXPLOSIVENESS", "EXPLOSIVE_PLAYS", "EXPLOSIVE_ALLOWED", "YARDS_PER_PLAY"]),
                ("redzone", "RED-ZONE TD", ["RED_ZONE_OFFENSE", "RED_ZONE_DEFENSE", "RED_ZONE", "NCAAF_RED_ZONE_OFFENSE"]),
                ("turnovers", "TURNOVER MARGIN", ["TURNOVER_MARGIN", "TURNOVER_DIFF", "NCAAF_TURNOVER_MARGIN"]),
                ("weather", "WEATHER", ["WIND_SPEED", "TEMPERATURE", "CONDITIONS", "IMPACT"]),
                ("points", "SCORING BASELINE", ["POINTS_GM", "POINTS_PER_GAME"]),
                ("points_allowed", "SCORING DEFENSE", ["OPP_PTS_GM", "OPP_POINTS_PER_GAME"]),
                ("rush", "RUSHING BASELINE", ["RUSH_YDS_GM", "RUSHING_YARDS_PER_GAME", "RUSHING_YPG"]),
                ("pass", "PASSING BASELINE", ["PASS_YDS_GM", "PASSING_YPG"]),
                ("total", "TOTAL OFFENSE", ["TOTAL_YDS_GM", "TOTAL_YPG", "NCAAF_TOTAL_OFFENSE"]),
                ("pass_defense", "PASS DEFENSE", ["OPP_PASS_YDS", "OPP_PASSING_YARDS"]),
            ])
            return list
        }()

        for category in categories where output.count < 5 {
            guard let pair = firstPair(in: stats, tokens: category.tokens,
                                       awayLabel: awayLabel, homeLabel: homeLabel,
                                       consumed: &consumed) else { continue }
            output.append(BigNumber(
                id: category.id,
                numeral: "\(pair.away) · \(pair.home)",
                label: category.label,
                detail: "\(pair.awayLabel) \(pair.away) vs \(pair.homeLabel) \(pair.home)"
            ))
        }
        return Array(output.prefix(5))
    }

    private static func firstPair(in stats: [StatData], tokens: [String],
                                  awayLabel: String, homeLabel: String,
                                  consumed: inout Set<String>) -> Pair? {
        for wanted in tokens {
            for (index, stat) in stats.enumerated() {
                let token = (stat.token ?? "").uppercased()
                let name = (stat.name ?? "").uppercased().replacingOccurrences(of: " ", with: "_")
                guard token == wanted || name == wanted || token.contains(wanted) || name.contains(wanted) else { continue }
                guard !consumed.contains(token),
                      let away = clean(stat.away?.getValue(for: token)),
                      let home = clean(stat.home?.getValue(for: token)) else { continue }
                consumed.insert(token)
                return Pair(id: "\(token)-\(index)", label: label(for: stat),
                            away: away, home: home,
                            awayLabel: awayLabel, homeLabel: homeLabel)
            }
        }
        return nil
    }

    private static func signed(_ value: Double) -> String {
        let whole = value.rounded() == value
        let number = whole ? String(Int(value)) : String(format: "%.1f", value)
        return value > 0 ? "+\(number)" : number
    }

    private static func money(_ value: Double) -> String {
        let whole = value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        return value > 0 ? "+\(whole)" : whole
    }

    private static func lineMovement(row: TomorrowBoardRow?, homeLabel: String) -> BigNumber? {
        guard let row else { return nil }
        if let current = row.ml_home, let opening = row.ml_open_home, opening != current {
            let numeral = money(current)
            return BigNumber(
                id: "line",
                numeral: numeral,
                label: "THE LINE",
                detail: "\(homeLabel) opened \(money(opening)); the current price is \(numeral)."
            )
        }
        if let current = row.spread {
            let numeral = signed(current)
            return BigNumber(id: "line", numeral: numeral, label: "THE LINE",
                             detail: "Current \(homeLabel) spread.")
        }
        if let current = row.ml_home {
            let numeral = money(current)
            return BigNumber(id: "line", numeral: numeral, label: "THE LINE",
                             detail: "Current \(homeLabel) moneyline.")
        }
        return nil
    }

    static func personnel(from pick: GaryPick?, props: [PropPick],
                          awayLabel: String, homeLabel: String) -> [Personnel] {
        var output: [Personnel] = []
        var seen = Set<String>()

        func injuryPriority(_ status: String?) -> Int {
            let value = (status ?? "").lowercased()
            if value.contains("out") || value == "ir" { return 0 }
            if value.contains("doubt") { return 1 }
            if value.contains("question") { return 2 }
            return 3
        }

        func compactDetail(_ raw: String?) -> String? {
            guard let value = clean(raw) else { return nil }
            let first = value.components(separatedBy: CharacterSet(charactersIn: ".\n")).first?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? value
            guard first.count > 0 else { return nil }
            return first.count <= 84 ? first : String(first.prefix(81)) + "…"
        }

        func injuryRows(_ injuries: [PlayerInjury], team: String) -> [Personnel] {
            injuries.sorted {
                injuryPriority($0.status) < injuryPriority($1.status)
            }.compactMap { injury in
                guard let name = clean(injury.name) else { return nil }
                let key = "\(team)-\(name.lowercased())"
                return Personnel(
                    id: "injury-\(team)-\(key)",
                    name: name,
                    team: team,
                    role: "AVAILABILITY",
                    status: clean(injury.status)?.uppercased(),
                    detail: compactDetail(injury.description)
                )
            }
        }

        if let injuries = pick?.injuries {
            let away = injuryRows(injuries.away ?? [], team: awayLabel)
            let home = injuryRows(injuries.home ?? [], team: homeLabel)
            let injuryLimit = 4
            var index = 0
            while output.count < injuryLimit && (index < away.count || index < home.count) {
                for person in [index < away.count ? away[index] : nil,
                               index < home.count ? home[index] : nil].compactMap({ $0 }) {
                    let key = person.name.lowercased()
                    if seen.insert(key).inserted { output.append(person) }
                    if output.count == injuryLimit { break }
                }
                index += 1
            }
        }

        // A posted player market is evidence that the player is part of the
        // active game card. It is not promoted to "confirmed" availability.
        for prop in props {
            guard let name = clean(prop.player) else { continue }
            let key = name.lowercased()
            guard seen.insert(key).inserted else { continue }
            let team = clean(prop.team)?.uppercased() ?? "ON THE CARD"
            let role = [clean(prop.position)?.uppercased(), "SKILL PERSONNEL"]
                .compactMap { $0 }.joined(separator: " · ")
            output.append(Personnel(id: "card-\(key)", name: name, team: team,
                                    role: role, status: nil, detail: nil))
        }

        return Array(output.prefix(6))
    }
}

// MARK: - Section views

private struct FootballSectionHeading: View {
    let title: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle()
                .fill(LinearGradient(colors: [accent.opacity(0.9), GaryColors.gold.opacity(0.55), .clear],
                                     startPoint: .leading, endPoint: .trailing))
                .frame(height: 1)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(title.uppercased())
                    .font(GaryFonts.mono(13.5, bold: true)).tracking(1.5)
                    .foregroundStyle(GaryColors.gold)
                Spacer(minLength: 8)
            }
        }
        .padding(.horizontal, 16)
    }
}

private struct FootballComparisonSection: View {
    let title: String
    let rows: [FootballEvidence.Pair]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionHeading(title: title, accent: accent)
            VStack(spacing: 0) {
                HStack {
                    Text(rows[0].awayLabel)
                    Spacer()
                    Text("MATCHUP")
                    Spacer()
                    Text(rows[0].homeLabel)
                }
                .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.48))
                .padding(.horizontal, 14).padding(.vertical, 10)

                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    HStack(spacing: 8) {
                        Text(row.away)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(row.label)
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(0.5)
                            .foregroundStyle(.white.opacity(0.5))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: 116)
                        Text(row.home)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .font(GaryFonts.data(14, .bold))
                    .foregroundStyle(GaryColors.warmWhite)
                    .padding(.horizontal, 14).padding(.vertical, 11)
                    .background(index.isMultiple(of: 2) ? Color.white.opacity(0.018) : .clear)
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

private struct FootballBigNumbersSection: View {
    let rows: [FootballEvidence.BigNumber]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionHeading(title: "Big Numbers", accent: accent)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    HStack(alignment: .center, spacing: 14) {
                        Text(row.numeral)
                            .font(GaryFonts.display(row.numeral.count > 12 ? 25 : 32))
                            .foregroundStyle(index == 0 ? accent : GaryColors.warmWhite)
                            .lineLimit(1)
                            .minimumScaleFactor(0.58)
                            .frame(width: 124, alignment: .leading)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(row.label)
                                .font(GaryFonts.mono(9.5, bold: true)).tracking(0.9)
                                .foregroundStyle(GaryColors.gold)
                            Text(row.detail)
                                .font(GaryFonts.text(12.5, .semibold))
                                .foregroundStyle(.white.opacity(0.78))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    if index < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                    }
                }
            }
            .footballPanel(accent: accent)
            .padding(.horizontal, 16)
        }
    }
}

private struct FootballFieldSection: View {
    let personnel: [FootballEvidence.Personnel]
    let signals: [Signal]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FootballSectionHeading(title: "The Field", accent: accent)
            if !personnel.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(personnel.enumerated()), id: \.element.id) { index, person in
                        HStack(alignment: .top, spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 7) {
                                    Text(person.name.uppercased())
                                        .font(GaryFonts.mono(11.5, bold: true)).tracking(0.5)
                                        .foregroundStyle(GaryColors.warmWhite)
                                    if let status = person.status {
                                        Text(status)
                                            .font(GaryFonts.mono(8.5, bold: true)).tracking(0.6)
                                            .foregroundStyle(statusColor(status))
                                    }
                                }
                                Text("\(person.team) · \(person.role)")
                                    .font(GaryFonts.mono(9, bold: true)).tracking(0.5)
                                    .foregroundStyle(accent.opacity(0.85))
                                if let detail = person.detail {
                                    Text(detail)
                                        .font(GaryFonts.text(11.5))
                                        .foregroundStyle(.white.opacity(0.56))
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        if index < personnel.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                        }
                    }
                }
                .footballPanel(accent: accent)
                .padding(.horizontal, 16)
            }
            if !signals.isEmpty {
                FootballSignalSection(signals: signals, accent: accent)
            }
        }
    }

    private func statusColor(_ status: String) -> Color {
        let normalized = status.lowercased()
        if normalized.contains("out") || normalized == "ir" || normalized.contains("doubt") {
            return HubPalette.red
        }
        if normalized.contains("question") || normalized.contains("day") {
            return GaryColors.gold
        }
        return .white.opacity(0.58)
    }
}

private struct FootballSignalSection: View {
    let signals: [Signal]
    let accent: Color

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(signals.enumerated()), id: \.element.id) { index, signal in
                SignalRow(s: signal)
                if index < signals.count - 1 {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                }
            }
        }
        .footballPanel(accent: accent)
        .padding(.horizontal, 16)
    }
}

/// Gary's thesis against the game as it develops. The row is intentionally a
/// scoreboard, not an explainer: factor, stored baseline/current value, state.
private struct FootballSweatSection: View {
    let signals: [Signal]
    let accent: Color

    private var normalizedStates: [String] {
        signals.map { ($0.sweat?.state ?? "watch").lowercased() }
    }

    private var terminal: Bool {
        let finalStates: Set<String> = ["held", "missed", "failed", "push", "final_held", "final_missed", "final_flipped", "final_push"]
        return !normalizedStates.isEmpty && normalizedStates.allSatisfy(finalStates.contains)
    }

    private var summary: String {
        if terminal {
            let held = normalizedStates.filter { $0 == "held" || $0 == "final_held" }.count
            let pushes = normalizedStates.filter { $0 == "push" || $0 == "final_push" }.count
            let decided = signals.count - pushes
            if decided == 0 { return "PUSH" }
            return pushes > 0 ? "HELD \(held)/\(decided) · PUSH \(pushes)" : "HELD \(held)/\(decided)"
        }
        if normalizedStates.contains(where: { $0.contains("flip") || $0 == "failed" }) { return "FLIPPED" }
        if normalizedStates.contains(where: { $0.contains("hold") || $0 == "live" }) { return "HOLDING" }
        return "WATCH"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                Rectangle()
                    .fill(LinearGradient(colors: [accent.opacity(0.9), GaryColors.gold.opacity(0.55), .clear],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(height: 1)
                HStack(alignment: .firstTextBaseline) {
                    Text("THE SWEAT")
                        .font(GaryFonts.mono(13.5, bold: true)).tracking(1.5)
                        .foregroundStyle(GaryColors.gold)
                    Spacer(minLength: 8)
                    Text(summary)
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                        .foregroundStyle(summaryColor)
                }
            }
            .padding(.horizontal, 16)

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

    private var summaryColor: Color {
        switch summary {
        case "FLIPPED": return HubPalette.red
        case "WATCH", "PUSH": return GaryColors.gold
        default: return accent
        }
    }
}

private struct FootballSweatRow: View {
    let signal: Signal
    let accent: Color

    private var factor: String {
        let headline = signal.headline.trimmingCharacters(in: .whitespacesAndNewlines)
        if !headline.isEmpty { return headline.uppercased() }
        if let raw = signal.sweat?.factor_code?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            return raw.replacingOccurrences(of: "_", with: " ").uppercased()
        }
        return "FACTOR"
    }

    private var movement: String? {
        let baseline = signal.sweat?.baseline?.display.trimmingCharacters(in: .whitespacesAndNewlines)
        let live = signal.sweat?.live_value?.display.trimmingCharacters(in: .whitespacesAndNewlines)
        if let baseline, !baseline.isEmpty, let live, !live.isEmpty {
            return baseline == live ? live : "\(baseline) → \(live)"
        }
        if let live, !live.isEmpty { return live }
        if let baseline, !baseline.isEmpty { return baseline }
        let value = signal.value.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private var state: String {
        switch (signal.sweat?.state ?? "watch").lowercased() {
        case "holding", "live", "live_holding": return "HOLDING"
        case "flipped", "live_flipped", "failed", "missed", "final_missed", "final_flipped": return "FLIPPED"
        case "held", "final_held": return "HELD"
        case "push", "final_push": return "PUSH"
        default: return "WATCH"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Text(factor)
                .font(GaryFonts.mono(10.5, bold: true)).tracking(0.55)
                .foregroundStyle(GaryColors.warmWhite)
                .lineLimit(2)
            Spacer(minLength: 6)
            if let movement {
                Text(movement)
                    .font(GaryFonts.data(12, .bold))
                    .foregroundStyle(.white.opacity(0.72))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Text(state)
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.65)
                .foregroundStyle(stateColor)
                .padding(.horizontal, 7).padding(.vertical, 4)
                .background(Capsule().fill(stateColor.opacity(0.12)))
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    private var stateColor: Color {
        switch state {
        case "FLIPPED": return HubPalette.red
        case "WATCH", "PUSH": return GaryColors.gold
        default: return accent
        }
    }
}

private struct FootballQuietState: View {
    let text: String
    var body: some View {
        Text(text)
            .font(GaryFonts.text(12.5))
            .foregroundStyle(.white.opacity(0.55))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16).padding(.vertical, 8)
    }
}

private extension View {
    func footballPanel(accent: Color) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(hex: "#151311"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(LinearGradient(colors: [accent.opacity(0.34), Color.white.opacity(0.08)],
                                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                                    lineWidth: 1)
                    )
            )
    }
}

// MARK: - NFL fantasy desk

struct FootballFantasyPage: View {
    let league: HubLeagueSel
    let signals: [Signal]
    let loaded: Bool
    let onTap: (Signal) -> Void

    private var accent: Color {
        league == .ncaaf ? Sport.ncaaf.accentColor : Sport.nfl.accentColor
    }
    private var isNFL: Bool { league == .nfl }
    private var emptyCopy: String {
        isNFL ? "No NFL fantasy reads yet." : "No NCAAF fantasy reads yet."
    }

    private struct Lane: Identifiable {
        let id: String
        let title: String
        let kinds: Set<SignalKind>
    }

    private var lanes: [Lane] {
        [
            Lane(id: "usage", title: "Usage & Role",
                 kinds: [.fantasyUsage, .fantasyPickups]),
            Lane(id: "redzone", title: "Red Zone",
                 kinds: [.fantasyRedZone]),
            Lane(id: "matchup", title: "Matchup",
                 kinds: [.fantasyMatchup]),
            Lane(id: "trend", title: "Recent Trend",
                 kinds: [.fantasyTrend]),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 5) {
                (Text("FANTASY ").foregroundColor(GaryColors.warmWhite)
                    + Text("FOOTBALL").foregroundColor(accent))
                    .font(GaryFonts.display(26)).tracking(0.5)
            }
            .padding(.horizontal, 18)

            if !loaded {
                HStack { Spacer(); ProgressView().tint(accent); Spacer() }
                    .padding(.vertical, 36)
            } else if signals.isEmpty {
                FootballQuietState(text: emptyCopy)
            } else {
                ForEach(lanes) { lane in
                    let rows = signals.filter { lane.kinds.contains($0.kind) }
                    if !rows.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            FootballSectionHeading(title: lane.title, accent: accent)
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
            }
        }
    }
}

private struct FootballFantasyRow: View {
    let signal: Signal
    let accent: Color

    /// The lane title and right-side metric already explain the read. Keep the
    /// list row to the player's name; the complete evidence remains one tap
    /// away in the existing signal detail sheet.
    private var playerTitle: String {
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

    /// Preseason football rows can be backed by a roster-verified prior-season
    /// sample. Keep that provenance visible without restoring the long copy.
    private var baselineLabel: String? {
        let headline = signal.headline.trimmingCharacters(in: .whitespacesAndNewlines)
        guard headline.range(of: "baseline", options: [.caseInsensitive]) != nil else { return nil }
        if let year = headline.range(of: #"\b(?:19|20)\d{2}\b"#, options: [.regularExpression]) {
            return "\(headline[year]) BASELINE"
        }
        return "PRIOR BASELINE"
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Text(playerTitle)
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
                    if let baselineLabel {
                        Text(baselineLabel)
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
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}
