import SwiftUI

// MARK: - Football Hub
//
// NFL and NCAAF use a football-native front page instead of the generic
// editorial lead/best/beat stack. This surface only rearranges already decoded
// slate and insight rows; it does not infer a kickoff, market, or matchup fact.

struct FootballHubPage: View {
    let league: HubLeagueSel
    let slateRows: [TomorrowBoardRow]
    let signals: [Signal]
    let loaded: Bool
    let onGame: (TomorrowBoardRow) -> Void
    let onSignal: (Signal) -> Void

    private var accent: Color {
        league == .ncaaf ? Sport.ncaaf.accentColor : Sport.nfl.accentColor
    }

    private var receipts: [Signal] {
        deduped(signals.filter { $0.kind == .afterGary })
    }

    private var sweat: [Signal] {
        deduped(signals.filter { signal in
            guard signal.kind == .theSweat else { return false }
            let state = signal.sweat?.state?.lowercased() ?? ""
            return !["watch", "scheduled", "pregame"].contains(state)
        })
    }

    private var nextSlate: Signal? {
        guard league == .ncaaf else { return nil }
        return signals.first { $0.kind == .nextSlate }
    }

    private var gameBoard: [Signal] {
        let ordered = signals.enumerated()
            .compactMap { index, signal -> (Int, Int, Signal)? in
                guard let rank = boardRank(signal.kind) else { return nil }
                guard signal.kind != .marketRange || marketRangeIsPregame(signal) else { return nil }
                return (rank, index, signal)
            }
            .sorted { lhs, rhs in
                lhs.0 == rhs.0 ? lhs.1 < rhs.1 : lhs.0 < rhs.0
            }
            .map(\.2)
        return deduped(ordered)
    }

    private func marketRangeIsPregame(_ signal: Signal) -> Bool {
        if signal.marketRange?.footballMarketIsClosed == true { return false }
        guard let gameId = signal.gameId.flatMap(Int.init),
              let slate = slateRows.first(where: { $0.bdl_game_id == gameId }),
              let kickoff = footballHubDate(slate.commence_time) else { return true }
        return Date() < kickoff
    }

    private var hasIntel: Bool {
        !receipts.isEmpty || !gameBoard.isEmpty || !sweat.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            if !loaded {
                HStack {
                    Spacer()
                    ProgressView().tint(accent)
                    Spacer()
                }
                .padding(.vertical, 42)
            } else {
                if !slateRows.isEmpty {
                    FootballHubSlateRail(
                        league: league,
                        rows: slateRows,
                        accent: accent,
                        onTap: onGame
                    )
                    .id("slate")
                }

                if slateRows.isEmpty, let nextSlate {
                    FootballNextSlatePreview(signal: nextSlate, accent: accent)
                        .id("nextSlate")
                }

                if !receipts.isEmpty {
                    FootballHubReceiptSection(rows: receipts, accent: accent, onTap: onSignal)
                        .id("afterGary")
                }

                if !gameBoard.isEmpty {
                    FootballHubGameBoard(rows: gameBoard, accent: accent, onTap: onSignal)
                        .id("edges")
                }

                if !sweat.isEmpty {
                    FootballHubSweatSection(rows: sweat, accent: accent, onTap: onSignal)
                        .id("theSweat")
                }

                if !hasIntel && !(slateRows.isEmpty && nextSlate != nil) {
                    FootballHubQuietState(league: league, slateCount: slateRows.count, accent: accent)
                        .id("edges")
                }
            }
        }
    }

    private func boardRank(_ kind: SignalKind) -> Int? {
        switch kind {
        case .marketRange: return league == .ncaaf ? 0 : nil
        case .trenches: return 1
        case .passRush: return 2
        case .quarterback: return 3
        case .injury: return 4
        case .coverage: return 5
        case .paceScript: return 6
        case .redZone: return 7
        case .turnoverEdge: return 8
        case .explosivePlay: return 9
        case .specialTeams: return 10
        case .situational: return 11
        case .coaching: return 12
        default: return nil
        }
    }

    private func deduped(_ rows: [Signal]) -> [Signal] {
        var seen = Set<String>()
        return rows.filter { signal in
            let identity = signal.gameId ?? footballHubNormalized(signal.game)
            let key = [
                identity,
                footballHubNormalized(signal.headline),
                footballHubNormalized(signal.value),
            ].joined(separator: "|")
            return seen.insert(key).inserted
        }
    }
}

