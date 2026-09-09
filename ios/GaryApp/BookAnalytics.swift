import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK ANALYTICS — pure math for the calendar, period pager, breakdowns,
// bankroll windows and tags (Sep 9 2026). Foundation only: the test script in
// ios/Tests/BookAnalyticsTests.swift compiles this file on its own.
//
// Every date here is an Eastern calendar date string ("yyyy-MM-dd"), the same
// key the ledger, the graders and the leaderboard use.
// ─────────────────────────────────────────────────────────────────────────────

/// The slice of a bet the analytics need. `UserBet` maps to it; tests build it directly.
struct BookEntry: Identifiable, Equatable {
    let id: String
    let date: String
    let kind: String            // tail | fade | manual
    let status: String          // pending | won | lost | push | void
    let stake: Double
    let net: Double?
    let odds: Int?
    let league: String?
    let market: String?
    let bookmaker: String?
    let tags: [String]
    let confidence: Double?

    init(id: String, date: String, kind: String, status: String, stake: Double, net: Double?,
         odds: Int? = nil, league: String? = nil, market: String? = nil, bookmaker: String? = nil,
         tags: [String] = [], confidence: Double? = nil) {
        self.id = id; self.date = date; self.kind = kind; self.status = status; self.stake = stake
        self.net = net; self.odds = odds; self.league = league; self.market = market
        self.bookmaker = bookmaker; self.tags = tags; self.confidence = confidence
    }

    var isPending: Bool { status == "pending" }
    var isSettled: Bool { status != "pending" }
    var isDecided: Bool { status == "won" || status == "lost" }
    var isVerified: Bool { kind == "tail" || kind == "fade" }
    var netValue: Double { net ?? 0 }
}

// MARK: - Eastern calendar dates

enum BookDates {
    static let zone = TimeZone(identifier: "America/New_York")!

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zone
        c.firstWeekday = 1
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ value: String) -> Date? { formatter.date(from: value) }
    static func string(_ date: Date) -> String { formatter.string(from: date) }

    /// The Book's day rolls with the pick slate, not at midnight: NFL and MLB
    /// games often finish after midnight, and a fan still watching stays on the
    /// day (and the week) that game belongs to (founder, Sep 9). The app passes
    /// its slate rollover hour (SupabaseAPI.slateRolloverHourET, 6 AM ET).
    static func today(now: Date = Date(), rolloverHour: Int = 6) -> String {
        let hour = calendar.component(.hour, from: now)
        return hour < rolloverHour ? shift(string(now), days: -1) : string(now)
    }

    static func shift(_ value: String, days: Int) -> String {
        guard let d = parse(value), let moved = calendar.date(byAdding: .day, value: days, to: d) else { return value }
        return string(moved)
    }

    static func components(_ value: String) -> (year: Int, month: Int, day: Int)? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return (parts[0], parts[1], parts[2])
    }

    static func make(year: Int, month: Int, day: Int) -> String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func daysInMonth(year: Int, month: Int) -> Int {
        guard let d = parse(make(year: year, month: month, day: 1)),
              let range = calendar.range(of: .day, in: .month, for: d) else { return 30 }
        return range.count
    }

    /// 1 = Sunday … 7 = Saturday, matching the S M T W T F S header.
    static func weekday(_ value: String) -> Int {
        guard let d = parse(value) else { return 1 }
        return calendar.component(.weekday, from: d)
    }

    static func monthName(_ month: Int, short: Bool = false) -> String {
        let names = short
            ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        return names[max(0, min(11, month - 1))]
    }

    /// "Sep 4" style label for a date string.
    static func shortLabel(_ value: String) -> String {
        guard let c = components(value) else { return value }
        return "\(monthName(c.month, short: true)) \(c.day)"
    }
}

// MARK: - Periods (WEEK · MONTH · YEAR · ALL)

enum BookPeriodKind: String, CaseIterable {
    case week, month, year, all

    var title: String {
        switch self {
        case .week: return "WEEK"
        case .month: return "MONTH"
        case .year: return "YEAR"
        case .all: return "ALL"
        }
    }
}

