import SwiftUI
import UIKit

// THE YARDSTICK (founder, Sep 22 2026: "we need to bring that back and use
// that in different capacities" — Darts and the prop picks). One ruler, one
// chart, one panel: the Darts hit-rate table, every MLB player card and the
// Winners prop breakdown read a player's games through these pieces, from the
// card's `log` — the last 20 finals and the season's count at every mark.

// MARK: - What the ruler measures

/// A stat the yardstick reads, keyed the way the card's log stores it.
struct LogStat: Hashable, Identifiable {
    let key: String
    /// The tab, and the noun after the mark: "2+ HITS".
    let title: String
    let pitcher: Bool
    /// Where the ruler opens when no posted line says otherwise.
    let start: Int
    /// The ruler's notch: 1 for counts, 10 for yards (a 150-yard range reads
    /// as fifteen marks, not 150).
    var step: Int = 1
    /// The NFL card types the stat belongs to ("quarterback", "skill");
    /// empty for MLB, which splits on `pitcher`.
    var roles: Set<String> = []
    var id: String { (pitcher ? "p." : "b.") + key }

    /// The NFL's stats (founder, Sep 23 2026: hit rates for the NFL too), read
    /// from the card's nflverse log across this season and last.
    static let nfl: [LogStat] = [
        LogStat(key: "recyds", title: "RECEIVING YARDS", pitcher: false, start: 60, step: 10, roles: ["skill"]),
        LogStat(key: "rec", title: "RECEPTIONS", pitcher: false, start: 4, roles: ["skill"]),
        LogStat(key: "rushyds", title: "RUSHING YARDS", pitcher: false, start: 60, step: 10, roles: ["skill", "quarterback"]),
        LogStat(key: "td", title: "TOUCHDOWNS", pitcher: false, start: 1, roles: ["skill"]),
        LogStat(key: "carries", title: "CARRIES", pitcher: false, start: 12, roles: ["skill"]),
        LogStat(key: "passyds", title: "PASSING YARDS", pitcher: false, start: 230, step: 10, roles: ["quarterback"]),
        LogStat(key: "passtd", title: "PASSING TDS", pitcher: false, start: 2, roles: ["quarterback"]),
        LogStat(key: "cmp", title: "COMPLETIONS", pitcher: false, start: 20, roles: ["quarterback"]),
        LogStat(key: "int", title: "INTERCEPTIONS", pitcher: false, start: 1, roles: ["quarterback"]),
    ]
    static let nflTypes: Set<String> = ["quarterback", "skill"]

    /// The stats a player card's log reads, by the card's type.
    static func forCard(type: String?) -> [LogStat] {
        if let type, nflTypes.contains(type) { return nfl.filter { $0.roles.contains(type) } }
        return all(pitcher: type == "pitcher")
    }
    /// Whether a card of this type is who the stat is about.
    func fits(cardType type: String?) -> Bool {
        roles.isEmpty ? (type == "pitcher") == pitcher : roles.contains(type ?? "")
    }

    static let batting: [LogStat] = [
        LogStat(key: "h", title: "HITS", pitcher: false, start: 2),
        LogStat(key: "tb", title: "TOTAL BASES", pitcher: false, start: 2),
        LogStat(key: "hrr", title: "H+R+RBI", pitcher: false, start: 2),
        LogStat(key: "hr", title: "HOME RUNS", pitcher: false, start: 1),
        LogStat(key: "r", title: "RUNS", pitcher: false, start: 1),
        LogStat(key: "rbi", title: "RBI", pitcher: false, start: 1),
        LogStat(key: "sb", title: "STOLEN BASES", pitcher: false, start: 1),
    ]
    static let pitching: [LogStat] = [
        LogStat(key: "k", title: "STRIKEOUTS", pitcher: true, start: 6),
        LogStat(key: "outs", title: "OUTS", pitcher: true, start: 16),
        LogStat(key: "ha", title: "HITS ALLOWED", pitcher: true, start: 5),
        LogStat(key: "er", title: "EARNED RUNS", pitcher: true, start: 3),
        LogStat(key: "bb", title: "WALKS", pitcher: true, start: 2),
    ]
    static func all(pitcher: Bool) -> [LogStat] { pitcher ? pitching : batting }

