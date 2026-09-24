// HubModules.swift — League Pulse table, Connection → Signal mapping, Hub modules, Player Insights.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - League Pulse table (the section itself lives on The Hub — Jul 30)

/// The Prop Slip — one silver card, one two-line row per prop (name + team,
/// then the gold pick + odds), with a W/L letter rail that fills in as props
/// settle. Replaces stacked prop cards anywhere a game carries 1–5 props.
/// Shares the current prop-card presentation helpers.
extension PropPick {
}

/// A prop's back supplies prop content to the exact same shell used by
/// PickCardBack. Keeping this wrapper intentionally tiny makes visual drift
/// between game and prop backs impossible.
struct PropSlipBack: View {
    let flipped: Bool
    let prop: PropPick
    var gameResult: String? = nil

    private var takeText: String? {
        guard let raw = prop.analysis?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else { return nil }
        let cleaned = cleanPropAnalysis(raw).trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    var body: some View {
        GaryTakeCardBack(flipped: flipped,
                         takeText: takeText,
                         readingTarget: ReadingContentTarget(key: "prop:\(prop.id)", surface: .propCard),
                         shareAccessibilityLabel: "Share this prop pick",
                         shareImages: { renderPropShareImages(prop: prop, gameResult: gameResult) }) {
            Text(prop.quote_receipt?.label ?? "Saved pregame odds")
                .font(GaryFonts.text(11, .medium))
                .foregroundStyle(GaryColors.sectionSub)
                .fixedSize(horizontal: false, vertical: true)
            PropTailFadeRow(prop: prop)
        }
    }
}

// MARK: - Connection -> Signal mapping
// Lets a fetched `Connection` (Models/InsightModels.swift) render through
// SignalRow. Reuses the existing SignalKind cases by matching the category string.

extension SignalKind {
    /// Map a stored category string onto an existing SignalKind case.
    /// Returns nil for unrecognized kinds so the row is dropped rather than
    /// mis-bucketed.
    static func from(_ raw: String?) -> SignalKind? {
        switch (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "streak": return .streak
        case "h2h", "head-to-head", "head_to_head": return .h2h
        case "owned", "h2h_form": return .batterVsArm
        case "hot", "heat", "heat check", "heat_check": return .hot
        case "cold", "cooling", "cooling off", "cooling_off": return .cold
        case "injury", "replacement", "beneficiary": return .injury
        case "situational", "rest", "fatigue", "rest & fatigue", "rest_fatigue": return .situational
        case "platoon", "platoon edge", "platoon_edge": return .platoon
        case "ballpark", "ballpark shift", "ballpark_shift": return .ballpark
        case "regression", "regression watch", "regression_watch", "regression_tomorrow": return .regression
        case "xg_regression", "xg regression": return .xgRegression
        case "advancement", "advancement_odds", "advancement odds": return .advancement
        case "xg_recap", "xg recap": return .xgRecap
        case "tournament", "stakes", "group", "tournament_stakes": return .tournament
        case "gary_hr_threats", "hr_threat", "hr threats": return .hrThreat
        case "streaking": return .streak
        case "starter_form": return .starterForm
        case "starter_team_record", "team_record": return .teamRecord
        case "bullpen_fatigue": return .bullpenFatigue
        case "first_inning": return .firstInning
        case "running_game": return .runningGame
        case "park_weather": return .parkWeather
        case "fantasy_pickups", "streamers", "pickups": return .fantasyPickups
        case "two_start_week", "two_start": return .twoStart
        case "closer_watch": return .closerWatch
        case "return_watch": return .returnWatch
        case "cut_list": return .cutList
        // Football game-intel lanes. Accept the compact category names and the
        // descriptive names used by older desk experiments; both resolve to one
        // honest UI label instead of being dropped as unknown.
        case "trenches", "the_trenches", "ol_dl", "line_play", "line_of_scrimmage": return .trenches
        case "quarterback", "quarterbacks", "qb", "qb_matchup": return .quarterback
        case "mismatch", "the_mismatch": return .mismatch
        case "pass_rush", "pressure", "pressure_rate": return .passRush
        case "coverage", "secondary", "coverage_matchup": return .coverage
        case "pace_script", "pace_and_script", "game_script", "tempo": return .paceScript
        case "red_zone", "red_zone_edge", "red_zone_td": return .redZone
        case "turnover_edge", "turnovers", "turnover_margin": return .turnoverEdge
        case "explosive_play", "explosive_plays", "explosiveness": return .explosivePlay
        case "special_teams", "special_teams_edge": return .specialTeams
        case "coaching", "coaching_edge": return .coaching
        case "after_gary", "after gary": return .afterGary
        case "market_range", "market range": return .marketRange
        case "next_slate", "next slate": return .nextSlate
        case "practice_report", "practice report": return .practiceReport
        // NFL fantasy lanes. These are kept separate from MLB waiver/closer
        // categories because their evidence and labels are sport-specific.
        case "fantasy_usage", "usage", "usage_role", "snap_share", "target_share", "rush_share": return .fantasyUsage
        case "fantasy_red_zone", "red_zone_role", "goal_line_role": return .fantasyRedZone
        case "fantasy_matchup", "player_matchup": return .fantasyMatchup
        case "fantasy_trend", "recent_usage", "recent_trend": return .fantasyTrend
        default: return nil
        }
    }
}

extension HubLeagueSel {
    static func from(_ raw: String?) -> HubLeagueSel? {
        switch (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
        case "MLB": return .mlb
        case "NFL", "AMERICAN_FOOTBALL_NFL": return .nfl
        case "NCAAF", "NCAA FOOTBALL", "AMERICAN_FOOTBALL_NCAAF": return .ncaaf
        case "NBA": return .nba
        case "WC", "WORLD CUP", "SOCCER_WORLD_CUP": return .wc
        default: return nil
        }
    }
}

extension HubTone {
    static func from(_ raw: String?) -> HubTone {
        switch (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "good", "positive", "up": return .good
        case "bad", "negative", "down": return .bad
        default: return .neutral
        }
    }
}

extension Connection {
    /// Convert to a render-ready Signal. Returns nil when the row lacks the
    /// minimum needed to bucket/render it (unknown league or category), so the
    /// caller can decide whether the overall fetch is usable.
    func toSignal() -> Signal? {
        guard let lg = HubLeagueSel.from(league),
              let kd = SignalKind.from(category) else { return nil }
        let head = (headline ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !head.isEmpty else { return nil }

        return Signal(
            league: lg,
            kind: kd,
            headline: head,
            detail: detail ?? "",
            game: (game ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            value: value ?? "",
            tone: HubTone.from(tone),
            spark: spark ?? [],
            lineVal: line_val,
            playerId: player_id,
            teamId: team_id,
            result: result,
            resultNote: result_note,
            swap: (meta?.kind == "swap") ? meta : nil,
            confirmedXI: (meta?.kind == "confirmedXI") ? meta : nil,
            reg: (meta?.kind == "regression_pitcher") ? meta : nil,
            h2h: (meta?.kind == "h2h") ? meta : nil,
            lane: meta,
            nrfi: (meta?.kind == "nrfi") ? meta : nil,
            slateDate: date,
            weather: (meta?.kind == "park_weather") ? meta : nil,
            fantasy: ["fantasy_pickup", "two_start", "closer_watch", "return_watch", "cut_list",
                      "fantasy_usage", "usage", "usage_role", "snap_share", "target_share", "rush_share",
                      "fantasy_red_zone", "red_zone_role", "goal_line_role",
                      "fantasy_matchup", "player_matchup", "fantasy_trend", "recent_usage", "recent_trend"]
                .contains(meta?.kind ?? "") ? meta : nil,
            position: meta?.position,
            gameId: game_id,
            afterGary: kd == .afterGary ? meta : nil,
            marketRange: kd == .marketRange ? meta : nil,
            nextSlate: kd == .nextSlate ? meta : nil,
            sourceKey: HubJudgment.sourceKey(category: category, gameID: game_id, playerID: player_id, teamID: team_id),
            sourceObservedAt: HubJudgment.latestSourceObservation(computedAsOf: meta?.computed_as_of,
                                                                 collectedAt: meta?.source_collected_at)
        )
    }
}

// MARK: - Hub dashboard modules (varied shapes — not a uniform stack)

/// Small mono eyebrow + serif sub-line that heads each dashboard module.
struct HubSectionHeader: View {
    let eyebrow: String
    let sub: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(eyebrow)
                .font(GaryFonts.display(17))
                .foregroundStyle(GaryColors.sectionHead)
            if !sub.isEmpty {
                Text(sub).font(.system(size: 12)).foregroundStyle(GaryColors.sectionSub)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .pageGutter()
    }
}

// MARK: - Player Insights (full breakdown behind a hub card)
//
// Fetches the pre-computed player_insight_cards pack for the tapped player and
// renders the betting breakdown: strengths/weaknesses, the pitch-type matchup
// vs tonight's starter, splits, BvP, Statcast truth-check, and tonight's lines.

struct PlayerInsightSheet: View {
    /// Hub path: a tapped Signal — the pack is fetched by player id.
    let signal: Signal?
    /// Game-page path (PLAYER INTEL): the pack already came down with the row.
    var prefetched: PlayerInsightCardRow? = nil
    /// Direct path (Derby contestants, Jul 13): a bare player id + name opens
    /// the SAME standard card every other surface uses.
    var directPlayerId: Int? = nil
    var directName: String? = nil
    /// The league the direct path fetches in (NFL from the quarterback plate).
    var directLeague: String? = nil
    /// The game the direct path belongs to (a doubleheader has one pack per game).
    var directGameId: String? = nil
    /// The stat, mark and window the hit rates open on (from the Darts table).
    var logFocus: LogFocus? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var pack: PlayerInsightPack? = nil
    @State private var loading = true

    var body: some View {
        // Unified with the lineup carousel — the same v4 card (which has its OWN internal
        // ScrollView, so NO outer ScrollView here — nesting two vertical scrollers breaks
        // scrolling), with the Hub's "why this surfaced" lane verdict as the edge hero.
        PlayerCardV4(
            name: pack?.name ?? fallbackName,
            game: (pack?.game ?? signal?.game) ?? "",
            pack: pack,
            loading: loading,
            edge: hubEdge,
            logFocus: logFocus
        )
        .padding(16)
        .background(GaryColors.darkBg.ignoresSafeArea())
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .medium)).foregroundStyle(PCV4.mut)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close player details")
            }
            .padding(.horizontal, 16).padding(.top, 6)
            .background(GaryColors.darkBg)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task {
            if let row = prefetched {
                pack = row.payload
            } else {
                let resolved: String? = signal?.playerId ?? directPlayerId.map(String.init)
                if let pid = resolved {
                    pack = await SupabaseAPI.fetchPlayerInsightCard(date: SupabaseAPI.todayEST(), playerId: pid, league: directLeague ?? signal?.league.label ?? "MLB", gameId: directGameId ?? signal?.gameId)
                }
            }
            loading = false
        }
    }

