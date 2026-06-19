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
    // Keepers wear their own kit — distinct from both teams AND from each other
    // (real-soccer style): home keeper amber, away keeper teal.
    static let gkHome: (fill: Color, text: Color) = (Color(hex: "#F2A93B"), Color(hex: "#16130E"))
    static let gkAway: (fill: Color, text: Color) = (Color(hex: "#33BFA6"), Color.white)
    static let neutralKit = "#5B6CB8"            // fallback hex for an unlisted nation
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

    private enum XIState: String, CaseIterable { case projected = "Projected", confirmed = "Confirmed" }
    @State private var state: XIState = .projected

    private var awayName: String { matchup.components(separatedBy: " @ ").first ?? "Away" }
    private var homeName: String { matchup.components(separatedBy: " @ ").last ?? "Home" }

    private func players(from sheet: TeamSheet?, sample: [XIPlayer]) -> [XIPlayer] {
        if let xi = sheet?.xi, !xi.isEmpty {
            return xi.compactMap { m in
                guard let n = m.n else { return nil }
                return XIPlayer(num: m.num ?? 0, name: Self.surname(n), pos: (m.p ?? "M").uppercased())
            }
        }
        return []   // no real XI yet → empty pitch + a Projected placeholder, NEVER mock players (user call, Jun 19)
    }
    private var homePlayers: [XIPlayer] { players(from: confirmedXI?.home, sample: Self.homeSample) }
    private var awayPlayers: [XIPlayer] { players(from: confirmedXI?.away, sample: Self.awaySample) }
    private var homeFormation: String { confirmedXI?.home?.formation ?? "4-3-3" }
    private var awayFormation: String { confirmedXI?.away?.formation ?? "4-4-2" }
    private var hasRealXI: Bool { (confirmedXI?.home?.xi?.isEmpty == false) || (confirmedXI?.away?.xi?.isEmpty == false) }

    // Resolved together so a colour clash (both nations similar) flips the HOME
    // side to white-with-a-hint while the away side keeps its colour.
    private var kits: (home: (fill: Color, text: Color), away: (fill: Color, text: Color)) {
        Self.resolvedKits(home: homeName, away: awayName)
    }
    private var homeKit: (fill: Color, text: Color) { kits.home }
    private var awayKit: (fill: Color, text: Color) { kits.away }

    /// Pitch rows top→bottom for each side, driven by the real formation string
    /// ("4-2-3-1" → 4/2/3/1) with a role-stack fallback when counts don't match.
    private var awayRows: [[XIPlayer]] {
        let gk = awayPlayers.filter { $0.pos == "G" }
        return ([gk] + Self.formationLines(awayPlayers, awayFormation)).filter { !$0.isEmpty }
    }
    private var homeRows: [[XIPlayer]] {
        let gk = homePlayers.filter { $0.pos == "G" }
        return (Array(Self.formationLines(homePlayers, homeFormation).reversed()) + [gk]).filter { !$0.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showHeader { header }
            stateTabs
            pitchCard
            // THE READ removed (Jun 19, founder) — redundant with the MORE INTEL modules
            // below; the dashboard already carries the read.
            // Source Consensus card removed (Jun 18) — it had NO backend lane, so it
            // only rendered hardcoded sample desks ("Almoez Ali · 3 START / 2 BENCH"),
            // i.e. fake data. Restore with real data when the desk-lineup feed exists;
            // until then show nothing rather than something wrong.
            if !edges.isEmpty {
                EdgesSection(title: "MORE INTEL", edges: edges).padding(.top, 16)
            }
        }
        .padding(.top, showHeader ? 14 : 0).padding(.bottom, 14)
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
        // Open on the real status tab — Projected / Contested (injury doubt) / Confirmed.
        .onAppear { state = XIState(rawValue: (confirmedXI?.status ?? "").capitalized) ?? .projected }
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
        VStack(alignment: .leading, spacing: 8) {
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
            // Pre-confirmation → name any game-time doubt(s) in the projected XI (e.g. Pulisic's calf).
            if state == .projected, let d = confirmedXI?.doubts, !d.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 10)).foregroundStyle(WCI.gold)
                    Text("\(d.joined(separator: ", ")) — game-time decision")
                        .font(GaryFonts.mono(10.5)).foregroundStyle(WCI.ink2).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
        }
        .padding(.horizontal, 22).padding(.top, showHeader ? 14 : 2)
    }

    private var pitchCard: some View {
        VStack(spacing: 8) {
            pitch
                .frame(height: 560)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.08)))
                .overlay {
                    if !hasRealXI {
                        VStack(spacing: 6) {
                            Text("PROJECTED").font(GaryFonts.mono(13, bold: true)).tracking(2.5).foregroundStyle(WCI.gold)
                            Text("Confirmed XI posts ~60 min before kickoff").font(GaryFonts.mono(10)).foregroundStyle(WCI.ink3)
                        }
                        .padding(.horizontal, 22).padding(.vertical, 16)
                        .background(RoundedRectangle(cornerRadius: 12).fill(.black.opacity(0.5)))
                    }
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
                // Away attacks downward: keeper on top, real formation lines back→front.
                ForEach(Array(awayRows.enumerated()), id: \.offset) { _, row in
                    lineRow(row, kit: awayKit, gk: WCI.gkAway)
                }
                // Home attacks upward: formation lines front→back, keeper on the bottom.
                ForEach(Array(homeRows.enumerated()), id: \.offset) { _, row in
                    lineRow(row, kit: homeKit, gk: WCI.gkHome)
                }
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

    @ViewBuilder private func lineRow(_ men: [XIPlayer], kit: (fill: Color, text: Color), gk: (fill: Color, text: Color)) -> some View {
        if men.isEmpty {
            Color.clear.frame(maxWidth: .infinity).frame(height: 0)
        } else {
            HStack(spacing: 0) {
                ForEach(men) { m in jersey(m, kit: kit, gk: gk).frame(maxWidth: .infinity) }
            }
            .frame(maxHeight: .infinity)
        }
    }

    private func jersey(_ m: XIPlayer, kit: (fill: Color, text: Color), gk: (fill: Color, text: Color)) -> some View {
        let contested = m.contested && state != .confirmed
        let fill = m.pos == "G" ? gk.fill : kit.fill
        let textColor = m.pos == "G" ? gk.text : kit.text
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

    /// Split a "4-2-3-1"-style string into line counts. nil if unparseable.
    private static func parseFormation(_ f: String?) -> [Int]? {
        guard let f = f?.trimmingCharacters(in: .whitespacesAndNewlines), !f.isEmpty else { return nil }
        let nums = f.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }
        return nums.count >= 2 ? nums : nil
    }

    /// Outfield players grouped into the team's real formation lines (back→front).
    /// Uses the formation string + XI order; falls back to D/M/F role-stacking when
    /// the counts don't add up (e.g. partial/odd data).
    private static func formationLines(_ players: [XIPlayer], _ formation: String) -> [[XIPlayer]] {
        let outfield = players.filter { $0.pos != "G" }
        if let counts = parseFormation(formation), !counts.isEmpty, counts.reduce(0, +) == outfield.count {
            var rows: [[XIPlayer]] = []
            var i = 0
            for c in counts { rows.append(Array(outfield[i..<(i + c)])); i += c }
            return rows
        }
        return [outfield.filter { $0.pos == "D" },
                outfield.filter { $0.pos == "M" },
                outfield.filter { $0.pos == "F" }].filter { !$0.isEmpty }
    }

    /// National-team primary home kit colour as hex (comprehensive WC map).
    private static func kitHex(_ team: String) -> String {
        let t = team.lowercased()
        let map: [(String, String)] = [
            // CONMEBOL
            ("brazil", "#FFD400"), ("argentina", "#79A8DA"), ("uruguay", "#58A6D6"),
            ("paraguay", "#D7141A"), ("colombia", "#FCD116"), ("ecuador", "#FFD100"),
            ("peru", "#D7141A"), ("chile", "#1B3A8B"), ("venezuela", "#7A1F2B"),
            ("bolivia", "#1E7A3C"),
            // CONCACAF
            ("united states", "#1A2B5E"), ("usa", "#1A2B5E"), ("mexico", "#057A55"),
            ("canada", "#D80621"), ("costa rica", "#C8102E"), ("panama", "#C8102E"),
            ("honduras", "#1B3A8B"), ("jamaica", "#F4C430"), ("haiti", "#1B2A8B"),
            // UEFA
            ("france", "#1A2A6C"), ("spain", "#C60B1E"), ("england", "#1A2A55"),
            ("germany", "#2B2B2B"), ("portugal", "#C8102E"), ("netherlands", "#EC6B1E"),
            ("belgium", "#C8102E"), ("croatia", "#C8102E"), ("italy", "#1B3DA8"),
            ("switzerland", "#D52B1E"), ("türkiye", "#E30A17"), ("turkiye", "#E30A17"),
            ("turkey", "#E30A17"), ("poland", "#C8102E"), ("denmark", "#C60C30"),
            ("norway", "#BA0C2F"), ("sweden", "#F7D117"), ("scotland", "#0B4DA1"),
            ("wales", "#C8102E"), ("austria", "#C8102E"), ("serbia", "#C6363C"),
            ("ukraine", "#FFD500"),
            // AFC
            ("japan", "#0B2265"), ("south korea", "#C8102E"), ("korea", "#C8102E"),
            ("saudi", "#0A6B3B"), ("iran", "#1E7A3C"), ("australia", "#F4C430"),
            ("iraq", "#1E7A3C"), ("uzbekistan", "#1E8A55"), ("qatar", "#8A1538"),
            ("jordan", "#C8102E"),
            // CAF
            ("morocco", "#C1272D"), ("senegal", "#1E8A45"), ("tunisia", "#E70013"),
            ("algeria", "#1B7A3D"), ("egypt", "#C8102E"), ("ghana", "#CE1126"),
            ("nigeria", "#0E8A4E"), ("cameroon", "#1B7A3D"), ("ivory", "#EC6B1E"),
            ("côte", "#EC6B1E"), ("mali", "#1E8A45"), ("south africa", "#0E8A4E"),
            ("dr congo", "#1B7A3D"), ("congo", "#1B7A3D"), ("cape verde", "#1B3A8B"),
            // OFC
            ("new zealand", "#E6E6E6"),
        ]
        return map.first { t.contains($0.0) }?.1 ?? WCI.neutralKit
    }

    /// (fill, readable number/text colour) from a hex.
    private static func kitFrom(_ hex: String) -> (fill: Color, text: Color) {
        (Color(hex: hex), isLight(hex) ? Color(hex: "#16130E") : Color.white)
    }

    /// Resolve both sides. If the two nations' colours are too close, flip the
    /// HOME team to white-with-a-hint-of-its-colour (real-soccer change strip);
    /// the away team keeps its colour.
    private static func resolvedKits(home: String, away: String) -> (home: (fill: Color, text: Color), away: (fill: Color, text: Color)) {
        let homeHex = kitHex(home)
        let awayHex = kitHex(away)
        let homeFinal = colorDistance(homeHex, awayHex) < 115 ? whiteHintHex(homeHex) : homeHex
        return (kitFrom(homeFinal), kitFrom(awayHex))
    }

    private static func rgb(_ hex: String) -> (Double, Double, Double) {
        let h = hex.replacingOccurrences(of: "#", with: "")
        guard h.count == 6, let v = Int(h, radix: 16) else { return (90, 90, 90) }
        return (Double((v >> 16) & 0xff), Double((v >> 8) & 0xff), Double(v & 0xff))
    }
    private static func colorDistance(_ a: String, _ b: String) -> Double {
        let (r1, g1, b1) = rgb(a)
        let (r2, g2, b2) = rgb(b)
        return (((r1 - r2) * (r1 - r2)) + ((g1 - g2) * (g1 - g2)) + ((b1 - b2) * (b1 - b2))).squareRoot()
    }
    /// ~82% white + 18% the team colour → a near-white change strip with a hint.
    private static func whiteHintHex(_ hex: String) -> String {
        let (r, g, b) = rgb(hex)
        let mix: (Double) -> Int = { c in Int((255 * 0.82 + c * 0.18).rounded()) }
        return String(format: "#%02X%02X%02X", mix(r), mix(g), mix(b))
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
