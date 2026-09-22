import SwiftUI

struct HomeSheetPanel<YouScorecard: View>: View {
    @Environment(\.panelEdge) private var panelEdge
    let rows: [HomeSheetRow]
    let selected: HomeBoardLeague
    let available: Set<HomeBoardLeague>
    let tomorrowBoard: TomorrowBoard?
    let record: HomeBoardRecord
    @Binding var selectedTab: Int
    let onSelect: (HomeBoardLeague) -> Void
    @ViewBuilder let youScorecard: () -> YouScorecard

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(HomeBoardLeague.ordered(available: available), id: \.self) { league in
                    // The YOU tab exists only when the user has bets down
                    // today — an empty personal slate never renders a dead tab.
                    // MLB/NFL are ALWAYS tappable (founder, Aug 24): a
                    // disabled tab didn't consume the touch, so tapping "NFL"
                    // on an MLB-only day fell through and read as a jump to
                    // the Picks page. An empty league now selects normally
                    // and the panel says "no games" in its own words.
                    if league != .you || available.contains(.you) {
                        Button {
                            onSelect(league)
                        } label: {
                            Text(league.rawValue)
                                .font(.system(size: 12.5, weight: .bold).monospacedDigit())
                                .tracking(1.4)
                                .foregroundStyle(league == selected
                                    ? GaryColors.gold
                                    : Color.white.opacity(0.62))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(league == selected ? .isSelected : [])
                    }
                }
            }
            // A selected league with no slate says so in place — the tab
            // switch always lands ON the board, never anywhere else. When the
            // fetched look-ahead board carries this league's games TOMORROW,
            // they show right here (founder, Aug 26: "show me the games that
            // are upcoming even if that isn't today") — real rows only, never
            // an invented schedule for days the board hasn't reached.
            if rows.isEmpty {
                let upcoming = selected == .you ? [] : (tomorrowBoard?.board ?? [])
                    .filter { ($0.league ?? "").uppercased() == selected.rawValue }
                if upcoming.isEmpty {
                    Text("NO \(selected.rawValue) GAMES TODAY")
                        .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                        .tracking(1.4)
                        .foregroundStyle(Color.white.opacity(0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 22)
                } else {
                    Text("NEXT \(selected.rawValue) GAMES — TOMORROW")
                        .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                        .tracking(1.4)
                        .foregroundStyle(Color.white.opacity(0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.top, 16)
                        .padding(.bottom, 6)
                    ForEach(Array(upcoming.enumerated()), id: \.offset) { i, r in
                        let gameRow = HStack(spacing: 8) {
                            Text("\(scoreboardTeamAbbreviation(r.away_team, stored: r.away_abbr, league: r.league)) @ \(scoreboardTeamAbbreviation(r.home_team, stored: r.home_abbr, league: r.league))")
                                .font(.system(size: 13.5, weight: .bold).monospacedDigit())
                                .foregroundStyle(Color.white.opacity(0.85))
                            Spacer(minLength: 8)
                            Text(r.commence_time.map { TomorrowView.etTime($0, withZone: false, meridiem: true).uppercased() } ?? "TIME TBD")
                                .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Color.white.opacity(0.55))
                            if selected == .nfl {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        if selected == .nfl, let away = r.away_team, let home = r.home_team {
                            Button {
                                PicksFocusState.shared.focus(game: "\(away) @ \(home)", league: "NFL", gameID: r.bdl_game_id)
                                selectedTab = 3
                            } label: {
                                gameRow.contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens this week's game information")
                        } else {
                            gameRow
                        }
                        if i < upcoming.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, 14)
                        }
                    }
                    Color.clear.frame(height: 10)
                }
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                Button {
                    guard !r.matchupFull.isEmpty else { return }
                    PicksFocusState.shared.focus(game: r.matchupFull,
                                                 league: r.league,
                                                 gameID: r.gameID)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 3 }
                } label: {
                    HomeSheetRowView(row: r)
                }
                .buttonStyle(.plain)
                if i < rows.count - 1 {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, 14)
                }
            }
            // THE RECORD rides INSIDE the board card (founder, Aug 19: "put
            // the stuff above it inside of the board at the end, so it's all
            // wrapped up") — the board's own bottom line, behind one divider.
            // On the YOU tab the bottom line is THEIR day, not Gary's —
            // wearing the SAME scorecard as the league lanes, fixed shape
            // from 0–0 (founder, Aug 27: "we need the record and 0 like
            // MLB NFL NCAAF have"; the "YOUR DAY n OPEN" line is gone).
            if selected == .you {
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                youScorecard()
                    .padding(.horizontal, 14).padding(.vertical, 12)
            } else {
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                HomeScorecard(record: record, label: rows.contains { $0.zone == .live } ? "LIVE" : "TODAY") {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
                }
                    .padding(.horizontal, 14).padding(.vertical, 12)
            }
        }
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                // Self-contained card: adapts its own FILL for the ground
                // (surface doctrine). Home always stands on THE FLOOR now, and
                // this board only renders here — solid, unconditionally. (It
                // cannot read `solidPanels`: HomeView sets that env on its own
                // subtree, and a view never sees its own environment writes.)
                .fill(GaryColors.panelFillOpaque)
                // The lit rim replaces the gold whisper (founder, Aug 19: the
                // board gets the exact headline-card float — the gold outline
                // read flat next to the light-caught cards above it).
                // Sep 21 2026: the same gold edge as every other Home panel
                // when the page asks for it (`panelEdge`).
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(panelEdge.map { AnyShapeStyle($0) } ?? AnyShapeStyle(LinearGradient(stops: [
                        .init(color: GaryColors.warmWhite.opacity(0.16), location: 0),
                        .init(color: GaryColors.warmWhite.opacity(0.06), location: 0.35),
                        .init(color: GaryColors.warmWhite.opacity(0.025), location: 1),
                    ], startPoint: .top, endPoint: .bottom)), lineWidth: 1))
                // Floating over THE FLOOR (Aug 19) — the shadow puddle darkens
                // the grid beneath, so the board hovers instead of sitting flat.
                .shadow(color: .black.opacity(0.55), radius: 18, y: 10)
                .shadow(color: .black.opacity(0.65), radius: 4, y: 2)
        )
        .pageGutter()
    }
}
