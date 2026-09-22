import SwiftUI

// DARTS — Gary's fun leans for the day (founder, Sep 22 2026): its own lane,
// thrown every morning from the day's real markets, five per category. Never
// graded, never on any record, never sealed. The page is tables: each
// category is one table of names and prices, the categories swipe side to
// side; then the league's streaks; then Gary's run. One read: `get_darts`.

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
    let odds_alt: Int?          // the run leg on a 2+ hits and a run dart
    let scratched: Bool?

    var isGame: Bool { kind == "first_inning" }
    /// The two clubs of a first-inning dart ("Blue Jays @ Orioles").
    var gameTeams: (away: String, home: String)? {
        let parts = (matchup ?? player).components(separatedBy: " @ ")
        return parts.count == 2 ? (parts[0], parts[1]) : nil
    }
    var isScratched: Bool { scratched == true }
    /// The small line under the name: team (and the line when there is one), and the time.
    var subline: String {
        var bits: [String] = []
        if isGame {
            bits.append((bet ?? "over") == "under" ? "NO" : "YES")
        } else {
            if let team { bits.append(LabFormat.nickname(team)) }
            if kind == "recyds" || kind == "passtd", let line = LabFormat.trailingNumber(prop) { bits.append("over \(line)") }
        }
        let time = LabFormat.timeET(commence_time)
        if !time.isEmpty { bits.append(time) }
        return bits.joined(separator: " · ")
    }
}

/// The dart categories per league, in page order, with their table titles.
enum DartCategory {
    static let order: [String: [(kind: String, title: String)]] = [
        "MLB": [("hr", "HOME RUNS"), ("hits_run", "2+ HITS AND A RUN"), ("first_inning", "1ST INNING RUN")],
        "NFL": [("td", "ANYTIME TD"), ("tetd", "TIGHT END TD"), ("qbtd", "QB RUSHING TD"), ("ftd", "FIRST TD"),
                ("recyds", "RECEIVING YARDS"), ("passtd", "PASSING TDS"), ("int", "INTERCEPTION THROWN")],
    ]
}

struct DartsRun: Decodable {
    struct TeamStreak: Decodable { let league: String?; let team: String?; let streak: Int? }
    struct LeagueStreak: Decodable { let league: String?; let streak: Int?; let latest: String? }
    struct Dogs: Decodable { let league: String?; let won: Int?; let lost: Int?; let units: LabNumber? }
    struct BestGame: Decodable { let league: String?; let pick_text: String?; let price: Int? }
    struct BestProp: Decodable { let league: String?; let player_name: String?; let prop_type: String?; let odds: LabText?; let actual_value: LabNumber?; let matchup: String? }
    struct Slot: Decodable { let slot: String?; let won: Int?; let lost: Int? }
    let team_streaks: [TeamStreak]?
    let league_streaks: [LeagueStreak]?
    let dogs: [Dogs]?
    let best_games: [BestGame]?
    let best_props: [BestProp]?
    let primetime: [Slot]?
}

struct DartsBoard: Decodable {
    let date: String?
    let today: [DartRow]
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
    @State private var streakTab = ""
    @State private var cardFor: DartRow?
    @State private var streakCard: StreakCardSel?
    @State private var teamCard: TeamCardSel?
    @State private var handoffCard: PlayerInsightCardRow?
    @Environment(\.scenePhase) private var scenePhase