/// A calendar-aligned window, inclusive on both ends. Weeks run Sunday to
/// Saturday, the same way the calendar grid reads.
struct BookPeriod: Equatable {
    let kind: BookPeriodKind
    let start: String
    let end: String

    /// Earliest verified-record day; "ALL" starts here for labeling only.
    static let recordStart = "2026-03-01"

    static func containing(_ date: String, kind: BookPeriodKind) -> BookPeriod {
        switch kind {
        case .all:
            return BookPeriod(kind: .all, start: "0000-01-01", end: "9999-12-31")
        case .week:
            let back = BookDates.weekday(date) - 1
            let start = BookDates.shift(date, days: -back)
            return BookPeriod(kind: .week, start: start, end: BookDates.shift(start, days: 6))
        case .month:
            guard let c = BookDates.components(date) else { return BookPeriod(kind: .month, start: date, end: date) }
            let days = BookDates.daysInMonth(year: c.year, month: c.month)
            return BookPeriod(kind: .month, start: BookDates.make(year: c.year, month: c.month, day: 1),
                              end: BookDates.make(year: c.year, month: c.month, day: days))
        case .year:
            guard let c = BookDates.components(date) else { return BookPeriod(kind: .year, start: date, end: date) }
            return BookPeriod(kind: .year, start: BookDates.make(year: c.year, month: 1, day: 1),
                              end: BookDates.make(year: c.year, month: 12, day: 31))
        }
    }

    func contains(_ date: String) -> Bool { date >= start && date <= end }

    /// The neighbouring period; ALL never moves.
    func shifted(by steps: Int) -> BookPeriod {
        guard kind != .all, steps != 0 else { return self }
        switch kind {
        case .week:
            return BookPeriod.containing(BookDates.shift(start, days: 7 * steps), kind: .week)
        case .month:
            guard let c = BookDates.components(start) else { return self }
            let index = c.year * 12 + (c.month - 1) + steps
            let year = index / 12, month = index % 12 + 1
            return BookPeriod.containing(BookDates.make(year: year, month: month, day: 1), kind: .month)
        case .year:
            guard let c = BookDates.components(start) else { return self }
            return BookPeriod.containing(BookDates.make(year: c.year + steps, month: 1, day: 1), kind: .year)
        case .all:
            return self
        }
    }

    /// Forward paging stops at the period that holds today.
    func canMoveForward(today: String) -> Bool {
        kind != .all && shifted(by: 1).start <= today
    }

    var label: String {
        switch kind {
        case .all: return "All time"
        case .week:
            guard let s = BookDates.components(start), let e = BookDates.components(end) else { return "\(start) – \(end)" }
            let left = "\(BookDates.monthName(s.month, short: true)) \(s.day)"
            let right = s.month == e.month ? "\(e.day)" : "\(BookDates.monthName(e.month, short: true)) \(e.day)"
            return s.year == e.year ? "\(left) – \(right)" : "\(left), \(s.year) – \(right), \(e.year)"
        case .month:
            guard let c = BookDates.components(start) else { return start }
            return "\(BookDates.monthName(c.month)) \(c.year)"
        case .year:
            return String(start.prefix(4))
        }
    }

    /// The kicker under the pager: "SEP 4 – SEP 10, 2026" / "SEPTEMBER 2026" / "2026" / "ALL TIME".
    var kicker: String {
        switch kind {
        case .week:
            guard let s = BookDates.components(start), let e = BookDates.components(end) else { return label.uppercased() }
            return "\(BookDates.monthName(s.month, short: true)) \(s.day) – \(BookDates.monthName(e.month, short: true)) \(e.day), \(e.year)".uppercased()
        default:
            return label.uppercased()
        }
    }
}

// MARK: - Summary strip (PROFIT · ROI · RECORD)

struct BookSummary: Equatable {
    let wins: Int
    let losses: Int
    let pushes: Int
    let profit: Double
    let staked: Double
    let settledCount: Int

    var decided: Int { wins + losses }
    var roi: Double? { staked > 0 ? profit / staked * 100 : nil }
    var winPct: Double? { decided > 0 ? Double(wins) / Double(decided) * 100 : nil }
    var record: String { "\(wins)-\(losses)" + (pushes > 0 ? "-\(pushes)" : "") }

