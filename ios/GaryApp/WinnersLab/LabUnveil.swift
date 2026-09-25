import SwiftUI
import UIKit

// THE WINNERS LAB — the unveil (founder's pick, Sep 22 2026: U2's pack with
// U4's board folded in). A sealed play opens full screen: the foil pack
// shakes, the top tears, a flare, the ticket lands; then the ticket parks at
// the top and the reasons come up underneath in Gary's scorebook (founder's
// pick, Sep 24 2026, mock 9), each number circled in gold as it arrives. A tap
// during the run skips to the parked board. The parked page scrolls; the
// ticket or THE BREAKDOWN (top right) opens the breakdown, the back chevron
// (top left) closes the unveil and the real ticket takes the pack's slot on
// the list.

struct LabUnveilOverlay: View {
    let ticket: LabBoardTicket
    /// The play's state in words ("Win, WSH 2 · DET 9", "Live, Q1 7:46"); nil before the seal.
    var status: String? = nil
    let onOpen: () -> Void
    /// Closed by the back chevron. `revealed` is true once the ticket has landed, so
    /// the list unwraps the play; false when the fan bailed during the rip.
    let onDismiss: (_ revealed: Bool) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase = 0        // 0 pack · 1 shake · 2 tear · 3 the ticket rises out · 4 pack falls away, ticket lands · 5 stamp · 6 parked · 7 rows · 8 done
    @State private var pulse = false
    /// The quick rattle before the tear, and the light that sweeps the foil.
    @State private var shake = false
    @State private var sheen = false
    @State private var rowsStarted: Date? = nil
    @State private var pickStarted: Date? = nil
    /// Before a result: the game time with the most relevant of the game's
    /// significance, the series, or the wind (founder, Sep 22 2026).
    @State private var pregame: String? = nil
    /// The ticket's measured height: it parks right under the top bar and the
    /// board starts right under it.
    @State private var plateHeight: CGFloat = 150
    private static let barHeight: CGFloat = 36
    /// The pack's top strip, the part that tears away.
    private static let stripHeight: CGFloat = 78

