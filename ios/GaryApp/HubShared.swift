// HubShared.swift — Hub shared palette / tone / league types.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Hub shared palette / tone / league types
//
// Shared types for the Hub ("Today's Edges") and its Signal cards. The league
// set is data-driven: HubView (HubView.swift) only offers leagues that actually
// have insight_connections rows today.

enum HubPalette {
    static let green = Color(hex: "#9cc88a")
    static let red = Color(hex: "#cf6b5b")
}

enum HubTone {
    case good, bad, neutral
    var color: Color {
        switch self {
        case .good: return HubPalette.green
        case .bad: return HubPalette.red
        case .neutral: return Color.white.opacity(0.55)
        }
    }
}

enum HubLeagueSel {
    case mlb, nfl, ncaaf, nba, wc
    /// Short display label for the league toggle / empty state.
    var label: String {
        switch self {
        case .mlb: return "MLB"
        case .nfl: return "NFL"
        case .ncaaf: return "NCAAF"
        case .nba: return "NBA"
        case .wc: return "WC"
        }
    }
}

// ---- shared mini chart ----
struct MiniBarChart: View {
    let values: [Double]
    let line: Double?
    var tint: Color = GaryColors.gold
    var height: CGFloat = 24
    var body: some View {
        // OPS-style values never hit 0, so scale from a floor below the min —
        // otherwise [.779, 1.181] renders as two near-equal bars (66% vs 100%).
        let maxV = max(values.max() ?? 1, line ?? 0, 0.001)
        // Equal pairs get no floor (it would collapse both bars to the 3pt stub).
        let isPair = values.count == 2 && line == nil
        let minV = isPair ? (values.min() ?? 0) : 0
        let floor = (isPair && maxV - minV > 0.0001) ? max(0, minV - (maxV - minV)) : 0
        let span = max(maxV - floor, 0.001)
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(Array(values.enumerated()), id: \.offset) { i, v in
                // 2-bar series = [baseline, current]: mute the baseline, tint the
                // current bar (same idiom as RegressionBoard.gapBar). Otherwise
                // tint bars at/over the reference line.
                let on = isPair ? (i == 1) : (line == nil ? true : v >= (line ?? 0))
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(on ? tint : Color.white.opacity(0.22))
                    .frame(width: isPair ? 14 : 5, height: max(3, CGFloat((v - floor) / span) * height))
            }
        }
        .frame(height: height, alignment: .bottom)
    }
}

// ============================ THE HUB ============================
// The signals layer — the non-obvious connections Gary makes in his rationale,
// organized by lane: streaks, head-to-head dominance, hot/cold players,
// injuries + who replaces them, platoon/ballpark/regression reads, and
// situational records. Every lane is live data from insight_connections
// (written by the insights pipeline, graded the next morning) — no mocks.

