// Standalone regression script for BookAnalytics.swift.
// Run: copy this file to a scratch main.swift and compile it with ios/GaryApp/BookAnalytics.swift (top-level code needs main.swift).
import Foundation

var checks = 0
func verify(_ value: @autoclosure () -> Bool, _ message: String) {
    precondition(value(), message); checks += 1
}
func near(_ a: Double?, _ b: Double, _ tolerance: Double = 0.001) -> Bool {
    guard let a else { return false }
    return abs(a - b) < tolerance
}

func entry(_ id: String, _ date: String, _ status: String, net: Double? = nil, stake: Double = 1,
           kind: String = "tail", league: String? = "MLB", market: String? = nil, book: String? = nil,
           tags: [String] = [], confidence: Double? = nil) -> BookEntry {
    BookEntry(id: id, date: date, kind: kind, status: status, stake: stake, net: net, odds: nil,
              league: league, market: market, bookmaker: book, tags: tags, confidence: confidence)
}

// ── Dates ──────────────────────────────────────────────────────────────────
verify(BookDates.weekday("2026-09-06") == 1, "Sep 6 2026 is a Sunday")
verify(BookDates.weekday("2026-09-09") == 4, "Sep 9 2026 is a Wednesday")
verify(BookDates.shift("2026-08-31", days: 1) == "2026-09-01", "month rollover")
verify(BookDates.shift("2026-03-08", days: 1) == "2026-03-09", "DST day still one calendar day")
verify(BookDates.daysInMonth(year: 2026, month: 2) == 28, "February 2026 has 28 days")
verify(BookDates.daysInMonth(year: 2028, month: 2) == 29, "leap year")

// ── The Book's day (rolls with the slate, 6 AM Eastern on the phone) ────────
func instant(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }
verify(BookDates.today(now: instant("2026-09-08T03:59:59Z")) == "2026-09-07", "23:59 ET is still that day")
verify(BookDates.today(now: instant("2026-09-08T04:00:00Z")) == "2026-09-07", "midnight ET stays on the sports day")
verify(BookDates.today(now: instant("2026-09-08T09:59:59Z")) == "2026-09-07", "5:59 AM ET stays on the sports day")
verify(BookDates.today(now: instant("2026-09-08T10:00:00Z")) == "2026-09-08", "6 AM ET rolls the day")
verify(BookDates.today(now: instant("2026-11-01T10:59:59Z")) == "2026-10-31", "5:59 AM EST after the DST end stays on Halloween")
verify(BookDates.today(now: instant("2026-11-01T11:00:00Z")) == "2026-11-01", "6 AM EST rolls the day")
verify(BookDates.today(now: instant("2026-09-08T07:00:00Z"), rolloverHour: 3) == "2026-09-08", "a 3 AM clock rolls at 3")

// ── Periods ────────────────────────────────────────────────────────────────
let week = BookPeriod.containing("2026-09-09", kind: .week)
verify(week.start == "2026-09-06" && week.end == "2026-09-12", "week runs Sunday to Saturday")
verify(week.label == "Sep 6 – 12", "week label within one month: \(week.label)")
verify(week.kicker == "SEP 6 – SEP 12, 2026", "week kicker: \(week.kicker)")
let spanning = BookPeriod.containing("2026-09-01", kind: .week)
verify(spanning.start == "2026-08-30" && spanning.label == "Aug 30 – Sep 5", "week spanning months: \(spanning.label)")
let month = BookPeriod.containing("2026-09-09", kind: .month)
verify(month.start == "2026-09-01" && month.end == "2026-09-30" && month.label == "September 2026", "month window")
verify(month.shifted(by: -1).label == "August 2026", "previous month")
verify(month.shifted(by: 4).label == "January 2027", "month paging crosses the year")
verify(month.shifted(by: -9).label == "December 2025", "month paging backwards across the year")
let year = BookPeriod.containing("2026-09-09", kind: .year)
verify(year.start == "2026-01-01" && year.end == "2026-12-31" && year.label == "2026", "year window")
verify(!month.canMoveForward(today: "2026-09-09"), "cannot page past the current month")
verify(month.shifted(by: -1).canMoveForward(today: "2026-09-09"), "August can page forward to September")
verify(week.shifted(by: 1).start == "2026-09-13", "next week")
let all = BookPeriod.containing("2026-09-09", kind: .all)
verify(all.contains("1999-01-01") && all.contains("2030-12-31") && all.shifted(by: 3) == all, "ALL holds everything and never moves")
verify(!all.canMoveForward(today: "2026-09-09"), "ALL has no forward page")

