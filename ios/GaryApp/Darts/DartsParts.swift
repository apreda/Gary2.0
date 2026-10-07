import SwiftUI
import Charts
import UIKit
import UIKit.UIGestureRecognizerSubclass

// The pieces of the Darts page (founder, Sep 23 2026: "do it your way for
// real"). Taken from the 25 mocks: Gary's record as a number over a chart
// (Portfolio), and the tape across the top, which now carries what Gary hit
// yesterday instead of the league's streaks (founder, Sep 24 2026).
// The dartboard, the player streak columns and the win/loss map live in
// DartsBoard.swift.

/// A full name split the way a fan says it: "Fernando Tatis Jr." is Fernando
/// and Tatis Jr.; "Elly De La Cruz" is Elly and De La Cruz; "Amon-Ra St. Brown"
/// is Amon-Ra and St. Brown.
enum PlayerName {
    private static let suffixes: Set<String> = ["jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "v"]
    private static let particles: Set<String> = ["st.", "st", "de", "la", "del", "della", "da", "dos", "van", "von", "der", "le", "di", "du", "mc"]

    static func split(_ full: String) -> (first: String?, last: String) {
        let parts = full.split(separator: " ").map(String.init)
        guard parts.count > 1 else { return (nil, full) }
        var cut = parts.count - 1
        if suffixes.contains(parts[cut].lowercased()), cut > 1 { cut -= 1 }
        while cut > 1, particles.contains(parts[cut - 1].lowercased()) { cut -= 1 }
        return (parts[..<cut].joined(separator: " "), parts[cut...].joined(separator: " "))
    }
}

extension DartRow {
    /// "Rays at Yankees · 7:05 PM", "Packers vs Falcons · Thu 8:15 PM".
    var gameLine: String {
        var bits: [String] = []
        if let teams = gameTeams, let team {
            let mine = LabFormat.nickname(team)
            if mine == teams.away { bits.append("\(mine) at \(teams.home)") }
            else if mine == teams.home { bits.append("\(mine) vs \(teams.away)") }
            else { bits.append(mine) }
        } else if let team {
            bits.append(LabFormat.nickname(team))
        }
        var time = LabFormat.timeET(commence_time)
        if league == "NFL", let d = LabFormat.parseISO(commence_time) {
            let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "EEE"
            time = "\(f.string(from: d)) \(time)"
        }
        if !time.isEmpty { bits.append(LabFormat.keepTimeTogether(time)) }
        return bits.joined(separator: " · ")
    }
    /// The side and the line on a lined dart ("OVER 64.5", "UNDER 1.5").
    var lineWords: String? {
        guard ["hrr", "tb", "recyds", "rushyds", "passtd", "int"].contains(kind), let line = LabFormat.trailingNumber(prop) else { return nil }
        return "\((bet ?? "over").lowercased() == "under" ? "UNDER" : "OVER") \(line)"
    }
    var scratchWord: String { (scratch_reason ?? "").contains("postpon") ? "POSTPONED" : "SCRATCHED" }
}

// MARK: - Gary's record

/// Gary's record as a number over its chart, the window picked in text.
struct GaryRecordPanel: View {
    let league: String
    let run: DartsRun
    let today: String
    @State private var span = "14D"
    private static let spans = ["7D", "14D", "30D"]

    private struct Point: Identifiable { let date: Date; let net: Int; let running: Int; var id: Date { date } }

    private var days: [DartsRun.Day] {
        let n = Int(span.dropLast()) ?? 14
        // A rolling window includes today's settled picks as they arrive.
        let first = LabFormat.dayOffset(today, -(n - 1))
        return (run.daily ?? []).filter { ($0.league ?? "") == league && ($0.date ?? "") >= first && ($0.date ?? "") <= today }
            .sorted { ($0.date ?? "") < ($1.date ?? "") }
    }
    private var points: [Point] {
        var total = 0
        return days.compactMap { d in
            guard let ymd = d.date, let date = LabFormat.ymdDate(ymd) else { return nil }
            let net = (d.won ?? 0) - (d.lost ?? 0)
            total += net
            return Point(date: date, net: net, running: total)
        }
    }

