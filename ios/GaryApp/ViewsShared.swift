// ViewsShared.swift — Shared formatters, helpers, Liquid Glass design system, backgrounds.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Shared Formatters (expensive to create — reuse)

let isoFormatterFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

let isoFormatterNoFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

/// Parse an ISO8601 date string, trying fractional seconds first then without
func parseISO8601(_ string: String) -> Date? {
    isoFormatterFrac.date(from: string) ?? isoFormatterNoFrac.date(from: string)
}

struct BillfoldTopPickCandidate {
    let date: String
    let pickText: String
}

/// The shared page header — Billfold's formula applied app-wide: serif
/// display title, small mono accent on the same baseline, optional trailing
/// control, stitched seam. Flat — no containers competing with the content.
// THE ONE HEADER (Aug 4 2026, founder: pages "feel like not the same app or
// not the same template at the top", and big per-page mastheads read wrong).
// Before this, five pages ran five hand-built mastheads — five wordmark sizes
// (30–39pt rendered), three rule treatments, two type systems, three gutters.
// Now every page opens the same compact way: logo · two-tone wordmark · quiet
// meta · page tools · ⋯ · one gold hairline. ~40% shorter than the old heads.
// Page-specific control rows (league tabs, search field, scope toggles) stack
// BELOW this header in each page's own body — the template is the top line.
struct GaryPageHeader<Trailing: View>: View {
    let title: String
    /// Trailing wordmark segment rendered in GOLD ("A.I.", "HUB", "PICKS") —
    /// the two-tone idiom the Hub established. nil = single warm-white word.
    var goldPart: String? = nil
    var accent: String? = nil
    /// Optional tappable replacement for the plain `accent` date — Winners uses it for
    /// the date dropdown. Defaults nil so Home/Picks keep their static date unchanged.
    var accentMenu: AnyView? = nil
    /// Optional action for the wordmark itself. Picks uses this for its league
    /// switcher so VoiceOver gets a real Button while the shared header's
    /// geometry and independent profile control remain unchanged.
    var titleAction: (() -> Void)? = nil
    var titleAccessibilityLabel: String? = nil
    /// Rule under the header: gold hairline everywhere; Billfold passes its
    /// brass stitch — the wallet's one signature survives on the template.
    var rule: AnyView? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 9) {
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 26, height: 26)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                Group {
                    if let titleAction {
                        Button(action: titleAction) { wordmark }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text(titleAccessibilityLabel ?? title))
                            .accessibilityHint("Opens league switcher")
                    } else {
                        wordmark
                    }
                }
                .font(GaryFonts.display(24))
                .tracking(0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .layoutPriority(1)
                if let accentMenu {
                    accentMenu
                } else if let accent, !accent.isEmpty {
                    Text(accent)
                        .font(GaryFonts.kicker(11))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
                Spacer()
                trailing()
                // The corner belongs to the PERSON now (Aug 7): the profile
                // chip opens their book; settings rides inside the profile
                // (the gear), like most apps put it.
                ProfileHeaderChip()
            }
            .pageGutter()
            Group {
                if let rule {
                    rule
                } else {
                    Rectangle()
                        .fill(GaryColors.gold.opacity(0.35))
                        .frame(height: 1)
                }
            }
            .pageGutter()
        }
        .padding(.top, 10)
    }

    private var wordmark: Text {
        if let goldPart {
            return Text("\(title.uppercased()) ").foregroundColor(GaryColors.warmWhite)
                + Text(goldPart.uppercased()).foregroundColor(GaryColors.gold)
        }
        return Text(title.uppercased()).foregroundColor(GaryColors.warmWhite)
    }

    /// "Wednesday, June 4" — the standard header accent.
    static func dateLabel() -> String {
        let f = DateFormatter()
        f.dateFormat = "EEEE, MMMM d"
        return f.string(from: Date())
    }

    /// "Wed, Jun 4" — for headers whose trailing slot carries a badge.
    static func shortDateLabel() -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d"
        return f.string(from: Date())
    }
}

extension GaryPageHeader where Trailing == EmptyView {
    init(title: String, goldPart: String? = nil, accent: String? = nil,
         accentMenu: AnyView? = nil, rule: AnyView? = nil) {
        self.init(title: title, goldPart: goldPart, accent: accent,
                  accentMenu: accentMenu, rule: rule, trailing: { EmptyView() })
    }
}

struct StitchLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

struct BillfoldDayRow: Identifiable {
    let id: Date
    let label: String   // "JUN 2"
    let wins: Int
    let losses: Int
    let pushes: Int
    let net: Double     // units
}

/// One bucket of the conviction-calibration table: picks where Gary stated a
/// lean in this range, vs how often those picks actually won.
struct BillfoldCalibrationBucket: Identifiable {
    let id: String
    let label: String     // "75+"
    let claimed: Double   // mean stated lean in the bucket (0-1)
    let n: Int            // settled W/L count
    let wins: Int
    var hitRate: Double { n > 0 ? Double(wins) / Double(n) : 0 }
}

/// Trading-journal stats derived from the same filtered results as the rest
/// of the page: ROI on flat 1u stakes, last-10 result strip, best/worst day,
/// max drawdown on the cumulative curve, and a day-by-day session ledger.
struct BillfoldJournal {
    let roiPct: Double
    let last10: [String]          // oldest → newest ("won"/"lost"/"push")
    let bestDay: BillfoldDayRow?
    let worstDay: BillfoldDayRow?
    let maxDrawdownUnits: Double  // >= 0
    let days: [BillfoldDayRow]    // newest first, capped

    static let empty = BillfoldJournal(roiPct: 0, last10: [], bestDay: nil, worstDay: nil, maxDrawdownUnits: 0, days: [])
}

struct BillfoldDerivedState {
    let filteredGames: [GameResult]
    let filteredProps: [PropResult]
    let record: (wins: Int, losses: Int, pushes: Int)
    let netUnits: Double
    let streak: (label: String, value: String, positive: Bool)
    let trend: [BillfoldTrendPoint]
    let candles: [BillfoldCandlestick]
    let sportSeries: [BillfoldSportSeries]
    let availableSports: Set<String>
    let sortedSports: [Sport]
    let sportPerformance: [BillfoldSportPoint]
    let spreadPerformance: [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)]
    let topd: (wins: Int, losses: Int, pnl: Double)
    let spreadSportsAvailable: [String]
    let journal: BillfoldJournal
    let calibration: [BillfoldCalibrationBucket]
}

/// The values that actually change when a user taps a Billfold sport chip.
/// Keeping this separate prevents a simple filter tap from rebuilding every
/// all-sports series, spread table, and Top Pick calculation on the page.
struct BillfoldSelectionDerivedState {
    let filteredGames: [GameResult]
    let filteredProps: [PropResult]
    let record: (wins: Int, losses: Int, pushes: Int)
    let netUnits: Double
    let streak: (label: String, value: String, positive: Bool)
    let trend: [BillfoldTrendPoint]
    let candles: [BillfoldCandlestick]
    let sportPerformance: [BillfoldSportPoint]
    let journal: BillfoldJournal
    let calibration: [BillfoldCalibrationBucket]
}

