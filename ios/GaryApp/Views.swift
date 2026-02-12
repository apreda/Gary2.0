import SwiftUI
import WebKit

// MARK: - Performance Helpers

/// Detects if device needs performance optimizations based on hardware capability
enum PerformanceMode {
    /// Full effects for high-end devices (iOS 18+ or ProMotion displays)
    case full
    /// Lighter effects for older/slower devices
    case lite
    
    static var current: PerformanceMode {
        // iOS 18+ devices are generally powerful enough for full effects
        // iOS 17 and below (including iPhone 14 on iOS 17) get lite mode
        if #available(iOS 18.0, *) {
            return .full
        } else {
            return .lite
        }
    }
    
    /// Whether to use expensive effects like blend modes and multiple shadows
    var useExpensiveEffects: Bool {
        self == .full
    }
}

// MARK: - Async Helpers

/// Execute an async operation with a timeout
func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask {
            try await operation()
        }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw URLError(.timedOut)
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }
}

// MARK: - Liquid Glass Design System

/// True Liquid Glass modifier using overlay blend mode for authentic refraction
extension View {
    func liquidGlass(cornerRadius: CGFloat = 20, intensity: GlassIntensity = .regular) -> some View {
        self.background {
            ZStack {
                // 1. Base Material (The Refraction)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(intensity.material)
                    .opacity(intensity.opacity)
                
                // 2. Liquid Shine (Top Gradient with Overlay Blend)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.45), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // 3. Edge Light (Rim)
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
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
        // 4. Drop Shadow (Depth)
        .shadow(color: .black.opacity(0.15), radius: 10, y: 8)
    }
    
    func liquidGlassInteractive(cornerRadius: CGFloat = 20) -> some View {
        self.liquidGlass(cornerRadius: cornerRadius, intensity: .regular)
    }
    
    func liquidGlassCircle(intensity: GlassIntensity = .regular) -> some View {
        self.background {
            ZStack {
                // Base Material
                Circle()
                    .fill(intensity.material)
                    .opacity(intensity.opacity)
                
                // Liquid Shine
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.45), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // Edge Light
                Circle()
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
        .shadow(color: .black.opacity(0.12), radius: 8, y: 6)
    }
    
    func liquidGlassCapsule(intensity: GlassIntensity = .regular) -> some View {
        self.background {
            ZStack {
                // Base Material
                Capsule()
                    .fill(intensity.material)
                    .opacity(intensity.opacity)
                
                // Liquid Shine
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.45), .white.opacity(0.0)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .blendMode(.overlay)
                
                // Edge Light
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
        .shadow(color: .black.opacity(0.1), radius: 6, y: 4)
    }
    
    /// Dark solid card - for "Why Gary" section
    func darkCard(cornerRadius: CGFloat = 14) -> some View {
        self.background {
            ZStack {
                // Solid dark background
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color(hex: "#0D0D0F"))
                
                // Subtle top edge highlight
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [.white.opacity(0.12), .white.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.5
                    )
            }
        }
        .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
    }
    
    /// Gold gradient glass - Full design on iOS 16+, lighter on older
    func goldGlass(cornerRadius: CGFloat = 12) -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // Gold gradient background (light gold to darker gold)
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.3),
                                    GaryColors.gold.opacity(0.2)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    
                    // Gold gradient border
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [GaryColors.lightGold.opacity(0.6), GaryColors.gold.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(GaryColors.gold.opacity(0.15))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.4), lineWidth: 0.8)
                    )
            }
        }
    }
    
    /// Gold gradient glass circle - Full design on iOS 16+, lighter on older
    func goldGlassCircle() -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.3),
                                    GaryColors.gold.opacity(0.2)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    
                    Circle()
                        .strokeBorder(
                            LinearGradient(
                                colors: [GaryColors.lightGold.opacity(0.6), GaryColors.gold.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                Circle()
                    .fill(GaryColors.gold.opacity(0.15))
                    .overlay(
                        Circle()
                            .stroke(GaryColors.gold.opacity(0.4), lineWidth: 0.8)
                    )
            }
        }
    }

    /// Accent-colored glass effect for badges (uses sport accent color instead of gold)
    func accentGlass(color: Color, cornerRadius: CGFloat = 8) -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // Accent gradient background
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    color.opacity(0.25),
                                    color.opacity(0.12)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    // Subtle border with accent color
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [color.opacity(0.5), color.opacity(0.25)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.8
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(color.opacity(0.15))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(color.opacity(0.4), lineWidth: 0.8)
                    )
            }
        }
    }

    /// Premium liquid glass button - Full design on iOS 16+, lighter on older
    func liquidGlassButton(cornerRadius: CGFloat = 12) -> some View {
        self.background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                ZStack {
                    // 1. Base glass with subtle gold tint
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial)

                    // 2. Gold-tinted overlay
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    GaryColors.gold.opacity(0.15),
                                    GaryColors.gold.opacity(0.05)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    // 3. Liquid shine (top highlight)
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [.white.opacity(0.5), .white.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                        .blendMode(.overlay)
                    
                    // 4. Premium gold edge
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    GaryColors.lightGold.opacity(0.6),
                                    GaryColors.gold.opacity(0.3),
                                    GaryColors.gold.opacity(0.1)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
            } else {
                // Lighter version for iOS 15 and below
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(GaryColors.gold.opacity(0.1))
                    
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.4), lineWidth: 1)
                }
            }
        }
        .modifier(ConditionalShadow(
            color: GaryColors.gold.opacity(0.2),
            radius: 12,
            y: 6
        ))
    }
}

/// Applies shadow only on iOS 16+ for performance
struct ConditionalShadow: ViewModifier {
    let color: Color
    let radius: CGFloat
    let y: CGFloat
    
    func body(content: Content) -> some View {
        if PerformanceMode.current.useExpensiveEffects {
            content
                .shadow(color: color, radius: radius, y: y)
                .shadow(color: .black.opacity(0.15), radius: radius * 0.67, y: y * 0.67)
        } else {
            content
        }
    }
}

enum GlassIntensity {
    case clear
    case regular
    case prominent
    
    var material: Material {
        switch self {
        case .clear: return .ultraThinMaterial
        case .regular: return .ultraThinMaterial
        case .prominent: return .thinMaterial
        }
    }
    
    var opacity: Double {
        switch self {
        case .clear: return 0.7
        case .regular: return 0.85
        case .prominent: return 0.95
        }
    }
}

// MARK: - Enhanced Theme Colors

enum GaryColors {
    // Core brand colors with P3 gamut
    static let gold = Color(hex: "#C9A227")
    static let lightGold = Color(hex: "#E8D48B")
    static let warmGold = Color(hex: "#F4E4BA")
    static let cream = Color(hex: "#FAF8F5")
    
    // Deep backgrounds
    static let darkBg = Color(hex: "#08080A")
    static let cardBg = Color(hex: "#121214")
    static let elevatedBg = Color(hex: "#1A1A1E")
    
    // Glass tints
    static let glassTint = Color.white.opacity(0.08)
    static let glassHighlight = Color.white.opacity(0.15)
    static let glassBorder = Color.white.opacity(0.12)
    
    // Accent gradients
    static let goldGradient = LinearGradient(
        colors: [Color(hex: "#E8D48B"), Color(hex: "#C9A227"), Color(hex: "#8B6914")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    static let premiumGradient = LinearGradient(
        colors: [Color(hex: "#C9A227").opacity(0.8), Color(hex: "#8B6914").opacity(0.4)],
        startPoint: .top,
        endPoint: .bottom
    )
    
    // NFL Green (same as prop picks)
    static let nflAccent = Color(hex: "#22C55E")
}

// MARK: - Immersive Background

struct LiquidGlassBackground: View {
    var accentColor: Color = GaryColors.gold
    
    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Base: 80% Black (Dark Grey)
                Color(hex: "#1A1A1C")
                
                // Mix of White Gold and Grey
                LinearGradient(
                    colors: [
                        GaryColors.lightGold.opacity(0.1),  // White Gold
                        Color.gray.opacity(0.15),           // Grey
                        Color.black.opacity(0.4)            // Fade
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                
                // Vignette
                RadialGradient(
                    colors: [
                        Color.clear,
                        Color.black.opacity(0.6)
                    ],
                    center: .center,
                    startRadius: geo.size.width * 0.3,
                    endRadius: geo.size.width * 1.2
                )
            }
        }
        .ignoresSafeArea()
    }
}

// MARK: - Performance Banner (Yesterday's Game Picks Record)

struct PerformanceBanner: View {
    let wins: Int
    let losses: Int
    let pushes: Int
    let sportBreakdown: [SupabaseAPI.SportRecord]
    
    private var total: Int { wins + losses }
    private var winRate: Double { total > 0 ? Double(wins) / Double(total) : 0 }
    
    private var moodGradient: LinearGradient {
        if winRate >= 0.80 {
            // Fire - Red/Orange flame
            return LinearGradient(colors: [Color(hex: "#EF4444"), Color(hex: "#F97316")], startPoint: .topLeading, endPoint: .bottomTrailing)
        } else if winRate >= 0.70 {
            // Cooking - Orange/Amber
            return LinearGradient(colors: [Color(hex: "#F97316"), Color(hex: "#F59E0B")], startPoint: .topLeading, endPoint: .bottomTrailing)
        } else if winRate >= 0.60 {
            // Beer - Gold/Green (celebratory)
            return LinearGradient(colors: [Color(hex: "#F59E0B"), Color(hex: "#10B981")], startPoint: .topLeading, endPoint: .bottomTrailing)
        } else if winRate >= 0.50 {
            // Worried - Yellow/Amber (cautious)
            return LinearGradient(colors: [Color(hex: "#EAB308"), Color(hex: "#CA8A04")], startPoint: .topLeading, endPoint: .bottomTrailing)
        } else if winRate >= 0.40 {
            // Ice Cold - Light blue/Cyan
            return LinearGradient(colors: [Color(hex: "#06B6D4"), Color(hex: "#0891B2")], startPoint: .topLeading, endPoint: .bottomTrailing)
        } else {
            // Doomsday - Dark blue/Purple
            return LinearGradient(colors: [Color(hex: "#6366F1"), Color(hex: "#4F46E5")], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
    
    private var moodLabel: String {
        if winRate >= 0.80 { return "The Bear Is On Fire" }
        else if winRate >= 0.70 { return "Gary's Cooking" }
        else if winRate >= 0.60 { return "The Process Works" }
        else if winRate >= 0.50 { return "Grinding" }
        else if winRate >= 0.40 { return "Ice Cold" }
        else { return "Bounce Back Loading" }
    }
    
    private var moodImage: String {
        if winRate >= 0.80 { return "GaryFire" }
        else if winRate >= 0.70 { return "GaryCooking" }
        else if winRate >= 0.60 { return "GaryBeer" }
        else if winRate >= 0.50 { return "GaryWorried" }
        else if winRate >= 0.40 { return "GaryIceCold" }
        else { return "GaryDoomsday" }
    }
    
    var body: some View {
        VStack(spacing: 12) {
            // Main Record Row - Compact, no image (hero shows mood)
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    // Record + Yesterday
                    HStack(spacing: 7) {
                        Text("\(wins)-\(losses)")
                            .font(.system(size: 26, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)
                        
                        Text("YESTERDAY")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.secondary)
                            .tracking(0.5)
                        
                        if pushes > 0 {
                            Text("• \(pushes)P")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.tertiary)
                        }
                    }
                    
                    // Mood Label - explains the hero image
                    Text(moodLabel)
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundStyle(moodGradient)
                }
                
                Spacer()
                
                // Win rate indicator
                VStack(spacing: 2) {
                    Text("\(Int(winRate * 100))%")
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .foregroundStyle(winRate >= 0.5 ? Color(hex: "#10B981") : Color(hex: "#EF4444"))
                    
                    Text("WIN RATE")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)
                }
            }
            
            // Sport-by-Sport Breakdown
            if !sportBreakdown.isEmpty {
                Divider()
                    .background(Color.white.opacity(0.12))
                
                HStack(spacing: 0) {
                    ForEach(Array(sportBreakdown.prefix(4).enumerated()), id: \.element.id) { index, sport in
                        if index > 0 {
                            Rectangle()
                                .fill(Color.white.opacity(0.12))
                                .frame(width: 1, height: 38)
                        }
                        
                        SportMiniCard(sport: sport)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#0A0A0C"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.5), GaryColors.gold.opacity(0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
        .shadow(color: GaryColors.gold.opacity(0.15), radius: 16, x: 0, y: 4)
        .shadow(color: GaryColors.gold.opacity(0.08), radius: 32, x: 0, y: 8)
    }
}

// MARK: - Sport Mini Card (for breakdown)

struct SportMiniCard: View {
    let sport: SupabaseAPI.SportRecord
    
    var body: some View {
        VStack(spacing: 5) {
            // League name as header
            Text(sport.league)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(sport.color)
                .tracking(0.3)
            
            // Record
            HStack(spacing: 2) {
                Text("\(sport.wins)")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(sport.wins > 0 ? Color(hex: "#10B981") : .secondary)
                Text("-")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.tertiary)
                Text("\(sport.losses)")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    // Always subtle gray for losses - keeps focus on the green wins
                    .foregroundStyle(Color.white.opacity(0.35))
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Home View

struct HomeView: View {
    @State private var freePick: GaryPick?
    @State private var loading = true
    @State private var animateIn = false
    @State private var yesterdayRecord: (wins: Int, losses: Int, pushes: Int) = (0, 0, 0)
    @State private var sportBreakdown: [SupabaseAPI.SportRecord] = []
    @State private var performanceLoaded = false  // Track if performance data has been fetched
    
    // Dynamic hero image based on most recent performance
    private var heroImage: String {
        let total = yesterdayRecord.wins + yesterdayRecord.losses
        guard total > 0 else { return "GaryCoin" } // Fallback (rarely shown now)
        
        let winRate = Double(yesterdayRecord.wins) / Double(total)
        if winRate >= 0.80 { return "GaryFire" }
        else if winRate >= 0.70 { return "GaryCooking" }
        else if winRate >= 0.60 { return "GaryBeer" }
        else if winRate >= 0.50 { return "GaryWorried" }
        else if winRate >= 0.40 { return "GaryIceCold" }
        else { return "GaryDoomsday" }
    }
    
    // Glow color for hero image shadow
    private var heroImageGlow: Color {
        let total = yesterdayRecord.wins + yesterdayRecord.losses
        guard total > 0 else { return GaryColors.gold }
        
        let winRate = Double(yesterdayRecord.wins) / Double(total)
        if winRate >= 0.80 { return Color(hex: "#EF4444") } // Red/fire
        else if winRate >= 0.70 { return Color(hex: "#F97316") } // Orange
        else if winRate >= 0.60 { return Color(hex: "#10B981") } // Green
        else if winRate >= 0.50 { return Color(hex: "#EAB308") } // Yellow
        else if winRate >= 0.40 { return Color(hex: "#06B6D4") } // Cyan
        else { return Color(hex: "#6366F1") } // Purple
    }
    
    var body: some View {
        ZStack {
            // Background - ignores safe area (fills entire screen)
            LiquidGlassBackground()
            
            // Content - respects safe area
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    // Header - Brand
                    VStack(spacing: 4) {
                        Text("GARY A.I.")
                            .font(.system(size: 30, weight: .heavy))
                            .tracking(1)
                            .foregroundStyle(GaryColors.goldGradient)
                            .shadow(color: GaryColors.gold.opacity(0.2), radius: 12)

                        Text("Sharp Sports Analysis")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color.white.opacity(0.4))
                    }
                    .padding(.top, 2)
                    
                    // Hero Image - Dynamic based on Gary's most recent performance
                    // Only show once performance data is loaded to prevent flash
                    if performanceLoaded {
                        Image(heroImage)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 262, height: 262)
                            .shadow(color: heroImageGlow.opacity(0.5), radius: 30)
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 20)
                            .transition(.opacity.combined(with: .scale(scale: 0.95)))
                    } else {
                        // Placeholder while loading - maintains layout
                        Color.clear
                            .frame(width: 262, height: 262)
                    }
                    
                    // Yesterday's Performance Banner (Game Picks only)
                    if yesterdayRecord.wins + yesterdayRecord.losses > 0 {
                        PerformanceBanner(
                            wins: yesterdayRecord.wins,
                            losses: yesterdayRecord.losses,
                            pushes: yesterdayRecord.pushes,
                            sportBreakdown: sportBreakdown
                        )
                        .padding(.horizontal, 16)
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 25)
                        .animation(.easeOut(duration: 0.6).delay(0.15), value: animateIn)
                    }
                    
                    // Today's Free Pick
                    if let pick = freePick {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: "star.fill")
                                    .foregroundStyle(GaryColors.goldGradient)
                                Text("TODAY'S TOP PICK")
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal, 4)
                            
                            PickCardMobile(pick: pick)
                        }
                        .padding(.horizontal, 16)
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 30)
                        .animation(.easeOut(duration: 0.6).delay(0.2), value: animateIn)
                    } else if !loading {
                        // Placeholder - Blurred mock pick card
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: "star.fill")
                                    .foregroundStyle(GaryColors.goldGradient)
                                Text("TODAY'S TOP PICK")
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal, 4)
                            
                            // Blurred mock pick card with overlay
                            ZStack {
                                // Mock Pick Card (blurred)
                                MockPickCard()
                                    .blur(radius: 12)
                                
                                // Dark overlay for better text readability
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .fill(Color.black.opacity(0.4))
                                
                                // "Picks Generated Daily" overlay
                                VStack(spacing: 12) {
                                    Image(systemName: "clock.fill")
                                        .font(.system(size: 36))
                                        .foregroundStyle(GaryColors.gold)
                                    
                                    Text("Picks Generated Daily")
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundStyle(.white)
                                    
                                    Text("Check back soon for today's analysis")
                                        .font(.system(size: 13))
                                        .foregroundStyle(.white.opacity(0.7))
                                }
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                        .padding(.horizontal, 16)
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 30)
                        .animation(.easeOut(duration: 0.6).delay(0.2), value: animateIn)
                    }
                    
                    // The Bears Brain Section - How Gary Works
                    VStack(alignment: .leading, spacing: 16) {
                        Text("THE BEARS BRAIN")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(GaryColors.gold)
                            .tracking(1)
                            .padding(.horizontal, 4)

                        VStack(spacing: 14) {
                            HeroBenefitCard(title: "The Steel Man Process", text: "Before every pick, Gary builds the strongest possible case for both sides of the game using real data. No bias, no predetermined winner. He argues both cases, grades the evidence, and only commits when one side clearly holds up.", badge: "BOTH SIDES")

                            HeroBenefitCard(title: "Finding Where the Line Is Wrong", text: "Gary doesn't just pick who wins—the spread already reflects that. His job is finding where the number is mispriced. When the line says 8 but the efficiency data says 5, that gap is where value lives. That's how sharps think.", badge: "SHARP THINKING")

                            HeroBenefitCard(title: "Predictive Stats Over Box Scores", text: "Not all stats are equal. Gary prioritizes metrics that predict future outcomes—offensive efficiency, defensive ratings, pace, shooting quality—over stats that just describe the past like records and streaks. Records explain the line. Efficiency tells you if it's right.", badge: "THE DATA")

                            HeroBenefitCard(title: "Real-Time Before Every Pick", text: "Gary searches for the latest injury reports, lineup changes, and breaking news before every analysis. Advanced stats pulled directly from professional sports databases. He sees who's playing, who's out, and what changed today—not last week.", badge: "LIVE INTEL")

                            HeroBenefitCard(title: "A Different Playbook for Each Sport", text: "Each sport has its own deep analytical framework with dozens of factors tailored to what actually moves the needle in that league. Gary doesn't apply the same generic model everywhere—he knows what matters in the NBA is different from what matters in the NFL, NHL, or college basketball.", badge: "SPORT-SPECIFIC")

                            HeroBenefitCard(title: "Stress-Tested Against Common Traps", text: "Injury overreactions where the line moved too far. Shooting streaks built on variance, not real improvement. Lookahead spots where favorites are already thinking about their next game. Gary stress-tests every pick against known betting traps before committing.", badge: "TRAP DETECTION")
                        }
                    }
                    .padding(.horizontal, 16)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.easeOut(duration: 0.6).delay(0.4), value: animateIn)
                }
                .padding(.horizontal, 4) // Ensure content doesn't touch edges
                .padding(.bottom, 100) // Space for floating tab bar
            }
        }
        .task {
            // PARALLEL FETCH: Run all independent API calls simultaneously
            // This reduces load time from ~600ms to ~200ms
            
            let date = SupabaseAPI.todayEST()
            
            // Start all fetches in parallel using async let
            async let recordFetch = SupabaseAPI.fetchYesterdayGameRecord()
            async let breakdownFetch = SupabaseAPI.fetchYesterdayBySport()
            async let picksFetch = SupabaseAPI.fetchAllPicks(date: date)
            
            // Wait for performance record first (needed for hero image)
            if let record = try? await recordFetch {
                yesterdayRecord = record
            }
            
            // Mark performance as loaded - now safe to show hero image
            withAnimation(.easeOut(duration: 0.5)) {
                performanceLoaded = true
            }
            
            // Start main animation after hero image is ready
            withAnimation(.easeOut(duration: 0.8)) {
                animateIn = true
            }
            
            // Get the other results (already fetched in parallel, just awaiting)
            if let breakdown = try? await breakdownFetch {
                sportBreakdown = breakdown
            }
            
            // Get picks data (already fetched in parallel)
            loading = true
            let allPicks = try? await picksFetch
            
            // Filter to TODAY's games, visible until 3am EST the next day
            // This matches the GaryPicksView logic for consistency
            let todayOnlyPicks: [GaryPick]? = allPicks?.filter { pick in
                guard let commenceTime = pick.commence_time else { return true }
                
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                let formatterNoFrac = ISO8601DateFormatter()
                formatterNoFrac.formatOptions = [.withInternetDateTime]
                
                guard let gameDate = formatter.date(from: commenceTime) ?? formatterNoFrac.date(from: commenceTime) else {
                    return true
                }
                
                // Get today's date range in EST
                var estCalendar = Calendar.current
                estCalendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
                let now = Date()
                let todayStart = estCalendar.startOfDay(for: now)
                
                // Calculate 3am EST the next day (the cutoff for "today's" picks)
                guard let tomorrowEST = estCalendar.date(byAdding: .day, value: 1, to: todayStart),
                      let cutoffTime = estCalendar.date(bySettingHour: 3, minute: 0, second: 0, of: tomorrowEST) else {
                    return true
                }
                
                // Get the game's date in EST
                let gameDayEST = estCalendar.startOfDay(for: gameDate)
                
                // Show pick if:
                // 1. Game is today (in EST), OR
                // 2. We haven't passed 3am EST yet (for late-night viewing of yesterday's picks)
                let isGameToday = estCalendar.isDate(gameDate, inSameDayAs: now)
                let isBeforeCutoff = now < cutoffTime
                let wasGameYesterday = estCalendar.isDate(gameDayEST, inSameDayAs: estCalendar.date(byAdding: .day, value: -1, to: todayStart) ?? todayStart)
                
                return isGameToday || (isBeforeCutoff && wasGameYesterday)
            }
            
            // Select Top Pick: Check for is_top_pick first, then use thesis-based scoring
            if let picks = todayOnlyPicks, !picks.isEmpty {
                // 1. Check for manual override (is_top_pick: true)
                if let manualTopPick = picks.first(where: { $0.is_top_pick == true }) {
                    freePick = manualTopPick
                } else {
                    // 2. Use thesis-based scoring (same as web app)
                    let scoredPicks = picks.compactMap { pick -> (pick: GaryPick, score: Double)? in
                        guard let thesisType = pick.thesis_type else {
                            // Fallback to confidence for old picks
                            let conf = pick.confidence ?? 0
                            return (pick, conf * 10)
                        }
                        
                        let majorCount = pick.contradicting_factors?.major?.count ?? 0
                        let confidence = pick.confidence ?? 0
                        
                        var baseScore: Double = 0
                        if thesisType == "clear_read" {
                            baseScore = 1000 - (Double(majorCount) * 100)
                        } else if thesisType == "found_angle" {
                            baseScore = 700 - (Double(majorCount) * 100)
                        } else {
                            baseScore = confidence * 10
                        }
                        
                        return (pick, baseScore + confidence)
                    }.sorted { $0.score > $1.score }
                    
                    freePick = scoredPicks.first?.pick ?? picks.first
                }
            } else {
                freePick = nil
            }
            loading = false
        }
    }
}

