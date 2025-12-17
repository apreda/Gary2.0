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
                    
                    // The Bears Brain Section - How Gary Works
                    VStack(alignment: .leading, spacing: 16) {
                        Text("THE BEARS BRAIN")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(GaryColors.gold)
                            .tracking(1)
                            .padding(.horizontal, 4)
                        
                        VStack(spacing: 14) {
                            HeroBenefitCard(title: "3-Stage Agentic Pipeline", text: "Every pick goes through three autonomous stages: (1) Hypothesis — form a sharp thesis on the game, (2) Investigation — pull 30+ metrics and test the theory, (3) The Judge — lock only when numbers converge. Only picks that survive all three stages make it to your screen.", badge: "HOW IT WORKS")
                            
                            HeroBenefitCard(title: "Sport-Specific Constitutions", text: "Gary doesn't dump stats—he requests them. For each game, he identifies which metrics actually matter for that matchup and pulls only the relevant data from 30+ available tokens per sport. NFL might need weather and EPA. NBA might need pace and rest. The constitution guides what to look for—the intelligence decides what to use.", badge: "TAILORED ANALYSIS")
                            
                            HeroBenefitCard(title: "Scout Report Builder", text: "Before the pipeline starts, Gary builds a comprehensive scout report: injuries by name, weather conditions, travel & rest factors, venue data, breaking news, bullpen usage, live odds movement, and lineup changes.", badge: "REAL-TIME INTEL")
                            
                            HeroBenefitCard(title: "Fan Brain", text: "The qualitative factors that pure stat models miss. Revenge Games (emotional edge from last loss), Trap Alerts (suspicious line movement), Letdown Spots (flat after emotional win), and Lookahead Spots (big game next week trap).", badge: "SOFT FACTORS")
                            
                            HeroBenefitCard(title: "Confidence Score", text: "Every pick gets an unbiased confidence score from 0.50 to 1.00. Gary can't inflate his own numbers—we filter out picks below our threshold so only the strongest analysis makes it through. What you see is genuine conviction, not marketing.", badge: "HONEST RATINGS")
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
        case .nhl, .epl, .ncaab: return true
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
        // Sort picks by game time (commence_time) - earliest games first
        let sortByTime: ([GaryPick]) -> [GaryPick] = { picks in
            picks.sorted { a, b in
                let timeA = a.commence_time ?? ""
                let timeB = b.commence_time ?? ""
                return timeA < timeB
            }
        }
        
        // Filter NFL picks on Mondays to only show today's games (MNF)
        let filterNFLForMonday: ([GaryPick]) -> [GaryPick] = { picks in
            let now = Date()
            
            // Get current day of week in EST
            var estCalendar = Calendar.current
            estCalendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
            let dayOfWeek = estCalendar.component(.weekday, from: now) // 1 = Sunday, 2 = Monday
            
            // If not Monday, return all picks
            guard dayOfWeek == 2 else { return picks }
            
            // It's Monday - filter NFL picks to only today's games
            let todayStart = estCalendar.startOfDay(for: now)
            let todayEnd = estCalendar.date(byAdding: .day, value: 1, to: todayStart) ?? now
            
            return picks.filter { pick in
                // Non-NFL picks pass through
                guard (pick.league ?? "").uppercased() == "NFL" else { return true }
                
                // NFL picks: check if game is today
                guard let commenceTime = pick.commence_time,
                      let gameDate = ISO8601DateFormatter().date(from: commenceTime) else {
                    return false
                }
                
                return gameDate >= todayStart && gameDate < todayEnd
            }
        }
        
        // Apply Monday filter to all picks
        let mondayFiltered = filterNFLForMonday(allPicks)
        
        // For "All" tab: interleave picks by sport (NBA, NFL, NCAAB, NHL, NCAAF, EPL, repeat)
        // This gives users variety as they scroll instead of all picks from one sport first
        guard selectedSport != .all else {
            return interleaveBySport(mondayFiltered)
        }
        return sortByTime(mondayFiltered.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue })
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
                            // All sports: Show picks grouped by time slot with headers
                            ForEach(picksByTimeSlot, id: \.timeSlot) { group in
                                // Time slot header
                                HStack {
                                    Rectangle()
                                        .fill(GaryColors.gold.opacity(0.5))
                                        .frame(height: 1)
                                    Text(group.timeSlot)
                                        .font(.system(size: 13, weight: .semibold))
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
        
        var result: [(category: String, label: String, picks: [PropPick])] = []
        if !standardPicks.isEmpty {
            result.append(("standard", "Regular", standardPicks))
        }
        if !underdogPicks.isEmpty {
            result.append(("underdog", "Value", underdogPicks))
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
                
                // Sport Filter (with props-only filters like NFL TDs)
                SportFilterBar(selected: $selectedSport, availableSports: availableSports, showPropsOnly: true)
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
                            // NFL TDs: Show with category section headers (Regular / Value)
                            if selectedSport == .nflTDs {
                                ForEach(tdPicksByCategory, id: \.category) { group in
                                    // Section Header
                                    HStack {
                                        Rectangle()
                                            .fill(group.category == "standard" ? Color(hex: "#3B82F6").opacity(0.6) : Color(hex: "#22C55E").opacity(0.6))
                                            .frame(width: 30, height: 2)
                                        
                                        Text(group.label)
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundStyle(group.category == "standard" ? Color(hex: "#3B82F6") : Color(hex: "#22C55E"))
                                        
                                        if group.category == "underdog" {
                                            Text("• +200 or better")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.secondary)
                                        }
                                        
                                        Rectangle()
                                            .fill(group.category == "standard" ? Color(hex: "#3B82F6").opacity(0.6) : Color(hex: "#22C55E").opacity(0.6))
                                            .frame(height: 2)
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.top, group.category == "underdog" ? 12 : 4)
                                    
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
                .foregroundStyle(GaryColors.gold)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(GaryColors.gold.opacity(0.15))
                )
            
            // Title - larger and gold
            Text(title)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(GaryColors.lightGold)
            
            // Full description text - always visible
            Text(text)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(Color.white.opacity(0.85))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: "#1A1814"), Color(hex: "#141416")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.5), GaryColors.gold.opacity(0.2)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1.5
                        )
                )
        )
        .shadow(color: GaryColors.gold.opacity(0.1), radius: 20, y: 8)
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
    
    /// Check if this is an NFL special game (divisional, primetime, etc.)
    private var nflGameContext: String? {
        guard isNFL, let ctx = pick.tournamentContext, !ctx.isEmpty else { return nil }
        return ctx
    }
    
    /// Get appropriate icon for NFL game context
    private var nflContextIcon: String {
        guard let ctx = nflGameContext?.lowercased() else { return "football.fill" }
        if ctx.contains("divisional") { return "flag.2.crossed.fill" }
        if ctx.contains("tnf") || ctx.contains("thursday") { return "moon.stars.fill" }
        if ctx.contains("snf") || ctx.contains("sunday night") { return "moon.fill" }
        if ctx.contains("mnf") || ctx.contains("monday") { return "moon.fill" }
        return "football.fill"
    }
    
    /// Extract pick text and odds separately, expanding team names for NBA, shortening for college
    private var pickParts: (pick: String, odds: String) {
        let parts = Formatters.splitPickAndOdds(pick.pick)
        let league = pick.league?.uppercased() ?? ""
        
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
                    
                    // NBA CUP badge for In-Season Tournament games
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
                    
                    // NFL game context badge (Divisional, TNF, SNF, MNF)
                    if let nflContext = nflGameContext {
                        HStack(spacing: 4) {
                            Image(systemName: nflContextIcon)
                                .font(.system(size: 8, weight: .bold))
                            Text(nflContext.uppercased())
                                .font(.system(size: 8, weight: .bold))
                        }
                        .foregroundStyle(accentColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(accentColor.opacity(0.2))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    
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
            VStack(spacing: 6) {
                HStack {
                    Text(Formatters.shortTeamName(pick.awayTeam, league: pick.league))
                        .font(.title3.bold())
                        .foregroundStyle(Color.white.opacity(0.75))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer()
                    // Show "vs" for neutral site, "@" for regular games
                    Text(pick.isNeutralSite == true ? "vs" : "@")
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
                
                // Venue (when available - e.g., NBA Cup neutral site games)
                if let venue = pick.venue, !venue.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 11))
                        Text(venue)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(Color.white.opacity(0.5))
                }
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
                    .minimumScaleFactor(0.6) // Allow more shrinking for long college team names
                
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
                            .fill(accentColor.opacity(isNFL ? 0.05 : 0.25))
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
            "EXPLOSIVENESS": "Big Plays",
            "HAVOC_RATE": "Havoc Rate",
            "HAVOC_ALLOWED": "Opp Havoc",
            "PASSING_TDS": "Pass TDs",
            "INTERCEPTIONS": "INTs",
            "RUSHING_TDS": "Rush TDs",
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
                    // Helper to abbreviate status
                    let statusAbbrev: (String?) -> String = { status in
                        guard let s = status?.lowercased() else { return "" }
                        if s.contains("out") { return "OUT" }
                        if s.contains("injured reserve") || s == "ir" || s.contains("ltir") { return "IR" }
                        if s.contains("doubtful") { return "D" }
                        if s.contains("questionable") { return "Q" }
                        if s.contains("probable") { return "P" }
                        if s.contains("day-to-day") || s.contains("dtd") { return "DTD" }
                        return ""
                    }
                    
                    // Helper to get status color (red for OUT/IR/D, orange for Q/DTD)
                    let statusColor: (String) -> Color = { abbrev in
                        switch abbrev {
                        case "OUT", "IR", "D": return .red.opacity(0.9)
                        case "Q", "DTD", "P": return .orange.opacity(0.9)
                        default: return .red.opacity(0.9)
                        }
                    }
                    
                    // Get injuries with status (name, abbreviation)
                    // Filter out corrupt entries (names with newlines, too short, or starting with common words)
                    let isValidName: (String?) -> Bool = { name in
                        guard let n = name, n.count >= 4 else { return false }
                        let lower = n.lowercased()
                        // Reject names that are clearly parsing errors
                        if n.contains("\n") || n.contains("\r") { return false }
                        if lower.hasPrefix("day") || lower.hasPrefix("out") || lower.hasPrefix("questionable") { return false }
                        return true
                    }
                    
                    let homeInjuriesList: [(name: String, status: String)] = (injuries.home ?? []).compactMap { injury in
                        guard isValidName(injury.name), let name = injury.name else { return nil }
                        let abbrev = statusAbbrev(injury.status)
                        guard !abbrev.isEmpty else { return nil }
                        return (name, abbrev)
                    }
                    let awayInjuriesList: [(name: String, status: String)] = (injuries.away ?? []).compactMap { injury in
                        guard isValidName(injury.name), let name = injury.name else { return nil }
                        let abbrev = statusAbbrev(injury.status)
                        guard !abbrev.isEmpty else { return nil }
                        return (name, abbrev)
                    }
                    
                    // Sort: OUT/IR/D first, then Q/DTD
                    let sortPriority: (String) -> Int = { abbrev in
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
        // Extract numeric values
        let homeNum = Double(home.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: "-", with: "")) ?? 0
        let awayNum = Double(away.replacingOccurrences(of: "%", with: "").replacingOccurrences(of: "-", with: "")) ?? 0
        
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
        
        // For records like "5-18", compare wins
        if token == "PACE_HOME_AWAY" || token == "HOME_AWAY_SPLITS" || token == "SPECIAL_TEAMS" {
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
        if token == "TURNOVER_MARGIN" || token == "TURNOVER_DIFF" || token == "POINT_DIFF" {
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
        return cat == "standard" ? "Regular Pick" : "Value Pick (+200+)"
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
                                
                                // Cleaned paragraphs with dividers
                                VStack(alignment: .leading, spacing: 0) {
                                    let paragraphs = cleanPropAnalysis(analysis)
                                    
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
