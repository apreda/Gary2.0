import SwiftUI

// DARTS — Gary's fun leans for the day (founder, Sep 22 2026): its own lane,
// thrown every morning from the day's real markets, five per category. Never
// graded, never on any record, never sealed. Built out Sep 23 ("do it your
// way for real"), from the 25 mocks: the darts are one category at a time on a
// dartboard (mock 03), under a glass "coming soon" until the morning's are
// thrown; hit streaks against the hitless (mock 03); every club on a win or
// loss run of two or more as a market map (mock 09), live all day; Gary's
// parlay at the head of the featured row; Gary's record as a number over its
// chart; hit rates on the yardstick. The tape across the top carries what
// Gary hit yesterday (founder, Sep 24 2026; the streaks tape is gone). One
// read, `get_darts`, and today's parlay, both re-read whenever the ET date
// turns; the day's player cards feed the rates.

struct DartForm: Decodable, Equatable {
    struct Season: Decodable, Equatable {
        let g: Int?
        let ok: [Bool]?
        let total: Double?
    }
    /// MLB: his last games, oldest first, and how many.
    let of: Int?
    let ok: [Bool]?
    /// First inning: games each club scored in the 1st, of its last `of`.
    let away: Int?
    let home: Int?
    /// NFL: this season game by game, last season's total, the stat's unit.
    let now: Season?
    let last: Season?
    let unit: String?
}

struct DartRow: Decodable, Identifiable {
    let id: Int
    let game_date: String?
    let league: String
    let kind: String
    let player: String          // the matchup on a first-inning dart
    let player_id: LabText?
    let team: String?
    let position: String?
    let matchup: String?
    let game_id: LabText?
    let commence_time: String?
    let prop: String?
    let bet: String?
    let odds: Int?
    let scratched: Bool?
    let scratch_reason: String?
    let form: DartForm?
    /// hit | miss once graded; nil while it rides.
    let result: String?

    var isGame: Bool { kind == "first_inning" }
    /// The two clubs of a first-inning dart ("Blue Jays @ Orioles").
    var gameTeams: (away: String, home: String)? {
        let parts = (matchup ?? player).components(separatedBy: " @ ")
        return parts.count == 2 ? (parts[0], parts[1]) : nil
    }
    var isScratched: Bool { scratched == true }
}

/// The dart categories per league, in page order, with their tab names.
enum DartCategory {
    static let order: [String: [(kind: String, title: String)]] = [
        "MLB": [("hr", "HOME RUNS"), ("multihit", "2+ HITS"), ("first_inning", "1ST INNING RUN")],
        // Tight end TD and first TD dropped (founder, Sep 23 2026); rushing
        // yards added (Sep 24).
        "NFL": [("td", "ANYTIME TD"), ("qbtd", "QB RUSHING TD"), ("recyds", "RECEIVING YARDS"),
                ("rushyds", "RUSHING YARDS"), ("passtd", "PASSING TDS"), ("int", "INTERCEPTIONS")],
    ]
    /// A one-game NFL night puts the quarterback rushing touchdowns last and
    /// the interceptions just before them (founder, Sep 24 2026); a full
    /// slate keeps the order above.
    static func order(_ league: String, oneGame: Bool) -> [(kind: String, title: String)] {
        let base = order[league] ?? []
        guard league == "NFL", oneGame else { return base }
        let tail = ["int", "qbtd"]
        return base.filter { !tail.contains($0.kind) } + tail.compactMap { k in base.first { $0.kind == k } }
    }
}

struct DartsRun: Decodable {
    struct TeamStreak: Decodable { let league: String?; let team: String?; let streak: Int? }
    struct LeagueStreak: Decodable { let league: String?; let streak: Int?; let latest: String? }
    struct Dogs: Decodable { let league: String?; let won: Int?; let lost: Int?; let units: LabNumber? }
    struct Day: Decodable { let league: String?; let date: String?; let won: Int?; let lost: Int? }
    struct BestGame: Decodable { let league: String?; let pick_text: String?; let price: Int? }
    struct BestProp: Decodable { let league: String?; let player_name: String?; let prop_type: String?; let odds: LabText?; let actual_value: LabNumber?; let matchup: String? }
    struct Slot: Decodable { let slot: String?; let won: Int?; let lost: Int? }
    let team_streaks: [TeamStreak]?
    let league_streaks: [LeagueStreak]?
    let dogs: [Dogs]?
    let daily: [Day]?
    let best_games: [BestGame]?
    let best_props: [BestProp]?
    let primetime: [Slot]?
}

