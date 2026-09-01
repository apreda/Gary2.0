// HomeView.swift — Home View.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Home View

// The Front Page — yesterday's receipts, today's doors, no boxes.
// Last night's stories on top (the honest tape + the lead), each one a door
// to today's version of itself; tonight's board underneath. The only true
// card on the page is the FREE PICK — it earns its box.
/// Fresh-day pop-up — Gary's GAME-pick performance from the settled night,
/// fronted by the Gary emotion that matches how it went. Shows once per day
/// on first open (props keep their own strip in the box scores). Standard
/// centered-card modal: dim backdrop, tap anywhere or the button to dismiss.
/// ⓘ explainer for every pick card (founder, Jul 13): how the drop, the
/// grade, and the flat-$100 scoring work — told once here, so the cards
/// themselves stay clean (the "PER $100 · PAID" subline came off the faces).
struct PickInfoSheet: View {
    @Environment(\.dismiss) private var dismiss
    private let rows: [(head: String, body: String)] = [
        ("THE DROP", "Gary posts picks about 90 minutes before each game, once lineups are in."),
        ("THE GRADE", "Every pick is graded the next morning — \(AppFlags.wonStamp) when it wins, LOST when it doesn't. Nothing gets deleted."),
        ("THE MONEY", "Results are scored flat: $100 on every pick. A +$87 stamp means a $100 bet at the posted odds paid $87 in profit."),
        ("THE ODDS", "Prices shown are DraftKings unless a different book is named on the pick. Lines move — check your book before you bet."),
        ("THE CARD", "Winners is Gary's sealed best-of-the-board each day — games and props."),
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("HOW THE PICKS WORK")
                    .font(GaryFonts.accent(14))
                    .tracking(1.0)
                    .foregroundStyle(.white)
                Spacer(minLength: 0)
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.white.opacity(0.4))
                }
                .buttonStyle(.plain)
            }
            ForEach(rows, id: \.head) { r in
                VStack(alignment: .leading, spacing: 3) {
                    Text(r.head)
                        .font(GaryFonts.mono(11.5, bold: true)).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                    Text(r.body)
                        .font(GaryFonts.text(14))
                        .foregroundStyle(GaryColors.sectionSub)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(GaryColors.cardBg.ignoresSafeArea())
        .presentationDetents([.fraction(0.52), .medium])
        .presentationDragIndicator(.visible)
    }
}

struct DailyRecapOverlay: View {
    let record: (w: Int, l: Int, p: Int)
    let net: Double?
    let bestOdds: Double?
    let onDismiss: () -> Void

    private var pct: Double {
        let graded = record.w + record.l
        return graded == 0 ? 0 : Double(record.w) / Double(graded)
    }
    /// The emotion ladder — image + one line in Gary's voice, keyed to yesterday's
    /// win rate (80+ Fire / 70s Cooking / 50s-60s Beer / 40s IceCold / sub-40
    /// Doomsday). NO Santa-hat assets — GaryCigar/GaryCoin are retired; a settled
    /// night with no graded games falls back to the canonical mark, never a holiday image.
    private var mood: (image: String, line: String) {
        if record.w + record.l == 0 { return (GaryBrand.mark, "No games settled yet.") }
        if pct >= 0.80 { return ("GaryFire", "Gary ran hot last night.") }
        if pct >= 0.70 { return ("GaryCooking", "Gary's cooking.") }
        if pct > 0.50 { return ("GaryBeer", "Came out ahead on the night.") }
        if pct == 0.50 { return ("GaryBeer", "Split the games last night.") }
        if pct >= 0.40 { return ("GaryIceCold", "A cold one on the games.") }
        return ("GaryDoomsday", "Rough night. Gary remembers.")
    }
    private var recordText: String {
        record.p > 0 ? "\(record.w)–\(record.l)–\(record.p)" : "\(record.w)–\(record.l)"
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.62)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            VStack(spacing: 0) {
                Image(mood.image)
                    .resizable().scaledToFit()
                    .frame(height: 112)
                    .padding(.top, 26)

                Text("GARY'S PERFORMANCE")
                    .font(GaryFonts.mono(11, bold: true)).tracking(2.2)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 18)

                Text(mood.line)
                    .font(GaryFonts.text(17, .semibold))
                    .foregroundStyle(.white.opacity(0.94))
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
                    .padding(.horizontal, 20)

                HStack(spacing: 0) {
                    recapCell(recordText, "GAME PICKS", .white.opacity(0.92))
                    // STORE-SAFE BRIDGE: record only — no cash cells.
                    if let net, !AppFlags.storeSafe {
                        recapDivider
                        recapCell(Formatters.flatStakeDollars(net), "NET · $100/PICK",
                                  net >= 0 ? GaryColors.win : GaryColors.loss)
                    }
                    if let bestOdds, bestOdds > 0, !AppFlags.storeSafe {
                        recapDivider
                        recapCell("+\(Int(bestOdds))", "BEST CASH", GaryColors.gold)
                    }
                }
                .padding(.vertical, 18)
                .padding(.horizontal, 8)

                Button(action: onDismiss) {
                    // Refined gold affordance instead of a solid-yellow fill (user call,
                    // Jun 17): a quiet gold-tinted capsule with a gold hairline + gold text,
                    // matching the app's restrained gold language.
                    Text("To today's board")
                        .font(GaryFonts.text(14, .semibold))
                        .foregroundStyle(GaryColors.gold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(Capsule().fill(GaryColors.gold.opacity(0.10)))
                        .overlay(Capsule().stroke(GaryColors.gold.opacity(0.5), lineWidth: 1.5))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 22)
                .padding(.bottom, 22)
            }
            .frame(width: 316)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(hex: "#151311"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.12), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.6), radius: 30, y: 14)
        }
    }

    private func recapCell(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(GaryFonts.mono(22, bold: true))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(maxWidth: .infinity)
    }

    private var recapDivider: some View {
        Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 32)
    }
}

/// A complete, per-source game-pick read. `daily_picks` and `weekly_nfl_picks`
/// fail independently; callers merge only the failed source's last-good rows,
/// so one desk can never erase another sport.
enum GamePickSource: Hashable {
    case daily, nfl

    var failureKey: String {
        switch self {
        case .daily: return "DAILY"
        case .nfl: return "NFL"
        }
    }
}

struct GamePickSourceSnapshot {
    let picks: [GaryPick]
    let failures: Set<GamePickSource>
    /// Subset eligible for same-date last-good preservation. Schema, auth and
    /// configuration failures remain in `failures` for the retry banner but do
    /// not retain an old pick as if the primary were healthy.
    let transientExternalFailures: Set<GamePickSource>
}

func fetchIsolatedGamePickSources(
    date: String
) async -> GamePickSourceSnapshot {
    async let dailyTask = SupabaseAPI.fetchDailyPicks(date: date)
    async let nflTask = SupabaseAPI.fetchWeeklyNFLPicks(for: date)

    var daily: [GaryPick] = []
    var nfl: [GaryPick] = []
    var failures: Set<GamePickSource> = []
    var transientExternalFailures: Set<GamePickSource> = []
    // A cancelled request (our own torn-down refresh task) retains last-good
    // WITHOUT reporting a source failure — no banner for a pull we cancelled
    // ourselves (Aug 26 sim repro).
    do { daily = try await dailyTask } catch {
        if SupabaseAPI.isCancellation(error) { transientExternalFailures.insert(.daily) }
        else {
            failures.insert(.daily)
            if SupabaseAPI.isTransientExternalFailure(error) { transientExternalFailures.insert(.daily) }
        }
    }
    do { nfl = try await nflTask } catch {
        if SupabaseAPI.isCancellation(error) { transientExternalFailures.insert(.nfl) }
        else {
            failures.insert(.nfl)
            if SupabaseAPI.isTransientExternalFailure(error) { transientExternalFailures.insert(.nfl) }
        }
    }
    // weekly_nfl_picks is canonical for NFL. De-duplicate the complete healthy
    // sources.
    let combined = daily.filter { ($0.league ?? "").uppercased() != "NFL" } + nfl
    var seen: Set<String> = []
    let unique = combined.filter { seen.insert($0.id).inserted }
    return GamePickSourceSnapshot(
        picks: unique,
        failures: failures,
        transientExternalFailures: transientExternalFailures
    )
}

func mergeGamePickSnapshot(
    _ snapshot: GamePickSourceSnapshot,
    retaining previous: [GaryPick]
) -> [GaryPick] {
    let retained = previous.filter { pick in
        let league = (pick.league ?? "OTHER").uppercased()
        return (snapshot.transientExternalFailures.contains(.daily) && league != "NFL")
            || (snapshot.transientExternalFailures.contains(.nfl) && league == "NFL")
    }
    var seen: Set<String> = []
    return (snapshot.picks + retained).filter { seen.insert($0.id).inserted }
}

struct HomeView: View {
    /// Use the root tab selection directly. A second `@AppStorage` wrapper could
    /// briefly report Home as selected while the root was already restoring a
    /// different tab, consuming the first-open recap offscreen.
    @Binding var selectedTab: Int
    // Parallax model for THE FLOOR. @State only STORES the instance across
    // re-inits — it does not observe it, so scroll frames never invalidate
    // HomeView's body; only the ground layer subscribes.
    @State private var groundParallax = GroundParallax()
    @State private var freePick: GaryPick?
    @State private var freeProp: PropPick?
    @State private var loading = true
    /// Bumped to re-run the load `.task` on pull-to-refresh and on app foreground —
    /// kept-alive tabs never re-fire `.task` on their own, so picks/results/recaps
    /// went stale until a full relaunch (user call, Jun 17). `loading` isn't wired to a
    /// spinner here, so the re-fetch updates the page silently underneath.
    @State private var homeNonce = 0
    /// Launch already owns one complete keyed load. SwiftUI can report the
    /// scene becoming active after that task has started; treating that initial
    /// activation as a foreground return cancels the first request wave and can
    /// strand Home half-hydrated. Real foreground returns refresh normally once
    /// the initial load has finished (successfully or with an honest error).
    @State private var hasCompletedInitialHomeLoad = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var animateIn = false
    @State private var yesterdayRecord: (wins: Int, losses: Int, pushes: Int) = (0, 0, 0)
    /// The record-box label — rolls "TODAY"/"LIVE" once today's slate (6am ET
    /// anchor) has started, back to "YESTERDAY" once the day rolls over.
    @State private var recordBoxLabel: String = "YESTERDAY"
    @State private var sportBreakdown: [SupabaseAPI.SportRecord] = []
    /// Gary's last-7-days GAME-pick record per sport — kept fetched for content
    /// gating, but the Home form module now renders `dailyForm` (per-sport LIVE).
    @State private var sevenDayForm: [SupabaseAPI.SportRecord] = []
    /// Per-sport LIVE FORM — each sport's record for the current active slate day
    /// (today as it builds, or last night held). The re-logic'd "7-Day Form".
    @State private var dailyForm: [DailyFormCell] = []
    @State private var yesterdayTopPick: GaryPick? = nil
    @State private var yesterdayTopPickScore: String? = nil
    /// Tonight's top Hub edges (relevance-ordered) — the pre-bet checklist.
    @State private var tonightSignals: [Signal] = []
    /// Yesterday's graded edges + tally — the Edges section's fallback until
    /// today's board posts with lineups.
    @State private var ydayEdges: [Signal] = []
    @State private var edgesHitRate: (hit: Int, graded: Int)? = nil
    /// Live streaks — feeds the Edges row that points at the Hub's board.
    @State private var homeStreaks: [StreakRow] = []
    /// Last night's betting recaps (game_recaps) — the story player's slides.
    @State private var nightRecaps: [GameRecapRow] = []
    /// The settled night's combined record (games + props) — the scorecard's
    /// ledger, same set as net + best cash.
    @State private var lastNightRecord: (w: Int, l: Int, p: Int) = (0, 0, 0)
    /// "TODAY" once the rolling recap has crossed into today's graded picks, else "LAST NIGHT".
    @State private var recapLabel: String = "LAST NIGHT"
    /// matchup (lowercased) → "3-1". The recap rows don't carry a score, so
    /// the headline card borrows it from the same results the board reads.
    @State private var scoreByMatchup: [String: String] = [:]
    /// GAME picks only — the rolling Home scorecard. It holds yesterday before
    /// first pitch, then becomes today's live/settled record.
    @State private var gamesNightRecord: (w: Int, l: Int, p: Int) = (0, 0, 0)
    @State private var gamesNightNet: Double? = nil
    @State private var gamesNightBest: Double? = nil
    /// The once-a-day popup has a separate immutable prior-day receipt. Sharing
    /// the rolling scorecard state made today's first kickoff rewrite the popup.
    @State private var dailyRecapRecord: (w: Int, l: Int, p: Int) = (0, 0, 0)
    @State private var dailyRecapNet: Double? = nil
    @State private var dailyRecapBest: Double? = nil
    @State private var showDailyRecap = false
    @AppStorage("dailyRecapShownDate") private var dailyRecapShownDate = ""
    /// The full day's games + opening lines (daily_slate) — the slate works
    /// from the morning; Gary's picks overlay as they post.
    @State private var slateGames: [DailySlateRow] = []
    /// One physical Home board, switched between the two active pro-football /
    /// baseball desks. Rows keep the canonical MLB geometry in both tabs.
    @State private var selectedHomeBoardLeague: HomeBoardLeague = .mlb
    /// True once the user has tapped a board tab THIS session. Before that,
    /// the in-season league auto-leads; after it, their choice sticks — an
    /// empty league shows its own "no games" line instead of snapping away
    /// (founder, Aug 24: "if a user click NFL and is on MLB they expect to
    /// see NFL and if there are no games thats fine the tab should just say
    /// that").
    @State private var userPickedBoardLeague = false
    /// Date key actually backing `slateGames`. Keeping it beside the payload
    /// avoids mixing yesterday's rows with today's results during the 6am reload.
    @State private var loadedSlateDate = ""
    /// Durable grades for the active board. The live-score table is a transient
    /// tracker and can shed/duplicate rows after FINAL; these records keep each
    /// CASHED/LOST stamp pinned until the slate rolls the following morning.
    @State private var sheetGameResults: [GameResult] = []
    /// Same-session last-good result payloads are emergency transport buffers.
    /// Successful empty responses replace them; schema/auth failures never use them.
    @State private var recentGameResultsLastGood: [GameResult] = []
    @State private var recentPropResultsLastGood: [PropResult] = []
    /// A foreground app may remain open across the cutoff. Check cheaply once a
    /// minute so the new board loads at 6am ET without requiring a relaunch.
    private let slateRolloverTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()
    /// Picks, grades and recap rows can land while Home stays open. This pulse
    /// refreshes only those rolling records while Home is the active tab; live
    /// scores keep their own faster shared poller.
    private let rollingHomeRefreshTimer = Timer.publish(every: 90, on: .main, in: .common).autoconnect()
    @State private var rollingHomeRefreshInFlight = false
    /// Identifies the keyed full load currently running. The nonce makes the
    /// cancellation defer safe if a newer load starts before the old one exits.
    @State private var fullHomeRefreshNonce: Int? = nil
    @State private var yesterdayTopPickResult: String? = nil
    @State private var yesterdayTopProp: PropPick? = nil
    @State private var yesterdayTopPropResult: String? = nil
    // Front-page modules
    @State private var marquee: HomeMarqueeHero.Story? = nil
    @State private var cachedHeadlines: [HomeMarqueeHero.Story]? = nil   // instant cold-open paint
    @State private var cashRows: [HomeCashesSection.Row] = []
    @State private var worstBeat: HomeCashesSection.Row? = nil
    @State private var lastNightNet: Double? = nil
    @State private var lastNightGraded = 0
    @State private var bestCashOdds: Double? = nil
    /// Yesterday's WINNERS-only game record (the premium card we grade & sell).
    @State private var form: HomeGarysForm.Model? = nil
    /// Which time-state the home shows. Opens on Morning — the results-first view
    /// the user lands on — and stays wherever the switcher is set.
    @State private var selectedPhase: HomePhase = .morning
    @State private var receiptLanes: [HomeReceiptsSection.LaneRecord] = []
    @State private var receiptsSub = "Yesterday's boards, graded"
    @State private var edgesPostedToday = 0
    @State private var playsOnBoard = 0
    @State private var gamesLiveNow = 0
    // ESPN-for-bettors layer: the Wire, market pulse, prop box, live tape.
    @State private var wireItems: [SupabaseAPI.WireItem] = []
    @State private var pulseRows: [SupabaseAPI.MarketPulseRow] = []
    @State private var todayPicks: [GaryPick] = []
    /// todayPicks indexed by String(game_id) — rebuilt only when picks change.
    /// pickFor(_ live:) reads this (O(1)) instead of scanning todayPicks per live
    /// score per render; the live tape/takeover/board call it many times a tick.
    @State private var picksByGameId: [String: GaryPick] = [:]
    @State private var initialLive: [LiveScore] = []
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// The signed-in user's bets for TODAY — feeds the board's YOU tab
    /// (founder, Aug 20). Loaded with the home refresh; empty when signed out.
    @State private var myTodayBets: [UserBet] = []

    /// Time-aware front page: results lead in the morning, the slate leads
    /// pre-game, the tape + takeover lead while Gary's games are in progress.
    private enum HomePhase: Equatable { case morning, pregame, live, tomorrow }
    private var phase: HomePhase {
        if liveScoresNow.contains(where: { $0.isLive }) || gamesLiveNow > 0 { return .live }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return cal.component(.hour, from: Date()) < 12 ? .morning : .pregame
    }
    /// The Tomorrow look-ahead payload (tomorrow_board). nil until it loads /
    /// posts — the Tomorrow body shows its own honest-empty states meanwhile.
    @State private var tomorrowBoard: TomorrowBoard? = nil
    /// Today's board snapshot — feeds the MARQUEE tracker (big games).
    @State private var todayBoard: TomorrowBoard? = nil
    /// What the "TODAY" pill maps to: today's locked Home, time-aware (morning
    /// before noon ET, pregame after) — exactly the computed `phase` clock, so
    /// the Today pill drives selectedPhase to .morning/.pregame untouched. Live
    /// and Tomorrow are their own pills.
    private var todayClockPhase: HomePhase {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return cal.component(.hour, from: Date()) < 12 ? .morning : .pregame
    }
    /// The phase actually rendered — driven by the on-screen switcher, which
    /// opens on Morning.
    private var effectivePhase: HomePhase { selectedPhase }
    /// Freshest live snapshot we have — the 90s cache once it has polled,
    /// the one-shot `.task` fetch before that.
    private var liveScoresNow: [LiveScore] {
        liveCache.scores.isEmpty ? initialLive : liveCache.scores
    }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Does the page have anything to render below the header? Used to swap a
    /// loading/empty placeholder in for the otherwise-blank scroll area on a
    /// fresh account or a failed/empty fetch.
    private var hasHomeContent: Bool {
        !sevenDayForm.isEmpty || !todayPicks.isEmpty || !headlineStories.isEmpty
            || !nightRecaps.isEmpty || marquee != nil || !wireItems.isEmpty
    }

