// BillfoldView.swift — Billfold View + Candlestick OHLC data.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Billfold View

struct BillfoldView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab = 0
    @State private var selectedSport: Sport = .all
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loading = true
    @State private var error: String?
    @State private var lastRefresh: Date?
    @State private var timeframe = "all"
    @State private var sportTimeframe = "7d"
    @State private var spreadSport = "NBA"
    @State private var topdTimeframe = "7d"
    /// "gary" | "you" — whose book the page shows (header toggle, persisted).
    @AppStorage("billfoldScope") private var billfoldScope = "gary"
    @State private var gameResultLookup: [String: GameResult] = [:]
    @State private var topPickCandidates: [BillfoldTopPickCandidate] = []
    @State private var billfoldSecondaryGeneration = 0
    @State private var billfoldLoadGeneration = 0
    @State private var scrubDate: Date? = nil
    @State private var chartZoomScale: CGFloat = 1.0
    @State private var chartZoomAnchor: CGFloat = 1.0
    @State private var cachedCandles: [BillfoldCandlestick] = []
    @State private var cachedJournal: BillfoldJournal = .empty
    @State private var cachedCalibration: [BillfoldCalibrationBucket] = []
    @State private var pickConfidenceIndex: [String: Double] = [:]

    // ALL expensive derived data cached here — updated via recomputeCache()
    @State private var cachedFilteredGames: [GameResult] = []
    @State private var cachedFilteredProps: [PropResult] = []
    @State private var cachedRecord: (wins: Int, losses: Int, pushes: Int) = (0, 0, 0)
    @State private var cachedNetUnits: Double = 0
    @State private var cachedStreak: (label: String, value: String, positive: Bool) = ("Streak", "--", true)
    @State private var cachedTrend: [BillfoldTrendPoint] = []
    @State private var cachedSportSeries: [BillfoldSportSeries] = []
    @State private var cachedSportPerf: [BillfoldSportPoint] = []
    @State private var cachedSpreadPerf: [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] = []
    @State private var cachedTopd: (wins: Int, losses: Int, pnl: Double) = (0, 0, 0)
    @State private var cachedAvailableSports: Set<String> = []
    @State private var cachedSortedSports: [Sport] = [.all]
    @State private var cachedSpreadSportsAvailable: [String] = ["NBA"]

    private let timeframes = ["7d", "30d", "90d", "ytd", "all"]
    private let topPickTimeframes = ["7d", "30d", "90d"]

    private var positiveColor: Color { GaryColors.win }
    private var negativeColor: Color { GaryColors.loss }

    private var validPropResults: [PropResult] {
        propResults.filter(isLegitPropResult)
    }

    /// Game results filtered by the global timeframe (client-side)
    private var timeframeGameResults: [GameResult] {
        guard let cutoff = sinceDateValue(for: timeframe) else { return gameResults }
        return gameResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    /// Prop results filtered by the global timeframe (client-side)
    private var timeframePropResults: [PropResult] {
        guard let cutoff = sinceDateValue(for: timeframe) else { return validPropResults }
        return validPropResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    /// Game results filtered by the By Sport timeframe (independent)
    private var sportTimeframeGameResults: [GameResult] {
        guard let cutoff = sinceDateValue(for: sportTimeframe) else { return gameResults }
        return gameResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    /// Prop results filtered by the By Sport timeframe (independent)
    private var sportTimeframePropResults: [PropResult] {
        guard let cutoff = sinceDateValue(for: sportTimeframe) else { return validPropResults }
        return validPropResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    private var filteredGameResults: [GameResult] {
        let results = selectedSport == .all
            ? timeframeGameResults
            : timeframeGameResults.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        return results.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
    }

    private var filteredPropResults: [PropResult] {
        let results: [PropResult]
        switch selectedSport {
        case .all:
            // Only NFL TDs are the dedicated touchdown fun lane. NCAAF
            // touchdown props remain visible in ALL and under NCAAF.
            results = timeframePropResults.filter { !$0.isNFLTDResult && !$0.isHRResult }
        case .nflTDs:
            results = timeframePropResults.filter { $0.isNFLTDResult }
        case .nfl:
            results = timeframePropResults
                .filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isNFLTDResult }
        default:
            results = timeframePropResults
                .filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        }
        return results.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
    }

    private var activeGameResults: [GameResult] { cachedFilteredGames }
    private var activePropResults: [PropResult] { cachedFilteredProps }
    /// Mean American price across the selected fun lane's graded rows —
    /// fun lanes are all plus-money, so this renders as "avg +585".
    private var funLaneAvgOdds: Int? {
        let odds = cachedFilteredProps
            .filter { $0.result == "won" || $0.result == "lost" }
            .compactMap { $0.odds?.value }
            .compactMap(Double.init)
            .filter { $0 > 0 }
        guard odds.count >= 3 else { return nil }
        return Int((odds.reduce(0, +) / Double(odds.count)).rounded())
    }
    private var settledCount: Int { cachedRecord.wins + cachedRecord.losses + cachedRecord.pushes }
    private var record: (wins: Int, losses: Int, pushes: Int) { cachedRecord }
    private var winRate: Double {
        let decisive = max(1, cachedRecord.wins + cachedRecord.losses)
        return Double(cachedRecord.wins) / Double(decisive) * 100
    }
    private var netUnits: Double { cachedNetUnits }
    private var netDollars: Double { cachedNetUnits * 100 }

    /// Stake display: CASH by default (user call, Jun 18) at a hypothetical
    /// $100/bet — the page already carries the "HYPOTHETICAL · not investment
    /// results" disclaimers. Users can switch to units in Settings → Display.
    /// (Dollar figures can read as profit claims — App Store 5.3 / tout optics —
    /// which the hypothetical framing is there to defuse.)
    @AppStorage("showDollarResults") private var showDollarResults = true
    private func signedDollars(_ value: Double) -> String {
        // STORE-SAFE BRIDGE: no dollars, no units — money strings vanish and
        // the record/percent cells carry the page (founder, Aug 11).
        if AppFlags.storeSafe { return "" }
        guard showDollarResults else {
            return String(format: "%+.1fu", value / 100)
        }
        let rounded = Int(abs(value).rounded())
        return value >= 0 ? "+$\(rounded)" : "-$\(rounded)"
    }

    private var streakSummary: (label: String, value: String, positive: Bool) { cachedStreak }
    private var trendPoints: [BillfoldTrendPoint] { cachedTrend }
    private var journal: BillfoldJournal { cachedJournal }
    private var calibration: [BillfoldCalibrationBucket] { cachedCalibration }
    private var sortedSportsForBillfold: [Sport] { cachedSortedSports }
    private var availableSports: Set<String> { cachedAvailableSports }

    private var recentGameCards: [GameResult] { Array(activeGameResults.prefix(20)) }
    private var recentPropCards: [PropResult] { Array(activePropResults.prefix(20)) }

    private var sourceCount: Int {
        selectedTab == 0 ? activeGameResults.count : activePropResults.count
    }

    private var updatedLabel: String {
        guard let lastRefresh else { return "Not synced" }
        return relativeTimeString(from: lastRefresh)
    }

    private var recordText: String {
        "\(record.wins)-\(record.losses)-\(record.pushes)"
    }

    private var sportPerformance: [BillfoldSportPoint] { cachedSportPerf }

    private func computeSportPerformance() -> [BillfoldSportPoint] {
        BillfoldCompute.sportPerformance(
            selectedTab: selectedTab,
            selectedSport: selectedSport,
            gameRows: sportTimeframeGameResults,
            propRows: sportTimeframePropResults
        )
    }

    private var topdStats: (wins: Int, losses: Int, pnl: Double) { cachedTopd }

    private func computeTopdStats() -> (wins: Int, losses: Int, pnl: Double) {
        BillfoldCompute.topdStats(
            timeframe: topdTimeframe,
            resultLookup: gameResultLookup,
            topPickRows: topPickCandidates
        )
    }

    private var spreadBucketsForSport: [(String, ClosedRange<Double>)] {
        BillfoldCompute.spreadBuckets(for: spreadSport)
    }

    private var spreadSportsAvailable: [String] {
        cachedSpreadSportsAvailable
    }

    private var spreadSizePerformance: [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] { cachedSpreadPerf }

    private func computeSpreadPerf() -> [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] {
        BillfoldCompute.spreadPerf(
            selectedTab: selectedTab,
            spreadSport: spreadSport,
            buckets: spreadBucketsForSport,
            results: timeframeGameResults
        )
    }

    private var bestSportInsight: String {
        let sports = selectedTab == 0
            ? Set(gameResults.compactMap { $0.effectiveLeague })
            : Set(validPropResults.compactMap { $0.effectiveLeague })

        let candidates = sports.compactMap { sport -> (String, Double)? in
            if selectedTab == 0 {
                let subset = gameResults.filter { $0.effectiveLeague == sport }
                guard !subset.isEmpty else { return nil }
                let net = subset.reduce(0) { $0 + units(for: $1.result, odds: $1.effectiveOdds) }
                return (sport, net)
            } else {
                let subset = validPropResults.filter { $0.effectiveLeague == sport }
                guard !subset.isEmpty else { return nil }
                let net = subset.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
                return (sport, net)
            }
        }

        guard let winner = candidates.max(by: { $0.1 < $1.1 }) else { return "No edge yet" }
        return "\(winner.0) \(signedDollars(winner.1 * 100))"
    }

    // MARK: - Body

    // Design tokens — house dark/gold language matching Winners + the
    // Scoreboard cards. (Passbook leather/paper experiment reverted June 3
    // at the user's request; token NAMES kept transitional to avoid a
    // 100-site rename — `paper` = primary light text, `ink` = card text,
    // `brass` = gold accent. Rename lands with the next structural pass.)
    private var leather: Color { Color(hex: "#0A0908") }
    private var paper: Color { Color.white }
    private var ink: Color { Color.white }
    private var brass: Color { GaryColors.gold }
    private var emerald: Color { GaryColors.win }
    private var crimson: Color { GaryColors.loss }
    private var cardStroke: Color { Color.white.opacity(0.08) }
    private var pageBg: Color { leather }
    private let cr: CGFloat = 14

    /// Page ground — same liquid-glass backdrop the rest of the app uses
    private var leatherBackground: some View {
        LiquidGlassBackground(grainDensity: 0)
    }

    /// Card surface — same recipe as the Scoreboard pick cards
    private func paperCard(cornerRadius: CGFloat? = nil) -> some View {
        let r = cornerRadius ?? cr
        return RoundedRectangle(cornerRadius: r, style: .continuous)
            .fill(Color.white.opacity(0.055))
            .overlay(
                RoundedRectangle(cornerRadius: r, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
    }

    var body: some View {
        ZStack {
            leatherBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // The one-line wallet header + index tabs; paper scrolls beneath.
                headerBar

                if AppFlags.userBookEnabled, billfoldScope == "you" {
                    // YOUR book takes the whole page below the header —
                    // Gary's tabs/timeframes are his-book controls only.
                    // The standings live in the BOARD scope (founder, Aug 20:
                    // the whole Book rides inside the Billfold, not the dock).
                    ScrollView(showsIndicators: false) {
                        UserBookSection()
                            .padding(.top, 6)
                            .padding(.bottom, 120)
                    }
                } else if AppFlags.userBookEnabled, billfoldScope == "board" {
                    // THE BOARD — the classic leaderboard (podium + table).
                    ScrollView(showsIndicators: false) {
                        ClassicLeaderboardView()
                            .padding(.top, 10)
                            .padding(.bottom, 120)
                    }
                } else {
                billfoldTopBar
                    .padding(.top, 4)

                if loading && settledCount == 0 {
                    Spacer(minLength: 0)
                    loadingState
                    Spacer(minLength: 0)
                } else if let error = error, settledCount == 0 {
                    Spacer(minLength: 0)
                    errorState(error: error)
                    Spacer(minLength: 0)
                } else {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 26) {
                            balanceBlock
                            // STORE-SAFE BRIDGE: the equity curve is a money
                            // chart ($100/bet flat-stake) — the whole block
                            // rides the flag; record + win% carry the page.
                            if !AppFlags.storeSafe {
                                performanceChart
                            }
                            recentCarousel
                            dailyLedger
                            performanceLedger
                            hrFunTracker
                        }
                        .padding(.top, 4)
                        .padding(.bottom, 120)
                    }
                    .refreshable {
                        await loadData(forceRefresh: true)
                    }
                }
                }
            }
        }
        .task { await loadData() }
        .onChange(of: scenePhase) { phase in
            // Foreground → silently refresh the ledger/chart (loadData is silent-safe).
            if phase == .active { Task { await loadData() } }
        }
        .onChange(of: selectedTab) { _ in recomputeCache(); chartZoomScale = 1; chartZoomAnchor = 1; scrubDate = nil }
        .onChange(of: selectedSport) { _ in recomputeSelectionCache(); chartZoomScale = 1; chartZoomAnchor = 1; scrubDate = nil }
        .onChange(of: timeframe) { _ in onTimeframeChange(); chartZoomScale = 1; chartZoomAnchor = 1 }
        .onChange(of: sportTimeframe) { _ in onSportTimeframeChange() }
        .onChange(of: spreadSport) { _ in recomputeSpreadCache() }
        .onChange(of: topdTimeframe) { _ in recomputeTopPickCache() }
        .onGaryTour { verb, arg in
            if verb == "billfold", let m = ChartMode(rawValue: arg.uppercased()) {
                withAnimation { chartMode = m }
            }
        }
        // (Local settings sheet removed Aug 4 — the header's ⋯ posts
        // ShowSettingsMenu, which ContentView presents globally.)
    }

    /// A timeframe pick recomputes from the data already in hand. If it now
    /// needs full history that the bounded snapshot doesn't have, also kick off
    /// a full-history load — `applySnapshot` recomputes again once it lands.
    private func onTimeframeChange() {
        recomputeCache()
        if needsFullHistory, BillfoldSnapshotStore.shared.cachedSnapshotIfFresh(fullHistory: true) == nil {
            Task { await loadData() }
        }
    }

    /// The By Sport window affects only the sport comparison, so keep its tap
    /// on the focused calculation path. If the user expands to YTD/all before
    /// full history is resident, fetch that wider snapshot in parallel.
    private func onSportTimeframeChange() {
        recomputeSelectionCache()
        if needsFullHistory, BillfoldSnapshotStore.shared.cachedSnapshotIfFresh(fullHistory: true) == nil {
            Task { await loadData() }
        }
    }

    private func recomputeCache() {
        billfoldSecondaryGeneration += 1
        let generation = billfoldSecondaryGeneration
        let selectedTabSnapshot = selectedTab
        let selectedSportSnapshot = selectedSport
        let timeframeSnapshot = timeframe
        let sportTimeframeSnapshot = sportTimeframe
        let spreadSportSnapshot = spreadSport
        let topdTimeframeSnapshot = topdTimeframe
        let gameResultsSnapshot = gameResults
        let propResultsSnapshot = propResults
        let gameLookupSnapshot = gameResultLookup
        let topPickSnapshot = topPickCandidates
        let confidenceIndexSnapshot = pickConfidenceIndex

        DispatchQueue.global(qos: .userInitiated).async {
            let derived = BillfoldCompute.deriveState(
                selectedTab: selectedTabSnapshot,
                selectedSport: selectedSportSnapshot,
                timeframe: timeframeSnapshot,
                sportTimeframe: sportTimeframeSnapshot,
                spreadSport: spreadSportSnapshot,
                topdTimeframe: topdTimeframeSnapshot,
                gameResults: gameResultsSnapshot,
                propResults: propResultsSnapshot,
                resultLookup: gameLookupSnapshot,
                topPickRows: topPickSnapshot,
                confidenceIndex: confidenceIndexSnapshot
            )

            DispatchQueue.main.async {
                guard generation == billfoldSecondaryGeneration else { return }
                cachedFilteredGames = derived.filteredGames
                cachedFilteredProps = derived.filteredProps
                cachedRecord = derived.record
                cachedNetUnits = derived.netUnits
                cachedStreak = derived.streak
                cachedTrend = derived.trend
                cachedCandles = derived.candles
                cachedSportSeries = derived.sportSeries
                cachedAvailableSports = derived.availableSports
                cachedSortedSports = derived.sortedSports
                if selectedSport != .all, !derived.availableSports.isEmpty,
                   !derived.availableSports.contains(selectedSport.rawValue) {
                    selectedSport = .all   // selection no longer exists in this window
                }
                cachedSportPerf = derived.sportPerformance
                cachedSpreadPerf = derived.spreadPerformance
                cachedTopd = derived.topd
                cachedSpreadSportsAvailable = derived.spreadSportsAvailable
                cachedJournal = derived.journal
                cachedCalibration = derived.calibration
                loading = false
            }
        }
    }

    /// Sport and By-Sport timeframe taps update only the values they affect.
    /// This keeps the button response immediate instead of rebuilding the
    /// all-sports chart, spread analysis, and Top Pick desk each time.
    private func recomputeSelectionCache() {
        billfoldSecondaryGeneration += 1
        let generation = billfoldSecondaryGeneration
        let selectedTabSnapshot = selectedTab
        let selectedSportSnapshot = selectedSport
        let timeframeSnapshot = timeframe
        let sportTimeframeSnapshot = sportTimeframe
        let gameResultsSnapshot = gameResults
        let propResultsSnapshot = propResults
        let confidenceIndexSnapshot = pickConfidenceIndex

        DispatchQueue.global(qos: .userInitiated).async {
            let derived = BillfoldCompute.deriveSelectionState(
                selectedTab: selectedTabSnapshot,
                selectedSport: selectedSportSnapshot,
                timeframe: timeframeSnapshot,
                sportTimeframe: sportTimeframeSnapshot,
                gameResults: gameResultsSnapshot,
                propResults: propResultsSnapshot,
                confidenceIndex: confidenceIndexSnapshot
            )

            DispatchQueue.main.async {
                guard generation == billfoldSecondaryGeneration else { return }
                cachedFilteredGames = derived.filteredGames
                cachedFilteredProps = derived.filteredProps
                cachedRecord = derived.record
                cachedNetUnits = derived.netUnits
                cachedStreak = derived.streak
                cachedTrend = derived.trend
                cachedCandles = derived.candles
                cachedSportPerf = derived.sportPerformance
                cachedJournal = derived.journal
                cachedCalibration = derived.calibration
            }
        }
    }

    private func recomputeSpreadCache() {
        billfoldSecondaryGeneration += 1
        let generation = billfoldSecondaryGeneration
        let selectedTabSnapshot = selectedTab
        let spreadSportSnapshot = spreadSport
        let timeframeSnapshot = timeframe
        let gameResultsSnapshot = gameResults

        DispatchQueue.global(qos: .userInitiated).async {
            let rows = BillfoldCompute.filterGameResults(
                gameResultsSnapshot,
                cutoff: Self.sinceDateValueStatic(for: timeframeSnapshot),
                selectedSport: .all
            )
            let result = BillfoldCompute.spreadPerf(
                selectedTab: selectedTabSnapshot,
                spreadSport: spreadSportSnapshot,
                buckets: BillfoldCompute.spreadBuckets(for: spreadSportSnapshot),
                results: rows
            )
            DispatchQueue.main.async {
                guard generation == billfoldSecondaryGeneration else { return }
                cachedSpreadPerf = result
            }
        }
    }

    private func recomputeTopPickCache() {
        billfoldSecondaryGeneration += 1
        let generation = billfoldSecondaryGeneration
        let timeframeSnapshot = topdTimeframe
        let lookupSnapshot = gameResultLookup
        let topPickSnapshot = topPickCandidates

        DispatchQueue.global(qos: .userInitiated).async {
            let result = BillfoldCompute.topdStats(
                timeframe: timeframeSnapshot,
                resultLookup: lookupSnapshot,
                topPickRows: topPickSnapshot
            )
            DispatchQueue.main.async {
                guard generation == billfoldSecondaryGeneration else { return }
                cachedTopd = result
            }
        }
    }

    private var usesDefaultSnapshotControls: Bool {
        selectedTab == 0 &&
        selectedSport == .all &&
        timeframe == "all" &&
        sportTimeframe == "7d" &&
        spreadSport == "NBA" &&
        topdTimeframe == "7d"
    }

    private func applyDerivedState(_ derived: BillfoldDerivedState) {
        cachedFilteredGames = derived.filteredGames
        cachedFilteredProps = derived.filteredProps
        cachedRecord = derived.record
        cachedNetUnits = derived.netUnits
        cachedStreak = derived.streak
        cachedTrend = derived.trend
        cachedCandles = derived.candles
        cachedSportSeries = derived.sportSeries
        cachedAvailableSports = derived.availableSports
        cachedSortedSports = derived.sortedSports
        cachedSportPerf = derived.sportPerformance
        cachedSpreadPerf = derived.spreadPerformance
        cachedTopd = derived.topd
        cachedSpreadSportsAvailable = derived.spreadSportsAvailable
        cachedJournal = derived.journal
        cachedCalibration = derived.calibration
        loading = false
    }

    private func applySnapshot(_ snapshot: BillfoldSnapshot) {
        gameResults = snapshot.games
        // The game-first snapshot intentionally carries no props. Preserve a
        // previously hydrated prop ledger across foreground refreshes instead
        // of flashing the Props tab/HR lane back to empty for a frame.
        if !snapshot.props.isEmpty || propResults.isEmpty {
            propResults = snapshot.props
        }
        gameResultLookup = snapshot.resultLookup
        topPickCandidates = snapshot.topPickRows
        pickConfidenceIndex = snapshot.confidenceIndex
        lastRefresh = snapshot.refreshedAt

        if usesDefaultSnapshotControls {
            applyDerivedState(snapshot.defaultDerivedState)
        } else {
            recomputeCache()
        }
    }

    // MARK: - Header Bar

    // ONE-LINE masthead (founder, Aug 6 night, second ruling: headers back,
    // horizontal). Title + GARY/YOU on the same line; the brass stitch — the
    // wallet's one signature — rides the rule slot.
    private var headerBar: some View {
        GaryPageHeader(title: "Billfold",
                       rule: AnyView(
                           StitchLine()
                               .stroke(brass.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 5]))
                               .frame(height: 1)
                       ),
                       trailing: {
                           if AppFlags.userBookEnabled {
                               bookScopeToggle
                           }
                       })
    }

    /// GARY / YOU book switch — whose record the page shows. Persisted so the
    /// reader's choice sticks across launches (founder, Jul 26). House selector
    /// grammar: text + underline bar, never a pill (founder law, Jul 26).
    private var bookScopeToggle: some View {
        HStack(spacing: 14) {
            bookScopeTab("GARY", isOn: billfoldScope != "you" && billfoldScope != "board") { billfoldScope = "gary" }
            bookScopeTab("YOU", isOn: billfoldScope == "you") { billfoldScope = "you" }
            bookScopeTab("BOARD", isOn: billfoldScope == "board") { billfoldScope = "board" }
        }
    }

    private func bookScopeTab(_ label: String, isOn: Bool, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            VStack(spacing: 3) {
                Text(label)
                    .font(GaryFonts.mono(10, bold: true)).tracking(1)
                    .foregroundStyle(isOn ? brass : .white.opacity(0.5))
                Rectangle().fill(isOn ? brass : .clear).frame(height: 1.5)
            }
            .fixedSize()
        }
        .buttonStyle(.plain)
    }

    // MARK: - Sport Tabs + Picks/Props + Timeframe

    private var billfoldTopBar: some View {
        HStack(spacing: 8) {
            // Left: sport index tabs, like a passbook's edge tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(sortedSportsForBillfold, id: \.self) { sport in
                        let isSelected = selectedSport == sport

                        Button {
                            selectedSport = sport
                        } label: {
                            VStack(spacing: 4) {
                                Text(sport.rawValue)
                                    .font(.system(size: 12, weight: isSelected ? .bold : .medium, design: .default))
                                    .foregroundStyle(isSelected ? paper : paper.opacity(0.55))
                                Rectangle()
                                    .fill(isSelected ? brass : .clear)
                                    .frame(height: 1.5)
                            }
                        }
                    }
                }
            }

            // Right: Picks/Props + period, brass-outlined chips
            HStack(spacing: 6) {
                Menu {
                    Button {
                        selectedTab = 0
                        selectedSport = .all
                    } label: {
                        Label("Picks", systemImage: selectedTab == 0 ? "checkmark" : "")
                    }
                    Button {
                        selectedTab = 1
                        selectedSport = .all
                    } label: {
                        Label("Props", systemImage: selectedTab == 1 ? "checkmark" : "")
                    }
                } label: {
                    passbookChip(selectedTab == 0 ? "Picks" : "Props")
                }

                Menu {
                    ForEach(timeframes, id: \.self) { tf in
                        Button {
                            timeframe = tf
                        } label: {
                            Label(tf.uppercased(), systemImage: timeframe == tf ? "checkmark" : "")
                        }
                    }
                } label: {
                    passbookChip(timeframe.uppercased())
                }
            }

        }
        .padding(.horizontal, 18)
    }

    private func passbookChip(_ label: String) -> some View {
        // No bubble — brass text + chevron; the chevron alone says "menu".
        HStack(spacing: 3) {
            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .default))
            Image(systemName: "chevron.down")
                .font(.system(size: 7, weight: .bold))
        }
        .foregroundStyle(brass)
        .padding(.horizontal, 6)
        // 36 keeps a real tap target without the old 44pt row's dead slack
        // under the small type (founder, Aug 6 night: "weird spacing").
        .frame(minHeight: 36)
        .contentShape(Rectangle())
    }



    // MARK: - Balance Block (the wallet's cash window, printed on leather)

    private var timeframeLabel: String {
        switch timeframe {
        case "7d": return "Last 7 days"
        case "30d": return "Last 30 days"
        case "90d": return "Last 90 days"
        case "ytd": return "Year to date"
        default: return "All time"
        }
    }

    private var balanceBlock: some View {
        VStack(spacing: 7) {
            Text((AppFlags.storeSafe ? "THE RECORD" : (showDollarResults ? "NET BALANCE" : "NET UNITS")) + (selectedTab == 0 ? " \u{00B7} PICKS" : " \u{00B7} PROPS"))
                .font(.system(size: 10, weight: .semibold))
                .tracking(1)
                .foregroundStyle(brass.opacity(0.85))

            Text(signedDollars(netDollars))
                .font(.system(size: 46, weight: .medium, design: .default))
                .foregroundStyle(paper)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .contentTransition(.numericText())
                .animation(.snappy, value: netDollars)
                .shadow(color: .black.opacity(0.5), radius: 1, y: 1)

            VStack(spacing: 5) {
                HStack(spacing: 9) {
                    // STORE-SAFE BRIDGE: record + win% only — ROI and units
                    // are bankroll language.
                    if !AppFlags.storeSafe {
                        Text(String(format: "ROI %+.1f%%", journal.roiPct))
                            .font(.system(size: 14, weight: .bold).monospacedDigit())
                            .foregroundStyle(journal.roiPct >= 0 ? emerald : crimson)
                        Text("\u{00B7}").foregroundStyle(brass.opacity(0.5))
                    }
                    Text("\(record.wins)\u{2013}\(record.losses)\u{2013}\(record.pushes)")
                        .font(.system(size: 13, weight: .semibold, design: .default))
                        .foregroundStyle(paper.opacity(0.85))
                    if AppFlags.storeSafe {
                        let settled = record.wins + record.losses
                        if settled > 0 {
                            Text("\u{00B7}").foregroundStyle(brass.opacity(0.5))
                            Text("\(Int((Double(record.wins) / Double(settled) * 100).rounded()))%")
                                .font(.system(size: 14, weight: .bold).monospacedDigit())
                                .foregroundStyle(paper.opacity(0.85))
                        }
                    } else {
                        Text("\u{00B7}").foregroundStyle(brass.opacity(0.5))
                        Text(String(format: "%+.1fu", netUnits))
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(paper.opacity(0.75))
                    }
                }

                HStack(spacing: 9) {
                    Text(String(format: "%.0f%% win", winRate))
                        .font(.system(size: 12, weight: .medium, design: .default))
                        .foregroundStyle(brass)
                    Text("\u{00B7}").foregroundStyle(brass.opacity(0.5))
                    Text(timeframeLabel)
                        .font(.system(size: 12, weight: .medium, design: .default))
                        .foregroundStyle(brass)

                    // Fun lanes (HR bets, TDs) live on long odds — the average
                    // price belongs next to the record.
                    if selectedTab == 1, selectedSport == .mlbHR || selectedSport == .nflTDs,
                       let avg = funLaneAvgOdds {
                        Text("\u{00B7}").foregroundStyle(brass.opacity(0.5))
                        Text("avg +\(avg)")
                            .font(.system(size: 12, weight: .medium).monospacedDigit())
                            .foregroundStyle(brass)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 18)

            // Last-10 punch row — wallet card punches, oldest → newest
            HStack(spacing: 5) {
                let dots = journal.last10
                let pad = 10 - dots.count
                ForEach(0..<10, id: \.self) { i in
                    let result: String? = i >= pad && i - pad < dots.count ? dots[i - pad] : nil
                    Circle()
                        .fill(
                            result == "won" ? emerald :
                            result == "lost" ? crimson :
                            result == "push" ? brass :
                            paper.opacity(0.12)
                        )
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
        .padding(.bottom, 2)
    }

    // MARK: - Performance Chart

    // MARK: - Visible chart data (zoom-aware)

    private var visibleTrendPoints: [BillfoldTrendPoint] {
        guard !trendPoints.isEmpty else { return [] }
        let count = trendPoints.count
        let visibleCount = max(2, Int(Double(count) / Double(chartZoomScale)))
        return Array(trendPoints.suffix(visibleCount))
    }

    private var chartLineColor: Color {
        let referencePoint: BillfoldTrendPoint?
        if let sd = scrubDate {
            referencePoint = visibleTrendPoints.min(by: { abs($0.date.timeIntervalSince(sd)) < abs($1.date.timeIntervalSince(sd)) })
        } else {
            referencePoint = visibleTrendPoints.last
        }
        return (referencePoint?.cumulative ?? 0) >= 0 ? positiveColor : negativeColor
    }

    private var scrubPoint: BillfoldTrendPoint? {
        guard let sd = scrubDate else { return nil }
        return visibleTrendPoints.min(by: { abs($0.date.timeIntervalSince(sd)) < abs($1.date.timeIntervalSince(sd)) })
    }

    private var chartDisplayValue: String {
        let point = scrubPoint ?? visibleTrendPoints.last
        guard let p = point else { return "$0" }
        return signedDollars(p.cumulative * 100)
    }

    private var chartDisplayDate: String {
        guard let sp = scrubPoint else { return "" }
        return BillfoldCompute.displayDateFormatter.string(from: sp.date)
    }

    private var chartDisplayDaily: String {
        guard let sp = scrubPoint else { return "" }
        let d = sp.units * 100
        return d >= 0 ? "+$\(Int(d.rounded()))" : "-$\(Int(abs(d).rounded()))"
    }

    private var visibleCandles: [BillfoldCandlestick] {
        guard !cachedCandles.isEmpty else { return [] }
        let count = cachedCandles.count
        let visibleCount = max(2, Int(Double(count) / Double(chartZoomScale)))
        return Array(cachedCandles.suffix(visibleCount))
    }

    private var scrubCandle: BillfoldCandlestick? {
        guard let sd = scrubDate else { return nil }
        return visibleCandles.min(by: { abs($0.date.timeIntervalSince(sd)) < abs($1.date.timeIntervalSince(sd)) })
    }

    private var candleDisplayValue: String {
        let candle = scrubCandle ?? visibleCandles.last
        guard let c = candle else { return "$0" }
        return signedDollars(c.close * 100)
    }

    private var candleDisplayDate: String {
        guard let sc = scrubCandle else { return "" }
        return BillfoldCompute.displayDateFormatter.string(from: sc.date)
    }

    private var candleDisplayDaily: String {
        guard let sc = scrubCandle else { return "" }
        let d = (sc.close - sc.open) * 100
        return d >= 0 ? "+$\(Int(d.rounded()))" : "-$\(Int(abs(d).rounded()))"
    }

    private var candleLineColor: Color {
        let ref = scrubCandle ?? visibleCandles.last
        return (ref?.close ?? 0) >= 0 ? positiveColor : negativeColor
    }

    private let candleGreen = Color(hex: "#00D26A")
    private let candleRed = Color(hex: "#F14A51")

    private let chartTimeLabels = ["1W", "1M", "3M", "YTD", "ALL"]
    private let chartTimeValues = ["7d", "30d", "90d", "ytd", "all"]

    // MARK: - Equity Curve (unified chart card: line ⟷ candles)

    private enum ChartMode: String, CaseIterable { case line = "LINE", candles = "CANDLES", sports = "SPORTS" }
    @State private var chartMode: ChartMode = .line

    private var chartHeaderValue: String {
        switch chartMode {
        case .line: return chartDisplayValue
        case .candles: return candleDisplayValue
        case .sports: return signedDollars(sportSeries.reduce(0) { $0 + $1.netUnits } * 100)
        }
    }

    private var chartHeaderColor: Color {
        switch chartMode {
        case .line: return chartLineColor
        case .candles: return candleLineColor
        case .sports: return sportSeries.reduce(0) { $0 + $1.netUnits } >= 0 ? positiveColor : negativeColor
        }
    }

    private var performanceChart: some View {
        VStack(alignment: .leading, spacing: 0) {
            chartHeader

            Group {
                if chartMode == .line {
                    lineChartBody
                } else if chartMode == .candles {
                    candleChartBody
                } else {
                    sportsChartBody
                }
            }
            .frame(height: 185)
            .padding(.horizontal, 10)
            .padding(.top, 6)

            if chartMode == .sports {
                sportsLegend
            }

            chartTimeframeRow
            Text("Flat-stake tracking \u{00B7} hypothetical, not investment results")
                .font(GaryFonts.mono(9.5))
                .foregroundStyle(.white.opacity(0.55))
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 2)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Chart header, bodies, timeframe row

    private var chartHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                // Quant Terminal labels (mono, never .system) — one line each,
                // scale before EVER wrapping ("HYPOTHETICA/L" was wrapping mid-word).
                Text(chartMode == .sports ? "BY SPORT \u{00B7} NET" : "EQUITY CURVE")
                    .font(GaryFonts.mono(9.5, bold: true))
                    .tracking(1)
                    .foregroundStyle(ink.opacity(0.7))
                    .lineLimit(1)
                    .layoutPriority(1)
                // Stake mode only — the "hypothetical, not investment results"
                // disclaimer already rides under the chart, and the long form
                // truncated to "HYP…" against the LINE/CANDLES/SPORTS toggles.
                Text(showDollarResults ? "$100/BET" : "1U/BET")
                    .font(GaryFonts.mono(9.5, bold: true))
                    .tracking(1)
                    .foregroundStyle(ink.opacity(0.58))
                    .lineLimit(1).minimumScaleFactor(0.7)

                Spacer()
            }

            // Keep the chart modes on their own clean rail. Packing these into
            // the title line was technically able to fit, but made the whole
            // header look squeezed on an iPhone portrait width.
            HStack(spacing: 18) {
                ForEach(ChartMode.allCases, id: \.self) { mode in
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { chartMode = mode }
                        scrubDate = nil
                    } label: {
                        Text(mode.rawValue)
                            .font(.system(size: 9.5, weight: .bold))
                            .tracking(0.6)
                            .lineLimit(1)
                            .fixedSize()
                            .foregroundStyle(chartMode == mode ? brass : ink.opacity(0.45))
                            .frame(minHeight: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            // Scrub-aware value line
            HStack(spacing: 8) {
                Text(chartHeaderValue)
                    .font(GaryFonts.mono(22, bold: true))
                    .foregroundStyle(chartHeaderColor)
                    .contentTransition(.numericText())

                if scrubDate != nil && chartMode != .sports {
                    Text(chartMode == .line ? chartDisplayDate : candleDisplayDate)
                        .font(GaryFonts.mono(11, bold: false))
                        .foregroundStyle(ink.opacity(0.5))
                    Text(chartMode == .line ? chartDisplayDaily : candleDisplayDaily)
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle((chartMode == .line ? chartLineColor : candleLineColor).opacity(0.85))
                }
            }
            .animation(.easeOut(duration: 0.1), value: scrubDate)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
    }

    private var chartEmptyState: some View {
        Text("No settled entries")
            .font(GaryFonts.mono(10))
            .foregroundStyle(ink.opacity(0.4))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var lineChartBody: some View {
        if trendPoints.isEmpty {
            chartEmptyState
        } else {
            Chart(trendPoints) { point in
                // Fill tracks SIGN — green above the zero line, red below —
                // so a winning stretch inside a losing week still reads green.
                // (The line itself keeps the current-state tint.)
                AreaMark(
                    x: .value("Date", point.date),
                    yStart: .value("Zero", 0),
                    yEnd: .value("Units", max(0, point.cumulative)),
                    series: .value("Fill", "pos")
                )
                .foregroundStyle(positiveColor.opacity(0.13))
                .interpolationMethod(.catmullRom)

                AreaMark(
                    x: .value("Date", point.date),
                    yStart: .value("Zero", 0),
                    yEnd: .value("Units", min(0, point.cumulative)),
                    series: .value("Fill", "neg")
                )
                .foregroundStyle(negativeColor.opacity(0.13))
                .interpolationMethod(.catmullRom)

                LineMark(
                    x: .value("Date", point.date),
                    y: .value("Units", point.cumulative)
                )
                .foregroundStyle(chartLineColor)
                .lineStyle(StrokeStyle(lineWidth: 1.6))
                .interpolationMethod(.catmullRom)
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                        .foregroundStyle(ink.opacity(0.45))
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                        .foregroundStyle(ink.opacity(0.12))
                    // Cash or units, matching the headline (candle/sports axes do the same).
                    AxisValueLabel {
                        if let v = value.as(Double.self) {
                            Text(signedDollars(v * 100))
                                .foregroundStyle(ink.opacity(0.45))
                        }
                    }
                }
            }
        }
    }

    // MARK: - By-Sport equity lines (one line per league, league accent color)

    @State private var isolatedSportLine: String? = nil

    private var sportSeries: [BillfoldSportSeries] { cachedSportSeries }

    /// Manual legend isolation wins; otherwise the active sport tab highlights
    /// its own line. Either only counts while that league is on the board.
    private var effectiveIsolatedLine: String? {
        if let iso = isolatedSportLine, sportSeries.contains(where: { $0.id == iso }) { return iso }
        if selectedSport != .all, sportSeries.contains(where: { $0.id == selectedSport.rawValue }) {
            return selectedSport.rawValue
        }
        return nil
    }

    /// Sport accent, lifted where the brand color is too dark for the near-black ground
    private func sportLineColor(_ league: String) -> Color {
        let sport = Sport.from(league: league)
        if sport == .mlb || sport == .mlbHR { return Color(hex: "#4E9C44") }
        if sport == .all { return brass }
        return sport.accentColor
    }

    @ViewBuilder
    private var sportsChartBody: some View {
        if sportSeries.isEmpty {
            chartEmptyState
        } else {
            Chart {
                RuleMark(y: .value("Zero", 0))
                    .foregroundStyle(ink.opacity(0.22))
                    .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [4, 3]))

                ForEach(sportSeries) { s in
                    let color = sportLineColor(s.league)
                    let dimmed = effectiveIsolatedLine != nil && effectiveIsolatedLine != s.id
                    ForEach(s.points) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value("Net", point.cumulative),
                            series: .value("Sport", s.league)
                        )
                        .foregroundStyle(color.opacity(dimmed ? 0.22 : 1))
                        .lineStyle(StrokeStyle(lineWidth: effectiveIsolatedLine == s.id ? 2.4 : 1.7))
                        .interpolationMethod(.linear)
                    }

                    // Marker at every data point — classic multi-series read,
                    // and single-day sports stay visible
                    ForEach(s.points) { point in
                        PointMark(
                            x: .value("Date", point.date),
                            y: .value("Net", point.cumulative)
                        )
                        .foregroundStyle(color.opacity(dimmed ? 0.22 : 1))
                        .symbolSize(effectiveIsolatedLine == s.id ? 30 : 22)
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                        .foregroundStyle(ink.opacity(0.45))
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                        .foregroundStyle(ink.opacity(0.1))
                    AxisValueLabel {
                        if let v = value.as(Double.self) {
                            Text(signedDollars(v * 100))
                                .font(.system(size: 9))
                                .foregroundStyle(ink.opacity(0.45))
                        }
                    }
                }
            }
        }
    }

    /// Tappable legend — one chip per sport; tap to isolate its line
    private var sportsLegend: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(sportSeries) { s in
                    let color = sportLineColor(s.league)
                    let isFocus = effectiveIsolatedLine == s.id
                    Button {
                        withAnimation(.easeOut(duration: 0.18)) {
                            isolatedSportLine = isFocus ? nil : s.id
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Capsule()
                                .fill(color)
                                .frame(width: 13, height: 3)
                            Text(s.league)
                                .font(GaryFonts.mono(9, bold: true))
                                .foregroundStyle(paper.opacity(isFocus ? 1 : 0.75))
                            Text(signedDollars(s.netUnits * 100))
                                .font(GaryFonts.mono(9, bold: true))
                                .foregroundStyle(s.netUnits >= 0 ? emerald : crimson)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(isFocus ? color.opacity(0.14) : Color.white.opacity(0.045)))
                        .overlay(Capsule().stroke(isFocus ? color.opacity(0.35) : Color.white.opacity(0.09), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.top, 8)
    }

    private var chartTimeframeRow: some View {
        HStack(spacing: 0) {
            ForEach(Array(zip(chartTimeLabels, chartTimeValues)), id: \.1) { label, value in
                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        timeframe = value
                        chartZoomScale = 1.0
                        chartZoomAnchor = 1.0
                        scrubDate = nil
                    }
                } label: {
                    Text(label)
                        .font(.system(size: 11, weight: timeframe == value ? .bold : .medium))
                        .foregroundStyle(timeframe == value ? brass : ink.opacity(0.4))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 5)
                        .background(
                            timeframe == value
                                ? Capsule().fill(brass.opacity(0.12))
                                : Capsule().fill(Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var candleChartBody: some View {
        if visibleCandles.isEmpty {
            chartEmptyState
        } else {
            Chart {
                    // Candlestick wicks (thin lines: high to low)
                    ForEach(visibleCandles) { candle in
                        RectangleMark(
                            x: .value("Date", candle.date),
                            yStart: .value("Low", candle.low),
                            yEnd: .value("High", candle.high),
                            width: 1
                        )
                        .foregroundStyle(candle.isGreen ? candleGreen.opacity(0.7) : candleRed.opacity(0.7))
                    }

                    // Candlestick bodies (thick bars: open to close)
                    ForEach(visibleCandles) { candle in
                        let bodyBottom = min(candle.open, candle.close)
                        let bodyTop = max(candle.open, candle.close)
                        // Ensure minimum visible body height
                        let adjustedTop = bodyTop == bodyBottom ? bodyTop + 0.02 : bodyTop

                        RectangleMark(
                            x: .value("Date", candle.date),
                            yStart: .value("Open", bodyBottom),
                            yEnd: .value("Close", adjustedTop),
                            width: .ratio(0.6)
                        )
                        .foregroundStyle(candle.isGreen ? candleGreen : candleRed)
                    }

                    // Zero line (break-even)
                    RuleMark(y: .value("Zero", 0))
                        .foregroundStyle(ink.opacity(0.25))
                        .lineStyle(StrokeStyle(lineWidth: 0.5, dash: [4, 3]))

                    // Scrub crosshair
                    if let sd = scrubDate {
                        RuleMark(x: .value("Scrub", sd))
                            .foregroundStyle(ink.opacity(0.55))
                            .lineStyle(StrokeStyle(lineWidth: 1))

                        if let sc = scrubCandle {
                            PointMark(
                                x: .value("Date", sc.date),
                                y: .value("Close", sc.close)
                            )
                            .foregroundStyle(ink)
                            .symbolSize(40)
                        }
                    }
                }
                .chartXScale(range: .plotDimension(padding: 12))
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: chartZoomScale >= 3 ? 5 : 4)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(ink.opacity(0.45))
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                            .foregroundStyle(ink.opacity(0.1))
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(signedDollars(v * 100))
                                    .font(.system(size: 9))
                                    .foregroundStyle(ink.opacity(0.45))
                            }
                        }
                    }
                }
                .chartOverlay { proxy in
                    GeometryReader { geometry in
                        Rectangle()
                            .fill(Color.clear)
                            .contentShape(Rectangle())
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { value in
                                        let origin = geometry[proxy.plotAreaFrame].origin
                                        let x = value.location.x - origin.x
                                        if let date: Date = proxy.value(atX: x) {
                                            let prev = scrubDate
                                            if let nearest = visibleCandles.min(by: {
                                                abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
                                            }) {
                                                scrubDate = nearest.date
                                                if prev != nearest.date {
                                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                                }
                                            }
                                        }
                                    }
                                    .onEnded { _ in
                                        withAnimation(.easeOut(duration: 0.15)) {
                                            scrubDate = nil
                                        }
                                    }
                            )
                            .simultaneousGesture(
                                MagnificationGesture()
                                    .onChanged { value in
                                        chartZoomScale = min(8, max(1, chartZoomAnchor * value))
                                    }
                                    .onEnded { _ in
                                        chartZoomAnchor = chartZoomScale
                                    }
                            )
                    }
                }
        }
    }

    // MARK: - Daily Ledger (trading-journal layer)

    private var dailyLedger: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                ledgerEyebrow("DAILY LEDGER")
                Spacer()
                // STORE-SAFE BRIDGE: drawdown is a bankroll stat — off.
                if !AppFlags.storeSafe {
                    Text(journal.maxDrawdownUnits > 0
                         ? "MAX DD \(signedDollars(-journal.maxDrawdownUnits * 100))"
                         : "MAX DD —")
                        .font(GaryFonts.mono(9, bold: true))
                        .foregroundStyle(journal.maxDrawdownUnits > 0 ? negativeColor.opacity(0.85) : ink.opacity(0.45))
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 8)

            if let best = journal.bestDay, let worst = journal.worstDay {
                HStack(spacing: 0) {
                    VStack(spacing: 2) {
                        Text(signedDollars(best.net * 100))
                            .font(GaryFonts.mono(13, bold: true))
                            .foregroundStyle(best.net >= 0 ? positiveColor : negativeColor)
                        Text("BEST \u{00B7} \(best.label)")
                            .font(.system(size: 8, weight: .bold))
                            .tracking(0.6)
                            .foregroundStyle(ink.opacity(0.45))
                    }
                    .frame(maxWidth: .infinity)

                    Rectangle().fill(cardStroke).frame(width: 0.5, height: 24)

                    VStack(spacing: 2) {
                        Text(signedDollars(worst.net * 100))
                            .font(GaryFonts.mono(13, bold: true))
                            .foregroundStyle(worst.net >= 0 ? positiveColor : negativeColor)
                        Text("WORST \u{00B7} \(worst.label)")
                            .font(.system(size: 8, weight: .bold))
                            .tracking(0.6)
                            .foregroundStyle(ink.opacity(0.45))
                    }
                    .frame(maxWidth: .infinity)
                }
                .padding(.bottom, 10)
            }

            if journal.days.isEmpty {
                Text("--")
                    .font(.system(size: 14))
                    .foregroundStyle(ink.opacity(0.35))
                    .frame(maxWidth: .infinity, minHeight: 36)
            } else {
                HStack(spacing: 4) {
                    Text("DAY").frame(maxWidth: .infinity, alignment: .leading)
                    Text("RECORD").frame(width: 60, alignment: .trailing)
                    Text(AppFlags.storeSafe ? "" : "NET").frame(width: AppFlags.storeSafe ? 0 : 64, alignment: .trailing)
                }
                .font(.system(size: 8, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(ink.opacity(0.4))
                .padding(.horizontal, 12)
                .padding(.bottom, 5)

                ForEach(Array(journal.days.enumerated()), id: \.element.id) { index, day in
                    if index > 0 {
                        Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 12)
                    }
                    HStack(spacing: 4) {
                        Text(day.label)
                            .font(.system(size: 12, weight: .bold, design: .default))
                            .foregroundStyle(ink.opacity(0.85))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(day.wins)-\(day.losses)\(day.pushes > 0 ? "-\(day.pushes)" : "")")
                            .font(GaryFonts.mono(12))
                            .foregroundStyle(ink.opacity(0.5))
                            .frame(width: 60, alignment: .trailing)
                        Text(signedDollars(day.net * 100))
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(day.net >= 0 ? positiveColor : negativeColor)
                            .frame(width: 64, alignment: .trailing)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                }
            }
        }
        .padding(.bottom, 8)
        .padding(.horizontal, 16)
    }

    // MARK: - Performance Ledger (by-sport grid + top pick / by spread)

    private func ledgerEyebrow(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .bold))
            .tracking(1)
            .foregroundStyle(ink.opacity(0.55))
    }

    private func ledgerChip(_ label: String, options: [String], uppercase: Bool = true, action: @escaping (String) -> Void) -> some View {
        Menu {
            ForEach(options, id: \.self) { opt in
                Button(uppercase ? opt.uppercased() : opt) { action(opt) }
            }
        } label: {
            HStack(spacing: 3) {
                Text(uppercase ? label.uppercased() : label)
                    .font(.system(size: 9, weight: .bold))
                    .tracking(0.5)
                Image(systemName: "chevron.down")
                    .font(.system(size: 6, weight: .bold))
            }
            .foregroundStyle(ink.opacity(0.7))
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(Capsule().stroke(ink.opacity(0.3), lineWidth: 1))
        }
    }

    private var performanceLedger: some View {
        VStack(spacing: 10) {
            // BY SPORT — full-width terminal data grid
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    ledgerEyebrow("BY SPORT")
                    Spacer()
                    ledgerChip(sportTimeframe, options: timeframes) { sportTimeframe = $0 }
                }
                .padding(.horizontal, 12)
                .padding(.top, 12)
                .padding(.bottom, 8)

                if sportPerformance.isEmpty {
                    Text("--")
                        .font(.system(size: 14))
                        .foregroundStyle(ink.opacity(0.35))
                        .frame(maxWidth: .infinity, minHeight: 44)
                } else {
                    HStack(spacing: 4) {
                        Text("SPORT").frame(maxWidth: .infinity, alignment: .leading)
                        Text("GP").frame(width: 36, alignment: .trailing)
                        Text("WIN%").frame(width: 48, alignment: .trailing)
                        Text(AppFlags.storeSafe ? "" : "NET").frame(width: AppFlags.storeSafe ? 0 : 64, alignment: .trailing)
                    }
                    .font(.system(size: 8, weight: .bold))
                    .tracking(0.5)
                    .foregroundStyle(ink.opacity(0.4))
                    .padding(.horizontal, 12)
                    .padding(.bottom, 5)

                    ForEach(Array(sportPerformance.enumerated()), id: \.element.id) { index, point in
                        let isHighlighted = selectedSport != .all && point.sport == selectedSport.rawValue
                        if index > 0 {
                            Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 12)
                        }
                        HStack(spacing: 4) {
                            Text(point.sport)
                                .font(.system(size: 13, weight: .bold, design: .default))
                                .foregroundStyle(isHighlighted ? brass : ink.opacity(0.85))
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text("\(point.settledCount)")
                                .font(GaryFonts.mono(12))
                                .foregroundStyle(ink.opacity(0.45))
                                .frame(width: 36, alignment: .trailing)
                            Text(String(format: "%.0f%%", point.winRate))
                                .font(GaryFonts.mono(12))
                                .foregroundStyle(point.winRate >= 50 ? positiveColor.opacity(0.9) : ink.opacity(0.45))
                                .frame(width: 48, alignment: .trailing)
                            Text(signedDollars(point.netUnits * 100))
                                .font(GaryFonts.mono(12, bold: true))
                                .foregroundStyle(point.netUnits >= 0 ? positiveColor : negativeColor)
                                .frame(width: 64, alignment: .trailing)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(isHighlighted ? brass.opacity(0.12) : .clear)
                    }
                }
            }
            .padding(.bottom, 6)

            // CONVICTION CALIBRATION — Gary's stated lean vs how those picks
            // actually hit. The honesty chart: gold tick = claimed, bar = real.
            if !calibration.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        ledgerEyebrow("CONVICTION CALIBRATION")
                        Spacer()
                        Text("90D \u{00B7} TICK = CLAIMED")
                            .font(GaryFonts.mono(8, bold: true))
                            .tracking(0.6)
                            .foregroundStyle(brass.opacity(0.7))
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .padding(.bottom, 10)

                    ForEach(Array(calibration.enumerated()), id: \.element.id) { index, bucket in
                        if index > 0 {
                            Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 12)
                        }
                        HStack(spacing: 10) {
                            Text(bucket.label)
                                .font(GaryFonts.mono(12, bold: true))
                                .foregroundStyle(ink.opacity(0.8))
                                .frame(width: 52, alignment: .leading)

                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color.white.opacity(0.08))
                                    Capsule()
                                        .fill(bucket.hitRate >= bucket.claimed ? emerald : crimson)
                                        .frame(width: max(geo.size.width * min(bucket.hitRate, 1), 2))
                                    Rectangle()
                                        .fill(brass)
                                        .frame(width: 2, height: 11)
                                        .offset(x: geo.size.width * min(bucket.claimed, 1) - 1)
                                }
                            }
                            .frame(height: 5)

                            Text(String(format: "%.0f%%", bucket.hitRate * 100))
                                .font(GaryFonts.mono(12, bold: true))
                                .foregroundStyle(bucket.hitRate >= bucket.claimed ? emerald : crimson)
                                .frame(width: 42, alignment: .trailing)
                            Text("n=\(bucket.n)")
                                .font(GaryFonts.mono(10))
                                .foregroundStyle(ink.opacity(0.4))
                                .frame(width: 40, alignment: .trailing)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .opacity(bucket.n < 5 ? 0.55 : 1)
                    }

                    Text("Stated lean (gold tick) vs actual hit rate \u{00B7} settled W/L only \u{00B7} faded = small sample")
                        .font(GaryFonts.mono(9))
                        .foregroundStyle(ink.opacity(0.35))
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                }
                .padding(.bottom, 6)
            }

            // TOP PICK + BY SPREAD — two-up terminal cards
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        ledgerEyebrow("TOP PICK")
                        Spacer()
                        ledgerChip(topdTimeframe, options: topPickTimeframes) { topdTimeframe = $0 }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                    let topd = topdStats
                    if topd.wins + topd.losses == 0 {
                        Text("--")
                            .font(.system(size: 14))
                            .foregroundStyle(ink.opacity(0.35))
                            .frame(maxWidth: .infinity, minHeight: 40)
                    } else {
                        VStack(spacing: 2) {
                            Text("\(topd.wins)-\(topd.losses)")
                                .font(.system(size: 17, weight: .semibold, design: .default))
                                .foregroundStyle(ink.opacity(0.9))
                            Text(signedDollars(topd.pnl * 100))
                                .font(GaryFonts.mono(13, bold: true))
                                .foregroundStyle(topd.pnl >= 0 ? positiveColor : negativeColor)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }

                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, 8)

                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        ledgerEyebrow("BY SPREAD")
                        Spacer()
                        ledgerChip(spreadSport, options: spreadSportsAvailable, uppercase: false) { spreadSport = $0 }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .padding(.bottom, 6)

                    if spreadSizePerformance.isEmpty {
                        Text(selectedTab == 0 ? "No spread data" : "Picks only")
                            .font(GaryFonts.mono(10))
                            .foregroundStyle(ink.opacity(0.4))
                            .frame(maxWidth: .infinity, minHeight: 36)
                    } else {
                        ForEach(Array(spreadSizePerformance.enumerated()), id: \.offset) { index, item in
                            if index > 0 {
                                Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 12)
                            }
                            HStack(spacing: 4) {
                                Text(item.bucket)
                                    .font(.system(size: 12, weight: .bold, design: .default))
                                    .foregroundStyle(ink.opacity(0.8))
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                let total = item.wins + item.losses + item.pushes
                                let pct = total > 0 ? Int(round(Double(item.wins) / Double(total) * 100)) : 0
                                Text("\(pct)%")
                                    .font(GaryFonts.mono(10, bold: false))
                                    .foregroundStyle(ink.opacity(0.45))

                                Text(signedDollars(item.net * 100))
                                    .font(GaryFonts.mono(11, bold: true))
                                    .foregroundStyle(item.net >= 0 ? positiveColor : negativeColor)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                        }
                    }

                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, 8)
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - HR Longshot Tracker (the fun lane — never in the books above)

    private static let hrDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    private static func hrDayLabel(_ iso: String?) -> String {
        guard let iso else { return "" }
        guard let d = BillfoldCompute.dayFormatter.date(from: String(iso.prefix(10))) else { return "" }
        return hrDayFormatter.string(from: d).uppercased()
    }

    /// Every settled HR call in the loaded window, newest first. HR results are
    /// excluded from every official surface above — this section is their only
    /// tally on the page (founder: "track it simply from a fun standpoint,
    /// just to see"; it never accumulates to the total or the balance).
    private var hrLaneResults: [PropResult] {
        validPropResults
            .filter { $0.isHRResult && ($0.result == "won" || $0.result == "lost") }
            .sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
    }

    /// The "what if" figure: a flat stake tailing every HR call. Fun
    /// bookkeeping only — it never joins the balance block above.
    private var hrTailNetDollars: Double {
        hrLaneResults.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) } * 100
    }

    /// Mean American price across the calls — HR bets are all plus-money.
    private var hrAvgPrice: Int? {
        let prices = hrLaneResults.compactMap { Double($0.odds?.value ?? "") }.filter { $0 > 0 }
        guard !prices.isEmpty else { return nil }
        return Int((prices.reduce(0, +) / Double(prices.count)).rounded())
    }

    @ViewBuilder
    private var hrFunTracker: some View {
        let calls = hrLaneResults
        if !calls.isEmpty {
            let hits = calls.filter { $0.result == "won" }.count
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(brass)
                    ledgerEyebrow("HR THREATS")
                    Spacer()
                    Text("LONGSHOT LANE")
                        .font(GaryFonts.mono(9, bold: true)).tracking(1)
                        .foregroundStyle(brass.opacity(0.8))
                }
                .padding(.horizontal, 12)
                .padding(.top, 12)
                .padding(.bottom, 10)

                // The tally: connects, the tail-every-call swing, the going rate.
                HStack(spacing: 0) {
                    VStack(spacing: 2) {
                        Text("\(hits) of \(calls.count)")
                            .font(GaryFonts.mono(14, bold: true))
                            .foregroundStyle(paper.opacity(0.9))
                        Text("CONNECTED")
                            .font(.system(size: 8, weight: .bold)).tracking(0.6)
                            .foregroundStyle(ink.opacity(0.45))
                    }
                    .frame(maxWidth: .infinity)

                    Rectangle().fill(cardStroke).frame(width: 0.5, height: 26)

                    VStack(spacing: 2) {
                        Text(signedDollars(hrTailNetDollars))
                            .font(GaryFonts.mono(14, bold: true))
                            .foregroundStyle(hrTailNetDollars >= 0 ? emerald : crimson)
                        Text("TAILING EVERY CALL")
                            .font(.system(size: 8, weight: .bold)).tracking(0.6)
                            .foregroundStyle(ink.opacity(0.45))
                    }
                    .frame(maxWidth: .infinity)

                    if let avg = hrAvgPrice {
                        Rectangle().fill(cardStroke).frame(width: 0.5, height: 26)
                        VStack(spacing: 2) {
                            Text("+\(avg)")
                                .font(GaryFonts.mono(14, bold: true))
                                .foregroundStyle(brass)
                            Text("AVG PRICE")
                                .font(.system(size: 8, weight: .bold)).tracking(0.6)
                                .foregroundStyle(ink.opacity(0.45))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(.bottom, 10)

                // Last-12 swing punches, oldest → newest (the wallet-dot idiom).
                HStack(spacing: 5) {
                    ForEach(Array(calls.prefix(12).reversed().enumerated()), id: \.offset) { _, c in
                        Circle()
                            .fill(c.result == "won" ? emerald : crimson.opacity(0.5))
                            .frame(width: 6, height: 6)
                    }
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)

                // The recent calls themselves — who, the price, the verdict.
                ForEach(Array(calls.prefix(6).enumerated()), id: \.offset) { index, call in
                    if index > 0 {
                        Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 12)
                    }
                    HStack(spacing: 8) {
                        Text(Self.hrDayLabel(call.game_date))
                            .font(GaryFonts.mono(10))
                            .foregroundStyle(ink.opacity(0.45))
                            .frame(width: 48, alignment: .leading)
                        Text((call.player_name ?? call.pick_text ?? "HR call").uppercased())
                            .font(.system(size: 12, weight: .bold, design: .default))
                            .foregroundStyle(ink.opacity(0.85))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text("HR")
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            .foregroundStyle(brass.opacity(0.8))
                        Spacer(minLength: 6)
                        if let o = call.odds?.value, !o.isEmpty {
                            Text(o.hasPrefix("+") || o.hasPrefix("-") ? o : "+\(o)")
                                .font(GaryFonts.mono(11))
                                .foregroundStyle(ink.opacity(0.5))
                        }
                        Text(call.result == "won" ? "HIT" : "MISS")
                            .font(GaryFonts.mono(11, bold: true))
                            .foregroundStyle(call.result == "won" ? emerald : ink.opacity(0.4))
                            .frame(width: 38, alignment: .trailing)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                }

                Text("Home-run calls from the Hub's HR Threats lane, tracked for the fun of it \u{00B7} \(showDollarResults ? "flat $100 tails" : "flat 1u tails"), hypothetical \u{00B7} never counted in Gary's record or balance above")
                    .font(GaryFonts.mono(9))
                    .foregroundStyle(ink.opacity(0.35))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
            }
            .padding(.bottom, 8)
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Recent Results Tape

    private var recentCarousel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("GARY'S RECENT PICKS")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold)
                Text("\(selectedTab == 0 ? recentGameCards.count : recentPropCards.count)")
                    .font(GaryFonts.mono(11))
                    .foregroundStyle(paper.opacity(0.55))
                Spacer()
            }
            .padding(.horizontal, 20)

            if selectedTab == 0 {
                if recentGameCards.isEmpty {
                    emptyCarousel
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: 8) {   // lazy: up to 20 cards, build on-demand
                            ForEach(Array(recentGameCards.enumerated()), id: \.offset) { _, result in
                                gameCardView(result)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            } else {
                if recentPropCards.isEmpty {
                    emptyCarousel
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: 8) {   // lazy: up to 20 cards, build on-demand
                            ForEach(Array(recentPropCards.enumerated()), id: \.offset) { _, result in
                                propCardView(result)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    /// Strip odds from pick_text (e.g. "Brooklyn Nets +2.0 -112" → "Brooklyn Nets +2.0")
    private func pickWithoutOdds(_ text: String) -> String {
        // Remove trailing American odds like " -112", " +150", " -225"
        let pattern = #"\s+[+-]\d{3,}$"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           let range = Range(match.range, in: text) {
            return String(text[text.startIndex..<range.lowerBound])
        }
        return text
    }

    /// Extract mascot name for compact display (e.g. "Trail Blazers +2.0" from "Portland Trail Blazers +2.0")
    private func mascotName(_ pickText: String) -> String {
        // Handle ML picks: strip "ML" suffix, get mascot, then append "ML"
        var mlSuffix = ""
        var cleaned = pickText
        if cleaned.hasSuffix(" ML") {
            mlSuffix = " ML"
            cleaned = String(cleaned.dropLast(3))
        }

        // Remove spread/line suffix like "+2.0", "-5.5", "+1.5"
        let spreadPattern = #"\s+[+-]\d+(?:\.\d+)?$"#
        if let regex = try? NSRegularExpression(pattern: spreadPattern),
           let match = regex.firstMatch(in: cleaned, range: NSRange(cleaned.startIndex..., in: cleaned)),
           let range = Range(match.range, in: cleaned) {
            cleaned = String(cleaned[cleaned.startIndex..<range.lowerBound])
        }

        // Two-word mascots that must stay together — the ONE canonical list
        // (Formatters.twoWordMascots); local copies drift and resurrect the
        // "SOX @ SOX" bug (founder, Jul 10 + 12).
        for mascot in Formatters.twoWordMascots {
            if cleaned.hasSuffix(mascot) {
                return mascot + mlSuffix
            }
        }

        // Default: use last word as mascot
        let words = cleaned.split(separator: " ")
        if words.count > 1 {
            return String(words.last!) + mlSuffix
        }
        return cleaned + mlSuffix
    }

    private func gameCardView(_ result: GameResult) -> some View {
        Group {
            if let pick = garyPick(from: result) {
                // Billfold's recent picks are receipts, not live cards — static,
                // no flip, no Take affordance.
                CompactPickRow(pick: pick,
                               gameResult: result.result,
                               finalScore: result.final_score,
                               showSportBadge: true,
                               showTakeAffordance: false)
                    .frame(width: 300)
            }
        }
    }

    /// Build a GaryPick from a settled GameResult so Billfold's recent entries
    /// render in the standard flippable game-pick card. Results carry no pre-game
    /// reasoning/confidence — the front shows the final score in place of the lean,
    /// and the flip-back is brief (matchup + pick + odds).
    private func garyPick(from r: GameResult) -> GaryPick? {
        var away = "", home = ""
        if let m = r.matchup {
            let parts = m.components(separatedBy: " @ ")
            if parts.count == 2 {
                away = parts[0].trimmingCharacters(in: .whitespaces)
                home = parts[1].trimmingCharacters(in: .whitespaces)
            }
        }
        let rword = (r.result ?? "").uppercased()
        var recap: [String] = []
        if !rword.isEmpty { recap.append("Graded \(rword)") }
        if let s = r.final_score, !s.isEmpty { recap.append("final \(s)") }
        if let pt = r.pick_text, !pt.isEmpty { recap.append(pt) }
        let league = r.effectiveLeague ?? r.league ?? ""
        return GaryPick.from(dict: [
            "pick": Self.withTotalUnit(r.pick_text ?? r.matchup ?? "", league: league),
            "league": league,
            "homeTeam": home,
            "awayTeam": away,
            "rationale": recap.isEmpty ? "Settled pick." : recap.joined(separator: " \u{00B7} ")
        ])
    }

    /// The scoring unit for a totals (Over/Under) pick, by sport — so "Over 2.5" reads
    /// "Over 2.5 Goals" (WC/NHL), "Over 8.5 Runs" (MLB), "Over 210.5 Points" (NBA/NFL/NCAAB).
    private static func totalUnit(_ league: String) -> String {
        switch league.uppercased() {
        case "WC", "SOCCER", "MLS", "EPL", "UCL", "NHL": return "Goals"
        case "MLB": return "Runs"
        default: return "Points"
        }
    }

    /// Insert the scoring unit into a totals pick, after the number and before any odds.
    /// Leaves ML/spread picks and already-unit'd totals untouched.
    static func withTotalUnit(_ pickText: String, league: String) -> String {
        let lower = pickText.lowercased()
        guard lower.hasPrefix("over ") || lower.hasPrefix("under ") else { return pickText }
        if ["goal", "run", "point", "pts"].contains(where: { lower.contains($0) }) { return pickText }
        let unit = totalUnit(league)
        let pattern = #"^([Oo]ver|[Uu]nder)\s+(\d+(?:\.\d+)?)(\s+[+-]\d+)?$"#
        if let re = try? NSRegularExpression(pattern: pattern),
           let m = re.firstMatch(in: pickText, range: NSRange(pickText.startIndex..., in: pickText)) {
            let ns = pickText as NSString
            let side = ns.substring(with: m.range(at: 1))
            let num = ns.substring(with: m.range(at: 2))
            let odds = m.range(at: 3).location != NSNotFound ? ns.substring(with: m.range(at: 3)) : ""
            return "\(side) \(num) \(unit)\(odds)"
        }
        return "\(pickText) \(unit)"
    }

    private func propCardView(_ result: PropResult) -> some View {
        Group {
            if let prop = propPickFrom(result) {
                // Identical to the canonical prop card on Winners/Picks — the same
                // CompactPropRow, width-matched to the game card for the carousel.
                CompactPropRow(prop: prop,
                               gameResult: result.result,
                               showSportBadge: true)
                    .frame(width: 300)
            }
        }
    }

    /// Build a PropPick from a settled PropResult so Billfold's recent prop
    /// entries render in the standard CompactPropRow (mirrors garyPick(from:)).
    private func propPickFrom(_ r: PropResult) -> PropPick? {
        var dict: [String: Any] = [
            "player": r.player_name ?? "",
            "prop": r.prop_type ?? "",
            "bet": r.bet ?? r.pick_text ?? "",
            "league": r.effectiveLeague ?? r.league ?? r.sport ?? "",
            "matchup": r.matchup ?? "",
        ]
        if let o = r.odds?.value { dict["odds"] = o }
        if let l = r.line_value?.value { dict["line"] = l }
        if let c = r.confidence { dict["confidence"] = NSNumber(value: c) }
        return PropPick.from(dict: dict)
    }

    private var emptyCarousel: some View {
        Text(selectedSport == .all ? "No entries yet" : "No \(selectedSport.rawValue) entries")
            .font(.system(size: 14, weight: .medium, design: .default))
            .foregroundStyle(paper.opacity(0.4))
            .frame(maxWidth: .infinity, minHeight: 80)
    }

    // MARK: - Loading / Error

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView().tint(brass)
            Text("Opening the books\u{2026}")
                .font(.system(size: 13, weight: .medium, design: .default))
                .foregroundStyle(paper.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private func errorState(error: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 20))
                .foregroundStyle(paper.opacity(0.35))
            Text(error)
                .font(.system(size: 12, weight: .medium, design: .default))
                .foregroundStyle(paper.opacity(0.55))
            Button {
                Task { await loadData() }
            } label: {
                Text("Retry")
                    .font(.system(size: 12, weight: .bold, design: .default))
                    .foregroundStyle(leather)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 7)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(brass)
                    )
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 50)
    }

    // MARK: - Data Loading

    /// True when any active timeframe selection needs the full (unbounded)
    /// history — only then do we page the entire ledger. The default 7d/30d/90d
    /// view is served from the bounded ~150-day snapshot.
    private var needsFullHistory: Bool {
        BillfoldSnapshotStore.needsFullHistory(timeframe: timeframe)
            || BillfoldSnapshotStore.needsFullHistory(timeframe: sportTimeframe)
            || BillfoldSnapshotStore.needsFullHistory(timeframe: topdTimeframe)
    }

    private func loadData(forceRefresh: Bool = false) async {
        let (wantsFull, loadGeneration) = await MainActor.run {
            billfoldLoadGeneration += 1
            return (needsFullHistory, billfoldLoadGeneration)
        }
        let cachedSnapshot = await MainActor.run { BillfoldSnapshotStore.shared.cachedSnapshotIfFresh(fullHistory: wantsFull) }
        await MainActor.run {
            if settledCount == 0 && cachedSnapshot == nil { loading = true }
            error = nil
        }

        do {
            let propSince: String? = wantsFull
                ? nil
                : BillfoldCompute.dayFormatter.string(
                    from: Calendar.current.date(
                        byAdding: .day,
                        value: -150,
                        to: Date()
                    ) ?? Date()
                )
            let snapshot = try await BillfoldSnapshotStore.shared.load(forceRefresh: forceRefresh, fullHistory: wantsFull)
            await MainActor.run {
                guard loadGeneration == billfoldLoadGeneration else { return }
                applySnapshot(snapshot)
            }

            // The visible default is Picks. Hydrate the larger Props history
            // only after Picks has painted so it cannot delay the first frame.
            let props = try? await Task.detached(priority: .utility) {
                try await SupabaseAPI.fetchPropResults(
                    since: propSince,
                    forceRefresh: forceRefresh,
                    billfold: true
                )
            }.value
            if let props {
                await MainActor.run {
                    guard loadGeneration == billfoldLoadGeneration else { return }
                    propResults = props
                    recomputeCache()
                }
            }

            // Let SwiftUI present the ledger before adding the optional
            // Top-Pick/calibration data. This query projects only three small
            // JSON fields per historical pick; it no longer downloads full
            // rationales and stat packs.
            let metadataSince = BillfoldSnapshotStore.pickMetadataSince()
            let metadataTask = Task.detached(priority: .utility) {
                let metadata = try await SupabaseAPI.fetchBillfoldPickMetadata(
                    since: metadataSince,
                    forceRefresh: forceRefresh
                )
                return (
                    BillfoldCompute.topPickCandidates(from: metadata),
                    BillfoldCompute.confidenceIndex(from: metadata)
                )
            }

            if let metadata = try? await metadataTask.value {
                await MainActor.run {
                    guard loadGeneration == billfoldLoadGeneration else { return }
                    topPickCandidates = metadata.0
                    pickConfidenceIndex = metadata.1
                    recomputeCache()
                }
            }
        } catch {
            await MainActor.run {
                guard loadGeneration == billfoldLoadGeneration else { return }
                self.error = "Failed to load data"
                loading = false
            }
        }
    }

    // MARK: - Helpers

    private func calculateRecord() -> (wins: Int, losses: Int, pushes: Int) {
        let results = selectedTab == 0
            ? filteredGameResults.map { $0.result ?? "" }
            : filteredPropResults.map { $0.result ?? "" }
        return results.reduce(into: (wins: 0, losses: 0, pushes: 0)) { acc, result in
            switch result {
            case "won": acc.wins += 1
            case "lost": acc.losses += 1
            case "push": acc.pushes += 1
            default: break
            }
        }
    }

    private func isLegitPropResult(_ result: PropResult) -> Bool {
        BillfoldCompute.isLegitPropResult(result)
    }

    private func billfoldDate(from iso: String?) -> Date {
        BillfoldCompute.date(from: iso)
    }

    /// Parse date string — handles both ISO8601 (with T) and plain YYYY-MM-DD
    private func billfoldParseDate(_ string: String) -> Date? {
        BillfoldCompute.parseDate(string)
    }

    private func parseAmericanOdds(_ string: String?) -> Int? {
        BillfoldCompute.parseAmericanOdds(string)
    }

    private func units(for result: String?, odds: String?) -> Double {
        BillfoldCompute.units(for: result, odds: odds)
    }

    private func signedUnits(_ value: Double) -> String {
        let rounded = String(format: "%.1f", abs(value))
        return value >= 0 ? "+\(rounded)" : "-\(rounded)"
    }

    private func dailyCandlesticks(items: [(String?, Double)]) -> [BillfoldCandlestick] {
        let grouped = Dictionary(grouping: items.compactMap { item -> (Date, Double)? in
            guard let iso = item.0, let parsed = billfoldParseDate(iso) else { return nil }
            return (Calendar.current.startOfDay(for: parsed), item.1)
        }) { $0.0 }

        var running = 0.0
        return grouped.keys.sorted().map { date in
            let bets = grouped[date]?.map { $0.1 } ?? []
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

    private func dailyTrend(items: [(String?, Double)]) -> [BillfoldTrendPoint] {
        let grouped = Dictionary(grouping: items.compactMap { item -> (Date, Double)? in
            guard let iso = item.0, let parsed = billfoldParseDate(iso) else { return nil }
            return (Calendar.current.startOfDay(for: parsed), item.1)
        }) { $0.0 }

        var running = 0.0
        return grouped.keys.sorted().map { date in
            let total = grouped[date]?.reduce(0.0) { $0 + $1.1 } ?? 0
            running += total
            return BillfoldTrendPoint(
                date: date,
                label: Formatters.formatDate(isoFormatterNoFrac.string(from: date)),
                units: total,
                cumulative: running
            )
        }
    }

    private func groupedSportPerformance(from rows: [(String?, String?, String?)]) -> [BillfoldSportPoint] {
        BillfoldCompute.groupedSportPerformance(from: rows)
    }

    private func billfoldWinRate(from results: [String?]) -> Double {
        BillfoldCompute.winRate(from: results)
    }

    private func sinceDate(for timeframe: String) -> String? {
        sinceDateValue(for: timeframe).map { formatISO($0) }
    }

    private func sinceDateValue(for timeframe: String) -> Date? {
        Self.sinceDateValueStatic(for: timeframe)
    }

    private func formatISO(_ date: Date) -> String {
        BillfoldCompute.dayFormatter.string(from: date)
    }

    static func sinceDateValueStatic(for timeframe: String) -> Date? {
        let cal = Calendar.current
        let now = Date()
        switch timeframe {
        case "7d":
            return cal.date(byAdding: .day, value: -7, to: now)
        case "30d":
            return cal.date(byAdding: .day, value: -30, to: now)
        case "90d":
            return cal.date(byAdding: .day, value: -90, to: now)
        case "ytd":
            return cal.date(from: DateComponents(year: cal.component(.year, from: now), month: 1, day: 1))
        default:
            return nil
        }
    }

}

struct BillfoldTrendPoint: Identifiable {
    let date: Date
    let label: String
    let units: Double
    let cumulative: Double
    var id: TimeInterval { date.timeIntervalSince1970 }
}

// MARK: - Candlestick OHLC Data

struct BillfoldCandlestick: Identifiable {
    let date: Date
    let open: Double   // cumulative P&L at start of day (in units)
    let close: Double  // cumulative P&L at end of day
    let high: Double   // highest intraday cumulative
    let low: Double    // lowest intraday cumulative
    var id: TimeInterval { date.timeIntervalSince1970 }
    var isGreen: Bool { close >= open }
}

struct BillfoldSportSeries: Identifiable {
    let league: String
    let points: [BillfoldTrendPoint]
    let netUnits: Double
    let settled: Int
    var id: String { league }
}

struct BillfoldSportPoint: Identifiable {
    let sport: String
    let netUnits: Double
    let winRate: Double
    let settledCount: Int
    var id: String { sport }
}

struct BillfoldMarketPoint: Identifiable {
    let bucket: String
    let netUnits: Double
    let wins: Int
    let losses: Int
    let pushes: Int
    var id: String { bucket }
}
