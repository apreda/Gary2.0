import SwiftUI

struct HomeView: View {
    @ObservedObject private var homeAuth = AuthManager.shared
    private var homeTaskID: String { "\(homeNonce)|\(homeAuth.currentUser?.id ?? "guest")" }
    /// Use the root tab selection directly. A second `@AppStorage` wrapper could
    /// briefly report Home as selected while the root was already restoring a
    /// different tab, consuming the first-open recap offscreen.
    @Binding var selectedTab: Int
    // Parallax model for THE FLOOR. @State only STORES the instance across
    // re-inits — it does not observe it, so scroll frames never invalidate
    // HomeView's body; only the ground layer subscribes.
    @State private var groundParallax = GroundParallax()
    @State private var loading = true
    /// Bumped to re-run the load `.task` on pull-to-refresh and on app foreground —
    /// kept-alive tabs never re-fire `.task` on their own, so picks/results/recaps
    /// went stale until a full relaunch. Existing content stays visible during
    /// refresh; `loading` only controls the empty-page placeholder.
    @State private var homeNonce = 0
    /// Launch already owns one complete keyed load. SwiftUI can report the
    /// scene becoming active after that task has started; treating that initial
    /// activation as a foreground return cancels the first request wave and can
    /// strand Home half-hydrated. Real foreground returns refresh normally once
    /// the initial load has finished (successfully or with an honest error).
    @State private var hasCompletedInitialHomeLoad = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var animateIn = false
    /// Last night's betting recaps (game_recaps) — the story player's slides.
    @State private var nightRecaps: [GameRecapRow] = []
    /// "TODAY" once the rolling recap has crossed into today's graded picks, else "LAST NIGHT".
    @State private var recapLabel: String = "LAST NIGHT"
    /// Exact dated ticket → numeric away-home score, used only when the recap
    /// has no structured box score. Never store team-labeled display text here.
    @State private var scoreByMatchup: [String: String] = [:]
    /// GAME picks only — the rolling Home scorecard. It holds yesterday before
    /// first pitch, then becomes today's live/settled record.
    @State private var gamesNightRecord: (w: Int, l: Int, p: Int) = (0, 0, 0)
    @State private var gamesNightNet: Double? = nil
    @State private var gamesNightBest: Double? = nil
    /// The once-a-day popup has a separate immutable prior-day receipt. Sharing
    /// the rolling scorecard state made today's first kickoff rewrite the popup.
    /// The popup is yesterday's Winners card (founder, Sep 24 2026).
    @State private var winnersRecap: WinnersRecapModel?
    @State private var showDailyRecap = false
    /// A game opened from the board or the marquee, read over Home.
    @State private var openGame: PicksPinnedGame?
    @AppStorage("dailyRecapShownDate") private var dailyRecapShownDate = ""
    /// The full day's games + opening lines (daily_slate) — the slate works
    /// from the morning; Gary's picks overlay as they post.
    @State private var slateGames: [DailySlateRow] = []
    /// One Home board, switched between the active sports and the user's bets.
    @State private var selectedHomeBoardLeague: HomeBoardLeague = .mlb
    /// True once the user has tapped a board tab THIS session. Before that,
    /// the in-season league auto-leads; after it, their choice sticks — an
    /// empty league shows its own "no games" line instead of snapping away
    /// (founder, Aug 24: "if a user click NFL and is on MLB they expect to
    /// see NFL and if there are no games thats fine the tab should just say
    /// that").
    @State private var userPickedBoardLeague = false
    /// Date key actually backing `slateGames`. Keeping it beside the payload
    /// avoids mixing yesterday's rows with today's results during the 6am reload.
    @State private var loadedSlateDate = ""
    /// Durable grades for the active board. The live-score table is a transient
    /// tracker and can shed/duplicate rows after FINAL; these records keep each
    /// CASHED/LOST stamp pinned until the slate rolls the following morning.
    @State private var sheetGameResults: [GameResult] = []
    /// Same-session last-good result payloads are emergency transport buffers.
    /// Successful empty responses replace them; schema/auth failures never use them.
    @State private var recentGameResultsLastGood: [GameResult] = []
    @State private var recentPropResultsLastGood: [PropResult] = []
    /// A foreground app may remain open across the cutoff. Check cheaply once a
    /// minute so the new board loads at 6am ET without requiring a relaunch.
    private let slateRolloverTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()
    /// Picks, grades and recap rows can land while Home stays open. This pulse
    /// refreshes only those rolling records while Home is the active tab; live
    /// scores keep their own faster shared poller.
    private let rollingHomeRefreshTimer = Timer.publish(every: 90, on: .main, in: .common).autoconnect()
    @State private var rollingHomeRefreshInFlight = false
    /// Identifies the keyed full load currently running. The nonce makes the
    /// cancellation defer safe if a newer load starts before the old one exits.
    @State private var fullHomeRefreshNonce: Int? = nil
    @State private var fullHomeRefreshID = UUID()
    @State private var fullHomeRefreshDate: String? = nil
    // Front-page modules
    @State private var marquee: HomeMarqueeHero.Story? = nil
    @State private var marqueeRequestID = UUID()
    @State private var cachedHeadlines: [HomeMarqueeHero.Story]? = nil   // instant cold-open paint
    /// Which time-state the home shows. Opens on Morning — the results-first view
    /// the user lands on — and stays wherever the switcher is set.
    @State private var selectedPhase: HomePhase = .morning
    /// Has the clock been applied once this session? `selectedPhase` starts on
    /// .morning and used to be changed ONLY by a finger on the TODAY pill, so
    /// opening the app at 9pm with games running still rendered the morning
    /// stack — and the standalone LIVE tab had already been retired on the
    /// grounds that "Today already evolves to lead with the live tape once
    /// games tip off". It never did on load. Applied once so a deliberate tap
    /// (or a QA verb) still wins afterwards.
    @State private var hasAppliedClockPhase = false
    /// Set the moment a finger picks a day. The clock may re-evaluate the
    /// opening layout when live scores land (they arrive AFTER the first
    /// application, so a cold open at 9pm could not see that games were on),
    /// but it must never overrule a deliberate choice.
    @State private var userChosePhase = false
    /// Hard pick-source failures (auth/schema — NOT an empty board). The fetch
    /// layer has always separated these from empties "for the retry banner",
    /// but only PicksTab ever read them, so a real failure rendered Home's
    /// "Nothing on the board yet · Gary posts his picks a few hours before
    /// games" — telling the reader something untrue.
    @State private var homeSourceFailures: Set<String> = []
    @State private var gamesLiveNow = 0
    // Current board and betting-news shelf.
    @State private var wireItems: [SupabaseAPI.WireItem] = []
    @State private var todayPicks: [GaryPick] = []
    /// Game ids on today's Winners board, so the board can mark Gary's Winners
    /// picks in place. Empty while a paid board is locked or not loaded.
    @State private var winnersBoardGameIDs: Set<Int> = []
    @State private var initialLive: [LiveScore] = []
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// The signed-in user's bets for TODAY — feeds the board's YOU tab
    /// (founder, Aug 20). Loaded with the home refresh; empty when signed out.
    @State private var myTodayBetsRows: [UserBet] = []
    @State private var myTodayBetsAccountID: String? = nil
    @State private var myTodayBetsDate = ""
    @State private var myBetsRefreshID = UUID()
    private var myTodayBets: [UserBet] {
        guard myTodayBetsAccountID == homeAuth.currentUser?.id,
              myTodayBetsDate == SupabaseAPI.todayEST() else { return [] }
        return myTodayBetsRows
    }

    /// Time-aware front page: results lead in the morning, the slate leads
    /// pre-game, the tape + takeover lead while Gary's games are in progress.
    private enum HomePhase: Equatable { case morning, pregame, live, tomorrow }
    private var phase: HomePhase {
        if liveScoresNow.contains(where: { $0.isLive }) || gamesLiveNow > 0 { return .live }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return cal.component(.hour, from: Date()) < 12 ? .morning : .pregame
    }
    /// The Tomorrow look-ahead payload (tomorrow_board). nil until it loads /
    /// posts — the Tomorrow body shows its own honest-empty states meanwhile.
    @State private var tomorrowBoard: TomorrowBoard? = nil
    /// Today's board snapshot — feeds the MARQUEE tracker (big games).
    @State private var todayBoard: TomorrowBoard? = nil
    /// What the "TODAY" pill maps to: today's locked Home, time-aware (morning
    /// before noon ET, pregame after) — exactly the computed `phase` clock, so
    /// the Today pill drives selectedPhase to .morning/.pregame untouched. Live
    /// and Tomorrow are their own pills.
    private var todayClockPhase: HomePhase {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return cal.component(.hour, from: Date()) < 12 ? .morning : .pregame
    }
    /// The phase actually rendered — driven by the on-screen switcher, which
    /// opens on Morning.
    private var effectivePhase: HomePhase { selectedPhase }
    /// Freshest live snapshot we have — the 90s cache once it has polled,
    /// the one-shot `.task` fetch before that.
    private var liveScoresNow: [LiveScore] {
        liveCache.scores.isEmpty ? initialLive : liveCache.scores
    }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Does the page have anything to render below the header? Used to swap a
    /// loading/empty placeholder in for the otherwise-blank scroll area on a
    /// fresh account or a failed/empty fetch.
    private var hasHomeContent: Bool {
        !slateGames.isEmpty || !todayPicks.isEmpty || !headlineStories.isEmpty
            || !nightRecaps.isEmpty || marquee != nil || !wireItems.isEmpty
    }

    /// Today's All-Star specials — everything the specials lane stamps
    /// (type "special" across the Derby/ASG boards, plus the ASG moneyline
    /// which rides the real BDL game id). Empty every other week of the year,
    /// so the takeover costs nothing outside the break.
    /// The All-Star lane's two hardcoded BDL game ids. Named because a bare
    /// `game_id == 8712499` in a filter is indistinguishable from a typo, and
    /// any future game landing on one of these ids would pop a July takeover
    /// in the middle of the season.
    private static let allStarGameIDs: Set<Int> = [8712499, 20260713]

    private var allStarSpecials: [GaryPick] {
        todayPicks.filter { pick in
            (pick.type ?? "") == "special"
                || (pick.game_id.map(Self.allStarGameIDs.contains) ?? false)
        }
    }

