import SwiftUI
import WebKit

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
    
    /// Gold gradient glass
    func goldGlass(cornerRadius: CGFloat = 12) -> some View {
        self.background {
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
        }
    }
    
    /// Gold gradient glass circle
    func goldGlassCircle() -> some View {
        self.background {
            ZStack {
                // Gold gradient background (light gold to darker gold)
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
                
                // Gold gradient border
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
        }
    }
    
    /// Premium liquid glass button with gold tint
    func liquidGlassButton(cornerRadius: CGFloat = 12) -> some View {
        self.background {
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
        }
        .shadow(color: GaryColors.gold.opacity(0.2), radius: 12, y: 6)
        .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
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

// MARK: - Home View

struct HomeView: View {
    @State private var freePick: GaryPick?
    @State private var loading = true
    @State private var animateIn = false
    
    var body: some View {
        ZStack {
            // Background - ignores safe area (fills entire screen)
            LiquidGlassBackground()
            
            // Content - respects safe area
            ScrollView(showsIndicators: false) {
                VStack(spacing: 20) {
                    // Hero Section
                    VStack(spacing: 0) {
                        Image("GaryCoin") // Transparent coin image, no added background
                            .resizable()
                            .scaledToFit()
                            .frame(width: 170, height: 170)
                        
                        Text("GARY A.I.")
                            .font(.system(size: 26, weight: .heavy))
                            .tracking(-0.5)
                            .foregroundStyle(GaryColors.goldGradient)
                        
                        Text("Intelligent Sports Analysis")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 8) // Small extra padding after safe area
                    .opacity(animateIn ? 1 : 0)
                    .offset(y: animateIn ? 0 : 20)
                    
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
                    }
                    
                    // Benefits Grid - Why Gary Section
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("WHY GARY?")
                                .font(.caption.bold())
                                .foregroundStyle(GaryColors.gold)
                            Spacer()
                        }
                        .padding(.horizontal, 4)
                        
                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10)
                        ], spacing: 10) {
                            BenefitCard(title: "GPT 5.1 Engine", text: "Powered by OpenAI's most advanced reasoning model. Gary doesn't just analyze games—he thinks through them like a seasoned handicapper with decades of experience, using multi-pass logic to uncover edges the market misses.", icon: "brain.head.profile")
                            BenefitCard(title: "Agentic Analysis", text: "Gary runs a 6-step autonomous research loop for every single pick. He requests specific stats, forms hypotheses, stress-tests his reasoning, and only locks in picks that survive rigorous validation. No gut feelings—pure systematic edge.", icon: "arrow.triangle.2.circlepath")
                            BenefitCard(title: "Matchup Insight", text: "Every pick includes real-time intelligence: breaking injury news, last-minute lineup changes, travel schedules, rest advantages, and situational factors that move lines. Gary sees what the public doesn't.", icon: "doc.text.magnifyingglass")
                            BenefitCard(title: "The Odds API", text: "Gary ingests live odds from 15+ sportsbooks via The Odds API, instantly identifying mispriced lines and +EV opportunities. When the market is wrong, Gary strikes.", icon: "chart.line.uptrend.xyaxis")
                            BenefitCard(title: "Headline Hunter", text: "AI-powered news search scans thousands of sources for breaking storylines, locker room drama, weather updates, and market narratives that sharp bettors exploit. Information is edge—Gary has it first.", icon: "magnifyingglass")
                            BenefitCard(title: "Sports Brain", text: "Gary's secret weapon. This proprietary system measures alignment between statistical models, market odds, and qualitative analysis. When all signals converge, you get Gary's highest-conviction plays. Higher convergence = higher confidence = stronger picks.", icon: "target")
                        }
                    }
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(Color(hex: "#0A0A0C").opacity(0.6))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .stroke(
                                        LinearGradient(
                                            colors: [GaryColors.gold.opacity(0.3), GaryColors.gold.opacity(0.1)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ),
                                        lineWidth: 0.5
                                    )
                            )
                    )
                    .padding(.horizontal, 16)
                    .opacity(animateIn ? 1 : 0)
                    .animation(.easeOut(duration: 0.6).delay(0.4), value: animateIn)
                }
                .padding(.horizontal, 4) // Ensure content doesn't touch edges
                .padding(.bottom, 100) // Space for floating tab bar
            }
        }
        .task {
            // Start animation immediately so content is visible
            withAnimation(.easeOut(duration: 0.8)) {
                animateIn = true
            }
            
            // Then load data
            loading = true
            let date = SupabaseAPI.todayEST()
            freePick = try? await SupabaseAPI.fetchAllPicks(date: date).first
            loading = false
        }
    }
}

