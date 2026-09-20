import SwiftUI

/// ③b Biggest cashes — last night's winners in units, with the honest net
/// in the header (losses are in the number; that's why the wins are real).
struct HomeCashesSection: View {
    struct Row: Identifiable {
        let id: String
        let title: String
        let sub: String
        let units: Double        // sort key (flat stakes)
        let odds: String         // display — bettors speak odds, not units
        var league: String? = nil  // sport-variety key for Hits & heartbreakers
    }
    let rows: [Row]
    let graded: Int
    let onOpenBillfold: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "Biggest cashes", sub: "")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                    Button(action: onOpenBillfold) {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.title)
                                    .font(.system(size: 14.5, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                                Text(row.sub)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.62))
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            Text(row.odds)
                                .font(GaryFonts.mono(15, bold: true))
                                .foregroundStyle(GaryColors.win)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                }
                Button(action: onOpenBillfold) {
                    HStack(spacing: 4) {
                        Text("See all \(graded) graded")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(GaryColors.heroAccent.opacity(0.85))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(GaryColors.heroAccent.opacity(0.6))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .garyPanel(radius: 12)
            .pageGutter()
        }
    }
}

