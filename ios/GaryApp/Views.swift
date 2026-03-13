import SwiftUI
import Charts
import WebKit

// MARK: - Shared Formatters (expensive to create — reuse)

private let isoFormatterFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private let isoFormatterNoFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

/// Parse an ISO8601 date string, trying fractional seconds first then without
func parseISO8601(_ string: String) -> Date? {
    isoFormatterFrac.date(from: string) ?? isoFormatterNoFrac.date(from: string)
}

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

    /// Variant that also respects the user's Reduce Motion accessibility setting
    static func current(reduceMotion: Bool) -> PerformanceMode {
        if reduceMotion { return .lite }
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

// MARK: - Relative Time Formatter

private func relativeTimeString(from date: Date) -> String {
    let seconds = Int(Date().timeIntervalSince(date))
    if seconds < 60 { return "Updated just now" }
    let minutes = seconds / 60
    if minutes < 60 { return "Updated \(minutes)m ago" }
    let hours = minutes / 60
    return "Updated \(hours)h ago"
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
        guard let result = try await group.next() else {
            throw URLError(.timedOut)
        }
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
                        Text(pushes > 0 ? "\(wins)-\(losses)-\(pushes)" : "\(wins)-\(losses)")
                            .font(.system(size: 26, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)

                        Text("YESTERDAY")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.secondary)
                            .tracking(0.5)
                    }
                    
                    // Mood Label - explains the hero image
                    Text(moodLabel)
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundStyle(GaryColors.gold)
                }
                
                Spacer()
                
                // Win rate indicator
                VStack(spacing: 2) {
                    Text("\(Int(winRate * 100))%")
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .foregroundStyle(GaryColors.gold)
                    
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
                    .foregroundStyle(Color.white.opacity(0.35))
                if sport.pushes > 0 {
                    Text("-")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.tertiary)
                    Text("\(sport.pushes)")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(hex: "#EAB308")) // Yellow for pushes
                }
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Home View

struct HomeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @State private var freePick: GaryPick?
    @State private var loading = true
    @State private var animateIn = false
    @State private var activeWin = 0
    @State private var winTimer: Timer?
    @State private var recentWins: [(String, String, String)] = [] // (label, league, date)
    @State private var yesterdayRecord: (wins: Int, losses: Int, pushes: Int) = (0, 0, 0)
    @State private var sportBreakdown: [SupabaseAPI.SportRecord] = []
    @State private var performanceLoaded = false  // Track if performance data has been fetched
    
    // Dynamic hero image based on most recent performance
    private var heroImage: String {
        let total = yesterdayRecord.wins + yesterdayRecord.losses
        guard total > 0 else { return "GaryIconBG" } // Fallback — standard bear logo
        
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
                VStack(spacing: 14) {
                    // ── Hero Section ──
                    VStack(spacing: 14) {
                        // Brand lockup — BET WITH GARY
                        ZStack {
                            // Subtle ambient glow behind lockup
                            Ellipse()
                                .fill(
                                    RadialGradient(
                                        colors: [GaryColors.gold.opacity(0.06), .clear],
                                        center: .center,
                                        startRadius: 10,
                                        endRadius: 120
                                    )
                                )
                                .frame(width: 280, height: 60)
                                .blur(radius: 20)

                            VStack(spacing: 3) {
                                Text("BET WITH")
                                    .font(.system(size: 14, weight: .heavy))
                                    .tracking(10)
                                    .foregroundStyle(Color.white.opacity(0.7))

                                // GARY — sharp border stroke + fill
                                ZStack {
                                    // Stroke layer — dark outline behind
                                    Text("GARY")
                                        .font(.system(size: 42, weight: .black))
                                        .tracking(6)
                                        .foregroundStyle(Color(hex: "#8B6914"))
                                        .shadow(color: Color.black, radius: 0, x: 1.5, y: 0)
                                        .shadow(color: Color.black, radius: 0, x: -1.5, y: 0)
                                        .shadow(color: Color.black, radius: 0, x: 0, y: 1.5)
                                        .shadow(color: Color.black, radius: 0, x: 0, y: -1.5)

                                    // Fill layer — matte gold on top
                                    Text("GARY")
                                        .font(.system(size: 42, weight: .black))
                                        .tracking(6)
                                        .foregroundStyle(Color(hex: "#C9A227"))
                                }
                                .shadow(color: Color.black.opacity(0.5), radius: 0, x: 1, y: 1)
                                .shadow(color: Color.black.opacity(0.2), radius: 3, x: 1, y: 2)
                            }
                        }
                        .opacity(animateIn ? 1 : 0)
                        .offset(y: animateIn ? 0 : 10)
                        .animation(.easeOut(duration: 0.6), value: animateIn)

                        // Cycling recent wins
                        if !recentWins.isEmpty {
                            ZStack {
                                ForEach(Array(recentWins.enumerated()), id: \.offset) { index, win in
                                    HStack(spacing: 10) {
                                        // Green checkmark
                                        ZStack {
                                            Circle()
                                                .fill(Color.green.opacity(0.15))
                                                .frame(width: 28, height: 28)
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 12, weight: .bold))
                                                .foregroundStyle(.green)
                                        }

                                        // Pick text
                                        Text(win.0)
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(Color.white.opacity(0.9))
                                            .lineLimit(1)

                                        // League badge
                                        Text(win.1)
                                            .font(.system(size: 10, weight: .heavy))
                                            .tracking(0.5)
                                            .foregroundStyle(GaryColors.gold)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(
                                                Capsule()
                                                    .fill(GaryColors.gold.opacity(0.12))
                                            )
                                    }
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 7)
                                    .background(
                                        Capsule()
                                            .fill(Color.white.opacity(0.04))
                                            .overlay(
                                                Capsule()
                                                    .stroke(Color.green.opacity(0.15), lineWidth: 0.5)
                                            )
                                    )
                                    .opacity(activeWin == index ? 1 : 0)
                                    .scaleEffect(activeWin == index ? 1 : 0.9)
                                    .animation(.spring(response: 0.5, dampingFraction: 0.7), value: activeWin)
                                }
                            }
                            .frame(height: 42)
                            .opacity(animateIn ? 1 : 0)
                            .animation(.easeOut(duration: 0.6).delay(0.2), value: animateIn)
                        }
                    }
                    .padding(.top, 2)
                    .onDisappear {
                        winTimer?.invalidate()
                        winTimer = nil
                    }
                    
                    // Hero Image - Dynamic based on Gary's most recent performance
                    // Only show once performance data is loaded to prevent flash
                    if performanceLoaded {
                        Image(heroImage)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 242, height: 242)
                            .shadow(color: heroImageGlow.opacity(0.5), radius: 26)
                            .opacity(animateIn ? 1 : 0)
                            .offset(y: animateIn ? 0 : 16)
                            .transition(.opacity.combined(with: .scale(scale: 0.95)))
                    } else {
                        // Placeholder while loading - maintains layout
                        Color.clear
                            .frame(width: 242, height: 242)
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
                    
                    // Featured Event Banner — WBC 2026
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedTab = 1
                        }
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("World Baseball Classic")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.95))

                                Text("WBC game picks & HR props are live")
                                    .font(.system(size: 12, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.55))
                            }

                            Spacer()

                            Text("VIEW")
                                .font(.system(size: 10, weight: .black))
                                .tracking(1)
                                .foregroundStyle(.black)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(
                                    Capsule()
                                        .fill(GaryColors.gold)
                                )
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color(hex: "#0A0A0C"))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
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
                        .shadow(color: GaryColors.gold.opacity(0.1), radius: 12, x: 0, y: 4)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 25)
                    .animation(.easeOut(duration: 0.6).delay(0.15), value: animateIn)

                    // Today's Free Pick
                    if let pick = freePick {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: "star.fill")
                                    .foregroundStyle(GaryColors.gold)
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
                                    .foregroundStyle(GaryColors.gold)
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

                    // Social / Community Links
                    SocialLinksBar()
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .opacity(animateIn ? 1 : 0)
                        .animation(.easeOut(duration: 0.6).delay(0.5), value: animateIn)
                }
                .padding(.horizontal, 4) // Ensure content doesn't touch edges
                .padding(.bottom, 100) // Space for floating tab bar
            }
        }
        .task {
            do {
                try await withTimeout(seconds: 30) {
                    // PARALLEL FETCH: Run all independent API calls simultaneously
                    // This reduces load time from ~600ms to ~200ms

                    let date = SupabaseAPI.todayEST()

                    // Start all fetches in parallel using async let
                    async let recordFetch = SupabaseAPI.fetchYesterdayGameRecord()
                    async let breakdownFetch = SupabaseAPI.fetchYesterdayBySport()
                    async let picksFetch = SupabaseAPI.fetchAllPicks(date: date)
                    async let gameResultsFetch = SupabaseAPI.fetchAllGameResults(since: nil)
                    async let propResultsFetch = SupabaseAPI.fetchPropResults(since: nil)

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

                    // Build recent wins ticker from game + prop results
                    let shortDate: (String?) -> String = { dateStr in
                        guard let dateStr = dateStr else { return "" }
                        // Parse "YYYY-MM-DD" and format as "Feb 3"
                        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                        let parts = dateStr.split(separator: "-")
                        if parts.count == 3,
                           let m = Int(parts[1]), m >= 1, m <= 12,
                           let d = Int(parts[2]) {
                            return "\(months[m - 1]) \(d)"
                        }
                        return ""
                    }
                    var wins: [(String, String, String)] = []
                    if let gameResults = try? await gameResultsFetch {
                        let gameWins = gameResults.filter { $0.result == "won" }.prefix(10)
                        for w in gameWins {
                            let label = w.pick_text ?? w.matchup ?? "Win"
                            let league = w.effectiveLeague ?? "PICK"
                            let date = shortDate(w.game_date)
                            wins.append((label, league, date))
                        }
                    }
                    if let propResults = try? await propResultsFetch {
                        let propWins = propResults.filter { $0.result == "won" }.prefix(10)
                        for w in propWins {
                            let label = Formatters.propResultTitle(w)
                            let league = w.effectiveLeague ?? "PROP"
                            let date = shortDate(w.game_date)
                            wins.append((label, league, date))
                        }
                    }
                    // Shuffle to mix game and prop wins, take up to 12
                    recentWins = Array(wins.shuffled().prefix(12))
                    // Start timer now that we have data (invalidate any existing one first)
                    if !recentWins.isEmpty {
                        winTimer?.invalidate()
                        winTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
                            withAnimation {
                                activeWin = (activeWin + 1) % recentWins.count
                            }
                        }
                    }

                    // Get picks data (already fetched in parallel)
                    loading = true
                    let allPicks = try? await picksFetch

                    // Filter to TODAY's games, visible until 3am EST the next day
                    // This matches the GaryPicksView logic for consistency
                    let todayOnlyPicks: [GaryPick]? = allPicks?.filter { pick in
                        guard let commenceTime = pick.commence_time else { return true }

                        guard let gameDate = parseISO8601(commenceTime) else {
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
            } catch {
                // Timeout or error — stop loading, show whatever we have
                loading = false
            }
        }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .background || newPhase == .inactive {
                winTimer?.invalidate()
                winTimer = nil
            } else if newPhase == .active && !recentWins.isEmpty && winTimer == nil {
                winTimer?.invalidate()
                winTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
                    withAnimation {
                        activeWin = (activeWin + 1) % recentWins.count
                    }
                }
            }
        }
    }
}

// MARK: - Sport Filter