// MARK: - Sport Filter

enum Sport: String, CaseIterable {
    // Order: ALL → NBA → NFL → NFL TDs → NHL → NCAAB → NCAAF → EPL → MLB → WNBA
    case all = "ALL"
    case nba = "NBA"
    case nfl = "NFL"
    case nflTDs = "NFL TDs"
    case nhl = "NHL"
    case ncaab = "NCAAB"
    case ncaaf = "NCAAF"
    case epl = "EPL"
    case mlb = "MLB"
    case wnba = "WNBA"
    
    var icon: String {
        switch self {
        case .all: return "star.fill"
        case .nba: return "basketball.fill"
        case .nfl: return "football.fill"
        case .nflTDs: return "football.fill"
        case .nhl: return "hockey.puck.fill"
        case .ncaab: return "basketball.fill"
        case .ncaaf: return "football.fill"
        case .epl: return "soccerball"
        case .mlb: return "baseball.fill"
        case .wnba: return "basketball.fill"
        }
    }
    
    var accentColor: Color {
        switch self {
        case .all: return GaryColors.gold
        case .nba: return Color(hex: "#3B82F6")      // Blue
        case .nfl: return GaryColors.nflAccent        // Green
        case .nflTDs: return Color(hex: "#22C55E")   // Green
        case .nhl: return Color(hex: "#00A3E0")      // Ice Blue
        case .ncaab: return Color(hex: "#F97316")    // Orange
        case .ncaaf: return Color(hex: "#DC2626")    // Red
        case .epl: return Color(hex: "#8B5CF6")      // Purple
        case .mlb: return Color(hex: "#0EA5E9")      // Sky Blue
        case .wnba: return Color(hex: "#F97316")     // Orange
        }
    }
    
    /// Whether this sport is in beta (limited data/analytics)
    var isBeta: Bool {
        switch self {
        case .epl: return true
        default: return false
        }
    }
    
    /// Whether this is a props-only filter (not for regular picks)
    var isPropsOnly: Bool {
        switch self {
        case .nflTDs: return true
        default: return false
        }
    }
    
    static func from(league: String?) -> Sport {
        guard let league = league?.uppercased() else { return .all }
        return Sport(rawValue: league) ?? .all
    }
}

struct SportFilterBar: View {
    @Binding var selected: Sport
    let availableSports: Set<String>
    var showAll: Bool = true  // Whether to show the ALL option
    var showPropsOnly: Bool = false  // Whether to show props-only filters (like NFL TDs)
    
    // Sort sports: ALL first, then available sports, then unavailable sports (faded)
    private var sortedSports: [Sport] {
        Sport.allCases.sorted { a, b in
            // ALL always comes first
            if a == .all { return true }
            if b == .all { return false }
            
            let aAvailable = availableSports.contains(a.rawValue)
            let bAvailable = availableSports.contains(b.rawValue)
            
            // Available sports come before unavailable
            if aAvailable && !bAvailable { return true }
            if !aAvailable && bAvailable { return false }
            
            // Within same availability group, maintain original order
            let allCases = Sport.allCases
            let aIndex = allCases.firstIndex(of: a) ?? 0
            let bIndex = allCases.firstIndex(of: b) ?? 0
            return aIndex < bIndex
        }
    }
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(sortedSports, id: \.self) { sport in
                    // Skip ALL if showAll is false
                    // Skip props-only sports (like NFL TDs) unless showPropsOnly is true
                    let shouldShow = {
                        if sport == .all && !showAll { return false }
                        if sport.isPropsOnly && !showPropsOnly { return false }
                        return true
                    }()
                    
                    if shouldShow {
                        let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                        let isSelected = selected == sport
                        
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                selected = sport
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: sport.icon)
                                    .font(.system(size: 11, weight: .semibold))
                                Text(sport.rawValue)
                                    .font(.caption.bold())
                            }
                            .foregroundStyle(isSelected ? .black : (isAvailable ? .white : .gray.opacity(0.5)))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background {
                                if isSelected {
                                    Capsule()
                                        .fill(sport.accentColor)
                                        .modifier(ConditionalCapsuleShadow(color: sport.accentColor.opacity(0.4)))
                                } else {
                                    Capsule()
                                        .fill(.white.opacity(0.06))
                                        .overlay(
                                            Capsule()
                                                .stroke(.white.opacity(0.1), lineWidth: 0.5)
                                        )
                                }
                            }
                        }
                        .disabled(!isAvailable)
                        .scaleEffect(isSelected ? 1.05 : 1.0)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
        .frame(height: 44)
    }
}

// MARK: - Gary's Picks View

struct GaryPicksView: View {
    @State private var allPicks: [GaryPick] = []
    @State private var loading = true
    @State private var selectedSport: Sport = .all

    private var filteredPicks: [GaryPick] {
        // Sort picks by game time (commence_time) - earliest games first
        let sortByTime: ([GaryPick]) -> [GaryPick] = { picks in
            picks.sorted { a, b in
                let timeA = a.commence_time ?? ""
                let timeB = b.commence_time ?? ""
                return timeA < timeB
            }
        }
        
        // Show all picks for today until 3am EST the next day (no filtering by game start time)
        // This matches the web app behavior where users can see all picks for the day
        let filterToTodaysPicks: ([GaryPick]) -> [GaryPick] = { picks in
            let now = Date()
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            
            // Also try without fractional seconds
            let formatterNoFrac = ISO8601DateFormatter()
            formatterNoFrac.formatOptions = [.withInternetDateTime]
            
            // Set up EST calendar
            var estCalendar = Calendar.current
            estCalendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
            
            // Get today's date in EST
            let todayEST = estCalendar.startOfDay(for: now)
            
            // Calculate 3am EST the next day (the cutoff for "today's" picks)
            guard let tomorrowEST = estCalendar.date(byAdding: .day, value: 1, to: todayEST),
                  let cutoffTime = estCalendar.date(bySettingHour: 3, minute: 0, second: 0, of: tomorrowEST) else {
                return picks // If we can't calculate, show all picks
            }
            
            return picks.filter { pick in
                guard let commenceTime = pick.commence_time else {
                    // No time specified, show the pick
                    return true
                }
                
                // Try parsing with both formatters
                let gameDate = formatter.date(from: commenceTime) ?? formatterNoFrac.date(from: commenceTime)
                
                guard let gameDate = gameDate else {
                    // Couldn't parse date, show the pick
                    return true
                }
                
                // Get the game's date in EST
                let gameDayEST = estCalendar.startOfDay(for: gameDate)
                
                // Show pick if:
                // 1. Game is today (in EST), OR
                // 2. We haven't passed 3am EST yet (for late-night viewing of yesterday's picks)
                let isGameToday = estCalendar.isDate(gameDate, inSameDayAs: now)
                let isBeforeCutoff = now < cutoffTime
                let wasGameYesterday = estCalendar.isDate(gameDayEST, inSameDayAs: estCalendar.date(byAdding: .day, value: -1, to: todayEST) ?? todayEST)
                
                // Show if game is today, or if it's before 3am and game was yesterday
                return isGameToday || (isBeforeCutoff && wasGameYesterday)
            }
        }
        
        // Apply today's picks filter to all picks
        let upcomingPicks = filterToTodaysPicks(allPicks)
        
        // For "All" tab: interleave picks by sport (NBA, NFL, NCAAB, NHL, NCAAF, EPL, repeat)
        // This gives users variety as they scroll instead of all picks from one sport first
        guard selectedSport != .all else {
            return interleaveBySport(upcomingPicks)
        }
        return sortByTime(upcomingPicks.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue })
    }
    
    /// Interleave picks by sport in round-robin order
    /// Order: NBA, NFL, NCAAB, NHL, NCAAF, EPL (skips sports with no picks)
    private func interleaveBySport(_ picks: [GaryPick]) -> [GaryPick] {
        let sportOrder = ["NBA", "NFL", "NCAAB", "NHL", "NCAAF", "EPL"]
        
        // Sort each sport's picks by game time first
        var picksBySport: [String: [GaryPick]] = [:]
        for sport in sportOrder {
            let sportPicks = picks
                .filter { ($0.league ?? "").uppercased() == sport }
                .sorted { a, b in
                    let timeA = a.commence_time ?? ""
                    let timeB = b.commence_time ?? ""
                    return timeA < timeB
                }
            if !sportPicks.isEmpty {
                picksBySport[sport] = sportPicks
            }
        }
        
        // Track current index for each sport
        var indices: [String: Int] = [:]
        for sport in sportOrder {
            indices[sport] = 0
        }
        
        // Interleave: take one pick from each sport in order, repeat
        var result: [GaryPick] = []
        var hasMore = true
        
        while hasMore {
            hasMore = false
            for sport in sportOrder {
                guard let sportPicks = picksBySport[sport],
                      let idx = indices[sport],
                      idx < sportPicks.count else { continue }
                
                result.append(sportPicks[idx])
                indices[sport] = idx + 1
                hasMore = true
            }
        }
        
        return result
    }
    
    private var availableSports: Set<String> {
        Set(allPicks.compactMap { $0.league?.uppercased() })
    }
    
    /// Get time slot string for NFL picks (e.g., "Sunday 1:00 PM ET")
    private func getTimeSlot(for pick: GaryPick) -> String? {
        guard let isoTime = pick.commence_time, !isoTime.isEmpty else { return nil }
        
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        var date = isoFormatter.date(from: isoTime)
        if date == nil {
            isoFormatter.formatOptions = [.withInternetDateTime]
            date = isoFormatter.date(from: isoTime)
        }
        
        guard let gameDate = date else { return nil }
        
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "EEEE h:mm a"
        
        return formatter.string(from: gameDate) + " ET"
    }
    
    /// Group picks by time slot for section headers (works for all sports)
    private var picksByTimeSlot: [(timeSlot: String, picks: [GaryPick])] {
        var grouped: [String: [GaryPick]] = [:]
        var order: [String] = []
        
        for pick in filteredPicks {
            let slot = getTimeSlot(for: pick) ?? "TBD"
            if grouped[slot] == nil {
                grouped[slot] = []
                order.append(slot)
            }
            grouped[slot]?.append(pick)
        }
        
        return order.map { (timeSlot: $0, picks: grouped[$0] ?? []) }
    }
    
    var body: some View {
        ZStack {
            // Background - ignores safe area
            LiquidGlassBackground(accentColor: selectedSport.accentColor)
            
            // Content - respects safe area
            VStack(spacing: 0) {
                // Floating Header
                Text("GARY'S PICKS")
                    .font(.system(size: 26, weight: .heavy))
                    .tracking(1.5)
                    .foregroundStyle(GaryColors.goldGradient)
                    .shadow(color: GaryColors.gold.opacity(0.2), radius: 12)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                    .padding(.bottom, 14)
                    .background(alignment: .leading) {
                        Image("GaryIconBG")
                            .resizable()
                            .scaledToFit()
                            .frame(height: 81)
                            .shadow(color: GaryColors.gold.opacity(0.3), radius: 10)
                            .allowsHitTesting(false)
                    }
                    .padding(.horizontal, 16)

                // Separator
                Rectangle()
                    .fill(LinearGradient(colors: [.clear, GaryColors.gold.opacity(0.25), .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 0.5)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)

                // Sport Filter
                SportFilterBar(selected: $selectedSport, availableSports: availableSports, showAll: true)
                    .padding(.bottom, 4)
                
                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if filteredPicks.isEmpty {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "sportscourt")
                            .font(.system(size: 50))
                            .foregroundStyle(.tertiary)
                        Text(selectedSport == .all ? "No picks today." : "No \(selectedSport.rawValue) picks today.")
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
                    Spacer()
                } else {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 16) {
                            // All sports: Show picks grouped by time slot with headers
                            ForEach(picksByTimeSlot, id: \.timeSlot) { group in
                                // Time slot header
                                HStack {
                                    Rectangle()
                                        .fill(GaryColors.gold.opacity(0.5))
                                        .frame(height: 1)
                                    Text(group.timeSlot)
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(GaryColors.gold)
                                        .fixedSize()
                                    Rectangle()
                                        .fill(GaryColors.gold.opacity(0.5))
                                        .frame(height: 1)
                                }
                                .padding(.horizontal, 20)
                                .padding(.top, 8)
                                
                                // Picks in this time slot
                                ForEach(group.picks) { pick in
                                    PickCardMobile(pick: pick)
                                        .padding(.horizontal, 16)
                                        .transaction { $0.animation = nil }
                                }
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100)
                        .transaction { $0.animation = nil }
                    }
                    // Pull-to-refresh only on the picks ScrollView, not the filter bar
                    .refreshable {
                        await loadPicks(forceRefresh: true)
                    }
                }
            }
        }
        .task {
            await loadPicks()
        }
    }
    
    private func loadPicks(forceRefresh: Bool = false) async {
        await MainActor.run {
            loading = true
        }

        let date = SupabaseAPI.todayEST()

        // Use a timeout to prevent infinite loading
        var picks: [GaryPick] = []
        do {
            let arr = try await withTimeout(seconds: 15) {
                try await SupabaseAPI.fetchAllPicks(date: date, forceRefresh: forceRefresh)
            }
            picks = arr.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }
        } catch {
            // Silent fail - empty state will show
        }

        await MainActor.run {
            allPicks = picks
            loading = false
        }
    }
}

// MARK: - Gary's Props View

struct GaryPropsView: View {
    @State private var allProps: [PropPick] = []
    @State private var loading = true
    @State private var selectedSport: Sport = .all
    
    private var filteredProps: [PropPick] {
        // Sort props by game time (commence_time) - earliest games first
        let sortByTime: ([PropPick]) -> [PropPick] = { props in
            props.sorted { a, b in
                let timeA = a.commence_time ?? ""
                let timeB = b.commence_time ?? ""
                return timeA < timeB
            }
        }
        
        switch selectedSport {
        case .all:
            // Show all non-TD props (TD picks are in their own tab)
            return sortByTime(allProps.filter { !$0.isTDPick })
        case .nflTDs:
            // Show only TD scorer picks, sorted by category then time
            return allProps.filter { $0.isTDPick }.sorted { a, b in
                // Standard before underdog
                if a.tdCategory != b.tdCategory {
                    return a.tdCategory == "standard"
                }
                return (a.commence_time ?? "") < (b.commence_time ?? "")
            }
        case .nfl:
            // Show NFL props but exclude TD picks
            return sortByTime(allProps.filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isTDPick })
        default:
            return sortByTime(allProps.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue })
        }
    }
    
    /// TD picks grouped by category for section headers
    private var tdPicksByCategory: [(category: String, label: String, picks: [PropPick])] {
        guard selectedSport == .nflTDs else { return [] }

        let standardPicks = filteredProps.filter { $0.tdCategory == "standard" }
        let underdogPicks = filteredProps.filter { $0.tdCategory == "underdog" }
        let firstTDPicks = filteredProps.filter { $0.tdCategory == "first_td" }

        var result: [(category: String, label: String, picks: [PropPick])] = []
        if !standardPicks.isEmpty {
            result.append(("standard", "Regular", standardPicks))
        }
        if !underdogPicks.isEmpty {
            result.append(("underdog", "Value", underdogPicks))
        }
        if !firstTDPicks.isEmpty {
            result.append(("first_td", "First TD", firstTDPicks))
        }
        return result
    }
    
    private var availableSports: Set<String> {
        var sports = Set(allProps.compactMap { $0.effectiveLeague })
        // Add NFL TDs if there are any TD picks
        if allProps.contains(where: { $0.isTDPick }) {
            sports.insert("NFL TDs")
        }
        return sports
    }
    
    /// Get time slot string for props (e.g., "Sunday 1:00 PM ET")
    private func getTimeSlot(for prop: PropPick) -> String? {
        // Try commence_time first (ISO format)
        if let isoTime = prop.commence_time, !isoTime.isEmpty {
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            
            var date = isoFormatter.date(from: isoTime)
            if date == nil {
                isoFormatter.formatOptions = [.withInternetDateTime]
                date = isoFormatter.date(from: isoTime)
            }
            
            if let gameDate = date {
                let formatter = DateFormatter()
                formatter.timeZone = TimeZone(identifier: "America/New_York")
                formatter.dateFormat = "EEEE h:mm a"
                return formatter.string(from: gameDate) + " ET"
            }
        }
        
        // Fallback to time field if available (already formatted)
        if let time = prop.time, !time.isEmpty, time != "TBD" {
            return time
        }
        
        return nil
    }
    
    /// Group props by matchup for section headers (with time as secondary info)
    private var propsByMatchup: [(matchup: String, time: String, props: [PropPick])] {
        var grouped: [String: (time: String, props: [PropPick])] = [:]
        var order: [String] = []
        
        for prop in filteredProps {
            // Use matchup if available, otherwise fall back to time slot
            let matchup = prop.matchup ?? getTimeSlot(for: prop) ?? "TBD"
            let time = getTimeSlot(for: prop) ?? ""
            
            if grouped[matchup] == nil {
                grouped[matchup] = (time: time, props: [])
                order.append(matchup)
            }
            grouped[matchup]?.props.append(prop)
        }
        
        return order.map { (matchup: $0, time: grouped[$0]?.time ?? "", props: grouped[$0]?.props ?? []) }
    }
    
    /// Group props by time slot for section headers (legacy, used as fallback)
    private var propsByTimeSlot: [(timeSlot: String, props: [PropPick])] {
        var grouped: [String: [PropPick]] = [:]
        var order: [String] = []
        
        for prop in filteredProps {
            let slot = getTimeSlot(for: prop) ?? "TBD"
            if grouped[slot] == nil {
                grouped[slot] = []
                order.append(slot)
            }
            grouped[slot]?.append(prop)
        }
        
        return order.map { (timeSlot: $0, props: grouped[$0] ?? []) }
    }
    
    var body: some View {
        ZStack {
            // Background - ignores safe area
            LiquidGlassBackground(accentColor: selectedSport == .nflTDs ? Color(hex: "#22C55E") : GaryColors.gold)
            
            // Content - respects safe area
            VStack(spacing: 0) {
                // Header
                Text("GARY'S PROPS")
                    .font(.system(size: 26, weight: .heavy))
                    .tracking(1.5)
                    .foregroundStyle(GaryColors.goldGradient)
                    .shadow(color: GaryColors.gold.opacity(0.2), radius: 12)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                    .padding(.bottom, 14)
                    .background(alignment: .leading) {
                        Image("GaryIconBG")
                            .resizable()
                            .scaledToFit()
                            .frame(height: 81)
                            .shadow(color: GaryColors.gold.opacity(0.3), radius: 10)
                            .allowsHitTesting(false)
                    }
                    .padding(.horizontal, 16)

                // Separator
                Rectangle()
                    .fill(LinearGradient(colors: [.clear, GaryColors.gold.opacity(0.25), .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 0.5)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 16)

                // Sport Filter (with props-only filters like NFL TDs)
                SportFilterBar(selected: $selectedSport, availableSports: availableSports, showPropsOnly: true)
                    .padding(.bottom, 4)
                
                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if filteredProps.isEmpty {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "person.fill.questionmark")
                            .font(.system(size: 50))
                            .foregroundStyle(.tertiary)
                        Text(selectedSport == .all ? "No props yet." : "No \(selectedSport.rawValue) props today.")
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
                    Spacer()
                } else {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 16) {
                            // NFL TDs: Show with category section headers (Regular / Value)
                            if selectedSport == .nflTDs {
                                ForEach(tdPicksByCategory, id: \.category) { group in
                                    // Section Header
                                    HStack {
                                        Rectangle()
                                            .fill(group.category == "standard" ? Color(hex: "#3B82F6").opacity(0.6) : 
                                                  group.category == "underdog" ? Color(hex: "#22C55E").opacity(0.6) : 
                                                  Color(hex: "#A855F7").opacity(0.6))  // Purple for first_td
                                            .frame(width: 30, height: 2)

                                        Text(group.label)
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundStyle(group.category == "standard" ? Color(hex: "#3B82F6") : 
                                                           group.category == "underdog" ? Color(hex: "#22C55E") : 
                                                           Color(hex: "#A855F7"))  // Purple for first_td
                                        
                                        if group.category == "underdog" {
                                            Text("• +200 or better")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.secondary)
                                        }
                                        
                                        Rectangle()
                                            .fill(group.category == "standard" ? Color(hex: "#3B82F6").opacity(0.6) : 
                                                  group.category == "underdog" ? Color(hex: "#22C55E").opacity(0.6) : 
                                                  Color(hex: "#A855F7").opacity(0.6))  // Purple for first_td
                                            .frame(height: 2)
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.top, group.category == "standard" ? 4 : 12)
                                    
                                    // TD Picks in this category
                                    ForEach(group.picks) { prop in
                                        PropCardMobile(prop: prop)
                                            .padding(.horizontal, 16)
                                            .transaction { $0.animation = nil }
                                    }
                                }
                            } else {
                                // Regular props: Show grouped by matchup with headers
                                ForEach(propsByMatchup, id: \.matchup) { group in
                                    // Matchup header (time is shown on each card)
                                    HStack {
                                        Rectangle()
                                            .fill(GaryColors.gold.opacity(0.5))
                                            .frame(width: 20, height: 1)
                                        Text(group.matchup)
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundColor(GaryColors.gold)
                                            .lineLimit(1)
                                        Rectangle()
                                            .fill(GaryColors.gold.opacity(0.5))
                                            .frame(width: 20, height: 1)
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.top, 12)
                                    
                                    // Props in this matchup
                                    ForEach(group.props) { prop in
                                        PropCardMobile(prop: prop, showTimeOnCard: true)
                                            .padding(.horizontal, 16)
                                            .transaction { $0.animation = nil }
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100)
                        .transaction { $0.animation = nil }
                    }
                    // Pull-to-refresh only on the props ScrollView, not the filter bar
                    .refreshable {
                        await loadProps(forceRefresh: true)
                    }
                }
            }
        }
        .task {
            await loadProps()
        }
    }
    
    private func loadProps(forceRefresh: Bool = false) async {
        await MainActor.run {
            loading = true
        }

        let date = SupabaseAPI.todayEST()

        // Use a timeout to prevent infinite loading
        let props: [PropPick]
        do {
            props = try await withTimeout(seconds: 15) {
                try await SupabaseAPI.fetchPropPicks(date: date, forceRefresh: forceRefresh)
            }
        } catch {
            // Silent fail - empty state will show
            props = []
        }

        await MainActor.run {
            allProps = props
            loading = false
        }
    }
}