enum SignalKind {
    case streak, h2h, hot, cold, injury, situational, platoon, ballpark, regression, tournament, hrThreat
    // June 10 lanes: starter form, first inning, the running game, park weather
    case starterForm, firstInning, runningGame, parkWeather
    // WC forward-looking xG-regression lane (who's over/under-finishing their xG)
    case xgRegression
    // WC: group advancement odds + xG recap (split out of situational)
    case advancement, xgRecap
    // MLB fantasy streamers — today's most pickup-worthy starting pitchers
    case fantasyPickups
    // Fantasy Corner lanes (Jul 26): two-start arms, the ninth-inning ladder,
    // IL players listed back inside the stash window, and the drop side
    case twoStart, closerWatch, returnWatch, cutList
    // MLB career batter-vs-pitcher edge (the `owned` lane). Distinct from
    // .h2h, which is a TEAM season series — both used to map to .h2h and so
    // wore one HEAD-TO-HEAD label on two unrelated reads (founder, Aug 6).
    case batterVsArm
    // MLB team angle — a team's record in tonight's starter's last N starts
    case teamRecord
    // MLB team angle — bullpen workload (relief IP) over the last 3 games
    case bullpenFatigue
    // Football lanes. These remain distinct instead of borrowing baseball
    // labels, so an NFL/NCAAF edge always says exactly what its source measured.
    case trenches, quarterback, passRush, coverage, paceScript
    case redZone, turnoverEdge, explosivePlay, specialTeams, coaching
    // THE MISMATCH (Aug 20): the game's single widest unit gap, one row per
    // game from the same verified team boxes teamEdges reads.
    case mismatch
    // Football-only product modules: live factor tracking on a game page and
    // the post-publish market receipt in The Hub.
    case theSweat, afterGary, marketRange, nextSlate
    // The NFL's official injury report — the Wed/Thu/Fri practice grid on the
    // game page (Sep 3 2026). A module, never a story.
    case practiceReport
    // Football season-long fantasy lanes: current role, scoring-area work,
    // opponent, and movement over recent games for both NFL and NCAAF.
    case fantasyUsage, fantasyRedZone, fantasyMatchup, fantasyTrend
    var icon: String {
        switch self {
        case .streak: return "flame.fill"
        case .h2h: return "arrow.left.arrow.right"
        case .hot: return "flame.fill"
        case .cold: return "snowflake"
        case .injury: return "cross.case.fill"
        case .situational: return "calendar"
        case .platoon: return "arrow.left.arrow.right"
        case .ballpark: return "mappin.and.ellipse"
        case .regression: return "chart.line.downtrend.xyaxis"
        case .tournament: return "trophy.fill"
        case .hrThreat: return "baseball.diamond.bases"
        case .starterForm: return "figure.baseball"
        case .firstInning: return "1.circle.fill"
        case .runningGame: return "figure.run"
        case .parkWeather: return "wind"
        case .xgRegression: return "chart.line.uptrend.xyaxis"
        case .advancement: return "flag.checkered"
        case .xgRecap: return "soccerball"
        case .fantasyPickups: return "star.fill"
        case .twoStart: return "2.circle.fill"
        case .closerWatch: return "9.circle.fill"
        case .returnWatch: return "arrow.uturn.backward.circle.fill"
        case .cutList: return "scissors"
        case .batterVsArm: return "figure.baseball"
        case .teamRecord: return "person.3.fill"
        case .bullpenFatigue: return "bolt.slash.fill"
        case .trenches: return "shield.lefthalf.filled"
        case .quarterback: return "football.fill"
        case .mismatch: return "arrow.right.and.line.vertical.and.arrow.left"
        case .passRush: return "bolt.fill"
        case .coverage: return "lock.shield.fill"
        case .paceScript: return "metronome.fill"
        case .redZone: return "scope"
        case .turnoverEdge: return "arrow.triangle.2.circlepath"
        case .explosivePlay: return "burst.fill"
        case .specialTeams: return "figure.american.football"
        case .coaching: return "person.crop.rectangle.stack.fill"
        case .theSweat: return "waveform.path.ecg"
        case .afterGary: return "arrow.trianglehead.2.clockwise.rotate.90"
        case .marketRange: return "arrow.left.and.right"
        case .nextSlate: return "calendar.badge.clock"
        case .practiceReport: return "list.clipboard"
        case .fantasyUsage: return "chart.bar.fill"
        case .fantasyRedZone: return "scope"
        case .fantasyMatchup: return "person.2.fill"
        case .fantasyTrend: return "chart.line.uptrend.xyaxis"
        }
    }
    var tint: Color {
        switch self {
        case .hot: return HubPalette.green
        case .hrThreat: return HubPalette.green
        case .fantasyPickups: return HubPalette.green
        case .starterForm, .firstInning, .runningGame, .parkWeather,
             .trenches, .quarterback, .passRush, .coverage, .paceScript,
             .redZone, .turnoverEdge, .explosivePlay, .specialTeams, .coaching,
             .theSweat, .afterGary, .marketRange, .nextSlate:
            return .white.opacity(0.6)
        case .fantasyUsage, .fantasyRedZone, .fantasyMatchup, .fantasyTrend:
            return GaryColors.nflAccent
        case .cold: return HubPalette.red
        case .regression: return HubPalette.red
        // Lane identity stays neutral; the tint only carries hot/cold meaning.
        default: return Color.white.opacity(0.5)
        }
    }
    var chip: String {
        switch self {
        case .streak: return "STREAK"
        case .h2h: return "HEAD-TO-HEAD"
        case .hot: return "HEAT CHECK"
        case .cold: return "COOLING OFF"
        case .injury: return "REPLACEMENT"
        case .situational: return "SITUATIONAL"
        case .platoon: return "PLATOON EDGE"
        case .ballpark: return "BALLPARK"
        case .regression: return "REGRESSION"
        case .tournament: return "TOURNAMENT"
        case .hrThreat: return "HR THREAT"
        case .starterForm: return "STARTER FORM"
        case .firstInning: return "FIRST INNING"
        case .runningGame: return "RUNNING GAME"
        case .parkWeather: return "PARK WEATHER"
        case .xgRegression: return "XG REGRESSION"
        case .advancement: return "ADVANCEMENT"
        case .xgRecap: return "XG RECAP"
        case .fantasyPickups: return "FANTASY PICKUPS"
        case .twoStart: return "TWO-START"
        case .closerWatch: return "CLOSER WATCH"
        case .returnWatch: return "BACK SOON"
        case .cutList: return "CUT LIST"
        case .batterVsArm: return "VS THIS ARM"
        case .teamRecord: return "RECORD"
        case .bullpenFatigue: return "BULLPEN"
        case .trenches: return "THE TRENCHES"
        case .quarterback: return "QUARTERBACKS"
        case .mismatch: return "THE MISMATCH"
        case .passRush: return "PASS RUSH"
        case .coverage: return "COVERAGE"
        case .paceScript: return "PACE & SCRIPT"
        case .redZone: return "RED ZONE"
        case .turnoverEdge: return "TURNOVERS"
        case .explosivePlay: return "EXPLOSIVE PLAY"
        case .specialTeams: return "SPECIAL TEAMS"
        case .coaching: return "COACHING"
        case .theSweat: return "THE SWEAT"
        case .afterGary: return "AFTER GARY"
        case .marketRange: return "MARKET RANGE"
        case .nextSlate: return "NEXT SLATE"
        case .practiceReport: return "PRACTICE REPORT"
        case .fantasyUsage: return "USAGE & ROLE"
        case .fantasyRedZone: return "RED-ZONE ROLE"
        case .fantasyMatchup: return "MATCHUP"
        case .fantasyTrend: return "RECENT TREND"
        }
    }
}