// ── Summary ────────────────────────────────────────────────────────────────
let sample = [
    entry("a", "2026-09-01", "won", net: 0.91, stake: 1),
    entry("b", "2026-09-01", "lost", net: -1, stake: 1),
    entry("c", "2026-09-02", "push", net: 0, stake: 1),
    entry("d", "2026-09-03", "won", net: 1.5, stake: 1.5),
    entry("e", "2026-09-04", "pending", net: nil, stake: 2),
    entry("f", "2026-09-05", "void", net: 0, stake: 1),
]
let s = BookSummary.of(sample)
verify(s.wins == 2 && s.losses == 1 && s.pushes == 1, "record counts wins, losses, pushes")
verify(near(s.profit, 1.41), "profit sums settled net only")
verify(near(s.staked, 3.5), "staked counts decided plays only (not pushes, voids, pending)")
verify(near(s.roi, 1.41 / 3.5 * 100), "roi = profit / staked")
verify(s.record == "2-1-1", "record string shows pushes when present: \(s.record)")
verify(BookSummary.of([]).roi == nil && BookSummary.of([]).record == "0-0", "empty summary")

// ── Calendar ───────────────────────────────────────────────────────────────
let grid = BookCalendar.month(year: 2026, month: 9, entries: sample + [
    entry("g", "2026-08-31", "won", net: 2),          // previous month, shows dimmed
    entry("h", "2026-10-01", "lost", net: -1),        // next month
])
verify(grid.weeks.count == 6 && grid.weeks.allSatisfy { $0.count == 7 }, "six rows of seven")
verify(grid.weeks[0][0].date == "2026-08-30" && !grid.weeks[0][0].inMonth, "grid starts on the Sunday before the 1st")
verify(grid.weeks[0][2].date == "2026-09-01" && grid.weeks[0][2].inMonth, "September 1 sits on Tuesday")
verify(near(grid.weeks[0][2].net, -0.09) && grid.weeks[0][2].settledCount == 2, "day net sums both plays")
verify(grid.weeks[0][3].net != nil && near(grid.weeks[0][3].net, 0) && grid.weeks[0][3].settledCount == 1, "a push day is active at zero")
verify(grid.weeks[0][5].net == nil && grid.weeks[0][5].pendingCount == 1 && grid.weeks[0][5].hasActivity, "pending-only day has no net but shows activity")
verify(near(grid.net, 1.41) && grid.settledCount == 5 && grid.activeDays == 4, "month totals ignore other months (a void is a settled entry at zero): \(grid.net) \(grid.settledCount) \(grid.activeDays)")
verify(grid.weeks[0][1].net == 2 && !grid.weeks[0][1].inMonth, "out-of-month cell still carries its own net")
verify(grid.title == "September 2026" && grid.kicker == "SEPTEMBER 2026", "month title")
verify(grid.period == month, "grid period matches the month period")
let feb = BookCalendar.month(year: 2026, month: 2, entries: [])
verify(feb.weeks[0][0].date == "2026-02-01" && feb.weeks[0][0].inMonth, "a month starting on Sunday has no leading days")