/// A lean from yesterday that hit (get_darts `yesterday`, Sep 23 2026). The
/// page only celebrates hits; misses stay in the table, never on screen.
struct DartHit: Decodable, Identifiable {
    let id: Int
    let league: String
    let kind: String
    let player: String          // the matchup on a first-inning dart
    let matchup: String?
    let bet: String?
    let odds: Int?
    let actual: LabNumber?
    /// The line on a prop (last week's NFL hits); nil on a dart.
    let line: LabNumber?
}

struct DartsBoard: Decodable {
    let date: String?
    let today: [DartRow]
    let yesterday: [DartHit]?
    /// The NFL plays weekly: last week's props that won.
    let last_week: [DartHit]?
    let streaks: [StreakRow]
    let run: DartsRun?
}

extension SupabaseAPI {
    static func fetchDarts(date: String) async throws -> DartsBoard {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_darts", body: ["p_date": date])
        return try JSONDecoder().decode(DartsBoard.self, from: data)
    }
}

struct DartsView: View {
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @State private var board: DartsBoard?
    @State private var loading = true
    @State private var error: String?
    @State private var sport = ""
    /// The dart category on screen.
    @State private var kind = ""
    @State private var cardFor: DartRow?
    @State private var streakCard: StreakCardSel?
    @State private var teamCard: TeamCardSel?
    @State private var handoffCard: PlayerInsightCardRow?
    @State private var rateCard: RateCardSel?
    /// Gary's parlay of the day, when today's has been built, and the ET
    /// date it was read for: a ticket from another day never stays up.
    @State private var parlay: ParlaySlipModel?
    @State private var parlayDay = ""
    /// Yesterday's ticket: when it hit, it leads the tape and opens from there.
    @State private var pastParlay: ParlaySlipModel?
    @State private var pastSlip: PastSlip?
    /// The player a tapped parlay leg is about.
    @State private var legPlayer: LegPlayerSel?
    @State private var shareItem: PickShareItem?
    /// The featured row's other cards: tonight's big game, the start/sit
    /// column, yesterday's Winners. Each is read for the ET day at every load.
    @State private var primetime: PrimetimeModel?
    @State private var fantasy: FantasyColumnModel?
    @State private var recap: WinnersRecapModel?
    /// Tonight's hot and cold bats and arms.
    @State private var form: [PlayerFormRow] = []
    @State private var featureSheet: DartsFeatureSheet?
    /// Today's NFL games, from the day's board: a day with one opens on the NFL.
    @State private var nflGameToday = false
    @State private var showSlip = false
    /// Bumped by the tour's `darts throw` to build the board fresh.
    @State private var throwTake = 0
    @Environment(\.scenePhase) private var scenePhase

    private var today: String { GaryTour.dartsDay ?? SupabaseAPI.todayEST() }

