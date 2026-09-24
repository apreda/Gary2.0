// Prop cards, shared social links, odds table and card slate.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Flippable Prop Card (front = CompactPropRow, back = Gary's read)
//
// Mirrors FlippablePickCard exactly so prop cards flip like the game-pick cards.

/// Strip labeled section markers (HYPOTHESIS:, THE EDGE:, CONVERGENCE (x):, RISK:…)
/// out of a prop analysis blob into clean readable paragraphs.
func cleanPropAnalysis(_ text: String) -> String {
    // Raw markdown bold ("**THE PICK:**") reads as a glitch on-card — drop it.
    var cleaned = text.replacingOccurrences(of: "**", with: "")
    // The brain sometimes opens with its own "Gary's Take" heading — the card
    // already says GARY'S TAKE in the kicker, so on-card it read twice
    // (founder caught it Aug 19). Same strip splitTake does for game cards.
    let lowered = cleaned.lowercased()
    if lowered.hasPrefix("gary's take") || lowered.hasPrefix("garys take") {
        cleaned = String(cleaned.dropFirst(cleaned.lowercased().hasPrefix("gary's take") ? "gary's take".count : "garys take".count))
        if cleaned.hasPrefix(":") { cleaned.removeFirst() }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    let labels = ["HYPOTHESIS:", "EVIDENCE:", "CONVERGENCE", "IF WRONG:", "THE EDGE:", "THE VERDICT:", "RISK:"]
    for label in labels {
        if let r = cleaned.range(of: label, options: .caseInsensitive) {
            let after = cleaned[r.upperBound...]
            if after.hasPrefix(" (") || after.hasPrefix("(") {
                if let c = after.range(of: "):") { cleaned.removeSubrange(r.lowerBound...c.upperBound) }
                else if let c = after.range(of: ")") { cleaned.removeSubrange(r.lowerBound...c.upperBound) }
                else { cleaned.removeSubrange(r) }
            } else {
                cleaned.removeSubrange(r)
            }
        }
    }
    return cleaned
        .components(separatedBy: "\n")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: "\n\n")
}

struct FlippablePropCard: View {
    let prop: PropPick
    var gameResult: String? = nil
    /// Stored "away-home" final for the settled footer — same plumbing as the
    /// game card, so historical boards don't depend on the live cache.
    var finalScore: String? = nil
    var showSportBadge: Bool = false
    var liveInSlot: Bool = true
    var interruptionLabel: String? = nil
    /// Passed straight to the front card — Winners shows the start time on settled
    /// cards (it sorts by time), mirroring the game card.
    var alwaysShowStartTime: Bool = false
    /// A caller's own eyebrow (the Picks landing's TOP FREE PICK OF THE DAY).
    var eyebrowOverride: String? = nil

    @State private var flipped = false
    /// Back (The Numbers / The Read) built only after the first flip — see
    /// FlippablePickCard for the rationale (halves a prop rail's build cost).
    @State private var hasEverFlipped = false
    @State private var frontH: CGFloat = CompactPickRow.uniformHeight

    var body: some View {
        ZStack {
            // Front pinned to the shared uniform height so prop cards match the
            // game cards exactly (fixedHeight on CompactPropRow) — no per-card
            // measuring, which is what let content-length drive different sizes.
            CompactPropRow(prop: prop, gameResult: gameResult, finalScore: finalScore, showSportBadge: showSportBadge, liveInSlot: liveInSlot, interruptionLabel: interruptionLabel, alwaysShowStartTime: alwaysShowStartTime, fixedHeight: CompactPickRow.uniformHeight, eyebrowOverride: eyebrowOverride)
                .opacity(flipped ? 0 : 1)

            // The exact same back-face shell as game picks: same take preview,
            // expansion control, actions, book row, flip cue and natural height.
            if flipped || hasEverFlipped {
                PropSlipBack(flipped: flipped, prop: prop, gameResult: gameResult)
                    .opacity(flipped ? 1 : 0)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            }
        }
        .frame(height: flipped ? nil : frontH)
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .animation(.spring(response: 0.6, dampingFraction: 0.82), value: flipped)
        .contentShape(Rectangle())
        .onTapGesture { hasEverFlipped = true; flipped.toggle() }
        .onGaryTour { verb, _ in
            if verb == "flip" { hasEverFlipped = true; flipped.toggle() }
        }
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Social Links Bar

struct SocialLinksBar: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                // X / Twitter
                SocialButton(
                    label: "Follow on X",
                    systemIcon: "bird.fill",
                    url: "twitter://user?screen_name=BetwithGary",
                    fallbackUrl: "https://x.com/BetwithGary"
                )

                // Discord
                SocialButton(
                    label: "Join Discord",
                    systemIcon: "bubble.left.and.bubble.right.fill",
                    url: "https://discord.gg/betwithgary",
                    fallbackUrl: nil
                )
            }
        }
    }
}

struct SocialButton: View {
    let label: String
    let systemIcon: String
    let url: String
    var fallbackUrl: String?

    var body: some View {
        Button {
            if let deepLink = URL(string: url), UIApplication.shared.canOpenURL(deepLink) {
                UIApplication.shared.open(deepLink)
            } else if let fallback = fallbackUrl, let fallbackURL = URL(string: fallback) {
                UIApplication.shared.open(fallbackURL)
            } else if let primary = URL(string: url) {
                UIApplication.shared.open(primary)
            }
        } label: {
            // The page's last whisper (Aug 3): borderless text links — the
            // boxed buttons outweighed THE RECORD above them.
            HStack(spacing: 7) {
                Image(systemName: systemIcon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(GaryColors.gold.opacity(0.7))
                Text(label.uppercased())
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(0.9)
                    .foregroundStyle(.white.opacity(0.62))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Angular Card Shape (Trading-Card silhouette with corner cut)
//
// Distinctive PropCardSlate silhouette — standard rounded rect with the
// bottom-right corner clipped at 45°. Gives each card a unique outline
// without sacrificing space or readability.

// MARK: - Prop Card Slate (Sharp, Portrait, Trading-Card Energy)
//
// Narrower portrait card optimized to fit two side-by-side per game in the
// swipe-paged featured view:
//   - Square initials frame (architectural, not friendly)
//   - Massive line value as the hero element
//   - Pip-based confidence (●●●○)
//   - Asymmetric bet pill that breaks the rectangle on top
//   - Diagonal corner clip on bottom-right
//   - Single sharp accent line in sport color at the top

