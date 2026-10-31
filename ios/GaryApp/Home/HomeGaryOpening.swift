import AVFoundation
import CoreImage
import SwiftUI

/// THE GARY OPENING — Home's first thing (founder, Oct 30 2026: "the Gary mascot in the middle, not in a
/// container ... like a scientific diagram", replacing the Bento: "it's not an analytics dashboard").
/// Gary is an old-school gambler, not a flashy one ("think more Mike Ditka"): sweater vest, loosened tie,
/// pencil behind his ear. He's alive (GaryIdleFigure): he stands a while, then lives a moment from a drawn
/// clip. Six labels point at his outline the way a diagram labels a figure: last night at his sunglasses,
/// tonight's Winners at his hip, the run of nights at his leg, and three prompts that change through the day
/// (founder: "the Parlay of the day has arrived and those kinds of things"): the parlay at his shoulder, the
/// darts at his other hip, his picks at his shoe. A prompt that's new
/// wears a green dot and its spot on Gary pulses until it's been seen. Gary and his three open Winners.
struct HomeGaryOpening: View {
    enum Door { case winners, darts, parlay, picks, talk }

    /// Gary's picks on today's slate, and the games on it (the board's own counts).
    var picks = 0
    var games = 0
    /// The question his ASK GARY label offers (founder, Oct 30 2026: "give the Gary on the home page of the
    /// App a real voice people can ask questions to"); tapping it opens the talk room asking it. Nil, no label.
    var ask: String? = nil
    let onOpen: (Door) -> Void

    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bankroll: GaryBankrollSnapshot?
    @State private var tonight: LabBoard?
    @State private var darts: DartsBoard?
    @State private var parlay: ParlaySlipModel?
    @State private var lastParlay: ParlaySlipModel?
    @State private var now = Date()
    /// His prop is out past him (the whiteboard up, a ball spinning by his head): the leaders step back so no
    /// pin lands on it, and he plays in front of the labels.
    @State private var performing = false
    /// The right-hand labels' own widths, so each sits flush to the right edge as the left ones sit to the left
    /// (founder, Oct 30 2026: "bumped away from Gary so it's closer to the edge the way the other side is").
    @State private var rightWidths: [String: CGFloat] = [:]
    /// Prompt keys already seen, newest last.
    @AppStorage("garyPromptsSeen") private var seenRaw = ""
    /// The talk room has been opened once: the ASK label stops wearing NEW.
    @AppStorage("garyTalkSeen") private var talkSeen = false
    #if DEBUG
    /// Tour verb `garymood GaryFire|GaryCooking|GaryBeer|GaryIceCold|GaryDoomsday|off` previews a mood (it tilts his clips).
    @AppStorage("garyMoodPreview") private var moodPreviewRaw = ""
    private var moodPreview: String? { moodPreviewRaw.isEmpty ? nil : moodPreviewRaw }
    #else
    private var moodPreview: String? { nil }
    #endif

    static let height: CGFloat = 408
    /// The ASK GARY label's top: under last night's, clear of the darts prompt at his pocket.
    private static let askY: CGFloat = 104
    private static let garyHeight: CGFloat = 344
    private static let garyTop: CGFloat = 28

