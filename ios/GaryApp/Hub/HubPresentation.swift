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

/// Gold mono kicker — the lane/section label idiom (no chips, no boxes).
struct HubKicker: View {
    let text: String
    var size: CGFloat = 10.5
    var color: Color = GaryColors.gold
    var body: some View {
        Text(text.uppercased())
            .hubKickerFont(size)
            .tracking(1.2)
            .foregroundStyle(color)
            .lineLimit(1)
    }
}

/// Section head — mock language: gold hairline, mono uppercase label, mono
/// count, quiet sub on the right. The rows below carry the big type.
struct HubHead: View {
    let title: String
    var count: Int? = nil
    var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .hubTitleFont(19, .semibold)
                    .foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if let count, count > 0 {
                    Text("\(count)")
                        .hubDataFont(13)
                        .foregroundStyle(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
                if let sub, !sub.isEmpty {
                    Text(sub.uppercased())
                        .hubKickerFont(11).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, GaryLayout.gutter)
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

/// A specialist board keeps its complete renderer behind one clear disclosure.
/// The compact first page gives the lead room without dropping the long tail.
struct HubBoardSection<Content: View>: View {
    let anchor: String
    @Binding var open: Set<String>
    let title: String
    var count: Int? = nil
    @ViewBuilder let content: () -> Content

    private var isOpen: Bool { open.contains(anchor) }

    private var summary: String? {
        switch anchor {
        case "regression": return "Results, contact quality and what may change"
        case "streaks": return "Runs of form worth a closer look"
        case "hr": return "Power and today's pitching matchups"
        case "bats": return "Hitting form and opposing arms"
        case "arms": return "Starters, recent work and pitch profiles"
        case "nrfi": return "How the opening inning could unfold"
        case "mismatch": return "Where the teams meet unevenly"
        case "trenches": return "Protection, pressure and the line of scrimmage"
        case "field": return "Quarterbacks and player availability"
        case "edges": return "Coverage, game pace and scoring situations"
        case "form": return "Recent performance in context"
        case "series": return "What the previous meetings tell us"
        case "schedule": return "Rest, travel and the next matchup"
        case "availability": return "The latest player context"
        default: return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isOpen { open.remove(anchor) } else { open.insert(anchor) }
                }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(title).hubBodyFont(17, .semibold)
                            .foregroundStyle(GaryColors.warmWhite)
                        if let summary, !isOpen {
                            Text(summary).hubBodyFont(13)
                                .foregroundStyle(GaryColors.sectionSub)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    if let count, count > 0 {
                        Text("\(count)")
                            .hubDataFont(11, .medium)
                            .foregroundStyle(GaryColors.sectionSub)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(GaryColors.gold)
                        .rotationEffect(.degrees(isOpen ? 90 : 0))
                }
                .padding(18)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityValue("\(count.map { "\($0) \($0 == 1 ? "item" : "items"), " } ?? "")\(isOpen ? "expanded" : "collapsed")")
            .accessibilityHint(isOpen ? "Collapse board" : [summary, "Expand board"].compactMap { $0 }.joined(separator: ". "))
            if isOpen {
                HubRule().padding(.horizontal, 20)
                content().padding(.vertical, 12)
            }
        }
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
        .padding(.horizontal, GaryLayout.gutter)
    }
}

/// Hairline row divider.
struct HubRule: View {
    var inset: CGFloat = 0
    var body: some View {
        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, inset)
    }
}

// ── ALL-STAR WEEK card — one-off break surface (Jul 13-14 2026). Every line
// below was verified Jul 13 (field, format, times, starters); the call site's
// date gate self-retires the card after the break.
struct HubAllStarCard: View {
    // The winner board (FanDuel, grounded midday Jul 13), short→long — pure
    // market data; Gary's picks live on the Picks tab (pointer line below).
    private let field: [(name: String, team: String, price: String)] = [
        ("Kyle Schwarber", "PHI", "+310"),
        ("Junior Caminero", "TB", "+370"),
        ("Munetaka Murakami", "CHW", "+500"),
        ("Jordan Walker", "STL", "+600"),
        ("Jac Caglianone", "KC", "+600"),
        ("Bryce Harper", "PHI", "+800"),
        ("Ben Rice", "NYY", "+950"),
        ("Willson Contreras", "BOS", "+1700"),
    ]
    private var isDerbyDay: Bool { SupabaseAPI.todayEST() == "2026-07-13" }
    // ASG identity duotone — local to this self-retiring card.
    private let asgRed = Color(hex: "#D50032")
    private let asgBlue = Color(hex: "#2D68C4")

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HubHead(title: "MLB · All-Star Week", sub: "Citizens Bank Park")

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HStack(spacing: 3) {
                        Rectangle().fill(asgRed).frame(width: 3, height: 20)
                        Rectangle().fill(asgBlue).frame(width: 3, height: 20)
                    }
                    Text(isDerbyDay ? "HOME RUN DERBY" : "ALL-STAR GAME")
                        .hubTitleFont(30)
                        .foregroundStyle(.white)
                    Spacer(minLength: 8)
                    Text("TONIGHT · 8:00 PM ET")
                        .hubKickerFont(11.5).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                }

                if isDerbyDay {
                    Text("NEW FORMAT — 20 SWINGS IN ROUND ONE · TOP FOUR ADVANCE · ON NETFLIX")
                        .hubKickerFont(10.5).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))

