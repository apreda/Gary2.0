import SwiftUI

// THE PARLAY OF THE DAY (founder, Sep 22 2026): Gary's fun ticket, three or
// four of today's published plays riding together, priced like a book would
// price it. Lives on the Darts page as an emblem under the header; tap it and
// the ticket drops down over the page. Never on the Billfold, never on the
// record.

struct ParlayLeg: Decodable, Identifiable {
    let n: Int
    let key: String
    let source: String
    let league: String?
    let text: String
    let odds: Int
    let matchup: String?
    let game_id: String?
    let commence_time: String?
    let result: String?
    let live: LiveScore?
    /// The player's club on a player leg; nil on a game leg, whose words name it.
    let team: String?
    /// The player on a player leg (his card opens from the leg); nil on a game leg.
    let player: String?
    let player_id: String?
    var id: String { key }
}

extension ParlayLeg {
    /// The club a leg is about: a player leg's club; a game leg's club named
    /// in its words ("Cubs game", "Twins ML"), read against the matchup; a
    /// leg that names neither side (a total) is the home club's game.
    var club: String? {
        let sides = (matchup ?? "").components(separatedBy: " @ ")
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let named = sides.first { side in Self.names(for: side).contains { text.localizedCaseInsensitiveContains($0) } }
        return team ?? named ?? sides.last
    }

    /// The ways a leg's words can name a club: the whole name, the nickname
    /// ("Red Sox", "Twins"), and a school ("Ohio State").
    private static func names(for side: String) -> [String] {
        let words = side.split(separator: " ").map(String.init)
        guard words.count > 1 else { return [side] }
        let twoWord = ["Sox", "Jays"].contains(words.last ?? "")
        let nick = twoWord ? words.suffix(2).joined(separator: " ") : words.last!
        let school = words.dropLast(twoWord ? 2 : 1).joined(separator: " ")
        return [side, nick, school].filter { $0.count >= 3 }
    }
}

struct ParlaySlipModel: Decodable {
    let date: String
    let american_odds: Int
    let payout_10: Double
    let reason: String?
    /// "won" once every leg lands, "lost" once one misses; nil while it rides.
    let result: String?
    /// Legs that won so far.
    let landed: Int?
    let legs: [ParlayLeg]
}

extension SupabaseAPI {
    static func fetchParlay(date: String) async throws -> ParlaySlipModel? {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_parlay", body: ["p_date": date])
        if data.isEmpty || String(data: data, encoding: .utf8) == "null" { return nil }
        return try JSONDecoder().decode(ParlaySlipModel.self, from: data)
    }
}

/// One club on the parlay button: its letters, its color, and how many of
/// the ticket's legs it carries.
struct ParlayClub: Identifiable {
    let abbr: String
    let color: Color
    var legs: Int
    var id: String { abbr }
}

extension ParlaySlipModel {
    /// Each leg's club (`ParlayLeg.club`), once per club, in leg order.
    var clubs: [ParlayClub] {
        var out: [ParlayClub] = []
        for leg in legs {
            let league = leg.league ?? "MLB"
            guard let name = leg.club else { continue }
            let abbr = teamAbbrevFromName(name, league: league)
            if let i = out.firstIndex(where: { $0.abbr == abbr }) { out[i].legs += 1; continue }
            out.append(ParlayClub(abbr: abbr, color: TeamColors.color(for: name, league: league) ?? GaryColors.gold, legs: 1))
        }
        return out
    }
}

/// THE PARLAY BUTTON (founder's pick, Sep 23 2026, mock 23 "card header"): a
/// small card by YESTERDAY GARY HIT. A darker band across the top holds the
/// ticket's clubs as overlapping badges, a gold hairline under it, the price
/// and PARLAY below. Tap it and the ticket drops down.
struct ParlayEmblem: View {
    let slip: ParlaySlipModel
    let open: Bool
    let action: () -> Void

    var body: some View {
        let clubs = slip.clubs
        Button(action: action) {
            ParlayEmblemCard(lit: open) {
                ParlayBadges(clubs: clubs, ring: parlayBandInk)
            } figure: {
                Text(LabFormat.price(slip.american_odds))
                    .font(GaryFonts.display(24)).foregroundStyle(GaryColors.warmWhite)
                    .monospacedDigit().fixedSize()
            }
        }
        .buttonStyle(EmblemPress())
        .accessibilityLabel("Parlay of the day, \(slip.legs.count) legs, \(clubs.map(\.abbr).joined(separator: ", ")), \(LabFormat.price(slip.american_odds))")
        .accessibilityHint(open ? "Closes the ticket" : "Shows the ticket")
    }
}

