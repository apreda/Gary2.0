import SwiftUI

// The top of the Darts page (founder, Sep 23 2026, from the canvas mocks):
// the darts on a dartboard (mock 03), the player runs in two columns (mock
// 03: hitting against hitless; the NFL's touchdown runs beside its 100-yard
// runs), and the clubs on a win or loss run as a market map (mock 09) where
// the longer run takes the bigger share.

// MARK: - The dartboard

/// The category's darts on a board, spread over its face. Each dart wears a
/// tag with its name and price; the tag opens the player's card (a
/// first-inning dart, either club's).
struct Dartboard: View {
    let darts: [DartRow]
    /// The first time a fan opens today's home run board, the darts are
    /// thrown onto it one by one (founder, Sep 23 2026). This is the key that
    /// remembers the throw; nil for every other board, whose darts are just there.
    let throwOnce: String?
    let onPlayer: (DartRow) -> Void
    let onTeam: (_ name: String, _ league: String) -> Void
    @Environment(\.readingPageActive) private var activePage
    /// Darts still in the air.
    @State private var flying: Set<Int>
    @State private var thrown = false

    init(darts: [DartRow], throwOnce: String? = nil, onPlayer: @escaping (DartRow) -> Void, onTeam: @escaping (_ name: String, _ league: String) -> Void) {
        self.darts = darts
        self.throwOnce = throwOnce
        self.onPlayer = onPlayer
        self.onTeam = onTeam
        let due = throwOnce.map { !UserDefaults.standard.bool(forKey: $0) } ?? false
        _flying = State(initialValue: due && !UIAccessibility.isReduceMotionEnabled ? Set(darts.filter { !$0.isScratched }.map(\.id)) : [])
    }