    // The Hub's "why this player surfaced" lane verdict, rendered as the v4 card's edge hero.
    private var hubEdge: PlayerCardV4Edge? {
        guard let s = signal else { return nil }
        let body = (s.reg?.verdict ?? s.detail).trimmingCharacters(in: .whitespaces)
        return PlayerCardV4Edge(eyebrow: signalChipLabel(kind: s.kind, league: s.league), title: s.headline, body: body)
    }

    private var fallbackName: String {
        if let n = prefetched?.player_name, !n.isEmpty { return n }
        if let n = directName, !n.isEmpty { return n }
        guard let signal else { return "Player" }
        return (signal.headline.components(separatedBy: CharacterSet(charactersIn: "(:'")).first ?? signal.headline)
            .trimmingCharacters(in: .whitespaces)
    }

}

/// Head-to-Head row — THE LEDGER (mock H2, founder pick Aug 6). Replaces the
/// tug-of-war bar: the season series big on the right, then every meeting as
/// its own line with the venue that night (away @ home), the score, and the
/// dominant side's W/L. Same shape the Hub's H2H section speaks, so the two
/// surfaces read as one design. Rows written before the `meetings` payload
/// fall back to the last-meeting line rather than an empty table.
struct HeadToHeadRow: View {
    let s: Signal
    var onTap: (Signal) -> Void
    private let green = Color(hex: "#63D17E")
    private let red = Color(hex: "#cf6b5b")

