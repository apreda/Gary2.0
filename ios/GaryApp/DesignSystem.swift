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
    
    // ── Deep backgrounds — the WARM-BLACK LADDER ────────────────────────────
    //
    // LAW (Aug 4 2026): every surface in this app keeps R >= B. The page
    // background was corrected to warm ink long ago ("the old #090C11/#10161D
    // charcoals had blue channels leading, and the whole app sat on them: that
    // was the grey-blue cast" — LiquidGlassBackground), but four blue-leading
    // blacks survived and kept leaking that cast back in: darkBg #08080A,
    // cardBg #121214, the TAB BAR #17161A, and the marquee ribbon #0F0E10.
    // All four are now warm twins at matched luminance — same perceived
    // elevation, right hue family. Add a new surface? Check R >= B first.
    static let darkBg = Color(hex: "#090808")        // was #08080A (B led)
    static let cardBg = Color(hex: "#131211")        // was #121214 (B led)
    /// Near-black text/ink that sits on the gold CTA / active pills / chips.
    static let ink = Color(hex: "#0C0B0B")
    static let elevatedBg = Color(hex: "#1E1A1A")
    /// The tab bar / chrome surface. Warm twin of the mock's #17161A at the
    /// same lightness — mock-01's geometry and elevation are untouched, only
    /// the hue is corrected (founder, Aug 4: "the nav bar is a different color").
    static let barSurface = Color(hex: "#1A1613")
    /// Darker inset band inside a card (the marquee's ticker crawl).
    static let insetBand = Color(hex: "#100E0C")     // was #0F0E10 (B led)
    
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
    static let sectionSub = Color.white.opacity(0.68)
    /// Metadata: times, game tags, fine print. (Lifted 0.55→0.62 Jul 12 —
    /// founder: strip times "unreadable"; hierarchy survives a step below
    /// sectionSub at 0.68.)
    static let meta = Color.white.opacity(0.62)
    /// Selected state for toggles/tabs/chips — a bright neutral fill.
    static let selectedText = Color.white.opacity(0.95)
    static let selectedFill = Color.white.opacity(0.12)

    /// Graded-result marks (HIT/MISS, W/L, ✓/✗) — the saturated pair, distinct
    /// from HubPalette's muted editorial tones. One token, no more inline hexes.
    static let win = Color(hex: "#3FB950")
    static let loss = Color(hex: "#E5484D")
    /// An active pick that is neither covering nor losing yet. Amber reads as
    /// "in progress" without borrowing green/red result semantics or Gary's
    /// brand gold used for prices and calls.
    static let sweating = Color(hex: "#F0A53A")
    /// Subtle red-ish gold for LOST result tags — signals a loss without flooding
    /// the cards with bright red (user call, Jun 16). Gold-family, warmed toward red.
    static let lostTint = Color(hex: "#C77A3A")
    /// Opaque warm field fill for text inputs (search bars).
    static let fieldBg = Color(hex: "#131110")
    /// Warm-white overlay base for panel/card chrome (QuantPanel's tint) —
    /// pure Color.white over the warm black page reads as a cool blue-grey cast.
    static let warmWhite = Color(hex: "#F6F1E7")

    // NFL cobalt — an accessibility-lifted blue rooted in the league's shield
    // identity. Green belongs to MLB/positive-result semantics in Gary, while
    // red already carries NCAAF and loss meaning.
    // Per-sport cue color (founder, Aug 20 second ruling: "a little accent
    // color... so the user naturally knows the cue color per sport"). The
    // token stays cobalt; the LAW is restraint — kickers and cue moments
    // wear it, never whole modules (the saturated look read as foreign).
    static let nflAccent = Color(hex: "#2C7EDB")

    // MLB label/eyebrow accent — a SOLID light grass green (user call, Jun 26):
    // the old green→dirt-brown→white field gradient was retired for a clean,
    // readable single field-green that reads well on small text.
    static let mlbGrass = Color(hex: "#63D17E")
    static let mlbFieldText = Color(hex: "#63D17E")

    // ── Panel chrome (one recipe) ───────────────────────────────────────────
    // Two near-identical panel surfaces used to coexist — quantPanel() at 0.022
    // fill and six hand-rolled panels at 0.03 — so a retune only ever hit half
    // the app. One fill, one stroke, both warm-white (pure white at low alpha
    // over warm black reads as a cool blue-grey cast).
    static let panelFill = warmWhite.opacity(0.03)
    static let panelStroke = warmWhite.opacity(0.07)
    // THE FLOOR pairing (founder, Aug 19): over a patterned ground the 3% wash
    // is see-through — this is the SAME color that wash reads as over the plain
    // ink, locked opaque, so cards sit ON the world instead of dissolving into
    // it. Applied wherever the `solidPanels` environment is set (Home).
    static let panelFillOpaque = Color(hex: "#141210")
}

// MARK: - Layout (single source of truth)
//
// Before Aug 4 2026 the app used 20 distinct horizontal paddings; `16` was only
// 38% of them. Home ragged its own left edge twice (two blocks at 20) and the
// content edge JUMPED when you switched tabs (Home/Winners 16, Hub/Picks 18,
// Billfold 12–20). One gutter fixes all of it.
enum GaryLayout {
    /// The page gutter (founder call, Aug 4: 18). Every full-width block,
    /// section rule, masthead, and hairline aligns to this — no exceptions,
    /// so the app has ONE left edge on every page.
    static let gutter: CGFloat = 18

