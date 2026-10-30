import SwiftUI

/// THE GARY OPENING — Home's first thing (founder, Oct 30 2026: "the Gary mascot in the middle, not in a
/// container ... like a scientific diagram", replacing the Bento: "it's not an analytics dashboard").
/// Gary is an old-school gambler, not a flashy one ("think more Mike Ditka"): sweater vest, loosened tie,
/// pencil behind his ear, the racing form in his paw. He's alive (GaryIdleFigure): he puffs the cigar,
/// reads the form, looks up, and reacts to last night. Three labels point at him the way a diagram
/// labels a figure: last night at his head, tonight's Winners at his tie, the run of nights at his knee.
/// Everything opens Winners.
struct HomeGaryOpening: View {
    let onOpen: () -> Void

    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @State private var bankroll: GaryBankrollSnapshot?
    @State private var tonight: LabBoard?
    @State private var now = Date()
    #if DEBUG
    /// Tour verb `garymood GaryFire|GaryCooking|GaryBeer|GaryIceCold|GaryDoomsday|off` previews a reaction.
    @AppStorage("garyMoodPreview") private var moodPreviewRaw = ""
    private var moodPreview: String? { moodPreviewRaw.isEmpty ? nil : moodPreviewRaw }
    #else
    private var moodPreview: String? { nil }
    #endif

    static let height: CGFloat = 404
    private static let garyHeight: CGFloat = 330
    private static let garyTop: CGFloat = 40

    private var slate: String { SupabaseAPI.todayEST() }

