// ShareCards.swift — Share Cards (pick → branded story/square image).
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Share Cards (pick → branded story/square image)
//
// "Stack Row" share card (June 2026, chosen from the design range boards):
// the pick rides a compact card on its sport's accent-color field with that
// sport's equipment seams drawn oversized behind — stacked team rows with
// team-color chips (team COLORS are free to use; logos are licensed), the
// picked side lit, and the pick itself in display type as the hero. States
// ride `gameResult`: pregame (no stamp), CASHED (gold) on wins, LOST on losses.
// HOUSE RULE: share assets carry UNITS/records only — never dollars.

/// Sport accent field behind the share card. Deeper, richer cousins of
/// `Sport.accentColor` — the flat UI accents are tuned for 11pt eyebrows,
/// not full-bleed card fields.
func shareFieldColors(for sport: Sport) -> (top: Color, bottom: Color) {
    switch sport {
    case .mlb, .mlbHR:  return (Color(hex: "#2D5A27"), Color(hex: "#1B3A17"))
    case .nba, .wnba:   return (Color(hex: "#3B82F6"), Color(hex: "#1E50C8"))
    case .ncaab:        return (Color(hex: "#EA6A12"), Color(hex: "#B54A08"))
    case .nhl:          return (Color(hex: "#0795C9"), Color(hex: "#045E84"))
    case .nfl, .nflTDs: return (Color(hex: "#1F65B3"), Color(hex: "#103D73"))
    case .ncaaf:        return (Color(hex: "#CD2828"), Color(hex: "#8E1B1B"))
    case .epl:          return (Color(hex: "#8B5CF6"), Color(hex: "#6128D9"))
    case .worldCup:     return (Color(hex: "#14B8A6"), Color(hex: "#0D7568"))
    case .all:          return (Color(hex: "#1A1714"), Color(hex: "#0C0B0A"))
    }
}

/// The sport's ball drawn as oversized seam lines behind the card content —
/// baseball stitching, basketball channels, rink markings, soccer panels,
/// football laces. Translucent ink only: texture, not illustration.
struct SportSeamTexture: View {
    let sport: Sport

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            switch sport {
            case .mlb, .mlbHR:
                ZStack {
                    let seam = Path { p in
                        p.move(to: CGPoint(x: w * 1.08, y: -h * 0.06))
                        p.addCurve(to: CGPoint(x: w * 1.08, y: h * 0.88),
                                   control1: CGPoint(x: w * 0.40, y: h * 0.20),
                                   control2: CGPoint(x: w * 0.40, y: h * 0.62))
                    }
                    seam.stroke(Color.black.opacity(0.15), style: StrokeStyle(lineWidth: w * 0.075, dash: [3.5, 13]))
                    seam.stroke(Color.black.opacity(0.22), style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                    let seam2 = Path { p in
                        p.move(to: CGPoint(x: -w * 0.10, y: h * 0.34))
                        p.addCurve(to: CGPoint(x: -w * 0.10, y: h * 1.08),
                                   control1: CGPoint(x: w * 0.40, y: h * 0.55),
                                   control2: CGPoint(x: w * 0.40, y: h * 0.88))
                    }
                    seam2.stroke(Color.black.opacity(0.10), style: StrokeStyle(lineWidth: w * 0.065, dash: [3.5, 13]))
                    seam2.stroke(Color.black.opacity(0.15), style: StrokeStyle(lineWidth: 3))
                }
            case .nba, .wnba, .ncaab:
                ZStack {
                    Circle()
                        .stroke(Color.black.opacity(0.18), lineWidth: 4)
                        .frame(width: w * 1.5, height: w * 1.5)
                        .position(x: w * 1.02, y: h * 0.46)
                    Path { p in
                        p.move(to: CGPoint(x: w * 1.05, y: -h * 0.04))
                        p.addCurve(to: CGPoint(x: w * 1.05, y: h * 0.92),
                                   control1: CGPoint(x: w * 0.52, y: h * 0.24),
                                   control2: CGPoint(x: w * 0.52, y: h * 0.66))
                    }
                    .stroke(Color.black.opacity(0.18), lineWidth: 4)
                    Path { p in
                        p.move(to: CGPoint(x: w * 0.28, y: h * 0.40))
                        p.addCurve(to: CGPoint(x: w * 1.30, y: h * 0.40),
                                   control1: CGPoint(x: w * 0.60, y: h * 0.29),
                                   control2: CGPoint(x: w * 0.98, y: h * 0.29))
                    }
                    .stroke(Color.black.opacity(0.15), lineWidth: 4)
                    Path { p in
                        p.move(to: CGPoint(x: w * 0.28, y: h * 0.52))
                        p.addCurve(to: CGPoint(x: w * 1.30, y: h * 0.52),
                                   control1: CGPoint(x: w * 0.60, y: h * 0.63),
                                   control2: CGPoint(x: w * 0.98, y: h * 0.63))
                    }
                    .stroke(Color.black.opacity(0.15), lineWidth: 4)
                }
            case .nhl:
                ZStack {
                    Rectangle()
                        .fill(Color.black.opacity(0.14))
                        .frame(width: w * 1.3, height: 5)
                        .position(x: w * 0.5, y: h * 0.42)
                    Circle()
                        .stroke(Color.black.opacity(0.16), lineWidth: 4)
                        .frame(width: w * 0.95, height: w * 0.95)
                        .position(x: w * 0.94, y: h * 0.42)
                    Circle()
                        .fill(Color.black.opacity(0.16))
                        .frame(width: 11, height: 11)
                        .position(x: w * 0.94, y: h * 0.42)
                }
            case .worldCup, .epl:
                ZStack {
                    Circle()
                        .stroke(Color.black.opacity(0.16), lineWidth: 4)
                        .frame(width: w * 1.25, height: w * 1.25)
                        .position(x: w * 1.04, y: h * 0.46)
                    SharePentagon()
                        .stroke(Color.black.opacity(0.16), lineWidth: 4)
                        .frame(width: w * 0.34, height: w * 0.34)
                        .position(x: w * 0.92, y: h * 0.46)
                }
            case .nfl, .ncaaf, .nflTDs:
                ZStack {
                    Rectangle()
                        .fill(Color.black.opacity(0.16))
                        .frame(width: 4, height: h * 0.52)
                        .position(x: w * 0.88, y: h * 0.45)
                    ForEach(0..<5, id: \.self) { i in
                        Rectangle()
                            .fill(Color.black.opacity(0.16))
                            .frame(width: w * 0.11, height: 4)
                            .position(x: w * 0.88, y: h * (0.26 + CGFloat(i) * 0.095))
                    }
                }
            case .all:
                EmptyView()
            }
        }
        .allowsHitTesting(false)
    }
}

