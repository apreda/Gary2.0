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
    @Published var focusDate: String? = nil
    @Published var focusRefresh = false
    @Published var focusRequestID = UUID()
    /// Deep-link from Home's LIVE FORM tap → jump the Winners board to this sport's shelf.
    @Published var focusSport: String? = nil

    /// Set the matchup last so observers consume the complete typed target in
    /// one pass. Legacy Hub links can omit league/id; Home always supplies both.
    func focus(game: String, league: String? = nil, gameID: Int? = nil,
               date: String? = nil, refresh: Bool = false) {
        focusLeague = league?.uppercased()
        focusGameID = gameID
        focusDate = date
        focusRefresh = refresh
        focusGame = game
        focusRequestID = UUID()
    }

    func clearGameFocus() {
        focusGame = nil
        focusLeague = nil
        focusGameID = nil
        focusDate = nil
        focusRefresh = false
    }
}

// MARK: - Main Tab View

// Main tabs: Home, Winners, Darts, Picks, Billfold.
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
    @State private var pushShellReady = false

    private let billfoldTabIndex: Int = 4
    private let lastValidTabIndex: Int = 4

    @ViewBuilder
    private func tabPage<Content: View>(_ index: Int, @ViewBuilder content: () -> Content) -> some View {
        if loadedTabs.contains(index) || selectedTab == index {
            content()
                .environment(\.readingPageActive, selectedTab == index)
                .opacity(selectedTab == index ? 1 : 0)
                .allowsHitTesting(selectedTab == index)
                .accessibilityHidden(selectedTab != index)
                .zIndex(selectedTab == index ? 1 : 0)
        }
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                ZStack(alignment: .topTrailing) {
                    ZStack(alignment: .topTrailing) {
                        tabPage(0) { HomeView(selectedTab: $selectedTab) }
                        tabPage(1) { WinnersLabView() }
                        // DARTS (founder, Sep 22 2026): the Hub's slot becomes Gary's
                        // fun picks, the streaks and his run. The Hub is unmounted.
                        tabPage(2) { DartsView() }
                        tabPage(3) { PicksCarouselView() }
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

                // The floating dock — the page fades into it.
                GaryCenteredTabBar(selectedTab: $selectedTab,
                                   bottomSafeAreaInset: geometry.safeAreaInsets.bottom)

                // League Words (founder pick, mock 64) — the full-screen
                // typographic league switcher. Mounted HERE so it dims the whole
                // screen, dock included, exactly as the mock drew it.
                LeagueWordsOverlay()
            }
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
        .modifier(ReadingMeasurementLifecycle())
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
            pushShellReady = true
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
        .modifier(GaryPushNavigationModifier(selectedTab: $selectedTab,
            hasSeenIntro: $hasSeenGaryIntro, showingIntro: $showingGaryIntro,
            shellReady: pushShellReady,
            rootModalPresented: showingSettings || showingProfile || pickDetailState.isShowing,
            openProfile: { showingProfile = true }))
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

enum AppFlags {}

// MARK: - First-launch "How Gary Works" sheet

/// Shown the first time a fan lands on Winners or Picks, and from Settings.
/// Rewritten Sep 23 2026 (founder): what each page is, in plain words; the
/// sheet is as tall as its words so nothing is cut off; a quiet button.
struct GaryIntroSheet: View {
    let onDone: () -> Void
    @State private var contentHeight: CGFloat = 460

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                Text("HOW GARY WORKS")
                    .font(GaryFonts.mono(10, bold: true)).tracking(1)
                    .foregroundStyle(GaryColors.gold.opacity(0.9))
                    .padding(.top, 28)

                introRow(icon: "list.bullet.rectangle",
                         title: "A pick on every game",
                         text: "Picks has Gary's side of every game on the board, with his case for it and what could beat him.")
                introRow(icon: "dollarsign.circle",
                         title: "Winners is where he bets",
                         text: "The plays Gary puts real money on, out of a $10,000 bankroll. Each one shows his stake and why he made it.")
                introRow(icon: "clock",
                         title: "The board fills through the day",
                         text: "Gary picks each game once its news is in, so a game without a pick yet will have one before it starts.")
                introRow(icon: "checkmark.seal",
                         title: "Every result stays up",
                         text: "Wins and losses stay on the record as they were published. No pick is a sure thing.")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
            .background(GeometryReader { g in
                Color.clear
                    .onAppear { contentHeight = g.size.height }
                    .onChange(of: g.size.height) { contentHeight = $0 }
            })
        }
        .bounceOnlyWhenScrollable()
        .safeAreaInset(edge: .bottom) {
            Button(action: onDone) {
                Text("GOT IT")
                    .font(GaryFonts.display(15)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold)
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LabInk.plate))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(GaryColors.gold.opacity(0.35), lineWidth: 1))
                    .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.bottom, 16)
            .padding(.top, 10)
            .background(GaryColors.darkBg)
        }
        .background(GaryColors.darkBg.ignoresSafeArea())
        // As tall as the words plus the button; a very large text size scrolls.
        .presentationDetents([.height(min(contentHeight + 96, UIScreen.main.bounds.height * 0.92))])
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
                    .fixedSize(horizontal: false, vertical: true)
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
                        Button("Done") { dismiss() }
                            .accessibilityLabel("Close Settings")
                    }
                }
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Gary-Centered Tab Bar (Gary as raised center primary action)

