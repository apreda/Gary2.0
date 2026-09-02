// WinnersView.swift — Premium Picks (the Winners tab).
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Premium Picks (paywalled "best bets" — the Winners tab)
//
// Gary's highest-conviction plays, sold per sport through Stripe Payment
// Links. Entitlements live in Supabase (user_entitlements), keyed to the
// signed-in auth user — or the anonymous install when nobody's signed in.
// The storefront tail sells locked boards; PaywallPanel sells All-Access.

/// Normalized identity of a game pick WITHIN its matchup — the pick text minus
/// any trailing American-odds token — so multiple picks on ONE game don't collide
/// on a matchup-only result key. (The WC side-+-total feature ships two picks per
/// match: e.g. "Egypt ML -175" AND "Under 2.5 -125". A matchup-only map kept only
/// the last-written one, so the Under read the ML's result → a LOST pick showed
/// CASHED.) `GameResult.pick_text` is written from the pick's own `.pick` — verified
/// byte-identical across daily_picks and game_results — so the same normalization
/// on the result (build) side and the pick (lookup) side aligns them. Odds are the
/// volatile part; the side/total/line is the stable identity that disambiguates.
func garyGamePickSig(_ pickText: String?) -> String {
    var s = (pickText ?? "").lowercased()
    s = s.replacingOccurrences(of: #"\s*[+-]\d{2,}\s*$"#, with: "", options: .regularExpression)
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// A game-result map key that disambiguates multiple picks on one matchup. Build
/// side passes the result's matchup key + `pick_text`; lookup side passes the
/// pick's matchup key + `.pick`. Both resolve to the same string.
func garyGameResultKey(matchupKey: String, pickText: String?) -> String {
    "\(matchupKey)|\(garyGamePickSig(pickText))"
}

/// Winners slot curation (founder call, Jul 23 2026): the Winners card is a
/// DAY OF ACTION, not a confidence leaderboard. Slots do different jobs for
/// the fan's day and now only ORDER the card — the edge-rail color cue that
/// used to voice them came off Aug 6 (founder: "what are those little green
/// and white stripes? remove those"), taking the `tone` palette with it.
enum WinnersSlot: Int {
    case anchor = 0    // highest conviction on the board
    case dog = 1       // the plus-money sweat
    case marquee = 2   // the day's biggest game (pipeline-ranked big_games)
    case nightcap = 3  // the latest start — carries action into the evening
}

/// Team abbreviation for the day-card seal timeline ("PHI 5:10") — the league
/// keyword maps first, mascot prefix as the fallback.
func winnersTeamAbbr(_ team: String?) -> String {
    guard let t = team?.lowercased(), !t.isEmpty else { return "—" }
    for map in [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords] {
        for (abbr, kws) in map where kws.contains(where: { t.contains($0) }) { return abbr }
    }
    let last = t.split(separator: " ").last.map(String.init) ?? t
    return String(last.prefix(3)).uppercased()
}

/// The trust band — Gary's last-10 graded record per league, always on the
/// board (Aug 3 2026: the core product page sold conviction without ever
/// showing the record; wins AND losses sell it honestly). Taps to Billfold.
struct WinnersRecordBand: View {
    let records: [(league: String, w: Int, l: Int)]
    let onLedger: () -> Void
    var body: some View {
        if !records.isEmpty {
            HStack(spacing: 12) {
                Text("LAST 10")
                    .font(GaryFonts.accent(10)).tracking(1)
                    .foregroundStyle(GaryColors.gold)
                ForEach(records, id: \.league) { r in
                    HStack(spacing: 5) {
                        Text(r.league)
                            .font(GaryFonts.mono(10)).foregroundStyle(GaryColors.meta)
                        Text("\(r.w)–\(r.l)")
                            .font(GaryFonts.mono(11, bold: true))
                            .foregroundStyle(r.w > r.l ? GaryColors.win : .white.opacity(0.85))
                    }
                }
                Spacer(minLength: 8)
                Button(action: onLedger) {
                    HStack(spacing: 4) {
                        Text("FULL LEDGER")
                            .font(GaryFonts.mono(10, bold: true))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 7, weight: .bold))
                    }
                    .foregroundStyle(GaryColors.gold)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
        }
    }
}

struct PremiumPicksView: View {
    // Dev/QA all-access preview — overrides entitlements while testing.
    @AppStorage("isPremiumUnlocked") private var isPremium: Bool = false
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    /// Observe the live-score cache so cards flip to live/final without a relaunch.
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// Deep-link from Home's LIVE FORM: jump to a tapped sport's shelf.
    @ObservedObject private var picksFocus = PicksFocusState.shared

    @State private var loading = true
    /// At least one Winners source failed during the latest load. Healthy
    /// sports still render, while this flag prevents a missing desk from being
    /// described as an honest empty/coming-soon board.
    @State private var boardDataFailed = false
    // Per-sport shelves: each sport shows TODAY's pick if it has one, else its last graded result.
    @State private var gameShelves: [GameShelf] = []
    @State private var propShelves: [PropShelf] = []
    /// Which Winners slot each of today's curated game picks fills (pick.id →
    /// slot) — drives the wordless edge-rail cue and the shelf's slot order.
    @State private var winnersSlotMap: [String: WinnersSlot] = [:]
    /// Leagues whose board is the reviewer's rows today (Sep 2 2026) — their
    /// shelf never pads to a promised count; the board is what it is.
    @State private var reviewedLeagues: Set<String> = []
    // Real per-league game count from today's slate — lets the pre-post
    // "coming soon" state show the actual shelf shape (N sealed placeholders
    // per league) instead of a generic fixed count (founder, Jul 6: match
    // the populated board's layout, just with coming-soon wrapper words).
    @State private var todaySlateCounts: [String: Int] = [:]
    /// Today's full slate rows (teams + start times) — the day card's manifest
    /// and seal timeline. Counts alone can't say WHEN the card seals.
    @State private var todaySlateRows: [DailySlateRow] = []
    @State private var gameResultsMap: [String: String] = [:]   // "away@home" -> won/lost/push
    @State private var gameScoresMap: [String: String] = [:]    // same key -> "away-home" final score
    @State private var matchupScoresMap: [String: String] = [:] // matchup-only key -> final (props share the game's score)
    @State private var propResultsMap: [String: String] = [:]   // player name -> won/lost/push

    // Terminal Tape: GAMES <-> PROPS mode (props are a peer, one tap away — not buried below games).
    enum Mode { case games, props }
    @State private var mode: Mode = .games
    /// Winners date browser (user call, Jun 16): nil = today's live board; a past
    /// date (≤60 days back) loads that day's picks, all settled with CASHED/LOST
    /// stamps + flip-backs — the deep transparency surface for Gary's track record.
    @State private var selectedDate: String? = nil
    /// Coming-soon popup: dismissed → collapses to a compact top strip, cards stay.

    // Per-sport entitlements, granted by the Stripe webhook and keyed to the
    // auth user (or this install when signed out). isPremium stays as the
    // all-access dev/QA preview toggle.
    @State private var entitledSports: Set<String> = []
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var authManager: AuthManager
    @State private var showAuthSheet = false
    // Plans sheet (the pricing page). Blurred previews open it focused on
    // their sport; checkout/auth hand-offs run after it dismisses.
    @State private var showPlansSheet = false
    @State private var plansFocus: String? = nil
    @State private var pendingCheckout: String? = nil
    @State private var pendingBundle: [String]? = nil
    @State private var pendingAuth = false
    // Stripe checkout rides an IN-APP browser (SFSafariViewController) — US
    // App Store guideline 3.1.1 allows external purchases for digital goods
    // incl. in-app web views (post-Epic, verified June 2026). Apple Pay +
    // autofill work in SFSafariViewController; the user never leaves the app.
    @State private var checkoutItem: CheckoutItem? = nil
    /// 2.18 PAYWALL ON (Jul 2 2026, founder call): Winners boards gate behind
    /// Stripe checkout. The free slate (Picks tab) stays free — Winners is the
    /// paid conviction layer, per the Jun 8 pricing overhaul.
    // Jul 5 2026 (founder): shipping the update FREE — payments wait. Every
    // user gets the full members room (sealed cards, tap to reveal) "for a
    // good while." All checkout/entitlement logic stays intact behind this.
    /// Sep 1 2026 (co-founder ruling, marketing review): Winners stays free
    /// for everyone through September, and any device that first opened Gary
    /// before October 1 keeps it free for the rest of the season — the
    /// founding cohort. Installs after that date meet the paywall. The stamp
    /// and the date live in FoundingCohort (end of this file).
    static var freeLaunch: Bool { FoundingCohort.winnersFree }

    /// Dev/QA all-access — honored in DEBUG builds ONLY. A Release binary
    /// ignores the flag entirely, so defaults tampering (jailbreak, backup
    /// editing) can never unlock paid content in production.
    private var devAllAccess: Bool {
        #if DEBUG
        return isPremium
        #else
        return false
        #endif
    }
    private func sportUnlocked(_ lg: String) -> Bool {
        Self.freeLaunch || devAllAccess || entitledSports.contains("ALL") || entitledSports.contains(lg)
    }
    /// Stripe Payment Links, June 5 pricing: single sport $9.99/mo and
    /// All-Access monthly/annual plans. Debug builds sell TEST links
    /// (card 4242 4242 4242 4242);
    /// Release sells LIVE — real money. Same sports, same prices. The
    /// signed-in identity rides along as client_reference_id.
    #if DEBUG
    // fileprivate (not private): PlansSheetView gates its annual card on the
    // ALL_ANNUAL key existing — the card unhides itself per build flavor.
    static let checkoutLinks: [String: String] = [
        "MLB":   "https://buy.stripe.com/test_9B600kcnqgWRa9c3xWaIM08",
        "NBA":   "https://buy.stripe.com/test_6oUdRa87a0XT6X05G4aIM09",
        "NFL":   "https://buy.stripe.com/test_bJe5kEevyeOJ1CG1pOaIM0b",
        "NCAAF": "https://buy.stripe.com/test_5kQbJ25Z2gWR6X05G4aIM0c",
        // June 9 flip: $29.99/mo + $179/yr, both 7-day card-required trials.
        "ALL":        "https://buy.stripe.com/test_00w9AU2MQ8ql5SW0lKaIM0h",
        "ALL_ANNUAL": "https://buy.stripe.com/test_fZu14o0EI9up3KOgkIaIM0i",
    ]
    #else
    static let checkoutLinks: [String: String] = [
        "MLB":   "https://buy.stripe.com/4gM4gA3N69u1anqaObao800",
        "NBA":   "https://buy.stripe.com/8x2aEYcjCfSpdzC3lJao801",
        "NFL":   "https://buy.stripe.com/8x25kEgzS6hPgLO1dBao803",
        "NCAAF": "https://buy.stripe.com/bJe7sM97qeOleDG9K7ao804",
        // June 9 flip, LIVE: $29.99/mo + $179/yr, 7-day card-required trials
        // (webhook v10 maps both). The retired $34.99/3-day link
        // (buy.stripe.com/aFabJ21EY21z...) stays ACTIVE in Stripe until the
        // build that shipped it is gone — deactivate it post-release.
        "ALL":        "https://buy.stripe.com/9B6eVednG5dL0MQ09xao80a",
        "ALL_ANNUAL": "https://buy.stripe.com/3cI7sM4RagWtcvy3lJao80b",
    ]
    #endif
    private func openCheckout(_ league: String, surface: String = "storefront") {
        // Subscriptions need an owner — no checkout without an account
        // (cancel/manage requires identity; device-bound subs are a trap).
        guard authManager.isAuthenticated else {
            SupabaseAPI.logEvent("checkout_blocked_signin", ["sport": league, "surface": surface])
            showAuthSheet = true; return
        }
        guard let base = Self.checkoutLinks[league],
              let url = URL(string: "\(base)?client_reference_id=\(SupabaseAPI.identityId)") else { return }
        SupabaseAPI.logEvent("checkout_started", [
            "plan": league == "ALL" ? "all_access"
                  : (league == "ALL_ANNUAL" ? "all_access_annual" : "single"),
            "sport": league, "surface": surface,
        ])
        checkoutItem = CheckoutItem(url: url)
    }
    @State private var sportRecords: [String: (w: Int, l: Int)] = [:]

    // In-season / imminent sports shown as rows (placeholders when a sport has no pick yet).
    // Any extra league present in the data is appended automatically.
    // Every sport Gary actually covers — lanes hold placeholders off-slate.
    // (NHL, NCAAB and the World Cup left the pick engine Aug 27 / Jul 21 2026;
    // their rows stay readable in history but no shelf is ordered for them.)
    private let canonicalSports = ["MLB", "NBA", "NFL", "NCAAF"]
    // Sports with a props product. NCAAF is fail-closed upstream until its
    // verified market provider has a live key, but once lines are present its
    // cards belong on the same Winners prop shelf as every other sport.
    private let propSports = ["MLB", "NBA", "NFL", "NCAAF"]

    // MARK: - Terminal status / tab counts (all derived from loaded view state)

    private var gameCount: Int { gameShelves.filter { !$0.settled }.reduce(0) { $0 + $1.picks.count } }
    private var propCount: Int { propShelves.filter { !$0.settled }.reduce(0) { $0 + $1.props.count } }

    struct GameShelf: Identifiable {
        let league: String
        let picks: [GaryPick]   // empty => placeholder row
        let settled: Bool       // true => last result (show W/L stamps)
        var id: String { league }
    }
    struct PropShelf: Identifiable {
        let league: String
        let props: [PropPick]
        let settled: Bool       // true => yesterday's props (show W/L stamps)
        var id: String { league }
    }

    private var hasContent: Bool {
        gameShelves.contains { !$0.picks.isEmpty } || propShelves.contains { !$0.props.isEmpty }
    }
    /// Fresh = a pick for TODAY (settled == false, non-empty). Yesterday's
    /// last-result fallback (settled == true) and empty slate placeholders don't count.
    private var todayHasFreshPicks: Bool {
        gameShelves.contains { !$0.settled && !$0.picks.isEmpty }
        || propShelves.contains { !$0.settled && !$0.props.isEmpty }
    }
    /// On TODAY with nothing fresh yet, show the "board drops soon" state (blurred
    /// placeholder cards) instead of yesterday's results — those live under the date
    /// menu's Yesterday. A chosen past date always renders its own graded board.
    private var isTodayComingSoon: Bool {
        // The room's normal system every day (founder, Jul 13): before fresh
        // picks post, TODAY shows the coming-soon placeholder cards — never
        // yesterday's board, which lives under the date menu.
        selectedDate == nil && !todayHasFreshPicks
    }

    var body: some View {
        ZStack {
            LiquidGlassBackground(grainDensity: 0)

            GeometryReader { viewport in
                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        // Toggle scrolls WITH the page (unpinned) — pinning forced an
                        // opaque fill that could never match the gradient behind it.
                        LazyVStack(alignment: .leading, spacing: 0) {
                            header

                            if !loading && boardDataFailed {
                                winnersSourceFailureBanner
                            }

                            if loading {
                                HStack { Spacer(); ProgressView().tint(GaryColors.gold).scaleEffect(1.2); Spacer() }
                                    .padding(.top, 80)
                            } else if isTodayComingSoon {
                                comingSoonState
                            } else if !hasContent {
                                emptyState
                            } else {
                                // League jump bar retired (Jul 5 design review):
                                // styled like the GAMES/PROPS tabs one line up, it
                                // read as a second filter row and re-said what the
                                // shelf headers already say. Deep links still
                                // scroll via jumpToSport. (GAMES/PROPS now ride
                                // the single header line above.)
                                modeContent(minHeight: max(0, viewport.size.height - 210))
                                    .padding(.top, 8)
                                    .padding(.bottom, 120)
                            }
                        }
                    }
                    .refreshable { await reload() }
                    .onChange(of: picksFocus.focusSport) { _ in jumpToFocusSport(proxy) }
                    .onChange(of: loading) { _ in jumpToFocusSport(proxy) }
                }
            }
            StatusBarScrim()
        }
        .task { await reload() }
        .onChange(of: selectedTab) { tab in
            // Hidden tabs are prewarmed at launch. If that background task was
            // interrupted, entering Winners must make a fresh attempt instead
            // of leaving the cancelled load's empty placeholder on screen.
            if tab == 1 { Task { await reload() } }
        }
        .onGaryTour { verb, arg in
            switch verb {
            case "winners":
                let parts = arg.split(separator: " ").map(String.init)
                switch parts.first {
                case "props": withAnimation { mode = .props }
                case "games": withAnimation { mode = .games }
                case "today": withAnimation { selectedDate = nil }
                case "date": if parts.count > 1 { withAnimation { selectedDate = parts[1] } }
                // QA the free/member views without hunting the footer button.
                case "member": withAnimation { isPremium = true }
                case "free": withAnimation { isPremium = false }
                default: break
                }
            case "plans": showPlansSheet = true
            case "auth": showAuthSheet = true
            default: break
            }
        }
        .onChange(of: selectedDate) { _ in Task { await reload() } }
        .onChange(of: scenePhase) { phase in
            // Returning from Stripe checkout — pick up new grants; and silently
            // re-pull today's board (a chosen past date stays static).
            if phase == .active {
                Task { entitledSports = await SupabaseAPI.fetchEntitlements() }
                if selectedDate == nil { Task { await reload() } }
            }
        }
        .onChange(of: authManager.isAuthenticated) { _ in
            // Sign-in/out swaps the identity entitlements key on — refetch.
            Task { entitledSports = await SupabaseAPI.fetchEntitlements() }
        }
        .sheet(isPresented: $showAuthSheet) { AuthView(startInSignUp: true) }
        .sheet(isPresented: $showPlansSheet, onDismiss: {
            if pendingAuth { pendingAuth = false; showAuthSheet = true }
            if let lg = pendingCheckout { pendingCheckout = nil; openCheckout(lg, surface: "paywall_sheet") }
            if let bundle = pendingBundle { pendingBundle = nil; openBundleCheckout(bundle) }
        }) {
            PlansSheetView(focus: plansFocus,
                           signedIn: authManager.isAuthenticated,
                           onSelect: { lg in pendingCheckout = lg; showPlansSheet = false },
                           onBundle: { lgs in pendingBundle = lgs; showPlansSheet = false },
                           onAccount: { pendingAuth = true; showPlansSheet = false })
        }
        .sheet(item: $checkoutItem, onDismiss: {
            // In-app checkout doesn't background the app, so scenePhase never
            // fires — pick up fresh grants the moment the sheet closes.
            Task { entitledSports = await SupabaseAPI.fetchEntitlements() }
        }) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .onAppear {
            // Debug arg (-previewPlans 1): jump straight to the plans sheet —
            // same family as -forceTab / -previewPhase. DEBUG-only: in a
            // release build the plans sheet (external Stripe checkout) must
            // be unreachable while freeLaunch is on (App Store 3.1.1).
            #if DEBUG
            if UserDefaults.standard.bool(forKey: "previewPlans") { showPlansSheet = true }
            #endif
        }
    }

    /// Identifiable URL wrapper for the in-app checkout sheet.
    struct CheckoutItem: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }

    /// Bundle checkout goes through the create-checkout edge function — the
    /// picked sports ride in session metadata. Same sign-in gate as links.
    private func openBundleCheckout(_ leagues: [String]) {
        guard authManager.isAuthenticated else { showAuthSheet = true; return }
        Task {
            if let url = await SupabaseAPI.createCheckout(leagues: leagues) {
                await MainActor.run { checkoutItem = CheckoutItem(url: url) }
            }
        }
    }

    /// Consume a deep-linked sport (Home LIVE FORM tap) once the board's loaded:
    /// switch to the mode that has it, scroll to its shelf.
    private func jumpToFocusSport(_ proxy: ScrollViewProxy) {
        guard let sport = picksFocus.focusSport, !loading else { return }
        if gameShelves.contains(where: { $0.league == sport }) { mode = .games }
        else if propShelves.contains(where: { $0.league == sport }) { mode = .props }
        else { picksFocus.focusSport = nil; return }
        withAnimation(.easeInOut(duration: 0.35)) {
            proxy.scrollTo((mode == .games ? "g-" : "p-") + sport, anchor: .top)
        }
        picksFocus.focusSport = nil
    }

    // MARK: - Header / states

    // ONE-LINE masthead (founder, Aug 6 night, second ruling: headers back,
    // everything horizontal on the line). Title left; GAMES/PROPS and the
    // compact day dropdown ride the trailing slot. Sits outside the content
    // branch so the day menu survives loading/coming-soon/empty states
    // (it's the only way back off a past date).
    private var header: some View {
        GaryPageHeader(title: "Winners", trailing: {
            HStack(spacing: 14) {
                tabSegment("GAMES", active: mode == .games) { mode = .games }
                tabSegment("PROPS", active: mode == .props) { mode = .props }
                Menu {
                    ForEach(0..<8, id: \.self) { offset in
                        Button(daySelectorLabel(offset)) {
                            withAnimation { selectedDate = offset == 0 ? nil : dayDateString(offset) }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(headerDateLabel)
                            .font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.55))
                            .fixedSize()
                        Image(systemName: "chevron.down")
                            .font(.system(size: 8, weight: .bold)).foregroundStyle(.white.opacity(0.62))
                    }
                    .contentShape(Rectangle())
                }
            }
        })
        .padding(.bottom, 8)
    }

    /// Compact date for the one-line header trigger — "TODAY", or "AUG 5" on
    /// a chosen past day (the long form crowded the shared line).
    private var headerDateLabel: String {
        guard let d = selectedDate else { return "TODAY" }
        let inF = DateFormatter(); inF.dateFormat = "yyyy-MM-dd"
        inF.timeZone = TimeZone(identifier: "America/New_York")
        guard let date = inF.date(from: d) else { return d }
        let outF = DateFormatter(); outF.dateFormat = "MMM d"; outF.timeZone = inF.timeZone
        return outF.string(from: date).uppercased()
    }

    private var emptyState: some View {
        VStack(spacing: 30) {
            VStack(spacing: 12) {
                Image(systemName: selectedDate == nil ? "lock.badge.clock" : "calendar.badge.exclamationmark")
                    .font(.system(size: 42)).foregroundStyle(.white.opacity(0.25))
                Text(boardDataFailed ? "Board data unavailable. Pull to retry."
                     : selectedDate != nil ? "No graded picks on this day."
                     : todaySlateCounts.isEmpty
                     ? "No games today. Yesterday's card is under the date above."
                     : "Gary's best bets post a few hours before first pitch.")
                    .font(GaryFonts.text(14)).foregroundStyle(.white.opacity(0.62))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.horizontal, 30).padding(.top, 60)

            // Every Winners state signs off with THE LAUNCH (founder, Sep 1).
            // A browsed-to date with no card was the one page in the room that
            // ended in nothing — one grey line and a screen of black. The panel
            // sits directly under the message, the way it sits directly under
            // the shelves on a live board; the leftover space stays below it.
            if !devAllAccess && Self.freeLaunch {
                freeLaunchFooter
            }
        }
        .padding(.bottom, 120)
    }

    private var winnersSourceFailureBanner: some View {
        HStack(spacing: 7) {
            BroadcastBar(height: 9)
            Text("BOARD DATA UNAVAILABLE · PULL TO RETRY")
                .font(GaryFonts.mono(9.5, bold: true)).tracking(0.7)
                .foregroundStyle(GaryColors.gold)
            Spacer(minLength: 0)
        }
        .pageGutter()
        .padding(.vertical, 8)
        .background(Color.black.opacity(0.22))
    }

    /// TODAY, before Gary's board posts — the members' room speaks ONE sealed
    /// language all day (founder, Jul 5): the same wrapper face the reveal
    /// uses, rendered as non-interactive placeholders with the drop countdown
    /// on the seal, under a plain how-it-works card with a one-tap door to
    /// yesterday's graded card. The old blur-skeletons + pop-up modal are gone.
    /// Founder, Jul 6: this state should look like the REAL board — same
    /// per-league shelf headers, same card rail — just with coming-soon
    /// wrapper words in place of a live tap-to-reveal seal. Iterates
    /// `gameShelves` (already carries every in-season league, empty picks
    /// and all) and renders one sealed placeholder per expected slot,
    /// sized from today's real slate count so it's never overstating or
    /// understating the day.
    private var comingSoonState: some View {
        // THE DAY CARD IS GONE (founder, Aug 5) — the manifest, the seal
        // countdown and the timeline strip all said what the shelves below
        // already show. The record band still opens the page honestly, and
        // the how-it-works block now sits UNDER the not-ready cards, where
        // it answers the question those cards raise instead of pre-empting it.
        VStack(spacing: 22) {
            ForEach(gameShelves) { shelf in
                comingSoonShelf(shelf.league)
            }
            comingSoonIntro
                .pageGutter()
            // The record signs the page off (founder, Aug 6 night: off the
            // top — "below or just removed") — honesty stays, the board leads.
            winnersRecordBand
            // THE LAUNCH closes the pre-drop page exactly as it closes a live
            // board (founder, Sep 1). It was only reachable from the
            // has-content branch, so the free-launch news — and the sign-in
            // door inside it — disappeared every morning until the card
            // posted. Same panel, same gate as the storefront slot.
            if !devAllAccess && Self.freeLaunch {
                freeLaunchFooter
            }
        }
        .padding(.top, 14)
        .padding(.bottom, 120)
    }

    /// One league's coming-soon shelf: real header, real card footprint,
    /// placeholder count matched to tonight's actual slate (WC ships 2
    /// picks/match; everything else shows its usual top-3 shelf).
    private func comingSoonShelf(_ league: String) -> some View {
        let games = todaySlateCounts[league.uppercased()] ?? 1
        let count = league.uppercased() == "WC" ? min(games * 2, 12) : min(max(games, 1), 3)
        return VStack(alignment: .leading, spacing: 10) {
            shelfHeader(league, status: "·  \(games) game\(games == 1 ? "" : "s") tonight")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(0..<count, id: \.self) { _ in
                        // The ORIGINAL "TODAY'S CARD / COMING SOON" face (founder,
                        // Jul 6: he asked to add per-sport headers to this, not to
                        // replace the wording) — leagueTag is the only new thing.
                        MembersOnlyCardFace(state: .placeholder(note: "PICKS DROP ~90 MIN BEFORE EACH GAME"),
                                            leagueTag: league.uppercased())
                            .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12))
                    }
                }
                .pageGutter()
            }
            // The rail must never shear the card's drop shadow into a hard
            // edge (founder, Jul 22: the seal read flat on the page).
            .unclippedRail()
        }
    }

    /// Plain-language how-it-works + the door to yesterday's results.
    private var comingSoonIntro: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TODAY'S CARD ISN'T OUT YET")
                .font(.system(size: 12.5, weight: .semibold).monospacedDigit()).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("Gary posts his best picks about 90 minutes before each game, once lineups are in. Every pick gets graded here the next morning — wins and losses.")
                .font(GaryFonts.text(13.5))
                .foregroundStyle(.white.opacity(0.85))
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                withAnimation { selectedDate = Self.yesterdayEST() }
            } label: {
                HStack(spacing: 5) {
                    Text("SEE YESTERDAY'S CARD")
                        .font(.system(size: 13, weight: .bold).monospacedDigit()).tracking(1)
                        .foregroundStyle(GaryColors.gold)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(GaryColors.panelFill)
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(GaryColors.gold.opacity(0.25), lineWidth: 1))
        )
    }

    /// Yesterday's EST slate day — the date-browser key for the results door.
    private static func yesterdayEST() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        guard let d = f.date(from: SupabaseAPI.todayEST()),
              let y = cal.date(byAdding: .day, value: -1, to: d) else { return SupabaseAPI.todayEST() }
        return f.string(from: y)
    }

    /// On the TODAY board, a sport that hasn't posted/graded a pick yet would
    /// otherwise fall back to YESTERDAY's settled result — a stale "LAST RESULT"
    /// card that misreads as today's. Instead we tease that sport's lane with the
    /// SAME blurred lock treatment the Picks tab uses (sharp chrome, blurred call,
    /// lock overlay) so it reads as "picks coming," never as old data. Matches the
    /// shelf card footprint (width = screen − 44, CompactPickRow.uniformHeight).
    private func teasedTodayCard(for league: String) -> some View {
        // Winners is the members' room — the pre-drop state speaks the same
        // sealed-card language as the wrapper (no blur, no pick data to leak).
        MembersOnlyCardFace(state: .coming(note: "DROPS ~90 MIN BEFORE GAME TIME"),
                            leagueTag: league.uppercased())
            .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12))
    }

    // MARK: - Content

    // MARK: - Toggle bar (Terminal Tape) + mode content

    // (toggleBar folded into `header` Aug 6 night — one control line.)

    /// Gold-text mode word — the header line's grammar (founder, Aug 6 night:
    /// color is the state, no underline hardware, no counts crowding the
    /// line — the shelves announce their own).
    private func tabSegment(_ label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { action() }
        } label: {
            Text(label)
                .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.5))
                .fixedSize()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - THE DAY CARD (Aug 3 2026) — the page's identity object

    /// Today's posted (non-settled) game picks — the live board.
    private var postedTodayPicks: [GaryPick] {
        gameShelves.filter { !$0.settled }.flatMap(\.picks)
    }

    /// Profit on $100 from a pick's American odds ("+128" → 128, "-138" → 72).
    private func pickPayout100(_ pick: GaryPick) -> Int {
        let raw = pick.formattedPickParts.odds
            .replacingOccurrences(of: "+", with: "")
            .replacingOccurrences(of: "−", with: "-")
            .trimmingCharacters(in: .whitespaces)
        guard let v = Int(raw), v != 0 else { return 0 }
        return v > 0 ? v : Int((10000.0 / Double(abs(v))).rounded())
    }

    private var winnersRecordBand: some View {
        WinnersRecordBand(
            records: canonicalSports.compactMap { lg in
                guard let r = sportRecords[lg], r.w + r.l > 0 else { return nil }
                return (league: lg, w: r.w, l: r.l)
            },
            onLedger: { withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selectedTab = 4 } })
    }

    @ViewBuilder private func modeContent(minHeight: CGFloat) -> some View {
        // Tighter inter-shelf rhythm (was 22) — the shelf headers already give
        // each rail vertical breathing room, so 22 over-spaced the board.
        VStack(alignment: .leading, spacing: 16) {
            if mode == .games {
                // Day card removed here too (founder, Aug 5) — it was the same
                // component, so leaving it on the posted board would have put it
                // back on screen the moment the first pick landed. The record
                // band moved to the sign-off slot (Aug 6 night: off the top).
                // (Tonight's Top Plays carousel removed from Winners per founder.)
                // Paid boards lead with full cards. Locked boards with content
                // follow as blurred previews — the user sees the real board
                // exactly as members do, just unreadable (tap = checkout).
                // The storefront menu (records, the honest hook) closes it out.
                ForEach(gameShelves.filter { sportUnlocked($0.league) }) { shelf in
                    gameShelfView(shelf)
                        .id("g-\(shelf.league)")
                }
                ForEach(gameShelves.filter { !sportUnlocked($0.league) && !$0.picks.isEmpty }) { shelf in
                    gameShelfView(shelf)
                        .id("g-\(shelf.league)")
                }
                if !lockedGameBoards.isEmpty {
                    storefrontTail(lockedGameBoards)
                }
                winnersRecordBand
            } else {
                if propShelves.isEmpty {
                    propsEmptyState
                } else {
                    ForEach(propShelves.filter { sportUnlocked($0.league) }) { shelf in
                        propShelfView(shelf)
                            .id("p-\(shelf.league)")
                    }
                    ForEach(propShelves.filter { !sportUnlocked($0.league) && !$0.props.isEmpty }) { shelf in
                        propShelfView(shelf)
                            .id("p-\(shelf.league)")
                    }
                    if !lockedPropBoards.isEmpty {
                        storefrontTail(lockedPropBoards)
                    }
                }
            }

            if !devAllAccess {
                // The whole-house CTA — per-sport sales live in the storefront
                // rows above; this sells everything at once, for real money.
                if !Self.freeLaunch && !entitledSports.contains("ALL") {
                    allAccessSection
                        .padding(.top, 6)
                }
                if Self.freeLaunch {
                    freeLaunchFooter
                        .padding(.top, 6)
                        .frame(maxHeight: .infinity, alignment: .top)
                } else {
                    accountRow
                }
            } else {
                Button { withAnimation { isPremium = false } } label: {
                    Text("✓ Premium active · tap to reset preview")
                        .font(GaryFonts.mono(10)).tracking(1).foregroundStyle(.white.opacity(0.62))
                }
                .frame(maxWidth: .infinity).padding(.top, 12)
            }
        }
        .frame(minHeight: minHeight, alignment: .top)
    }

    /// Free-launch announcement, in the exact slot the storefront will occupy.
    /// NO date promised (founder, Jul 5: free "for a good while"). Informational
    /// only: no prices and no purchase path in-app (the App Store 3.1.1 fence
    /// stays up).
    private var freeLaunchFooter: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "The Launch", sub: "")
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(FoundingCohort.beforePaywallStart
                         ? "Every board is free right now."
                         : "Winners is free for you all season.")
                        .font(GaryFonts.text(15, .semibold))
                        .foregroundStyle(.white.opacity(0.92))
                    Text(FoundingCohort.beforePaywallStart
                         ? "Gary's full card — game picks and props — is open to everyone through September. Be in before October 1 and Winners stays free for the rest of the season."
                         : "You were in before October 1, so every board stays open for the rest of the season.")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineSpacing(2)
                }

                Spacer(minLength: 22)

                HStack(spacing: 0) {
                    launchAccessPoint("GAME PICKS", detail: "OPEN")
                    launchAccessPoint("PLAYER PROPS", detail: "OPEN")
                    launchAccessPoint("ALL SPORTS", detail: "INCLUDED")
                }
                .padding(.vertical, 14)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                }

                Spacer(minLength: 16)
                accountRow
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .quantPanel()
            .pageGutter()
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func launchAccessPoint(_ label: String, detail: String) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.7)
                .foregroundStyle(.white.opacity(0.48))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(detail)
                .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                .foregroundStyle(GaryColors.gold)
        }
        .frame(maxWidth: .infinity)
    }

    /// The All-Access upsell in the storefront's own language — a section
    /// header and panel rows, not a sales poster. The full plan breakdown
    /// lives on the Plans sheet ("All plans").
    private var allAccessSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "All-Access", sub: "")
            VStack(spacing: 0) {
                Button { plansFocus = nil; showPlansSheet = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(GaryColors.gold)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("ALL-ACCESS")
                                .font(GaryFonts.mono(12, bold: true)).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.9))
                            Text("All 7 boards · games + props")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(GaryPricing.allAccessMonthly)/MO")
                                .font(GaryFonts.mono(13, bold: true))
                                .foregroundStyle(GaryColors.gold)
                            Text("\(GaryPricing.trialDays)-DAY FREE TRIAL")
                                .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.6))
                        }
                        Text("Start ›")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(GaryColors.gold)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 46)
                Button { plansFocus = nil; showPlansSheet = true } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "list.bullet")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("ALL PLANS")
                                .font(GaryFonts.mono(12, bold: true)).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.9))
                            Text("Free plan · single sports from \(GaryPricing.single)/mo · bundles")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 8)
                        Text("See ›")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(GaryColors.gold)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .quantPanel()
            .pageGutter()
        }
    }

    /// Quiet account anchor under the sales surfaces: signed out, it routes to
    /// sign-in (so purchases follow the account, not the phone); signed in,
    /// it just states who you are. Management lives in Settings.
    @ViewBuilder private var accountRow: some View {
        if authManager.isAuthenticated {
            Text("SIGNED IN AS \((authManager.currentUser?.email ?? "—").uppercased())")
                .font(GaryFonts.mono(10)).tracking(1)
                .foregroundStyle(.white.opacity(0.62))
                .lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
        } else {
            VStack(spacing: 6) {
                Button { showAuthSheet = true } label: {
                    HStack(spacing: 6) {
                        Text("SIGN IN OR CREATE ACCOUNT")
                            .font(GaryFonts.mono(11, bold: true)).tracking(1)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                    }
                    .foregroundStyle(GaryColors.gold)
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.plain)
                Text("Unlocks follow your account once you're signed in.")
                    .font(GaryFonts.text(11))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var propsEmptyState: some View {
        Text("No props posted yet — they'll appear here with the slate.")
            .font(GaryFonts.text(13))
            .foregroundStyle(.white.opacity(0.62))
            .frame(maxWidth: .infinity, alignment: .leading)
            .pageGutter()
            .padding(.vertical, 28)
    }

    private func shelfHeader(_ league: String, status: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: Sport.from(league: league).icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Sport.from(league: league).accentColor)
            Text(league)
                .font(GaryFonts.mono(12, bold: true)).tracking(1)
                .foregroundStyle(.white.opacity(0.85))
            Text(status)
                .font(GaryFonts.mono(11)).foregroundStyle(.white.opacity(0.62))
        }
        .pageGutter()
    }

    /// Winners order: ungraded picks (still to play) first, then settled results —
    /// each group by start time, so upcoming games lead and finished ones fall to the back.
    private func sortedShelfPicks(_ shelf: GameShelf) -> [GaryPick] {
        // A pick is "done" — bump to the BACK of the rail — once its game is
        // FINAL, so fresh upcoming/live picks always lead and the user scrolls
        // right to see settled (CASHED/LOST) ones. Detect FINAL from the live
        // score (covers today's finished games), plus the yesterday shelf's
        // graded results. (User call: graded picks go to the back.)
        func isDone(_ p: GaryPick) -> Bool {
            if shelf.settled && gamePickResult(p) != nil { return true }
            let mu = "\(p.awayTeam ?? "") @ \(p.homeTeam ?? "")"
            return LiveScoreCache.shared.status(forMatchup: mu)?.isFinal == true
        }
        return shelf.picks.sorted { a, b in
            let ad = isDone(a), bd = isDone(b)
            if ad != bd { return !ad }                 // upcoming/live first, FINAL to the back
            // Slot order carries the card's rhythm (anchor → dog → marquee →
            // nightcap); picks outside the slot system fall back to start time.
            let sa = winnersSlotMap[a.id]?.rawValue ?? Int.max
            let sb = winnersSlotMap[b.id]?.rawValue ?? Int.max
            if sa != sb { return sa < sb }
            return (a.commence_time ?? "") < (b.commence_time ?? "")   // then earliest start time
        }
    }

    /// How many "coming soon" filler cards a still-filling shelf should carry
    /// after its real picks (founder, Jul 6: "MLB has only 1 [of 3] — we need
    /// two of the coming soon cards" so the rail always previews its full
    /// intended size, not just what's dropped so far). Never pads a settled
    /// shelf (yesterday's LAST RESULT fallback, or a graded past day) — only
    /// TODAY's still-live board keeps filling in.
    private func shelfPadCount(_ shelf: GameShelf) -> Int {
        guard !shelf.settled else { return 0 }
        // A reviewed league's board is exactly its on-board picks (Sep 2
        // 2026): zero to a handful a day, never a promised six. One sealed
        // card holds the lane only while nothing has made the board yet.
        if reviewedLeagues.contains(shelf.league.uppercased()) {
            return shelf.picks.isEmpty ? 1 : 0
        }
        let target: Int
        if shelf.league.uppercased() == "WC" {
            // WC ships 2 plays/match — the target scales with tonight's real
            // match count (same math as the fully-pre-post comingSoonShelf).
            target = min((todaySlateCounts["WC"] ?? 0) * 2, 12)
        } else {
            // The card fills to winnersCardCap as the day's picks post —
            // capped by the real slate so a 2-game day never promises six.
            target = min(Self.winnersCardCap,
                         max(1, todaySlateCounts[shelf.league.uppercased()] ?? Self.winnersCardCap))
        }
        return max(0, target - shelf.picks.count)
    }

    private func gameShelfView(_ shelf: GameShelf) -> some View {
        // On the TODAY board a settled shelf is a STALE prior-day fallback (today's
        // pick hasn't posted/graded yet). Tease it with the blurred lock card
        // instead of showing yesterday's result as if it were tonight's.
        // "Coming soon" is a promise — it only prints when the league truly
        // plays today. A rest/dark day keeps the honest LAST RESULT framing
        // (founder, Jul 12: the WC shelf promised "TONIGHT'S PICK" on a day
        // with no match).
        let isStaleToday = selectedDate == nil && shelf.settled && !shelf.picks.isEmpty
            && (todaySlateCounts[shelf.league] ?? 0) > 0
        return VStack(alignment: .leading, spacing: 10) {
            shelfHeader(shelf.league,
                        status: shelf.picks.isEmpty
                            ? "·  —"
                            : isStaleToday ? "·  COMING SOON"
                            : (shelf.settled ? "·  LAST RESULT" : "·  \(shelf.picks.count) play\(shelf.picks.count == 1 ? "" : "s")"))
            if isStaleToday {
                teasedTodayCard(for: shelf.league).pageGutter()
            } else if shelf.picks.isEmpty {
                placeholderRow(for: shelf.league)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    // No external score strip here — the card's slot already
                    // carries LIVE/FINAL state, and a strip above only the live
                    // card knocked the shelf out of alignment (June 4 fix).
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(sortedShelfPicks(shelf), id: \.id) { pick in
                            // Matchup sub-header removed — the pick card already
                            // prints the matchup (redundant "TEAM @ TEAM" line cut).
                            ZStack {
                                if sportUnlocked(shelf.league) {
                                    // PREMIUM (Winners tab): a new pre-game pick arrives SEALED
                                    // in the members wrapper — tap flips it into the 21B-S
                                    // poured-gold bar. Revealed/live/settled cards show gold.
                                    MembersWrap(revealId: pick.id,
                                                commence: parseISO8601(pick.commence_time ?? ""),
                                                tease: gameTease(pick),
                                                league: shelf.league.uppercased()) {
                                        FlippablePickCard(pick: pick,
                                                          alwaysShowStartTime: true,
                                                          gameResult: shelf.settled ? gamePickResult(pick) : nil,
                                                          finalScore: shelf.settled ? gamePickScore(pick) : nil,
                                                          showSportBadge: false,
                                                          premiumFinish: true,
                                                          winnersSlot: winnersSlotMap[pick.id])
                                    }
                                } else {
                                    // Locked: ZERO pick data in the view (the old blurred real
                                    // card could leak through the blur). Tap opens Plans on
                                    // this sport.
                                    LockedPickCard(league: shelf.league) {
                                        plansFocus = shelf.league; showPlansSheet = true
                                    }
                                }
                            }
                            .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12))
                        }
                        // The shelf's still-open slots — "1 of 3" reads as a
                        // sparse, half-finished board without these; they say
                        // more of tonight's plays are still coming.
                        ForEach(0..<shelfPadCount(shelf), id: \.self) { _ in
                            MembersOnlyCardFace(state: .placeholder(note: "PICKS DROP ~90 MIN BEFORE EACH GAME"),
                                                leagueTag: shelf.league.uppercased())
                                .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12))
                        }
                    }
                    .pageGutter()
                }
                // Never shear the cards' shadows (founder, Jul 22).
                .unclippedRail()
            }
        }
    }

    /// The prop shelf's slate day: a browsed history date, else yesterday for
    /// the settled fallback, else today — the lookup day for graded stamps.
    private func propShelfDay(_ shelf: PropShelf) -> String {
        selectedDate ?? (shelf.settled ? SupabaseAPI.yesterdayEST() : SupabaseAPI.todayEST())
    }

    /// Strip a numeric line embedded at the end of a prop label. This mirrors
    /// the Picks page's result identity so `passing_yards 249.5` and the
    /// grader's `passing_yards` + `249.5` columns resolve to the same type.
    private func normalizeWinnerPropType(_ raw: String) -> String {
        raw.lowercased()
            .replacingOccurrences(of: #"\s+[\d.]+"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    /// Canonicalize numeric lines so equivalent encodings (`1.5`, `1.50`) do
    /// not break an otherwise exact result match.
    private func normalizeWinnerPropLine(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "" }
        if let value = Double(trimmed) { return String(format: "%g", value) }
        return trimmed.lowercased()
    }

    /// Use the same matchup normalization as Picks, including two-word mascot
    /// handling, before it becomes part of the result identity.
    private func normalizeWinnerPropMatchup(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "" }
        return shortenMatchup(trimmed).lowercased()
    }

    /// Exact Winners prop-result identity. Date prevents cross-day borrowing;
    /// type + line + matchup prevent two props for the same player from sharing
    /// whichever outcome happened to be written last.
    private func winnerPropResultKey(
        day: String,
        player: String,
        propType: String,
        line: String,
        matchup: String
    ) -> String? {
        let normalizedDay = day.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPlayer = player.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedType = normalizeWinnerPropType(propType)
        guard !normalizedDay.isEmpty, !normalizedPlayer.isEmpty, !normalizedType.isEmpty else { return nil }

        return [
            normalizedDay,
            normalizedPlayer,
            normalizedType,
            normalizeWinnerPropLine(line),
            normalizeWinnerPropMatchup(matchup),
        ].joined(separator: "|")
    }

    private func winnerPropResultKey(for prop: PropPick, on day: String) -> String? {
        winnerPropResultKey(
            day: day,
            player: prop.player ?? "",
            propType: prop.prop ?? "",
            line: prop.line ?? "",
            matchup: prop.matchup ?? ""
        )
    }

    private func winnerPropResultKey(for result: PropResult) -> String? {
        winnerPropResultKey(
            day: result.game_date ?? "",
            player: result.player_name ?? "",
            propType: result.prop_type ?? "",
            line: result.line_value?.value ?? "",
            matchup: result.matchup ?? ""
        )
    }

    /// Graded outcome for one exact prop on the given slate day, nil while
    /// ungraded — so day-game props stamp as soon as their own result lands.
    private func propResult(for prop: PropPick, on day: String) -> String? {
        guard let key = winnerPropResultKey(for: prop, on: day) else { return nil }
        return propResultsMap[key]
    }

    /// The prop's game final ("away-home") — props borrow their matchup's score
    /// so their settled footers match the game cards on historical boards.
    private func propScore(for prop: PropPick) -> String? {
        guard let k = gpKey(from: prop.matchup) else { return nil }
        return matchupScoresMap[k]
    }

    /// Props grouped by game, first-appearance order. THE RULE, automatic:
    /// 2+ props from the SAME game share one slip; a lone prop (or a prop
    /// whose game has no sibling) stands as its own full card.
    private func propGameGroups(_ props: [PropPick]) -> [[PropPick]] {
        var order: [String] = []
        var byGame: [String: [PropPick]] = [:]
        for p in props {
            let key = (p.matchup?.isEmpty == false) ? p.matchup! : "solo-\(p.id)"
            if byGame[key] == nil { order.append(key) }
            byGame[key, default: []].append(p)
        }
        return order.compactMap { byGame[$0] }
    }

    /// propGameGroups with graded/FINAL groups bumped to the BACK of the rail —
    /// the same Winners rule the game shelf uses (fresh picks lead, settled
    /// trail). A group is "done" once its game reads FINAL (live cache) or it
    /// carries a graded result.
    private func sortedPropGroups(_ shelf: PropShelf) -> [[PropPick]] {
        func isDone(_ g: [PropPick]) -> Bool {
            guard let p = g.first else { return false }
            if propResult(for: p, on: propShelfDay(shelf)) != nil { return true }
            return LiveScoreCache.shared.status(forMatchup: p.matchup ?? "")?.isFinal == true
        }
        return propGameGroups(shelf.props).enumerated().sorted { l, r in
            let ld = isDone(l.element), rd = isDone(r.element)
            if ld != rd { return !ld }                       // fresh first, FINAL to the back
            let lt = l.element.first?.commence_time ?? "", rt = r.element.first?.commence_time ?? ""
            if lt != rt { return lt < rt }                   // then earliest start
            return l.offset < r.offset                       // stable for ties
        }.map { $0.element }
    }

    /// Nickname for club teams ("Yankees"), untouched for countries — WC
    /// sides are multi-word nations ("United States") that last-word
    /// shortening would mangle into "States".
    private func sealSide(_ name: String, league: String?) -> String {
        (league ?? "").uppercased() == "WC" ? name : HomeView.shortTeam(name)
    }

    /// The seal's gift tag for a game pick — "Twins @ Yankees".
    private func gameTease(_ pick: GaryPick) -> String? {
        guard let away = pick.awayTeam, let home = pick.homeTeam else { return nil }
        return "\(sealSide(away, league: pick.league)) @ \(sealSide(home, league: pick.league))"
    }

    /// The seal's gift tag for a prop group — shortened from the full-name matchup.
    private func propTease(_ group: [PropPick]) -> String? {
        guard let first = group.first, let m = first.matchup, m.contains(" @ ") else { return nil }
        let sides = m.components(separatedBy: " @ ")
        let lg = first.effectiveLeague
        return "\(sealSide(sides[0], league: lg)) @ \(sealSide(sides[1], league: lg))"
    }

    private func propShelfView(_ shelf: PropShelf) -> some View {
        // Same TODAY-board rule as the game shelf: a settled prop lane is a stale
        // prior-day fallback — tease it with the blurred lock card, not yesterday's
        // graded result dressed up as tonight's.
        let isStaleToday = selectedDate == nil && shelf.settled && !shelf.props.isEmpty
            && (todaySlateCounts[shelf.league] ?? 0) > 0
        return VStack(alignment: .leading, spacing: 10) {
            shelfHeader(shelf.league, status: shelf.props.isEmpty ? "·  —"
                            : isStaleToday ? "·  COMING SOON"
                            : shelf.settled ? "·  LAST RESULT"
                            : "·  \(shelf.props.count) prop\(shelf.props.count == 1 ? "" : "s")")
            if isStaleToday {
                teasedTodayCard(for: shelf.league).pageGutter()
            } else if shelf.props.isEmpty {
                propPlaceholderRow(for: shelf.league)
            } else {
                // GAMES-TAB PARITY (founder, Aug 4): one prop = one card = one
                // rail slot, sealed individually — exactly the game shelf's
                // grammar. The same-game GROUPING is gone: a multi-prop game
                // used to reveal into a VStack of stacked cards inside a single
                // wrapper (short seal → double-tall stack), which is the
                // "stacked" look he called out. Grouping helpers
                // (sortedPropGroups/propTease) stay for the Picks tab.
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 10) {   // lazy: off-screen prop cards aren't built up front
                        ForEach(sortedPropGroups(shelf).flatMap { $0 }, id: \.id) { prop in
                            // Matchup sub-header removed — the prop card already
                            // prints the matchup (redundant "TEAM @ TEAM" line cut).
                            ZStack {
                                if sportUnlocked(shelf.league) {
                                    // Props seal in the same members wrapper as game picks —
                                    // one reveal per CARD now, like the game shelf.
                                    MembersWrap(revealId: prop.id,
                                                commence: parseISO8601(prop.commence_time ?? ""),
                                                tease: propTease([prop]),
                                                league: shelf.league.uppercased(),
                                                sealKicker: "GARY'S PROP PICK IS IN",
                                                silverSeal: true) {
                                        FlippablePropCard(prop: prop,
                                                          gameResult: propResult(for: prop, on: propShelfDay(shelf)),
                                                          finalScore: shelf.settled ? propScore(for: prop) : nil,
                                                          showSportBadge: false,
                                                          alwaysShowStartTime: true,
                                                          premiumFinish: true)
                                    }
                                } else {
                                    // Locked: ZERO prop data in the view. Tap opens Plans.
                                    LockedPickCard(league: shelf.league) {
                                        plansFocus = shelf.league; showPlansSheet = true
                                    }
                                }
                            }
                            .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12))
                        }
                    }
                    .pageGutter()
                }
                // Never shear the cards' shadows (founder, Jul 22).
                .unclippedRail()
            }
        }
    }

    /// Every locked game board for the storefront — the complete purchase
    /// menu, slate or no slate (an empty board still sells its season pass).
    /// WC's empty board reads as the pre-order row until kickoff.
    /// `live` distinguishes tonight's slate from a settled last result — the
    /// row copy must not call a graded pick "tonight."
    private var lockedGameBoards: [(league: String, count: Int, unit: String, live: Bool)] {
        gameShelves.filter { !sportUnlocked($0.league) }
            .map { (league: $0.league, count: $0.picks.count, unit: "pick", live: !$0.settled) }
    }

    private var lockedPropBoards: [(league: String, count: Int, unit: String, live: Bool)] {
        propShelves.filter { !sportUnlocked($0.league) }
            .map { (league: $0.league, count: $0.props.count, unit: "prop", live: !$0.settled) }
    }

    /// The locked-sports storefront: a contiguous tail below everything the
    /// user paid for. No blur, no hostage cards — each locked board sells
    /// itself with its REAL last-10 record (sometimes that means admitting
    /// 3–7; honesty is the brand).
    private func storefrontTail(_ boards: [(league: String, count: Int, unit: String, live: Bool)]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "More boards", sub: "Sports you haven't unlocked")
            VStack(spacing: 0) {
                ForEach(Array(boards.enumerated()), id: \.offset) { i, b in
                    // Every locked-board entry routes through the SAME door —
                    // the Plans sheet, focused on that sport (matches the
                    // blurred-preview taps). The paywall sells; checkout and
                    // the sign-in gate come at CTA time, not on first tap.
                    Button { plansFocus = b.league; showPlansSheet = true } label: { storefrontRow(b) }
                        .buttonStyle(.plain)
                        .disabled(Self.checkoutLinks[b.league] == nil)
                    if i < boards.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 46)
                    }
                }
            }
            .quantPanel()
            .pageGutter()
        }
    }

    private func storefrontRow(_ b: (league: String, count: Int, unit: String, live: Bool)) -> some View {
                    return HStack(spacing: 12) {
                        Image(systemName: Sport.from(league: b.league).icon)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(b.league == "MLB" ? GaryColors.mlbGrass : Sport.from(league: b.league).accentColor)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(b.league) BOARD")
                                .font(GaryFonts.mono(12, bold: true)).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.9))
                            Text(b.count == 0 ? "No \(b.unit) tonight yet"
                                 : b.live ? "\(b.count) \(b.unit)\(b.count == 1 ? "" : "s") tonight"
                                 : "Last result posted")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 8)
                        if let rec = sportRecords[b.league], rec.w + rec.l > 0 {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(rec.w)–\(rec.l)")
                                    .font(GaryFonts.mono(15, bold: true))
                                    .foregroundStyle(rec.w >= rec.l ? GaryColors.win : GaryColors.loss)
                                Text("LAST 10")
                                    .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                        }
                        Text("Unlock ›")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(GaryColors.gold)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .contentShape(Rectangle())
    }

    private func propPlaceholderRow(for league: String) -> some View {
        Text("No \(league) props yet — next slate posts ~90 min before \(shelfStartNoun(for: league)).")
            .font(GaryFonts.text(13))
            .foregroundStyle(.white.opacity(0.62))
            .frame(maxWidth: .infinity, alignment: .leading)
            .pageGutter().padding(.vertical, 18)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.1), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    )
            )
            .pageGutter()
    }

    private var lockBadge: some View {
        VStack(spacing: 5) {
            Image(systemName: "lock.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(GaryColors.gold)
            Text("MEMBERS ONLY")
                .font(GaryFonts.accent(12)).tracking(1.0).foregroundStyle(GaryColors.gold)
        }
    }

    /// Empty shelves use the sport's real start language. Football was still
    /// inheriting the basketball "tip" copy after its boards became first-class.
    private func shelfStartNoun(for league: String) -> String {
        switch league.uppercased() {
        case "NFL", "NCAAF": return "kickoff"
        default: return "tip"
        }
    }

    private func placeholderRow(for league: String) -> some View {
        let msg = "No \(league) pick yet — next slate posts ~90 min before \(shelfStartNoun(for: league))."
        return Text(msg)
            .font(GaryFonts.text(13))
            .foregroundStyle(.white.opacity(0.62))
            .frame(maxWidth: .infinity, alignment: .leading)
            .pageGutter().padding(.vertical, 18)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.1), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    )
            )
            .pageGutter()
    }

    // MARK: - Data

    /// Trailing American price in the pick text ("Padres +1.5 +104" → 104,
    /// "Guardians ML -142" → -142). nil when the text carries no price.
    private func americanPrice(_ pick: GaryPick) -> Int? {
        guard let text = pick.pick?.trimmingCharacters(in: .whitespaces),
              let r = text.range(of: "[+-]\\d{2,4}$", options: .regularExpression)
        else { return nil }
        return Int(text[r])
    }

    /// How many plays a league's Winners card carries for the day — games and
    /// props alike (founder, Aug 6: "we're capping that at six total picks.
    /// Same thing goes with the prop side"). The four slots fill first; the
    /// day's later picks accumulate behind them up to this.
    static let winnersCardCap = 6

    /// Builds the Winners card from a league's game picks: the four slots
    /// (anchor/dog/marquee/nightcap) fill first, then the card keeps
    /// ACCUMULATING up to `winnersCardCap` as the day's later picks post.
    /// Returns the curated picks in slot order plus the pick.id → slot map
    /// that orders them. Selection is downstream-only: Gary still picks every
    /// game exactly as before — this layer just chooses which make the card.
    private func curateWinnersSlots(_ picks: [GaryPick],
                                    bigGames: [TomorrowBigGame]) -> ([GaryPick], [String: WinnersSlot]) {
        // One candidate per game — the higher-confidence side wins, so a
        // double-stored game (both sides, the Jul 22 grading find) can never
        // put Gary against himself on the card.
        var byGame: [String: GaryPick] = [:]
        for p in picks {
            let k = "\(gpTeamKey(p.awayTeam))@\(gpTeamKey(p.homeTeam))"
            if let cur = byGame[k], (cur.confidence ?? 0) >= (p.confidence ?? 0) { continue }
            byGame[k] = p
        }
        var pool = Array(byGame.values)
        var slots: [String: WinnersSlot] = [:]
        var chosen: [GaryPick] = []
        func take(_ p: GaryPick, _ s: WinnersSlot) {
            slots[p.id] = s
            chosen.append(p)
            pool.removeAll { $0.id == p.id }
        }
        // ANCHOR — the board's strongest conviction (manual top-pick flag outranks).
        if let a = pool.max(by: { l, r in
            let lt = l.is_top_pick ?? false, rt = r.is_top_pick ?? false
            if lt != rt { return rt }
            return (l.confidence ?? 0) < (r.confidence ?? 0)
        }) { take(a, .anchor) }
        // DOG — Gary's best plus-money conviction; on a day he likes no dog,
        // the best price left stands in honestly rather than manufacturing one.
        if !pool.isEmpty {
            let plus = pool.filter { (americanPrice($0) ?? Int.min) > 0 }
            let d = plus.max { ($0.confidence ?? 0) < ($1.confidence ?? 0) }
                ?? pool.max { (americanPrice($0) ?? Int.min) < (americanPrice($1) ?? Int.min) }
            if let d { take(d, .dog) }
        }
        // MARQUEE — the highest-ranked big game still on the board (the
        // pipeline already ranks big_games daily; fans watch that game anyway).
        for g in bigGames.sorted(by: { $0.rank < $1.rank }) {
            guard let mk = gpKey(from: g.matchup),
                  let m = pool.first(where: { "\(gpTeamKey($0.awayTeam))@\(gpTeamKey($0.homeTeam))" == mk })
            else { continue }
            take(m, .marquee)
            break
        }
        // NIGHTCAP — the latest start left, so the card closes the day out.
        if let n = pool.max(by: { ($0.commence_time ?? "") < ($1.commence_time ?? "") }) {
            take(n, .nightcap)
        }
        // THE CARD ACCUMULATES, IT NEVER SWAPS (founder, Aug 6: "these picks
        // that are happening and finishing get replaced. That should not
        // happen... they should all stay there").
        //
        // The four slots re-derived from the WHOLE list on every refresh, and
        // NIGHTCAP is by definition "the latest start" — so each evening pick
        // that posted evicted the afternoon game a user had been watching,
        // sometimes mid-game. Ordering by start time makes membership
        // monotonic instead: a later pick can only ever be added AFTER the
        // ones already on the card, never in place of one. Slotted picks keep
        // their rhythm at the front; the rest fill by first pitch to the cap.
        for extra in pool.sorted(by: { ($0.commence_time ?? "") < ($1.commence_time ?? "") }) {
            guard chosen.count < Self.winnersCardCap else { break }
            chosen.append(extra)
        }
        return (chosen, slots)
    }

    private func sortedBest(_ picks: [GaryPick]) -> [GaryPick] {
        picks.sorted { a, b in
            let at = a.is_top_pick ?? false, bt = b.is_top_pick ?? false
            if at != bt { return at }
            return (a.confidence ?? 0) > (b.confidence ?? 0)
        }
    }

    /// World Cup shelf ordering: a match ships TWO plays (a side + a total).
    /// Keep them adjacent — matches in kickoff order, and within a match the
    /// side card sits before the total card.
    private func sortedWC(_ picks: [GaryPick]) -> [GaryPick] {
        picks.sorted { a, b in
            let ta = a.commence_time ?? "", tb = b.commence_time ?? ""
            if ta != tb { return ta < tb }
            let ma = "\(a.awayTeam ?? "")@\(a.homeTeam ?? "")"
            let mb = "\(b.awayTeam ?? "")@\(b.homeTeam ?? "")"
            if ma != mb { return ma < mb }
            let aTotal = (a.type ?? "") == "total", bTotal = (b.type ?? "") == "total"
            if aTotal != bTotal { return !aTotal }          // side before total
            return (a.confidence ?? 0) > (b.confidence ?? 0)
        }
    }

    /// W/L for a settled (last-result) game pick, matched by normalized teams AND
    /// the pick's own signature — so a game's side and total (the WC two-pick) read
    /// their OWN result instead of colliding on a matchup-only key.
    private func gamePickResult(_ pick: GaryPick) -> String? {
        let away = gpTeamKey(pick.awayTeam), home = gpTeamKey(pick.homeTeam)
        guard !away.isEmpty, !home.isEmpty else { return nil }
        return gameResultsMap[garyGameResultKey(matchupKey: "\(away)@\(home)", pickText: pick.pick)]
    }
    /// The stored "away-home" final score for a settled pick — feeds the card
    /// footer directly so historical boards don't depend on the live cache.
    private func gamePickScore(_ pick: GaryPick) -> String? {
        let away = gpTeamKey(pick.awayTeam), home = gpTeamKey(pick.homeTeam)
        guard !away.isEmpty, !home.isEmpty else { return nil }
        return gameScoresMap[garyGameResultKey(matchupKey: "\(away)@\(home)", pickText: pick.pick)]
    }
    private func gpTeamKey(_ value: String?) -> String {
        (value ?? "").lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    }
    private func gpKey(from matchup: String?) -> String? {
        guard let matchup else { return nil }
        for sep in [" @ ", " vs ", " v "] {
            let parts = matchup.components(separatedBy: sep)
            if parts.count == 2 {
                let a = gpTeamKey(parts[0]), h = gpTeamKey(parts[1])
                if !a.isEmpty && !h.isEmpty { return "\(a)@\(h)" }
            }
        }
        return nil
    }

    private func leagueKey(_ p: GaryPick) -> String { (p.league ?? "OTHER").uppercased() }
    private func propLeagueKey(_ p: PropPick) -> String {
        // HR-lane picks NEVER ride the storefront shelves — key them "MLB HR"
        // (props-only, dropped from the board order) whatever their league label
        // says, so a lottery ticket tagged plain "MLB" can't sneak onto the MLB
        // shelf. The Hub's Home Run Threats lane is their only home.
        if p.isHRLane { return "MLB HR" }
        let key = (p.effectiveLeague ?? p.sport ?? p.league ?? "OTHER").uppercased()
        // Non-HR props mislabeled "MLB HR" upstream (e.g. total_bases) still
        // route to the regular MLB shelf.
        return key == "MLB HR" ? "MLB" : key
    }

    /// Premium props: the top 5 by confidence across the sport — no per-game
    /// cap, so a game whose props BOTH qualify forms a slip and a game with
    /// one qualifier stands as a single card. The mix falls out of the data.
    /// The prop card accumulates the same way the game card does (founder,
    /// Aug 6: "Same thing goes with the prop side"), capped at
    /// `winnersCardCap`.
    ///
    /// This REPLACES the straight confidence cut. A top-N-by-confidence set
    /// re-ranks every refresh, so a late high-conviction prop evicted one a
    /// user had been watching — the same eviction the game card had. Start
    /// time is monotonic (props post T-90 before their game, so a later prop
    /// can only sort behind the ones already on the card); confidence still
    /// breaks ties inside a slot, keeping the best-first feel where it can't
    /// cost stability. No per-game cap, as before.
    private func selectPremiumProps(_ props: [PropPick]) -> [PropPick] {
        let ordered = props.sorted { a, b in
            let at = a.commence_time ?? "", bt = b.commence_time ?? ""
            if at != bt { return at < bt }
            return (a.confidence ?? 0) > (b.confidence ?? 0)
        }
        return Array(ordered.prefix(Self.winnersCardCap))
    }

    // MARK: - Date browser (Winners history)

    /// Today's live board, or a chosen past day.
    private func reload() async {
        if let d = selectedDate { await loadHistorical(d) } else { await load() }
    }

    private func sportRank(_ lg: String) -> Int {
        switch lg {
        case "WC":  return 0
        case "NBA": return 1
        case "NHL": return 2
        case "MLB": return 3
        default:    return 4 + (canonicalSports.firstIndex(of: lg) ?? canonicalSports.count)
        }
    }

    /// Browse a past day — every game + prop pick Gary made that date, all settled
    /// (flip-backs + CASHED/LOST stamps), ordered by sport. No live/slate logic.
    private func loadHistorical(_ date: String) async {
        await MainActor.run { loading = true }
        async let gamesF = fetchIsolatedGamePickSources(date: date)
        async let propsF = SupabaseAPI.fetchPropPicks(date: date)
        async let resultsF = SupabaseAPI.fetchAllGameResults(since: date)
        async let propResF = SupabaseAPI.fetchRecentPropResults(limit: 200)
        let gameSnapshot = await gamesF
        var props: [PropPick] = []
        var propsFailed = false
        do { props = try await propsF } catch { propsFailed = true }
        var results: [GameResult] = []
        var resultsFailed = false
        do { results = try await resultsF } catch { resultsFailed = true }
        var propResults: [PropResult] = []
        var propResultsFailed = false
        do { propResults = try await propResF } catch { propResultsFailed = true }
        let games = gameSnapshot.picks

        var rMap: [String: String] = [:]
        var sMap: [String: String] = [:]
        var mMap: [String: String] = [:]
        for r in results where r.game_date == date {
            guard let k = gpKey(from: r.matchup), let o = r.result else { continue }
            let key = garyGameResultKey(matchupKey: k, pickText: r.pick_text)
            rMap[key] = o.lowercased()
            if let s = r.final_score, !s.trimmingCharacters(in: .whitespaces).isEmpty {
                sMap[key] = s
                mMap[k] = s   // matchup-only: props borrow their game's final
            }
        }
        var pMap: [String: String] = [:]
        for r in propResults where r.game_date == date {
            guard let key = winnerPropResultKey(for: r),
                  let result = r.result, !result.isEmpty else { continue }
            pMap[key] = result.lowercased()
        }

        let byLeague = Dictionary(grouping: games, by: { leagueKey($0) })
        let propsByLeague = Dictionary(grouping: props, by: { propLeagueKey($0) })
        var order: [String] = []
        for lg in (canonicalSports + Array(byLeague.keys) + Array(propsByLeague.keys))
        where !order.contains(lg) && !Sport.from(league: lg).isPropsOnly {
            order.append(lg)
        }
        order.sort { sportRank($0) < sportRank($1) }

        var gShelves: [GameShelf] = []
        for lg in order {
            guard let gp = byLeague[lg], !gp.isEmpty else { continue }
            let cap = lg == "WC" ? 12 : 3   // WC ships 2 plays/match — cap at ~6 matches (was Int.max)
            let ordered: ([GaryPick]) -> [GaryPick] = lg == "WC" ? sortedWC : sortedBest
            gShelves.append(GameShelf(league: lg, picks: Array(ordered(gp).prefix(cap)), settled: true))
        }
        var pShelves: [PropShelf] = []
        for lg in order {
            guard let ps = propsByLeague[lg], !ps.isEmpty else { continue }
            pShelves.append(PropShelf(league: lg, props: selectPremiumProps(ps), settled: true))
        }

        await MainActor.run {
            gameResultsMap = rMap
            gameScoresMap = sMap
            matchupScoresMap = mMap
            propResultsMap = pMap
            gameShelves = gShelves
            propShelves = pShelves
            boardDataFailed = !gameSnapshot.failures.isEmpty || propsFailed || resultsFailed || propResultsFailed
            loading = false
        }
    }

    // MARK: - Date selector UI

    // The date selector moved into the page header (see `header` / `headerDateLabel`):
    // the date next to the "WINNERS" wordmark is now the day dropdown. The old "TODAY ▾"
    // pill and its `dateChipLabel`/`dateSelector` were retired here.

    /// ET-midnight of the 6am-anchored SLATE day (todayEST) — so offset 0 == today's
    /// slate and offset 1 == yesterday's. NOT wall-clock now, which is a day AHEAD of
    /// the slate between ET-midnight and 6am (that's what made "Yesterday" load today's
    /// slate, force-stamped settled). Matches how load()/yesterdayEST() already anchor.
    private func slateBaseDate() -> Date {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f.date(from: SupabaseAPI.todayEST()) ?? Date()
    }

    /// "yyyy-MM-dd" (EST) for the slate day minus `offset` days.
    private func dayDateString(_ offset: Int) -> String {
        var cal = Calendar(identifier: .gregorian)
        if let tz = TimeZone(identifier: "America/New_York") { cal.timeZone = tz }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = cal.timeZone
        let base = slateBaseDate()
        return f.string(from: cal.date(byAdding: .day, value: -offset, to: base) ?? base)
    }

    /// Dropdown row label: Today / Yesterday / "Sun, Jun 15".
    private func daySelectorLabel(_ offset: Int) -> String {
        if offset == 0 { return "Today" }
        if offset == 1 { return "Yesterday" }
        var cal = Calendar(identifier: .gregorian)
        if let tz = TimeZone(identifier: "America/New_York") { cal.timeZone = tz }
        let f = DateFormatter(); f.dateFormat = "EEE, MMM d"; f.timeZone = cal.timeZone
        let base = slateBaseDate()
        return f.string(from: cal.date(byAdding: .day, value: -offset, to: base) ?? base)
    }

    private func load() async {
        let today = SupabaseAPI.todayEST()
        let yesterday = SupabaseAPI.yesterdayEST()

        let previousGameShelves = gameShelves
        let previousPropShelves = propShelves
        let previousGameResults = gameResultsMap
        let previousGameScores = gameScoresMap
        let previousMatchupScores = matchupScoresMap
        let previousPropResults = propResultsMap

        async let todayGameF = fetchIsolatedGamePickSources(date: today)
        async let yGameF = fetchIsolatedGamePickSources(date: yesterday)
        async let resultsF = SupabaseAPI.fetchAllGameResults(since: yesterday)
        async let todayPropsF = SupabaseAPI.fetchPropPicks(date: today)
        async let slateF = SupabaseAPI.fetchDailySlate(date: today)
        // Pipeline-ranked big games (marquee slot) for both shelf days — the
        // board row for a date is written the prior morning, so both exist.
        async let boardTodayF = SupabaseAPI.fetchTomorrowBoard(date: today)
        async let boardYF = SupabaseAPI.fetchTomorrowBoard(date: yesterday)
        // THE WINNERS BOARD (founder GO, Sep 2 2026): the reviewer's rows —
        // which of the day's picks are on the board and why. Never throws.
        async let reviewsTodayF = SupabaseAPI.fetchWinnersReviews(date: today)
        async let reviewsYF = SupabaseAPI.fetchWinnersReviews(date: yesterday)
        // Storefront records: a wider graded window, trimmed to last 10 per sport.
        let recordWindowStart: String = {
            var cal = Calendar(identifier: .gregorian)
            if let tz = TimeZone(identifier: "America/New_York") { cal.timeZone = tz }
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = cal.timeZone
            return f.string(from: cal.date(byAdding: .day, value: -12, to: Date()) ?? Date())
        }()
        async let recordResultsF = SupabaseAPI.fetchAllGameResults(since: recordWindowStart)

        let todaySnapshot = await todayGameF
        let yesterdaySnapshot = await yGameF
        let todayGame = mergeGamePickSnapshot(
            todaySnapshot,
            retaining: previousGameShelves.filter { !$0.settled }.flatMap(\.picks)
        )
        let yGame = mergeGamePickSnapshot(
            yesterdaySnapshot,
            retaining: previousGameShelves.filter(\.settled).flatMap(\.picks)
        )
        var results: [GameResult] = []
        var resultsFailed = false
        var resultsTransientFailure = false
        do { results = try await resultsF } catch {
            resultsFailed = true
            resultsTransientFailure = SupabaseAPI.isTransientExternalFailure(error)
        }
        var todayProps: [PropPick] = []
        var todayPropsFailed = false
        do { todayProps = try await todayPropsF } catch {
            todayPropsFailed = true
            todayProps = SupabaseAPI.isTransientExternalFailure(error)
                ? previousPropShelves.filter { !$0.settled }.flatMap(\.props)
                : []
        }
        // Leagues with a GAME on today's slate = in-season. Off-season sports
        // (NBA/NHL once their season ends) have no game today, so we skip their
        // empty placeholder lane instead of showing a misleading "next slate
        // posts ~90 min before tip" message for a sport that isn't playing.
        let slateRows = await slateF
        let slateLeagues = Set(slateRows.compactMap { $0.league?.uppercased() })
        let slateCounts = Dictionary(grouping: slateRows) { ($0.league ?? "").uppercased() }
            .mapValues(\.count)

        // Yesterday's result map for settled (last-result) shelves.
        var rMap: [String: String] = resultsTransientFailure ? previousGameResults : [:]
        var sMap: [String: String] = resultsTransientFailure ? previousGameScores : [:]
        var mMap: [String: String] = resultsTransientFailure ? previousMatchupScores : [:]
        for r in results.filter({ $0.game_date == yesterday }) {
            guard let k = gpKey(from: r.matchup), let outcome = r.result else { continue }
            let key = garyGameResultKey(matchupKey: k, pickText: r.pick_text)
            rMap[key] = outcome.lowercased()
            if let s = r.final_score, !s.trimmingCharacters(in: .whitespaces).isEmpty {
                sMap[key] = s
                mMap[k] = s   // matchup-only: props borrow their game's final
            }
        }

        // All-Star specials are FREE board content (the week's whole funnel
        // points at the Picks tab) — they never enter the Winners room. Also
        // fixes the shelf tripling one special: shelves assume one game pick
        // per matchup, and the board carries five on one event.
        let todayByLeague = Dictionary(grouping: todayGame.filter { ($0.type ?? "") != "special" }, by: { leagueKey($0) })
        let yByLeague = Dictionary(grouping: yGame.filter { ($0.type ?? "") != "special" }, by: { leagueKey($0) })

        // Board order (user call, Jun 11): lead with what's playing tonight.
        // A league with picks TODAY outranks one without; among tonight's
        // slates the World Cup / NBA / NHL bump the everyday MLB slate down,
        // and the rest hold canonical order. Props-only categories (MLB HR,
        // NFL TDs) are never game shelves.
        func boardRank(_ lg: String) -> Int {
            switch lg {
            case "WC":  return 0
            case "NBA": return 1
            case "NHL": return 2
            case "MLB": return 3
            default:    return 4 + (canonicalSports.firstIndex(of: lg) ?? canonicalSports.count)
            }
        }
        var order: [String] = []
        for lg in (canonicalSports + Array(todayByLeague.keys) + Array(yByLeague.keys))
        where !order.contains(lg) && !Sport.from(league: lg).isPropsOnly {
            order.append(lg)
        }
        order.sort { a, b in
            let aToday = todayByLeague[a]?.isEmpty == false
            let bToday = todayByLeague[b]?.isEmpty == false
            if aToday != bToday { return aToday }      // tonight's slates lead
            let ra = boardRank(a), rb = boardRank(b)
            return ra != rb ? ra < rb : a < b
        }

        let bigGamesToday = (await boardTodayF)?.big_games ?? []
        let bigGamesY = (await boardYF)?.big_games ?? []
        let reviewsToday = await reviewsTodayF
        let reviewsY = await reviewsYF
        let reviewedToday = Set(reviewsToday.compactMap { $0.league?.uppercased() })

        var gShelves: [GameShelf] = []
        var slotMap: [String: WinnersSlot] = [:]
        // THE WINNERS BOARD (founder GO, Sep 2 2026): a league with reviewer
        // rows for the date shows exactly its on-board picks — the day's
        // first dog, the big game, and every STRONG review — in first-pitch
        // order, no cap, accumulating through the day. Slot curation (the
        // Jul 23 day-of-action card) stays only for leagues and dates with no
        // rows, i.e. before the reviewer shipped.
        func boardPicks(_ picks: [GaryPick], reviews: [SupabaseAPI.WinnersReviewRow], league: String) -> [GaryPick]? {
            let rows = reviews.filter { ($0.league ?? "").uppercased() == league.uppercased() }
            guard !rows.isEmpty else { return nil }
            let onBoard = Set(rows.filter { $0.on_board == true }.compactMap { $0.game_id })
            return picks
                .filter { p in
                    guard let gid = p.game_id else { return false }
                    return onBoard.contains(String(gid))
                }
                .sorted { ($0.commence_time ?? "") < ($1.commence_time ?? "") }
        }
        func curated(_ picks: [GaryPick], bigGames: [TomorrowBigGame]) -> [GaryPick] {
            let (chosen, slots) = curateWinnersSlots(picks, bigGames: bigGames)
            slotMap.merge(slots) { cur, _ in cur }
            return chosen
        }
        for lg in order {
            let shelfCap = lg == "WC" ? 12 : Self.winnersCardCap
            if let tp = todayByLeague[lg], !tp.isEmpty {
                let picks = lg == "WC" ? Array(sortedWC(tp).prefix(shelfCap))
                                       : (boardPicks(tp, reviews: reviewsToday, league: lg) ?? curated(tp, bigGames: bigGamesToday))
                gShelves.append(GameShelf(league: lg, picks: picks, settled: false))
            } else if let yp = yByLeague[lg], !yp.isEmpty {
                // Feeds the coming-soon lane list pre-picks; the settled cards
                // themselves only render once fresh picks exist elsewhere
                // (isTodayComingSoon intercepts first) or on a picked date.
                // Yesterday reads the same board rows, so the graded card is
                // the card people saw.
                let picks = lg == "WC" ? Array(sortedWC(yp).prefix(shelfCap))
                                       : (boardPicks(yp, reviews: reviewsY, league: lg) ?? curated(yp, bigGames: bigGamesY))
                gShelves.append(GameShelf(league: lg, picks: picks, settled: true))
            } else if slateLeagues.contains(lg) {
                // In-season (a game on today's slate) but picks haven't posted —
                // hold the lane with a placeholder. Off-season sports (no game
                // today) are skipped entirely, not shown as an empty "coming" lane.
                gShelves.append(GameShelf(league: lg, picks: [], settled: false))
            }
        }

        // Bump empty game shelves BELOW the sports that actually have picks, so an
        // empty lane (e.g. NBA during an outage) never sits between populated ones.
        // Stable partition: populated shelves keep their ranked order; empties trail.
        gShelves = gShelves.filter { !$0.picks.isEmpty } + gShelves.filter { $0.picks.isEmpty }

        // Premium props from today's slate: best prop per game, capped at 4 per
        // sport. A league with no props yet falls back to YESTERDAY's props as
        // LAST RESULT — graded stamps on, flips intact (mirrors the game shelves).
        // PERF (Jul 13): fetch the pair concurrently — they were serial.
        async let yPropsF = SupabaseAPI.fetchPropPicks(date: yesterday)
        async let recentPropResultsF = SupabaseAPI.fetchRecentPropResults(limit: 100)
        var yProps: [PropPick] = []
        var yesterdayPropsFailed = false
        do { yProps = try await yPropsF } catch {
            yesterdayPropsFailed = true
            yProps = SupabaseAPI.isTransientExternalFailure(error)
                ? previousPropShelves.filter(\.settled).flatMap(\.props)
                : []
        }
        var recentPropResults: [PropResult] = []
        var propResultsFailed = false
        var propResultsTransientFailure = false
        do { recentPropResults = try await recentPropResultsF } catch {
            propResultsFailed = true
            propResultsTransientFailure = SupabaseAPI.isTransientExternalFailure(error)
        }
        // Exact prop identity and NOT yesterday-only: on a day-game slate props
        // grade mid-afternoon. Date + player + type + line + matchup keeps a
        // same-player alternate market from borrowing another prop's outcome.
        var pMap: [String: String] = propResultsTransientFailure ? previousPropResults : [:]
        for r in recentPropResults {
            guard let key = winnerPropResultKey(for: r),
                  let result = r.result, !result.isEmpty else { continue }
            pMap[key] = result.lowercased()
        }
        let propsByLeague = Dictionary(grouping: todayProps, by: { propLeagueKey($0) })
        let yPropsByLeague = Dictionary(grouping: yProps, by: { propLeagueKey($0) })
        var pShelves: [PropShelf] = []
        for lg in order {
            if let ps = propsByLeague[lg], !ps.isEmpty {
                pShelves.append(PropShelf(league: lg, props: selectPremiumProps(ps), settled: false))
            } else if let yps = yPropsByLeague[lg], !yps.isEmpty {
                pShelves.append(PropShelf(league: lg, props: selectPremiumProps(yps), settled: true))
            } else if propSports.contains(lg) && slateLeagues.contains(lg) {
                // In-season prop sport (a game on today's slate) holds its lane
                // with a placeholder until props post. Off-season → skipped.
                pShelves.append(PropShelf(league: lg, props: [], settled: false))
            }
        }

        // Same rule for prop shelves: empty prop lanes trail the populated ones.
        pShelves = pShelves.filter { !$0.props.isEmpty } + pShelves.filter { $0.props.isEmpty }

        // Last-10 graded record per sport (newest first) for the storefront tail.
        var sRec: [String: (w: Int, l: Int)] = [:]
        let recordRows = ((try? await recordResultsF) ?? []).countable
        let byLeague = Dictionary(grouping: recordRows.filter { $0.result == "won" || $0.result == "lost" },
                                  by: { $0.effectiveLeague ?? "?" })
        for (lg, rows) in byLeague {
            let last10 = rows.sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }.prefix(10)
            sRec[lg] = (last10.filter { $0.result == "won" }.count,
                        last10.filter { $0.result == "lost" }.count)
        }

        let entitlements = await SupabaseAPI.fetchEntitlements()

        // Never commit a cancelled preload as an empty Winners board. The
        // existing board stays intact, and the selectedTab hook above retries
        // as soon as Winners becomes the active destination.
        guard !Task.isCancelled else { return }

        await MainActor.run {
            gameResultsMap = rMap
            gameScoresMap = sMap
            matchupScoresMap = mMap
            propResultsMap = pMap
            gameShelves = gShelves
            propShelves = pShelves
            winnersSlotMap = slotMap
            reviewedLeagues = reviewedToday
            todaySlateCounts = slateCounts
            todaySlateRows = slateRows
            sportRecords = sRec
            entitledSports = entitlements
            boardDataFailed = !todaySnapshot.failures.isEmpty
                || !yesterdaySnapshot.failures.isEmpty
                || todayPropsFailed
                || yesterdayPropsFailed
                || resultsFailed
                || propResultsFailed
            loading = false
        }
    }
}