    /// The stat a prop market or a card's prop label reads ("hits 1.5",
    /// "pitcher_strikeouts 5.5", "Hits + Runs + RBIs"); nil when the log
    /// does not carry it.
    /// A prop label read for the card's type: the NFL's markets for a
    /// football card, MLB's otherwise.
    static func reading(_ raw: String?, type: String?) -> LogStat? {
        guard let type, nflTypes.contains(type) else { return reading(raw, pitcher: type == "pitcher") }
        guard var m = raw?.lowercased() else { return nil }
        m = m.replacingOccurrences(of: #"\s*[0-9]+(\.[0-9]+)?$"#, with: "", options: .regularExpression)
        m = m.replacingOccurrences(of: "player_", with: "").replacingOccurrences(of: "_", with: " ")
        m = m.split(separator: " ").joined(separator: " ")
        let key: String?
        switch m {
        case "receiving yards", "reception yards", "rec yds": key = "recyds"
        case "receptions": key = "rec"
        case "rushing yards", "rush yds": key = "rushyds"
        case "rushing attempts", "carries", "rush attempts": key = "carries"
        case "anytime td", "anytime touchdown", "touchdowns": key = "td"
        case "passing yards", "pass yds": key = "passyds"
        case "passing tds", "passing touchdowns", "pass tds": key = "passtd"
        case "passing completions", "completions", "pass completions": key = "cmp"
        case "interceptions", "passing interceptions", "interceptions thrown": key = "int"
        default: key = nil
        }
        guard let key, let stat = nfl.first(where: { $0.key == key }), stat.roles.contains(type) else { return nil }
        return stat
    }

    static func reading(_ raw: String?, pitcher: Bool) -> LogStat? {
        guard var m = raw?.lowercased() else { return nil }
        m = m.replacingOccurrences(of: #"\s*[0-9]+(\.[0-9]+)?$"#, with: "", options: .regularExpression)
        let pitching = pitcher || m.hasPrefix("pitcher_")
        m = m.replacingOccurrences(of: "pitcher_", with: "").replacingOccurrences(of: "batter_", with: "")
        m = m.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "+", with: " ")
        m = m.split(separator: " ").joined(separator: " ")
        let key: String?
        if pitching {
            switch m {
            case "strikeouts", "ks": key = "k"
            case "outs", "outs recorded": key = "outs"
            case "hits allowed", "hits": key = "ha"
            case "earned runs": key = "er"
            case "walks", "walks allowed": key = "bb"
            default: key = nil
            }
        } else {
            switch m {
            case "hits": key = "h"
            case "total bases": key = "tb"
            case "hits runs rbis", "hits runs rbi": key = "hrr"
            case "home runs", "home run": key = "hr"
            case "runs", "runs scored": key = "r"
            case "rbi", "rbis", "runs batted in": key = "rbi"
            case "stolen bases": key = "sb"
            default: key = nil
            }
        }
        guard let key else { return nil }
        return all(pitcher: pitching).first { $0.key == key }
    }
}

/// Where the ruler sits: at least `value` (an over), or at most (an under).
struct LogMark: Equatable {
    var value: Int
    var under: Bool = false

