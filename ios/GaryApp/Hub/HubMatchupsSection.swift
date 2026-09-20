import SwiftUI

// MARK: - The Matchups (per-game storyboard — WC only since Aug 6; the MLB
// slate now speaks the H2H + NRFI sections above)

/// The Matchups, rebuilt as a slate storyboard: one block per GAME in
/// first-pitch order — a matchup masthead (away @ home in the display face,
/// first pitch on the right) with that game's intel nested under it. This
/// replaces the shuffled deck of unrelated one-off rows; the special shapes
/// (head-to-head scorebug, first-inning dots, replacement swaps) live on
/// under their game, with the now-redundant per-row game tag hidden. The
/// head-to-head scorebug, when a game has one, leads its block — it reads as
/// the matchup's identity stat.
struct HubMatchupsSection: View {
    let rows: [Signal]
    /// Slate position + first-pitch label for a game string (nil = off-board).
    let slateIndexFor: (String) -> (index: Int, time: String?)?
    @Binding var openBeats: Set<String>
    let kickerFor: (Signal) -> String
    let onRow: (Signal) -> Void
    let onProfile: (Signal) -> Void
    /// Masthead tap → the game sheet (Aug 4: the block's title had been dead
    /// text; from the sheet, each team name is a door to its team card).
    var onGame: (String) -> Void = { _ in }

    private let anchor = "matchups"
    private let topCount = 3
    private var isOpen: Bool { openBeats.contains(anchor) }

    private struct GameBlock: Identifiable {
        let game: String
        let time: String?
        let rows: [Signal]
        var id: String { game }
    }

    /// Rows grouped by game: slate (first-pitch) order, off-board games last
    /// in feed order. Inside a block the h2h scorebug leads, the rest keep
    /// the feed's relevance order.
    private var blocks: [GameBlock] {
        var order: [String] = []
        var by: [String: [Signal]] = [:]
        for s in rows {
            if by[s.game] == nil { order.append(s.game) }
            by[s.game, default: []].append(s)
        }
        let entries: [(game: String, slate: Int, feed: Int, time: String?)] = order.enumerated().map { i, g in
            let hit = slateIndexFor(g)
            return (g, hit?.index ?? Int.max, i, hit?.time)
        }
        return entries
            .sorted { a, b in a.slate != b.slate ? a.slate < b.slate : a.feed < b.feed }
            .map { e in
                let sorted = (by[e.game] ?? []).enumerated()
                    .sorted { a, b in
                        let ah = a.element.h2h != nil ? 0 : 1
                        let bh = b.element.h2h != nil ? 0 : 1
                        return ah != bh ? ah < bh : a.offset < b.offset
                    }
                    .map(\.element)
                return GameBlock(game: e.game, time: e.time, rows: sorted)
            }
    }

    var body: some View {
        let all = blocks
        let shown = isOpen ? all : Array(all.prefix(topCount))
        VStack(alignment: .leading, spacing: 4) {
            VStack(spacing: 0) {
                ForEach(shown) { block in
                    gameBlock(block)
                    if block.id != shown.last?.id { HubRule() }
                }
            }
            if all.count > topCount {
                HubSeeAllButton(isOpen: isOpen, total: all.count) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isOpen { openBeats.remove(anchor) } else { openBeats.insert(anchor) }
                    }
                }
                .padding(.top, 6)
            }
        }
    }

    @ViewBuilder private func gameBlock(_ block: GameBlock) -> some View {
        // Off-board games (no slate row) keep a plain masthead — a chevron
        // that opens nothing would be a lying affordance (no dead taps).
        let onBoard = slateIndexFor(block.game) != nil
        VStack(alignment: .leading, spacing: 0) {
            let masthead = HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(block.game.uppercased())
                    .hubTitleFont(20)
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                if let t = block.time {
                    Text(t.uppercased())
                        .hubDataFont(9.5, .semibold)
                        .foregroundStyle(.white.opacity(0.55))
                }
                if onBoard {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.35))
                }
            }
            if onBoard {
                Button { onGame(block.game) } label: {
                    masthead.contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 18)
                .padding(.top, 14)
            } else {
                masthead
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
            }
            VStack(spacing: 0) {
                ForEach(Array(block.rows.enumerated()), id: \.element.id) { i, s in
                    factRow(s)
                    if i < block.rows.count - 1 { HubRule(inset: 30) }
                }
            }
            .padding(.bottom, 4)
        }
    }

    @ViewBuilder private func factRow(_ s: Signal) -> some View {
        if s.swap != nil {
            HubSwapRow(s: s, showsGame: false) { onRow(s) }
        } else if s.h2h != nil {
            HubTugRow(s: s, showsGame: false) { onRow(s) }
        } else if s.nrfi != nil {
            HubDotsRow(s: s, kicker: kickerFor(s), showsGame: false) { onRow(s) }
        } else {
            HubStoryRow(s: s, kicker: kickerFor(s), expandable: true, showsGame: false,
                        onTap: { onRow(s) },
                        onProfile: s.playerId != nil ? { onProfile(s) } : nil)
        }
    }
}

