import SwiftUI

// MARK: - Data Models

struct BracketTeam: Identifiable, Codable {
    let id: String
    let name: String
    let seed: Int
    let shortName: String
    let mascot: String?

    init(name: String, seed: Int, shortName: String? = nil, mascot: String? = nil) {
        self.id = "\(seed)-\(name)"
        self.name = name
        self.seed = seed
        self.shortName = shortName ?? name
        self.mascot = mascot
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

    var confidence: Double?
    var rationale: String?
    var isUpset: Bool?
    var topTeamPros: [String]?
    var topTeamCons: [String]?
    var bottomTeamPros: [String]?
    var bottomTeamCons: [String]?
    var actualWinner: String?
    var correct: Bool?

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

    var roundShortName: String {
        switch round {
        case 1: return "R64"
        case 2: return "R32"
        case 3: return "S16"
        case 4: return "E8"
        case 5: return "F4"
        case 6: return "FINAL"
        default: return "R\(round)"
        }
    }

    var roundDate: String {
        switch round {
        case 1: return "MAR 19-20"
        case 2: return "MAR 21-22"
        case 3: return "MAR 26-27"
        case 4: return "MAR 28-29"
        case 5: return "APR 4"
        case 6: return "APR 6"
        default: return ""
        }
    }
}

enum BracketRegion: String, CaseIterable {
    case east = "EAST"
    case west = "WEST"
    case south = "SOUTH"
    case midwest = "MIDWEST"

    var color: Color { GaryColors.gold }

    var isRightSide: Bool {
        self == .west || self == .midwest
    }
}

// MARK: - Layout Constants

private enum BracketLayout {
    static let cardWidth: CGFloat = 148
    static let cardHeight: CGFloat = 62
    static let cardCorner: CGFloat = 9
    static let roundSpacing: CGFloat = 32
    static let connectorWidth: CGFloat = 30
    static let regionHeaderHeight: CGFloat = 52
    static let regionLabelReserve: CGFloat = 12
    static let regionTrailingPadding: CGFloat = 8
    static let roundColumnGap: CGFloat = 58
    static let pairCardGap: CGFloat = 17
    static let pairVenueGap: CGFloat = 44
    static let regionBottomPadding: CGFloat = 8
    static let venueAboveCardOffset: CGFloat = 32
    static let masterRegionGap: CGFloat = 24
    static let centerStageOuterGap: CGFloat = 88
    static let centerStageInnerGap: CGFloat = 104
    static let centerStageBottomPadding: CGFloat = 40
    static let winnerBadgeGap: CGFloat = 78
    static let winnerBadgeSize = CGSize(width: 132, height: 94)
    static let regionLabelY: CGFloat = 1
    static let roundHeaderCenterY: CGFloat = 15
    static let regionLabelFontSize: CGFloat = 9.5
    static let roundHeaderFontSize: CGFloat = 17
    static let roundDateFontSize: CGFloat = 9
    static let pairVenueTitleFontSize: CGFloat = 9.8
    static let pairVenueSubtitleFontSize: CGFloat = 8.1
    static let gameVenueTitleFontSize: CGFloat = 8.9
    static let gameVenueSubtitleFontSize: CGFloat = 7.5

    // Shared app palette — muted graphite and gold instead of warm orange.
    static let bracketBg = GaryColors.darkBg
    static let cardBg = GaryColors.cardBg
    static let cardHighlightBg = GaryColors.elevatedBg
    static let darkBg = Color(hex: "#0C0C0F")
    static let panelBg = Color(hex: "#101014")
    static let panelStroke = GaryColors.glassBorder
    static let cardBorder = GaryColors.gold.opacity(0.16)
    static let connectorLine = Color(hex: "#B79D58").opacity(0.76)
    static let connectorGlow = GaryColors.warmGold.opacity(0.08)
    static let headerColor = Color.white.opacity(0.88)
    static let venueColor = Color.white.opacity(0.66)
    static let correctGreen = Color(hex: "#4ADE80")
    static let incorrectRed = Color(hex: "#F87171")
    static let subtleBorder = Color.white.opacity(0.08)
    static let ambientGold = GaryColors.gold
    static let ambientCopper = GaryColors.warmGold.opacity(0.2)
    static let stageGlow = GaryColors.lightGold.opacity(0.75)

    // Text colors — light on dark
    static let primaryText = Color.white
    static let secondaryText = Color.white.opacity(0.79)
    static let tertiaryText = Color.white.opacity(0.5)

    // Accent
    static let accentGold = GaryColors.gold              // #C9A227

    // Spacing
    static let r64VerticalSpacing: CGFloat = 4       // within a pair
    static let r64PairGap: CGFloat = 24              // between pairs (venue label goes here)
    // Calculated: cardH=56, pairH=116, pairH+pairGap=140
    static let r32VerticalSpacing: CGFloat = 84      // 140 - 56
    static let s16VerticalSpacing: CGFloat = 224     // s16g1 - s16g0 - 56
    static let e8VerticalSpacing: CGFloat = 0
    static let r32TopPad: CGFloat = 30               // pairH/2 - cardH/2
    static let s16TopPad: CGFloat = 100              // (r32g0 + r32g1)/2 - 28
    static let e8TopPad: CGFloat = 240               // (s16g0 + s16g1)/2 - 28
    static let regionGap: CGFloat = 60
}

private struct RegionBracketCanvasLayout {
    struct RegionLabel {
        let title: String
        let frame: CGRect
        let isTrailing: Bool
    }

    struct RoundHeader: Identifiable {
        let id: String
        let title: String
        let date: String
        let center: CGPoint
    }

    struct VenueLabel: Identifiable {
        enum Prominence: Equatable {
            case pairGap
            case game
        }

        let id: String
        let title: String
        let subtitle: String
        let center: CGPoint
        let prominence: Prominence
    }

    struct CardNode: Identifiable {
        let matchup: BracketMatchup
        let frame: CGRect

        var id: String { matchup.id }
    }

    struct Connector: Identifiable {
        let id: String
        let from: CGPoint
        let to: CGPoint
        let mirrored: Bool
    }

    let size: CGSize
    let regionLabel: RegionLabel
    let roundHeaders: [RoundHeader]
    let venues: [VenueLabel]
    let cards: [CardNode]
    let connectors: [Connector]
}

private struct BracketMasterCanvasLayout {
    struct RegionPlacement: Identifiable {
        let region: BracketRegion
        let origin: CGPoint
        let layout: RegionBracketCanvasLayout

        var id: BracketRegion { region }
        var frame: CGRect { CGRect(origin: origin, size: layout.size) }
    }

    struct CenterCard: Identifiable {
        enum Kind {
            case finalFour(pairing: String)
            case championship
        }

        let id: String
        let matchup: BracketMatchup
        let frame: CGRect
        let kind: Kind
    }

    struct WinnerBadge {
        let titleCenter: CGPoint
        let frame: CGRect
        let connectorStart: CGPoint
        let connectorEnd: CGPoint
        let winner: BracketTeam?
    }

    let size: CGSize
    let regions: [RegionPlacement]
    let centerCards: [CenterCard]
    let connectors: [RegionBracketCanvasLayout.Connector]
    let winnerBadge: WinnerBadge
}

// MARK: - Tournament Facts Data

private struct TournamentFact: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let stat: String
    let detail: String
}

private enum FactsDrawerTab: String, CaseIterable {
    case matchup = "MATCHUP"
    case pick = "PICK"
    case general = "FACTS"
}

private enum BracketTeamNameFormatter {
    private static let exactMappings: [String: (school: String, mascot: String?)] = [
        "Nebraska Cornhuskers": ("Nebraska", "Cornhuskers"),
        "St. John's Red Storm": ("St. John's", "Red Storm"),
        "Michigan State Spartans": ("Michigan State", "Spartans"),
        "Ohio State Buckeyes": ("Ohio State", "Buckeyes"),
        "North Carolina Tar Heels": ("North Carolina", "Tar Heels"),
        "South Florida Bulls": ("South Florida", "Bulls"),
        "Texas A&M Aggies": ("Texas A&M", "Aggies"),
        "UConn Huskies": ("UConn", "Huskies"),
        "UCF Knights": ("UCF", "Knights"),
        "VCU Rams": ("VCU", "Rams"),
        "UCLA Bruins": ("UCLA", "Bruins"),
        "TCU Horned Frogs": ("TCU", "Horned Frogs"),
        "BYU Cougars": ("BYU", "Cougars"),
        "SMU Mustangs": ("SMU", "Mustangs"),
        "Ole Miss Rebels": ("Ole Miss", "Rebels"),
        "Saint Mary's Gaels": ("Saint Mary's", "Gaels"),
        "St. Mary's Gaels": ("Saint Mary's", "Gaels"),
        "North Dakota State Bison": ("North Dakota State", "Bison"),
        "North Dakota St. Bison": ("North Dakota State", "Bison"),
        "Pennsylvania Quakers": ("Pennsylvania", "Quakers"),
        "USC Trojans": ("USC", "Trojans"),
        "UAB Blazers": ("UAB", "Blazers"),
        "NC State Wolfpack": ("NC State", "Wolfpack"),
        "Miami (FL) Hurricanes": ("Miami", "Hurricanes")
    ]

    private static let mascotSuffixes: [String] = [
        "Blue Devils", "Horned Frogs", "Red Storm", "Tar Heels", "Fighting Illini",
        "Crimson Tide", "Red Raiders", "Blue Raiders", "Golden Gophers", "Wolf Pack",
        "Ragin' Cajuns", "Thundering Herd", "Runnin' Rebels", "Roadrunners", "Gamecocks",
        "Fighting Irish", "Boilermakers", "Golden Eagles", "Mountaineers", "Musketeers",
        "Buckeyes", "Jayhawks", "Lancers", "Cardinals", "Bruins", "Knights", "Huskies",
        "Paladins", "Gators", "Tigers", "Hawkeyes", "Commodores", "Cowboys", "Bulls",
        "Volunteers", "Trojans", "Rams", "Quakers", "Gaels", "Aggies", "Cougars",
        "Vandals", "Wolverines", "Bulldogs", "Billikens", "Zips", "Raiders", "Wildcats",
        "Broncos", "Cyclones", "Bluejays", "Bears", "Panthers", "Hurricanes",
        "Bearcats", "Seminoles", "Sooners", "Eagles", "Owls", "Terrapins", "Sun Devils",
        "Hoosiers", "Badgers", "Razorbacks", "Longhorns", "Ducks", "Tritons", "Bonnies",
        "Lobos", "Racers", "Phoenix", "Mocs", "Friars", "Catamounts", "Highlanders",
        "River Hawks", "Pioneers", "Hawks", "Lions", "Falcons", "Pirates", "Shockers",
        "Mavericks", "Demons", "Dragons", "Bisons", "Bison", "Saints", "Rebels",
        "Mustangs", "Flames", "Cavaliers", "Scarlet Knights", "Anteaters", "Matadors",
        "Jackrabbits", "Blue Hens", "Greyhounds", "Titans", "Waves", "Colonials",
        "Monarchs", "Dons", "Lynx", "Ramblers", "Purple Aces", "Golden Flashes", "Lopes"
    ].sorted { $0.count > $1.count }

    static func team(from rawName: String, seed: Int) -> BracketTeam {
        let parsed = parse(rawName)
        return BracketTeam(
            name: rawName,
            seed: seed,
            shortName: parsed.school,
            mascot: parsed.mascot
        )
    }

    static func displayName(from rawName: String?) -> String? {
        guard let rawName, !rawName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return parse(rawName).school
    }

    private static func parse(_ rawName: String) -> (school: String, mascot: String?) {
        let trimmed = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.uppercased() != "TBD" else {
            return ("TBD", nil)
        }

        if let exact = exactMappings[trimmed] {
            return exact
        }

        for suffix in mascotSuffixes where trimmed.lowercased().hasSuffix(suffix.lowercased()) {
            let school = trimmed
                .dropLast(suffix.count)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !school.isEmpty {
                return (school, suffix)
            }
        }

        return (trimmed, nil)
    }
}

private let tournamentFacts: [TournamentFact] = [
    TournamentFact(icon: "flame.fill", title: "12 vs 5 Upsets", stat: "35.4%", detail: "12-seeds beat 5-seeds over a third of the time since 1985"),
    TournamentFact(icon: "shield.fill", title: "1-Seed Dominance", stat: "99.4%", detail: "1-seeds have lost in R64 only 4 times in 152 games"),
    TournamentFact(icon: "arrow.triangle.2.circlepath", title: "11-Seed Cinderellas", stat: "6 Final Fours", detail: "Loyola-Chicago, VCU, George Mason — 11-seeds crash the party"),
    TournamentFact(icon: "chart.bar.fill", title: "Chalk Wins R64", stat: "73.6%", detail: "Higher seeds win nearly 3 out of 4 first-round games"),
    TournamentFact(icon: "dollarsign.circle.fill", title: "ATS Sweet 16", stat: "52.1%", detail: "Underdogs cover the spread more often from Sweet 16 on"),
    TournamentFact(icon: "trophy.fill", title: "1-Seed Champions", stat: "63%", detail: "Since seeding began, most champions have been 1-seeds"),
    TournamentFact(icon: "exclamationmark.triangle.fill", title: "2 vs 15 Upsets", stat: "6.6%", detail: "15-seeds win about 1 in every 15 matchups vs 2-seeds"),
    TournamentFact(icon: "sportscourt.fill", title: "Home Court Edge", stat: "+3.2 pts", detail: "Teams playing near their campus get a measurable boost"),
]

// MARK: - Sample Data

struct BracketData {
    private static func resolvedRoundOneTeamName(_ rawName: String, for pick: BracketPick) -> String {
        let normalized = rawName.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard normalized == "TBD", pick.round == 1 else { return rawName }

        switch (pick.region.uppercased(), pick.game_number ?? -1, pick.seed1, pick.seed2) {
        case ("SOUTH", 1, 1, 16):
            return "Lehigh / Prairie View A&M"
        case ("MIDWEST", 1, 1, 16):
            return "UMBC / Howard"
        case ("MIDWEST", 5, 6, 11):
            return "Miami (OH) / SMU"
        case ("WEST", 5, 6, 11):
            return "Texas / NC State"
        default:
            return rawName
        }
    }

    static func sampleBracket() -> [BracketRegion: [BracketMatchup]] {
        var bracket: [BracketRegion: [BracketMatchup]] = [:]
        for region in BracketRegion.allCases {
            var matchups: [BracketMatchup] = []
            let teams = sampleTeams(for: region)
            for i in 0..<8 {
                let topSeed = [1,8,5,4,6,3,7,2][i]
                let bottomSeed = 17 - topSeed
                let top = teams.first { $0.seed == topSeed }
                let bottom = teams.first { $0.seed == bottomSeed }
                matchups.append(BracketMatchup(id: "\(region.rawValue)-R64-\(i)", round: 1, position: i, topTeam: top, bottomTeam: bottom, winner: top, location: sampleLocation(for: region, round: 1), gameTime: "MAR 20", region: region.rawValue))
            }
            for i in 0..<4 {
                matchups.append(BracketMatchup(id: "\(region.rawValue)-R32-\(i)", round: 2, position: i, topTeam: matchups[i*2].winner, bottomTeam: matchups[i*2+1].winner, winner: matchups[i*2].winner, location: sampleLocation(for: region, round: 2), gameTime: "MAR 22", region: region.rawValue))
            }
            for i in 0..<2 {
                matchups.append(BracketMatchup(id: "\(region.rawValue)-S16-\(i)", round: 3, position: i, topTeam: matchups[8+i*2].winner, bottomTeam: matchups[8+i*2+1].winner, winner: matchups[8+i*2].winner, location: sampleLocation(for: region, round: 3), gameTime: "MAR 27", region: region.rawValue))
            }
            matchups.append(BracketMatchup(id: "\(region.rawValue)-E8-0", round: 4, position: 0, topTeam: matchups[12].winner, bottomTeam: matchups[13].winner, winner: matchups[12].winner, location: sampleLocation(for: region, round: 4), gameTime: "MAR 29", region: region.rawValue))
            bracket[region] = matchups
        }
        return bracket
    }

    static func sampleTeams(for region: BracketRegion) -> [BracketTeam] {
        let regionTeams: [BracketRegion: [(String, String)]] = [
            .east: [("Duke","DUKE"),("Alabama","BAMA"),("Purdue","PUR"),("Marquette","MARQ"),("Clemson","CLEM"),("Illinois","ILL"),("BYU","BYU"),("Wisconsin","WISC"),("Drake","DRAKE"),("Memphis","MEM"),("UC San Diego","UCSD"),("Col. of Charleston","COFC"),("Vermont","VER"),("Montana St","MTST"),("Merrimack","MER"),("Norfolk St","NORF")],
            .west: [("Houston","HOU"),("Tennessee","TENN"),("Kentucky","UK"),("Arizona","ARIZ"),("San Diego St","SDSU"),("Creighton","CRE"),("Dayton","DAY"),("Nebraska","NEB"),("Texas A&M","TAMU"),("Colorado","COL"),("New Mexico","UNM"),("McNeese","MCN"),("Samford","SAM"),("Grambling","GRAM"),("Colgate","COLG"),("Stetson","STET")],
            .south: [("UConn","UCONN"),("Iowa St","ISU"),("North Carolina","UNC"),("Auburn","AUB"),("Gonzaga","GONZ"),("Baylor","BAY"),("Texas","TEX"),("Utah St","USU"),("FAU","FAU"),("Northwestern","NW"),("Long Beach St","LBSU"),("Oakland","OAK"),("W. Kentucky","WKU"),("Morehead St","MOR"),("Wagner","WAG"),("Montana","MONT")],
            .midwest: [("Kansas","KU"),("Michigan St","MSU"),("St. Mary's","SMC"),("TCU","TCU"),("Oregon","ORE"),("Boise St","BSU"),("Grand Canyon","GCU"),("Florida","FLA"),("South Carolina","SC"),("Nevada","NEV"),("Yale","YALE"),("Duquesne","DUQ"),("Akron","AKR"),("Liberty","LIB"),("Stonehill","STH"),("Howard","HOW")]
        ]
        guard let teams = regionTeams[region] else { return [] }
        return teams.enumerated().map { BracketTeam(name: $0.element.0, seed: $0.offset + 1, shortName: $0.element.0) }
    }

    static func sampleLocation(for region: BracketRegion, round: Int) -> String {
        let idx = BracketRegion.allCases.firstIndex(of: region)!
        switch round {
        case 1, 2: return ["Philadelphia, PA","San Diego, CA","Tampa, FL","St. Louis, MO"][idx]
        case 3, 4: return ["Washington, D.C.","San Jose, CA","Houston, TX","Chicago, IL"][idx]
        case 5, 6: return "Indianapolis, IN"
        default: return "TBD"
        }
    }

