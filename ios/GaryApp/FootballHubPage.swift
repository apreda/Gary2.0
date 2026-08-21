import SwiftUI

/// Fail-closed display contract for football proof rows. The backend category
/// selects a component, but only its structured payload is allowed to make a
/// market or live-state claim visible.
enum FootballProofContract {
    enum SweatState: String {
        case watch = "WATCH"
        case holding = "HOLDING"
        case flipped = "FLIPPED"
        case held = "HELD"
        case missed = "MISSED"
        case push = "PUSH"

        var isLiveOrFinal: Bool { self != .watch }
        var isFinal: Bool { self == .held || self == .missed || self == .push }
    }

    private static let factors: Set<String> = [
        "THE_NUMBER", "RUSH_EDGE", "AIR_EDGE", "PRESSURE", "BALL_SECURITY",
    ]
    private static let excludedVendors: Set<String> = [
        "", "unknown", "openingsnapshot", "kalshi", "polymarket",
    ]

    private static func text(_ value: String?) -> String? {
        guard let cleaned = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !cleaned.isEmpty else { return nil }
        return cleaned
    }

    private static func value(_ value: InsightMetaValue?) -> String? {
        text(value?.display)
    }

    private static func date(_ value: String?) -> Date? {
        guard let value = text(value) else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = fractional.date(from: value) { return parsed }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }

    private static func finite(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return value
    }

    private static func vendorKey(_ value: String?) -> String {
        (text(value) ?? "").lowercased().filter { $0.isLetter || $0.isNumber }
    }

    /// AFTER GARY is a receipt, not editorial copy. Every identity, quote,
    /// timestamp, source, and movement field must be present and internally
    /// consistent before either the Hub or an exact-game page may render it.
    static func isRenderableAfterGary(
        _ signal: Signal,
        exactGameID: String? = nil,
        now: Date = Date()
    ) -> Bool {
        guard signal.kind == .afterGary,
              let meta = signal.afterGary,
              text(meta.kind)?.lowercased() == "after_gary",
              meta.version == 1,
              text(meta.pick_id) != nil,
              let outerGameID = text(signal.gameId),
              let sealedGameID = text(meta.game_id),
              outerGameID == sealedGameID,
              exactGameID.map({ $0 == outerGameID }) ?? true,
              text(meta.pick_label) != nil,
              !excludedVendors.contains(vendorKey(meta.vendor)),
              text(meta.published_at_source)?.lowercased() == "pick",
              ["provider_updated_at", "retrieved_at"].contains(text(meta.as_of_source)?.lowercased() ?? ""),
              let publishedAt = date(meta.published_at),
              let observedAt = date(meta.as_of),
              let kickoff = date(meta.kickoff),
              publishedAt <= observedAt,
              observedAt < kickoff,
              publishedAt < kickoff,
              observedAt <= now.addingTimeInterval(300),
              ["pregame", "closed"].contains(text(meta.market_state)?.lowercased() ?? ""),
              let market = text(meta.market_type)?.lowercased(),
              let side = text(meta.pick_side)?.lowercased(),
              let published = meta.published,
              let current = meta.current,
              let publishedOdds = finite(published.odds), publishedOdds != 0,
              let currentOdds = finite(current.odds), currentOdds != 0,
              let movement = meta.movement,
              let advantage = text(movement.advantage)?.lowercased(),
              ["same", "gary", "now"].contains(advantage),
              let unit = text(movement.primary_unit)?.lowercased(),
              let primaryValue = finite(movement.primary_value), primaryValue >= 0,
              (advantage == "same" ? primaryValue < 0.001 : primaryValue > 0) else { return false }

        switch market {
        case "moneyline":
            guard ["home", "away"].contains(side), unit == "probability_points" else { return false }
        case "spread":
            guard ["home", "away"].contains(side),
                  finite(published.line) != nil, finite(current.line) != nil,
                  ["points", "probability_points"].contains(unit) else { return false }
        case "total":
            guard ["over", "under"].contains(side),
                  let publishedLine = finite(published.line), publishedLine > 0,
                  let currentLine = finite(current.line), currentLine > 0,
                  ["points", "probability_points"].contains(unit) else { return false }
        default:
            return false
        }

        if unit == "points" {
            return finite(movement.line_delta_for_pick) != nil
        }
        return finite(movement.price_delta_pp_for_pick) != nil
    }

    static func sweatState(_ signal: Signal) -> SweatState? {
        guard signal.kind == .theSweat,
              let raw = text(signal.sweat?.state)?.lowercased() else { return nil }
        switch raw {
        case "watch": return .watch
        case "holding": return .holding
        case "flipped": return .flipped
        case "held": return .held
        case "missed": return .missed
        case "push": return .push
        default: return nil
        }
    }

