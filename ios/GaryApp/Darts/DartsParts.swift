import SwiftUI
import Charts

// The pieces of the Darts page (founder, Sep 23 2026: "do it your way for
// real"). Taken from the 25 mocks: Gary's record as a number over a chart
// (Portfolio). The streak tape across the top is gone (founder, Sep 24 2026).
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
    /// The line on a yards or passing touchdowns dart ("OVER 64.5").
    var lineWords: String? {
        guard kind == "recyds" || kind == "passtd", let line = LabFormat.trailingNumber(prop) else { return nil }
        return "OVER \(line)"
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
        let first = LabFormat.dayOffset(today, -n)
        return (run.daily ?? []).filter { ($0.league ?? "") == league && ($0.date ?? "") >= first && ($0.date ?? "") < today }
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
struct YesterdayHits: View {
    var title = "YESTERDAY GARY HIT"
    let hits: [DartHit]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @State private var index = 0

    var body: some View {
        let hit = hits[index % hits.count]
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(GaryFonts.mono(9.5, bold: true)).tracking(1.2)
                .foregroundStyle(GaryColors.gold)
            // One line, always the same height, so the page never jumps when
            // the next hit comes up; a long one shrinks to fit, never wraps.
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(Self.words(hit))
                    .font(GaryFonts.display(22))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.5)
                if let odds = hit.odds {
                    Text(LabFormat.price(odds)).font(GaryFonts.data(14, .semibold)).foregroundStyle(GaryColors.win).fixedSize()
                }
                Spacer(minLength: 0)
            }
            .frame(height: 30, alignment: .leading)
            .id(hit.id)
            .transition(reduceMotion ? .opacity : .asymmetric(
                insertion: .move(edge: .bottom).combined(with: .opacity),
                removal: .move(edge: .top).combined(with: .opacity)))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
        .accessibilityElement(children: .combine)
        .onReceive(Timer.publish(every: 5, on: .main, in: .common).autoconnect()) { _ in
            guard hits.count > 1, activePage, scenePhase == .active else { return }
            withAnimation(.easeInOut(duration: 0.35)) { index = (index + 1) % hits.count }
        }
    }

    static func words(_ hit: DartHit) -> String {
        let name = hit.player.uppercased()
        let n = hit.actual?.value.map { String(Int($0)) }
        switch hit.kind {
        case "hr": return "\(name) HOMERED"
        case "multihit": return n.map { "\(name) · \($0) HITS" } ?? "\(name) · 2+ HITS"
        case "hits_run": return "\(name) · HITS AND A RUN"
        case "first_inning":
            return hit.bet == "under" ? "\(name) · NO RUN IN THE 1ST" : "\(name) · RUN IN THE 1ST"
        case "td", "tetd": return "\(name) SCORED"
        case "qbtd": return "\(name) RAN ONE IN"
        case "ftd": return "\(name) SCORED FIRST"
        case "recyds": return n.map { "\(name) · \($0) REC YDS" } ?? name
        case "passtd": return n.map { "\(name) · \($0) TD PASSES" } ?? name
        case "int": return "\(name) THREW A PICK"
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