    static func sampleVenue(for region: BracketRegion, round: Int) -> String {
        let idx = BracketRegion.allCases.firstIndex(of: region)!
        switch round {
        case 1, 2: return ["Xfinity Mobile Arena","Viejas Arena","Benchmark Int'l Arena","Enterprise Center"][idx]
        case 3, 4: return ["Capital One Arena","SAP Center","Toyota Center","United Center"][idx]
        case 5, 6: return "Lucas Oil Stadium"
        default: return "TBD"
        }
    }

    static func buildFromPicks(_ picks: [BracketPick]) -> [BracketRegion: [BracketMatchup]] {
        var bracket: [BracketRegion: [BracketMatchup]] = [:]
        for region in BracketRegion.allCases {
            let regionPicks = picks.filter { $0.region.uppercased() == region.rawValue }
            var matchups: [BracketMatchup] = []
            for pick in regionPicks {
                let resolvedTeam1 = resolvedRoundOneTeamName(pick.team1, for: pick)
                let resolvedTeam2 = resolvedRoundOneTeamName(pick.team2, for: pick)
                let topTeam = BracketTeamNameFormatter.team(from: resolvedTeam1, seed: pick.seed1)
                let bottomTeam = BracketTeamNameFormatter.team(from: resolvedTeam2, seed: pick.seed2)
                let winner: BracketTeam? = pick.picked_to_advance != nil ? (pick.picked_to_advance == pick.team1 ? topTeam : bottomTeam) : nil
                matchups.append(BracketMatchup(id: pick.id, round: pick.round, position: pick.game_number ?? 0, topTeam: topTeam, bottomTeam: bottomTeam, winner: winner, location: "", gameTime: pick.date, region: pick.region.uppercased(), confidence: pick.bracket_confidence, rationale: pick.bracket_rationale, isUpset: pick.is_upset, topTeamPros: pick.team1_pros, topTeamCons: pick.team1_cons, bottomTeamPros: pick.team2_pros, bottomTeamCons: pick.team2_cons, actualWinner: pick.actual_winner, correct: pick.correct))
            }
            bracket[region] = matchups.sorted { a, b in
                if a.round != b.round { return a.round < b.round }
                return a.position < b.position
            }
        }
        return bracket
    }
}

// MARK: - Main Bracket View

struct MarchMadnessBracketView: View {
    @State private var selectedRegion: BracketRegion = .east
    @State private var pendingScrollRegion: BracketRegion = .east
    @State private var regionJumpToken: Int = 0
    @State private var isRegionScrollInFlight: Bool = false
    @State private var bracketData: [BracketRegion: [BracketMatchup]] = [:]
    @State private var selectedMatchup: BracketMatchup? = nil
    @State private var zoomScale: CGFloat = 1.0
    @State private var lastZoomScale: CGFloat = 1.0

    @State private var bracketPicks: [BracketPick] = []
    @State private var isLoading: Bool = true
    @State private var hasRealData: Bool = false
    @State private var showUpsets: Bool = false

    @State private var finalFourMatchups: [BracketMatchup] = []
    @State private var championshipMatchup: BracketMatchup? = nil

    // Zoom-to-game
    @State private var showGameZoom: Bool = false
    @State private var zoomedMatchup: BracketMatchup? = nil

    // Sliding facts panel
    @State private var showFactsPanel: Bool = false
    @State private var selectedFactsTab: FactsDrawerTab = .general