enum Sport: String, CaseIterable {
    // Order: ALL → NBA → NFL → NFL TDs → NHL → NCAAB → NCAAF → EPL → WBC → WNBA
    case all = "ALL"
    case nba = "NBA"
    case nfl = "NFL"
    case nflTDs = "NFL TDs"
    case nhl = "NHL"
    case ncaab = "NCAAB"
    case ncaaf = "NCAAF"
    case epl = "EPL"
    case mlb = "WBC"
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
        case .mlb: return Color(hex: "#16A34A")      // Baseball Green (grass)
        case .wnba: return Color(hex: "#F97316")     // Orange
        }
    }
    
    /// Optional gradient for sport border (international/multi-color themes)
    var accentGradient: LinearGradient? {
        switch self {
        case .mlb:
            // WBC international flag colors: red, blue, gold, green
            return LinearGradient(
                colors: [
                    Color(hex: "#EF4444"),  // Red (Japan, Cuba, DR)
                    Color(hex: "#3B82F6"),  // Blue (Korea, Italy, Israel)
                    Color(hex: "#F59E0B"),  // Gold (WBC trophy)
                    Color(hex: "#16A34A"),  // Green (Mexico, Australia)
                    Color(hex: "#EF4444"),  // Red (loop back for smooth gradient)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        default: return nil
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

// MARK: - Conference Filter Bar (NCAAB)

struct ConferenceFilterBar: View {
    @Binding var selected: String
    let conferences: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // "All" chip
                conferenceChip("All", isSelected: selected == "All")

                // Conference chips
                ForEach(conferences, id: \.self) { conf in
                    conferenceChip(conf, isSelected: selected == conf)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
    }

    private func conferenceChip(_ label: String, isSelected: Bool) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                selected = label
            }
        } label: {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(isSelected ? .black : .white.opacity(0.7))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background {
                    if isSelected {
                        Capsule()
                            .fill(GaryColors.gold)
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
    }
}

// MARK: - Sport Filter Bar

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
            HStack(spacing: 8) {
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
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                selected = sport
                            }
                        } label: {
                            VStack(spacing: 4) {
                                HStack(spacing: 4) {
                                    Image(systemName: sport.icon)
                                        .font(.system(size: 9, weight: .semibold))
                                    Text(sport.rawValue)
                                        .font(.system(size: 11.5, weight: isSelected ? .bold : .medium))
                                }
                                .foregroundStyle(
                                    isSelected ? .white :
                                    isAvailable ? .white.opacity(0.4) :
                                    .white.opacity(0.15)
                                )
                                .padding(.horizontal, 6)

                                RoundedRectangle(cornerRadius: 1)
                                    .fill(isSelected ? sport.accentColor : .clear)
                                    .frame(height: 1.75)
                            }
                        }
                        .disabled(!isAvailable)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
        .frame(height: 36)
    }
}

// MARK: - Gary's Picks View

struct GaryPicksView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var allPicks: [GaryPick] = []
    @State private var loading = true
    @State private var fetchFailed = false
    @State private var selectedSport: Sport = .all
    @State private var selectedConference: String = "All"
    @State private var lastUpdated: Date?

    // Yesterday's results fallback (per-sport: sports with no fresh picks today show yesterday's stamped cards)
    @State private var showingYesterdayResults = false
    @State private var yesterdayPicks: [GaryPick] = []
    @State private var yesterdayResultsMap: [String: String] = [:] // matchup key -> "won"/"lost"/"push"
    @State private var sportsWithFreshPicks: Set<String> = [] // sports that have today's picks
    @State private var selectedPick: GaryPick? = nil

    /// Today's date formatted for the header
    private var headerDateString: String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: Date()).uppercased()
    }

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
                
                guard let gameDate = parseISO8601(commenceTime) else {
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
        
        // Apply today's picks filter
        let todayFiltered = filterToTodaysPicks(allPicks)
        // For "All" tab: show today's picks if any exist, otherwise fall back to yesterday's stamped results
        guard selectedSport != .all else {
            if todayFiltered.isEmpty && showingYesterdayResults {
                return interleaveBySport(yesterdayPicks)
            }
            return interleaveBySport(todayFiltered)
        }

        // For specific sport tabs: merge in yesterday's picks if that sport has no fresh picks today
        var mergedPicks = todayFiltered
        if showingYesterdayResults && !sportsWithFreshPicks.contains(selectedSport.rawValue) {
            let yesterdayForSport = yesterdayPicks.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue }
            mergedPicks.append(contentsOf: yesterdayForSport)
        }

        var sportFiltered = sortByTime(mergedPicks.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue })

        // Apply conference filter for NCAAB
        if selectedSport == .ncaab && selectedConference != "All" {
            sportFiltered = sportFiltered.filter { pick in
                let homeConf = pick.homeConference ?? ""
                let awayConf = pick.awayConference ?? ""
                return homeConf == selectedConference || awayConf == selectedConference
            }
        }

        return sportFiltered
    }
    
    /// Interleave picks by sport in round-robin order
    /// Order: NBA, NFL, NCAAB, NHL, NCAAF, EPL (skips sports with no picks)
    private func interleaveBySport(_ picks: [GaryPick]) -> [GaryPick] {
        let sportOrder = ["NBA", "NFL", "NCAAB", "NHL", "NCAAF", "EPL", "WBC"]
        
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
        var sports = Set(allPicks.compactMap { $0.league?.uppercased() })
        // Include yesterday's sports in filter tabs
        for pick in yesterdayPicks {
            if let league = pick.league?.uppercased(), !league.isEmpty {
                sports.insert(league)
            }
        }
        return sports
    }

    /// Available conferences from today's NCAAB picks
    private var availableConferences: [String] {
        let ncaabPicks = allPicks.filter { ($0.league ?? "").uppercased() == "NCAAB" }
        var confSet = Set<String>()
        for pick in ncaabPicks {
            if let hc = pick.homeConference, !hc.isEmpty { confSet.insert(hc) }
            if let ac = pick.awayConference, !ac.isEmpty { confSet.insert(ac) }
        }
        return confSet.sorted()
    }

    /// Get time slot string for NFL picks (e.g., "Sunday 1:00 PM ET")
    private func getTimeSlot(for pick: GaryPick) -> String? {
        guard let isoTime = pick.commence_time, !isoTime.isEmpty else { return nil }
        guard let gameDate = parseISO8601(isoTime) else { return nil }
        return Formatters.dayTimeFormatterEST.string(from: gameDate) + " ET"
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
                // Header
                VStack(spacing: 1) {
                    Text("GARY'S PICKS")
                        .font(.system(size: 22, weight: .heavy))
                        .tracking(2)
                        .foregroundStyle(GaryColors.gold)
                    Text(headerDateString)
                        .font(.system(size: 10, weight: .medium))
                        .tracking(1)
                        .foregroundStyle(.white.opacity(0.25))
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .padding(.bottom, 5)
                .background(alignment: .leading) {
                    Image("GaryIconBG")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 50)
                        .opacity(0.7)
                        .allowsHitTesting(false)
                }
                .padding(.horizontal, 16)

                // Separator
                Rectangle()
                    .fill(LinearGradient(colors: [.clear, GaryColors.gold.opacity(0.15), .clear], startPoint: .leading, endPoint: .trailing))
                    .frame(height: 0.5)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 5)

                // Sport Filter
                SportFilterBar(selected: $selectedSport, availableSports: availableSports, showAll: true)
                    .padding(.bottom, 1)
                    .onChange(of: selectedSport) { _ in
                        selectedConference = "All" // Reset conference when sport changes
                    }

                // Cache staleness indicator
                if let updated = lastUpdated, !loading {
                    Text(relativeTimeString(from: updated))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary.opacity(0.45))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 0)
                }

                // Conference Filter (NCAAB only)
                if selectedSport == .ncaab {
                    ConferenceFilterBar(
                        selected: $selectedConference,
                        conferences: availableConferences
                    )
                    .padding(.bottom, 2)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                // March Madness Bracket banner (after conference filter)
                if selectedSport == .ncaab || selectedSport == .all {
                    MarchMadnessBanner()
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                        .padding(.bottom, 5)
                }

                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if fetchFailed {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 50))
                            .foregroundStyle(.tertiary)
                        Text("Couldn't load picks")
                            .foregroundStyle(.secondary)
                        Button {
                            Task { await loadPicks(forceRefresh: true) }
                        } label: {
                            Text("Tap to retry")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(GaryColors.gold)
                        }
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
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
                        LazyVStack(spacing: 5) {
                            // Yesterday's Results header
                            if showingYesterdayResults && filteredPicks.contains(where: { isYesterdayPick($0) }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "clock.arrow.counterclockwise")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.white.opacity(0.35))
                                    Text("Yesterday's Results")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.35))
                                    Text(yesterdayRecord)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(GaryColors.gold)
                                }
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, 1)
                                .padding(.bottom, 1)
                            }

                            // Compact pick rows (time displayed on each card)
                            ForEach(filteredPicks) { pick in
                                CompactPickRow(
                                    pick: pick,
                                    gameResult: isYesterdayPick(pick) ? resultForPick(pick) : nil,
                                    showSportBadge: selectedSport == .all
                                )
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                        selectedPick = pick
                                    }
                                }
                                .padding(.horizontal, 12)
                                .transaction { $0.animation = nil }
                            }
                        }
                        .padding(.vertical, 4)
                        .padding(.bottom, 100)
                        .transaction { $0.animation = nil }
                    }
                    .refreshable {
                        await loadPicks(forceRefresh: true)
                    }
                }
            }
        }
        .overlay {
            if let selected = selectedPick {
                PickDetailPopup(
                    pick: selected,
                    gameResult: isYesterdayPick(selected) ? resultForPick(selected) : nil,
                    onDismiss: { selectedPick = nil }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
                .zIndex(100)
            }
        }
        .onChange(of: selectedPick?.pick_id) { _ in
            PickDetailState.shared.isShowing = selectedPick != nil
        }
        .task {
            await loadPicks()
        }
    }

    /// W-L record string for yesterday's picks in the current sport filter
    private var yesterdayRecord: String {
        let yPicks = filteredPicks.filter { isYesterdayPick($0) }
        let wins = yPicks.filter { resultForPick($0)?.lowercased() == "won" }.count
        let losses = yPicks.filter { resultForPick($0)?.lowercased() == "lost" }.count
        let pushes = yPicks.filter { resultForPick($0)?.lowercased() == "push" }.count
        return pushes > 0 ? "\(wins)-\(losses)-\(pushes)" : "\(wins)-\(losses)"
    }

    /// Check if a pick is from yesterday's fallback
    private func isYesterdayPick(_ pick: GaryPick) -> Bool {
        let sport = (pick.league ?? "").uppercased()
        return showingYesterdayResults && !sportsWithFreshPicks.contains(sport)
    }

    /// Match a pick to its result from yesterdayResultsMap
    private func resultForPick(_ pick: GaryPick) -> String? {
        let home = (pick.homeTeam ?? "").lowercased()
        let away = (pick.awayTeam ?? "").lowercased()
        guard !home.isEmpty, !away.isEmpty else { return nil }

        // game_results.matchup is "Away Team @ Home Team"
        for (matchup, result) in yesterdayResultsMap {
            if matchup.contains(home) && matchup.contains(away) {
                return result
            }
        }
        return nil
    }

    // TEMP DEBUG: Set to true to preview yesterday's results overlay, then set back to false
    private let debugForceYesterday = false

    private func loadPicks(forceRefresh: Bool = false) async {
        await MainActor.run {
            loading = true
            fetchFailed = false
        }

        // Debug: use tomorrow's date (no picks) so fallback triggers with today's picks as "yesterday"
        let date = debugForceYesterday ? "2026-03-07" : SupabaseAPI.todayEST()

        // Use a timeout to prevent infinite loading
        var picks: [GaryPick] = []
        var didFail = false
        do {
            let arr = try await withTimeout(seconds: 30) {
                try await SupabaseAPI.fetchAllPicks(date: date, forceRefresh: forceRefresh)
            }
            picks = arr.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }
        } catch {
            didFail = true
        }

        // Determine which sports have fresh picks today
        let freshSports = Set(picks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })

        // Always fetch yesterday's picks + results for sports without fresh picks today
        var yPicks: [GaryPick] = []
        var resultsMap: [String: String] = [:]
        var hasYesterday = false
        do {
            let yesterday = SupabaseAPI.yesterdayEST()
            let fetched = try await withTimeout(seconds: 20) {
                try await SupabaseAPI.fetchDailyPicks(date: yesterday)
            }
            let filtered = fetched.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }

            // Only keep yesterday picks for sports that DON'T have fresh picks today
            let yesterdaySportsNeeded = filtered.filter { !freshSports.contains(($0.league ?? "").uppercased()) }
            if !yesterdaySportsNeeded.isEmpty {
                yPicks = yesterdaySportsNeeded
                hasYesterday = true

                // Fetch results for yesterday
                let results = (try? await SupabaseAPI.fetchAllGameResults(since: yesterday, forceRefresh: forceRefresh)) ?? []
                let yesterdayResults = results.filter { $0.game_date == yesterday }
                for result in yesterdayResults {
                    guard let matchup = result.matchup, let outcome = result.result else { continue }
                    resultsMap[matchup.lowercased()] = outcome.lowercased()
                }
            }
        } catch {
            // Yesterday fetch failed — just show today's picks
        }

        await MainActor.run {
            allPicks = picks
            yesterdayPicks = yPicks
            sportsWithFreshPicks = freshSports
            showingYesterdayResults = hasYesterday
            yesterdayResultsMap = resultsMap
            fetchFailed = didFail && picks.isEmpty && yPicks.isEmpty
            loading = false
            if !didFail { lastUpdated = Date() }
        }
    }
}

// MARK: - Gary's Props View