    private var slate: String { SupabaseAPI.todayEST() }
    private var live: Bool { activePage && scenePhase == .active }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let gh = Self.garyHeight
            let gw = gh * GaryIdleFigure.baseAspect
            let center = w / 2
            let gx = center - gw / 2
            let at = { (p: CGPoint) in CGPoint(x: gx + p.x * gw, y: Self.garyTop + p.y * gh) }
            let prompts = self.prompts
            ZStack(alignment: .topLeading) {
                // The spotlight that lifts him off a black page, and the floor under him.
                Ellipse()
                    .fill(RadialGradient(colors: [GaryColors.lightGold.opacity(0.2), GaryColors.gold.opacity(0.07), .clear],
                                         center: .center, startRadius: 0, endRadius: 170))
                    .frame(width: 310, height: 350)
                    .position(x: center, y: Self.garyTop + gh * 0.5)
                Ellipse()
                    .fill(RadialGradient(colors: [.black.opacity(0.6), .clear], center: .center, startRadius: 0, endRadius: 85))
                    .frame(width: 170, height: 14)
                    .position(x: center, y: Self.garyTop + gh + 2)
                Button { onOpen(.winners) } label: {
                    GaryIdleFigure(mood: moodPreview ?? lastNight?.face, height: gh, active: live) { up in
                        withAnimation(.easeInOut(duration: 0.3)) { performing = up }
                    }
                        .frame(width: gw + 60, height: gh + 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // In front of the labels while he performs; taps still reach the labels.
                .zIndex(performing ? 1 : 0)
                .allowsHitTesting(!performing)
                .position(x: center, y: Self.garyTop - 30 + (gh + 30) / 2)
                .accessibilityLabel(garyAccessibility)
                .accessibilityHint("Opens Winners")

                Group {
                    leaders(width: w, at: at, prompts: prompts)
                    ForEach(prompts.filter { fresh($0) }, id: \.spot) { p in
                        PromptPulse(still: reduceMotion).position(at(GaryIdleFigure.anchor(p.spot)))
                    }
                    if ask != nil && !talkSeen {
                        PromptPulse(still: reduceMotion).position(at(GaryIdleFigure.jaw))
                    }
                }
                .opacity(performing ? 0 : 1)

                if let d = lastNight {
                    tap(.winners, key: nil) { lastNightLabel(d) }
                        .frame(width: 100, alignment: .leading).offset(x: 0, y: 22)
                }
                if let ask {
                    Button {
                        talkSeen = true
                        onOpen(.talk)
                    } label: { askLabel(ask).contentShape(Rectangle()) }
                        .buttonStyle(.plain)
                        .frame(width: 100, alignment: .leading)
                        .offset(x: 0, y: Self.askY)
                        .accessibilityLabel("Ask Gary: \(ask)")
                }
                tap(.winners, key: nil) { tonightLabel }
                    .fixedSize()
                    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rightWidths["tonight"] = $0 }
                    .offset(x: rightX("tonight", w, 100), y: 226)
                if run.count > 0 {
                    tap(.winners, key: nil) { streakLabel }
                        .fixedSize()
                        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rightWidths["streak"] = $0 }
                        .offset(x: rightX("streak", w, 94), y: 316)
                }
                ForEach(prompts, id: \.spot) { p in
                    let place = Self.place(p.spot, width: w)
                    if p.spot == .shoulder {
                        tap(Self.door(p.spot), key: p.key) { promptLabel(p) }
                            .fixedSize()
                            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rightWidths["shoulder"] = $0 }
                            .offset(x: rightX("shoulder", w, place.width), y: place.y)
                    } else {
                        tap(Self.door(p.spot), key: p.key) { promptLabel(p) }
                            .frame(width: place.width, alignment: .leading)
                            .offset(x: place.x, y: place.y)
                    }
                }
                Text("FIG. 1 — GARY")
                    .font(.system(size: 9, weight: .semibold).italic()).tracking(1.2)
                    .foregroundStyle(CR.mute2)
                    .offset(x: 0, y: Self.height - 20)
                    .accessibilityHidden(true)
            }
        }
        .frame(height: Self.height)
        .pageGutter()
        .task(id: live) {
            if tonight == nil {
                tonight = SupabaseAPI.cachedLabBoard(date: slate, account: AuthManager.shared.currentUser?.id)
            }
            guard live else { return }
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(90)) } catch { break }
            }
        }
        // Leaving Home is having looked: what was new on it isn't any more.
        .onChange(of: live) { isLive in
            if !isLive { markSeen(prompts.compactMap(\.key)) }
        }
    }

    // MARK: - The figure

    /// Where each prompt sits around him (x from the left edge, the label's width).
    private static func place(_ spot: GaryPrompt.Spot, width w: CGFloat) -> (x: CGFloat, y: CGFloat, width: CGFloat) {
        switch spot {
        // A touch lower than it was, clear of his cigar and above his arm (founder, Oct 30 2026: "move the
        // parlay of the day thing down a bit just so it's not blocking his cigar").
        case .shoulder: return (w - 94, 64, 94)
        case .pocket: return (0, 196, 100)
        case .shoe: return (0, 294, 92)
        }
    }

    private static func door(_ spot: GaryPrompt.Spot) -> Door {
        switch spot {
        case .shoulder: return .parlay
        case .pocket: return .darts
        case .shoe: return .picks
        }
    }

    /// Where a right-hand label starts: flush to the right edge by its own width.
    private func rightX(_ key: String, _ w: CGFloat, _ fallback: CGFloat) -> CGFloat {
        w - (rightWidths[key] ?? fallback)
    }

    /// Thin gold leaders from each label to the spot on Gary it names, a dot and a ring at his end.
    private func leaders(width w: CGFloat, at: @escaping (CGPoint) -> CGPoint, prompts: [GaryPrompt]) -> some View {
        let tx = rightX("tonight", w, 100), sx = rightX("streak", w, 94)
        var lines: [(CGPoint, CGPoint, CGPoint)] = [(CGPoint(x: tx - 6, y: 232), CGPoint(x: tx - 20, y: 232), at(GaryIdleFigure.hip))]
        if lastNight != nil { lines.append((CGPoint(x: 84, y: 35), CGPoint(x: 100, y: 35), at(GaryIdleFigure.head))) }
        if run.count > 0 { lines.append((CGPoint(x: sx - 6, y: 326), CGPoint(x: sx - 20, y: 326), at(GaryIdleFigure.leg))) }
        if ask != nil { lines.append((CGPoint(x: 84, y: Self.askY + 30), CGPoint(x: 100, y: Self.askY + 30), at(GaryIdleFigure.jaw))) }
        for p in prompts {
            let to = at(GaryIdleFigure.anchor(p.spot))
            switch p.spot {
            case .shoulder:
                let px = rightX("shoulder", w, 94)
                lines.append((CGPoint(x: px - 6, y: 80), CGPoint(x: px - 20, y: 80), to))
            case .pocket: lines.append((CGPoint(x: 84, y: 214), CGPoint(x: 100, y: 214), to))
            case .shoe: lines.append((CGPoint(x: 78, y: 320), CGPoint(x: 94, y: 320), to))
            }
        }
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

    /// A label as its own button: it opens its page, and a prompt tapped has been seen.
    private func tap<L: View>(_ door: Door, key: String?, @ViewBuilder _ label: () -> L) -> some View {
        Button {
            if let key { markSeen([key]) }
            onOpen(door)
        } label: { label().contentShape(Rectangle()) }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
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

    /// Gary himself: his mood tonight is last night's.
    private var garyAccessibility: String {
        guard let d = lastNight else { return "Gary" }
        return "Gary, after \(dayWord(d.date).lowercased()): \(d.wins) and \(d.losses), \(LabFormat.unitsNet(d.net_units))"
    }

    // MARK: - The prompts

    /// The three around him, as the day stands.
    private var prompts: [GaryPrompt] {
        let today = (darts?.today ?? []).filter { !$0.isScratched }.map {
            GaryPrompts.Dart(id: $0.id, player: $0.player, kind: $0.kind, prop: $0.prop, bet: $0.bet, odds: $0.odds, result: $0.result)
        }
        let yesterday = (darts?.yesterday ?? []).map {
            GaryPrompts.Dart(id: $0.id, player: $0.player, kind: $0.kind, prop: $0.line.map { "line \($0.value)" }, bet: $0.bet,
                             odds: $0.odds, result: "hit")
        }
        return [
            GaryPrompts.parlay(date: slate, today: parlay.map(Self.lean), yesterday: lastParlay.map(Self.lean)),
            darts == nil ? nil : GaryPrompts.darts(date: slate, today: today, yesterdayHits: yesterday),
            GaryPrompts.picks(date: slate, picks: picks, games: games),
        ].compactMap { $0 }
    }

    private static func lean(_ p: ParlaySlipModel) -> GaryPrompts.Parlay {
        GaryPrompts.Parlay(odds: p.american_odds, result: p.result,
                           landed: p.landed ?? p.legs.filter { $0.result == "won" }.count, legs: p.legs.count)
    }

    private var seen: Set<String> { Set(seenRaw.split(separator: "|").map(String.init)) }
    private func fresh(_ p: GaryPrompt) -> Bool { p.key.map { !seen.contains($0) } ?? false }

    private func markSeen(_ keys: [String]) {
        var list = seenRaw.split(separator: "|").map(String.init)
        for k in keys where !list.contains(k) { list.append(k) }
        seenRaw = list.suffix(60).joined(separator: "|")
    }

    /// A question on two lines, broken where the halves come out closest in length.
    static func twoLines(_ q: String) -> [String] {
        let words: [String] = q.split(separator: " ").map(String.init)
        guard words.count > 1 else { return [q] }
        var best = 1
        var bestGap = Int.max
        for cut in 1..<words.count {
            let a: Int = words[..<cut].joined(separator: " ").count
            let b: Int = words[cut...].joined(separator: " ").count
            if abs(a - b) < bestGap { bestGap = abs(a - b); best = cut }
        }
        return [words[..<best].joined(separator: " "), words[best...].joined(separator: " ")]
    }

    /// ASK GARY at his mouth: the question in his diagram's display type, two lines.
    private func askLabel(_ q: String) -> some View {
        let isNew = !talkSeen
        let lines = Self.twoLines(q.uppercased())
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                if isNew {
                    Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                        .background(Circle().fill(GaryColors.win.opacity(0.22)).frame(width: 12, height: 12))
                }
                Image(systemName: "mic.fill").font(.system(size: 8.5, weight: .bold))
                    .foregroundStyle(isNew ? GaryColors.win : GaryColors.gold)
                Text("ASK GARY")
                    .font(GaryFonts.kicker(9.5, .bold)).tracking(1.5)
                    .foregroundStyle(isNew ? GaryColors.win : GaryColors.gold)
                    .fitsOneLine()
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                    HStack(spacing: 5) {
                        Text(line)
                            .font(GaryFonts.display(21)).foregroundStyle(GaryColors.warmWhite)
                            .fitsOneLine()
                        if i == lines.count - 1 {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(GaryColors.gold)
                        }
                    }
                    .frame(height: 23, alignment: .leading)
                }
            }
            .padding(.vertical, 1)
        }
    }

    private func promptLabel(_ p: GaryPrompt) -> some View {
        let isNew = fresh(p)
        let chevron = Image(systemName: "chevron.right")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(GaryColors.gold)
        return VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                if isNew {
                    Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                        .background(Circle().fill(GaryColors.win.opacity(0.22)).frame(width: 12, height: 12))
                }
                Text(isNew ? (p.newKicker ?? p.kicker) : p.kicker)
                    .font(GaryFonts.kicker(9.5, .bold)).tracking(1.5)
                    .foregroundStyle(isNew ? GaryColors.win : GaryColors.gold)
                    .fitsOneLine()
            }
            // Display lines set tight, the way a label on a diagram reads (the face's own leading is loose).
            let lines = p.news.components(separatedBy: "\n")
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                    HStack(spacing: 5) {
                        Text(line)
                            .font(GaryFonts.display(21)).foregroundStyle(GaryColors.warmWhite)
                            .fitsOneLine()
                        if p.hook == nil, i == lines.count - 1 { chevron }
                    }
                    .frame(height: 23, alignment: .leading)
                }
            }
            .padding(.vertical, 1)
            if let hook = p.hook {
                HStack(spacing: 4) {
                    Text(hook)
                        .font(GaryFonts.display(18))
                        .foregroundStyle(p.hookWins ? GaryColors.win : GaryColors.lightGold)
                        .monospacedDigit().fitsOneLine()
                    chevron
                }
            }
        }
        .accessibilityLabel("\(isNew ? "New: " : "")\(p.kicker.capitalized), \(p.news.replacingOccurrences(of: "\n", with: " ").capitalized)\(p.hook.map { ", \($0)" } ?? "")")
    }

    @MainActor private func refresh() async {
        now = Date()
        async let board = try? SupabaseAPI.fetchLabBoard(date: slate)
        async let money: GaryBankrollSnapshot? = {
            guard let data = try? await WinnersAccessStore.request("rest/v1/rpc/get_gary_bankroll", body: [:]) else { return nil }
            return try? JSONDecoder().decode(GaryBankrollSnapshot.self, from: data)
        }()
        async let dartBoard = try? SupabaseAPI.fetchDarts(date: slate)
        async let todayParlay = try? SupabaseAPI.fetchParlay(date: slate)
        let (b, m, d, p) = await (board, money, dartBoard, todayParlay)
        guard !Task.isCancelled else { return }
        if let b { tonight = b }
        if let m { bankroll = m }
        if let d { darts = d }
        if let p { parlay = p }
        // Before tonight's parlay lands, last night's (a hit says so).
        if parlay == nil, lastParlay?.date != LabFormat.yesterday(of: slate) {
            if case let y?? = try? await SupabaseAPI.fetchParlay(date: LabFormat.yesterday(of: slate)) { lastParlay = y }
        }
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

/// Gary alive on Home (founder, Oct 30 2026: "a live character who is fluid, does his own thing, moves around
/// a little bit, smokes his cigar, reads the newspaper ... without having to have these looped reactions").
/// He stands in his easy stance a few seconds at a time, breathing, swaying a little, smoke curling off the
/// cigar, then lives a moment from a drawn clip: a slow puff, a look at the racing form. Every clip starts and
/// ends on the stance, so they chain with no cut. Which clip comes next and how long he stands between them
/// are left to chance, never the same clip twice running, and last night tilts the odds: more cigar after a
/// good night, more of the form after a bad one. Still on Reduce Motion or when Home is off screen.
struct GaryIdleFigure: View {
    /// Last night's face (Home's LAST NIGHT ladder) tilts which clip comes up.
    let mood: String?
    let height: CGFloat
    let active: Bool
    /// Off, he only stands and breathes, the cigar going (the talk room: he listens and answers, no bits).
    var lives = true
    /// Told when his prop goes out past him and when it's back.
    var onPerform: (Bool) -> Void = { _ in }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var life = GaryLife()

    /// The stance's art (568 × 900), its center of mass across the width, and the cigar tip smoke rises from.
    static let baseAspect: CGFloat = 568 / 900
    static let stanceCx: CGFloat = 0.487
    static let stanceSmoke = CGPoint(x: 0.68, y: 0.19)
    /// Where the stance sits inside every clip's frame: the clips were drawn from it, on a 1080 × 1728 crop.
    static let clipStance = CGRect(x: 80.0 / 1080, y: 256.0 / 1728, width: 920.0 / 1080, height: 1458.0 / 1728)

    /// Where the labels point on the stance: always his outline, about level with each label, so a line never
    /// crosses him and his hands never cover one (founder, Oct 30 2026: "the lines should stay to the outer
    /// parts of Gary"). The edge of his sunglasses, his right hip, the outside of his right leg, his right
    /// shoulder, his left hip, the toe of his left shoe.
    static let head = CGPoint(x: 0.34, y: 0.09)
    static let hip = CGPoint(x: 0.75, y: 0.59)
    static let leg = CGPoint(x: 0.645, y: 0.86)
    static let shoulder = CGPoint(x: 0.73, y: 0.25)
    static let pocket = CGPoint(x: 0.29, y: 0.57)
    static let shoe = CGPoint(x: 0.12, y: 0.955)
    /// The left of his jaw, under the sunglasses: where ASK GARY points.
    static let jaw = CGPoint(x: 0.33, y: 0.2)

    /// The spot on him each prompt points at.
    static func anchor(_ spot: GaryPrompt.Spot) -> CGPoint {
        switch spot {
        case .shoulder: return shoulder
        case .pocket: return pocket
        case .shoe: return shoe
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !active || reduceMotion)) { ctx in
            figure(at: reduceMotion ? Date(timeIntervalSinceReferenceDate: 0) : ctx.date)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onChange(of: mood) { m in life.mood = m }
        .onChange(of: life.performing) { onPerform($0) }
        // Lives while he's on screen and moving; SwiftUI ends it when he leaves and starts it again on return.
        .task(id: active && !reduceMotion && lives) {
            life.mood = mood
            guard active && !reduceMotion && lives else { return }
            await life.live()
        }
    }

    private func figure(at date: Date) -> some View {
        let t = date.timeIntervalSinceReferenceDate
        // The breath and the sway, eased out before a clip and back in after it. They move whichever layer is
        // showing, as one piece, so nothing shifts when the layers hand over.
        let calm = reduceMotion ? 0 : life.stanceMotion(at: date)
        let breath = 1 + 0.009 * calm * sin(2 * .pi * t / 3.4)
        let sway = 0.7 * calm * sin(2 * .pi * t / 6.3)
        return GeometryReader { geo in
            let w = geo.size.width, floor = geo.size.height
            let s = CGSize(width: height * Self.baseAspect, height: height)
            let left = w / 2 - Self.stanceCx * s.width
            let r = Self.clipStance
            let vw = s.width / r.width, vh = s.height / r.height
            ZStack(alignment: .topLeading) {
                // His stance between clips (and on Reduce Motion): a clip's own first frame, cut out the same way
                // and laid exactly where the clips lie, so handing over to the video changes nothing.
                Image("GaryStanceClip")
                    .resizable()
                    .frame(width: vw, height: vh)
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.13)],
                                         startPoint: .top, endPoint: .bottom))
                    .opacity(life.opacity(of: -1, at: date))
                    .zIndex(life.depth(of: -1))
                    .position(x: left - r.minX * vw + vw / 2, y: floor - s.height - r.minY * vh + vh / 2)
                // Two clip layers that take turns, both always mounted, so the next clip's first frame is up
                // before it shows. Their smoke fades out over the top before it reaches the scoreboard.
                ForEach(0..<2, id: \.self) { i in
                    GaryClipView(player: life.players[i], output: life.outputs[i], board: life.boards[i])
                        .frame(width: vw, height: vh)
                        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.13)],
                                             startPoint: .top, endPoint: .bottom))
                        .opacity(life.opacity(of: i, at: date))
                        .zIndex(life.depth(of: i))
                        .position(x: left - r.minX * vw + vw / 2, y: floor - s.height - r.minY * vh + vh / 2)
                }
                if !reduceMotion && calm > 0 {
                    smoke(from: CGPoint(x: left + Self.stanceSmoke.x * s.width, y: floor - s.height + Self.stanceSmoke.y * s.height),
                          t: t, strength: calm)
                        .zIndex(3)
                }
            }
            .rotationEffect(.degrees(sway), anchor: .bottom)
            .scaleEffect(x: 2 - breath, y: breath, anchor: .bottom)
        }
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