/// Regular pentagon — the soccer-ball panel for the WC/EPL share texture.
struct SharePentagon: Shape {
    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        var p = Path()
        for i in 0..<5 {
            let a = (CGFloat(i) * 2 * .pi / 5) - .pi / 2
            let pt = CGPoint(x: c.x + r * cos(a), y: c.y + r * sin(a))
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

// MARK: Team color chips (logos are licensed; team COLORS are not)

/// Primary brand color per team, keyed by the SAME abbreviations as the
/// keyword maps. White chip text must clear every value — keep them dark.
let mlbTeamColors: [String: String] = [
    "ARI": "#A71930", "ATL": "#CE1141", "BAL": "#DF4601", "BOS": "#BD3039",
    "CHC": "#0E3386", "CWS": "#27251F", "CHW": "#27251F", "CIN": "#C6011F",
    "CLE": "#00385D", "COL": "#333366", "DET": "#0C2340", "HOU": "#EB6E1F",
    "KC": "#004687", "LAA": "#BA0021", "LAD": "#005A9C", "MIA": "#00A3E0",
    "MIL": "#12284B", "MIN": "#002B5C", "NYM": "#FF5910", "NYY": "#0C2340",
    "ATH": "#003831", "OAK": "#003831", "PHI": "#E81828", "PIT": "#27251F",
    "SD": "#2F241D", "SF": "#FD5A1E", "SEA": "#0C2C56", "STL": "#C41E3A",
    "TB": "#092C5C", "TEX": "#003278", "TOR": "#134A8E", "WSH": "#AB0003",
]

let nbaTeamColors: [String: String] = [
    "ATL": "#E03A3E", "BOS": "#007A33", "BKN": "#17171A", "CHA": "#1D1160",
    "CHI": "#CE1141", "CLE": "#860038", "DAL": "#00538C", "DEN": "#0E2240",
    "DET": "#C8102E", "GSW": "#1D428A", "HOU": "#CE1141", "IND": "#002D62",
    "LAC": "#C8102E", "LAL": "#552583", "MEM": "#5D76A9", "MIA": "#98002E",
    "MIL": "#00471B", "MIN": "#0C2340", "NOP": "#0C2340", "NYK": "#006BB6",
    "OKC": "#007AC1", "ORL": "#0077C0", "PHI": "#006BB6", "PHX": "#1D1160",
    "POR": "#E03A3E", "SAC": "#5A2D81", "SAS": "#17171A", "TOR": "#CE1141",
    "UTA": "#002B5C", "WAS": "#002B5C",
]

let nhlTeamColors: [String: String] = [
    "ANA": "#F47A38", "BOS": "#17171A", "BUF": "#003087", "CGY": "#D2001C",
    "CAR": "#CE1126", "CHI": "#CF0A2C", "COL": "#6F263D", "CBJ": "#002654",
    "DAL": "#006847", "DET": "#CE1126", "EDM": "#041E42", "FLA": "#C8102E",
    "LAK": "#17171A", "MIN": "#154734", "MTL": "#AF1E2D", "NSH": "#041E42",
    "NJD": "#CE1126", "NYI": "#00539B", "NYR": "#0038A8", "OTT": "#C52032",
    "PHI": "#F74902", "PIT": "#17171A", "SEA": "#001628", "SJS": "#006D75",
    "STL": "#002F87", "TBL": "#002868", "TOR": "#00205B", "UTA": "#3D7DA3",
    "VAN": "#00205B", "VGK": "#B4975A", "WPG": "#041E42", "WSH": "#C8102E",
]

/// Marquee World Cup nations (flag-leaning, darkened for white text);
/// the rest fall back to the WC teal accent.
let wcTeamColors: [String: String] = [
    "ARG": "#3F87B8", "AUS": "#00843D", "BEL": "#17171A", "BRA": "#009C3B",
    "CAN": "#D80621", "CRO": "#C8102E", "ECU": "#23427A", "EGY": "#C8102E",
    "ENG": "#1B2E5A", "ESP": "#AA151B", "FRA": "#002395", "GER": "#17171A",
    "JPN": "#BC002D", "KOR": "#0F4C81", "KSA": "#006C35", "MAR": "#C1272D",
    "MEX": "#006847", "NED": "#E77310", "NOR": "#BA0C2F", "POR": "#DA291C",
    "QAT": "#8A1538", "SCO": "#0065BF", "SEN": "#00853F", "SUI": "#DA291C",
    "TUN": "#E70013", "URU": "#4E84B5", "USA": "#0A3161",
]

/// Abbrev for any team name via the league keyword maps (share-card sibling
/// of CompactPickRow.teamAbbrev — keep the two in sync).
func shareTeamAbbrev(_ name: String, league: String?) -> String {
    let lower = name.lowercased()
    let lg = (league ?? "").uppercased()
    if lg == "NCAAF" { return Formatters.shortTeamName(name, league: league).uppercased() }
    let maps: [[String: [String]]] = lg == "NBA" || lg == "WNBA" ? [nbaTeamKeywords]
        : lg == "MLB" || lg == "MLB HR" ? [mlbTeamKeywords]
        : lg == "NHL" ? [nhlTeamKeywords]
        : lg == "NFL" || lg == "NFL TDS" ? [nflTeamKeywords]
        : lg == "WC" ? [wcTeamKeywords]
        : [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords, wcTeamKeywords]
    for map in maps {
        for (abbr, kws) in map where kws.contains(where: { lower.contains($0) }) { return abbr }
    }
    let last = lower.split(separator: " ").last.map(String.init) ?? lower
    return String(last.prefix(3)).uppercased()
}

/// Chip styling for a team: brand color + the initials worn on the puck.
/// WC keeps the full 3-letter country code; clubs wear 1–2 characters.
func teamChipStyle(team: String, league: String?, abbreviation: String? = nil) -> (color: Color, label: String) {
    let lg = (league ?? "").uppercased()
    let stored = abbreviation?.trimmingCharacters(in: .whitespacesAndNewlines)
    let abbr = stored?.isEmpty == false ? stored!.uppercased() : shareTeamAbbrev(team, league: league)
    let map: [String: String]? =
        lg == "MLB" || lg == "MLB HR" ? mlbTeamColors
        : lg == "NBA" || lg == "WNBA" ? nbaTeamColors
        : lg == "NHL" ? nhlTeamColors
        : lg == "WC" ? wcTeamColors
        : nil
    let color = (map?[abbr]).map { Color(hex: $0) } ?? Sport.from(league: league).accentColor
    // Official abbreviation, always — "NYK", not "N" (user call, Jun 11).
    let label = String(abbr.prefix(3))
    return (color, label)
}

/// Solid team-color puck wearing the team's initials — the license-free
/// stand-in for a club mark.
struct TeamColorChip: View {
    let team: String
    let league: String?
    var abbreviation: String? = nil
    var size: CGFloat = 40
    var dimmed: Bool = false

    var body: some View {
        let style = teamChipStyle(team: team, league: league, abbreviation: abbreviation)
        let fontScale: CGFloat = style.label.count >= 3 ? 0.30 : (style.label.count == 2 ? 0.36 : 0.44)
        ZStack {
            Circle().fill(style.color)
            Circle().strokeBorder(.white.opacity(dimmed ? 0.28 : 0.42), lineWidth: max(1.5, size * 0.045))
            Text(style.label)
                .font(GaryFonts.mono(size * fontScale, bold: true))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .opacity(dimmed ? 0.62 : 1)
        .saturation(dimmed ? 0.75 : 1)
    }
}

/// Which side of the matchup does the pick text back? Short mascot first,
/// then any distinctive ≥4-char word of the full name — display truncation
/// can strip mascots ("Vegas Golden ML"). Sibling of CompactPickRow.sideIsPicked.
func sharePickSideMatch(pickText: String, full: String?, short: String, otherFull: String?) -> Bool {
    let p = pickText.lowercased()
    if !short.isEmpty, p.contains(short.lowercased()) { return true }
    guard let full, !full.isEmpty else { return false }
    let otherWords = Set((otherFull ?? "").lowercased().split(separator: " ").map(String.init))
    return full.lowercased().split(separator: " ").map(String.init)
        .contains { $0.count >= 4 && !otherWords.contains($0) && p.contains($0) }
}

/// "Nationals ML" → "WSH ML": strip the leading run of picked-team words and
/// put the standard abbreviation in their place (odds already split off by
/// formattedPickParts). Totals pass through untouched ("OVER 9.5").
func compactSharePick(pick: GaryPick, awayPicked: Bool, homePicked: Bool,
                      awayShort: String, homeShort: String) -> String {
    let raw = pick.formattedPickParts.pick
    guard awayPicked || homePicked else { return raw.uppercased() }
    let pickedFull = homePicked ? (pick.homeTeam ?? "") : (pick.awayTeam ?? "")
    let pickedShort = homePicked ? homeShort : awayShort
    let stored = homePicked ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation
    let cleanedStored = stored?.trimmingCharacters(in: .whitespacesAndNewlines)
    let abbrev = cleanedStored?.isEmpty == false
        ? cleanedStored!.uppercased()
        : shareTeamAbbrev(pickedShort.isEmpty ? pickedFull : pickedShort, league: pick.league)
    var teamWords = Set(pickedFull.lowercased().split(separator: " ").map(String.init))
    teamWords.formUnion(pickedShort.lowercased().split(separator: " ").map(String.init))
    var words = raw.split(separator: " ").map(String.init)
    var lead = 0
    while lead < words.count, teamWords.contains(words[lead].lowercased()) { lead += 1 }
    guard lead > 0 else { return raw.uppercased() }
    words.removeFirst(lead)
    return ([abbrev] + words).joined(separator: " ").uppercased()
}

/// The shareable pick card — rendered at 2x from a 540×960 story canvas or
/// 540×540 square by `renderPickShareImages`.
struct ShareCardView: View {
    let pick: GaryPick
    var gameResult: String? = nil
    var square: Bool = false

    private var sport: Sport { Sport.from(league: pick.league) }
    private var field: (top: Color, bottom: Color) { shareFieldColors(for: sport) }
    private var tier: String? { pick.confidence.map { convictionTier(min(max($0, 0), 1)) } }
    private var stamp: (text: String, color: Color)? {
        switch gameResult?.lowercased() {
        case "won":  return (AppFlags.wonStamp, GaryColors.gold)
        case "lost": return ("LOST", GaryColors.gold)
        default:     return nil
        }
    }

    private var awayShort: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeShort: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var awayPicked: Bool {
        sharePickSideMatch(pickText: pick.pick ?? "", full: pick.awayTeam, short: awayShort, otherFull: pick.homeTeam)
    }
    private var homePicked: Bool {
        sharePickSideMatch(pickText: pick.pick ?? "", full: pick.homeTeam, short: homeShort, otherFull: pick.awayTeam)
    }
    private var pickParts: (pick: String, odds: String) { pick.formattedPickParts }
    private var heroPick: String {
        compactSharePick(pick: pick, awayPicked: awayPicked, homePicked: homePicked,
                         awayShort: awayShort, homeShort: homeShort)
    }
    /// "TONIGHT — 7:05 PM ET" when the game is today; bare time otherwise.
    private var headerTime: String {
        let t = Formatters.formatCommenceTime(pick.displayTime)
        guard !t.isEmpty else { return GaryPageHeader<EmptyView>.shortDateLabel().uppercased() }
        if let d = parseISO8601(pick.displayTime ?? ""), Calendar.current.isDateInToday(d) {
            return "TONIGHT — \(t.uppercased())"
        }
        return t.uppercased()
    }

    private var cardWidth: CGFloat { square ? 432 : 448 }

    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(hex: "#151311"), Color(hex: "#0B0A09")],
                           center: .top, startRadius: 60, endRadius: square ? 640 : 1000)

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(GaryBrand.mark)
                        .resizable().scaledToFit()
                        .frame(width: square ? 38 : 46, height: square ? 38 : 46)
                    Text("GARY A.I.")
                        .font(GaryFonts.mono(square ? 15 : 17))
                        .tracking(1.5)
                        .foregroundStyle(GaryColors.gold)
                }