    var body: some View {
        Button(action: onOpen) {
            GeometryReader { geo in
                let w = geo.size.width
                let gh = Self.garyHeight
                let gw = gh * GaryIdleFigure.baseAspect
                // Gary stands left of center so the labels on his right have open page.
                let center = w * 0.4
                let gx = center - gw / 2
                let at = { (p: CGPoint) in CGPoint(x: gx + p.x * gw, y: Self.garyTop + p.y * gh) }
                ZStack(alignment: .topLeading) {
                    // The spotlight that lifts a black suit off a black page, and the floor under him.
                    Ellipse()
                        .fill(RadialGradient(colors: [GaryColors.lightGold.opacity(0.2), GaryColors.gold.opacity(0.07), .clear],
                                             center: .center, startRadius: 0, endRadius: 170))
                        .frame(width: 310, height: 350)
                        .position(x: center, y: Self.garyTop + gh * 0.5)
                    Ellipse()
                        .fill(RadialGradient(colors: [.black.opacity(0.6), .clear], center: .center, startRadius: 0, endRadius: 85))
                        .frame(width: 170, height: 14)
                        .position(x: center, y: Self.garyTop + gh + 2)
                    GaryIdleFigure(mood: moodPreview ?? lastNight?.face, height: gh, active: activePage && scenePhase == .active)
                        .frame(width: center * 2, height: gh + 30)
                        .position(x: center, y: Self.garyTop - 30 + (gh + 30) / 2)
                    leaders(width: w, head: at(GaryIdleFigure.head), tie: at(GaryIdleFigure.tie), knee: at(GaryIdleFigure.knee))
                    if let d = lastNight {
                        lastNightLabel(d).frame(width: 100, alignment: .leading).position(x: 50, y: 52)
                    }
                    tonightLabel.frame(width: 104, alignment: .leading).position(x: w - 52, y: 188)
                    if run.count > 0 {
                        streakLabel.frame(width: 100, alignment: .leading).position(x: w - 50, y: 318)
                    }
                    Text("FIG. 1 — GARY")
                        .font(.system(size: 9, weight: .semibold).italic()).tracking(1.2)
                        .foregroundStyle(CR.mute2)
                        .position(x: 44, y: Self.height - 14)
                }
            }
            .frame(height: Self.height)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pageGutter()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint("Opens Winners")
        .accessibilityAddTraits(.isButton)
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

    // MARK: - The figure

    /// Thin gold leaders from each label to the spot on Gary it names, a dot and a ring at his end.
    private func leaders(width w: CGFloat, head: CGPoint, tie: CGPoint, knee: CGPoint) -> some View {
        var lines: [(CGPoint, CGPoint, CGPoint)] = [(CGPoint(x: w - 108, y: 172), CGPoint(x: w - 124, y: 172), tie)]
        if lastNight != nil { lines.append((CGPoint(x: 96, y: 40), CGPoint(x: 112, y: 40), head)) }
        if run.count > 0 { lines.append((CGPoint(x: w - 104, y: 324), CGPoint(x: w - 128, y: 324), knee)) }
        return Canvas { ctx, _ in
            for (from, elbow, to) in lines {
                var p = Path(); p.move(to: from); p.addLine(to: elbow); p.addLine(to: to)
                ctx.stroke(p, with: .color(GaryColors.lightGold.opacity(0.6)), lineWidth: 1)
                ctx.fill(Path(ellipseIn: CGRect(x: to.x - 3, y: to.y - 3, width: 6, height: 6)), with: .color(GaryColors.lightGold))
                ctx.stroke(Path(ellipseIn: CGRect(x: to.x - 7, y: to.y - 7, width: 14, height: 14)),
                           with: .color(GaryColors.lightGold.opacity(0.35)), lineWidth: 1)
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - The labels

    private func kicker(_ s: String) -> some View {
        Text(s).font(GaryFonts.kicker(9.5, .bold)).tracking(1.5).foregroundStyle(GaryColors.gold).fitsOneLine()
    }

    private func lastNightLabel(_ d: Day) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            kicker(dayWord(d.date))
            Text(LabFormat.unitsNet(d.net_units))
                .font(GaryFonts.display(28)).foregroundStyle(moneyColor(d.net_units))
                .monospacedDigit().fitsOneLine()
            Text("\(d.wins)–\(d.losses)")
                .font(GaryFonts.kicker(11, .semibold)).tracking(1.2)
                .foregroundStyle(GaryColors.silver)
        }
    }

    private var tonightLabel: some View {
        let t = tonightWords
        return VStack(alignment: .leading, spacing: 2) {
            kicker("TONIGHT")
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(t.top)
                    .font(GaryFonts.display(25)).foregroundStyle(GaryColors.warmWhite)
                    .monospacedDigit().fitsOneLine()
                if let state = t.state {
                    Text(state)
                        .font(GaryFonts.kicker(9, .bold)).tracking(1.2)
                        .foregroundStyle(state == "LIVE" ? GaryColors.win : GaryColors.silver)
                        .fixedSize()
                }
            }
            if let money = t.money {
                HStack(spacing: 4) {
                    Text(LabFormat.unitsNet(money))
                        .font(GaryFonts.display(19)).foregroundStyle(moneyColor(money))
                        .monospacedDigit().fitsOneLine()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
            }
        }
    }

    private var streakLabel: some View {
        let r = run
        let hot = r.sign > 0
        return VStack(alignment: .leading, spacing: 1) {
            HStack(alignment: .top, spacing: 5) {
                Text("\(r.count)")
                    .font(GaryFonts.display(38)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize()
                Group { if hot { GaryFlame(nights: r.count).scaleEffect(0.7) } else { ColdMark() } }
                    .padding(.top, 2)
            }
            Text(hot ? "NIGHTS\nIN A ROW" : "COLD\nNIGHTS")
                .font(GaryFonts.kicker(9.5, .bold)).tracking(1.4)
                .foregroundStyle(hot ? GaryColors.gold : GaryColors.silver)
                .lineSpacing(1)
                .fixedSize()
        }
    }

    private var accessibilityText: String {
        var parts = ["Gary"]
        if let d = lastNight { parts.append("\(dayWord(d.date).capitalized), \(d.wins) and \(d.losses), \(LabFormat.unitsNet(d.net_units))") }
        if run.count > 0 { parts.append("\(run.count) \(run.sign > 0 ? "winning" : "losing") nights in a row") }
        let t = tonightWords
        parts.append("Tonight\(t.state.map { " \($0.lowercased())" } ?? ""), \(t.top.capitalized)\(t.money.map { ", \(LabFormat.unitsNet($0))" } ?? "")")
        return parts.joined(separator: ". ")
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
        return c
    }()
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.calendar = et; f.timeZone = et.timeZone; f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// "LAST NIGHT" for yesterday, else the day's name ("SUNDAY"), else its date ("OCT 19").
    private func dayWord(_ ymd: String) -> String {
        if ymd == LabFormat.yesterday(of: slate) { return "LAST NIGHT" }
        guard let d = Self.ymd.date(from: ymd), let s = Self.ymd.date(from: slate) else { return "" }
        let f = DateFormatter()
        f.calendar = Self.et; f.timeZone = Self.et.timeZone; f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = s.timeIntervalSince(d) < 6.5 * 86_400 ? "EEEE" : "MMM d"
        return f.string(from: d).uppercased()
    }

    private func moneyColor(_ units: Double) -> Color {
        units > 0.0049 ? GaryColors.win : units < -0.0049 ? GaryColors.loss : GaryColors.silver
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

    /// The hand's label: tonight's Winners headline, LIVE or FINAL beside it, and the money once there is some.
    private var tonightWords: (state: String?, top: String, money: Double?) {
        let count = bets.count + lockedCount
        if sealed { return (nil, "SEALED", nil) }
        if !underway { return (nil, count > 0 ? "\(count) \(count == 1 ? "BET" : "BETS")" : "WINNERS", nil) }
        if !bets.contains(where: settled) {
            let live = bets.filter { LabFormat.parseISO($0.commence).map { $0 <= now } ?? false }.count
            return ("LIVE", "\(live) ON", nil)
        }
        let line = tonightLine
        return (bets.allSatisfy(settled) ? "FINAL" : "LIVE", line.record, line.units)
    }
}

/// Gary alive on Home (founder, Oct 30 2026: "he needs to be alive not still", with the betting personality
/// of an old-school Vegas bettor). Between beats of his easy stance he works: puffs the cigar, counts his
/// roll, calls a bet in on the old phone, fans his tickets, checks his watch, flips his lucky coin, marks
/// the form. Each loop takes three of those in turn and ends on his reaction to last night: cash in the
/// air, a kiss for the ticket, arms crossed, a shrug, a ticket torn in half. Frames cross-fade; under them
/// he breathes, sways a little, settles on each new frame, and smoke curls off the cigar. Still on Reduce
/// Motion or when Home is off screen.
struct GaryIdleFigure: View {
    /// Last night's face (Home's LAST NIGHT ladder) picks the reaction.
    let mood: String?
    let height: CGFloat
    let active: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// One drawn frame: its art size at the shared scale (the stance is 900 tall), its center of mass
    /// across the width, and the cigar tip smoke rises from (none when he holds it or it's out).
    struct Frame {
        let asset: String
        let size: CGSize
        let cx: CGFloat
        let smoke: CGPoint?
    }

    static let frames: [String: Frame] = [
        "base": Frame(asset: "GaryIdleBase", size: CGSize(width: 568, height: 900), cx: 0.487, smoke: CGPoint(x: 0.68, y: 0.19)),
        "puff": Frame(asset: "GaryIdlePuff", size: CGSize(width: 545, height: 895), cx: 0.501, smoke: nil),
        "paper": Frame(asset: "GaryIdlePaper", size: CGSize(width: 520, height: 901), cx: 0.466, smoke: CGPoint(x: 0.64, y: 0.2)),
        "tap": Frame(asset: "GaryIdleTap", size: CGSize(width: 485, height: 896), cx: 0.485, smoke: CGPoint(x: 0.66, y: 0.2)),
        "cash": Frame(asset: "GaryActCash", size: CGSize(width: 502, height: 902), cx: 0.491, smoke: CGPoint(x: 0.7, y: 0.215)),
        "phone": Frame(asset: "GaryActPhone", size: CGSize(width: 497, height: 903), cx: 0.511, smoke: CGPoint(x: 0.66, y: 0.22)),
        "tickets": Frame(asset: "GaryActTickets", size: CGSize(width: 567, height: 895), cx: 0.508, smoke: CGPoint(x: 0.66, y: 0.2)),
        "watch": Frame(asset: "GaryActWatch", size: CGSize(width: 568, height: 904), cx: 0.487, smoke: CGPoint(x: 0.7, y: 0.21)),
        "coin": Frame(asset: "GaryActCoin", size: CGSize(width: 556, height: 901), cx: 0.487, smoke: CGPoint(x: 0.72, y: 0.21)),
        "toss": Frame(asset: "GaryMoodToss", size: CGSize(width: 691, height: 1069), cx: 0.494, smoke: nil),
        "kiss": Frame(asset: "GaryMoodKiss", size: CGSize(width: 553, height: 897), cx: 0.506, smoke: nil),
        "fine": Frame(asset: "GaryMoodFine", size: CGSize(width: 429, height: 896), cx: 0.498, smoke: CGPoint(x: 0.66, y: 0.2)),
        "cold": Frame(asset: "GaryMoodCold", size: CGSize(width: 605, height: 896), cx: 0.499, smoke: nil),
        "tear": Frame(asset: "GaryMoodTear", size: CGSize(width: 508, height: 899), cx: 0.487, smoke: nil),
    ]

    /// His habits, taken three a loop in turn.
    static let habits = ["puff", "cash", "phone", "tickets", "watch", "coin", "paper", "tap"]

    /// The stance's shape and where the labels point on it: left of his sunglasses, his tie, his right knee.
    static let baseAspect: CGFloat = 568 / 900
    static let head = CGPoint(x: 0.36, y: 0.09)
    static let tie = CGPoint(x: 0.5, y: 0.3)
    static let knee = CGPoint(x: 0.62, y: 0.72)

    static func reaction(_ face: String?) -> String {
        switch face {
        case "GaryFire": return "toss"
        case "GaryCooking": return "kiss"
        case "GaryBeer": return "fine"
        case "GaryIceCold": return "cold"
        case "GaryDoomsday": return "tear"
        default: return "tap"
        }
    }

    /// Loop `k`: the stance, three habits in turn (a beat of stance between the first two), the reaction.
    /// Every loop is the same length, so the clock alone says where he is.
    private func routine(_ k: Int) -> [(String, Double)] {
        let h = Self.habits
        let pick = { (i: Int) in h[(k * 3 + i) % h.count] }
        return [("base", 2.4), (pick(0), 2.2), ("base", 1.3), (pick(1), 2.2), (pick(2), 2.0), (Self.reaction(mood), 2.6)]
    }
    private static let loopLength = 12.7

    private static let fade = 0.32

    private static func smooth(_ x: Double) -> Double {
        let t = min(1, max(0, x)); return t * t * (3 - 2 * t)
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !active || reduceMotion)) { ctx in
            figure(at: reduceMotion ? 0 : ctx.date.timeIntervalSinceReferenceDate)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func figure(at t: Double) -> some View {
        let total = Self.loopLength
        let steps = routine(Int((t / total).rounded(.down)))
        let local = t.truncatingRemainder(dividingBy: total)
        var start = 0.0, i = 0
        while i < steps.count - 1 && local >= start + steps[i].1 { start += steps[i].1; i += 1 }
        let since = local - start
        let current = steps[i].0
        let previous = steps[(i + steps.count - 1) % steps.count].0
        let fadeIn = reduceMotion ? 1 : Self.smooth(since / Self.fade)
        // The breath, the sway, and the small settle as a new frame lands.
        let breath = 1 + 0.009 * sin(2 * .pi * t / 3.4)
        let sway = 0.7 * sin(2 * .pi * t / 6.3)
        let settle = -0.01 * (1 - Self.smooth(since / 0.45))
        return GeometryReader { geo in
            let w = geo.size.width, floor = geo.size.height
            ZStack(alignment: .topLeading) {
                ForEach([previous, current], id: \.self) { key in
                    if let f = Self.frames[key] {
                        let o = key == current ? fadeIn : (previous == current ? 0 : 1 - fadeIn)
                        if o > 0 { draw(f, width: w, floor: floor, opacity: o, breath: breath, sway: sway, settle: key == current ? settle : 0) }
                    }
                }
                if !reduceMotion, let f = Self.frames[current], let tip = f.smoke {
                    smoke(from: point(tip, in: f, width: w, floor: floor), t: t, strength: fadeIn)
                }
            }
        }
    }

    private func frameSize(_ f: Frame) -> CGSize {
        let h = height * f.size.height / 900
        return CGSize(width: h * f.size.width / f.size.height, height: h)
    }

    private func point(_ p: CGPoint, in f: Frame, width w: CGFloat, floor: CGFloat) -> CGPoint {
        let s = frameSize(f)
        let left = w / 2 - f.cx * s.width
        return CGPoint(x: left + p.x * s.width, y: floor - s.height + p.y * s.height)
    }

    private func draw(_ f: Frame, width w: CGFloat, floor: CGFloat, opacity: Double, breath: Double, sway: Double, settle: Double) -> some View {
        let s = frameSize(f)
        return Image(f.asset)
            .resizable()
            .frame(width: s.width, height: s.height)
            .rotationEffect(.degrees(sway), anchor: .bottom)
            .scaleEffect(x: 2 - breath, y: breath, anchor: .bottom)
            .offset(y: settle * s.height)
            .opacity(opacity)
            .position(x: w / 2 - (f.cx - 0.5) * s.width, y: floor - s.height / 2)
    }

    /// Three soft puffs at a time, rising and widening off the cigar tip.
    private func smoke(from tip: CGPoint, t: Double, strength: Double) -> some View {
        Canvas { ctx, _ in
            let every = 0.9, life = 2.7
            let n = floor(t / every)
            for j in 0..<3 {
                let born = (n - Double(j)) * every
                let age = t - born
                guard age >= 0, age < life else { continue }
                let p = age / life
                let seed = born.truncatingRemainder(dividingBy: 7)
                let x = tip.x + CGFloat(age * 9 + 4 * sin(age * 1.8 + seed))
                let y = tip.y - CGFloat(age * 20)
                let r = CGFloat(2.5 + age * 5)
                let a = 0.2 * (1 - p) * min(1, age / 0.25) * strength
                ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                         with: .color(Color.white.opacity(a)))
            }
        }
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
