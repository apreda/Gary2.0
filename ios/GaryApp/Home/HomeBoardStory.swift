import SwiftUI

/// A finished game's story, opened under its board row (founder, Oct 29 2026). The headline cards fold into
/// the board: a tap on a finished game drops its story open in place, the way a headline card turned over,
/// and the pick card that every tap used to open moves to a button inside it, with sharing beside it.
struct HomeBoardStory {
    let headline: String
    /// What else hit (game_recaps.bullets); a real price is pulled out to the gold column.
    let bullets: [String]
    /// The money on a flat $100: "+$83", "-$100", "$0".
    let money: String?
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
        let result = recap.result?.lowercased()
        let odds = Int(Formatters.splitPickAndOdds(recap.pick_text, league: league).1
            .replacingOccurrences(of: "−", with: "-").trimmingCharacters(in: .whitespaces))
        let money: String? = {
            switch result {
            case "won": return "+" + LabFormat.dollars((100 * LabFormat.payout(odds)).rounded())
            case "lost": return "-$100"
            case "push": return "$0"
            default: return nil
            }
        }()
        return HomeBoardStory(headline: recap.headline ?? "", bullets: recap.bullets ?? [], money: money,
                              pick: picks[key(of: recap.pick_text ?? "")], result: result)
    }

    /// One spelling for a pick across the two tables: case, spaces and the minus sign.
    private static func key(of pick: String) -> String {
        pick.lowercased().replacingOccurrences(of: "−", with: "-")
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}

/// The story under an open row: the headline, what else hit with its prices, and the two ways on.
struct HomeBoardStoryPanel: View {
    let story: HomeBoardStory
    let onPickCard: () -> Void
    let onShare: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(story.headline)
                .font(.system(size: 15.5, weight: .bold))
                .foregroundStyle(GaryColors.warmWhite.opacity(0.94))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12).padding(.top, 12)

            if !story.bullets.isEmpty {
                Text("WHAT ELSE HIT")
                    .font(GaryFonts.kicker(9.5, .heavy)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 12).padding(.top, 12).padding(.bottom, 6)
                ForEach(Array(story.bullets.prefix(3).enumerated()), id: \.offset) { i, raw in
                    if i > 0 {
                        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                    }
                    let parts = HeadlineFlipCard.splitPrice(raw)
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(parts.stat)
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.82))
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if let price = parts.price {
                            Text(price)
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(GaryColors.warmGold)
                                .fixedSize()
                        }
                    }
                    .padding(.horizontal, 12)
                }
            }

            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1).padding(.top, 12)
            HStack(spacing: 0) {
                action("Open the pick card", icon: "list.bullet.rectangle.portrait", run: onPickCard)
                if let onShare {
                    Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 24)
                    action("Share the pick", icon: "square.and.arrow.up", run: onShare)
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .padding(.horizontal, 14).padding(.bottom, 12)
    }

    private func action(_ title: String, icon: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            HStack(spacing: 7) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                Text(title).font(.system(size: 13.5, weight: .semibold)).fitsOneLine()
            }
            .foregroundStyle(GaryColors.warmWhite.opacity(0.88))
            .frame(maxWidth: .infinity, minHeight: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
