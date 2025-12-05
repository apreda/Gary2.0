import SwiftUI
import WebKit

// MARK: - Theme Colors

enum GaryColors {
    static let gold = Color(hex: "#B8953F")
    static let lightGold = Color(hex: "#D8B878")
    static let cream = Color(hex: "#F5F3EE")
    static let darkBg = Color(hex: "#0F0F10")
    static let cardBg = Color(red: 28/255, green: 28/255, blue: 28/255)
}

// MARK: - Home View

struct HomeView: View {
    @State private var freePick: GaryPick?
    @State private var loading = true
    
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [GaryColors.darkBg, Color(hex: "#141516")],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 22) {
                    // Today's Free Pick
                    if let pick = freePick {
                        Text("Today's Free Pick")
                            .padding(.top, 24)
                            .font(.title2.bold())
                            .foregroundColor(GaryColors.cream)
                        
                        PickCardMobile(pick: pick)
                            .padding(.horizontal)
                    }
                    
                    
                    // Benefits Grid
                    LazyVGrid(columns: [GridItem(.fixed(182), spacing: 12), GridItem(.fixed(182), spacing: 12)], spacing: 12) {
                        BenefitCard(title: "Statistical Brain", text: "Leverages sportsbook odds and player metrics to identify mispriced betting lines.", icon: "waveform.path.ecg")
                        BenefitCard(title: "Three-Layer Core", text: "Combines odds data, real-time storylines, and deep reasoning for each pick.", icon: "square.stack.3d.up")
                        BenefitCard(title: "Narrative Tracker", text: "Monitors fatigue, travel schedules, injuries, and lineup changes in real-time.", icon: "text.bubble")
                        BenefitCard(title: "Street Smart", text: "Blends old-school handicapping instincts with cutting-edge analytics.", icon: "map")
                        BenefitCard(title: "Fan Brain", text: "Reads market sentiment and sharp money flows to separate hype from value.", icon: "person.3.fill")
                        BenefitCard(title: "No Stat Dumping", text: "Agentic AI scouts only the most relevant stats per matchup—signal, not noise.", icon: "slider.horizontal.below.square.and.square.filled")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 28)
                }
            }
        }
        .task {
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
    
    /// Sport-specific accent color matching the website
    var accentColor: Color {
        switch self {
        case .all: return GaryColors.gold           // Default gold
        case .nba: return Color(hex: "#3B82F6")     // Blue
        case .wnba: return Color(hex: "#F97316")    // Orange
        case .nfl: return GaryColors.gold           // Original Gold
        case .ncaab: return Color(hex: "#8B5CF6")   // Purple
        case .ncaaf: return Color(hex: "#DC2626")   // Red
        case .mlb: return Color(hex: "#0EA5E9")     // Sky Blue
        case .nhl: return Color(hex: "#F97316")     // Orange
        }
    }
    
    /// Get Sport from league string
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
            HStack(spacing: 8) {
                ForEach(Sport.allCases, id: \.self) { sport in
                    let isAvailable = sport == .all || availableSports.contains(sport.rawValue)
                    let sportColor = sport.accentColor
                    
                    Button {
                        selected = sport
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: sport.icon)
                                .font(.system(size: 12))
                            Text(sport.rawValue)
                                .font(.caption.bold())
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(selected == sport ? sportColor : Color.white.opacity(0.08))
                        .foregroundColor(selected == sport ? .black : isAvailable ? .white : .gray.opacity(0.5))
                        .cornerRadius(20)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(selected == sport ? sportColor : Color.white.opacity(0.15), lineWidth: 1)
                        )
                    }
                    .disabled(!isAvailable)
                    .opacity(isAvailable ? 1 : 0.4)
                }
            }
            .padding(.horizontal, 16)
        }
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
            Color.black.opacity(0.96).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 8) {
                    Text("Gary's Picks")
                        .font(.largeTitle.bold())
                        .foregroundColor(GaryColors.gold)
                    
                    Text("AI-Powered Sports Analysis")
                        .foregroundColor(.gray)
                }
                .padding(.top, 16)
                .padding(.bottom, 12)
                
                // Sport Filter
                SportFilterBar(selected: $selectedSport, availableSports: availableSports)
                    .padding(.bottom, 12)
                
                // Content
                if loading {
                    Spacer()
                    ProgressView().tint(GaryColors.gold)
                    Spacer()
                } else if filteredPicks.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "sportscourt")
                            .font(.system(size: 40))
                            .foregroundColor(.gray)
                        Text(selectedSport == .all ? "No picks yet." : "No \(selectedSport.rawValue) picks today.")
                            .foregroundColor(.gray)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(filteredPicks) { pick in
                                PickCardMobile(pick: pick)
                                    .padding(.horizontal, 16)
                            }
                        }
                        .padding(.vertical, 8)
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
    }
    
    private func loadPicks() async {
        loading = true
        let date = SupabaseAPI.todayEST()
        if let arr = try? await SupabaseAPI.fetchAllPicks(date: date) {
            allPicks = arr.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }
        }
        loading = false
    }
}