    var body: some View {
        ZStack(alignment: .trailing) {
            bracketBackdrop

            VStack(spacing: 0) {
                regionSelector

                ZStack {
                    if isLoading {
                        ProgressView()
                            .tint(BracketLayout.accentGold)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        drillDownBracketView
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            if !showGameZoom {
                factsExtensionDock
                    .padding(.top, 118)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                    .zIndex(30)
            }

            // Coming Soon overlay — blocks bracket until real data exists
            if !isLoading && !hasRealData {
                comingSoonOverlay
            }

            // Zoom-to-game view — fills the entire screen as a zoom-in
            if showGameZoom, let matchup = zoomedMatchup {
                GameZoomView(
                    matchup: matchup,
                    isPresented: $showGameZoom,
                    allMatchups: allMatchups
                )
                .transition(.asymmetric(
                    insertion: .scale(scale: 0.15).combined(with: .opacity),
                    removal: .scale(scale: 0.15).combined(with: .opacity)
                ))
                .zIndex(100)
            }
        }
        .preferredColorScheme(.dark)
        .gesture(rightEdgeSwipeGesture)
        .onAppear { loadBracketData() }
    }

    private var bracketBackdrop: some View {
        ZStack {
            BracketLayout.bracketBg.ignoresSafeArea()

            LinearGradient(
                colors: [
                    Color(hex: "#111114"),
                    Color(hex: "#0C0C0F"),
                    Color(hex: "#09090B")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    BracketLayout.ambientGold.opacity(0.12),
                    BracketLayout.ambientGold.opacity(0.03),
                    .clear
                ],
                center: UnitPoint(x: 0.5, y: 0.92),
                startRadius: 90,
                endRadius: 460
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    BracketLayout.ambientGold.opacity(0.1),
                    BracketLayout.ambientGold.opacity(0.025),
                    .clear
                ],
                center: UnitPoint(x: 0.5, y: 0.52),
                startRadius: 60,
                endRadius: 330
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    BracketLayout.ambientCopper.opacity(0.06),
                    .clear
                ],
                center: UnitPoint(x: 0.92, y: 0.24),
                startRadius: 20,
                endRadius: 260
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    Color.white.opacity(0.04),
                    .clear
                ],
                center: UnitPoint(x: 0.2, y: 0.0),
                startRadius: 12,
                endRadius: 220
            )
            .ignoresSafeArea()

            LinearGradient(
                colors: [
                    Color.white.opacity(0.03),
                    Color.clear,
                    Color.black.opacity(0.18)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        }
    }

    // MARK: - Drill-Down Navigation

    private func tapMatchup(_ matchup: BracketMatchup) {
        selectedMatchup = matchup
        zoomedMatchup = matchup
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            selectedFactsTab = .pick
            showFactsPanel = true
            showGameZoom = false
        }
    }

    private var drillDownBracketView: some View {
        ZStack {
            fullContinuousBracketView

            if showUpsets {
                upsetsOverlay
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Sliding Facts Panel (swipe from right edge)

    private var factsDrawer: some View {
        let panelWidth: CGFloat = 298

        return VStack(spacing: 0) {
            factsDrawerHeader
            Rectangle()
                .fill(Color.white.opacity(0.05))
                .frame(height: 1)

            switch selectedFactsTab {
            case .matchup:
                matchupFactsDrawerContent
            case .pick:
                pickFactsDrawerContent
            case .general:
                generalFactsDrawerContent
            }
        }
        .frame(width: panelWidth)
        .background(factsDrawerBackground)
    }

    private var factsExtensionDock: some View {
        GeometryReader { geo in
            let availableHeight = max(360, geo.size.height - 186)
            let drawerHeight = min(560, availableHeight)

            HStack(spacing: 0) {
                if showFactsPanel {
                    factsDrawer
                        .frame(height: drawerHeight)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }

                factsDockLauncher
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(.trailing, 0)
        }
        .allowsHitTesting(true)
    }

    private var factsDockLauncher: some View {
        Button {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                showFactsPanel.toggle()
            }
        } label: {
            VStack(spacing: 4) {
                Image("GaryIconBG")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 38, height: 38)
                    .shadow(color: GaryColors.gold.opacity(0.18), radius: 8, y: 2)

                ZStack {
                    Circle()
                        .fill(BracketLayout.panelBg.opacity(0.96))
                        .frame(width: 24, height: 24)
                        .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 0.8))
                    Image(systemName: showFactsPanel ? "chevron.right" : "chevron.left")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(BracketLayout.secondaryText)
                }
                .shadow(color: .black.opacity(0.24), radius: 10, y: 4)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: 0)
        .accessibilityLabel(showFactsPanel ? "Hide Gary facts" : "Show Gary facts")
    }

    private var factsDrawerHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("GARY INTEL")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(2.6)
                        .foregroundStyle(BracketLayout.accentGold)
                    Text(factsDrawerTitle)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(BracketLayout.primaryText)
                    Text(factsDrawerSubtitle)
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(BracketLayout.secondaryText)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { showFactsPanel = false }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(BracketLayout.primaryText.opacity(0.86))
                        .frame(width: 28, height: 28)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(Color.white.opacity(0.04))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(Color.white.opacity(0.08), lineWidth: 0.8)
                                )
                        )
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 14) {
                factsTabButton(.matchup)
                factsTabButton(.pick)
                factsTabButton(.general)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private var factsDrawerTitle: String {
        switch selectedFactsTab {
        case .matchup:
            if let matchup = selectedMatchup {
                return "\(matchup.topTeam?.shortName ?? "TBD") vs \(matchup.bottomTeam?.shortName ?? "TBD")"
            }
            return "Matchup Dossier"
        case .pick:
            if let winner = selectedMatchup?.winner {
                return "\(winner.shortName) To Advance"
            }
            return "Gary's Board"
        case .general:
            return "Tournament Briefing"
        }
    }

    private var factsDrawerSubtitle: String {
        switch selectedFactsTab {
        case .matchup:
            if selectedMatchup != nil {
                return "Team-vs-team scouting, mascots, and matchup notes."
            }
            return "Tap any matchup to load the scouting report here."
        case .pick:
            if selectedMatchup != nil {
                return "Gary's advancement call, confidence, and reasoning."
            }
            return "Tap any matchup to load Gary's pick and path here."
        case .general:
            return "Pinned notes and signals that stay with you as you move through the bracket."
        }
    }

    private func factsTabButton(_ tab: FactsDrawerTab) -> some View {
        let isActive = selectedFactsTab == tab

        return Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
                selectedFactsTab = tab
            }
        } label: {
            VStack(alignment: .leading, spacing: 7) {
                Text(tab.rawValue)
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(isActive ? BracketLayout.primaryText : BracketLayout.secondaryText)

                Rectangle()
                    .fill(isActive ? BracketLayout.accentGold : Color.white.opacity(0.1))
                    .frame(height: isActive ? 2.5 : 1)
                    .clipShape(Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    private var factsDrawerMetrics: some View {
        HStack(spacing: 0) {
            factsSummaryPill(title: "Record", value: "\(bracketRecord.correct)-\(bracketRecord.incorrect)")
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 1, height: 28)
            factsSummaryPill(title: "Upsets", value: "\(upsetPicks.count)")
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 1, height: 28)
            factsSummaryPill(title: "Top Conf", value: topConfidenceValue)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.032))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.055), lineWidth: 0.8)
                )
        )
    }

    private var generalFactsDrawerContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                factsSectionTitle("Board Snapshot", systemImage: "chart.bar.xaxis")
                factsDrawerMetrics

                if highestConfidenceMatchup != nil || featuredUpsetMatchup != nil {
                    factsSectionTitle("On Gary's Radar", systemImage: "scope")
                    drawerModule {
                        VStack(spacing: 0) {
                            if let focusMatchup = highestConfidenceMatchup {
                                factsSpotlightCard(
                                    matchup: focusMatchup,
                                    eyebrow: "HIGHEST CONFIDENCE",
                                    detail: focusMatchup.rationale ?? "The cleanest angle on the board right now."
                                )
                            }

                            if highestConfidenceMatchup != nil, featuredUpsetMatchup != nil {
                                drawerModuleDivider
                            }

                            if let upsetMatchup = featuredUpsetMatchup {
                                factsSpotlightCard(
                                    matchup: upsetMatchup,
                                    eyebrow: "UPSET RADAR",
                                    detail: upsetMatchup.rationale ?? "This is the underdog spot Gary is most willing to ride."
                                )
                            }
                        }
                    }
                }

                factsSectionTitle("Tournament Signals", systemImage: "sparkles")
                drawerModule(accent: Color.white.opacity(0.18)) {
                    VStack(spacing: 0) {
                        ForEach(Array(tournamentFacts.prefix(6).enumerated()), id: \.element.id) { index, fact in
                            if index > 0 {
                                drawerModuleDivider
                            }
                            factsInsightCard(fact)
                        }
                    }
                }
            }
            .padding(12)
            .padding(.bottom, 16)
        }
    }

    private var matchupFactsDrawerContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                if let matchup = selectedMatchup {
                    factsSectionTitle("Selected Matchup", systemImage: "scope")
                    matchupFocusCard(matchup)

                    factsSectionTitle("Team Intel", systemImage: "person.2.fill")
                    drawerModule {
                        VStack(spacing: 0) {
                            matchupTeamIntelCard(
                                team: matchup.topTeam,
                                pros: matchup.topTeamPros ?? [],
                                cons: matchup.topTeamCons ?? [],
                                isWinner: matchup.winner?.id == matchup.topTeam?.id
                            )
                            drawerModuleDivider
                            matchupTeamIntelCard(
                                team: matchup.bottomTeam,
                                pros: matchup.bottomTeamPros ?? [],
                                cons: matchup.bottomTeamCons ?? [],
                                isWinner: matchup.winner?.id == matchup.bottomTeam?.id
                            )
                        }
                    }

                    if let rationale = matchup.rationale, !rationale.isEmpty {
                        factsSectionTitle("Matchup Note", systemImage: "text.quote")
                        matchupRationaleCard(rationale)
                    }
                } else {
                    factsSectionTitle("Selected Matchup", systemImage: "cursorarrow.click.2")
                    matchupEmptyState
                }
            }
            .padding(12)
            .padding(.bottom, 16)
        }
    }

    private var pickFactsDrawerContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                if let matchup = selectedMatchup {
                    factsSectionTitle("Gary's Pick", systemImage: "sparkles.rectangle.stack.fill")
                    pickHeroCard(matchup)

                    if let winner = matchup.winner {
                        factsSectionTitle("Ticket To Advance", systemImage: "arrow.up.right")
                        pickWinnerSummaryCard(matchup, winner: winner)

                        let pickedTeamNotes = pickedTeamBreakdown(for: matchup)
                        factsSectionTitle("Why He's On \(winner.shortName)", systemImage: "person.crop.rectangle.stack.fill")
                        drawerModule {
                            matchupTeamIntelCard(
                                team: pickedTeamNotes.team,
                                pros: pickedTeamNotes.pros,
                                cons: pickedTeamNotes.cons,
                                isWinner: true
                            )
                        }
                    } else {
                        factsSectionTitle("Ticket To Advance", systemImage: "hourglass")
                        pickPendingState
                    }

                    if let rationale = matchup.rationale, !rationale.isEmpty {
                        factsSectionTitle("Why", systemImage: "text.quote")
                        matchupRationaleCard(rationale)
                    }

                    if matchup.correct != nil || matchup.actualWinner != nil {
                        factsSectionTitle("Result", systemImage: "checkmark.seal")
                        pickOutcomeCard(matchup)
                    }
                } else {
                    factsSectionTitle("Gary's Pick", systemImage: "cursorarrow.click.2")
                    pickEmptyState
                }
            }
            .padding(12)
            .padding(.bottom, 16)
        }
    }

    private func matchupFocusCard(_ matchup: BracketMatchup) -> some View {
        let venueInfo = matchupVenueInfo(for: matchup)

        return drawerModule {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(matchup.roundName)
                            .font(.system(size: 9, weight: .heavy))
                            .tracking(1.8)
                            .foregroundStyle(BracketLayout.accentGold)
                        Text(matchup.region)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(BracketLayout.primaryText.opacity(0.9))
                    }

                    Spacer()

                    if let confidence = matchup.confidence {
                        Text("\(Int(confidence))%")
                            .font(.system(size: 12, weight: .heavy, design: .monospaced))
                            .foregroundStyle(BracketLayout.accentGold)
                    }
                }

                HStack(alignment: .top, spacing: 14) {
                    VStack(spacing: 0) {
                        drawerMatchupLine(team: matchup.topTeam, isWinner: matchup.winner?.id == matchup.topTeam?.id)
                        drawerModuleDivider
                        drawerMatchupLine(team: matchup.bottomTeam, isWinner: matchup.winner?.id == matchup.bottomTeam?.id)
                    }
                    .padding(.vertical, 2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(alignment: .leading, spacing: 10) {
                        drawerInfoLine(
                            label: "Gary",
                            value: matchup.winner?.shortName ?? "Pending",
                            highlight: matchup.winner != nil
                        )
                        drawerInfoLine(label: "Seeds", value: seedMatchupText(for: matchup))
                        drawerInfoLine(label: "Angle", value: matchupAngleText(for: matchup))
                    }
                    .frame(width: 90, alignment: .leading)
                }

                drawerMetaLine(
                    [
                        matchup.roundShortName,
                        formattedDrawerDate(matchup.gameTime),
                        venueInfo?.venue ?? "",
                        venueInfo?.city ?? matchup.location
                    ].filter { !$0.isEmpty }
                )
            }
        }
    }

    private func matchupTeamIntelCard(team: BracketTeam?, pros: [String], cons: [String], isWinner: Bool) -> some View {
        let school = team?.shortName ?? "TBD"
        let mascot = team?.mascot ?? "Mascot TBD"
        let seed = team.map { "#\($0.seed)" } ?? "-"

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(seed)
                    .font(.system(size: 12.5, weight: .heavy, design: .monospaced))
                    .foregroundStyle(isWinner ? BracketLayout.accentGold : BracketLayout.secondaryText)
                    .frame(width: 28, alignment: .leading)

                VStack(alignment: .leading, spacing: 3) {
                    Text(school)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(BracketLayout.primaryText)
                        .lineLimit(1)
                    Text(mascot)
                        .font(.system(size: 9.5, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(BracketLayout.accentGold.opacity(0.78))
                }

                Spacer()

                if isWinner {
                    Text("PICK")
                        .font(.system(size: 8.5, weight: .heavy))
                        .tracking(1.4)
                        .foregroundStyle(BracketLayout.accentGold)
                }
            }

            if !pros.isEmpty || !cons.isEmpty {
                HStack(alignment: .top, spacing: 16) {
                    if !pros.isEmpty {
                        matchupBulletSection("Pros", items: Array(pros.prefix(2)), tint: BracketLayout.correctGreen)
                    }
                    if !cons.isEmpty {
                        matchupBulletSection("Watchouts", items: Array(cons.prefix(2)), tint: BracketLayout.incorrectRed)
                    }
                }
            } else {
                Text("Specific notes will populate here as Gary's matchup breakdown fills in.")
                    .font(.system(size: 11))
                    .foregroundStyle(BracketLayout.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 10)
    }

    private func matchupBulletSection(_ title: String, items: [String], tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 8, weight: .heavy))
                .tracking(1.4)
                .foregroundStyle(tint)
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 8) {
                    Rectangle()
                        .fill(tint.opacity(0.9))
                        .frame(width: 5, height: 1.4)
                        .padding(.top, 4)
                    Text(item)
                        .font(.system(size: 10.5))
                        .foregroundStyle(BracketLayout.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func matchupRationaleCard(_ rationale: String) -> some View {
        drawerModule(accent: Color.white.opacity(0.22)) {
            Text(rationale)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(BracketLayout.secondaryText)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func pickHeroCard(_ matchup: BracketMatchup) -> some View {
        let winnerName = matchup.winner?.shortName ?? "Pick Pending"
        let summary = pickSummaryText(for: matchup)
        let venueInfo = matchupVenueInfo(for: matchup)
        let opponentName: String = {
            guard let winner = matchup.winner else { return "TBD" }
            if matchup.topTeam?.id == winner.id {
                return matchup.bottomTeam?.shortName ?? "TBD"
            }
            return matchup.topTeam?.shortName ?? "TBD"
        }()

        return drawerModule {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("GARY'S EDGE")
                            .font(.system(size: 9, weight: .heavy))
                            .tracking(1.8)
                            .foregroundStyle(BracketLayout.accentGold)
                        Text(winnerName)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(BracketLayout.primaryText)
                            .lineLimit(2)
                        Text("to \(nextRoundName(for: matchup))")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(BracketLayout.primaryText.opacity(0.72))
                    }

                    Spacer(minLength: 10)

                    VStack(alignment: .trailing, spacing: 6) {
                        if let confidence = matchup.confidence {
                            Text("\(Int(confidence))%")
                                .font(.system(size: 15, weight: .heavy, design: .monospaced))
                                .foregroundStyle(BracketLayout.accentGold)
                        }

                        if matchup.isUpset == true {
                            pickStatusChip("UPSET", color: BracketLayout.incorrectRed)
                        }
                        if let correct = matchup.correct {
                            pickStatusChip(correct ? "HIT" : "MISS", color: correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed)
                        }
                    }
                }

                Text(summary)
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(BracketLayout.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 0) {
                    drawerInfoColumn(label: "Over", value: opponentName)
                    Rectangle()
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 1, height: 28)
                    drawerInfoColumn(label: "Seeds", value: seedMatchupText(for: matchup))
                    Rectangle()
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 1, height: 28)
                    drawerInfoColumn(
                        label: "Angle",
                        value: matchupAngleText(for: matchup),
                        highlight: matchup.isUpset == true
                    )
                }
                .padding(.vertical, 2)

                if let confidence = matchup.confidence {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.08))
                            Capsule()
                                .fill(GaryColors.goldGradient)
                                .frame(width: geo.size.width * CGFloat(confidence / 100.0))
                        }
                    }
                    .frame(height: 7)
                }

                drawerMetaLine(
                    [
                        matchup.region,
                        matchup.roundShortName,
                        formattedDrawerDate(matchup.gameTime),
                        venueInfo?.venue ?? "",
                        venueInfo?.city ?? matchup.location
                    ].filter { !$0.isEmpty }
                )
            }
        }
    }

    private func pickWinnerSummaryCard(_ matchup: BracketMatchup, winner: BracketTeam) -> some View {
        drawerModule {
            HStack(alignment: .top, spacing: 12) {
                Text("#\(winner.seed)")
                    .font(.system(size: 22, weight: .heavy, design: .monospaced))
                    .foregroundStyle(BracketLayout.accentGold)
                    .frame(width: 40, alignment: .leading)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Advancement Path")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.7)
                        .foregroundStyle(BracketLayout.accentGold)
                    Text("\(winner.shortName) advances to \(nextRoundName(for: matchup)).")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(BracketLayout.primaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    if let mascot = winner.mascot {
                        Text(mascot.uppercased())
                            .font(.system(size: 9, weight: .heavy))
                            .tracking(1.2)
                            .foregroundStyle(BracketLayout.secondaryText)
                    }
                }

                Spacer()
            }
        }
    }

    private func pickOutcomeCard(_ matchup: BracketMatchup) -> some View {
        let correct = matchup.correct
        let tint = resultTint(for: correct)
        let statusTitle = resultTitle(for: correct)
        let actualWinnerName = BracketTeamNameFormatter.displayName(from: matchup.actualWinner)

        return drawerModule(accent: tint) {
            HStack(spacing: 9) {
                Image(systemName: resultIcon(for: correct))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(tint)

                VStack(alignment: .leading, spacing: 3) {
                    Text(statusTitle)
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1.1)
                        .foregroundStyle(tint)

                    if let actualWinnerName {
                        Text("Actual winner: \(actualWinnerName)")
                            .font(.system(size: 11.5, weight: .medium))
                            .foregroundStyle(BracketLayout.primaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("This matchup will grade automatically once the result is logged.")
                            .font(.system(size: 11.5, weight: .medium))
                            .foregroundStyle(BracketLayout.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer()
            }
        }
    }

    private var pickPendingState: some View {
        emptyDrawerModule(
            title: "Gary hasn't locked a side to advance here yet.",
            detail: "Once the bracket is filled, this tab will show the winner, confidence, rationale, upset signal, and grading result for this exact matchup."
        )
    }

    private var matchupEmptyState: some View {
        emptyDrawerModule(
            title: "Tap any matchup on the bracket to load the scouting report.",
            detail: "This tab shows both teams, each mascot, and any matchup-specific notes once a game is selected."
        )
    }

    private var pickEmptyState: some View {
        emptyDrawerModule(
            title: "Tap any matchup on the bracket to load Gary's pick card.",
            detail: "This tab shows Gary's side to advance, his confidence, upset flags, the reason behind the pick, and the eventual grading result once that game resolves."
        )
    }

    private func matchupMetaPill(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(BracketLayout.secondaryText)
            .padding(.vertical, 2)
    }

    private func pickedTeamBreakdown(for matchup: BracketMatchup) -> (team: BracketTeam?, pros: [String], cons: [String]) {
        guard let winner = matchup.winner else {
            return (nil, [], [])
        }

        if matchup.topTeam?.id == winner.id {
            return (matchup.topTeam, matchup.topTeamPros ?? [], matchup.topTeamCons ?? [])
        }

        return (matchup.bottomTeam, matchup.bottomTeamPros ?? [], matchup.bottomTeamCons ?? [])
    }

    private func pickSummaryText(for matchup: BracketMatchup) -> String {
        guard let winner = matchup.winner else {
            return "Gary hasn't filled in an advancement pick for this matchup yet."
        }

        let opponent: BracketTeam?
        if matchup.topTeam?.id == winner.id {
            opponent = matchup.bottomTeam
        } else {
            opponent = matchup.topTeam
        }

        return "Gary has \(winner.shortName) moving past \(opponent?.shortName ?? "TBD")."
    }

    private func nextRoundName(for matchup: BracketMatchup) -> String {
        switch matchup.round {
        case 1: return "the Round of 32"
        case 2: return "the Sweet 16"
        case 3: return "the Elite 8"
        case 4: return "the Final Four"
        case 5: return "the Championship"
        case 6: return "the title game"
        default: return "the next round"
        }
    }

    private func seedMatchupText(for matchup: BracketMatchup) -> String {
        guard let topSeed = matchup.topTeam?.seed, let bottomSeed = matchup.bottomTeam?.seed else {
            return "--"
        }
        return "\(topSeed) vs \(bottomSeed)"
    }

    private func matchupAngleText(for matchup: BracketMatchup) -> String {
        if let correct = matchup.correct {
            return correct ? "Graded hit" : "Graded miss"
        }
        if matchup.isUpset == true {
            return "Dog live"
        }
        if matchup.winner == nil {
            return "Open"
        }
        if favoriteTeam(for: matchup)?.id == matchup.winner?.id {
            return "Chalk"
        }
        return "Dog side"
    }

    private func favoriteTeam(for matchup: BracketMatchup) -> BracketTeam? {
        guard let topTeam = matchup.topTeam, let bottomTeam = matchup.bottomTeam else {
            return matchup.topTeam ?? matchup.bottomTeam
        }
        return topTeam.seed <= bottomTeam.seed ? topTeam : bottomTeam
    }

    private func formattedDrawerDate(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"

        if let date = parser.date(from: trimmed) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "MMM d"
            return formatter.string(from: date).uppercased()
        }

        return trimmed.uppercased()
    }

    private func matchupVenueInfo(for matchup: BracketMatchup) -> (venue: String, city: String)? {
        if matchup.round == 5 || matchup.round == 6 {
            return ("Lucas Oil Stadium", "Indianapolis, IN")
        }

        guard let region = BracketRegion(rawValue: matchup.region.uppercased()) else {
            return matchup.location.isEmpty ? nil : ("", matchup.location)
        }

        let regionalVenues: [BracketRegion: (venue: String, city: String)] = [
            .east: ("Capital One Arena", "Washington, DC"),
            .south: ("Toyota Center", "Houston, TX"),
            .west: ("SAP Center", "San Jose, CA"),
            .midwest: ("United Center", "Chicago, IL"),
        ]

        let orderedMatchups = (bracketData[region] ?? [])
            .filter { $0.round == matchup.round }
            .sorted { $0.position < $1.position }

        guard let orderedIndex = orderedMatchups.firstIndex(where: { $0.id == matchup.id }) else {
            if let venue = regionalVenues[region] {
                return venue
            }
            return matchup.location.isEmpty ? nil : ("", matchup.location)
        }

        switch matchup.round {
        case 1:
            let venues = Self.r64Venues[region] ?? []
            let sourceIndex = (orderedIndex / 2) * 2
            return venues.indices.contains(sourceIndex) ? venues[sourceIndex] : nil
        case 2:
            let venues = Self.r32Venues[region] ?? []
            return venues.indices.contains(orderedIndex) ? venues[orderedIndex] : nil
        case 3, 4:
            return regionalVenues[region]
        default:
            return matchup.location.isEmpty ? nil : ("", matchup.location)
        }
    }

    private func pickStatusChip(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 8.5, weight: .heavy))
            .tracking(1.4)
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(color.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(color.opacity(0.18), lineWidth: 0.8)
                    )
            )
    }

    private func resultIcon(for correct: Bool?) -> String {
        switch correct {
        case .some(true):
            return "checkmark.seal.fill"
        case .some(false):
            return "xmark.seal.fill"
        case .none:
            return "hourglass.circle.fill"
        }
    }

    private func resultTitle(for correct: Bool?) -> String {
        switch correct {
        case .some(true):
            return "CORRECT"
        case .some(false):
            return "INCORRECT"
        case .none:
            return "PENDING RESULT"
        }
    }

    private func resultTint(for correct: Bool?) -> Color {
        switch correct {
        case .some(true):
            return BracketLayout.correctGreen
        case .some(false):
            return BracketLayout.incorrectRed
        case .none:
            return BracketLayout.accentGold
        }
    }

    private func drawerModule<Content: View>(
        accent: Color = BracketLayout.accentGold,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(accent.opacity(0.95))
                .frame(width: 2)

            content()
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.035))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.05), lineWidth: 0.8)
                )
        )
    }

    private var drawerModuleDivider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(maxWidth: .infinity, minHeight: 1, maxHeight: 1)
    }

    private func drawerMatchupLine(team: BracketTeam?, isWinner: Bool) -> some View {
        let seed = team.map { "\($0.seed)" } ?? "-"
        let name = team?.shortName ?? "TBD"

        return HStack(spacing: 8) {
            Text(seed)
                .font(.system(size: 13, weight: .heavy, design: .monospaced))
                .foregroundStyle(isWinner ? BracketLayout.accentGold : BracketLayout.tertiaryText)
                .frame(width: 24, alignment: .leading)

            Text(name)
                .font(.system(size: 15.5, weight: isWinner ? .bold : .semibold))
                .foregroundStyle(team == nil ? BracketLayout.tertiaryText : BracketLayout.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Spacer()

            if isWinner {
                Text("PICK")
                    .font(.system(size: 8.5, weight: .heavy))
                    .tracking(1.2)
                    .foregroundStyle(BracketLayout.accentGold)
            }
        }
        .padding(.vertical, 9)
    }

    private func drawerMetaLine(_ items: [String]) -> some View {
        HStack(spacing: 7) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 {
                    Circle()
                        .fill(BracketLayout.accentGold.opacity(0.6))
                        .frame(width: 3, height: 3)
                }
                matchupMetaPill(item)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func drawerInfoLine(label: String, value: String, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 7.5, weight: .heavy))
                .tracking(1.2)
                .foregroundStyle(BracketLayout.tertiaryText)
            Text(value)
                .font(.system(size: 11.5, weight: highlight ? .bold : .semibold))
                .foregroundStyle(highlight ? BracketLayout.accentGold : BracketLayout.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
    }

    private func drawerInfoColumn(label: String, value: String, highlight: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.system(size: 7.5, weight: .heavy))
                .tracking(1.2)
                .foregroundStyle(BracketLayout.tertiaryText)
            Text(value)
                .font(.system(size: 11.5, weight: highlight ? .bold : .semibold))
                .foregroundStyle(highlight ? BracketLayout.accentGold : BracketLayout.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
    }

    private func emptyDrawerModule(title: String, detail: String) -> some View {
        drawerModule(accent: Color.white.opacity(0.24)) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(BracketLayout.primaryText)
                Text(detail)
                    .font(.system(size: 10.8))
                    .foregroundStyle(BracketLayout.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var factsDrawerBackground: some View {
        EdgeDockShape(leadingRadius: 28, trailingRadius: 0)
            .fill(Color(hex: "#17181D").opacity(0.97))
            .overlay(
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.065),
                        BracketLayout.accentGold.opacity(0.035),
                        Color.clear,
                        Color.black.opacity(0.12)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .clipShape(EdgeDockShape(leadingRadius: 28, trailingRadius: 0))
            )
            .overlay(
                EdgeDockShape(leadingRadius: 28, trailingRadius: 0)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [
                                BracketLayout.accentGold.opacity(0.36),
                                BracketLayout.accentGold.opacity(0.08)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 1.5)
            }
            .shadow(color: .black.opacity(0.22), radius: 18, x: -6, y: 10)
    }

    private var topConfidenceValue: String {
        highestConfidenceMatchup.flatMap { matchup in
            matchup.confidence.map { "\(Int($0))%" }
        } ?? "--"
    }

    private func factsInsightCard(_ fact: TournamentFact) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(BracketLayout.accentGold.opacity(0.08))
                    .frame(width: 28, height: 28)
                Image(systemName: fact.icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(BracketLayout.accentGold)
            }

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(fact.title)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(BracketLayout.primaryText)
                    Spacer()
                    Text(fact.stat)
                        .font(.system(size: 12, weight: .heavy, design: .monospaced))
                        .foregroundStyle(BracketLayout.accentGold)
                }
                Text(fact.detail)
                    .font(.system(size: 10.5))
                    .foregroundStyle(BracketLayout.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 10)
    }

    private var highestConfidenceMatchup: BracketMatchup? {
        allMatchups
            .filter { $0.confidence != nil }
            .max { ($0.confidence ?? 0) < ($1.confidence ?? 0) }
    }

    private var featuredUpsetMatchup: BracketMatchup? {
        upsetPicks.max { ($0.confidence ?? 0) < ($1.confidence ?? 0) }
    }

    // Edge swipe to open facts panel
    private var rightEdgeSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 20, coordinateSpace: .global)
            .onEnded { value in
                // Swipe from right edge going left
                if value.startLocation.x > UIScreen.main.bounds.width - 30 && value.translation.width < -50 {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                        showFactsPanel = true
                    }
                }
            }
    }

    // MARK: - Full Continuous Bracket

    private var fullContinuousBracketView: some View {
        GeometryReader { geo in
            let availH = geo.size.height
            let masterLayout = continuousBracketCanvasLayout()
            let oneRegionH = masterLayout.regions.first(where: { $0.region == .east })?.layout.size.height ?? regionCanvasLayout(region: .east).size.height
            let baseScale = min((availH / oneRegionH) * 1.02, 1.1)
            let s = baseScale * zoomScale
            let topPadding: CGFloat = 0
            let horizontalPadding: CGFloat = 0
            let bottomPadding = max(geo.safeAreaInsets.bottom, 8) + 64
            let clampInsets = UIEdgeInsets(
                top: 4,
                left: 2,
                bottom: max(0, bottomPadding - 6),
                right: 6
            )

            ScrollViewReader { proxy in
                ScrollView([.horizontal, .vertical], showsIndicators: false) {
                    masterBracketCanvas(layout: masterLayout)
                        .scaleEffect(s, anchor: .topLeading)
                        .frame(width: masterLayout.size.width * s, height: masterLayout.size.height * s, alignment: .topLeading)
                        .padding(.top, topPadding)
                        .padding(.leading, horizontalPadding)
                        .padding(.trailing, horizontalPadding)
                        .padding(.bottom, bottomPadding)
                        .frame(minHeight: availH, alignment: .top)
                }
                .coordinateSpace(name: "BracketCanvas")
                .background(BracketScrollViewConfigurator(clampInsets: clampInsets))
                .onAppear {
                    jumpToRegion(pendingScrollRegion, with: proxy, animated: false)
                }
                .onChange(of: regionJumpToken) { _ in
                    jumpToRegion(pendingScrollRegion, with: proxy)
                }
                .onPreferenceChange(BracketRegionFramePreferenceKey.self) { frames in
                    syncSelectedRegion(using: frames, viewportSize: geo.size)
                }
            }
            .simultaneousGesture(
                MagnificationGesture()
                    .onChanged { value in
                        let delta = value / lastZoomScale
                        lastZoomScale = value
                        zoomScale = min(max(zoomScale * delta, 0.35), 3.0)
                    }
                    .onEnded { _ in lastZoomScale = 1.0 }
            )
        }
    }

    private func masterBracketCanvas(layout: BracketMasterCanvasLayout) -> some View {
        ZStack(alignment: .topLeading) {
            RegionBracketConnectorLayer(connectors: layout.connectors)
                .frame(width: layout.size.width, height: layout.size.height)

            ForEach(layout.regions) { placement in
                Color.clear
                    .frame(width: 1, height: 1)
                    .position(
                        x: placement.region.isRightSide ? placement.origin.x + placement.layout.size.width - 1 : placement.origin.x + 1,
                        y: placement.origin.y + 1
                    )
                    .id(regionScrollAnchorID(for: placement.region))
            }

            ForEach(layout.regions) { placement in
                RegionBracketCanvas(layout: placement.layout, onTap: tapMatchup)
                    .frame(width: placement.layout.size.width, height: placement.layout.size.height)
                    .position(
                        x: placement.origin.x + (placement.layout.size.width / 2),
                        y: placement.origin.y + (placement.layout.size.height / 2)
                    )
                    .id(placement.region)
                    .background(regionFrameReader(for: placement.region))
            }

            ForEach(layout.centerCards) { card in
                centerCardHeader(for: card)
                BracketMatchupCardEnhanced(matchup: card.matchup, regionColor: GaryColors.gold, onTap: { tapMatchup(card.matchup) })
                    .frame(width: card.frame.width, height: card.frame.height)
                    .position(x: card.frame.midX, y: card.frame.midY)
                centerCardVenue(for: card)
            }

            winnerBadgeView(layout.winnerBadge)
        }
        .frame(width: layout.size.width, height: layout.size.height, alignment: .topLeading)
    }

    private func jumpToRegion(_ region: BracketRegion, with proxy: ScrollViewProxy, animated: Bool = true) {
        isRegionScrollInFlight = true

        let scrollAction = {
            proxy.scrollTo(regionScrollAnchorID(for: region), anchor: region.isRightSide ? .topTrailing : .topLeading)
        }

        if animated {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                scrollAction()
            }
        } else {
            scrollAction()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
            isRegionScrollInFlight = false
        }
    }

    private func regionScrollAnchorID(for region: BracketRegion) -> String {
        "region-scroll-anchor-\(region.rawValue.lowercased())"
    }

    private func syncSelectedRegion(using frames: [BracketRegion: CGRect], viewportSize: CGSize) {
        guard !isRegionScrollInFlight else { return }
        guard
            let eastFrame = frames[.east],
            let southFrame = frames[.south],
            let westFrame = frames[.west],
            let midwestFrame = frames[.midwest]
        else {
            return
        }

        let viewportCenter = CGPoint(x: viewportSize.width / 2, y: viewportSize.height / 2)
        let leftStack = eastFrame.union(southFrame)
        let rightStack = westFrame.union(midwestFrame)
        let centerBuffer: CGFloat = 48

        let leftDistance = horizontalDistance(from: viewportCenter.x, to: leftStack)
        let rightDistance = horizontalDistance(from: viewportCenter.x, to: rightStack)

        if abs(leftDistance - rightDistance) <= centerBuffer {
            return
        }

        let candidateRegions: [BracketRegion] = leftDistance < rightDistance ? [.east, .south] : [.west, .midwest]

        guard let visibleRegion = candidateRegions.min(by: {
            regionDistance(from: frames[$0] ?? .zero, to: viewportCenter) < regionDistance(from: frames[$1] ?? .zero, to: viewportCenter)
        }) else {
            return
        }

        if visibleRegion != selectedRegion {
            selectedRegion = visibleRegion
        }
    }

    private func regionDistance(from frame: CGRect, to point: CGPoint) -> CGFloat {
        let center = CGPoint(x: frame.midX, y: frame.midY)
        let dx = center.x - point.x
        let dy = center.y - point.y
        return sqrt(dx * dx + dy * dy)
    }

    private func horizontalDistance(from x: CGFloat, to frame: CGRect) -> CGFloat {
        if frame.minX...frame.maxX ~= x {
            return 0
        }
        return min(abs(x - frame.minX), abs(x - frame.maxX))
    }

    private func regionFrameReader(for region: BracketRegion) -> some View {
        GeometryReader { proxy in
            Color.clear
                .preference(
                    key: BracketRegionFramePreferenceKey.self,
                    value: [region: proxy.frame(in: .named("BracketCanvas"))]
                )
        }
    }

    private func continuousBracketCanvasLayout() -> BracketMasterCanvasLayout {
        let eastLayout = regionCanvasLayout(region: .east)
        let southLayout = regionCanvasLayout(region: .south)
        let westLayout = regionCanvasLayout(region: .west, mirrored: true)
        let midwestLayout = regionCanvasLayout(region: .midwest, mirrored: true)

        let leftStackWidth = max(eastLayout.size.width, southLayout.size.width)
        let rightStackWidth = max(westLayout.size.width, midwestLayout.size.width)
        let regionGap = BracketLayout.masterRegionGap
        let cardW = BracketLayout.cardWidth
        let cardH = BracketLayout.cardHeight

        let eastOrigin = CGPoint(x: 0, y: 0)
        let southOrigin = CGPoint(x: 0, y: eastLayout.size.height + regionGap)
        let leftFinalFourX = leftStackWidth + BracketLayout.centerStageOuterGap
        let championshipX = leftFinalFourX + cardW + BracketLayout.centerStageInnerGap
        let rightFinalFourX = championshipX + cardW + BracketLayout.centerStageInnerGap
        let rightOriginX = rightFinalFourX + cardW + BracketLayout.centerStageOuterGap
        let westOrigin = CGPoint(x: rightOriginX, y: 0)
        let midwestOrigin = CGPoint(x: rightOriginX, y: westLayout.size.height + regionGap)

        let eastEliteEight = absoluteNode(forRound: 4, in: eastLayout, origin: eastOrigin)
        let southEliteEight = absoluteNode(forRound: 4, in: southLayout, origin: southOrigin)
        let westEliteEight = absoluteNode(forRound: 4, in: westLayout, origin: westOrigin)
        let midwestEliteEight = absoluteNode(forRound: 4, in: midwestLayout, origin: midwestOrigin)

        let leftFinalFourMatchup = finalFourMatchups.count > 0
            ? finalFourMatchups[0]
            : placeholderCenterMatchup(id: "FINAL-FOUR-LEFT", round: 5, position: 0, region: "FINAL FOUR")
        let rightFinalFourMatchup = finalFourMatchups.count > 1
            ? finalFourMatchups[1]
            : placeholderCenterMatchup(id: "FINAL-FOUR-RIGHT", round: 5, position: 1, region: "FINAL FOUR")
        let championship = championshipMatchup
            ?? placeholderCenterMatchup(id: "CHAMPIONSHIP", round: 6, position: 0, region: "CHAMPIONSHIP")

        let eastEliteEightMidY = eastEliteEight?.frame.midY ?? (eastOrigin.y + (eastLayout.size.height * 0.5))
        let southEliteEightMidY = southEliteEight?.frame.midY ?? (southOrigin.y + (southLayout.size.height * 0.5))
        let westEliteEightMidY = westEliteEight?.frame.midY ?? (westOrigin.y + (westLayout.size.height * 0.5))
        let midwestEliteEightMidY = midwestEliteEight?.frame.midY ?? (midwestOrigin.y + (midwestLayout.size.height * 0.5))

        let leftFinalFourFrame = CGRect(
            x: leftFinalFourX,
            y: ((eastEliteEightMidY + southEliteEightMidY) / 2) - (cardH / 2),
            width: cardW,
            height: cardH
        )
        let rightFinalFourFrame = CGRect(
            x: rightFinalFourX,
            y: ((westEliteEightMidY + midwestEliteEightMidY) / 2) - (cardH / 2),
            width: cardW,
            height: cardH
        )
        let championshipFrame = CGRect(
            x: championshipX,
            y: ((leftFinalFourFrame.midY + rightFinalFourFrame.midY) / 2) - (cardH / 2),
            width: cardW,
            height: cardH
        )

        let winnerTitleCenter = CGPoint(x: championshipFrame.midX, y: championshipFrame.maxY + 46)
        let winnerBadgeFrame = CGRect(
            x: championshipFrame.midX - (BracketLayout.winnerBadgeSize.width / 2),
            y: winnerTitleCenter.y + 18,
            width: BracketLayout.winnerBadgeSize.width,
            height: BracketLayout.winnerBadgeSize.height
        )

        let placements = [
            BracketMasterCanvasLayout.RegionPlacement(region: .east, origin: eastOrigin, layout: eastLayout),
            BracketMasterCanvasLayout.RegionPlacement(region: .south, origin: southOrigin, layout: southLayout),
            BracketMasterCanvasLayout.RegionPlacement(region: .west, origin: westOrigin, layout: westLayout),
            BracketMasterCanvasLayout.RegionPlacement(region: .midwest, origin: midwestOrigin, layout: midwestLayout),
        ]

        let centerCards = [
            BracketMasterCanvasLayout.CenterCard(
                id: leftFinalFourMatchup.id,
                matchup: leftFinalFourMatchup,
                frame: leftFinalFourFrame,
                kind: .finalFour(pairing: "EAST vs SOUTH")
            ),
            BracketMasterCanvasLayout.CenterCard(
                id: championship.id,
                matchup: championship,
                frame: championshipFrame,
                kind: .championship
            ),
            BracketMasterCanvasLayout.CenterCard(
                id: rightFinalFourMatchup.id,
                matchup: rightFinalFourMatchup,
                frame: rightFinalFourFrame,
                kind: .finalFour(pairing: "WEST vs MIDWEST")
            ),
        ]

        let connectors = [
            eastEliteEight.map { masterConnector(from: $0, to: leftFinalFourMatchup, targetFrame: leftFinalFourFrame, mirrored: false, id: "east-to-final-four") },
            southEliteEight.map { masterConnector(from: $0, to: leftFinalFourMatchup, targetFrame: leftFinalFourFrame, mirrored: false, id: "south-to-final-four") },
            westEliteEight.map { masterConnector(from: $0, to: rightFinalFourMatchup, targetFrame: rightFinalFourFrame, mirrored: true, id: "west-to-final-four") },
            midwestEliteEight.map { masterConnector(from: $0, to: rightFinalFourMatchup, targetFrame: rightFinalFourFrame, mirrored: true, id: "midwest-to-final-four") },
            masterConnector(
                from: leftFinalFourMatchup,
                sourceFrame: leftFinalFourFrame,
                to: championship,
                targetFrame: championshipFrame,
                mirrored: false,
                id: "left-final-four-to-championship"
            ),
            masterConnector(
                from: rightFinalFourMatchup,
                sourceFrame: rightFinalFourFrame,
                to: championship,
                targetFrame: championshipFrame,
                mirrored: true,
                id: "right-final-four-to-championship"
            ),
        ].compactMap { $0 }

        let stackHeight = max(
            southOrigin.y + southLayout.size.height,
            midwestOrigin.y + midwestLayout.size.height
        )
        let totalHeight = max(stackHeight, winnerBadgeFrame.maxY + BracketLayout.centerStageBottomPadding)
        let totalWidth = rightOriginX + rightStackWidth

        return BracketMasterCanvasLayout(
            size: CGSize(width: totalWidth, height: totalHeight),
            regions: placements,
            centerCards: centerCards,
            connectors: connectors,
            winnerBadge: .init(
                titleCenter: winnerTitleCenter,
                frame: winnerBadgeFrame,
                connectorStart: CGPoint(x: championshipFrame.midX, y: championshipFrame.maxY + 10),
                connectorEnd: CGPoint(x: championshipFrame.midX, y: winnerBadgeFrame.minY - 12),
                winner: championship.winner
            )
        )
    }

    private func placeholderCenterMatchup(id: String, round: Int, position: Int, region: String) -> BracketMatchup {
        BracketMatchup(
            id: id,
            round: round,
            position: position,
            topTeam: nil,
            bottomTeam: nil,
            winner: nil,
            location: "Indianapolis, IN",
            gameTime: round == 6 ? "APR 6" : "APR 4",
            region: region
        )
    }

    private enum BracketCardSlot {
        case top
        case bottom
    }

    private func absoluteNode(forRound round: Int, in layout: RegionBracketCanvasLayout, origin: CGPoint) -> RegionBracketCanvasLayout.CardNode? {
        guard let localNode = layout.cards.first(where: { $0.matchup.round == round }) else { return nil }
        return .init(matchup: localNode.matchup, frame: localNode.frame.offsetBy(dx: origin.x, dy: origin.y))
    }

    private func slot(for team: BracketTeam?, in matchup: BracketMatchup) -> BracketCardSlot? {
        guard let team else { return nil }
        if matchup.topTeam?.id == team.id || (matchup.topTeam?.name == team.name && matchup.topTeam?.seed == team.seed) {
            return .top
        }
        if matchup.bottomTeam?.id == team.id || (matchup.bottomTeam?.name == team.name && matchup.bottomTeam?.seed == team.seed) {
            return .bottom
        }
        return nil
    }

    private func rowCenterY(for slot: BracketCardSlot?, in frame: CGRect) -> CGFloat {
        guard let slot else { return frame.midY }
        let halfHeight = frame.height / 2
        switch slot {
        case .top:
            return frame.minY + (halfHeight / 2)
        case .bottom:
            return frame.minY + halfHeight + (halfHeight / 2)
        }
    }

    private func connectorPoint(for frame: CGRect, slot: BracketCardSlot?, mirrored: Bool, outgoing: Bool) -> CGPoint {
        CGPoint(
            x: outgoing ? (mirrored ? frame.minX : frame.maxX) : (mirrored ? frame.maxX : frame.minX),
            y: rowCenterY(for: slot, in: frame)
        )
    }

    private func masterConnector(
        from sourceNode: RegionBracketCanvasLayout.CardNode,
        to targetMatchup: BracketMatchup,
        targetFrame: CGRect,
        mirrored: Bool,
        id: String
    ) -> RegionBracketCanvasLayout.Connector {
        let winnerSlot = slot(for: sourceNode.matchup.winner, in: sourceNode.matchup)
        let targetSlot = slot(for: sourceNode.matchup.winner, in: targetMatchup)
        return .init(
            id: id,
            from: connectorPoint(for: sourceNode.frame, slot: winnerSlot, mirrored: mirrored, outgoing: true),
            to: connectorPoint(for: targetFrame, slot: targetSlot, mirrored: mirrored, outgoing: false),
            mirrored: mirrored
        )
    }

    private func masterConnector(
        from sourceMatchup: BracketMatchup,
        sourceFrame: CGRect,
        to targetMatchup: BracketMatchup,
        targetFrame: CGRect,
        mirrored: Bool,
        id: String
    ) -> RegionBracketCanvasLayout.Connector {
        let winnerSlot = slot(for: sourceMatchup.winner, in: sourceMatchup)
        let targetSlot = slot(for: sourceMatchup.winner, in: targetMatchup)
        return .init(
            id: id,
            from: connectorPoint(for: sourceFrame, slot: winnerSlot, mirrored: mirrored, outgoing: true),
            to: connectorPoint(for: targetFrame, slot: targetSlot, mirrored: mirrored, outgoing: false),
            mirrored: mirrored
        )
    }

    private func regionCanvasLayout(region: BracketRegion, mirrored: Bool = false) -> RegionBracketCanvasLayout {
        let matchups = bracketData[region] ?? []
        let r64 = matchups.filter { $0.round == 1 }.sorted { $0.position < $1.position }
        let r32 = matchups.filter { $0.round == 2 }.sorted { $0.position < $1.position }
        let s16 = matchups.filter { $0.round == 3 }.sorted { $0.position < $1.position }
        let e8 = matchups.filter { $0.round == 4 }.sorted { $0.position < $1.position }

        let cardW = BracketLayout.cardWidth
        let cardH = BracketLayout.cardHeight
        let roundGap = BracketLayout.roundColumnGap
        let regionWidth = BracketLayout.regionLabelReserve + (4 * cardW) + (3 * roundGap) + BracketLayout.regionTrailingPadding
        let pairHeight = (2 * cardH) + BracketLayout.pairCardGap
        let pairStep = pairHeight + BracketLayout.pairVenueGap
        let regionHeight = BracketLayout.regionHeaderHeight + (4 * pairHeight) + (3 * BracketLayout.pairVenueGap) + BracketLayout.regionBottomPadding

        let roundOrigins = (0..<4).map { BracketLayout.regionLabelReserve + (CGFloat($0) * (cardW + roundGap)) }

        func transform(_ rect: CGRect) -> CGRect {
            guard mirrored else { return rect }
            return CGRect(x: regionWidth - rect.maxX, y: rect.minY, width: rect.width, height: rect.height)
        }

        func transform(_ point: CGPoint) -> CGPoint {
            guard mirrored else { return point }
            return CGPoint(x: regionWidth - point.x, y: point.y)
        }

        func cardFrame(roundIndex: Int, centerY: CGFloat) -> CGRect {
            let frame = CGRect(x: roundOrigins[roundIndex], y: centerY - (cardH / 2), width: cardW, height: cardH)
            return transform(frame)
        }

        func connector(from source: RegionBracketCanvasLayout.CardNode, to target: RegionBracketCanvasLayout.CardNode, id: String) -> RegionBracketCanvasLayout.Connector {
            let winnerSlot = slot(for: source.matchup.winner, in: source.matchup)
            let targetSlot = slot(for: source.matchup.winner, in: target.matchup)
            return RegionBracketCanvasLayout.Connector(
                id: id,
                from: connectorPoint(for: source.frame, slot: winnerSlot, mirrored: mirrored, outgoing: true),
                to: connectorPoint(for: target.frame, slot: targetSlot, mirrored: mirrored, outgoing: false),
                mirrored: mirrored
            )
        }

        var cards: [RegionBracketCanvasLayout.CardNode] = []
        var connectors: [RegionBracketCanvasLayout.Connector] = []

        let r64Nodes = r64.enumerated().map { index, matchup in
            let pairIndex = CGFloat(index / 2)
            let inPairOffset = CGFloat(index % 2) * (cardH + BracketLayout.pairCardGap)
            let centerY = BracketLayout.regionHeaderHeight + (pairIndex * pairStep) + inPairOffset + (cardH / 2)
            let frame = cardFrame(roundIndex: 0, centerY: centerY)
            let node = RegionBracketCanvasLayout.CardNode(matchup: matchup, frame: frame)
            cards.append(node)
            return node
        }
        let r32Nodes = r32.enumerated().compactMap { index, matchup -> RegionBracketCanvasLayout.CardNode? in
            guard r64Nodes.count > (index * 2) + 1 else { return nil }
            let feederTop = r64Nodes[index * 2]
            let feederBottom = r64Nodes[(index * 2) + 1]
            let frame = cardFrame(roundIndex: 1, centerY: (feederTop.frame.midY + feederBottom.frame.midY) / 2)
            let node = RegionBracketCanvasLayout.CardNode(matchup: matchup, frame: frame)
            cards.append(node)
            connectors.append(connector(from: feederTop, to: node, id: "\(matchup.id)-top"))
            connectors.append(connector(from: feederBottom, to: node, id: "\(matchup.id)-bottom"))
            return node
        }
        let s16Nodes = s16.enumerated().compactMap { index, matchup -> RegionBracketCanvasLayout.CardNode? in
            guard r32Nodes.count > (index * 2) + 1 else { return nil }
            let feederTop = r32Nodes[index * 2]
            let feederBottom = r32Nodes[(index * 2) + 1]
            let frame = cardFrame(roundIndex: 2, centerY: (feederTop.frame.midY + feederBottom.frame.midY) / 2)
            let node = RegionBracketCanvasLayout.CardNode(matchup: matchup, frame: frame)
            cards.append(node)
            connectors.append(connector(from: feederTop, to: node, id: "\(matchup.id)-top"))
            connectors.append(connector(from: feederBottom, to: node, id: "\(matchup.id)-bottom"))
            return node
        }
        let e8Nodes = e8.enumerated().compactMap { index, matchup -> RegionBracketCanvasLayout.CardNode? in
            guard s16Nodes.count > (index * 2) + 1 else { return nil }
            let feederTop = s16Nodes[index * 2]
            let feederBottom = s16Nodes[(index * 2) + 1]
            let frame = cardFrame(roundIndex: 3, centerY: (feederTop.frame.midY + feederBottom.frame.midY) / 2)
            let node = RegionBracketCanvasLayout.CardNode(matchup: matchup, frame: frame)
            cards.append(node)
            connectors.append(connector(from: feederTop, to: node, id: "\(matchup.id)-top"))
            connectors.append(connector(from: feederBottom, to: node, id: "\(matchup.id)-bottom"))
            return node
        }

        let roundHeaders = [
            RegionBracketCanvasLayout.RoundHeader(id: "\(region.rawValue)-r64-header", title: "R64", date: "MAR 19-20", center: transform(CGPoint(x: roundOrigins[0] + (cardW / 2), y: BracketLayout.roundHeaderCenterY))),
            RegionBracketCanvasLayout.RoundHeader(id: "\(region.rawValue)-r32-header", title: "R32", date: "MAR 21-22", center: transform(CGPoint(x: roundOrigins[1] + (cardW / 2), y: BracketLayout.roundHeaderCenterY))),
            RegionBracketCanvasLayout.RoundHeader(id: "\(region.rawValue)-s16-header", title: "S16", date: "MAR 26-27", center: transform(CGPoint(x: roundOrigins[2] + (cardW / 2), y: BracketLayout.roundHeaderCenterY))),
            RegionBracketCanvasLayout.RoundHeader(id: "\(region.rawValue)-e8-header", title: "ELITE 8", date: "MAR 28-29", center: transform(CGPoint(x: roundOrigins[3] + (cardW / 2), y: BracketLayout.roundHeaderCenterY))),
        ]

        let regionLabelWidth: CGFloat = cardW
        let regionLabelFrame = mirrored
            ? CGRect(
                x: regionWidth - roundOrigins[0] - cardW,
                y: BracketLayout.regionLabelY,
                width: regionLabelWidth,
                height: 14
            )
            : CGRect(
                x: roundOrigins[0],
                y: BracketLayout.regionLabelY,
                width: regionLabelWidth,
                height: 14
            )

        let r64VenuePairs = Self.r64Venues[region] ?? []
        let r32VenuePairs = Self.r32Venues[region] ?? []
        let regionalVenues: [BracketRegion: (venue: String, city: String)] = [
            .east: ("Capital One Arena", "Washington, DC"),
            .south: ("Toyota Center", "Houston, TX"),
            .west: ("SAP Center", "San Jose, CA"),
            .midwest: ("United Center", "Chicago, IL"),
        ]
        let lateVenue = regionalVenues[region] ?? ("", "")

        var venues: [RegionBracketCanvasLayout.VenueLabel] = []

        for pairIndex in 0..<3 {
            let venueInfo = r64VenuePairs.count > ((pairIndex + 1) * 2) ? r64VenuePairs[(pairIndex + 1) * 2] : (venue: "", city: "")
            let y = BracketLayout.regionHeaderHeight + (CGFloat(pairIndex) * pairStep) + pairHeight + (BracketLayout.pairVenueGap / 2)
            venues.append(
                .init(
                    id: "\(region.rawValue)-r64-venue-\(pairIndex)",
                    title: venueInfo.venue,
                    subtitle: venueInfo.city,
                    center: transform(CGPoint(x: roundOrigins[0] + (cardW / 2), y: y)),
                    prominence: .pairGap
                )
            )
        }

        for (index, node) in r32Nodes.enumerated() {
            let venueInfo = r32VenuePairs.count > index ? r32VenuePairs[index] : (venue: "", city: "")
            venues.append(
                .init(
                    id: "\(region.rawValue)-r32-venue-\(index)",
                    title: venueInfo.venue,
                    subtitle: venueInfo.city,
                    center: CGPoint(x: node.frame.midX, y: node.frame.minY - BracketLayout.venueAboveCardOffset),
                    prominence: .game
                )
            )
        }

        for (index, node) in s16Nodes.enumerated() {
            venues.append(
                .init(
                    id: "\(region.rawValue)-s16-venue-\(index)",
                    title: lateVenue.venue,
                    subtitle: lateVenue.city,
                    center: CGPoint(x: node.frame.midX, y: node.frame.minY - BracketLayout.venueAboveCardOffset),
                    prominence: .game
                )
            )
        }

        for (index, node) in e8Nodes.enumerated() {
            venues.append(
                .init(
                    id: "\(region.rawValue)-e8-venue-\(index)",
                    title: lateVenue.venue,
                    subtitle: lateVenue.city,
                    center: CGPoint(x: node.frame.midX, y: node.frame.minY - BracketLayout.venueAboveCardOffset),
                    prominence: .game
                )
            )
        }

        return RegionBracketCanvasLayout(
            size: CGSize(width: regionWidth, height: regionHeight),
            regionLabel: .init(title: region.rawValue, frame: regionLabelFrame, isTrailing: mirrored),
            roundHeaders: roundHeaders,
            venues: venues,
            cards: cards,
            connectors: connectors
        )
    }

    /// One region rendered from a shared geometry model so cards, labels, and connectors stay aligned.
    private func bracketSide(region: BracketRegion, scale s: CGFloat, mirrored: Bool = false) -> some View {
        let layout = regionCanvasLayout(region: region, mirrored: mirrored)

        return RegionBracketCanvas(layout: layout, onTap: tapMatchup)
            .scaleEffect(s, anchor: .topLeading)
            .frame(width: layout.size.width * s, height: layout.size.height * s)
    }

    private func centerCardHeader(for card: BracketMasterCanvasLayout.CenterCard) -> some View {
        Group {
            switch card.kind {
            case .finalFour(let pairing):
                VStack(spacing: 2) {
                    Text("FINAL FOUR")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(2)
                        .foregroundStyle(BracketLayout.headerColor)
                    Text(pairing)
                        .font(.system(size: 8, weight: .bold))
                        .tracking(1.4)
                        .foregroundStyle(BracketLayout.accentGold.opacity(0.8))
                }
                .fixedSize()
                .position(x: card.frame.midX, y: card.frame.minY - 34)

            case .championship:
                VStack(spacing: 6) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [BracketLayout.accentGold, BracketLayout.accentGold.opacity(0.55)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                    Text("CHAMPIONSHIP")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(2.5)
                        .foregroundStyle(BracketLayout.accentGold)
                }
                .fixedSize()
                .position(x: card.frame.midX, y: card.frame.minY - 44)
            }
        }
    }

    private func centerCardVenue(for card: BracketMasterCanvasLayout.CenterCard) -> some View {
        let detail: (title: String, subtitle: String) = {
            switch card.kind {
            case .finalFour:
                return ("Lucas Oil Stadium", "Indianapolis, IN \u{00B7} APR 4")
            case .championship:
                return ("Lucas Oil Stadium", "Indianapolis, IN \u{00B7} APR 6")
            }
        }()

        return VStack(spacing: 1) {
            Text(detail.title)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(BracketLayout.venueColor)
            Text(detail.subtitle)
                .font(.system(size: 8))
                .foregroundStyle(BracketLayout.tertiaryText)
        }
        .fixedSize()
        .position(x: card.frame.midX, y: card.frame.maxY + 20)
    }

    private func winnerBadgeView(_ badge: BracketMasterCanvasLayout.WinnerBadge) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(BracketLayout.accentGold.opacity(0.35))
                .frame(width: 2, height: badge.connectorEnd.y - badge.connectorStart.y)
                .position(
                    x: badge.connectorStart.x,
                    y: (badge.connectorStart.y + badge.connectorEnd.y) / 2
                )

            Text("GARY'S PICK TO WIN IT ALL")
                .font(.system(size: 10, weight: .heavy))
                .tracking(2.4)
                .foregroundStyle(BracketLayout.accentGold)
                .fixedSize()
                .position(badge.titleCenter)

            VStack(spacing: 6) {
                if let winner = badge.winner {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(BracketLayout.accentGold)
                    Text("#\(winner.seed)")
                        .font(.system(size: 24, weight: .heavy, design: .monospaced))
                        .foregroundStyle(BracketLayout.accentGold)
                    Text(winner.shortName)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(BracketLayout.primaryText)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                } else {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(BracketLayout.tertiaryText)
                    Text("TBD")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(BracketLayout.tertiaryText)
                }
            }
            .frame(width: badge.frame.width, height: badge.frame.height)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(BracketLayout.cardBg)
                    .overlay(
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(BracketLayout.accentGold.opacity(badge.winner == nil ? 0.18 : 0.3), lineWidth: 1)
                    )
            )
            .position(x: badge.frame.midX, y: badge.frame.midY)
        }
    }

    /// Final Four fanned card — two teams spread vertically with region labels
    private func ffFannedCard(index: Int, scale s: CGFloat, topRegion: String, bottomRegion: String) -> some View {
        let ff: BracketMatchup? = finalFourMatchups.count > index ? finalFourMatchups[index] : nil
        let cardW = BracketLayout.cardWidth * s * 1.4
        let teamH: CGFloat = 36 * s

        return VStack(spacing: 0) {
            Text("FINAL FOUR")
                .font(.system(size: 8 * s, weight: .heavy))
                .tracking(1.5 * s)
                .foregroundStyle(BracketLayout.headerColor)
                .fixedSize()
                .padding(.bottom, 6 * s)

            // Top team (from top region)
            VStack(spacing: 3 * s) {
                Text(topRegion)
                    .font(.system(size: 6 * s, weight: .bold))
                    .tracking(1 * s)
                    .foregroundStyle(BracketLayout.accentGold.opacity(0.6))
                    .fixedSize()
                ffTeamRow(team: ff?.topTeam, isPick: ff?.winner?.id == ff?.topTeam?.id, scale: s)
                    .frame(width: cardW, height: teamH)
                    .background(RoundedRectangle(cornerRadius: 5 * s).fill(BracketLayout.cardBg).overlay(RoundedRectangle(cornerRadius: 5 * s).stroke(BracketLayout.cardBorder, lineWidth: 0.8)))
            }

            // VS / connector between teams — tall gap to fan out
            VStack(spacing: 2 * s) {
                Rectangle().fill(BracketLayout.accentGold.opacity(0.3)).frame(width: 1.5, height: 80 * s)
                Text("VS")
                    .font(.system(size: 8 * s, weight: .heavy))
                    .foregroundStyle(BracketLayout.accentGold.opacity(0.4))
                Rectangle().fill(BracketLayout.accentGold.opacity(0.3)).frame(width: 1.5, height: 80 * s)
            }

            // Bottom team (from bottom region)
            VStack(spacing: 3 * s) {
                ffTeamRow(team: ff?.bottomTeam, isPick: ff?.winner?.id == ff?.bottomTeam?.id, scale: s)
                    .frame(width: cardW, height: teamH)
                    .background(RoundedRectangle(cornerRadius: 5 * s).fill(BracketLayout.cardBg).overlay(RoundedRectangle(cornerRadius: 5 * s).stroke(BracketLayout.cardBorder, lineWidth: 0.8)))
                Text(bottomRegion)
                    .font(.system(size: 6 * s, weight: .bold))
                    .tracking(1 * s)
                    .foregroundStyle(BracketLayout.accentGold.opacity(0.6))
                    .fixedSize()
            }

            Text("APR 4 \u{00B7} Lucas Oil Stadium")
                .font(.system(size: 5 * s))
                .foregroundStyle(BracketLayout.tertiaryText)
                .fixedSize()
                .padding(.top, 5 * s)
        }
        .fixedSize(horizontal: true, vertical: false)
        .onTapGesture { if let ff = ff { tapMatchup(ff) } }
    }

    private func ffTeamRow(team: BracketTeam?, isPick: Bool, scale s: CGFloat) -> some View {
        let isTBD = team == nil || team?.name == "TBD" || team?.seed == 0
        return HStack(spacing: 5 * s) {
            RoundedRectangle(cornerRadius: 1)
                .fill(isPick ? BracketLayout.accentGold : BracketLayout.accentGold.opacity(0.3))
                .frame(width: 3 * s)
                .padding(.vertical, 5 * s)
            Text(isTBD ? "-" : "\(team?.seed ?? 0)")
                .font(.system(size: 13 * s, weight: .bold, design: .monospaced))
                .foregroundStyle(isPick ? BracketLayout.accentGold : BracketLayout.tertiaryText)
            Text(isTBD ? "TBD" : (team?.name ?? "TBD"))
                .font(.system(size: 13 * s, weight: isPick ? .bold : .medium))
                .foregroundStyle(isTBD ? BracketLayout.tertiaryText : (isPick ? BracketLayout.primaryText : BracketLayout.secondaryText))
                .lineLimit(1)
            Spacer()
        }
    }

    /// Final Four card helper (legacy)
    private func ffCard(index: Int, scale s: CGFloat, label: String) -> some View {
        VStack(spacing: 3 * s) {
            Text(label)
                .font(.system(size: 6 * s, weight: .heavy))
                .tracking(1 * s)
                .foregroundStyle(BracketLayout.headerColor)
            if finalFourMatchups.count > index {
                let ff = finalFourMatchups[index]
                BracketMatchupCardEnhanced(matchup: ff, regionColor: GaryColors.gold, isHighlighted: true, onTap: { tapMatchup(ff) })
                    .scaleEffect(s, anchor: .center)
                    .frame(width: BracketLayout.cardWidth * s, height: BracketLayout.cardHeight * s)
            } else {
                placeholderCard(label: "TBD")
                    .scaleEffect(s, anchor: .center)
                    .frame(width: BracketLayout.cardWidth * s, height: (BracketLayout.cardHeight + 16) * s)
            }
        }
    }

    // MARK: - Computed Properties

    private var allMatchups: [BracketMatchup] {
        var all: [BracketMatchup] = []
        for region in BracketRegion.allCases {
            if let m = bracketData[region] { all.append(contentsOf: m) }
        }
        all.append(contentsOf: finalFourMatchups)
        if let c = championshipMatchup { all.append(c) }
        return all
    }

    private var bracketRecord: (correct: Int, incorrect: Int) {
        let graded = allMatchups.filter { $0.correct != nil }
        return (graded.filter { $0.correct == true }.count, graded.filter { $0.correct == false }.count)
    }

    private var upsetPicks: [BracketMatchup] {
        allMatchups.filter { $0.isUpset == true }
    }

    // MARK: - Data Loading

    private func loadBracketData() {
        Task {
            do {
                let picks = try await SupabaseAPI.fetchBracketPicks()
                await MainActor.run {
                    bracketPicks = picks
                    if picks.isEmpty {
                        bracketData = BracketData.sampleBracket()
                        hasRealData = false
                    } else {
                        bracketData = BracketData.buildFromPicks(picks)
                        buildFinalFourMatchups(from: picks)
                        hasRealData = true
                    }
                    isLoading = false
                }
            } catch {
                print("[BracketView] Failed to fetch bracket picks: \(error)")
                await MainActor.run {
                    bracketData = BracketData.sampleBracket()
                    hasRealData = false
                    isLoading = false
                }
            }
        }
    }

    private func buildFinalFourMatchups(from picks: [BracketPick]) {
        finalFourMatchups = picks.filter { $0.round == 5 }.map { pick in
            let top = BracketTeamNameFormatter.team(from: pick.team1, seed: pick.seed1)
            let bottom = BracketTeamNameFormatter.team(from: pick.team2, seed: pick.seed2)
            let winner: BracketTeam? = pick.picked_to_advance != nil ? (pick.picked_to_advance == pick.team1 ? top : bottom) : nil
            return BracketMatchup(id: pick.id, round: 5, position: pick.game_number ?? 0, topTeam: top, bottomTeam: bottom, winner: winner, location: "Indianapolis, IN", gameTime: pick.date, region: "FINAL FOUR", confidence: pick.bracket_confidence, rationale: pick.bracket_rationale, isUpset: pick.is_upset, topTeamPros: pick.team1_pros, topTeamCons: pick.team1_cons, bottomTeamPros: pick.team2_pros, bottomTeamCons: pick.team2_cons, actualWinner: pick.actual_winner, correct: pick.correct)
        }.sorted { $0.position < $1.position }

        if let champPick = picks.filter({ $0.round == 6 }).first {
            let top = BracketTeamNameFormatter.team(from: champPick.team1, seed: champPick.seed1)
            let bottom = BracketTeamNameFormatter.team(from: champPick.team2, seed: champPick.seed2)
            let winner: BracketTeam? = champPick.picked_to_advance != nil ? (champPick.picked_to_advance == champPick.team1 ? top : bottom) : nil
            championshipMatchup = BracketMatchup(id: champPick.id, round: 6, position: 0, topTeam: top, bottomTeam: bottom, winner: winner, location: "Indianapolis, IN", gameTime: champPick.date, region: "CHAMPIONSHIP", confidence: champPick.bracket_confidence, rationale: champPick.bracket_rationale, isUpset: champPick.is_upset, topTeamPros: champPick.team1_pros, topTeamCons: champPick.team1_cons, bottomTeamPros: champPick.team2_pros, bottomTeamCons: champPick.team2_cons, actualWinner: champPick.actual_winner, correct: champPick.correct)
        }
    }

    // MARK: - Region Selector

    private var regionSelector: some View {
        HStack(spacing: 0) {
            ForEach(BracketRegion.allCases, id: \.self) { region in
                let isActive = selectedRegion == region
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                        selectedRegion = region
                        pendingScrollRegion = region
                        regionJumpToken += 1
                    }
                } label: {
                    VStack(spacing: 4) {
                        Text(region.rawValue)
                            .font(.system(size: 12, weight: isActive ? .bold : .medium))
                            .foregroundStyle(isActive ? BracketLayout.primaryText : BracketLayout.tertiaryText)
                        Rectangle()
                            .fill(isActive ? BracketLayout.accentGold : .clear)
                            .frame(height: 2)
                            .clipShape(Capsule())
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }

            if !upsetPicks.isEmpty {
                headerUtilityButton(
                    title: "\(upsetPicks.count)",
                    systemImage: "flame.fill",
                    tint: BracketLayout.incorrectRed
                ) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showUpsets.toggle()
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(
            ZStack(alignment: .bottom) {
                LinearGradient(
                    colors: [Color.white.opacity(0.035), Color.clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                LinearGradient(
                    colors: [Color.black.opacity(0.28), Color.clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                Rectangle()
                    .fill(Color.white.opacity(0.05))
                    .frame(height: 0.8)
            }
        )
    }

    private func headerUtilityButton(title: String, systemImage: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold))
                Text(title)
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.07))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.8))
            )
        }
        .buttonStyle(.plain)
        .padding(.leading, 8)
    }

    private func factsSummaryPill(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: 8, weight: .bold))
                .tracking(1.4)
                .foregroundStyle(BracketLayout.tertiaryText)
            Text(value)
                .font(.system(size: 15, weight: .heavy, design: .monospaced))
                .foregroundStyle(BracketLayout.primaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func factsSectionTitle(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(BracketLayout.accentGold)
            Text(title.uppercased())
                .font(.system(size: 9.5, weight: .heavy))
                .tracking(2.0)
                .foregroundStyle(BracketLayout.headerColor)
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 1)
            Spacer()
        }
    }

    private func factsSpotlightCard(matchup: BracketMatchup, eyebrow: String, detail: String) -> some View {
        Button {
            tapMatchup(matchup)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(eyebrow)
                            .font(.system(size: 9, weight: .heavy))
                            .tracking(1.6)
                            .foregroundStyle(BracketLayout.accentGold)

                        Text("\(matchup.topTeam?.shortName ?? "TBD") vs \(matchup.bottomTeam?.shortName ?? "TBD")")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(BracketLayout.primaryText)
                            .lineLimit(2)
                    }

                    Spacer()

                    if let confidence = matchup.confidence {
                        Text("\(Int(confidence))%")
                            .font(.system(size: 11.5, weight: .heavy, design: .monospaced))
                            .foregroundStyle(BracketLayout.accentGold)
                    }
                }

                Text(detail)
                    .font(.system(size: 10.5))
                    .foregroundStyle(BracketLayout.secondaryText)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                drawerMetaLine(
                    [
                        matchup.region,
                        matchup.roundShortName,
                        matchup.gameTime,
                        matchup.isUpset == true ? "UPSET" : ""
                    ].filter { !$0.isEmpty }
                )
            }
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Region Bracket Views

    private func regionBracketWithVenue(region: BracketRegion) -> some View {
        let matchups = bracketData[region] ?? []
        let r64 = matchups.filter { $0.round == 1 }.sorted { $0.position < $1.position }
        let r32 = matchups.filter { $0.round == 2 }.sorted { $0.position < $1.position }
        let s16 = matchups.filter { $0.round == 3 }.sorted { $0.position < $1.position }
        let e8 = matchups.filter { $0.round == 4 }.sorted { $0.position < $1.position }
        let r12Loc = BracketData.sampleLocation(for: region, round: 1)
        let r12Ven = BracketData.sampleVenue(for: region, round: 1)
        let regLoc = BracketData.sampleLocation(for: region, round: 3)
        let regVen = BracketData.sampleVenue(for: region, round: 3)

        return HStack(alignment: .top, spacing: 0) {
            roundColumnWithVenue(title: "R64", date: "MAR 19-20", location: r12Loc, venue: r12Ven, matchups: r64, spacing: BracketLayout.r64VerticalSpacing, topPadding: 0, region: region)
            BracketCurvedConnectors(count: 8, spacing: BracketLayout.r64VerticalSpacing, matchHeight: BracketLayout.cardHeight)
            roundColumnWithVenue(title: "R32", date: "MAR 21-22", location: r12Loc, venue: r12Ven, matchups: r32, spacing: BracketLayout.r32VerticalSpacing, topPadding: BracketLayout.r32TopPad, region: region)
            BracketCurvedConnectors(count: 4, spacing: BracketLayout.r32VerticalSpacing, matchHeight: BracketLayout.cardHeight, topPadding: BracketLayout.r32TopPad)
            roundColumnWithVenue(title: "S16", date: "MAR 26-27", location: regLoc, venue: regVen, matchups: s16, spacing: BracketLayout.s16VerticalSpacing, topPadding: BracketLayout.s16TopPad, region: region)
            BracketCurvedConnectors(count: 2, spacing: BracketLayout.s16VerticalSpacing, matchHeight: BracketLayout.cardHeight, topPadding: BracketLayout.s16TopPad)
            roundColumnWithVenue(title: "ELITE 8", date: "MAR 28-29", location: regLoc, venue: regVen, matchups: e8, spacing: BracketLayout.e8VerticalSpacing, topPadding: BracketLayout.e8TopPad, region: region)
        }
    }

    private func regionBracketWithVenueMirrored(region: BracketRegion) -> some View {
        let matchups = bracketData[region] ?? []
        let r64 = matchups.filter { $0.round == 1 }.sorted { $0.position < $1.position }
        let r32 = matchups.filter { $0.round == 2 }.sorted { $0.position < $1.position }
        let s16 = matchups.filter { $0.round == 3 }.sorted { $0.position < $1.position }
        let e8 = matchups.filter { $0.round == 4 }.sorted { $0.position < $1.position }
        let r12Loc = BracketData.sampleLocation(for: region, round: 1)
        let r12Ven = BracketData.sampleVenue(for: region, round: 1)
        let regLoc = BracketData.sampleLocation(for: region, round: 3)
        let regVen = BracketData.sampleVenue(for: region, round: 3)

        return HStack(alignment: .top, spacing: 0) {
            roundColumnWithVenue(title: "ELITE 8", date: "MAR 28-29", location: regLoc, venue: regVen, matchups: e8, spacing: BracketLayout.e8VerticalSpacing, topPadding: BracketLayout.e8TopPad, region: region)
            BracketCurvedConnectors(count: 2, spacing: BracketLayout.s16VerticalSpacing, matchHeight: BracketLayout.cardHeight, topPadding: BracketLayout.s16TopPad).scaleEffect(x: -1, y: 1)
            roundColumnWithVenue(title: "S16", date: "MAR 26-27", location: regLoc, venue: regVen, matchups: s16, spacing: BracketLayout.s16VerticalSpacing, topPadding: BracketLayout.s16TopPad, region: region)
            BracketCurvedConnectors(count: 4, spacing: BracketLayout.r32VerticalSpacing, matchHeight: BracketLayout.cardHeight, topPadding: BracketLayout.r32TopPad).scaleEffect(x: -1, y: 1)
            roundColumnWithVenue(title: "R32", date: "MAR 21-22", location: r12Loc, venue: r12Ven, matchups: r32, spacing: BracketLayout.r32VerticalSpacing, topPadding: BracketLayout.r32TopPad, region: region)
            BracketCurvedConnectors(count: 8, spacing: BracketLayout.r64VerticalSpacing, matchHeight: BracketLayout.cardHeight).scaleEffect(x: -1, y: 1)
            roundColumnWithVenue(title: "R64", date: "MAR 19-20", location: r12Loc, venue: r12Ven, matchups: r64, spacing: BracketLayout.r64VerticalSpacing, topPadding: 0, region: region)
        }
    }

    // Venue data for R64 pairs — each pair of games shares a venue
    private static let r64Venues: [BracketRegion: [(venue: String, city: String)]] = [
        .east: [
            ("Bon Secours Arena", "Greenville, SC"),      // games 1-2
            ("Bon Secours Arena", "Greenville, SC"),      // (same pair label)
            ("Viejas Arena", "San Diego, CA"),             // games 3-4
            ("Viejas Arena", "San Diego, CA"),
            ("KeyBank Center", "Buffalo, NY"),             // games 5-6
            ("KeyBank Center", "Buffalo, NY"),
            ("Wells Fargo Center", "Philadelphia, PA"),    // games 7-8
            ("Wells Fargo Center", "Philadelphia, PA"),
        ],
        .south: [
            ("Amalie Arena", "Tampa, FL"),                 // games 1-2
            ("Amalie Arena", "Tampa, FL"),
            ("Paycom Center", "Oklahoma City, OK"),        // games 3-4
            ("Paycom Center", "Oklahoma City, OK"),
            ("Bon Secours Arena", "Greenville, SC"),       // games 5-6
            ("Bon Secours Arena", "Greenville, SC"),
            ("Paycom Center", "Oklahoma City, OK"),        // games 7-8
            ("Paycom Center", "Oklahoma City, OK"),
        ],
        .west: [
            ("Viejas Arena", "San Diego, CA"),             // games 1-2
            ("Viejas Arena", "San Diego, CA"),
            ("Moda Center", "Portland, OR"),               // games 3-4
            ("Moda Center", "Portland, OR"),
            ("Moda Center", "Portland, OR"),               // games 5-6
            ("Moda Center", "Portland, OR"),
            ("Viejas Arena", "San Diego, CA"),             // games 7-8  (Gonzaga/Miami)
            ("Viejas Arena", "San Diego, CA"),
        ],
        .midwest: [
            ("Enterprise Center", "St. Louis, MO"),        // games 1-2
            ("Enterprise Center", "St. Louis, MO"),
            ("KeyBank Center", "Buffalo, NY"),             // games 3-4
            ("KeyBank Center", "Buffalo, NY"),
            ("Enterprise Center", "St. Louis, MO"),        // games 5-6
            ("Enterprise Center", "St. Louis, MO"),
            ("Enterprise Center", "St. Louis, MO"),        // games 7-8
            ("Enterprise Center", "St. Louis, MO"),
        ],
    ]

    // R32 venues — one per game, same site as their R64 feeder pair
    private static let r32Venues: [BracketRegion: [(venue: String, city: String)]] = [
        .east: [
            ("Bon Secours Arena", "Greenville, SC"),      // R32 game 1 (R64 games 1-2)
            ("Viejas Arena", "San Diego, CA"),             // R32 game 2 (R64 games 3-4)
            ("KeyBank Center", "Buffalo, NY"),             // R32 game 3 (R64 games 5-6)
            ("Wells Fargo Center", "Philadelphia, PA"),    // R32 game 4 (R64 games 7-8)
        ],
        .south: [
            ("Amalie Arena", "Tampa, FL"),
            ("Paycom Center", "Oklahoma City, OK"),
            ("Bon Secours Arena", "Greenville, SC"),
            ("Paycom Center", "Oklahoma City, OK"),
        ],
        .west: [
            ("Viejas Arena", "San Diego, CA"),
            ("Moda Center", "Portland, OR"),
            ("Moda Center", "Portland, OR"),
            ("Viejas Arena", "San Diego, CA"),
        ],
        .midwest: [
            ("Enterprise Center", "St. Louis, MO"),
            ("KeyBank Center", "Buffalo, NY"),
            ("Enterprise Center", "St. Louis, MO"),
            ("Enterprise Center", "St. Louis, MO"),
        ],
    ]

    private func roundColumnWithVenue(title: String, date: String, location: String, venue: String, matchups: [BracketMatchup], spacing: CGFloat, topPadding: CGFloat, region: BracketRegion) -> some View {
        let isR64 = title == "R64"
        let isR32 = title == "R32"
        let venues = Self.r64Venues[region] ?? []
        let r32venues = Self.r32Venues[region] ?? []

        return VStack(spacing: 0) {
            VStack(spacing: 1) {
                Text(title)
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(BracketLayout.headerColor)
                Text(date)
                    .font(.system(size: 7, weight: .medium))
                    .foregroundStyle(BracketLayout.secondaryText)
            }
            .padding(.bottom, 3)

            if isR64 && matchups.count == 8 {
                // R64: 4 pairs of 2 games — venue label in the BIG gap between pairs
                VStack(spacing: 0) {
                    ForEach(0..<4, id: \.self) { pairIdx in
                        // The pair of games
                        VStack(spacing: spacing) {
                            BracketMatchupCardEnhanced(matchup: matchups[pairIdx * 2], regionColor: region.color, onTap: { tapMatchup(matchups[pairIdx * 2]) })
                            BracketMatchupCardEnhanced(matchup: matchups[pairIdx * 2 + 1], regionColor: region.color, onTap: { tapMatchup(matchups[pairIdx * 2 + 1]) })
                        }

                        // BIG gap with venue label between pairs (not after last pair)
                        if pairIdx < 3 {
                            let nextPairVenue = venues.count > (pairIdx + 1) * 2 ? venues[(pairIdx + 1) * 2] : (venue: "", city: "")
                            VStack(spacing: 1) {
                                Text(nextPairVenue.venue)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(BracketLayout.accentGold.opacity(0.7))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.5)
                                Text(nextPairVenue.city)
                                    .font(.system(size: 12))
                                    .foregroundStyle(BracketLayout.tertiaryText)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: BracketLayout.r64PairGap)
                        }
                    }
                }
                .padding(.top, topPadding)
            } else if isR32 && matchups.count == 4 {
                // R32: 4 games — venue labels between pairs (in the big gap)
                VStack(spacing: spacing) {
                    BracketMatchupCardEnhanced(matchup: matchups[0], regionColor: region.color, onTap: { tapMatchup(matchups[0]) })
                        .overlay(alignment: .top) {
                            let v = r32venues.count > 0 ? r32venues[0] : (venue: "", city: "")
                            VStack(spacing: 0) {
                                Text(v.venue).font(.system(size: 11, weight: .semibold)).foregroundStyle(BracketLayout.accentGold.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.5)
                                Text(v.city).font(.system(size: 9)).foregroundStyle(BracketLayout.tertiaryText)
                            }.offset(y: -22)
                        }
                    BracketMatchupCardEnhanced(matchup: matchups[1], regionColor: region.color, onTap: { tapMatchup(matchups[1]) })
                        .overlay(alignment: .top) {
                            let v = r32venues.count > 1 ? r32venues[1] : (venue: "", city: "")
                            VStack(spacing: 0) {
                                Text(v.venue).font(.system(size: 11, weight: .semibold)).foregroundStyle(BracketLayout.accentGold.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.5)
                                Text(v.city).font(.system(size: 9)).foregroundStyle(BracketLayout.tertiaryText)
                            }.offset(y: -22)
                        }
                    BracketMatchupCardEnhanced(matchup: matchups[2], regionColor: region.color, onTap: { tapMatchup(matchups[2]) })
                        .overlay(alignment: .top) {
                            let v = r32venues.count > 2 ? r32venues[2] : (venue: "", city: "")
                            VStack(spacing: 0) {
                                Text(v.venue).font(.system(size: 11, weight: .semibold)).foregroundStyle(BracketLayout.accentGold.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.5)
                                Text(v.city).font(.system(size: 9)).foregroundStyle(BracketLayout.tertiaryText)
                            }.offset(y: -22)
                        }
                    BracketMatchupCardEnhanced(matchup: matchups[3], regionColor: region.color, onTap: { tapMatchup(matchups[3]) })
                        .overlay(alignment: .top) {
                            let v = r32venues.count > 3 ? r32venues[3] : (venue: "", city: "")
                            VStack(spacing: 0) {
                                Text(v.venue).font(.system(size: 11, weight: .semibold)).foregroundStyle(BracketLayout.accentGold.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.5)
                                Text(v.city).font(.system(size: 9)).foregroundStyle(BracketLayout.tertiaryText)
                            }.offset(y: -22)
                        }
                }
                .padding(.top, topPadding)
            } else if (title == "S16") && matchups.count == 2 {
                // S16: 2 games — venue as overlay in the gap (doesn't affect layout)
                let s16Venues: [BracketRegion: (venue: String, city: String)] = [
                    .east: ("Capital One Arena", "Washington, DC"),
                    .south: ("Toyota Center", "Houston, TX"),
                    .west: ("SAP Center", "San Jose, CA"),
                    .midwest: ("United Center", "Chicago, IL"),
                ]
                let venueInfo = s16Venues[region] ?? (venue: "", city: "")
                VStack(spacing: spacing) {
                    BracketMatchupCardEnhanced(matchup: matchups[0], regionColor: region.color, onTap: { tapMatchup(matchups[0]) })
                    BracketMatchupCardEnhanced(matchup: matchups[1], regionColor: region.color, onTap: { tapMatchup(matchups[1]) })
                }
                .padding(.top, topPadding)
                .overlay {
                    VStack(spacing: 0) {
                        Text(venueInfo.venue).font(.system(size: 12, weight: .semibold)).foregroundStyle(BracketLayout.accentGold.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.5)
                        Text(venueInfo.city).font(.system(size: 10)).foregroundStyle(BracketLayout.tertiaryText)
                    }
                }
            } else if (title == "ELITE 8") && matchups.count == 1 {
                // E8: single game — venue as overlay above (doesn't affect layout)
                let e8Venues: [BracketRegion: (venue: String, city: String)] = [
                    .east: ("Capital One Arena", "Washington, DC"),
                    .south: ("Toyota Center", "Houston, TX"),
                    .west: ("SAP Center", "San Jose, CA"),
                    .midwest: ("United Center", "Chicago, IL"),
                ]
                let venueInfo = e8Venues[region] ?? (venue: "", city: "")
                VStack(spacing: 0) {
                    BracketMatchupCardEnhanced(matchup: matchups[0], regionColor: region.color, onTap: { tapMatchup(matchups[0]) })
                        .overlay(alignment: .top) {
                            VStack(spacing: 0) {
                                Text(venueInfo.venue).font(.system(size: 12, weight: .semibold)).foregroundStyle(BracketLayout.accentGold.opacity(0.6)).lineLimit(1).minimumScaleFactor(0.5)
                                Text(venueInfo.city).font(.system(size: 10)).foregroundStyle(BracketLayout.tertiaryText)
                            }.offset(y: -24)
                        }
                }
                .padding(.top, topPadding)
            } else {
                VStack(spacing: spacing) {
                    ForEach(matchups) { matchup in
                        BracketMatchupCardEnhanced(matchup: matchup, regionColor: region.color, onTap: { tapMatchup(matchup) })
                    }
                }
                .padding(.top, topPadding)
            }
        }
        .frame(width: BracketLayout.cardWidth)
    }

    // MARK: - Placeholder Card

    private func placeholderCard(label: String) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .tracking(1)
                .foregroundStyle(BracketLayout.secondaryText)
            RoundedRectangle(cornerRadius: BracketLayout.cardCorner)
                .fill(BracketLayout.cardBg)
                .overlay(RoundedRectangle(cornerRadius: BracketLayout.cardCorner).stroke(BracketLayout.accentGold.opacity(0.25), lineWidth: 0.5))
                .frame(width: BracketLayout.cardWidth, height: BracketLayout.cardHeight)
                .overlay(Text("TBD").font(.system(size: 12, weight: .medium)).foregroundStyle(BracketLayout.tertiaryText))
                .shadow(color: .black.opacity(0.3), radius: 3, y: 1)
        }
    }

    // MARK: - Coming Soon Overlay

    private var comingSoonOverlay: some View {
        ZStack {
            Color.black.opacity(0.7).ignoresSafeArea()
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "trophy.fill").font(.system(size: 48)).foregroundStyle(GaryColors.goldGradient).shadow(color: GaryColors.gold.opacity(0.4), radius: 20)
                VStack(spacing: 8) {
                    Text("SELECTION SUNDAY").font(.custom("Inter-Bold", size: 22)).tracking(3).foregroundStyle(.white)
                    Text("Gary's bracket drops Monday").font(.custom("Inter-Medium", size: 15)).foregroundStyle(.white.opacity(0.6))
                }
                VStack(spacing: 6) {
                    Text("MARCH 17, 2026").font(.custom("JetBrainsMono-Bold", size: 14)).tracking(2).foregroundStyle(GaryColors.gold)
                    Text("Full bracket analysis with picks, rationale, and upset alerts").font(.custom("Inter-Regular", size: 12)).foregroundStyle(.white.opacity(0.4)).multilineTextAlignment(.center).padding(.horizontal, 32)
                }
                .padding(.vertical, 16).padding(.horizontal, 24)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.05)).overlay(RoundedRectangle(cornerRadius: 14).stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.8)))
                Spacer(); Spacer()
            }
        }
        .allowsHitTesting(true)
    }

    // MARK: - Upsets Overlay

    private var upsetsOverlay: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 0) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "flame.fill").font(.system(size: 14)).foregroundStyle(BracketLayout.incorrectRed)
                        Text("GARY'S BOLD PICKS").font(.custom("Inter-Bold", size: 14)).tracking(1.5).foregroundStyle(BracketLayout.primaryText)
                    }
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showUpsets = false }
                    } label: {
                        Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(BracketLayout.secondaryText).frame(width: 28, height: 28).background(Circle().fill(Color.white.opacity(0.08)))
                    }.buttonStyle(.plain)
                }
                .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 12)

                Divider().background(BracketLayout.cardBorder)

                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 10) {
                        ForEach(upsetPicks) { matchup in
                            upsetRow(matchup: matchup)
                        }
                    }
                    .padding(.horizontal, 20).padding(.vertical, 12)
                }
                .frame(maxHeight: 300)
            }
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous).fill(BracketLayout.cardBg)
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(BracketLayout.incorrectRed.opacity(0.12), lineWidth: 0.8))
                    .shadow(color: .black.opacity(0.1), radius: 20, y: -5)
            )
            .padding(.horizontal, 12).padding(.bottom, 8)
        }
    }

    private func upsetRow(matchup: BracketMatchup) -> some View {
        Button {
            tapMatchup(matchup)
            showUpsets = false
        } label: {
            HStack(spacing: 12) {
                VStack(spacing: 2) {
                    Text(matchup.roundShortName).font(.custom("JetBrainsMono-Bold", size: 9)).tracking(0.5).foregroundStyle(BracketLayout.tertiaryText)
                    Text(matchup.region.prefix(4).uppercased()).font(.custom("JetBrainsMono-Regular", size: 7)).foregroundStyle(BracketLayout.tertiaryText)
                }.frame(width: 32)

                VStack(alignment: .leading, spacing: 3) {
                    if let winner = matchup.winner {
                        HStack(spacing: 4) {
                            Text("#\(winner.seed)").font(.custom("JetBrainsMono-Bold", size: 11)).foregroundStyle(BracketLayout.incorrectRed)
                            Text(winner.shortName).font(.custom("Inter-SemiBold", size: 13)).foregroundStyle(BracketLayout.primaryText)
                        }
                    }
                    let loser = matchup.winner?.id == matchup.topTeam?.id ? matchup.bottomTeam : matchup.topTeam
                    if let loser = loser {
                        Text("over #\(loser.seed) \(loser.shortName)").font(.custom("Inter-Regular", size: 11)).foregroundStyle(BracketLayout.secondaryText)
                    }
                }
                Spacer()
                if let conf = matchup.confidence {
                    Text("\(Int(conf))%").font(.custom("JetBrainsMono-Bold", size: 12)).foregroundStyle(BracketLayout.accentGold)
                }
                Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(BracketLayout.tertiaryText)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 10).fill(BracketLayout.incorrectRed.opacity(0.04)).overlay(RoundedRectangle(cornerRadius: 10).stroke(BracketLayout.incorrectRed.opacity(0.1), lineWidth: 0.5)))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Enhanced Matchup Card (Light Theme)

struct BracketMatchupCardEnhanced: View {
    let matchup: BracketMatchup
    let regionColor: Color
    var isHighlighted: Bool = false
    let onTap: () -> Void

    private let dividerHeight: CGFloat = 1

    private var accentColor: Color {
        if let correct = matchup.correct {
            return correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed
        }
        return BracketLayout.accentGold
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(accentColor)
                    .frame(width: isHighlighted ? 4.5 : 4)
                    .padding(.vertical, 5)

                VStack(spacing: 0) {
                    teamRow(team: matchup.topTeam, isPick: matchup.winner?.id == matchup.topTeam?.id)
                    matchupDivider
                    teamRow(team: matchup.bottomTeam, isPick: matchup.winner?.id == matchup.bottomTeam?.id)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: BracketLayout.cardCorner)
                    .fill(
                        LinearGradient(
                            colors: [
                                isHighlighted ? BracketLayout.cardHighlightBg : BracketLayout.cardBg,
                                BracketLayout.cardBg.opacity(0.98),
                                Color.white.opacity(0.015)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: BracketLayout.cardCorner)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.14),
                                        BracketLayout.cardBorder
                                    ],
                                    startPoint: .top,
                                    endPoint: .bottom
                                ),
                                lineWidth: 0.9
                            )
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: BracketLayout.cardCorner))
            .shadow(color: .black.opacity(0.28), radius: 6, y: 2)
            .shadow(color: accentColor.opacity(isHighlighted ? 0.12 : 0.05), radius: 8, y: 0)
        }
        .buttonStyle(.plain)
        .frame(width: BracketLayout.cardWidth, height: BracketLayout.cardHeight)
    }

    private var matchupDivider: some View {
        Rectangle()
            .fill(BracketLayout.cardBorder.opacity(0.72))
            .frame(height: dividerHeight)
            .padding(.horizontal, 10)
            .overlay {
                ZStack {
                    Circle()
                        .fill(BracketLayout.cardBg)
                        .frame(width: 8, height: 8)
                    Circle()
                        .fill(accentColor.opacity(0.48))
                        .frame(width: 3, height: 3)
                }
            }
    }

    private func teamRow(team: BracketTeam?, isPick: Bool) -> some View {
        let isTBD = team == nil || team?.name == "TBD" || team?.seed == 0
        return HStack(spacing: 5) {
            Text(isTBD ? "-" : "\(team?.seed ?? 0)")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(isPick ? BracketLayout.accentGold : BracketLayout.tertiaryText)
                .frame(width: 18, alignment: .center)
            Text(isTBD ? "TBD" : (team?.shortName ?? "TBD"))
                .font(.system(size: 12.5, weight: isPick ? .bold : .medium))
                .foregroundStyle(isTBD ? BracketLayout.tertiaryText : BracketLayout.primaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.58)
                .allowsTightening(true)
            Spacer()
            if let correct = matchup.correct, isPick {
                Image(systemName: correct ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: (BracketLayout.cardHeight - dividerHeight) / 2)
    }
}

private struct RegionBracketCanvas: View {
    let layout: RegionBracketCanvasLayout
    let onTap: (BracketMatchup) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            RegionBracketConnectorLayer(connectors: layout.connectors)
                .frame(width: layout.size.width, height: layout.size.height)

            HStack(spacing: 4) {
                Circle()
                    .fill(BracketLayout.accentGold.opacity(0.95))
                    .frame(width: 3, height: 3)
                Text(layout.regionLabel.title)
                    .font(.system(size: BracketLayout.regionLabelFontSize, weight: .heavy))
                    .tracking(1.8)
                    .foregroundStyle(BracketLayout.accentGold)
            }
            .frame(
                width: layout.regionLabel.frame.width,
                height: layout.regionLabel.frame.height,
                alignment: layout.regionLabel.isTrailing ? .trailing : .leading
            )
                .position(x: layout.regionLabel.frame.midX, y: layout.regionLabel.frame.midY)

            ForEach(layout.roundHeaders) { header in
                VStack(spacing: 1) {
                    Text(header.title)
                        .font(.system(size: BracketLayout.roundHeaderFontSize, weight: .heavy))
                        .tracking(1)
                        .foregroundStyle(BracketLayout.headerColor)
                    Text(header.date)
                        .font(.system(size: BracketLayout.roundDateFontSize, weight: .semibold))
                        .foregroundStyle(BracketLayout.secondaryText)
                }
                .fixedSize()
                .position(header.center)
            }

            ForEach(layout.venues) { venue in
                VStack(spacing: venue.prominence == .pairGap ? 1 : 0) {
                    Text(venue.title)
                        .font(
                            .system(
                                size: venue.prominence == .pairGap ? BracketLayout.pairVenueTitleFontSize : BracketLayout.gameVenueTitleFontSize,
                                weight: .semibold
                            )
                        )
                        .foregroundStyle(BracketLayout.accentGold.opacity(0.82))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text(venue.subtitle)
                        .font(
                            .system(
                                size: venue.prominence == .pairGap ? BracketLayout.pairVenueSubtitleFontSize : BracketLayout.gameVenueSubtitleFontSize
                            )
                        )
                        .foregroundStyle(BracketLayout.tertiaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                .fixedSize()
                .position(venue.center)
            }

            ForEach(layout.cards) { card in
                BracketMatchupCardEnhanced(matchup: card.matchup, regionColor: GaryColors.gold, onTap: { onTap(card.matchup) })
                    .frame(width: card.frame.width, height: card.frame.height)
                    .position(x: card.frame.midX, y: card.frame.midY)
            }
        }
        .frame(width: layout.size.width, height: layout.size.height, alignment: .topLeading)
    }
}

private struct RegionBracketConnectorLayer: View {
    let connectors: [RegionBracketCanvasLayout.Connector]

    var body: some View {
        Canvas { context, _ in
            for connector in connectors {
                var path = Path()
                addConnector(to: &path, from: connector.from, to: connector.to, mirrored: connector.mirrored)
                context.stroke(path, with: .color(BracketLayout.connectorGlow), lineWidth: 6.5)
                context.stroke(path, with: .color(BracketLayout.connectorLine), lineWidth: 2.6)
            }
        }
    }

    private func addConnector(to path: inout Path, from start: CGPoint, to end: CGPoint, mirrored: Bool) {
        if abs(start.y - end.y) < 0.5 {
            path.move(to: start)
            path.addLine(to: end)
            return
        }

        let horizontalDistance = abs(end.x - start.x)
        let horizontalSign: CGFloat = mirrored ? -1 : 1
        let bendX = start.x + (horizontalSign * horizontalDistance * 0.55)
        let turnRadius = min(10, horizontalDistance * 0.22, abs(end.y - start.y) * 0.45)
        let verticalSign: CGFloat = end.y > start.y ? 1 : -1

        path.move(to: start)
        path.addLine(to: CGPoint(x: bendX - (horizontalSign * turnRadius), y: start.y))
        path.addQuadCurve(
            to: CGPoint(x: bendX, y: start.y + (verticalSign * turnRadius)),
            control: CGPoint(x: bendX, y: start.y)
        )
        path.addLine(to: CGPoint(x: bendX, y: end.y - (verticalSign * turnRadius)))
        path.addQuadCurve(
            to: CGPoint(x: bendX + (horizontalSign * turnRadius), y: end.y),
            control: CGPoint(x: bendX, y: end.y)
        )
        path.addLine(to: end)
    }
}

// MARK: - Curved Bracket Connectors

struct BracketCurvedConnectors: View {
    let count: Int
    let spacing: CGFloat
    let matchHeight: CGFloat
    var topPadding: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: 32 + topPadding)
            VStack(spacing: spacing) {
                ForEach(0..<(count / 2), id: \.self) { _ in
                    connectorPair
                }
            }
        }
        .frame(width: BracketLayout.connectorWidth)
    }

    private var connectorPair: some View {
        let pairHeight = matchHeight * 2 + spacing

        return Canvas { context, size in
            let midTop = pairHeight * 0.25
            let midBottom = pairHeight * 0.75
            let center = pairHeight * 0.5
            let curveRadius: CGFloat = 6

            var path = Path()

            // Top input horizontal
            path.move(to: CGPoint(x: 0, y: midTop))
            path.addLine(to: CGPoint(x: size.width * 0.45 - curveRadius, y: midTop))
            path.addQuadCurve(to: CGPoint(x: size.width * 0.45, y: midTop + curveRadius), control: CGPoint(x: size.width * 0.45, y: midTop))
            path.addLine(to: CGPoint(x: size.width * 0.45, y: center - curveRadius))
            path.addQuadCurve(to: CGPoint(x: size.width * 0.45 + curveRadius, y: center), control: CGPoint(x: size.width * 0.45, y: center))

            // Output horizontal
            path.addLine(to: CGPoint(x: size.width, y: center))

            // Bottom input horizontal
            path.move(to: CGPoint(x: 0, y: midBottom))
            path.addLine(to: CGPoint(x: size.width * 0.45 - curveRadius, y: midBottom))
            path.addQuadCurve(to: CGPoint(x: size.width * 0.45, y: midBottom - curveRadius), control: CGPoint(x: size.width * 0.45, y: midBottom))
            path.addLine(to: CGPoint(x: size.width * 0.45, y: center + curveRadius))

            context.stroke(path, with: .color(BracketLayout.connectorLine), lineWidth: 2)
        }
        .frame(height: pairHeight)
    }
}