    private var today: String { SupabaseAPI.todayEST() }
    private let tableWidth = UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 34)   // the next table peeks

    var body: some View {
        ZStack {
            WinnersDepthBackground()
            ScrollView(showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    GaryPageHeader(title: "Darts", accent: LabFormat.shortDateWords(today), trailing: { EmptyView() })
                    if sports.count > 1 { LabTextTabs(items: sports, selected: leagueBinding, size: 14).padding(.top, 12).pageGutter() }
                    content.padding(.top, 14)
                    Color.clear.frame(height: 170)
                }
            }
            .refreshable { await load() }
            StatusBarScrim()
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
        .task { await load() }
        .onAppear { GaryTalkContext.shared.focus(date: today, label: "Darts", context: "The fan is on Darts: Gary's fun leans for today (home runs, hits and a run, first-inning runs; touchdowns, yards, passing touchdowns, interceptions), never graded or on his record, plus the league streaks and Gary's run.") }
        .onDisappear { GaryTalkContext.shared.clear() }
        .onChange(of: selectedTab) { tab in if tab == 2 { Task { await load(quiet: true) } } }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(quiet: true) } } }
        .onReceive(Timer.publish(every: 120, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active, selectedTab == 2 else { return }
            Task { await load(quiet: true) }
        }
    }

    // MARK: - Loading

    private func load(quiet: Bool = false) async {
        if !quiet { loading = board == nil }
        do {
            let fresh = try await SupabaseAPI.fetchDarts(date: today)
            await MainActor.run { board = fresh; error = nil; loading = false }
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
    private var leagueBinding: Binding<String> { Binding(get: { league }, set: { sport = $0 }) }
    /// Today's tables for the league on screen, in category order.
    private var tables: [(title: String, rows: [DartRow])] {
        let rows = (board?.today ?? []).filter { $0.league == league }
        return (DartCategory.order[league] ?? []).compactMap { cat in
            let list = rows.filter { $0.kind == cat.kind }.sorted {
                let ta = LabFormat.parseISO($0.commence_time) ?? .distantFuture
                let tb = LabFormat.parseISO($1.commence_time) ?? .distantFuture
                return ta == tb ? $0.id < $1.id : ta < tb
            }
            return list.isEmpty ? nil : (cat.title, list)
        }
    }
    private var streaks: [StreakRow] {
        (board?.streaks ?? []).filter { ($0.league ?? "") == league }
    }

    // MARK: - Content

    @ViewBuilder private var content: some View {
        if loading && board == nil {
            HStack { Spacer(); ProgressView().tint(GaryColors.gold).scaleEffect(1.2); Spacer() }.padding(.top, 60)
        } else if let error, board == nil {
            VStack(spacing: 8) {
                Text("Darts couldn't be read.").font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.warmWhite)
                Text(error).font(GaryFonts.ui(12)).foregroundStyle(LabInk.dim).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.top, 40).pageGutter()
        } else {
            LazyVStack(alignment: .leading, spacing: 12) {
                sectionHead("TODAY'S DARTS").pageGutter()
                let t = tables
                if t.isEmpty {
                    Text("None yet.").font(GaryFonts.ui(13, .medium)).foregroundStyle(LabInk.dim).pageGutter()
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(alignment: .top, spacing: 12) {
                            ForEach(Array(t.enumerated()), id: \.offset) { _, table in
                                dartTable(table.title, rows: table.rows)
                            }
                        }
                        .snapTargets()
                        .padding(.horizontal, GaryLayout.gutter)
                    }
                    .snapAligned()
                }

                if !streaks.isEmpty {
                    sectionHead("STREAKS").padding(.top, 18).pageGutter()
                    let tabs = streakTabs
                    if tabs.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LabTextTabs(items: tabs, selected: streakBinding, size: 13).padding(.horizontal, GaryLayout.gutter)
                        }
                    }
                    streakTable.pageGutter()
                }

                if let run = board?.run {
                    sectionHead("GARY'S RUN").padding(.top, 18).pageGutter()
                    runGrid(run).pageGutter()
                }
            }
        }
    }

    private func sectionHead(_ title: String) -> some View {
        Text(title).font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold).padding(.top, 2)
    }

    // MARK: - The dart tables

    private func dartTable(_ title: String, rows: [DartRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(GaryFonts.display(16)).tracking(1.2).foregroundStyle(GaryColors.gold)
                .padding(.horizontal, 14).padding(.top, 13).padding(.bottom, 8)
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, d in
                if i > 0 { LabHairline().padding(.leading, 14) }
                dartRow(d)
            }
        }
        .padding(.bottom, 4)
        .frame(width: tableWidth, alignment: .leading)
        .labPlate(radius: 14)
    }

    @ViewBuilder private func dartRow(_ d: DartRow) -> some View {
        let line = HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if d.isGame, let teams = d.gameTeams {
                    HStack(spacing: 6) {
                        teamButton(teams.away, league: d.league, size: 17, struck: d.isScratched)
                        Text("@").font(GaryFonts.display(15)).foregroundStyle(LabInk.dim)
                        teamButton(teams.home, league: d.league, size: 17, struck: d.isScratched)
                    }
                } else {
                    Text(d.player.uppercased())
                        .font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite)
                        .strikethrough(d.isScratched, color: LabInk.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(d.subline).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 1) {
                if d.isScratched {
                    Text("SCRATCHED").font(GaryFonts.display(13)).tracking(1).foregroundStyle(GaryColors.silver)
                } else {
                    Text(LabFormat.price(d.odds)).font(GaryFonts.display(19)).foregroundStyle(GaryColors.gold).monospacedDigit()
                    if d.kind == "hits_run", let run = d.odds_alt {
                        Text("RUN \(LabFormat.price(run))").font(GaryFonts.display(12)).tracking(0.6).foregroundStyle(GaryColors.silver)
                    }
                }
            }
            .fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .contentShape(Rectangle())
        if d.isGame {
            line
        } else {
            Button { cardFor = d } label: { line }.buttonStyle(.plain)
        }
    }

    // MARK: - Streaks

    struct StreakCardSel: Identifiable { let name: String; let league: String; var id: String { "\(league):\(name)" } }

    /// Streak tabs by kind; a tab shows only when the league has a run in it.
    private static let streakGroups: [(String, Set<String>)] = [
        ("HITS", ["hit", "hitless"]),
        ("HR", ["hr"]),
        ("TD", ["td"]),
        ("100 YDS", ["rush100", "rec100"]),
        ("W/L", ["win", "loss"]),
        ("ATS", ["cover", "nocover"]),
        ("O/U", ["over", "under"]),
    ]
    private var streakTabs: [String] {
        let kinds = Set(streaks.compactMap { $0.kind })
        return Self.streakGroups.filter { !$0.1.isDisjoint(with: kinds) }.map { $0.0 }
    }
    private var streakGroup: String {
        let tabs = streakTabs
        return tabs.contains(streakTab) ? streakTab : tabs.first ?? ""
    }
    private var streakBinding: Binding<String> { Binding(get: { streakGroup }, set: { streakTab = $0 }) }

    private var streakTable: some View {
        let kinds = Self.streakGroups.first { $0.0 == streakGroup }?.1 ?? []
        let rows = Array(streaks.filter { kinds.contains($0.kind ?? "") }
            .sorted { ($0.length ?? 0) > ($1.length ?? 0) }.prefix(10))
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, r in
                if index > 0 { LabHairline().padding(.leading, 14) }
                streakRow(r)
            }
        }
        .labPlate(radius: 14)
    }

    /// What the run is, in words: "2 straight 100-yard receiving games".
    private func streakWords(_ r: StreakRow) -> String {
        let n = r.length ?? 0
        switch r.kind {
        case "win": return "\(n) straight wins"
        case "loss": return "\(n) straight losses"
        case "cover": return "Covered \(n) straight"
        case "nocover": return "\(n) straight without a cover"
        case "hit": return "A hit in \(n) straight games"
        case "hitless": return "0 for his last \(n)"
        case "hr": return "Homered in \(n) straight games"
        case "td": return "A touchdown in \(n) straight games"
        case "rush100": return "\(n) straight 100-yard rushing games"
        case "rec100": return "\(n) straight 100-yard receiving games"
        case "over": return "Over in \(n) straight"
        case "under": return "Under in \(n) straight"
        default: return "\(n) straight"
        }
    }

    @ViewBuilder private func streakRow(_ r: StreakRow) -> some View {
        let isPlayer = r.subject_type == "player"
        let line = HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text((r.subject ?? "").uppercased()).font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                Text(isPlayer && r.team != nil ? "\(LabFormat.nickname(r.team ?? "")) · \(streakWords(r))" : streakWords(r))
                    .font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            if let next = r.next_game {
                VStack(alignment: .trailing, spacing: 1) {
                    ForEach(next.components(separatedBy: " · "), id: \.self) { part in
                        Text(part).font(GaryFonts.ui(11, .semibold)).foregroundStyle(GaryColors.gold.opacity(0.85))
                    }
                }
                .fixedSize()
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
        if isPlayer, let name = r.subject, let lg = r.league {
            Button { streakCard = StreakCardSel(name: name, league: lg) } label: { line }.buttonStyle(.plain)
        } else if let name = r.subject, let lg = r.league {
            Button { teamCard = TeamCardSel(name: name, league: lg) } label: { line }.buttonStyle(.plain)
        } else {
            line
        }
    }

    // MARK: - Teams

    struct TeamCardSel: Identifiable { let name: String; let league: String; var id: String { "\(league):\(name)" } }

    /// A team name that opens the team card.
    private func teamButton(_ name: String, league: String, size: CGFloat, struck: Bool = false) -> some View {
        Button { if !name.isEmpty { teamCard = TeamCardSel(name: name, league: league) } } label: {
            Text(name.uppercased()).font(GaryFonts.display(size)).foregroundStyle(GaryColors.warmWhite)
                .strikethrough(struck, color: LabInk.dim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Gary's run

    @ViewBuilder private func runGrid(_ run: DartsRun) -> some View {
        let teams = (run.team_streaks ?? []).filter { ($0.league ?? "") == league }
        let dogs = run.dogs?.first { ($0.league ?? "") == league }
        let active = run.league_streaks?.first { ($0.league ?? "") == league }
        let bestProp = run.best_props?.first { ($0.league ?? "") == league }
        let bestGame = run.best_games?.first { ($0.league ?? "") == league }
        let slots = (run.primetime ?? []).filter { ($0.won ?? 0) + ($0.lost ?? 0) > 0 }

        VStack(alignment: .leading, spacing: 12) {
            if !teams.isEmpty {
                runTile("ON A RUN") {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .leading, spacing: 8) {
                        ForEach(Array(teams.enumerated()), id: \.offset) { _, t in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(t.streak ?? 0)").font(GaryFonts.display(20)).foregroundStyle(GaryColors.win).monospacedDigit()
                                teamButton(t.team ?? "", league: t.league ?? league, size: 17)
                            }
                        }
                    }
                }
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .leading, spacing: 12) {
                if let active, (active.streak ?? 0) >= 2 {
                    runTile("RIGHT NOW") { runFigure("\(active.streak ?? 0) STRAIGHT", tint: GaryColors.win) }
                }
                if let dogs, (dogs.won ?? 0) + (dogs.lost ?? 0) > 0 {
                    let net = dogs.units?.value ?? 0
                    runTile("UNDERDOGS, 30 DAYS") {
                        runFigure("\(dogs.won ?? 0)-\(dogs.lost ?? 0)", tint: GaryColors.warmWhite)
                        Text(LabFormat.unitsNet(dogs.units?.value)).font(GaryFonts.display(16))
                            .foregroundStyle(net > 0.049 ? GaryColors.win : net < -0.049 ? GaryColors.loss : GaryColors.silver)
                    }
                }
                if league == "NFL", !slots.isEmpty {
                    runTile("PRIMETIME") {
                        ForEach(Array(slots.enumerated()), id: \.offset) { _, s in
                            HStack {
                                Text(s.slot ?? "").font(GaryFonts.display(16)).foregroundStyle(GaryColors.warmWhite)
                                Spacer()
                                Text("\(s.won ?? 0)-\(s.lost ?? 0)").font(GaryFonts.display(16)).monospacedDigit()
                                    .foregroundStyle((s.won ?? 0) > (s.lost ?? 0) ? GaryColors.win : (s.won ?? 0) < (s.lost ?? 0) ? GaryColors.loss : GaryColors.silver)
                            }
                        }
                    }
                }
                if let p = bestProp, let name = p.player_name {
                    let odds = p.odds?.value.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) }
                    runTile("YESTERDAY'S BIG PROP") {
                        Text(name.uppercased()).font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                        Text(LabFormat.price(odds)).font(GaryFonts.display(18)).foregroundStyle(GaryColors.win)
                    }
                }
                if let g = bestGame, let pick = g.pick_text {
                    runTile("YESTERDAY'S BIG PICK") {
                        Text(LabFormat.ticketBody(pick).uppercased()).font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                        Text(LabFormat.price(g.price)).font(GaryFonts.display(18)).foregroundStyle(GaryColors.win)
                    }
                }
            }
        }
    }

    private func runTile<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabTitle(text: title)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .labPlate(radius: 14)
    }

    private func runFigure(_ text: String, tint: Color) -> some View {
        Text(text).font(GaryFonts.display(24)).foregroundStyle(tint).monospacedDigit()
    }
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