// MARK: - Gary's Props View

struct GaryPropsView: View {
    @State private var allProps: [PropPick] = []
    @State private var loading = true
    @State private var selectedSport: Sport = .all
    
    private var filteredProps: [PropPick] {
        guard selectedSport != .all else { return allProps }
        return allProps.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue }
    }
    
    private var availableSports: Set<String> {
        Set(allProps.compactMap { $0.league?.uppercased() })
    }
    
    var body: some View {
        ZStack {
            Color.black.opacity(0.96).ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 8) {
                    Text("GARY PROPS")
                        .font(.largeTitle.bold())
                        .foregroundColor(GaryColors.gold)
                    
                    Text("AI-Powered Prop Betting")
                        .foregroundColor(.gray)
                }
                .padding(.top, 16)
                .padding(.bottom, 12)
                
                // Sport Filter
                SportFilterBar(selected: $selectedSport, availableSports: availableSports)
                    .padding(.bottom, 12)
                
                // Content
                if loading {
                    Spacer()
                    ProgressView().tint(GaryColors.gold)
                    Spacer()
                } else if filteredProps.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "person.fill.questionmark")
                            .font(.system(size: 40))
                            .foregroundColor(.gray)
                        Text(selectedSport == .all ? "No prop picks yet." : "No \(selectedSport.rawValue) props today.")
                            .foregroundColor(.gray)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(filteredProps) { prop in
                                PropCardMobile(prop: prop)
                                    .padding(.horizontal, 16)
                            }
                        }
                        .padding(.vertical, 8)
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
    }
    
    private func loadProps() async {
        loading = true
        let date = SupabaseAPI.todayEST()
        allProps = (try? await SupabaseAPI.fetchPropPicks(date: date)) ?? []
        loading = false
    }
}

// MARK: - Billfold View

struct BillfoldView: View {
    @State private var selectedTab = 0  // 0 = games, 1 = props
    @State private var timeframe = "all"
    @State private var gameResults: [GameResult] = []
    @State private var propResults: [PropResult] = []
    @State private var loading = true
    @State private var error: String?
    