    /// The reasons in the scorebook: the ones written when the ticket made
    /// the board (claim, the numbers behind it, the number to circle); else
    /// Gary's brief (three quick claims); else his take, sliced. His words,
    /// never rearranged.
    private var reasons: [LabFormat.Reason] {
        if let written = ticket.reasons, !written.isEmpty { return written }
        if let brief = ticket.brief { return brief.reasons.map { LabFormat.Reason(claim: $0, why: "") } }
        return LabFormat.reasons(from: ticket.game?.rationale ?? ticket.prop?.analysis, count: 3)
    }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            // 30% shorter than it drew (founder, Sep 24 2026), still centred.
            let packH = min(h * 0.5, 364)
            let packTop = h * 0.45 - packH / 2
            // Where the top tears off: the ticket rises out of this line.
            let mouthY = packTop + Self.stripHeight
            let parkedTop = Self.barHeight + 6
            ZStack(alignment: .top) {
                // The mock's stage is a solid panel, so once the pack is gone nothing of
                // the page underneath reads through it.
                Color(hex: "#070606").opacity(phase == 0 ? 0.6 : 0.995).ignoresSafeArea()
                    .onTapGesture { advance() }
                if phase >= 6 {
                    parked(top: parkedTop + plateHeight + 20)
                        .transition(.opacity)
                        .zIndex(1)
                }
                // the light inside the pack, brightest as the ticket rises out
                if phase == 3 || phase == 4 {
                    Circle().fill(GaryColors.warmGold)
                        .frame(width: 28, height: 28)
                        .shadow(color: GaryColors.warmGold.opacity(0.95), radius: phase == 3 ? 120 : 50)
                        .blur(radius: 8)
                        .opacity(phase == 3 ? 1 : 0)
                        .position(x: w / 2, y: mouthY + 12)
                        .transition(.opacity)
                        .allowsHitTesting(false)
                        .zIndex(2)
                }
                // the pack: in front while the ticket is inside it, behind once it falls
                if phase < 5 {
                    pack
                        .frame(width: min(w * 0.6, 240), height: packH)
                        .position(x: w / 2, y: h * 0.45)
                        .offset(x: phase == 1 ? (shake ? -5 : 5) : 0, y: phase == 4 ? 360 : 0)
                        .rotationEffect(.degrees(phase == 1 ? (shake ? -1.5 : 1.5) : (phase == 4 ? 7 : 0)))
                        .scaleEffect(phase == 0 ? (pulse ? 0.985 : 1) : 1)
                        .opacity(phase == 4 ? 0 : 1)
                        .allowsHitTesting(false)
                        .zIndex(phase >= 4 ? 3 : 6)
                }
                // gold flecks off the tear line
                if phase == 2 || phase == 3 {
                    LabTearFlecks()
                        .position(x: w / 2, y: mouthY)
                        .transition(.opacity)
                        .zIndex(7)
                }
                // The parked ticket's own ground: the board scrolls under it.
                if phase >= 6 {
                    Color(hex: "#070606").opacity(0.995)
                        .frame(height: parkedTop + plateHeight + 10)
                        .ignoresSafeArea(edges: .top)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                        .zIndex(4)
                }
                if phase >= 3 {
                    ticketLayer(w: w, h: h, packW: min(w * 0.6, 240), mouthY: mouthY, parkedTop: parkedTop)
                        .zIndex(5)
                }
                topBar.zIndex(8)
            }
        }
        .onAppear { run(); Task { await loadPregame() } }
    }

    /// One ticket from the rip to the parked page (founder, Sep 24 2026: "I
    /// should never lose sight of the actual pick"): it slides up out of the
    /// torn pack, hidden by the pack's front until it clears the top, springs
    /// to the middle, then glides up under the bar and stays there while the
    /// board scrolls.
    private func ticketLayer(w: CGFloat, h: CGFloat, packW: CGFloat, mouthY: CGFloat, parkedTop: CGFloat) -> some View {
        let parked = phase >= 6
        // The board's letters ride up as they are and turn into the card's
        // one-line pick once the ticket has arrived, never mid-flight.
        let settled = phase >= 7
        let plateW = min(w - 44, 380)
        // Inside the pack it fits the pack's mouth, so nothing shows past its sides.
        let inPack = (packW - 22) / plateW
        // Out of the wrapper all the way (founder, Sep 24 2026: "have the pick
        // actually come all the way out... instead of halfway"): its bottom
        // edge clears the torn top before the pack falls away.
        let y: CGFloat = parked ? parkedTop + plateHeight / 2 : (phase == 3 ? mouthY - plateHeight * inPack / 2 - 10 : h * 0.45)
        return ticketPlate(parked: settled)
            .animation(.easeInOut(duration: 0.25), value: settled)
            .frame(width: plateW)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                guard abs(height - plateHeight) > 0.5 else { return }
                withAnimation(.spring(response: 0.5, dampingFraction: 0.9)) { plateHeight = height }
            }
            // Only the ticket takes a tap: shaped after `position` it covered
            // the whole screen and the board under it could not scroll.
            .contentShape(Rectangle())
            .onTapGesture { onOpen() }
            .scaleEffect(phase == 3 ? inPack : 1)
            .rotation3DEffect(.degrees(phase == 3 ? 10 : 0), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
            .position(x: w / 2, y: y)
            // It starts inside the pack, never fading in from nowhere.
            .transition(.offset(y: plateHeight))
            .allowsHitTesting(parked)
    }

    /// Back at the left, the breakdown at the right, one slim line (founder,
    /// Sep 24 2026: the cross "is creating way too much space at the top...
    /// the pick and the full breakdown should be at the top"). The same
    /// chevron the breakdown page closes with.
    private var topBar: some View {
        HStack {
            Button { onDismiss(phase >= 4) } label: {
                Image(systemName: "chevron.left").font(.system(size: 14, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
                    .frame(width: 32, height: 28, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to the board")
            Spacer()
            if phase >= 6 {
                Button(action: onOpen) {
                    HStack(spacing: 6) {
                        Text("THE BREAKDOWN").font(GaryFonts.display(15)).tracking(1.3).foregroundStyle(GaryColors.gold)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(GaryColors.gold.opacity(0.7))
                    }
                    .frame(height: 28).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 22).padding(.top, 2).padding(.bottom, 6)
        // The stage's own ink behind the bar, so the scorebook scrolls under
        // it instead of through the chevron and THE BREAKDOWN.
        .background(Color(hex: "#070606").opacity(0.995).ignoresSafeArea(edges: .top))
    }

    /// The parked page: the board under the pinned ticket. It scrolls, so a
    /// long take is read in full and nothing sits in dead space.
    private func parked(top: CGFloat) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                if phase >= 7 { board }
                if phase >= 8, let summary = ticket.brief?.summary, !summary.isEmpty {
                    Text(summary)
                        .font(GaryFonts.text(15)).foregroundStyle(LabInk.reading)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }
                Color.clear.frame(height: 170)
            }
            .padding(.horizontal, 22)
            .padding(.top, top)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // The opening (founder, Sep 23 2026: "feel like we're truly unveiling";
    // Sep 24: "that it's coming out of the top... being unwrapped"). The pack
    // breathes under a sweeping light and rattles; the top tears off along a
    // jagged seam and flies away, gold flecks off the tear; the ticket slides
    // all the way up out of the opening, lit from inside; the pack falls away
    // and the ticket springs to full size.

    // MARK: - The pack

    private var pack: some View {
        VStack(spacing: 0) {
            // the top that tears away along the seam
            TornPiece(jagged: .bottom)
                .fill(LinearGradient(colors: [Color(hex: "#1B1712"), Color(hex: "#3A3018"), Color(hex: "#1B1712")], startPoint: .leading, endPoint: .trailing))
                .overlay(TornPiece(jagged: .bottom).stroke(GaryColors.gold.opacity(0.4), lineWidth: 1))
                .frame(height: Self.stripHeight)
                .rotationEffect(.degrees(phase >= 2 ? -34 : 0), anchor: .bottomLeading)
                .offset(x: phase >= 2 ? -110 : 0, y: phase >= 2 ? -170 : 0)
                .opacity(phase >= 3 ? 0 : 1)
                .zIndex(1)
            // what is left: open at the top once torn, dark inside
            ZStack {
                TornPiece(jagged: .top)
                    .fill(LinearGradient(colors: [Color(hex: "#0D0C0B"), Color(hex: "#2A2416"), Color(hex: "#0F0E0C"), Color(hex: "#3A3018"), Color(hex: "#0D0C0B")],
                                         startPoint: pulse ? .topLeading : .top, endPoint: pulse ? .bottomTrailing : .bottom))
                    .shadow(color: .black.opacity(0.6), radius: 24, y: 14)
                // the light that sweeps the foil while the pack waits; an overlay,
                // so its tall strip never sizes the pack
                Color.clear.overlay(
                    Rectangle()
                        .fill(LinearGradient(colors: [.clear, GaryColors.warmWhite.opacity(0.11), .clear], startPoint: .leading, endPoint: .trailing))
                        .frame(width: 72, height: 520)
                        .rotationEffect(.degrees(18))
                        .offset(x: sheen ? 200 : -200)
                        .blendMode(.screen)
                )
                .clipShape(TornPiece(jagged: .top))
                .allowsHitTesting(false)
                // inside the pack, once the top is gone
                LinearGradient(colors: [.black.opacity(0.85), .clear], startPoint: .top, endPoint: .bottom)
                    .frame(height: 46)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .clipShape(TornPiece(jagged: .top))
                    .opacity(phase >= 2 ? 1 : 0)
                VStack(spacing: 12) {
                    Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 92, height: 92)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .shadow(color: .black.opacity(0.6), radius: 14, y: 8)
                    // The mark is the brand; the pack does not need to shout the
                    // page's own name back (founder, Sep 22 2026). The date is what
                    // a fan actually wants off a sealed pack.
                    Text(LabFormat.shortDateWords(ticket.gameDate).uppercased())
                        .font(GaryFonts.display(18)).tracking(2.5).foregroundStyle(GaryColors.warmGold)
                }
                // the seam: a gold line before the tear, the torn lip after
                TornPiece(jagged: .top).stroke(GaryColors.gold.opacity(phase >= 2 ? 0.7 : 0.4), lineWidth: phase >= 2 ? 1.5 : 1)
            }
        }
    }

    // MARK: - The ticket

    private func ticketPlate(parked: Bool) -> some View {
        // The one ticket component (LabTicketPlate), so the unveil and the
        // breakdown it opens are the same design down to the spacing.
        // The over/under rides the stub, as on the Winners card.
        let split = LabFormat.splitDirection(LabFormat.ticketBody(ticket.pickText), league: ticket.league)
        return LabTicketPlate(
            league: ticket.league,
            matchup: LabFormat.shortMatchup(ticket.matchup, league: ticket.league),
            price: ticket.price,
            stakeUnits: ticket.stakeUnits,
            stateText: status ?? pregame ?? LabFormat.timeET(ticket.commence),
            state: LabTicketState(result: status),
            direction: split.direction,
            book: LabPlayModule.bestBook(ticket),
            compact: parked,
            showStamp: phase >= 5,
            stampRotated: !parked,
            pick: {
                if parked {
                    let full = split.body.uppercased()
                    let short = LabPlayModule.shortTitle(full, player: ticket.prop?.player, matchup: ticket.matchup)
                    // One line if it fits, the shorter name next; else it drops a
                    // line and grows a touch (founder, Sep 24 2026). Never "…".
                    ViewThatFits(in: .horizontal) {
                        Text(full).font(GaryFonts.display(34)).fixedSize()
                        Text(short).font(GaryFonts.display(34)).fixedSize()
                        Text(full).font(GaryFonts.display(38)).fixedSize(horizontal: false, vertical: true)
                    }
                    .foregroundStyle(GaryColors.warmWhite)
                } else {
                    LabFlapRow(text: split.body, columns: 14, started: pickStarted, instant: reduceMotion, big: true)
                }
            })
        .modifier(LabStampLanding(stamped: phase >= 5))
        // The glow swells as the ticket lands and settles once it has.
        .shadow(color: GaryColors.gold.opacity(phase == 4 ? 0.45 : 0.18), radius: phase == 4 ? 58 : 40)
    }

    /// The stamp lands oversized and snaps down, the way the mock's does.
    private struct LabStampLanding: ViewModifier {
        let stamped: Bool
        func body(content: Content) -> some View {
            content.animation(.spring(response: 0.35, dampingFraction: 0.55), value: stamped)
        }
    }

    // MARK: - The board

    private var board: some View {
        GaryScorebook(reasons: reasons, started: rowsStarted, instant: reduceMotion || phase >= 8)
    }

    /// "6:40 PM · Wild card race" / "6:40 PM · Series 1-1" / "6:40 PM · Wind 14 mph".
    private func loadPregame() async {
        guard status == nil else { return }
        let time = LabFormat.timeET(ticket.commence)
        var facts: [String] = []
        if let sig = ticket.game?.gameSignificance?.trimmingCharacters(in: .whitespaces), !sig.isEmpty,
           !["regular season", "regular-season"].contains(sig.lowercased()) { facts.append(sig) }
        if let ctx = ticket.game?.tournamentContext?.trimmingCharacters(in: .whitespaces), !ctx.isEmpty, !facts.contains(ctx) { facts.append(ctx) }
        if let board = await SupabaseAPI.fetchTomorrowBoard(date: ticket.gameDate) {
            let matchup = ticket.matchup
            if let row = (board.board ?? []).first(where: { LabFormat.sameMatchup("\($0.away_team ?? "") @ \($0.home_team ?? "")", matchup) }),
               let split = row.series?.split_line?.trimmingCharacters(in: .whitespaces), !split.isEmpty {
                facts.append("Series \(split)")
            }
            if let w = (board.weather ?? []).first(where: { LabFormat.sameMatchup($0.matchup ?? "", matchup) }) {
                if let mph = w.wind_mph, mph >= 8 { facts.append("Wind \(mph) mph") }
                else if let note = w.note?.trimmingCharacters(in: .whitespaces), !note.isEmpty { facts.append(note) }
            }
        }
        let line = facts.first.map { "\(time) · \($0)" } ?? time
        await MainActor.run { pregame = line }
    }

    // MARK: - The run

    private func run() {
        if reduceMotion {
            phase = 8; pickStarted = Date(); rowsStarted = Date()
            return
        }
        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulse = true }
        withAnimation(.linear(duration: 1.7).repeatForever(autoreverses: false)) { sheen = true }
        // the rattle: a quick left-right for the whole of phase 1
        step(after: 0.5, to: 1, animation: .easeInOut(duration: 0.08)) {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.easeInOut(duration: 0.07).repeatForever(autoreverses: true)) { shake = true }
        }
        // the tear: the top peels away, flecks fly
        step(after: 1.4, to: 2, animation: .easeInOut(duration: 0.85)) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.linear(duration: 0.01)) { shake = false }
        }
        // the ticket rises out of the mouth of the pack, lit from behind
        step(after: 2.25, to: 3, animation: .easeOut(duration: 0.75)) { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
        // the pack falls away and the ticket lands full size; the letters start to clatter
        step(after: 3.2, to: 4, animation: .spring(response: 0.62, dampingFraction: 0.74)) {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            pickStarted = Date()
        }
        step(after: 5.7, to: 5, animation: .spring(response: 0.35, dampingFraction: 0.6)) { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
        step(after: 6.6, to: 6, animation: .spring(response: 0.7, dampingFraction: 0.85))
        step(after: 7.2, to: 7, animation: .easeOut(duration: 0.3)) { rowsStarted = Date() }
        step(after: 7.2 + 0.7 * Double(max(reasons.count, 1)) + 2.2, to: 8, animation: .easeOut(duration: 0.3))
    }

    private func step(after delay: Double, to target: Int, animation: Animation, then: (() -> Void)? = nil) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard phase < target else { return }
            withAnimation(animation) { phase = target }
            then?()
        }
    }

    /// A tap during the run lands on the parked board with every row up.
    private func advance() {
        if phase >= 8 { return }
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { phase = 8 }
        if pickStarted == nil { pickStarted = Date() }
        if rowsStarted == nil { rowsStarted = Date() }
    }
}