// MARK: - Sport Filter

enum Sport: String, CaseIterable {
    // Order: ALL → NBA → NFL → NHL → NCAAB → NCAAF → EPL → MLB → WNBA
    case all = "ALL"
    case nba = "NBA"
    case nfl = "NFL"
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
        case .nfl: return GaryColors.gold            // Gold
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
        case .nhl, .epl: return true
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
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Sport.allCases, id: \.self) { sport in
                    // Skip ALL if showAll is false
                    if sport == .all && !showAll { } else {
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
                                        .shadow(color: sport.accentColor.opacity(0.4), radius: 8, y: 4)
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
        guard selectedSport != .all else { return allPicks }
        return allPicks.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue }
    }
    
    private var availableSports: Set<String> {
        Set(allPicks.compactMap { $0.league?.uppercased() })
    }
    
    var body: some View {
        ZStack {
            // Background - ignores safe area
            LiquidGlassBackground(accentColor: selectedSport.accentColor)
            
            // Content - respects safe area
            VStack(spacing: 0) {
                // Floating Header
                VStack(spacing: 8) {
                    Text("Gary's Picks")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                    
                    Text("AI-Powered Sports Analysis")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 8) // Extra padding after safe area
                .padding(.bottom, 12)
                
                // Sport Filter
                SportFilterBar(selected: $selectedSport, availableSports: availableSports, showAll: true)
                    .padding(.bottom, 16)
                
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
                            ForEach(filteredPicks) { pick in
                                PickCardMobile(pick: pick)
                                    .padding(.horizontal, 16)
                                    .transaction { $0.animation = nil }
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100)
                        .transaction { $0.animation = nil }
                    }
                    // Pull-to-refresh only on the picks ScrollView, not the filter bar
                    .refreshable {
                        await loadPicks()
                    }
                }
            }
        }
        .task {
            await loadPicks()
        }
    }
    
    private func loadPicks() async {
        await MainActor.run {
            loading = true
        }
        
        let date = SupabaseAPI.todayEST()
        
        // Use a timeout to prevent infinite loading
        var picks: [GaryPick] = []
        do {
            let arr = try await withTimeout(seconds: 15) {
                try await SupabaseAPI.fetchAllPicks(date: date)
            }
            picks = arr.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }
        } catch {
            print("Picks load error: \(error)")
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
        guard selectedSport != .all else { return allProps }
        return allProps.filter { ($0.effectiveLeague ?? "").uppercased() == selectedSport.rawValue }
    }
    
    private var availableSports: Set<String> {
        Set(allProps.compactMap { $0.effectiveLeague?.uppercased() })
    }
    
    var body: some View {
        ZStack {
            // Background - ignores safe area
            LiquidGlassBackground(accentColor: GaryColors.gold)
            
            // Content - respects safe area
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 8) {
                    Text("Gary Props")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                    
                    Text("AI-Powered Prop Betting")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 8) // Extra padding after safe area
                .padding(.bottom, 12)
                
                // Sport Filter
                SportFilterBar(selected: $selectedSport, availableSports: availableSports)
                    .padding(.bottom, 16)
                
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
                            ForEach(filteredProps) { prop in
                                PropCardMobile(prop: prop)
                                    .padding(.horizontal, 16)
                                    .transaction { $0.animation = nil }
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100)
                        .transaction { $0.animation = nil }
                    }
                    // Pull-to-refresh only on the props ScrollView, not the filter bar
                    .refreshable {
                        await loadProps()
                    }
                }
            }
        }
        .task {
            await loadProps()
        }
    }
    
    private func loadProps() async {
        await MainActor.run {
            loading = true
        }
        
        let date = SupabaseAPI.todayEST()
        
        // Use a timeout to prevent infinite loading
        let props: [PropPick]
        do {
            props = try await withTimeout(seconds: 15) {
                try await SupabaseAPI.fetchPropPicks(date: date)
            }
        } catch {
            print("Props load error: \(error)")
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
    @State private var timeframe = "all"
    @State private var selectedSport: Sport = .all
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loading = true
    @State private var error: String?
    
    private let timeframes = ["7d", "30d", "90d", "ytd", "all"]
    
    /// Filter game results by selected sport
    private var filteredGameResults: [GameResult] {
        guard selectedSport != .all else { return gameResults }
        return gameResults.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue }
    }
    
    /// Filter prop results by selected sport
    private var filteredPropResults: [PropResult] {
        guard selectedSport != .all else { return propResults }
        return propResults.filter { ($0.effectiveLeague ?? "").uppercased() == selectedSport.rawValue }
    }
    
    /// Get available sports from the loaded results (both game and prop results)
    private var availableSports: Set<String> {
        let gameLeagues = Set(gameResults.compactMap { $0.league?.uppercased() })
        let propLeagues = Set(propResults.compactMap { $0.effectiveLeague?.uppercased() })
        return gameLeagues.union(propLeagues)
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
                VStack(spacing: 16) {
                    // Header
                    Text("Billfold")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                        .padding(.top, 8)
                    
                    // Segmented Control with Glass
                    segmentedControl
                    
                    // Sport Filter
                    sportFilterBar
                    
                    // Timeframe Buttons
                    timeframeButtons
                    
                    // Metrics
                    metricsCards
                    
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
            ForEach(["Game Picks", "Prop Picks"].indices, id: \.self) { index in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedTab = index
                    }
                } label: {
                    Text(index == 0 ? "Game Picks" : "Prop Picks")
                        .font(.subheadline.bold())
                        .foregroundStyle(selectedTab == index ? .black : .white.opacity(0.7))
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                        .background {
                            if selectedTab == index {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(GaryColors.goldGradient)
                            }
                        }
                }
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "#141416"))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)
                )
        )
    }
    
    private var sportFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Sport.allCases, id: \.self) { sport in
                    let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                    let isSelected = selectedSport == sport
                    
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            selectedSport = sport
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
                                    .shadow(color: sport.accentColor.opacity(0.4), radius: 6, y: 3)
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
    
    private var timeframeButtons: some View {
        HStack(spacing: 8) {
            ForEach(timeframes, id: \.self) { tf in
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        timeframe = tf
                    }
                    Task { await loadData() }
                } label: {
                    Text(tf.uppercased())
                        .font(.caption.bold())
                        .foregroundStyle(timeframe == tf ? .black : .white.opacity(0.6))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
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
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(GaryColors.gold)
                    .padding(10)
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
        VStack(alignment: .leading, spacing: 12) {
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
    @State private var isExpanded = false
    @State private var isPressed = false
    
    init(title: String, text: String, icon: String? = nil) {
        self.title = title
        self.text = text
        self.icon = icon
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(GaryColors.goldGradient)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(Color(hex: "#1A1A1C"))
                        )
                }
                Text(title)
                    .font(.caption.bold())
                    .foregroundStyle(GaryColors.lightGold)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
                
                Spacer()
                
                // Expand/collapse indicator
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(GaryColors.gold.opacity(0.6))
            }
            
            Text(text)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(isExpanded ? nil : 2)
                .fixedSize(horizontal: false, vertical: isExpanded)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
        .darkCard(cornerRadius: 14)
        .scaleEffect(isPressed ? 0.97 : 1.0)
        .onTapGesture {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                isExpanded.toggle()
            }
        }
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = pressing
            }
        }, perform: {})
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
        .shadow(color: GaryColors.gold.opacity(0.1), radius: 12, y: 4)
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

