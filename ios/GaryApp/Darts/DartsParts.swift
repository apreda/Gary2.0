import SwiftUI
import Charts

// The pieces of the Darts page (founder, Sep 23 2026: "do it your way for
// real"). Taken from the 25 mocks: the moving streak tape (Market Open), the
// dart as a big name and a big price with his last games as dots (Stories,
// On Air), Gary's record as a number over a chart (Portfolio), and the
// streaks as two columns set against each other (Compare Lines).

// MARK: - The streak tape

/// One item on the tape: who, the run in words, which way it points.
struct TapeItem: Identifiable {
    enum Tone { case up, down, even }
    let id: String
    let name: String
    let run: String
    let tone: Tone
    let action: () -> Void
}

/// The league's runs crawling across the top of the page like a market
/// tape. Every name opens its card. Reduce Motion holds it still.
struct StreakTape: View {
    let items: [TapeItem]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @State private var cycle: CGFloat = 0
    private let speed: Double = 26     // points a second

    var body: some View {
        Group {
            if reduceMotion || voiceOver {
                ScrollView(.horizontal, showsIndicators: false) { strip.padding(.horizontal, GaryLayout.gutter) }
            } else {
                // A hidden tab stays mounted, so the tape stops itself off screen.
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: cycle == 0 || !activePage || scenePhase != .active)) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    let x = cycle > 0 ? CGFloat((t * speed).truncatingRemainder(dividingBy: Double(cycle))) : 0
                    HStack(spacing: 0) { strip; strip.accessibilityHidden(true) }
                        .fixedSize()
                        .offset(x: -x)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .clipped()
            }
        }
        .frame(height: 44)
        .background(alignment: .leading) {
            // The strip's own width is one lap of the tape.
            strip.fixedSize().hidden().background(GeometryReader { g in
                Color.clear
                    .onAppear { cycle = g.size.width }
                    .onChange(of: g.size.width) { cycle = $0 }
            })
        }
        .overlay(alignment: .top) { LabHairline() }
        .overlay(alignment: .bottom) { LabHairline() }
    }

    private var strip: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button(action: item.action) {
                    HStack(spacing: 6) {
                        Text(item.name).font(GaryFonts.ui(13, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        Image(systemName: item.tone == .up ? "arrowtriangle.up.fill" : item.tone == .down ? "arrowtriangle.down.fill" : "circle.fill")
                            .font(.system(size: item.tone == .even ? 5 : 8, weight: .bold))
                            .foregroundStyle(tint(item.tone))
                        Text(item.run).font(GaryFonts.kicker(12.5, .semibold)).foregroundStyle(tint(item.tone))
                    }
                    .fixedSize()
                    .frame(height: 44)
                    .padding(.leading, 12).padding(.trailing, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(item.name), \(item.run)")
            }
        }
    }

    private func tint(_ tone: TapeItem.Tone) -> Color {
        switch tone {
        case .up: return GaryColors.win
        case .down: return GaryColors.loss
        case .even: return GaryColors.sweating
        }
    }
}

// MARK: - A dart

/// His last games as dots, oldest first: gold where the dart would have hit.
struct FormDots: View {
    let ok: [Bool]
    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(ok.enumerated()), id: \.offset) { _, hit in
                Circle()
                    .fill(hit ? GaryColors.gold : Color.clear)
                    .overlay(Circle().stroke(hit ? GaryColors.gold : LabInk.dimmer, lineWidth: 1))
                    .frame(width: 7, height: 7)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(ok.filter { $0 }.count) of his last \(ok.count)")
    }
}

/// One dart: a big name and a big price. The first name and the club's color
/// above, the game under it, his recent games as dots under the price. A
/// first-inning dart is its two clubs, each opening its team card.
struct DartLine: View {
    let dart: DartRow
    let onPlayer: () -> Void
    let onTeam: (String) -> Void