    var body: some View {
        ZStack {
            // Background — the house ink, plus the living obsidian layer
            // (Home only; founder, Aug 18: the infinite feel without leaving
            // our black).
            LiquidGlassBackground(grainDensity: 0) // no grain (founder, Sep 25 2026)
            HomeFloorGround(parallax: groundParallax)

            GeometryReader { viewport in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {

                        // ONE-LINE masthead (founder, Aug 6 night, second ruling:
                        // "all apps have headers — bring them back, but all in one
                        // line, horizontal not vertical"). Brand left, the
                        // TODAY/TOMORROW switcher rides the same line; no date
                        // accent — the tabs get the room.
                        GaryPageHeader(title: "Gary", goldPart: "A.I.", trailing: { phaseSwitcher })

                        // TODAY is one full merged page that evolves through the day —
                        // results-first in the morning, the slate + board + World Cup
                        // always present, the live tape + full live experience leading
                        // once games tip off. NOTHING is dropped across the day. LIVE
                        // is no longer its own tab (founder call): Today absorbs the
                        // live state, so `.live` routes to `todaySections` too — which
                        // leads with the live tape/takeover/board/in-game Wire when
                        // games are on. TOMORROW is the only separate body.
                        switch effectivePhase {
                        case .morning, .pregame, .live:
                            // Fresh account / no-network: never leave a blank scroll
                            // area under the header (App Review runs empty states).
                            // Show a loading state on first load, a friendly empty
                            // message once the fetch resolves with nothing.
                            if !hasHomeContent {
                                HomeContentPlaceholder(loading: loading, sourceFailed: !homeSourceFailures.isEmpty)
                            } else {
                                todaySections
                            }
                        case .tomorrow:
                            TomorrowView.Body(board: tomorrowBoard)
                        }

                        // ── ⑥ Footer — quiet ──
                        footer
                            .opacity(animateIn ? 1 : 0)
                            .animation(.easeOut(duration: 0.6).delay(0.3), value: animateIn)
                    }
                    // Live MLB rows must never enlarge the page's horizontal
                    // content area as scores and verdict labels change.
                    .frame(width: viewport.size.width, alignment: .leading)
                    .padding(.bottom, 110)
                    .background(HomeScrollDirectionLock())
                    // Parallax probe — a background measurement, never a layout
                    // row (a zero-height VStack child still costs one 18pt
                    // spacing gap above the masthead).
                    .background(GeometryReader { g in
                        Color.clear.preference(key: HomeScrollOffsetKey.self,
                                               value: g.frame(in: .named("homeScroll")).minY)
                    })
                }
                .modifier(HomeHorizontalBounceBehavior())
                .refreshable {
                    homeNonce &+= 1
                    try? await Task.sleep(nanoseconds: 800_000_000)   // let the pull spinner show while the keyed .task reloads
                }
                .coordinateSpace(name: "homeScroll")
                // NOTE: the page scroll keeps its clip — unclipping it let rows
                // bleed through the status bar. The Jul 7 unclippedRail law is
                // for horizontal card rails only; shadows clipping at the SCREEN
                // edge are invisible anyway.
                .onPreferenceChange(HomeScrollOffsetKey.self) { minY in
                    // A tenth of the scroll, clamped so the horizon stays on the
                    // page. Writes go to the model — only the ground re-renders.
                    let offset = max(-48, min(0, minY) * 0.10)
                    if groundParallax.offsetY != offset { groundParallax.offsetY = offset }
                }
            }

            StatusBarScrim()
        }
        // THE FLOOR pairs with solid cards (founder, Aug 19): over a patterned
        // ground, the translucent panel wash lets the grid bleed through every
        // container — Home's subtree locks panels to the opaque ink-equivalent.
        .environment(\.solidPanels, true)
        // Trial (founder, Sep 21 2026): gold on every Home container's edge,
        // to see it against the headline cards' league colour.
        .environment(\.panelEdge, GaryColors.gold.opacity(0.35))
        .overlay {
            if showDailyRecap, let winnersRecap {
                DailyRecapOverlay(recap: winnersRecap, member: winnersMember,
                                  onWinners: { closeDailyRecap(); selectedTab = 1 },
                                  onDismiss: { closeDailyRecap() })
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .fullScreenCover(item: $openGame) { game in
            let card = GameCardPopup(game: game) { openGame = nil }
            if #available(iOS 16.4, *) { card.presentationBackground(.clear) } else { card }
        }
        .onGaryTour { verb, arg in
            // The recap modal isn't a presented VC, so the generic "dismiss"
            // can't reach it — close it here (same ledger write as a real tap).
            if verb == "dismiss", showDailyRecap {
                dailyRecapShownDate = SupabaseAPI.todayEST()
                withAnimation(.easeOut(duration: 0.2)) { showDailyRecap = false }
            }
            // `opengame Pirates`: the board's first game naming it, over Home.
            if verb == "opengame", let row = sheetRows.first(where: { $0.matchupFull.localizedCaseInsensitiveContains(arg) }) {
                openGame = PicksPinnedGame(league: row.league, gameID: row.gameID, matchup: row.matchupFull)
            }
            // Day switcher for the screenshot tooling.
            if verb == "tomorrow" { selectedPhase = .tomorrow }
            if verb == "today" { selectedPhase = todayClockPhase }
            if verb == "homeboard", let league = HomeBoardLeague(rawValue: arg.uppercased()) {
                // The QA verb mirrors a real finger: an explicit choice sticks,
                // so an empty league shows its "no games" line (Aug 24).
                userPickedBoardLeague = true
                selectedHomeBoardLeague = league
            }
        }
        .task(id: homeTaskID) {
            // The board's YOU tab: today's tails/fades (founder, Aug 20) — its
            // own load so EVERY home refresh path carries it. Signed-out =
            // empty = no tab. Day-cache law: never latch a cancelled empty
            // fetch over rows already showing.
            await refreshMyTodayBets()
        }
        .task(id: homeTaskID) {
            guard !Task.isCancelled else { return }
            let taskNonce = homeNonce
            let date = SupabaseAPI.todayEST()
            let accountID = homeAuth.currentUser?.id
            let requestID = UUID()
            fullHomeRefreshID = requestID
            fullHomeRefreshNonce = taskNonce
            fullHomeRefreshDate = date
            @MainActor func canPublish() -> Bool {
                fullHomeRefreshID == requestID
                    && isCurrentHomeRequest(nonce: taskNonce, date: date, accountID: accountID)
            }
            defer {
                if canPublish() { hasCompletedInitialHomeLoad = true }
                if fullHomeRefreshID == requestID {
                    fullHomeRefreshNonce = nil
                    fullHomeRefreshDate = nil
                    // A first-ever load can cross 6 a.m. before any slate exists.
                    // The owner alone restarts it; the timer cannot use an empty
                    // loadedSlateDate, and an obsolete defer must never restart.
                    if !Task.isCancelled, homeNonce == taskNonce,
                       accountID == homeAuth.currentUser?.id, date != SupabaseAPI.todayEST() {
                        homeNonce &+= 1
                    }
                }
            }
            // Existing content stays painted during a silent reload. The loading
            // placeholder is only for a true first load with nothing to show.
            if !hasHomeContent { loading = true }
            // The clock/live state chooses the opening layout, once per session.
            if !hasAppliedClockPhase {
                hasAppliedClockPhase = true
                if selectedPhase != .tomorrow { selectedPhase = phase }
            }
            #if DEBUG
            // Lets the screenshot tooling drive the switcher:
            //   simctl launch ... --args -previewPhase live
            switch UserDefaults.standard.string(forKey: "previewPhase") {
            case "morning": selectedPhase = .morning
            case "pregame": selectedPhase = .pregame
            case "live":    selectedPhase = .live
            case "tomorrow": selectedPhase = .tomorrow
            default: break
            }
            #endif
            // Paint last session's headline cards instantly (load() re-validates the day key).
            if cachedHeadlines == nil { cachedHeadlines = HomeHeadlinesCache.load() }
            do {
                try await withTimeout(seconds: 30) {
                    // Start independent requests together; publish only for this load owner.

                    guard canPublish() else { return }
                    let sameSlate = loadedSlateDate == date
                    let previousTodayPicks = sameSlate ? todayPicks : []

                    // Start all fetches in parallel using async let
                    async let picksFetch = fetchIsolatedGamePickSources(
                        date: date
                    )
                    // Pull the full recent window (not just 30) so the morning recap's
                    // game record counts EVERY graded game pick from the night's slate —
                    // with "Gary picks every game" a single day's slate can exceed 30, and
                    // the old cap truncated it to the late spillover (the "always 1-0" bug).
                    async let gameResultsFetch = SupabaseAPI.fetchRecentGameResults(limit: 200)
                    async let propResultsFetch = SupabaseAPI.fetchRecentPropResults(limit: 200, since: SupabaseAPI.propsBookSince)
                    async let liveFetch = SupabaseAPI.fetchLiveScores(date: date)
                    async let wireFetch = SupabaseAPI.fetchWireItems(date: date)
                    // The late-page sections' fetches join the SAME wave (Jul 22
                    // perf: they used to start only after everything above them
                    // finished — the tail of every cold open).
                    async let recapsTodayF = SupabaseAPI.fetchGameRecaps(date: date)
                    async let recapsGradedF = SupabaseAPI.fetchGameRecaps(date: SupabaseAPI.hubGradedDateEST())
                    async let slateF = SupabaseAPI.fetchDailySlate(date: date)
                    async let tomorrowBoardF = SupabaseAPI.fetchTomorrowBoard(date: HomePresentation.tomorrowSlateDateEST())
                    async let todayBoardF = SupabaseAPI.fetchTodayBoard(date: date)

                    // Paint IMMEDIATELY — cached headlines + placeholders roll in
                    // as data lands (Jul 22 perf: the page sat at opacity 0 until
                    // the record fetch answered, reading as a slow app on every
                    // cold open).
                    withAnimation(.easeOut(duration: 0.8)) {
                        animateIn = true
                    }

                    let recentGameResults: [GameResult]
                    do {
                        let fresh = try await gameResultsFetch
                        guard canPublish() else { return }
                        recentGameResultsLastGood = fresh
                        recentGameResults = fresh
                    } catch {
                        guard canPublish() else { return }
                        recentGameResults = SupabaseAPI.isTransientExternalFailure(error)
                            ? recentGameResultsLastGood : []
                    }
                    let recentPropResults: [PropResult]
                    do {
                        let fresh = try await propResultsFetch
                        guard canPublish() else { return }
                        recentPropResultsLastGood = fresh
                        recentPropResults = fresh
                    } catch {
                        guard canPublish() else { return }
                        recentPropResults = SupabaseAPI.isTransientExternalFailure(error)
                            ? recentPropResultsLastGood : []
                    }

                    // Rolling recap anchor: the most recent SETTLED day INCLUDING today, so the
                    // scorecard + prop box + highlights roll from yesterday into today as today's
                    // picks grade. recapLabel reads "TODAY" once we've crossed over.
                    // (HR fun-lane results can't anchor the recap day — they're
                    // excluded from the whole Home ledger below.)
                    let recapDays = recentGameResults.filter { ["won","lost","push"].contains($0.result ?? "") }.compactMap { $0.game_date }
                                  + recentPropResults.filter { !$0.isHRResult && !$0.isTDLaneResult && ["won","lost","push"].contains($0.result ?? "") }.compactMap { $0.game_date }
                    let recapDay = Set(recapDays).max()
                    recapLabel = recapDay.map(slateDayShort) ?? recapLabel

                    // Build the marquee from the latest settled night.
                    // HR fun-lane and touchdown-lane results never touch the Home
                    // ledger — record, net, cashes, best odds all count CORE bets
                    // only (founder, Aug 3; the touchdown lane Sep 24 2026).
                    let night = HomePresentation.buildLastNight(games: recentGameResults,
                                                    props: recentPropResults.filter { !$0.isHRResult && !$0.isTDLaneResult })
                    marquee = night.story
                    let storyRequestID = UUID()
                    marqueeRequestID = storyRequestID
                    // The flip side (the pick Gary CALLED + the fact check) rides
                    // OFF the critical path — two round trips that only feed the
                    // marquee's back face update it when they land (Jul 22 perf:
                    // they were serial awaits blocking every section below).
                    if let story = night.story, let mg = night.marqueeGame, let nightDate = mg.game_date {
                        Task { @MainActor in
                            var s = story
                            if let nightPicks = try? await SupabaseAPI.fetchDailyPicks(date: nightDate) {
                                guard canPublish() else { return }
                                let hay = (mg.matchup ?? "").lowercased()
                                if let match = nightPicks.first(where: { p in
                                    let h = Formatters.shortTeamName(p.homeTeam, league: p.league).lowercased()
                                    let a = Formatters.shortTeamName(p.awayTeam, league: p.league).lowercased()
                                    return !h.isEmpty && !a.isEmpty && hay.contains(h) && hay.contains(a)
                                }) {
                                    s.take = splitTake(match.rationale).take
                                    s.tier = match.confidence.map { convictionTier(min(max($0, 0), 1)) }
                                }
                            }
                            // The fact check — what the game confirmed or refuted.
                            if let fc = await SupabaseAPI.fetchFactCheck(date: nightDate, matchup: mg.matchup ?? "") {
                                s.claims = (fc.claims ?? []).filter { $0.verdict == "right" || $0.verdict == "wrong" }
                            }
                            guard canPublish(), marqueeRequestID == storyRequestID else { return }
                            marquee = s
                        }
                    }

                    // DAY-CYCLE CLOCK (founder, Aug 3): the record cluster is
                    // LIVE results for the day from its FIRST PITCH — starting
                    // at 0–0 and building as games grade — and holds the prior
                    // night's final numbers only until that first pitch.
                    let slateRowsResolved = await slateF
                    guard canPublish() else { return }
                    let cycleStarted = slateRowsResolved.contains {
                        parseISO8601($0.commence_time ?? "").map { $0 <= Date() } ?? false
                    }
                    let cycleDayRows = recentGameResults.filter { $0.game_date == date }

                    // Publish the slate and its grades together under the captured date.
                    sheetGameResults = recentGameResults.filter {
                        $0.game_date == date && ["won", "lost", "push"].contains(($0.result ?? "").lowercased())
                    }
                    slateGames = slateRowsResolved
                    if !sameSlate {
                        // Clear the previous day before the new pick desks land.
                        todayPicks = []
                    }
                    loadedSlateDate = date

                    // Last completed day's game record, for the in-page scorecard.
                    let dailyRecap = HomePresentation.buildLastNight(
                        games: recentGameResults,
                        props: [],
                        includeToday: false
                    )
                    // The fresh-day popup is yesterday's Winners card, once per day,
                    // a first-open ritual whatever time Home is first opened.
                    Task { await loadWinnersRecap() }

                    // The in-page scorecard still rolls to today's live record at
                    // first pitch. Keeping this state separate is what lets the popup
                    // remain an honest yesterday receipt throughout the day.
                    let gamesNight = cycleStarted
                        ? HomePresentation.buildLastNight(games: cycleDayRows, props: [], includeToday: true)
                        : dailyRecap
                    gamesNightRecord = gamesNight.record
                    gamesNightNet = gamesNight.graded > 0 ? gamesNight.net : nil
                    gamesNightBest = gamesNight.bestOdds

                    // The Wire follows the latest settled day until today's stories arrive.
                    var wires = await wireFetch
                    if wires.isEmpty {
                        // Same rolling anchor the headlines use (most recent settled day),
                        // so the Wire stays current instead of falling a day stale.
                        let wireDay = recapDay ?? SupabaseAPI.yesterdayEST()
                        wires = await SupabaseAPI.fetchWireItems(date: wireDay)
                    }
                    guard canPublish() else { return }
                    // Drop the fabricated X "voice" quotes — Gary never attributes
                    // invented quotes to real handles (founder). Only real betting
                    // news (result / line_move / injury / pace) rides the Wire.
                    wireItems = wires.filter { ($0.kind ?? "") != "voice" }
                    // Refresh the live board and its opening layout.
                    let liveRows = await liveFetch ?? []
                    guard canPublish() else { return }
                    gamesLiveNow = liveRows.filter { $0.isLive }.count
                    initialLive = liveRows
                    // Live state is only knowable now — the opening layout was
                    // chosen before this fetch returned. Re-apply it so a cold
                    // open during games leads with the tape, unless the reader
                    // has already chosen a day themselves.
                    if !userChosePhase, selectedPhase != .tomorrow, selectedPhase != phase {
                        selectedPhase = phase
                    }

                    if cycleStarted {
                        recapLabel = liveRows.contains { $0.isLive } ? "LIVE" : "TODAY"
                    }
                    // Keep the snapshot fresh — the tape/takeover re-render
                    // off the shared 90s poller once it starts.
                    LiveScoreCache.shared.startIfNeeded()
                    // The night's stories. The headline ROLLS TODAY: prefer today's
                    // graded+recapped games (the local recap writers now write today's
                    // recaps as games settle), and only fall back to last night when
                    // today has NO recapped result yet — clearly the prior night, no
                    // flicker. Once a today headline exists it does not revert.
                    // Scores first — headlineStories reads this map as it builds.
                    scoreByMatchup = HomeRecapScores.index(recentGameResults)
                    let recapsToday = await recapsTodayF
                    let fetchedRecaps = recapsToday.isEmpty ? await recapsGradedF : recapsToday
                    guard canPublish() else { return }
                    nightRecaps = fetchedRecaps
                    HomeHeadlinesCache.save(headlineStories)   // write-through; no-op if empty
                    // (Board + durable grades committed at the top of the
                    // cycle-clock block — the moment slateF resolved.)
                    let fetchedTomorrowBoard = await tomorrowBoardF
                    guard canPublish() else { return }
                    tomorrowBoard = fetchedTomorrowBoard
                    let fetchedTodayBoard = await todayBoardF
                    guard canPublish() else { return }
                    todayBoard = fetchedTodayBoard
                    // Get picks data (already fetched in parallel)
                    loading = true
                    let pickSnapshot = await picksFetch
                    guard canPublish() else { return }
                    homeSourceFailures = Set(pickSnapshot.failures.map(\.failureKey))
                    let allPicks = mergeGamePickSnapshot(
                        pickSnapshot,
                        retaining: previousTodayPicks
                    )

                    // `date` is already the 6 a.m.-anchored slate key. Matching
                    // commence dates to that key keeps the finished slate visible
                    // overnight, then cleanly removes it when the key rolls at 6.
                    let todayOnlyPicks = Self.homeVisiblePicks(allPicks, slateDate: date)

                    // (Parked All-Star preview now lives inside fetchDailyPicks —
                    // DEBUG-only there — so every surface gets it from one source.)
                    todayPicks = todayOnlyPicks
                    let board = try? await SupabaseAPI.fetchWinnersBoard(date: date)
                    guard canPublish() else { return }
                    if let board {
                        winnersBoardGameIDs = Set(board.games.compactMap { $0.game_id })
                    }
                    // The "what's on today" sheet lists All-Star events like any
                    // game (founder, Jul 13): synthesize a slate row per special
                    // event when the slate table doesn't carry it.
                    for sp in todayPicks where (sp.type ?? "") == "special" {
                        guard let away = sp.awayTeam, !away.isEmpty,
                              !slateGames.contains(where: { $0.away_team == away }) else { continue }
                        slateGames.append(DailySlateRow(
                            league: sp.league ?? "MLB",
                            away_team: away, home_team: sp.homeTeam,
                            commence_time: sp.commence_time, bdl_game_id: nil,
                            venue: sp.venue,
                            spread: nil, ml_home: nil, ml_away: nil, total: nil))
                    }
                    loading = false
                }
            } catch {
                // Timeout or error — stop loading, show whatever we have
                if canPublish() { loading = false }
            }
        }
        .onChange(of: scenePhase) { phase in
            // Launch already has a full keyed load in flight. Only a later
            // foreground return should start another one; otherwise the first
            // activation cancels the receipt/slate request wave mid-hydration.
            guard phase == .active, hasCompletedInitialHomeLoad else { return }
            homeNonce &+= 1
        }
        .onChange(of: selectedTab) { tab in
            // Kept-alive tabs do not rerun `.task` when selected. Refresh the
            // small rolling payload immediately when the user comes back Home.
            guard tab == 0, scenePhase == .active else { return }
            presentDailyRecapIfNeeded()
            Task { await refreshRollingHomeContent() }
        }
        .onReceive(rollingHomeRefreshTimer) { _ in
            guard selectedTab == 0, scenePhase == .active else { return }
            Task { await refreshRollingHomeContent() }
        }
        .onReceive(slateRolloverTimer) { _ in
            guard scenePhase == .active, !loadedSlateDate.isEmpty,
                  loadedSlateDate != SupabaseAPI.todayEST(),
                  fullHomeRefreshDate != SupabaseAPI.todayEST() else { return }
            // The betting day changed while Home remained alive. Reload the
            // slate, picks, live rows, and durable grades as one date-keyed set.
            homeNonce &+= 1
        }
    }

    /// Every request owns one account and one Eastern slate. The persistent
    /// nonce rejects an older response even after its replacement has finished.
    private func isCurrentHomeRequest(nonce: Int, date: String, accountID: String?) -> Bool {
        !Task.isCancelled && homeNonce == nonce && SupabaseAPI.todayEST() == date
            && AuthManager.shared.currentUser?.id == accountID
    }

    @MainActor
    private func refreshMyTodayBets() async {
        guard !Task.isCancelled else { return }
        let requestID = UUID()
        myBetsRefreshID = requestID
        let nonce = homeNonce
        let date = SupabaseAPI.todayEST()
        let accountID = homeAuth.currentUser?.id
        if myTodayBetsAccountID != accountID || myTodayBetsDate != date {
            myTodayBetsRows = []
        }
        myTodayBetsAccountID = accountID
        myTodayBetsDate = date
        guard accountID != nil, homeAuth.bearerToken != nil else {
            myTodayBetsRows = []
            return
        }
        let fetched = await UserBookAPI.fetchMyBets()
        guard myBetsRefreshID == requestID,
              isCurrentHomeRequest(nonce: nonce, date: date, accountID: accountID) else { return }
        // A successful empty book is authoritative. A transport failure keeps
        // only this account's same-date rows; cancellation never commits empties.
        if let fetched { myTodayBetsRows = fetched.filter { $0.game_date == date } }
    }

    /// A marquee game opens over Home: its league from the card, its id from
    /// the board row for the same matchup when the board has one.
    private func openGame(matchup: String, league: String?) {
        let row = sheetRows.first { $0.matchupFull == matchup && (league == nil || $0.league == league) }
        guard let lg = league ?? row?.league, !matchup.isEmpty else { return }
        openGame = PicksPinnedGame(league: lg, gameID: row?.gameID, matchup: matchup)
    }

    /// Yesterday's Winners card for the fresh-day popup. Access is read first
    /// so a member is never shown the pitch meant for everyone else.
    @MainActor
    private func loadWinnersRecap() async {
        let day = SupabaseAPI.yesterdayEST()
        if winnersRecap?.date != day {
            guard let recap = try? await SupabaseAPI.fetchWinnersRecap(date: day), recap.date == day else { return }
            if AuthManager.shared.isAuthenticated, WinnersAccessStore.shared.snapshot == nil {
                await WinnersAccessStore.shared.refresh()
            }
            winnersRecap = recap
        }
        presentDailyRecapIfNeeded()
    }

    /// On the Winners card: paid, founding or preview access.
    private var winnersMember: Bool {
        guard !WinnersGate.preview, let snap = WinnersAccessStore.shared.snapshot else { return false }
        return snap.isFreeAccess || !snap.sports.isEmpty
    }

    /// Match the show-trigger + guard (both use todayEST) so this dismiss write
    /// can't corrupt the once-per-day state near the EST day boundary.
    private func closeDailyRecap() {
        dailyRecapShownDate = SupabaseAPI.todayEST()
        withAnimation(.easeOut(duration: 0.2)) { showDailyRecap = false }
    }

    /// Home is opacity-kept-alive even while another tab is selected, so its data
    /// task can finish offscreen. Consume the daily receipt only when Home is
    /// actually visible, then present the already-loaded receipt on a later tap.
    private func presentDailyRecapIfNeeded() {
        let available = winnersRecap.map { r in r.tickets.filter { LabTicketState(result: $0.result) != .open }.count } ?? 0
        let key = SupabaseAPI.todayEST()
        guard selectedTab == 0, available > 0, dailyRecapShownDate != key else { return }
        // Mark shown when it appears so foreground refreshes cannot stack it.
        dailyRecapShownDate = key
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            showDailyRecap = true
        }
    }

