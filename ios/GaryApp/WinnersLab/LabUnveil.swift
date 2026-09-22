import SwiftUI
import UIKit

// THE WINNERS LAB — the unveil (founder's pick, Sep 22 2026: U2's pack with
// U4's board folded in). A sealed play opens full screen: the foil pack
// shakes, the top tears, a flare, the ticket lands; then the ticket parks at
// the top and three reasons from Gary's own take clatter in underneath on a
// split-flap board. A tap during the run skips to the parked board; a tap on
// the parked board opens the breakdown.

struct LabUnveilOverlay: View {
    let ticket: LabBoardTicket
    /// The play's state in words ("Win, WSH 2 · DET 9", "Live, Q1 7:46"); nil before the seal.
    var status: String? = nil
    let onOpen: () -> Void
    let onDismiss: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase = 0        // 0 pack · 1 shake · 2 tear · 3 flare · 4 pack gone, ticket lands · 5 stamp · 6 parked · 7 rows · 8 done
    @State private var pulse = false
    @State private var rowsStarted: Date? = nil
    @State private var pickStarted: Date? = nil
    /// Before a result: the game time with the most relevant of the game's
    /// significance, the series, or the wind (founder, Sep 22 2026).
    @State private var pregame: String? = nil

    /// The three reasons: a prop's own key stats, else the first three
    /// sentences of the take. Gary's words, never rearranged.
    private var reasons: [String] {
        if let stats = ticket.prop?.key_stats, !stats.isEmpty { return Array(stats.prefix(3)) }
        let take = ticket.game?.rationale ?? ticket.prop?.analysis
        return LabFormat.sentences(take, count: 3)
    }

    var body: some View {
        ZStack {
            Color.black.opacity(phase == 0 ? 0.6 : 0.94).ignoresSafeArea()
                .onTapGesture { advance() }
            content.allowsHitTesting(false)
        }
        .onAppear { GaryTalkContext.shared.hidden = true; run(); Task { await loadPregame() } }
        .onDisappear { GaryTalkContext.shared.hidden = false; GaryVoice.shared.stop() }
    }

