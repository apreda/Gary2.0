import SwiftUI

// MARK: - The Beats

/// Market movement after Gary published, kept deliberately receipt-like:
/// matchup, locked line → current line, and which snapshot held the edge.
/// The book/as-of detail remains available on tap without adding tutorial copy
/// to the feed itself.
struct HubAfterGarySection: View {
    let anchor: String
    let rows: [Signal]
    @Binding var openBeats: Set<String>
    let onRow: (Signal) -> Void

    private let topCount = 4
    private var isOpen: Bool { openBeats.contains(anchor) }
    private var visible: [Signal] { isOpen ? rows : Array(rows.prefix(topCount)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 0) {
                ForEach(Array(visible.enumerated()), id: \.element.id) { index, signal in
                    Button { onRow(signal) } label: {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                if !signal.game.isEmpty {
                                    Text(signal.game.uppercased())
                                        .hubDataFont(9.5, .medium)
                                        .foregroundStyle(.white.opacity(0.55))
                                        .lineLimit(1)
                                }
                                Text(signal.headline)
                                    .hubBodyFont(14.5, .semibold)
                                    .foregroundStyle(.white.opacity(0.95))
                                    .fixedSize(horizontal: false, vertical: true)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: 6)
                            if !signal.value.isEmpty {
                                Text(signal.value)
                                    .hubDataFont(12.5, .semibold)
                                    .foregroundStyle(GaryColors.gold)
                                    .lineLimit(1)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.45))
                        }
                        .padding(.horizontal, 18).padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if index < visible.count - 1 { HubRule(inset: 18) }
                }
            }
            if rows.count > topCount {
                HubSeeAllButton(isOpen: isOpen, total: rows.count) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isOpen { openBeats.remove(anchor) } else { openBeats.insert(anchor) }
                    }
                }
            }
        }
    }
}

struct HubBeatList: View {
    let rows: [Signal]
    var open: Bool = false
    let kickerFor: (Signal) -> String
    let onRow: (Signal) -> Void
    let onProfile: (Signal) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                Group {
                    if s.swap != nil {
                        HubSwapRow(s: s) { onRow(s) }
                    } else if s.h2h != nil {
                        HubTugRow(s: s) { onRow(s) }
                    } else if s.nrfi != nil {
                        HubDotsRow(s: s, kicker: kickerFor(s)) { onRow(s) }
                    } else {
                        HubStoryRow(s: s, kicker: kickerFor(s), expandable: true,
                                    onTap: { onRow(s) },
                                    onProfile: { onProfile(s) })
                    }
                }
                if i < rows.count - 1 { HubRule(inset: 18) }
            }
        }
    }
}

/// The default beat row: kicker + story + tone value, tap to expand the read.
struct HubStoryRow: View {
    let s: Signal
    let kicker: String
    var expandable: Bool = true
    /// Rows that NAVIGATE on tap (Game Intel fullscreen, search results) show
    /// a trailing chevron; expandable rows carry the chevron.down instead.
    var showsChevron: Bool = false
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void
    let onProfile: (() -> Void)?
    @State private var expanded = false

    /// Body text with the headline/value echo stripped (shared helper).
    private var dedupedDetail: String { hubDedupedDetail(s) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
        Button {
            if expandable, !dedupedDetail.isEmpty {
                withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() }
            } else {
                onTap()
            }
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    HubKicker(text: kicker, size: 11, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    if showsGame {
                        Text(s.game.uppercased())
                            .hubDataFont(11.5, .medium)
                            .foregroundStyle(.white.opacity(0.62))
                            .lineLimit(1)
                    }
                }
                HStack(alignment: .top, spacing: 10) {
                    Text(s.headline)
                        .hubBodyFont(14.5, .semibold)
                        .foregroundStyle(.white.opacity(0.95))
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    if let v = s.displayValue {
                        Text(v)
                            .hubDataFont(15)
                            .foregroundStyle(hubValueTint(s))
                            .lineLimit(1)
                    }
                    if expandable, !dedupedDetail.isEmpty {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white.opacity(0.62))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .padding(.top, 4)
                    } else if showsChevron {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                            .padding(.top, 4)
                    }
                }
                if expanded {
                    Text(dedupedDetail)
                        .hubBodyFont(13)
                        .foregroundStyle(.white.opacity(0.75))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if expanded, let onProfile {
            Button(action: onProfile) {
                HStack(spacing: 6) {
                    Text(s.playerId != nil ? "PLAYER CARD" : (s.teamId != nil || s.h2h != nil ? "TEAM CARD" : "THE FULL READ"))
                        .hubKickerFont(10.5).tracking(1)
                    Image(systemName: "arrow.right").font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(GaryColors.gold)
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 18)
            .padding(.bottom, 6)
        }
        }
    }
}

/// Injury swap: the OUT player struck through, tonight's replacement below.
struct HubSwapRow: View {
    let s: Signal
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void

