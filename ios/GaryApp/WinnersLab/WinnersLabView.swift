import SwiftUI

// THE WINNERS LAB — the board. Minimal and live: the tape, text filters, and
// the plays as sealed modules that unveil into the breakdown. Admission and
// units are the server's; this page only reads `get_winners_board`.

struct WinnersLabView: View {
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @AppStorage("winnersLab.unveiled") private var unveiledRaw: String = ""
    @State private var path = NavigationPath()
    @State private var board: LabBoard?
    @State private var yesterdayBoard: LabBoard?
    @State private var streak: StreakState?
    /// Gary's run and his last ten results, for the header.
    @State private var run: WinnersRun?
    /// Gary's face for last night (Home's LAST NIGHT ladder), the header logo.
    @State private var lastNightFace: String?
    @State private var loading = true
    @State private var error: String?
    @State private var yesterdayError: String?
    /// Refreshes that failed in a row while that day's board was up.
    @State private var missedToday = 0
    @State private var missedYesterday = 0
    @State private var loadTask: Task<Void, Never>?
    @State private var loadDate: String?
    @State private var loadAccount: String?
    @State private var loadGeneration = UUID()
    @State private var date: String = SupabaseAPI.todayEST()
    /// The fan's tab; empty until they pick one (see `activeSport`).
    @State private var sport = ""
    @State private var desk = "GARY"
    @State private var unveil: LabBoardTicket?
    /// REVEAL ALL (founder, Sep 24 2026): the pack opening in place right
    /// now, and the one the page scrolls to next.
    @State private var revealing: Int?
    @State private var revealTarget: Int?
    @State private var revealTask: Task<Void, Never>?
    /// The fan's filter (founder, Sep 24 2026: "if they only want to see
    /// game or if they only want to see props").
    @State private var kindFilter: PlayKindFilter = .all
    @State private var statusFilter: PlayStatusFilter = .all
    @State private var showPlans = false
    @State private var plansFocus: String?
    @State private var checkoutURL: URL?
    @State private var checkoutError: String?
    @State private var gameResults: [String: GameResult] = [:]
    /// Today's game times still ahead, by league: the packs still to come.
    @State private var windows: [ComingWindow] = []
    @State private var propResults: [String: PropResult] = [:]
    /// The page's view: Tonight, Results or Record (founder GO, Nov 10 2026, "version A, the new look").
    @State private var section = "Tonight"
    /// The play on screen in Tonight's pager.
    @State private var playSelection = ""
    /// The play whose reasons are up.
    @State private var why: WPlay?
    /// The night on the Results view (empty: the latest night with results) and the older boards it has read.
    @State private var resultsDate = ""
    @State private var resultsBoards: [String: LabBoard] = [:]
    /// Gary's bankroll and where his money has come from, for Results and Record.
    @State private var bankroll: GaryBankrollSnapshot?
    @State private var splits: WSplits?
    /// Lays Tonight out as a short phone does (tour verb, for checking the scrolling page).
    @State private var forceScroll = false
    @ObservedObject private var liveCache = LiveScoreCache.shared
    @ObservedObject private var access = WinnersAccessStore.shared
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase

    private var today: String { GaryTour.winnersDay ?? SupabaseAPI.todayEST() }
    private var refreshActive: Bool { selectedTab == 1 && scenePhase == .active }
    private var refreshKey: String { "\(refreshActive)|\(date)|\(authManager.currentUser?.id ?? "guest")" }
    private var unveiled: Set<Int> { Set(unveiledRaw.split(separator: ",").compactMap { Int($0) }) }
    private func markUnveiled(_ id: Int) { var s = unveiled; s.insert(id); unveiledRaw = s.map(String.init).joined(separator: ",") }
    private func reseal(_ id: Int) { var s = unveiled; s.remove(id); unveiledRaw = s.map(String.init).joined(separator: ",") }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                WStage()
                VStack(alignment: .leading, spacing: 0) {
                    pageHead
                    WTabs(items: ["Tonight", "Results", "Record"], selection: $section)
                        .padding(.horizontal, 20).padding(.top, 2)
                    switch section {
                    case "Results": resultsView
                    case "Record": WinnersRecord(snapshot: bankroll, splits: splits)
                    default: tonightView
                    }
                }
                StatusBarScrim()
            }
            .navigationDestination(for: LabRoute.self) { route in
                switch route {
                case .play(let id): LabPlayView(candidateID: id)
                }
            }
        }
        .environment(\.solidPanels, true)
        .tint(GaryColors.gold)
        .overlay {
            if let ticket = unveil {
                LabUnveilOverlay(ticket: ticket, status: unveilStatus(ticket), onOpen: {
                    markUnveiled(ticket.candidateID)
                    unveil = nil
                    path.append(LabRoute.play(ticket.candidateID))
                }, onDismiss: { revealed in
                    if revealed { markUnveiled(ticket.candidateID) }
                    unveil = nil
                })
                .transition(.opacity)
                .zIndex(10)
            }
        }
        .background(Color.clear.sheet(isPresented: $showPlans) {
            PlansSheetView(focus: plansFocus, signedIn: authManager.isAuthenticated,
                           onSelect: { league in showPlans = false; startCheckout([league]) },
                           onBundle: { leagues in showPlans = false; startCheckout(leagues) },
                           onAccount: { showPlans = false; NotificationCenter.default.post(name: Notification.Name("ShowProfile"), object: nil) })
        })
        .background(Color.clear.sheet(item: $checkoutURL) { url in SafariView(url: url).ignoresSafeArea() })
        .sheet(item: $why) { play in
            WinnersWhySheet(play: play, onFull: {
                why = nil
                path.append(LabRoute.play(play.ticket.candidateID))
            })
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .task { await load() }
        .task(id: refreshKey) {
            guard refreshActive, !rollToToday() else { return }
            await load(quiet: true)
            while !Task.isCancelled {
                // A day that has not loaded yet is asked again in 10 seconds, not a minute.
                let pause: UInt64 = board == nil || yesterdayBoard == nil ? 10_000_000_000 : 60_000_000_000
                do { try await Task.sleep(nanoseconds: pause) } catch { return }
                guard refreshActive, !Task.isCancelled, !rollToToday() else { return }
                await load(quiet: true)
            }
        }
        .onChange(of: refreshActive) { active in
            if !active { revealTask?.cancel(); cancelLoad() }
        }
        .onChange(of: date) { _ in resetBoard() }
        .onChange(of: authManager.currentUser?.id) { _ in resetBoard(); unveil = nil; path = NavigationPath() }
        .onGaryTour { verb, arg in
            guard verb == "lab" else { return }
            switch arg {
            case "tonight": section = "Tonight"
            case "results": section = "Results"
            case "record": section = "Record"
            case "short": forceScroll.toggle()
            case "why": why = tonightPlays.first { $0.id == playSelection } ?? tonightPlays.first
            case "earlier": stepResults(-1)
            case "later": stepResults(1)
            case "reseal": unveiledRaw = ""
            case "reveal all": revealAll()
            case "close": if let t = unveil { markUnveiled(t.candidateID); unveil = nil }
            case "unveil": if let first = todayPlays.first { unveil = first.lead }
            case "unveil yesterday": if let first = yesterdayPlays.first { unveil = first.lead }
            default:
                #if DEBUG
                if arg.hasPrefix("day ") {
                    let day = arg.dropFirst(4).trimmingCharacters(in: .whitespaces)
                    if day == "off" { UserDefaults.standard.removeObject(forKey: GaryTour.winnersDayKey) }
                    else { UserDefaults.standard.set(day, forKey: GaryTour.winnersDayKey) }
                    rollToToday()
                    return
                }
                #endif
                if arg.hasPrefix("card "), let n = Int(arg.dropFirst(5).trimmingCharacters(in: .whitespaces)), tonightPlays.indices.contains(n) {
                    playSelection = tonightPlays[n].id; return
                }
                if arg.hasPrefix("unveil "), let id = Int(arg.dropFirst(7).trimmingCharacters(in: .whitespaces)),
                   let ticket = board?.tickets.first(where: { $0.candidateID == id }) { unveil = ticket; return }
                if arg.hasPrefix("open "), let id = Int(arg.dropFirst(5).trimmingCharacters(in: .whitespaces)) { path.append(LabRoute.play(id)) }
            }
        }
    }

    // MARK: - Loading

    /// The board is always today's, ET (founder, Sep 24 2026: Thursday morning
    /// showed Wednesday's card as today's and Tuesday's as yesterday's). The
    /// date was fixed when the page was first built; a page left open
    /// overnight now turns over on its next appearance, tab switch or tick.
    /// True when it turned; the change of date reloads the board.
    @discardableResult private func rollToToday() -> Bool {
        guard date != today else { return false }
        date = today
        return true
    }

    @MainActor private func cancelLoad() {
        loadGeneration = UUID()
        loadTask?.cancel(); loadTask = nil
    }

    @MainActor private func resetBoard() {
        cancelLoad()
        board = nil; yesterdayBoard = nil; streak = nil
        gameResults = [:]; propResults = [:]; windows = []
        error = nil; yesterdayError = nil; loading = true
        missedToday = 0; missedYesterday = 0
        loadDate = nil; loadAccount = nil
    }

    @MainActor private func accepts(_ generation: UUID, date want: String, account: String?) -> Bool {
        !Task.isCancelled && generation == loadGeneration && want == date
            && account == authManager.currentUser?.id
    }

    /// Same-day readers share one owner. Each source paints as it arrives;
    /// optional scores, prop grades and coming-game times never hold the board.
    @MainActor private func load(quiet: Bool = false) async {
        let want = date
        let account = authManager.currentUser?.id
        if let task = loadTask, loadDate == want, loadAccount == account {
            await task.value; return
        }
        if loadDate != want || loadAccount != account { resetBoard() }
        cancelLoad()
        let generation = loadGeneration
        loadDate = want; loadAccount = account
        let yesterday = LabFormat.yesterday(of: want)
        if board == nil, let saved = SupabaseAPI.cachedLabBoard(date: want, account: account) {
            board = saved
            if let snapshot = saved.access { access.snapshot = snapshot }
        }
        if yesterdayBoard == nil { yesterdayBoard = SupabaseAPI.cachedLabBoard(date: yesterday, account: account) }
        if !quiet || board == nil { loading = board == nil }
        let task = Task { @MainActor in
            async let todayRead: Void = loadBoard(want, yesterday: false, generation: generation, account: account)
            async let yesterdayRead: Void = loadBoard(yesterday, yesterday: true, generation: generation, account: account)
            async let streakRead: Void = loadStreak(date: want, generation: generation, account: account)
            async let runRead: Void = loadRun(date: want, generation: generation, account: account)
            async let detailRead: Void = loadDetails(date: want, since: yesterday, generation: generation, account: account)
            _ = await (todayRead, yesterdayRead, streakRead, runRead, detailRead)
        }
        loadTask = task
        await task.value
        if generation == loadGeneration { loadTask = nil }
    }

    @MainActor private func loadBoard(_ day: String, yesterday: Bool, generation: UUID, account: String?) async {
        let want = loadDate ?? date
        do {
            let fresh = try await SupabaseAPI.fetchLabBoard(date: day)
            guard accepts(generation, date: want, account: account) else { return }
            if yesterday { yesterdayBoard = fresh; yesterdayError = nil; missedYesterday = 0 }
            else {
                board = fresh; error = nil; loading = false; missedToday = 0
                if let snapshot = fresh.access { access.snapshot = snapshot }
                liveCache.startIfNeeded()
                for t in fresh.tickets {
                    if let prop = t.prop, LivePropStatsCache.BattingLine.supports(prop.prop ?? "") { LivePropStatsCache.shared.track(prop) }
                }
            }
        } catch {
            guard !LabFormat.isCancellation(error), accepts(generation, date: want, account: account) else { return }
            // A board on screen stays up through one missed refresh; the next,
            // a minute on, usually lands (founder, Oct 7 2026: "Tap to retry"
            // when nothing needed it). Two in a row say so.
            if yesterday {
                missedYesterday += 1
                if yesterdayBoard != nil, missedYesterday < 2 { return }
                yesterdayError = "Couldn't refresh yesterday's results."
            } else {
                loading = false
                missedToday += 1
                if board != nil, missedToday < 2 { return }
                self.error = "Couldn't refresh the board."
            }
        }
    }

    @MainActor private func loadStreak(date want: String, generation: UUID, account: String?) async {
        guard let fresh = try? await SupabaseAPI.fetchStreak(date: want),
              accepts(generation, date: want, account: account) else { return }
        streak = fresh
    }

    /// The run never holds the board: a failed read keeps the last one.
    @MainActor private func loadRun(date want: String, generation: UUID, account: String?) async {
        async let money: GaryBankrollSnapshot? = {
            guard let data = try? await WinnersAccessStore.request("rest/v1/rpc/get_gary_bankroll", body: [:]) else { return nil }
            return try? JSONDecoder().decode(GaryBankrollSnapshot.self, from: data)
        }()
        let fresh = try? await SupabaseAPI.fetchWinnersRun()
        let snapshot = await money
        guard accepts(generation, date: want, account: account) else { return }
        if let fresh, fresh != run { run = fresh }
        if let face = snapshot?.lastNight(before: want)?.face, face != lastNightFace { lastNightFace = face }
        if let snapshot { bankroll = snapshot }
        if let fresh = await WSplits.fetch(), accepts(generation, date: want, account: account), fresh != splits { splits = fresh }
    }

    // MARK: - The page (Nov 2026)

    private var pageHead: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("Winners").font(W.wide(34)).tracking(-0.85).foregroundStyle(W.bone).fitsOneLine()
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if section == "Tonight" {
                Text(LabFormat.shortDateWords(today)).font(W.text(14, .medium)).foregroundStyle(W.dim).fixedSize()
            }
            ProfileHeaderChip()
        }
        .padding(.leading, 20).padding(.trailing, 12).padding(.top, 2)
    }

    /// A ticket as the page draws it. `sealable`: one of today's plays, sealed until the fan opens it.
    private func wplay(_ t: LabBoardTicket, sealable: Bool, free: Bool = false, biggest: Bool = false) -> WPlay {
        let live = liveScore(t)
        var stage = WPlay.Stage.upcoming
        var result: String?
        var detail: String?
        switch state(t) {
        case .final(let word, _): stage = .final; result = word
        case .live(let clock, _): stage = .live; detail = clock
        case .sealed: break
        }
        if sealable, !unveiled.contains(t.candidateID) { stage = .sealed }
        return WPlay(ticket: t, stage: stage, result: result, live: live, liveDetail: detail, isFree: free, biggest: biggest)
    }
    private func byStart(_ a: LabBoardTicket, _ b: LabBoardTicket) -> Bool {
        let ta = LabFormat.parseISO(a.commence) ?? .distantFuture, tb = LabFormat.parseISO(b.commence) ?? .distantFuture
        return ta == tb ? a.candidateID < b.candidateID : ta < tb
    }

    /// Today's plays in start order, in the fan's league.
    private var tonightPlays: [WPlay] {
        let free = todayStreakTicket?.candidateID
        let league = tonightSport
        var list = (board?.tickets ?? []).filter { !$0.scratched && (league == nil || $0.league.uppercased() == league) }
        // The paywall preview shows the page as a non-member finds it: the free pick alone.
        if WinnersGate.preview { list = list.filter { $0.candidateID == free } }
        let stakes = list.map { $0.stakeUnits ?? 0 }
        let top = stakes.max() ?? 0
        let oneTop = stakes.filter { $0 == top }.count == 1 && list.count > 1 && top > 0
        return list.sorted(by: byStart).map {
            wplay($0, sealable: true, free: $0.candidateID == free, biggest: oneTop && ($0.stakeUnits ?? 0) == top)
        }
    }
    private var tonightLocked: [WLocked] {
        guard AppFlags.purchasesEnabled else { return [] }
        var seen: [String: Int] = [:]
        return lockedPacks.map { pack in
            let n = seen[pack.league, default: 0]
            seen[pack.league] = n + 1
            return WLocked(league: pack.league, index: n)
        }
    }
    /// The leagues with a play on today's card, in the page's order. Yesterday's are not Tonight's.
    private var tonightSports: [String] {
        let free = todayStreakTicket?.candidateID
        var leagues = (board?.tickets ?? []).filter { !$0.scratched && (!WinnersGate.preview || $0.candidateID == free) }.map { $0.league.uppercased() }
        if AppFlags.purchasesEnabled { leagues += (board?.boards ?? []).filter { $0.locked && $0.count > 0 }.map { $0.league.uppercased() } }
        let present = Set(leagues)
        return Self.sportOrder.filter(present.contains) + present.subtracting(Self.sportOrder).sorted()
    }
    /// The league the Tonight row is on. All when the row is not showing or the league has no play today,
    /// so a league chosen on another day can never leave the page empty.
    private var tonightSport: String? {
        let leagues = tonightSports
        return leagues.count > 1 && leagues.contains(sport.uppercased()) ? sport.uppercased() : nil
    }
    private var tonightView: some View {
        TimelineView(.periodic(from: .now, by: 30)) { tick in tonight(now: tick.date) }
    }
    private func tonight(now: Date) -> some View {
        WinnersTonight(plays: tonightPlays, locked: tonightLocked, sports: tonightSports.count > 1 ? tonightSports : [], sport: $sport,
                       selection: $playSelection, nextGame: comingPacks.first, loading: board == nil && loading,
                       failed: board == nil && error != nil, now: now, forceScroll: forceScroll,
                       onRetry: { Task { await load() } },
                       onOpen: { ticket in
                           AppCounts.once(.openedWinners)
                           unveil = ticket
                       },
                       onWhy: { play in
                           AppCounts.once(.openedWinners)
                           why = play
                       },
                       onUnlock: { league in plansFocus = league; showPlans = true })
    }

    /// The latest night with results: today once a play has settled, else yesterday.
    private var latestResultsDate: String { todayHasResult ? today : LabFormat.yesterday(of: today) }
    private var shownResultsDate: String { resultsDate.isEmpty || resultsDate > latestResultsDate ? latestResultsDate : resultsDate }
    private func resultsBoard(_ day: String) -> LabBoard? {
        day == today ? board : day == LabFormat.yesterday(of: today) ? (yesterdayBoard ?? resultsBoards[day]) : resultsBoards[day]
    }
    private func stepResults(_ delta: Int) {
        let from = shownResultsDate
        let next = LabFormat.dayOffset(from, delta)
        guard next <= latestResultsDate, next >= (bankroll?.started_date ?? "2026-09-16") else { return }
        resultsDate = next
        guard resultsBoard(next) == nil else { return }
        Task { @MainActor in
            if let fresh = try? await SupabaseAPI.fetchLabBoard(date: next) { resultsBoards[next] = fresh }
            // A night that will not load is not a night without plays: step back to the one that was up.
            else if resultsDate == next { resultsDate = from }
        }
    }
    /// The month the night belongs to: "November so far", record and money.
    private func monthLine(_ day: String) -> WinnersResults.Month? {
        let prefix = String(day.prefix(7))
        let days = (bankroll?.days ?? []).filter { $0.date.hasPrefix(prefix) }
        guard !days.isEmpty, let month = Int(day.dropFirst(5).prefix(2)), (1...12).contains(month) else { return nil }
        let name = DateFormatter().monthSymbols[month - 1]
        return WinnersResults.Month(label: prefix == String(today.prefix(7)) ? "\(name) so far" : name,
                                    wins: days.reduce(0) { $0 + $1.wins }, losses: days.reduce(0) { $0 + $1.losses },
                                    net: days.reduce(0) { $0 + $1.net_units } * LabFormat.unitDollars)
    }
    private var resultsView: some View {
        let day = shownResultsDate
        let dayBoard = resultsBoard(day)
        var plays = (dayBoard?.tickets ?? []).filter { !$0.scratched }.sorted(by: byStart).map { wplay($0, sealable: false) }
        // Today's night shows what has settled; the rest is on Tonight.
        if day == today { plays = plays.filter { $0.net != nil } }
        return WinnersResults(date: day, canGoLater: day < latestResultsDate, plays: plays, loading: dayBoard == nil,
                              face: bankroll?.days?.first { $0.date == day }?.face,
                              lastNight: day == LabFormat.yesterday(of: today), tonight: day == today, month: monthLine(day),
                              onStep: stepResults,
                              onOpen: { path.append(LabRoute.play($0.candidateID)) })
    }

    @MainActor private func loadDetails(date want: String, since: String, generation: UUID, account: String?) async {
        async let resultsF = try? withTimeout(seconds: 20) { try await SupabaseAPI.fetchAllGameResults(since: since) }
        async let propsF = try? withTimeout(seconds: 20) { try await SupabaseAPI.fetchRecentPropResults(limit: 800, since: since) }
        async let slateF = try? withTimeout(seconds: 20) { await SupabaseAPI.fetchTodayBoard(date: want) }
        if let results = await resultsF, accepts(generation, date: want, account: account) {
            var g: [String: GameResult] = [:]
            for r in results { if let d = r.game_date, let t = r.pick_text { g["\(d)|\(t)"] = r } }
            gameResults = g
        }
        if let props = await propsF, accepts(generation, date: want, account: account) {
            var p: [String: PropResult] = [:]
            for r in props { if let key = Self.propKey(date: r.game_date, player: r.player_name, market: r.prop_type, line: r.line_value?.value, bet: r.bet) { p[key] = r } }
            propResults = p
        }
        if let slate = await slateF, accepts(generation, date: want, account: account) { windows = ComingWindow.from(slate) }
    }

    private static func propKey(date: String?, player: String?, market: String?, line: String?, bet: String?) -> String? {
        guard let date, let player else { return nil }
        let m = LivePropStatsCache.BattingLine.marketKey(market ?? "")
        let l = Double(line ?? "").map { LabFormat.trim($0) } ?? ""
        return "\(date)|\(player.lowercased())|\(m)|\(l)|\((bet ?? "").lowercased())"
    }

    // MARK: - Derived

    private func gameResult(_ t: LabBoardTicket) -> GameResult? {
        // The table is keyed by date and pick text, so a miss here is a miss:
        // the old fallback scanned every result on each redraw and could never match.
        gameResults["\(t.gameDate)|\(t.pickText)"]
    }
    private func propResult(_ t: LabBoardTicket) -> PropResult? {
        guard let p = t.prop, let key = Self.propKey(date: t.gameDate, player: p.player, market: p.prop, line: p.line ?? LabFormat.trailingNumber(p.prop), bet: p.bet) else { return nil }
        return propResults[key]
    }
    private func resultWord(_ t: LabBoardTicket) -> String? {
        if t.scratched { return "scratched" }
        let r = t.outcome?.result ?? (t.isProp ? propResult(t)?.result : gameResult(t)?.result)
        guard let r, !r.isEmpty else { return nil }
        return r.lowercased()
    }
    private func liveScore(_ t: LabBoardTicket) -> LiveScore? {
        guard t.gameDate == today else { return nil }
        if let hit = liveCache.status(forGameId: t.game?.game_id ?? t.prop?.game_id, league: t.league) { return hit }
        if let id = t.gameID, let n = Int(id), let hit = liveCache.status(forGameId: n, league: t.league) { return hit }
        return liveCache.status(forMatchup: t.matchup)
    }

    enum ModuleState { case final(String, String?), live(String, String?), sealed(String?) }
    private func unveilStatus(_ t: LabBoardTicket) -> String? {
        switch state(t) {
        case .final(let result, let score):
            let word = result == "won" ? "Win" : result == "lost" ? "Loss" : result.capitalized
            return score.map { "\(word), \($0)" } ?? word
        case .live(let detail, let score):
            let word = detail.uppercased() == "FINAL" ? "Final" : "Live, \(detail)"
            return score.map { "\(word) · \($0)" } ?? word
        case .sealed: return nil
        }
    }
    private func state(_ t: LabBoardTicket) -> ModuleState {
        // A scratched play never played: the word alone, no score.
        if t.scratched { return .final("scratched", nil) }
        if let r = resultWord(t) {
            let score: String? = t.isProp
                ? t.outcome?.actual_value?.value.map(LabFormat.trim) ?? propResult(t)?.actual_value?.value
                : (gameResult(t)?.displayFinalScore ?? t.outcome?.final_score ?? liveScore(t)?.scoreLine)
            return .final(r, score)
        }
        if let live = liveScore(t) {
            if live.isFinal { return .live("Final", live.scoreLine) }
            if live.isLive { return .live(live.detail ?? "Live", live.scoreLine) }
            if let label = live.interruptionLabel { return .live(label.capitalized, nil) }
        }
        return .sealed(t.commence)
    }

    private struct Group: Identifiable {
        let key: String
        let lead: LabBoardTicket
        let riders: [LabBoardTicket]
        var id: String { key }
        var units: Double { max(lead.stakeUnits ?? 0, riders.map { $0.stakeUnits ?? 0 }.max() ?? 0) }
        var commence: Date? { LabFormat.parseISO(lead.commence) }
    }
    private func tickets(_ b: LabBoard?) -> [LabBoardTicket] {
        // The tab is resolved once for the list. Asking per ticket re-derived
        // the sports and the next start for every ticket on every redraw.
        let active = activeSport
        return (b?.tickets ?? []).filter { ticket in (active == nil || active == ticket.league) && keeps(ticket) }
    }
    /// One module per play, games and props in one list (founder, Sep 22
    /// 2026: the best bets of the day, three games and four props, all feed
    /// one bankroll; there is no split). By start time, finals last.
    /// The key names the section as well as the play: at the turn of the day
    /// a play moves from today's list to yesterday's, and a bare candidate id
    /// let the lazy stack keep drawing the old card (Sep 25-26 2026: last
    /// night's late plays still read Live and Sealed the next morning, the
    /// grades already on the board).
    private func groups(_ b: LabBoard?, section: String) -> [Group] {
        // Each play's standing and start are read once, then sorted.
        let list = tickets(b).map { ticket -> (group: Group, done: Bool, start: Date) in
            let group = Group(key: "\(section)-\(ticket.candidateID)", lead: ticket, riders: [])
            return (group, isSettled(ticket), group.commence ?? .distantFuture)
        }
        return list.sorted { a, b in
            if a.done != b.done { return !a.done }
            return a.start < b.start
        }.map(\.group)
    }
    /// Today's plays the fan may open. With the paywall preview on, none:
    /// every league reads as locked, the way a non-member sees the page.
    /// The streak pick already has its own module at the top of the card, so
    /// it does not ride the sealed list as well (founder's board showed the
    /// Rays twice on Sep 22: once revealed as the free pick, once sealed).
    private var todayPlays: [Group] {
        guard !WinnersGate.preview else { return [] }
        let free = todayStreakTicket?.candidateID
        return groups(board, section: "today").filter { $0.lead.candidateID != free }
    }
    /// The board includes the exact free ticket. Its card never waits for the
    /// independent streak counters, and never substitutes a different layout.
    private var todayStreakTicket: LabBoardTicket? {
        guard let id = board?.freeCandidateID ?? streak?.today?.candidate_id else { return nil }
        return board?.tickets.first { $0.candidateID == id }
    }
    /// Today's plays still to play, and those already graded or scratched.
    private var todayOpen: [Group] { todayPlays.filter { !isSettled($0.lead) } }
    private var todaySettled: [Group] { todayPlays.filter { isSettled($0.lead) } }
    private func isSettled(_ t: LabBoardTicket) -> Bool { if case .final = state(t) { return true }; return false }
    /// Today's streak pick, graded: it moves under SETTLED with the rest.
    private var streakSettledToday: Bool {
        guard let ticket = todayStreakTicket else { return false }
        return keeps(ticket) && inSport(ticket.league) && isSettled(ticket)
    }
    /// The free streak pick is never a locked module, whoever is reading.
    private var yesterdayPlays: [Group] { groups(yesterdayBoard, section: "yesterday") }
    /// Once one of today's plays has a result, in any sport, yesterday's
    /// plays come off the page (founder, Oct 3 2026). A scratch is not a result.
    private var todayHasResult: Bool {
        (board?.tickets ?? []).contains { !$0.scratched && resultWord($0) != nil }
    }
    /// The boards the server locked (counts only), or with the preview on,
    /// every board on today's card as a non-member would find it.
    private var lockedBoards: [SupabaseAPI.WinnersBoardSummary] {
        let boards: [SupabaseAPI.WinnersBoardSummary]
        if WinnersGate.preview {
            let free = board?.freeCandidateID ?? streak?.today?.candidate_id
            let source = (board?.tickets ?? []).filter { $0.candidateID != free }
            var counts: [String: (league: String, kind: String, count: Int)] = [:]
            for t in source {
                let key = "\(t.league):\(t.kind)"
                counts[key] = (t.league, t.kind, (counts[key]?.count ?? 0) + 1)
            }
            boards = (board?.boards ?? []).filter { $0.locked } + counts.values
                .map { SupabaseAPI.WinnersBoardSummary(league: $0.league, kind: $0.kind, count: $0.count, locked: true) }
        } else {
            boards = board?.boards ?? []
        }
        var byLeague: [String: Int] = [:]
        let active = activeSport
        for b in boards where b.locked && b.count > 0 && (active == nil || active == b.league) {
            byLeague[b.league, default: 0] += b.count
        }
        return byLeague.map { SupabaseAPI.WinnersBoardSummary(league: $0.key, kind: "game", count: $0.value, locked: true) }
            .sorted { $0.league < $1.league }
    }
    /// A tab a sport (founder, Oct 3 2026: "sport and time to break it up"),
    /// behind ALL since Oct 8 2026 (`tabItems`). Yesterday's sports count
    /// while yesterday is still on the page.
    private static let sportOrder = ["MLB", "NFL", "NCAAF", "NBA"]
    private var sports: [String] {
        let today = (board?.tickets ?? []).map(\.league) + (board?.boards ?? []).filter { $0.count > 0 }.map(\.league)
            + windows.map(\.league)
        var leagues = today
        if !todayHasResult { leagues += (yesterdayBoard?.tickets ?? []).map(\.league) }
        var s: [String] = []
        for l in leagues where !s.contains(l) { s.append(l) }
        // Today's sports sit right after ALL; a sport here only for yesterday's results
        // follows (founder, Oct 9 2026: a college-only Friday read ALL MLB NFL NCAAF).
        let playsToday = Set(today)
        let rank = { (l: String) in Self.sportOrder.firstIndex(of: l) ?? Self.sportOrder.count }
        return s.sorted { a, b in
            let ta = playsToday.contains(a), tb = playsToday.contains(b)
            if ta != tb { return ta }
            return rank(a) != rank(b) ? rank(a) < rank(b) : a < b
        }
    }
    /// The sport on screen: the fan's tab, else nil, which is ALL. The page
    /// opens on ALL (founder, Oct 8 2026: "an All page so we can feature the
    /// Streak Pick / Free pick").
    private var activeSport: String? { sports.contains(sport) ? sport : nil }
    private func inSport(_ league: String) -> Bool { activeSport.map { $0 == league } ?? true }
    private static let allTab = "ALL"
    /// ALL first, then a tab a sport, when the day has more than one sport.
    private var tabItems: [String] { sports.count > 1 ? [Self.allTab] + sports : sports }
    private var sportTab: Binding<String> {
        Binding(get: { activeSport ?? Self.allTab }, set: { sport = $0 == Self.allTab ? "" : $0 })
    }

    private struct DayLine { var won = 0, lost = 0, push = 0, open = 0; var units = 0.0 }
    private func dayLine(_ b: LabBoard?, sport: String? = nil) -> DayLine {
        var line = DayLine()
        for t in b?.tickets ?? [] where sport.map({ t.league == $0 }) ?? true {
            let stake = t.stakeUnits ?? 0
            switch resultWord(t) {
            case "won": line.won += 1; line.units += stake * LabFormat.payout(t.price)
            case "lost": line.lost += 1; line.units -= stake
            case "push": line.push += 1
            // A scratched play is off the board: not open, not on the record.
            case "scratched": break
            default: line.open += 1
            }
        }
        return line
    }

    // MARK: - Header, tape, filters

    /// Today's first play has started (founder, Oct 9 2026: "as soon as our first game starts this
    /// should flip to showing today 0-0"), or one already has a result.
    private var todayUnderway: Bool {
        let now = Date()
        return todayHasResult || (board?.tickets ?? []).contains { t in
            !t.scratched && (LabFormat.parseISO(t.commence).map { $0 <= now } ?? false)
        }
    }

    /// The day the record and the bar show: today from the moment its first play starts,
    /// yesterday until then; at midnight today becomes yesterday and it repeats.
    private var shownDayBoard: LabBoard? { todayUnderway ? board : yesterdayBoard }

    private var filtering: Bool { kindFilter != .all || statusFilter != .all }
    /// A play the fan's filter keeps.
    private func keeps(_ t: LabBoardTicket) -> Bool {
        switch kindFilter {
        case .games: if t.isProp { return false }
        case .props: if !t.isProp { return false }
        case .all: break
        }
        var settled: Bool { if case .final = state(t) { return true }; return false }
        switch statusFilter {
        case .open: return !settled
        case .settled: return settled
        case .all: return true
        }
    }

    // MARK: - Content

    /// One pack a locked play, by league.
    private struct LockedPack: Identifiable { let id: String; let league: String }
    private var lockedPacks: [LockedPack] {
        lockedBoards.flatMap { b in (0..<b.count).map { LockedPack(id: "\(b.league)-\($0)", league: b.league) } }
    }
    /// Game times still ahead with no play on the card yet, soonest first, in the league filter.
    /// They no longer get a pack each (founder, Oct 9 2026: a pack per game time "makes it seem
    /// like we will for sure have picks at those times"); before any play lands the day shows
    /// one COMING SOON pack naming the leagues still to play (`pendingLeagues`).
    private var comingPacks: [ComingWindow] {
        guard statusFilter != .settled else { return [] }
        let held = (board?.tickets ?? []).compactMap { t in LabFormat.parseISO(t.commence).map { (t.league, $0) } }
        // Locked counts cannot identify a kickoff. Never describe already
        // published, access-restricted plays as picks that haven't landed.
        let lockedLeagues = Set(lockedBoards.map(\.league))
        let soon = Date().addingTimeInterval(5 * 60)
        let active = activeSport
        return windows
            .filter { window in window.start > soon && (active == nil || active == window.league) }
            .filter { !lockedLeagues.contains($0.league) }
            .filter { w in !held.contains { $0.0 == w.league && abs($0.1.timeIntervalSince(w.start)) < 60 } }
    }

    /// Today's plays still sealed, in page order: the streak pick, then the board.
    private var sealedToday: [Int] {
        var ids: [Int] = []
        if let t = todayStreakTicket, keeps(t), inSport(t.league), !t.scratched, !unveiled.contains(t.candidateID) {
            ids.append(t.candidateID)
        }
        for g in todayPlays where !g.lead.scratched && !unveiled.contains(g.lead.candidateID) { ids.append(g.lead.candidateID) }
        return ids
    }

    /// Opens every sealed play in place, one a second, the page following
    /// each (founder, Sep 24 2026: "one by one... a full second").
    private func revealAll() {
        let ids = sealedToday
        guard !ids.isEmpty, revealTask == nil else { return }
        revealTask = Task { @MainActor in
            for id in ids {
                if Task.isCancelled { break }
                revealTarget = id
                try? await Task.sleep(nanoseconds: 350_000_000)
                withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) {
                    revealing = id
                    markUnveiled(id)
                }
                try? await Task.sleep(nanoseconds: 650_000_000)
            }
            revealing = nil
            revealTarget = nil
            revealTask = nil
        }
    }

    private func startCheckout(_ leagues: [String]) {
        guard AppFlags.purchasesEnabled else { return }
        checkoutError = nil
        Task {
            do {
                let url = try await WinnersAccessStore.checkout(leagues: leagues)
                await MainActor.run { checkoutURL = url }
            } catch {
                await MainActor.run { checkoutError = LabFormat.errorText(error) }
            }
        }
    }
}

