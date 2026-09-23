import SwiftUI
import UIKit

// THE WINNERS LAB — the unveil (founder's pick, Sep 22 2026: U2's pack with
// U4's board folded in). A sealed play opens full screen: the foil pack
// shakes, the top tears, a flare, the ticket lands; then the ticket parks at
// the top and three reasons from Gary's own take clatter in underneath on a
// split-flap board, each with the numbers behind it in plain words. A tap
// during the run skips to the parked board. The parked page scrolls; the
// ticket or THE BREAKDOWN opens the breakdown, the cross closes the unveil
// and the real ticket takes the pack's slot on the list.

struct LabUnveilOverlay: View {
    let ticket: LabBoardTicket
    /// The play's state in words ("Win, WSH 2 · DET 9", "Live, Q1 7:46"); nil before the seal.
    var status: String? = nil
    let onOpen: () -> Void
    /// Closed by the cross. `revealed` is true once the ticket has landed, so
    /// the list unwraps the play; false when the fan bailed during the rip.
    let onDismiss: (_ revealed: Bool) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var stage
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

    /// The three reasons, each a paragraph of Gary's take: the claim on the
    /// flaps, the numbers behind it underneath. His words, never rearranged.
    /// The reasons the server wrote for this ticket (claim on the flaps, the
    /// numbers under it, three or four of them); until it has, the take sliced.
    /// Gary's brief leads (founder, Sep 23 2026: three quick reasons he wrote
    /// himself, then a short summary, the full breakdown a tap away).
    private var reasons: [LabFormat.Reason] {
        if let brief = ticket.brief { return brief.reasons.map { LabFormat.Reason(claim: $0, why: "") } }
        return ticket.reasons ?? LabFormat.reasons(from: ticket.game?.rationale ?? ticket.prop?.analysis, count: 3)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // The mock's stage is a solid panel, so once the pack is gone nothing of
            // the page underneath reads through it.
            Color(hex: "#070606").opacity(phase == 0 ? 0.6 : 0.995).ignoresSafeArea()
                .onTapGesture { advance() }
            if phase >= 6 { parked } else { content.allowsHitTesting(false) }
            Button { onDismiss(phase >= 4) } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(GaryColors.warmWhite.opacity(0.85))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.08)))
                    .overlay(Circle().stroke(GaryColors.warmWhite.opacity(0.12), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.trailing, 18).padding(.top, 8)
        }
        .onAppear { GaryTalkContext.shared.hidden = true; run(); Task { await loadPregame() } }
        .onDisappear { GaryTalkContext.shared.hidden = false; GaryVoice.shared.stop() }
    }

    /// The parked page: the ticket, the board under it, the way into the
    /// breakdown right under the board. It scrolls, so a long take is read in
    /// full and nothing sits in dead space.
    private var parked: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                ticketPlate(parked: true)
                    .matchedGeometryEffect(id: "ticket", in: stage)
                    .padding(.top, 52)
                    .onTapGesture { onOpen() }
                if phase >= 7 { board }
                if phase >= 8, let summary = ticket.brief?.summary, !summary.isEmpty {
                    Text(summary)
                        .font(GaryFonts.text(15)).foregroundStyle(LabInk.reading)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }
                if phase >= 8 {
                    Button(action: onOpen) {
                        HStack {
                            Text("THE BREAKDOWN").font(GaryFonts.display(16)).tracking(1.5).foregroundStyle(GaryColors.gold)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(LabInk.dimmer)
                        }
                        .padding(.top, 14)
                        .overlay(alignment: .top) { LabHairline() }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .transition(.opacity)
                }
                Color.clear.frame(height: 170)
            }
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// The opening (founder, Sep 23 2026: "feel like we're truly unveiling").
    /// The pack breathes under a sweeping light and rattles; the top tears
    /// off and gold flecks fly; the ticket rises out of the mouth of the pack,
    /// small and tilted, lit from behind; then the pack falls away beneath it
    /// and the ticket springs to full size mid-screen. At 6 it parks up top.
    private var content: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let packH = min(h * 0.5, 400)
            let packTop = h * 0.45 - packH / 2
            ZStack(alignment: .top) {
                // the light at the mouth of the pack, brightest as the ticket rises
                if phase == 3 || phase == 4 {
                    Circle().fill(GaryColors.warmGold)
                        .frame(width: 28, height: 28)
                        .shadow(color: GaryColors.warmGold.opacity(0.95), radius: phase == 3 ? 120 : 50)
                        .blur(radius: 8)
                        .opacity(phase == 3 ? 1 : 0)
                        .position(x: w / 2, y: packTop + 16)
                        .transition(.opacity)
                        .zIndex(0)
                }
                // the ticket: out of the pack at 3, landed at 4, parked at 6
                if phase >= 3 {
                    ticketPlate(parked: false)
                        .matchedGeometryEffect(id: "ticket", in: stage)
                        .frame(width: min(w - 44, 346))
                        .scaleEffect(phase == 3 ? 0.62 : 1)
                        .rotation3DEffect(.degrees(phase == 3 ? 12 : 0), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
                        .position(x: w / 2, y: phase == 3 ? packTop - 34 : h * 0.45)
                        .transition(.offset(y: 120).combined(with: .opacity))
                        .zIndex(1)
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
                        .zIndex(phase >= 4 ? 0 : 2)
                }
                // gold flecks off the tear line
                if phase == 2 || phase == 3 {
                    LabTearFlecks()
                        .position(x: w / 2, y: packTop + 96)
                        .transition(.opacity)
                        .zIndex(3)
                }
            }
        }
    }

    // MARK: - The pack

    private var pack: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#0D0C0B"), Color(hex: "#2A2416"), Color(hex: "#0F0E0C"), Color(hex: "#3A3018"), Color(hex: "#0D0C0B")],
                                     startPoint: pulse ? .topLeading : .top, endPoint: pulse ? .bottomTrailing : .bottom))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(GaryColors.gold.opacity(0.4), lineWidth: 1))
                .shadow(color: .black.opacity(0.6), radius: 24, y: 14)
            // the light that sweeps the foil while the pack waits
            Rectangle()
                .fill(LinearGradient(colors: [.clear, GaryColors.warmWhite.opacity(0.11), .clear], startPoint: .leading, endPoint: .trailing))
                .frame(width: 72, height: 520)
                .rotationEffect(.degrees(18))
                .offset(x: sheen ? 200 : -200)
                .blendMode(.screen)
                .allowsHitTesting(false)
            VStack(spacing: 12) {
                Spacer(minLength: 0)
                Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .shadow(color: .black.opacity(0.6), radius: 14, y: 8)
                // The mark is the brand; the pack does not need to shout the
                // page's own name back (founder, Sep 22 2026). The date is what
                // a fan actually wants off a sealed pack.
                Text(LabFormat.shortDateWords(ticket.gameDate).uppercased())
                    .font(GaryFonts.display(18)).tracking(2.5).foregroundStyle(GaryColors.warmGold)
                Spacer(minLength: 0)
            }
            .padding(.top, 40)
            // the top that tears away
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: "#1B1712"), Color(hex: "#3A3018"), Color(hex: "#1B1712")], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 96)
                    .overlay(alignment: .bottom) { DashedLine().stroke(GaryColors.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])).frame(height: 1) }
                    .rotationEffect(.degrees(phase >= 2 ? -46 : 0), anchor: .topLeading)
                    .offset(x: phase >= 2 ? -48 : 0, y: phase >= 2 ? -190 : 0)
                    .opacity(phase >= 2 ? 0 : 1)
                Spacer(minLength: 0)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - The ticket

    private func ticketPlate(parked: Bool) -> some View {
        // The one ticket component (LabTicketPlate), so the unveil and the
        // breakdown it opens are the same design down to the spacing.
        LabTicketPlate(
            league: ticket.league,
            matchup: LabFormat.shortMatchup(ticket.matchup),
            price: ticket.price,
            stakeUnits: ticket.stakeUnits,
            stateText: status ?? pregame ?? LabFormat.timeET(ticket.commence),
            state: LabTicketState(result: status),
            compact: parked,
            showStamp: phase >= 5,
            pick: {
                if parked {
                    Text(LabFormat.ticketBody(ticket.pickText).uppercased())
                        .font(GaryFonts.display(38))
                        .foregroundStyle(GaryColors.warmWhite)
                        .lineLimit(2).minimumScaleFactor(0.55)
                } else {
                    LabFlapRow(text: LabFormat.ticketBody(ticket.pickText), columns: 14, started: pickStarted, instant: reduceMotion, big: true)
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
        VStack(alignment: .leading, spacing: 18) {
            ForEach(Array(reasons.enumerated()), id: \.offset) { index, reason in
                LabFlapRow(text: reason.claim, detail: reason.why, columns: 23,
                           started: rowsStarted.map { $0.addingTimeInterval(Double(index) * 0.7) },
                           instant: reduceMotion || phase >= 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        step(after: 2.25, to: 3, animation: .easeOut(duration: 0.6)) { UIImpactFeedbackGenerator(style: .soft).impactOccurred() }
        // the pack falls away and the ticket lands full size; the letters start to clatter
        step(after: 3.0, to: 4, animation: .spring(response: 0.62, dampingFraction: 0.74)) {
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

/// Gold flecks thrown off the tear line: ten small pieces of foil that fly
/// up and out and fade, each on its own fixed path so the burst reads the
/// same every time.
private struct LabTearFlecks: View {
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

/// One reason on the split-flap board: the claim fills the cells by the
/// word, the cells clatter through the alphabet and settle left to right,
/// and the numbers behind the claim read plainly underneath. Nothing is cut
/// mid-word and nothing repeats.
struct LabFlapRow: View {
    let text: String
    /// The plain line under the flaps; nil draws the flaps alone.
    var detail: String? = nil
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

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TimelineView(.periodic(from: .now, by: 0.045)) { context in
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
            if let detail, !detail.isEmpty {
                let settled = instant || (started.map { Date().timeIntervalSince($0) > 2.0 } ?? false)
                Text(detail).font(GaryFonts.ui(13, .medium)).foregroundStyle(LabInk.dim)
                    .lineSpacing(2.5)
                    .fixedSize(horizontal: false, vertical: true)
                    .opacity(settled ? 1 : 0)
                    .animation(.easeOut(duration: 0.35), value: settled)
            }
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