// MARK: - Billfold View

struct BillfoldView: View {
    @State private var selectedTab = 0
    @State private var timeframe = "7d"  // Default to 7 days
    @State private var selectedSport: Sport = .nba  // Default to NBA
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loading = true
    @State private var error: String?
    
    private let timeframes = ["7d", "30d", "90d", "ytd", "all"]
    
    /// Filter game results by selected sport
    private var filteredGameResults: [GameResult] {
        guard selectedSport != .all else { return gameResults }
        return gameResults.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
    }
    
    /// Filter prop results by selected sport
    private var filteredPropResults: [PropResult] {
        switch selectedSport {
        case .all:
            // Show all props except TD results (those are in NFL TDs tab)
            return propResults.filter { !$0.isTDResult }
        case .nflTDs:
            // Show only TD results
            return propResults.filter { $0.isTDResult }
        case .nfl:
            // Show NFL props but exclude TD results
            return propResults.filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isTDResult }
        default:
            return propResults.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        }
    }
    
    /// Get available sports from the loaded results (both game and prop results)
    private var availableSports: Set<String> {
        let gameLeagues = Set(gameResults.compactMap { $0.effectiveLeague })
        let propLeagues = Set(propResults.compactMap { $0.effectiveLeague })
        var combined = gameLeagues.union(propLeagues)
        // Add NFL TDs if there are any TD results
        if propResults.contains(where: { $0.isTDResult }) {
            combined.insert("NFL TDs")
        }
        return combined
    }
    
    var body: some View {
        ZStack {
            // Matte black background with subtle gold accent
            Color(hex: "#0A0A0C")
                .ignoresSafeArea()
            
            // Subtle gold gradient at top
            VStack {
                LinearGradient(
                    colors: [GaryColors.gold.opacity(0.08), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 200)
                Spacer()
            }
            .ignoresSafeArea()
            
            // Content - respects safe area
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Header
                    Text("BILLFOLD")
                        .font(.system(size: 26, weight: .heavy))
                        .tracking(1.5)
                        .foregroundStyle(GaryColors.goldGradient)
                        .shadow(color: GaryColors.gold.opacity(0.2), radius: 12)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 20)
                        .padding(.bottom, 14)
                        .background(alignment: .leading) {
                            Image("GaryIconBG")
                                .resizable()
                                .scaledToFit()
                                .frame(height: 81)
                                .shadow(color: GaryColors.gold.opacity(0.3), radius: 10)
                                .allowsHitTesting(false)
                        }

                    // Separator
                    Rectangle()
                        .fill(LinearGradient(colors: [.clear, GaryColors.gold.opacity(0.25), .clear], startPoint: .leading, endPoint: .trailing))
                        .frame(height: 0.5)
                        .padding(.horizontal, 4)
                        .padding(.bottom, 12)

                    // Filters Row: dropdowns + refresh
                    HStack(spacing: 10) {
                        billfoldDropdown(
                            label: selectedTab == 0 ? "Picks" : "Props",
                            icon: selectedTab == 0 ? "chart.bar.fill" : "person.fill"
                        ) {
                            Button { withAnimation { selectedTab = 0 } } label: {
                                Label("Picks", systemImage: "chart.bar.fill")
                            }
                            Button { withAnimation { selectedTab = 1 } } label: {
                                Label("Props", systemImage: "person.fill")
                            }
                        }

                        billfoldDropdown(
                            label: selectedSport == .all ? "All Sports" : selectedSport.rawValue,
                            icon: selectedSport.icon
                        ) {
                            ForEach(sortedSportsForBillfold, id: \.self) { sport in
                                let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                                Button {
                                    withAnimation {
                                        selectedSport = sport
                                        if timeframe != "7d" {
                                            timeframe = "7d"
                                            Task { await loadData() }
                                        }
                                    }
                                } label: {
                                    Label(
                                        sport == .all ? "All Sports" : sport.rawValue,
                                        systemImage: sport.icon
                                    )
                                }
                                .disabled(!isAvailable)
                            }
                        }

                        billfoldDropdown(
                            label: timeframe.uppercased(),
                            icon: "calendar"
                        ) {
                            ForEach(timeframes, id: \.self) { tf in
                                Button {
                                    withAnimation { timeframe = tf }
                                    Task { await loadData() }
                                } label: {
                                    Text(tf.uppercased())
                                }
                            }
                        }

                        Spacer()

                        Button {
                            Task { await loadData() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(GaryColors.gold)
                                .padding(9)
                                .background(
                                    Circle()
                                        .fill(Color(hex: "#1A1A1E"))
                                        .overlay(
                                            Circle().stroke(GaryColors.gold.opacity(0.3), lineWidth: 0.5)
                                        )
                                )
                        }
                    }
                    .padding(.bottom, 12)

                    // Metrics
                    metricsCards
                        .padding(.bottom, 12)

                    // Recent Picks
                    recentPicksList
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 100)
            }
        }
        .task { await loadData() }
    }
    
    private var segmentedControl: some View {
        HStack(spacing: 0) {
            ForEach(["Picks", "Props"].indices, id: \.self) { index in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedTab = index
                    }
                } label: {
                    Text(index == 0 ? "Picks" : "Props")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(selectedTab == index ? .black : .white.opacity(0.5))
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background {
                            if selectedTab == index {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(GaryColors.goldGradient)
                            }
                        }
                }
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(Color(hex: "#141416"))
                .overlay(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
    
    // Sort sports: ALL first, then available sports, then unavailable sports (faded)
    // Filter out props-only sports (like NFL TDs) when on Game Picks tab
    private var sortedSportsForBillfold: [Sport] {
        Sport.allCases
            .filter { sport in
                // Hide props-only sports (like NFL TDs) on Game Picks tab
                if selectedTab == 0 && sport.isPropsOnly { return false }
                return true
            }
            .sorted { a, b in
                // ALL always comes first
                if a == .all { return true }
                if b == .all { return false }
                
                let aAvailable = availableSports.contains(a.rawValue)
                let bAvailable = availableSports.contains(b.rawValue)
                
                // Available sports come before unavailable
                if aAvailable && !bAvailable { return true }
                if !aAvailable && bAvailable { return false }
                
                // Within same availability group, maintain original order
                let allCases = Sport.allCases
                let aIndex = allCases.firstIndex(of: a) ?? 0
                let bIndex = allCases.firstIndex(of: b) ?? 0
                return aIndex < bIndex
            }
    }
    
    private var sportFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(sortedSportsForBillfold, id: \.self) { sport in
                    let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                    let isSelected = selectedSport == sport
                    
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedSport = sport
                            // Reset to 7D when switching sports
                            if timeframe != "7d" {
                                timeframe = "7d"
                                Task { await loadData() }
                            }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: sport.icon)
                                .font(.system(size: 10, weight: .semibold))
                            Text(sport.rawValue)
                                .font(.caption2.bold())
                        }
                        .foregroundStyle(isSelected ? .black : (isAvailable ? .white : .gray.opacity(0.5)))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background {
                            if isSelected {
                                Capsule()
                                    .fill(sport.accentColor)
                                    .modifier(ConditionalCapsuleShadow(color: sport.accentColor.opacity(0.4)))
                            } else {
                                Capsule()
                                    .fill(Color(hex: "#1A1A1E"))
                                    .overlay(
                                        Capsule()
                                            .stroke(.white.opacity(0.08), lineWidth: 0.5)
                                    )
                            }
                        }
                    }
                    .disabled(!isAvailable)
                    .scaleEffect(isSelected ? 1.03 : 1.0)
                }
            }
            .padding(.horizontal, 2)
        }
        .frame(height: 38)
    }
    
    private func billfoldDropdown<Content: View>(label: String, icon: String, @ViewBuilder content: @escaping () -> Content) -> some View {
        Menu {
            content()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .bold))
            }
            .foregroundStyle(GaryColors.gold)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color(hex: "#1A1A1E"))
                    .overlay(
                        Capsule()
                            .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.5)
                    )
            )
        }
    }

    private var timeframeButtons: some View {
        HStack(spacing: 6) {
            ForEach(timeframes, id: \.self) { tf in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        timeframe = tf
                    }
                    Task { await loadData() }
                } label: {
                    Text(tf.uppercased())
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(timeframe == tf ? .black : .white.opacity(0.5))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background {
                            if timeframe == tf {
                                Capsule().fill(GaryColors.goldGradient)
                            } else {
                                Capsule()
                                    .fill(Color(hex: "#1A1A1E"))
                                    .overlay(
                                        Capsule().stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                                    )
                            }
                        }
                }
            }
            Spacer()
            Button {
                Task { await loadData() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(GaryColors.gold)
                    .padding(8)
                    .background(
                        Circle()
                            .fill(Color(hex: "#1A1A1E"))
                            .overlay(
                                Circle().stroke(GaryColors.gold.opacity(0.3), lineWidth: 0.5)
                            )
                    )
            }
        }
    }
    
    /// Streak meter using gambling terminology - returns bg color and bright text color
    private func streakMeter(wins: Int, losses: Int, winRate: Double) -> (label: String, icon: String, bgColor: Color, textColor: Color)? {
        let total = wins + losses
        guard total >= 1 else { return nil }
        
        // Color pairs: (solid background, neon/bright text)
        let heaterColors = (Color(hex: "#166534"), Color(hex: "#4ADE80"))  // Dark green bg, neon green text
        let sharpColors = (Color(hex: "#1E3A29"), Color(hex: "#86EFAC"))   // Darker green bg, mint text
        let rideColors = (Color(hex: "#422006"), Color(hex: "#FCD34D"))    // Dark amber bg, bright yellow text
        let grindColors = (Color(hex: "#2D2A1E"), GaryColors.lightGold)    // Dark gold bg, gold text
        let varianceColors = (Color(hex: "#431407"), Color(hex: "#FDBA74")) // Dark orange bg, bright orange text
        let fadeColors = (Color(hex: "#450A0A"), Color(hex: "#FCA5A5"))    // Dark red bg, light red text
        
        // Perfect record
        if losses == 0 && wins >= 3 {
            return ("HEATER", "flame.fill", heaterColors.0, heaterColors.1)
        }
        if losses == 0 && wins >= 1 {
            return ("RIDE", "arrow.up.right", rideColors.0, rideColors.1)
        }
        
        // No wins
        if wins == 0 && losses >= 3 {
            return ("FADE", "arrow.down.right", fadeColors.0, fadeColors.1)
        }
        if wins == 0 && losses >= 1 {
            return ("VARIANCE", "arrow.left.arrow.right", varianceColors.0, varianceColors.1)
        }
        
        // Based on win rate
        if winRate >= 75 {
            return ("HEATER", "flame.fill", heaterColors.0, heaterColors.1)
        } else if winRate >= 65 {
            return ("SHARP", "checkmark.seal.fill", sharpColors.0, sharpColors.1)
        } else if winRate >= 55 {
            return ("RIDE", "arrow.up.right", rideColors.0, rideColors.1)
        } else if winRate >= 45 {
            return ("GRINDING", "gearshape.fill", grindColors.0, grindColors.1)
        } else if winRate >= 35 {
            return ("VARIANCE", "arrow.left.arrow.right", varianceColors.0, varianceColors.1)
        } else {
            return ("FADE", "arrow.down.right", fadeColors.0, fadeColors.1)
        }
    }
    
    private var metricsCards: some View {
        let record = calculateRecord()
        let total = max(1, record.wins + record.losses + record.pushes)
        let winRate = Double(record.wins) / Double(total) * 100
        
        let sportLabel = selectedSport == .all ? "" : " (\(selectedSport.rawValue))"
        
        return HStack(spacing: 12) {
            KPICard(title: "RECORD\(sportLabel)", value: "\(record.wins)-\(record.losses)\(record.pushes > 0 ? "-\(record.pushes)" : "")")
            KPICard(title: "WIN RATE\(sportLabel)", value: String(format: "%.1f%%", winRate))
        }
    }
    
    private var recentPicksList: some View {
        let record = calculateRecord()
        let total = max(1, record.wins + record.losses + record.pushes)
        let winRate = Double(record.wins) / Double(total) * 100
        let streak = streakMeter(wins: record.wins, losses: record.losses, winRate: winRate)
        
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("RECENT PICKS")
                    .font(.caption.bold())
                    .foregroundStyle(GaryColors.lightGold)
                
                if selectedSport != .all {
                    Text("• \(selectedSport.rawValue)")
                        .font(.caption.bold())
                        .foregroundStyle(selectedSport.accentColor)
                }
                
                Spacer()
                
                // Hot/Cold streak meter - solid background with bright text
                if let streak = streak, record.wins + record.losses > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: streak.icon)
                            .font(.system(size: 10, weight: .bold))
                        Text(streak.label)
                            .font(.system(size: 10, weight: .heavy))
                    }
                    .foregroundStyle(streak.textColor)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(streak.bgColor)
                    )
                }
            }
            
            if loading {
                HStack {
                    Spacer()
                    ProgressView().tint(GaryColors.gold)
                    Spacer()
                }
                .padding(.vertical, 40)
            } else if let error = error {
                Text(error)
                    .foregroundStyle(.red)
                    .padding()
                    .liquidGlass(cornerRadius: 12)
            } else {
                let displayResults = selectedTab == 0 ? filteredGameResults : []
                let displayProps = selectedTab == 1 ? filteredPropResults : []
                
                if selectedTab == 0 {
                    if displayResults.isEmpty {
                        emptyStateView
                    } else {
                        ForEach(Array(displayResults.prefix(50).enumerated()), id: \.offset) { _, result in
                            GameResultRow(result: result)
                                .transaction { $0.animation = nil }
                        }
                    }
                } else {
                    if displayProps.isEmpty {
                        emptyStateView
                    } else {
                        ForEach(Array(displayProps.prefix(50).enumerated()), id: \.offset) { _, result in
                            PropResultRow(result: result)
                                .transaction { $0.animation = nil }
                        }
                    }
                }
            }
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 32))
                .foregroundStyle(.tertiary)
            Text(selectedSport == .all ? "No results yet" : "No \(selectedSport.rawValue) results")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
    
    private func loadData() async {
        await MainActor.run {
            loading = true
            error = nil
        }

        do {
            let since = sinceDate(for: timeframe)
            // Use the combined fetch that includes NFL results with timeout
            let (games, props) = try await withTimeout(seconds: 15) {
                async let g = SupabaseAPI.fetchAllGameResults(since: since)
                async let p = SupabaseAPI.fetchPropResults(since: since)
                return try await (g, p)
            }
            
            await MainActor.run {
                gameResults = games
                propResults = props
            }
        } catch {
            await MainActor.run {
                self.error = "Failed to load data"
            }
        }

        await MainActor.run {
            loading = false
        }
    }
    
    private func sinceDate(for timeframe: String) -> String? {
        let cal = Calendar.current
        let now = Date()
        
        switch timeframe {
        case "7d": return cal.date(byAdding: .day, value: -7, to: now).map { formatISO($0) }
        case "30d": return cal.date(byAdding: .day, value: -30, to: now).map { formatISO($0) }
        case "90d": return cal.date(byAdding: .day, value: -90, to: now).map { formatISO($0) }
        case "ytd": return cal.date(from: DateComponents(year: cal.component(.year, from: now), month: 1, day: 1)).map { formatISO($0) }
        default: return nil
        }
    }
    
    private func formatISO(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
    
    private func calculateRecord() -> (wins: Int, losses: Int, pushes: Int) {
        // Use filtered results based on selected sport
        let results = selectedTab == 0
            ? filteredGameResults.map { $0.result ?? "" }
            : filteredPropResults.map { $0.result ?? "" }
        
        return (
            wins: results.filter { $0 == "won" }.count,
            losses: results.filter { $0 == "lost" }.count,
            pushes: results.filter { $0 == "push" }.count
        )
    }
}

// MARK: - BetCard View

struct BetCardView: View {
    var body: some View {
        ZStack {
            LiquidGlassBackground()
            
            WebContainer(url: URL(string: "https://www.betwithgary.ai/betcard")!)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}

// MARK: - Reusable Components

struct BenefitCard: View {
    let title: String
    let text: String
    let icon: String?
    
    init(title: String, text: String, icon: String? = nil) {
        self.title = title
        self.text = text
        self.icon = icon
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Title - large and gold
            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(GaryColors.gold)
            
            // Full description text - always visible
            Text(text)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Color.white.opacity(0.8))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#141416"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        )
    }
}

/// Hero card for flagship features (Sports Brain) - gold border and badge
struct HeroBenefitCard: View {
    let title: String
    let text: String
    let badge: String
    
    init(title: String, text: String, badge: String = "GARY'S SECRET WEAPON") {
        self.title = title
        self.text = text
        self.badge = badge
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Badge at top
            Text(badge)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(GaryColors.gold.opacity(0.7))
            
            // Title
            Text(title)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.55))

            // Full description text - always visible
            Text(text)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Color.white.opacity(0.9))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#0A0A0C"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.5), GaryColors.gold.opacity(0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
        .shadow(color: GaryColors.gold.opacity(0.15), radius: 16, x: 0, y: 4)
        .shadow(color: GaryColors.gold.opacity(0.08), radius: 32, x: 0, y: 8)
    }
}

struct KPICard: View {
    let title: String
    let value: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(GaryColors.gold.opacity(0.7))
            Text(value)
                .font(.system(size: 28, weight: .heavy))
                .tracking(-0.5)
                .foregroundStyle(GaryColors.goldGradient)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#111113"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)
                )
        )
        .modifier(ConditionalShadow(color: GaryColors.gold.opacity(0.1), radius: 12, y: 4))
    }
}

struct GaryLogo: View {
    var size: CGFloat = 120
    var useLocalAsset: Bool = true
    
    var body: some View {
        Group {
            if useLocalAsset {
                // Use local asset (the bear logo)
                Image("GaryBear")
                    .resizable()
                    .scaledToFit()
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
                    .overlay(
                        RoundedRectangle(cornerRadius: size * 0.22)
                            .stroke(
                                LinearGradient(
                                    colors: [GaryColors.lightGold.opacity(0.6), GaryColors.gold.opacity(0.2)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.5
                            )
                    )
                    .shadow(color: GaryColors.gold.opacity(0.3), radius: 16, y: 8)
            } else {
                // Fallback to remote image
                AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
                    switch phase {
                    case .empty:
                        ProgressView().tint(GaryColors.gold)
                    case .success(let img):
                        img.resizable()
                            .scaledToFit()
                            .frame(width: size, height: size)
                            .clipShape(Circle())
                    case .failure:
                        Image(systemName: "seal.fill")
                            .resizable()
                            .scaledToFit()
                            .frame(width: size, height: size)
                            .foregroundStyle(GaryColors.goldGradient)
                    @unknown default:
                        EmptyView()
                    }
                }
            }
        }
    }
}

// MARK: - Mock Pick Card (Blurred Placeholder)

struct MockPickCard: View {
    var body: some View {
        VStack(spacing: 0) {
            // Header Row
            HStack {
                // Sport icon placeholder
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 32, height: 32)
                
                // Sport badge
                RoundedRectangle(cornerRadius: 6)
                    .fill(GaryColors.gold.opacity(0.2))
                    .frame(width: 50, height: 22)
                
                Spacer()
                
                // Time badge
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.1))
                    .frame(width: 80, height: 26)
            }
            .padding(.bottom, 14)
            
            // Teams Row
            HStack {
                // Away team
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 80, height: 18)
                }
                
                Spacer()
                
                // @ symbol
                Text("@")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.3))
                
                Spacer()
                
                // Home team
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 80, height: 18)
                }
            }
            .padding(.bottom, 8)
            
            // Venue
            HStack {
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(GaryColors.gold.opacity(0.4))
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.white.opacity(0.1))
                    .frame(width: 120, height: 12)
            }
            .padding(.bottom, 16)
            
            Divider()
                .background(GaryColors.gold.opacity(0.2))
                .padding(.bottom, 14)
            
            // Pick Row
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(GaryColors.gold.opacity(0.3))
                        .frame(width: 140, height: 22)
                    
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.1))
                        .frame(width: 100, height: 14)
                }
                
                Spacer()
                
                // Odds badge
                RoundedRectangle(cornerRadius: 10)
                    .fill(GaryColors.gold.opacity(0.15))
                    .frame(width: 60, height: 32)
            }
            .padding(.bottom, 14)
            
            // Confidence bar
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.3))
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.white.opacity(0.1))
                        .frame(width: 70, height: 10)
                    Spacer()
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 30, height: 12)
                }
                
                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(GaryColors.gold.opacity(0.1))
                        RoundedRectangle(cornerRadius: 4)
                            .fill(GaryColors.gold.opacity(0.4))
                            .frame(width: geo.size.width * 0.75)
                    }
                }
                .frame(height: 6)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.4), GaryColors.gold.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
        )
    }
}

// MARK: - Pick Cards

struct PickCardMobile: View {
    let pick: GaryPick
    @State private var showAnalysis = false
    @State private var showSportsbookOdds = false
    @State private var isPressed = false
    
    private var accentColor: Color {
        Sport.from(league: pick.league).accentColor
    }
    