/// One half of the pack along its torn seam: the strip that tears away has
/// rounded top corners and teeth along its bottom; the body left behind has
/// the matching notches along its top and rounded bottom corners, so before
/// the tear the two read as one pack with a seam across it.
private struct TornPiece: Shape {
    enum Edge { case top, bottom }
    let jagged: Edge
    var teeth = 11
    var depth: CGFloat = 8
    var radius: CGFloat = 14

    func path(in r: CGRect) -> Path {
        var p = Path()
        let step = r.width / CGFloat(teeth)
        switch jagged {
        case .bottom:
            p.move(to: CGPoint(x: r.minX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX, y: r.minY + radius))
            p.addQuadCurve(to: CGPoint(x: r.minX + radius, y: r.minY), control: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX - radius, y: r.minY))
            p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + radius), control: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
            // the teeth hang into the body's notches
            for i in stride(from: teeth - 1, through: 0, by: -1) {
                let x0 = r.minX + CGFloat(i) * step
                p.addLine(to: CGPoint(x: x0 + step / 2, y: r.maxY + depth))
                p.addLine(to: CGPoint(x: x0, y: r.maxY))
            }
            p.closeSubpath()
        case .top:
            p.move(to: CGPoint(x: r.minX, y: r.minY))
            for i in 0..<teeth {
                let x0 = r.minX + CGFloat(i) * step
                p.addLine(to: CGPoint(x: x0 + step / 2, y: r.minY + depth))
                p.addLine(to: CGPoint(x: x0 + step, y: r.minY))
            }
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - radius))
            p.addQuadCurve(to: CGPoint(x: r.maxX - radius, y: r.maxY), control: CGPoint(x: r.maxX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX + radius, y: r.maxY))
            p.addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - radius), control: CGPoint(x: r.minX, y: r.maxY))
            p.closeSubpath()
        }
        return p
    }
}

