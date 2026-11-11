import SwiftUI

// WINNERS: Gary's reasons, one night's results, and his record (founder GO, Nov 10 2026).

// MARK: - Why Gary likes it

/// Gary's reasons for one play: his number in a tile, the claim, and the line behind it.
struct WinnersWhySheet: View {
    let play: WPlay
    let onFull: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let words = play.words
        ZStack(alignment: .top) {
            WCardSurface(glow: play.glow, strength: 0.4, radius: 0).ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 9) {
                        ForEach(Array(play.badges.enumerated()), id: \.offset) { _, badge in WBadge(code: badge.code, color: badge.color) }
                        Text(words.who).font(W.text(16, .semibold)).foregroundStyle(W.bone).fitsOneLine()
                        Spacer(minLength: 8)
                        Button { dismiss() } label: {
                            Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(W.bone)
                                .frame(width: 36, height: 36).background(Circle().fill(W.bone.opacity(0.1)))
                                .frame(width: 44, height: 44).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).accessibilityLabel("Close")
                    }
                    Text(play.ticket.isProp ? [words.number, words.what].compactMap { $0 }.joined(separator: " ") : play.line)
                        .font(W.wide(34)).tracking(-0.85).foregroundStyle(W.bone)
                        .fitsLines(2).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(Array(play.reasons.enumerated()), id: \.offset) { i, reason in row(i, reason) }
                    }
                    .padding(.top, 26)
                    WGlassButton(title: "The full breakdown", action: onFull).padding(.top, 28)
                }
                .padding(.horizontal, 22).padding(.top, 26).padding(.bottom, 30)
            }
        }
    }

    private func row(_ index: Int, _ reason: LabFormat.Reason) -> some View {
        // A reason that rests on no number shows its place in the order, as the scorebook does.
        let stat = (reason.stat ?? "").trimmingCharacters(in: .whitespaces)
        return HStack(alignment: .top, spacing: 14) {
            Text(stat.isEmpty ? "\(index + 1)" : W.minus(stat))
                .font(W.wide(24)).tracking(-0.6).foregroundStyle(W.bone)
                .fitsLines(2).multilineTextAlignment(.center)
                .padding(.horizontal, 8)
                .frame(width: 84, height: 84)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(W.bone.opacity(0.07)))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
            VStack(alignment: .leading, spacing: 4) {
                Text(reason.claim).font(W.text(18, .semibold)).foregroundStyle(W.bone)
                    .fixedSize(horizontal: false, vertical: true)
                if !reason.why.isEmpty {
                    Text(reason.why).font(W.text(16)).foregroundStyle(W.dim).lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 5)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Results

struct WinnersResults: View {
    /// The night on screen, "yyyy-MM-dd".
    let date: String
    /// True when a later night exists to step to.
    let canGoLater: Bool
    let plays: [WPlay]
    let loading: Bool
    /// Gary's face for that night.
    let face: String?
    let lastNight: Bool
    /// True when the night on screen is today's.
    var tonight = false
    let month: Month?
    var dock: CGFloat = 62
    let onStep: (Int) -> Void
    let onOpen: (LabBoardTicket) -> Void

    struct Month { let label: String; let wins: Int; let losses: Int; let net: Double }

    var body: some View {
        let graded = plays.filter { $0.net != nil }
        let net = graded.compactMap(\.net).reduce(0, +)
        let won = graded.filter { $0.result == "won" }.count, lost = graded.filter { $0.result == "lost" }.count
        let staked = graded.reduce(0) { $0 + $1.stake }
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                stepper.padding(.horizontal, 20).padding(.top, 2)
                HStack(spacing: 16) {
                    Image(face ?? GaryBrand.mark).resizable().scaledToFit().frame(width: 112, height: 112)
                        .background(Circle().fill(RadialGradient(colors: [faceGlow.opacity(0.3), .clear], center: .center, startRadius: 0, endRadius: 86)).frame(width: 172, height: 172))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 6) {
                        // The date is in the stepper above; only "last night" and "so far" add to it.
                        if lastNight || tonight {
                            Text(lastNight ? "Last night" : "So far tonight").font(W.text(14)).foregroundStyle(W.dim)
                        }
                        if graded.isEmpty {
                            Text(loading ? " " : "No plays").font(W.wide(34)).tracking(-0.85).foregroundStyle(W.dim).fitsOneLine()
                        } else {
                            Text(W.dollars(net, signed: true)).font(W.wide(56)).tracking(-1.4)
                                .foregroundStyle(net > 0.49 ? W.win : net < -0.49 ? W.loss : W.bone).fitsOneLine().wTight(56)
                            Text("\(won) won, \(lost) lost on \(W.dollars(staked))").font(W.text(16)).foregroundStyle(W.bone).fitsOneLine()
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 20).padding(.top, 2)
                .accessibilityElement(children: .combine)

                if !plays.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(plays.enumerated()), id: \.element.id) { i, play in
                            Button { onOpen(play.ticket) } label: { row(play) }
                                .buttonStyle(.plain)
                                .overlay(alignment: .top) { if i > 0 { Rectangle().fill(W.bone.opacity(0.08)).frame(height: 1) } }
                        }
                    }
                    .wPanel(radius: 24)
                    .padding(.horizontal, 20).padding(.top, 12)
                }
                if let month {
                    HStack {
                        Text(month.label).font(W.text(16)).foregroundStyle(W.bone)
                        Spacer(minLength: 8)
                        Text("\(month.wins)-\(month.losses)").font(W.wide(16)).tracking(-0.4).foregroundStyle(W.bone)
                        Text(W.dollars(month.net, signed: true)).font(W.wide(16)).tracking(-0.4)
                            .foregroundStyle(month.net > 0.49 ? W.win : month.net < -0.49 ? W.loss : W.bone)
                            .padding(.leading, 8)
                    }
                    .padding(.horizontal, 16).frame(height: 52)
                    .wPanel(radius: 20)
                    .padding(.horizontal, 20).padding(.top, 10)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.bottom, dock + 30)
        }
    }

    private var faceGlow: Color {
        switch face {
        case "GaryFire", "GaryCooking": return Color(hex: "#F28C28")
        case "GaryIceCold", "GaryDoomsday": return Color(hex: "#60AAE8")
        default: return W.gold
        }
    }

    private var stepper: some View {
        HStack {
            step("chevron.left", label: "The night before", enabled: true) { onStep(-1) }
            Spacer(minLength: 8)
            Text(longDate).font(W.text(18, .semibold)).foregroundStyle(W.bone).fitsOneLine()
            Spacer(minLength: 8)
            step("chevron.right", label: "The next night", enabled: canGoLater) { onStep(1) }
        }
    }
    private func step(_ icon: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(W.bone)
                .frame(width: 36, height: 36).background(Circle().fill(W.bone.opacity(0.08)))
                .frame(width: 44, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.35)
        .accessibilityLabel(label)
    }
    /// "Monday, November 9".
    private var longDate: String {
        let parse = DateFormatter()
        parse.dateFormat = "yyyy-MM-dd"; parse.timeZone = LabFormat.et; parse.locale = Locale(identifier: "en_US_POSIX")
        guard let day = parse.date(from: date) else { return date }
        let out = DateFormatter()
        out.dateFormat = "EEEE, MMMM d"; out.timeZone = LabFormat.et; out.locale = Locale(identifier: "en_US")
        return out.string(from: day)
    }

    private func row(_ play: WPlay) -> some View {
        HStack(spacing: 10) {
            WMark(result: play.result)
            VStack(alignment: .leading, spacing: 1) {
                Text(play.line).font(W.text(16, .semibold)).foregroundStyle(W.bone)
                    .fitsLines(2).fixedSize(horizontal: false, vertical: true)
                if let detail = play.finalDetail {
                    Text(detail).font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
                }
            }
            Spacer(minLength: 8)
            if let net = play.net {
                Text(W.dollars(net, signed: true)).font(W.wide(16)).tracking(-0.4)
                    .foregroundStyle(net > 0.49 ? W.win : net < -0.49 ? W.loss : W.bone).fixedSize()
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the play")
    }
}

// MARK: - Record

/// Where Gary's money has come from: props against game picks, big bets against the rest.
struct WSplits: Decodable, Equatable {
    struct Side: Decodable, Equatable {
        let wins: Int
        let losses: Int
        let net_units: Double
        var net: Double { net_units * LabFormat.unitDollars }
    }
    let props: Side
    let games: Side
    let big: Side
    let small: Side
    /// The stake, in dollars, a "big" bet starts at.
    let big_from_dollars: Double

    static func fetch() async -> WSplits? {
        guard let data = try? await WinnersAccessStore.request("rest/v1/rpc/get_winners_splits", body: [:]) else { return nil }
        return try? JSONDecoder().decode(WSplits.self, from: data)
    }
}

struct WinnersRecord: View {
    let snapshot: GaryBankrollSnapshot?
    let splits: WSplits?
    var dock: CGFloat = 62
    @State private var range = "All"

    private struct Point { let date: String; let dollars: Double }

    /// The bankroll by day over the range, opening with the money it started the range on.
    private var series: (points: [Point], opening: Double, wins: Int, losses: Int) {
        guard let s = snapshot else { return ([], LabFormat.bankrollDollars, 0, 0) }
        let unit = LabFormat.unitDollars
        let start = s.initial_units * unit
        let all = s.curve.map { Point(date: $0.date, dollars: start + $0.net_units * unit) }
        let days = s.days ?? []
        let keep: Int? = range == "Week" ? 7 : range == "Month" ? 30 : nil
        guard let keep, all.count > keep else {
            return ([Point(date: s.started_date, dollars: start)] + all, start, s.wins, s.losses)
        }
        let cut = all.count - keep
        let opening = all[cut - 1].dollars
        let shown = Array(all[cut...])
        let first = shown.first?.date ?? ""
        let inRange = days.filter { $0.date >= first }
        return ([Point(date: all[cut - 1].date, dollars: opening)] + shown, opening,
                inRange.reduce(0) { $0 + $1.wins }, inRange.reduce(0) { $0 + $1.losses })
    }

    var body: some View {
        let data = series
        let now = (snapshot?.bankroll_units ?? 100) * LabFormat.unitDollars
        let change = now - data.opening
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Gary's bankroll").font(W.text(14)).foregroundStyle(W.dim)
                        Text(snapshot == nil ? " " : W.dollars(now)).font(W.wide(56)).tracking(-1.4).foregroundStyle(W.bone).fitsOneLine().wTight(56)
                    }
                    Spacer(minLength: 12)
                    if snapshot != nil {
                        VStack(alignment: .trailing, spacing: 4) {
                            Text(W.dollars(change, signed: true)).font(W.wide(24)).tracking(-0.6)
                                .foregroundStyle(change > 0.49 ? W.win : change < -0.49 ? W.loss : W.bone).fitsOneLine()
                            Text(range == "All" ? "since \(LabFormat.monthDay(snapshot?.started_date ?? ""))" : range == "Week" ? "this week" : "this month")
                                .font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
                        }
                        .padding(.bottom, 6)
                    }
                }
                .padding(.horizontal, 20).padding(.top, 6)
                .accessibilityElement(children: .combine)

                WBankrollChart(values: data.points.map(\.dollars), dates: data.points.map(\.date), baseline: data.opening)
                    .frame(height: 128)
                    .padding(.horizontal, 20).padding(.top, 10)

                HStack {
                    WSegments(items: ["Week", "Month", "All"].map { WSegments.Item(id: $0, title: $0) }, selection: $range, height: 32)
                        .frame(width: 216)
                    Spacer(minLength: 8)
                    if snapshot != nil {
                        Text("\(data.wins)-\(data.losses)").font(W.wide(24)).tracking(-0.6).foregroundStyle(W.bone).fitsOneLine()
                    }
                }
                .padding(.horizontal, 20).padding(.top, 8)

                if let splits {
                    Text("Where he wins and loses").font(W.text(18, .semibold)).foregroundStyle(W.bone)
                        .padding(.horizontal, 20).padding(.top, 18)
                    let big = W.dollars(splits.big_from_dollars)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
                        tile("Props", splits.props)
                        tile("Game picks", splits.games)
                        tile("Bets of \(big) or more", splits.big)
                        tile("Bets under \(big)", splits.small)
                    }
                    .padding(.horizontal, 20).padding(.top, 10)
                }
            }
            .padding(.bottom, dock + 30)
        }
    }

    private func tile(_ label: String, _ side: WSplits.Side) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
            Text(W.dollars(side.net, signed: true)).font(W.wide(24)).tracking(-0.6)
                .foregroundStyle(side.net > 0.49 ? W.win : side.net < -0.49 ? W.loss : W.bone).fitsOneLine().wTight(24).padding(.top, 8)
            Text("\(side.wins)-\(side.losses)").font(W.text(16, .semibold)).foregroundStyle(W.bone).padding(.top, 5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.vertical, 11)
        .wPanel(radius: 22)
        .accessibilityElement(children: .combine)
    }
}

