import SwiftUI

// THE LINE (founder, Sep 9 2026): where a game's line opened, where it is now,
// and every rung between — one book, read from the odds ledger
// (odds_snapshots through the line_ladder / line_movers reads). The module
// sits under the pick card on the football page; the same ladder opens from
// The Hub's movers board. Display only: numbers and times, never a verdict.
// Nothing here reaches Gary's desk.

// MARK: - Ledger models

struct LineRung: Codable, Identifiable, Equatable {
    let seen_at: String
    let spread_home: Double?
    let spread_home_odds: Int?
    let spread_away: Double?
    let spread_away_odds: Int?
    let ml_home: Int?
    let ml_away: Int?
    let total: Double?
    let total_over_odds: Int?
    let total_under_odds: Int?
    var id: String { seen_at }
    var seen: Date? { LineClock.parse(seen_at) }
}

struct LineLadder: Codable, Equatable {
    let sport: String
    let game_date: String
    let game_id: String
    let vendor: String?
    let home_team: String?
    let away_team: String?
    let commence_time: String?
    let rungs: [LineRung]
}

struct LineMover: Codable, Identifiable, Equatable {
    let game_date: String
    let game_id: String
    let home_team: String?
    let away_team: String?
    let vendor: String?
    let commence_time: String?
    let first_seen: String?
    let last_seen: String?
    let rungs: Int?
    let open_spread_home: Double?
    let now_spread_home: Double?
    let open_spread_home_odds: Int?
    let now_spread_home_odds: Int?
    let open_total: Double?
    let now_total: Double?
    let open_ml_home: Int?
    let now_ml_home: Int?
    let open_ml_away: Int?
    let now_ml_away: Int?
    /// When the total was first recorded — later than first_seen for games
    /// the ledger met before it learned totals (Sep 9 2026).
    let open_total_seen: String?
    var id: String { "\(game_date)|\(game_id)" }
}

/// Gary's own number on this game, marked on the ladder as a rung of its own.
struct LineGaryAnchor: Equatable {
    let label: String
    let postedAt: Date?
}

enum LineSport {
    /// The ledger's sport key for a league label; nil for leagues without a ladder.
    static func key(forLeague league: String?) -> String? {
        switch (league ?? "").uppercased() {
        case "NFL": return "americanfootball_nfl"
        case "NCAAF": return "americanfootball_ncaaf"
        case "MLB": return "baseball_mlb"
        default: return nil
        }
    }
    /// Football lines live for a week; a baseball board is the day's.
    static func weekLong(_ league: String?) -> Bool {
        let l = (league ?? "").uppercased()
        return l == "NFL" || l == "NCAAF"
    }
}

// MARK: - Reads

extension SupabaseAPI {
    static func fetchLineLadder(sport: String, date: String, gameID: String) async -> LineLadder? {
        do {
            let data = try await WinnersAccessStore.request("rest/v1/rpc/line_ladder",
                                                            body: ["p_sport": sport, "p_game_date": date, "p_game_id": gameID])
            guard !data.isEmpty, String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) != "null" else { return nil }
            return try JSONDecoder().decode(LineLadder.self, from: data)
        } catch {
            print("[fetchLineLadder] \(sport) \(date) \(gameID): \(error.localizedDescription)")
            return nil
        }
    }

    static func fetchLineMovers(sport: String, from: String, to: String) async -> [LineMover] {
        do {
            let data = try await WinnersAccessStore.request("rest/v1/rpc/line_movers",
                                                            body: ["p_sport": sport, "p_from": from, "p_to": to])
            return try JSONDecoder().decode([LineMover].self, from: data)
        } catch {
            print("[fetchLineMovers] \(sport) \(from)…\(to): \(error.localizedDescription)")
            return []
        }
    }
}

// MARK: - Words and clocks

enum LineText {
    static func american(_ v: Int) -> String { v > 0 ? "+\(v)" : "\(v)" }

    /// "3.5" / "44" — a line number without a trailing ".0".
    static func number(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }

    /// "-3.5" / "+3" / "PK".
    static func spread(_ v: Double) -> String {
        if v == 0 { return "PK" }
        return v > 0 ? "+\(number(v))" : "-\(number(abs(v)))"
    }

    /// "½" / "1" / "1½" / "2" — the size of a move in points, unsigned.
    static func points(_ delta: Double) -> String {
        let magnitude = abs(delta)
        let whole = Int(magnitude)
        let half = magnitude - Double(whole) >= 0.5
        if whole == 0 { return half ? "½" : "0" }
        return half ? "\(whole)½" : "\(whole)"
    }
}

