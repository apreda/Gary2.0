import SwiftUI

// MLB GAME INTEL — the MLB analog of WCGameIntelView, matched to that layout (header →
// state tabs → field → The Read → modules). The field is the home team's REAL ballpark,
// drawn from MLBAM contour data (MLBBallparks.swift) on the shared MLBBounds transform.
// Players are a baseball CAP (form: hot/cold) + JERSEY (home team colour); HR-park-edge and
// platoon-edge ride as small symbols; a live WIND/WEATHER layer (carry zone + arrow) sits
// on the field. Tap a player → the jersey FLIPS to its stats (Season / vs RHP / vs the
// starter), with batting order, splits and the matchup vs tonight's arm.
//
// Lineup + weather are a labelled sample until the confirmed-lineup / weather feeds wire in
// (no batting order / probable pitcher on the matchup edges yet). Park + colours ARE real.

private enum MLBI {
    static let ink = Color.white
    static let ink2 = Color.white.opacity(0.72)
    static let ink3 = Color.white.opacity(0.5)
    static let ink4 = Color.white.opacity(0.38)
    static let gold = GaryColors.gold
    static let grass = Color(hex: "#3A7531")
    static let dirt = Color(hex: "#A8683A")
    static let wall = Color(hex: "#13301A")
    static let base = Color(hex: "#bd8053")
    static let hot = Color(hex: "#E8643C")
    static let cold = Color(hex: "#54A9E8")
    static let steady = Color(hex: "#C9CFC9")
    static let plat = GaryColors.win                       // platoon edge = the brand's positive green
    // Brand panel chrome — warm-white tint (quantPanel), NOT cool Color.white (AI-slop cast).
    static let chip = GaryColors.warmWhite.opacity(0.05)
    static let panel = GaryColors.warmWhite.opacity(0.028)
    static let line = GaryColors.warmWhite.opacity(0.075)
}

private struct MLBFielder: Identifiable {
    let id = UUID()
    let num: Int, name: String, pos: String
    var playerId = ""                // player_id for the insight-card fetch (carousel)
    let dx: CGFloat, dy: CGFloat
    let heat: String                 // hot / cold / steady
    let bats: String                 // L / R / S
    var hr = false                   // HR park edge tonight
    var plat = false                 // favourable platoon vs the starter
    var sp = false
    var fillIn = false               // fill-in starter (a regular is resting/out) — Contested
    // numbers (revealed on flip)
    var ord = 0, wrc = 0
    var xwoba = "", vR = "", vL = "", form = ""
    var bvpAB = 0, bvpH = 0, bvpHR = 0, bvpOPS = ""
}

private struct MLBWeather {
    let temp: Int, windMph: Int, dir: String, roofOpen: Bool, helps: Bool
    // carry-zone centre in data space + wind-arrow start/end
    let carry: CGPoint, windFrom: CGPoint, windTo: CGPoint
}

// Shared data→view transform.
private struct FieldT {
    let scale, ox, oy: CGFloat
    func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + (x - MLBBounds.minX) * scale, y: oy + (y - MLBBounds.minY) * scale) }
    func map(_ p: CGPoint) -> CGPoint { map(p.x, p.y) }
}
private func fieldT(_ size: CGSize) -> FieldT {
    let s = min(size.width / MLBBounds.w, size.height / MLBBounds.h)
    return FieldT(scale: s, ox: (size.width - MLBBounds.w * s) / 2, oy: (size.height - MLBBounds.h * s) / 2)
}

// Baseball jersey — ported from the mock the founder liked: rounded collar, angled
// short sleeves, a body that tapers. (Coords are the mock's SHIRT path / 60.)
private struct MLBJerseyShape: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        func p(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint { CGPoint(x: r.minX + fx * w, y: r.minY + fy * h) }
        var path = Path()
        path.move(to: p(0.500, 0.083))
        path.addCurve(to: p(0.350, 0.150), control1: p(0.450, 0.083), control2: p(0.417, 0.150))
        path.addLine(to: p(0.150, 0.217))   // left shoulder
        path.addLine(to: p(0.067, 0.417))   // left sleeve tip
        path.addLine(to: p(0.217, 0.467))   // left underarm
        path.addLine(to: p(0.250, 0.917))   // body left
        path.addLine(to: p(0.750, 0.917))   // body right
        path.addLine(to: p(0.783, 0.467))   // right underarm
        path.addLine(to: p(0.933, 0.417))   // right sleeve tip
        path.addLine(to: p(0.850, 0.217))   // right shoulder
        path.addLine(to: p(0.650, 0.150))   // collar right
        path.addCurve(to: p(0.500, 0.083), control1: p(0.583, 0.150), control2: p(0.550, 0.083))
        path.closeSubpath()
        return path
    }
}