// MARK: - Pick Cards

struct PickCardMobile: View {
    let pick: GaryPick
    @State private var showAnalysis = false
    @State private var isPressed = false
    
    private var accentColor: Color {
        Sport.from(league: pick.league).accentColor
    }
    
    /// Extract pick text and odds separately, expanding team names for NBA
    private var pickParts: (pick: String, odds: String) {
        let parts = Formatters.splitPickAndOdds(pick.pick)
        
        // For NBA, replace short team name with full team name in pick text
        if pick.league?.uppercased() == "NBA" {
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
        
        return parts
    }
    
    /// Check if this pick's sport is in beta
    private var isBetaSport: Bool {
        Sport.from(league: pick.league).isBeta
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header Row - Icon left, Time right
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: Sport.from(league: pick.league).icon)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.75))
                        .padding(10)
                        .goldGlassCircle()
                    
                    // BETA badge for sports with limited analytics
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
            
            // Teams - Soft white with truncation for long names (always short names for matchup)
            // For NCAAB/NCAAF: shows school names (e.g., "Nebraska @ Illinois")
            // For pro sports: shows mascots (e.g., "Thunder @ Lakers")
            HStack {
                Text(Formatters.shortTeamName(pick.awayTeam, league: pick.league))
                    .font(.title3.bold())
                    .foregroundStyle(Color.white.opacity(0.75))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer()
                Text("@")
                    .font(.caption)
                    .foregroundStyle(Color.white.opacity(0.5))
                    .layoutPriority(1)
                Spacer()
                Text(Formatters.shortTeamName(pick.homeTeam, league: pick.league))
                    .font(.title3.bold())
                    .foregroundStyle(Color.white.opacity(0.75))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.vertical, 4)
            
            // Divider
            Rectangle()
                .fill(accentColor.opacity(0.3))
                .frame(height: 1)
            
            // Pick Text with Odds aligned horizontally (KEEP GOLD for actual pick)
            HStack(alignment: .center) {
                Text(pickParts.pick)
                    .foregroundStyle(GaryColors.gold)
                    .font(.system(size: 22, weight: .heavy))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                
                Spacer()
                
                // Odds badge - soft white, unbold
                if !pickParts.odds.isEmpty {
                    Text(pickParts.odds)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.75))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .goldGlass(cornerRadius: 8)
                }
            }
            
            // Confidence Bar (KEEP AS-IS)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.caption)
                    Text("Confidence")
                        .font(.caption)
                    Spacer()
                    Text("\(Formatters.confidencePercent(pick.confidence))%")
                        .font(.caption.bold())
                }
                .foregroundStyle(.secondary)
                
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(.white.opacity(0.1))
                        RoundedRectangle(cornerRadius: 4)
                            .fill(accentColor)
                            .frame(width: geo.size.width * CGFloat(pick.confidence ?? 0))
                    }
                }
                .frame(height: 6)
            }
            
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
        }
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .onLongPressGesture(minimumDuration: .infinity, pressing: { pressing in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                isPressed = pressing
            }
        }, perform: {})
    }
}

