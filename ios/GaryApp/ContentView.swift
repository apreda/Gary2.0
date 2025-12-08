import SwiftUI

// MARK: - Main Tab View with Liquid Glass

struct ContentView: View {
    @State private var selectedTab: Int = 0
    @Namespace private var tabAnimation
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // Content - Using standard tab switching instead of page style
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
                    SettingsView()
                default:
                    HomeView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            
            // Custom Floating Tab Bar
            FloatingTabBar(selectedTab: $selectedTab, namespace: tabAnimation)
        }
        .ignoresSafeArea(.keyboard)
    }
}

// MARK: - Floating Tab Bar

struct FloatingTabBar: View {
    @Binding var selectedTab: Int
    var namespace: Namespace.ID
    
    private let tabs: [(icon: String, label: String)] = [
        ("house.fill", "Home"),
        ("list.bullet.rectangle.fill", "Picks"),
        ("sportscourt.fill", "Props"),
        ("wallet.pass.fill", "Billfold"),
        ("gearshape.fill", "Settings")
    ]
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs.indices, id: \.self) { index in
                TabBarButton(
                    icon: tabs[index].icon,
                    label: tabs[index].label,
                    isSelected: selectedTab == index,
                    namespace: namespace
                ) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                        selectedTab = index
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background {
            ZStack {
                // Base Material (Refraction)
                Capsule()
                    .fill(.ultraThinMaterial)
                    .opacity(0.9)
                
                // Liquid Shine (Overlay Blend)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.4), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // Edge Light (Rim)
                Capsule()
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.5), .white.opacity(0.1)],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.8
                    )
            }
        }
        .shadow(color: .black.opacity(0.2), radius: 16, y: 10)
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
    }
}

struct TabBarButton: View {
    let icon: String
    let label: String
    let isSelected: Bool
    var namespace: Namespace.ID
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    if isSelected {
                        Circle()
                            .fill(GaryColors.goldGradient)
                            .frame(width: 44, height: 44)
                            .shadow(color: GaryColors.gold.opacity(0.4), radius: 8, y: 4)
                            .matchedGeometryEffect(id: "tabIndicator", in: namespace)
                    }
                    
                    Image(systemName: icon)
                        .font(.system(size: isSelected ? 18 : 20, weight: .semibold))
                        .foregroundStyle(isSelected ? .black : .white.opacity(0.6))
                        .scaleEffect(isSelected ? 1.0 : 0.9)
                }
                .frame(width: 50, height: 44)
                
                Text(label)
                    .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                    .foregroundStyle(isSelected ? GaryColors.gold : .white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
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