// ── Breakdowns ─────────────────────────────────────────────────────────────
let mixed = [
    entry("1", "2026-09-01", "won", net: 0.9, league: "MLB", market: "moneyline", book: "DraftKings", tags: ["live", "promo"], confidence: 0.61),
    entry("2", "2026-09-01", "lost", net: -1, league: "MLB", market: "spread", book: "DraftKings", tags: ["live"], confidence: 0.56),
    entry("3", "2026-09-02", "won", net: 1.2, league: "NFL", market: nil, book: nil, tags: [], confidence: 0.53),
    entry("4", "2026-09-02", "won", net: 0.8, kind: "fade", league: "NFL", market: "moneyline", confidence: 0.58),
    entry("5", "2026-09-03", "lost", net: -1, kind: "manual", league: "NCAAF", market: "parlay", book: "FanDuel", tags: ["parlay"]),
    entry("6", "2026-09-03", "pending", net: nil, league: "MLB", market: "total"),
    entry("7", "2026-09-04", "void", net: 0, league: "MLB", market: "total"),
]
let byLeague = BookBreakdown.rows(mixed, by: .league)
verify(byLeague.map(\.label) == ["NFL", "MLB", "NCAAF"], "leagues tie on plays, then net breaks it: \(byLeague.map(\.label))")
verify(byLeague[1].record == "1-1" && near(byLeague[1].net, -0.1), "MLB row: pending and void excluded")
verify(byLeague[0].winPct == 100 && near(byLeague[0].net, 2.0), "NFL row")
let byMarket = BookBreakdown.rows(mixed, by: .market)
verify(byMarket.map(\.label) == ["MONEYLINE", "PARLAY", "SPREAD", "UNTYPED"] || byMarket.first?.label == "MONEYLINE", "market rows: \(byMarket.map(\.label))")
verify(byMarket.first { $0.label == "UNTYPED" }?.played == 1, "untyped rows counted")
let byBook = BookBreakdown.rows(mixed, by: .bookmaker)
verify(byBook.first?.label == "DRAFTKINGS" && byBook.first?.played == 2, "book rows: \(byBook.map(\.label))")
verify(byBook.contains { $0.label == "NOT SET" && $0.played == 2 }, "unset sportsbook grouped")
let byTags = BookBreakdown.rows(mixed, by: .tags)
verify(byTags.first?.label == "LIVE" && byTags.first?.played == 2, "a tag counts every bet carrying it: \(byTags.map(\.label))")
verify(byTags.contains { $0.label == "PROMO" && $0.played == 1 }, "second tag on the same bet counts once")
let bySide = BookBreakdown.rows(mixed, by: .side)
verify(bySide.map(\.label) == ["RIDING GARY", "FADING GARY"], "side rows in fixed order: \(bySide.map(\.label))")
verify(bySide[0].record == "2-1" && bySide[1].record == "1-0", "manual plays never enter the vs-Gary split")
let byLean = BookBreakdown.rows(mixed, by: .confidence)
verify(byLean.map(\.label) == ["STRONG LEAN", "SOLID LEAN", "SLIGHT LEAN"], "lean tiers in fixed order: \(byLean.map(\.label))")
verify(byLean[1].played == 2, "solid lean holds the 0.56 and 0.58 plays")
verify(BookBreakdown.leanTier(nil) == "No lean recorded", "nil confidence labelled")
verify(BookBreakdown.rows([], by: .league).isEmpty, "empty breakdown")

// ── Bankroll ───────────────────────────────────────────────────────────────
let rolling = BookBankroll.rolling([
    entry("r1", "2026-09-09", "won", net: 1),
    entry("r2", "2026-08-12", "lost", net: -1),      // 29 days back: inside 30
    entry("r3", "2026-08-11", "won", net: 3),        // 30 days back: outside 30, inside 60
    entry("r4", "2026-06-12", "lost", net: -1),      // 89 days back: the first day inside 90
    entry("r5", "2026-06-11", "won", net: 0.5),      // 90 days back: outside 90
], today: "2026-09-09")
verify(rolling.map(\.days) == [30, 60, 90], "three windows")
verify(rolling[0].start == "2026-08-11", "30-day window starts 29 days back: \(rolling[0].start)")
verify(near(rolling[0].summary.profit, 3.0), "30D includes Aug 11 through today: \(rolling[0].summary.profit)")
verify(near(rolling[1].summary.profit, 3.0), "60D: \(rolling[1].summary.profit)")
verify(rolling[2].start == "2026-06-12" && near(rolling[2].summary.profit, 2.0), "90D includes Jun 12, excludes Jun 11: \(rolling[2].summary.profit)")

// ── Tags ───────────────────────────────────────────────────────────────────
verify(BookTags.normalize("  Live Bet ") == "live bet", "tags lowercase and trim")
verify(BookTags.normalize("#Promo!") == "promo", "unsafe characters dropped")
verify(BookTags.normalize("   ") == nil && BookTags.normalize("---") == nil, "empty or symbol-only tags rejected")
verify(BookTags.normalize(String(repeating: "a", count: 40))?.count == 24, "tags capped at 24 characters")
verify(BookTags.parse("live, PROMO,live,, under") == ["live", "promo", "under"], "parse splits, dedupes, cleans")
verify(BookTags.adding("x", to: Array(repeating: "t", count: 8)).count == 8, "cap at 8 tags")
verify(BookTags.popular(mixed) == ["live", "parlay", "promo"], "popular tags by use: \(BookTags.popular(mixed))")
verify(BookMarket.label("moneyline") == "MONEYLINE" && BookMarket.label(nil) == "UNTYPED" && BookMarket.shortLabel("prop") == "PROP", "market labels")

print("BookAnalytics: \(checks) checks passed")