enum LineClock {
    static let et = TimeZone(identifier: "America/New_York") ?? .current

    /// PostgREST timestamps carry microseconds ("…22.311599+00:00"); the
    /// ISO formatter accepts at most three fractional digits.
    static func parse(_ raw: String?) -> Date? {
        guard var s = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if let r = s.range(of: #"\.\d{4,}"#, options: .regularExpression) {
            s.replaceSubrange(r, with: String(s[r].prefix(4)))
        }
        return parseISO8601(s)
    }

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = et
        f.dateFormat = pattern
        return f
    }
    private static let time = formatter("h:mm a")
    private static let weekday = formatter("EEE")
    private static let monthDay = formatter("MMM d")
    private static let dayKey = formatter("yyyy-MM-dd")

    /// "Today 10:52 AM" · "Tue 9:00 AM" · "Sep 2 3:27 PM" — Eastern, always.
    static func label(_ date: Date, now: Date = Date()) -> String {
        let t = time.string(from: date)
        if dayKey.string(from: date) == dayKey.string(from: now) { return "Today \(t)" }
        if abs(date.timeIntervalSince(now)) < 6 * 86_400 { return "\(weekday.string(from: date)) \(t)" }
        return "\(monthDay.string(from: date)) \(t)"
    }

    /// The kickoff on a board row: "TONIGHT 8:20 PM" · "THU 8:15 PM".
    static func kickoffLabel(_ date: Date, now: Date = Date()) -> String {
        let t = time.string(from: date)
        if dayKey.string(from: date) == dayKey.string(from: now) { return "TONIGHT \(t)".uppercased() }
        if abs(date.timeIntervalSince(now)) < 6 * 86_400 { return "\(weekday.string(from: date)) \(t)".uppercased() }
        return "\(monthDay.string(from: date)) \(t)".uppercased()
    }
}

// MARK: - The story of one ladder

/// One game's ladder told from one side per market, so open and now read as
/// one sentence: the spread from the side favored now, the moneyline from the
/// favorite now, the total as itself.
struct LineStory: Equatable {
    let ladder: LineLadder
    let awayAbbr: String
    let homeAbbr: String
    let kickoff: Date?

    var open: LineRung? { ladder.rungs.first }
    var now: LineRung? { ladder.rungs.last }
    var moves: Int { max(ladder.rungs.count - 1, 0) }
    /// A market opens at the first rung that carries it — the ledger learned
    /// totals on Sep 9 2026, so a game first seen before that opens its total
    /// later than its spread, and the card says so.
    var spreadOpen: LineRung? { ladder.rungs.first { spreadLine($0) != nil } }
    var totalOpen: LineRung? { ladder.rungs.first { $0.total != nil } }
    var moneylineOpen: LineRung? { ladder.rungs.first { moneyline($0) != nil } }
    /// Markets whose first rung came after the ladder opened, with that time.
    var lateOpens: [(market: String, seen: Date)] {
        guard let first = open?.seen else { return [] }
        var out: [(String, Date)] = []
        if let s = spreadOpen?.seen, s > first { out.append(("SPREAD", s)) }
        if let t = totalOpen?.seen, t > first { out.append(("TOTAL", t)) }
        if let m = moneylineOpen?.seen, m > first { out.append(("MONEYLINE", m)) }
        return out
    }
    var started: Bool { kickoff.map { Date() >= $0 } ?? false }
    var vendorName: String {
        (ladder.vendor ?? "one book").replacingOccurrences(of: "_", with: " ").uppercased()
    }

    /// The spread is told from the home side when home is favored now (or the
    /// game is pick'em), else from the away side.
    var spreadFromHome: Bool { (now?.spread_home ?? open?.spread_home ?? 0) <= 0 }
    /// The moneyline is told from the favorite now (the shorter price).
    var moneylineFromHome: Bool {
        guard let h = now?.ml_home ?? open?.ml_home, let a = now?.ml_away ?? open?.ml_away else { return true }
        return h <= a
    }

    func spreadLine(_ r: LineRung) -> Double? { spreadFromHome ? r.spread_home : r.spread_away }
    func spreadPrice(_ r: LineRung) -> Int? { spreadFromHome ? r.spread_home_odds : r.spread_away_odds }
    func moneyline(_ r: LineRung) -> Int? { moneylineFromHome ? r.ml_home : r.ml_away }
    func otherMoneyline(_ r: LineRung) -> Int? { moneylineFromHome ? r.ml_away : r.ml_home }
    var spreadSide: String { spreadFromHome ? homeAbbr : awayAbbr }
    var moneylineSide: String { moneylineFromHome ? homeAbbr : awayAbbr }
    var moneylineOtherSide: String { moneylineFromHome ? awayAbbr : homeAbbr }

