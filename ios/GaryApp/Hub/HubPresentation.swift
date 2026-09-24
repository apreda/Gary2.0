import SwiftUI

// ============================================================================
// THE HUB — daily observations, specialist boards and full player/team reads
//
// (The Receipts section came off the page Aug 6 — graded rows
// now surface only through search.)
//
//
// Data machinery (staleness gates, 6am ET rollover, graded-date walk-back,
// kept-alive-tab visibility flips) is carried over from the original Hub page
// (PropsHubView, removed Jul 4 2026 once the founder approved this one) — that
// plumbing encodes weeks of fixed production bugs and is presentation-free.
// ============================================================================

// MARK: - Type + chrome system

/// Compatibility aliases for existing call sites, including Picks. These
/// forward to GaryFonts; the Hub's current scalable type modifiers follow below.
/// This namespace does not prescribe typography for future work.
enum HubFont {
    /// → GaryFonts.display. The weight arg was already ignored (Bebas has one).
    static func display(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        _ = weight
        return GaryFonts.display(size)
    }
    /// → GaryFonts.kicker. Uppercase at the call site.
    static func kicker(_ size: CGFloat = 10.5) -> Font { GaryFonts.kicker(size) }
    /// → GaryFonts.data. Tabular digits, 12pt floor, 1.18 scale.
    static func data(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        GaryFonts.data(size, weight)
    }
    /// → GaryFonts.ui. Exact size, no scaling.
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        GaryFonts.ui(size, weight)
    }
}

/// Native, scalable typography for the Hub. Reading text, numerical context
/// and gold mono labels have distinct roles without forced all-caps headlines.
struct HubScaledText: ViewModifier {
    @ScaledMetric private var size: CGFloat
    let weight: Font.Weight
    let tabular: Bool
    let design: Font.Design

    init(size: CGFloat, weight: Font.Weight, tabular: Bool, relativeTo: Font.TextStyle, design: Font.Design = .default) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
        self.weight = weight
        self.tabular = tabular
        self.design = design
    }

    func body(content: Content) -> some View {
        content.font(tabular ? .system(size: size, weight: weight, design: design).monospacedDigit()
                            : .system(size: size, weight: weight, design: design))
    }
}

extension View {
    func hubBodyFont(_ size: CGFloat, _ weight: Font.Weight = .regular) -> some View {
        modifier(HubScaledText(size: max(14, size), weight: weight, tabular: false, relativeTo: .body))
    }
    func hubDataFont(_ size: CGFloat, _ weight: Font.Weight = .bold) -> some View {
        modifier(HubScaledText(size: max(12, size), weight: weight, tabular: true, relativeTo: .caption))
    }
    func hubKickerFont(_ size: CGFloat = 10.5) -> some View {
        modifier(HubScaledText(size: max(11, size), weight: .medium, tabular: true, relativeTo: .caption, design: .monospaced))
    }
    func hubTitleFont(_ size: CGFloat, _ weight: Font.Weight = .bold) -> some View {
        modifier(HubScaledText(size: size, weight: weight, tabular: false, relativeTo: .title))
    }
}

/// Value tint with market-direction correction: O/U streak values are
/// ANGLES (neither good nor bad) so they wear gold — the backend tone stays
/// hot/cold because the morning grader branches on it (functional, not
/// cosmetic). Everything else keeps its tone color.
func hubValueTint(_ s: Signal) -> Color {
    if s.kind == .streak, let first = s.value.first, first == "O" || first == "U" {
        return GaryColors.gold
    }
    // HR Threat prices are a price, not a hot/cold verdict — same carve-out
    // as O/U streaks above (founder, Aug 4: the green odds "read as already
    // graded"). Cosmetic only: s.tone itself is untouched, so the morning
    // grader's branch on it is unaffected.
    if s.kind == .hrThreat { return GaryColors.gold }
    return s.tone.color
}

/// Internal (not fileprivate): the Picks slate strip formats its O/U with the
/// same rule so the two strips read identically.
enum HubFmt {
    /// Compact stat formatting: .851 for sub-1 rates, 8.53 for ERAs, 14.7 for IP.
    static func stat(_ v: Double) -> String {
        if v < 1, v > 0 {
            let s = String(format: "%.3f", v)
            return s.hasPrefix("0") ? String(s.dropFirst()) : s
        }
        if v >= 10 { return String(format: "%.1f", v) }
        let s = String(format: "%.2f", v)
        return s.hasSuffix("00") ? String(format: "%.0f", v) : s
    }
    /// The subject a headline is about — the part before ":" / "(", else the
    /// leading tokens. Used for dedupe keys and compact board names.
    static func subject(_ headline: String) -> String {
        let h = headline.trimmingCharacters(in: .whitespaces)
        if let d = h.rangeOfCharacter(from: CharacterSet(charactersIn: "(:")) {
            return String(h[..<d.lowerBound]).trimmingCharacters(in: .whitespaces)
        }
        return h
    }
}

extension Signal {
}

