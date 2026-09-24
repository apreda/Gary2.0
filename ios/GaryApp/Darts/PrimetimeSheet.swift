import SwiftUI

// PRIMETIME (founder GO, Sep 24 2026): the night's big game as a newsletter
// from Gary. The opening he writes, every bet he has on the game in one
// list, his Winners play (sealed for a fan without access until it is
// graded), then the stat and the injuries. Before the start the game pick
// and props hold their slots until they publish; while it plays each bet
// tracks; after the final the page is the recap.

struct PrimetimeSheet: View {
    let model: PrimetimeModel
    let hasFantasy: Bool
    let onPlayer: (PrimetimeBet, PrimetimeGame) -> Void
    let onWinners: () -> Void
    let onFantasy: () -> Void
    @State private var selected = ""

    private var game: PrimetimeGame? {
        model.games.first { $0.matchupWords == selected } ?? model.games.first
    }

    var body: some View {
        FeatureSheetPage {
            if model.games.count > 1 {
                LabTextTabs(items: model.games.map(\.matchupWords),
                            selected: Binding(get: { game?.matchupWords ?? "" }, set: { selected = $0 }), size: 14)
            }
            if let game { page(game) }
        }
    }

    @ViewBuilder private func page(_ game: PrimetimeGame) -> some View {
        FeatureEyebrow(text: game.slot ?? "Primetime")
        Text(game.matchupWords.uppercased()).font(GaryFonts.display(35)).foregroundStyle(GaryColors.warmWhite)
            .fixedSize(horizontal: false, vertical: true)
        meta(game)

        if let lede = game.lede, !lede.isEmpty {
            (Text(lede).font(GaryFonts.ui(13.5)).foregroundColor(FeatureInk.body)
             + Text("  — Gary A.I.").font(GaryFonts.hand(19)).foregroundColor(GaryColors.lightGold))
                .lineSpacing(2.5)
                .fixedSize(horizontal: false, vertical: true)
        }

        Text("GARY'S BETS ON THIS GAME").font(GaryFonts.ui(10, .bold)).tracking(1.6).foregroundStyle(FeatureInk.faint)
            .padding(.top, 4)
        VStack(spacing: 0) {
            Rectangle().fill(FeatureInk.rule).frame(height: 1)
            let bets = game.gameBets
            if !game.started && !bets.contains(where: { $0.kind == "game" }) { slotRow("GAME PICK", width: 1) }
            if !game.started && !bets.contains(where: { $0.kind == "prop" }) { slotRow("PROP", width: 0.6) }
            ForEach(bets) { bet in betRow(bet, game: game) }
            ForEach(game.winners.filter { $0.sealed != true }) { bet in betRow(bet, game: game) }
        }
        if game.winners.contains(where: { $0.sealed == true }) {
            SealedWinnersCard(kicker: "Winners", title: "Sealed", button: AppFlags.purchasesEnabled ? "UNLOCK" : "OPEN", action: onWinners)
        }

        VStack(alignment: .leading, spacing: 10) {
            if let stat = game.stat_to_know, !stat.isEmpty { note("STAT TO KNOW", stat) }
            if let inj = game.injuries, !inj.isEmpty { note("INJURIES", inj) }
            if hasFantasy && game.league == "NFL" {
                Button(action: onFantasy) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("FANTASY").font(GaryFonts.ui(9.5, .bold)).tracking(1.5).foregroundStyle(GaryColors.gold)
                        Text("Tonight's start/sit →").font(GaryFonts.ui(13)).foregroundStyle(FeatureInk.body)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 6)
    }

    /// Before: kickoff, place, line. While it plays: the score and the clock. After: the final.
    private func meta(_ game: PrimetimeGame) -> some View {
        Group {
            if game.started, let live = game.live, let a = live.away_score, let h = live.home_score {
                let away = live.away_abbr ?? teamAbbrevFromName(game.away_team, league: game.league)
                let home = live.home_abbr ?? teamAbbrevFromName(game.home_team, league: game.league)
                Text([live.isFinal ? "FINAL" : (live.detail ?? "LIVE"), "\(away) \(a)", "\(home) \(h)"].joined(separator: " · "))
                    .font(GaryFonts.ui(12.5, .semibold)).foregroundStyle(live.isFinal ? FeatureInk.muted : GaryColors.gold)
            } else {
                Text([game.commence_time.map { "\(LabFormat.timeET($0)) ET" }, game.venue, game.lineWords]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(GaryFonts.ui(12.5)).foregroundStyle(FeatureInk.muted)
            }
        }
        .monospacedDigit()
        .fixedSize(horizontal: false, vertical: true)
    }

    private func betRow(_ bet: PrimetimeBet, game: PrimetimeGame) -> some View {
        let row = HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(bet.label).font(GaryFonts.ui(9.5, .bold)).tracking(1.5).foregroundStyle(GaryColors.gold)
                    if let stake = bet.stake_dollars?.value {
                        Text(LabFormat.dollars(stake)).font(GaryFonts.ui(9.5, .bold)).foregroundStyle(FeatureInk.faint).monospacedDigit()
                    }
                }
                Text(bet.text ?? "").font(GaryFonts.ui(13.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Text(LabFormat.price(bet.odds)).font(GaryFonts.display(22)).foregroundStyle(GaryColors.warmWhite).monospacedDigit()
            ResultMark(result: bet.result)
        }
        .padding(.vertical, 10)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        return VStack(spacing: 0) {
            if bet.player != nil {
                Button { onPlayer(bet, game) } label: { row }.buttonStyle(.plain)
            } else {
                row
            }
            Rectangle().fill(FeatureInk.rule).frame(height: 1)
        }
    }

    /// A pick still to come holds its place.
    private func slotRow(_ label: String, width: CGFloat) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(label).font(GaryFonts.ui(9.5, .bold)).tracking(1.5).foregroundStyle(GaryColors.gold)
                GeometryReader { g in
                    RoundedRectangle(cornerRadius: 3).fill(GaryColors.warmWhite.opacity(0.08))
                        .frame(width: g.size.width * width * 0.7, height: 10)
                }
                .frame(height: 10)
            }
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .accessibilityHidden(true)
            Rectangle().fill(FeatureInk.rule).frame(height: 1)
        }
    }

    private func note(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(GaryFonts.ui(9.5, .bold)).tracking(1.5).foregroundStyle(GaryColors.gold)
            Text(text).font(GaryFonts.ui(13)).foregroundStyle(FeatureInk.body).fixedSize(horizontal: false, vertical: true)
        }
    }
}
