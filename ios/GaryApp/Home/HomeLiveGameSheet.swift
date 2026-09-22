import SwiftUI

// THE LIVE GAME CARD (founder, Sep 22 2026: the front is the scoreboard with
// the inning, the outs and the diamond; "the back would have the props stuff").
// Both faces are here: the diamond the front draws, and the back the card turns
// over to. Every number comes from feeds the app already polls.
/// THE DIAMOND — the classic infield, a base gold while a runner stands on it
/// (founder, Sep 22 2026). Small enough for the marquee's clock column and the
/// live sheet's scoreboard, so both read the same shape.
struct LiveDiamond: View {
    let onFirst: Bool
    let onSecond: Bool
    let onThird: Bool
    var size: CGFloat = 7

    /// The infield: second at the top, third and first on the shoulders, home
    /// at the point. Home stays dim — it is the plate, never a runner — and it
    /// is what makes four marks read as a diamond instead of three chips.
    var body: some View {
        let r = size * 1.15
        ZStack {
            base(onSecond).offset(y: -r)
            base(onThird).offset(x: -r)
            base(onFirst).offset(x: r)
            plate.offset(y: r)
        }
        .frame(width: r * 2 + size, height: r * 2 + size)
        .accessibilityLabel(label)
    }

    private func base(_ occupied: Bool) -> some View {
        RoundedRectangle(cornerRadius: 1.2, style: .continuous)
            .fill(occupied ? GaryColors.gold : Color.white.opacity(0.14))
            .frame(width: size, height: size)
            .rotationEffect(.degrees(45))
    }

    private var plate: some View {
        RoundedRectangle(cornerRadius: 1.2, style: .continuous)
            .fill(Color.white.opacity(0.07))
            .frame(width: size * 0.72, height: size * 0.72)
            .rotationEffect(.degrees(45))
    }

    private var label: String {
        let on = [onFirst ? "first" : nil, onSecond ? "second" : nil, onThird ? "third" : nil].compactMap { $0 }
        if on.isEmpty { return "Bases empty" }
        if on.count == 3 { return "Bases loaded" }
        return "Runner on " + on.joined(separator: " and ")
    }
}


/// THE BACK OF THE CARD (founder, Sep 22 2026: "the back would have the props
/// stuff"). The front is the scoreboard; a tap turns it over to Gary's money on
/// this game — his bet, every prop against its live value, and what has already
/// cashed. Same height as the front so the card turns without the page jumping.
struct HomeLiveGameBack: View {
    let league: String
    let matchup: String
    let gameID: String?
    let live: LiveScore?
    let pickLine: String?
    @StateObject private var propCache = LivePropStatsCache.shared
    @State private var props: [PropPick] = []
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("GARY ON THIS GAME").font(GaryFonts.mono(10.5, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                Spacer()
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.3))
            }
            if !AppFlags.storeSafe, let pickLine, !pickLine.isEmpty {
                Text(pickLine.uppercased()).font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            ForEach(props.prefix(2), id: \.id) { prop in
                propRow(prop)
            }
            if let events = live?.events, !events.isEmpty {
                Text(events.suffix(2).reversed().map { [$0.k?.uppercased(), $0.p, $0.d].compactMap { $0 }.joined(separator: " ") }.joined(separator: "   ·   "))
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(2).minimumScaleFactor(0.8)
            } else if loaded && props.isEmpty && (pickLine ?? "").isEmpty {
                Text("No money on this one").font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.45))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.top, 13).padding(.bottom, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .task { await load() }
    }

    @ViewBuilder private func propRow(_ prop: PropPick) -> some View {
        let line = Double(prop.line ?? "") ?? Double(LabFormat.trailingNumber(prop.prop) ?? "") ?? 0
        let observed = propCache.observation(for: prop)
        let value = observed?.line.value(forMarket: prop.prop ?? "").map(Double.init)
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(LabFormat.propTicket(prop).uppercased())
                .font(GaryFonts.mono(10.5, bold: true)).tracking(0.6)
                .foregroundStyle(.white.opacity(0.72))
                .lineLimit(1).minimumScaleFactor(0.6)
            Spacer(minLength: 6)
            Text(value.map { LabFormat.trim($0) } ?? "—")
                .font(GaryFonts.display(18))
                .foregroundStyle(onSide(value: value, line: line, under: (prop.bet ?? "").lowercased().contains("under")) ? GaryColors.win : GaryColors.warmWhite)
            Text("/ \(LabFormat.trim(line))").font(GaryFonts.mono(10.5, bold: true))
                .foregroundStyle(.white.opacity(0.4))
        }
    }

    private func onSide(value: Double?, line: Double, under: Bool) -> Bool {
        guard let value else { return false }
        return under ? value < line : value > line
    }

    private func load() async {
        guard !loaded else { return }
        let all = (try? await SupabaseAPI.fetchPropPicks(date: SupabaseAPI.todayEST())) ?? []
        let mine = all.filter { p in
            guard (p.league ?? p.sport ?? "").uppercased().hasPrefix(league.uppercased()) else { return false }
            if let id = gameID, let pg = p.game_id, String(pg) == id { return true }
            if let m = p.matchup, !m.isEmpty { return LabFormat.sameMatchup(m, matchup) }
            return false
        }
        await MainActor.run { props = mine; loaded = true }
    }
}
