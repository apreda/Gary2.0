import SwiftUI

/// Yesterday's Winners card, shown once per slate day (founder, Sep 24 2026:
/// "this is going to now be the performance from the winners' picks only").
/// Drawn like a Winners ticket: Gary's face for the night, the money large,
/// the record and the bankroll on a band, one gold action. No commentary. A
/// night Gary cashed glows; a member's gets the gold thrown, anyone else is
/// sent to the Winners card. The picture follows the night's win rate.
struct DailyRecapOverlay: View {
    let recap: WinnersRecapModel
    /// On the Winners card (paid, founding or preview access).
    let member: Bool
    let onWinners: () -> Void
    let onDismiss: () -> Void

    private var push: Int { recap.tickets.filter { LabTicketState(result: $0.result) == .push }.count }
    private var pct: Double {
        let graded = recap.won + recap.lost
        return graded == 0 ? 0 : Double(recap.won) / Double(graded)
    }
    private var cashed: Bool { recap.net > 0 }

    /// The emotion ladder (80+ Fire / 70s Cooking / 50s-60s Beer / 40s
    /// IceCold / sub-40 Doomsday).
    private var mood: String {
        pct >= 0.80 ? "GaryFire" : pct >= 0.70 ? "GaryCooking" : pct >= 0.50 ? "GaryBeer"
            : pct >= 0.40 ? "GaryIceCold" : "GaryDoomsday"
    }
    private var recordText: String {
        push > 0 ? "\(recap.won)–\(recap.lost)–\(push)" : "\(recap.won)–\(recap.lost)"
    }
    /// The best price that cashed ("+134"), when one did at plus money.
    private var bestCash: Int? {
        let won = recap.tickets.filter { LabTicketState(result: $0.result) == .won }
        let plus: [Int] = won.compactMap { t in t.odds.flatMap { $0 > 0 ? $0 : nil } }
        return plus.max()
    }
    private var netText: String { (recap.net < 0 ? "-" : "+") + LabFormat.dollars(recap.net.rounded()) }
    private var action: String { cashed ? (member ? "TODAY'S WINNERS CARD" : "SEE THE WINNERS CARD") : "TODAY'S BOARD" }

    var body: some View {
        ZStack {
            Color.black.opacity(0.66)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            VStack(spacing: 0) {
                ZStack {
                    if cashed {
                        Circle().fill(GaryColors.gold.opacity(member ? 0.34 : 0.22))
                            .frame(width: 170, height: 170).blur(radius: 40)
                    }
                    Image(mood)
                        .resizable().scaledToFit()
                        .frame(height: 126)
                    if cashed && member { LabTearFlecks().offset(y: 24) }
                }
                .padding(.top, 24)

                Text("WINNERS · \(LabFormat.weekdayWord(recap.date).uppercased())")
                    .font(GaryFonts.ui(10.5, .bold)).tracking(2)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 14)

                Text(netText)
                    .font(GaryFonts.display(68))
                    .foregroundStyle(recap.net >= 0 ? GaryColors.win : GaryColors.loss)
                    .monospacedDigit()
                    .padding(.top, 2).padding(.bottom, 16)

                HStack(spacing: 0) {
                    stat(recordText, "RECORD", GaryColors.warmWhite)
                    if let bank = recap.bankroll_dollars?.value {
                        divider
                        stat(LabFormat.dollars(bank.rounded()), "BANKROLL", GaryColors.gold)
                    }
                    if let bestCash {
                        divider
                        stat("+\(bestCash)", "BEST CASH", GaryColors.win)
                    }
                }
                .padding(.vertical, 14)
                .background(LabInk.plateDeep)
                .overlay(alignment: .top) { Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(height: 1) }
                .overlay(alignment: .bottom) { Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(height: 1) }

                Button(action: cashed ? onWinners : onDismiss) {
                    HStack(spacing: 7) {
                        Text(action).font(GaryFonts.display(17)).tracking(1.3)
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).opacity(0.75)
                    }
                    .foregroundStyle(GaryColors.gold)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .frame(width: 320)
            .labPlate(radius: 22, fill: LabInk.plate, edge: cashed ? GaryColors.gold.opacity(0.55) : LabInk.hair)
            .shadow(color: .black.opacity(0.6), radius: 30, y: 14)
        }
    }

    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(GaryFonts.display(26))
                .foregroundStyle(color)
                .monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(label)
                .font(GaryFonts.ui(9.5, .bold)).tracking(1.2)
                .foregroundStyle(LabInk.dim)
        }
        .frame(maxWidth: .infinity)
    }

    private var divider: some View {
        Rectangle().fill(LabInk.hair).frame(width: 1, height: 34)
    }
}
