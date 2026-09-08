import SwiftUI



enum GaryColors {
    static let gold = Color(hex: "#C9A227")
    static let lightGold = Color(hex: "#E8D48B")
    static let warmGold = Color(hex: "#F4E4BA")
    static let cream = Color(hex: "#FAF8F5")
    
    static let darkBg = Color(hex: "#090808")        // was #08080A (B led)
    static let cardBg = Color(hex: "#131211")        // was #121214 (B led)
    static let ink = Color(hex: "#0C0B0B")
    static let elevatedBg = Color(hex: "#1E1A1A")
    static let barSurface = Color(hex: "#1A1613")
    static let insetBand = Color(hex: "#100E0C")     // was #0F0E10 (B led)
    
    static let glassTint = Color.white.opacity(0.08)
    static let glassHighlight = Color.white.opacity(0.15)
    static let glassBorder = Color.white.opacity(0.12)
    
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
    
    static let silver = Color(hex: "#CBC7C1")
    static let silverLight = Color(hex: "#DCD7D0")
    static let silverDim = Color(hex: "#B4AEA6")


    static let heroAccent = gold
    static let sectionHead = GaryColors.gold.opacity(0.92)   // sections speak gold, like the web
    static let sectionSub = Color.white.opacity(0.68)
    static let meta = Color.white.opacity(0.62)
    static let selectedText = Color.white.opacity(0.95)
    static let selectedFill = Color.white.opacity(0.12)

    static let win = Color(hex: "#3FB950")
    static let loss = Color(hex: "#E5484D")
    static let sweating = Color(hex: "#F0A53A")
    static let lostTint = Color(hex: "#C77A3A")
    static let fieldBg = Color(hex: "#131110")
    static let warmWhite = Color(hex: "#F6F1E7")

    static let nflAccent = Color(hex: "#2C7EDB")

    static let mlbGrass = Color(hex: "#63D17E")
    static let mlbFieldText = Color(hex: "#63D17E")

    static let panelFill = warmWhite.opacity(0.03)
    static let panelStroke = warmWhite.opacity(0.07)
    static let panelFillOpaque = Color(hex: "#141210")
    static let readingPanel = Color(hex: "#24211D")
    static let readingPanelRaised = Color(hex: "#2C2822")
}

enum GaryLayout {
    static let gutter: CGFloat = 18

    enum Radius {
        static let panel: CGFloat = 12
        static let card: CGFloat = 14
        static let sheet: CGFloat = 20
    }
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
// Shared typography helpers for existing call sites. Bundled faces are
// registered through Info.plist UIAppFonts; system roles use the scales below.
// The Hub and shared player cards also have native scalable type modifiers.
// These helpers describe current rendering, not mandatory design choices.
enum GaryFonts {
    /// Current bundled display face. Its glyphs render capitals only.
    static let displayFace = "BebasNeue-Regular"

    // Scale and minimum-size constants used by the helpers below.
    private static let displayScale: CGFloat = 1.08
    private static let dataScale:    CGFloat = 1.18
    private static let dataFloor:    CGFloat = 12
    private static let textScale:    CGFloat = 1.15
    private static let textFloor:    CGFloat = 13

    // ── SCALED ROLES (respond to the constants above) ───────────────────────

    /// Hero titles + wordmarks — bundled Bebas. Renders CAPS (no lowercase).
    static func display(_ size: CGFloat) -> Font { .custom(displayFace, size: size * displayScale) }

    /// System text with tabular digits, a minimum size and configurable weight.
    static func data(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: max(dataFloor, size * dataScale), weight: weight).monospacedDigit()
    }

    /// System body text using the shared scale and minimum size.
    static func text(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: max(textFloor, size * textScale), weight: weight)
    }

    // ── RAW ROLES (exact size, no scaling — already tuned at the call site) ──

    /// System labels at the requested size with tabular digits.
    static func kicker(_ size: CGFloat = 10.5, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight).monospacedDigit()
    }

    /// System text with black weight and italic styling.
    static func accent(_ size: CGFloat) -> Font {
        .system(size: size, weight: .black).italic()
    }

    /// System UI text at the requested size and weight.
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }

    /// Compatibility alias for the shared data font helper.
    static func mono(_ size: CGFloat, bold: Bool = false) -> Font {
        data(size, bold ? .bold : .semibold)
    }
}

extension View {
    /// Allows rail shadows outside scroll bounds on iOS 17 and later.
    @ViewBuilder func unclippedRail() -> some View {
        if #available(iOS 17.0, *) { self.scrollClipDisabled() } else { self }
    }

    /// Applies the shared horizontal padding value.
    func pageGutter() -> some View { padding(.horizontal, GaryLayout.gutter) }

    /// The one panel surface (fill + hairline stroke). Replaces quantPanel()
    /// and the six hand-rolled warm-white panels that had drifted 0.008 apart.
    func garyPanel(radius: CGFloat = GaryLayout.Radius.panel, fill: Color? = nil) -> some View {
        modifier(GaryPanelSurface(radius: radius, fill: fill))
    }
}

/// Whether panels in this subtree draw the opaque fill instead of the wash.
/// Used by Home, Winners and Fantasy. Other pages retain the warm wash.
private struct SolidPanelsKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var solidPanels: Bool {
        get { self[SolidPanelsKey.self] }
        set { self[SolidPanelsKey.self] = newValue }
    }
}

/// The one panel surface, surface-aware: opaque over a patterned ground
/// (`solidPanels`), the classic warm wash everywhere else.
struct GaryPanelSurface: ViewModifier {
    @Environment(\.solidPanels) private var solidPanels
    let radius: CGFloat
    var fill: Color? = nil
    func body(content: Content) -> some View {
        if solidPanels || fill != nil {
            // FLOATING treatment over THE FLOOR (founder, Aug 19: containers
            // "super close... the background super far away... without going
            // to a gold background"). Black-on-black depth is light + shadow:
            // a lit top rim — the horizon light catching the card's near
            // edge — and a soft shadow puddle that visibly darkens the grid
            // beneath, so the card reads as hovering OVER the floor.
            content.background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(fill ?? GaryColors.panelFillOpaque)
                    .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(LinearGradient(stops: [
                            .init(color: GaryColors.warmWhite.opacity(0.16), location: 0),
                            .init(color: GaryColors.warmWhite.opacity(0.06), location: 0.35),
                            .init(color: GaryColors.warmWhite.opacity(0.025), location: 1),
                        ], startPoint: .top, endPoint: .bottom), lineWidth: 1))
                    .shadow(color: .black.opacity(0.55), radius: 18, y: 10)
                    .shadow(color: .black.opacity(0.65), radius: 4, y: 2)
            )
        } else {
            content.background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(GaryColors.panelFill)
                    .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .stroke(GaryColors.panelStroke, lineWidth: 1))
            )
        }
    }
}

/// The Broadcast section bar — the skewed gold slab from the "02" mock.
/// Pairs with GaryFonts.accent kickers: `BroadcastBar() + accent text`.
struct BroadcastBar: View {
    var tint: Color = GaryColors.gold
    var height: CGFloat = 12
    var body: some View {
        Rectangle()
            .fill(tint)
            .frame(width: 4, height: height)
            .transformEffect(CGAffineTransform(a: 1, b: 0, c: -0.22, d: 1, tx: 2, ty: 0))
    }
}

// (GaryFonts.TextWeight retired Aug 4 2026 — it mirrored Font.Weight case for
// case, so the two systems needed a bridge to talk. Font.Weight is now the one
// weight type; every existing `.semibold` / `.bold` / `.heavy` call site
// resolved unchanged.)
