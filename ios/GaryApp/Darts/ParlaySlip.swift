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
    let commence_time: String?
    let result: String?
    let live: LiveScore?
    /// The player's club on a player leg; nil on a game leg, whose words name it.
    let team: String?
    var id: String { key }
}

struct ParlaySlipModel: Decodable {
    let date: String
    let american_odds: Int
    let payout_10: Double
    let reason: String?
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
    /// Each leg's club, once per club, in leg order. A player leg carries its
    /// club; a game leg names it in its words ("Cubs game", "Twins ML"), read
    /// against the matchup; a leg that names neither side (a total) is the
    /// home club's game.
    var clubs: [ParlayClub] {
        var out: [ParlayClub] = []
        for leg in legs {
            let league = leg.league ?? "MLB"
            let sides = (leg.matchup ?? "").components(separatedBy: " @ ")
                .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            let named = sides.first { side in Self.names(for: side).contains { leg.text.localizedCaseInsensitiveContains($0) } }
            guard let name = leg.team ?? named ?? sides.last else { continue }
            let abbr = teamAbbrevFromName(name, league: league)
            if let i = out.firstIndex(where: { $0.abbr == abbr }) { out[i].legs += 1; continue }
            out.append(ParlayClub(abbr: abbr, color: TeamColors.color(for: name, league: league) ?? GaryColors.gold, legs: 1))
        }
        return out
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
/// stayed up in the morning): the same card with no clubs and no price,
/// saying the parlay is on its way. Nothing to tap.
struct ParlayEmblemSoon: View {
    var body: some View {
        ParlayEmblemCard {
            // The band stays, empty where the clubs will go.
            Color.clear
        } figure: {
            Text("Coming soon")
                .font(GaryFonts.ui(13, .semibold)).foregroundStyle(GaryColors.warmWhite.opacity(0.72))
                .lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 6)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Parlay of the day, coming soon")
    }
}

/// The surface under the club badges, so each overlap cuts clean.
private let parlayBandInk = Color(hex: "#0F0D0B")

/// The parlay card both states share: the band on top, a gold hairline, the
/// figure over PARLAY.
struct ParlayEmblemCard<Band: View, Figure: View>: View {
    var lit = false
    @ViewBuilder let band: () -> Band
    @ViewBuilder let figure: () -> Figure

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        VStack(spacing: 0) {
            band()
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(LinearGradient(colors: [Color(hex: "#0E0C0A"), Color(hex: "#12100D")], startPoint: .top, endPoint: .bottom))
            Rectangle().fill(GaryColors.gold.opacity(0.55)).frame(height: 1)
            VStack(spacing: 3) {
                figure()
                Text("PARLAY")
                    .font(GaryFonts.mono(8, bold: true)).tracking(1.5)
                    .foregroundStyle(GaryColors.gold).fixedSize()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: 88, height: 88)
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
private struct ParlayBadges: View {
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

/// Where the emblem is on screen, so its ticket can drop from it.
struct ParlayEmblemAnchor: PreferenceKey {
    static var defaultValue: Anchor<CGRect>? = nil
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) { value = value ?? nextValue() }
}

/// The ticket dropped from the emblem, over the page. Tap the page or the
/// emblem to put it away. As tall as the ticket, scrolling only if it has to.
struct ParlayDropCard: View {
    let slip: ParlaySlipModel
    let below: CGRect
    let room: CGSize
    let onClose: () -> Void
    @State private var shown = false

    var body: some View {
        let top = max(8, below.maxY + 10)
        ZStack(alignment: .topLeading) {
            Color.black.opacity(0.35)
                .contentShape(Rectangle())
                .onTapGesture(perform: onClose)
                .accessibilityHidden(true)
            CappedHeight(limit: max(200, room.height - top - 112)) {
                ViewThatFits(in: .vertical) {
                    ParlayTicket(slip: slip)
                    ScrollView(showsIndicators: false) { ParlayTicket(slip: slip) }
                }
            }
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LabInk.plate))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(GaryColors.gold.opacity(0.55), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.55), radius: 18, y: 10)
            .frame(width: room.width - GaryLayout.gutter * 2)
            .scaleEffect(shown ? 1 : 0.9, anchor: .topTrailing)
            .opacity(shown ? 1 : 0)
            .offset(x: GaryLayout.gutter, y: top)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape, onClose)
        }
        .onAppear { withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) { shown = true } }
    }
}

/// As tall as its content, never taller than `limit`.
struct CappedHeight: Layout {
    let limit: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let v = subviews.first else { return .zero }
        let s = v.sizeThatFits(ProposedViewSize(width: proposal.width, height: limit))
        return CGSize(width: proposal.width ?? s.width, height: min(s.height, limit))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }
}

/// The slip itself: a ticket, legs numbered, the price and the payout at the
/// foot, each leg stamped with where it stands.
struct ParlayTicket: View {
    let slip: ParlaySlipModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("PARLAY OF THE DAY").font(GaryFonts.display(20)).tracking(1.6).foregroundStyle(GaryColors.gold)
                Spacer()
                Text(LabFormat.shortDateWords(slip.date).uppercased()).font(GaryFonts.display(12)).tracking(1).foregroundStyle(LabInk.dim)
            }
            .padding(.horizontal, 18).padding(.top, 20).padding(.bottom, 14)
            perforation
            ForEach(slip.legs) { leg in
                legRow(leg)
                if leg.n < slip.legs.count { LabHairline().padding(.horizontal, 18) }
            }
            perforation.padding(.top, 6)
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(slip.legs.count) LEGS").font(GaryFonts.display(13)).tracking(1.2).foregroundStyle(LabInk.dim)
                    Text("$10 pays").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text(LabFormat.price(slip.american_odds)).font(GaryFonts.display(30)).foregroundStyle(GaryColors.warmWhite)
                    Text(LabFormat.dollars(slip.payout_10)).font(GaryFonts.display(22)).foregroundStyle(GaryColors.gold)
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 16)
            if let reason = slip.reason, !reason.isEmpty {
                Text(reason).font(GaryFonts.text(13.5)).foregroundStyle(LabInk.reading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 18).padding(.bottom, 20)
            }
        }
    }

    private var perforation: some View {
        DashedLine().stroke(GaryColors.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
            .frame(height: 1).padding(.horizontal, 12)
    }

    private func legRow(_ leg: ParlayLeg) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(leg.n)").font(GaryFonts.display(16)).foregroundStyle(GaryColors.gold).frame(width: 16, alignment: .leading).padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                Text(leg.text.uppercased()).font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if let league = leg.league { Text(league).font(GaryFonts.display(11)).tracking(1.2).foregroundStyle(GaryColors.gold) }
                    Text(leg.matchup ?? "").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                Text(LabFormat.price(leg.odds)).font(GaryFonts.display(18)).foregroundStyle(GaryColors.silver)
                stateWord(leg)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
    }

    @ViewBuilder private func stateWord(_ leg: ParlayLeg) -> some View {
        let state = LabTicketState(result: leg.result)
        switch state {
        case .won: LabStateWord(text: "Win", color: GaryColors.win, size: 12)
        case .lost: LabStateWord(text: "Loss", color: GaryColors.loss, size: 12)
        case .push: LabStateWord(text: "Push", color: GaryColors.silver, size: 12)
        case .open:
            if leg.live?.isLive == true {
                LabStateWord(text: leg.live?.detail ?? "Live", color: GaryColors.gold, pulse: true, size: 12)
            } else if let c = leg.commence_time {
                Text(LabFormat.timeET(c)).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
            }
        }
    }
}