                Spacer(minLength: 0)
                stackCard
                Spacer(minLength: 0)

                HStack {
                    Text(AppFlags.storeSafe ? "GARY AI" : "betwithgary.ai")
                        .font(GaryFonts.mono(12.5))
                        .foregroundStyle(.white.opacity(0.55))
                    Spacer()
                    Text(GaryPageHeader<EmptyView>.shortDateLabel().uppercased())
                        .font(GaryFonts.mono(11.5))
                        .foregroundStyle(.white.opacity(0.62))
                }
                .frame(width: cardWidth)
            }
            .padding(.vertical, square ? 26 : 44)

            if let stamp {
                Text(stamp.text)
                    .font(GaryFonts.mono(square ? 38 : 46, bold: true)).tracking(4)
                    .foregroundStyle(stamp.color.opacity(0.92))
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .overlay(Rectangle().stroke(stamp.color.opacity(0.85), lineWidth: 3))
                    .rotationEffect(.degrees(-12))
            }
        }
        .frame(width: 540, height: square ? 540 : 960)
    }

    private var stackCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(headerTime)
                    .font(GaryFonts.mono(13.5)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.78))
                Spacer()
                Text((pick.league ?? "").uppercased())
                    .font(GaryFonts.mono(12.5, bold: true)).tracking(1.5)
                    .foregroundStyle(.white.opacity(0.55))
            }

            VStack(spacing: square ? 12 : 15) {
                teamRow(name: awayShort, team: pick.awayTeam ?? awayShort,
                        abbreviation: pick.awayTeamAbbreviation, picked: awayPicked)
                teamRow(name: homeShort, team: pick.homeTeam ?? homeShort,
                        abbreviation: pick.homeTeamAbbreviation, picked: homePicked)
            }
            .padding(.top, square ? 18 : 24)

            Rectangle()
                .fill(.white.opacity(0.20))
                .frame(height: 1.2)
                .padding(.vertical, square ? 16 : 22)

            Text("GARY'S PICK")
                .font(GaryFonts.mono(12.5, bold: true)).tracking(2.6)
                .foregroundStyle(GaryColors.gold)

            Text(heroPick)
                .font(GaryFonts.display(square ? 52 : 62))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .padding(.top, 6)

            HStack(spacing: 14) {
                if !pickParts.odds.isEmpty {
                    Text(pickParts.odds)
                        .font(GaryFonts.display(square ? 26 : 30))
                        .foregroundStyle(.white.opacity(0.85))
                }
                if let tier {
                    Text(tier)
                        .font(GaryFonts.mono(13, bold: true)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .overlay(Rectangle().stroke(GaryColors.gold.opacity(0.65), lineWidth: 1.2))
                }
                Spacer(minLength: 0)
            }
            .padding(.top, square ? 8 : 10)
        }
        .padding(square ? 26 : 30)
        .frame(width: cardWidth)
        .background(
            ZStack {
                LinearGradient(colors: [field.top, field.bottom],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                SportSeamTexture(sport: sport)
            }
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 26, y: 14)
    }

    private func teamRow(name: String, team: String, abbreviation: String?, picked: Bool) -> some View {
        HStack(spacing: 13) {
            TeamColorChip(team: team, league: pick.league, abbreviation: abbreviation,
                          size: square ? 36 : 40, dimmed: !picked)
            Text(name)
                .font(GaryFonts.text(square ? 21 : 24, picked ? .bold : .semibold))
                .foregroundStyle(.white.opacity(picked ? 1 : 0.62))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 8)
            if picked {
                Text("◆ GARY'S SIDE")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
            }
        }
    }
}

