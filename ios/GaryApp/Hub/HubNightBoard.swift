import SwiftUI

// MARK: - Last Night board

struct HubNightBoard: View {
    let rows: [NightHighlightRow]
    /// Tap-a-name → player card (only names with a resolved card).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    /// Team tag → team card (the law, Aug 4 — this cell had been a dead tap).
    var onTeam: ((String) -> Void)? = nil
    @State private var tab = 0
    @State private var showAll = false

    private static let categories: [(key: String, label: String, noun: String)] = [
        ("hr", "HR", "homered"),
        ("multi_hit", "2+ HITS", "had multi-hit nights"),
        ("k_show", "K SHOW", "struck out 7+"),
        ("gem", "GEMS", "dealt a gem"),
        ("rbi_night", "RBI", "drove in 3+"),
        ("sb_night", "SPEED", "stole 2+ bags")
    ]

    private var present: [(key: String, label: String, noun: String)] {
        Self.categories.filter { c in rows.contains { $0.category == c.key } }
    }

    private static func lead(_ d: String?) -> Int {
        Int((d ?? "").prefix(while: { $0.isNumber })) ?? 0
    }

    private var visible: [NightHighlightRow] {
        guard !present.isEmpty else { return [] }
        let key = present[min(tab, present.count - 1)].key
        return rows.filter { $0.category == key }.sorted {
            let (a, b) = (Self.lead($0.detail), Self.lead($1.detail))
            if a != b { return a > b }
            return ($0.gary_result != nil) && ($1.gary_result == nil)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if present.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 20) {
                        ForEach(Array(present.enumerated()), id: \.offset) { i, c in
                            let on = i == tab
                            Button { withAnimation(.easeInOut(duration: 0.15)) { tab = i; showAll = false } } label: {
                                Text(c.label.uppercased())
                                    .hubKickerFont(11).tracking(1.3)
                                    .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.45))
                                    .frame(minHeight: 28)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                let shown = showAll ? visible : Array(visible.prefix(12))
                ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                    boardRow(r)
                    if i < shown.count - 1 { HubRule(inset: 18) }
                }
                if visible.count > 12 {
                    HubSeeAllButton(isOpen: showAll, total: visible.count) {
                        withAnimation(.easeInOut(duration: 0.2)) { showAll.toggle() }
                    }
                    .padding(.top, 10)
                }
            }
        }
    }

    private func boardRow(_ r: NightHighlightRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                let name = Text(r.player_name ?? "—")
                    .hubBodyFont(14.5, .semibold)
                    .foregroundStyle(.white.opacity(0.95))
                    .fixedSize(horizontal: false, vertical: true)
                if let card = cardFor(r.player_name) {
                    Button { onPlayer(card) } label: {
                        name.contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else { name }
                Spacer(minLength: 0)
                Group {
                    switch r.gary_result {
                    case "won": Text("WON").foregroundStyle(GaryColors.win)
                    case "lost": Text("LOST").foregroundStyle(GaryColors.loss)
                    default: EmptyView()
                    }
                }
                .hubDataFont(10, .semibold)
                .fixedSize()
            }
            let teamLabel = Text(HomeView.shortTeam(r.team).uppercased())
                .hubDataFont(10.5, .medium)
                .foregroundStyle(.white.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
            if let onTeam, let team = r.team, !team.isEmpty {
                Button { onTeam(team) } label: { teamLabel.contentShape(Rectangle()) }
                    .buttonStyle(.plain)
            } else { teamLabel }
            Text(r.detail ?? "")
                .hubBodyFont(13)
                .foregroundStyle(.white.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12).padding(.horizontal, 18)
    }

}

