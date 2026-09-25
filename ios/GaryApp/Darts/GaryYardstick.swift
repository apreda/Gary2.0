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

/// THE RULER — a brass tape under a fixed gold needle (founder, Sep 24 2026:
/// "the actual yard stick part should be what moves, not the gold line").
/// Drag the tape, fling it or tap a number and it settles on a whole mark
/// under the needle with a click. A short range spaces its marks so its ends
/// reach the edges (home runs' 1, 2, 3); past its ends the tape runs on,
/// faint and unnumbered.
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
    /// The ruler's width; the spacing follows it and the range every render,
    /// so a stat with fewer marks never keeps the last stat's spacing.
    @State private var width: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private static let click = UISelectionFeedbackGenerator()
    /// Room before the first mark and after the last, for their numbers.
    static let lead: CGFloat = 16

    private var position: Double { shown ?? Double(value) }
    private var step: CGFloat { pitch(for: width) }

    var body: some View {
        GeometryReader { geo in
            RulerTape(position: position, range: range, spacing: step, label: label)
                .mask(LinearGradient(stops: [
                    .init(color: .clear, location: 0), .init(color: .black, location: 0.12),
                    .init(color: .black, location: 0.88), .init(color: .clear, location: 1),
                ], startPoint: .leading, endPoint: .trailing))
                .overlay(RulerTouch(onBegan: began, onChanged: moved, onEnded: ended,
                                    onTap: { x in tapped(x, width: geo.size.width) }))
                .onAppear { width = geo.size.width }
                .onChange(of: geo.size.width) { w in width = w }
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

    /// Up to four marks each side of the needle: a short range's ends reach
    /// the edges, a long one shows a readable stretch.
    private func pitch(for width: CGFloat) -> CGFloat {
        if let spacing { return spacing }
        guard width > 0 else { return 40 }
        let gaps = CGFloat(min(max(range.count - 1, 1), 4))
        return max(30, (width / 2 - Self.lead) / gaps)
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
    /// The tape follows the finger; the needle stays put.
    private func moved(_ dx: CGFloat) {
        let raw = start - Double(dx / step)
        shown = rubber(raw)
        select(clamp(Int(raw.rounded())))
    }
    private func ended(_ dx: CGFloat, _ velocity: CGFloat) {
        dragging = false
        let projected = start - Double((dx + velocity * 0.16) / step)
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

    /// How far the tape has slid: the position always sits mid-width, under
    /// the needle.
    static func offset(position: Double, range: ClosedRange<Int>, spacing: CGFloat, width: CGFloat) -> CGFloat {
        GaryRuler.lead + CGFloat(position - Double(range.lowerBound)) * spacing - width / 2
    }

    var body: some View {
        Canvas { ctx, size in
            let offset = Self.offset(position: position, range: range, spacing: spacing, width: size.width)
            func x(_ v: Double) -> CGFloat { GaryRuler.lead + CGFloat(v - Double(range.lowerBound)) * spacing - offset }
            let needle = x(position)
            let reachOfFade = max(size.width * 0.8, 1)
            let tickLine: CGFloat = 16
            // Every mark in view, the tape running on faint past its ends.
            let reach = Int((size.width / max(spacing, 1)).rounded(.up)) + 1
            let first = Int(position.rounded(.down)) - reach, last = Int(position.rounded(.up)) + reach
            for whole in first...max(first, last) {
                let wx = x(Double(whole))
                guard wx > -spacing, wx < size.width + spacing else { continue }
                let onTape = range.contains(whole)
                let dim: Double = onTape ? 1 : 0.3
                let edge = min(1, abs(wx - needle) / reachOfFade)
                let near = onTape ? max(0, 1 - abs(Double(whole) - position)) : 0
                // The whole mark.
                let major = CGRect(x: wx - 1, y: tickLine - 11, width: 2, height: 22)
                ctx.fill(Path(roundedRect: major, cornerRadius: 1),
                         with: .color(GaryColors.warmWhite.opacity((0.9 - 0.55 * edge) * dim)))
                // Quarters to the next mark, the half a little taller.
                let quarterDim: Double = range.contains(whole) && range.contains(whole + 1) ? 1 : 0.3
                for q in 1...3 {
                    let mx = wx + spacing * CGFloat(q) / 4
                    let medge = min(1, abs(mx - needle) / reachOfFade)
                    let h: CGFloat = q == 2 ? 13 : 8
                    let minor = CGRect(x: mx - 0.6, y: tickLine - h / 2, width: 1.2, height: h)
                    ctx.fill(Path(roundedRect: minor, cornerRadius: 0.6),
                             with: .color(GaryColors.warmWhite.opacity((0.45 - 0.32 * medge) * quarterDim)))
                }
                // The number, gold and larger as it reaches the needle.
                if onTape {
                    let label = Text(self.label(whole)).font(GaryFonts.display(15 + 8 * near))
                        .foregroundColor(near > 0.5 ? GaryColors.gold : GaryColors.warmWhite.opacity(0.78 - 0.48 * edge))
                    ctx.draw(label, at: CGPoint(x: wx, y: 44), anchor: .center)
                }
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

// MARK: - A club's games (the game pick's yardstick)

/// One of a club's games from its own side (`get_team_games`): the date, home
/// or away, the opponent and its letters, its score and theirs, and whether
/// the game is this season's (the NFL's log runs across two).
struct TeamGame: Decodable {
    let d: String?
    let home: Bool?
    let opp: String?
    let oa: String?
    let f: Int
    let a: Int
    let cur: Bool?

    var margin: Double { Double(f - a) }
    var total: Double { Double(f + a) }
    /// "@ATH" on the road, "ATH" at home.
    var axis: String { ((home ?? false) ? "" : "@") + (oa ?? String((opp ?? "").prefix(3)).uppercased()) }
    /// "9/23".
    var shortDate: String? {
        guard let d, d.count >= 10 else { return nil }
        let m = Int(d.dropFirst(5).prefix(2)) ?? 0, day = Int(d.dropFirst(8).prefix(2)) ?? 0
        return m > 0 && day > 0 ? "\(m)/\(day)" : nil
    }
}

extension SupabaseAPI {
    /// A club's games, newest first; empty when the read fails.
    static func fetchTeamGames(league: String, team: String) async -> [TeamGame] {
        guard let data = try? await WinnersAccessStore.request("rest/v1/rpc/get_team_games", body: ["p_league": league, "p_team": team]) else { return [] }
        return (try? JSONDecoder().decode([TeamGame].self, from: data)) ?? []
    }
}

/// A game pick on the yardstick (founder, Sep 24 2026: "the props breakdown
/// view look of that whole page... is what I want to see for the game
/// picks"). The prop panel reads a player's games against his line; this
/// reads the picked club's games against the ticket: for a side, what it won
/// or lost by against the margin the ticket needs; for a total, the runs or
/// points in its games against the number. The ruler opens on the ticket and
/// slides; the windows count the games that got there; the bars show them.
struct GameLogPanel: View {
    enum Measure: Equatable { case margin, total }
    /// Newest first, as the server sends them.
    let games: [TeamGame]
    let measure: Measure
    let league: String
    /// The ticket's price, shown while the ruler sits on the ticket's mark.
    let price: String?
    private let opening: LogMark
    @State private var mark: LogMark
    @State private var window: LogWindow

    init(games: [TeamGame], measure: Measure, league: String, opening: LogMark, price: String?) {
        self.games = games
        self.measure = measure
        self.league = league
        self.opening = opening
        self.price = price
        _mark = State(initialValue: opening)
        _window = State(initialValue: .last10)
    }

    /// The ticket's mark: a moneyline needs a win (1+), a side at -1.5 a win
    /// by 2+, one at +6.5 no worse than a 6-point loss; a total, the line's
    /// next whole number over, or at most the one under it.
    static func opening(for pick: GaryPick) -> (Measure, LogMark) {
        let body = LabFormat.ticketBody(pick.pick ?? "").lowercased()
        if body.hasPrefix("over") || body.contains(" over "), let t = LabFormat.number(after: "over", in: body) {
            return (.total, LogMark.from(line: t, under: false))
        }
        if body.hasPrefix("under") || body.contains(" under "), let t = LabFormat.number(after: "under", in: body) {
            return (.total, LogMark.from(line: t, under: true))
        }
        if body.contains(" ml") || (pick.type ?? "").lowercased().contains("money") { return (.margin, LogMark(value: 1)) }
        let spread = pick.spread ?? body.range(of: #"[+-]\d+(\.\d+)?"#, options: .regularExpression).flatMap { Double(body[$0]) }
        guard let spread else { return (.margin, LogMark(value: 1)) }
        return (.margin, LogMark(value: Int((-spread).rounded(.down)) + 1))
    }

    private var chrono: [TeamGame] { Array(games.reversed()) }
    private var season: [TeamGame] { chrono.filter { $0.cur ?? true } }
    private func value(_ g: TeamGame) -> Double { measure == .margin ? g.margin : g.total }
    private func clears(_ v: Double) -> Bool { measure == .margin ? v >= Double(mark.value) : mark.clears(v) }
    private var football: Bool { league.uppercased() != "MLB" }

    private var windows: [LogWindow] {
        var out = LogWindow.allCases.filter { w in w.games.map { chrono.count >= $0 } ?? false }
        let longest = out.compactMap { $0.games }.max() ?? 0
        if season.count > longest { out.append(.season) }
        return out
    }
    private var shownWindow: LogWindow { windows.contains(window) ? window : (windows.last ?? .last10) }
    private func slice(_ w: LogWindow) -> [TeamGame] { w.games.map { Array(chrono.suffix($0)) } ?? season }
    private func tally(_ w: LogWindow) -> (hit: Int, of: Int)? {
        let s = slice(w)
        guard !s.isEmpty else { return nil }
        return (s.filter { clears(value($0)) }.count, s.count)
    }

    private var words: String {
        let v = mark.value
        switch measure {
        case .margin:
            if v >= 2 { return "WIN BY \(v)+" }
            if v == 1 { return "WIN" }
            if v == 0 { return "WIN OR TIE" }
            if v == -1 { return "WIN OR LOSE BY 1" }
            return "WIN OR LOSE BY \(-v) OR LESS"
        case .total:
            let noun = football ? "POINTS" : "RUNS"
            return mark.under ? (v == 0 ? "NO \(noun)" : "\(v) OR FEWER \(noun)") : "\(v)+ \(noun)"
        }
    }

    private var range: ClosedRange<Int> {
        switch measure {
        case .margin:
            let top = football ? max(21, opening.value + 7) : max(8, opening.value + 4)
            return min(opening.value, 1)...top
        case .total:
            let most = Int(chrono.map(\.total).max() ?? 0)
            return mark.under ? 0...max(most, opening.value + 4) : 1...max(most, opening.value + 4)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GaryRuler(value: $mark.value, range: range, name: measure == .margin ? "Margin" : "Total",
                      spoken: { v in
                          var m = mark; m.value = v
                          return GameLogPanel.spokenWords(m, measure: measure, football: football)
                      },
                      label: { "\($0)" })
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(words).font(GaryFonts.display(22)).tracking(0.6).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                if mark == opening, let price { Text(price).font(GaryFonts.display(20)).foregroundStyle(GaryColors.gold).monospacedDigit() }
            }
            LogWindowTabs(items: windows.map { ($0, tally($0)) }, selected: Binding(get: { shownWindow }, set: { window = $0 }))
            if shownWindow == .season {
                LogBarsChart(bars: seasonBars)
            } else if measure == .margin {
                MarginBarsChart(bars: bars, rule: Double(mark.value) - 0.5)
            } else {
                LogBarsChart(bars: bars, rule: mark.line)
            }
        }
    }

    private static func spokenWords(_ mark: LogMark, measure: Measure, football: Bool) -> String {
        let v = mark.value
        if measure == .margin {
            if v >= 2 { return "win by \(v) or more" }
            if v == 1 { return "win" }
            if v == 0 { return "win or tie" }
            return "win or lose by \(-v) or less"
        }
        let noun = football ? "points" : "runs"
        return mark.under ? "\(v) or fewer \(noun)" : "\(v) or more \(noun)"
    }

    private var bars: [LogBar] {
        let s = slice(shownWindow)
        let n = s.count
        return s.enumerated().map { i, g in
            LogBar(id: i, value: value(g), top: measure == .margin ? "\(g.f)-\(g.a)" : "\(Int(g.total))",
                   axis: n <= 10 ? g.axis : nil, sub: n <= 5 ? g.shortDate : nil, clears: clears(value(g)))
        }
    }

    /// The season as a spread, the way the prop panel draws it: games at each
    /// margin (or total), the ends gathered, football in touchdown-wide bins.
    private var seasonBars: [LogBar] {
        let values = season.map(value)
        guard !values.isEmpty else { return [] }
        let width = football ? 7.0 : 1.0
        let cap = measure == .margin ? (football ? 21.0 : 5.0) : nil
        var buckets: [Double: Int] = [:]
        for v in values {
            var b = (v / width).rounded(.down) * width
            if let cap { b = min(max(b, -cap), cap) }
            if measure == .margin, !football, b == 0 { b = v > 0 ? 1 : -1 }
            buckets[b, default: 0] += 1
        }
        let keys = buckets.keys.sorted()
        return keys.enumerated().map { i, k in
            let label: String = {
                if let cap, k == cap { return "\(Int(k))+" }
                if let cap, k == -cap { return "≤\(Int(k))" }
                if width > 1 { return k >= 0 ? "+\(Int(k))" : "\(Int(k))" }
                return measure == .margin && k > 0 ? "+\(Int(k))" : "\(Int(k))"
            }()
            return LogBar(id: i, value: Double(buckets[k] ?? 0), top: "\(buckets[k] ?? 0)", axis: label, clears: clears(k))
        }
    }
}

/// Bars that go up for a win and down for a loss, from a line at zero: the
/// game's score over each, the dashed line at the margin the ticket needs.
struct MarginBarsChart: View {
    let bars: [LogBar]
    var rule: Double? = nil
    var height: CGFloat = 176

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
            let pad: CGFloat = 16
            let plotH = max(geo.size.height - axisH - pad * 2, 10)
            let hi = max(bars.map(\.value).max() ?? 1, (rule ?? 0) + 0.5, 1)
            let lo = min(bars.map(\.value).min() ?? -1, (rule ?? 0) - 0.5, -1)
            let yOf: (Double) -> CGFloat = { v in pad + CGFloat((hi - v) / (hi - lo)) * plotH }
            let zeroY = yOf(0)
            ZStack(alignment: .topLeading) {
                Rectangle().fill(GaryColors.warmWhite.opacity(0.18)).frame(width: plotW, height: 1).offset(y: zeroY)
                ForEach(bars) { b in
                    let x = x0 + CGFloat(b.id) * (barW + gap)
                    let top = yOf(max(b.value, 0)), bottom = yOf(min(b.value, 0))
                    let h = max(bottom - top, 2)
                    RoundedRectangle(cornerRadius: min(3, barW / 3), style: .continuous)
                        .fill(b.clears ? GaryColors.win : GaryColors.loss.opacity(0.78))
                        .frame(width: barW, height: h)
                        .offset(x: x, y: b.value >= 0 ? zeroY - h : zeroY)
                    Text(b.top)
                        .font(GaryFonts.kicker(n > 12 ? 8.5 : 10, .semibold))
                        .foregroundStyle(GaryColors.warmWhite.opacity(0.82))
                        .fixedSize()
                        .frame(width: barW + gap)
                        .offset(x: x - gap / 2, y: b.value >= 0 ? zeroY - h - 14 : zeroY + h + 2)
                    if hasAxis, let axis = b.axis {
                        VStack(spacing: 1) {
                            Text(axis).font(GaryFonts.kicker(8.5, .semibold)).foregroundStyle(LabInk.dim).fixedSize()
                            if let sub = b.sub { Text(sub).font(GaryFonts.kicker(8, .medium)).foregroundStyle(LabInk.dimmer).fixedSize() }
                        }
                        .frame(width: barW + gap)
                        .offset(x: x - gap / 2, y: pad * 2 + plotH + 3)
                    }
                }
                if let rule {
                    DashedRule()
                        .stroke(GaryColors.gold.opacity(0.9), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .frame(width: plotW, height: 1)
                        .offset(y: yOf(rule))
                    Text(rule > 0 ? "+\(LabFormat.trim(rule))" : LabFormat.trim(rule))
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
