import SwiftUI

/// THE WINNERS STUB — the premium card as a sealed slip object (the ticket
/// idea, living where slips belong). One tap → Winners.
struct HomeWinnersStub: View {
    let onOpen: () -> Void
    /// Real information that earns the tap (founder, Jul 12): how many plays
    /// are sealed, which sports, and when the next one seals. All optional —
    /// the strip degrades to the plain door when Home has nothing yet.
    var plays: Int = 0
    var leagues: String? = nil
    var nextSeal: String? = nil

    private var valueLine: String? {
        if plays > 0 {
            let count = "\(plays) play\(plays == 1 ? "" : "s") sealed"
            return leagues.map { "\(count) · \($0)" } ?? count
        }
        if let nextSeal { return "First play seals ~\(nextSeal)" }
        return nil
    }

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text("WINNERS")
                        .font(GaryFonts.accent(12)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text("DAILY REVIEW")
                        .font(GaryFonts.accent(10)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold.opacity(0.85))
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                Rectangle()
                    .fill(Color.clear)
                    .frame(height: 1)
                    .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("The Daily Card")
                            .font(GaryFonts.display(25))
                            .foregroundStyle(GaryColors.warmWhite)
                        Text(valueLine ?? "Selections appear after review · games + props")
                            .font(GaryFonts.text(12, .semibold))
                            .foregroundStyle(GaryColors.sectionSub)
                        if valueLine != nil {
                            Text("Gary's best of the board · games + props")
                                .font(GaryFonts.text(11))
                                .foregroundStyle(GaryColors.meta)
                        }
                    }
                    Spacer()
                    HStack(spacing: 5) {
                        Text("VIEW")
                            .font(GaryFonts.accent(12)).tracking(0.8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .black))
                    }
                    .foregroundStyle(GaryColors.gold)
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
            }
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(hex: "#100F0D"))
                    .overlay(SealSheen().clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.55), lineWidth: 1))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pageGutter()
    }
}