struct BillfoldSnapshot {
    let windowKey: String
    let refreshedAt: Date
    let games: [GameResult]
    let props: [PropResult]
    let resultLookup: [String: GameResult]
    let topPickRows: [BillfoldTopPickCandidate]
    let confidenceIndex: [String: Double]
    let defaultDerivedState: BillfoldDerivedState
}

@MainActor
final class BillfoldSnapshotStore {
    static let shared = BillfoldSnapshotStore()

    private var snapshot: BillfoldSnapshot?
    private var inflightTask: Task<BillfoldSnapshot, Error>?
    private var inflightWindowKey: String?
    private var generation: Int = 0

    private init() {}

    /// How far back the DEFAULT (non-all-time) snapshot pages history. 150 days
    /// comfortably covers every bounded Billfold timeframe (7d/30d/90d) with
    /// margin; YTD + all-time fetch full history (see `needsFullHistory`).
    private static let defaultHistoryDays = 150

    /// `daily_picks.picks` contains the complete rationale/stat payload for
    /// every card and is far larger than the settled result ledger. Billfold
    /// only needs it to identify TOP PICK and confidence over its 7/30/90-day
    /// controls, so never download years of nested pick JSON for an all-time
    /// balance. The all-time record, ROI, chart, and recent receipts still use
    /// the complete result tables.
    private static let pickMetadataHistoryDays = 90

    static func pickMetadataSince() -> String {
        BillfoldCompute.dayFormatter.string(
            from: Calendar.current.date(
                byAdding: .day,
                value: -pickMetadataHistoryDays,
                to: Date()
            ) ?? Date()
        )
    }

    /// Timeframes whose window can exceed the bounded floor need full history.
    /// YTD late in the year can reach ~365 days, so it joins all-time here.
    static func needsFullHistory(timeframe: String) -> Bool {
        timeframe == "all" || timeframe == "ytd"
    }

    /// The cache/window key, scoped by whether this is the bounded or the full
    /// snapshot so a bounded snapshot is never handed back for an all-time
    /// request (and vice versa).
    private func windowKey(fullHistory: Bool) -> String {
        let base = SupabaseAPI.billfoldSnapshotWindowKey()
        return fullHistory ? "\(base)|full" : base
    }

    func cachedSnapshotIfFresh(fullHistory: Bool = false) -> BillfoldSnapshot? {
        let activeWindow = windowKey(fullHistory: fullHistory)
        guard let snapshot, snapshot.windowKey == activeWindow else { return nil }
        return snapshot
    }

    func prewarmIfNeeded() async {
        // ALL / Picks is the default view, so warm only its game ledger. The
        // all-time prop ledger is much larger; decoding it a couple seconds
        // after launch competes with whichever main tab the user opens next.
        // BillfoldView starts that prop fetch only after the page itself opens.
        _ = try? await load(fullHistory: true)
    }

    func load(forceRefresh: Bool = false, fullHistory: Bool = false) async throws -> BillfoldSnapshot {
        let activeWindow = windowKey(fullHistory: fullHistory)

        if !forceRefresh, let snapshot, snapshot.windowKey == activeWindow {
            return snapshot
        }

        if !forceRefresh, let inflightTask {
            // Only reuse the in-flight task if it's fetching the SAME breadth;
            // an all-time request must not adopt a bounded fetch's result.
            if inflightWindowKey == activeWindow {
                return try await inflightTask.value
            }
        }

        inflightTask?.cancel()

        generation += 1
        let requestGeneration = generation

        // Bound the default fetch to the last `defaultHistoryDays`; only an
        // explicit all-time / YTD selection pages the entire history. This keeps
        // the default 36h snapshot from downloading + decoding years of rows.
        let resultSince: String? = fullHistory
            ? nil
            : BillfoldCompute.dayFormatter.string(
                from: Calendar.current.date(byAdding: .day, value: -Self.defaultHistoryDays, to: Date()) ?? Date())
        // The visible default is the game-pick book, so make that ledger the
        // critical path. Props are hydrated immediately after this snapshot is
        // painted by BillfoldView.loadData(); they must never hold the first
        // frame hostage or compete with Home during the launch prewarm.
        // Detached (not the @MainActor-inherited `Task {}`) keeps both decoding
        // and the heavy deriveState work off the main actor.
        let task = Task.detached(priority: .utility) {
            let games = try await withTimeout(seconds: 30) {
                try await SupabaseAPI.fetchAllGameResults(
                    since: resultSince,
                    forceRefresh: forceRefresh,
                    billfold: true
                )
            }
            let props: [PropResult] = []

            let resultLookup = BillfoldCompute.gameResultLookup(from: games)
            let defaultDerivedState = BillfoldCompute.deriveState(
                selectedTab: 0,
                selectedSport: .all,
                timeframe: "all",
                sportTimeframe: "7d",
                spreadSport: "NBA",
                topdTimeframe: "7d",
                gameResults: games,
                propResults: props,
                resultLookup: resultLookup,
                topPickRows: [],
                confidenceIndex: [:]
            )

            return BillfoldSnapshot(
                windowKey: activeWindow,
                refreshedAt: Date(),
                games: games,
                props: props,
                resultLookup: resultLookup,
                topPickRows: [],
                confidenceIndex: [:],
                defaultDerivedState: defaultDerivedState
            )
        }

        inflightTask = task
        inflightWindowKey = activeWindow

        do {
            let freshSnapshot = try await task.value
            if requestGeneration == generation {
                snapshot = freshSnapshot
                inflightTask = nil
                inflightWindowKey = nil
            }
            return freshSnapshot
        } catch {
            if requestGeneration == generation {
                inflightTask = nil
                inflightWindowKey = nil
            }
            throw error
        }
    }
}