    /// The mark a posted line is the same bet as: over 1.5 is at least 2,
    /// under 2.5 is at most 2.
    static func from(line: Double, under: Bool) -> LogMark {
        under ? LogMark(value: max(0, Int(line.rounded(.up)) - 1), under: true)
              : LogMark(value: max(1, Int(line.rounded(.down)) + 1), under: false)
    }
    /// The same, set on the ruler's nearest notch for a stat counted in steps.
    static func from(line: Double, under: Bool, step: Int) -> LogMark {
        var mark = from(line: line, under: under)
        if step > 1 { mark.value = max(step, Int((Double(mark.value) / Double(step)).rounded()) * step) }
        return mark
    }
    func clears(_ v: Double) -> Bool { under ? v <= Double(value) : v >= Double(value) }
    /// The line this mark is the same bet as: at least 2 is over 1.5.
    var line: Double { under ? Double(value) + 0.5 : Double(value) - 0.5 }
    func words(_ stat: LogStat) -> String {
        if under { return value == 0 ? "NO \(stat.title)" : "\(value) OR FEWER \(stat.title)" }
        return "\(value)+ \(stat.title)"
    }
}

enum LogWindow: String, CaseIterable, Identifiable {
    case last5 = "L5", last10 = "L10", last20 = "L20", season = "SEASON"
    var id: String { rawValue }
    var games: Int? {
        switch self {
        case .last5: return 5
        case .last10: return 10
        case .last20: return 20
        case .season: return nil
        }
    }
}

/// What a surface opens the yardstick on (the Darts table hands its stat,
/// mark and window to the player card it opens).
struct LogFocus: Equatable {
    let stat: LogStat
    let mark: LogMark
    let window: LogWindow
}

extension PlayerGameLog {
    func series(_ stat: LogStat) -> [Double] { s?[stat.key] ?? [] }

    /// The windows this log fills. A last-N window needs all N games; the
    /// season shows when it holds more games than the longest one shown.
    func windows(_ stat: LogStat) -> [LogWindow] {
        let count = series(stat).count
        var out = LogWindow.allCases.filter { w in w.games.map { count >= $0 } ?? false }
        let longest = out.compactMap { $0.games }.max() ?? 0
        if let n, n > longest, ge?[stat.key] != nil { out.append(.season) }
        return out
    }

    /// Games that reached the mark, of the games in the window.
    func tally(_ stat: LogStat, _ mark: LogMark, _ window: LogWindow) -> (hit: Int, of: Int)? {
        if let games = window.games {
            let v = series(stat)
            guard v.count >= games else { return nil }
            return (v.suffix(games).filter(mark.clears).count, games)
        }
        guard let n, n > 0, let ge = ge?[stat.key] else { return nil }
        func atLeast(_ k: Int) -> Int { k <= 0 ? n : (k - 1 < ge.count ? ge[k - 1] : 0) }
        return mark.under ? (n - atLeast(mark.value + 1), n) : (atLeast(mark.value), n)
    }

    /// The season as a spread: games at each count, the last bucket holding
    /// every game at the stored cap or above. Empty ends are trimmed.
    func spread(_ stat: LogStat) -> [(value: Int, games: Int, orMore: Bool)] {
        guard let n, n > 0, let ge = ge?[stat.key], !ge.isEmpty else { return [] }
        var out: [(value: Int, games: Int, orMore: Bool)] = [(0, n - ge[0], false)]
        for j in 1..<ge.count { out.append((j, ge[j - 1] - ge[j], false)) }
        out.append((ge.count, ge[ge.count - 1], true))
        while let last = out.last, last.games == 0, out.count > 3 { out.removeLast() }
        while let first = out.first, first.games == 0, out.count > 3 { out.removeFirst() }
        return out
    }

    /// The marks the ruler offers for a stat, in the stat's notches (a yards
    /// stat's 1...15 is 10 to 150 yards).
    func rulerRange(_ stat: LogStat, under: Bool) -> ClosedRange<Int> {
        let most = series(stat).max() ?? 0
        let top = max(ge?[stat.key]?.count ?? 0, Int((most / Double(max(stat.step, 1))).rounded(.up)), 3)
        return under ? 0...(top - 1) : 1...top
    }
}

enum LogFormat {
    /// "7 of 10" in the color of how often: green when he reached it in most
    /// games, red when in few.
    static func tint(hit: Int, of: Int) -> Color {
        guard of > 0 else { return LabInk.dim }
        let rate = Double(hit) / Double(of)
        if rate >= 0.6 { return GaryColors.win }
        if rate < 0.35 { return GaryColors.loss.opacity(0.9) }
        return GaryColors.warmWhite
    }
}

// MARK: - The ruler

/// THE RULER — a brass tape and a gold needle. The tape starts at the left
/// edge (founder, Sep 23 2026: "start all the way over to the left instead of
/// starting in the center"); drag the needle, fling it or tap a number and it
/// settles on a whole mark with a click under the thumb. A range too long for
/// the width scrolls under the needle.
struct GaryRuler: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    /// Points between whole marks; nil spreads the range across the width.
    var spacing: CGFloat? = nil
    var name: String = "Mark"
    var spoken: (Int) -> String = { String($0) }
    /// The number under a notch: the notch itself, or a yards stat's 60.
    var label: (Int) -> String = { String($0) }

