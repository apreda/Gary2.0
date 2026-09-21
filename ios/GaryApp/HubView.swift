import SwiftUI

// MARK: - The Hub

extension HubLeagueSel {
    /// MLB's compact Fantasy watch lives inside the Hub; NFL keeps its weekly desk.
    var supportsFantasy: Bool { self == .nfl }
}

struct HubView: View {
    /// Whether the Hub tab is frontmost. ContentView keeps tab pages alive
    /// (opacity-switched), so visibility flips drive the staleness refetch
    /// and deep-link consumption instead of onAppear/.task.
    var isVisible: Bool = true
    var onSelectGame: (String, String?, Int?) -> Void = { _, _, _ in }

    @StateObject private var focus = HubFocusState.shared
    @ObservedObject private var liveScores = LiveScoreCache.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var loadTask: Task<Void, Never>? = nil
    @State private var loadGeneration: UInt64 = 0
    @State private var requestDate = ""
    @State private var connectionSnapshots: [HubLeagueSel: Data] = [:]
    @State private var boardFetchFailed = false
    @State private var boardLoading = false
    @State private var intelLoading = false
    @State private var intelFetchFailed = false
    @State private var pulseLoadingLeagues: Set<String> = []
    @State private var pulseErrorLeagues: Set<String> = []
    @State private var historyLoading = false
    @State private var historyFetchFailed = false
    @State private var historyDate = ""
    @State private var mastheadOffscreen = false

    @State private var sel: HubLeagueSel = .mlb
    @State private var selectedSignal: Signal? = nil
    private struct PlayerRead: Identifiable {
        let signal: Signal
        let card: PlayerInsightCardRow
        var id: UUID { signal.id }
    }
    @State private var playerRead: PlayerRead? = nil
    @State private var teamCardSignal: Signal? = nil
    @State private var fantasyRefreshToken = UUID()
    @State private var frontPageNow = Date()

    /// Player-backed signals open their populated player card — MLB always,
    /// football when today's pack exists for the id. Team-backed rows use
    /// the team card, with the compact signal overlay as the safe fallback.
    private func openSignal(_ s: Signal) {
        // A populated, exact current-day/game card carries the full original
        // read. Never refetch a player without the doubleheader's game id.
        if let index = researchPlayerIndex(s) {
            playerRead = PlayerRead(signal: s, card: intelCards[index])
            return
        }
        // The college poll lane describes both sides of a matchup. Its
        // provider game id opens that game's existing sheet; the writer's
        // home-team bookkeeping id must not turn the story into a team card.
        if s.league == .ncaaf, s.lane?.source == "balldontlie_ncaaf_rankings" {
            let matches = slateRows.filter { row in
                HubCardIdentity.sameLeague(row.league, s.league.label)
                    && s.gameId != nil && row.bdl_game_id.map(String.init) == s.gameId
            }
            if matches.count == 1 { gameSheet = HubGameSel(row: matches[0]) }
            else { selectedSignal = s }
            return
        }
        // 2. A row the lanes stamped with a TEAM and no player is a team row —
        // a bullpen, a head-to-head, a one-run record — and it opens the team
        // card (the law, Aug 4 2026). This sits ahead of the name lookup so a
        // club's own name can never be read as a player's.
        if s.playerId == nil, s.teamId != nil || s.h2h != nil {
            teamCardSignal = s
            return
        }
        // Keep a player story's own full read when its exact card is absent.
        if s.playerId != nil { selectedSignal = s; return }
        // Team context without a populated player card uses the team page.
        if s.teamId != nil || s.h2h != nil { teamCardSignal = s }
        else { selectedSignal = s }
    }

    /// The visible action and the tap share the same exact-card eligibility.
    /// A missing player pack opens the observation, never an unrelated card.
    private func researchPlayerIndex(_ s: Signal) -> Int? {
        guard s.reg?.day != "tomorrow",
              s.playerId != nil || (s.teamId == nil && s.h2h == nil),
              !(s.league == .ncaaf && s.lane?.source == "balldontlie_ncaaf_rankings") else { return nil }
        return HubStoryIdentity.playerCardIndex(
            league: s.league.label, slateDate: s.slateDate,
            playerID: s.playerId, playerName: Self.signalPlayerName(s), gameID: s.gameId,
            loadedDate: loadedDate, currentDate: SupabaseAPI.todayEST(),
            candidates: intelCards.map {
                .init(league: $0.league, playerID: $0.player_id, gameID: $0.game_id,
                      name: $0.player_name ?? $0.payload?.name, hasPayload: $0.payload != nil)
            })
    }

    private func researchDestination(_ s: Signal) -> String {
        if researchPlayerIndex(s) != nil { return "Player research" }
        if s.league == .ncaaf, s.lane?.source == "balldontlie_ncaaf_rankings" {
            let count = slateRows.filter {
                HubCardIdentity.sameLeague($0.league, s.league.label)
                    && s.gameId != nil && $0.bdl_game_id.map(String.init) == s.gameId
            }.count
            return count == 1 ? "Game research" : "View insight"
        }
        if s.playerId == nil, s.teamId != nil || s.h2h != nil { return "Team research" }
        return "View insight"
    }

    /// The player a row is about, as the row spells him. Lanes append their own
    /// punctuation ("Max Scherzer: 6.16 ERA", "Grant Taylor /
    /// Bryan Hudson"), so the name is the head of the headline. Hyphens stay —
    /// Crow-Armstrong is one name.
    static func signalPlayerName(_ s: Signal) -> String {
        let head = s.headline.components(separatedBy: CharacterSet(charactersIn: ":(,/·—")).first ?? s.headline
        return head.trimmingCharacters(in: .whitespaces)
    }

    /// The display name a team card is about (mirrors the sheet's own header).
    static func teamCardName(for s: Signal) -> String {
        if let h = s.h2h, let d = h.dominant_name, !d.isEmpty { return d }
        if let t = s.fantasy?.team, !t.isEmpty { return t }
        if let t = s.swap?.team, !t.isEmpty { return t }
        if let t = s.lane?.team, !t.isEmpty { return t }
        if let t = s.lane?.team_abbr, !t.isEmpty { return t }
        if s.kind == .bullpenFatigue, let range = s.headline.range(of: " pen: ") {
            return String(s.headline[..<range.lowerBound])
        }
        if s.kind == .teamRecord, let range = s.headline.range(of: #" \d+-\d+ in "#, options: .regularExpression) {
            return String(s.headline[..<range.lowerBound])
        }
        if s.kind == .regression, s.playerId == nil,
           let range = s.headline.range(of: #" are \d+-\d+ in one-run games"#, options: .regularExpression) {
            return String(s.headline[..<range.lowerBound])
        }
        if s.league == .mlb, s.kind == .streak, s.teamId != nil,
           let code = s.headline.split(separator: " ").first.map(String.init),
           mlbTeamKeywords[code] != nil {
            return code
        }
        return s.headline
    }

    /// Everything else tonight about this team — id-exact when the signal
    /// carries one, name match otherwise (streak-seeded cards have no id).
    private func relatedTeamSignals(for s: Signal) -> [Signal] {
        // Tomorrow's projections have their own board and must not appear as
        // today's team evidence, even when the same clubs play both days.
        let todaySignals = leagueSignals.filter { $0.reg?.day != "tomorrow" }
        if let tid = s.teamId {
            return todaySignals.filter { $0.id != s.id && $0.teamId == tid }
        }
        let name = Self.teamCardName(for: s)
        return todaySignals.filter { r in
            r.id != s.id && r.league == s.league
                && HubCardIdentity.matchesTeam(Self.teamCardName(for: r), name: name, abbr: nil, league: s.league.label)
        }
    }

    /// Only a unique team within the selected league can own a slate row.
    private func slateRowForTeamName(_ name: String) -> TomorrowBoardRow? {
        let candidates = slateRows.filter { r in
            guard HubCardIdentity.sameLeague(r.league, sel.label) else { return false }
            let away = HubCardIdentity.matchesTeam(name, name: r.away_team, abbr: r.away_abbr, league: sel.label)
            let home = HubCardIdentity.matchesTeam(name, name: r.home_team, abbr: r.home_abbr, league: sel.label)
            return away != home
        }
        return candidates.count == 1 ? candidates[0] : nil
    }

    private func slateRowForTeamSignal(_ signal: Signal) -> TomorrowBoardRow? {
        if let id = signal.gameId, !id.isEmpty {
            let matches = (todayBoard?.board ?? []).filter {
                HubCardIdentity.sameLeague($0.league, signal.league.label)
                    && $0.bdl_game_id.map(String.init) == id
            }
            return matches.count == 1 ? matches[0] : nil
        }
        guard signal.league == sel else { return nil }
        return slateRowForTeamName(Self.teamCardName(for: signal))
    }

    /// Streak rows carry no team id — synthesize the seed signal so a team tap
    /// still lands on the TEAM CARD (routing law, everywhere; founder Jul 30:
    /// tapping the Reds must never dump you on the Picks page).
    private func openTeamCard(for r: StreakRow) {
        let name = r.subject ?? r.team ?? ""
        guard !name.isEmpty else { return }
        teamCardSignal = Signal(
            league: sel, kind: .streak, headline: name,
            detail: r.detail ?? "", game: r.next_game?.uppercased() ?? "",
            value: "", tone: .neutral)
    }

