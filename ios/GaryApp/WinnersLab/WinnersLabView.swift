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
                GaryStageBackground()
                ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        header
                        if !showsRecap && todayHasResult {
                            resultsTicker.padding(.top, 10).pageGutter()
                        }
                        // Yesterday's line rides the header, between the date and
                        // the profile (founder, Sep 23 2026), so the page starts
                        // higher. The sport tabs ride TODAY's row (Sep 24); they
                        // take a row of their own only above yesterday's recap.
                        if sports.count > 1 && showsRecap {
                            LabTextTabs(items: tabItems, selected: sportTab, size: 14).padding(.top, 10).pageGutter()
                        }
                        content.padding(.top, 12)
                        Color.clear.frame(height: 170)
                    }
                    // The lamp hangs over today's first plays and scrolls with them.
                    .background(alignment: .top) { StageLamp(radius: 380).offset(y: -130) }
                }
                .refreshable { await load() }
                .onChange(of: revealTarget) { id in
                    guard let id else { return }
                    // The streak pick rides its own card; every other play is keyed
                    // by its section (see `groups`).
                    let target = id == todayStreakTicket?.candidateID ? "streak-\(id)" : "today-\(id)"
                    withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(target, anchor: .center) }
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
        if !quiet || board == nil { loading = board == nil }
        let yesterday = LabFormat.yesterday(of: want)
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
        guard let fresh = try? await SupabaseAPI.fetchWinnersRun(),
              accepts(generation, date: want, account: account) else { return }
        if fresh != run { run = fresh }
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
        var leagues = (board?.tickets ?? []).map(\.league) + (board?.boards ?? []).filter { $0.count > 0 }.map(\.league)
            + windows.map(\.league)
        if !todayHasResult { leagues += (yesterdayBoard?.tickets ?? []).map(\.league) }
        var s: [String] = []
        for l in leagues where !s.contains(l) { s.append(l) }
        let rank = { (l: String) in Self.sportOrder.firstIndex(of: l) ?? Self.sportOrder.count }
        return s.sorted { rank($0) != rank($1) ? rank($0) < rank($1) : $0 < $1 }
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

    /// The header (founder GO, Oct 7 2026, from mocks 38, 39 and 42): the
    /// logo is hot Gary on a winning run of two or more and cold Gary on a
    /// losing one; a small line of his money over his last ten plays, with the
    /// run, sits by the profile; the gold rule under it is the day's plays,
    /// each as long as its bet. The day's record and money ride TODAY's row.
    private var header: some View {
        GaryPageHeader(title: "Winners", accentMenu: AnyView(
            Text(LabFormat.shortDateWords(today))
                .font(GaryFonts.kicker(11)).foregroundStyle(.white.opacity(0.55))
                .fixedSize()),
            rule: AnyView(LabDayBar(segments: dayBarSegments)),
            mark: runMark,
            markSize: 52,
            trailing: {
                if let run { WinnersRunSpark(run: run) }
            })
    }

    private var runMark: String {
        guard let run, run.run_count >= 2 else { return GaryBrand.mark }
        return run.won ? "GaryFire" : "GaryIceCold"
    }

    /// The day the record and the bar show: today once a play of today's has
    /// a result, yesterday until then.
    private var shownDayBoard: LabBoard? { todayHasResult ? board : yesterdayBoard }

    private var dayBarSegments: [LabDayBar.Segment] {
        (shownDayBoard?.tickets ?? []).filter { !$0.scratched }
            .sorted { a, b in
                let ta = LabFormat.parseISO(a.commence) ?? .distantFuture
                let tb = LabFormat.parseISO(b.commence) ?? .distantFuture
                return ta == tb ? a.candidateID < b.candidateID : ta < tb
            }
            .map { t in
                let tone: LabDayBar.Tone
                switch resultWord(t) {
                case "won": tone = .won
                case "lost": tone = .lost
                case "push": tone = .push
                default: tone = .open
                }
                return LabDayBar.Segment(id: t.candidateID, units: t.stakeUnits ?? 1, tone: tone)
            }
    }

    /// The day's record and money on TODAY's row (founder, Oct 7 2026, mock
    /// 35), across every sport: today's once a play of today's has a result;
    /// before that yesterday's, marked so in small type.
    @ViewBuilder private func dayNumbers(size: CGFloat) -> some View {
        let isToday = todayHasResult
        let line = dayLine(shownDayBoard)
        if line.won + line.lost + line.push > 0 {
            let tint = line.units > 0.049 ? GaryColors.win : line.units < -0.049 ? GaryColors.loss : GaryColors.silver
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                if !isToday {
                    Text("Yesterday").font(GaryFonts.kicker(10.5)).foregroundStyle(LabInk.dim)
                }
                Text("\(line.won)-\(line.lost)\(line.push > 0 ? "-\(line.push)" : "")")
                    .font(GaryFonts.display(size)).foregroundStyle(GaryColors.warmWhite).monospacedDigit()
                Text(LabFormat.unitsNet(line.units))
                    .font(GaryFonts.display(size)).foregroundStyle(tint).monospacedDigit()
                    .shadow(color: tint.opacity(0.55), radius: 6)
            }
            .fixedSize()
            .accessibilityElement(children: .combine)
        }
    }

    /// THE TICKER (founder, Oct 4 2026, mock 31 "slim ticker"): a slim strip
    /// under the header once today has a result; each result runs past,
    /// latest game first. The day's record and money moved to TODAY's row
    /// (Oct 7 2026), so the strip no longer repeats them.
    private var resultsTicker: some View {
        let items: [LabResultsTicker.Item] = (board?.tickets ?? [])
            .filter { !$0.scratched && ["won", "lost", "push"].contains(resultWord($0) ?? "") }
            .sorted { (LabFormat.parseISO($0.commence) ?? .distantPast) > (LabFormat.parseISO($1.commence) ?? .distantPast) }
            .map { t in
                let stake = t.stakeUnits ?? 0
                let word = resultWord(t) ?? ""
                let net = word == "won" ? stake * LabFormat.payout(t.price) : word == "lost" ? -stake : 0
                return LabResultsTicker.Item(
                    id: t.candidateID,
                    word: word == "won" ? "WIN" : word == "lost" ? "LOSS" : "PUSH",
                    color: word == "won" ? GaryColors.win : word == "lost" ? GaryColors.loss : GaryColors.silver,
                    pick: LabPlayModule.shortTitle(LabFormat.ticketBody(t.pickText).uppercased(), player: t.prop?.player, matchup: t.matchup),
                    amount: word == "push" ? "$0" : LabFormat.unitsNet(net))
            }
        return LabResultsTicker(items: items, running: refreshActive)
    }

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

    @ViewBuilder
    private var content: some View {
        if loading && board == nil {
            HStack { Spacer(); ProgressView().tint(GaryColors.gold).scaleEffect(1.2); Spacer() }.padding(.top, 60)
        } else if let error, board == nil {
            VStack(spacing: 8) {
                Text(error).font(GaryFonts.ui(12)).foregroundStyle(LabInk.dim).multilineTextAlignment(.center)
                Button("TRY AGAIN") { Task { await load() } }
                    .font(GaryFonts.display(15)).foregroundStyle(GaryColors.gold)
            }
            .frame(maxWidth: .infinity).padding(.top, 40).pageGutter()
        } else {
            LazyVStack(alignment: .leading, spacing: 12) {
                if error != nil || yesterdayError != nil {
                    Button(error ?? yesterdayError ?? "Try again") { Task { await load(quiet: true) } }
                        .font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.gold)
                        .frame(minHeight: 44)
                        .accessibilityHint("Tap to retry. Previously loaded content stays visible.")
                }
                if showsRecap {
                    // Until 10 AM ET, before today's first play (founder, Sep 24
                    // 2026): the top is yesterday's day, then its plays.
                    yesterdayRecap
                    if let msg = checkoutError { Text(msg).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }
                    resultRows(yesterdayPlays.map(\.lead), section: "yesterday")
                } else {
                    todayHead
                    if !streakSettledToday, let ticket = todayStreakTicket { streakCard(ticket) }
                    // A play behind the paywall is its own pack: the fan sees
                    // each one waiting and taps to unlock it.
                    ForEach(AppFlags.purchasesEnabled ? lockedPacks : []) { pack in
                        LabPackCard(league: pack.league, clock: nil, word: "UNLOCK", lock: true) {
                            plansFocus = pack.league; showPlans = true
                        }
                    }
                    if !AppFlags.purchasesEnabled, !lockedBoards.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Some Winners plays are locked for this account.")
                                .font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                            Button {
                                if authManager.isAuthenticated {
                                    Task { await access.refresh(); await load(quiet: true) }
                                } else {
                                    NotificationCenter.default.post(name: Notification.Name("ShowProfile"), object: nil)
                                }
                            } label: {
                                Text(authManager.isAuthenticated ? "REFRESH ACCESS ›" : "SIGN IN ›")
                                    .font(GaryFonts.ui(12, .semibold)).foregroundStyle(GaryColors.gold)
                                    .fixedSize(horizontal: false, vertical: true).frame(minHeight: 44)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    // The plays still to play under their start times (founder,
                    // Oct 3 2026: "sport and time to break it up"). The game
                    // times still ahead wear the pack before their play lands;
                    // it says so instead of OPEN. A fan who isn't a member can
                    // unlock from any of them.
                    ForEach(openSlots) { slot in
                        timeHead(slot.clock)
                        ForEach(slot.groups) { group in module(group, sealable: true) }
                        ForEach(slot.coming) { w in
                            LabPackCard(league: w.league, clock: w.clock, word: "COMING SOON",
                                        action: isMember || !AppFlags.purchasesEnabled ? nil : { plansFocus = w.league; showPlans = true })
                        }
                    }
                    if filtering && todayPlays.isEmpty && todayStreakTicket.map({ keeps($0) && inSport($0.league) }) != true && lockedBoards.isEmpty {
                        Text("NO PLAYS").font(GaryFonts.display(14)).tracking(1.2).foregroundStyle(LabInk.dimmer)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                    }
                    if let msg = checkoutError { Text(msg).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }

                    // Today's graded plays sit under their own break, below
                    // everything still to play (founder, Sep 29 2026), one line
                    // each (Oct 3 2026).
                    if !todaySettled.isEmpty || streakSettledToday {
                        sectionHead("SETTLED", note: nil).padding(.top, 18)
                        resultRows((streakSettledToday ? [todayStreakTicket].compactMap { $0 } : []) + todaySettled.map(\.lead), section: "settled")
                    }

                    if !yesterdayPlays.isEmpty && !todayHasResult {
                        sectionHead("YESTERDAY", note: LabFormat.shortDateWords(LabFormat.yesterday(of: today))).padding(.top, 18)
                        resultRows(yesterdayPlays.map(\.lead), section: "yesterday")
                    }
                }
            }
            .pageGutter()
        }
    }

    /// The page turns over at 10 AM ET (founder, Sep 24 2026): until then,
    /// and until today's first play lands, yesterday leads; from then today's
    /// packs lead and yesterday drops below.
    private var todayLeads: Bool {
        if !todayPlays.isEmpty || !lockedBoards.isEmpty || todayStreakTicket != nil { return true }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return cal.component(.hour, from: Date()) >= 10
    }
    private var showsRecap: Bool { !todayLeads && !yesterdayPlays.isEmpty }
    /// A member (paid, founding or preview access), unless the paywall
    /// preview is on to show the page as a non-member finds it.
    private var isMember: Bool {
        guard !WinnersGate.preview, let snap = access.snapshot else { return false }
        return snap.isFreeAccess || !snap.sports.isEmpty
    }

    /// One pack a locked play, by league.
    private struct LockedPack: Identifiable { let id: String; let league: String }
    private var lockedPacks: [LockedPack] {
        lockedBoards.flatMap { b in (0..<b.count).map { LockedPack(id: "\(b.league)-\($0)", league: b.league) } }
    }
    /// Game times still ahead with no play on the card yet, soonest first,
    /// three at most, in the league filter.
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
            .prefix(3).map { $0 }
    }

    /// One start time on today's card: its plays, then its packs still to land.
    private struct TimeSlot: Identifiable {
        let clock: String
        let start: Date
        var groups: [Group] = []
        var coming: [ComingWindow] = []
        var id: String { "slot-\(clock)" }
    }
    private var openSlots: [TimeSlot] {
        var slots: [String: TimeSlot] = [:]
        for g in todayOpen {
            let clock = LabFormat.timeET(g.lead.commence)
            slots[clock, default: TimeSlot(clock: clock, start: g.commence ?? .distantFuture)].groups.append(g)
        }
        for w in comingPacks {
            slots[w.clock, default: TimeSlot(clock: w.clock, start: w.start)].coming.append(w)
        }
        return slots.values.sorted { $0.start < $1.start }
    }
    @ViewBuilder private func timeHead(_ clock: String) -> some View {
        if !clock.isEmpty {
            HStack(spacing: 10) {
                Text(clock).font(GaryFonts.display(15)).tracking(1).foregroundStyle(LabInk.dim).fixedSize()
                LabHairline()
            }
            .padding(.top, 8)
            .accessibilityAddTraits(.isHeader)
        }
    }

    /// Settled plays one line each (founder, Oct 3 2026: when games are done
    /// "they kinda all run together"): the result, the pick and the money.
    /// A tap opens the play. The section names the row, so a play that moves
    /// from the open list never keeps its old live card.
    private func resultRows(_ tickets: [LabBoardTicket], section: String) -> some View {
        VStack(spacing: 0) {
            ForEach(tickets, id: \.candidateID) { t in
                resultRow(t).id("\(section)-\(t.candidateID)")
            }
        }
    }
    private func resultRow(_ t: LabBoardTicket) -> some View {
        let word = resultWord(t)
        let label: String, tint: Color, money: String
        let stake = t.stakeUnits ?? 0
        switch word {
        case "won"?: label = "WIN"; tint = GaryColors.win; money = LabFormat.unitsNet(stake * LabFormat.payout(t.price))
        case "lost"?: label = "LOSS"; tint = GaryColors.loss; money = LabFormat.unitsNet(-stake)
        case "push"?: label = "PUSH"; tint = GaryColors.silver; money = "$0"
        case "scratched"?: label = "SCRATCHED"; tint = LabInk.dimmer; money = ""
        case .some(let other): label = other.uppercased(); tint = GaryColors.silver; money = ""
        case .none: label = "PENDING"; tint = LabInk.dim; money = ""
        }
        let title = LabPlayModule.shortTitle(LabFormat.ticketBody(t.pickText).uppercased(), player: t.prop?.player, matchup: t.matchup)
        return Button { path.append(LabRoute.play(t.candidateID)) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(label).font(GaryFonts.display(15)).tracking(0.8).foregroundStyle(tint)
                    .frame(width: 58, alignment: .leading)
                Text(title).font(GaryFonts.display(18)).foregroundStyle(word == "scratched" ? LabInk.dim : GaryColors.warmWhite)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Text(money).font(GaryFonts.display(18)).monospacedDigit()
                    .foregroundStyle(word == "won" ? GaryColors.win : word == "lost" ? GaryColors.loss : GaryColors.silver)
                    .fixedSize()
            }
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { LabHairline() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the play")
    }

    /// YESTERDAY in the space under the header, plain (founder, Sep 24 2026:
    /// "very subtle, straightforward, simple... take it all out of
    /// containers"): the date, the record and the money, and word that
    /// today's plays are on the way.
    private var yesterdayRecap: some View {
        let line = dayLine(yesterdayBoard)
        let decided = line.won + line.lost + line.push > 0
        let tint = line.units > 0.049 ? GaryColors.win : line.units < -0.049 ? GaryColors.loss : GaryColors.silver
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("YESTERDAY").font(GaryFonts.display(15)).tracking(1.4).foregroundStyle(GaryColors.gold)
                Text(LabFormat.shortDateWords(LabFormat.yesterday(of: today))).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
            }
            if decided {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("\(line.won)-\(line.lost)\(line.push > 0 ? "-\(line.push)" : "")")
                        .font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite).monospacedDigit()
                    Text(LabFormat.unitsNet(line.units)).font(GaryFonts.display(30)).foregroundStyle(tint).monospacedDigit()
                    if line.open > 0 { Text("\(line.open) OPEN").font(GaryFonts.display(15)).tracking(1).foregroundStyle(GaryColors.sweating) }
                }
            } else if line.open > 0 {
                Text("\(line.open) PENDING").font(GaryFonts.display(15)).foregroundStyle(LabInk.dim)
            }
            Text("Gary's \(LabFormat.weekdayWord(today)) plays are on the way.")
                .font(GaryFonts.ui(13, .medium)).foregroundStyle(LabInk.dim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
        .accessibilityElement(children: .combine)
    }

    /// TODAY, the league filter and the day's line on one row right under
    /// the header (founder, Sep 24 2026: "all that's on one line, or one
    /// row... everything is basically moving up"). The filter sits toward
    /// the middle of the page.
    /// TODAY, the league tabs, REVEAL ALL and the filter on one row (founder,
    /// Sep 24 2026: "I don't want that to bring everything down a line").
    /// The day's record and money ride this row, before the filter (Oct 7 2026).
    private var todayHead: some View {
        ViewThatFits(in: .horizontal) {
            todayRow(tab: 14, spacing: 12, numbers: 18)
            todayRow(tab: 12.5, spacing: 8, numbers: 16)
            todayRow(tab: 12.5, spacing: 6, numbers: 14)
        }
        .padding(.top, 2)
    }

    private func todayRow(tab: CGFloat, spacing: CGFloat, numbers: CGFloat) -> some View {
        HStack(alignment: .center, spacing: spacing) {
            Text("TODAY").font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold).fixedSize()
            Spacer(minLength: 4)
            if sports.count > 1 {
                LabTextTabs(items: tabItems, selected: sportTab, size: tab).fixedSize()
                Spacer(minLength: 4)
            }
            if sealedToday.count > 1 || revealTask != nil {
                Button(action: revealAll) {
                    Text("REVEAL ALL").font(GaryFonts.display(13)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold.opacity(revealTask == nil ? 0.85 : 0.4))
                        .fixedSize()
                        .padding(.vertical, 6).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(revealTask != nil)
                .accessibilityLabel("Reveal all of today's plays")
            }
            dayNumbers(size: numbers)
            filterMenu
        }
    }

    /// The filter every app has: game picks or props, open or settled.
    private var filterMenu: some View {
        Menu {
            Section("Show") {
                Picker("Show", selection: $kindFilter) {
                    ForEach(PlayKindFilter.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.inline).labelsHidden()
            }
            Section("Status") {
                Picker("Status", selection: $statusFilter) {
                    ForEach(PlayStatusFilter.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.inline).labelsHidden()
            }
        } label: {
            Image(systemName: filtering ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(filtering ? GaryColors.gold : LabInk.dim)
                .frame(width: 28, height: 28).contentShape(Rectangle())
        }
        .accessibilityLabel(filtering ? "Filter, on" : "Filter")
    }

    private func sectionHead(_ title: String, note: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold)
            Spacer()
            if let note { Text(note).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim) }
        }
        .padding(.top, 2)
    }

    /// Every ticket uses the same current card, including the free streak pick.
    /// On ALL it leads the page under its own heading (founder, Oct 8 2026),
    /// the same card at the same size; on its sport's tab it rides the top as before.
    @ViewBuilder private func streakCard(_ ticket: LabBoardTicket) -> some View {
        if keeps(ticket) && inSport(ticket.league) {
            VStack(alignment: .leading, spacing: 8) {
                if activeSport == nil { sectionHead("FREE PICK", note: nil) }
                module(Group(key: "streak-\(ticket.candidateID)", lead: ticket, riders: []),
                       sealable: true, streak: streak?.current ?? 0,
                       streakPending: !isSettled(ticket))
            }
            .id("streak-\(ticket.candidateID)")
        }
    }

    private func module(_ group: Group, sealable: Bool, streak: Int? = nil, streakPending: Bool = false) -> some View {
        // A scratched play is no longer a play: it never unveils as one.
        let sealed = sealable && !unveiled.contains(group.lead.candidateID) && !group.lead.scratched
        return LabPlayModule(group: LabPlayModule.Model(
            lead: group.lead, riders: group.riders, units: group.units, sealed: sealed,
            leadState: state(group.lead), riderStates: group.riders.map { state($0) }),
            streak: streak,
            streakRecent: streak == nil ? [] : (self.streak?.recent ?? []),
            streakPending: streakPending,
            celebrate: revealing == group.lead.candidateID,
            onOpen: { ticket in
                if sealed { unveil = group.lead } else { path.append(LabRoute.play(ticket.candidateID)) }
            },
            onReseal: { if !sealed { reseal(group.lead.candidateID) } })
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
    /// The streak pick's run; nil on every other play.
    var streak: Int? = nil
    /// The streak's last decided results, oldest first ("W" / "L").
    var streakRecent: [String] = []
    /// The streak pick is today's and its game hasn't been graded.
    var streakPending: Bool = false
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
            // A sealed play gives away nothing (founder, Sep 22 2026: "it
            // shouldn't even say the game until unveiled"). The wrapper wears
            // the league, the clock and the money; the teams arrive with the
            // rip. An open play names itself.
            HStack(spacing: 8) {
                if let streak { StreakForm(count: streak, recent: streakRecent, pending: streakPending) }
                Text(group.lead.league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                if !group.sealed {
                    // Every league reads short ("Colts @ Commanders", schools
                    // for college), so the line fits beside the clock.
                    Text(LabFormat.shortMatchup(group.lead.matchup, league: group.lead.league))
                        .font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                        .clipsWithoutEllipsis()
                }
                Spacer()
                Text(LabFormat.timeET(group.lead.commence)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
            }
            .frame(height: headRow)
            .padding(.horizontal, 16).padding(.top, 13)

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
        .labPlate(radius: 14, edge: group.sealed ? GaryColors.gold.opacity(0.4) : LabInk.hair)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { onOpen(group.lead) }
        .onLongPressGesture(minimumDuration: 0.6) { onReseal() }
    }

    /// The wrapper: a sealed pack in the slot the ticket takes once it is
    /// ripped (founder, Sep 22 2026: "have you ever seen a present?"). The
    /// league and the clock ride the top row; the pack itself says nothing
    /// about the game, the money or the play. Those arrive with the rip.
    private var sealedBody: some View {
        LabPack(word: "OPEN")
            .frame(height: cardBody)
            .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
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

/// THE STREAK MARK: a form guide (founder, Sep 24 2026, choosing it from
/// the mocks over the flame). Five boxes, oldest on the left: the decided
/// results as W and L, today's pick in gold while it waits, and dashed blanks
/// for the days still to fill, the way the pick card shows a box to fill.
/// No count beside it (founder, Sep 24 2026: "we don't actually need the 1
/// there"); the boxes say it.
struct StreakForm: View {
    let count: Int
    /// "W" / "L", oldest first (get_streak's `recent`).
    let recent: [String]
    /// Today's streak pick, still waiting on its game: a gold box after the results.
    var pending: Bool = false
    private static let slots = 5

    var body: some View {
        let decided = recent.suffix(pending ? Self.slots - 1 : Self.slots).map { $0 == "W" ? StreakBox.Kind.win : .loss }
        let filled = decided + (pending ? [.pending] : [])
        let boxes = filled + Array(repeating: StreakBox.Kind.blank, count: max(0, Self.slots - filled.count))
        HStack(spacing: 2) {
            ForEach(Array(boxes.enumerated()), id: \.offset) { StreakBox(kind: $0.element) }
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel((count == 1 ? "Streak pick, 1 straight win" : "Streak pick, \(count) straight wins") + (pending ? ", today's pick pending" : ""))
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
/// 2026: "have you ever seen a present?"): the tear strip, Gary's mark and
/// one word. OPEN on a play to rip; COMING SOON on a game time whose play
/// hasn't landed; UNLOCK, with the lock, on a play behind the paywall.
struct LabPack: View {
    let word: String
    var lock: Bool = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#0D0C0B"), Color(hex: "#2A2416"), Color(hex: "#0F0E0C"), Color(hex: "#3A3018"), Color(hex: "#0D0C0B")],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(GaryColors.gold.opacity(0.4), lineWidth: 1))
            VStack(spacing: 0) {
                // the strip that tears
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: "#1B1712"), Color(hex: "#3A3018"), Color(hex: "#1B1712")], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 16)
                    .overlay(alignment: .bottom) {
                        DashedLine().stroke(GaryColors.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])).frame(height: 1)
                    }
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
                    Text(word).font(GaryFonts.display(22)).tracking(3).foregroundStyle(GaryColors.warmGold)
                        .fitsOneLine()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .shadow(color: .black.opacity(0.5), radius: 12, y: 6)
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
            LabPack(word: word, lock: lock)
                .frame(height: titleRow + 12 + stateRow)
                .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.4))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .onTapGesture { action?() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lock ? "\(league) play, unlock" : "\(league) play at \(clock ?? ""), coming soon")
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
            // College games are Winners games too (founder, Oct 9 2026: a college-only Friday showed no packs).
            guard let lg = row.league?.uppercased(), ["MLB", "NFL", "NCAAF"].contains(lg),
                  let start = LabFormat.parseISO(row.commence_time) else { return nil }
            let w = ComingWindow(league: lg, start: start)
            return seen.insert(w.id).inserted ? w : nil
        }
        .sorted { $0.start < $1.start }
    }
}