/// Gold flecks thrown off the tear line: ten small pieces of foil that fly
/// up and out and fade, each on its own fixed path so the burst reads the
/// same every time.
struct LabTearFlecks: View {
    @State private var flown = false
    private static let paths: [(dx: CGFloat, dy: CGFloat, spin: Double)] = [
        (-74, -62, 200), (-46, -96, -160), (-18, -118, 120), (16, -108, -220), (48, -88, 170),
        (82, -54, -140), (-96, -24, 90), (98, -28, -100), (-58, -34, 260), (62, -44, -190),
    ]
    var body: some View {
        ZStack {
            ForEach(Array(Self.paths.enumerated()), id: \.offset) { i, p in
                RoundedRectangle(cornerRadius: 0.8, style: .continuous)
                    .fill(i % 3 == 0 ? GaryColors.warmGold : GaryColors.gold)
                    .frame(width: i % 2 == 0 ? 3 : 4, height: i % 2 == 0 ? 6 : 4)
                    .rotationEffect(.degrees(flown ? p.spin : 0))
                    .offset(x: flown ? p.dx : 0, y: flown ? p.dy : 0)
                    .opacity(flown ? 0 : 1)
            }
        }
        .allowsHitTesting(false)
        .onAppear { withAnimation(.easeOut(duration: 0.8)) { flown = true } }
    }
}

