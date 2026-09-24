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
        guard started || result != nil, let value else { return "" }
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
                Text(value.map { LabFormat.trim($0) } ?? LabFormat.trim(line))
                    .font(GaryFonts.display(46)).foregroundStyle(value == nil ? GaryColors.silver : GaryColors.warmWhite).monospacedDigit()
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
            if !caption.isEmpty { Text(caption).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim) }
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
        guard let m = margin else { return "" }
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
            if !caption.isEmpty { Text(caption).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim) }
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


// MARK: - The yardstick

/// A ruler with a mark where the number opened and a mark where it sits now
/// (founder, Sep 22 2026: "a yardstick-looking design where you can clearly
/// see where something is moving"). Every rung on the ladder is a faint
/// tick between them.
struct LabYardstick: View {
    let open: Double
    let now: Double
    var rungs: [Double] = []
    /// How a value prints on the labels ("+6.5", "-134", "8.5").
    var label: (Double) -> String = { LabFormat.trim($0) }
    var nowWord: String = "NOW"
    var openWord: String = "OPENED"

    private var span: (lo: Double, hi: Double, step: Double) {
        let values = rungs + [open, now]
        let lo = values.min() ?? 0, hi = values.max() ?? 1
        let range = max(hi - lo, 1)
        let step: Double = range > 60 ? 20 : range > 20 ? 5 : range > 6 ? 1 : 0.5
        let padded = max(range * 0.35, step * 2)
        return ((lo - padded), (hi + padded), step)
    }

    var body: some View {
        let sp = span
        GeometryReader { geo in
            let w = geo.size.width
            let x: (Double) -> CGFloat = { v in CGFloat((v - sp.lo) / (sp.hi - sp.lo)) * w }
            let first = (sp.lo / sp.step).rounded(.up) * sp.step
            let ticks = stride(from: first, through: sp.hi, by: sp.step).map { $0 }
            ZStack(alignment: .topLeading) {
                // the rule
                Rectangle().fill(LabInk.hair).frame(height: 1).offset(y: 22)
                ForEach(Array(ticks.enumerated()), id: \.offset) { i, t in
                    let major = i % 2 == 0
                    Rectangle().fill(GaryColors.warmWhite.opacity(major ? 0.35 : 0.18))
                        .frame(width: 1, height: major ? 12 : 7)
                        .offset(x: x(t), y: major ? 16 : 21)
                    if major {
                        Text(label(t)).font(GaryFonts.mono(9, bold: true)).foregroundStyle(LabInk.dimmer)
                            .fixedSize().offset(x: x(t) - 12, y: 32)
                    }
                }
                // the ladder's rungs
                ForEach(Array(rungs.enumerated()), id: \.offset) { _, r in
                    Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(width: 1, height: 10).offset(x: x(r), y: 12)
                }
                // the move
                if abs(now - open) > 0.001 {
                    Rectangle().fill(GaryColors.gold.opacity(0.5))
                        .frame(width: abs(x(now) - x(open)), height: 2)
                        .offset(x: min(x(now), x(open)), y: 21)
                }
                // opened
                VStack(spacing: 2) {
                    Text(openWord).font(GaryFonts.mono(8.5, bold: true)).tracking(0.8).foregroundStyle(LabInk.dim).fixedSize()
                    Rectangle().fill(GaryColors.silver).frame(width: 2, height: 18)
                }
                .offset(x: x(open) - 20, y: -4)
                .frame(width: 40)
                // now
                VStack(spacing: 2) {
                    Text(nowWord).font(GaryFonts.mono(8.5, bold: true)).tracking(0.8).foregroundStyle(GaryColors.gold).fixedSize()
                    RoundedRectangle(cornerRadius: 1.5).fill(GaryColors.gold).frame(width: 3, height: 22)
                        .shadow(color: GaryColors.gold.opacity(0.6), radius: 4)
                }
                .offset(x: x(now) - 20, y: -8)
                .frame(width: 40)
            }
        }
        .frame(height: 48)
    }
}

/// The fan's own number on a prop (founder, Sep 22 2026: "people could move
/// that yardstick and set their own projections... and lock that in"). Drag
/// the stick, tap LOCK; the line sits on the rule in gold.
struct LabProjectionStick: View {
    let line: Double
    let unit: String
    @Binding var call: Double
    let locked: Bool
    let onLock: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var span: (lo: Double, hi: Double, step: Double) {
        let step: Double = line >= 100 ? 10 : line >= 20 ? 5 : 1
        let lo = max(0, (line * 0.35 / step).rounded(.down) * step)
        let hi = ((line * 1.9 / step).rounded(.up) * step)
        return (lo, max(hi, lo + step * 4), step)
    }

