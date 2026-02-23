import SwiftUI

// MARK: - Main Tab View with Liquid Glass

struct ContentView: View {
    @State private var selectedTab: Int = 0
    @State private var showingSettings = false
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // Content Views - Use conditional animation for older iOS
            ZStack(alignment: .topTrailing) {
                Group {
                    switch selectedTab {
                    case 0:
                        HomeView()
                    case 1:
                        GaryPicksView()
                    case 2:
                        GaryPropsView()
                    case 3:
                        BillfoldView()
                    case 4:
                        GaryFantasyView()
                    default:
                        HomeView()
                    }
                }
                .transaction { transaction in
                    // Disable animations on older iOS for smoother tab switching
                    if !PerformanceMode.current.useExpensiveEffects {
                        transaction.animation = nil
                    }
                }

                // Settings button — floating top right on every page
                SettingsMenuButton(showingSettings: $showingSettings)
                    .padding(.top, 12)
                    .padding(.trailing, 16)
            }

            // Compact Floating Tab Bar
            CompactTabBar(selectedTab: $selectedTab)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheetView()
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
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(GaryColors.gold)
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(.ultraThinMaterial)
                        .overlay(
                            Circle()
                                .stroke(GaryColors.gold.opacity(0.3), lineWidth: 0.5)
                        )
                )
        }
        .buttonStyle(.plain)
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

    private let tabs: [(icon: String, label: String)] = [
        ("house.fill", "Home"),
        ("list.bullet.rectangle.fill", "Picks"),
        ("sportscourt.fill", "Props"),
        ("wallet.pass.fill", "Billfold"),
        ("trophy.fill", "Fantasy")
    ]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(tabs.indices, id: \.self) { index in
                Button {
                    if PerformanceMode.current.useExpensiveEffects {
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
        .preferredColorScheme(.dark)
}