    private var isNFL: Bool {
        pick.league?.uppercased() == "NFL"
    }
    
    private var isNBA: Bool {
        pick.league?.uppercased() == "NBA"
    }
    
    /// Check if this is an NBA Cup game
    private var isNBACup: Bool {
        pick.isNBACup
    }
    
    /// Check if this is an NCAAF game
    private var isNCAAF: Bool {
        pick.league?.uppercased() == "NCAAF"
    }
    
    /// Check if this is a CFP (College Football Playoff) game
    private var isCFP: Bool {
        pick.isCFP
    }
    
    /// Get CFP round label (First Round, Quarterfinal, Semifinal, Championship)
    private var cfpRoundLabel: String? {
        guard isCFP else { return nil }
        if let round = pick.cfpRound, !round.isEmpty {
            return round.replacingOccurrences(of: "CFP ", with: "")
        }
        if let ctx = pick.tournamentContext?.lowercased() {
            if ctx.contains("championship") { return "Championship" }
            if ctx.contains("semifinal") { return "Semifinal" }
            if ctx.contains("quarterfinal") { return "Quarterfinal" }
            if ctx.contains("first round") { return "First Round" }
            return "Playoff"
        }
        return "Playoff"
    }
    
    /// Check if this is an NFL special game (playoff round, primetime, etc.)
    private var nflGameContext: String? {
        guard isNFL else { return nil }
        // First check gameSignificance for playoff rounds (Wild Card, Divisional, etc.)
        if let significance = pick.gameSignificance, !significance.isEmpty {
            return significance
        }
        // Fall back to tournamentContext for primetime games (TNF, SNF, MNF)
        if let ctx = pick.tournamentContext, !ctx.isEmpty {
            return ctx
        }
        return nil
    }
    
    /// Get appropriate icon for NFL game context
    private var nflContextIcon: String {
        guard let ctx = nflGameContext?.lowercased() else { return "football.fill" }
        // Playoff rounds
        if ctx.contains("super bowl") { return "trophy.fill" }
        if ctx.contains("championship") || ctx.contains("conference") { return "trophy.fill" }
        if ctx.contains("divisional") { return "flag.2.crossed.fill" }
        if ctx.contains("wild card") { return "star.fill" }
        // Primetime games
        if ctx.contains("tnf") || ctx.contains("thursday") { return "moon.stars.fill" }
        if ctx.contains("snf") || ctx.contains("sunday night") { return "moon.fill" }
        if ctx.contains("mnf") || ctx.contains("monday") { return "moon.fill" }
        return "football.fill"
    }
    
    /// Extract pick text and odds separately, expanding team names for NBA, shortening for college
    private var pickParts: (pick: String, odds: String) {
        var parts = Formatters.splitPickAndOdds(pick.pick)
        let league = pick.league?.uppercased() ?? ""

        // SPREAD SIGN FIX: Correct missing or wrong spread sign using sportsbook odds
        if let type = pick.type, type == "spread",
           let books = pick.sportsbook_odds, let firstSpread = books.compactMap({ $0.spread }).first {
            var pickText = parts.0
            // Match a bare number (unsigned) or signed number that looks like a spread (1-50 range)
            let spreadPattern = #"([+-]?)(\d{1,2}\.?\d*)\s*$"#
            if let regex = try? NSRegularExpression(pattern: spreadPattern),
               let match = regex.firstMatch(in: pickText, range: NSRange(pickText.startIndex..., in: pickText)),
               let signRange = Range(match.range(at: 1), in: pickText),
               let numRange = Range(match.range(at: 2), in: pickText) {
                let sign = String(pickText[signRange])
                let numStr = String(pickText[numRange])
                if let num = Double(numStr), num > 0, num < 50 {
                    // Determine correct sign: sportsbook spread is from home team perspective
                    let pickedTeamIsHome = pick.homeTeam != nil &&
                        pickText.lowercased().contains(pick.homeTeam!.split(separator: " ").last?.lowercased() ?? "???")
                    let correctSpread = pickedTeamIsHome ? firstSpread : -firstSpread
                    let correctSign = correctSpread >= 0 ? "+" : "-"
                    // Fix if sign is missing or wrong
                    if sign.isEmpty || sign != correctSign {
                        let correctNum = abs(correctSpread)
                        let replacement = "\(correctSign)\(correctNum.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(correctNum)) : String(correctNum))"
                        let fullRange = match.range(at: 0)
                        if let swiftRange = Range(fullRange, in: pickText) {
                            pickText = pickText.replacingCharacters(in: swiftRange, with: replacement)
                            parts = (pickText, parts.1)
                        }
                    }
                }
            }
        }

        // For NBA, replace short team name with full team name in pick text
        if league == "NBA" {
            var expandedPick = parts.0
            
            // Check if pick contains the short home team name and replace with full name
            if let homeTeam = pick.homeTeam {
                let shortHome = homeTeam.split(separator: " ").last.map(String.init) ?? homeTeam
                if expandedPick.contains(shortHome) {
                    expandedPick = expandedPick.replacingOccurrences(of: shortHome, with: homeTeam)
                }
            }
            
            // Check if pick contains the short away team name and replace with full name
            if let awayTeam = pick.awayTeam {
                let shortAway = awayTeam.split(separator: " ").last.map(String.init) ?? awayTeam
                if expandedPick.contains(shortAway) {
                    expandedPick = expandedPick.replacingOccurrences(of: shortAway, with: awayTeam)
                }
            }
            
            return (expandedPick, parts.1)
        }
        
        // For NCAAF/NCAAB, use shortened school name (without mascot) if pick is too long
        if league == "NCAAF" || league == "NCAAB" {
            var shortenedPick = parts.0
            
            // Replace full team name with just the school name for college sports
            // e.g., "Jacksonville State Gamecocks ML" -> "Jacksonville State ML"
            if let homeTeam = pick.homeTeam, shortenedPick.contains(homeTeam) {
                let schoolName = Formatters.shortTeamName(homeTeam, league: pick.league)
                shortenedPick = shortenedPick.replacingOccurrences(of: homeTeam, with: schoolName)
            }
            if let awayTeam = pick.awayTeam, shortenedPick.contains(awayTeam) {
                let schoolName = Formatters.shortTeamName(awayTeam, league: pick.league)
                shortenedPick = shortenedPick.replacingOccurrences(of: awayTeam, with: schoolName)
            }
            
            return (shortenedPick, parts.1)
        }
        
        return parts
    }
    
    /// Check if this pick's sport is in beta
    private var isBetaSport: Bool {
        Sport.from(league: pick.league).isBeta
    }
    
    // MARK: - Extracted Sub-Views (fixes type-checking timeout)
    
    /// Generic game significance for any sport (Division Rivals, Top 5 Battle, etc.)
    private var genericGameSignificance: String? {
        // Skip if NFL (has its own handler) or NBA Cup (has its own badge)
        if isNFL || isNBACup { return nil }
        // Use gameSignificance if it's a short, meaningful label
        if let sig = pick.gameSignificance, !sig.isEmpty, sig.count < 30 {
            return sig
        }
        return nil
    }

    /// Get appropriate icon for game significance
    private func significanceIcon(for significance: String) -> String {
        let sig = significance.lowercased()
        // Rivalries and heated matchups
        if sig.contains("rivalry") || sig.contains("battle") || sig.contains("clash") || sig.contains("iron bowl") || sig.contains("the game") { return "flame.fill" }
        // Conference/Division matchups (college and pro)
        if sig.contains("rivals") || sig.contains("big ten") || sig.contains("sec ") || sig.contains("acc ") || sig.contains("big 12") || sig.contains("big east") || sig.contains("pac-12") { return "flag.2.crossed.fill" }
        // Famous college rivalries
        if sig.contains("tobacco") || sig.contains("bluegrass") || sig.contains("red river") || sig.contains("cocktail") || sig.contains("army-navy") { return "flame.fill" }
        // Rankings-based matchups
        if sig.contains("top") || sig.contains("elite") || sig.contains("#1") || sig.contains("#2") || sig.contains("ranked") { return "star.fill" }
        if sig.contains("division") { return "flag.2.crossed.fill" }
        if sig.contains("playoff") || sig.contains("contender") { return "trophy.fill" }
        if sig.contains("conference") { return "sportscourt.fill" }
        // International games
        if sig.contains("london") || sig.contains("paris") || sig.contains("mexico") || sig.contains("tokyo") || sig.contains("munich") { return "globe.americas.fill" }
        // Default fallbacks
        if sig.contains("regular season") { return "calendar" }
        return "sportscourt.fill"
    }

    @ViewBuilder
    private var headerBadges: some View {
        // NBA CUP badge
        if isNBACup {
            HStack(spacing: 4) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 8, weight: .bold))
                Text("NBA CUP")
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundStyle(GaryColors.gold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(GaryColors.gold.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }

        // NFL game context badge
        if let nflContext = nflGameContext {
            HStack(spacing: 5) {
                Image(systemName: nflContextIcon)
                    .font(.system(size: 10, weight: .bold))
                Text(nflContext.uppercased())
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(accentColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(accentColor.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        
        // CFP badge
        if isCFP, let cfpLabel = cfpRoundLabel {
            HStack(spacing: 5) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 10, weight: .bold))
                Text("CFP \(cfpLabel)")
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(.red)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.red.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        
        // BETA badge
        if isBetaSport {
            Text("BETA")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(Color.orange)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.orange.opacity(0.2))
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }
    
    @ViewBuilder
    private var headerRow: some View {
        HStack {
            HStack(spacing: 8) {
                // Game significance badge in left corner (replaces sport icon)
                if let significance = genericGameSignificance {
                    HStack(spacing: 5) {
                        Image(systemName: significanceIcon(for: significance))
                            .font(.system(size: 10, weight: .semibold))
                        Text(significance)
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .goldGlass(cornerRadius: 8)
                }

                headerBadges
            }

            Spacer()

            if let time = pick.displayTime {
                Text(Formatters.formatCommenceTime(time))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.75))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .goldGlass(cornerRadius: 8)
            }
        }
    }
    
    @ViewBuilder
    private var teamsSection: some View {
        VStack(spacing: 4) {
            HStack(spacing: 0) {
                // Away team with optional CFP seed
                HStack(spacing: 4) {
                    if isCFP, let awaySeed = pick.awaySeed {
                        Text("#\(awaySeed)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(GaryColors.gold)
                    }
                    Text(Formatters.shortTeamName(pick.awayTeam, league: pick.league))
                        .font(.title3.bold())
                        .foregroundStyle(Color.white.opacity(0.75))
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                // @ sign - fixed width
                Text(pick.isNeutralSite == true ? "vs" : "@")
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.5))
                    .frame(width: 40)
                
                // Home team with optional CFP seed
                HStack(spacing: 4) {
                    Text(Formatters.shortTeamName(pick.homeTeam, league: pick.league))
                        .font(.title3.bold())
                        .foregroundStyle(Color.white.opacity(0.75))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if isCFP, let homeSeed = pick.homeSeed {
                        Text("#\(homeSeed)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(GaryColors.gold)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            
            // Venue
            if let venue = pick.venue, !venue.isEmpty {
                HStack(spacing: 5) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 13))
                    Text(venue)
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundStyle(accentColor)
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(.vertical, 4)
    }
    
    @ViewBuilder
    private var pickTextSection: some View {
        HStack(alignment: .center) {
            Text(pickParts.pick)
                .foregroundStyle(GaryColors.gold)
                .font(.system(size: 22, weight: .heavy))
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            
            Spacer()
            
            if !pickParts.odds.isEmpty {
                Text(pickParts.odds)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.75))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .goldGlass(cornerRadius: 8)
            }
        }
    }
    
    @ViewBuilder
    private var confidenceBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.caption)
                Text("Confidence")
                    .font(.caption)
                Spacer()
            }
            .foregroundStyle(.secondary)
            
            // iOS 16+: Use GeometryReader for precise sizing
            // iOS 15 and below: Use scaleEffect to avoid layout recalculations
            if PerformanceMode.current.useExpensiveEffects {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(accentColor.opacity(isNFL ? 0.05 : 0.25))
                        RoundedRectangle(cornerRadius: 4)
                            .fill(accentColor)
                            .frame(width: geo.size.width * CGFloat(pick.confidence ?? 0))
                    }
                }
                .frame(height: 6)
            } else {
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(accentColor.opacity(isNFL ? 0.05 : 0.25))
                        .frame(height: 6)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(accentColor)
                        .frame(height: 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .scaleEffect(x: CGFloat(pick.confidence ?? 0), y: 1, anchor: .leading)
                }
                .frame(height: 6)
            }
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header Row - Icon left, Time right
            headerRow
            
            // Teams section
            teamsSection
            
            // Divider
            Rectangle()
                .fill(accentColor.opacity(0.3))
                .frame(height: 1)
            
            // Pick Text with Odds
            pickTextSection

            // Sportsbook Odds Comparison (expandable)
            if let odds = pick.sportsbook_odds, !odds.isEmpty {
                VStack(spacing: 8) {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showSportsbookOdds.toggle()
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chart.bar.doc.horizontal")
                                .font(.system(size: 11, weight: .semibold))
                            Text("View Sportsbook Odds")
                                .font(.system(size: 12, weight: .semibold))
                            Spacer()
                            Image(systemName: showSportsbookOdds ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundStyle(accentColor.opacity(0.85))
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(accentColor.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)

                    if showSportsbookOdds {
                        SportsbookOddsTable(odds: odds)
                            .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .top)))
                    }
                }
            }

            // Confidence Bar
            confidenceBar
            
            // Analysis Button - soft white, unbold
            Button {
                showAnalysis.toggle()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.75))
                    Text("View Analysis")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundStyle(Color.white.opacity(0.75))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .goldGlass(cornerRadius: 12)
            }
            .sheet(isPresented: $showAnalysis) {
                AnalysisSheet(title: "Gary's Analysis", pick: pick, accentColor: accentColor)
            }
        }
        .padding(18)
        .background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                RoundedRectangle(cornerRadius: 20)
                    .fill(GaryColors.cardBg)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(
                                LinearGradient(
                                    colors: [accentColor.opacity(0.6), accentColor.opacity(0.2)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 2
                            )
                    )
                    .shadow(color: accentColor.opacity(0.15), radius: 20, y: 10)
                    .shadow(color: .black.opacity(0.3), radius: 10, y: 5)
            } else {
                // Lighter version for iOS 15 and below
                RoundedRectangle(cornerRadius: 20)
                    .fill(GaryColors.cardBg)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(accentColor.opacity(0.4), lineWidth: 1.5)
                    )
                    .shadow(color: .black.opacity(0.2), radius: 6, y: 4)
            }
        }
        .modifier(PerformanceOptimizer()) // Applies drawingGroup only on older iOS
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = pressing
            }
        }, perform: {})
    }
}

/// Applies performance optimizations only on older iOS versions
struct PerformanceOptimizer: ViewModifier {
    func body(content: Content) -> some View {
        if PerformanceMode.current.useExpensiveEffects {
            // iOS 16+: No rasterization needed, GPU handles it well
            content
        } else {
            // iOS 15 and below: Rasterize to offscreen buffer for smoother scrolling
            content
                .compositingGroup()
                .drawingGroup()
        }
    }
}

// MARK: - Sportsbook Odds Comparison Table
struct SportsbookOddsTable: View {
    let odds: [SportsbookOdds]

    /// Find the best spread odds (highest/least negative)
    private var bestSpreadBook: String? {
        odds.compactMap { o -> (String, Int)? in
            guard let book = o.book, let oddsStr = o.spread_odds else { return nil }
            let numOdds = Int(oddsStr.replacingOccurrences(of: "+", with: "")) ?? -999
            return (book, numOdds)
        }
        .max(by: { $0.1 < $1.1 })?.0
    }

    /// Find the best ML odds (highest/least negative)
    private var bestMLBook: String? {
        odds.compactMap { o -> (String, Int)? in
            guard let book = o.book, let mlStr = o.ml else { return nil }
            let numOdds = Int(mlStr.replacingOccurrences(of: "+", with: "")) ?? -999
            return (book, numOdds)
        }
        .max(by: { $0.1 < $1.1 })?.0
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header Row
            HStack {
                Text("Sportsbook")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Spread")
                    .frame(width: 80)
                Text("ML")
                    .frame(width: 60)
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.5))
            .textCase(.uppercase)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)

            Divider().background(Color.white.opacity(0.15))

            // Odds Rows
            ForEach(odds) { o in
                HStack {
                    Text(o.book ?? "-")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(Color.white.opacity(0.9))

                    // Spread column
                    if let spread = o.spread, let spreadOdds = o.spread_odds {
                        let isBestSpread = o.book == bestSpreadBook
                        Text("\(spread >= 0 ? "+" : "")\(String(format: "%.1f", spread)) (\(spreadOdds))")
                            .foregroundStyle(isBestSpread ? Color.green : Color.white.opacity(0.8))
                            .fontWeight(isBestSpread ? .bold : .regular)
                            .frame(width: 80)
                    } else {
                        Text("-")
                            .foregroundStyle(Color.white.opacity(0.4))
                            .frame(width: 80)
                    }

                    // ML column
                    if let ml = o.ml, ml != "-" {
                        let isBestML = o.book == bestMLBook
                        Text(ml)
                            .foregroundStyle(isBestML ? Color.green : Color.white.opacity(0.8))
                            .fontWeight(isBestML ? .bold : .regular)
                            .frame(width: 60)
                    } else {
                        Text("-")
                            .foregroundStyle(Color.white.opacity(0.4))
                            .frame(width: 60)
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 8)

                if o.id != odds.last?.id {
                    Divider().background(Color.white.opacity(0.08))
                }
            }

            // Footer hint
            Text("Best odds highlighted in green")
                .font(.system(size: 10))
                .foregroundStyle(Color.white.opacity(0.4))
                .padding(.top, 8)
                .padding(.bottom, 4)
        }
        .background(Color.black.opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// Applies shadow on capsules only on iOS 16+
struct ConditionalCapsuleShadow: ViewModifier {
    let color: Color
    
    func body(content: Content) -> some View {
        if PerformanceMode.current.useExpensiveEffects {
            content.shadow(color: color, radius: 8, y: 4)
        } else {
            content
        }
    }
}

struct PropCardMobile: View {
    let prop: PropPick
    var showTimeOnCard: Bool = false  // Show game time on the card itself (when header shows matchup instead of time)
    @State private var showAnalysis = false
    @State private var isPressed = false
    
    /// Get accent color based on sport/league (matches pick cards)
    private var accentColor: Color {
        Sport.from(league: prop.effectiveLeague).accentColor
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text((prop.player ?? prop.team) ?? "")
                        .font(.headline.bold())
                    if let team = prop.team, prop.player != nil {
                        Text(team)
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }
                Spacer()
                // Odds and time on the right side
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Formatters.americanOdds(prop.odds))
                        .font(.title3.bold())
                        .foregroundStyle(accentColor)
                    // Show time on card when matchup header is used
                    if showTimeOnCard, let time = prop.time, !time.isEmpty {
                        Text(time)
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }
            }
            
            Rectangle()
                .fill(.white.opacity(0.1))
                .frame(height: 1)
            
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .foregroundStyle(accentColor)
                Text("GARY'S PICK")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            
            Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague))
                .font(.headline)
            
            HStack {
                if let bet = prop.bet {
                    Text(bet.uppercased())
                        .font(.subheadline.bold())
                        .foregroundStyle(bet.lowercased() == "over" ? .green : .red)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background((bet.lowercased() == "over" ? Color.green : Color.red).opacity(0.15))
                        .clipShape(Capsule())
                }
                Spacer()
                if let ev = Formatters.computeEV(confidence: prop.confidence, american: prop.odds) {
                    HStack(spacing: 4) {
                        Text("EV:")
                            .foregroundStyle(.secondary)
                        Text(String(format: "+%.1f%%", ev))
                            .foregroundStyle(.green)
                    }
                    .font(.caption.bold())
                }
            }
            
            if let analysis = prop.analysis, !analysis.isEmpty {
                Button {
                    showAnalysis.toggle()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .foregroundStyle(accentColor)
                        Text("View Analysis")
                    }
                    .font(.subheadline.bold())
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .liquidGlassButton(cornerRadius: 12)
                }
                .sheet(isPresented: $showAnalysis) {
                    PropAnalysisSheet(prop: prop)
                }
            }
        }
        .padding(18)
        .background {
            if PerformanceMode.current.useExpensiveEffects {
                // Full design for iOS 16+
                RoundedRectangle(cornerRadius: 20)
                    .fill(GaryColors.cardBg)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(accentColor.opacity(0.4), lineWidth: 1)
                    )
                    .shadow(color: accentColor.opacity(0.1), radius: 16, y: 8)
                    .shadow(color: .black.opacity(0.25), radius: 8, y: 4)
            } else {
                // Lighter version for iOS 15 and below
                RoundedRectangle(cornerRadius: 20)
                    .fill(GaryColors.cardBg)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(accentColor.opacity(0.4), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.2), radius: 6, y: 4)
            }
        }
        .modifier(PerformanceOptimizer())
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = pressing
            }
        }, perform: {})
    }
}

// MARK: - Result Rows

struct GameResultRow: View {
    let result: GameResult
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Formatters.formatDate(result.game_date))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                Text(Formatters.americanOdds(result.odds?.value))
                    .font(.subheadline.bold())
                    .foregroundStyle(GaryColors.goldGradient)
            }
            
            Text(result.pick_text ?? result.matchup ?? "")
                .font(.subheadline)
                .foregroundStyle(.white)
            
            HStack {
                Spacer()
                ResultBadge(result: result.result ?? "")
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(hex: "#111113"))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.25), GaryColors.gold.opacity(0.05)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
        )
    }
}

struct PropResultRow: View {
    let result: PropResult
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(Formatters.formatDate(result.game_date))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
                Text(Formatters.americanOdds(result.odds?.value))
                    .font(.subheadline.bold())
                    .foregroundStyle(GaryColors.goldGradient)
            }
            
            Text(Formatters.propResultTitle(result))
                .font(.subheadline)
                .foregroundStyle(.white)
            
            HStack {
                Spacer()
                ResultBadge(result: result.result ?? "")
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(hex: "#111113"))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.25), GaryColors.gold.opacity(0.05)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
        )
    }
}

struct ResultBadge: View {
    let result: String
    
    private var color: Color {
        switch result {
        case "won": return .green
        case "push": return .yellow
        default: return .red
        }
    }
    
    var body: some View {
        Text(result.uppercased())
            .font(.caption.bold())
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(color.opacity(0.3), lineWidth: 0.5)
            )
    }
}

// MARK: - Sheets