enum BillfoldCompute {
    static let requiredSports = ["NBA", "NHL", "NCAAB", "NFL", "NCAAF"]
    static let spreadRegex = try? NSRegularExpression(pattern: #"[+-]\d{1,2}(?:\.\d)?"#)
    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        return formatter
    }()
    static let displayDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, yyyy"
        return formatter
    }()

    static func parseDate(_ string: String) -> Date? {
        if let date = parseISO8601(string) {
            return date
        }
        return dayFormatter.date(from: string)
    }

    static func date(from iso: String?) -> Date {
        parseDate(iso ?? "") ?? Date.distantPast
    }

    /// Result rows are keyed by ISO calendar dates. Keep filtering and sorting
    /// on that stable key instead of repeatedly constructing DateFormatter
    /// values inside O(n log n) sorts. Full Date parsing remains only where a
    /// chart actually needs a Date axis.
    static func dateKey(_ iso: String?) -> String {
        String((iso ?? "").prefix(10))
    }

    static func cutoffKey(_ cutoff: Date?) -> String? {
        cutoff.map(dayFormatter.string(from:))
    }

    static func parseAmericanOdds(_ string: String?) -> Int? {
        guard let cleaned = string?.replacingOccurrences(of: "+", with: "").trimmingCharacters(in: .whitespacesAndNewlines),
              let value = Int(cleaned),
              value != 0 else { return nil }
        return value
    }

    static func units(for result: String?, odds: String?) -> Double {
        switch result {
        case "won":
            guard let american = parseAmericanOdds(odds) else { return 0.9 }
            if american > 0 {
                return Double(american) / 100.0
            }
            return 100.0 / Double(abs(american))
        case "lost":
            return -1
        case "push":
            return 0
        default:
            return 0
        }
    }

    static func isLegitPropResult(_ result: PropResult) -> Bool {
        let hasPlayer = !(result.player_name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasPropType = !(result.prop_type?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasBet = !(result.bet?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasLine = !(result.line_value?.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return hasPlayer || hasPropType || hasBet || hasLine
    }

    static func winRate(from results: [String?]) -> Double {
        let wins = results.filter { $0 == "won" }.count
        let losses = results.filter { $0 == "lost" }.count
        let decisive = max(1, wins + losses)
        return (Double(wins) / Double(decisive)) * 100
    }

    static func groupedSportPerformance(from rows: [(String?, String?, String?)]) -> [BillfoldSportPoint] {
        Dictionary(grouping: rows) { $0.0 ?? "Other" }
            .map { sport, values in
                BillfoldSportPoint(
                    sport: sport,
                    netUnits: values.reduce(0.0) { $0 + units(for: $1.1, odds: $1.2) },
                    winRate: winRate(from: values.map { $0.1 }),
                    settledCount: values.filter { ["won", "lost", "push"].contains($0.1 ?? "") }.count
                )
            }
            .sorted { $0.netUnits > $1.netUnits }
    }

    static func topPickCandidates(from metadata: [BillfoldPickMetadata]) -> [BillfoldTopPickCandidate] {
        Dictionary(grouping: metadata, by: \.date).compactMap { date, picks in
            let topPick = picks.first(where: \.isTopPick)
                ?? picks.max(by: { ($0.confidence ?? 0) < ($1.confidence ?? 0) })
            guard let topPick else { return nil }
            return BillfoldTopPickCandidate(date: date, pickText: topPick.pick)
        }
    }

    static func confidenceIndex(from metadata: [BillfoldPickMetadata]) -> [String: Double] {
        var index: [String: Double] = [:]
        for item in metadata {
            guard let rawConfidence = item.confidence, rawConfidence > 0 else { continue }
            let confidence = rawConfidence > 1 ? rawConfidence / 100 : rawConfidence
            index["\(item.date)|\(item.pick)"] = confidence
            index[normalizedPickKey(date: item.date, pick: item.pick)] = confidence
        }
        return index
    }

    static func normalizedPickKey(date: String, pick: String) -> String {
        var t = pick.lowercased().trimmingCharacters(in: .whitespaces)
        if let regex = try? NSRegularExpression(pattern: #"\s+[+-]\d{3,}$"#),
           let m = regex.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)),
           let r = Range(m.range, in: t) {
            t = String(t[t.startIndex..<r.lowerBound])
        }
        t = t.split(separator: " ").joined(separator: " ")
        return "n|\(date)|\(t)"
    }

    /// Conviction calibration: bucket settled W/L results by Gary's stated
    /// lean and compare claimed lean to actual hit rate. Game picks join to
    /// confidence via the index; prop results carry their own confidence.
    static func calibration(
        selectedTab: Int,
        games: [GameResult],
        props: [PropResult],
        confidenceIndex: [String: Double]
    ) -> [BillfoldCalibrationBucket] {
        var pairs: [(conf: Double, won: Bool)] = []
        if selectedTab == 0 {
            for g in games {
                guard let r = g.result, r == "won" || r == "lost",
                      let date = g.game_date, let text = g.pick_text else { continue }
                let raw = confidenceIndex["\(date)|\(text)"]
                    ?? confidenceIndex[normalizedPickKey(date: date, pick: text)]
                guard let c = raw, c > 0 else { continue }
                pairs.append((c > 1 ? c / 100 : c, r == "won"))
            }
        } else {
            for p in props {
                guard let r = p.result, r == "won" || r == "lost",
                      let c = p.confidence, c > 0 else { continue }
                pairs.append((c > 1 ? c / 100 : c, r == "won"))
            }
        }

        let defs: [(label: String, range: Range<Double>)] = [
            ("<65", 0.0..<0.65),
            ("65\u{2013}69", 0.65..<0.70),
            ("70\u{2013}74", 0.70..<0.75),
            ("75+", 0.75..<1.01)
        ]
        return defs.compactMap { def in
            let inBucket = pairs.filter { def.range.contains($0.conf) }
            guard !inBucket.isEmpty else { return nil }
            let claimed = inBucket.reduce(0.0) { $0 + $1.conf } / Double(inBucket.count)
            return BillfoldCalibrationBucket(
                id: def.label,
                label: def.label,
                claimed: claimed,
                n: inBucket.count,
                wins: inBucket.filter { $0.won }.count
            )
        }
    }

    static func gameResultLookup(from rows: [GameResult]) -> [String: GameResult] {
        var lookup: [String: GameResult] = [:]
        lookup.reserveCapacity(rows.count)
        for row in rows {
            guard let date = row.game_date, let pick = row.pick_text else { continue }
            lookup["\(date)|\(pick)"] = row
        }
        return lookup
    }

    static func sportPerformance(
        selectedTab: Int,
        selectedSport: Sport,
        gameRows: [GameResult],
        propRows: [PropResult]
    ) -> [BillfoldSportPoint] {
        var points: [BillfoldSportPoint]
        if selectedTab == 0 {
            points = groupedSportPerformance(from: gameRows.map { ($0.effectiveLeague, $0.result, $0.effectiveOdds) })
        } else {
            points = groupedSportPerformance(from: propRows.map { ($0.effectiveLeague, $0.result, $0.odds?.value) })
        }

        for sport in requiredSports where !points.contains(where: { $0.sport == sport }) {
            points.append(BillfoldSportPoint(sport: sport, netUnits: 0, winRate: 0, settledCount: 0))
        }

        points.sort { $0.netUnits > $1.netUnits }
        // If a sport is selected, move it to the top
        if selectedSport != .all {
            let selected = selectedSport.rawValue
            let matchIdx = points.firstIndex(where: { $0.sport == selected })
            if let idx = matchIdx, idx > 0 {
                let item = points.remove(at: idx)
                points.insert(item, at: 0)
            }
        }
        return points
    }

    static func topdStats(
        timeframe: String,
        resultLookup: [String: GameResult],
        topPickRows: [BillfoldTopPickCandidate]
    ) -> (wins: Int, losses: Int, pnl: Double) {
        let cutoff = BillfoldView.sinceDateValueStatic(for: timeframe)
        var wins = 0
        var losses = 0
        var pnl = 0.0

        for row in topPickRows {
            if let cutoff, date(from: row.date) < cutoff {
                continue
            }

            guard let result = resultLookup["\(row.date)|\(row.pickText)"] else {
                continue
            }

            switch result.result {
            case "won":
                wins += 1
                pnl += units(for: "won", odds: result.effectiveOdds)
            case "lost":
                losses += 1
                pnl += units(for: "lost", odds: result.effectiveOdds)
            default:
                break
            }
        }

        return (wins, losses, pnl)
    }

    static func spreadPerf(
        selectedTab: Int,
        spreadSport: String,
        buckets: [(String, ClosedRange<Double>)],
        results: [GameResult]
    ) -> [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] {
        guard selectedTab == 0 else { return [] }

        let sportResults = results.filter { ($0.effectiveLeague ?? "") == spreadSport }
        guard !sportResults.isEmpty, let regex = spreadRegex else { return [] }

        let withSpreads: [(GameResult, Double)] = sportResults.compactMap { result in
            guard let pickText = result.pick_text else { return nil }
            let matches = regex.matches(in: pickText, range: NSRange(pickText.startIndex..., in: pickText))
            guard let match = matches.first, let swiftRange = Range(match.range, in: pickText) else { return nil }
            let magnitude = abs(Double(pickText[swiftRange]) ?? 0)
            return magnitude > 0 ? (result, magnitude) : nil
        }

        return buckets.compactMap { label, range in
            let matching = withSpreads.filter { range.contains($0.1) }.map(\.0)
            guard !matching.isEmpty else { return nil }

            var wins = 0
            var losses = 0
            var pushes = 0
            var net = 0.0

            for result in matching {
                switch result.result {
                case "won":
                    wins += 1
                    net += units(for: "won", odds: result.effectiveOdds)
                case "lost":
                    losses += 1
                    net += units(for: "lost", odds: result.effectiveOdds)
                case "push":
                    pushes += 1
                default:
                    break
                }
            }

            return (label, wins, losses, pushes, net)
        }
    }

    static func spreadBuckets(for sport: String) -> [(String, ClosedRange<Double>)] {
        switch sport {
        case "NBA":
            return [
                ("1-3", 0.5...3.5),
                ("4-6", 3.6...6.5),
                ("7-9", 6.6...9.5),
                ("10+", 9.6...99)
            ]
        case "NCAAB":
            return [
                ("1-4", 0.5...4.5),
                ("5-9", 4.6...9.5),
                ("10+", 9.6...99)
            ]
        case "NFL":
            return [
                ("1-3", 0.5...3.5),
                ("4-7", 3.6...7.5),
                ("8-14", 7.6...14.5),
                ("15+", 14.6...99)
            ]
        case "NCAAF":
            return [
                ("1-6", 0.5...6.5),
                ("7-14", 6.6...14.5),
                ("15-21", 14.6...21.5),
                ("22+", 21.6...99)
            ]
        case "MLB":
            return [
                ("1-1.5", 0.5...1.5),
                ("2-4", 1.6...4.5),
                ("5+", 4.6...99)
            ]
        default:
            return [
                ("1-3", 0.5...3.5),
                ("4-6", 3.6...6.5),
                ("7-10", 6.6...10.5),
                ("10+", 9.6...99)
            ]
        }
    }

    static func spreadSportsAvailable(from results: [GameResult]) -> [String] {
        var sports = [String]()
        let leagues = Set(results.compactMap { $0.effectiveLeague })
        for sport in ["NBA", "NCAAB", "NFL", "NCAAF", "MLB"] where leagues.contains(sport) {
            sports.append(sport)
        }
        if !sports.contains("NBA") {
            sports.insert("NBA", at: 0)
        }
        return sports
    }

    static func dailyTrend(items: [(String?, Double)]) -> [BillfoldTrendPoint] {
        let grouped = Dictionary(grouping: items.compactMap { item -> (String, Double)? in
            let key = dateKey(item.0)
            return key.isEmpty ? nil : (key, item.1)
        }) { $0.0 }

        var running = 0.0
        return grouped.keys.sorted().compactMap { key in
            guard let date = dayFormatter.date(from: key) else { return nil }
            let total = grouped[key]?.reduce(0.0) { $0 + $1.1 } ?? 0
            running += total
            return BillfoldTrendPoint(
                date: date,
                label: Formatters.formatDate(isoFormatterNoFrac.string(from: date)),
                units: total,
                cumulative: running
            )
        }
    }

    static func dailyCandlesticks(items: [(String?, Double)]) -> [BillfoldCandlestick] {
        let grouped = Dictionary(grouping: items.compactMap { item -> (String, Double)? in
            let key = dateKey(item.0)
            return key.isEmpty ? nil : (key, item.1)
        }) { $0.0 }

        var running = 0.0
        return grouped.keys.sorted().compactMap { key in
            guard let date = dayFormatter.date(from: key) else { return nil }
            let bets = grouped[key]?.map { $0.1 } ?? []
            let dayOpen = running
            var intraHigh = running
            var intraLow = running
            var cursor = running
            for bet in bets {
                cursor += bet
                intraHigh = max(intraHigh, cursor)
                intraLow = min(intraLow, cursor)
            }
            running = cursor
            return BillfoldCandlestick(
                date: date,
                open: dayOpen,
                close: running,
                high: intraHigh,
                low: intraLow
            )
        }
    }

    /// Per-sport cumulative equity lines: group the active window's rows by
    /// league and run the daily trend per group. Only leagues with at least
    /// one settled result draw a line.
    static func sportSeries(
        selectedTab: Int,
        games: [GameResult],
        props: [PropResult]
    ) -> [BillfoldSportSeries] {
        let items: [(league: String?, date: String?, units: Double, result: String?)]
        if selectedTab == 0 {
            items = games.map { ($0.effectiveLeague, $0.game_date, units(for: $0.result, odds: $0.effectiveOdds), $0.result) }
        } else {
            items = props.map { ($0.effectiveLeague, $0.game_date, units(for: $0.result, odds: $0.odds?.value), $0.result) }
        }

        let grouped = Dictionary(grouping: items) { $0.league ?? "OTHER" }
        var series: [BillfoldSportSeries] = grouped.compactMap { league, rows in
            let settled = rows.filter { $0.result == "won" || $0.result == "lost" || $0.result == "push" }.count
            guard settled > 0 else { return nil }
            let trend = dailyTrend(items: rows.map { ($0.date, $0.units) })
            guard !trend.isEmpty else { return nil }
            return BillfoldSportSeries(
                league: league,
                points: trend,
                netUnits: trend.last?.cumulative ?? 0,
                settled: settled
            )
        }
        series.sort { abs($0.netUnits) > abs($1.netUnits) }
        return series
    }

    static func streakSummary(from items: [(String?, String?)]) -> (label: String, value: String, positive: Bool) {
        var dayOrder: [String] = []
        var dayResults: [String: [String]] = [:]

        for (dateStr, result) in items {
            guard let dateStr, let result, ["won", "lost", "push"].contains(result) else { continue }
            let key = String(dateStr.prefix(10))
            if dayResults[key] == nil {
                dayOrder.append(key)
            }
            dayResults[key, default: []].append(result)
        }

        dayOrder.sort(by: >)
        let dayOutcomes: [String] = dayOrder.compactMap { day in
            let results = dayResults[day] ?? []
            let wins = results.filter { $0 == "won" }.count
            let losses = results.filter { $0 == "lost" }.count
            if wins > losses { return "W" }
            if losses > wins { return "L" }
            return nil
        }

        guard let first = dayOutcomes.first else {
            return ("Streak", "--", true)
        }

        let count = dayOutcomes.prefix { $0 == first }.count
        return ("Streak", "\(count)\(first)", first == "W")
    }

    static func sortGames(_ rows: [GameResult]) -> [GameResult] {
        rows.sorted { dateKey($0.game_date) > dateKey($1.game_date) }
    }

    static func sortProps(_ rows: [PropResult]) -> [PropResult] {
        rows.sorted { dateKey($0.game_date) > dateKey($1.game_date) }
    }

    static func filterGameResults(
        _ rows: [GameResult],
        cutoff: Date?,
        selectedSport: Sport
    ) -> [GameResult] {
        let filteredByTime = cutoffKey(cutoff).map { key in
            rows.filter { dateKey($0.game_date) >= key }
        } ?? rows

        let filteredBySport: [GameResult]
        if selectedSport == .all {
            filteredBySport = filteredByTime
        } else {
            filteredBySport = filteredByTime.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        }

        return sortGames(filteredBySport)
    }

    static func filterPropResults(
        _ rows: [PropResult],
        cutoff: Date?,
        selectedSport: Sport
    ) -> [PropResult] {
        let validRows = rows.filter(isLegitPropResult)
        let filteredByTime = cutoffKey(cutoff).map { key in
            validRows.filter { dateKey($0.game_date) >= key }
        } ?? validRows

        let filteredBySport: [PropResult]
        switch selectedSport {
        case .all:
            // NFL TDs and MLB HRs are dedicated fun lanes. NCAAF touchdown
            // props are core NCAAF results and remain part of ALL.
            filteredBySport = filteredByTime.filter { !$0.isNFLTDResult && !$0.isHRResult }
        case .nflTDs:
            filteredBySport = filteredByTime.filter { $0.isNFLTDResult }
        case .nfl:
            filteredBySport = filteredByTime.filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isNFLTDResult }
        case .mlbHR:
            // prop_type match, not the sport string — grader rows carry no
            // sport column, so the old rawValue compare matched nothing.
            filteredBySport = filteredByTime.filter { $0.isHRResult }
        case .mlb:
            filteredBySport = filteredByTime.filter { ($0.effectiveLeague ?? "") == "MLB" && !$0.isHRResult }
        default:
            filteredBySport = filteredByTime.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        }

        return sortProps(filteredBySport)
    }

    static func availableSports(selectedTab: Int, gameRows: [GameResult], propRows: [PropResult]) -> Set<String> {
        if selectedTab == 0 {
            return Set(gameRows.compactMap { $0.effectiveLeague })
        }

        // An NFL scorer row belongs to the dedicated NFL TDs chip, not the
        // regular NFL chip. NCAAF touchdown rows are deliberately retained.
        var leagues = Set(propRows.filter { !$0.isNFLTDResult }.compactMap { $0.effectiveLeague })
        if propRows.contains(where: { $0.isNFLTDResult }) {
            leagues.insert("NFL TDs")
        }
        // HR rows infer effectiveLeague "MLB" (no sport column on grader
        // rows) — surface the fun-lane chip off the prop_type instead.
        if propRows.contains(where: { $0.isHRResult }) {
            leagues.insert("MLB HR")
        }
        return leagues
    }

    static func sortedSports(
        selectedTab: Int,
        availableSports: Set<String>,
        gameRows: [GameResult],
        propRows: [PropResult]
    ) -> [Sport] {
        // Only ALL + sports that actually have entries in the active window/tab.
        // Put the sport being played most recently immediately after ALL, so
        // the in-season league leads naturally (MLB in August, NFL in fall,
        // etc.) without a calendar of hard-coded season boundaries.
        let visible = Sport.allCases.filter { sport in
            if sport == .all { return true }
            if selectedTab == 0 && sport.isPropsOnly { return false }
            return availableSports.contains(sport.rawValue)
        }
        let originalOrder = Dictionary(uniqueKeysWithValues: Sport.allCases.enumerated().map { ($0.element, $0.offset) })

        func latestDate(for sport: Sport) -> String {
            if selectedTab == 0 {
                return gameRows
                    .filter { $0.effectiveLeague == sport.rawValue }
                    .compactMap(\.game_date)
                    .max() ?? ""
            }
            return propRows.filter { row in
                switch sport {
                case .nflTDs: return row.isNFLTDResult
                case .nfl: return row.effectiveLeague == "NFL" && !row.isNFLTDResult
                case .mlbHR: return row.isHRResult
                default: return row.effectiveLeague == sport.rawValue
                }
            }
            .compactMap(\.game_date)
            .max() ?? ""
        }

        let leagues = visible.filter { $0 != .all }.sorted { lhs, rhs in
            let leftDate = latestDate(for: lhs)
            let rightDate = latestDate(for: rhs)
            if leftDate != rightDate { return leftDate > rightDate }
            return (originalOrder[lhs] ?? .max) < (originalOrder[rhs] ?? .max)
        }
        return [.all] + leagues
    }

    private static let journalDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f
    }()

    static func journal(
        streakItems: [(String?, String?)],
        trend: [BillfoldTrendPoint],
        record: (wins: Int, losses: Int, pushes: Int),
        netUnits: Double
    ) -> BillfoldJournal {
        let settled = record.wins + record.losses + record.pushes
        let roiPct = settled > 0 ? netUnits / Double(settled) * 100 : 0

        // Last 10 individual results, oldest → newest (newest renders rightmost)
        let sortedResults = streakItems
            .compactMap { item -> (String, String)? in
                guard let r = item.1, r == "won" || r == "lost" || r == "push" else { return nil }
                let key = dateKey(item.0)
                return key.isEmpty ? nil : (key, r)
            }
            .sorted { $0.0 < $1.0 }
        let last10 = Array(sortedResults.suffix(10)).map { $0.1 }

        // Per-day W-L-P from the bet results; per-day net from the trend series
        let cal = Calendar.current
        var dayRecord: [String: (w: Int, l: Int, p: Int)] = [:]
        for item in streakItems {
            guard let r = item.1, r == "won" || r == "lost" || r == "push" else { continue }
            let key = dateKey(item.0)
            guard !key.isEmpty else { continue }
            var rec = dayRecord[key] ?? (0, 0, 0)
            if r == "won" { rec.w += 1 } else if r == "lost" { rec.l += 1 } else { rec.p += 1 }
            dayRecord[key] = rec
        }
        var days: [BillfoldDayRow] = trend.map { point in
            let d = cal.startOfDay(for: point.date)
            let rec = dayRecord[dayFormatter.string(from: d)] ?? (0, 0, 0)
            return BillfoldDayRow(
                id: d,
                label: journalDayFormatter.string(from: d).uppercased(),
                wins: rec.w, losses: rec.l, pushes: rec.p,
                net: point.units
            )
        }
        days.sort { $0.id > $1.id }

        let bestDay = days.max { $0.net < $1.net }
        let worstDay = days.min { $0.net < $1.net }

        // Max drawdown over the cumulative curve (peak-to-trough, from 0 start)
        var peak = 0.0
        var maxDD = 0.0
        for p in trend.sorted(by: { $0.date < $1.date }) {
            peak = max(peak, p.cumulative)
            maxDD = max(maxDD, peak - p.cumulative)
        }

        return BillfoldJournal(
            roiPct: roiPct,
            last10: last10,
            bestDay: bestDay,
            worstDay: worstDay,
            maxDrawdownUnits: maxDD,
            days: Array(days.prefix(10))
        )
    }

    /// Focused derivation for the controls users tap most often. The previous
    /// path called `deriveState` for every sport chip, repeating unrelated
    /// all-sports charts and ledgers before the selected numbers could update.
    static func deriveSelectionState(
        selectedTab: Int,
        selectedSport: Sport,
        timeframe: String,
        sportTimeframe: String,
        gameResults: [GameResult],
        propResults: [PropResult],
        confidenceIndex: [String: Double]
    ) -> BillfoldSelectionDerivedState {
        let timeframeCutoff = BillfoldView.sinceDateValueStatic(for: timeframe)
        let sportTimeframeCutoff = BillfoldView.sinceDateValueStatic(for: sportTimeframe)
        let filteredGames = filterGameResults(gameResults, cutoff: timeframeCutoff, selectedSport: selectedSport)
        let filteredProps = filterPropResults(propResults, cutoff: timeframeCutoff, selectedSport: selectedSport)

        let activeResults = selectedTab == 0
            ? filteredGames.map { $0.result ?? "" }
            : filteredProps.map { $0.result ?? "" }
        let record = activeResults.reduce(into: (wins: 0, losses: 0, pushes: 0)) { acc, result in
            switch result {
            case "won": acc.wins += 1
            case "lost": acc.losses += 1
            case "push": acc.pushes += 1
            default: break
            }
        }

        let netUnits: Double
        let streakItems: [(String?, String?)]
        let trendItems: [(String?, Double)]
        if selectedTab == 0 {
            netUnits = filteredGames.reduce(0) { $0 + units(for: $1.result, odds: $1.effectiveOdds) }
            streakItems = filteredGames.map { ($0.game_date, $0.result) }
            trendItems = filteredGames.map { ($0.game_date, units(for: $0.result, odds: $0.effectiveOdds)) }
        } else {
            netUnits = filteredProps.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
            streakItems = filteredProps.map { ($0.game_date, $0.result) }
            trendItems = filteredProps.map { ($0.game_date, units(for: $0.result, odds: $0.odds?.value)) }
        }

        let trend = dailyTrend(items: trendItems)
        let validProps = propResults.filter(isLegitPropResult)
        let sportGames = filterGameResults(gameResults, cutoff: sportTimeframeCutoff, selectedSport: .all)
        let sportProps = cutoffKey(sportTimeframeCutoff).map { key in
            validProps.filter { dateKey($0.game_date) >= key }
        } ?? validProps

        return BillfoldSelectionDerivedState(
            filteredGames: filteredGames,
            filteredProps: filteredProps,
            record: record,
            netUnits: netUnits,
            streak: streakSummary(from: streakItems),
            trend: trend,
            candles: dailyCandlesticks(items: trendItems),
            sportPerformance: sportPerformance(
                selectedTab: selectedTab,
                selectedSport: selectedSport,
                gameRows: sportGames,
                propRows: sportProps.filter { !$0.isNFLTDResult && !$0.isHRResult }
            ),
            journal: journal(streakItems: streakItems, trend: trend, record: record, netUnits: netUnits),
            calibration: calibration(
                selectedTab: selectedTab,
                games: filteredGames,
                props: filteredProps,
                confidenceIndex: confidenceIndex
            )
        )
    }

    static func deriveState(
        selectedTab: Int,
        selectedSport: Sport,
        timeframe: String,
        sportTimeframe: String,
        spreadSport: String,
        topdTimeframe: String,
        gameResults: [GameResult],
        propResults: [PropResult],
        resultLookup: [String: GameResult],
        topPickRows: [BillfoldTopPickCandidate],
        confidenceIndex: [String: Double]
    ) -> BillfoldDerivedState {
        // The Billfold is the record book: preseason football never counts in
        // it and never lists in it (founder law, Aug 21 2026). The picks stay
        // graded on the pick surfaces — the board's result stamps ride the
        // unfiltered resultLookup, which is built outside this derive.
        let gameResults = gameResults.countable
        let timeframeCutoff = BillfoldView.sinceDateValueStatic(for: timeframe)
        let sportTimeframeCutoff = BillfoldView.sinceDateValueStatic(for: sportTimeframe)
        let validProps = propResults.filter(isLegitPropResult)
        let timeframeGamesAll = filterGameResults(gameResults, cutoff: timeframeCutoff, selectedSport: .all)
        let timeframePropsAll = cutoffKey(timeframeCutoff).map { key in
            validProps.filter { dateKey($0.game_date) >= key }
        } ?? validProps
        let sportTimeframeGames = filterGameResults(gameResults, cutoff: sportTimeframeCutoff, selectedSport: .all)
        let sportTimeframeProps = cutoffKey(sportTimeframeCutoff).map { key in
            validProps.filter { dateKey($0.game_date) >= key }
        } ?? validProps
        // Dedicated fun lanes (MLB HR and NFL TD) never touch Gary's core
        // metrics. NCAAF touchdown props are regular NCAAF results, so they
        // remain in ALL, the by-sport grid and the NCAAF equity line.
        let metricsPropsAll = timeframePropsAll.filter { !$0.isNFLTDResult && !$0.isHRResult }
        let metricsSportProps = sportTimeframeProps.filter { !$0.isNFLTDResult && !$0.isHRResult }
        let filteredGames = filterGameResults(gameResults, cutoff: timeframeCutoff, selectedSport: selectedSport)
        let filteredProps = filterPropResults(propResults, cutoff: timeframeCutoff, selectedSport: selectedSport)

        let activeResults = selectedTab == 0 ? filteredGames.map { $0.result ?? "" } : filteredProps.map { $0.result ?? "" }
        let record = activeResults.reduce(into: (wins: 0, losses: 0, pushes: 0)) { acc, result in
            switch result {
            case "won":
                acc.wins += 1
            case "lost":
                acc.losses += 1
            case "push":
                acc.pushes += 1
            default:
                break
            }
        }

        let netUnits: Double
        let streakItems: [(String?, String?)]
        let trendItems: [(String?, Double)]
        if selectedTab == 0 {
            netUnits = filteredGames.reduce(0) { $0 + units(for: $1.result, odds: $1.effectiveOdds) }
            streakItems = filteredGames.map { ($0.game_date, $0.result) }
            trendItems = filteredGames.map { ($0.game_date, units(for: $0.result, odds: $0.effectiveOdds)) }
        } else {
            netUnits = filteredProps.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
            streakItems = filteredProps.map { ($0.game_date, $0.result) }
            trendItems = filteredProps.map { ($0.game_date, units(for: $0.result, odds: $0.odds?.value)) }
        }

        let trend = dailyTrend(items: trendItems)
        let candles = dailyCandlesticks(items: trendItems)

        let availableSports = availableSports(selectedTab: selectedTab, gameRows: timeframeGamesAll, propRows: timeframePropsAll)
        let spreadBuckets = spreadBuckets(for: spreadSport)
        let journalData = journal(streakItems: streakItems, trend: trend, record: record, netUnits: netUnits)
        let calib = calibration(selectedTab: selectedTab, games: filteredGames, props: filteredProps, confidenceIndex: confidenceIndex)

        return BillfoldDerivedState(
            filteredGames: filteredGames,
            filteredProps: filteredProps,
            record: record,
            netUnits: netUnits,
            streak: streakSummary(from: streakItems),
            trend: trend,
            candles: candles,
            sportSeries: sportSeries(selectedTab: selectedTab, games: timeframeGamesAll, props: metricsPropsAll),
            availableSports: availableSports,
            sortedSports: sortedSports(
                selectedTab: selectedTab,
                availableSports: availableSports,
                gameRows: timeframeGamesAll,
                propRows: timeframePropsAll
            ),
            sportPerformance: sportPerformance(
                selectedTab: selectedTab,
                selectedSport: selectedSport,
                gameRows: sportTimeframeGames,
                propRows: metricsSportProps
            ),
            spreadPerformance: spreadPerf(
                selectedTab: selectedTab,
                spreadSport: spreadSport,
                buckets: spreadBuckets,
                results: timeframeGamesAll
            ),
            topd: topdStats(
                timeframe: topdTimeframe,
                resultLookup: resultLookup,
                topPickRows: topPickRows
            ),
            spreadSportsAvailable: spreadSportsAvailable(from: timeframeGamesAll),
            journal: journalData,
            calibration: calib
        )
    }
}

