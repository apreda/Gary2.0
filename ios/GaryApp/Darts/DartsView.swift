import SwiftUI

// DARTS — Gary's fun leans for the day (founder, Sep 22 2026): its own lane,
// thrown every morning from the day's real markets, five per category. Never
// graded, never on any record. MLB: home run, 2+ hits and a run, first-inning
// run. NFL: anytime TD, tight end TD, QB rushing TD, first TD, receiving
// yards, passing TDs, interception thrown. A player who sits is scratched.
// Also the league's streaks and Gary's run. One read: `get_darts`.

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
    let reason: String?
    let scratched: Bool?
    let scratch_reason: String?

    var isGame: Bool { kind == "first_inning" }
    var isScratched: Bool { scratched == true }
    /// The big line: the player, or the first-inning call.
    var title: String {
        if isGame { return (bet ?? "over") == "under" ? "NO RUN IN THE 1ST" : "RUN IN THE 1ST" }
        return player.uppercased()
    }
    /// The market and its price, as the page prints it.
    var marketLine: [(String, String)] {
        let line = LabFormat.trailingNumber(prop) ?? ""
        switch kind {
        case "hr": return [("HOME RUN", LabFormat.price(odds))]
        case "hits_run": return [("2+ HITS", LabFormat.price(odds)), ("RUN", LabFormat.price(odds_alt))]
        case "first_inning": return [("FIRST INNING", LabFormat.price(odds))]
        case "td": return [("ANYTIME TD", LabFormat.price(odds))]
        case "tetd": return [("TIGHT END TD", LabFormat.price(odds))]
        case "qbtd": return [("QB RUSHING TD", LabFormat.price(odds))]
        case "ftd": return [("FIRST TD", LabFormat.price(odds))]
        case "recyds": return [("OVER \(line) REC YDS", LabFormat.price(odds))]
        case "passtd": return [("OVER \(line) PASS TDS", LabFormat.price(odds))]
        case "int": return [("INTERCEPTION THROWN", LabFormat.price(odds))]
        default: return [(LabFormat.marketWords(prop).uppercased(), LabFormat.price(odds))]
        }
    }
}