    /// "SEA -3.5 (-105)" — the side, its line, its price.
    func spreadText(_ r: LineRung, withPrice: Bool = true) -> String? {
        guard let line = spreadLine(r) else { return nil }
        var s = "\(spreadSide) \(LineText.spread(line))"
        if withPrice, let p = spreadPrice(r) { s += " (\(LineText.american(p)))" }
        return s
    }
    /// "44.5 (-110)" — the total and the over's price.
    func totalText(_ r: LineRung, withPrice: Bool = true) -> String? {
        guard let t = r.total else { return nil }
        var s = LineText.number(t)
        if withPrice, let o = r.total_over_odds { s += " (\(LineText.american(o)))" }
        return s
    }
    /// "SEA -190" or, with both sides, "SEA -190 · NE +155".
    func moneylineText(_ r: LineRung, bothSides: Bool = false) -> String? {
        guard let fav = moneyline(r) else { return nil }
        var s = "\(moneylineSide) \(LineText.american(fav))"
        if bothSides, let dog = otherMoneyline(r) { s += " · \(moneylineOtherSide) \(LineText.american(dog))" }
        return s
    }

    /// Points the favored side's number moved (open → now), from that side's
    /// point of view: -3 → -3.5 is +½ (the favorite lays more).
    var spreadDelta: Double? {
        guard let o = spreadOpen.flatMap(spreadLine), let n = now.flatMap(spreadLine) else { return nil }
        return abs(n) - abs(o)
    }
    var spreadPriceMoved: Bool {
        guard let o = spreadOpen, let n = now else { return false }
        return spreadPrice(o) != spreadPrice(n)
    }
    var totalDelta: Double? {
        guard let o = totalOpen?.total, let n = now?.total else { return nil }
        return n - o
    }
    var totalPriceMoved: Bool {
        guard let o = totalOpen, let n = now else { return false }
        return o.total_over_odds != n.total_over_odds || o.total_under_odds != n.total_under_odds
    }
    /// The favorite's price change in American-odds points: -190 → -185 is +5.
    var moneylineDelta: Int? {
        guard let o = moneylineOpen.flatMap(moneyline), let n = now.flatMap(moneyline) else { return nil }
        return n - o
    }

    enum Badge: Equatable {
        case moved(String)   // "+½" — in gold
        case price           // the number held, its price moved
        case holds
    }
    var spreadBadge: Badge? {
        guard let d = spreadDelta else { return nil }
        if d != 0 { return .moved("\(d > 0 ? "+" : "−")\(LineText.points(d))") }
        return spreadPriceMoved ? .price : .holds
    }
    var totalBadge: Badge? {
        guard let d = totalDelta else { return nil }
        if d != 0 { return .moved("\(d > 0 ? "+" : "−")\(LineText.points(d))") }
        return totalPriceMoved ? .price : .holds
    }
    var moneylineBadge: Badge? {
        guard let d = moneylineDelta else { return nil }
        return d == 0 ? .holds : .moved("\(d > 0 ? "+" : "−")\(abs(d))")
    }
}

// MARK: - The under-card module

struct LineLadderCard: View {
    let sportKey: String
    let gameDate: String
    let gameID: String
    let league: String
    let awayAbbr: String
    let homeAbbr: String
    let kickoff: Date?
    var gary: LineGaryAnchor? = nil

    @State private var ladder: LineLadder?
    @State private var showLadder = false

    private var story: LineStory? {
        guard let ladder, !ladder.rungs.isEmpty else { return nil }
        return LineStory(ladder: ladder, awayAbbr: awayAbbr, homeAbbr: homeAbbr,
                         kickoff: kickoff ?? LineClock.parse(ladder.commence_time))
    }