    /// ANY team string — full name, nickname, or a bare abbr out of an agate
    /// table cell — opens the team card (the law, Aug 4: a tapped team name
    /// opens the team card, everywhere, no exceptions). The sheet resolves
    /// the string against the day board for its full identity.
    private func openTeamCard(named name: String) {
        let clean = name.trimmingCharacters(in: .whitespaces)
        guard !clean.isEmpty else { return }
        teamCardSignal = Signal(
            league: sel, kind: .teamRecord, headline: clean,
            detail: "", game: "", value: "", tone: .neutral)
    }
    /// Slate-strip tap → the in-place game sheet (everything the Hub knows
    /// about that matchup). Picks is a CTA inside it, not a forced jump.
    @State private var gameSheet: HubGameSel? = nil
    @State private var searchOpen = false
    @State private var searchText: String = ""
    @FocusState private var searchFocused: Bool

    // Fetched data — real rows only, honest empty states.
    @State private var fetched: [Signal] = []
    @State private var didLoad = false
    @State private var loadedAt: Date? = nil
    @State private var loadedDate: String = ""
    /// Current-day insight transport/schema failures, tracked per desk. A
    /// healthy MLB response must never make a broken NFL/NCAAF feed look like
    /// an honest empty board.
    @State private var fetchErrorLeagues: Set<HubLeagueSel> = []
    /// Yesterday's graded tally.
    @State private var hitRate: (hit: Int, graded: Int)? = nil
    /// Whether the graded surface really is yesterday (vs the walk-back day).
    @State private var gradedIsYesterday = true
    @State private var gradedDayShort = ""
    @State private var ydaySignals: [Signal] = []
    @State private var streakRows: [StreakRow] = []
    @State private var nightRows: [NightHighlightRow] = []
    /// Tap-a-name → player card (founder, Jul 22): the day's player cards,
    /// resolved by name; a tapped name opens the same breakdown sheet the
    /// intel rows use. Names with no card stay plain text — no dead taps.
    @State private var intelCards: [PlayerInsightCardRow] = []
    @State private var namedCard: PlayerInsightCardRow? = nil
    @State private var todayBoard: TomorrowBoard? = nil
    /// LEAGUE PULSE (moved from the Picks page — founder, Jul 30): league-wide
    /// daily tables, fetched with the page load so pull-to-refresh and the
    /// staleness refetch cover it like everything else on the page. Since
    /// Aug 27 2026 the pipeline writes NFL/NCAAF tabs too — one dict keyed by
    /// league label, the same generic table renderer for every desk.
    @State private var pulseByLeague: [String: [LeaguePulseRow]] = [:]
    @State private var pulseTab: String? = nil
    private var pulseRows: [LeaguePulseRow] { pulseByLeague[sel.label] ?? [] }
    @State private var pendingScrollAnchor: String? = nil
    /// Beats currently expanded past their top rows ("See all n").
    @AppStorage("hubOpenResearchModulesV1") private var savedOpenBeats = "{}"
    private var openBeats: Set<String> {
        get { HubResearchLayout.openSections(in: savedOpenBeats, league: sel.label) }
        nonmutating set { savedOpenBeats = HubResearchLayout.saving(newValue, league: sel.label, in: savedOpenBeats) }
    }
    private var openBeatsBinding: Binding<Set<String>> {
        Binding(get: { openBeats }, set: { openBeats = $0 })
    }
    @State private var researchChartSignal: Signal?
    /// THE BOARD IS MOVING → THE LADDER for the tapped game (Sep 9 2026).
    @State private var ladderSel: LineLadderSel?
    /// Floating section nav — the trailing index button pops the section
    /// list so everything is one tap away (founder, Jul 4).
    @State private var sectionNavOpen = false
    /// Pre-grouped [league: [kind: rows]] — rebuilt once per load.
    @State private var itemsIndex: [HubLeagueSel: [SignalKind: [Signal]]] = [:]

    private var nightLabel: String {
        (gradedIsYesterday || gradedDayShort.isEmpty) ? "Last Night" : gradedDayShort
    }

    // ---- data plumbing (carried from the original Hub page — hardened in production) ----

    private static func buildItemsIndex(_ all: [Signal]) -> [HubLeagueSel: [SignalKind: [Signal]]] {
        var idx: [HubLeagueSel: [SignalKind: [Signal]]] = [:]
        for s in all where s.confirmedXI == nil {
            idx[s.league, default: [:]][s.kind, default: []].append(s)
        }
        return idx
    }

    /// Defensive dedupe: the pipeline occasionally lands the same read twice
    /// with a rounding difference ("7.4 vs 4.33" and "7.4 vs 4.3"). Key on
    /// lane + game + subject (+ regression day) and keep the first (rows come
    /// relevance-ordered), so a double insert never renders as two rows.
    private static func dedupe(_ all: [Signal]) -> [Signal] {
        var seen = Set<String>()
        var out: [Signal] = []
        for s in all {
            // Digits are stripped from the subject so a re-run with moved
            // numbers ("France head the title market at +170" → "+175")
            // still collapses to one story.
            let subj = HubFmt.subject(s.headline).filter { !$0.isNumber }
            let key = HubStoryIdentity.dedupeKey(
                league: s.league.label, slateDate: s.slateDate, gameID: s.gameId,
                game: s.game, kind: String(describing: s.kind), subject: subj, variant: s.reg?.day)
            if seen.insert(key).inserted { out.append(s) }
        }
        return out
    }

    private func items(_ k: SignalKind) -> [Signal] { itemsIndex[sel]?[k] ?? [] }

    /// Name → today's player card, punctuation/case-tolerant. Only names that
    /// resolve become tappable (founder, Jul 22: click a name, get the card).
    private func intelCard(for name: String?, league: HubLeagueSel? = nil) -> PlayerInsightCardRow? {
        guard loadedDate == SupabaseAPI.todayEST(), let name, !name.isEmpty else { return nil }
        let candidates = intelCards.filter { HubCardIdentity.sameLeague($0.league, (league ?? sel).label) }
        guard let index = HubCardIdentity.uniquePlayerIndex(name, names: candidates.map { $0.player_name ?? $0.payload?.name ?? "" }) else { return nil }
        guard candidates[index].payload != nil else { return nil }
        return candidates[index]
    }

    private var selStreakRows: [StreakRow] {
        streakRows.filter { ($0.league ?? "MLB").uppercased() == sel.label }
    }
    private var selNightRows: [NightHighlightRow] {
        nightRows.filter { ($0.league ?? "MLB").uppercased() == sel.label }
    }
    private var selYdaySignals: [Signal] { ydaySignals.filter { $0.league == sel } }

    private var availableLeagues: [HubLeagueSel] {
        let order: [HubLeagueSel] = [.mlb, .nfl, .ncaaf, .nba]
        let supported = Set(AppFlags.insightLeagues)
        let permanentDesks: Set<HubLeagueSel> = [.mlb, .nfl, .ncaaf]
        let present = order.filter { lg in
            supported.contains(lg.label) && (
                permanentDesks.contains(lg)
                || fetched.contains { $0.league == lg }
                || (todayBoard?.board ?? []).contains { ($0.league ?? "").uppercased() == lg.label }
            )
        }
        return present.isEmpty ? [.mlb] : present
    }

    @MainActor private func load() async {
        let date = SupabaseAPI.todayEST()
        if let task = loadTask, requestDate == date { await task.value; return }
        loadTask?.cancel()
        loadGeneration &+= 1
        let generation = loadGeneration
        requestDate = date
        let forceRefresh = didLoad
        resetForSlate(date)
        boardLoading = true
        intelLoading = true
        pulseLoadingLeagues = ["MLB", "NFL", "NCAAF"]
        historyLoading = true
        // The shared owner survives cancellation of an individual view/gesture.
        let task = Task { await performLoad(date: date, generation: generation, forceRefresh: forceRefresh) }
        loadTask = task
        await task.value
        guard loadGeneration == generation else { return }
        loadTask = nil
        if date != SupabaseAPI.todayEST() { await load() }
    }

    @MainActor private func resetForSlate(_ date: String) {
        guard loadedDate != date else { return }
        fetched = []; itemsIndex = [:]; connectionSnapshots = [:]
        todayBoard = nil; intelCards = []; pulseByLeague = [:]
        ydaySignals = []; streakRows = []; nightRows = []; hitRate = nil; historyDate = ""
        fetchErrorLeagues = []; boardFetchFailed = false
        intelFetchFailed = false; pulseErrorLeagues = []; historyFetchFailed = false
        selectedSignal = nil; playerRead = nil; teamCardSignal = nil; namedCard = nil; gameSheet = nil
        loadedAt = nil; didLoad = false; loadedDate = date
    }

    @MainActor private func acceptsLoad(_ date: String, generation: UInt64) -> Bool {
        !Task.isCancelled && generation == loadGeneration
            && loadedDate == date && date == SupabaseAPI.todayEST()
    }