/// A line on the split-flap board (the pick, on the unveil): the text fills
/// the cells by the word, the cells clatter through the alphabet and settle
/// left to right. Nothing is cut mid-word.
struct LabFlapRow: View {
    let text: String
    let columns: Int
    let started: Date?
    let instant: Bool
    /// The pick's own row: bigger cells, two lines.
    var big: Bool = false

    private static let alphabet: [Character] = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.+-%',")

    /// Lines of cells, filled by whole words.
    private var cells: [[Character]] {
        let cols = max(columns, 8)
        var lines: [[Character]] = Array(repeating: [], count: big ? 2 : 5)
        var line = 0
        for word in text.uppercased().split(separator: " ").map(String.init) {
            let need = word.count + (lines[line].isEmpty ? 0 : 1)
            if lines[line].count + need > cols {
                line += 1
                if line >= lines.count { break }
                if word.count > cols { break }
            }
            if !lines[line].isEmpty { lines[line].append(" ") }
            lines[line].append(contentsOf: word)
        }
        // A line ends at its last letter (founder, Sep 22 2026): no empty cells
        // trailing the words, so each row is exactly as wide as what it says.
        return lines.filter { !$0.isEmpty }
    }

    /// The clatter ends once the last cell has landed; the board then stops
    /// redrawing instead of ticking for as long as the page stays open.
    @State private var settled = false
    private var settleSeconds: Double { Double(max(columns, 8)) * 0.055 + Double(Self.alphabet.count + 6) * 0.04 + 0.1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TimelineView(.animation(minimumInterval: 0.045, paused: instant || settled || started == nil)) { context in
                let elapsed = started.map { context.date.timeIntervalSince($0) } ?? -1
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(cells.enumerated()), id: \.offset) { r, row in
                        HStack(spacing: 2) {
                            ForEach(Array(row.enumerated()), id: \.offset) { c, ch in
                                flap(target: ch, index: r * columns + c, elapsed: elapsed)
                            }
                        }
                    }
                }
            }
        }
        .task(id: started) {
            settled = false
            guard let started, !instant else { return }
            let wait = settleSeconds - Date().timeIntervalSince(started)
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            if !Task.isCancelled { settled = true }
        }
    }

    private func flap(target: Character, index: Int, elapsed: Double) -> some View {
        let blank = target == " "
        let shown: Character = {
            if blank { return " " }
            if instant || elapsed < 0 { return instant ? target : " " }
            let start = Double(index % columns) * 0.055
            let t = elapsed - start
            if t < 0 { return " " }
            let steps = Int(t / 0.04)
            let targetIndex = Self.alphabet.firstIndex(of: target) ?? 0
            return steps >= targetIndex + 6 ? target : Self.alphabet[(steps + index * 3) % Self.alphabet.count]
        }()
        // Clean cells (founder, Sep 22 2026): no line through the letters,
        // room around each one. The cell between two words is the same tile
        // with no letter on it; that empty tile is the space, never a darker
        // gap.
        return Text(String(shown))
            .font(GaryFonts.display(big ? 26 : 17))
            .foregroundStyle(GaryColors.warmWhite)
            .frame(width: big ? 16.5 : 12.6, height: big ? 36 : 27)
            .background(RoundedRectangle(cornerRadius: 3, style: .continuous).fill(Color(hex: "#1D1915")))
            .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(GaryColors.warmWhite.opacity(0.09), lineWidth: 1))
    }
}