// New Era 59FIFTY — a tall structured crown + a FLAT forward brim.
private struct MLBCapCrown: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        func p(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint { CGPoint(x: r.minX + fx * w, y: r.minY + fy * h) }
        var path = Path()
        path.move(to: p(0.20, 0.66))
        path.addCurve(to: p(0.80, 0.66), control1: p(0.20, 0.00), control2: p(0.80, 0.00))   // tall structured crown
        path.addLine(to: p(0.20, 0.66))
        path.closeSubpath()
        return path
    }
}
private struct MLBCapBrim: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        func p(_ fx: CGFloat, _ fy: CGFloat) -> CGPoint { CGPoint(x: r.minX + fx * w, y: r.minY + fy * h) }
        var path = Path()
        path.move(to: p(0.14, 0.64))         // flat brim — wide, straight front edge
        path.addLine(to: p(0.86, 0.64))
        path.addLine(to: p(0.78, 0.80))
        path.addLine(to: p(0.22, 0.80))
        path.closeSubpath()
        return path
    }
}

struct MLBGameIntelView: View {
    let matchup: String
    let edges: [Signal]
    var read: Signal? = nil
    var showHeader: Bool = true
    var onClose: (() -> Void)? = nil

    private enum LineupState: String, CaseIterable { case projected = "Projected", confirmed = "Confirmed" }
    @State private var state: LineupState = .projected
    @State private var selected: MLBFielder? = nil
    @State private var showWeather = false
    @State private var realHome: SupabaseAPI.MLBTeamLineup? = nil
    @State private var realAway: SupabaseAPI.MLBTeamLineup? = nil
    @State private var homeUp = true
    @State private var lineupLoaded = false

    private var awayName: String { matchup.components(separatedBy: " @ ").first ?? "Away" }
    private var homeName: String { matchup.components(separatedBy: " @ ").last ?? "Home" }
    private var ballpark: Ballpark? { MLBParks.park(forTeam: homeName) ?? MLBParks.all["brewers"] }
    /// The team whose lineup is on the field — both bat at the home park (home/away toggle).
    private var shownTeam: SupabaseAPI.MLBTeamLineup? { homeUp ? realHome : realAway }

    private func module(_ kinds: Set<SignalKind>) -> [Signal] { edges.filter { kinds.contains($0.kind) } }
    private var pitchingEdges: [Signal] { module([.starterForm, .firstInning, .runningGame]) }
    private var batsEdges: [Signal] { module([.hot, .cold, .platoon, .regression, .hrThreat, .h2h, .streak]) }
    private var parkEdges: [Signal] { module([.parkWeather, .ballpark]) }
    private var otherEdges: [Signal] {
        let claimed: Set<SignalKind> = [.starterForm, .firstInning, .runningGame, .hot, .cold, .platoon, .regression, .hrThreat, .h2h, .streak, .parkWeather, .ballpark]
        return edges.filter { !claimed.contains($0.kind) }
    }

