import SwiftUI
import WebKit

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
                // Deep base
                Color(hex: "#050506")
                
                // Ambient glow orbs (positioned relative to screen, not affecting layout)
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [accentColor.opacity(0.15), .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 300
                        )
                    )
                    .frame(width: 600, height: 600)
                    .position(x: geo.size.width * 0.2, y: geo.size.height * 0.15)
                    .blur(radius: 60)
                
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color(hex: "#1a1a2e").opacity(0.6), .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 250
                        )
                    )
                    .frame(width: 500, height: 500)
                    .position(x: geo.size.width * 0.8, y: geo.size.height * 0.7)
                    .blur(radius: 50)
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
                        Image("GaryLiquid")
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
                                Text("TODAY'S FREE PICK")
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
                            BenefitCard(title: "GPT 5.1 Engine", text: "Multi-pass reasoning with OpenAI's most advanced model for deep game analysis.", icon: "brain.head.profile")
                            BenefitCard(title: "Agentic Analysis", text: "6-iteration agent loop that requests specific stats, forms hypotheses, and validates picks.", icon: "arrow.triangle.2.circlepath")
                            BenefitCard(title: "Live Scout Reports", text: "Real-time injuries, lineup changes, team form, and situational factors for every game.", icon: "doc.text.magnifyingglass")
                            BenefitCard(title: "Odds Intelligence", text: "Live odds from The Odds API. Identifies mispriced lines and value opportunities.", icon: "chart.line.uptrend.xyaxis")
                            BenefitCard(title: "Perplexity News", text: "AI-powered news search for breaking storylines, trends, and market narratives.", icon: "magnifyingglass")
                            BenefitCard(title: "Convergence Engine", text: "Measures alignment between stats, odds, and analysis. Higher scores = stronger picks.", icon: "target")
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
    case all = "ALL"
    case nfl = "NFL"
    case nba = "NBA"
    case ncaab = "NCAAB"
    case ncaaf = "NCAAF"
    case mlb = "MLB"
    case nhl = "NHL"
    case wnba = "WNBA"
    
    var icon: String {
        switch self {
        case .all: return "star.fill"
        case .nfl: return "football.fill"
        case .nba: return "basketball.fill"
        case .ncaab: return "basketball.fill"
        case .ncaaf: return "football.fill"
        case .mlb: return "baseball.fill"
        case .nhl: return "hockey.puck.fill"
        case .wnba: return "basketball.fill"
        }
    }
    
    var accentColor: Color {
        switch self {
        case .all: return GaryColors.gold
        case .nba: return Color(hex: "#3B82F6")
        case .wnba: return Color(hex: "#F97316")
        case .nfl: return GaryColors.gold
        case .ncaab: return Color(hex: "#8B5CF6")
        case .ncaaf: return Color(hex: "#DC2626")
        case .mlb: return Color(hex: "#0EA5E9")
        case .nhl: return Color(hex: "#F97316")
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
    
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Sport.allCases, id: \.self) { sport in
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
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }
}

// MARK: - Gary's Picks View

struct GaryPicksView: View {
    @State private var allPicks: [GaryPick] = []
    @State private var loading = true
    @State private var selectedSport: Sport = .all
    @State private var animateIn = false
    
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
                SportFilterBar(selected: $selectedSport, availableSports: availableSports)
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
                        Text(selectedSport == .all ? "No picks yet." : "No \(selectedSport.rawValue) picks today.")
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
                    Spacer()
                } else {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 16) {
                            ForEach(Array(filteredPicks.enumerated()), id: \.element.id) { index, pick in
                                PickCardMobile(pick: pick)
                                    .padding(.horizontal, 16)
                                    .opacity(animateIn ? 1 : 0)
                                    .offset(y: animateIn ? 0 : 20)
                                    .animation(
                                        .spring(response: 0.5, dampingFraction: 0.8)
                                        .delay(Double(index) * 0.08),
                                        value: animateIn
                                    )
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100)
                    }
                }
            }
        }
        .task {
            await loadPicks()
        }
        .refreshable {
            await loadPicks()
        }
        .onChange(of: selectedSport) { _ in
            animateIn = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation { animateIn = true }
            }
        }
    }
    
    private func loadPicks() async {
        loading = true
        animateIn = false
        let date = SupabaseAPI.todayEST()
        if let arr = try? await SupabaseAPI.fetchAllPicks(date: date) {
            allPicks = arr.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }
        }
        loading = false
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            animateIn = true
        }
    }
}

// MARK: - Gary's Props View

