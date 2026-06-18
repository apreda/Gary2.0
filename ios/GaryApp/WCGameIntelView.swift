import SwiftUI

// WC GAME INTEL — the World Cup per-game dashboard (the design from
// wc-xi-proposals/g06v3-clean.html), native to the app's DARK theme.
// Replaces the plain "GAME INTEL" edges for World Cup games on the Picks matchup
// page, and surfaces full-screen from the Hub.
//
// Real data: the confirmed XI (formation, shirt numbers, names) comes from the BDL
// FIFA lineup API via the confirmedXI lane (TeamSheet/XIMan). Kit colours come from a
// nation map below. The projected/contested states + the source-consensus desk split
// have no backend lane yet → #if DEBUG sample only. A labelled sample XI shows ONLY
// when no confirmed sheet exists yet — it never masquerades as real.

private enum WCI {
    static let ink = Color.white
    static let ink2 = Color.white.opacity(0.72)
    static let ink3 = Color.white.opacity(0.5)
    static let ink4 = Color.white.opacity(0.38)
    static let gold = GaryColors.gold
    static let green = GaryColors.win
    static let amber = Color(hex: "#D9913F")
    static let chip = Color.white.opacity(0.07)
    static let hair = Color.white.opacity(0.10)
    static let pitch = Color(hex: "#243229")
    static let pitch2 = Color(hex: "#293A2F")
    static let gkKit = Color(hex: "#3FBF8F")     // keepers — a distinct teal-green
    static let neutralKit = Color(hex: "#5B6CB8")
}

private struct XIPlayer: Identifiable {
    let id = UUID()
    let num: Int
    let name: String
    let pos: String          // G / D / M / F
    var contested: Bool = false
}

private struct JerseyShape: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        func pt(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint { CGPoint(x: r.minX + fx * w, y: r.minY + fy * h) }
        var p = Path()
        p.move(to: pt(0.00, 0.30)); p.addLine(to: pt(0.22, 0.30)); p.addLine(to: pt(0.32, 0.07))
        p.addLine(to: pt(0.68, 0.07)); p.addLine(to: pt(0.78, 0.30)); p.addLine(to: pt(1.00, 0.30))
        p.addLine(to: pt(1.00, 0.48)); p.addLine(to: pt(0.80, 0.48)); p.addLine(to: pt(0.80, 1.00))
        p.addLine(to: pt(0.20, 1.00)); p.addLine(to: pt(0.20, 0.48)); p.addLine(to: pt(0.00, 0.48))
        p.closeSubpath()
        return p
    }
}

struct WCGameIntelView: View {
    let matchup: String                 // "Away @ Home"
    let confirmedXI: SwapMeta?
    let read: Signal?
    let edges: [Signal]
    var showHeader: Bool = true
    var onClose: (() -> Void)? = nil

    private enum XIState: String, CaseIterable { case projected = "Projected", contested = "Contested", confirmed = "Confirmed" }
    @State private var state: XIState = .confirmed

    private var awayName: String { matchup.components(separatedBy: " @ ").first ?? "Away" }
    private var homeName: String { matchup.components(separatedBy: " @ ").last ?? "Home" }

    private func players(from sheet: TeamSheet?, sample: [XIPlayer]) -> [XIPlayer] {
        if let xi = sheet?.xi, !xi.isEmpty {
            return xi.compactMap { m in
                guard let n = m.n else { return nil }
                return XIPlayer(num: m.num ?? 0, name: Self.surname(n), pos: (m.p ?? "M").uppercased())
            }
        }
        return sample
    }
    private var homePlayers: [XIPlayer] { players(from: confirmedXI?.home, sample: Self.homeSample) }
    private var awayPlayers: [XIPlayer] { players(from: confirmedXI?.away, sample: Self.awaySample) }
    private var homeFormation: String { confirmedXI?.home?.formation ?? "4-3-3" }
    private var awayFormation: String { confirmedXI?.away?.formation ?? "4-4-2" }
    private var hasRealXI: Bool { (confirmedXI?.home?.xi?.isEmpty == false) || (confirmedXI?.away?.xi?.isEmpty == false) }

