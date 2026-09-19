import SwiftUI

// THE BOARD IS MOVING (founder, Sep 9 2026): The Hub's departures board — the
// week's games sorted by how far their line has moved since it opened, each
// row showing where the spread, total and moneyline opened and where they are
// now, refreshed every minute while the tab is on screen. Numbers and times
// only: no words about what a move means, nothing reaches Gary's desk. A tap
// opens THE LADDER for that game.

/// One board row, told the way the ladder tells it: the spread from the side
/// favored now, the moneyline from the favorite, the total as itself.
struct LineMoverStory: Identifiable, Equatable {
    let mover: LineMover
    let league: String
    var id: String { mover.id }

    var awayAbbr: String { scoreboardTeamAbbreviation(mover.away_team, league: league) }
    var homeAbbr: String { scoreboardTeamAbbreviation(mover.home_team, league: league) }
    var kickoff: Date? { LineClock.parse(mover.commence_time) }
    var started: Bool { kickoff.map { Date() >= $0 } ?? false }

    private var spreadFromHome: Bool { (mover.now_spread_home ?? mover.open_spread_home ?? 0) <= 0 }
    private var moneylineFromHome: Bool {
        guard let h = mover.now_ml_home ?? mover.open_ml_home, let a = mover.now_ml_away ?? mover.open_ml_away else { return true }
        return h <= a
    }
    private func spreadLine(_ home: Double?) -> Double? {
        guard let home else { return nil }
        return spreadFromHome ? home : -home
    }
    private var spreadSide: String { spreadFromHome ? homeAbbr : awayAbbr }
    private var moneylineSide: String { moneylineFromHome ? homeAbbr : awayAbbr }

    var openSpread: String? { spreadLine(mover.open_spread_home).map { "\(spreadSide) \(LineText.spread($0))" } }
    var nowSpread: String? { spreadLine(mover.now_spread_home).map { "\(spreadSide) \(LineText.spread($0))" } }
    var openTotal: String? { mover.open_total.map(LineText.number) }
    var nowTotal: String? { mover.now_total.map(LineText.number) }
    private var openFavorite: Int? { moneylineFromHome ? mover.open_ml_home : mover.open_ml_away }
    private var nowFavorite: Int? { moneylineFromHome ? mover.now_ml_home : mover.now_ml_away }
    var openMoneyline: String? { openFavorite.map { "\(moneylineSide) \(LineText.american($0))" } }
    var nowMoneyline: String? { nowFavorite.map { "\(moneylineSide) \(LineText.american($0))" } }

    /// Points the favored side's number moved (-3 → -3.5 is +½).
    var spreadDelta: Double? {
        guard let o = spreadLine(mover.open_spread_home), let n = spreadLine(mover.now_spread_home) else { return nil }
        return abs(n) - abs(o)
    }
    var totalDelta: Double? {
        guard let o = mover.open_total, let n = mover.now_total else { return nil }
        return n - o
    }
    var moneylineDelta: Int? {
        guard let o = openFavorite, let n = nowFavorite else { return nil }
        return n - o
    }
    var spreadPriceMoved: Bool { mover.open_spread_home_odds != mover.now_spread_home_odds }

    /// The biggest thing that happened to this line, as a badge: the spread in
    /// points, else the total in points, else the favorite's price, else holds.
    var badge: LineStory.Badge {
        if let d = spreadDelta, d != 0 { return .moved("\(d > 0 ? "+" : "−")\(LineText.points(d)) PT") }
        if let d = totalDelta, d != 0 { return .moved("\(d > 0 ? "+" : "−")\(LineText.points(d)) TOT") }
        if let d = moneylineDelta, d != 0 { return .moved("\(d > 0 ? "+" : "−")\(abs(d)) ML") }
        return spreadPriceMoved ? .price : .holds
    }

    /// The move a strip row shows: open → now on the market that carries the
    /// story for this sport (football the spread, baseball the favorite's
    /// price), falling back to whichever market moved, then to the number as
    /// it stands. Numbers only (founder, Sep 9: "-1.5 → -3.5 and so on").
    var leadMove: (open: String, now: String, moved: Bool) {
        let spread: (String, String, Bool)? = {
            guard let o = spreadLine(mover.open_spread_home), let n = spreadLine(mover.now_spread_home) else { return nil }
            return (LineText.spread(o), LineText.spread(n), abs(n) != abs(o))
        }()
        let price: (String, String, Bool)? = {
            guard let o = openFavorite, let n = nowFavorite else { return nil }
            return (LineText.american(o), LineText.american(n), o != n)
        }()
        let total: (String, String, Bool)? = {
            guard let o = mover.open_total, let n = mover.now_total else { return nil }
            return (LineText.number(o), LineText.number(n), o != n)
        }()
        let order = league.uppercased() == "MLB" ? [price, total, spread] : [spread, total, price]
        if let hit = order.compactMap({ $0 }).first(where: { $0.2 }) { return hit }
        if let any = order.compactMap({ $0 }).first { return any }
        return ("—", "—", false)
    }

    /// Sort weight — football by the spread, then the total, then the price;
    /// baseball (the run line is fixed) by the price first.
    var movement: Double {
        let spread = abs(spreadDelta ?? 0)
        let total = abs(totalDelta ?? 0)
        let price = Double(abs(moneylineDelta ?? 0)) / 100
        return league.uppercased() == "MLB" ? price * 4 + total * 2 + spread : spread * 4 + total * 2 + price
    }
}