    /// Refresh the pieces that genuinely change during a slate without rerunning
    /// Home's full multi-section load. This keeps new picks, finished grades and
    /// recap cards moving while avoiding the launch/navigation work that made the
    /// app feel heavy. Successful empty pick desks clear only themselves; failed
    /// desks retain their own last-good rows while healthy sports keep moving.
    @MainActor
    private func refreshRollingHomeContent() async {
        guard !rollingHomeRefreshInFlight, fullHomeRefreshNonce == nil else { return }
        let date = SupabaseAPI.todayEST()
        guard loadedSlateDate == date else { return }
        let requestNonce = homeNonce
        let fullRequestID = fullHomeRefreshID
        let accountID = AuthManager.shared.currentUser?.id
        rollingHomeRefreshInFlight = true
        defer { rollingHomeRefreshInFlight = false }

        let previousPicks = todayPicks
        let previousGameResults = recentGameResultsLastGood
        let previousPropResults = recentPropResultsLastGood
        async let picksFetch = fetchIsolatedGamePickSources(
            date: date
        )
        async let gameResultsFetch = SupabaseAPI.fetchRecentGameResults(limit: 200)
        async let propResultsFetch = SupabaseAPI.fetchRecentPropResults(limit: 200, since: SupabaseAPI.propsBookSince)
        async let recapsTodayFetch = SupabaseAPI.fetchGameRecaps(date: date)
        async let recapsGradedFetch = SupabaseAPI.fetchGameRecaps(date: SupabaseAPI.hubGradedDateEST())

        let pickSnapshot = await picksFetch
        let fetchedPicks = mergeGamePickSnapshot(
            pickSnapshot,
            retaining: previousPicks
        )
        let recentGames: [GameResult]
        var acceptedGameResults: [GameResult]?
        do {
            let fresh = try await gameResultsFetch
            acceptedGameResults = fresh
            recentGames = fresh
        } catch {
            recentGames = SupabaseAPI.isTransientExternalFailure(error)
                ? previousGameResults : []
        }
        let recentProps: [PropResult]
        var acceptedPropResults: [PropResult]?
        do {
            let fresh = try await propResultsFetch
            acceptedPropResults = fresh
            recentProps = fresh
        } catch {
            recentProps = SupabaseAPI.isTransientExternalFailure(error)
                ? previousPropResults : []
        }
        let recapsToday = await recapsTodayFetch
        let recapsGraded = await recapsGradedFetch

        // A full refresh can finish while this older rolling wave is awaiting
        // its sources. Its persistent nonce still invalidates this wave after
        // fullHomeRefreshNonce becomes nil again. Commit buffers and visible
        // content together only for the same account and 6 a.m. slate snapshot.
        guard isCurrentHomeRequest(nonce: requestNonce, date: date, accountID: accountID),
              fullHomeRefreshID == fullRequestID, fullHomeRefreshNonce == nil,
              loadedSlateDate == date else { return }
        homeSourceFailures = Set(pickSnapshot.failures.map(\.failureKey))
        if let acceptedGameResults { recentGameResultsLastGood = acceptedGameResults }
        if let acceptedPropResults { recentPropResultsLastGood = acceptedPropResults }

        // The API is keyed to the 6 a.m. slate date, but keep the same defensive
        // commence-time filter as the full Home load so a misdated row cannot leak.
        let freshPicks = Self.homeVisiblePicks(fetchedPicks, slateDate: date)
        todayPicks = freshPicks
        if !recentGames.isEmpty {
            scoreByMatchup = HomeRecapScores.index(recentGames)
            sheetGameResults = recentGames.filter {
                $0.game_date == date && ["won", "lost", "push"].contains(($0.result ?? "").lowercased())
            }

            let coreProps = recentProps.filter { !$0.isHRResult && !$0.isTDLaneResult }
            let night = HomePresentation.buildLastNight(games: recentGames, props: coreProps)
            marquee = night.story
            marqueeRequestID = UUID()

            let cycleStarted = slateGames.contains {
                parseISO8601($0.commence_time ?? "").map { $0 <= Date() } ?? false
            }
            let cycleRows = recentGames.filter { $0.game_date == date }
            let gamesNight = cycleStarted
                ? HomePresentation.buildLastNight(games: cycleRows, props: [], includeToday: true)
                : HomePresentation.buildLastNight(games: recentGames, props: [], includeToday: false)
            gamesNightRecord = gamesNight.record
            gamesNightNet = gamesNight.graded > 0 ? gamesNight.net : nil
            gamesNightBest = gamesNight.bestOdds

            let liveRows = liveScoresNow
            gamesLiveNow = liveRows.filter(\.isLive).count
            if cycleStarted {
                recapLabel = liveRows.contains(where: \.isLive) ? "LIVE" : "TODAY"
            }
        }

        if !recapsToday.isEmpty {
            nightRecaps = recapsToday
        } else if nightRecaps.isEmpty, !recapsGraded.isEmpty {
            nightRecaps = recapsGraded
        }
        HomeHeadlinesCache.save(headlineStories)
    }