struct GaryPropsView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var allProps: [PropPick] = []
    @State private var loading = true
    @State private var fetchFailed = false
    @State private var selectedSport: Sport = .all
    @State private var lastUpdated: Date?
    @State private var selectedProp: PropPick?
    @State private var propResultsMap: [String: String] = [:]
    @State private var showingYesterdayResults = false
    @State private var yesterdayProps: [PropPick] = []
    @State private var yesterdayResultsMap: [String: String] = [:]
    @State private var sportsWithFreshProps: Set<String> = []

    private var headerDateString: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "EEEE, MMM d"
        fmt.timeZone = TimeZone(identifier: "America/New_York")
        return fmt.string(from: Date()).uppercased()
    }
    
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
            // Show all non-TD props; if none today, fall back to yesterday's
            let todayNonTD = allProps.filter { !$0.isTDPick }
            if todayNonTD.isEmpty && showingYesterdayResults {
                return sortByTime(yesterdayProps.filter { !$0.isTDPick })
            }
            return sortByTime(todayNonTD)
        case .nflTDs:
            var merged = allProps
            if showingYesterdayResults { merged.append(contentsOf: yesterdayProps) }
            return merged.filter { $0.isTDPick }.sorted { a, b in
                if a.tdCategory != b.tdCategory { return a.tdCategory == "standard" }
                return (a.commence_time ?? "") < (b.commence_time ?? "")
            }
        case .nfl:
            var merged = allProps
            if showingYesterdayResults && !sportsWithFreshProps.contains("NFL") {
                merged.append(contentsOf: yesterdayProps.filter { ($0.effectiveLeague ?? "") == "NFL" })
            }
            return sortByTime(merged.filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isTDPick })
        default:
            var merged = allProps
            if showingYesterdayResults && !sportsWithFreshProps.contains(selectedSport.rawValue) {
                merged.append(contentsOf: yesterdayProps.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue })
            }
            return sortByTime(merged.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue })
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
        let combined = allProps + (showingYesterdayResults ? yesterdayProps : [])
        var sports = Set(combined.compactMap { $0.effectiveLeague })
        if combined.contains(where: { $0.isTDPick }) {
            sports.insert("NFL TDs")
        }
        return sports
    }
    
    /// Get time slot string for props (e.g., "Sunday 1:00 PM ET")
    private func getTimeSlot(for prop: PropPick) -> String? {
        // Try commence_time first (ISO format)
        if let isoTime = prop.commence_time, !isoTime.isEmpty {
            if let gameDate = parseISO8601(isoTime) {
                return Formatters.dayTimeFormatterEST.string(from: gameDate) + " ET"
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
                VStack(spacing: 2) {
                    Text("GARY'S PROPS")
                        .font(.system(size: 18, weight: .bold))
                        .tracking(1.5)
                        .foregroundStyle(GaryColors.gold)
                    Text(headerDateString)
                        .font(.system(size: 10, weight: .medium))
                        .tracking(0.8)
                        .foregroundStyle(.white.opacity(0.3))
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
                .padding(.bottom, 6)
                .padding(.horizontal, 16)
                .background(alignment: .leading) {
                    Image("GaryIconBG")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 40, height: 40)
                        .padding(.leading, 16)
                }

                // Sport Filter (with props-only filters like NFL TDs)
                SportFilterBar(selected: $selectedSport, availableSports: availableSports, showPropsOnly: true)
                    .padding(.bottom, 2)

                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if fetchFailed {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 50))
                            .foregroundStyle(.tertiary)
                        Text("Couldn't load props")
                            .foregroundStyle(.secondary)
                        Button {
                            Task { await loadProps(forceRefresh: true) }
                        } label: {
                            Text("Tap to retry")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(GaryColors.gold)
                        }
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
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
                        LazyVStack(spacing: 5.7) {
                            // NFL TDs: Show with category section headers (Regular / Value)
                            if selectedSport == .nflTDs {
                                ForEach(tdPicksByCategory, id: \.category) { group in
                                    // Section Header
                                    HStack(spacing: 6) {
                                        Rectangle()
                                            .fill(group.category == "standard" ? Color(hex: "#3B82F6").opacity(0.6) :
                                                  group.category == "underdog" ? Color(hex: "#22C55E").opacity(0.6) :
                                                  Color(hex: "#A855F7").opacity(0.6))
                                            .frame(width: 20, height: 1)

                                        Text(group.label)
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(group.category == "standard" ? Color(hex: "#3B82F6") :
                                                           group.category == "underdog" ? Color(hex: "#22C55E") :
                                                           Color(hex: "#A855F7"))

                                        if group.category == "underdog" {
                                            Text("+200+")
                                                .font(.system(size: 9, weight: .medium))
                                                .foregroundStyle(.secondary)
                                        }

                                        Rectangle()
                                            .fill(group.category == "standard" ? Color(hex: "#3B82F6").opacity(0.6) :
                                                  group.category == "underdog" ? Color(hex: "#22C55E").opacity(0.6) :
                                                  Color(hex: "#A855F7").opacity(0.6))
                                            .frame(height: 1)
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.top, group.category == "standard" ? 4 : 10)

                                    // TD Picks in this category
                                    ForEach(group.picks) { prop in
                                        CompactPropRow(prop: prop, gameResult: resultForProp(prop))
                                            .padding(.horizontal, 12)
                                            .onTapGesture { selectedProp = prop }
                                            .transaction { $0.animation = nil }
                                    }
                                }
                            } else {
                                // Regular props: Show grouped by matchup with headers
                                ForEach(propsByMatchup, id: \.matchup) { group in
                                    // Matchup header
                                    HStack(spacing: 6) {
                                        Rectangle()
                                            .fill(GaryColors.gold.opacity(0.4))
                                            .frame(width: 16, height: 1)
                                        Text(group.matchup)
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(GaryColors.gold.opacity(0.7))
                                            .fixedSize(horizontal: true, vertical: false)
                                        Rectangle()
                                            .fill(GaryColors.gold.opacity(0.4))
                                            .frame(height: 1)
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.top, 10)

                                    // Props in this matchup
                                    ForEach(group.props) { prop in
                                        CompactPropRow(prop: prop, gameResult: resultForProp(prop), showSportBadge: selectedSport == .all)
                                            .padding(.horizontal, 12)
                                            .onTapGesture { selectedProp = prop }
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
        .overlay {
            if let prop = selectedProp {
                PropDetailPopup(prop: prop) {
                    selectedProp = nil
                }
                .transition(.opacity)
            }
        }
        .task {
            await loadProps()
        }
    }

    /// Check if a prop is from yesterday's fallback
    private func isYesterdayProp(_ prop: PropPick) -> Bool {
        let sport = (prop.effectiveLeague ?? "").uppercased()
        return showingYesterdayResults && !sportsWithFreshProps.contains(sport)
    }

    /// Strip the numeric line value from a prop string (e.g., "points 0.5" → "points")
    private func normalizePropType(_ raw: String) -> String {
        raw.lowercased().replacingOccurrences(of: #"\s+[\d.]+"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    /// Match a prop to its result — checks today's results first, then yesterday's
    private func resultForProp(_ prop: PropPick) -> String? {
        let player = (prop.player ?? "").lowercased()
        let propType = normalizePropType(prop.prop ?? "")
        guard !player.isEmpty, !propType.isEmpty else { return nil }

        let key = "\(player)_\(propType)"
        // Today's results for today's props
        if let result = propResultsMap[key] { return result }
        // Yesterday's results for yesterday's fallback props
        if isYesterdayProp(prop), let result = yesterdayResultsMap[key] { return result }
        return nil
    }

    private func loadProps(forceRefresh: Bool = false) async {
        await MainActor.run {
            loading = true
            fetchFailed = false
        }

        let date = SupabaseAPI.todayEST()

        // Use a timeout to prevent infinite loading
        var props: [PropPick] = []
        var didFail = false
        do {
            props = try await withTimeout(seconds: 30) {
                try await SupabaseAPI.fetchPropPicks(date: date, forceRefresh: forceRefresh)
            }
        } catch {
            didFail = true
        }

        // Fetch today's prop results to stamp W/L on completed props
        var todayMap: [String: String] = [:]
        let allResults = (try? await SupabaseAPI.fetchPropResults(since: SupabaseAPI.yesterdayEST(), forceRefresh: forceRefresh)) ?? []
        for result in allResults.filter({ $0.game_date == date }) {
            guard let playerName = result.player_name, let propType = result.prop_type,
                  let outcome = result.result else { continue }
            todayMap["\(playerName.lowercased())_\(propType.lowercased())"] = outcome.lowercased()
        }

        // Determine which sports have fresh props today
        let freshSports = Set(props.compactMap { ($0.effectiveLeague ?? "").uppercased() }.filter { !$0.isEmpty })

        // Fetch yesterday's props + results for sports without fresh props today
        var yProps: [PropPick] = []
        var yMap: [String: String] = [:]
        var hasYesterday = false
        do {
            let yesterday = SupabaseAPI.yesterdayEST()
            let fetched = try await withTimeout(seconds: 20) {
                try await SupabaseAPI.fetchPropPicks(date: yesterday, forceRefresh: forceRefresh)
            }

            let yesterdaySportsNeeded = fetched.filter { !freshSports.contains(($0.effectiveLeague ?? "").uppercased()) }
            if !yesterdaySportsNeeded.isEmpty {
                yProps = yesterdaySportsNeeded
                hasYesterday = true

                for result in allResults.filter({ $0.game_date == yesterday }) {
                    guard let playerName = result.player_name, let propType = result.prop_type,
                          let outcome = result.result else { continue }
                    yMap["\(playerName.lowercased())_\(propType.lowercased())"] = outcome.lowercased()
                }
            }
        } catch {
            // Yesterday fetch failed — just show today's props
        }

        await MainActor.run {
            allProps = props
            propResultsMap = todayMap
            yesterdayProps = yProps
            yesterdayResultsMap = yMap
            sportsWithFreshProps = freshSports
            showingYesterdayResults = hasYesterday
            fetchFailed = didFail && props.isEmpty && yProps.isEmpty
            loading = false
            if !didFail { lastUpdated = Date() }
        }
    }
}

// MARK: - Billfold View

struct BillfoldView: View {
    @State private var selectedTab = 0
    @State private var selectedSport: Sport = .all
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loading = true
    @State private var error: String?
    @State private var lastRefresh: Date?
    @State private var carouselIndex: Int = 0
    @State private var timeframe = "7d"
    @State private var sportTimeframe = "7d"
    @State private var spreadSport = "NBA"
    @State private var topdTimeframe = "7d"
    @State private var showingSettings = false
    @State private var dailyPickRows: [DailyPicksRow] = []

    // ALL expensive derived data cached here — updated via recomputeCache()
    @State private var cachedFilteredGames: [GameResult] = []
    @State private var cachedFilteredProps: [PropResult] = []
    @State private var cachedRecord: (wins: Int, losses: Int, pushes: Int) = (0, 0, 0)
    @State private var cachedNetUnits: Double = 0
    @State private var cachedStreak: (label: String, value: String, positive: Bool) = ("Streak", "--", true)
    @State private var cachedTrend: [BillfoldTrendPoint] = []
    @State private var cachedSportPerf: [BillfoldSportPoint] = []
    @State private var cachedSpreadPerf: [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] = []
    @State private var cachedTopd: (wins: Int, losses: Int, pnl: Double) = (0, 0, 0)
    @State private var cachedAvailableSports: Set<String> = []
    @State private var cachedSortedSports: [Sport] = Sport.allCases

    private let timeframes = ["7d", "30d", "90d", "ytd", "all"]
    let carouselTimer = Timer.publish(every: 3.5, on: .main, in: .common).autoconnect()

    private var positiveColor: Color { Color(hex: "#22C55E") }
    private var negativeColor: Color { Color(hex: "#EF4444") }

    private var validPropResults: [PropResult] {
        propResults.filter(isLegitPropResult)
    }

    /// Game results filtered by the global timeframe (client-side)
    private var timeframeGameResults: [GameResult] {
        guard let cutoff = sinceDateValue(for: timeframe) else { return gameResults }
        return gameResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    /// Prop results filtered by the global timeframe (client-side)
    private var timeframePropResults: [PropResult] {
        guard let cutoff = sinceDateValue(for: timeframe) else { return validPropResults }
        return validPropResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    /// Game results filtered by the By Sport timeframe (independent)
    private var sportTimeframeGameResults: [GameResult] {
        guard let cutoff = sinceDateValue(for: sportTimeframe) else { return gameResults }
        return gameResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    /// Prop results filtered by the By Sport timeframe (independent)
    private var sportTimeframePropResults: [PropResult] {
        guard let cutoff = sinceDateValue(for: sportTimeframe) else { return validPropResults }
        return validPropResults.filter { billfoldDate(from: $0.game_date) >= cutoff }
    }

    private var filteredGameResults: [GameResult] {
        let results = selectedSport == .all
            ? timeframeGameResults
            : timeframeGameResults.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        return results.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
    }

    private var filteredPropResults: [PropResult] {
        let results: [PropResult]
        switch selectedSport {
        case .all:
            results = timeframePropResults.filter { !$0.isTDResult }
        case .nflTDs:
            results = timeframePropResults.filter { $0.isTDResult }
        case .nfl:
            results = timeframePropResults
                .filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isTDResult }
        default:
            results = timeframePropResults
                .filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
        }
        return results.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
    }

    private var activeGameResults: [GameResult] { cachedFilteredGames }
    private var activePropResults: [PropResult] { cachedFilteredProps }
    private var settledCount: Int { cachedRecord.wins + cachedRecord.losses + cachedRecord.pushes }
    private var record: (wins: Int, losses: Int, pushes: Int) { cachedRecord }
    private var winRate: Double {
        let decisive = max(1, cachedRecord.wins + cachedRecord.losses)
        return Double(cachedRecord.wins) / Double(decisive) * 100
    }
    private var netUnits: Double { cachedNetUnits }
    private var netDollars: Double { cachedNetUnits * 100 }

    private func signedDollars(_ value: Double) -> String {
        let rounded = Int(abs(value).rounded())
        return value >= 0 ? "+$\(rounded)" : "-$\(rounded)"
    }

    private func unsignedDollars(_ value: Double) -> String {
        let rounded = Int(abs(value).rounded())
        return "$\(rounded)"
    }

    private var streakSummary: (label: String, value: String, positive: Bool) { cachedStreak }
    private var trendPoints: [BillfoldTrendPoint] { cachedTrend }
    private var sortedSportsForBillfold: [Sport] { cachedSortedSports }
    private var availableSports: Set<String> { cachedAvailableSports }

    private var recentGameCards: [GameResult] { Array(activeGameResults.prefix(20)) }
    private var recentPropCards: [PropResult] { Array(activePropResults.prefix(20)) }

    private var sourceCount: Int {
        selectedTab == 0 ? activeGameResults.count : activePropResults.count
    }

    private var accentColor: Color {
        selectedSport == .all ? GaryColors.gold : selectedSport.accentColor
    }

    private var updatedLabel: String {
        guard let lastRefresh else { return "Not synced" }
        return relativeTimeString(from: lastRefresh)
    }

    private var recordText: String {
        "\(record.wins)-\(record.losses)-\(record.pushes)"
    }

    private var sportPerformance: [BillfoldSportPoint] { cachedSportPerf }

    private func computeSportPerformance() -> [BillfoldSportPoint] {
        var points: [BillfoldSportPoint]
        if selectedTab == 0 {
            points = groupedSportPerformance(from: sportTimeframeGameResults.map { ($0.effectiveLeague, $0.result, $0.odds?.value) })
        } else {
            points = groupedSportPerformance(from: sportTimeframePropResults.map { ($0.effectiveLeague, $0.result, $0.odds?.value) })
        }
        let requiredSports = ["NBA", "NHL", "NCAAB", "NFL", "NCAAF"]
        for sport in requiredSports {
            if !points.contains(where: { $0.sport == sport }) {
                points.append(BillfoldSportPoint(sport: sport, netUnits: 0, winRate: 0, settledCount: 0))
            }
        }
        points.sort { $0.netUnits > $1.netUnits }
        if selectedSport == .all {
            return points
        }
        return points.filter { $0.sport == selectedSport.rawValue }
    }

    private var topdStats: (wins: Int, losses: Int, pnl: Double) { cachedTopd }

    private func computeTopdStats() -> (wins: Int, losses: Int, pnl: Double) {
        let cutoff = sinceDateValue(for: topdTimeframe)
        // Build lookup dict for O(1) game result matching
        var grLookup: [String: GameResult] = [:]
        for gr in gameResults {
            if let date = gr.game_date, let pick = gr.pick_text {
                grLookup["\(date)|\(pick)"] = gr
            }
        }
        var wins = 0, losses = 0, pnl = 0.0
        for row in dailyPickRows {
            if let cutoff = cutoff, billfoldDate(from: row.date) < cutoff { continue }
            let picks = SupabaseAPI.parsePicksRow(row.picks)
            let gamePicks = picks.filter { ($0.type ?? "game") != "prop" }
            guard !gamePicks.isEmpty else { continue }
            let topPick: GaryPick
            if let manual = gamePicks.first(where: { $0.is_top_pick == true }) {
                topPick = manual
            } else if let best = gamePicks.max(by: { ($0.confidence ?? 0) < ($1.confidence ?? 0) }) {
                topPick = best
            } else { continue }
            guard let gr = grLookup["\(row.date)|\(topPick.pick ?? "")"] else { continue }
            switch gr.result {
            case "won": wins += 1; pnl += units(for: "won", odds: gr.odds?.value)
            case "lost": losses += 1; pnl += units(for: "lost", odds: gr.odds?.value)
            default: break
            }
        }
        return (wins, losses, pnl)
    }

    private var spreadBucketsForSport: [(String, ClosedRange<Double>)] {
        switch spreadSport {
        case "NBA":
            return [
                ("1-3", 0.5...3.5),
                ("4-6", 3.6...6.5),
                ("7-9", 6.6...9.5),
                ("10+", 9.6...99)
            ]
        case "NCAAB":
            return [
                ("1-4", 0.5...4.5),
                ("5-9", 4.6...9.5),
                ("10+", 9.6...99)
            ]
        case "NFL":
            return [
                ("1-3", 0.5...3.5),
                ("4-7", 3.6...7.5),
                ("8-14", 7.6...14.5),
                ("15+", 14.6...99)
            ]
        case "NCAAF":
            return [
                ("1-6", 0.5...6.5),
                ("7-14", 6.6...14.5),
                ("15-21", 14.6...21.5),
                ("22+", 21.6...99)
            ]
        case "WBC":
            return [
                ("1-1.5", 0.5...1.5),
                ("2-4", 1.6...4.5),
                ("5+", 4.6...99)
            ]
        default:
            return [
                ("1-3", 0.5...3.5),
                ("4-6", 3.6...6.5),
                ("7-10", 6.6...10.5),
                ("10+", 9.6...99)
            ]
        }
    }

    private var spreadSportsAvailable: [String] {
        // No ALL — spread sizes are sport-specific
        var sports = [String]()
        let leagues = Set(timeframeGameResults.compactMap { $0.effectiveLeague })
        for s in ["NBA", "NCAAB", "NFL", "NCAAF", "WBC"] {
            if leagues.contains(s) { sports.append(s) }
        }
        // Always include NBA as default even if no data yet
        if !sports.contains("NBA") { sports.insert("NBA", at: 0) }
        return sports
    }

    private var spreadSizePerformance: [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] { cachedSpreadPerf }

    private func computeSpreadPerf() -> [(bucket: String, wins: Int, losses: Int, pushes: Int, net: Double)] {
        guard selectedTab == 0 else { return [] }
        let results = timeframeGameResults.filter { ($0.effectiveLeague ?? "") == spreadSport }
        guard !results.isEmpty else { return [] }
        // Pre-compile regex once
        guard let regex = try? NSRegularExpression(pattern: #"[+-]\d{1,2}(?:\.\d)?"#) else { return [] }
        // Pre-extract spread values for each result
        let withSpreads: [(GameResult, Double)] = results.compactMap { result in
            guard let pickText = result.pick_text else { return nil }
            let matches = regex.matches(in: pickText, range: NSRange(pickText.startIndex..., in: pickText))
            guard let match = matches.first, let swiftRange = Range(match.range, in: pickText) else { return nil }
            let num = abs(Double(pickText[swiftRange]) ?? 0)
            return num > 0 ? (result, num) : nil
        }
        return spreadBucketsForSport.compactMap { label, range in
            let matching = withSpreads.filter { range.contains($0.1) }.map { $0.0 }
            guard !matching.isEmpty else { return nil }
            var wins = 0, losses = 0, pushes = 0, net = 0.0
            for r in matching {
                switch r.result {
                case "won": wins += 1; net += units(for: "won", odds: r.odds?.value)
                case "lost": losses += 1; net += units(for: "lost", odds: r.odds?.value)
                case "push": pushes += 1
                default: break
                }
            }
            return (label, wins, losses, pushes, net)
        }
    }

    private var bestSportInsight: String {
        let sports = selectedTab == 0
            ? Set(gameResults.compactMap { $0.effectiveLeague })
            : Set(validPropResults.compactMap { $0.effectiveLeague })

        let candidates = sports.compactMap { sport -> (String, Double)? in
            if selectedTab == 0 {
                let subset = gameResults.filter { $0.effectiveLeague == sport }
                guard !subset.isEmpty else { return nil }
                let net = subset.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
                return (sport, net)
            } else {
                let subset = validPropResults.filter { $0.effectiveLeague == sport }
                guard !subset.isEmpty else { return nil }
                let net = subset.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
                return (sport, net)
            }
        }

        guard let winner = candidates.max(by: { $0.1 < $1.1 }) else { return "No edge yet" }
        return "\(winner.0) \(signedDollars(winner.1 * 100))"
    }

    // MARK: - Body

    // Design tokens — gold-tinted dark
    private var cardFill: Color { Color(hex: "#141210") }
    private var cardStroke: Color { GaryColors.gold.opacity(0.15) }
    private var pageBg: Color { Color(hex: "#0A0908") }
    private let cr: CGFloat = 4

    /// Gold glass card background — subtle gold tint, soft inner glow
    private func goldGlassCard(cornerRadius: CGFloat? = nil) -> some View {
        let r = cornerRadius ?? cr
        return ZStack {
            RoundedRectangle(cornerRadius: r)
                .fill(cardFill)
            // Subtle gold wash
            RoundedRectangle(cornerRadius: r)
                .fill(GaryColors.gold.opacity(0.035))
            // Soft inner glow at top edge
            RoundedRectangle(cornerRadius: r)
                .stroke(GaryColors.gold.opacity(0.06), lineWidth: 1)
                .blur(radius: 4)
                .clipShape(RoundedRectangle(cornerRadius: r))
        }
    }

    var body: some View {
        ZStack {
            pageBg.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 8) {
                    headerBar
                    billfoldTopBar

                    if loading && settledCount == 0 {
                        loadingState
                    } else if let error = error, settledCount == 0 {
                        errorState(error: error)
                    } else {
                        statsStrip
                        performanceChart
                        recentCarousel
                        twoColumnBreakdown
                    }
                }
                .padding(.bottom, 90)
            }


        }
        .task { await loadData() }
        .onChange(of: selectedTab) { _ in recomputeCache() }
        .onChange(of: selectedSport) { _ in recomputeCache() }
        .onChange(of: timeframe) { _ in recomputeCache() }
        .onChange(of: sportTimeframe) { _ in recomputeCache() }
        .onChange(of: spreadSport) { _ in recomputeCache() }
        .onChange(of: topdTimeframe) { _ in recomputeCache() }
        .sheet(isPresented: $showingSettings) {
            SettingsSheetView()
        }
    }

    private func recomputeCache() {
        // 1. Filtered results
        let tfGames = timeframeGameResults
        let tfProps = timeframePropResults
        let fGames: [GameResult]
        if selectedSport == .all {
            fGames = tfGames.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
        } else {
            fGames = tfGames.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }
                .sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
        }
        let fProps: [PropResult]
        switch selectedSport {
        case .all: fProps = tfProps.filter { !$0.isTDResult }.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
        case .nflTDs: fProps = tfProps.filter { $0.isTDResult }.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
        case .nfl: fProps = tfProps.filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isTDResult }.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
        default: fProps = tfProps.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue }.sorted { billfoldDate(from: $0.game_date) > billfoldDate(from: $1.game_date) }
        }
        cachedFilteredGames = fGames
        cachedFilteredProps = fProps

        // 2. Record
        let active = selectedTab == 0 ? fGames.map { $0.result ?? "" } : fProps.map { $0.result ?? "" }
        cachedRecord = active.reduce(into: (wins: 0, losses: 0, pushes: 0)) { acc, r in
            switch r { case "won": acc.wins += 1; case "lost": acc.losses += 1; case "push": acc.pushes += 1; default: break }
        }

        // 3. Net units
        if selectedTab == 0 {
            cachedNetUnits = fGames.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
        } else {
            cachedNetUnits = fProps.reduce(0) { $0 + units(for: $1.result, odds: $1.odds?.value) }
        }

        // 4. Streak
        let settled = active.filter { ["won", "lost", "push"].contains($0) }
        if let first = settled.first {
            let count = settled.prefix { $0 == first }.count
            switch first {
            case "won": cachedStreak = ("Streak", "\(count)W", true)
            case "lost": cachedStreak = ("Streak", "\(count)L", false)
            case "push": cachedStreak = ("Streak", "\(count)P", true)
            default: cachedStreak = ("Streak", "--", true)
            }
        } else {
            cachedStreak = ("Streak", "--", true)
        }

        // 5. Trend
        if selectedTab == 0 {
            cachedTrend = dailyTrend(items: fGames.map { ($0.game_date, units(for: $0.result, odds: $0.odds?.value)) })
        } else {
            cachedTrend = dailyTrend(items: fProps.map { ($0.game_date, units(for: $0.result, odds: $0.odds?.value)) })
        }

        // 6. Available sports + sorted sports
        if selectedTab == 0 {
            cachedAvailableSports = Set(tfGames.compactMap { $0.effectiveLeague })
        } else {
            var leagues = Set(tfProps.compactMap { $0.effectiveLeague })
            if tfProps.contains(where: { $0.isTDResult }) { leagues.insert("NFL TDs") }
            cachedAvailableSports = leagues
        }
        let avail = cachedAvailableSports
        cachedSortedSports = Sport.allCases
            .filter { sport in selectedTab == 0 && sport.isPropsOnly ? false : true }
            .sorted { a, b in
                if a == .all { return true }; if b == .all { return false }
                let aA = avail.contains(a.rawValue); let bA = avail.contains(b.rawValue)
                if aA && !bA { return true }; if !aA && bA { return false }
                return (Sport.allCases.firstIndex(of: a) ?? 0) < (Sport.allCases.firstIndex(of: b) ?? 0)
            }

        // 7. Sport perf, spread perf, topd
        cachedSportPerf = computeSportPerformance()
        cachedSpreadPerf = computeSpreadPerf()
        cachedTopd = computeTopdStats()
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(alignment: .center, spacing: 8) {
            Image("GaryIconBG")
                .resizable()
                .scaledToFit()
                .frame(width: 28, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 6))

            Text("BILLFOLD")
                .font(.system(size: 18, weight: .bold))
                .tracking(2)
                .foregroundStyle(GaryColors.gold)

            Spacer()

            Button {
                showingSettings = true
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(GaryColors.gold.opacity(0.6))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }

    // MARK: - Sport Tabs + Picks/Props + Timeframe

    private var billfoldTopBar: some View {
        HStack(spacing: 6) {
            // Left: Sport tabs (scrollable)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(sortedSportsForBillfold, id: \.self) { sport in
                        let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                        let isSelected = selectedSport == sport
                        let dotColor: Color = sport == .all ? GaryColors.gold : sport.accentColor

                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                selectedSport = sport
                            }
                        } label: {
                            VStack(spacing: 4) {
                                HStack(spacing: 4) {
                                    RoundedRectangle(cornerRadius: 1)
                                        .fill(dotColor)
                                        .frame(width: 5, height: 5)
                                    Text(sport.rawValue)
                                        .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                                }
                                .foregroundStyle(
                                    isSelected ? .white
                                    : isAvailable ? .white.opacity(0.45)
                                    : .white.opacity(0.15)
                                )

                                RoundedRectangle(cornerRadius: 1)
                                    .fill(isSelected ? dotColor : .clear)
                                    .frame(height: 2)
                            }
                            .padding(.horizontal, 6)
                        }
                        .disabled(!isAvailable)
                    }
                }
            }

            // Right: 7D above Picks, stacked vertically
            VStack(spacing: 4) {
                // Timeframe dropdown
                Menu {
                    ForEach(timeframes, id: \.self) { tf in
                        Button {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                timeframe = tf
                            }
                        } label: {
                            Label(tf.uppercased(), systemImage: timeframe == tf ? "checkmark" : "")
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        Text(timeframe.uppercased())
                            .font(.system(size: 11, weight: .bold))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 7, weight: .bold))
                    }
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(GaryColors.gold.opacity(0.08))
                    )
                }

                // Picks / Props dropdown
                Menu {
                    Button {
                        selectedTab = 0
                        selectedSport = .all
                    } label: {
                        Label("Picks", systemImage: selectedTab == 0 ? "checkmark" : "")
                    }
                    Button {
                        selectedTab = 1
                        selectedSport = .all
                    } label: {
                        Label("Props", systemImage: selectedTab == 1 ? "checkmark" : "")
                    }
                } label: {
                    HStack(spacing: 3) {
                        Text(selectedTab == 0 ? "Picks" : "Props")
                            .font(.system(size: 11, weight: .bold))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 7, weight: .bold))
                    }
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(GaryColors.gold.opacity(0.08))
                    )
                }
            }
        }
        .padding(.horizontal, 16)
    }



    // MARK: - Stats Strip (compact horizontal)

    private var statsStrip: some View {
        HStack(spacing: 0) {
            stripStat(
                value: String(format: "%.1f%%", winRate),
                label: "Win Rate",
                color: winRate >= 50 ? positiveColor : negativeColor,
                large: true
            )

            stripDivider

            stripStat(value: recordText, label: "Record", color: GaryColors.gold)

            stripDivider

            stripStat(
                value: signedDollars(netDollars),
                label: "Profit",
                color: netDollars >= 0 ? positiveColor : negativeColor
            )

            stripDivider

            stripStat(
                value: streakSummary.value,
                label: "Streak",
                color: streakSummary.positive ? positiveColor : negativeColor
            )
        }
        .padding(.vertical, 12)
        .background(
            goldGlassCard()
        )
        .padding(.horizontal, 16)
    }

    private func stripStat(value: String, label: String, color: Color, large: Bool = false) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: large ? 19 : 15, weight: .bold))
                .foregroundStyle(color)
                .monospacedDigit()
                .minimumScaleFactor(0.55)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(.white.opacity(0.28))
        }
        .frame(maxWidth: .infinity)
    }

    private var stripDivider: some View {
        Rectangle().fill(cardStroke).frame(width: 0.5, height: 22)
    }

    // MARK: - Performance Chart

    private var performanceChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Profit / Loss")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.5))

                Text("$100/Bet")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(GaryColors.gold.opacity(0.5))

                Spacer()

                if let last = trendPoints.last {
                    Text(signedDollars(last.cumulative * 100))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(last.cumulative >= 0 ? positiveColor : negativeColor)
                        .monospacedDigit()
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)

            if trendPoints.isEmpty {
                Text("No settled data")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.25))
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                Chart(trendPoints) { point in
                    AreaMark(
                        x: .value("Date", point.date),
                        y: .value("Units", point.cumulative)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [GaryColors.gold.opacity(0.2), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .interpolationMethod(.catmullRom)

                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Units", point.cumulative)
                    )
                    .foregroundStyle(GaryColors.gold)
                    .lineStyle(StrokeStyle(lineWidth: 1.5))
                    .interpolationMethod(.catmullRom)
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3))
                            .foregroundStyle(.white.opacity(0.08))
                        AxisValueLabel()
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
                .frame(height: 170)
                .padding(.horizontal, 10)
            }
        }
        .padding(.bottom, 10)
        .background(
            goldGlassCard()
        )
        .padding(.horizontal, 16)
    }

    // MARK: - Two-Column Breakdown (Sport + Market side by side)

    private var twoColumnBreakdown: some View {
        HStack(alignment: .top, spacing: 8) {
            // Left column: By Sport
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text("By Sport")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white.opacity(0.45))
                    Spacer()
                    Menu {
                        ForEach(timeframes, id: \.self) { tf in
                            Button(tf.uppercased()) { sportTimeframe = tf }
                        }
                    } label: {
                        HStack(spacing: 2) {
                            Text(sportTimeframe.uppercased())
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(GaryColors.gold)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(GaryColors.gold.opacity(0.6))
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 3)
                                .fill(GaryColors.gold.opacity(0.1))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 3)
                                        .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.5)
                                )
                        )
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 10)
                .padding(.bottom, 6)

                if sportPerformance.isEmpty {
                    Text("--")
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.2))
                        .frame(maxWidth: .infinity, minHeight: 40)
                } else {
                    ForEach(Array(sportPerformance.enumerated()), id: \.element.id) { index, point in
                        if index > 0 {
                            Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 10)
                        }
                        HStack(spacing: 4) {
                            Text(point.sport)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white.opacity(0.75))
                                .frame(maxWidth: .infinity, alignment: .leading)

                            Text(String(format: "%.0f%%", point.winRate))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white.opacity(0.35))
                                .monospacedDigit()

                            Text(unsignedDollars(point.netUnits * 100))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(point.netUnits >= 0 ? positiveColor : negativeColor)
                                .monospacedDigit()
                                .frame(width: 57, alignment: .trailing)
                        }
                        .padding(.horizontal, 10)
                        .frame(maxHeight: .infinity)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.bottom, 6)
            .background(
                goldGlassCard()
            )

            // Right column: Top Pick + By Spread stacked
            VStack(spacing: 8) {
                // Daily Top Pick
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text("Daily Top Pick")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white.opacity(0.45))
                        Spacer()
                        Menu {
                            ForEach(timeframes, id: \.self) { tf in
                                Button(tf.uppercased()) { topdTimeframe = tf }
                            }
                        } label: {
                            HStack(spacing: 2) {
                                Text(topdTimeframe.uppercased())
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(GaryColors.gold.opacity(0.6))
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(GaryColors.gold.opacity(0.1))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 3)
                                            .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.5)
                                    )
                            )
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .padding(.bottom, 6)

                    let topd = topdStats
                    if topd.wins + topd.losses == 0 {
                        Text("--")
                            .font(.system(size: 15))
                            .foregroundStyle(.white.opacity(0.2))
                            .frame(maxWidth: .infinity, minHeight: 40)
                    } else {
                        HStack(spacing: 4) {
                            Text("Record")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white.opacity(0.75))
                                .frame(maxWidth: .infinity, alignment: .leading)

                            Text("\(topd.wins)-\(topd.losses)")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(.white.opacity(0.3))
                                .monospacedDigit()

                            Text(unsignedDollars(topd.pnl * 100))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(topd.pnl >= 0 ? positiveColor : negativeColor)
                                .monospacedDigit()
                                .frame(width: 57, alignment: .trailing)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                    }
                }
                .padding(.bottom, 6)
                .background(
                    goldGlassCard()
                )

                // By Spread Size
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text("By Spread")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white.opacity(0.45))
                        Spacer()
                        Menu {
                            ForEach(spreadSportsAvailable, id: \.self) { s in
                                Button(s) { spreadSport = s }
                            }
                        } label: {
                            HStack(spacing: 2) {
                                Text(spreadSport)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(GaryColors.gold.opacity(0.6))
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(GaryColors.gold.opacity(0.1))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 3)
                                            .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.5)
                                    )
                            )
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.top, 10)
                    .padding(.bottom, 6)

                    if spreadSizePerformance.isEmpty {
                        Text(selectedTab == 0 ? "No spread data" : "Picks only")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.white.opacity(0.2))
                            .frame(maxWidth: .infinity, minHeight: 30)
                    } else {
                        ForEach(Array(spreadSizePerformance.enumerated()), id: \.offset) { index, item in
                            if index > 0 {
                                Rectangle().fill(cardStroke).frame(height: 0.5).padding(.horizontal, 10)
                            }
                            HStack(spacing: 4) {
                                Text(item.bucket)
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.75))
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                let total = item.wins + item.losses + item.pushes
                                let pct = total > 0 ? Int(round(Double(item.wins) / Double(total) * 100)) : 0
                                Text("\(pct)%")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.3))
                                    .monospacedDigit()

                                Text(unsignedDollars(item.net * 100))
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(item.net >= 0 ? positiveColor : negativeColor)
                                    .monospacedDigit()
                                    .frame(width: 57, alignment: .trailing)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                        }
                    }

                    Spacer(minLength: 0)
                }
                .padding(.bottom, 6)
                .background(
                    goldGlassCard()
                )
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Recent Carousel

    private var recentCarousel: some View {
        Group {
            if selectedTab == 0 {
                gameCarousel
            } else {
                propCarousel
            }
        }
    }

    private var gameCarousel: some View {
        Group {
            if recentGameCards.isEmpty {
                emptyCarousel
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    ScrollViewReader { proxy in
                        HStack(spacing: 6) {
                            ForEach(Array(recentGameCards.enumerated()), id: \.offset) { index, result in
                                gameCardView(result).id(index)
                            }
                        }
                        .onReceive(carouselTimer) { _ in
                            guard !recentGameCards.isEmpty else { return }
                            withAnimation(.easeInOut(duration: 0.4)) {
                                carouselIndex = (carouselIndex + 1) % recentGameCards.count
                                proxy.scrollTo(carouselIndex, anchor: .leading)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private var propCarousel: some View {
        Group {
            if recentPropCards.isEmpty {
                emptyCarousel
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    ScrollViewReader { proxy in
                        HStack(spacing: 6) {
                            ForEach(Array(recentPropCards.enumerated()), id: \.offset) { index, result in
                                propCardView(result).id(index)
                            }
                        }
                        .onReceive(carouselTimer) { _ in
                            guard !recentPropCards.isEmpty else { return }
                            withAnimation(.easeInOut(duration: 0.4)) {
                                carouselIndex = (carouselIndex + 1) % recentPropCards.count
                                proxy.scrollTo(carouselIndex, anchor: .leading)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    /// Strip odds from pick_text (e.g. "Brooklyn Nets +2.0 -112" → "Brooklyn Nets +2.0")
    private func pickWithoutOdds(_ text: String) -> String {
        // Remove trailing American odds like " -112", " +150", " -225"
        let pattern = #"\s+[+-]\d{3,}$"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           let range = Range(match.range, in: text) {
            return String(text[text.startIndex..<range.lowerBound])
        }
        return text
    }

    /// Extract mascot name for compact display (e.g. "Trail Blazers +2.0" from "Portland Trail Blazers +2.0")
    private func mascotName(_ pickText: String) -> String {
        // Handle ML picks: strip "ML" suffix, get mascot, then append "ML"
        var mlSuffix = ""
        var cleaned = pickText
        if cleaned.hasSuffix(" ML") {
            mlSuffix = " ML"
            cleaned = String(cleaned.dropLast(3))
        }

        // Remove spread/line suffix like "+2.0", "-5.5", "+1.5"
        let spreadPattern = #"\s+[+-]\d+(?:\.\d+)?$"#
        if let regex = try? NSRegularExpression(pattern: spreadPattern),
           let match = regex.firstMatch(in: cleaned, range: NSRange(cleaned.startIndex..., in: cleaned)),
           let range = Range(match.range, in: cleaned) {
            cleaned = String(cleaned[cleaned.startIndex..<range.lowerBound])
        }

        // Two-word mascots that must stay together
        let twoWordMascots = [
            "Trail Blazers", "Blue Devils", "Blue Jays", "Red Sox", "White Sox",
            "Blue Jackets", "Maple Leafs", "Red Wings", "Golden Knights",
            "Black Hawks", "Timber Wolves", "Yellow Jackets", "Red Raiders",
            "Horned Frogs", "Sun Devils", "Golden Bears", "Nittany Lions",
            "Crimson Tide", "Fighting Irish", "Scarlet Knights", "Mean Green",
            "Golden Gophers", "Demon Deacons", "Orange Men", "Tar Heels",
            "Mountain Hawks", "Wild Cats", "Golden Eagles", "Screaming Eagles",
            "Black Bears", "Sea Hawks"
        ]

        for mascot in twoWordMascots {
            if cleaned.hasSuffix(mascot) {
                return mascot + mlSuffix
            }
        }

        // Default: use last word as mascot
        let words = cleaned.split(separator: " ")
        if words.count > 1 {
            return String(words.last!) + mlSuffix
        }
        return cleaned + mlSuffix
    }

    private func gameCardView(_ result: GameResult) -> some View {
        let sport = Sport.from(league: result.effectiveLeague)
        let isWon = result.result == "won"
        let isPush = result.result == "push"
        let resultLetter = isWon ? "W" : (isPush ? "P" : "L")
        let resultColor = isWon ? positiveColor : (isPush ? GaryColors.gold : negativeColor)
        let hasGradient = sport.accentGradient != nil
        let fullPickText = pickWithoutOdds(result.pick_text ?? result.matchup ?? "Pick")
        // Extract spread suffix if present, then build "Mascot +2.0"
        let spreadSuffix: String = {
            let pattern = #"\s+([+-]\d+(?:\.\d+)?)$"#
            if let regex = try? NSRegularExpression(pattern: pattern),
               let match = regex.firstMatch(in: fullPickText, range: NSRange(fullPickText.startIndex..., in: fullPickText)),
               let range = Range(match.range(at: 1), in: fullPickText) {
                return " " + String(fullPickText[range])
            }
            return ""
        }()
        let pickText = mascotName(fullPickText) + spreadSuffix

        let oddsStr: String = {
            let fromField = Formatters.americanOdds(result.odds?.value)
            if !fromField.isEmpty { return fromField }
            if let pt = result.pick_text {
                let pattern = #"([+-]\d{3,})$"#
                if let regex = try? NSRegularExpression(pattern: pattern),
                   let match = regex.firstMatch(in: pt, range: NSRange(pt.startIndex..., in: pt)),
                   let range = Range(match.range(at: 1), in: pt) {
                    return String(pt[range])
                }
            }
            return "-110"
        }()

        return VStack(alignment: .leading, spacing: 2) {
            // Row 1: Sport badge + date + odds (right)
            HStack(spacing: 0) {
                Text(sport.rawValue)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(sport.accentColor)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(sport.accentColor.opacity(0.12))
                    )
                Text(Formatters.formatDate(result.game_date))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.3))
                    .padding(.leading, 5)
                Spacer()
                Text(oddsStr)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(GaryColors.gold.opacity(0.6))
                    .monospacedDigit()
            }

            // Row 2: Pick text + W/L centered
            HStack(spacing: 0) {
                Text(pickText)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                Text(resultLetter)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(resultColor)
            }

            // Row 3: Final Score
            if let score = result.final_score, !score.isEmpty {
                Text("Final Score: \(score)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(GaryColors.gold)
                    .monospacedDigit()
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(width: 170)
        .background(
            goldGlassCard()
        )
    }

    private func propCardView(_ result: PropResult) -> some View {
        let sport = Sport.from(league: result.effectiveLeague)
        let isWon = result.result == "won"
        let isPush = result.result == "push"
        let resultLetter = isWon ? "W" : (isPush ? "P" : "L")
        let resultColor = isWon ? positiveColor : (isPush ? GaryColors.gold : negativeColor)
        let hasGradient = sport.accentGradient != nil

        let propOddsStr: String = {
            let fromField = Formatters.americanOdds(result.odds?.value)
            return fromField.isEmpty ? "-110" : fromField
        }()

        return VStack(alignment: .leading, spacing: 2) {
            // Row 1: Sport badge + date + odds (right)
            HStack(spacing: 0) {
                Text(sport.rawValue)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(sport.accentColor)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(sport.accentColor.opacity(0.12))
                    )
                Text(Formatters.formatDate(result.game_date))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.3))
                    .padding(.leading, 5)
                Spacer()
                Text(propOddsStr)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(GaryColors.gold.opacity(0.6))
                    .monospacedDigit()
            }

            // Row 2: Prop title + W/L
            HStack(spacing: 0) {
                Text(Formatters.propResultTitle(result))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                Text(resultLetter)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(resultColor)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(width: 170)
        .background(
            goldGlassCard()
        )
    }

    private var emptyCarousel: some View {
        Text(selectedSport == .all ? "No results yet" : "No \(selectedSport.rawValue) results")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.white.opacity(0.25))
            .frame(maxWidth: .infinity, minHeight: 80)
    }

    // MARK: - Loading / Error

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView().tint(GaryColors.gold)
            Text("Loading...")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.35))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private func errorState(error: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 20))
                .foregroundStyle(.white.opacity(0.25))
            Text(error)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.4))
            Button {
                Task { await loadData() }
            } label: {
                Text("Retry")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 7)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(GaryColors.gold)
                    )
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 50)
    }

    // MARK: - Data Loading

    private func loadData(forceRefresh: Bool = false) async {
        await MainActor.run {
            if settledCount == 0 { loading = true }
            error = nil
        }
        do {
            let (games, props, picks) = try await withTimeout(seconds: 30) {
                async let g = SupabaseAPI.fetchAllGameResults(since: nil, forceRefresh: forceRefresh, billfold: true)
                async let p = SupabaseAPI.fetchPropResults(since: nil, forceRefresh: forceRefresh, billfold: true)
                async let d = SupabaseAPI.fetchAllDailyPicksRaw(forceRefresh: forceRefresh, billfold: true)
                return try await (g, p, d)
            }
            await MainActor.run {
                gameResults = games
                propResults = props
                dailyPickRows = picks
                lastRefresh = Date()
                recomputeCache()
            }
        } catch {
            await MainActor.run { self.error = "Failed to load data" }
        }
        await MainActor.run { loading = false }
    }

    // MARK: - Helpers

    private func calculateRecord() -> (wins: Int, losses: Int, pushes: Int) {
        let results = selectedTab == 0
            ? filteredGameResults.map { $0.result ?? "" }
            : filteredPropResults.map { $0.result ?? "" }
        return results.reduce(into: (wins: 0, losses: 0, pushes: 0)) { acc, result in
            switch result {
            case "won": acc.wins += 1
            case "lost": acc.losses += 1
            case "push": acc.pushes += 1
            default: break
            }
        }
    }

    private func isLegitPropResult(_ result: PropResult) -> Bool {
        let hasPlayer = !(result.player_name?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasPropType = !(result.prop_type?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasBet = !(result.bet?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasLine = !(result.line_value?.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return hasPlayer || hasPropType || hasBet || hasLine
    }

    private func billfoldDate(from iso: String?) -> Date {
        billfoldParseDate(iso ?? "") ?? Date.distantPast
    }

    /// Parse date string — handles both ISO8601 (with T) and plain YYYY-MM-DD
    private func billfoldParseDate(_ string: String) -> Date? {
        if let d = parseISO8601(string) { return d }
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone(identifier: "America/New_York")
        return df.date(from: string)
    }

    private func parseAmericanOdds(_ string: String?) -> Int? {
        guard let cleaned = string?.replacingOccurrences(of: "+", with: "").trimmingCharacters(in: .whitespacesAndNewlines),
              let value = Int(cleaned),
              value != 0 else { return nil }
        return value
    }

    private func units(for result: String?, odds: String?) -> Double {
        switch result {
        case "won":
            guard let american = parseAmericanOdds(odds) else { return 0.9 }
            if american > 0 {
                return Double(american) / 100.0
            }
            return 100.0 / Double(abs(american))
        case "lost":
            return -1
        case "push":
            return 0
        default:
            return 0
        }
    }

    private func signedUnits(_ value: Double) -> String {
        let rounded = String(format: "%.1f", abs(value))
        return value >= 0 ? "+\(rounded)" : "-\(rounded)"
    }

    private func dailyTrend(items: [(String?, Double)]) -> [BillfoldTrendPoint] {
        let grouped = Dictionary(grouping: items.compactMap { item -> (Date, Double)? in
            guard let iso = item.0, let parsed = billfoldParseDate(iso) else { return nil }
            return (Calendar.current.startOfDay(for: parsed), item.1)
        }) { $0.0 }

        var running = 0.0
        return grouped.keys.sorted().map { date in
            let total = grouped[date]?.reduce(0.0) { $0 + $1.1 } ?? 0
            running += total
            return BillfoldTrendPoint(
                date: date,
                label: Formatters.formatDate(isoFormatterNoFrac.string(from: date)),
                units: total,
                cumulative: running
            )
        }
    }

    private func groupedSportPerformance(from rows: [(String?, String?, String?)]) -> [BillfoldSportPoint] {
        Dictionary(grouping: rows) { $0.0 ?? "Other" }
            .map { sport, values in
                BillfoldSportPoint(
                    sport: sport,
                    netUnits: values.reduce(0.0) { $0 + units(for: $1.1, odds: $1.2) },
                    winRate: billfoldWinRate(from: values.map { $0.1 }),
                    settledCount: values.filter { ["won", "lost", "push"].contains($0.1 ?? "") }.count
                )
            }
            .sorted { $0.netUnits > $1.netUnits }
    }

    private func billfoldWinRate(from results: [String?]) -> Double {
        let wins = results.filter { $0 == "won" }.count
        let losses = results.filter { $0 == "lost" }.count
        let decisive = max(1, wins + losses)
        return (Double(wins) / Double(decisive)) * 100
    }

    private func sinceDate(for timeframe: String) -> String? {
        sinceDateValue(for: timeframe).map { formatISO($0) }
    }

    private func sinceDateValue(for timeframe: String) -> Date? {
        let cal = Calendar.current
        let now = Date()
        switch timeframe {
        case "7d": return cal.date(byAdding: .day, value: -7, to: now)
        case "30d": return cal.date(byAdding: .day, value: -30, to: now)
        case "90d": return cal.date(byAdding: .day, value: -90, to: now)
        case "ytd": return cal.date(from: DateComponents(year: cal.component(.year, from: now), month: 1, day: 1))
        default: return nil
        }
    }

    private func formatISO(_ date: Date) -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone(identifier: "America/New_York")
        return df.string(from: date)
    }

}

private struct BillfoldTrendPoint: Identifiable {
    let id = UUID()
    let date: Date
    let label: String
    let units: Double
    let cumulative: Double
}

private struct BillfoldSportPoint: Identifiable {
    let id = UUID()
    let sport: String
    let netUnits: Double
    let winRate: Double
    let settledCount: Int
}

private struct BillfoldMarketPoint: Identifiable {
    let id = UUID()
    let bucket: String
    let netUnits: Double
    let wins: Int
    let losses: Int
    let pushes: Int
}

// MARK: - BetCard View

struct BetCardView: View {
    private static let fallbackURL = URL(string: "https://betwithgary.ai/")!

    var body: some View {
        ZStack {
            LiquidGlassBackground()

            WebContainer(url: URL(string: "https://www.betwithgary.ai/betcard") ?? Self.fallbackURL)
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
                .foregroundStyle(GaryColors.gold)
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
                            .foregroundStyle(GaryColors.gold)
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
    var gameResult: String? = nil // "won", "lost", "push" — nil for live/upcoming picks
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

    /// Check if this is an NCAAB game
    private var isNCAAB: Bool {
        (pick.league ?? "").uppercased() == "NCAAB"
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
        // NOTE: sportsbook_odds.spread is stored from the PICKED team's perspective
        // (backend formatOddsForStorage selects spread_home or spread_away based on pick)
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
                    // firstSpread is already from picked team's perspective — use directly
                    let correctSpread = firstSpread
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
        
        // For NCAAF/NCAAB, show FULL team name (auto-scaling font handles length)
        // splitPickAndOdds may have stripped city names or truncated — rebuild from original
        if league == "NCAAF" || league == "NCAAB" {
            let raw = pick.pick ?? ""
            // Extract American odds (3+ digits) from end of raw pick text
            let oddsPattern = #"^(.+?)\s+([-+]\d{3,}\.?\d*)$"#
            var fullPick = raw
            var odds = parts.1 // keep odds from splitPickAndOdds as fallback
            if let regex = try? NSRegularExpression(pattern: oddsPattern),
               let match = regex.firstMatch(in: raw, range: NSRange(raw.startIndex..., in: raw)),
               let pickRange = Range(match.range(at: 1), in: raw),
               let oddsRange = Range(match.range(at: 2), in: raw) {
                fullPick = String(raw[pickRange]).trimmingCharacters(in: .whitespaces)
                odds = String(raw[oddsRange])
            }

            // Apply spread sign fix from sportsbook odds (picked team perspective)
            if let type = pick.type, type == "spread",
               let books = pick.sportsbook_odds, let firstSpread = books.compactMap({ $0.spread }).first {
                let spreadPattern2 = #"([+-]?)(\d{1,2}\.?\d*)\s*$"#
                if let regex = try? NSRegularExpression(pattern: spreadPattern2),
                   let match = regex.firstMatch(in: fullPick, range: NSRange(fullPick.startIndex..., in: fullPick)),
                   let signRange = Range(match.range(at: 1), in: fullPick) {
                    let sign = String(fullPick[signRange])
                    let correctSign = firstSpread >= 0 ? "+" : "-"
                    if sign.isEmpty || sign != correctSign {
                        let correctNum = abs(firstSpread)
                        let replacement = "\(correctSign)\(correctNum.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(correctNum)) : String(correctNum))"
                        let fullRange = match.range(at: 0)
                        if let swiftRange = Range(fullRange, in: fullPick) {
                            fullPick = fullPick.replacingCharacters(in: swiftRange, with: replacement)
                        }
                    }
                }
            }

            return (fullPick, odds)
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
        // WBC / International tournaments
        if sig.contains("wbc") || sig.contains("world baseball") { return "globe.americas.fill" }
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
                // Away team with optional CFP seed or NCAAB AP ranking
                HStack(spacing: 4) {
                    if isCFP, let awaySeed = pick.awaySeed {
                        Text("#\(awaySeed)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(GaryColors.gold)
                    } else if isNCAAB, let awayRank = pick.awayRanking {
                        Text("#\(awayRank)")
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

                // Home team with optional CFP seed or NCAAB AP ranking
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
                    } else if isNCAAB, let homeRank = pick.homeRanking {
                        Text("#\(homeRank)")
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
                                // MLB/WBC: multi-country flag gradient border
                                Sport.from(league: pick.league).accentGradient ??
                                LinearGradient(
                                    colors: [accentColor.opacity(0.6), accentColor.opacity(0.2)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: Sport.from(league: pick.league).accentGradient != nil ? 2.5 : 2
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
                            .stroke(
                                Sport.from(league: pick.league).accentGradient ??
                                LinearGradient(colors: [accentColor.opacity(0.4)], startPoint: .top, endPoint: .bottom),
                                lineWidth: Sport.from(league: pick.league).accentGradient != nil ? 2 : 1.5
                            )
                    )
                    .shadow(color: .black.opacity(0.2), radius: 6, y: 4)
            }
        }
        .modifier(PerformanceOptimizer()) // Applies drawingGroup only on older iOS
        .overlay(alignment: .center) {
            // Result stamp overlay for yesterday's picks
            if let result = gameResult?.lowercased(), !result.isEmpty {
                ResultStampOverlay(result: result)
                    .offset(y: -50)
            }
        }
        .opacity(gameResult != nil ? 0.75 : 1.0)
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = pressing
            }
        }, perform: {})
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(pick.league ?? "") pick: \(pick.homeTeam ?? "") vs \(pick.awayTeam ?? ""). \(pick.pick ?? "")")
    }
}

/// 3D metallic emblem overlay for yesterday's pick results
struct ResultStampOverlay: View {
    let result: String

    private var stampText: String {
        switch result {
        case "won": return "WON"
        case "push": return "PUSH"
        default: return "LOST"
        }
    }

    private var stampColor: Color {
        switch result {
        case "won": return GaryColors.gold
        case "push": return .yellow
        default: return Color(hex: "#4A4A4C")
        }
    }

    var body: some View {
        Text(stampText)
            .font(.system(size: 52, weight: .black))
            .tracking(6)
            .foregroundStyle(stampColor)
            .padding(.horizontal, 24)
            .padding(.vertical, 8)
            .frame(minWidth: 200)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(stampColor, lineWidth: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(stampColor, lineWidth: 1.5)
                    .padding(5)
            )
            .rotationEffect(.degrees(-18))
            .opacity(0.85)
            .allowsHitTesting(false)
    }
}

// MARK: - Pick Text Helper (shared spread-sign fix)

extension GaryPick {
    /// Formatted pick text with spread sign correction from sportsbook odds
    var formattedPickParts: (pick: String, odds: String) {
        var parts = Formatters.splitPickAndOdds(self.pick)
        // Spread sign fix using sportsbook odds (picked team perspective)
        if let pickType = self.type, pickType == "spread",
           let books = self.sportsbook_odds, let firstSpread = books.compactMap({ $0.spread }).first {
            var text = parts.0
            if let regex = try? NSRegularExpression(pattern: #"([+-]?)(\d{1,2}\.?\d*)\s*$"#),
               let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
               let signRange = Range(match.range(at: 1), in: text),
               let fullRange = Range(match.range(at: 0), in: text) {
                let sign = String(text[signRange])
                let correctSign = firstSpread >= 0 ? "+" : "-"
                if sign.isEmpty || sign != correctSign {
                    let num = abs(firstSpread)
                    let s = num.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(num)) : String(num)
                    text = text.replacingCharacters(in: fullRange, with: "\(correctSign)\(s)")
                    parts = (text, parts.1)
                }
            }
        }
        return parts
    }
}

// MARK: - Compact Pick Row (Scoreboard-style)

struct CompactPickRow: View {
    let pick: GaryPick
    var gameResult: String? = nil
    var showSportBadge: Bool = false

    private var sport: Sport { Sport.from(league: pick.league) }
    private var accentColor: Color { sport.accentColor }
    private var accentGradient: LinearGradient {
        sport.accentGradient
            ?? LinearGradient(colors: [accentColor, accentColor], startPoint: .leading, endPoint: .trailing)
    }
    private var hasCustomGradient: Bool { sport.accentGradient != nil }
    private var awayName: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeName: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var isNCAAB: Bool { (pick.league ?? "").uppercased() == "NCAAB" }
    private var isCFP: Bool { pick.isCFP }
    private var pickParts: (pick: String, odds: String) { pick.formattedPickParts }
    private var confidenceValue: CGFloat {
        CGFloat(max(0.18, min(1.0, pick.confidence ?? 0.72)))
    }
    private var resolvedResult: String? {
        guard let result = gameResult?.lowercased(), !result.isEmpty else { return nil }
        return result
    }
    private var resultStampText: String {
        switch resolvedResult {
        case "won": return "W"
        case "push": return "P"
        case "lost": return "L"
        default: return "L"
        }
    }
    private var resultStampColor: Color {
        switch resolvedResult {
        case "won": return GaryColors.gold
        case "push": return Color.yellow
        case "lost": return Color(hex: "#6A6A70")
        default: return Color(hex: "#6A6A70")
        }
    }
    private var resultStampTextOpacity: Double {
        switch resolvedResult {
        case "lost": return 1.0
        case "won": return 0.85
        case "push": return 0.9
        default: return 0.85
        }
    }
    private var resultStampRingOpacity: Double {
        switch resolvedResult {
        case "lost": return 0.94
        case "won": return 0.79
        case "push": return 0.84
        default: return 0.79
        }
    }
    private var resultStampShadowOpacity: Double {
        switch resolvedResult {
        case "lost": return 0.34
        case "won": return 0.25
        case "push": return 0.28
        default: return 0.25
        }
    }

    private var significanceTag: String? {
        if let sig = pick.gameSignificance, !sig.isEmpty, sig.count < 32 {
            return sig.uppercased()
        }
        if let ctx = pick.tournamentContext, !ctx.isEmpty, ctx.count < 28 {
            return ctx.uppercased()
        }
        return nil
    }

    private var formattedTime: String {
        guard let time = pick.displayTime else { return "" }
        return Formatters.formatCommenceTime(time)
    }

    private static let bookDisplayNames: [String: String] = [
        "draftkings": "DraftKings",
        "fanduel": "FanDuel",
        "betmgm": "BetMGM",
        "betrivers": "BetRivers",
        "caesars": "Caesars",
        "fanatics": "Fanatics",
        "pointsbet": "PointsBet",
        "bovada": "Bovada",
    ]

    private var bestBookName: String? {
        guard let books = pick.sportsbook_odds, let first = books.first, let name = first.book, !name.isEmpty else { return nil }
        return Self.bookDisplayNames[name.lowercased()] ?? name.prefix(1).uppercased() + name.dropFirst()
    }

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    if let significance = significanceTag {
                        tag(text: significance, tint: GaryColors.gold, icon: "sparkles")
                    }

                    Spacer(minLength: 0)

                    if !formattedTime.isEmpty {
                        timeTag(text: formattedTime)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 5)

                HStack(alignment: .center, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 3) {
                            if isNCAAB, let rank = pick.awayRanking {
                                Text("#\(rank)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                            } else if isCFP, let seed = pick.awaySeed {
                                Text("#\(seed)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                            }

                            Text(awayName)
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.96))
                                .lineLimit(1)
                        }

                        HStack(spacing: 3) {
                            if isNCAAB, let rank = pick.homeRanking {
                                Text("#\(rank)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                            } else if isCFP, let seed = pick.homeSeed {
                                Text("#\(seed)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                            }

                            Text(homeName)
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.96))
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 8)

                    VStack(alignment: .trailing, spacing: 3) {
                        HStack(spacing: 5) {
                            Text(pickParts.pick)
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(GaryColors.gold)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)

                            Image(systemName: "chevron.right")
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.14))
                        }

                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 8)

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Gary's Confidence")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(GaryColors.gold.opacity(0.7))

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                                    .fill(Color(hex: "#1A1A1E"))
                                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                                    .fill(accentGradient)
                                    .frame(width: geo.size.width * confidenceValue)
                            }
                        }
                        .frame(height: 2)
                    }

                    Spacer(minLength: 8)

                    if let venue = pick.venue, !venue.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(size: 11))
                            Text(venue)
                                .font(.system(size: 12, weight: .medium))
                                .lineLimit(1)
                        }
                        .foregroundStyle(.white.opacity(0.42))
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 6)
                .padding(.bottom, 6)
            }
            .opacity(gameResult != nil ? 0.72 : 1.0)

            if resolvedResult != nil {
                Text(resultStampText)
                    .font(.system(size: 29, weight: .black, design: .default))
                    .fontWidth(.compressed)
                    .tracking(0.5)
                    .foregroundStyle(resultStampColor.opacity(resultStampTextOpacity))
                    .frame(width: 62, height: 62)
                    .background(
                        Circle()
                            .fill(Color.black.opacity(0.64))
                            .overlay(
                                Circle()
                                    .stroke(resultStampColor.opacity(resultStampRingOpacity), lineWidth: 1.8)
                            )
                    )
                    .shadow(color: resultStampColor.opacity(resultStampShadowOpacity), radius: 6, y: 0)
                    .rotationEffect(.degrees(-10))
            }
        }
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(hex: "#141210"))
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(GaryColors.gold.opacity(0.035))
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8)
            }
        )
        .shadow(color: accentColor.opacity(0.14), radius: 5, y: 2)
        .shadow(color: GaryColors.gold.opacity(0.16), radius: 6, y: 0)
    }

    private func tag(text: String, tint: Color, icon: String) -> some View {
        HStack(spacing: 3.5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
            Text(text)
                .font(.system(size: 12, weight: .bold))
                .lineLimit(1)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 7)
        .padding(.vertical, 3.5)
    }

    private func timeTag(text: String) -> some View {
        Text(text)
            .font(.system(size: 13.5, weight: .semibold))
            .lineLimit(1)
        .foregroundStyle(.white.opacity(0.63))
        .padding(.horizontal, 7)
        .padding(.vertical, 3.5)
    }
}