                    // The winner board — market order, prices on the right,
                    // Gary's break-from-chalk row ticked in gold.
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Text("TO WIN")
                                .hubKickerFont(10).tracking(1.2)
                                .foregroundStyle(.white.opacity(0.55))
                            Spacer(minLength: 8)
                            Text("FANDUEL · MIDDAY")
                                .hubKickerFont(10).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.45))
                        }
                        .padding(.bottom, 7)
                        // Pure market board — no pick reveals (founder): the
                        // pointer line below says where Gary's picks live.
                        ForEach(Array(field.enumerated()), id: \.element.name) { i, p in
                            HStack(spacing: 7) {
                                Text(p.name)
                                    .font(.system(size: 14.5, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                                Text(p.team)
                                    .hubKickerFont(10).tracking(0.6)
                                    .foregroundStyle(.white.opacity(0.55))
                                Spacer(minLength: 8)
                                Text(p.price)
                                    .hubDataFont(14.5)
                                    .foregroundStyle(.white.opacity(0.85))
                            }
                            .padding(.vertical, 5)
                            if i < field.count - 1 { HubRule() }
                        }
                    }
                    .padding(.vertical, 2)

                    HubRule()
                    HStack(alignment: .firstTextBaseline) {
                        Text("TOMORROW — ALL-STAR GAME")
                            .hubKickerFont(10.5).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.62))
                        Spacer(minLength: 8)
                        Text("CEASE (AL) VS SÁNCHEZ (NL)")
                            .hubKickerFont(10.5).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                } else {
                    Text("CEASE (AL) VS SÁNCHEZ (NL) · MLB RETURNS FRIDAY")
                        .hubKickerFont(10.5).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }

                Text(isDerbyDay ? "GARY'S BOARD — 5 PICKS · ON THE PICKS TAB"
                                : "GARY'S BOARD — ON THE PICKS TAB")
                    .hubKickerFont(10.5).tracking(1.0)
                    .foregroundStyle(GaryColors.gold.opacity(0.9))
            }
            .padding(.horizontal, 18)

            // THE CONTEST — Sol's R1 over/under on every participant
            // (founder: the fun list product; reasons included — the Hub
            // is the insight surface).
            if isDerbyDay {
                DerbyContestSection(showReasons: true)
            }
        }
    }
}

/// The page-wide "See all n / Show less" expander control.
struct HubSeeAllButton: View {
    let isOpen: Bool
    let total: Int
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(isOpen ? "SHOW LESS" : "SEE ALL \(total)")
                    .hubKickerFont(10.5).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
            }
            .padding(.horizontal, 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
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

/// Body text with the headline echo stripped: drops a first sentence that
/// restates the headline, and any sentence that only re-reads the value the
/// card already shows big. Returns "" when nothing new remains.
func hubDedupedDetail(_ s: Signal) -> String {
    let detail = s.detail.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !detail.isEmpty else { return "" }
    let norm: (String) -> String = { $0.lowercased().filter { $0.isLetter || $0.isNumber } }
    let nHead = norm(s.headline)
    var sentences = detail.components(separatedBy: ". ")
    sentences = sentences.enumerated().filter { i, sent in
        let n = norm(sent)
        if n.isEmpty { return false }
        // The headline restated (or containing it) adds nothing.
        if n == nHead || (nHead.count > 20 && (n.hasPrefix(nHead) || nHead.hasPrefix(n))) { return false }
        // A sentence whose only job is re-reading the shown value adds nothing —
        // but only cut it up front; mid-body mentions carry context.
        if i == 0, !s.value.isEmpty, sent.contains(s.value), sent.count < 60 { return false }
        return true
    }.map { $0.element }
    let out = sentences.joined(separator: ". ").trimmingCharacters(in: .whitespaces)
    guard !out.isEmpty else { return "" }
    return out.hasSuffix(".") ? out : out + "."
}

extension Signal {
    /// True when the right-side value would only echo a number the headline
    /// already carries ("Giants 7-1 in…" beside a 7-1, "…pen: 13.7 relief IP"
    /// beside "13.7 IP") — those rows read cleaner with the headline alone.
    var valueEchoesHeadline: Bool {
        guard !value.isEmpty else { return true }
        // A streak value is ALWAYS an echo — "TB have won 9 straight" beside a
        // green W9 says the same thing twice (founder, Aug 14). The literal
        // check below can't catch it because the headline never contains the
        // "W9" token itself.
        if kind == .streak { return true }
        if headline.contains(value) { return true }
        if let lead = value.split(separator: " ").first,
           lead.contains(where: { $0.isNumber }),
           headline.contains(lead) { return true }
        return false
    }
    /// A value earns stat treatment only when it's a compact token — sentence
    /// values ("8-game unbeaten") belong to the headline, not a number slot.
    var valueIsCompact: Bool { !value.isEmpty && value.count <= 8 }
    /// The right-side stat for list rows: compact and not a headline echo.
    var displayValue: String? { (valueIsCompact && !valueEchoesHeadline) ? value : nil }
}

