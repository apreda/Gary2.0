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

/// THE PARLAY EMBLEM (founder, Sep 23 2026: "a solid 3D emblem where it's
/// clear that that's a clickable button"; then "tone it down... good and
/// clean, a little more unique"): a dial that sits by YESTERDAY GARY HIT under
/// the page's header. A thin gold bezel ticked like the dartboard's rim with a
/// gold index at the top, a dark face carrying PARLAY, the price and the legs.
/// Tap it and the ticket drops down from it.
struct ParlayEmblem: View {
    let slip: ParlaySlipModel
    let open: Bool
    let action: () -> Void

    private static let size: CGFloat = 66

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().fill(LabInk.plate)
                // The bezel: 24 ticks, the quarters longer and brighter.
                ForEach(0..<24, id: \.self) { k in
                    let quarter = k % 6 == 0
                    Rectangle().fill(GaryColors.gold.opacity(quarter ? 0.85 : 0.32))
                        .frame(width: quarter ? 1.4 : 1, height: quarter ? 5 : 3)
                        .offset(y: -Self.size / 2 + (quarter ? 5.5 : 4.5))
                        .rotationEffect(.degrees(Double(k) * 15))
                }
                // The index at the top, pointing in.
                IndexMark().fill(GaryColors.gold)
                    .frame(width: 7, height: 5)
                    .offset(y: -Self.size / 2 + 2.5)
                Circle().strokeBorder(GaryColors.gold.opacity(open ? 1 : 0.7), lineWidth: 1.2)
                // The face, a shade lighter at the top.
                Circle().inset(by: 10)
                    .fill(LinearGradient(colors: [Color(hex: "#221D17"), GaryColors.ink], startPoint: .top, endPoint: .bottom))
                Circle().inset(by: 10).strokeBorder(GaryColors.gold.opacity(0.18), lineWidth: 0.8)
                VStack(spacing: 0) {
                    Text("PARLAY").font(GaryFonts.kicker(7, .heavy)).tracking(1.4).foregroundStyle(GaryColors.gold)
                    Text(LabFormat.price(slip.american_odds)).font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite)
                        .monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
                    Text("\(slip.legs.count) LEGS").font(GaryFonts.kicker(6.5, .bold)).tracking(1.1).foregroundStyle(LabInk.dim)
                }
                .padding(.horizontal, 15)
            }
            .frame(width: Self.size, height: Self.size)
            .contentShape(Circle())
        }
        .buttonStyle(EmblemPress())
        .accessibilityLabel("Parlay of the day, \(slip.legs.count) legs, \(LabFormat.price(slip.american_odds))")
        .accessibilityHint(open ? "Closes the ticket" : "Shows the ticket")
    }
}

private struct IndexMark: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.midX, y: r.maxY))
        p.closeSubpath()
        return p
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
