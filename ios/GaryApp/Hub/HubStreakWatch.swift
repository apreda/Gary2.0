import SwiftUI

// MARK: - Streak Watch

struct HubStreakWatch: View {
    let rows: [StreakRow]
    /// Routing law (founder, Jul 26/30): a team row opens the TEAM CARD —
    /// never a page jump. Player rows open the player card.
    var onTeam: (StreakRow) -> Void = { _ in }
    /// Tap-a-name → player card (only names with a resolved card).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }

    /// Streaks with a stored next-game label lead; longest runs break ties.
    /// Directions interleave so both sides appear near the top.
    private var ordered: [StreakRow] {
        func sortDir(_ rows: [StreakRow]) -> [StreakRow] {
            rows.sorted {
                let (a, b) = ($0.next_game != nil, $1.next_game != nil)
                if a != b { return a }
                return ($0.length ?? 0) > ($1.length ?? 0)
            }
        }
        let positive: Set<String> = ["win", "over", "hit", "hr"]
        var pos = sortDir(rows.filter { positive.contains($0.kind ?? "") })
        var neg = sortDir(rows.filter { !positive.contains($0.kind ?? "") })
        var takePos = (pos.first?.length ?? -1) >= (neg.first?.length ?? -1)
        var out: [StreakRow] = []
        while !pos.isEmpty || !neg.isEmpty {
            if takePos, !pos.isEmpty { out.append(pos.removeFirst()) }
            else if !neg.isEmpty { out.append(neg.removeFirst()) }
            else if !pos.isEmpty { out.append(pos.removeFirst()) }
            takePos.toggle()
        }
        return out
    }

    private func badge(_ r: StreakRow) -> (text: String, color: Color) {
        let n = r.length ?? 0
        switch r.kind {
        case "win":     return ("W\(n)", GaryColors.win)
        case "loss":    return ("L\(n)", GaryColors.loss)
        case "hit":     return ("\(n) GM", GaryColors.gold)
        case "hr":      return ("HR ×\(n)", GaryColors.gold)
        case "hitless": return ("0-\(n)", GaryColors.loss)
        // Over/under runs are ANGLES, not good/bad — gold both directions
        // (founder, Jul 6: red on a scoring streak read as a warning).
        case "over":    return ("O ×\(n)", GaryColors.gold)
        case "under":   return ("U ×\(n)", GaryColors.gold)
        default:        return ("\(n)", .white.opacity(0.6))
        }
    }

    private func cleanDetail(_ r: StreakRow, badgeText: String) -> String? {
        guard var d = r.detail, !d.isEmpty else { return nil }
        for sep in [" — ", " - "] where d.hasPrefix(badgeText + sep) {
            d = String(d.dropFirst(badgeText.count + sep.count))
        }
        return d.isEmpty ? nil : d
    }

    @State private var showAll = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            let all = ordered
            let shown = showAll ? all : Array(all.prefix(10))
            ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                streakRow(r)
                if i < shown.count - 1 { HubRule(inset: 84) }
            }
            if all.count > 10 {
                HubSeeAllButton(isOpen: showAll, total: all.count) {
                    withAnimation(.easeInOut(duration: 0.2)) { showAll.toggle() }
                }
                .padding(.top, 10)
            }
        }
    }

    @ViewBuilder private func streakRow(_ r: StreakRow) -> some View {
        let b = badge(r)
        let playerCard = r.subject_type == "player" ? cardFor(r.subject) : nil
        let isTeam = r.subject_type == "team"
        // The next-game tag gets its own line now (founder, Jul 8: cramming
        // "AT ORIOLES · 6:35 PM ET" into the trailing slot beside the name
        // truncated both it and the detail line to an unreadable stub).
        let row = HStack(alignment: .center, spacing: 12) {
            Text(b.text)
                .hubDataFont(16)
                .foregroundStyle(b.color)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 54, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                // Names read like every other name (founder, Jul 30: the gold
                // tappable tint was noise) — the whole row routes: team row →
                // team card, player row → player card.
                Text(r.subject ?? "")
                    .hubBodyFont(17, .semibold)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let d = cleanDetail(r, badgeText: b.text) {
                    Text(d)
                        .hubBodyFont(13.5)
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                if let next = r.next_game, !next.isEmpty {
                    Text("NEXT GAME · \(next.uppercased())")
                        .hubDataFont(12.5, .semibold)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 1)
                }
            }
            Spacer(minLength: 8)
            if isTeam || playerCard != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 13)
        if isTeam {
            Button { onTeam(r) } label: { row.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else if let playerCard {
            Button { onPlayer(playerCard) } label: { row.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else {
            row
        }
    }
}

