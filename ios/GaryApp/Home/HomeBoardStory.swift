import SwiftUI

/// A finished game's story on the board (founder, Oct 29 2026, mock F: "I really like that"). The headline
/// cards fold into the board: a tap on a finished game lifts its story off the board, over the board's own
/// rows dimmed and blurred (the rest of Home stays as it is), and the pick card that every tap used to open
/// becomes one of the two choices under it.
struct HomeBoardStory {
    let headline: String
    /// What else hit (game_recaps.bullets); a real price is pulled out to the gold column.
    let bullets: [String]
    /// The price Gary took ("-110"); the story shows the bet, never a dollar amount (founder, Oct 29 2026).
    let odds: String?
    /// The call behind the story and its grade, for the share card.
    let pick: GaryPick?
    let result: String?

    /// This game's recap from the slate's recaps: same league and matchup, and Gary's own call on it, so a
    /// series rematch never borrows the night before's story. Nil until the game's recap is written.
    static func make(recaps: [GameRecapRow], league: String, matchup: String, calls: [GaryPick]) -> HomeBoardStory? {
        var picks: [String: GaryPick] = [:]
        for call in calls { if let text = call.pick, picks[key(of: text)] == nil { picks[key(of: text)] = call } }
        let mine = recaps.filter { (r: GameRecapRow) -> Bool in
            guard (r.league ?? "").uppercased() == league, !(r.headline ?? "").isEmpty else { return false }
            guard (r.matchup ?? "").caseInsensitiveCompare(matchup) == .orderedSame else { return false }
            return picks[key(of: r.pick_text ?? "")] != nil
        }
        guard mine.count == 1, let recap = mine.first else { return nil }
        let odds = Formatters.splitPickAndOdds(recap.pick_text, league: league).1
            .replacingOccurrences(of: "−", with: "-").trimmingCharacters(in: .whitespaces)
        return HomeBoardStory(headline: recap.headline ?? "", bullets: recap.bullets ?? [],
                              odds: Int(odds) == nil ? nil : odds,
                              pick: picks[key(of: recap.pick_text ?? "")], result: recap.result?.lowercased())
    }

    /// One spelling for a pick across the two tables: case, spaces and the minus sign.
    private static func key(of pick: String) -> String {
        pick.lowercased().replacingOccurrences(of: "−", with: "-")
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}

/// The lifted story (mock F): the card raised off the board and the two choices under it. The board steps
/// back behind it but stays live (HomeSheetPanel); a tap on the card puts it back.
struct HomeBoardStoryPeek: View {
    let row: HomeSheetRow
    let story: HomeBoardStory
    let onPickCard: () -> Void
    let onClose: () -> Void
    @State private var shareItem: PickShareItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HomeBoardStoryCard(row: row, story: story)
                .contentShape(Rectangle())
                .onTapGesture { onClose() }
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Closes the story")
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(hex: "#12100D")))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(GaryColors.gold.opacity(0.6), lineWidth: 1))
                .shadow(color: .black.opacity(0.7), radius: 25, y: 12)
                .scaleEffect(1.02)
            menu
        }
        .onAppear { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
        .sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
    }

    private var menu: some View {
        VStack(spacing: 0) {
            menuRow("Open the pick card", icon: "list.bullet.rectangle.portrait", run: onPickCard)
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
            menuRow("Share the story", icon: "square.and.arrow.up") {
                let renderer = ImageRenderer(content: HomeBoardStoryShareCard(row: row, story: story))
                renderer.scale = 2
                if let image = renderer.uiImage { shareItem = PickShareItem(images: [image]) }
            }
        }
        .frame(width: 236)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(hex: "#28241E").opacity(0.97)))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.5), radius: 15, y: 8)
    }

    private func menuRow(_ title: String, icon: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            HStack {
                Text(title).font(.system(size: 15)).foregroundStyle(GaryColors.warmWhite)
                Spacer(minLength: 8)
                Image(systemName: icon).font(.system(size: 14)).foregroundStyle(.white.opacity(0.62))
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The story's face, in the peek and on the shared image: score and verdict, the call at its price, the
/// headline, what else hit.
struct HomeBoardStoryCard: View {
    let row: HomeSheetRow
    let story: HomeBoardStory
    var scale: CGFloat = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 8 * scale) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(row.title)
                    .font(GaryFonts.display(22 * scale)).tracking(0.5)
                    .foregroundStyle(GaryColors.warmWhite)
                    .fitsOneLine()
                Spacer(minLength: 4)
                Text(row.statusText)
                    .font(.system(size: 13.5 * scale, weight: .semibold).monospacedDigit())
                    .foregroundStyle(row.statusColor)
                    .fixedSize()
            }
            HStack(alignment: .firstTextBaseline) {
                if let call = row.callLine {
                    // The bet as it was booked: the call and its price ("WIZARDS +9.5 -110"); a moneyline call
                    // already carries its price.
                    Text(story.odds.map { call.hasSuffix($0) ? call : "\(call) \($0)" } ?? call)
                        .font(.system(size: 13.5 * scale, weight: .semibold).monospacedDigit())
                        .foregroundStyle(GaryColors.gold.opacity(0.95))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                Text(row.league)
                    .font(.system(size: 10 * scale, weight: .heavy)).tracking(1.2)
                    .foregroundStyle(HomeSheetRowView.leagueColor(row.league))
            }
            Text(story.headline)
                .font(.system(size: 16.5 * scale, weight: .bold))
                .foregroundStyle(GaryColors.warmWhite.opacity(0.96))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2 * scale)
            if !story.bullets.isEmpty {
                Text("WHAT ELSE HIT")
                    .font(.system(size: 9.5 * scale, weight: .heavy)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 4 * scale)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(story.bullets.prefix(3).enumerated()), id: \.offset) { i, raw in
                        if i > 0 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.vertical, 7 * scale)
                        }
                        let parts = HeadlineFlipCard.splitPrice(raw)
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(parts.stat)
                                .font(.system(size: 13.5 * scale, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.82))
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            if let price = parts.price {
                                Text(price)
                                    .font(.system(size: 12.5 * scale, weight: .bold).monospacedDigit())
                                    .foregroundStyle(GaryColors.warmGold)
                                    .fixedSize()
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 15 * scale).padding(.vertical, 14 * scale)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The shared image: the story card under Gary's mark, the site at the foot. The card is the image edge,
/// like the pick share card, so it reads as a card in Messages.
private struct HomeBoardStoryShareCard: View {
    let row: HomeSheetRow
    let story: HomeBoardStory

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("GARY'S BOARD · FINAL")
                    .font(GaryFonts.mono(13, bold: true)).tracking(3)
                    .foregroundStyle(GaryColors.gold)
                Spacer()
                Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 48, height: 48)
            }
            .padding(.horizontal, 26).padding(.top, 22)
            HomeBoardStoryCard(row: row, story: story, scale: 1.3)
                .padding(.horizontal, 11).padding(.top, 6)
            Rectangle().fill(.white.opacity(0.12)).frame(height: 1).padding(.horizontal, 26).padding(.top, 8)
            Text("betwithgary.ai")
                .font(GaryFonts.mono(12.5))
                .foregroundStyle(GaryColors.gold.opacity(0.8))
                .padding(.horizontal, 26).padding(.vertical, 18)
        }
        .frame(width: 460, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(Color(hex: "#121110")))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(.white.opacity(0.10), lineWidth: 1))
    }
}