    var body: some View {
        let h = s.h2h
        let wins = max(h?.wins ?? 0, 0)
        let losses = max(h?.losses ?? 0, 0)
        let domName = h?.dominant_name ?? "Team"
        let oppName = h?.opponent_name ?? "Opponent"
        let domAbbr = h?.dominant ?? ""
        let oppAbbr = h?.opponent ?? ""
        let last = h?.last_meeting
        let meetings = h?.meetings ?? []

        Button { onTap(s) } label: {
            VStack(alignment: .leading, spacing: 0) {
                // No lane kicker here (founder, Aug 6: "duplicate head to head
                // delete the one in grey") — the section that owns this row
                // already carries the title, so a second HEAD-TO-HEAD inside
                // the card said it twice.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(s.headline.isEmpty ? "\(domName) own \(oppName)" : s.headline)
                        .font(GaryFonts.text(16, .semibold)).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 6)
                    Text("\(wins)-\(losses)")
                        .font(GaryFonts.display(28)).foregroundStyle(green)
                        .lineLimit(1).fixedSize()
                }
                if !meetings.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(meetings.reversed().prefix(4).enumerated()), id: \.offset) { i, m in
                            if i > 0 {
                                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                            }
                            meetingRow(m)
                        }
                    }
                    .padding(.top, 8)
                } else if let last, let score = last.score {
                    Text(last.revenge == true
                         ? "\(oppAbbr) took the last meeting \(score) — revenge spot"
                         : "\(domAbbr) won the last meeting \(score)")
                        .font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.62))
                        .padding(.top, 8)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// One ledger line: date · the venue that night · score · W/L.
    @ViewBuilder private func meetingRow(_ m: H2HMeeting) -> some View {
        HStack(spacing: 10) {
            Text(Self.shortDate(m.date))
                .font(GaryFonts.mono(10.5))
                .foregroundStyle(.white.opacity(0.5))
                .frame(width: 44, alignment: .leading)
            Text("\(m.away ?? "—") @ \(m.home ?? "—")")
                .font(GaryFonts.mono(11.5, bold: true))
                .foregroundStyle(.white.opacity(0.88))
                .lineLimit(1)
            Spacer(minLength: 6)
            Text("\(m.away_runs ?? 0)–\(m.home_runs ?? 0)")
                .font(GaryFonts.mono(11.5, bold: true))
                .foregroundStyle(.white.opacity(0.7))
            Text(m.dom_won == true ? "W" : "L")
                .font(GaryFonts.mono(11.5, bold: true))
                .foregroundStyle(m.dom_won == true ? green : red)
                .frame(width: 12, alignment: .trailing)
        }
        .padding(.vertical, 6)
    }

    /// "2026-07-21" → "Jul 21".
    static func shortDate(_ iso: String?) -> String {
        guard let iso, iso.count >= 10 else { return "—" }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: String(iso.prefix(10))) else { return "—" }
        let out = DateFormatter(); out.dateFormat = "MMM d"
        out.timeZone = TimeZone(identifier: "America/New_York")
        return out.string(from: d)
    }
}