// MARK: - Floating Pick Detail Popup

struct PickDetailPopup: View {
    let pick: GaryPick
    var gameResult: String? = nil
    let onDismiss: () -> Void

    @State private var showSportsbookOdds = false

    private var sport: Sport { Sport.from(league: pick.league) }
    private var accentColor: Color { sport.accentColor }
    private var accentGradient: LinearGradient? { sport.accentGradient }
    private var awayName: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeName: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var isNCAAB: Bool { (pick.league ?? "").uppercased() == "NCAAB" }

    private var garyPickedHome: Bool {
        guard let pickText = pick.pick?.lowercased() else { return true }
        let homeLower = (pick.homeTeam ?? "").lowercased()
        let homeShort = Formatters.shortTeamName(pick.homeTeam, league: pick.league).lowercased()
        return pickText.contains(homeLower) || pickText.contains(homeShort)
    }

    private var narrative: String {
        guard let rationale = pick.rationale else { return "" }
        if let range = rationale.range(of: "Gary's Take", options: .caseInsensitive) {
            return String(rationale[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let range = rationale.range(of: "\n\n", options: .backwards) {
            return String(rationale[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return rationale
    }

    var body: some View {
        ZStack {
            // Dimmed backdrop
            Color.black.opacity(0.95)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { onDismiss() }
                }

            // Floating card
            VStack(spacing: 0) {
                // Header bar
                HStack {
                    HStack(spacing: 8) {
                        Text(pick.league?.uppercased() ?? "")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(0.5)
                            .foregroundStyle(accentColor)
                        if let sig = pick.gameSignificance, !sig.isEmpty, sig.count < 30 {
                            Text(sig)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                    }
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { onDismiss() }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white.opacity(0.5))
                            .padding(8)
                            .background(Circle().fill(.white.opacity(0.08)))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 10)

                // Thin accent line
                Rectangle()
                    .fill(accentColor.opacity(0.3))
                    .frame(height: 0.5)
                    .padding(.horizontal, 16)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 10) {
                        // Summary card
                        VStack(alignment: .leading, spacing: 16) {
                            VStack(spacing: 6) {
                                HStack(spacing: 0) {
                                    HStack(spacing: 3) {
                                        if isNCAAB, let rank = pick.awayRanking {
                                            Text("#\(rank)").font(.system(size: 11, weight: .bold)).foregroundStyle(GaryColors.gold)
                                        }
                                        Text(awayName)
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundStyle(.white)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.7)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                    Text(pick.isNeutralSite == true ? "vs" : "@")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.white.opacity(0.25))
                                        .frame(width: 30)

                                    HStack(spacing: 3) {
                                        Text(homeName)
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundStyle(.white)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.7)
                                        if isNCAAB, let rank = pick.homeRanking {
                                            Text("#\(rank)").font(.system(size: 11, weight: .bold)).foregroundStyle(GaryColors.gold)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                }

                                HStack(spacing: 12) {
                                    if let venue = pick.venue, !venue.isEmpty {
                                        HStack(spacing: 3) {
                                            Image(systemName: "mappin.circle.fill").font(.system(size: 10))
                                            Text(venue).font(.system(size: 10, weight: .medium))
                                        }
                                        .foregroundStyle(accentColor.opacity(0.78))
                                    }
                                    if let time = pick.displayTime {
                                        Text(Formatters.formatCommenceTime(time))
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.42))
                                    }
                                }
                            }

                            Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5)

                            VStack(alignment: .leading, spacing: 10) {
                                Text("GARY'S PICK")
                                    .font(.system(size: 9, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(.white.opacity(0.34))

                                HStack(alignment: .bottom) {
                                    Text(pick.formattedPickParts.pick)
                                        .font(.system(size: 24, weight: .heavy))
                                        .foregroundStyle(GaryColors.gold)
                                        .lineLimit(2)
                                        .minimumScaleFactor(0.6)

                                    Spacer()

                                    if !pick.formattedPickParts.odds.isEmpty {
                                        Text(pick.formattedPickParts.odds)
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(.white.opacity(0.72))
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(
                                                RoundedRectangle(cornerRadius: 8)
                                                    .fill(Color.white.opacity(0.06))
                                                    .overlay(
                                                        RoundedRectangle(cornerRadius: 8)
                                                            .stroke(Color.white.opacity(0.08), lineWidth: 0.8)
                                                    )
                                            )
                                    }
                                }

                                // Confidence
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack {
                                        Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 9))
                                        Text("Confidence").font(.system(size: 9, weight: .medium))
                                        Spacer()
                                    }
                                    .foregroundStyle(.white.opacity(0.3))

                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(accentColor.opacity(0.12))
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(accentColor)
                                                .frame(width: geo.size.width * CGFloat(pick.confidence ?? 0))
                                        }
                                    }
                                    .frame(height: 4)
                                }
                            }

                            // Sportsbook Odds
                            if let odds = pick.sportsbook_odds, !odds.isEmpty {
                                VStack(spacing: 8) {
                                    Button {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                            showSportsbookOdds.toggle()
                                        }
                                    } label: {
                                        HStack(spacing: 6) {
                                            Image(systemName: "chart.bar.doc.horizontal")
                                                .font(.system(size: 10, weight: .semibold))
                                            Text("Sportsbook Odds")
                                                .font(.system(size: 11, weight: .semibold))
                                            Spacer()
                                            Image(systemName: showSportsbookOdds ? "chevron.up" : "chevron.down")
                                                .font(.system(size: 9, weight: .bold))
                                        }
                                        .foregroundStyle(accentColor.opacity(0.8))
                                        .padding(.vertical, 10)
                                        .padding(.horizontal, 12)
                                        .background(
                                            RoundedRectangle(cornerRadius: 10)
                                                .fill(accentColor.opacity(0.08))
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 10)
                                                        .stroke(accentColor.opacity(0.18), lineWidth: 0.8)
                                                )
                                        )
                                    }
                                    .buttonStyle(.plain)

                                    if showSportsbookOdds {
                                        SportsbookOddsTable(odds: odds)
                                            .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .top)))
                                    }
                                }
                            }
                        }
                        .padding(16)
                        .background(
                            ZStack {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color(hex: "#141210"))
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(accentColor.opacity(0.03))
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(accentColor.opacity(0.6), lineWidth: 1.2)
                            }
                        )

                        // Divider
                        Rectangle().fill(GaryColors.gold.opacity(0.06)).frame(height: 0.5)

                        // Tale of Tape
                        if let statsData = pick.statsData, !statsData.isEmpty {
                            TaleOfTapeSection(
                                homeTeam: homeName,
                                awayTeam: awayName,
                                statsData: statsData,
                                injuries: pick.injuries,
                                garyPickedHome: garyPickedHome
                            )
                        }

                        // Gary's Take
                        if !narrative.isEmpty {
                            GaryTakeSection(narrative: narrative, accentColor: accentColor)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 30)
                }
            }
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(hex: "#141210"))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(GaryColors.gold.opacity(0.035))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8)
                }
                    .shadow(color: GaryColors.gold.opacity(0.1), radius: 24, y: 8)
                    .shadow(color: .black.opacity(0.72), radius: 26, y: 12)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .frame(maxHeight: UIScreen.main.bounds.height * 0.74)
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 96)
        }
    }
}