    var body: some View {
        let won = days.reduce(0) { $0 + ($1.won ?? 0) }
        let lost = days.reduce(0) { $0 + ($1.lost ?? 0) }
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 22, height: 22)
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                Text("GARY").font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold)
                Spacer(minLength: 8)
                LabTextTabs(items: Self.spans, selected: $span, size: 13).fixedSize()
            }
            if won + lost > 0 {
                Text("\(won)-\(lost)").font(GaryFonts.display(52))
                    .foregroundStyle(won > lost ? GaryColors.win : won < lost ? GaryColors.loss : GaryColors.warmWhite)
                    .monospacedDigit()
                chart
            } else {
                Text("No games yet.").font(GaryFonts.ui(13, .medium)).foregroundStyle(LabInk.dim)
            }
        }
    }

    private var chart: some View {
        Chart {
            RuleMark(y: .value("Even", 0)).foregroundStyle(LabInk.hair)
            ForEach(points) { p in
                BarMark(x: .value("Day", p.date, unit: .day), y: .value("Day's net", p.net), width: .ratio(0.55))
                    .foregroundStyle(p.net >= 0 ? GaryColors.win.opacity(0.55) : GaryColors.loss.opacity(0.55))
            }
            ForEach(points) { p in
                LineMark(x: .value("Day", p.date, unit: .day), y: .value("Running", p.running))
                    .foregroundStyle(GaryColors.gold)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 110)
        .accessibilityLabel("Gary's record day by day")
    }
}

extension LabFormat {
    /// "at Cowboys · Sun 4:25 PM ET" with "4:25 PM ET" bound into one piece,
    /// so a time never breaks across two lines.
    static func keepTimeTogether(_ s: String) -> String {
        s.replacingOccurrences(of: " PM", with: "\u{00A0}PM")
         .replacingOccurrences(of: " AM", with: "\u{00A0}AM")
         .replacingOccurrences(of: " ET", with: "\u{00A0}ET")
    }
    /// A prop line as a fan reads it: 221.5 stays 221.5, 3.0 is 3.
    static func lineWords(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }
    /// "2026-09-23" → a date in ET.
    static func ymdDate(_ ymd: String) -> Date? {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "yyyy-MM-dd"
        return f.date(from: ymd)
    }
    /// A calendar day `days` from `ymd`, as "yyyy-MM-dd".
    static func dayOffset(_ ymd: String, _ days: Int) -> String {
        guard let d = ymdDate(ymd) else { return ymd }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "America/New_York")!
        let moved = cal.date(byAdding: .day, value: days, to: d) ?? d
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: moved)
    }
}


// MARK: - Yesterday Gary hit

/// YESTERDAY GARY HIT (founder, Sep 23 2026: "Yesterday, Gary hit," changing
/// every 5 seconds). His leans that landed, one at a time; never a tally.
/// YESTERDAY GARY HIT, as a tape across the very top of the page (founder,
/// Sep 24 2026: "bring back the ticker at the top... have it be the
/// 'Yesterday Gary hit' part"). The title rides the tape ahead of the hits, so
/// every hit crosses the whole width and reads in full before it leaves (his
/// note the same morning: a fixed title left too little room, and the hits
/// faded out before they could be read). Every name opens its card. Reduce
/// Motion holds it still.
struct HitsTape: View {
    let title: String
    let hits: [DartHit]
    let onHit: (DartHit) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    /// Taps reach the latest `onHit` through this holder, so the kept strip never calls a stale one.
    @State private var tap = HitsTapeTap()
    private let speed: Double = 22     // points a second