    private let timeframes = ["7d", "30d", "90d", "ytd", "all"]
    
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#101112"), Color(hex: "#151617")],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 16) {
                    segmentedControl
                    timeframeButtons
                    metricsCards
                    recentPicksList
                }
                .padding(.horizontal, 16)
                .padding(.top, 20)
            }
        }
        .task { await loadData() }
    }
    
    // MARK: - Subviews
    
    private var segmentedControl: some View {
        HStack(spacing: 0) {
            segmentButton(title: "Game Picks", index: 0)
            segmentButton(title: "Prop Picks", index: 1)
        }
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(GaryColors.lightGold.opacity(0.5)))
    }
    
    private func segmentButton(title: String, index: Int) -> some View {
        Button {
            selectedTab = index
            Task { await loadData() }
        } label: {
            Text(title)
                .font(.subheadline.bold())
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
        }
        .background(selectedTab == index ? GaryColors.lightGold : Color.white.opacity(0.06))
        .foregroundColor(selectedTab == index ? Color(hex: "#1A1B1D") : .white)
        .cornerRadius(8)
    }
    
    private var timeframeButtons: some View {
        HStack(spacing: 8) {
            ForEach(timeframes, id: \.self) { tf in
                Button {
                    timeframe = tf
                    Task { await loadData() }
                } label: {
                    Text(tf.uppercased())
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(timeframe == tf ? Color.white.opacity(0.12) : Color.white.opacity(0.06))
                        .cornerRadius(8)
                }
                .foregroundColor(.white)
            }
            Spacer()
            Button { Task { await loadData() } } label: {
                Image(systemName: "arrow.clockwise")
                    .foregroundColor(GaryColors.lightGold)
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
        VStack(alignment: .leading, spacing: 10) {
            Text("RECENT PICKS")
                .foregroundColor(GaryColors.lightGold)
                .font(.headline)
            
            if loading {
                ProgressView().tint(GaryColors.lightGold)
            }
            
            if let error = error {
                Text(error).foregroundColor(.red)
            }
            
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
    
    // MARK: - Data Loading
    
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
            LinearGradient(
                colors: [Color(hex: "#101112"), Color(hex: "#151617")],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            WebContainer(url: URL(string: "https://www.betwithgary.ai/betcard")!)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .ignoresSafeArea(edges: .bottom)
    }
}

// MARK: - Reusable Components

struct HomeTile: View {
    let title: String
    let subtitle: String
    let icon: String
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(GaryColors.lightGold)
                .font(.system(size: 24))
                .frame(width: 36)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundColor(GaryColors.cream).font(.headline)
                Text(subtitle).foregroundColor(.white.opacity(0.6)).font(.subheadline)
            }
            Spacer()
        }
        .padding()
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(GaryColors.lightGold.opacity(0.8), lineWidth: 1.2))
        .cornerRadius(12)
    }
}

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
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if let icon = icon {
                    ZStack {
                        Circle().fill(GaryColors.gold.opacity(0.2))
                        Image(systemName: icon)
                            .foregroundColor(GaryColors.gold)
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .frame(width: 30, height: 30)
                }
                Text(title)
                    .foregroundColor(GaryColors.lightGold)
                    .font(.subheadline.bold())
                    .lineLimit(2)
            }
            Text(text)
                .foregroundColor(GaryColors.cream)
                .font(.system(size: 14))
                .lineLimit(4)
        }
        .padding(12)
        .frame(width: 182, height: 154, alignment: .topLeading)
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(GaryColors.lightGold.opacity(0.7), lineWidth: 1.0))
        .cornerRadius(12)
    }
}

struct Pill: View {
    let text: String
    var compact: Bool = false
    
    var body: some View {
        Text(text)
            .font(compact ? .caption.bold() : .subheadline)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .fontWeight(.bold)
            .foregroundColor(Color(hex: "#1A1B1D"))
            .padding(.horizontal, compact ? 10 : 14)
            .padding(.vertical, compact ? 6 : 10)
            .frame(height: compact ? 28 : 38)
            .background(GaryColors.lightGold)
            .cornerRadius(compact ? 14 : 20)
    }
}

struct KPICard: View {
    let title: String
    let value: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).foregroundColor(.gray).font(.caption.bold())
            Text(value).foregroundColor(GaryColors.lightGold).font(.title.bold())
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(GaryColors.lightGold.opacity(0.6), lineWidth: 1))
        .cornerRadius(12)
    }
}

struct GaryLogo: View {
    var size: CGFloat = 120
    
    var body: some View {
        AsyncImage(url: URL(string: "https://www.betwithgary.ai/coin2.png")) { phase in
            switch phase {
            case .empty:
                ProgressView().tint(GaryColors.gold)
            case .success(let img):
                img.resizable().scaledToFit().frame(width: size, height: size)
            case .failure:
                Image(systemName: "seal.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: size, height: size)
                    .foregroundColor(GaryColors.gold)
            @unknown default:
                EmptyView()
            }
        }
    }
}

// MARK: - Pick Cards

struct PickCardMobile: View {
    let pick: GaryPick
    @State private var showAnalysis = false
    
    /// Sport-specific accent color
    private var accentColor: Color {
        Sport.from(league: pick.league).accentColor
    }
    