    @State private var shown: Double? = nil
    @State private var start: Double = 0
    @State private var dragging = false
    @State private var step: CGFloat = 40
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private static let click = UISelectionFeedbackGenerator()
    /// Room before the first mark and after the last, for their numbers.
    static let lead: CGFloat = 16

    private var position: Double { shown ?? Double(value) }

    var body: some View {
        GeometryReader { geo in
            let fits = RulerTape.length(range: range, spacing: step) <= geo.size.width
            RulerTape(position: position, range: range, spacing: step, label: label)
                .mask(LinearGradient(stops: fits ? [.init(color: .black, location: 0), .init(color: .black, location: 1)] : [
                    .init(color: .clear, location: 0), .init(color: .black, location: 0.1),
                    .init(color: .black, location: 0.9), .init(color: .clear, location: 1),
                ], startPoint: .leading, endPoint: .trailing))
                .overlay(RulerTouch(onBegan: began, onChanged: moved, onEnded: ended,
                                    onTap: { x in tapped(x, width: geo.size.width) }))
                .onAppear { step = pitch(for: geo.size.width) }
                .onChange(of: geo.size.width) { w in step = pitch(for: w) }
                .onChange(of: range) { _ in step = pitch(for: geo.size.width) }
        }
        .frame(height: 56)
        .onChange(of: value) { v in settle(on: v) }
        .accessibilityElement()
        .accessibilityLabel(name)
        .accessibilityValue(spoken(value))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: if value < range.upperBound { value += 1 }
            case .decrement: if value > range.lowerBound { value -= 1 }
            @unknown default: break
            }
        }
    }

    private func pitch(for width: CGFloat) -> CGFloat {
        if let spacing { return spacing }
        let gaps = CGFloat(max(range.count - 1, 1))
        return min(96, max(22, (width - Self.lead * 2) / gaps))
    }
    private func clamp(_ v: Int) -> Int { min(max(v, range.lowerBound), range.upperBound) }
    private func rubber(_ raw: Double) -> Double {
        let lo = Double(range.lowerBound), hi = Double(range.upperBound)
        if raw < lo { return lo - (lo - raw) * 0.28 }
        if raw > hi { return hi + (raw - hi) * 0.28 }
        return raw
    }
    private func select(_ v: Int) {
        guard v != value else { return }
        value = v
        Self.click.selectionChanged()
    }

    private func began() {
        dragging = true
        start = position
        Self.click.prepare()
    }
    /// The needle follows the finger.
    private func moved(_ dx: CGFloat) {
        let raw = start + Double(dx / step)
        shown = rubber(raw)
        select(clamp(Int(raw.rounded())))
    }
    private func ended(_ dx: CGFloat, _ velocity: CGFloat) {
        dragging = false
        let projected = start + Double((dx + velocity * 0.16) / step)
        let target = clamp(Int(projected.rounded()))
        select(target)
        settle(on: target)
    }
    private func tapped(_ x: CGFloat, width: CGFloat) {
        let offset = RulerTape.offset(position: position, range: range, spacing: step, width: width)
        select(clamp(range.lowerBound + Int(((x + offset - Self.lead) / step).rounded())))
    }
    private func settle(on v: Int) {
        guard !dragging else { return }
        if reduceMotion { shown = Double(v); return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.86)) { shown = Double(v) }
    }
}