    private var content: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack(alignment: .top) {
                // the pack
                if phase < 4 {
                    pack
                        .frame(width: min(w * 0.6, 240), height: min(h * 0.5, 400))
                        .position(x: w / 2, y: h * 0.45)
                        .offset(x: phase == 1 ? (pulse ? -6 : 6) : 0)
                        .rotationEffect(.degrees(phase == 1 ? (pulse ? -1 : 1) : 0))
                        .scaleEffect(phase == 0 ? 0.98 : 1)
                }
                if phase == 3 {
                    Circle().fill(GaryColors.warmGold)
                        .frame(width: 24, height: 24)
                        .shadow(color: GaryColors.warmGold.opacity(0.9), radius: 90)
                        .blur(radius: 6)
                        .position(x: w / 2, y: h * 0.45)
                        .transition(.opacity)
                }
                // the ticket: lands mid-screen, then parks at the top
                if phase >= 4 {
                    ticketPlate(parked: phase >= 6)
                        .frame(width: min(w - 44, 346))
                        .position(x: w / 2, y: phase >= 6 ? 120 : h * 0.45)
                }
                // the board
                if phase >= 7 {
                    board(width: min(w - 44, 346))
                        .position(x: w / 2, y: 120 + 100 + boardHeight / 2)
                }
                if phase >= 8 {
                    HStack {
                        Text("THE BREAKDOWN").font(GaryFonts.display(16)).tracking(1.5).foregroundStyle(GaryColors.gold)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(LabInk.dimmer)
                    }
                    .padding(.top, 14)
                    .overlay(alignment: .top) { LabHairline() }
                    .frame(width: min(w - 44, 346))
                    .position(x: w / 2, y: h - 120)
                    .transition(.opacity)
                }
            }
        }
    }

    private var boardHeight: CGFloat { CGFloat(reasons.count) * 92 }

    // MARK: - The pack

    private var pack: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#0D0C0B"), Color(hex: "#2A2416"), Color(hex: "#0F0E0C"), Color(hex: "#3A3018"), Color(hex: "#0D0C0B")],
                                     startPoint: pulse ? .topLeading : .top, endPoint: pulse ? .bottomTrailing : .bottom))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(GaryColors.gold.opacity(0.4), lineWidth: 1))
                .shadow(color: .black.opacity(0.6), radius: 24, y: 14)
            VStack(spacing: 12) {
                Spacer(minLength: 0)
                Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .shadow(color: .black.opacity(0.6), radius: 14, y: 8)
                Text("WINNERS").font(GaryFonts.display(28)).tracking(3).foregroundStyle(GaryColors.warmGold)
                Text(LabFormat.shortDateWords(ticket.gameDate).uppercased()).font(GaryFonts.display(13)).tracking(2).foregroundStyle(GaryColors.gold.opacity(0.8))
                Spacer(minLength: 0)
            }
            .padding(.top, 40)
            // the top that tears away
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: "#1B1712"), Color(hex: "#3A3018"), Color(hex: "#1B1712")], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 96)
                    .overlay(alignment: .bottom) { DashedLine().stroke(GaryColors.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])).frame(height: 1) }
                    .rotationEffect(.degrees(phase >= 2 ? -38 : 0), anchor: .topLeading)
                    .offset(x: phase >= 2 ? -40 : 0, y: phase >= 2 ? -140 : 0)
                    .opacity(phase >= 2 ? 0 : 1)
                Spacer(minLength: 0)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    // MARK: - The ticket

    private func ticketPlate(parked: Bool) -> some View {
        // Two columns (founder, Sep 22 2026): the league, the ticket and the
        // price on the left; the matchup, the money and the result stacked on
        // the right, the money in the middle of those two. Before a result the
        // right column's bottom line is the game time with the most relevant
        // of the significance, the series or the wind.
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(ticket.league).font(GaryFonts.display(14)).tracking(1.4).foregroundStyle(GaryColors.gold)
                if parked {
                    Text(LabFormat.ticketBody(ticket.pickText).uppercased())
                        .font(GaryFonts.display(36))
                        .foregroundStyle(GaryColors.warmWhite)
                        .lineLimit(2).minimumScaleFactor(0.55)
                        .padding(.top, 10)
                } else {
                    LabFlapRow(text: LabFormat.ticketBody(ticket.pickText), columns: 14, started: pickStarted, instant: reduceMotion, big: true, caption: false)
                        .padding(.top, 16)
                }
                Text(LabFormat.price(ticket.price)).font(GaryFonts.display(28)).foregroundStyle(GaryColors.silver)
                    .padding(.top, 6)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(LabFormat.shortMatchup(ticket.matchup)).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 6)
                if phase >= 5 {
                    LabUnitStamp(units: ticket.stakeUnits, size: 30)
                        .rotationEffect(.degrees(-8))
                        .transition(.scale(scale: 2.2).combined(with: .opacity))
                }
                Spacer(minLength: 6)
                Text(status ?? pregame ?? LabFormat.timeET(ticket.commence))
                    .font(GaryFonts.ui(12, .medium)).foregroundStyle(status == nil ? GaryColors.gold.opacity(0.85) : LabInk.dim)
                    .multilineTextAlignment(.trailing).lineLimit(2).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: 150, maxHeight: .infinity, alignment: .trailing)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 18).padding(.vertical, parked ? 14 : 18)
        .labPlate(radius: 18, fill: LabInk.plate, edge: GaryColors.gold.opacity(0.7))
        .shadow(color: GaryColors.gold.opacity(0.18), radius: 40)
    }

    // MARK: - The board

    private func board(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array(reasons.enumerated()), id: \.offset) { index, reason in
                LabFlapRow(text: reason, columns: Int(width / 14.6), started: rowsStarted.map { $0.addingTimeInterval(Double(index) * 0.7) }, instant: reduceMotion || phase >= 8)
            }
        }
        .frame(width: width, alignment: .leading)
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
        step(after: 0.5, to: 1, animation: .easeInOut(duration: 0.12))
        step(after: 1.4, to: 2, animation: .easeInOut(duration: 0.9)) { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
        step(after: 2.2, to: 3, animation: .easeOut(duration: 0.3))
        step(after: 2.7, to: 4, animation: .spring(response: 0.6, dampingFraction: 0.72)) {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            pickStarted = Date()
        }
        step(after: 5.4, to: 5, animation: .spring(response: 0.35, dampingFraction: 0.6)) { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
        step(after: 6.3, to: 6, animation: .spring(response: 0.7, dampingFraction: 0.85))
        step(after: 6.9, to: 7, animation: .easeOut(duration: 0.3)) { rowsStarted = Date() }
        step(after: 6.9 + 0.7 * Double(max(reasons.count, 1)) + 2.2, to: 8, animation: .easeOut(duration: 0.3))
    }

    private func step(after delay: Double, to target: Int, animation: Animation, then: (() -> Void)? = nil) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard phase < target else { return }
            withAnimation(animation) { phase = target }
            then?()
        }
    }

    /// A tap during the run lands on the parked board; a tap on the parked
    /// board opens the breakdown.
    private func advance() {
        if phase >= 8 { onOpen(); return }
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { phase = 8 }
        if pickStarted == nil { pickStarted = Date() }
        if rowsStarted == nil { rowsStarted = Date() }
    }
}

/// One reason on the split-flap board: the words fill the cells by the
/// word, the cells clatter through the alphabet and settle left to right;
/// the whole reason reads plainly underneath. Nothing is cut mid-word; a
/// reason longer than the cells shows its first words on the flaps.
struct LabFlapRow: View {
    let text: String
    let columns: Int
    let started: Date?
    let instant: Bool
    /// The pick's own row: bigger cells, and no plain line under it.
    var big: Bool = false
    var caption: Bool = true

    private static let alphabet: [Character] = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.+-%'")

    /// Two lines of cells, filled by whole words.
    private var cells: [[Character]] {
        let cols = max(columns, 8)
        var lines: [[Character]] = [[], []]
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
        return lines.filter { !$0.isEmpty }.map { row in
            var r = row; while r.count < cols { r.append(" ") }; return r
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
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
            if caption {
                let settled = instant || (started.map { Date().timeIntervalSince($0) > 2.0 } ?? false)
                Text(text).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
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
        // room around each one.
        return Text(String(shown))
            .font(GaryFonts.display(big ? 26 : 17))
            .foregroundStyle(GaryColors.warmWhite)
            .frame(width: big ? 16.5 : 12.6, height: big ? 36 : 27)
            .background(RoundedRectangle(cornerRadius: 3, style: .continuous).fill(blank ? Color(hex: "#110F0D") : Color(hex: "#1D1915")))
            .overlay(RoundedRectangle(cornerRadius: 3, style: .continuous).stroke(GaryColors.warmWhite.opacity(blank ? 0.04 : 0.09), lineWidth: 1))
    }
}
