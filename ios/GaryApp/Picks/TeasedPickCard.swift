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
    /// Optional copy for special states such as a day with no games.
    var eyebrow: String? = nil
    var headline: (String, String)? = nil
    /// Replaces the line under the headline; "" shows none.
    var caption: String? = nil

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
        VStack(alignment: .leading, spacing: 0) {
            PickCardHeader(title: eyebrow ?? "GARY'S PICK")

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: -18) {
                Text(headline?.0 ?? (providerStatus != nil ? "GAME" : (gameStarted ? "NO PICK" : "PICKS")))
                    .font(GaryFonts.display(52))
                    .foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.45)
                Text(headline?.1 ?? providerStatus ?? (gameStarted ? "THIS GAME" : "INCOMING"))
                    .font(GaryFonts.display(52))
                    .foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.45)
            }
            .padding(.top, 12 - 0.22 * 52)
            .padding(.trailing, 52)

            Spacer(minLength: 0)

            Text(caption ?? (providerStatus != nil
                 ? "Gary's pick stays off the live board."
                 : gameStarted
                 ? "No pick posted before \(eventName)."
                 : "Pick posts before \(eventName)."))
                .font(GaryFonts.text(13.5, .medium))
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1).minimumScaleFactor(0.85)
                .padding(.top, 12 - 0.25 * 52)

            Rectangle()
                .fill(.white.opacity(0.12))
                .frame(height: 1)
                .padding(.vertical, 10)

            HStack(alignment: .center, spacing: 10) {
                Text([league?.uppercased(), providerStatus ?? time].compactMap { $0 }.joined(separator: " · ")
                     .isEmpty ? "TONIGHT" : [league?.uppercased(), providerStatus ?? time].compactMap { $0 }.joined(separator: " · "))
                    .font(GaryFonts.mono(11, bold: true)).tracking(0.5)
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if let onSeeYesterday {
                    Button(action: onSeeYesterday) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(GaryColors.heroAccent.opacity(0.7))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, -14)
                    .padding(.trailing, -16)
                    .accessibilityLabel("See yesterday's results")
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .frame(height: CompactPickRow.uniformHeight)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .background(PickCardBackground())
    }
}