struct Signal: Identifiable {
    let id = UUID()
    let league: HubLeagueSel
    let kind: SignalKind
    let headline: String
    let detail: String
    let game: String
    let value: String
    let tone: HubTone
    var spark: [Double] = []
    var lineVal: Double? = nil
    /// BDL player id when the edge is player-backed — unlocks the full
    /// Player Insights breakdown from the card back.
    var playerId: String? = nil
    /// BDL team id when the edge is team-backed — routes to the team card
    /// (routing law, founder Jul 26: player tap = player card, team tap =
    /// team card; the small pop-up only when neither exists).
    var teamId: String? = nil
    /// "hit" / "miss" / "push" once graded (the Hub's morning receipts view).
    var result: String? = nil
    /// Grader's one-liner ("2-for-4, double") — the receipts row subline.
    var resultNote: String? = nil
    /// Structured player-swap payload (beneficiary lane) for the
    /// transaction-style OUT → IN row.
    var swap: SwapMeta? = nil
    /// Confirmed-XI payload (WC Confirmed XI lane) — both teams' team sheets,
    /// rendered as the formation + lineup beneath the edge.
    var confirmedXI: SwapMeta? = nil
    /// Regression payload (pitcher rows) — direction, ERA/xERA, peripherals and
    /// the verdict. `reg.day` ("tonight"/"tomorrow") splits the Regression Board.
    var reg: SwapMeta? = nil
    /// Head-to-head payload (head_to_head lane) — season series dominance + last meeting.
    var h2h: SwapMeta? = nil
    /// The row's raw lane payload, whatever its kind — the football page reads
    /// per-side values (meta.away / meta.home) off it (Sep 1 2026).
    var lane: SwapMeta? = nil
    /// NRFI/YRFI payload — each side's recent first-inning sequence for the dots.
    var nrfi: SwapMeta? = nil
    /// The row's own EST slate day (insight_connections.date). Lets surfaces
    /// like the Regression Board re-anchor "Today"/"Tomorrow" against the
    /// CURRENT EST slate day (todayEST) instead of trusting a baked string,
    /// so a carried-forward row can never be mislabeled past the 6am rollover.
    var slateDate: String? = nil
    /// Live first-pitch park-weather payload (park_weather lane) — temp/wind/lean drive the MLB weather chip + sheet.
    var weather: SwapMeta? = nil
    var fantasy: SwapMeta? = nil   // fantasy-pickup payload (role / tier / ops / opp_sp)
    /// Player's field position ("2B", "SS", "LF"…) when the lane is player-backed —
    /// shown on the Insights row beside the matchup. Sourced from meta.position.
    var position: String? = nil
    /// The row's own game id (insight_connections.game_id, BDL id as string) —
    /// the doubleheader-safe attachment key: a game page only wears edges whose
    /// game id matches its own (Jul 22 2026, the Max Fried mixup).
    var gameId: String? = nil
    /// Football live-factor payload (`the_sweat`). It remains separate from
    /// generic edge detail so the game page can render the state compactly.
    var sweat: SwapMeta? = nil
    /// Exact same-book publish → latest verified pre-kick football receipt.
    /// Keeping this separate prevents the UI from parsing display prose back
    /// into market numbers or comparing Gary's number with a live-game line.
    var afterGary: SwapMeta? = nil
    /// Exact sportsbook low/high range for a football game. This remains
    /// separate from Gary's locked-number receipt and carries no bettor label.
    var marketRange: SwapMeta? = nil
    /// The next verified FBS slate on an honest NCAAF dark day.
    var nextSlate: SwapMeta? = nil
}