/// The slim results ticker under the Winners header (founder, Oct 4 2026):
/// the day's results running past. Results that fit simply sit still; with
/// Reduce Motion the strip scrolls by hand instead of moving.
struct LabResultsTicker: View {
    struct Item: Identifiable, Equatable {
        let id: Int
        let word: String
        let color: Color
        let pick: String
        let amount: String
    }
    let items: [Item]
    /// The page is on screen; the tape stops when it isn't.
    var running: Bool = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var tapeWidth: CGFloat = 0
    private static let gap: CGFloat = 14
    private static let speed: Double = 28 // points a second

    var body: some View {
        HStack(spacing: 10) {
            GeometryReader { geo in
                Group {
                    if reduceMotion || tapeWidth <= geo.size.width {
                        ScrollView(.horizontal, showsIndicators: false) { tape }
                    } else {
                        // Moved by Core Animation (MarqueeTape in DartsParts.swift, Oct 7 2026): the main thread
                        // rests while the results run. The tape has no buttons, so touches pass through it.
                        MarqueeTape(lap: LabResultsTape(items: items, gap: Self.gap), lapKey: tapeKey, gap: Self.gap,
                                    speed: Self.speed, running: running, holdsUnderFinger: false)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
            }
            .clipped()
            // The tape's width keeps being measured while it runs inside the marquee.
            .background(alignment: .leading) { tape.hidden() }
        }
        .frame(height: 30)
        .overlay(alignment: .bottom) { LabHairline() }
        .onPreferenceChange(LabResultsTapeWidthKey.self) { tapeWidth = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Today's results. " + items.map { "\($0.word) \($0.pick), \($0.amount)" }.joined(separator: "; "))
    }

    /// One pass of the results, at its natural width.
    private var tape: some View {
        LabResultsTape(items: items, gap: Self.gap).equatable()
    }

    /// What the tape shows; a new key rebuilds the moving strip.
    private var tapeKey: String { items.map { "\($0.id)|\($0.word)|\($0.pick)|\($0.amount)" }.joined(separator: "\n") }
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

/// The ticker's content. Equal when it shows the same results.
private struct LabResultsTape: View, Equatable {
    let items: [LabResultsTicker.Item]
    let gap: CGFloat

    var body: some View {
        HStack(spacing: gap) {
            ForEach(items) { item in
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(item.word).font(GaryFonts.mono(11.5, bold: true)).foregroundStyle(item.color)
                    Text(item.pick).font(GaryFonts.mono(11.5)).foregroundStyle(GaryColors.warmWhite)
                    Text(item.amount).font(GaryFonts.mono(11.5)).foregroundStyle(item.color)
                }
                Text("·").font(GaryFonts.mono(11.5)).foregroundStyle(LabInk.dimmer)
            }
        }
        .fixedSize()
        .background(GeometryReader { g in Color.clear.preference(key: LabResultsTapeWidthKey.self, value: g.size.width) })
    }
}

/// The ticker strip's natural width (one lap of the tape).
private struct LabResultsTapeWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