// MARK: - Slate windows

private enum FootballHubWindow: Int, CaseIterable, Identifiable {
    case early, afternoon, prime, late, timeTBD

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .early: return "NOON"
        case .afternoon: return "AFTERNOON"
        case .prime: return "PRIME"
        case .late: return "LATE"
        case .timeTBD: return "TIME TBD"
        }
    }
}

private struct FootballHubSlateRail: View {
    let league: HubLeagueSel
    let rows: [TomorrowBoardRow]
    let accent: Color
    let onTap: (TomorrowBoardRow) -> Void

    @ObservedObject private var live = LiveScoreCache.shared

    private struct WindowGroup: Identifiable {
        let window: FootballHubWindow
        let rows: [TomorrowBoardRow]
        var id: Int { window.id }
    }

    private var groups: [WindowGroup] {
        FootballHubWindow.allCases.compactMap { window in
            let matches = rows.filter { footballHubWindow(for: $0) == window }
                .sorted { lhs, rhs in
                    let left = footballHubDate(lhs.commence_time) ?? .distantFuture
                    let right = footballHubDate(rhs.commence_time) ?? .distantFuture
                    return left < right
                }
            return matches.isEmpty ? nil : WindowGroup(window: window, rows: matches)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            FootballHubSectionTitle(title: league == .ncaaf ? "Saturday Windows" : "Game Windows",
                                    count: rows.count,
                                    accent: accent)

            VStack(alignment: .leading, spacing: 14) {
                ForEach(groups) { group in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack(spacing: 7) {
                            Text(group.window.title)
                                .font(GaryFonts.mono(9.5, bold: true))
                                .tracking(1)
                                .foregroundStyle(group.window == .timeTBD ? GaryColors.gold : accent)
                            Text("\(group.rows.count)")
                                .font(GaryFonts.data(10, .semibold))
                                .foregroundStyle(.white.opacity(0.48))
                        }
                        .padding(.horizontal, GaryLayout.gutter)

                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 9) {
                                ForEach(Array(group.rows.enumerated()), id: \.offset) { _, row in
                                    FootballHubGameTile(
                                        row: row,
                                        window: group.window,
                                        liveScore: live.status(forMatchup: footballHubFullMatchup(row)),
                                        accent: accent,
                                        onTap: { onTap(row) }
                                    )
                                }
                            }
                            .padding(.horizontal, GaryLayout.gutter)
                        }
                    }
                }
            }
        }
    }
}

private struct FootballHubGameTile: View {
    let row: TomorrowBoardRow
    let window: FootballHubWindow
    let liveScore: LiveScore?
    let accent: Color
    let onTap: () -> Void

    private var matchup: String {
        "\(footballHubSide(row.away_abbr, row.away_team, league: row.league)) @ \(footballHubSide(row.home_abbr, row.home_team, league: row.league))"
    }

