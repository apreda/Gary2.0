// PickCardFronts.swift — Flippable Pick Card, Scoreboard Pick Card, sport watermarks.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

/// The regular pick-card finish, shared by published and upcoming cards.
struct PickCardBackground: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(LinearGradient(colors: [Color(hex: "#272522"), Color(hex: "#100F0D")],
                                 startPoint: .top, endPoint: .bottom))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(.white.opacity(0.19), lineWidth: 1)
            )
            .overlay(alignment: .top) {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(.white.opacity(0.24), lineWidth: 1)
                    .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
            }
            .shadow(color: .black.opacity(0.68), radius: 32, y: 17)
            .shadow(color: .black.opacity(0.45), radius: 5, y: 3)
    }
}

/// Identical eyebrow and brand placement for every game-card state.
struct PickCardHeader: View {
    var title = "GARY'S PICK"
    var tint: Color = GaryColors.gold
    var scale: CGFloat = 1
    var showsMark = true
    var premiumFinish = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(title)
                .font(GaryFonts.accent(12.5 * scale)).tracking(1.0)
                .foregroundStyle(tint)
                .padding(.top, 6)
            Spacer()
        }
        .padding(.bottom, 6 * scale)
        .overlay(alignment: .topTrailing) {
            if showsMark {
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 46 * scale, height: 46 * scale)
                    .shadow(color: .black.opacity(premiumFinish ? 0.35 : 0.5), radius: 2, y: 1)
                    .offset(y: -10)
                    .allowsHitTesting(false)
            }
        }
    }
}

// MARK: - Flippable Pick Card (front = CompactPickRow, back = Gary's case)
//
// The pick card is a "moveable object" — its front design stays exactly as
// CompactPickRow. Tapping does a true 3D flip (instead of the old popup): the
// card expands a bit squarer and rotates to reveal the rationale on the back.

struct PickCardHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

// MARK: - Scoreboard Pick Card ("the pick is the headline")
//
// Two team rows like a live scoreboard — the picked side is lit, with the
// call chip anchored to it; the other side is dimmed. Sans-serif throughout.
// Chosen by the user (June 3 2026) over the serif CompactPickRow for Best Bets.
// MARK: - Sport watermarks (card texture, Fixtured-style — in Gary's ink)







struct FlippablePickCard: View {
    let pick: GaryPick
    var eyebrowOverride: String? = nil
    var alwaysShowStartTime: Bool = false
    var gameResult: String? = nil
    var finalScore: String? = nil
    var showSportBadge: Bool = false
    var liveInSlot: Bool = true
    var interruptionLabel: String? = nil
    /// 21B-S poured-gold front for entitled Winners cards (back stays dark).
    var premiumFinish: Bool = false
    /// Winners slot for the wordless edge-rail cue (front face only).
    var winnersSlot: WinnersSlot? = nil

    @State private var flipped = false
    /// The heavy back face (Tale of Tape + Sportsbook lines) is built ONLY after
    /// the first flip — a rail of N cards otherwise pays ~2N heavy builds for backs
    /// most users never open. Front already drives the height, so no visual change.
    @State private var hasEverFlipped = false
    @State private var frontH: CGFloat = CompactPickRow.uniformHeight

    var body: some View {
        ZStack {
            // Front pinned to the uniform height so every pick card in a rail is
            // the same size (fixedHeight on CompactPickRow) — no per-card measuring,
            // which is what let 2-line heroes end up taller than 1-line ones.
            CompactPickRow(pick: pick, gameResult: gameResult, finalScore: finalScore, showSportBadge: showSportBadge, liveInSlot: liveInSlot, interruptionLabel: interruptionLabel, eyebrowOverride: eyebrowOverride, alwaysShowStartTime: alwaysShowStartTime, fixedHeight: CompactPickRow.uniformHeight, premiumFinish: premiumFinish, winnersSlot: winnersSlot)
                .opacity(flipped ? 0 : 1)

            if flipped || hasEverFlipped {
                PickCardBack(flipped: flipped, pick: pick, gameResult: gameResult)
                    .opacity(flipped ? 1 : 0)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            }
        }
        // The back NEVER wears a synthetic height (the expandedH/maxHeight pair
        // blanked whole pages inside the horizontal pick carousels — Aug 6):
        // flipped, the card is exactly its content's height; expanding the take
        // just renders more content and the page reflows around it.
        .frame(height: flipped ? nil : frontH)
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .animation(.spring(response: 0.6, dampingFraction: 0.82), value: flipped)
        .contentShape(Rectangle())
        .onTapGesture {
            hasEverFlipped = true; flipped.toggle()
        }
        .onGaryTour { verb, _ in
            if verb == "flip" { hasEverFlipped = true; flipped.toggle() }
        }
        .accessibilityAddTraits(.isButton)
    }
}

/// Sportsbook brand casing — one source for every odds table. Keys are
/// normalized (lowercased, no spaces/underscores); unknown books fall back
/// to simple capitalization, never raw lowercase keys.
enum SportsbookNames {
    static let byKey: [String: String] = [
        "draftkings": "DraftKings", "fanduel": "FanDuel", "betmgm": "BetMGM",
        "betrivers": "BetRivers", "caesars": "Caesars", "fanatics": "Fanatics",
        "espnbet": "ESPN BET", "bet365": "bet365", "pointsbet": "PointsBet",
        "pinnacle": "Pinnacle", "bovada": "Bovada", "polymarket": "Polymarket",
        "kalshi": "Kalshi", "hardrockbet": "Hard Rock Bet", "hardrock": "Hard Rock Bet",
        "wynnbet": "WynnBET", "unibet": "Unibet", "ballybet": "Bally Bet",
        "barstool": "Barstool", "williamhill": "Caesars", "mybookieag": "MyBookie",
        "lowvig": "LowVig", "betonlineag": "BetOnline", "bovadalv": "Bovada"
    ]
    static func display(_ raw: String?) -> String {
        guard let raw, !raw.isEmpty else { return "—" }
        let key = raw.lowercased()
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "_", with: "")
            .replacingOccurrences(of: ".", with: "")
        if let n = byKey[key] { return n }
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }
}

/// The back of the pick card — Gary's reasoning. Uses the pick card's own
/// rounded/mono styling (NOT the Props serif) and matches the front's chrome.
