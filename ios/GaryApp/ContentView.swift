import SwiftUI
import StoreKit

/// Gating for the App Store review prompt. We only ask right after a pick CASHES — the highest
/// positive-sentiment moment — at most once per app version, and only after the user has opened
/// the app a few times. Apple separately throttles requestReview to ~3 prompts/365 days, so this
/// can never nag, even though winning cards appear all over the app.
enum ReviewPrompt {
    private static let sessionsKey = "reviewPromptSessionCount"
    private static let lastVersionKey = "reviewPromptLastVersion"
    private static var askedThisLaunch = false

    private static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    }

    /// Count an app activation. Call when scenePhase becomes .active.
    static func noteSession() {
        let d = UserDefaults.standard
        d.set(d.integer(forKey: sessionsKey) + 1, forKey: sessionsKey)
    }

    /// Returns true at most ONCE per app version: only after >= 3 sessions, and only for the first
    /// winning card seen this launch. When true, the caller fires requestReview() itself.
    static func shouldRequestAfterWin() -> Bool {
        guard !askedThisLaunch else { return false }
        let d = UserDefaults.standard
        guard d.string(forKey: lastVersionKey) != appVersion else { return false }
        guard d.integer(forKey: sessionsKey) >= 3 else { return false }
        askedThisLaunch = true
        d.set(appVersion, forKey: lastVersionKey)
        return true
    }
}

// Shared state for pick detail overlay visibility
class PickDetailState: ObservableObject {
    static let shared = PickDetailState()
    @Published var isShowing = false
}

// Deep-link target from the Hub into the Picks tab: the Hub stores the tapped
// edge's game label ("LAD @ ARI") here and switches tabs; PicksCarouselView
// consumes it once its slate is loaded and pages to that matchup.
class PicksFocusState: ObservableObject {
    static let shared = PicksFocusState()
    @Published var focusGame: String? = nil
    @Published var focusLeague: String? = nil
    @Published var focusGameID: Int? = nil
    /// Deep-link from Home's LIVE FORM tap → jump the Winners board to this sport's shelf.
    @Published var focusSport: String? = nil

    /// Set the matchup last so observers consume the complete typed target in
    /// one pass. Legacy Hub links can omit league/id; Home always supplies both.
    func focus(game: String, league: String? = nil, gameID: Int? = nil) {
        focusLeague = league?.uppercased()
        focusGameID = gameID
        focusGame = game
    }

    func clearGameFocus() {
        focusGame = nil
        focusLeague = nil
        focusGameID = nil
    }
}

// MARK: - Main Tab View with Liquid Glass

