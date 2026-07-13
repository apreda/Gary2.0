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
    var team: String? = nil          // own-club abbr on mixed-team rows (HR Derby field)
    // numbers (revealed on flip)
    var ord = 0, wrc = 0
    var xwoba = "", vR = "", vL = "", form = ""
    var bvpAB = 0, bvpH = 0, bvpHR = 0, bvpOPS = ""
}

private struct MLBWeather {
    let temp: Int, windMph: Int, dir: String, helps: Bool
    let venue: String?, condition: String?   // venue + sky condition (the feed has no humidity/roof)
    // carry-zone centre in data space (wind arrow removed — founder call)
    let carry: CGPoint
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
    /// True only when the builder reports the REAL sheet is confirmed (BDL posted
    /// the official lineup). Until then the Confirmed tab shows an empty state —
    /// the projection never masquerades as confirmed.
    @State private var confirmedAvailable = false

    private var awayName: String { matchup.components(separatedBy: " @ ").first ?? "Away" }
    private var homeName: String { matchup.components(separatedBy: " @ ").last ?? "Home" }
    /// The HR Derby field — one shared pool of contestants, not two lineups:
    /// the away/home toggle is meaningless there and hides.
    private var isDerby: Bool { awayName.localizedCaseInsensitiveContains("derby") }
    private var ballpark: Ballpark? { MLBParks.park(forTeam: homeName) ?? MLBParks.all["brewers"] }
    /// The team whose lineup is on the field — both bat at the home park (home/away toggle).
    private var shownTeam: SupabaseAPI.MLBTeamLineup? { homeUp ? realHome : realAway }

    private func module(_ kinds: Set<SignalKind>) -> [Signal] { edges.filter { kinds.contains($0.kind) } }
    private var pitchingEdges: [Signal] { module([.starterForm, .firstInning, .runningGame]).filter { $0.nrfi == nil } }
    private var batsEdges: [Signal] { module([.hot, .cold, .platoon, .regression, .hrThreat, .h2h, .streak]).filter { $0.h2h == nil } }
    private var parkEdges: [Signal] { module([.parkWeather, .ballpark]) }
    private var otherEdges: [Signal] {
        let claimed: Set<SignalKind> = [.starterForm, .firstInning, .runningGame, .hot, .cold, .platoon, .regression, .hrThreat, .h2h, .streak, .parkWeather, .ballpark]
        return edges.filter { !claimed.contains($0.kind) }
    }

    private func playerEdges(_ name: String) -> [Signal] {
        edges.filter { $0.headline.localizedCaseInsensitiveContains(name) }
    }