    static func of(_ entries: [BookEntry]) -> BookSummary {
        var w = 0, l = 0, p = 0, profit = 0.0, staked = 0.0, settled = 0
        for e in entries where e.isSettled {
            settled += 1
            profit += e.netValue
            switch e.status {
            case "won": w += 1; staked += e.stake
            case "lost": l += 1; staked += e.stake
            case "push": p += 1
            default: break
            }
        }
        return BookSummary(wins: w, losses: l, pushes: p, profit: profit, staked: staked, settledCount: settled)
    }
}

// MARK: - The calendar

struct BookDayCell: Identifiable, Equatable {
    let date: String
    let day: Int
    let inMonth: Bool
    /// Net of settled entries that day; nil when nothing settled.
    let net: Double?
    let settledCount: Int
    let pendingCount: Int
    var id: String { date }
    var hasActivity: Bool { settledCount > 0 || pendingCount > 0 }
}

struct BookMonthGrid: Equatable {
    let year: Int
    let month: Int
    let net: Double
    let settledCount: Int
    let activeDays: Int
    /// Always six rows of seven so the grid never jumps height between months.
    let weeks: [[BookDayCell]]

    var title: String { "\(BookDates.monthName(month)) \(year)" }
    var kicker: String { title.uppercased() }
    var period: BookPeriod { BookPeriod.containing(BookDates.make(year: year, month: month, day: 1), kind: .month) }
}

enum BookCalendar {
    static func month(year: Int, month: Int, entries: [BookEntry]) -> BookMonthGrid {
        let first = BookDates.make(year: year, month: month, day: 1)
        let days = BookDates.daysInMonth(year: year, month: month)
        let lead = BookDates.weekday(first) - 1
        let gridStart = BookDates.shift(first, days: -lead)

        var settledNet: [String: Double] = [:]
        var settledCount: [String: Int] = [:]
        var pendingCount: [String: Int] = [:]
        for e in entries {
            if e.isPending {
                pendingCount[e.date, default: 0] += 1
            } else {
                settledNet[e.date, default: 0] += e.netValue
                settledCount[e.date, default: 0] += 1
            }
        }

        var weeks: [[BookDayCell]] = []
        var cursor = gridStart
        for _ in 0..<6 {
            var row: [BookDayCell] = []
            for _ in 0..<7 {
                let c = BookDates.components(cursor)
                let inMonth = c?.year == year && c?.month == month
                let settled = settledCount[cursor] ?? 0
                row.append(BookDayCell(date: cursor, day: c?.day ?? 0, inMonth: inMonth,
                                       net: settled > 0 ? settledNet[cursor] : nil,
                                       settledCount: settled, pendingCount: pendingCount[cursor] ?? 0))
                cursor = BookDates.shift(cursor, days: 1)
            }
            weeks.append(row)
        }

        let monthStart = first, monthEnd = BookDates.make(year: year, month: month, day: days)
        let inMonthKeys = settledCount.keys.filter { $0 >= monthStart && $0 <= monthEnd }
        let net = inMonthKeys.reduce(0.0) { $0 + (settledNet[$1] ?? 0) }
        let count = inMonthKeys.reduce(0) { $0 + (settledCount[$1] ?? 0) }
        return BookMonthGrid(year: year, month: month, net: net, settledCount: count,
                             activeDays: inMonthKeys.count, weeks: weeks)
    }

    static func monthOf(_ date: String) -> (year: Int, month: Int) {
        let c = BookDates.components(date)
        return (c?.year ?? 2026, c?.month ?? 1)
    }
}

// MARK: - Breakdowns (LEAGUE · TYPE · BOOK · TAGS · VS GARY)

enum BookBreakdownDimension: String, CaseIterable {
    case league, market, bookmaker, tags, side, confidence

    var title: String {
        switch self {
        case .league: return "LEAGUE"
        case .market: return "TYPE"
        case .bookmaker: return "BOOK"
        case .tags: return "TAGS"
        case .side: return "VS GARY"
        case .confidence: return "LEAN"
        }
    }