/// Gary's days between the labels: a stand of a few seconds, a clip, a stand, another clip. He stands in one
/// frame, the stance cut from a clip, never the drawing, so a clip starting is the same frame starting to move
/// (founder, Oct 30 2026: "a little jump or hint that it's changing videos"). While he stands, the next clip
/// loads in a hidden player and its first frame (the stance) dissolves in over the stance frame; in a clip's
/// last moments the stance frame fades back in over it, so a clip that ends a hair off his pose still lands on
/// it. `live()` runs inside the figure's task, so leaving Home ends it.
@MainActor
final class GaryLife: ObservableObject {
    /// The plan's clips that shipped in this build.
    private let clips = GaryLifePlan.clips.filter { Bundle.main.url(forResource: $0.name, withExtension: "mp4") != nil }

    let players = [AVPlayer(), AVPlayer()]
    /// Each player's frames, attached to every item before it loads so its first frame is never missed.
    let outputs = (0..<2).map { _ in
        AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    }
    var mood: String?
    /// The layer showing: 0 or 1 while a clip plays, -1 for the stance frame he stands in between them.
    @Published private(set) var front = -1
    /// A hand-over in progress: the next layer fading in over the one showing.
    @Published private(set) var handOver: (from: Int, to: Int, start: Date)?
    @Published private(set) var playing = false
    /// A clip's last moments: the stance frame fading in over it, so every clip lands on the same frame however
    /// near its own last frame came (founder, Oct 30 2026: "still some smoothing to do").
    @Published private(set) var settle: Date?
    /// His prop is out past him (the board up, the ball spinning): the diagram steps back.
    @Published private(set) var performing = false
    /// Each layer's whiteboard ink, when its clip is the whiteboard.
    @Published private(set) var boards: [GaryBoardInk?] = [nil, nil]
    private var standEnd: Date?
    private var lastClipEnd: Date?
    private var recent: [String] = []

