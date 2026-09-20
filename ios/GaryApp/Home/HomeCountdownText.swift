import SwiftUI

/// 1Hz live countdown to the next first pitch/kickoff — a chip, not a hero.
struct HomeCountdownText: View {
    let target: Date
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    /// Base size — the hero's clock column runs it smaller than the old
    /// full-width clock did.
    var size: CGFloat = 24

    var body: some View {
        if activePage, scenePhase == .active {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                countdown(at: ctx.date)
            }
        } else {
            countdown(at: Date())
        }
    }

    private func countdown(at date: Date) -> some View {
        let s = max(0, Int(target.timeIntervalSince(date)))
        // Gold and tabular (A pass, Jul 26): the clock is the card's
        // pulse — and never jitters. No leading zero on the lead unit
        // (founder, Jul 27) — it reads like a clock, not a stopwatch:
        // "9:55:16", and "55:16" once the hour is gone.
        let h = s / 3600, m = (s % 3600) / 60
        return Text(s == 0 ? "ANY MINUTE"
                    : (h > 0 ? String(format: "%d:%02d:%02d", h, m, s % 60)
                             : String(format: "%d:%02d", m, s % 60)))
            .font(GaryFonts.mono(size, bold: true))
            .foregroundStyle(GaryColors.gold)
    }
}