    var columnHeader: String {
        switch self {
        case .league: return "LEAGUE"
        case .market: return "BET TYPE"
        case .bookmaker: return "SPORTSBOOK"
        case .tags: return "TAG"
        case .side: return "SIDE"
        case .confidence: return "LEAN"
        }
    }

    /// What an empty table says, in the app's plain voice.
    var emptyLine: String {
        switch self {
        case .league: return "No settled plays in this view yet."
        case .market: return "Bet types show once settled plays carry one. Gary's picks are typed automatically; choose a type when you log an outside bet."
        case .bookmaker: return "Add a sportsbook when you log an outside bet to compare books here."
        case .tags: return "Tag a bet (live, promo, primetime) and each tag gets its own line here."
        case .side: return "Ride or fade a pick from its card. Your record against Gary lands here."
        case .confidence: return "Verified picks split by how strongly Gary leaned when you rode or faded them."
        }
    }
}

struct BookBreakdownRow: Identifiable, Equatable {
    let key: String
    let label: String
    let wins: Int
    let losses: Int
    let pushes: Int
    let net: Double
    var id: String { key }
    var played: Int { wins + losses + pushes }
    var decided: Int { wins + losses }
    var winPct: Double? { decided > 0 ? Double(wins) / Double(decided) * 100 : nil }
    var record: String { "\(wins)-\(losses)" + (pushes > 0 ? "-\(pushes)" : "") }
}

enum BookMarket {
    /// Picker order for an outside bet.
    static let options: [(key: String, label: String)] = [
        ("moneyline", "Moneyline"), ("spread", "Spread"), ("total", "Total"),
        ("prop", "Prop"), ("parlay", "Parlay"), ("other", "Other"),
    ]

    static func label(_ market: String?) -> String {
        switch (market ?? "").lowercased() {
        case "moneyline": return "MONEYLINE"
        case "spread": return "SPREAD"
        case "total": return "TOTAL"
        case "prop": return "PLAYER PROP"
        case "parlay": return "PARLAY"
        case "other": return "OTHER"
        default: return "UNTYPED"
        }
    }

    static func shortLabel(_ market: String?) -> String {
        switch (market ?? "").lowercased() {
        case "moneyline": return "ML"
        case "spread": return "SPREAD"
        case "total": return "TOTAL"
        case "prop": return "PROP"
        case "parlay": return "PARLAY"
        case "other": return "OTHER"
        default: return ""
        }
    }
}

enum BookBreakdown {
    /// Gary's stated lean, in the tiers the Billfold already uses to read him.
    static func leanTier(_ confidence: Double?) -> String {
        guard let c = confidence else { return "No lean recorded" }
        if c >= 0.60 { return "Strong lean" }
        if c >= 0.55 { return "Solid lean" }
        return "Slight lean"
    }

