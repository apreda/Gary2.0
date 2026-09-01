// PickCardFronts.swift — Flippable Pick Card, Scoreboard Pick Card, sport watermarks.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

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

/// Collapsible "Sportsbook Lines" dropdown for the back of a game-pick card —
/// the multi-book spread/ML comparison from the pick's sportsbook_odds.
struct SportsbookLinesDropdown: View {
    let odds: [SportsbookOdds]
    // Open on arrival (founder, Aug 6: "the sportsbook lines should already be
    // dropped down") — the LINES tab exists to show the lines, so opening it
    // and then having to open it again was a door in front of a door. The
    // disclosure still collapses on tap.
    @State private var open = true
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.easeInOut(duration: 0.2)) { open.toggle() } } label: {
                HStack {
                    Text("SPORTSBOOK LINES")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1.4)
                        .foregroundStyle(GaryColors.gold)
                    Text("(\(odds.count))")
                        .font(GaryFonts.mono(9.5, bold: false))
                        .foregroundStyle(.white.opacity(0.62))
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(GaryColors.gold).rotationEffect(.degrees(open ? 90 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if open {
                VStack(spacing: 0) {
                    // Column captions — the numbers read as data, not décor.
                    // Spread/ML are quoted from the PICKED side's perspective.
                    HStack(spacing: 8) {
                        Text("BOOK").frame(maxWidth: .infinity, alignment: .leading)
                        Text("SPREAD").frame(width: 96, alignment: .trailing)
                        Text("ML").frame(width: 56, alignment: .trailing)
                    }
                    .font(GaryFonts.mono(8)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.62))
                    .padding(.vertical, 6)
                    ForEach(odds) { o in
                        HStack(spacing: 8) {
                            Text(SportsbookNames.display(o.book))
                                .font(.system(size: 12.5, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.9))
                                .lineLimit(1).minimumScaleFactor(0.8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Group {
                                if let s = o.spread {
                                    let juice = (o.spread_odds?.isEmpty == false) ? " \(o.spread_odds!)" : ""
                                    Text(String(format: "%+.1f", s) + juice)
                                        .foregroundStyle(.white.opacity(0.75))
                                } else {
                                    Text("—").foregroundStyle(.white.opacity(0.62))
                                }
                            }
                            .font(GaryFonts.mono(11.5))
                            .frame(width: 96, alignment: .trailing)
                            Group {
                                if let ml = o.ml, !ml.isEmpty, ml != "-" {
                                    Text(ml).foregroundStyle(GaryColors.gold.opacity(0.9))
                                } else {
                                    Text("—").foregroundStyle(.white.opacity(0.62))
                                }
                            }
                            .font(GaryFonts.mono(11.5, bold: true))
                            .frame(width: 56, alignment: .trailing)
                        }
                        .padding(.vertical, 6)
                        if o.id != odds.last?.id { Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5) }
                    }
                }
                .padding(.top, 2)
            }
        }
    }
}

/// The back of the pick card — Gary's reasoning. Uses the pick card's own
/// rounded/mono styling (NOT the Props serif) and matches the front's chrome.