    var body: some View {
        Group {
            if let story {
                Button { showLadder = true } label: { LineLadderTable(story: story, gary: gary) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens every move on this line")
                    .onGaryTour { verb, _ in if verb == "ladder" { showLadder = true } }
                    .sheet(isPresented: $showLadder) {
                        LineLadderSheet(story: story, gary: gary, league: league)
                    }
            } else {
                // An absent module while the ledger has nothing for this game —
                // the anchor keeps the task alive (never `.task` behind an `if`).
                Color.clear.frame(height: 0)
            }
        }
        .task(id: "\(sportKey)|\(gameDate)|\(gameID)") {
            ladder = await SupabaseAPI.fetchLineLadder(sport: sportKey, date: gameDate, gameID: gameID)
        }
    }
}

/// The compact table: three markets, opened and now side by side, the size
/// of each move at the right, Gary's rung underneath.
struct LineLadderTable: View {
    let story: LineStory
    var gary: LineGaryAnchor? = nil

    private struct Row: Identifiable {
        let id: String
        let open: String
        let now: String
        let badge: LineStory.Badge?
    }
    private var rows: [Row] {
        guard let n = story.now else { return [] }
        var out: [Row] = []
        if let o = story.spreadOpen, let a = story.spreadText(o), let b = story.spreadText(n) { out.append(Row(id: "SPREAD", open: a, now: b, badge: story.spreadBadge)) }
        if let o = story.totalOpen, let a = story.totalText(o), let b = story.totalText(n) { out.append(Row(id: "TOTAL", open: a, now: b, badge: story.totalBadge)) }
        if let o = story.moneylineOpen, let a = story.moneylineText(o), let b = story.moneylineText(n) { out.append(Row(id: "MONEYLINE", open: a, now: b, badge: story.moneylineBadge)) }
        return out
    }
    private static let labelWidth: CGFloat = 60
    private static let badgeWidth: CGFloat = 46

    /// A column label that never trims: the kicker face, shrunk to fit.
    private func label(_ text: String, color: Color = ScoutMock.warm.opacity(0.42)) -> some View {
        Text(text.uppercased())
            .font(.system(size: 9, weight: .semibold).monospacedDigit()).tracking(1.0)
            .foregroundStyle(color)
            .lineLimit(1).minimumScaleFactor(0.7).allowsTightening(true)
    }
    /// Two-line column head — the word, then the time beneath it.
    private func columnHead(_ word: String, _ date: Date?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            label(word)
            label(date.map { LineClock.label($0) } ?? "—")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("THE LINE")
                    .font(GaryFonts.display(13)).tracking(0.8)
                    .foregroundStyle(GaryColors.gold)
                Spacer(minLength: 8)
                ScoutMock.kicker("\(story.vendorName) · \(story.moves) MOVE\(story.moves == 1 ? "" : "S")")
            }
            .padding(.top, 12)

            HStack(alignment: .top, spacing: 8) {
                Color.clear.frame(width: Self.labelWidth, height: 1)
                columnHead("OPENED", story.open?.seen)
                columnHead(story.started ? "CLOSE" : "NOW", story.now?.seen)
                Color.clear.frame(width: Self.badgeWidth, height: 1)
            }
            .padding(.top, 10).padding(.bottom, 4)

            ForEach(rows) { row in
                Rectangle().fill(ScoutMock.hairline).frame(height: 1)
                HStack(alignment: .center, spacing: 8) {
                    label(row.id).frame(width: Self.labelWidth, alignment: .leading)
                    Text(row.open)
                        .font(GaryFonts.mono(11.5)).foregroundStyle(ScoutMock.warm.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.now)
                        .font(GaryFonts.mono(11.5, bold: true)).foregroundStyle(ScoutMock.warm)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    badge(row.badge).frame(width: Self.badgeWidth, alignment: .trailing)
                }
                .padding(.vertical, 8)
            }

            if let gary {
                Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(height: 1)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    ScoutMock.kicker("GARY").foregroundStyle(GaryColors.gold).frame(width: Self.labelWidth, alignment: .leading)
                    Text(gary.label)
                        .font(GaryFonts.mono(11.5, bold: true)).foregroundStyle(GaryColors.gold)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Spacer(minLength: 6)
                    if let at = gary.postedAt {
                        ScoutMock.kicker("POSTED " + LineClock.label(at).uppercased())
                    }
                }
                .padding(.vertical, 8)
            }

