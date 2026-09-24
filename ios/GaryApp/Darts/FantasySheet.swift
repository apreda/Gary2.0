import SwiftUI

// THE FANTASY COLUMN (founder GO, Sep 24 2026): Gary's start/sit column for
// the day's NFL games, written the way ESPN writes them, with the bet that
// goes with each call under his words. A name opens the player's card.

struct FantasySheet: View {
    let column: FantasyColumnModel
    let onPlayer: (FantasyColumnModel.Entry) -> Void

    var body: some View {
        FeatureSheetPage {
            FeatureEyebrow(text: ["Fantasy", column.week.map { "Week \($0)" }].compactMap { $0 }.joined(separator: " · "))
            Text("\(LabFormat.weekdayWord(column.slate_date)) start / sit".uppercased())
                .font(GaryFonts.display(35)).foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
            if let games = column.games, !games.isEmpty {
                Text(games.joined(separator: " · ")).font(GaryFonts.ui(12.5)).foregroundStyle(FeatureInk.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(column.entries) { entry in entryView(entry) }
            }
            HStack { Spacer(); GarySignature(size: 21) }
        }
    }

    private func entryView(_ e: FantasyColumnModel.Entry) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Button { onPlayer(e) } label: {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    (Text(e.player).font(GaryFonts.ui(14, .bold)).foregroundColor(GaryColors.warmWhite)
                     + Text(detail(e)).font(GaryFonts.ui(14, .medium)).foregroundColor(FeatureInk.faint))
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Text(e.verdict).font(GaryFonts.display(22))
                        .foregroundStyle(e.verdict == "START" ? GaryColors.gold : FeatureInk.faint)
                }
            }
            .buttonStyle(.plain)
            Text(e.words).font(GaryFonts.ui(13)).foregroundStyle(FeatureInk.body).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            if let bet = e.bet, let text = bet.text {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("THE BET").font(GaryFonts.ui(9, .heavy)).tracking(1.5).foregroundStyle(GaryColors.gold)
                    Text(text).font(GaryFonts.ui(12.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Text(LabFormat.price(bet.odds)).font(GaryFonts.display(19)).foregroundStyle(GaryColors.warmWhite).monospacedDigit()
                    ResultMark(result: bet.result)
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(GaryColors.cardBg))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(GaryColors.gold.opacity(0.22), lineWidth: 1))
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { Rectangle().fill(FeatureInk.rule).frame(height: 1) }
    }

    /// "  WR · Packers".
    private func detail(_ e: FantasyColumnModel.Entry) -> String {
        let parts = [e.position, e.team.map { LabFormat.nickname($0) }].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? "" : "  " + parts.joined(separator: " · ")
    }
}