    /// Split pick text: team/spread in accent color, odds in gold
    private var pickTextView: some View {
        let (pickPart, oddsPart) = Formatters.splitPickAndOdds(pick.pick)
        return HStack(spacing: 4) {
            Text(pickPart)
                .foregroundColor(accentColor)
                .font(.title2.bold())
            if !oddsPart.isEmpty {
                Text(oddsPart)
                    .foregroundColor(GaryColors.gold)
                    .font(.title2.bold())
            }
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: Sport.from(league: pick.league).icon)
                        .foregroundColor(accentColor)
                    Text((pick.league ?? "").uppercased())
                        .foregroundColor(.white)
                        .font(.subheadline.bold())
                }
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: "clock").foregroundColor(accentColor)
                    Text(Formatters.labelEST(pick.time))
                        .foregroundColor(accentColor)
                        .font(.subheadline.bold())
                }
            }
            
            // Teams (shortened to mascot only)
            HStack {
                Text(Formatters.shortTeamName(pick.awayTeam)).foregroundColor(.white).font(.title3.bold())
                Spacer()
                Text("@").foregroundColor(.gray)
                Spacer()
                Text(Formatters.shortTeamName(pick.homeTeam)).foregroundColor(.white).font(.title3.bold())
            }
            
            Divider().overlay(accentColor.opacity(0.3))
            
            // Pick
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundColor(accentColor)
                Text("GARY'S PICK").foregroundColor(.gray).font(.footnote.bold())
            }
            
            // Split pick text to show odds in gold
            pickTextView
            
            // Confidence
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis").foregroundColor(.gray)
                Text("Confidence: \(Formatters.confidencePercent(pick.confidence))%")
                    .foregroundColor(.gray)
                    .font(.subheadline)
            }
            
            // Analysis Button
            Button { showAnalysis.toggle() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "paperclip")
                    Text("Tap for Analysis")
                }
                .font(.footnote.bold())
                .foregroundColor(GaryColors.gold.opacity(0.8))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.06))
                .cornerRadius(12)
            }
            .sheet(isPresented: $showAnalysis) {
                AnalysisSheet(title: "Gary's Analysis", content: pick.rationale ?? "", accentColor: GaryColors.gold)
            }
        }
        .padding(16)
        .background(GaryColors.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(GaryColors.gold.opacity(0.9), lineWidth: 1.5))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.35), radius: 10, x: 0, y: 4)
    }
}

struct PropCardMobile: View {
    let prop: PropPick
    @State private var showAnalysis = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text((prop.player ?? prop.team) ?? "")
                        .foregroundColor(.white)
                        .font(.headline.bold())
                    if let team = prop.team {
                        Text(team).foregroundColor(.gray).font(.subheadline)
                    }
                }
                Spacer()
                Text(Formatters.americanOdds(prop.odds))
                    .foregroundColor(GaryColors.gold)
                    .font(.title3.bold())
            }
            
            Divider().overlay(Color.white.opacity(0.12))
            
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundColor(GaryColors.gold)
                Text("GARY'S PICK").foregroundColor(.gray).font(.caption.bold())
            }
            
            Text(Formatters.propDisplay(prop.prop))
                .foregroundColor(.white)
                .font(.headline)
            
            HStack {
                if let bet = prop.bet {
                    Text(bet.uppercased())
                        .foregroundColor(bet.lowercased() == "over" ? .green : .red)
                        .font(.subheadline.bold())
                }
                Spacer()
                if let ev = Formatters.computeEV(confidence: prop.confidence, american: prop.odds) {
                    Text("EV: \(String(format: "%.2f%%", ev))")
                        .foregroundColor(.gray)
                        .font(.footnote)
                }
            }
            
            if let analysis = prop.analysis, !analysis.isEmpty {
                Button { showAnalysis.toggle() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "paperclip")
                        Text("Tap for Analysis")
                    }
                    .font(.footnote.bold())
                    .foregroundColor(GaryColors.gold.opacity(0.7))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.06))
                    .cornerRadius(12)
                }
                .sheet(isPresented: $showAnalysis) {
                    BulletPointSheet(title: "Gary's Analysis", content: analysis)
                }
            }
        }
        .padding(16)
        .background(GaryColors.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(GaryColors.gold.opacity(0.9), lineWidth: 1.5))
        .cornerRadius(16)
        .shadow(color: .black.opacity(0.3), radius: 6, x: 0, y: 2)
    }
}

// MARK: - Result Rows

struct GameResultRow: View {
    let result: GameResult
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(Formatters.formatDate(result.game_date))
                    .foregroundColor(.gray)
                    .font(.caption)
                Spacer()
                Text(Formatters.americanOdds(result.odds?.value))
                    .foregroundColor(GaryColors.lightGold)
                    .font(.subheadline.bold())
            }
            
            Text(result.pick_text ?? result.matchup ?? "")
                .foregroundColor(.white)
                .font(.subheadline)
            
            HStack {
                Spacer()
                ResultBadge(result: result.result ?? "")
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.06)))
        .cornerRadius(10)
    }
}