    private func playerEdges(_ name: String) -> [Signal] {
        edges.filter { $0.headline.localizedCaseInsensitiveContains(name) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showHeader { header }
            stateTabs
            fieldCard
            // THE READ removed (Jun 19, founder) — redundant with the modules below.
            if !pitchingEdges.isEmpty { EdgesSection(title: "PITCHING", edges: pitchingEdges).padding(.top, 8) }
            if !batsEdges.isEmpty     { EdgesSection(title: "BATS", edges: batsEdges).padding(.top, 8) }
            if !parkEdges.isEmpty     { EdgesSection(title: "PARK & WEATHER", edges: parkEdges).padding(.top, 8) }
            if !otherEdges.isEmpty    { EdgesSection(title: "MORE INTEL", edges: otherEdges).padding(.top, 8) }
        }
        .padding(.top, showHeader ? 14 : 0).padding(.bottom, 14)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .topTrailing) {
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold))
                        .foregroundStyle(MLBI.ink3).frame(width: 34, height: 34).background(Circle().fill(MLBI.chip))
                }.padding(.trailing, 14).padding(.top, 12)
            }
        }
        .fullScreenCover(item: $selected) { f in
            // Centered popup carousel — swipe through the team's lineup like a pack of cards.
            // .presentationBackground(.clear) lets the dimmed page show through (iOS 16.4+).
            let carousel = PlayerCardCarousel(
                players: displayLineup.map { CarouselPlayer(id: $0.playerId, name: $0.name, heat: $0.heat, game: matchup.uppercased()) },
                index: displayLineup.firstIndex(where: { $0.name == f.name }) ?? 0,
                onClose: { selected = nil }
            )
            if #available(iOS 16.4, *) { carousel.presentationBackground(.clear) } else { carousel }
        }
        .sheet(isPresented: $showWeather) { weatherSheet.presentationDetents([.medium]) }
        .task { await loadRealLineup() }
    }

    // Resolve the home team to its BDL abbreviation and pull the day's real field lineup.
    private func loadRealLineup() async {
        guard !lineupLoaded else { return }
        lineupLoaded = true
        let n = homeName.lowercased()
        guard let abbr = mlbTeamKeywords.first(where: { $0.value.contains { n.contains($0) } })?.key else { return }
        if let row = await SupabaseAPI.fetchMlbFieldLineup(date: SupabaseAPI.todayEST(), homeTeam: abbr) {
            await MainActor.run {
                realHome = row.payload.home
                realAway = row.payload.away
                // Real status from the builder — BDL posts the confirmed sheet pre-game.
                state = (row.status == "confirmed") ? .confirmed : .projected
            }
        }
    }

    private static let posCoord: [String: (CGFloat, CGFloat)] = [
        "CF": (125, 60), "LF": (70, 92), "RF": (180, 92),
        "SS": (98, 138), "2B": (152, 138), "3B": (80, 168), "1B": (170, 168),
        "P": (125, 176), "C": (125, 214), "DH": (40, 214),
    ]

    private static func surname(_ full: String) -> String {
        let parts = full.split(separator: " "); return parts.count > 1 ? String(parts.last!) : full
    }

    /// The opposing starter the home batters face (real), for the read + the flip label.
    private var facingPitcherName: String { shownTeam?.facingPitcher?.name.map(Self.surname) ?? "the SP" }

    /// Real lineup mapped onto the field — empty (placeholder) until it posts. Never mock.
    private var displayLineup: [MLBFielder] {
        guard let h = shownTeam else { return [] }
        var out: [MLBFielder] = []
        for f in h.fielders {
            guard let pos = f.pos, let c = Self.posCoord[pos] else { continue }
            out.append(MLBFielder(num: f.order ?? 0, name: Self.surname(f.name ?? ""), pos: pos, playerId: f.playerId ?? "", dx: c.0, dy: c.1,
                heat: f.heat ?? "steady", bats: f.bats ?? "", hr: f.hrEdge ?? false, plat: f.plat ?? false,
                fillIn: f.fillIn ?? false, ord: f.order ?? 0, vR: f.ops ?? ""))
        }
        if let p = h.pitcher, let c = Self.posCoord["P"] {
            out.append(MLBFielder(num: 0, name: Self.surname(p.name ?? ""), pos: "P", playerId: p.playerId ?? "", dx: c.0, dy: c.1, heat: "steady", bats: "", sp: true))
        }
        return out
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(ballpark?.park ?? "MLB · Game Intel").font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(MLBI.gold).textCase(.uppercase).lineLimit(1).minimumScaleFactor(0.7)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(awayName).font(GaryFonts.text(26, .bold)).foregroundStyle(MLBI.ink)
                Text("@").font(GaryFonts.text(16, .semibold)).foregroundStyle(MLBI.ink4)
                Text(homeName).font(GaryFonts.text(26, .bold)).foregroundStyle(MLBI.ink)
            }.lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 18).padding(.bottom, 2)
    }

    private var stateTabs: some View {
        HStack {
            ForEach(LineupState.allCases, id: \.self) { s in
                Button { withAnimation(.easeInOut(duration: 0.2)) { state = s } } label: {
                    Text(s.rawValue).font(GaryFonts.text(16, state == s ? .bold : .medium))
                        .foregroundStyle(state == s ? MLBI.ink : MLBI.ink4)
                }.buttonStyle(.plain)
                if s != LineupState.allCases.last { Spacer() }
            }
            Spacer()
            Button { showWeather = true } label: { weatherChip }.buttonStyle(.plain)
        }
        .padding(.horizontal, 22).padding(.top, showHeader ? 14 : 2)
    }

    private var weatherChip: some View {
        HStack(spacing: 5) {
            Image(systemName: "wind").font(.system(size: 10, weight: .bold)).foregroundStyle(MLBI.gold)
            Text("\(Self.weather.windMph) \(Self.weather.dir)").font(GaryFonts.mono(10, bold: true)).foregroundStyle(MLBI.ink2)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Capsule().fill(MLBI.panel).overlay(Capsule().stroke(MLBI.line, lineWidth: 1)))
    }

    private var fieldCard: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                let t = fieldT(geo.size)
                ZStack {
                    Canvas { ctx, size in drawField(ctx, fieldT(size)) }
                    ForEach(displayLineup) { f in
                        Group {
                            if f.sp { token(f) }
                            else { Button { selected = f } label: { token(f) }.buttonStyle(.plain) }
                        }
                        .position(t.map(f.dx, f.dy))
                    }
                    if displayLineup.isEmpty {
                        VStack(spacing: 6) {
                            Text("LINEUP PENDING")
                                .font(GaryFonts.mono(14, bold: true)).tracking(3).foregroundStyle(MLBI.gold)
                            Text("Posts ~2–3h before first pitch")
                                .font(GaryFonts.mono(10)).foregroundStyle(MLBI.ink3)
                        }
                        .padding(.vertical, 18).padding(.horizontal, 26)
                        .background(RoundedRectangle(cornerRadius: 14).fill(GaryColors.cardBg.opacity(0.82)))
                    }
                }
                // Team toggle floats at the top of the field, above center field (user ask).
                .overlay(alignment: .top) {
                    if realHome != nil && realAway != nil { teamToggle.padding(.top, 12) }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(GaryColors.warmWhite.opacity(0.09)))
            }
            .frame(height: 452)
            HStack(spacing: 11) {
                legendDot(MLBI.hot, "Hot"); legendDot(MLBI.cold, "Cold")
                legendDot(MLBI.gold, "HR"); legendDot(MLBI.plat, "Platoon")
                HStack(spacing: 4) {
                    Circle().stroke(MLBI.gold, style: StrokeStyle(lineWidth: 1.5, dash: [2, 1.5])).frame(width: 9, height: 9)
                    Text("Fill-in").font(GaryFonts.mono(9)).foregroundStyle(MLBI.ink4)
                }
                Spacer()
            }.padding(.horizontal, 4)
        }
        .padding(.horizontal, 14).padding(.top, 12)
    }

    private func legendDot(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Circle().fill(c).frame(width: 8, height: 8); Text(t).font(GaryFonts.mono(9)).foregroundStyle(MLBI.ink4) }
    }

    // Away / Home lineup switch — the road team bats at the home park too.
    private var teamToggle: some View {
        // No bubble — the gold/dim font color alone marks the selected side (user ask).
        HStack(spacing: 16) {
            ForEach([false, true], id: \.self) { isHome in
                Button { withAnimation(.easeInOut(duration: 0.18)) { homeUp = isHome } } label: {
                    Text(Formatters.shortTeamName(isHome ? homeName : awayName, league: "MLB").uppercased())
                        .font(GaryFonts.mono(12, bold: true)).tracking(1.6)
                        .foregroundStyle(homeUp == isHome ? MLBI.gold : MLBI.ink4)
                        .shadow(color: .black.opacity(0.7), radius: 3, y: 1)
                }.buttonStyle(.plain)
            }
        }
    }

    private func drawField(_ ctx: GraphicsContext, _ t: FieldT) {
        guard let bp = ballpark else { return }
        ctx.fill(Path(CGRect(x: 0, y: 0, width: 10000, height: 10000)), with: .color(GaryColors.cardBg))
        var grass = Path(); grass.move(to: t.map(bp.homePlate))
        bp.wall.forEach { grass.addLine(to: t.map($0)) }; grass.closeSubpath()
        ctx.fill(grass, with: .color(MLBI.grass))
        if let f = bp.infield.first {
            var inf = Path(); inf.move(to: t.map(f)); bp.infield.dropFirst().forEach { inf.addLine(to: t.map($0)) }; inf.closeSubpath()
            ctx.fill(inf, with: .color(MLBI.dirt))
        }
        // wind carry zone (radial warm glow over where the wind helps)
        let c = t.map(Self.weather.carry)
        let rad = 80 * t.scale / 1.0
        ctx.fill(Path(ellipseIn: CGRect(x: c.x - rad, y: c.y - rad, width: rad * 2, height: rad * 2)),
                 with: .radialGradient(Gradient(colors: [MLBI.hot.opacity(0.28), MLBI.hot.opacity(0)]), center: c, startRadius: 0, endRadius: rad))
        if let f = bp.foul.first {
            var fl = Path(); fl.move(to: t.map(f)); bp.foul.dropFirst().forEach { fl.addLine(to: t.map($0)) }
            ctx.stroke(fl, with: .color(Color.white.opacity(0.5)), lineWidth: 1)
        }
        if let f = bp.wall.first {
            var wl = Path(); wl.move(to: t.map(f)); bp.wall.dropFirst().forEach { wl.addLine(to: t.map($0)) }
            ctx.stroke(wl, with: .color(MLBI.wall), lineWidth: 2)
        }
        for (bx, by) in [(154.0, 172.0), (125.0, 142.0), (96.0, 172.0)] {
            let p = t.map(CGFloat(bx), CGFloat(by))
            var sq = Path(CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8))
            sq = sq.applying(CGAffineTransform(translationX: p.x, y: p.y).rotated(by: .pi / 4).translatedBy(x: -p.x, y: -p.y))
            ctx.fill(sq, with: .color(.white))
        }
        let m = t.map(125, 176)
        ctx.fill(Path(ellipseIn: CGRect(x: m.x - 5, y: m.y - 5, width: 10, height: 10)), with: .color(MLBI.base))
        // (wind-direction arrow removed — founder call; the carry-zone glow + wind chip stay)
    }

    private func token(_ f: MLBFielder) -> some View {
        let jersey = ballpark?.jersey ?? Color(hex: "#12284B")
        let textC = ballpark?.text ?? Color.white
        let cap = heatColor(f.heat)
        return VStack(spacing: 1) {
            ZStack {
                // Contested — a fill-in starter (the usual regular is resting/out): a dashed gold ring.
                if f.fillIn {
                    Circle().stroke(MLBI.gold, style: StrokeStyle(lineWidth: 2, dash: [3.5, 2.5]))
                        .frame(width: 52, height: 52).offset(y: -7)
                }
                // jersey
                MLBJerseyShape().fill(jersey).frame(width: 40, height: 38)
                    .overlay(MLBJerseyShape().stroke(.black.opacity(0.35), lineWidth: 0.8).frame(width: 40, height: 38))
                Rectangle().fill(textC.opacity(0.45)).frame(width: 1, height: 16).offset(y: 9)   // button placket
                Text("\(f.num)").font(GaryFonts.mono(13, bold: true)).foregroundStyle(textC).offset(y: 8)
                // cap — New Era 59FIFTY (flat brim + structured crown)
                ZStack {
                    MLBCapBrim().fill(cap).overlay(MLBCapBrim().fill(.black.opacity(0.22))).frame(width: 27, height: 18)
                    MLBCapCrown().fill(cap).frame(width: 27, height: 18)
                    Rectangle().fill(.black.opacity(0.16)).frame(width: 0.8, height: 8).offset(y: -3.5)
                    Circle().fill(cap).frame(width: 2.4, height: 2.4).offset(y: -8)
                }.offset(y: -22)
                // edge badges — clean roundels
                if f.hr { edgeBadge("baseball.fill", MLBI.gold, GaryColors.darkBg).offset(x: 17, y: 1) }
                if f.plat { edgeBadge("arrow.up", MLBI.plat, .white).offset(x: -17, y: 1) }
            }
            .frame(width: 46, height: 58)
            Text(f.name).font(GaryFonts.text(10.5, .bold)).foregroundStyle(.white)
                .shadow(color: .black.opacity(0.9), radius: 2, y: 1).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(width: 70)
    }

    private func edgeBadge(_ symbol: String, _ bg: Color, _ fg: Color) -> some View {
        Image(systemName: symbol).font(.system(size: 7.5, weight: .black)).foregroundStyle(fg)
            .frame(width: 15, height: 15).background(Circle().fill(bg))
            .overlay(Circle().stroke(GaryColors.darkBg, lineWidth: 1.5))
    }

    private var theRead: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The Read").font(GaryFonts.mono(10.5, bold: true)).tracking(1.4).foregroundStyle(MLBI.gold).textCase(.uppercase)
            if let read {
                Text(read.headline).font(GaryFonts.text(15, .semibold)).foregroundStyle(MLBI.ink).fixedSize(horizontal: false, vertical: true)
                if !read.detail.isEmpty { Text(read.detail).font(GaryFonts.text(13)).foregroundStyle(MLBI.ink2).fixedSize(horizontal: false, vertical: true) }
                if !read.value.isEmpty { Text(read.value).font(GaryFonts.text(17, .bold)).foregroundStyle(MLBI.gold).padding(.top, 2) }
            } else {
                Text("Wind's out to right-centre (orange zone) — it lifts the left-handed pull bats and the team total. Caps show form; tap a player for splits and the matchup vs tonight's arm.")
                    .font(GaryFonts.text(14)).foregroundStyle(MLBI.ink3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 18).padding(.top, 18)
    }

    private var weatherSheet: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 11) {
                ZStack { Circle().fill(Color(hex: "#23303a")).frame(width: 42, height: 42); Image(systemName: "sun.max.fill").foregroundStyle(Color(hex: "#FFD45A")) }
                VStack(alignment: .leading, spacing: 1) {
                    Text("First-pitch conditions").font(GaryFonts.text(18, .bold)).foregroundStyle(.white)
                    Text("\(ballpark?.park ?? "Ballpark") · Roof \(Self.weather.roofOpen ? "open" : "closed")").font(GaryFonts.mono(10.5)).foregroundStyle(MLBI.ink3)
                }
                Spacer()
                Text(Self.weather.helps ? "HITTER" : "PITCHER").font(GaryFonts.mono(9, bold: true))
                    .foregroundStyle(MLBI.hot).padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Capsule().fill(MLBI.hot.opacity(0.18)))
            }.padding(.top, 22)
            HStack(spacing: 8) {
                wxCell("\(Self.weather.temp)°", "TEMP")
                wxCell("\(Self.weather.windMph)", "MPH \(Self.weather.dir)")
                wxCell("41%", "HUMIDITY")
            }.padding(.top, 16)
            Text("THE READ").font(GaryFonts.mono(9, bold: true)).tracking(1.2).foregroundStyle(MLBI.gold).padding(.top, 18)
            Text("Wind blowing out to \(Self.weather.dir) at \(Self.weather.windMph) — the orange zone on the field. Lifts carry for the left-handed pull bats and nudges the team total OVER + anytime-HR markets.")
                .font(GaryFonts.text(13)).foregroundStyle(MLBI.ink2).padding(.top, 7).fixedSize(horizontal: false, vertical: true)
            Spacer()
        }
        .padding(.horizontal, 20).frame(maxWidth: .infinity, alignment: .leading).background(Color(hex: "#0F1612").ignoresSafeArea())
    }

    private func wxCell(_ v: String, _ k: String) -> some View {
        VStack(spacing: 3) {
            Text(v).font(GaryFonts.mono(20, bold: true)).foregroundStyle(.white)
            Text(k).font(GaryFonts.mono(8)).foregroundStyle(MLBI.ink3)
        }.frame(maxWidth: .infinity).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 10).fill(MLBI.panel).overlay(RoundedRectangle(cornerRadius: 10).stroke(MLBI.line)))
    }

    private func heatColor(_ h: String) -> Color { h == "hot" ? MLBI.hot : h == "cold" ? MLBI.cold : MLBI.steady }

    // Sample weather (labelled) — roof open, wind out to right-centre.
    fileprivate static let weather = MLBWeather(temp: 78, windMph: 12, dir: "RC", roofOpen: true, helps: true,
                                    carry: CGPoint(x: 165, y: 95), windFrom: CGPoint(x: 128, y: 150), windTo: CGPoint(x: 168, y: 95))

    // Labelled sample lineup at standard fielding positions, spread for legibility.
    private static let lineup: [MLBFielder] = [
        MLBFielder(num: 8, name: "Chourio", pos: "CF", dx: 125, dy: 60, heat: "hot", bats: "R", hr: true, ord: 3, wrc: 122, xwoba: ".358", vR: ".880", vL: ".910", form: "1.060", bvpAB: 7, bvpH: 3, bvpHR: 1, bvpOPS: "1.140"),
        MLBFielder(num: 5, name: "Mitchell", pos: "LF", dx: 70, dy: 92, heat: "hot", bats: "L", plat: true, ord: 8, wrc: 105, xwoba: ".330", vR: ".800", vL: ".690", form: ".940", bvpAB: 4, bvpH: 2, bvpHR: 0, bvpOPS: "1.000"),
        MLBFielder(num: 10, name: "Frelick", pos: "RF", dx: 180, dy: 92, heat: "cold", bats: "L", plat: true, ord: 2, wrc: 92, xwoba: ".305", vR: ".740", vL: ".700", form: ".610", bvpAB: 9, bvpH: 2, bvpHR: 0, bvpOPS: ".560"),
        MLBFielder(num: 7, name: "Adames", pos: "SS", dx: 98, dy: 138, heat: "hot", bats: "R", hr: true, ord: 9, wrc: 118, xwoba: ".350", vR: ".860", vL: ".900", form: "1.020", bvpAB: 13, bvpH: 5, bvpHR: 1, bvpOPS: ".980"),
        MLBFielder(num: 4, name: "Turang", pos: "2B", dx: 152, dy: 138, heat: "cold", bats: "L", plat: true, ord: 1, wrc: 95, xwoba: ".300", vR: ".720", vL: ".760", form: ".540", bvpAB: 6, bvpH: 1, bvpHR: 0, bvpOPS: ".500"),
        MLBFielder(num: 3, name: "Ortiz", pos: "3B", dx: 80, dy: 168, heat: "steady", bats: "R", ord: 7, wrc: 88, xwoba: ".298", vR: ".700", vL: ".770", form: ".690", bvpAB: 5, bvpH: 1, bvpHR: 0, bvpOPS: ".560"),
        MLBFielder(num: 12, name: "Hoskins", pos: "1B", dx: 170, dy: 168, heat: "steady", bats: "R", hr: true, ord: 5, wrc: 112, xwoba: ".345", vR: ".840", vL: ".910", form: ".760", bvpAB: 8, bvpH: 2, bvpHR: 0, bvpOPS: ".625"),
        MLBFielder(num: 51, name: "Peralta", pos: "P", dx: 125, dy: 176, heat: "steady", bats: "R", sp: true),
        MLBFielder(num: 24, name: "Contreras", pos: "C", dx: 125, dy: 214, heat: "hot", bats: "R", hr: true, ord: 4, wrc: 130, xwoba: ".372", vR: ".910", vL: ".840", form: "1.180", bvpAB: 11, bvpH: 4, bvpHR: 1, bvpOPS: "1.090"),
    ]
}