/// Market + call as separate pieces ("H+R+RBI", "OVER 0.5") — the market
/// abbreviated exactly like the prop chip. Headline cards stack them as two
/// lines; the Stack card joins them.
func sharePropMarketParts(_ prop: PropPick) -> (market: String, call: String) {
    var words = Formatters.propDisplay(prop.prop, league: prop.effectiveLeague)
        .split(separator: " ").map(String.init)
    if let last = words.last, Double(last) != nil { words.removeLast() }
    let name = words.joined(separator: " ").uppercased()
    let market = CompactPropRow.marketAbbrevShared[name] ?? name
    var call = (prop.bet ?? "").uppercased()
    if let raw = prop.line?.trimmingCharacters(in: .whitespaces), !raw.isEmpty {
        let lineText: String
        if let d = Double(raw) {
            lineText = d.truncatingRemainder(dividingBy: 1) == 0
                ? String(format: "%g", d) : String(format: "%.1f", d)
        } else { lineText = raw }
        call = call.isEmpty ? lineText : "\(call) \(lineText)"
    }
    return (market, call)
}

/// "H+R+RBI OVER 0.5" — the joined form, for single-line heroes.
func sharePropMarket(_ prop: PropPick) -> String {
    let parts = sharePropMarketParts(prop)
    return parts.call.isEmpty ? parts.market : "\(parts.market) \(parts.call)"
}

/// The prop sibling of ShareCardView — same sport-skin card, but the stacked
/// team rows become ONE player row (chip + name + team), and the hero is the
/// market + call. Same canvas, footer, and CASHED/LOST stamps.
struct SharePropCardView: View {
    let prop: PropPick
    var gameResult: String? = nil
    var square: Bool = false

    private var sport: Sport { Sport.from(league: prop.effectiveLeague) }
    private var field: (top: Color, bottom: Color) { shareFieldColors(for: sport) }
    private var tier: String? { prop.confidence.map { convictionTier(min(max($0, 0), 1)) } }
    private var stamp: (text: String, color: Color)? {
        switch gameResult?.lowercased() {
        case "won":  return (AppFlags.wonStamp, GaryColors.gold)
        case "lost": return ("LOST", GaryColors.gold)
        default:     return nil
        }
    }
    private var teamShort: String {
        Formatters.shortTeamName(prop.team, league: prop.effectiveLeague)
    }
    private var headerTime: String {
        let t = Formatters.formatCommenceTime(prop.commence_time)
        guard !t.isEmpty else { return GaryPageHeader<EmptyView>.shortDateLabel().uppercased() }
        if let d = parseISO8601(prop.commence_time ?? ""), Calendar.current.isDateInToday(d) {
            return "TONIGHT — \(t.uppercased())"
        }
        return t.uppercased()
    }

