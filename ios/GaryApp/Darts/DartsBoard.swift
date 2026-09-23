import SwiftUI

// The top of the Darts page (founder, Sep 23 2026, from the canvas mocks):
// the darts on a dartboard (mock 03), hit streaks against the hitless in two
// columns (mock 03), and the clubs on a win or loss run as a market map
// (mock 09) where the longer run takes the bigger share.

// MARK: - The dartboard

/// The category's darts on a board. Around the rim is the day's clock, so a
/// dart sits at its first pitch; out from the bull is its price, so the long
/// shots land on the outer ring. Each dart wears a tag with its name and
/// price; the tag opens the player's card (a first-inning dart, either club's).
struct Dartboard: View {
    let darts: [DartRow]
    let onPlayer: (DartRow) -> Void
    let onTeam: (_ name: String, _ league: String) -> Void

    var body: some View {
        GeometryReader { g in
            let plan = DartboardPlan(darts: darts, side: g.size.width)
            ZStack(alignment: .topLeading) {
                Canvas { ctx, _ in plan.draw(&ctx) }
                    .accessibilityHidden(true)
                DartTagLayout(anchors: plan.marks.map(\.tip), obstacles: plan.obstacles) {
                    ForEach(plan.marks) { m in tag(m.dart) }
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }

    @ViewBuilder private func tag(_ d: DartRow) -> some View {
        if d.isGame, let teams = d.gameTeams {
            Menu {
                Button(teams.away) { onTeam(teams.away, d.league) }
                Button(teams.home) { onTeam(teams.home, d.league) }
            } label: { DartTag(dart: d) }
            .menuIndicator(.hidden)
        } else {
            Button { onPlayer(d) } label: { DartTag(dart: d) }.buttonStyle(.plain)
        }
    }
}

/// A dart's tag: the name, then the price (or why it is off).
struct DartTag: View {
    let dart: DartRow

    private var name: String { dart.player }
    /// YES or NO on a first-inning dart; the line on a yards or passing dart.
    private var side: String? {
        if dart.isGame { return (dart.bet ?? "over") == "under" ? "NO" : "YES" }
        return dart.lineWords
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name).font(GaryFonts.ui(12, .semibold))
                .foregroundStyle(dart.isScratched ? LabInk.dim : GaryColors.warmWhite)
                .fixedSize()
            if dart.isScratched {
                Text(dart.scratchWord.capitalized).font(GaryFonts.ui(10, .medium)).foregroundStyle(LabInk.dimmer)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    if let side { Text(side).font(GaryFonts.display(13)).tracking(0.6).foregroundStyle(GaryColors.silver) }
                    Text(LabFormat.price(dart.odds)).font(GaryFonts.display(17.5)).foregroundStyle(GaryColors.gold).monospacedDigit()
                }
                .fixedSize()
            }
        }
        .padding(.leading, 8).padding(.trailing, 9).padding(.vertical, 4)
        .frame(minHeight: 40)
        .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(GaryColors.darkBg))
        .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous)
            .stroke(GaryColors.warmWhite.opacity(dart.isScratched ? 0.09 : 0.14), lineWidth: 1))
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityWords)
    }

    private var accessibilityWords: String {
        let price = dart.isScratched ? dart.scratchWord.lowercased() : [side, LabFormat.price(dart.odds)].compactMap { $0 }.joined(separator: " ")
        return [name, price, dart.isGame ? LabFormat.timeET(dart.commence_time) : dart.gameLine].filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

/// Where everything on the board goes. Drawn in the mock's 358-point space
/// (bull at 179, board out to 150) and scaled to the width on screen.
struct DartboardPlan {
    struct Mark: Identifiable {
        let dart: DartRow
        let tip: CGPoint
        /// The dart's first pitch on the rim, before darts that share a time fan out.
        let rim: Double
        var id: Int { dart.id }
    }

    let side: CGFloat
    let s: CGFloat
    let c: CGPoint
    private(set) var marks: [Mark] = []
    private(set) var hours: [(angle: Double, text: String)] = []
    private(set) var scale: [(r: CGFloat, text: String)] = []

    private static let scaleAngle = 112.5
    private static let et = TimeZone(identifier: "America/New_York")!
    /// Price stops for the scale, shortest to longest.
    private static let stops = [-300, -200, -150, -120, 100, 150, 200, 300, 500, 800, 1200, 2000]

    init(darts: [DartRow], side: CGFloat) {
        self.side = side
        s = side / 358
        c = CGPoint(x: side / 2, y: side / 2)

        // The clock: the day's first pitches fit inside one lap, 4 hours to a
        // lap on a night slate, the hour marks on the diagonals.
        var cal = Calendar(identifier: .gregorian); cal.timeZone = Self.et
        let times = darts.map { LabFormat.parseISO($0.commence_time) }
        var angleOf: (Date) -> Double? = { _ in nil }
        if let first = times.compactMap({ $0 }).min(), let last = times.compactMap({ $0 }).max() {
            let midnight = cal.startOfDay(for: first)
            let e = first.timeIntervalSince(midnight) / 3600
            let l = last.timeIntervalSince(midnight) / 3600
            for step in [1.0, 2, 3, 4, 6, 12, 24] {
                let mark = floor((e + step / 2) / step) * step
                let start = mark - step / 2
                guard l < start + 4 * step - step * 0.15 else { continue }
                let days = Set(times.compactMap { $0 }.map { cal.startOfDay(for: $0) }).count
                let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.timeZone = Self.et
                f.dateFormat = days > 1 ? "EEE h a" : "h a"
                hours = (0..<4).map { k in
                    let at = midnight.addingTimeInterval((mark + Double(k) * step) * 3600)
                    return (45 + 90 * Double(k), f.string(from: at).uppercased())
                }
                angleOf = { d in (d.timeIntervalSince(midnight) / 3600 - start) / (4 * step) * 360 }
                break
            }
        }

        // The price: out from the bull on a log scale between two stops.
        let pays = darts.compactMap { $0.odds.map(Self.payout) }
        let stopPays = Self.stops.map(Self.payout)
        var lo = 0, hi = Self.stops.count - 1
        if let least = pays.min(), let most = pays.max() {
            lo = stopPays.lastIndex { $0 <= least + 1e-9 } ?? 0
            hi = stopPays.firstIndex { $0 >= most - 1e-9 } ?? Self.stops.count - 1
            if lo == hi { if hi < Self.stops.count - 1 { hi += 1 } else { lo -= 1 } }
        } else {
            lo = Self.stops.firstIndex(of: 100) ?? 4; hi = lo + 3
        }
        let lnLo = log(stopPays[lo]), lnHi = log(stopPays[hi])
        func radius(_ odds: Int?) -> CGFloat {
            guard let odds else { return 100 }
            let t = (log(Self.payout(odds)) - lnLo) / (lnHi - lnLo)
            return min(146, max(34, 50 + 95 * CGFloat(t)))
        }
        var shown = Array(lo...hi)
        if shown.count > 4 {
            let n = shown.count
            shown = [shown[0], shown[n / 3], shown[(2 * n) / 3], shown[n - 1]]
        }
        scale = shown.map { (radius(Self.stops[$0]), LabFormat.price(Self.stops[$0])) }

        // Darts on one first pitch fan out a few degrees so their tags part.
        let rims: [Double] = darts.enumerated().map { i, d in
            if let t = times[i], let a = angleOf(t) { return a }
            return 30 + 360 * Double(i) / Double(max(darts.count, 1))
        }
        var fanned = rims
        let groups = Dictionary(grouping: rims.indices) { Int(rims[$0].rounded()) }
        for (_, members) in groups where members.count > 1 {
            let ordered = members.sorted { radius(darts[$0].odds) < radius(darts[$1].odds) }
            for (k, i) in ordered.enumerated() { fanned[i] = rims[i] + (Double(k) - Double(ordered.count - 1) / 2) * 7 }
        }
        let centre = c, unit = s
        marks = darts.enumerated().map { i, d in
            let a = fanned[i] * .pi / 180, r = radius(d.odds) * unit
            return Mark(dart: d, tip: CGPoint(x: centre.x + r * CGFloat(sin(a)), y: centre.y - r * CGFloat(cos(a))), rim: rims[i])
        }
    }

    /// What a dollar pays in profit at an American price.
    static func payout(_ odds: Int) -> Double { odds > 0 ? Double(odds) / 100 : 100 / Double(max(1, -odds)) }

    /// Places a tag should not cover: the darts and the hour marks.
    var obstacles: [CGRect] {
        let glyphs = marks.map { CGRect(x: $0.tip.x - 2, y: $0.tip.y - 19 * s, width: 21 * s, height: 21 * s) }
        let hourBoxes = hours.map { h -> CGRect in let p = point(161.5, h.angle); return CGRect(x: p.x - 24, y: p.y - 8, width: 48, height: 16) }
        return glyphs + hourBoxes
    }

    func point(_ r: CGFloat, _ degrees: Double) -> CGPoint {
        let a = degrees * .pi / 180
        return CGPoint(x: c.x + r * s * CGFloat(sin(a)), y: c.y - r * s * CGFloat(cos(a)))
    }

    private func circle(_ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: c.x - r * s, y: c.y - r * s, width: 2 * r * s, height: 2 * r * s))
    }

    /// A ring segment between two radii and two angles.
    private func segment(_ r0: CGFloat, _ r1: CGFloat, _ a0: Double, _ a1: Double) -> Path {
        var p = Path()
        let n = max(2, Int(abs(a1 - a0)))
        for k in 0...n {
            let q = point(r1, a0 + (a1 - a0) * Double(k) / Double(n))
            if k == 0 { p.move(to: q) } else { p.addLine(to: q) }
        }
        for k in (0...n).reversed() { p.addLine(to: point(r0, a0 + (a1 - a0) * Double(k) / Double(n))) }
        p.closeSubpath()
        return p
    }

    private func line(_ a: CGPoint, _ b: CGPoint) -> Path {
        var p = Path(); p.move(to: a); p.addLine(to: b); return p
    }

    func draw(_ ctx: inout GraphicsContext) {
        let gold = GaryColors.gold, ink = GaryColors.warmWhite
        let round = StrokeStyle(lineWidth: 1, lineCap: .round)

        ctx.stroke(circle(172), with: .color(ink.opacity(0.1)), lineWidth: 1)
        ctx.fill(circle(20), with: .color(LabInk.plateDeep))

        // Twenty wedges, the treble and double rings lit in turn.
        for i in 0..<20 {
            let a0 = -9 + 18 * Double(i), a1 = a0 + 18
            ctx.fill(segment(20, 150, a0, a1), with: .color(i % 2 == 0 ? LabInk.plate : LabInk.plateDeep))
            let lit = gold.opacity(i % 2 == 0 ? 0.15 : 0.05)
            ctx.fill(segment(85, 95, a0, a1), with: .color(lit))
            ctx.fill(segment(140, 150, a0, a1), with: .color(lit))
        }
        for i in 0..<20 {
            let a = -9 + 18 * Double(i)
            ctx.stroke(line(point(20, a), point(150, a)), with: .color(gold.opacity(0.16)), lineWidth: 0.6)
        }
        for r in [20, 85, 95, 140, 150] as [CGFloat] {
            ctx.stroke(circle(r), with: .color(gold.opacity(0.35)), lineWidth: 0.8)
        }
        ctx.fill(circle(10), with: .color(gold))

        // The rim: a tick every quarter lap and between, the hours on the diagonals.
        for k in 0..<16 where k % 4 != 2 {
            let a = 22.5 * Double(k)
            let major = k % 4 == 0
            ctx.stroke(line(point(151.5, a), point(major ? 158 : 155, a)), with: .color(ink.opacity(major ? 0.42 : 0.24)), style: round)
        }
        if !hours.isEmpty {
            for h in hours {
                ctx.draw(Text(h.text).font(.system(size: 11, design: .monospaced)).foregroundColor(ink.opacity(0.52)),
                         at: point(161.5, h.angle), anchor: .center)
            }
        }

        // Each dart's first pitch, marked in gold on the rim.
        for m in marks {
            ctx.stroke(line(point(164, m.rim), point(171, m.rim)), with: .color(gold.opacity(m.dart.isScratched ? 0.3 : 1)),
                       style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        }

        // The price scale along one spoke.
        let a = Self.scaleAngle * .pi / 180
        let dir = CGPoint(x: CGFloat(sin(a)), y: CGFloat(-cos(a)))
        let perp = CGPoint(x: -dir.y, y: dir.x)
        ctx.stroke(line(point(22, Self.scaleAngle), point(148, Self.scaleAngle)), with: .color(ink.opacity(0.14)), lineWidth: 0.8)
        for stop in scale {
            let p = point(stop.r, Self.scaleAngle)
            ctx.stroke(line(CGPoint(x: p.x - perp.x * 3, y: p.y - perp.y * 3), CGPoint(x: p.x + perp.x * 3, y: p.y + perp.y * 3)),
                       with: .color(ink.opacity(0.4)), lineWidth: 1)
            ctx.draw(Text(stop.text).font(.system(size: 8, design: .monospaced)).foregroundColor(ink.opacity(0.4)),
                     at: CGPoint(x: p.x + perp.x * 11, y: p.y + perp.y * 11), anchor: .center)
        }

        // The darts, tip in the board, flights up and to the right.
        for m in marks { drawDart(&ctx, at: m.tip, dim: m.dart.isScratched) }
    }

    private func drawDart(_ ctx: inout GraphicsContext, at tip: CGPoint, dim: Bool) {
        var d = ctx
        d.opacity = dim ? 0.34 : 1
        d.translateBy(x: tip.x, y: tip.y)
        d.scaleBy(x: s, y: s)
        let gold = GaryColors.gold, pale = Color(hex: "#F4E4BA")
        func tri(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint) -> Path { var p = Path(); p.move(to: a); p.addLine(to: b); p.addLine(to: c); p.closeSubpath(); return p }
        d.fill(tri(CGPoint(x: 11.2, y: -11.2), CGPoint(x: 16.6, y: -11.8), CGPoint(x: 14.6, y: -14.6)), with: .color(gold))
        d.fill(tri(CGPoint(x: 11.2, y: -11.2), CGPoint(x: 11.8, y: -16.6), CGPoint(x: 14.6, y: -14.6)), with: .color(pale))
        d.stroke(line(CGPoint(x: 7.6, y: -7.6), CGPoint(x: 14.2, y: -14.2)), with: .color(gold), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
        d.stroke(line(CGPoint(x: 3.4, y: -3.4), CGPoint(x: 7.8, y: -7.8)), with: .color(gold), style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
        d.fill(tri(.zero, CGPoint(x: 4.4, y: -2), CGPoint(x: 2, y: -4.4)), with: .color(pale))
    }
}

/// Sets each tag beside its dart: to the left first (the flights point up
/// and right), then below, above or right, wherever it covers the least.
struct DartTagLayout: Layout {
    let anchors: [CGPoint]
    let obstacles: [CGRect]

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? 358
        return CGSize(width: w, height: proposal.height ?? w)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let frames = Self.place(sizes: sizes, anchors: anchors, obstacles: obstacles, box: CGSize(width: bounds.width, height: bounds.height))
        for (i, view) in subviews.enumerated() where i < frames.count {
            view.place(at: CGPoint(x: bounds.minX + frames[i].minX, y: bounds.minY + frames[i].minY), proposal: ProposedViewSize(sizes[i]))
        }
    }

    static func place(sizes: [CGSize], anchors: [CGPoint], obstacles: [CGRect], box: CGSize) -> [CGRect] {
        let n = min(sizes.count, anchors.count)
        var out = Array(repeating: CGRect.zero, count: n)
        let centre = CGPoint(x: box.width / 2, y: box.height / 2)
        // The outer darts have the least room, so they choose first.
        let order = (0..<n).sorted { hypot(anchors[$0].x - centre.x, anchors[$0].y - centre.y) > hypot(anchors[$1].x - centre.x, anchors[$1].y - centre.y) }
        var placed: [CGRect] = []
        for i in order {
            let p = anchors[i], w = sizes[i].width, h = sizes[i].height
            let spots = [
                CGPoint(x: p.x - 6 - w, y: p.y - h / 2),
                CGPoint(x: p.x - 6 - w, y: p.y + 2),
                CGPoint(x: p.x - 6 - w, y: p.y - h - 2),
                CGPoint(x: p.x + 22, y: p.y - h / 2),
                CGPoint(x: p.x + 2, y: p.y + 4),
                CGPoint(x: p.x - w / 2, y: p.y + 6),
                CGPoint(x: p.x + 22, y: p.y - h - 6),
                CGPoint(x: p.x - w / 2, y: p.y - h - 20),
            ]
            var best = CGRect.zero, bestScore = CGFloat.infinity
            for (k, spot) in spots.enumerated() {
                let x = min(max(spot.x, 0), max(0, box.width - w))
                let y = min(max(spot.y, 0), max(0, box.height - h))
                let r = CGRect(x: x, y: y, width: w, height: h)
                var score = CGFloat(k) * 4 + (abs(x - spot.x) + abs(y - spot.y)) * 2
                score += placed.reduce(0) { $0 + overlap(r, $1) * 3 }
                score += obstacles.reduce(0) { $0 + overlap(r, $1) }
                if score < bestScore { bestScore = score; best = r }
            }
            out[i] = best
            placed.append(best)
        }
        return out
    }

    private static func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let i = a.intersection(b)
        return i.isNull ? 0 : i.width * i.height
    }
}