/// Before today's ticket is built (founder, Sep 24 2026: yesterday's parlay
/// stayed up in the morning): the same card with no price, gold G badges
/// where the clubs will go, saying the parlay is on its way. Nothing to tap.
struct ParlayEmblemSoon: View {
    var body: some View {
        ParlayEmblemCard {
            HStack(spacing: -6) {
                ForEach(0..<4, id: \.self) { i in
                    ZStack {
                        Circle().fill(LinearGradient(colors: [GaryMetal.lit, GaryColors.gold, GaryMetal.rim], startPoint: .top, endPoint: .bottom))
                        Text("G").font(GaryFonts.display(11)).foregroundStyle(Color(hex: "#15110A")).offset(x: i == 0 ? 0 : 3, y: 0.5)
                    }
                    .frame(width: 22, height: 22)
                    .overlay(Circle().strokeBorder(parlayBandInk, lineWidth: 1.5))
                    .zIndex(Double(4 - i))
                }
            }
        } figure: {
            EmblemFigure(text: "Coming soon")
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Parlay of the day, coming soon")
    }
}

/// The words over a featured card's label, the same on every card in the row
/// (founder, Sep 24 2026: the cards "should all match the way the words fit
/// ... as it does on the Parlay one", the time and the money in its grey).
struct EmblemFigure: View {
    let text: String
    var body: some View {
        Text(text)
            .font(GaryFonts.ui(13, .semibold)).foregroundStyle(GaryColors.warmWhite.opacity(0.72))
            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.8)
            .padding(.horizontal, 6)
    }
}

/// The surface under the club badges, so each overlap cuts clean.
private let parlayBandInk = Color(hex: "#0F0D0B")

/// A featured card's width: 88, or narrower so four cards fit the screen
/// (founder, Sep 24 2026: the fourth card was cut at the edge).
private struct EmblemWidthKey: EnvironmentKey {
    static let defaultValue: CGFloat = 88
}
extension EnvironmentValues {
    var emblemWidth: CGFloat {
        get { self[EmblemWidthKey.self] }
        set { self[EmblemWidthKey.self] = newValue }
    }
}

/// The card the featured row shares: the band on top, a gold hairline, the
/// figure over its label (PARLAY on the parlay).
struct ParlayEmblemCard<Band: View, Figure: View>: View {
    @Environment(\.emblemWidth) private var width
    var lit = false
    var label = "PARLAY"
    /// The band's ink. The parlay keeps the dark band its coins fill; a card
    /// with a small mark in the band takes a warmer one, so the bare band
    /// never reads as a black slab (founder, Sep 24 2026: "too sharp, too black").
    var bandInk: [Color] = [Color(hex: "#0E0C0A"), Color(hex: "#12100D")]
    @ViewBuilder let band: () -> Band
    @ViewBuilder let figure: () -> Figure

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        VStack(spacing: 0) {
            band()
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(LinearGradient(colors: bandInk, startPoint: .top, endPoint: .bottom))
            Rectangle().fill(GaryColors.gold.opacity(0.55)).frame(height: 1)
            VStack(spacing: 3) {
                figure()
                // A long name (PRIMETIME) spaces tighter so it keeps its margin.
                Text(label)
                    .font(GaryFonts.mono(8, bold: true)).tracking(label.count > 7 ? 0.7 : 1.5)
                    .foregroundStyle(GaryColors.gold).fixedSize()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: width, height: 88)
        .background(LinearGradient(colors: [Color(hex: "#1D1914"), Color(hex: "#141210")], startPoint: .top, endPoint: .bottom))
        .clipShape(shape)
        .overlay(shape.strokeBorder(GaryColors.gold.opacity(lit ? 0.9 : 0.6), lineWidth: 1))
        .contentShape(shape)
    }
}

/// The clubs as overlapping badges. Up to four at 22pt, five at 20pt; past
/// five, the first four and a count. A club with two legs shows once with a
/// small gold count on its shoulder. Every badge after the first centres its
/// letters in the part of it that shows, so an overlap never covers a letter.
/// `ring` is the surface behind the badges, so each overlap cuts clean.
struct ParlayBadges: View {
    let clubs: [ParlayClub]
    let ring: Color