    static func rows(_ entries: [BookEntry], by dimension: BookBreakdownDimension) -> [BookBreakdownRow] {
        var order: [String] = []
        var labels: [String: String] = [:]
        var wins: [String: Int] = [:], losses: [String: Int] = [:], pushes: [String: Int] = [:], net: [String: Double] = [:]

        func add(_ key: String, _ label: String, _ e: BookEntry) {
            if labels[key] == nil { labels[key] = label; order.append(key) }
            switch e.status {
            case "won": wins[key, default: 0] += 1
            case "lost": losses[key, default: 0] += 1
            case "push": pushes[key, default: 0] += 1
            default: return
            }
            net[key, default: 0] += e.netValue
        }

        for e in entries where e.isSettled && e.status != "void" {
            switch dimension {
            case .league:
                let lg = (e.league ?? "").trimmingCharacters(in: .whitespaces).uppercased()
                add(lg.isEmpty ? "OTHER" : lg, lg.isEmpty ? "OTHER" : lg, e)
            case .market:
                let key = (e.market ?? "").lowercased().isEmpty ? "untyped" : e.market!.lowercased()
                add(key, BookMarket.label(e.market), e)
            case .bookmaker:
                let book = (e.bookmaker ?? "").trimmingCharacters(in: .whitespaces)
                let key = book.isEmpty ? "unset" : book.lowercased()
                add(key, book.isEmpty ? "NOT SET" : book.uppercased(), e)
            case .tags:
                for tag in e.tags {
                    let t = tag.trimmingCharacters(in: .whitespaces).lowercased()
                    if !t.isEmpty { add(t, t.uppercased(), e) }
                }
            case .side:
                guard e.isVerified else { continue }
                add(e.kind, e.kind == "tail" ? "RIDING GARY" : "FADING GARY", e)
            case .confidence:
                guard e.isVerified else { continue }
                let tier = leanTier(e.confidence)
                add(tier, tier.uppercased(), e)
            }
        }

        var rows = order.map { key in
            BookBreakdownRow(key: key, label: labels[key] ?? key, wins: wins[key] ?? 0, losses: losses[key] ?? 0,
                             pushes: pushes[key] ?? 0, net: net[key] ?? 0)
        }.filter { $0.played > 0 }

        switch dimension {
        case .side:
            rows.sort { ($0.key == "tail" ? 0 : 1) < ($1.key == "tail" ? 0 : 1) }
        case .confidence:
            let rank = ["strong lean": 0, "solid lean": 1, "slight lean": 2, "no lean recorded": 3]
            rows.sort { (rank[$0.key.lowercased()] ?? 9) < (rank[$1.key.lowercased()] ?? 9) }
        default:
            // Most played first, net breaks ties; the "not set" bucket always sinks.
            let placeholder: Set<String> = ["unset", "untyped"]
            rows.sort { a, b in
                let pa = placeholder.contains(a.key), pb = placeholder.contains(b.key)
                if pa != pb { return !pa }
                if a.played != b.played { return a.played > b.played }
                if a.net != b.net { return a.net > b.net }
                return a.label < b.label
            }
        }
        return rows
    }
}

// MARK: - Bankroll windows (rolling 30 / 60 / 90 days)

struct BookRollingWindow: Identifiable, Equatable {
    let days: Int
    let start: String
    let end: String
    let summary: BookSummary
    var id: Int { days }
    var title: String { "\(days)D" }
}

enum BookBankroll {
    static func rolling(_ entries: [BookEntry], today: String, days: [Int] = [30, 60, 90]) -> [BookRollingWindow] {
        days.map { n in
            let start = BookDates.shift(today, days: -(n - 1))
            let inWindow = entries.filter { $0.date >= start && $0.date <= today }
            return BookRollingWindow(days: n, start: start, end: today, summary: BookSummary.of(inWindow))
        }
    }
}

// MARK: - Tags

enum BookTags {
    static let maxPerBet = 8
    static let maxLength = 24
    private static let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789 _.-")

    /// Lowercased, trimmed, allowed characters only; nil when nothing survives.
    static func normalize(_ raw: String) -> String? {
        let lowered = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !lowered.isEmpty else { return nil }
        let kept = String(lowered.unicodeScalars.filter { allowed.contains($0) })
            .trimmingCharacters(in: .whitespaces)
        guard let first = kept.first, first.isLetter || first.isNumber else { return nil }
        return String(kept.prefix(maxLength))
    }

    /// Adds one tag to a list, keeping order, uniqueness and the cap.
    static func adding(_ raw: String, to tags: [String]) -> [String] {
        guard let tag = normalize(raw), !tags.contains(tag), tags.count < maxPerBet else { return tags }
        return tags + [tag]
    }

    /// Splits "live, promo, under" into clean tags.
    static func parse(_ text: String) -> [String] {
        text.split(whereSeparator: { $0 == "," || $0 == "\n" })
            .reduce(into: [String]()) { acc, piece in acc = adding(String(piece), to: acc) }
    }

    /// Every distinct tag across a book, most used first.
    static func popular(_ entries: [BookEntry], limit: Int = 12) -> [String] {
        var counts: [String: Int] = [:]
        for e in entries { for t in e.tags { counts[t, default: 0] += 1 } }
        return counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
            .prefix(limit).map(\.key)
    }
}