    private var cardWidth: CGFloat { square ? 432 : 448 }

    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(hex: "#151311"), Color(hex: "#0B0A09")],
                           center: .top, startRadius: 60, endRadius: square ? 640 : 1000)

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(GaryBrand.mark)
                        .resizable().scaledToFit()
                        .frame(width: square ? 38 : 46, height: square ? 38 : 46)
                    Text("GARY A.I.")
                        .font(GaryFonts.mono(square ? 15 : 17))
                        .tracking(1.5)
                        .foregroundStyle(GaryColors.gold)
                }

                Spacer(minLength: 0)
                propCard
                Spacer(minLength: 0)

                HStack {
                    Text(AppFlags.storeSafe ? "GARY AI" : "betwithgary.ai")
                        .font(GaryFonts.mono(12.5))
                        .foregroundStyle(.white.opacity(0.55))
                    Spacer()
                    Text(GaryPageHeader<EmptyView>.shortDateLabel().uppercased())
                        .font(GaryFonts.mono(11.5))
                        .foregroundStyle(.white.opacity(0.62))
                }
                .frame(width: cardWidth)
            }
            .padding(.vertical, square ? 26 : 44)

            if let stamp {
                Text(stamp.text)
                    .font(GaryFonts.mono(square ? 38 : 46, bold: true)).tracking(4)
                    .foregroundStyle(stamp.color.opacity(0.92))
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .overlay(Rectangle().stroke(stamp.color.opacity(0.85), lineWidth: 3))
                    .rotationEffect(.degrees(-12))
            }
        }
        .frame(width: 540, height: square ? 540 : 960)
    }

    private var propCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(headerTime)
                    .font(GaryFonts.mono(13.5)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.78))
                Spacer()
                Text((prop.effectiveLeague ?? "").uppercased() + " · PROP")
                    .font(GaryFonts.mono(12.5, bold: true)).tracking(1.5)
                    .foregroundStyle(.white.opacity(0.55))
            }

            HStack(spacing: 14) {
                TeamColorChip(team: prop.team ?? "", league: prop.effectiveLeague,
                              size: square ? 40 : 46)
                VStack(alignment: .leading, spacing: 3) {
                    Text(prop.player ?? prop.team ?? "")
                        .font(GaryFonts.text(square ? 22 : 25, .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                    Text(teamShort.uppercased())
                        .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                        .foregroundStyle(.white.opacity(0.6))
                }
                Spacer(minLength: 0)
            }
            .padding(.top, square ? 18 : 24)

            Rectangle()
                .fill(.white.opacity(0.20))
                .frame(height: 1.2)
                .padding(.vertical, square ? 16 : 22)

            Text("GARY'S PICK")
                .font(GaryFonts.mono(12.5, bold: true)).tracking(2.6)
                .foregroundStyle(GaryColors.gold)

            Text(sharePropMarket(prop))
                .font(GaryFonts.display(square ? 42 : 50))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .padding(.top, 6)

            HStack(spacing: 14) {
                Text(Formatters.americanOdds(prop.odds))
                    .font(GaryFonts.display(square ? 26 : 30))
                    .foregroundStyle(.white.opacity(0.85))
                if let tier {
                    Text(tier)
                        .font(GaryFonts.mono(13, bold: true)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .overlay(Rectangle().stroke(GaryColors.gold.opacity(0.65), lineWidth: 1.2))
                }
                Spacer(minLength: 0)
            }
            .padding(.top, square ? 8 : 10)
        }
        .padding(square ? 26 : 30)
        .frame(width: cardWidth)
        .background(
            ZStack {
                LinearGradient(colors: [field.top, field.bottom],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                SportSeamTexture(sport: sport)
            }
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 26, y: 14)
    }
}

/// Renders THE prop share image — the square Headline prop card at 2x.
/// Main-thread only (ImageRenderer); called from button actions. ONE
/// attachment, same rule as renderPickShareImages (founder, Jul 4): two
/// attachments + the tall story canvas read badly in Messages.
@MainActor
func renderPropShareImages(prop: PropPick, gameResult: String?) -> [UIImage] {
    let renderer = ImageRenderer(content: HeadlineSharePropCardView(prop: prop, gameResult: gameResult, square: true, bare: true))
    renderer.scale = 2
    return renderer.uiImage.map { [$0] } ?? []
}

/// "Headline" share card — the Volt Mode direction from the range boards,
/// re-cut in Gary's own colors: the pick as huge display type on warm black,
/// gold eyebrow, the bear riding the top corner so the brand survives any
/// crop. FLAGSHIP (chosen Jun 11): this is what the share buttons render.
/// The Stack Row cards above stay as the alternate skin system.
struct HeadlineShareCardView: View {
    let pick: GaryPick
    var gameResult: String? = nil
    var square: Bool = false
    var bare: Bool = false

    private var tier: String? { pick.confidence.map { convictionTier(min(max($0, 0), 1)) } }
    private var stamp: (text: String, color: Color)? {
        switch gameResult?.lowercased() {
        case "won":  return (AppFlags.wonStamp, GaryColors.gold)
        case "lost": return ("LOST", GaryColors.gold)
        default:     return nil
        }
    }
    private var awayShort: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeShort: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var awayPicked: Bool {
        sharePickSideMatch(pickText: pick.pick ?? "", full: pick.awayTeam, short: awayShort, otherFull: pick.homeTeam)
    }
    private var homePicked: Bool {
        sharePickSideMatch(pickText: pick.pick ?? "", full: pick.homeTeam, short: homeShort, otherFull: pick.awayTeam)
    }
    private var pickParts: (pick: String, odds: String) { pick.formattedPickParts }
    /// The pick, one word per line, "ML" spelled out — headline type wants
    /// full words stacked tall ("NATIONALS / MONEYLINE").
    private var heroLines: String {
        // Specials: name on top, the claim on one line under it (the word-per-
        // line split below would stack "TO/WIN/THE/DERBY" absurdly).
        if (pick.type ?? "") == "special" {
            var w = (pick.pick ?? "").split(separator: " ").map(String.init)
            w.removeAll { $0.range(of: #"^[+-]?\d{3,}$"#, options: .regularExpression) != nil }
            let raw = w.joined(separator: " ")
            // Same verb split as the on-page face — name line, claim line.
            for verb in [" to ", " over ", " under "] {
                if let r = raw.range(of: verb, options: .caseInsensitive) {
                    let claim = String(raw[r.lowerBound...]).trimmingCharacters(in: .whitespaces)
                    return "\(String(raw[..<r.lowerBound]).uppercased())\n\(claim.uppercased())"
                }
            }
            // No bet verb ("Walker longest HR") — name still leads its own line.
            let parts = raw.split(separator: " ").map(String.init)
            if parts.count >= 3 {
                return "\(parts[0].uppercased())\n\(parts.dropFirst().joined(separator: " ").uppercased())"
            }
            return raw.uppercased()
        }
        var words = pickParts.pick.uppercased().split(separator: " ").map(String.init)
        if let i = words.firstIndex(of: "ML") { words[i] = "MONEYLINE" }
        // "ANYTIME GOAL OVER 1" -> "ANYTIME GOAL" (line 1 is implied; book convention)
        if words.contains("ANYTIME"), words.suffix(2) == ["OVER", "1"] { words.removeLast(2) }
        return words.joined(separator: "\n")
    }
    private var metaLine: String {
        let opponent = homePicked ? "vs \(awayShort)"
            : awayPicked ? "@ \(homeShort)"
            : "\(awayShort) @ \(homeShort)"
        let t = Formatters.formatCommenceTime(pick.displayTime)
        var parts = [opponent]
        if !t.isEmpty { parts.append(t) }
        if !pickParts.odds.isEmpty { parts.append(pickParts.odds) }
        return parts.joined(separator: " · ")
    }

    /// The card's ONE sport-color touch — the league token leading the meta
    /// row. MLB uses the lightened grass (flat #2D5A27 dies on warm black).
    private var sportAccentOnDark: Color {
        let s = Sport.from(league: pick.league)
        return (s == .mlb || s == .mlbHR) ? GaryColors.mlbGrass : s.accentColor
    }

    private var cardWidth: CGFloat { square ? 460 : 470 }

    var body: some View {
        ZStack {
            // bare (Jul 5, founder): the shared image IS the card, no canvas behind it. The card's own
            // rounded rectangle becomes the image edge (transparent corners), so it reads as a native
            // card in Messages and DMs instead of a card floating on a black box.
            if !bare {
                RadialGradient(colors: [Color(hex: "#151311"), Color(hex: "#0B0A09")],
                               center: .top, startRadius: 60, endRadius: square ? 640 : 1000)
            }

            headlineCard

            if let stamp {
                Text(stamp.text)
                    .font(GaryFonts.mono(square ? 38 : 46, bold: true)).tracking(4)
                    .foregroundStyle(stamp.color.opacity(0.92))
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .overlay(Rectangle().stroke(stamp.color.opacity(0.85), lineWidth: 3))
                    .rotationEffect(.degrees(-12))
            }
        }
        .frame(width: bare ? nil : 540, height: bare ? nil : (square ? 540 : 960))
    }

    private var headlineCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("GARY'S PICK")
                    .font(GaryFonts.mono(14, bold: true)).tracking(3)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 8)
                Spacer()
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 54, height: 54)
            }

            Text(heroLines)
                .font(GaryFonts.display(square ? 62 : 74))
                .foregroundStyle(.white)
                .lineSpacing(0)
                .lineLimit(4)
                .minimumScaleFactor(0.5)
                .padding(.top, 16)

            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text((pick.league ?? "").uppercased())
                    .font(GaryFonts.mono(13, bold: true)).tracking(1.5)
                    .foregroundStyle(sportAccentOnDark)
                Text(metaLine)
                    .font(GaryFonts.text(18, .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
            .padding(.top, 14)

            Rectangle()
                .fill(.white.opacity(0.12))
                .frame(height: 1)
                .padding(.vertical, 18)

            HStack {
                Text(AppFlags.storeSafe ? "GARY AI" : "betwithgary.ai")
                    .font(GaryFonts.mono(12.5))
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                Spacer()
            }
        }
        .padding(square ? 30 : 34)
        .frame(width: cardWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color(hex: "#121110"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 26, y: 14)
    }
}

/// Prop sibling of the Headline card — market + call stacked as the headline
/// ("H+R+RBI" / "OVER 0.5"), the player leading the meta row. FLAGSHIP for
/// prop shares, paired with HeadlineShareCardView.
struct HeadlineSharePropCardView: View {
    let prop: PropPick
    var gameResult: String? = nil
    var square: Bool = false
    var bare: Bool = false

    private var tier: String? { prop.confidence.map { convictionTier(min(max($0, 0), 1)) } }
    private var stamp: (text: String, color: Color)? {
        switch gameResult?.lowercased() {
        case "won":  return (AppFlags.wonStamp, GaryColors.gold)
        case "lost": return ("LOST", GaryColors.gold)
        default:     return nil
        }
    }
    private var heroLines: String {
        let parts = sharePropMarketParts(prop)
        let bet = parts.call.isEmpty ? parts.market : "\(parts.market) \(parts.call)"
        let player = (prop.player ?? "").uppercased()
        return player.isEmpty ? bet : "\(player)\n\(bet)"
    }
    private var metaLine: String {
        var parts: [String] = []
        let team = Formatters.shortTeamName(prop.team, league: prop.effectiveLeague)
        if !team.isEmpty { parts.append(team) }
        let t = Formatters.formatCommenceTime(prop.commence_time)
        if !t.isEmpty { parts.append(t) }
        let odds = Formatters.americanOdds(prop.odds)
        if !odds.isEmpty { parts.append(odds) }
        return parts.joined(separator: " · ")
    }
    private var sportAccentOnDark: Color {
        let s = Sport.from(league: prop.effectiveLeague)
        return (s == .mlb || s == .mlbHR) ? GaryColors.mlbGrass : s.accentColor
    }

    private var cardWidth: CGFloat { square ? 460 : 470 }

    var body: some View {
        ZStack {
            // bare (Jul 5, founder): the shared image IS the card, no canvas behind it. The card's own
            // rounded rectangle becomes the image edge (transparent corners), so it reads as a native
            // card in Messages and DMs instead of a card floating on a black box.
            if !bare {
                RadialGradient(colors: [Color(hex: "#151311"), Color(hex: "#0B0A09")],
                               center: .top, startRadius: 60, endRadius: square ? 640 : 1000)
            }

            headlineCard

            if let stamp {
                Text(stamp.text)
                    .font(GaryFonts.mono(square ? 38 : 46, bold: true)).tracking(4)
                    .foregroundStyle(stamp.color.opacity(0.92))
                    .padding(.horizontal, 22).padding(.vertical, 10)
                    .overlay(Rectangle().stroke(stamp.color.opacity(0.85), lineWidth: 3))
                    .rotationEffect(.degrees(-12))
            }
        }
        .frame(width: bare ? nil : 540, height: bare ? nil : (square ? 540 : 960))
    }

    private var headlineCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text("GARY'S PICK")
                    .font(GaryFonts.mono(14, bold: true)).tracking(3)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 8)
                Spacer()
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 54, height: 54)
            }

            Text(heroLines)
                .font(GaryFonts.display(square ? 58 : 70))
                .foregroundStyle(.white)
                .lineSpacing(0)
                .lineLimit(4)
                .minimumScaleFactor(0.45)
                .padding(.top, 16)

            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text(((prop.effectiveLeague ?? "") + " · PROP").uppercased())
                    .font(GaryFonts.mono(13, bold: true)).tracking(1.5)
                    .foregroundStyle(sportAccentOnDark)
                Text(metaLine)
                    .font(GaryFonts.text(18, .medium))
                    .foregroundStyle(.white.opacity(0.55))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.top, 14)

            Rectangle()
                .fill(.white.opacity(0.12))
                .frame(height: 1)
                .padding(.vertical, 18)

            HStack {
                Text(AppFlags.storeSafe ? "GARY AI" : "betwithgary.ai")
                    .font(GaryFonts.mono(12.5))
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                Spacer()
            }
        }
        .padding(square ? 30 : 34)
        .frame(width: cardWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color(hex: "#121110"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 26, y: 14)
    }
}

