import { it, expect } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

// PicksHistory.swift imports Combine, which Linux swift-corelibs does not ship.
// The required Apple CI job owns this case; Linux still runs the backend tests.
const hasAppleCombine = process.platform === 'darwin' && hasSwiftCompiler;
if (process.env.GARY_REQUIRE_APPLE_FRAMEWORK_TESTS === '1' && !hasAppleCombine) {
  throw new Error('Apple Combine tests require macOS and swiftc; refusing to silently skip CI coverage');
}

it.skipIf(!hasAppleCombine)('loads only selected weeks, bounds cache, retains failed snapshots and rejects stale completions', () => {
  const output = runSwiftFixture(['Models/ProviderIdentity.swift', 'Picks/PicksGameLifecycle.swift', 'Picks/PicksSettledProps.swift', 'Picks/PicksHistory.swift'], `
import Foundation
struct StringOrNumber { let value: String }
struct GaryPick { var league: String? = "MLB" }
struct PropPick { var effectiveLeague: String? = "MLB" }
struct DailySlateRow {}
struct GameResult {
 var league: String? = "MLB"; var game_date: String? = "2026-10-05"; var game_id: String? = "42"
 var pick_text: String? = "Away ML"; var result: String? = "won"; var displayFinalScore: String? = "3-1"
}
struct PropResult {
 var effectiveLeague: String? = "MLB"; var game_date: String? = "2026-10-05"; var game_id: StringOrNumber? = StringOrNumber(value: "42")
 var player_name: String? = "Player"; var prop_type: String? = "hits"; var bet: String? = "over"
 var line_value: StringOrNumber? = StringOrNumber(value: "1.5"); var result: String? = "won"
}
enum GamePageDataScope {
 static func shiftDay(_ day: String, _ offset: Int) -> String? {
  let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(secondsFromGMT: 0)
  return f.date(from: day).map { f.string(from: $0.addingTimeInterval(Double(offset) * 86400)) }
 }
}
@MainActor enum SupabaseAPI {
 static var calls: [String: Int] = [:]
 static var failure = false
 static var held: String?
 static var waiter: CheckedContinuation<Void, Never>?
 static func isCancellation(_ error: Error) -> Bool { error is CancellationError }
 static func fetchNFLPicksWeeks() async throws -> [NFLPicksWeek] { [] }
 static func fetchNCAAFPicksWeeks() async throws -> [NFLPicksWeek] { [] }
 static func fetchNCAAFPicksHistory(week: NFLPicksWeek) async throws -> NFLPicksHistory { try await fetchNFLPicksHistory(week: week) }
 static func fetchNFLPicksHistory(week: NFLPicksWeek) async throws -> NFLPicksHistory {
  calls[week.id, default: 0] += 1
  if failure { throw URLError(.notConnectedToInternet) }
  if held == week.id { await withCheckedContinuation { waiter = $0 } }
  return NFLPicksHistory(week: week, picks: [], props: [], slate: [], games: PicksSettledGames(), propGrades: PicksSettledProps())
 }
 // The four daily reads a chosen past day makes (founder, Oct 7 2026).
 static var dayReads: Set<String> = []
 static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
  dayReads.insert("picks|" + date); return [GaryPick(league: "MLB"), GaryPick(league: "NFL")]
 }
 static func fetchPropPicks(date: String, forceRefresh: Bool = false, through: String? = nil) async throws -> [PropPick] {
  dayReads.insert("props|" + date + "|" + (through ?? "")); return [PropPick(effectiveLeague: "MLB"), PropPick(effectiveLeague: "NFL")]
 }
 static func fetchGameResults(since: String?) async throws -> [GameResult] {
  dayReads.insert("games|" + (since ?? "")); return [GameResult(), GameResult(league: "NFL"), GameResult(game_date: "2026-10-04")]
 }
 static func fetchPropResults(since: String?, forceRefresh: Bool = false, through: String? = nil, league: String? = nil) async throws -> [PropResult] {
  dayReads.insert("grades|" + (since ?? "") + "|" + (through ?? "") + "|" + (league ?? "")); return [PropResult(), PropResult(game_date: "2026-10-04")]
 }
}
Task { @MainActor in
 let store = PicksHistoryStore()
 precondition(NFLPicksWeek(week_start: "2026-08-25", week_number: 4, season: 2026).shortLabel == "PRESEASON WEEK 4")
 precondition(NFLPicksWeek(week_start: "2026-09-08", week_number: 1, season: 2026).label == "Week 1")
 precondition(SupabaseAPI.calls.isEmpty)
 let weeks = ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"].enumerated().map { NFLPicksWeek(week_start: $0.element, week_number: $0.offset + 1, season: 2026) }
 await store.select(weeks[0]); await store.select(weeks[0])
 precondition(SupabaseAPI.calls[weeks[0].id] == 1)
 SupabaseAPI.failure = true
 await store.select(weeks[0], force: true)
 precondition(store.failed && store.snapshot?.week == weeks[0])
 SupabaseAPI.failure = false
 for week in weeks.dropFirst() { await store.select(week) }
 await store.select(weeks[0])
 precondition(SupabaseAPI.calls[weeks[0].id] == 3, "Fourth week evicts oldest; no season preload")
 SupabaseAPI.held = weeks[1].id
 let old = Task { await store.select(weeks[1], force: true) }
 while SupabaseAPI.waiter == nil { await Task.yield() }
 await store.select(weeks[2])
 SupabaseAPI.waiter?.resume(); await old.value
 precondition(store.snapshot?.week == weeks[2] && !store.loading)
 await store.select(nil)
 precondition(store.snapshot == nil && !store.loading)
 // One past day of a daily league (founder, Oct 7 2026): read only when it is
 // chosen, with the four daily reads scoped to that date, kept to its league and day.
 let day = NFLPicksWeek.day("2026-10-05", league: "MLB")
 precondition(day.days == 1 && day.id == "MLB|2026-10-05" && day.label == "Oct 5" && day.end == "2026-10-05")
 await store.select(day)
 precondition(SupabaseAPI.dayReads == ["picks|2026-10-05", "props|2026-10-05|2026-10-05", "games|2026-10-05", "grades|2026-10-05|2026-10-05|MLB"])
 precondition(SupabaseAPI.calls[day.id] == nil, "A day never takes the football week read")
 guard let dayHistory = store.snapshot, dayHistory.week == day, !store.loading, !store.failed else { preconditionFailure("The chosen day is the snapshot") }
 precondition(dayHistory.picks.count == 1 && dayHistory.props.count == 1 && dayHistory.slate.isEmpty)
 precondition(dayHistory.games.result(league: "MLB", date: "2026-10-05", gameID: 42, pick: "Away ML") == "won")
 precondition(dayHistory.games.score(league: "MLB", date: "2026-10-05", gameID: 42) == "3-1")
 precondition(!dayHistory.games.isFinal(league: "NFL", date: "2026-10-05", gameID: 42), "Another league's result stays off the day")
 precondition(dayHistory.propGrades.result(league: "MLB", date: "2026-10-05", gameID: 42, player: "Player", market: "hits", side: "over", line: "1.5") == "won")
 precondition(dayHistory.propGrades.result(league: "MLB", date: "2026-10-04", gameID: 42, player: "Player", market: "hits", side: "over", line: "1.5") == nil, "Another day's grade stays off the day")
 var grades = PicksSettledProps()
 grades.record(league: "NFL", date: "2026-09-10", gameID: 42, player: "Player", market: "receiving_yards", side: "over", line: "19.5", outcome: "won")
 func grade(_ league: String = "NFL", _ date: String = "2026-09-10", _ id: Int = 42, _ side: String = "over", _ line: String = "19.5") -> String? {
  grades.result(league: league, date: date, gameID: id, player: "Player", market: "receiving_yards 19.5", side: side, line: line)
 }
 precondition(grade() == "won")
 precondition(grade("NCAAF") == nil && grade("NFL", "2026-09-17") == nil)
 precondition(grade("NFL", "2026-09-10", 99) == nil)
 precondition(grade("NFL", "2026-09-10", 42, "under") == nil)
 precondition(grade("NFL", "2026-09-10", 42, "over", "20.5") == nil)
 print("bounded history and exact prop grades passed")
 exit(0)
}
RunLoop.main.run()
`);
  expect(output).toContain('bounded history and exact prop grades passed');
}, 60_000);
