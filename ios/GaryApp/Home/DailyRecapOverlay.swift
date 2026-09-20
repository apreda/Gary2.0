import SwiftUI

/// Settled game-pick recap shown once per slate day.
struct DailyRecapOverlay: View {
    let record: (w: Int, l: Int, p: Int)
    let net: Double?
    let bestOdds: Double?
    let onDismiss: () -> Void

    private var pct: Double {
        let graded = record.w + record.l
        return graded == 0 ? 0 : Double(record.w) / Double(graded)
    }
    /// The emotion ladder — image + one line in Gary's voice, keyed to yesterday's
    /// win rate (80+ Fire / 70s Cooking / 50s-60s Beer / 40s IceCold / sub-40
    /// Doomsday). NO Santa-hat assets — GaryCigar/GaryCoin are retired; a settled
    /// night with no graded games falls back to the canonical mark, never a holiday image.
    private var mood: (image: String, line: String) {
        if record.w + record.l == 0 { return (GaryBrand.mark, "No games settled yet.") }
        if pct >= 0.80 { return ("GaryFire", "Gary ran hot last night.") }
        if pct >= 0.70 { return ("GaryCooking", "Gary's cooking.") }
        if pct > 0.50 { return ("GaryBeer", "Came out ahead on the night.") }
        if pct == 0.50 { return ("GaryBeer", "Split the games last night.") }
        if pct >= 0.40 { return ("GaryIceCold", "A cold one on the games.") }
        return ("GaryDoomsday", "Rough night. Gary remembers.")
    }
    private var recordText: String {
        record.p > 0 ? "\(record.w)–\(record.l)–\(record.p)" : "\(record.w)–\(record.l)"
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.62)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            VStack(spacing: 0) {
                Image(mood.image)
                    .resizable().scaledToFit()
                    .frame(height: 112)
                    .padding(.top, 26)

                Text("GARY'S PERFORMANCE")
                    .font(GaryFonts.mono(11, bold: true)).tracking(2.2)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.top, 18)

                Text(mood.line)
                    .font(GaryFonts.text(17, .semibold))
                    .foregroundStyle(.white.opacity(0.94))
                    .multilineTextAlignment(.center)
                    .padding(.top, 6)
                    .padding(.horizontal, 20)

                HStack(spacing: 0) {
                    recapCell(recordText, "GAME PICKS", .white.opacity(0.92))
                    // STORE-SAFE BRIDGE: record only — no cash cells.
                    if let net, !AppFlags.storeSafe {
                        recapDivider
                        recapCell(Formatters.flatStakeDollars(net), "NET · $100/PICK",
                                  net >= 0 ? GaryColors.win : GaryColors.loss)
                    }
                    if let bestOdds, bestOdds > 0, !AppFlags.storeSafe {
                        recapDivider
                        recapCell("+\(Int(bestOdds))", "BEST CASH", GaryColors.gold)
                    }
                }
                .padding(.vertical, 18)
                .padding(.horizontal, 8)

                Button(action: onDismiss) {
                    // Refined gold affordance instead of a solid-yellow fill (user call,
                    // Jun 17): a quiet gold-tinted capsule with a gold hairline + gold text,
                    // matching the app's restrained gold language.
                    Text("To today's board")
                        .font(GaryFonts.text(14, .semibold))
                        .foregroundStyle(GaryColors.gold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(Capsule().fill(GaryColors.gold.opacity(0.10)))
                        .overlay(Capsule().stroke(GaryColors.gold.opacity(0.5), lineWidth: 1.5))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 22)
                .padding(.bottom, 22)
            }
            .frame(width: 316)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(hex: "#151311"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.12), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.6), radius: 30, y: 14)
        }
    }

    private func recapCell(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(GaryFonts.mono(22, bold: true))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(0.8)
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(maxWidth: .infinity)
    }

    private var recapDivider: some View {
        Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1, height: 32)
    }
}