extension URL: Identifiable { public var id: String { absoluteString } }

/// The Winners filter: which plays show.
enum PlayKindFilter: CaseIterable {
    case all, games, props
    var title: String { self == .all ? "All plays" : self == .games ? "Game picks" : "Prop picks" }
}
/// The Winners filter: still to play or settled.
enum PlayStatusFilter: CaseIterable {
    case all, open, settled
    var title: String { self == .all ? "Any time" : self == .open ? "Still to play" : "Settled" }
}

/// One game's module: the lead play and the props riding with it.
struct LabPlayModule: View {
    struct Model {
        let lead: LabBoardTicket
        let riders: [LabBoardTicket]
        let units: Double
        let sealed: Bool
        let leadState: WinnersLabView.ModuleState
        let riderStates: [WinnersLabView.ModuleState]
    }
    let group: Model
    /// The streak pick's run; nil on every other play. The streak pick is
    /// the free pick and wears the pack's foil (founder, Oct 30 2026, A2).
    var streak: Int? = nil
    /// Gary's longest run of streak-pick wins.
    var streakBest: Int = 0
    /// False under a time head, which already says when it starts.
    var showsClock: Bool = true
    /// Opening in place right now (REVEAL ALL): gold flies off the tear.
    var celebrate: Bool = false
    let onOpen: (LabBoardTicket) -> Void
    let onReseal: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// One title size for every play (founder, Sep 23 2026: the $25 streak
    /// pick drew a smaller ticket than the rest). The stake says the money.
    private let ticketSize: CGFloat = 32
    /// Every card on the list is one size, game, prop or sealed pack
    /// (founder, Sep 24 2026: "the length and the width need to be
    /// standardized so it can't change across these picks"). Each row has
    /// its own fixed height, scaled with the reader's text size, so no card's
    /// words can make it taller than another's.
    @ScaledMetric(relativeTo: .body) private var headRow: CGFloat = 18
    @ScaledMetric(relativeTo: .body) private var titleRow: CGFloat = 40
    @ScaledMetric(relativeTo: .body) private var stateRow: CGFloat = 24
    private var cardBody: CGFloat { titleRow + 12 + stateRow }
    @ScaledMetric(relativeTo: .body) private var titleNudge: CGFloat = 4.3

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let streak { freePickStrip(streak) }
            // A sealed play gives away nothing (founder, Sep 22 2026: "it
            // shouldn't even say the game until unveiled"). The wrapper wears
            // the league, the clock and the money; the teams arrive with the
            // rip. An open play names itself.
            HStack(spacing: 8) {
                Text(group.lead.league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                if !group.sealed {
                    // Every league reads short ("Colts @ Commanders", schools
                    // for college), so the line fits beside the clock.
                    Text(LabFormat.shortMatchup(group.lead.matchup, league: group.lead.league))
                        .font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                        .clipsWithoutEllipsis()
                }
                Spacer()
                if showsClock {
                    Text(LabFormat.timeET(group.lead.commence)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                }
            }
            .frame(height: headRow)
            .padding(.horizontal, 16).padding(.top, streak == nil ? 13 : 17)

            // Opened in place, the wrapper slides up off the ticket and the
            // ticket settles in under it.
            ZStack(alignment: .top) {
                if group.sealed {
                    sealedBody
                        .transition(.asymmetric(insertion: .opacity, removal: .move(edge: .top).combined(with: .opacity)))
                } else {
                    openBody
                        .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 12)), removal: .opacity))
                }
            }
            .clipped()
            .overlay(alignment: .top) {
                if celebrate && !reduceMotion { LabTearFlecks().padding(.top, 10) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            if streak != nil {
                LabPackSkin(strip: 40, inset: 12)
            } else if group.sealed {
                LabPackSkin(strip: 13 + headRow + 8).transition(.opacity)
            } else {
                LabFoil().transition(.opacity)
            }
        }
        .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.5))
        .shadow(color: .black.opacity(streak != nil ? 0.45 : 0), radius: 13, y: 12)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { onOpen(group.lead) }
        .onLongPressGesture(minimumDuration: 0.6) { onReseal() }
    }

    /// The free pick's tear strip: Gary's mark, FREE PICK, and the streak the
    /// pick rides on, closed by the pack's dashed line.
    private func freePickStrip(_ run: Int) -> some View {
        HStack(spacing: 10) {
            Image(GaryBrand.mark).resizable().scaledToFit()
                .frame(width: 26, height: 26)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .shadow(color: .black.opacity(0.6), radius: 4, y: 3)
            Text("FREE PICK").font(GaryFonts.display(21)).tracking(1.6).foregroundStyle(Color(hex: "#F2D27A"))
                .fixedSize()
            Spacer(minLength: 6)
            HStack(spacing: 0) {
                Text("STREAK \(run)").foregroundStyle(run > 0 ? GaryColors.win : LabInk.dim)
                if streakBest > 0 { Text(" \u{00B7} BEST \(streakBest)").foregroundStyle(LabInk.dim) }
            }
            .font(GaryFonts.display(15)).tracking(1.2)
            .fixedSize()
        }
        .padding(.leading, 14).padding(.trailing, 16)
        .frame(height: 40)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Free pick. Streak \(run)\(streakBest > 0 ? ", best \(streakBest)" : "")")
    }

    /// The wrapper: a sealed pack in the slot the ticket takes once it is
    /// ripped (founder, Sep 22 2026: "have you ever seen a present?"). The
    /// league and the clock ride the top row; the pack itself says nothing
    /// about the game, the money or the play. Those arrive with the rip.
    private var sealedBody: some View {
        LabPack(word: "OPEN")
            .frame(height: cardBody + 12)
            .padding(.top, 8)
    }

    private var openBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            ticketRow(group.lead, state: group.leadState, size: ticketSize, lead: true)
                .frame(height: cardBody)
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
            ForEach(Array(group.riders.enumerated()), id: \.element.candidateID) { index, rider in
                LabHairline().padding(.leading, 16)
                Button { onOpen(rider) } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(width: 12, height: 1).padding(.leading, 4)
                        ticketRow(rider, state: group.riderStates[index], size: 17, lead: false)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Every card on the list is one size, game or prop (founder, Sep 24
    /// 2026: "the length and width of the prop cards... need to be the same
    /// as they are for the game picks"). Two rows: the pick on one line with
    /// the stake beside it, then the state with the stub lying flat beside it.
    /// A pick too long for its line drops the first name or the city
    /// ("VALDEZ 5.5 STRIKEOUTS", "DODGERS -1.5") before it would ever scale.
    private func ticketRow(_ t: LabBoardTicket, state: WinnersLabView.ModuleState, size: CGFloat, lead: Bool) -> some View {
        let ticket = LabFormat.ticketBody(t.pickText)
        let split = LabFormat.splitDirection(ticket, league: t.league)
        let full = split.body.uppercased()
        let short = Self.shortTitle(full, player: t.prop?.player, matchup: t.matchup)
        let font = GaryFonts.display(lead ? size - 2 : size)
        return VStack(alignment: .leading, spacing: lead ? 12 : 3) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                ViewThatFits(in: .horizontal) {
                    Text(full).font(font).fixedSize()
                    Text(short).font(font).fixedSize()
                    Text(short).font(font).fitsOneLine()
                }
                .foregroundStyle(GaryColors.warmWhite)
                .accessibilityLabel("\(ticket) \(LabFormat.price(t.price))")
                Spacer(minLength: 6)
                LabUnitStamp(units: t.stakeUnits, size: lead ? 26 : 17)
            }
            .frame(height: lead ? titleRow : nil)
            // Bebas's capitals sit high in their line: the row is lowered so
            // the pick reads exactly halfway between the top row and the
            // result (founder, Sep 24 2026; measured, 13px low at 3x).
            .offset(y: lead ? titleNudge : 0)
            HStack(alignment: .center, spacing: 10) {
                stateLine(state, prop: t.prop)
                Spacer(minLength: 6)
                if split.direction != nil || t.price != nil {
                    LabTicketStub(direction: split.direction, book: split.direction == nil ? Self.bestBook(t) : nil,
                                  price: t.price, size: lead ? 15 : 11)
                        .accessibilityHidden(true)
                }
            }
            .frame(height: lead ? stateRow : nil)
        }
    }

    /// The book with the best price for a game pick when it was made: the
    /// first of the pick's books, the order the Picks page reads it in.
    static func bestBook(_ t: LabBoardTicket) -> String? {
        guard let raw = t.game?.sportsbook_odds?.first?.book, !raw.isEmpty else { return nil }
        return LabFormat.bookName(raw)
    }

    /// The pick with the player's first name or the club's city dropped. A
    /// first-inning ticket names no player, so it is never shortened ("No Run
    /// 1st Inning" read "RUN 1ST INNING", Oct 9 2026).
    static func shortTitle(_ full: String, player: String?, matchup: String) -> String {
        if full.uppercased().hasSuffix("RUN 1ST INNING") { return full }
        if let player, !player.isEmpty, full.hasPrefix(player.uppercased()) {
            let last = PlayerName.split(player).last.uppercased()
            return last + full.dropFirst(player.count)
        }
        for side in matchup.components(separatedBy: " @ ") {
            let nick = LabFormat.nickname(side.trimmingCharacters(in: .whitespaces)).uppercased()
            if !nick.isEmpty, let r = full.range(of: nick), r.lowerBound != full.startIndex {
                return String(full[r.lowerBound...])
            }
        }
        return full
    }

    @ViewBuilder
    private func stateLine(_ state: WinnersLabView.ModuleState, prop: PropPick?) -> some View {
        switch state {
        case .final(let result, let score):
            HStack(spacing: 8) {
                LabStateWord(text: result == "won" ? "Win" : result == "lost" ? "Loss" : result.capitalized,
                             color: result == "won" ? GaryColors.win : result == "lost" ? GaryColors.loss : GaryColors.silver, size: 15)
                if let score { Text(prop != nil ? LabFormat.countWords(score, market: prop?.prop) : score).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(LabInk.dim) }
            }
        case .live(let detail, let score):
            HStack(spacing: 8) {
                LabStateWord(text: detail.uppercased() == "FINAL" ? "Final" : "Live", color: detail.uppercased() == "FINAL" ? GaryColors.silver : GaryColors.sweating, pulse: detail.uppercased() != "FINAL", size: 15)
                if let score { Text(score).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(LabInk.dim) }
                if detail.uppercased() != "FINAL" { Text(detail).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim) }
            }
        case .sealed(let commence):
            HStack(spacing: 8) {
                LabStateWord(text: "Sealed", color: GaryColors.gold, size: 15)
                LabCountdown(commence: commence)
            }
        }
    }
}

