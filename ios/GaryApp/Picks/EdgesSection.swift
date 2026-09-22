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
    /// Per-game MORE INTEL opts in: the same contained row cards the Slate
    /// Intel feed draws, without the header or the filter tabs (founder,
    /// Sep 21 2026: the pick page's More Intel "should match what's on the
    /// Week 2 page").
    var contained: Bool = false
    private var cardRows: Bool { tabbed || contained }
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
        VStack(alignment: .leading, spacing: cardRows ? 10 : 4) {
            if tabbed {
                HStack(alignment: .firstTextBaseline) {
                    Text("SLATE INTEL")
                        .font(GaryFonts.kicker(11, .bold)).tracking(1.4)
                        .foregroundStyle(GaryColors.cream.opacity(0.85))
                    Spacer()
                    Text("\(edges.count) \(edges.count == 1 ? "read" : "reads")")
                        .font(GaryFonts.ui(12))
                        .foregroundStyle(.white.opacity(0.55))
                }
                .padding(.horizontal, 22)
                .padding(.top, 10)
            } else if contained {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(GaryFonts.display(19)).tracking(1.2).foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text("\(edges.count) READ\(edges.count == 1 ? "" : "S")")
                        .font(GaryFonts.data(9.5, .semibold)).tracking(1.1).foregroundStyle(.white.opacity(0.42))
                }
                .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 6)
            } else {
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
                LazyVStack(spacing: cardRows ? 8 : 0) {
                    ForEach(shown) { SignalRow(s: $0, contained: cardRows) }
                }
                    .padding(.horizontal, tabbed ? 22 : (contained ? 16 : GaryLayout.gutter))
            }
        }
    }

    /// Text filters — mono uppercase, gold when active,
    /// dim otherwise. No fill, no border: filled capsule pills are banned
    /// app-wide (Adam, Sep 21 2026 — see design.md). Each tab keeps a full
    /// 44-point tap target.
    private var categoryTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 22) {
                showTab
                ForEach(kinds, id: \.self) { categoryTab($0) }
            }
            .padding(.horizontal, 22)
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
        categoryTabLabel(title: showTabTitle, active: activeKind == nil) {
            selectedKind = nil
        }
    }

    @ViewBuilder
    private func categoryTab(_ kind: SignalKind) -> some View {
        categoryTabLabel(
            title: signalChipLabel(kind: kind, league: uniformLeague),
            active: activeKind == kind
        ) {
            selectedKind = kind
        }
    }

    private func categoryTabLabel(title: String, active: Bool,
                                  action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.18)) { action() } } label: {
            Text(title)
                .font(GaryFonts.mono(11.5, bold: true)).tracking(1.2)
                .fixedSize(horizontal: true, vertical: false)
                .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.45))
                .padding(.bottom, 10)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
        .accessibilityHint("Filter slate intel")
    }
}
