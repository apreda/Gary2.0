import SwiftUI

// MARK: - Data Models

struct BracketTeam: Identifiable, Codable {
    let id: String
    let name: String
    let seed: Int
    let shortName: String

    init(name: String, seed: Int, shortName: String? = nil) {
        self.id = "\(seed)-\(name)"
        self.name = name
        self.seed = seed
        self.shortName = shortName ?? name
    }
}

struct BracketMatchup: Identifiable {
    let id: String
    let round: Int // 1=R64, 2=R32, 3=S16, 4=E8, 5=FF, 6=Championship
    let position: Int // position within the round (0-based)
    let topTeam: BracketTeam?
    let bottomTeam: BracketTeam?
    var winner: BracketTeam? // Gary's pick
    let location: String
    let gameTime: String
    let region: String

    var roundName: String {
        switch round {
        case 1: return "ROUND OF 64"
        case 2: return "ROUND OF 32"
        case 3: return "SWEET 16"
        case 4: return "ELITE 8"
        case 5: return "FINAL FOUR"
        case 6: return "CHAMPIONSHIP"
        default: return "ROUND \(round)"
        }
    }
}

enum BracketRegion: String, CaseIterable {
    case east = "EAST"
    case west = "WEST"
    case south = "SOUTH"
    case midwest = "MIDWEST"

    var color: Color {
        switch self {
        case .east: return Color(hex: "#4A9EFF")
        case .west: return Color(hex: "#FF6B6B")
        case .south: return Color(hex: "#51CF66")
        case .midwest: return Color(hex: "#FFD43B")
        }
    }
}

// MARK: - Sample Data (placeholder until real bracket is populated)

struct BracketData {
    static func sampleBracket() -> [BracketRegion: [BracketMatchup]] {
        var bracket: [BracketRegion: [BracketMatchup]] = [:]

        for region in BracketRegion.allCases {
            var matchups: [BracketMatchup] = []

            let teams = sampleTeams(for: region)

            // Round of 64: 8 games per region
            for i in 0..<8 {
                let topSeed = [1,8,5,4,6,3,7,2][i]
                let bottomSeed = 17 - topSeed
                let top = teams.first { $0.seed == topSeed }
                let bottom = teams.first { $0.seed == bottomSeed }
                matchups.append(BracketMatchup(
                    id: "\(region.rawValue)-R64-\(i)",
                    round: 1, position: i,
                    topTeam: top, bottomTeam: bottom,
                    winner: top, // Gary picks higher seed as placeholder
                    location: sampleLocation(for: region, round: 1),
                    gameTime: "MAR 20", region: region.rawValue
                ))
            }

            // Round of 32: 4 games
            for i in 0..<4 {
                let r64a = matchups[i * 2]
                let r64b = matchups[i * 2 + 1]
                matchups.append(BracketMatchup(
                    id: "\(region.rawValue)-R32-\(i)",
                    round: 2, position: i,
                    topTeam: r64a.winner, bottomTeam: r64b.winner,
                    winner: r64a.winner,
                    location: sampleLocation(for: region, round: 2),
                    gameTime: "MAR 22", region: region.rawValue
                ))
            }

            // Sweet 16: 2 games
            for i in 0..<2 {
                let r32a = matchups[8 + i * 2]
                let r32b = matchups[8 + i * 2 + 1]
                matchups.append(BracketMatchup(
                    id: "\(region.rawValue)-S16-\(i)",
                    round: 3, position: i,
                    topTeam: r32a.winner, bottomTeam: r32b.winner,
                    winner: r32a.winner,
                    location: sampleLocation(for: region, round: 3),
                    gameTime: "MAR 27", region: region.rawValue
                ))
            }

            // Elite 8: 1 game
            let s16a = matchups[12]
            let s16b = matchups[13]
            matchups.append(BracketMatchup(
                id: "\(region.rawValue)-E8-0",
                round: 4, position: 0,
                topTeam: s16a.winner, bottomTeam: s16b.winner,
                winner: s16a.winner,
                location: sampleLocation(for: region, round: 4),
                gameTime: "MAR 29", region: region.rawValue
            ))

            bracket[region] = matchups
        }

        return bracket
    }