/// The bankroll as a line: green above the money the range opened on, red below, a dot on today.
struct WBankrollChart: View {
    let values: [Double]
    let dates: [String]
    let baseline: Double

    var body: some View {
        GeometryReader { geo in
            let labelRoom: CGFloat = 20
            let plot = CGRect(x: 0, y: labelRoom, width: geo.size.width - 9, height: geo.size.height - labelRoom * 2 - 18)
            let lo = min(values.min() ?? baseline, baseline), hi = max(values.max() ?? baseline, baseline)
            let span = max(hi - lo, 1)
            let y: (Double) -> CGFloat = { plot.maxY - CGFloat(($0 - lo) / span) * plot.height }
            let x: (Int) -> CGFloat = { values.count > 1 ? plot.minX + CGFloat($0) / CGFloat(values.count - 1) * plot.width : plot.midX }
            let line = Path { p in
                for (i, v) in values.enumerated() {
                    let point = CGPoint(x: x(i), y: y(v))
                    if i == 0 { p.move(to: point) } else { p.addLine(to: point) }
                }
            }
            let area = Path { p in
                guard values.count > 1 else { return }
                p.addPath(line)
                p.addLine(to: CGPoint(x: x(values.count - 1), y: y(baseline)))
                p.addLine(to: CGPoint(x: x(0), y: y(baseline)))
                p.closeSubpath()
            }
            let above = CGRect(x: -4, y: 0, width: geo.size.width + 8, height: y(baseline))
            let below = CGRect(x: -4, y: y(baseline), width: geo.size.width + 8, height: geo.size.height)
            ZStack(alignment: .topLeading) {
                area.fill(W.win.opacity(0.13)).clipShape(Path(above))
                area.fill(W.loss.opacity(0.13)).clipShape(Path(below))
                Path { p in p.move(to: CGPoint(x: 0, y: y(baseline))); p.addLine(to: CGPoint(x: geo.size.width, y: y(baseline))) }
                    .stroke(W.bone.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))
                line.stroke(W.win, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round)).clipShape(Path(above))
                line.stroke(W.loss, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round)).clipShape(Path(below))
                if let last = values.last, values.count > 1 {
                    Circle().fill(W.bone.opacity(0.2)).frame(width: 18, height: 18).position(x: x(values.count - 1), y: y(last))
                    Circle().fill(W.bone).frame(width: 10, height: 10).position(x: x(values.count - 1), y: y(last))
                }
                // The high and the low, named where they happened.
                if values.count > 2, hi - lo > 1, let top = values.firstIndex(of: values.max() ?? 0), let bottom = values.firstIndex(of: values.min() ?? 0) {
                    label(W.dollars(values[top]), at: CGPoint(x: clamp(x(top), in: geo.size.width), y: y(values[top]) - 12))
                    if bottom != top {
                        label(W.dollars(values[bottom]), at: CGPoint(x: clamp(x(bottom), in: geo.size.width), y: y(values[bottom]) + 13))
                    }
                }
                // The months along the foot.
                ForEach(monthMarks, id: \.index) { mark in
                    Text(mark.word).font(W.text(14)).foregroundStyle(W.faint).fixedSize()
                        .position(x: clamp(x(mark.index), in: geo.size.width, half: 16), y: geo.size.height - 8)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(values.isEmpty ? "Bankroll chart" : "Bankroll from \(W.dollars(values.first ?? 0)) to \(W.dollars(values.last ?? 0))")
    }

    private func label(_ text: String, at point: CGPoint) -> some View {
        Text(text).font(W.text(14, .semibold)).foregroundStyle(W.dim).fixedSize().position(point)
    }
    private func clamp(_ x: CGFloat, in width: CGFloat, half: CGFloat = 30) -> CGFloat { min(max(x, half), width - half) }

    private struct Mark { let index: Int; let word: String }
    /// The first point of each month on the line: "Sep", "Oct", "Nov". A week has no months to name.
    private var monthMarks: [Mark] {
        guard dates.count > 10 else { return [] }
        let names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        var seen = Set<String>(), marks: [Mark] = []
        for (i, date) in dates.enumerated() {
            let month = String(date.dropFirst(5).prefix(2))
            guard let n = Int(month), (1...12).contains(n), seen.insert(month).inserted else { continue }
            marks.append(Mark(index: i, word: names[n - 1]))
        }
        return marks
    }
}