    private var status: String {
        if let liveScore, liveScore.isLive {
            return liveScore.scoreLine ?? "LIVE"
        }
        if let liveScore, liveScore.isFinal {
            guard let score = liveScore.scoreLine, !score.isEmpty else { return "FINAL" }
            return "FINAL · \(score)"
        }
        if window == .timeTBD { return "KICKOFF TBD" }
        let time = TomorrowView.etTime(row.commence_time, withZone: false, meridiem: true)
        return time == "—" ? "KICKOFF TBD" : time
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 7) {
                Text(matchup)
                    .font(GaryFonts.data(12.5, .bold))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if liveScore?.isLive == true {
                        Circle().fill(GaryColors.sweating).frame(width: 5, height: 5)
                    }
                    Text(status.uppercased())
                        .font(GaryFonts.mono(9, bold: true))
                        .tracking(0.55)
                        .foregroundStyle(liveScore?.isLive == true ? GaryColors.sweating : .white.opacity(0.58))
                        .lineLimit(1)
                }
            }
            .frame(width: 132, alignment: .leading)
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: GaryLayout.Radius.panel, style: .continuous)
                    .fill(GaryColors.panelFill)
                    .overlay(
                        RoundedRectangle(cornerRadius: GaryLayout.Radius.panel, style: .continuous)
                            .stroke(accent.opacity(0.2), lineWidth: 1)
                    )
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(matchup), \(status)")
    }
}

// MARK: - Gary's Number

private struct FootballHubReceiptSection: View {
    let rows: [Signal]
    let accent: Color
    let onTap: (Signal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            FootballHubSectionTitle(title: "Gary's Number", count: rows.count, accent: accent)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, signal in
                    FootballHubReceiptRow(signal: signal, accent: accent) { onTap(signal) }
                    if index < rows.count - 1 { FootballHubDivider() }
                }
            }
            .footballHubPanel(accent: accent)
            .padding(.horizontal, GaryLayout.gutter)
        }
    }
}

private struct FootballHubReceiptRow: View {
    let signal: Signal
    let accent: Color
    let onTap: () -> Void

    private var selection: String? {
        if let label = signal.afterGary?.pick_label?
            .trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty {
            return label.uppercased()
        }
        let left = signal.headline.components(separatedBy: "→").first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let pieces = left.split(separator: " ")
        guard pieces.count > 1 else { return left.isEmpty ? nil : left.uppercased() }
        let value = pieces.dropLast().joined(separator: " ").uppercased()
        return value.isEmpty ? nil : value
    }

    private var movement: (locked: String, current: String)? {
        if let locked = primaryQuote(signal.afterGary?.published),
           let current = primaryQuote(signal.afterGary?.current) {
            return (locked, current)
        }
        let parts = signal.headline.components(separatedBy: "→")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
        return (parts[0], parts[1])
    }

    private var currentLabel: String {
        signal.afterGary?.footballMarketIsClosed == true ? "LAST PREGAME" : "NOW"
    }

    private var valueText: String? {
        if let marketMove = signal.afterGary?.movement {
            let advantage = (marketMove.advantage ?? "same").lowercased()
            guard advantage != "same",
                  let value = marketMove.primary_value,
                  value > 0 else { return "NO MOVE" }
            let owner = advantage == "gary" ? "GARY" : "NOW"
            let unit = (marketMove.primary_unit ?? "").lowercased() == "probability_points" ? "PP" : "PTS"
            return "\(owner) +\(unsignedNumber(value)) \(unit)"
        }
        let fallback = signal.value.trimmingCharacters(in: .whitespacesAndNewlines)
        return fallback.isEmpty ? nil : fallback.uppercased()
    }

    private var lockedLabel: String {
        guard let time = footballHubClock(signal.afterGary?.published_at) else { return "LOCKED" }
        return "LOCKED \(time)"
    }