    private var homeKit: (fill: Color, text: Color) { Self.kit(homeName) }
    private var awayKit: (fill: Color, text: Color) { Self.kit(awayName) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showHeader { header }
            stateTabs
            pitchCard
            theRead
            // Source Consensus card removed (Jun 18) — it had NO backend lane, so it
            // only rendered hardcoded sample desks ("Almoez Ali · 3 START / 2 BENCH"),
            // i.e. fake data. Restore with real data when the desk-lineup feed exists;
            // until then show nothing rather than something wrong.
            if !edges.isEmpty {
                EdgesSection(title: "MORE INTEL", edges: edges).padding(.top, 16)
            }
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .topTrailing) {
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold))
                        .foregroundStyle(WCI.ink3).frame(width: 34, height: 34)
                        .background(Circle().fill(WCI.chip))
                }
                .padding(.trailing, 14).padding(.top, 12)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Group · World Cup")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(WCI.gold).textCase(.uppercase)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(homeName).font(GaryFonts.text(26, .bold)).foregroundStyle(WCI.ink)
                Text("v").font(GaryFonts.text(16, .semibold)).foregroundStyle(WCI.ink4)
                Text(awayName).font(GaryFonts.text(26, .bold)).foregroundStyle(WCI.ink)
            }
            .lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 18).padding(.bottom, 2)
    }

    private var stateTabs: some View {
        HStack {
            ForEach(XIState.allCases, id: \.self) { s in
                Button { withAnimation(.easeInOut(duration: 0.2)) { state = s } } label: {
                    Text(s.rawValue)
                        .font(GaryFonts.text(16, state == s ? .bold : .medium))
                        .foregroundStyle(state == s ? WCI.ink : WCI.ink4)
                }
                .buttonStyle(.plain)
                if s != XIState.allCases.last { Spacer() }
            }
        }
        .padding(.horizontal, 22).padding(.top, 14)
    }

    private var pitchCard: some View {
        VStack(spacing: 8) {
            pitch
                .frame(height: 560)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.08)))
            if !hasRealXI {
                Text("Sample XIs — confirmed sheets post ~60 min before kickoff")
                    .font(GaryFonts.mono(9.5)).foregroundStyle(WCI.ink4)
            }
        }
        .padding(.horizontal, 14).padding(.top, 13)
    }

    private var pitch: some View {
        ZStack {
            GeometryReader { g in
                let band = g.size.height / 12
                ForEach(0..<12, id: \.self) { i in
                    Rectangle().fill(i % 2 == 0 ? WCI.pitch : WCI.pitch2)
                        .frame(height: band).offset(y: band * CGFloat(i))
                }
            }
            GeometryReader { g in
                let line = Color.white.opacity(0.16)
                RoundedRectangle(cornerRadius: 4).stroke(line, lineWidth: 1.5).padding(g.size.width * 0.03)
                Rectangle().fill(line).frame(height: 1).offset(y: g.size.height / 2)
                Circle().stroke(line, lineWidth: 1.5)
                    .frame(width: g.size.width * 0.26, height: g.size.width * 0.26)
                    .position(x: g.size.width / 2, y: g.size.height / 2)
            }
            VStack(spacing: 0) {
                lineRow(awayPlayers.filter { $0.pos == "G" }, kit: awayKit)
                lineRow(awayPlayers.filter { $0.pos == "D" }, kit: awayKit)
                lineRow(awayPlayers.filter { $0.pos == "M" }, kit: awayKit)
                lineRow(awayPlayers.filter { $0.pos == "F" }, kit: awayKit)
                lineRow(homePlayers.filter { $0.pos == "F" }, kit: homeKit)
                lineRow(homePlayers.filter { $0.pos == "M" }, kit: homeKit)
                lineRow(homePlayers.filter { $0.pos == "D" }, kit: homeKit)
                lineRow(homePlayers.filter { $0.pos == "G" }, kit: homeKit)
            }
            .padding(.vertical, 12).padding(.horizontal, 4)
            VStack {
                teamTag(awayName, awayFormation, awayKit.fill)
                Spacer()
                teamTag(homeName, homeFormation, homeKit.fill)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func teamTag(_ name: String, _ formation: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(name.uppercased()).font(GaryFonts.mono(10, bold: true)).foregroundStyle(.white)
            Text(formation).font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.6))
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Capsule().fill(Color.black.opacity(0.35)))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func lineRow(_ men: [XIPlayer], kit: (fill: Color, text: Color)) -> some View {
        if men.isEmpty {
            Color.clear.frame(maxWidth: .infinity).frame(height: 0)
        } else {
            HStack(spacing: 0) {
                ForEach(men) { m in jersey(m, kit: kit).frame(maxWidth: .infinity) }
            }
            .frame(maxHeight: .infinity)
        }
    }

    private func jersey(_ m: XIPlayer, kit: (fill: Color, text: Color)) -> some View {
        let contested = m.contested && state != .confirmed
        let fill = m.pos == "G" ? WCI.gkKit : kit.fill
        let textColor = m.pos == "G" ? Color.white : kit.text
        return VStack(spacing: 3) {
            ZStack {
                JerseyShape().fill(fill)
                    .frame(width: 38, height: 34)
                    .overlay(
                        contested
                        ? RoundedRectangle(cornerRadius: 7).stroke(WCI.amber, style: StrokeStyle(lineWidth: 2, dash: [3, 2])).padding(-3)
                        : nil
                    )
                Text("\(m.num)").font(GaryFonts.mono(13, bold: true)).foregroundStyle(textColor).offset(y: 3)
                if contested {
                    Text("3/5").font(GaryFonts.mono(8, bold: true)).foregroundStyle(.white)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(Capsule().fill(WCI.amber)).offset(y: -23)
                }
            }
            Text(m.name).font(GaryFonts.text(9.5, .bold)).foregroundStyle(.white)
                .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
    }

    private var theRead: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The Read").font(GaryFonts.mono(10.5, bold: true)).tracking(1.4)
                .foregroundStyle(WCI.gold).textCase(.uppercase)
            if let read {
                Text(read.headline).font(GaryFonts.text(15, .semibold)).foregroundStyle(WCI.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !read.detail.isEmpty {
                    Text(read.detail).font(GaryFonts.text(13, .regular)).foregroundStyle(WCI.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !read.value.isEmpty {
                    Text(read.value).font(GaryFonts.text(17, .bold)).foregroundStyle(WCI.gold).padding(.top, 2)
                }
            } else {
                Text("Read posts with the confirmed lineup.")
                    .font(GaryFonts.text(14, .regular)).foregroundStyle(WCI.ink3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18).padding(.top, 18)
    }


    // MARK: helpers
    private static func surname(_ full: String) -> String {
        let parts = full.split(separator: " ")
        guard parts.count > 1, let last = parts.last else { return full }
        return last.count >= 3 ? String(last) : full
    }

    /// National-team primary kit colour (fill) + a readable number/text colour for it.
    private static func kit(_ team: String) -> (fill: Color, text: Color) {
        let t = team.lowercased()
        let map: [(String, String)] = [
            ("qatar", "#8A1538"), ("czech", "#D7141A"), ("south africa", "#0E8A4E"),
            ("canada", "#C8102E"), ("united states", "#1B3A8B"), ("usa", "#1B3A8B"),
            ("mexico", "#0B6E4F"), ("brazil", "#1E7A3C"), ("argentina", "#5FA9DD"),
            ("france", "#1B2A6B"), ("spain", "#C60B1E"), ("england", "#1A2A55"),
            ("germany", "#2A2A2A"), ("portugal", "#7A1F2B"), ("netherlands", "#E06B00"),
            ("belgium", "#C8102E"), ("croatia", "#D7141A"), ("uruguay", "#4AA9E0"),
            ("switzerland", "#D52B1E"), ("bosnia", "#1B458F"), ("japan", "#1B2A6B"),
            ("senegal", "#1E8A45"), ("uzbekistan", "#2E7D55"), ("colombia", "#1B3A8B"),
            ("dr congo", "#1B7A3D"), ("congo", "#1B7A3D"), ("saudi", "#0A6B3B"),
            ("cape verde", "#1B3A8B"), ("korea", "#C8102E"), ("australia", "#0E8A4E"),
            ("morocco", "#C1272D"), ("ghana", "#C8102E"), ("nigeria", "#0E8A4E"),
            ("italy", "#1B2A6B"), ("ecuador", "#1B3A8B"), ("poland", "#C8102E")
        ]
        let hex = map.first { t.contains($0.0) }?.1
        let fill = hex.map { Color(hex: $0) } ?? WCI.neutralKit
        let text = (hex.map { isLight($0) } ?? false) ? Color(hex: "#1A1A1A") : Color.white
        return (fill, text)
    }

    private static func isLight(_ hex: String) -> Bool {
        let h = hex.replacingOccurrences(of: "#", with: "")
        guard h.count == 6, let v = Int(h, radix: 16) else { return false }
        let r = Double((v >> 16) & 0xff), g = Double((v >> 8) & 0xff), b = Double(v & 0xff)
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150
    }

    // Labelled sample XIs — shown ONLY when no confirmed sheet exists yet (the pitchCard
    // prints "Sample XIs…" beneath). Numbers/names/formation are real-from-API otherwise.
    private static let homeSample: [XIPlayer] = [
        XIPlayer(num: 1, name: "Barsham", pos: "G"),
        XIPlayer(num: 2, name: "Miguel", pos: "D"), XIPlayer(num: 15, name: "Khoukhi", pos: "D"),
        XIPlayer(num: 5, name: "Hassan", pos: "D"), XIPlayer(num: 3, name: "Homam", pos: "D"),
        XIPlayer(num: 12, name: "Madibo", pos: "M"), XIPlayer(num: 8, name: "Hatim", pos: "M"),
        XIPlayer(num: 23, name: "Boudiaf", pos: "M"),
        XIPlayer(num: 11, name: "Afif", pos: "F"),
        XIPlayer(num: 19, name: "Ali", pos: "F", contested: true),
        XIPlayer(num: 10, name: "Edmilson", pos: "F"),
    ]
    private static let awaySample: [XIPlayer] = [
        XIPlayer(num: 1, name: "Keeper", pos: "G"),
        XIPlayer(num: 2, name: "Coetzee", pos: "D"), XIPlayer(num: 4, name: "Mbatha", pos: "D"),
        XIPlayer(num: 5, name: "Dlamini", pos: "D"), XIPlayer(num: 3, name: "Naidoo", pos: "D"),
        XIPlayer(num: 6, name: "Zulu", pos: "M"), XIPlayer(num: 8, name: "Pretorius", pos: "M"),
        XIPlayer(num: 10, name: "Mokoena", pos: "M"), XIPlayer(num: 7, name: "Nkosi", pos: "M"),
        XIPlayer(num: 9, name: "Sithole", pos: "F"), XIPlayer(num: 11, name: "Botha", pos: "F"),
    ]
}
