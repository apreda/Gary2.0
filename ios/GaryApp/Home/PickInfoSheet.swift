import SwiftUI

/// Explains publication, grades, pricing and the fixed-stake record.
struct PickInfoSheet: View {
    @Environment(\.dismiss) private var dismiss
    private let rows: [(head: String, body: String)] = [
        ("THE DROP", "Gary posts picks about 90 minutes before each game, once lineups are in."),
        ("THE GRADE", "Every pick is graded the next morning — CASHED when it wins, LOST when it doesn't. Nothing gets deleted."),
        ("THE MONEY", "Results are scored flat: $100 on every pick. A +$87 stamp means a $100 bet at the posted odds paid $87 in profit."),
        ("THE ODDS", "Prices shown are DraftKings unless a different book is named on the pick. Lines move — check your book before you bet."),
        ("THE CARD", "Winners is Gary's sealed best-of-the-board each day — games and props."),
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("HOW THE PICKS WORK")
                    .font(GaryFonts.accent(14))
                    .tracking(1.0)
                    .foregroundStyle(.white)
                Spacer(minLength: 0)
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.white.opacity(0.4))
                }
                .buttonStyle(.plain)
            }
            ForEach(rows, id: \.head) { r in
                VStack(alignment: .leading, spacing: 3) {
                    Text(r.head)
                        .font(GaryFonts.mono(11.5, bold: true)).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                    Text(r.body)
                        .font(GaryFonts.text(14))
                        .foregroundStyle(GaryColors.sectionSub)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(GaryColors.cardBg.ignoresSafeArea())
        .presentationDetents([.fraction(0.52), .medium])
        .presentationDragIndicator(.visible)
    }
}

