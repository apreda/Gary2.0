import SwiftUI

/// WINNERS ON HOME — the Bento (founder pick, Oct 29 2026: "Bento is 1,000% the best one", out of the mock
/// rounds that followed the hero coming off). Four tiles, one door: Gary's last night with his face for it,
/// his run of nights, the week as seven bars, and tonight's card. Every tile opens Winners, so when Winners
/// stops being free the free reader still sees what Gary is doing there. No headline rail above it: the
/// stories open from the finished games on the board.
struct HomeWinnersBento: View {
    let onOpen: () -> Void

    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @State private var bankroll: GaryBankrollSnapshot?
    @State private var tonight: LabBoard?
    @State private var now = Date()

    private static let tile: CGFloat = 96
    private static let gap: CGFloat = 10

    private var slate: String { SupabaseAPI.todayEST() }

    var body: some View {
        VStack(spacing: Self.gap) {
            HStack(alignment: .top, spacing: Self.gap) {
                lastNightTile
                    .frame(height: Self.tile * 2 + Self.gap)
                VStack(spacing: Self.gap) {
                    streakTile.frame(height: Self.tile)
                    weekTile.frame(height: Self.tile)
                }
            }
            tonightTile.frame(height: 88)
        }
        .pageGutter()
        .task(id: activePage && scenePhase == .active) {
            if tonight == nil {
                tonight = SupabaseAPI.cachedLabBoard(date: slate, account: AuthManager.shared.currentUser?.id)
            }
            guard activePage, scenePhase == .active else { return }
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(90)) } catch { break }
            }
        }
    }

    @MainActor private func refresh() async {
        now = Date()
        async let board = try? SupabaseAPI.fetchLabBoard(date: slate)
        async let money: GaryBankrollSnapshot? = {
            guard let data = try? await WinnersAccessStore.request("rest/v1/rpc/get_gary_bankroll", body: [:]) else { return nil }
            return try? JSONDecoder().decode(GaryBankrollSnapshot.self, from: data)
        }()
        let (b, m) = await (board, money)
        guard !Task.isCancelled else { return }
        if let b { tonight = b }
        if let m { bankroll = m }
    }

    // MARK: - The days

    private typealias Day = GaryBankrollSnapshot.Day
    /// Days with a settled Winners bet before today's slate, oldest first.
    private var pastDays: [Day] {
        (bankroll?.days ?? []).filter { $0.settled > 0 && $0.date < slate }.sorted { $0.date < $1.date }
    }
    private var lastNight: Day? { pastDays.last }

    private static func sign(_ d: Day) -> Int { d.net_units > 0.0049 ? 1 : d.net_units < -0.0049 ? -1 : 0 }

    /// The run of nights the latest one belongs to: (+1 winning / -1 losing, how many).
    private var run: (sign: Int, count: Int) {
        var sign = 0, count = 0
        for d in pastDays.reversed() {
            let s = Self.sign(d)
            if s == 0 || (sign != 0 && s != sign) { break }
            sign = s; count += 1
        }
        return (sign, count)
    }

    private static let et: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        c.firstWeekday = 2
        return c
    }()
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.calendar = et; f.timeZone = et.timeZone; f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Monday to Sunday of the slate's week, each with its net (nil: no settled bet that day).
    private var week: [(date: String, net: Double?)] {
        guard let day = Self.ymd.date(from: slate),
              let monday = Self.et.dateInterval(of: .weekOfYear, for: day)?.start else { return [] }
        let byDate = Dictionary((bankroll?.days ?? []).map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        return (0..<7).compactMap { i in
            guard let d = Self.et.date(byAdding: .day, value: i, to: monday) else { return nil }
            let key = Self.ymd.string(from: d)
            let settled = byDate[key].map { $0.settled > 0 } ?? false
            return (key, settled ? byDate[key]?.net_units : nil)
        }
    }

    /// "LAST NIGHT" for yesterday, else the day's name ("SUNDAY"), else its date ("OCT 19").
    private func dayWord(_ ymd: String) -> String {
        if ymd == LabFormat.yesterday(of: slate) { return "LAST NIGHT" }
        guard let d = Self.ymd.date(from: ymd), let s = Self.ymd.date(from: slate) else { return "" }
        let f = DateFormatter()
        f.calendar = Self.et; f.timeZone = Self.et.timeZone; f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = s.timeIntervalSince(d) < 6.5 * 86_400 ? "EEEE" : "MMM d"
        return f.string(from: d).uppercased()
    }

    // MARK: - Tiles

    private func moneyColor(_ units: Double) -> Color {
        units > 0.0049 ? GaryColors.win : units < -0.0049 ? GaryColors.loss : GaryColors.silver
    }

    private var lastNightTile: some View {
        let d = lastNight
        // Gary's face by the night's win rate, the daily recap's ladder.
        let face = d?.face ?? "GaryBeer"
        return tileButton(label: d.map { "\(dayWord($0.date)), \($0.wins) and \($0.losses), \(LabFormat.unitsNet($0.net_units))" } ?? "Winners") {
            VStack(alignment: .leading, spacing: 0) {
                Text("WINNERS")
                    .font(GaryFonts.accent(12)).tracking(0.7)
                    .foregroundStyle(GaryColors.gold)
                Image(face)
                    .resizable().scaledToFit()
                    .frame(width: 96, height: 96)
                    .frame(maxWidth: .infinity)
                Spacer(minLength: 0)
                Text(d.map { LabFormat.unitsNet($0.net_units) } ?? " ")
                    .font(GaryFonts.display(39)).foregroundStyle(d.map { moneyColor($0.net_units) } ?? .clear)
                    .monospacedDigit()
                    .fitsOneLine()
                Text(d.map { "\(dayWord($0.date)) · \($0.wins)–\($0.losses)" } ?? " ")
                    .font(GaryFonts.kicker(11, .bold)).tracking(1.3)
                    .foregroundStyle(LabInk.dim)
                    .fitsOneLine()
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(alignment: .topTrailing) {
                Circle()
                    .fill(RadialGradient(colors: [GaryColors.gold.opacity(0.22), GaryColors.gold.opacity(0)],
                                         center: .center, startRadius: 0, endRadius: 90))
                    .frame(width: 180, height: 180)
                    .offset(x: 50, y: -30)
            }
            .tilePlate(edge: GaryColors.gold.opacity(0.45))
        }
    }

    /// The number fills the tile and the words sit beside it, STREAK over WINNING NIGHTS (founder, Oct 29 2026:
    /// "make the two larger to fill the space ... move streak so it's just above winning nights"). Gary's own
    /// flame rides the corner and burns hotter the longer the run.
    private var streakTile: some View {
        let r = run
        let hot = r.sign > 0
        let words = r.count == 0 ? "NIGHTS" : "\(hot ? "WINNING" : "LOSING") \(r.count == 1 ? "NIGHT" : "NIGHTS")"
        return tileButton(label: r.count == 0 ? "Streak" : "Streak, \(r.count) \(words.lowercased())") {
            HStack(alignment: .lastTextBaseline, spacing: 9) {
                Text(r.count == 0 ? "0" : "\(r.count)")
                    .font(GaryFonts.display(70)).foregroundStyle(GaryColors.warmWhite)
                    .opacity(bankroll == nil ? 0 : 1)
                    .fixedSize()
                VStack(alignment: .leading, spacing: 3) {
                    Text("STREAK")
                        .font(GaryFonts.kicker(11, .heavy)).tracking(1.3)
                        .foregroundStyle(hot || r.count == 0 ? GaryColors.gold : GaryColors.silver)
                    Text(words)
                        .font(GaryFonts.kicker(11, .bold)).tracking(0.7)
                        .foregroundStyle(LabInk.dim)
                        .fitsOneLine()
                }
                .padding(.bottom, 2)
                Spacer(minLength: 0)
            }
            .padding(.leading, 14).padding(.trailing, 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .overlay(alignment: .topTrailing) {
                Group {
                    if hot || r.count == 0 { GaryFlame(nights: r.count) } else { ColdMark() }
                }
                .padding(.top, 11).padding(.trailing, 12)
            }
            .background(
                RadialGradient(colors: [GaryFlame.heat(r.count).glow.opacity(hot ? 0.2 : 0), .clear],
                               center: .topTrailing, startRadius: 0, endRadius: 110)
            )
            .tilePlate(edge: GaryColors.gold.opacity(hot ? 0.5 : 0.25))
        }
    }

    private var weekTile: some View {
        let days = week
        let total = days.compactMap(\.net).reduce(0, +)
        let any = days.contains { $0.net != nil }
        let peak = max(days.compactMap { $0.net.map(abs) }.max() ?? 0, 0.01)
        return tileButton(label: any ? "This week, \(LabFormat.unitsNet(total))" : "This week") {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("THIS WEEK")
                        .font(GaryFonts.kicker(11, .heavy)).tracking(1.3)
                        .foregroundStyle(LabInk.dim)
                    Spacer(minLength: 4)
                    Text(any ? LabFormat.unitsNet(total) : "$0")
                        .font(GaryFonts.display(20)).foregroundStyle(any ? moneyColor(total) : LabInk.dim)
                        .monospacedDigit()
                        .fitsOneLine()
                }
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: 5) {
                    ForEach(days, id: \.date) { d in
                        RoundedRectangle(cornerRadius: d.net == nil ? 2 : 3, style: .continuous)
                            .fill(d.net.map { $0 < 0 ? GaryColors.loss.opacity(0.85) : GaryColors.gold }
                                  ?? Color.white.opacity(0.14))
                            .frame(height: d.net.map { max(4, 40 * abs($0) / peak) } ?? 4)
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 40, alignment: .bottom)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .tilePlate(edge: Color.white.opacity(0.08))
        }
    }

    // MARK: - Tonight

    private var bets: [LabBoardTicket] { (tonight?.tickets ?? []).filter { !$0.scratched } }
    private var lockedCount: Int { (tonight?.boards ?? []).filter(\.locked).reduce(0) { $0 + $1.count } }
    private var sealed: Bool { lockedCount > 0 && bets.isEmpty }
    private func settled(_ t: LabBoardTicket) -> Bool { t.outcome?.result.map { !$0.isEmpty } ?? false }
    private var underway: Bool {
        bets.contains { settled($0) || (LabFormat.parseISO($0.commence).map { $0 <= now } ?? false) }
    }

    /// Tonight's line once a bet has started: the record and the money so far.
    private var tonightLine: (record: String, units: Double) {
        var won = 0, lost = 0, units = 0.0
        for t in bets where settled(t) {
            let stake = t.stakeUnits ?? 0
            switch LabTicketState(result: t.outcome?.result) {
            case .won: won += 1; units += stake * LabFormat.payout(t.price)
            case .lost: lost += 1; units -= stake
            case .push, .open: break
            }
        }
        return ("\(won)–\(lost)", units)
    }

    private var tonightTile: some View {
        let count = bets.count + lockedCount
        let line = tonightLine
        let kicker: String = {
            if sealed || !underway { return count > 0 ? "TONIGHT · \(count) \(count == 1 ? "BET" : "BETS")" : "TONIGHT" }
            return bets.allSatisfy(settled) ? "TONIGHT · FINAL" : "TONIGHT · LIVE"
        }()
        let title: String = {
            if sealed { return "GARY'S BETS ARE SEALED" }
            // Live with nothing settled yet, the tile says the bets are on, not a hollow "0–0 · $0".
            if underway && !bets.contains(where: settled) {
                let live = bets.filter { LabFormat.parseISO($0.commence).map { $0 <= now } ?? false }.count
                return "GARY'S \(live) \(live == 1 ? "BET IS" : "BETS ARE") LIVE"
            }
            if underway { return "GARY IS \(line.record) · \(LabFormat.unitsNet(line.units))" }
            return count > 0 ? "SEE GARY'S \(count) \(count == 1 ? "BET" : "BETS")" : "OPEN GARY'S WINNERS"
        }()
        return tileButton(label: "\(kicker.capitalized), \(title.capitalized)") {
            HStack(spacing: 14) {
                cardStack(count: count)
                VStack(alignment: .leading, spacing: 2) {
                    Text(kicker)
                        .font(GaryFonts.kicker(11, .heavy)).tracking(1.3)
                        .foregroundStyle(LabInk.dim)
                        .fitsOneLine()
                    Text(title)
                        .font(GaryFonts.display(24)).foregroundStyle(GaryColors.warmWhite)
                        .monospacedDigit()
                        .fitsOneLine()
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .tilePlate(edge: GaryColors.gold.opacity(0.45))
        }
    }

    /// Three cards fanned: two backs and Gary's gold card in front, locked while the bets are sealed.
    private func cardStack(count: Int) -> some View {
        ZStack(alignment: .topLeading) {
            CardBack(tint: Color(hex: "#2B2416"), edge: GaryColors.gold.opacity(0.4))
                .rotationEffect(.degrees(-12)).offset(x: 0, y: 10)
            CardBack(tint: Color(hex: "#362D1A"), edge: GaryColors.gold.opacity(0.5))
                .rotationEffect(.degrees(-2)).offset(x: 22, y: 4)
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(GaryColors.gold)
                .frame(width: 44, height: 58)
                .overlay {
                    if sealed || count == 0 {
                        Image(systemName: "lock")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(LabInk.plate)
                    } else {
                        Text("\(count)")
                            .font(GaryFonts.display(26)).foregroundStyle(LabInk.plate)
                    }
                }
                .shadow(color: GaryColors.gold.opacity(0.3), radius: 7, y: 6)
                .rotationEffect(.degrees(10)).offset(x: 44, y: 7)
        }
        .frame(width: 92, height: 70, alignment: .topLeading)
        .accessibilityHidden(true)
    }

    private func tileButton<Label: View>(label: String, @ViewBuilder _ content: () -> Label) -> some View {
        Button(action: onOpen) { content().contentShape(Rectangle()) }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityHint("Opens Winners")
            .accessibilityAddTraits(.isButton)
    }
}

/// Gary's flame, drawn for the app (founder, Oct 29 2026: the stock flame is one "we see all the time"): an
/// outer fire with two side tongues and a lit core, warm gold on a short run, orange from three nights, red
/// with a yellow-white core from five, and it flickers faster as it heats. Still for Reduce Motion.
struct GaryFlame: View {
    let nights: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var flicker = false

    struct Heat { let base: Color; let tip: Color; let core: Color; let glow: Color; let pace: Double }
    static func heat(_ nights: Int) -> Heat {
        switch nights {
        case 5...: return Heat(base: Color(hex: "#FFB02E"), tip: Color(hex: "#D7261E"), core: Color(hex: "#FFF4C8"),
                               glow: Color(hex: "#FF5A1F"), pace: 0.38)
        case 3...4: return Heat(base: Color(hex: "#F7C548"), tip: Color(hex: "#E8642A"), core: Color(hex: "#FFEDB0"),
                                glow: Color(hex: "#F08A2A"), pace: 0.55)
        default: return Heat(base: Color(hex: "#E8C35A"), tip: GaryColors.gold, core: Color(hex: "#FBEFC4"),
                             glow: GaryColors.gold, pace: 0.8)
        }
    }

    var body: some View {
        let h = Self.heat(nights)
        ZStack(alignment: .bottom) {
            FlameOuter()
                .fill(LinearGradient(colors: [h.base, h.tip], startPoint: .bottom, endPoint: .top))
            FlameCore()
                .fill(LinearGradient(colors: [h.core, h.base.opacity(0.9)], startPoint: .bottom, endPoint: .top))
                .scaleEffect(flicker ? 0.94 : 1.0, anchor: .bottom)
        }
        .frame(width: 19, height: 24)
        .scaleEffect(x: flicker ? 0.97 : 1.0, y: flicker ? 1.05 : 0.98, anchor: .bottom)
        .shadow(color: h.glow.opacity(nights >= 3 ? 0.75 : 0.45), radius: nights >= 5 ? 7 : 4)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: h.pace).repeatForever(autoreverses: true)) { flicker = true }
        }
        .accessibilityHidden(true)
    }
}