#if DEBUG
// MARK: Share card previews — one per sport skin + result states

func sharePreviewPick(league: String, away: String, home: String,
                              pickText: String, conf: Double) -> GaryPick {
    GaryPick(pick_id: nil, pick: pickText, rationale: nil, league: league,
             confidence: conf, time: nil, homeTeam: home, awayTeam: away,
             type: nil, trapAlert: nil, commence_time: "2026-06-11T23:05:00Z",
             statsData: nil, statsUsed: nil, injuries: nil, venue: nil,
             isNeutralSite: nil, tournamentContext: nil, gameSignificance: nil,
             cfpRound: nil, homeSeed: nil, awaySeed: nil, conference: nil,
             homeConference: nil, awayConference: nil, homeRanking: nil,
             awayRanking: nil, is_top_pick: nil, sportsbook_odds: nil,
             soccerStage: nil, soccerGroup: nil, soccerRound: nil)
}

#Preview("Share — MLB story") {
    ShareCardView(pick: sharePreviewPick(league: "MLB",
        away: "Washington Nationals", home: "San Francisco Giants",
        pickText: "Nationals ML -102", conf: 0.74))
}

#Preview("Share — NBA story") {
    ShareCardView(pick: sharePreviewPick(league: "NBA",
        away: "New York Knicks", home: "Oklahoma City Thunder",
        pickText: "Knicks +6.5 -110", conf: 0.83))
}

