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
    @State private var loading = true
    @State private var error: String?
    @State private var date: String = SupabaseAPI.todayEST()
    @State private var sport = "ALL"
    @State private var desk = "GARY"
    @State private var unveil: LabBoardTicket?
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

    private var today: String { SupabaseAPI.todayEST() }
    private var unveiled: Set<Int> { Set(unveiledRaw.split(separator: ",").compactMap { Int($0) }) }
    private func markUnveiled(_ id: Int) { var s = unveiled; s.insert(id); unveiledRaw = s.map(String.init).joined(separator: ",") }
    private func reseal(_ id: Int) { var s = unveiled; s.remove(id); unveiledRaw = s.map(String.init).joined(separator: ",") }

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                GaryStageBackground()
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        header
                        // Yesterday's line rides the header, between the date and
                        // the profile (founder, Sep 23 2026), so the page starts
                        // higher. The sport tabs get a row only when there are
                        // sports to choose; today's open count rides the TODAY head.
                        if sports.count > 2 {
                            LabTextTabs(items: sports, selected: $sport, size: 14).padding(.top, 10).pageGutter()
                        }
                        content.padding(.top, 12)
                        Color.clear.frame(height: 170)
                    }
                    // The lamp hangs over today's first plays and scrolls with them.
                    .background(alignment: .top) { StageLamp(radius: 380).offset(y: -130) }
                }
                .refreshable { await load() }
                StatusBarScrim()
            }
            .navigationDestination(for: LabRoute.self) { route in
                switch route {
                case .play(let id): LabPlayView(candidateID: id)
                case .system(let system): LabSystemView(system: system, date: date)
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
        .onChange(of: selectedTab) { tab in if tab == 1, !rollToToday() { Task { await load(quiet: true) } } }
        .onChange(of: date) { _ in board = nil; yesterdayBoard = nil; streak = nil; Task { await load() } }
        .onChange(of: scenePhase) { phase in if phase == .active, !rollToToday() { Task { await load(quiet: true) } } }
        .onChange(of: authManager.currentUser?.id) { _ in board = nil; yesterdayBoard = nil; Task { await load() } }
        .onReceive(Timer.publish(every: 90, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active, selectedTab == 1 else { return }
            if !rollToToday() { Task { await load(quiet: true) } }
        }
        .onGaryTour { verb, arg in
            guard verb == "lab" else { return }
            switch arg {
            case "reseal": unveiledRaw = ""
            case "close": if let t = unveil { markUnveiled(t.candidateID); unveil = nil }
            case "talk": GaryTalkContext.shared.present = true
            case "unveil": if let first = todayPlays.first { unveil = first.lead }
            case "unveil yesterday": if let first = yesterdayPlays.first { unveil = first.lead }
            default:
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

    private func load(quiet: Bool = false) async {
        if !quiet { loading = board == nil }
        let want = date
        let yesterday = LabFormat.yesterday(of: want)
        async let boardF = SupabaseAPI.fetchLabBoard(date: want)
        async let yesterdayF = SupabaseAPI.fetchLabBoard(date: yesterday)
        async let resultsF = SupabaseAPI.fetchAllGameResults(since: yesterday)
        async let propsF = SupabaseAPI.fetchRecentPropResults(limit: 800, since: yesterday)
        async let streakF = SupabaseAPI.fetchStreak(date: want)
        async let slateF = SupabaseAPI.fetchTodayBoard(date: want)
        var fresh: LabBoard? = nil, freshYesterday: LabBoard? = nil, failure: String? = nil
        do { fresh = try await boardF } catch where LabFormat.isCancellation(error) {
            // Not a failure; the board's next read (appear, timer) fills it.
        } catch { failure = LabFormat.errorText(error) }
        freshYesterday = try? await yesterdayF
        let results = (try? await resultsF) ?? []
        let props = (try? await propsF) ?? []
        let freshStreak = try? await streakF
        let slate = await slateF
        await MainActor.run {
            guard want == date else { return }
            if let slate { windows = ComingWindow.from(slate) }
            if let freshStreak { streak = freshStreak }
            if let fresh {
                board = fresh
                if let snapshot = fresh.access { access.snapshot = snapshot }
                error = nil
            } else if board == nil { error = failure }
            if let freshYesterday { yesterdayBoard = freshYesterday }
            var g: [String: GameResult] = [:]
            for r in results { if let d = r.game_date, let t = r.pick_text { g["\(d)|\(t)"] = r } }
            gameResults = g
            var p: [String: PropResult] = [:]
            for r in props { if let key = Self.propKey(date: r.game_date, player: r.player_name, market: r.prop_type, line: r.line_value?.value, bet: r.bet) { p[key] = r } }
            propResults = p
            loading = false
            liveCache.startIfNeeded()
            for t in (board?.tickets ?? []) { if let prop = t.prop, LivePropStatsCache.BattingLine.supports(prop.prop ?? "") { LivePropStatsCache.shared.track(prop) } }
        }
    }

    private static func propKey(date: String?, player: String?, market: String?, line: String?, bet: String?) -> String? {
        guard let date, let player else { return nil }
        let m = LivePropStatsCache.BattingLine.marketKey(market ?? "")
        let l = Double(line ?? "").map { LabFormat.trim($0) } ?? ""
        return "\(date)|\(player.lowercased())|\(m)|\(l)|\((bet ?? "").lowercased())"
    }

    // MARK: - Derived

    private func gameResult(_ t: LabBoardTicket) -> GameResult? {
        if let hit = gameResults["\(t.gameDate)|\(t.pickText)"] { return hit }
        return gameResults.values.first { $0.game_date == t.gameDate && $0.matchup == t.matchup && $0.pick_text == t.pickText }
    }
    private func propResult(_ t: LabBoardTicket) -> PropResult? {
        guard let p = t.prop, let key = Self.propKey(date: t.gameDate, player: p.player, market: p.prop, line: p.line ?? LabFormat.trailingNumber(p.prop), bet: p.bet) else { return nil }
        return propResults[key]
    }
    private func resultWord(_ t: LabBoardTicket) -> String? {
        let r = t.isProp ? propResult(t)?.result : gameResult(t)?.result
        guard let r, !r.isEmpty else { return nil }
        return r.lowercased()
    }
    private func liveScore(_ t: LabBoardTicket) -> LiveScore? {
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
        if let r = resultWord(t) {
            let score: String? = t.isProp ? propResult(t)?.actual_value?.value : (gameResult(t)?.displayFinalScore ?? liveScore(t)?.scoreLine)
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
        (b?.tickets ?? []).filter { sport == "ALL" || $0.league == sport }
    }
    /// One module per play, games and props in one list (founder, Sep 22
    /// 2026: the best bets of the day, three games and four props, all feed
    /// one bankroll; there is no split). By start time, finals last.
    private func groups(_ b: LabBoard?) -> [Group] {
        let list = tickets(b).map { Group(key: "\($0.candidateID)", lead: $0, riders: []) }
        func isDone(_ g: Group) -> Bool { if case .final = state(g.lead) { return true }; return false }
        return list.sorted { a, b in
            let da = isDone(a), db = isDone(b)
            if da != db { return !da }
            return (a.commence ?? .distantFuture) < (b.commence ?? .distantFuture)
        }
    }
    /// Today's plays the fan may open. With the paywall preview on, none:
    /// every league reads as locked, the way a non-member sees the page.
    /// The streak pick already has its own module at the top of the card, so
    /// it does not ride the sealed list as well (founder's board showed the
    /// Rays twice on Sep 22: once revealed as the free pick, once sealed).
    private var todayPlays: [Group] {
        guard !WinnersGate.preview else { return [] }
        let free = board?.freeCandidateID ?? streak?.today?.candidate_id
        return groups(board).filter { $0.lead.candidateID != free }
    }
    /// The free streak pick is never a locked module, whoever is reading.
    private var yesterdayPlays: [Group] { groups(yesterdayBoard) }
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
        for b in boards where b.locked && b.count > 0 && (sport == "ALL" || b.league == sport) {
            byLeague[b.league, default: 0] += b.count
        }
        return byLeague.map { SupabaseAPI.WinnersBoardSummary(league: $0.key, kind: "game", count: $0.value, locked: true) }
            .sorted { $0.league < $1.league }
    }
    private var sports: [String] {
        var s = ["ALL"]
        for t in (board?.tickets ?? []) + (yesterdayBoard?.tickets ?? []) where !s.contains(t.league) { s.append(t.league) }
        for b in board?.boards ?? [] where !s.contains(b.league) { s.append(b.league) }
        return s
    }

    private struct DayLine { var won = 0, lost = 0, push = 0, open = 0; var units = 0.0 }
    private func dayLine(_ b: LabBoard?) -> DayLine {
        var line = DayLine()
        for t in b?.tickets ?? [] {
            let stake = t.stakeUnits ?? 0
            switch resultWord(t) {
            case "won": line.won += 1; line.units += stake * LabFormat.payout(t.price)
            case "lost": line.lost += 1; line.units -= stake
            case "push": line.push += 1
            default: line.open += 1
            }
        }
        return line
    }

    // MARK: - Header, tape, filters

    /// The header carries yesterday's line under the date, between the
    /// wordmark and the profile (founder, Sep 23 2026), so the page starts
    /// higher. Stacked so neither the date nor the line is ever cut.
    private var header: some View {
        GaryPageHeader(title: "Winners", accentMenu: AnyView(
            VStack(alignment: .leading, spacing: 1) {
                Text(LabFormat.shortDateWords(today))
                    .font(GaryFonts.kicker(11)).foregroundStyle(.white.opacity(0.55))
                    .fixedSize()
                // Before today's plays the recap says it, big; never twice.
                if !showsRecap { yesterdayLine }
            }), trailing: { EmptyView() })
    }

    /// "YESTERDAY 6-4 +$503".
    private var yesterdayLine: some View {
        let yLine = dayLine(yesterdayBoard)
        return HStack(spacing: 6) {
            Text("YESTERDAY").font(GaryFonts.display(12.5)).tracking(0.8).foregroundStyle(LabInk.dim)
            if yLine.won + yLine.lost + yLine.push > 0 {
                Text("\(yLine.won)-\(yLine.lost)\(yLine.push > 0 ? "-\(yLine.push)" : "")").font(GaryFonts.display(12.5)).foregroundStyle(GaryColors.warmWhite)
                Text(LabFormat.unitsNet(yLine.units)).font(GaryFonts.display(12.5))
                    .foregroundStyle(yLine.units > 0.049 ? GaryColors.win : yLine.units < -0.049 ? GaryColors.loss : GaryColors.silver)
            } else {
                Text("NO PLAYS").font(GaryFonts.display(12.5)).foregroundStyle(LabInk.dimmer)
            }
        }
        .fixedSize()
    }

    /// "1-2 · 1 OPEN": today's head carries the day's line and the open
    /// count. The date is the page header's; it is not said twice.
    private var todayNote: String? {
        let line = dayLine(board)
        var bits: [String] = []
        if line.won + line.lost + line.push > 0 { bits.append("\(line.won)-\(line.lost)\(line.push > 0 ? "-\(line.push)" : "")") }
        if line.open > 0 { bits.append("\(line.open) OPEN") }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if loading && board == nil {
            HStack { Spacer(); ProgressView().tint(GaryColors.gold).scaleEffect(1.2); Spacer() }.padding(.top, 60)
        } else if let error, board == nil {
            VStack(spacing: 8) {
                Text("The board couldn't be read.").font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.warmWhite)
                Text(error).font(GaryFonts.ui(12)).foregroundStyle(LabInk.dim).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.top, 40).pageGutter()
        } else {
            LazyVStack(alignment: .leading, spacing: 12) {
                if showsRecap {
                    // Until 10 AM ET, before today's first play (founder, Sep 24
                    // 2026): the top is yesterday's day, then its plays.
                    yesterdayRecap
                    if let msg = checkoutError { Text(msg).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }
                    ForEach(yesterdayPlays) { group in module(group, sealable: false, streak: yesterdayStreak(group)) }
                } else {
                    sectionHead("TODAY", note: todayNote)
                    if let pick = streak?.today, let current = streak?.current { streakCard(pick, current: current, best: streak?.best ?? 0) }
                    // A play behind the paywall is its own pack: the fan sees
                    // each one waiting and taps to unlock it.
                    ForEach(AppFlags.purchasesEnabled ? lockedPacks : []) { pack in
                        LabPackCard(league: pack.league, clock: nil, word: "UNLOCK", lock: true) {
                            plansFocus = pack.league; showPlans = true
                        }
                    }
                    ForEach(todayPlays) { group in module(group, sealable: true) }
                    // The game times still ahead wear the pack before their
                    // play lands; it says so instead of OPEN.
                    // A fan who isn't a member can unlock from any of them.
                    ForEach(comingPacks) { w in
                        LabPackCard(league: w.league, clock: w.clock, word: "COMING SOON",
                                    action: isMember || !AppFlags.purchasesEnabled ? nil : { plansFocus = w.league; showPlans = true })
                    }
                    if let msg = checkoutError { Text(msg).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }

                    if !yesterdayPlays.isEmpty {
                        sectionHead("YESTERDAY", note: LabFormat.shortDateWords(LabFormat.yesterday(of: today))).padding(.top, 18)
                        ForEach(yesterdayPlays) { group in module(group, sealable: false, streak: yesterdayStreak(group)) }
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
        if !todayPlays.isEmpty || !lockedBoards.isEmpty || streak?.today != nil { return true }
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
        let held = (board?.tickets ?? []).compactMap { t in LabFormat.parseISO(t.commence).map { (t.league, $0) } }
        let soon = Date().addingTimeInterval(5 * 60)
        return windows
            .filter { $0.start > soon && (sport == "ALL" || $0.league == sport) }
            .filter { w in !held.contains { $0.0 == w.league && abs($0.1.timeIntervalSince(w.start)) < 60 } }
            .prefix(3).map { $0 }
    }

    /// Yesterday's streak pick keeps its mark in yesterday's list.
    private func yesterdayStreak(_ group: Group) -> Int? {
        guard let id = streak?.yesterday?.candidate_id, id == group.lead.candidateID else { return nil }
        return streak?.current
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
            }
            Text("Gary's \(LabFormat.weekdayWord(today)) plays are on the way.")
                .font(GaryFonts.ui(13, .medium)).foregroundStyle(LabInk.dim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
        .accessibilityElement(children: .combine)
    }

    private func sectionHead(_ title: String, note: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold)
            Spacer()
            if let note { Text(note).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim) }
        }
        .padding(.top, 2)
    }

    /// The streak pick is the same module as every play on the board, the
    /// streak mark its one difference (founder, Sep 23 2026). A pick whose
    /// ticket the page doesn't hold falls back to the compact card below.
    @ViewBuilder private func streakCard(_ pick: StreakPick, current: Int, best: Int) -> some View {
        let isToday = pick.game_date == today
        let held = (board?.tickets ?? []) + (yesterdayBoard?.tickets ?? [])
        if let id = pick.candidate_id, let ticket = held.first(where: { $0.candidateID == id }) {
            module(Group(key: "streak-\(id)", lead: ticket, riders: []), sealable: isToday, streak: current)
        } else {
            streakModule(pick, current: current, best: best)
        }
    }

    /// THE STREAK PICK (founder, Sep 22 2026): one Winners play a day that
    /// counts toward Gary's streak and is the free pick. Chosen from the
    /// board by his stake once the day's first play is an hour out; shows
    /// yesterday's until today's is chosen. Tap opens its breakdown.
    private func streakModule(_ pick: StreakPick, current: Int, best: Int) -> some View {
        let isToday = pick.game_date == today
        let result = (pick.result ?? "").lowercased()
        let live = (board?.tickets ?? []).first { $0.candidateID == pick.candidate_id }.map { state($0) }
        return Button {
            if let id = pick.candidate_id { path.append(LabRoute.play(id)) }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    StreakFlame(count: current)
                    Text("STREAK PICK").font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                    Text(isToday ? (pick.league ?? "") : "\(pick.league ?? "") · YESTERDAY").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    Spacer()
                    // A run reads as a run; one win is not a streak and says nothing.
                    if current >= 2 {
                        Text("\(current) STRAIGHT WINS").font(GaryFonts.display(13)).tracking(1.2).foregroundStyle(GaryColors.win)
                    }
                }
                .padding(.horizontal, 16).padding(.top, 13)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(pick.ticket.uppercased()).font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                    Text(LabFormat.price(pick.odds)).font(GaryFonts.display(18)).foregroundStyle(GaryColors.silver)
                    Spacer(minLength: 6)
                    LabUnitStamp(units: pick.stake_units?.value, size: 24)
                }
                .padding(.horizontal, 16).padding(.top, 8)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if result == "won" { LabStateWord(text: "Win", color: GaryColors.win, size: 15) }
                    else if result == "lost" { LabStateWord(text: "Loss", color: GaryColors.loss, size: 15) }
                    else if result == "push" { LabStateWord(text: "Push", color: GaryColors.silver, size: 15) }
                    else if case .live(let detail, let score)? = live {
                        let over = detail.uppercased() == "FINAL"
                        LabStateWord(text: over ? "Final" : "Live", color: over ? GaryColors.silver : GaryColors.sweating, pulse: !over, size: 15)
                        if let score { Text(score).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(LabInk.dim) }
                        if !over { Text(detail).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim) }
                    }
                    else { LabStateWord(text: "Sealed", color: GaryColors.gold, size: 15) }
                    if let m = pick.matchup { Text(m).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7) }
                    Spacer(minLength: 6)
                    Text(LabFormat.timeET(pick.commence_time)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                }
                .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 13)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate(radius: 14, fill: LabInk.plateDeep, edge: GaryColors.gold.opacity(0.6))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func module(_ group: Group, sealable: Bool, streak: Int? = nil) -> some View {
        let sealed = sealable && !unveiled.contains(group.lead.candidateID)
        return LabPlayModule(group: LabPlayModule.Model(
            lead: group.lead, riders: group.riders, units: group.units, sealed: sealed,
            leadState: state(group.lead), riderStates: group.riders.map { state($0) }),
            streak: streak,
            onOpen: { ticket in
                if sealed { unveil = group.lead } else { path.append(LabRoute.play(ticket.candidateID)) }
            },
            onReseal: { if !sealed { reseal(group.lead.candidateID) } })
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
    /// The streak pick's run (0 or 1 draws the mark alone); nil on every other play.
    var streak: Int? = nil
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
                if let streak {
                    HStack(spacing: 4) {
                        StreakFlame(count: streak)
                        if streak >= 2 { Text("\(streak)").font(GaryFonts.display(16)).foregroundStyle(GaryColors.warmWhite) }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(streak >= 2 ? "Streak pick, \(streak) straight wins" : "Streak pick")
                }
                Text(group.lead.league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                if !group.sealed {
                    Text(group.lead.matchup).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
                }
                Spacer()
                Text(LabFormat.timeET(group.lead.commence)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
            }
            .frame(height: headRow)
            .padding(.horizontal, 16).padding(.top, 13)

            if group.sealed {
                sealedBody
            } else {
                openBody
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
                    Text(short).font(font).lineLimit(1).minimumScaleFactor(0.6)
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
        guard !AppFlags.storeSafe, let raw = t.game?.sportsbook_odds?.first?.book, !raw.isEmpty else { return nil }
        return LabFormat.bookName(raw)
    }

    /// The pick with the player's first name or the club's city dropped.
    static func shortTitle(_ full: String, player: String?, matchup: String) -> String {
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

/// THE STREAK MARK: a flame (founder, Sep 24 2026, reversing the Sep 23
/// tally: "too dull... switch the icon... a more standard icon for
/// signifying streaks"). The flame is the mark fans already read as a run
/// (the streak counters in the apps they use every day). Lit gold to orange
/// while the run is alive; silver, still plain to see, when it has just ended.
struct StreakFlame: View {
    let count: Int
    var size: CGFloat = 15

    var body: some View {
        Image(systemName: "flame.fill")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(count > 0
                ? AnyShapeStyle(LinearGradient(colors: [Color(hex: "#FFD54F"), Color(hex: "#FF8A1E"), Color(hex: "#F2542D")],
                                               startPoint: .top, endPoint: .bottom))
                : AnyShapeStyle(GaryColors.silver.opacity(0.8)))
            .shadow(color: count > 0 ? Color(hex: "#FF8A1E").opacity(0.45) : .clear, radius: 5)
            .accessibilityHidden(true)
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
                        .lineLimit(1).minimumScaleFactor(0.7)
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
        return (board.board ?? []).compactMap { row -> ComingWindow? in
            guard let lg = row.league?.uppercased(), ["MLB", "NFL"].contains(lg),
                  let start = LabFormat.parseISO(row.commence_time) else { return nil }
            let w = ComingWindow(league: lg, start: start)
            return seen.insert(w.id).inserted ? w : nil
        }
        .sorted { $0.start < $1.start }
    }
}