/// The outer fire: a round base, a tall tongue leaning right, a short tongue each side.
private struct FlameOuter: Shape {
    func path(in r: CGRect) -> Path {
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * r.width, y: r.minY + y * r.height) }
        var path = Path()
        path.move(to: p(0.50, 1.00))
        path.addCurve(to: p(0.06, 0.62), control1: p(0.22, 1.00), control2: p(0.04, 0.84))
        path.addCurve(to: p(0.22, 0.24), control1: p(0.08, 0.46), control2: p(0.18, 0.36))
        path.addCurve(to: p(0.38, 0.44), control1: p(0.26, 0.34), control2: p(0.32, 0.42))
        path.addCurve(to: p(0.60, 0.00), control1: p(0.34, 0.26), control2: p(0.46, 0.10))
        path.addCurve(to: p(0.74, 0.38), control1: p(0.62, 0.16), control2: p(0.66, 0.30))
        path.addCurve(to: p(0.84, 0.18), control1: p(0.80, 0.32), control2: p(0.84, 0.26))
        path.addCurve(to: p(0.94, 0.64), control1: p(0.96, 0.32), control2: p(0.98, 0.50))
        path.addCurve(to: p(0.50, 1.00), control1: p(0.90, 0.86), control2: p(0.74, 1.00))
        path.closeSubpath()
        return path
    }
}

