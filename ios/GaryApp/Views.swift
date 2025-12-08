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
                    VStack(spacing: 12) {
                        Image("GaryCoin")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 130, height: 130)
                            .shadow(color: GaryColors.gold.opacity(0.5), radius: 20, y: 8)
                        
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
                            BenefitCard(title: "Statistical Brain", text: "Identifies mispriced lines.", icon: "waveform.path.ecg")
                            BenefitCard(title: "Three-Layer Core", text: "Odds, storylines, reasoning.", icon: "square.stack.3d.up")
                            BenefitCard(title: "Narrative Tracker", text: "Injuries & lineup changes.", icon: "text.bubble")
                            BenefitCard(title: "Street Smart", text: "Instincts meets analytics.", icon: "map")
                            BenefitCard(title: "Fan Brain", text: "Market sentiment & flows.", icon: "person.3.fill")
                            BenefitCard(title: "Signal Focus", text: "Only relevant stats.", icon: "antenna.radiowaves.left.and.right")
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
            loading = true
            let date = SupabaseAPI.todayEST()
            freePick = try? await SupabaseAPI.fetchAllPicks(date: date).first
            loading = false
            withAnimation(.easeOut(duration: 0.8)) {
                animateIn = true
            }
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
            LiquidGlassBackground(accentColor: Color(hex: "#8B5CF6"))
            
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
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loading = true
    @State private var error: String?
    
    private let timeframes = ["7d", "30d", "90d", "ytd", "all"]
    
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
                VStack(spacing: 20) {
                    // Header
                    Text("Billfold")
                        .font(.system(size: 28, weight: .heavy))
                        .tracking(-0.5)
                        .foregroundStyle(GaryColors.goldGradient)
                        .padding(.top, 8) // Extra after safe area
                    
                    // Segmented Control with Glass
                    segmentedControl
                    
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
                    Task { await loadData() }
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
        
        return HStack(spacing: 12) {
            KPICard(title: "RECORD", value: "\(record.wins)-\(record.losses)\(record.pushes > 0 ? "-\(record.pushes)" : "")")
            KPICard(title: "WIN RATE", value: String(format: "%.1f%%", winRate))
        }
    }
    
    private var recentPicksList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("RECENT PICKS")
                .font(.caption.bold())
                .foregroundStyle(GaryColors.lightGold)
            
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
                if selectedTab == 0 {
                    ForEach(Array(gameResults.enumerated()), id: \.offset) { _, result in
                        GameResultRow(result: result)
                    }
                } else {
                    ForEach(Array(propResults.enumerated()), id: \.offset) { _, result in
                        PropResultRow(result: result)
                    }
                }
            }
        }
    }
    
    private func loadData() async {
        loading = true
        error = nil
        
        do {
            let since = sinceDate(for: timeframe)
            async let games = SupabaseAPI.fetchGameResults(since: since)
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
        let results = selectedTab == 0
            ? gameResults.map { $0.result ?? "" }
            : propResults.map { $0.result ?? "" }
        
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
            }
            
            Text(text)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 90, alignment: .topLeading)
        .darkCard(cornerRadius: 14)
        .scaleEffect(isPressed ? 0.97 : 1.0)
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
    
    private var pickTextView: some View {
        let (pickPart, oddsPart) = Formatters.splitPickAndOdds(pick.pick)
        return HStack(spacing: 6) {
            Text(pickPart)
                .foregroundStyle(accentColor)
                .font(.title2.bold())
            if !oddsPart.isEmpty {
                Text(oddsPart)
                    .foregroundStyle(GaryColors.goldGradient)
                    .font(.title2.bold())
            }
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header Row
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: Sport.from(league: pick.league).icon)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(accentColor)
                        .padding(8)
                        .liquidGlassCircle()
                    
                    Text((pick.league ?? "").uppercased())
                        .font(.subheadline.bold())
                        .foregroundStyle(.primary)
                }
                
                Spacer()
                
                if let time = pick.time, !time.isEmpty {
                    Text(Formatters.formatGameTime(time))
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }
            
            // Teams
            HStack {
                Text(Formatters.shortTeamName(pick.awayTeam))
                    .font(.title3.bold())
                Spacer()
                Text("@")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
                Text(Formatters.shortTeamName(pick.homeTeam))
                    .font(.title3.bold())
            }
            .padding(.vertical, 4)
            
            // Divider
            Rectangle()
                .fill(accentColor.opacity(0.3))
                .frame(height: 1)
            
            // Pick Label
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .foregroundStyle(accentColor)
                Text("GARY'S PICK")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }
            
            // Pick Text
            pickTextView
            
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
    
    var body: some View {
        ZStack {
            LiquidGlassBackground(accentColor: accentColor)
            
            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.title2.bold())
                            .foregroundStyle(accentColor)
                        Text("Powered by Gary A.I.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
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
                    Text(content)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineSpacing(6)
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
        var clean = time
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
        
        let pattern = #"(.+?)\s+([-+]\d+\.?\d*)$"#
        var pickPart = pick
        var oddsPart = ""
        
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: pick, range: NSRange(pick.startIndex..., in: pick)) {
            if let pickRange = Range(match.range(at: 1), in: pick),
               let oddsRange = Range(match.range(at: 2), in: pick) {
                pickPart = String(pick[pickRange]).trimmingCharacters(in: .whitespaces)
                oddsPart = String(pick[oddsRange])
            }
        }
        
        let shortenedPick = shortenTeamNamesInPick(pickPart)
        return (shortenedPick, oddsPart)
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
}