    /// Today's All-Star specials — everything the specials lane stamps
    /// (type "special" across the Derby/ASG boards, plus the ASG moneyline
    /// which rides the real BDL game id). Empty every other week of the year,
    /// so the takeover costs nothing outside the break.
    private var allStarSpecials: [GaryPick] {
        todayPicks.filter { ($0.type ?? "") == "special" || $0.game_id == 8712499 }
    }

    var body: some View {
        ZStack {
            // Background — the house ink, plus the living obsidian layer
            // (Home only; founder, Aug 18: the infinite feel without leaving
            // our black).
            LiquidGlassBackground(grainDensity: 0.0009, grainOpacityRange: 0.008...0.018)
            HomeFloorGround(parallax: groundParallax)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {

                    // ONE-LINE masthead (founder, Aug 6 night, second ruling:
                    // "all apps have headers — bring them back, but all in one
                    // line, horizontal not vertical"). Brand left, the
                    // TODAY/TOMORROW switcher rides the same line; no date
                    // accent — the tabs get the room.
                    GaryPageHeader(title: "Gary", goldPart: "A.I.", trailing: { phaseSwitcher })

                    // TODAY is one full merged page that evolves through the day —
                    // results-first in the morning, the slate + board + World Cup
                    // always present, the live tape + full live experience leading
                    // once games tip off. NOTHING is dropped across the day. LIVE
                    // is no longer its own tab (founder call): Today absorbs the
                    // live state, so `.live` routes to `todaySections` too — which
                    // leads with the live tape/takeover/board/in-game Wire when
                    // games are on. TOMORROW is the only separate body.
                    switch effectivePhase {
                    case .morning, .pregame, .live:
                        // Fresh account / no-network: never leave a blank scroll
                        // area under the header (App Review runs empty states).
                        // Show a loading state on first load, a friendly empty
                        // message once the fetch resolves with nothing.
                        if !hasHomeContent {
                            HomeContentPlaceholder(loading: loading)
                        } else {
                            todaySections
                        }
                    case .tomorrow:
                        TomorrowView.Body(board: tomorrowBoard)
                    }

                    // ── ⑥ Footer — quiet ──
                    footer
                        .opacity(animateIn ? 1 : 0)
                        .animation(.easeOut(duration: 0.6).delay(0.3), value: animateIn)
                }
                .padding(.bottom, 110)
                // Parallax probe — a background measurement, never a layout
                // row (a zero-height VStack child still costs one 18pt
                // spacing gap above the masthead).
                .background(GeometryReader { g in
                    Color.clear.preference(key: HomeScrollOffsetKey.self,
                                           value: g.frame(in: .named("homeScroll")).minY)
                })
            }
            .refreshable {
                homeNonce &+= 1
                try? await Task.sleep(nanoseconds: 800_000_000)   // let the pull spinner show while the keyed .task reloads
            }
            .coordinateSpace(name: "homeScroll")
            // NOTE: the page scroll keeps its clip — unclipping it let rows
            // bleed through the status bar. The Jul 7 unclippedRail law is
            // for horizontal card rails only; shadows clipping at the SCREEN
            // edge are invisible anyway.
            .onPreferenceChange(HomeScrollOffsetKey.self) { minY in
                // A tenth of the scroll, clamped so the horizon stays on the
                // page. Writes go to the model — only the ground re-renders.
                groundParallax.offsetY = max(-48, min(0, minY) * 0.10)
            }

            StatusBarScrim()
        }
        // THE FLOOR pairs with solid cards (founder, Aug 19): over a patterned
        // ground, the translucent panel wash lets the grid bleed through every
        // container — Home's subtree locks panels to the opaque ink-equivalent.
        .environment(\.solidPanels, true)
        .overlay {
            if showDailyRecap {
                DailyRecapOverlay(record: dailyRecapRecord,
                                  net: dailyRecapNet,
                                  bestOdds: dailyRecapBest) {
                    // Match the show-trigger + guard (both use todayEST) so this dismiss write
                    // can't corrupt the once-per-day state near the EST day boundary.
                    dailyRecapShownDate = SupabaseAPI.todayEST()
                    withAnimation(.easeOut(duration: 0.2)) { showDailyRecap = false }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .onGaryTour { verb, arg in
            // The recap modal isn't a presented VC, so the generic "dismiss"
            // can't reach it — close it here (same ledger write as a real tap).
            if verb == "dismiss", showDailyRecap {
                dailyRecapShownDate = SupabaseAPI.todayEST()
                withAnimation(.easeOut(duration: 0.2)) { showDailyRecap = false }
            }
            // Day switcher for the screenshot tooling.
            if verb == "tomorrow" { selectedPhase = .tomorrow }
            if verb == "today" { selectedPhase = todayClockPhase }
            if verb == "homeboard", let league = HomeBoardLeague(rawValue: arg.uppercased()) {
                // The QA verb mirrors a real finger: an explicit choice sticks,
                // so an empty league shows its "no games" line (Aug 24).
                userPickedBoardLeague = true
                selectedHomeBoardLeague = league
            }
        }
        .task(id: homeNonce) {
            // The board's YOU tab: today's tails/fades (founder, Aug 20) — its
            // own load so EVERY home refresh path carries it. Signed-out =
            // empty = no tab. Day-cache law: never latch a cancelled empty
            // fetch over rows already showing.
            if AppFlags.userBookEnabled, AuthManager.shared.bearerToken != nil {
                let today = SupabaseAPI.todayEST()
                let mine = (await UserBookAPI.fetchMyBets() ?? []).filter { $0.game_date == today }
                if !mine.isEmpty || myTodayBets.isEmpty { myTodayBets = mine }
            } else {
                myTodayBets = []
            }
        }
        .task(id: homeNonce) {
            let taskNonce = homeNonce
            fullHomeRefreshNonce = taskNonce
            defer {
                if fullHomeRefreshNonce == taskNonce { fullHomeRefreshNonce = nil }
                if !Task.isCancelled { hasCompletedInitialHomeLoad = true }
            }
            // Existing content stays painted during a silent reload. The loading
            // placeholder is only for a true first load with nothing to show.
            if !hasHomeContent { loading = true }
            #if DEBUG
            // Lets the screenshot tooling drive the switcher:
            //   simctl launch ... --args -previewPhase live
            switch UserDefaults.standard.string(forKey: "previewPhase") {
            case "morning": selectedPhase = .morning
            case "pregame": selectedPhase = .pregame
            case "live":    selectedPhase = .live
            case "tomorrow": selectedPhase = .tomorrow
            default: break
            }
            #endif
            // Paint last session's headline cards instantly (load() re-validates the day key).
            if cachedHeadlines == nil { cachedHeadlines = HomeHeadlinesCache.load() }
            do {
                try await withTimeout(seconds: 30) {
                    // PARALLEL FETCH: Run all independent API calls simultaneously
                    // This reduces load time from ~600ms to ~200ms

                    let date = SupabaseAPI.todayEST()
                    // Pull-to-refresh bumps homeNonce (starts at 0 = first load). On a pull we
                    // MUST bypass the per-date cache, or the refresh just re-reads stale data
                    // (this is the "pull-to-refresh shows no new picks/props" bug). Matches the
                    // Picks/Props tabs, which already pass forceRefresh: true on their .refreshable.
                    let forceFresh = homeNonce > 0
                    let previousTodayPicks = todayPicks
                    let previousYesterdayPicks = [yesterdayTopPick].compactMap { $0 }

                    // Start all fetches in parallel using async let
                    async let recordFetch = SupabaseAPI.fetchYesterdayGameRecord()
                    async let breakdownFetch = SupabaseAPI.fetchYesterdayBySport()
                    async let formFetch = SupabaseAPI.fetchSevenDayFormBySport()
                    async let picksFetch = fetchIsolatedGamePickSources(
                        date: date
                    )
                    async let propPicksFetch = SupabaseAPI.fetchPropPicks(date: date, forceRefresh: forceFresh)
                    // Pull the full recent window (not just 30) so the morning recap's
                    // game record counts EVERY graded game pick from the night's slate —
                    // with "Gary picks every game" a single day's slate can exceed 30, and
                    // the old cap truncated it to the late spillover (the "always 1-0" bug).
                    async let gameResultsFetch = SupabaseAPI.fetchRecentGameResults(limit: 200)
                    async let propResultsFetch = SupabaseAPI.fetchRecentPropResults(limit: 200)
                    async let liveFetch = SupabaseAPI.fetchLiveScores(date: date)
                    async let todayLedgerFetch = SupabaseAPI.fetchInsightLedger(date: date)
                    async let wireFetch = SupabaseAPI.fetchWireItems(date: date)
                    // Yesterday's top pick/prop ride the SAME parallel wave —
                    // they were serial awaits on the critical path (perf, Jul 13).
                    async let yPicksFetch = fetchIsolatedGamePickSources(
                        date: SupabaseAPI.yesterdayEST()
                    )
                    async let yPropsFetch = SupabaseAPI.fetchPropPicks(date: SupabaseAPI.yesterdayEST())
                    // Market pulse anchors to TODAY's rolling row — the builder now
                    // writes a zeroed row at the start of the slate and re-upserts it
                    // as today's games go FINAL, so the strip shows today's counts
                    // (0 before any final, climbing as they grade), not yesterday's.
                    async let pulseFetch = SupabaseAPI.fetchMarketPulse(date: SupabaseAPI.todayEST())
                    // The late-page sections' fetches join the SAME wave (Jul 22
                    // perf: they used to start only after everything above them
                    // finished — the tail of every cold open).
                    async let recapsTodayF = SupabaseAPI.fetchGameRecaps(date: date)
                    async let recapsGradedF = SupabaseAPI.fetchGameRecaps(date: SupabaseAPI.hubGradedDateEST())
                    async let slateF = SupabaseAPI.fetchDailySlate(date: date)
                    async let tomorrowBoardF = SupabaseAPI.fetchTomorrowBoard(date: Self.tomorrowSlateDateEST())
                    async let todayBoardF = SupabaseAPI.fetchTodayBoard(date: date)
                    async let streaksF = SupabaseAPI.fetchStreaks()
                    async let gradedLedgerF = SupabaseAPI.fetchInsightLedger(date: SupabaseAPI.hubGradedDateEST())

                    // Paint IMMEDIATELY — cached headlines + placeholders roll in
                    // as data lands (Jul 22 perf: the page sat at opacity 0 until
                    // the record fetch answered, reading as a slow app on every
                    // cold open).
                    withAnimation(.easeOut(duration: 0.8)) {
                        animateIn = true
                    }

                    if let record = try? await recordFetch {
                        yesterdayRecord = record
                    }

                    // Get the other results (already fetched in parallel, just awaiting)
                    if let breakdown = try? await breakdownFetch {
                        sportBreakdown = breakdown
                    }
                    sevenDayForm = (try? await formFetch) ?? []

                    let recentGameResults: [GameResult]
                    do {
                        let fresh = try await gameResultsFetch
                        recentGameResultsLastGood = fresh
                        recentGameResults = fresh
                    } catch {
                        recentGameResults = SupabaseAPI.isTransientExternalFailure(error)
                            ? recentGameResultsLastGood : []
                    }
                    let recentPropResults: [PropResult]
                    do {
                        let fresh = try await propResultsFetch
                        recentPropResultsLastGood = fresh
                        recentPropResults = fresh
                    } catch {
                        recentPropResults = SupabaseAPI.isTransientExternalFailure(error)
                            ? recentPropResultsLastGood : []
                    }

                    // Fallback: if the separate 7-day fetch came back empty, build the
                    // form from the reliable recentGameResults (the board's data, which
                    // covers the window) so the 7-Day Form never silently vanishes.
                    if sevenDayForm.isEmpty {
                        let weekAgo = Self.shiftDate(SupabaseAPI.todayEST(), by: -7) ?? ""
                        var byLeague: [String: (w: Int, l: Int, p: Int)] = [:]
                        for r in recentGameResults where (r.game_date ?? "") >= weekAgo {
                            let lg = (r.league ?? "OTHER").uppercased()
                            var cur = byLeague[lg] ?? (0, 0, 0)
                            switch (r.result ?? "").lowercased() {
                            case "won", "win", "w": cur.w += 1
                            case "lost", "loss", "l": cur.l += 1
                            case "push", "p": cur.p += 1
                            default: break
                            }
                            byLeague[lg] = cur
                        }
                        let rank: (String) -> Int = { $0 == "MLB" ? 0 : ($0 == "WC" ? 1 : 2) }
                        sevenDayForm = byLeague
                            .filter { $0.value.w + $0.value.l > 0 }
                            .map { SupabaseAPI.SportRecord(league: $0.key, wins: $0.value.w, losses: $0.value.l, pushes: $0.value.p) }
                            .sorted { a, b in
                                rank(a.league) != rank(b.league) ? rank(a.league) < rank(b.league)
                                    : (a.wins + a.losses) > (b.wins + b.losses)
                            }
                    }

                    // Rolling recap anchor: the most recent SETTLED day INCLUDING today, so the
                    // scorecard + prop box + highlights roll from yesterday into today as today's
                    // picks grade. recapLabel reads "TODAY" once we've crossed over.
                    // (HR fun-lane results can't anchor the recap day — they're
                    // excluded from the whole Home ledger below.)
                    let recapDays = recentGameResults.filter { ["won","lost","push"].contains($0.result ?? "") }.compactMap { $0.game_date }
                                  + recentPropResults.filter { !$0.isHRResult && ["won","lost","push"].contains($0.result ?? "") }.compactMap { $0.game_date }
                    let recapDay = Set(recapDays).max()
                    recapLabel = recapDay.map(slateDayShort) ?? recapLabel

                    // ③ The marquee + biggest cashes + masthead units — one
                    // pass over the latest settled night. Template-built, no AI.
                    // HR fun-lane results never touch the Home ledger — record,
                    // net, cashes, best odds all count CORE bets only (founder,
                    // Aug 3: HR Threats never reflect on Gary's actual metrics).
                    let night = Self.buildLastNight(games: recentGameResults,
                                                    props: recentPropResults.filter { !$0.isHRResult })
                    marquee = night.story
                    // The flip side (the pick Gary CALLED + the fact check) rides
                    // OFF the critical path — two round trips that only feed the
                    // marquee's back face update it when they land (Jul 22 perf:
                    // they were serial awaits blocking every section below).
                    if let story = night.story, let mg = night.marqueeGame, let nightDate = mg.game_date {
                        Task { @MainActor in
                            var s = story
                            if let nightPicks = try? await SupabaseAPI.fetchDailyPicks(date: nightDate) {
                                let hay = (mg.matchup ?? "").lowercased()
                                if let match = nightPicks.first(where: { p in
                                    let h = Formatters.shortTeamName(p.homeTeam, league: p.league).lowercased()
                                    let a = Formatters.shortTeamName(p.awayTeam, league: p.league).lowercased()
                                    return !h.isEmpty && !a.isEmpty && hay.contains(h) && hay.contains(a)
                                }) {
                                    s.take = splitTake(match.rationale).take
                                    s.tier = match.confidence.map { convictionTier(min(max($0, 0), 1)) }
                                }
                            }
                            // The fact check — what the game confirmed or refuted.
                            if let fc = await SupabaseAPI.fetchFactCheck(date: nightDate, matchup: mg.matchup ?? "") {
                                s.claims = (fc.claims ?? []).filter { $0.verdict == "right" || $0.verdict == "wrong" }
                            }
                            marquee = s
                        }
                    }
                    cashRows = night.cashes
                    worstBeat = night.beat
                    lastNightNet = night.graded > 0 ? night.net : nil
                    lastNightRecord = night.record
                    lastNightGraded = night.graded
                    bestCashOdds = night.bestOdds

                    // DAY-CYCLE CLOCK (founder, Aug 3): the record cluster is
                    // LIVE results for the day from its FIRST PITCH — starting
                    // at 0–0 and building as games grade — and holds the prior
                    // night's final numbers only until that first pitch.
                    let slateRowsResolved = await slateF
                    let cycleStarted = slateRowsResolved.contains {
                        parseISO8601($0.commence_time ?? "").map { $0 <= Date() } ?? false
                    }
                    let cycleDayRows = recentGameResults.filter { $0.game_date == SupabaseAPI.todayEST() }

                    // THE BOARD COMMITS THE MOMENT ITS DATA EXISTS (founder,
                    // Aug 24: "that same board seems not to load right away
                    // like everything else"). These three used to commit ~180
                    // lines below, behind the wire/pulse/ledger/edges awaits
                    // and their fallback chains — so the day's slate sat
                    // invisible for seconds while editorial lanes fetched.
                    // Board + its durable grades still commit together under
                    // the SAME captured date (the 6am-rollover pairing rule).
                    sheetGameResults = recentGameResults.filter {
                        $0.game_date == date && ["won", "lost", "push"].contains(($0.result ?? "").lowercased())
                    }
                    slateGames = slateRowsResolved
                    loadedSlateDate = date

                    // Fresh-day recap pop-up — GAME picks only, once per day. Its
                    // receipt is always the last completed day, even when the user first
                    // opens Home after today's slate has started. It must not share the
                    // rolling scorecard below, which becomes today's record at kickoff.
                    let dailyRecap = Self.buildLastNight(
                        games: recentGameResults,
                        props: [],
                        includeToday: false
                    )
                    dailyRecapRecord = dailyRecap.record
                    dailyRecapNet = dailyRecap.graded > 0 ? dailyRecap.net : nil
                    dailyRecapBest = dailyRecap.bestOdds
                    let todayKey = SupabaseAPI.todayEST()
                    // It is a first-open ritual, not a pre-first-pitch ritual. The
                    // includeToday:false ledger above guarantees this can never show a
                    // live partial from today, so today's first pitch must not suppress it.
                    presentDailyRecapIfNeeded(graded: dailyRecap.graded, todayKey: todayKey)

                    // The in-page scorecard still rolls to today's live record at
                    // first pitch. Keeping this state separate is what lets the popup
                    // remain an honest yesterday receipt throughout the day.
                    let gamesNight = cycleStarted
                        ? Self.buildLastNight(games: cycleDayRows, props: [], includeToday: true)
                        : dailyRecap
                    gamesNightRecord = gamesNight.record
                    gamesNightNet = gamesNight.graded > 0 ? gamesNight.net : nil
                    gamesNightBest = gamesNight.bestOdds

                    // Gary's form — last 10 graded game picks, same data + math
                    // as the Billfold (BillfoldCompute), so the record never
                    // disagrees across screens.
                    form = Self.buildForm(games: recentGameResults)

                    // ③c The Wire + market pulse + prop box — the editorial
                    // layer. The wire walks back a day before the 11am run;
                    // pulse walks back when the grader hasn't covered the
                    // night yet. Prop box is template-built from the same
                    // graded props the cashes use.
                    var wires = await wireFetch
                    if wires.isEmpty {
                        // Same rolling anchor the headlines use (most recent settled day),
                        // so the Wire stays current instead of falling a day stale.
                        let wireDay = recapDay ?? SupabaseAPI.yesterdayEST()
                        wires = await SupabaseAPI.fetchWireItems(date: wireDay)
                    }
                    // Drop the fabricated X "voice" quotes — Gary never attributes
                    // invented quotes to real handles (founder). Only real betting
                    // news (result / line_move / injury / pace) rides the Wire.
                    wireItems = wires.filter { ($0.kind ?? "") != "voice" }
                    // Today's rolling row leads; when today has no slate at all (the
                    // builder writes nothing), fall back to the settled prior day so
                    // the strip isn't empty on an off day.
                    var pulse = await pulseFetch
                    if pulse.isEmpty {
                        pulse = await SupabaseAPI.fetchMarketPulse(date: SupabaseAPI.hubGradedDateEST())
                    }
                    if pulse.isEmpty, let pulseBack = Self.shiftDate(SupabaseAPI.hubGradedDateEST(), by: -1) {
                        pulse = await SupabaseAPI.fetchMarketPulse(date: pulseBack)
                    }
                    pulseRows = pulse

                    // ⑤ Door counts — live games + edges posted tonight.
                    let liveRows = await liveFetch ?? []
                    gamesLiveNow = liveRows.filter { $0.isLive }.count
                    initialLive = liveRows

                    // Record box rolls on the ET slate day (todayEST() = 6am anchor).
                    // DAY-CYCLE RESET (founder, Aug 3 — supersedes the Jun "wait for the
                    // first grade" guard): the box flips to LIVE at the day's FIRST PITCH,
                    // 0–0 and all — that 0–0 now reads as "the day is rolling", not as a
                    // result — and builds as picks grade. Before first pitch it holds
                    // YESTERDAY's final record.
                    let slateDay = SupabaseAPI.todayEST()
                    var w = 0, l = 0, p = 0
                    for r in recentGameResults.countable where r.game_date == slateDay {
                        switch (r.result ?? "").lowercased() {
                        case "won", "win", "w": w += 1
                        case "lost", "loss", "l": l += 1
                        case "push", "p": p += 1
                        default: break
                        }
                    }
                    if cycleStarted {
                        yesterdayRecord = (w, l, p)
                        recordBoxLabel = liveRows.contains { $0.isLive } ? "LIVE" : "TODAY"
                        recapLabel = recordBoxLabel   // scorecard + overnight strip speak the cycle
                    } else {
                        // Today hasn't graded yet — show the most recent SETTLED day's
                        // record, computed from the SAME recentGameResults the board uses
                        // (the separate recordFetch can come back empty and hide the box).
                        recordBoxLabel = "YESTERDAY"
                        if let rd = recapDay {
                            var yw = 0, yl = 0, yp = 0
                            for r in recentGameResults.countable where r.game_date == rd {
                                switch (r.result ?? "").lowercased() {
                                case "won", "win", "w": yw += 1
                                case "lost", "loss", "l": yl += 1
                                case "push", "p": yp += 1
                                default: break
                                }
                            }
                            if yw + yl + yp > 0 { yesterdayRecord = (yw, yl, yp) }
                        }
                    }
                    // Per-sport LIVE FORM (the re-logic'd 7-Day Form): MLB + WC each
                    // build today live, then hold last night until the next day lands.
                    dailyForm = Self.buildDailyFormBySport(games: recentGameResults, live: liveRows,
                                                           slateDay: slateDay, anchor: recapDay)
                    // Keep the snapshot fresh — the tape/takeover re-render
                    // off the shared 90s poller once it starts.
                    LiveScoreCache.shared.startIfNeeded()
                    edgesPostedToday = (await todayLedgerFetch).count

                    // ④ The Receipts — graded lanes from the hub's graded day,
                    // walking back one extra day when the grader hasn't run yet.
                    var gradedDate = SupabaseAPI.hubGradedDateEST()
                    var ledger = (await gradedLedgerF).filter { $0.result != nil }
                    if ledger.isEmpty, let back = Self.shiftDate(gradedDate, by: -1) {
                        gradedDate = back
                        ledger = await SupabaseAPI.fetchInsightLedger(date: back).filter { $0.result != nil }
                    }
                    receiptLanes = Self.buildReceiptLanes(ledger)

                    // Tonight's edges — the Hub's top reads for today's slate,
                    // teased on the Tonight page (full board one tap away).
                    // Leagues fetch CONCURRENTLY (Jul 22 perf: was one serial
                    // round trip per league on the critical path).
                    func fetchEdges(date: String) async -> [Signal] {
                        await withTaskGroup(of: [Signal].self) { group in
                            for lg in AppFlags.insightLeagues {
                                group.addTask {
                                    (try? await SupabaseAPI.fetchInsightConnections(date: date, league: lg))?
                                        .compactMap { $0.toSignal() } ?? []
                                }
                            }
                            var all: [Signal] = []
                            for await part in group { all.append(contentsOf: part) }
                            return all
                        }
                    }
                    tonightSignals = Array((await fetchEdges(date: SupabaseAPI.todayEST())).prefix(3))
                    // Today's edges post with lineups (~afternoon). Until
                    // then the section shows yesterday's GRADED board — the
                    // Hub's receipts, verdicts attached — instead of nothing.
                    if tonightSignals.isEmpty {
                        ydayEdges = (await fetchEdges(date: gradedDate)).filter { $0.result != nil }
                        edgesHitRate = await SupabaseAPI.fetchInsightHitRate(date: gradedDate)
                    }

                    // The night's stories. The headline ROLLS TODAY: prefer today's
                    // graded+recapped games (the local recap writers now write today's
                    // recaps as games settle), and only fall back to last night when
                    // today has NO recapped result yet — clearly the prior night, no
                    // flicker. Once a today headline exists it does not revert.
                    // (These six fetches were declared here until Jul 22 — they now
                    // ride the load's single parallel wave at the top; these awaits
                    // just collect results that have been in flight the whole time.)
                    // Scores first — headlineStories reads this map as it builds.
                    scoreByMatchup = Dictionary(
                        recentGameResults.compactMap { r -> (String, String)? in
                            guard let m = r.matchup?.lowercased(), let s = r.final_score,
                                  !m.isEmpty, !s.isEmpty else { return nil }
                            return (m, s)
                        },
                        uniquingKeysWith: { first, _ in first })
                    let recapsToday = await recapsTodayF
                    nightRecaps = recapsToday.isEmpty ? await recapsGradedF : recapsToday
                    HomeHeadlinesCache.save(headlineStories)   // write-through; no-op if empty
                    // (Board + durable grades committed at the top of the
                    // cycle-clock block — the moment slateF resolved.)
                    tomorrowBoard = await tomorrowBoardF
                    todayBoard = await todayBoardF
                    homeStreaks = await streaksF
                    receiptsSub = gradedDate == SupabaseAPI.hubGradedDateEST()
                        ? "Yesterday's boards, graded"
                        : "Boards graded \(Self.prettyDate(gradedDate))"

                    // Yesterday's top pick & prop (shown when today's aren't ready yet).
                    // 6am-aware yesterday (one real day before the slate day), not a
                    // raw now-minus-1 that would show two-days-ago before 6am ET.
                    do {
                        let yesterdaySnapshot = await yPicksFetch
                        let yPicks = mergeGamePickSnapshot(
                            yesterdaySnapshot,
                            retaining: previousYesterdayPicks
                        )
                        let top = yPicks.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
                        yesterdayTopPick = top
                        if let pick = top {
                            let matchKey = (pick.homeTeam ?? "").lowercased()
                            let row = recentGameResults.first(where: {
                                ($0.matchup ?? "").lowercased().contains(matchKey)
                            })
                            yesterdayTopPickResult = row?.result
                            #if DEBUG
                            // Screenshot helper (-forceCashedFreePick):
                            // flips the free-pick card to CASHED locally —
                            // debug builds only, the record never changes.
                            if ProcessInfo.processInfo.arguments.contains("-forceCashedFreePick") {
                                yesterdayTopPickResult = "won"
                            }
                            #endif
                            yesterdayTopPickScore = row?.final_score
                        } else {
                            // Every yesterday source answered with no pick. That is an
                            // authoritative empty board, not a reason to keep an older day.
                            yesterdayTopPickResult = nil
                            yesterdayTopPickScore = nil
                        }
                        do {
                            let yProps = try await yPropsFetch
                            // HR fun-lane calls never front Home's prop slot.
                            let top = yProps.filter { !$0.isHRLane }
                                .sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
                            yesterdayTopProp = top
                            if let prop = top {
                                let matchKey = (prop.player ?? "").lowercased()
                                yesterdayTopPropResult = recentPropResults.first(where: {
                                    let n = ($0.player_name ?? "").lowercased()
                                    return !n.isEmpty && (n == matchKey || n.contains(matchKey) || matchKey.contains(n))
                                })?.result
                            } else {
                                yesterdayTopPropResult = nil
                            }
                        } catch {
                            // Same-day last-good is an emergency transport policy,
                            // never a way to hide malformed/auth/config payloads.
                            if !SupabaseAPI.isTransientExternalFailure(error) {
                                yesterdayTopProp = nil
                                yesterdayTopPropResult = nil
                            }
                        }
                    }

                    // Get picks data (already fetched in parallel)
                    loading = true
                    let pickSnapshot = await picksFetch
                    let allPicks = mergeGamePickSnapshot(
                        pickSnapshot,
                        retaining: previousTodayPicks
                    )

                    // `date` is already the 6 a.m.-anchored slate key. Matching
                    // commence dates to that key keeps the finished slate visible
                    // overnight, then cleanly removes it when the key rolls at 6.
                    let todayOnlyPicks = Self.homeVisiblePicks(allPicks, slateDate: date)

                    // Select Top Pick: manual override first, then highest confidence
                    if !todayOnlyPicks.isEmpty {
                        if let manualTopPick = todayOnlyPicks.first(where: { $0.is_top_pick == true }) {
                            freePick = manualTopPick
                        } else {
                            freePick = todayOnlyPicks.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
                        }
                    } else {
                        freePick = nil
                    }

                    // Select Top Prop: highest confidence — but FRESH props only
                    // (game today or upcoming). Props whose game has already
                    // happened (e.g. yesterday's props mis-dated under today's
                    // key) are stale; showing one as a free pick with no result is
                    // the bug. Excluding them lets the prop slot fall back to
                    // yesterday's GRADED prop (with Cash/No Cash) only when there's
                    // no fresh pick at all — never a stale prop without a result.
                    var propCount = 0
                    do {
                        let allProps = try await propPicksFetch
                        var estCal = Calendar.current
                        estCal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
                        let slateFormatter = DateFormatter()
                        slateFormatter.calendar = estCal
                        slateFormatter.timeZone = estCal.timeZone
                        slateFormatter.dateFormat = "yyyy-MM-dd"
                        let todayStart = slateFormatter.date(from: date).map { estCal.startOfDay(for: $0) }
                            ?? estCal.startOfDay(for: Date())
                        let freshProps = allProps.filter { p in
                            guard !p.isHRLane else { return false }   // HR fun lane never fronts Home
                            guard let iso = p.commence_time, let gd = parseISO8601(iso) else { return false }
                            return gd >= todayStart   // game is today or later (not a past game)
                        }
                        freeProp = freshProps.sorted(by: { ($0.confidence ?? 0) > ($1.confidence ?? 0) }).first
                        propCount = freshProps.count
                    } catch {
                        if !SupabaseAPI.isTransientExternalFailure(error) { freeProp = nil }
                    }
                    playsOnBoard = todayOnlyPicks.count + propCount
                    // (Parked All-Star preview now lives inside fetchDailyPicks —
                    // DEBUG-only there — so every surface gets it from one source.)
                    todayPicks = todayOnlyPicks
                    // The "what's on today" sheet lists All-Star events like any
                    // game (founder, Jul 13): synthesize a slate row per special
                    // event when the slate table doesn't carry it.
                    for sp in todayPicks where (sp.type ?? "") == "special" {
                        guard let away = sp.awayTeam, !away.isEmpty,
                              !slateGames.contains(where: { $0.away_team == away }) else { continue }
                        slateGames.append(DailySlateRow(
                            league: sp.league ?? "MLB",
                            away_team: away, home_team: sp.homeTeam,
                            commence_time: sp.commence_time, bdl_game_id: nil,
                            venue: sp.venue,
                            spread: nil, ml_home: nil, ml_away: nil, total: nil))
                    }
                    picksByGameId = Dictionary(
                        (todayPicks.compactMap { p in p.game_id.map { (String($0), p) } }),
                        uniquingKeysWith: { a, _ in a })

                    loading = false
                }
            } catch {
                // Timeout or error — stop loading, show whatever we have
                loading = false
            }
        }
        .onChange(of: scenePhase) { phase in
            // Launch already has a full keyed load in flight. Only a later
            // foreground return should start another one; otherwise the first
            // activation cancels the receipt/slate request wave mid-hydration.
            guard phase == .active, hasCompletedInitialHomeLoad else { return }
            homeNonce &+= 1
        }
        .onChange(of: selectedTab) { tab in
            // Kept-alive tabs do not rerun `.task` when selected. Refresh the
            // small rolling payload immediately when the user comes back Home.
            guard tab == 0, scenePhase == .active else { return }
            presentDailyRecapIfNeeded()
            Task { await refreshRollingHomeContent() }
        }
        .onReceive(rollingHomeRefreshTimer) { _ in
            guard selectedTab == 0, scenePhase == .active else { return }
            Task { await refreshRollingHomeContent() }
        }
        .onReceive(slateRolloverTimer) { _ in
            guard scenePhase == .active, !loadedSlateDate.isEmpty,
                  loadedSlateDate != SupabaseAPI.todayEST() else { return }
            // The betting day changed while Home remained alive. Reload the
            // slate, picks, live rows, and durable grades as one date-keyed set.
            homeNonce &+= 1
        }
    }

    /// Home is opacity-kept-alive even while another tab is selected, so its data
    /// task can finish offscreen. Consume the daily receipt only when Home is
    /// actually visible, then present the already-loaded receipt on a later tap.
    private func presentDailyRecapIfNeeded(graded: Int? = nil, todayKey: String? = nil) {
        let available = graded
            ?? (dailyRecapRecord.w + dailyRecapRecord.l + dailyRecapRecord.p)
        let key = todayKey ?? SupabaseAPI.todayEST()
        guard selectedTab == 0, available > 0, dailyRecapShownDate != key else { return }
        // Mark shown when it appears so foreground refreshes cannot stack it.
        dailyRecapShownDate = key
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            showDailyRecap = true
        }
    }

    /// Refresh the pieces that genuinely change during a slate without rerunning
    /// Home's full multi-section load. This keeps new picks, finished grades and
    /// recap cards moving while avoiding the launch/navigation work that made the
    /// app feel heavy. Successful empty pick desks clear only themselves; failed
    /// desks retain their own last-good rows while healthy sports keep moving.
    @MainActor
    private func refreshRollingHomeContent() async {
        guard !rollingHomeRefreshInFlight, fullHomeRefreshNonce == nil else { return }
        rollingHomeRefreshInFlight = true
        defer { rollingHomeRefreshInFlight = false }

        let date = SupabaseAPI.todayEST()
        let previousPicks = todayPicks
        async let picksFetch = fetchIsolatedGamePickSources(
            date: date
        )
        async let propsFetch = SupabaseAPI.fetchPropPicks(date: date, forceRefresh: true)
        async let gameResultsFetch = SupabaseAPI.fetchRecentGameResults(limit: 200)
        async let propResultsFetch = SupabaseAPI.fetchRecentPropResults(limit: 200)
        async let recapsTodayFetch = SupabaseAPI.fetchGameRecaps(date: date)
        async let recapsGradedFetch = SupabaseAPI.fetchGameRecaps(date: SupabaseAPI.hubGradedDateEST())

        let pickSnapshot = await picksFetch
        let fetchedPicks = mergeGamePickSnapshot(
            pickSnapshot,
            retaining: previousPicks
        )
        var fetchedProps: [PropPick] = []
        var propsError: Error? = nil
        do { fetchedProps = try await propsFetch } catch { propsError = error }
        let recentGames: [GameResult]
        do {
            let fresh = try await gameResultsFetch
            recentGameResultsLastGood = fresh
            recentGames = fresh
        } catch {
            recentGames = SupabaseAPI.isTransientExternalFailure(error)
                ? recentGameResultsLastGood : []
        }
        let recentProps: [PropResult]
        do {
            let fresh = try await propResultsFetch
            recentPropResultsLastGood = fresh
            recentProps = fresh
        } catch {
            recentProps = SupabaseAPI.isTransientExternalFailure(error)
                ? recentPropResultsLastGood : []
        }
        let recapsToday = await recapsTodayFetch
        let recapsGraded = await recapsGradedFetch

        // The API is keyed to the 6 a.m. slate date, but keep the same defensive
        // commence-time filter as the full Home load so a misdated row cannot leak.
        let freshPicks = Self.homeVisiblePicks(fetchedPicks, slateDate: date)
        todayPicks = freshPicks
        if let manual = freshPicks.first(where: { $0.is_top_pick == true }) {
            freePick = manual
        } else {
            freePick = freshPicks.max { ($0.confidence ?? 0) < ($1.confidence ?? 0) }
        }
        picksByGameId = Dictionary(
            freshPicks.compactMap { p in p.game_id.map { (String($0), p) } },
            uniquingKeysWith: { first, _ in first })

        let freshProps = Self.homeVisibleProps(fetchedProps, slateDate: date)
        if propsError == nil {
            freeProp = freshProps.max { ($0.confidence ?? 0) < ($1.confidence ?? 0) }
        } else if let propsError, !SupabaseAPI.isTransientExternalFailure(propsError) {
            freeProp = nil
        }
        if propsError == nil || !freshProps.isEmpty {
            playsOnBoard = todayPicks.count + freshProps.count
        }

        if !recentGames.isEmpty {
            scoreByMatchup = Dictionary(
                recentGames.compactMap { row -> (String, String)? in
                    guard let matchup = row.matchup?.lowercased(), let score = row.final_score,
                          !matchup.isEmpty, !score.isEmpty else { return nil }
                    return (matchup, score)
                }, uniquingKeysWith: { first, _ in first })
            sheetGameResults = recentGames.filter {
                $0.game_date == date && ["won", "lost", "push"].contains(($0.result ?? "").lowercased())
            }

            let coreProps = recentProps.filter { !$0.isHRResult }
            let night = Self.buildLastNight(games: recentGames, props: coreProps)
            marquee = night.story
            cashRows = night.cashes
            worstBeat = night.beat
            lastNightNet = night.graded > 0 ? night.net : nil
            lastNightRecord = night.record
            lastNightGraded = night.graded
            bestCashOdds = night.bestOdds
            form = Self.buildForm(games: recentGames)

            let cycleStarted = slateGames.contains {
                parseISO8601($0.commence_time ?? "").map { $0 <= Date() } ?? false
            }
            let cycleRows = recentGames.filter { $0.game_date == date }
            let gamesNight = cycleStarted
                ? Self.buildLastNight(games: cycleRows, props: [], includeToday: true)
                : Self.buildLastNight(games: recentGames, props: [], includeToday: false)
            gamesNightRecord = gamesNight.record
            gamesNightNet = gamesNight.graded > 0 ? gamesNight.net : nil
            gamesNightBest = gamesNight.bestOdds

            let settledDays = recentGames
                .filter { ["won", "lost", "push"].contains(($0.result ?? "").lowercased()) }
                .compactMap(\.game_date)
                + coreProps
                    .filter { ["won", "lost", "push"].contains(($0.result ?? "").lowercased()) }
                    .compactMap(\.game_date)
            let recapDay = Set(settledDays).max()
            let liveRows = liveScoresNow
            gamesLiveNow = liveRows.filter(\.isLive).count
            if cycleStarted {
                var w = 0, l = 0, p = 0
                for row in cycleRows.countable {
                    switch (row.result ?? "").lowercased() {
                    case "won", "win", "w": w += 1
                    case "lost", "loss", "l": l += 1
                    case "push", "p": p += 1
                    default: break
                    }
                }
                yesterdayRecord = (w, l, p)
                recordBoxLabel = liveRows.contains(where: \.isLive) ? "LIVE" : "TODAY"
                recapLabel = recordBoxLabel
            }
            dailyForm = Self.buildDailyFormBySport(
                games: recentGames, live: liveRows, slateDay: date, anchor: recapDay)
        }

        if !recapsToday.isEmpty {
            nightRecaps = recapsToday
        } else if nightRecaps.isEmpty, !recapsGraded.isEmpty {
            nightRecaps = recapsGraded
        }
        HomeHeadlinesCache.save(headlineStories)
    }

    /// Same 6 a.m.-aware filtering rule as the full Home load, factored for the
    /// rolling refresh so an overnight board stays visible until the cutoff.
    private static func homeVisiblePicks(_ picks: [GaryPick], slateDate: String) -> [GaryPick] {
        var calendar = Calendar.current
        calendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        guard let slateDay = formatter.date(from: slateDate) else { return picks }
        return picks.filter { pick in
            guard let iso = pick.commence_time, let gameDate = parseISO8601(iso) else { return true }
            return calendar.isDate(gameDate, inSameDayAs: slateDay)
        }
    }

    private static func homeVisibleProps(_ props: [PropPick], slateDate: String) -> [PropPick] {
        var calendar = Calendar.current
        calendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let slateStart = formatter.date(from: slateDate).map { calendar.startOfDay(for: $0) }
            ?? calendar.startOfDay(for: Date())
        return props.filter { prop in
            guard !prop.isHRLane, let iso = prop.commence_time,
                  let gameDate = parseISO8601(iso) else { return false }
            return gameDate >= slateStart
        }
    }

    // MARK: - Time-aware section stacks

    /// Morning: yesterday graded leads — scorecard, marquee, the Wire,
    /// prop box, cashes, receipts, then tonight's board.
    /// The rotating front-page banner: the real marquee story leads, the
    /// rest of the night's headlines follow (sample rows until game_recaps).
    /// Recap matchups carry nicknames ("Astros @ Angels"), headlines carry
    /// prose ("Angels over the Astros, 10-1") — match on both teams appearing,
    /// full name or last word ("Golden Knights" → "knights").
    private func recapMatches(_ matchup: String?, headline: String) -> Bool {
        let hay = headline.lowercased()
        let teams = (matchup ?? "").components(separatedBy: " @ ")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }
        guard teams.count == 2 else { return false }
        return teams.allSatisfy { t in
            hay.contains(t) || hay.contains(t.components(separatedBy: " ").last ?? t)
        }
    }

