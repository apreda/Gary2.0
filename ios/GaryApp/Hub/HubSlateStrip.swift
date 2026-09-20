import SwiftUI

// MARK: - Tonight's slate strip

/// Identifiable wrapper for the slate-strip → game-sheet presentation.
struct HubGameSel: Identifiable {
    let row: TomorrowBoardRow
    var id: String {
        let game = row.bdl_game_id.map(String.init)
            ?? "\(row.away_team ?? row.away_abbr ?? "")|\(row.home_team ?? row.home_abbr ?? "")|\(row.commence_time ?? row.scheduled_date ?? "")"
        return "\(row.league ?? "")|\(game)"
    }
}

/// Exact IDs are authoritative. A legacy name join is allowed only when a
/// single score in the same league owns it, never between doubleheader games.
@MainActor func hubLiveScore(for row: TomorrowBoardRow, cache: LiveScoreCache) -> LiveScore? {
    if let id = row.bdl_game_id { return cache.status(forGameId: id, league: row.league) }
    let matchup = "\(row.away_team ?? "") @ \(row.home_team ?? "")"
    let matches = cache.scores.filter {
        HubCardIdentity.sameLeague($0.league, row.league ?? "") && abbrGameMatches($0.abbrGame, matchup: matchup)
    }
    return matches.count == 1 ? matches[0] : nil
}

/// WC board rows carry no abbreviations — fall back to the first three
/// letters of the team name ("France" → FRA) so labels never read "—".
/// Shared display formatting keeps ESPN college codes consistent across Hub rows.
func hubSideLabel(_ abbr: String?, _ team: String?, league: String? = nil) -> String {
    scoreboardTeamAbbreviation(team, stored: abbr, league: league)
}

struct HubSlateStrip: View {
    let rows: [TomorrowBoardRow]
    let onTap: (TomorrowBoardRow) -> Void
    /// Live scores overlay the scheduled time once a game starts — the strip
    /// reads scheduled → ▶ live score → final across the day.
    @ObservedObject private var live = LiveScoreCache.shared

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                    Button { onTap(r) } label: { block(r) }
                        .buttonStyle(.plain)
                    if i < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1, height: 26)
                    }
                }
            }
            .padding(.horizontal, 18)
        }
    }

    private func side(_ abbr: String?, _ team: String?, _ league: String?) -> String { hubSideLabel(abbr, team, league: league) }

    @ViewBuilder private func block(_ r: TomorrowBoardRow) -> some View {
        let marquee = r.is_marquee == true
        let matchup = "\(side(r.away_abbr, r.away_team, r.league)) @ \(side(r.home_abbr, r.home_team, r.league))"
        let ls = hubLiveScore(for: r, cache: live)
        VStack(alignment: .leading, spacing: 3) {
            Text((ls?.isLive == true || ls?.isFinal == true) ? (ls?.scoreLine ?? matchup) : matchup)
                .hubDataFont(11.5, .semibold)
                .foregroundStyle(.white.opacity(marquee ? 0.95 : 0.8))
            HStack(spacing: 6) {
                if let ls, ls.isLive {
                    Text("▶ \((ls.detail ?? "LIVE").uppercased())")
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(GaryColors.win)
                } else if ls?.isFinal == true || (ls == nil && r.game_status?.lowercased() == "final") {
                    Text("FINAL")
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(.white.opacity(0.55))
                } else if let interruption = ls?.interruptionLabel ?? r.interruptionLabel {
                    Text(interruption)
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(GaryColors.gold)
                } else if ls == nil && r.game_status?.lowercased() == "live" {
                    Text("LIVE")
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(GaryColors.win)
                } else {
                    // A college row filed date-only carries no real kickoff —
                    // say so instead of printing a placeholder as a time.
                    Text(r.kickoffTimeLabel
                         ?? TomorrowView.etTime(r.commence_time, withZone: false, meridiem: true))
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(marquee ? GaryColors.gold : .white.opacity(0.55))
                    // STORE-SAFE BRIDGE: the strip is a schedule — no totals.
                    if let t = r.total, !AppFlags.storeSafe {
                        Text("O/U \(HubFmt.stat(t))")
                            .hubDataFont(9.5, .medium)
                            .foregroundStyle(.white.opacity(0.55))
                    }
                }
            }
        }
        .padding(.horizontal, 13)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }
}