// Tap a fielder → a jersey that FLIPS to its stats (per category).


// Player card (v4 — readable black/white/gold) shown as a CENTERED POPUP CAROUSEL.
// Tap a fielder on the lineup field → this opens over the team's lineup; swipe left/
// right to flip through each player like a pack of baseball cards, or tap the dim
// backdrop / the X to exit and pick another. Renders the rich player_insight_cards
// pack (fetched per player by id), with a lean header fallback before it posts.
// No flip animation — it just shows the info.

private enum PCV4 {
    static let bg   = Color(hex: "#0C0A06")   // near-black (warm) — matches the Picks page
    static let ink  = Color(hex: "#F7F2E8")   // primary — bright cream
    static let mut  = Color(hex: "#CFC6B2")   // secondary — readable warm cream (no cold grey)
    static let mut2 = Color(hex: "#A99E89")   // small labels
    static let gold = Color(hex: "#ECC256")   // strength / highlight
    static let bad  = Color(hex: "#E2D9C6")   // "weak" values stay readable, just not gold
    static let line = Color(hex: "#ECC256").opacity(0.16)
    static let barbg = Color.white.opacity(0.08)
}

/// One card in the carousel.
struct CarouselPlayer: Identifiable {
    let id: String        // player_id (for the player_insight_cards fetch)
    let name: String
    let heat: String      // hot / cold / steady (from the field card)
    let game: String      // "CUBS @ METS" context line
}

