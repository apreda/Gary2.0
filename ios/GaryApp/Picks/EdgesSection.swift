import SwiftUI

/// One chip label per (kind, league). Shared storage kinds describe different
/// evidence by sport: NBA's `owned` lane is a team season series, and its
/// status reports name availability without identifying a replacement.
func signalChipLabel(kind: SignalKind, league: HubLeagueSel?) -> String {
    if league == .nba {
        switch kind {
        case .batterVsArm: return "SEASON SERIES"
        case .situational: return "REST & SCHEDULE"
        case .injury: return "AVAILABILITY"
        default: break
        }
    }
    if kind == .ballpark && league == .wc { return "VENUE" }
    if kind == .injury && (league == .nfl || league == .ncaaf) { return "AVAILABILITY" }
    return kind.chip
}

/// A labeled list of edge cards (insight_connections), or a note when none exist yet.
struct EdgesSection: View {
    let title: String
    let edges: [Signal]
    var note: String = "More intel drops closer to game time."
    /// TODAY'S EDGES opts in: a category tab bar so the user can jump to a lane
    /// (Situational, Platoon Edge…) instead of scrolling the mixed feed. Off by
    /// default, so per-game GAME INTEL keeps its plain list.
    var tabbed: Bool = false
    @State private var selectedKind: SignalKind? = nil   // nil = the mixed feed (THE SHOW / ALL-22)

    /// Unique categories present, in first-appearance (feed) order.
    private var kinds: [SignalKind] {
        var seen = Set<SignalKind>(); var out: [SignalKind] = []
        for e in edges where !seen.contains(e.kind) { seen.insert(e.kind); out.append(e.kind) }
        return out
    }
    /// nil is THE SHOW: the full, mixed feed. A stale selection (for example
    /// after a sport switch removes that lane) also returns to THE SHOW instead
    /// of silently landing on whichever category happens to arrive first.
    private var activeKind: SignalKind? {
        if let k = selectedKind, kinds.contains(k) { return k }
        return nil
    }

    /// THE SHOW should feel like the whole slate, not one category followed by
    /// another category. Round-robin the live lanes while preserving the
    /// pipeline's ranking inside each lane.
    private var showMix: [Signal] {
        let buckets = kinds.map { kind in edges.filter { $0.kind == kind } }
        let longest = buckets.map(\.count).max() ?? 0
        return (0..<longest).flatMap { index in
            buckets.compactMap { index < $0.count ? $0[index] : nil }
        }
    }
    private var shown: [Signal] {
        guard let k = activeKind else { return showMix }
        return edges.filter { $0.kind == k }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Title hidden when the category tabs are shown — redundant (user call).
            if !tabbed {
                Text(title)
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.62))
                    .pageGutter().padding(.top, 4)
            }
            if edges.isEmpty {
                Text(note)
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.62))
                    .pageGutter().padding(.vertical, 8)
            } else {
                if tabbed && kinds.count > 1 { categoryTabBar }
                // (The ledger no longer renders from a list — it owns its own
                // section on the game page, GameH2HSection.)
                // College slates can carry hundreds of observations. Build and
                // lay out rows as they approach the viewport, not the whole day.
                LazyVStack(spacing: tabbed ? 8 : 0) {
                    ForEach(shown) { SignalRow(s: $0, contained: tabbed) }
                }
                    .pageGutter()
            }
        }
    }

    /// Same mono font + icon + tint as the row category labels; gold underline
    /// marks the active filter (mirrors the matchup tab bar above the feed).
    private var categoryTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 22) {
                showTab
                ForEach(kinds, id: \.self) { categoryTab($0) }
                // Scroll affordance — there are more lanes off the right edge.
                if !kinds.isEmpty {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.25))
                        .padding(.bottom, 12)
                }
            }
            .pageGutter().padding(.top, 8).padding(.bottom, 2)
        }
    }

    /// Use league-specific wording only when the entire supplied feed belongs
    /// to that league; shared callers can also provide a mixed feed.
    private var uniformLeague: HubLeagueSel? {
        guard let first = edges.first?.league else { return nil }
        return edges.allSatisfy { $0.league == first } ? first : nil
    }

    /// The mixed-feed tab wears each sport's own slang for "the whole picture":
    /// baseball's THE SHOW, football's ALL-22 — the coaches' film angle that has
    /// every player on the field (founder, Aug 20: "not the show because that's
    /// baseball"). Same tab, same behavior; only the word changes.
    private var showTabTitle: String {
        (uniformLeague == .nfl || uniformLeague == .ncaaf) ? "ALL-22" : "THE SHOW"
    }

    private var showTab: some View {
        categoryTabLabel(icon: "sparkles", title: showTabTitle, active: activeKind == nil) {
            selectedKind = nil
        }
    }

    @ViewBuilder
    private func categoryTab(_ kind: SignalKind) -> some View {
        categoryTabLabel(
            icon: kind.icon,
            title: signalChipLabel(kind: kind, league: uniformLeague),
            active: activeKind == kind
        ) {
            selectedKind = kind
        }
    }

    private func categoryTabLabel(icon: String, title: String, active: Bool,
                                  action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.18)) { action() } } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 11, weight: .bold))
                Text(title).font(GaryFonts.mono(11.5, bold: true)).tracking(1.2)
            }
            .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.45))
            .padding(.bottom, 11)
            .overlay(alignment: .bottom) {
                ZStack(alignment: .trailing) {
                    Capsule()
                        .fill(Color.white.opacity(active ? 0.10 : 0.045))
                        .frame(height: 1)
                    if active {
                        Capsule()
                            .fill(LinearGradient(
                                colors: [GaryColors.gold.opacity(0.42), GaryColors.gold, Color.white.opacity(0.78)],
                                startPoint: .leading, endPoint: .trailing))
                            .frame(height: 2.5)
                            .shadow(color: GaryColors.gold.opacity(0.35), radius: 2, y: 1)
                        Circle()
                            .fill(Color.white.opacity(0.9))
                            .frame(width: 3.5, height: 3.5)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}