// MARK: - Performance Helpers

/// Detects if device needs performance optimizations based on hardware capability
enum PerformanceMode {
    /// Full effects for high-end devices (iOS 18+ or ProMotion displays)
    case full
    /// Lighter effects for older/slower devices
    case lite

    static var current: PerformanceMode {
        // iOS 18+ devices are generally powerful enough for full effects
        // iOS 17 and below (including iPhone 14 on iOS 17) get lite mode
        if #available(iOS 18.0, *) {
            return .full
        } else {
            return .lite
        }
    }

    /// Variant that also respects the user's Reduce Motion accessibility setting
    static func current(reduceMotion: Bool) -> PerformanceMode {
        if reduceMotion { return .lite }
        if #available(iOS 18.0, *) {
            return .full
        } else {
            return .lite
        }
    }

    /// Whether to use expensive effects like blend modes and multiple shadows
    var useExpensiveEffects: Bool {
        self == .full
    }
}

// MARK: - Relative Time Formatter

func relativeTimeString(from date: Date) -> String {
    let seconds = Int(Date().timeIntervalSince(date))
    if seconds < 60 { return "Updated just now" }
    let minutes = seconds / 60
    if minutes < 60 { return "Updated \(minutes)m ago" }
    let hours = minutes / 60
    return "Updated \(hours)h ago"
}