    private static let handOverTime = 0.45
    private static let settleTime = 0.35
    /// Each once-a-day clip's last day: clip name → day.
    private static let rareDaysKey = "garyRareClipDays"

    init() {
        for p in players {
            p.isMuted = true
            p.actionAtItemEnd = .pause
            p.preventsDisplaySleepDuringVideoPlayback = false
        }
    }

    /// A layer's opacity: the next one fades in on top while the one under it stays whole, so the figure
    /// never thins out mid-way.
    func opacity(of layer: Int, at now: Date) -> Double {
        if let h = handOver {
            if layer == h.to { return Self.smooth(now.timeIntervalSince(h.start) / Self.handOverTime) }
            if layer == h.from { return 1 }
            return 0
        }
        if layer == -1, let s = settle { return Self.smooth(now.timeIntervalSince(s) / Self.settleTime) }
        return layer == front ? 1 : 0
    }

    func depth(of layer: Int) -> Double {
        if layer == -1, settle != nil { return 3 }
        return handOver?.to == layer ? 2 : layer == front ? 1 : 0
    }

    /// How much the stance breathes and sways: none during a clip, easing back after one and out before the next.
    func stanceMotion(at now: Date) -> Double {
        if playing { return 0 }
        var v = 1.0
        if let end = lastClipEnd { v = min(v, Self.smooth(now.timeIntervalSince(end) / 1.2)) }
        if let next = standEnd { v = min(v, Self.smooth(next.timeIntervalSince(now) / 0.8)) }
        return v
    }