struct AnalysisSheet: View {
    let title: String
    let pick: GaryPick
    var accentColor: Color = GaryColors.gold
    @Environment(\.dismiss) private var dismiss
    
    // Desktop-matching colors
    private let greenAccent = Color(hex: "#4ade80")
    private let amberAccent = Color(hex: "#fbbf24")
    private let darkBg = Color(hex: "#0a0a0a")
    
    /// Get shortened team names
    /// For NCAAB/NCAAF: shows school names; for pro sports: shows mascots
    private var homeTeam: String {
        Formatters.shortTeamName(pick.homeTeam, league: pick.league)
    }
    
    private var awayTeam: String {
        Formatters.shortTeamName(pick.awayTeam, league: pick.league)
    }
    
    /// Extract Gary's narrative from the rationale (after "Gary's Take")
    private var narrative: String {
        guard let rationale = pick.rationale else { return "" }
        if let range = rationale.range(of: "Gary's Take", options: .caseInsensitive) {
            return String(rationale[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Fallback: if no structured format, return everything after the stats section
        if let range = rationale.range(of: "\n\n", options: .backwards) {
            return String(rationale[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return rationale
    }
    
    /// Determine if Gary picked the home team
    private var garyPickedHome: Bool {
        guard let pickText = pick.pick?.lowercased() else { return true }
        let homeLower = (pick.homeTeam ?? "").lowercased()
        let homeShort = Formatters.shortTeamName(pick.homeTeam, league: pick.league).lowercased()
        
        // Check if pick contains home team name
        return pickText.contains(homeLower) || pickText.contains(homeShort)
    }
    
    var body: some View {
        ZStack {
            darkBg.ignoresSafeArea()
            
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.title2.bold())
                            .foregroundStyle(greenAccent)
                        Text("Powered by Gary A.I.")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.7))
                            .padding(10)
                            .background(Circle().fill(Color.white.opacity(0.1)))
                    }
                }
                
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        // TALE OF THE TAPE - Stats Section (Gary's pick on left)
                        if let statsData = pick.statsData, !statsData.isEmpty {
                            TaleOfTapeSection(
                                homeTeam: homeTeam,
                                awayTeam: awayTeam,
                                statsData: statsData,
                                injuries: pick.injuries,
                                garyPickedHome: garyPickedHome
                            )
                        }
                        
                        // GARY'S TAKE - Narrative Section
                        if !narrative.isEmpty {
                            GaryTakeSection(narrative: narrative, accentColor: accentColor)
                        }
                    }
                    .padding(.bottom, 20)
                }
            }
            .padding(20)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Tale of the Tape Section
struct TaleOfTapeSection: View {
    let homeTeam: String
    let awayTeam: String
    let statsData: [StatData]
    let injuries: TeamInjuries?
    let garyPickedHome: Bool  // True if Gary picked the home team
    
    @State private var isExpanded: Bool = false
    private let maxCollapsedStats = 8  // Show only first 8 stats when collapsed
    
    private let greenAccent = Color(hex: "#4ade80")
    
    // MARK: - Injury Helper Functions (extracted to fix type-checking)
    
    /// Abbreviate injury status
    private func statusAbbrev(_ status: String?) -> String {
        guard let s = status?.lowercased() else { return "" }
        if s.contains("out") { return "OUT" }
        if s.contains("injured reserve") || s == "ir" || s.contains("ltir") { return "IR" }
        if s.contains("doubtful") { return "D" }
        if s.contains("questionable") { return "Q" }
        if s.contains("probable") { return "P" }
        if s.contains("day-to-day") || s.contains("dtd") { return "DTD" }
        return ""
    }
    
    /// Get status color (red for OUT/IR/D, orange for Q/DTD)
    private func statusColor(_ abbrev: String) -> Color {
        switch abbrev {
        case "OUT", "IR", "D": return .red.opacity(0.9)
        case "Q", "DTD", "P": return .orange.opacity(0.9)
        default: return .red.opacity(0.9)
        }
    }
    
    /// Validate injury name (filter out corrupt entries)
    private func isValidInjuryName(_ name: String?) -> Bool {
        guard let n = name, n.count >= 4 else { return false }
        let lower = n.lowercased()
        // Reject names that are clearly parsing errors
        if n.contains("\n") || n.contains("\r") { return false }
        if lower.hasPrefix("day") || lower.hasPrefix("out") || lower.hasPrefix("questionable") { return false }
        // Reject concatenated garbage (e.g., "Tari EasonFStatusOut Eason")
        if lower.contains("fstatus") || lower.contains("statusout") || lower.contains("status") { return false }
        // Reject names that are too long (likely concatenation errors)
        if n.count > 35 { return false }
        return true
    }
    
    /// Sort priority for injury status
    private func sortPriority(_ abbrev: String) -> Int {
        switch abbrev {
        case "OUT": return 0
        case "IR": return 1
        case "D": return 2
        case "Q": return 3
        case "DTD": return 4
        case "P": return 5
        default: return 6
        }
    }
    
    /// Left side is always Gary's pick
    private var leftTeam: String { garyPickedHome ? homeTeam : awayTeam }
    private var rightTeam: String { garyPickedHome ? awayTeam : homeTeam }
    
    /// Filter valid stats that can be displayed
    private var validStats: [(offset: Int, element: StatData)] {
        let skipTokens = ["TOP_PLAYERS", "REST_SITUATION", "FIELD_POSITION", "MOTIVATION_CONTEXT", "QB_NAME", "CAREER_RECORD", "ASSESSMENT", "CAREER_GAMES_IN_CONDITION", "TEMPERATURE", "FEELS_LIKE", "WIND_SPEED", "CONDITIONS", "IMPACT"]
        return statsData.enumerated().filter { (_, stat) in
            guard let token = stat.token,
                  let home = stat.home,
                  let away = stat.away else { return false }
            let homeVal = home.getValue(for: token)
            let awayVal = away.getValue(for: token)
            return !skipTokens.contains(token) && homeVal != "N/A" && awayVal != "N/A" && !homeVal.isEmpty && !awayVal.isEmpty
        }.map { ($0.offset, $0.element) }
    }
    
    private var displayedStats: [(offset: Int, element: StatData)] {
        isExpanded ? validStats : Array(validStats.prefix(maxCollapsedStats))
    }
    
    private var hasMoreStats: Bool {
        validStats.count > maxCollapsedStats
    }
    
    /// Map tokens to display names
    private func displayName(for token: String) -> String {
        let map: [String: String] = [
            // NBA/NCAAB stats
            "OFFENSIVE_RATING": "Off Rating",
            "DEFENSIVE_RATING": "Def Rating",
            "NET_RATING": "Net Rating",
            "EFFICIENCY_LAST_10": "Net Rating",
            "ADJ_EFFICIENCY_MARGIN": "Net Rating",
            "SP_PLUS_RATINGS": "Net Rating",
            "PACE": "Pace",
            "PACE_HOME_AWAY": "Record",
            "HOME_AWAY_SPLITS": "Record",
            "EFG_PCT": "eFG%",
            "OPP_EFG_PCT": "Opp eFG%",
            "THREE_PT_SHOOTING": "3PT%",
            "THREE_PCT": "3PT%",
            "THREE_MADE_PER_GAME": "3PM/G",
            "THREE_ATTEMPTED_PER_GAME": "3PA/G",
            "TURNOVER_RATE": "TOV/Game",
            "TOV_RATE": "TOV Rate",
            "TURNOVERS_PER_GAME": "TOV/Game",
            "OREB_RATE": "Off Reb/G",
            "OREB_PER_GAME": "Off Reb/G",
            "FT_RATE": "FT Rate",
            "FT_PCT": "FT%",
            "FTA_PER_GAME": "FTA/Game",
            "CLUTCH_STATS": "Close Games",
            "CLOSE_RECORD": "Close Record",
            "CLOSE_WIN_PCT": "Close Win %",
            "CLOSE_GAMES": "Close Games",
            "TRUE_SHOOTING_PCT": "TS%",
            "OVERALL": "Record",
            "HOME_RECORD": "Home",
            "AWAY_RECORD": "Away",
            "GAMES_PLAYED": "Games",
            "PAINT_SCORING": "Paint Pts",
            "PAINT_DEFENSE": "Opp Paint Pts",
            "TRANSITION_DEFENSE": "Trans Def",
            "RECENT_FORM": "Last 5",
            "PERIMETER_DEFENSE": "3PT Def",
            // NFL/NCAAF stats
            "OFFENSIVE_EPA": "Total YPG",
            "DEFENSIVE_EPA": "Opp Yards",
            "SUCCESS_RATE_OFFENSE": "Yards/Game",
            "SUCCESS_RATE_DEFENSE": "Yards Allowed",
            "SUCCESS_RATE": "Total YPG",
            "EPA_LAST_5": "Recent PPG",
            "EARLY_DOWN_SUCCESS": "Scoring Eff",
            "QB_STATS": "QB Rating",
            "PRESSURE_RATE": "Comp %",
            "RED_ZONE_OFFENSE": "3rd Down %",
            "RED_ZONE_DEFENSE": "Opp 3rd Down %",
            "THIRD_DOWN": "3rd Down %",
            "FOURTH_DOWN": "4th Down %",
            "TURNOVER_MARGIN": "Turnover +/-",
            "OL_RANKINGS": "Rush YPG",
            "DL_RANKINGS": "Opp Rush",
            "RB_STATS": "Yards/Carry",
            "EXPLOSIVE_PLAYS": "Total Yards",
            "EXPLOSIVE_ALLOWED": "Yards Allowed",
            "WR_TE_STATS": "Pass Yards",
            "DEFENSIVE_PLAYMAKERS": "Pts Allowed",
            "SPECIAL_TEAMS": "Record",
            "EXPLOSIVENESS": "Yds/Play",
            "HAVOC_RATE": "Sacks",
            "HAVOC_ALLOWED": "Opp Havoc",
            "PASSING_TDS": "Pass TDs",
            "INTERCEPTIONS": "INTs",
            "RUSHING_TDS": "Rush TDs",
            "RED_ZONE": "3rd Down %",
            "WR_STATS": "Recv YPG",
            "DEFENSIVE_STARS": "Def PPG",
            "SPECIAL_TEAMS_RATING": "Record",
            "TALENT_COMPOSITE": "Talent",
            "FIELD_POSITION": "Yards/G",
            // NEW: Individual NFL stat tokens (flattened)
            "POINTS_PER_GAME": "Points/Game",
            "PPG": "Points/Game",
            "YARDS_PER_GAME": "Yards/Game",
            "YPG": "Yards/Game",
            "TOTAL_YARDS_PER_GAME": "Total YPG",
            "YARDS_PER_PLAY": "Yards/Play",
            "OPP_POINTS_PER_GAME": "Opp PPG",
            "OPP_PPG": "Opp PPG",
            "OPP_YARDS_PER_GAME": "Opp Yards",
            "OPP_YPG": "Opp Yards",
            "POINT_DIFF": "Point Diff",
            "THIRD_DOWN_PCT": "3rd Down %",
            "FOURTH_DOWN_PCT": "4th Down %",
            "TURNOVER_DIFF": "Turnover +/-",
            "TAKEAWAYS": "Takeaways",
            "GIVEAWAYS": "Giveaways",
            "SACKS": "Sacks",
            "QB_RATING": "QB Rating",
            "COMPLETION_PCT": "Comp %",
            "YARDS_PER_ATTEMPT": "Yds/Att",
            "PASS_TDS": "Pass TDs",
            "INTS": "INTs",
            "RUSH_TDS": "Rush TDs",
            "RUSHING_YARDS_PER_GAME": "Rush YPG",
            "RUSH_YPG": "Rush YPG",
            "YARDS_PER_CARRY": "Yds/Carry",
            "RECEIVING_YARDS_PER_GAME": "Recv YPG",
            "RECV_YPG": "Recv YPG",
            "RECEIVING_TDS": "Recv TDs",
            "RECV_TDS": "Recv TDs",
            "YARDS_PER_CATCH": "Yds/Catch",
            "LONGEST_PASS": "Long Pass",
            "LONGEST_RUSH": "Long Rush",
            "TEMPERATURE": "Temp",
            "FEELS_LIKE": "Feels Like",
            "WIND_SPEED": "Wind",
            "CONDITIONS": "Weather",
            "IMPACT": "Weather Impact",
            // NCAAB/NCAAF specific
            "SCORING": "PPG",
            "ASSISTS": "Assists/G",
            "REBOUNDS": "Reb/G",
            "STEALS": "Steals/G",
            "BLOCKS": "Blocks/G",
            "FG_PCT": "FG%",
            // NCAAF BDL stats
            "NCAAF_TOTAL_OFFENSE": "Total YPG",
            "NCAAF_PASSING_OFFENSE": "Pass YPG",
            "NCAAF_RUSHING_OFFENSE": "Rush YPG",
            "NCAAF_SCORING": "Total TDs",
            "NCAAF_DEFENSE": "Def Yds",
            "NCAAF_TURNOVER_MARGIN": "INTs",
            "NCAAF_RED_ZONE_OFFENSE": "Red Zone",
            // NCAAB enriched
            "NCAAB_EFG_PCT": "eFG%",
            "NCAAB_TEMPO": "Tempo",
            "NCAAB_OFFENSIVE_RATING": "Off Rating",
            "NCAAB_AP_RANKING": "AP Rank",
            "NCAAB_COACHES_RANKING": "Coaches Rank",
            "NCAAB_CONFERENCE_RECORD": "Conf Record",
            "NCAAB_NET_RANKING": "NET Rank",
            "NCAAB_STRENGTH_OF_SCHEDULE": "SOS",
            "NCAAB_KENPOM_RATINGS": "KenPom Rank",
            // NHL specific
            "GOALS_FOR": "Goals/G",
            "GOALS_AGAINST": "GA/G",
            "GOAL_DIFFERENTIAL": "Goal Diff",
            "POWER_PLAY_PCT": "PP%",
            "PENALTY_KILL_PCT": "PK%",
            "SHOTS_FOR": "Shots/G",
            "SHOTS_AGAINST": "SA/G",
            "SHOT_DIFFERENTIAL": "Shot Diff",
            "SHOT_QUALITY": "Shot Quality",
            "EXPECTED_GOALS": "xGoals",
            "CORSI_FOR_PCT": "Corsi%",
            "PDO": "PDO",
            "SAVE_PCT": "Save%",
            "GOALIE_STATS": "Goalie",
            "GOALIE_MATCHUP": "Goalie",
            "GOALS_AGAINST_AVG": "GAA",
            "FACEOFF_PCT": "FO%",
            "POSSESSION_METRICS": "Poss%",
            "HOME_ICE": "Home Ice",
            "REST_SITUATION": "Rest",
            "BACK_TO_BACK": "B2B",
            "HIGH_DANGER_CHANCES": "HD Chances",
            "TOP_SCORERS": "Top Scorers",
            "LINE_COMBINATIONS": "Lines"
        ]
        return map[token] ?? token.replacingOccurrences(of: "_", with: " ").capitalized
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section Header
            Text("TALE OF THE TAPE")
                .font(.caption.bold())
                .foregroundStyle(greenAccent)
                .tracking(1)
                .opacity(0.8)
            
            VStack(spacing: 0) {
                // Team Header Row - Gary's pick on left (green), opponent on right
                HStack {
                    Text(leftTeam)
                        .font(.subheadline.bold())
                        .foregroundStyle(greenAccent)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(width: 90, alignment: .leading)
                    
                    Spacer()
                    
                    Text(rightTeam)
                        .font(.subheadline.bold())
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(width: 110, alignment: .trailing)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(Color.white.opacity(0.05))
                
                // Stats Rows - Show first 8 stats, with expand button for more
                ForEach(Array(displayedStats.enumerated()), id: \.offset) { displayIndex, statTuple in
                    let stat = statTuple.element
                    if let token = stat.token,
                       let home = stat.home,
                       let away = stat.away {
                        let homeVal = home.getValue(for: token)
                        let awayVal = away.getValue(for: token)
                        
                        // Get values for display (Gary's pick on left)
                        let leftVal = garyPickedHome ? homeVal : awayVal
                        let rightVal = garyPickedHome ? awayVal : homeVal
                        
                        // Determine if left side (Gary's pick) has advantage
                        let leftAdvantage = garyPickedHome ? 
                            compareValues(homeVal, awayVal, token: token) : 
                            !compareValues(homeVal, awayVal, token: token)
                        
                        HStack {
                            // Left value (Gary's pick)
                            Text(leftVal)
                                .font(.subheadline.bold())
                                .foregroundStyle(leftAdvantage ? greenAccent : .white.opacity(0.6))
                                .frame(width: 70, alignment: .leading)
                            
                            Spacer()
                            
                            // Stat name with arrow
                            HStack(spacing: 4) {
                                if leftAdvantage {
                                    Image(systemName: "arrow.left")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(greenAccent)
                                }
                                Text(displayName(for: token))
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.5))
                                if !leftAdvantage {
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(greenAccent)
                                }
                            }
                            
                            Spacer()
                            
                            // Right value (opponent)
                            Text(rightVal)
                                .font(.subheadline.bold())
                                .foregroundStyle(!leftAdvantage ? greenAccent : .white.opacity(0.6))
                                .frame(width: 70, alignment: .trailing)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(displayIndex % 2 == 0 ? Color.clear : Color.white.opacity(0.02))
                    }
                }
                
                // Show More / Show Less button
                if hasMoreStats {
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            isExpanded.toggle()
                        }
                    }) {
                        HStack(spacing: 6) {
                            Text(isExpanded ? "Show Less" : "Show \(validStats.count - maxCollapsedStats) More")
                                .font(.caption.bold())
                                .foregroundStyle(greenAccent.opacity(0.8))
                            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(greenAccent.opacity(0.8))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.03))
                    }
                    .buttonStyle(.plain)
                }
                
                // Injuries Row
                if let injuries = injuries {
                    // Get injuries with status (name, abbreviation)
                    let homeInjuriesList: [(name: String, status: String)] = (injuries.home ?? []).compactMap { injury in
                        guard isValidInjuryName(injury.name), let name = injury.name else { return nil }
                        let abbrev = statusAbbrev(injury.status)
                        guard !abbrev.isEmpty else { return nil }
                        return (name, abbrev)
                    }
                    let awayInjuriesList: [(name: String, status: String)] = (injuries.away ?? []).compactMap { injury in
                        guard isValidInjuryName(injury.name), let name = injury.name else { return nil }
                        let abbrev = statusAbbrev(injury.status)
                        guard !abbrev.isEmpty else { return nil }
                        return (name, abbrev)
                    }
                    
                    // Sort: OUT/IR/D first, then Q/DTD
                    let homeSorted = homeInjuriesList.sorted { sortPriority($0.status) < sortPriority($1.status) }
                    let awaySorted = awayInjuriesList.sorted { sortPriority($0.status) < sortPriority($1.status) }
                    
                    // Take top 5
                    let homeTop5 = Array(homeSorted.prefix(5))
                    let awayTop5 = Array(awaySorted.prefix(5))
                    
                    // Swap based on Gary's pick
                    let leftInjuries = garyPickedHome ? homeTop5 : awayTop5
                    let rightInjuries = garyPickedHome ? awayTop5 : homeTop5
                    
                    if !leftInjuries.isEmpty || !rightInjuries.isEmpty {
                        Divider().background(Color.white.opacity(0.1))
                        
                        VStack(alignment: .leading, spacing: 8) {
                            // Injuries header
                            Text("KEY INJURIES")
                                .font(.caption.bold())
                                .foregroundStyle(.red.opacity(0.8))
                                .tracking(0.5)
                            
                            HStack(alignment: .top, spacing: 16) {
                                // Left injuries (Gary's pick)
                                VStack(alignment: .leading, spacing: 4) {
                                    if leftInjuries.isEmpty {
                                        Text("✓ Healthy")
                                            .font(.caption)
                                            .foregroundStyle(.green.opacity(0.8))
                                    } else {
                                        ForEach(Array(leftInjuries.enumerated()), id: \.offset) { _, injury in
                                            HStack(spacing: 4) {
                                                Text(injury.status)
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .frame(width: 24, alignment: .leading)
                                                Text(injury.name)
                                                    .font(.caption)
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .lineLimit(1)
                                            }
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                
                                // Right injuries (opponent)
                                VStack(alignment: .trailing, spacing: 4) {
                                    if rightInjuries.isEmpty {
                                        Text("✓ Healthy")
                                            .font(.caption)
                                            .foregroundStyle(.green.opacity(0.8))
                                    } else {
                                        ForEach(Array(rightInjuries.enumerated()), id: \.offset) { _, injury in
                                            HStack(spacing: 4) {
                                                Text(injury.name)
                                                    .font(.caption)
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .lineLimit(1)
                                                Text(injury.status)
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(statusColor(injury.status))
                                                    .frame(width: 24, alignment: .trailing)
                                            }
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            }
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 12)
                        .background(Color.red.opacity(0.05))
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.03))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
    }
    
    /// Compare two stat values to determine if home is better
    private func compareValues(_ home: String, _ away: String, token: String) -> Bool {
        // For defensive stats, lower is better
        let lowerIsBetter = [
            "DEFENSIVE_RATING", "TURNOVER_RATE", "PAINT_DEFENSE",
            "DEFENSIVE_EPA", "SUCCESS_RATE_DEFENSE", "EXPLOSIVE_ALLOWED",
            "RED_ZONE_DEFENSE", "DL_RANKINGS", "DEFENSIVE_PLAYMAKERS",
            "OPP_EFG_PCT", "HAVOC_ALLOWED",
            // Defensive individual stats (lower is better)
            "OPP_POINTS_PER_GAME", "OPP_PPG", "OPP_YARDS_PER_GAME", "OPP_YPG",
            "GIVEAWAYS", "INTERCEPTIONS", "INTS"
        ].contains(token)

        // For records like "5-18", "16-7", compare wins (first number)
        // Applies to RECORD, HOME, AWAY, HOME_AWAY_SPLITS, SPECIAL_TEAMS, etc.
        let recordTokens = ["RECORD", "HOME", "AWAY", "HOME_RECORD", "AWAY_RECORD",
                           "PACE_HOME_AWAY", "HOME_AWAY_SPLITS", "SPECIAL_TEAMS",
                           "SPECIAL_TEAMS_RATING", "ATS_RECORD", "OU_RECORD"]
        
        // Also detect record format automatically (X-Y where X and Y are numbers)
        let isRecordFormat: (String) -> Bool = { val in
            let parts = val.components(separatedBy: "-")
            return parts.count == 2 && Int(parts[0]) != nil && Int(parts[1]) != nil
        }
        
        if recordTokens.contains(token) || (isRecordFormat(home) && isRecordFormat(away)) {
            let homeWins = Int(home.components(separatedBy: "-").first ?? "0") ?? 0
            let awayWins = Int(away.components(separatedBy: "-").first ?? "0") ?? 0
            return homeWins > awayWins
        }

        // For Last 5 / RECENT_FORM (e.g., "WWWWW" vs "LLWLL"), count wins
        if token == "RECENT_FORM" || token == "LAST_5" {
            let homeWins = home.uppercased().filter { $0 == "W" }.count
            let awayWins = away.uppercased().filter { $0 == "W" }.count
            return homeWins > awayWins
        }

        // For turnover margin and point diff, handle positive/negative
        if token == "TURNOVER_MARGIN" || token == "TURNOVER_DIFF" || token == "POINT_DIFF" || token == "NET_RATING" {
            let homeVal = Double(home) ?? 0
            let awayVal = Double(away) ?? 0
            return homeVal > awayVal
        }

        // Extract numeric values for standard comparisons
        // Remove % and handle negative numbers properly
        let cleanNum: (String) -> Double = { val in
            let cleaned = val.replacingOccurrences(of: "%", with: "")
            return Double(cleaned) ?? 0
        }
        
        let homeNum = cleanNum(home)
        let awayNum = cleanNum(away)

        return lowerIsBetter ? homeNum < awayNum : homeNum > awayNum
    }
}

// MARK: - Gary's Take Section
struct GaryTakeSection: View {
    let narrative: String
    var accentColor: Color = Color(hex: "#4ade80")  // Default green, can be overridden

    private let greenAccent = Color(hex: "#4ade80")
    
    /// Remove common opening phrases from paragraphs
    private func cleanParagraph(_ text: String) -> String {
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Simple prefix strings to remove (case insensitive check)
        let prefixesToRemove = [
            "Here's how I see this playing out:",
            "Here's how I see it playing out:",
            "Here's the thing:",
            "Let me break this down:",
            "Here's my take:",
            "Bottom line:",
            "The bottom line:",
            "Here's the deal:"
        ]
        
        // Check and remove simple prefixes
        for prefix in prefixesToRemove {
            if cleaned.lowercased().hasPrefix(prefix.lowercased()) {
                cleaned = String(cleaned.dropFirst(prefix.count))
                break
            }
        }
        
        // Handle "I love this spot for [team]." or "I love this spot for [team]:" pattern
        if cleaned.lowercased().hasPrefix("i love this spot") {
            // Find the first period or colon after "I love this spot"
            if let periodIndex = cleaned.firstIndex(of: ".") {
                let afterPeriod = cleaned.index(after: periodIndex)
                if afterPeriod < cleaned.endIndex {
                    cleaned = String(cleaned[afterPeriod...])
                }
            } else if let colonIndex = cleaned.firstIndex(of: ":") {
                let afterColon = cleaned.index(after: colonIndex)
                if afterColon < cleaned.endIndex {
                    cleaned = String(cleaned[afterColon...])
                }
            }
        }
        
        // Handle "Here's the thing about this [matchup]:" pattern
        if cleaned.lowercased().hasPrefix("here's the thing about") {
            if let colonIndex = cleaned.firstIndex(of: ":") {
                let afterColon = cleaned.index(after: colonIndex)
                if afterColon < cleaned.endIndex {
                    cleaned = String(cleaned[afterColon...])
                }
            }
        }
        
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Capitalize first letter after cleaning
        if let first = cleaned.first, first.isLowercase {
            cleaned = cleaned.prefix(1).uppercased() + cleaned.dropFirst()
        }
        
        return cleaned
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section Header
            Text("GARY'S TAKE")
                .font(.caption.bold())
                .foregroundStyle(greenAccent)
                .tracking(1)
                .opacity(0.8)

            // Narrative text - split into paragraphs with dividers
            VStack(alignment: .leading, spacing: 0) {
                let paragraphs = narrative.components(separatedBy: "\n\n").filter { !$0.isEmpty }

                ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, para in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(cleanParagraph(para))
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.92))
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.vertical, 14)
                        
                        // Add divider between paragraphs (not after last one)
                        if index < paragraphs.count - 1 {
                            Rectangle()
                                .fill(accentColor.opacity(0.5))
                                .frame(height: 1)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.03))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(accentColor.opacity(0.35), lineWidth: 1)
            )
        }
    }
}