/// One box of the streak form guide: a result (W, L, push), the box a pick
/// card fills when a fan adds it (open, with its plus), a day still to come
/// on the form guide (blank), or a pick waiting on its game.
struct StreakBox: View {
    enum Kind {
        case win, loss, push, open, blank, pending
        /// A streak bet's box from its status (pending | won | lost | push | void).
        init(status: String) {
            switch status {
            case "won": self = .win
            case "lost": self = .loss
            case "push", "void": self = .push
            default: self = .pending
            }
        }
    }
    let kind: Kind
    /// The empty box's dashes, in the card's quiet ink.
    var idle: Color = .white.opacity(0.45)

    var body: some View {
        ZStack {
            switch kind {
            case .win: RoundedRectangle(cornerRadius: 2).fill(GaryColors.win)
            case .loss: RoundedRectangle(cornerRadius: 2).fill(GaryColors.loss)
            case .push: RoundedRectangle(cornerRadius: 2).fill(GaryColors.silver.opacity(0.7))
            case .pending: RoundedRectangle(cornerRadius: 2).fill(GaryColors.gold)
            case .open, .blank: RoundedRectangle(cornerRadius: 2).stroke(idle, style: StrokeStyle(lineWidth: 1, dash: [2, 1.5]))
            }
            switch kind {
            case .win: letter("W", "#0B1A0E")
            case .loss: letter("L", "#2A0B0C")
            case .push: letter("P", "#1A1917")
            case .pending: letter("?", "#1A1406")
            case .open: Image(systemName: "plus").font(.system(size: 7, weight: .bold)).foregroundStyle(idle)
            case .blank: EmptyView()
            }
        }
        .frame(width: 13, height: 13)
        .accessibilityHidden(true)
    }