    var body: some View {
        ZStack {
            GaryStageBackground()
            ScrollView(showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    // What Gary hit runs across the very top, above the header.
                    let hits = hitsOnTape
                    if !hits.isEmpty {
                        HitsTape(title: league == "NFL" ? "LAST WEEK GARY HIT" : "YESTERDAY GARY HIT", hits: hits) { hit in
                            if hit.kind == "parlay" { if let pastParlay { pastSlip = PastSlip(slip: pastParlay) }; return }
                            guard hit.kind != "first_inning" else { return }
                            streakCard = StreakCardSel(name: hit.player, league: hit.league)
                        }
                        .id(league)
                        .padding(.bottom, 6)
                    }
                    GaryPageHeader(title: "Darts", accent: LabFormat.shortDateWords(today), trailing: { EmptyView() })
                    if sports.count > 1 {
                        LabTextTabs(items: sports, selected: leagueBinding, size: 14, idle: DartsInk.idleTab)
                            .anchorPreference(key: ParlayTopAnchor.self, value: .bounds) { $0 }
                            .padding(.top, 10).pageGutter()
                    }
                    content.padding(.top, 12)
                    Color.clear.frame(height: 170)
                }
                // The lamp hangs over the dartboard and scrolls with it.
                .backgroundPreferenceValue(StageLampAnchor.self) { anchor in
                    GeometryReader { g in
                        if let anchor {
                            let r = g[anchor]
                            StageLamp(radius: r.width * 1.05).position(x: r.midX, y: r.midY)
                        }
                    }
                }
            }
            .refreshable { await load() }
            // The parlay ticket opens over the page from the league line.
            .overlayPreferenceValue(ParlayTopAnchor.self) { anchor in
                GeometryReader { g in
                    if showSlip, let parlay, let anchor {
                        ParlayDropCard(slip: parlay, from: g[anchor].minY, room: g.size, onClose: { closeSlip() },
                                       onLeg: { openLeg($0) },
                                       onShare: { shareItem = renderParlayShareImage(parlay).map { PickShareItem(images: [$0]) } })
                            .transition(.opacity)
                    }
                }
            }
            StatusBarScrim()
        }
        .onReceive(NotificationCenter.default.publisher(for: GaryTour.command)) { note in
            // `darts slip` opens the slip without a tap; `darts throw` throws
            // today's home run darts again; `darts league NFL` changes league;
            // `darts kind recyds` shows that category on the board.
            guard (note.userInfo?["verb"] as? String) == "darts" else { return }
            if let arg = note.userInfo?["arg"] as? String, arg.hasPrefix("league ") {
                sport = String(arg.dropFirst(7)).uppercased(); kind = ""
                return
            }
            if let arg = note.userInfo?["arg"] as? String, arg.hasPrefix("kind ") {
                kind = String(arg.dropFirst(5))
                return
            }
            #if DEBUG
            // `darts day 2026-09-24` reads that day's darts as today's (relaunch to load it); `darts day off` clears it.
            if let arg = note.userInfo?["arg"] as? String, arg.hasPrefix("day ") {
                let day = arg.dropFirst(4).trimmingCharacters(in: .whitespaces)
                if day == "off" { UserDefaults.standard.removeObject(forKey: GaryTour.dartsDayKey) }
                else { UserDefaults.standard.set(day, forKey: GaryTour.dartsDayKey) }
                return
            }
            // `darts card Pete Alonso` opens that player's card.
            if let arg = note.userInfo?["arg"] as? String, arg.hasPrefix("card ") {
                streakCard = StreakCardSel(name: String(arg.dropFirst(5)), league: league)
                return
            }
            // `darts board 3` draws design mock 3 (0: the shipping board).
            if let arg = note.userInfo?["arg"] as? String, arg.hasPrefix("board ") {
                let n = Int(arg.dropFirst(6)) ?? 0
                DartboardMock.style = n == 0 ? nil : n
                throwTake += 1
                return
            }
            #endif
            switch note.userInfo?["arg"] as? String {
            case "slip": if parlay != nil { openSlip() }
            case "primetime": if primetime != nil { featureSheet = .primetime }
            case "form": if !form.isEmpty { featureSheet = .form }
            case "all": featureSheet = .allDarts
            case "throw":
                UserDefaults.standard.removeObject(forKey: "darts.thrown.\(today).\(league)")
                kind = "hr"; throwTake += 1
            default: break
            }
        }
        .environment(\.solidPanels, true)
        .tint(GaryColors.gold)
        .background(Color.clear.sheet(item: $cardFor) { dart in DartPlayerCard(dart: dart) })
        .background(Color.clear.sheet(item: $streakCard) { sel in PlayerCardByName(name: sel.name, league: sel.league) })
        .background(Color.clear.sheet(item: $teamCard) { sel in
            DartsTeamCard(sel: sel, streaks: board?.streaks ?? []) { row in
                // Card to card: close the team card, then open the player's.
                teamCard = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { handoffCard = row }
            }
        })
        .background(Color.clear.sheet(item: $handoffCard) { PlayerInsightSheet(signal: nil, prefetched: $0) })
        .background(Color.clear.sheet(item: $rateCard) { sel in PlayerInsightSheet(signal: nil, prefetched: sel.row, logFocus: sel.focus) })
        .background(sheetHost)
        .onReceive(NotificationCenter.default.publisher(for: DartsPushFocus.note)) { _ in openPrimetimeIfAsked() }
        .task { await load() }
        .onChange(of: selectedTab) { tab in
            if tab == 2 { Task { await load(quiet: true) } } else { showSlip = false }
        }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(quiet: true) } } }
        .onReceive(Timer.publish(every: 120, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active, selectedTab == 2 else { return }
            Task { await load(quiet: true) }
        }
    }

    private func openSlip() { withAnimation(.easeOut(duration: 0.18)) { showSlip = true } }
    private func closeSlip() { withAnimation(.easeOut(duration: 0.18)) { showSlip = false } }

    /// The sheets the parlay and the featured row open, hung on their own
    /// clear views (one chain was too long to type-check).
    private var sheetHost: some View {
        ZStack {
            Color.clear.sheet(item: $legPlayer) { sel in
                if let id = sel.playerId {
                    PlayerInsightSheet(signal: nil, directPlayerId: id, directName: sel.name, directLeague: sel.league, directGameId: sel.gameId)
                } else {
                    PlayerCardByName(name: sel.name, league: sel.league)
                }
            }
            Color.clear.sheet(item: $pastSlip) { past in
                ParlaySheet(slip: past.slip) { leg in
                    pastSlip = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { openLeg(leg, closing: false) }
                }
            }
            Color.clear.sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
            Color.clear.sheet(item: $featureSheet) { sheet in featureSheetView(sheet) }
        }
        .allowsHitTesting(false)
    }

    @ViewBuilder private func featureSheetView(_ sheet: DartsFeatureSheet) -> some View {
        switch sheet {
        case .primetime:
            if let primetime {
                // The tab's own game (the MLB marquee, the NFL's Primetime);
                // an alert opened on another tab still finds its game.
                let own = primetime.games.filter { $0.league == league }
                PrimetimeSheet(model: own.isEmpty ? primetime : PrimetimeModel(date: primetime.date, games: own),
                               hasFantasy: fantasy != nil,
                               onPlayer: { bet, game in
                                   guard let name = bet.player else { return }
                                   featureSheet = nil
                                   DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                                       legPlayer = LegPlayerSel(name: name, league: game.league, playerId: bet.player_id.flatMap { Int($0) }, gameId: game.game_id)
                                   }
                               },
                               onWinners: { goToWinners() },
                               onFantasy: {
                                   featureSheet = nil
                                   DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { featureSheet = .fantasy }
                               })
            }
        case .fantasy:
            if let fantasy {
                FantasySheet(column: fantasy) { e in
                    featureSheet = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        legPlayer = LegPlayerSel(name: e.player, league: "NFL", playerId: e.player_id.flatMap { Int($0) }, gameId: e.game_id)
                    }
                }
            }
        case .winners:
            if let recap { WinnersRecapSheet(recap: recap) { goToWinners() } }
        // All Darts and Hot & Cold stop short of the top (founder, Sep 25 2026:
        // "it feels like it's still within the same page ... easy to open and
        // close with my thumb"; then "a bit higher").
        case .allDarts:
            AllDartsSheet(league: league, darts: leagueDarts, oneGame: oneNflGame) { dart in
                featureSheet = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { cardFor = dart }
            }
            .presentationDetents([.fraction(0.9)])
        case .form:
            HotColdSheet(league: league, rows: form.filter { $0.league == league }, darts: leagueDarts) { name in
                featureSheet = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { streakCard = StreakCardSel(name: name, league: league) }
            }
            .presentationDetents([.fraction(0.9)])
        }
    }

    /// A tapped Primetime alert opens the page once today's big game is read.
    private func openPrimetimeIfAsked() {
        guard DartsPushFocus.openPrimetime, primetime != nil else { return }
        DartsPushFocus.openPrimetime = false
        featureSheet = .primetime
    }

    /// UNLOCK and OPEN lead to the Winners page, where the plays and the plans are.
    private func goToWinners() {
        featureSheet = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { selectedTab = 1 }
    }

    /// A tapped leg opens its card: the player's on a player leg, the club's
    /// on a game leg.
    private func openLeg(_ leg: ParlayLeg, closing: Bool = true) {
        if closing { closeSlip() }
        let lg = leg.league ?? league
        DispatchQueue.main.asyncAfter(deadline: .now() + (closing ? 0.25 : 0)) {
            if let name = leg.player {
                legPlayer = LegPlayerSel(name: name, league: lg, playerId: leg.player_id.flatMap { Int($0) }, gameId: leg.game_id)
            } else if let club = leg.club {
                teamCard = TeamCardSel(name: club, league: lg)
            }
        }
    }

    // MARK: - Loading

    private func load(quiet: Bool = false) async {
        if !quiet { loading = board == nil }
        // The day is read at every load, so a page left open overnight turns
        // over to the new date on its next read.
        let day = today
        async let parlayRead: Result<ParlaySlipModel?, Error> = {
            do { return .success(try await SupabaseAPI.fetchParlay(date: day)) } catch { return .failure(error) }
        }()
        async let pastRead = try? SupabaseAPI.fetchParlay(date: SupabaseAPI.yesterdayEST())
        async let primetimeRead = try? SupabaseAPI.fetchPrimetime(date: day)
        async let fantasyRead: Result<FantasyColumnModel?, Error> = {
            do { return .success(try await SupabaseAPI.fetchFantasyColumn(date: day)) } catch { return .failure(error) }
        }()
        async let recapRead = try? SupabaseAPI.fetchWinnersRecap(date: SupabaseAPI.yesterdayEST())
        async let formRead = try? SupabaseAPI.fetchPlayerForm(date: day)
        async let dayBoardRead = SupabaseAPI.fetchTodayBoard(date: day)
        do {
            let fresh = try await SupabaseAPI.fetchDarts(date: day)
            await MainActor.run { board = fresh; error = nil; loading = false }
        } catch where LabFormat.isCancellation(error) {
            // Not a failure: the next appearance, tab switch or timer reads again.
            await MainActor.run { if board != nil { loading = false } }
        } catch {
            await MainActor.run { if board == nil { self.error = LabFormat.errorText(error) }; loading = false }
        }
        let slip = await parlayRead
        let past = await pastRead
        let prime = await primetimeRead
        let column = await fantasyRead
        let yesterday = await recapRead
        let formNow = await formRead
        let dayBoard = await dayBoardRead
        await MainActor.run {
            pastParlay = past
            // A failed read keeps what the page has; a day with nothing clears it.
            if let prime { primetime = prime.games.isEmpty ? nil : prime }
            if case .success(let fresh) = column { fantasy = fresh }
            if let yesterday { recap = yesterday }
            if let formNow { form = formNow }
            openPrimetimeIfAsked()
            if let dayBoard {
                nflGameToday = (dayBoard.board ?? []).contains { ($0.league ?? "").uppercased() == "NFL" && LabFormat.isTodayET($0.commence_time) }
            }
            switch slip {
            case .success(let fresh):
                parlay = fresh; parlayDay = day
                if fresh == nil { showSlip = false }
            case .failure:
                // Keep today's ticket through a failed read; never another day's.
                if parlayDay != day { parlay = nil; showSlip = false }
            }
        }
    }

    // MARK: - Derived

    /// The leagues, the NFL first on a day with an NFL game (founder, Sep 24
    /// 2026: "It's still leading with MLB first, even though there's a game
    /// today").
    private var sports: [String] {
        var s: [String] = []
        for d in board?.today ?? [] where !s.contains(d.league) { s.append(d.league) }
        for r in board?.streaks ?? [] { if let lg = r.league, !s.contains(lg) { s.append(lg) } }
        if nflDay, let i = s.firstIndex(of: "NFL") { s.remove(at: i); s.insert("NFL", at: 0) }
        return s
    }
    /// An NFL game today: one of today's darts is on it, or the day's board
    /// lists it.
    private var nflDay: Bool {
        nflGameToday || (board?.today ?? []).contains { $0.league == "NFL" && LabFormat.isTodayET($0.commence_time) }
    }
    /// The league on screen: the fan's tab; else the NFL on a day with an NFL
    /// game (founder, Sep 24 2026); else the league with darts today.
    private var league: String {
        if sports.contains(sport) { return sport }
        if nflDay, sports.contains("NFL") { return "NFL" }
        return board?.today.first?.league ?? sports.first ?? ""
    }
    private var leagueBinding: Binding<String> { Binding(get: { league }, set: { sport = $0; kind = "" }) }

    /// Today's darts for the league on screen.
    private var leagueDarts: [DartRow] { (board?.today ?? []).filter { $0.league == league } }

    /// Today's NFL darts come from one game (a Thursday or Monday night).
    private var oneNflGame: Bool {
        Set((board?.today ?? []).filter { $0.league == "NFL" }.compactMap { $0.game_id?.value }).count == 1
    }

    /// Today's categories for the league on screen, in order, each with its darts.
    private var categories: [(kind: String, title: String, rows: [DartRow])] {
        let rows = (board?.today ?? []).filter { $0.league == league }
        return DartCategory.order(league, oneGame: oneNflGame).compactMap { cat in
            let list = rows.filter { $0.kind == cat.kind }.sorted { a, b in
                // Live darts first by first pitch; a scratched one sinks.
                if a.isScratched != b.isScratched { return !a.isScratched }
                let ta = LabFormat.parseISO(a.commence_time) ?? .distantFuture
                let tb = LabFormat.parseISO(b.commence_time) ?? .distantFuture
                return ta == tb ? a.id < b.id : ta < tb
            }
            return list.isEmpty ? nil : (cat.kind, cat.title, list)
        }
    }
    /// MLB: yesterday's darts that hit. The NFL plays weekly: last week's props that won.
    private var hitsOnTape: [DartHit] {
        // Yesterday's parlay leads the tape when every leg landed.
        let parlayHit: [DartHit] = pastParlay.flatMap { p in
            LabTicketState(result: p.result) == .won
                ? [DartHit(id: -1, league: league, kind: "parlay", player: "PARLAY · \(p.legs.count) LEGS", matchup: nil, bet: nil, odds: p.american_odds, actual: nil, line: nil)]
                : nil
        } ?? []
        return parlayHit + (board?.yesterday ?? []).filter { $0.league == league } + (league == "NFL" ? (board?.last_week ?? []) : [])
    }

    private var streaks: [StreakRow] {
        (board?.streaks ?? []).filter { ($0.league ?? "") == league }
    }

    // MARK: - Content

    @ViewBuilder private var content: some View {
        if loading && board == nil {
            HStack { Spacer(); ProgressView().tint(GaryColors.gold).scaleEffect(1.2); Spacer() }.padding(.top, 60)
        } else if error != nil, board == nil {
            Text("Darts couldn't be read.").font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.warmWhite)
                .frame(maxWidth: .infinity).padding(.top, 40).pageGutter()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                // The featured row (founder, Sep 24 2026: "like FanDuel... their
                // profit boost there"; the featured-row doc): the parlay at the
                // far left, then Primetime (Marquee on MLB), Winners, Fantasy,
                // Hot & Cold and All Darts when each has something today (Sep 25
                // 2026). Before today's ticket is built, the parlay card says
                // it's coming; so does Fantasy on an NFL day.
                DartsFeaturedRow(league: league, parlay: parlay, parlayOpen: showSlip, primetime: primetime, fantasy: fantasy, recap: recap,
                                 darts: leagueDarts, form: form.filter { $0.league == league },
                                 onParlay: { showSlip ? closeSlip() : openSlip() },
                                 onSheet: { featureSheet = $0 })
                    .padding(.bottom, 16)


                darts

                let pair = StreakColumnSpec.pair(for: league)
                let leftRows = streaks.filter { pair.0.kinds.contains($0.kind ?? "") }.sorted { ($0.length ?? 0) > ($1.length ?? 0) }
                let rightRows = streaks.filter { pair.1.kinds.contains($0.kind ?? "") }.sorted { ($0.length ?? 0) > ($1.length ?? 0) }
                if !leftRows.isEmpty || !rightRows.isEmpty {
                    PlayerStreakColumns(left: (pair.0, leftRows), right: (pair.1, rightRows)) { name, lg in streakCard = StreakCardSel(name: name, league: lg) }
                        .padding(.top, 22).pageGutter()
                }

                let runs = streaks.filter { $0.kind == "win" || $0.kind == "loss" }
                if !runs.isEmpty {
                    StreakMarketMap(rows: runs) { name, lg in teamCard = TeamCardSel(name: name, league: lg) }
                        .padding(.top, 22).pageGutter()
                }


                if let run = board?.run {
                    GaryRecordPanel(league: league, run: run, today: today)
                        .padding(.top, 28).pageGutter()
                }

                DartsHitRates(league: league) { row, focus in rateCard = RateCardSel(row: row, focus: focus) }
                    .padding(.top, 28)
            }
        }
    }

    // MARK: - The darts

    /// One category at a time on the dartboard: its name is the tab. A
    /// sideways swipe on the board moves to the next category.
    @ViewBuilder private var darts: some View {
        // A day with nothing thrown (an NFL weekday) keeps the board up, clear.
        let thrown = categories
        let cats = thrown.isEmpty ? DartCategory.order(league, oneGame: oneNflGame).map { (kind: $0.kind, title: $0.title, rows: [DartRow]()) } : thrown
        if cats.isEmpty {
            EmptyView()
        } else {
            let index = cats.firstIndex { $0.kind == kind } ?? 0
            let current = cats[index]
            VStack(alignment: .leading, spacing: 6) {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        LabTextTabs(items: cats.map(\.title), selected: Binding(
                            get: { current.title },
                            set: { title in withAnimation(.easeOut(duration: 0.2)) { kind = cats.first { $0.title == title }?.kind ?? kind } }), size: 14, idle: DartsInk.idleTab)
                            .padding(.horizontal, GaryLayout.gutter)
                    }
                    // A swipe on the board keeps its tab in view.
                    .onChange(of: current.title) { title in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(title, anchor: .center) } }
                }
                Dartboard(darts: current.rows,
                          throwOnce: current.kind == "hr" ? "darts.thrown.\(today).\(league)" : nil,
                          activePage: selectedTab == 2 && scenePhase == .active,
                          onPlayer: { cardFor = $0 },
                          onTeam: { name, lg in teamCard = TeamCardSel(name: name, league: lg) })
                    // Nothing thrown yet today: glass over the board.
                    .overlay { if thrown.isEmpty { DartboardGlass() } }
                    .anchorPreference(key: StageLampAnchor.self, value: .bounds) { $0 }
                    .id("\(current.kind)-\(throwTake)")
                    .transition(.opacity)
                    .pageGutter()
                    .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { v in
                        // A clear sideways swipe, not a scroll.
                        guard abs(v.translation.width) > 60, abs(v.translation.width) > abs(v.translation.height) * 1.6 else { return }
                        let next = v.translation.width < 0 ? index + 1 : index - 1
                        guard cats.indices.contains(next) else { return }
                        withAnimation(.easeOut(duration: 0.2)) { kind = cats[next].kind }
                    })
            }
        }
    }

    struct StreakCardSel: Identifiable { let name: String; let league: String; var id: String { "\(league):\(name)" } }
    struct RateCardSel: Identifiable { let row: PlayerInsightCardRow; let focus: LogFocus; var id: String { row.id } }
    struct TeamCardSel: Identifiable { let name: String; let league: String; var id: String { "\(league):\(name)" } }
    struct LegPlayerSel: Identifiable {
        let name: String; let league: String; let playerId: Int?; let gameId: String?
        var id: String { "\(league):\(name)" }
    }
    struct PastSlip: Identifiable { let slip: ParlaySlipModel; var id: String { slip.date } }
}

