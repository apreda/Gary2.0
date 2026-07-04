import SwiftUI

// MARK: - Gary Design System (single source of truth)
//
// Extracted from Views.swift (Jul 2 2026) so the brand constants every surface
// depends on live in ONE findable file: colors, typefaces, logo mark, display
// pricing, and team colors. Behavior-identical move — no values changed.


enum GaryColors {
    // Core brand colors with P3 gamut
    static let gold = Color(hex: "#C9A227")
    static let lightGold = Color(hex: "#E8D48B")
    static let warmGold = Color(hex: "#F4E4BA")
    static let cream = Color(hex: "#FAF8F5")
    
    // Deep backgrounds
    static let darkBg = Color(hex: "#08080A")
    static let cardBg = Color(hex: "#121214")
    /// Near-black text/ink that sits on the gold CTA / active pills / chips.
    static let ink = Color(hex: "#0C0B0B")
    static let elevatedBg = Color(hex: "#1E1A1A")
    
    // Glass tints
    static let glassTint = Color.white.opacity(0.08)
    static let glassHighlight = Color.white.opacity(0.15)
    static let glassBorder = Color.white.opacity(0.12)
    
    // Accent gradients
    static let goldGradient = LinearGradient(
        colors: [Color(hex: "#E8D48B"), Color(hex: "#C9A227"), Color(hex: "#8B6914")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    static let premiumGradient = LinearGradient(
        colors: [Color(hex: "#C9A227").opacity(0.8), Color(hex: "#8B6914").opacity(0.4)],
        startPoint: .top,
        endPoint: .bottom
    )
    
    // Silver — the prop pick card is the silver twin of the gold game card.
    // Mirrors gold's role exactly: chip text/border, lean rail, secondary labels.
    static let silver = Color(hex: "#CBC7C1")
    static let silverLight = Color(hex: "#DCD7D0")
    static let silverDim = Color(hex: "#B4AEA6")

    // MARK: - Semantic roles (shared neutral text + selection colors — retune in one place)
    //
    // Convenience roles for body/label/selection states. Green/red carry
    // win/loss + hot/cold meaning. Gold is the signature accent — use it
    // wherever it strengthens hierarchy (it is not restricted to one element).

    /// The signature gold accent — for emphasis (pick chips, prices, CTAs, Gary's voice).
    static let heroAccent = gold
    /// Section sub-heads (replaces the gold mono eyebrows).
    static let sectionHead = GaryColors.gold.opacity(0.92)   // sections speak gold, like the web
    /// Section descriptions and quiet supporting labels.
    /// (Lifted 0.45→0.62 Jul 3 — founder's standing rule: secondary text on the
    /// near-black bg must sit ≥~0.6 white; 0.4-grey-on-black is a recurring gripe.)
    static let sectionSub = Color.white.opacity(0.62)
    /// Metadata: times, game tags, fine print. (Lifted 0.35→0.55, same rule —
    /// kept a step below sectionSub so the hierarchy survives.)
    static let meta = Color.white.opacity(0.55)
    /// Selected state for toggles/tabs/chips — a bright neutral fill.
    static let selectedText = Color.white.opacity(0.95)
    static let selectedFill = Color.white.opacity(0.12)

    /// Graded-result marks (HIT/MISS, W/L, ✓/✗) — the saturated pair, distinct
    /// from HubPalette's muted editorial tones. One token, no more inline hexes.
    static let win = Color(hex: "#3FB950")
    static let loss = Color(hex: "#E5484D")
    /// Subtle red-ish gold for LOST result tags — signals a loss without flooding
    /// the cards with bright red (user call, Jun 16). Gold-family, warmed toward red.
    static let lostTint = Color(hex: "#C77A3A")
    /// Opaque warm field fill for text inputs (search bars).
    static let fieldBg = Color(hex: "#131110")
    /// Warm-white overlay base for panel/card chrome (QuantPanel's tint) —
    /// pure Color.white over the warm black page reads as a cool blue-grey cast.
    static let warmWhite = Color(hex: "#F6F1E7")

    // NFL Green (same as prop picks)
    static let nflAccent = Color(hex: "#22C55E")

    // MLB label/eyebrow accent — a SOLID light grass green (user call, Jun 26):
    // the old green→dirt-brown→white field gradient was retired for a clean,
    // readable single field-green that reads well on small text.
    static let mlbGrass = Color(hex: "#63D17E")
    static let mlbFieldText = Color(hex: "#63D17E")
}

// MARK: - Pricing (single source of truth)
//
// Every plan price + trial length the paywall shows lives HERE. The golden
// rule: the app must never display a number Stripe won't actually charge.
// So to change a price you do TWO things, together:
//   1. Reconfigure the matching Stripe Payment Link / Checkout price (and the
//      trial, which is a Stripe-dashboard setting — not an API field).
//   2. Update the constant here.
//
// June 9 2026 flip — COMPLETE in both modes: $29.99/mo + 7-day trial +
// $179/yr annual. TEST prices price_1TgbDjLJVzRZvO5HMwgDFOxQ (mo) /
// price_1TgbDkLJVzRZvO5HyEHdsn6I (yr); LIVE prices
// price_1TgbZhLqUC52RoAIPLjeyQNY (mo) / price_1TgbZhLqUC52RoAI6Wuixo3A (yr).
// All four payment links carry 7-day card-required trials and are mapped in
// stripe-webhook v10 (gary2.0/supabase/functions/stripe-webhook). Post-release
// cleanup: deactivate the retired live $34.99 link once the old build is gone.
enum GaryPricing {
    static let allAccessMonthly = "$29.99"   // ⚠️ Stripe ALL link must match
    static let allAccessAnnual  = "$179"     // ⚠️ Stripe ALL_ANNUAL link must match
    /// "$14.92/mo" — the annual card's effective-rate line (179 / 12).
    static let allAccessAnnualMonthly = "$14.92"
    static let single           = "$9.99"
    static let worldCup         = "$14.99"
    static let twoSport         = "$17.99"
    static let threeSport       = "$24.99"
    static let trialDays        = 7          // ⚠️ Stripe trial setting must match
    /// "7 days free" — ribbon/marketing voice.
    static var trialDaysFree: String { "\(trialDays) days free" }
    /// "7-day free trial" — CTA/legal voice.
    static var trialPhrase: String { "\(trialDays)-day free trial" }
}

// MARK: - Gary brand mark (single source of truth)
//
// One place for the logo. Change `mark` (and add the asset to Assets.xcassets)
// once and every surface — navbar, pick cards, auth, settings, changelog — updates.
enum GaryBrand {
    static let mark = "GaryIconBG"
}

/// Official team colors, brightened just enough to read on the warm black.
/// Keyed by nickname; full names ("Chicago White Sox") match by containment,
/// and the color disambiguates where shortened display names collide (SOX).
enum TeamColors {
    static let mlb: [String: String] = [
        "Diamondbacks": "#C84052", "Braves": "#E0485C", "Orioles": "#E66426",
        "Red Sox": "#D94A52", "Cubs": "#5577D6", "White Sox": "#C8CDD2",
        "Reds": "#DD4053", "Guardians": "#DF4B57", "Rockies": "#9D85D6",
        "Tigers": "#ED6A3C", "Astros": "#ED7332", "Royals": "#5B8FE0",
        "Angels": "#DC4358", "Dodgers": "#4D90D9", "Marlins": "#38AEDC",
        "Brewers": "#F2C94C", "Twins": "#D5485F", "Mets": "#F47B33",
        "Yankees": "#8FA6CE", "Athletics": "#E8B021", "Phillies": "#E04A52",
        "Pirates": "#EFC23F", "Padres": "#D9B45B", "Giants": "#F26C2A",
        "Mariners": "#34B3A5", "Cardinals": "#DE4257", "Rays": "#74AEE0",
        "Rangers": "#5083DB", "Blue Jays": "#5C9AE6", "Nationals": "#D8454F"
    ]
    static func color(for team: String?) -> Color? {
        guard let t = team, !t.isEmpty else { return nil }
        // Two-word nicknames first so "White Sox" wins before "Sox"-ish hits.
        for key in ["Red Sox", "White Sox", "Blue Jays"] where t.localizedCaseInsensitiveContains(key) {
            return Color(hex: mlb[key]!)
        }
        if let hit = mlb.first(where: { t.localizedCaseInsensitiveContains($0.key) }) {
            return Color(hex: hit.value)
        }
        return nil
    }
}

// MARK: - Gary Typography
// Bundled brand faces (Fonts/ + Info.plist UIAppFonts). Inlined here (not a
// separate file) so it compiles without a project.pbxproj change.
//   display – hero titles   mono – "Quant Terminal" labels   text – body/UI (Inter)
// Retune the brand voice by changing the single `displayFace` value.
enum GaryFonts {
    /// Bundled options: "SairaCondensed-Bold" (default), "BebasNeue-Regular",
    /// "Anton-Regular", "Rajdhani-Bold", "Oswald-Bold", "ChakraPetch-Bold", "BarlowCondensed-Bold".
    static let displayFace = "BarlowCondensed-Bold"

    static func display(_ size: CGFloat) -> Font { .custom(displayFace, size: size) }

    static func mono(_ size: CGFloat, bold: Bool = false) -> Font {
        .custom(bold ? "JetBrainsMono-Bold" : "JetBrainsMono-Regular", size: size)
    }

    enum TextWeight {
        case regular, medium, semibold, bold, heavy
        var sfWeight: Font.Weight {
            switch self {
            case .regular:  return .regular
            case .medium:   return .medium
            case .semibold: return .semibold
            case .bold:     return .bold
            case .heavy:    return .heavy
            }
        }
    }

    /// Body/text face = SF Pro (system) per the June 2026 type decision —
    /// native rendering + the Dynamic Type path for the accessibility track.
    /// (Inter stays bundled but unused; remap here if that ever changes.)
    static func text(_ size: CGFloat, _ weight: TextWeight = .regular) -> Font {
        .system(size: size, weight: weight.sfWeight)
    }
}