    private var receiptMeta: String? {
        var parts: [String] = []
        if let vendor = signal.afterGary?.vendor?.trimmingCharacters(in: .whitespacesAndNewlines),
           !vendor.isEmpty {
            parts.append(vendor.uppercased())
        }
        if signal.afterGary?.footballMarketIsClosed == true {
            parts.append("LAST PREGAME")
        } else if signal.afterGary?.market_state?.lowercased() == "pregame" {
            parts.append("SAME BOOK")
        }
        if let time = footballHubClock(signal.afterGary?.as_of) {
            parts.append(time)
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func primaryQuote(_ snapshot: FootballMarketSnapshot?) -> String? {
        guard let snapshot else { return nil }
        if let line = snapshot.line {
            var quote = signedNumber(line)
            if let odds = snapshot.odds { quote += "  \(signedNumber(odds))" }
            return quote
        }
        if let odds = snapshot.odds { return signedNumber(odds) }
        return nil
    }

    private func signedNumber(_ value: Double) -> String {
        let body = unsignedNumber(abs(value))
        if value > 0 { return "+\(body)" }
        if value < 0 { return "-\(body)" }
        return body
    }

    private func unsignedNumber(_ value: Double) -> String {
        if value.rounded() == value { return String(Int(value)) }
        return String(format: "%.2f", value)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 9) {
                if !signal.game.isEmpty {
                    HStack(spacing: 8) {
                        Text(signal.game.uppercased())
                            .foregroundStyle(.white.opacity(0.52))
                        Spacer(minLength: 8)
                        if movement != nil, let selection {
                            Text(selection)
                                .foregroundStyle(accent)
                        }
                    }
                    .font(GaryFonts.mono(9.5, bold: true))
                    .tracking(0.8)
                }

                HStack(alignment: .center, spacing: 10) {
                    if let movement {
                        FootballHubMarketPoint(label: lockedLabel, value: movement.locked, color: GaryColors.warmWhite)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.34))
                        FootballHubMarketPoint(label: currentLabel, value: movement.current, color: accent)
                    } else {
                        Text(signal.headline)
                            .font(GaryFonts.data(15, .bold))
                            .foregroundStyle(GaryColors.warmWhite)
                            .lineLimit(2)
                    }

                    Spacer(minLength: 4)

                    if let valueText {
                        Text(valueText)
                            .font(GaryFonts.mono(9, bold: true))
                            .tracking(0.45)
                            .foregroundStyle(GaryColors.gold)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(GaryColors.gold.opacity(0.11)))
                            .lineLimit(1)
                    }
                }

                if let receiptMeta {
                    Text(receiptMeta)
                        .font(GaryFonts.mono(8.5, bold: true))
                        .tracking(0.55)
                        .foregroundStyle(.white.opacity(0.42))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct FootballHubMarketPoint: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(GaryFonts.mono(8, bold: true))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.42))
            Text(value)
                .font(GaryFonts.data(15, .bold))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
    }
}

// MARK: - Game board

private struct FootballHubGameBoard: View {
    let rows: [Signal]
    let accent: Color
    let onTap: (Signal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            FootballHubSectionTitle(title: "Game Board", count: rows.count, accent: accent)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, signal in
                    FootballHubSignalRow(signal: signal, accent: accent) { onTap(signal) }
                    if index < rows.count - 1 { FootballHubDivider() }
                }
            }
            .footballHubPanel(accent: accent)
            .padding(.horizontal, GaryLayout.gutter)
        }
    }
}

private struct FootballHubSignalRow: View {
    let signal: Signal
    let accent: Color
    let onTap: () -> Void

    private var compactValue: String? {
        let value = signal.value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, value.count <= 14, !signal.headline.localizedCaseInsensitiveContains(value) else {
            return nil
        }
        return value
    }

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .center, spacing: 12) {
                Text(footballHubKindLabel(signal.kind))
                    .font(GaryFonts.mono(8.5, bold: true))
                    .tracking(0.65)
                    .foregroundStyle(accent)
                    .frame(width: 76, alignment: .leading)
                    .lineLimit(2)

                VStack(alignment: .leading, spacing: 3) {
                    if !signal.game.isEmpty {
                        Text(signal.game.uppercased())
                            .font(GaryFonts.mono(8.5, bold: true))
                            .tracking(0.55)
                            .foregroundStyle(.white.opacity(0.42))
                            .lineLimit(1)
                    }
                    Text(signal.headline)
                        .font(GaryFonts.ui(14.5, .semibold))
                        .foregroundStyle(GaryColors.warmWhite)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 4)

                if let compactValue {
                    Text(compactValue)
                        .font(GaryFonts.data(12.5, .bold))
                        .foregroundStyle(signal.tone.color)
                        .lineLimit(1)
                }

                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.3))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Live proof

