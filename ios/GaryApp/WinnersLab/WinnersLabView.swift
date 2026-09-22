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
    @State private var loading = true
    @State private var error: String?
    @State private var date: String = SupabaseAPI.todayEST()
    @State private var sport = "ALL"
    @State private var desk = "GARY"
    @State private var unveil: LabBoardTicket?
    @State private var showTalk = false
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
                        tape.padding(.top, 10)
                        if sports.count > 2 { filters.padding(.top, 12).pageGutter() }
                        content.padding(.top, 14)
                        Color.clear.frame(height: 170)
                    }
                }
                .refreshable { await load() }
                StatusBarScrim()
            }
            .overlay(alignment: .bottom) {
                GaryTalkBar { showTalk = true }
                    .pageGutter()
                    .padding(.bottom, 92)
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
                }, onDismiss: { unveil = nil })
                .transition(.opacity)
                .zIndex(10)
            }
        }
        .background(Color.clear.sheet(isPresented: $showTalk) {
            GaryTalkSheet(date: date).presentationDetents([.large])
        })
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
            case "talk": showTalk = true
            case "unveil": if let first = (todayGames + todayProps).first { unveil = first.lead }
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
        var fresh: LabBoard? = nil, freshYesterday: LabBoard? = nil, failure: String? = nil
        do { fresh = try await boardF } catch { failure = LabFormat.errorText(error) }
        freshYesterday = try? await yesterdayF
        let results = (try? await resultsF) ?? []
        let props = (try? await propsF) ?? []
        await MainActor.run {
            guard want == date else { return }
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
    /// One module per play. Games first by start time with finals last; props
    /// keep their own section, never nested.
    private func groups(_ b: LabBoard?, props: Bool) -> [Group] {
        let list = tickets(b).filter { $0.isProp == props }.map { Group(key: "\($0.candidateID)", lead: $0, riders: []) }
        func isDone(_ g: Group) -> Bool { if case .final = state(g.lead) { return true }; return false }
        return list.sorted { a, b in
            let da = isDone(a), db = isDone(b)
            if da != db { return !da }
            return (a.commence ?? .distantFuture) < (b.commence ?? .distantFuture)
        }
    }
    private var todayGames: [Group] { groups(board, props: false) }
    private var todayProps: [Group] { groups(board, props: true) }
    private var yesterdayGames: [Group] { groups(yesterdayBoard, props: false) }
    private var yesterdayProps: [Group] { groups(yesterdayBoard, props: true) }
    private var lockedBoards: [SupabaseAPI.WinnersBoardSummary] {
        (board?.boards ?? []).filter { $0.locked && $0.count > 0 && (sport == "ALL" || $0.league == sport) }
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

    private var tape: some View {
        let todayLine = dayLine(board)
        let yLine = dayLine(yesterdayBoard)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                tapeItem("TODAY", line: todayLine, showOpen: true)
                tapeDivider
                tapeItem("YESTERDAY", line: yLine, showOpen: false)
            }
            .padding(.horizontal, GaryLayout.gutter)
        }
        .padding(.vertical, 9)
        .overlay(alignment: .top) { LabHairline() }
        .overlay(alignment: .bottom) { LabHairline() }
    }
    private var tapeDivider: some View { Text("|").font(GaryFonts.display(16)).foregroundStyle(LabInk.hair) }
    private func tapeItem(_ label: String, line: DayLine, showOpen: Bool) -> some View {
        HStack(spacing: 8) {
            Text(label).font(GaryFonts.display(16)).tracking(0.8).foregroundStyle(GaryColors.silver)
            if line.won + line.lost + line.push > 0 {
                Text("\(line.won)-\(line.lost)\(line.push > 0 ? "-\(line.push)" : "")").font(GaryFonts.display(16)).foregroundStyle(GaryColors.warmWhite)
                Text(LabFormat.unitsNet(line.units)).font(GaryFonts.display(16))
                    .foregroundStyle(line.units > 0.049 ? GaryColors.win : line.units < -0.049 ? GaryColors.loss : GaryColors.silver)
            } else if !showOpen {
                Text("NO PLAYS").font(GaryFonts.display(16)).foregroundStyle(LabInk.dim)
            }
            if showOpen, line.open > 0 {
                Text("\(line.open) OPEN").font(GaryFonts.display(16)).foregroundStyle(GaryColors.gold)
            }
        }
    }

    private var filters: some View {
        LabTextTabs(items: sports, selected: $sport, size: 14)
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
                sectionHead("TODAY", note: LabFormat.shortDateWords(today))
                ForEach(lockedBoards) { summary in lockedPlate(summary) }
                ForEach(todayGames) { group in module(group, sealable: true) }
                if !todayProps.isEmpty {
                    sectionHead("PROPS", note: nil).padding(.top, 6)
                    ForEach(todayProps) { group in module(group, sealable: true) }
                }
                if todayGames.isEmpty && todayProps.isEmpty && lockedBoards.isEmpty { sealedCard }
                if let msg = checkoutError { Text(msg).font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.loss) }

                if !yesterdayGames.isEmpty || !yesterdayProps.isEmpty {
                    sectionHead("YESTERDAY", note: LabFormat.shortDateWords(LabFormat.yesterday(of: today))).padding(.top, 18)
                    ForEach(yesterdayGames) { group in module(group, sealable: false) }
                    if !yesterdayProps.isEmpty {
                        sectionHead("PROPS", note: nil).padding(.top, 6)
                        ForEach(yesterdayProps) { group in module(group, sealable: false) }
                    }
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

    private func lockedPlate(_ summary: SupabaseAPI.WinnersBoardSummary) -> some View {
        Button { plansFocus = summary.league; showPlans = true } label: {
            HStack(alignment: .center, spacing: 14) {
                Text("\(summary.league) · \(summary.count) \(summary.kind == "prop" ? "prop" : "play")\(summary.count == 1 ? "" : "s") sealed")
                    .font(GaryFonts.display(20)).foregroundStyle(GaryColors.warmWhite)
                Spacer()
                Text("UNLOCK").font(GaryFonts.display(14)).tracking(1.2).foregroundStyle(GaryColors.gold)
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .labPlate(edge: GaryColors.gold.opacity(0.35))
        }
        .buttonStyle(.plain)
    }

    private func module(_ group: Group, sealable: Bool) -> some View {
        let sealed = sealable && !unveiled.contains(group.lead.candidateID)
        return LabPlayModule(group: LabPlayModule.Model(
            lead: group.lead, riders: group.riders, units: group.units, sealed: sealed,
            leadState: state(group.lead), riderStates: group.riders.map { state($0) }),
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
    let onOpen: (LabBoardTicket) -> Void
    let onReseal: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var ticketSize: CGFloat { group.units >= 1 ? 32 : group.units >= 0.5 ? 27 : 23 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(group.lead.league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                Text(group.lead.matchup).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
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

    private var sealedBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Rectangle().fill(.clear).frame(height: 1)
                    .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
                Text("SEALED").font(GaryFonts.display(13)).tracking(2).foregroundStyle(GaryColors.gold)
                Rectangle().fill(.clear).frame(height: 1)
                    .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
            }
            .padding(.top, 12)
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(sealedHeadline.uppercased()).font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite).lineLimit(1).minimumScaleFactor(0.7)
                    HStack(spacing: 8) {
                        if group.riders.count > 0 { Text("\(group.riders.count + 1) PLAYS").font(GaryFonts.display(13)).tracking(1).foregroundStyle(GaryColors.silver) }
                        Text(sealedCaption).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    }
                }
                Spacer()
                LabUnitStamp(units: group.units, size: 30)
            }
            .padding(.bottom, 14)
        }
        .padding(.horizontal, 16)
    }

    private var sealedHeadline: String {
        if let g = group.lead.game {
            let away = (g.awayTeamAbbreviation ?? g.awayTeam?.split(separator: " ").last.map(String.init)) ?? ""
            let home = (g.homeTeamAbbreviation ?? g.homeTeam?.split(separator: " ").last.map(String.init)) ?? ""
            return "\(away) @ \(home)"
        }
        let parts = group.lead.matchup.components(separatedBy: " @ ")
        if parts.count == 2 {
            let a = parts[0].split(separator: " ").last.map(String.init) ?? parts[0]
            let h = parts[1].split(separator: " ").last.map(String.init) ?? parts[1]
            return "\(a) @ \(h)"
        }
        return group.lead.matchup
    }

    private var sealedCaption: String {
        switch group.leadState {
        case .sealed(let commence): return LabFormat.countdown(to: commence).map { "Seals \($0)" } ?? "Sealed"
        case .live(let detail, _): return detail.uppercased() == "FINAL" ? "Final" : "Live, \(detail)"
        case .final: return "Final"
        }
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
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(LabFormat.ticketBody(t.pickText).uppercased()).font(GaryFonts.display(size)).foregroundStyle(GaryColors.warmWhite)
                        .lineLimit(2).minimumScaleFactor(0.6)
                    Text(LabFormat.price(t.price)).font(GaryFonts.display(size * 0.72)).foregroundStyle(GaryColors.silver)
                }
                stateLine(state, prop: t.prop)
            }
            Spacer(minLength: 6)
            LabUnitStamp(units: t.stakeUnits, size: lead ? 26 : 17)
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
