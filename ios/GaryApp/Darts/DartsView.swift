import SwiftUI

// DARTS — Gary's fun leans for the day (founder, Sep 22 2026): its own lane,
// thrown every morning from the day's real markets, five per category. Never
// graded, never on any record, never sealed. Built out Sep 23 ("do it your
// way for real"), from the 25 mocks: the league's streaks run as a tape across
// the top; the darts are one category at a time on a dartboard (mock 03); hit
// streaks against the hitless (mock 03); the clubs on a win or loss run as a
// market map (mock 09); Gary's parlay; Gary's record as a number over its
// chart; the other streaks set good against bad; hit rates on the yardstick.
// One read, `get_darts`; the day's player cards feed the rates.

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
        "NFL": [("td", "ANYTIME TD"), ("tetd", "TIGHT END TD"), ("qbtd", "QB RUSHING TD"), ("ftd", "FIRST TD"),
                ("recyds", "RECEIVING YARDS"), ("passtd", "PASSING TDS"), ("int", "INTERCEPTIONS")],
    ]
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
}

struct DartsBoard: Decodable {
    let date: String?
    let today: [DartRow]
    let yesterday: [DartHit]?
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
    /// Gary's parlay of the day, when today's has been built.
    @State private var parlay: ParlaySlipModel?
    @State private var showSlip = false
    /// Bumped by the tour's `darts throw` to build the board fresh.
    @State private var throwTake = 0
    @Environment(\.scenePhase) private var scenePhase

    private var today: String { SupabaseAPI.todayEST() }

