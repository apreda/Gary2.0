var dateChecks = 0
func verify(_ value: @autoclosure () -> Bool, _ message: String) {
    precondition(value(), message); dateChecks += 1
}
let old = "2026-09-07", current = "2026-09-08"
func reload(_ selected: String? = nil, _ loaded: String? = "2026-09-07", _ requested: String? = nil,
            _ today: String = "2026-09-08") -> Bool {
    WinnersBoardDates.shouldReload(selectedDate: selected, loadedDate: loaded, requestedDate: requested, today: today)
}
verify(!reload(nil, old, nil, old), "same loaded day does not poll unnecessarily")
verify(reload(), "visible current board reloads after 6AM")
verify(reload(nil, nil), "initial request crossing 6AM also recovers")
verify(reload(nil, old, old), "a previous-day request cannot block the new day")
verify(!reload(nil, old, current), "same-date in-flight request prevents duplicate fetches")
verify(!reload(nil, nil, current), "initial current request is shared")
verify(!reload(nil, current, nil), "successful current-day completion stops rollover retries")
verify(!reload(old, old), "manual history never advances automatically")
verify(!reload("2026-09-06", nil, nil), "missing historical load does not jump to Today")
verify(reload(nil, old, nil), "cancelled old request can retry after ownership cleanup")
verify(WinnersBoardDates.snapshotDate(selectedDate: nil, loadedDate: old, fallback: current) == old,
       "old visible props retain old result date across 6AM")
verify(WinnersBoardDates.snapshotDate(selectedDate: old, loadedDate: current, fallback: current) == old,
       "manual selection wins while its fetch is pending")
verify(WinnersBoardDates.snapshotDate(selectedDate: nil, loadedDate: current, fallback: old) == current,
       "fresh snapshot advances its lookup date")
verify(WinnersBoardDates.snapshotDate(selectedDate: nil, loadedDate: nil, fallback: current) == current,
       "first-load fallback is defined")
// The real header must identify a retained old snapshot by its own date.
struct HeaderFixture {
    var selectedDate: String? = nil
    var loadedBoardDate: String? = "2026-09-07"
    HEADER_FUNCTION
    var label: String { headerDateLabel }
}
verify(HeaderFixture().label == "SEP 7", "old board is not labeled Today after rollover")
verify(HeaderFixture(loadedBoardDate: current).label == "TODAY", "new board restores Today label")
verify(HeaderFixture(selectedDate: "2026-09-06", loadedBoardDate: current).label == "SEP 6", "explicit history retains its date")
verify(HeaderFixture(loadedBoardDate: nil).label == "TODAY", "unloaded initial board may label Today")
let start = Date(timeIntervalSince1970: 1_000)
func refresh(after seconds: Double, selected: String? = nil, loaded: String? = "2026-09-08",
             requested: String? = nil, lastAttempt: Date? = start) -> Bool {
    WinnersBoardDates.shouldRefresh(selectedDate: selected, loadedDate: loaded, requestedDate: requested,
                                   today: current, lastAttemptAt: lastAttempt, now: start.addingTimeInterval(seconds))
}
verify(!refresh(after: 89), "same-date board is throttled before 90 seconds")
verify(refresh(after: 90), "same-date board rechecks at 90 seconds without navigation")
verify(refresh(after: 91), "timer skew still allows the due refresh")
verify(!refresh(after: 180, requested: current), "long current request cannot overlap another refresh")
verify(refresh(after: 1, loaded: old), "rollover does not wait 90 seconds")
verify(!refresh(after: 1, loaded: old, requested: current), "reserved rollover request suppresses periodic duplicate")
verify(refresh(after: 1, loaded: old, requested: old), "new day supersedes an obsolete request")
verify(!refresh(after: 900, selected: old), "history stays static even after refresh interval")
verify(!refresh(after: 900, selected: current), "explicit date selection stays static")
verify(refresh(after: 0, lastAttempt: nil), "missing initial refresh receipt can recover")
verify(!refresh(after: 90, lastAttempt: start.addingTimeInterval(90)), "next attempt resets throttle")
verify(refresh(after: 180, lastAttempt: start.addingTimeInterval(90)), "released request becomes eligible again")
// An initial empty response and a later populated/graded response use the same
// scheduler: content count does not stop the request that discovers either.
verify(refresh(after: 90), "first new admission is discoverable from an empty board")
verify(refresh(after: 180, lastAttempt: start.addingTimeInterval(90)), "updated grades are discoverable after admission")
print("PASS \(dateChecks) actual Swift Winners board-date checks")