    /// His days, until the task is cancelled.
    func live() async {
        defer {
            for p in players { p.pause() }
            playing = false
            handOver = nil
            settle = nil
            performing = false
            standEnd = nil
            // Back on Home he picks up from his stance, not from a clip cut off part way.
            front = -1
        }
        var first = true
        var turn = 0
        while !Task.isCancelled {
            // The fourth-wall phone is a once-a-day bit, never the first thing he does.
            let today = SupabaseAPI.todayEST()
            let rareDays = UserDefaults.standard.dictionary(forKey: Self.rareDaysKey) as? [String: String] ?? [:]
            let pool = GaryLifePlan.pool(clips, first: first, rareDays: rareDays, today: today)
            var pick = GaryLifePlan.next(from: pool, recent: recent, mood: mood, roll: Double.random(in: 0..<1),
                                         rareAllowed: true)
            #if DEBUG
            // Tour verb `garyclip <name>` plays that clip every time, to check it.
            if let forced = UserDefaults.standard.string(forKey: "garyClipPreview"), !forced.isEmpty { pick = forced }
            #endif
            guard let name = pick, let url = Bundle.main.url(forResource: name, withExtension: "mp4") else { return }
            let clip = clips.first { $0.name == name }
            // The players take turns, so the one that just played is never reloaded under the stance.
            let next = turn % 2
            turn += 1
            boards[next] = nil
            let item = AVPlayerItem(url: url)
            item.add(outputs[next])
            players[next].replaceCurrentItem(with: item)
            let stand = GaryLifePlan.stand(first: first, roll: Double.random(in: 0..<1))
            first = false
            let began = Date()
            standEnd = began.addingTimeInterval(stand)
            // His bet for the whiteboard, read while he stands.
            if let track = GaryBoardInk.track(for: name) {
                let board = await Self.board(today: today)
                guard !Task.isCancelled else { return }
                boards[next] = GaryBoardInk(track: track, board: board)
            }
            while item.status == .unknown && !Task.isCancelled { try? await Task.sleep(nanoseconds: 50_000_000) }
            guard !Task.isCancelled, item.status == .readyToPlay else { return }
            _ = await players[next].seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
            // A beat for its first frame to draw, then the hand-over, early in the stand while he's still.
            let wait = max(0.15, min(stand * 0.35, 1.2) - Date().timeIntervalSince(began))
            try? await Task.sleep(nanoseconds: UInt64(wait * 1e9))
            guard !Task.isCancelled else { return }
            handOver = (front, next, Date())
            try? await Task.sleep(nanoseconds: UInt64(Self.handOverTime * 1e9))
            guard !Task.isCancelled else { return }
            front = next
            handOver = nil
            if let end = standEnd, end > Date() { try? await Task.sleep(nanoseconds: UInt64(end.timeIntervalSinceNow * 1e9)) }
            guard !Task.isCancelled else { return }
            // Played to its own last frame (the stance again) by the player's clock, and held there.
            let length = item.duration.seconds.isFinite ? item.duration.seconds : 8
            standEnd = nil
            playing = true
            players[front].play()
            let until = Date().addingTimeInterval(length + 3)
            while !Task.isCancelled, Date() < until, players[front].currentTime().seconds < length - 0.05 {
                let now = players[front].currentTime().seconds
                if settle == nil, now >= length - Self.settleTime - 0.08 { settle = Date() }
                let up = clip?.performs(at: now) ?? false
                if up != performing { performing = up }
                try? await Task.sleep(nanoseconds: 30_000_000)
            }
            guard !Task.isCancelled else { return }
            // He stands in the stance frame until the next clip takes over from it.
            performing = false
            front = -1
            settle = nil
            playing = false
            lastClipEnd = Date()
            recent = Array((recent + [name]).suffix(2))
            if clip?.rare == true {
                var days = rareDays
                days[name] = today
                UserDefaults.standard.set(days, forKey: Self.rareDaysKey)
            }
        }
    }

