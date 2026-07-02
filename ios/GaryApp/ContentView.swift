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
    /// Deep-link from Home's LIVE FORM tap → jump the Winners board to this sport's shelf.
    @Published var focusSport: String? = nil
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
                    tabPage(0) { HomeView() }
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

            // Tab bar — Gary is raised + larger center button
            GaryCenteredTabBar(selectedTab: $selectedTab)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheetView()
                .environmentObject(authManager)
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("ShowSettingsMenu"))) { _ in
            showingSettings = true
        }
        .task {
            #if DEBUG
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
            // Warm the shared live-score poll loop at launch (idempotent) so scores
            // are current on the very first screen, not only after a tab that pokes it.
            LiveScoreCache.shared.startIfNeeded()
            await BillfoldSnapshotStore.shared.prewarmIfNeeded()
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
}

// MARK: - Gary Page (Hub ⟷ Talk to Gary)

/// Ship-level feature switches. Code behind an off flag stays in the
/// codebase, ready to re-enable — it just loses its entry points.
enum AppFlags {
    /// Talk to Gary is parked until v3 — the Gary tab is Hub-only meanwhile.
    static let talkToGaryEnabled = false
}

enum GaryPageMode: String, CaseIterable {
    case hub = "Hub", talk = "Talk to Gary"

    /// Only flag-enabled modes get a switch entry; Hub is always on.
    static var enabled: [GaryPageMode] {
        allCases.filter {
            switch $0 {
            case .hub: return true
            case .talk: return AppFlags.talkToGaryEnabled
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
                        PropsHubView(isVisible: selectedTab == 2) { game in
                            PicksFocusState.shared.focusGame = game
                            selectedTab = 3
                        }
                    case .talk:
                        GaryChatView()
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

/// Tab bar with 4 normal tabs (Home, Picks, Props, Billfold) and Gary as a
/// bigger, raised center tab (index 2). Gary is THE main thing — the orb
/// is the product, and the tab bar reflects that.
// Bar silhouette with a smooth raised "hump" in the top-center for the logo.
// The hump adds height only in the middle; the flat ends stay the tab height.
struct HumpBarShape: Shape {
    var humpRise: CGFloat        // how far the hump crests above the flat top
    var humpHalfWidth: CGFloat   // half-width of the hump's base
    var cornerRadius: CGFloat    // rounding of the bar's ends

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        let cx = rect.midX
        let topY = humpRise
        let xL = cx - humpHalfWidth
        let xR = cx + humpHalfWidth
        let k = humpHalfWidth * 0.62          // bézier smoothing toward the peak
        let r = min(cornerRadius, (h - topY) / 2)

        p.move(to: CGPoint(x: 0, y: topY + r))
        p.addQuadCurve(to: CGPoint(x: r, y: topY), control: CGPoint(x: 0, y: topY))   // top-left corner
        p.addLine(to: CGPoint(x: xL, y: topY))
        p.addCurve(to: CGPoint(x: cx, y: 0),                                          // ease up into the hump
                   control1: CGPoint(x: xL + k, y: topY),
                   control2: CGPoint(x: cx - k, y: 0))
        p.addCurve(to: CGPoint(x: xR, y: topY),                                       // ease back down
                   control1: CGPoint(x: cx + k, y: 0),
                   control2: CGPoint(x: xR - k, y: topY))
        p.addLine(to: CGPoint(x: w - r, y: topY))
        p.addQuadCurve(to: CGPoint(x: w, y: topY + r), control: CGPoint(x: w, y: topY)) // top-right corner
        p.addLine(to: CGPoint(x: w, y: h - r))
        p.addQuadCurve(to: CGPoint(x: w - r, y: h), control: CGPoint(x: w, y: h))        // bottom-right
        p.addLine(to: CGPoint(x: r, y: h))
        p.addQuadCurve(to: CGPoint(x: 0, y: h - r), control: CGPoint(x: 0, y: h))        // bottom-left
        p.closeSubpath()
        return p
    }
}

struct GaryCenteredTabBar: View {
    @Binding var selectedTab: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct TabItem { let icon: String; let label: String; let index: Int }
    private let leftTabs: [TabItem] = [
        TabItem(icon: "house.fill", label: "Home", index: 0),
        TabItem(icon: "checkmark.seal.fill", label: "Winners", index: 1),
    ]
    private let rightTabs: [TabItem] = [
        TabItem(icon: "list.bullet.rectangle.fill", label: "Picks", index: 3),
        TabItem(icon: "banknote.fill", label: "Billfold", index: 4),
    ]
    private let garyIndex: Int = 2

    // Tunable hump geometry.
    private let humpRise: CGFloat = 28
    private let humpHalfWidth: CGFloat = 52
    private let flatHeight: CGFloat = 58
    private let logoSize: CGFloat = 72

    private var barShape: HumpBarShape {
        HumpBarShape(humpRise: humpRise, humpHalfWidth: humpHalfWidth, cornerRadius: 27)
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Humped bar background (fill + glass + border all follow the hump).
            ZStack {
                if PerformanceMode.current.useExpensiveEffects {
                    barShape.fill(.ultraThinMaterial)
                    barShape.fill(GaryColors.darkBg.opacity(0.5))
                } else {
                    barShape.fill(Color(hex: "#181616"))
                }
                barShape.stroke(borderGradient, lineWidth: 0.8)
            }
            .frame(height: humpRise + flatHeight)
            .shadow(color: .black.opacity(0.28), radius: 14, y: 6)

            // Tabs live in the flat portion, pinned to the bottom.
            HStack(spacing: 0) {
                ForEach(leftTabs, id: \.index) { sideTab($0) }
                Color.clear.frame(width: humpHalfWidth * 2, height: 1)
                ForEach(rightTabs, id: \.index) { sideTab($0) }
            }
            .padding(.horizontal, 14)
            .frame(height: flatHeight)
            .frame(maxHeight: .infinity, alignment: .bottom)

            // Logo nestled into the hump — sits low, roughly inline with the tab
            // icons but lifted a touch; its size does the rest of the "raised" work.
            garyLogo
                .padding(.top, 7)
        }
        .frame(height: humpRise + flatHeight)
        .padding(.horizontal, 26)
        .padding(.bottom, 6)
    }

    // MARK: - Side tab (icon + label, color-only active state)

    private func sideTab(_ tab: TabItem) -> some View {
        let active = selectedTab == tab.index
        return Button {
            tabAction(index: tab.index)
        } label: {
            VStack(spacing: 5) {
                Image(systemName: tab.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 46, height: 26)
                    .background {
                        if active {
                            Capsule(style: .continuous).fill(GaryColors.gold.opacity(0.15))
                        }
                    }
                Text(tab.label)
                    .font(GaryFonts.text(10, .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.45))
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: active)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tab.label) tab")
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    // MARK: - Center logo (sits inside the hump)

    private var garyLogo: some View {
        let active = selectedTab == garyIndex
        return Button {
            tabAction(index: garyIndex)
        } label: {
            Image(GaryBrand.mark)
                .resizable()
                .scaledToFit()
                .frame(width: logoSize, height: logoSize)
                .opacity(active ? 1.0 : 0.95)
                .shadow(color: GaryColors.gold.opacity(active ? 0.45 : 0.0), radius: 10)
                .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Talk to Gary")
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private var borderGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(0.16),
                GaryColors.gold.opacity(0.18),
                Color.white.opacity(0.05),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Tap action

    private func tabAction(index: Int) {
        if PerformanceMode.current.useExpensiveEffects && !reduceMotion {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
                selectedTab = index
            }
        } else {
            selectedTab = index
        }
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