/// Displays analysis content with proper formatting
struct FormattedAnalysisView: View {
    let content: String
    let accentColor: Color
    
    var body: some View {
        let lines = content.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                AnalysisLineView(line: line, accentColor: accentColor)
            }
        }
    }
}

/// Renders a single line of analysis with appropriate styling
struct AnalysisLineView: View {
    let line: String
    let accentColor: Color
    
    // Desktop-matching colors
    private let greenAccent = Color(hex: "#4ade80")
    private let amberAccent = Color(hex: "#fbbf24")
    
    var body: some View {
        let upperLine = line.uppercased()
        
        // Section headers - use green like desktop
        if upperLine.contains("TALE OF THE TAPE") || 
           upperLine.contains("GARY'S TAKE") || 
           upperLine.contains("KEY INJURIES") ||
           upperLine == "THE EDGE" ||
           upperLine == "THE VERDICT" {
            Text(line.uppercased())
                .font(.caption.bold())
                .foregroundStyle(greenAccent)
                .tracking(1)
                .padding(.top, 8)
                .opacity(0.8)
        }
        // Team names (green for picked team style)
        else if !line.contains("→") && !line.contains("←") && !line.contains("•") && 
                !line.contains(":") && line.count < 35 && 
                isTeamName(line) {
            Text(line)
                .font(.subheadline.bold())
                .foregroundStyle(greenAccent)
        }
        // Stats rows with arrows
        else if line.contains("→") || line.contains("←") {
            StatRowView(line: line, accentColor: accentColor)
        }
        // Bullet points
        else if line.hasPrefix("•") {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(greenAccent)
                    .frame(width: 5, height: 5)
                    .padding(.top, 6)
                Text(String(line.dropFirst()).trimmingCharacters(in: .whitespaces))
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // Regular text (narrative)
        else {
            Text(line)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.92))
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    
    private func isTeamName(_ text: String) -> Bool {
        // Common team name patterns - NBA, NFL, College
        let teamPatterns = ["Pacers", "Kings", "Lakers", "Celtics", "Warriors", "Nets", "Knicks", 
                           "Heat", "Bulls", "Bucks", "Suns", "Mavs", "Mavericks", "Clippers",
                           "Nuggets", "Grizzlies", "Pelicans", "Cavaliers", "Raptors", "Hawks",
                           "Hornets", "Magic", "Pistons", "Wizards", "Thunder", "Blazers",
                           "Jazz", "Timberwolves", "Spurs", "Rockets", "76ers", "Sixers",
                           "Indiana", "Sacramento", "Los Angeles", "Boston", "Golden State",
                           "Cardinals", "Cowboys", "Eagles", "Giants", "Commanders", "Bears",
                           "Lions", "Packers", "Vikings", "Falcons", "Panthers", "Saints",
                           "Buccaneers", "49ers", "Seahawks", "Rams", "Chiefs", "Raiders",
                           "Chargers", "Broncos", "Dolphins", "Bills", "Patriots", "Jets",
                           "Ravens", "Bengals", "Browns", "Steelers", "Texans", "Colts",
                           "Jaguars", "Titans", "Wildcats", "Bulldogs", "Tigers", "Crimson"]
        return teamPatterns.contains { text.contains($0) }
    }
}

/// Renders a stat row with values and arrow
struct StatRowView: View {
    let line: String
    let accentColor: Color
    
    // Desktop-matching colors
    private let greenAccent = Color(hex: "#4ade80")
    
    // Parse the stat line into components
    private var parsedStat: (statName: String, leftVal: String, rightVal: String, isRightAdvantage: Bool)? {
        let isRightAdvantage = line.contains("→")
        let parts = line
            .replacingOccurrences(of: "→", with: "|")
            .replacingOccurrences(of: "←", with: "|")
            .components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        
        guard parts.count >= 2 else { return nil }
        
        let leftPart = parts[0]
        let rightPart = parts[parts.count - 1]
        
        // Extract stat name and left value - expanded list matching desktop
        let statLabels = ["Record", "Off Rating", "Def Rating", "Net Rating", "Pace", "eFG%", 
                         "TOV%", "ORB%", "FT Rate", "Key Injuries", "Injuries", "Last 5",
                         "3PT%", "Paint Scoring", "Paint Defense", "Close Games",
                         "Total YPG", "Opp Yards", "Yards/Game", "Yards Allowed",
                         "Recent PPG", "Scoring Efficiency", "QB Rating", "Completion %",
                         "3rd Down %", "Opp 3rd Down %", "Turnover +/-", "Rush YPG",
                         "Opp Rush", "Rush Yards/Carry", "Total Yards", "Pass Yards",
                         "Def Points Allowed", "Big Plays", "Havoc Rate", "Opp Havoc"]
        
        var statName = ""
        var leftVal = leftPart
        
        for label in statLabels {
            if leftPart.contains(label) {
                statName = label
                leftVal = leftPart.replacingOccurrences(of: label, with: "").trimmingCharacters(in: .whitespaces)
                break
            }
        }
        
        return (statName, leftVal, rightPart, isRightAdvantage)
    }
    
    var body: some View {
        if let stat = parsedStat {
            HStack {
                // Left value - green if advantage, white if not
                Text(stat.leftVal)
                    .font(.subheadline.bold())
                    .foregroundStyle(stat.isRightAdvantage ? .white.opacity(0.7) : greenAccent)
                    .frame(width: 65, alignment: .leading)
                
                Spacer()
                
                // Stat name with arrow indicator
                HStack(spacing: 4) {
                    if !stat.isRightAdvantage {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(greenAccent)
                    }
                    Text(stat.statName)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.5))
                    if stat.isRightAdvantage {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(greenAccent)
                    }
                }
                
                Spacer()
                
                // Right value - green if advantage, white if not
                Text(stat.rightVal)
                    .font(.subheadline.bold())
                    .foregroundStyle(stat.isRightAdvantage ? greenAccent : .white.opacity(0.7))
                    .frame(width: 65, alignment: .trailing)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.white.opacity(0.05))
            )
        } else {
            Text(line)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))
        }
    }
}

// MARK: - Analysis Section Models

struct AnalysisSection: Identifiable {
    let id = UUID()
    let title: String
    let type: SectionType
    var content: String
    var tapeData: [(String, String, String)] // (label, awayValue, homeValue)
    var teams: (String, String) // (away, home)
    var bullets: [String]
    
    enum SectionType {
        case taleOfTape
        case injuries
        case bullets
        case text
    }
}

struct AnalysisSectionView: View {
    let section: AnalysisSection
    let accentColor: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section Header
            Text(section.title)
                .font(.caption.bold())
                .foregroundStyle(accentColor)
                .tracking(1)
            
            // Section Content
            VStack(alignment: .leading, spacing: 16) {
                switch section.type {
                case .taleOfTape:
                    // Stats table
                    TaleOfTapeView(teams: section.teams, data: section.tapeData, accentColor: accentColor)
                    
                    // Injuries within the same card
                    if !section.bullets.isEmpty {
                        Divider()
                            .background(accentColor.opacity(0.3))
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("KEY INJURIES")
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                                .tracking(0.5)
                            
                            InjuriesView(injuries: section.bullets, teams: section.teams)
                        }
                    }
                    
                case .injuries:
                    InjuriesView(injuries: section.bullets, teams: ("", ""))
                    
                case .bullets:
                    GaryTakeView(bullets: section.bullets)
                    
                case .text:
                    Text(section.content)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .liquidGlass(cornerRadius: 14)
        }
    }
}

struct TaleOfTapeView: View {
    let teams: (String, String) // (team1, team2) - order from parsing
    let data: [(String, String, String)] // (label, team1Value, team2Value)
    let accentColor: Color
    var league: String? = nil // Optional league for college team name formatting
    
    /// Get shortened team names
    /// For NCAAB/NCAAF: shows school names; for pro sports: shows mascots
    private var shortTeams: (String, String) {
        let short1 = Formatters.shortTeamName(teams.0, league: league)
        let short2 = Formatters.shortTeamName(teams.1, league: league)
        return (short1, short2)
    }
    
    var body: some View {
        VStack(spacing: 12) {
            // Team Header - Centered matchup display
            HStack(spacing: 16) {
                Text(shortTeams.0)
                    .font(.subheadline.bold())
                    .foregroundStyle(GaryColors.gold)
                
                Text(shortTeams.1)
                    .font(.subheadline.bold())
                    .foregroundStyle(GaryColors.gold)
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 4)
            
            // Column headers
            HStack {
                Text(shortTeams.0)
                    .font(.caption2.bold())
                    .foregroundStyle(GaryColors.lightGold)
                    .frame(width: 55, alignment: .leading)
                
                Spacer()
                
                Text("")
                    .frame(maxWidth: .infinity)
                
                Spacer()
                
                Text(shortTeams.1)
                    .font(.caption2.bold())
                    .foregroundStyle(GaryColors.lightGold)
                    .frame(width: 55, alignment: .trailing)
            }
            
            // Stats Table
            VStack(spacing: 6) {
                ForEach(Array(data.enumerated()), id: \.offset) { _, row in
                    HStack {
                        // Team 1 value
                        Text(row.1)
                            .font(.subheadline.bold())
                            .foregroundStyle(.white)
                            .frame(width: 55, alignment: .leading)
                        
                        Spacer()
                        
                        // Stat label
                        Text(row.0)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        
                        Spacer()
                        
                        // Team 2 value
                        Text(row.2)
                            .font(.subheadline.bold())
                            .foregroundStyle(.white)
                            .frame(width: 55, alignment: .trailing)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(hex: "#0D0D0F"))
                    )
                }
            }
        }
    }
}

struct InjuriesView: View {
    let injuries: [String]
    let teams: (String, String)
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Split injuries by team if possible
            ForEach(injuries, id: \.self) { injury in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(.red.opacity(0.8))
                        .frame(width: 6, height: 6)
                        .padding(.top, 6)
                    Text(injury)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct GaryTakeView: View {
    let bullets: [String]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(bullets, id: \.self) { bullet in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(GaryColors.gold)
                        .frame(width: 6, height: 6)
                        .padding(.top, 6)
                    Text(bullet)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct BulletListView: View {
    let bullets: [String]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(bullets, id: \.self) { bullet in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(GaryColors.gold)
                        .frame(width: 6, height: 6)
                        .padding(.top, 6)
                    Text(bullet)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct BulletPointSheet: View {
    let title: String
    let content: String
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        ZStack {
            LiquidGlassBackground(accentColor: GaryColors.gold)
            
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(title)
                        .font(.title2.bold())
                        .foregroundStyle(GaryColors.goldGradient)
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.secondary)
                            .padding(10)
                            .liquidGlassCircle()
                    }
                }
                
                ScrollView(showsIndicators: false) {
                    let bullets = content
                        .components(separatedBy: "•")
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                    
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(bullets, id: \.self) { line in
                            HStack(alignment: .top, spacing: 12) {
                                Circle()
                                    .fill(GaryColors.gold)
                                    .frame(width: 6, height: 6)
                                    .padding(.top, 6)
                                Text(line)
                                    .font(.body)
                                    .lineSpacing(4)
                            }
                        }
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 16)
                }
            }
            .padding(20)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Prop Analysis Sheet (Enhanced)
struct PropAnalysisSheet: View {
    let prop: PropPick
    @Environment(\.dismiss) private var dismiss
    
    private let greenAccent = Color(hex: "#4ade80")
    private let darkBg = Color(hex: "#0a0a0a")
    
    private var accentColor: Color {
        if prop.isTDPick {
            return prop.tdCategory == "underdog" ? Color(hex: "#22C55E") : Color(hex: "#3B82F6")
        }
        return Sport.from(league: prop.effectiveLeague).accentColor
    }
    
    /// Clean prop analysis text - remove caps labels and format nicely
    private func cleanPropAnalysis(_ text: String) -> [String] {
        var cleaned = text
        
        // Remove caps section labels
        let labelsToRemove = [
            "HYPOTHESIS:",
            "EVIDENCE:",
            "CONVERGENCE",  // May have score like (0.78)
            "IF WRONG:",
            "THE EDGE:",
            "THE VERDICT:",
            "RISK:"
        ]
        
        for label in labelsToRemove {
            // Remove the label and any score in parentheses after it
            if let range = cleaned.range(of: label, options: .caseInsensitive) {
                // Check if followed by a score like (0.78):
                let afterLabel = cleaned[range.upperBound...]
                if afterLabel.hasPrefix(" (") || afterLabel.hasPrefix("(") {
                    // Find the closing ) and any :
                    if let closeParenRange = afterLabel.range(of: "):") {
                        cleaned.removeSubrange(range.lowerBound...closeParenRange.upperBound)
                    } else if let closeParenRange = afterLabel.range(of: ")") {
                        cleaned.removeSubrange(range.lowerBound...closeParenRange.upperBound)
                    } else {
                        cleaned.removeSubrange(range)
                    }
                } else {
                    cleaned.removeSubrange(range)
                }
            }
        }
        
        // First try splitting by newlines
        var paragraphs = cleaned.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        
        // If we only got 1 paragraph but it's long, try to split it smartly
        if paragraphs.count == 1 && paragraphs[0].count > 300 {
            let longText = paragraphs[0]
            var sections: [String] = []
            var remaining = longText
            
            // Look for "if wrong" type patterns to split the last section
            let riskPatterns = [
                " Ottawa either", " Winnipeg either", " The only way this misses",
                " The risk here", " If wrong", " The main risk",
                " Where this misses", " This misses if", " The fade scenario"
            ]
            
            for pattern in riskPatterns {
                if let range = remaining.range(of: pattern, options: .caseInsensitive) {
                    let beforeRisk = String(remaining[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                    let riskSection = String(remaining[range.lowerBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                    
                    if !beforeRisk.isEmpty {
                        // Try to split the first part roughly in half by finding a sentence break
                        let midPoint = beforeRisk.count / 2
                        let searchRange = beforeRisk.index(beforeRisk.startIndex, offsetBy: max(0, midPoint - 100))..<beforeRisk.index(beforeRisk.startIndex, offsetBy: min(beforeRisk.count, midPoint + 100))
                        
                        if let periodRange = beforeRisk.range(of: ". ", options: [], range: searchRange) {
                            let firstHalf = String(beforeRisk[..<periodRange.upperBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                            let secondHalf = String(beforeRisk[periodRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                            if !firstHalf.isEmpty { sections.append(firstHalf) }
                            if !secondHalf.isEmpty { sections.append(secondHalf) }
                        } else {
                            sections.append(beforeRisk)
                        }
                    }
                    if !riskSection.isEmpty { sections.append(riskSection) }
                    remaining = ""
                    break
                }
            }
            
            // If no risk pattern found, just split into 2-3 parts by sentence
            if sections.isEmpty && !remaining.isEmpty {
                let sentences = remaining.components(separatedBy: ". ")
                let sentenceCount = sentences.count
                if sentenceCount >= 4 {
                    let firstBreak = sentenceCount / 3
                    let secondBreak = (sentenceCount * 2) / 3
                    sections.append(sentences[0..<firstBreak].joined(separator: ". ") + ".")
                    sections.append(sentences[firstBreak..<secondBreak].joined(separator: ". ") + ".")
                    sections.append(sentences[secondBreak...].joined(separator: ". "))
                } else if sentenceCount >= 2 {
                    let midBreak = sentenceCount / 2
                    sections.append(sentences[0..<midBreak].joined(separator: ". ") + ".")
                    sections.append(sentences[midBreak...].joined(separator: ". "))
                } else {
                    sections.append(remaining)
                }
            }
            
            paragraphs = sections.filter { !$0.isEmpty }
        }
        
        // Clean up each paragraph
        return paragraphs.map { para -> String in
            var p = para.trimmingCharacters(in: .whitespacesAndNewlines)
            // Capitalize first letter if lowercase
            if let first = p.first, first.isLowercase {
                p = p.prefix(1).uppercased() + p.dropFirst()
            }
            return p
        }
    }
    
    private var categoryLabel: String? {
        guard let cat = prop.tdCategory else { return nil }
        switch cat {
        case "standard": return "Regular Pick"
        case "underdog": return "Value Pick (+200+)"
        case "first_td": return "🥇 First TD"
        default: return nil
        }
    }
    
    var body: some View {
        ZStack {
            darkBg.ignoresSafeArea()
            
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Gary's Analysis")
                            .font(.title2.bold())
                            .foregroundStyle(greenAccent)
                        Text("Powered by Gary A.I.")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.7))
                            .padding(10)
                            .background(Circle().fill(Color.white.opacity(0.1)))
                    }
                }
                .padding(.bottom, 20)
                
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        // Player & Pick Info Card
                        VStack(alignment: .leading, spacing: 16) {
                            // Player Header
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(prop.player ?? "Unknown")
                                        .font(.title3.bold())
                                        .foregroundStyle(.white)
                                    
                                    if let team = prop.team {
                                        Text(team)
                                            .font(.subheadline)
                                            .foregroundStyle(.white.opacity(0.6))
                                    }
                                    
                                    if let matchup = prop.matchup {
                                        Text(matchup)
                                            .font(.caption)
                                            .foregroundStyle(.white.opacity(0.4))
                                    }
                                }
                                
                                Spacer()
                                
                                // Odds - just accent color text, no box
                                Text(Formatters.americanOdds(prop.odds))
                                    .font(.title2.bold())
                                    .foregroundStyle(accentColor)
                            }
                            
                            Rectangle()
                                .fill(.white.opacity(0.1))
                                .frame(height: 1)
                            
                            // The Pick
                            HStack(spacing: 12) {
                                Image(systemName: "bolt.fill")
                                    .font(.system(size: 14))
                                    .foregroundStyle(accentColor)
                                
                                Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague))
                                    .font(.headline)
                                    .foregroundStyle(.white)
                                
                                if let bet = prop.bet {
                                    Text(bet.uppercased())
                                        .font(.subheadline.bold())
                                        .foregroundStyle(bet.lowercased() == "over" ? .green : .red)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background((bet.lowercased() == "over" ? Color.green : Color.red).opacity(0.15))
                                        .clipShape(Capsule())
                                }
                                
                                Spacer()
                            }
                            
                            // Category Badge for TD picks
                            if let category = categoryLabel {
                                HStack(spacing: 6) {
                                    Image(systemName: prop.tdCategory == "underdog" ? "sparkles" : "checkmark.seal.fill")
                                        .font(.system(size: 11))
                                    Text(category)
                                        .font(.caption.bold())
                                }
                                .foregroundStyle(accentColor)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(accentColor.opacity(0.1))
                                .clipShape(Capsule())
                            }
                        }
                        .padding(18)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color(hex: "#111113"))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(accentColor.opacity(0.2), lineWidth: 1)
                                )
                        )
                        
                        // Gary's Take Section
                        if let analysis = prop.analysis, !analysis.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("GARY'S TAKE")
                                    .font(.caption.bold())
                                    .foregroundStyle(greenAccent)
                                    .tracking(1)
                                    .opacity(0.8)
                                
                                // Content container with bullets FIRST, then paragraphs
                                VStack(alignment: .leading, spacing: 0) {
                                    let paragraphs = cleanPropAnalysis(analysis)
                                    
                                    // Key Stats Bullets FIRST (if available)
                                    if let keyStats = prop.key_stats, !keyStats.isEmpty {
                                        VStack(alignment: .leading, spacing: 8) {
                                            ForEach(keyStats, id: \.self) { stat in
                                                HStack(alignment: .top, spacing: 10) {
                                                    Circle()
                                                        .fill(greenAccent)
                                                        .frame(width: 5, height: 5)
                                                        .padding(.top, 6)
                                                    Text(stat)
                                                        .font(.subheadline)
                                                        .foregroundStyle(.white.opacity(0.85))
                                                        .lineSpacing(3)
                                                }
                                            }
                                        }
                                        .padding(.vertical, 14)
                                        
                                        // Divider after bullets if there are paragraphs
                                        if !paragraphs.isEmpty {
                                            Rectangle()
                                                .fill(accentColor.opacity(0.5))
                                                .frame(height: 1)
                                        }
                                    }
                                    
                                    // Cleaned paragraphs AFTER bullets
                                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, para in
                                        VStack(alignment: .leading, spacing: 0) {
                                            Text(para)
                                                .font(.subheadline)
                                                .foregroundStyle(.white.opacity(0.92))
                                                .lineSpacing(5)
                                                .fixedSize(horizontal: false, vertical: true)
                                                .padding(.vertical, 14)
                                            
                                            // Add divider between paragraphs (not after last one)
                                            if index < paragraphs.count - 1 {
                                                Rectangle()
                                                    .fill(accentColor.opacity(0.5))
                                                    .frame(height: 1)
                                            }
                                        }
                                    }
                                }
                                .padding(.horizontal, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.white.opacity(0.03))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(accentColor.opacity(0.35), lineWidth: 1)
                                )
                            }
                        }
                        
                        // Time & Sport Info
                        HStack(spacing: 16) {
                            if let time = prop.time, !time.isEmpty, time != "TBD" {
                                HStack(spacing: 6) {
                                    Image(systemName: "clock")
                                        .font(.system(size: 12))
                                    Text(time)
                                        .font(.caption)
                                }
                                .foregroundStyle(.white.opacity(0.5))
                            }
                            
                            if let league = prop.effectiveLeague {
                                HStack(spacing: 6) {
                                    Image(systemName: Sport.from(league: league).icon)
                                        .font(.system(size: 12))
                                    Text(league)
                                        .font(.caption.bold())
                                }
                                .foregroundStyle(accentColor)
                            }
                            
                            Spacer()
                        }
                        .padding(.horizontal, 4)
                    }
                    .padding(.bottom, 20)
                }
            }
            .padding(20)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Web Container