// MARK: - Gary's scorebook

/// GARY'S SCOREBOOK (founder's pick, Sep 24 2026, mock 9): the reasons under
/// an unveiled pick on scorebook grid paper. Each reason's number is circled
/// in gold by hand with Gary's note under it, the claim and the numbers behind
/// it beside; a reason that rests on no number circles its place in the order.
/// Signed at the bottom. On the unveil the circles draw one after another.
struct GaryScorebook: View {
    let reasons: [LabFormat.Reason]
    /// When the first circle starts to draw; nil waits.
    var started: Date? = nil
    /// Everything drawn at once (Reduce Motion, or a tap that skips the run).
    var instant: Bool = false
    @State private var signed = false

    var body: some View {
        // The number column is as wide as a number needs; a board with none
        // circles only each reason's place and keeps its width for the words.
        let column: CGFloat = reasons.contains { $0.stat != nil } ? 104 : 40
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(reasons.enumerated()), id: \.offset) { i, reason in
                if i > 0 {
                    DashedLine().stroke(GaryColors.gold.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .frame(height: 1)
                }
                ScorebookRow(index: i, reason: reason, column: column,
                             start: started.map { $0.addingTimeInterval(Double(i) * 0.7) }, instant: instant)
            }
            // Signed in full (founder, Sep 24 2026: "write that out fully as
            // Gary AI instead of just G"), as Gary signs the parlay ticket.
            Text("— Gary A.I.")
                .font(GaryFonts.hand(28)).foregroundStyle(GaryColors.gold)
                .rotationEffect(.degrees(-4))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .opacity(signed || instant ? 1 : 0)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 12)
        .background(ScorebookPaper())
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(LabInk.hair, lineWidth: 1))
        .onAppear(perform: sign)
        .onChange(of: started) { _ in sign() }
    }

    /// The sign-off lands after the last circle.
    private func sign() {
        guard !signed, !instant, let started else { return }
        let at = started.addingTimeInterval(Double(max(reasons.count - 1, 0)) * 0.7 + 0.7)
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, at.timeIntervalSinceNow)) {
            withAnimation(.easeOut(duration: 0.3)) { signed = true }
        }
    }
}

