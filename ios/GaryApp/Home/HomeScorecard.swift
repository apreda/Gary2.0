import SwiftUI

struct HomeScorecard: View {
    let record: HomeBoardRecord
    let label: String
    let onOpenBook: () -> Void

    var body: some View {
        Button {
            onOpenBook()
        } label: {
            // ALL THREE CELLS, ALL DAY (founder, Aug 5: "I want this look to
            // be for when the games actually go live"). The band used to
            // collapse to a lone record while the day was live, because net
            // and best cash only mounted once they had values — so the live
            // state was a different, thinner object than the settled one.
            // Now the shape is fixed from 0–0 and the numbers fill in
            // underneath it as games land.
            HStack(spacing: 0) {
                // Window named once, leftmost — every cell in this row is the
                // same slate (feedback: unlabeled windows next to the form
                // lane's L10 numbers read contradictory).
                homeScoreCell(HomeReceiptMath.recordLine(record.w, record.l, record.p),
                          label, .white.opacity(0.92))
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                // Nothing graded yet reads as a flat $0, not a blank: the day
                // starts even and the number moves from there.
                let net = record.net ?? 0
                homeScoreCell(Formatters.flatStakeDollars(net), "NET · $100/PICK",
                          record.net == nil ? .white.opacity(0.92)
                                               : (net >= 0 ? GaryColors.win : GaryColors.loss))
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                // Best cash has no honest zero — before a winner lands there
                // simply isn't a biggest one yet, so the slot holds its place
                // with a dash rather than claiming +0.
                if let best = record.bestOdds, best > 0 {
                    homeScoreCell("+\(Int(best))", "BEST CASH", GaryColors.gold)
                } else {
                    homeScoreCell("—", "BEST CASH", .white.opacity(0.35))
                }
            }
            .pageGutter()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