// MARK: - Social Links Bar

struct SocialLinksBar: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("JOIN THE COMMUNITY")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(.white.opacity(0.3))

            HStack(spacing: 16) {
                // X / Twitter
                SocialButton(
                    label: "Follow on X",
                    systemIcon: "bird.fill",
                    url: "twitter://user?screen_name=BetwithGary",
                    fallbackUrl: "https://x.com/BetwithGary"
                )

                // Discord
                SocialButton(
                    label: "Join Discord",
                    systemIcon: "bubble.left.and.bubble.right.fill",
                    url: "https://discord.gg/betwithgary",
                    fallbackUrl: nil
                )
            }
        }
    }
}

struct SocialButton: View {
    let label: String
    let systemIcon: String
    let url: String
    var fallbackUrl: String?

    var body: some View {
        Button {
            if let deepLink = URL(string: url), UIApplication.shared.canOpenURL(deepLink) {
                UIApplication.shared.open(deepLink)
            } else if let fallback = fallbackUrl, let fallbackURL = URL(string: fallback) {
                UIApplication.shared.open(fallbackURL)
            } else if let primary = URL(string: url) {
                UIApplication.shared.open(primary)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: systemIcon)
                    .font(.system(size: 14, weight: .semibold))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(.white.opacity(0.7))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.white.opacity(0.06))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - NCAAB March Madness Marquee Border

struct MarqueeLightsModifier: ViewModifier {
    @State private var phase: CGFloat = 0
    @State private var spotlightAngle: Double = 0

    func body(content: Content) -> some View {
        content
            // Bulb border drawn inset so nothing clips
            .overlay(
                MarqueeBulbBorder(cornerRadius: 20, phase: phase, inset: 6)
                    .allowsHitTesting(false)
            )
            // Sweeping spotlight cones
            .overlay(
                SpotlightSweep(angle: spotlightAngle)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .allowsHitTesting(false)
            )
            .onAppear {
                withAnimation(.linear(duration: 2.0).repeatForever(autoreverses: false)) {
                    phase = 1.0
                }
                withAnimation(.linear(duration: 4.0).repeatForever(autoreverses: false)) {
                    spotlightAngle = 360
                }
            }
    }
}

// MARK: - Spotlight Sweep Animation
struct SpotlightSweep: View {
    let angle: Double

    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height

            // Two spotlights on opposite sides
            let spots: [(Double, UnitPoint)] = [
                (angle, .top),
                (angle + 180, .bottom)
            ]

            for (deg, _) in spots {
                let rad = deg * .pi / 180
                // Spotlight origin orbits the card perimeter
                let cx = w / 2 + cos(rad) * w * 0.45
                let cy = h / 2 + sin(rad) * h * 0.45

                let coneRadius: CGFloat = max(w, h) * 0.5
                let center = CGPoint(x: cx, y: cy)

                context.fill(
                    Circle().path(in: CGRect(
                        x: center.x - coneRadius,
                        y: center.y - coneRadius,
                        width: coneRadius * 2,
                        height: coneRadius * 2
                    )),
                    with: .radialGradient(
                        Gradient(colors: [
                            Color(hex: "#C9A227").opacity(0.10),
                            Color(hex: "#C9A227").opacity(0.04),
                            Color.clear
                        ]),
                        center: center,
                        startRadius: 0,
                        endRadius: coneRadius
                    )
                )
            }
        }
    }
}

