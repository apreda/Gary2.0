import SwiftUI

/// The "pick coming" card for the free Picks page (Jul 3 2026 — no blur, per
/// founder: keep the standard card design, just say the pick isn't here YET).
/// It is a real pick card in every way — eyebrow, Skyscraper hero, meta,
/// footer — whose headline happens to be INCOMING.
struct TeasedPickCard: View {
    /// Sport label for the meta line, when the caller knows the league.
    var league: String? = nil
    /// Start time copy for the footer's left corner ("7:05 PM ET"), if known.
    var time: String? = nil
    /// Kickoff/first pitch — once it passes, "incoming" would be a lie (the
    /// window closed), so the card switches to the honest no-pick state.
    var commence: Date? = nil
    /// Exact provider interruption for this game. When present, the old start
    /// time cannot turn the placeholder into the false NO PICK state.
    var interruptionLabel: String? = nil
    /// Optional footer-right action (the game pages link back to yesterday).
    var onSeeYesterday: (() -> Void)? = nil

    private var providerStatus: String? {
        guard let value = interruptionLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value.uppercased()
    }
    private var gameStarted: Bool {
        guard providerStatus == nil else { return false }
        return commence.map { $0 <= Date() } ?? false
    }
    private var eventName: String {
        switch league?.uppercased() {
        case "NFL", "NCAAF": return "kickoff"
        case "NBA", "WC": return "tipoff"
        default: return "first pitch"
        }
    }

    var body: some View {
        ZStack {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 10) {
                    Text("GARY'S PICK")
                        .font(GaryFonts.accent(12.5)).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.top, 6)
                    Spacer()
                }
                .padding(.bottom, 6)

                VStack(alignment: .leading, spacing: -18) {
                    Text(providerStatus != nil ? "GAME" : (gameStarted ? "NO PICK" : "PICKS"))
                        .font(GaryFonts.display(58))
                        .foregroundStyle(.white)
                    Text(providerStatus ?? (gameStarted ? "THIS GAME" : "INCOMING"))
                        .font(GaryFonts.display(58))
                        .foregroundStyle(GaryColors.lightGold)
                        .lineLimit(1).minimumScaleFactor(0.5)
                }
                .padding(.top, -1)
                .padding(.trailing, 52)

                Text(providerStatus != nil
                     ? "The provider lists this game as \(providerStatus!.lowercased()). Gary's pick stays off the live board."
                     : gameStarted
                     ? "Gary's pick didn't post for this one. The rest of the board is live."
                     : "Gary posts his pick ~90 minutes before \(eventName)")
                    .font(GaryFonts.text(13.5, .medium))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, -3)

                Rectangle()
                    .fill(.white.opacity(0.12))
                    .frame(height: 1)
                    .padding(.vertical, 12)

                VStack(alignment: .leading, spacing: 10) {
                    Text([league?.uppercased(), providerStatus ?? time].compactMap { $0 }.joined(separator: " · ")
                         .isEmpty ? "TONIGHT" : [league?.uppercased(), providerStatus ?? time].compactMap { $0 }.joined(separator: " · "))
                        .font(GaryFonts.mono(11, bold: true)).tracking(0.5)
                        .foregroundStyle(GaryColors.gold)
                        .fixedSize(horizontal: false, vertical: true)
                    if let onSeeYesterday {
                        Button(action: onSeeYesterday) {
                            Text("YESTERDAY'S RESULTS ›")
                                .font(GaryFonts.mono(10.5, bold: true)).tracking(0.8)
                                .foregroundStyle(GaryColors.gold)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(18)

            Image(GaryBrand.mark)
                .resizable().scaledToFit()
                .frame(width: 44, height: 44)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 14).padding(.trailing, 16)
                .allowsHitTesting(false)
        }
        .frame(width: UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12), height: CompactPickRow.uniformHeight)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "#121110"))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.10), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.5), radius: 18, y: 8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