    // The player's category edge (HR Threat, Heat Check…), built byte-for-byte the way the Hub's
    // PlayerInsightSheet (hubEdge) does — so a tapped fielder's card matches the Hub card exactly.
    private static let playerEdgeKinds: Set<SignalKind> = [.hrThreat, .hot, .cold, .platoon, .regression, .h2h, .streak]
    private func playerEdge(forId pid: String) -> PlayerCardV4Edge? {
        guard !pid.isEmpty,
              let s = edges.first(where: { $0.playerId == pid && Self.playerEdgeKinds.contains($0.kind) })
        else { return nil }
        let body = (s.reg?.verdict ?? s.detail).trimmingCharacters(in: .whitespaces)
        return PlayerCardV4Edge(eyebrow: s.kind.chip, title: s.headline, body: body)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showHeader { header }
            stateTabs
            fieldCard
            // Head-to-Head — the season-series dominance, right under the lineup
            // (founder, Image #68). HeadToHeadRow carries the tug-of-war bar.
            if let h2hEdge = edges.first(where: { $0.h2h != nil }) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("HEAD-TO-HEAD")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.4))
                        .padding(.horizontal, 16).padding(.top, 4)
                    HeadToHeadRow(s: h2hEdge) { _ in }
                        .padding(.horizontal, 16)
                }
                .padding(.top, 8)
            }
            // First Inning — the NRFI/YRFI dots (each side's recent first innings).
            if let nrfiEdge = edges.first(where: { $0.nrfi != nil }) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("FIRST INNING")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.4))
                        .padding(.horizontal, 16).padding(.top, 4)
                    FirstInningRow(s: nrfiEdge) { _ in }
                        .padding(.horizontal, 16)
                }
                .padding(.top, 8)
            }
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
                players: displayLineup.map { CarouselPlayer(id: $0.playerId, name: $0.name, heat: $0.heat, game: matchup.uppercased(), edge: playerEdge(forId: $0.playerId)) },
                index: displayLineup.firstIndex(where: { $0.name == f.name }) ?? 0,
                onClose: { selected = nil }
            )
            if #available(iOS 16.4, *) { carousel.presentationBackground(.clear) } else { carousel }
        }
        .sheet(isPresented: $showWeather) { weatherSheet.presentationDetents([.height(300)]) }
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
                let isConfirmed = (row.status == "confirmed")
                confirmedAvailable = isConfirmed
                state = isConfirmed ? .confirmed : .projected
            }
        }
    }

    private static let posCoord: [String: (CGFloat, CGFloat)] = [
        "CF": (125, 60), "LF": (70, 92), "RF": (180, 92),
        "SS": (98, 138), "2B": (152, 138), "3B": (80, 168), "1B": (170, 168),
        "P": (125, 176), "C": (125, 214), "DH": (40, 214),
    ]

    // Real TEAM colours — so each side wears ITS OWN identity, not one fixed venue colour.
    // primary = the dark body/road jersey colour; numberOnWhite = a dark colour that stays
    // readable as a number printed ON a white home jersey; hasPinstripes = the team genuinely
    // wears pinstripes at home. Keyed below by BDL abbreviation; resolved from the displayed
    // team name via the existing mlbTeamKeywords map.
    // `primary` = cap/body (dark) colour, `numberOnWhite` = legacy dark number for the away read,
    // `accent` = the team's BRIGHT signature/brand colour used for the HOME white-jersey number.
    struct MLBTeamColor { let primary: Color; let numberOnWhite: Color; let accent: Color; let hasPinstripes: Bool }
    private static let teamColors: [String: MLBTeamColor] = [
        "ARI": MLBTeamColor(primary: Color(hex: "#A71930"), numberOnWhite: Color(hex: "#A71930"), accent: Color(hex: "#E3D4AD"), hasPinstripes: false), // Diamondbacks (Sedona red / sand)
        "ATL": MLBTeamColor(primary: Color(hex: "#13274F"), numberOnWhite: Color(hex: "#CE1141"), accent: Color(hex: "#CE1141"), hasPinstripes: false), // Braves (navy / scarlet)
        "BAL": MLBTeamColor(primary: Color(hex: "#DF4601"), numberOnWhite: Color(hex: "#000000"), accent: Color(hex: "#DF4601"), hasPinstripes: false), // Orioles (orange / black)
        "BOS": MLBTeamColor(primary: Color(hex: "#BD3039"), numberOnWhite: Color(hex: "#0C2340"), accent: Color(hex: "#BD3039"), hasPinstripes: false), // Red Sox (red / navy)
        "CHC": MLBTeamColor(primary: Color(hex: "#0E3386"), numberOnWhite: Color(hex: "#0E3386"), accent: Color(hex: "#CC3433"), hasPinstripes: true),  // Cubs (blue / red) — HOME PINSTRIPES
        "CWS": MLBTeamColor(primary: Color(hex: "#27251F"), numberOnWhite: Color(hex: "#27251F"), accent: Color(hex: "#C4CED4"), hasPinstripes: false), // White Sox (black / silver)
        "CHW": MLBTeamColor(primary: Color(hex: "#27251F"), numberOnWhite: Color(hex: "#27251F"), accent: Color(hex: "#C4CED4"), hasPinstripes: false), // White Sox (alt abbr)
        "CIN": MLBTeamColor(primary: Color(hex: "#C6011F"), numberOnWhite: Color(hex: "#000000"), accent: Color(hex: "#C6011F"), hasPinstripes: false), // Reds (red / black)
        "CLE": MLBTeamColor(primary: Color(hex: "#00385D"), numberOnWhite: Color(hex: "#E50022"), accent: Color(hex: "#E50022"), hasPinstripes: false), // Guardians (navy / red)
        "COL": MLBTeamColor(primary: Color(hex: "#33006F"), numberOnWhite: Color(hex: "#33006F"), accent: Color(hex: "#C4CED4"), hasPinstripes: true),  // Rockies (purple / silver) — HOME PINSTRIPES
        "DET": MLBTeamColor(primary: Color(hex: "#0C2340"), numberOnWhite: Color(hex: "#0C2340"), accent: Color(hex: "#FA4616"), hasPinstripes: false), // Tigers (navy / orange)
        "HOU": MLBTeamColor(primary: Color(hex: "#002D62"), numberOnWhite: Color(hex: "#EB6E1F"), accent: Color(hex: "#EB6E1F"), hasPinstripes: false), // Astros (navy / orange)
        "KC":  MLBTeamColor(primary: Color(hex: "#004687"), numberOnWhite: Color(hex: "#004687"), accent: Color(hex: "#BD9B60"), hasPinstripes: false), // Royals (royal blue / gold)
        "LAA": MLBTeamColor(primary: Color(hex: "#BA0021"), numberOnWhite: Color(hex: "#003263"), accent: Color(hex: "#BA0021"), hasPinstripes: false), // Angels (red / navy)
        "LAD": MLBTeamColor(primary: Color(hex: "#005A9C"), numberOnWhite: Color(hex: "#005A9C"), accent: Color(hex: "#005A9C"), hasPinstripes: false), // Dodgers (Dodger blue)
        "MIA": MLBTeamColor(primary: Color(hex: "#00A3E0"), numberOnWhite: Color(hex: "#000000"), accent: Color(hex: "#00A3E0"), hasPinstripes: false), // Marlins (Miami blue / black)
        "MIL": MLBTeamColor(primary: Color(hex: "#12284B"), numberOnWhite: Color(hex: "#12284B"), accent: Color(hex: "#FFC52F"), hasPinstripes: false), // Brewers (navy / gold)
        "MIN": MLBTeamColor(primary: Color(hex: "#002B5C"), numberOnWhite: Color(hex: "#D31145"), accent: Color(hex: "#D31145"), hasPinstripes: false), // Twins (navy / red)
        "NYM": MLBTeamColor(primary: Color(hex: "#002D72"), numberOnWhite: Color(hex: "#FF5910"), accent: Color(hex: "#FF5910"), hasPinstripes: true),  // Mets (blue / orange) — HOME PINSTRIPES
        "NYY": MLBTeamColor(primary: Color(hex: "#0C2340"), numberOnWhite: Color(hex: "#0C2340"), accent: Color(hex: "#0C2340"), hasPinstripes: true),  // Yankees (navy) — HOME PINSTRIPES
        "ATH": MLBTeamColor(primary: Color(hex: "#003831"), numberOnWhite: Color(hex: "#003831"), accent: Color(hex: "#EFB21E"), hasPinstripes: false), // Athletics (green / gold)
        "OAK": MLBTeamColor(primary: Color(hex: "#003831"), numberOnWhite: Color(hex: "#003831"), accent: Color(hex: "#EFB21E"), hasPinstripes: false), // Athletics (alt abbr)
        "PHI": MLBTeamColor(primary: Color(hex: "#E81828"), numberOnWhite: Color(hex: "#284898"), accent: Color(hex: "#E81828"), hasPinstripes: true),  // Phillies (red / blue) — HOME PINSTRIPES
        "PIT": MLBTeamColor(primary: Color(hex: "#161513"), numberOnWhite: Color(hex: "#161513"), accent: Color(hex: "#FDB827"), hasPinstripes: false), // Pirates (black / GOLD)
        "SD":  MLBTeamColor(primary: Color(hex: "#2F241D"), numberOnWhite: Color(hex: "#2F241D"), accent: Color(hex: "#FFC425"), hasPinstripes: false), // Padres (brown / gold)
        "SF":  MLBTeamColor(primary: Color(hex: "#27251F"), numberOnWhite: Color(hex: "#FD5A1E"), accent: Color(hex: "#FD5A1E"), hasPinstripes: false), // Giants (black / orange)
        "SEA": MLBTeamColor(primary: Color(hex: "#0C2C56"), numberOnWhite: Color(hex: "#005C5C"), accent: Color(hex: "#005C5C"), hasPinstripes: false), // Mariners (navy / teal)
        "STL": MLBTeamColor(primary: Color(hex: "#C41E3A"), numberOnWhite: Color(hex: "#0C2340"), accent: Color(hex: "#C41E3A"), hasPinstripes: false), // Cardinals (red / navy)
        "TB":  MLBTeamColor(primary: Color(hex: "#092C5C"), numberOnWhite: Color(hex: "#092C5C"), accent: Color(hex: "#8FBCE6"), hasPinstripes: false), // Rays (navy / light blue)
        "TEX": MLBTeamColor(primary: Color(hex: "#003278"), numberOnWhite: Color(hex: "#C0111F"), accent: Color(hex: "#C0111F"), hasPinstripes: false), // Rangers (blue / red)
        "TOR": MLBTeamColor(primary: Color(hex: "#134A8E"), numberOnWhite: Color(hex: "#134A8E"), accent: Color(hex: "#1D2D5C"), hasPinstripes: false), // Blue Jays (royal blue)
        "WSH": MLBTeamColor(primary: Color(hex: "#AB0003"), numberOnWhite: Color(hex: "#14225A"), accent: Color(hex: "#AB0003"), hasPinstripes: false), // Nationals (red / navy)
    ]
    /// Resolve a displayed team name to its real colours via the shared keyword map.
    private static func teamColor(forName name: String) -> MLBTeamColor {
        let n = name.lowercased()
        if let abbr = mlbTeamKeywords.first(where: { $0.value.contains { n.contains($0) } })?.key,
           let c = teamColors[abbr] { return c }
        return MLBTeamColor(primary: Color(hex: "#12284B"), numberOnWhite: Color(hex: "#12284B"), accent: Color(hex: "#12284B"), hasPinstripes: false)
    }

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
                fillIn: f.fillIn ?? false, team: f.team, ord: f.order ?? 0, vR: f.ops ?? ""))
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
            if weather != nil { Button { showWeather = true } label: { weatherChip }.buttonStyle(.plain) }
        }
        .padding(.horizontal, 22).padding(.top, showHeader ? 14 : 2)
    }

    private var weatherChip: some View {
        HStack(spacing: 5) {
            Image(systemName: "wind").font(.system(size: 10, weight: .bold)).foregroundStyle(MLBI.gold)
            Text("\(weather?.windMph ?? 0) \(weather?.dir ?? "")").font(GaryFonts.mono(10, bold: true)).foregroundStyle(MLBI.ink2)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Capsule().fill(MLBI.panel).overlay(Capsule().stroke(MLBI.line, lineWidth: 1)))
    }

    /// The Confirmed tab is selected but no real confirmed sheet has posted yet —
    /// show the projection only on the Projected tab, never under Confirmed.
    private var showConfirmedPending: Bool { state == .confirmed && !confirmedAvailable }

    @ViewBuilder private var fieldCard: some View {
        if showConfirmedPending {
            confirmedPendingCard
        } else {
            fieldBody
        }
    }

    /// Empty state shown when the user taps Confirmed before the official sheet posts.
    private var confirmedPendingCard: some View {
        VStack(spacing: 8) {
            VStack(spacing: 6) {
                Text("LINEUP NOT CONFIRMED YET")
                    .font(GaryFonts.mono(14, bold: true)).tracking(2.5).foregroundStyle(MLBI.gold)
                    .multilineTextAlignment(.center)
                Text("Posts ~2–3h before first pitch")
                    .font(GaryFonts.mono(10)).foregroundStyle(MLBI.ink3)
                Text("Tap Projected for Gary's projected lineup")
                    .font(GaryFonts.mono(9.5)).foregroundStyle(MLBI.ink4)
            }
            .padding(.vertical, 22).padding(.horizontal, 26)
            .frame(maxWidth: .infinity)
            .frame(height: 452)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(GaryColors.cardBg.opacity(0.5)))
        }
        .padding(.horizontal, 14).padding(.top, 12)
    }

    private var fieldBody: some View {
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
                    if realHome != nil && realAway != nil && !isDerby { teamToggle.padding(.top, 12) }
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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
        // No base fill — the corners stay transparent so the field blends into the page
        // background instead of reading as its own container (founder ask).
        var grass = Path(); grass.move(to: t.map(bp.homePlate))
        bp.wall.forEach { grass.addLine(to: t.map($0)) }; grass.closeSubpath()
        ctx.fill(grass, with: .color(MLBI.grass))
        if let f = bp.infield.first {
            var inf = Path(); inf.move(to: t.map(f)); bp.infield.dropFirst().forEach { inf.addLine(to: t.map($0)) }; inf.closeSubpath()
            ctx.fill(inf, with: .color(MLBI.dirt))
        }
        // wind carry zone (radial warm glow) — only when real conditions help the hitter (over-lean)
        if let wx = weather, wx.helps {
            let c = t.map(wx.carry)
            let rad = 80 * t.scale / 1.0
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - rad, y: c.y - rad, width: rad * 2, height: rad * 2)),
                     with: .radialGradient(Gradient(colors: [MLBI.hot.opacity(0.28), MLBI.hot.opacity(0)]), center: c, startRadius: 0, endRadius: rad))
        }
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
        // Mixed-team rows (the HR Derby field): each player wears HIS OWN club's
        // dark identity — eight contestants, eight real uniforms. Normal games
        // keep the side-wide treatment below.
        let ownTeam = f.team.flatMap { Self.teamColors[$0.uppercased()] }
        // Real TEAM colours for the side currently on the field (Option A):
        //  • AWAY = the team's DARK primary, number in WHITE.
        //  • HOME = WHITE jersey, number in the team's dark colour, + team pinstripes if they wear them.
        let tc = ownTeam ?? Self.teamColor(forName: homeUp ? homeName : awayName)
        // HOME white jersey softened to a warm off-white (#E7E4DC) — pure white read too glaring.
        let jersey: Color = (ownTeam != nil || !homeUp) ? tc.primary : Color(hex: "#E7E4DC")
        // HOME white jersey → number in the team's bright signature accent (e.g. Pirates GOLD).
        // AWAY dark jersey → number stays WHITE.
        let textC: Color = (ownTeam != nil || !homeUp) ? .white : tc.accent
        let pinstripes = ownTeam == nil && homeUp && tc.hasPinstripes
        // STANDARD players wear the team cap colour; HOT/COLD keep their red/blue heat tint.
        let isNeutral = f.heat != "hot" && f.heat != "cold"
        let cap: Color = isNeutral ? tc.primary : heatColor(f.heat)
        return VStack(spacing: 1) {
            ZStack {
                // Contested — a fill-in starter (the usual regular is resting/out): a dashed gold ring.
                if f.fillIn {
                    Circle().stroke(MLBI.gold, style: StrokeStyle(lineWidth: 2, dash: [3.5, 2.5]))
                        .frame(width: 52, height: 52).offset(y: -7)
                }
                // jersey
                MLBJerseyShape().fill(jersey).frame(width: 40, height: 38)
                    .overlay {
                        // Home pinstripes — thin vertical team-primary lines, clipped to the jersey.
                        if pinstripes {
                            MLBJerseyShape().fill(jersey)
                                .frame(width: 40, height: 38)
                                .overlay(
                                    HStack(spacing: 4) {
                                        ForEach(0..<8, id: \.self) { _ in
                                            Rectangle().fill(tc.primary.opacity(0.55)).frame(width: 0.8)
                                        }
                                    }
                                    .frame(width: 40, height: 38)
                                )
                                .clipShape(MLBJerseyShape())
                        }
                    }
                    .overlay(MLBJerseyShape().stroke(.black.opacity(0.35), lineWidth: 0.8).frame(width: 40, height: 38))
                // Number sits cleanly UP on the chest (upper-centre of the jersey) — no placket line through it.
                Text("\(f.num)").font(GaryFonts.mono(16, bold: true)).foregroundStyle(textC).offset(y: -2)
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
            if let w = weather {
                HStack(spacing: 11) {
                    ZStack { Circle().fill(Color(hex: "#23303a")).frame(width: 42, height: 42); Image(systemName: "sun.max.fill").foregroundStyle(Color(hex: "#FFD45A")) }
                    VStack(alignment: .leading, spacing: 1) {
                        Text("First-pitch conditions").font(GaryFonts.text(18, .bold)).foregroundStyle(.white)
                        Text([w.venue ?? ballpark?.park, w.condition].compactMap { $0 }.joined(separator: " · "))
                            .font(GaryFonts.mono(10.5)).foregroundStyle(MLBI.ink3)
                    }
                    Spacer()
                    Text(w.helps ? "HITTER" : "PITCHER").font(GaryFonts.mono(9, bold: true))
                        .foregroundStyle(w.helps ? MLBI.hot : MLBI.cold).padding(.horizontal, 8).padding(.vertical, 5)
                        .background(Capsule().fill((w.helps ? MLBI.hot : MLBI.cold).opacity(0.18)))
                }.padding(.top, 22)
                HStack(spacing: 8) {
                    wxCell("\(w.temp)°", "TEMP")
                    wxCell("\(w.windMph)", "MPH \(w.dir)")
                }.padding(.top, 16)
                if let read = weatherRead {
                    Text("THE READ").font(GaryFonts.mono(9, bold: true)).tracking(1.2).foregroundStyle(MLBI.gold).padding(.top, 18)
                    Text(read).font(GaryFonts.text(13)).foregroundStyle(MLBI.ink2).padding(.top, 7).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, 20).padding(.bottom, 22).frame(maxWidth: .infinity, alignment: .leading).background(Color(hex: "#0F1612").ignoresSafeArea())
    }

    private func wxCell(_ v: String, _ k: String) -> some View {
        VStack(spacing: 3) {
            Text(v).font(GaryFonts.mono(20, bold: true)).foregroundStyle(.white)
            Text(k).font(GaryFonts.mono(8)).foregroundStyle(MLBI.ink3)
        }.frame(maxWidth: .infinity).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 10).fill(MLBI.panel).overlay(RoundedRectangle(cornerRadius: 10).stroke(MLBI.line)))
    }

    private func heatColor(_ h: String) -> Color { h == "hot" ? MLBI.hot : h == "cold" ? MLBI.cold : MLBI.steady }

    // Real first-pitch conditions from the live park_weather insight (nil until it posts; mock deleted).
    private var weather: MLBWeather? {
        guard let w = parkEdges.first(where: { $0.weather != nil })?.weather else { return nil }
        let lean = w.lean ?? "over"
        return MLBWeather(temp: w.temp_f ?? 0, windMph: w.wind_mph ?? 0, dir: (w.wind_dir ?? "").uppercased(),
                          helps: lean == "over", venue: w.venue, condition: w.condition,
                          carry: CGPoint(x: lean == "over" ? 165 : 125, y: 95))
    }
    // THE READ prose — the real over/under-aware string the backend already writes for this game.
    private var weatherRead: String? { parkEdges.first(where: { $0.weather != nil })?.detail }

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
    static let bg   = Color(hex: "#121214")   // matte black — matches the game pick cards (GaryColors.cardBg)
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
    var edge: PlayerCardV4Edge? = nil   // category edge (HR Threat, Heat Check…) — matches the Hub's hero
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
            .offset(y: -34)   // float slightly higher so it reads as centered
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
        PlayerCardV4(name: player.name, heat: player.heat, game: player.game, pack: pack, loading: loading, edge: player.edge)
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
    @State private var recentExpanded = false   // "Recent" expand toggle (advanced + game stats)

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
                    VStack(alignment: .leading, spacing: 8) {
                        Text("BUILDING THE BREAKDOWN")
                            .font(GaryFonts.mono(10.5, bold: true)).tracking(1.4).foregroundStyle(PCV4.gold).opacity(0.92)
                        Text("\(name)'s full stat profile fills in as the lineup firms up — check back closer to kickoff.")
                            .font(GaryFonts.text(13)).foregroundStyle(PCV4.mut).lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 26).padding(.vertical, 24)
                    .overlay(Rectangle().fill(PCV4.line).frame(height: 1), alignment: .top)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous).fill(PCV4.bg)
                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(PCV4.gold.opacity(0.5), lineWidth: 1.5))
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
        // Soccer packs (type "outfield" / "keeper") have no platoon hand → position + team only.
        let isSoccer = p.type == "outfield" || p.type == "keeper"
        var bits: [String] = []
        if let pos = p.position { bits.append(pos) }
        if !isSoccer, let h = p.hand { bits.append(p.type == "pitcher" ? "Throws \(h)" : "Bats \(h)") }
        if let t = p.team { bits.append(t) }
        return bits.isEmpty ? nil : bits.joined(separator: "  ·  ")
    }

    // MARK: sections
    @ViewBuilder private func sections(_ p: PlayerInsightPack) -> some View {
        if let read = readBullets(p), !read.isEmpty {
            section("The read") { VStack(alignment: .leading, spacing: 11) { ForEach(read.indices, id: \.self) { readRow(read[$0]) } } }
        }
        if let sp = p.splits, !sp.isEmpty {
            // WC cards carry a role-aware title (FINISHING / ON THE BALL / AT THE BACK / IN GOAL);
            // MLB omits it → "Splits". section() uppercases, so it matches the gold eyebrow style.
            section(p.statsSectionTitle ?? "Splits") { VStack(alignment: .leading, spacing: 14) { ForEach(sp.indices, id: \.self) { splitRow(sp[$0]) } } }
        }
        if let fr = p.formRows, !fr.isEmpty {
            section("Recent") {
                VStack(alignment: .leading, spacing: 0) {
                    formGrid(fr, headline: p.form)
                    let extra = recentExtra(p)
                    if !extra.isEmpty {
                        if recentExpanded {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(extra.indices, id: \.self) { i in
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(extra[i].0).font(GaryFonts.mono(10, bold: true)).foregroundStyle(PCV4.mut2).lineLimit(1)
                                        Spacer(minLength: 12)
                                        Text(extra[i].1).font(GaryFonts.text(12, .medium)).foregroundStyle(PCV4.mut)
                                            .lineLimit(1).minimumScaleFactor(0.7).multilineTextAlignment(.trailing)
                                    }
                                }
                            }
                            .padding(.top, 14)
                            .transition(.opacity)
                        }
                        Button { withAnimation(.easeInOut(duration: 0.2)) { recentExpanded.toggle() } } label: {
                            HStack(spacing: 5) {
                                Text(recentExpanded ? "LESS" : "MORE STATS").font(GaryFonts.mono(10, bold: true)).tracking(1.4)
                                Image(systemName: recentExpanded ? "chevron.up" : "chevron.down").font(.system(size: 8, weight: .bold))
                            }
                            .foregroundStyle(PCV4.gold)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 12)
                    }
                }
            }
        }
        if let pr = p.props, !pr.isEmpty {
            section("The angle") { VStack(spacing: 0) { ForEach(pr.indices, id: \.self) { propRow(pr[$0]) } } }
        }
        // Matchup table tails the card (user call) — it reads long, so it sits at the very bottom.
        // Baseball-only (pitch arsenal / what-he'll-see). Soccer packs (outfield/keeper) never
        // carry pitchMatchup, but branch on type so a soccer card can never show a baseball label.
        let isSoccer = p.type == "outfield" || p.type == "keeper"
        if !isSoccer, let pm = p.pitchMatchup, !pm.isEmpty {
            section(p.type == "pitcher" ? "His arsenal" : "What he'll see") { matchupTable(pm) }
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

    // split row — a stat-sheet line: label left, the VALUE prominent on the right
    // with its context beneath it (so a "Dribbles · 3 · 67% of 12" reads at a glance).
    private func splitRow(_ s: PlayerInsightPack.LabeledStat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(s.label ?? "").font(GaryFonts.text(13, .semibold)).foregroundStyle(PCV4.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(s.value ?? "—").font(GaryFonts.display(16)).foregroundStyle(PCV4.ink)
                    .lineLimit(1).minimumScaleFactor(0.65)
                if let d = s.detail {
                    Text(d).font(GaryFonts.mono(10)).foregroundStyle(PCV4.mut2)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // recent: 3-up grid + headline
    private func formGrid(_ rows: [PlayerInsightPack.LabeledStat], headline: PlayerInsightPack.LabeledStat?) -> some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                ForEach(rows.prefix(3).indices, id: \.self) { i in
                    let r = rows[i]
                    VStack(spacing: 6) {
                        Text((r.label ?? "").uppercased()).font(GaryFonts.mono(9, bold: true)).foregroundStyle(PCV4.mut2)
                        Text((r.value ?? "—").components(separatedBy: " (").first ?? "—").font(GaryFonts.display(18)).foregroundStyle(PCV4.ink)
                            .lineLimit(1).minimumScaleFactor(0.6)
                        if let d = r.detail { Text(d).font(GaryFonts.mono(10)).foregroundStyle(PCV4.mut).lineLimit(1).minimumScaleFactor(0.7) }
                    }.frame(maxWidth: .infinity).frame(minHeight: 56, alignment: .top)
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

    // Extra "Recent" rows revealed by the toggle — advanced + game-relevant stats already in
    // the pack (expected stats vs actual, this-park split, batter-vs-tonight's-starter). No new data.
    private func recentExtra(_ p: PlayerInsightPack) -> [(String, String)] {
        var out: [(String, String)] = []
        for x in (p.xstats ?? []) {
            guard let label = x.label, let a = x.actual, let e = x.expected else { continue }
            let v = (x.verdict?.isEmpty == false) ? "\(a) vs \(e) · \(x.verdict!)" : "\(a) vs \(e)"
            out.append((label.uppercased(), v))
        }
        if let venue = p.venue, let v = venue.value {
            out.append(((venue.label ?? "AT THIS PARK").uppercased(), v + (venue.detail.map { " · \($0)" } ?? "")))
        }
        if let bvp = p.bvp, let v = bvp.value {
            out.append(((bvp.label ?? "VS STARTER").uppercased(), v + (bvp.detail.map { " · \($0)" } ?? "")))
        }
        return out
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
