import SwiftUI

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
    @State private var showingSettings = false
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

                // Settings button — hidden on Gary tab (orb screen is intentionally minimal)
                // and Billfold (which has its own).
                if !pickDetailState.isShowing
                    && selectedTab != billfoldTabIndex
                    && selectedTab != garyTabIndex {
                    SettingsMenuButton(showingSettings: $showingSettings)
                        .padding(.top, 4)
                        .padding(.trailing, 16)
                }
            }

            // Tab bar — Gary is raised + larger center button
            GaryCenteredTabBar(selectedTab: $selectedTab)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheetView()
                .environmentObject(authManager)
        }
        .task {
            // Migrate any out-of-range persisted index (e.g. user was on the old Fantasy index)
            if selectedTab < 0 || selectedTab > lastValidTabIndex { selectedTab = 0 }
            loadedTabs.insert(selectedTab)
            await BillfoldSnapshotStore.shared.prewarmIfNeeded()
        }
        .onChange(of: selectedTab) { newTab in
            loadedTabs.insert(newTab)
        }
        .onChange(of: scenePhase) { newPhase in
            guard newPhase == .active else { return }
            Task(priority: .utility) {
                await BillfoldSnapshotStore.shared.prewarmIfNeeded()
            }
        }
    }
}

// MARK: - Gary Page (Hub ⟷ Talk to Gary)

enum GaryPageMode: String, CaseIterable { case hub = "Hub", talk = "Talk to Gary" }

/// The center Gary tab hosts two capabilities behind a segmented switch:
/// the information "Hub" (Today's Edges) and the "Talk to Gary" voice/chat orb.
/// Talk is created lazily (only when selected) so the orb/mic isn't live on Hub.
struct GaryPage: View {
    @Binding var selectedTab: Int
    @State private var mode: GaryPageMode = .hub

    var body: some View {
        ZStack {
            LiquidGlassBackground(grainDensity: 0)

            VStack(spacing: 0) {
                modeSwitch
                    .padding(.top, 8)
                    .padding(.bottom, 6)

                Group {
                    if mode == .hub {
                        // Start at the hub; tapping a connection moves the user
                        // over to that game's picks on the Picks tab, focused on
                        // the tapped matchup (via PicksFocusState).
                        PropsHubView(league: "MLB") { game in
                            PicksFocusState.shared.focusGame = game
                            selectedTab = 3
                        }
                    } else {
                        GaryChatView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private var modeSwitch: some View {
        HStack(spacing: 6) {
            ForEach(GaryPageMode.allCases, id: \.self) { m in
                let on = m == mode
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { mode = m }
                } label: {
                    Text(m.rawValue)
                        .font(.system(size: 13, weight: .heavy))
                        .tracking(0.3)
                        .foregroundStyle(on ? Color.black.opacity(0.85) : .white.opacity(0.55))
                        .padding(.horizontal, 16).padding(.vertical, 7)
                        .background(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(on ? GaryColors.gold : Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            Capsule()
                .fill(Color(hex: "#161618"))
                .overlay(Capsule().stroke(Color.white.opacity(0.08), lineWidth: 1))
        )
    }
}

// MARK: - Settings Menu Button (Three-dot)

struct SettingsMenuButton: View {
    @Binding var showingSettings: Bool
    
    var body: some View {
        Button {
            showingSettings = true
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(GaryColors.gold.opacity(0.6))
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Settings")
        .accessibilityHint("Opens settings menu")
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
                    barShape.fill(Color(hex: "#161618"))
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
                    .font(.system(size: 10, weight: .semibold))
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
            Image("GaryHead")
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

// MARK: - Old tab bar (unused, kept for reference)
private struct _LegacyCompactTabBar: View {
    @Binding var selectedTab: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var tabs: [(icon: String, label: String)] {
        [
            ("house.fill", "Home"),
            ("list.bullet.rectangle.fill", "Picks"),
            ("person.text.rectangle", "Props"),
            ("trophy.fill", "Fantasy"),
            ("chart.bar.fill", "Billfold")
        ]
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(tabs.indices, id: \.self) { index in
                Button {
                    if PerformanceMode.current.useExpensiveEffects && !reduceMotion {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedTab = index
                        }
                    } else {
                        selectedTab = index
                    }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tabs[index].icon)
                            .font(.system(size: 18, weight: .semibold))
                        Text(tabs[index].label)
                            .font(.system(size: 9, weight: .medium))
                    }
                    .foregroundStyle(selectedTab == index ? GaryColors.gold : .white.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background {
                        if selectedTab == index {
                            Capsule()
                                .fill(GaryColors.gold.opacity(0.15))
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(tabs[index].label) tab")
                .accessibilityHint(selectedTab == index ? "Currently selected" : "Double tap to switch to \(tabs[index].label)")
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // 1. Base glass material
                    Capsule()
                        .fill(.ultraThinMaterial)

                    // 2. Gold-tinted overlay
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.gold.opacity(0.12),
                                    GaryColors.gold.opacity(0.04)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    // 3. Liquid shine (top highlight)
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [.white.opacity(0.4), .white.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                        .blendMode(.overlay)

                    // 4. Premium gold edge
                    Capsule()
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.5),
                                    GaryColors.gold.opacity(0.25),
                                    GaryColors.gold.opacity(0.1)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
                .shadow(color: GaryColors.gold.opacity(0.15), radius: 16, y: 8)
                .shadow(color: .black.opacity(0.3), radius: 12, y: 6)
            } else {
                // Lighter version for iOS 15 and below
                ZStack {
                    Capsule()
                        .fill(Color(hex: "#1A1A1E"))
                    
                    Capsule()
                        .stroke(GaryColors.gold.opacity(0.3), lineWidth: 0.8)
                }
                .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 8)
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

#Preview {
    ContentView()
        .environmentObject(AuthManager.shared)
        .preferredColorScheme(.dark)
}