struct PlayerCardCarousel: View {
    let players: [CarouselPlayer]
    @State var index: Int
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onClose() }

            VStack(spacing: 10) {
                HStack {
                    Text("\(index + 1) / \(players.count)")
                        .font(GaryFonts.mono(11, bold: true)).foregroundStyle(PCV4.mut2)
                    Spacer()
                    Button { onClose() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28)).foregroundStyle(.white.opacity(0.55))
                    }.buttonStyle(.plain)
                }
                .padding(.horizontal, 26)

                TabView(selection: $index) {
                    ForEach(Array(players.enumerated()), id: \.offset) { i, pl in
                        CarouselCard(player: pl).tag(i).padding(.horizontal, 24)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(maxHeight: 540)

                HStack(spacing: 6) {
                    ForEach(players.indices, id: \.self) { i in
                        Circle().fill(i == index ? PCV4.gold : Color.white.opacity(0.22))
                            .frame(width: 6, height: 6)
                    }
                }
            }
            .padding(.vertical, 30)
        }
        .transition(.opacity)
    }
}

// Carousel page — fetches one player's pack, then renders the shared v4 card.
private struct CarouselCard: View {
    let player: CarouselPlayer
    @State private var pack: PlayerInsightPack? = nil
    @State private var loading = true
    var body: some View {
        PlayerCardV4(name: player.name, heat: player.heat, game: player.game, pack: pack, loading: loading)
            .task(id: player.id) {
                loading = true
                pack = await SupabaseAPI.fetchPlayerInsightCard(date: SupabaseAPI.todayEST(), playerId: player.id)
                loading = false
            }
    }
}