    var body: some View {
        ZStack {
            WinnersDepthBackground()
            ScrollView(showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    GaryPageHeader(title: "Darts", accent: LabFormat.shortDateWords(today), trailing: { EmptyView() })
                    if sports.count > 1 { LabTextTabs(items: sports, selected: leagueBinding, size: 14).padding(.top, 10).pageGutter() }
                    content.padding(.top, 12)
                    Color.clear.frame(height: 170)
                }
            }
            .refreshable { await load() }
            // The parlay ticket drops down from its emblem, over the page.
            .overlayPreferenceValue(ParlayEmblemAnchor.self) { anchor in
                GeometryReader { g in
                    if showSlip, let parlay, let anchor {
                        ParlayDropCard(slip: parlay, below: g[anchor], room: g.size) { closeSlip() }
                            .transition(.opacity)
                    }
                }
            }
            StatusBarScrim()
        }
        .task { parlay = try? await SupabaseAPI.fetchParlay(date: today) }
        .onReceive(NotificationCenter.default.publisher(for: GaryTour.command)) { note in
            // `darts slip` opens the slip without a tap; `darts throw` throws
            // today's home run darts again.
            guard (note.userInfo?["verb"] as? String) == "darts" else { return }
            switch note.userInfo?["arg"] as? String {
            case "slip": if parlay != nil { openSlip() }
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
        .task { await load() }
        .onAppear { GaryTalkContext.shared.focus(date: today, label: "Darts", context: "The fan is on Darts: Gary's fun leans for today (home runs, 2+ hits, first-inning runs; touchdowns, yards, passing touchdowns, interceptions), never graded or on his record, plus the league streaks, Gary's record and hit rates.") }
        .onDisappear { GaryTalkContext.shared.clear() }
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

    // MARK: - Loading

    private func load(quiet: Bool = false) async {
        if !quiet { loading = board == nil }
        do {
            let fresh = try await SupabaseAPI.fetchDarts(date: today)
            await MainActor.run { board = fresh; error = nil; loading = false }
        } catch where LabFormat.isCancellation(error) {
            // Not a failure: the next appearance, tab switch or timer reads again.
            await MainActor.run { if board != nil { loading = false } }
        } catch {
            await MainActor.run { if board == nil { self.error = LabFormat.errorText(error) }; loading = false }
        }
    }

    // MARK: - Derived

    private var sports: [String] {
        var s: [String] = []
        for d in board?.today ?? [] where !s.contains(d.league) { s.append(d.league) }
        for r in board?.streaks ?? [] { if let lg = r.league, !s.contains(lg) { s.append(lg) } }
        return s
    }
    /// The league on screen: the fan's tab, else the league with darts today.
    private var league: String {
        if sports.contains(sport) { return sport }
        return board?.today.first?.league ?? sports.first ?? ""
    }
    private var leagueBinding: Binding<String> { Binding(get: { league }, set: { sport = $0; kind = "" }) }

    /// Today's categories for the league on screen, in order, each with its darts.
    private var categories: [(kind: String, title: String, rows: [DartRow])] {
        let rows = (board?.today ?? []).filter { $0.league == league }
        return (DartCategory.order[league] ?? []).compactMap { cat in
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
    private var streaks: [StreakRow] {
        (board?.streaks ?? []).filter { ($0.league ?? "") == league }
    }

    /// The tape: the league's longest runs, the good and the bad taking turns.
    private var tapeItems: [TapeItem] {
        let sorted = streaks.sorted { ($0.length ?? 0) > ($1.length ?? 0) }
        let bad: Set<String> = ["hitless", "loss", "nocover"]
        let down = sorted.filter { bad.contains($0.kind ?? "") }
        let up = sorted.filter { !bad.contains($0.kind ?? "") }
        var picked: [StreakRow] = []
        var i = 0
        while picked.count < 14, i < max(up.count, down.count) {
            if i < up.count { picked.append(up[i]) }
            if i < down.count, picked.count < 14 { picked.append(down[i]) }
            i += 1
        }
        return picked.enumerated().compactMap { n, r in
            guard let subject = r.subject, let lg = r.league, let words = Self.tapeWords(r) else { return nil }
            let isPlayer = r.subject_type == "player"
            let name = isPlayer ? PlayerName.split(subject).last : LabFormat.nickname(subject)
            let tone: TapeItem.Tone = bad.contains(r.kind ?? "") ? .down : (r.kind == "over" || r.kind == "under") ? .even : .up
            return TapeItem(id: "\(n)-\(subject)-\(r.kind ?? "")", name: name.uppercased(), run: words, tone: tone) {
                if isPlayer { streakCard = StreakCardSel(name: subject, league: lg) } else { teamCard = TeamCardSel(name: subject, league: lg) }
            }
        }
    }
    private static func tapeWords(_ r: StreakRow) -> String? {
        guard let n = r.length, n > 0 else { return nil }
        switch r.kind {
        case "hit": return "HIT IN \(n)"
        case "hitless": return "0 FOR \(n)"
        case "hr": return "HOMERED IN \(n)"
        case "td": return "TD IN \(n)"
        case "rush100", "rec100": return "100 YARDS IN \(n)"
        case "win": return "WON \(n)"
        case "loss": return "LOST \(n)"
        case "cover": return "COVERED \(n)"
        case "nocover": return "NO COVER IN \(n)"
        case "over": return "OVER IN \(n)"
        case "under": return "UNDER IN \(n)"
        default: return nil
        }
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
                // Yesterday's hits, and beside them the parlay emblem.
                let hits = (board?.yesterday ?? []).filter { $0.league == league }
                if !hits.isEmpty || parlay != nil {
                    HStack(alignment: .center, spacing: 12) {
                        if !hits.isEmpty { YesterdayHits(hits: hits).id(league) } else { Spacer(minLength: 0) }
                        if let parlay {
                            ParlayEmblem(slip: parlay, open: showSlip) { showSlip ? closeSlip() : openSlip() }
                                .anchorPreference(key: ParlayEmblemAnchor.self, value: .bounds) { $0 }
                        }
                    }
                    .padding(.bottom, 14).pageGutter()
                }

                let tape = tapeItems
                if !tape.isEmpty { StreakTape(items: tape).padding(.bottom, 14) }

                darts

                let pair = StreakColumnSpec.pair(for: league)
                let leftRows = Array(streaks.filter { pair.0.kinds.contains($0.kind ?? "") }.sorted { ($0.length ?? 0) > ($1.length ?? 0) }.prefix(5))
                let rightRows = Array(streaks.filter { pair.1.kinds.contains($0.kind ?? "") }.sorted { ($0.length ?? 0) > ($1.length ?? 0) }.prefix(5))
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
        let cats = thrown.isEmpty ? (DartCategory.order[league] ?? []).map { (kind: $0.kind, title: $0.title, rows: [DartRow]()) } : thrown
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
                            set: { title in withAnimation(.easeOut(duration: 0.2)) { kind = cats.first { $0.title == title }?.kind ?? kind } }), size: 14)
                            .padding(.horizontal, GaryLayout.gutter)
                    }
                    // A swipe on the board keeps its tab in view.
                    .onChange(of: current.title) { title in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(title, anchor: .center) } }
                }
                Dartboard(darts: current.rows,
                          throwOnce: current.kind == "hr" ? "darts.thrown.\(today).\(league)" : nil,
                          onPlayer: { cardFor = $0 },
                          onTeam: { name, lg in teamCard = TeamCardSel(name: name, league: lg) })
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
    /// "Chicago Cubs" → "Cubs", "Toronto Blue Jays" → "Blue Jays".
    static func nickname(_ team: String) -> String {
        let words = team.split(separator: " ").map(String.init)
        guard let last = words.last else { return team }
        if words.count >= 2, ["Sox", "Jays"].contains(last) { return words.suffix(2).joined(separator: " ") }
        return last
    }
}