    var body: some View {
        let sp = span
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(LabFormat.trim(call)).font(GaryFonts.display(30)).foregroundStyle(locked ? GaryColors.gold : GaryColors.warmWhite).monospacedDigit()
                Text(unit).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim)
                Spacer()
                Button(action: onLock) {
                    Text(locked ? "LOCKED" : "LOCK").font(GaryFonts.display(14)).tracking(1.4)
                        .foregroundStyle(locked ? GaryColors.gold : GaryColors.warmWhite)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(locked ? GaryColors.gold : LabInk.hair, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(locked)
            }
            GeometryReader { geo in
                let w = geo.size.width
                let x: (Double) -> CGFloat = { v in CGFloat((v - sp.lo) / (sp.hi - sp.lo)) * w }
                let ticks = stride(from: sp.lo, through: sp.hi, by: sp.step).map { $0 }
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(LabInk.hair).frame(height: 1).offset(y: 18)
                    ForEach(Array(ticks.enumerated()), id: \.offset) { i, t in
                        let major = i % 2 == 0
                        Rectangle().fill(GaryColors.warmWhite.opacity(major ? 0.35 : 0.18)).frame(width: 1, height: major ? 12 : 7).offset(x: x(t), y: major ? 12 : 17)
                        if major {
                            Text(LabFormat.trim(t)).font(GaryFonts.mono(9, bold: true)).foregroundStyle(LabInk.dimmer).fixedSize().offset(x: x(t) - 10, y: 28)
                        }
                    }
                    Rectangle().fill(GaryColors.gold.opacity(0.7)).frame(width: 2, height: 24).offset(x: x(line), y: 6)
                    RoundedRectangle(cornerRadius: 2).fill(locked ? GaryColors.gold : GaryColors.warmWhite)
                        .frame(width: 4, height: 28).offset(x: x(call) - 2, y: 4)
                        .shadow(color: (locked ? GaryColors.gold : GaryColors.warmWhite).opacity(0.5), radius: 5)
                }
                .contentShape(Rectangle())
                .gesture(locked ? nil : DragGesture(minimumDistance: 0).onChanged { g in
                    let raw = sp.lo + Double(min(max(g.location.x, 0), w) / w) * (sp.hi - sp.lo)
                    let snapped = (raw / (sp.step >= 5 ? 1 : 0.5)).rounded() * (sp.step >= 5 ? 1 : 0.5)
                    if reduceMotion { call = snapped } else { withAnimation(.interactiveSpring()) { call = snapped } }
                })
            }
            .frame(height: 42)
        }
    }
}

extension LabFormat {
    /// The primetime window a game sits in, in ET: TNF, SNF, MNF, or MLB's
    /// Sunday night game. Nil for everything else.
    static func primetime(_ iso: String?, league: String) -> String? {
        guard let d = parseISO(iso) else { return nil }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = et
        let weekday = cal.component(.weekday, from: d), hour = cal.component(.hour, from: d)
        guard hour >= 19 else { return nil }
        switch (league.uppercased(), weekday) {
        case ("NFL", 5): return "TNF"
        case ("NFL", 1): return "SNF"
        case ("NFL", 2): return "MNF"
        case ("MLB", 1): return "SNB"
        default: return nil
        }
    }
    /// A take split into sentences. A period inside a number ("4.5 hits",
    /// ".713 OPS") does not end a sentence; only one followed by a space or
    /// the end of the text does.
    static func sentenceList(_ text: String) -> [String] {
        var out: [String] = []
        var current = ""
        let chars = Array(text)
        for (i, ch) in chars.enumerated() {
            current.append(ch)
            guard ch == "." || ch == "!" || ch == "?" else { continue }
            let next = i + 1 < chars.count ? chars[i + 1] : " "
            guard next == " " || next == "\n" || next == "\"" || next == "'" || next == ")" else { continue }
            let t = current.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { out.append(t) }
            current = ""
        }
        let tail = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if tail.count > 12 { out.append(tail) }
        return out
    }
    /// The first `n` sentences of a take.
    static func sentences(_ text: String?, count n: Int) -> [String] {
        Array(sentenceList(prose(stripTakeHeading(text))).filter { $0.count > 12 }.prefix(n))
    }