/// Shorten "Los Angeles Kings @ New York Islanders" → "Kings @ Islanders".
/// Keeps two-word mascots intact ("Toronto Blue Jays @ Chicago White Sox"
/// → "Blue Jays @ White Sox", not "Jays @ Sox").
func shortenMatchup(_ matchup: String) -> String {
    let parts = matchup.components(separatedBy: " @ ")
    guard parts.count == 2 else { return matchup }
    return "\(Formatters.proMascot(parts[0])) @ \(Formatters.proMascot(parts[1]))"
}

// MARK: - Async Helpers

/// Execute an async operation with a timeout
func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask {
            try await operation()
        }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw URLError(.timedOut)
        }
        guard let result = try await group.next() else {
            throw URLError(.timedOut)
        }
        group.cancelAll()
        return result
    }
}

// MARK: - Liquid Glass Design System

/// True Liquid Glass modifier using overlay blend mode for authentic refraction
extension View {
    func liquidGlass(cornerRadius: CGFloat = 20, intensity: GlassIntensity = .regular) -> some View {
        self.background {
            ZStack {
                // 1. Base Material (The Refraction)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(intensity.material)
                    .opacity(intensity.opacity)
                
                // 2. Liquid Shine (Top Gradient with Overlay Blend)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.45), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // 3. Edge Light (Rim)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.5), .white.opacity(0.1)],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.8
                    )
            }
        }
        // 4. Drop Shadow (Depth)
        .shadow(color: .black.opacity(0.15), radius: 10, y: 8)
    }
    
    func liquidGlassInteractive(cornerRadius: CGFloat = 20) -> some View {
        self.liquidGlass(cornerRadius: cornerRadius, intensity: .regular)
    }
    
    func liquidGlassCircle(intensity: GlassIntensity = .regular) -> some View {
        self.background {
            ZStack {
                // Base Material
                Circle()
                    .fill(intensity.material)
                    .opacity(intensity.opacity)
                
                // Liquid Shine
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.45), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // Edge Light
                Circle()
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.5), .white.opacity(0.1)],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.8
                    )
            }
        }
        .shadow(color: .black.opacity(0.12), radius: 8, y: 6)
    }
    
    func liquidGlassCapsule(intensity: GlassIntensity = .regular) -> some View {
        self.background {
            ZStack {
                // Base Material
                Capsule()
                    .fill(intensity.material)
                    .opacity(intensity.opacity)
                
                // Liquid Shine
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.45), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // Edge Light
                Capsule()
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.5), .white.opacity(0.1)],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.8
                    )
            }
        }
        .shadow(color: .black.opacity(0.1), radius: 6, y: 4)
    }
    
    /// Dark solid card - for "Why Gary" section
    func darkCard(cornerRadius: CGFloat = 14) -> some View {
        self.background {
            ZStack {
                // Solid dark background
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color(hex: "#0F0D0D"))
                
                // Subtle top edge highlight
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.12), .white.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.5
                    )
            }
        }
        .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
    }
    
    /// Gold gradient glass - Full design on iOS 16+, lighter on older
    func goldGlass(cornerRadius: CGFloat = 12) -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // Gold gradient background (light gold to darker gold)
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.3),
                                    GaryColors.gold.opacity(0.2)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    
                    // Gold gradient border
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [GaryColors.lightGold.opacity(0.6), GaryColors.gold.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(GaryColors.gold.opacity(0.15))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.4), lineWidth: 0.8)
                    )
            }
        }
    }
    
    /// Gold gradient glass circle - Full design on iOS 16+, lighter on older
    func goldGlassCircle() -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.3),
                                    GaryColors.gold.opacity(0.2)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    
                    Circle()
                        .strokeBorder(
                            LinearGradient(
                                colors: [GaryColors.lightGold.opacity(0.6), GaryColors.gold.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                Circle()
                    .fill(GaryColors.gold.opacity(0.15))
                    .overlay(
                        Circle()
                            .stroke(GaryColors.gold.opacity(0.4), lineWidth: 0.8)
                    )
            }
        }
    }

    /// Accent-colored glass effect for badges (uses sport accent color instead of gold)
    func accentGlass(color: Color, cornerRadius: CGFloat = 8) -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // Accent gradient background
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    color.opacity(0.25),
                                    color.opacity(0.12)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    // Subtle border with accent color
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [color.opacity(0.5), color.opacity(0.25)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(color.opacity(0.15))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(color.opacity(0.4), lineWidth: 0.8)
                    )
            }
        }
    }

    /// Premium liquid glass button - Full design on iOS 16+, lighter on older
    func liquidGlassButton(cornerRadius: CGFloat = 12) -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // 1. Base glass with subtle gold tint
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // 2. Gold-tinted overlay
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.gold.opacity(0.15),
                                    GaryColors.gold.opacity(0.05)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    // 3. Liquid shine (top highlight)
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [.white.opacity(0.5), .white.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                        .blendMode(.overlay)
                    
                    // 4. Premium gold edge
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.6),
                                    GaryColors.gold.opacity(0.3),
                                    GaryColors.gold.opacity(0.1)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(GaryColors.gold.opacity(0.1))
                    
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.4), lineWidth: 1)
                }
            }
        }
        .modifier(ConditionalShadow(
            color: GaryColors.gold.opacity(0.2),
            radius: 12,
            y: 6
        ))
    }
}