    var body: some View {
        GeometryReader { g in
            let plan = DartboardPlan(darts: darts, side: g.size.width)
            ZStack(alignment: .topLeading) {
                Canvas { ctx, _ in plan.draw(&ctx) }
                    .accessibilityHidden(true)
                ForEach(plan.marks) { m in
                    let inAir = flying.contains(m.dart.id)
                    DartGlyph()
                        .opacity(m.dart.isScratched ? 0.34 : 1)
                        .frame(width: 20 * plan.s, height: 20 * plan.s)
                        // In the air: big (near the thrower), low and to the right, tilted.
                        .scaleEffect(inAir ? 2.8 : 1, anchor: DartGlyph.tipAnchor)
                        .rotationEffect(.degrees(inAir ? 16 : 0), anchor: DartGlyph.tipAnchor)
                        .offset(x: inAir ? 150 : 0, y: inAir ? 260 : 0)
                        .opacity(inAir ? 0 : 1)
                        .position(x: m.tip.x + 9 * plan.s, y: m.tip.y - 9 * plan.s)
                        .accessibilityHidden(true)
                }
                DartTagLayout(anchors: plan.marks.map(\.tip), obstacles: plan.obstacles) {
                    ForEach(plan.marks) { m in tag(m.dart).opacity(flying.contains(m.dart.id) ? 0 : 1) }
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .onAppear(perform: throwIfDue)
        .onChange(of: activePage) { if $0 { throwIfDue() } }
    }

    /// One dart at a time, in first-pitch order, each landing with a thunk.
    private func throwIfDue() {
        guard !flying.isEmpty, !thrown, activePage, let key = throwOnce else { return }
        thrown = true
        UserDefaults.standard.set(true, forKey: key)
        let order = darts.filter { flying.contains($0.id) }.sorted {
            (LabFormat.parseISO($0.commence_time) ?? .distantFuture) < (LabFormat.parseISO($1.commence_time) ?? .distantFuture)
        }
        for (n, dart) in order.enumerated() {
            let start = 0.5 + Double(n) * 0.36
            DispatchQueue.main.asyncAfter(deadline: .now() + start) {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.58)) { _ = flying.remove(dart.id) }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + start + 0.2) {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
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
/// Before the day's darts are thrown (founder, Sep 24 2026: "a very subtle
/// 'Coming soon'... just a glossy view over the dartboard"): a pane of frosted
/// glass the size of the board, a soft sheen across its top, and the words.
struct DartboardGlass: View {
    var body: some View {
        GeometryReader { g in
            // The board's edge is 172 of the plan's 358 across.
            let d = g.size.width * 344 / 358
            ZStack {
                Circle().fill(.ultraThinMaterial).opacity(0.5)
                Circle().fill(LinearGradient(stops: [
                    .init(color: .white.opacity(0.11), location: 0),
                    .init(color: .white.opacity(0.035), location: 0.36),
                    .init(color: .clear, location: 0.56),
                ], startPoint: .topLeading, endPoint: .bottomTrailing))
                Circle().strokeBorder(LinearGradient(colors: [.white.opacity(0.2), .white.opacity(0.03)],
                                                     startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
                Text("Coming soon")
                    .font(GaryFonts.ui(15, .semibold))
                    .foregroundStyle(GaryColors.warmWhite.opacity(0.78))
                    .shadow(color: .black.opacity(0.5), radius: 6)
            }
            .frame(width: d, height: d)
            .position(x: g.size.width / 2, y: g.size.height / 2)
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Darts coming soon")
    }
}

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
        // See-through, so the board runs under it; dark enough to read.
        .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(LabInk.plateDeep.opacity(0.66)))
        .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous)
            .stroke(dart.isScratched ? GaryColors.warmWhite.opacity(0.1) : GaryColors.gold.opacity(0.32), lineWidth: 1))
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

/// Where everything on the board goes, in a 358-point plan scaled to the
/// width on screen: the bull at 179, the double ring's outer edge the edge of
/// the board at 172 (founder, Sep 24 2026: no number ring behind it, "the
/// two circles... are the edge of the dartboard"). The darts sit on set spots
/// spread over the face ("put the darts on the board in a spacious way. They
/// don't need to equate to the odds or the time of the game"): the tips
/// zigzag down the board so each tag has its own band to the dart's left.
struct DartboardPlan {
    struct Mark: Identifiable {
        let dart: DartRow
        let tip: CGPoint
        var id: Int { dart.id }
    }

    let side: CGFloat
    let s: CGFloat
    let c: CGPoint
    private(set) var marks: [Mark] = []

    /// The board's radii: the bullseye, the outer bull, the treble ring, the double ring.
    static let bull: CGFloat = 11.5, outerBull: CGFloat = 26
    static let treble: (CGFloat, CGFloat) = (98, 110), double: (CGFloat, CGFloat) = (160, 172)

    /// The tips for one to five darts. Each tag hangs to its dart's left in
    /// its own band, so none touch and all stay on the board.
    private static let spots: [[CGPoint]] = [
        [],
        [CGPoint(x: 226, y: 172)],
        [CGPoint(x: 236, y: 124), CGPoint(x: 186, y: 234)],
        [CGPoint(x: 240, y: 98), CGPoint(x: 186, y: 182), CGPoint(x: 272, y: 262)],
        [CGPoint(x: 242, y: 88), CGPoint(x: 180, y: 150), CGPoint(x: 288, y: 210), CGPoint(x: 210, y: 276)],
        [CGPoint(x: 244, y: 76), CGPoint(x: 178, y: 130), CGPoint(x: 290, y: 184), CGPoint(x: 194, y: 238), CGPoint(x: 272, y: 296)],
    ]

    init(darts: [DartRow], side: CGFloat) {
        self.side = side
        s = side / 358
        c = CGPoint(x: side / 2, y: side / 2)
        let n = darts.count
        let tips: [CGPoint]
        if n < Self.spots.count {
            tips = Self.spots[n]
        } else {
            // More than five: evenly round the board, in and out in turn.
            tips = (0..<n).map { i in
                let a = (Double(i) / Double(n) * 360 + 20) * .pi / 180
                let r: CGFloat = i % 2 == 0 ? 128 : 72
                return CGPoint(x: 179 + r * CGFloat(sin(a)), y: 179 - r * CGFloat(cos(a)))
            }
        }
        let unit = s
        marks = darts.enumerated().map { i, d in
            Mark(dart: d, tip: CGPoint(x: tips[i].x * unit, y: tips[i].y * unit))
        }
    }

    /// Places a tag should not cover: the darts.
    var obstacles: [CGRect] {
        marks.map { CGRect(x: $0.tip.x - 2, y: $0.tip.y - 19 * s, width: 21 * s, height: 21 * s) }
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

    /// The board's dark wedges (founder, Sep 24 2026: "It's not really the
    /// black and gray") with its colors chosen again ("those red and
    /// green/gold colors just don't look good... add in a white here, or
    /// something lighter. We don't have to use gold"): the treble and double
    /// rings in crimson and warm ivory, solid rather than washed over the
    /// black, so they read clean; ivory wires and edge; an ivory outer bull
    /// and a crimson bullseye. The gold stays on the tags.
    func draw(_ ctx: inout GraphicsContext) {
        let crimson = Color(hex: "#9E2B28")
        let ivory = Color(hex: "#C8BFAE")
        let wire = GaryColors.warmWhite.opacity(0.2)
        let edge = Self.double.1

        // The board sits off the page on a soft shadow.
        ctx.drawLayer { layer in
            layer.addFilter(.shadow(color: .black.opacity(0.5), radius: 14 * s, x: 0, y: 6 * s))
            layer.fill(circle(edge), with: .color(Color(hex: "#090808")))
        }

        // Twenty wedges in a real board's turn, warm dark against black; a
        // charcoal wedge takes crimson on its rings, a black wedge ivory.
        for i in 0..<20 {
            let a0 = -9 + 18 * Double(i), a1 = a0 + 18
            ctx.fill(segment(Self.outerBull, edge, a0, a1), with: .color(Color(hex: i % 2 == 0 ? "#1F1B16" : "#0A0908")))
            let ring = i % 2 == 0 ? crimson : ivory
            ctx.fill(segment(Self.treble.0, Self.treble.1, a0, a1), with: .color(ring))
            ctx.fill(segment(Self.double.0, Self.double.1, a0, a1), with: .color(ring))
        }
        for i in 0..<20 {
            let a = -9 + 18 * Double(i)
            ctx.stroke(line(point(Self.outerBull, a), point(edge, a)), with: .color(wire), lineWidth: 0.6)
        }
        for r in [Self.outerBull, Self.treble.0, Self.treble.1, Self.double.0] {
            ctx.stroke(circle(r), with: .color(wire), lineWidth: 0.7)
        }
        // The bull: an ivory outer bull and a crimson bullseye.
        ctx.fill(circle(Self.outerBull), with: .color(ivory))
        ctx.fill(circle(Self.bull), with: .color(crimson))
        ctx.stroke(circle(Self.bull), with: .color(GaryColors.warmWhite.opacity(0.45)), lineWidth: 1)

        // The edge.
        ctx.stroke(circle(edge - 0.5), with: .color(GaryColors.warmWhite.opacity(0.32)), lineWidth: 1)
    }
}

/// One dart, tip at the bottom left, flights up and to the right, drawn in a
/// 20-point box (the mock's size) and scaled with the board.
struct DartGlyph: View {
    /// Where the tip sits in the box: the point a thrown dart lands on.
    static let tipAnchor = UnitPoint(x: 0.05, y: 0.95)

    var body: some View {
        Canvas { ctx, size in
            ctx.scaleBy(x: size.width / 20, y: size.height / 20)
            ctx.translateBy(x: 1, y: 19)
            let gold = GaryColors.gold, pale = Color(hex: "#F4E4BA")
            func tri(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint) -> Path { var p = Path(); p.move(to: a); p.addLine(to: b); p.addLine(to: c); p.closeSubpath(); return p }
            func seg(_ a: CGPoint, _ b: CGPoint) -> Path { var p = Path(); p.move(to: a); p.addLine(to: b); return p }
            ctx.fill(tri(CGPoint(x: 11.2, y: -11.2), CGPoint(x: 16.6, y: -11.8), CGPoint(x: 14.6, y: -14.6)), with: .color(gold))
            ctx.fill(tri(CGPoint(x: 11.2, y: -11.2), CGPoint(x: 11.8, y: -16.6), CGPoint(x: 14.6, y: -14.6)), with: .color(pale))
            ctx.stroke(seg(CGPoint(x: 7.6, y: -7.6), CGPoint(x: 14.2, y: -14.2)), with: .color(gold), style: StrokeStyle(lineWidth: 1.1, lineCap: .round))
            ctx.stroke(seg(CGPoint(x: 3.4, y: -3.4), CGPoint(x: 7.8, y: -7.8)), with: .color(gold), style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
            ctx.fill(tri(.zero, CGPoint(x: 4.4, y: -2), CGPoint(x: 2, y: -4.4)), with: .color(pale))
        }
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
                CGPoint(x: p.x - 6 - w, y: p.y + h / 2 + 4),
                CGPoint(x: p.x - 6 - w, y: p.y - h * 1.5 - 4),
                CGPoint(x: p.x + 4, y: p.y + h / 2 + 8),
                CGPoint(x: p.x - w / 2, y: p.y + h / 2 + 10),
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

// MARK: - Player streaks, two columns

/// One column of player runs: its title, which way it points, how a run's
/// length reads.
struct StreakColumnSpec {
    let title: String
    let kinds: Set<String>
    let good: Bool

    /// Per league, the two columns (mock 03): MLB sets hitting against
    /// hitless; the NFL sets touchdown runs beside 100-yard runs.
    static func pair(for league: String) -> (StreakColumnSpec, StreakColumnSpec) {
        league == "NFL"
            ? (StreakColumnSpec(title: "TD STREAK", kinds: ["td"], good: true),
               StreakColumnSpec(title: "100 YARDS", kinds: ["rec100", "rush100"], good: true))
            : (StreakColumnSpec(title: "HIT STREAK", kinds: ["hit"], good: true),
               StreakColumnSpec(title: "HITLESS", kinds: ["hitless"], good: false))
    }
}

/// The league's longest player runs in two columns split by a rule. The
/// window is five rows tall (founder, Sep 23 2026: "still 5 and 5... keep the
/// same shape"); longer lists scroll inside it while the headers and the page
/// stay still. Every name opens its card.
struct PlayerStreakColumns: View {
    let left: (spec: StreakColumnSpec, rows: [StreakRow])
    let right: (spec: StreakColumnSpec, rows: [StreakRow])
    let onPlayer: (_ name: String, _ league: String) -> Void

    private static let window = 5
    private var both: Bool { !left.rows.isEmpty && !right.rows.isEmpty }
    private var lead: CGFloat { right.spec.good ? 0.5 : 0.45 }

    var body: some View {
        if both {
            VStack(spacing: 0) {
                SplitColumns(lead: lead, gap: 8) {
                    header(left.spec)
                    Rectangle().fill(LabInk.hair).frame(width: 1)
                    header(right.spec)
                }
                scrolling(pairs(Self.window, rule: false), pairs(nil, rule: true))
            }
        } else if let only = [left, right].first(where: { !$0.rows.isEmpty }) {
            VStack(alignment: .leading, spacing: 0) {
                header(only.spec)
                scrolling(rows(Array(only.rows.prefix(Self.window)), good: only.spec.good),
                          rows(only.rows, good: only.spec.good))
            }
        }
    }

    /// The first five rows set the window's height (drawn invisibly); the whole
    /// list scrolls inside it.
    private func scrolling<Window: View, Content: View>(_ window: Window, _ content: Content) -> some View {
        window
            .hidden()
            .accessibilityHidden(true)
            .overlay(alignment: .top) {
                ScrollView(.vertical, showsIndicators: false) { content }
                    .bounceOnlyWhenScrollable()
            }
    }

    private func header(_ spec: StreakColumnSpec) -> some View {
        HStack(spacing: 7) {
            Image(systemName: spec.good ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(spec.good ? GaryColors.win : GaryColors.loss)
            Text(spec.title).font(GaryFonts.kicker(9, .semibold)).tracking(1.3).foregroundStyle(LabInk.dim)
        }
        .frame(height: 10)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    /// The two columns row by row (founder, Sep 24 2026: "they should all be
    /// perfectly in line"): each pair of rows takes the taller one's height,
    /// so the lines, names and numbers sit level across the rule.
    private func pairs(_ limit: Int?, rule: Bool) -> some View {
        let count = max(left.rows.count, right.rows.count)
        let shown = limit.map { min($0, count) } ?? count
        return VStack(spacing: 0) {
            ForEach(0..<shown, id: \.self) { i in
                SplitColumns(lead: lead, gap: 8) {
                    cell(left.rows, i, good: left.spec.good)
                    Rectangle().fill(rule ? LabInk.hair : .clear).frame(width: 1)
                    cell(right.rows, i, good: right.spec.good)
                }
            }
        }
    }

    private func cell(_ list: [StreakRow], _ i: Int, good: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if i < list.count {
                if i > 0 { LabHairline() }
                row(list[i], good: good)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func rows(_ list: [StreakRow], good: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                if i > 0 { LabHairline() }
                row(r, good: good)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    @ViewBuilder private func row(_ r: StreakRow, good: Bool) -> some View {
        let name = r.subject ?? ""
        let n = r.length ?? 0
        let tint = good ? GaryColors.win : GaryColors.loss
        let hitless = r.kind == "hitless"
        let note = [r.kind == "rec100" ? "Receiving" : r.kind == "rush100" ? "Rushing" : nil,
                    r.next_game.flatMap { $0.isEmpty ? nil : LabFormat.keepTimeTogether($0) }]
            .compactMap { $0 }.joined(separator: " · ")
        Button { if let lg = r.league, !name.isEmpty { onPlayer(name, lg) } } label: {
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name.replacingOccurrences(of: "-", with: "\u{2011}")).font(GaryFonts.ui(14, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    Text(hitless ? "0-FOR-\(n)" : "\(n)").font(GaryFonts.display(hitless ? 20.5 : 24))
                        .foregroundStyle(tint).monospacedDigit().fixedSize()
                }
                if !note.isEmpty {
                    Text(note).font(GaryFonts.ui(10)).foregroundStyle(LabInk.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility(r, name: name, n: n))
    }

    private func accessibility(_ r: StreakRow, name: String, n: Int) -> String {
        switch r.kind {
        case "hitless": return "\(name), 0 for \(n)"
        case "hit": return "\(name), hit in \(n) straight"
        case "td": return "\(name), a touchdown in \(n) straight"
        case "rec100": return "\(name), 100 receiving yards in \(n) straight"
        case "rush100": return "\(name), 100 rushing yards in \(n) straight"
        default: return "\(name), \(n) straight"
        }
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
            // A long run takes a bigger share than its count alone (founder,
            // Sep 24 2026: the MLB map, all twos and threes, read as a grid;
            // it should look like the NFL's), so the tiles step up in size.
            let weights = lengths.map { pow($0, 1.4) }
            let total = weights.reduce(0, +)
            let least = lengths.last ?? 1, longest = lengths.first ?? 1
            // Tall enough that the smallest tile still holds its name.
            let height = min(440, max(120, CGFloat(5200 * total / ((weights.last ?? 1) * 357))))
            VStack(alignment: .leading, spacing: 6) {
                // A plain label like the columns' above it, no band (founder,
                // Sep 23 2026: no "market map inside of a rectangle container").
                HStack(spacing: 7) {
                    Image(systemName: "arrowtriangle.up.fill").font(.system(size: 8, weight: .bold)).foregroundStyle(GaryColors.win)
                    Image(systemName: "arrowtriangle.down.fill").font(.system(size: 8, weight: .bold)).foregroundStyle(GaryColors.loss)
                    Text("W/L").font(GaryFonts.kicker(9, .semibold)).tracking(1.3).foregroundStyle(LabInk.dim)
                }
                .frame(height: 10)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Win and loss streaks")
                .accessibilityAddTraits(.isHeader)
                GeometryReader { g in
                    // A short, wide map (a small slate) lays its tiles out
                    // landscape so it still reads as a mosaic, not a row of columns.
                    let stretch = max(1, (g.size.width / max(g.size.height, 1)) / 1.35)
                    let rects = Squarify.layout(weights, in: CGRect(x: -1.5, y: -1.5, width: g.size.width + 3, height: g.size.height + 3), stretch: stretch)
                    let depths = lengths.map { longest > least ? 0.12 + 0.18 * ($0 - least) / (longest - least) : 0.21 }
                    ZStack(alignment: .topLeading) {
                        // The colour: each tile deepest at its number and fading
                        // toward its name; the map's outer edge dissolves into the
                        // page, so the mosaic has no hard frame.
                        ZStack(alignment: .topLeading) {
                            ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                                let rect = rects[i].insetBy(dx: 1.5, dy: 1.5)
                                let tint = r.kind == "win" ? GaryColors.win : GaryColors.loss
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(LinearGradient(colors: [tint.opacity(depths[i] * 0.35), tint.opacity(depths[i])],
                                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .frame(width: rect.width, height: rect.height)
                                    .position(x: rect.midX, y: rect.midY)
                            }
                        }
                        .mask(RoundedRectangle(cornerRadius: 22, style: .continuous).padding(5).blur(radius: 9))
                        .accessibilityHidden(true)
                        // The words and the taps, never faded.
                        ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                            let rect = rects[i].insetBy(dx: 1.5, dy: 1.5)
                            tile(r, size: rect.size)
                                .frame(width: rect.width, height: rect.height)
                                .position(x: rect.midX, y: rect.midY)
                        }
                    }
                }
                .frame(height: height)
            }
        }
    }

    private func tile(_ r: StreakRow, size: CGSize) -> some View {
        let won = r.kind == "win"
        let tint = won ? GaryColors.win : GaryColors.loss
        let n = r.length ?? 0
        let team = r.subject ?? ""
        let name = LabFormat.nickname(team)
        let figure = min(44, max(22, min(size.width, size.height) * 0.3)) / 1.08
        return Button { if let lg = r.league { onTeam(team, lg) } } label: {
            ZStack(alignment: .topLeading) {
                Color.clear
                ViewThatFits(in: .horizontal) {
                    Text(name).font(GaryFonts.ui(13, .semibold)).fixedSize()
                    Text(name).font(GaryFonts.ui(11.5, .semibold)).fixedSize()
                    Text(name).font(GaryFonts.ui(10, .semibold)).fixedSize()
                    // Never broken mid-word or cut ("National / s", "Buccan…"):
                    // a tile too small for the name wears the club's letters.
                    Text(teamAbbrevFromName(team, league: r.league).uppercased()).font(GaryFonts.ui(11.5, .bold)).fixedSize()
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
/// `stretch` above 1 aims for tiles that many times wider than tall.
enum Squarify {
    static func layout(_ values: [Double], in rect: CGRect, stretch: CGFloat) -> [CGRect] {
        let k = max(1, stretch)
        return layout(values, in: CGRect(x: 0, y: 0, width: rect.width / k, height: rect.height)).map {
            CGRect(x: rect.minX + $0.minX * k, y: rect.minY + $0.minY, width: $0.width * k, height: $0.height)
        }
    }

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

extension View {
    /// A scroll view that only bounces when its content is longer than it.
    @ViewBuilder func bounceOnlyWhenScrollable() -> some View {
        if #available(iOS 16.4, *) { self.scrollBounceBehavior(.basedOnSize) } else { self }
    }
}