struct SignalRow: View {
    /// The detail often opens by restating the headline word-for-word ("Reds 7-1
    /// in Burns's last 8 starts" / "Reds are 7-1 in Burns's last 8 starts this
    /// season — ..."). When the first sentence is just the headline again, drop
    /// it so the body only carries what the headline doesn't.
    private var dedupedDetail: String {
        let detail = s.detail
        guard !detail.isEmpty else { return detail }
        let norm: (String) -> String = { $0.lowercased().filter { $0.isLetter || $0.isNumber } }
        let sentences = detail.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        guard sentences.count == 2 else {
            return norm(detail) == norm(s.headline) ? "" : detail
        }
        let first = String(sentences[0]), rest = String(sentences[1]).trimmingCharacters(in: .whitespaces)
        let nFirst = norm(first), nHead = norm(s.headline)
        let echoes = nFirst == nHead || (nHead.count > 20 && nFirst.hasPrefix(nHead)) || (nFirst.count > 20 && nHead.hasPrefix(nFirst))
        return (echoes && !rest.isEmpty) ? rest : detail
    }

    let s: Signal
    /// nil = a read-only row (Picks tab's edge lists) — no navigation
    /// promise. The Hub passes a handler and gets it once the row has no read
    /// to open.
    var onTap: ((String) -> Void)? = nil
    /// The day feed sits over the floor grid; its facts need an opaque surface.
    var contained: Bool = false
    /// Collapsed by default (founder, Sep 3 2026 — the Hub's story rows are
    /// the template): headline + value + chevron.down; a tap opens the read.
    /// Football reads run 450-660 characters, so an always-open row was a
    /// wall of text under the pick card.
    @State private var expanded = false