    private static func smooth(_ x: Double) -> Double {
        let t = min(1, max(0, x)); return t * t * (3 - 2 * t)
    }

    /// Today's streak pick (it's the free pick), or what he writes before there is one.
    private static func board(today: String) async -> GaryLifePlan.Board {
        let state = try? await SupabaseAPI.fetchStreak(date: today)
        func ticket(_ p: StreakPick?) -> GaryLifePlan.Ticket? {
            p.map { GaryLifePlan.Ticket(kind: $0.kind, league: $0.league, pickText: $0.pick_text, player: $0.player,
                                        prop: $0.prop, bet: $0.bet, result: $0.result) }
        }
        return GaryLifePlan.board(today: ticket(state?.today), yesterday: ticket(state?.yesterday))
    }
}

/// The bet on Gary's whiteboard (founder, Oct 30 2026: "he wrote on it and turned it around ... a bet on it in
/// his hand writing"). The clip is drawn with the board's face blank; the bet is written once in a marker hand
/// and laid onto the face every frame along the board's corners, tracked from the clip (`gary-board.json`:
/// per frame TL TR BR BL in the picture, 0...1 from the top left, and how much of it shows as it turns).
final class GaryBoardInk {
    struct Track: Decodable {
        let fps: Double
        let frames: [[Double]?]
    }

