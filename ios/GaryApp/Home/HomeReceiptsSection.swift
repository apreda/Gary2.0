import SwiftUI

/// ④ The Receipts — yesterday's boards, graded. Each lane's record routes to
/// today's version of itself on the Hub: results are the hook, the Hub is
/// the destination.
struct HomeReceiptsSection: View {
    struct LaneRecord: Identifiable {
        let id: String
        let name: String
        let icon: String
        let hits: Int
        let misses: Int
    }
    let lanes: [LaneRecord]
    let sub: String
    let onOpenHub: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "The Receipts", sub: sub)
            VStack(spacing: 0) {
                ForEach(Array(lanes.enumerated()), id: \.element.id) { i, lane in
                    // One ledger line per lane: name, record, in. The icon
                    // circles and the repeated "live on the Hub" sub said
                    // nothing four times over.
                    Button(action: onOpenHub) {
                        HStack(spacing: 10) {
                            Text(lane.name.uppercased())
                                .font(.system(size: 12.5, weight: .semibold)).tracking(0.5)
                                .foregroundStyle(.white.opacity(0.85))
                            Spacer(minLength: 8)
                            Text("\(lane.hits)–\(lane.misses)")
                                .font(GaryFonts.mono(15, bold: true))
                                .foregroundStyle(lane.hits >= lane.misses
                                                 ? GaryColors.win : GaryColors.loss)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 13)
                        .padding(.horizontal, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if i < lanes.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                    }
                }
            }
            .garyPanel(radius: 12)
            .pageGutter()
        }
    }
}