private struct FootballHubSweatSection: View {
    let rows: [Signal]
    let accent: Color
    let onTap: (Signal) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            FootballHubSectionTitle(title: "Live With Gary", count: rows.count, accent: accent)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, signal in
                    FootballHubSweatRow(signal: signal, accent: accent) { onTap(signal) }
                    if index < rows.count - 1 { FootballHubDivider() }
                }
            }
            .footballHubPanel(accent: accent)
            .padding(.horizontal, GaryLayout.gutter)
        }
    }
}

private struct FootballHubSweatRow: View {
    let signal: Signal
    let accent: Color
    let onTap: () -> Void

    private var state: String {
        switch signal.sweat?.state?.lowercased() {
        case "holding", "live", "live_holding": return "HOLDING"
        case "flipped", "live_flipped", "failed", "missed", "final_missed", "final_flipped": return "FLIPPED"
        case "held", "final_held": return "HELD"
        case "push", "final_push": return "PUSH"
        default: return "LIVE"
        }
    }

    private var stateColor: Color {
        switch state {
        case "FLIPPED": return GaryColors.loss
        case "PUSH", "LIVE": return GaryColors.sweating
        default: return accent
        }
    }

    private var baseLabel: String {
        signal.sweat?.factor_code?.uppercased() == "THE_NUMBER" ? "GARY" : "BASE"
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        if !signal.game.isEmpty {
                            Text(signal.game.uppercased())
                                .font(GaryFonts.mono(8.5, bold: true))
                                .tracking(0.55)
                                .foregroundStyle(.white.opacity(0.42))
                        }
                        Text(signal.headline.uppercased())
                            .font(GaryFonts.mono(10.5, bold: true))
                            .tracking(0.55)
                            .foregroundStyle(GaryColors.warmWhite)
                    }
                    Spacer(minLength: 4)
                    Text(state)
                        .font(GaryFonts.mono(8.5, bold: true))
                        .tracking(0.55)
                        .foregroundStyle(stateColor)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(stateColor.opacity(0.12)))
                }

                HStack(spacing: 14) {
                    if let baseline = signal.sweat?.baseline?.display, !baseline.isEmpty {
                        FootballHubProofValue(label: baseLabel, value: baseline)
                    }
                    if let live = signal.sweat?.live_value?.display, !live.isEmpty {
                        FootballHubProofValue(label: "LIVE", value: live)
                    } else if signal.sweat?.baseline == nil, !signal.value.isEmpty {
                        FootballHubProofValue(label: "LIVE", value: signal.value)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct FootballHubProofValue: View {
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 5) {
            Text(label)
                .font(GaryFonts.mono(8, bold: true))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.38))
            Text(value)
                .font(GaryFonts.data(12.5, .bold))
                .foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Shared football Hub chrome

private struct FootballHubSectionTitle: View {
    let title: String
    let count: Int
    let accent: Color

    var body: some View {
        HStack(alignment: .center, spacing: 9) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(accent)
                .frame(width: 3, height: 17)
            Text(title.uppercased())
                .font(GaryFonts.mono(12.5, bold: true))
                .tracking(1.35)
                .foregroundStyle(GaryColors.warmWhite)
            if count > 0 {
                Text("\(count)")
                    .font(GaryFonts.data(11.5, .semibold))
                    .foregroundStyle(.white.opacity(0.42))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, GaryLayout.gutter)
    }
}

private struct FootballHubDivider: View {
    var body: some View {
        Rectangle()
            .fill(GaryColors.warmWhite.opacity(0.07))
            .frame(height: 1)
            .padding(.leading, 14)
    }
}

private struct FootballHubQuietState: View {
    let league: HubLeagueSel
    let slateCount: Int
    let accent: Color

    private var text: String {
        if slateCount > 0 { return "NO VERIFIED \(league.label) INTEL YET" }
        return "NO VERIFIED \(league.label) SLATE YET"
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "football")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(accent)
            Text(text)
                .font(GaryFonts.mono(10.5, bold: true))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.7))
            Spacer(minLength: 0)
            if slateCount > 0 {
                Text("\(slateCount) GAMES")
                    .font(GaryFonts.data(10.5, .semibold))
                    .foregroundStyle(.white.opacity(0.42))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 15)
        .footballHubPanel(accent: accent)
        .padding(.horizontal, GaryLayout.gutter)
    }
}

