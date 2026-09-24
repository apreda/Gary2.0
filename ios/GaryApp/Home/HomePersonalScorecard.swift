import SwiftUI

struct HomePersonalScorecard: View {
    let bets: [UserBet]
    let label: String
    let onOpenBook: () -> Void

    var body: some View {
        Button {
            UserDefaults.standard.set("you", forKey: "billfoldScope")
            onOpenBook()
        } label: {
            let settled = bets.filter { ["won", "lost", "push"].contains($0.status) }
            let w = settled.filter { $0.status == "won" }.count
            let l = settled.filter { $0.status == "lost" }.count
            let p = settled.filter { $0.status == "push" }.count
            HStack(spacing: 0) {
                homeScoreCell(HomeReceiptMath.recordLine(w, l, p), label, .white.opacity(0.92))
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                // Their book's own unit size drives the dollars — the cell
                // grammar stays the board's, the stake basis stays true.
                let netUnits = settled.reduce(0.0) { $0 + ($1.units_net ?? 0) }
                let net = netUnits * BookMoney.unitDollars
                homeScoreCell(Formatters.flatStakeDollars(net),
                          "NET · $\(Int(BookMoney.unitDollars))/PICK",
                          settled.isEmpty ? .white.opacity(0.92)
                                          : (net >= 0 ? GaryColors.win : GaryColors.loss))
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                let best = settled.compactMap { $0.units_net }.filter { $0 > 0 }.max()
                    .map { $0 * BookMoney.unitDollars }
                if let best, best > 0 {
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