struct WebContainer: UIViewRepresentable {
    let url: URL
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
        view.pageZoom = 1.12
        return view
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {
        if uiView.url != url {
            uiView.load(URLRequest(url: url))
        }
    }
}

// MARK: - Shape Helpers

struct RoundedCorner: Shape {
    var radius: CGFloat = .infinity
    var corners: UIRectCorner = .allCorners
    
    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

// MARK: - Formatters

enum Formatters {
    static func labelEST(_ time: String?) -> String {
        guard let time = time, !time.isEmpty else { return "" }
        return time.uppercased().contains("EST") ? time : "\(time) EST"
    }
    
    /// Clean game time display - just the time, no emojis
    static func formatGameTime(_ time: String?) -> String {
        guard let time = time, !time.isEmpty else { return "" }
        // Remove any emoji characters and clean up
        let clean = time
            .replacingOccurrences(of: "🏈", with: "")
            .replacingOccurrences(of: "🏀", with: "")
            .replacingOccurrences(of: "⚾", with: "")
            .replacingOccurrences(of: "🏒", with: "")
            .replacingOccurrences(of: "⏰", with: "")
            .replacingOccurrences(of: "🕐", with: "")
            .trimmingCharacters(in: .whitespaces)
        // If it already has AM/PM or EST, return as is
        let upper = clean.uppercased()
        if upper.contains("AM") || upper.contains("PM") || upper.contains("EST") || upper.contains("ET") {
            return clean
        }
        return clean
    }
    
    /// Format ISO commence_time to readable time (e.g., "1:00 PM ET")
    static func formatCommenceTime(_ isoTime: String?) -> String {
        guard let isoTime = isoTime, !isoTime.isEmpty else { return "" }
        
        // Try to parse ISO format: "2025-12-07T18:00:00Z"
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        // Try with fractional seconds first, then without
        var date = isoFormatter.date(from: isoTime)
        if date == nil {
            isoFormatter.formatOptions = [.withInternetDateTime]
            date = isoFormatter.date(from: isoTime)
        }
        
        guard let gameDate = date else {
            // Fallback: return cleaned version
            return formatGameTime(isoTime)
        }
        
        // Format to readable time in ET
        let displayFormatter = DateFormatter()
        displayFormatter.dateFormat = "h:mm a"
        displayFormatter.timeZone = TimeZone(identifier: "America/New_York")
        
        return displayFormatter.string(from: gameDate) + " ET"
    }
    
    static func confidencePercent(_ confidence: Double?) -> Int {
        guard let c = confidence else { return 0 }
        return Int(round(c * 100))
    }
    
    static func americanOdds(_ odds: String?) -> String {
        guard let s = odds, !s.isEmpty else { return "" }
        if s.hasPrefix("+") || s.hasPrefix("-") { return s }
        if let n = Int(s) { return n > 0 ? "+\(n)" : "\(n)" }
        return s
    }
    
    static func propDisplay(_ raw: String?, league: String? = nil) -> String {
        guard var s = raw, !s.isEmpty else { return "" }
        s = s.replacingOccurrences(of: "_", with: " ")
        let parts = s.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        if parts.isEmpty { return s.capitalized }
        
        var typeWords = parts
        var linePart: String? = nil
        if let last = parts.last, Double(last) != nil {
            linePart = last
            typeWords = Array(parts.dropLast())
        }
        
        // Handle combined props like "goals assists" -> "Goals + Assists"
        var typeTitle = typeWords.joined(separator: " ").capitalized
        
        // Special case: combined stat props with "+" separator
        let combinedProps = ["Goals Assists", "Rebounds Assists", "Points Rebounds", "Points Assists", "Points Rebounds Assists"]
        for combo in combinedProps {
            if typeTitle.lowercased() == combo.lowercased() {
                typeTitle = combo.split(separator: " ").map(String.init).joined(separator: " + ")
                break
            }
        }
        
        // Fix "Td" -> "TD" (capitalized lowercases the D)
        typeTitle = typeTitle.replacingOccurrences(of: " Td", with: " TD")
        typeTitle = typeTitle.replacingOccurrences(of: "Td ", with: "TD ")
        if typeTitle == "Td" { typeTitle = "TD" }
        if typeTitle.hasSuffix(" Td") { typeTitle = String(typeTitle.dropLast(2)) + "TD" }
        
        // Return formatted prop with line number (no + suffix)
        return linePart.map { "\(typeTitle) \($0)" } ?? typeTitle
    }
    
    static func computeEV(confidence: Double?, american: String?) -> Double? {
        guard let p = confidence,
              let aStr = american,
              let am = Int(aStr.replacingOccurrences(of: "+", with: "")) else { return nil }
        
        let b: Double = am > 0 ? Double(am) / 100.0 : 100.0 / Double(abs(am))
        let prob = p > 1.0 ? (p / 100.0) : p
        let ev = prob * b - (1 - prob)
        return (ev * 100) / 10.0
    }
    
    static func formatDate(_ iso: String?) -> String {
        guard let iso = iso, let day = iso.split(separator: "T").first else { return "" }
        let parts = day.split(separator: "-")
        if parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]) {
            let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            return "\(months[max(1, min(12, m)) - 1]) \(d)"
        }
        return String(day)
    }
    
    static func propResultTitle(_ p: PropResult) -> String {
        if let txt = p.pick_text, !txt.isEmpty { return propDisplay(txt, league: p.effectiveLeague) }
        return [
            p.player_name,
            p.prop_type?.replacingOccurrences(of: "_", with: " ").capitalized,
            p.bet?.uppercased(),
            p.line_value?.value
        ].compactMap { $0 }.joined(separator: " ")
    }
    
    /// Get short team name for display
    /// - For NCAAB/NCAAF: Returns school name (e.g., "Nebraska" from "Nebraska Cornhuskers")
    /// - For pro sports: Returns mascot (e.g., "Thunder" from "Oklahoma City Thunder")
    static func shortTeamName(_ team: String?, league: String? = nil) -> String {
        guard let team = team, !team.isEmpty else { return "" }
        let words = team.split(separator: " ").map(String.init)
        
        guard words.count > 1 else { return team }
        
        // Check if this is a college sport
        let leagueUpper = (league ?? "").uppercased()
        let isCollege = leagueUpper == "NCAAB" || leagueUpper == "NCAAF"
        
        if isCollege {
            // For college: return school name (remove mascot from end)
            return collegeSchoolName(words)
        } else {
            // For pro sports: return mascot (last word)
            return words.last ?? team
        }
    }
    
    /// Extract college school name from full team name
    /// Removes mascot(s) from the end, keeping school/location
    /// e.g., "Nebraska Cornhuskers" → "Nebraska"
    /// e.g., "North Carolina Tar Heels" → "North Carolina"
    /// e.g., "San Diego State Aztecs" → "San Diego State"
    private static func collegeSchoolName(_ words: [String]) -> String {
        guard words.count >= 2 else { return words.joined(separator: " ") }
        
        // For 2-word names, first word is school
        if words.count == 2 {
            return words[0]
        }
        
        // Common mascot prefix words that indicate a 2-word mascot
        // e.g., "Fighting Illini", "Blue Devils", "Red Raiders", "Tar Heels"
        let mascotPrefixes: Set<String> = [
            "Fighting", "Golden", "Blue", "Red", "Crimson", "Scarlet", "Mean",
            "Runnin", "Running", "Flying", "Ragin", "Sun", "War", "Nittany",
            "Horned", "Yellow", "Demon", "Green", "Purple", "Orange", "Tar", "Great"
        ]
        
        // Check if second-to-last word is a mascot prefix (indicates 2-word mascot)
        let secondToLast = words[words.count - 2]
        if mascotPrefixes.contains(secondToLast) {
            // Two-word mascot, remove last 2 words
            return words.dropLast(2).joined(separator: " ")
        }
        
        // Single-word mascot, remove last word only
        return words.dropLast(1).joined(separator: " ")
    }
    
    static func splitPickAndOdds(_ pick: String?) -> (String, String) {
        guard let pick = pick, !pick.isEmpty else { return ("", "") }
        
        // Pattern to match American odds at the end (typically -110, +150, -105, etc.)
        // American odds are usually 3+ digits (100 or greater absolute value)
        // Spread/line values are smaller (like -7.5, +3, -14.5)
        let pattern = #"(.+?)\s+([-+]\d{3,}\.?\d*)$"#
        var pickPart = pick
        var oddsPart = ""
        
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: pick, range: NSRange(pick.startIndex..., in: pick)) {
            if let pickRange = Range(match.range(at: 1), in: pick),
               let oddsRange = Range(match.range(at: 2), in: pick) {
                let potentialOdds = String(pick[oddsRange])
                // Only treat as odds if absolute value >= 100 (American odds format)
                if let oddsValue = Double(potentialOdds.replacingOccurrences(of: "+", with: "")),
                   abs(oddsValue) >= 100 {
                    pickPart = String(pick[pickRange]).trimmingCharacters(in: .whitespaces)
                    oddsPart = potentialOdds
                }
            }
        }
        
        // First shorten city names, then truncate if still too long
        let shortenedPick = shortenTeamNamesInPick(pickPart)
        let truncatedPick = truncatePickText(shortenedPick)
        return (truncatedPick, oddsPart)
    }
    
    private static func shortenTeamNamesInPick(_ pick: String) -> String {
        // Pro sports cities to shorten (NOT college - college teams use city/school as part of name)
        let cities = ["Dallas", "Detroit", "Los Angeles", "LA", "New York", "NY", "Boston", "Washington",
                      "Golden State", "San Francisco", "San Antonio", "New Orleans", "Oklahoma City", "OKC",
                      "Minnesota", "Milwaukee", "Miami", "Memphis", "Indiana", "Houston", "Denver",
                      "Cleveland", "Chicago", "Charlotte", "Brooklyn", "Atlanta", "Phoenix", "Portland",
                      "Sacramento", "Toronto", "Utah", "Orlando", "Philadelphia", "Cincinnati", "Baltimore",
                      "Pittsburgh", "Kansas City", "Las Vegas", "Seattle", "Tampa Bay", "Green Bay",
                      "New England", "Tennessee", "Arizona", "Carolina", "Buffalo"]
        // Note: Removed "Jacksonville" - it's also a college team name (Jacksonville State)
        
        // College indicators - don't strip city if followed by these words
        let collegeIndicators = ["State", "Tech", "A&M", "University", "College", "Southern", "Northern", "Eastern", "Western", "Central"]
        
        var result = pick
        for city in cities {
            // Check if this city is followed by a college indicator - if so, skip it
            let cityPattern = "\\b\(city)\\s+(\\w+)"
            if let regex = try? NSRegularExpression(pattern: cityPattern, options: .caseInsensitive),
               let match = regex.firstMatch(in: result, range: NSRange(result.startIndex..., in: result)),
               let nextWordRange = Range(match.range(at: 1), in: result) {
                let nextWord = String(result[nextWordRange])
                if collegeIndicators.contains(where: { nextWord.caseInsensitiveCompare($0) == .orderedSame }) {
                    continue // Skip - this is a college team name
                }
            }
            
            // Safe to remove pro city name
            let pattern = "\\b\(city)\\s+"
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "")
            }
        }
        return result.trimmingCharacters(in: .whitespaces)
    }
    
    /// Formats pick text with clean team names and preserved bet info
    /// e.g., "Kennesaw State Owls spread -7.5" -> "Kennesaw -7.5"
    /// e.g., "Incarnate Word Cardinals ML" -> "Incarnate Word ML"
    /// e.g., "Pennsylvania Quakers -3.5" -> "Pennsylvania -3.5"
    static func truncatePickText(_ pick: String, maxLength: Int = 20) -> String {
        var cleanPick = pick
        
        // Remove the word "spread" (we show the number, that's enough)
        cleanPick = cleanPick.replacingOccurrences(of: " spread ", with: " ", options: .caseInsensitive)
        cleanPick = cleanPick.replacingOccurrences(of: " spread", with: "", options: .caseInsensitive)
        
        // Extract bet type and value at the end (ML, -7.5, +3, over 145.5, under 200, etc.)
        let betPattern = #"^(.+?)\s+(ML|moneyline|over\s+[\d.]+|under\s+[\d.]+|[-+][\d.]+)$"#
        
        if let regex = try? NSRegularExpression(pattern: betPattern, options: .caseInsensitive),
           let match = regex.firstMatch(in: cleanPick, range: NSRange(cleanPick.startIndex..., in: cleanPick)) {
            if let teamRange = Range(match.range(at: 1), in: cleanPick),
               let betRange = Range(match.range(at: 2), in: cleanPick) {
                var teamPart = String(cleanPick[teamRange]).trimmingCharacters(in: .whitespaces)
                let betPart = String(cleanPick[betRange]).trimmingCharacters(in: .whitespaces)
                
                // Shorten team name if needed - use first 1-2 words
                teamPart = shortenTeamForDisplay(teamPart, maxLength: 14)
                
                return "\(teamPart) \(betPart)"
            }
        }
        
        // No bet type found - just shorten the whole thing
        if cleanPick.count > maxLength {
            return shortenTeamForDisplay(cleanPick, maxLength: maxLength)
        }
        return cleanPick
    }
    
    /// Shortens a team name to fit display
    /// e.g., "Kennesaw State Owls" -> "Kennesaw"
    /// e.g., "Incarnate Word Cardinals" -> "Incarnate Word"
    private static func shortenTeamForDisplay(_ team: String, maxLength: Int) -> String {
        if team.count <= maxLength { return team }
        
        let words = team.split(separator: " ").map(String.init)
        
        // Try first word
        if let first = words.first, first.count <= maxLength {
            // If first word is very short, try adding second word
            if first.count < 8 && words.count > 1 {
                let twoWords = "\(first) \(words[1])"
                if twoWords.count <= maxLength {
                    return twoWords
                }
            }
            return first
        }
        
        // Fallback: truncate to max length
        return String(team.prefix(maxLength))
    }
}

// MARK: - Gary's Fantasy View (DFS Lineups)

// MARK: - Coming Soon View (For App Store Release)
struct GaryFantasyViewComingSoon: View {
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            // Background
            LiquidGlassBackground()
            
            // Coming Soon Content
            VStack(spacing: 0) {
                Spacer()
                
                VStack(spacing: 24) {
                    // Icon with glow
                    ZStack {
                        // Glow effect
                        Circle()
                            .fill(GaryColors.gold.opacity(0.2))
                            .frame(width: 140, height: 140)
                            .blur(radius: 30)
                        
                        // Icon background
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: "#1A1A1C"), Color(hex: "#0D0D0F")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 100, height: 100)
                            .overlay(
                                Circle()
                                    .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1)
                            )
                        
                        // Trophy icon
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(GaryColors.goldGradient)
                    }
                    .scaleEffect(animateIn ? 1 : 0.8)
                    .opacity(animateIn ? 1 : 0)
                    
                    // Title
                    VStack(spacing: 8) {
                        Text("Gary's Daily Fantasy")
                            .font(.system(size: 28, weight: .heavy))
                            .tracking(-0.5)
                            .foregroundStyle(GaryColors.goldGradient)
                        
                        Text("AI-Powered Lineup Optimization")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 10)
                    
                    // Coming Soon Badge
                    HStack(spacing: 8) {
                        Image(systemName: "hammer.fill")
                            .font(.system(size: 14))
                        Text("COMING SOON")
                            .font(.system(size: 14, weight: .bold))
                            .tracking(1)
                    }
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(GaryColors.gold.opacity(0.15))
                            .overlay(
                                Capsule()
                                    .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1)
                            )
                    )
                    .opacity(animateIn ? 1 : 0)
                    .scaleEffect(animateIn ? 1 : 0.9)
                    
                    // Description
                    VStack(spacing: 16) {
                        Text("Gary is building optimal DFS lineups for DraftKings & FanDuel")
                            .font(.system(size: 15))
                            .foregroundStyle(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                        
                        // Features preview
                        VStack(alignment: .leading, spacing: 12) {
                            FeaturePreviewRow(icon: "sportscourt.fill", text: "NBA & NFL Daily Lineups")
                            FeaturePreviewRow(icon: "dollarsign.circle.fill", text: "Salary-Optimized Rosters")
                            FeaturePreviewRow(icon: "arrow.triangle.swap", text: "Gary's Swaps & Alternatives")
                            FeaturePreviewRow(icon: "brain.head.profile", text: "AI-Powered Analysis")
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 32)
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 15)
                }
                .padding(.horizontal, 24)
                
                Spacer()
                Spacer()
            }
            .padding(.bottom, 80) // Space for tab bar
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.1)) {
                animateIn = true
            }
        }
    }
}

// Feature preview row for Coming Soon
struct FeaturePreviewRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(GaryColors.gold)
                .frame(width: 24)
            
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
            
            Spacer()
        }
    }
}

// MARK: - Gary's Fantasy View (Full DFS Lineups)
struct GaryFantasyView: View {
    @State private var lineups: [DFSLineup] = []
    @State private var loading = true
    @State private var selectedPlatform: DFSPlatform = .draftkings
    @State private var selectedSport: String = "NBA"
    @State private var selectedSlate: String = "Main"
    @State private var expandedPositions: Set<String> = []
    
    // Available sports based on loaded lineups
    private var availableSports: [String] {
        let sports = Set(lineups.filter { $0.platform == selectedPlatform.rawValue }.map { $0.sport })
        return Array(sports).sorted()
    }
    
    // Available slates for selected platform/sport
    private var availableSlates: [String] {
        let slates = Set(lineups.filter { 
            $0.platform == selectedPlatform.rawValue && 
            $0.sport == selectedSport 
        }.compactMap { $0.slate_name ?? "Main" })
        return Array(slates).sorted()
    }
    
    // Current lineup for selected platform/sport/slate
    private var currentLineup: DFSLineup? {
        lineups.first { 
            $0.platform == selectedPlatform.rawValue && 
            $0.sport == selectedSport &&
            ($0.slate_name ?? "Main") == selectedSlate
        }
    }
    