private struct BracketRegionFramePreferenceKey: PreferenceKey {
    static var defaultValue: [BracketRegion: CGRect] = [:]

    static func reduce(value: inout [BracketRegion: CGRect], nextValue: () -> [BracketRegion: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct EdgeDockShape: Shape {
    let leadingRadius: CGFloat
    let trailingRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let leftRadius = min(leadingRadius, rect.height / 2, rect.width / 2)
        let rightRadius = min(trailingRadius, rect.height / 2, rect.width / 2)
        var path = Path()

        path.move(to: CGPoint(x: rect.maxX - rightRadius, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + leftRadius, y: rect.minY))
        if leftRadius > 0 {
            path.addQuadCurve(
                to: CGPoint(x: rect.minX, y: rect.minY + leftRadius),
                control: CGPoint(x: rect.minX, y: rect.minY)
            )
        } else {
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        }

        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - leftRadius))
        if leftRadius > 0 {
            path.addQuadCurve(
                to: CGPoint(x: rect.minX + leftRadius, y: rect.maxY),
                control: CGPoint(x: rect.minX, y: rect.maxY)
            )
        } else {
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        }

        path.addLine(to: CGPoint(x: rect.maxX - rightRadius, y: rect.maxY))
        if rightRadius > 0 {
            path.addQuadCurve(
                to: CGPoint(x: rect.maxX, y: rect.maxY - rightRadius),
                control: CGPoint(x: rect.maxX, y: rect.maxY)
            )
        } else {
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        }

        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + rightRadius))
        if rightRadius > 0 {
            path.addQuadCurve(
                to: CGPoint(x: rect.maxX - rightRadius, y: rect.minY),
                control: CGPoint(x: rect.maxX, y: rect.minY)
            )
        } else {
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        }

        path.closeSubpath()
        return path
    }
}