    var body: some View {
        if let swap = s.swap {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 8) {
                        HubKicker(text: "Replacement", size: 9.5, color: GaryColors.gold.opacity(0.9))
                        if let t = swap.team {
                            Text(t.uppercased())
                                .hubDataFont(9, .medium)
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 6)
                        if showsGame {
                            Text(s.game.uppercased())
                                .hubDataFont(9, .medium)
                                .foregroundStyle(.white.opacity(0.62))
                                .lineLimit(1)
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(HubPalette.red)
                            .frame(width: 14)
                        // The NAME outranks its note for width and scales
                        // rather than clipping — "Gabriel Rincones Jr." beside
                        // a full BATS/OPS note otherwise ellipsized the player
                        // right out of his own row (no-ellipsis law).
                        Text(swap.out_name ?? "—")
                            .hubBodyFont(14, .semibold)
                            .strikethrough(true, color: HubPalette.red.opacity(0.7))
                            .foregroundStyle(.white.opacity(0.55))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .layoutPriority(1)
                        Spacer(minLength: 6)
                        if let note = swap.out_note, !note.isEmpty {
                            Text(note)
                                .hubBodyFont(10.5, .medium)
                                .foregroundStyle(HubPalette.red.opacity(0.85))
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(HubPalette.green)
                            .frame(width: 14)
                        Text(swap.in_name ?? "—")
                            .hubBodyFont(15, .bold)
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .layoutPriority(1)
                        Spacer(minLength: 6)
                        if let note = swap.in_note, !note.isEmpty {
                            Text(note)
                                .hubDataFont(9.5, .semibold)
                                .foregroundStyle(HubPalette.green)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                }
                .padding(.horizontal, 18).padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Season series as a broadcast face-off (founder, Jul 27: the fill bar is
/// gone). The story is told by WEIGHT — the side that owns the series gets
/// the big gold number, the other side sits smaller and dimmer. No bars, no
/// gauges: a scorebug, then the last meeting in words.
struct HubTugRow: View {
    let s: Signal
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void

    var body: some View {
        let h = s.h2h
        let wins = max(h?.wins ?? 0, 0)
        let losses = max(h?.losses ?? 0, 0)
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    HubKicker(text: "Head-To-Head", size: 9.5, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    if showsGame {
                        Text(s.game.uppercased())
                            .hubDataFont(11.5, .medium)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }
                HStack(alignment: .lastTextBaseline, spacing: 10) {
                    Text(h?.dominant ?? "—")
                        .hubKickerFont(15)
                        .foregroundStyle(.white.opacity(0.95))
                    Text("\(wins)")
                        .hubTitleFont(34)
                        .foregroundStyle(GaryColors.gold)
                    Text("–")
                        .hubTitleFont(22)
                        .foregroundStyle(.white.opacity(0.35))
                    Text("\(losses)")
                        .hubTitleFont(24)
                        .foregroundStyle(.white.opacity(0.55))
                    Text(h?.opponent ?? "—")
                        .hubKickerFont(12)
                        .foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 6)
                    Text("THIS SEASON")
                        .hubDataFont(9, .semibold).tracking(1.1)
                        .foregroundStyle(.white.opacity(0.45))
                }
                if let last = h?.last_meeting, let score = last.score {
                    Text(last.revenge == true
                         ? "\(h?.opponent ?? "") took the last meeting \(score) — revenge spot"
                         : "\(h?.dominant ?? "") won the last meeting \(score)")
                        .hubBodyFont(12).foregroundStyle(.white.opacity(0.72))
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct HubDotsRow: View {
    let s: Signal
    let kicker: String
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void
    private let green = GaryColors.win
    private let red = Color(hex: "#E5614D")

    var body: some View {
        let m = s.nrfi
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    HubKicker(text: kicker, size: 11, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    if showsGame {
                        Text(s.game.uppercased())
                            .hubDataFont(11.5, .medium)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }
                Text(s.headline)
                    .hubBodyFont(14.5, .semibold).foregroundStyle(.white.opacity(0.95))
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                if let teamSeq = m?.team_seq {
                    seqRow(m?.team_abbr ?? "", teamSeq)
                } else {
                    seqRow(m?.away_abbr ?? "", m?.away_seq ?? [])
                    seqRow(m?.home_abbr ?? "", m?.home_seq ?? [])
                }
                // Gary's read on the spot — same voice as every hub card.
                if !s.detail.isEmpty {
                    Text(s.detail)
                        .hubBodyFont(13).foregroundStyle(.white.opacity(0.88))
                        .lineSpacing(2.5)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Trailing run of clean first innings (seq is oldest → newest, 0 = clean).
    private func cleanStreak(_ seq: [Int]) -> Int {
        var n = 0
        for v in seq.reversed() { if v == 0 { n += 1 } else { break } }
        return n
    }

    @ViewBuilder private func seqRow(_ abbr: String, _ seq: [Int]) -> some View {
        let clean = seq.filter { $0 == 0 }.count
        let streak = cleanStreak(seq)
        HStack(spacing: 8) {
            Text(abbr)
                .hubKickerFont(11).foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            HStack(spacing: 3.5) {
                ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .fill(v > 0 ? green.opacity(0.9) : red.opacity(0.45))
                        .frame(width: 10, height: 10)
                }
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 1) {
                Text("CLEAN \(clean)/\(seq.count)")
                    .hubDataFont(10, .bold).foregroundStyle(.white.opacity(0.7))
                if streak >= 3 {
                    Text("\(streak) STRAIGHT")
                        .hubDataFont(9, .semibold).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
        }
    }
}