    var body: some View {
        ZStack {
            // Background
            LiquidGlassBackground()
            
            // Content
            VStack(spacing: 0) {
                // Header
                Text("FANTASY")
                    .font(.system(size: 26, weight: .heavy))
                    .tracking(1.5)
                    .foregroundStyle(GaryColors.goldGradient)
                    .shadow(color: GaryColors.gold.opacity(0.2), radius: 12)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
                    .padding(.bottom, 14)
                    .background(alignment: .leading) {
                        Image("GaryIconBG")
                            .resizable()
                            .scaledToFit()
                            .frame(height: 81)
                            .shadow(color: GaryColors.gold.opacity(0.3), radius: 10)
                            .allowsHitTesting(false)
                    }
                    .padding(.horizontal, 16)

                // Separator
                Rectangle()
                    .fill(LinearGradient(colors: [.clear, GaryColors.gold.opacity(0.25), .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 0.5)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)

                // Filters Row: [Platform ▾] [Sport ▾] [Slate ▾]
                HStack(spacing: 10) {
                    // Platform dropdown (brand colored)
                    Menu {
                        Button { withAnimation { selectedPlatform = .draftkings } } label: {
                            Label("DraftKings", systemImage: "crown.fill")
                        }
                        Button { withAnimation { selectedPlatform = .fanduel } } label: {
                            Label("FanDuel", systemImage: "bolt.fill")
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: selectedPlatform == .draftkings ? "crown.fill" : "bolt.fill")
                                .font(.system(size: 10, weight: .semibold))
                            Text(selectedPlatform.displayName)
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 8, weight: .bold))
                        }
                        .foregroundStyle(selectedPlatform == .draftkings ? Color(hex: "#53D337") : Color(hex: "#1493FF"))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(Color(hex: "#1A1A1E"))
                                .overlay(
                                    Capsule()
                                        .stroke(
                                            (selectedPlatform == .draftkings ? Color(hex: "#53D337") : Color(hex: "#1493FF")).opacity(0.35),
                                            lineWidth: 0.5
                                        )
                                )
                        )
                    }

                    // Sport dropdown
                    Menu {
                        ForEach(["NBA", "NFL"], id: \.self) { sport in
                            Button {
                                withAnimation { selectedSport = sport }
                            } label: {
                                Label(sport, systemImage: sport == "NBA" ? "basketball.fill" : "football.fill")
                            }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: selectedSport == "NBA" ? "basketball.fill" : "football.fill")
                                .font(.system(size: 10, weight: .semibold))
                            Text(selectedSport)
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "chevron.down")
                                .font(.system(size: 8, weight: .bold))
                        }
                        .foregroundStyle(GaryColors.gold)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(Color(hex: "#1A1A1E"))
                                .overlay(
                                    Capsule()
                                        .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.5)
                                )
                        )
                    }

                    // Slate dropdown
                    if availableSlates.count > 0 {
                        Menu {
                            ForEach(availableSlates, id: \.self) { slate in
                                Button {
                                    withAnimation { selectedSlate = slate }
                                } label: {
                                    HStack {
                                        Text(slate)
                                        if selectedSlate == slate {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "list.bullet")
                                    .font(.system(size: 10, weight: .semibold))
                                Text(selectedSlate)
                                    .font(.system(size: 12, weight: .semibold))
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 8, weight: .bold))
                            }
                            .foregroundStyle(GaryColors.gold)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(Color(hex: "#1A1A1E"))
                                    .overlay(
                                        Capsule()
                                            .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.5)
                                    )
                            )
                        }
                    }

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if let lineup = currentLineup {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 16) {
                            // Lineup Summary Card
                            LineupSummaryCard(lineup: lineup)
                                .padding(.horizontal, 16)
                            
                            // Position Rows
                            ForEach(lineup.lineup) { player in
                                LineupPositionRow(
                                    player: player,
                                    isExpanded: expandedPositions.contains(player.id),
                                    onToggle: {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                            if expandedPositions.contains(player.id) {
                                                expandedPositions.remove(player.id)
                                            } else {
                                                expandedPositions.insert(player.id)
                                            }
                                        }
                                    }
                                )
                                .padding(.horizontal, 16)
                            }
                            
                            // Gary's Notes
                            if let notes = lineup.gary_notes, !notes.isEmpty {
                                GaryNotesCard(notes: notes)
                                    .padding(.horizontal, 16)
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100) // Space for tab bar
                    }
                    .refreshable {
                        await loadLineups(forceRefresh: true)
                    }
                } else {
                    // No lineup available
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 50))
                            .foregroundStyle(GaryColors.gold.opacity(0.5))
                        Text("No \(selectedPlatform.displayName) \(selectedSport) lineup today")
                            .foregroundStyle(.secondary)
                        Text("Check back when games are scheduled")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
                    Spacer()
                }
            }
        }
        .task {
            await loadLineups()
        }
        .onChange(of: selectedPlatform) { _ in
            // Auto-select first available sport when platform changes
            if let first = availableSports.first, !availableSports.contains(selectedSport) {
                selectedSport = first
            }
        }
        .onChange(of: selectedSport) { _ in
            // Auto-select first available slate when sport changes
            if let first = availableSlates.first, !availableSlates.contains(selectedSlate) {
                selectedSlate = first
            }
        }
    }
    
    private func loadLineups(forceRefresh: Bool = false) async {
        await MainActor.run { loading = true }

        let date = SupabaseAPI.todayEST()

        do {
            let fetched = try await withTimeout(seconds: 15) {
                try await SupabaseAPI.fetchDFSLineups(date: date, forceRefresh: forceRefresh)
            }
            await MainActor.run {
                lineups = fetched
                
                // Auto-select first available sport
                if let firstSport = availableSports.first, !availableSports.contains(selectedSport) {
                    selectedSport = firstSport
                }
                
                // Auto-select first available slate
                if let firstSlate = availableSlates.first, !availableSlates.contains(selectedSlate) {
                    selectedSlate = firstSlate
                }
                
                loading = false
            }
        } catch {
            await MainActor.run {
                lineups = []
                loading = false
            }
        }
    }
}

// MARK: - DFS Platform Toggle

struct DFSPlatformToggle: View {
    @Binding var selected: DFSPlatform
    
    // Official brand colors
    private let draftKingsGreen = Color(hex: "#53D337") // DraftKings lime green
    private let fanDuelBlue = Color(hex: "#1493FF")     // FanDuel blue
    
    private func brandColor(for platform: DFSPlatform) -> Color {
        switch platform {
        case .draftkings: return draftKingsGreen
        case .fanduel: return fanDuelBlue
        }
    }
    
    var body: some View {
        HStack(spacing: 4) {
            ForEach(DFSPlatform.allCases, id: \.self) { platform in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selected = platform
                    }
                } label: {
                    Text(platform.displayName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(selected == platform ? brandColor(for: platform) : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background {
                            RoundedRectangle(cornerRadius: 10)
                                .fill(selected == platform ? brandColor(for: platform).opacity(0.15) : Color.clear)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(selected == platform ? brandColor(for: platform).opacity(0.5) : Color.white.opacity(0.1), lineWidth: 0.5)
                                )
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(hex: "#1A1A1C"))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                )
        )
    }
}

// MARK: - DFS Sport Filter

struct DFSSportFilter: View {
    @Binding var selected: String
    let available: [String]
    
    var body: some View {
        HStack(spacing: 8) {
            ForEach(available, id: \.self) { sport in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selected = sport
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: sportIcon(for: sport))
                            .font(.system(size: 12))
                        Text(sport)
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(selected == sport ? GaryColors.gold : .secondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background {
                        Capsule()
                            .fill(selected == sport ? GaryColors.gold.opacity(0.15) : Color.clear)
                            .overlay(
                                Capsule()
                                    .stroke(selected == sport ? GaryColors.gold.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 0.5)
                            )
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    private func sportIcon(for sport: String) -> String {
        switch sport {
        case "NBA": return "basketball.fill"
        case "NFL": return "football.fill"
        default: return "sportscourt.fill"
        }
    }
}

// MARK: - DFS Slate Filter (Pills - Legacy)

struct DFSSlateFilter: View {
    @Binding var selected: String
    let available: [String]
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(available, id: \.self) { slate in
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selected = slate
                        }
                    } label: {
                        Text(slate.uppercased())
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(selected == slate ? .white : .secondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background {
                                if selected == slate {
                                    Capsule()
                                        .fill(Color.white.opacity(0.15))
                                } else {
                                    Capsule()
                                        .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

// MARK: - DFS Slate Dropdown (New Design)

struct DFSSlateDropdown: View {
    @Binding var selected: String
    let available: [String]
    let currentLineup: DFSLineup?
    @State private var showPicker = false
    
    // Get start time from current lineup
    private var startTime: String {
        if let time = currentLineup?.slate_start_time {
            return time
        }
        return ""
    }
    
    var body: some View {
        Menu {
            ForEach(available, id: \.self) { slate in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selected = slate
                    }
                } label: {
                    HStack {
                        Text(slate)
                        if selected == slate {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(selected)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                    
                    if !startTime.isEmpty {
                        Text(startTime)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(GaryColors.gold)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: "#1A1A1C"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.white.opacity(0.15), lineWidth: 0.5)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Lineup Summary Card

struct LineupSummaryCard: View {
    let lineup: DFSLineup
    
    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Text("GARY'S OPTIMAL LINEUP")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
                
                Spacer()
                
                Text(lineup.sport)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(0.1))
                    )
            }
            
            // Stats Row
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Salary")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text(lineup.salaryDisplay)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                }
                
                Spacer()
                
                Rectangle()
                    .fill(GaryColors.gold.opacity(0.3))
                    .frame(width: 1, height: 30)
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Projected")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text(String(format: "%.1f pts", lineup.projected_points))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.4), GaryColors.gold.opacity(0.1)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 0.5
                        )
                )
        )
    }
}

// MARK: - Lineup Position Row (Expandable)

struct LineupPositionRow: View {
    let player: DFSPlayer
    let isExpanded: Bool
    let onToggle: () -> Void
    
    /// Has content to show when expanded
    private var hasExpandableContent: Bool {
        !player.pivots.isEmpty || player.hasRationale
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Main Row
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    // Position Badge
                    Text(player.position)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 24)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(positionColor(player.position))
                        )
                    
                    // Player Info
                    VStack(alignment: .leading, spacing: 3) {
                        // Player name - clean, no emojis
                        Text(player.player)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        
                        // Team + single key badge
                        HStack(spacing: 6) {
                            Text(player.team)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.secondary)
                            
                            // Ownership badge (always show if available)
                            if let ownership = player.ownership {
                                Text(String(format: "%.0f%% Own", ownership))
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(ownershipColor(ownership))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule()
                                            .fill(ownershipColor(ownership).opacity(0.15))
                                    )
                            }
                        }
                    }
                    
                    Spacer()
                    
                    // Salary
                    Text(player.salaryFormatted)
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                    
                    // Projected Points
                    Text(String(format: "%.1f", player.projected_pts))
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                        .frame(width: 40, alignment: .trailing)
                    
                    // Expand Chevron
                    if hasExpandableContent {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(GaryColors.gold.opacity(0.7))
                            .frame(width: 20)
                    } else {
                        Color.clear.frame(width: 20)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            
            // Expanded Content
            if isExpanded && hasExpandableContent {
                VStack(spacing: 12) {
                    // Gary's Rationale Section
                    if let rationale = player.rationale, !rationale.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            // Rationale text
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "lightbulb.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(GaryColors.gold)
                                
                                Text(rationale)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.9))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            
                            // Supporting Stats Row - Horizontal scrollable
                            if let stats = player.supportingStats, !stats.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 6) {
                                        ForEach(stats) { stat in
                                            StatBadge(stat: stat, position: player.position)
                                                .fixedSize(horizontal: true, vertical: false)
                                        }
                                    }
                                    .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(height: 24) // Fixed height prevents vertical stretching
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color(hex: "#1A1A1D"))
                        )
                        .padding(.horizontal, 14)
                    }
                    
                    // Pivot Alternatives
                    if !player.pivots.isEmpty {
                        VStack(spacing: 0) {
                            // Pivots header
                            HStack {
                                Text("ALTERNATIVES")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.secondary)
                                    .tracking(1)
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.bottom, 6)
                            
                            ForEach(player.pivots) { pivot in
                                PivotRow(pivot: pivot)
                            }
                        }
                        .padding(.leading, 34)
                        .padding(.trailing, 14)
                    }
                }
                .padding(.bottom, 12)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
                )
        )
    }
    
    /// Ownership color: red for chalk (>25%), green for contrarian (<10%), yellow for moderate
    private func ownershipColor(_ ownership: Double) -> Color {
        if ownership >= 25 {
            return Color(hex: "#EF4444") // Red - chalk
        } else if ownership <= 10 {
            return Color(hex: "#22C55E") // Green - contrarian
        } else {
            return Color(hex: "#FBBF24") // Yellow - moderate
        }
    }
    
    private func positionColor(_ position: String) -> Color {
        switch position {
        case "QB": return Color(hex: "#EF4444") // Red
        case "RB": return Color(hex: "#22C55E") // Green
        case "WR": return Color(hex: "#3B82F6") // Blue
        case "TE": return Color(hex: "#F59E0B") // Amber
        case "FLEX", "FLX": return Color(hex: "#8B5CF6") // Purple
        case "DST", "DEF": return Color(hex: "#6B7280") // Gray
        case "K": return Color(hex: "#A855F7") // Purple for Kicker
        case "PG": return Color(hex: "#EF4444")
        case "SG": return Color(hex: "#F59E0B")
        case "SF": return Color(hex: "#3B82F6")
        case "PF": return Color(hex: "#22C55E")
        case "C": return Color(hex: "#8B5CF6")
        case "G": return Color(hex: "#EC4899") // Pink
        case "F": return Color(hex: "#14B8A6") // Teal
        case "UTIL": return Color(hex: "#6366F1") // Indigo
        default: return Color(hex: "#6B7280")
        }
    }
}

// MARK: - Stat Badge

struct StatBadge: View {
    let stat: DFSStat
    let position: String
    
    // Use position color for all stats (matches position badge)
    private var badgeColor: Color {
        switch position {
        // NFL positions
        case "QB": return Color(hex: "#EF4444") // Red
        case "RB": return Color(hex: "#22C55E") // Green
        case "WR": return Color(hex: "#3B82F6") // Blue
        case "TE": return Color(hex: "#F59E0B") // Amber
        case "FLEX", "FLX": return Color(hex: "#8B5CF6") // Purple
        case "DST", "DEF": return Color(hex: "#6B7280") // Gray
        case "K": return Color(hex: "#A855F7") // Purple
        // NBA positions
        case "PG": return Color(hex: "#EF4444") // Red
        case "SG": return Color(hex: "#F59E0B") // Amber
        case "SF": return Color(hex: "#3B82F6") // Blue
        case "PF": return Color(hex: "#22C55E") // Green
        case "C": return Color(hex: "#8B5CF6") // Purple
        case "G": return Color(hex: "#EC4899") // Pink
        case "F": return Color(hex: "#14B8A6") // Teal
        case "UTIL": return GaryColors.gold
        default: return GaryColors.gold
        }
    }
    
    var body: some View {
        // Compact horizontal layout: "PPG 30.7" on one line
        HStack(spacing: 2) {
            Text(stat.label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.white.opacity(0.7))
            Text(stat.value)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(badgeColor)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(
            Capsule()
                .fill(badgeColor.opacity(0.15))
        )
        .fixedSize() // Prevent wrapping within the badge
    }
}

// MARK: - Pivot Row

struct PivotRow: View {
    let pivot: DFSPivot
    @State private var isExpanded = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Main Row - Tappable to expand
            Button(action: {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            }) {
                HStack(spacing: 8) {
                    // Connector line
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(tierColor.opacity(0.3))
                            .frame(width: 1, height: 24)
                        Circle()
                            .fill(tierColor)
                            .frame(width: 6, height: 6)
                    }
                    
                    // Player Info (no tier badge)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(pivot.player)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white.opacity(0.9))
                        Text(pivot.team)
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                    
                    Spacer()
                    
                    // Salary Difference - arrow color shows save (green) vs cost (red)
                    if let diff = pivot.salaryDiff, diff != 0 {
                        HStack(spacing: 3) {
                            Image(systemName: diff < 0 ? "arrow.down" : "arrow.up")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(diff < 0 ? Color(hex: "#22C55E") : Color(hex: "#EF4444"))
                            Text(pivot.salaryDiffFormatted)
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }
                    
                    // Salary
                    Text(pivot.salaryFormatted)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(width: 50, alignment: .trailing)
                    
                    // Projected Points
                    Text(String(format: "%.1f", pivot.projected_pts))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(GaryColors.gold.opacity(0.8))
                        .frame(width: 32, alignment: .trailing)
                    
                    // Expand indicator (if has rationale)
                    if pivot.rationale != nil {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(GaryColors.gold.opacity(0.5))
                            .frame(width: 14)
                    }
                }
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
            
            // Expanded Rationale
            if isExpanded, let rationale = pivot.rationale, !rationale.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    // Vertical line connector
                    Rectangle()
                        .fill(tierColor.opacity(0.2))
                        .frame(width: 1)
                        .padding(.leading, 3)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 4) {
                            Image(systemName: "lightbulb.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(GaryColors.gold)
                            Text("Why swap?")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(GaryColors.gold)
                        }
                        
                        Text(rationale)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.7))
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(tierColor.opacity(0.1))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(tierColor.opacity(0.2), lineWidth: 0.5)
                            )
                    )
                }
                .padding(.leading, 20)
                .padding(.trailing, 4)
                .padding(.bottom, 6)
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .move(edge: .top)),
                    removal: .opacity
                ))
            }
        }
    }
    
    private var tierColor: Color {
        Color(hex: pivot.tierColor)
    }
    
    private var tierAbbreviation: String {
        switch pivot.tier {
        case "direct": return "SWAP"
        case "mid": return "MID"
        case "budget": return "VALUE"
        default: return pivot.tier.uppercased().prefix(4).description
        }
    }
}

// MARK: - Gary Notes Card

struct GaryNotesCard: View {
    let notes: String
    
    // Parse notes into sections
    private var sections: [NoteSection] {
        parseNotesIntoSections(notes)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(GaryColors.gold)
                Text("GARY'S NOTES")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
            }
            
            // Rendered sections
            ForEach(sections.indices, id: \.self) { index in
                NoteSectionView(section: sections[index])
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#0D0D0F"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                )
        )
    }
    
    // Parse the notes string into structured sections
    private func parseNotesIntoSections(_ text: String) -> [NoteSection] {
        var sections: [NoteSection] = []
        var currentSection: NoteSection? = nil
        var currentContent: [String] = []
        
        let lines = text.components(separatedBy: "\n")
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            
            // Skip separator lines (═══, ───, etc.)
            if trimmed.allSatisfy({ $0 == "═" || $0 == "─" || $0 == "▓" }) && !trimmed.isEmpty {
                continue
            }
            
            // Skip empty lines at section boundaries
            if trimmed.isEmpty {
                if !currentContent.isEmpty {
                    currentContent.append("")
                }
                continue
            }
            
            // Check if this is a section header
            if let sectionType = detectSectionHeader(trimmed) {
                // Save previous section
                if let section = currentSection {
                    var s = section
                    s.content = currentContent.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                    if !s.content.isEmpty {
                        sections.append(s)
                    }
                }
                
                // Start new section
                currentSection = NoteSection(
                    type: sectionType,
                    title: cleanSectionTitle(trimmed),
                    content: "",
                    icon: sectionIcon(for: sectionType)
                )
                currentContent = []
            } else if currentSection != nil {
                // Add line to current section content
                currentContent.append(trimmed)
            } else {
                // Content before any section header - create intro section
                if sections.isEmpty && currentSection == nil {
                    currentSection = NoteSection(type: .intro, title: "", content: "", icon: nil)
                }
                currentContent.append(trimmed)
            }
        }
        
        // Save final section
        if let section = currentSection {
            var s = section
            s.content = currentContent.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !s.content.isEmpty || !s.title.isEmpty {
                sections.append(s)
            }
        }
        
        return sections
    }
    
    private func detectSectionHeader(_ line: String) -> NoteSectionType? {
        let upper = line.uppercased()
        
        if upper.contains("LINEUP THESIS") { return .thesis }
        if upper.contains("USAGE OPPORTUNITY") { return .usageOpportunity }
        if upper.contains("VALUE PLAYS") { return .valuePlays }
        if upper.contains("HOT STREAK") { return .hotStreak }
        if upper.contains("CORRELATION STRUCTURE") { return .correlation }
        if upper.contains("OWNERSHIP PROFILE") { return .ownership }
        if upper.contains("MONITOR BEFORE LOCK") { return .monitor }
        if upper.contains("BUILD ANALYSIS") { return .buildAnalysis }
        if upper.contains("STARS RETURNING") { return .starsReturning }
        if upper.contains("QUESTIONS FOR GARY") { return .questions }
        if upper.contains("SHARP AUDIT") { return .sharpAudit }
        if upper.contains("HARMONY") || upper.contains("STRATEGY") { return .harmony }
        
        return nil
    }
    
    private func cleanSectionTitle(_ line: String) -> String {
        var cleaned = line
        // Remove emoji prefixes for cleaner display (we add our own icons)
        let emojis = ["🚀", "💎", "🔥", "📊", "📈", "⏰", "🔍", "⚠️", "❓", "💡", "🤝"]
        for emoji in emojis {
            cleaned = cleaned.replacingOccurrences(of: emoji, with: "").trimmingCharacters(in: .whitespaces)
        }
        return cleaned
    }
    
    private func sectionIcon(for type: NoteSectionType) -> String {
        switch type {
        case .intro: return "doc.text"
        case .thesis: return "target"
        case .usageOpportunity: return "arrow.up.right.circle.fill"
        case .valuePlays: return "diamond.fill"
        case .hotStreak: return "flame.fill"
        case .correlation: return "chart.bar.fill"
        case .ownership: return "chart.pie.fill"
        case .monitor: return "clock.fill"
        case .buildAnalysis: return "magnifyingglass"
        case .starsReturning: return "exclamationmark.triangle.fill"
        case .questions: return "questionmark.circle.fill"
        case .sharpAudit: return "checkmark.shield.fill"
        case .harmony: return "hand.thumbsup.fill"
        }
    }
}

// MARK: - Note Section Types

enum NoteSectionType {
    case intro
    case thesis
    case usageOpportunity
    case valuePlays
    case hotStreak
    case correlation
    case ownership
    case monitor
    case buildAnalysis
    case starsReturning
    case questions
    case sharpAudit
    case harmony
}

struct NoteSection {
    var type: NoteSectionType
    var title: String
    var content: String
    var icon: String?
}

// MARK: - Note Section View

struct NoteSectionView: View {
    let section: NoteSection
    
    private var sectionColor: Color {
        switch section.type {
        case .thesis: return GaryColors.gold
        case .usageOpportunity: return Color.green
        case .valuePlays: return Color.cyan
        case .hotStreak: return Color.orange
        case .correlation: return Color.purple
        case .ownership: return Color.pink
        case .monitor: return Color.yellow
        case .buildAnalysis: return Color.blue
        case .starsReturning: return Color.red
        case .questions: return Color.orange
        case .sharpAudit: return Color.green
        case .harmony: return Color.teal
        case .intro: return .secondary
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Section header (if has title)
            if !section.title.isEmpty {
                HStack(spacing: 6) {
                    if let icon = section.icon {
                        Image(systemName: icon)
                            .font(.system(size: 12))
                            .foregroundStyle(sectionColor)
                    }
                    Text(section.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(sectionColor)
                }
                .padding(.top, 4)
                
                // Subtle divider
                Rectangle()
                    .fill(sectionColor.opacity(0.2))
                    .frame(height: 1)
            }
            
            // Section content
            if !section.content.isEmpty {
                Text(parseContentWithFormatting(section.content))
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineSpacing(5)
            }
        }
    }
    
    // Parse content to handle special formatting
    private func parseContentWithFormatting(_ text: String) -> AttributedString {
        let result = AttributedString(text)

        // Make player names and key terms slightly brighter
        // This is a simplified version - full implementation would parse more

        return result
    }
}