/// A dart's player card: the standard card by his id and game (a
/// doubleheader has one per game), by name when the dart carries no id.
struct DartPlayerCard: View {
    let dart: DartRow
    var body: some View {
        if let id = dart.player_id?.value.flatMap({ Int($0) }) {
            PlayerInsightSheet(signal: nil, directPlayerId: id, directName: dart.player, directLeague: dart.league, directGameId: dart.game_id?.value)
        } else {
            PlayerCardByName(name: dart.player, league: dart.league)
        }
    }
}

/// The standard team card (the Hub's), opened from any team name on Darts:
/// the day board, the league's streaks and the day's player cards come
/// with it, the same inputs the Hub hands it.
struct DartsTeamCard: View {
    let sel: DartsView.TeamCardSel
    let streaks: [StreakRow]
    let onPlayer: (PlayerInsightCardRow) -> Void
    @State private var board: TomorrowBoard?
    @State private var intel: [PlayerInsightCardRow] = []
    @State private var loaded = false

    private var hubLeague: HubLeagueSel { HubLeagueSel.from(sel.league) ?? .mlb }
    private var signal: Signal {
        Signal(league: hubLeague, kind: .teamRecord, headline: sel.name, detail: "", game: "", value: "", tone: .neutral)
    }
    /// Tonight's row: the one game this club plays in the league today.
    private var tonight: TomorrowBoardRow? {
        let rows = (board?.board ?? []).filter { r in
            guard HubCardIdentity.sameLeague(r.league, sel.league) else { return false }
            let away = HubCardIdentity.matchesTeam(sel.name, name: r.away_team, abbr: r.away_abbr, league: sel.league)
            let home = HubCardIdentity.matchesTeam(sel.name, name: r.home_team, abbr: r.home_abbr, league: sel.league)
            return away != home
        }
        return rows.first
    }