/// SFSafariViewController wrapper — the in-app checkout browser. The Safari
/// engine gives Stripe Checkout Apple Pay + autofill without leaving the
/// app (US App Store 3.1.1 permits external purchases for digital goods,
/// including in-app web views — post-Epic rules, verified June 2026).
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.preferredBarTintColor = UIColor(red: 0.043, green: 0.043, blue: 0.047, alpha: 1)   // ink #0C0B0B
        vc.preferredControlTintColor = UIColor(red: 0.788, green: 0.635, blue: 0.153, alpha: 1) // brand gold
        vc.dismissButtonStyle = .close
        return vc
    }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

/// The pricing page — every plan in one place, in the terminal's own
/// language. Opened from blurred board previews (focused on that sport)
/// and from the All-Access section's "All plans" row.

// MARK: - Founding cohort (Sep 1 2026)
//
// Winners stays free for everyone through September. A device that first
// opened Gary before `paywallStart` keeps Winners free for the rest of the
// season; an install after that date meets the paywall. The first-open stamp
// lives in the Keychain (it survives a reinstall) and is written the first
// time this build runs. A device that already carried Gary before this build
// shipped has UserDefaults history — the intro flag, the session counter, a
// signed-in id — and is stamped as founding too: nobody is demoted for
// updating late.
//
// The promise is always keepable. If this build slips past October 1, every
// device is stamped on its first run of the new build, which happens after the
// date only for people who were ALREADY using Gary — and they carry history.
enum FoundingCohort {
    /// Midnight, October 1 2026, Eastern.
    static let paywallStart: Date = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        return cal.date(from: DateComponents(year: 2026, month: 10, day: 1)) ?? .distantFuture
    }()
    private static let key = "gary_first_open"

    /// Write the first-open stamp once. Safe to call on every foreground.
    static func stampIfNeeded() {
        guard KeychainStore.get(key) == nil else { return }
        let d = UserDefaults.standard
        let carriedGaryBefore = d.bool(forKey: "hasSeenGaryIntro")
            || d.integer(forKey: "reviewPromptSessionCount") > 0
            || d.string(forKey: "gary_user_id") != nil
        let stamp = carriedGaryBefore ? Date(timeIntervalSince1970: 0) : Date()
        KeychainStore.set(key, String(stamp.timeIntervalSince1970))
    }

    static var firstOpen: Date {
        stampIfNeeded()
        if let s = KeychainStore.get(key), let t = TimeInterval(s) { return Date(timeIntervalSince1970: t) }
        return Date()
    }

    /// The gate every Winners surface reads (via `PremiumPicksView.freeLaunch`).
    static var winnersFree: Bool { firstOpen < paywallStart }

    /// Copy switch: the free room reads one way before the date, another after.
    static var beforePaywallStart: Bool { Date() < paywallStart }
}