    static func isRenderableSweat(_ signal: Signal, includeWatch: Bool) -> Bool {
        guard let meta = signal.sweat,
              text(meta.kind)?.lowercased() == "the_sweat",
              text(meta.pick_id) != nil,
              text(signal.gameId) != nil,
              let factor = text(meta.factor_code)?.uppercased(), factors.contains(factor),
              date(meta.as_of) != nil,
              let state = sweatState(signal),
              includeWatch || state.isLiveOrFinal else { return false }

        let hasBaseline = value(meta.baseline) != nil || value(meta.baseline_selected) != nil
        let hasLive = value(meta.live_value) != nil
            || (value(meta.live_selected) != nil && value(meta.live_opponent) != nil)
        if state == .watch {
            guard hasBaseline else { return false }
        } else {
            guard hasLive else { return false }
        }

        if factor == "THE_NUMBER" {
            guard ["spread", "moneyline", "total"].contains(text(meta.market_type)?.lowercased() ?? "")
            else { return false }
        }
        return true
    }

    /// The caller supplies rows for one exact provider game. Once the audited
    /// ticket factor (THE_NUMBER) reaches a terminal state, older live snapshots
    /// cannot sit beside it or turn the section summary back into WATCH. Keep
    /// only explicit terminal states; no factor outcome is inferred here.
    static func finalScopedSweat(_ signals: [Signal]) -> [Signal] {
        let ticketIsTerminal = signals.contains { signal in
            text(signal.sweat?.factor_code)?.uppercased() == "THE_NUMBER"
                && sweatState(signal)?.isFinal == true
        }
        guard ticketIsTerminal else { return signals }
        return signals.filter { sweatState($0)?.isFinal == true }
    }

    static func isRenderableMarketRange(
        _ signal: Signal,
        slateRow: TomorrowBoardRow?,
        now: Date = Date()
    ) -> Bool {
        guard signal.kind == .marketRange,
              let meta = signal.marketRange,
              text(meta.kind)?.lowercased() == "market_range",
              text(meta.source)?.lowercased() == "balldontlie_odds",
              let signalGameID = text(signal.gameId),
              let slateRow,
              slateRow.bdl_game_id.map(String.init) == signalGameID,
              text(slateRow.kickoff_status)?.lowercased() == "confirmed",
              let kickoff = date(slateRow.commence_time), kickoff > now,
              let proofKickoff = date(meta.kickoff),
              abs(proofKickoff.timeIntervalSince(kickoff)) < 1,
              let observed = date(meta.as_of), observed < kickoff,
              observed <= now.addingTimeInterval(300),
              let market = text(meta.market)?.lowercased(),
              let metric = text(meta.metric)?.lowercased(),
              let low = meta.low, let high = meta.high, let range = meta.range,
              low <= high, range >= 0, abs((high - low) - range) < 0.001,
              let bookCount = meta.book_count, bookCount >= 3,
              let vendors = meta.vendors else { return false }

        let vendorKeys = Set(vendors.compactMap(text).map {
            $0.lowercased().filter { $0.isLetter || $0.isNumber }
        }.filter { !$0.isEmpty })
        guard vendorKeys.count == bookCount else { return false }

        switch market {
        case "total": return metric == "sportsbook_total_range"
        case "spread": return metric == "sportsbook_home_spread_range"
        default: return false
        }
    }
}

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
        deduped(signals.filter { FootballProofContract.isRenderableAfterGary($0) })
    }

    private var sweat: [Signal] {
        deduped(signals.filter {
            FootballProofContract.isRenderableSweat($0, includeWatch: false)
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
        guard let gameId = signal.gameId.flatMap(Int.init) else { return false }
        let slate = slateRows.first(where: { $0.bdl_game_id == gameId })
        return FootballProofContract.isRenderableMarketRange(signal, slateRow: slate)
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
                                    count: rows.count)

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
            FootballHubSectionTitle(title: "Gary's Number", count: rows.count)
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
        guard let label = signal.afterGary?.pick_label?
            .trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty else { return nil }
        return label.uppercased()
    }

    private var movement: (locked: String, current: String)? {
        guard let locked = primaryQuote(signal.afterGary?.published),
              let current = primaryQuote(signal.afterGary?.current) else { return nil }
        return (locked, current)
    }

    private var currentLabel: String {
        signal.afterGary?.footballMarketIsClosed == true ? "LAST PREGAME" : "NOW"
    }

    private var valueText: String? {
        guard let marketMove = signal.afterGary?.movement else { return nil }
        let advantage = (marketMove.advantage ?? "same").lowercased()
        guard advantage != "same",
              let value = marketMove.primary_value,
              value > 0 else { return "NO MOVE" }
        let owner = advantage == "gary" ? "GARY" : "NOW"
        let unit = (marketMove.primary_unit ?? "").lowercased() == "probability_points" ? "PP" : "PTS"
        return "\(owner) +\(unsignedNumber(value)) \(unit)"
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
            FootballHubSectionTitle(title: "Game Board", count: rows.count)
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
            FootballHubSectionTitle(title: "Live With Gary", count: rows.count)
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
        FootballProofContract.sweatState(signal)?.rawValue ?? "—"
    }

    private var stateColor: Color {
        switch state {
        case "FLIPPED": return GaryColors.loss
        case "PUSH": return GaryColors.sweating
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

// Header runs bare — no accent tick (founder, Aug 20).
private struct FootballHubSectionTitle: View {
    let title: String
    let count: Int

    var body: some View {
        HStack(alignment: .center, spacing: 9) {
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
