import SwiftUI

// THE PARLAY OF THE DAY (founder, Sep 22 2026): Gary's fun ticket, three or
// four of today's published plays riding together, priced like a book would
// price it. Lives on the Darts page as a banner up top and a PARLAY tab on the
// right edge that slides the ticket over the page; never on the Billfold,
// never on the record.

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

/// The banner on the page: the price and what a ten pays, one tap opens the slip.
struct ParlayBanner: View {
    let slip: ParlaySlipModel
    let onOpen: () -> Void
    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PARLAY OF THE DAY").font(GaryFonts.display(13)).tracking(1.6).foregroundStyle(GaryColors.gold)
                    Text("\(slip.legs.count) LEGS").font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(LabFormat.price(slip.american_odds)).font(GaryFonts.display(26)).foregroundStyle(GaryColors.warmWhite)
                    Text("$10 pays \(LabFormat.dollars(slip.payout_10))").font(GaryFonts.ui(12, .medium)).foregroundStyle(GaryColors.gold)
                }
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(LabInk.dimmer)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            .frame(maxWidth: .infinity)
            .labPlate(radius: 14, edge: GaryColors.gold.opacity(0.45))
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// THE SLIP ON THE EDGE (founder, Sep 23 2026: "a slide-over, gadget style"):
/// a tab on the right edge that says what it is. Tap it or pull it and the
/// ticket slides over the page from the right; tap the tab, tap the page or
/// slide it back and it tucks away again. Never a full-screen sheet.
struct ParlayDrawer: View {
    let slip: ParlaySlipModel
    @Binding var open: Bool
    @State private var drag: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { g in
            let width = min(g.size.width - 48, 360)
            let top = max(56, g.size.height * 0.1)
            let tabAt = max(0, g.size.height * 0.3 - top)
            let shift = min(max((open ? 0 : width) + drag, 0), width)
            let reveal = 1 - shift / max(width, 1)
            ZStack(alignment: .topTrailing) {
                Color.black.opacity(0.32 * reveal)
                    .ignoresSafeArea()
                    .allowsHitTesting(open)
                    .onTapGesture { set(false) }
                    .accessibilityHidden(true)
                HStack(alignment: .top, spacing: 0) {
                    tab.padding(.top, tabAt)
                    panel(maxHeight: g.size.height - top - 112).frame(width: width)
                }
                .padding(.top, top)
                .offset(x: shift)
                .simultaneousGesture(slide(width))
            }
        }
    }

    private var animation: Animation {
        reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.86)
    }

    private func set(_ value: Bool) {
        withAnimation(animation) { open = value; drag = 0 }
    }

    /// A sideways pull opens or closes it; a vertical scroll inside the slip is left alone.
    private func slide(_ width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { v in
                guard abs(v.translation.width) > abs(v.translation.height) else { return }
                drag = v.translation.width
            }
            .onEnded { v in
                let sideways = abs(v.translation.width) > abs(v.translation.height)
                let end = (open ? 0 : width) + (sideways ? v.predictedEndTranslation.width : 0)
                set(end < width / 2)
            }
    }

    /// The pull tab: PARLAY and the price, read up the edge.
    private var tab: some View {
        Button { set(!open) } label: {
            VStack(spacing: 8) {
                Image(systemName: open ? "chevron.right" : "chevron.left").font(.system(size: 11, weight: .bold))
                Sideways { Text("PARLAY").font(GaryFonts.display(13)).tracking(1.8).fixedSize().rotationEffect(.degrees(-90)) }
                Rectangle().fill(GaryColors.gold.opacity(0.4)).frame(width: 12, height: 1)
                Sideways {
                    Text(LabFormat.price(slip.american_odds)).font(GaryFonts.display(13)).tracking(0.8)
                        .foregroundStyle(GaryColors.warmWhite).fixedSize().rotationEffect(.degrees(-90))
                }
            }
            .foregroundStyle(GaryColors.gold)
            .frame(width: 26)
            .padding(.vertical, 12)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 10, bottomLeadingRadius: 10, bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous)
                    .fill(LabInk.plate)
                    .overlay(UnevenRoundedRectangle(topLeadingRadius: 10, bottomLeadingRadius: 10, bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous)
                        .strokeBorder(GaryColors.gold.opacity(0.55), lineWidth: 1))
            )
            .shadow(color: .black.opacity(0.5), radius: 8, x: -2, y: 3)
            .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(open ? "Close the parlay of the day" : "Parlay of the day, \(slip.legs.count) legs, \(LabFormat.price(slip.american_odds))")
    }

    private func panel(maxHeight: CGFloat) -> some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous)
        return CappedHeight(limit: max(200, maxHeight)) {
            ViewThatFits(in: .vertical) {
                ParlayTicket(slip: slip)
                ScrollView(showsIndicators: false) { ParlayTicket(slip: slip) }
            }
        }
        .background(shape.fill(LabInk.plate))
        .overlay(shape.strokeBorder(GaryColors.gold.opacity(0.55), lineWidth: 1))
        .clipShape(shape)
        .shadow(color: .black.opacity(0.55), radius: 18, x: -6, y: 8)
        .accessibilityHidden(!open)
        .accessibilityAction(.escape) { set(false) }
    }
}

/// Text turned on its side takes the room of its turned shape.
struct Sideways: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let s = subviews.first?.sizeThatFits(.unspecified) ?? .zero
        return CGSize(width: s.height, height: s.width)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let v = subviews.first else { return }
        v.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center, proposal: ProposedViewSize(v.sizeThatFits(.unspecified)))
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