/// The lit core, low in the fire.
private struct FlameCore: Shape {
    func path(in r: CGRect) -> Path {
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * r.width, y: r.minY + y * r.height) }
        var path = Path()
        path.move(to: p(0.50, 0.96))
        path.addCurve(to: p(0.28, 0.74), control1: p(0.34, 0.96), control2: p(0.26, 0.86))
        path.addCurve(to: p(0.50, 0.40), control1: p(0.30, 0.60), control2: p(0.44, 0.54))
        path.addCurve(to: p(0.72, 0.74), control1: p(0.56, 0.54), control2: p(0.70, 0.60))
        path.addCurve(to: p(0.50, 0.96), control1: p(0.74, 0.86), control2: p(0.66, 0.96))
        path.closeSubpath()
        return path
    }
}

/// A cold run's mark: an ice shard, quiet silver-blue.
private struct ColdMark: View {
    var body: some View {
        Image(systemName: "snowflake")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Color(hex: "#9DBBD3"))
            .accessibilityHidden(true)
    }
}

/// A face-down card: a dark diagonal stripe under a thin gold edge.
private struct CardBack: View {
    let tint: Color
    let edge: Color
    var body: some View {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(tint)
            .overlay {
                Canvas { ctx, size in
                    var x = -size.height
                    while x < size.width {
                        var p = Path()
                        p.move(to: CGPoint(x: x, y: size.height)); p.addLine(to: CGPoint(x: x + size.height, y: 0))
                        ctx.stroke(p, with: .color(.black.opacity(0.22)), lineWidth: 3.5)
                        x += 10
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            }
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(edge, lineWidth: 1))
            .frame(width: 44, height: 58)
    }
}

private extension View {
    /// The Bento's tile: the Winners plate, rounded 20, a hairline edge inside.
    func tilePlate(edge: Color) -> some View {
        background(LabInk.plate)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(edge, lineWidth: 1))
    }
}
