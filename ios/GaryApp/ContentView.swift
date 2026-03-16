import SwiftUI

// Shared state for pick detail overlay visibility
class PickDetailState: ObservableObject {
    static let shared = PickDetailState()
    @Published var isShowing = false
}

// MARK: - Main Tab View with Liquid Glass

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @State private var showingSettings = false
    @StateObject private var pickDetailState = PickDetailState.shared
    @State private var loadedTabs: Set<Int> = []

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
            // Content Views - Use conditional animation for older iOS
            ZStack(alignment: .topTrailing) {
                ZStack(alignment: .topTrailing) {
                    tabPage(0) { HomeView() }
                    tabPage(1) { GaryPicksView() }
                    tabPage(2) { GaryPropsView() }
                    tabPage(3) { MarchMadnessBracketView() }
                    tabPage(4) { GaryFantasyView() }
                    tabPage(5) { BillfoldView() }
                }
                .transaction { transaction in
                    // Disable animations on older iOS for smoother tab switching
                    if !PerformanceMode.current.useExpensiveEffects {
                        transaction.animation = nil
                    }
                }

                // Settings button — floating top right on every page (hidden on Billfold which has its own, and when pick detail is open)
                if !pickDetailState.isShowing && selectedTab != 5 {
                    SettingsMenuButton(showingSettings: $showingSettings)
                        .padding(.top, 4)
                        .padding(.trailing, 16)
                }
            }

            // Compact Floating Tab Bar
            CompactTabBar(selectedTab: $selectedTab)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheetView()
                .environmentObject(authManager)
        }
        .task {
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

// MARK: - Compact Floating Tab Bar (Original Style)

struct CompactTabBar: View {
    @Binding var selectedTab: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let tabs: [(icon: String, label: String)] = [
        ("house.fill", "Home"),
        ("list.bullet.rectangle.fill", "Picks"),
        ("sportscourt.fill", "Props"),
        ("basketball.fill", "Bracket"),
        ("trophy.fill", "Fantasy"),
        ("chart.bar.fill", "Billfold")
    ]

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