    @MainActor private func performLoad(date: String, generation: UInt64, forceRefresh: Bool) async {
        // Primary content owns first paint. Support starts at the same time;
        // each branch publishes independently once the current slate is ready.
        let primary = Task { await loadCurrent(date: date, generation: generation) }
        async let intel: Void = loadIntel(date: date, generation: generation, forceRefresh: forceRefresh, after: primary)
        async let mlb: Void = loadPulse(date: date, league: "MLB", generation: generation, forceRefresh: forceRefresh, after: primary)
        async let nfl: Void = loadPulse(date: date, league: "NFL", generation: generation, forceRefresh: forceRefresh, after: primary)
        async let ncaaf: Void = loadPulse(date: date, league: "NCAAF", generation: generation, forceRefresh: forceRefresh, after: primary)
        async let history: Void = loadHistory(date: date, generation: generation, after: primary)
        _ = await (primary.value, intel, mlb, nfl, ncaaf, history)
    }

    @MainActor private func loadCurrent(date: String, generation: UInt64) async {
        async let boardFetch = SupabaseAPI.fetchTodayBoardResult(date: date)
        var successful: [HubLeagueSel: [Connection]] = [:]
        var failures: Set<HubLeagueSel> = []
        var cancelled: Set<HubLeagueSel> = []
        await withTaskGroup(of: (HubLeagueSel?, [Connection], Bool, Bool).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    do {
                        // Await before forming the tuple: an inline await here
                        // misassigns league keys in optimized Release builds.
                        let rows = try await SupabaseAPI.fetchInsightConnections(date: date, league: lg)
                        guard rows.allSatisfy({ $0.date == date && $0.league?.uppercased() == lg }) else {
                            return (HubLeagueSel.from(lg), [], true, false)
                        }
                        return (HubLeagueSel.from(lg), rows, false, false)
                    } catch {
                        return (HubLeagueSel.from(lg), [], true, SupabaseAPI.isCancellation(error))
                    }
                }
            }
            for await result in group {
                guard let league = result.0 else { continue }
                if result.3 { cancelled.insert(league) }
                else if result.2 { failures.insert(league) }
                else { successful[league] = result.1 }
            }
        }
        let boardResult = await boardFetch
        guard acceptsLoad(date, generation: generation) else { return }
        var resolved = fetched.filter { $0.slateDate == date }
        var changed = resolved.count != fetched.count
        for lg in AppFlags.insightLeagues {
            guard let league = HubLeagueSel.from(lg), let rows = successful[league] else { continue }
            let snapshot = PicksContentEquality.encoded(rows)
            if let snapshot, connectionSnapshots[league] == snapshot { continue }
            resolved.removeAll { $0.league == league }
            resolved.append(contentsOf: rows.compactMap { $0.toSignal() })
            connectionSnapshots[league] = snapshot
            changed = true
        }
        if changed {
            fetched = Self.dedupe(resolved)
            itemsIndex = Self.buildItemsIndex(fetched)
        }
        let errors = failures.union(fetchErrorLeagues.intersection(cancelled))
        if fetchErrorLeagues != errors { fetchErrorLeagues = errors }
        switch boardResult {
        case .success(let board):
            todayBoard = board
            boardFetchFailed = false
        case .failure(let error):
            if !SupabaseAPI.isCancellation(error) { boardFetchFailed = true }
        }
        boardLoading = false
        didLoad = true
        loadedAt = Date()
        consumeFocus()
    }

    @MainActor private func loadIntel(date: String, generation: UInt64, forceRefresh: Bool, after primary: Task<Void, Never>) async {
        let result = await SupabaseAPI.fetchPlayerIntelRowsResult(date: date, forceRefresh: forceRefresh)
        await primary.value
        guard acceptsLoad(date, generation: generation) else { return }
        if result.succeeded || !result.rows.isEmpty { intelCards = result.rows }
        if !result.cancelled { intelFetchFailed = !result.succeeded }
        intelLoading = false
    }

    @MainActor private func loadPulse(date: String, league: String, generation: UInt64, forceRefresh: Bool, after primary: Task<Void, Never>) async {
        let result = await SupabaseAPI.fetchLeaguePulseResult(date: date, league: league, forceRefresh: forceRefresh)
        await primary.value
        guard acceptsLoad(date, generation: generation) else { return }
        if result.succeeded || !result.rows.isEmpty { pulseByLeague[league] = result.rows }
        if !result.cancelled {
            if result.succeeded { pulseErrorLeagues.remove(league) }
            else { pulseErrorLeagues.insert(league) }
        }
        pulseLoadingLeagues.remove(league)
    }

    @MainActor private func loadHistory(date: String, generation: UInt64, after primary: Task<Void, Never>) async {
        let gradedDate0 = SupabaseAPI.hubGradedDateEST()
        async let rateFetch = SupabaseAPI.fetchInsightHitRateResult(date: gradedDate0)
        async let nightFetch = SupabaseAPI.fetchNightHighlightsResult(date: gradedDate0)
        async let streakFetch = SupabaseAPI.fetchStreaksResult()
        var gradedDate = gradedDate0
        var rateResult = await rateFetch
        var nightResult = await nightFetch
        // Only a verified empty publication warrants looking back another day.
        if case .success(nil) = rateResult, case .success(let rows) = nightResult,
           rows.isEmpty, let back = Self.shiftDate(gradedDate, by: -1) {
            gradedDate = back
            async let previousRate = SupabaseAPI.fetchInsightHitRateResult(date: back)
            async let previousNight = SupabaseAPI.fetchNightHighlightsResult(date: back)
            rateResult = await previousRate
            nightResult = await previousNight
        }
        let streakResult = await streakFetch
        let receiptsDate = gradedDate
        var successful: Set<HubLeagueSel> = []
        var yday: [Signal] = []
        await withTaskGroup(of: (HubLeagueSel?, [Signal]?).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    let rows = try? await SupabaseAPI.fetchInsightConnections(date: receiptsDate, league: lg)
                    return (HubLeagueSel.from(lg), rows.map { $0.compactMap { $0.toSignal() }.filter { $0.result != nil } })
                }
            }
            for await (league, rows) in group {
                if let league, let rows { successful.insert(league); yday.append(contentsOf: rows) }
            }
        }
        await primary.value
        guard acceptsLoad(date, generation: generation) else { return }
        // Retained values keep their actual publication date. A different
        // history date must never borrow values from the previous heading.
        if historyDate != receiptsDate { hitRate = nil; nightRows = []; historyDate = receiptsDate }
        if case .success(let rate) = rateResult { hitRate = rate }
        if case .success(let night) = nightResult { nightRows = night }
        if case .success(let streaks) = streakResult { streakRows = streaks }
        let retained = ydaySignals.filter { $0.slateDate == receiptsDate && !successful.contains($0.league) }
        ydaySignals = Self.dedupe(yday + retained)
        historyFetchFailed = successful.count < AppFlags.insightLeagues.count
            || Self.failedSupport(rateResult) || Self.failedSupport(nightResult) || Self.failedSupport(streakResult)
        gradedIsYesterday = gradedDate == gradedDate0
        if gradedIsYesterday { gradedDayShort = "" }
        else {
            let input = DateFormatter(); input.dateFormat = "yyyy-MM-dd"; input.timeZone = TimeZone(identifier: "America/New_York")
            let output = DateFormatter(); output.dateFormat = "EEE, MMM d"; output.timeZone = input.timeZone
            gradedDayShort = input.date(from: gradedDate).map { output.string(from: $0) } ?? ""
        }
        historyLoading = false
    }

    private static func failedSupport<Value>(_ result: Result<Value, Error>) -> Bool {
        if case .failure(let error) = result { return !SupabaseAPI.isCancellation(error) }
        return false
    }

    private func reloadIfStale() async {
        guard didLoad else { return }
        let expired = loadedAt.map { Date().timeIntervalSince($0) >= 300 } ?? true
        let emptyBoard = fetched.isEmpty && ydaySignals.isEmpty
        if loadedDate != SupabaseAPI.todayEST() || expired || !fetchErrorLeagues.isEmpty || boardFetchFailed || intelFetchFailed || !pulseErrorLeagues.isEmpty || historyFetchFailed || emptyBoard {
            await load()
        }
    }

    /// Deep-linked lane → its section anchor on the new page. A missing anchor
    /// no-ops harmlessly; the request stays pending until the page can render.
    private func consumeFocus() {
        guard focus.focusLane != nil, didLoad, !fetchErrorLeagues.contains(sel) else { return }
        guard let lane = focus.focusLane else { return }
        focus.focusLane = nil
        searchText = ""
        searchOpen = false
        searchFocused = false
        if Self.fantasyKinds.contains(lane), sel == .mlb {
            hubScope = "hub"
            pendingScrollAnchor = "fantasy"
            return
        }
        if Self.fantasyKinds.contains(lane), sel.supportsFantasy {
            hubScope = "fantasy"
            pendingScrollAnchor = "top"
            return
        }
        hubScope = "hub"
        let selection = frontPageSelection
        let front = [selection.lead].compactMap { $0 } + selection.best
        let anchor: String
        if front.contains(where: { $0.kind == lane }) {
            anchor = "lead"
        } else if lane == .regression, !items(.regression).isEmpty {
            anchor = "regression"
        } else if lane == .streak, !selStreakRows.isEmpty {
            anchor = "streaks"
        } else if lane == .nextSlate, showsNextSlateCard {
            anchor = "nextSlate"
        } else if let beat = beats.first(where: {
            $0.kinds.contains(lane) && !beatRows($0).isEmpty
        }) {
            anchor = beat.anchor
        } else if overflow.contains(where: { $0.kind == lane }) {
            anchor = "more"
        } else {
            anchor = "top"
        }
        openBeats.insert(anchor)
        pendingScrollAnchor = anchor
    }

    private static func shiftDate(_ s: String, by days: Int) -> String? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        guard let d = f.date(from: s),
              let shifted = cal.date(byAdding: .day, value: days, to: d) else { return nil }
        return f.string(from: shifted)
    }

    /// The page's rows for the selected league. Football's fail-closed proof
    /// contract runs HERE — the one funnel every football surface downstream
    /// (the lead, the board, the beats, the overflow net, the jump nav, page
    /// search) draws from, so an unverifiable receipt or market range can
    /// never appear anywhere on the Hub, in any component.
    private var isFootball: Bool { sel == .nfl || sel == .ncaaf }

    private var leagueSignals: [Signal] {
        fetched.filter { $0.league == sel && isEligibleHubSignal($0) }
    }

    private func isEligibleHubSignal(_ signal: Signal) -> Bool {
        guard signal.league == .nfl || signal.league == .ncaaf else { return true }
            switch signal.kind {
            case .afterGary:
                return FootballProofContract.isRenderableAfterGary(signal)
            case .theSweat:
                // Off the NFL Hub (founder, Sep 21 2026); college keeps it.
                guard signal.league == .ncaaf else { return false }
                return FootballProofContract.isRenderableSweat(signal, includeWatch: false)
            case .marketRange:
                // NCAAF only, and only against a confirmed slate row.
                guard signal.league == .ncaaf, let id = signal.gameId.flatMap(Int.init) else { return false }
                return FootballProofContract.isRenderableMarketRange(
                    signal, slateRow: (todayBoard?.board ?? []).first(where: {
                        $0.bdl_game_id == id && HubCardIdentity.sameLeague($0.league, signal.league.label)
                    })
                )
            default:
                return true
            }
    }

    /// Every edge the Hub carries for one slate game (league + provider id,
    /// then names only when an id is absent). Look-ahead regression rows are excluded — their
    /// `game` names TOMORROW's matchup, which collides on series nights.
    private func edgesFor(_ r: TomorrowBoardRow) -> [Signal] {
        let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")"
        let abbr = "\(r.away_abbr ?? "") @ \(r.home_abbr ?? "")".uppercased()
        return leagueSignals.filter { s in
            guard HubCardIdentity.sameLeague(r.league, s.league.label),
                  s.confirmedXI == nil, s.reg?.day != "tomorrow" else { return false }
            // College board abbreviations may be null. The same provider id
            // also keeps separate games of a doubleheader from sharing edges.
            if let gameId = s.gameId, !gameId.isEmpty, let boardId = r.bdl_game_id {
                return gameId == String(boardId)
            }
            return s.game.uppercased() == abbr || abbrGameMatches(s.game, matchup: full)
        }
    }

    /// Slate position + first-pitch label for a signal's game string — the
    /// Matchups storyboard orders its blocks by real first pitch. Abbr-exact
    /// first, then the same name-keyword fallback the game sheet uses.
    private func slateIndexFor(_ game: String) -> (index: Int, time: String?)? {
        for (i, r) in slateRows.enumerated() {
            let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")"
            let abbr = "\(r.away_abbr ?? "") @ \(r.home_abbr ?? "")".uppercased()
            if game.uppercased() == abbr || abbrGameMatches(game, matchup: full) {
                let t = TomorrowView.etTime(r.commence_time, withZone: true, meridiem: true)
                return (i, t == "—" ? nil : t)
            }
        }
        return nil
    }

    /// Team/player streak context for either side. The stored next-game label
    /// may refer to a later matchup; it does not identify this slate game.
    private func streaksFor(_ r: TomorrowBoardRow) -> [StreakRow] {
        let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")".lowercased()
        guard full.count > 3 else { return [] }
        return selStreakRows.filter { st in
            guard st.next_game != nil else { return false }
            let team = (st.team ?? st.subject ?? "").lowercased()
            guard let nick = team.split(separator: " ").last.map(String.init), nick.count > 2 else { return false }
            return full.contains(nick)
        }
    }

    // ---- the front page ranking ----

    private static let fantasyKinds: Set<SignalKind> = [
        .fantasyPickups, .twoStart, .closerWatch, .returnWatch, .cutList,
        .fantasyUsage, .fantasyRedZone, .fantasyMatchup, .fantasyTrend,
    ]

    /// These are complete product modules, not editorial stories. Keeping them
    /// out of The Lead / Best of the Board prevents the same receipt from
    /// appearing once as a hero and again in its purpose-built section.
    /// Rows that own a module of their own and must never be told as a story.
    /// `.nextSlate` is the dark-day schedule card — it would otherwise headline
    /// an empty NCAAF Tuesday as if a schedule were an insight.
    private static let moduleKinds: Set<SignalKind> = [.theSweat, .afterGary, .nextSlate, .practiceReport]

    /// The dark-day schedule card stands in for the slate strip on a football
    /// day with no games — and takes the morning notice's place while it shows.
    private var showsNextSlateCard: Bool {
        slateRows.isEmpty && leagueSignals.contains { $0.kind == .nextSlate }
    }

    /// Original observations retain their server relevance order and dated eligibility.
    private var ranked: [Signal] {
        let currentDate = SupabaseAPI.todayEST()
        return leagueSignals.filter { s in
            s.confirmedXI == nil && !Self.fantasyKinds.contains(s.kind)
                && !Self.moduleKinds.contains(s.kind) && s.kind != .regression
                && s.reg == nil && !(sel == .mlb && s.kind == .h2h)
                && s.slateDate == currentDate
        }
    }
    /// Resolve the lead and remainder from one ranked snapshot. The previous
    /// `bestOfBoard` filter called `lead` inside its closure, which rebuilt
    /// `ranked` while an earlier ranked array was still on the SwiftUI render
    /// stack. Besides doing the work once per row, that nested large Signal
    /// copies deeply enough to exhaust the production iPhone thread stack.
    private var frontPageSelection: (lead: Signal?, best: [Signal]) {
        let rows = ranked
        let selection = HubFrontPageSelection.select(
            stories: rows.enumerated().map { index, signal in
                .init(index: index, kind: String(describing: signal.kind), gameID: signal.gameId)
            }, games: frontPageGames, now: frontPageNow)
        return (selection.lead.map { rows[$0] }, selection.supporting.map { rows[$0] })
    }

    private var frontPageGames: [HubFrontPageSelection.Game] {
        slateRows.compactMap { row in
            guard let id = row.bdl_game_id else { return nil }
            let live = liveScores.status(forGameId: id, league: row.league)
            return .init(id: String(id), startsAt: row.hasConfirmedKickoff ? row.commence_time : nil,
                         status: live?.status ?? row.game_status)
        }
    }

    /// Exact provider identity keeps game two's time separate from game one's
    /// final score. Missing status remains a scheduled-time label, never LIVE.
    private func storyContext(_ signal: Signal) -> String {
        guard let id = signal.gameId.flatMap(Int.init),
              let row = slateRows.first(where: { $0.bdl_game_id == id }) else { return signal.game.uppercased() }
        let score = liveScores.status(forGameId: id, league: signal.league.label)
        let status = score?.status ?? row.game_status
        let label: String
        switch status?.lowercased() {
        case "final": label = "FINAL"
        case "live": label = score?.detail?.uppercased() ?? "LIVE"
        case "postponed", "cancelled", "canceled", "suspended", "delayed":
            label = score?.interruptionLabel ?? row.interruptionLabel ?? status?.uppercased() ?? "STATUS UNAVAILABLE"
        default:
            label = row.kickoffTimeLabel ?? TomorrowView.etTime(row.commence_time, withZone: true, meridiem: true)
        }
        return [signal.game.uppercased(), label == "—" ? "" : label].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Tonight's slate for the selected league, from the 5am board snapshot.
    private var slateRows: [TomorrowBoardRow] {
        (todayBoard?.board ?? []).filter { ($0.league ?? "").uppercased() == sel.label }
    }

    // ---- the beats (the long tail, in human sections) ----

    private struct Beat: Identifiable {
        let anchor: String
        let title: String
        let kinds: [SignalKind]
        var id: String { anchor }
    }

    private var beats: [Beat] {
        if sel == .nba {
            return [
                Beat(anchor: "series", title: "Season series", kinds: [.batterVsArm, .h2h]),
                Beat(anchor: "schedule", title: "Rest & schedule", kinds: [.situational]),
                Beat(anchor: "availability", title: "Availability", kinds: [.injury]),
                Beat(anchor: "form", title: "Team form", kinds: [.streak, .teamRecord, .hot, .cold]),
            ]
        }
        if sel == .wc {
            return [
                Beat(anchor: "cup", title: "The Cup", kinds: [.tournament, .advancement]),
                Beat(anchor: "numbers", title: "The Numbers", kinds: [.xgRegression, .xgRecap]),
                Beat(anchor: "matchups", title: "The Matchups", kinds: [.h2h, .situational, .ballpark, .streak]),
            ]
        }
        // Football speaks MLB's beat grammar (founder, Aug 21): the same
        // sections, the same renderers, football's lanes. THE MISMATCH leads —
        // it is football's marquee board, the way the Regression Board leads
        // MLB's long tail. Every football kind is named in exactly one beat so
        // nothing falls through to the More Edges net unnamed.
        if sel == .nfl {
            return [
                Beat(anchor: "mismatch", title: "The Mismatch", kinds: [.mismatch]),
                Beat(anchor: "trenches", title: "The Trenches", kinds: [.trenches, .passRush]),
                Beat(anchor: "field", title: "The Field", kinds: [.quarterback, .injury]),
                Beat(anchor: "edges", title: "The Edges", kinds: [.coverage, .paceScript, .redZone, .turnoverEdge, .explosivePlay, .coaching]),
                Beat(anchor: "form", title: "The Form", kinds: [.situational, .streak, .teamRecord, .h2h]),
            ]
        }
        if sel == .ncaaf {
            return [
                Beat(anchor: "mismatch", title: "The Mismatch", kinds: [.mismatch]),
                Beat(anchor: "trenches", title: "The Trenches", kinds: [.trenches, .passRush]),
                Beat(anchor: "field", title: "The Field", kinds: [.quarterback, .injury]),
                Beat(anchor: "edges", title: "The Edges", kinds: [.coverage, .paceScript, .specialTeams, .redZone, .turnoverEdge, .explosivePlay, .coaching, .marketRange]),
                Beat(anchor: "form", title: "The Form", kinds: [.situational, .streak, .teamRecord, .h2h]),
            ]
        }
        // (After Gary left the football beats Sep 21 2026 — the receipt lives
        // on the pick page's THE LINE row; the Hub tile meant nothing to a fan.)
        // HOME RUN THREATS gets its own stage back (founder green-light
        // Jul 22; debut gated to Jul 23 so the first run is a fresh slate —
        // self-activates at the 6 AM ET rollover). Until then HR reads keep
        // riding The Bats exactly as before.
        // The Matchups storyboard retired for MLB (founder, Aug 6: "we only
        // need the head to head") — H2H and the NRFI watch stand alone in the
        // founder-picked shapes (mocks H6 + N10). The storyboard's other
        // kinds (injury swaps, running game, park weather) fall through to
        // the More Edges overflow net, so nothing vanishes.
        // STORE-SAFE BRIDGE: NRFI is a bet market (No Run First Inning) —
        // the lane drops in bridge; everything else stands.
        let beats: [Beat]
        if Self.hrThreatsLive {
            beats = [
                Beat(anchor: "hr", title: "Home Run Threats", kinds: [.hrThreat]),
                Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .batterVsArm]),
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm]),
                Beat(anchor: "bullpens", title: "Bullpens", kinds: [.bullpenFatigue]),
                Beat(anchor: "teams", title: "Team form", kinds: [.teamRecord, .situational, .streak]),
                Beat(anchor: "parks", title: "Parks & conditions", kinds: [.ballpark]),
                Beat(anchor: "nrfi", title: "The NRFI Watch", kinds: [.firstInning]),
            ]
        } else {
            beats = [
                Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .hrThreat, .batterVsArm]),
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm]),
                Beat(anchor: "bullpens", title: "Bullpens", kinds: [.bullpenFatigue]),
                Beat(anchor: "teams", title: "Team form", kinds: [.teamRecord, .situational, .streak]),
                Beat(anchor: "parks", title: "Parks & conditions", kinds: [.ballpark]),
                Beat(anchor: "nrfi", title: "The NRFI Watch", kinds: [.firstInning]),
            ]
        }
        return AppFlags.storeSafe ? beats.filter { $0.anchor != "nrfi" } : beats
    }
    /// Founder, Jul 22: "green light it but don't run it tonight — first run
    /// tomorrow." String compare works on ISO dates.
    static var hrThreatsLive: Bool { SupabaseAPI.todayEST() >= "2026-07-23" }

    /// Rows for a beat, in the feed's relevance order (each row keeps its own
    /// lane kicker). Regression rows live on the board, never in a beat.
    private func beatRows(_ beat: Beat) -> [Signal] {
        let kinds = Set(beat.kinds)
        return leagueSignals.filter {
            kinds.contains($0.kind)
                && $0.confirmedXI == nil
                && $0.reg == nil
        }
    }

    /// MLB Fantasy stays in the Hub; NFL retains its separate weekly desk.
    @AppStorage("hubScope") private var hubScope = "hub"

    /// A saved Fantasy scope applies only to supported desks. Other sports
    /// retain their main Hub, search, section index and slate clock.
    private var showsFantasy: Bool { hubScope == "fantasy" && sel.supportsFantasy }

    // (hubScopeToggle folded onto the masthead line Aug 6 night — THE HUB /
    // FANTASY ride beside the league words as gold-text tabs, no underline.)

    /// Everything not already on the page — a safety net so a future backend
    /// lane always renders somewhere instead of vanishing.
    private var overflow: [Signal] {
        // .h2h is EXCLUDED from the Hub, not merely placed (founder, Aug 6:
        // "the H2H parts here doesnt need to be on The Hub") — the team season
        // series lives on the Picks page game view, where the ledger renders.
        // Without this it would fall through to More Edges and reappear.
        var placed: Set<SignalKind> = Self.fantasyKinds.union([.regression, .h2h, .theSweat, .nextSlate, .practiceReport])
        for b in beats { for k in b.kinds { placed.insert(k) } }
        return leagueSignals.filter { !placed.contains($0.kind) && $0.confirmedXI == nil }
    }

    // ---- the beats, one block each (extracted from body — the inline
    // if/else chain plus its closures blew the type-checker's budget) ----

    /// Matchups masthead tap → the slate game sheet for that game string.
    private func openGameSheet(for game: String) {
        if let hit = slateIndexFor(game), slateRows.indices.contains(hit.index) {
            gameSheet = HubGameSel(row: slateRows[hit.index])
        }
    }

    // ---- extracted body chunks (the inline runs plus their closures blew
    // the type-checker's budget) ----

    @ViewBuilder private var searchResultsView: some View {
        HubSearchResults(
            query: searchText,
            edges: leagueSignals,
            receipts: selYdaySignals.filter(isEligibleHubSignal),
            streaks: selStreakRows,
            night: selNightRows,
            league: sel,
            nightLabel: nightLabel,
            onEdge: { s in openSignal(s) },
            cardFor: { intelCard(for: $0) },
            onPlayer: { namedCard = $0 },
            onTeamRow: { openTeamCard(for: $0) },
            onTeamName: { openTeamCard(named: $0) }
        )
    }

    // ---- the front page's editorial boards (extracted from body — the
    // inline run plus its closures blew the type-checker's budget) ----

    @ViewBuilder private var frontPageBoards: some View {
        let selection = frontPageSelection
        if let lead = selection.lead {
            HubResearchDashboard(lead: lead, pages: quickResearchPages(excluding: lead),
                contextFor: storyContext, kickerFor: kickerText, destinationFor: researchDestination,
                onSignal: { openSignal($0) }, onCategory: { jumpToResearch($0) },
                onChart: { researchChartSignal = $0 }, aside: moversAside)
            .id("lead")
        } else if let aside = moversAside {
            // No lead today: the slim strip stands on its own, off to the right.
            HStack { Spacer(); aside }
                .padding(.horizontal, GaryLayout.gutter)
                .id("movers")
        }
    }

    /// Line movement (founder, Sep 9 2026): a slim strip to the right of the
    /// lead card — game and move, nothing else, and a door to the full board.
    /// Store-safe builds omit it, as they do the line-move wire.
    private var moversAside: AnyView? {
        guard !AppFlags.storeSafe, let sportKey = LineSport.key(forLeague: sel.label) else { return nil }
        return AnyView(HubLineMoversAside(league: sel.label, sportKey: sportKey) { story in
            ladderSel = LineLadderSel(story: story, sportKey: sportKey)
        }.id(sportKey))
    }

    private func jumpToResearch(_ anchor: String) {
        if researchModules.contains(where: { $0.id == anchor }) { openBeats.insert(anchor) }
        // Opening a module regroups the rows; let that layout settle before
        // the page scrolls so the target card exists at its new position.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { pendingScrollAnchor = anchor }
    }

    private func quickResearchPages(excluding lead: Signal) -> [HubQuickResearchPage] {
        let rows = ranked.filter { $0.id != lead.id }
        let games = frontPageGames
        // MLB's four quick pages are the model for every sport (founder,
        // Sep 21 2026): the chunk under the lead is the most relevant reads
        // from a few lanes at MLB's size, not one page per beat.
        let lanes: [(String, String, Set<SignalKind>)]
        switch sel {
        case .mlb:
            lanes = [("bats", "Hitters", [.hot, .cold, .platoon, .batterVsArm, .hrThreat]),
                     ("arms", "Starters", [.starterForm]),
                     ("bullpens", "Bullpens", [.bullpenFatigue]),
                     ("teams", "Teams", [.teamRecord, .streak, .situational])]
        case .nfl, .ncaaf:
            lanes = [("mismatch", "Mismatch", [.mismatch, .trenches, .passRush]),
                     ("field", "Field", [.quarterback, .injury]),
                     ("edges", "Edges", [.coverage, .paceScript, .redZone, .turnoverEdge, .explosivePlay, .specialTeams, .coaching]),
                     ("form", "Form", [.situational, .streak, .teamRecord, .h2h])]
        default:
            lanes = beats.map { ($0.anchor, $0.title.replacingOccurrences(of: "The ", with: ""), Set($0.kinds)) }
        }
        return lanes.compactMap { anchor, title, kinds in
            let pool = rows.filter { kinds.contains($0.kind) }
            let selected = HubFrontPageSelection.select(stories: pool.enumerated().map {
                .init(index: $0.offset, kind: String(describing: $0.element.kind), gameID: $0.element.gameId)
            }, games: games, now: frontPageNow, supportingLimit: 2)
            let chosen = ([selected.lead].compactMap { $0 } + selected.supporting).map { pool[$0] }
            return chosen.isEmpty ? nil : HubQuickResearchPage(id: anchor, title: title, rows: chosen)
        }
    }

    /// One index powers both the visible modules and navigation. Featured
    /// observations remain in their research category so a shortcut opens the
    /// complete set, including the finding that brought the reader there.
    private var researchModules: [HubResearchModule] {
        let signals = leagueSignals
        var modules: [HubResearchModule] = []
        if !selStreakRows.isEmpty {
            let first = selStreakRows.max { ($0.length ?? 0) < ($1.length ?? 0) }
            let preview = first.flatMap { row -> String? in
                guard let detail = row.detail, !detail.isEmpty else { return nil }
                return [row.subject, detail].compactMap { $0 }.joined(separator: ": ")
            } ?? "Team and player streaks"
            modules.append(.init(id: "streaks", title: "Streak watch", count: selStreakRows.count, preview: preview))
        }
        if [.mlb, .nfl, .ncaaf].contains(sel), !pulseRows.isEmpty {
            modules.append(.init(id: "pulse", title: "League Pulse", count: nil,
                preview: sel == .mlb ? "Starting pitchers · hot & cold bats · bullpens" : "The board · form · league tables"))
        }
        let currentBeats = beats
        let beatOrder = sel == .mlb ? ["bats", "arms", "bullpens", "teams", "hr", "parks", "nrfi"] : currentBeats.map(\.anchor)
        for anchor in beatOrder {
            guard let beat = currentBeats.first(where: { $0.anchor == anchor }) else { continue }
            let rows = signals.filter { beat.kinds.contains($0.kind) && $0.confirmedXI == nil && $0.reg == nil }
            guard let first = rows.first else { continue }
            modules.append(.init(id: anchor, title: anchor == "nrfi" ? "First inning" : beat.title,
                count: rows.count, preview: first.headline, signals: rows))
        }
        let regression = signals.filter { $0.kind == .regression }
        if let first = regression.first {
            modules.append(.init(id: "regression", title: "Regression watch", count: regression.count,
                preview: first.headline, signals: regression))
        }
        if sel == .wc {
            let rows = signals.filter { $0.kind == .xgRegression }
            if let first = rows.first {
                modules.append(.init(id: "xgboard", title: "The xG Board", count: rows.count, preview: first.headline, signals: rows))
            }
        }
        if sel == .mlb {
            modules.append(.init(id: "fantasy", title: "Fantasy watch", count: nil,
                preview: "Roster decisions · playing time · roles"))
        }
        if !selNightRows.isEmpty {
            modules.append(.init(id: "lastNight", title: nightLabel, count: selNightRows.count,
                preview: "Recent performances around the league"))
        }
        var placed = Self.fantasyKinds.union([.regression, .h2h, .theSweat, .nextSlate, .practiceReport])
        for beat in currentBeats { placed.formUnion(beat.kinds) }
        let extras = signals.filter { !placed.contains($0.kind) && $0.confirmedXI == nil }
        if let first = extras.first {
            modules.append(.init(id: "more", title: "More research", count: extras.count, preview: first.headline, signals: extras))
        }
        // Every tile explains what its section is and why it's useful, and
        // fills the tile, instead of quoting one sample headline (founder,
        // Sep 21 2026: "a lot of these containers are not fully filled in").
        return modules.map { module in
            var m = module
            m.blurb = HubResearchModule.blurb(for: module.id, mlb: sel == .mlb)
            return m
        }
    }

    private var researchColumns: Int { dynamicTypeSize >= .xxLarge ? 1 : 2 }
    private func researchScrollTarget(for anchor: String) -> String {
        guard researchModules.contains(where: { $0.id == anchor }) else { return anchor }
        return openBeats.contains(anchor) ? "research-content-\(anchor)" : "research-tiles"
    }

    private var researchWorkspace: some View {
        let modules = researchModules
        let expanded: [HubResearchModule] = modules.filter { openBeats.contains($0.id) }
        return VStack(alignment: .leading, spacing: 10) {
            HubEqualTileLayout(columns: researchColumns) {
                ForEach(modules) { module in
                    HubResearchModuleCard(module: module, open: openBeatsBinding,
                                          content: { EmptyView() }, tileOnly: true,
                                          onExpand: { jumpToResearch(module.id) })
                }
            }
            .id("research-tiles")
            // Expanded research is outside the uniform tile grid, so opening
            // a long report never changes another tile's width or height.
            ForEach(expanded) { module in
                VStack(alignment: .leading, spacing: 8) {
                    researchModuleHeader(module)
                    researchModuleContent(module).padding(.bottom, 8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
                .id("research-content-\(module.id)")
            }
        }
        .padding(.horizontal, GaryLayout.gutter)
    }

    private func researchModuleHeader(_ module: HubResearchModule) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { _ = openBeats.remove(module.id) }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(module.title).hubTitleFont(19, .semibold)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.up").font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(GaryColors.gold)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Collapse \(module.title)")
        .padding(.horizontal, 18).padding(.top, 8)
    }

    private func researchModuleContent(_ module: HubResearchModule) -> AnyView {
        switch module.id {
        case "streaks":
            return AnyView(HubStreakWatch(rows: selStreakRows, onTeam: { openTeamCard(for: $0) },
                cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 }))
        case "pulse":
            return AnyView(HubLeaguePulse(rows: pulseRows, selectedTab: $pulseTab,
                cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 }, onTeam: { openTeamCard(named: $0) }))
        case "fantasy":
            return AnyView(FantasyBriefingPage(league: "MLB", refreshToken: fantasyRefreshToken,
                isVisible: isVisible, compact: true, embeddedInHub: true, openPlayer: openFantasyPlayer))
        case "lastNight":
            return AnyView(HubNightBoard(rows: selNightRows, cardFor: { intelCard(for: $0) },
                onPlayer: { namedCard = $0 }, onTeam: { openTeamCard(named: $0) }))
        case "regression":
            return AnyView(HubRegressionBoard(signals: module.signals, todayEST: SupabaseAPI.todayEST()) { openSignal($0) })
        case "nrfi":
            return AnyView(HubNrfiSection(rows: module.signals, showsHeader: false) { openSignal($0) })
        case "afterGary":
            return AnyView(HubAfterGarySection(anchor: module.id, rows: module.signals,
                openBeats: openBeatsBinding, onRow: { openSignal($0) }))
        case "matchups":
            // Football keeps its game-grouped storyboard inside the module.
            return AnyView(HubMatchupsSection(rows: module.signals, slateIndexFor: { slateIndexFor($0) },
                openBeats: openBeatsBinding, kickerFor: kickerText, onRow: { openSignal($0) },
                onProfile: { openSignal($0) }, onGame: { openGameSheet(for: $0) }))
        default:
            return AnyView(VStack(alignment: .leading, spacing: 0) {
                if module.id == "bullpens", let signal = module.signals.first(where: { $0.researchLedger != nil }) {
                    Button { researchChartSignal = signal } label: {
                        Label("Compare recent workload", systemImage: "chart.bar.xaxis")
                            .hubBodyFont(14, .medium).foregroundStyle(GaryColors.gold)
                            .frame(minHeight: 44).padding(.horizontal, 18)
                    }.buttonStyle(.plain)
                }
                HubBeatList(rows: module.signals, open: true, kickerFor: kickerText,
                    onRow: { openSignal($0) }, onProfile: { openSignal($0) })
            })
        }
    }

    private var researchNavigation: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                ForEach(researchModules) { module in
                    Button { jumpToResearch(module.id) } label: {
                        Text(module.title.replacingOccurrences(of: "The ", with: ""))
                            .hubDataFont(14, .medium)
                            .foregroundStyle(openBeats.contains(module.id) ? GaryColors.gold : GaryColors.sectionSub)
                            .frame(minHeight: 36)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Open \(module.title)")
                }
            }
            .padding(.horizontal, GaryLayout.gutter)
        }
        .accessibilityLabel("Browse research categories")
    }

    private func openFantasyPlayer(_ decision: FantasyDecision) -> Bool {
        let matches = intelCards.filter {
            decision.matchesPlayerCard(playerID: $0.player_id, gameID: $0.game_id, loadedDate: loadedDate)
                && $0.payload != nil && HubCardIdentity.sameLeague($0.league, sel.label)
        }
        guard matches.count == 1 else { return false }
        namedCard = matches[0]
        return true
    }

    // THE REFERENCE SHELF — folded by default (founder, Jul 30/Aug 3): league
    // tables and graded boards are look-ups, not the page's story. One tap
    // opens each. Every name in them routes by the law (Aug 4): player names
    // → player card when the day has one, team names → the team card.
    private var supportStatus: String? {
        var pending: [String] = []
        if intelLoading { pending.append("Player details") }
        if pulseLoadingLeagues.contains(sel.label) { pending.append("league tables") }
        if historyLoading { pending.append("recent history") }
        if !pending.isEmpty { return "Still loading: " + pending.joined(separator: ", ") + "." }
        var unavailable: [String] = []
        if intelFetchFailed { unavailable.append("Player details") }
        if pulseErrorLeagues.contains(sel.label) { unavailable.append("league tables") }
        if historyFetchFailed { unavailable.append("recent history") }
        return unavailable.isEmpty ? nil : "Couldn't refresh: " + unavailable.joined(separator: ", ") + ". Pull down to retry."
    }

    // Keep the top-level stack's concrete type deliberately shallow. Build 6
    // produced two TestFlight crashes in Swift's runtime demangler while it
    // instantiated the nested _ConditionalContent type generated here. The
    // state/scope branches below are erased independently so Release builds do
    // not have to materialize that pathological generic type at launch.
    private var hubPageStack: some View {
        VStack(alignment: .leading, spacing: 8) {
            HubMasthead(
                sel: $sel,
                leagues: availableLeagues,
                gameCount: slateRows.count,
                searchOpen: $searchOpen,
                searchText: $searchText,
                searchFocused: $searchFocused
            )
            .id("top")
            .background(GeometryReader { position in
                Color.clear
                    .onAppear { mastheadOffscreen = position.frame(in: .named("hubScroll")).maxY < 0 }
                    .onChange(of: position.frame(in: .named("hubScroll")).maxY) { bottom in
                        let offscreen = bottom < 0
                        if mastheadOffscreen != offscreen { mastheadOffscreen = offscreen }
                    }
            })

            hubScopeContent
        }
    }

    private var hubScopeContent: AnyView {
        if showsFantasy {
            return AnyView(VStack(alignment: .leading, spacing: 26) {
                FantasyBriefingPage(league: sel.label, refreshToken: fantasyRefreshToken, isVisible: isVisible,
                                    openPlayer: openFantasyPlayer).id(sel.label)
            }.environment(\.solidPanels, true))
        }
        return AnyView(hubEditorialContent)
    }

    private var hubEditorialContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            // ── ALL-STAR WEEK — one-off break surface (Jul 13-14 2026 only;
            // the date gate self-retires it). Founder call Jul 13: the break
            // is an acquisition window — "its not an all-star break for Gary".
            // MLB tab only (founder): All-Star is MLB — never mixed into WC.
            if sel == .mlb, ["2026-07-13", "2026-07-14"].contains(SupabaseAPI.todayEST()) {
                HubAllStarCard()
            }

            hubEditorialStateContent
        }
    }

    private var hubEditorialStateContent: AnyView {
        if !didLoad {
            return AnyView(hubLoading)
        }
        if searchOpen && !searchText.isEmpty {
            return AnyView(searchResultsView)
        }
        // Each sport shares the briefing hierarchy while its own proof gates,
        // categories and next-slate context determine the content.
        return AnyView(hubLoadedContent)
    }

    private var hubLoadedContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            // The schedule strip and the research categories are one header
            // block (founder, Sep 9: no dead space between them, and no dead
            // space under the categories before the boards).
            VStack(alignment: .leading, spacing: 2) {
                if !slateRows.isEmpty {
                    HubSlateStrip(rows: slateRows) { r in
                        gameSheet = HubGameSel(row: r)
                    }
                }
                researchNavigation
            }
            if boardFetchFailed {
                Text(slateRows.isEmpty ? "Game schedule couldn't load. Pull down to retry."
                                      : "Showing the last available schedule. Pull down to retry.")
                    .hubBodyFont(13)
                    .foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 18)
            }

            if fetchErrorLeagues.contains(sel) {
                if leagueSignals.isEmpty { hubError }
                else { hubRefreshNotice }
            }

            // Football dark day (NFL + NCAAF since Aug 24): no slate to strip,
            // so the verified next kickoff takes the strip's place rather than
            // leaving the page headless.
            if showsNextSlateCard, let next = leagueSignals.first(where: { $0.kind == .nextSlate }) {
                FootballNextSlatePreview(signal: next, accent: GaryColors.gold)
                    .id("nextSlate")
            }

            frontPageBoards
            if frontPageSelection.lead == nil, items(.regression).isEmpty,
               !showsNextSlateCard, selStreakRows.isEmpty, !fetchErrorLeagues.contains(sel) {
                hubMorningNotice
            }

            researchWorkspace
            if let supportStatus {
                Text(supportStatus).hubBodyFont(13).foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true).padding(.horizontal, GaryLayout.gutter)
            }
        }
        .environment(\.solidPanels, true)
    }

    // ---- body ----

    var body: some View {
        GeometryReader { geo in
        ScrollViewReader { proxy in
        ScrollView(showsIndicators: false) {
            hubPageStack
            .accessibilityHidden(selectedSignal != nil || gameSheet != nil)
            .padding(.top, 8)
            .padding(.bottom, 120)
            // WIDTH PINNED to the viewport (founder bug, Aug 4: you could grab
            // the whole Hub and drag it sideways, then it rubber-banded back).
            // A vertical ScrollView pans horizontally the moment ANY child's
            // minimum width exceeds the screen — one non-compressible row
            // (fixedSize label, agate table cell) silently widens the page.
            // Pinning the content stack to geo width closes that door for
            // every current and future section; an over-wide child now yields
            // internally instead of dragging the page with it.
            .frame(width: geo.size.width, alignment: .topLeading)
            .frame(minHeight: geo.size.height, alignment: .top)
            .task {
                if !didLoad { await load() }
                if sel == .mlb, hubScope == "fantasy" {
                    hubScope = "hub"
                    pendingScrollAnchor = "fantasy"
                }
            }
        }
        // Keep scrolled stories below the status bar while the backdrop fills
        // the safe area. The page itself remains a vertical viewport.
        .clipped()
        .background {
            LiquidGlassBackground(grainDensity: 0)
                .allowsHitTesting(false).accessibilityHidden(true)
        }
        .coordinateSpace(name: "hubScroll")
        .sheet(item: $researchChartSignal) { signal in
            HubBullpenChartSheet(signal: signal) {
                researchChartSignal = nil
            } onResearch: {
                researchChartSignal = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { openSignal(signal) }
            }
        }
        .sheet(item: $ladderSel) { sel in
            LineLadderLoader(sel: sel)
        }
        .overlay(alignment: .bottomTrailing) {
            if !searchOpen, didLoad, !jumpItems.isEmpty, !showsFantasy, mastheadOffscreen,
               selectedSignal == nil, gameSheet == nil {
                HubSectionNav(items: jumpItems, open: $sectionNavOpen, availableHeight: geo.size.height - 190) { anchor in
                    jumpToResearch(anchor)
                }
                .padding(.trailing, 14)
                .padding(.bottom, 108)   // clears the floating tab bar
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { now in
            guard isVisible, scenePhase == .active, !showsFantasy else { return }
            frontPageNow = now
            if didLoad, loadedDate != SupabaseAPI.todayEST() || loadedAt.map({ now.timeIntervalSince($0) >= 300 }) != false {
                Task { await load() }
            }
        }
        .refreshable {
            fantasyRefreshToken = UUID()
            if showsFantasy { return }
            await load()
        }
        .onChange(of: isVisible) { vis in
            guard vis else { return }
            frontPageNow = Date()
            consumeFocus()
            fantasyRefreshToken = UUID()
            Task { await reloadIfStale() }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active, isVisible else { return }
            frontPageNow = Date()
            fantasyRefreshToken = UUID()
            Task { await reloadIfStale() }
        }
        .onGaryTour { verb, arg in
            // "hubgame 1" — open the game sheet for slate index 1 (sim QA:
            // the tour harness can't tap, so the sheet gets its own verb).
            if verb == "hubnav" {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { sectionNavOpen.toggle() }
                return
            }
            if verb == "hubgame" {
                if let i = Int(arg), slateRows.indices.contains(i) {
                    gameSheet = HubGameSel(row: slateRows[i])
                }
                return
            }
            // "hubscope fantasy|hub" — flip the header toggle (sim QA).
            if verb == "hubscope" {
                if arg.lowercased() == "fantasy", sel == .mlb {
                    hubScope = "hub"
                    pendingScrollAnchor = "fantasy"
                } else { hubScope = arg.lowercased() == "fantasy" ? "fantasy" : "hub" }
                return
            }
            // "hubtap <lane> <i>" — run the EXACT tap router a row's button
            // calls (openSignal), so sim QA verifies the real routing law:
            // player-backed → player card, team-backed → team card.
            if verb == "hubtap" {
                let parts = arg.split(separator: " ")
                let lane = parts.first.map(String.init)?.lowercased() ?? ""
                let idx = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
                let pool: [Signal]
                switch lane {
                case "fantasy": pool = items(.fantasyPickups)
                case "cut": pool = items(.cutList)
                case "twostart": pool = items(.twoStart)
                case "closer": pool = items(.closerWatch)
                case "return": pool = items(.returnWatch)
                case "h2h": pool = items(.h2h)
                default: pool = leagueSignals
                }
                if pool.indices.contains(idx) { openSignal(pool[idx]) }
                return
            }
            // "hubchart" — present the bullpen workload chart for the first
            // observation that carries a dated ledger (sim QA cannot tap).
            if verb == "hubchart" {
                researchChartSignal = leagueSignals.first { $0.researchLedger != nil }
                return
            }
            // "hubclose <module>" — collapse one research module (sim QA).
            if verb == "hubclose" {
                openBeats.remove(arg)
                return
            }
            guard verb == "hub" else { return }
            switch arg.lowercased() {
            case "mlb": withAnimation { sel = .mlb }
            case "nfl": withAnimation { sel = .nfl }
            case "ncaaf": withAnimation { sel = .ncaaf }
            case "nba": withAnimation { sel = .nba }
            case "wc": withAnimation { sel = .wc }
            // Any other arg = a section anchor ("hub fantasy", "hub lastNight")
            // — the tour harness can't drive the pop-out nav.
            default:
                openBeats.insert(arg)
                pendingScrollAnchor = arg
            }
        }
        .overlay {
            if let s = selectedSignal {
                HubEdgeOverlay(signal: s,
                               supportingNotice: s.playerId == nil ? nil : intelLoading
                                   ? "Player details are still loading. This is Gary’s full original read."
                                   : intelFetchFailed ? "Player details couldn't refresh. This is Gary’s full original read." : nil,
                               onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { selectedSignal = nil } },
                               onViewGame: { g in
                                   selectedSignal = nil
                                   onSelectGame(g, s.league.label, s.gameId.flatMap(Int.init))
                               })
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: selectedSignal?.id)
        .onChange(of: isVisible && (selectedSignal != nil || gameSheet != nil)) { blocked in
            GaryPushNavigation.shared.setModalBlocked(blocked, owner: "hub-read")
        }
        .onDisappear { GaryPushNavigation.shared.setModalBlocked(false, owner: "hub-read") }
        .sheet(item: $playerRead) { PlayerInsightSheet(signal: $0.signal, prefetched: $0.card) }
        .sheet(item: $teamCardSignal) { s in
            HubTeamCardSheet(
                signal: s,
                related: relatedTeamSignals(for: s),
                tonight: slateRowForTeamSignal(s),
                board: todayBoard,
                streaks: selStreakRows,
                intel: loadedDate == SupabaseAPI.todayEST() ? intelCards.filter {
                    HubCardIdentity.sameLeague($0.league, s.league.label) && $0.payload != nil
                } : [],
                cardFor: { intelCard(for: $0, league: s.league) },
                onPlayer: { row in
                    // Card-to-card handoff: close the team card, then the
                    // player card (two sheets can't stack from one anchor).
                    teamCardSignal = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { namedCard = row }
                },
                onSignal: { next in
                    teamCardSignal = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { openSignal(next) }
                }
            )
        }
        // Tap-a-name → the same breakdown card, prefetched by name.
        .sheet(item: $namedCard) { PlayerInsightSheet(signal: nil, prefetched: $0) }
        // Centered pop-up, not a pull-up (founder, Jul 6: no bottom sheets
        // on the game widget) — dim + scale, tap outside to close.
        .overlay {
            if let sel = gameSheet {
                ZStack {
                    Color.black.opacity(0.55).ignoresSafeArea()
                        .onTapGesture { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } }
                        .accessibilityHidden(true)
                    HubGameSheet(row: sel.row,
                                 edges: edgesFor(sel.row),
                                 streaks: streaksFor(sel.row),
                                 kickerFor: kickerText,
                                 onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } },
                                 onViewGame: { onSelectGame($0, sel.row.league, sel.row.bdl_game_id) },
                                 onSignal: { signal in
                                     gameSheet = nil
                                     openSignal(signal)
                                 },
                                 onTeam: { r in
                                     withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil }
                                     openTeamCard(for: r)
                                 },
                                 onTeamName: { openTeamCard(named: $0) },
                                 cardFor: { intelCard(for: $0) })
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1))
                        .overlay(alignment: .topTrailing) {
                            Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Close game research")
                        }
                        .shadow(color: .black.opacity(0.6), radius: 30, y: 14)
                        .padding(.horizontal, 14)
                        .frame(maxHeight: UIScreen.main.bounds.height * 0.58)
                }
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.isModal)
                .accessibilityAction(.escape) { gameSheet = nil }
                .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: gameSheet?.id)
        .onChange(of: pendingScrollAnchor) { anchor in
            guard let anchor else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                let target = researchScrollTarget(for: anchor)
                withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(target, anchor: .top) }
                pendingScrollAnchor = nil
            }
        }
        // Switching leagues rebuilds the whole page — land the reader back at
        // the masthead instead of mid-scroll into shorter content.
        .onChange(of: sel) { _ in
            searchText = ""
            searchOpen = false
            searchFocused = false
            sectionNavOpen = false
            if sel == .mlb, hubScope == "fantasy" {
                hubScope = "hub"
                pendingScrollAnchor = "fantasy"
            }
            withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo("top", anchor: .top) }
        }
        .onChange(of: hubScope) { _ in
            searchText = ""
            searchOpen = false
            searchFocused = false
            sectionNavOpen = false
            proxy.scrollTo("top", anchor: .top)
        }
        .transaction { transaction in
            if reduceMotion { transaction.animation = nil; transaction.disablesAnimations = true }
        }
        }
        }
    }

    /// Lane label for a row's kicker (VENUE for WC "ballpark" reads).
    /// One lane label for every row on the page. Routes through the shared
    /// renamer so football's `.injury` reads AVAILABILITY (MLB's REPLACEMENT
    /// misnames "Mertz is out") and WC's `.ballpark` reads VENUE.
    private func kickerText(_ s: Signal) -> String {
        signalChipLabel(kind: s.kind, league: s.league)
    }

    /// Jump-bar entries — only sections that exist right now, in page order.
    private var jumpItems: [(anchor: String, label: String)] {
        var out: [(String, String)] = []
        if showsNextSlateCard { out.append(("nextSlate", "Next Slate")) }
        if frontPageSelection.lead != nil { out.append(("lead", "Quick scan")) }
        out += researchModules.map { ($0.id, $0.title) }
        return out
    }

    // ---- page states ----

    private var hubLoading: some View {
        VStack(spacing: 14) {
            ProgressView().tint(GaryColors.gold)
            Text("PULLING TONIGHT'S BOARD")
                .hubKickerFont(11).tracking(1.4)
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(maxWidth: .infinity).padding(.top, 120)
    }

    private var hubError: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(GaryColors.gold.opacity(0.6))
            Text("Couldn't load the Hub")
                .hubTitleFont(17, .bold)
                .foregroundStyle(GaryColors.warmWhite)
            Text("Check your connection, then pull down to retry.")
                .hubBodyFont(12.5).foregroundStyle(.white.opacity(0.62))
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button { Task { await load() } } label: {
                Text("RETRY")
                    .hubDataFont(12)
                    .foregroundStyle(GaryColors.ink)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity).padding(.top, 90)
    }

    private var hubRefreshNotice: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                HubKicker(text: "Last available update")
                Text("Couldn't refresh \(sel.label). These reads may have changed.")
                    .hubBodyFont(13)
                    .foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button { Task { await load() } } label: {
                Image(systemName: "arrow.clockwise").frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(GaryColors.gold)
            .accessibilityLabel("Retry \(sel.label) Hub refresh")
            .disabled(loadTask != nil)
        }
        .padding(16)
        .garyPanel(radius: 12)
        .padding(.horizontal, 18)
    }

    /// Pre-lineup morning: the paper still has a front section (slate, streaks,
    /// last night render below) — this is just the honest note.
    private var hubMorningNotice: some View {
        VStack(alignment: .leading, spacing: 6) {
            HubKicker(text: "Tonight's Board")
            Text("No \(sel.label) edges posted yet.")
                .hubBodyFont(14.5, .semibold)
                .foregroundStyle(.white.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18)
    }
}
