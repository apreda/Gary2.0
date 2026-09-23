import SwiftUI

/// HIT RATES — the yardstick as a table (founder, Sep 22 2026: "an
/// interactive table where I can move the yardstick part, or I could look at
/// certain tabs I can click on"). Tonight's players ranked by how often they
/// reached the mark: pick the stat, slide the ruler, pick the window. A row
/// opens the player's card on the same stat, mark and window.
struct DartsHitRates: View {
    let league: String
    var onPlayer: (PlayerInsightCardRow, LogFocus) -> Void
    @State private var cards: [PlayerInsightCardRow] = []
    @State private var stat: LogStat = LogStat.batting[0]
    @State private var mark = LogMark(value: LogStat.batting[0].start)
    @State private var window: LogWindow = .last10
    @State private var shown = 15

    private static let mlbStats: [LogStat] = LogStat.batting + LogStat.pitching.filter { ["k", "outs"].contains($0.key) }
    /// The league's stats: MLB's hitting and the starters' two, or the NFL's.
    private var stats: [LogStat] { league == "NFL" ? LogStat.nfl : Self.mlbStats }
    /// The NFL's log runs across two seasons, so it has no season window.
    private var windows: [LogWindow] { league == "NFL" ? [.last5, .last10, .last20] : LogWindow.allCases }

