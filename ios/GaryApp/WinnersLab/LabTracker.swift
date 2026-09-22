import SwiftUI

// THE WINNERS LAB — live trackers. A prop runs against its line; a game runs
// against the number. Pregame the tracker counts down to the seal.

struct LabPropTracker: View {
    let line: Double
    let isUnder: Bool
    let value: Double?
    let started: Bool
    let isFinal: Bool
    let result: String?      // won | lost | push | nil
    let unit: String

    private var onRightSide: Bool? {
        guard let value else { return nil }
        if value == line { return nil }
        return isUnder ? value < line : value > line
    }
    private var tint: Color {
        if let result { return result == "won" ? GaryColors.win : result == "lost" ? GaryColors.loss : GaryColors.silver }
        guard started else { return LabInk.dimmer }
        guard let side = onRightSide else { return GaryColors.silver }
        return side ? GaryColors.win : GaryColors.sweating
    }
    private var stateText: (String, Color, Bool) {
        if let result, !result.isEmpty {
            return result == "won" ? ("Win", GaryColors.win, false) : result == "lost" ? ("Loss", GaryColors.loss, false) : ("Push", GaryColors.silver, false)
        }
        if isFinal { return ("Final", GaryColors.silver, false) }
        if started { return ("Live", GaryColors.sweating, true) }
        return ("Sealed", GaryColors.gold, false)
    }
    private var caption: String {
        guard started || result != nil, let value else { return isUnder ? "Needs to stay under \(LabFormat.trim(line))" : "Needs \(LabFormat.trim(line)) or more" }
        let gap = abs(value - line)
        if value == line { return "Sitting on the number" }
        if isUnder {
            return value < line ? "Under by \(LabFormat.trim(gap))" : "Over the number by \(LabFormat.trim(gap))"
        }
        return value > line ? "Cleared by \(LabFormat.trim(gap))" : "Needs \(LabFormat.trim(gap)) more"
    }

    var body: some View {
        let ceiling = max(line * 1.6, (value ?? 0) * 1.15, 1)
        let frac = min(max((value ?? 0) / ceiling, 0), 1)
        let lineFrac = min(max(line / ceiling, 0), 1)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(value.map { LabFormat.trim($0) } ?? "—")
                    .font(GaryFonts.display(46)).foregroundStyle(GaryColors.warmWhite).monospacedDigit()
                Text(unit).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                Spacer()
                LabStateWord(text: stateText.0, color: stateText.1, pulse: stateText.2, size: 18)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous).fill(LabInk.hair).frame(height: 8)
                    RoundedRectangle(cornerRadius: 3, style: .continuous).fill(tint)
                        .frame(width: max(0, geo.size.width * frac), height: 8)
                        .animation(.easeOut(duration: 0.6), value: frac)
                    Rectangle().fill(GaryColors.gold).frame(width: 2, height: 18)
                        .offset(x: max(0, geo.size.width * lineFrac - 1))
                }
                .frame(height: 18)
                .overlay(alignment: .topLeading) {
                    Text("LINE \(LabFormat.trim(line))")
                        .font(GaryFonts.display(11)).tracking(0.8).foregroundStyle(GaryColors.gold)
                        .offset(x: min(max(0, geo.size.width * lineFrac - 22), geo.size.width - 52), y: 20)
                }
            }
            .frame(height: 36)
            Text(caption).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
        }
    }
}

struct LabGameTracker: View {
    let pick: GaryPick
    let live: LiveScore?
    let outcome: WinnersPlay.Outcome?