    /// Same 6 a.m.-aware filtering rule as the full Home load, factored for the
    /// rolling refresh so an overnight board stays visible until the cutoff.
    private static func homeVisiblePicks(_ picks: [GaryPick], slateDate: String) -> [GaryPick] {
        var calendar = Calendar.current
        calendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        guard let slateDay = formatter.date(from: slateDate) else { return picks }
        return picks.filter { pick in
            guard let iso = pick.commence_time, let gameDate = parseISO8601(iso) else { return true }
            return calendar.isDate(gameDate, inSameDayAs: slateDay)
        }
    }

    // MARK: - Time-aware section stacks

    /// "2026-08-04" → "AUG 4". Parsed off the ISO date, never a locale format,
    /// so the kicker reads the same on every device.
    private static func shortSlateDay(_ iso: String?) -> String {
        let parts = (iso ?? "").split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]), m >= 1, m <= 12
        else { return "" }
        let months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
        return "\(months[m - 1]) \(d)"
    }

    private var headlineStories: [HomeMarqueeHero.Story] {
        // Paint last session's cards instantly on cold open.
        if nightRecaps.isEmpty, let cached = cachedHeadlines { return cached }
        // THE TRUTH, IN ORDER (founder, Aug 3): headlines run priority league
        // first, then FEED ORDER — never wins-first, never a biggest-cash
        // lead. A rail that leads with cashes reads like Gary always wins,
        // "which of course would look fake and would be fake." Losses print
        // exactly where the night put them.
        // THE MIX (founder, Sep 21 2026): "a couple of NFL games... MLB mixed
        // in, and other sports that day mixed in... six headline cards", never
        // thirty. Leagues take turns in priority order — NFL, NCAAF, MLB… —
        // and inside each league the night's feed order stands, so a loss
        // still prints where the night put it.
        let byLeague = Dictionary(grouping: nightRecaps.enumerated().map { $0 }) { LeaguePriority.rank($0.element.league) }
        let lanes = byLeague.keys.sorted().map { byLeague[$0]!.sorted { $0.offset < $1.offset }.map(\.element) }
        var orderedRecaps: [GameRecapRow] = []
        var index = 0
        while orderedRecaps.count < 6, lanes.contains(where: { $0.count > index }) {
            for lane in lanes where lane.count > index && orderedRecaps.count < 6 { orderedRecaps.append(lane[index]) }
            index += 1
        }
        return orderedRecaps.prefix(6).map { r in
            let cashed = r.result == "won"
            let split = Formatters.splitPickAndOdds(r.pick_text ?? "")
            let mu = r.matchup ?? ""
            return HomeMarqueeHero.Story(
                league: r.league ?? "", headline: r.headline ?? "", sub: "",
                receiptLead: cashed ? "Gary Cashed ·" : "Gary Had ·",
                receiptPick: Formatters.arrowizeOverUnder(split.0).uppercased(),
                verdict: cashed ? "CASHED" : (r.result == "push" ? "PUSH" : "LOST"),
                cashed: cashed, recap: r.recap, bullets: r.bullets ?? [],
                matchup: mu,
                odds: split.1,
                // Prefer this recap's own box, with an exact dated-ticket fallback.
                score: r.box?.finalScore ?? scoreByMatchup[HomeRecapScores.key(
                    date: r.game_date, league: r.league, matchup: mu, pick: r.pick_text)],
                date: Self.shortSlateDay(r.game_date),
                awayHits: r.box?.away?.hits,
                homeHits: r.box?.home?.hits,
                awayHR: r.box?.away?.hr,
                homeHR: r.box?.home?.hr,
                awayTD: r.box?.away?.td,
                homeTD: r.box?.home?.td)
        }
    }

    /// TODAY — THE SHEET (Jul 5 rebuild; founder: "less Gary ride-along,
    /// more the bettor's sheet"). One column, the bettor's whole day:
    /// the overnight strip (graded numbers, celebrated or owned in one line)
    /// → last night's stories → the sheet itself: EARLIER / LIVE / TONIGHT,
    /// every game on today's slate with Gary's call and a status that rolls
    /// time → live verdict → CASHED/LOST → the sealed Winners stub → THE
    /// RECORD sign-off. Gary is the voice ON the sheet, not the subject of
    /// the page — free users read the day, paying users ride the calls.
    /// THE RECORD as a traveler (founder, Aug 3): yesterday's final numbers
    /// above the board until first pitch, the LIVE building record under it
    /// after. Shows at LIVE 0–0 — the reset IS the state. GAME picks only
    /// (founder, Jul 6). Scorecard tap → Billfold, as ever.
    @ViewBuilder private var recordBlock: some View {
        if gamesNightRecord.w + gamesNightRecord.l + gamesNightRecord.p > 0
            || recapLabel == "LIVE" || recapLabel == "TODAY" {
            VStack(alignment: .leading, spacing: 12) {
                // Bare rule — the scorecard's own YESTERDAY/LIVE cell already
                // names the window; "THE RECORD" said it twice.
                HomeSectionRule()
                scorecard
            }
        }
    }

    @ViewBuilder private var todaySections: some View {
        // Compute once per body eval (live ticks re-run this often).
        let stories = headlineStories
        let marqueeEntries = self.marqueeEntries
        let sheetRows = self.sheetRows

        // ── THE HEADLINES lead the page, ALL DAY (founder, Aug 5). They do
        // not move at first pitch and they do not move again at the last out:
        // the stories own the top of Home, above the countdown, and each game's
        // recap card lands up here as that game finishes. (Until Aug 5 this
        // rendered twice — once above the marquee pre-slate, once below the
        // board after — so the rail appeared to jump mid-day. One instance now.)
        if !stories.isEmpty {
            HomeHeadlinesBoard(stories: stories) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
            }
            .opacity(animateIn ? 1 : 0)
            .animation(.easeOut(duration: 0.6).delay(0.04), value: animateIn)
        }

        // ── ALL-STAR WEEK — the break takeover (Jul 13-14 2026). Gary works
        // the exhibitions, so the dark days lead with them instead of a void.
        // Renders only stored pick data + the verified event schedule.
        if !allStarSpecials.isEmpty {
            HomeAllStarTakeover(specials: allStarSpecials) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 3 }
            }
            .opacity(animateIn ? 1 : 0)
            .animation(.easeOut(duration: 0.6).delay(0.05), value: animateIn)
        }

        // ── THE MARQUEE — the day's big games, tracked live (founder):
        // countdown → live score + where Gary stands → result → the next one.
        if !marqueeEntries.isEmpty {
            HomeMarqueeTracker(entries: marqueeEntries,
                               tomorrowTease: marqueeTomorrowTease,
                               onOpenGame: { m, league in openGame(matchup: m, league: league) })
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.6).delay(0.05), value: animateIn)
        }

        // (Overnight strip removed Aug 3 — with the record box now holding
        // yesterday until first pitch and going live after, the strip said
        // the same numbers twice on one page. THE RECORD is the one home.)

        // (YOUR NIGHT strip removed Aug 27 — the board's YOU lane below is
        // where the user's open action lives on Home; the strip said it
        // twice. The receipts line above it went the same way Aug 4.)

        // ── THE BOARD — every game, one list, all day.
        homeSheet(sheetRows)
            .opacity(animateIn ? 1 : 0)
            .animation(.easeOut(duration: 0.6).delay(0.06), value: animateIn)

        // THE RECORD moved INSIDE the board card (Aug 19) — homeSheetPanel's
        // last section. On a day-state with NO board rows it still renders
        // standalone here, so the honesty band never disappears.
        if sheetRows.isEmpty {
            recordBlock
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.6).delay(0.065), value: animateIn)
        }

        // (The second headlines instance that used to sit here came out Aug 5 —
        // the rail lives at the top of the page now, in every day-state.)

        // ── THE WIRE — the day's moments. The fun-room doors that rode its
        // top came off with the Hub (Sep 23-24 2026); a lone "Free Pick" door
        // read as the Wire's own title, and Picks is one tap away in the dock.
        HomeWireMini(
            doors: [],
            items: wireItems
        ) {
            // The Hub is retired (founder, Sep 23 2026): tab 2 is Darts, and
            // the Wire now lives on Picks.
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 3 }
        }
        // ── WINNERS — the sealed card, slip-styled (the one conversion door).
        HomeWinnersStub(onOpen: {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 1 }
        })
        .opacity(animateIn ? 1 : 0)
        .animation(.easeOut(duration: 0.6).delay(0.08), value: animateIn)

        // (The Record now travels with the day cycle — see recordBlock above.
        // The page ends on the discovery shelf + the quiet social footer.)
    }

    // MARK: - THE SHEET (today's slate × Gary's calls × live state)

    /// Freshest live/final row for a slate game (the cache once it has polled,
    /// the one-shot fetch before that). Exact game id wins for doubleheaders.
    /// When the poller carries both a stale scheduled row and a final row, the
    /// scheduled row only wins before first pitch; after first pitch FINAL is
    /// authoritative. The old unconditional scheduled-first rule caused the
    /// finished board to regress to `STARTED` overnight.
    private func sheetLive(_ full: String, league: String, gameID: Int? = nil,
                           commence: String? = nil) -> LiveScore? {
        let league = league.uppercased()
        let matches: [LiveScore]
        if let gameID {
            // Exact provider identity must not depend on a league-specific
            // abbreviation dictionary. That dictionary never covered every
            // NCAAF school and previously made an exact football row invisible.
            let exact = liveScoresNow.filter {
                $0.game_id == String(gameID) && ($0.league ?? "").uppercased() == league
            }
            // At the 6am roll the cache can briefly contain yesterday's same-team
            // series game. Never fall back from today's id to a different id;
            // id-less legacy rows remain eligible for older feeds.
            matches = exact.isEmpty
                ? liveScoresNow.filter {
                    $0.game_id == nil
                        && !$0.isInterrupted
                        && ($0.league ?? "").uppercased() == league
                        && abbrGameMatches($0.abbrGame, matchup: full)
                }
                : exact
        } else {
            matches = liveScoresNow.filter {
                ($0.league ?? "").uppercased() == league
                    && abbrGameMatches($0.abbrGame, matchup: full)
            }
        }

        // Unknown start keeps the historical behavior; callers with a real slate
        // timestamp get the stricter future/final protection.
        let hasStarted = commence.flatMap(parseISO8601).map { $0 <= Date() } ?? true
        guard matches.count > 1 else {
            guard let only = matches.first else { return nil }
            // A lone pregame FINAL is a stale/bogus poller artifact. The real
            // schedule time is more trustworthy until this game actually starts.
            return only.isFinal && !hasStarted ? nil : only
        }
        if let live = matches.first(where: { $0.isLive }) { return live }
        if hasStarted, let final = matches.first(where: { $0.isFinal }) { return final }
        if let interruption = matches.first(where: { $0.isInterrupted }) { return interruption }
        if hasStarted { return matches.first { !$0.isFinal } ?? matches.first }
        return matches.first { !$0.isFinal } ?? matches.first { $0.isFinal } ?? matches.first
    }

    /// Durable game-result rows belonging to this slate matchup. Results can
    /// store either full team names or abbreviations, so match both directions
    /// through the same league keyword maps used by the live board.
    private func sheetResults(for full: String, away: String, home: String,
                              league: String, gameID: Int?) -> [GameResult] {
        if let gameID {
            let exact = sheetGameResults.filter {
                $0.game_id == String(gameID) && ($0.league ?? "").uppercased() == league
            }
            if !exact.isEmpty { return exact }
        }
        let abbr = "\(HomePresentation.teamAbbrev(away, league: league)) @ \(HomePresentation.teamAbbrev(home, league: league))"
        let fullKey = full.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
        let abbrKey = abbr.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()

        return sheetGameResults.filter { row in
            // An exact result belonging to another game must never be adopted by
            // the legacy matchup path. Only genuinely id-less history falls back.
            if gameID != nil, row.game_id != nil { return false }
            guard (row.league ?? "").uppercased() == league else { return false }
            guard let matchup = row.matchup, !matchup.isEmpty else { return false }
            let resultKey = matchup.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
            return resultKey == fullKey
                || resultKey == abbrKey
                || abbrGameMatches(matchup, matchup: full)
                || abbrGameMatches(abbr, matchup: matchup)
        }
    }

    /// Exact provider identity is the normal join. Team names are retained only
    /// for legacy stored picks that predate game_id persistence.
    private static func homeBoardPick(_ pick: GaryPick, league: String?, gameID: Int?,
                                      away: String?, home: String?) -> Bool {
        let league = (league ?? "").uppercased()
        guard (pick.league ?? "").uppercased() == league else { return false }
        if let gameID, let pickID = pick.game_id {
            return gameID == pickID
        }
        return (pick.awayTeam ?? "").caseInsensitiveCompare(away ?? "") == .orderedSame
            && (pick.homeTeam ?? "").caseInsensitiveCompare(home ?? "") == .orderedSame
    }

    private static func homeBoardPick(_ pick: GaryPick, matches game: DailySlateRow) -> Bool {
        homeBoardPick(pick, league: game.league, gameID: game.bdl_game_id,
                      away: game.away_team, home: game.home_team)
    }

    /// Stable Home-marquee identity. Provider id is the normal contract; only
    /// genuinely legacy id-less rows use matchup + 30-minute start bucket.
    /// Returning nil when legacy time is missing deliberately fails closed —
    /// two doubleheader games must never collapse into one membership key.
    private static func homeMarqueeGameKey(league: String?, gameID: Int?,
                                            matchup: String, commence: String?) -> String? {
        let scopedLeague = (league ?? "").uppercased()
        if let gameID { return "\(scopedLeague)|id:\(gameID)" }
        guard let commence, let start = parseISO8601(commence) else { return nil }
        let matchupKey = matchup.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "|")
        return "\(scopedLeague)|legacy:\(matchupKey)|\(Int(start.timeIntervalSince1970 / 1800))"
    }

    /// A stored grade for this exact play. The pick signature strips only the
    /// volatile odds tail, so a side and a total on the same game retain their
    /// own independent CASHED/LOST result.
    private func sheetStoredOutcome(for call: GaryPick, in rows: [GameResult]) -> String? {
        let sig = garyGamePickSig(call.pick)
        guard !sig.isEmpty else { return nil }
        return rows.first { garyGamePickSig($0.pick_text) == sig }?.result?.lowercased()
    }

    private static func etClock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }

    /// Inverse of `etClock` — the All-Star specials pipeline only ever stamps
    /// a display clock like "8:00 PM" (`GaryPick.time`), never a real
    /// `commence_time`, so this rebuilds TODAY's ET date at that clock time
    /// for anything that needs an actual countdown target.
    private static func todayET(atClock clock: String) -> Date? {
        let parseF = DateFormatter()
        parseF.timeZone = TimeZone(identifier: "America/New_York")
        parseF.dateFormat = "h:mm a"
        guard let parsed = parseF.date(from: clock) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let comps = cal.dateComponents([.hour, .minute], from: parsed)
        guard let hour = comps.hour, let minute = comps.minute else { return nil }
        return cal.date(bySettingHour: hour, minute: minute, second: 0, of: Date())
    }

    /// The whole day, one row per slate game, joined with Gary's calls and
    /// the live board. WC games carry two calls (side + total) on one row.
    private var sheetRows: [HomeSheetRow] {
        let featured = bigOneModel
        let games = slateGames
        guard !games.isEmpty else { return [] }
        var out: [HomeSheetRow] = []
        for (i, g) in games.enumerated() {
            let away = g.away_team ?? "", home = g.home_team ?? ""
            guard !away.isEmpty, !home.isEmpty else { continue }
            let full = "\(away) @ \(home)"
            let lgUpper = (g.league ?? "").uppercased()
            let calls = todayPicks.filter { Self.homeBoardPick($0, matches: g) }
            let rankings = CollegeTeamRankings.resolve(league: lgUpper, gameID: g.bdl_game_id,
                away: away, home: home, picks: calls, slate: [g])
            // All-Star specials: the sheet says the board EXISTS, never what's
            // on it (founder's no-reveal rule) — picks live on the Picks tab.
            let hasSpecials = calls.contains { ($0.type ?? "") == "special" }
            let callLine: String? = calls.isEmpty ? nil
                : hasSpecials ? "GARY'S BOARD — \(calls.count) PICKS · PICKS TAB"
                : calls.map { Self.homePickLabel($0.pick, league: $0.league) }.joined(separator: "  ·  ")
            let ls = sheetLive(full, league: lgUpper, gameID: g.bdl_game_id,
                               commence: g.commence_time)
            // A live-score row is the freshest authority. The exact slate row
            // carries the interruption too, covering the short window before
            // the live-score poll catches up. Never let a stale slate delay
            // override an already-live/final snapshot.
            let interruptionLabel: String? = {
                if let liveLabel = ls?.interruptionLabel { return liveLabel }
                guard ls == nil || ls?.status?.lowercased() == "scheduled" else { return nil }
                return g.interruptionLabel
            }()
            let interruptionStatus: String? = {
                if ls?.isInterrupted == true { return ls?.status?.lowercased() }
                guard ls == nil || ls?.status?.lowercased() == "scheduled" else { return nil }
                return g.isInterrupted ? g.game_status?.lowercased() : nil
            }()
            let storedRows = sheetResults(for: full, away: away, home: home,
                                          league: (g.league ?? "").uppercased(),
                                          gameID: g.bdl_game_id)
            var zone: HomeSheetRow.Zone = .upcoming
            // Abbreviations, not names (founder, Jul 27): "SEA @ TEX" reads
            // cleaner on the queue and matches the live scorebug rows.
            let awayLabel = HomePresentation.teamAbbrev(away, league: lgUpper)
            let homeLabel = HomePresentation.teamAbbrev(home, league: lgUpper)
            var title = rankings.matchup(away: awayLabel, home: homeLabel)
            var statusText = g.kickoffTimeLabel
                ?? TomorrowView.etTime(g.commence_time, withZone: false, meridiem: true).uppercased()
            var statusColor = Color.white.opacity(0.62)
            // Before Gary's call lands, the pick slot holds the MARKET (founder,
            // Aug 3): the game's lines sit where the pick will go, so the gold
            // call visibly REPLACES the market when it posts.
            var pendingLine: String? = nil
            if calls.isEmpty {
                var bits: [String] = []
                if let mlA = g.ml_away, let mlH = g.ml_home {
                    let fa = mlA > 0 ? "+\(Int(mlA))" : "\(Int(mlA))"
                    let fh = mlH > 0 ? "+\(Int(mlH))" : "\(Int(mlH))"
                    bits.append("\(HomePresentation.teamAbbrev(away, league: lgUpper)) \(fa) · \(HomePresentation.teamAbbrev(home, league: lgUpper)) \(fh)")
                }
                if !bits.isEmpty { pendingLine = bits.joined(separator: " · ") }
            }
            var hitLines: [String] = []
            var clockText: String? = nil
            if let ls, ls.isLive {
                title = ls.scoreLine ?? title
                let verdicts = calls.map { HomeLiveVerdict.evaluate(pick: $0, live: ls) }
                zone = .live
                // The cashed-props feed (scorers/assists/cards, homers/
                // steals/multi-hit days) + any of Gary's overs the score
                // has already passed (founder, Jul 7).
                hitLines = Self.liveHitStrings(ls)
                let combined = Double((ls.away_score ?? 0) + (ls.home_score ?? 0))
                hitLines += calls.compactMap { p in
                    let t = (p.pick ?? "").lowercased()
                    guard t.contains("over"), !t.contains("under"),
                          let line = HomeLiveVerdict.unsignedNumber(in: t),
                          combined > line else { return nil }
                    return Self.homePickLabel(p.pick, league: p.league)
                }
                // The inning rides the SCORE (founder, Aug 5) — it describes
                // the game, so it sits next to the game. The right column is
                // Gary's standing alone, in plain English: WINNING / LOSING.
                clockText = "▶ \((ls.detail ?? "LIVE").uppercased())"
                if verdicts.contains(.covering), !verdicts.contains(.trailing) {
                    statusText = "COVERING"; statusColor = GaryColors.win
                } else if verdicts.contains(.trailing), !verdicts.contains(.covering) {
                    statusText = "LOSING"; statusColor = GaryColors.loss
                } else if verdicts.contains(.covering) && verdicts.contains(.trailing) {
                    statusText = "SPLIT"; statusColor = GaryColors.gold
                } else {
                    // Gary has a call the score hasn't settled — level on the
                    // money, sitting on the number, or a total still cooking.
                    // That's a SWEAT, and it wears amber so it is distinct from
                    // covering green, losing red and the brand gold used for calls.
                    // A live game with no Gary call is still a complete Board row.
                    // Say that plainly instead of leaving a visually broken hole.
                    statusText = calls.isEmpty ? "NO PICK" : "SWEATING"
                    statusColor = calls.isEmpty ? Color.white.opacity(0.62) : GaryColors.sweating
                }
            } else if let interruptionLabel {
                // Provider state belongs beside the matchup, where STARTED /
                // FINAL normally live. A delay/suspension can resume, while a
                // postponement/cancellation is off today's board. Neither may
                // masquerade as a live SWEAT or a settled result.
                zone = .interrupted
                clockText = interruptionLabel
                let canResume = interruptionStatus == "delayed" || interruptionStatus == "suspended"
                statusText = calls.isEmpty ? "NO PICK" : (canResume ? "ON HOLD" : "OFF BOARD")
                statusColor = calls.isEmpty ? Color.white.opacity(0.62) : GaryColors.gold
                pendingLine = nil
            } else if (ls?.isFinal ?? false) || !storedRows.isEmpty {
                // A durable grade is just as authoritative as a live-score
                // FINAL and outlives that transient feed until the 6am roll.
                zone = .settled
                if let score = ls?.scoreLine
                    ?? storedRows.compactMap({ $0.displayFinalScore }).first(where: { !$0.isEmpty }) {
                    title = score.uppercased()
                }
                if let ls, ls.isFinal { hitLines = Self.liveHitStrings(ls) }
                clockText = "FINAL"

                let outcomes: [String] = calls.compactMap { call in
                    if let stored = sheetStoredOutcome(for: call, in: storedRows) { return stored }
                    // Defensive fallback for a legacy one-pick result whose
                    // pick_text formatting predates the normalized signature.
                    if calls.count == 1, storedRows.count == 1,
                       let only = storedRows.first?.result?.lowercased() { return only }
                    guard let ls, ls.isFinal else { return nil }
                    switch HomeLiveVerdict.evaluate(pick: call, live: ls) {
                    case .covering: return "won"
                    case .trailing: return "lost"
                    case .neutral:  return nil
                    }
                }
                let cashed = outcomes.filter { ["won", "win", "w"].contains($0) }.count
                let lost = outcomes.filter { ["lost", "loss", "l"].contains($0) }.count
                let pushed = outcomes.filter { ["push", "p"].contains($0) }.count
                if cashed > 0 && lost == 0 { statusText = "✓ CASHED"; statusColor = GaryColors.win }
                else if lost > 0 && cashed == 0 { statusText = "✗ LOST"; statusColor = GaryColors.loss }
                else if cashed > 0 && lost > 0 { statusText = "✓✗ SPLIT"; statusColor = GaryColors.gold }
                else if pushed > 0 { statusText = "PUSH"; statusColor = GaryColors.gold }
                else {
                    statusText = calls.isEmpty ? "NO PICK" : ""
                    statusColor = Color.white.opacity(0.62)
                }
            }
            // (Per-row "PICK ~x:xx" labels removed Jul 27 — the Tonight header
            // carries one "PICKS DROP 90 MIN BEFORE" note instead.)
            // The game has begun but the score feed hasn't caught it yet —
            // move it to LIVE honestly instead of listing a past start time.
            if zone == .upcoming, interruptionLabel == nil,
               let ct = g.commence_time, let d = parseISO8601(ct),
               d.addingTimeInterval(180) < Date() {
                if d.addingTimeInterval(6 * 60 * 60) < Date() {
                    // If both feeds are delayed, do not lie that a many-hours-old
                    // game merely "started". The next refresh replaces this with
                    // the durable CASHED/LOST grade as soon as it lands.
                    zone = .settled
                    clockText = "RESULT PENDING"
                    statusText = calls.isEmpty ? "NO PICK" : ""
                    statusColor = Color.white.opacity(0.55)
                } else {
                    zone = .live
                    clockText = "▶ STARTED"
                    statusText = calls.isEmpty ? "NO PICK" : "SWEATING"
                    statusColor = calls.isEmpty ? Color.white.opacity(0.62) : GaryColors.sweating
                }
            }
            // The market line is a PRE-GAME slot only — a live/final row must
            // never show the stale morning number where the score now speaks.
            if zone != .upcoming { pendingLine = nil }
            // Keep each school's saved rank beside its live/final score too.
            if rankings.hasRankings {
                if let a = ls?.away_score, let h = ls?.home_score, ls?.isLive == true || ls?.isFinal == true {
                    title = rankings.score(away: awayLabel, home: homeLabel, awayScore: a, homeScore: h)
                } else if let scores = storedRows.compactMap({ $0.teamScores }).first {
                    title = rankings.score(away: awayLabel, home: homeLabel, awayScore: scores.a, homeScore: scores.h)
                }
            }
            // A doubleheader's two games say which is which (founder, Sep 25 2026).
            if lgUpper == "MLB", let slot = MLBDoubleheader.slot(g.bdl_game_id) { title += " · GM \(slot.number)" }
            var row = HomeSheetRow(
                id: "sheet-\((g.league ?? "").uppercased())-\(g.bdl_game_id.map(String.init) ?? "legacy-\(i)-\(full)")",
                gameID: g.bdl_game_id,
                zone: zone,
                league: (g.league ?? "").uppercased(),
                matchupFull: full,
                title: title,
                callLine: callLine,
                pendingLine: pendingLine,
                clockText: clockText,
                statusText: statusText,
                statusColor: statusColor,
                bigOne: featured.map { Self.homeBoardPick($0, matches: g) } ?? false,
                onWinnersBoard: g.bdl_game_id.map { winnersBoardGameIDs.contains($0) } ?? false,
                commence: g.commence_time ?? "",
                hitLines: hitLines
            )
            if lgUpper == "NCAAF", rankings.hasRankings {
                row.collegeRankScore = rankings.away.flatMap { a in rankings.home.map { a + $0 } }
                    ?? 100 + (rankings.away ?? rankings.home ?? 99)
            }
            out.append(row)
        }
        return out.sorted { $0.commence < $1.commence }
    }

    /// THE ALL BOARD (founder, Sep 24 2026): every league on one board,
    /// college trimmed ("the marquee game of NCAA football or if there are
    /// only two for that day, that's fine too. On a large slate we would only
    /// mix in the top four or five"): every college game on a one- or
    /// two-game day, else the five best by AP ranking (both schools ranked
    /// first), the day's big game always kept. In start-time order, the
    /// same as the MLB and NFL boards (founder, Sep 24 2026: "once a pick is
    /// cashed it should stay... this is a time-based board. Just keep
    /// everything where it is").
    static func allBoardRows(_ rows: [HomeSheetRow]) -> [HomeSheetRow] {
        let college = rows.filter { $0.league == "NCAAF" }
        var kept = rows
        if college.count > 2 {
            let best = college.sorted { ($0.collegeRankScore ?? Int.max, $0.commence) < ($1.collegeRankScore ?? Int.max, $1.commence) }
            let keep = Set(best.prefix(5).map(\.id)).union(college.filter(\.bigOne).map(\.id))
            kept = rows.filter { $0.league != "NCAAF" || keep.contains($0.id) }
        }
        return kept.sorted { $0.commence < $1.commence }
    }

    // ── The YOU tab (founder, Aug 20: "a You tab next to NFL... Covering
    // Sweating or Losing would match up with the actual result THEY took").
    // Same board, same row grammar — the verdict slot answers for the USER's
    // side: a fade inverts Gary's live standing, and a settled row reads the
    // server-graded user outcome straight off the bet.

    /// Their side's live standing: Gary's verdict, flipped when they faded him.
    private func youLiveStatus(_ bet: UserBet, verdicts: [HomeLiveVerdict]) -> (String, Color) {
        let isFade = bet.kind == "fade"
        let winning = verdicts.contains(isFade ? .trailing : .covering)
        let losing = verdicts.contains(isFade ? .covering : .trailing)
        if winning && !losing { return ("COVERING", GaryColors.win) }
        if losing && !winning { return ("LOSING", GaryColors.loss) }
        return ("SWEATING", GaryColors.sweating)
    }

    private var youSheetRows: [HomeSheetRow] {
        guard !myTodayBets.isEmpty else { return [] }
        var out: [HomeSheetRow] = []
        for (i, bet) in myTodayBets.enumerated() {
            // Board parity (founder, Aug 27: "literally the same view except
            // its the picks the person made") — no kind word, no extras; the
            // verdict slot already answers for THEIR side of the bet.
            let call = Self.homePickLabel(bet.pick_text, league: bet.league)

            // Game tails/fades join the slate for the live score + verdict.
            let pick = bet.pick_type == "game"
                ? todayPicks.first(where: { ($0.pick ?? "") == bet.pick_text })
                : nil
            let matchupFull: String = {
                if let a = pick?.awayTeam, let h = pick?.homeTeam, !a.isEmpty, !h.isEmpty {
                    return "\(a) @ \(h)"
                }
                return bet.matchup ?? ""
            }()
            let lgUpper = (bet.league ?? pick?.league ?? "").uppercased()
            let commence = pick?.commence_time ?? bet.lock_at ?? ""
            let ls: LiveScore? = matchupFull.isEmpty ? nil
                : sheetLive(matchupFull, league: lgUpper, gameID: pick?.game_id, commence: commence)

            var zone: HomeSheetRow.Zone = .upcoming
            // A prop slip whose game the slate can't name still gets a real
            // title — the player it rides — never a bare league word.
            var title: String = {
                if matchupFull.isEmpty {
                    return (bet.player_name?.uppercased()).flatMap { $0.isEmpty ? nil : $0 } ?? lgUpper
                }
                let sides = matchupFull.components(separatedBy: " @ ")
                return sides.count == 2
                    ? "\(HomePresentation.teamAbbrev(sides[0], league: lgUpper)) @ \(HomePresentation.teamAbbrev(sides[1], league: lgUpper))"
                    : matchupFull
            }()
            var clockText: String? = nil
            var statusText = ""
            var statusColor = Color.white.opacity(0.62)

            if bet.status == "won" {
                zone = .settled
                clockText = "FINAL"
                if let score = ls?.scoreLine { title = score.uppercased() }
                statusText = "✓ CASHED"
                statusColor = GaryColors.win
            } else if bet.status == "lost" {
                zone = .settled
                clockText = "FINAL"
                if let score = ls?.scoreLine { title = score.uppercased() }
                statusText = "✗ LOST"
                statusColor = GaryColors.loss
            } else if bet.status == "push" || bet.status == "void" {
                zone = .settled
                clockText = "FINAL"
                statusText = bet.status.uppercased()
                statusColor = GaryColors.gold
            } else if let ls, ls.isLive, let pick {
                zone = .live
                title = ls.scoreLine ?? title
                clockText = "▶ \((ls.detail ?? "LIVE").uppercased())"
                let (word, color) = youLiveStatus(bet, verdicts: [HomeLiveVerdict.evaluate(pick: pick, live: ls)])
                statusText = word
                statusColor = color
            } else if let ls, ls.isFinal {
                zone = .settled
                title = ls.scoreLine ?? title
                clockText = "FINAL"
                statusText = "SETTLING"
                statusColor = Color.white.opacity(0.55)
            } else if let d = parseISO8601(commence) {
                statusText = Self.etClock(d)
            } else {
                statusText = "OPEN"
            }

            out.append(HomeSheetRow(
                id: "you-\(bet.id)-\(i)",
                gameID: pick?.game_id,
                zone: zone,
                league: lgUpper,
                matchupFull: matchupFull,
                title: title,
                callLine: call,
                pendingLine: nil,
                clockText: clockText,
                statusText: statusText,
                statusColor: statusColor,
                bigOne: false,
                commence: commence,
                hitLines: []
            ))
        }
        return out.sorted { a, b in
            a.zone == b.zone ? a.commence < b.commence : zoneRank(a.zone) < zoneRank(b.zone)
        }
    }

    private func zoneRank(_ z: HomeSheetRow.Zone) -> Int {
        switch z {
        case .live: return 0
        case .upcoming: return 1
        case .interrupted: return 2
        case .settled: return 3
        }
    }

    /// Cashed-prop events -> render lines: "IBRAHIM GOAL 15'", "ATTIA ASSIST",
    /// "PEDRI CARDED", "JUDGE HR x2", "WITT STEAL", "SKENES 8 KS".
    static func liveHitStrings(_ ls: LiveScore) -> [String] {
        (ls.events ?? []).compactMap { ev in
            guard let p = ev.p, !p.isEmpty else { return nil }
            switch ev.k {
            case "goal":   return ["\(p) GOAL", ev.d].compactMap { $0 }.joined(separator: " ")
            case "assist": return "\(p) ASSIST"
            case "card":   return "\(p) CARDED"
            case "hr":     return ["\(p) HR", ev.d].compactMap { $0 }.joined(separator: " ")
            case "sb":     return "\(p) STEAL"
            case "hits":   return "\(p) \(ev.d ?? "2+ HITS")"
            case "ks":     return "\(p) \(ev.d ?? "")"
            default:       return nil
            }
        }
    }

    /// "Over 2.5 -105" -> "OVER 2.5", "Argentina -1.5 -105" -> "ARGENTINA -1.5"
    /// — on the Home lines only a MONEYLINE keeps its price, because there the
    /// price IS the pick (founder, Jul 7). Totals and goal/run lines drop it.
    private static func homePickLabel(_ pick: String?, league: String? = nil) -> String {
        let parts = Formatters.splitPickAndOdds(Formatters.arrowizeOverUnder(pick ?? ""), league: league)
        let name = parts.0.uppercased()
        let isTotal = name.hasPrefix("OVER") || name.hasPrefix("UNDER")
        let hasLine = name.split(separator: " ").contains { w in
            (w.hasPrefix("+") || w.hasPrefix("-")) && (Double(w).map { abs($0) < 100 } ?? false)
        }
        return (parts.1.isEmpty || isTotal || hasLine) ? name : "\(name) \(parts.1)"
    }

    /// A published plus-money MONEYLINE, not a run line or spread with plus
    /// odds. This Home feature never changes Gary's pick or Winners admission.
    private static func isPostedMoneylineUnderdog(_ pick: GaryPick) -> Bool {
        guard let ticket = pick.pick?.trimmingCharacters(in: .whitespacesAndNewlines) else { return false }
        return ticket.range(of: #"\bML\s+\+[1-9]\d{2,3}$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// The day's big games joined with Gary's picks + the live board — the
    /// MARQUEE tracker's feed, ranked by the pipeline (todayBoard.big_games).
    /// A same-day All-Star special rides in too (see `specialMarqueeEntry`) so
    /// the hero never falls through to TOMORROW while tonight's bigger event
    /// is still ahead — one ranked pool, one "up next," never wrong (founder,
    /// Jul 14: "i hate fallback designs... just have the app work").
    private var marqueeEntries: [HomeMarqueeTracker.Entry] {
        let bigs = todayBoard?.big_games ?? []
        let bigEntries: [HomeMarqueeTracker.Entry] = bigs.isEmpty ? [] : bigs.compactMap { big -> HomeMarqueeTracker.Entry? in
            guard let matchup = big.matchup, matchup.contains(" @ ") else { return nil }
            let sides = matchup.components(separatedBy: " @ ")
            let away = sides[0], home = sides.count > 1 ? sides[1] : ""
            let calls = todayPicks.filter {
                Self.homeBoardPick($0, league: big.league, gameID: big.bdl_game_id,
                                   away: away, home: home)
            }
            let rankings = CollegeTeamRankings.resolve(league: big.league, gameID: big.bdl_game_id,
                away: away, home: home, picks: calls, slate: slateGames)
            let title = rankings.matchup(away: Self.shortTeam(away, league: big.league),
                                         home: Self.shortTeam(home, league: big.league))
            let pickLine: String? = calls.isEmpty ? nil : calls
                .map { Self.homePickLabel($0.pick, league: $0.league) }
                .joined(separator: "  ·  ")
            // No "PICK ~x:xx" line on the countdown hero (founder, Jul 27) —
            // the container tightens by exactly that row until the pick lands.
            let pendingLine: String? = nil
            let ls = sheetLive(matchup, league: big.league ?? "", gameID: big.bdl_game_id,
                               commence: big.commence_time)
            let storedRows = sheetResults(
                for: matchup,
                away: away,
                home: home,
                league: (big.league ?? "").uppercased(),
                gameID: big.bdl_game_id
            )
            let verdicts = calls.map { p in ls.map { HomeLiveVerdict.evaluate(pick: p, live: $0) } ?? .neutral }
            var result: (String, Color)? = nil
            if let ls, ls.isFinal {
                let cashed = verdicts.filter { $0 == .covering }.count
                let lost = verdicts.filter { $0 == .trailing }.count
                if cashed > 0 && lost == 0 { result = ("✓ CASHED", GaryColors.win) }
                else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                else { result = ("FINAL", Color.white.opacity(0.7)) }
            } else if !storedRows.isEmpty {
                // The marquee ribbon shares the sheet's durable grades. A
                // transient final-score row may disappear overnight, but the
                // CASHED/LOST stamp must remain everywhere until the 6am roll.
                let outcomes: [String] = calls.compactMap { call in
                    if let stored = sheetStoredOutcome(for: call, in: storedRows) { return stored }
                    if calls.count == 1, storedRows.count == 1 {
                        return storedRows.first?.result?.lowercased()
                    }
                    return nil
                }
                let cashed = outcomes.filter { ["won", "win", "w"].contains($0) }.count
                let lost = outcomes.filter { ["lost", "loss", "l"].contains($0) }.count
                let pushed = outcomes.filter { ["push", "p"].contains($0) }.count
                if cashed > 0 && lost == 0 { result = ("✓ CASHED", GaryColors.win) }
                else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                else if pushed > 0 { result = ("PUSH", GaryColors.gold) }
                else { result = ("FINAL", Color.white.opacity(0.7)) }
            }
            // MLB shows BOTH probable starters, away @ home — WC (and any
            // league without structured pitcher fields) keeps the existing
            // context/standing line untouched.
            let mlbPitchers: String? = {
                guard (big.league ?? "").uppercased() == "MLB",
                      let a = big.awayPitcher, !a.isEmpty,
                      let h = big.homePitcher, !h.isEmpty else { return nil }
                return "\(a.uppercased()) @ \(h.uppercased())"
            }()
            // Tonight's market, straight off the day board — the bottom row
            // carries real betting info instead of a third clock (founder, Jul 12).
            let bRow = todayBoard?.board.first { br in
                let sameLeague = (br.league ?? "").uppercased() == (big.league ?? "").uppercased()
                guard sameLeague else { return false }
                if let gameID = big.bdl_game_id {
                    return br.bdl_game_id == gameID
                }
                // Legacy big-game rows have no provider id. Match the same
                // teams AND start bucket; never borrow the other DH market.
                guard let bigStart = big.commence_time.flatMap(parseISO8601),
                      let boardStart = br.commence_time.flatMap(parseISO8601) else { return false }
                return Self.shortTeam(br.away_team).caseInsensitiveCompare(Self.shortTeam(away)) == .orderedSame
                    && Self.shortTeam(br.home_team).caseInsensitiveCompare(Self.shortTeam(home)) == .orderedSame
                    && Int(bigStart.timeIntervalSince1970 / 1800) == Int(boardStart.timeIntervalSince1970 / 1800)
            }
            let slateInterruption = (ls == nil || ls?.status?.lowercased() == "scheduled")
                ? bRow?.interruptionLabel : nil
            if ls?.isInterrupted == true || slateInterruption != nil { result = nil }
            var oddsBits: [String] = []
            if let a = bRow?.ml_away, let h = bRow?.ml_home,
               let aAb = bRow?.away_abbr, let hAb = bRow?.home_abbr {
                let f: (Double) -> String = { $0 > 0 ? "+\(Int($0))" : "\(Int($0))" }
                oddsBits.append("\(aAb) \(f(a)) · \(hAb) \(f(h))")
            }
            if let t = bRow?.total {
                oddsBits.append("O/U \(t == t.rounded() ? String(Int(t)) : String(t))")
            }
            // The run line (founder, Jul 26): the favorite's spread off the
            // board. The row stores the line only — no price is invented.
            if let s = bRow?.spread, s != 0,
               let aAb = bRow?.away_abbr, let hAb = bRow?.home_abbr {
                let fav = s < 0 ? hAb : aAb
                let line = -abs(s)
                oddsBits.append("RL \(fav) \(line == line.rounded() ? String(Int(line)) : String(line))")
            }
            return HomeMarqueeTracker.Entry(
                id: "mq-\(Self.homeMarqueeGameKey(league: big.league, gameID: big.bdl_game_id, matchup: matchup, commence: big.commence_time) ?? "rank:\(big.rank):\(matchup)")",
                rank: big.rank,
                league: big.league,
                matchupFull: matchup,
                title: title,
                context: mlbPitchers ?? (big.context?.isEmpty == false ? big.context : big.standing),
                commence: big.commence_time,
                pickLine: pickLine,
                pendingLine: pendingLine,
                oddsLine: oddsBits.isEmpty ? nil : oddsBits.joined(separator: " · "),
                live: ls,
                result: result,
                slateInterruptionLabel: slateInterruption,
                awayRanking: rankings.away, homeRanking: rankings.home
            )
        }
        // HERO FILLERS (founder, Aug 4: the countdown counts to the NEXT game
        // to start TODAY — tomorrow's tease only once today is truly done).
        // Every slate game not already a big game becomes hero-eligible at
        // rank 99 (soonest wins the hero; rank only breaks ties). A posted
        // underdog also joins the existing ribbon, keeping those picks visible
        // on Home without granting automatic admission to Winners.
        let bigKeys: Set<String> = Set(bigs.compactMap { big -> String? in
            guard let matchup = big.matchup else { return nil }
            return Self.homeMarqueeGameKey(league: big.league, gameID: big.bdl_game_id,
                                            matchup: matchup, commence: big.commence_time)
        })
        let fillers: [HomeMarqueeTracker.Entry] = (todayBoard?.board ?? []).compactMap { br -> HomeMarqueeTracker.Entry? in
            guard let a = br.away_team, let h = br.home_team else { return nil }
            let matchup = "\(a) @ \(h)"
            let boardKey = Self.homeMarqueeGameKey(league: br.league, gameID: br.bdl_game_id,
                                                   matchup: matchup, commence: br.commence_time)
            guard boardKey.map({ !bigKeys.contains($0) }) ?? true else { return nil }
            let calls = todayPicks.filter { p in
                if let gameID = br.bdl_game_id {
                    return p.game_id == gameID
                        && (p.league ?? "").uppercased() == (br.league ?? "").uppercased()
                }
                return Self.homeBoardPick(p, league: br.league, gameID: nil, away: a, home: h)
            }
            let featuresUnderdog = calls.contains(where: Self.isPostedMoneylineUnderdog)
            let rankings = CollegeTeamRankings.resolve(league: br.league, gameID: br.bdl_game_id,
                away: a, home: h, picks: calls, slate: slateGames)
            let fillerLive = sheetLive(matchup, league: br.league ?? "", gameID: br.bdl_game_id,
                                       commence: br.commence_time)
            let storedRows = sheetResults(for: matchup, away: a, home: h,
                                          league: (br.league ?? "").uppercased(),
                                          gameID: br.bdl_game_id)
            let verdicts = calls.map { p in
                fillerLive.map { HomeLiveVerdict.evaluate(pick: p, live: $0) } ?? .neutral
            }
            let slateInterruption = (fillerLive == nil || fillerLive?.status?.lowercased() == "scheduled")
                ? br.interruptionLabel : nil
            var result: (String, Color)? = nil
            if fillerLive?.isInterrupted != true, slateInterruption == nil {
                if fillerLive?.isFinal == true {
                    let cashed = verdicts.filter { $0 == .covering }.count
                    let lost = verdicts.filter { $0 == .trailing }.count
                    if cashed > 0 && lost == 0 { result = ("✓ CASHED", GaryColors.win) }
                    else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                    else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                    else { result = ("FINAL", Color.white.opacity(0.7)) }
                } else if !storedRows.isEmpty {
                    let outcomes: [String] = calls.compactMap { call in
                        if let stored = sheetStoredOutcome(for: call, in: storedRows) { return stored }
                        if calls.count == 1, storedRows.count == 1 { return storedRows.first?.result?.lowercased() }
                        return nil
                    }
                    let cashed = outcomes.filter { ["won", "win", "w"].contains($0) }.count
                    let lost = outcomes.filter { ["lost", "loss", "l"].contains($0) }.count
                    let pushed = outcomes.filter { ["push", "p"].contains($0) }.count
                    if cashed > 0 && lost == 0 { result = ("✓ CASHED", GaryColors.win) }
                    else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                    else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                    else if pushed > 0 { result = ("PUSH", GaryColors.gold) }
                    else { result = ("FINAL", Color.white.opacity(0.7)) }
                }
            }
            var oddsBits: [String] = []
            if let ml = br.ml_away, let mh = br.ml_home, let aAb = br.away_abbr, let hAb = br.home_abbr {
                let f: (Double) -> String = { $0 > 0 ? "+\(Int($0))" : "\(Int($0))" }
                oddsBits.append("\(aAb) \(f(ml)) · \(hAb) \(f(mh))")
            }
            if let t = br.total {
                oddsBits.append("O/U \(t == t.rounded() ? String(Int(t)) : String(t))")
            }
            return HomeMarqueeTracker.Entry(
                id: "mq-fill-\(boardKey ?? "legacy:\(matchup):\(br.commence_time ?? "")")",
                rank: 99,
                league: br.league,
                matchupFull: matchup,
                title: rankings.matchup(away: Self.shortTeam(a, league: br.league),
                                        home: Self.shortTeam(h, league: br.league)),
                context: featuresUnderdog ? "GARY'S UNDERDOG PICK" : nil,
                commence: br.commence_time,
                pickLine: calls.isEmpty ? nil : calls.map { Self.homePickLabel($0.pick, league: $0.league) }.joined(separator: "  ·  "),
                pendingLine: nil,
                oddsLine: oddsBits.isEmpty ? nil : oddsBits.joined(separator: " · "),
                live: fillerLive,
                result: result,
                slateInterruptionLabel: slateInterruption,
                railWorthy: featuresUnderdog,
                awayRanking: rankings.away, homeRanking: rankings.home
            )
        }
        return bigEntries + fillers + [specialMarqueeEntry].compactMap { $0 }
    }

    /// A same-day All-Star special — a real MARQUEE candidate, not just a
    /// banner. Rank 0 so it outranks any leftover today game once it's the
    /// biggest thing left (matches the takeover's own framing: this IS the
    /// week's marquee event). Deliberately NOT gated on "still in the future"
    /// — Entry's own upNext/started logic already handles that transition, so
    /// the entry ages into a "▶ STARTED" ribbon chip like any other game
    /// instead of vanishing at kickoff and dropping the hero right back to
    /// the wrong tomorrow fallback it exists to prevent.
    /// The specials pipeline (`run-allstar-specials.js`) never sets a real
    /// `commence_time` on these picks, only a display clock (`time`, e.g.
    /// "8:00 PM") — so this prefers commence_time if it's ever added, and
    /// otherwise rebuilds today's ET date from that clock string. No usable
    /// time at all → no synthetic entry, never a countdown to nothing.
    private var specialMarqueeEntry: HomeMarqueeTracker.Entry? {
        let featured = allStarSpecials.first { $0.game_id.map(Self.allStarGameIDs.contains) ?? false } ?? allStarSpecials.first
        guard let featured else { return nil }
        let ct: String
        if let real = featured.commence_time, parseISO8601(real) != nil {
            ct = real
        } else if let clock = featured.time, let d = Self.todayET(atClock: clock) {
            ct = ISO8601DateFormatter().string(from: d)
        } else {
            return nil
        }
        let away = featured.awayTeam ?? "AL", home = featured.homeTeam ?? "NL"
        let count = allStarSpecials.count
        return HomeMarqueeTracker.Entry(
            id: "asg-\(featured.game_id ?? 0)",
            rank: 0,
            league: featured.league ?? "MLB",
            matchupFull: "\(away) @ \(home)",
            title: "\(Self.shortTeam(away)) @ \(Self.shortTeam(home))",
            context: nil,
            commence: ct,
            pickLine: "GARY'S BOARD — \(count) PICK\(count == 1 ? "" : "S") · PICKS TAB",
            pendingLine: nil,
            oddsLine: nil,
            live: nil,
            result: nil
        )
    }

    /// Tomorrow's #1 big game — the look-ahead row once today's marquee is done.
    /// NAMES, NOT CODES (founder, Aug 4): the card has the room, so it reads
    /// "White Sox @ Red Sox" instead of "CHW @ BOS" — abbreviations are the
    /// queue's grammar, not the hero's. Carries the real start Date so the
    /// hero can tick down to first pitch instead of printing a static clock.
    private var marqueeTomorrowTease: (matchup: String, time: String, start: Date?)? {
        guard let big = tomorrowBoard?.big_games.first, let m = big.matchup else { return nil }
        let sides = m.components(separatedBy: " @ ")
        let title = sides.count == 2
            ? "\(Formatters.shortTeamName(sides[0], league: big.league)) @ \(Formatters.shortTeamName(sides[1], league: big.league))"
            : m
        return (title,
                TomorrowView.etTime(big.commence_time, withZone: false, meridiem: true).uppercased(),
                big.commence_time.flatMap(parseISO8601))
    }

    /// The sheet body — EARLIER (collapsed past), LIVE (glowing middle),
    /// TONIGHT (the queue, grouped by league, countdown on the header line).
    @ViewBuilder private func homeSheet(_ sheetRows: [HomeSheetRow]) -> some View {
        // ONE BOARD (founder, Aug 3: live games were splitting out of the
        // board into their own section — "it should all stay in the board
        // view"): every game holds its slate slot all day; the row itself
        // rolls scheduled time → live verdict → the stamp in place.
        let rows = sheetRows
            .filter { HomeBoardLeague(rawValue: $0.league) != nil && $0.league != HomeBoardLeague.you.rawValue }
        let youRows = youSheetRows
        let allRows = Self.allBoardRows(rows)
        let available: Set<HomeBoardLeague> = {
            var set = Set(rows.compactMap { HomeBoardLeague(rawValue: $0.league) })
            if !allRows.isEmpty { set.insert(.all) }
            // YOUR slate rides the same board as its own tab (founder, Aug 20)
            // — present only when the signed-in user has bets down today.
            if !youRows.isEmpty { set.insert(.you) }
            return set
        }()
        // An explicit tap is final — sports render their own (possibly
        // empty) board. Only YOU still snaps away when it has no rows: that
        // tab HIDES entirely without bets, so it can never sit selected.
        // Before any tap, open ALL (Sep 24 2026), else the first sport with
        // games on this slate.
        let selected: HomeBoardLeague = {
            if userPickedBoardLeague && selectedHomeBoardLeague != .you { return selectedHomeBoardLeague }
            if selectedHomeBoardLeague == .you && available.contains(.you) { return .you }
            return HomeBoardLeague.ordered(available: available).first ?? .mlb
        }()

        if !rows.isEmpty || !youRows.isEmpty {
            HomeSheetPanel(rows: selected == .you ? youRows : selected == .all ? allRows : rows.filter { $0.league == selected.rawValue },
                           selected: selected, available: available, tomorrowBoard: tomorrowBoard,
                           record: HomeBoardRecord.calculate(games: sheetGameResults,
                                                             league: selected.rawValue,
                                                             slateDate: loadedSlateDate),
                           selectedTab: $selectedTab, onSelect: { league in
                               userPickedBoardLeague = true
                               selectedHomeBoardLeague = league
                           }, onOpenGame: { openGame = $0 }, youScorecard: { youScorecard })
        }
    }

    /// The YOU tab's bottom line — the SAME scorecard the league lanes wear,
    /// answered with the user's own day. Fixed shape from 0–0, the numbers
    /// fill in as their bets grade; tapping opens the Billfold on YOU.
    private var youScorecard: some View {
        HomePersonalScorecard(bets: myTodayBets, label: recapLabel) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
        }
    }

    // MARK: Tonight extras — the bettor's read on the DAY

    /// The night's marquee game — the pick the pipeline tagged with stakes
    /// ("NBA FINALS GM 2", "DIVISION LEAD ON THE LINE").
    private var bigOneModel: GaryPick? {
        todayPicks
            .filter { !(($0.shortGameSignificance ?? $0.gameSignificance) ?? "").isEmpty }
            .min { ($0.commence_time ?? "") < ($1.commence_time ?? "") }
    }

    // MARK: - Home state switcher (Morning / Pre-game)

    /// Which pill currently reads as active. LIVE was retired (founder call):
    /// Today already evolves to lead with the live tape/takeover once games tip
    /// off, so a standalone Live tab was redundant. The switcher is TODAY ·
    /// TOMORROW.
    private enum SwitcherPill { case today, tomorrow }
    private var activePill: SwitcherPill {
        switch selectedPhase {
        case .morning, .pregame, .live: return .today
        case .tomorrow:                 return .tomorrow
        }
    }

    // The text tab strip (matches the Picks page game tabs): the active label
    // turns gold, the rest wait grey, no bar under either (design.md).
    private var phaseSwitcher: some View {
        // Rides the masthead's trailing slot — no gutter or trailing spacer
        // of its own (the header line owns the layout).
        HStack(spacing: 22) {
            switcherTab("TODAY", pill: .today)
            switcherTab("TOMORROW", pill: .tomorrow)
        }
    }

    private func switcherTab(_ label: String, pill: SwitcherPill) -> some View {
        let on = activePill == pill
        return Button {
            // TODAY drives selectedPhase off the live/clock state so the merged
            // Today page leads with the live tape whenever games are on, the
            // results-first morning stack otherwise.
            let target: HomePhase = (pill == .today) ? phase : .tomorrow
            userChosePhase = true
            if reduceMotion { selectedPhase = target }
            else { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { selectedPhase = target } }
        } label: {
            // Color IS the state (founder, Aug 6 night): the active day wears
            // gold, the other waits dim — no underline hardware.
            Text(label)
                .font(GaryFonts.mono(12.5, bold: on)).tracking(0.6)
                .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.4))
                .fixedSize()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }

    // MARK: - Shared team labels
   // Jul 9 2026 fix: this used to take the raw last word ("Boston Red Sox"
   // and "Chicago White Sox" both collapsed to "Sox" — the exact "SOX / SOX"
   // bug on the Members Only seal card). Delegates to the one correct,
   // two-word-mascot-aware implementation instead of re-deriving it here.
   static func shortTeam(_ name: String?, league: String? = nil) -> String {
        guard let name, !name.isEmpty else { return "—" }
        if league?.uppercased() == "NCAAF" {
            return Formatters.shortTeamName(name, league: "NCAAF")
        }
        return Formatters.shortTeamName(name)
    }

    // MARK: - Scorecard

    // June 5: caption sentence removed — the numbers speak for themselves
    // (user feedback: no editorial one-liners in the UI).
    private var scorecard: some View {
        HomeScorecard(record: HomeBoardRecord(w: gamesNightRecord.w, l: gamesNightRecord.l,
                                          p: gamesNightRecord.p, net: gamesNightNet,
                                          bestOdds: gamesNightBest), label: recapLabel) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
        }
    }

    // MARK: - Footer

    private var footer: some View {
        SocialLinksBar()
            .pageGutter()
    }

}

