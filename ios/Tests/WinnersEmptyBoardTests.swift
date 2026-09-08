// Actual Foundation Winners resolver and slate decoder; no network or rationale data.
var checks = 0
func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    precondition(condition(), message)
    checks += 1
}
func instant(_ raw: String) -> Date { ISO8601DateFormatter().date(from: raw)! }
func row(_ start: String? = nil, league: String = "MLB", kickoff: String? = nil,
         status: String? = nil) -> DailySlateRow {
    let json: [String: Any] = [
        "league": league, "away_team": "Fixture Away", "home_team": "Fixture Home",
        "commence_time": start as Any? ?? NSNull(), "scheduled_date": "2026-09-07",
        "kickoff_status": kickoff as Any? ?? NSNull(), "game_status": status as Any? ?? NSNull(),
        "bdl_game_id": 1
    ]
    return try! JSONDecoder().decode(DailySlateRow.self, from: JSONSerialization.data(withJSONObject: json))
}
let reported = instant("2026-09-08T04:02:00Z") // Sep 8 00:02 ET, still Sep 7's slate.
// All 11 MLB starts were at or before 02:05Z, and NCAAF was at 23:30Z.
let mlb = (0..<11).map { _ in row("2026-09-08T02:05:00Z") }
let ncaaf = [row("2026-09-07T23:30:00Z", league: "NCAAF", kickoff: "confirmed")]
let completedSlate = mlb + ncaaf
func phase(_ rows: [DailySlateRow], at now: Date = reported, historical: Bool = false,
           board: Bool = true, schedule: Bool = true) -> WinnersEmptyBoardPhase {
    WinnersEmptyBoardPhase.resolve(rows: rows, now: now, isHistorical: historical,
                                   boardSucceeded: board, scheduleSucceeded: schedule)
}
check(phase(completedSlate) == .closed, "12 September 7 starts passed")
check(phase(mlb) == .closed, "MLB league closes independently")
check(phase(ncaaf) == .closed, "NCAAF league closes independently")
check(phase(completedSlate).heading == "NO WINNERS SELECTIONS", "closed board never says yet")
check(!phase(mlb).message(league: "MLB").contains("yet"), "closed game lane never promises arrivals")
check(phase(mlb).message(league: "MLB", props: true).contains("Pregame selection windows have closed"), "closed prop lane explains why")
let nextStart = row("2026-09-08T05:00:00Z")
check(phase(mlb + [nextStart]) == .pending, "one future nightcap preserves pending board")
check(phase([nextStart] + mlb) == .pending, "row order cannot close an open window")
check(phase([nextStart], at: instant("2026-09-08T04:59:59Z")) == .pending, "second before kickoff remains open")
check(phase([nextStart], at: instant("2026-09-08T05:00:00Z")) == .closed, "exact kickoff closes window")
check(phase([nextStart], at: instant("2026-09-08T05:00:01Z")) == .closed, "clock refresh closes after kickoff")
check(phase([row("2026-09-08T04:01:59.123Z")]) == .closed, "fractional timestamps parse")
check(phase([row("2026-09-08T00:01:59-04:00")]) == .closed, "explicit timezone offsets parse")
check(phase([row()]) == .uncertain, "missing time cannot close a slate")
check(phase([row("bad-time")]) == .uncertain, "invalid time cannot close a slate")
check(phase([row("2026-09-07T00:00:00Z", kickoff: "date_only")]) == .uncertain, "date-only synthetic midnight is not kickoff")
check(phase([row(league: "NCAAF", kickoff: "date_only")]) == .uncertain, "real date-only college row stays neutral")
check(phase([row("2026-09-07T00:00:00Z", kickoff: "unconfirmed")]) == .uncertain, "unknown confirmation state stays neutral")
for status in ["delayed", "postponed", "suspended", "cancelled"] {
    check(phase([row("2026-09-07T01:00:00Z", status: status)]) == .uncertain, "\(status) does not close on old start")
}
check(phase(mlb + [row()]) == .uncertain, "one unknown game prevents a false closed board")
check(phase([row(), nextStart]) == .pending, "known future review remains possible alongside unknown game")
for status in ["live", "in_progress", "final", "completed"] {
    check(phase([row("2026-09-09T01:00:00Z", status: status)]) == .closed, "\(status) overrides stale future time")
}
check(phase([]) == .noGames, "successful empty schedule is not coming soon")
check(phase(completedSlate, schedule: false) == .unavailable, "cached rows from failed schedule cannot assert closure")
check(phase([], schedule: false) == .unavailable, "failed empty schedule is not a rest day")
check(phase(completedSlate, board: false) == .unavailable, "failed board cannot assert no admissions")
check(phase([], historical: true, schedule: false) == .historical, "archive empty remains dated without current slate")
check(phase([nextStart], historical: true) == .historical, "archive never borrows upcoming placeholders")
check(phase([], historical: true).message() == "No Winners selections on this date.", "historical message preserves contract")
check(phase([], historical: true, board: false) == .unavailable, "failed history does not masquerade as empty")
check(SupabaseAPI.todayEST(now: reported) == "2026-09-07", "00:02 ET intentionally retains September 7")
check(SupabaseAPI.todayEST(now: instant("2026-09-08T09:59:59Z")) == "2026-09-07", "05:59 ET retains prior slate")
check(SupabaseAPI.todayEST(now: instant("2026-09-08T10:00:00Z")) == "2026-09-08", "06:00 ET rolls slate")
print("PASS \(checks) actual Swift Winners empty-board checks")
