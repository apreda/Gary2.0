import SwiftUI

/// The rail under the scoreboard: four quarters, a gold line for the time
/// played with a pulsing head at the clock, and a tick at every landing,
/// taller for a longer price. The top three burn brighter; the longest is
/// labelled. Overtime landings sit at the right end.
struct CashRailRailView: View {
    let elapsed: Int
    let hits: [CashRailHit]
    let live: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var halo = false

    private static let base: CGFloat = 27
    private static let inset: CGFloat = 4

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let headX = x(elapsed, w)
            ZStack(alignment: .topLeading) {
                Canvas { ctx, size in draw(&ctx, width: size.width) }
                if live {
                    Circle().fill(GaryColors.lightGold)
                        .frame(width: 7, height: 7)
                        .scaleEffect(halo ? 3.2 : 1)
                        .opacity(halo ? 0 : 0.45)
                        .position(x: headX, y: Self.base)
                }
                Circle().fill(GaryColors.lightGold)
                    .frame(width: 7, height: 7)
                    .position(x: headX, y: Self.base)
            }
        }
        .frame(height: 40)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.8), value: elapsed)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { halo = true }
        }
        .accessibilityHidden(true)
    }

    private func x(_ gs: Int, _ w: CGFloat) -> CGFloat {
        Self.inset + (w - 2 * Self.inset) * CGFloat(min(max(gs, 0), 3600)) / 3600
    }

    private func tickHeight(_ price: Int) -> CGFloat {
        3 + 19 * CGFloat(log(CashRailFormat.decimal(price)) / log(23))
    }

    private func draw(_ ctx: inout GraphicsContext, width w: CGFloat) {
        let base = Self.base
        // Quarter separators and labels.
        let quarter = live ? min(3, max(0, min(elapsed, 3599) / 900)) : -1
        for q in 0..<4 {
            if q > 0 {
                var p = Path(); p.move(to: CGPoint(x: x(q * 900, w), y: base - 4)); p.addLine(to: CGPoint(x: x(q * 900, w), y: base + 4))
                ctx.stroke(p, with: .color(Color(hex: "#3A3530")), lineWidth: 1)
            }
            let label = Text("Q\(q + 1)").font(.system(size: 8.5, weight: .bold)).tracking(1.0)
                .foregroundColor(q == quarter ? GaryColors.gold : CR.mute2)
            ctx.draw(label, at: CGPoint(x: x(q * 900 + 450, w), y: 39.5), anchor: .bottom)
        }
        // Base and the time played.
        var baseLine = Path(); baseLine.move(to: CGPoint(x: Self.inset, y: base)); baseLine.addLine(to: CGPoint(x: w - Self.inset, y: base))
        ctx.stroke(baseLine, with: .color(CR.line), lineWidth: 2)
        var played = Path(); played.move(to: CGPoint(x: Self.inset, y: base)); played.addLine(to: CGPoint(x: x(elapsed, w), y: base))
        ctx.stroke(played, with: .color(GaryColors.gold), lineWidth: 2)
        // Ticks.
        guard !hits.isEmpty else { return }
        let byPrice = hits.sorted { CashRailFormat.decimal($0.price) > CashRailFormat.decimal($1.price) }
        let top3 = Set(byPrice.prefix(3).map(\.key))
        for h in hits {
            let tx = x(h.elapsed, w)
            var t = Path(); t.move(to: CGPoint(x: tx, y: base)); t.addLine(to: CGPoint(x: tx, y: base - tickHeight(h.price)))
            ctx.stroke(t, with: .color(top3.contains(h.key) ? GaryColors.lightGold : GaryColors.gold.opacity(0.75)), lineWidth: 2.5)
        }
        if let longest = byPrice.first {
            let lx = x(longest.elapsed, w)
            let right = lx > w - 48
            let label = Text(CashRailFormat.price(longest.price)).font(CR.bebas(13)).tracking(0.5)
                .foregroundColor(GaryColors.lightGold)
            ctx.draw(label, at: CGPoint(x: right ? lx - 5 : lx + 5, y: base - tickHeight(longest.price) + 9),
                     anchor: right ? .bottomTrailing : .bottomLeading)
        }
    }
}
