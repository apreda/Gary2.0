import SwiftUI

// MARK: - Game sheet (slate-strip tap)

/// Everything the Hub knows about one slate game, in place: status/score,
/// the lines, every edge touching the matchup, related team/player streaks — with
/// Picks as a CTA at the bottom instead of a forced tab jump.
struct HubGameSheet: View {
    let row: TomorrowBoardRow
    let edges: [Signal]
    let streaks: [StreakRow]
    let kickerFor: (Signal) -> String
    var onClose: () -> Void = {}
    let onViewGame: (String) -> Void
    let onSignal: (Signal) -> Void
    /// Team tap on a streak row → close, then the team card (routing law).
    var onTeam: (StreakRow) -> Void = { _ in }
    /// Header team names → close, then the team card (the law, Aug 4: a team
    /// name is a door to the team card everywhere it appears).
    var onTeamName: (String) -> Void = { _ in }
    /// Tap-a-name → player card (player streak rows).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    @ObservedObject private var live = LiveScoreCache.shared
    @State private var namedCard: PlayerInsightCardRow? = nil

    private var abbrMatchup: String {
        "\(hubSideLabel(row.away_abbr, row.away_team, league: row.league)) @ \(hubSideLabel(row.home_abbr, row.home_team, league: row.league))"
    }
    private var ls: LiveScore? {
        hubLiveScore(for: row, cache: live)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 26) {
                header
                if edges.isEmpty {
                    Text("No edges posted for this game yet.")
                        .hubBodyFont(15).foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 18)
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        HubHead(title: "The Edges", count: edges.count)
                        HubBeatList(rows: edges, open: true, kickerFor: kickerFor,
                                    onRow: onSignal, onProfile: onSignal)
                    }
                }
                if !streaks.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "Streaks", count: streaks.count)
                        HubStreakWatch(rows: streaks, onTeam: { onTeam($0) },
                                       cardFor: cardFor, onPlayer: { namedCard = $0 })
                    }
                }
                cta
            }
            .padding(.top, 26).padding(.bottom, 34)
        }
        .background(GaryColors.darkBg)
        .sheet(item: $namedCard) { PlayerInsightSheet(signal: nil, prefetched: $0) }
    }

    private func fmtML(_ v: Double) -> String { v > 0 ? "+\(Int(v))" : "\(Int(v))" }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            if ls?.isLive == true {
                HubKicker(text: "Live", size: 12.5, color: GaryColors.win)
            } else if ls?.isFinal == true || (ls == nil && row.game_status?.lowercased() == "final") {
                HubKicker(text: "Final", size: 12.5, color: .white.opacity(0.62))
            } else if let interruption = ls?.interruptionLabel ?? row.interruptionLabel {
                HubKicker(text: interruption, size: 12.5)
            } else if ls == nil && row.game_status?.lowercased() == "live" {
                HubKicker(text: "Live", size: 12.5, color: GaryColors.win)
            } else {
                HubKicker(text: "Tonight", size: 12.5, color: GaryColors.gold)
            }
            // Each side is a door to its team card (the law, Aug 4). Two lines
            // instead of one so long names never fight the tap targets.
            VStack(alignment: .leading, spacing: 0) {
                teamNameLine(row.away_team ?? hubSideLabel(row.away_abbr, nil), lead: nil)
                teamNameLine(row.home_team ?? hubSideLabel(row.home_abbr, nil), lead: "@")
            }
            if let ls, ls.isLive || ls.isFinal {
                HStack(spacing: 10) {
                    Text(ls.scoreLine ?? "")
                        .hubDataFont(17)
                        .foregroundStyle(.white.opacity(0.95))
                    if ls.isLive, let det = ls.detail, !det.isEmpty {
                        Text("▶ \(det.uppercased())")
                            .hubDataFont(13, .medium)
                            .foregroundStyle(GaryColors.win)
                    }
                }
            } else if row.game_status?.lowercased() == "final" || row.game_status?.lowercased() == "live" {
                Text("Score update unavailable")
                    .hubBodyFont(13.5).foregroundStyle(GaryColors.sectionSub)
            } else {
                HStack(spacing: 8) {
                    Text(TomorrowView.etTime(row.commence_time))
                        .hubDataFont(13.5, .medium)
                        .foregroundStyle(.white.opacity(0.7))
                    if let v = row.venue, !v.isEmpty {
                        Text(v).hubBodyFont(13.5).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                    }
                }
                // The lines, quietly (meta, never the headline).
                if row.total != nil || row.spread != nil || (row.ml_home != nil && row.ml_away != nil) {
                    Text("SAVED ODDS · NOT LIVE")
                        .hubKickerFont(10.5).foregroundStyle(.white.opacity(0.62))
                }
                HStack(spacing: 22) {
                    if let t = row.total { numberStat("O/U", HubFmt.stat(t)) }
                    if let sp = row.spread {
                        numberStat("Spread \(hubSideLabel(row.home_abbr, row.home_team, league: row.league))", HubFmt.stat(sp))
                    }
                    if let mh = row.ml_home, let ma = row.ml_away {
                        numberStat("ML", "\(hubSideLabel(row.home_abbr, row.home_team, league: row.league)) \(fmtML(mh)) · \(hubSideLabel(row.away_abbr, row.away_team, league: row.league)) \(fmtML(ma))")
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(.horizontal, 18)
    }

    private func numberStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).hubKickerFont(10.5).tracking(0.6).foregroundStyle(.white.opacity(0.62))
            Text(value).hubDataFont(15).foregroundStyle(.white.opacity(0.92))
        }
    }

    /// One masthead side, tappable → its team card. The "@" stays plain ink.
    private func teamNameLine(_ name: String, lead: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let lead {
                Text(lead)
                    .hubTitleFont(22)
                    .foregroundStyle(.white.opacity(0.35))
            }
            Button { onClose(); onTeamName(name) } label: {
                Text(name)
                    .hubTitleFont(30)
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var cta: some View {
        Button { onClose(); onViewGame(abbrMatchup) } label: {
            HStack(spacing: 8) {
                Text("VIEW GAME ON PICKS")
                Image(systemName: "arrow.right")
            }
            .hubDataFont(15)
            .foregroundStyle(GaryColors.gold)
            .frame(maxWidth: .infinity).padding(.vertical, 16)
            .background(Capsule().fill(Color.black))
            .overlay(Capsule().stroke(GaryColors.gold, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 18)
        .padding(.top, 4)
    }
}