struct PropResultRow: View {
    let result: PropResult
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(Formatters.formatDate(result.game_date))
                    .foregroundColor(.gray)
                    .font(.caption)
                Spacer()
                Text(Formatters.americanOdds(result.odds?.value))
                    .foregroundColor(GaryColors.lightGold)
                    .font(.subheadline.bold())
            }
            
            Text(Formatters.propResultTitle(result))
                .foregroundColor(.white)
                .font(.subheadline)
            
            HStack {
                Spacer()
                ResultBadge(result: result.result ?? "")
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.06)))
        .cornerRadius(10)
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
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.2))
            .foregroundColor(color)
            .cornerRadius(8)
    }
}

// MARK: - Sheets

struct AnalysisSheet: View {
    let title: String
    let content: String
    var accentColor: Color = GaryColors.gold
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
                .foregroundColor(accentColor)
            ScrollView {
                Text(content).foregroundColor(.white)
            }
        }
        .padding()
        .background(Color.black)
        .presentationDetents([.medium, .large])
    }
}

struct BulletPointSheet: View {
    let title: String
    let content: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
                .foregroundColor(GaryColors.gold)
            
            ScrollView {
                let bullets = content
                    .components(separatedBy: "•")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(bullets, id: \.self) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•").foregroundColor(GaryColors.gold)
                            Text(line)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color.black)
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Web Container

struct WebContainer: UIViewRepresentable {
    let url: URL
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.backgroundColor = .black
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

// MARK: - Button Styles

struct GoldButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundColor(Color(hex: "#1A1B1D"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(GaryColors.lightGold)
            .cornerRadius(10)
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

// MARK: - Formatters

enum Formatters {
    static func labelEST(_ time: String?) -> String {
        guard let time = time, !time.isEmpty else { return "" }
        return time.uppercased().contains("EST") ? time : "\(time) EST"
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
        return (ev * 100) / 10.0  // Scale down by 10x
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
    
    /// Shorten team name to just the mascot - e.g., "Dallas Cowboys" → "Cowboys"
    static func shortTeamName(_ team: String?) -> String {
        guard let team = team, !team.isEmpty else { return "" }
        let words = team.split(separator: " ")
        // Return last word (mascot), or full name if only one word
        return words.count > 1 ? String(words.last!) : team
    }
    
    /// Split pick text into (team/spread, odds) and shorten team name
    /// e.g., "Dallas Cowboys ML +145" → ("Cowboys ML", "+145")
    static func splitPickAndOdds(_ pick: String?) -> (String, String) {
        guard let pick = pick, !pick.isEmpty else { return ("", "") }
        
        // Look for odds pattern at the end: -110, +150, -7.5, etc.
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
        
        // Shorten team names in the pick part (e.g., "Dallas Cowboys" → "Cowboys")
        let shortenedPick = shortenTeamNamesInPick(pickPart)
        
        return (shortenedPick, oddsPart)
    }
    
    /// Shorten team names within a pick string
    private static func shortenTeamNamesInPick(_ pick: String) -> String {
        // Common city names to remove
        let cities = ["Dallas", "Detroit", "Los Angeles", "LA", "New York", "NY", "Boston", "Washington", 
                      "Golden State", "San Francisco", "San Antonio", "New Orleans", "Oklahoma City", "OKC",
                      "Minnesota", "Milwaukee", "Miami", "Memphis", "Indiana", "Houston", "Denver", 
                      "Cleveland", "Chicago", "Charlotte", "Brooklyn", "Atlanta", "Phoenix", "Portland",
                      "Sacramento", "Toronto", "Utah", "Orlando", "Philadelphia", "Cincinnati", "Baltimore",
                      "Pittsburgh", "Kansas City", "Las Vegas", "Seattle", "Tampa Bay", "Green Bay",
                      "New England", "Jacksonville", "Tennessee", "Arizona", "Carolina", "Buffalo"]
        
        var result = pick
        for city in cities {
            // Remove city name if followed by a space and more text
            let pattern = "\\b\(city)\\s+"
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                result = regex.stringByReplacingMatches(in: result, range: NSRange(result.startIndex..., in: result), withTemplate: "")
            }
        }
        return result.trimmingCharacters(in: .whitespaces)
    }
}