struct MarqueeBulbBorder: View {
    let cornerRadius: CGFloat
    let phase: CGFloat
    var inset: CGFloat = 0
    // Bulb diameter — touching side by side
    private let bulbSize: CGFloat = 8.5

    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height
            // Inset the path so bulbs draw fully inside the view bounds
            let iw = w - inset * 2
            let ih = h - inset * 2
            let r = min(cornerRadius, min(iw, ih) / 2)
            let perimeter = MarqueeBulbBorder.perimeterLength(w: iw, h: ih, r: r)
            let count = Int(perimeter / bulbSize)
            let litOffset = Int(phase * CGFloat(count))

            for i in 0..<count {
                let t = CGFloat(i) / CGFloat(count)
                var pos = MarqueeBulbBorder.pointOnRect(t: t, w: iw, h: ih, r: r)
                // Offset from inset space back to full coordinate space
                pos.x += inset
                pos.y += inset

                // Chase pattern: every 3rd bulb is fully lit, others are dim
                let patternIndex = (i + litOffset) % 4
                let isLit = patternIndex == 0 || patternIndex == 1

                // Bulb body (dark gold socket)
                let socketRect = CGRect(x: pos.x - bulbSize / 2, y: pos.y - bulbSize / 2, width: bulbSize, height: bulbSize)
                context.fill(Circle().path(in: socketRect), with: .color(Color(hex: "#8B6914").opacity(0.9)))

                // Inner glass
                let glassSize: CGFloat = bulbSize - 2.5
                let glassRect = CGRect(x: pos.x - glassSize / 2, y: pos.y - glassSize / 2, width: glassSize, height: glassSize)

                if isLit {
                    // Lit bulb: bright warm white-gold center
                    context.fill(Circle().path(in: glassRect), with: .color(Color(hex: "#FFEEBB").opacity(0.95)))
                    // Hot center
                    let hotSize: CGFloat = glassSize * 0.5
                    let hotRect = CGRect(x: pos.x - hotSize / 2, y: pos.y - hotSize / 2, width: hotSize, height: hotSize)
                    context.fill(Circle().path(in: hotRect), with: .color(Color.white.opacity(0.9)))
                    // Glow halo
                    let glowSize: CGFloat = bulbSize * 2.2
                    let glowRect = CGRect(x: pos.x - glowSize / 2, y: pos.y - glowSize / 2, width: glowSize, height: glowSize)
                    context.fill(Circle().path(in: glowRect), with: .color(Color(hex: "#C9A227").opacity(0.2)))
                } else {
                    // Dim bulb: dark amber, glass visible but unlit
                    context.fill(Circle().path(in: glassRect), with: .color(Color(hex: "#6B4A0A").opacity(0.6)))
                    // Faint filament
                    let dotSize: CGFloat = glassSize * 0.3
                    let dotRect = CGRect(x: pos.x - dotSize / 2, y: pos.y - dotSize / 2, width: dotSize, height: dotSize)
                    context.fill(Circle().path(in: dotRect), with: .color(Color(hex: "#C9A227").opacity(0.25)))
                }
            }
        }
        .allowsHitTesting(false)
    }

    static func perimeterLength(w: CGFloat, h: CGFloat, r: CGFloat) -> CGFloat {
        let straightW = w - 2 * r
        let straightH = h - 2 * r
        let cornerArc: CGFloat = .pi / 2 * r
        return 2 * straightW + 2 * straightH + 4 * cornerArc
    }

    static func pointOnRect(t: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat) -> CGPoint {
        let straightW = w - 2 * r
        let straightH = h - 2 * r
        let cornerArc: CGFloat = .pi / 2 * r
        let perimeter = 2 * straightW + 2 * straightH + 4 * cornerArc
        var d = t * perimeter

        if d < straightW { return CGPoint(x: r + d, y: 0) }
        d -= straightW
        if d < cornerArc {
            let a = -CGFloat.pi / 2 + (d / r)
            return CGPoint(x: w - r + r * cos(a), y: r + r * sin(a))
        }
        d -= cornerArc
        if d < straightH { return CGPoint(x: w, y: r + d) }
        d -= straightH
        if d < cornerArc {
            let a = d / r
            return CGPoint(x: w - r + r * cos(a), y: h - r + r * sin(a))
        }
        d -= cornerArc
        if d < straightW { return CGPoint(x: w - r - d, y: h) }
        d -= straightW
        if d < cornerArc {
            let a = CGFloat.pi / 2 + (d / r)
            return CGPoint(x: r + r * cos(a), y: h - r + r * sin(a))
        }
        d -= cornerArc
        if d < straightH { return CGPoint(x: 0, y: h - r - d) }
        d -= straightH
        let a = CGFloat.pi + (d / r)
        return CGPoint(x: r + r * cos(a), y: r + r * sin(a))
    }
}

extension View {
    func marqueeLights() -> some View {
        modifier(MarqueeLightsModifier())
    }
}

struct ConditionalMarquee: ViewModifier {
    let isActive: Bool