    /// Corner radii — three steps, not twenty. (Pick/prop card faces keep their
    /// own locked geometry and are deliberately NOT on this scale.)
    enum Radius {
        /// List panels, doors, the wire, the board.
        static let panel: CGFloat = 12
        /// Hero cards — marquee, Winners stub, takeover.
        static let card: CGFloat = 14
        /// Modals and sheets.
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
// Bundled brand faces (Fonts/ + Info.plist UIAppFonts). Inlined here (not a
// separate file) so it compiles without a project.pbxproj change.
//   display – hero titles   mono – "Quant Terminal" labels   text – body/UI (Inter)
// Retune the brand voice by changing the single `displayFace` value.
// ONE RAMP (Aug 4 2026). Before this, the app ran two parallel type systems
// (GaryFonts + HubFont) with three different scale factors, two floors, and
// 236 bare `.system(size:)` calls bypassing both — so writing `12` produced
// four different rendered sizes depending on which helper you reached for.
// That is why nothing lined up optically and why tuning by number was guesswork.
//
// Every size transform in the app now happens HERE and nowhere else. HubFont
// is a thin alias (HubView.swift). Rendered sizes are UNCHANGED from Aug 3 —
// this was a consolidation, not a retune, so the pick/prop cards did not move.
enum GaryFonts {
    /// Bundled options: "BebasNeue-Regular" (default — founder-picked Jul 5 off
    /// the W17 seal mock), "SairaCondensed-Bold", "Anton-Regular", "Rajdhani-Bold",
    /// "Oswald-Bold", "ChakraPetch-Bold", "BarlowCondensed-Bold".
    /// NOTE: Bebas has no lowercase — everything through display() renders CAPS.
    static let displayFace = "BebasNeue-Regular"

    // The ramp's constants, Jul 12 2026 (founder: "everything ~20% closer").
    // Kept to the pt — retuning the app means changing these five numbers.
    private static let displayScale: CGFloat = 1.08
    private static let dataScale:    CGFloat = 1.18
    private static let dataFloor:    CGFloat = 12
    private static let textScale:    CGFloat = 1.15
    private static let textFloor:    CGFloat = 13

    // ── SCALED ROLES (respond to the constants above) ───────────────────────

    /// Hero titles + wordmarks — bundled Bebas. Renders CAPS (no lowercase).
    static func display(_ size: CGFloat) -> Font { .custom(displayFace, size: size * displayScale) }

    /// Numbers, labels, meta — SF at REAL weight with TABULAR digits, so digit
    /// columns stay aligned and 0/8 read apart. (Was JetBrains Mono in the
    /// "Quant Terminal" era; retired Jul 12 2026 — hard to read at label sizes.
    /// Never `.regular`: that read "like the default font on Microsoft Word".)
    static func data(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: max(dataFloor, size * dataScale), weight: weight).monospacedDigit()
    }

    /// Body copy + UI prose — SF Pro per the June 2026 type decision (native
    /// rendering + the Dynamic Type path). Inter stays bundled but unused.
    static func text(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: max(textFloor, size * textScale), weight: weight)
    }

    // ── RAW ROLES (exact size, no scaling — already tuned at the call site) ──

    /// Tight uppercase labels. Pair with `.tracking()` at the call site.
    static func kicker(_ size: CGFloat = 10.5, _ weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight).monospacedDigit()
    }

    /// BROADCAST accent — the scorebug voice (founder-picked Jul 12 off the
    /// "02 Broadcast" mock): black-weight italic caps for section kickers and
    /// state moments. Bebas keeps the hero titles; this is the energy layer.
    static func accent(_ size: CGFloat) -> Font {
        .system(size: size, weight: .black).italic()
    }

    /// System-native UI text at an exact size — the escape hatch that replaces
    /// bare `.system(size:)`, so every size in the app still reads as a role.
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }

    /// Deprecated alias — `data`'s name from the "Quant Terminal" era. 400+
    /// call sites still speak it and the output is identical; new code uses `data`.
    static func mono(_ size: CGFloat, bold: Bool = false) -> Font {
        data(size, bold ? .bold : .semibold)
    }
}

extension View {
    /// Horizontal card rails must never shear their cards' drop shadows into
    /// hard edges (Jul 22: the Winners seal read flat on the page). iOS 17's
    /// scrollClipDisabled is the real fix; iOS 16 keeps the clipped look —
    /// a quiet degradation, never a crash.
    @ViewBuilder func unclippedRail() -> some View {
        if #available(iOS 17.0, *) { self.scrollClipDisabled() } else { self }
    }

    /// THE page gutter. Full-width blocks, mastheads, section rules, and
    /// hairlines use this instead of a literal `.padding(.horizontal, N)` —
    /// the app's left edge is defined once, in GaryLayout.gutter.
    func pageGutter() -> some View { padding(.horizontal, GaryLayout.gutter) }

    /// The one panel surface (fill + hairline stroke). Replaces quantPanel()
    /// and the six hand-rolled warm-white panels that had drifted 0.008 apart.
    func garyPanel(radius: CGFloat = GaryLayout.Radius.panel) -> some View {
        modifier(GaryPanelSurface(radius: radius))
    }
}

/// Whether panels in this subtree draw the opaque fill instead of the wash.
/// Set by Home (THE FLOOR ground, Aug 19); false everywhere else, so the
/// rest of the app keeps the translucent surface language untouched.
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
    func body(content: Content) -> some View {
        if solidPanels {
            // FLOATING treatment over THE FLOOR (founder, Aug 19: containers
            // "super close... the background super far away... without going
            // to a gold background"). Black-on-black depth is light + shadow:
            // a lit top rim — the horizon light catching the card's near
            // edge — and a soft shadow puddle that visibly darkens the grid
            // beneath, so the card reads as hovering OVER the floor.
            content.background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(GaryColors.panelFillOpaque)
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
