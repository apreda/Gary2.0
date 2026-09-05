// HubModules.swift — League Pulse table, Connection → Signal mapping, Night Board, Hub modules, Player Insights.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - League Pulse table (the section itself lives on The Hub — Jul 30)

/// Renders ONE league_pulse row as a small table: a header from columns[] and a
/// row per rows[] entry, reading row[col.key]. Zero hardcoding — the schema is
/// in the payload. Reserved cell keys it honors: "team" (abbr beside the primary
/// cell), "trend" ("hot"/"cold" → ▲/▼ chip), "highlight" ("today" → gold edge).
struct PulseTable: View {
    let row: LeaguePulseRow
    /// Routing law (founder, Aug 4 — team taps had been dead in these tables):
    /// a primary cell that IS a team (column key "team") opens the team card;
    /// a player primary opens his breakdown when the day has his card; the
    /// team tag beside a player name opens the team card. A player name with
    /// no resolvable card stays plain text — never a dead tap.
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    var onTeam: ((String) -> Void)? = nil

    private var columns: [LeaguePulseColumn] { row.columns }
    private var cells: [[String: String]] { row.rows }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().background(Color.white.opacity(0.07))
            if cells.isEmpty {
                Text("No data yet.")
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.62))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14).padding(.vertical, 12)
            } else {
                ForEach(Array(cells.enumerated()), id: \.offset) { idx, cell in
                    dataRow(cell)
                    if idx < cells.count - 1 {
                        Divider().background(Color.white.opacity(0.05)).padding(.leading, 14)
                    }
                }
            }
        }
    }

    /// Columns that actually paint — the trend chip rides inside the primary
    /// cell, so its raw column would otherwise burn a full equal-width slot
    /// rendering nothing (a third of why names truncated).
    private var paintedColumns: [LeaguePulseColumn] {
        columns.filter { $0.key != "trend" }
    }
    private var primaryColumn: LeaguePulseColumn? { paintedColumns.first { $0.emphasis == "primary" } }
    private var restColumns: [LeaguePulseColumn] { paintedColumns.filter { $0.emphasis != "primary" } }

    // Row grammar (no-ellipsis law, founder Jul 13): the NAME gets one flexible
    // half of the row, the short numeric columns split the other half — an
    // equal N-way split starved "W. Contreras" into "W. Con…" while "14"
    // lounged in the same width. Header and rows share the structure so the
    // columns stay aligned.
    private var header: some View {
        HStack(spacing: 8) {
            if let p = primaryColumn {
                Text(p.label.uppercased())
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.62))
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: alignment(p))
            }
            HStack(spacing: 8) {
                ForEach(Array(restColumns.enumerated()), id: \.offset) { _, col in
                    // One line, scale before wrap — "TEAM" once broke into
                    // "TEA/M" in a narrow slot (founder, Jul 13).
                    Text(col.label.uppercased())
                        .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, alignment: alignment(col))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }

    private func dataRow(_ cell: [String: String]) -> some View {
        let isToday = (cell["highlight"] == "today")
        return HStack(spacing: 8) {
            if let p = primaryColumn {
                cellView(p, cell)
                    .frame(maxWidth: .infinity, alignment: alignment(p))
            }
            HStack(spacing: 8) {
                ForEach(Array(restColumns.enumerated()), id: \.offset) { _, col in
                    cellView(col, cell)
                        .frame(maxWidth: .infinity, alignment: alignment(col))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .overlay(alignment: .leading) {
            // "today" → gold left edge (a probable starter / today's player).
            Rectangle().fill(isToday ? GaryColors.gold : .clear).frame(width: 2)
        }
        .background(isToday ? GaryColors.gold.opacity(0.05) : .clear)
    }

    @ViewBuilder
    private func cellView(_ col: LeaguePulseColumn, _ cell: [String: String]) -> some View {
        let value = cell[col.key] ?? ""
        if col.emphasis == "primary" {
            // Primary cell: bold name + optional team abbr + optional trend chip.
            // HARD LAW (founder, Jul 13): information NEVER ellipsizes — the name
            // scales down before it can ever cut off ("Ju…" shipped once; never
            // again). The feed also sends short names ("J. Caminero") now.
            HStack(spacing: 6) {
                primaryName(col, value)
                if let team = cell["team"], !team.isEmpty, col.key != "team" {
                    teamTag(team)
                }
                trendChip(cell["trend"])
            }
        } else if col.key == "trend" {
            // The trend is already represented by the ▲/▼ chip in the primary cell —
            // don't also draw the raw "hot"/"cold" word as a duplicate column.
            EmptyView()
        } else if col.key == "team", let onTeam, !value.isEmpty {
            // A standalone TEAM column — the abbr routes to the team card
            // (same ink as before: taps route, they don't shout — Jul 30).
            Button { onTeam(value) } label: {
                Text(value)
                    .font(emphasisFont(col.emphasis))
                    .foregroundStyle(emphasisColor(col.emphasis))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            Text(value.isEmpty ? "—" : value)
                .font(emphasisFont(col.emphasis))
                .foregroundStyle(emphasisColor(col.emphasis))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    /// The primary name, routed by what it IS: a team-keyed primary → team
    /// card; a player with a resolved card → his breakdown; else plain text.
    @ViewBuilder
    private func primaryName(_ col: LeaguePulseColumn, _ value: String) -> some View {
        let label = Text(value)
            .font(GaryFonts.text(13.5, .semibold)).foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        if col.key == "team", let onTeam, !value.isEmpty {
            Button { onTeam(value) } label: { label.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else if let card = cardFor(value) {
            Button { onPlayer(card) } label: { label.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else {
            label
        }
    }

    /// The team abbr riding beside a player name — always a team-card tap.
    @ViewBuilder
    private func teamTag(_ team: String) -> some View {
        let label = Text(team.uppercased())
            .font(GaryFonts.mono(9))
            .foregroundStyle(.white.opacity(0.62))
            .fixedSize()
        if let onTeam {
            Button { onTeam(team) } label: {
                label.padding(.vertical, 4).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            label
        }
    }

    @ViewBuilder
    private func trendChip(_ trend: String?) -> some View {
        switch trend {
        case "hot":
            Text("▲").font(.system(size: 10, weight: .bold)).foregroundStyle(GaryColors.mlbGrass)
        case "cold":
            Text("▼").font(.system(size: 10, weight: .bold)).foregroundStyle(Color(hex: "#D9534F"))
        default:
            EmptyView()
        }
    }

    private func emphasisFont(_ e: String?) -> Font {
        switch e {
        case "stat":  return GaryFonts.mono(13, bold: true)
        case "muted": return GaryFonts.mono(12)
        default:      return GaryFonts.mono(12.5)
        }
    }

    private func emphasisColor(_ e: String?) -> Color {
        switch e {
        case "stat":  return .white.opacity(0.9)
        case "muted": return .white.opacity(0.45)
        default:      return .white.opacity(0.7)
        }
    }

    private func alignment(_ col: LeaguePulseColumn) -> Alignment {
        col.align == "trailing" ? .trailing : .leading
    }
}


/// The Prop Slip — one silver card, one two-line row per prop (name + team,
/// then the gold pick + odds), with a W/L letter rail that fills in as props
/// settle. Replaces stacked prop cards anywhere a game carries 1–5 props.
/// Locked-card language throughout: same frame, fonts, and gold-only-pick rule.
extension PropPick {
    /// "TOTAL BASES OVER 1.5" — the locked card's pick composition, shared by
    /// the slip rows and the condensed Take sheet.
    var slipPickText: String {
        var words = Formatters.propDisplay(prop, league: effectiveLeague)
            .split(separator: " ").map(String.init)
        if let last = words.last, Double(last) != nil { words.removeLast() }
        var name = words.joined(separator: " ").uppercased()
        name = CompactPropRow.marketAbbrevShared[name] ?? name
        // STORE-SAFE BRIDGE: "2+ TOTAL BASES" instead of "TOTAL BASES OVER 1.5".
        if let b = bridgeCallText {
            return [b.uppercased(), name].filter { !$0.isEmpty }.joined(separator: " ")
        }
        var call = (bet ?? "").uppercased()
        if let raw = line?.trimmingCharacters(in: .whitespaces), !raw.isEmpty {
            let lineText = Double(raw).map { $0.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%g", $0) : String(format: "%.1f", $0) } ?? raw
            call = call.isEmpty ? lineText : "\(call) \(lineText)"
        }
        return [name, call].filter { !$0.isEmpty }.joined(separator: " ")
    }
}


/// A prop's back supplies prop content to the exact same shell used by
/// PickCardBack. Keeping this wrapper intentionally tiny makes visual drift
/// between game and prop backs impossible.
struct PropSlipBack: View {
    let flipped: Bool
    let prop: PropPick
    var gameResult: String? = nil

    private var takeText: String? {
        guard let raw = prop.analysis.map({ AppFlags.bridgeProse($0) })?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else { return nil }
        let cleaned = cleanPropAnalysis(raw).trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    var body: some View {
        GaryTakeCardBack(flipped: flipped,
                         takeText: takeText,
                         shareAccessibilityLabel: "Share this prop pick",
                         shareImages: { renderPropShareImages(prop: prop, gameResult: gameResult) }) {
            if AppFlags.userBookEnabled {
                PropTailFadeRow(prop: prop)
            }
        }
    }
}

/// Compact live/final score banner above a game's pick card.
struct LiveScoreStrip: View {
    let score: LiveScore
    var body: some View {
        HStack(spacing: 8) {
            if score.isLive {
                Circle().fill(GaryColors.gold).frame(width: 6, height: 6)
                Text("LIVE")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.4)
                    .foregroundStyle(GaryColors.gold)
            } else if let interruption = score.interruptionLabel {
                Text(interruption)
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.0)
                    .foregroundStyle(GaryColors.gold)
            } else if score.isFinal {
                Text("FINAL")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.4)
                    .foregroundStyle(.white.opacity(0.62))
            } else {
                Text("SCHEDULED")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.0)
                    .foregroundStyle(.white.opacity(0.62))
            }
            if let line = score.scoreLine {
                Text(line)
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(GaryColors.gold)
            }
            if score.isLive, let det = score.detail, !det.isEmpty {
                Text(det)
                    .font(GaryFonts.mono(10, bold: true)).tracking(0.6)
                    .foregroundStyle(GaryColors.gold.opacity(0.6))
            }
            if score.hasGameState {
                BaseDiamond(onFirst: score.onFirst, onSecond: score.onSecond, onThird: score.onThird)
                    .padding(.leading, 2)
                if let o = score.outs {
                    HStack(spacing: 3) {
                        ForEach(0..<2, id: \.self) { i in
                            Circle()
                                .fill(i < min(o, 2) ? GaryColors.gold : Color.white.opacity(0.18))
                                .frame(width: 5, height: 5)
                        }
                    }
                    Text("OUT")
                        .font(GaryFonts.mono(8.5, bold: true)).tracking(0.5)
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }
}

/// Tiny baseball diamond — a base fills gold when a runner is on. MLB live cards only.
struct BaseDiamond: View {
    let onFirst: Bool
    let onSecond: Bool
    let onThird: Bool
    var size: CGFloat = 20

    private func base(_ on: Bool) -> some View {
        let s = size * 0.34
        return RoundedRectangle(cornerRadius: 1.5, style: .continuous)
            .fill(on ? GaryColors.gold : Color.white.opacity(0.10))
            .overlay(
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .stroke(on ? GaryColors.gold : Color.white.opacity(0.3), lineWidth: 0.8)
            )
            .frame(width: s, height: s)
            .rotationEffect(.degrees(45))
    }

    var body: some View {
        ZStack {
            base(onSecond).offset(y: -size * 0.28)
            base(onThird).offset(x: -size * 0.28)
            base(onFirst).offset(x: size * 0.28)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Connection -> Signal mapping
// Lets a fetched `Connection` (Models.swift) render through SignalRow and the
// Hub (HubView.swift). Reuses the existing SignalKind cases by matching the
// category string.

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
        case "the_sweat", "sweat": return .theSweat
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
            sweat: kd == .theSweat ? meta : nil,
            afterGary: kd == .afterGary ? meta : nil,
            marketRange: kd == .marketRange ? meta : nil,
            nextSlate: kd == .nextSlate ? meta : nil
        )
    }
}


// MARK: - Night Board (the whole league's night, searchable — night_highlights)

/// Every homer, multi-hit night, K show, gem, RBI night and steal job from
/// last night — searchable by player or team, Gary's mark only where he had
/// the position. The Hub's morning centerpiece.
struct NightBoard: View {
    let rows: [NightHighlightRow]
    @State private var tab = 0

    static let cats: [(key: String, label: String, noun: String)] = [
        ("hr", "HR", "homered"),
        ("multi_hit", "2+ HITS", "had multi-hit nights"),
        ("k_show", "K SHOW", "struck out 7+"),
        ("gem", "GEMS", "dealt a gem"),
        ("rbi_night", "RBI", "drove in 3+"),
        ("sb_night", "SPEED", "stole 2+ bags")
    ]

    private var present: [(key: String, label: String, noun: String)] {
        Self.cats.filter { c in rows.contains { $0.category == c.key } }
    }

    private static func lead(_ d: String?) -> Int {
        Int((d ?? "").prefix(while: { $0.isNumber })) ?? 0
    }

    private func ordered(_ r: [NightHighlightRow]) -> [NightHighlightRow] {
        r.sorted {
            let (a, b) = (Self.lead($0.detail), Self.lead($1.detail))
            if a != b { return a > b }
            return ($0.gary_result != nil) && ($1.gary_result == nil)
        }
    }

    /// Player names get their own shortener — the team one takes the last
    /// word, which turns "Bobby Witt Jr." into "JR.".
    static func shortPlayer(_ name: String?) -> String {
        let suffixes: Set<String> = ["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]
        let parts = (name ?? "").split(separator: " ").map(String.init)
        guard let last = parts.last else { return "" }
        if suffixes.contains(last.lowercased()), parts.count >= 2 {
            return parts.suffix(2).joined(separator: " ")
        }
        return last
    }

    private var visible: [NightHighlightRow] {
        // Page-level search covers the board now (one search per page);
        // the board itself just tabs its categories.
        guard !present.isEmpty else { return [] }
        let key = present[min(tab, present.count - 1)].key
        return ordered(rows.filter { $0.category == key })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if present.count > 1 { tabStrip }
            VStack(spacing: 0) {
                if visible.isEmpty {
                    Text("Nothing on the board from last night.")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.62))
                        .padding(.horizontal, 14).padding(.vertical, 16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(visible.enumerated()), id: \.offset) { i, r in
                    boardRow(r, showCategory: false)
                    if i < visible.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                    }
                }
            }
            .quantPanel()
        }
    }

    private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                ForEach(Array(present.enumerated()), id: \.offset) { i, c in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { tab = i }
                    } label: {
                        Text(c.label)
                            .font(GaryFonts.mono(10.5, bold: true)).tracking(0.8)
                            .foregroundStyle(i == tab ? GaryColors.gold : .white.opacity(0.4))
                            .frame(minHeight: 30)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func boardRow(_ r: NightHighlightRow, showCategory: Bool) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Self.shortPlayer(r.player_name).uppercased())
                    .font(GaryFonts.mono(12, bold: true))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1).minimumScaleFactor(0.7)
                if showCategory, let c = Self.cats.first(where: { $0.key == r.category }) {
                    Text(c.label)
                        .font(GaryFonts.mono(8))
                        .foregroundStyle(GaryColors.gold.opacity(0.7))
                }
            }
            .frame(width: 108, alignment: .leading)
            Text(HomeView.shortTeam(r.team).uppercased())
                .font(GaryFonts.mono(10.5, bold: true))
                .foregroundStyle(TeamColors.color(for: r.team) ?? .white.opacity(0.45))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 64, alignment: .leading)
            Text(r.detail ?? "")
                .font(GaryFonts.mono(11.5, bold: true))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(1).minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, alignment: .trailing)
            Group {
                switch r.gary_result {
                case "won":  Text("✓").foregroundStyle(GaryColors.win)
                case "lost": Text("✗").foregroundStyle(GaryColors.loss)
                default:     Text("–").foregroundStyle(.white.opacity(0.62))
                }
            }
            .font(.system(size: 11, weight: .bold))
            .frame(width: 22, alignment: .center)
        }
        .padding(.vertical, 9).padding(.horizontal, 14)
    }
}

/// Deep-link target from Home's Edges rows into the Hub: the tapped lane
/// lands here; HubView consumes it whenever the tab becomes visible
/// (same idiom as PicksFocusState for the Picks tab). @Published so a tap
/// AFTER the Hub's first load still lands — tabs are kept alive, so a
/// load-time-only consume would go dead for the rest of the session.
final class HubFocusState: ObservableObject {
    static let shared = HubFocusState()
    @Published var focusLane: SignalKind? = nil
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
            edge: hubEdge
        )
        .padding(16)
        .background(GaryColors.darkBg.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill").font(.system(size: 26)).foregroundStyle(.white.opacity(0.62))
            }.buttonStyle(.plain).padding(.top, 14).padding(.trailing, 16)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task {
            if let row = prefetched {
                pack = row.payload
            } else {
                let resolved: String? = signal?.playerId ?? directPlayerId.map(String.init)
                if let pid = resolved {
                    pack = await SupabaseAPI.fetchPlayerInsightCard(date: SupabaseAPI.todayEST(), playerId: pid, league: signal?.league.label ?? "MLB")
                }
            }
            loading = false
        }
    }

    // The Hub's "why this player surfaced" lane verdict, rendered as the v4 card's edge hero.
    private var hubEdge: PlayerCardV4Edge? {
        guard let s = signal else { return nil }
        let body = (s.reg?.verdict ?? s.detail).trimmingCharacters(in: .whitespaces)
        return PlayerCardV4Edge(eyebrow: s.kind.chip, title: s.headline, body: body)
    }


    private var fallbackName: String {
        if let n = prefetched?.player_name, !n.isEmpty { return n }
        if let n = directName, !n.isEmpty { return n }
        guard let signal else { return "Player" }
        return (signal.headline.components(separatedBy: CharacterSet(charactersIn: "(:'")).first ?? signal.headline)
            .trimmingCharacters(in: .whitespaces)
    }

}

/// ESPN-transaction-style injury swap row: the OUT player struck through on
/// top (red), tonight's replacement below (green) with his slot + season line.
/// Tapping anywhere opens the replacement's full Player Insights.
/// First-Inning (NRFI/YRFI) row — recent first innings as scoreless-vs-run dots
/// (green = they scored, red = scoreless). Handles the matchup row (both sides)
/// and the single-team row (one side). Reads the nrfi meta; the headline carries the words.
struct FirstInningRow: View {
    let s: Signal
    var onTap: (Signal) -> Void
    private let green = GaryColors.win
    private let red = Color(hex: "#E5614D")

    var body: some View {
        let m = s.nrfi
        Button { onTap(s) } label: {
            VStack(alignment: .leading, spacing: 9) {
                Text(s.headline)
                    .font(GaryFonts.text(13.5, .semibold)).foregroundStyle(.white)
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let teamSeq = m?.team_seq {
                    dotRow(m?.team_abbr ?? "", teamSeq)
                } else {
                    dotRow(m?.away_abbr ?? "", m?.away_seq ?? [])
                    dotRow(m?.home_abbr ?? "", m?.home_seq ?? [])
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func dotRow(_ abbr: String, _ seq: [Int]) -> some View {
        HStack(spacing: 4) {
            Text(abbr).font(GaryFonts.mono(9.5, bold: true)).foregroundStyle(.white.opacity(0.55))
                .frame(width: 34, alignment: .leading)
            ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                Circle().fill(v == 0 ? red.opacity(0.5) : green.opacity(0.85)).frame(width: 8, height: 8)
            }
            Spacer(minLength: 6)
            Text("\(seq.filter { $0 == 0 }.count)/\(seq.count) clean")
                .font(GaryFonts.mono(8.5)).foregroundStyle(.white.opacity(0.62))
        }
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
    /// Collapsed by default (founder, Sep 3 2026 — the Hub's story rows are
    /// the template): headline + value + chevron.down; a tap opens the read.
    /// Football reads run 450-660 characters, so an always-open row was a
    /// wall of text under the pick card.
    @State private var expanded = false

    var body: some View {
        Button {
            if !dedupedDetail.isEmpty {
                withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() }
            } else {
                onTap?(s.game)
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    // League-aware chip labels: WC's venue intel is tagged .ballpark, and
                    // football availability reports ride .injury — MLB's "REPLACEMENT"
                    // label would misname a status report (founder design pass, Aug 20).
                    Text(signalChipLabel(kind: s.kind, league: s.league)).font(GaryFonts.mono(9, bold: true)).tracking(1.3).foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text(s.game.uppercased()).font(GaryFonts.mono(9, bold: false)).tracking(0.6).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                }
                HStack(alignment: .top, spacing: 10) {
                    // The headline is the fact and always shows whole (no
                    // ellipsis, ever); only the read collapses.
                    Text(s.headline).font(GaryFonts.text(16)).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    // Spark mini-bar removed on the Picks edge rows (user call — the
                    // little 2-bar block read as ambiguous).
                    Spacer(minLength: 6)
                    // Streak values never render — the headline already says
                    // "won 9 straight" and a W9 beside it is the same fact
                    // twice (founder, Aug 14).
                    if !s.value.isEmpty, s.kind != .streak {
                        if s.value.contains(where: { $0.isNumber }) {
                            Text(s.value).font(GaryFonts.mono(20, bold: true)).foregroundStyle(hubValueTint(s))
                        } else {
                            Text(s.value).font(GaryFonts.mono(8.5, bold: true)).tracking(1).foregroundStyle(hubValueTint(s))
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .overlay(Capsule().stroke(s.tone.color.opacity(0.28), lineWidth: 1))
                        }
                    }
                    if !dedupedDetail.isEmpty {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white.opacity(0.62))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .padding(.top, 5)
                    } else if onTap != nil {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.25))
                            .padding(.top, 5)
                    }
                }
                if expanded, !dedupedDetail.isEmpty {
                    Text(dedupedDetail).font(.system(size: 12.5)).foregroundStyle(.white.opacity(0.65))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
                if let xi = s.confirmedXI {
                    ConfirmedXISheetView(meta: xi)
                }
            }
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1), alignment: .bottom)
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