    var body: some View {
        Group {
            if loaded {
                HubTeamCardSheet(
                    signal: signal, related: [], tonight: tonight, board: board,
                    streaks: streaks.filter { HubCardIdentity.sameLeague($0.league, sel.league) },
                    intel: intel,
                    cardFor: { name in
                        guard let name else { return nil }
                        let names = intel.map { $0.player_name ?? $0.payload?.name ?? "" }
                        return HubCardIdentity.uniquePlayerIndex(name, names: names).map { intel[$0] }
                    },
                    onPlayer: onPlayer,
                    onSignal: { _ in })
            } else {
                ProgressView().tint(GaryColors.gold).frame(maxWidth: .infinity, maxHeight: .infinity).background(GaryColors.darkBg.ignoresSafeArea())
            }
        }
        .task {
            let today = SupabaseAPI.todayEST()
            async let b = SupabaseAPI.fetchTodayBoard(date: today)
            async let rows = SupabaseAPI.fetchPlayerIntelRows(date: today)
            board = await b
            intel = await rows.filter { HubCardIdentity.sameLeague($0.league, sel.league) && $0.payload != nil }
            loaded = true
        }
    }
}

/// The standard player card, found by name in today's cards (the day's
/// cards carry the id the card fetch needs). No card today: says so.
struct PlayerCardByName: View {
    let name: String
    let league: String
    @State private var row: PlayerInsightCardRow?
    @State private var loading = true