// MARK: - Hit streak and hitless

/// The league's longest hitting runs set against its longest hitless runs,
/// two columns split by a rule. Every name opens its card.
struct HitStreakColumns: View {
    let hitting: [StreakRow]
    let hitless: [StreakRow]
    let onPlayer: (_ name: String, _ league: String) -> Void

    var body: some View {
        if !hitting.isEmpty, !hitless.isEmpty {
            SplitColumns(lead: 0.45, gap: 8) {
                column(hitting, good: true)
                Rectangle().fill(LabInk.hair).frame(width: 1)
                column(hitless, good: false)
            }
        } else if !hitting.isEmpty {
            column(hitting, good: true)
        } else if !hitless.isEmpty {
            column(hitless, good: false)
        }
    }

    private func column(_ rows: [StreakRow], good: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Image(systemName: good ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(good ? GaryColors.win : GaryColors.loss)
                Text(good ? "HIT STREAK" : "HITLESS").font(GaryFonts.kicker(9, .semibold)).tracking(1.3).foregroundStyle(LabInk.dim)
            }
            .frame(height: 10)
            .padding(.bottom, 6)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                if i > 0 { LabHairline() }
                row(r, good: good)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func row(_ r: StreakRow, good: Bool) -> some View {
        let name = r.subject ?? ""
        let n = r.length ?? 0
        let tint = good ? GaryColors.win : GaryColors.loss
        Button { if let lg = r.league, !name.isEmpty { onPlayer(name, lg) } } label: {
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name).font(GaryFonts.ui(14, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    Text(good ? "\(n)" : "0-FOR-\(n)").font(GaryFonts.display(good ? 24 : 20.5))
                        .foregroundStyle(tint).monospacedDigit().fixedSize()
                }
                if let next = r.next_game, !next.isEmpty {
                    Text(LabFormat.keepTimeTogether(next)).font(GaryFonts.ui(10)).foregroundStyle(LabInk.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(good ? "\(name), hit in \(n) straight" : "\(name), 0 for \(n)")
    }
}

/// Two columns and the rule between them: the first takes `lead` of the
/// width, the rule runs the full height of the taller column.
struct SplitColumns: Layout {
    var lead: CGFloat = 0.45
    var gap: CGFloat = 8

    private func widths(_ total: CGFloat) -> (CGFloat, CGFloat) {
        let room = max(0, total - gap * 2 - 1)
        let left = (room * lead).rounded()
        return (left, room - left)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? 358
        guard subviews.count == 3 else { return CGSize(width: w, height: 0) }
        let (l, r) = widths(w)
        let h = max(subviews[0].sizeThatFits(ProposedViewSize(width: l, height: nil)).height,
                    subviews[2].sizeThatFits(ProposedViewSize(width: r, height: nil)).height)
        return CGSize(width: w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 3 else { return }
        let (l, r) = widths(bounds.width)
        subviews[0].place(at: bounds.origin, proposal: ProposedViewSize(width: l, height: nil))
        subviews[1].place(at: CGPoint(x: bounds.minX + l + gap, y: bounds.minY), proposal: ProposedViewSize(width: 1, height: bounds.height))
        subviews[2].place(at: CGPoint(x: bounds.minX + l + gap * 2 + 1, y: bounds.minY), proposal: ProposedViewSize(width: r, height: nil))
    }
}

// MARK: - Win and loss streaks, as a market map

/// The clubs on a win or loss run as a market map: each club's share of the
/// map is the length of its run, green for winning, red for losing, the
/// color deeper the longer the run. Every club opens its team card.
struct StreakMarketMap: View {
    let rows: [StreakRow]
    let onTeam: (_ name: String, _ league: String) -> Void

    private var items: [StreakRow] {
        rows.filter { ($0.length ?? 0) > 0 && $0.subject != nil }.sorted { a, b in
            if (a.length ?? 0) != (b.length ?? 0) { return (a.length ?? 0) > (b.length ?? 0) }
            if (a.kind == "win") != (b.kind == "win") { return a.kind == "win" }
            return (a.subject ?? "") < (b.subject ?? "")
        }
    }

    var body: some View {
        let list = items
        if !list.isEmpty {
            let lengths = list.map { Double($0.length ?? 0) }
            let total = lengths.reduce(0, +)
            let least = lengths.last ?? 1, longest = lengths.first ?? 1
            // Tall enough that the shortest run's tile still holds its name.
            let height = min(300, max(110, CGFloat(list.count) * 34, CGFloat(3700 * total / (least * 357))))
            VStack(alignment: .leading, spacing: 2) {
                Text("W/L").font(GaryFonts.kicker(9, .bold)).tracking(1.4).foregroundStyle(GaryColors.silver)
                    .padding(.horizontal, 8)
                    .frame(maxWidth: .infinity, minHeight: 16, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 2, style: .continuous).fill(LabInk.plate))
                    .accessibilityAddTraits(.isHeader)
                GeometryReader { g in
                    let rects = Squarify.layout(lengths, in: CGRect(x: -1, y: -1, width: g.size.width + 2, height: g.size.height + 2))
                    ZStack(alignment: .topLeading) {
                        ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                            let rect = rects[i].insetBy(dx: 1, dy: 1)
                            let depth = longest > least ? 0.12 + 0.18 * (lengths[i] - least) / (longest - least) : 0.21
                            tile(r, size: rect.size, depth: depth)
                                .frame(width: rect.width, height: rect.height)
                                .position(x: rect.midX, y: rect.midY)
                        }
                    }
                }
                .frame(height: height)
            }
        }
    }

    private func tile(_ r: StreakRow, size: CGSize, depth: Double) -> some View {
        let won = r.kind == "win"
        let tint = won ? GaryColors.win : GaryColors.loss
        let n = r.length ?? 0
        let team = r.subject ?? ""
        let name = LabFormat.nickname(team)
        let figure = min(44, max(22, min(size.width, size.height) * 0.3)) / 1.08
        return Button { if let lg = r.league { onTeam(team, lg) } } label: {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 2, style: .continuous).fill(tint.opacity(depth))
                ViewThatFits(in: .horizontal) {
                    Text(name).font(GaryFonts.ui(13, .semibold)).fixedSize()
                    Text(name).font(GaryFonts.ui(11.5, .semibold)).fixedSize()
                    Text(name).font(GaryFonts.ui(10, .semibold)).fixedSize()
                    Text(name).font(GaryFonts.ui(10, .semibold)).fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(GaryColors.warmWhite)
                .frame(maxWidth: max(0, size.width - 16), alignment: .leading)
                .padding(.leading, 8).padding(.top, 7)
                Text("\(won ? "W" : "L")\(n)").font(GaryFonts.display(figure)).foregroundStyle(tint).monospacedDigit().fixedSize()
                    .padding(.trailing, 8).padding(.bottom, 6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(won ? "\(name), won \(n) straight" : "\(name), lost \(n) straight")
    }
}

/// A squarified treemap: rectangles whose areas follow `values` (largest
/// first), laid in rows that keep each rectangle as close to square as they can.
enum Squarify {
    static func layout(_ values: [Double], in rect: CGRect) -> [CGRect] {
        var out = Array(repeating: CGRect.zero, count: values.count)
        let total = values.reduce(0, +)
        guard total > 0, rect.width > 0, rect.height > 0 else { return out }
        let areas = values.map { $0 * Double(rect.width * rect.height) / total }
        var room = rect
        var i = 0
        while i < areas.count {
            let side = Double(min(room.width, room.height))
            var row = [i]
            var j = i + 1
            while j < areas.count, worst((row + [j]).map { areas[$0] }, side) <= worst(row.map { areas[$0] }, side) {
                row.append(j); j += 1
            }
            let rowArea = row.reduce(0) { $0 + areas[$1] }
            if room.width >= room.height {
                // A column down the left of what is left.
                let w = CGFloat(rowArea / Double(room.height))
                var y = room.minY
                for k in row {
                    let h = CGFloat(areas[k]) / max(w, 0.0001)
                    out[k] = CGRect(x: room.minX, y: y, width: w, height: h); y += h
                }
                room = CGRect(x: room.minX + w, y: room.minY, width: room.width - w, height: room.height)
            } else {
                // A row across the top of what is left.
                let h = CGFloat(rowArea / Double(room.width))
                var x = room.minX
                for k in row {
                    let w = CGFloat(areas[k]) / max(h, 0.0001)
                    out[k] = CGRect(x: x, y: room.minY, width: w, height: h); x += w
                }
                room = CGRect(x: room.minX, y: room.minY + h, width: room.width, height: room.height - h)
            }
            i = j
        }
        return out
    }

    /// The worst aspect ratio in a row laid along a side of this length.
    private static func worst(_ row: [Double], _ side: Double) -> Double {
        let sum = row.reduce(0, +)
        guard sum > 0, side > 0, let most = row.max(), let least = row.min(), least > 0 else { return .infinity }
        return max(side * side * most / (sum * sum), (sum * sum) / (side * side * least))
    }
}