struct PropCardMobile: View {
    let prop: PropPick
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
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(Formatters.americanOdds(prop.odds))
                    .font(.title3.bold())
                    .foregroundStyle(accentColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .liquidGlass(cornerRadius: 10)
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
            
            Text(Formatters.propDisplay(prop.prop))
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
                    BulletPointSheet(title: "Gary's Analysis", content: analysis)
                }
            }
        }
        .padding(18)
        .background {
            RoundedRectangle(cornerRadius: 20)
                .fill(GaryColors.cardBg)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(accentColor.opacity(0.4), lineWidth: 1)
                )
                .shadow(color: accentColor.opacity(0.1), radius: 16, y: 8)
                .shadow(color: .black.opacity(0.25), radius: 8, y: 4)
        }
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
                            GaryTakeSection(narrative: narrative)
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
    
    private let greenAccent = Color(hex: "#4ade80")
    
    /// Left side is always Gary's pick
    private var leftTeam: String { garyPickedHome ? homeTeam : awayTeam }
    private var rightTeam: String { garyPickedHome ? awayTeam : homeTeam }
    
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
            "TURNOVER_RATE": "TOV/Game",
            "OREB_RATE": "Off Reb/G",
            "FT_RATE": "FT Rate",
            "CLUTCH_STATS": "Close Games",
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
            "EXPLOSIVENESS": "Big Plays",
            "HAVOC_RATE": "Havoc Rate",
            "HAVOC_ALLOWED": "Opp Havoc",
            "PASSING_TDS": "Pass TDs",
            "INTERCEPTIONS": "INTs",
            "RUSHING_TDS": "Rush TDs",
            // NCAAB/NCAAF specific
            "SCORING": "PPG",
            "ASSISTS": "Assists/G",
            "REBOUNDS": "Reb/G",
            "STEALS": "Steals/G",
            "BLOCKS": "Blocks/G",
            "FG_PCT": "FG%"
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
                        .frame(width: 70, alignment: .leading)
                    
                    Spacer()
                    
                    Text("vs")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.4))
                    
                    Spacer()
                    
                    Text(rightTeam)
                        .font(.subheadline.bold())
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(width: 70, alignment: .trailing)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(Color.white.opacity(0.05))
                
                // Stats Rows
                ForEach(Array(statsData.enumerated()), id: \.offset) { index, stat in
                    if let token = stat.token,
                       let home = stat.home,
                       let away = stat.away {
                        let homeVal = home.getValue(for: token)
                        let awayVal = away.getValue(for: token)
                        
                        // Skip tokens that don't have displayable data
                        let skipTokens = ["TOP_PLAYERS", "WEATHER", "REST_SITUATION", "PASSING_EPA", "RUSHING_EPA", "FIELD_POSITION", "MOTIVATION_CONTEXT"]
                        
                        // Only show if both values are valid (not N/A)
                        if !skipTokens.contains(token) && homeVal != "N/A" && awayVal != "N/A" && !homeVal.isEmpty && !awayVal.isEmpty {
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
                            .background(index % 2 == 0 ? Color.clear : Color.white.opacity(0.02))
                        }
                    }
                }
                
                // Injuries Row
                if let injuries = injuries {
                    let homeInjuries = injuries.home?.filter { $0.status == "Out" }.prefix(3).compactMap { $0.name } ?? []
                    let awayInjuries = injuries.away?.filter { $0.status == "Out" }.prefix(3).compactMap { $0.name } ?? []
                    
                    // Swap based on Gary's pick
                    let leftInjuries = garyPickedHome ? homeInjuries : awayInjuries
                    let rightInjuries = garyPickedHome ? awayInjuries : homeInjuries
                    
                    if !leftInjuries.isEmpty || !rightInjuries.isEmpty {
                        Divider().background(Color.white.opacity(0.1))
                        
                        HStack(alignment: .top) {
                            // Left injuries (Gary's pick)
                            Text(leftInjuries.isEmpty ? "Healthy" : leftInjuries.joined(separator: ", "))
                                .font(.caption)
                                .foregroundStyle(leftInjuries.isEmpty ? .green.opacity(0.7) : .red.opacity(0.9))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .lineLimit(2)
                            
                            // Label in red
                            Text("Injuries")
                                .font(.caption.bold())
                                .foregroundStyle(.red.opacity(0.8))
                                .frame(width: 60)
                            
                            // Right injuries (opponent)
                            Text(rightInjuries.isEmpty ? "Healthy" : rightInjuries.joined(separator: ", "))
                                .font(.caption)
                                .foregroundStyle(rightInjuries.isEmpty ? .green.opacity(0.7) : .red.opacity(0.9))
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .lineLimit(2)
                        }
                        .padding(.vertical, 10)
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
        // Extract numeric values
        let homeNum = Double(home.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: "-", with: "")) ?? 0
        let awayNum = Double(away.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: "-", with: "")) ?? 0
        
        // For defensive stats, lower is better
        let lowerIsBetter = [
            "DEFENSIVE_RATING", "TURNOVER_RATE", "PAINT_DEFENSE",
            "DEFENSIVE_EPA", "SUCCESS_RATE_DEFENSE", "EXPLOSIVE_ALLOWED",
            "RED_ZONE_DEFENSE", "DL_RANKINGS", "DEFENSIVE_PLAYMAKERS",
            "OPP_EFG_PCT", "HAVOC_ALLOWED"
        ].contains(token)
        
        // For records like "5-18", compare wins
        if token == "PACE_HOME_AWAY" || token == "HOME_AWAY_SPLITS" || token == "SPECIAL_TEAMS" {
            let homeWins = Int(home.components(separatedBy: "-").first ?? "0") ?? 0
            let awayWins = Int(away.components(separatedBy: "-").first ?? "0") ?? 0
            return homeWins > awayWins
        }
        
        // For turnover margin, handle positive/negative
        if token == "TURNOVER_MARGIN" {
            let homeVal = Double(home) ?? 0
            let awayVal = Double(away) ?? 0
            return homeVal > awayVal
        }
        
        return lowerIsBetter ? homeNum < awayNum : homeNum > awayNum
    }
}