private struct ScorebookRow: View {
    let index: Int
    let reason: LabFormat.Reason
    let column: CGFloat
    let start: Date?
    let instant: Bool
    @State private var drawn = false

    /// Words packed into lines no wider than `width`, measured in the note's
    /// own hand font. A word longer than the line keeps a line to itself.
    static func handLines(_ text: String, width: CGFloat, size: CGFloat = 18) -> [String] {
        let font = UIFont(name: "Caveat-SemiBold", size: size) ?? .systemFont(ofSize: size)
        func measure(_ s: String) -> CGFloat { (s as NSString).size(withAttributes: [.font: font]).width }
        var lines: [String] = []
        var current = ""
        for word in text.split(separator: " ").map(String.init) {
            let candidate = current.isEmpty ? word : current + " " + word
            if current.isEmpty || measure(candidate) <= width {
                current = candidate
            } else {
                lines.append(current)
                current = word
            }
        }
        if !current.isEmpty { lines.append(current) }
        return lines
    }

    var body: some View {
        let shown = drawn || instant
        // Mock 9's measures: a 104pt number column, 18 between the columns,
        // the number in 38pt Bebas, the claim 16.5 bold, the why 13.5.
        HStack(alignment: .top, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(reason.stat ?? "\(index + 1)")
                    .font(GaryFonts.display(35.2)).foregroundStyle(GaryColors.warmWhite)
                    .monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .overlay(
                        HandCircle()
                            .trim(from: 0, to: shown ? 1 : 0)
                            .stroke(GaryColors.gold, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                            .padding(-3)
                    )
                if let note = reason.note {
                    // Every word of the note, broken into lines by the hand
                    // font's own measure. SwiftUI's wrap gave this face about
                    // 60 of the column's 104 points and cut "changeup chase
                    // ra…" (design.md: never "…").
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(Self.handLines(note, width: column).enumerated()), id: \.offset) { _, line in
                            Text(line).font(GaryFonts.hand(18)).foregroundStyle(GaryColors.gold).fixedSize()
                        }
                    }
                }
            }
            .frame(width: column, alignment: .leading)
            VStack(alignment: .leading, spacing: 5) {
                Text(reason.claim)
                    .font(.system(size: 16.5, weight: .bold)).foregroundStyle(GaryColors.warmWhite)
                    .lineSpacing(1.5)
                    .fixedSize(horizontal: false, vertical: true)
                if !reason.why.isEmpty {
                    Text(reason.why)
                        .font(.system(size: 13.5)).foregroundStyle(LabInk.dim).lineSpacing(3.5)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, 18).padding(.bottom, 16).padding(.horizontal, 4)
        .opacity(shown ? 1 : 0)
        .accessibilityElement(children: .combine)
        .onAppear(perform: draw)
        .onChange(of: start) { _ in draw() }
    }