#Preview("Share — NHL story") {
    ShareCardView(pick: sharePreviewPick(league: "NHL",
        away: "Edmonton Oilers", home: "Florida Panthers",
        pickText: "Oilers ML +118", conf: 0.66))
}

#Preview("Share — WC story") {
    ShareCardView(pick: sharePreviewPick(league: "WC",
        away: "Mexico", home: "South Korea",
        pickText: "Mexico ML -125", conf: 0.78))
}

#Preview("Share — MLB square · CASHED") {
    ShareCardView(pick: sharePreviewPick(league: "MLB",
        away: "Washington Nationals", home: "San Francisco Giants",
        pickText: "Nationals ML -102", conf: 0.74),
        gameResult: "won", square: true)
}

func propPreviewSample() -> PropPick {
    PropPick(player: "Matt Chapman", team: "San Francisco Giants",
             prop: "Hits + Runs + RBI", bet: "Over", odds: "+110",
             confidence: 0.71, analysis: nil, league: "MLB", sport: nil,
             line: "0.5", time: nil, commence_time: "2026-06-11T23:05:00Z",
             position: "3B", tdCategory: nil,
             matchup: "Washington Nationals @ San Francisco Giants", key_stats: nil)
}

#Preview("Share — MLB prop story") {
    SharePropCardView(prop: propPreviewSample())
}

#Preview("Share — prop square · LOST") {
    SharePropCardView(prop: propPreviewSample(), gameResult: "lost", square: true)
}

#Preview("Share — headline MLB (flagship)") {
    HeadlineShareCardView(pick: sharePreviewPick(league: "MLB",
        away: "Washington Nationals", home: "San Francisco Giants",
        pickText: "Nationals ML -102", conf: 0.74))
}

#Preview("Share — headline prop (flagship)") {
    HeadlineSharePropCardView(prop: propPreviewSample())
}

#Preview("Pick Card — stacked front (in-app)") {
    VStack(spacing: 14) {
        CompactPickRow(pick: sharePreviewPick(league: "MLB",
            away: "Washington Nationals", home: "San Francisco Giants",
            pickText: "Nationals ML -102", conf: 0.74))
        CompactPickRow(pick: sharePreviewPick(league: "NBA",
            away: "New York Knicks", home: "Oklahoma City Thunder",
            pickText: "Knicks +6.5 -110", conf: 0.83))
    }
    .padding(16)
    .background(Color(hex: "#0C0B0A"))
}

/// `-renderShareCards` launch argument: writes every new card render to the
/// app's Documents directory as PNGs, so they can be pulled off the simulator
/// and eyeballed without driving the UI. Debug builds only; no-op otherwise.
@MainActor
func dumpShareCardRendersIfRequested() {
    guard ProcessInfo.processInfo.arguments.contains("-renderShareCards") else { return }
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

    func write(_ view: some View, _ name: String, scale: CGFloat = 2) {
        let renderer = ImageRenderer(content: view)
        renderer.scale = scale
        if let data = renderer.uiImage?.pngData() {
            try? data.write(to: docs.appendingPathComponent("\(name).png"))
        }
    }

    let mlb = sharePreviewPick(league: "MLB", away: "Washington Nationals",
                               home: "San Francisco Giants", pickText: "Nationals ML -102", conf: 0.74)
    let nba = sharePreviewPick(league: "NBA", away: "New York Knicks",
                               home: "Oklahoma City Thunder", pickText: "Knicks +6.5 -110", conf: 0.83)
    write(ShareCardView(pick: mlb), "01-share-mlb-story")
    write(ShareCardView(pick: nba), "02-share-nba-story")
    write(ShareCardView(pick: sharePreviewPick(league: "NHL", away: "Edmonton Oilers",
        home: "Florida Panthers", pickText: "Oilers ML +118", conf: 0.66)), "03-share-nhl-story")
    write(ShareCardView(pick: sharePreviewPick(league: "WC", away: "Mexico",
        home: "South Korea", pickText: "Mexico ML -125", conf: 0.78)), "04-share-wc-story")
    write(ShareCardView(pick: mlb, gameResult: "won", square: true), "05-share-mlb-square-cashed")
    write(SharePropCardView(prop: propPreviewSample()), "06-share-prop-story")
    write(SharePropCardView(prop: propPreviewSample(), gameResult: "lost", square: true), "07-share-prop-square-lost")
    write(HeadlineShareCardView(pick: mlb), "09-headline-mlb-story")
    write(HeadlineShareCardView(pick: nba), "10-headline-nba-story")
    write(HeadlineShareCardView(pick: mlb, gameResult: "won", square: true), "11-headline-mlb-square-cashed")
    write(HeadlineSharePropCardView(prop: propPreviewSample()), "12-headline-prop-story")
    write(
        VStack(spacing: 14) {
            CompactPickRow(pick: mlb)
            CompactPickRow(pick: nba)
        }
        .padding(16)
        .frame(width: 400)
        .background(Color(hex: "#0C0B0A")),
        "08-inapp-stacked-front", scale: 3)
    print("SHARE CARD RENDER DUMP COMPLETE → \(docs.path)")
}
#endif