    static func sampleTeams(for region: BracketRegion) -> [BracketTeam] {
        let regionTeams: [BracketRegion: [(String, String)]] = [
            .east: [
                ("Duke", "DUKE"), ("Alabama", "BAMA"), ("Purdue", "PUR"),
                ("Marquette", "MARQ"), ("Clemson", "CLEM"), ("Illinois", "ILL"),
                ("BYU", "BYU"), ("Wisconsin", "WISC"), ("Drake", "DRAKE"),
                ("Memphis", "MEM"), ("UC San Diego", "UCSD"), ("Col. of Charleston", "COFC"),
                ("Vermont", "VER"), ("Montana St", "MTST"), ("Merrimack", "MER"),
                ("Norfolk St", "NORF")
            ],
            .west: [
                ("Houston", "HOU"), ("Tennessee", "TENN"), ("Kentucky", "UK"),
                ("Arizona", "ARIZ"), ("San Diego St", "SDSU"), ("Creighton", "CRE"),
                ("Dayton", "DAY"), ("Nebraska", "NEB"), ("Texas A&M", "TAMU"),
                ("Colorado", "COL"), ("New Mexico", "UNM"), ("McNeese", "MCN"),
                ("Samford", "SAM"), ("Grambling", "GRAM"), ("Colgate", "COLG"),
                ("Stetson", "STET")
            ],
            .south: [
                ("UConn", "UCONN"), ("Iowa St", "ISU"), ("North Carolina", "UNC"),
                ("Auburn", "AUB"), ("Gonzaga", "GONZ"), ("Baylor", "BAY"),
                ("Texas", "TEX"), ("Utah St", "USU"), ("FAU", "FAU"),
                ("Northwestern", "NW"), ("Long Beach St", "LBSU"), ("Oakland", "OAK"),
                ("W. Kentucky", "WKU"), ("Morehead St", "MOR"), ("Wagner", "WAG"),
                ("Montana", "MONT")
            ],
            .midwest: [
                ("Kansas", "KU"), ("Michigan St", "MSU"), ("St. Mary's", "SMC"),
                ("TCU", "TCU"), ("Oregon", "ORE"), ("Boise St", "BSU"),
                ("Grand Canyon", "GCU"), ("Florida", "FLA"), ("South Carolina", "SC"),
                ("Nevada", "NEV"), ("Yale", "YALE"), ("Duquesne", "DUQ"),
                ("Akron", "AKR"), ("Liberty", "LIB"), ("Stonehill", "STH"),
                ("Howard", "HOW")
            ]
        ]

        guard let teams = regionTeams[region] else { return [] }
        return teams.enumerated().map { index, team in
            BracketTeam(name: team.0, seed: index + 1, shortName: team.1)
        }
    }

    static func sampleLocation(for region: BracketRegion, round: Int) -> String {
        switch round {
        case 1, 2: return ["Omaha, NE", "Memphis, TN", "Charlotte, NC", "Salt Lake City, UT"][BracketRegion.allCases.firstIndex(of: region)!]
        case 3, 4: return ["Boston, MA", "Los Angeles, CA", "Dallas, TX", "Detroit, MI"][BracketRegion.allCases.firstIndex(of: region)!]
        case 5, 6: return "San Antonio, TX"
        default: return "TBD"
        }
    }
}

// MARK: - Main Bracket View