    var body: some View {
        Group {
            if dart.isGame { gameLine } else { Button(action: onPlayer) { playerLine }.buttonStyle(.plain) }
        }
        .opacity(dart.isScratched ? 0.5 : 1)
    }

    // A player dart.
    private var playerLine: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    teamMark(dart.team)
                    Text([dart.firstName, ["td", "ftd", "recyds"].contains(dart.kind) ? dart.position : nil].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                // The surname whole: a size down when it is long, never cut.
                ViewThatFits(in: .horizontal) {
                    surname(30).fixedSize()
                    surname(24).fixedSize()
                    surname(19).fixedSize()
                    surname(19).fixedSize(horizontal: false, vertical: true)
                }
                Text(dart.gameLine).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim)
                    .fixedSize(horizontal: false, vertical: true)
                if let last = dart.lastSeasonWords {
                    Text(last).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dimmer)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                if dart.isScratched {
                    Text(dart.scratchWord).font(GaryFonts.display(15)).tracking(1).foregroundStyle(GaryColors.silver)
                } else {
                    if let line = dart.lineWords {
                        Text(line).font(GaryFonts.display(14)).tracking(0.6).foregroundStyle(GaryColors.silver)
                    } else if dart.kind == "hits_run" {
                        Text("2+ HITS").font(GaryFonts.display(13)).tracking(0.6).foregroundStyle(GaryColors.silver)
                    }
                    Text(LabFormat.price(dart.odds)).font(GaryFonts.display(30)).foregroundStyle(GaryColors.gold).monospacedDigit()
                    if dart.kind == "hits_run", let run = dart.odds_alt {
                        Text("RUN \(LabFormat.price(run))").font(GaryFonts.display(13)).tracking(0.6).foregroundStyle(GaryColors.silver)
                    }
                }
                if let ok = dart.formDots, !ok.isEmpty { FormDots(ok: ok) }
            }
            .fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    // A first-inning dart: the game, yes or no, the price.
    private var gameLine: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if let teams = dart.gameTeams {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { club(teams.away); at; club(teams.home) }
                        VStack(alignment: .leading, spacing: 2) { HStack(spacing: 8) { club(teams.away); at }; club(teams.home) }
                    }
                } else {
                    Text(dart.player.uppercased()).font(GaryFonts.display(24)).foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(LabFormat.keepTimeTogether(LabFormat.timeET(dart.commence_time))).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim)
                if let words = dart.firstInningWords {
                    Text(words).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dimmer)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                if dart.isScratched {
                    Text(dart.scratchWord).font(GaryFonts.display(15)).tracking(1).foregroundStyle(GaryColors.silver)
                } else {
                    Text((dart.bet ?? "over") == "under" ? "NO" : "YES").font(GaryFonts.display(20)).tracking(1).foregroundStyle(GaryColors.warmWhite)
                    Text(LabFormat.price(dart.odds)).font(GaryFonts.display(30)).foregroundStyle(GaryColors.gold).monospacedDigit()
                }
            }
            .fixedSize()
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    private func surname(_ size: CGFloat) -> some View {
        Text(dart.surname.uppercased())
            .font(GaryFonts.display(size)).foregroundStyle(GaryColors.warmWhite)
            .strikethrough(dart.isScratched, color: LabInk.dim)
    }

    private var at: some View {
        Text("@").font(GaryFonts.display(18)).foregroundStyle(LabInk.dim)
    }

    private func club(_ name: String) -> some View {
        Button { onTeam(name) } label: {
            HStack(spacing: 6) {
                teamMark(name)
                Text(name.uppercased()).font(GaryFonts.display(24)).foregroundStyle(GaryColors.warmWhite)
                    .strikethrough(dart.isScratched, color: LabInk.dim)
                    .fixedSize()
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func teamMark(_ team: String?) -> some View {
        if let color = TeamColors.color(for: team, league: dart.league) {
            RoundedRectangle(cornerRadius: 2, style: .continuous).fill(color).frame(width: 9, height: 9)
        }
    }
}

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
    var surname: String { PlayerName.split(player).last }
    var firstName: String? { PlayerName.split(player).first }
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
    /// MLB: his last 10. NFL: this season's games.
    var formDots: [Bool]? { form?.ok ?? form?.now?.ok }
    /// NFL: last season beside this one ("2025: 1,203 receiving yards in 17 games").
    var lastSeasonWords: String? {
        guard league == "NFL", let last = form?.last, let g = last.g, g > 0, let total = last.total else { return nil }
        let ymd = game_date ?? ""
        let year = Int(ymd.prefix(4)) ?? 2026
        let month = Int(ymd.dropFirst(5).prefix(2)) ?? 9
        let lastSeason = (month <= 2 ? year - 1 : year) - 1
        let one = total == 1
        let unit: String
        switch kind {
        case "qbtd": unit = one ? "rushing touchdown" : "rushing touchdowns"
        case "recyds": unit = "receiving yards"
        case "passtd": unit = one ? "passing touchdown" : "passing touchdowns"
        case "int": unit = one ? "interception" : "interceptions"
        default: unit = one ? "touchdown" : "touchdowns"
        }
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0
        let t = f.string(from: NSNumber(value: total)) ?? String(Int(total))
        return "\(lastSeason): \(t) \(unit) in \(g) game\(g == 1 ? "" : "s")"
    }
    /// "Scored in the 1st, last 10: Reds 1 · Braves 2".
    var firstInningWords: String? {
        guard isGame, let teams = gameTeams, let a = form?.away, let h = form?.home else { return nil }
        return "Scored in the 1st, last \(form?.of ?? 10): \(teams.away) \(a) · \(teams.home) \(h)"
    }
}

// MARK: - Gary's record

/// Gary's record as a number over its chart, the window picked in text.
/// Under it: the teams he is on a run with, then his side numbers.
struct GaryRecordPanel: View {
    let league: String
    let run: DartsRun
    let today: String
    let onTeam: (String) -> Void
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
            onARun
            tiles
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

    @ViewBuilder private var onARun: some View {
        let teams = (run.team_streaks ?? []).filter { ($0.league ?? "") == league }
        if !teams.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("ON A RUN WITH").font(GaryFonts.kicker(10.5, .semibold)).tracking(1).foregroundStyle(LabInk.dim)
                DartsFlow(spacing: 18) {
                        ForEach(Array(teams.enumerated()), id: \.offset) { _, t in
                            Button { onTeam(t.team ?? "") } label: {
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    Text((t.team ?? "").uppercased()).font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite)
                                    Text("\(t.streak ?? 0)").font(GaryFonts.display(18)).foregroundStyle(GaryColors.win).monospacedDigit()
                                }
                                .fixedSize()
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                }
            }
        }
    }

    private struct Tile: Identifiable { let id: String; let title: String; let big: String; let bigTint: Color; let small: String?; let smallTint: Color }

    private var tileList: [Tile] {
        var out: [Tile] = []
        if let s = run.league_streaks?.first(where: { ($0.league ?? "") == league }), (s.streak ?? 0) >= 2 {
            out.append(Tile(id: "now", title: "RIGHT NOW", big: "\(s.streak ?? 0) STRAIGHT", bigTint: GaryColors.win, small: nil, smallTint: LabInk.dim))
        }
        if let d = run.dogs?.first(where: { ($0.league ?? "") == league }), (d.won ?? 0) + (d.lost ?? 0) > 0 {
            let u = d.units?.value ?? 0
            out.append(Tile(id: "dogs", title: "UNDERDOGS, 30 DAYS", big: "\(d.won ?? 0)-\(d.lost ?? 0)", bigTint: GaryColors.warmWhite,
                            small: LabFormat.unitsNet(u), smallTint: u > 0.049 ? GaryColors.win : u < -0.049 ? GaryColors.loss : GaryColors.silver))
        }
        if league == "NFL" {
            for s in (run.primetime ?? []) where (s.won ?? 0) + (s.lost ?? 0) > 0 {
                let w = s.won ?? 0, l = s.lost ?? 0
                out.append(Tile(id: "pt-\(s.slot ?? "")", title: s.slot ?? "", big: "\(w)-\(l)",
                                bigTint: w > l ? GaryColors.win : w < l ? GaryColors.loss : GaryColors.silver, small: nil, smallTint: LabInk.dim))
            }
        }
        if let p = run.best_props?.first(where: { ($0.league ?? "") == league }), let name = p.player_name {
            let odds = p.odds?.value.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) }
            out.append(Tile(id: "prop", title: "YESTERDAY'S BIG PROP", big: name.uppercased(), bigTint: GaryColors.warmWhite,
                            small: LabFormat.price(odds), smallTint: GaryColors.win))
        }
        if let g = run.best_games?.first(where: { ($0.league ?? "") == league }), let pick = g.pick_text {
            out.append(Tile(id: "game", title: "YESTERDAY'S BIG PICK", big: LabFormat.ticketBody(pick).uppercased(), bigTint: GaryColors.warmWhite,
                            small: LabFormat.price(g.price), smallTint: GaryColors.win))
        }
        return out
    }

    @ViewBuilder private var tiles: some View {
        let list = tileList
        if !list.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(list) { t in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(t.title).font(GaryFonts.kicker(10.5, .semibold)).tracking(1).foregroundStyle(GaryColors.gold)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(t.big).font(GaryFonts.display(22)).foregroundStyle(t.bigTint).monospacedDigit()
                                .fixedSize(horizontal: false, vertical: true)
                            if let small = t.small, !small.isEmpty {
                                Text(small).font(GaryFonts.display(17)).foregroundStyle(t.smallTint).monospacedDigit()
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .frame(width: 150, alignment: .topLeading)
                        .frame(minHeight: 96, alignment: .topLeading)
                        .labPlate(radius: 12)
                    }
                }
            }
        }
    }
}

