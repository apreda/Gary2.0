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
    /// The Darts tab is on screen. Passed in, not read from the environment:
    /// inside the page's lazy stack the environment value never turned true
    /// (Sep 25 2026), so the board waited, blank, for a throw that never came.
    let activePage: Bool
    /// Darts still in the air.
    @State private var flying: Set<Int>
    @State private var thrown = false

    init(darts: [DartRow], throwOnce: String? = nil, activePage: Bool = true, onPlayer: @escaping (DartRow) -> Void, onTeam: @escaping (_ name: String, _ league: String) -> Void) {
        self.darts = darts
        self.throwOnce = throwOnce
        self.activePage = activePage
        self.onPlayer = onPlayer
        self.onTeam = onTeam
        let due = throwOnce.map { !UserDefaults.standard.bool(forKey: $0) } ?? false
        _flying = State(initialValue: due && !UIAccessibility.isReduceMotionEnabled ? Set(darts.filter { !$0.isScratched }.map(\.id)) : [])
    }

    var body: some View {
        GeometryReader { g in
            let plan = DartboardPlan(darts: darts, side: g.size.width)
            ZStack(alignment: .topLeading) {
                // The board a step back from full strength (founder, Sep 24
                // 2026: "reduce the opacity on the dart board by 10%", then
                // "another 5%... it'll be absolutely perfect").
                Canvas { ctx, _ in plan.draw(&ctx) }
                    .opacity(0.85)
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
        // Re-checked with this render's values whenever the tab or the darts
        // change (Sep 25 2026: the old onChange read the page as still hidden
        // after the fan opened it, so the board sat blank and never threw).
        .task(id: ThrowCheck(active: activePage, ids: liveIDs)) { throwIfDue() }
    }

    private struct ThrowCheck: Equatable { let active: Bool; let ids: [Int] }
    private var liveIDs: [Int] { darts.filter { !$0.isScratched }.map(\.id) }
    /// Today's throw hasn't been seen yet.
    private var dueToday: Bool { throwOnce.map { !UserDefaults.standard.bool(forKey: $0) } ?? false }

    /// The first time today's home run board is on screen, its darts fly in one
    /// at a time in first-pitch order, each landing with a thunk. Before that
    /// they wait in the air; after it, and on every other board, they are there.
    private func throwIfDue() {
        guard let key = throwOnce else { return }
        if thrown { flying.formIntersection(liveIDs); return }
        guard dueToday, !UIAccessibility.isReduceMotionEnabled, !liveIDs.isEmpty else { flying = []; return }
        flying = Set(liveIDs)
        guard activePage else { return }
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
    /// YRFI or NRFI on a first-inning dart (its tab's own words); the line on a lined dart.
    private var side: String? {
        if dart.isGame { return (dart.bet ?? "over") == "under" ? "NRFI" : "YRFI" }
        return dart.betWords
    }
    /// Over or under on a dart with a line (H+R+RBI, total bases, yards, passing TDs, interceptions).
    private var direction: LabDirection? {
        guard !dart.isGame, dart.lineWords != nil else { return nil }
        return (dart.bet ?? "over").lowercased() == "under" ? .under : .over
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name).font(GaryFonts.ui(13, .semibold))
                .foregroundStyle(dart.isScratched ? LabInk.dim : GaryColors.warmWhite)
                .fixedSize()
            if dart.isScratched {
                Text(dart.scratchWord.capitalized).font(GaryFonts.ui(10, .medium)).foregroundStyle(LabInk.dimmer)
            } else {
                // The line and the price in proportion (founder, Sep 24 2026:
                // the price "way bigger than the over/under"), an over or
                // under wearing the app's green or red arrow.
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    if let direction {
                        Image(systemName: direction == .over ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(direction == .over ? GaryColors.win : GaryColors.loss)
                            .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                    }
                    if let side { Text(side).font(GaryFonts.display(15)).tracking(0.5).foregroundStyle(GaryColors.silver) }
                    Text(LabFormat.price(dart.odds)).font(GaryFonts.display(16.5)).foregroundStyle(GaryColors.gold).monospacedDigit()
                }
                .fixedSize()
            }
        }
        .padding(.leading, 8).padding(.trailing, 9).padding(.vertical, 4)
        .frame(minHeight: 40)
        // The pick is what the eye finds on the board: a solid dark card, a
        // gold edge, lifted off the board on a shadow.
        .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Color(hex: "#12100D").opacity(0.94))
            .shadow(color: .black.opacity(0.6), radius: 6, y: 3))
        .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous)
            .stroke(dart.isScratched ? GaryColors.warmWhite.opacity(0.1) : GaryColors.gold.opacity(0.62), lineWidth: 1))
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

    /// The tips for one to five darts, out over the whole board (founder,
    /// Sep 24 2026: "a lot of the darts are landing inside that first circle,
    /// where you can use the whole dartboard"). They land right and left in
    /// turn, near the rim, and each tag hangs inward in its own band, so none
    /// touch and all stay on the board.
    private static let spots: [[CGPoint]] = [
        [],
        [CGPoint(x: 272, y: 140)],
        [CGPoint(x: 290, y: 112), CGPoint(x: 74, y: 246)],
        [CGPoint(x: 292, y: 96), CGPoint(x: 70, y: 182), CGPoint(x: 276, y: 276)],
        [CGPoint(x: 290, y: 84), CGPoint(x: 70, y: 150), CGPoint(x: 300, y: 214), CGPoint(x: 104, y: 284)],
        [CGPoint(x: 290, y: 70), CGPoint(x: 70, y: 130), CGPoint(x: 302, y: 190), CGPoint(x: 64, y: 250), CGPoint(x: 264, y: 305)],
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

    func circle(_ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: c.x - r * s, y: c.y - r * s, width: 2 * r * s, height: 2 * r * s))
    }

    /// A ring segment between two radii and two angles.
    func segment(_ r0: CGFloat, _ r1: CGFloat, _ a0: Double, _ a1: Double) -> Path {
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

    func line(_ a: CGPoint, _ b: CGPoint) -> Path {
        var p = Path(); p.move(to: a); p.addLine(to: b); return p
    }

    /// The board is the backdrop; the picks on it are what the eye finds
    /// (founder, Sep 24 2026: "now our picks are secondary"). The dark wedges
    /// stay; the treble and double rings are gold and a dark gray in turn
    /// ("lets try grey and gold", then "make the grey darker than it was"),
    /// held back so the gold on the tags still leads. Faint wires, a small
    /// bull: a gray outer bull, a gold eye.
    func draw(_ ctx: inout GraphicsContext) {
        #if DEBUG
        if let style = DartboardMock.style, drawMock(&ctx, style: style) { return }
        #endif
        let ringGold = Color(hex: "#7D6420")
        let ringGray = Color(hex: "#34312C")
        let wire = GaryColors.warmWhite.opacity(0.1)
        let edge = Self.double.1

        // The board sits off the page on a soft shadow.
        ctx.drawLayer { layer in
            layer.addFilter(.shadow(color: .black.opacity(0.5), radius: 14 * s, x: 0, y: 6 * s))
            layer.fill(circle(edge), with: .color(Color(hex: "#090808")))
        }

        // Twenty wedges in a real board's turn, warm dark against black; a
        // charcoal wedge takes gold on its rings, a black wedge gray.
        for i in 0..<20 {
            let a0 = -9 + 18 * Double(i), a1 = a0 + 18
            ctx.fill(segment(Self.outerBull, edge, a0, a1), with: .color(Color(hex: i % 2 == 0 ? "#1F1B16" : "#0A0908")))
            let ring = i % 2 == 0 ? ringGold : ringGray
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
        // The bull: a gray outer bull, a gold eye.
        ctx.fill(circle(Self.outerBull), with: .color(ringGray))
        ctx.fill(circle(Self.bull), with: .color(ringGold))
        ctx.stroke(circle(Self.bull), with: .color(wire), lineWidth: 0.7)

        // The edge.
        ctx.stroke(circle(edge - 0.5), with: .color(GaryColors.warmWhite.opacity(0.14)), lineWidth: 1)
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
        // NBA (Oct 19 2026): 20-point games in a row beside double-doubles in a row.
        if league == "NBA" {
            return (StreakColumnSpec(title: "20+ POINTS", kinds: ["pts20"], good: true),
                    StreakColumnSpec(title: "DOUBLE-DOUBLES", kinds: ["dd"], good: true))
        }
        return league == "NFL"
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
                SplitColumns(lead: lead, gap: 9) {
                    header(left.spec)
                    Color.clear.frame(width: 1)
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
                .foregroundStyle(spec.good ? DartsLook.greenFigure : GaryColors.loss)
            Text(spec.title).font(GaryFonts.display(13)).tracking(1.6).foregroundStyle(spec.good ? DartsLook.green : DartsLook.redFigure)
        }
        .frame(height: 30)
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
                SplitColumns(lead: lead, gap: 9) {
                    cell(left.rows, i, good: left.spec.good)
                    Color.clear.frame(width: 1)
                    cell(right.rows, i, good: right.spec.good)
                }
            }
        }
    }

    private func cell(_ list: [StreakRow], _ i: Int, good: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if i < list.count {
                LabHairline()
                row(list[i], good: good)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func rows(_ list: [StreakRow], good: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(list.enumerated()), id: \.offset) { _, r in
                LabHairline()
                row(r, good: good)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    @ViewBuilder private func row(_ r: StreakRow, good: Bool) -> some View {
        let name = r.subject ?? ""
        let n = r.length ?? 0
        let tint = good ? DartsLook.greenFigure : DartsLook.redFigure
        let hitless = r.kind == "hitless"
        let note = [r.kind == "rec100" ? "Receiving" : r.kind == "rush100" ? "Rushing" : nil,
                    r.next_game.flatMap { $0.isEmpty ? nil : LabFormat.keepTimeTogether($0) }]
            .compactMap { $0 }.joined(separator: " · ")
        Button { if let lg = r.league, !name.isEmpty { onPlayer(name, lg) } } label: {
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name.replacingOccurrences(of: "-", with: "\u{2011}")).font(GaryFonts.ui(13.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    Text(hitless ? "0-FOR-\(n)" : "\(n)").font(GaryFonts.display(hitless ? 21 : 26))
                        .foregroundStyle(tint).monospacedDigit().fixedSize()
                }
                if !note.isEmpty {
                    Text(note).font(GaryFonts.ui(10.5)).foregroundStyle(LabInk.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
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
            // Tall enough that the smallest tile still holds its name.
            // Up to 520 (Nov 10 2026): at 440 a 20-club night's smallest tiles were 41pt tall, too short for
            // a name over its figure.
            let height = min(520, max(120, CGFloat(5200 * total / ((weights.last ?? 1) * 357))))
            VStack(alignment: .leading, spacing: 6) {
                // A plain label like the columns' above it, no band (founder,
                // Sep 23 2026: no "market map inside of a rectangle container").
                Text("W / L RUNS").font(GaryFonts.display(14.8)).tracking(1.8).foregroundStyle(GaryColors.gold)
                    .frame(height: 26)
                    .padding(.bottom, 4)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Win and loss streaks")
                .accessibilityAddTraits(.isHeader)
                GeometryReader { g in
                    // A short, wide map (a small slate) lays its tiles out
                    // landscape so it still reads as a mosaic, not a row of columns.
                    let stretch = max(1, (g.size.width / max(g.size.height, 1)) / 1.35)
                    let rects = Squarify.layout(weights, in: CGRect(x: -3, y: -3, width: g.size.width + 6, height: g.size.height + 6), stretch: stretch)
                            ZStack(alignment: .topLeading) {
                        // Each run a lit tile (mock B): its color deepening with
                        // the run, a hairline of light on its top edge.
                        ZStack(alignment: .topLeading) {
                            ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                                let rect = rects[i].insetBy(dx: 3, dy: 3)
                                let won = r.kind == "win"
                                let n = Double(r.length ?? 0)
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(LinearGradient(colors: won
                                                         ? [GaryColors.win.opacity(min(0.45, 0.16 + 0.05 * n)), Color(red: 18 / 255, green: 40 / 255, blue: 24 / 255).opacity(0.9)]
                                                         : [GaryColors.loss.opacity(min(0.45, 0.14 + 0.05 * n)), Color(red: 48 / 255, green: 16 / 255, blue: 16 / 255).opacity(0.9)],
                                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(LinearGradient(colors: [.white.opacity(0.07), .clear], startPoint: .top, endPoint: .center), lineWidth: 1))
                                    .frame(width: rect.width, height: rect.height)
                                    .position(x: rect.midX, y: rect.midY)
                            }
                        }
                        .accessibilityHidden(true)
                        // The words and the taps, never faded.
                        ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                            let rect = rects[i].insetBy(dx: 3, dy: 3)
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
        let tint = won ? DartsLook.green : DartsLook.redFigure
        let n = r.length ?? 0
        let team = r.subject ?? ""
        let name = LabFormat.nickname(team)
        let ideal = min(44, max(22, min(size.width, size.height) * 0.3)) / 1.08
        // A short tile can't hold a name over a full-size figure: the two ran into each other ("Nets" under
        // "L2", Nov 10 2026). It tightens its margins and the figure takes what the name leaves.
        let nameLine: CGFloat = 13
        let tight = size.height < ideal + nameLine + 16
        let topPad: CGFloat = tight ? 5 : 7, bottomPad: CGFloat = tight ? 2 : 6
        // The name's caps end 14.5pt down; the figure's caps start 1.08 of its size above its bottom margin.
        // 5pt of air between them.
        let figure = tight ? max(12, min(ideal, (size.height - bottomPad - 19.5) / 1.08)) : ideal
        return Button { if let lg = r.league { onTeam(team, lg) } } label: {
            // A strip too short to stack a name over a figure sets them side by side (Nov 10 2026: "Trail
            // Blazers" ran into its "L2").
            Group {
            if size.height < 38 {
                HStack(alignment: .center, spacing: 6) {
                    ViewThatFits(in: .horizontal) {
                        Text(name).font(GaryFonts.ui(11.5, .semibold)).fixedSize()
                        Text(name).font(GaryFonts.ui(10, .semibold)).fixedSize()
                        Text(teamAbbrevFromName(team, league: r.league).uppercased()).font(GaryFonts.ui(11.5, .bold)).fixedSize()
                    }
                    .foregroundStyle(GaryColors.warmWhite)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(won ? "W" : "L")\(n)").font(GaryFonts.display(min(ideal, 16))).foregroundStyle(tint).monospacedDigit().fixedSize()
                }
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
            ZStack(alignment: .topLeading) {
                    Color.clear
                    ViewThatFits(in: .horizontal) {
                        if !tight { Text(name).font(GaryFonts.ui(13, .semibold)).fixedSize() }
                        Text(name).font(GaryFonts.ui(11.5, .semibold)).fixedSize()
                        Text(name).font(GaryFonts.ui(10, .semibold)).fixedSize()
                        // Never broken mid-word or cut ("National / s", "Buccan…"):
                        // a tile too small for the name wears the club's letters.
                        Text(teamAbbrevFromName(team, league: r.league).uppercased()).font(GaryFonts.ui(11.5, .bold)).fixedSize()
                    }
                    .foregroundStyle(GaryColors.warmWhite)
                    .frame(maxWidth: max(0, size.width - 16), alignment: .leading)
                    .padding(.leading, 8).padding(.top, topPad)
                    Text("\(won ? "W" : "L")\(n)").font(GaryFonts.display(figure)).foregroundStyle(tint).monospacedDigit().fixedSize()
                        .padding(.trailing, 8).padding(.bottom, bottomPad)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                }
            }
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

// MARK: - The dart wheel

/// The darts on the wall, as in mock 4 (founder, Oct 31 2026: "like 4 with the 1 2 3 4 5, not the focus on the
/// middle or the curve of the wheel rotation"): the board hangs on the left wall with a category's darts in it by
/// Gary's order, his #1 in the bull, and that category's rows run 1 to 5 down its right. The categories turn a
/// page at a time: a swipe brings the next one in whole, a hard flick goes through several, every category
/// follows the last in one endless loop, and the tab above follows. A row tapped opens its player. Once a dart is
/// graded its row shows a check or a cross and the player's final number, a miss dims, and a hit's dart wears a
/// green ring (mock 4.5).
struct DartWheel: View {
    struct Item {
        let kind: String
        let rank: Int
        let dart: DartRow
    }

    let items: [Item]
    @Binding var kind: String
    let throwOnce: String?
    let activePage: Bool
    let onPlayer: (DartRow) -> Void
    let onTeam: (_ name: String, _ league: String) -> Void

    /// The pages' place, read by the rows every frame (held in @State so the
    /// rest of the page does not redraw while it turns).
    @State private var wheel = WheelPosition()
    /// The category showing: a page on the endless loop, not into `pages`.
    @State private var selected: Int
    @State private var jump = WheelJump(index: 0, nonce: 0, animated: false)
    @State private var teamPick: DartRow?
    @State private var flying: Set<Int>
    @State private var thrown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let tick = UISelectionFeedbackGenerator()

    static let rowHeight: CGFloat = 72
    static let height: CGFloat = 406

    /// The categories in order, each its darts by Gary's rank.
    private let pages: [[Item]]

    init(items: [Item], kind: Binding<String>, throwOnce: String? = nil, activePage: Bool = true,
         onPlayer: @escaping (DartRow) -> Void, onTeam: @escaping (_ name: String, _ league: String) -> Void) {
        self.items = items
        _kind = kind
        self.throwOnce = throwOnce
        self.activePage = activePage
        self.onPlayer = onPlayer
        self.onTeam = onTeam
        var pages: [[Item]] = []
        for it in items {
            if pages.last?.first?.kind == it.kind { pages[pages.count - 1].append(it) } else { pages.append([it]) }
        }
        self.pages = pages
        let start = pages.firstIndex { $0.first?.kind == kind.wrappedValue } ?? 0
        let w = WheelPosition(); w.pos = Double(start)
        _wheel = State(initialValue: w)
        _selected = State(initialValue: start)
        _jump = State(initialValue: WheelJump(index: start, nonce: 0, animated: false))
        let due = throwOnce.map { !UserDefaults.standard.bool(forKey: $0) } ?? false
        let first = items.first { $0.kind == kind.wrappedValue }?.kind
        _flying = State(initialValue: due && !UIAccessibility.isReduceMotionEnabled
                        ? Set(items.filter { $0.kind == first && !$0.dart.isScratched }.map(\.dart.id)) : [])
    }

    private var count: Int { max(pages.count, 1) }
    private func page(_ i: Int) -> [Item] { pages.isEmpty ? [] : pages[((i % count) + count) % count] }
    private var current: [Item] { page(selected) }
    private var currentKind: String { current.first?.kind ?? kind }
    /// The rows start here, so five sit in the middle of the wall.
    private func top(_ h: CGFloat) -> CGFloat { (h - 5 * Self.rowHeight) / 2 }

    var body: some View {
        GeometryReader { g in
            // On the page (mocks 6 and 7): the board half off the left wall,
            // the rows at the right gutter.
            let k = g.size.width / 402
            let h = g.size.height
            let cx = 14 * k, cy = h / 2, r = 150 * k
            let colX = 172 * k
            let colW = g.size.width - colX - GaryLayout.gutter
            ZStack(alignment: .topLeading) {
                // The board, the shipping board's own drawing, half off the left wall.
                let side = r * 358 / 172
                Canvas { ctx, _ in DartboardPlan(darts: [], side: side).draw(&ctx) }
                    .frame(width: side, height: side)
                    .opacity(0.85)
                    .position(x: cx, y: cy)
                    .accessibilityHidden(true)
                // The lamp hangs a little right of the bull.
                Color.clear.frame(width: 2 * r, height: 2 * r)
                    .position(x: cx + 60 * k, y: cy)
                    .anchorPreference(key: StageLampAnchor.self, value: .bounds) { $0 }
                    .allowsHitTesting(false)

                darts(cx: cx, cy: cy, r: r, k: k)
                    .accessibilityHidden(true)

                WheelPages(wheel: wheel, pages: pages, rowHeight: Self.rowHeight, top: top(h), height: h, width: colW)
                    .frame(width: colW, height: h)
                    .offset(x: colX)
                    .allowsHitTesting(false)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(current.map(words).joined(separator: "; "))
                    .accessibilityHint(DartCategory.title(current.first?.dart.league ?? "", currentKind))
                    .accessibilityAdjustableAction { dir in
                        switch dir {
                        case .increment: go(to: selected + 1)
                        case .decrement: go(to: selected - 1)
                        default: break
                        }
                    }

                // The pages' hand: a scroll view with nothing in it, so a flick
                // carries on and slows the way every list on the phone does.
                DartWheelInput(unit: h, jump: jump,
                               onPos: { p in turned(to: p) },
                               onTap: { y in tapped(y: y, top: top(h)) })
                    .frame(width: colW + GaryLayout.gutter, height: h)
                    .offset(x: colX)
                    .accessibilityHidden(true)
            }
        }
        .frame(height: Self.height)
        .clipped()
        .onChange(of: kind) { newKind in
            // A tab tap turns to that category.
            guard currentKind != newKind, let start = pages.firstIndex(where: { $0.first?.kind == newKind }) else { return }
            let cycle = selected - (((selected % count) + count) % count)
            let target = [cycle - count + start, cycle + start, cycle + count + start].min { abs($0 - selected) < abs($1 - selected) } ?? start
            go(to: target)
        }
        .task(id: activePage) { throwIfDue() }
        .onAppear {
            tick.prepare()
            if currentKind != kind { kind = currentKind }
        }
        .confirmationDialog("", isPresented: Binding(get: { teamPick != nil }, set: { if !$0 { teamPick = nil } })) {
            if let d = teamPick, let teams = d.gameTeams {
                Button(teams.away) { onTeam(teams.away, d.league) }
                Button(teams.home) { onTeam(teams.home, d.league) }
            }
        }
    }

    // MARK: Turning

    private func turned(to p: Double) {
        wheel.pos = p
        let r = Int(p.rounded())
        guard r != selected else { return }
        selected = r
        tick.selectionChanged()
        if let k = page(r).first?.kind, k != kind { kind = k }
    }

    private func go(to index: Int) {
        jump = WheelJump(index: index, nonce: jump.nonce + 1, animated: !reduceMotion)
    }

    /// A tap on a row opens its player's card (either club's on a first-inning dart).
    private func tapped(y: CGFloat, top: CGFloat) {
        let row = Int(((y - top) / Self.rowHeight).rounded(.down))
        guard row >= 0, row < current.count else { return }
        open(current[row].dart)
    }

    private func open(_ d: DartRow) {
        if d.isGame { teamPick = d } else { onPlayer(d) }
    }

    // MARK: The darts on the board

    /// Where Gary's darts land by his order: #1 in the bull, then out ring
    /// by ring to the double (mock 4). A sixth or more spread round the
    /// right of the board.
    static func spot(_ n: Int) -> (frac: CGFloat, deg: Double) {
        let spots: [(CGFloat, Double)] = [(0.03, 45), (0.36, 40), (0.6, 120), (0.8, 62), (0.965, 150)]
        if n < spots.count { return spots[n] }
        let j = n - spots.count
        return (0.48 + 0.12 * CGFloat(j % 4), 95 + 23 * Double(j % 6))
    }

    @ViewBuilder private func darts(cx: CGFloat, cy: CGFloat, r: CGFloat, k: CGFloat) -> some View {
        let cat = current
        ZStack(alignment: .topLeading) {
            ForEach(Array(cat.enumerated()), id: \.element.dart.id) { n, it in
                let s = Self.spot(n)
                let a = s.deg * .pi / 180
                let tip = CGPoint(x: cx + s.frac * r * CGFloat(sin(a)), y: cy - s.frac * r * CGFloat(cos(a)))
                let g = 25 * k
                let inAir = flying.contains(it.dart.id)
                DartGlyph()
                    .frame(width: g, height: g)
                    .scaleEffect(inAir ? 2.8 : 1, anchor: DartGlyph.tipAnchor)
                    .rotationEffect(.degrees(inAir ? 16 : 0), anchor: DartGlyph.tipAnchor)
                    .offset(x: inAir ? 150 : 0, y: inAir ? 260 : 0)
                    .opacity(inAir ? 0 : (it.dart.graded == false ? 0.38 : 1))
                    .position(x: tip.x + 0.45 * g, y: tip.y - 0.45 * g)
                WheelBadge(rank: it.rank, graded: it.dart.graded, k: k)
                    .opacity(inAir ? 0 : 1)
                    .position(x: tip.x + g, y: tip.y - g)
            }
        }
        .id(currentKind)
        .transition(.opacity)
    }

    /// The first time today's first board is on screen its darts fly in one
    /// at a time, as on the old board (Sep 23 2026).
    private func throwIfDue() {
        guard let key = throwOnce, !thrown, activePage, !flying.isEmpty else { return }
        thrown = true
        UserDefaults.standard.set(true, forKey: key)
        let order = items.filter { flying.contains($0.dart.id) }.map(\.dart)
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

    private func words(_ it: Item) -> String {
        let d = it.dart
        let side = d.isGame ? ((d.bet ?? "over") == "under" ? "NRFI" : "YRFI") : d.betWords
        let price = d.isScratched ? d.scratchWord.lowercased() : [side, LabFormat.price(d.odds)].compactMap { $0 }.joined(separator: " ")
        let grade = d.graded.flatMap { hit in d.actualText.map { "\(hit ? "hit" : "missed"), finished with \($0)" } }
        return ["\(it.rank)", d.player, price, grade ?? d.gameLine].filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

extension DartCategory {
    /// A category's tab name.
    static func title(_ league: String, _ kind: String) -> String {
        order[league]?.first { $0.kind == kind }?.title ?? ""
    }
}

/// The pages' place: the category showing, with the fraction it has turned past it.
final class WheelPosition: ObservableObject {
    @Published var pos: Double = 0
}

/// A turn asked of the wheel from outside it (a tab, a tap, VoiceOver).
struct WheelJump: Equatable {
    let index: Int
    let nonce: Int
    let animated: Bool
}

/// The dart's number on its flights: gold, Gary's #1 brightest (mock 4); once graded, a hit's ring goes green
/// and a miss's goes faint (mock 4.5).
private struct WheelBadge: View {
    let rank: Int
    let graded: Bool?
    let k: CGFloat
    var body: some View {
        let d = 19 * k
        let ink: Color = graded == false ? GaryColors.warmWhite.opacity(0.5)
            : graded == true ? GaryColors.warmWhite : (rank == 1 ? GaryColors.gold : GaryColors.warmWhite)
        let ring: Color = graded == true ? GaryColors.win : graded == false ? GaryColors.warmWhite.opacity(0.22)
            : GaryColors.gold.opacity(rank == 1 ? 1 : 0.6)
        Text("\(rank)")
            .font(GaryFonts.display(13.5))
            .foregroundStyle(ink)
            .frame(width: d, height: d)
            .background(Circle().fill(graded == true ? Color(hex: "#0F1A11") : Color(hex: "#12100D")))
            .overlay(Circle().stroke(ring, lineWidth: 1))
    }
}

/// A category's rows on the wall, 1 at the top, a rule between each (mock 4), redrawn as the pages turn: the
/// next category's rows come in whole beneath them.
private struct WheelPages: View {
    @ObservedObject var wheel: WheelPosition
    let pages: [[DartWheel.Item]]
    let rowHeight: CGFloat
    let top: CGFloat
    let height: CGFloat
    let width: CGFloat

    var body: some View {
        let p = wheel.pos
        let n = max(pages.count, 1)
        ZStack(alignment: .topLeading) {
            if !pages.isEmpty {
                ForEach(Array(Int(p.rounded(.down))...Int(p.rounded(.up))), id: \.self) { i in
                    let rows = pages[((i % n) + n) % n]
                    let shift = CGFloat(Double(i) - p) * height
                    ForEach(Array(rows.enumerated()), id: \.offset) { j, item in
                        WheelRow(item: item)
                            .frame(width: width, height: rowHeight)
                            .overlay(alignment: .top) {
                                if j > 0 { Rectangle().fill(LabInk.hair).frame(height: 1).padding(.leading, 10) }
                            }
                            .position(x: width / 2, y: top + (CGFloat(j) + 0.5) * rowHeight + shift)
                    }
                    .opacity(1 - 0.5 * min(1, abs(Double(i) - p)))
                }
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
    }
}

/// One dart's row, as on the wall (mock 4): Gary's number, the player, the line and the price. Graded (mock 4.5):
/// a check or a cross and the final number beside the player, the line and price smaller under it, a miss dimmed.
private struct WheelRow: View {
    let item: DartWheel.Item

    private var d: DartRow { item.dart }
    private var side: String? {
        if d.isGame { return (d.bet ?? "over") == "under" ? "NRFI" : "YRFI" }
        return d.betWords
    }
    private var direction: LabDirection? {
        guard !d.isGame, d.lineWords != nil else { return nil }
        return (d.bet ?? "over").lowercased() == "under" ? .under : .over
    }
    /// The final number shows once graded (and only with a number to show).
    private var grade: Bool? { d.actualText == nil ? nil : d.graded }
    /// "G. Antetokounmpo" (a first-inning dart's matchup stays whole).
    private var shortName: String {
        let parts = d.player.split(separator: " ")
        guard !d.isGame, parts.count > 1, let first = parts.first?.first else { return d.player }
        return "\(first). \(parts.dropFirst().joined(separator: " "))"
    }

    private func name(_ s: String) -> some View {
        Text(s)
            .font(GaryFonts.ui(14.5, .semibold))
            .foregroundStyle(d.isScratched ? LabInk.dim : GaryColors.warmWhite.opacity(grade == false ? 0.62 : 1))
    }

    var body: some View {
        let miss = grade == false
        HStack(spacing: 10) {
            Text("\(item.rank)")
                .font(GaryFonts.display(25))
                .foregroundStyle(grade == true || (grade == nil && item.rank == 1) ? GaryColors.gold : GaryColors.warmWhite.opacity(0.4))
                .frame(width: 16)
            VStack(alignment: .leading, spacing: grade == nil ? 7 : 6) {
                HStack(spacing: 6) {
                    // A long name beside a final number goes to an initial rather than shrinking.
                    ViewThatFits(in: .horizontal) {
                        name(d.player).fixedSize()
                        name(shortName).fitsOneLine()
                    }
                    if let grade, let actual = d.actualText {
                        Spacer(minLength: 4)
                        GradeMark(hit: grade)
                        Text(actual)
                            .font(GaryFonts.display(24))
                            .foregroundStyle(grade ? GaryColors.win : GaryColors.warmWhite.opacity(0.5))
                            .monospacedDigit()
                    }
                }
                HStack(alignment: .center, spacing: 6) {
                    if d.isScratched {
                        Text(d.scratchWord).font(GaryFonts.display(15)).tracking(0.5).foregroundStyle(LabInk.dimmer)
                    } else {
                        if let direction {
                            Image(systemName: direction == .over ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(direction == .over ? GaryColors.win : GaryColors.loss)
                        }
                        if let side {
                            Text(side).font(GaryFonts.display(grade == nil ? 16.5 : 15.5)).tracking(0.4)
                                .foregroundStyle(GaryColors.silver.opacity(miss ? 0.55 : 1)).fitsOneLine()
                        }
                        if grade == nil { Spacer(minLength: 6) }
                        Text(LabFormat.price(d.odds)).font(GaryFonts.display(grade == nil ? 20.5 : 15.5))
                            .foregroundStyle(GaryColors.gold.opacity(miss ? 0.5 : 1)).monospacedDigit()
                    }
                }
            }
        }
        .padding(.leading, 10)
        .padding(.trailing, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// A graded dart's mark: a green check in a ring for a hit, a faint cross for a miss.
private struct GradeMark: View {
    let hit: Bool
    var body: some View {
        ZStack {
            Circle().fill(hit ? GaryColors.win.opacity(0.16) : .clear)
            Circle().stroke(hit ? GaryColors.win : GaryColors.warmWhite.opacity(0.3), lineWidth: 1)
            Image(systemName: hit ? "checkmark" : "xmark")
                .font(.system(size: 7.5, weight: .bold))
                .foregroundStyle(hit ? GaryColors.win : GaryColors.warmWhite.opacity(0.55))
        }
        .frame(width: 16, height: 16)
        .accessibilityHidden(true)
    }
}

/// The wheel's hand: an empty UIKit scroll view over the rows. It brings the
/// phone's own flick and slow-down, stops a turn on a row, and hands the
/// place back as rows from the start.
private struct DartWheelInput: UIViewRepresentable {
    /// How far one step is: a page.
    let unit: CGFloat
    let jump: WheelJump
    let onPos: (Double) -> Void
    let onTap: (CGFloat) -> Void

    /// Far enough each way that no hand reaches the end.
    static let base: CGFloat = 2_000_000

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UIScrollView {
        let v = WheelScrollView()
        v.backgroundColor = .clear
        v.contentInsetAdjustmentBehavior = .never
        v.showsVerticalScrollIndicator = false
        v.showsHorizontalScrollIndicator = false
        v.scrollsToTop = false
        v.decelerationRate = .normal
        v.delaysContentTouches = false
        v.contentSize = CGSize(width: 0, height: Self.base * 2)
        v.delegate = context.coordinator
        // The first row is set once the wheel has its size; a place set
        // before that was moved by UIKit (it opened on Points #5, Oct 30).
        let start = Self.base + CGFloat(jump.index) * unit
        v.onFirstLayout = { [weak v] in v?.setContentOffset(CGPoint(x: 0, y: start), animated: false) }
        context.coordinator.lastNonce = jump.nonce
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        v.addGestureRecognizer(tap)
        return v
    }

    func updateUIView(_ v: UIScrollView, context: Context) {
        context.coordinator.parent = self
        guard jump.nonce != context.coordinator.lastNonce else { return }
        context.coordinator.lastNonce = jump.nonce
        v.setContentOffset(CGPoint(x: 0, y: Self.base + CGFloat(jump.index) * unit), animated: jump.animated)
    }

    final class WheelScrollView: UIScrollView {
        var onFirstLayout: (() -> Void)?
        override func layoutSubviews() {
            super.layoutSubviews()
            guard bounds.height > 0, let first = onFirstLayout else { return }
            onFirstLayout = nil
            first()
        }
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        var parent: DartWheelInput
        var lastNonce = 0
        init(_ parent: DartWheelInput) { self.parent = parent }

        func scrollViewDidScroll(_ v: UIScrollView) {
            parent.onPos(Double((v.contentOffset.y - DartWheelInput.base) / parent.unit))
        }

        /// However hard the flick, it comes to rest on a page.
        func scrollViewWillEndDragging(_ v: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>) {
            let h = parent.unit
            let rows = ((targetContentOffset.pointee.y - DartWheelInput.base) / h).rounded()
            targetContentOffset.pointee.y = DartWheelInput.base + rows * h
        }

        @objc func tapped(_ g: UITapGestureRecognizer) {
            guard let v = g.view as? UIScrollView else { return }
            parent.onTap(g.location(in: v).y - v.contentOffset.y)
        }
    }
}

// MARK: - The page in cards (founder, Oct 30 2026: mock B, "identical to the mock")

/// The Darts page's one look: every section a lit, rounded card on the page,
/// a soft glow of its own color at its top, a hairline of light on its edge.
enum DartsLook {
    static let card = [Color(hex: "#1E1A15"), Color(hex: "#13110D")]
    static let goldTile = [Color(hex: "#3A2C0F"), Color(hex: "#1E170B")]
    static let goldWord = Color(hex: "#F2D27A")
    static let goldLabel = Color(hex: "#E8C45A")
    static let green = Color(hex: "#6FD08A")
    static let greenFigure = Color(hex: "#57C46B")
    static let redFigure = Color(hex: "#FF7A7E")

    /// The gold tile a picked tab or the picked dart row sits on.
    static func goldTileFill(radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(LinearGradient(colors: goldTile, startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                .stroke(LinearGradient(colors: [.white.opacity(0.09), .clear], startPoint: .top, endPoint: .center), lineWidth: 1))
            .shadow(color: .black.opacity(0.45), radius: 7, y: 6)
    }
}

/// A section's card: the page's dark warm face with a glow of `tint` where
/// `glowAt` says, 22-point corners, lifted on a shadow.
struct DartsCard: ViewModifier {
    var tint: Color? = nil
    var glowAt: UnitPoint = .top
    var face: [Color] = DartsLook.card
    func body(content: Content) -> some View {
        content
            .background {
                GeometryReader { g in
                    ZStack {
                        LinearGradient(colors: face, startPoint: UnitPoint(x: 0.35, y: 0), endPoint: UnitPoint(x: 0.65, y: 1))
                        if let tint {
                            RadialGradient(colors: [tint, .clear], center: glowAt, startRadius: 0, endRadius: max(g.size.width, g.size.height) * 0.7)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(LinearGradient(colors: [.white.opacity(0.08), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.12)), lineWidth: 1))
                .shadow(color: .black.opacity(0.45), radius: 15, y: 16)
            }
            .padding(.horizontal, 12)
    }
}

extension View {
    func dartsCard(tint: Color? = nil, glowAt: UnitPoint = .top, face: [Color] = DartsLook.card) -> some View {
        modifier(DartsCard(tint: tint, glowAt: glowAt, face: face))
    }
}

/// Tabs as words: the picked one lit gold and glowing, no box, no bar
/// (design.md: no pills). Spread across the width when they fit; a row that
/// scrolls when they don't (the NFL's six).
struct LitTextTabs: View {
    let items: [String]
    @Binding var selected: String
    var size: CGFloat = 14

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element) { i, item in
                    if i > 0 { Spacer(minLength: 12) }
                    word(item)
                }
            }
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 18) { ForEach(items, id: \.self) { word($0) } }
                }
                // The wheel moving the category keeps its word in view.
                .onChange(of: selected) { item in withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(item, anchor: .center) } }
            }
        }
    }

    private func word(_ item: String) -> some View {
        let on = selected == item
        return Button { withAnimation(.easeOut(duration: 0.18)) { selected = item } } label: {
            Text(item.uppercased()).font(GaryFonts.display(size)).tracking(1.2)
                .foregroundStyle(on ? DartsLook.goldWord : DartsInk.idleTab)
                .shadow(color: on ? DartsLook.goldLabel.opacity(0.55) : .clear, radius: 7)
                .fixedSize()
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
        .id(item)
    }
}

/// The leagues in a sunk glass bar, the picked one raised on a gold tile.
struct LeagueGlassBar: View {
    let items: [String]
    @Binding var selected: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(items, id: \.self) { item in
                let on = selected == item
                Button { withAnimation(.easeOut(duration: 0.18)) { selected = item } } label: {
                    Text(item).font(GaryFonts.display(15.7)).tracking(1.6)
                        .foregroundStyle(on ? DartsLook.goldLabel : DartsInk.idleTab)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background { if on { DartsLook.goldTileFill(radius: 13) } }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#0F0D0A"), Color(hex: "#15120E")], startPoint: .top, endPoint: .bottom)
                    .shadow(.inner(color: .black.opacity(0.6), radius: 4, y: 3)))
        )
        .frame(height: 46)
    }
}