    var body: some View {
        // Normalizing the complete read is relatively expensive. Do it once
        // for this rendering, rather than again for each disclosure and label.
        let detail = dedupedDetail
        return Button {
            if !detail.isEmpty {
                withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() }
            } else {
                onTap?(s.game)
            }
        } label: {
            VStack(alignment: .leading, spacing: contained ? 10 : 6) {
                HStack(spacing: 8) {
                    // League-aware chip labels: WC's venue intel is tagged .ballpark, and
                    // football availability reports ride .injury — MLB's "REPLACEMENT"
                    // label would misname a status report (founder design pass, Aug 20).
                    Text(signalChipLabel(kind: s.kind, league: s.league))
                        .font(contained ? GaryFonts.kicker(10, .semibold) : GaryFonts.mono(9, bold: true))
                        .tracking(contained ? 0.8 : 1.3)
                        .foregroundStyle(contained ? .white.opacity(0.62) : GaryColors.gold)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Text(s.game.uppercased()).font(GaryFonts.mono(9, bold: false)).tracking(0.6).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                    if contained {
                        disclosure(hasDetail: !detail.isEmpty)
                    }
                }
                if contained {
                    // Full-width headlines avoid squeezing a sentence into a
                    // narrow column beside a large, repeated statistic.
                    headline
                    if (!s.value.isEmpty && s.kind != .streak) || sampleLabel != nil {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            metricValue
                            Spacer(minLength: 6)
                            if let sample = sampleLabel {
                                Text(sample).font(GaryFonts.mono(9))
                                    .foregroundStyle(.white.opacity(0.62))
                                    .fixedSize(horizontal: false, vertical: true)
                                    .accessibilityLabel("Sample: \(sample)")
                            }
                        }
                    }
                } else {
                HStack(alignment: .top, spacing: 10) {
                    // The headline is the fact and always shows whole (no
                    // ellipsis, ever); only the read collapses.
                    headline
                    // Spark mini-bar removed on the Picks edge rows (user call — the
                    // little 2-bar block read as ambiguous).
                    Spacer(minLength: 6)
                    // Streak values never render — the headline already says
                    // "won 9 straight" and a W9 beside it is the same fact
                    // twice (founder, Aug 14).
                    metricValue
                    disclosure(hasDetail: !detail.isEmpty).padding(.top, 5)
                }
                }
                if expanded, !detail.isEmpty {
                    if contained {
                        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                            .padding(.vertical, 2)
                    }
                    Text(detail).font(.system(size: contained ? 14 : 12.5)).foregroundStyle(.white.opacity(contained ? 0.72 : 0.65))
                        .lineSpacing(contained ? 4 : 2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
                if let xi = s.confirmedXI {
                    ConfirmedXISheetView(meta: xi)
                }
            }
            .padding(.vertical, contained ? 14 : 11)
            .padding(.horizontal, contained ? 14 : 0)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background {
            if contained {
                RoundedRectangle(cornerRadius: 12).fill(GaryColors.panelFillOpaque)
            }
        }
        .overlay(alignment: .bottom) {
            if contained {
                RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.06), lineWidth: 1)
            } else {
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            }
        }
        .accessibilityValue(detail.isEmpty ? "" : (expanded ? "Expanded" : "Collapsed"))
    }

    private var headline: some View {
        Text(s.headline).font(GaryFonts.text(contained ? 15 : 16)).foregroundStyle(.white)
            .lineSpacing(contained ? 3 : 0)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Show the measured sample before a tap, especially on one-game college
    /// slates. The provider's season keeps a prior-year baseline explicit.
    private var sampleLabel: String? {
        guard s.league == .nfl || s.league == .ncaaf,
              let meta = s.lane,
              ["balldontlie_team_stats", "balldontlie_team_stats_opponents"].contains(meta.source ?? ""),
              let season = meta.season?.display, !season.isEmpty,
              let away = meta.away?.games, away > 0,
              let home = meta.home?.games, home > 0 else { return nil }
        func games(_ count: Int) -> String { "\(count) game\(count == 1 ? "" : "s")" }
        if away == home { return "\(season) · \(games(away)) each" }
        guard let a = meta.away?.abbreviation, let h = meta.home?.abbreviation else { return nil }
        return "\(season) · \(a) \(games(away)) · \(h) \(games(home))"
    }

    @ViewBuilder private var metricValue: some View {
        if !s.value.isEmpty, s.kind != .streak {
            if s.value.contains(where: { $0.isNumber }) {
                Text(s.value).font(GaryFonts.mono(contained ? 13 : 20, bold: true))
                    .foregroundStyle(hubValueTint(s))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(s.value).font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                    .foregroundStyle(hubValueTint(s))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .overlay(Capsule().stroke(s.tone.color.opacity(0.28), lineWidth: 1))
            }
        }
    }

    @ViewBuilder private func disclosure(hasDetail: Bool) -> some View {
        if hasDetail {
            Image(systemName: "chevron.down")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.white.opacity(0.62))
                .rotationEffect(.degrees(expanded ? 180 : 0))
        } else if onTap != nil {
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.25))
        }
    }
}