/// Applies shadow only on iOS 16+ for performance
struct ConditionalShadow: ViewModifier {
    let color: Color
    let radius: CGFloat
    let y: CGFloat
    
    func body(content: Content) -> some View {
        if PerformanceMode.current.useExpensiveEffects {
            content
                .shadow(color: color, radius: radius, y: y)
                .shadow(color: .black.opacity(0.15), radius: radius * 0.67, y: y * 0.67)
        } else {
            content
        }
    }
}

enum GlassIntensity {
    case clear
    case regular
    case prominent
    
    var material: Material {
        switch self {
        case .clear: return .ultraThinMaterial
        case .regular: return .ultraThinMaterial
        case .prominent: return .thinMaterial
        }
    }
    
    var opacity: Double {
        switch self {
        case .clear: return 0.7
        case .regular: return 0.85
        case .prominent: return 0.95
        }
    }
}

// MARK: - Enhanced Theme Colors


// MARK: - Immersive Background

struct LiquidGlassBackground: View {
    var accentColor: Color = GaryColors.gold
    var grainDensity: Double = 0.0012
    var grainOpacityRange: ClosedRange<Double> = 0.01...0.022

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Base: WARM near-black (R >= B) — the website's matte ink.
                // The old #090C11/#10161D charcoals had blue channels leading,
                // and the whole app sat on them: that was the grey-blue cast.
                Color(hex: "#0C0B0A")