private struct BracketScrollViewConfigurator: UIViewRepresentable {
    let clampInsets: UIEdgeInsets

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIView {
        UIView(frame: .zero)
    }

    func updateUIView(_ view: UIView, context: Context) {
        DispatchQueue.main.async {
            guard let scrollView = enclosingScrollView(from: view) else { return }
            context.coordinator.clampInsets = clampInsets
            context.coordinator.attach(to: scrollView)
            scrollView.bounces = false
            scrollView.alwaysBounceHorizontal = false
            scrollView.alwaysBounceVertical = false
            scrollView.contentInset = .zero
            scrollView.scrollIndicatorInsets = .zero
            scrollView.contentInsetAdjustmentBehavior = .never
            scrollView.clipsToBounds = true
            context.coordinator.clamp(scrollView)
        }
    }

    private func enclosingScrollView(from view: UIView) -> UIScrollView? {
        var candidate = view.superview
        while let current = candidate {
            if let scrollView = current as? UIScrollView {
                return scrollView
            }
            candidate = current.superview
        }
        return nil
    }

    final class Coordinator {
        private weak var scrollView: UIScrollView?
        private var offsetObservation: NSKeyValueObservation?
        private var sizeObservation: NSKeyValueObservation?
        private var boundsObservation: NSKeyValueObservation?
        private var isClamping = false
        var clampInsets: UIEdgeInsets = .zero