    let track: Track
    let ink: CIImage

    init(track: Track, board: GaryLifePlan.Board) {
        self.track = track
        self.ink = Self.write(board)
    }

    static func track(for clip: String) -> Track? {
        guard let url = Bundle.main.url(forResource: clip, withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Track.self, from: data)
    }

    /// The board's corners in a frame of `size` (Core Image's, from the bottom left) and how much ink shows.
    func face(at seconds: Double, in size: CGSize) -> (corners: [CGPoint], show: Double)? {
        let i = Int((seconds * track.fps).rounded())
        guard i >= 0, i < track.frames.count, let f = track.frames[i], f.count >= 9 else { return nil }
        let corners = stride(from: 0, to: 8, by: 2).map { CGPoint(x: f[$0] * size.width, y: (1 - f[$0 + 1]) * size.height) }
        return (corners, f[8])
    }

    /// His hand: black marker, two lines set to fill the board, a touch off level; a green check when it cashed.
    private static func write(_ board: GaryLifePlan.Board) -> CIImage {
        let size = CGSize(width: 900, height: 640)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let cg = ctx.cgContext
            cg.translateBy(x: size.width / 2, y: size.height / 2)
            cg.rotate(by: -3 * .pi / 180)
            cg.translateBy(x: -size.width / 2, y: -size.height / 2)
            let ink = UIColor(red: 0.086, green: 0.094, blue: 0.118, alpha: 1)
            let lines = Array(board.lines.prefix(2))
            let rowHeight = size.height / CGFloat(max(lines.count, 1))
            var lastFrame = CGRect.zero
            for (i, line) in lines.enumerated() {
                var pt: CGFloat = 210
                var attrs: [NSAttributedString.Key: Any] = [:]
                var w: CGFloat = .greatestFiniteMagnitude
                let room = size.width * (board.check && i == lines.count - 1 ? 0.7 : 0.86)
                repeat {
                    let font = UIFont(name: "MarkerFelt-Wide", size: pt) ?? .systemFont(ofSize: pt, weight: .heavy)
                    attrs = [.font: font, .foregroundColor: ink]
                    w = (line as NSString).size(withAttributes: attrs).width
                    pt -= 6
                } while w > room && pt > 60
                let h = (line as NSString).size(withAttributes: attrs).height
                let x = (size.width - w) / 2 - (board.check && i == lines.count - 1 ? size.width * 0.07 : 0)
                let frame = CGRect(x: x, y: rowHeight * CGFloat(i) + (rowHeight - h) / 2 + (i == 0 ? 18 : -18), width: w, height: h)
                (line as NSString).draw(in: frame, withAttributes: attrs)
                lastFrame = frame
            }
            if board.check {
                let c = CGPoint(x: lastFrame.maxX + 40, y: lastFrame.midY)
                let tick = UIBezierPath()
                tick.move(to: CGPoint(x: c.x, y: c.y + 4))
                tick.addLine(to: CGPoint(x: c.x + 34, y: c.y + 44))
                tick.addLine(to: CGPoint(x: c.x + 100, y: c.y - 60))
                tick.lineWidth = 26
                tick.lineCapStyle = .round
                tick.lineJoinStyle = .round
                UIColor(red: 0.12, green: 0.56, blue: 0.24, alpha: 1).setStroke()
                tick.stroke()
            }
        }
        return CIImage(image: image) ?? CIImage.empty()
    }
}