    var body: some View {
        let ranked = rows
        Group {
            if !pool.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("HIT RATES").font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold)
                        .padding(.top, 2).pageGutter()
                    ScrollView(.horizontal, showsIndicators: false) {
                        LabTextTabs(items: stats.map(\.title), selected: statBinding, size: 13)
                            .padding(.horizontal, GaryLayout.gutter)
                    }
                    GaryRuler(value: markBinding, range: range, name: stat.title.capitalized,
                              spoken: { LogMark(value: $0 * stat.step).words(stat).lowercased() },
                              label: { "\($0 * stat.step)" })
                        .pageGutter()
                    // The mark in words beside the windows; the windows drop
                    // under it when a long stat needs the width.
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            readout.fixedSize()
                            Spacer(minLength: 8)
                            windowTabs
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            readout.fixedSize(horizontal: false, vertical: true)
                            windowTabs
                        }
                    }
                    .pageGutter()
                    table(ranked).pageGutter()
                }
            } else {
                // The load hangs off a view that exists before the cards do.
                Color.clear.frame(height: 0)
            }
        }
        .task(id: league) { await load() }
        // Tour: `darts stat TOTAL BASES`, `darts mark 3`, `darts window L5`, `darts rate 1`.
        .onGaryTour { verb, arg in
            guard verb == "darts" else { return }
            let parts = arg.split(separator: " ", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return }
            switch parts[0] {
            case "stat": statBinding.wrappedValue = parts[1]
            case "mark": if let v = Int(parts[1]) { mark.value = v }
            case "window": windowBinding.wrappedValue = parts[1]
            case "rate":
                if let n = Int(parts[1]), n >= 1, n <= rows.count {
                    onPlayer(rows[n - 1].card, LogFocus(stat: stat, mark: mark, window: window))
                }
            default: break
            }
        }
    }

    private var readout: some View {
        Text(mark.words(stat)).font(GaryFonts.display(22)).tracking(0.6).foregroundStyle(GaryColors.warmWhite)
    }
    private var windowTabs: some View {
        LabTextTabs(items: windows.map(\.rawValue), selected: windowBinding, size: 13).fixedSize()
    }

    // MARK: - Data

    private func load() async {
        let all = await SupabaseAPI.fetchPlayerIntelRows(date: SupabaseAPI.todayEST())
        // A doubleheader gives a player a card per game; the log is the same.
        var seen = Set<String>()
        let mine = all.filter { HubCardIdentity.sameLeague($0.league, league) && $0.payload?.log != nil }
            .filter { seen.insert($0.player_id ?? $0.player_name ?? UUID().uuidString).inserted }
        await MainActor.run {
            cards = mine; shown = 15
            // A league change opens on the league's first stat.
            if !stats.contains(stat), let first = stats.first { stat = first; mark = LogMark(value: first.start) }
            if !windows.contains(window) { window = .last10 }
        }
    }

    /// Tonight's players the stat belongs to: hitters or the starters; the
    /// NFL's receivers and backs, or its quarterbacks.
    private var pool: [PlayerInsightCardRow] {
        cards.filter { stat.fits(cardType: $0.payload?.type) }
    }
    private var range: ClosedRange<Int> {
        let top = pool.compactMap { $0.payload?.log?.rulerRange(stat, under: false).upperBound }.max() ?? 5
        return 1...max(top, 3)
    }

    private struct RateRow: Identifiable {
        let card: PlayerInsightCardRow
        let name: String
        let sub: String
        let values: [Double]
        let hit: Int
        let of: Int
        /// His season at the same mark, the tiebreak.
        let season: Double
        var id: String { card.id }
        var rate: Double { of > 0 ? Double(hit) / Double(of) : 0 }
    }

    /// Everyone with the whole window, best first: the share of games at the
    /// mark, then the count, then his season at the same mark.
    private var rows: [RateRow] {
        let built: [RateRow] = pool.compactMap { card in
            guard let log = card.payload?.log, let t = log.tally(stat, mark, window) else { return nil }
            if window == .season, t.of < 20 { return nil }
            let values = window.games.map { Array(log.series(stat).suffix($0)) } ?? []
            let season = log.tally(stat, mark, .season).map { $0.of > 0 ? Double($0.hit) / Double($0.of) : 0 } ?? 0
            return RateRow(card: card, name: card.player_name ?? card.payload?.name ?? "", sub: subline(card),
                           values: values, hit: t.hit, of: t.of, season: season)
        }
        return built.sorted { a, b in
            if a.rate != b.rate { return a.rate > b.rate }
            if a.hit != b.hit { return a.hit > b.hit }
            if a.season != b.season { return a.season > b.season }
            return a.name < b.name
        }
    }

    /// The team, and who he faces tonight: the starter for a hitter, the
    /// game for a starter.
    private func subline(_ card: PlayerInsightCardRow) -> String {
        let team = card.team_abbr ?? card.payload?.team ?? ""
        let versus: String? = {
            if card.payload?.type == "pitcher" { return card.payload?.game }
            return card.payload?.opponent?.name.map { "vs \($0)" }
        }()
        return [team, versus].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: - The table

    @ViewBuilder private func table(_ ranked: [RateRow]) -> some View {
        if ranked.isEmpty {
            Text("No one yet.").font(GaryFonts.ui(13, .medium)).foregroundStyle(LabInk.dim)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(ranked.prefix(shown).enumerated()), id: \.element.id) { i, r in
                    if i > 0 { LabHairline().padding(.leading, 14) }
                    Button { onPlayer(r.card, LogFocus(stat: stat, mark: mark, window: window)) } label: { row(r, rank: i + 1) }
                        .buttonStyle(.plain)
                }
                if ranked.count > shown {
                    LabHairline()
                    Button { withAnimation(.easeOut(duration: 0.2)) { shown += 15 } } label: {
                        Text("MORE").font(GaryFonts.display(14)).tracking(1.4).foregroundStyle(GaryColors.gold)
                            .frame(maxWidth: .infinity).padding(.vertical, 11).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .labPlate(radius: 14)
            .animation(.easeOut(duration: 0.2), value: ranked.map(\.id))
        }
    }

    private func row(_ r: RateRow, rank: Int) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text("\(rank)").font(GaryFonts.kicker(11, .semibold)).foregroundStyle(LabInk.dimmer)
                .frame(width: 20, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.name.uppercased()).font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if !r.sub.isEmpty {
                    Text(r.sub).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if !r.values.isEmpty { LogMiniBars(values: r.values, mark: mark) }
            Text("\(r.hit) of \(r.of)").font(GaryFonts.data(12.5, .semibold))
                .foregroundStyle(LogFormat.tint(hit: r.hit, of: r.of))
                .frame(minWidth: 58, alignment: .trailing)
                .fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    // MARK: - Bindings

    private var statBinding: Binding<String> {
        Binding(get: { stat.title }, set: { title in
            guard let next = stats.first(where: { $0.title == title }), next != stat else { return }
            stat = next
            mark = LogMark(value: next.start)
            shown = 15
        })
    }
    /// The ruler moves in the stat's notches; the mark keeps real units.
    private var markBinding: Binding<Int> {
        Binding(get: { Int((Double(mark.value) / Double(max(stat.step, 1))).rounded()) },
                set: { mark.value = $0 * max(stat.step, 1) })
    }
    private var windowBinding: Binding<String> {
        Binding(get: { window.rawValue }, set: { raw in
            if let w = LogWindow(rawValue: raw) { window = w; shown = 15 }
        })
    }
}