        func attach(to scrollView: UIScrollView) {
            guard self.scrollView !== scrollView else {
                clamp(scrollView)
                return
            }

            self.scrollView = scrollView

            offsetObservation = scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scrollView, _ in
                self?.clamp(scrollView)
            }
            sizeObservation = scrollView.observe(\.contentSize, options: [.new]) { [weak self] scrollView, _ in
                self?.clamp(scrollView)
            }
            boundsObservation = scrollView.observe(\.bounds, options: [.new]) { [weak self] scrollView, _ in
                self?.clamp(scrollView)
            }

            clamp(scrollView)
        }

        func clamp(_ scrollView: UIScrollView) {
            guard !isClamping else { return }

            let inset = scrollView.adjustedContentInset
            let minX = -inset.left + clampInsets.left
            let minY = -inset.top + clampInsets.top
            let maxX = max(minX, scrollView.contentSize.width - scrollView.bounds.width + inset.right - clampInsets.right)
            let maxY = max(minY, scrollView.contentSize.height - scrollView.bounds.height + inset.bottom - clampInsets.bottom)

            let clampedX = min(max(scrollView.contentOffset.x, minX), maxX)
            let clampedY = min(max(scrollView.contentOffset.y, minY), maxY)

            guard clampedX != scrollView.contentOffset.x || clampedY != scrollView.contentOffset.y else { return }

            isClamping = true
            scrollView.setContentOffset(CGPoint(x: clampedX, y: clampedY), animated: false)
            isClamping = false
        }
    }
}