/// The league's movers, refreshed every minute while on screen. One store
/// feeds the small box beside the lead and the full board it opens.
@MainActor final class LineMoversStore: ObservableObject {
    @Published var stories: [LineMoverStory] = []
    @Published var updatedAt: Date?
    @Published var loaded = false

    func run(league: String, sportKey: String) async {
        await load(league: league, sportKey: sportKey)
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(60))
            if Task.isCancelled { break }
            await load(league: league, sportKey: sportKey)
        }
    }

    func load(league: String, sportKey: String) async {
        let today = SupabaseAPI.todayEST()
        let to: String = {
            guard LineSport.weekLong(league) else { return today }
            let base = Date.parse(iso: "\(today)T00:00:00Z") ?? Date()
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "UTC"); f.dateFormat = "yyyy-MM-dd"
            return f.string(from: base.addingTimeInterval(6 * 86_400))
        }()
        let movers = await SupabaseAPI.fetchLineMovers(sport: sportKey, from: today, to: to)
        guard !Task.isCancelled else { return }
        let built = movers
            .map { LineMoverStory(mover: $0, league: league) }
            .filter { $0.nowSpread != nil || $0.nowMoneyline != nil || $0.nowTotal != nil }
            .sorted { a, b in
                if a.movement != b.movement { return a.movement > b.movement }
                return (a.kickoff ?? .distantFuture) < (b.kickoff ?? .distantFuture)
            }
        loaded = true
        if built != stories { stories = built }
        if !built.isEmpty { updatedAt = Date() }
    }
}

/// Line movement as the founder drew it (Sep 9): a slim strip to the right
/// of the lead card. Game and move, three rows, a door to the full board.
/// It never pushes the dashboard down and takes no width when empty.
struct HubLineMoversAside: View {
    let league: String
    let sportKey: String
    let onGame: (LineMoverStory) -> Void

    @StateObject private var store = LineMoversStore()
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase

    private static let shownCount = 5

    var body: some View {
        Group {
            if store.stories.contains(where: { !$0.started }) {
                strip.padding(.leading, 8)
            } else {
                // A zero-size host keeps the loader alive; an empty Group has
                // no view for `.task` to run on (seen live Sep 9: no strip).
                Color.clear.frame(width: 0, height: 0)
            }
        }
        .task(id: activePage && scenePhase == .active ? sportKey : nil) {
            guard activePage, scenePhase == .active else { return }
            await store.run(league: league, sportKey: sportKey)
        }
    }

    private var strip: some View {
        // The box stands as tall as the lead card beside it (Sep 9 2026), so
        // the rows spread through that height instead of huddling at the top,
        // and the type is sized for the room.
        VStack(alignment: .leading, spacing: 0) {
            Text("LINE MOVES")
                .hubKickerFont(9).tracking(0.8)
                .foregroundStyle(GaryColors.gold)
                .lineLimit(1).minimumScaleFactor(0.8)
                .padding(.bottom, 8)
            // Pregame only: once a game starts its "now" is a live price, not
            // line movement. Started games keep their ladder from the board.
            let shown = Array(store.stories.filter { !$0.started }.prefix(Self.shownCount))
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, story in
                let move = story.leadMove
                if index > 0 { Spacer(minLength: 6) }
                Button { onGame(story) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(story.awayAbbr) @ \(story.homeAbbr)")
                            .hubDataFont(11.5, .semibold)
                            .foregroundStyle(GaryColors.warmWhite)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Text("\(move.open) → \(move.now)")
                            .hubDataFont(11, .bold)
                            .foregroundStyle(move.moved ? GaryColors.gold : GaryColors.warmWhite.opacity(0.5))
                            .lineLimit(1).minimumScaleFactor(0.7)
                            .contentTransition(.numericText())
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(story.awayAbbr) at \(story.homeAbbr), opened \(move.open), now \(move.now)")
                .accessibilityHint("Opens every move on this line")
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 10)
        .frame(width: 100, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
        .animation(.easeInOut(duration: 0.35), value: store.stories)
    }
}
private extension Date {
    static func parse(iso: String) -> Date? { parseISO8601(iso) }
}

/// The Hub's ladder sheet selection — a movers row that opens its ladder.
struct LineLadderSel: Identifiable, Equatable {
    let story: LineMoverStory
    let sportKey: String
    var id: String { story.id }
}

/// Loads a ladder for a Hub row, then shows THE LADDER.
struct LineLadderLoader: View {
    let sel: LineLadderSel
    @State private var ladder: LineLadder?
    @State private var loaded = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if let ladder, !ladder.rungs.isEmpty {
                LineLadderSheet(story: LineStory(ladder: ladder, awayAbbr: sel.story.awayAbbr, homeAbbr: sel.story.homeAbbr,
                                                 kickoff: sel.story.kickoff ?? LineClock.parse(ladder.commence_time)),
                                league: sel.story.league)
            } else {
                VStack(spacing: 10) {
                    Text(loaded ? "NO LADDER FOR THIS GAME YET" : "LOADING THE LADDER")
                        .font(GaryFonts.mono(13, bold: true)).tracking(2).foregroundStyle(GaryColors.gold)
                    if loaded {
                        Button("Close") { dismiss() }
                            .font(GaryFonts.text(14, .medium)).foregroundStyle(ScoutMock.warm.opacity(0.7))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(ScoutMock.card.ignoresSafeArea())
                .presentationDetents([.large])
            }
        }
        .task(id: sel.id) {
            ladder = await SupabaseAPI.fetchLineLadder(sport: sel.sportKey, date: sel.story.mover.game_date, gameID: sel.story.mover.game_id)
            loaded = true
        }
    }
}