/// Renders THE share image — the square Headline card at 2x. Main-thread only
/// (ImageRenderer); called from button actions. ONE attachment (founder, Jul 4):
/// sharing both formats made Messages attach two cards, and the 9:16 story
/// canvas read as a tall mostly-empty image in a text bubble. The square is
/// the one shape that reads clean in texts, DMs, and feeds; the story render
/// stays available in code for an explicit story-format option later.
@MainActor
func renderPickShareImages(pick: GaryPick, gameResult: String?) -> [UIImage] {
    let renderer = ImageRenderer(content: HeadlineShareCardView(pick: pick, gameResult: gameResult, square: true, bare: true))
    renderer.scale = 2
    return renderer.uiImage.map { [$0] } ?? []
}

/// Identifiable wrapper so the share sheet rides .sheet(item:).
struct PickShareItem: Identifiable {
    let id = UUID()
    let images: [UIImage]
}

struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// One literal back-face layout for both game picks and prop picks. Supplying
/// different take/share/book actions cannot change its typography, geometry,
/// expansion behavior, fade, border, or footer.
struct GaryTakeCardBack<Tail: View>: View {
    let flipped: Bool
    let takeText: String?
    let shareAccessibilityLabel: String
    let shareImages: () -> [UIImage]
    let tail: Tail

    @State private var shareItem: PickShareItem? = nil
    @State private var copiedTake = false
    @State private var caseExpanded = false

    init(flipped: Bool,
         takeText: String?,
         shareAccessibilityLabel: String,
         shareImages: @escaping () -> [UIImage],
         @ViewBuilder tail: () -> Tail) {
        self.flipped = flipped
        self.takeText = takeText
        self.shareAccessibilityLabel = shareAccessibilityLabel
        self.shareImages = shareImages
        self.tail = tail()
    }

    private var backFade: some View {
        LinearGradient(colors: [Color(hex: "#1C1A1A").opacity(0), Color(hex: "#1C1A1A")],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: 24)
            .allowsHitTesting(false)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            if let take = takeText, !take.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 0) {
                        Text("GARY'S TAKE")
                            .font(GaryFonts.mono(9, bold: true)).tracking(2.2)
                            .foregroundStyle(GaryColors.gold)
                        Spacer(minLength: 8)
                        Button {
                            UIPasteboard.general.string = take
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            withAnimation(.easeOut(duration: 0.15)) { copiedTake = true }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                                withAnimation(.easeIn(duration: 0.25)) { copiedTake = false }
                            }
                        } label: {
                            Image(systemName: copiedTake ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 11.5, weight: .semibold))
                                .foregroundStyle(copiedTake ? GaryColors.gold : .white.opacity(0.5))
                                .frame(width: 24, height: 18)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(copiedTake ? "Take copied" : "Copy Gary's take")

                        Button {
                            let images = shareImages()
                            if !images.isEmpty { shareItem = PickShareItem(images: images) }
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 11.5, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.5))
                                .frame(width: 24, height: 18)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(shareAccessibilityLabel)
                    }

                    // ONLY THE ARROW expands (founder, Aug 26: "expand if a
                    // user clicks the arrow, but if they just click the card's
                    // body it should flip back"). The take text is plain — a
                    // body tap falls through to the container's flip gesture;
                    // the chevron is the one expand control, wearing a real
                    // 44pt-class tap target so it wins the race cleanly.
                    Group {
                        if caseExpanded {
                            Text(take)
                                .font(GaryFonts.text(14.5))
                                .foregroundStyle(.white.opacity(0.88))
                                .lineSpacing(3.5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            ZStack(alignment: .bottom) {
                                // Paragraph breaks flatten to one space in the
                                // PREVIEW only (founder, Aug 26: the window
                                // shows words, not gaps) — expanded keeps
                                // Gary's paragraphs exactly as written.
                                Text(take.replacingOccurrences(of: "\n\n", with: " ")
                                    .replacingOccurrences(of: "\n", with: " "))
                                    .font(GaryFonts.text(14.5))
                                    .foregroundStyle(.white.opacity(0.88))
                                    .lineSpacing(3.5)
                                    // fixedSize = the text renders at FULL height
                                    // and the window clips it mid-line under the
                                    // fade. Without it, SwiftUI ellipsized the
                                    // last visible line ("…") inside the fixed
                                    // frame — the hard no-ellipsis law (Aug 19).
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .frame(height: 158, alignment: .top)
                                    .clipped()
                                backFade
                            }
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Button {
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) { caseExpanded.toggle() }
                        } label: {
                            Image(systemName: caseExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(GaryColors.gold.opacity(0.85))
                                .frame(width: 40, height: 34, alignment: .bottomTrailing)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(caseExpanded ? "Collapse Gary's take" : "Read Gary's full take")
                    }
                }
            }

            tail
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "#1C1A1A"))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(GaryColors.gold.opacity(0.32), lineWidth: 1))
        )
        .onChange(of: flipped) { if !$0 { caseExpanded = false } }
        .sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
    }
}

struct PickCardBack: View {
    let flipped: Bool
    let pick: GaryPick
    var gameResult: String? = nil

    private var takeText: String? {
        // STORE-SAFE BRIDGE: prefer the blind read — written before Gary saw
        // the lines, so it never contained a price. Fallback text still runs
        // through bridgeProse (a no-op outside the bridge).
        if AppFlags.storeSafe,
           let read = pick.game_read?.trimmingCharacters(in: .whitespacesAndNewlines),
           !read.isEmpty {
            return AppFlags.bridgeProse(read)
        }
        // rationale_plain tier REMOVED (founder ruling, Aug 12: "Gary makes
        // the pick. He writes the rationale. That's what goes on the back of
        // the pick card." One organic rationale — no translated middleman,
        // not even for the historical rows that still carry the field.)
        let parts = splitTake(pick.rationale)
        let joined = [parts.take, parts.rest]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        return joined.isEmpty ? nil : AppFlags.bridgeProse(joined)
    }

    var body: some View {
        GaryTakeCardBack(flipped: flipped,
                         takeText: takeText,
                         shareAccessibilityLabel: "Share this pick",
                         shareImages: { renderPickShareImages(pick: pick, gameResult: gameResult) }) {
            if AppFlags.userBookEnabled { TailFadeRow(pick: pick) }
        }
    }
}