// The optional "why this surfaced" hero the Hub passes (the lane verdict); nil in the carousel.
struct PlayerCardV4Edge { let eyebrow: String; let title: String; let body: String }

// Pure v4 renderer — SHARED by the lineup carousel (CarouselCard fetches) and the Hub player
// breakdown (PlayerInsightSheet passes its pack + an edge). One card design across both.
struct PlayerCardV4: View {
    let name: String
    var heat: String = ""
    var game: String = ""
    let pack: PlayerInsightPack?
    var loading: Bool = false
    var edge: PlayerCardV4Edge? = nil

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let e = edge { edgeHero(e) }
                if loading {
                    ProgressView().tint(PCV4.gold).frame(maxWidth: .infinity).padding(.vertical, 46)
                } else if let p = pack {
                    sections(p)
                } else {
                    Text("Full breakdown posts with the day's edge refresh.")
                        .font(GaryFonts.text(13)).foregroundStyle(PCV4.mut2)
                        .padding(.horizontal, 24).padding(.vertical, 26)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous).fill(PCV4.bg)
                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(PCV4.line, lineWidth: 1))
                .shadow(color: .black.opacity(0.55), radius: 24, y: 10)
        )
    }

    // THE EDGE — the Hub's "why this player surfaced" lane verdict, in v4 style.
    @ViewBuilder private func edgeHero(_ e: PlayerCardV4Edge) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(e.eyebrow.uppercased()).font(GaryFonts.mono(9.5, bold: true)).tracking(1.4).foregroundStyle(PCV4.gold)
            Text(e.title).font(GaryFonts.display(18)).foregroundStyle(PCV4.ink).fixedSize(horizontal: false, vertical: true)
            if !e.body.isEmpty {
                Text(e.body).font(GaryFonts.text(13)).foregroundStyle(PCV4.mut).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(PCV4.gold.opacity(0.07))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PCV4.line, lineWidth: 1)))
        .padding(.horizontal, 18).padding(.bottom, 4)
    }

    // MARK: header
    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !game.isEmpty {
                Text(game.uppercased())
                    .font(GaryFonts.mono(11, bold: true)).foregroundStyle(PCV4.mut2)
            }
            HStack(alignment: .top) {
                Text(pack?.name ?? name)
                    .font(GaryFonts.display(38)).foregroundStyle(PCV4.ink).lineLimit(2).minimumScaleFactor(0.7)
                Spacer()
                if heat == "hot" {
                    chip("▲ HOT")
                } else if heat == "cold" {
                    chip("▼ COLD")
                }
            }
            if let id = identityLine {
                Text(id).font(GaryFonts.text(13, .medium)).foregroundStyle(PCV4.mut)
            }
        }
        .padding(.horizontal, 26).padding(.top, 24).padding(.bottom, 18)
    }
    private func chip(_ t: String) -> some View {
        Text(t).font(GaryFonts.mono(10.5, bold: true))
            .foregroundStyle(Color(hex: "#1B1407"))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Capsule().fill(PCV4.gold))
    }
    private var identityLine: String? {
        guard let p = pack else { return nil }
        var bits: [String] = []
        if let pos = p.position { bits.append(pos) }
        if let h = p.hand { bits.append(p.type == "pitcher" ? "Throws \(h)" : "Bats \(h)") }
        if let t = p.team { bits.append(t) }
        return bits.isEmpty ? nil : bits.joined(separator: "  ·  ")
    }

    // MARK: sections
    @ViewBuilder private func sections(_ p: PlayerInsightPack) -> some View {
        if let read = readBullets(p), !read.isEmpty {
            section("The read") { VStack(alignment: .leading, spacing: 11) { ForEach(read.indices, id: \.self) { readRow(read[$0]) } } }
        }
        if let pm = p.pitchMatchup, !pm.isEmpty {
            section(p.type == "pitcher" ? "His arsenal" : "What he'll see") { matchupTable(pm) }
        }
        if let sp = p.splits, !sp.isEmpty {
            section("Splits") { VStack(alignment: .leading, spacing: 14) { ForEach(sp.indices, id: \.self) { splitRow(sp[$0]) } } }
        }
        if let fr = p.formRows, !fr.isEmpty {
            section("Recent") { formGrid(fr, headline: p.form) }
        }
        if let pr = p.props, !pr.isEmpty {
            section("The angle") { VStack(spacing: 0) { ForEach(pr.indices, id: \.self) { propRow(pr[$0]) } } }
        }
    }

    private func section<C: View>(_ cap: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(cap.uppercased()).font(GaryFonts.mono(11, bold: true)).tracking(1.6)
                .foregroundStyle(PCV4.gold).opacity(0.92)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 26).padding(.vertical, 20)
        .overlay(Rectangle().fill(PCV4.line).frame(height: 1), alignment: .top)
    }

    // strengths (+) / weaknesses (−)
    private func readBullets(_ p: PlayerInsightPack) -> [(Bool, String)]? {
        var out: [(Bool, String)] = []
        (p.strengths ?? []).prefix(2).forEach { out.append((true, $0)) }
        (p.weaknesses ?? []).prefix(2).forEach { out.append((false, $0)) }
        return out.isEmpty ? nil : out
    }
    private func readRow(_ row: (Bool, String)) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(row.0 ? "+" : "–").font(GaryFonts.mono(13, bold: true))
                .foregroundStyle(row.0 ? PCV4.gold : PCV4.mut2).frame(width: 14)
            Text(row.1).font(GaryFonts.text(13)).foregroundStyle(PCV4.mut).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // pitch matchup table: PITCH | MIX | HE HITS
    private func matchupTable(_ rows: [PlayerInsightPack.PitchRow]) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("PITCH").font(GaryFonts.mono(10, bold: true)).foregroundStyle(PCV4.mut2)
                Spacer()
                Text("MIX").font(GaryFonts.mono(10, bold: true)).foregroundStyle(PCV4.mut2).frame(width: 54, alignment: .trailing)
                Text("HE HITS").font(GaryFonts.mono(10, bold: true)).foregroundStyle(PCV4.mut2).frame(width: 64, alignment: .trailing)
            }
            .padding(.bottom, 6)
            ForEach(rows.indices, id: \.self) { i in
                let r = rows[i]
                HStack {
                    Text(r.pitch ?? "—").font(GaryFonts.display(16)).foregroundStyle(PCV4.ink)
                    Spacer()
                    Text(r.usagePct != nil ? "\(Int(r.usagePct!.rounded()))%" : "—")
                        .font(GaryFonts.mono(13)).foregroundStyle(PCV4.mut).frame(width: 54, alignment: .trailing)
                    Text(hits(r)).font(GaryFonts.display(r.grade == "thin" ? 13 : 19))
                        .foregroundStyle(hitsColor(r.grade)).frame(width: 64, alignment: .trailing)
                }
                .padding(.vertical, 12)
                .overlay(i == 0 ? nil : Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1), alignment: .top)
            }
        }
    }
    private func hits(_ r: PlayerInsightPack.PitchRow) -> String {
        if r.grade == "thin" { return "thin" }
        return r.ba ?? "—"
    }
    private func hitsColor(_ grade: String?) -> Color {
        switch grade {
        case "strong": return PCV4.gold
        case "thin":   return PCV4.mut2
        default:       return PCV4.bad   // weak / neutral — readable cream, de-emphasized
        }
    }

    // split row: vs RHP / vs LHP with a bar
    private func splitRow(_ s: PlayerInsightPack.LabeledStat) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.label ?? "").font(GaryFonts.text(13, .bold)).foregroundStyle(PCV4.ink)
                Spacer()
                if let d = s.detail { Text(d).font(GaryFonts.mono(11)).foregroundStyle(PCV4.mut2) }
            }
            Text(s.value ?? "").font(GaryFonts.text(13)).foregroundStyle(PCV4.mut)
        }
    }

    // recent: 3-up grid + headline
    private func formGrid(_ rows: [PlayerInsightPack.LabeledStat], headline: PlayerInsightPack.LabeledStat?) -> some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                ForEach(rows.prefix(3).indices, id: \.self) { i in
                    let r = rows[i]
                    VStack(spacing: 6) {
                        Text((r.label ?? "").uppercased()).font(GaryFonts.mono(9, bold: true)).foregroundStyle(PCV4.mut2)
                        Text((r.value ?? "—").components(separatedBy: " (").first ?? "—").font(GaryFonts.display(20)).foregroundStyle(PCV4.ink)
                        if let d = r.detail { Text(d).font(GaryFonts.mono(10)).foregroundStyle(PCV4.mut).lineLimit(1).minimumScaleFactor(0.7) }
                    }.frame(maxWidth: .infinity)
                }
            }
            if let h = headline, let v = h.value {
                HStack {
                    Text((h.label ?? "FORM").uppercased()).font(GaryFonts.mono(9, bold: true)).foregroundStyle(PCV4.mut2)
                    Text(v).font(GaryFonts.text(12, .medium)).foregroundStyle(PCV4.gold)
                    Spacer()
                    if let d = h.detail { Text(d).font(GaryFonts.mono(10)).foregroundStyle(PCV4.mut2) }
                }
                .padding(.top, 12).overlay(Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1), alignment: .top)
            }
        }
    }

    // prop row: label / line — rate
    private func propRow(_ p: PlayerInsightPack.PropLine) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.label ?? "").font(GaryFonts.text(13, .medium)).foregroundStyle(PCV4.ink)
                Text([p.line, p.odds].compactMap { $0 }.joined(separator: "  ·  "))
                    .font(GaryFonts.mono(11)).foregroundStyle(PCV4.mut2)
            }
            Spacer()
            if let rate = p.rate {
                Text(rate).font(GaryFonts.display(16)).foregroundStyle(PCV4.mut)
            }
        }
        .padding(.vertical, 11)
    }
}