                LinearGradient(
                    colors: [
                        Color(hex: "#151210"),
                        Color(hex: "#0B0A09")
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // Single top glow for depth without muddying the lower half of the screen.
                RadialGradient(
                    colors: [
                        accentColor.opacity(0.11),
                        accentColor.opacity(0.025),
                        Color.clear
                    ],
                    center: UnitPoint(x: 0.5, y: 0.04),
                    startRadius: 24,
                    endRadius: geo.size.width * 0.92
                )

                // Edge darkening — cinematic vignette
                RadialGradient(
                    colors: [
                        Color.clear,
                        Color.black.opacity(0.32)
                    ],
                    center: .center,
                    startRadius: geo.size.width * 0.42,
                    endRadius: geo.size.width * 1.12
                )

                if grainDensity > 0 {
                    // A light texture pass for decorative screens; dense screens can opt out.
                    // SEEDED grain (perf pass, Jul 13): the old CGFloat.random redrew a
                    // DIFFERENT ~2.6k-dot pattern on every layout pass — the whole
                    // background shimmered each time content committed ("jumpy").
                    // A deterministic pattern per size renders identically every pass.
                    Canvas { context, size in
                        var rng = GrainRNG(state: UInt64(size.width) &* 7919 &+ UInt64(size.height))
                        let span = grainOpacityRange.upperBound - grainOpacityRange.lowerBound
                        for _ in 0..<Int(size.width * size.height * grainDensity) {
                            let x = rng.next() * size.width
                            let y = rng.next() * size.height
                            let opacity = grainOpacityRange.lowerBound + rng.next() * span
                            context.fill(
                                Path(CGRect(x: x, y: y, width: 1, height: 1)),
                                with: .color(.white.opacity(opacity))
                            )
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
            // One GPU composite for the gradient stack + grain (no materials
            // inside, so drawingGroup is safe) — the background stops being
            // re-blended layer by layer on every content reflow.
            .drawingGroup()
        }
        .ignoresSafeArea()
    }

    /// SplitMix64 — tiny deterministic RNG for the grain pass.
    private struct GrainRNG {
        var state: UInt64
        mutating func next() -> CGFloat {
            state = state &+ 0x9E3779B97F4A7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
            z = z ^ (z >> 31)
            return CGFloat(z >> 11) * (1.0 / 9007199254740992.0)
        }
    }
}

// MARK: - Home Floor Ground (Home only)

/// THE FLOOR · STILL — the official Home ground (founder, Aug 19: "I like the
/// home page now so put that in officially", after five study rounds on the
/// depth-v2 browser). The vanishing-point effect with ZERO motion: one
/// 3D-folded gold grid plane covers the full page, running from the bottom
/// edge up to a horizon just under the masthead, with the warm horizon light
/// the whole page recedes toward. Rides ON TOP of LiquidGlassBackground.
/// No clock, no freeze machinery — it renders once and costs nothing after
/// its first frame (replaced the 12fps ObsidianGround waves, retired here).
/// Pairs with SOLID card fills (`solidPanels` environment): over a patterned
/// ground the 3% wash lets the grid bleed through every container, so Home
/// cards lock to the opaque color the wash reads as on plain ink.
struct FloorGridPattern: View {
    let spacingY: CGFloat
    let spacingX: CGFloat
    let alpha: Double

    var body: some View {
        Canvas { ctx, size in
            let gold = Color(hex: "#D9A62B")
            var y: CGFloat = 0
            while y < size.height + spacingY {
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: size.width, y: y))
                ctx.stroke(p, with: .color(gold.opacity(alpha)), lineWidth: 1.0)
                y += spacingY
            }
            var x: CGFloat = 0
            while x < size.width + spacingX {
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: size.height))
                ctx.stroke(p, with: .color(gold.opacity(alpha * 0.85)), lineWidth: 1.0)
                x += spacingX
            }
        }
    }
}