/// A game opened from Home, drawn the way the player cards are (founder, Sep
/// 24 2026): a card over the dimmed page, the close button above it, a tap
/// outside to put it away. The card is the game's Picks page and scrolls.
struct GameCardPopup: View {
    let game: PicksPinnedGame
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onClose() }
            // The X rides the card's own corner (founder, Sep 24 2026: "add
            // an X button so users know how to close out"), and the card
            // sits a little above centre.
            PicksCarouselView(pinned: game, onClose: onClose)
                .frame(maxHeight: PopupCardMetrics.height)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(GaryColors.gold.opacity(0.35), lineWidth: 1))
                .shadow(color: .black.opacity(0.5), radius: 24, y: 10)
                .padding(.horizontal, 14)
                .offset(y: PopupCardMetrics.offset)
        }
    }
}

/// The size and place of every pop-up card: the Home game card's. 7% longer at
/// the bottom than it first was, its top where it was (founder, Sep 25 2026:
/// "don't move it at all ... the bottom part ... a little bit further").
enum PopupCardMetrics {
    static let baseHeight = min(640, UIScreen.main.bounds.height * 0.72)
    static let height = baseHeight * 1.07
    static let offset: CGFloat = -40 + (height - baseHeight) / 2
}

/// Every card the app opens over a page, in the Home game card's size and
/// shape (founder, Sep 25 2026: "everything is going to exist as a pop-up, the
/// same way the home card is"): the dimmed page behind it closes it, the X in
/// its corner closes it. The content scrolls inside.
struct PopupCard<Content: View>: View {
    var closeLabel = "Close"
    let onClose: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onClose() }
                .accessibilityHidden(true)
            content()
                .frame(maxWidth: .infinity)
                .frame(height: PopupCardMetrics.height)
                .background(LabInk.plate)
                .overlay(alignment: .topTrailing) {
                    CardCloseButton(label: closeLabel, action: onClose).padding(.top, 6).padding(.trailing, 6)
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(GaryColors.gold.opacity(0.35), lineWidth: 1))
                .shadow(color: .black.opacity(0.5), radius: 24, y: 10)
                .padding(.horizontal, 14)
                .offset(y: PopupCardMetrics.offset)
                .accessibilityAddTraits(.isModal)
                .accessibilityAction(.escape, onClose)
        }
    }
}

extension View {
    /// Presents `item` as a PopupCard over a clear full-screen cover.
    func popupCard<Item: Identifiable, Content: View>(item: Binding<Item?>, closeLabel: String = "Close",
                                                      @ViewBuilder content: @escaping (Item) -> Content) -> some View {
        fullScreenCover(item: item) { value in
            let card = PopupCard(closeLabel: closeLabel, onClose: { item.wrappedValue = nil }) { content(value) }
            if #available(iOS 16.4, *) { card.presentationBackground(.clear) } else { card }
        }
    }
}
