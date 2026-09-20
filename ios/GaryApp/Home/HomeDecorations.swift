import SwiftUI

/// The SEALED motif — one diagonal hairline with a faint brighter wash to its
/// right, shared by every "sealed" surface (the Winners wrapper card wears the
/// same geometry) so the app speaks ONE seal language.
struct SealSheen: View {
    var tint: Color = GaryColors.gold
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: w * 0.68, y: 0))
                    p.addLine(to: CGPoint(x: w * 0.56, y: h))
                }
                .stroke(tint.opacity(0.3), lineWidth: 1)
                Path { p in
                    p.move(to: CGPoint(x: w * 0.68, y: 0))
                    p.addLine(to: CGPoint(x: w * 0.56, y: h))
                    p.addLine(to: CGPoint(x: w, y: h))
                    p.addLine(to: CGPoint(x: w, y: 0))
                }
                .fill(Color.white.opacity(0.025))
            }
        }
        .allowsHitTesting(false)
    }
}

/// Straight dashed line (the slip perforation).
struct DashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