// MARK: - Game Zoom View

struct GameZoomView: View {
    let matchup: BracketMatchup
    @Binding var isPresented: Bool
    let allMatchups: [BracketMatchup]
    @State private var stageVisible: Bool = false

    var body: some View {
        ZStack(alignment: .bottom) {
            zoomBackdrop
                .ignoresSafeArea()
                .onTapGesture { dismissZoom() }

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 22) {
                    HStack {
                        Button { dismissZoom() } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("Bracket")
                                    .font(.system(size: 15, weight: .medium))
                            }
                            .foregroundStyle(BracketLayout.accentGold)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(
                                Capsule()
                                    .fill(Color.white.opacity(0.06))
                                    .overlay(Capsule().stroke(Color.white.opacity(0.08), lineWidth: 0.8))
                            )
                        }
                        .buttonStyle(.plain)
                        Spacer()
                    }
                    .padding(.top, 58)
                    .padding(.horizontal, 20)

                    matchupIdentityHeader

                    matchupFocusPreview
                        .scaleEffect(stageVisible ? 1.0 : 0.9)
                        .opacity(stageVisible ? 1.0 : 0.0)
                        .offset(y: stageVisible ? 0 : 14)

                    showdownStage
                        .scaleEffect(stageVisible ? 1.0 : 0.94)
                        .opacity(stageVisible ? 1.0 : 0.0)
                        .offset(y: stageVisible ? 0 : 18)