/// A clip with its see-through kept. Each clip is one plain video, the picture over its alpha (a video's own
/// alpha doesn't show in the simulator or on every device), put back together here every frame. A paused
/// player keeps its last frame up.
private struct GaryClipView: UIViewRepresentable {
    let player: AVPlayer
    let output: AVPlayerItemVideoOutput
    let board: GaryBoardInk?

    final class ClipView: UIView {
        private static let context = CIContext(options: [.cacheIntermediates: false])
        private var link: CADisplayLink?
        var output: AVPlayerItemVideoOutput?
        var board: GaryBoardInk?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            link?.invalidate()
            link = nil
            guard window != nil else { return }
            let l = CADisplayLink(target: self, selector: #selector(tick))
            l.preferredFramesPerSecond = 30
            l.add(to: .main, forMode: .common)
            link = l
        }

        @objc private func tick() {
            guard let output else { return }
            let t = output.itemTime(forHostTime: CACurrentMediaTime())
            guard output.hasNewPixelBuffer(forItemTime: t),
                  let buffer = output.copyPixelBuffer(forItemTime: t, itemTimeForDisplay: nil) else { return }
            let full = CIImage(cvPixelBuffer: buffer)
            let w = full.extent.width, h = full.extent.height / 2
            // Core Image counts from the bottom: the picture is the upper half, its alpha the lower.
            var picture = full.cropped(to: CGRect(x: 0, y: h, width: w, height: h))
                .transformed(by: CGAffineTransform(translationX: 0, y: -h))
            if let board, let face = board.face(at: t.seconds, in: CGSize(width: w, height: h)) {
                picture = Self.write(board.ink, on: picture, at: face.corners, show: face.show)
            }
            let alpha = full.cropped(to: CGRect(x: 0, y: 0, width: w, height: h))
            let frame = picture.applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: CIImage.empty(), kCIInputMaskImageKey: alpha,
            ])
            guard let image = Self.context.createCGImage(frame, from: CGRect(x: 0, y: 0, width: w, height: h)) else { return }
            layer.contents = image
        }

        /// The ink laid along the board's corners, only where the board is white: his fingers stay over it.
        private static func write(_ ink: CIImage, on picture: CIImage, at c: [CGPoint], show: Double) -> CIImage {
            let laid = ink.applyingFilter("CIPerspectiveTransform", parameters: [
                "inputTopLeft": CIVector(cgPoint: c[0]), "inputTopRight": CIVector(cgPoint: c[1]),
                "inputBottomRight": CIVector(cgPoint: c[2]), "inputBottomLeft": CIVector(cgPoint: c[3]),
            ]).applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: CGFloat(show))])
            // White is where every channel is high: min(r, g, b) from about 0.66 up to 0.79, a soft edge.
            let white = picture.applyingFilter("CIMinimumComponent")
                .applyingFilter("CIColorMatrix", parameters: [
                    "inputRVector": CIVector(x: 8, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 8, z: 0, w: 0),
                    "inputBVector": CIVector(x: 0, y: 0, z: 8, w: 0), "inputBiasVector": CIVector(x: -5.3, y: -5.3, z: -5.3, w: 0),
                ])
                .applyingFilter("CIColorClamp")
            return laid.composited(over: picture).applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: picture, kCIInputMaskImageKey: white,
            ]).cropped(to: picture.extent)
        }
    }

    func makeUIView(context: Context) -> ClipView {
        let v = ClipView()
        v.isOpaque = false
        v.backgroundColor = .clear
        v.isUserInteractionEnabled = false
        v.layer.contentsGravity = .resize
        v.output = output
        v.board = board
        return v
    }

    func updateUIView(_ v: ClipView, context: Context) {
        v.output = output
        v.board = board
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

/// The ring that pulses on Gary where a new prompt points (still under Reduce Motion).
private struct PromptPulse: View {
    let still: Bool
    @State private var out = false

    var body: some View {
        Circle()
            .stroke(GaryColors.win.opacity(still ? 0.55 : (out ? 0 : 0.7)), lineWidth: 1.5)
            .frame(width: 24, height: 24)
            .scaleEffect(still ? 1 : (out ? 1.6 : 0.6))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                guard !still else { return }
                withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { out = true }
            }
    }
}