/// The tape and its needle, redrawn every frame the position animates.
private struct RulerTape: View, Animatable {
    var position: Double
    let range: ClosedRange<Int>
    let spacing: CGFloat
    var label: (Int) -> String = { String($0) }
    var animatableData: Double {
        get { position }
        set { position = newValue }
    }

    /// The whole tape, first mark to last, with room for the end numbers.
    static func length(range: ClosedRange<Int>, spacing: CGFloat) -> CGFloat {
        GaryRuler.lead * 2 + CGFloat(max(range.count - 1, 0)) * spacing
    }
    /// How far a long tape has scrolled: none until the needle passes the
    /// middle, never past the last mark.
    static func offset(position: Double, range: ClosedRange<Int>, spacing: CGFloat, width: CGFloat) -> CGFloat {
        let at = GaryRuler.lead + CGFloat(position - Double(range.lowerBound)) * spacing
        return min(max(0, at - width / 2), max(0, length(range: range, spacing: spacing) - width))
    }

    var body: some View {
        Canvas { ctx, size in
            let offset = Self.offset(position: position, range: range, spacing: spacing, width: size.width)
            func x(_ v: Double) -> CGFloat { GaryRuler.lead + CGFloat(v - Double(range.lowerBound)) * spacing - offset }
            let needle = x(position)
            let reachOfFade = max(size.width * 0.8, 1)
            let tickLine: CGFloat = 16
            for whole in range {
                let wx = x(Double(whole))
                guard wx > -spacing, wx < size.width + spacing else { continue }
                let edge = min(1, abs(wx - needle) / reachOfFade)
                let near = max(0, 1 - abs(Double(whole) - position))
                // The whole mark.
                let major = CGRect(x: wx - 1, y: tickLine - 11, width: 2, height: 22)
                ctx.fill(Path(roundedRect: major, cornerRadius: 1),
                         with: .color(GaryColors.warmWhite.opacity(0.9 - 0.55 * edge)))
                // Quarters to the next mark, the half a little taller.
                if whole < range.upperBound {
                    for q in 1...3 {
                        let mx = wx + spacing * CGFloat(q) / 4
                        let medge = min(1, abs(mx - needle) / reachOfFade)
                        let h: CGFloat = q == 2 ? 13 : 8
                        let minor = CGRect(x: mx - 0.6, y: tickLine - h / 2, width: 1.2, height: h)
                        ctx.fill(Path(roundedRect: minor, cornerRadius: 0.6),
                                 with: .color(GaryColors.warmWhite.opacity(0.45 - 0.32 * medge)))
                    }
                }
                // The number, gold and larger as it reaches the needle.
                let label = Text(self.label(whole)).font(GaryFonts.display(15 + 8 * near))
                    .foregroundColor(near > 0.5 ? GaryColors.gold : GaryColors.warmWhite.opacity(0.78 - 0.48 * edge))
                ctx.draw(label, at: CGPoint(x: wx, y: 44), anchor: .center)
            }
            // The needle, gold and lit, over the mark it reads.
            ctx.drawLayer { layer in
                layer.addFilter(.shadow(color: GaryColors.gold.opacity(0.55), radius: 6))
                let bar = Path(roundedRect: CGRect(x: needle - 1.5, y: 0, width: 3, height: 32), cornerRadius: 1.5)
                layer.fill(bar, with: .linearGradient(Gradient(colors: [GaryMetal.lit, GaryColors.gold, GaryMetal.rim]),
                                                     startPoint: CGPoint(x: needle, y: 0), endPoint: CGPoint(x: needle, y: 32)))
            }
        }
    }
}

