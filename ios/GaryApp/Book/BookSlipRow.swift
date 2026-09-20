import SwiftUI
import Charts
import PhotosUI

struct UserBetSlipRow: View {
    let bet: UserBet
    var onUpdate: (UserBet) -> Void
    var onDelete: () -> Void
    @State private var showDetail = false

    var body: some View {
        Button { showDetail = true } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(spacing: 6) {
                    Text(bet.kind == "manual" ? "YOURS" : bet.kind.uppercased())
                        .font(GaryFonts.mono(8, bold: true)).foregroundStyle(bet.isVerified ? GaryColors.gold : .white.opacity(0.55))
                    if bet.streak_pick == true { Image(systemName: "star.fill").foregroundStyle(Color(hex: "#E5844B")) }
                    if bet.is_favorite == true { Image(systemName: "heart.fill").foregroundStyle(GaryColors.gold) }
                }.font(.system(size: 11)).frame(width: 46)
                VStack(alignment: .leading, spacing: 5) {
                    Text(bet.pick_text).font(GaryFonts.text(13, .semibold))
                        .foregroundStyle(.white.opacity(0.9)).fixedSize(horizontal: false, vertical: true)
                    Text("\(bet.game_date) · \(BookMoney.stake(bet.stake_units))\(bet.odds_american.map { " · \($0 > 0 ? "+" : "")\($0)" } ?? "")\(BookMarket.shortLabel(bet.market).isEmpty ? "" : " · \(BookMarket.shortLabel(bet.market))")\((bet.bookmaker ?? "").isEmpty ? "" : " · \(bet.bookmaker!)")")
                        .font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.5))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    TagChipsRow(tags: bet.tags ?? [])
                    if bet.kind == "manual" && bet.isPending {
                        Text("Tap to record your result").font(GaryFonts.text(11)).foregroundStyle(GaryColors.gold)
                    }
                }
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 5) {
                    Text(bet.isPending ? "OPEN" : bet.status == "won" || bet.status == "lost" ? BookMoney.net(bet.units_net ?? 0) : bet.status.uppercased())
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(bet.status == "won" ? GaryColors.win : bet.status == "lost" ? GaryColors.loss : .white.opacity(0.55))
                    Image(systemName: "chevron.right").font(.system(size: 9)).foregroundStyle(.white.opacity(0.35))
                }
            }.padding(.vertical, 12).contentShape(Rectangle())
        }.buttonStyle(.plain)
        .sheet(isPresented: $showDetail) {
            UserBetDetailSheet(bet: bet, onUpdate: onUpdate, onDelete: onDelete)
        }
        .onGaryTour { verb, arg in
            if verb == "betdetail", arg == bet.id { showDetail = true }
        }
    }
}

