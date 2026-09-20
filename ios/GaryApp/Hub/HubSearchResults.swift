import SwiftUI

// MARK: - Search results

struct HubSearchResults: View {
    let query: String
    let edges: [Signal]
    let receipts: [Signal]
    let streaks: [StreakRow]
    let night: [NightHighlightRow]
    let league: HubLeagueSel
    let nightLabel: String
    let onEdge: (Signal) -> Void
    /// Routing law (Aug 4 — these rows had been dead): a team streak row →
    /// team card, a player row → his card when the day has one, night-board
    /// hits route the same way. Unresolvable player names stay plain.
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    var onTeamRow: (StreakRow) -> Void = { _ in }
    var onTeamName: (String) -> Void = { _ in }

    var body: some View {
        let q = query.lowercased()
        func hits(_ s: Signal) -> Bool {
            s.headline.lowercased().contains(q)
                || s.detail.lowercased().contains(q)
                || s.game.lowercased().contains(q)
                || s.value.lowercased().contains(q)
                || signalChipLabel(kind: s.kind, league: s.league).lowercased().contains(q)
        }
        let edgeMatches = edges.filter { hits($0) && $0.result == nil }
        let receiptMatches = receipts.filter(hits)
        let streakMatches = streaks.filter {
            ($0.subject ?? "").lowercased().contains(q)
                || ($0.team ?? "").lowercased().contains(q)
                || ($0.detail ?? "").lowercased().contains(q)
        }
        let nightMatches = night.filter {
            ($0.player_name ?? "").lowercased().contains(q)
                || ($0.team ?? "").lowercased().contains(q)
        }
        let total = edgeMatches.count + receiptMatches.count + streakMatches.count + nightMatches.count
        return Group {
            if total == 0 {
                VStack(spacing: 8) {
                    Text("No matches")
                        .hubTitleFont(15, .bold)
                        .foregroundStyle(.white.opacity(0.7))
                    Text("Try a \(league.label) player, team, or topic.")
                        .hubBodyFont(12).foregroundStyle(.white.opacity(0.62))
                }
                .frame(maxWidth: .infinity).padding(.top, 40)
            } else {
                VStack(alignment: .leading, spacing: 22) {
                    if !edgeMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Edges", count: edgeMatches.count)
                            VStack(spacing: 0) {
                                ForEach(edgeMatches) { s in
                                    HubStoryRow(s: s, kicker: signalChipLabel(kind: s.kind, league: s.league), expandable: false,
                                                showsChevron: true,
                                                onTap: { onEdge(s) }, onProfile: nil)
                                    HubRule(inset: 18)
                                }
                            }
                        }
                    }
                    if !receiptMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Receipts", count: receiptMatches.count)
                            HubReceipts(signals: receiptMatches) { onEdge($0) }
                        }
                    }
                    if !streakMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Streaks", count: streakMatches.count)
                            VStack(spacing: 0) {
                                ForEach(Array(streakMatches.enumerated()), id: \.offset) { i, r in
                                    // Routing law: team rows → team card; player
                                    // rows → player card when the day has one.
                                    let row = auxRow(title: r.subject ?? "", sub: r.detail ?? "", trail: r.next_game ?? "")
                                    if r.subject_type == "team" {
                                        Button { onTeamRow(r) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else if let card = cardFor(r.subject) {
                                        Button { onPlayer(card) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else {
                                        row
                                    }
                                    if i < streakMatches.count - 1 { HubRule(inset: 18) }
                                }
                            }
                        }
                    }
                    if !nightMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: nightLabel, count: nightMatches.count)
                            VStack(spacing: 0) {
                                ForEach(Array(nightMatches.enumerated()), id: \.offset) { i, r in
                                    // Player name → his card; no card but a team
                                    // → the team card carries the tap instead.
                                    let row = auxRow(title: r.player_name ?? "", sub: r.detail ?? "", trail: r.team ?? "")
                                    if let card = cardFor(r.player_name) {
                                        Button { onPlayer(card) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else if let team = r.team, !team.isEmpty {
                                        Button { onTeamName(team) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else {
                                        row
                                    }
                                    if i < nightMatches.count - 1 { HubRule(inset: 18) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func auxRow(title: String, sub: String, trail: String) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .hubBodyFont(13.5, .semibold).foregroundStyle(.white).lineLimit(1)
                if !sub.isEmpty {
                    Text(sub).hubBodyFont(11).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if !trail.isEmpty {
                Text(trail.uppercased())
                    .hubDataFont(9, .medium)
                    .foregroundStyle(.white.opacity(0.62)).lineLimit(1)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
    }
}