/// The dart categories per league, in page order, with their tab names.
enum DartCategory {
    static let order: [String: [(kind: String, tab: String)]] = [
        "MLB": [("hr", "HOME RUNS"), ("hits_run", "HITS + RUN"), ("first_inning", "1ST INNING")],
        "NFL": [("td", "ANYTIME TD"), ("tetd", "TE TD"), ("qbtd", "QB TD"), ("ftd", "FIRST TD"),
                ("recyds", "REC YDS"), ("passtd", "PASS TDS"), ("int", "INTS")],
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
    @State private var dartTab = ""
    @State private var open: DartRow?
    @State private var streakCard: StreakCardSel?
    @ObservedObject private var liveCache = LiveScoreCache.shared
    @Environment(\.scenePhase) private var scenePhase

    private var today: String { SupabaseAPI.todayEST() }

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
        .background(Color.clear.sheet(item: $open) { dart in DartSheet(dart: dart, state: state(dart)).presentationDetents([.large]) })
        .background(Color.clear.sheet(item: $streakCard) { sel in PlayerCardByName(name: sel.name, league: sel.league) })
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
            await MainActor.run { board = fresh; error = nil; loading = false; liveCache.startIfNeeded() }
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
    private func filtered(_ rows: [DartRow]) -> [DartRow] {
        let now = Date()
        return rows.filter { $0.league == league }.sorted { a, b in
            let ta = LabFormat.parseISO(a.commence_time) ?? .distantFuture
            let tb = LabFormat.parseISO(b.commence_time) ?? .distantFuture
            if (ta > now) != (tb > now) { return ta > now }
            return ta == tb ? a.id < b.id : ta < tb
        }
    }
    /// Category tabs: the league's categories that have a dart today.
    private func dartTabs(_ rows: [DartRow]) -> [(kind: String, tab: String)] {
        let kinds = Set(rows.map(\.kind))
        return (DartCategory.order[league] ?? []).filter { kinds.contains($0.kind) }
    }
    private var streaks: [StreakRow] {
        (board?.streaks ?? []).filter { ($0.league ?? "") == league }
    }

    enum DartState { case sealed(String?), live(String, String?), scratched(String?) }
    private func state(_ d: DartRow) -> DartState {
        if d.isScratched { return .scratched(d.scratch_reason) }
        if let live = liveScore(d) {
            if live.isFinal { return .live("Final", live.scoreLine) }
            if live.isLive { return .live(live.detail ?? "Live", live.scoreLine) }
        }
        return .sealed(d.commence_time)
    }
    private func liveScore(_ d: DartRow) -> LiveScore? {
        if let id = d.game_id?.value, let n = Int(id), let hit = liveCache.status(forGameId: n, league: d.league) { return hit }
        if let m = d.matchup { return liveCache.status(forMatchup: m) }
        return nil
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
            let todayRows = filtered(board?.today ?? [])
            let tabs = dartTabs(todayRows)
            let kind = tabs.contains { $0.kind == dartTab } ? dartTab : tabs.first?.kind ?? ""
            LazyVStack(alignment: .leading, spacing: 12) {
                sectionHead("TODAY", note: LabFormat.shortDateWords(today))
                if todayRows.isEmpty {
                    sealedCard
                } else {
                    if tabs.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LabTextTabs(items: tabs.map(\.tab), selected: Binding(
                                get: { tabs.first { $0.kind == kind }?.tab ?? "" },
                                set: { name in dartTab = tabs.first { $0.tab == name }?.kind ?? "" }), size: 13)
                        }
                    }
                    ForEach(todayRows.filter { $0.kind == kind }) { dart in module(dart) }
                }

                if !streaks.isEmpty {
                    sectionHead("STREAKS", note: nil).padding(.top, 18)
                    let tabs = streakTabs
                    if tabs.count > 1 { LabTextTabs(items: tabs, selected: streakBinding, size: 13) }
                    streakPlate
                }

                if let run = board?.run {
                    sectionHead("GARY'S RUN", note: nil).padding(.top, 18)
                    runPlates(run)
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
                Text("TODAY'S DARTS").font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
                Spacer()
                Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.4))
    }

    // MARK: - A dart

    private func module(_ d: DartRow) -> some View {
        let st = state(d)
        return Button { open = d } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Text(d.league).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                    Text(d.matchup ?? d.team ?? "").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer()
                    Text(LabFormat.timeET(d.commence_time)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                }
                .padding(.horizontal, 16).padding(.top, 13)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(d.title).font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite)
                                .lineLimit(1).minimumScaleFactor(0.6)
                            if let pos = d.position, d.league == "NFL" { Text(pos).font(GaryFonts.display(13)).tracking(1).foregroundStyle(LabInk.dim) }
                        }
                        DartMarketLine(parts: d.marketLine, size: 15)
                        stateLine(st)
                    }
                    Spacer(minLength: 6)
                }
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 13)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate(radius: 14, edge: LabInk.hair)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func stateLine(_ st: DartState) -> some View {
        switch st {
        case .scratched(let reason):
            HStack(spacing: 8) {
                LabStateWord(text: "Scratched", color: GaryColors.silver, size: 15)
                if let reason { Text(reason).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim) }
            }
        case .live(let detail, let score):
            HStack(spacing: 8) {
                LabStateWord(text: detail.uppercased() == "FINAL" ? "Final" : "Live", color: detail.uppercased() == "FINAL" ? GaryColors.silver : GaryColors.sweating, pulse: detail.uppercased() != "FINAL", size: 15)
                if let score { Text(score).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(LabInk.dim) }
                if detail.uppercased() != "FINAL" { Text(detail).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim) }
            }
        case .sealed(let commence):
            LabCountdown(commence: commence, prefix: "throws")
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

    private var streakPlate: some View {
        let kinds = Self.streakGroups.first { $0.0 == streakGroup }?.1 ?? []
        let rows = Array(streaks.filter { kinds.contains($0.kind ?? "") }
            .sorted { ($0.length ?? 0) > ($1.length ?? 0) }.prefix(12))
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, r in
                if index > 0 { LabHairline().padding(.leading, 16) }
                streakRow(r)
            }
        }
        .labPlate(radius: 14)
    }

    private func badge(_ r: StreakRow) -> (String, Color) {
        let n = r.length ?? 0
        switch r.kind {
        case "win": return ("W\(n)", GaryColors.win)
        case "loss": return ("L\(n)", GaryColors.loss)
        case "cover": return ("ATS \(n)", GaryColors.gold)
        case "nocover": return ("ATS 0-\(n)", GaryColors.loss)
        case "hit": return ("\(n) GM", GaryColors.gold)
        case "hr": return ("HR ×\(n)", GaryColors.gold)
        case "td": return ("TD ×\(n)", GaryColors.gold)
        case "rush100", "rec100": return ("100 ×\(n)", GaryColors.gold)
        case "hitless": return ("0-\(n)", GaryColors.loss)
        case "over": return ("O ×\(n)", GaryColors.gold)
        case "under": return ("U ×\(n)", GaryColors.gold)
        default: return ("\(n)", GaryColors.silver)
        }
    }

    @ViewBuilder private func streakRow(_ r: StreakRow) -> some View {
        if r.subject_type == "player", let name = r.subject, let lg = r.league {
            Button { streakCard = StreakCardSel(name: name, league: lg) } label: { streakLine(r) }
                .buttonStyle(.plain)
        } else {
            streakLine(r)
        }
    }

    private func streakLine(_ r: StreakRow) -> some View {
        let (word, color) = badge(r)
        let isPlayer = r.subject_type == "player"
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(word).font(GaryFonts.display(18)).foregroundStyle(color).frame(width: 74, alignment: .leading)
                .lineLimit(1).minimumScaleFactor(0.7)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(r.subject ?? "").font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite).lineLimit(1).minimumScaleFactor(0.7)
                    if isPlayer, let team = r.team { Text(LabFormat.nickname(team)).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim) }
                }
                if let detail = LabFormat.streakDetail(r.detail) { Text(detail).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim).lineLimit(2) }
            }
            Spacer(minLength: 6)
            if let next = r.next_game {
                Text(next).font(GaryFonts.ui(11, .semibold)).foregroundStyle(GaryColors.gold.opacity(0.85))
                    .multilineTextAlignment(.trailing).lineLimit(2).minimumScaleFactor(0.8).frame(maxWidth: 110, alignment: .trailing)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    // MARK: - Gary's run

    @ViewBuilder private func runPlates(_ run: DartsRun) -> some View {
        let teams = (run.team_streaks ?? []).filter { ($0.league ?? "") == league }
        if !teams.isEmpty {
            runPlate("ON A RUN") {
                ForEach(Array(teams.enumerated()), id: \.offset) { _, t in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(t.streak ?? 0) STRAIGHT").font(GaryFonts.display(18)).foregroundStyle(GaryColors.win).frame(width: 110, alignment: .leading)
                        Text((t.team ?? "").uppercased()).font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite).lineLimit(1).minimumScaleFactor(0.7)
                        Spacer()
                    }
                }
            }
        }
        let bestProp = run.best_props?.first { ($0.league ?? "") == league }.flatMap { p -> (String, String)? in
            guard let name = p.player_name else { return nil }
            let market = (p.prop_type ?? "").hasPrefix("home_run") ? "HOME RUN" : (p.prop_type ?? "").hasPrefix("anytime") ? "ANYTIME TD" : LabFormat.marketWords(p.prop_type).uppercased()
            let odds = p.odds?.value.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) }
            return ("\(name.uppercased()) · \(market)", LabFormat.price(odds))
        }
        let bestGame = run.best_games?.first { ($0.league ?? "") == league }.flatMap { g -> (String, String)? in
            guard let pick = g.pick_text else { return nil }
            return (LabFormat.ticketBody(pick).uppercased(), LabFormat.price(g.price))
        }
        if bestProp != nil || bestGame != nil {
            runPlate("YESTERDAY'S BIG ONE") {
                if let (label, price) = bestProp { runLine(label, value: price, tint: GaryColors.win) }
                if let (label, price) = bestGame { runLine(label, value: price, tint: GaryColors.win) }
            }
        }
        let slots = (run.primetime ?? []).filter { ($0.won ?? 0) + ($0.lost ?? 0) > 0 }
        if league == "NFL", !slots.isEmpty {
            runPlate("PRIMETIME") {
                ForEach(Array(slots.enumerated()), id: \.offset) { _, s in
                    runLine(s.slot ?? "", value: "\(s.won ?? 0)-\(s.lost ?? 0)", tint: (s.won ?? 0) > (s.lost ?? 0) ? GaryColors.win : (s.won ?? 0) < (s.lost ?? 0) ? GaryColors.loss : GaryColors.silver)
                }
            }
        }
        if let active = run.league_streaks?.first(where: { ($0.league ?? "") == league }), (active.streak ?? 0) >= 2 {
            runPlate("RIGHT NOW") {
                runLine("\(active.streak ?? 0) STRAIGHT", value: "", tint: GaryColors.win)
            }
        }
        if let dogs = run.dogs?.first(where: { ($0.league ?? "") == league }), (dogs.won ?? 0) + (dogs.lost ?? 0) > 0 {
            runPlate("UNDERDOGS, LAST 30 DAYS") {
                runLine("\(dogs.won ?? 0)-\(dogs.lost ?? 0)", value: LabFormat.unitsNet(dogs.units?.value),
                        tint: (dogs.units?.value ?? 0) > 0.049 ? GaryColors.win : (dogs.units?.value ?? 0) < -0.049 ? GaryColors.loss : GaryColors.silver)
            }
        }
    }

    private func runPlate<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LabTitle(text: title)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate(radius: 14)
    }

    private func runLine(_ label: String, value: String, tint: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label).font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite).lineLimit(1).minimumScaleFactor(0.6)
            Spacer()
            if !value.isEmpty { Text(value).font(GaryFonts.display(18)).foregroundStyle(tint).monospacedDigit() }
        }
    }
}

