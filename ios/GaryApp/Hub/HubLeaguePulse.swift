import SwiftUI

// MARK: - League Pulse (moved from the Picks page — founder, Jul 30)

/// League tables inside the research module's single shared heading.
struct HubLeaguePulse: View {
    let rows: [LeaguePulseRow]
    @Binding var selectedTab: String?
    /// Routing law (founder, Aug 4 — the standing order): names in the agate
    /// tables route like names everywhere else. Player cells open the player
    /// card when the day has his card; team cells always open the team card.
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    var onTeam: ((String) -> Void)? = nil

    /// Fixed display order; any tab without a row drops out. MLB tabs first
    /// as before; football tabs (Aug 27 2026) lead with the market board.
    private static let tabOrder = [
        "starting_pitchers", "hot_cold_bats", "bullpen", "injuries",
        "the_board", "form", "injury_sheet", "rankings",
    ]

    private var ordered: [LeaguePulseRow] {
        rows.sorted { a, b in
            let ai = Self.tabOrder.firstIndex(of: a.tab ?? "") ?? Int.max
            let bi = Self.tabOrder.firstIndex(of: b.tab ?? "") ?? Int.max
            if ai != bi { return ai < bi }
            return (a.tab ?? "") < (b.tab ?? "")
        }
    }
    private var active: LeaguePulseRow? {
        if let t = selectedTab, let r = ordered.first(where: { $0.tab == t }) { return r }
        return ordered.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if ordered.count > 1 { tabs }
            if let row = active {
                VStack(alignment: .leading, spacing: 4) {
                    let cap = [row.subtitle, row.sortNote]
                        .compactMap { $0?.isEmpty == false ? $0 : nil }
                        .joined(separator: " · ")
                    if !cap.isEmpty {
                        Text(cap)
                            .hubBodyFont(12)
                            .foregroundStyle(.white.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 18)
                    }
                    PulseTable(row: row, cardFor: cardFor, onPlayer: onPlayer, onTeam: onTeam)
                        .padding(.horizontal, 4)
                }
            }
        }
    }

    private var tabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 20) {
                ForEach(ordered) { row in
                    let isActive = (active?.tab == row.tab)
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedTab = row.tab }
                    } label: {
                        Text((row.title ?? row.tab ?? "").uppercased())
                            .hubKickerFont(11).tracking(1.3)
                            .foregroundStyle(isActive ? GaryColors.gold : .white.opacity(0.45))
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(minHeight: 37)
                            .padding(.bottom, 7)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 18)
        }
    }
}

