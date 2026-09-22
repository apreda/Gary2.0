import SwiftUI

// THE PARLAY OF THE DAY (founder, Sep 22 2026): Gary's fun ticket, three or
// four of today's published plays riding together, priced like a book would
// price it. Lives on the Darts page as a slip tab on the edge of the screen
// and a banner up top; never on the Billfold, never on the record.

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

/// The tab on the edge of the screen: pull it and the slip slides out.
struct ParlayTab: View {
    let legs: Int
    let onOpen: () -> Void
    /// Slim enough to live in the page's margin: nothing it rides over is
    /// covered, the counts and prices end inside it.
    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 7) {
                Text("\(legs)").font(GaryFonts.display(16)).monospacedDigit()
                Rectangle().fill(GaryColors.gold.opacity(0.4)).frame(width: 10, height: 1)
                Text("SLIP").font(GaryFonts.display(11.5)).tracking(1.6).fixedSize()
                    .rotationEffect(.degrees(-90))
                    .frame(width: 13, height: 28)
            }
            .foregroundStyle(GaryColors.gold)
            .frame(width: 24)
            .padding(.vertical, 11)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 10, bottomLeadingRadius: 10, bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous)
                    .fill(LabInk.plate)
                    .overlay(UnevenRoundedRectangle(topLeadingRadius: 10, bottomLeadingRadius: 10, bottomTrailingRadius: 0, topTrailingRadius: 0, style: .continuous)
                        .strokeBorder(GaryColors.gold.opacity(0.5), lineWidth: 1))
            )
            .shadow(color: .black.opacity(0.5), radius: 8, x: -2, y: 3)
            .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Parlay of the day, \(legs) legs")
    }
}

/// The slip itself: a ticket, legs numbered, the price and the payout at the
/// foot, each leg stamped with where it stands.
struct ParlaySlipSheet: View {
    let slip: ParlaySlipModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                ticket
                    .padding(.horizontal, 18).padding(.top, 22)
                Color.clear.frame(height: 40)
            }
        }
        .background(GaryColors.ink.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var ticket: some View {
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
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LabInk.plate))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(GaryColors.gold.opacity(0.55), lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 16, y: 8)
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