// THE FLOATING DOCK: no bar surface at all — the page fades into the ink
// underneath and five destinations sit directly on the fade (four glyph tabs
// and the mark, 46pt, labeled WINNERS since Sep 22 2026). Restored Sep 21
// 2026 at the founder's request after two days as a solid bar.
enum GaryDockLayout {
    /// Keep at least 8pt between the labels and the physical screen edge.
    /// Home-indicator devices retain the existing 6pt safe-area overlap.
    static func bottomPadding(safeAreaInset: CGFloat) -> CGFloat {
        max(-6, 8 - max(0, safeAreaInset))
    }
}

struct GaryCenteredTabBar: View {
    @Binding var selectedTab: Int
    let bottomSafeAreaInset: CGFloat

    private struct TabItem { let icon: String; let label: String; let index: Int }
    // The dock (founder, Sep 22 2026): WINNERS wears the mark in the middle;
    // DARTS, Gary's fun picks, takes the Hub's old place on the left.
    private let leftTabs: [TabItem] = [
        TabItem(icon: "house.fill", label: "HOME", index: 0),
        TabItem(icon: "scope", label: "DARTS", index: 2),
    ]
    private let rightTabs: [TabItem] = [
        TabItem(icon: "list.bullet.rectangle.fill", label: "PICKS", index: 3),
        TabItem(icon: "banknote.fill", label: "BILLFOLD", index: 4),
    ]
    private let garyIndex: Int = 1
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
        // The SE has no bottom safe inset: an unconditional negative padding
        // clips its labels below the display. Use the current container inset
        // while preserving the low dock on home-indicator phones.
        .padding(.bottom, GaryDockLayout.bottomPadding(safeAreaInset: bottomSafeAreaInset))
        .background(alignment: .bottom) {
            // The fade IS the bar: page ink rising from the bottom edge, so
            // content scrolls visibly underneath and dissolves into the dock.
            // Anchored to the page background's own bottom tone (#0B0A09) for
            // a seamless meet. Transparent through the frame's upper third;
            // the dissolve happens across the icon band itself (founder,
            // Sep 21 2026: "go back to a floating nav bar").
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
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: active)
            .accessibilityElement(children: .ignore)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tab.label.capitalized) tab")
        .accessibilityRemoveTraits(.isSelected)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    // MARK: - Center: the mark, labeled WINNERS

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
                Text("WINNERS")
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