// New tab layout — Gary is the bigger center tab.
//   0: Home
//   1: Winners  (straight-up game picks — was "Picks")
//   2: GARY (center) — Hub ⟷ Talk to Gary
//   3: Picks    (player prop picks per game — was "Props")
//   4: Billfold
// Fantasy moved out of the tab bar (still accessible if linked from elsewhere).
struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @AppStorage("hasSeenGaryIntro") private var hasSeenGaryIntro: Bool = false
    @State private var showingSettings = false
    @State private var showingProfile = false
    @State private var showingGaryIntro = false
    @StateObject private var pickDetailState = PickDetailState.shared
    @State private var loadedTabs: Set<Int> = []

    private let garyTabIndex: Int = 2
    private let billfoldTabIndex: Int = 4
    private let lastValidTabIndex: Int = 4

    @ViewBuilder
    private func tabPage<Content: View>(_ index: Int, @ViewBuilder content: () -> Content) -> some View {
        if loadedTabs.contains(index) || selectedTab == index {
            content()
                .opacity(selectedTab == index ? 1 : 0)
                .allowsHitTesting(selectedTab == index)
                .accessibilityHidden(selectedTab != index)
                .zIndex(selectedTab == index ? 1 : 0)
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ZStack(alignment: .topTrailing) {
                ZStack(alignment: .topTrailing) {
                    tabPage(0) { HomeView(selectedTab: $selectedTab) }
                    tabPage(1) { PremiumPicksView() }
                    tabPage(2) { GaryPage(selectedTab: $selectedTab) }   // Hub ⟷ Talk to Gary
                    tabPage(3) { PicksCarouselView() }                   // "Picks" — per-game swipe carousel
                    tabPage(4) { BillfoldView() }
                }
                .transaction { transaction in
                    if !PerformanceMode.current.useExpensiveEffects {
                        transaction.animation = nil
                    }
                }

                // Settings now lives in every page header's three-dot button
                // (GaryPageHeader / Billfold post ShowSettingsMenu).
            }
            // Always fill the screen so the bottom-aligned tab bar can't ride up
            // to the middle when the active page momentarily collapses (a bare
            // loading/empty state) — the "nav bar stuck in the middle" glitch.
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Tab bar — the fade dock (founder pick, mock 34).
            GaryCenteredTabBar(selectedTab: $selectedTab)

            // League Words (founder pick, mock 64) — the full-screen
            // typographic league switcher. Mounted HERE so it dims the whole
            // screen, dock included, exactly as the mock drew it.
            LeagueWordsOverlay()
        }
        // The root chrome NEVER rides the keyboard (founder bug, Aug 6: come
        // back from the Google auth sheet — whose passcode prompt had raised
        // the keyboard — and the whole app sat squished into the top half of
        // the screen, dock mid-air, black void below). A system overlay's
        // keyboard inset can outlive its dismissal on the underlying window;
        // ignoring the keyboard safe area here makes the stale inset
        // harmless. Text entry in the app lives in sheets, which handle
        // their own avoidance, and the Hub search field is top-anchored.
        .ignoresSafeArea(.keyboard)
        .sheet(isPresented: $showingSettings) {
            SettingsSheetView()
                .environmentObject(authManager)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("ShowSettingsMenu"))) { _ in
            showingSettings = true
        }
        // The profile — every page header's corner chip opens it (Aug 7).
        .sheet(isPresented: $showingProfile) {
            ProfileView()
                .environmentObject(authManager)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("ShowProfile"))) { _ in
            showingProfile = true
        }
        .onGaryTour { verb, arg in
            if verb == "tab", let idx = Int(arg), (0...lastValidTabIndex).contains(idx) {
                selectedTab = idx
            }
        }
        .task {
            #if DEBUG
            GaryTour.start()
            // Screenshot tooling: simctl launch ... --args -forceTab 0
            if UserDefaults.standard.object(forKey: "forceTab") != nil {
                let forced = UserDefaults.standard.integer(forKey: "forceTab")
                if (0...lastValidTabIndex).contains(forced) { selectedTab = forced }
            }
            #endif
            // Migrate any out-of-range persisted index (e.g. user was on the old Fantasy index)
            if selectedTab < 0 || selectedTab > lastValidTabIndex { selectedTab = 0 }
            loadedTabs.insert(selectedTab)
            maybeShowGaryIntro(for: selectedTab)
            // Prepare the regular content tabs one at a time after the first
            // frame. Their existing view state then stays alive, so a first tap
            // does not land on a blank loading page. Billfold is excluded here:
            // its all-time ledger has a dedicated lightweight prewarm below.
            let initialTab = selectedTab
            Task(priority: .utility) {
                await prewarmContentTabs(excluding: initialTab)
            }
            // Warm the shared live-score poll loop at launch (idempotent) so scores
            // are current on the very first screen, not only after a tab that pokes it.
            LiveScoreCache.shared.startIfNeeded()
            // Give Home's visible requests first use of the network/main actor,
            // then warm Billfold's default all-time Picks ledger. Props is much
            // larger and hydrates after Billfold opens, so launch-time work never
            // competes with the next main tab the user taps.
            Task(priority: .background) {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await BillfoldSnapshotStore.shared.prewarmIfNeeded()
            }
            // Warm the handle cache — every header's profile chip reads it.
            if AuthManager.shared.bearerToken != nil,
               let h = await UserBookAPI.fetchMyHandle() {
                UserDefaults.standard.set(h, forKey: "myHandle")
            }
        }
        .onChange(of: selectedTab) { newTab in
            loadedTabs.insert(newTab)
            maybeShowGaryIntro(for: newTab)
            // Tab pages stay alive (opacity-hidden), so an active text field
            // would keep its keyboard up across tabs — resign it on any switch.
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
        .sheet(isPresented: $showingGaryIntro, onDismiss: { hasSeenGaryIntro = true }) {
            GaryIntroSheet { showingGaryIntro = false }
        }
        .onChange(of: scenePhase) { newPhase in
            guard newPhase == .active else { return }
            ReviewPrompt.noteSession()
            // FORCE-REFRESH ON FOREGROUND: revive a dead poll loop and wake a
            // sleeping one so returning to the app shows current scores instantly
            // (the loop's adaptive sleep otherwise runs out before the next fetch).
            LiveScoreCache.shared.refreshNow()
            Task(priority: .utility) {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                await BillfoldSnapshotStore.shared.prewarmIfNeeded()
            }
        }
    }

    /// One-time intro: shown the first time the user lands on a picks page
    /// (Winners = 1, Picks = 3). Replaces the old persistent "~90 min" banners.
    private func maybeShowGaryIntro(for tab: Int) {
        guard !hasSeenGaryIntro, tab == 1 || tab == 3 else { return }
        showingGaryIntro = true
    }

    /// Mount hidden content tabs progressively instead of making the user's
    /// first tap pay for view construction plus its network request. Staggering
    /// keeps launch responsive and lets shared API caches absorb overlapping
    /// Home/Winners/Picks reads.
    private func prewarmContentTabs(excluding initialTab: Int) async {
        for index in [0, 3, 2, 1] where index != initialTab {
            try? await Task.sleep(nanoseconds: 900_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                _ = loadedTabs.insert(index)
            }
        }
    }
}