    var body: some View {
        let d: CGFloat = clubs.count <= 4 ? 22 : 20
        let overlap: CGFloat = clubs.count <= 4 ? 6 : 7
        let shown: [ParlayClub] = clubs.count <= 5 ? clubs
            : Array(clubs.prefix(4)) + [ParlayClub(abbr: "+\(clubs.count - 4)", color: Color(hex: "#2A2620"), legs: 1)]
        HStack(spacing: -overlap) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { i, club in
                badge(club, first: i == 0, d: d, overlap: overlap)
                    .zIndex(Double(shown.count - i))
            }
        }
    }

    private func badge(_ club: ParlayClub, first: Bool, d: CGFloat, overlap: CGFloat) -> some View {
        let more = club.abbr.hasPrefix("+")
        return ZStack {
            Circle().fill(club.color)
            Circle().fill(Color.black.opacity(more ? 0 : 0.22))
            Circle().fill(LinearGradient(colors: [.white.opacity(0.20), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.55)))
            Text(club.abbr)
                .font(GaryFonts.display(d >= 22 ? 10 : 9.5)).tracking(0.2)
                .foregroundStyle(more ? LabInk.dim : .white)
                .fixedSize()
                .offset(x: first ? 0 : overlap / 2, y: 0.5)
        }
        .frame(width: d, height: d)
        .overlay(Circle().strokeBorder(ring, lineWidth: 1.5))
        .overlay(alignment: .topTrailing) {
            if club.legs > 1 {
                Text("\(club.legs)")
                    .font(GaryFonts.display(8.5)).foregroundStyle(Color(hex: "#15110A"))
                    .frame(width: 11, height: 11)
                    .background(Circle().fill(GaryColors.gold))
                    .overlay(Circle().strokeBorder(ring, lineWidth: 1.5))
                    .offset(x: 3, y: -3)
            }
        }
    }
}

/// The emblem's press: it sinks, its shadow tightens.
private struct EmblemPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .shadow(color: .black.opacity(0.6), radius: configuration.isPressed ? 2 : 6, y: configuration.isPressed ? 1 : 4)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// The X on a pop-up card's corner (founder, Sep 24 2026: so people know how
/// to close it): the game card on Home and every pop-up card (PopupCard).
struct CardCloseButton: View {
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(GaryColors.warmWhite.opacity(0.9))
                .frame(width: 28, height: 28)
                .background(Circle().fill(GaryColors.warmWhite.opacity(0.14)))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// "PARLAY OF THE DAY · WEDNESDAY".
struct ParlayEyebrow: View {
    let date: String
    var body: some View {
        Text("PARLAY OF THE DAY · \(LabFormat.weekdayWord(date).uppercased())")
            .font(GaryFonts.ui(10.5, .bold)).tracking(1.7)
            .foregroundStyle(GaryColors.gold)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The ticket's ink, from the featured-row mock.
private enum TicketInk {
    // Read on the dark ticket at a glance (founder, Sep 24 2026: the
    // matchup lines at 40% "I cannot read that at all").
    static let muted = GaryColors.warmWhite.opacity(0.78)
    static let faint = GaryColors.warmWhite.opacity(0.62)
    static let rule = GaryColors.warmWhite.opacity(0.12)
    static let body = GaryColors.warmWhite.opacity(0.82)
    static let band = Color(hex: "#0E0C0A")
}

/// THE TICKET (founder, Sep 24 2026: "that design copied to a T", the mock
/// in the featured-row doc): a dark band with the price and what $10 pays,
/// each leg marked as it lands, Gary's reason signed in his hand, and a foot
/// that says where the ticket stands.
struct ParlayTicket: View {
    let slip: ParlaySlipModel
    var onLeg: ((ParlayLeg) -> Void)? = nil

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(LabFormat.price(slip.american_odds))
                    .font(GaryFonts.display(37)).foregroundStyle(GaryColors.warmWhite)
                    .monospacedDigit().fixedSize()
                Spacer(minLength: 8)
                Text("$10 pays \(LabFormat.dollars(slip.payout_10))")
                    .font(GaryFonts.ui(12)).foregroundStyle(TicketInk.muted)
                    .monospacedDigit().fixedSize()
            }
            .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 10)
            .background(LinearGradient(colors: [Color(hex: "#0E0C0A"), Color(hex: "#12100D")], startPoint: .top, endPoint: .bottom))
            .overlay(alignment: .bottom) { Rectangle().fill(GaryColors.gold.opacity(0.55)).frame(height: 1) }

            ForEach(slip.legs) { leg in
                if let onLeg {
                    Button { onLeg(leg) } label: { legRow(leg) }.buttonStyle(.plain)
                } else {
                    legRow(leg)
                }
                Rectangle().fill(TicketInk.rule).frame(height: 1)
            }

            if let reason = slip.reason, !reason.isEmpty {
                // The sign-off on its own line: run into the note, its taller
                // hand font stretched the note's last line gap.
                VStack(alignment: .leading, spacing: 4) {
                    Text(reason).font(GaryFonts.ui(13)).foregroundStyle(TicketInk.body)
                        .lineSpacing(2.5)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("— Gary A.I.").font(GaryFonts.hand(19)).foregroundStyle(GaryColors.lightGold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14).padding(.vertical, 12)
            }

            HStack(alignment: .firstTextBaseline) {
                Text(footWord.text).foregroundStyle(footWord.color)
                Spacer(minLength: 8)
                Text(footCount).foregroundStyle(TicketInk.faint).monospacedDigit()
            }
            .font(GaryFonts.ui(11, .bold)).tracking(1.5)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(TicketInk.band)
        }
        .background(GaryColors.cardBg)
        .clipShape(shape)
        .overlay(shape.strokeBorder(GaryColors.gold.opacity(0.3), lineWidth: 1))
    }

