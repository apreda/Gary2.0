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
        let decided = (d?.wins ?? 0) + (d?.losses ?? 0)
        let pct = decided > 0 ? Double(d?.wins ?? 0) / Double(decided) : nil
        // Gary's face by the night's win rate, the daily recap's ladder.
        let face = pct.map { $0 >= 0.80 ? "GaryFire" : $0 >= 0.70 ? "GaryCooking" : $0 >= 0.50 ? "GaryBeer"
            : $0 >= 0.40 ? "GaryIceCold" : "GaryDoomsday" } ?? "GaryBeer"
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

    private var streakTile: some View {
        let r = run
        let hot = r.sign > 0
        let words = r.count == 0 ? "" : "\(hot ? "WINNING" : "LOSING") \(r.count == 1 ? "NIGHT" : "NIGHTS")"
        return tileButton(label: r.count == 0 ? "Streak" : "Streak, \(r.count) \(words.lowercased())") {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("STREAK")
                        .font(GaryFonts.kicker(11, .heavy)).tracking(1.3)
                        .foregroundStyle(hot || r.count == 0 ? GaryColors.gold : LabInk.dim)
                    Spacer()
                    Image(systemName: hot || r.count == 0 ? "flame.fill" : "snowflake")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(hot || r.count == 0 ? GaryColors.gold : GaryColors.silver)
                }
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(r.count == 0 ? " " : "\(r.count)")
                        .font(GaryFonts.display(43)).foregroundStyle(GaryColors.warmWhite)
                    Text(words)
                        .font(GaryFonts.kicker(11, .bold)).tracking(0.9)
                        .foregroundStyle(LabInk.dim)
                        .fitsOneLine()
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                RadialGradient(colors: [GaryColors.gold.opacity(hot ? 0.2 : 0), .clear],
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