// MARK: - The streaks

/// The league's runs by kind, the good ones set against the bad ones in two
/// columns (hitting and hitless, winning and losing), each run's length drawn
/// as a bar. Every name opens its card.
struct StreakBoard: View {
    let rows: [StreakRow]
    let onPlayer: (_ name: String, _ league: String) -> Void
    let onTeam: (_ name: String, _ league: String) -> Void
    @State private var tab = ""

    private struct Kind: Identifiable {
        let tab: String
        let up: Set<String>
        let down: Set<String>
        let upTitle: String
        let downTitle: String
        var id: String { tab }
    }
    private static let kinds: [Kind] = [
        Kind(tab: "HITS", up: ["hit"], down: ["hitless"], upTitle: "HITTING", downTitle: "HITLESS"),
        Kind(tab: "HOME RUNS", up: ["hr"], down: [], upTitle: "", downTitle: ""),
        Kind(tab: "TOUCHDOWNS", up: ["td"], down: [], upTitle: "", downTitle: ""),
        Kind(tab: "100 YARDS", up: ["rush100", "rec100"], down: [], upTitle: "", downTitle: ""),
        Kind(tab: "WINS", up: ["win"], down: ["loss"], upTitle: "WINNING", downTitle: "LOSING"),
        Kind(tab: "SPREAD", up: ["cover"], down: ["nocover"], upTitle: "COVERING", downTitle: "NOT COVERING"),
        Kind(tab: "TOTALS", up: ["over"], down: ["under"], upTitle: "OVERS", downTitle: "UNDERS"),
    ]