            Rectangle().fill(ScoutMock.hairline).frame(height: 1)
            ForEach(story.lateOpens, id: \.market) { late in
                label("\(late.market) FIRST SEEN \(LineClock.label(late.seen))")
                    .padding(.top, 8)
            }
            HStack {
                ScoutMock.kicker("EVERY MOVE, IN ORDER")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(ScoutMock.warm.opacity(0.42))
            }
            .padding(.top, 9)
        }
        .padding(.horizontal, 15).padding(.bottom, 12)
        .background(ScoutMock.cardShape)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func badge(_ b: LineStory.Badge?) -> some View {
        switch b {
        case .moved(let text):
            Text(text).font(GaryFonts.mono(12, bold: true)).foregroundStyle(GaryColors.gold)
                .lineLimit(1).minimumScaleFactor(0.8)
        case .price:
            ScoutMock.kicker("PRICE")
        case .holds:
            ScoutMock.kicker("HOLDS")
        case nil:
            EmptyView()
        }
    }
}

// MARK: - The ladder sheet

/// Every rung in order — the departures-board version of the same story.
struct LineLadderSheet: View {
    let story: LineStory
    var gary: LineGaryAnchor? = nil
    let league: String
    @Environment(\.dismiss) private var dismiss

    private enum Line: Identifiable {
        case rung(LineRung, index: Int, last: Bool)
        case gary(LineGaryAnchor)
        var id: String {
            switch self {
            case .rung(let r, _, _): return "rung-\(r.seen_at)"
            case .gary: return "gary"
            }
        }
    }
    private var lines: [Line] {
        let rungs = story.ladder.rungs
        var out: [Line] = []
        var garyPlaced = false
        for (i, r) in rungs.enumerated() {
            if let gary, !garyPlaced, let at = gary.postedAt, let seen = r.seen, seen > at {
                out.append(.gary(gary)); garyPlaced = true
            }
            out.append(.rung(r, index: i, last: i == rungs.count - 1))
        }
        if let gary, !garyPlaced { out.append(.gary(gary)) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("THE LADDER").font(GaryFonts.display(20)).tracking(1.2).foregroundStyle(GaryColors.gold)
                    Text("\(story.awayAbbr) @ \(story.homeAbbr) · \(story.vendorName)")
                        .font(GaryFonts.mono(11)).foregroundStyle(ScoutMock.warm.opacity(0.62))
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(ScoutMock.warm.opacity(0.7))
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(Color.white.opacity(0.06)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 12)

            HStack(spacing: 8) {
                ScoutMock.kicker("WHEN").frame(width: 78, alignment: .leading)
                ScoutMock.kicker("SPREAD").frame(maxWidth: .infinity, alignment: .leading)
                ScoutMock.kicker("TOTAL").frame(width: 72, alignment: .leading)
                ScoutMock.kicker("MONEYLINE").frame(width: 82, alignment: .leading)
            }
            .padding(.horizontal, 18).padding(.bottom, 4)

            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    ForEach(lines) { line in
                        Rectangle().fill(ScoutMock.hairline).frame(height: 1)
                        row(line)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 32)
            }
        }
        .background(ScoutMock.card.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private func row(_ line: Line) -> some View {
        switch line {
        case .rung(let r, let index, let last):
            let when: String = {
                if last { return (story.started ? "CLOSE" : "NOW") }
                if index == 0 { return "OPEN" }
                return ""
            }()
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    if !when.isEmpty { ScoutMock.kicker(when).foregroundStyle(last ? GaryColors.gold : ScoutMock.warm.opacity(0.42)) }
                    Text(r.seen.map { LineClock.label($0) } ?? "—")
                        .font(GaryFonts.mono(10.5)).foregroundStyle(ScoutMock.warm.opacity(0.55))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(width: 78, alignment: .leading)
                cell(story.spreadText(r), strong: last).frame(maxWidth: .infinity, alignment: .leading)
                cell(story.totalText(r), strong: last).frame(width: 72, alignment: .leading)
                cell(story.moneylineText(r, bothSides: true), strong: last).frame(width: 82, alignment: .leading)
            }
            .padding(.vertical, 9)
        case .gary(let g):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    ScoutMock.kicker("GARY").foregroundStyle(GaryColors.gold)
                    if let at = g.postedAt {
                        Text(LineClock.label(at)).font(GaryFonts.mono(10.5)).foregroundStyle(GaryColors.gold.opacity(0.7))
                    }
                }
                .frame(width: 78, alignment: .leading)
                Text(g.label)
                    .font(GaryFonts.mono(11.5, bold: true)).foregroundStyle(GaryColors.gold)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 9)
        }
    }

    private func cell(_ text: String?, strong: Bool) -> some View {
        Text(text ?? "—")
            .font(GaryFonts.mono(11, bold: strong))
            .foregroundStyle(strong ? ScoutMock.warm : ScoutMock.warm.opacity(0.78))
            .fixedSize(horizontal: false, vertical: true)
    }
}