struct MarchMadnessBracketView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedRegion: BracketRegion = .east
    @State private var bracketData: [BracketRegion: [BracketMatchup]] = [:]
    @State private var selectedMatchup: BracketMatchup? = nil
    @State private var zoomScale: CGFloat = 1.0
    @State private var lastZoomScale: CGFloat = 1.0

    var body: some View {
        ZStack {
            // Background
            Color(hex: "#08080A").ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                bracketHeader

                // Region selector
                regionSelector

                // Bracket content
                if let matchups = bracketData[selectedRegion] {
                    bracketScrollView(matchups: matchups)
                } else {
                    Spacer()
                    ProgressView().tint(GaryColors.gold)
                    Spacer()
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            bracketData = BracketData.sampleBracket()
        }
        .sheet(item: $selectedMatchup) { matchup in
            MatchupDetailSheet(matchup: matchup)
        }
    }

    // MARK: - Header

    private var bracketHeader: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.white.opacity(0.08)))
            }

            Spacer()

            VStack(spacing: 2) {
                Text("GARY'S BRACKET")
                    .font(.custom("Inter-Bold", size: 18))
                    .tracking(2)
                    .foregroundStyle(GaryColors.goldGradient)
                Text("MARCH MADNESS 2026")
                    .font(.custom("JetBrainsMono-Regular", size: 10))
                    .tracking(1.5)
                    .foregroundStyle(.white.opacity(0.4))
            }

            Spacer()

            // Placeholder for symmetry
            Color.clear.frame(width: 36, height: 36)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    // MARK: - Region Selector

    private var regionSelector: some View {
        HStack(spacing: 4) {
            ForEach(BracketRegion.allCases, id: \.self) { region in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedRegion = region
                    }
                } label: {
                    VStack(spacing: 4) {
                        Text(region.rawValue)
                            .font(.custom("Inter-Bold", size: 11))
                            .tracking(1)

                        Rectangle()
                            .fill(selectedRegion == region ? region.color : .clear)
                            .frame(height: 2)
                    }
                    .foregroundStyle(selectedRegion == region ? .white : .white.opacity(0.4))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .background(
            Rectangle()
                .fill(Color.white.opacity(0.04))
        )
    }

    // MARK: - Bracket Scroll View

    private func bracketScrollView(matchups: [BracketMatchup]) -> some View {
        let r64 = matchups.filter { $0.round == 1 }.sorted { $0.position < $1.position }
        let r32 = matchups.filter { $0.round == 2 }.sorted { $0.position < $1.position }
        let s16 = matchups.filter { $0.round == 3 }.sorted { $0.position < $1.position }
        let e8 = matchups.filter { $0.round == 4 }.sorted { $0.position < $1.position }

        return ScrollView([.horizontal, .vertical], showsIndicators: false) {
            HStack(alignment: .top, spacing: 0) {
                // Round of 64
                BracketRoundColumn(
                    title: "ROUND OF 64",
                    matchups: r64,
                    spacing: 4,
                    topPadding: 0,
                    regionColor: selectedRegion.color,
                    onTap: { selectedMatchup = $0 }
                )

                // Connectors R64 -> R32
                BracketConnectors(count: 8, spacing: 4, matchHeight: 72)

                // Round of 32
                BracketRoundColumn(
                    title: "ROUND OF 32",
                    matchups: r32,
                    spacing: 80,
                    topPadding: 38,
                    regionColor: selectedRegion.color,
                    onTap: { selectedMatchup = $0 }
                )

                // Connectors R32 -> S16
                BracketConnectors(count: 4, spacing: 80, matchHeight: 72, topPadding: 38)

                // Sweet 16
                BracketRoundColumn(
                    title: "SWEET 16",
                    matchups: s16,
                    spacing: 236,
                    topPadding: 114,
                    regionColor: selectedRegion.color,
                    onTap: { selectedMatchup = $0 }
                )

                // Connectors S16 -> E8
                BracketConnectors(count: 2, spacing: 236, matchHeight: 72, topPadding: 114)

                // Elite 8
                BracketRoundColumn(
                    title: "ELITE 8",
                    matchups: e8,
                    spacing: 0,
                    topPadding: 268,
                    regionColor: selectedRegion.color,
                    onTap: { selectedMatchup = $0 }
                )
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .scaleEffect(zoomScale)
        }
        .gesture(
            MagnificationGesture()
                .onChanged { value in
                    let delta = value / lastZoomScale
                    lastZoomScale = value
                    zoomScale = min(max(zoomScale * delta, 0.5), 2.5)
                }
                .onEnded { _ in
                    lastZoomScale = 1.0
                }
        )
    }
}

// MARK: - Bracket Round Column

struct BracketRoundColumn: View {
    let title: String
    let matchups: [BracketMatchup]
    let spacing: CGFloat
    let topPadding: CGFloat
    let regionColor: Color
    let onTap: (BracketMatchup) -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Round header
            Text(title)
                .font(.custom("JetBrainsMono-Bold", size: 9))
                .tracking(1.5)
                .foregroundStyle(.white.opacity(0.3))
                .padding(.bottom, 12)

            VStack(spacing: spacing) {
                ForEach(matchups) { matchup in
                    BracketMatchupCard(
                        matchup: matchup,
                        regionColor: regionColor,
                        onTap: { onTap(matchup) }
                    )
                }
            }
            .padding(.top, topPadding)
        }
        .frame(width: 155)
    }
}