/// Horizontal pans and taps on the ruler, in UIKit: a vertical pan fails at
/// once so the page scrolls, and a horizontal one holds the page (and any
/// carousel around it) still while the tape moves.
private struct RulerTouch: UIViewRepresentable {
    var onBegan: () -> Void
    var onChanged: (CGFloat) -> Void
    var onEnded: (CGFloat, CGFloat) -> Void
    var onTap: (CGFloat) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        pan.delegate = context.coordinator
        view.addGestureRecognizer(pan)
        view.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:))))
        return view
    }
    func updateUIView(_ view: UIView, context: Context) { context.coordinator.parent = self }
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: RulerTouch
        init(_ parent: RulerTouch) { self.parent = parent }

        @objc func pan(_ g: UIPanGestureRecognizer) {
            let dx = g.translation(in: g.view).x
            switch g.state {
            case .began: parent.onBegan(); parent.onChanged(dx)
            case .changed: parent.onChanged(dx)
            case .ended, .cancelled, .failed: parent.onEnded(dx, g.velocity(in: g.view).x)
            default: break
            }
        }
        @objc func tap(_ g: UITapGestureRecognizer) { parent.onTap(g.location(in: g.view).x) }

        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let pan = g as? UIPanGestureRecognizer else { return true }
            let t = pan.translation(in: pan.view)
            let v = pan.velocity(in: pan.view)
            return abs(t.x) + abs(v.x) * 0.02 > abs(t.y) + abs(v.y) * 0.02
        }
        /// Every scroll view around the ruler waits for its pan to fail.
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            g is UIPanGestureRecognizer && other.view is UIScrollView
        }
    }
}

// MARK: - The bars

struct LogBar: Identifiable {
    let id: Int
    let value: Double
    /// The number over the bar.
    let top: String
    /// The first axis line (the opponent, or the count on the season spread).
    var axis: String? = nil
    /// The second axis line (the date).
    var sub: String? = nil
    let clears: Bool
}

/// Bars against the mark: green where he reached it, red where he did not,
/// the dashed line at the posted-line equivalent with its number at the end.
struct LogBarsChart: View {
    let bars: [LogBar]
    var rule: Double? = nil
    var height: CGFloat = 156