                    if let winner = matchup.winner {
                        winnerSummaryCard(winner)
                    }

                    if hasProsOrCons {
                        VStack(spacing: 12) {
                            HStack(spacing: 6) {
                                Image(systemName: "chart.bar.doc.horizontal")
                                    .font(.system(size: 11))
                                    .foregroundStyle(BracketLayout.accentGold)
                                Text("MATCHUP BREAKDOWN")
                                    .font(.system(size: 10, weight: .bold))
                                    .tracking(1.5)
                                    .foregroundStyle(BracketLayout.accentGold.opacity(0.8))
                                Spacer()
                            }

                            if let t = matchup.topTeam {
                                zoomInsightsCard(
                                    team: t,
                                    pros: matchup.topTeamPros ?? [],
                                    cons: matchup.topTeamCons ?? [],
                                    isWinner: matchup.winner?.id == t.id
                                )
                            }
                            if let b = matchup.bottomTeam {
                                zoomInsightsCard(
                                    team: b,
                                    pros: matchup.bottomTeamPros ?? [],
                                    cons: matchup.bottomTeamCons ?? [],
                                    isWinner: matchup.winner?.id == b.id
                                )
                            }
                        }
                        .padding(16)
                        .background(panelCardBackground)
                        .padding(.horizontal, 24)
                    }

                    if let rationale = matchup.rationale, !rationale.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 6) {
                                Image(systemName: "text.quote")
                                    .font(.system(size: 12))
                                    .foregroundStyle(BracketLayout.accentGold.opacity(0.7))
                                Text("GARY'S TAKE")
                                    .font(.system(size: 10, weight: .bold))
                                    .tracking(1.5)
                                    .foregroundStyle(BracketLayout.accentGold.opacity(0.8))
                            }
                            Text(rationale)
                                .font(.system(size: 14))
                                .foregroundStyle(BracketLayout.secondaryText)
                                .lineSpacing(4)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(panelCardBackground)
                        .padding(.horizontal, 24)
                    }

                    if let correct = matchup.correct {
                        HStack(spacing: 8) {
                            Image(systemName: correct ? "checkmark.seal.fill" : "xmark.seal.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(correct ? "CORRECT" : "INCORRECT")
                                    .font(.system(size: 11, weight: .bold))
                                    .tracking(1)
                                    .foregroundStyle(correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed)
                                if let aw = matchup.actualWinner, !correct {
                                    Text("Winner: \(aw)")
                                        .font(.system(size: 11))
                                        .foregroundStyle(BracketLayout.secondaryText)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill((correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed).opacity(0.06))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke((correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed).opacity(0.15), lineWidth: 0.6)
                                )
                        )
                        .padding(.horizontal, 24)
                    }

                    Spacer().frame(height: 152)
                }
            }

            floatingPickOverlay
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .opacity(stageVisible ? 1.0 : 0.0)
                .offset(y: stageVisible ? 0 : 18)
        }
        .onAppear {
            withAnimation(.spring(response: 0.48, dampingFraction: 0.84)) {
                stageVisible = true
            }
        }
        .onDisappear {
            stageVisible = false
        }
    }

    private var nextRoundName: String {
        switch matchup.round {
        case 1: return "the Round of 32"
        case 2: return "the Sweet 16"
        case 3: return "the Elite 8"
        case 4: return "the Final Four"
        case 5: return "the Championship"
        case 6: return "the title"
        default: return "the next round"
        }
    }

    private func dismissZoom() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { isPresented = false }
    }

    private var zoomBackdrop: some View {
        ZStack {
            BracketLayout.bracketBg

            LinearGradient(
                colors: [
                    Color(hex: "#121216"),
                    Color(hex: "#0D0D10"),
                    GaryColors.darkBg
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            RadialGradient(
                colors: [
                    BracketLayout.stageGlow.opacity(0.24),
                    BracketLayout.stageGlow.opacity(0.06),
                    .clear
                ],
                center: .top,
                startRadius: 40,
                endRadius: 420
            )

            RadialGradient(
                colors: [
                    BracketLayout.ambientCopper.opacity(0.12),
                    .clear
                ],
                center: .bottomTrailing,
                startRadius: 20,
                endRadius: 320
            )
        }
    }

    private var matchupIdentityHeader: some View {
        VStack(spacing: 10) {
            VStack(spacing: 4) {
                Text(matchup.roundName)
                    .font(.system(size: 11, weight: .bold))
                    .tracking(2)
                    .foregroundStyle(BracketLayout.accentGold.opacity(0.88))
                if !matchup.region.isEmpty {
                    Text(matchup.region)
                        .font(.system(size: 9, weight: .medium))
                        .tracking(1.5)
                        .foregroundStyle(BracketLayout.tertiaryText)
                }
            }

            HStack(spacing: 8) {
                zoomMetaChip(matchup.roundShortName)
                if !matchup.gameTime.isEmpty {
                    zoomMetaChip(matchup.gameTime)
                }
                if !matchup.location.isEmpty {
                    zoomMetaChip(matchup.location)
                }
            }
        }
        .padding(.horizontal, 24)
    }

    private var matchupFocusPreview: some View {
        VStack(spacing: 12) {
            Text("LOCKED MATCHUP")
                .font(.system(size: 10, weight: .heavy))
                .tracking(2.2)
                .foregroundStyle(BracketLayout.headerColor.opacity(0.82))

            BracketMatchupCardEnhanced(
                matchup: matchup,
                regionColor: GaryColors.gold,
                isHighlighted: true,
                onTap: {}
            )
            .allowsHitTesting(false)
            .scaleEffect(1.26)
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color.white.opacity(0.04))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.white.opacity(0.08), lineWidth: 0.8)
                    )
            )
            .shadow(color: BracketLayout.stageGlow.opacity(0.12), radius: 26, y: 0)
        }
        .padding(.horizontal, 24)
    }

    private func zoomMetaChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .bold))
            .tracking(1)
            .foregroundStyle(BracketLayout.secondaryText)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(Color.white.opacity(0.07))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.8))
            )
    }

    private var showdownStage: some View {
        VStack(spacing: 18) {
            Text("SHOWDOWN")
                .font(.system(size: 10, weight: .heavy))
                .tracking(2.4)
                .foregroundStyle(BracketLayout.headerColor)

            showdownTeamPanel(
                team: matchup.topTeam,
                label: "TOP SIDE",
                isWinner: matchup.winner?.id == matchup.topTeam?.id
            )

            ZStack {
                HStack(spacing: 12) {
                    Rectangle().fill(BracketLayout.cardBorder.opacity(0.8)).frame(height: 1)
                    Text("VS")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(BracketLayout.tertiaryText)
                    Rectangle().fill(BracketLayout.cardBorder.opacity(0.8)).frame(height: 1)
                }

                pickFocusCard
            }
            .padding(.vertical, 2)

            showdownTeamPanel(
                team: matchup.bottomTeam,
                label: "BOTTOM SIDE",
                isWinner: matchup.winner?.id == matchup.bottomTeam?.id
            )
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
        .padding(.bottom, 28)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            BracketLayout.panelBg.opacity(0.98),
                            BracketLayout.cardBg.opacity(0.96)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(BracketLayout.panelStroke, lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.4), radius: 22, y: 12)
        .shadow(color: BracketLayout.stageGlow.opacity(0.12), radius: 34, y: 0)
        .padding(.horizontal, 20)
    }

    private var floatingPickOverlay: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(BracketLayout.accentGold)
                Text("PICK CARD")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(2)
                    .foregroundStyle(BracketLayout.headerColor)
                Spacer()
                if let confidence = matchup.confidence {
                    Text("\(Int(confidence))%")
                        .font(.system(size: 11, weight: .heavy, design: .monospaced))
                        .foregroundStyle(BracketLayout.accentGold)
                }
            }

            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(matchup.winner?.shortName ?? "TBD")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(BracketLayout.primaryText)
                        .lineLimit(1)
                    Text(overlaySubtitle)
                        .font(.system(size: 11.5, weight: .medium))
                        .foregroundStyle(BracketLayout.secondaryText)
                        .lineLimit(2)
                }

                Spacer()

                VStack(spacing: 8) {
                    if matchup.isUpset == true {
                        overlayStatusChip("UPSET", color: BracketLayout.incorrectRed)
                    }
                    if let correct = matchup.correct {
                        overlayStatusChip(correct ? "HIT" : "MISS", color: correct ? BracketLayout.correctGreen : BracketLayout.incorrectRed)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.thinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    BracketLayout.panelBg.opacity(0.9),
                                    BracketLayout.cardBg.opacity(0.88)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 0.9)
                )
        )
        .shadow(color: .black.opacity(0.42), radius: 24, y: 10)
        .shadow(color: BracketLayout.stageGlow.opacity(0.12), radius: 24, y: 0)
    }

    private var overlaySubtitle: String {
        if let winner = matchup.winner {
            let loserName: String
            if matchup.topTeam?.id == winner.id {
                loserName = matchup.bottomTeam?.shortName ?? "TBD"
            } else {
                loserName = matchup.topTeam?.shortName ?? "TBD"
            }
            return "Gary has \(winner.shortName) moving past \(loserName)."
        }
        return "Gary hasn't locked a side here yet."
    }

    private func overlayStatusChip(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .heavy))
            .tracking(1.2)
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(color.opacity(0.1))
                    .overlay(Capsule().stroke(color.opacity(0.2), lineWidth: 0.8))
            )
    }

    private func showdownTeamPanel(team: BracketTeam?, label: String, isWinner: Bool) -> some View {
        let teamName = team?.name ?? "TBD"

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(label)
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(BracketLayout.tertiaryText)
                Spacer()
                if isWinner {
                    Text("GARY PICK")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(1.2)
                        .foregroundStyle(BracketLayout.accentGold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(BracketLayout.accentGold.opacity(0.1))
                                .overlay(Capsule().stroke(BracketLayout.accentGold.opacity(0.24), lineWidth: 0.8))
                        )
                }
            }

            HStack(spacing: 14) {
                Text(team.map { String($0.seed) } ?? "-")
                    .font(.system(size: 24, weight: .heavy, design: .monospaced))
                    .foregroundStyle(isWinner ? BracketLayout.accentGold : BracketLayout.secondaryText)
                    .frame(width: 52, height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(isWinner ? BracketLayout.accentGold.opacity(0.12) : Color.white.opacity(0.06))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16)
                                    .stroke(isWinner ? BracketLayout.accentGold.opacity(0.2) : Color.white.opacity(0.08), lineWidth: 0.8)
                            )
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(teamName)
                        .font(.system(size: 21, weight: .bold))
                        .foregroundStyle(isWinner ? BracketLayout.primaryText : BracketLayout.secondaryText)
                    Text(isWinner ? "projected to advance" : "still alive in the matchup")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(BracketLayout.tertiaryText)
                }

                Spacer()

                Image(systemName: isWinner ? "scope" : "circle.hexagongrid.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(isWinner ? BracketLayout.accentGold : BracketLayout.tertiaryText.opacity(0.7))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(isWinner ? BracketLayout.accentGold.opacity(0.06) : Color.white.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(isWinner ? BracketLayout.accentGold.opacity(0.14) : Color.white.opacity(0.08), lineWidth: 0.8)
                )
        )
    }

    private var pickFocusCard: some View {
        VStack(spacing: 6) {
            Text("GARY'S EDGE")
                .font(.system(size: 8, weight: .heavy))
                .tracking(1.5)
                .foregroundStyle(BracketLayout.headerColor)

            Text(matchup.winner?.shortName ?? "TBD")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(BracketLayout.primaryText)
                .lineLimit(1)

            HStack(spacing: 6) {
                if let confidence = matchup.confidence {
                    Text("\(Int(confidence))% CONF")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(1)
                        .foregroundStyle(BracketLayout.accentGold)
                }

                if matchup.isUpset == true {
                    Text("UPSET")
                        .font(.system(size: 8, weight: .heavy))
                        .tracking(1)
                        .foregroundStyle(BracketLayout.incorrectRed)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(
                    LinearGradient(
                        colors: [
                            BracketLayout.cardHighlightBg,
                            BracketLayout.panelBg
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(BracketLayout.accentGold.opacity(0.22), lineWidth: 0.9)
                )
        )
        .shadow(color: .black.opacity(0.3), radius: 12, y: 4)
    }

    private func winnerSummaryCard(_ winner: BracketTeam) -> some View {
        VStack(spacing: 12) {
            Text("GARY'S TICKET TO ADVANCE")
                .font(.system(size: 10, weight: .bold))
                .tracking(2)
                .foregroundStyle(BracketLayout.accentGold.opacity(0.7))

            HStack(spacing: 12) {
                Text("#\(winner.seed)")
                    .font(.system(size: 28, weight: .heavy, design: .monospaced))
                    .foregroundStyle(BracketLayout.accentGold)
                    .frame(width: 48, height: 48)
                    .background(RoundedRectangle(cornerRadius: 12).fill(BracketLayout.accentGold.opacity(0.1)))

                VStack(alignment: .leading, spacing: 3) {
                    Text(winner.shortName)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(BracketLayout.primaryText)
                    Text("advances to \(nextRoundName)")
                        .font(.system(size: 11))
                        .foregroundStyle(BracketLayout.tertiaryText)
                }

                Spacer()

                if matchup.isUpset == true {
                    VStack(spacing: 2) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(BracketLayout.incorrectRed)
                        Text("UPSET")
                            .font(.system(size: 7, weight: .bold))
                            .tracking(0.5)
                            .foregroundStyle(BracketLayout.incorrectRed)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(BracketLayout.accentGold.opacity(0.06))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(BracketLayout.accentGold.opacity(0.2), lineWidth: 0.8))
            )

            if let confidence = matchup.confidence {
                VStack(spacing: 5) {
                    HStack {
                        Text("CONFIDENCE")
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                            .tracking(1)
                            .foregroundStyle(BracketLayout.tertiaryText)
                        Spacer()
                        Text("\(Int(confidence))%")
                            .font(.system(size: 13, weight: .heavy, design: .monospaced))
                            .foregroundStyle(BracketLayout.accentGold)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.08))
                            RoundedRectangle(cornerRadius: 3)
                                .fill(GaryColors.goldGradient)
                                .frame(width: geo.size.width * CGFloat(confidence / 100.0))
                        }
                    }
                    .frame(height: 6)
                }
            }
        }
        .padding(16)
        .background(panelCardBackground)
        .padding(.horizontal, 24)
    }

    private var hasProsOrCons: Bool {
        !(matchup.topTeamPros ?? []).isEmpty || !(matchup.topTeamCons ?? []).isEmpty || !(matchup.bottomTeamPros ?? []).isEmpty || !(matchup.bottomTeamCons ?? []).isEmpty
    }

    private func zoomInsightsCard(team: BracketTeam, pros: [String], cons: [String], isWinner: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("#\(team.seed)").font(.system(size: 12, weight: .heavy, design: .monospaced)).foregroundStyle(isWinner ? BracketLayout.accentGold : BracketLayout.tertiaryText)
                Text(team.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(isWinner ? BracketLayout.primaryText : BracketLayout.secondaryText)
                if isWinner { Image(systemName: "star.fill").font(.system(size: 9)).foregroundStyle(BracketLayout.accentGold) }
            }
            if !pros.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(pros, id: \.self) { pro in
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "arrow.up.circle.fill").font(.system(size: 10)).foregroundStyle(BracketLayout.correctGreen).frame(width: 14)
                            Text(pro).font(.system(size: 12)).foregroundStyle(BracketLayout.secondaryText).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            if !cons.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(cons, id: \.self) { con in
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "arrow.down.circle.fill").font(.system(size: 10)).foregroundStyle(BracketLayout.incorrectRed).frame(width: 14)
                            Text(con).font(.system(size: 12)).foregroundStyle(BracketLayout.secondaryText).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isWinner ? BracketLayout.accentGold.opacity(0.05) : Color.white.opacity(0.045))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(isWinner ? BracketLayout.accentGold.opacity(0.16) : BracketLayout.cardBorder, lineWidth: 0.8)
                )
        )
    }

    private var panelCardBackground: some View {
        RoundedRectangle(cornerRadius: 18)
            .fill(
                LinearGradient(
                    colors: [
                        BracketLayout.panelBg.opacity(0.98),
                        BracketLayout.cardBg.opacity(0.95)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.white.opacity(0.08), lineWidth: 0.8)
            )
    }
}

// MARK: - Bracket Entry Button (for Picks page)

struct MarchMadnessBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("NCAA Tournament Bracket").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
            Text("LIVE").font(.system(size: 9, weight: .bold)).foregroundStyle(.black).padding(.horizontal, 5).padding(.vertical, 2).background(Capsule().fill(GaryColors.gold))
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(GaryColors.gold.opacity(0.5))
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(hex: "#141416")).overlay(RoundedRectangle(cornerRadius: 10).stroke(GaryColors.gold.opacity(0.2), lineWidth: 0.5)))
    }
}