    /// One reason under an unveiled pick: the claim, the numbers behind it,
    /// and, when the reason rests on one, that number and what it counts
    /// ("7 of 8", "starts with 18+ outs"), circled in Gary's scorebook.
    struct Reason: Equatable, Codable {
        let claim: String
        let why: String
        var stat: String? = nil
        var note: String? = nil
    }
    /// Gary's brief of a pick: three short reasons for the flaps and a summary.
    struct Brief: Equatable {
        let reasons: [String]
        let summary: String
    }
    /// The brief stored on the pick, or nil when the pick has none.
    static func storedBrief(_ raw: Any?) -> Brief? {
        guard let row = raw as? [String: Any],
              let reasons = (row["reasons"] as? [Any])?.compactMap({ ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }).filter({ !$0.isEmpty }),
              reasons.count >= 2 else { return nil }
        let summary = ((row["summary"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return Brief(reasons: reasons, summary: summary)
    }
    /// Reasons the server wrote for a ticket, or nil when it has none yet.
    static func storedReasons(_ raw: Any?) -> [Reason]? {
        guard let rows = raw as? [[String: Any]] else { return nil }
        let out = rows.compactMap { r -> Reason? in
            guard let c = r["claim"] as? String, let w = r["why"] as? String, !c.isEmpty else { return nil }
            let stat = (r["stat"] as? String)?.trimmingCharacters(in: .whitespaces)
            let note = (r["note"] as? String)?.trimmingCharacters(in: .whitespaces)
            // The number and its note come as a pair or not at all.
            guard let stat, let note, !stat.isEmpty, !note.isEmpty else { return Reason(claim: c, why: w) }
            return Reason(claim: c, why: w, stat: stat, note: note)
        }
        return out.isEmpty ? nil : out
    }
    /// The reasons under an unveiled ticket, from Gary's own take. Each
    /// paragraph of the take is one reason: its first sentence is the claim,
    /// the rest of the paragraph is why. A take with fewer paragraphs than
    /// reasons wanted splits its longest paragraph by sentence. Nothing is
    /// rewritten and nothing repeats.
    static func reasons(from take: String?, count n: Int) -> [Reason] {
        let clean = prose(stripTakeHeading(take))
        guard !clean.isEmpty else { return [] }
        var paragraphs = clean.components(separatedBy: "\n\n")
            .map { $0.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces) }
            .map(sentenceList)
            .filter { !$0.isEmpty }
        // A paragraph with one short sentence is a closing line, not a reason.
        let full = paragraphs.filter { $0.count >= 2 || ($0.first?.count ?? 0) > 60 }
        if full.count >= n { paragraphs = full }
        while paragraphs.count < n, let longest = paragraphs.indices.max(by: { paragraphs[$0].count < paragraphs[$1].count }),
              paragraphs[longest].count >= 4 {
            let p = paragraphs[longest]
            let half = p.count / 2
            paragraphs.replaceSubrange(longest...longest, with: [Array(p[..<half]), Array(p[half...])])
        }
        return paragraphs.prefix(n).map { p in
            let (claim, rest) = lead(of: p[0])
            return Reason(claim: claim, why: ([rest] + p.dropFirst()).filter { !$0.isEmpty }.joined(separator: " "))
        }
    }
    /// The flaps hold about three lines. A sentence that fits is the claim
    /// whole; a longer one breaks at its last clause boundary that fits, and
    /// the rest of the sentence leads the why. Never mid-word.
    static func lead(of sentence: String, max: Int = 69) -> (String, String) {
        guard sentence.count > max else { return (sentence, "") }
        // A colon or semicolon is the cleanest break (the claim, then its
        // numbers); a comma or a conjunction only when there is none that fits.
        let groups: [[String]] = [[": ", "; "], [", ", " so ", " and ", " while ", " which ", " but ", " because "]]
        let chars = Array(sentence)
        for boundaries in groups {
            var best: (Int, Int)? = nil   // (cut index, resume index) in characters
            for b in boundaries {
                let bc = Array(b)
                var i = 0
                while i + bc.count <= chars.count {
                    if Array(chars[i..<i + bc.count]) == bc {
                        let resume = b.hasSuffix(" ") && b.hasPrefix(" ") ? i + 1 : i + bc.count
                        if i <= max, i >= 24, best.map({ i > $0.0 }) ?? true { best = (i, resume) }
                    }
                    i += 1
                }
            }
            if let (cut, resume) = best {
                let claim = String(chars[..<cut]).trimmingCharacters(in: CharacterSet(charactersIn: " ,;:"))
                return (claim, String(chars[resume...]).trimmingCharacters(in: .whitespaces))
            }
        }
        var claim = "", rest: [String] = []
        for w in sentence.split(separator: " ").map(String.init) {
            if rest.isEmpty, claim.count + w.count + 1 <= max { claim += (claim.isEmpty ? "" : " ") + w } else { rest.append(w) }
        }
        return (claim, rest.joined(separator: " "))
    }
}