// MARK: - Bracket Matchup Card

struct BracketMatchupCard: View {
    let matchup: BracketMatchup
    let regionColor: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                // Top team
                teamRow(
                    team: matchup.topTeam,
                    isWinner: matchup.winner?.id == matchup.topTeam?.id
                )

                // Divider
                Rectangle()
                    .fill(Color.white.opacity(0.06))
                    .frame(height: 1)

                // Bottom team
                teamRow(
                    team: matchup.bottomTeam,
                    isWinner: matchup.winner?.id == matchup.bottomTeam?.id
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(hex: "#141416"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .frame(height: 72)
    }

    private func teamRow(team: BracketTeam?, isWinner: Bool) -> some View {
        HStack(spacing: 6) {
            // Seed
            Text(team.map { String($0.seed) } ?? "-")
                .font(.custom("JetBrainsMono-Bold", size: 11))
                .foregroundStyle(isWinner ? regionColor : .white.opacity(0.3))
                .frame(width: 22, alignment: .center)

            // Team name
            Text(team?.shortName ?? "TBD")
                .font(.custom("Inter-SemiBold", size: 12))
                .foregroundStyle(isWinner ? .white : .white.opacity(0.4))
                .lineLimit(1)

            Spacer()

            // Winner indicator
            if isWinner {
                Circle()
                    .fill(regionColor)
                    .frame(width: 6, height: 6)
                    .padding(.trailing, 8)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 35)
        .background(isWinner ? regionColor.opacity(0.06) : .clear)
    }
}

// MARK: - Bracket Connectors (lines between rounds)

struct BracketConnectors: View {
    let count: Int
    let spacing: CGFloat
    let matchHeight: CGFloat
    var topPadding: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            // Offset for round header
            Color.clear.frame(height: 24 + topPadding)

            VStack(spacing: spacing) {
                ForEach(0..<(count / 2), id: \.self) { i in
                    connectorPair
                }
            }
        }
        .frame(width: 24)
    }

    private var connectorPair: some View {
        let pairHeight = matchHeight * 2 + spacing

        return ZStack {
            // Horizontal lines from each matchup
            Path { path in
                let midTop = pairHeight * 0.25
                let midBottom = pairHeight * 0.75
                let center = pairHeight * 0.5

                // Top horizontal
                path.move(to: CGPoint(x: 0, y: midTop))
                path.addLine(to: CGPoint(x: 12, y: midTop))

                // Bottom horizontal
                path.move(to: CGPoint(x: 0, y: midBottom))
                path.addLine(to: CGPoint(x: 12, y: midBottom))

                // Vertical connecting
                path.move(to: CGPoint(x: 12, y: midTop))
                path.addLine(to: CGPoint(x: 12, y: midBottom))

                // Output horizontal
                path.move(to: CGPoint(x: 12, y: center))
                path.addLine(to: CGPoint(x: 24, y: center))
            }
            .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }
        .frame(height: pairHeight)
    }
}

// MARK: - Matchup Detail Sheet