    private func legRow(_ leg: ParlayLeg) -> some View {
        HStack(alignment: .top, spacing: 10) {
            mark(leg).frame(width: 20, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(leg.text).font(GaryFonts.ui(13.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                sub(leg)
            }
            Spacer(minLength: 8)
            Text(LabFormat.price(leg.odds)).font(GaryFonts.ui(13)).foregroundStyle(TicketInk.muted)
                .monospacedDigit().fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func mark(_ leg: ParlayLeg) -> some View {
        switch LabTicketState(result: leg.result) {
        case .won: Text("✓").font(GaryFonts.ui(14, .heavy)).foregroundStyle(GaryColors.win)
        case .lost: Text("✕").font(GaryFonts.ui(14, .heavy)).foregroundStyle(GaryColors.loss)
        case .push: Text("–").font(GaryFonts.ui(14, .heavy)).foregroundStyle(GaryColors.silver)
        case .open:
            if leg.live?.isLive == true {
                Circle().fill(GaryColors.gold).frame(width: 7, height: 7).padding(.top, 6)
            } else {
                Text("\(leg.n)").font(GaryFonts.ui(13, .bold)).foregroundStyle(TicketInk.faint)
            }
        }
    }

    /// The matchup; while the game is on, where it stands; before, when it starts.
    @ViewBuilder private func sub(_ leg: ParlayLeg) -> some View {
        let matchup = leg.matchup ?? ""
        if LabTicketState(result: leg.result) == .open, let live = leg.live, live.isLive {
            Text(liveWords(live)).font(GaryFonts.ui(11.5, .semibold)).foregroundStyle(GaryColors.gold)
                .fixedSize(horizontal: false, vertical: true)
        } else if LabTicketState(result: leg.result) == .open, leg.live?.isFinal != true, let c = leg.commence_time {
            Text([matchup, LabFormat.timeET(c)].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(GaryFonts.ui(12.5)).foregroundStyle(TicketInk.faint)
                .fixedSize(horizontal: false, vertical: true)
        } else if !matchup.isEmpty {
            Text(matchup).font(GaryFonts.ui(12.5)).foregroundStyle(TicketInk.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func liveWords(_ s: LiveScore) -> String {
        var parts: [String] = []
        if let a = s.away_abbr, let h = s.home_abbr, let x = s.away_score, let y = s.home_score {
            parts.append("\(a) \(x) · \(h) \(y)")
        }
        if let d = s.detail, !d.isEmpty { parts.append(d) }
        return parts.isEmpty ? "Live" : parts.joined(separator: " · ")
    }

    private var footWord: (text: String, color: Color) {
        switch LabTicketState(result: slip.result) {
        case .won: return ("HIT", GaryColors.win)
        case .lost: return ("MISSED", GaryColors.loss)
        default:
            let started = slip.legs.contains { $0.live?.isLive == true || $0.live?.isFinal == true || LabTicketState(result: $0.result) != .open }
            return started ? ("LIVE", GaryColors.gold) : ("\(slip.legs.count) LEGS", GaryColors.gold)
        }
    }

    /// Legs landed of the ticket once it starts; before, the first start.
    private var footCount: String {
        let started = slip.legs.contains { $0.live?.isLive == true || $0.live?.isFinal == true || LabTicketState(result: $0.result) != .open }
        if started || slip.result != nil {
            return "\(slip.landed ?? slip.legs.filter { LabTicketState(result: $0.result) == .won }.count) OF \(slip.legs.count)"
        }
        let first = slip.legs.compactMap(\.commence_time).min { (LabFormat.parseISO($0) ?? .distantFuture) < (LabFormat.parseISO($1) ?? .distantFuture) }
        return first.map { "\(LabFormat.timeET($0)) ET" } ?? ""
    }
}

/// The ticket as a picture to share: the day, the ticket, the mark and the
/// address under it. Main thread only (ImageRenderer).
@MainActor
func renderParlayShareImage(_ slip: ParlaySlipModel) -> UIImage? {
    let view = VStack(alignment: .leading, spacing: 12) {
        ParlayEyebrow(date: slip.date)
        ParlayTicket(slip: slip)
        HStack(spacing: 8) {
            Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 22, height: 22)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            Text("betwithgary.ai").font(GaryFonts.ui(12, .semibold)).foregroundStyle(TicketInk.muted)
        }
    }
    .padding(20)
    .frame(width: 380)
    .background(GaryColors.darkBg)
    let renderer = ImageRenderer(content: view)
    renderer.scale = 3
    return renderer.uiImage
}