    private func draw() {
        guard !drawn, !instant, let start else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, start.timeIntervalSinceNow)) {
            withAnimation(.easeOut(duration: 0.55)) { drawn = true }
        }
    }
}

/// A circle drawn by hand around a number: a little tilted, not quite round,
/// its end running past where it began.
private struct HandCircle: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height, x = rect.minX, y = rect.minY
        func pt(_ a: CGFloat, _ b: CGFloat) -> CGPoint { CGPoint(x: x + w * a, y: y + h * b) }
        var p = Path()
        p.move(to: pt(0.56, 0.04))
        p.addCurve(to: pt(1.0, 0.54), control1: pt(0.92, -0.03), control2: pt(1.05, 0.22))
        p.addCurve(to: pt(0.1, 0.86), control1: pt(0.95, 0.97), control2: pt(0.34, 1.04))
        p.addCurve(to: pt(0.13, 0.15), control1: pt(-0.05, 0.72), control2: pt(-0.03, 0.3))
        p.addCurve(to: pt(0.74, 0.1), control1: pt(0.3, 0.0), control2: pt(0.56, -0.02))
        return p
    }
}

/// Scorebook paper: faint gold squares on the plate.
private struct ScorebookPaper: View {
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: "#0F0D0B")))
            let step: CGFloat = 18
            var lines = Path()
            var x: CGFloat = 0
            while x <= size.width { lines.move(to: CGPoint(x: x, y: 0)); lines.addLine(to: CGPoint(x: x, y: size.height)); x += step }
            var y: CGFloat = 0
            while y <= size.height { lines.move(to: CGPoint(x: 0, y: y)); lines.addLine(to: CGPoint(x: size.width, y: y)); y += step }
            ctx.stroke(lines, with: .color(GaryColors.gold.opacity(0.06)), lineWidth: 1)
        }
        .accessibilityHidden(true)
    }
}