    private func letter(_ s: String, _ ink: String) -> some View {
        Text(s).font(GaryFonts.display(10)).foregroundStyle(Color(hex: ink))
    }
}

/// The foil pack a Winners play wears before it is ripped (founder, Sep 22
/// 2026: "have you ever seen a present?"): Gary's mark and one word, on the
/// LabPackSkin that covers the card. OPEN on a play to rip; COMING SOON on a
/// game time whose play hasn't landed; UNLOCK, with the lock, on a play
/// behind the paywall.
struct LabPack: View {
    let word: String
    var lock: Bool = false
    /// Today's board is still on its way: the pack turns where its word goes.
    var waiting: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                Image(GaryBrand.mark).resizable().scaledToFit()
                    .frame(width: 34, height: 34)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .shadow(color: .black.opacity(0.6), radius: 8, y: 4)
                if lock {
                    Image(systemName: "lock.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(Color(hex: "#15110A"))
                        .frame(width: 18, height: 18)
                        .background(Circle().fill(GaryColors.gold))
                        .offset(x: 6, y: 6)
                }
            }
            if waiting {
                ProgressView().tint(GaryColors.warmGold)
            } else {
                Text(word).font(GaryFonts.display(22)).tracking(3).foregroundStyle(GaryColors.warmGold)
                    .fitsOneLine()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The pack's gold foil (founder, Oct 30 2026: "make all the pick cards on
/// Winners this background"): every card on the list wears it.
struct LabFoil: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(LinearGradient(stops: [.init(color: Color(hex: "#0D0C0B"), location: 0), .init(color: Color(hex: "#2A2416"), location: 0.26),
                                         .init(color: Color(hex: "#0F0E0C"), location: 0.5), .init(color: Color(hex: "#3A3018"), location: 0.76),
                                         .init(color: Color(hex: "#0D0C0B"), location: 1)],
                                 startPoint: UnitPoint(x: 0, y: 0.2), endPoint: UnitPoint(x: 1, y: 0.8)))
    }
}

