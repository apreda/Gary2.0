import SwiftUI

/// Fresh-account / failed-fetch placeholder — the scroll area below the
/// header never renders blank (App Review runs empty states).
struct HomeContentPlaceholder: View {
    let loading: Bool
    /// A HARD source failure (auth/schema), not an empty board. Without this the
    /// two were indistinguishable and a broken fetch rendered "Gary posts his
    /// picks a few hours before games" — an affirmative claim about the board
    /// that nobody had verified. A failed fetch is not an empty result.
    var sourceFailed: Bool = false
    var body: some View {
        VStack(spacing: 14) {
            if loading {
                ProgressView().tint(GaryColors.gold.opacity(0.85))
                Text("Loading tonight's board…")
                    .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6))
            } else if sourceFailed {
                Image(systemName: "antenna.radiowaves.left.and.right.slash")
                    .font(.system(size: 30, weight: .light)).foregroundStyle(GaryColors.gold.opacity(0.7))
                Text("BOARD DATA UNAVAILABLE")
                    .font(GaryFonts.mono(13, bold: true)).tracking(0.7)
                    .foregroundStyle(.white.opacity(0.85))
                Text("Gary's board could not be reached. Pull down to retry.")
                    .font(GaryFonts.text(12.5)).foregroundStyle(.white.opacity(0.55))
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            } else {
                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 30, weight: .light)).foregroundStyle(GaryColors.gold.opacity(0.7))
                Text("Nothing on the board yet")
                    .font(GaryFonts.text(15, .semibold)).foregroundStyle(.white.opacity(0.85))
                Text("Gary posts his picks a few hours before games. Pull down to refresh.")
                    .font(GaryFonts.text(12.5)).foregroundStyle(.white.opacity(0.55))
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32).padding(.vertical, 60)
    }
}