/// Confirmed XI display for the WC Confirmed XI lane: each team's formation + the
/// starting XI grouped by line (GK / DEF / MID / FWD), in a compact two-column sheet.
/// Renders beneath the edge in SignalRow when a row carries a confirmedXI meta.
struct ConfirmedXISheetView: View {
    let meta: SwapMeta
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if let h = meta.home { teamColumn(h) }
            Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)
            if let a = meta.away { teamColumn(a) }
        }
        .padding(.top, 8)
    }

    private func teamColumn(_ s: TeamSheet) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text((s.team ?? "").uppercased())
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                if let f = s.formation, !f.isEmpty {
                    Text(f).font(GaryFonts.mono(8.5, bold: true)).tracking(0.5)
                        .foregroundStyle(.white.opacity(0.62))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1))
                }
            }
            ForEach(["G", "D", "M", "F"], id: \.self) { line in
                let men = (s.xi ?? []).filter { ($0.p ?? "") == line }
                if !men.isEmpty {
                    HStack(alignment: .top, spacing: 5) {
                        Text(lineLabel(line))
                            .font(GaryFonts.mono(7.5, bold: true)).tracking(0.5)
                            .foregroundStyle(.white.opacity(0.62))
                            .frame(width: 24, alignment: .leading).padding(.top, 1)
                        Text(men.map { surname($0.n) }.joined(separator: ", "))
                            .font(.system(size: 11)).foregroundStyle(.white.opacity(0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func lineLabel(_ p: String) -> String {
        switch p {
        case "G": return "GK"
        case "D": return "DEF"
        case "M": return "MID"
        case "F": return "FWD"
        default: return p
        }
    }

    private func surname(_ n: String?) -> String {
        let parts = (n ?? "").split(separator: " ")
        return parts.count > 1 ? String(parts.last!) : (n ?? "")
    }
}