/// A pack over the whole card (founder, Oct 30 2026, "the pack is the
/// card"): the foil, and the strip that tears along the top, a little
/// lighter, closed by its dashed line.
struct LabPackSkin: View {
    let strip: CGFloat
    /// How far the dashed line stays off the card's sides.
    var inset: CGFloat = 0
    var body: some View {
        ZStack(alignment: .top) {
            LabFoil()
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#1B1712"), Color(hex: "#3A3018"), Color(hex: "#1B1712")], startPoint: .leading, endPoint: .trailing))
                .frame(height: strip + 10)
                .overlay(alignment: .bottom) {
                    DashedLine().stroke(GaryColors.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                        .frame(height: 1).padding(.horizontal, inset)
                }
                .offset(y: -10)
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// A pack that isn't a play yet: a game time still to come (COMING SOON)
/// or a play behind the paywall (UNLOCK). The same card, the same size, as
/// a sealed play on the list.
struct LabPackCard: View {
    let league: String
    let clock: String?
    let word: String
    var lock: Bool = false
    var waiting: Bool = false
    var action: (() -> Void)? = nil
    @ScaledMetric(relativeTo: .body) private var headRow: CGFloat = 18
    @ScaledMetric(relativeTo: .body) private var titleRow: CGFloat = 40
    @ScaledMetric(relativeTo: .body) private var stateRow: CGFloat = 24

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                Spacer()
                if let clock { Text(clock).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim) }
            }
            .frame(height: headRow)
            .padding(.horizontal, 16).padding(.top, 13)
            LabPack(word: word, lock: lock, waiting: waiting)
                .frame(height: titleRow + 12 + stateRow + 12)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LabPackSkin(strip: 13 + headRow + 8))
        .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.5))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { action?() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(waiting ? "Loading today's plays" : lock ? "\(league) play, unlock" : "\(league) play at \(clock ?? ""), coming soon")
        .accessibilityAddTraits(action == nil ? [] : .isButton)
    }
}