    func body(content: Content) -> some View {
        if isActive {
            content.modifier(MarqueeLightsModifier())
        } else {
            content
        }
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

    /// Find the best spread value for the bettor (highest number is always best:
    /// favorites -2.5 > -3.5, underdogs +8.5 > +6.5). Tiebreak by best juice.
    private var bestSpreadBook: String? {
        let valid = odds.compactMap { o -> (String, Double, Int)? in
            guard let book = o.book, let spread = o.spread else { return nil }
            let oddsNum = o.spread_odds.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) } ?? -999
            return (book, spread, oddsNum)
        }
        guard let bestSpread = valid.map({ $0.1 }).max() else { return nil }
        return valid
            .filter { $0.1 == bestSpread }
            .max(by: { $0.2 < $1.2 })?.0
    }

    private static let bookDisplayNames: [String: String] = [
        "draftkings": "DraftKings",
        "fanduel": "FanDuel",
        "betmgm": "BetMGM",
        "betrivers": "BetRivers",
        "caesars": "Caesars",
        "fanatics": "Fanatics",
        "polymarket": "Polymarket",
        "kalshi": "Kalshi",
        "pointsbet": "PointsBet",
        "bovada": "Bovada",
    ]

    private func displayName(for book: String) -> String {
        Self.bookDisplayNames[book.lowercased()] ?? book.prefix(1).uppercased() + book.dropFirst()
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
                    Text(displayName(for: o.book ?? "-"))
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
    var showTimeOnCard: Bool = false
    @State private var showAnalysis = false
    @State private var isPressed = false

    private var accentColor: Color {
        Sport.from(league: prop.effectiveLeague).accentColor
    }

    private let cardFill = Color(hex: "#141210")

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Top row: sport tag + odds
            HStack {
                if let league = prop.effectiveLeague {
                    Text(league.uppercased())
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.5)
                        .foregroundStyle(accentColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(accentColor.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }

                if showTimeOnCard, let time = prop.time, !time.isEmpty {
                    Text(time)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white.opacity(0.4))
                }

                Spacer()

                Text(Formatters.americanOdds(prop.odds))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
            }

            // Divider
            Rectangle()
                .fill(GaryColors.gold.opacity(0.08))
                .frame(height: 0.5)

            // Player / team
            VStack(alignment: .leading, spacing: 3) {
                Text((prop.player ?? prop.team) ?? "")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let team = prop.team, prop.player != nil {
                    Text(team)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.35))
                }
            }

            // Prop line
            Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague))
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white.opacity(0.8))

            // Bet badge + EV
            HStack {
                if let bet = prop.bet {
                    Text(bet.uppercased())
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(bet.lowercased() == "over" ? .green : .red)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background((bet.lowercased() == "over" ? Color.green : Color.red).opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                Spacer()
                if let ev = Formatters.computeEV(confidence: prop.confidence, american: prop.odds) {
                    HStack(spacing: 3) {
                        Text("EV")
                            .foregroundStyle(.white.opacity(0.35))
                        Text(String(format: "+%.1f%%", ev))
                            .foregroundStyle(.green)
                    }
                    .font(.system(size: 11, weight: .bold))
                }
            }

            // Analysis button
            if let analysis = prop.analysis, !analysis.isEmpty {
                Button {
                    showAnalysis.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 11))
                            .foregroundStyle(GaryColors.gold)
                        Text("Analysis")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(GaryColors.gold.opacity(0.06))
                    )
                }
                .sheet(isPresented: $showAnalysis) {
                    PropAnalysisSheet(prop: prop)
                }
            }
        }
        .padding(14)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(cardFill)
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(GaryColors.gold.opacity(0.035))
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8)
            }
        )
        .modifier(PerformanceOptimizer())
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = pressing
            }
        }, perform: {})
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(prop.effectiveLeague ?? "") prop: \(prop.player ?? prop.team ?? ""). \(prop.bet ?? "")")
    }
}

// MARK: - Compact Prop Row (Redesigned)

struct CompactPropRow: View {
    let prop: PropPick
    var gameResult: String? = nil
    var showSportBadge: Bool = false

    private var accentColor: Color { Sport.from(league: prop.effectiveLeague).accentColor }
    private var accentGradient: LinearGradient {
        Sport.from(league: prop.effectiveLeague).accentGradient
            ?? LinearGradient(colors: [accentColor, accentColor], startPoint: .leading, endPoint: .trailing)
    }
    private var confidenceValue: CGFloat {
        CGFloat(max(0.18, min(1.0, prop.confidence ?? 0.72)))
    }
    private var betColor: Color {
        guard let bet = prop.bet?.lowercased() else { return .white }
        return bet == "over" ? .green : .red
    }

    // MARK: - Result Stamp Properties
    private var resolvedResult: String? {
        guard let result = gameResult?.lowercased(), !result.isEmpty else { return nil }
        return result
    }
    private var resultStampText: String {
        switch resolvedResult {
        case "won": return "W"
        case "push": return "P"
        case "lost": return "L"
        default: return "L"
        }
    }
    private var resultStampColor: Color {
        switch resolvedResult {
        case "won": return GaryColors.gold
        case "push": return Color.yellow
        case "lost": return Color(hex: "#6A6A70")
        default: return Color(hex: "#6A6A70")
        }
    }
    private var resultStampTextOpacity: Double {
        switch resolvedResult {
        case "lost": return 1.0
        case "won": return 0.85
        case "push": return 0.9
        default: return 0.85
        }
    }
    private var resultStampRingOpacity: Double {
        switch resolvedResult {
        case "lost": return 0.94
        case "won": return 0.79
        case "push": return 0.84
        default: return 0.79
        }
    }
    private var resultStampShadowOpacity: Double {
        switch resolvedResult {
        case "lost": return 0.34
        case "won": return 0.25
        case "push": return 0.28
        default: return 0.25
        }
    }

    private var formattedTime: String {
        if let isoTime = prop.commence_time, !isoTime.isEmpty,
           let gameDate = parseISO8601(isoTime) {
            return Formatters.dayTimeFormatterEST.string(from: gameDate).replacingOccurrences(of: "^[A-Za-z]+ ", with: "", options: .regularExpression) // just time
        }
        if let time = prop.time, !time.isEmpty, time != "TBD" { return time }
        return ""
    }

    private var leagueTag: String? {
        guard showSportBadge, let league = prop.effectiveLeague, !league.isEmpty else { return nil }
        return league.uppercased()
    }

    private var leagueIcon: String {
        switch (prop.effectiveLeague ?? "").uppercased() {
        case "NBA", "NCAAB", "WNBA": return "basketball.fill"
        case "NFL", "NCAAF", "NFL TDS": return "football.fill"
        case "NHL": return "hockey.puck.fill"
        case "WBC", "MLB": return "baseball.fill"
        case "EPL": return "soccerball"
        default: return "sportscourt.fill"
        }
    }

    private let cardFill = Color(hex: "#141210")

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 0) {
                // Top row: sport tag + time
                HStack(spacing: 6) {
                    if let league = leagueTag {
                        Text(league)
                            .font(.system(size: 9, weight: .bold))
                            .tracking(0.5)
                            .foregroundStyle(accentColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(accentColor.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    }

                    Spacer(minLength: 0)

                    if !formattedTime.isEmpty {
                        Text(formattedTime)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.white.opacity(0.35))
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 8)

                // Player + prop line
                HStack(alignment: .center, spacing: 8) {
                    Text(prop.player ?? prop.team ?? "")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)

                    Spacer(minLength: 8)

                    Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague))
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }
                .padding(.horizontal, 10)
                .padding(.top, 6)

                // Bottom row: team + odds + bet
                HStack {
                    if let team = prop.team, !team.isEmpty {
                        Text(team)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.35))
                            .lineLimit(1)
                    }

                    Spacer(minLength: 4)

                    HStack(spacing: 5) {
                        Text(Formatters.americanOdds(prop.odds))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(GaryColors.gold.opacity(0.7))

                        if let bet = prop.bet {
                            Text(bet.uppercased())
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(betColor)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(betColor.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 6)

                // Confidence bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(GaryColors.gold.opacity(0.08))
                        Capsule()
                            .fill(accentColor.opacity(0.5))
                            .frame(width: geo.size.width * confidenceValue)
                    }
                }
                .frame(height: 2)
                .padding(.horizontal, 10)
                .padding(.top, 6)
                .padding(.bottom, 8)
            }
            .opacity(gameResult != nil ? 0.72 : 1.0)

            if resolvedResult != nil {
                Text(resultStampText)
                    .font(.system(size: 29, weight: .black, design: .default))
                    .fontWidth(.compressed)
                    .tracking(0.5)
                    .foregroundStyle(resultStampColor.opacity(resultStampTextOpacity))
                    .frame(width: 62, height: 62)
                    .background(
                        Circle()
                            .fill(Color.black.opacity(0.64))
                            .overlay(
                                Circle()
                                    .stroke(resultStampColor.opacity(resultStampRingOpacity), lineWidth: 1.8)
                            )
                    )
                    .shadow(color: resultStampColor.opacity(resultStampShadowOpacity), radius: 6, y: 0)
                    .rotationEffect(.degrees(-10))
            }
        }
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(cardFill)
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(GaryColors.gold.opacity(0.035))
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8)
            }
        )
    }
}

// MARK: - Floating Prop Detail Popup

struct PropDetailPopup: View {
    let prop: PropPick
    let onDismiss: () -> Void

    private var accentColor: Color {
        if prop.isTDPick {
            return prop.tdCategory == "underdog" ? Color(hex: "#22C55E") : Color(hex: "#3B82F6")
        }
        return Sport.from(league: prop.effectiveLeague).accentColor
    }

    private var betColor: Color {
        guard let bet = prop.bet?.lowercased() else { return .white }
        return bet == "over" ? .green : .red
    }

    private var categoryLabel: String? {
        guard let cat = prop.tdCategory else { return nil }
        switch cat {
        case "standard": return "Regular Pick"
        case "underdog": return "Value Pick (+200+)"
        case "first_td": return "First TD"
        default: return nil
        }
    }

    /// Clean prop analysis text into paragraphs
    private func cleanAnalysis(_ text: String) -> [String] {
        var cleaned = text
        let labelsToRemove = ["HYPOTHESIS:", "EVIDENCE:", "CONVERGENCE", "IF WRONG:", "THE EDGE:", "THE VERDICT:", "RISK:"]
        for label in labelsToRemove {
            if let range = cleaned.range(of: label, options: .caseInsensitive) {
                let afterLabel = cleaned[range.upperBound...]
                if afterLabel.hasPrefix(" (") || afterLabel.hasPrefix("(") {
                    if let closeRange = afterLabel.range(of: "):") {
                        cleaned.removeSubrange(range.lowerBound...closeRange.upperBound)
                    } else if let closeRange = afterLabel.range(of: ")") {
                        cleaned.removeSubrange(range.lowerBound...closeRange.upperBound)
                    } else {
                        cleaned.removeSubrange(range)
                    }
                } else {
                    cleaned.removeSubrange(range)
                }
            }
        }
        return cleaned.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { para in
                var p = para
                if let first = p.first, first.isLowercase { p = p.prefix(1).uppercased() + p.dropFirst() }
                return p
            }
    }