struct GaryPropsView: View {
    @State private var allProps: [PropPick] = []
    @State private var loading = true
    @State private var selectedSport: Sport = .all
    @State private var animateIn = false
    
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
                            ForEach(Array(filteredProps.enumerated()), id: \.element.id) { index, prop in
                                PropCardMobile(prop: prop)
                                    .padding(.horizontal, 16)
                                    .opacity(animateIn ? 1 : 0)
                                    .offset(y: animateIn ? 0 : 20)
                                    .animation(
                                        .spring(response: 0.5, dampingFraction: 0.8)
                                        .delay(Double(index) * 0.08),
                                        value: animateIn
                                    )
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.bottom, 100)
                    }
                }
            }
        }
        .task {
            await loadProps()
        }
        .refreshable {
            await loadProps()
        }
        .onChange(of: selectedSport) { _ in
            animateIn = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation { animateIn = true }
            }
        }
    }
    
    private func loadProps() async {
        loading = true
        animateIn = false
        let date = SupabaseAPI.todayEST()
        allProps = (try? await SupabaseAPI.fetchPropPicks(date: date)) ?? []
        loading = false
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            animateIn = true
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
                        }
                    }
                } else {
                    if displayProps.isEmpty {
                        emptyStateView
                    } else {
                        ForEach(Array(displayProps.prefix(50).enumerated()), id: \.offset) { _, result in
                            PropResultRow(result: result)
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
        loading = true
        error = nil
        
        do {
            let since = sinceDate(for: timeframe)
            // Use the combined fetch that includes NFL results
            async let games = SupabaseAPI.fetchAllGameResults(since: since)
            async let props = SupabaseAPI.fetchPropResults(since: since)
            
            gameResults = try await games
            propResults = try await props
        } catch {
            self.error = "Failed to load data"
        }
        
        loading = false
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
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                
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
    
    /// Extract pick text and odds separately
    private var pickParts: (pick: String, odds: String) {
        Formatters.splitPickAndOdds(pick.pick)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header Row - Icon left, Time right
            HStack {
                Image(systemName: Sport.from(league: pick.league).icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(GaryColors.gold)
                    .padding(10)
                    .liquidGlassCircle()
                
                Spacer()
                
                if let time = pick.displayTime {
                    Text(Formatters.formatCommenceTime(time))
                        .font(.caption.bold())
                        .foregroundStyle(GaryColors.lightGold)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .liquidGlass(cornerRadius: 8)
                }
            }
            
            // Teams - Solid gold with truncation for long names
            HStack {
                Text(Formatters.shortTeamName(pick.awayTeam))
                    .font(.title3.bold())
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer()
                Text("@")
                    .font(.caption)
                    .foregroundStyle(GaryColors.gold.opacity(0.5))
                    .layoutPriority(1)
                Spacer()
                Text(Formatters.shortTeamName(pick.homeTeam))
                    .font(.title3.bold())
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.vertical, 4)
            
            // Divider
            Rectangle()
                .fill(accentColor.opacity(0.3))
                .frame(height: 1)
            
            // Pick Text with Odds aligned horizontally
            HStack(alignment: .center) {
                Text(pickParts.pick)
                    .foregroundStyle(GaryColors.gold)
                    .font(.title2.bold())
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                
                Spacer()
                
                // Odds badge - aligned with pick text
                if !pickParts.odds.isEmpty {
                    Text(pickParts.odds)
                        .font(.subheadline.bold())
                        .foregroundStyle(GaryColors.goldGradient)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .liquidGlass(cornerRadius: 8)
                }
            }
            
            // Confidence Bar
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
            
            // Analysis Button
            Button {
                showAnalysis.toggle()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .foregroundStyle(GaryColors.goldGradient)
                    Text("View Analysis")
                }
                .font(.subheadline.bold())
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .liquidGlassButton(cornerRadius: 12)
            }
            .sheet(isPresented: $showAnalysis) {
                AnalysisSheet(title: "Gary's Analysis", content: pick.rationale ?? "", accentColor: accentColor)
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
                            lineWidth: 1
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
                    .foregroundStyle(GaryColors.goldGradient)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .liquidGlass(cornerRadius: 10)
            }
            
            Rectangle()
                .fill(.white.opacity(0.1))
                .frame(height: 1)
            
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .foregroundStyle(GaryColors.gold)
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
                            .foregroundStyle(GaryColors.goldGradient)
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
                        .stroke(GaryColors.gold.opacity(0.4), lineWidth: 1)
                )
                .shadow(color: GaryColors.gold.opacity(0.1), radius: 16, y: 8)
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
    let content: String
    var accentColor: Color = GaryColors.gold
    @Environment(\.dismiss) private var dismiss
    
    // Desktop-matching colors
    private let greenAccent = Color(hex: "#4ade80")
    private let amberAccent = Color(hex: "#fbbf24")
    private let darkBg = Color(hex: "#0a0a0a")
    
    var body: some View {
        ZStack {
            // Dark background matching desktop
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
                            .background(
                                Circle()
                                    .fill(Color.white.opacity(0.1))
                            )
                    }
                }
                
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        // Render the content with proper formatting
                        FormattedAnalysisView(content: content, accentColor: accentColor)
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
    
    var body: some View {
        // Parse: "Record    5-18    →    6-17" or "Off Rating    110.1    ←    109.1"
        let isRightAdvantage = line.contains("→")
        let parts = line
            .replacingOccurrences(of: "→", with: "|")
            .replacingOccurrences(of: "←", with: "|")
            .components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        
        if parts.count >= 2 {
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
            
            HStack {
                // Left value - green if advantage, white if not
                Text(leftVal)
                    .font(.subheadline.bold())
                    .foregroundStyle(isRightAdvantage ? .white.opacity(0.7) : greenAccent)
                    .frame(width: 65, alignment: .leading)
                
                Spacer()
                
                // Stat name with arrow indicator
                HStack(spacing: 4) {
                    if !isRightAdvantage {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(greenAccent)
                    }
                    Text(statName)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.5))
                    if isRightAdvantage {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(greenAccent)
                    }
                }
                
                Spacer()
                
                // Right value - green if advantage, white if not
                Text(rightPart)
                    .font(.subheadline.bold())
                    .foregroundStyle(isRightAdvantage ? greenAccent : .white.opacity(0.7))
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
    
    /// Get shortened team names (just the nickname)
    private var shortTeams: (String, String) {
        let short1 = Formatters.shortTeamName(teams.0)
        let short2 = Formatters.shortTeamName(teams.1)
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
    
    static func shortTeamName(_ team: String?) -> String {
        guard let team = team, !team.isEmpty else { return "" }
        let words = team.split(separator: " ")
        return words.count > 1 ? String(words.last!) : team
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