/// Scroll → ground drift, held OUTSIDE HomeView's state so a scroll frame
/// re-renders only the ground layer, never the page (perf law from the
/// Aug 18 sweep: nothing on Home may invalidate the whole body per frame).
final class GroundParallax: ObservableObject {
    @Published var offsetY: CGFloat = 0
}

struct HomeScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct HomeFloorGround: View {
    @ObservedObject var parallax: GroundParallax

    var body: some View {
        GeometryReader { geo in
            let W = geo.size.width, H = geo.size.height
            ZStack {
                // Round-five tune (founder: "a little less obvious there's a
                // grid behind all this"): wide cells, low contrast — the
                // depth stays, the graph paper goes. Round six deepens the
                // world: the near field reads a touch crisper, the far half
                // dims away toward the horizon (atmospheric depth in black).
                FloorGridPattern(spacingY: 88, spacingX: 100, alpha: 0.19)
                    .frame(width: W * 2.6, height: H * 1.5)
                    .rotation3DEffect(.degrees(63), axis: (x: 1, y: 0, z: 0), anchor: .top, perspective: 0.9)
                    .position(x: W * 0.5, y: H * 0.85)
                    .mask(
                        LinearGradient(stops: [
                            .init(color: .clear, location: 0.02),
                            .init(color: .black.opacity(0.5), location: 0.18),
                            .init(color: .black, location: 0.50),
                            .init(color: .black, location: 0.88),
                            .init(color: .black.opacity(0.35), location: 1),
                        ], startPoint: .top, endPoint: .bottom)
                    )
                // the horizon light the whole page runs toward
                RadialGradient(colors: [Color(hex: "#F2E4BC").opacity(0.13),
                                        Color(hex: "#D9A62B").opacity(0.045), .clear],
                               center: .init(x: 0.5, y: 0.12), startRadius: 4, endRadius: W * 0.5)
            }
            // The multiplane cue (founder, Aug 19: cards close, world far):
            // the floor drifts at a tenth of the scroll, clamped so the
            // horizon never leaves the page. drawingGroup keeps the drift a
            // GPU transform — the grid is never re-rasterized by scrolling.
            .drawingGroup()
            .offset(y: parallax.offsetY)
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}