    private enum Market { case spread(Double), moneyline, total(Double, over: Bool) }
    private var market: Market {
        let text = (pick.pick ?? "")
        let body = LabFormat.ticketBody(text).lowercased()
        if body.contains("over ") || body.hasPrefix("over"), let t = LabFormat.number(after: "over", in: body) { return .total(t, over: true) }
        if body.contains("under ") || body.hasPrefix("under"), let t = LabFormat.number(after: "under", in: body) { return .total(t, over: false) }
        if body.contains(" ml") || (pick.type ?? "").lowercased().contains("money") { return .moneyline }
        if let s = pick.spread { return .spread(s) }
        if let r = body.range(of: #"[+-]\d+(\.\d+)?"#, options: .regularExpression), let s = Double(body[r]) { return .spread(s) }
        return .moneyline
    }
    private var pickedHome: Bool { LabFormat.pickNames(pick.pick ?? "", team: pick.homeTeam ?? "") }
    private var scores: (away: Int, home: Int)? {
        if let live, live.isLive || live.isFinal, let a = live.away_score, let h = live.home_score { return (a, h) }
        if let outcome {
            if let a = outcome.away_score, let h = outcome.home_score { return (a, h) }
            if let s = outcome.final_score {
                let parts = s.split(separator: "-").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
                if parts.count == 2 { return (parts[0], parts[1]) }
            }
        }
        return nil
    }
    private var started: Bool { scores != nil }
    private var isFinal: Bool { (live?.isFinal ?? false) || outcome?.result != nil }
    /// Positive = on the right side of the number.
    private var margin: Double? {
        guard let s = scores else { return nil }
        let mine = Double(pickedHome ? s.home : s.away), theirs = Double(pickedHome ? s.away : s.home)
        switch market {
        case .spread(let line): return mine + line - theirs
        case .moneyline: return mine - theirs
        case .total(let line, let over): return over ? Double(s.away + s.home) - line : line - Double(s.away + s.home)
        }
    }
    private var caption: String {
        guard let m = margin else { return "Seals at \(LabFormat.timeET(pick.commence_time))" }
        let n = LabFormat.trim(abs(m))
        switch market {
        case .spread:
            if m == 0 { return "Pushing on the number" }
            return m > 0 ? "Covering by \(n)" : "Down \(n) against the number"
        case .moneyline:
            if m == 0 { return "Tied" }
            return m > 0 ? "Leading by \(n)" : "Trailing by \(n)"
        case .total(_, let over):
            if m == 0 { return "On the number" }
            return m > 0 ? (over ? "Over by \(n)" : "Under by \(n)") : "\(n) short of the number"
        }
    }
    private var stateText: (String, Color, Bool) {
        if let r = outcome?.result, !r.isEmpty {
            return r == "won" ? ("Win", GaryColors.win, false) : r == "lost" ? ("Loss", GaryColors.loss, false) : ("Push", GaryColors.silver, false)
        }
        if live?.isFinal == true { return ("Final", GaryColors.silver, false) }
        if live?.isLive == true { return ("Live", GaryColors.sweating, true) }
        if let label = live?.interruptionLabel { return (label.capitalized, GaryColors.sweating, false) }
        return ("Sealed", GaryColors.gold, false)
    }
    private var tint: Color {
        if let r = outcome?.result { return r == "won" ? GaryColors.win : r == "lost" ? GaryColors.loss : GaryColors.silver }
        guard let m = margin else { return LabInk.dimmer }
        return m > 0 ? GaryColors.win : m < 0 ? GaryColors.sweating : GaryColors.silver
    }
    private var scale: Double { (pick.league ?? "").uppercased() == "MLB" ? 6 : 17 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                if let s = scores {
                    Text("\(abbr(away: true)) \(s.away)").font(GaryFonts.display(40)).foregroundStyle(pickedHome ? LabInk.dim : GaryColors.warmWhite).monospacedDigit()
                    Text("\(abbr(away: false)) \(s.home)").font(GaryFonts.display(40)).foregroundStyle(pickedHome ? GaryColors.warmWhite : LabInk.dim).monospacedDigit()
                } else {
                    Text(LabFormat.timeET(pick.commence_time)).font(GaryFonts.display(40)).foregroundStyle(GaryColors.warmWhite)
                    LabCountdown(commence: pick.commence_time)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    LabStateWord(text: stateText.0, color: stateText.1, pulse: stateText.2, size: 18)
                    if let d = live?.detail, live?.isLive == true { Text(d).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim) }
                }
            }
            GeometryReader { geo in
                let half = geo.size.width / 2
                let m = margin ?? 0
                let frac = min(max(m / scale, -1), 1)
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous).fill(LabInk.hair).frame(height: 8)
                    RoundedRectangle(cornerRadius: 3, style: .continuous).fill(tint)
                        .frame(width: max(2, abs(frac) * half), height: 8)
                        .offset(x: frac >= 0 ? half : half - abs(frac) * half)
                        .animation(.easeOut(duration: 0.6), value: frac)
                    Rectangle().fill(GaryColors.gold).frame(width: 2, height: 18).offset(x: half - 1)
                }
                .frame(height: 18)
            }
            .frame(height: 18)
            Text(caption).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
        }
    }

    private func abbr(away: Bool) -> String {
        if let live, let a = away ? live.away_abbr : live.home_abbr, !a.isEmpty { return a.uppercased() }
        let name = (away ? pick.awayTeam : pick.homeTeam) ?? ""
        if let short = away ? pick.awayTeamAbbreviation : pick.homeTeamAbbreviation, !short.isEmpty { return short.uppercased() }
        return String(name.split(separator: " ").last ?? Substring(name)).uppercased()
    }
}

/// "Seals in 35 min", refreshed twice a minute; empty once the game has started.
struct LabCountdown: View {
    let commence: String?
    var prefix: String = "seals"
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            if let text = LabFormat.countdown(to: commence, now: context.date) {
                Text("\(prefix) \(text)").font(GaryFonts.ui(12, .semibold)).foregroundStyle(GaryColors.gold.opacity(0.85))
            }
        }
    }
}

extension LabFormat {
    static func trim(_ v: Double) -> String {
        if abs(v - v.rounded()) < 0.001 { return String(Int(v.rounded())) }
        return String(format: "%.1f", v)
    }
    static func number(after word: String, in text: String) -> Double? {
        guard let r = text.range(of: word) else { return nil }
        let rest = text[r.upperBound...]
        guard let n = rest.range(of: #"\d+(\.\d+)?"#, options: .regularExpression) else { return nil }
        return Double(rest[n])
    }
}
