import SwiftUI

// MLB GAME INTEL — the MLB analog of WCGameIntelView. A baseball-diamond visual anchor
// (with the two clubs' real colours) over the dark page, then ALL of the game's GAME
// INTEL edges kept but REORGANIZED into clean modules — PITCHING / BATS / PARK & WEATHER
// — instead of one flat list. Replaces the plain GAME INTEL section for MLB matchups.
//
// The diamond is a visual anchor: there's no confirmed batting-order/probable-pitcher
// payload on the matchup edges (unlike WC's confirmedXI), so the substance lives in the
// modules, each rendered through the existing EdgesSection.

private enum MLBI {
    static let ink = Color.white
    static let ink2 = Color.white.opacity(0.72)
    static let ink3 = Color.white.opacity(0.5)
    static let ink4 = Color.white.opacity(0.4)
    static let gold = GaryColors.gold
    static let grass = Color(hex: "#223B2A")
    static let grass2 = Color(hex: "#274430")
    static let dirt = Color(hex: "#8A5A33")
    static let chip = Color.white.opacity(0.07)
}

struct MLBGameIntelView: View {
    let matchup: String                 // "Away @ Home"
    let edges: [Signal]
    var showHeader: Bool = true
    var onClose: (() -> Void)? = nil

    private var awayName: String { matchup.components(separatedBy: " @ ").first ?? "Away" }
    private var homeName: String { matchup.components(separatedBy: " @ ").last ?? "Home" }

    // MARK: edge buckets — every kind lands in exactly one module
    private func module(_ kinds: Set<SignalKind>) -> [Signal] { edges.filter { kinds.contains($0.kind) } }
    private var pitchingEdges: [Signal] { module([.starterForm, .firstInning, .runningGame]) }
    private var batsEdges: [Signal] { module([.hot, .cold, .platoon, .regression, .hrThreat, .h2h, .streak]) }
    private var parkEdges: [Signal] { module([.parkWeather, .ballpark]) }
    private var otherEdges: [Signal] {
        let claimed: Set<SignalKind> = [.starterForm, .firstInning, .runningGame,
                                        .hot, .cold, .platoon, .regression, .hrThreat, .h2h, .streak,
                                        .parkWeather, .ballpark]
        return edges.filter { !claimed.contains($0.kind) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showHeader { header }
            fieldCard
            if !pitchingEdges.isEmpty { EdgesSection(title: "PITCHING", edges: pitchingEdges).padding(.top, 6) }
            if !batsEdges.isEmpty     { EdgesSection(title: "BATS", edges: batsEdges).padding(.top, 6) }
            if !parkEdges.isEmpty     { EdgesSection(title: "PARK & WEATHER", edges: parkEdges).padding(.top, 6) }
            if !otherEdges.isEmpty    { EdgesSection(title: "MORE INTEL", edges: otherEdges).padding(.top, 6) }
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .topTrailing) {
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MLBI.ink3).frame(width: 34, height: 34)
                        .background(Circle().fill(MLBI.chip))
                }
                .padding(.trailing, 14).padding(.top, 12)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("MLB · Game Intel")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(MLBI.gold).textCase(.uppercase)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(awayName).font(GaryFonts.text(26, .bold)).foregroundStyle(MLBI.ink)
                Text("@").font(GaryFonts.text(16, .semibold)).foregroundStyle(MLBI.ink4)
                Text(homeName).font(GaryFonts.text(26, .bold)).foregroundStyle(MLBI.ink)
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 18).padding(.bottom, 2)
    }

    private var fieldCard: some View {
        ZStack {
            BaseballField()
            // club tags: away on the outfield, home at the plate
            VStack {
                clubTag(awayName)
                Spacer()
                clubTag(homeName)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 300)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.08)))
        .padding(.horizontal, 14).padding(.top, 13)
    }

    private func clubTag(_ name: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(Self.clubColor(name)).frame(width: 9, height: 9)
            Text(name.uppercased()).font(GaryFonts.mono(11, bold: true)).foregroundStyle(.white)
        }
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(Capsule().fill(Color.black.opacity(0.35)))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// MLB club primary colour by mascot-short name (the matchup uses short names).
    private static func clubColor(_ name: String) -> Color {
        let t = name.lowercased()
        let map: [(String, String)] = [
            ("yankees", "#0C2340"), ("red sox", "#BD3039"), ("blue jays", "#134A8E"), ("rays", "#092C5C"),
            ("orioles", "#DF4601"), ("guardians", "#00385D"), ("tigers", "#0C2340"), ("twins", "#002B5C"),
            ("white sox", "#27251F"), ("royals", "#004687"), ("astros", "#EB6E1F"), ("mariners", "#0C2C56"),
            ("rangers", "#003278"), ("angels", "#BA0021"), ("athletics", "#003831"), ("a's", "#003831"),
            ("braves", "#CE1141"), ("phillies", "#E81828"), ("mets", "#FF5910"), ("marlins", "#00A3E0"),
            ("nationals", "#AB0003"), ("cubs", "#0E3386"), ("brewers", "#12284B"), ("cardinals", "#C41E3A"),
            ("reds", "#C6011F"), ("pirates", "#FDB827"), ("dodgers", "#005A9C"), ("padres", "#2F241D"),
            ("giants", "#FD5A1E"), ("diamondbacks", "#A71930"), ("d-backs", "#A71930"), ("rockies", "#33006F"),
        ]
        return (map.first { t.contains($0.0) }?.1).map { Color(hex: $0) } ?? GaryColors.gold
    }
}

/// A simple, recognizable baseball diamond drawn with Canvas — grass, dirt infield,
/// baselines, bases, and the mound. A branded visual anchor, not a data surface.
private struct BaseballField: View {
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height
            // grass
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(MLBI.grass))
            // mowed outfield band
            ctx.fill(Path(ellipseIn: CGRect(x: -w * 0.2, y: -h * 0.4, width: w * 1.4, height: h * 1.05)),
                     with: .color(MLBI.grass2))

            let cx = w / 2
            let home = CGPoint(x: cx, y: h * 0.84)
            let first = CGPoint(x: w * 0.76, y: h * 0.55)
            let second = CGPoint(x: cx, y: h * 0.26)
            let third = CGPoint(x: w * 0.24, y: h * 0.55)
            let mound = CGPoint(x: cx, y: h * 0.55)

            // infield dirt diamond
            var dirt = Path()
            dirt.move(to: home); dirt.addLine(to: first); dirt.addLine(to: second); dirt.addLine(to: third); dirt.closeSubpath()
            ctx.fill(dirt, with: .color(MLBI.dirt))
            ctx.stroke(dirt, with: .color(.white.opacity(0.5)), lineWidth: 1.5)

            // bases
            for p in [first, second, third] {
                ctx.fill(Path(CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8)), with: .color(.white.opacity(0.92)))
            }
            // home plate
            ctx.fill(Path(CGRect(x: home.x - 5, y: home.y - 4, width: 10, height: 8)), with: .color(.white.opacity(0.95)))
            // pitcher's mound
            ctx.fill(Path(ellipseIn: CGRect(x: mound.x - 11, y: mound.y - 11, width: 22, height: 22)),
                     with: .color(MLBI.dirt.opacity(0.95)))
            ctx.fill(Path(ellipseIn: CGRect(x: mound.x - 2.5, y: mound.y - 2.5, width: 5, height: 5)),
                     with: .color(.white.opacity(0.8)))
        }
    }
}