    var body: some View {
        let _ = { tap.onHit = onHit }()
        return Group {
            if reduceMotion || voiceOver {
                ScrollView(.horizontal, showsIndicators: false) { strip.padding(.horizontal, GaryLayout.gutter) }
            } else {
                // The tape moves on Core Animation (MarqueeTape, Oct 7 2026): the main thread is idle while it
                // runs. A hidden tab stays mounted, so the tape stops itself off screen.
                MarqueeTape(lap: strip, lapKey: stripKey, gap: 0, speed: speed, running: activePage && scenePhase == .active)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(height: 42)
        .overlay(alignment: .top) { LabHairline() }
        .overlay(alignment: .bottom) { LabHairline() }
    }

    /// What the tape shows; a new key rebuilds the moving strip.
    private var stripKey: String {
        ([title] + hits.map { h in
            [String(h.id), h.kind, h.player, h.bet ?? "", h.odds.map(String.init) ?? "", h.actual?.value.map { String($0) } ?? "", h.line?.value.map { String($0) } ?? ""].joined(separator: "|")
        }).joined(separator: "\n")
    }

    /// One lap of the tape (Oct 7 2026: rebuilding two strips 30 times a second held the Darts page's main
    /// thread 34% busy with nobody touching it). Equal while it shows the same hits.
    private var strip: some View {
        HitsTapeStrip(title: title, hits: hits, tap: tap).equatable()
    }
}

/// Holds the tape's current tap handler (HitsTape refreshes it every time it is rebuilt).
final class HitsTapeTap {
    var onHit: (DartHit) -> Void = { _ in }
}

/// The tape's content: the title, then each hit with its price. Equal when it shows the same hits.
private struct HitsTapeStrip: View, Equatable {
    let title: String
    let hits: [DartHit]
    let tap: HitsTapeTap

    static func == (a: HitsTapeStrip, b: HitsTapeStrip) -> Bool {
        a.title == b.title && a.hits.count == b.hits.count && zip(a.hits, b.hits).allSatisfy { x, y in
            x.id == y.id && x.kind == y.kind && x.player == y.player && x.odds == y.odds
                && x.actual?.value == y.actual?.value && x.line?.value == y.line?.value && x.bet == y.bet
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            Text(title)
                .font(GaryFonts.mono(9.5, bold: true)).tracking(1.2)
                .foregroundStyle(GaryColors.gold)
                .fixedSize()
                .frame(height: 42)
                .padding(.leading, 18).padding(.trailing, 6)
                .accessibilityAddTraits(.isHeader)
            ForEach(hits) { hit in
                Button { tap.onHit(hit) } label: {
                    HStack(spacing: 7) {
                        Text(hit.tapeWords).font(GaryFonts.ui(13, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        if let odds = hit.odds {
                            Text(LabFormat.price(odds)).font(GaryFonts.kicker(12.5, .semibold)).foregroundStyle(GaryColors.win)
                        }
                    }
                    .fixedSize()
                    .frame(height: 42)
                    .padding(.leading, 12).padding(.trailing, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(hit.tapeWords)\(hit.odds.map { ", " + LabFormat.price($0) } ?? "")")
            }
        }
    }
}

extension DartHit {
    /// "MATT OLSON HOMERED", "FERNANDO TATIS JR. · 3 HITS".
    var tapeWords: String { YesterdayWords.words(self) }
}

/// How a hit reads on the tape.
enum YesterdayWords {
    static func words(_ hit: DartHit) -> String {
        let name = hit.player.uppercased()
        let n = hit.actual?.value.map { String(Int($0)) }
        switch hit.kind {
        case "parlay": return name
        case "hr": return "\(name) HOMERED"
        case "hrr": return n.map { "\(name) · \($0) H+R+RBI" } ?? name
        case "tb": return n.map { "\(name) · \($0) TOTAL BASES" } ?? name
        // Retired Oct 1 2026; its darts still read on the tape.
        case "multihit": return n.map { "\(name) · \($0) HITS" } ?? "\(name) · 2+ HITS"
        case "hits_run": return "\(name) · HITS AND A RUN"
        case "first_inning":
            return hit.bet == "under" ? "\(name) · NO RUN IN THE 1ST" : "\(name) · RUN IN THE 1ST"
        case "td", "tetd": return "\(name) SCORED"
        case "qbtd": return "\(name) RAN ONE IN"
        case "ftd": return "\(name) SCORED FIRST"
        case "recyds": return n.map { "\(name) · \($0) REC YDS" } ?? name
        case "rushyds": return n.map { "\(name) · \($0) RUSH YDS" } ?? name
        case "passtd": return n.map { "\(name) · \($0) TD PASSES" } ?? name
        case "int": return hit.bet == "under" ? "\(name) · NO PICKS" : "\(name) THREW A PICK"
        // Last week's NFL props.
        case "anytime_td": return "\(name) SCORED"
        default:
            guard let line = hit.line?.value else { return name }
            let side = hit.bet == "under" ? "UNDER" : "OVER"
            return "\(name) · \(side) \(LabFormat.lineWords(line)) \(Self.statWords(hit.kind))"
        }
    }

    /// "receiving_yards" → "REC YDS".
    static func statWords(_ kind: String) -> String {
        switch kind {
        case "receiving_yards": return "REC YDS"
        case "rushing_yards": return "RUSH YDS"
        case "passing_yards": return "PASS YDS"
        case "receptions": return "CATCHES"
        case "rushing_attempts": return "CARRIES"
        case "passing_attempts": return "PASS ATTEMPTS"
        case "passing_tds": return "TD PASSES"
        case "passing_completions": return "COMPLETIONS"
        case "interceptions": return "INTERCEPTIONS"
        default: return kind.replacingOccurrences(of: "_", with: " ").uppercased()
        }
    }
}


// MARK: - The moving tape

/// A strip that slides left forever, moved by Core Animation instead of SwiftUI (founder, Oct 7 2026: "do the full
/// fix, as long as it doesn't do anything but improve the app"). SwiftUI moving the strip every frame held the
/// Darts page's main thread a quarter to a third busy; here the system's animation server moves it and the main
/// thread rests. The lap is built once and a second copy follows it for a seamless loop. A finger on the tape
/// holds it still under the finger, so a tap lands on exactly what is shown, and it moves on when the finger
/// lifts. Used by the Darts hits tape and the Winners results ticker.
struct MarqueeTape<Lap: View>: UIViewRepresentable {
    let lap: Lap
    /// Changes when the lap shows something different: the strip is rebuilt and measured again.
    let lapKey: AnyHashable
    /// Space between one lap and the next.
    let gap: CGFloat
    /// Points a second.
    let speed: Double
    let running: Bool
    /// Hold under a finger (the lap has buttons). A tape without buttons lets touches pass through.
    var holdsUnderFinger = true

    func makeUIView(context: Context) -> MarqueeTapeView { MarqueeTapeView() }

    func updateUIView(_ view: MarqueeTapeView, context: Context) {
        view.holdsUnderFinger = holdsUnderFinger
        view.update(lap: AnyView(lap), key: lapKey, gap: gap, speed: speed)
        view.setRunning(running)
    }
}

final class MarqueeTapeView: UIView, UIGestureRecognizerDelegate {
    var holdsUnderFinger = true
    private let track = UIView()
    private var hosts: [UIHostingController<AnyView>] = []
    private var key: AnyHashable?
    private var lapWidth: CGFloat = 0
    private var gap: CGFloat = 0
    private var speed: Double = 1
    private var running = false
    private var moving = false
    private var held = false
    /// How far into the current lap the tape stands when it is not moving.
    private var phase: CGFloat = 0
    private var resume: DispatchWorkItem?
    private static let animationKey = "gary.marquee"

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        backgroundColor = .clear
        track.backgroundColor = .clear
        addSubview(track)
        let watcher = MarqueeTouchWatcher(target: nil, action: nil)
        watcher.onBegin = { [weak self] in self?.resume?.cancel() }
        watcher.onEnd = { [weak self] in self?.resumeSoon(after: 0.4) }
        watcher.cancelsTouchesInView = false
        watcher.delaysTouchesBegan = false
        watcher.delaysTouchesEnded = false
        watcher.delegate = self
        addGestureRecognizer(watcher)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private var cycle: CGFloat { lapWidth + gap }

    func update(lap: AnyView, key newKey: AnyHashable, gap newGap: CGFloat, speed newSpeed: Double) {
        speed = max(newSpeed, 1)
        guard newKey != key || newGap != gap || hosts.isEmpty else { return }
        key = newKey
        gap = newGap
        if hosts.isEmpty {
            for index in 0..<2 {
                let host = UIHostingController(rootView: lap)
                host.view.backgroundColor = .clear
                if #available(iOS 16.4, *) { host.safeAreaRegions = [] }
                host.view.accessibilityElementsHidden = index == 1
                track.addSubview(host.view)
                hosts.append(host)
            }
        } else {
            hosts.forEach { $0.rootView = lap }
        }
        let fit = hosts[0].sizeThatFits(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
        lapWidth = ceil(fit.width)
        // A new lap starts at its beginning.
        stopMoving()
        phase = 0
        track.transform = .identity
        setNeedsLayout()
        layoutIfNeeded()
        startIfNeeded()
    }

    func setRunning(_ isRunning: Bool) {
        running = isRunning
        if isRunning { startIfNeeded() } else { stopMoving() }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let height = bounds.height
        track.bounds = CGRect(x: 0, y: 0, width: max(cycle * 2, bounds.width), height: height)
        track.center = CGPoint(x: track.bounds.width / 2, y: height / 2)
        for (index, host) in hosts.enumerated() {
            host.view.frame = CGRect(x: CGFloat(index) * cycle, y: 0, width: lapWidth, height: height)
        }
        startIfNeeded()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { stopMoving() } else { startIfNeeded() }
    }

    private func startIfNeeded() {
        guard running, !held, !moving, window != nil, lapWidth > 0, bounds.width > 0, bounds.height > 0 else { return }
        let start = -phase
        let animation = CABasicAnimation(keyPath: "transform.translation.x")
        animation.fromValue = start
        animation.toValue = start - cycle
        animation.duration = Double(cycle) / speed
        animation.repeatCount = .infinity
        animation.timingFunction = CAMediaTimingFunction(name: .linear)
        animation.isRemovedOnCompletion = false
        track.transform = CGAffineTransform(translationX: start, y: 0)
        track.layer.add(animation, forKey: Self.animationKey)
        moving = true
    }

    /// Stops the tape where it is on screen.
    private func stopMoving() {
        guard moving else { return }
        let shown = (track.layer.presentation()?.value(forKeyPath: "transform.translation.x") as? NSNumber)?.doubleValue
        if let shown, cycle > 0 {
            var p = CGFloat(-shown).truncatingRemainder(dividingBy: cycle)
            if p < 0 { p += cycle }
            phase = p
        }
        track.layer.removeAnimation(forKey: Self.animationKey)
        track.transform = CGAffineTransform(translationX: -phase, y: 0)
        moving = false
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard holdsUnderFinger else { return nil }
        guard self.point(inside: point, with: event) else { return nil }
        if moving, event?.type == .touches {
            stopMoving()
            held = true
            // A touch that never arrives must not leave the tape standing.
            resumeSoon(after: 1.0)
        }
        return super.hitTest(point, with: event)
    }

    private func resumeSoon(after seconds: Double) {
        resume?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.held = false
            self.startIfNeeded()
        }
        resume = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
}

/// Watches a finger on the tape without taking the touch from the buttons under it.
private final class MarqueeTouchWatcher: UIGestureRecognizer {
    var onBegin: (() -> Void)?
    var onEnd: (() -> Void)?
    private var tracking = false

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        tracking = true
        onBegin?()
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) { state = .failed }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) { state = .failed }
    override func reset() {
        super.reset()
        if tracking { tracking = false; onEnd?() }
    }
}