    var body: some View {
        Group {
            if let row {
                PlayerInsightSheet(signal: nil, prefetched: row)
            } else if loading {
                ProgressView().tint(GaryColors.gold).frame(maxWidth: .infinity, maxHeight: .infinity).background(GaryColors.darkBg.ignoresSafeArea())
            } else {
                VStack(spacing: 6) {
                    Text(name.uppercased()).font(GaryFonts.display(28)).foregroundStyle(GaryColors.warmWhite)
                    Text("NO CARD").font(GaryFonts.display(14)).tracking(2).foregroundStyle(LabInk.dim)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity).background(GaryColors.darkBg.ignoresSafeArea())
            }
        }
        .task {
            let rows = await SupabaseAPI.fetchPlayerIntelRows(date: SupabaseAPI.todayEST())
            // A doubleheader gives a player one card per game: collapse to one
            // row per player before asking whether the name is unique.
            var seen = Set<String>()
            let candidates = rows.filter { HubCardIdentity.sameLeague($0.league, league) && $0.payload != nil }
                .filter { seen.insert($0.player_id ?? $0.player_name ?? UUID().uuidString).inserted }
            if let index = HubCardIdentity.uniquePlayerIndex(name, names: candidates.map { $0.player_name ?? $0.payload?.name ?? "" }) {
                row = candidates[index]
            }
            loading = false
        }
    }
}

extension LabFormat {
    /// "Chicago Cubs" → "Cubs", "Toronto Blue Jays" → "Blue Jays": the app's
    /// one shortener, which knows every two-word name (Sep 25 2026).
    static func nickname(_ team: String) -> String {
        Formatters.shortTeamName(team)
    }
}