    /// "2026-08-04" → "AUG 4". Parsed off the ISO date, never a locale format,
    /// so the kicker reads the same on every device.
    private static func shortSlateDay(_ iso: String?) -> String {
        let parts = (iso ?? "").split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]), m >= 1, m <= 12
        else { return "" }
        let months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
        return "\(months[m - 1]) \(d)"
    }

    private var headlineStories: [HomeMarqueeHero.Story] {
        // Paint last session's cards instantly on cold open.
        if nightRecaps.isEmpty, let cached = cachedHeadlines { return cached }
        // THE TRUTH, IN ORDER (founder, Aug 3): headlines run priority league
        // first, then FEED ORDER — never wins-first, never a biggest-cash
        // lead. A rail that leads with cashes reads like Gary always wins,
        // "which of course would look fake and would be fake." Losses print
        // exactly where the night put them.
        let orderedRecaps = nightRecaps.enumerated()
            .sorted { a, b in
                let ra = LeaguePriority.rank(a.element.league), rb = LeaguePriority.rank(b.element.league)
                return ra != rb ? ra < rb : a.offset < b.offset
            }
            .map(\.element)
        return orderedRecaps.prefix(6).map { r in
            let cashed = r.result == "won"
            let split = Formatters.splitPickAndOdds(r.pick_text ?? "")
            let mu = r.matchup ?? ""
            return HomeMarqueeHero.Story(
                league: r.league ?? "", headline: r.headline ?? "", sub: "",
                receiptLead: cashed ? (AppFlags.storeSafe ? "Gary Won ·" : "Gary Cashed ·") : "Gary Had ·",
                receiptPick: Formatters.arrowizeOverUnder(split.0).uppercased(),
                verdict: cashed ? AppFlags.wonStamp : (r.result == "push" ? "PUSH" : "LOST"),
                cashed: cashed, recap: r.recap, bullets: r.bullets ?? [],
                matchup: mu,
                odds: split.1,
                // The recap row carries no score; the board's own results do.
                score: scoreByMatchup[mu.lowercased()],
                date: Self.shortSlateDay(r.game_date),
                awayHits: r.box?.away?.hits,
                homeHits: r.box?.home?.hits,
                awayHR: r.box?.away?.hr,
                homeHR: r.box?.home?.hr)
        }
    }

    /// TODAY — THE SHEET (Jul 5 rebuild; founder: "less Gary ride-along,
    /// more the bettor's sheet"). One column, the bettor's whole day:
    /// the overnight strip (graded numbers, celebrated or owned in one line)
    /// → last night's stories → the sheet itself: EARLIER / LIVE / TONIGHT,
    /// every game on today's slate with Gary's call and a status that rolls
    /// time → live verdict → CASHED/LOST → the sealed Winners stub → THE
    /// RECORD sign-off. Gary is the voice ON the sheet, not the subject of
    /// the page — free users read the day, paying users ride the calls.
    /// THE RECORD as a traveler (founder, Aug 3): yesterday's final numbers
    /// above the board until first pitch, the LIVE building record under it
    /// after. Shows at LIVE 0–0 — the reset IS the state. GAME picks only
    /// (founder, Jul 6). Scorecard tap → Billfold, as ever.
    @ViewBuilder private var recordBlock: some View {
        if gamesNightRecord.w + gamesNightRecord.l + gamesNightRecord.p > 0
            || recapLabel == "LIVE" || recapLabel == "TODAY" {
            VStack(alignment: .leading, spacing: 12) {
                // Bare rule — the scorecard's own YESTERDAY/LIVE cell already
                // names the window; "THE RECORD" said it twice.
                HomeSectionRule()
                scorecard
            }
        }
    }

    @ViewBuilder private var todaySections: some View {
        // Compute once per body eval (live ticks re-run this often).
        let stories = headlineStories

        // ── THE HEADLINES lead the page, ALL DAY (founder, Aug 5). They do
        // not move at first pitch and they do not move again at the last out:
        // the stories own the top of Home, above the countdown, and each game's
        // recap card lands up here as that game finishes. (Until Aug 5 this
        // rendered twice — once above the marquee pre-slate, once below the
        // board after — so the rail appeared to jump mid-day. One instance now.)
        if !stories.isEmpty {
            HomeHeadlinesBoard(stories: stories) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
            }
            .opacity(animateIn ? 1 : 0)
            .animation(.easeOut(duration: 0.6).delay(0.04), value: animateIn)
        }

        // ── ALL-STAR WEEK — the break takeover (Jul 13-14 2026). Gary works
        // the exhibitions, so the dark days lead with them instead of a void.
        // Renders only stored pick data + the verified event schedule.
        if !allStarSpecials.isEmpty {
            HomeAllStarTakeover(specials: allStarSpecials) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 3 }
            }
            .opacity(animateIn ? 1 : 0)
            .animation(.easeOut(duration: 0.6).delay(0.05), value: animateIn)
        }

        // ── THE MARQUEE — the day's big games, tracked live (founder):
        // countdown → live score + where Gary stands → result → the next one.
        if !marqueeEntries.isEmpty {
            HomeMarqueeTracker(entries: marqueeEntries,
                               tomorrowTease: marqueeTomorrowTease,
                               onOpenGame: { m in
                                   PicksFocusState.shared.focus(game: m)
                                   withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 3 }
                               })
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.6).delay(0.05), value: animateIn)
        }

        // (Overnight strip removed Aug 3 — with the record box now holding
        // yesterday until first pitch and going live after, the strip said
        // the same numbers twice on one page. THE RECORD is the one home.)

        // (YOUR NIGHT strip removed Aug 27 — the board's YOU lane below is
        // where the user's open action lives on Home; the strip said it
        // twice. The receipts line above it went the same way Aug 4.)

        // ── THE BOARD — every game, one list, all day.
        homeSheet
            .opacity(animateIn ? 1 : 0)
            .animation(.easeOut(duration: 0.6).delay(0.06), value: animateIn)

        // THE RECORD moved INSIDE the board card (Aug 19) — homeSheetPanel's
        // last section. On a day-state with NO board rows it still renders
        // standalone here, so the honesty band never disappears.
        if sheetRows.isEmpty {
            recordBlock
                .opacity(animateIn ? 1 : 0)
                .animation(.easeOut(duration: 0.6).delay(0.065), value: animateIn)
        }

        // (The second headlines instance that used to sit here came out Aug 5 —
        // the rail lives at the top of the page now, in every day-state.)

        // ── THE FUN STUFF + THE WIRE — one container (founder, Aug 26:
        // "combine these to one container"): the fun-room doors ride the top
        // of the Wire's card, hairline-split, moments beneath. Funnels only,
        // never advice (founder, Aug 3).
        HomeWireMini(
            doors: [
                .init(title: "Free Pick", sub: "TODAY") { selectedTab = 3 },
                .init(title: "HR Threats", sub: "THE HUB") {
                    UserDefaults.standard.set("hub", forKey: "hubScope")
                    selectedTab = 2
                },
                .init(title: "Fantasy", sub: "WAIVERS") {
                    UserDefaults.standard.set("fantasy", forKey: "hubScope")
                    selectedTab = 2
                },
            ],
            items: wireItems
        ) {
            UserDefaults.standard.set("hub", forKey: "hubScope")
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 2 }
        }
        // ── WINNERS — the sealed card, slip-styled (the one conversion door).
        HomeWinnersStub(onOpen: {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 1 }
        },
        plays: todayPicks.count,
        leagues: {
            let ls = Array(Set(todayPicks.compactMap { $0.league?.uppercased() })).sorted()
            return ls.isEmpty ? nil : ls.joined(separator: " + ")
        }(),
        nextSeal: firstCallClock)
        .opacity(animateIn ? 1 : 0)
        .animation(.easeOut(duration: 0.6).delay(0.08), value: animateIn)

        // (The Record now travels with the day cycle — see recordBlock above.
        // The page ends on the discovery shelf + the quiet social footer.)
        // (Parked, unrendered: worldCupModule, the Wire, prop box, Hits &
        // Heartbreakers, The Receipts — receiptLanes/cashRows still computed
        // for other surfaces.)
    }

    // MARK: - THE SHEET (today's slate × Gary's calls × live state)

    /// One game on the sheet: title (matchup or live score), Gary's call(s),
    /// and a status that rolls scheduled time → live verdict → the stamp.
    struct HomeSheetRow: Identifiable {
        enum Zone { case settled, live, interrupted, upcoming }
        let id: String
        let gameID: Int?
        let zone: Zone
        let league: String
        let matchupFull: String
        let title: String
        let callLine: String?
        let pendingLine: String?
        /// GAME state, riding the score line: "▶ INN 8", "FINAL". Separate from
        /// `statusText`, which is GARY's state (founder, Aug 5) — the clock
        /// belongs next to the score it's describing, not in the verdict slot.
        var clockText: String? = nil
        let statusText: String
        let statusColor: Color
        let bigOne: Bool
        let commence: String
        /// Picks already mathematically HIT mid-game (an OVER whose line the
        /// score has passed) — stacked under the live status (founder, Jul 7).
        var hitLines: [String] = []
    }

    private enum HomeBoardLeague: String, CaseIterable, Hashable {
        case mlb = "MLB"
        case nfl = "NFL"
        /// College football is a first-class board tab (founder, Aug 26:
        /// "we need an NCAAF tab") — same board, same empty-state honesty.
        case ncaaf = "NCAAF"
        /// The user's own slate (founder, Aug 20: "a You tab next to NFL") —
        /// same board, same rows, THEIR side's standing in the verdict slot.
        case you = "YOU"

        var sport: Sport {
            switch self {
            case .mlb: return .mlb
            case .ncaaf: return .ncaaf
            default: return .nfl
            }
        }
    }

    /// Freshest live/final row for a slate game (the cache once it has polled,
    /// the one-shot fetch before that). Exact game id wins for doubleheaders.
    /// When the poller carries both a stale scheduled row and a final row, the
    /// scheduled row only wins before first pitch; after first pitch FINAL is
    /// authoritative. The old unconditional scheduled-first rule caused the
    /// finished board to regress to `STARTED` overnight.
    private func sheetLive(_ full: String, league: String, gameID: Int? = nil,
                           commence: String? = nil) -> LiveScore? {
        let league = league.uppercased()
        let matches: [LiveScore]
        if let gameID {
            // Exact provider identity must not depend on a league-specific
            // abbreviation dictionary. That dictionary never covered every
            // NCAAF school and previously made an exact football row invisible.
            let exact = liveScoresNow.filter {
                $0.game_id == String(gameID) && ($0.league ?? "").uppercased() == league
            }
            // At the 6am roll the cache can briefly contain yesterday's same-team
            // series game. Never fall back from today's id to a different id;
            // id-less legacy rows remain eligible for older feeds.
            matches = exact.isEmpty
                ? liveScoresNow.filter {
                    $0.game_id == nil
                        && !$0.isInterrupted
                        && ($0.league ?? "").uppercased() == league
                        && abbrGameMatches($0.abbrGame, matchup: full)
                }
                : exact
        } else {
            matches = liveScoresNow.filter {
                ($0.league ?? "").uppercased() == league
                    && abbrGameMatches($0.abbrGame, matchup: full)
            }
        }

        // Unknown start keeps the historical behavior; callers with a real slate
        // timestamp get the stricter future/final protection.
        let hasStarted = commence.flatMap(parseISO8601).map { $0 <= Date() } ?? true
        guard matches.count > 1 else {
            guard let only = matches.first else { return nil }
            // A lone pregame FINAL is a stale/bogus poller artifact. The real
            // schedule time is more trustworthy until this game actually starts.
            return only.isFinal && !hasStarted ? nil : only
        }
        if let live = matches.first(where: { $0.isLive }) { return live }
        if hasStarted, let final = matches.first(where: { $0.isFinal }) { return final }
        if let interruption = matches.first(where: { $0.isInterrupted }) { return interruption }
        if hasStarted { return matches.first { !$0.isFinal } ?? matches.first }
        return matches.first { !$0.isFinal } ?? matches.first { $0.isFinal } ?? matches.first
    }

    /// Durable game-result rows belonging to this slate matchup. Results can
    /// store either full team names or abbreviations, so match both directions
    /// through the same league keyword maps used by the live board.
    private func sheetResults(for full: String, away: String, home: String,
                              league: String, gameID: Int?) -> [GameResult] {
        if let gameID {
            let exact = sheetGameResults.filter {
                $0.game_id == String(gameID) && ($0.league ?? "").uppercased() == league
            }
            if !exact.isEmpty { return exact }
        }
        let abbr = "\(Self.teamAbbrev(away, league: league)) @ \(Self.teamAbbrev(home, league: league))"
        let fullKey = full.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
        let abbrKey = abbr.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()

        return sheetGameResults.filter { row in
            // An exact result belonging to another game must never be adopted by
            // the legacy matchup path. Only genuinely id-less history falls back.
            if gameID != nil, row.game_id != nil { return false }
            guard (row.league ?? "").uppercased() == league else { return false }
            guard let matchup = row.matchup, !matchup.isEmpty else { return false }
            let resultKey = matchup.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
            return resultKey == fullKey
                || resultKey == abbrKey
                || abbrGameMatches(matchup, matchup: full)
                || abbrGameMatches(abbr, matchup: matchup)
        }
    }

    /// Exact provider identity is the normal join. Team names are retained only
    /// for legacy stored picks that predate game_id persistence.
    private static func homeBoardPick(_ pick: GaryPick, league: String?, gameID: Int?,
                                      away: String?, home: String?) -> Bool {
        let league = (league ?? "").uppercased()
        guard (pick.league ?? "").uppercased() == league else { return false }
        if let gameID, let pickID = pick.game_id {
            return gameID == pickID
        }
        return (pick.awayTeam ?? "").caseInsensitiveCompare(away ?? "") == .orderedSame
            && (pick.homeTeam ?? "").caseInsensitiveCompare(home ?? "") == .orderedSame
    }

    private static func homeBoardPick(_ pick: GaryPick, matches game: DailySlateRow) -> Bool {
        homeBoardPick(pick, league: game.league, gameID: game.bdl_game_id,
                      away: game.away_team, home: game.home_team)
    }

    /// Stable Home-marquee identity. Provider id is the normal contract; only
    /// genuinely legacy id-less rows use matchup + 30-minute start bucket.
    /// Returning nil when legacy time is missing deliberately fails closed —
    /// two doubleheader games must never collapse into one membership key.
    private static func homeMarqueeGameKey(league: String?, gameID: Int?,
                                            matchup: String, commence: String?) -> String? {
        let scopedLeague = (league ?? "").uppercased()
        if let gameID { return "\(scopedLeague)|id:\(gameID)" }
        guard let commence, let start = parseISO8601(commence) else { return nil }
        let matchupKey = matchup.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "|")
        return "\(scopedLeague)|legacy:\(matchupKey)|\(Int(start.timeIntervalSince1970 / 1800))"
    }

    /// A stored grade for this exact play. The pick signature strips only the
    /// volatile odds tail, so a side and a total on the same game retain their
    /// own independent CASHED/LOST result.
    private func sheetStoredOutcome(for call: GaryPick, in rows: [GameResult]) -> String? {
        let sig = garyGamePickSig(call.pick)
        guard !sig.isEmpty else { return nil }
        return rows.first { garyGamePickSig($0.pick_text) == sig }?.result?.lowercased()
    }

    private static func etClock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }

    /// Inverse of `etClock` — the All-Star specials pipeline only ever stamps
    /// a display clock like "8:00 PM" (`GaryPick.time`), never a real
    /// `commence_time`, so this rebuilds TODAY's ET date at that clock time
    /// for anything that needs an actual countdown target.
    private static func todayET(atClock clock: String) -> Date? {
        let parseF = DateFormatter()
        parseF.timeZone = TimeZone(identifier: "America/New_York")
        parseF.dateFormat = "h:mm a"
        guard let parsed = parseF.date(from: clock) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let comps = cal.dateComponents([.hour, .minute], from: parsed)
        guard let hour = comps.hour, let minute = comps.minute else { return nil }
        return cal.date(bySettingHour: hour, minute: minute, second: 0, of: Date())
    }

    /// "~2:30 PM" — when the first still-unposted call should land (T-90).
    private var firstCallClock: String? {
        let unposted = sheetRows.filter { $0.zone == .upcoming && $0.callLine == nil }
        guard let first = unposted.compactMap({ parseISO8601($0.commence) }).min() else { return nil }
        // Bare clock — the Winners stub's copy owns the "~" ("seals ~~5:10" bug, Aug 3).
        return Self.etClock(first.addingTimeInterval(-5400))
    }

    /// The whole day, one row per slate game, joined with Gary's calls and
    /// the live board. WC games carry two calls (side + total) on one row.
    private var sheetRows: [HomeSheetRow] {
        let games = slateGames
        guard !games.isEmpty else { return [] }
        var out: [HomeSheetRow] = []
        for (i, g) in games.enumerated() {
            let away = g.away_team ?? "", home = g.home_team ?? ""
            guard !away.isEmpty, !home.isEmpty else { continue }
            let full = "\(away) @ \(home)"
            let lgUpper = (g.league ?? "").uppercased()
            let calls = todayPicks.filter { Self.homeBoardPick($0, matches: g) }
            // All-Star specials: the sheet says the board EXISTS, never what's
            // on it (founder's no-reveal rule) — picks live on the Picks tab.
            let hasSpecials = calls.contains { ($0.type ?? "") == "special" }
            let callLine: String? = calls.isEmpty ? nil
                : hasSpecials ? "GARY'S BOARD — \(calls.count) PICKS · PICKS TAB"
                : calls.map { Self.homePickLabel($0.pick) }.joined(separator: "  ·  ")
            let ls = sheetLive(full, league: lgUpper, gameID: g.bdl_game_id,
                               commence: g.commence_time)
            // A live-score row is the freshest authority. The exact slate row
            // carries the interruption too, covering the short window before
            // the live-score poll catches up. Never let a stale slate delay
            // override an already-live/final snapshot.
            let interruptionLabel: String? = {
                if let liveLabel = ls?.interruptionLabel { return liveLabel }
                guard ls == nil || ls?.status?.lowercased() == "scheduled" else { return nil }
                return g.interruptionLabel
            }()
            let interruptionStatus: String? = {
                if ls?.isInterrupted == true { return ls?.status?.lowercased() }
                guard ls == nil || ls?.status?.lowercased() == "scheduled" else { return nil }
                return g.isInterrupted ? g.game_status?.lowercased() : nil
            }()
            let storedRows = sheetResults(for: full, away: away, home: home,
                                          league: (g.league ?? "").uppercased(),
                                          gameID: g.bdl_game_id)
            var zone: HomeSheetRow.Zone = .upcoming
            // Abbreviations, not names (founder, Jul 27): "SEA @ TEX" reads
            // cleaner on the queue and matches the live scorebug rows.
            var title = "\(Self.teamAbbrev(away, league: lgUpper)) @ \(Self.teamAbbrev(home, league: lgUpper))"
            var statusText = g.kickoffTimeLabel
                ?? TomorrowView.etTime(g.commence_time, withZone: false, meridiem: true).uppercased()
            var statusColor = Color.white.opacity(0.62)
            // Before Gary's call lands, the pick slot holds the MARKET (founder,
            // Aug 3): the game's lines sit where the pick will go, so the gold
            // call visibly REPLACES the market when it posts.
            var pendingLine: String? = nil
            // STORE-SAFE BRIDGE: no market placeholder — before the pick posts
            // the row is simply the matchup and first pitch.
            if calls.isEmpty, !AppFlags.storeSafe {
                var bits: [String] = []
                if let mlA = g.ml_away, let mlH = g.ml_home {
                    let fa = mlA > 0 ? "+\(Int(mlA))" : "\(Int(mlA))"
                    let fh = mlH > 0 ? "+\(Int(mlH))" : "\(Int(mlH))"
                    bits.append("\(Self.teamAbbrev(away, league: lgUpper)) \(fa) · \(Self.teamAbbrev(home, league: lgUpper)) \(fh)")
                }
                if !bits.isEmpty { pendingLine = bits.joined(separator: " · ") }
            }
            var hitLines: [String] = []
            var clockText: String? = nil
            if let ls, ls.isLive {
                title = ls.scoreLine ?? title
                let verdicts = calls.map { HomeLiveVerdict.evaluate(pick: $0, live: ls) }
                zone = .live
                // The cashed-props feed (scorers/assists/cards, homers/
                // steals/multi-hit days) + any of Gary's overs the score
                // has already passed (founder, Jul 7).
                hitLines = Self.liveHitStrings(ls)
                let combined = Double((ls.away_score ?? 0) + (ls.home_score ?? 0))
                hitLines += calls.compactMap { p in
                    let t = (p.pick ?? "").lowercased()
                    guard t.contains("over"), !t.contains("under"),
                          let line = HomeLiveVerdict.unsignedNumber(in: t),
                          combined > line else { return nil }
                    return Self.homePickLabel(p.pick)
                }
                // The inning rides the SCORE (founder, Aug 5) — it describes
                // the game, so it sits next to the game. The right column is
                // Gary's standing alone, in plain English: WINNING / LOSING.
                clockText = "▶ \((ls.detail ?? "LIVE").uppercased())"
                if verdicts.contains(.covering), !verdicts.contains(.trailing) {
                    statusText = "COVERING"; statusColor = GaryColors.win
                } else if verdicts.contains(.trailing), !verdicts.contains(.covering) {
                    statusText = "LOSING"; statusColor = GaryColors.loss
                } else if verdicts.contains(.covering) && verdicts.contains(.trailing) {
                    statusText = "SPLIT"; statusColor = GaryColors.gold
                } else {
                    // Gary has a call the score hasn't settled — level on the
                    // money, sitting on the number, or a total still cooking.
                    // That's a SWEAT, and it wears amber so it is distinct from
                    // covering green, losing red and the brand gold used for calls.
                    // A live game with no Gary call is still a complete Board row.
                    // Say that plainly instead of leaving a visually broken hole.
                    statusText = calls.isEmpty ? "NO PICK" : "SWEATING"
                    statusColor = calls.isEmpty ? Color.white.opacity(0.62) : GaryColors.sweating
                }
            } else if let interruptionLabel {
                // Provider state belongs beside the matchup, where STARTED /
                // FINAL normally live. A delay/suspension can resume, while a
                // postponement/cancellation is off today's board. Neither may
                // masquerade as a live SWEAT or a settled result.
                zone = .interrupted
                clockText = interruptionLabel
                let canResume = interruptionStatus == "delayed" || interruptionStatus == "suspended"
                statusText = calls.isEmpty ? "NO PICK" : (canResume ? "ON HOLD" : "OFF BOARD")
                statusColor = calls.isEmpty ? Color.white.opacity(0.62) : GaryColors.gold
                pendingLine = nil
            } else if (ls?.isFinal ?? false) || !storedRows.isEmpty {
                // A durable grade is just as authoritative as a live-score
                // FINAL and outlives that transient feed until the 6am roll.
                zone = .settled
                if let score = ls?.scoreLine
                    ?? storedRows.compactMap({ $0.final_score }).first(where: { !$0.isEmpty }) {
                    title = score.uppercased()
                }
                if let ls, ls.isFinal { hitLines = Self.liveHitStrings(ls) }
                clockText = "FINAL"

                let outcomes: [String] = calls.compactMap { call in
                    if let stored = sheetStoredOutcome(for: call, in: storedRows) { return stored }
                    // Defensive fallback for a legacy one-pick result whose
                    // pick_text formatting predates the normalized signature.
                    if calls.count == 1, storedRows.count == 1,
                       let only = storedRows.first?.result?.lowercased() { return only }
                    guard let ls, ls.isFinal else { return nil }
                    switch HomeLiveVerdict.evaluate(pick: call, live: ls) {
                    case .covering: return "won"
                    case .trailing: return "lost"
                    case .neutral:  return nil
                    }
                }
                let cashed = outcomes.filter { ["won", "win", "w"].contains($0) }.count
                let lost = outcomes.filter { ["lost", "loss", "l"].contains($0) }.count
                let pushed = outcomes.filter { ["push", "p"].contains($0) }.count
                if cashed > 0 && lost == 0 { statusText = AppFlags.storeSafe ? "✓ WON" : "✓ CASHED"; statusColor = GaryColors.win }
                else if lost > 0 && cashed == 0 { statusText = "✗ LOST"; statusColor = GaryColors.loss }
                else if cashed > 0 && lost > 0 { statusText = "✓✗ SPLIT"; statusColor = GaryColors.gold }
                else if pushed > 0 { statusText = "PUSH"; statusColor = GaryColors.gold }
                else {
                    statusText = calls.isEmpty ? "NO PICK" : ""
                    statusColor = Color.white.opacity(0.62)
                }
            }
            // (Per-row "PICK ~x:xx" labels removed Jul 27 — the Tonight header
            // carries one "PICKS DROP 90 MIN BEFORE" note instead.)
            // The game has begun but the score feed hasn't caught it yet —
            // move it to LIVE honestly instead of listing a past start time.
            if zone == .upcoming, interruptionLabel == nil,
               let ct = g.commence_time, let d = parseISO8601(ct),
               d.addingTimeInterval(180) < Date() {
                if d.addingTimeInterval(6 * 60 * 60) < Date() {
                    // If both feeds are delayed, do not lie that a many-hours-old
                    // game merely "started". The next refresh replaces this with
                    // the durable CASHED/LOST grade as soon as it lands.
                    zone = .settled
                    clockText = "RESULT PENDING"
                    statusText = calls.isEmpty ? "NO PICK" : ""
                    statusColor = Color.white.opacity(0.55)
                } else {
                    zone = .live
                    clockText = "▶ STARTED"
                    statusText = calls.isEmpty ? "NO PICK" : "SWEATING"
                    statusColor = calls.isEmpty ? Color.white.opacity(0.62) : GaryColors.sweating
                }
            }
            // The market line is a PRE-GAME slot only — a live/final row must
            // never show the stale morning number where the score now speaks.
            if zone != .upcoming { pendingLine = nil }
            out.append(HomeSheetRow(
                id: "sheet-\((g.league ?? "").uppercased())-\(g.bdl_game_id.map(String.init) ?? "legacy-\(i)-\(full)")",
                gameID: g.bdl_game_id,
                zone: zone,
                league: (g.league ?? "").uppercased(),
                matchupFull: full,
                title: title,
                callLine: callLine,
                pendingLine: pendingLine,
                clockText: clockText,
                statusText: statusText,
                statusColor: statusColor,
                bigOne: bigOneModel.map { Self.homeBoardPick($0, matches: g) } ?? false,
                commence: g.commence_time ?? "",
                hitLines: hitLines
            ))
        }
        return out.sorted { $0.commence < $1.commence }
    }

    // ── The YOU tab (founder, Aug 20: "a You tab next to NFL... Covering
    // Sweating or Losing would match up with the actual result THEY took").
    // Same board, same row grammar — the verdict slot answers for the USER's
    // side: a fade inverts Gary's live standing, and a settled row reads the
    // server-graded user outcome straight off the bet.

    /// Their side's live standing: Gary's verdict, flipped when they faded him.
    private func youLiveStatus(_ bet: UserBet, verdicts: [HomeLiveVerdict]) -> (String, Color) {
        let isFade = bet.kind == "fade"
        let winning = verdicts.contains(isFade ? .trailing : .covering)
        let losing = verdicts.contains(isFade ? .covering : .trailing)
        if winning && !losing { return ("COVERING", GaryColors.win) }
        if losing && !winning { return ("LOSING", GaryColors.loss) }
        return ("SWEATING", GaryColors.sweating)
    }

    private var youSheetRows: [HomeSheetRow] {
        guard AppFlags.userBookEnabled, !myTodayBets.isEmpty else { return [] }
        var out: [HomeSheetRow] = []
        for (i, bet) in myTodayBets.enumerated() {
            // Board parity (founder, Aug 27: "literally the same view except
            // its the picks the person made") — no kind word, no extras; the
            // verdict slot already answers for THEIR side of the bet.
            let call = Self.homePickLabel(bet.pick_text)

            // Game tails/fades join the slate for the live score + verdict.
            let pick = bet.pick_type == "game"
                ? todayPicks.first(where: { ($0.pick ?? "") == bet.pick_text })
                : nil
            let matchupFull: String = {
                if let a = pick?.awayTeam, let h = pick?.homeTeam, !a.isEmpty, !h.isEmpty {
                    return "\(a) @ \(h)"
                }
                return bet.matchup ?? ""
            }()
            let lgUpper = (bet.league ?? pick?.league ?? "").uppercased()
            let commence = pick?.commence_time ?? bet.lock_at ?? ""
            let ls: LiveScore? = matchupFull.isEmpty ? nil
                : sheetLive(matchupFull, league: lgUpper, gameID: pick?.game_id, commence: commence)

            var zone: HomeSheetRow.Zone = .upcoming
            // A prop slip whose game the slate can't name still gets a real
            // title — the player it rides — never a bare league word.
            var title: String = {
                if matchupFull.isEmpty {
                    return (bet.player_name?.uppercased()).flatMap { $0.isEmpty ? nil : $0 } ?? lgUpper
                }
                let sides = matchupFull.components(separatedBy: " @ ")
                return sides.count == 2
                    ? "\(Self.teamAbbrev(sides[0], league: lgUpper)) @ \(Self.teamAbbrev(sides[1], league: lgUpper))"
                    : matchupFull
            }()
            var clockText: String? = nil
            var statusText = ""
            var statusColor = Color.white.opacity(0.62)

            if bet.status == "won" {
                zone = .settled
                clockText = "FINAL"
                if let score = ls?.scoreLine { title = score.uppercased() }
                statusText = AppFlags.storeSafe ? "✓ WON" : "✓ CASHED"
                statusColor = GaryColors.win
            } else if bet.status == "lost" {
                zone = .settled
                clockText = "FINAL"
                if let score = ls?.scoreLine { title = score.uppercased() }
                statusText = "✗ LOST"
                statusColor = GaryColors.loss
            } else if bet.status == "push" || bet.status == "void" {
                zone = .settled
                clockText = "FINAL"
                statusText = bet.status.uppercased()
                statusColor = GaryColors.gold
            } else if let ls, ls.isLive, let pick {
                zone = .live
                title = ls.scoreLine ?? title
                clockText = "▶ \((ls.detail ?? "LIVE").uppercased())"
                let (word, color) = youLiveStatus(bet, verdicts: [HomeLiveVerdict.evaluate(pick: pick, live: ls)])
                statusText = word
                statusColor = color
            } else if let ls, ls.isFinal {
                zone = .settled
                title = ls.scoreLine ?? title
                clockText = "FINAL"
                statusText = "SETTLING"
                statusColor = Color.white.opacity(0.55)
            } else if let d = parseISO8601(commence) {
                statusText = Self.etClock(d)
            } else {
                statusText = "OPEN"
            }

            out.append(HomeSheetRow(
                id: "you-\(bet.id)-\(i)",
                gameID: pick?.game_id,
                zone: zone,
                league: lgUpper,
                matchupFull: matchupFull,
                title: title,
                callLine: call,
                pendingLine: nil,
                clockText: clockText,
                statusText: statusText,
                statusColor: statusColor,
                bigOne: false,
                commence: commence,
                hitLines: []
            ))
        }
        return out.sorted { a, b in
            a.zone == b.zone ? a.commence < b.commence : zoneRank(a.zone) < zoneRank(b.zone)
        }
    }

    private func zoneRank(_ z: HomeSheetRow.Zone) -> Int {
        switch z {
        case .live: return 0
        case .upcoming: return 1
        case .interrupted: return 2
        case .settled: return 3
        }
    }

    /// Cashed-prop events -> render lines: "IBRAHIM GOAL 15'", "ATTIA ASSIST",
    /// "PEDRI CARDED", "JUDGE HR x2", "WITT STEAL", "SKENES 8 KS".
    static func liveHitStrings(_ ls: LiveScore) -> [String] {
        (ls.events ?? []).compactMap { ev in
            guard let p = ev.p, !p.isEmpty else { return nil }
            switch ev.k {
            case "goal":   return ["\(p) GOAL", ev.d].compactMap { $0 }.joined(separator: " ")
            case "assist": return "\(p) ASSIST"
            case "card":   return "\(p) CARDED"
            case "hr":     return ["\(p) HR", ev.d].compactMap { $0 }.joined(separator: " ")
            case "sb":     return "\(p) STEAL"
            case "hits":   return "\(p) \(ev.d ?? "2+ HITS")"
            case "ks":     return "\(p) \(ev.d ?? "")"
            default:       return nil
            }
        }
    }

    /// "Over 2.5 -105" -> "OVER 2.5", "Argentina -1.5 -105" -> "ARGENTINA -1.5"
    /// — on the Home lines only a MONEYLINE keeps its price, because there the
    /// price IS the pick (founder, Jul 7). Totals and goal/run lines drop it.
    private static func homePickLabel(_ pick: String?) -> String {
        let parts = Formatters.splitPickAndOdds(Formatters.arrowizeOverUnder(pick ?? ""))
        let name = parts.0.uppercased()
        let isTotal = name.hasPrefix("OVER") || name.hasPrefix("UNDER")
        let hasLine = name.split(separator: " ").contains { w in
            (w.hasPrefix("+") || w.hasPrefix("-")) && (Double(w).map { abs($0) <= 30 } ?? false)
        }
        return (parts.1.isEmpty || isTotal || hasLine) ? name : "\(name) \(parts.1)"
    }

    /// The day's big games joined with Gary's picks + the live board — the
    /// MARQUEE tracker's feed, ranked by the pipeline (todayBoard.big_games).
    /// A same-day All-Star special rides in too (see `specialMarqueeEntry`) so
    /// the hero never falls through to TOMORROW while tonight's bigger event
    /// is still ahead — one ranked pool, one "up next," never wrong (founder,
    /// Jul 14: "i hate fallback designs... just have the app work").
    private var marqueeEntries: [HomeMarqueeTracker.Entry] {
        let bigs = todayBoard?.big_games ?? []
        let bigEntries: [HomeMarqueeTracker.Entry] = bigs.isEmpty ? [] : bigs.compactMap { big -> HomeMarqueeTracker.Entry? in
            guard let matchup = big.matchup, matchup.contains(" @ ") else { return nil }
            let sides = matchup.components(separatedBy: " @ ")
            let away = sides[0], home = sides.count > 1 ? sides[1] : ""
            let title = "\(Self.shortTeam(away)) @ \(Self.shortTeam(home))"
            let calls = todayPicks.filter {
                Self.homeBoardPick($0, league: big.league, gameID: big.bdl_game_id,
                                   away: away, home: home)
            }
            let pickLine: String? = calls.isEmpty ? nil : calls
                .map { Self.homePickLabel($0.pick) }
                .joined(separator: "  ·  ")
            // No "PICK ~x:xx" line on the countdown hero (founder, Jul 27) —
            // the container tightens by exactly that row until the pick lands.
            let pendingLine: String? = nil
            let ls = sheetLive(matchup, league: big.league ?? "", gameID: big.bdl_game_id,
                               commence: big.commence_time)
            let storedRows = sheetResults(
                for: matchup,
                away: away,
                home: home,
                league: (big.league ?? "").uppercased(),
                gameID: big.bdl_game_id
            )
            let verdicts = calls.map { p in ls.map { HomeLiveVerdict.evaluate(pick: p, live: $0) } ?? .neutral }
            var result: (String, Color)? = nil
            if let ls, ls.isFinal {
                let cashed = verdicts.filter { $0 == .covering }.count
                let lost = verdicts.filter { $0 == .trailing }.count
                if cashed > 0 && lost == 0 { result = (AppFlags.storeSafe ? "✓ WON" : "✓ CASHED", GaryColors.win) }
                else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                else { result = ("FINAL", Color.white.opacity(0.7)) }
            } else if !storedRows.isEmpty {
                // The marquee ribbon shares the sheet's durable grades. A
                // transient final-score row may disappear overnight, but the
                // CASHED/LOST stamp must remain everywhere until the 6am roll.
                let outcomes: [String] = calls.compactMap { call in
                    if let stored = sheetStoredOutcome(for: call, in: storedRows) { return stored }
                    if calls.count == 1, storedRows.count == 1 {
                        return storedRows.first?.result?.lowercased()
                    }
                    return nil
                }
                let cashed = outcomes.filter { ["won", "win", "w"].contains($0) }.count
                let lost = outcomes.filter { ["lost", "loss", "l"].contains($0) }.count
                let pushed = outcomes.filter { ["push", "p"].contains($0) }.count
                if cashed > 0 && lost == 0 { result = (AppFlags.storeSafe ? "✓ WON" : "✓ CASHED", GaryColors.win) }
                else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                else if pushed > 0 { result = ("PUSH", GaryColors.gold) }
                else { result = ("FINAL", Color.white.opacity(0.7)) }
            }
            // MLB shows BOTH probable starters, away @ home — WC (and any
            // league without structured pitcher fields) keeps the existing
            // context/standing line untouched.
            let mlbPitchers: String? = {
                guard (big.league ?? "").uppercased() == "MLB",
                      let a = big.awayPitcher, !a.isEmpty,
                      let h = big.homePitcher, !h.isEmpty else { return nil }
                return "\(a.uppercased()) @ \(h.uppercased())"
            }()
            // Tonight's market, straight off the day board — the bottom row
            // carries real betting info instead of a third clock (founder, Jul 12).
            let bRow = todayBoard?.board.first { br in
                let sameLeague = (br.league ?? "").uppercased() == (big.league ?? "").uppercased()
                guard sameLeague else { return false }
                if let gameID = big.bdl_game_id {
                    return br.bdl_game_id == gameID
                }
                // Legacy big-game rows have no provider id. Match the same
                // teams AND start bucket; never borrow the other DH market.
                guard let bigStart = big.commence_time.flatMap(parseISO8601),
                      let boardStart = br.commence_time.flatMap(parseISO8601) else { return false }
                return Self.shortTeam(br.away_team).caseInsensitiveCompare(Self.shortTeam(away)) == .orderedSame
                    && Self.shortTeam(br.home_team).caseInsensitiveCompare(Self.shortTeam(home)) == .orderedSame
                    && Int(bigStart.timeIntervalSince1970 / 1800) == Int(boardStart.timeIntervalSince1970 / 1800)
            }
            let slateInterruption = (ls == nil || ls?.status?.lowercased() == "scheduled")
                ? bRow?.interruptionLabel : nil
            if ls?.isInterrupted == true || slateInterruption != nil { result = nil }
            var oddsBits: [String] = []
            if let a = bRow?.ml_away, let h = bRow?.ml_home,
               let aAb = bRow?.away_abbr, let hAb = bRow?.home_abbr {
                let f: (Double) -> String = { $0 > 0 ? "+\(Int($0))" : "\(Int($0))" }
                oddsBits.append("\(aAb) \(f(a)) · \(hAb) \(f(h))")
            }
            if let t = bRow?.total {
                oddsBits.append("O/U \(t == t.rounded() ? String(Int(t)) : String(t))")
            }
            // The run line (founder, Jul 26): the favorite's spread off the
            // board. The row stores the line only — no price is invented.
            if let s = bRow?.spread, s != 0,
               let aAb = bRow?.away_abbr, let hAb = bRow?.home_abbr {
                let fav = s < 0 ? hAb : aAb
                let line = -abs(s)
                oddsBits.append("RL \(fav) \(line == line.rounded() ? String(Int(line)) : String(line))")
            }
            return HomeMarqueeTracker.Entry(
                id: "mq-\(Self.homeMarqueeGameKey(league: big.league, gameID: big.bdl_game_id, matchup: matchup, commence: big.commence_time) ?? "rank:\(big.rank):\(matchup)")",
                rank: big.rank,
                league: big.league,
                matchupFull: matchup,
                title: title,
                context: mlbPitchers ?? (big.context?.isEmpty == false ? big.context : big.standing),
                commence: big.commence_time,
                pickLine: pickLine,
                pendingLine: pendingLine,
                oddsLine: oddsBits.isEmpty ? nil : oddsBits.joined(separator: " · "),
                live: ls,
                verdict: verdicts.first,
                result: result,
                slateInterruptionLabel: slateInterruption
            )
        }
        // HERO FILLERS (founder, Aug 4: the countdown counts to the NEXT game
        // to start TODAY — tomorrow's tease only once today is truly done).
        // Every slate game not already a big game becomes hero-eligible at
        // rank 99 (soonest wins the hero; rank only breaks ties) but never a
        // ribbon chip (railWorthy=false keeps the rail big-games-only).
        let bigKeys: Set<String> = Set(bigs.compactMap { big -> String? in
            guard let matchup = big.matchup else { return nil }
            return Self.homeMarqueeGameKey(league: big.league, gameID: big.bdl_game_id,
                                            matchup: matchup, commence: big.commence_time)
        })
        let fillers: [HomeMarqueeTracker.Entry] = (todayBoard?.board ?? []).compactMap { br -> HomeMarqueeTracker.Entry? in
            guard let a = br.away_team, let h = br.home_team else { return nil }
            let matchup = "\(a) @ \(h)"
            let boardKey = Self.homeMarqueeGameKey(league: br.league, gameID: br.bdl_game_id,
                                                   matchup: matchup, commence: br.commence_time)
            guard boardKey.map({ !bigKeys.contains($0) }) ?? true else { return nil }
            let calls = todayPicks.filter { p in
                if let gameID = br.bdl_game_id {
                    return p.game_id == gameID
                        && (p.league ?? "").uppercased() == (br.league ?? "").uppercased()
                }
                return Self.homeBoardPick(p, league: br.league, gameID: nil, away: a, home: h)
            }
            let fillerLive = sheetLive(matchup, league: br.league ?? "", gameID: br.bdl_game_id,
                                       commence: br.commence_time)
            let storedRows = sheetResults(for: matchup, away: a, home: h,
                                          league: (br.league ?? "").uppercased(),
                                          gameID: br.bdl_game_id)
            let verdicts = calls.map { p in
                fillerLive.map { HomeLiveVerdict.evaluate(pick: p, live: $0) } ?? .neutral
            }
            let slateInterruption = (fillerLive == nil || fillerLive?.status?.lowercased() == "scheduled")
                ? br.interruptionLabel : nil
            var result: (String, Color)? = nil
            if fillerLive?.isInterrupted != true, slateInterruption == nil {
                if fillerLive?.isFinal == true {
                    let cashed = verdicts.filter { $0 == .covering }.count
                    let lost = verdicts.filter { $0 == .trailing }.count
                    if cashed > 0 && lost == 0 { result = (AppFlags.storeSafe ? "✓ WON" : "✓ CASHED", GaryColors.win) }
                    else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                    else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                    else { result = ("FINAL", Color.white.opacity(0.7)) }
                } else if !storedRows.isEmpty {
                    let outcomes: [String] = calls.compactMap { call in
                        if let stored = sheetStoredOutcome(for: call, in: storedRows) { return stored }
                        if calls.count == 1, storedRows.count == 1 { return storedRows.first?.result?.lowercased() }
                        return nil
                    }
                    let cashed = outcomes.filter { ["won", "win", "w"].contains($0) }.count
                    let lost = outcomes.filter { ["lost", "loss", "l"].contains($0) }.count
                    let pushed = outcomes.filter { ["push", "p"].contains($0) }.count
                    if cashed > 0 && lost == 0 { result = (AppFlags.storeSafe ? "✓ WON" : "✓ CASHED", GaryColors.win) }
                    else if lost > 0 && cashed == 0 { result = ("✗ LOST", GaryColors.loss) }
                    else if cashed > 0 && lost > 0 { result = ("✓✗ SPLIT", GaryColors.gold) }
                    else if pushed > 0 { result = ("PUSH", GaryColors.gold) }
                    else { result = ("FINAL", Color.white.opacity(0.7)) }
                }
            }
            var oddsBits: [String] = []
            if let ml = br.ml_away, let mh = br.ml_home, let aAb = br.away_abbr, let hAb = br.home_abbr {
                let f: (Double) -> String = { $0 > 0 ? "+\(Int($0))" : "\(Int($0))" }
                oddsBits.append("\(aAb) \(f(ml)) · \(hAb) \(f(mh))")
            }
            if let t = br.total {
                oddsBits.append("O/U \(t == t.rounded() ? String(Int(t)) : String(t))")
            }
            return HomeMarqueeTracker.Entry(
                id: "mq-fill-\(boardKey ?? "legacy:\(matchup):\(br.commence_time ?? "")")",
                rank: 99,
                league: br.league,
                matchupFull: matchup,
                title: "\(Self.shortTeam(a)) @ \(Self.shortTeam(h))",
                context: nil,
                commence: br.commence_time,
                pickLine: calls.isEmpty ? nil : calls.map { Self.homePickLabel($0.pick) }.joined(separator: "  ·  "),
                pendingLine: nil,
                oddsLine: oddsBits.isEmpty ? nil : oddsBits.joined(separator: " · "),
                live: fillerLive,
                verdict: verdicts.first,
                result: result,
                slateInterruptionLabel: slateInterruption,
                railWorthy: false
            )
        }
        return bigEntries + fillers + [specialMarqueeEntry].compactMap { $0 }
    }

    /// A same-day All-Star special — a real MARQUEE candidate, not just a
    /// banner. Rank 0 so it outranks any leftover today game once it's the
    /// biggest thing left (matches the takeover's own framing: this IS the
    /// week's marquee event). Deliberately NOT gated on "still in the future"
    /// — Entry's own upNext/started logic already handles that transition, so
    /// the entry ages into a "▶ STARTED" ribbon chip like any other game
    /// instead of vanishing at kickoff and dropping the hero right back to
    /// the wrong tomorrow fallback it exists to prevent.
    /// The specials pipeline (`run-allstar-specials.js`) never sets a real
    /// `commence_time` on these picks, only a display clock (`time`, e.g.
    /// "8:00 PM") — so this prefers commence_time if it's ever added, and
    /// otherwise rebuilds today's ET date from that clock string. No usable
    /// time at all → no synthetic entry, never a countdown to nothing.
    private var specialMarqueeEntry: HomeMarqueeTracker.Entry? {
        let featured = allStarSpecials.first { $0.game_id == 20260713 || $0.game_id == 8712499 } ?? allStarSpecials.first
        guard let featured else { return nil }
        let ct: String
        if let real = featured.commence_time, parseISO8601(real) != nil {
            ct = real
        } else if let clock = featured.time, let d = Self.todayET(atClock: clock) {
            ct = ISO8601DateFormatter().string(from: d)
        } else {
            return nil
        }
        let away = featured.awayTeam ?? "AL", home = featured.homeTeam ?? "NL"
        let count = allStarSpecials.count
        return HomeMarqueeTracker.Entry(
            id: "asg-\(featured.game_id ?? 0)",
            rank: 0,
            league: featured.league ?? "MLB",
            matchupFull: "\(away) @ \(home)",
            title: "\(Self.shortTeam(away)) @ \(Self.shortTeam(home))",
            context: nil,
            commence: ct,
            pickLine: "GARY'S BOARD — \(count) PICK\(count == 1 ? "" : "S") · PICKS TAB",
            pendingLine: nil,
            oddsLine: nil,
            live: nil,
            verdict: nil,
            result: nil
        )
    }

    /// Tomorrow's #1 big game — the look-ahead row once today's marquee is done.
    /// NAMES, NOT CODES (founder, Aug 4): the card has the room, so it reads
    /// "White Sox @ Red Sox" instead of "CHW @ BOS" — abbreviations are the
    /// queue's grammar, not the hero's. Carries the real start Date so the
    /// hero can tick down to first pitch instead of printing a static clock.
    private var marqueeTomorrowTease: (matchup: String, time: String, start: Date?)? {
        guard let big = tomorrowBoard?.big_games.first, let m = big.matchup else { return nil }
        let sides = m.components(separatedBy: " @ ")
        let title = sides.count == 2
            ? "\(Formatters.shortTeamName(sides[0], league: big.league)) @ \(Formatters.shortTeamName(sides[1], league: big.league))"
            : m
        return (title,
                TomorrowView.etTime(big.commence_time, withZone: false, meridiem: true).uppercased(),
                big.commence_time.flatMap(parseISO8601))
    }

    /// The sheet body — EARLIER (collapsed past), LIVE (glowing middle),
    /// TONIGHT (the queue, grouped by league, countdown on the header line).
    @ViewBuilder private var homeSheet: some View {
        // ONE BOARD (founder, Aug 3: live games were splitting out of the
        // board into their own section — "it should all stay in the board
        // view"): every game holds its slate slot all day; the row itself
        // rolls scheduled time → live verdict → the stamp in place.
        let rows = sheetRows
            .filter { HomeBoardLeague(rawValue: $0.league) != nil && $0.league != HomeBoardLeague.you.rawValue }
            .sorted { $0.commence < $1.commence }
        let youRows = youSheetRows
        let available: Set<HomeBoardLeague> = {
            var set = Set(rows.compactMap { HomeBoardLeague(rawValue: $0.league) })
            // YOUR slate rides the same board as its own tab (founder, Aug 20)
            // — present only when the signed-in user has bets down today.
            if !youRows.isEmpty { set.insert(.you) }
            return set
        }()
        // An explicit tap is final — MLB/NFL render their own (possibly
        // empty) board. Only YOU still snaps away when it has no rows: that
        // tab HIDES entirely without bets, so it can never sit selected.
        // Before any tap, the in-season league auto-leads as always.
        let selected: HomeBoardLeague = {
            if userPickedBoardLeague && selectedHomeBoardLeague != .you { return selectedHomeBoardLeague }
            if selectedHomeBoardLeague == .you && available.contains(.you) { return .you }
            return available.contains(selectedHomeBoardLeague)
                ? selectedHomeBoardLeague
                : (available.contains(.mlb) ? .mlb : .nfl)
        }()

        if !rows.isEmpty || !youRows.isEmpty {
            // The countdown/marquee-to-board boundary is neutral chrome. A
            // green rule read like a graded win and changed color mid-slate.
            HomeSectionRule(tint: GaryColors.warmWhite)
            homeSheetPanel(selected == .you ? youRows : rows.filter { $0.league == selected.rawValue },
                           selected: selected,
                           available: available)
        }
    }

    private func homeSheetPanel(_ rows: [HomeSheetRow], selected: HomeBoardLeague,
                                available: Set<HomeBoardLeague>) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(HomeBoardLeague.allCases, id: \.self) { league in
                    // The YOU tab exists only when the user has bets down
                    // today — an empty personal slate never renders a dead tab.
                    // MLB/NFL are ALWAYS tappable (founder, Aug 24): a
                    // disabled tab didn't consume the touch, so tapping "NFL"
                    // on an MLB-only day fell through and read as a jump to
                    // the Picks page. An empty league now selects normally
                    // and the panel says "no games" in its own words.
                    if league != .you || available.contains(.you) {
                        Button {
                            userPickedBoardLeague = true
                            selectedHomeBoardLeague = league
                        } label: {
                            Text(league.rawValue)
                                .font(.system(size: 12.5, weight: .bold).monospacedDigit())
                                .tracking(1.4)
                                .foregroundStyle(league == selected
                                    ? GaryColors.gold
                                    : Color.white.opacity(0.62))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(league == selected ? .isSelected : [])
                    }
                }
            }
            // A selected league with no slate says so in place — the tab
            // switch always lands ON the board, never anywhere else. When the
            // fetched look-ahead board carries this league's games TOMORROW,
            // they show right here (founder, Aug 26: "show me the games that
            // are upcoming even if that isn't today") — real rows only, never
            // an invented schedule for days the board hasn't reached.
            if rows.isEmpty {
                let upcoming = selected == .you ? [] : (tomorrowBoard?.board ?? [])
                    .filter { ($0.league ?? "").uppercased() == selected.rawValue }
                if upcoming.isEmpty {
                    Text("NO \(selected.rawValue) GAMES TODAY")
                        .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                        .tracking(1.4)
                        .foregroundStyle(Color.white.opacity(0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 22)
                } else {
                    Text("NEXT \(selected.rawValue) GAMES — TOMORROW")
                        .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                        .tracking(1.4)
                        .foregroundStyle(Color.white.opacity(0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.top, 16)
                        .padding(.bottom, 6)
                    ForEach(Array(upcoming.enumerated()), id: \.offset) { i, r in
                        HStack(spacing: 8) {
                            Text("\(r.away_abbr ?? r.away_team ?? "") @ \(r.home_abbr ?? r.home_team ?? "")")
                                .font(.system(size: 13.5, weight: .bold).monospacedDigit())
                                .foregroundStyle(Color.white.opacity(0.85))
                            Spacer(minLength: 8)
                            if let ml = r.ml_away ?? r.ml_home {
                                Text(ml > 0 ? "+\(Int(ml))" : "\(Int(ml))")
                                    .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                                    .foregroundStyle(Color.white.opacity(0.55))
                            }
                            Text(r.commence_time.map { TomorrowView.etTime($0, withZone: false, meridiem: true).uppercased() } ?? "TIME TBD")
                                .font(.system(size: 12.5, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Color.white.opacity(0.55))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        if i < upcoming.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, 14)
                        }
                    }
                    Color.clear.frame(height: 10)
                }
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                Button {
                    guard !r.matchupFull.isEmpty else { return }
                    PicksFocusState.shared.focus(game: r.matchupFull,
                                                 league: r.league,
                                                 gameID: r.gameID)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 3 }
                } label: {
                    HomeSheetRowView(row: r)
                }
                .buttonStyle(.plain)
                if i < rows.count - 1 {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, 14)
                }
            }
            // THE RECORD rides INSIDE the board card (founder, Aug 19: "put
            // the stuff above it inside of the board at the end, so it's all
            // wrapped up") — the board's own bottom line, behind one divider.
            // On the YOU tab the bottom line is THEIR day, not Gary's —
            // wearing the SAME scorecard as the league lanes, fixed shape
            // from 0–0 (founder, Aug 27: "we need the record and 0 like
            // MLB NFL NCAAF have"; the "YOUR DAY n OPEN" line is gone).
            if selected == .you {
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                youScorecard
                    .padding(.horizontal, 14).padding(.vertical, 12)
            } else if gamesNightRecord.w + gamesNightRecord.l + gamesNightRecord.p > 0
                || recapLabel == "LIVE" || recapLabel == "TODAY" {
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                scorecard
                    .padding(.horizontal, 14).padding(.vertical, 12)
            }
        }
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                // Self-contained card: adapts its own FILL for the ground
                // (surface doctrine). Home always stands on THE FLOOR now, and
                // this board only renders here — solid, unconditionally. (It
                // cannot read `solidPanels`: HomeView sets that env on its own
                // subtree, and a view never sees its own environment writes.)
                .fill(GaryColors.panelFillOpaque)
                // The lit rim replaces the gold whisper (founder, Aug 19: the
                // board gets the exact headline-card float — the gold outline
                // read flat next to the light-caught cards above it).
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(LinearGradient(stops: [
                        .init(color: GaryColors.warmWhite.opacity(0.16), location: 0),
                        .init(color: GaryColors.warmWhite.opacity(0.06), location: 0.35),
                        .init(color: GaryColors.warmWhite.opacity(0.025), location: 1),
                    ], startPoint: .top, endPoint: .bottom), lineWidth: 1))
                // Floating over THE FLOOR (Aug 19) — the shadow puddle darkens
                // the grid beneath, so the board hovers instead of sitting flat.
                .shadow(color: .black.opacity(0.55), radius: 18, y: 10)
                .shadow(color: .black.opacity(0.65), radius: 4, y: 2)
        )
        .pageGutter()
    }

    /// The YOU tab's bottom line — the SAME scorecard the league lanes wear,
    /// answered with the user's own day. Fixed shape from 0–0, the numbers
    /// fill in as their bets grade; tapping opens the Billfold on YOU.
    private var youScorecard: some View {
        Button {
            UserDefaults.standard.set("you", forKey: "billfoldScope")
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
        } label: {
            let settled = myTodayBets.filter { ["won", "lost", "push"].contains($0.status) }
            let w = settled.filter { $0.status == "won" }.count
            let l = settled.filter { $0.status == "lost" }.count
            let p = settled.filter { $0.status == "push" }.count
            HStack(spacing: 0) {
                scoreCell(Self.recordLine(w, l, p), recapLabel, .white.opacity(0.92))
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                if AppFlags.storeSafe {
                    scoreCell(w + l > 0 ? "\(Int((Double(w) / Double(w + l) * 100).rounded()))%" : "—",
                              "WIN RATE", .white.opacity(0.92))
                } else {
                    // Their book's own unit size drives the dollars — the cell
                    // grammar stays the board's, the stake basis stays true.
                    let netUnits = settled.reduce(0.0) { $0 + ($1.units_net ?? 0) }
                    let net = netUnits * BookMoney.unitDollars
                    scoreCell(Formatters.flatStakeDollars(net),
                              "NET · $\(Int(BookMoney.unitDollars))/PICK",
                              settled.isEmpty ? .white.opacity(0.92)
                                              : (net >= 0 ? GaryColors.win : GaryColors.loss))
                    Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                    let best = settled.compactMap { $0.units_net }.filter { $0 > 0 }.max()
                        .map { $0 * BookMoney.unitDollars }
                    if let best, best > 0 {
                        scoreCell("+\(Int(best))", "BEST CASH", GaryColors.gold)
                    } else {
                        scoreCell("—", "BEST CASH", .white.opacity(0.35))
                    }
                }
            }
            .pageGutter()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Tonight extras — the bettor's read on the DAY

    /// The night's marquee game — the pick the pipeline tagged with stakes
    /// ("NBA FINALS GM 2", "DIVISION LEAD ON THE LINE").
    private var bigOneModel: GaryPick? {
        todayPicks
            .filter { !(($0.shortGameSignificance ?? $0.gameSignificance) ?? "").isEmpty }
            .sorted { ($0.commence_time ?? "") < ($1.commence_time ?? "") }
            .first
    }

    /// The Hub's top reads for tonight — the pre-bet checklist, full board
    /// one tap away.
    /// "Cubs W7 · Judge 16-game hit streak · 9 more live" — the Edges row's
    /// one-line read on the league's open runs.
    private var streaksHeadline: String? {
        guard !homeStreaks.isEmpty else { return nil }
        var bits: [String] = []
        // W/L kinds only — team rows also carry over/under runs, and an
        // 8-game UNDER must never print as "W8" (the Streak Watch TEAMS split).
        if let t = homeStreaks.filter({ $0.subject_type == "team" && ["win", "loss"].contains($0.kind ?? "") })
            .max(by: { ($0.length ?? 0) < ($1.length ?? 0) }) {
            bits.append("\(Self.shortTeam(t.subject)) \(t.kind == "loss" ? "L" : "W")\(t.length ?? 0)")
        }
        if let h = homeStreaks.filter({ $0.kind == "hit" })
            .max(by: { ($0.length ?? 0) < ($1.length ?? 0) }) {
            bits.append("\(Self.shortTeam(h.subject)) \(h.length ?? 0)-game hit streak")
        }
        guard !bits.isEmpty else { return nil }
        let more = homeStreaks.count - bits.count
        if more > 0 { bits.append("\(more) more live") }
        return bits.joined(separator: " · ")
    }

    /// "28 of 46 hit · 61%" — yesterday's tally for the fallback header.
    private var ydayEdgesSub: String {
        guard let r = edgesHitRate, r.graded > 0 else { return "Yesterday · graded" }
        let pct = Int((Double(r.hit) / Double(r.graded) * 100).rounded())
        return "Yesterday · \(r.hit) of \(r.graded) hit · \(pct)%"
    }

    private var tonightEdgesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "Edges",
                             sub: !tonightSignals.isEmpty ? "Today's board · graded in the morning" : ydayEdgesSub)
            VStack(spacing: 0) {
                if let sh = streaksHeadline {
                    Button {
                        HubFocusState.shared.focusLane = .streak
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 2 }
                    } label: {
                        HStack(spacing: 10) {
                            Text("STREAKS")
                                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                                .foregroundStyle(GaryColors.gold.opacity(0.75))
                                .frame(width: 86, alignment: .leading)
                            Text(sh)
                                .font(.system(size: 12.5))
                                .foregroundStyle(.white.opacity(0.8))
                                .lineLimit(2)
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if !tonightSignals.isEmpty || !ydayEdges.isEmpty {
                        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                    }
                }
                let edgeRows = !tonightSignals.isEmpty ? tonightSignals : Array(ydayEdges.prefix(6))
                ForEach(Array(edgeRows.enumerated()), id: \.element.id) { i, s in
                    Button {
                        // Land on this row's LANE in the Hub — there's more
                        // than one heat check; the Hub breaks it down.
                        HubFocusState.shared.focusLane = s.kind
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 2 }
                    } label: {
                        HStack(spacing: 10) {
                            Text(s.kind.chip)
                                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                                .foregroundStyle(GaryColors.gold.opacity(0.75))
                                .frame(width: 86, alignment: .leading)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(s.headline)
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(.white.opacity(0.8))
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                // Graded rows carry the night's stat line.
                                if s.result != nil, let note = s.resultNote, !note.isEmpty {
                                    Text(note)
                                        .font(GaryFonts.mono(10.5))
                                        .foregroundStyle(.white.opacity(0.55))
                                        .lineLimit(1).minimumScaleFactor(0.85)
                                }
                            }
                            Spacer(minLength: 8)
                            if let result = s.result {
                                Text(result == "hit" ? "HIT" : result == "push" ? "PUSH" : "MISS")
                                    .font(GaryFonts.mono(10, bold: true)).tracking(0.6)
                                    .foregroundStyle(result == "hit" ? GaryColors.win
                                                     : result == "push" ? GaryColors.gold
                                                     : GaryColors.loss)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if i < edgeRows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                    }
                }
            }
            .quantPanel()
            .pageGutter()
        }
    }

    // MARK: - Home state switcher (Morning / Pre-game)

    // The matte-capsule, gold-active-pill switcher — TODAY · LIVE · TOMORROW.
    // This is the SAME chrome the locked Morning page used for its
    // Morning·Pre-game·Live switcher (CLAUDE.md: "matte capsule, gold active
    // pill"): a slim single-line segmented control — a faint matte capsule
    // track with a gold pill sliding under the active label. No chunky stacked
    // sub-counts (founder call); LIVE keeps a small red dot when games are on.
    //   TODAY    = the full merged Home page (morning before noon ET, pregame
    //             after) — drives selectedPhase off the `phase` clock, untouched.
    //   LIVE     = the existing live state, verbatim.
    //   TOMORROW = the look-ahead body.

    /// Which pill currently reads as active. LIVE was retired (founder call):
    /// Today already evolves to lead with the live tape/takeover once games tip
    /// off, so a standalone Live tab was redundant. The switcher is TODAY ·
    /// TOMORROW.
    private enum SwitcherPill { case today, tomorrow }
    private var activePill: SwitcherPill {
        switch selectedPhase {
        case .morning, .pregame, .live: return .today
        case .tomorrow:                 return .tomorrow
        }
    }

    // The text + gold-underline tab strip (matches the Picks page game tabs):
    // plain labels, the active one white/bold over a gold underline bar, the
    // rest grey with no underline. Replaces the old matte-capsule pill.
    private var phaseSwitcher: some View {
        // Rides the masthead's trailing slot — no gutter or trailing spacer
        // of its own (the header line owns the layout).
        HStack(spacing: 22) {
            switcherTab("TODAY", pill: .today)
            switcherTab("TOMORROW", pill: .tomorrow)
        }
    }

    // (liveFormInline removed Jul 6 — founder: records crowded the nav row.
    // dailyForm plumbing kept: the per-sport live record wants a new home.)

    private func switcherTab(_ label: String, pill: SwitcherPill) -> some View {
        let on = activePill == pill
        return Button {
            // TODAY drives selectedPhase off the live/clock state so the merged
            // Today page leads with the live tape whenever games are on, the
            // results-first morning stack otherwise.
            let target: HomePhase = (pill == .today) ? phase : .tomorrow
            if reduceMotion { selectedPhase = target }
            else { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { selectedPhase = target } }
        } label: {
            // Color IS the state (founder, Aug 6 night): the active day wears
            // gold, the other waits dim — no underline hardware.
            Text(label)
                .font(GaryFonts.mono(12.5, bold: on)).tracking(0.6)
                .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.4))
                .fixedSize()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
    }

    // MARK: - Live joins (tape / takeover / slate)

    /// Gary's pick for a live-score row, if tonight's board has one.
    /// game_id FIRST so a doubleheader (same teams, two games in one night) attaches
    /// to the RIGHT game; the fuzzy team match is only the fallback when an id is missing.
    private func pickFor(_ live: LiveScore) -> GaryPick? {
        // O(1) game_id hit (the common path, doubleheader-safe); fuzzy team match
        // only when the row/pick has no id.
        if let gid = live.game_id, let exact = picksByGameId[gid] { return exact }
        return todayPicks.first { p in
            abbrGameMatches(live.abbrGame, matchup: "\(p.awayTeam ?? "") @ \(p.homeTeam ?? "")")
        }
    }

    private func verdictFor(_ live: LiveScore) -> HomeLiveVerdict {
        guard let pick = pickFor(live) else { return .neutral }
        return HomeLiveVerdict.evaluate(pick: pick, live: live)
    }

    /// Tape cells: every game Gary has a side in plus anything live, live
    /// games first.
   static func buildDailyFormBySport(games: [GameResult], live: [LiveScore],
                                      slateDay: String, anchor: String?,
                                      sports: [String] = ["MLB", "NFL", "NCAAF", "WC"]) -> [DailyFormCell] {
        func tally(_ day: String?, _ league: String) -> (Int, Int, Int) {
            guard let day = day else { return (0, 0, 0) }
            var w = 0, l = 0, p = 0
            for r in games.countable where r.game_date == day && (r.league ?? "").uppercased() == league {
                switch (r.result ?? "").lowercased() {
                case "won", "win", "w":   w += 1
                case "lost", "loss", "l": l += 1
                case "push", "p":         p += 1
                default: break
                }
            }
            return (w, l, p)
        }
        var cells: [DailyFormCell] = []
        for sport in sports {
            if AppFlags.hidesWorldCupRow(sport) { continue }
            let liveNow = live.contains { $0.isLive && ($0.league ?? "").uppercased() == sport }
            let (tw, tl, tp) = tally(slateDay, sport)
            // Flip to today the moment this sport's games are LIVE (underway) OR have
            // graded — so MLB reads 0-0 LIVE once tonight's games start, not last
            // night's record. Only holds last night when today hasn't started yet.
            // ALWAYS today's slate-day record — 0-0 until tonight's games grade, LIVE
            // once underway. Resets at the 6am ET slate roll. No more holding last
            // night's record, which lingered stale all the next day (founder Jul 1:
            // "MLB should be 0-0 since no MLB games are live for today").
            cells.append(DailyFormCell(league: sport, wins: tw, losses: tl, pushes: tp,
                                       state: liveNow ? .live : .today))
        }
        return cells
    }


   // Jul 9 2026 fix: this used to take the raw last word ("Boston Red Sox"
   // and "Chicago White Sox" both collapsed to "Sox" — the exact "SOX / SOX"
   // bug on the Members Only seal card). Delegates to the one correct,
   // two-word-mascot-aware implementation instead of re-deriving it here.
   static func shortTeam(_ name: String?) -> String {
        guard let name, !name.isEmpty else { return "—" }
        return Formatters.shortTeamName(name)
    }

   static func propUnit(_ type: String?) -> String {
        let t = (type ?? "").lowercased()
        if t.contains("total_bases") || t.contains("total bases") { return "TB" }
        if t.contains("strikeout") { return "K" }
        if t.contains("home_run") || t.contains("home run") { return "HR" }
        if t.contains("hits_runs_rbis") { return "H+R+RBI" }
        if t.contains("rbi") { return "RBI" }
        if t.contains("hit") { return "H" }
        if t.contains("run") { return "R" }
        if t.contains("point") { return "PTS" }
        if t.contains("rebound") { return "REB" }
        if t.contains("assist") { return "AST" }
        if t.contains("three") { return "3PT" }
        if t.contains("shots_on_goal") { return "SOG" }
        if t.contains("goal") { return "G" }
        if t.contains("save") { return "SV" }
        return String(t.prefix(3)).uppercased()
    }

    static func trimNum(_ s: String) -> String {
        s.hasSuffix(".0") ? String(s.dropLast(2)) : s
    }

    // MARK: - ② The Scorecard

    /// Yesterday as three big readable numbers. No icons, no emoji, no
    /// caption sentence — data graphics only.
    private func scoreCell(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(GaryFonts.mono(24, bold: true))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(maxWidth: .infinity)
    }

    // June 5: caption sentence removed — the numbers speak for themselves
    // (user feedback: no editorial one-liners in the UI).
    private var scorecard: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 }
        } label: {
            // ALL THREE CELLS, ALL DAY (founder, Aug 5: "I want this look to
            // be for when the games actually go live"). The band used to
            // collapse to a lone record while the day was live, because net
            // and best cash only mounted once they had values — so the live
            // state was a different, thinner object than the settled one.
            // Now the shape is fixed from 0–0 and the numbers fill in
            // underneath it as games land.
            HStack(spacing: 0) {
                // Window named once, leftmost — every cell in this row is the
                // same slate (feedback: unlabeled windows next to the form
                // lane's L10 numbers read contradictory).
                scoreCell(Self.recordLine(gamesNightRecord.w, gamesNightRecord.l, gamesNightRecord.p),
                          recapLabel, .white.opacity(0.92))
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                if AppFlags.storeSafe {
                    // STORE-SAFE BRIDGE: accuracy, not money — win% beside the
                    // record, and no cash cells (founder, Aug 11: "W-L + win%
                    // only"). The dash holds until something grades.
                    let settled = gamesNightRecord.w + gamesNightRecord.l
                    scoreCell(settled > 0 ? "\(Int((Double(gamesNightRecord.w) / Double(settled) * 100).rounded()))%" : "—",
                              "WIN RATE", .white.opacity(0.92))
                } else {
                    // Nothing graded yet reads as a flat $0, not a blank: the day
                    // starts even and the number moves from there.
                    let net = gamesNightNet ?? 0
                    scoreCell(Formatters.flatStakeDollars(net), "NET · $100/PICK",
                              gamesNightNet == nil ? .white.opacity(0.92)
                                                   : (net >= 0 ? GaryColors.win : GaryColors.loss))
                    Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 34)
                    // Best cash has no honest zero — before a winner lands there
                    // simply isn't a biggest one yet, so the slot holds its place
                    // with a dash rather than claiming +0.
                    if let best = gamesNightBest, best > 0 {
                        scoreCell("+\(Int(best))", "BEST CASH", GaryColors.gold)
                    } else {
                        scoreCell("—", "BEST CASH", .white.opacity(0.35))
                    }
                }
            }
            .pageGutter()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - ⑤ Tonight's Board

    private var boardSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !tonightCarouselPicks.isEmpty {
                // Tonight's board — swipeable, one card at a time: the top 3 plays
                // per sport with the marquee FREE pick leading. (Replaces the old
                // vertically-stacked free pick + prop.)
                tonightPicksHeader
                tonightPicksCarousel
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    if !loading, let yPick = yesterdayTopPick {
                        // Until today's pick posts, yesterday's free pick holds
                        // the slot — wearing its W/L stamp, so it reads as the
                        // last result, never as tonight's play.
                        Text("LAST NIGHT'S FREE PICK")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.62))
                        FlippablePickCard(pick: yPick, gameResult: yesterdayTopPickResult,
                                          finalScore: yesterdayTopPickScore, showSportBadge: true)
                    } else if !loading {
                        Text("Tonight's plays post closer to first pitch.")
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.62))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 22).padding(.horizontal, 18)
                            .quantPanel()
                    } else if loading {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small).tint(GaryColors.gold.opacity(0.7))
                            Text("Loading tonight's plays…")
                                .font(.system(size: 13))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 26).padding(.horizontal, 18)
                        .quantPanel()
                        .accessibilityLabel("Loading tonight's plays")
                    }
                    // The lone graded prop only when there's no fresh pick at all.
                    if !loading, freePick == nil, let yProp = yesterdayTopProp {
                        FlippablePropCard(prop: yProp, gameResult: yesterdayTopPropResult, showSportBadge: true)
                    }
                }
                .pageGutter()
            }
        }
    }

    private var tonightPicksHeader: some View {
        HStack {
            Text("TONIGHT'S TOP PLAYS")
                .font(GaryFonts.mono(9.5, bold: true)).tracking(1.2)
                .foregroundStyle(.white.opacity(0.62))
            Spacer()
            if tonightCarouselPicks.count > 1 {
                Text("SWIPE \u{2192}")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold.opacity(0.55))
            }
        }
        .pageGutter()
    }

    /// Tonight's swipeable board: the top 3 game picks per sport (by confidence),
    /// the marquee FREE pick pulled to the front. Sports lead with the free pick's
    /// league, then follow first-appearance order.
    private var tonightCarouselPicks: [GaryPick] {
        // Selection (unchanged): the strongest few per league, by confidence.
        var groups: [String: [GaryPick]] = [:]
        for p in todayPicks { groups[p.league ?? "", default: []].append(p) }
        var selected: [GaryPick] = []
        for (_, ps) in groups {
            selected.append(contentsOf: ps.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.prefix(3))
        }
        // Order (user call, Jun 18): LIVE games first, then upcoming by start time
        // (earliest game up next), and GRADED/FINAL games sink to the very back —
        // so as each game kicks off it stays in front, then finishes and drops back,
        // surfacing the next game's picks. No free-pick-first override; a finished
        // free pick belongs at the back like any other.
        let live = LiveScoreCache.shared
        func bucket(_ p: GaryPick) -> Int {
            let mu = "\(p.awayTeam ?? "") @ \(p.homeTeam ?? "")"
            guard let ls = live.status(forMatchup: mu) else { return 1 } // unknown → treat as upcoming
            if ls.isFinal { return 2 }
            if ls.isLive { return 0 }
            return 1
        }
        func start(_ p: GaryPick) -> Date {
            if let iso = p.commence_time, let d = parseISO8601(iso) { return d }
            return .distantFuture
        }
        return selected.sorted {
            let (a, b) = (bucket($0), bucket($1))
            return a != b ? a < b : start($0) < start($1)
        }
    }

    @ViewBuilder private var tonightPicksCarousel: some View {
        let cardW = UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12)   // a sliver of the next card peeks
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(tonightCarouselPicks) { pick in
                    FlippablePickCard(pick: pick,
                                      eyebrowOverride: pick.id == freePick?.id ? "FREE PICK" : nil,
                                      gameResult: nil, showSportBadge: true)
                        .frame(width: cardW)
                }
                if let prop = freeProp {
                    FlippablePropCard(prop: prop, showSportBadge: true)
                        .frame(width: cardW)
                }
            }
            .pageGutter()
        }
    }

    // MARK: - ⑥ Footer

    private var footer: some View {
        SocialLinksBar()
            .pageGutter()
    }

    // MARK: - Front-page builders (template-only, no AI)

    private static func recordLine(_ w: Int, _ l: Int, _ p: Int) -> String {
        p > 0 ? "\(w)–\(l)–\(p)" : "\(w)–\(l)"
    }

    /// Gary's recent form — last 10 graded game picks as W/L/P pips
    /// (oldest→newest), the current streak, flat-stake net, and hit rate.
    /// Uses BillfoldCompute so the math matches the Billfold exactly.
    /// Nil until at least three results have settled.
    private static func buildForm(games: [GameResult]) -> HomeGarysForm.Model? {
        let graded = games.countable
            .filter { ["won", "lost", "push"].contains($0.result ?? "") }
            .sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }   // newest first
        guard graded.count >= 3 else { return nil }
        let window = Array(graded.prefix(10))                          // newest first
        let net = window.reduce(0.0) { $0 + BillfoldCompute.units(for: $1.result, odds: $1.effectiveOdds) }
        let winRate = Int(BillfoldCompute.winRate(from: window.map { $0.result }).rounded())
        let pips = window.reversed().map { r -> String in              // oldest → newest
            switch r.result {
            case "won":  return "W"
            case "lost": return "L"
            case "push": return "P"
            default:     return "·"
            }
        }
        // Current streak over decisive results (pushes skipped).
        let decisive = window.compactMap { $0.result }.filter { $0 == "won" || $0 == "lost" }
        var streak = ""
        var streakWin = false
        if let top = decisive.first {
            streakWin = (top == "won")
            var count = 0
            for r in decisive { if r == top { count += 1 } else { break } }
            streak = (streakWin ? "W" : "L") + "\(count)"
        }
        _ = pips; _ = winRate
        // The editorial headline — the card decides what the data MEANS
        // instead of rendering the same dataset four ways. Streak + last-10
        // net resolve into one sentence in Gary's frame.
        let decisiveCount = { () -> Int in
            guard let top = decisive.first else { return 0 }
            var c = 0
            for r in decisive { if r == top { c += 1 } else { break } }
            return c
        }()
        let story: String
        if streakWin && decisiveCount >= 3 {
            story = net < 0 ? "Cold week, hot hand — \(decisiveCount) straight wins."
                            : "\(decisiveCount) straight wins, in the green."
        } else if !streak.isEmpty && !streakWin && decisiveCount >= 3 {
            story = net >= 0 ? "\(decisiveCount) down in a row, still up on the week."
                             : "Cold stretch — \(decisiveCount) straight losses."
        } else if streakWin && decisiveCount == 2 {
            story = "Finding it — back-to-back wins."
        } else {
            story = net >= 0 ? "Choppy week, but green." : "Choppy week, in the red."
        }
        // The rail carries the whole graded history (drag left for older).
        let allPips = graded.prefix(46).reversed().map { r -> String in
            switch r.result {
            case "won":  return "W"
            case "lost": return "L"
            case "push": return "P"
            default:     return "·"
            }
        }
        return HomeGarysForm.Model(pips: Array(allPips), story: story,
                                   net: net, total: graded.count)
    }

    /// "2026-06-02" -> "Jun 2"
    private static func prettyDate(_ s: String) -> String {
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let parts = s.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), (1...12).contains(m), let d = Int(parts[2]) else { return s }
        return "\(months[m - 1]) \(d)"
    }

    private static func shiftDate(_ s: String, by days: Int) -> String? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        // The day arithmetic must run in EST too — Calendar.current uses the DEVICE
        // tz, so off-EST (or on a DST boundary) it could shift to the wrong slate
        // date and the Tomorrow/Day-Ahead board would fetch an empty/next-day key.
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        guard let d = f.date(from: s),
              let shifted = cal.date(byAdding: .day, value: days, to: d) else { return nil }
        return f.string(from: shifted)
    }

    /// Tomorrow's EST slate day (todayEST + 1) — the key the Tomorrow board is
    /// written under.
    private static func tomorrowSlateDateEST() -> String {
        shiftDate(SupabaseAPI.todayEST(), by: 1) ?? SupabaseAPI.todayEST()
    }

    /// Flat-stake units P/L for one graded play (1u to win odds-implied).
    private static func unitsDelta(odds: Double, result: String) -> Double {
        switch result {
        case "won": return odds > 0 ? odds / 100.0 : (odds < 0 ? 100.0 / abs(odds) : 0)
        case "lost": return -1
        default: return 0
        }
    }

    /// "+270" / "-110" — odds as bettors read them.
    private static func oddsLabel(_ o: Double) -> String {
        o > 0 ? "+\(Int(o))" : "\(Int(o))"
    }

    private static func resultOdds(_ odds: StringOrNumber?, pickText: String?) -> Double {
        if let v = Double(odds?.value ?? "") { return v }
        return Double(Formatters.splitPickAndOdds(pickText).1) ?? -110
    }

    /// Standard abbreviation for a team name via the league keyword maps.
    private static func teamAbbrev(_ name: String, league: String?) -> String {
        let lower = name.lowercased()
        let maps: [[String: [String]]]
        switch (league ?? "").uppercased() {
        case "MLB": maps = [mlbTeamKeywords]
        case "NBA": maps = [nbaTeamKeywords]
        case "NHL": maps = [nhlTeamKeywords]
        case "NFL", "NFL TDS": maps = [nflTeamKeywords]
        case "WC": maps = [wcTeamKeywords]
        default: maps = [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords, wcTeamKeywords]
        }
        for map in maps {
            for (ab, kws) in map where kws.contains(where: { lower.contains($0) }) { return ab }
        }
        let last = lower.split(separator: " ").last.map(String.init) ?? lower
        return String(last.prefix(3)).uppercased()
    }

    /// One pass over the latest settled night: the marquee story (biggest
    /// cash, or the owned miss), the Biggest Cashes rows, and net units.
    /// All template — honesty is the brand, so the net includes the losses.
    private static func buildLastNight(games: [GameResult], props: [PropResult], includeToday: Bool = true)
        -> (story: HomeMarqueeHero.Story?, marqueeGame: GameResult?, cashes: [HomeCashesSection.Row], rollCashes: [HomeCashesSection.Row], beat: HomeCashesSection.Row?, net: Double, graded: Int, bestOdds: Double?, record: (w: Int, l: Int, p: Int)) {

        // Preseason football never enters the recap/record math — the rows
        // stay graded on their own pick surfaces (founder law, Aug 21 2026).
        let settledGames = games.countable.filter { $0.result == "won" || $0.result == "lost" || $0.result == "push" }
        let settledProps = props.filter { $0.result == "won" || $0.result == "lost" || $0.result == "push" }
        let days = settledGames.compactMap { $0.game_date } + settledProps.compactMap { $0.game_date }
        guard !days.isEmpty else { return (nil, nil, [], [], nil, 0, 0, nil, (0, 0, 0)) }
        // "Last night" = the most recent COMPLETED EST slate day. game_date already carries
        // the ET slate day a game STARTED on — a late west-coast game that finishes after
        // midnight UTC still keeps its ET day (verified Jun 18: Angels@Athletics graded
        // 10:34 UTC Jun 19, yet game_date = 2026-06-18). So we take exactly ONE day, no UTC-
        // rollover merge. Exclude TODAY so this morning's early games (a WC dawn kickoff)
        // never leak into yesterday's recap; an empty/off day falls back to the prior slate.
        let today = SupabaseAPI.todayEST()
        // includeToday=true: ROLLING recap — the scorecard/prop box build out of yesterday into
        // today as today's picks grade (label tracks the day). includeToday=false: yesterday-only,
        // for the once-a-day recap pop-up (never this morning's partial slate).
        let candidate = includeToday ? Set(days) : Set(days).filter { $0 < today }
        guard let anchor = candidate.max() else { return (nil, nil, [], [], nil, 0, 0, nil, (0, 0, 0)) }
        let nightSet: Set<String> = [anchor]
        let nightGames = settledGames.filter { nightSet.contains($0.game_date ?? "") }
        let nightProps = settledProps.filter { nightSet.contains($0.game_date ?? "") }

        // Net units + cash rows across games AND props.
        var net = 0.0
        var bestOdds: Double? = nil
        var cashes: [HomeCashesSection.Row] = []
        for g in nightGames {
            let o = resultOdds(g.odds, pickText: g.pick_text)
            net += unitsDelta(odds: o, result: g.result ?? "")
            if g.result == "won" {
                bestOdds = max(bestOdds ?? -Double.infinity, o)
                cashes.append(.init(id: "g-\(g.matchup ?? "")-\(g.pick_text ?? "")",
                                    title: Self.gameCashTitle(g),
                                    sub: Formatters.splitPickAndOdds(g.pick_text).0,
                                    units: unitsDelta(odds: o, result: "won"),
                                    odds: Self.oddsLabel(o), league: g.league))
            }
        }
        for p in nightProps {
            let o = resultOdds(p.odds, pickText: p.pick_text)
            net += unitsDelta(odds: o, result: p.result ?? "")
            if p.result == "won" {
                bestOdds = max(bestOdds ?? -Double.infinity, o)
                // Sub = the NIGHT ("3 TB on the night"), never the player's
                // name again — the title already says who.
                let actual = Self.trimNum(p.actual_value?.value ?? "")
                let unit = Self.propUnit(p.prop_type)
                cashes.append(.init(id: "p-\(p.player_name ?? "")-\(p.pick_text ?? "")",
                                    title: Formatters.propResultTitle(p),
                                    sub: actual.isEmpty ? (p.matchup ?? "") : "\(actual) \(unit) on the night",
                                    units: unitsDelta(odds: o, result: "won"),
                                    odds: Self.oddsLabel(o), league: p.league))
            }
        }
        cashes.sort { $0.units > $1.units }
        // The strip's roller wants EVERY big cash — captured before the rail's
        // per-league dedup below, which leaves exactly ONE item on a one-sport
        // night (an all-MLB slate) and froze the roll (founder, Jul 13).
        let rollCashes = Array(cashes.prefix(6))
        // Sport variety — keep the biggest cash PER league so one hot sport can't
        // sweep the whole Hits & heartbreakers rail (user ask).
        var seenLeagues = Set<String>()
        cashes = cashes.filter { seenLeagues.insert($0.league ?? "?").inserted }
        let graded = nightGames.count + nightProps.count
        // ONE ledger for the scorecard: record, net, and best cash all count
        // the same set (games + props) — three cells, one truth.
        var recW = 0, recL = 0, recP = 0
        for r in (nightGames.map { $0.result } + nightProps.map { $0.result }) {
            switch r { case "won": recW += 1; case "lost": recL += 1; case "push": recP += 1; default: break }
        }
        let record = (w: recW, l: recL, p: recP)

        // The worst beat — the loss that stung most: the biggest favorite that
        // didn't hold (most-negative odds among the night's graded game losses).
        let beat: HomeCashesSection.Row? = nightGames
            .filter { $0.result == "lost" }
            .min { resultOdds($0.odds, pickText: $0.pick_text) < resultOdds($1.odds, pickText: $1.pick_text) }
            .map { g in
                let o = resultOdds(g.odds, pickText: g.pick_text)
                return HomeCashesSection.Row(
                    id: "beat-\(g.matchup ?? "")-\(g.pick_text ?? "")",
                    title: Self.gameCashTitle(g),
                    sub: Formatters.splitPickAndOdds(g.pick_text).0,
                    units: unitsDelta(odds: o, result: "lost"),
                    odds: Self.oddsLabel(o), league: g.league)
            }

        // The marquee — the priority league leads (a Finals game outranks
        // the MLB slate whatever the odds said), biggest odds break ties.
        func pri(_ r: GameResult) -> Int { LeaguePriority.rank(r.effectiveLeague) }
        let wins = nightGames.filter { $0.result == "won" }
        let star = wins.min { a, b in
            if pri(a) != pri(b) { return pri(a) < pri(b) }
            return resultOdds(a.odds, pickText: a.pick_text) > resultOdds(b.odds, pickText: b.pick_text)
        }
        let subject = star ?? nightGames.filter { $0.result == "lost" }
            .min { a, b in
                if pri(a) != pri(b) { return pri(a) < pri(b) }
                return abs(resultOdds(a.odds, pickText: a.pick_text)) > abs(resultOdds(b.odds, pickText: b.pick_text))
            }
        guard let r = subject else { return (nil, nil, Array(cashes.prefix(3)), rollCashes, beat, net, graded, bestOdds, record) }

        let cashed = r.result == "won"
        let o = resultOdds(r.odds, pickText: r.pick_text)
        let pickLine = Formatters.splitPickAndOdds(r.pick_text).0
        let story = HomeMarqueeHero.Story(
            league: r.effectiveLeague ?? "",
            headline: Self.gameHeadline(r, cashed: cashed),
            sub: Self.gameSubLine(r),
            receiptLead: cashed ? (AppFlags.storeSafe ? "Gary Won ·" : "Gary Cashed ·") : "Gary Had ·",
            receiptPick: Formatters.arrowizeOverUnder(pickLine).uppercased(),
            // STORE-SAFE BRIDGE: no odds in the verdict stamp.
            verdict: cashed ? (AppFlags.storeSafe ? AppFlags.wonStamp : (o > 0 ? "CASHED +\(Int(o))" : "CASHED")) : "LOST",
            cashed: cashed)
        return (story, r, Array(cashes.prefix(3)), rollCashes, beat, net, graded, bestOdds, record)
    }

    /// "Knicks over the Spurs, 105–95" — a real game headline from facts.
    private static func gameHeadline(_ r: GameResult, cashed: Bool) -> String {
        if let (away, home, a, h) = Self.scoreParts(r) {
            let winner = a > h ? away : home
            let loser = a > h ? home : away
            // Clubs take "the" (Knicks over the Spurs); national teams don't (Switzerland over Canada).
            let article = (r.league ?? "").uppercased().contains("WC") ? "" : "the "
            return "\(winner) over \(article)\(loser), \(max(a, h))–\(min(a, h))"
        }
        let pick = Formatters.splitPickAndOdds(r.pick_text).0
        return cashed ? "\(pick) cashed" : "\(pick) didn't land"
    }

    /// "Knicks @ Spurs · Final 105–95"
    private static func gameSubLine(_ r: GameResult) -> String {
        var bits: [String] = []
        if let (away, home, _, _) = Self.scoreParts(r) { bits.append("\(away) @ \(home)") }
        else if let m = r.matchup { bits.append(m) }
        if let fs = r.final_score, !fs.isEmpty { bits.append("Final \(fs)") }
        return bits.joined(separator: " · ")
    }

    /// "PHI 6 – 4 NYM · Final" cash-row title, falling back to short names.
    private static func gameCashTitle(_ g: GameResult) -> String {
        if let (away, home, a, h) = Self.scoreParts(g) {
            let lg = g.effectiveLeague
            return "\(teamAbbrev(away, league: lg)) \(a) – \(h) \(teamAbbrev(home, league: lg))"
        }
        return g.matchup ?? "Graded win"
    }

    /// Split "Away Team @ Home Team" + "5-4" into short names + scores.
    private static func scoreParts(_ r: GameResult) -> (away: String, home: String, a: Int, h: Int)? {
        guard let m = r.matchup else { return nil }
        let teams = m.components(separatedBy: " @ ")
        guard teams.count == 2 else { return nil }
        let away = Formatters.shortTeamName(teams[0], league: r.effectiveLeague)
        let home = Formatters.shortTeamName(teams[1], league: r.effectiveLeague)
        let nums = (r.final_score ?? "").components(separatedBy: CharacterSet(charactersIn: "-–"))
            .compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard nums.count == 2 else { return nil }
        return (away, home, nums[0], nums[1])
    }

    /// Per-lane records from the graded ledger — HR Threats lead when present
    /// (the flagship fun lane), the rest by graded volume. Capped at 4.
    private static func buildReceiptLanes(_ rows: [SupabaseAPI.InsightLedgerRow]) -> [HomeReceiptsSection.LaneRecord] {
        let meta: [String: (String, String)] = [
            "gary_hr_threats": ("HR Threats", "flame"),
            "heat_check": ("Heat Checks", "chart.line.uptrend.xyaxis"),
            "platoon_edge": ("Platoon Edges", "arrow.left.arrow.right"),
            "regression_watch": ("Regression Watch", "chart.line.downtrend.xyaxis"),
            "ballpark": ("Ballpark Shifts", "building.columns"),
            "ballpark_shift": ("Ballpark Shifts", "building.columns"),
            "cooling_off": ("Cooling Off", "snowflake"),
            "owned": ("Owned Matchups", "person.fill.checkmark"),
            "beneficiary": ("Beneficiaries", "arrow.triangle.2.circlepath"),
            "rest_fatigue": ("Rest & Fatigue", "zzz"),
            "streak": ("Streaks", "bolt"),
            "tournament": ("Tournament Stakes", "trophy"),
            "situational": ("Situational", "scope"),
        ]
        var agg: [String: (hit: Int, miss: Int)] = [:]
        for r in rows {
            guard let c = r.category, let res = r.result else { continue }
            var a = agg[c] ?? (0, 0)
            if res == "hit" { a.hit += 1 } else if res == "miss" { a.miss += 1 }
            agg[c] = a
        }
        var lanes: [HomeReceiptsSection.LaneRecord] = agg.compactMap { key, rec in
            guard rec.hit + rec.miss > 0 else { return nil }
            let m = meta[key] ?? (key.split(separator: "_").map { $0.capitalized }.joined(separator: " "), "circle.grid.2x2")
            return .init(id: key, name: m.0, icon: m.1, hits: rec.hit, misses: rec.miss)
        }
        lanes.sort { a, b in
            if (a.id == "gary_hr_threats") != (b.id == "gary_hr_threats") { return a.id == "gary_hr_threats" }
            return (a.hits + a.misses) > (b.hits + b.misses)
        }
        return Array(lanes.prefix(4))
    }
}
