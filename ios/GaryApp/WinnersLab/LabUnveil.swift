import SwiftUI
import UIKit

// THE WINNERS LAB — the unveil. A sealed play opens full screen: the seal
// line breaks, the ticket lands, the price and the stake follow, then the
// desk opens. One motion; a tap skips ahead.

struct LabUnveilOverlay: View {
    let ticket: LabBoardTicket
    /// The play's state in words ("Win, WSH 2 · DET 9", "Live, Q1 7:46"); nil before the seal.
    var status: String? = nil
    let onOpen: () -> Void
    let onDismiss: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase = 0
    @State private var pulse = false

    var body: some View {
        ZStack {
            Color.black.opacity(phase == 0 ? 0 : 0.94).ignoresSafeArea()
                .onTapGesture { advance(toEnd: true) }
            VStack(spacing: 0) {
                Spacer()
                plate
                Spacer()
            }
            .allowsHitTesting(false)
        }
        .onAppear { run() }
        .onDisappear { GaryVoice.shared.stop() }
    }

    private var plate: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(ticket.league).font(GaryFonts.display(14)).tracking(1.4).foregroundStyle(GaryColors.gold)
                Spacer()
                Text(ticket.matchup).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 18).padding(.top, 16)

            // The seal: one dashed line that splits in two.
            ZStack {
                HStack(spacing: 0) {
                    seal.offset(x: phase >= 1 ? -40 : 0).opacity(phase >= 1 ? 0 : 1)
                    seal.offset(x: phase >= 1 ? 40 : 0).opacity(phase >= 1 ? 0 : 1)
                }
                if phase == 0 {
                    Text("SEALED").font(GaryFonts.display(13)).tracking(2).foregroundStyle(GaryColors.gold.opacity(pulse ? 1 : 0.55))
                        .padding(.horizontal, 10).background(LabInk.plate)
                }
            }
            .frame(height: 30)
            .padding(.top, 14)

            VStack(alignment: .leading, spacing: 6) {
                Text(LabFormat.ticketBody(ticket.pickText).uppercased())
                    .font(GaryFonts.display(phase >= 2 ? 44 : 30))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(3).minimumScaleFactor(0.55)
                    .opacity(phase >= 2 ? 1 : 0)
                    .scaleEffect(phase >= 2 ? 1 : 0.92, anchor: .leading)
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text(LabFormat.price(ticket.price)).font(GaryFonts.display(30)).foregroundStyle(GaryColors.silver)
                    LabUnitStamp(units: ticket.stakeUnits, size: 30)
                    Spacer()
                    if let status {
                        Text(status).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    } else if let commence = ticket.commence {
                        Text("Seals \(LabFormat.timeET(commence))").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    }
                }
                .opacity(phase >= 3 ? 1 : 0)
                .offset(y: phase >= 3 ? 0 : 8)
            }
            .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 20)
            .frame(minHeight: 150, alignment: .topLeading)
        }
        .frame(width: 340)
        .labPlate(radius: 18, fill: LabInk.plate, edge: GaryColors.gold.opacity(phase >= 2 ? 0.7 : 0.35))
        .shadow(color: GaryColors.gold.opacity(phase >= 2 ? 0.18 : 0), radius: 40)
        .scaleEffect(phase == 0 ? 0.96 : 1)
    }

    private var seal: some View {
        Rectangle().fill(.clear).frame(maxWidth: .infinity).frame(height: 1)
            .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
    }

    private func run() {
        if reduceMotion {
            phase = 4
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { if phase >= 4 { onOpen() } }
            return
        }
        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { pulse = true }
        step(after: 0.55, to: 1, animation: .spring(response: 0.5, dampingFraction: 0.72))
        step(after: 0.95, to: 2, animation: .spring(response: 0.55, dampingFraction: 0.7)) {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        }
        step(after: 1.5, to: 3, animation: .easeOut(duration: 0.35))
        step(after: 2.1, to: 4, animation: .easeOut(duration: 0.3))
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.6) { if phase >= 4 { onOpen() } }
    }

    private func step(after delay: Double, to target: Int, animation: Animation, then: (() -> Void)? = nil) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard phase < target else { return }
            withAnimation(animation) { phase = target }
            then?()
        }
    }

    private func advance(toEnd: Bool) {
        if phase >= 4 { onOpen(); return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) { phase = 4 }
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { if phase >= 4 { onOpen() } }
    }
}
