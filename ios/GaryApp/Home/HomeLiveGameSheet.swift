import SwiftUI

/// THE GAME, LIVE (founder, Sep 22 2026: "the live score on the home page
/// needs to show inning etc, and then if a user clicks it they could see which
/// props or things have happened in the game").
///
/// Tapping a live marquee hero opens this. It answers three questions in the
/// order a fan asks them: what is the score right now, where does Gary's money
/// stand, and what has actually happened. Every number comes from feeds the
/// app already polls — `live_scores` for the score, the count and the cashed
/// events, `LivePropStatsCache` for a batting prop's live value — so the sheet
/// costs one prop read and nothing else.
struct HomeLiveGameSheet: View {
    let league: String
    let matchup: String
    let gameID: String?
    let live: LiveScore?
    /// Gary's game bet as the marquee already words it ("Rays ML +116").
    let pickLine: String?
    @Environment(\.dismiss) private var dismiss
    @StateObject private var propCache = LivePropStatsCache.shared
    @State private var props: [PropPick] = []
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    scoreboard
                    if let pickLine, !pickLine.isEmpty { garysBet(pickLine) }
                    if !props.isEmpty { propsSection }
                    if let events = live?.events, !events.isEmpty { eventsSection(events) }
                    if !loading && props.isEmpty && (live?.events ?? []).isEmpty { quietState }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
            }
            .background(GaryColors.ink.ignoresSafeArea())
            .navigationTitle(matchup)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }.foregroundStyle(GaryColors.gold)
                }
            }
        }
        .task { await load() }
    }

    // MARK: - The score

    private var scoreboard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(league.uppercased()).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
                Spacer()
                if live?.isLive == true {
                    HStack(spacing: 6) {
                        Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                        Text("LIVE").font(GaryFonts.display(13)).tracking(1.2).foregroundStyle(GaryColors.win)
                    }
                } else if live?.isFinal == true {
                    Text("FINAL").font(GaryFonts.display(13)).tracking(1.2).foregroundStyle(GaryColors.silver)
                }
            }
            // The clubs stack, the way the home card and every scoreboard
            // stacks them; the clock sits to their right.
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    side(live?.away_abbr, live?.away_score, leading: (live?.away_score ?? 0) > (live?.home_score ?? 0))
                    side(live?.home_abbr, live?.home_score, leading: (live?.home_score ?? 0) > (live?.away_score ?? 0))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    if let detail = live?.detail, !detail.isEmpty {
                        Text(detail.uppercased()).font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite)
                    }
                    if let count = countLine { Text(count).font(GaryFonts.ui(12, .medium)).foregroundStyle(.white.opacity(0.55)) }
                }
            }
            if league.uppercased() == "MLB", live?.isLive == true, live?.hasGameState == true { diamond }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(GaryColors.warmWhite.opacity(0.18), lineWidth: 1))
    }

    private func side(_ abbr: String?, _ score: Int?, leading: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text((abbr ?? "").uppercased()).font(GaryFonts.display(26))
                .foregroundStyle(leading ? GaryColors.gold : .white.opacity(0.72))
                .frame(width: 62, alignment: .leading)
            Text(score.map(String.init) ?? "—").font(GaryFonts.display(30))
                .foregroundStyle(leading ? GaryColors.warmWhite : .white.opacity(0.72))
        }
    }

    /// "1 out" / "2 outs" — the count a fan reads off a scoreboard.
    private var countLine: String? {
        guard league.uppercased() == "MLB", live?.isLive == true, let outs = live?.outs else { return nil }
        return outs == 1 ? "1 out" : "\(outs) outs"
    }

    /// The bases, drawn the way a scoreboard draws them.
    private var diamond: some View {
        HStack(spacing: 10) {
            ZStack {
                base(occupied: live?.onSecond == true).offset(y: -9)
                base(occupied: live?.onThird == true).offset(x: -11)
                base(occupied: live?.onFirst == true).offset(x: 11)
            }
            .frame(width: 40, height: 26)
            Text(runnersLine).font(GaryFonts.ui(12, .medium)).foregroundStyle(.white.opacity(0.55))
            Spacer()
        }
    }

    private func base(occupied: Bool) -> some View {
        RoundedRectangle(cornerRadius: 1.5)
            .fill(occupied ? GaryColors.gold : Color.white.opacity(0.16))
            .frame(width: 9, height: 9)
            .rotationEffect(.degrees(45))
    }

    private var runnersLine: String {
        let on = [live?.onFirst == true ? "first" : nil, live?.onSecond == true ? "second" : nil, live?.onThird == true ? "third" : nil].compactMap { $0 }
        if on.isEmpty { return "Bases empty" }
        if on.count == 3 { return "Bases loaded" }
        return "Runner on " + on.joined(separator: " and ")
    }

    // MARK: - Gary's money

    private func garysBet(_ line: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Gary's bet")
            Text(line.uppercased()).font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite)
                .lineLimit(2).minimumScaleFactor(0.6)
        }
    }

    private var propsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle(props.count == 1 ? "His prop on this game" : "His props on this game")
            ForEach(props, id: \.id) { prop in
                let line = Double(prop.line ?? "") ?? Double(LabFormat.trailingNumber(prop.prop) ?? "") ?? 0
                let observed = propCache.observation(for: prop)
                let value = observed?.line.value(forMarket: prop.prop ?? "").map(Double.init)
                VStack(alignment: .leading, spacing: 6) {
                    Text(LabFormat.propTicket(prop)).font(GaryFonts.text(14, .semibold)).foregroundStyle(.white.opacity(0.92))
                        .lineLimit(2).minimumScaleFactor(0.7)
                    LabPropTracker(line: line,
                                   isUnder: (prop.bet ?? "").lowercased().contains("under"),
                                   value: value,
                                   started: live?.isLive == true || live?.isFinal == true || value != nil,
                                   isFinal: observed?.isFinal ?? (live?.isFinal == true),
                                   result: nil,
                                   unit: LabFormat.marketWords(prop.prop))
                }
            }
        }
    }

    // MARK: - What has happened

    private func eventsSection(_ events: [LiveEvent]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("What's happened")
            ForEach(Array(events.enumerated().reversed()), id: \.offset) { _, event in
                HStack(spacing: 10) {
                    Text(eventWord(event.k)).font(GaryFonts.display(13)).tracking(1.1)
                        .foregroundStyle(GaryColors.gold)
                        .frame(width: 58, alignment: .leading)
                    Text([event.p, event.d].compactMap { $0 }.joined(separator: " · "))
                        .font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2).minimumScaleFactor(0.8)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// The feed's short kind as a fan says it.
    private func eventWord(_ kind: String?) -> String {
        switch (kind ?? "").lowercased() {
        case "hr": return "HOMER"
        case "sb": return "STOLEN"
        case "hits": return "HITS"
        case "ks": return "STRIKEOUTS"
        case "goal": return "GOAL"
        case "assist": return "ASSIST"
        case "card": return "CARD"
        default: return (kind ?? "PLAY").uppercased()
        }
    }

    private var quietState: some View {
        Text(live?.isLive == true ? "Nothing yet" : "Not started")
            .font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.45))
            .frame(maxWidth: .infinity, alignment: .center).padding(.vertical, 24)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text.uppercased()).font(GaryFonts.display(13)).tracking(1.4).foregroundStyle(GaryColors.gold)
    }

    // MARK: - Loading

    private func load() async {
        let today = SupabaseAPI.todayEST()
        let all = (try? await SupabaseAPI.fetchPropPicks(date: today)) ?? []
        let mine = all.filter { p in
            guard (p.league ?? p.sport ?? "").uppercased().hasPrefix(league.uppercased()) else { return false }
            if let id = gameID, let pg = p.game_id, String(pg) == id { return true }
            if let m = p.matchup, !m.isEmpty { return LabFormat.sameMatchup(m, matchup) }
            return false
        }
        await MainActor.run { props = mine; loading = false }
    }
}
