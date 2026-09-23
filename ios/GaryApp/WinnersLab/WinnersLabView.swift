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
                WinnersDepthBackground()
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        header
                        // One row under the header (founder, Sep 22 2026: the
                        // tape and the tabs "took up a lot of space just to get
                        // to today"): the sport tabs on the left, yesterday's
                        // line on the right. Today's open count rides the
                        // TODAY head.
                        topRow.padding(.top, 10).pageGutter()
                        content.padding(.top, 12)
                        Color.clear.frame(height: 170)
                    }
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
        .onChange(of: selectedTab) { tab in if tab == 1 { Task { await load(quiet: true) } } }
        .onChange(of: date) { _ in board = nil; Task { await load() } }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(quiet: true) } } }
        .onChange(of: authManager.currentUser?.id) { _ in board = nil; yesterdayBoard = nil; Task { await load() } }
        .onReceive(Timer.publish(every: 90, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active, selectedTab == 1 else { return }
            if date != today && date == LabFormat.yesterday(of: LabFormat.yesterday(of: today)) { date = today }
            Task { await load(quiet: true) }
        }
        .onGaryTour { verb, arg in
            guard verb == "lab" else { return }
            switch arg {
            case "reseal": unveiledRaw = ""
            case "close": if let t = unveil { markUnveiled(t.candidateID); unveil = nil }
            case "talk": GaryTalkContext.shared.present = true
            case "unveil": if let first = todayPlays.first { unveil = first.lead }
            default:
                if arg.hasPrefix("open "), let id = Int(arg.dropFirst(5).trimmingCharacters(in: .whitespaces)) { path.append(LabRoute.play(id)) }
            }
        }
    }

    // MARK: - Loading

    private func load(quiet: Bool = false) async {
        if !quiet { loading = board == nil }
        let want = date
        let yesterday = LabFormat.yesterday(of: want)
        async let boardF = SupabaseAPI.fetchLabBoard(date: want)
        async let yesterdayF = SupabaseAPI.fetchLabBoard(date: yesterday)
        async let resultsF = SupabaseAPI.fetchAllGameResults(since: yesterday)
        async let propsF = SupabaseAPI.fetchRecentPropResults(limit: 800, since: yesterday)
        async let streakF = SupabaseAPI.fetchStreak(date: want)
        var fresh: LabBoard? = nil, freshYesterday: LabBoard? = nil, failure: String? = nil
        do { fresh = try await boardF } catch where LabFormat.isCancellation(error) {
            // Not a failure; the board's next read (appear, timer) fills it.
        } catch { failure = LabFormat.errorText(error) }
        freshYesterday = try? await yesterdayF
        let results = (try? await resultsF) ?? []
        let props = (try? await propsF) ?? []
        let freshStreak = try? await streakF
        await MainActor.run {
            guard want == date else { return }
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
            // A day whose only play is the free streak pick locks nothing, so
            // the preview falls back to the last full card to draw the shape.
            var source = (board?.tickets ?? []).filter { $0.candidateID != free }
            if source.isEmpty { source = yesterdayBoard?.tickets ?? [] }
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

    private var header: some View {
        GaryPageHeader(title: "Winners", accent: LabFormat.shortDateWords(today), trailing: { EmptyView() })
    }

    private var topRow: some View {
        let yLine = dayLine(yesterdayBoard)
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            if sports.count > 2 { LabTextTabs(items: sports, selected: $sport, size: 14) } else { Spacer(minLength: 0) }
            HStack(spacing: 8) {
                Text("YESTERDAY").font(GaryFonts.display(14)).tracking(0.8).foregroundStyle(LabInk.dim)
                if yLine.won + yLine.lost + yLine.push > 0 {
                    Text("\(yLine.won)-\(yLine.lost)\(yLine.push > 0 ? "-\(yLine.push)" : "")").font(GaryFonts.display(14)).foregroundStyle(GaryColors.warmWhite)
                    Text(LabFormat.unitsNet(yLine.units)).font(GaryFonts.display(14))
                        .foregroundStyle(yLine.units > 0.049 ? GaryColors.win : yLine.units < -0.049 ? GaryColors.loss : GaryColors.silver)
                } else {
                    Text("NO PLAYS").font(GaryFonts.display(14)).foregroundStyle(LabInk.dimmer)
                }
            }
            .fixedSize()
        }
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
                sectionHead("TODAY", note: todayNote)
                if let pick = streak?.today ?? streak?.yesterday, let current = streak?.current { streakCard(pick, current: current, best: streak?.best ?? 0) }
                ForEach(lockedBoards) { summary in lockedModule(summary) }
                ForEach(todayPlays) { group in module(group, sealable: true) }
                if todayPlays.isEmpty && lockedBoards.isEmpty { sealedCard }
                if let msg = checkoutError { Text(msg).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }

                if !yesterdayPlays.isEmpty {
                    sectionHead("YESTERDAY", note: LabFormat.shortDateWords(LabFormat.yesterday(of: today))).padding(.top, 18)
                    ForEach(yesterdayPlays) { group in module(group, sealable: false) }
                }
            }
            .pageGutter()
        }
    }

    private func sectionHead(_ title: String, note: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold)
            Spacer()
            if let note { Text(note).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim) }
        }
        .padding(.top, 2)
    }

    /// Today's card before anything seals: wrapped, waiting on first pitch.
    private var sealedCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Rectangle().fill(.clear).frame(height: 1)
                    .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
                Text("SEALED").font(GaryFonts.display(13)).tracking(2).foregroundStyle(GaryColors.gold)
                Rectangle().fill(.clear).frame(height: 1)
                    .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
            }
            .padding(.horizontal, 16).padding(.top, 18)
            HStack(alignment: .center) {
                Text("TODAY'S CARD").font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
                Spacer()
                Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.4))
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
                    Image(systemName: "flame.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(GaryColors.gold)
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
                    Text(pick.ticket.uppercased()).font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite).lineLimit(2).minimumScaleFactor(0.6)
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

    /// A board a non-member cannot open: the sealed module's shape with the
    /// count in place of the ticket and the lock where the seal sits. Tap
    /// opens the plans sheet on that league. Counts only; the server never
    /// sends a locked board's tickets.
    private func lockedModule(_ summary: SupabaseAPI.WinnersBoardSummary) -> some View {
        let word = "PLAY"
        return Button { plansFocus = summary.league; showPlans = true } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Text(summary.league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                    Text(LabFormat.shortDateWords(today)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    Spacer()
                    Image(systemName: "lock.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(GaryColors.gold)
                }
                .padding(.horizontal, 16).padding(.top, 13)
                HStack {
                    Rectangle().fill(.clear).frame(height: 1)
                        .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
                    Text("LOCKED").font(GaryFonts.display(13)).tracking(2).foregroundStyle(GaryColors.gold)
                    Rectangle().fill(.clear).frame(height: 1)
                        .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
                }
                .padding(.horizontal, 16).padding(.top, 12)
                HStack(alignment: .firstTextBaseline) {
                    Text("\(summary.count) \(word)\(summary.count == 1 ? "" : "S")")
                        .font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite)
                    Spacer()
                    Text("UNLOCK").font(GaryFonts.display(16)).tracking(1.2).foregroundStyle(GaryColors.gold)
                }
                .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 14)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.4))
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

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // A sealed play gives away nothing (founder, Sep 22 2026: "it
            // shouldn't even say the game until unveiled"). The wrapper wears
            // the league, the clock and the money; the teams arrive with the
            // rip. An open play names itself.
            HStack(spacing: 8) {
                if let streak {
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(GaryColors.gold)
                        if streak >= 2 { Text("\(streak)").font(GaryFonts.display(13)).foregroundStyle(GaryColors.gold) }
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
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#0D0C0B"), Color(hex: "#2A2416"), Color(hex: "#0F0E0C"), Color(hex: "#3A3018"), Color(hex: "#0D0C0B")],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(GaryColors.gold.opacity(0.4), lineWidth: 1))
            VStack(spacing: 0) {
                // the strip that tears
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: "#1B1712"), Color(hex: "#3A3018"), Color(hex: "#1B1712")], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 22)
                    .overlay(alignment: .bottom) {
                        DashedLine().stroke(GaryColors.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])).frame(height: 1)
                    }
                HStack(spacing: 12) {
                    Image(GaryBrand.mark).resizable().scaledToFit()
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        .shadow(color: .black.opacity(0.6), radius: 8, y: 4)
                    // The page is already called Winners; the pack says what
                    // happens when you tap it (founder, Sep 22 2026).
                    Text("OPEN").font(GaryFonts.display(24)).tracking(3).foregroundStyle(GaryColors.warmGold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .shadow(color: .black.opacity(0.5), radius: 12, y: 6)
        .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 14)
    }

    private var openBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            ticketRow(group.lead, state: group.leadState, size: ticketSize, lead: true)
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

    private func ticketRow(_ t: LabBoardTicket, state: WinnersLabView.ModuleState, size: CGFloat, lead: Bool) -> some View {
        let ticket = LabFormat.ticketBody(t.pickText)
        let split = LabFormat.splitDirection(ticket, league: t.league)
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            // The lead's state line sits apart from the pick, in the card's
            // bottom-left corner (founder, Sep 23 2026).
            VStack(alignment: .leading, spacing: lead ? 14 : 3) {
                // The lead title runs 2pt under the tier; direction and odds
                // ride the stub under the stake (founder, Sep 23 2026).
                Text(split.body.uppercased()).font(GaryFonts.display(lead ? size - 2 : size)).foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(2).minimumScaleFactor(0.6)
                    .accessibilityLabel("\(ticket) \(LabFormat.price(t.price))")
                stateLine(state, prop: t.prop)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: lead ? 7 : 5) {
                LabUnitStamp(units: t.stakeUnits, size: lead ? 26 : 17)
                if split.direction != nil || t.price != nil {
                    LabTicketStub(direction: split.direction, price: t.price, size: lead ? 12 : 10)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    @ViewBuilder
    private func stateLine(_ state: WinnersLabView.ModuleState, prop: PropPick?) -> some View {
        switch state {
        case .final(let result, let score):
            HStack(spacing: 8) {
                LabStateWord(text: result == "won" ? "Win" : result == "lost" ? "Loss" : result.capitalized,
                             color: result == "won" ? GaryColors.win : result == "lost" ? GaryColors.loss : GaryColors.silver, size: 15)
                if let score { Text(prop != nil ? "\(score) \(LabFormat.marketWords(prop?.prop))" : score).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(LabInk.dim) }
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