/// A market and its price, or two ("2+ HITS +266 · RUN -106").
struct DartMarketLine: View {
    let parts: [(String, String)]
    var size: CGFloat = 15
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                if i > 0 { Text("·").font(GaryFonts.display(size)).foregroundStyle(LabInk.dim) }
                Text(part.0).font(GaryFonts.display(size)).tracking(0.8).foregroundStyle(GaryColors.silver)
                Text(part.1).font(GaryFonts.display(size)).foregroundStyle(GaryColors.gold)
            }
        }
        .lineLimit(1).minimumScaleFactor(0.7)
    }
}

/// A dart opened: the hero, Gary's take in full, his player card.
struct DartSheet: View {
    let dart: DartRow
    let state: DartsView.DartState
    @Environment(\.dismiss) private var dismiss
    @State private var showCard = false

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Text(dart.league).font(GaryFonts.display(14)).tracking(1.4).foregroundStyle(GaryColors.gold)
                            Text(dart.matchup ?? "").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
                            Spacer()
                            Text(LabFormat.timeET(dart.commence_time)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                        }
                        Text(dart.title).font(GaryFonts.display(40)).foregroundStyle(GaryColors.warmWhite).lineLimit(2).minimumScaleFactor(0.6)
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            DartMarketLine(parts: dart.marketLine, size: 22)
                            Spacer()
                            stateWord
                        }
                    }
                    .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                    .labPlate(radius: 16, edge: GaryColors.gold.opacity(0.5))

                    if let reason = dart.reason, !reason.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            LabTitle(text: "GARY'S TAKE")
                            Text(LabFormat.prose(LabFormat.stripTakeHeading(reason)))
                                .font(GaryFonts.text(14)).foregroundStyle(LabInk.reading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .labPlate(radius: 14)
                    }

                    if !dart.isGame {
                    Button { showCard = true } label: {
                        HStack {
                            Text("PLAYER CARD").font(GaryFonts.display(16)).tracking(1.2).foregroundStyle(GaryColors.gold)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(LabInk.dim)
                        }
                        .padding(16).frame(maxWidth: .infinity)
                        .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.35))
                        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    }
                    Color.clear.frame(height: 30)
                }
                .padding(.horizontal, GaryLayout.gutter).padding(.top, 8)
            }
            .background(GaryColors.ink.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(LabInk.dim) }
                }
            }
        }
        .tint(GaryColors.gold)
        .sheet(isPresented: $showCard) {
            if let id = dart.player_id?.value.flatMap({ Int($0) }) {
                PlayerInsightSheet(signal: nil, directPlayerId: id, directName: dart.player, directLeague: dart.league)
            } else {
                PlayerCardByName(name: dart.player, league: dart.league)
            }
        }
    }

    @ViewBuilder private var stateWord: some View {
        switch state {
        case .scratched: LabStateWord(text: "Scratched", color: GaryColors.silver, size: 18)
        case .live(let d, let s): HStack(spacing: 6) { LabStateWord(text: d.uppercased() == "FINAL" ? "Final" : "Live", color: d.uppercased() == "FINAL" ? GaryColors.silver : GaryColors.sweating, pulse: d.uppercased() != "FINAL", size: 18); if let s { Text(s).font(GaryFonts.data(12, .semibold)).foregroundStyle(LabInk.dim) } }
        case .sealed(let commence): LabCountdown(commence: commence, prefix: "throws")
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
            let candidates = rows.filter { HubCardIdentity.sameLeague($0.league, league) }
            if let index = HubCardIdentity.uniquePlayerIndex(name, names: candidates.map { $0.player_name ?? $0.payload?.name ?? "" }),
               candidates[index].payload != nil {
                row = candidates[index]
            }
            loading = false
        }
    }
}

extension LabFormat {
    /// "Chicago Cubs" → "Cubs".
    static func nickname(_ team: String) -> String { team.split(separator: " ").last.map(String.init) ?? team }
    /// A streak detail without the badge prefix and without the dash.
    static func streakDetail(_ detail: String?) -> String? {
        guard var d = detail?.trimmingCharacters(in: .whitespaces), !d.isEmpty else { return nil }
        for sep in [" — ", " - "] { if let r = d.range(of: sep) { d = String(d[r.upperBound...]) } }
        return d.isEmpty ? nil : d
    }
}