    var body: some View {
        GeometryReader { geo in
            let ruleW: CGFloat = rule == nil ? 0 : 30
            let plotW = geo.size.width - ruleW
            let n = max(bars.count, 1)
            let gap: CGFloat = n <= 6 ? 12 : n <= 12 ? 7 : 4
            let barW = max(3, min(34, (plotW - gap * CGFloat(n - 1)) / CGFloat(n)))
            let totalW = barW * CGFloat(n) + gap * CGFloat(n - 1)
            let x0 = max(0, (plotW - totalW) / 2)
            let hasAxis = bars.contains { $0.axis != nil }
            let hasSub = bars.contains { $0.sub != nil }
            let axisH: CGFloat = hasAxis ? (hasSub ? 30 : 17) : 0
            let topPad: CGFloat = 17
            let plotH = max(geo.size.height - axisH - topPad, 10)
            let maxV = max(bars.map(\.value).max() ?? 1, (rule ?? 0) + 0.5, 1)
            let yOf: (Double) -> CGFloat = { v in topPad + plotH - CGFloat(v / maxV) * plotH }
            ZStack(alignment: .topLeading) {
                ForEach(bars) { b in
                    let x = x0 + CGFloat(b.id) * (barW + gap)
                    let h = max(CGFloat(b.value / maxV) * plotH, 2)
                    RoundedRectangle(cornerRadius: min(3, barW / 3), style: .continuous)
                        .fill(b.clears ? GaryColors.win : GaryColors.loss.opacity(0.78))
                        .frame(width: barW, height: h)
                        .offset(x: x, y: topPad + plotH - h)
                    // A number that would sit on the dashed line rides just above it.
                    let labelY: CGFloat = {
                        let y = topPad + plotH - h - 15
                        guard let rule else { return y }
                        let ry = yOf(rule)
                        return (y < ry + 2 && y + 13 > ry - 2) ? ry - 16 : y
                    }()
                    Text(b.top)
                        .font(GaryFonts.kicker(n > 12 ? 9 : 10.5, .semibold))
                        .foregroundStyle(GaryColors.warmWhite.opacity(0.82))
                        .fixedSize()
                        .frame(width: barW + gap)
                        .offset(x: x - gap / 2, y: labelY)
                    if hasAxis, let axis = b.axis {
                        VStack(spacing: 1) {
                            Text(axis).font(GaryFonts.kicker(8.5, .semibold)).foregroundStyle(LabInk.dim).fixedSize()
                            if let sub = b.sub { Text(sub).font(GaryFonts.kicker(8, .medium)).foregroundStyle(LabInk.dimmer).fixedSize() }
                        }
                        .frame(width: barW + gap)
                        .offset(x: x - gap / 2, y: topPad + plotH + 5)
                    }
                }
                if let rule {
                    DashedRule()
                        .stroke(GaryColors.gold.opacity(0.9), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .frame(width: plotW, height: 1)
                        .offset(y: yOf(rule))
                    Text(LabFormat.trim(rule))
                        .font(GaryFonts.kicker(10.5, .bold)).foregroundStyle(GaryColors.gold)
                        .fixedSize()
                        .frame(width: ruleW, alignment: .trailing)
                        .offset(x: plotW, y: yOf(rule) - 7)
                }
            }
            .animation(.easeOut(duration: 0.22), value: bars.map(\.clears))
            .animation(.spring(response: 0.36, dampingFraction: 0.86), value: bars.count)
            .animation(.spring(response: 0.36, dampingFraction: 0.86), value: rule)
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(bars.map { "\($0.axis ?? "") \($0.top)" }.joined(separator: ", "))
    }
}

private struct DashedRule: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/// The small bars in a table row: the window's games, oldest first.
struct LogMiniBars: View {
    let values: [Double]
    let mark: LogMark
    var body: some View {
        let n = max(values.count, 1)
        let w: CGFloat = n <= 5 ? 6 : n <= 10 ? 4.5 : 2.6
        let gap: CGFloat = n <= 5 ? 3 : n <= 10 ? 2 : 1.4
        let top = max(values.max() ?? 1, Double(mark.value), 1)
        HStack(alignment: .bottom, spacing: gap) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, v in
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(mark.clears(v) ? GaryColors.win : GaryColors.loss.opacity(0.7))
                    .frame(width: w, height: max(2, CGFloat(v / top) * 20))
            }
        }
        .frame(height: 20, alignment: .bottom)
        .accessibilityHidden(true)
    }
}

// MARK: - Window tabs