    private var present: [Kind] {
        let kinds = Set(rows.compactMap(\.kind))
        return Self.kinds.filter { !$0.up.union($0.down).isDisjoint(with: kinds) }
    }
    private var group: Kind? {
        let list = present
        return list.first { $0.tab == tab } ?? list.first
    }

    var body: some View {
        if let g = group {
            VStack(alignment: .leading, spacing: 10) {
                Text("STREAKS").font(GaryFonts.display(18)).tracking(1.2).foregroundStyle(GaryColors.gold).pageGutter()
                if present.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        LabTextTabs(items: present.map(\.tab), selected: Binding(get: { g.tab }, set: { tab = $0 }), size: 13)
                            .padding(.horizontal, GaryLayout.gutter)
                    }
                }
                let up = sorted(g.up)
                let down = sorted(g.down)
                let upTop = max(up.first?.length ?? 1, 1)
                let downTop = max(down.first?.length ?? 1, 1)
                Group {
                    if !g.down.isEmpty, !down.isEmpty, !up.isEmpty {
                        HStack(alignment: .top, spacing: 10) {
                            column(g.upTitle, up, longest: upTop, good: true)
                            column(g.downTitle, down, longest: downTop, good: false)
                        }
                    } else {
                        column(nil, up.isEmpty ? down : up, longest: up.isEmpty ? downTop : upTop, good: !up.isEmpty)
                    }
                }
                .pageGutter()
            }
        }
    }

    private func sorted(_ kinds: Set<String>) -> [StreakRow] {
        Array(rows.filter { kinds.contains($0.kind ?? "") }.sorted { ($0.length ?? 0) > ($1.length ?? 0) }.prefix(8))
    }

    private func column(_ title: String?, _ list: [StreakRow], longest: Int, good: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title, !title.isEmpty {
                Text(title).font(GaryFonts.kicker(10.5, .semibold)).tracking(1).foregroundStyle(LabInk.dim)
                    .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 2)
            }
            ForEach(Array(list.enumerated()), id: \.offset) { i, r in
                if i > 0 { LabHairline().padding(.leading, 12) }
                entry(r, longest: longest, good: good)
            }
        }
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate(radius: 14)
    }

    @ViewBuilder private func entry(_ r: StreakRow, longest: Int, good: Bool) -> some View {
        let isPlayer = r.subject_type == "player"
        let tint = tint(r.kind, good: good)
        let line = VStack(alignment: .leading, spacing: 4) {
            Text((r.subject ?? "").uppercased()).font(GaryFonts.display(17)).foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .center, spacing: 8) {
                Text(number(r)).font(GaryFonts.display(20)).foregroundStyle(tint).monospacedDigit().fixedSize()
                GeometryReader { g in
                    Rectangle().fill(tint.opacity(0.7))
                        .frame(width: max(6, g.size.width * CGFloat(r.length ?? 0) / CGFloat(longest)), height: 3)
                        .frame(maxHeight: .infinity, alignment: .center)
                }
                .frame(height: 20)
            }
            if let sub = subline(r, isPlayer: isPlayer) {
                Text(sub).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        if let name = r.subject, let lg = r.league {
            Button { isPlayer ? onPlayer(name, lg) : onTeam(name, lg) } label: { line }.buttonStyle(.plain)
        } else {
            line
        }
    }

    /// The run's length; a hitless run is at-bats, read the way a box score says it.
    private func number(_ r: StreakRow) -> String {
        let n = r.length ?? 0
        return r.kind == "hitless" ? "0 FOR \(n)" : "\(n)"
    }

    private func subline(_ r: StreakRow, isPlayer: Bool) -> String? {
        var bits: [String] = []
        if isPlayer, let team = r.team { bits.append(LabFormat.nickname(team)) }
        if r.kind == "rush100" { bits.append("rushing") }
        if r.kind == "rec100" { bits.append("receiving") }
        if let next = r.next_game, !next.isEmpty { bits.append(LabFormat.keepTimeTogether(next)) }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    private func tint(_ kind: String?, good: Bool) -> Color {
        switch kind {
        case "over", "under": return GaryColors.gold
        default: return good ? GaryColors.win : GaryColors.loss
        }
    }
}

/// Items left to right, onto as many lines as they need.
struct DartsFlow: Layout {
    var spacing: CGFloat = 16

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
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