// MARK: - Gary Page (Hub ⟷ Talk to Gary)

/// Ship-level feature switches. Code behind an off flag stays in the
/// codebase, ready to re-enable — it just loses its entry points.
enum AppFlags {
}

enum GaryPageMode: String, CaseIterable {
    case hub = "Hub"

    /// Only flag-enabled modes get a switch entry; Hub is always on.
    static var enabled: [GaryPageMode] {
        allCases.filter {
            switch $0 {
            case .hub: return true
            }
        }
    }
}

/// The center Gary tab hosts its capabilities behind an underline switch:
/// the information "Hub" (Today's Edges), Gary's Daily Fantasy lineups, and
/// the "Talk to Gary" voice/chat orb. Non-hub modes are created lazily (only
/// when selected) so the orb/mic isn't live on Hub. With a single enabled
/// mode the switch hides and Hub fills the tab.
struct GaryPage: View {
    @Binding var selectedTab: Int
    @State private var mode: GaryPageMode = .hub

    var body: some View {
        ZStack {
            LiquidGlassBackground(grainDensity: 0)

            VStack(spacing: 0) {
                if GaryPageMode.enabled.count > 1 {
                    modeSwitch
                        .padding(.top, 8)
                        .padding(.bottom, 6)
                }

                Group {
                    switch mode {
                    case .hub:
                        // Start at the hub; tapping a connection moves the user
                        // over to that game's picks on the Picks tab, focused on
                        // the tapped matchup (via PicksFocusState). isVisible
                        // drives the Hub's staleness refetch + deep-link consume
                        // (tabs are kept alive, so onAppear never re-fires).
                        // HubView (HubView.swift) is the July 2026 front-page
                        // redesign (founder-approved; the old PropsHubView was
                        // removed in the Jul 4 dead-code cleanup).
                        HubView(isVisible: selectedTab == 2) { game in
                            PicksFocusState.shared.focus(game: game)
                            selectedTab = 3
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    // Primary nav (Hub ⟷ Fantasy ⟷ Talk) — an underline tab, deliberately distinct
    // from the gold filter-pills used elsewhere. Role differentiation, not another
    // gold capsule. (DESIGNER_BRIEFING: differentiate button roles.)
    private var modeSwitch: some View {
        HStack(spacing: 28) {
            ForEach(GaryPageMode.enabled, id: \.self) { m in
                let on = m == mode
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { mode = m }
                } label: {
                    VStack(spacing: 6) {
                        Text(m.rawValue)
                            .font(GaryFonts.text(15, on ? .semibold : .regular))
                            .foregroundStyle(on ? .white : .white.opacity(0.45))
                        Rectangle()
                            .fill(on ? GaryColors.gold : Color.clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - First-launch "How Gary Works" sheet

struct GaryIntroSheet: View {
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("HOW GARY WORKS")
                .font(GaryFonts.mono(10, bold: true)).tracking(1)
                .foregroundStyle(GaryColors.gold.opacity(0.9))
                .padding(.top, 28)

            introRow(icon: "magnifyingglass",
                     title: "The research comes first",
                     text: "Before every pick, Gary's research assistant digs through stats, injuries, form, and matchups for each game on the slate.")
            introRow(icon: "clock",
                     title: "Picks drop near game time",
                     text: "Each game's pick lands about 90 minutes before first pitch or tip-off, once lineups are confirmed. The board fills in as the day goes on.")
            introRow(icon: "checkmark.seal",
                     title: "Everything gets graded",
                     text: "Results are stamped on every pick and every Hub edge the next morning — wins, losses, and the track record, all visible.")

            Spacer()

            Button(action: onDone) {
                Text("GOT IT")
                    .font(GaryFonts.mono(13, bold: true)).tracking(1)
                    .foregroundStyle(.black.opacity(0.85))
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 18)
        }
        .padding(.horizontal, 24)
        .background(GaryColors.darkBg.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func introRow(icon: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(GaryColors.gold)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(GaryFonts.text(16, .semibold)).foregroundStyle(.white)
                Text(text)
                    .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Settings Sheet View (Wraps SettingsView for sheet presentation)

struct SettingsSheetView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            SettingsView()
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 24))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Gary-Centered Tab Bar (Gary as raised center primary action)

// FADE DOCK (founder pick, Aug 4 — mock 34 off the drawing-board round).
// No bar surface at all: the page fades into the ink underneath and five
// destinations sit directly on the fade — four glyph tabs and the bear,
// 46pt, labeled THE HUB. The dome (mock 01) and the split-waist bar (the
// pseudo-separation experiment) both retired with this; their shapes were
// deleted, not flagged off, per the founder's decisive pick.
struct GaryCenteredTabBar: View {
    @Binding var selectedTab: Int

    private struct TabItem { let icon: String; let label: String; let index: Int }
    private let leftTabs: [TabItem] = [
        TabItem(icon: "house.fill", label: "HOME", index: 0),
        TabItem(icon: "checkmark.seal.fill", label: "WINNERS", index: 1),
    ]
    private let rightTabs: [TabItem] = [
        TabItem(icon: "list.bullet.rectangle.fill", label: "PICKS", index: 3),
        TabItem(icon: "banknote.fill", label: "BILLFOLD", index: 4),
    ]
    private let garyIndex: Int = 2
    /// Mock 34's proportions: 46pt bear, THE HUB kicker under it.
    private let logoSize: CGFloat = 46

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(leftTabs, id: \.index) { sideTab($0) }
            centerHub
                .frame(maxWidth: .infinity)
            ForEach(rightTabs, id: \.index) { sideTab($0) }
        }
        .padding(.horizontal, 14)
        .padding(.top, 30)
        // SEATED LOW (founder, Aug 4: "we can lower it still a bit"). The dock
        // dips 6pt INTO the bottom safe area, so the labels finish ~28pt off
        // the physical edge — still ~15pt clear of the home indicator's swipe
        // zone, which is the floor this can't cross without stealing that
        // gesture. Any lower and a Billfold tap starts competing with a
        // swipe-up-to-close.
        .padding(.bottom, -6)
        .background(alignment: .bottom) {
            // The fade IS the bar: page ink rising from the bottom edge, so
            // content scrolls visibly underneath and dissolves into the dock.
            // Anchored to the page background's own bottom tone (#0B0A09 —
            // LiquidGlassBackground's gradient floor) for a seamless meet.
            // RAMP LOWERED Aug 6 (founder: "makes the actual page fade when
            // it's close to it") — 0.93 ink at 40% of a frame whose top edge
            // sits ~30pt above the icons was dimming rows that were still
            // page, not dock. Transparent through the frame's upper third
            // now; the dissolve happens across the icon band itself.
            LinearGradient(stops: [
                .init(color: Color(hex: "#0B0A09").opacity(0.04), location: 0),
                .init(color: Color(hex: "#0B0A09").opacity(0.14), location: 0.26),
                .init(color: Color(hex: "#0B0A09").opacity(0.68), location: 0.54),
                .init(color: Color(hex: "#0B0A09").opacity(0.97), location: 0.78),
                .init(color: Color(hex: "#0B0A09"), location: 1),
            ], startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea(edges: .bottom)
            .allowsHitTesting(false)
        }
    }

    // MARK: - Side tab (icon + label, color-only active state)

    private func sideTab(_ tab: TabItem) -> some View {
        let active = selectedTab == tab.index
        return Button {
            tabAction(index: tab.index)
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.icon)
                    .font(.system(size: 19, weight: .semibold))
                    .frame(width: 46, height: 26)
                Text(tab.label)
                    .font(GaryFonts.ui(10, .semibold))
                    .tracking(0.4)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.45))
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: active)
            .accessibilityElement(children: .ignore)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tab.label.capitalized) tab")
        .accessibilityRemoveTraits(.isSelected)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    // MARK: - Center: the bear, labeled THE HUB (founder, mock 34)

    private var centerHub: some View {
        let active = selectedTab == garyIndex
        return Button {
            tabAction(index: garyIndex)
        } label: {
            VStack(spacing: 4) {
                Image(GaryBrand.mark)
                    .resizable()
                    .scaledToFit()
                    .frame(width: logoSize, height: logoSize)
                    .opacity(active ? 1.0 : 0.95)
                    .shadow(color: .black.opacity(0.45), radius: 3, y: 2)
                Text("THE HUB")
                    .font(GaryFonts.ui(10, .semibold))
                    .tracking(0.8)
                    .foregroundStyle(GaryColors.gold.opacity(active ? 1 : 0.85))
            }
            .contentShape(Rectangle())
            .accessibilityElement(children: .ignore)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("The Hub")
        .accessibilityRemoveTraits(.isSelected)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    // MARK: - Tap action

    private func tabAction(index: Int) {
        guard selectedTab != index else { return }
        // Keep the dock's own icon/color animation, but do not wrap the entire
        // five-page ZStack in one spring transaction. Animating both the old
        // and new heavy pages was the small pause users felt on every tab tap.
        selectedTab = index
    }
}

// Legacy alias — anything still referencing CompactTabBar gets the new one.
typealias CompactTabBar = GaryCenteredTabBar

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, (int >> 8) & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthManager.shared)
        .preferredColorScheme(.dark)
}