struct MatchupDetailSheet: View {
    let matchup: BracketMatchup
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color(hex: "#08080A").ignoresSafeArea()

            VStack(spacing: 20) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(matchup.roundName)
                            .font(.custom("JetBrainsMono-Bold", size: 11))
                            .tracking(1.5)
                            .foregroundStyle(.white.opacity(0.4))
                        Text(matchup.gameTime)
                            .font(.custom("Inter-SemiBold", size: 14))
                            .foregroundStyle(.white.opacity(0.6))
                    }

                    Spacer()

                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.5))
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(.white.opacity(0.08)))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)

                // Matchup card
                VStack(spacing: 0) {
                    detailTeamRow(team: matchup.topTeam, isWinner: matchup.winner?.id == matchup.topTeam?.id)

                    HStack {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                        Text("VS")
                            .font(.custom("Inter-Bold", size: 10))
                            .foregroundStyle(.white.opacity(0.2))
                            .padding(.horizontal, 8)
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                    .padding(.horizontal, 16)

                    detailTeamRow(team: matchup.bottomTeam, isWinner: matchup.winner?.id == matchup.bottomTeam?.id)
                }
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(hex: "#141416"))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
                .padding(.horizontal, 20)

                // Gary's Pick
                if let winner = matchup.winner {
                    VStack(spacing: 8) {
                        Text("GARY'S PICK")
                            .font(.custom("JetBrainsMono-Bold", size: 10))
                            .tracking(2)
                            .foregroundStyle(GaryColors.gold)

                        HStack(spacing: 10) {
                            Text("\(winner.seed)")
                                .font(.custom("JetBrainsMono-Bold", size: 24))
                                .foregroundStyle(GaryColors.gold)
                            Text(winner.name)
                                .font(.custom("Inter-Bold", size: 22))
                                .foregroundStyle(.white)
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(GaryColors.gold.opacity(0.08))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1)
                                )
                        )
                    }
                    .padding(.top, 8)
                }

                // Location
                HStack(spacing: 6) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.3))
                    Text(matchup.location)
                        .font(.custom("Inter-Medium", size: 13))
                        .foregroundStyle(.white.opacity(0.4))
                }
                .padding(.top, 4)

                Spacer()
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private func detailTeamRow(team: BracketTeam?, isWinner: Bool) -> some View {
        HStack(spacing: 12) {
            // Seed badge
            Text(team.map { String($0.seed) } ?? "-")
                .font(.custom("JetBrainsMono-Bold", size: 18))
                .foregroundStyle(isWinner ? GaryColors.gold : .white.opacity(0.3))
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(isWinner ? GaryColors.gold.opacity(0.1) : Color.white.opacity(0.04))
                )

            // Team name
            Text(team?.name ?? "TBD")
                .font(.custom("Inter-Bold", size: 18))
                .foregroundStyle(isWinner ? .white : .white.opacity(0.4))

            Spacer()

            // Winner check
            if isWinner {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(GaryColors.gold)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

// MARK: - Bracket Entry Button (for Picks page)

struct MarchMadnessBanner: View {
    var body: some View {
        HStack(spacing: 12) {
            // Tournament icon
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(GaryColors.gold.opacity(0.12))
                    .frame(width: 40, height: 40)
                Image(systemName: "trophy.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(GaryColors.gold)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("MARCH MADNESS BRACKET")
                        .font(.custom("Inter-Bold", size: 13))
                        .tracking(0.5)
                        .foregroundStyle(.white)
                    Text("COMING SOON")
                        .font(.custom("Inter-Bold", size: 9))
                        .tracking(0.8)
                        .foregroundStyle(.black)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(GaryColors.gold))
                }
                Text("Gary will fill out his bracket and make a pick for every game this tournament. Coming Selection Sunday, March 15.")
                    .font(.custom("Inter-Regular", size: 11))
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(hex: "#141416"))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            LinearGradient(
                                colors: [GaryColors.gold.opacity(0.3), GaryColors.gold.opacity(0.05)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
    }
}