private extension View {
    func footballHubPanel(accent: Color) -> some View {
        background(
            RoundedRectangle(cornerRadius: GaryLayout.Radius.panel, style: .continuous)
                .fill(GaryColors.panelFill)
                .overlay(
                    RoundedRectangle(cornerRadius: GaryLayout.Radius.panel, style: .continuous)
                        .stroke(accent.opacity(0.14), lineWidth: 1)
                )
        )
    }
}

// MARK: - Pure display helpers

private func footballHubNormalized(_ value: String) -> String {
    value.lowercased().filter { $0.isLetter || $0.isNumber }
}

private func footballHubSide(_ abbreviation: String?, _ name: String?, league: String?) -> String {
    if let abbreviation, !abbreviation.isEmpty { return abbreviation.uppercased() }
    guard let name, !name.isEmpty else { return "—" }
    let resolved = teamAbbrevFromName(name, league: league)
    return resolved.isEmpty ? "—" : resolved.uppercased()
}

private func footballHubFullMatchup(_ row: TomorrowBoardRow) -> String {
    "\(row.away_team ?? "") @ \(row.home_team ?? "")"
}

private func footballHubDate(_ value: String?) -> Date? {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    let standard = ISO8601DateFormatter()
    standard.formatOptions = [.withInternetDateTime]
    return standard.date(from: value)
}

private func footballHubClock(_ value: String?) -> String? {
    guard let date = footballHubDate(value) else { return nil }
    let formatter = DateFormatter()
    formatter.timeZone = TimeZone(identifier: "America/New_York")
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "h:mm a"
    return formatter.string(from: date)
}

private func footballHubWindow(for row: TomorrowBoardRow) -> FootballHubWindow {
    let status = row.kickoff_status?.lowercased()
    let isNCAAF = row.league?.uppercased() == "NCAAF"
    guard status != "date_only", row.commence_time?.isEmpty == false else { return .timeTBD }
    // NFL rows written before the precision field remain valid legacy ISO
    // timestamps. College rows must opt into the confirmed contract so an old
    // date-only placeholder can never be presented as a real kickoff window.
    guard !isNCAAF || status == "confirmed" else { return .timeTBD }
    guard let date = footballHubDate(row.commence_time) else { return .timeTBD }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
    let hour = calendar.component(.hour, from: date)
    switch hour {
    case ..<15: return .early
    case 15..<19: return .afternoon
    case 19..<22: return .prime
    default: return .late
    }
}

private func footballHubKindLabel(_ kind: SignalKind) -> String {
    switch kind {
    case .marketRange: return "MARKET RANGE"
    case .trenches: return "GROUND GAME"
    case .passRush: return "PRESSURE"
    case .quarterback: return "QUARTERBACK"
    case .injury: return "AVAILABILITY"
    case .coverage: return "COVERAGE"
    case .paceScript: return "PACE / SCRIPT"
    case .redZone: return "RED ZONE"
    case .turnoverEdge: return "TURNOVERS"
    case .explosivePlay: return "EXPLOSIVES"
    case .specialTeams: return "SPECIAL TEAMS"
    case .situational: return "SITUATION"
    case .coaching: return "COACHING"
    default: return kind.chip
    }
}
