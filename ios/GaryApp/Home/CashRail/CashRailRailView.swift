import SwiftUI

/// The rail under the scoreboard: four quarters, a gold line for the time
/// played with a pulsing head at the clock, and a bar at every landing. Each
/// bar stands as tall as what $10 on every hit had won by then, so the rail
/// climbs all night (founder, Oct 30 2026: keep the rail, make it bigger,
/// track something else). The biggest jumps burn brighter and the biggest is
/// labelled; the running total sits over the right end. Overtime landings sit
/// at the right end.
struct CashRailRailView: View {
    let elapsed: Int
    let hits: [CashRailHit]
    let live: Bool
    /// The board's pile (CashRailBoard.pile), passed so the rail and the card agree.
    let pile: [CashRailPileStep]

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var halo = false

    static let height: CGFloat = 118
    /// The canvas under the header row: bars stand on its floor, quarters sit below.
    private static let canvas: CGFloat = 92
    private static let plot: CGFloat = 58
    private static let inset: CGFloat = 4

    private var total: Double { pile.last?.total ?? 0 }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .lastTextBaseline) {
                Text("$10 ON EVERY HIT")
                    .font(.system(size: 9.5, weight: .bold)).tracking(1.4)
                    .foregroundStyle(CR.mute)
                    .fitsOneLine()
                Spacer(minLength: 8)
                Text(CashRailFormat.pileTotal(total))
                    .font(CR.bebas(24)).tracking(0.5)
                    .foregroundStyle(total > 0 ? GaryColors.win : CR.mute)
                    .contentTransition(.numericText())
                    .fitsOneLine()
            }
            GeometryReader { geo in
                let w = geo.size.width
                let headX = x(elapsed, w)
                ZStack(alignment: .topLeading) {
                    Canvas { ctx, size in draw(&ctx, width: size.width) }
                    if live {
                        Circle().fill(GaryColors.lightGold)
                            .frame(width: 8, height: 8)
                            .scaleEffect(halo ? 3.2 : 1)
                            .opacity(halo ? 0 : 0.45)
                            .position(x: headX, y: floor)
                    }
                    Circle().fill(GaryColors.lightGold)
                        .frame(width: 8, height: 8)
                        .position(x: headX, y: floor)
                }
            }
            .frame(height: Self.canvas)
        }
        .frame(height: Self.height)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.8), value: elapsed)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { halo = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Ten dollars on every hit has won \(CashRailFormat.pileTotal(total)) so far")
    }

    private func x(_ gs: Int, _ w: CGFloat) -> CGFloat {
        Self.inset + (w - 2 * Self.inset) * CGFloat(min(max(gs, 0), 3600)) / 3600
    }

    /// The baseline inside the canvas, with room under it for the quarters.
    private var floor: CGFloat { Self.canvas - 20 }

    private func barHeight(_ v: Double) -> CGFloat {
        guard total > 0 else { return 0 }
        return 3 + (Self.plot - 3) * CGFloat(v / total)
    }

    private func draw(_ ctx: inout GraphicsContext, width w: CGFloat) {
        let base = floor
        // Quarter separators and labels.
        let quarter = live ? min(3, max(0, min(elapsed, 3599) / 900)) : -1
        for q in 0..<4 {
            if q > 0 {
                var p = Path(); p.move(to: CGPoint(x: x(q * 900, w), y: base - 5)); p.addLine(to: CGPoint(x: x(q * 900, w), y: base + 5))
                ctx.stroke(p, with: .color(Color(hex: "#3A3530")), lineWidth: 1)
            }
            let label = Text("Q\(q + 1)").font(.system(size: 9.5, weight: .bold)).tracking(1.0)
                .foregroundColor(q == quarter ? GaryColors.gold : CR.mute2)
            ctx.draw(label, at: CGPoint(x: x(q * 900 + 450, w), y: base + 19), anchor: .bottom)
        }
        // The pile as a faint step under the bars, out to the clock.
        if !pile.isEmpty {
            var area = Path()
            area.move(to: CGPoint(x: x(pile[0].elapsed, w), y: base))
            for (i, s) in pile.enumerated() {
                let sx = x(s.elapsed, w), top = base - barHeight(s.total)
                area.addLine(to: CGPoint(x: sx, y: i == 0 ? top : base - barHeight(pile[i - 1].total)))
                area.addLine(to: CGPoint(x: sx, y: top))
            }
            let endX = max(x(elapsed, w), x(pile[pile.count - 1].elapsed, w))
            area.addLine(to: CGPoint(x: endX, y: base - barHeight(total)))
            area.addLine(to: CGPoint(x: endX, y: base))
            area.closeSubpath()
            ctx.fill(area, with: .linearGradient(Gradient(colors: [GaryColors.gold.opacity(0.16), GaryColors.gold.opacity(0.02)]),
                                                 startPoint: CGPoint(x: 0, y: base - Self.plot), endPoint: CGPoint(x: 0, y: base)))
        }
        // Base and the time played.
        var baseLine = Path(); baseLine.move(to: CGPoint(x: Self.inset, y: base)); baseLine.addLine(to: CGPoint(x: w - Self.inset, y: base))
        ctx.stroke(baseLine, with: .color(CR.line), lineWidth: 2)
        var played = Path(); played.move(to: CGPoint(x: Self.inset, y: base)); played.addLine(to: CGPoint(x: x(elapsed, w), y: base))
        ctx.stroke(played, with: .color(GaryColors.gold), lineWidth: 2)
        // A bar at every landing, as tall as the pile was then.
        guard !pile.isEmpty else { return }
        let byJump = pile.sorted { $0.jump > $1.jump }
        let top3 = Set(byJump.prefix(3).map(\.key))
        for s in pile {
            let bx = x(s.elapsed, w)
            var t = Path(); t.move(to: CGPoint(x: bx, y: base)); t.addLine(to: CGPoint(x: bx, y: base - barHeight(s.total)))
            ctx.stroke(t, with: .color(top3.contains(s.key) ? GaryColors.lightGold : GaryColors.gold.opacity(0.7)), lineWidth: 3)
        }
        if let biggest = byJump.first {
            let lx = x(biggest.elapsed, w)
            let right = lx > w - 56
            let label = Text(CashRailFormat.price(biggest.price)).font(CR.bebas(15)).tracking(0.5)
                .foregroundColor(GaryColors.lightGold)
            ctx.draw(label, at: CGPoint(x: right ? lx - 5 : lx + 5, y: base - barHeight(biggest.total) + 11),
                     anchor: right ? .bottomTrailing : .bottomLeading)
        }
    }
}