/// The windows as text tabs, each with its own count under it: the fan sees
/// every window at once and the gold one drives the bars.
struct LogWindowTabs: View {
    let items: [(window: LogWindow, tally: (hit: Int, of: Int)?)]
    @Binding var selected: LogWindow

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(items, id: \.window) { item in
                let on = item.window == selected
                Button { withAnimation(.easeOut(duration: 0.2)) { selected = item.window } } label: {
                    VStack(spacing: 4) {
                        Text(item.window.rawValue).font(GaryFonts.display(14)).tracking(1.2)
                            .foregroundStyle(on ? GaryColors.gold : LabInk.dimmer)
                        if let t = item.tally {
                            Text("\(t.hit) of \(t.of)").font(GaryFonts.kicker(12.5, .semibold))
                                .foregroundStyle(LogFormat.tint(hit: t.hit, of: t.of).opacity(on ? 1 : 0.72))
                                .fixedSize()
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// MARK: - The panel

/// A player's games against a mark: the stat tabs, the ruler, the mark in
/// words (with the price when a book posts that line), the windows and the
/// bars. The player card, the Winners prop breakdown and anything else that
/// shows one player's hit rates uses this panel.
struct PlayerLogPanel: View {
    let log: PlayerGameLog
    let stats: [LogStat]
    /// Posted lines by stat key, with their price when the card has one.
    var lines: [String: (line: Double, odds: String?)] = [:]
    @State private var stat: LogStat
    @State private var mark: LogMark
    @State private var window: LogWindow

    init(log: PlayerGameLog, stats: [LogStat], lines: [String: (line: Double, odds: String?)] = [:],
         focus: LogFocus? = nil, start: LogStat? = nil, line: Double? = nil, under: Bool = false) {
        self.log = log
        self.stats = stats
        self.lines = lines
        let first = focus?.stat ?? start ?? stats.first ?? LogStat.batting[0]
        _stat = State(initialValue: first)
        let opening: LogMark
        if let focus { opening = focus.mark }
        else if let line { opening = LogMark.from(line: line, under: under, step: first.step) }
        else if let posted = lines[first.key] { opening = LogMark.from(line: posted.line, under: false, step: first.step) }
        else { opening = LogMark(value: first.start) }
        _mark = State(initialValue: opening)
        let windows = log.windows(first)
        let preferred = focus?.window ?? .last10
        _window = State(initialValue: windows.contains(preferred) ? preferred : (windows.last ?? .last10))
    }

    private var windows: [LogWindow] { log.windows(stat) }
    private var shownWindow: LogWindow { windows.contains(window) ? window : (windows.last ?? .last10) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if stats.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    LabTextTabs(items: stats.map(\.title), selected: statBinding, size: 13)
                }
            }
            GaryRuler(value: notchBinding, range: log.rulerRange(stat, under: mark.under),
                      name: stat.title.capitalized,
                      spoken: { LogMark(value: $0 * stat.step, under: mark.under).words(stat).lowercased() },
                      label: { "\($0 * stat.step)" })
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(mark.words(stat)).font(GaryFonts.display(22)).tracking(0.6).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if let price { Text(price).font(GaryFonts.display(20)).foregroundStyle(GaryColors.gold).monospacedDigit() }
            }
            LogWindowTabs(items: windows.map { ($0, log.tally(stat, mark, $0)) }, selected: windowBinding)
            LogBarsChart(bars: bars, rule: shownWindow == .season ? nil : mark.line)
        }
    }

    /// The price, when a book posts the line this mark is.
    private var price: String? {
        guard !mark.under, let posted = lines[stat.key], abs(posted.line - mark.line) < 0.01,
              let odds = posted.odds, !odds.isEmpty else { return nil }
        return odds
    }

    private var bars: [LogBar] {
        let w = shownWindow
        if let games = w.games {
            let values = Array(log.series(stat).suffix(games))
            let dates = Array((log.d ?? []).suffix(games))
            let opps = Array((log.o ?? []).suffix(games))
            return values.enumerated().map { i, v in
                LogBar(id: i, value: v, top: LabFormat.trim(v),
                       axis: games <= 10 && i < opps.count && !opps[i].isEmpty ? opps[i] : nil,
                       sub: games <= 5 && i < dates.count && !dates[i].isEmpty ? dates[i] : nil,
                       clears: mark.clears(v))
            }
        }
        return log.spread(stat).enumerated().map { i, b in
            LogBar(id: i, value: Double(b.games), top: "\(b.games)",
                   axis: b.orMore ? "\(b.value)+" : "\(b.value)",
                   clears: mark.under ? b.value <= mark.value && !b.orMore : b.value >= mark.value)
        }
    }

    private var statBinding: Binding<String> {
        Binding(get: { stat.title }, set: { title in
            guard let next = stats.first(where: { $0.title == title }), next != stat else { return }
            stat = next
            if let posted = lines[next.key] { mark = LogMark.from(line: posted.line, under: false, step: next.step) }
            else { mark = LogMark(value: next.start, under: false) }
        })
    }
    /// The ruler moves in the stat's notches; the mark keeps real units.
    private var notchBinding: Binding<Int> {
        Binding(get: { Int((Double(mark.value) / Double(max(stat.step, 1))).rounded()) },
                set: { mark.value = $0 * max(stat.step, 1) })
    }
    private var windowBinding: Binding<LogWindow> {
        Binding(get: { shownWindow }, set: { window = $0 })
    }
}