/// A game time on today's slate: the packs still to come.
struct ComingWindow: Identifiable, Equatable {
    let league: String
    let start: Date
    var id: String { "\(league)-\(start.timeIntervalSince1970)" }
    var clock: String { LabFormat.timeET(ISO8601DateFormatter().string(from: start)) }

    /// One window a league and start time, from the day's board.
    static func from(_ board: TomorrowBoard) -> [ComingWindow] {
        var seen = Set<String>()
        return board.board.compactMap { row -> ComingWindow? in
            // College games are Winners games too (founder, Oct 9 2026: a college-only Friday showed no packs),
            // and so are NBA games from the Oct 20 2026 opener (an NBA-only night showed no NBA pack or tab).
            guard let lg = row.league?.uppercased(), ["MLB", "NFL", "NCAAF", "NBA"].contains(lg),
                  let start = LabFormat.parseISO(row.commence_time) else { return nil }
            let w = ComingWindow(league: lg, start: start)
            return seen.insert(w.id).inserted ? w : nil
        }
        .sorted { $0.start < $1.start }
    }
}

/// The gold rule under the Winners header, made of the day's plays (founder
/// GO, Oct 7 2026, mock 38): one segment a play in game order, as long as its
/// bet, green won, red lost, grey push; a play still to come is a short gold
/// dash of one size, so a sealed play's bet is not given away. The rest of
/// the rule stays the gold hairline.
struct LabDayBar: View {
    enum Tone: Equatable { case won, lost, push, open }
    struct Segment: Identifiable, Equatable {
        let id: Int
        let units: Double
        let tone: Tone
    }
    let segments: [Segment]