    var body: some View {
        ZStack {
            // Dimmed backdrop
            Color.black.opacity(0.95)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { onDismiss() }
                }

            // Floating card
            VStack(spacing: 0) {
                // Header bar
                HStack {
                    HStack(spacing: 8) {
                        if let league = prop.effectiveLeague {
                            Text(league)
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(0.5)
                                .foregroundStyle(accentColor)
                        }
                        if let category = categoryLabel {
                            Text(category)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                    }
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { onDismiss() }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white.opacity(0.5))
                            .padding(8)
                            .background(Circle().fill(.white.opacity(0.08)))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 10)

                // Thin accent line
                Rectangle()
                    .fill(accentColor.opacity(0.3))
                    .frame(height: 0.5)
                    .padding(.horizontal, 16)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 16) {
                            // Player info
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(prop.player ?? "Unknown")
                                            .font(.system(size: 22, weight: .bold))
                                            .foregroundStyle(.white)

                                        if let team = prop.team {
                                            Text(team)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.5))
                                        }
                                    }

                                    Spacer()

                                    Text(Formatters.americanOdds(prop.odds))
                                        .font(.system(size: 22, weight: .bold))
                                        .foregroundStyle(accentColor)
                                }

                                if let matchup = prop.matchup {
                                    HStack(spacing: 3) {
                                        Image(systemName: "sportscourt.fill").font(.system(size: 9))
                                        Text(matchup).font(.system(size: 10, weight: .medium))
                                    }
                                    .foregroundStyle(accentColor.opacity(0.75))
                                }

                                if let time = prop.time, !time.isEmpty, time != "TBD" {
                                    Text(time)
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.42))
                                }
                            }

                            Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5)

                            // Gary's Pick
                            VStack(alignment: .leading, spacing: 10) {
                                Text("GARY'S PICK")
                                    .font(.system(size: 11, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(GaryColors.gold)

                                HStack(spacing: 10) {
                                    Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague))
                                        .font(.system(size: 18, weight: .heavy))
                                        .foregroundStyle(GaryColors.gold)
                                        .lineLimit(2)
                                        .minimumScaleFactor(0.6)

                                    if let bet = prop.bet {
                                        Text(bet.uppercased())
                                            .font(.system(size: 13, weight: .heavy))
                                            .foregroundStyle(betColor)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 5)
                                            .background(betColor.opacity(0.12))
                                            .clipShape(Capsule())
                                    }

                                    Spacer()
                                }

                                // EV
                                if let ev = Formatters.computeEV(confidence: prop.confidence, american: prop.odds) {
                                    HStack(spacing: 4) {
                                        Text("EV:")
                                            .foregroundStyle(.white.opacity(0.4))
                                        Text(String(format: "+%.1f%%", ev))
                                            .foregroundStyle(.green)
                                    }
                                    .font(.system(size: 11, weight: .bold))
                                }

                                // Confidence
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 9))
                                        Text("Confidence").font(.system(size: 9, weight: .medium))
                                        Spacer()
                                    }
                                    .foregroundStyle(.white.opacity(0.3))

                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(accentColor.opacity(0.12))
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(accentColor)
                                                .frame(width: geo.size.width * CGFloat(prop.confidence ?? 0))
                                        }
                                    }
                                    .frame(height: 4)
                                }
                            }
                        }
                        .padding(16)
                        .background(
                            ZStack {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(hex: "#141210"))
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(GaryColors.gold.opacity(0.035))
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                            }
                        )

                        // Divider
                        Rectangle().fill(GaryColors.gold.opacity(0.06)).frame(height: 0.5)

                        // Key Stats
                        if let keyStats = prop.key_stats, !keyStats.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("KEY STATS")
                                    .font(.system(size: 11, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(accentColor)

                                ForEach(keyStats, id: \.self) { stat in
                                    HStack(alignment: .top, spacing: 8) {
                                        Circle()
                                            .fill(accentColor)
                                            .frame(width: 5, height: 5)
                                            .padding(.top, 7)
                                        Text(stat)
                                            .font(.system(size: 15))
                                            .foregroundStyle(.white.opacity(0.88))
                                            .lineSpacing(3)
                                    }
                                }
                            }

                            Rectangle().fill(.white.opacity(0.06)).frame(height: 0.5)
                        }

                        // Gary's Take (Analysis)
                        if let analysis = prop.analysis, !analysis.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("GARY'S TAKE")
                                    .font(.system(size: 11, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(accentColor)

                                VStack(alignment: .leading, spacing: 12) {
                                    ForEach(Array(cleanAnalysis(analysis).enumerated()), id: \.offset) { _, para in
                                        Text(para)
                                            .font(.system(size: 13))
                                            .foregroundStyle(.white.opacity(0.88))
                                            .lineSpacing(4)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                                .padding(14)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(.white.opacity(0.03))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(accentColor.opacity(0.15), lineWidth: 0.5)
                                        )
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 30)
                }
            }
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(hex: "#141210"))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(GaryColors.gold.opacity(0.035))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8)
                }
                    .shadow(color: GaryColors.gold.opacity(0.1), radius: 24, y: 8)
                    .shadow(color: .black.opacity(0.72), radius: 26, y: 12)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.horizontal, 16)
            .padding(.vertical, 50)
        }
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
                    .foregroundStyle(GaryColors.gold)
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
                    .foregroundStyle(GaryColors.gold)
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
                            .foregroundStyle(.white.opacity(0.6))
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
            // NCAAB Barttorvik Tale of Tape
            "ADJOE": "AdjOE",
            "ADJDE": "AdjDE",
            "ADJEM": "AdjEM",
            "TEMPO": "Tempo",
            "T_RANK": "T-Rank",
            "BARTHAG": "Barthag",
            "WAB": "WAB",
            "L5_FORM": "L5 Form",
            "L10_FORM": "L10 Form",
            "RECORD": "Record",
            "CONF_RECORD": "Conf Record",
            // NBA verified Tale of Tape
            "OFF_RATING": "Off Rating",
            "DEF_RATING": "Def Rating",
            "TS_PCT": "TS%",
            "EFG_PCT": "eFG%",
            "RPG": "Reb/Game",
            "APG": "Ast/Game",
            "PPG": "Pts/Game",
            "3PT_PCT": "3PT%",
            "FG_PCT": "FG%",
            "FT_PCT": "FT%",
            "TOV_GM": "TOV/Game",
            "OREB_GM": "Off Reb/G",
            "DREB_GM": "Def Reb/G",
            // NBA/NCAAB stats (legacy toolCallHistory tokens)
            "OFFENSIVE_RATING": "Off Rating",
            "DEFENSIVE_RATING": "Def Rating",
            "NET_RATING": "Net Rating",
            "EFFICIENCY_LAST_10": "Net Rating",
            "ADJ_EFFICIENCY_MARGIN": "Net Rating",
            "SP_PLUS_RATINGS": "Net Rating",
            "PACE_HOME_AWAY": "Record",
            "HOME_AWAY_SPLITS": "Record",
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
            // NCAAB Barttorvik ranking tokens
            "ADJOE_RANK": "AdjOE Rank",
            "ADJDE_RANK": "AdjDE Rank",
            "PROJ_RECORD": "Proj Record",
            // MLB/WBC verified Tale of Tape tokens
            "POOL_RECORD": "Pool Record",
            "SP_ERA": "SP ERA",
            "SP_WHIP": "SP WHIP",
            "SP_K9": "SP K/9",
            "SP_BB9": "SP BB/9",
            "SP_RECORD": "SP W-L",
            "SP_IP": "SP Innings",
            "SP_SO": "SP Strikeouts",
            "TEAM_AVG": "Team AVG",
            "TEAM_OBP": "Team OBP",
            "TEAM_SLG": "Team SLG",
            "TEAM_OPS": "Team OPS",
            "TEAM_HR": "Career HR",
            "GAME1_RESULT": "Game 1",
            "SP_NAME": "Starter",
            "ML_ODDS": "Moneyline",
            "RUN_LINE": "Run Line",
            "VENUE": "Venue",
            "LAST_PLAYED": "Game 1",
            // NHL verified Tale of Tape tokens
            "GOALS_FOR_GM": "Goals/G",
            "GOALS_AGST_GM": "GA/G",
            "SHOTS_FOR_GM": "Shots/G",
            "PP_PCT": "PP%",
            "PK_PCT": "PK%",
            "FO_PCT": "FO%",
            "POWER_PLAY__": "PP%",
            "PENALTY_KILL__": "PK%",
            "FACEOFF_WIN__": "FO%",
            "CORSI_PCT": "Corsi%",
            "XG_PCT": "xG%",
            "SH_PCT_5V5": "SH% 5v5",
            "SV_PCT_5V5": "SV% 5v5",
            // NHL specific (from toolCallHistory)
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
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                                .foregroundStyle(leftAdvantage ? greenAccent : .white.opacity(0.6))
                                .frame(maxWidth: 100, alignment: .leading)

                            Spacer(minLength: 4)

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
                                    .lineLimit(1)
                                if !leftAdvantage {
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(greenAccent)
                                }
                            }
                            .layoutPriority(1)

                            Spacer(minLength: 4)

                            // Right value (opponent)
                            Text(rightVal)
                                .font(.subheadline.bold())
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                                .foregroundStyle(!leftAdvantage ? greenAccent : .white.opacity(0.6))
                                .frame(maxWidth: 100, alignment: .trailing)
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
            "DEFENSIVE_RATING", "DEF_RATING", "ADJDE", "TURNOVER_RATE", "PAINT_DEFENSE",
            "DEFENSIVE_EPA", "SUCCESS_RATE_DEFENSE", "EXPLOSIVE_ALLOWED",
            "RED_ZONE_DEFENSE", "DL_RANKINGS", "DEFENSIVE_PLAYMAKERS",
            "OPP_EFG_PCT", "HAVOC_ALLOWED", "TOV_GM", "TURNOVERS_PER_GAME",
            // Defensive individual stats (lower is better)
            "OPP_POINTS_PER_GAME", "OPP_PPG", "OPP_YARDS_PER_GAME", "OPP_YPG",
            "GIVEAWAYS", "INTERCEPTIONS", "INTS",
            // NHL lower-is-better
            "GOALS_AGST_GM", "GOALS_AGAINST", "GOALS_AGAINST_AVG",
            // Rank tokens (lower rank = better)
            "ADJOE_RANK", "ADJDE_RANK", "T_RANK"
        ].contains(token)

        // For records like "5-18", "16-7", compare wins (first number)
        // Applies to RECORD, HOME, AWAY, HOME_AWAY_SPLITS, SPECIAL_TEAMS, etc.
        let recordTokens = ["RECORD", "CONF_RECORD", "L5_FORM", "L10_FORM", "PROJ_RECORD",
                           "HOME", "AWAY", "HOME_RECORD", "AWAY_RECORD",
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

        // WBC Game 1 Result — "W 3-0 vs Taipei" vs "L 4-11 vs Korea" — W beats L
        if token == "GAME1_RESULT" {
            let homeWin = home.hasPrefix("W")
            let awayWin = away.hasPrefix("W")
            return homeWin && !awayWin
        }

        // WBC text-only stats where comparison doesn't apply — always neutral (no arrow highlight)
        if token == "SP_NAME" || token == "VENUE" || token == "LAST_PLAYED" {
            return false
        }

        // RUN_LINE — more negative spread = bigger favorite = advantage
        if token == "RUN_LINE" {
            let homeSpread = Double(home.replacingOccurrences(of: "+", with: "")) ?? 0
            let awaySpread = Double(away.replacingOccurrences(of: "+", with: "")) ?? 0
            return homeSpread < awaySpread
        }

        // ML_ODDS — more negative = bigger favorite = advantage
        if token == "ML_ODDS" {
            let homeOdds = Double(home.replacingOccurrences(of: "+", with: "")) ?? 0
            let awayOdds = Double(away.replacingOccurrences(of: "+", with: "")) ?? 0
            // Lower (more negative) ML odds = bigger favorite = better
            return homeOdds < awayOdds
        }

        // For Last 5 / RECENT_FORM (e.g., "WWWWW" vs "LLWLL"), count wins
        if token == "RECENT_FORM" || token == "LAST_5" {
            let homeWins = home.uppercased().filter { $0 == "W" }.count
            let awayWins = away.uppercased().filter { $0 == "W" }.count
            return homeWins > awayWins
        }

        // For turnover margin and point diff, handle positive/negative
        if token == "TURNOVER_MARGIN" || token == "TURNOVER_DIFF" || token == "POINT_DIFF" || token == "NET_RATING" || token == "ADJEM" || token == "WAB" {
            let homeVal = Double(home) ?? 0
            let awayVal = Double(away) ?? 0
            return homeVal > awayVal
        }

        // Extract numeric values for standard comparisons
        // Remove % and handle negative numbers properly
        let cleanNum: (String) -> Double = { val in
            let cleaned = val.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: "#", with: "")
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
                        .foregroundStyle(GaryColors.gold)
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
                            .foregroundStyle(.white.opacity(0.6))
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
    // Cached DateFormatters (expensive to create — reuse across calls)
    private static let timeFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    static let dayTimeFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEEE h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

    private static let dateOnlyFormatterEST: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f
    }()

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
        let date = parseISO8601(isoTime)
        
        guard let gameDate = date else {
            // Fallback: return cleaned version
            return formatGameTime(isoTime)
        }
        
        return timeFormatterEST.string(from: gameDate) + " ET"
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
                            .foregroundStyle(GaryColors.gold)
                    }
                    .scaleEffect(animateIn ? 1 : 0.8)
                    .opacity(animateIn ? 1 : 0)
                    
                    // Title
                    VStack(spacing: 8) {
                        Text("Gary's Daily Fantasy")
                            .font(.system(size: 28, weight: .heavy))
                            .tracking(-0.5)
                            .foregroundStyle(GaryColors.gold)
                        
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lineups: [DFSLineup] = []
    @State private var loading = true
    @State private var selectedPlatform: DFSPlatform = .draftkings
    @State private var selectedSport: String = "NBA"
    @State private var selectedSlate: String = "Main"
    @State private var expandedPositions: Set<String> = []
    @State private var lastUpdated: Date?
    
    // Available sports based on loaded lineups
    private var availableSports: [String] {
        let sports = Set(lineups.filter { $0.platform == selectedPlatform.rawValue }.map { $0.sport })
        return Array(sports).sorted()
    }
    
    // Available slates for selected platform/sport
    private var availableSlates: [String] {
        let filtered = lineups.filter {
            $0.platform == selectedPlatform.rawValue &&
            $0.sport == selectedSport
        }
        // Build slate → earliest start time mapping for sorting
        var slateTimeMap: [String: String] = [:]
        for lineup in filtered {
            let name = lineup.slate_name ?? "Main"
            if let time = lineup.slate_start_time, slateTimeMap[name] == nil {
                slateTimeMap[name] = time
            }
        }
        let slateNames = Array(Set(filtered.compactMap { $0.slate_name ?? "Main" }))
        // Sort by start time (earlier first), fallback to alphabetical
        return slateNames.sorted { a, b in
            let timeA = slateTimeMap[a] ?? ""
            let timeB = slateTimeMap[b] ?? ""
            if !timeA.isEmpty && !timeB.isEmpty { return timeA < timeB }
            if !timeA.isEmpty { return true }
            if !timeB.isEmpty { return false }
            return a < b
        }
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
                    .foregroundStyle(GaryColors.gold)
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
                .padding(.bottom, 4)

                // Cache staleness indicator
                if let updated = lastUpdated, !loading {
                    Text(relativeTimeString(from: updated))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 2)
                }

                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if let lineup = currentLineup {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 8) {
                            // Lineup Summary Card
                            LineupSummaryCard(lineup: lineup)
                                .padding(.horizontal, 16)

                            // Position Rows — tight stack, no gaps
                            VStack(spacing: 2) {
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
                                }
                            }
                            .padding(.horizontal, 16)

                            // Gary's Analysis
                            GaryNotesCard(lineup: lineup)
                                .padding(.horizontal, 16)
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
            // Auto-select first available slate when platform changes (e.g. FD "After Hours" → DK "Main")
            if let first = availableSlates.first, !availableSlates.contains(selectedSlate) {
                selectedSlate = first
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
            let fetched = try await withTimeout(seconds: 30) {
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
                lastUpdated = Date()
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
                VStack(alignment: .leading, spacing: 2) {
                    Text("GARY'S OPTIMAL LINEUP")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                    if let archetype = lineup.archetype {
                        Text(archetype.replacingOccurrences(of: "_", with: " ").uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .tracking(0.5)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }

                Spacer()

                HStack(spacing: 6) {
                    if let games = lineup.slate_game_count, games > 0 {
                        Text("\(games)G")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(
                                Capsule()
                                    .fill(Color.white.opacity(0.08))
                            )
                    }
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
            }

            // Stats Row — Salary | Projected | Ceiling
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Salary")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text(lineup.salaryDisplay)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                }

                Spacer()

                Rectangle()
                    .fill(GaryColors.gold.opacity(0.2))
                    .frame(width: 0.5, height: 28)

                Spacer()

                VStack(spacing: 2) {
                    Text("Projected")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                    Text(String(format: "%.0f pts", lineup.projected_points))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                }

                if let ceiling = lineup.ceiling_projection {
                    Spacer()

                    Rectangle()
                        .fill(GaryColors.gold.opacity(0.2))
                        .frame(width: 0.5, height: 28)

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text("Ceiling")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.secondary)
                        Text(String(format: "%.0f pts", ceiling))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(GaryColors.gold)
                    }
                }
            }

            // Floor indicator bar
            if let floor = lineup.floor_projection, let ceiling = lineup.ceiling_projection {
                VStack(spacing: 4) {
                    GeometryReader { geo in
                        let range = ceiling - floor
                        let projPct = range > 0 ? min(1, max(0, (lineup.projected_points - floor) / range)) : 0.5

                        ZStack(alignment: .leading) {
                            // Track
                            Capsule()
                                .fill(Color.white.opacity(0.08))
                                .frame(height: 4)

                            // Fill to projected
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [GaryColors.gold.opacity(0.6), GaryColors.gold],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: geo.size.width * projPct, height: 4)
                        }
                    }
                    .frame(height: 4)

                    HStack {
                        Text(String(format: "Floor %.0f", floor))
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(String(format: "Ceiling %.0f", ceiling))
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(GaryColors.gold.opacity(0.7))
                    }
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
                VStack(spacing: 6) {
                    // ── Line 1: Position | Name | Salary | Proj | Chevron ──
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

                        // Player Name — full name, no truncation
                        Text(player.player)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)

                        Spacer()

                        // Ownership % — only when available (no placeholder)
                        if let ownership = player.ownership {
                            Text(String(format: "%.0f%%", ownership))
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(ownershipColor(ownership))
                        }

                        // Salary
                        Text(player.salaryFormatted)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(.white)
                            .frame(width: 56, alignment: .trailing)

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

                    // ── Line 2: Team vs Opp | Ownership | Value | Form ──
                    HStack(spacing: 6) {
                        // Spacer for position badge alignment
                        Color.clear.frame(width: 36, height: 1)

                        // Team vs Opponent
                        if let opp = player.opponent, !opp.isEmpty {
                            Text("\(player.team) vs \(opp)")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(GaryColors.gold.opacity(0.7))
                        } else {
                            Text(player.team)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(GaryColors.gold.opacity(0.7))
                        }


                        // Value Score Chip
                        if let vs = player.valueScore {
                            let isElite = vs >= 6.0
                            Text(String(format: "%.1fx", vs))
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(isElite ? Color(hex: "#3B82F6") : .secondary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule()
                                        .fill((isElite ? Color(hex: "#3B82F6") : Color.gray).opacity(0.15))
                                )
                        }

                        // Form Indicator Chip
                        if player.isHot {
                            HStack(spacing: 2) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 8))
                                Text("HOT")
                                    .font(.system(size: 9, weight: .bold))
                            }
                            .foregroundStyle(Color(hex: "#22C55E"))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(Color(hex: "#22C55E").opacity(0.15))
                            )
                        } else if player.isCold {
                            HStack(spacing: 2) {
                                Image(systemName: "snowflake")
                                    .font(.system(size: 8))
                                Text("COLD")
                                    .font(.system(size: 9, weight: .bold))
                            }
                            .foregroundStyle(Color(hex: "#EF4444"))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(Color(hex: "#EF4444").opacity(0.15))
                            )
                        }

                        Spacer()
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
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
    let lineup: DFSLineup

    private var hasNotes: Bool {
        !(lineup.gary_notes?.isEmpty ?? true)
    }
    private var hasThesis: Bool {
        !(lineup.build_thesis?.isEmpty ?? true)
    }
    private var hasCeiling: Bool {
        !(lineup.harmony_reasoning?.isEmpty ?? true)
    }
    private var hasContent: Bool {
        hasNotes || hasThesis || hasCeiling
    }

    // Archetype display name and icon
    private var archetypeInfo: (label: String, icon: String, color: Color)? {
        guard let arch = lineup.archetype?.lowercased() else { return nil }
        switch arch {
        case "balanced": return ("Balanced Build", "scale.3d", Color(hex: "#3B82F6"))
        case "mini_max", "minimax": return ("Mini-Max", "bolt.fill", Color(hex: "#F59E0B"))
        case "alpha_anchor", "alphaanchor": return ("Alpha Anchor", "star.fill", Color(hex: "#EF4444"))
        case "stars_and_scrubs", "starsandscrubs": return ("Stars & Scrubs", "sparkles", Color(hex: "#A855F7"))
        case "correlation_stack", "correlationstack": return ("Correlation Stack", "link", Color(hex: "#22C55E"))
        default: return (arch.replacingOccurrences(of: "_", with: " ").capitalized, "cube.fill", GaryColors.gold)
        }
    }

    var body: some View {
        if hasContent {
            VStack(alignment: .leading, spacing: 0) {
                // ── Header bar with gold accent line ──
                VStack(spacing: 0) {
                    // Gold accent line at top
                    LinearGradient(
                        colors: [GaryColors.gold.opacity(0.6), GaryColors.gold.opacity(0.1)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(height: 2)
                    .clipShape(RoundedRectangle(cornerRadius: 1))
                    .padding(.horizontal, 16)
                    .padding(.top, 1)

                    HStack(spacing: 8) {
                        Image(systemName: "brain.head.profile.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [GaryColors.gold, GaryColors.gold.opacity(0.7)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                        Text("GARY'S TAKE")
                            .font(.system(size: 13, weight: .heavy))
                            .tracking(1.5)
                            .foregroundStyle(GaryColors.gold)

                        Spacer()

                        // Archetype pill
                        if let info = archetypeInfo {
                            HStack(spacing: 4) {
                                Image(systemName: info.icon)
                                    .font(.system(size: 9))
                                Text(info.label.uppercased())
                                    .font(.system(size: 8, weight: .heavy))
                                    .tracking(0.5)
                            }
                            .foregroundStyle(info.color)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                Capsule()
                                    .fill(info.color.opacity(0.1))
                                    .overlay(
                                        Capsule()
                                            .stroke(info.color.opacity(0.3), lineWidth: 0.5)
                                    )
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 14)
                }

                // ── Gary's Notes (main analysis) ──
                if let notes = lineup.gary_notes, !notes.isEmpty {
                    Text(notes)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.white.opacity(0.9))
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 16)
                        .padding(.bottom, hasThesis || hasCeiling ? 4 : 16)
                }

                // ── Build Thesis + Ceiling side by side or stacked ──
                if hasThesis || hasCeiling {
                    VStack(spacing: 8) {
                        if let thesis = lineup.build_thesis, !thesis.isEmpty {
                            AnalysisSectionRow(
                                icon: "scope",
                                label: "BUILD THESIS",
                                color: Color(hex: "#3B82F6"),
                                text: thesis
                            )
                        }

                        if let ceiling = lineup.harmony_reasoning, !ceiling.isEmpty {
                            AnalysisSectionRow(
                                icon: "arrow.up.right.circle.fill",
                                label: "CEILING SCENARIO",
                                color: Color(hex: "#22C55E"),
                                text: ceiling
                            )
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                    .padding(.bottom, 14)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "#111114"), Color(hex: "#0A0A0C")],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [GaryColors.gold.opacity(0.3), Color.white.opacity(0.05)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 0.5
                            )
                    )
            )
        }
    }

}

// MARK: - Analysis Section Row (used inside GaryNotesCard)

struct AnalysisSectionRow: View {
    let icon: String
    let label: String
    let color: Color
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Colored accent bar
            RoundedRectangle(cornerRadius: 1.5)
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.3)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 6) {
                // Section header
                HStack(spacing: 5) {
                    Image(systemName: icon)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(color)
                    Text(label)
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1)
                        .foregroundStyle(color)
                }

                // Content
                Text(text)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.white.opacity(0.8))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(color.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(color.opacity(0.1), lineWidth: 0.5)
                )
        )
    }
}
