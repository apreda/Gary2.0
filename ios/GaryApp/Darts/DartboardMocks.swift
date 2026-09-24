#if DEBUG
import SwiftUI

// DARTBOARD MOCKS (founder, Sep 24 2026: "12 mocks of that one but in
// different colors ... and 5 that are completely new dart board designs").
// DEBUG only: the tour's `darts board N` draws mock N on the real page so the
// canvas shows the app, not a drawing of it. Nothing here ships.

enum DartboardMock {
    /// The mock on screen; nil draws the shipping board.
    static var style: Int?

    struct Palette {
        let name: String
        let wedgeA: String, wedgeB: String
        let ringA: String, ringB: String
        let outerBull: String, eye: String
        var wire: Double = 0.1
    }

    /// 1–12: the gray-and-gold board in other colors.
    static let palettes: [Palette] = [
        Palette(name: "Graphite + champagne", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#8A7A56", ringB: "#46423C", outerBull: "#46423C", eye: "#8A7A56"),
        Palette(name: "Gray + antique brass", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#6B5829", ringB: "#4A4640", outerBull: "#4A4640", eye: "#6B5829"),
        Palette(name: "Slate + gold", wedgeA: "#1C1D1F", wedgeB: "#0A0A0B", ringA: "#7D6420", ringB: "#3E444B", outerBull: "#3E444B", eye: "#7D6420"),
        Palette(name: "Gray + copper", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#6C4526", ringB: "#4A4640", outerBull: "#4A4640", eye: "#6C4526"),
        Palette(name: "Charcoal + bone", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#8E877A", ringB: "#393633", outerBull: "#393633", eye: "#8E877A"),
        Palette(name: "Gray + oxblood", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#5A201C", ringB: "#4A4640", outerBull: "#4A4640", eye: "#5A201C"),
        Palette(name: "Gold + oxblood", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#7D6420", ringB: "#5A201C", outerBull: "#5A201C", eye: "#7D6420"),
        Palette(name: "Gold + forest", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#7D6420", ringB: "#2E4632", outerBull: "#2E4632", eye: "#7D6420"),
        Palette(name: "Gray + emerald", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#2D5845", ringB: "#4A4640", outerBull: "#4A4640", eye: "#2D5845"),
        Palette(name: "Gold + navy", wedgeA: "#1B1B1D", wedgeB: "#09090A", ringA: "#7D6420", ringB: "#2A3450", outerBull: "#2A3450", eye: "#7D6420"),
        Palette(name: "Gold + deep bronze", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#7D6420", ringB: "#4B3A1C", outerBull: "#4B3A1C", eye: "#7D6420"),
        Palette(name: "Smoke + rose gold", wedgeA: "#1F1B16", wedgeB: "#0A0908", ringA: "#7C5448", ringB: "#46423E", outerBull: "#46423E", eye: "#7C5448"),
    ]

    /// 13–17: new boards.
    static let designs = ["Gold line art", "Target", "Casino chip", "Radar scope", "Gary's record"]

    static func name(_ n: Int) -> String {
        if (1...12).contains(n) { return palettes[n - 1].name }
        if (13...17).contains(n) { return designs[n - 13] }
        return "Shipping"
    }
}

extension DartboardPlan {
    /// Draws mock `style`; false when there is no such mock.
    func drawMock(_ ctx: inout GraphicsContext, style: Int) -> Bool {
        switch style {
        case 1...12: drawPalette(&ctx, DartboardMock.palettes[style - 1])
        case 13: drawLineArt(&ctx)
        case 14: drawTarget(&ctx)
        case 15: drawChip(&ctx)
        case 16: drawRadar(&ctx)
        case 17: drawRecord(&ctx)
        default: return false
        }
        return true
    }

    private var edge: CGFloat { Self.double.1 }
    private var gold: Color { GaryColors.gold }
    private var warm: Color { GaryColors.warmWhite }

    private func base(_ ctx: inout GraphicsContext, _ fill: Color) {
        ctx.drawLayer { layer in
            layer.addFilter(.shadow(color: .black.opacity(0.5), radius: 14 * s, x: 0, y: 6 * s))
            layer.fill(circle(edge), with: .color(fill))
        }
    }

    /// The shipping board's structure in another palette.
    private func drawPalette(_ ctx: inout GraphicsContext, _ p: DartboardMock.Palette) {
        base(&ctx, Color(hex: "#090808"))
        for i in 0..<20 {
            let a0 = -9 + 18 * Double(i), a1 = a0 + 18
            ctx.fill(segment(Self.outerBull, edge, a0, a1), with: .color(Color(hex: i % 2 == 0 ? p.wedgeA : p.wedgeB)))
            let ring = Color(hex: i % 2 == 0 ? p.ringA : p.ringB)
            ctx.fill(segment(Self.treble.0, Self.treble.1, a0, a1), with: .color(ring))
            ctx.fill(segment(Self.double.0, Self.double.1, a0, a1), with: .color(ring))
        }
        let wire = warm.opacity(p.wire)
        for i in 0..<20 {
            let a = -9 + 18 * Double(i)
            ctx.stroke(line(point(Self.outerBull, a), point(edge, a)), with: .color(wire), lineWidth: 0.6)
        }
        for r in [Self.outerBull, Self.treble.0, Self.treble.1, Self.double.0] {
            ctx.stroke(circle(r), with: .color(wire), lineWidth: 0.7)
        }
        ctx.fill(circle(Self.outerBull), with: .color(Color(hex: p.outerBull)))
        ctx.fill(circle(Self.bull), with: .color(Color(hex: p.eye)))
        ctx.stroke(circle(Self.bull), with: .color(wire), lineWidth: 0.7)
        ctx.stroke(circle(edge - 0.5), with: .color(warm.opacity(0.14)), lineWidth: 1)
    }

    /// 13: no fills, the board drawn in gold hairlines on a dark face.
    private func drawLineArt(_ ctx: inout GraphicsContext) {
        base(&ctx, Color(hex: "#110F0C"))
        for i in 0..<20 {
            let a = -9 + 18 * Double(i)
            ctx.stroke(line(point(Self.outerBull, a), point(edge, a)), with: .color(gold.opacity(0.28)), lineWidth: 0.7)
        }
        for r in [Self.outerBull, Self.treble.0, Self.treble.1, Self.double.0] {
            ctx.stroke(circle(r), with: .color(gold.opacity(0.5)), lineWidth: 0.9)
        }
        // Every other double and treble cell hatched faintly, so it still reads as a board.
        for i in stride(from: 0, to: 20, by: 2) {
            let a0 = -9 + 18 * Double(i), a1 = a0 + 18
            ctx.fill(segment(Self.treble.0, Self.treble.1, a0, a1), with: .color(gold.opacity(0.14)))
            ctx.fill(segment(Self.double.0, Self.double.1, a0, a1), with: .color(gold.opacity(0.14)))
        }
        ctx.stroke(circle(Self.bull), with: .color(gold.opacity(0.8)), lineWidth: 1)
        ctx.fill(circle(4), with: .color(gold.opacity(0.9)))
        ctx.stroke(circle(edge - 0.5), with: .color(gold.opacity(0.75)), lineWidth: 1.4)
    }

    /// 14: a target, concentric bands and no wedges.
    private func drawTarget(_ ctx: inout GraphicsContext) {
        base(&ctx, Color(hex: "#0B0A09"))
        let bands: [(CGFloat, String)] = [(172, "#141210"), (150, "#2A2621"), (128, "#141210"), (106, "#2A2621"),
                                          (84, "#141210"), (62, "#2A2621"), (40, "#5B4A1F"), (20, "#7D6420")]
        for (r, hex) in bands { ctx.fill(circle(r), with: .color(Color(hex: hex))) }
        for (r, _) in bands { ctx.stroke(circle(r), with: .color(warm.opacity(0.1)), lineWidth: 0.7) }
        ctx.stroke(line(point(172, 0), point(172, 180)), with: .color(warm.opacity(0.06)), lineWidth: 0.6)
        ctx.stroke(line(point(172, 90), point(172, 270)), with: .color(warm.opacity(0.06)), lineWidth: 0.6)
        ctx.stroke(circle(edge - 0.5), with: .color(gold.opacity(0.45)), lineWidth: 1)
    }

    /// 15: a casino chip, edge spots in gold and bone, a felt face, a dashed inlay.
    private func drawChip(_ ctx: inout GraphicsContext) {
        base(&ctx, Color(hex: "#1A1713"))
        for i in 0..<16 {
            let a0 = Double(i) * 22.5 - 5.5, a1 = a0 + 11
            ctx.fill(segment(150, edge, a0, a1), with: .color(Color(hex: i % 2 == 0 ? "#7D6420" : "#8E877A")))
        }
        ctx.fill(circle(150), with: .color(Color(hex: "#15130F")))
        ctx.stroke(circle(150), with: .color(warm.opacity(0.14)), lineWidth: 0.8)
        ctx.stroke(circle(128), with: .color(gold.opacity(0.4)), style: StrokeStyle(lineWidth: 1.2, dash: [4 * s, 5 * s]))
        ctx.fill(circle(70), with: .color(Color(hex: "#1F1B16")))
        ctx.stroke(circle(70), with: .color(gold.opacity(0.35)), lineWidth: 1)
        ctx.stroke(circle(62), with: .color(gold.opacity(0.18)), lineWidth: 0.7)
        ctx.fill(circle(Self.bull), with: .color(Color(hex: "#7D6420")))
    }

    /// 16: a radar scope, rings and a crosshair, a gold sweep.
    private func drawRadar(_ ctx: inout GraphicsContext) {
        base(&ctx, Color(hex: "#0D0C0A"))
        ctx.fill(circle(edge), with: .radialGradient(Gradient(colors: [Color(hex: "#1E1A14"), Color(hex: "#0D0C0A")]),
                                                    center: c, startRadius: 0, endRadius: edge * s))
        // The sweep: a fading wedge behind the leading line.
        for k in 0..<40 {
            let a0 = 20 + Double(k) * 1.5
            ctx.fill(segment(0, edge, a0, a0 + 1.6), with: .color(gold.opacity(0.004 * Double(k))))
        }
        ctx.stroke(line(c, point(edge, 80)), with: .color(gold.opacity(0.55)), lineWidth: 1)
        for r in [43, 86, 129] as [CGFloat] {
            ctx.stroke(circle(r), with: .color(gold.opacity(0.22)), lineWidth: 0.8)
        }
        for a in [0.0, 90, 180, 270] {
            ctx.stroke(line(point(8, a), point(edge, a)), with: .color(warm.opacity(0.1)), lineWidth: 0.7)
        }
        for k in 0..<72 {
            let a = Double(k) * 5
            ctx.stroke(line(point(edge - (k % 6 == 0 ? 9 : 4), a), point(edge - 1, a)), with: .color(gold.opacity(k % 6 == 0 ? 0.5 : 0.22)), lineWidth: 0.8)
        }
        ctx.fill(circle(4), with: .color(gold.opacity(0.85)))
        ctx.stroke(circle(edge - 0.5), with: .color(gold.opacity(0.5)), lineWidth: 1)
    }

    /// 17: a record, fine grooves and a gold label with Gary's mark.
    private func drawRecord(_ ctx: inout GraphicsContext) {
        base(&ctx, Color(hex: "#0C0B0A"))
        var r: CGFloat = 60
        while r < edge - 4 {
            ctx.stroke(circle(r), with: .color(warm.opacity(r.truncatingRemainder(dividingBy: 14) < 2 ? 0.07 : 0.035)), lineWidth: 0.6)
            r += 2.4
        }
        // A light across the grooves.
        ctx.fill(segment(60, edge - 4, 300, 330), with: .color(warm.opacity(0.035)))
        ctx.fill(segment(60, edge - 4, 120, 150), with: .color(warm.opacity(0.035)))
        ctx.fill(circle(56), with: .color(Color(hex: "#7D6420")))
        ctx.stroke(circle(56), with: .color(gold.opacity(0.6)), lineWidth: 1)
        ctx.stroke(circle(46), with: .color(Color(hex: "#5B4A1F")), lineWidth: 0.8)
        let mark = ctx.resolve(Image(GaryBrand.mark))
        let m = 44 * s
        ctx.draw(mark, in: CGRect(x: c.x - m / 2, y: c.y - m / 2, width: m, height: m))
        ctx.fill(circle(3), with: .color(Color(hex: "#0C0B0A")))
        ctx.stroke(circle(edge - 0.5), with: .color(warm.opacity(0.14)), lineWidth: 1)
    }
}
#endif