// MARK: - Gary's Take Section
struct GaryTakeSection: View {
    let narrative: String
    
    private let greenAccent = Color(hex: "#4ade80")
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section Header
            Text("GARY'S TAKE")
                .font(.caption.bold())
                .foregroundStyle(greenAccent)
                .tracking(1)
                .opacity(0.8)
            
            // Narrative text - split into paragraphs
            VStack(alignment: .leading, spacing: 12) {
                let paragraphs = narrative.components(separatedBy: "\n\n").filter { !$0.isEmpty }
                
                ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, para in
                    Text(para.trimmingCharacters(in: .whitespacesAndNewlines))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.92))
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(14)
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
            HStack(spacing: 8) {
                Text(shortTeams.0)
                    .font(.subheadline.bold())
                    .foregroundStyle(GaryColors.gold)
                
                Text("vs")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
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
    
    static func propDisplay(_ raw: String?) -> String {
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
        
        let typeTitle = typeWords.joined(separator: " ").capitalized
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
        if let txt = p.pick_text, !txt.isEmpty { return propDisplay(txt) }
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
        let cities = ["Dallas", "Detroit", "Los Angeles", "LA", "New York", "NY", "Boston", "Washington",
                      "Golden State", "San Francisco", "San Antonio", "New Orleans", "Oklahoma City", "OKC",
                      "Minnesota", "Milwaukee", "Miami", "Memphis", "Indiana", "Houston", "Denver",
                      "Cleveland", "Chicago", "Charlotte", "Brooklyn", "Atlanta", "Phoenix", "Portland",
                      "Sacramento", "Toronto", "Utah", "Orlando", "Philadelphia", "Cincinnati", "Baltimore",
                      "Pittsburgh", "Kansas City", "Las Vegas", "Seattle", "Tampa Bay", "Green Bay",
                      "New England", "Jacksonville", "Tennessee", "Arizona", "Carolina", "Buffalo"]
        
        var result = pick
        for city in cities {
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
