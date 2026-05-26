import SwiftUI

// Shared state for pick detail overlay visibility
class PickDetailState: ObservableObject {
    static let shared = PickDetailState()
    @Published var isShowing = false
}

// MARCH MADNESS BRACKET ARCHIVED — set to true next March to re-enable the Bracket tab.
// All bracket code (MarchMadnessBracketView, BracketView.swift, etc.) remains intact.
let showBracketTab = false

// MARK: - Main Tab View with Liquid Glass

// New tab layout — Gary is the bigger center tab.
//   0: Home
//   1: Picks
//   2: GARY (center, bigger)
//   3: Props
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
                    tabPage(1) { GaryPicksView() }
                    tabPage(2) { GaryChatView() }       // NEW — Gary's voice/orb experience
                    tabPage(3) { GaryPropsView() }
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
            // Migrate any out-of-range persisted index (e.g. user was on old Fantasy/Bracket index)
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
struct GaryCenteredTabBar: View {
    @Binding var selectedTab: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var garyPulse: Bool = false

    // Side tabs in display order. Gary slots between index 1 and 2 visually.
    private struct SideTab { let icon: String; let label: String; let index: Int }
    private let leftTabs: [SideTab] = [
        SideTab(icon: "house.fill", label: "Home", index: 0),
        SideTab(icon: "list.bullet.rectangle.fill", label: "Picks", index: 1),
    ]
    private let rightTabs: [SideTab] = [
        SideTab(icon: "person.text.rectangle", label: "Props", index: 3),
        SideTab(icon: "chart.bar.fill", label: "Billfold", index: 4),
    ]
    private let garyTabIndex: Int = 2

    var body: some View {
        ZStack(alignment: .top) {
            // Main pill row
            HStack(spacing: 2) {
                ForEach(leftTabs, id: \.index) { tab in sideTabButton(tab) }
                // Spacer for the raised Gary button
                Color.clear.frame(maxWidth: .infinity).frame(height: 1)
                ForEach(rightTabs, id: \.index) { tab in sideTabButton(tab) }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
            .background(tabBarBackground)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            // Raised Gary button — pops above the pill
            garyCenterButton
                .offset(y: -18)
        }
    }

    // MARK: - Side tab button (Home/Picks/Props/Billfold)

    private func sideTabButton(_ tab: SideTab) -> some View {
        Button {
            tabAction(index: tab.index)
        } label: {
            VStack(spacing: 3) {
                Image(systemName: tab.icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(tab.label)
                    .font(.system(size: 9, weight: .medium))
            }
            .foregroundStyle(selectedTab == tab.index ? GaryColors.gold : .white.opacity(0.6))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background {
                if selectedTab == tab.index {
                    Capsule().fill(GaryColors.gold.opacity(0.15))
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tab.label) tab")
    }

    // MARK: - Gary center button (the star of the show)

    private var garyCenterButton: some View {
        Button {
            tabAction(index: garyTabIndex)
        } label: {
            ZStack {
                // Outer glow halo — pulses gently
                Circle()
                    .fill(GaryColors.gold)
                    .frame(width: 78, height: 78)
                    .blur(radius: 14)
                    .opacity(garyPulse ? 0.55 : 0.30)
                    .scaleEffect(garyPulse ? 1.08 : 1.0)
                    .animation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true), value: garyPulse)

                // Main button body — gold gradient
                Circle()
                    .fill(
                        RadialGradient(
                            gradient: Gradient(colors: [
                                Color(red: 1.0, green: 0.88, blue: 0.48),
                                GaryColors.gold,
                                Color(red: 0.55, green: 0.36, blue: 0.10),
                            ]),
                            center: .center,
                            startRadius: 0,
                            endRadius: 36
                        )
                    )
                    .frame(width: 64, height: 64)
                    .overlay(
                        Circle()
                            .strokeBorder(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.6), Color.clear, GaryColors.gold.opacity(0.4)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.5
                            )
                    )
                    .shadow(color: GaryColors.gold.opacity(0.55), radius: 12, y: 4)
                    .shadow(color: .black.opacity(0.45), radius: 8, y: 4)

                // "GARY" wordmark
                Text("GARY")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .tracking(0.8)
                    .foregroundStyle(.black)

                // Selected ring overlay
                if selectedTab == garyTabIndex {
                    Circle()
                        .strokeBorder(GaryColors.gold, lineWidth: 2)
                        .frame(width: 70, height: 70)
                        .opacity(0.85)
                }
            }
            .scaleEffect(selectedTab == garyTabIndex ? 1.06 : 1.0)
            .animation(.spring(response: 0.4, dampingFraction: 0.65), value: selectedTab)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Talk to Gary")
        .onAppear { garyPulse = true }
    }

    // MARK: - Tab bar background (glassy gold-tinted)

    @ViewBuilder
    private var tabBarBackground: some View {
        if PerformanceMode.current.useExpensiveEffects {
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(
                    LinearGradient(
                        colors: [GaryColors.gold.opacity(0.12), GaryColors.gold.opacity(0.04)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                Capsule().fill(
                    LinearGradient(
                        colors: [.white.opacity(0.40), .white.opacity(0)],
                        startPoint: .top,
                        endPoint: .center
                    )
                )
                .blendMode(.overlay)
                Capsule().strokeBorder(
                    LinearGradient(
                        colors: [
                            GaryColors.lightGold.opacity(0.5),
                            GaryColors.gold.opacity(0.25),
                            GaryColors.gold.opacity(0.10),
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
            ZStack {
                Capsule().fill(Color(hex: "#1A1A1E"))
                Capsule().stroke(GaryColors.gold.opacity(0.3), lineWidth: 0.8)
            }
            .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
        }
    }

    // MARK: - Tap action

    private func tabAction(index: Int) {
        if PerformanceMode.current.useExpensiveEffects && !reduceMotion {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
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
        var items: [(icon: String, label: String)] = [
            ("house.fill", "Home"),
            ("list.bullet.rectangle.fill", "Picks"),
            ("person.text.rectangle", "Props")
        ]
        if showBracketTab {
            items.append(("basketball.fill", "Bracket"))
        }
        items.append(("trophy.fill", "Fantasy"))
        items.append(("chart.bar.fill", "Billfold"))
        return items
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