    var body: some View {
        GeometryReader { geo in
            let widths = Self.widths(segments, width: geo.size.width)
            HStack(spacing: 3) {
                ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                    piece(segment.tone).frame(width: widths[index], height: 3)
                }
                Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(height: 1)
            }
            .frame(height: geo.size.height)
        }
        .frame(height: segments.isEmpty ? 1 : 3)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func piece(_ tone: Tone) -> some View {
        switch tone {
        case .won: RoundedRectangle(cornerRadius: 1).fill(GaryColors.win)
        case .lost: RoundedRectangle(cornerRadius: 1).fill(GaryColors.loss)
        case .push: RoundedRectangle(cornerRadius: 1).fill(GaryColors.silver.opacity(0.7))
        case .open: DayBarDash().stroke(GaryColors.gold.opacity(0.75), style: StrokeStyle(lineWidth: 3, dash: [4, 3]))
        }
    }

    /// 30 points for a one-unit bet, scaled down so the plays never take more
    /// than about seven tenths of the rule; a play still to come counts as one unit.
    static func widths(_ segments: [Segment], width: CGFloat) -> [CGFloat] {
        guard !segments.isEmpty else { return [] }
        let units = segments.map { $0.tone == .open ? 1 : max(0.5, $0.units) }
        let budget = max(0, width * 0.7 - CGFloat(segments.count) * 3)
        let scale = min(30, budget / CGFloat(units.reduce(0, +)))
        return units.map { max(5, CGFloat($0) * scale) }
    }
}

private struct DayBarDash: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/// Gary's money over his last ten plays and his run, by the profile on the
/// Winners header (founder GO, Oct 7 2026, mock 42). The dot is green on a
/// winning run, red on a losing one.
struct WinnersRunSpark: View {
    let run: WinnersRun

    private var tint: Color {
        run.run_result == nil ? GaryColors.silver : run.won ? GaryColors.win : GaryColors.loss
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 3) {
            if run.recent.count >= 2 {
                Canvas { context, size in
                    let points = Self.points(run.recent, in: size)
                    var line = Path()
                    line.addLines(points)
                    context.stroke(line, with: .color(GaryColors.warmWhite.opacity(0.6)),
                                   style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                    if let last = points.last {
                        context.fill(Path(ellipseIn: CGRect(x: last.x - 2.4, y: last.y - 2.4, width: 4.8, height: 4.8)),
                                     with: .color(tint))
                    }
                }
                .frame(width: 54, height: 18)
            }
            if !run.label.isEmpty {
                Text(run.label).font(GaryFonts.display(11.5)).tracking(0.6).foregroundStyle(tint)
            }
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    /// The running total from before the first of the plays, so the first
    /// play's move shows too.
    static func points(_ recent: [Double], in size: CGSize) -> [CGPoint] {
        var total = 0.0
        let values = [0.0] + recent.map { total += $0; return total }
        let top = values.max() ?? 0, bottom = values.min() ?? 0
        let span = max(top - bottom, 0.0001)
        let inset: CGFloat = 2.5
        let step = (size.width - inset * 2) / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            CGPoint(x: inset + CGFloat(index) * step,
                    y: inset + CGFloat((top - value) / span) * (size.height - inset * 2))
        }
    }

    private var accessibilityText: String {
        var parts: [String] = []
        if run.run_result != nil, run.run_count > 0 {
            parts.append("Gary has \(run.won ? "won" : "lost") \(run.run_count) straight")
        }
        if !run.recent.isEmpty {
            parts.append("last \(run.recent.count) plays \(LabFormat.unitsNet(run.recent.reduce(0, +)))")
        }
        return parts.joined(separator: ", ")
    }
}

